import logging
import time
import traceback
from typing import TYPE_CHECKING, Tuple

import litellm
from tenacity import RetryError

from theseus_agent.agent import Agent
from theseus_agent.agents.prompts.anthropic_prompts import (
    anthropic_commands_to_command_docs, anthropic_history_to_bash_history,
    conversational_agent_last_user_prompt_template_v3,
    conversational_agent_system_prompt_template_v3)
from theseus_agent.agents.prompts.openai_prompts import (
    openai_commands_to_command_docs,
    openai_conversation_agent_last_user_prompt_template,
    openai_conversation_agent_system_prompt_template)
from theseus_agent.model import AnthropicModel, ModelArguments, OpenAiModel
from theseus_agent.tools import parse_command
from theseus_agent.tools.utils import get_cwd
from theseus_agent.utils.config_utils import make_checkpoint
from theseus_agent.utils.utils import LOGGER_NAME, Hallucination

if TYPE_CHECKING:
    from theseus_agent.session import Session

logger = logging.getLogger(LOGGER_NAME)


def parse_response(response):
    if "<thought>" in response:
        thought = response.split("<thought>")[1].split("</thought>")[0]
        action = response.split("<command>")[1].split("</command>")[0]
        scratchpad = None
        if "<scratchpad>" in response:
            scratchpad = response.split("<scratchpad>")[1].split("</scratchpad>")[0]
    else:
        thought = response.split("<THOUGHT>")[1].split("</THOUGHT>")[0]
        action = response.split("<COMMAND>")[1].split("</COMMAND>")[0]
        scratchpad = None
        if "<SCRATCHPAD>" in response:
            scratchpad = response.split("<SCRATCHPAD>")[1].split("</SCRATCHPAD>")[0]

    return thought, action, scratchpad

class ConversationalAgent(Agent):
    scratchpad: str = None

    default_models = {
        "gpt4-o": OpenAiModel,
        "gpt-4o-mini": OpenAiModel,
        "claude-3-5-sonnet": AnthropicModel,
    }

    default_model_configs = {
        "gpt4-o": {
            "prompt_type": "openai",
        },
        "gpt-4o-mini": {
            "prompt_type": "openai",
        },
        "claude-3-5-sonnet": {
            "prompt_type": "anthropic",
        },
    }

    def reset(self):
        self.agent_config.chat_history = []
        self.interrupt = ""
        self.global_config.state["scratchpad"] = None

    def _initialize_model(self):
        return self.default_models[self.agent_config.model](
            args=ModelArguments(
                model_name=self.agent_config.model,
                temperature=self.agent_config.temperature,
                api_key=self.agent_config.api_key,
            )
        )

    def _format_editor_entry(self, k, v, PAGE_SIZE=50):
        path = k
        page = v["page"]
        content_lines = v["lines"].splitlines()

        all_lines_len = len(content_lines)
        last_idx = all_lines_len // PAGE_SIZE
        if page == last_idx:
            content_len = all_lines_len % PAGE_SIZE
        else:
            content_len = PAGE_SIZE

        start_idx = page * PAGE_SIZE
        lines = content_lines[start_idx : start_idx + content_len]
        window_lines = "\n".join(
            [str(i + start_idx).zfill(4) + line for i, line in enumerate(lines)]
        )

        return f"""
************ FILE: {path}, WINDOW STARTLINE: {start_idx}, WINDOW ENDLINE: {start_idx+content_len}, TOTAL FILE LINES: {all_lines_len} ************
{window_lines}
************************************
"""

    def _convert_editor_to_view(self, editor, PAGE_SIZE=50):
        return "\n".join(
            [self._format_editor_entry(k, v, PAGE_SIZE) for k, v in editor.items()]
        )

    def _prepare_anthropic(self, task, editor, session, scratchpad=None):
        command_docs = (
            "Custom Commands Documentation:\n"
            + anthropic_commands_to_command_docs(
                list(session.generate_command_docs("docstring").values())
            )
            + "\n"
        )

        history = anthropic_history_to_bash_history(self.agent_config.chat_history)
        system_prompt = conversational_agent_system_prompt_template_v3(command_docs)
        last_user_prompt = conversational_agent_last_user_prompt_template_v3(
            history,
            editor,
            get_cwd(
                {
                    "session": session,
                    "environment": session.default_environment,
                    "state": session.config.state,
                }
            ),
            session.config.path,
            scratchpad,
        )

        messages = [{"role": "user", "content": last_user_prompt}]
        return messages, system_prompt

    def _prepare_openai(self, task, editor, session, scratchpad=None):
        # time.sleep(3)

        command_docs = (
            "Custom Commands Documentation:\n"
            + openai_commands_to_command_docs(
                list(session.generate_command_docs("docstring").values())
            )
            + "\n"
        )

        history = [
            entry
            for entry in self.agent_config.chat_history
            if entry["role"] == "user" or entry["role"] == "assistant"
        ]
        system_prompt = openai_conversation_agent_system_prompt_template(command_docs)
        last_user_prompt = openai_conversation_agent_last_user_prompt_template(
            task,
            editor,
            get_cwd(
                {
                    "session": session,
                    "environment": session.default_environment,
                    "state": session.config.state,
                }
            ),
            session.config.path,
            scratchpad
        )

        messages = history + [{"role": "user", "content": last_user_prompt}]
        return messages, system_prompt

    def predict(
        self,
        task: str,
        observation: str,
        session: "Session",
    ) -> Tuple[str, str, str]:
        self.current_model = self._initialize_model()

        if self.interrupt:
            observation = observation + ". also " + "YOU HAVE BEEN **INTERRUPTED**. You got the following message :   " + self.interrupt + "   : **INTERRUPTED**"
            self.interrupt = ""

        try:
            editor = self._convert_editor_to_view(
                session.config.state["editor"]["files"], session.config.state["editor"]["PAGE_SIZE"]
            )

            self.agent_config.chat_history.append(
                {"role": "user", "content": observation, "agent": self.name}
            )

            prompts = {
                "anthropic": self._prepare_anthropic,
                "openai": self._prepare_openai,
                # "llama3": self._prepare_llama3,
                # "ollama": self._prepare_ollama,
            }

            if not self.agent_config.prompt_type:
                self.agent_config.prompt_type = self.default_model_configs[
                    self.agent_config.model
                ]["prompt_type"]


            messages, system_prompt = prompts[self.agent_config.prompt_type](
                task, editor, session, session.config.state["scratchpad"]
            )
            output = None
            while not output:
                try:
                    output = self.current_model.query(messages, system_message=system_prompt)
                except litellm.RateLimitError:
                    session.event_log.append(
                        {
                            "type": "RateLimit",
                            "content": observation,
                            "producer": self.name,
                            "consumer": "none",
                        }
                    )
                    return "error", "error", "error"
                except Exception as e:
                    session.event_log.append(
                        {
                            "type": "Error",
                            "content": str(e),
                            "producer": self.name,
                            "consumer": "none",
                        }
                    )
                    return "error", "error", "error"
                 
            thought = None
            action = None

            try:
                thought, action, scratchpad = parse_response(output)
                toolname, args = parse_command(action)
                if toolname == "ask_user" and len(args) == 2:
                    commit_message = args[1]
                    if session.config.versioning_type == "git":
                        checkpoint = make_checkpoint(commit_message,session.config, session.event_id, session.versioning)
                        session.config.checkpoints.append(checkpoint)
                        session.event_log.append(
                            {
                                "type": "Checkpoint",
                                "content": f"{session.config.checkpoints[-1].checkpoint_id}",
                                "producer": "theseus",
                                "consumer": "user",
                            }
                        )
                if scratchpad:
                    session.config.state["scratchpad"] = scratchpad
            except Exception:
                raise Hallucination(f"Multiple actions found in response or incorrect formatting: {output}")

            if not thought or not action:
                raise Hallucination(
                    "Agent failed to follow response format instructions"
                )

            self.agent_config.chat_history.append(
                {
                    "role": "assistant",
                    "content": output,
                    "thought": thought,
                    "action": action,
                    "agent": self.name,
                }
            )

            logger.info(f"""
\n\n\n\n****************\n\n
NAME: {self.name}                        

THOUGHT: {thought}

ACTION: {action}

OBSERVATION: {observation}

SCRATCHPAD: {scratchpad}

\n\n****************\n\n\n\n""")

            return thought, action, output
        except KeyboardInterrupt:
            raise
        except Hallucination:
            return "hallucination", "hallucination", "Incorrect response format"
        except RuntimeError as e:
            session.event_log.append(
                {
                    "type": "Error",
                    "content": str(e),
                    "producer": self.name,
                    "consumer": "none",
                }
            )
            logger.error(f"Runtime error: {e}")
            return (
                f"Exit due to runtime error: {e}",
                "exit_error",
                f"exit due to runtime error: {e}"
            )
        except RetryError as e:
            session.event_log.append(
                {
                    "type": "Error",
                    "content": str(e),
                    "producer": self.name,
                    "consumer": "none",
                }
            )
            logger.error(f"Retry error: {e}")
            return (
                f"Exit due to retry error: {e}",
                "exit_api",
                f"exit due to retry error: {e}"
            )
        except Exception as e:
            session.event_log.append(
                {
                    "type": "Error",
                    "content": str(e),
                    "producer": self.name,
                    "consumer": "none",
                }
            )
            traceback.print_exc()
            logger.error(f"Exception: {e}")
            return (
                f"Exit due to exception: {e}",
                "exit_error",
                f"exit due to exception: {e}",
            )

from dataclasses import dataclass
from typing import TYPE_CHECKING

from theseus_agent.config import AgentConfig, Config
from theseus_agent.model import (AnthropicModel, GroqModel, OllamaModel,
                               OpenAiModel)

if TYPE_CHECKING:
    from theseus_agent.session import Session


@dataclass(frozen=False)
class Agent:
    name: str
    global_config: Config
    agent_config: AgentConfig
    interrupt: str = ""

    def run(self, session: "Session", observation: str = None): ...


DEFAULT_MODELS = {
    "gpt4-o": OpenAiModel,
    "claude-opus": AnthropicModel,
    "claude-haiku": AnthropicModel,
    "claude-sonnet": AnthropicModel,
    "claude-3-5-sonnet": AnthropicModel,
    "gpt4": OpenAiModel,
    "gpt4-turbo": OpenAiModel,
    "llama-3-70b": GroqModel,
    "ollama/deepseek-coder:6.7b": OllamaModel,
    "gpt-4o-mini": OpenAiModel,
}

import asyncio
import inspect
import json
import logging
import os
import tempfile
import time
import traceback
from typing import Dict, List
import copy

from theseus_agent.agents.conversational_agent import ConversationalAgent
from theseus_agent.config import Checkpoint, Config
from theseus_agent.data_models import _delete_session_util, _save_session_util
from theseus_agent.tool import ToolNotFoundException
from theseus_agent.tools import parse_command
from theseus_agent.tools.codenav import CodeGoTo, CodeSearch
from theseus_agent.tools.editorblock import EditBlockTool
from theseus_agent.tools.editortools import (
    CreateFileTool,
    DeleteFileTool,
    OpenFileTool,
    ScrollDownTool,
    ScrollToLineTool,
    ScrollUpTool,
    save_create_file,
    save_delete_file,
)
from theseus_agent.tools.filesearchtools import FindFileTool, GetCwdTool, SearchDirTool
from theseus_agent.tools.filetools import FileTreeDisplay, SearchFileTool
from theseus_agent.tools.lifecycle import NoOpTool
from theseus_agent.tools.shelltool import ShellTool
from theseus_agent.tools.usertools import AskUserToolWithCommit
from theseus_agent.tools.utils import get_ignored_files, read_file
from theseus_agent.utils.config_utils import get_checkpoint_id
from theseus_agent.utils.telemetry import Posthog, SessionStartEvent
from theseus_agent.utils.utils import Event, WholeFileDiff, WholeFileDiffResults
from theseus_agent.versioning.git_versioning import (
    GitVersioning,
    apply_patch,
    check_for_changes,
    check_if_branch_exists,
    checkout_branch,
    cherry_pick_commit,
    commit_all_files,
    create_and_switch_branch,
    delete_branch,
    find_new_commits,
    get_commits,
    get_current_branch,
    get_diff_patch,
    get_last_commit_hash,
    git_reset_soft,
    intialize_new_repo,
    is_git_repo,
    merge_branch,
)


def waitForEvent(event_log: List[Dict], event_type: str):
    while True:
        if event_log[-1]["type"] == event_type:
            return event_log[-1]
        time.sleep(1)


def git_error(message: str, event_log: List[Dict]):
    print(f"Git Error: {message}")
    event_log.append(
        {
            "type": "GitError",
            "content": message,
            "producer": "system",
            "consumer": "user",
        }
    )
    event = waitForEvent(event_log, "GitResolve")
    if event["content"]["action"] == "nogit":
        return "nogit"
    if event["content"]["action"] == "resolved":
        return "resolvedError"


def git_ask_user_for_action(message: str, event_log: List[Dict], event_type: str,options=["Yes","No"]):
    print(f"Git Ask User For Action: {message}", flush=True)

    event_log.append(
        {
            "type": "GitAskUser",
            "content": {
                "message": message,
                "options": options,
            },
            "producer": "system",
            "consumer": "user",
        }
    )

    while True:
        if event_log[-1]["type"] == event_type:
            return event_log[-1]
        time.sleep(1)


class Session:
    def __init__(self, config: Config, event_log: List[Dict]):
        self.name = config.name
        self.config = config
        self.persist_to_db = config.persist_to_db
        self.logger = logging.getLogger(self.config.logger_name)

        agent_config = self.config.agent_configs[0]

        if agent_config.agent_type == "conversational":
            self.agent = ConversationalAgent(
                name="Conversationaltheseus",
                global_config=self.config,
                agent_config=agent_config,
            )
        else:
            raise ValueError(f"Agent type {agent_config.agent_type} not supported")

        self.environments = config.environments

        self.environments["local"].register_tools(
            {
                "create_file": CreateFileTool().register_post_hook(save_create_file),
                "open_file": OpenFileTool(),
                "scroll_up": ScrollUpTool(),
                "scroll_down": ScrollDownTool(),
                "scroll_to_line": ScrollToLineTool(),
                "search_file": SearchFileTool(),
                "edit": EditBlockTool(),
                "search_dir": SearchDirTool(),
                "find_file": FindFileTool(),
                "get_cwd": GetCwdTool(),
                "no_op": NoOpTool(),
                "delete_file": DeleteFileTool().register_post_hook(save_delete_file),
                "code_search": CodeSearch(),
                "code_goto": CodeGoTo(),
                "file_tree_display": FileTreeDisplay(),
            }
        )
        self.environments["local"].set_default_tool(ShellTool())
        self.environments["local"].event_log = event_log
        self.environments["user"].event_log = event_log

        self.environments["user"].register_tools({"ask_user": AskUserToolWithCommit()})
        if self.config.versioning_type == "git":
            self.versioning = GitVersioning(config.path, config)

        self.telemetry_client = Posthog()

        self.status = "paused"

        self.default_environment = self.environments["local"]

        self.event_log = event_log

    def init_state(self, event_log: List[Dict] = []):
        self.config.state = {}
        self.config.state["PAGE_SIZE"] = 200

        self.config.task = None

        self.status = "paused"

        self.path = self.config.path
        self.event_id = 0

        self.agent.reset()

        self.event_log = event_log
        for env in self.environments.values():
            env.event_log = event_log

        if (
            Event(
                type="Task",
                content="ask user for what to do",
                producer="system",
                consumer="theseus",
            )
            not in self.event_log
        ):
            self.event_log.append(
                Event(
                    type="Task",
                    content="ask user for what to do",
                    producer="system",
                    consumer="theseus",
                )
            )

    def to_dict(self):
        return {
            "config": self.config.model_dump(mode="json", exclude={"logger"}),
            "event_history": self.event_log,
        }

    @classmethod
    def from_config(cls, config: Config, event_log: List[Dict]):
        config = config
        instance = cls(config, event_log)
        instance.event_id = len(event_log)

        instance.event_log.append(
            Event(
                type="ModelRequest",
                content="Your interaction with the user was paused, ask user for further instructions",
                producer="system",
                consumer="theseus",
            )
        )

        return instance

    def get_status(self):
        return self.status

    def pause(self):
        if self.status == "terminating" or self.status == "terminated":
            return
        self.status = "paused"

    def start(self):
        self.status = "running"

    def revert(self, checkpoint_id):
        print(self.config.checkpoints)
        for i, checkpoint in enumerate(self.config.checkpoints):
            if checkpoint.checkpoint_id == checkpoint_id:
                print(checkpoint.commit_hash, flush=True)
                if (
                    self.config.versioning_type == "git"
                    and checkpoint.commit_hash != "no_commit"
                ):
                    result = self.versioning.revert_to_commit(checkpoint.commit_hash.strip())
                    print(result)
                    if result[0] != 0:
                        self.logger.error(f"Failed to revert to commit {checkpoint.commit_hash}: {result[1]}")
                        return
                event_id = checkpoint.event_id
                event_log = self.event_log[: event_id + 1]
                self.event_id = event_id
                self.event_log = event_log
                self.config.state = checkpoint.state
                self.config.agent_configs[0].chat_history = list(
                    checkpoint.agent_history
                )
                self.setup()
                for env in self.environments.values():
                    env.event_log = event_log
                self.start()
                break
        self.config.checkpoints = self.config.checkpoints[: i + 1]

    def terminate(self):
        print(self.status,flush=True)
        if self.status == "terminated":
            return
        self.status = "terminating"

        while self.status != "terminated":
            time.sleep(2)

    def git_setup(self, action):
        self.logger.info(f"Setting up git for action {action}")

        if self.config.versioning_type == "git" and action == "new":
            if not is_git_repo(self.config.path):
                resolved = git_ask_user_for_action(
                    "This directory is not a git repository. Do you want theseus to initialize a git repository?",
                    self.event_log,
                    "GitResolve",
                )
                if resolved["content"]["action"] == "no":
                    self.config.versioning_type = "none"
                    return "disabled"
                if resolved["content"]["action"] == "yes":
                    result = intialize_new_repo(self.config.path)
                    if result[0] != 0:
                        result = git_error(
                            "Was not able to initialize git repository. Error from command: \n "
                            + result[1],
                            self.event_log,
                        )
                        if result == "nogit":
                            self.config.versioning_type = "none"
                            return "disabled"
                        if result == "resolvedError":
                            return "retry"

            self.logger.info(f"User branch state")
            # User Branch Now

            status, user_branch = get_current_branch(self.config.path)
            if status != 0:
                result = git_error(
                    "Was not able to get the current branch. Error from command: \n "
                    + user_branch,
                    self.event_log,
                )
                if result == "nogit":
                    self.config.versioning_type = "none"
                    return "disabled"
                if result == "resolvedError":
                    return "retry"

            if user_branch == "theseus_agent":
                result = git_error(
                    "You are on the theseus Branch. Please switch to your branch.",
                    self.event_log,
                )
                if result == "nogit":
                    self.config.versioning_type = "none"
                    return "disabled"
                if result == "resolvedError":
                    return "retry"

            status, user_branch = get_current_branch(self.config.path)

            if status != 0:
                result = git_error(
                    "Was not able to get the current branch. Error from command: \n "
                    + user_branch,
                    self.event_log,
                )
                if result == "nogit":
                    self.config.versioning_type = "none"
                    return "disabled"
                if result == "resolvedError":
                    return "retry"

            self.config.versioning_metadata["user_branch"] = user_branch

            rc, result = check_for_changes(self.config.path)
            if rc != 0:
                result = git_error(
                    "Was not able to check for changes. Error from command: \n "
                    + result,
                    self.event_log,
                )
                if result == "nogit":
                    self.config.versioning_type = "none"
                    return "disabled"
                if result == "resolvedError":
                    return "retry"

            result_unstaged, result_staged, result_untracked = result

            result = get_last_commit_hash(self.config.path)
            if result[0] != 0:
                result = git_error(
                    "Was not able to get the last commit hash. Error from command: \n "
                    + result[1],
                    self.event_log,
                )
                if result == "nogit":
                    self.config.versioning_type = "none"
                    return "disabled"
                if result == "resolvedError":
                    return "retry"

            last_commit_hash = result[1]

            # if staged changes checkout will fail
            # unstaged changes will be transfered over, let user know
            # untracked files will be transfered over, let user know
            # if there are no changes, do nothing
            self.logger.info(f"agent branch state")
            # asuuming no changes for now
            exists = check_if_branch_exists(self.config.path, "theseus_agent")

            self.logger.info(f"Branch exists: {exists}")

            if exists:
                resolve = git_ask_user_for_action(
                    f"Branch theseus_agent already exists. This branch should be deleted as it is now stale. If you want to keep changes, merge theseus_agent into your branch. Delete it?",
                    self.event_log,
                    "GitResolve",
                    ["Yes","No and continue without git"]
                )
                if resolve["content"]["action"] == "yes":
                    result = delete_branch(self.config.path, "theseus_agent")
                    if result[0] != 0:
                        result = git_error(
                            "Was not able to delete the theseus_agent branch. Error from command: \n "
                            + result[1],
                            self.event_log,
                        )
                        if result == "nogit":
                            self.config.versioning_type = "none"
                            return "disabled"
                        if result == "resolvedError":
                            return "retry"
                else:
                    return "disabled"

            self.logger.info(f"Creating and switching to theseus_agent branch")
            rc, output = create_and_switch_branch(self.config.path, "theseus_agent")
            if rc != 0:
                result = git_error(
                    "Was not able to create the theseus_agent branch. Error from command: \n "
                    + output,
                    self.event_log,
                )
                if result == "nogit":
                    self.config.versioning_type = "none"
                    return "disabled"
                if result == "resolvedError":
                    return "retry"

            # make initial commit
            self.logger.info(f"Making initial commit")
            result = commit_all_files(
                self.config.path, commit_message="Initial commit", allow_empty=True
            )
            if result[0] != 0:
                result = git_error(
                    "Was not able to commit the files. Error from command: \n "
                    + result[1],
                    self.event_log,
                )
                if result == "nogit":
                    self.config.versioning_type = "none"
                    return "disabled"
                if result == "resolvedError":
                    return "retry"

            checkpoint = Checkpoint(
                commit_message="Initial commit",
                commit_hash=result[1].strip(),
                merged_commit=last_commit_hash.strip(),
                agent_history=self.config.agent_configs[0].chat_history,
                event_id=len(self.event_log),
                checkpoint_id=get_checkpoint_id(),
                state=json.loads(json.dumps(self.config.state)),
            )

            self.config.checkpoints.append(checkpoint)

        if self.config.versioning_type == "git" and action == "load":
            if not is_git_repo(self.config.path):
                corrupted = True
                return "corrupted"

            current_branch = get_current_branch(self.config.path)
            if current_branch[0] != 0:
                result = git_error(
                    "Was not able to get the current branch. Error from command: \n "
                    + current_branch[1],
                    self.event_log,
                )
                if result == "nogit":
                    self.config.versioning_type = "none"
                    return "disabled"
                if result == "resolvedError":
                    return "retry"

            user_branch = self.config.versioning_metadata["user_branch"] if self.config.versioning_metadata["user_branch"] else current_branch[1]
            print(self.config.versioning_metadata, current_branch, flush=True)

            agent_branch_exists = check_if_branch_exists(
                self.config.path, "theseus_agent"
            )

            # third branch
            if not agent_branch_exists:
                return "corrupted"

            if current_branch[1] != user_branch and current_branch[1] != "theseus_agent":
                resolve = git_ask_user_for_action(
                    "On an unknown branch, do you want to load the theseus Branch?",
                    self.event_log,
                    "GitResolve",
                )
                if resolve["content"]["action"] == "yes":
                    self.versioning.checkout_branch("theseus_agent")

                else:
                    self.logger.info(f"User said no")
                    return "corrupted"

            # user branch
            if current_branch[1] == user_branch:
                # check for changes

                old_commit = None
                for checkpoint in self.config.checkpoints[::-1]:
                    if checkpoint.merged_commit != None:
                        old_commit = checkpoint.merged_commit
                        break

                if old_commit == None:
                    self.logger.info(f"Old commit is None")
                    return "corrupted"

                rc, new_commit = get_last_commit_hash(self.config.path)
                if rc != 0:
                    result = git_error(
                        "Was not able to get the last commit hash. Error from command: \n "
                        + new_commits,
                        self.event_log,
                    )
                    if result == "nogit":
                        self.config.versioning_type = "none"
                        return "disabled"
                    if result == "resolvedError":
                        return "retry"

                rc, commit_difference = find_new_commits(
                    self.config.path, old_commit, new_commit
                )
                if rc != 0:
                    result = git_error(
                        "Was not able to find the new commits. Error from command: \n "
                        + commit_difference,
                        self.event_log,
                    )
                    if result == "nogit":
                        self.config.versioning_type = "none"
                        return "disabled"
                    if result == "resolvedError":
                        return "retry"

                # uncommited changes
                rc, result = check_for_changes(self.config.path)
                if rc != 0:
                    result = git_error(
                        "Was not able to check for changes. Error from command: \n "
                        + result,
                        self.event_log,
                    )
                    if result == "nogit":
                        self.config.versioning_type = "none"
                        return "disabled"
                    if result == "resolvedError":
                        return "retry"

                result_unstaged, result_staged, result_untracked = result
                # checkout agent branch
                if (
                    commit_difference
                    or result_unstaged
                    or result_staged
                    or result_untracked
                ):
                    # TODO use normal result
                    rc, output = checkout_branch(self.config.path, "theseus_agent")
                    if rc != 0:
                        result = git_error(
                            "Was not able to checkout the theseus_agent branch. Error from command: \n "
                            + output,
                            self.event_log,
                        )
                        if result == "nogit":
                            self.config.versioning_type = "none"
                            return "disabled"
                        if result == "resolvedError":
                            return "retry"

                    # merge changes

                    result = merge_branch(self.config.path, user_branch)
                    if result[0] != 0:
                        self.logger.info(
                            f"Was not able to merge the branch. Error from command: \n "
                            + result[1]
                            + "\n Most likely your branch has diverged from theseus_agent. Creating a new session."
                        )
                        git_ask_user_for_action(
                            "Was not able to merge the branch. Error from command: \n "
                            + result[1]
                            + "\n Most likely your branch has diverged from theseus_agent. Creating a new session.",
                            self.event_log,
                            "GitResolve",
                        )
                        return "corrupted"

            # agent branch

            # verify checkpoint-agent branch consistency
            # if not consistent, corrupted

            # TODO: verify event-log has the same hash

            # get list of commits on branch

            rc, commits = get_commits(self.config.path)
            print(commits, flush=True)
            if rc != 0:
                result = git_error(
                    "Was not able to get the commits. Error from command: \n "
                    + commits,
                    self.event_log,
                )
                if result == "nogit":
                    self.config.versioning_type = "none"
                    return "disabled"
                if result == "resolvedError":
                    return "retry"

            checkpoint_commits = [
                checkpoint.commit_hash for checkpoint in self.config.checkpoints
            ]

            for commit in checkpoint_commits:
                formatted_commits = [commit_[:8] for commit_ in commits]
                if commit[:8] in formatted_commits:
                    self.logger.info(f"Checkpoint commit not in commits")
                    print(formatted_commits)
                    print(commit)
                    return "corrupted"
            print(self.config.checkpoints, flush=True)
            for checkpoint in self.config.checkpoints[::-1]:
                if checkpoint.commit_hash != "no_commit":
                    old_commit = checkpoint.commit_hash.strip()[:7]
                    break
            new_commit = commits[0][:7]
            new_commits = []
            if old_commit != new_commit:
                rc, new_commits = find_new_commits(
                    self.config.path, old_commit, new_commit
                )
                if rc != 0:
                    result = git_error(
                        "Was not able to find the new commits. Error from command: \n "
                        + new_commits,
                        self.event_log,
                    )
                    if result == "nogit":
                        self.config.versioning_type = "none"
                        return "disabled"
                    if result == "resolvedError":
                        return "retry"

            # non commit changes
            rc, result = check_for_changes(self.config.path)
            if rc != 0:
                result = git_error(
                    "Was not able to check for changes. Error from command: \n "
                    + result,
                    self.event_log,
                )
                if result == "nogit":
                    self.config.versioning_type = "none"
                    return "disabled"
                if result == "resolvedError":
                    return "retry"
            result_unstaged, result_staged, result_untracked = result

            # let agent know
            if new_commits or result_unstaged or result_staged or result_untracked:
                self.logger.info(
                    f"User made serveral commits in between. The commits are {new_commits}. The unstaged changes are {result_unstaged}. The staged changes are {result_staged}. The untracked changes are {result_untracked}."
                )
                self.config.agent_configs[0].chat_history.append(
                    {
                        "role": "user",
                        "content": f"User made serveral commits in between. The commits are {new_commits}. The unstaged changes are {result_unstaged}. The staged changes are {result_staged}. The untracked changes are {result_untracked}.",
                    }
                )

            print(self.config.agent_configs[0].chat_history, flush=True)

        if self.config.versioning_type == "git" and action == "teardown":
            
            current_branch = get_current_branch(self.config.path)

            if current_branch[0] != 0:
                return "failed " + current_branch[1]

            if current_branch[1] == self.config.versioning_metadata.get("user_branch", None):
                return "success"
            
            if current_branch[1] == "theseus_agent" and self.config.versioning_metadata.get("user_branch", None):
                rc, output = checkout_branch(self.config.path, self.config.versioning_metadata["user_branch"])
                if rc != 0:
                    return "failed " + output
                

                # first checkpoint
                for checkpoint in self.config.checkpoints[::-1]:
                    if checkpoint.merged_commit != None:
                        first_checkpoint = checkpoint
                        break

                merge_patch = get_diff_patch(self.config.path, 
                                             first_checkpoint.merged_commit.strip(),
                                             first_checkpoint.commit_hash.strip())
                if merge_patch[0] != 0:
                    self.logger.error("Error getting diff patch " + merge_patch[1])
                    if rc != 0:
                        return "failed " + merge_patch[1]

                with tempfile.NamedTemporaryFile(delete=False) as temp_file:
                    temp_file.write(merge_patch[1].encode())
                    temp_file.flush()

                if merge_patch[0] == 0:

                    rc, branch = checkout_branch(
                        self.config.path, self.config.versioning_metadata["user_branch"]
                    )
                    if rc != 0:
                        self.logger.error("Error checking out user branch " + branch)
                        return "failed " + branch

                    rc, out = apply_patch(self.config.path, temp_file.name)

                    if rc != 0:
                        self.logger.error("Error applying patch " + out)
                        return "failed " + out

        if self.config.versioning_type == "git" and action == "reset":
            self.logger.info(f"Resetting session")
            current_branch = get_current_branch(self.config.path)
            if current_branch[0] != 0:
                result = git_error(
                    "Was not able to get the current branch. Error from command: \n "
                    + current_branch[1],
                    self.event_log,
                )
                if result == "nogit":
                    self.config.versioning_type = "none"
                    return "disabled"
                if result == "resolvedError":
                    return "retry"

            if current_branch[1] == "theseus_agent":
                rc, output = checkout_branch(self.config.path, self.config.versioning_metadata["user_branch"])
                if rc != 0:
                    result = git_error(
                        "Was not able to checkout the user branch. Error from command: \n "
                        + output,
                        self.event_log,
                    )
                    if result == "nogit":
                        self.config.versioning_type = "none"
                        return "disabled"
                    if result == "resolvedError":
                        return "retry"


            current_branch = get_current_branch(self.config.path)
            if current_branch[0] != 0:
                result = git_error(
                    "Was not able to get the current branch. Error from command: \n "
                    + current_branch[1],
                    self.event_log,
                )
                if result == "nogit":
                    self.config.versioning_type = "none"
                    return "disabled"
                if result == "resolvedError":
                    return "retry"
                
                
            if current_branch[1] == self.config.versioning_metadata["user_branch"]:
                result = self.git_setup("teardown")
                if result != "success":
                    return result

                
                # check if theseus_branch exists
                exists = check_if_branch_exists(self.config.path, "theseus_agent")
                
                    
                if exists:
                    # delete agent branch
                    rc,output = delete_branch(self.config.path, "theseus_agent")
                    if rc != 0:
                        result = git_error(
                            "Was not able to delete the agent branch. Error from command: \n "
                            + output,
                            self.event_log,
                        )
                        if result == "nogit":
                            self.config.versioning_type = "none"
                            return "disabled"
                        if result == "resolvedError":
                            return "retry"
                self.config.checkpoints = []
                return self.git_setup("new")
        return "success"

    def run_event_loop(self, action, revert=False):

        if self.config.versioning_type == "git" and not revert:
            while True:
                result = self.git_setup(action)
                self.logger.info(f"Git setup result: {result}")
                if result == "success":
                    break
                if result == "retry":
                    continue
                if result == "disabled":
                    break
                if result == "corrupted":
                    self.event_log.append(
                        Event(
                            type="GitCorrupted",
                            content="Session corrupted.",
                            producer="system",
                            consumer="theseus",
                        )
                    )
                    self.status = "terminating"
                    break

        while True and not (self.event_id == len(self.event_log)):
            self.logger.info("EVENT ID: %s, STATUS: %s", self.event_id, self.status)
            if self.status == "terminating":
                break

            if self.status == "paused":
                print("Session paused, waiting for resume")
                time.sleep(2)
                continue

            event = self.event_log[self.event_id]

            if event["type"] == "Stop" and event["content"]["type"] != "submit":
                self.status = "terminated"
                break
            elif event["type"] == "Stop" and event["content"]["type"] == "submit":
                self.config.state["task"] = (
                    "You have completed your task, ask user for revisions or a new one."
                )
                self.event_log.append(
                    Event(
                        type="Task",
                        content="You have completed your task, ask user for revisions or a new one.",
                        producer="system",
                        consumer="theseus",
                    )
                )

            events = self.step_event(event)
            self.event_log.extend(events)
            self.event_id += 1
        self.status = "terminated"

    def step_event(self, event):
        new_events = []
        self.logger.info("event " + str(event))
        match event["type"]:
            case "Error":
                new_events.append(
                    {
                        "type": "Stop",
                        "content": {"type": "error", "message": event["content"]},
                        "producer": event["producer"],
                        "consumer": "user",
                    }
                )

            case "ModelRequest":
                # TODO: Need some quantized timestep for saving persistence that isn't literally every 0.1s
                if self.config.state["editor"] and self.config.state["editor"]["files"]:
                    for file in self.config.state["editor"]["files"]:
                        self.config.state["editor"]["files"][file]["lines"] = read_file(
                            {
                                "environment": self.default_environment,
                                "session": self,
                                "state": self.config.state,
                            },
                            file,
                        )
                thought, action, output = self.agent.predict(
                    self.config.state["task"], event["content"], self
                )
                self.persist()

                if action == "hallucination":
                    new_events.append(
                        {
                            "type": "ModelRequest",
                            "content": output,
                            "producer": self.agent.name,
                            "consumer": event["producer"],
                        }
                    )
                elif action == "error":
                    pass
                else:
                    new_events.append(
                        {
                            "type": "ModelResponse",
                            "content": json.dumps(
                                {"thought": thought, "action": action, "output": output}
                            ),
                            "producer": self.agent.name,
                            "consumer": event["producer"],
                        }
                    )

            case "RateLimit":
                for i in range(60):
                    if self.status == "terminating":
                        break
                    time.sleep(1)
                new_events.append(
                    {
                        "type": "ModelRequest",
                        "content": event["content"],
                        "producer": self.agent.name,
                        "consumer": event["producer"],
                    }
                )

            case "ToolRequest":
                tool_name, args = event["content"]["toolname"], event["content"]["args"]
                raw_command = event["content"]["raw_command"]
                if (
                    tool_name == "submit"
                    or tool_name == "exit"
                    or tool_name == "stop"
                    or tool_name == "exit_error"
                    or tool_name == "exit_api"
                ):
                    new_events.append(
                        {
                            "type": "Stop",
                            "content": {
                                "type": tool_name,
                                "message": " ".join(args),
                            },
                            "producer": event["producer"],
                            "consumer": "user",
                        }
                    )
                try:

                    env = None

                    for _env in list(self.environments.values()):
                        if tool_name in _env.tools:
                            env = _env

                    if not env:
                        raise ToolNotFoundException(tool_name, self.environments)

                    response = env.tools[tool_name](
                        {
                            "environment": env,
                            "config": self.config,
                            "state": self.config.state,
                            "event_log": self.event_log,
                            "raw_command": raw_command,
                        },
                        *args,
                    )

                    new_events.append(
                        {
                            "type": "ToolResponse",
                            "content": response,
                            "producer": tool_name,
                            "consumer": event["producer"],
                        }
                    )

                except ToolNotFoundException as e:
                    if not (
                        self.default_environment
                        and self.default_environment.default_tool
                    ):
                        raise e

                    try:
                        new_events.append(
                            {
                                "type": "ShellRequest",
                                "content": event["content"]["raw_command"],
                                "producer": self.default_environment.name,
                                "consumer": event["producer"],
                            }
                        )

                        response = self.default_environment.default_tool(
                            {
                                "state": self.config.state,
                                "environment": self.default_environment,
                                "session": self,
                                "raw_command": event["content"]["raw_command"],
                            },
                            event["content"]["toolname"],
                            event["content"]["args"],
                        )

                        new_events.append(
                            {
                                "type": "ShellResponse",
                                "content": response,
                                "producer": self.default_environment.name,
                                "consumer": event["producer"],
                            }
                        )

                        new_events.append(
                            {
                                "type": "ToolResponse",
                                "content": response,
                                "producer": self.default_environment.name,
                                "consumer": event["producer"],
                            }
                        )
                    except Exception as e:
                        self.logger.error(traceback.format_exc())
                        self.logger.error(f"Error routing tool call: {e}")
                        new_events.append(
                            {
                                "type": "ToolResponse",
                                "content": f"Error calling command, command failed with: {e.args[0] if len(e.args) > 0 else 'unknown'}",
                                "producer": self.default_environment.name,
                                "consumer": event["producer"],
                            }
                        )
                except Exception as e:
                    self.logger.error(traceback.format_exc())
                    self.logger.error(f"Error routing tool call: {e}")
                    new_events.append(
                        {
                            "type": "ToolResponse",
                            "content": e.args[0],
                            "producer": self.default_environment.name,
                            "consumer": event["producer"],
                        }
                    )

            case "ToolResponse":

                new_events.append(
                    {
                        "type": "ModelRequest",
                        "content": event["content"],
                        "producer": event["producer"],
                        "consumer": event["consumer"],
                    }
                )

            case "ModelResponse":
                content = json.loads(event["content"])["action"]
                try:
                    toolname, args = parse_command(content)
                    new_events.append(
                        {
                            "type": "ToolRequest",
                            "content": {
                                "toolname": toolname,
                                "args": args,
                                "raw_command": content,
                            },
                            "producer": event["producer"],
                            "consumer": event["consumer"],
                        }
                    )
                except ValueError as e:
                    new_events.append(
                        {
                            "type": "ToolResponse",
                            "content": (
                                e.args[0]
                                if len(e.args) > 0
                                else "Failed to parse command please follow the specified format"
                            ),
                            "producer": event["producer"],
                            "consumer": event["consumer"],
                        }
                    )
                except Exception as e:
                    new_events.append(
                        {
                            "type": "Error",
                            "content": str(e),
                            "producer": event["producer"],
                            "consumer": event["consumer"],
                        }
                    )

            case "Interrupt":
                if self.agent.interrupt:
                    self.agent.interrupt += (
                        "You have been interrupted, pay attention to this message "
                        + event["content"]
                    )
                else:
                    self.agent.interrupt = event["content"]

            case "Task":
                task = event["content"]
                self.logger.info(f"Task: {task}")
                if task is None:
                    task = "Task unspecified ask user to specify task"

                new_events.append(
                    {
                        "type": "ModelRequest",
                        "content": "",
                        "producer": event["producer"],
                        "consumer": event["consumer"],
                    }
                )
            case _:
                pass

        return new_events

    def get_available_actions(self) -> list[str]:

        tools = []
        for env in self.environments.values():
            tools.extend(env.tools)

        return tools

    def generate_command_docs(self, format="manpage"):
        """
        Generates a dictionary of function names and their docstrings.
        """
        docs = {}
        for env in self.environments.values():
            for name, tool in env.tools.items():
                signature = inspect.signature(tool.function)
                docs[name] = {
                    "docstring": tool.documentation(format),
                    "signature": str(signature),
                }

        return docs

    def setup(self):
        self.config.state["task"] = self.config.task

        self.status = "paused"

        for name, env in self.environments.items():
            print("Setting up env")
            env.setup()
            print(env.tools)
            for tool in env.tools.values():
                print("Setting up tool")
                tool.setup(
                    {
                        "environment": env,
                        "session": self,
                        "state": self.config.state,
                    }
                )

        if self.config.ignore_files:
            # check if theseusignore exists, use default env
            theseusignore_path = os.path.join(
                self.config.path, self.config.theseus_ignore_file or ".theseusignore"
            )
            _, rc = self.default_environment.execute("test -f " + theseusignore_path)
            if rc == 0:
                self.config.exclude_files.extend(get_ignored_files(theseusignore_path))
        self.telemetry_client.capture(SessionStartEvent(self.config.name))

    def teardown(self):
        for env in self.environments.values():
            env.teardown()
            for tool in env.tools.values():
                tool.setup(
                    {
                        "environment": env,
                        "session": self,
                        "state": self.config.state,
                    }
                )
        self.git_setup("teardown")
        self.logger.info("Teardown complete")
        # if self.config.versioning_type == "git":
            # if self.config.versioning_metadata["old_branch"] != self.versioning.get_branch_name()[1]:
            #     self.versioning.checkout_branch(
            #         self.config.versioning_metadata["old_branch"]
            # # )
            # if "old_branch" in self.config.versioning_metadata:
            #     self.versioning.checkout_branch(
            #         self.config.versioning_metadata["old_branch"]
            #     )
            # print(self.config.versioning_metadata, flush=True)
            # if "user_branch" in self.config.versioning_metadata:
            #     self.versioning.checkout_branch(
            #         self.config.versioning_metadata["user_branch"]
            #     )

    def persist(self):
        if self.config.persist_to_db:
            asyncio.run(_save_session_util(self.config.name, self.to_dict()))

    def delete_from_db(self):
        if self.config.persist_to_db:
            asyncio.run(_delete_session_util(self.config.name))

    def merge(self, commit_message):

        # get current branch
        rc, current_branch = self.versioning.get_branch()
        if rc != 0:
            self.logger.error("Error getting current branch")
            return False,"Error getting current branch"

        if current_branch != "theseus_agent":
            self.logger.error("Not on theseus_agent branch")
            return False,"Not on theseus_agent branch"

        rc, commits = get_commits(self.config.path)
        print(commits)
        if rc != 0:
            self.logger.error("Error getting commits")
            return False,"Error getting commits"
        dest_commit = commits[0][:7]

        # get merge commit
        src_commit = None
        src_checkpoint = None
        for checkpoint in self.config.checkpoints[::-1]:
            if checkpoint.merged_commit:
                src_commit = checkpoint.merged_commit
                src_checkpoint = checkpoint
                break

        if not src_commit:
            self.logger.error("No merge commit found")
            return False,"No merge commit found"

        print("src_commit", src_commit)
        print("dest_commit", dest_commit)
        merge_patch = get_diff_patch(self.config.path, src_commit, dest_commit)
        if merge_patch[0] != 0:
            self.logger.error("Error getting diff patch " + merge_patch[1])
            return False,"Error getting diff patch"
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            temp_file.write(merge_patch[1].encode())
            temp_file.flush()

        if "user_branch" not in self.config.versioning_metadata:
            self.logger.error("User branch not found")
            return False,"User branch not found"

        if merge_patch[0] == 0:
            rc, branch = checkout_branch(
                self.config.path, self.config.versioning_metadata["user_branch"]
            )
            rc, current_branch = self.versioning.get_branch()  
            if rc != 0:
                self.logger.error("Error checking out user branch " + branch)
                return False,"Error checking out user branch"
            # check for changes
            # implement this later
            # if changes found ask user for confirmation and recalcilate diff patch based on latest commit
            # not a good idea to just always take the last commit for patch.
            # there cant be uncommited changes (cus branch stuff!!!!)

            rc, out = apply_patch(self.config.path, temp_file.name)
            if rc != 0:
                checkout_branch(self.config.path, "theseus_agent")
                self.logger.error("Error applying patch " + out)
                return False,"Error applying patch"
            rc, merge_commit = commit_all_files(self.config.path, commit_message)
            if rc != 0:
                checkout_branch(self.config.path, "theseus_agent")
                self.logger.error("Error committing files " + merge_commit)
                return False,"Error committing files"
            checkout_branch(self.config.path, "theseus_agent")
            os.remove(temp_file.name)
            src_checkpoint.merged_commit = merge_commit
            return True, "Merge successful"
        else:
            self.logger.error("Error getting diff patch")
            os.remove(temp_file.name)
            return False,"Error getting diff patch"

    def diff(
        self, src_checkpoint_id: str, dest_checkpoint_id: str
    ) -> WholeFileDiffResults:
        try:
            for checkpoint in self.config.checkpoints:
                if checkpoint.checkpoint_id == src_checkpoint_id:
                    src_commit = checkpoint.commit_hash
                if checkpoint.checkpoint_id == dest_checkpoint_id:
                    dest_commit = checkpoint.commit_hash
            # src_commit = self.config.checkpoints[src_checkpoint_id].commit_hash
            # dest_commit = self.config.checkpoints[dest_checkpoint_id].commit_hash
            diff_list, error = self.versioning.get_diff_list(src_commit, dest_commit)
            return WholeFileDiffResults(
                files=[
                    WholeFileDiff(file_path=file, before=before, after=after)
                    for file, before, after in diff_list
                ]
            )
        except Exception as e:
            self.logger.error(f"Error getting diff: {e}")
            return WholeFileDiffResults(files=[])

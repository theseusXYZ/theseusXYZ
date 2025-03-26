# every tool
# - needs context (env,state)
# - pre and post functions

# tool


"""
Interaction with environment by the agent happens through tools.

A tool will take a context and return a response.

The context is a dict that contains the following keys:
- environment: The environment object that the tool is interacting with.
- session: The session object that the tool is part of.
- state: The state object that the tool is working with.


Sometimes tools form a logical group, such as an file editor or a code search tool. In this case, tool boxes can be used to group tools together.

Often, you want to run operations before and after a tool is called. pre and post functions can be used to achieve this.

Tools are often passed to llms as prompts or function calling. Every tool should supoport generating a prompt in various formats (docstring,markdown,xml,jsonschema,function call, etc.). Util functions will be provided to help with this.
"""

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any, Callable, TypedDict

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from theseus_agent.config import Config
    from theseus_agent.environment import EnvironmentModule
    from theseus_agent.versioning.git_versioning import GitVersioning


class ToolContext(TypedDict):
    state: Any
    environment: "EnvironmentModule"
    config: "Config"
    event_log: list


PreTool = Callable[[ToolContext], None]
PostTool = Callable[[ToolContext, Any], None]


class Tool(BaseModel, ABC):
    pre_funcs: list[PreTool] = Field(default=[])
    post_funcs: list[PostTool] = Field(default=[])

    @property
    @abstractmethod
    def supported_formats(self):
        pass

    @property
    @abstractmethod
    def name(self):
        pass

    @abstractmethod
    def setup(self, context: ToolContext):
        """
        Setup the tool, called when session starts. Could be used to initialize thr state."""
        pass

    @abstractmethod
    def cleanup(self, context: ToolContext):
        """
        Cleanup the tool, called when session ends. Could be used to cleanup state."""
        pass

    @abstractmethod
    def documentation(self, format="docstring"):
        """
        Will be passed as prompt or function call to llm.
        """
        pass

    @abstractmethod
    def function(self, context, **kwargs):
        """
        Excutes the tool and returns the response.
        """
        pass

    def __call__(self, context, *args, **kwargs):
        for func in self.pre_funcs:
            func(context)
        response = self.function(context, *args, **kwargs)
        for func in self.post_funcs:
            func(context, response)
        return response

    def register_pre_hook(self, func: PreTool):
        self.pre_funcs.append(func)
        return self

    def register_post_hook(self, func: PostTool):
        self.post_funcs.append(func)
        return self


class ToolNotFoundException(Exception):
    """Exception raised when a tool is not found in the available environments."""

    def __init__(self, tool_name, environments):
        self.tool_name = tool_name
        self.environments = environments
        message = (
            f"Tool '{tool_name}' not found in environments: {list(environments.keys())}"
        )
        super().__init__(message)

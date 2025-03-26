from abc import ABC
from typing import TYPE_CHECKING, Dict, List, Tuple

from pydantic import BaseModel, Field

from theseus_agent.tool import Tool

if TYPE_CHECKING:
    from theseus_agent.tool import Tool


class EnvironmentModule(BaseModel, ABC):
    default_tool: Tool = Field(default=None)
    tools: Dict[str, Tool] = Field(default_factory=dict)
    event_log: List[Dict] = Field(default_factory=list)
    # state: Dict = Field(default_factory=dict)

    def setup(self, **kwargs): ...

    def teardown(self, **kwargs): ...

    def __enter__(self):
        self.setup()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.teardown(exc_type, exc_value, traceback)

    def execute(self, input: str, timeout_duration=25) -> Tuple[str, int]: ...

    def register_tools(self, tools: Dict[str, "Tool"]):
        if self.tools is None:
            self.tools = {}
        self.tools.update(tools)

    def set_default_tool(self, tool: "Tool"):
        self.default_tool = tool

    """
    in session, if tool in env.tools, then call tool with env in context
    """

    def save(self): ...

    def load(self): ...

from typing import List

from theseus_agent.tool import Tool, ToolContext


class ShellTool(Tool):
    @property
    def name(self):
        return "shell_tool"

    @property
    def supported_formats(self):
        return ["docstring", "manpage"]

    def setup(self, ctx):
        pass

    def cleanup(self, ctx):
        pass

    def documentation(self, format="docstring"):
        match format:
            case "docstring":
                return self.function.__doc__
            case "manpage":
                return """NA/NOT USED"""
            case _:
                raise ValueError(f"Invalid format: {format}")

    def function(self, ctx: ToolContext, fn_name, args: List[str]) -> str:
        """
        Default tool for shell environments to execute in the environment
        """
        output, rc = ctx["environment"].execute(fn_name + " " + " ".join(args))            
        return output

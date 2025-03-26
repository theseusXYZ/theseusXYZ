import os
import pytest
from theseus_agent.config import Config
from theseus_agent.environments.shell_environment import LocalShellEnvironment
from theseus_agent.tools.shelltool import ShellTool
from theseus_agent.tools.editorblock import EditBlockTool
from theseus_agent.tool import ToolContext

@pytest.fixture
def temp_dir_shell_environment(tmp_path):
    env = LocalShellEnvironment(
        path=str(tmp_path),
        tools={"edit": EditBlockTool()},
        default_tool=ShellTool()
    )
    env.setup()
    return env

@pytest.fixture
def test_config(temp_dir_shell_environment):
    config = Config(
        name="test_config",
        environments={"temp_dir_shell_environment": temp_dir_shell_environment},
        logger_name="test_logger",
        default_environment="temp_dir_shell_environment",
        db_path=".temp",
        persist_to_db=True,
        ignore_files=False,
        path=temp_dir_shell_environment.path,
        state={},
        agent_configs=[],
        checkpoints=[],
        theseus_ignore_file=".theseusignore"
    )
    return config

def create_tool_context(config, environment, raw_command):
    context = ToolContext(
        config=config,
        environment=environment,
        raw_command=raw_command
    )
    context["state"] = {
        "editor": {
            "files": {}
        }
    }
    return context

@pytest.mark.flaky(reruns=20)
def test_edit_non_empty_file(temp_dir_shell_environment, test_config):
    env = temp_dir_shell_environment
    edit_tool = env.tools["edit"]
    
    # Create a non-empty file
    file_path = os.path.join(env.path, "test_file.py")
    with open(file_path, "w") as f:
        f.write("def hello():\n    print('Hello, World!')\n\nhello()\n")
    
    context = create_tool_context(
        test_config,
        env,
        f"""
edit
{file_path}
```python
<<<<<<< SEARCH
def hello():
    print('Hello, World!')
=======
def greet(name):
    print(f'Hello, {{name}}!')
>>>>>>> REPLACE
```
"""
    )
    context["state"]["editor"]["files"][file_path] = {"lines": ""}
    
    result = edit_tool.function(context)
    assert "Successfully edited" in result
    
    with open(file_path, "r") as f:
        updated_content = f.read()
    
    assert "def greet(name):" in updated_content
    assert "print(f'Hello, {name}!')" in updated_content

@pytest.mark.flaky(reruns=20)
def test_edit_empty_file(temp_dir_shell_environment, test_config):
    env = temp_dir_shell_environment
    edit_tool = env.tools["edit"]
    
    # Create an empty file
    file_path = os.path.join(env.path, "empty_file.py")
    open(file_path, "w").close()
    
    context = create_tool_context(
        test_config,
        env,
        f"""
edit
{file_path}
```python
<<<<<<< SEARCH
=======
def main():
    print("This file is no longer empty!")

if __name__ == "__main__":
    main()
>>>>>>> REPLACE
```
"""
    )
    context["state"]["editor"]["files"][file_path] = {"lines": ""}
    
    result = edit_tool.function(context)
    assert "Successfully edited" in result
    
    with open(file_path, "r") as f:
        updated_content = f.read()
    
    assert "def main():" in updated_content
    assert 'print("This file is no longer empty!")' in updated_content

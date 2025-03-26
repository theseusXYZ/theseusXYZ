


import os
import pathlib
from typing import List
import pytest
from theseus_agent.config import Config

from theseus_agent.environments.shell_environment import LocalShellEnvironment, TempDirShellEnvironment
from theseus_agent.tools.shelltool import ShellTool

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
    )
    return config



@pytest.fixture
def files_to_copy():
    return [os.path.join(os.path.dirname(__file__), "testfiles")]


@pytest.fixture
def temp_dir_shell_environment(tmp_path: pathlib.Path, files_to_copy: List[str]):
    env = TempDirShellEnvironment(path=tmp_path.as_posix())
    env.setup(files_to_copy)
    # assert os.path.exists(os.path.join(env.path, "testfiles"))
    env = LocalShellEnvironment(
        path=env.path, tools={"shell": ShellTool()}, default_tool=ShellTool()
    )
    return env


@pytest.mark.flaky(reruns=20)
def test_execute(temp_dir_shell_environment):
    
    temp_dir_shell_environment.setup()
    result = temp_dir_shell_environment.execute("sleep 5 && echo 'hello'")
    stdout, rc = result
    assert rc == 0
    assert stdout is not None
    assert stdout != ""

    result = temp_dir_shell_environment.execute("echo 'hello\n'")
    stdout, rc = result
    assert rc == 0
    assert stdout == "hello\n\n"


def test_shared_shell_environment(temp_dir_shell_environment):
    temp_dir_shell_environment.setup()
    stdout, rc = temp_dir_shell_environment.execute("echo $TESTVAR")
    if stdout.strip():
        stdout, rc = temp_dir_shell_environment.execute("unset TESTVAR")
        assert rc == 0
        assert stdout == "\n"
    stdout, rc = temp_dir_shell_environment.execute("echo $TESTVAR")
    assert rc == 0
    assert stdout == "\n"
    stdout, rc = temp_dir_shell_environment.execute("export TESTVAR='test'")
    assert rc == 0
    assert stdout == ""
    stdout, rc = temp_dir_shell_environment.execute("echo $TESTVAR")
    assert rc == 0
    assert stdout == "test\n"

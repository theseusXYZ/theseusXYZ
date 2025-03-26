import pytest
from theseus_agent.environments.job_environment import JobEnvironment

@pytest.fixture
def temp_dir_job_environment(tmp_path):
    with JobEnvironment(path=str(tmp_path)) as job_env:
        yield job_env

def test_execute(temp_dir_job_environment):
    result = temp_dir_job_environment.execute("ls -la")
    stdout, rc = result
    assert rc == 0
    assert stdout is not None
    assert stdout != ""

    result = temp_dir_job_environment.execute("echo 'hello\n'")
    stdout, rc = result
    assert rc == 0
    assert stdout == "hello\n\n"

def test_shared_job_environment(temp_dir_job_environment):
    stdout, rc = temp_dir_job_environment.execute("echo $TESTVAR")
    if stdout.strip():
        stdout, rc = temp_dir_job_environment.execute("unset TESTVAR")
        assert rc == 0
        assert stdout == "\n"
    stdout, rc = temp_dir_job_environment.execute("echo $TESTVAR")
    assert rc == 0
    assert stdout == "\n"
    stdout, rc = temp_dir_job_environment.execute("export TESTVAR='test'")
    assert rc == 0
    assert stdout == ""
    stdout, rc = temp_dir_job_environment.execute("echo $TESTVAR")
    assert rc == 0
    assert stdout == "test\n"

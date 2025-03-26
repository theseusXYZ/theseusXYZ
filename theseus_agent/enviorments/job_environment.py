
import os
import re
import subprocess
import tempfile
import time
import traceback
from typing import Dict, Optional, Tuple
from datetime import datetime

from pydantic import Field, BaseModel
from theseus_agent.environment import EnvironmentModule

class Job(BaseModel):
    named_pipe_stdout: str
    named_pipe_stderr: str
    command: str
    status: str
    start_time: datetime
    pid: Optional[int] = None
    end_time: Optional[datetime] = None
    exit_code: Optional[int] = None
    stdout: str = ""
    stderr: str = ""

class JobEnvironment(EnvironmentModule):
    path: str = Field(...)
    jobs: Dict[str, Job] = Field(default_factory=dict)
    old_dir: str = Field(default=None)
    process: subprocess.Popen = Field(default=None)

    class Config:
        arbitrary_types_allowed = True

    @property
    def name(self):
        return "job"

    def setup(self, **kwargs):
        try:
            self.old_dir = os.getcwd()
            os.chdir(self.path)
        except Exception as e:
            print("Error changing directory", e)

        self.process = subprocess.Popen(
            ["/bin/bash"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

    def teardown(self, **kwargs):
        os.chdir(self.old_dir)
        self.process.terminate()
        for job in self.jobs.values():
            os.unlink(job.named_pipe_stdout)
            os.unlink(job.named_pipe_stderr)

    def get_cwd(self):
        return self.execute("pwd")[0].strip()

    def execute(self, input: str, timeout_duration=15):
        try:
            stdout_pipe_path = tempfile.mkstemp()[1]
            stderr_pipe_path = tempfile.mkstemp()[1]

            job = Job(
                named_pipe_stdout=stdout_pipe_path,
                named_pipe_stderr=stderr_pipe_path,
                command=input,
                status="running",
                start_time=datetime.now(),
            )
            self.jobs[input + str(time.time())] = job

            self.process.stdin.write(f"({input}; echo 'EXIT_CODE: '$? >&2; echo 'PID: '$! >&2; echo 'EOL' >&1; echo 'EOL' >&2) 1> {stdout_pipe_path} 2> {stderr_pipe_path} &\n")
            self.process.stdin.flush()

            for _ in range(int(timeout_duration / 0.1)):
                stdout, stderr, exit_code, pid = self.read_background_output(job)
                print("stdout end", stdout , job.stdout)
                print("stderr end", stderr)
                print("exit_code end", exit_code)
                print("pid", pid)
                job.stdout += stdout
                job.stderr += stderr
                if exit_code is not None:
                    job.exit_code = exit_code
                    job.pid = pid
                    job.status = "finished"
                    job.end_time = datetime.now()
                    break
                time.sleep(0.1)

            if job.status == "finished":
                return (job.stdout, job.exit_code) if job.exit_code == 0 else (job.stderr, job.exit_code)
            else:
                return job

        except Exception as e:
            traceback.print_exc()
            raise e

    def read_background_output(self, job: Job) -> Tuple[str, str, Optional[int], Optional[int]]:
        stdout = ""
        stderr = ""
        exit_code = None
        pid = None

        stdout_fd = os.open(job.named_pipe_stdout, os.O_RDONLY | os.O_NONBLOCK)
        stderr_fd = os.open(job.named_pipe_stderr, os.O_RDONLY | os.O_NONBLOCK)

        returned = False
        no_data = False
        while True:
            try:
                stdout_data = os.read(stdout_fd, 1024).decode()
                print("stdout_data", stdout_data)
                if not stdout_data:
                    no_data = True
                stdout += stdout_data
            except BlockingIOError:
                break

            try:
                stderr_data = os.read(stderr_fd, 1024).decode()
                if not stderr_data and no_data:
                    break
                elif no_data:
                    no_data = False

                stderr += stderr_data
                if 'EXIT_CODE: ' in stderr_data:
                    exit_code_match = re.search(r'EXIT_CODE: (\d+)', stderr_data)
                    if exit_code_match:
                        exit_code = int(exit_code_match.group(1))
                if 'PID: ' in stderr_data:
                    pid_match = re.search(r'PID: (\d+)', stderr_data)
                    if pid_match:
                        pid = int(pid_match.group(1))
            except BlockingIOError:
                break

            if 'EOL\n' in stdout and 'EOL\n' in stderr:
                returned = True
                break

            time.sleep(0.1)

        os.close(stdout_fd)
        os.close(stderr_fd)

        stdout = stdout.split('EOL\n')[0]
        print("stdout", stdout)
        stderr = stderr.split('EOL\n')[0]
        print("stderr", stderr)

        if returned:
            job.status = "returned"
            job.end_time = datetime.now()
            # job.stdout += stdout
            # job.stderr += stderr
            # job.exit_code = exit_code
            # job.pid = pid

        return stdout, stderr, exit_code, pid

    def __enter__(self):
        self.setup()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.teardown()

    def save(self):
        return {
            "type": "JobEnvironment",
            "path": self.path,
            "cwd": self.get_cwd(),
            "old_dir": self.old_dir,
            "jobs": {k: v.__dict__ for k, v in self.jobs.items()},
        }

    def load(self, data):
        self.path = data["path"]
        self.old_dir = data["old_dir"]
        self.jobs = {k: Job(**v) for k, v in data["jobs"].items()}
        if not self.process:
            self.setup()
        else:
            os.chdir(data["cwd"])

    @classmethod
    def from_data(cls, data):
        env = cls(path=data["path"])
        env.load(data)
        return env

        return stdout, stderr, exit_code, pid

    def write_to_stdin(self, job: Job, data: str):
        with open(job.named_pipe_stdin, "w") as stdin_pipe:
            stdin_pipe.write(data)

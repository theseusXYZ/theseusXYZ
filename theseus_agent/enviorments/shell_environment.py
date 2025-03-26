import errno
import os
import select
import shutil
import subprocess
import tempfile
import time
import traceback
from typing import TYPE_CHECKING, List
import psutil

from pydantic import Field

from theseus_agent.environment import EnvironmentModule

if TYPE_CHECKING:
    pass
def read_with_timeout(container, pid_func, timeout_duration, chunk_size=4096):
    """
    Read data from a subprocess with a timeout, yielding chunks of data.

    Args:
        container (subprocess.Popen): The subprocess container.
        pid_func (function): A function that returns a list of process IDs (except the PID of the main process).
        timeout_duration (int): The timeout duration in seconds.
        chunk_size (int): The size of chunks to read at a time.

    Yields:
        tuple: A tuple containing (stream_name, data_chunk)

    Raises:
        TimeoutError: If the timeout duration is reached while reading from the subprocess.
    """
    stdout_fd = container.stdout.fileno()
    stderr_fd = container.stderr.fileno()
    end_time = time.time() + timeout_duration

    while time.time() < end_time:
        pids = pid_func()
        if not pids:
            # No more child processes running
            ready_to_read, _, _ = select.select([stdout_fd, stderr_fd], [], [], 0)
            if not ready_to_read:
                # No more data to read
                break

        ready_to_read, _, _ = select.select([stdout_fd, stderr_fd], [], [], 0.2)
        
        for fd in ready_to_read:
            if fd == stdout_fd:
                data = os.read(stdout_fd, chunk_size)
                if data:
                    yield ('stdout', data)
            elif fd == stderr_fd:
                data = os.read(stderr_fd, chunk_size)
                if data:
                    yield ('stderr', data)

        if not ready_to_read and not pids:
            # No more data to read and no child processes
            break

        time.sleep(0.05)  # Prevents CPU hogging

    if container.poll() is not None:
        raise RuntimeError("Subprocess exited unexpectedly.")
    
    if time.time() >= end_time:
        raise TimeoutError("Timeout reached while reading from subprocess.")


class LocalShellEnvironment(EnvironmentModule):
    path: str
    old_dir: str = Field(default=None)
    process: subprocess.Popen = Field(default=None)

    class Config:
        arbitrary_types_allowed = True

    @property
    def name(self):
        return "local"

    def setup(self, **kwargs):
        try:
            self.old_dir = os.getcwd()
            os.chdir(self.path)
        except Exception as e:
            print("Error changing directory", e)


        self.process = subprocess.Popen(
            ["/bin/bash","-l"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            # shell=True,
            text=True,
            bufsize=1,
        )


    def teardown(self, **kwargs):
        os.chdir(self.old_dir)

    def get_cwd(self):
        return self.execute("pwd")[0]

    def execute(self, input: str, timeout_duration=25):
        try:
            self.event_log.append({
                "type": "EnvironmentRequest",
                "content": input,
                "producer": "tool",
                "consumer": self.name,
            })
            cmd = input if input.endswith("\n") else input + "\n"
            self.process.stdin.write(cmd)
            time.sleep(0.1)
            self.process.stdin.flush()

            stdout_buffer = b""
            stderr_buffer = b""
            for stream, chunk in read_with_timeout(self.process, lambda: self.get_child_pids(self.process.pid), timeout_duration, 4096):
                if stream == 'stdout':
                    print(chunk.decode(), end='', flush=True)
                    stdout_buffer += chunk
                elif stream == 'stderr':
                    print(chunk.decode(), end='', flush=True)
                    stderr_buffer += chunk

            self.process.stdin.write("echo $?\n")
            time.sleep(0.1)
            self.process.stdin.flush()
            
            exit_code = b""
            for stream, chunk in read_with_timeout(self.process, lambda: self.get_child_pids(self.process.pid), 5, 4096):
                if stream == 'stdout':
                    exit_code += chunk

            return stdout_buffer.decode() + stderr_buffer.decode(), int(exit_code.strip())
        except Exception as e:
            traceback.print_exc()
            return str(e), -1
        
    def get_child_pids(self, parent_pid):
        try:
            parent = psutil.Process(parent_pid)
        except psutil.NoSuchProcess:
            return []
        
        children = parent.children(recursive=True)
        return [child.pid for child in children]


    def __enter__(self):
        self.setup()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.teardown(exc_type, exc_value, traceback)

    def save(self):
        return {
            "type": "LocalShellEnvironment",
            "path": self.path,
            "cwd": self.get_cwd(),
            "old_dir": self.old_dir,
            # "state": self.state,
        }

    def load(self, data):
        self.path = data["path"]
        # self.state = data["state"]
        self.old_dir = data["old_dir"]
        if not self.process:
            pass
        else:
            os.chdir(data["cwd"])

    @classmethod
    def from_data(cls, data):
        env = cls(**data)
        env.load(data)
        return env

def copyanything(src, dst):
    try:
        shutil.copytree(src, dst, dirs_exist_ok=True)
    except OSError as exc: # python >2.5
        if exc.errno in (errno.ENOTDIR, errno.EINVAL):
            shutil.copy(src, dst)
        else: raise

class TempDirShellEnvironment(LocalShellEnvironment):
    path: str = Field(default_factory=lambda: tempfile.TemporaryDirectory().name)

    def setup(self, files_to_cp: List[str], **kwargs):
        for src in files_to_cp:
            print(src)
            dest = copyanything(src, self.path)
            print(dest)
        super().setup(**kwargs)

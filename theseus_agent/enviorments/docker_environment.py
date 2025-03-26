import datetime
import hashlib
import logging
import os
import time
import traceback
from dataclasses import dataclass
from typing import Optional

import docker

from theseus_agent.environment import EnvironmentModule
from theseus_agent.environments.swebenchenv import (get_container,
                                                  read_with_timeout)


@dataclass(frozen=False)
class DockerEnvironment(EnvironmentModule):
    logger: logging.Logger
    image_name: str
    timeout: int
    container_name: Optional[str] = None
    persistent: bool = False

    def setup(self, **kwargs):
        if hasattr(self, "container"):
            try:
                self.container.terminate()
            except KeyboardInterrupt:
                raise
            except Exception:
                pass

        if self.container_name is None:
            process_id = str(os.getpid())
            current_time = str(datetime.datetime.now())
            unique_string = current_time + process_id
            hash_object = hashlib.sha256(unique_string.encode())
            self.container_name = f"{self.image_name}-{hash_object.hexdigest()[:10]}"

        # this is what creates the actual container
        self.container, self.parent_pids = get_container(
            self.container_name, self.image_name, persistent=self.persistent
        )

        try:
            client = docker.from_env()
        except docker.errors.DockerException as e:
            if "Error while fetching server API version" in str(e):
                raise RuntimeError(
                    "Docker is not runninsg. Please start Docker and try again."
                ) from e
            raise e
        # ... why does this need to exist. the container already exists above...
        self.container_obj = client.containers.get(self.container_name)

    # They use commands because python tools wouldn't work without some sort of tool proxy
    def _communicate(
        self,
        input: str,
        timeout_duration=25,
    ) -> str:
        # Add \n, stdin write, flush => execute commant
        try:
            self.returncode = None
            cmd = input if input.endswith("\n") else input + "\n"
            self.container.stdin.write(cmd)
            time.sleep(0.1)
            self.container.stdin.flush()
        except BrokenPipeError:
            traceback.print_exc()
            self.logger.error(
                "Failed to communicate with container. Check docker logs for more information."
            )
            raise RuntimeError("Failed to communicate with container")

        # echo back last command
        try:
            buffer = read_with_timeout(self.container, self.get_pids, timeout_duration)
            self.container.stdin.write("echo $?\n")
            time.sleep(0.1)
            self.container.stdin.flush()
            exit_code = read_with_timeout(self.container, self.get_pids, 5).strip()
        except Exception as e:
            self.logger.error(f"Read with timeout failed on input:\n---\n{input}\n---")
            raise e

        # exit code bad => report bad
        if not exit_code.isdigit():
            raise RuntimeError(
                f"Container crashed. Failed to get exit code. Output:\n---\n{buffer}\n---"
            )

        self.returncode = int(exit_code)
        return buffer

    # Send shell commands in a format the container understands
    # Sends to stdin, and then gets the last stdout response (really should be that + stderr)
    def communicate(
        self,
        input: str,
        timeout_duration=25,
    ) -> str:
        """
        Sends input to container and returns output

        Args:
            input (`str`) - input to send to container shell

        Returns:
            output (`str`) - output from container
        """
        if input.strip() != "exit":
            output, valid = self._check_syntax(input)
            if not valid:
                return output  # shows syntax errors
            output = self._communicate(
                input,
                timeout_duration=timeout_duration,
            )
            self.communicate_output = output
            return output
        else:
            self.container.terminate()
            self.returncode = 0
            self.communicate_output = ""
            return ""

    def execute(self, input: str, timeout_duration=25):
        return self.communicate(input, timeout_duration=timeout_duration)

    def teardown(self, **kwargs):
        """
        Handle environment shutdown
        """
        self.logger.info("Beginning environment shutdown...")
        try:
            self.communicate(input="exit")
        except KeyboardInterrupt:
            raise
        except Exception:
            pass
        self.container.terminate()
        if self.persistent:
            if self.container_obj.status not in {"paused", "exited"}:
                self.container_obj.pause()
                self.logger.info("Agent container paused")
            else:
                self.logger.info(f"Agent container status: {self.container_obj.status}")
        else:
            try:
                self.container_obj.remove(force=True)
            except KeyboardInterrupt:
                raise
            except Exception:
                pass
            self.logger.info("Agent container stopped")

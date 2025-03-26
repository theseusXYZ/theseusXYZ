import os
import pathlib
from typing import List

import pytest

from theseus_agent.config import Config
from theseus_agent.environments.shell_environment import (
    LocalShellEnvironment, TempDirShellEnvironment)
from theseus_agent.tools.shelltool import ShellTool

import logging
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, computed_field, field_serializer

from theseus_agent.environment import EnvironmentModule


class AgentConfig(BaseModel):
    model: str
    agent_name: str
    agent_type: str
    api_base: Optional[str] = None
    prompt_type: Optional[str] = None
    api_key: Optional[str] = None
    temperature: float = 0.0
    chat_history: List[dict] = []

class Checkpoint(BaseModel):
    commit_hash: str
    commit_message: str
    agent_history: List[dict]
    event_id: int
    checkpoint_id: str
    state: Any
    merged_commit: Optional[str] = None
    author: Optional[Literal["user", "agent"]] = None
    src_branch: Optional[str] = None


class Config(BaseModel):
    name: str
    logger_name: str
    path: str
    environments: Dict[str, EnvironmentModule]
    default_environment: str
    name: str
    db_path: str
    state: Any

    agent_configs: List[AgentConfig]
    task: Optional[str] = None
    versioning_type: Optional[Literal["git", "fossil","none"]] = None
    versioning_metadata: Optional[Dict] = Field(default_factory=dict)

    checkpoints: List[Checkpoint]

    persist_to_db: bool = True
    ignore_files: Optional[bool]
    exclude_files: Optional[List[str]] = Field(default_factory=list)
    theseus_ignore_file: Optional[str]

    class Config:
        arbitrary_types_allowed = True

    @field_serializer("environments")
    def serialize_environments(self, v):
        return {k: e.save() for k, e in v.items()}

    @computed_field
    @property
    def logger(self) -> logging.Logger:
        return logging.getLogger(self.logger_name)

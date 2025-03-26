import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from time import sleep
from typing import Any, Dict, List, Optional

import fastapi
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from theseus_agent.config import AgentConfig, Config
from theseus_agent.data_models import SingletonEngine, init_db, load_data, set_db_engine
from theseus_agent.environments.shell_environment import LocalShellEnvironment
from theseus_agent.environments.user_environment import UserEnvironment
from theseus_agent.session import Session
from theseus_agent.utils.config_utils import hydrate_config
from theseus_agent.utils.utils import LOGGER_NAME, WholeFileDiffResults

# from theseus_agent.semantic_search.code_graph_manager import CodeGraphManager


class EndpointFilter(logging.Filter):
    def __init__(
        self,
        path: str,
        *args: Any,
        **kwargs: Any,
    ):
        super().__init__(*args, **kwargs)
        self._path = path

    def filter(self, record: logging.LogRecord) -> bool:
        return record.getMessage().find(self._path) == -1


uvicorn_logger = logging.getLogger("uvicorn.access")
uvicorn_logger.addFilter(EndpointFilter(path=f"/start"))
uvicorn_logger.addFilter(EndpointFilter(path=f"/update"))
uvicorn_logger.addFilter(EndpointFilter(path=f"/config"))


origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

sessions: Dict[str, Session] = {}
running_sessions: List[Session] = []


blocked_sessions = []


def get_user_input(session: str):
    if session not in session_buffers:
        while True:
            if session not in session_buffers:
                if session not in blocked_sessions:
                    blocked_sessions.append(session)
                sleep(0.1)
                continue
            else:
                blocked_sessions.remove(session)
                break

        result = session_buffers[session]
        del session_buffers[session]
        return result
    else:
        result = session_buffers[session]
        del session_buffers[session]
        return result


@asynccontextmanager
async def lifespan(app: fastapi.FastAPI):
    # Hacky but it works
    global sessions
    if app.persist:
        print(app.db_path)
        if app.db_path:
            db_path = Path(app.db_path) / "theseus_environment.db"
            set_db_engine(db_path.as_posix())
        else:
            app.db_path = "."
            set_db_engine("./theseus_environment.db")
        await init_db()

        AsyncSessionLocal = sessionmaker(
            bind=SingletonEngine.get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
        async with AsyncSessionLocal() as db_session:
            app.db_session = db_session
            data = await load_data(db_session)
            try:
                data = {
                    k: Session.from_config(
                        hydrate_config(v["config"], lambda: get_user_input(k)),
                        v["event_history"],
                    )
                    for (k, v) in data.items()
                }
            except Exception as e:
                print(e)
                data = {}
            # Remove None values from data
            data = {k: v for k, v in data.items() if v is not None}
            sessions = data

    yield
    print("Terminating sessions")
    for session in sessions.values():
        session.teardown()


app = fastapi.FastAPI(
    lifespan=lifespan,
)

app.persist = True
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

session_buffers: Dict[str, str] = {}


@app.get("/")
def read_root():
    return {"content": "Hello from theseus!"}


# @app.get("/indexes")
# def get_indexes():
#     client = chromadb.PersistentClient(path=os.path.join(app.db_path, "vectorDB"))

#     # Get completed indexes from ChromaDB
#     completed_indexes = [
#         decode_path(collection.name)
#         for collection in client.list_collections()
#     ]

#     # Decode the keys from index_tasks
#     in_progress_indexes = [unquote(key).replace("%2F", "/") for key in index_tasks.keys()]

#     # Combine completed indexes with in-progress indexes
#     all_indexes = set(completed_indexes + in_progress_indexes)

#     # Create a list of dictionaries with index information
#     index_info = []
#     for index in all_indexes:
#         # For in-progress tasks, we need to re-encode the path to check in index_tasks
#         encoded_index = index.replace("/", "%2F")
#         status = index_tasks.get(encoded_index, "done")  # If not in index_tasks, it's completed
#         index_info.append({
#             "path": index,
#             "status": status
#         })

#     return index_info

# index_tasks = {}

# @app.post("/indexes/{index}")
# def create_index(index: str,background_tasks: fastapi.BackgroundTasks):

#     def register_task(task,**kwargs):
#         index_tasks[index] = "running"
#         task(**kwargs)
#         print("task complete")
#         index_tasks[index] = "done"

#     vectorDB_path = os.path.join(app.db_path, "vectorDB")
#     graph_path = os.path.join(app.db_path, "graph/graph.pickle")
#     collection_name = encode_path(index.replace("%2F", "/"))
#     print(collection_name)
#     manager = CodeGraphManager(graph_path, vectorDB_path, collection_name,os.environ.get("OPENAI_API_KEY"),index.replace("%2F", "/"))
#     background_tasks.add_task(register_task,manager.create_graph)

# @app.get("/indexes/{index}/status")
# def get_index_status(index: str,background_tasks: fastapi.BackgroundTasks):
#     print(index_tasks,index, index in index_tasks, list(index_tasks.keys())[0])
#     if index not in index_tasks:
#         print("pending")
#         return "pending"
#     else:
#         print(index_tasks[index])
#         return index_tasks[index]


# @app.delete("/indexes/{index}")
# def delete_index(index: str):
#     vectorDB_path = os.path.join(app.db_path, "vectorDB")
#     graph_path = os.path.join(app.db_path, "graph/graph.pickle")
#     collection_name = encode_path(index.replace("%2F", "/"))
#     manager = CodeGraphManager(graph_path, vectorDB_path, collection_name,os.environ.get("OPENAI_API_KEY"),index.replace("%2F", "/"))
#     try:
#         manager.delete_collection(collection_name)
#     except Exception as e:
#         print(e)
#         return "error"
#     return "done"


@app.get("/sessions")
def get_sessions():
    # TODO: figure out the right information to send
    print(sessions.keys())
    return [
        {"name": session_name, "path": session_data.config.path}
        for session_name, session_data in sessions.items()
    ]


@app.delete("/sessions")
def delete_sessions():
    print("deleting sessions")
    global sessions
    for session in sessions.values():
        session.terminate()
        session.teardown()
    sessions = {}
    return "done"


@app.post("/sessions/{session}")
def create_session(
    session: str,
    path: str,
    config: Dict[str, Any],
    background_tasks: fastapi.BackgroundTasks,
):
    if not os.path.exists(path):
        raise fastapi.HTTPException(status_code=404, detail="Path not found")

    if session in sessions:
        raise fastapi.HTTPException(
            status_code=400, detail=f"Session with id {session} already exists"
        )

    local_environment = LocalShellEnvironment(path=path)
    print(local_environment.tools)

    user_environment = UserEnvironment(user_func=lambda: get_user_input(session))

    db_path = app.db_path if hasattr(app, "db_path") else "."

    sessions[session] = Session(
        config=Config(
            name=session,
            path=path,
            logger_name=LOGGER_NAME,
            db_path=db_path,
            persist_to_db=app.persist,
            versioning_type=(
                config["versioning_type"] if "versioning_type" in config else "none"
            ),
            environments={"local": local_environment, "user": user_environment},
            default_environment="local",
            checkpoints=[],
            state={},
            agent_configs=[
                AgentConfig(
                    agent_name="theseus",
                    temperature=0.0,
                    model=config["model"],
                    agent_type="conversational",
                )
            ],
            ignore_files=True,
            theseus_ignore_file=".theseusignore",
        ),
        event_log=[],
    )

    sessions[session].init_state()
    sessions[session].setup()
    background_tasks.add_task(sessions[session].run_event_loop,action="new")
    running_sessions.append(session)

    return session


class UpdateConfig(BaseModel):
    model: str
    api_key: str


@app.patch("/sessions/{session}/update")
def update_session(session: str, update_config: UpdateConfig):
    if session not in sessions:
        raise fastapi.HTTPException(status_code=404, detail="Session not found")
    sessions[session].config.agent_configs[0].model = update_config.model
    sessions[session].config.agent_configs[0].api_key = update_config.api_key
    return sessions[session]


@app.delete("/sessions/{session}")
def delete_session(session: str):
    if session not in sessions:
        raise fastapi.HTTPException(status_code=404, detail="Session not found")

    sessions[session].delete_from_db()




    if session in running_sessions:
        if session in blocked_sessions:
            session_buffers[session] = "delete"
        sessions[session].terminate()
        running_sessions.remove(session)

    del sessions[session]

    return session


@app.patch("/sessions/{session}/start")
def start_session(
    session: str,
    background_tasks: fastapi.BackgroundTasks,
    api_key: Optional[str] = None,
):
    if session not in sessions:
        raise fastapi.HTTPException(status_code=404, detail="Session not found")

    session_obj = sessions.get(session)
    session_obj.config.agent_configs[0].api_key = api_key
    if session not in running_sessions:
        session_obj.setup()
        background_tasks.add_task(sessions[session].run_event_loop,action="load")
        running_sessions.append(session)

    if not session_obj:
        raise fastapi.HTTPException(status_code=404, detail="Session not found")

    session_obj.start()

    return session


@app.patch("/sessions/{session}/resume")
def resume_session(session: str):
    if session not in sessions:
        raise fastapi.HTTPException(status_code=404, detail="Session not found")
    sessions[session].start()
    return session


@app.patch("/sessions/{session}/revert")
def revert_session(
    session: str, checkpoint_id: str, background_tasks: fastapi.BackgroundTasks
):
    if session not in sessions:
        raise fastapi.HTTPException(status_code=404, detail="Session not found")
    if session in blocked_sessions:
        session_buffers[session] = "revert"

    sessions[session].terminate()
    sessions[session].revert(checkpoint_id)
    sessions[session].pause()
    background_tasks.add_task(sessions[session].run_event_loop, revert=True,action="revert")
    return session


@app.patch("/sessions/{session}/pause")
def pause_session(session: str):
    if session not in sessions:
        raise fastapi.HTTPException(status_code=404, detail="Session not found")

    session_obj = sessions.get(session)
    if not session_obj:
        raise fastapi.HTTPException(status_code=404, detail="Session not found")
    session_obj.pause()

    return session


@app.patch("/sessions/{session}/terminate")
def terminate(session: str):
    if session not in sessions:
        raise fastapi.HTTPException(status_code=404, detail="Session not found")

    session_obj = sessions.get(session)
    if not session_obj:
        raise fastapi.HTTPException(status_code=404, detail="Session not found")
    session_obj.terminate()

    return session


@app.patch("/sessions/{session}/reset")
def reset_session(session: str, background_tasks: fastapi.BackgroundTasks):
    print("resetting session1",flush=True)
    if session not in sessions:
        raise fastapi.HTTPException(status_code=404, detail="Session not found")

    if not (session_obj := sessions.get(session)):
        raise fastapi.HTTPException(status_code=404, detail="Session not found")
    print("resetting session2",flush=True)
    session_buffers[session] = "terminate"
    print("resetting session3",flush=True)
    session_obj.terminate()
    print("resetting session4",flush=True)
    session_obj.init_state([])
    print("resetting session5",flush=True)
    session_obj.setup()
    print("resetting session6",flush=True)
    if session in session_buffers:
        del session_buffers[session]
    print("resetting session7",flush=True)
    background_tasks.add_task(session_obj.run_event_loop,action="reset")
    print("resetting session8",flush=True)

    return session


@app.get("/sessions/{session}/status")
def get_session_status(session: str):
    if session not in sessions:
        raise fastapi.HTTPException(status_code=404, detail="Session not found")
    session_obj = sessions.get(session)
    if not session_obj:
        raise fastapi.HTTPException(status_code=404, detail="Session not found")
    return session_obj.status


@app.get("/sessions/{session}/config")
def get_session_config(session: str):
    if session not in sessions:
        raise fastapi.HTTPException(status_code=404, detail="Session not found")

    session_obj = sessions.get(session)
    if not session_obj:
        raise fastapi.HTTPException(status_code=404, detail="Session not found")
    config = {
        "model": session_obj.config.agent_configs[0].model,
        "versioning_type": session_obj.config.versioning_type,
        "checkpoints": session_obj.config.checkpoints,
        "versioning_metadata": session_obj.config.versioning_metadata,
        "state": session_obj.config.state,
        "path": session_obj.config.path,
    }
    return config


@app.get("/sessions/{session}/teardown")
def teardown_session(session: str):
    if session not in sessions:
        raise fastapi.HTTPException(status_code=404, detail="Session not found")
    session_obj = sessions.get(session)
    if not session_obj:
        raise fastapi.HTTPException(status_code=404, detail="Session not found")
    session_obj.teardown()
    return session


@app.post("/sessions/{session}/response")
def create_response(session: str, response: str):
    if session not in sessions:
        raise fastapi.HTTPException(status_code=404, detail="Session not found")
    session_buffers[session] = response
    return session_buffers[session]


@app.get("/sessions/{session}/diff")
def get_checkpoint_diff(
    session: str, src_checkpoint_id: str, dest_checkpoint_id: str
) -> WholeFileDiffResults:
    if session not in sessions:
        raise fastapi.HTTPException(status_code=404, detail="Session not found")
    return sessions[session].diff(src_checkpoint_id, dest_checkpoint_id)


# Event State code
class ServerEvent(BaseModel):
    type: str  # types: ModelResponse, ToolResponse, UserRequest, Interrupt, Stop
    content: Any
    producer: str | None
    consumer: str | None


@app.post("/sessions/{session}/event")
def create_event(session: str, event: ServerEvent):
    if session not in sessions:
        raise fastapi.HTTPException(status_code=404, detail="Session not found")
    print(event)

    if event.type == "GitMerge":
        merged,message = sessions[session].merge(event.content["commit_message"])
        sessions[session].event_log.append({
            "type":"GitMergeResult",
            "content":{
                "success":merged,
                "message":message
            },
            "producer":event.producer,
            "consumer":event.consumer
        })
        return event
    
    sessions[session].event_log.append(event.model_dump())
    return event


@app.get("/sessions/{session}/events")
def read_events(session: str):
    if session not in sessions:
        raise fastapi.HTTPException(status_code=404, detail="Session not found")
    events = sessions.get(session, None).event_log
    return events


@app.get("/sessions/{session}/events/stream")
async def read_events_stream(session: str):
    if session not in sessions:
        raise fastapi.HTTPException(status_code=404, detail="Session not found")
    session_obj: Session = sessions.get(session)
    if not session_obj:
        raise fastapi.HTTPException(status_code=404, detail="Session not found")

    async def event_generator():
        initial_index = len(session_obj.event_log)
        while True:
            current_index = len(session_obj.event_log)
            if current_index > initial_index:
                for event in session_obj.event_log[initial_index:current_index]:
                    print("STREAM:", event)
                    yield f"data: {json.dumps(event)}\n\n"
                initial_index = current_index
            else:
                await asyncio.sleep(0.1)  # Sleep to prevent busy waiting

    return StreamingResponse(event_generator(), media_type="text/event-stream")


if __name__ == "__main__":
    import sys

    import uvicorn

    port = 8000  # Default port
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print("Warning: Invalid port number provided. Using default port 8000.")

        if os.environ.get("OPENAI_API_KEY"):
            app.api_key = os.environ.get("OPENAI_API_KEY")
            app.model = "gpt4-o"
            app.prompt_type = "openai"
        elif os.environ.get("ANTHROPIC_API_KEY"):
            app.api_key = os.environ.get("ANTHROPIC_API_KEY")
            app.model = "claude-opus"
            app.prompt_type = "anthropic"
        else:
            raise ValueError("API key not provided.")

        if os.environ.get("theseus_MODEL"):
            app.model = os.environ.get("theseus_MODEL")

    uvicorn.run(app, host="0.0.0.0", port=port)

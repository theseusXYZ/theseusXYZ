import json
from collections import deque
from typing import Any, Callable, Dict, List, Literal, Optional, Tuple

from theseus_agent.agent import Agent
from theseus_agent.environment import EnvironmentModule

"""
event type schema : [user].[session_name].[trajectory_id].[event_type].[consumer_id?].[sub_event].[action].[producer]
event_type : Tool, Environment, Agent, System, VersionControl, Custom
action: request, response, error, stream, invoke
producer: <id>


eg.

user.ui.<trajectory_id>.versioning.checkpoint.request.theseus
user.ui.<trajectory_id>.versioning.checkpoint.response.git
user.ui.<trajectory_id>.versioning.checkpoint.error.theseus
"""


class Event:
    __slots__ = [
        "user",
        "session_name",
        "trajectory_id",
        "event_type",
        "sub_event",
        "action",
        "producer",
        "content",
        "metadata",
        "consumer",
    ]

    def __init__(
        self,
        user: str,
        session_name: str,
        trajectory_id: str,
        event_type: str,
        sub_event: str,
        action: str,
        producer: str,
        content: Any,
        metadata: Optional[Dict[str, Any]] = None,
        consumer: Optional[str] = None,
    ):
        self.user = user
        self.session_name = session_name
        self.trajectory_id = trajectory_id
        self.event_type = event_type
        self.sub_event = sub_event
        self.action = action
        self.producer = producer
        self.content = content
        self.metadata = metadata
        self.consumer = consumer
        # self.timestamp = datetime.now()

    def __hash__(self):
        return hash(
            (
                self.user,
                self.session_name,
                self.trajectory_id,
                self.event_type,
                self.sub_event,
                self.action,
                self.producer,
                self.content,
                self.metadata,
                self.consumer,
            )
        )


event_system_status = Literal["paused", "running", "stopped", "error"]


def save_data(state):
    state_json = json.dumps(state)
    with open(f"checkpoint_{state['last_checkpoint_id']}.jsonl", "a") as f:
        f.write(state_json)


def get_data(checkpoint_id):
    with open(f"checkpoint_{checkpoint_id}.jsonl", "r") as f:
        state_json = f.read()
        return json.loads(state_json)


class EventSystem:
    def __init__(self):
        self.event_queue = deque()
        self.processed_events = []
        self.status = "paused"
        self.last_checkpoint_id = None
        self.environements: Dict[str, EnvironmentModule] = {}
        self.agents: Dict[str, Agent] = {}
        self.event_handlers: Dict[
            Tuple[str, str, str], Callable[[EventSystem, Event], List[Event]]
        ] = {}

    def register_environment(self, name, environment: EnvironmentModule):
        assert (
            self.status == "paused"
        ), "Event system is running, cannot register environment"
        self.environements[name] = environment
        environment.event_log = self

    def register_agent(self, name, agent: Agent):
        assert self.status == "paused", "Event system is running, cannot register agent"
        self.agents[name] = agent

    def add_event(self, event: Event):
        self.event_queue.append(event)

    def add_events(self, events: List[Event]):
        self.event_queue.extend(events)

    def get_event(self):
        assert self.status == "running", "Event system is not running"
        event = self.event_queue.get()
        self.processed_events.append(event)
        if event.event_type == "versioning" and event.sub_event == "checkpoint":
            self.save(self.last_checkpoint_id)
            self.last_checkpoint_id = len(self.processed_events)

        return event

    def rewind(self, events_to_rewind):
        if self.status == "running":
            raise Exception("Event system is running, cannot rewind")

        # self.event_queue.extendleft(self.processed_events[-events_to_rewind:])
        self.processed_events = self.processed_events[:-events_to_rewind]

    def save(self, checkpoint_id=-1):
        assert self.status == "paused", "Event system is running, cannot save"
        state = {
            "last_checkpoint_id": self.last_checkpoint_id,
            "environments": {},
            "agents": {},
        }
        for name, environment in self.environements.items():
            state["environments"][name] = environment.save()
        for name, agent in self.agents.items():
            state["agents"][name] = agent.save()

        save_data(state)

    def load(self, checkpoint_id):
        assert self.status == "paused", "Event system is running, cannot load"
        state = get_data(checkpoint_id)

        for key, environment in self.environements.items():
            environment.load(state["environments"][key])
        for key, agent in self.agents.items():
            agent.load(state["agents"][key])

    def revert_to_last_checkpoint(self):
        assert (
            self.status == "paused"
        ), "Event system is running, cannot revert to last checkpoint"

        self.save()
        self.rewind(len(self.processed_events) - self.last_checkpoint_id)
        self.load(self.last_checkpoint_id)

    def reset(self):
        assert self.status == "paused", "Event system is running, cannot reset"
        self.event_queue = deque()
        self.processed_events = []
        self.status = "paused"

    def start(self):
        # assert self.status == "paused", "Event system is running, cannot start"
        self.status = "running"

    def pause(self):
        # assert self.status == "running", "Event system is not running, cannot pause"
        self.status = "paused"

    def terminate(self):
        self.status = "stopped"

    def run_loop(self):
        while self.status == "running":
            event = self.get_event()
            self.process_event(event)

    def process_event(self, event: Event):
        if (event.event_type, event.sub_event, event.action) in self.event_handlers:
            events = self.event_handlers[
                (event.event_type, event.sub_event, event.action)
            ](self, event)
            self.add_events(events)
        else:
            print(f"Event {event.event_type} not handled")


def request_handler(func: Callable[[EventSystem, Event], List[Event]]):
    def wrapper(system: EventSystem, event: Event):
        try:
            res = func(system, event)
            return [
                Event(
                    user=event.user,
                    session_name=event.session_name,
                    trajectory_id=event.trajectory_id,
                    event_type=event.event_type,
                    sub_event=event.sub_event,
                    action="response",
                    producer=event.producer,
                    consumer=event.consumer,
                    content=res,
                )
            ]

        except Exception as e:
            return [
                Event(
                    user=event.user,
                    session_name=event.session_name,
                    trajectory_id=event.trajectory_id,
                    event_type=event.event_type,
                    sub_event=event.sub_event,
                    action="error",
                    producer=event.producer,
                    consumer=event.consumer,
                    content=str(e),
                )
            ]

    return wrapper

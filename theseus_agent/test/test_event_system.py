# from unittest.mock import patch

# import pytest

# from theseus_agent.event import Agent, EnvironmentModule, Event, EventSystem


# @pytest.fixture
# def event_system():
#     return EventSystem()


# @pytest.fixture
# def mock_environment():
#     class MockEnvironment(EnvironmentModule):
#         def __init__(self):
#             self.state = "initial"

#         def save(self):
#             return {"state": self.state}

#         def load(self, state):
#             self.state = state["state"]

#     return MockEnvironment()


# @pytest.fixture
# def mock_agent():
#     class MockAgent(Agent):
#         def __init__(self):
#             self.state = "initial"

#         def save(self):
#             return {"state": self.state}

#         def load(self, state):
#             self.state = state["state"]

#     return MockAgent()


# def test_revert_to_last_checkpoint(event_system, mock_environment, mock_agent):
#     event_system.register_environment("env1", mock_environment)
#     event_system.register_agent("agent1", mock_agent)

#     # Add some events and create checkpoints
#     event_system.add_event(
#         Event(
#             "user1",
#             "session1",
#             "traj1",
#             "versioning",
#             "checkpoint",
#             "request",
#             "producer1",
#             "content1",
#         )
#     )
#     event_system.get_event()  # Process the event and create a checkpoint

#     event_system.add_event(
#         Event(
#             "user1",
#             "session1",
#             "traj1",
#             "custom",
#             "test",
#             "action",
#             "producer2",
#             "content2",
#         )
#     )
#     event_system.get_event()

#     # Modify environment and agent states
#     mock_environment.state = "modified"
#     mock_agent.state = "modified"

#     # Revert to last checkpoint
#     with patch("theseus_agent.event.get_data") as mock_get_data:
#         mock_get_data.return_value = {
#             "last_checkpoint_id": 1,
#             "environments": {"env1": {"state": "initial"}},
#             "agents": {"agent1": {"state": "initial"}},
#         }
#         event_system.revert_to_last_checkpoint()

#     assert len(event_system.processed_events) == 1
#     assert mock_environment.state == "initial"
#     assert mock_agent.state == "initial"


# def test_save(event_system, mock_environment, mock_agent):
#     event_system.register_environment("env1", mock_environment)
#     event_system.register_agent("agent1", mock_agent)

#     mock_environment.state = "saved_state"
#     mock_agent.state = "saved_state"

#     with patch("theseus_agent.event.save_data") as mock_save_data:
#         event_system.save()

#     expected_state = {
#         "last_checkpoint_id": None,
#         "environments": {"env1": {"state": "saved_state"}},
#         "agents": {"agent1": {"state": "saved_state"}},
#     }
#     mock_save_data.assert_called_once_with(expected_state)


# def test_load(event_system, mock_environment, mock_agent):
#     event_system.register_environment("env1", mock_environment)
#     event_system.register_agent("agent1", mock_agent)

#     mock_state = {
#         "last_checkpoint_id": 1,
#         "environments": {"env1": {"state": "loaded_state"}},
#         "agents": {"agent1": {"state": "loaded_state"}},
#     }

#     with patch("theseus_agent.event.get_data", return_value=mock_state):
#         event_system.load(1)

#     assert mock_environment.state == "loaded_state"
#     assert mock_agent.state == "loaded_state"


# def test_revert_to_last_checkpoint_running_error(event_system):
#     event_system.status = "running"
#     with pytest.raises(
#         Exception, match="Event system is running, cannot revert to last checkpoint"
#     ):
#         event_system.revert_to_last_checkpoint()


# def test_reset(event_system):
#     event_system.add_event(
#         Event(
#             "user1",
#             "session1",
#             "traj1",
#             "custom",
#             "test",
#             "action",
#             "producer1",
#             "content1",
#         )
#     )
#     event_system.get_event()
#     event_system.status = "paused"

#     event_system.reset()

#     assert len(event_system.event_queue) == 0
#     assert len(event_system.processed_events) == 0
#     assert event_system.status == "paused"


# def test_reset_running_error(event_system):
#     event_system.status = "running"
#     with pytest.raises(Exception, match="Event system is running, cannot reset"):
#         event_system.reset()

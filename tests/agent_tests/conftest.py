"""
Shared fixtures for Python agent tests.

This module provides common test fixtures used across all agent tests,
including mocked bridges, sample contexts, and trace contexts.
"""

import sys
from pathlib import Path

root_dir = Path(__file__).parent.parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from typing import Any

pytest_plugins = ('pytest_asyncio',)


@pytest.fixture
def mock_bridge():
    """
    Create an AsyncMock for NodeBridge that returns realistic tool responses.
    
    This fixture mocks the Node.js bridge to return appropriate responses
    for different tool calls without requiring actual HTTP requests.
    """
    bridge = AsyncMock()
    
    async def mock_execute_tool(tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Return realistic responses based on tool name."""
        tool_responses = {
            "send_sms": {
                "success": True,
                "messageSid": "SM123456789",
                "to": arguments.get("phone_number", "+15551234567"),
            },
            "get_daily_checkin_status": {
                "success": True,
                "config": {
                    "enabled": True,
                    "time": "09:00",
                    "phoneNumber": "+15551234567",
                },
            },
            "configure_daily_checkin": {
                "success": True,
                "message": "Daily check-in configured",
            },
            "stop_daily_checkin": {
                "success": True,
                "message": "Daily check-in stopped",
            },
            "send_checkin_now": {
                "success": True,
                "to": "+15551234567",
                "messageSid": "SM987654321",
            },
            "add_task": {
                "success": True,
                "task": {
                    "id": 1,
                    "title": arguments.get("title", "Test task"),
                    "priority": arguments.get("priority", "medium"),
                    "status": "pending",
                },
            },
            "list_tasks": {
                "success": True,
                "tasks": [
                    {"id": 1, "title": "Task 1", "status": "pending"},
                    {"id": 2, "title": "Task 2", "status": "completed"},
                ],
            },
            "complete_task": {
                "success": True,
                "task": {"id": arguments.get("task_id", 1), "status": "completed"},
            },
            "delete_task": {
                "success": True,
                "message": "Task deleted",
            },
            "update_task": {
                "success": True,
                "task": {"id": arguments.get("task_id", 1)},
            },
            "clear_completed_tasks": {
                "success": True,
                "cleared_count": 2,
            },
            "set_reminder": {
                "success": True,
                "reminder_id": "rem_123",
                "scheduled_time": "2024-01-15T10:00:00Z",
            },
            "list_reminders": {
                "success": True,
                "reminders": [
                    {"id": "rem_123", "message": "Test reminder", "time": "10:00"},
                ],
            },
            "cancel_reminder": {
                "success": True,
                "message": "Reminder cancelled",
            },
            "get_calendar_events": {
                "success": True,
                "events": [
                    {"id": "evt_1", "summary": "Meeting", "start": "2024-01-15T09:00:00Z"},
                ],
            },
            "get_today_events": {
                "success": True,
                "events": [
                    {"id": "evt_1", "summary": "Today's Meeting", "start": "2024-01-15T09:00:00Z"},
                ],
            },
            "get_upcoming_events": {
                "success": True,
                "events": [],
            },
            "create_calendar_event": {
                "success": True,
                "event": {"id": "evt_new", "summary": arguments.get("title", "New Event")},
            },
            "update_calendar_event": {
                "success": True,
                "event": {"id": arguments.get("event_id", "evt_1")},
            },
            "delete_calendar_event": {
                "success": True,
                "message": "Event deleted",
            },
            "add_grocery_item": {
                "success": True,
                "item": {
                    "name": arguments.get("item", "Milk"),
                    "category": arguments.get("category", "Dairy"),
                },
            },
            "list_grocery_items": {
                "success": True,
                "items": [
                    {"name": "Milk", "category": "Dairy", "purchased": False},
                    {"name": "Bread", "category": "Bakery", "purchased": False},
                ],
            },
            "mark_grocery_purchased": {
                "success": True,
                "item": {"name": arguments.get("item", "Milk"), "purchased": True},
            },
            "remove_grocery_item": {
                "success": True,
                "message": "Item removed",
            },
            "clear_purchased_groceries": {
                "success": True,
                "cleared_count": 1,
            },
            "clear_all_groceries": {
                "success": True,
                "message": "Grocery list cleared",
            },
            "get_current_time": {
                "success": True,
                "time": "2024-01-15T10:30:00Z",
                "timezone": "America/New_York",
            },
            "get_weather": {
                "success": True,
                "weather": {
                    "temperature": 45,
                    "condition": "Partly Cloudy",
                    "location": "Boston, MA",
                },
            },
            "web_search": {
                "success": True,
                "results": [
                    {"title": "Result 1", "url": "https://example.com", "snippet": "Test result"},
                ],
            },
            "perplexity_search": {
                "success": True,
                "answer": "This is a synthesized answer to your query.",
                "sources": ["https://source1.com", "https://source2.com"],
            },
            "semantic_search": {
                "success": True,
                "memories": [
                    {"content": "Relevant memory", "relevance": 0.95},
                ],
            },
            "search_lifelogs": {
                "success": True,
                "lifelogs": [
                    {"id": "log_1", "title": "Meeting notes", "excerpt": "Discussed project..."},
                ],
            },
            "save_memory": {
                "success": True,
                "memory_id": "mem_123",
            },
            "route_to_agent": {
                "success": True,
                "response": "Agent response via bridge",
            },
        }
        
        default_response = {
            "success": True,
            "result": f"Mock result for {tool_name}",
        }
        
        return tool_responses.get(tool_name, default_response)
    
    bridge.execute_tool = mock_execute_tool
    
    async def mock_get_memory_context(query: str, limit: int = 10) -> dict[str, Any]:
        return {
            "success": True,
            "memories": {
                "relevant_fact": "User prefers morning meetings",
            },
        }
    
    bridge.get_memory_context = mock_get_memory_context
    
    async def mock_get_user_profile() -> dict[str, Any]:
        return {
            "success": True,
            "profile": {
                "name": "Nate",
                "preferences": {"timezone": "America/New_York"},
            },
        }
    
    bridge.get_user_profile = mock_get_user_profile
    
    async def mock_get_capabilities() -> dict[str, Any]:
        return {
            "success": True,
            "capabilities": {
                "communication": ["send_sms"],
                "scheduling": ["set_reminder", "get_calendar_events"],
                "tasks": ["add_task", "list_tasks"],
            },
        }
    
    bridge.get_capabilities = mock_get_capabilities
    
    return bridge


@pytest.fixture
def sample_context():
    """
    Create a sample AgentContext with test data.
    
    Returns an AgentContext instance with realistic test values
    for use in agent tests.
    """
    from python_agents.agents.base import AgentContext
    from python_agents.tracing import create_trace_context
    
    return AgentContext(
        user_message="Send a text to mom saying I'll be late",
        conversation_id="conv_test_123",
        memory_context={
            "recent": "User mentioned being at work",
        },
        user_profile={
            "name": "Nate",
            "contacts": {"mom": "+15551234567"},
        },
        phone_number=None,
        metadata={
            "source": "web",
            "is_admin": True,
            "trusted_single_user_deployment": True,
        },
        trace_context=create_trace_context({"test": True}),
    )


@pytest.fixture
def sms_context():
    """
    Create an AgentContext simulating an SMS-initiated request.
    """
    from python_agents.agents.base import AgentContext
    from python_agents.tracing import create_trace_context
    
    return AgentContext(
        user_message="What's the weather?",
        conversation_id="conv_sms_456",
        memory_context={},
        user_profile={"name": "Nate"},
        phone_number="+15559876543",
        metadata={
            "source": "sms",
            "is_admin": False,
            "sender_is_admin": True,
        },
        trace_context=create_trace_context({"source": "sms"}),
    )


@pytest.fixture
def unauthorized_context():
    """
    Create an AgentContext without admin permissions.
    """
    from python_agents.agents.base import AgentContext
    from python_agents.tracing import create_trace_context
    
    return AgentContext(
        user_message="Send a message to someone",
        conversation_id="conv_unauth_789",
        memory_context={},
        user_profile={},
        phone_number="+15559999999",
        metadata={
            "source": "sms",
            "is_admin": False,
            "sender_is_admin": False,
        },
        trace_context=create_trace_context({"source": "sms"}),
    )


@pytest.fixture
def trace_context():
    """
    Create a TraceContext for tracing tests.
    """
    from python_agents.tracing import create_trace_context
    
    return create_trace_context({"test_session": "session_001"})


@pytest.fixture
def mock_openai_runner():
    """
    Mock the OpenAI Runner to avoid actual API calls.
    
    Returns a mock that simulates Runner.run() responses.
    """
    mock_result = MagicMock()
    mock_result.final_output = "This is a mocked response from the agent."
    mock_result.new_items = []
    
    runner_mock = AsyncMock(return_value=mock_result)
    return runner_mock


@pytest.fixture
def patch_bridge(mock_bridge):
    """
    Patch the get_bridge function to return the mock bridge.
    """
    with patch('python_agents.bridge.get_bridge', return_value=mock_bridge):
        with patch('python_agents.agents.base.get_bridge', return_value=mock_bridge):
            yield mock_bridge


@pytest.fixture
def mock_bridge_error():
    """
    Create an AsyncMock for NodeBridge that returns error responses.
    
    This fixture simulates bridge call failures for testing error handling.
    """
    import httpx
    
    bridge = AsyncMock()
    
    async def mock_execute_tool_error(tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Return error response for any tool call."""
        raise httpx.HTTPStatusError(
            "Internal Server Error",
            request=httpx.Request("POST", "http://localhost:5000/api/tools/execute"),
            response=httpx.Response(500, json={"error": "Internal server error"})
        )
    
    bridge.execute_tool = mock_execute_tool_error
    
    async def mock_get_memory_context_error(query: str, limit: int = 10) -> dict[str, Any]:
        """Return error for memory context calls."""
        raise httpx.HTTPStatusError(
            "Service Unavailable",
            request=httpx.Request("POST", "http://localhost:5000/api/memory/context"),
            response=httpx.Response(503, json={"error": "Memory service unavailable"})
        )
    
    bridge.get_memory_context = mock_get_memory_context_error
    
    async def mock_get_user_profile_error() -> dict[str, Any]:
        """Return error for profile calls."""
        raise httpx.HTTPStatusError(
            "Not Found",
            request=httpx.Request("GET", "http://localhost:5000/api/user/profile"),
            response=httpx.Response(404, json={"error": "Profile not found"})
        )
    
    bridge.get_user_profile = mock_get_user_profile_error
    
    async def mock_get_capabilities_error() -> dict[str, Any]:
        """Return error for capabilities calls."""
        return {"success": False, "error": "Failed to get capabilities"}
    
    bridge.get_capabilities = mock_get_capabilities_error
    
    async def mock_health_check_error() -> dict[str, Any]:
        """Return unhealthy status."""
        return {
            "status": "unhealthy",
            "http_ok": False,
            "json_ok": False,
            "error": "Connection refused"
        }
    
    bridge.health_check = mock_health_check_error
    
    return bridge


@pytest.fixture
def mock_bridge_timeout():
    """
    Create an AsyncMock for NodeBridge that simulates timeout errors.
    
    This fixture simulates timeout scenarios for testing timeout handling.
    """
    import httpx
    import asyncio
    
    bridge = AsyncMock()
    
    async def mock_execute_tool_timeout(tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Simulate timeout for tool execution."""
        raise httpx.TimeoutException("Request timed out")
    
    bridge.execute_tool = mock_execute_tool_timeout
    
    async def mock_get_memory_context_timeout(query: str, limit: int = 10) -> dict[str, Any]:
        """Simulate timeout for memory context."""
        raise httpx.TimeoutException("Memory request timed out")
    
    bridge.get_memory_context = mock_get_memory_context_timeout
    
    async def mock_get_user_profile_timeout() -> dict[str, Any]:
        """Simulate timeout for profile retrieval."""
        raise httpx.TimeoutException("Profile request timed out")
    
    bridge.get_user_profile = mock_get_user_profile_timeout
    
    async def mock_get_capabilities_timeout() -> dict[str, Any]:
        """Simulate timeout for capabilities."""
        raise httpx.TimeoutException("Capabilities request timed out")
    
    bridge.get_capabilities = mock_get_capabilities_timeout
    
    async def mock_health_check_timeout() -> dict[str, Any]:
        """Return timeout status."""
        return {
            "status": "unhealthy",
            "http_ok": False,
            "json_ok": False,
            "error": "Request timed out"
        }
    
    bridge.health_check = mock_health_check_timeout
    
    return bridge


@pytest.fixture
def patch_bridge_error(mock_bridge_error):
    """
    Patch the get_bridge function to return the error-returning mock bridge.
    """
    with patch('python_agents.bridge.get_bridge', return_value=mock_bridge_error):
        with patch('python_agents.agents.base.get_bridge', return_value=mock_bridge_error):
            yield mock_bridge_error


@pytest.fixture
def patch_bridge_timeout(mock_bridge_timeout):
    """
    Patch the get_bridge function to return the timeout-simulating mock bridge.
    """
    with patch('python_agents.bridge.get_bridge', return_value=mock_bridge_timeout):
        with patch('python_agents.agents.base.get_bridge', return_value=mock_bridge_timeout):
            yield mock_bridge_timeout


@pytest.fixture
def mock_bridge_partial():
    """
    Create a mock bridge that returns partial success (some tools succeed, others fail).
    """
    bridge = AsyncMock()
    
    call_count = {"count": 0}
    
    async def mock_execute_tool_partial(tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Alternating success/failure for simulating partial handoff failures."""
        call_count["count"] += 1
        if call_count["count"] % 2 == 0:
            return {"success": False, "error": f"Tool {tool_name} failed intermittently"}
        return {"success": True, "result": f"Mock result for {tool_name}"}
    
    bridge.execute_tool = mock_execute_tool_partial
    
    async def mock_health_check() -> dict[str, Any]:
        return {"status": "degraded", "http_ok": True, "json_ok": False}
    
    bridge.health_check = mock_health_check
    
    async def mock_get_memory_context(query: str, limit: int = 10) -> dict[str, Any]:
        return {"success": True, "memories": {}}
    
    bridge.get_memory_context = mock_get_memory_context
    
    async def mock_get_user_profile() -> dict[str, Any]:
        return {"success": True, "profile": {"name": "Test User"}}
    
    bridge.get_user_profile = mock_get_user_profile
    
    return bridge


@pytest.fixture
def test_client(mock_bridge):
    """
    Create a FastAPI TestClient with patched dependencies.
    
    This fixture provides an httpx AsyncClient configured for testing
    the FastAPI app with mocked bridge and agent dependencies.
    """
    import httpx
    from python_agents.main import app
    
    with patch('python_agents.main.get_bridge', return_value=mock_bridge):
        with patch('python_agents.bridge.get_bridge', return_value=mock_bridge):
            yield httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app),
                base_url="http://test"
            )


@pytest.fixture
def test_client_with_error_bridge(mock_bridge_error):
    """
    Create a FastAPI TestClient with error-returning bridge.
    """
    import httpx
    from python_agents.main import app
    
    with patch('python_agents.main.get_bridge', return_value=mock_bridge_error):
        with patch('python_agents.bridge.get_bridge', return_value=mock_bridge_error):
            yield httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app),
                base_url="http://test"
            )


@pytest.fixture
def test_client_with_timeout_bridge(mock_bridge_timeout):
    """
    Create a FastAPI TestClient with timeout-simulating bridge.
    """
    import httpx
    from python_agents.main import app
    
    with patch('python_agents.main.get_bridge', return_value=mock_bridge_timeout):
        with patch('python_agents.bridge.get_bridge', return_value=mock_bridge_timeout):
            yield httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app),
                base_url="http://test"
            )


@pytest.fixture
def patched_agent_bridge(mock_bridge):
    """
    Fixture that patches get_bridge globally to return the mock bridge.
    
    This ensures that when agents access self.bridge property, they get
    the mock bridge instead of a real NodeBridge instance.
    
    Use this fixture when testing agents in isolation without FastAPI.
    """
    with patch('python_agents.bridge.get_bridge', return_value=mock_bridge):
        with patch('python_agents.agents.base.get_bridge', return_value=mock_bridge):
            with patch('python_agents.agents.conductor.get_bridge', return_value=mock_bridge):
                with patch('python_agents.agents.comms_pilot.get_bridge', return_value=mock_bridge):
                    yield mock_bridge


@pytest.fixture
def inject_bridge_into_agent(mock_bridge):
    """
    Factory fixture that directly injects mock bridge into agent instances.
    
    This is the recommended approach for testing agents with mocked bridge
    because it bypasses the lazy initialization in the bridge property.
    
    Usage:
        def test_agent(inject_bridge_into_agent):
            agent = CommsPilotAgent()
            inject_bridge_into_agent(agent)
            # agent._bridge is now the mock bridge
    """
    def _inject(agent):
        agent._bridge = mock_bridge
        return agent
    return _inject


@pytest.fixture
def conductor_with_mock_specialists(mock_bridge, sample_context):
    """
    Create a fully configured ConductorAgent with mock bridge and specialist agents.
    
    This fixture creates a conductor with CommsPilot, OpsPlannerAgent, and other
    specialists registered, all with mocked bridges for end-to-end testing.
    
    Returns:
        tuple: (conductor, specialists_dict, mock_bridge)
    """
    from python_agents.agents.conductor import ConductorAgent
    from python_agents.agents.comms_pilot import CommsPilotAgent
    from python_agents.agents.ops_planner import OpsPlannerAgent
    from python_agents.agents.memory_curator import MemoryCuratorAgent
    from python_agents.agents.research_scout import ResearchScoutAgent
    from python_agents.agents.safety_auditor import SafetyAuditorAgent
    
    conductor = ConductorAgent()
    conductor._bridge = mock_bridge
    
    comms_pilot = CommsPilotAgent()
    comms_pilot._bridge = mock_bridge
    
    ops_planner = OpsPlannerAgent()
    ops_planner._bridge = mock_bridge
    
    memory_curator = MemoryCuratorAgent()
    memory_curator._bridge = mock_bridge
    
    research_scout = ResearchScoutAgent()
    research_scout._bridge = mock_bridge
    
    safety_auditor = SafetyAuditorAgent()
    safety_auditor._bridge = mock_bridge
    
    conductor.register_specialist(comms_pilot)
    conductor.register_specialist(ops_planner)
    conductor.register_specialist(memory_curator)
    conductor.register_specialist(research_scout)
    conductor.register_specialist(safety_auditor)
    
    specialists = {
        "comms_pilot": comms_pilot,
        "ops_planner": ops_planner,
        "memory_curator": memory_curator,
        "research_scout": research_scout,
        "safety_auditor": safety_auditor,
    }
    
    return conductor, specialists, mock_bridge


@pytest.fixture
def mock_openai_agent_runner():
    """
    Mock the OpenAI Runner.run() method to avoid actual API calls during testing.
    
    This fixture patches Runner.run to return a mock result with predictable output.
    Use this in combination with conductor_with_mock_specialists for full e2e testing.
    """
    from agents import Runner
    
    mock_result = MagicMock()
    mock_result.final_output = "Mocked agent response from specialist."
    mock_result.new_items = []
    
    with patch.object(Runner, 'run', new_callable=AsyncMock) as mock_run:
        mock_run.return_value = mock_result
        yield mock_run, mock_result

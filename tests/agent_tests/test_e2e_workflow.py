"""
End-to-end orchestration tests for the multi-agent system.

These tests verify the complete workflow from user request to response,
including:
- Conductor intent classification and routing
- Specialist agent execution with mocked bridges
- Handoff chain tracking and verification
- Trace event logging (HANDOFF_START, HANDOFF_COMPLETE)
- Response composition from multiple agents
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from typing import Any
import json

from python_agents.agents.base import (
    AgentId,
    AgentContext,
    AgentStatus,
    CapabilityCategory,
    HandoffReason,
    HandoffRequest,
    BaseAgent,
)
from python_agents.agents.conductor import (
    ConductorAgent,
    AgentResponse,
    ClassifiedIntent,
    IntentType,
    CompletionStatus,
)
from python_agents.agents.comms_pilot import CommsPilotAgent
from python_agents.agents.ops_planner import OpsPlannerAgent
from python_agents.tracing import TraceContext, TraceEventType, create_trace_context


class TestConductorRouting:
    """Tests for conductor intent classification and routing to specialists."""
    
    @pytest.mark.asyncio
    async def test_conductor_routes_sms_to_comms_pilot(self, conductor_with_mock_specialists, mock_openai_agent_runner, sample_context):
        """Conductor should route SMS intent to CommsPilot agent."""
        conductor, specialists, mock_bridge = conductor_with_mock_specialists
        mock_run, mock_result = mock_openai_agent_runner
        
        intent = ClassifiedIntent(
            category=CapabilityCategory.COMMUNICATION,
            type=IntentType.SEND_MESSAGE,
            confidence=0.9,
            entities={"recipient": "mom", "message_content": "I'll be late"},
            raw_message="Text mom saying I'll be late",
            requires_coordination=False,
            target_agents=[AgentId.COMMS_PILOT, AgentId.SAFETY_AUDITOR],
        )
        
        target_agent = conductor.route_to_agent(intent)
        
        assert target_agent == AgentId.COMMS_PILOT
    
    @pytest.mark.asyncio
    async def test_conductor_routes_task_to_ops_planner(self, conductor_with_mock_specialists, sample_context):
        """Conductor should route task intent to OpsPlannerAgent."""
        conductor, specialists, mock_bridge = conductor_with_mock_specialists
        
        intent = ClassifiedIntent(
            category=CapabilityCategory.TASK_MANAGEMENT,
            type=IntentType.ADD_TASK,
            confidence=0.95,
            entities={"task_name": "Buy groceries"},
            raw_message="Add task to buy groceries",
            requires_coordination=False,
            target_agents=[AgentId.OPS_PLANNER],
        )
        
        target_agent = conductor.route_to_agent(intent)
        
        assert target_agent == AgentId.OPS_PLANNER
    
    @pytest.mark.asyncio
    async def test_conductor_fallback_classification(self, conductor_with_mock_specialists):
        """Conductor should use fallback classification for unrecognized intent."""
        conductor, specialists, mock_bridge = conductor_with_mock_specialists
        
        intent = conductor._fallback_classification("What is the meaning of life?")
        
        assert intent.category == CapabilityCategory.SYSTEM
        assert intent.type == IntentType.UNKNOWN
        assert intent.confidence < 0.7
        assert AgentId.SAFETY_AUDITOR in intent.target_agents
    
    @pytest.mark.asyncio
    async def test_conductor_keyword_based_routing(self, conductor_with_mock_specialists):
        """Conductor fallback should use keywords for basic classification."""
        conductor, specialists, mock_bridge = conductor_with_mock_specialists
        
        intent = conductor._fallback_classification("Send a text message to John")
        assert intent.category == CapabilityCategory.COMMUNICATION
        assert intent.type == IntentType.SEND_MESSAGE
        
        intent = conductor._fallback_classification("What's the weather like?")
        assert intent.category == CapabilityCategory.INFORMATION
        assert intent.type == IntentType.WEATHER
        
        intent = conductor._fallback_classification("Check my grocery list")
        assert intent.category == CapabilityCategory.GROCERY
        assert intent.type == IntentType.CHECK_LIST


class TestHandoffChainTracking:
    """Tests for verifying handoff chain is populated correctly."""
    
    @pytest.mark.asyncio
    async def test_handoff_chain_populated_for_single_agent(self, conductor_with_mock_specialists, mock_openai_agent_runner, sample_context):
        """Handoff chain should contain entry when routing to a specialist."""
        conductor, specialists, mock_bridge = conductor_with_mock_specialists
        mock_run, mock_result = mock_openai_agent_runner
        
        intent = ClassifiedIntent(
            category=CapabilityCategory.TASK_MANAGEMENT,
            type=IntentType.VIEW_TASKS,
            confidence=0.9,
            entities={},
            raw_message="Show my tasks",
            requires_coordination=False,
            target_agents=[AgentId.OPS_PLANNER],
        )
        
        from python_agents.agents.conductor import HandoffContext
        handoff_context = HandoffContext(
            user_message="Show my tasks",
            conversation_id="test_conv",
            permissions={},
        )
        
        handoff = conductor.create_handoff(
            target_agent=AgentId.OPS_PLANNER,
            intent=intent,
            context=handoff_context,
            reason=HandoffReason.CAPABILITY_REQUIRED,
        )
        
        assert handoff is not None
        assert handoff.source_agent == AgentId.CONDUCTOR
        assert handoff.target_agent == AgentId.OPS_PLANNER
        assert handoff.reason == HandoffReason.CAPABILITY_REQUIRED
        
        chain = conductor.get_handoff_chain()
        assert len(chain) == 1
        assert chain[0]["source"] == "conductor"
        assert chain[0]["target"] == "ops_planner"
    
    @pytest.mark.asyncio
    async def test_handoff_chain_for_coordinated_request(self, conductor_with_mock_specialists, mock_openai_agent_runner, sample_context):
        """Coordinated requests should build multi-agent handoff chain."""
        conductor, specialists, mock_bridge = conductor_with_mock_specialists
        mock_run, mock_result = mock_openai_agent_runner
        
        intent = ClassifiedIntent(
            category=CapabilityCategory.COMMUNICATION,
            type=IntentType.SEND_MESSAGE,
            confidence=0.9,
            entities={},
            raw_message="Send a message",
            requires_coordination=True,
            target_agents=[AgentId.MEMORY_CURATOR, AgentId.COMMS_PILOT, AgentId.SAFETY_AUDITOR],
        )
        
        from python_agents.agents.conductor import HandoffContext
        handoff_context = HandoffContext(
            user_message="Send a message",
            conversation_id="test_conv",
            permissions={},
        )
        
        for agent_id in intent.target_agents:
            conductor.create_handoff(
                target_agent=agent_id,
                intent=intent,
                context=handoff_context,
                reason=HandoffReason.CAPABILITY_REQUIRED,
            )
        
        chain = conductor.get_handoff_chain()
        assert len(chain) == 3
        
        assert chain[0]["target"] == "memory_curator"
        assert chain[1]["target"] == "comms_pilot"
        assert chain[2]["target"] == "safety_auditor"


class TestTraceEventLogging:
    """Tests for verifying trace events are logged correctly."""
    
    @pytest.mark.asyncio
    async def test_handoff_start_event_logged(self, sample_context):
        """handoff_to should log HANDOFF_START trace event."""
        from python_agents.agents.comms_pilot import CommsPilotAgent
        
        agent = CommsPilotAgent()
        trace_ctx = sample_context.ensure_trace_context()
        initial_event_count = len(trace_ctx.events)
        
        try:
            handoff = agent.handoff_to(
                target_agent=AgentId.SAFETY_AUDITOR,
                reason=HandoffReason.SAFETY_CHECK,
                context={"test": "data"},
                message="Requesting safety check",
                agent_context=sample_context,
            )
        except ValueError:
            agent.handoff_targets = [AgentId.SAFETY_AUDITOR, AgentId.CONDUCTOR]
            handoff = agent.handoff_to(
                target_agent=AgentId.SAFETY_AUDITOR,
                reason=HandoffReason.SAFETY_CHECK,
                context={"test": "data"},
                message="Requesting safety check",
                agent_context=sample_context,
            )
        
        handoff_events = [e for e in trace_ctx.events if e.event_type == TraceEventType.HANDOFF_START]
        assert len(handoff_events) >= 1, "Should have HANDOFF_START event"
        
        last_handoff = handoff_events[-1]
        assert last_handoff.data.get("from_agent") == "comms_pilot"
        assert last_handoff.data.get("to_agent") == "safety_auditor"
        assert last_handoff.data.get("reason") == "safety_check"
    
    @pytest.mark.asyncio
    async def test_handoff_complete_event_logged(self, conductor_with_mock_specialists, sample_context):
        """complete_handoff should log HANDOFF_COMPLETE trace event."""
        conductor, specialists, mock_bridge = conductor_with_mock_specialists
        
        handoff_request = HandoffRequest(
            source_agent=AgentId.CONDUCTOR,
            target_agent=AgentId.COMMS_PILOT,
            reason=HandoffReason.CAPABILITY_REQUIRED,
            context={},
            message="Test handoff",
        )
        
        trace_ctx = sample_context.ensure_trace_context()
        
        conductor.complete_handoff(handoff_request, success=True, agent_context=sample_context)
        
        complete_events = [e for e in trace_ctx.events if e.event_type == TraceEventType.HANDOFF_COMPLETE]
        assert len(complete_events) >= 1, "Should have HANDOFF_COMPLETE event"
        
        last_complete = complete_events[-1]
        assert last_complete.data.get("from_agent") == "conductor"
        assert last_complete.data.get("to_agent") == "comms_pilot"
        assert last_complete.data.get("success") is True
    
    @pytest.mark.asyncio
    async def test_agent_start_and_complete_events(self, mock_bridge, sample_context):
        """Agent run should log AGENT_START and AGENT_COMPLETE events."""
        
        class TestAgent(BaseAgent):
            def __init__(self):
                super().__init__(
                    agent_id=AgentId.COMMS_PILOT,
                    name="Test Agent",
                    description="Test agent",
                    instructions="Test",
                    capabilities=[CapabilityCategory.COMMUNICATION],
                )
                self._bridge = mock_bridge
            
            async def _execute(self, input_text: str, context: AgentContext) -> str:
                return "Test response"
        
        agent = TestAgent()
        trace_ctx = sample_context.ensure_trace_context()
        
        result = await agent.run("Test input", sample_context)
        
        start_events = [e for e in trace_ctx.events if e.event_type == TraceEventType.AGENT_START]
        complete_events = [e for e in trace_ctx.events if e.event_type == TraceEventType.AGENT_COMPLETE]
        
        assert len(start_events) >= 1, "Should have AGENT_START event"
        assert len(complete_events) >= 1, "Should have AGENT_COMPLETE event"
        
        assert start_events[-1].agent_id == "comms_pilot"
        assert complete_events[-1].agent_id == "comms_pilot"


class TestComposeResponse:
    """Tests for Conductor.compose_response() method."""
    
    @pytest.mark.asyncio
    async def test_compose_single_successful_response(self, conductor_with_mock_specialists, sample_context):
        """compose_response should return single response content directly."""
        conductor, specialists, mock_bridge = conductor_with_mock_specialists
        
        intent = ClassifiedIntent(
            category=CapabilityCategory.TASK_MANAGEMENT,
            type=IntentType.VIEW_TASKS,
            confidence=0.9,
            entities={},
            raw_message="Show tasks",
            requires_coordination=False,
            target_agents=[AgentId.OPS_PLANNER],
        )
        
        responses = [
            AgentResponse(
                agent_id=AgentId.OPS_PLANNER,
                success=True,
                content="Here are your tasks: 1. Buy groceries",
                processing_time_ms=150,
            )
        ]
        
        result = await conductor.compose_response(intent, responses, sample_context)
        
        assert result == "Here are your tasks: 1. Buy groceries"
        assert conductor.last_completion_status == CompletionStatus.COMPLETE
    
    @pytest.mark.asyncio
    async def test_compose_multiple_successful_responses(self, conductor_with_mock_specialists, sample_context):
        """compose_response should aggregate multiple responses."""
        conductor, specialists, mock_bridge = conductor_with_mock_specialists
        
        intent = ClassifiedIntent(
            category=CapabilityCategory.SYSTEM,
            type=IntentType.MORNING_BRIEFING,
            confidence=0.9,
            entities={},
            raw_message="Morning briefing",
            requires_coordination=True,
            target_agents=[AgentId.MEMORY_CURATOR, AgentId.OPS_PLANNER],
        )
        
        responses = [
            AgentResponse(
                agent_id=AgentId.MEMORY_CURATOR,
                success=True,
                content="Yesterday you mentioned wanting to exercise.",
                processing_time_ms=100,
            ),
            AgentResponse(
                agent_id=AgentId.OPS_PLANNER,
                success=True,
                content="You have 3 tasks and 1 meeting today.",
                processing_time_ms=120,
            ),
        ]
        
        result = await conductor.compose_response(intent, responses, sample_context)
        
        assert "Yesterday you mentioned" in result
        assert "3 tasks and 1 meeting" in result
        assert conductor.last_completion_status == CompletionStatus.COMPLETE
    
    @pytest.mark.asyncio
    async def test_compose_partial_success(self, conductor_with_mock_specialists, sample_context):
        """compose_response should handle partial success (some agents fail)."""
        conductor, specialists, mock_bridge = conductor_with_mock_specialists
        
        intent = ClassifiedIntent(
            category=CapabilityCategory.COMMUNICATION,
            type=IntentType.SEND_MESSAGE,
            confidence=0.9,
            entities={},
            raw_message="Send message",
            requires_coordination=True,
            target_agents=[AgentId.MEMORY_CURATOR, AgentId.COMMS_PILOT],
        )
        
        responses = [
            AgentResponse(
                agent_id=AgentId.MEMORY_CURATOR,
                success=True,
                content="Found relevant context for messaging.",
                processing_time_ms=100,
            ),
            AgentResponse(
                agent_id=AgentId.COMMS_PILOT,
                success=False,
                content="",
                error="Permission denied",
                processing_time_ms=50,
            ),
        ]
        
        result = await conductor.compose_response(intent, responses, sample_context)
        
        assert "Found relevant context" in result
        assert conductor.last_completion_status == CompletionStatus.PARTIAL
    
    @pytest.mark.asyncio
    async def test_compose_all_failed(self, conductor_with_mock_specialists, sample_context):
        """compose_response should handle all agents failing."""
        conductor, specialists, mock_bridge = conductor_with_mock_specialists
        
        intent = ClassifiedIntent(
            category=CapabilityCategory.COMMUNICATION,
            type=IntentType.SEND_MESSAGE,
            confidence=0.9,
            entities={},
            raw_message="Send message",
            requires_coordination=False,
            target_agents=[AgentId.COMMS_PILOT],
        )
        
        responses = [
            AgentResponse(
                agent_id=AgentId.COMMS_PILOT,
                success=False,
                content="",
                error="Bridge connection failed",
                processing_time_ms=50,
            ),
        ]
        
        result = await conductor.compose_response(intent, responses, sample_context)
        
        assert "encountered an issue" in result.lower() or "error" in result.lower()
        assert conductor.last_completion_status == CompletionStatus.FAILED
    
    @pytest.mark.asyncio
    async def test_compose_no_responses(self, conductor_with_mock_specialists, sample_context):
        """compose_response should handle empty response list."""
        conductor, specialists, mock_bridge = conductor_with_mock_specialists
        
        intent = ClassifiedIntent(
            category=CapabilityCategory.COMMUNICATION,
            type=IntentType.SEND_MESSAGE,
            confidence=0.9,
            entities={},
            raw_message="Send message",
            requires_coordination=False,
            target_agents=[AgentId.COMMS_PILOT],
        )
        
        responses = []
        
        result = await conductor.compose_response(intent, responses, sample_context)
        
        assert "wasn't able" in result.lower() or "rephrasing" in result.lower()
        assert conductor.last_completion_status == CompletionStatus.FAILED


class TestBaseAgentHandoffTo:
    """Tests for BaseAgent.handoff_to() method."""
    
    def test_handoff_to_creates_correct_request(self, sample_context):
        """handoff_to should create HandoffRequest with correct source/target."""
        from python_agents.agents.comms_pilot import CommsPilotAgent
        
        agent = CommsPilotAgent()
        
        handoff = agent.handoff_to(
            target_agent=AgentId.CONDUCTOR,
            reason=HandoffReason.TASK_CONTINUATION,
            context={"task": "test"},
            message="Returning control to conductor",
            agent_context=sample_context,
        )
        
        assert isinstance(handoff, HandoffRequest)
        assert handoff.source_agent == AgentId.COMMS_PILOT
        assert handoff.target_agent == AgentId.CONDUCTOR
        assert handoff.reason == HandoffReason.TASK_CONTINUATION
        assert handoff.context == {"task": "test"}
        assert handoff.message == "Returning control to conductor"
    
    def test_handoff_to_sets_waiting_status(self, sample_context):
        """handoff_to should set agent status to WAITING_FOR_HANDOFF."""
        from python_agents.agents.comms_pilot import CommsPilotAgent
        
        agent = CommsPilotAgent()
        assert agent.status == AgentStatus.IDLE
        
        agent.handoff_to(
            target_agent=AgentId.CONDUCTOR,
            reason=HandoffReason.TASK_CONTINUATION,
            agent_context=sample_context,
        )
        
        assert agent.status == AgentStatus.WAITING_FOR_HANDOFF
    
    def test_handoff_to_invalid_target_raises(self, sample_context):
        """handoff_to should raise ValueError for invalid target."""
        from python_agents.agents.comms_pilot import CommsPilotAgent
        
        agent = CommsPilotAgent()
        
        agent.handoff_targets = [AgentId.CONDUCTOR]
        
        with pytest.raises(ValueError) as exc_info:
            agent.handoff_to(
                target_agent=AgentId.OPS_PLANNER,
                reason=HandoffReason.CAPABILITY_REQUIRED,
                agent_context=sample_context,
            )
        
        assert "cannot hand off" in str(exc_info.value).lower()
    
    def test_complete_handoff_resets_status(self, sample_context):
        """complete_handoff should reset agent status to IDLE."""
        from python_agents.agents.comms_pilot import CommsPilotAgent
        
        agent = CommsPilotAgent()
        agent.status = AgentStatus.WAITING_FOR_HANDOFF
        
        handoff_request = HandoffRequest(
            source_agent=AgentId.COMMS_PILOT,
            target_agent=AgentId.CONDUCTOR,
            reason=HandoffReason.TASK_CONTINUATION,
            context={},
            message="Test",
        )
        
        agent.complete_handoff(handoff_request, success=True, agent_context=sample_context)
        
        assert agent.status == AgentStatus.IDLE


class TestBridgeInjection:
    """Tests for verifying mock bridge injection works correctly."""
    
    @pytest.mark.asyncio
    async def test_inject_bridge_directly(self, mock_bridge, sample_context):
        """Directly injecting _bridge should work for tool execution."""
        from python_agents.agents.comms_pilot import CommsPilotAgent
        
        agent = CommsPilotAgent()
        agent._bridge = mock_bridge
        
        result = await agent.execute_bridge_tool(
            "get_daily_checkin_status",
            {},
            sample_context
        )
        
        assert result["success"] is True
        assert "config" in result
    
    @pytest.mark.asyncio
    async def test_inject_bridge_fixture(self, inject_bridge_into_agent, sample_context):
        """inject_bridge_into_agent fixture should properly inject mock bridge."""
        from python_agents.agents.ops_planner import OpsPlannerAgent
        
        agent = OpsPlannerAgent()
        inject_bridge_into_agent(agent)
        
        result = await agent.execute_bridge_tool(
            "list_tasks",
            {},
            sample_context
        )
        
        assert result["success"] is True
        assert "tasks" in result
    
    @pytest.mark.asyncio
    async def test_patched_agent_bridge_fixture(self, patched_agent_bridge, sample_context):
        """patched_agent_bridge fixture should patch get_bridge globally."""
        from python_agents.agents.comms_pilot import CommsPilotAgent
        
        agent = CommsPilotAgent()
        
        result = await agent.execute_bridge_tool(
            "send_sms",
            {"phone_number": "+15551234567", "message": "Test"},
            sample_context
        )
        
        assert result["success"] is True
        assert result["messageSid"] == "SM123456789"


class TestExecuteWithAgent:
    """Tests for Conductor.execute_with_agent() method."""
    
    @pytest.mark.asyncio
    async def test_execute_with_registered_agent(self, conductor_with_mock_specialists, mock_openai_agent_runner, sample_context):
        """execute_with_agent should execute with registered specialist."""
        conductor, specialists, mock_bridge = conductor_with_mock_specialists
        mock_run, mock_result = mock_openai_agent_runner
        
        response = await conductor.execute_with_agent(
            AgentId.OPS_PLANNER,
            "Show my tasks",
            sample_context
        )
        
        assert isinstance(response, AgentResponse)
        assert response.agent_id == AgentId.OPS_PLANNER
        assert response.success is True
        assert response.processing_time_ms >= 0
    
    @pytest.mark.asyncio
    async def test_execute_with_unregistered_agent_uses_bridge(self, conductor_with_mock_specialists, sample_context):
        """execute_with_agent should fallback to bridge for unregistered agent."""
        conductor, specialists, mock_bridge = conductor_with_mock_specialists
        
        del conductor.specialist_agents[AgentId.OPS_PLANNER]
        
        response = await conductor.execute_with_agent(
            AgentId.OPS_PLANNER,
            "Show my tasks",
            sample_context
        )
        
        assert isinstance(response, AgentResponse)
        assert response.agent_id == AgentId.OPS_PLANNER


class TestDetermineTargetAgents:
    """Tests for Conductor._determine_target_agents() method."""
    
    def test_communication_includes_safety_auditor(self, conductor_with_mock_specialists):
        """Communication category should include SafetyAuditor."""
        conductor, _, _ = conductor_with_mock_specialists
        
        agents = conductor._determine_target_agents(
            CapabilityCategory.COMMUNICATION,
            IntentType.SEND_MESSAGE,
            requires_coordination=False
        )
        
        assert AgentId.COMMS_PILOT in agents
        assert AgentId.SAFETY_AUDITOR in agents
    
    def test_coordinated_request_starts_with_memory(self, conductor_with_mock_specialists):
        """Coordinated requests should start with MemoryCurator."""
        conductor, _, _ = conductor_with_mock_specialists
        
        agents = conductor._determine_target_agents(
            CapabilityCategory.TASK_MANAGEMENT,
            IntentType.ADD_TASK,
            requires_coordination=True
        )
        
        assert agents[0] == AgentId.MEMORY_CURATOR
    
    def test_specific_intent_mapping_takes_priority(self, conductor_with_mock_specialists):
        """Specific intent-to-agent mapping should take priority."""
        conductor, _, _ = conductor_with_mock_specialists
        
        agents = conductor._determine_target_agents(
            CapabilityCategory.SYSTEM,
            IntentType.HELP,
            requires_coordination=False
        )
        
        assert AgentId.SAFETY_AUDITOR in agents

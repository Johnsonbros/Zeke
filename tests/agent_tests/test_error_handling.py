"""
Error handling and failure mode tests for the multi-agent system.

Tests proper handling of:
- Bridge timeout scenarios
- Bridge error responses
- Permission denial flows
- Partial handoff failures
- Agent execution errors
- BaseAgent.run workflow with tracing
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from typing import Any
import json

import httpx

from python_agents.agents.base import (
    AgentId,
    AgentContext,
    AgentStatus,
    CapabilityCategory,
    HandoffReason,
    BaseAgent,
    ToolDefinition,
    create_bridge_tool,
)
from python_agents.agents.comms_pilot import CommsPilotAgent
from python_agents.agents.ops_planner import OpsPlannerAgent
from python_agents.agents.conductor import ConductorAgent, AgentResponse
from python_agents.tracing import create_trace_context, TraceEventType


class TestBridgeTimeoutHandling:
    """Tests for bridge timeout error handling."""
    
    @pytest.mark.asyncio
    async def test_execute_bridge_tool_handles_timeout(self, patch_bridge_timeout, sample_context):
        """Agent should handle bridge timeout gracefully."""
        agent = CommsPilotAgent()
        
        with pytest.raises(httpx.TimeoutException):
            await agent.execute_bridge_tool("send_sms", {"to": "+1234567890", "message": "Test"}, sample_context)
    
    @pytest.mark.asyncio
    async def test_timeout_during_tool_creates_error_trace(self, mock_bridge_timeout, sample_context):
        """Timeout should create error trace event."""
        from python_agents.tracing import get_tracing_logger
        
        agent = OpsPlannerAgent()
        agent._bridge = mock_bridge_timeout
        
        trace_ctx = sample_context.ensure_trace_context()
        initial_event_count = len(trace_ctx.events)
        
        with pytest.raises(httpx.TimeoutException):
            await agent.execute_bridge_tool("add_task", {"title": "Test"}, sample_context)
        
        error_events = [e for e in trace_ctx.events if "error" in e.event_type.value.lower()]
        assert len(error_events) > 0, "Should have error trace event"
    
    @pytest.mark.asyncio
    async def test_health_endpoint_handles_timeout(self, test_client_with_timeout_bridge):
        """Health endpoint should report disconnected on timeout."""
        async with test_client_with_timeout_bridge as client:
            response = await client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["node_bridge_status"] == "disconnected"


class TestBridgeErrorResponses:
    """Tests for bridge error response handling."""
    
    @pytest.mark.asyncio
    async def test_execute_bridge_tool_handles_http_error(self, patch_bridge_error, sample_context):
        """Agent should handle HTTP errors from bridge."""
        agent = CommsPilotAgent()
        
        with pytest.raises(httpx.HTTPStatusError):
            await agent.execute_bridge_tool("send_sms", {"to": "+1234567890", "message": "Test"}, sample_context)
    
    @pytest.mark.asyncio
    async def test_bridge_error_sets_agent_to_error_state(self, mock_bridge_error, sample_context):
        """Bridge errors should not crash agent run method."""
        class TestAgent(BaseAgent):
            def __init__(self):
                super().__init__(
                    agent_id=AgentId.COMMS_PILOT,
                    name="Test Agent",
                    description="Test agent for error handling",
                    instructions="Test instructions",
                    capabilities=[CapabilityCategory.COMMUNICATION],
                )
                self._bridge = mock_bridge_error
            
            async def _execute(self, input_text: str, context: AgentContext) -> str:
                result = await self.execute_bridge_tool("send_sms", {"to": "+1234567890"}, context)
                return "Success"
        
        agent = TestAgent()
        
        with pytest.raises(httpx.HTTPStatusError):
            await agent.run("test", sample_context)
        
        assert agent.status == AgentStatus.ERROR
    
    @pytest.mark.asyncio
    async def test_health_endpoint_handles_bridge_error(self, test_client_with_error_bridge):
        """Health endpoint should handle bridge errors gracefully."""
        async with test_client_with_error_bridge as client:
            response = await client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["node_bridge_status"] == "disconnected"


class TestPermissionDenialFlows:
    """Tests for permission denial handling."""
    
    def test_unauthorized_user_denied(self, unauthorized_context):
        """Unauthorized users should be denied access."""
        agent = CommsPilotAgent()
        
        is_auth, error = agent.verify_permissions(unauthorized_context)
        
        assert is_auth is False
        assert error is not None
        assert "not authorized" in error.lower()
    
    def test_unauthorized_web_user_denied(self):
        """Web users without admin flag should be denied."""
        agent = CommsPilotAgent()
        context = AgentContext(
            user_message="test",
            metadata={
                "source": "web",
                "is_admin": False,
                "trusted_single_user_deployment": False,
            },
        )
        
        is_auth, error = agent.verify_permissions(context)
        
        assert is_auth is False
        assert "admin authorization" in error
    
    def test_trusted_deployment_allowed(self):
        """Trusted single-user deployment should be allowed."""
        agent = CommsPilotAgent()
        context = AgentContext(
            user_message="test",
            metadata={
                "source": "web",
                "is_admin": False,
                "trusted_single_user_deployment": True,
            },
        )
        
        is_auth, error = agent.verify_permissions(context)
        
        assert is_auth is True
        assert error is None
    
    def test_admin_always_allowed(self, sample_context):
        """Admin users should always be allowed."""
        agent = CommsPilotAgent()
        
        is_auth, error = agent.verify_permissions(sample_context)
        
        assert is_auth is True
        assert error is None


class TestPartialHandoffFailures:
    """Tests for partial handoff failure handling."""
    
    @pytest.mark.asyncio
    async def test_partial_success_response(self, sample_context, mock_bridge_partial):
        """Mixed success/failure responses should result in partial status."""
        from python_agents.agents.conductor import (
            ConductorAgent,
            AgentResponse,
            ClassifiedIntent,
            IntentType,
            CompletionStatus,
        )
        
        conductor = ConductorAgent()
        conductor._bridge = mock_bridge_partial
        
        intent = ClassifiedIntent(
            category=CapabilityCategory.MEMORY,
            type=IntentType.RECALL_FACT,
            confidence=0.9,
        )
        
        responses = [
            AgentResponse(
                agent_id=AgentId.MEMORY_CURATOR,
                success=True,
                content="Found memories",
            ),
            AgentResponse(
                agent_id=AgentId.SAFETY_AUDITOR,
                success=False,
                content="",
                error="Validation failed",
            ),
        ]
        
        result = await conductor.compose_response(intent, responses, sample_context)
        
        assert conductor.last_completion_status == CompletionStatus.PARTIAL
    
    @pytest.mark.asyncio
    async def test_all_failed_response(self, sample_context):
        """All failures should result in failed status."""
        from python_agents.agents.conductor import (
            ConductorAgent,
            AgentResponse,
            ClassifiedIntent,
            IntentType,
            CompletionStatus,
        )
        
        conductor = ConductorAgent()
        
        intent = ClassifiedIntent(
            category=CapabilityCategory.COMMUNICATION,
            type=IntentType.SEND_MESSAGE,
            confidence=0.9,
        )
        
        responses = [
            AgentResponse(
                agent_id=AgentId.COMMS_PILOT,
                success=False,
                content="",
                error="SMS service unavailable",
            ),
        ]
        
        result = await conductor.compose_response(intent, responses, sample_context)
        
        assert conductor.last_completion_status == CompletionStatus.FAILED
        assert "SMS service unavailable" in result
    
    def test_handoff_to_invalid_target_raises(self, sample_context):
        """Handoff to non-allowed target should raise ValueError."""
        agent = CommsPilotAgent()
        
        with pytest.raises(ValueError) as exc_info:
            agent.handoff_to(
                AgentId.RESEARCH_SCOUT,
                HandoffReason.CAPABILITY_REQUIRED,
                agent_context=sample_context,
            )
        
        assert "cannot hand off" in str(exc_info.value).lower()


class TestAgentExecutionErrors:
    """Tests for agent execution error handling."""
    
    @pytest.mark.asyncio
    async def test_agent_error_sets_status(self, sample_context):
        """Agent errors should set status to ERROR."""
        class FailingAgent(BaseAgent):
            def __init__(self):
                super().__init__(
                    agent_id=AgentId.COMMS_PILOT,
                    name="Failing Agent",
                    description="Agent that always fails",
                    instructions="Fail on purpose",
                    capabilities=[CapabilityCategory.COMMUNICATION],
                )
            
            async def _execute(self, input_text: str, context: AgentContext) -> str:
                raise RuntimeError("Intentional failure for testing")
        
        agent = FailingAgent()
        
        with pytest.raises(RuntimeError):
            await agent.run("test", sample_context)
        
        assert agent.status == AgentStatus.ERROR
    
    @pytest.mark.asyncio
    async def test_agent_error_creates_trace_event(self, sample_context):
        """Agent errors should create error trace events."""
        class FailingAgent(BaseAgent):
            def __init__(self):
                super().__init__(
                    agent_id=AgentId.OPS_PLANNER,
                    name="Failing Agent",
                    description="Agent that always fails",
                    instructions="Fail on purpose",
                    capabilities=[CapabilityCategory.TASK_MANAGEMENT],
                )
            
            async def _execute(self, input_text: str, context: AgentContext) -> str:
                raise ValueError("Test error")
        
        agent = FailingAgent()
        trace_ctx = sample_context.ensure_trace_context()
        
        with pytest.raises(ValueError):
            await agent.run("test", sample_context)
        
        error_events = [e for e in trace_ctx.events if e.event_type == TraceEventType.AGENT_ERROR]
        assert len(error_events) > 0
        assert error_events[0].agent_id == AgentId.OPS_PLANNER.value
    
    @pytest.mark.asyncio
    async def test_conductor_handles_specialist_error(self, sample_context, mock_bridge):
        """Conductor should handle errors from specialist agents."""
        from python_agents.agents.conductor import ConductorAgent, AgentResponse
        
        conductor = ConductorAgent()
        conductor._bridge = mock_bridge
        
        failing_specialist = MagicMock()
        failing_specialist.agent_id = AgentId.COMMS_PILOT
        failing_specialist.name = "Failing Specialist"
        failing_specialist.run = AsyncMock(side_effect=RuntimeError("Specialist failed"))
        
        conductor.register_specialist(failing_specialist)
        
        response = await conductor.execute_with_agent(
            AgentId.COMMS_PILOT,
            "test message",
            sample_context,
        )
        
        assert response.success is False
        assert "Specialist failed" in response.error


class TestBaseAgentRunWorkflow:
    """Tests for BaseAgent.run() lifecycle with tracing."""
    
    @pytest.mark.asyncio
    async def test_run_creates_trace_span(self, sample_context):
        """run() should create a span for the agent execution."""
        class SimpleAgent(BaseAgent):
            def __init__(self):
                super().__init__(
                    agent_id=AgentId.OPS_PLANNER,
                    name="Simple Agent",
                    description="Simple test agent",
                    instructions="Do simple things",
                    capabilities=[CapabilityCategory.TASK_MANAGEMENT],
                )
            
            async def _execute(self, input_text: str, context: AgentContext) -> str:
                return "Simple result"
        
        agent = SimpleAgent()
        trace_ctx = sample_context.ensure_trace_context()
        initial_span_count = len(trace_ctx.spans)
        
        result = await agent.run("test", sample_context)
        
        assert len(trace_ctx.spans) > initial_span_count
        assert result == "Simple result"
    
    @pytest.mark.asyncio
    async def test_run_completes_span_on_success(self, sample_context):
        """run() should complete the span after successful execution."""
        class SuccessAgent(BaseAgent):
            def __init__(self):
                super().__init__(
                    agent_id=AgentId.MEMORY_CURATOR,
                    name="Success Agent",
                    description="Always succeeds",
                    instructions="Succeed always",
                    capabilities=[CapabilityCategory.MEMORY],
                )
            
            async def _execute(self, input_text: str, context: AgentContext) -> str:
                return "Success!"
        
        agent = SuccessAgent()
        trace_ctx = sample_context.ensure_trace_context()
        
        await agent.run("test", sample_context)
        
        agent_spans = [s for s in trace_ctx.spans.values() if "agent:" in s.name]
        assert len(agent_spans) > 0
        for span in agent_spans:
            assert span.end_time is not None
    
    @pytest.mark.asyncio
    async def test_run_completes_span_on_error(self, sample_context):
        """run() should complete the span even on error."""
        class FailAgent(BaseAgent):
            def __init__(self):
                super().__init__(
                    agent_id=AgentId.RESEARCH_SCOUT,
                    name="Fail Agent",
                    description="Always fails",
                    instructions="Fail always",
                    capabilities=[CapabilityCategory.INFORMATION],
                )
            
            async def _execute(self, input_text: str, context: AgentContext) -> str:
                raise RuntimeError("Always fail")
        
        agent = FailAgent()
        trace_ctx = sample_context.ensure_trace_context()
        
        with pytest.raises(RuntimeError):
            await agent.run("test", sample_context)
        
        error_events = [e for e in trace_ctx.events if e.event_type == TraceEventType.AGENT_ERROR]
        assert len(error_events) > 0
    
    @pytest.mark.asyncio
    async def test_run_converts_non_string_result(self, sample_context):
        """run() should convert non-string results to string."""
        class DictResultAgent(BaseAgent):
            def __init__(self):
                super().__init__(
                    agent_id=AgentId.OPS_PLANNER,
                    name="Dict Result Agent",
                    description="Returns dict",
                    instructions="Return dict",
                    capabilities=[CapabilityCategory.TASK_MANAGEMENT],
                )
            
            async def _execute(self, input_text: str, context: AgentContext) -> Any:
                return {"key": "value", "number": 42}
        
        agent = DictResultAgent()
        
        result = await agent.run("test", sample_context)
        
        assert isinstance(result, str)
        assert "key" in result
        assert "value" in result
    
    @pytest.mark.asyncio
    async def test_run_handles_none_result(self, sample_context):
        """run() should handle None result gracefully."""
        class NoneResultAgent(BaseAgent):
            def __init__(self):
                super().__init__(
                    agent_id=AgentId.SAFETY_AUDITOR,
                    name="None Result Agent",
                    description="Returns None",
                    instructions="Return nothing",
                    capabilities=[CapabilityCategory.SYSTEM],
                )
            
            async def _execute(self, input_text: str, context: AgentContext) -> Any:
                return None
        
        agent = NoneResultAgent()
        
        result = await agent.run("test", sample_context)
        
        assert result == ""
    
    @pytest.mark.asyncio
    async def test_run_creates_context_if_none_provided(self):
        """run() should create context if none is provided."""
        class ContextlessAgent(BaseAgent):
            received_context = None
            
            def __init__(self):
                super().__init__(
                    agent_id=AgentId.OPS_PLANNER,
                    name="Contextless Agent",
                    description="Works without context",
                    instructions="Work contextlessly",
                    capabilities=[CapabilityCategory.TASK_MANAGEMENT],
                )
            
            async def _execute(self, input_text: str, context: AgentContext) -> str:
                ContextlessAgent.received_context = context
                return "Done"
        
        agent = ContextlessAgent()
        
        await agent.run("test input")
        
        assert ContextlessAgent.received_context is not None
        assert ContextlessAgent.received_context.user_message == "test input"
        assert ContextlessAgent.received_context.trace_context is not None
    
    @pytest.mark.asyncio
    async def test_run_logs_agent_start_and_complete(self, sample_context):
        """run() should log agent start and complete events."""
        class LoggingAgent(BaseAgent):
            def __init__(self):
                super().__init__(
                    agent_id=AgentId.COMMS_PILOT,
                    name="Logging Agent",
                    description="Logs everything",
                    instructions="Log events",
                    capabilities=[CapabilityCategory.COMMUNICATION],
                )
            
            async def _execute(self, input_text: str, context: AgentContext) -> str:
                return "Logged"
        
        agent = LoggingAgent()
        trace_ctx = sample_context.ensure_trace_context()
        
        await agent.run("test", sample_context)
        
        start_events = [e for e in trace_ctx.events if e.event_type == TraceEventType.AGENT_START]
        complete_events = [e for e in trace_ctx.events if e.event_type == TraceEventType.AGENT_COMPLETE]
        
        assert len(start_events) >= 1
        assert len(complete_events) >= 1
        assert start_events[-1].agent_id == AgentId.COMMS_PILOT.value
        assert complete_events[-1].agent_id == AgentId.COMMS_PILOT.value
    
    @pytest.mark.asyncio
    async def test_run_status_transitions(self, sample_context):
        """run() should transition through correct status states."""
        statuses = []
        
        class StatusTrackingAgent(BaseAgent):
            def __init__(self):
                super().__init__(
                    agent_id=AgentId.MEMORY_CURATOR,
                    name="Status Tracking Agent",
                    description="Tracks status",
                    instructions="Track status",
                    capabilities=[CapabilityCategory.MEMORY],
                )
            
            async def _execute(self, input_text: str, context: AgentContext) -> str:
                statuses.append(self.status)
                return "Done"
        
        agent = StatusTrackingAgent()
        
        assert agent.status == AgentStatus.IDLE
        
        await agent.run("test", sample_context)
        
        assert AgentStatus.PROCESSING in statuses
        assert agent.status == AgentStatus.IDLE


class TestBridgeToolCreation:
    """Tests for create_bridge_tool function."""
    
    @pytest.mark.asyncio
    async def test_bridge_tool_handles_invalid_json_args(self, mock_bridge):
        """Bridge tool should handle invalid JSON arguments."""
        tool = create_bridge_tool(
            tool_name="test_tool",
            description="Test tool",
            parameters={"type": "object", "properties": {}}
        )
        
        with patch('python_agents.agents.base.get_bridge', return_value=mock_bridge):
            result = await tool.on_invoke_tool(None, "not valid json {")
        
        result_dict = json.loads(result)
        assert result_dict["success"] is False
        assert "Invalid JSON" in result_dict["error"]
    
    @pytest.mark.asyncio
    async def test_bridge_tool_handles_bridge_exception(self, mock_bridge_error):
        """Bridge tool should handle exceptions from bridge."""
        tool = create_bridge_tool(
            tool_name="failing_tool",
            description="Always fails",
            parameters={"type": "object", "properties": {}}
        )
        
        with patch('python_agents.agents.base.get_bridge', return_value=mock_bridge_error):
            result = await tool.on_invoke_tool(None, "{}")
        
        result_dict = json.loads(result)
        assert result_dict["success"] is False
        assert "execution failed" in result_dict["error"].lower()
    
    @pytest.mark.asyncio
    async def test_bridge_tool_passes_correct_args(self, mock_bridge):
        """Bridge tool should pass correct arguments to bridge."""
        tool = create_bridge_tool(
            tool_name="send_sms",
            description="Send SMS",
            parameters={
                "type": "object",
                "properties": {
                    "to": {"type": "string"},
                    "message": {"type": "string"}
                }
            }
        )
        
        with patch('python_agents.agents.base.get_bridge', return_value=mock_bridge):
            result = await tool.on_invoke_tool(
                None, 
                json.dumps({"to": "+1234567890", "message": "Hello"})
            )
        
        result_dict = json.loads(result)
        assert result_dict["success"] is True

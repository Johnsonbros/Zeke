"""
Tests for specialist agents.

Tests agent initialization, tool registration, and permission checking.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import json

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
from python_agents.agents.comms_pilot import CommsPilotAgent, get_comms_pilot
from python_agents.agents.ops_planner import OpsPlannerAgent
from python_agents.agents.research_scout import ResearchScoutAgent, get_research_scout
from python_agents.agents.memory_curator import MemoryCuratorAgent
from python_agents.agents.safety_auditor import SafetyAuditorAgent


class TestCommsPilotAgent:
    """Tests for CommsPilotAgent."""
    
    def test_initialization(self):
        """CommsPilotAgent should initialize with correct attributes."""
        agent = CommsPilotAgent()
        
        assert agent.agent_id == AgentId.COMMS_PILOT
        assert agent.name == "Communications Pilot"
        assert CapabilityCategory.COMMUNICATION in agent.capabilities
    
    def test_tool_count(self):
        """CommsPilotAgent should have expected number of tools."""
        agent = CommsPilotAgent()
        
        tool_names = [t.name for t in agent._tool_definitions]
        expected_tools = [
            "send_sms",
            "configure_daily_checkin",
            "get_daily_checkin_status",
            "stop_daily_checkin",
            "send_checkin_now",
        ]
        
        assert len(agent._tool_definitions) == len(expected_tools)
        for expected in expected_tools:
            assert expected in tool_names, f"Missing tool: {expected}"
    
    def test_handoff_targets(self):
        """CommsPilotAgent should have correct handoff targets."""
        agent = CommsPilotAgent()
        
        assert AgentId.CONDUCTOR in agent.handoff_targets
        assert AgentId.SAFETY_AUDITOR in agent.handoff_targets
    
    def test_verify_permissions_admin(self, sample_context):
        """Admin users should have permission."""
        agent = CommsPilotAgent()
        
        is_auth, error = agent.verify_permissions(sample_context)
        
        assert is_auth is True
        assert error is None
    
    def test_verify_permissions_trusted_deployment(self):
        """Trusted single-user deployment should have permission."""
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
    
    def test_verify_permissions_sms_admin(self, sms_context):
        """SMS sender with admin flag should have permission."""
        agent = CommsPilotAgent()
        
        is_auth, error = agent.verify_permissions(sms_context)
        
        assert is_auth is True
        assert error is None
    
    def test_verify_permissions_unauthorized_sms(self, unauthorized_context):
        """Unauthorized SMS sender should be denied."""
        agent = CommsPilotAgent()
        
        is_auth, error = agent.verify_permissions(unauthorized_context)
        
        assert is_auth is False
        assert "not authorized" in error
    
    def test_verify_permissions_unauthorized_web(self):
        """Unauthorized web user should be denied."""
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
    
    def test_should_handoff_to_safety_sms_source(self, sms_context):
        """SMS requests should trigger safety handoff."""
        agent = CommsPilotAgent()
        
        result = agent.should_handoff_to_safety(sms_context)
        
        assert result is True
    
    def test_should_handoff_to_safety_non_admin(self):
        """Non-admin should trigger safety handoff."""
        agent = CommsPilotAgent()
        context = AgentContext(
            user_message="test",
            metadata={"is_admin": False},
        )
        
        result = agent.should_handoff_to_safety(context)
        
        assert result is True
    
    def test_should_handoff_to_safety_with_phone(self):
        """Requests with phone numbers should trigger safety handoff."""
        agent = CommsPilotAgent()
        context = AgentContext(
            user_message="test",
            phone_number="+15551234567",
        )
        
        result = agent.should_handoff_to_safety(context)
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_send_sms_success(self, mock_bridge):
        """send_sms() should return success result."""
        agent = CommsPilotAgent()
        agent._bridge = mock_bridge
        
        result = await agent.send_sms("+15551234567", "Hello!")
        
        assert result.success is True
        assert result.to == "+15551234567"
        assert result.message_sid is not None
    
    @pytest.mark.asyncio
    async def test_get_checkin_status(self, mock_bridge):
        """get_checkin_status() should return config."""
        agent = CommsPilotAgent()
        agent._bridge = mock_bridge
        
        result = await agent.get_checkin_status()
        
        assert result.enabled is True
        assert result.time == "09:00"
    
    def test_singleton_pattern(self):
        """get_comms_pilot() should return singleton."""
        import python_agents.agents.comms_pilot as module
        module._comms_pilot_instance = None
        
        agent1 = get_comms_pilot()
        agent2 = get_comms_pilot()
        
        assert agent1 is agent2


class TestOpsPlannerAgent:
    """Tests for OpsPlannerAgent."""
    
    def test_initialization(self):
        """OpsPlannerAgent should initialize with correct attributes."""
        agent = OpsPlannerAgent()
        
        assert agent.agent_id == AgentId.OPS_PLANNER
        assert agent.name == "Operations Planner"
        assert CapabilityCategory.SCHEDULING in agent.capabilities
        assert CapabilityCategory.TASK_MANAGEMENT in agent.capabilities
        assert CapabilityCategory.GROCERY in agent.capabilities
    
    def test_tool_count(self):
        """OpsPlannerAgent should have all expected tools."""
        agent = OpsPlannerAgent()
        
        tool_names = [t.name for t in agent._tool_definitions]
        
        task_tools = ["add_task", "list_tasks", "update_task", "complete_task", "delete_task", "clear_completed_tasks"]
        reminder_tools = ["set_reminder", "list_reminders", "cancel_reminder"]
        calendar_tools = ["get_calendar_events", "get_today_events", "get_upcoming_events", 
                         "create_calendar_event", "update_calendar_event", "delete_calendar_event"]
        grocery_tools = ["add_grocery_item", "list_grocery_items", "mark_grocery_purchased",
                        "remove_grocery_item", "clear_purchased_groceries", "clear_all_groceries"]
        utility_tools = ["get_current_time", "get_weather"]
        
        expected_tools = task_tools + reminder_tools + calendar_tools + grocery_tools + utility_tools
        
        for expected in expected_tools:
            assert expected in tool_names, f"Missing tool: {expected}"
    
    def test_handoff_targets(self):
        """OpsPlannerAgent should have correct handoff targets."""
        agent = OpsPlannerAgent()
        
        assert AgentId.CONDUCTOR in agent.handoff_targets
        assert AgentId.MEMORY_CURATOR in agent.handoff_targets


class TestResearchScoutAgent:
    """Tests for ResearchScoutAgent."""
    
    def test_initialization(self):
        """ResearchScoutAgent should initialize with correct attributes."""
        agent = ResearchScoutAgent()
        
        assert agent.agent_id == AgentId.RESEARCH_SCOUT
        assert agent.name == "ResearchScout"
        assert CapabilityCategory.INFORMATION in agent.capabilities
    
    def test_tool_count(self):
        """ResearchScoutAgent should have search tools."""
        agent = ResearchScoutAgent()
        
        tool_names = [t.name for t in agent._tool_definitions]
        expected_tools = ["web_search", "perplexity_search"]
        
        assert len(agent._tool_definitions) == len(expected_tools)
        for expected in expected_tools:
            assert expected in tool_names, f"Missing tool: {expected}"
    
    def test_handoff_targets(self):
        """ResearchScoutAgent should have correct handoff targets."""
        agent = ResearchScoutAgent()
        
        assert AgentId.CONDUCTOR in agent.handoff_targets
        assert AgentId.MEMORY_CURATOR in agent.handoff_targets
    
    def test_singleton_pattern(self):
        """get_research_scout() should return singleton."""
        import python_agents.agents.research_scout as module
        module._research_scout_instance = None
        
        agent1 = get_research_scout()
        agent2 = get_research_scout()
        
        assert agent1 is agent2


class TestMemoryCuratorAgent:
    """Tests for MemoryCuratorAgent."""
    
    def test_initialization(self):
        """MemoryCuratorAgent should initialize with correct attributes."""
        agent = MemoryCuratorAgent()
        
        assert agent.agent_id == AgentId.MEMORY_CURATOR
        assert agent.name == "Memory Curator"
        assert CapabilityCategory.MEMORY in agent.capabilities
    
    def test_tool_count(self):
        """MemoryCuratorAgent should have memory tools."""
        agent = MemoryCuratorAgent()
        
        tool_names = [t.name for t in agent._tool_definitions]
        expected_tools = ["search_lifelogs", "get_recent_lifelogs", "get_lifelog_context", "check_limitless_status"]
        
        assert len(agent._tool_definitions) == len(expected_tools)
        for expected in expected_tools:
            assert expected in tool_names, f"Missing tool: {expected}"
    
    def test_handoff_targets(self):
        """MemoryCuratorAgent should have correct handoff targets."""
        agent = MemoryCuratorAgent()
        
        assert AgentId.CONDUCTOR in agent.handoff_targets


class TestSafetyAuditorAgent:
    """Tests for SafetyAuditorAgent."""
    
    def test_initialization(self):
        """SafetyAuditorAgent should initialize with correct attributes."""
        agent = SafetyAuditorAgent()
        
        assert agent.agent_id == AgentId.SAFETY_AUDITOR
        assert agent.name == "SafetyAuditor"
        assert CapabilityCategory.SYSTEM in agent.capabilities
    
    def test_handoff_targets(self):
        """SafetyAuditorAgent should have correct handoff targets."""
        agent = SafetyAuditorAgent()
        
        assert AgentId.CONDUCTOR in agent.handoff_targets


class TestBaseAgent:
    """Tests for BaseAgent base class functionality."""
    
    def test_agent_status_default(self):
        """Agent should start with IDLE status."""
        agent = CommsPilotAgent()
        
        assert agent.status == AgentStatus.IDLE
    
    def test_can_handle_capability_true(self):
        """can_handle_capability() should return True for owned capabilities."""
        agent = CommsPilotAgent()
        
        assert agent.can_handle_capability(CapabilityCategory.COMMUNICATION) is True
    
    def test_can_handle_capability_false(self):
        """can_handle_capability() should return False for unowned capabilities."""
        agent = CommsPilotAgent()
        
        assert agent.can_handle_capability(CapabilityCategory.SCHEDULING) is False
    
    def test_to_dict(self):
        """to_dict() should serialize agent correctly."""
        agent = CommsPilotAgent()
        
        result = agent.to_dict()
        
        assert result["agent_id"] == "comms_pilot"
        assert result["name"] == "Communications Pilot"
        assert "communication" in result["capabilities"]
        assert len(result["tools"]) > 0
        assert result["status"] == "idle"
    
    def test_handoff_to_valid_target(self, sample_context):
        """handoff_to() should work for valid targets."""
        agent = CommsPilotAgent()
        
        handoff = agent.handoff_to(
            AgentId.SAFETY_AUDITOR,
            HandoffReason.SAFETY_CHECK,
            {"message": "needs verification"},
            "Permission check required",
        )
        
        assert handoff.source_agent == AgentId.COMMS_PILOT
        assert handoff.target_agent == AgentId.SAFETY_AUDITOR
        assert handoff.reason == HandoffReason.SAFETY_CHECK
        assert agent.status == AgentStatus.WAITING_FOR_HANDOFF
    
    def test_handoff_to_invalid_target(self, sample_context):
        """handoff_to() should raise error for invalid targets."""
        agent = CommsPilotAgent()
        
        with pytest.raises(ValueError) as exc_info:
            agent.handoff_to(
                AgentId.RESEARCH_SCOUT,  # Not a valid target for CommsPilot
                HandoffReason.CAPABILITY_REQUIRED,
            )
        
        assert "cannot hand off" in str(exc_info.value)
    
    def test_complete_handoff(self, sample_context):
        """complete_handoff() should reset status to IDLE."""
        agent = CommsPilotAgent()
        
        handoff = agent.handoff_to(
            AgentId.SAFETY_AUDITOR,
            HandoffReason.SAFETY_CHECK,
        )
        
        assert agent.status == AgentStatus.WAITING_FOR_HANDOFF
        
        agent.complete_handoff(handoff, success=True, agent_context=sample_context)
        
        assert agent.status == AgentStatus.IDLE
    
    def test_tools_property(self):
        """tools property should return SDK Tool objects."""
        agent = CommsPilotAgent()
        
        tools = agent.tools
        
        assert len(tools) > 0
        for tool in tools:
            assert hasattr(tool, 'name')


class TestToolDefinition:
    """Tests for ToolDefinition dataclass."""
    
    def test_tool_definition_creation(self):
        """ToolDefinition should store all properties."""
        def my_handler(ctx, args):
            return "result"
        
        tool = ToolDefinition(
            name="test_tool",
            description="A test tool",
            parameters={"type": "object", "properties": {}},
            handler=my_handler,
        )
        
        assert tool.name == "test_tool"
        assert tool.description == "A test tool"
        assert tool.handler == my_handler
    
    def test_tool_definition_without_handler(self):
        """ToolDefinition should work without handler."""
        tool = ToolDefinition(
            name="test_tool",
            description="A test tool",
            parameters={"type": "object"},
        )
        
        assert tool.handler is None


class TestCreateBridgeTool:
    """Tests for create_bridge_tool factory function."""
    
    def test_creates_function_tool(self):
        """create_bridge_tool() should return a FunctionTool."""
        tool = create_bridge_tool(
            tool_name="test_tool",
            description="Test tool",
            parameters={"type": "object", "properties": {}},
        )
        
        assert tool.name == "test_tool"
        assert hasattr(tool, 'on_invoke_tool')
    
    @pytest.mark.asyncio
    async def test_bridge_tool_handles_json_args(self, mock_bridge):
        """Bridge tool should handle JSON string arguments."""
        with patch('python_agents.agents.base.get_bridge', return_value=mock_bridge):
            tool = create_bridge_tool(
                tool_name="send_sms",
                description="Send SMS",
                parameters={"type": "object"},
            )
            
            result = await tool.on_invoke_tool(None, '{"phone_number": "+15551234567", "message": "Hi"}')
            
            parsed = json.loads(result)
            assert parsed["success"] is True
    
    @pytest.mark.asyncio
    async def test_bridge_tool_handles_invalid_json(self):
        """Bridge tool should handle invalid JSON gracefully."""
        tool = create_bridge_tool(
            tool_name="test_tool",
            description="Test",
            parameters={"type": "object"},
        )
        
        result = await tool.on_invoke_tool(None, "invalid json {")
        
        parsed = json.loads(result)
        assert parsed["success"] is False
        assert "Invalid JSON" in parsed["error"]


class TestAgentContext:
    """Tests for AgentContext dataclass."""
    
    def test_default_values(self):
        """AgentContext should have correct defaults."""
        ctx = AgentContext(user_message="test")
        
        assert ctx.user_message == "test"
        assert ctx.conversation_id is None
        assert ctx.memory_context == {}
        assert ctx.user_profile == {}
        assert ctx.phone_number is None
        assert ctx.metadata == {}
        assert ctx.trace_context is None
    
    def test_ensure_trace_context_creates_new(self):
        """ensure_trace_context() should create if missing."""
        ctx = AgentContext(user_message="test")
        
        assert ctx.trace_context is None
        
        trace_ctx = ctx.ensure_trace_context()
        
        assert trace_ctx is not None
        assert ctx.trace_context is trace_ctx
    
    def test_ensure_trace_context_returns_existing(self):
        """ensure_trace_context() should return existing."""
        from python_agents.tracing import create_trace_context
        
        existing = create_trace_context()
        ctx = AgentContext(
            user_message="test",
            trace_context=existing,
        )
        
        trace_ctx = ctx.ensure_trace_context()
        
        assert trace_ctx is existing


class TestAgentEdgeCases:
    """Tests for edge cases and error handling."""
    
    @pytest.mark.asyncio
    async def test_tool_handler_empty_args(self, mock_bridge):
        """Tool handlers should handle empty arguments."""
        agent = CommsPilotAgent()
        agent._bridge = mock_bridge
        
        result = await agent._handle_get_daily_checkin_status(None, "{}")
        
        parsed = json.loads(result)
        assert parsed["success"] is True
    
    @pytest.mark.asyncio
    async def test_tool_handler_with_dict_args(self, mock_bridge):
        """Tool handlers should handle dict arguments."""
        agent = CommsPilotAgent()
        agent._bridge = mock_bridge
        
        result = await agent._handle_send_sms(
            None,
            {"phone_number": "+15551234567", "message": "test"},
        )
        
        parsed = json.loads(result)
        assert parsed["success"] is True
    
    @pytest.mark.asyncio
    async def test_execute_permission_denied(self, unauthorized_context, mock_bridge):
        """_execute() should deny unauthorized requests."""
        agent = CommsPilotAgent()
        agent._bridge = mock_bridge
        
        result = await agent._execute("send sms", unauthorized_context)
        
        assert "Permission denied" in result
    
    def test_agent_status_transitions(self):
        """Agent status should transition correctly."""
        agent = CommsPilotAgent()
        
        assert agent.status == AgentStatus.IDLE
        
        agent.status = AgentStatus.PROCESSING
        assert agent.status == AgentStatus.PROCESSING
        
        agent.status = AgentStatus.ERROR
        assert agent.status == AgentStatus.ERROR
        
        agent.status = AgentStatus.IDLE
        assert agent.status == AgentStatus.IDLE

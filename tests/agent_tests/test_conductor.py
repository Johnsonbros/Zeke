"""
Tests for the ConductorAgent.

Tests intent classification, agent routing, handoff chain tracking,
and completion status handling.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from typing import Any

from python_agents.agents.conductor import (
    ConductorAgent,
    IntentType,
    ClassifiedIntent,
    CompletionStatus,
    HandoffStatus,
    HandoffContext,
    AgentResponse,
    INTENT_TO_CATEGORY,
    INTENT_TO_AGENT,
    CAPABILITY_TO_AGENT,
)
from python_agents.agents.base import (
    AgentId,
    AgentContext,
    AgentStatus,
    CapabilityCategory,
    HandoffReason,
)


class TestIntentClassification:
    """Tests for intent classification logic."""
    
    def test_intent_to_category_mapping_complete(self):
        """All IntentTypes should have a category mapping."""
        for intent_type in IntentType:
            assert intent_type in INTENT_TO_CATEGORY, (
                f"IntentType.{intent_type.name} missing from INTENT_TO_CATEGORY"
            )
    
    @pytest.mark.parametrize("intent,expected_category", [
        (IntentType.SEND_MESSAGE, CapabilityCategory.COMMUNICATION),
        (IntentType.CHECK_IN, CapabilityCategory.COMMUNICATION),
        (IntentType.CONTACT_LOOKUP, CapabilityCategory.COMMUNICATION),
        (IntentType.CONFIGURE_CHECKIN, CapabilityCategory.COMMUNICATION),
        (IntentType.CALENDAR_QUERY, CapabilityCategory.SCHEDULING),
        (IntentType.CREATE_EVENT, CapabilityCategory.SCHEDULING),
        (IntentType.SET_REMINDER, CapabilityCategory.SCHEDULING),
        (IntentType.ADD_TASK, CapabilityCategory.TASK_MANAGEMENT),
        (IntentType.VIEW_TASKS, CapabilityCategory.TASK_MANAGEMENT),
        (IntentType.SEARCH, CapabilityCategory.INFORMATION),
        (IntentType.WEATHER, CapabilityCategory.INFORMATION),
        (IntentType.TIME, CapabilityCategory.INFORMATION),
        (IntentType.RECALL_FACT, CapabilityCategory.MEMORY),
        (IntentType.LIFELOG_QUERY, CapabilityCategory.MEMORY),
        (IntentType.ADD_ITEM, CapabilityCategory.GROCERY),
        (IntentType.CHECK_LIST, CapabilityCategory.GROCERY),
        (IntentType.HELP, CapabilityCategory.SYSTEM),
        (IntentType.STATUS_CHECK, CapabilityCategory.SYSTEM),
        (IntentType.UNKNOWN, CapabilityCategory.SYSTEM),
    ])
    def test_intent_maps_to_correct_category(self, intent, expected_category):
        """Each intent should map to its correct category."""
        assert INTENT_TO_CATEGORY[intent] == expected_category


class TestFallbackClassification:
    """Tests for fallback keyword-based classification."""
    
    def setup_method(self):
        """Set up the conductor for each test."""
        self.conductor = ConductorAgent()
    
    @pytest.mark.parametrize("message,expected_category,expected_type", [
        ("text mom that I'm running late", CapabilityCategory.COMMUNICATION, IntentType.SEND_MESSAGE),
        ("send message to dad", CapabilityCategory.COMMUNICATION, IntentType.SEND_MESSAGE),
        ("sms john", CapabilityCategory.COMMUNICATION, IntentType.SEND_MESSAGE),
        ("check-in with me daily", CapabilityCategory.COMMUNICATION, IntentType.CHECK_IN),
        ("what's on my calendar", CapabilityCategory.SCHEDULING, IntentType.CALENDAR_QUERY),
        ("schedule a meeting", CapabilityCategory.SCHEDULING, IntentType.CALENDAR_QUERY),
        ("remind me in 10 minutes", CapabilityCategory.SCHEDULING, IntentType.SET_REMINDER),
        ("show my tasks", CapabilityCategory.TASK_MANAGEMENT, IntentType.VIEW_TASKS),
        ("todo list", CapabilityCategory.TASK_MANAGEMENT, IntentType.VIEW_TASKS),
        ("search for pizza recipes", CapabilityCategory.INFORMATION, IntentType.SEARCH),
        ("find nearby restaurants", CapabilityCategory.INFORMATION, IntentType.SEARCH),
        ("look up phone number", CapabilityCategory.INFORMATION, IntentType.SEARCH),
        ("what's the weather", CapabilityCategory.INFORMATION, IntentType.WEATHER),
        ("what time is it", CapabilityCategory.INFORMATION, IntentType.TIME),
        ("do you remember my birthday", CapabilityCategory.MEMORY, IntentType.RECALL_FACT),
        ("what did I say yesterday", CapabilityCategory.MEMORY, IntentType.RECALL_FACT),
        ("check pendant recordings", CapabilityCategory.MEMORY, IntentType.LIFELOG_QUERY),
        ("buy some bread", CapabilityCategory.GROCERY, IntentType.ADD_ITEM),
        ("what's on the groceries list", CapabilityCategory.GROCERY, IntentType.CHECK_LIST),
        ("update my profile", CapabilityCategory.PROFILE, IntentType.PROFILE_QUERY),
        ("change preference", CapabilityCategory.PROFILE, IntentType.PROFILE_QUERY),
        ("morning brief me", CapabilityCategory.SYSTEM, IntentType.MORNING_BRIEFING),
        ("give me a briefing", CapabilityCategory.SYSTEM, IntentType.MORNING_BRIEFING),
        ("help", CapabilityCategory.SYSTEM, IntentType.HELP),
        ("what can you do", CapabilityCategory.SYSTEM, IntentType.HELP),
        ("status check", CapabilityCategory.SYSTEM, IntentType.STATUS_CHECK),
    ])
    def test_fallback_classification(self, message, expected_category, expected_type):
        """Fallback classification should match keywords correctly."""
        result = self.conductor._fallback_classification(message)
        
        assert result.category == expected_category
        assert result.type == expected_type
        assert result.confidence == 0.6  # Fallback confidence
    
    @pytest.mark.parametrize("message,expected_type,description", [
        ("add task to my list", IntentType.VIEW_TASKS, "task matches before 'add task'"),
        ("search my lifelogs", IntentType.SEARCH, "search matches before lifelog"),
        ("add milk to grocery list", IntentType.CHECK_LIST, "grocery matches before 'add to list'"),
    ])
    def test_fallback_keyword_priority(self, message, expected_type, description):
        """Fallback uses first matching keyword regardless of specificity."""
        result = self.conductor._fallback_classification(message)
        assert result.type == expected_type, f"Expected {expected_type} because {description}"
    
    def test_unknown_fallback_classification(self):
        """Unknown messages should classify as SYSTEM/UNKNOWN."""
        result = self.conductor._fallback_classification("xyz abc random gibberish")
        
        assert result.category == CapabilityCategory.SYSTEM
        assert result.type == IntentType.UNKNOWN
        assert result.confidence == 0.3
        assert AgentId.SAFETY_AUDITOR in result.target_agents


class TestAgentRouting:
    """Tests for agent routing logic."""
    
    def setup_method(self):
        """Set up the conductor for each test."""
        self.conductor = ConductorAgent()
    
    @pytest.mark.parametrize("category,expected_agents", [
        (CapabilityCategory.COMMUNICATION, [AgentId.COMMS_PILOT]),
        (CapabilityCategory.SCHEDULING, [AgentId.OPS_PLANNER]),
        (CapabilityCategory.TASK_MANAGEMENT, [AgentId.OPS_PLANNER]),
        (CapabilityCategory.INFORMATION, [AgentId.RESEARCH_SCOUT]),
        (CapabilityCategory.MEMORY, [AgentId.MEMORY_CURATOR]),
        (CapabilityCategory.GROCERY, [AgentId.OPS_PLANNER]),
        (CapabilityCategory.PROFILE, [AgentId.PERSONAL_DATA_STEWARD]),
    ])
    def test_capability_to_agent_mapping(self, category, expected_agents):
        """Each category should map to the correct primary agent(s)."""
        mapped_agents = CAPABILITY_TO_AGENT.get(category, [])
        for expected_agent in expected_agents:
            assert expected_agent in mapped_agents
    
    @pytest.mark.parametrize("intent_type,expected_agent", [
        (IntentType.HELP, AgentId.SAFETY_AUDITOR),
        (IntentType.STATUS_CHECK, AgentId.SAFETY_AUDITOR),
        (IntentType.UNKNOWN, AgentId.SAFETY_AUDITOR),
        (IntentType.MORNING_BRIEFING, AgentId.OPS_PLANNER),
        (IntentType.SAVE_MEMORY, AgentId.MEMORY_CURATOR),
    ])
    def test_specific_intent_to_agent_mapping(self, intent_type, expected_agent):
        """Specific intent types should route to their designated agent."""
        assert INTENT_TO_AGENT.get(intent_type) == expected_agent
    
    def test_route_to_agent_uses_target_agents(self):
        """route_to_agent() should use target_agents if available."""
        intent = ClassifiedIntent(
            category=CapabilityCategory.COMMUNICATION,
            type=IntentType.SEND_MESSAGE,
            confidence=0.9,
            target_agents=[AgentId.COMMS_PILOT, AgentId.SAFETY_AUDITOR],
        )
        
        result = self.conductor.route_to_agent(intent)
        
        assert result == AgentId.COMMS_PILOT  # First target agent
    
    def test_route_to_agent_uses_intent_mapping(self):
        """route_to_agent() should use INTENT_TO_AGENT when no targets."""
        intent = ClassifiedIntent(
            category=CapabilityCategory.SYSTEM,
            type=IntentType.HELP,
            confidence=0.9,
            target_agents=[],
        )
        
        result = self.conductor.route_to_agent(intent)
        
        assert result == AgentId.SAFETY_AUDITOR
    
    def test_route_to_agent_uses_category_fallback(self):
        """route_to_agent() should fall back to category mapping."""
        intent = ClassifiedIntent(
            category=CapabilityCategory.SCHEDULING,
            type=IntentType.SET_REMINDER,
            confidence=0.9,
            target_agents=[],
        )
        
        result = self.conductor.route_to_agent(intent)
        
        assert result == AgentId.OPS_PLANNER


class TestDetermineTargetAgents:
    """Tests for _determine_target_agents method."""
    
    def setup_method(self):
        """Set up the conductor for each test."""
        self.conductor = ConductorAgent()
    
    def test_coordination_adds_memory_curator_first(self):
        """Coordination requests should start with MemoryCurator."""
        agents = self.conductor._determine_target_agents(
            CapabilityCategory.COMMUNICATION,
            IntentType.SEND_MESSAGE,
            requires_coordination=True,
        )
        
        assert AgentId.MEMORY_CURATOR in agents
        assert agents[0] == AgentId.MEMORY_CURATOR
    
    def test_specific_intent_takes_priority(self):
        """Specific intent mappings should be used first."""
        agents = self.conductor._determine_target_agents(
            CapabilityCategory.SYSTEM,
            IntentType.HELP,
            requires_coordination=False,
        )
        
        assert AgentId.SAFETY_AUDITOR in agents
    
    def test_sensitive_category_adds_safety_auditor(self):
        """Sensitive categories should add SafetyAuditor."""
        for category in [CapabilityCategory.COMMUNICATION, CapabilityCategory.PROFILE, CapabilityCategory.MEMORY]:
            agents = self.conductor._determine_target_agents(
                category,
                IntentType.SEND_MESSAGE if category == CapabilityCategory.COMMUNICATION else IntentType.RECALL_FACT,
                requires_coordination=False,
            )
            
            assert AgentId.SAFETY_AUDITOR in agents, f"SafetyAuditor missing for {category}"
    
    def test_empty_result_defaults_to_conductor(self):
        """Empty result should default to Conductor."""
        with patch.object(self.conductor, '_determine_target_agents') as mock:
            mock.return_value = []
            agents = mock.return_value or [AgentId.CONDUCTOR]
            
            assert AgentId.CONDUCTOR in agents


class TestHandoffChainTracking:
    """Tests for handoff chain tracking."""
    
    def setup_method(self):
        """Set up the conductor for each test."""
        self.conductor = ConductorAgent()
    
    def test_create_handoff_adds_to_chain(self):
        """create_handoff() should add to handoff_chain."""
        intent = ClassifiedIntent(
            category=CapabilityCategory.COMMUNICATION,
            type=IntentType.SEND_MESSAGE,
            confidence=0.9,
            entities={"recipient": "mom"},
            raw_message="text mom",
        )
        context = HandoffContext(
            user_message="text mom",
            conversation_id="conv_123",
        )
        
        handoff = self.conductor.create_handoff(
            AgentId.COMMS_PILOT,
            intent,
            context,
            HandoffReason.CAPABILITY_REQUIRED,
        )
        
        assert len(self.conductor.handoff_chain) == 1
        assert self.conductor.handoff_chain[0] == handoff
        assert handoff.source_agent == AgentId.CONDUCTOR
        assert handoff.target_agent == AgentId.COMMS_PILOT
    
    def test_multiple_handoffs_tracked(self):
        """Multiple handoffs should be tracked in order."""
        intent = ClassifiedIntent(
            category=CapabilityCategory.COMMUNICATION,
            type=IntentType.SEND_MESSAGE,
            confidence=0.9,
        )
        context = HandoffContext(user_message="test")
        
        self.conductor.create_handoff(AgentId.MEMORY_CURATOR, intent, context)
        self.conductor.create_handoff(AgentId.COMMS_PILOT, intent, context)
        self.conductor.create_handoff(AgentId.SAFETY_AUDITOR, intent, context)
        
        assert len(self.conductor.handoff_chain) == 3
        assert self.conductor.handoff_chain[0].target_agent == AgentId.MEMORY_CURATOR
        assert self.conductor.handoff_chain[1].target_agent == AgentId.COMMS_PILOT
        assert self.conductor.handoff_chain[2].target_agent == AgentId.SAFETY_AUDITOR
    
    def test_get_handoff_chain(self):
        """get_handoff_chain() should return chain as dict list."""
        intent = ClassifiedIntent(
            category=CapabilityCategory.SCHEDULING,
            type=IntentType.SET_REMINDER,
            confidence=0.9,
        )
        context = HandoffContext(user_message="remind me")
        
        self.conductor.create_handoff(
            AgentId.OPS_PLANNER,
            intent,
            context,
            HandoffReason.CAPABILITY_REQUIRED,
        )
        
        chain = self.conductor.get_handoff_chain()
        
        assert len(chain) == 1
        assert chain[0]["source"] == "conductor"
        assert chain[0]["target"] == "ops_planner"
        assert chain[0]["reason"] == "capability_required"


class TestCompletionStatus:
    """Tests for completion status handling."""
    
    def setup_method(self):
        """Set up the conductor for each test."""
        self.conductor = ConductorAgent()
    
    @pytest.mark.asyncio
    async def test_compose_response_complete_status(self, sample_context):
        """Successful responses should set COMPLETE status."""
        intent = ClassifiedIntent(
            category=CapabilityCategory.SCHEDULING,
            type=IntentType.VIEW_TASKS,
            confidence=0.9,
        )
        responses = [
            AgentResponse(
                agent_id=AgentId.OPS_PLANNER,
                success=True,
                content="Here are your tasks",
            )
        ]
        
        await self.conductor.compose_response(intent, responses, sample_context)
        
        assert self.conductor.last_completion_status == CompletionStatus.COMPLETE
    
    @pytest.mark.asyncio
    async def test_compose_response_partial_status(self, sample_context):
        """Mixed success should set PARTIAL status."""
        intent = ClassifiedIntent(
            category=CapabilityCategory.MEMORY,
            type=IntentType.RECALL_FACT,
            confidence=0.9,
        )
        responses = [
            AgentResponse(
                agent_id=AgentId.MEMORY_CURATOR,
                success=True,
                content="Found some memories",
            ),
            AgentResponse(
                agent_id=AgentId.SAFETY_AUDITOR,
                success=False,
                content="",
                error="Validation failed",
            )
        ]
        
        await self.conductor.compose_response(intent, responses, sample_context)
        
        assert self.conductor.last_completion_status == CompletionStatus.PARTIAL
    
    @pytest.mark.asyncio
    async def test_compose_response_failed_status(self, sample_context):
        """All failures should set FAILED status."""
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
            )
        ]
        
        result = await self.conductor.compose_response(intent, responses, sample_context)
        
        assert self.conductor.last_completion_status == CompletionStatus.FAILED
        assert "SMS service unavailable" in result
    
    @pytest.mark.asyncio
    async def test_compose_response_no_responses(self, sample_context):
        """No responses should set FAILED status."""
        intent = ClassifiedIntent(
            category=CapabilityCategory.SYSTEM,
            type=IntentType.UNKNOWN,
            confidence=0.3,
        )
        
        result = await self.conductor.compose_response(intent, [], sample_context)
        
        assert self.conductor.last_completion_status == CompletionStatus.FAILED
        assert "No responses" in self.conductor.last_completion_message
    
    def test_get_completion_status_error_state(self):
        """Error status should return FAILED."""
        self.conductor.status = AgentStatus.ERROR
        
        result = self.conductor.get_completion_status()
        
        assert result == CompletionStatus.FAILED
    
    def test_get_completion_status_waiting(self):
        """Waiting for handoff should return HANDED_OFF."""
        self.conductor.status = AgentStatus.WAITING_FOR_HANDOFF
        
        result = self.conductor.get_completion_status()
        
        assert result == CompletionStatus.HANDED_OFF
    
    def test_get_completion_details(self):
        """get_completion_details() should return proper dict."""
        self.conductor.last_completion_status = CompletionStatus.COMPLETE
        self.conductor.last_completion_message = "All 2 agents succeeded"
        self.conductor.handoff_chain = []
        
        details = self.conductor.get_completion_details()
        
        assert details["status"] == "complete"
        assert details["message"] == "All 2 agents succeeded"


class TestConductorAgent:
    """Tests for ConductorAgent class."""
    
    def test_initialization(self):
        """ConductorAgent should initialize with correct attributes."""
        conductor = ConductorAgent()
        
        assert conductor.agent_id == AgentId.CONDUCTOR
        assert conductor.name == "Conductor"
        assert len(conductor.handoff_targets) > 0
        assert AgentId.MEMORY_CURATOR in conductor.handoff_targets
        assert AgentId.COMMS_PILOT in conductor.handoff_targets
    
    def test_register_specialist(self):
        """register_specialist() should add agent to registry."""
        conductor = ConductorAgent()
        
        mock_agent = MagicMock()
        mock_agent.agent_id = AgentId.OPS_PLANNER
        mock_agent.name = "Operations Planner"
        
        conductor.register_specialist(mock_agent)
        
        assert AgentId.OPS_PLANNER in conductor.specialist_agents
        assert conductor.specialist_agents[AgentId.OPS_PLANNER] == mock_agent
    
    @pytest.mark.asyncio
    async def test_execute_with_agent_unregistered(self, sample_context, mock_bridge):
        """execute_with_agent() should handle unregistered agents."""
        conductor = ConductorAgent()
        conductor._bridge = mock_bridge
        
        with patch('python_agents.agents.conductor.get_bridge', return_value=mock_bridge):
            response = await conductor.execute_with_agent(
                AgentId.OPS_PLANNER,
                "add task",
                sample_context,
            )
        
        assert response.agent_id == AgentId.OPS_PLANNER


class TestClassifiedIntent:
    """Tests for ClassifiedIntent dataclass."""
    
    def test_default_values(self):
        """ClassifiedIntent should have correct defaults."""
        intent = ClassifiedIntent(
            category=CapabilityCategory.COMMUNICATION,
            type=IntentType.SEND_MESSAGE,
            confidence=0.9,
        )
        
        assert intent.entities == {}
        assert intent.raw_message == ""
        assert intent.requires_coordination is False
        assert intent.target_agents == []
    
    def test_with_entities(self):
        """ClassifiedIntent should store entities correctly."""
        intent = ClassifiedIntent(
            category=CapabilityCategory.COMMUNICATION,
            type=IntentType.SEND_MESSAGE,
            confidence=0.95,
            entities={
                "recipient": "mom",
                "message_content": "I'll be late",
            },
            raw_message="text mom I'll be late",
            requires_coordination=True,
            target_agents=[AgentId.COMMS_PILOT, AgentId.SAFETY_AUDITOR],
        )
        
        assert intent.entities["recipient"] == "mom"
        assert intent.entities["message_content"] == "I'll be late"
        assert intent.requires_coordination is True
        assert len(intent.target_agents) == 2


class TestAgentResponse:
    """Tests for AgentResponse dataclass."""
    
    def test_successful_response(self):
        """AgentResponse should handle success correctly."""
        response = AgentResponse(
            agent_id=AgentId.OPS_PLANNER,
            success=True,
            content="Task added successfully",
            processing_time_ms=150,
        )
        
        assert response.success is True
        assert response.error is None
        assert response.processing_time_ms == 150
    
    def test_failed_response(self):
        """AgentResponse should handle failure correctly."""
        response = AgentResponse(
            agent_id=AgentId.COMMS_PILOT,
            success=False,
            content="",
            error="Network timeout",
            processing_time_ms=5000,
        )
        
        assert response.success is False
        assert response.error == "Network timeout"


class TestHandoffContext:
    """Tests for HandoffContext dataclass."""
    
    def test_default_values(self):
        """HandoffContext should have correct defaults."""
        context = HandoffContext(user_message="test message")
        
        assert context.user_message == "test message"
        assert context.conversation_id == ""
        assert context.permissions == {}
        assert context.phone_number is None
        assert context.memories == []
        assert context.prior_responses == []
        assert context.metadata == {}
    
    def test_with_prior_responses(self):
        """HandoffContext should store prior responses."""
        prior = AgentResponse(
            agent_id=AgentId.MEMORY_CURATOR,
            success=True,
            content="Found memories",
        )
        
        context = HandoffContext(
            user_message="test",
            prior_responses=[prior],
        )
        
        assert len(context.prior_responses) == 1
        assert context.prior_responses[0].agent_id == AgentId.MEMORY_CURATOR

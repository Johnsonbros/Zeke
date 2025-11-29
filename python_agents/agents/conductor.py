"""
Conductor Agent - Central orchestration agent for ZEKE's multi-agent architecture.

This module implements the Conductor agent that serves as the entry point for all
user interactions. It:
- Classifies user intent using OpenAI function calling
- Routes requests to appropriate specialist agents
- Manages multi-agent workflows and handoffs
- Synthesizes responses from multiple agents
- Handles fallback logic when specialists fail
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any
import logging
import json

from agents import Agent, Runner
from agents.tool import FunctionTool

from .base import (
    BaseAgent,
    AgentId,
    AgentStatus,
    AgentContext,
    CapabilityCategory,
    HandoffRequest,
    HandoffReason,
    ToolDefinition,
    create_bridge_tool,
)
from ..bridge import get_bridge


logger = logging.getLogger(__name__)


class IntentType(str, Enum):
    """Specific intent types within each category."""
    SEND_MESSAGE = "send_message"
    CHECK_IN = "check_in"
    CONTACT_LOOKUP = "contact_lookup"
    CONFIGURE_CHECKIN = "configure_checkin"
    CALENDAR_QUERY = "calendar_query"
    CREATE_EVENT = "create_event"
    UPDATE_EVENT = "update_event"
    DELETE_EVENT = "delete_event"
    SET_REMINDER = "set_reminder"
    CANCEL_REMINDER = "cancel_reminder"
    ADD_TASK = "add_task"
    UPDATE_TASK = "update_task"
    COMPLETE_TASK = "complete_task"
    DELETE_TASK = "delete_task"
    VIEW_TASKS = "view_tasks"
    SEARCH = "search"
    RESEARCH = "research"
    WEATHER = "weather"
    TIME = "time"
    RECALL_FACT = "recall_fact"
    SEARCH_HISTORY = "search_history"
    LIFELOG_QUERY = "lifelog_query"
    SAVE_MEMORY = "save_memory"
    ADD_ITEM = "add_item"
    CHECK_LIST = "check_list"
    MARK_PURCHASED = "mark_purchased"
    REMOVE_ITEM = "remove_item"
    CLEAR_LIST = "clear_list"
    PREFERENCE_UPDATE = "preference_update"
    PROFILE_QUERY = "profile_query"
    READ_FILE = "read_file"
    WRITE_FILE = "write_file"
    MORNING_BRIEFING = "morning_briefing"
    STATUS_CHECK = "status_check"
    HELP = "help"
    UNKNOWN = "unknown"


INTENT_TO_CATEGORY: dict[IntentType, CapabilityCategory] = {
    IntentType.SEND_MESSAGE: CapabilityCategory.COMMUNICATION,
    IntentType.CHECK_IN: CapabilityCategory.COMMUNICATION,
    IntentType.CONTACT_LOOKUP: CapabilityCategory.COMMUNICATION,
    IntentType.CONFIGURE_CHECKIN: CapabilityCategory.COMMUNICATION,
    IntentType.CALENDAR_QUERY: CapabilityCategory.SCHEDULING,
    IntentType.CREATE_EVENT: CapabilityCategory.SCHEDULING,
    IntentType.UPDATE_EVENT: CapabilityCategory.SCHEDULING,
    IntentType.DELETE_EVENT: CapabilityCategory.SCHEDULING,
    IntentType.SET_REMINDER: CapabilityCategory.SCHEDULING,
    IntentType.CANCEL_REMINDER: CapabilityCategory.SCHEDULING,
    IntentType.ADD_TASK: CapabilityCategory.TASK_MANAGEMENT,
    IntentType.UPDATE_TASK: CapabilityCategory.TASK_MANAGEMENT,
    IntentType.COMPLETE_TASK: CapabilityCategory.TASK_MANAGEMENT,
    IntentType.DELETE_TASK: CapabilityCategory.TASK_MANAGEMENT,
    IntentType.VIEW_TASKS: CapabilityCategory.TASK_MANAGEMENT,
    IntentType.SEARCH: CapabilityCategory.INFORMATION,
    IntentType.RESEARCH: CapabilityCategory.INFORMATION,
    IntentType.WEATHER: CapabilityCategory.INFORMATION,
    IntentType.TIME: CapabilityCategory.INFORMATION,
    IntentType.RECALL_FACT: CapabilityCategory.MEMORY,
    IntentType.SEARCH_HISTORY: CapabilityCategory.MEMORY,
    IntentType.LIFELOG_QUERY: CapabilityCategory.MEMORY,
    IntentType.SAVE_MEMORY: CapabilityCategory.MEMORY,
    IntentType.ADD_ITEM: CapabilityCategory.GROCERY,
    IntentType.CHECK_LIST: CapabilityCategory.GROCERY,
    IntentType.MARK_PURCHASED: CapabilityCategory.GROCERY,
    IntentType.REMOVE_ITEM: CapabilityCategory.GROCERY,
    IntentType.CLEAR_LIST: CapabilityCategory.GROCERY,
    IntentType.PREFERENCE_UPDATE: CapabilityCategory.PROFILE,
    IntentType.PROFILE_QUERY: CapabilityCategory.PROFILE,
    IntentType.READ_FILE: CapabilityCategory.PROFILE,
    IntentType.WRITE_FILE: CapabilityCategory.PROFILE,
    IntentType.MORNING_BRIEFING: CapabilityCategory.SYSTEM,
    IntentType.STATUS_CHECK: CapabilityCategory.SYSTEM,
    IntentType.HELP: CapabilityCategory.SYSTEM,
    IntentType.UNKNOWN: CapabilityCategory.SYSTEM,
}


CAPABILITY_TO_AGENT: dict[CapabilityCategory, list[AgentId]] = {
    CapabilityCategory.COMMUNICATION: [AgentId.COMMS_PILOT],
    CapabilityCategory.SCHEDULING: [AgentId.OPS_PLANNER],
    CapabilityCategory.TASK_MANAGEMENT: [AgentId.OPS_PLANNER],
    CapabilityCategory.INFORMATION: [AgentId.RESEARCH_SCOUT],
    CapabilityCategory.MEMORY: [AgentId.MEMORY_CURATOR],
    CapabilityCategory.GROCERY: [AgentId.OPS_PLANNER],
    CapabilityCategory.PROFILE: [AgentId.PERSONAL_DATA_STEWARD],
    CapabilityCategory.SYSTEM: [AgentId.SAFETY_AUDITOR, AgentId.OPS_PLANNER, AgentId.MEMORY_CURATOR],
}


INTENT_TO_AGENT: dict[IntentType, AgentId] = {
    IntentType.HELP: AgentId.SAFETY_AUDITOR,
    IntentType.STATUS_CHECK: AgentId.SAFETY_AUDITOR,
    IntentType.UNKNOWN: AgentId.SAFETY_AUDITOR,
    IntentType.MORNING_BRIEFING: AgentId.OPS_PLANNER,
    IntentType.SAVE_MEMORY: AgentId.MEMORY_CURATOR,
}


SENSITIVE_CATEGORIES: list[CapabilityCategory] = [
    CapabilityCategory.COMMUNICATION,
    CapabilityCategory.PROFILE,
    CapabilityCategory.MEMORY,
]


class HandoffStatus(str, Enum):
    """Status of a handoff operation."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    REJECTED = "rejected"


class CompletionStatus(str, Enum):
    """Completion status of a request."""
    COMPLETE = "complete"
    PARTIAL = "partial"
    FAILED = "failed"
    AWAITING_INPUT = "awaiting_input"
    HANDED_OFF = "handed_off"


@dataclass
class ClassifiedIntent:
    """
    Represents a classified user intent.
    
    Attributes:
        category: The detected intent category
        type: Specific intent type
        confidence: Confidence score (0-1)
        entities: Extracted entities from the request
        raw_message: Original user message
        requires_coordination: Whether this requires multi-agent coordination
        target_agents: Agents needed to fulfill this request
    """
    category: CapabilityCategory
    type: IntentType
    confidence: float
    entities: dict[str, Any] = field(default_factory=dict)
    raw_message: str = ""
    requires_coordination: bool = False
    target_agents: list[AgentId] = field(default_factory=list)


@dataclass
class AgentResponse:
    """
    Response from an agent after completing work.
    
    Attributes:
        agent_id: Agent that generated this response
        success: Whether the task was completed successfully
        content: The response content
        error: Error message if any
        processing_time_ms: Processing time in milliseconds
    """
    agent_id: AgentId
    success: bool
    content: str
    error: str | None = None
    processing_time_ms: int = 0


@dataclass
class HandoffContext:
    """
    Context passed during a handoff.
    
    Attributes:
        user_message: Original user message
        conversation_id: Conversation ID for continuity
        permissions: User permissions
        phone_number: Phone number if SMS conversation
        memories: Relevant memories or context
        prior_responses: Any prior agent responses in this chain
        metadata: Custom metadata
    """
    user_message: str
    conversation_id: str = ""
    permissions: dict[str, Any] = field(default_factory=dict)
    phone_number: str | None = None
    memories: list[str] = field(default_factory=list)
    prior_responses: list[AgentResponse] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


CONDUCTOR_SYSTEM_PROMPT = """You are the Conductor, ZEKE's central orchestration agent. Your role is to:
1. Understand what the user needs
2. Classify the intent category and type
3. Route to the appropriate specialist agent
4. Synthesize responses

Always prioritize:
- Understanding context before acting
- Routing to the correct specialist
- Maintaining conversation coherence

Never perform tasks directly - always delegate to specialists.

You have access to the following specialist agents:
- MemoryCurator: Retrieves and synthesizes semantic memories, Limitless lifelogs, and historical context
- CommsPilot: Handles SMS/chat communications, respects contact permissions, manages check-ins
- OpsPlanner: Manages tasks, reminders, calendar events, grocery lists, and operational utilities
- ResearchScout: Performs web searches, Perplexity queries, and information gathering
- PersonalDataSteward: Manages profile data, preferences, known facts, and file operations
- SafetyAuditor: Performs permission checks, response validation, and guardrail enforcement

When classifying intents:
- communication: SMS, check-ins, contact management
- scheduling: Calendar events, reminders
- task_management: Tasks, to-dos
- information: Web search, research, weather, time
- memory: Lifelog queries, recalling facts, conversation history
- grocery: Shopping list management
- profile: User preferences, personal data, file operations
- system: Status checks, help, morning briefing

For multi-step tasks:
1. First gather context from MemoryCurator if relevant memories might help
2. Route to the primary specialist for the main action
3. Chain additional specialists if needed
4. Synthesize all responses into a coherent answer"""


INTENT_CLASSIFICATION_SCHEMA = {
    "type": "object",
    "properties": {
        "category": {
            "type": "string",
            "enum": ["communication", "scheduling", "task_management", "information", "memory", "grocery", "profile", "system"],
            "description": "The high-level intent category"
        },
        "intent_type": {
            "type": "string",
            "enum": [
                "send_message", "check_in", "contact_lookup", "configure_checkin",
                "calendar_query", "create_event", "update_event", "delete_event", "set_reminder", "cancel_reminder",
                "add_task", "update_task", "complete_task", "delete_task", "view_tasks",
                "search", "research", "weather", "time",
                "recall_fact", "search_history", "lifelog_query", "save_memory",
                "add_item", "check_list", "mark_purchased", "remove_item", "clear_list",
                "preference_update", "profile_query", "read_file", "write_file",
                "morning_briefing", "status_check", "help", "unknown"
            ],
            "description": "The specific intent type within the category"
        },
        "confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "description": "Confidence score from 0 to 1"
        },
        "entities": {
            "type": "object",
            "description": "Extracted entities like names, dates, items, etc.",
            "properties": {
                "recipient": {"type": "string", "description": "Message recipient name or phone"},
                "message_content": {"type": "string", "description": "Content of message to send"},
                "date": {"type": "string", "description": "Date mentioned in request"},
                "time": {"type": "string", "description": "Time mentioned in request"},
                "task_name": {"type": "string", "description": "Name of task"},
                "item_name": {"type": "string", "description": "Name of item (grocery, etc)"},
                "search_query": {"type": "string", "description": "Search query"},
                "file_path": {"type": "string", "description": "File path"},
                "event_title": {"type": "string", "description": "Calendar event title"},
                "reminder_text": {"type": "string", "description": "Reminder content"},
                "location": {"type": "string", "description": "Location mentioned"}
            },
            "additionalProperties": True
        },
        "requires_coordination": {
            "type": "boolean",
            "description": "Whether this request needs multiple agents to complete"
        },
        "requires_memory_context": {
            "type": "boolean",
            "description": "Whether this request would benefit from memory/history lookup first"
        }
    },
    "required": ["category", "intent_type", "confidence", "entities", "requires_coordination", "requires_memory_context"]
}


class ConductorAgent(BaseAgent):
    """
    Central orchestration agent for ZEKE's multi-agent architecture.
    
    The Conductor serves as the entry point for all user interactions. It:
    - Classifies user intent using OpenAI function calling
    - Routes requests to appropriate specialist agents
    - Manages multi-agent workflows and handoffs
    - Synthesizes responses from multiple agents
    - Handles fallback logic when specialists fail
    
    Attributes:
        specialist_agents: Registry of available specialist agents
        handoff_chain: Tracking of handoffs in the current request
    """
    
    def __init__(self) -> None:
        """Initialize the Conductor agent."""
        super().__init__(
            agent_id=AgentId.CONDUCTOR,
            name="Conductor",
            description="Central orchestrator that routes requests to appropriate specialists, manages handoffs, and synthesizes multi-agent responses",
            instructions=CONDUCTOR_SYSTEM_PROMPT,
            capabilities=[],
            tools=[],
            handoff_targets=[
                AgentId.MEMORY_CURATOR,
                AgentId.COMMS_PILOT,
                AgentId.OPS_PLANNER,
                AgentId.RESEARCH_SCOUT,
                AgentId.PERSONAL_DATA_STEWARD,
                AgentId.SAFETY_AUDITOR,
            ],
        )
        self.specialist_agents: dict[AgentId, BaseAgent] = {}
        self.handoff_chain: list[HandoffRequest] = []
        self._classification_agent: Agent | None = None
        self.last_completion_status: CompletionStatus = CompletionStatus.COMPLETE
        self.last_completion_message: str = ""
    
    def register_specialist(self, agent: BaseAgent) -> None:
        """
        Register a specialist agent for routing.
        
        Args:
            agent: The specialist agent to register
        """
        self.specialist_agents[agent.agent_id] = agent
        logger.info(f"Registered specialist agent: {agent.name} ({agent.agent_id})")
    
    def _get_classification_agent(self) -> Agent:
        """Get or create the intent classification agent."""
        if self._classification_agent is None:
            classify_tool = FunctionTool(
                name="classify_intent",
                description="Classify the user's intent into a category and specific type",
                params_json_schema=INTENT_CLASSIFICATION_SCHEMA,
                on_invoke_tool=self._handle_classification,
            )
            self._classification_agent = Agent(
                name="IntentClassifier",
                instructions="""You are an intent classification system. Analyze the user message and classify it into the appropriate category and intent type.

Categories and their intent types:
- communication: send_message, check_in, contact_lookup, configure_checkin
- scheduling: calendar_query, create_event, update_event, delete_event, set_reminder, cancel_reminder
- task_management: add_task, update_task, complete_task, delete_task, view_tasks
- information: search, research, weather, time
- memory: recall_fact, search_history, lifelog_query, save_memory
- grocery: add_item, check_list, mark_purchased, remove_item, clear_list
- profile: preference_update, profile_query, read_file, write_file
- system: morning_briefing, status_check, help, unknown

Extract relevant entities from the message.
Set requires_coordination to true if the request needs multiple specialist agents.
Set requires_memory_context to true if retrieving past context/memories would help.

Always call the classify_intent tool with your classification.""",
                tools=[classify_tool],
            )
        return self._classification_agent
    
    async def _handle_classification(self, ctx: Any, args: str) -> str:
        """Handler for classification tool invocation."""
        return args
    
    async def classify_intent(self, message: str, context: dict[str, Any] | None = None) -> ClassifiedIntent:
        """
        Classify the user's message into an intent category and type.
        
        Uses OpenAI function calling to analyze the message and extract:
        - Intent category (communication, scheduling, etc.)
        - Specific intent type (send_message, add_task, etc.)
        - Confidence score
        - Extracted entities
        - Whether multi-agent coordination is needed
        
        Args:
            message: The user's input message
            context: Optional context to help with classification
            
        Returns:
            ClassifiedIntent: The classified intent with metadata
        """
        classification_agent = self._get_classification_agent()
        
        prompt = f"Classify this user message: {message}"
        if context:
            if context.get("phone_number"):
                prompt += f"\n\nContext: This message came via SMS from {context.get('phone_number')}"
            if context.get("conversation_history"):
                prompt += f"\n\nRecent conversation: {context.get('conversation_history')}"
        
        try:
            result = await Runner.run(classification_agent, prompt)
            
            classification_data = None
            for item in result.new_items:
                if hasattr(item, 'raw_item'):
                    raw = item.raw_item
                    if isinstance(raw, dict):
                        if raw.get('type') == 'function_call':
                            try:
                                classification_data = json.loads(raw.get('arguments', '{}'))
                                break
                            except json.JSONDecodeError:
                                continue
                    elif hasattr(raw, 'type') and getattr(raw, 'type', None) == 'function_call':
                        try:
                            args = getattr(raw, 'arguments', '{}')
                            classification_data = json.loads(args if isinstance(args, str) else '{}')
                            break
                        except json.JSONDecodeError:
                            continue
            
            if not classification_data:
                if hasattr(result, 'final_output') and result.final_output:
                    try:
                        classification_data = json.loads(result.final_output)
                    except json.JSONDecodeError:
                        pass
            
            if not classification_data:
                logger.warning(f"Failed to extract classification from result, using fallback")
                return self._fallback_classification(message)
            
            try:
                category = CapabilityCategory(classification_data.get("category", "system"))
            except ValueError:
                category = CapabilityCategory.SYSTEM
            
            try:
                intent_type = IntentType(classification_data.get("intent_type", "unknown"))
            except ValueError:
                intent_type = IntentType.UNKNOWN
            
            requires_coordination = classification_data.get("requires_coordination", False)
            requires_memory = classification_data.get("requires_memory_context", False)
            
            target_agents = self._determine_target_agents(category, intent_type, requires_coordination)
            
            if requires_memory and AgentId.MEMORY_CURATOR not in target_agents:
                target_agents.insert(0, AgentId.MEMORY_CURATOR)
            
            return ClassifiedIntent(
                category=category,
                type=intent_type,
                confidence=classification_data.get("confidence", 0.8),
                entities=classification_data.get("entities", {}),
                raw_message=message,
                requires_coordination=requires_coordination,
                target_agents=target_agents,
            )
            
        except Exception as e:
            logger.error(f"Intent classification failed: {e}")
            return self._fallback_classification(message)
    
    def _fallback_classification(self, message: str) -> ClassifiedIntent:
        """
        Fallback classification when OpenAI call fails.
        
        Uses simple keyword matching for basic classification.
        
        Args:
            message: The user's message
            
        Returns:
            ClassifiedIntent: A basic classification based on keywords
        """
        message_lower = message.lower()
        
        keyword_mappings: list[tuple[list[str], CapabilityCategory, IntentType]] = [
            (["text", "sms", "message", "send"], CapabilityCategory.COMMUNICATION, IntentType.SEND_MESSAGE),
            (["check-in", "checkin"], CapabilityCategory.COMMUNICATION, IntentType.CHECK_IN),
            (["calendar", "schedule", "meeting", "appointment"], CapabilityCategory.SCHEDULING, IntentType.CALENDAR_QUERY),
            (["remind", "reminder"], CapabilityCategory.SCHEDULING, IntentType.SET_REMINDER),
            (["task", "todo", "to-do"], CapabilityCategory.TASK_MANAGEMENT, IntentType.VIEW_TASKS),
            (["add task", "new task"], CapabilityCategory.TASK_MANAGEMENT, IntentType.ADD_TASK),
            (["search", "look up", "find"], CapabilityCategory.INFORMATION, IntentType.SEARCH),
            (["weather"], CapabilityCategory.INFORMATION, IntentType.WEATHER),
            (["time", "what time"], CapabilityCategory.INFORMATION, IntentType.TIME),
            (["remember", "recall", "what did"], CapabilityCategory.MEMORY, IntentType.RECALL_FACT),
            (["lifelog", "pendant", "recording"], CapabilityCategory.MEMORY, IntentType.LIFELOG_QUERY),
            (["grocery", "groceries", "shopping list"], CapabilityCategory.GROCERY, IntentType.CHECK_LIST),
            (["add to list", "buy"], CapabilityCategory.GROCERY, IntentType.ADD_ITEM),
            (["profile", "preference", "setting"], CapabilityCategory.PROFILE, IntentType.PROFILE_QUERY),
            (["morning", "briefing", "brief me"], CapabilityCategory.SYSTEM, IntentType.MORNING_BRIEFING),
            (["help", "what can you"], CapabilityCategory.SYSTEM, IntentType.HELP),
            (["status"], CapabilityCategory.SYSTEM, IntentType.STATUS_CHECK),
        ]
        
        for keywords, category, intent_type in keyword_mappings:
            if any(kw in message_lower for kw in keywords):
                target_agents = self._determine_target_agents(category, intent_type, False)
                return ClassifiedIntent(
                    category=category,
                    type=intent_type,
                    confidence=0.6,
                    entities={},
                    raw_message=message,
                    requires_coordination=False,
                    target_agents=target_agents,
                )
        
        return ClassifiedIntent(
            category=CapabilityCategory.SYSTEM,
            type=IntentType.UNKNOWN,
            confidence=0.3,
            entities={},
            raw_message=message,
            requires_coordination=False,
            target_agents=[AgentId.SAFETY_AUDITOR],
        )
    
    def _determine_target_agents(
        self,
        category: CapabilityCategory,
        intent_type: IntentType,
        requires_coordination: bool = False
    ) -> list[AgentId]:
        """
        Determine which agents should handle this intent.
        
        When requires_coordination is True, this method builds a proper multi-agent
        chain starting with MemoryCurator for context gathering, followed by the
        primary specialist agent(s), and ending with SafetyAuditor for sensitive
        categories.
        
        Args:
            category: The intent category
            intent_type: The specific intent type
            requires_coordination: Whether multi-agent coordination is needed
            
        Returns:
            list[AgentId]: List of agent IDs that should handle this request
        """
        agents: list[AgentId] = []
        
        # If coordination needed, start with memory context
        if requires_coordination:
            agents.append(AgentId.MEMORY_CURATOR)
        
        # Get primary agent for intent (specific mapping takes priority)
        if intent_type in INTENT_TO_AGENT:
            primary = INTENT_TO_AGENT[intent_type]
            if primary not in agents:
                agents.append(primary)
        
        # Fall back to category mapping if no specific intent mapping was found
        # or if we only have MemoryCurator from coordination
        if not agents or (len(agents) == 1 and agents[0] == AgentId.MEMORY_CURATOR):
            category_agents = CAPABILITY_TO_AGENT.get(category, [])
            for agent in category_agents:
                if agent not in agents:
                    agents.append(agent)
        
        # Add Safety Auditor for sensitive operations
        if category in {CapabilityCategory.COMMUNICATION, CapabilityCategory.PROFILE, CapabilityCategory.MEMORY}:
            if AgentId.SAFETY_AUDITOR not in agents:
                agents.append(AgentId.SAFETY_AUDITOR)
        
        # Default to conductor if nothing matched
        if not agents:
            agents.append(AgentId.CONDUCTOR)
        
        return agents
    
    def route_to_agent(self, intent: ClassifiedIntent, context: dict[str, Any] | None = None) -> AgentId:
        """
        Determine which specialist agent should handle the classified intent.
        
        Args:
            intent: The classified intent
            context: Optional context for routing decisions
            
        Returns:
            AgentId: The ID of the agent that should handle this request
        """
        if intent.target_agents:
            return intent.target_agents[0]
        
        if intent.type in INTENT_TO_AGENT:
            return INTENT_TO_AGENT[intent.type]
        
        agents = CAPABILITY_TO_AGENT.get(intent.category, [])
        if agents:
            return agents[0]
        
        return AgentId.CONDUCTOR
    
    async def enrich_context(self, message: str, context: AgentContext) -> AgentContext:
        """
        Enrich the context with relevant memories and profile data.
        
        Calls MemoryCurator to gather relevant memories for complex queries,
        and fetches user profile data if needed.
        
        Args:
            message: The user's message
            context: The current context
            
        Returns:
            AgentContext: Enriched context with memories and profile
        """
        try:
            bridge = get_bridge()
            
            memory_result = await bridge.get_memory_context(message, limit=5)
            if memory_result and memory_result.get("success"):
                context.memory_context = memory_result.get("memories", {})
            
            if not context.user_profile:
                profile_result = await bridge.get_user_profile()
                if profile_result and profile_result.get("success"):
                    context.user_profile = profile_result.get("profile", {})
            
        except Exception as e:
            logger.warning(f"Context enrichment failed: {e}")
        
        return context
    
    def create_handoff(
        self,
        target_agent: AgentId,
        intent: ClassifiedIntent,
        context: HandoffContext,
        reason: HandoffReason = HandoffReason.CAPABILITY_REQUIRED,
    ) -> HandoffRequest:
        """
        Create a handoff request for routing to a specialist agent.
        
        Args:
            target_agent: The agent to hand off to
            intent: The classified intent
            context: The handoff context
            reason: The reason for the handoff
            
        Returns:
            HandoffRequest: The handoff request
        """
        handoff = HandoffRequest(
            source_agent=self.agent_id,
            target_agent=target_agent,
            reason=reason,
            context={
                "intent": {
                    "category": intent.category.value,
                    "type": intent.type.value,
                    "entities": intent.entities,
                    "raw_message": intent.raw_message,
                },
                "user_message": context.user_message,
                "conversation_id": context.conversation_id,
                "permissions": context.permissions,
                "phone_number": context.phone_number,
                "memories": context.memories,
                "prior_responses": [
                    {
                        "agent_id": r.agent_id.value,
                        "success": r.success,
                        "content": r.content,
                    }
                    for r in context.prior_responses
                ],
            },
            message=f"Routing {intent.type.value} request to {target_agent.value}",
        )
        
        self.handoff_chain.append(handoff)
        return handoff
    
    async def execute_with_agent(
        self,
        agent_id: AgentId,
        message: str,
        context: AgentContext,
    ) -> AgentResponse:
        """
        Execute a request with a specific specialist agent.
        
        Args:
            agent_id: The ID of the agent to execute with
            message: The user's message
            context: The agent context
            
        Returns:
            AgentResponse: The response from the specialist agent
        """
        import time
        start_time = time.time()
        
        if agent_id not in self.specialist_agents:
            logger.warning(
                f"Specialist agent '{agent_id.value}' is not registered. "
                f"Registered agents: {list(self.specialist_agents.keys())}. "
                f"Attempting bridge fallback."
            )
            try:
                bridge = get_bridge()
                result = await bridge.execute_tool("route_to_agent", {
                    "agent_id": agent_id.value,
                    "message": message,
                    "context": {
                        "user_message": context.user_message,
                        "memory_context": context.memory_context,
                        "user_profile": context.user_profile,
                        "phone_number": context.phone_number,
                        "metadata": context.metadata,
                    }
                })
                
                processing_time = int((time.time() - start_time) * 1000)
                
                if result.get("success"):
                    return AgentResponse(
                        agent_id=agent_id,
                        success=True,
                        content=result.get("response", ""),
                        processing_time_ms=processing_time,
                    )
                else:
                    error_msg = result.get("error", "Agent execution failed via bridge")
                    logger.warning(f"Bridge fallback failed for agent '{agent_id.value}': {error_msg}")
                    return AgentResponse(
                        agent_id=agent_id,
                        success=False,
                        content="",
                        error=error_msg,
                        processing_time_ms=processing_time,
                    )
            except Exception as e:
                processing_time = int((time.time() - start_time) * 1000)
                logger.error(f"Bridge fallback exception for agent '{agent_id.value}': {e}")
                return AgentResponse(
                    agent_id=agent_id,
                    success=False,
                    content="",
                    error=f"Specialist '{agent_id.value}' not registered and bridge fallback failed: {str(e)}",
                    processing_time_ms=processing_time,
                )
        
        specialist = self.specialist_agents.get(agent_id)
        if specialist is None:
            processing_time = int((time.time() - start_time) * 1000)
            error_msg = f"Specialist agent '{agent_id.value}' not found in registry"
            logger.error(error_msg)
            return AgentResponse(
                agent_id=agent_id,
                success=False,
                content="",
                error=error_msg,
                processing_time_ms=processing_time,
            )
        
        handoff_request = None
        handoff_chain_len = len(self.handoff_chain)
        if handoff_chain_len > 0:
            last_handoff = self.handoff_chain[-1]
            if last_handoff.target_agent == agent_id:
                handoff_request = last_handoff
        
        try:
            response = await specialist.run(message, context)
            processing_time = int((time.time() - start_time) * 1000)
            
            if handoff_request:
                self.complete_handoff(handoff_request, success=True, agent_context=context)
            
            return AgentResponse(
                agent_id=agent_id,
                success=True,
                content=response,
                processing_time_ms=processing_time,
            )
        except Exception as e:
            processing_time = int((time.time() - start_time) * 1000)
            logger.error(f"Specialist agent {agent_id} failed: {e}")
            
            if handoff_request:
                self.complete_handoff(handoff_request, success=False, agent_context=context)
            
            return AgentResponse(
                agent_id=agent_id,
                success=False,
                content="",
                error=str(e),
                processing_time_ms=processing_time,
            )
    
    async def compose_response(
        self,
        intent: ClassifiedIntent,
        responses: list[AgentResponse],
        context: AgentContext,
    ) -> str:
        """
        Compose a final response from multiple agent responses.
        
        Aggregates responses from multiple agents and formats them
        into a coherent response for the user. Also sets the completion
        status based on the responses.
        
        Args:
            intent: The original classified intent
            responses: List of responses from specialist agents
            context: The agent context
            
        Returns:
            str: The composed final response
        """
        successful_responses = [r for r in responses if r.success]
        failed_responses = [r for r in responses if not r.success]
        
        if not successful_responses:
            if failed_responses:
                error_msg = failed_responses[0].error or "Unknown error"
                self.last_completion_status = CompletionStatus.FAILED
                self.last_completion_message = f"All agents failed. First error: {error_msg}"
                logger.warning(f"Response composition: {self.last_completion_message}")
                return f"I encountered an issue processing your request: {error_msg}"
            self.last_completion_status = CompletionStatus.FAILED
            self.last_completion_message = "No responses received from any agent"
            logger.warning(f"Response composition: {self.last_completion_message}")
            return "I wasn't able to process your request. Could you try rephrasing?"
        
        if failed_responses:
            self.last_completion_status = CompletionStatus.PARTIAL
            self.last_completion_message = (
                f"{len(successful_responses)} succeeded, {len(failed_responses)} failed"
            )
            logger.info(f"Response composition: {self.last_completion_message}")
        else:
            self.last_completion_status = CompletionStatus.COMPLETE
            self.last_completion_message = f"All {len(successful_responses)} agents succeeded"
        
        if len(successful_responses) == 1:
            return successful_responses[0].content
        
        response_texts = [r.content for r in successful_responses if r.content]
        if not response_texts:
            self.last_completion_status = CompletionStatus.PARTIAL
            self.last_completion_message = "Agents succeeded but returned no content"
            return "Your request was processed, but there's nothing to report."
        
        if len(response_texts) == 1:
            return response_texts[0]
        
        composed = "\n\n".join(response_texts)
        return composed
    
    async def _execute(self, input_text: str, context: AgentContext) -> str:
        """
        Main execution logic for the Conductor.
        
        This is the primary entry point for processing user requests.
        It classifies intent, enriches context, routes to specialists,
        manages handoffs, and composes the final response.
        
        For multi-agent coordination requests, this method ensures all target
        agents are called in sequence, with MemoryCurator first for context
        gathering and SafetyAuditor last for validation.
        
        Args:
            input_text: The user's input message
            context: The agent context
            
        Returns:
            str: The final response to the user
        """
        self.handoff_chain = []
        self.last_completion_status = CompletionStatus.COMPLETE
        self.last_completion_message = ""
        
        intent = await self.classify_intent(input_text, {
            "phone_number": context.phone_number,
            "conversation_history": context.metadata.get("conversation_history"),
        })
        
        logger.info(
            f"Classified intent: {intent.category.value}/{intent.type.value} "
            f"(confidence: {intent.confidence:.2f}, coordination: {intent.requires_coordination})"
        )
        
        if intent.requires_coordination or intent.category in [CapabilityCategory.MEMORY]:
            context = await self.enrich_context(input_text, context)
        
        responses: list[AgentResponse] = []
        agents_called: list[AgentId] = []
        expected_agents = [a for a in intent.target_agents if a != AgentId.CONDUCTOR]
        
        handoff_context = HandoffContext(
            user_message=input_text,
            conversation_id=context.conversation_id or "",
            permissions=context.metadata.get("permissions", {}),
            phone_number=context.phone_number,
            memories=list(context.memory_context.values()) if isinstance(context.memory_context, dict) else [],
            prior_responses=[],
            metadata=context.metadata,
        )
        
        # Iterate through ALL target agents for proper multi-agent coordination
        for agent_id in intent.target_agents:
            if agent_id == AgentId.CONDUCTOR:
                continue
            
            self.create_handoff(
                target_agent=agent_id,
                intent=intent,
                context=handoff_context,
                reason=HandoffReason.CAPABILITY_REQUIRED,
            )
            
            response = await self.execute_with_agent(agent_id, input_text, context)
            responses.append(response)
            agents_called.append(agent_id)
            
            handoff_context.prior_responses.append(response)
            
            # Enrich context with memory results for subsequent agents
            if agent_id == AgentId.MEMORY_CURATOR and response.success:
                context.memory_context["enriched"] = response.content
        
        if not responses:
            primary_agent = self.route_to_agent(intent)
            if primary_agent != AgentId.CONDUCTOR:
                response = await self.execute_with_agent(primary_agent, input_text, context)
                responses.append(response)
                agents_called.append(primary_agent)
            else:
                self.last_completion_status = CompletionStatus.FAILED
                self.last_completion_message = "No agents available to handle request"
                logger.error(f"Execution failed: {self.last_completion_message}")
                return "I wasn't able to find an appropriate agent to handle your request."
        
        if not responses:
            self.last_completion_status = CompletionStatus.FAILED
            self.last_completion_message = "No responses collected from any agent"
            logger.error(f"Execution failed: {self.last_completion_message}")
            return "I wasn't able to process your request. No agent responses were received."
        
        final_response = await self.compose_response(intent, responses, context)
        
        # Check if all expected agents were called for coordinated requests
        if intent.requires_coordination:
            missing_agents = set(expected_agents) - set(agents_called)
            if missing_agents:
                self.last_completion_status = CompletionStatus.PARTIAL
                self.last_completion_message = (
                    f"Coordination incomplete: missing agents {[a.value for a in missing_agents]}"
                )
                logger.warning(f"Multi-agent coordination: {self.last_completion_message}")
        
        logger.info(
            f"Execution complete. Status: {self.last_completion_status.value}, "
            f"Message: {self.last_completion_message}, "
            f"Agents called: {[a.value for a in agents_called]}"
        )
        
        return final_response
    
    async def run(self, input_text: str, context: AgentContext | None = None) -> str:
        """
        Main entry point for processing user requests.
        
        Args:
            input_text: The user's input message
            context: Optional context
            
        Returns:
            str: The final response to the user
        """
        if context is None:
            context = AgentContext(user_message=input_text)
        
        return await super().run(input_text, context)
    
    async def run_with_dict(self, message: str, context_dict: dict[str, Any] | None = None) -> str:
        """
        Convenience method for running with a dictionary context.
        
        Args:
            message: The user's input message
            context_dict: Optional context dictionary
            
        Returns:
            str: The final response to the user
        """
        agent_context = AgentContext(
            user_message=message,
            conversation_id=context_dict.get("conversation_id") if context_dict else None,
            memory_context=context_dict.get("memory_context", {}) if context_dict else {},
            user_profile=context_dict.get("user_profile", {}) if context_dict else {},
            phone_number=context_dict.get("phone_number") if context_dict else None,
            metadata=context_dict.get("metadata", {}) if context_dict else {},
        )
        
        return await self.run(message, agent_context)
    
    def get_handoff_chain(self) -> list[dict[str, Any]]:
        """
        Get the chain of handoffs for the current/last request.
        
        Returns:
            list[dict]: The handoff chain as a list of dictionaries
        """
        return [
            {
                "source": h.source_agent.value,
                "target": h.target_agent.value,
                "reason": h.reason.value,
                "message": h.message,
            }
            for h in self.handoff_chain
        ]
    
    def get_completion_status(self) -> CompletionStatus:
        """
        Get the completion status of the last request.
        
        Returns:
            CompletionStatus: The completion status
        """
        if self.status == AgentStatus.ERROR:
            return CompletionStatus.FAILED
        
        if self.status == AgentStatus.WAITING_FOR_HANDOFF:
            return CompletionStatus.HANDED_OFF
        
        return self.last_completion_status
    
    def get_completion_details(self) -> dict[str, Any]:
        """
        Get detailed completion status information for debugging.
        
        Returns:
            dict: Completion details including status and message
        """
        return {
            "status": self.last_completion_status.value,
            "message": self.last_completion_message,
            "agent_status": self.status.value,
            "handoff_count": len(self.handoff_chain),
        }


_conductor_instance: ConductorAgent | None = None


def get_conductor() -> ConductorAgent:
    """
    Get the singleton Conductor agent instance.
    
    Returns:
        ConductorAgent: The shared Conductor instance
    """
    global _conductor_instance
    if _conductor_instance is None:
        _conductor_instance = ConductorAgent()
    return _conductor_instance

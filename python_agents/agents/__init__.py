"""
ZEKE Multi-Agent System - Python Agents Package

This package contains the Python implementation of ZEKE's multi-agent
architecture. It includes:

- BaseAgent: Abstract base class for all agents
- ConductorAgent: Central orchestration agent
- MemoryCuratorAgent: Memory and context specialist
- CommsPilotAgent: SMS and messaging specialist
- OpsPlannerAgent: Scheduling, task management, and grocery specialist
- ResearchScoutAgent: Information retrieval and search specialist
- SafetyAuditorAgent: Security validation and user guidance specialist
- OmiAnalystAgent: Lifelog data preprocessor and context curator
- Handoff protocols for inter-agent communication

The architecture follows a conductor-specialist pattern where a central
Conductor agent routes requests to specialized agents based on intent
classification.
"""

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

from .conductor import (
    ConductorAgent,
    ClassifiedIntent,
    IntentType,
    AgentResponse,
    HandoffContext,
    HandoffStatus,
    CompletionStatus,
    get_conductor,
    INTENT_TO_CATEGORY,
    CAPABILITY_TO_AGENT,
    INTENT_TO_AGENT,
)

from .memory_curator import (
    MemoryCuratorAgent,
    MemoryResult,
    LifelogEntry,
    SynthesizedContext,
    get_memory_curator,
)

from .comms_pilot import (
    CommsPilotAgent,
    SmsResult,
    CheckInConfig,
    get_comms_pilot,
)

from .ops_planner import (
    OpsPlannerAgent,
    TaskResult,
    ReminderResult,
    CalendarResult,
    GroceryResult,
    get_ops_planner,
)

from .research_scout import (
    ResearchScoutAgent,
    SearchResult,
    get_research_scout,
)

from .safety_auditor import (
    SafetyAuditorAgent,
    PermissionCheckResult,
    ValidationResult,
    get_safety_auditor,
)

from .omi_analyst import (
    OmiAnalystAgent,
    ContextBundle,
    LifelogOverviewResult,
    get_omi_analyst,
)

from .foresight_strategist import (
    ForesightStrategistAgent,
    get_foresight_strategist,
)

from ..tracing import (
    TraceContext,
    TraceEvent,
    TraceEventType,
    TracingLogger,
    get_tracing_logger,
    create_trace_context,
)

from ..guards import (
    RunBudget,
    RunBudgetExceeded,
    BudgetExceededReason,
)

__all__ = [
    "BaseAgent",
    "AgentId",
    "AgentStatus",
    "AgentContext",
    "CapabilityCategory",
    "HandoffRequest",
    "HandoffReason",
    "ToolDefinition",
    "create_bridge_tool",
    "ConductorAgent",
    "ClassifiedIntent",
    "IntentType",
    "AgentResponse",
    "HandoffContext",
    "HandoffStatus",
    "CompletionStatus",
    "get_conductor",
    "INTENT_TO_CATEGORY",
    "CAPABILITY_TO_AGENT",
    "INTENT_TO_AGENT",
    "MemoryCuratorAgent",
    "MemoryResult",
    "LifelogEntry",
    "SynthesizedContext",
    "get_memory_curator",
    "CommsPilotAgent",
    "SmsResult",
    "CheckInConfig",
    "get_comms_pilot",
    "OpsPlannerAgent",
    "TaskResult",
    "ReminderResult",
    "CalendarResult",
    "GroceryResult",
    "get_ops_planner",
    "ResearchScoutAgent",
    "SearchResult",
    "get_research_scout",
    "SafetyAuditorAgent",
    "PermissionCheckResult",
    "ValidationResult",
    "get_safety_auditor",
    "OmiAnalystAgent",
    "ContextBundle",
    "LifelogOverviewResult",
    "get_omi_analyst",
    "ForesightStrategistAgent",
    "get_foresight_strategist",
    "TraceContext",
    "TraceEvent",
    "TraceEventType",
    "TracingLogger",
    "get_tracing_logger",
    "create_trace_context",
    "RunBudget",
    "RunBudgetExceeded",
    "BudgetExceededReason",
]

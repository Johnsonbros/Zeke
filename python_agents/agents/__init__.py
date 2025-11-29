"""
ZEKE Multi-Agent System - Python Agents Package

This package contains the Python implementation of ZEKE's multi-agent
architecture. It includes:

- BaseAgent: Abstract base class for all agents
- ConductorAgent: Central orchestration agent
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
]

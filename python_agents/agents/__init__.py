"""
ZEKE Multi-Agent System - Python Agents Package

This package contains the Python implementation of ZEKE's multi-agent
architecture. It includes:

- BaseAgent: Abstract base class for all agents
- Agent-specific implementations (to be added)
- Handoff protocols for inter-agent communication

The architecture follows a conductor-specialist pattern where a central
Conductor agent routes requests to specialized agents based on intent
classification.
"""

from .base import (
    BaseAgent,
    AgentId,
    AgentStatus,
    CapabilityCategory,
    HandoffRequest,
    HandoffReason,
    ToolDefinition,
    create_bridge_tool,
)

__all__ = [
    "BaseAgent",
    "AgentId",
    "AgentStatus",
    "CapabilityCategory",
    "HandoffRequest",
    "HandoffReason",
    "ToolDefinition",
    "create_bridge_tool",
]

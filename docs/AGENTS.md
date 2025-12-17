# ZEKE Agent Architecture

This document describes the multi-agent orchestration system that powers ZEKE.

## Overview

ZEKE uses a **Conductor-Specialist** architecture where a central Conductor agent routes requests to specialized agents based on intent classification. This design enables:

- **Parallel execution** of independent agents for faster responses
- **Separation of concerns** with domain-specific specialists
- **Extensibility** through easy addition of new specialist agents
- **Safety** via dedicated auditing and validation layers

## Architecture Diagram

```
User Message
     |
     v
+--------------------+
|     Conductor      |  <-- Central orchestrator
+--------------------+
     |
     | 1. Intent Classification (fast pattern + LLM fallback)
     | 2. Target Agent Selection
     | 3. Phased Execution
     v
+--------------------------------------------------+
| Phase 1: MemoryCurator (if coordination needed)  |
+--------------------------------------------------+
     |
     v
+--------------------------------------------------+
| Phase 2: Specialists (parallel execution)        |
| - CommsPilot, OpsPlanner, ResearchScout, etc.    |
+--------------------------------------------------+
     |
     v
+--------------------------------------------------+
| Phase 3: SafetyAuditor (for sensitive categories)|
+--------------------------------------------------+
     |
     v
Response Composition -> Final User Response
```

**Note**: Phases are conditional:
- Phase 1 (MemoryCurator) only runs when `requires_coordination=True`
- Phase 3 (SafetyAuditor) only runs for sensitive categories (communication, profile, memory)

## The Conductor Agent

The Conductor (`python_agents/agents/conductor.py`) is the central orchestrator that:

1. **Classifies intent** using a two-tier approach:
   - Fast pattern-based classification (~80% of requests)
   - LLM fallback for ambiguous cases

2. **Determines target agents** based on:
   - Intent-to-agent mappings (specific intents)
   - Category-to-agent mappings (fallback)
   - Coordination requirements

3. **Executes agents in phases** (conditional):
   - Phase 1: MemoryCurator (only if coordination needed)
   - Phase 2: Domain specialists (parallel)
   - Phase 3: SafetyAuditor (only for sensitive categories)

4. **Composes final response** from agent outputs

### Intent Classification

Intents are organized by category:

| Category | Intent Types |
|----------|--------------|
| `communication` | send_message, check_in, contact_lookup, configure_checkin |
| `scheduling` | calendar_query, create_event, update_event, set_reminder |
| `task_management` | add_task, update_task, complete_task, view_tasks |
| `information` | search, research, weather, time |
| `memory` | recall_fact, search_history, lifelog_query, save_memory |
| `grocery` | add_item, check_list, mark_purchased, clear_list |
| `profile` | preference_update, profile_query |
| `documents` | list_documents, read_document, create_document, etc. |
| `system` | morning_briefing, status_check, help, unknown |

### Agent Routing

```python
# Intent-to-agent mappings (excerpt)
INTENT_TO_AGENT = {
    IntentType.SEND_MESSAGE: AgentId.COMMS_PILOT,
    IntentType.ADD_TASK: AgentId.OPS_PLANNER,
    IntentType.SEARCH: AgentId.RESEARCH_SCOUT,
    IntentType.SAVE_MEMORY: AgentId.MEMORY_CURATOR,
    # ...
}

# Category fallbacks
CAPABILITY_TO_AGENT = {
    CapabilityCategory.COMMUNICATION: [AgentId.COMMS_PILOT],
    CapabilityCategory.SCHEDULING: [AgentId.OPS_PLANNER],
    CapabilityCategory.INFORMATION: [AgentId.RESEARCH_SCOUT],
    # ...
}
```

## Specialist Agents

### MemoryCurator (`memory_curator.py`)

**Role**: Memory and context management

**Capabilities**:
- Retrieves relevant semantic memories
- Searches and synthesizes Omi lifelog recordings
- Combines memory sources for enriched context
- Stores new memories from conversations

**Tools**: `search_memories`, `search_lifelogs`, `get_recent_lifelogs`, `store_memory`

**Runs**: Phase 1 (first, to enrich context for other agents)

---

### CommsPilot (`comms_pilot.py`)

**Role**: SMS and messaging specialist

**Capabilities**:
- Sends SMS messages via Twilio
- Manages daily check-in configuration
- Enforces contact permission rules
- Handles voice calling

**Tools**: `send_sms`, `configure_daily_checkin`, `get_daily_checkin_status`, `lookup_contact`

**Runs**: Phase 2 (parallel)

---

### OpsPlanner (`ops_planner.py`)

**Role**: Scheduling and task management

**Capabilities**:
- Task management (add, update, complete, delete)
- Reminder scheduling
- Google Calendar integration
- Grocery list management
- Time and weather utilities

**Tools**: `add_task`, `list_tasks`, `complete_task`, `add_reminder`, `get_calendar_events`, `create_calendar_event`, `add_grocery_item`, `get_weather`, `get_current_time`

**Runs**: Phase 2 (parallel)

---

### ResearchScout (`research_scout.py`)

**Role**: Information retrieval specialist

**Capabilities**:
- Web searches via DuckDuckGo
- AI-powered searches via Perplexity (preferred for complex queries)
- Finding specific information (phone numbers, addresses, prices)
- Research synthesis with citations

**Design Principles**:
- Prefer `perplexity_search` for complex questions
- Always share what was found (URLs, partial info)
- Never tell users to "check the website themselves"
- Provide actionable results

**Tools**: `web_search`, `perplexity_search`

**Runs**: Phase 2 (parallel)

---

### SafetyAuditor (`safety_auditor.py`)

**Role**: Security and validation specialist

**Capabilities**:
- Permission verification
- Response validation and moderation
- User help and guidance
- System status reporting
- Handling unknown/ambiguous intents

**Tools**: `check_omi_status`, `get_current_time`, `validate_response`

**Runs**: Phase 3 (last, for final validation)

---

### OmiAnalyst (`omi_analyst.py`)

**Role**: Omi pendant data specialist

**Capabilities**:
- Deep analysis of lifelog recordings
- Conversation extraction and categorization
- GPS correlation for location context
- Memory creation from lifelogs

**Tools**: `get_lifelog_overview`, `search_lifelogs`, `get_recent_lifelogs`, `get_lifelog_details`

**Runs**: Phase 2 (parallel)

---

### ForesightStrategist (`foresight_strategist.py`)

**Role**: Predictive intelligence and pattern analysis

**Capabilities**:
- Behavioral pattern detection
- Predictive task scheduling
- Anomaly detection
- Morning briefing generation

**Tools**: `build_fused_context`, `get_active_patterns`, `detect_anomalies`, `create_prediction`

**Runs**: Phase 2 (parallel)

## Agent Context

All agents receive an `AgentContext` containing:

```python
@dataclass
class AgentContext:
    user_message: str           # Original user input
    phone_number: str | None    # User's phone number
    memory_context: dict        # Retrieved memories
    user_profile: dict          # User preferences/profile
    metadata: dict              # Additional context
    trace_context: dict         # Tracing/logging context
```

## Handoff Protocol

When the Conductor routes to a specialist, it creates a `HandoffRequest`:

```python
@dataclass
class HandoffRequest:
    source_agent: AgentId
    target_agent: AgentId
    intent: ClassifiedIntent
    context: HandoffContext
    reason: HandoffReason
    timestamp: datetime
```

Handoff reasons include:
- `CAPABILITY_REQUIRED`: Target has required capability
- `COORDINATION_NEEDED`: Multi-agent coordination
- `ESCALATION`: Issue needs elevated handling
- `FOLLOW_UP`: Continuation of previous interaction

## Adding a New Specialist Agent

1. **Create agent file** in `python_agents/agents/`:

```python
from .base import BaseAgent, AgentId, CapabilityCategory, ToolDefinition

class MyNewAgent(BaseAgent):
    """Description of your agent's role."""
    
    def __init__(self):
        tool_definitions = [
            ToolDefinition(
                name="my_tool",
                description="What this tool does",
                parameters={
                    "type": "object",
                    "properties": {
                        "param1": {"type": "string", "description": "..."},
                    },
                    "required": ["param1"],
                },
                handler=self._handle_my_tool,
            ),
        ]
        
        super().__init__(
            agent_id=AgentId.MY_NEW_AGENT,  # Add to AgentId enum
            name="MyNewAgent",
            instructions="System prompt for the agent...",
            capabilities=[CapabilityCategory.MY_CATEGORY],
            handoff_targets=[AgentId.CONDUCTOR],
            tool_definitions=tool_definitions,
        )
    
    async def _handle_my_tool(self, ctx: Any, args: str) -> str:
        # Implement tool logic
        arguments = json.loads(args)
        result = await self._do_something(arguments)
        return json.dumps({"success": True, "data": result})
```

2. **Register agent ID** in `python_agents/agents/base.py`:

```python
class AgentId(Enum):
    # ...existing agents...
    MY_NEW_AGENT = "my_new_agent"
```

3. **Add intent mappings** in `python_agents/agents/conductor.py`:

```python
INTENT_TO_AGENT = {
    # ...
    IntentType.MY_INTENT: AgentId.MY_NEW_AGENT,
}
```

4. **Register with Conductor** in `python_agents/main.py`:

```python
from agents import MyNewAgent

conductor.register_specialist(MyNewAgent())
```

5. **Export from package** in `python_agents/agents/__init__.py`:

```python
from .my_new_agent import MyNewAgent
```

## Best Practices

1. **Keep agents focused**: Each agent should have a clear, bounded responsibility
2. **Use bridge tools**: For Node.js capabilities, use `create_bridge_tool()`
3. **Handle errors gracefully**: Return structured error responses
4. **Log appropriately**: Use the provided logger for debugging
5. **Respect context**: Use memory_context when available
6. **Be action-oriented**: Execute tasks rather than just suggesting

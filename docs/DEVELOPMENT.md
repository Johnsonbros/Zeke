# ZEKE Development Guidelines

This document provides coding guidelines, conventions, and best practices for developers working on ZEKE.

## Project Structure

```
ZEKE/
├── client/                 # React frontend (Vite + TypeScript)
│   └── src/
│       ├── components/     # UI components
│       ├── pages/          # Route pages
│       └── lib/            # Utilities
├── server/                 # Node.js backend (Express + TypeScript)
│   ├── routes.ts           # API routes
│   ├── storage.ts          # Data persistence
│   └── tools/              # AI tool implementations
├── python_agents/          # Python agent system (FastAPI)
│   ├── agents/             # Specialist agents
│   ├── main.py             # FastAPI app
│   ├── bridge.py           # Node.js communication
│   └── intent_router.py    # Intent classification
├── core/                   # Core Python modules
│   └── memory/             # Long-term memory system
├── shared/                 # Shared TypeScript types
│   └── schema.ts           # Data models
├── tests/                  # Python tests
├── eval/                   # Evaluation harness
└── docs/                   # Documentation
```

## Language-Specific Conventions

### Python (Agents)

**Location**: `python_agents/`, `core/`

**Style**:
- Python 3.11+
- Type hints on all function signatures
- Async/await for I/O operations
- Dataclasses for data structures

```python
# Good
async def search_memories(
    query: str,
    scope: str | None = None,
    limit: int = 10,
) -> list[MemorySearchResult]:
    """Search memories with optional scope filtering."""
    ...

# Bad
def search_memories(query, scope=None, limit=10):
    ...
```

**Imports**:
```python
# Standard library
import json
import logging
from datetime import datetime
from typing import Optional, Any

# Third-party
from openai import AsyncOpenAI
from agents import Agent, Tool

# Local
from .base import BaseAgent, AgentId
from core.memory import remember, recall
```

**Logging**:
```python
import logging

logger = logging.getLogger(__name__)

logger.debug("Detailed debugging info")
logger.info("General information")
logger.warning("Something unexpected")
logger.error("Error occurred", exc_info=True)
```

### TypeScript (Frontend/Backend)

**Location**: `client/`, `server/`, `shared/`

**Style**:
- Strict TypeScript
- Functional components (React)
- Named exports preferred

```typescript
// Good
export async function searchMemories(
  query: string,
  options?: SearchOptions
): Promise<Memory[]> {
  ...
}

// Bad
export default function(query: any) {
  ...
}
```

**React Components**:
```typescript
interface ChatMessageProps {
  message: Message;
  onReply?: (content: string) => void;
}

export function ChatMessage({ message, onReply }: ChatMessageProps) {
  return (
    <div data-testid={`message-${message.id}`}>
      {message.content}
    </div>
  );
}
```

## Agent Development

### Creating a New Agent

1. **Define the agent class**:

```python
# python_agents/agents/my_agent.py
from .base import BaseAgent, AgentId, CapabilityCategory, ToolDefinition

class MyAgent(BaseAgent):
    """
    My Agent - Brief description of role.
    
    This agent is responsible for:
    - First responsibility
    - Second responsibility
    
    Attributes:
        agent_id: MY_AGENT
        capabilities: [MY_CATEGORY]
        handoff_targets: [CONDUCTOR]
    """
    
    def __init__(self):
        tool_definitions = [
            ToolDefinition(
                name="my_tool",
                description="What this tool does",
                parameters={
                    "type": "object",
                    "properties": {
                        "param": {"type": "string", "description": "..."},
                    },
                    "required": ["param"],
                },
                handler=self._handle_my_tool,
            ),
        ]
        
        super().__init__(
            agent_id=AgentId.MY_AGENT,
            name="MyAgent",
            instructions=self._build_instructions(),
            capabilities=[CapabilityCategory.MY_CATEGORY],
            handoff_targets=[AgentId.CONDUCTOR],
            tool_definitions=tool_definitions,
        )
    
    def _build_instructions(self) -> str:
        return """You are MyAgent, a specialist in...
        
        Your responsibilities:
        1. First thing
        2. Second thing
        
        Always:
        - Be action-oriented
        - Use tools when appropriate
        - Provide clear confirmations
        """
    
    async def _handle_my_tool(self, ctx: Any, args: str) -> str:
        try:
            arguments = json.loads(args)
            # ... implementation ...
            return json.dumps({"success": True, "data": result})
        except Exception as e:
            logger.error(f"Tool failed: {e}")
            return json.dumps({"success": False, "error": str(e)})
```

2. **Register the agent ID** in `python_agents/agents/base.py`:

```python
class AgentId(Enum):
    # ... existing ...
    MY_AGENT = "my_agent"
```

3. **Add intent mappings** if needed in `python_agents/agents/conductor.py`

4. **Export from package** in `python_agents/agents/__init__.py`

### Tool Patterns

**Bridge Tool (calls Node.js)**:
```python
from .base import create_bridge_tool

send_sms_tool = create_bridge_tool(
    tool_name="send_sms",
    description="Send an SMS message",
    parameters={
        "type": "object",
        "properties": {
            "to": {"type": "string"},
            "message": {"type": "string"},
        },
        "required": ["to", "message"],
    }
)
```

**Local Tool (Python implementation)**:
```python
ToolDefinition(
    name="calculate_score",
    description="Calculate relevance score",
    parameters={
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "document": {"type": "string"},
        },
        "required": ["query", "document"],
    },
    handler=self._handle_calculate_score,
)
```

## Memory System Usage

### Storing Memories

```python
from core.memory import remember
from core.memory.schemas import MemoryScope

# User preference (permanent)
await remember(
    text="User prefers brief responses",
    scope=MemoryScope.persona("preferences"),
    tags=["communication", "style"],
)

# Task outcome (90-day TTL)
await remember(
    text="Sent reminder about dentist appointment",
    scope=MemoryScope.ops("reminders"),
    tags=["reminder", "health"],
    ttl_seconds=90 * 86400,
)
```

### Retrieving Memories

```python
from core.memory import recall

# Search with scope filter
memories = await recall(
    query="communication preferences",
    scope="persona:*",  # Wildcard
    k=5,
    min_score=0.3,
)

for mem in memories:
    print(f"[{mem.score:.2f}] {mem.item.text}")
```

## Testing

### Unit Tests

```python
# tests/test_my_feature.py
import pytest
from core.memory import remember, recall

@pytest.fixture
async def memory_store():
    """Create test memory store."""
    store = MemoryStore(MemoryConfig(db_path=":memory:"))
    store.initialize()
    yield store
    store.close()

@pytest.mark.asyncio
async def test_remember_and_recall(memory_store):
    """Test basic memory operations."""
    memory_id = await remember(
        text="Test memory",
        scope="test:unit",
    )
    
    results = await recall(query="test", scope="test:*", k=1)
    
    assert len(results) == 1
    assert results[0].item.id == memory_id
```

### Running Tests

```bash
# All tests
python -m pytest tests/ -v

# Specific module
python -m pytest tests/memory_tests/ -v

# With coverage
python -m pytest tests/ --cov=core --cov-report=html
```

### Evaluation Harness

```bash
# Run all evals
python eval/runner.py

# Specific eval
python eval/runner.py -t summarize
```

## Error Handling

### Agent Errors

```python
async def _handle_my_tool(self, ctx: Any, args: str) -> str:
    try:
        arguments = json.loads(args)
        result = await self._do_operation(arguments)
        return json.dumps({"success": True, "data": result})
    
    except json.JSONDecodeError as e:
        return json.dumps({
            "success": False,
            "error": f"Invalid JSON: {e}"
        })
    
    except OperationError as e:
        logger.warning(f"Operation failed: {e}")
        return json.dumps({
            "success": False,
            "error": str(e),
            "recoverable": True,
        })
    
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        return json.dumps({
            "success": False,
            "error": "An unexpected error occurred"
        })
```

### Memory Errors

```python
try:
    memories = await recall(query=query, scope=scope, k=5)
except Exception as e:
    logger.warning(f"Memory recall failed: {e}")
    memories = []  # Graceful degradation
```

## Configuration

### Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-...

# Memory System
MEMORY_DB=./data/memory.db
EMBED_MODEL=text-embedding-3-small
MEMORY_MAX_ROWS=20000

# External Services
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
PERPLEXITY_API_KEY=...
```

### Adding New Config

1. Add to environment (`.env` or secrets)
2. Reference in `python_agents/config.py`:

```python
class Settings(BaseSettings):
    my_new_setting: str = Field(default="default_value")
    
    model_config = SettingsConfigDict(env_file=".env")
```

## Performance Considerations

### Async Operations

```python
# Good: Parallel execution
results = await asyncio.gather(
    search_memories(query1),
    search_memories(query2),
    search_memories(query3),
)

# Bad: Sequential execution
result1 = await search_memories(query1)
result2 = await search_memories(query2)
result3 = await search_memories(query3)
```

### Memory Queries

```python
# Good: Scoped query
await recall(query="...", scope="persona:preferences", k=5)

# Bad: Global query (searches everything)
await recall(query="...", k=100)
```

### Caching

```python
from functools import lru_cache

@lru_cache(maxsize=100)
def get_intent_patterns(category: str) -> list[Pattern]:
    """Cache compiled regex patterns."""
    ...
```

## Design Principles

1. **Action-Oriented**: Execute tasks rather than just suggesting
2. **Graceful Degradation**: Continue with reduced functionality when components fail
3. **Explicit Over Implicit**: Clear function signatures and return types
4. **Single Responsibility**: Each agent/module has one clear purpose
5. **Memory-Aware**: Use context from memory when available
6. **User-First**: Never tell users to "check themselves" - provide answers

# ZEKE Memory System

This document describes the persistent long-term memory system that enables ZEKE to maintain context across conversations and sessions.

## Overview

ZEKE's memory system combines:
- **SQLite** for persistent storage
- **FTS5** for full-text search with BM25 ranking
- **Vector embeddings** for semantic similarity search
- **Scoped storage** with configurable TTL and capacity limits
- **Automatic eviction** via TTL expiration and LRU cleanup

## Architecture

```
+------------------+     +------------------+     +------------------+
|   Conductor      | --> |  Memory Module   | --> |     SQLite       |
|  (recall/remember)|    |  (core/memory/)  |     |  + FTS5 + Vectors|
+------------------+     +------------------+     +------------------+
                              |
                              v
                         +----------+
                         | OpenAI   |
                         | Embeddings|
                         +----------+
```

## Core Components

### Location: `/core/memory/`

| File | Purpose |
|------|---------|
| `__init__.py` | Public API exports |
| `schemas.py` | Data models (MemoryItem, MemoryConfig, etc.) |
| `memory_store.py` | SQLite + FTS5 + vector storage |
| `middleware.py` | High-level API (remember, recall, forget) |
| `embeddings.py` | Embedding provider abstraction |
| `evictor.py` | TTL expiration and LRU cleanup |
| `integration.py` | Helper functions for common patterns |

## API Reference

### Core Functions

```python
from core.memory import remember, recall, forget, evict_stale_and_lru

# Store a memory
memory_id = await remember(
    text="User prefers morning meetings before 10am",
    scope="persona:preferences",
    tags=["scheduling", "preference"],
    ttl_seconds=None,  # No expiration for persona scope
)

# Retrieve relevant memories
memories = await recall(
    query="What time does user like meetings?",
    scope="persona:*",  # Wildcard for all persona scopes
    k=5,  # Return top 5 results
    min_score=0.3,  # Minimum relevance threshold
)

# Delete a memory
success = await forget(memory_id)

# Run eviction (TTL + LRU cleanup)
stats = await evict_stale_and_lru()
```

### Memory Item Structure

```python
@dataclass
class MemoryItem:
    id: str              # UUID
    text: str            # Memory content
    scope: str           # Scope identifier (e.g., "persona:preferences")
    tags: list[str]      # Categorization tags
    created_at: datetime # Creation timestamp
    last_accessed_at: datetime | None  # For LRU tracking
    ttl_seconds: int | None  # Time-to-live (None = no expiration)
    embedding: list[float] | None  # Vector embedding
```

### Search Results

```python
@dataclass
class MemorySearchResult:
    item: MemoryItem
    score: float         # Relevance score (0-1)
    match_type: str      # "hybrid", "fts", or "vector"
```

## Scopes

Memories are organized into scopes for logical separation and policy application:

| Scope Pattern | TTL | Capacity | Use Case |
|---------------|-----|----------|----------|
| `persona:*` | None (permanent) | 5,000 | User preferences, personality |
| `task:*` | 90 days | 10,000 | Task execution context |
| `ops:*` | 90 days | 10,000 | Operational outcomes |
| `calendar:*` | 90 days | 5,000 | Calendar event context |
| `notes` | None | 5,000 | User notes and documents |

### Scope Helpers

```python
from core.memory.schemas import MemoryScope

# Create scoped identifiers
scope = MemoryScope.persona("preferences")  # "persona:preferences"
scope = MemoryScope.task("shopping")        # "task:shopping"
scope = MemoryScope.ops("reminders")        # "ops:reminders"
scope = MemoryScope.calendar()              # "calendar:events"
```

## Search Modes

### Hybrid Search (Default)

Combines FTS5 and vector similarity with weighted scoring:
- **40% FTS5 BM25** - Keyword matching
- **60% Vector similarity** - Semantic matching

```python
# Hybrid search (default)
results = await recall(query="meeting preferences", k=5)
```

### FTS-Only Search

For faster keyword-focused queries:

```python
from core.memory.memory_store import get_memory_store

store = get_memory_store()
results = store.fts_search(query="morning meetings", limit=10)
```

### Vector-Only Search

For pure semantic similarity:

```python
results = store.vector_search(query="scheduling preferences", limit=10)
```

## Eviction Policies

### TTL Expiration

Memories with `ttl_seconds` are automatically expired:

```python
# Store with 7-day TTL
await remember(
    text="Temporary context",
    scope="task:temporary",
    ttl_seconds=7 * 86400,  # 7 days in seconds
)
```

### LRU Eviction

When a scope exceeds its capacity, least-recently-accessed memories are evicted:

```python
# Check memory stats
from core.memory.evictor import get_memory_stats

stats = await get_memory_stats()
# Returns: {"persona:*": {"count": 2500, "cap": 5000, "oldest": "2024-01-15"}, ...}
```

### Running Eviction

Eviction runs automatically:
- On server startup
- Every 6 hours via scheduled job

Manual eviction:

```python
from core.memory import evict_stale_and_lru

stats = await evict_stale_and_lru()
print(f"Evicted: {stats['ttl_expired']} expired, {stats['lru_evicted']} by LRU")
```

## Integration with Conductor

The memory system integrates with the Conductor agent pipeline:

### Automatic Recall (Before Processing)

```python
# In conductor._execute():
if MEMORY_MODULE_AVAILABLE and recall:
    memories = await recall(
        query=input_text,
        scope="persona:*",
        k=5,
    )
    if memories:
        context.memory_context["recalled"] = [
            {"text": m.item.text, "score": m.score}
            for m in memories
        ]
```

### Automatic Remember (After Task Completion)

```python
# Only for actionable, successful tasks:
actionable_intents = [
    IntentType.SEND_MESSAGE, IntentType.CREATE_EVENT,
    IntentType.SET_REMINDER, IntentType.ADD_TASK, ...
]

if intent.type in actionable_intents and any(r.success for r in responses):
    await remember_task_context(
        task_description=input_text[:200],   # Truncated to 200 chars
        result_summary=final_response[:300], # Truncated to 300 chars
        scope=f"ops:{intent.type.value}",
        tags=[intent.category.value],
    )
```

**Notes**:
- Only actionable intents with at least one successful response are stored
- Input and output are truncated to prevent excessive storage
- General chitchat and failed operations are not stored

## Integration Helpers

Common memory patterns have dedicated helper functions:

```python
from core.memory.integration import (
    remember_user_preference,
    remember_task_context,
    remember_calendar_outcome,
    recall_user_preferences,
    recall_recent_tasks,
)

# Store a user preference
await remember_user_preference(
    preference_type="scheduling",
    preference_value="Prefers morning meetings",
    tags=["calendar"],
)

# Recall preferences for a domain
preferences = await recall_user_preferences(
    domain="scheduling",
    k=10,
)
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMORY_DB` | `./data/memory.db` | SQLite database path |
| `EMBED_MODEL` | `text-embedding-3-small` | OpenAI embedding model |
| `MEMORY_MAX_ROWS` | `20000` | Global memory limit |

### Memory Config

```python
from core.memory.schemas import MemoryConfig

config = MemoryConfig(
    db_path="./data/memory.db",
    embed_model="text-embedding-3-small",
    fts_weight=0.4,      # FTS5 weight in hybrid search
    vector_weight=0.6,   # Vector weight in hybrid search
    max_memories=20000,  # Global cap
)
```

## Embedding Providers

### OpenAI (Default)

```python
from core.memory.embeddings import OpenAIEmbedding

provider = OpenAIEmbedding(model="text-embedding-3-small")
embedding = await provider.embed("Some text")
```

**Note**: If embedding generation fails (e.g., missing API key), the system logs a warning and continues with FTS-only search. Embeddings are optional but recommended for semantic search quality.

### Local Models (Optional)

```python
from core.memory.embeddings import LocalEmbedding

provider = LocalEmbedding(model_name="all-MiniLM-L6-v2")
embedding = await provider.embed("Some text")
```

## Database Schema

```sql
CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    scope TEXT NOT NULL,
    tags TEXT,           -- JSON array
    created_at TEXT NOT NULL,
    last_accessed_at TEXT,
    ttl_seconds INTEGER,
    embedding BLOB       -- Serialized float array
);

-- Indexes
CREATE INDEX idx_memories_scope ON memories(scope);
CREATE INDEX idx_memories_created_at ON memories(created_at);

-- FTS5 virtual table
CREATE VIRTUAL TABLE memories_fts USING fts5(
    id, text, scope, tags,
    content='memories',
    content_rowid='rowid'
);
```

## Testing

Unit tests are in `tests/memory_tests/test_memory_store.py`:

```bash
# Run all memory tests
python -m pytest tests/memory_tests/ -v

# Run specific test class
python -m pytest tests/memory_tests/test_memory_store.py::TestMemoryStore -v
```

Test coverage includes:
- Basic upsert and retrieval
- FTS5 search with escaping
- Vector similarity search
- Hybrid search scoring
- TTL expiration
- LRU eviction
- Scope filtering
- Middleware (remember/recall/forget)

## Best Practices

1. **Use appropriate scopes**: Match scope to data lifetime and access patterns
2. **Tag consistently**: Use consistent tags for filtering and categorization
3. **Mind the TTL**: Set TTL for transient data to prevent unbounded growth
4. **Batch operations**: Use bulk methods for multiple operations
5. **Handle gracefully**: Memory operations may fail; always handle exceptions
6. **Query specifically**: Use scope filters to narrow search space

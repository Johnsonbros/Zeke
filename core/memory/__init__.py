"""
ZEKE Long-term Memory Module.

Provides persistent memory storage with:
- SQLite + FTS5 for text search
- Vector embeddings for semantic search
- Scoped memories (persona, task, etc.)
- TTL-based expiration and LRU eviction

Usage:
    from core.memory import remember, recall, evict_stale_and_lru
    
    # Store a memory
    memory_id = await remember(
        text="User prefers morning meetings",
        scope="persona:zeke",
        tags=["preference", "scheduling"]
    )
    
    # Retrieve relevant memories
    memories = await recall(
        query="What time does the user like meetings?",
        scope="persona:zeke",
        k=5
    )
    
    # Clean up old memories
    await evict_stale_and_lru()
"""

from .schemas import MemoryItem, MemoryScope, MemoryConfig
from .middleware import remember, recall, forget, get_memory
from .evictor import evict_stale_and_lru, get_memory_stats
from .memory_store import MemoryStore
from .integration import (
    get_relevant_context,
    remember_tool_outcome,
    remember_user_preference,
    remember_task_context,
    remember_calendar_outcome,
    format_memories_for_prompt,
)

__all__ = [
    "MemoryItem",
    "MemoryScope", 
    "MemoryConfig",
    "remember",
    "recall",
    "forget",
    "get_memory",
    "evict_stale_and_lru",
    "get_memory_stats",
    "MemoryStore",
    "get_relevant_context",
    "remember_tool_outcome",
    "remember_user_preference",
    "remember_task_context",
    "remember_calendar_outcome",
    "format_memories_for_prompt",
]

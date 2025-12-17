"""
High-level memory API: remember() and recall().

These are the primary functions agents should use to interact with the memory system.
"""

import os
import logging
from typing import Optional
from datetime import datetime

from .schemas import MemoryItem, MemoryScope, MemoryConfig, MemorySearchResult
from .memory_store import get_memory_store, MemoryStore

logger = logging.getLogger(__name__)


def _get_config() -> MemoryConfig:
    """Build config from environment variables."""
    return MemoryConfig(
        db_path=os.environ.get("MEMORY_DB", "./data/memory.db"),
        embed_model=os.environ.get("EMBED_MODEL", "text-embedding-3-small"),
        max_rows=int(os.environ.get("MEMORY_MAX_ROWS", "20000")),
    )


def _get_default_ttl(scope: str, config: MemoryConfig) -> Optional[int]:
    """Get default TTL based on scope."""
    if scope.startswith("persona:"):
        return None
    if scope.startswith("task:") or scope.startswith("ops:"):
        return config.ops_ttl_days * 86400
    if scope.startswith("calendar:"):
        return 90 * 86400
    return None


async def remember(
    text: str,
    scope: str,
    tags: Optional[list[str]] = None,
    ttl_seconds: Optional[int] = None,
    memory_id: Optional[str] = None,
) -> str:
    """
    Store a memory for later retrieval.
    
    Args:
        text: The content to remember
        scope: Memory scope (e.g., "persona:zeke", "task:scheduling")
               Common scopes:
               - "persona:zeke" - Core personality and preferences (no TTL)
               - "task:<name>" - Task-specific context (90 day TTL)
               - "ops:<category>" - Operational data (90 day TTL)
               - "calendar:<type>" - Calendar/booking data (90 day TTL)
               - "notes" - User notes (no TTL)
        tags: Optional tags for categorization
        ttl_seconds: Time-to-live in seconds. If None, uses scope default.
        memory_id: Optional ID for the memory. If provided, updates existing.
        
    Returns:
        The memory ID
        
    Example:
        # Remember a user preference
        await remember(
            "User prefers morning meetings before 10am",
            scope="persona:zeke",
            tags=["preference", "scheduling"]
        )
        
        # Remember task context with TTL
        await remember(
            "Smith project deadline is March 15th",
            scope="task:smith-project",
            tags=["deadline", "customer:smith"],
            ttl_seconds=90*86400
        )
    """
    config = _get_config()
    store = get_memory_store(config)
    
    effective_ttl = ttl_seconds
    if effective_ttl is None:
        effective_ttl = _get_default_ttl(scope, config)
    
    item = MemoryItem(
        text=text,
        scope=scope,
        tags=tags or [],
        ttl_seconds=effective_ttl,
        created_at=datetime.utcnow(),
    )
    
    if memory_id:
        item.id = memory_id
    
    memory_id = await store.upsert(item)
    logger.info(f"Remembered: '{text[:50]}...' in scope {scope} (id={memory_id})")
    
    return memory_id


async def recall(
    query: str,
    scope: Optional[str] = None,
    k: int = 5,
    include_all_scopes: bool = False,
) -> list[MemoryItem]:
    """
    Retrieve relevant memories for a query.
    
    Uses hybrid search (vector similarity + FTS5 BM25) to find
    the most relevant memories.
    
    Args:
        query: The search query
        scope: Scope to filter by (e.g., "persona:zeke"). If None and
               include_all_scopes is False, searches "persona:zeke" by default.
        k: Maximum number of results to return
        include_all_scopes: If True, searches all scopes regardless of scope param
        
    Returns:
        List of matching MemoryItem objects, sorted by relevance
        
    Example:
        # Find memories about scheduling preferences
        memories = await recall(
            "What time does the user prefer meetings?",
            scope="persona:zeke"
        )
        
        # Search across all task scopes
        memories = await recall(
            "Smith project deadline",
            scope="task:",  # Prefix matches all task:* scopes
        )
    """
    config = _get_config()
    store = get_memory_store(config)
    
    search_scope = scope
    if not include_all_scopes and search_scope is None:
        search_scope = MemoryScope.persona()
    
    results: list[MemorySearchResult] = await store.search(
        query=query,
        scope=search_scope if not include_all_scopes else None,
        k=k,
    )
    
    items = [r.item for r in results]
    
    if items:
        logger.debug(f"Recalled {len(items)} memories for '{query[:30]}...' (scope={search_scope})")
    else:
        logger.debug(f"No memories found for '{query[:30]}...' (scope={search_scope})")
    
    return items


async def recall_with_scores(
    query: str,
    scope: Optional[str] = None,
    k: int = 5,
) -> list[MemorySearchResult]:
    """
    Retrieve memories with relevance scores.
    
    Same as recall() but returns MemorySearchResult objects
    that include the relevance score and match type.
    
    Args:
        query: The search query
        scope: Scope to filter by
        k: Maximum number of results
        
    Returns:
        List of MemorySearchResult objects
    """
    config = _get_config()
    store = get_memory_store(config)
    
    return await store.search(query=query, scope=scope, k=k)


async def forget(memory_id: str) -> bool:
    """
    Delete a specific memory by ID.
    
    Args:
        memory_id: The ID of the memory to delete
        
    Returns:
        True if deleted, False if not found
    """
    config = _get_config()
    store = get_memory_store(config)
    return store.delete(memory_id)


async def get_memory(memory_id: str) -> Optional[MemoryItem]:
    """
    Get a specific memory by ID.
    
    Args:
        memory_id: The ID of the memory
        
    Returns:
        MemoryItem if found, None otherwise
    """
    config = _get_config()
    store = get_memory_store(config)
    return store.get_by_id(memory_id)

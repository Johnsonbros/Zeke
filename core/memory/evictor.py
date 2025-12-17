"""
Memory eviction and cleanup.

Handles:
- TTL-based expiration
- LRU eviction when scope caps are exceeded
- Per-scope size limits
"""

import os
import logging
from datetime import datetime, timedelta
from typing import Optional

from .schemas import MemoryConfig
from .memory_store import get_memory_store

logger = logging.getLogger(__name__)


def _get_config() -> MemoryConfig:
    """Build config from environment variables."""
    return MemoryConfig(
        db_path=os.environ.get("MEMORY_DB", "./data/memory.db"),
        embed_model=os.environ.get("EMBED_MODEL", "text-embedding-3-small"),
        max_rows=int(os.environ.get("MEMORY_MAX_ROWS", "20000")),
    )


async def evict_stale_and_lru(config: Optional[MemoryConfig] = None) -> dict:
    """
    Clean up expired and excess memories.
    
    This function:
    1. Deletes memories where created_at + ttl < now (TTL expired)
    2. Enforces per-scope row limits using LRU (least recently used)
    3. Enforces global row limit
    
    Should be run on startup and periodically (e.g., every 6 hours).
    
    Args:
        config: Optional MemoryConfig. Uses defaults if not provided.
        
    Returns:
        dict with eviction statistics:
        - ttl_expired: Number of memories deleted due to TTL
        - lru_evicted: Number of memories evicted due to caps
        - scopes_cleaned: List of scopes that had LRU eviction
    """
    if config is None:
        config = _get_config()
    
    store = get_memory_store(config)
    store.initialize()
    
    stats = {
        "ttl_expired": 0,
        "lru_evicted": 0,
        "scopes_cleaned": [],
    }
    
    conn = store._get_connection()
    cursor = conn.cursor()
    
    now = datetime.utcnow()
    
    cursor.execute("""
        SELECT id, created_at, ttl_seconds FROM memories
        WHERE ttl_seconds IS NOT NULL
    """)
    
    expired_ids = []
    for row in cursor.fetchall():
        created_at = datetime.fromisoformat(row['created_at'])
        ttl = row['ttl_seconds']
        expires_at = created_at + timedelta(seconds=ttl)
        if now > expires_at:
            expired_ids.append(row['id'])
    
    if expired_ids:
        placeholders = ','.join('?' * len(expired_ids))
        cursor.execute(f"DELETE FROM memories WHERE id IN ({placeholders})", expired_ids)
        conn.commit()
        stats["ttl_expired"] = len(expired_ids)
        logger.info(f"Evicted {len(expired_ids)} TTL-expired memories")
    
    scope_limits = {
        "persona:": config.persona_max_rows,
        "task:": config.ops_max_rows,
        "ops:": config.ops_max_rows,
        "calendar:": config.ops_max_rows,
        "notes": config.ops_max_rows,
    }
    
    for scope_prefix, max_rows in scope_limits.items():
        cursor.execute("""
            SELECT COUNT(*) as cnt FROM memories WHERE scope LIKE ?
        """, (f"{scope_prefix}%",))
        count = cursor.fetchone()['cnt']
        
        if count > max_rows:
            excess = count - max_rows
            
            cursor.execute("""
                SELECT id FROM memories 
                WHERE scope LIKE ?
                ORDER BY 
                    COALESCE(last_accessed_at, created_at) ASC,
                    created_at ASC
                LIMIT ?
            """, (f"{scope_prefix}%", excess))
            
            ids_to_delete = [row['id'] for row in cursor.fetchall()]
            
            if ids_to_delete:
                placeholders = ','.join('?' * len(ids_to_delete))
                cursor.execute(f"DELETE FROM memories WHERE id IN ({placeholders})", ids_to_delete)
                conn.commit()
                stats["lru_evicted"] += len(ids_to_delete)
                stats["scopes_cleaned"].append(scope_prefix)
                logger.info(f"LRU-evicted {len(ids_to_delete)} memories from {scope_prefix}* scope")
    
    cursor.execute("SELECT COUNT(*) as cnt FROM memories")
    total_count = cursor.fetchone()['cnt']
    
    if total_count > config.max_rows:
        excess = total_count - config.max_rows
        
        cursor.execute("""
            SELECT id FROM memories 
            ORDER BY 
                COALESCE(last_accessed_at, created_at) ASC,
                created_at ASC
            LIMIT ?
        """, (excess,))
        
        ids_to_delete = [row['id'] for row in cursor.fetchall()]
        
        if ids_to_delete:
            placeholders = ','.join('?' * len(ids_to_delete))
            cursor.execute(f"DELETE FROM memories WHERE id IN ({placeholders})", ids_to_delete)
            conn.commit()
            stats["lru_evicted"] += len(ids_to_delete)
            logger.info(f"LRU-evicted {len(ids_to_delete)} memories (global cap)")
    
    return stats


async def get_memory_stats(config: Optional[MemoryConfig] = None) -> dict:
    """
    Get memory store statistics.
    
    Returns:
        dict with stats:
        - total_memories: Total number of memories
        - by_scope: Count per scope prefix
        - with_ttl: Number of memories with TTL set
        - with_embedding: Number of memories with embeddings
    """
    if config is None:
        config = _get_config()
    
    store = get_memory_store(config)
    store.initialize()
    
    conn = store._get_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) as cnt FROM memories")
    total = cursor.fetchone()['cnt']
    
    scope_prefixes = ["persona:", "task:", "ops:", "calendar:", "notes"]
    by_scope = {}
    for prefix in scope_prefixes:
        cursor.execute("SELECT COUNT(*) as cnt FROM memories WHERE scope LIKE ?", (f"{prefix}%",))
        by_scope[prefix] = cursor.fetchone()['cnt']
    
    cursor.execute("SELECT COUNT(*) as cnt FROM memories WHERE ttl_seconds IS NOT NULL")
    with_ttl = cursor.fetchone()['cnt']
    
    cursor.execute("SELECT COUNT(*) as cnt FROM memories WHERE embedding IS NOT NULL")
    with_embedding = cursor.fetchone()['cnt']
    
    return {
        "total_memories": total,
        "by_scope": by_scope,
        "with_ttl": with_ttl,
        "with_embedding": with_embedding,
        "max_rows": config.max_rows,
    }

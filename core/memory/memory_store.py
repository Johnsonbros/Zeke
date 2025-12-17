"""
SQLite + FTS5 memory store with vector similarity search.
"""

import os
import json
import sqlite3
import logging
import math
from datetime import datetime
from typing import Optional
from pathlib import Path

from .schemas import MemoryItem, MemorySearchResult, MemoryConfig
from .embeddings import get_embedding_provider, EmbeddingProvider

logger = logging.getLogger(__name__)


def cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    if not vec1 or not vec2 or len(vec1) != len(vec2):
        return 0.0
    
    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    norm1 = math.sqrt(sum(a * a for a in vec1))
    norm2 = math.sqrt(sum(b * b for b in vec2))
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    return dot_product / (norm1 * norm2)


class MemoryStore:
    """
    SQLite-based memory store with FTS5 full-text search and vector similarity.
    
    Uses:
    - SQLite for persistent storage
    - FTS5 for BM25 text search
    - Pure Python cosine similarity for vector search (sqlite-vss optional upgrade)
    """
    
    def __init__(self, config: Optional[MemoryConfig] = None):
        self.config = config or MemoryConfig()
        self._embedding_provider: Optional[EmbeddingProvider] = None
        self._conn: Optional[sqlite3.Connection] = None
        self._initialized = False
        
    def _get_connection(self) -> sqlite3.Connection:
        """Get or create database connection."""
        if self._conn is None:
            db_path = Path(self.config.db_path)
            db_path.parent.mkdir(parents=True, exist_ok=True)
            self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
            self._conn.row_factory = sqlite3.Row
        return self._conn
    
    def _get_embedding_provider(self) -> EmbeddingProvider:
        """Get or create embedding provider."""
        if self._embedding_provider is None:
            self._embedding_provider = get_embedding_provider(self.config.embed_model)
        return self._embedding_provider
    
    def initialize(self) -> None:
        """Initialize database schema."""
        if self._initialized:
            return
            
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                text TEXT NOT NULL,
                scope TEXT NOT NULL,
                tags TEXT,
                created_at TEXT NOT NULL,
                last_accessed_at TEXT,
                ttl_seconds INTEGER,
                embedding BLOB
            )
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope)
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at)
        """)
        
        cursor.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
                id,
                text,
                scope,
                tags,
                content='memories',
                content_rowid='rowid'
            )
        """)
        
        cursor.execute("""
            CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
                INSERT INTO memories_fts(rowid, id, text, scope, tags) 
                VALUES (new.rowid, new.id, new.text, new.scope, new.tags);
            END
        """)
        
        cursor.execute("""
            CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
                INSERT INTO memories_fts(memories_fts, rowid, id, text, scope, tags) 
                VALUES('delete', old.rowid, old.id, old.text, old.scope, old.tags);
            END
        """)
        
        cursor.execute("""
            CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
                INSERT INTO memories_fts(memories_fts, rowid, id, text, scope, tags) 
                VALUES('delete', old.rowid, old.id, old.text, old.scope, old.tags);
                INSERT INTO memories_fts(rowid, id, text, scope, tags) 
                VALUES (new.rowid, new.id, new.text, new.scope, new.tags);
            END
        """)
        
        conn.commit()
        self._initialized = True
        logger.info(f"Memory store initialized at {self.config.db_path}")
    
    def _serialize_embedding(self, embedding: Optional[list[float]]) -> Optional[bytes]:
        """Serialize embedding to bytes for storage."""
        if embedding is None:
            return None
        import struct
        return struct.pack(f'{len(embedding)}f', *embedding)
    
    def _deserialize_embedding(self, data: Optional[bytes]) -> Optional[list[float]]:
        """Deserialize embedding from bytes."""
        if data is None:
            return None
        import struct
        count = len(data) // 4
        return list(struct.unpack(f'{count}f', data))
    
    async def upsert(self, item: MemoryItem, generate_embedding: bool = True) -> str:
        """
        Insert or update a memory item.
        
        Args:
            item: The memory item to store
            generate_embedding: Whether to generate embedding if not present
            
        Returns:
            The memory ID
        """
        self.initialize()
        
        if generate_embedding and item.embedding is None:
            try:
                provider = self._get_embedding_provider()
                item.embedding = await provider.embed(item.text)
            except Exception as e:
                logger.warning(f"Failed to generate embedding: {e}")
        
        conn = self._get_connection()
        cursor = conn.cursor()
        
        embedding_blob = self._serialize_embedding(item.embedding)
        tags_json = json.dumps(item.tags) if item.tags else None
        
        cursor.execute("""
            INSERT INTO memories (id, text, scope, tags, created_at, last_accessed_at, ttl_seconds, embedding)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                text = excluded.text,
                scope = excluded.scope,
                tags = excluded.tags,
                last_accessed_at = excluded.last_accessed_at,
                ttl_seconds = excluded.ttl_seconds,
                embedding = excluded.embedding
        """, (
            item.id,
            item.text,
            item.scope,
            tags_json,
            item.created_at.isoformat(),
            item.last_accessed_at.isoformat() if item.last_accessed_at else None,
            item.ttl_seconds,
            embedding_blob,
        ))
        
        conn.commit()
        logger.debug(f"Upserted memory {item.id} in scope {item.scope}")
        return item.id
    
    async def search(
        self,
        query: str,
        scope: Optional[str] = None,
        k: int = 8,
        use_vector: bool = True,
        use_fts: bool = True,
    ) -> list[MemorySearchResult]:
        """
        Hybrid search combining vector similarity and FTS5 BM25.
        
        Args:
            query: Search query
            scope: Optional scope filter
            k: Number of results to return
            use_vector: Whether to use vector similarity
            use_fts: Whether to use FTS5 text search
            
        Returns:
            List of MemorySearchResult sorted by combined score
        """
        self.initialize()
        
        results: dict[str, MemorySearchResult] = {}
        
        if use_fts:
            fts_results = self._search_fts(query, scope, k * 2)
            for item, score in fts_results:
                if item.id not in results:
                    results[item.id] = MemorySearchResult(item=item, score=0, match_type="fts")
                results[item.id].score += score * 0.4
        
        if use_vector:
            try:
                provider = self._get_embedding_provider()
                query_embedding = await provider.embed(query)
                vector_results = self._search_vector(query_embedding, scope, k * 2)
                for item, score in vector_results:
                    if item.id not in results:
                        results[item.id] = MemorySearchResult(item=item, score=0, match_type="vector")
                    else:
                        results[item.id].match_type = "hybrid"
                    results[item.id].score += score * 0.6
            except Exception as e:
                logger.warning(f"Vector search failed: {e}")
        
        sorted_results = sorted(results.values(), key=lambda r: r.score, reverse=True)
        
        for result in sorted_results[:k]:
            self._update_last_accessed(result.item.id)
        
        return sorted_results[:k]
    
    def _search_fts(
        self,
        query: str,
        scope: Optional[str],
        limit: int,
    ) -> list[tuple[MemoryItem, float]]:
        """Search using FTS5 with BM25 ranking."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        words = query.split()
        escaped_words = []
        for word in words:
            word = word.replace('"', '""')
            word = ''.join(c for c in word if c.isalnum() or c in ' -_')
            if word:
                escaped_words.append(f'"{word}"')
        
        if not escaped_words:
            return []
        
        safe_query = ' OR '.join(escaped_words)
        
        try:
            if scope:
                cursor.execute("""
                    SELECT m.*, bm25(memories_fts) as rank
                    FROM memories m
                    JOIN memories_fts ON m.id = memories_fts.id
                    WHERE memories_fts MATCH ? AND m.scope LIKE ?
                    ORDER BY rank
                    LIMIT ?
                """, (safe_query, f"{scope}%", limit))
            else:
                cursor.execute("""
                    SELECT m.*, bm25(memories_fts) as rank
                    FROM memories m
                    JOIN memories_fts ON m.id = memories_fts.id
                    WHERE memories_fts MATCH ?
                    ORDER BY rank
                    LIMIT ?
                """, (safe_query, limit))
            
            results = []
            for row in cursor.fetchall():
                item = self._row_to_item(row)
                score = 1.0 / (1.0 + abs(row['rank']))
                results.append((item, score))
            
            return results
        except Exception as e:
            logger.warning(f"FTS search failed: {e}")
            return []
    
    def _search_vector(
        self,
        query_embedding: list[float],
        scope: Optional[str],
        limit: int,
    ) -> list[tuple[MemoryItem, float]]:
        """Search using vector cosine similarity."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        if scope:
            cursor.execute("""
                SELECT * FROM memories 
                WHERE scope LIKE ? AND embedding IS NOT NULL
            """, (f"{scope}%",))
        else:
            cursor.execute("""
                SELECT * FROM memories WHERE embedding IS NOT NULL
            """)
        
        scored = []
        for row in cursor.fetchall():
            item = self._row_to_item(row)
            if item.embedding:
                score = cosine_similarity(query_embedding, item.embedding)
                scored.append((item, score))
        
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:limit]
    
    def _row_to_item(self, row: sqlite3.Row) -> MemoryItem:
        """Convert database row to MemoryItem."""
        tags = json.loads(row['tags']) if row['tags'] else []
        embedding = self._deserialize_embedding(row['embedding'])
        
        created_at = datetime.fromisoformat(row['created_at'])
        last_accessed = None
        if row['last_accessed_at']:
            last_accessed = datetime.fromisoformat(row['last_accessed_at'])
        
        return MemoryItem(
            id=row['id'],
            text=row['text'],
            scope=row['scope'],
            tags=tags,
            created_at=created_at,
            last_accessed_at=last_accessed,
            ttl_seconds=row['ttl_seconds'],
            embedding=embedding,
        )
    
    def _update_last_accessed(self, memory_id: str) -> None:
        """Update the last_accessed_at timestamp for a memory."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE memories SET last_accessed_at = ? WHERE id = ?
        """, (datetime.utcnow().isoformat(), memory_id))
        conn.commit()
    
    def get_by_id(self, memory_id: str) -> Optional[MemoryItem]:
        """Get a memory by ID."""
        self.initialize()
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM memories WHERE id = ?", (memory_id,))
        row = cursor.fetchone()
        if row:
            return self._row_to_item(row)
        return None
    
    def delete(self, memory_id: str) -> bool:
        """Delete a memory by ID."""
        self.initialize()
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
        conn.commit()
        return cursor.rowcount > 0
    
    def count(self, scope: Optional[str] = None) -> int:
        """Count memories, optionally filtered by scope."""
        self.initialize()
        conn = self._get_connection()
        cursor = conn.cursor()
        if scope:
            cursor.execute("SELECT COUNT(*) FROM memories WHERE scope LIKE ?", (f"{scope}%",))
        else:
            cursor.execute("SELECT COUNT(*) FROM memories")
        return cursor.fetchone()[0]
    
    def close(self) -> None:
        """Close database connection."""
        if self._conn:
            self._conn.close()
            self._conn = None


_default_store: Optional[MemoryStore] = None


def get_memory_store(config: Optional[MemoryConfig] = None) -> MemoryStore:
    """Get the default memory store instance."""
    global _default_store
    if _default_store is None:
        _default_store = MemoryStore(config)
    return _default_store

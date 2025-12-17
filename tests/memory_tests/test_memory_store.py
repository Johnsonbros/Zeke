"""
Unit tests for the memory store.

Tests cover:
- Insert/upsert operations
- FTS search
- Vector search (mocked embeddings)
- Scope filtering
- TTL expiration
- LRU eviction
"""

import pytest
import asyncio
import tempfile
import os
from datetime import datetime, timedelta
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from core.memory.schemas import MemoryItem, MemoryConfig, MemoryScope
from core.memory.memory_store import MemoryStore, cosine_similarity
from core.memory.middleware import remember, recall, forget
from core.memory.evictor import evict_stale_and_lru, get_memory_stats


class MockEmbeddingProvider:
    """Mock embedding provider for testing without API calls."""
    
    def __init__(self):
        self._call_count = 0
    
    @property
    def dimensions(self) -> int:
        return 8
    
    async def embed(self, text: str) -> list[float]:
        """Generate a simple deterministic embedding based on text hash."""
        self._call_count += 1
        h = hash(text)
        return [(h >> i) % 100 / 100.0 for i in range(8)]
    
    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        return [await self.embed(t) for t in texts]


@pytest.fixture
def temp_db_path():
    """Create a temporary database path."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield os.path.join(tmpdir, "test_memory.db")


@pytest.fixture
def memory_config(temp_db_path):
    """Create a test memory config."""
    return MemoryConfig(
        db_path=temp_db_path,
        embed_model="mock",
        max_rows=100,
        persona_max_rows=50,
        ops_max_rows=30,
    )


@pytest.fixture
def memory_store(memory_config):
    """Create a memory store with mock embeddings."""
    store = MemoryStore(memory_config)
    store._embedding_provider = MockEmbeddingProvider()
    store.initialize()
    return store


class TestCosineSimlarity:
    """Tests for cosine similarity function."""
    
    def test_identical_vectors(self):
        vec = [1.0, 2.0, 3.0]
        assert abs(cosine_similarity(vec, vec) - 1.0) < 0.001
    
    def test_orthogonal_vectors(self):
        vec1 = [1.0, 0.0]
        vec2 = [0.0, 1.0]
        assert abs(cosine_similarity(vec1, vec2)) < 0.001
    
    def test_opposite_vectors(self):
        vec1 = [1.0, 0.0]
        vec2 = [-1.0, 0.0]
        assert abs(cosine_similarity(vec1, vec2) - (-1.0)) < 0.001
    
    def test_empty_vectors(self):
        assert cosine_similarity([], []) == 0.0
    
    def test_mismatched_dimensions(self):
        assert cosine_similarity([1.0, 2.0], [1.0]) == 0.0


class TestMemoryStore:
    """Tests for MemoryStore operations."""
    
    @pytest.mark.asyncio
    async def test_upsert_and_get(self, memory_store):
        """Test inserting and retrieving a memory."""
        item = MemoryItem(
            text="Test memory content",
            scope="persona:zeke",
            tags=["test", "unit"],
        )
        
        memory_id = await memory_store.upsert(item)
        assert memory_id == item.id
        
        retrieved = memory_store.get_by_id(memory_id)
        assert retrieved is not None
        assert retrieved.text == "Test memory content"
        assert retrieved.scope == "persona:zeke"
        assert "test" in retrieved.tags
    
    @pytest.mark.asyncio
    async def test_upsert_updates_existing(self, memory_store):
        """Test that upsert updates existing memories."""
        item = MemoryItem(
            id="fixed-id",
            text="Original content",
            scope="persona:zeke",
        )
        await memory_store.upsert(item)
        
        item.text = "Updated content"
        await memory_store.upsert(item)
        
        retrieved = memory_store.get_by_id("fixed-id")
        assert retrieved.text == "Updated content"
        
        assert memory_store.count() == 1
    
    @pytest.mark.asyncio
    async def test_delete(self, memory_store):
        """Test deleting a memory."""
        item = MemoryItem(
            text="To be deleted",
            scope="task:test",
        )
        memory_id = await memory_store.upsert(item)
        
        assert memory_store.get_by_id(memory_id) is not None
        
        deleted = memory_store.delete(memory_id)
        assert deleted is True
        
        assert memory_store.get_by_id(memory_id) is None
    
    @pytest.mark.asyncio
    async def test_count_by_scope(self, memory_store):
        """Test counting memories by scope."""
        for i in range(3):
            await memory_store.upsert(MemoryItem(
                text=f"Persona memory {i}",
                scope="persona:zeke",
            ))
        
        for i in range(5):
            await memory_store.upsert(MemoryItem(
                text=f"Task memory {i}",
                scope="task:scheduling",
            ))
        
        assert memory_store.count() == 8
        assert memory_store.count(scope="persona:") == 3
        assert memory_store.count(scope="task:") == 5


class TestMemorySearch:
    """Tests for memory search operations."""
    
    @pytest.mark.asyncio
    async def test_fts_search(self, memory_store):
        """Test full-text search."""
        await memory_store.upsert(MemoryItem(
            text="User prefers morning meetings before 10am",
            scope="persona:zeke",
            tags=["preference", "scheduling"],
        ))
        
        await memory_store.upsert(MemoryItem(
            text="User likes coffee with breakfast",
            scope="persona:zeke",
            tags=["preference", "food"],
        ))
        
        await memory_store.upsert(MemoryItem(
            text="Project deadline is next Friday",
            scope="task:project",
        ))
        
        results = await memory_store.search(
            query="morning meetings",
            scope="persona:zeke",
            use_vector=False,
            k=5,
        )
        
        assert len(results) >= 1
        assert "morning" in results[0].item.text.lower()
    
    @pytest.mark.asyncio
    async def test_scope_filtering(self, memory_store):
        """Test that search respects scope filters."""
        await memory_store.upsert(MemoryItem(
            text="Important persona fact",
            scope="persona:zeke",
        ))
        
        await memory_store.upsert(MemoryItem(
            text="Task related info",
            scope="task:work",
        ))
        
        persona_results = await memory_store.search(
            query="fact",
            scope="persona:",
            use_vector=False,
            k=10,
        )
        
        for result in persona_results:
            assert result.item.scope.startswith("persona:")
    
    @pytest.mark.asyncio
    async def test_hybrid_search(self, memory_store):
        """Test combined vector + FTS search."""
        await memory_store.upsert(MemoryItem(
            text="User prefers meetings in the morning hours",
            scope="persona:zeke",
        ))
        
        await memory_store.upsert(MemoryItem(
            text="Schedule appointments before noon when possible",
            scope="persona:zeke",
        ))
        
        results = await memory_store.search(
            query="When does user like meetings?",
            scope="persona:zeke",
            use_vector=True,
            use_fts=True,
            k=5,
        )
        
        assert len(results) >= 1
        for r in results:
            assert r.match_type in ["vector", "fts", "hybrid"]


class TestMiddleware:
    """Tests for remember/recall middleware."""
    
    @pytest.mark.asyncio
    async def test_remember_and_recall(self, memory_config, monkeypatch):
        """Test high-level remember and recall functions."""
        monkeypatch.setenv("MEMORY_DB", memory_config.db_path)
        
        from core.memory import memory_store as store_module
        store_module._default_store = None
        
        store = MemoryStore(memory_config)
        store._embedding_provider = MockEmbeddingProvider()
        store_module._default_store = store
        
        try:
            memory_id = await remember(
                text="User prefers email over phone calls",
                scope="persona:zeke",
                tags=["preference", "communication"],
            )
            
            assert memory_id is not None
            
            memories = await recall(
                query="How does user prefer to communicate?",
                scope="persona:zeke",
                k=5,
            )
            
            assert len(memories) >= 1
            assert any("email" in m.text.lower() for m in memories)
        finally:
            store_module._default_store = None
    
    @pytest.mark.asyncio
    async def test_forget(self, memory_config, monkeypatch):
        """Test forget function."""
        monkeypatch.setenv("MEMORY_DB", memory_config.db_path)
        
        from core.memory import memory_store as store_module
        store_module._default_store = None
        
        store = MemoryStore(memory_config)
        store._embedding_provider = MockEmbeddingProvider()
        store_module._default_store = store
        
        try:
            memory_id = await remember(
                text="Temporary memory",
                scope="task:temp",
            )
            
            deleted = await forget(memory_id)
            assert deleted is True
            
            from core.memory.middleware import get_memory
            retrieved = await get_memory(memory_id)
            assert retrieved is None
        finally:
            store_module._default_store = None


class TestEvictor:
    """Tests for TTL expiration and LRU eviction."""
    
    @pytest.mark.asyncio
    async def test_ttl_expiration(self, memory_config):
        """Test that expired memories are deleted."""
        from core.memory import memory_store as store_module
        store_module._default_store = None
        
        store = MemoryStore(memory_config)
        store._embedding_provider = MockEmbeddingProvider()
        store.initialize()
        store_module._default_store = store
        
        try:
            expired_item = MemoryItem(
                text="This should expire",
                scope="task:temp",
                ttl_seconds=1,
                created_at=datetime.utcnow() - timedelta(seconds=10),
            )
            await store.upsert(expired_item, generate_embedding=False)
            
            valid_item = MemoryItem(
                text="This should remain",
                scope="task:valid",
                ttl_seconds=3600,
            )
            await store.upsert(valid_item, generate_embedding=False)
            
            assert store.count() == 2
            
            stats = await evict_stale_and_lru(memory_config)
            
            assert stats["ttl_expired"] >= 1
            assert store.get_by_id(expired_item.id) is None
            assert store.get_by_id(valid_item.id) is not None
        finally:
            store_module._default_store = None
    
    @pytest.mark.asyncio
    async def test_lru_eviction(self, memory_config):
        """Test LRU eviction when scope cap is exceeded."""
        from core.memory import memory_store as store_module
        store_module._default_store = None
        
        memory_config.persona_max_rows = 5
        store = MemoryStore(memory_config)
        store._embedding_provider = MockEmbeddingProvider()
        store.initialize()
        store_module._default_store = store
        
        try:
            for i in range(10):
                item = MemoryItem(
                    text=f"Memory {i}",
                    scope="persona:zeke",
                    created_at=datetime.utcnow() - timedelta(hours=10-i),
                )
                await store.upsert(item, generate_embedding=False)
            
            assert store.count(scope="persona:") == 10
            
            stats = await evict_stale_and_lru(memory_config)
            
            assert stats["lru_evicted"] >= 5
            assert store.count(scope="persona:") <= 5
        finally:
            store_module._default_store = None
    
    @pytest.mark.asyncio
    async def test_memory_stats(self, memory_config):
        """Test getting memory statistics."""
        from core.memory import memory_store as store_module
        store_module._default_store = None
        
        store = MemoryStore(memory_config)
        store._embedding_provider = MockEmbeddingProvider()
        store.initialize()
        store_module._default_store = store
        
        try:
            await store.upsert(MemoryItem(
                text="Persona memory",
                scope="persona:zeke",
            ))
            await store.upsert(MemoryItem(
                text="Task memory",
                scope="task:work",
                ttl_seconds=3600,
            ))
            
            stats = await get_memory_stats(memory_config)
            
            assert stats["total_memories"] == 2
            assert stats["by_scope"]["persona:"] == 1
            assert stats["by_scope"]["task:"] == 1
            assert stats["with_ttl"] == 1
            assert stats["with_embedding"] == 2
        finally:
            store_module._default_store = None


class TestMemoryScope:
    """Tests for MemoryScope helpers."""
    
    def test_persona_scope(self):
        assert MemoryScope.persona() == "persona:zeke"
        assert MemoryScope.persona("nate") == "persona:nate"
    
    def test_task_scope(self):
        assert MemoryScope.task("scheduling") == "task:scheduling"
    
    def test_ops_scope(self):
        assert MemoryScope.ops() == "ops:general"
        assert MemoryScope.ops("calendar") == "ops:calendar"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

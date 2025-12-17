"""
Pydantic models for the memory system.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
import uuid


class MemoryScope:
    """Common memory scope prefixes."""
    PERSONA = "persona"
    TASK = "task"
    OPS = "ops"
    CALENDAR = "calendar"
    NOTES = "notes"
    
    @staticmethod
    def persona(name: str = "zeke") -> str:
        return f"persona:{name}"
    
    @staticmethod
    def task(task_name: str) -> str:
        return f"task:{task_name}"
    
    @staticmethod
    def ops(category: str = "general") -> str:
        return f"ops:{category}"


class MemoryItem(BaseModel):
    """A single memory record."""
    
    model_config = {"ser_json_timedelta": "iso8601"}
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str = Field(..., description="The memory content")
    scope: str = Field(..., description="Memory scope (e.g., 'persona:zeke', 'task:scheduling')")
    tags: list[str] = Field(default_factory=list, description="Optional tags for categorization")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_accessed_at: Optional[datetime] = Field(default=None)
    ttl_seconds: Optional[int] = Field(default=None, description="Time-to-live in seconds, None for no expiry")
    embedding: Optional[list[float]] = Field(default=None, description="Vector embedding for semantic search")


class MemorySearchResult(BaseModel):
    """A memory item with search relevance score."""
    
    item: MemoryItem
    score: float = Field(default=0.0, description="Combined relevance score (0-1)")
    match_type: str = Field(default="hybrid", description="How this result was found: 'vector', 'fts', 'hybrid'")


class MemoryConfig(BaseModel):
    """Configuration for the memory system."""
    
    db_path: str = Field(default="./data/memory.db")
    embed_model: str = Field(default="text-embedding-3-small")
    max_rows: int = Field(default=20000)
    persona_max_rows: int = Field(default=5000, description="Max rows for persona scope (no TTL)")
    ops_max_rows: int = Field(default=10000, description="Max rows for ops/task scope")
    ops_ttl_days: int = Field(default=90, description="Default TTL for ops/task memories in days")
    vector_dimensions: int = Field(default=1536, description="Embedding vector dimensions")

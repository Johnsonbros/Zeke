"""
TTL (Time-To-Live) bucket system for memory management.

Provides three standard buckets:
- transient: Short-lived data (24-48h) - defaults to 36 hours
- session: Medium-term data (7 days)
- long_term: Persistent data (no TTL)

Use buckets instead of raw TTL seconds for consistency and clarity.
"""

from enum import Enum
from typing import Optional
from dataclasses import dataclass


class TTLBucket(Enum):
    """Standard TTL buckets for memory classification."""
    
    TRANSIENT = "transient"
    SESSION = "session"
    LONG_TERM = "long_term"


@dataclass
class BucketConfig:
    """Configuration for a TTL bucket."""
    name: str
    ttl_seconds: Optional[int]
    description: str


BUCKET_CONFIGS: dict[TTLBucket, BucketConfig] = {
    TTLBucket.TRANSIENT: BucketConfig(
        name="transient",
        ttl_seconds=36 * 60 * 60,  # 36 hours (24-48h range midpoint)
        description="Short-lived data, expires in 24-48 hours"
    ),
    TTLBucket.SESSION: BucketConfig(
        name="session",
        ttl_seconds=7 * 24 * 60 * 60,  # 7 days
        description="Session-scoped data, expires in 7 days"
    ),
    TTLBucket.LONG_TERM: BucketConfig(
        name="long_term",
        ttl_seconds=None,  # No expiry
        description="Persistent data, never expires automatically"
    ),
}

# Scope prefix to default bucket mapping
SCOPE_DEFAULT_BUCKETS: dict[str, TTLBucket] = {
    "persona:": TTLBucket.LONG_TERM,      # User preferences persist
    "task:": TTLBucket.SESSION,            # Tasks typically session-scoped
    "ops:": TTLBucket.SESSION,             # Operational data session-scoped
    "calendar:": TTLBucket.SESSION,        # Calendar context session-scoped
    "notes": TTLBucket.LONG_TERM,          # Notes persist
    "recap:": TTLBucket.LONG_TERM,         # Recap summaries persist
    "thread:": TTLBucket.TRANSIENT,        # Raw thread data is transient
    "context:": TTLBucket.TRANSIENT,       # Context data is transient
}


def get_bucket_ttl(bucket: TTLBucket) -> Optional[int]:
    """
    Get the TTL in seconds for a bucket.
    
    Args:
        bucket: The TTL bucket
        
    Returns:
        TTL in seconds, or None for no expiry
    """
    return BUCKET_CONFIGS[bucket].ttl_seconds


def get_bucket_for_scope(scope: str) -> TTLBucket:
    """
    Determine the appropriate TTL bucket for a given scope.
    
    Uses prefix matching to find the default bucket.
    Falls back to SESSION if no match found.
    
    Args:
        scope: Memory scope (e.g., "persona:zeke", "task:scheduling")
        
    Returns:
        The recommended TTL bucket for this scope
    """
    for prefix, bucket in SCOPE_DEFAULT_BUCKETS.items():
        if scope.startswith(prefix):
            return bucket
    
    # Default to session for unknown scopes
    return TTLBucket.SESSION


def bucket_from_string(name: str) -> TTLBucket:
    """
    Convert a string bucket name to TTLBucket enum.
    
    Args:
        name: Bucket name ("transient", "session", "long_term")
        
    Returns:
        Corresponding TTLBucket enum value
        
    Raises:
        ValueError: If name doesn't match any bucket
    """
    name_lower = name.lower().replace("-", "_")
    
    for bucket in TTLBucket:
        if bucket.value == name_lower:
            return bucket
    
    raise ValueError(f"Unknown TTL bucket: {name}. Valid buckets: {[b.value for b in TTLBucket]}")


def apply_bucket_ttl(
    scope: str,
    explicit_bucket: Optional[TTLBucket] = None,
    explicit_ttl: Optional[int] = None
) -> Optional[int]:
    """
    Determine the TTL to apply to a memory item.
    
    Priority:
    1. Explicit TTL if provided
    2. Explicit bucket if provided
    3. Auto-detected bucket based on scope
    
    Args:
        scope: Memory scope
        explicit_bucket: Optionally specified bucket
        explicit_ttl: Optionally specified TTL in seconds
        
    Returns:
        TTL in seconds, or None for no expiry
    """
    if explicit_ttl is not None:
        return explicit_ttl
    
    if explicit_bucket is not None:
        return get_bucket_ttl(explicit_bucket)
    
    # Auto-detect based on scope
    bucket = get_bucket_for_scope(scope)
    return get_bucket_ttl(bucket)


def get_bucket_info(bucket: TTLBucket) -> dict:
    """
    Get detailed information about a bucket.
    
    Args:
        bucket: The TTL bucket
        
    Returns:
        Dict with name, ttl_seconds, ttl_human, and description
    """
    config = BUCKET_CONFIGS[bucket]
    
    ttl_human = "never expires"
    if config.ttl_seconds:
        hours = config.ttl_seconds // 3600
        if hours >= 24:
            days = hours // 24
            ttl_human = f"{days} day{'s' if days > 1 else ''}"
        else:
            ttl_human = f"{hours} hour{'s' if hours > 1 else ''}"
    
    return {
        "name": config.name,
        "ttl_seconds": config.ttl_seconds,
        "ttl_human": ttl_human,
        "description": config.description,
    }


def list_all_buckets() -> list[dict]:
    """
    List all available TTL buckets with their configurations.
    
    Returns:
        List of bucket info dicts
    """
    return [get_bucket_info(bucket) for bucket in TTLBucket]

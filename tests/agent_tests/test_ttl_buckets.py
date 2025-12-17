"""
Tests for TTL bucket system.
"""

import pytest
from core.memory.ttl_buckets import (
    TTLBucket,
    BucketConfig,
    BUCKET_CONFIGS,
    get_bucket_ttl,
    get_bucket_for_scope,
    bucket_from_string,
    apply_bucket_ttl,
    get_bucket_info,
    list_all_buckets,
)


class TestTTLBucketConstants:
    """Test bucket constant definitions."""
    
    def test_transient_bucket_ttl(self):
        """Transient bucket should be 36 hours (24-48h midpoint)."""
        ttl = get_bucket_ttl(TTLBucket.TRANSIENT)
        assert ttl == 36 * 60 * 60  # 129600 seconds
        
    def test_session_bucket_ttl(self):
        """Session bucket should be 7 days."""
        ttl = get_bucket_ttl(TTLBucket.SESSION)
        assert ttl == 7 * 24 * 60 * 60  # 604800 seconds
        
    def test_long_term_bucket_ttl(self):
        """Long-term bucket should have no TTL (None)."""
        ttl = get_bucket_ttl(TTLBucket.LONG_TERM)
        assert ttl is None
        
    def test_all_buckets_have_configs(self):
        """Every TTLBucket enum value should have a config."""
        for bucket in TTLBucket:
            assert bucket in BUCKET_CONFIGS
            config = BUCKET_CONFIGS[bucket]
            assert isinstance(config, BucketConfig)
            assert config.name == bucket.value


class TestScopeToBacketMapping:
    """Test automatic bucket assignment based on scope."""
    
    def test_persona_scope_uses_long_term(self):
        """Persona scope should use long_term bucket."""
        bucket = get_bucket_for_scope("persona:zeke")
        assert bucket == TTLBucket.LONG_TERM
        
    def test_task_scope_uses_session(self):
        """Task scope should use session bucket."""
        bucket = get_bucket_for_scope("task:scheduling")
        assert bucket == TTLBucket.SESSION
        
    def test_ops_scope_uses_session(self):
        """Ops scope should use session bucket."""
        bucket = get_bucket_for_scope("ops:general")
        assert bucket == TTLBucket.SESSION
        
    def test_calendar_scope_uses_session(self):
        """Calendar scope should use session bucket."""
        bucket = get_bucket_for_scope("calendar:events")
        assert bucket == TTLBucket.SESSION
        
    def test_notes_scope_uses_long_term(self):
        """Notes scope should use long_term bucket."""
        bucket = get_bucket_for_scope("notes")
        assert bucket == TTLBucket.LONG_TERM
        
    def test_recap_scope_uses_long_term(self):
        """Recap scope should use long_term bucket."""
        bucket = get_bucket_for_scope("recap:thread:123")
        assert bucket == TTLBucket.LONG_TERM
        
    def test_thread_scope_uses_transient(self):
        """Thread scope should use transient bucket."""
        bucket = get_bucket_for_scope("thread:conv-456")
        assert bucket == TTLBucket.TRANSIENT
        
    def test_context_scope_uses_transient(self):
        """Context scope should use transient bucket."""
        bucket = get_bucket_for_scope("context:current")
        assert bucket == TTLBucket.TRANSIENT
        
    def test_unknown_scope_defaults_to_session(self):
        """Unknown scopes should default to session bucket."""
        bucket = get_bucket_for_scope("random:unknown")
        assert bucket == TTLBucket.SESSION


class TestBucketFromString:
    """Test string to enum conversion."""
    
    def test_transient_string(self):
        """Should convert 'transient' to TTLBucket.TRANSIENT."""
        bucket = bucket_from_string("transient")
        assert bucket == TTLBucket.TRANSIENT
        
    def test_session_string(self):
        """Should convert 'session' to TTLBucket.SESSION."""
        bucket = bucket_from_string("session")
        assert bucket == TTLBucket.SESSION
        
    def test_long_term_string(self):
        """Should convert 'long_term' to TTLBucket.LONG_TERM."""
        bucket = bucket_from_string("long_term")
        assert bucket == TTLBucket.LONG_TERM
        
    def test_long_term_with_hyphen(self):
        """Should handle 'long-term' with hyphen."""
        bucket = bucket_from_string("long-term")
        assert bucket == TTLBucket.LONG_TERM
        
    def test_case_insensitive(self):
        """Should be case-insensitive."""
        bucket = bucket_from_string("TRANSIENT")
        assert bucket == TTLBucket.TRANSIENT
        
    def test_invalid_bucket_raises(self):
        """Should raise ValueError for invalid bucket names."""
        with pytest.raises(ValueError) as exc_info:
            bucket_from_string("invalid")
        assert "Unknown TTL bucket" in str(exc_info.value)


class TestApplyBucketTTL:
    """Test TTL application logic."""
    
    def test_explicit_ttl_takes_priority(self):
        """Explicit TTL should override bucket and scope."""
        ttl = apply_bucket_ttl(
            scope="persona:zeke",  # Would normally be long_term (None)
            explicit_bucket=TTLBucket.TRANSIENT,  # Would be 36h
            explicit_ttl=3600  # 1 hour
        )
        assert ttl == 3600
        
    def test_explicit_bucket_takes_priority_over_scope(self):
        """Explicit bucket should override scope-based bucket."""
        ttl = apply_bucket_ttl(
            scope="persona:zeke",  # Would normally be long_term
            explicit_bucket=TTLBucket.TRANSIENT
        )
        assert ttl == 36 * 60 * 60  # Transient TTL
        
    def test_scope_based_bucket_when_no_explicit(self):
        """Should use scope-based bucket when nothing explicit provided."""
        ttl = apply_bucket_ttl(scope="task:test")
        assert ttl == 7 * 24 * 60 * 60  # Session TTL
        
    def test_long_term_scope_returns_none(self):
        """Long-term scopes should return None TTL."""
        ttl = apply_bucket_ttl(scope="persona:zeke")
        assert ttl is None


class TestBucketInfo:
    """Test bucket info retrieval."""
    
    def test_get_transient_info(self):
        """Should return complete info for transient bucket."""
        info = get_bucket_info(TTLBucket.TRANSIENT)
        assert info["name"] == "transient"
        assert info["ttl_seconds"] == 36 * 60 * 60
        # 36 hours = 1.5 days, displays as "1 day"
        assert "day" in info["ttl_human"] or "hour" in info["ttl_human"]
        assert "description" in info
        
    def test_get_long_term_info(self):
        """Should return 'never expires' for long_term."""
        info = get_bucket_info(TTLBucket.LONG_TERM)
        assert info["name"] == "long_term"
        assert info["ttl_seconds"] is None
        assert info["ttl_human"] == "never expires"
        
    def test_list_all_buckets(self):
        """Should list all three buckets."""
        buckets = list_all_buckets()
        assert len(buckets) == 3
        names = [b["name"] for b in buckets]
        assert "transient" in names
        assert "session" in names
        assert "long_term" in names


class TestBucketEnumValues:
    """Test enum values for serialization compatibility."""
    
    def test_transient_value(self):
        assert TTLBucket.TRANSIENT.value == "transient"
        
    def test_session_value(self):
        assert TTLBucket.SESSION.value == "session"
        
    def test_long_term_value(self):
        assert TTLBucket.LONG_TERM.value == "long_term"

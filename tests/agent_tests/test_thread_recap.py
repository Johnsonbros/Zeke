"""
Tests for thread recap system.
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from core.memory.thread_recap import (
    RecapConfig,
    ThreadStats,
    RecapResult,
    calculate_thread_stats,
    format_messages_for_summary,
    create_recap_memory_item,
    recap_thread,
    find_threads_needing_recap,
    RECAP_SYSTEM_PROMPT,
)
from core.memory.ttl_buckets import TTLBucket


class TestRecapConfig:
    """Test recap configuration defaults."""
    
    def test_default_max_messages(self):
        config = RecapConfig()
        assert config.max_messages == 20
        
    def test_default_max_content_bytes(self):
        config = RecapConfig()
        assert config.max_content_bytes == 8 * 1024
        
    def test_default_max_summary_bytes(self):
        config = RecapConfig()
        assert config.max_summary_bytes == 1024
        
    def test_default_min_age_hours(self):
        config = RecapConfig()
        assert config.min_age_hours == 6
        
    def test_default_purge_after_recap(self):
        config = RecapConfig()
        assert config.purge_after_recap is True


class TestCalculateThreadStats:
    """Test thread statistics calculation."""
    
    def test_empty_messages(self):
        stats = calculate_thread_stats([], "conv-123")
        assert stats.conversation_id == "conv-123"
        assert stats.message_count == 0
        assert stats.total_bytes == 0
        assert stats.needs_recap is False
        
    def test_small_thread_no_recap_needed(self):
        messages = [
            {"content": "Hello", "created_at": datetime.utcnow().isoformat()},
            {"content": "Hi there", "created_at": datetime.utcnow().isoformat()},
        ]
        stats = calculate_thread_stats(messages, "conv-123")
        assert stats.message_count == 2
        assert stats.needs_recap is False
        
    def test_large_thread_needs_recap_by_count(self):
        messages = [{"content": "msg", "created_at": datetime.utcnow().isoformat()} for _ in range(25)]
        stats = calculate_thread_stats(messages, "conv-123")
        assert stats.message_count == 25
        assert stats.needs_recap is True
        
    def test_large_thread_needs_recap_by_size(self):
        large_content = "x" * 1000  # 1KB per message
        messages = [{"content": large_content, "created_at": datetime.utcnow().isoformat()} for _ in range(10)]
        stats = calculate_thread_stats(messages, "conv-123")
        assert stats.total_bytes == 10000
        assert stats.needs_recap is True  # 10KB > 8KB threshold
        
    def test_calculates_date_range(self):
        old_date = (datetime.utcnow() - timedelta(days=5)).isoformat()
        new_date = datetime.utcnow().isoformat()
        messages = [
            {"content": "old", "created_at": old_date},
            {"content": "new", "created_at": new_date},
        ]
        stats = calculate_thread_stats(messages, "conv-123")
        assert stats.oldest_message is not None
        assert stats.newest_message is not None
        assert stats.oldest_message < stats.newest_message
        
    def test_age_hours_calculation(self):
        old_date = (datetime.utcnow() - timedelta(hours=12)).isoformat()
        messages = [{"content": "msg", "created_at": old_date}]
        stats = calculate_thread_stats(messages, "conv-123")
        assert 11 < stats.age_hours < 13


class TestFormatMessagesForSummary:
    """Test message formatting for LLM input."""
    
    def test_formats_user_messages(self):
        messages = [{"role": "user", "content": "Hello there"}]
        result = format_messages_for_summary(messages)
        assert "[USER]: Hello there" in result
        
    def test_formats_assistant_messages(self):
        messages = [{"role": "assistant", "content": "Hi!"}]
        result = format_messages_for_summary(messages)
        assert "[ASSISTANT]: Hi!" in result
        
    def test_handles_multiple_messages(self):
        messages = [
            {"role": "user", "content": "Question?"},
            {"role": "assistant", "content": "Answer!"},
        ]
        result = format_messages_for_summary(messages)
        assert "[USER]: Question?" in result
        assert "[ASSISTANT]: Answer!" in result
        assert result.index("[USER]") < result.index("[ASSISTANT]")
        
    def test_skips_empty_content(self):
        messages = [
            {"role": "user", "content": "Valid"},
            {"role": "user", "content": ""},
        ]
        result = format_messages_for_summary(messages)
        assert "Valid" in result
        assert result.count("[USER]") == 1


class TestCreateRecapMemoryItem:
    """Test recap memory item creation."""
    
    def test_creates_correct_scope(self):
        stats = ThreadStats(
            conversation_id="conv-123",
            message_count=25,
            total_bytes=5000,
            oldest_message=datetime.utcnow() - timedelta(days=2),
            newest_message=datetime.utcnow() - timedelta(hours=12),
            needs_recap=True,
        )
        item = create_recap_memory_item("conv-123", "Summary text", stats)
        assert item["scope"] == "recap:thread:conv-123"
        
    def test_includes_tags(self):
        stats = ThreadStats(
            conversation_id="conv-123",
            message_count=25,
            total_bytes=5000,
            oldest_message=None,
            newest_message=None,
            needs_recap=True,
        )
        item = create_recap_memory_item("conv-123", "Summary", stats)
        assert "recap" in item["tags"]
        assert "conversation" in item["tags"]
        assert "summary" in item["tags"]
        
    def test_uses_long_term_ttl(self):
        stats = ThreadStats(
            conversation_id="conv-123",
            message_count=25,
            total_bytes=5000,
            oldest_message=None,
            newest_message=None,
            needs_recap=True,
        )
        item = create_recap_memory_item("conv-123", "Summary", stats)
        assert item["ttl_seconds"] is None  # long_term = no TTL
        
    def test_includes_metadata_in_text(self):
        stats = ThreadStats(
            conversation_id="conv-123",
            message_count=25,
            total_bytes=5000,
            oldest_message=None,
            newest_message=None,
            needs_recap=True,
        )
        item = create_recap_memory_item("conv-123", "Summary text", stats, title="Test Title")
        assert "Test Title" in item["text"]
        assert "25" in item["text"]  # message count
        assert "Summary text" in item["text"]


class TestRecapThread:
    """Test the main recap operation."""
    
    @pytest.mark.asyncio
    async def test_skips_recent_thread(self):
        """Should skip threads that are too recent."""
        recent_date = datetime.utcnow().isoformat()
        messages = [{"content": "x" * 1000, "created_at": recent_date} for _ in range(25)]
        
        result = await recap_thread(
            conversation_id="conv-123",
            messages=messages,
            config=RecapConfig(min_age_hours=6),
        )
        
        assert result.success is False
        assert "too recent" in result.error.lower()
        
    @pytest.mark.asyncio
    async def test_skips_small_thread(self):
        """Should skip threads that don't need recap."""
        old_date = (datetime.utcnow() - timedelta(hours=12)).isoformat()
        messages = [{"content": "short", "created_at": old_date} for _ in range(5)]
        
        result = await recap_thread(
            conversation_id="conv-123",
            messages=messages,
        )
        
        assert result.success is False
        assert "does not need recap" in result.error.lower()
        
    @pytest.mark.asyncio
    async def test_generates_summary_and_stores(self):
        """Should generate summary and call store callback."""
        old_date = (datetime.utcnow() - timedelta(hours=12)).isoformat()
        messages = [{"content": "x" * 1000, "role": "user", "created_at": old_date} for _ in range(25)]
        
        mock_openai = MagicMock()
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "- Key point 1\n- Key point 2"
        mock_openai.chat.completions.create = AsyncMock(return_value=mock_response)
        
        store_called = False
        stored_item = None
        
        async def store_callback(item):
            nonlocal store_called, stored_item
            store_called = True
            stored_item = item
            return True
        
        result = await recap_thread(
            conversation_id="conv-123",
            messages=messages,
            openai_client=mock_openai,
            store_callback=store_callback,
        )
        
        assert result.success is True
        assert result.summary is not None
        assert "Key point" in result.summary
        assert store_called is True
        assert stored_item["scope"] == "recap:thread:conv-123"
        
    @pytest.mark.asyncio
    async def test_purges_messages_after_recap(self):
        """Should call purge callback after successful recap."""
        old_date = (datetime.utcnow() - timedelta(hours=12)).isoformat()
        messages = [{"content": "x" * 1000, "role": "user", "created_at": old_date} for _ in range(25)]
        
        mock_openai = MagicMock()
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Summary"
        mock_openai.chat.completions.create = AsyncMock(return_value=mock_response)
        
        purge_called = False
        purged_id = None
        
        async def purge_callback(conv_id):
            nonlocal purge_called, purged_id
            purge_called = True
            purged_id = conv_id
            return 25
        
        result = await recap_thread(
            conversation_id="conv-123",
            messages=messages,
            openai_client=mock_openai,
            store_callback=AsyncMock(return_value=True),
            purge_callback=purge_callback,
            config=RecapConfig(purge_after_recap=True),
        )
        
        assert result.success is True
        assert purge_called is True
        assert purged_id == "conv-123"
        assert result.messages_purged == 25
        
    @pytest.mark.asyncio
    async def test_handles_openai_error(self):
        """Should handle OpenAI API errors gracefully."""
        old_date = (datetime.utcnow() - timedelta(hours=12)).isoformat()
        messages = [{"content": "x" * 1000, "role": "user", "created_at": old_date} for _ in range(25)]
        
        mock_openai = MagicMock()
        mock_openai.chat.completions.create = AsyncMock(side_effect=Exception("API Error"))
        
        result = await recap_thread(
            conversation_id="conv-123",
            messages=messages,
            openai_client=mock_openai,
        )
        
        assert result.success is False
        assert "API Error" in result.error
        
    @pytest.mark.asyncio
    async def test_truncates_summary_without_newlines(self):
        """Should truncate oversized summaries even without newlines (regression test)."""
        old_date = (datetime.utcnow() - timedelta(hours=12)).isoformat()
        messages = [{"content": "x" * 1000, "role": "user", "created_at": old_date} for _ in range(25)]
        
        # Return a 2KB summary with NO newlines
        oversized_summary = "x" * 2048
        
        mock_openai = MagicMock()
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = oversized_summary
        mock_openai.chat.completions.create = AsyncMock(return_value=mock_response)
        
        result = await recap_thread(
            conversation_id="conv-123",
            messages=messages,
            openai_client=mock_openai,
            store_callback=AsyncMock(return_value=True),
            config=RecapConfig(max_summary_bytes=1024),
        )
        
        # Should succeed and truncate
        assert result.success is True
        assert result.summary_bytes <= 1024
        assert "[...truncated]" in result.summary


class TestFindThreadsNeedingRecap:
    """Test discovery of threads needing recap."""
    
    @pytest.mark.asyncio
    async def test_finds_large_old_threads(self):
        """Should find threads that meet recap criteria."""
        old_date = (datetime.utcnow() - timedelta(hours=12)).isoformat()
        
        async def get_conversations():
            return [{"id": "conv-1"}, {"id": "conv-2"}]
        
        async def get_messages(conv_id):
            if conv_id == "conv-1":
                return [{"content": "x" * 1000, "created_at": old_date} for _ in range(25)]
            else:
                return [{"content": "short", "created_at": old_date} for _ in range(3)]
        
        results = await find_threads_needing_recap(
            get_conversations_callback=get_conversations,
            get_messages_callback=get_messages,
        )
        
        assert len(results) == 1
        assert results[0][0] == "conv-1"
        
    @pytest.mark.asyncio
    async def test_skips_recent_threads(self):
        """Should skip threads that are too recent."""
        recent_date = datetime.utcnow().isoformat()
        
        async def get_conversations():
            return [{"id": "conv-1"}]
        
        async def get_messages(conv_id):
            return [{"content": "x" * 1000, "created_at": recent_date} for _ in range(25)]
        
        results = await find_threads_needing_recap(
            get_conversations_callback=get_conversations,
            get_messages_callback=get_messages,
            config=RecapConfig(min_age_hours=6),
        )
        
        assert len(results) == 0


class TestRecapSystemPrompt:
    """Test the system prompt for summarization."""
    
    def test_prompt_mentions_byte_limit(self):
        assert "900 bytes" in RECAP_SYSTEM_PROMPT or "byte" in RECAP_SYSTEM_PROMPT.lower()
        
    def test_prompt_mentions_bullet_points(self):
        assert "bullet" in RECAP_SYSTEM_PROMPT.lower()
        
    def test_prompt_mentions_key_elements(self):
        prompt_lower = RECAP_SYSTEM_PROMPT.lower()
        assert "topic" in prompt_lower
        assert "action" in prompt_lower

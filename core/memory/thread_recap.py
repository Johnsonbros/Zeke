"""
Thread recap system for compressing long conversation threads.

Automatically summarizes conversations that exceed thresholds into
compact <1KB notes, then purges the raw messages to save storage.
"""

import logging
from datetime import datetime
from typing import Optional, List, Tuple
from dataclasses import dataclass

from .ttl_buckets import TTLBucket, get_bucket_ttl


logger = logging.getLogger(__name__)


@dataclass
class RecapConfig:
    """Configuration for thread recap behavior."""
    
    # Thresholds for triggering recap
    max_messages: int = 20
    max_content_bytes: int = 8 * 1024  # 8KB
    
    # Output constraints
    max_summary_bytes: int = 1024  # 1KB max for summary
    
    # Minimum age before recap (avoid recapping active threads)
    min_age_hours: int = 6
    
    # Whether to purge raw messages after recap
    purge_after_recap: bool = True


@dataclass
class ThreadStats:
    """Statistics about a conversation thread."""
    
    conversation_id: str
    message_count: int
    total_bytes: int
    oldest_message: Optional[datetime]
    newest_message: Optional[datetime]
    needs_recap: bool
    
    @property
    def age_hours(self) -> float:
        """Hours since the newest message."""
        if not self.newest_message:
            return 0
        delta = datetime.utcnow() - self.newest_message
        return delta.total_seconds() / 3600


@dataclass
class RecapResult:
    """Result of a recap operation."""
    
    conversation_id: str
    success: bool
    summary: Optional[str] = None
    summary_bytes: int = 0
    messages_purged: int = 0
    error: Optional[str] = None


RECAP_SYSTEM_PROMPT = """You are a conversation summarizer. Compress the following conversation into a concise bullet-point summary.

Requirements:
- Maximum 900 bytes (leave room for metadata)
- Use bullet points for key information
- Capture: main topics discussed, decisions made, action items, important facts learned
- Preserve names, dates, and specific details
- Skip pleasantries and filler
- Write in past tense

Format:
- Topic 1: Key point
- Topic 2: Key point
- Action: Any follow-ups needed
- Context: Any important context for future reference"""


def calculate_thread_stats(
    messages: List[dict],
    conversation_id: str,
    config: Optional[RecapConfig] = None
) -> ThreadStats:
    """
    Calculate statistics for a conversation thread.
    
    Args:
        messages: List of message dicts with 'content' and 'created_at' keys
        conversation_id: ID of the conversation
        config: Recap configuration
        
    Returns:
        ThreadStats with computed metrics
    """
    if config is None:
        config = RecapConfig()
    
    total_bytes = sum(len(m.get("content", "").encode("utf-8")) for m in messages)
    
    oldest = None
    newest = None
    
    for msg in messages:
        created_at = msg.get("created_at")
        if created_at:
            if isinstance(created_at, str):
                try:
                    created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                except ValueError:
                    continue
            
            if oldest is None or created_at < oldest:
                oldest = created_at
            if newest is None or created_at > newest:
                newest = created_at
    
    needs_recap = (
        len(messages) > config.max_messages or
        total_bytes > config.max_content_bytes
    )
    
    return ThreadStats(
        conversation_id=conversation_id,
        message_count=len(messages),
        total_bytes=total_bytes,
        oldest_message=oldest,
        newest_message=newest,
        needs_recap=needs_recap,
    )


def format_messages_for_summary(messages: List[dict]) -> str:
    """
    Format messages into a string for LLM summarization.
    
    Args:
        messages: List of message dicts
        
    Returns:
        Formatted conversation text
    """
    lines = []
    
    for msg in messages:
        role = msg.get("role", "unknown").upper()
        content = msg.get("content", "").strip()
        
        if content:
            lines.append(f"[{role}]: {content}")
    
    return "\n".join(lines)


async def generate_summary(
    messages: List[dict],
    config: Optional[RecapConfig] = None,
    openai_client = None
) -> str:
    """
    Generate a summary of conversation messages using OpenAI.
    
    Args:
        messages: List of message dicts
        config: Recap configuration
        openai_client: OpenAI client instance (optional, creates one if not provided)
        
    Returns:
        Summary text (<1KB)
    """
    if config is None:
        config = RecapConfig()
    
    conversation_text = format_messages_for_summary(messages)
    
    # Truncate if too long (roughly 4 chars per token, leave room for prompt)
    max_input_chars = 12000
    if len(conversation_text) > max_input_chars:
        conversation_text = conversation_text[:max_input_chars] + "\n[...truncated...]"
    
    if openai_client is None:
        import openai
        openai_client = openai.AsyncOpenAI()
    
    response = await openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": RECAP_SYSTEM_PROMPT},
            {"role": "user", "content": conversation_text}
        ],
        max_tokens=300,  # ~1200 chars max
        temperature=0.3,
    )
    
    content = response.choices[0].message.content
    summary = content.strip() if content else ""
    
    # Ensure summary fits within limit
    summary_bytes = len(summary.encode("utf-8"))
    if summary_bytes > config.max_summary_bytes:
        # Truncate to fit - try line-by-line first, then character-by-character
        target_bytes = config.max_summary_bytes - 20  # Leave room for truncation marker
        
        # Try removing lines from the end first
        if "\n" in summary:
            while len(summary.encode("utf-8")) > target_bytes and "\n" in summary:
                summary = summary.rsplit("\n", 1)[0]
        
        # If still too long, truncate by characters
        while len(summary.encode("utf-8")) > target_bytes and len(summary) > 0:
            summary = summary[:-10]  # Remove 10 chars at a time
        
        summary = summary.rstrip() + "\n[...truncated]"
    
    return summary


def create_recap_memory_item(
    conversation_id: str,
    summary: str,
    stats: ThreadStats,
    title: Optional[str] = None
) -> dict:
    """
    Create a memory item dict for storing the recap.
    
    Args:
        conversation_id: ID of the conversation
        summary: Generated summary text
        stats: Thread statistics
        title: Optional conversation title
        
    Returns:
        Dict suitable for storing via remember()
    """
    metadata_lines = [
        f"Conversation Recap: {title or conversation_id}",
        f"Messages: {stats.message_count} | Size: {stats.total_bytes} bytes",
        f"Period: {stats.oldest_message.isoformat() if stats.oldest_message else 'unknown'} to {stats.newest_message.isoformat() if stats.newest_message else 'unknown'}",
        "",
    ]
    
    full_text = "\n".join(metadata_lines) + summary
    
    return {
        "text": full_text,
        "scope": f"recap:thread:{conversation_id}",
        "tags": ["recap", "conversation", "summary"],
        "ttl_seconds": get_bucket_ttl(TTLBucket.LONG_TERM),  # None = no expiry
    }


async def recap_thread(
    conversation_id: str,
    messages: List[dict],
    title: Optional[str] = None,
    config: Optional[RecapConfig] = None,
    openai_client = None,
    purge_callback = None,
    store_callback = None
) -> RecapResult:
    """
    Recap a conversation thread: summarize and optionally purge raw messages.
    
    Args:
        conversation_id: ID of the conversation
        messages: List of message dicts
        title: Optional conversation title
        config: Recap configuration
        openai_client: OpenAI client for summarization
        purge_callback: Async callback to purge messages: async (conversation_id) -> int
        store_callback: Async callback to store recap: async (memory_item) -> bool
        
    Returns:
        RecapResult with summary and purge stats
    """
    if config is None:
        config = RecapConfig()
    
    stats = calculate_thread_stats(messages, conversation_id, config)
    
    # Check if thread is old enough
    if stats.age_hours < config.min_age_hours:
        return RecapResult(
            conversation_id=conversation_id,
            success=False,
            error=f"Thread too recent ({stats.age_hours:.1f}h < {config.min_age_hours}h min)"
        )
    
    # Check if recap is needed
    if not stats.needs_recap:
        return RecapResult(
            conversation_id=conversation_id,
            success=False,
            error=f"Thread does not need recap (msgs={stats.message_count}, bytes={stats.total_bytes})"
        )
    
    try:
        # Generate summary
        summary = await generate_summary(messages, config, openai_client)
        summary_bytes = len(summary.encode("utf-8"))
        
        # Create memory item
        memory_item = create_recap_memory_item(conversation_id, summary, stats, title)
        
        # Store the recap
        if store_callback:
            stored = await store_callback(memory_item)
            if not stored:
                return RecapResult(
                    conversation_id=conversation_id,
                    success=False,
                    summary=summary,
                    summary_bytes=summary_bytes,
                    error="Failed to store recap memory"
                )
        
        # Purge raw messages if configured
        messages_purged = 0
        if config.purge_after_recap and purge_callback:
            messages_purged = await purge_callback(conversation_id)
        
        logger.info(
            f"Recapped thread {conversation_id}: "
            f"{stats.message_count} msgs -> {summary_bytes} byte summary, "
            f"{messages_purged} messages purged"
        )
        
        return RecapResult(
            conversation_id=conversation_id,
            success=True,
            summary=summary,
            summary_bytes=summary_bytes,
            messages_purged=messages_purged,
        )
        
    except Exception as e:
        logger.error(f"Failed to recap thread {conversation_id}: {e}")
        return RecapResult(
            conversation_id=conversation_id,
            success=False,
            error=str(e)
        )


async def find_threads_needing_recap(
    get_conversations_callback,
    get_messages_callback,
    config: Optional[RecapConfig] = None
) -> List[Tuple[str, ThreadStats]]:
    """
    Find all conversation threads that need recap.
    
    Args:
        get_conversations_callback: Async callback to get all conversations: async () -> List[dict]
        get_messages_callback: Async callback to get messages: async (conversation_id) -> List[dict]
        config: Recap configuration
        
    Returns:
        List of (conversation_id, stats) tuples for threads needing recap
    """
    if config is None:
        config = RecapConfig()
    
    results = []
    
    conversations = await get_conversations_callback()
    
    for conv in conversations:
        conv_id = conv.get("id")
        if not conv_id:
            continue
        
        messages = await get_messages_callback(conv_id)
        stats = calculate_thread_stats(messages, conv_id, config)
        
        if stats.needs_recap and stats.age_hours >= config.min_age_hours:
            results.append((conv_id, stats))
    
    return results

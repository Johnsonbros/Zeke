"""
Integration helpers for wiring memory into the agent loop.

Provides functions to:
- Recall context before agent responses
- Remember outcomes after tool executions
- Format memories for agent prompts
"""

import logging
from typing import Optional

from .middleware import remember, recall
from .schemas import MemoryItem, MemoryScope

logger = logging.getLogger(__name__)


async def get_relevant_context(
    user_message: str,
    scope: Optional[str] = None,
    k: int = 3,
) -> str:
    """
    Get relevant memory context formatted for agent prompts.
    
    Args:
        user_message: The user's input message
        scope: Scope to search (defaults to persona:zeke)
        k: Number of memories to retrieve
        
    Returns:
        Formatted string of relevant memories, or empty string if none found
    """
    try:
        memories = await recall(
            query=user_message,
            scope=scope or MemoryScope.persona(),
            k=k,
        )
        
        if not memories:
            return ""
        
        lines = ["## Relevant Memory Context"]
        for i, mem in enumerate(memories, 1):
            lines.append(f"{i}. {mem.text}")
            if mem.tags:
                lines.append(f"   Tags: {', '.join(mem.tags)}")
        
        return "\n".join(lines)
    except Exception as e:
        logger.warning(f"Failed to get memory context: {e}")
        return ""


async def remember_tool_outcome(
    tool_name: str,
    outcome: str,
    scope: Optional[str] = None,
    tags: Optional[list[str]] = None,
    ttl_days: int = 90,
) -> Optional[str]:
    """
    Remember the outcome of a tool execution.
    
    Args:
        tool_name: Name of the tool that was executed
        outcome: Summary of the tool outcome
        scope: Memory scope (defaults to ops:tools)
        tags: Additional tags for the memory
        ttl_days: TTL in days (default 90)
        
    Returns:
        Memory ID if successful, None otherwise
    """
    try:
        all_tags = [f"tool:{tool_name}"]
        if tags:
            all_tags.extend(tags)
        
        memory_id = await remember(
            text=f"[{tool_name}] {outcome}",
            scope=scope or MemoryScope.ops("tools"),
            tags=all_tags,
            ttl_seconds=ttl_days * 86400,
        )
        
        return memory_id
    except Exception as e:
        logger.warning(f"Failed to remember tool outcome: {e}")
        return None


async def remember_user_preference(
    preference: str,
    category: str = "general",
    tags: Optional[list[str]] = None,
) -> Optional[str]:
    """
    Remember a user preference (no TTL, persona scope).
    
    Args:
        preference: The preference to remember
        category: Category of preference (e.g., "scheduling", "communication")
        tags: Additional tags
        
    Returns:
        Memory ID if successful, None otherwise
    """
    try:
        all_tags = [f"preference:{category}"]
        if tags:
            all_tags.extend(tags)
        
        memory_id = await remember(
            text=preference,
            scope=MemoryScope.persona(),
            tags=all_tags,
            ttl_seconds=None,
        )
        
        return memory_id
    except Exception as e:
        logger.warning(f"Failed to remember preference: {e}")
        return None


async def remember_task_context(
    task_description: str,
    result_summary: str,
    scope: Optional[str] = None,
    tags: Optional[list[str]] = None,
    ttl_days: int = 90,
) -> Optional[str]:
    """
    Remember context about a completed task.
    
    Args:
        task_description: Brief description of the user's task
        result_summary: Summary of the outcome
        scope: Memory scope (defaults to task:general)
        tags: Additional tags
        ttl_days: TTL in days (default 90)
        
    Returns:
        Memory ID if successful, None otherwise
    """
    try:
        all_tags = ["task"]
        if tags:
            all_tags.extend(tags)
        
        text = f"Task: {task_description}\nResult: {result_summary}"
        
        memory_id = await remember(
            text=text,
            scope=scope or MemoryScope.task("general"),
            tags=all_tags,
            ttl_seconds=ttl_days * 86400,
        )
        
        return memory_id
    except Exception as e:
        logger.warning(f"Failed to remember task context: {e}")
        return None


async def remember_calendar_outcome(
    event_summary: str,
    outcome: str,
    tags: Optional[list[str]] = None,
    ttl_days: int = 90,
) -> Optional[str]:
    """
    Remember the outcome of a calendar/booking event.
    
    Args:
        event_summary: Summary of the event
        outcome: What happened with the event
        tags: Additional tags (e.g., customer name)
        ttl_days: TTL in days (default 90)
        
    Returns:
        Memory ID if successful, None otherwise
    """
    try:
        all_tags = ["calendar"]
        if tags:
            all_tags.extend(tags)
        
        memory_id = await remember(
            text=f"{event_summary}: {outcome}",
            scope="calendar:events",
            tags=all_tags,
            ttl_seconds=ttl_days * 86400,
        )
        
        return memory_id
    except Exception as e:
        logger.warning(f"Failed to remember calendar outcome: {e}")
        return None


def format_memories_for_prompt(
    memories: list[MemoryItem],
    max_chars: int = 2000,
) -> str:
    """
    Format memories for inclusion in an agent prompt.
    
    Args:
        memories: List of memories to format
        max_chars: Maximum characters to include
        
    Returns:
        Formatted string for prompt inclusion
    """
    if not memories:
        return ""
    
    lines = []
    total_chars = 0
    
    for mem in memories:
        line = f"- {mem.text}"
        if total_chars + len(line) > max_chars:
            break
        lines.append(line)
        total_chars += len(line) + 1
    
    return "\n".join(lines)

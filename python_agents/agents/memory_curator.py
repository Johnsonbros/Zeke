"""
Memory Curator Agent - ZEKE's memory and context specialist.

This module implements the Memory Curator agent responsible for:
- Semantic memory retrieval via Node.js bridge
- Limitless lifelog synthesis from pendant recordings
- Context enrichment by combining memory sources
- Memory storage for future retrieval

The Memory Curator works closely with other agents to provide rich
historical context that improves response accuracy.
"""

from dataclasses import dataclass, field
from typing import Any
import logging
import json

from agents import Agent, Runner

from agents.tool import Tool

from .base import (
    BaseAgent,
    AgentId,
    AgentStatus,
    AgentContext,
    CapabilityCategory,
    HandoffRequest,
    HandoffReason,
    ToolDefinition,
)
from ..bridge import get_bridge


logger = logging.getLogger(__name__)


MEMORY_CURATOR_INSTRUCTIONS = """You are the Memory Curator, ZEKE's memory and context specialist. Your role is to:
1. Retrieve relevant memories and facts about Nate
2. Search Limitless lifelogs for past conversations and commitments
3. Provide rich context to help other agents respond accurately
4. Remember that Nate is the only user - all context is about him

Always prioritize:
- Finding relevant historical context
- Synthesizing information from multiple sources
- Respecting privacy and access permissions

When responding to memory queries:
- Search semantic memories first for factual information
- Check lifelogs for conversation context and commitments
- Identify action items, promises, and discussions from recordings
- Present information in a clear, organized manner

You have access to:
- Semantic memory search for stored facts and preferences
- Limitless lifelog search for recorded conversations
- Context synthesis to combine multiple sources

Always be thorough but concise. If no relevant memory is found, say so clearly
rather than making assumptions. Prioritize recent and relevant context."""


@dataclass
class MemoryResult:
    """
    Result from a memory search operation.
    
    Attributes:
        source: Where this memory came from ('semantic', 'lifelog', 'combined')
        content: The memory content
        relevance_score: How relevant this memory is (0-1)
        timestamp: When this memory was created/recorded
        metadata: Additional metadata about the memory
    """
    source: str
    content: str
    relevance_score: float = 0.0
    timestamp: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class LifelogEntry:
    """
    A single lifelog entry from Limitless pendant.
    
    Attributes:
        id: Unique identifier for the lifelog
        title: Title/summary of the conversation
        start_time: When the conversation started
        end_time: When the conversation ended
        excerpt: Short excerpt of the conversation
        is_starred: Whether this is marked as important
    """
    id: str
    title: str
    start_time: str
    end_time: str | None = None
    excerpt: str = ""
    is_starred: bool = False


@dataclass
class SynthesizedContext:
    """
    Combined context from all memory sources.
    
    Attributes:
        semantic_memories: List of relevant semantic memories
        lifelog_entries: List of relevant lifelog entries
        summary: Synthesized summary of all context
        action_items: Extracted action items from lifelogs
        commitments: Extracted commitments from conversations
    """
    semantic_memories: list[MemoryResult] = field(default_factory=list)
    lifelog_entries: list[LifelogEntry] = field(default_factory=list)
    summary: str = ""
    action_items: list[str] = field(default_factory=list)
    commitments: list[str] = field(default_factory=list)


class MemoryCuratorAgent(BaseAgent):
    """
    Memory Curator Agent - ZEKE's memory and context specialist.
    
    This agent is responsible for:
    - Retrieving relevant semantic memories via Node.js bridge
    - Searching and synthesizing Limitless lifelog recordings
    - Combining memory sources to provide enriched context
    - Storing new memories extracted from conversations
    
    The Memory Curator works as a support agent, providing context
    to other specialist agents to improve their response accuracy.
    
    Attributes:
        agent_id: MEMORY_CURATOR
        capabilities: [MEMORY]
        handoff_targets: [CONDUCTOR, OPS_PLANNER, COMMS_PILOT]
    """
    
    async def _handle_search_lifelogs(self, ctx: Any, args: str) -> str:
        """Handler for search_lifelogs tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("search_lifelogs", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"search_lifelogs execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_get_recent_lifelogs(self, ctx: Any, args: str) -> str:
        """Handler for get_recent_lifelogs tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("get_recent_lifelogs", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"get_recent_lifelogs execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_get_lifelog_context(self, ctx: Any, args: str) -> str:
        """Handler for get_lifelog_context tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("get_lifelog_context", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"get_lifelog_context execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_check_limitless_status(self, ctx: Any, args: str) -> str:
        """Handler for check_limitless_status tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("check_limitless_status", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"check_limitless_status execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    def __init__(self):
        """Initialize the Memory Curator agent with its tools and configuration."""
        tool_definitions = [
            ToolDefinition(
                name="search_lifelogs",
                description="Search through Nate's recorded conversations and lifelogs from the Limitless pendant. Uses hybrid search (semantic + keyword) to find relevant conversations by topic, person, or content. Perfect for questions like 'What did Bob say about the project?' or 'Find the conversation where we discussed pricing'.",
                parameters={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query - can be semantic (e.g., 'dinner recommendations from Bob') or keyword-based (e.g., 'blue OR red')",
                        },
                        "limit": {
                            "type": "number",
                            "description": "Maximum number of results to return (default 5, max 100)",
                        },
                        "date": {
                            "type": "string",
                            "description": "Filter to specific date (YYYY-MM-DD format)",
                        },
                        "starred_only": {
                            "type": "boolean",
                            "description": "Only return starred/important conversations",
                        },
                    },
                    "required": ["query"],
                },
                handler=self._handle_search_lifelogs,
            ),
            ToolDefinition(
                name="get_recent_lifelogs",
                description="Get recent recorded conversations from Nate's Limitless pendant. Useful for context about what happened today or in the last few hours.",
                parameters={
                    "type": "object",
                    "properties": {
                        "hours": {
                            "type": "number",
                            "description": "How many hours back to look (default 24)",
                        },
                        "limit": {
                            "type": "number",
                            "description": "Maximum number of results to return (default 10)",
                        },
                        "today_only": {
                            "type": "boolean",
                            "description": "Only get conversations from today",
                        },
                    },
                    "required": [],
                },
                handler=self._handle_get_recent_lifelogs,
            ),
            ToolDefinition(
                name="get_lifelog_context",
                description="Get relevant lifelog context for a specific topic. Returns formatted conversation excerpts that can help answer questions about what was discussed. Use this before answering questions that might benefit from real-world context.",
                parameters={
                    "type": "object",
                    "properties": {
                        "topic": {
                            "type": "string",
                            "description": "The topic or question to find relevant context for",
                        },
                        "max_results": {
                            "type": "number",
                            "description": "Maximum number of conversations to include (default 5)",
                        },
                    },
                    "required": ["topic"],
                },
                handler=self._handle_get_lifelog_context,
            ),
            ToolDefinition(
                name="check_limitless_status",
                description="Check if the Limitless pendant API is connected and working properly.",
                parameters={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
                handler=self._handle_check_limitless_status,
            ),
        ]
        
        super().__init__(
            agent_id=AgentId.MEMORY_CURATOR,
            name="Memory Curator",
            description="ZEKE's memory and context specialist. Retrieves relevant memories, searches lifelogs, and provides enriched context to other agents.",
            instructions=MEMORY_CURATOR_INSTRUCTIONS,
            capabilities=[CapabilityCategory.MEMORY],
            tools=tool_definitions,
            handoff_targets=[
                AgentId.CONDUCTOR,
                AgentId.OPS_PLANNER,
                AgentId.COMMS_PILOT,
                AgentId.RESEARCH_SCOUT,
            ],
        )
    
    async def get_memory_context(self, message: str, limit: int = 10) -> dict[str, Any]:
        """
        Get relevant semantic memories for a message.
        
        Uses the Node.js bridge to call /api/memory/context for semantic search,
        retrieving memories based on the message content and ranking by relevance.
        
        Args:
            message: The message to find relevant memories for
            limit: Maximum number of memories to return (default 10)
            
        Returns:
            dict: Memory context with the following structure:
                - success: bool - Whether the operation succeeded
                - memories: list - List of relevant memory items
                - summary: str - Brief summary of found context
                - error: str | None - Error message if failed
        """
        try:
            result = await self.bridge.get_memory_context(message, limit)
            
            memories = result.get("memories", [])
            
            sorted_memories = sorted(
                memories,
                key=lambda m: m.get("relevance_score", 0),
                reverse=True
            )
            
            summary = ""
            if sorted_memories:
                top_topics = [m.get("content", "")[:100] for m in sorted_memories[:3]]
                summary = f"Found {len(sorted_memories)} relevant memories. Top topics: {'; '.join(top_topics)}"
            else:
                summary = "No relevant memories found for this query."
            
            return {
                "success": True,
                "memories": sorted_memories[:limit],
                "summary": summary,
                "total_found": len(memories),
            }
        except Exception as e:
            logger.error(f"Failed to get memory context: {e}")
            return {
                "success": False,
                "memories": [],
                "summary": "",
                "error": str(e),
            }
    
    async def search_lifelogs(
        self,
        query: str,
        limit: int = 5,
        date: str | None = None,
        starred_only: bool = False
    ) -> list[LifelogEntry]:
        """
        Search Limitless lifelogs for relevant conversations.
        
        Uses hybrid search (semantic + keyword) to find relevant conversations
        by topic, person, or content from Limitless pendant recordings.
        
        Args:
            query: Search query (semantic or keyword-based)
            limit: Maximum number of results (default 5, max 100)
            date: Optional date filter (YYYY-MM-DD format)
            starred_only: Only return starred/important conversations
            
        Returns:
            list[LifelogEntry]: List of matching lifelog entries
        """
        try:
            args: dict[str, Any] = {"query": query, "limit": limit}
            if date:
                args["date"] = date
            if starred_only:
                args["starred_only"] = starred_only
            
            result = await self.bridge.execute_tool("search_lifelogs", args)
            
            if not result.get("success", False):
                logger.warning(f"Lifelog search failed: {result.get('error', 'Unknown error')}")
                return []
            
            entries = []
            for item in result.get("results", []):
                entries.append(LifelogEntry(
                    id=item.get("id", ""),
                    title=item.get("title", "Untitled"),
                    start_time=item.get("startTime", ""),
                    end_time=item.get("endTime"),
                    excerpt=item.get("excerpt", ""),
                    is_starred=item.get("isStarred", False),
                ))
            
            return entries
        except Exception as e:
            logger.error(f"Failed to search lifelogs: {e}")
            return []
    
    async def get_recent_lifelogs(
        self,
        hours: int = 24,
        limit: int = 10,
        today_only: bool = False
    ) -> list[LifelogEntry]:
        """
        Get recent lifelog entries from Limitless pendant.
        
        Useful for getting context about what happened recently or today.
        
        Args:
            hours: How many hours back to look (default 24)
            limit: Maximum number of results (default 10)
            today_only: Only get conversations from today
            
        Returns:
            list[LifelogEntry]: List of recent lifelog entries
        """
        try:
            args: dict[str, Any] = {"hours": hours, "limit": limit}
            if today_only:
                args["today_only"] = today_only
            
            result = await self.bridge.execute_tool("get_recent_lifelogs", args)
            
            if not result.get("success", False):
                logger.warning(f"Failed to get recent lifelogs: {result.get('error', 'Unknown error')}")
                return []
            
            entries = []
            for item in result.get("results", []):
                entries.append(LifelogEntry(
                    id=item.get("id", ""),
                    title=item.get("title", "Untitled"),
                    start_time=item.get("startTime", ""),
                    end_time=item.get("endTime"),
                    excerpt=item.get("excerpt", ""),
                    is_starred=item.get("isStarred", False),
                ))
            
            return entries
        except Exception as e:
            logger.error(f"Failed to get recent lifelogs: {e}")
            return []
    
    async def get_lifelog_context(self, topic: str, max_results: int = 5) -> str:
        """
        Get formatted lifelog context for a specific topic.
        
        Returns formatted conversation excerpts that can help answer
        questions about what was discussed in past conversations.
        
        Args:
            topic: The topic or question to find context for
            max_results: Maximum number of conversations to include (default 5)
            
        Returns:
            str: Formatted context string with relevant conversation excerpts
        """
        try:
            result = await self.bridge.execute_tool("get_lifelog_context", {
                "topic": topic,
                "max_results": max_results,
            })
            
            if not result.get("success", False):
                return ""
            
            return result.get("context", "")
        except Exception as e:
            logger.error(f"Failed to get lifelog context: {e}")
            return ""
    
    async def check_limitless_status(self) -> dict[str, Any]:
        """
        Check if the Limitless pendant API is connected and working.
        
        Returns:
            dict: Status information with keys:
                - connected: bool - Whether API is accessible
                - error: str | None - Error message if not connected
        """
        try:
            result = await self.bridge.execute_tool("check_limitless_status", {})
            return {
                "connected": result.get("connected", False),
                "error": result.get("error"),
            }
        except Exception as e:
            logger.error(f"Failed to check Limitless status: {e}")
            return {
                "connected": False,
                "error": str(e),
            }
    
    async def synthesize_context(self, message: str) -> SynthesizedContext:
        """
        Combine all memory sources into a unified context.
        
        This method:
        1. Searches semantic memories for relevant facts
        2. Searches lifelogs for relevant conversations
        3. Extracts action items and commitments from lifelogs
        4. Creates a synthesized summary for use by other agents
        
        Args:
            message: The message/query to synthesize context for
            
        Returns:
            SynthesizedContext: Combined context from all sources
        """
        context = SynthesizedContext()
        
        memory_result = await self.get_memory_context(message, limit=5)
        if memory_result.get("success"):
            for mem in memory_result.get("memories", []):
                context.semantic_memories.append(MemoryResult(
                    source="semantic",
                    content=mem.get("content", ""),
                    relevance_score=mem.get("relevance_score", 0),
                    timestamp=mem.get("timestamp"),
                    metadata=mem.get("metadata", {}),
                ))
        
        lifelogs = await self.search_lifelogs(message, limit=5)
        context.lifelog_entries = lifelogs
        
        summary_parts = []
        
        if context.semantic_memories:
            memory_summary = f"Found {len(context.semantic_memories)} relevant memories"
            if context.semantic_memories[0].content:
                memory_summary += f": {context.semantic_memories[0].content[:100]}..."
            summary_parts.append(memory_summary)
        
        if context.lifelog_entries:
            lifelog_summary = f"Found {len(context.lifelog_entries)} relevant conversations"
            if context.lifelog_entries[0].title:
                lifelog_summary += f", including '{context.lifelog_entries[0].title}'"
            summary_parts.append(lifelog_summary)
            
            for entry in context.lifelog_entries:
                excerpt_lower = entry.excerpt.lower()
                if any(phrase in excerpt_lower for phrase in [
                    "i will", "i'll", "going to", "need to", 
                    "should", "must", "have to", "action item"
                ]):
                    context.action_items.append(f"[{entry.title}]: Check for action items")
                
                if any(phrase in excerpt_lower for phrase in [
                    "i promise", "committed to", "agreed to",
                    "will do", "count on me", "i'll handle"
                ]):
                    context.commitments.append(f"[{entry.title}]: Check for commitments")
        
        if summary_parts:
            context.summary = ". ".join(summary_parts) + "."
        else:
            context.summary = "No relevant context found in memories or lifelogs."
        
        return context
    
    async def save_memory(
        self,
        content: str,
        category: str = "fact",
        importance: float = 0.5,
        metadata: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """
        Save a new memory for future retrieval.

        Stores the memory in the database via the Node.js bridge, with optional
        metadata and importance scoring.

        Args:
            content: The memory content to store
            category: Category of memory (fact, preference, event, etc.)
            importance: How important this memory is (0-1)
            metadata: Additional metadata to store

        Returns:
            dict: Result with success status and memory ID
        """
        logger.info(f"Memory save requested: category={category}, importance={importance}")

        try:
            bridge = get_bridge()

            # Prepare metadata as JSON string
            metadata_dict = metadata or {}
            metadata_dict["category"] = category
            metadata_dict["importance"] = importance

            # Call Node.js create_memory_note tool via bridge
            result = await bridge.execute_tool("create_memory_note", {
                "content": content,
                "confidenceScore": importance,
                "metadata": json.dumps(metadata_dict)
            })

            if result.get("success"):
                memory_id = result.get("data", {}).get("id", "unknown")
                logger.info(f"Memory saved successfully: id={memory_id}")
                return {
                    "success": True,
                    "message": "Memory saved successfully",
                    "stored": True,
                    "memory_id": memory_id,
                    "content_preview": content[:100] if content else "",
                }
            else:
                error_msg = result.get("error", "Unknown error")
                logger.error(f"Failed to save memory: {error_msg}")
                return {
                    "success": False,
                    "message": f"Failed to save memory: {error_msg}",
                    "stored": False,
                    "content_preview": content[:100] if content else "",
                }

        except Exception as e:
            logger.error(f"Exception while saving memory: {e}", exc_info=True)
            return {
                "success": False,
                "message": f"Exception while saving memory: {str(e)}",
                "stored": False,
                "content_preview": content[:100] if content else "",
            }
    
    async def _execute(self, input_text: str, context: AgentContext) -> str:
        """
        Execute the Memory Curator's main logic.
        
        This method:
        1. Synthesizes context from all memory sources
        2. Persists enriched context for downstream agents
        3. Uses the OpenAI agent to process and respond
        4. Returns enriched context or answers memory-related queries
        
        Args:
            input_text: The user's input message
            context: Context passed to the agent
            
        Returns:
            str: The agent's response with memory context
        """
        if not hasattr(context, 'memory_context') or context.memory_context is None:
            context.memory_context = {}
        
        synthesized = await self.synthesize_context(input_text)
        
        context.memory_context["enriched_context"] = {
            "summary": synthesized.summary,
            "semantic_memories": [
                {
                    "source": mem.source,
                    "content": mem.content,
                    "relevance_score": mem.relevance_score,
                    "timestamp": mem.timestamp,
                }
                for mem in synthesized.semantic_memories
            ],
            "lifelog_entries": [
                {
                    "id": entry.id,
                    "title": entry.title,
                    "start_time": entry.start_time,
                    "end_time": entry.end_time,
                    "excerpt": entry.excerpt,
                    "is_starred": entry.is_starred,
                }
                for entry in synthesized.lifelog_entries
            ],
            "action_items": synthesized.action_items,
            "commitments": synthesized.commitments,
        }
        
        context_block = self._format_context_block(synthesized)
        
        enriched_input = f"""User Query: {input_text}

{context_block}

Based on the available memory context above, please provide a helpful response.
If the query is about recalling information, use the context to answer.
If you need more specific information, use the available tools to search.
If no relevant context is found, acknowledge this and offer to help search for information."""
        
        runner = Runner()
        result = await runner.run(self.openai_agent, enriched_input)
        
        if hasattr(result, 'final_output'):
            return result.final_output
        return str(result)
    
    def _format_context_block(self, context: SynthesizedContext) -> str:
        """
        Format synthesized context into a readable block.
        
        Args:
            context: The synthesized context to format
            
        Returns:
            str: Formatted context block for the agent
        """
        parts = ["=== Memory Context ===", f"Summary: {context.summary}", ""]
        
        if context.semantic_memories:
            parts.append("Semantic Memories:")
            for i, mem in enumerate(context.semantic_memories[:5], 1):
                parts.append(f"  {i}. {mem.content[:200]}...")
            parts.append("")
        
        if context.lifelog_entries:
            parts.append("Relevant Conversations (Lifelogs):")
            for i, entry in enumerate(context.lifelog_entries[:5], 1):
                starred = " [STARRED]" if entry.is_starred else ""
                parts.append(f"  {i}. {entry.title}{starred} ({entry.start_time})")
                if entry.excerpt:
                    parts.append(f"      Excerpt: {entry.excerpt[:150]}...")
            parts.append("")
        
        if context.action_items:
            parts.append("Potential Action Items:")
            for item in context.action_items[:5]:
                parts.append(f"  - {item}")
            parts.append("")
        
        if context.commitments:
            parts.append("Potential Commitments:")
            for commitment in context.commitments[:5]:
                parts.append(f"  - {commitment}")
            parts.append("")
        
        return "\n".join(parts)
    
    def get_context_for_handoff(self, context: AgentContext) -> dict[str, Any]:
        """
        Get a context dict suitable for handoff to another agent.
        
        Returns the enriched context that was persisted during _execute,
        allowing downstream agents to receive the memory context without
        needing to re-fetch it.
        
        Args:
            context: The agent context containing persisted memory_context
            
        Returns:
            dict: Context information for handoff including enriched memory context
        """
        if not hasattr(context, 'memory_context') or context.memory_context is None:
            return {
                "source_agent": self.agent_id.value,
                "handoff_type": "memory_context",
                "capabilities_used": [],
                "enriched_context": {},
                "summary": "No context available - memory_context not initialized",
                "has_memories": False,
                "has_lifelogs": False,
                "action_items": [],
                "commitments": [],
                "synthesis_failed": True,
                "completion_status": "error",
                "error": "memory_context was not available",
            }
        
        enriched = context.memory_context.get("enriched_context", {})
        
        if not enriched:
            return {
                "source_agent": self.agent_id.value,
                "handoff_type": "memory_context",
                "capabilities_used": ["semantic_memory", "lifelog_search", "context_synthesis"],
                "enriched_context": {},
                "summary": "No enriched context available - context synthesis may have failed",
                "has_memories": False,
                "has_lifelogs": False,
                "action_items": [],
                "commitments": [],
                "synthesis_failed": True,
                "completion_status": "error",
                "error": "enriched_context was empty or not found",
            }
        
        return {
            "source_agent": self.agent_id.value,
            "handoff_type": "memory_context",
            "capabilities_used": ["semantic_memory", "lifelog_search", "context_synthesis"],
            "enriched_context": enriched,
            "summary": enriched.get("summary", "No context available"),
            "has_memories": len(enriched.get("semantic_memories", [])) > 0,
            "has_lifelogs": len(enriched.get("lifelog_entries", [])) > 0,
            "action_items": enriched.get("action_items", []),
            "commitments": enriched.get("commitments", []),
            "synthesis_failed": False,
            "completion_status": "success",
        }


_memory_curator_instance: MemoryCuratorAgent | None = None


def get_memory_curator() -> MemoryCuratorAgent:
    """
    Get singleton MemoryCuratorAgent instance.
    
    Returns:
        MemoryCuratorAgent: The shared Memory Curator instance
    """
    global _memory_curator_instance
    if _memory_curator_instance is None:
        _memory_curator_instance = MemoryCuratorAgent()
    return _memory_curator_instance

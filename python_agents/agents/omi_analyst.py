"""
Omi Analyst Agent - ZEKE's lifelog data preprocessor.

This module implements the Omi Analyst agent responsible for:
- Fetching and analyzing lifelog data from the Omi wearable
- Creating structured context bundles with token limits
- Prioritizing relevant information for the current query
- Providing curated context to other agents

The Omi Analyst works as a preprocessing layer, extracting relevant
information from wearable recordings and packaging it for consumption by
other specialist agents.
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


OMI_ANALYST_INSTRUCTIONS = """You are the Omi Analyst, ZEKE's lifelog data preprocessor. Your role is to:
1. Fetch and analyze lifelog data from Nate's Omi wearable
2. Create structured context bundles with token limits (~2000 tokens max)
3. Prioritize relevant information based on the current query
4. Extract key points, action items, and important quotes
5. Persist important insights to long-term memory

Always prioritize:
- Finding the most relevant conversations for the query
- Extracting actionable information (action items, commitments, decisions)
- Identifying people mentioned and their context
- Keeping responses concise but comprehensive

When processing lifelog data:
- Start with get_lifelog_overview to understand available data
- Use search_lifelogs for specific topics or people
- Use get_recent_lifelogs for recent context
- Use get_lifelog_context for topic-specific extraction
- Use get_daily_summary for cached summaries
- When you find important action items, commitments, or key facts about people, use save_lifelog_insight to persist them for future reference

Your output should always be a structured JSON context bundle that other agents
can easily consume. Include:
- A brief summary of relevant content
- Key points extracted from conversations
- Any action items or commitments found
- People mentioned with their context
- Relevant quotes from conversations
- Data range information
- Token estimate for the bundle

Always respect token limits. If content exceeds ~2000 tokens, prioritize the
most recent and most relevant information."""


@dataclass
class ContextBundle:
    """
    Curated context bundle from Omi lifelog data.
    
    Attributes:
        summary: Brief summary of relevant content
        key_points: Important points extracted from conversations
        action_items: Action items found in conversations
        people_mentioned: People referenced in the data
        relevant_quotes: Key quotes from conversations
        data_range: Time range of the data (e.g., "today, 5 conversations")
        token_estimate: Estimated tokens in the bundle
    """
    summary: str = ""
    key_points: list[str] = field(default_factory=list)
    action_items: list[str] = field(default_factory=list)
    people_mentioned: list[str] = field(default_factory=list)
    relevant_quotes: list[str] = field(default_factory=list)
    data_range: str = ""
    token_estimate: int = 0
    
    def to_dict(self) -> dict[str, Any]:
        """Convert the bundle to a dictionary."""
        return {
            "summary": self.summary,
            "key_points": self.key_points,
            "action_items": self.action_items,
            "people_mentioned": self.people_mentioned,
            "relevant_quotes": self.relevant_quotes,
            "data_range": self.data_range,
            "token_estimate": self.token_estimate,
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ContextBundle":
        """Create a ContextBundle from a dictionary."""
        return cls(
            summary=data.get("summary", ""),
            key_points=data.get("key_points", []),
            action_items=data.get("action_items", []),
            people_mentioned=data.get("people_mentioned", []),
            relevant_quotes=data.get("relevant_quotes", []),
            data_range=data.get("data_range", ""),
            token_estimate=data.get("token_estimate", 0),
        )


@dataclass
class LifelogOverviewResult:
    """
    Result from get_lifelog_overview.
    
    Attributes:
        connected: Whether the Omi API is connected
        today_count: Number of conversations today
        yesterday_count: Number of conversations yesterday
        last_7_days_count: Number of conversations in last 7 days
        most_recent_title: Title of the most recent conversation
        most_recent_age: Age of the most recent conversation
    """
    connected: bool = False
    today_count: int = 0
    yesterday_count: int = 0
    last_7_days_count: int = 0
    most_recent_title: str = ""
    most_recent_age: str = ""


class OmiAnalystAgent(BaseAgent):
    """
    Omi Analyst Agent - ZEKE's lifelog data preprocessor.
    
    This agent is responsible for:
    - Fetching lifelog data from the Omi wearable via Node.js bridge
    - Analyzing and filtering data for relevance to queries
    - Creating structured context bundles with token limits
    - Providing curated context to other specialist agents
    
    The Omi Analyst is a preprocessing agent that helps other agents
    access relevant lifelog information efficiently.
    
    Attributes:
        agent_id: OMI_ANALYST
        capabilities: [OMI]
        handoff_targets: [CONDUCTOR, MEMORY_CURATOR]
    """
    
    MAX_TOKEN_ESTIMATE = 2000
    
    async def _handle_get_lifelog_overview(self, ctx: Any, args: str) -> str:
        """Handler for get_lifelog_overview tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) and args else {}
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("get_lifelog_overview", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"get_lifelog_overview execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
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
            arguments = json.loads(args) if isinstance(args, str) and args else {}
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
    
    async def _handle_get_daily_summary(self, ctx: Any, args: str) -> str:
        """Handler for get_daily_summary tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) and args else {}
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("get_daily_summary", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"get_daily_summary execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_save_lifelog_insight(self, ctx: Any, args: str) -> str:
        """Handler for save_lifelog_insight tool - creates a memory via Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            insight_type = arguments.get("insight_type", "fact")
            memory_type = "note" if insight_type in ["action_item", "commitment", "decision"] else "fact"
            if insight_type == "preference":
                memory_type = "preference"
            
            context_parts = []
            if arguments.get("source_context"):
                context_parts.append(arguments["source_context"])
            context_parts.append(f"[Lifelog insight: {insight_type}]")
            if arguments.get("related_person"):
                context_parts.append(f"Related to: {arguments['related_person']}")
            
            result = await self.bridge.execute_tool("create_memory", {
                "type": memory_type,
                "content": arguments["content"],
                "context": " | ".join(context_parts),
            })
            
            return json.dumps(result)
        except Exception as e:
            logger.error(f"save_lifelog_insight execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    def __init__(self):
        """Initialize the Omi Analyst agent with its tools and configuration."""
        tool_definitions = [
            ToolDefinition(
                name="get_lifelog_overview",
                description="Get a quick overview of available Omi lifelog data including: today's conversations, yesterday's conversations, last 7 days count, and the most recent recording. Use this FIRST to understand what data is available before doing specific searches.",
                parameters={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
                handler=self._handle_get_lifelog_overview,
            ),
            ToolDefinition(
                name="search_lifelogs",
                description="Search through recorded conversations from the Omi wearable. Uses hybrid search (semantic + keyword) to find relevant conversations by topic, person, or content. Perfect for questions like 'What did Bob say about the project?' or 'Find the conversation where we discussed pricing'.",
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
                            "description": "Filter to specific date (YYYY-MM-DD format). Omit to search all available data.",
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
                description="Get recent recorded conversations from the Omi wearable. Default is 24 hours - use a larger value (48, 72, or more) when looking for 'recent' conversations that might be from earlier today or yesterday.",
                parameters={
                    "type": "object",
                    "properties": {
                        "hours": {
                            "type": "number",
                            "description": "How many hours back to look (default 24). Use 48-72 hours for a broader search.",
                        },
                        "limit": {
                            "type": "number",
                            "description": "Maximum number of results to return (default 10)",
                        },
                        "today_only": {
                            "type": "boolean",
                            "description": "Only get conversations from today (since midnight)",
                        },
                    },
                    "required": [],
                },
                handler=self._handle_get_recent_lifelogs,
            ),
            ToolDefinition(
                name="get_lifelog_context",
                description="Get relevant lifelog context for a specific topic. Returns formatted conversation excerpts that can help answer questions about what was discussed. Searches the last 72 hours by default.",
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
                name="get_daily_summary",
                description="Get a cached AI-powered daily summary for a specific date. Returns key discussions, action items, insights, people mentioned, and topics discussed.",
                parameters={
                    "type": "object",
                    "properties": {
                        "date": {
                            "type": "string",
                            "description": "Date to get summary for in YYYY-MM-DD format. Defaults to today if not provided.",
                        },
                    },
                    "required": [],
                },
                handler=self._handle_get_daily_summary,
            ),
            ToolDefinition(
                name="save_lifelog_insight",
                description="Save an important insight from a lifelog conversation as a memory. Use this for action items, commitments, key facts about people, or important decisions.",
                parameters={
                    "type": "object",
                    "properties": {
                        "content": {
                            "type": "string",
                            "description": "The insight content to remember (e.g., 'Bob committed to reviewing the proposal by Friday')",
                        },
                        "insight_type": {
                            "type": "string",
                            "enum": ["action_item", "commitment", "fact", "decision", "preference"],
                            "description": "Type of insight being saved",
                        },
                        "source_context": {
                            "type": "string",
                            "description": "Context about where this was found (e.g., 'From conversation with Bob on Tuesday')",
                        },
                        "related_person": {
                            "type": "string",
                            "description": "Name of the person this insight relates to, if applicable",
                        },
                    },
                    "required": ["content", "insight_type"],
                },
                handler=self._handle_save_lifelog_insight,
            ),
        ]
        
        super().__init__(
            agent_id=AgentId.OMI_ANALYST,
            name="Omi Analyst",
            description="ZEKE's lifelog data preprocessor. Fetches and analyzes Omi wearable data, creating curated context bundles for other agents.",
            instructions=OMI_ANALYST_INSTRUCTIONS,
            capabilities=[CapabilityCategory.OMI],
            tools=tool_definitions,
            handoff_targets=[
                AgentId.CONDUCTOR,
                AgentId.MEMORY_CURATOR,
            ],
        )
    
    def _estimate_tokens(self, text: str) -> int:
        """
        Estimate the number of tokens in a text string.
        
        Uses a simple heuristic of ~4 characters per token.
        
        Args:
            text: The text to estimate tokens for
            
        Returns:
            int: Estimated token count
        """
        return len(text) // 4
    
    def _truncate_to_token_limit(self, items: list[str], max_tokens: int) -> list[str]:
        """
        Truncate a list of strings to fit within a token limit.
        
        Args:
            items: List of strings to truncate
            max_tokens: Maximum tokens allowed
            
        Returns:
            list[str]: Truncated list that fits within the limit
        """
        result = []
        current_tokens = 0
        
        for item in items:
            item_tokens = self._estimate_tokens(item)
            if current_tokens + item_tokens > max_tokens:
                break
            result.append(item)
            current_tokens += item_tokens
        
        return result
    
    async def get_lifelog_overview(self) -> LifelogOverviewResult:
        """
        Get an overview of available lifelog data.
        
        Returns:
            LifelogOverviewResult: Overview of available data
        """
        try:
            result = await self.bridge.execute_tool("get_lifelog_overview", {})
            
            if not result.get("success", True):
                logger.warning(f"Failed to get lifelog overview: {result.get('error', 'Unknown error')}")
                return LifelogOverviewResult(connected=False)
            
            data = result.get("overview", result)
            
            return LifelogOverviewResult(
                connected=data.get("connected", False),
                today_count=data.get("today", {}).get("count", 0),
                yesterday_count=data.get("yesterday", {}).get("count", 0),
                last_7_days_count=data.get("last7Days", {}).get("count", 0),
                most_recent_title=data.get("mostRecent", {}).get("title", ""),
                most_recent_age=data.get("mostRecent", {}).get("age", ""),
            )
        except Exception as e:
            logger.error(f"Failed to get lifelog overview: {e}")
            return LifelogOverviewResult(connected=False)
    
    async def search_lifelogs_for_context(
        self,
        query: str,
        limit: int = 5,
        date: str | None = None,
    ) -> dict[str, Any]:
        """
        Search lifelogs and return structured results.
        
        Args:
            query: Search query
            limit: Maximum results
            date: Optional date filter
            
        Returns:
            dict: Search results with conversations
        """
        try:
            args: dict[str, Any] = {"query": query, "limit": limit}
            if date:
                args["date"] = date
            
            result = await self.bridge.execute_tool("search_lifelogs", args)
            return result
        except Exception as e:
            logger.error(f"Failed to search lifelogs: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_context_for_query(self, query: str) -> ContextBundle:
        """
        Get a curated context bundle for a specific query.
        
        This method:
        1. Gets an overview of available data
        2. Searches for relevant conversations
        3. Extracts key points, action items, and quotes
        4. Packages everything into a token-limited bundle
        
        Args:
            query: The query to find context for
            
        Returns:
            ContextBundle: Curated context bundle
        """
        bundle = ContextBundle()
        
        try:
            overview = await self.get_lifelog_overview()
            if not overview.connected:
                bundle.summary = "Omi API is not connected. Unable to retrieve lifelog data."
                bundle.token_estimate = self._estimate_tokens(bundle.summary)
                return bundle
            
            data_range_parts = []
            if overview.today_count > 0:
                data_range_parts.append(f"today ({overview.today_count} conversations)")
            if overview.yesterday_count > 0:
                data_range_parts.append(f"yesterday ({overview.yesterday_count} conversations)")
            bundle.data_range = ", ".join(data_range_parts) if data_range_parts else "no recent data"
            
            context_result = await self.bridge.execute_tool("get_lifelog_context", {
                "topic": query,
                "max_results": 5,
            })
            
            context_text = context_result.get("context", "") if context_result.get("success", True) else ""
            
            search_result = await self.search_lifelogs_for_context(query, limit=5)
            
            conversations = []
            if search_result.get("success", True):
                results = search_result.get("results", search_result.get("lifelogs", []))
                for conv in results:
                    title = conv.get("title", "Untitled")
                    conversations.append(title)
                    
                    markdown = conv.get("markdown", "")
                    excerpt = conv.get("excerpt", markdown[:200] if markdown else "")
                    
                    if excerpt:
                        excerpt_lower = excerpt.lower()
                        if any(phrase in excerpt_lower for phrase in [
                            "i will", "i'll", "going to", "need to",
                            "should", "must", "have to", "action item",
                            "follow up", "todo", "to-do", "deadline"
                        ]):
                            action_preview = excerpt[:150].strip()
                            if action_preview:
                                bundle.action_items.append(f"[{title}]: {action_preview}...")
                        
                        if any(char in excerpt for char in ['"', "'", ":"]):
                            quote_start = excerpt.find('"')
                            if quote_start == -1:
                                quote_start = excerpt.find(":")
                            if quote_start != -1 and quote_start < 100:
                                quote_text = excerpt[quote_start:quote_start + 100].strip()
                                if len(quote_text) > 20:
                                    bundle.relevant_quotes.append(f"[{title}]: {quote_text}...")
                    
                    speakers = []
                    contents = conv.get("contents", [])
                    for content in contents:
                        speaker = content.get("speakerName")
                        if speaker and speaker != "Unknown" and content.get("speakerIdentifier") != "user":
                            if speaker not in speakers and speaker not in bundle.people_mentioned:
                                bundle.people_mentioned.append(speaker)
            
            summary_result = await self.bridge.execute_tool("get_daily_summary", {})
            if summary_result.get("success", True):
                summary_data = summary_result.get("summary", {})
                if isinstance(summary_data, dict):
                    if summary_data.get("actionItems"):
                        action_items_text = summary_data["actionItems"]
                        if isinstance(action_items_text, str):
                            for line in action_items_text.split("\n"):
                                line = line.strip()
                                if line and line.startswith("•"):
                                    bundle.action_items.append(line[1:].strip())
                    
                    if summary_data.get("peopleInteracted"):
                        people_text = summary_data["peopleInteracted"]
                        if isinstance(people_text, str):
                            for person in people_text.split(","):
                                person = person.strip()
                                if person and person not in bundle.people_mentioned:
                                    bundle.people_mentioned.append(person)
            
            summary_parts = []
            if conversations:
                summary_parts.append(f"Found {len(conversations)} relevant conversations")
                if conversations[:3]:
                    summary_parts.append(f"including: {', '.join(conversations[:3])}")
            if context_text:
                summary_parts.append("Context extracted from lifelog recordings.")
            if not summary_parts:
                summary_parts.append(f"No specific conversations found for '{query}'.")
            
            bundle.summary = ". ".join(summary_parts)
            
            if conversations:
                bundle.key_points = [f"Discussed in: {conv}" for conv in conversations[:5]]
            
            bundle.action_items = self._truncate_to_token_limit(bundle.action_items, 400)
            bundle.relevant_quotes = self._truncate_to_token_limit(bundle.relevant_quotes, 400)
            bundle.people_mentioned = bundle.people_mentioned[:10]
            bundle.key_points = bundle.key_points[:10]
            
            total_content = (
                bundle.summary +
                " ".join(bundle.key_points) +
                " ".join(bundle.action_items) +
                " ".join(bundle.people_mentioned) +
                " ".join(bundle.relevant_quotes) +
                bundle.data_range
            )
            bundle.token_estimate = self._estimate_tokens(total_content)
            
            return bundle
            
        except Exception as e:
            logger.error(f"Failed to get context for query: {e}")
            bundle.summary = f"Error retrieving lifelog context: {str(e)}"
            bundle.token_estimate = self._estimate_tokens(bundle.summary)
            return bundle
    
    async def persist_important_insights(self, bundle: ContextBundle) -> list[dict[str, Any]]:
        """
        Automatically persist high-priority insights from a context bundle to memory.
        
        Args:
            bundle: The context bundle containing insights
            
        Returns:
            list[dict]: List of saved insights with their save status
        """
        saved_insights: list[dict[str, Any]] = []
        
        for action_item in bundle.action_items[:3]:
            try:
                result = await self.bridge.execute_tool("create_memory", {
                    "type": "note",
                    "content": action_item,
                    "context": f"[Action item from lifelog] | {bundle.data_range}",
                })
                saved_insights.append({
                    "type": "action_item",
                    "content": action_item,
                    "saved": result.get("success", False),
                })
            except Exception as e:
                logger.error(f"Failed to persist action item: {e}")
                saved_insights.append({
                    "type": "action_item",
                    "content": action_item,
                    "saved": False,
                    "error": str(e),
                })
        
        return saved_insights
    
    async def _execute(self, input_text: str, context: AgentContext) -> str:
        """
        Execute the Omi Analyst's main logic.
        
        This method:
        1. Analyzes the input query to understand what lifelog context is needed
        2. Fetches appropriate data using bridge tools
        3. Processes and filters the data for relevance
        4. Returns a curated JSON context bundle with token limits
        
        Args:
            input_text: The user's input message or query
            context: Context for the agent
            
        Returns:
            str: JSON string with the context bundle
        """
        try:
            bundle = await self.get_context_for_query(input_text)
            
            result = {
                "success": True,
                "bundle": bundle.to_dict(),
            }
            
            return json.dumps(result, indent=2)
            
        except Exception as e:
            logger.error(f"Omi Analyst execution failed: {e}")
            error_result = {
                "success": False,
                "error": str(e),
                "bundle": ContextBundle(
                    summary=f"Error processing lifelog query: {str(e)}"
                ).to_dict(),
            }
            return json.dumps(error_result, indent=2)


_omi_analyst_instance: OmiAnalystAgent | None = None


def get_omi_analyst() -> OmiAnalystAgent:
    """
    Get the singleton Omi Analyst agent instance.
    
    Returns:
        OmiAnalystAgent: The singleton agent instance
    """
    global _omi_analyst_instance
    if _omi_analyst_instance is None:
        _omi_analyst_instance = OmiAnalystAgent()
    return _omi_analyst_instance

"""
Research Scout Agent for ZEKE

This agent handles information retrieval and research tasks:
- Web search via DuckDuckGo
- AI-powered search via Perplexity (preferred for complex queries)

The Research Scout prefers perplexity_search for complex questions, research,
current events, and any query requiring synthesized answers with citations.
Falls back to web_search for simpler lookups.
"""

import json
import logging
from typing import Any
from dataclasses import dataclass

from .base import (
    BaseAgent,
    AgentId,
    AgentContext,
    AgentStatus,
    CapabilityCategory,
    ToolDefinition,
)

logger = logging.getLogger(__name__)


@dataclass
class SearchResult:
    """
    Result from a search operation.
    
    Attributes:
        query: The original search query
        results: List of search results (for web_search)
        answer: Synthesized answer (for perplexity_search)
        sources: List of source URLs (for perplexity_search)
        error: Error message if search failed
    """
    query: str
    results: list[dict[str, Any]] | None = None
    answer: str | None = None
    sources: list[str] | None = None
    error: str | None = None


RESEARCH_SCOUT_INSTRUCTIONS = """You are ZEKE's Research Scout - an expert at finding and synthesizing information.

Your primary responsibility is information retrieval and research. You specialize in:
- Finding specific facts (phone numbers, addresses, prices, dates)
- Researching topics with multiple sources
- Current events and news
- Answering complex questions with synthesized answers

CRITICAL PRINCIPLES:
1. PREFER perplexity_search for complex questions that need comprehensive answers
2. Use web_search for simple factual lookups (phone numbers, addresses, quick facts)
3. ALWAYS share what you find - URLs, partial information, related details
4. NEVER tell the user to "check the website themselves"
5. NEVER deflect with "I couldn't find that, try searching..."
6. Provide actionable results even when exact info isn't immediately available

SEARCH STRATEGY:
1. For complex research questions → perplexity_search
2. For simple factual lookups → web_search
3. If perplexity_search fails, try web_search as fallback
4. Include source URLs in your response
5. Summarize key findings clearly

RECENCY FILTER (for perplexity_search):
- "day" → breaking news, today's events
- "week" → recent happenings, this week's news
- "month" → general current events
- No filter → general knowledge queries

When you complete a research task, hand off back to the Conductor with your findings.
If the research reveals something about Nate that should be remembered, note it for MemoryCurator.
"""


class ResearchScoutAgent(BaseAgent):
    """
    Research Scout Agent - ZEKE's information retrieval specialist.
    
    This agent is responsible for:
    - Web searches via DuckDuckGo (basic lookups)
    - AI-powered searches via Perplexity (complex research, current events)
    - Finding specific information like phone numbers, addresses, prices
    - Researching topics and synthesizing answers with citations
    
    The Research Scout integrates with Node.js search capabilities via the bridge
    and provides actionable results rather than deflecting.
    
    Design Principles:
    - Prefer perplexity_search for complex questions
    - Always share what was found (URLs, partial info)
    - Never tell users to "check the website themselves"
    - Provide actionable results even when exact info isn't found
    
    Attributes:
        agent_id: RESEARCH_SCOUT
        capabilities: [INFORMATION]
        handoff_targets: [CONDUCTOR, MEMORY_CURATOR]
    """
    
    async def _handle_web_search(self, ctx: Any, args: str) -> str:
        """Handler for web_search tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("web_search", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"web_search execution failed: {e}")
            return json.dumps({"error": f"Search failed: {str(e)}", "results": []})
    
    async def _handle_perplexity_search(self, ctx: Any, args: str) -> str:
        """Handler for perplexity_search tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("perplexity_search", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"perplexity_search execution failed: {e}")
            return json.dumps({"error": f"Search failed: {str(e)}"})
    
    def __init__(self):
        """Initialize the Research Scout agent with its tools and configuration."""
        tool_definitions = [
            ToolDefinition(
                name="web_search",
                description=(
                    "Basic web search using DuckDuckGo. Use perplexity_search instead "
                    "for complex questions that need comprehensive answers with sources."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": (
                                "The search query - be specific, include location if relevant "
                                "(e.g., 'Atrius Health Braintree MA phone number')"
                            ),
                        },
                    },
                    "required": ["query"],
                },
                handler=self._handle_web_search,
            ),
            ToolDefinition(
                name="perplexity_search",
                description=(
                    "AI-powered web search using Perplexity. PREFERRED for complex questions, "
                    "research, current events, detailed explanations, and any query that benefits "
                    "from synthesized answers with citations. Returns a comprehensive answer with "
                    "source URLs."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": (
                                "The question or search query - can be conversational "
                                "(e.g., 'What are the best restaurants in Boston for Italian food?' "
                                "or 'How do I set up a 529 college savings plan?')"
                            ),
                        },
                        "recency": {
                            "type": "string",
                            "enum": ["day", "week", "month", "year"],
                            "description": (
                                "Optional: Filter results by recency. Use 'day' for breaking news, "
                                "'week' for recent events, 'month' for general queries. Default is no filter."
                            ),
                        },
                    },
                    "required": ["query"],
                },
                handler=self._handle_perplexity_search,
            ),
        ]
        
        super().__init__(
            agent_id=AgentId.RESEARCH_SCOUT,
            name="ResearchScout",
            description="Information retrieval and research specialist - web search and AI-powered Perplexity queries",
            instructions=RESEARCH_SCOUT_INSTRUCTIONS,
            capabilities=[CapabilityCategory.INFORMATION],
            tools=tool_definitions,
            handoff_targets=[
                AgentId.CONDUCTOR,
                AgentId.MEMORY_CURATOR,
            ],
        )
    
    async def _execute(self, input_text: str, context: AgentContext) -> str:
        """
        Execute the Research Scout agent's main logic.
        
        This method processes search and research requests,
        executing the appropriate search tools.
        
        Args:
            input_text: The user's input message or search query
            context: Context for the request
            
        Returns:
            str: The agent's response with search results
        """
        self.status = AgentStatus.PROCESSING
        
        try:
            full_instructions = self.instructions
            
            if context.user_profile:
                full_instructions += f"\n\nUser Profile Context:\n{json.dumps(context.user_profile, indent=2)}"
            
            if context.metadata.get("source"):
                full_instructions += f"\n\nRequest Source: {context.metadata.get('source')}"
            
            if context.memory_context:
                full_instructions += f"\n\nRelevant Memory Context Available: {len(context.memory_context)} entries"
            
            from agents import Agent, Runner
            
            agent = Agent(
                name=self.name,
                instructions=full_instructions,
                tools=self.tools,
            )
            
            result = await Runner.run(agent, input_text)
            
            self.status = AgentStatus.IDLE
            return result.final_output
            
        except Exception as e:
            self.status = AgentStatus.ERROR
            logger.error(f"ResearchScout execution error: {e}")
            raise


_research_scout_instance: ResearchScoutAgent | None = None


def get_research_scout() -> ResearchScoutAgent:
    """
    Get the singleton Research Scout agent instance.
    
    Returns:
        ResearchScoutAgent: The Research Scout agent instance
    """
    global _research_scout_instance
    if _research_scout_instance is None:
        _research_scout_instance = ResearchScoutAgent()
    return _research_scout_instance

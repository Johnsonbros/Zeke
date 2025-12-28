"""
News Client for ZEKE Trading Module

Fetches stock-relevant news from the main ZEKE news system to enhance
trading decisions with market context.
"""

import os
import logging
import httpx
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

logger = logging.getLogger("zeke_trader.news_client")

ZEKE_API_BASE = os.getenv("ZEKE_API_BASE", "http://localhost:5000")


@dataclass
class NewsStory:
    """Individual news story relevant to trading."""
    headline: str
    summary: str
    source: Optional[str]
    relevance: str
    sentiment: str
    published_at: str
    tags: List[str]


@dataclass
class TradingNewsContext:
    """News context for trading decisions."""
    stories: List[NewsStory]
    market_sentiment: str
    key_themes: List[str]
    last_updated: str
    formatted_text: Optional[str] = None
    
    def to_prompt_section(self) -> str:
        """Convert news context to a prompt section for the LLM."""
        if not self.stories:
            return "MARKET NEWS: No recent relevant news available."
        
        lines = [
            f"MARKET NEWS CONTEXT (sentiment: {self.market_sentiment.upper()}):",
        ]
        
        if self.key_themes:
            lines.append(f"Key themes: {', '.join(self.key_themes)}")
        
        lines.append("")
        
        for story in self.stories[:5]:
            sentiment_marker = {
                "positive": "[+]",
                "negative": "[-]",
                "neutral": "[=]",
                "unknown": "[?]"
            }.get(story.sentiment, "[?]")
            
            lines.append(f"{sentiment_marker} {story.headline}")
            lines.append(f"    Relevance: {story.relevance}")
            if story.tags:
                lines.append(f"    Tags: {', '.join(story.tags[:3])}")
        
        return "\n".join(lines)


async def fetch_trading_news(hours_back: int = 24) -> Optional[TradingNewsContext]:
    """
    Fetch trading-relevant news from the ZEKE news system.
    
    Args:
        hours_back: How many hours of news to fetch (default 24)
    
    Returns:
        TradingNewsContext or None if fetch failed
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{ZEKE_API_BASE}/api/trading/zeke-news",
                params={"hours": hours_back, "format": "text"}
            )
            
            if response.status_code != 200:
                logger.warning(f"Failed to fetch news: HTTP {response.status_code}")
                return None
            
            data = response.json()
            if not data.get("success"):
                logger.warning("News API returned failure")
                return None
            
            context_data = data.get("context", {})
            stories_data = context_data.get("stories", [])
            
            stories = [
                NewsStory(
                    headline=s.get("headline", ""),
                    summary=s.get("summary", ""),
                    source=s.get("source"),
                    relevance=s.get("relevance", ""),
                    sentiment=s.get("sentiment", "unknown"),
                    published_at=s.get("publishedAt", ""),
                    tags=s.get("tags", [])
                )
                for s in stories_data
            ]
            
            return TradingNewsContext(
                stories=stories,
                market_sentiment=context_data.get("marketSentiment", "neutral"),
                key_themes=context_data.get("keyThemes", []),
                last_updated=context_data.get("lastUpdated", ""),
                formatted_text=data.get("formatted")
            )
            
    except httpx.TimeoutException:
        logger.warning("News fetch timed out")
        return None
    except Exception as e:
        logger.error(f"Error fetching trading news: {e}")
        return None


def fetch_trading_news_sync(hours_back: int = 24) -> Optional[TradingNewsContext]:
    """
    Synchronous version of fetch_trading_news for non-async contexts.
    """
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(
                f"{ZEKE_API_BASE}/api/trading/zeke-news",
                params={"hours": hours_back, "format": "text"}
            )
            
            if response.status_code != 200:
                logger.warning(f"Failed to fetch news: HTTP {response.status_code}")
                return None
            
            data = response.json()
            if not data.get("success"):
                logger.warning("News API returned failure")
                return None
            
            context_data = data.get("context", {})
            stories_data = context_data.get("stories", [])
            
            stories = [
                NewsStory(
                    headline=s.get("headline", ""),
                    summary=s.get("summary", ""),
                    source=s.get("source"),
                    relevance=s.get("relevance", ""),
                    sentiment=s.get("sentiment", "unknown"),
                    published_at=s.get("publishedAt", ""),
                    tags=s.get("tags", [])
                )
                for s in stories_data
            ]
            
            return TradingNewsContext(
                stories=stories,
                market_sentiment=context_data.get("marketSentiment", "neutral"),
                key_themes=context_data.get("keyThemes", []),
                last_updated=context_data.get("lastUpdated", ""),
                formatted_text=data.get("formatted")
            )
            
    except httpx.TimeoutException:
        logger.warning("News fetch timed out")
        return None
    except Exception as e:
        logger.error(f"Error fetching trading news: {e}")
        return None

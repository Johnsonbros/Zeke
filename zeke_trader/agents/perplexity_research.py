"""
PerplexityResearchAgent - Deep research for high-impact trading signals.

Purpose: Query Perplexity AI for real-time market intelligence on high-value signals
before committing to a trade. Only triggered for signals exceeding the score threshold.
"""
import logging
import httpx
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel

from .schemas import ScoredSignal
from ..config import TradingConfig

logger = logging.getLogger("zeke_trader.agents.perplexity_research")

PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions"


class ResearchInsight(BaseModel):
    """Research insight from Perplexity for a trading signal."""
    symbol: str
    query: str
    summary: str
    sentiment: str
    key_factors: List[str]
    risk_factors: List[str]
    citations: List[str]
    confidence_adjustment: float
    timestamp: datetime


class PerplexityResearchAgent:
    """
    Queries Perplexity AI for deep research on high-impact trading signals.
    
    Only triggers for signals exceeding the configured score threshold,
    keeping API costs under control while adding insight where it matters most.
    """
    
    def __init__(self, config: TradingConfig):
        self.config = config
        self.api_key = config.perplexity_api_key
        self.enabled = config.perplexity_enabled and bool(self.api_key)
        self.score_threshold = config.perplexity_score_threshold
        self._cache: dict[str, ResearchInsight] = {}
        
        if self.enabled:
            logger.info(f"PerplexityResearchAgent enabled (threshold: {self.score_threshold})")
        else:
            logger.info("PerplexityResearchAgent disabled (no API key or disabled in config)")
    
    def get_high_impact_signals(
        self,
        scored_signals: List[ScoredSignal],
    ) -> List[ScoredSignal]:
        """Filter signals that exceed the score threshold for deep research."""
        if not self.enabled:
            return []
        
        high_impact = [
            s for s in scored_signals
            if s.total_score >= self.score_threshold
        ]
        
        if high_impact:
            logger.info(f"Found {len(high_impact)} high-impact signals for research (score >= {self.score_threshold})")
        
        return high_impact
    
    async def research_signal(
        self,
        signal: ScoredSignal,
    ) -> Optional[ResearchInsight]:
        """
        Query Perplexity for deep research on a specific signal.
        
        Args:
            signal: High-impact signal requiring research
            
        Returns:
            ResearchInsight with sentiment, factors, and confidence adjustment
        """
        if not self.enabled:
            return None
        
        symbol = signal.signal.symbol
        cache_key = f"{symbol}_{datetime.utcnow().strftime('%Y%m%d')}"
        
        if cache_key in self._cache:
            logger.info(f"Using cached research for {symbol}")
            return self._cache[cache_key]
        
        try:
            insight = await self._query_perplexity(signal)
            if insight:
                self._cache[cache_key] = insight
            return insight
        except Exception as e:
            logger.error(f"Research failed for {symbol}: {e}")
            return None
    
    async def research_signals(
        self,
        scored_signals: List[ScoredSignal],
    ) -> dict[str, ResearchInsight]:
        """
        Research all high-impact signals.
        
        Returns:
            Dictionary mapping symbol to research insight
        """
        high_impact = self.get_high_impact_signals(scored_signals)
        results: dict[str, ResearchInsight] = {}
        
        for signal in high_impact:
            insight = await self.research_signal(signal)
            if insight:
                results[signal.signal.symbol] = insight
        
        return results
    
    async def _query_perplexity(
        self,
        signal: ScoredSignal,
    ) -> Optional[ResearchInsight]:
        """Make the actual Perplexity API call."""
        symbol = signal.signal.symbol
        direction = "bullish" if signal.signal.direction.value == "long" else "bearish"
        system_type = "20-day" if signal.signal.system.value == 20 else "55-day"
        
        query = (
            f"What are the key factors affecting {symbol} stock price today? "
            f"Include recent earnings, news, analyst ratings, sector trends, and any risks. "
            f"Focus on information relevant for a {direction} position based on a {system_type} breakout signal."
        )
        
        payload = {
            "model": "llama-3.1-sonar-small-128k-online",
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a financial research analyst. Provide concise, factual analysis "
                        "for trading decisions. Focus on: 1) Recent news/earnings, 2) Analyst sentiment, "
                        "3) Sector trends, 4) Key risks. Be objective and cite sources."
                    )
                },
                {
                    "role": "user",
                    "content": query
                }
            ],
            "temperature": 0.2,
            "max_tokens": 500,
            "search_recency_filter": "day",
            "return_related_questions": False,
        }
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                PERPLEXITY_API_URL,
                json=payload,
                headers=headers,
            )
            response.raise_for_status()
            data = response.json()
        
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        citations = data.get("citations", [])
        
        insight = self._parse_research_response(
            symbol=symbol,
            query=query,
            content=content,
            citations=citations,
        )
        
        logger.info(f"Research complete for {symbol}: sentiment={insight.sentiment}, adjustment={insight.confidence_adjustment}")
        return insight
    
    def _parse_research_response(
        self,
        symbol: str,
        query: str,
        content: str,
        citations: List[str],
    ) -> ResearchInsight:
        """Parse the Perplexity response into structured insight."""
        content_lower = content.lower()
        positive_keywords = ["bullish", "upgrade", "beat", "strong", "growth", "positive", "outperform"]
        negative_keywords = ["bearish", "downgrade", "miss", "weak", "decline", "negative", "underperform", "risk"]
        
        positive_count = sum(1 for kw in positive_keywords if kw in content_lower)
        negative_count = sum(1 for kw in negative_keywords if kw in content_lower)
        
        if positive_count > negative_count + 1:
            sentiment = "bullish"
            confidence_adjustment = 0.1
        elif negative_count > positive_count + 1:
            sentiment = "bearish"
            confidence_adjustment = -0.15
        else:
            sentiment = "neutral"
            confidence_adjustment = 0.0
        
        key_factors = []
        risk_factors = []
        
        sentences = content.split(". ")
        for sentence in sentences[:10]:
            sentence_lower = sentence.lower()
            if any(kw in sentence_lower for kw in ["risk", "concern", "warning", "decline", "miss"]):
                if len(sentence) < 200:
                    risk_factors.append(sentence.strip())
            elif any(kw in sentence_lower for kw in ["growth", "beat", "upgrade", "strong", "positive"]):
                if len(sentence) < 200:
                    key_factors.append(sentence.strip())
        
        return ResearchInsight(
            symbol=symbol,
            query=query,
            summary=content[:500] if len(content) > 500 else content,
            sentiment=sentiment,
            key_factors=key_factors[:3],
            risk_factors=risk_factors[:3],
            citations=citations[:5],
            confidence_adjustment=confidence_adjustment,
            timestamp=datetime.utcnow(),
        )
    
    def format_for_decision(
        self,
        insights: dict[str, ResearchInsight],
    ) -> str:
        """Format research insights for the DecisionAgent prompt."""
        if not insights:
            return ""
        
        sections = ["\n=== PERPLEXITY RESEARCH (High-Impact Signals) ==="]
        
        for symbol, insight in insights.items():
            section = f"""
[{symbol}] Sentiment: {insight.sentiment.upper()} (confidence adjustment: {insight.confidence_adjustment:+.2f})
Summary: {insight.summary[:300]}...
Key Factors: {', '.join(insight.key_factors) if insight.key_factors else 'None identified'}
Risk Factors: {', '.join(insight.risk_factors) if insight.risk_factors else 'None identified'}
Sources: {len(insight.citations)} citations
"""
            sections.append(section)
        
        sections.append("Use this research to inform your decision. Adjust confidence based on research sentiment.")
        return "\n".join(sections)

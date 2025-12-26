"""
Trading agent using OpenAI for decision making.
Conservative, low-frequency trend following approach.
"""
import json
from typing import Optional
from openai import OpenAI

from .schemas import Decision, TradeIntent, NoTrade, MarketSnapshot, parse_decision
from .config import TradingConfig


SYSTEM_PROMPT = """You are a conservative trading agent. Your job is to analyze market conditions and make trading decisions.

RULES:
1. Default to NO_TRADE. Only trade when you see clear signals.
2. Maximum 1 trade per decision cycle.
3. Prefer SPY or NVDA for stability.
4. Use simple trend/momentum heuristics:
   - Price above recent average = bullish
   - Positive recent returns = bullish
   - Avoid counter-trend trades
5. Never chase momentum or try to catch falling knives.
6. Keep position sizes small (the system will enforce limits).

You must respond with ONLY valid JSON matching one of these schemas:

NO_TRADE (preferred):
{
  "action": "NO_TRADE",
  "reason": "explanation",
  "confidence": 0.0 to 1.0
}

TRADE (only when confident):
{
  "action": "TRADE",
  "symbol": "NVDA",
  "side": "buy" or "sell",
  "notional_usd": dollar amount,
  "order_type": "market",
  "time_in_force": "day",
  "confidence": 0.0 to 1.0,
  "reason": "short explanation"
}

Respond with JSON only. No markdown, no explanation outside JSON."""


class TradingAgent:
    """Agent that makes trading decisions based on market data."""
    
    def __init__(self, cfg: TradingConfig):
        self.cfg = cfg
        self.client = OpenAI(api_key=cfg.openai_api_key)
        self.model = "gpt-4o-mini"
    
    def decide(self, snapshot: MarketSnapshot) -> Decision:
        """
        Analyze market snapshot and return a trading decision.
        Always returns a valid Decision, never raises.
        """
        try:
            user_message = self._build_prompt(snapshot)
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_message}
                ],
                temperature=0.1,
                max_tokens=500,
                response_format={"type": "json_object"}
            )
            
            content = response.choices[0].message.content
            if not content:
                return NoTrade(
                    action="NO_TRADE",
                    reason="Empty response from model",
                    confidence=0.0
                )
            
            raw = json.loads(content)
            return parse_decision(raw)
            
        except json.JSONDecodeError as e:
            return NoTrade(
                action="NO_TRADE",
                reason=f"JSON parse error: {str(e)}",
                confidence=0.0
            )
        except Exception as e:
            return NoTrade(
                action="NO_TRADE",
                reason=f"Agent error: {str(e)}",
                confidence=0.0
            )
    
    def _build_prompt(self, snapshot: MarketSnapshot) -> str:
        """Build the user prompt with market context."""
        lines = [
            f"Timestamp: {snapshot.timestamp}",
            f"Trading Mode: {self.cfg.trading_mode.value}",
            "",
            "ACCOUNT:",
            f"  Equity: ${snapshot.account_equity or 0:,.2f}",
            f"  Cash: ${snapshot.account_cash or 0:,.2f}",
            f"  Buying Power: ${snapshot.account_buying_power or 0:,.2f}",
            f"  Day P&L: ${snapshot.day_pnl or 0:,.2f}",
            "",
            f"ALLOWED SYMBOLS: {', '.join(self.cfg.allowed_symbols)}",
            f"MAX TRADE SIZE: ${self.cfg.max_dollars_per_trade}",
            "",
            "CURRENT POSITIONS:"
        ]
        
        if snapshot.positions:
            for pos in snapshot.positions:
                symbol = pos.get("symbol", "?")
                qty = pos.get("qty", 0)
                avg_price = pos.get("avg_entry_price", 0)
                current = pos.get("current_price", 0)
                pnl = pos.get("unrealized_pl", 0)
                lines.append(f"  {symbol}: {qty} shares @ ${avg_price} (current: ${current}, P&L: ${pnl})")
        else:
            lines.append("  No open positions")
        
        lines.extend([
            "",
            "MARKET PRICES:"
        ])
        
        if snapshot.prices:
            for symbol, price in snapshot.prices.items():
                lines.append(f"  {symbol}: ${price:,.2f}")
        else:
            lines.append("  No price data available")
        
        lines.extend([
            "",
            "Based on this information, should we trade? Remember: NO_TRADE is the safe default.",
            "Respond with JSON only."
        ])
        
        return "\n".join(lines)

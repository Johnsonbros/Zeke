"""
DecisionAgent - LLM-based trade selection with Turtle scoring integration.

Purpose: Choose at most ONE trade from the provided deterministic signals, or NO_TRADE
Hard constraints:
- Must pick ONLY from provided signals (no inventing symbols/sides)
- Max 1 trade per loop
- Default NO_TRADE
- S2 breakouts preferred over S1 (via scoring)
- Must use notional_usd sizing (<= MAX_DOLLARS_PER_TRADE)
- Must provide structured thesis
- Exit signals always take priority over entries
"""
import logging
import json
from typing import List, Optional
from openai import OpenAI

from .schemas import (
    Signal,
    ScoredSignal,
    TradeIntent,
    NoTrade,
    Decision,
    PortfolioState,
    SignalDirection,
    Thesis,
    MarketRegime,
)
from ..config import TradingConfig
from ..strategy.scoring import TurtleScorer, get_best_entry

logger = logging.getLogger("zeke_trader.agents.decision")

DECISION_SYSTEM_PROMPT = """You are a disciplined Turtle trading decision agent. Your job is to select AT MOST ONE trade from the provided SCORED signals, or decide NO_TRADE.

HARD RULES:
1. You can ONLY choose from the scored signals provided. Never invent trades.
2. Maximum 1 trade per decision.
3. Default to NO_TRADE if uncertain or scores are below 3.0.
4. S2 (55-day) breakouts are preferred over S1 (20-day) - already reflected in scoring.
5. Higher-scored signals should generally be preferred unless portfolio reasons dictate otherwise.
6. Never exceed the max_dollars_per_trade limit.
7. Exit signals (stop losses, exit breakouts) are NOT shown here - they are handled separately.
8. Consider portfolio exposure - don't add correlated positions.

RESPOND WITH VALID JSON ONLY. No explanation text outside JSON.

For a trade, include a structured thesis:
{
  "action": "trade",
  "symbol": "SPY",
  "side": "buy",
  "notional_usd": 25.0,
  "signal_index": 0,
  "confidence": 0.7,
  "thesis": {
    "summary": "SPY showing strong 20-day breakout with expanding momentum",
    "system": "S1",
    "breakout_days": 20,
    "atr_n": 2.15,
    "stop_n": 2,
    "signal_score": 0.72,
    "portfolio_fit": "Adds broad market exposure, diversifies single-stock risk",
    "regime": "trend"
  }
}

For no trade:
{
  "action": "no_trade",
  "reason": "No compelling signals - all breakouts are weak",
  "signals_considered": 3
}"""


class DecisionAgent:
    """LLM-based decision maker that picks one trade from scored signals."""
    
    def __init__(self, config: TradingConfig):
        self.config = config
        self.client = OpenAI(api_key=config.openai_api_key)
        self.scorer = TurtleScorer()
        self.min_score_threshold = 3.0
    
    def make_decision(
        self,
        signals: List[Signal],
        portfolio: PortfolioState,
        scored_signals: Optional[List[ScoredSignal]] = None,
    ) -> Decision:
        """
        Decide on at most one trade from the provided signals.
        
        Args:
            signals: Deterministic signals from SignalAgent
            portfolio: Current portfolio state
            scored_signals: Pre-scored signals (if None, will score internally)
        
        Returns:
            TradeIntent or NoTrade decision
        """
        if not signals:
            return NoTrade(
                action="no_trade",
                reason="No signals generated",
                signals_considered=0,
            )
        
        exit_signals = [s for s in signals if s.direction in [
            SignalDirection.EXIT_LONG, 
            SignalDirection.EXIT_SHORT
        ]]
        
        if exit_signals:
            logger.info(f"Processing {len(exit_signals)} exit signals first")
            return self._process_exit_signal(exit_signals[0], signals)
        
        entry_signals = [s for s in signals if s.direction in [
            SignalDirection.LONG,
            SignalDirection.SHORT
        ]]
        
        if not entry_signals:
            return NoTrade(
                action="no_trade",
                reason="No entry signals",
                signals_considered=len(signals),
            )
        
        if scored_signals is None:
            scored_signals = self.scorer.score_signals(
                entry_signals,
                portfolio=portfolio,
            )
        
        scored_signals = [s for s in scored_signals if s.total_score >= self.min_score_threshold]
        
        if not scored_signals:
            return NoTrade(
                action="no_trade",
                reason=f"All signals scored below minimum threshold ({self.min_score_threshold})",
                signals_considered=len(signals),
            )
        
        prompt = self._build_scored_prompt(scored_signals, portfolio)
        
        try:
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": DECISION_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=500,
            )
            
            raw_content = response.choices[0].message.content
            if raw_content is None:
                return NoTrade(
                    action="no_trade",
                    reason="Empty LLM response",
                    signals_considered=len(scored_signals),
                )
            content = raw_content.strip()
            decision = self._parse_scored_response(content, scored_signals)
            logger.info(f"Decision: {decision}")
            return decision
            
        except Exception as e:
            logger.error(f"Error making decision: {e}")
            return NoTrade(
                action="no_trade",
                reason=f"Decision error: {str(e)}",
                signals_considered=len(signals),
            )
    
    def _process_exit_signal(
        self,
        exit_signal: Signal,
        all_signals: List[Signal],
    ) -> TradeIntent:
        """Process an exit signal into a sell trade."""
        side = "sell" if exit_signal.direction == SignalDirection.EXIT_LONG else "buy"
        
        system_str = "S1" if exit_signal.system.value == 20 else "S2"
        thesis = Thesis(
            summary=exit_signal.reason,
            system=system_str,
            breakout_days=exit_signal.system.value,
            atr_n=exit_signal.atr_n,
            stop_n=2.0,
            signal_score=exit_signal.score_hint,
            portfolio_fit="Exit signal - reducing exposure",
            regime=MarketRegime.NEUTRAL,
        )
        
        return TradeIntent(
            action="trade",
            symbol=exit_signal.symbol,
            side=side,
            notional_usd=self.config.max_dollars_per_trade,
            signal=exit_signal,
            stop_price=exit_signal.stop_price,
            exit_trigger=exit_signal.exit_ref,
            reason=exit_signal.reason,
            thesis=thesis,
            confidence=0.95,
        )
    
    def _build_prompt(
        self,
        signals: List[Signal],
        portfolio: PortfolioState,
    ) -> str:
        """Build the prompt for the LLM."""
        signals_text = []
        for i, sig in enumerate(signals):
            signals_text.append(
                f"[{i}] {sig.symbol} {sig.direction.value} (System {sig.system.value})\n"
                f"    Price: ${sig.current_price:.2f}, Entry ref: ${sig.entry_ref:.2f}\n"
                f"    ATR(N): ${sig.atr_n:.2f}, Stop: ${sig.stop_price:.2f}\n"
                f"    Score: {sig.score_hint:.2f}\n"
                f"    Reason: {sig.reason}"
            )
        
        positions_text = "None" if not portfolio.positions else "\n".join([
            f"  - {p.symbol}: {p.qty} shares, P&L: ${p.unrealized_pl:.2f}"
            for p in portfolio.positions
        ])
        
        return f"""PORTFOLIO STATE:
- Equity: ${portfolio.equity:.2f}
- Cash: ${portfolio.cash:.2f}
- Open positions: {len(portfolio.positions)}
{positions_text}
- Trades today: {portfolio.trades_today}
- Day P&L: ${portfolio.pnl_day:.2f}

RISK LIMITS:
- Max per trade: ${self.config.max_dollars_per_trade}
- Max positions: {self.config.max_open_positions}
- Max trades/day: {self.config.max_trades_per_day}
- Max daily loss: ${self.config.max_daily_loss}

SIGNALS ({len(signals)} available):
{chr(10).join(signals_text)}

Choose ONE trade or NO_TRADE. Respond with JSON only."""
    
    def _parse_response(
        self,
        content: str,
        signals: List[Signal],
    ) -> Decision:
        """Parse LLM response into a Decision."""
        try:
            content = content.strip()
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            
            data = json.loads(content)
            
            if data.get("action") == "no_trade":
                return NoTrade(
                    action="no_trade",
                    reason=data.get("reason", "LLM decided no trade"),
                    signals_considered=data.get("signals_considered", len(signals)),
                )
            
            if data.get("action") == "trade":
                signal_index = data.get("signal_index", 0)
                if signal_index >= len(signals):
                    signal_index = 0
                
                signal = signals[signal_index]
                notional = min(
                    float(data.get("notional_usd", self.config.max_dollars_per_trade)),
                    self.config.max_dollars_per_trade
                )
                
                thesis = None
                thesis_data = data.get("thesis")
                if thesis_data:
                    regime_str = thesis_data.get("regime", "neutral")
                    try:
                        regime = MarketRegime(regime_str)
                    except ValueError:
                        regime = MarketRegime.NEUTRAL
                    
                    thesis = Thesis(
                        summary=thesis_data.get("summary", signal.reason),
                        system=thesis_data.get("system", "S1"),
                        breakout_days=thesis_data.get("breakout_days", signal.system.value),
                        atr_n=thesis_data.get("atr_n", signal.atr_n),
                        stop_n=thesis_data.get("stop_n", 2.0),
                        signal_score=thesis_data.get("signal_score", signal.score_hint),
                        portfolio_fit=thesis_data.get("portfolio_fit", "Fits current portfolio"),
                        regime=regime,
                    )
                else:
                    system_str = "S1" if signal.system.value == 20 else "S2"
                    thesis = Thesis(
                        summary=data.get("reason", signal.reason),
                        system=system_str,
                        breakout_days=signal.system.value,
                        atr_n=signal.atr_n,
                        stop_n=2.0,
                        signal_score=signal.score_hint,
                        portfolio_fit="Fits current portfolio",
                        regime=MarketRegime.NEUTRAL,
                    )
                
                return TradeIntent(
                    action="trade",
                    symbol=signal.symbol,
                    side=data.get("side", "buy"),
                    notional_usd=notional,
                    signal=signal,
                    stop_price=signal.stop_price,
                    exit_trigger=signal.exit_ref,
                    reason=thesis.summary,
                    thesis=thesis,
                    confidence=float(data.get("confidence", 0.5)),
                )
            
            return NoTrade(
                action="no_trade",
                reason="Invalid response format",
                signals_considered=len(signals),
            )
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response: {e}\nContent: {content}")
            return NoTrade(
                action="no_trade",
                reason=f"Parse error: {str(e)}",
                signals_considered=len(signals),
            )
    
    def _build_scored_prompt(
        self,
        scored_signals: List[ScoredSignal],
        portfolio: PortfolioState,
    ) -> str:
        """Build prompt with scored signals for LLM."""
        signals_text = []
        for i, ss in enumerate(scored_signals):
            sig = ss.signal
            system_str = "S1" if sig.system.value == 20 else "S2"
            signals_text.append(
                f"[{i}] {sig.symbol} {sig.direction.value} ({system_str})\n"
                f"    TOTAL SCORE: {ss.total_score:.2f}\n"
                f"    - Breakout strength: {ss.breakout_strength:.2f} (weight 3.0)\n"
                f"    - System bonus: {ss.system_bonus:.1f} (weight 1.0)\n"
                f"    - Momentum/N: {ss.momentum_per_n:.2f} (weight 1.0)\n"
                f"    - Correlation penalty: {ss.correlation_penalty:.2f} (weight -1.0)\n"
                f"    Price: ${sig.current_price:.2f}, Entry ref: ${sig.entry_ref:.2f}\n"
                f"    ATR(N): ${sig.atr_n:.2f}, Stop: ${sig.stop_price:.2f}\n"
                f"    Reason: {sig.reason}"
            )
        
        positions_text = "None" if not portfolio.positions else "\n".join([
            f"  - {p.symbol}: {p.qty} shares, P&L: ${p.unrealized_pl:.2f}"
            for p in portfolio.positions
        ])
        
        return f"""PORTFOLIO STATE:
- Equity: ${portfolio.equity:.2f}
- Cash: ${portfolio.cash:.2f}
- Open positions: {len(portfolio.positions)}
{positions_text}
- Trades today: {portfolio.trades_today}
- Day P&L: ${portfolio.pnl_day:.2f}

RISK LIMITS:
- Max per trade: ${self.config.max_dollars_per_trade}
- Max positions: {self.config.max_open_positions}
- Max trades/day: {self.config.max_trades_per_day}
- Max daily loss: ${self.config.max_daily_loss}

SCORED SIGNALS ({len(scored_signals)} above threshold, ranked by score):
{chr(10).join(signals_text)}

Choose ONE trade (prefer higher scores) or NO_TRADE. Respond with JSON only."""

    def _parse_scored_response(
        self,
        content: str,
        scored_signals: List[ScoredSignal],
    ) -> Decision:
        """Parse LLM response into a Decision using scored signals."""
        try:
            content = content.strip()
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            
            data = json.loads(content)
            
            if data.get("action") == "no_trade":
                return NoTrade(
                    action="no_trade",
                    reason=data.get("reason", "LLM decided no trade"),
                    signals_considered=data.get("signals_considered", len(scored_signals)),
                )
            
            if data.get("action") == "trade":
                signal_index = data.get("signal_index", 0)
                if signal_index >= len(scored_signals):
                    signal_index = 0
                
                scored = scored_signals[signal_index]
                signal = scored.signal
                notional = min(
                    float(data.get("notional_usd", self.config.max_dollars_per_trade)),
                    self.config.max_dollars_per_trade
                )
                
                thesis = None
                thesis_data = data.get("thesis")
                system_str = "S1" if signal.system.value == 20 else "S2"
                
                if thesis_data:
                    regime_str = thesis_data.get("regime", "neutral")
                    try:
                        regime = MarketRegime(regime_str)
                    except ValueError:
                        regime = MarketRegime.NEUTRAL
                    
                    thesis = Thesis(
                        summary=thesis_data.get("summary", signal.reason),
                        system=thesis_data.get("system", system_str),
                        breakout_days=thesis_data.get("breakout_days", signal.system.value),
                        atr_n=thesis_data.get("atr_n", signal.atr_n),
                        stop_n=thesis_data.get("stop_n", 2.0),
                        signal_score=scored.total_score,
                        portfolio_fit=thesis_data.get("portfolio_fit", "Fits current portfolio"),
                        regime=regime,
                    )
                else:
                    thesis = Thesis(
                        summary=data.get("reason", signal.reason),
                        system=system_str,
                        breakout_days=signal.system.value,
                        atr_n=signal.atr_n,
                        stop_n=2.0,
                        signal_score=scored.total_score,
                        portfolio_fit="Fits current portfolio",
                        regime=MarketRegime.NEUTRAL,
                    )
                
                return TradeIntent(
                    action="trade",
                    symbol=signal.symbol,
                    side=data.get("side", "buy"),
                    notional_usd=notional,
                    signal=signal,
                    stop_price=signal.stop_price,
                    exit_trigger=signal.exit_ref,
                    reason=thesis.summary,
                    thesis=thesis,
                    confidence=float(data.get("confidence", 0.5)),
                )
            
            return NoTrade(
                action="no_trade",
                reason="Invalid response format",
                signals_considered=len(scored_signals),
            )
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response: {e}\nContent: {content}")
            return NoTrade(
                action="no_trade",
                reason=f"Parse error: {str(e)}",
                signals_considered=len(scored_signals),
            )

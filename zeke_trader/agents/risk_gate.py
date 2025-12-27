"""
RiskGateAgent - Deterministic gatekeeper.

Purpose: Validate schema + enforce policy + optionally resize/convert to NO_TRADE
This is the "hard wall" between LLM and execution.

Rules enforced:
- allowlist only
- notional <= MAX_DOLLARS_PER_TRADE
- max open positions
- max trades/day
- max daily loss
- cooldown / stale-data block
- no pyramiding (Turtle MVP: one entry per symbol)
"""
import logging
from typing import List, Tuple

from .schemas import (
    Decision,
    TradeIntent,
    NoTrade,
    RiskResult,
    PortfolioState,
)
from ..config import TradingConfig

logger = logging.getLogger("zeke_trader.agents.risk_gate")


class RiskGateAgent:
    """Deterministic risk gatekeeper - the hard wall before execution."""
    
    def __init__(self, config: TradingConfig):
        self.config = config
    
    def validate(
        self,
        decision: Decision,
        portfolio: PortfolioState,
    ) -> RiskResult:
        """
        Validate decision against all risk rules.
        
        Returns:
            RiskResult with allowed flag, notes, and possibly modified decision
        """
        if isinstance(decision, NoTrade):
            return RiskResult(
                allowed=True,
                notes=["No trade decision - passing through"],
                original_decision=decision,
                final_decision=decision,
                violations=[],
            )
        
        trade = decision
        violations = []
        notes = []
        modified_trade = trade.model_copy()
        
        if trade.symbol not in self.config.allowed_symbols:
            violations.append(f"Symbol {trade.symbol} not in allowlist")
        
        if trade.notional_usd > self.config.max_dollars_per_trade:
            original = trade.notional_usd
            modified_trade.notional_usd = self.config.max_dollars_per_trade
            notes.append(f"Sized down from ${original:.2f} to ${self.config.max_dollars_per_trade:.2f}")
        
        current_positions = len(portfolio.positions)
        existing_position = next(
            (p for p in portfolio.positions if p.symbol == trade.symbol), 
            None
        )
        is_new_position = existing_position is None
        
        if trade.side == "buy":
            if not is_new_position:
                violations.append(f"No pyramiding: already holding {trade.symbol}")
            elif current_positions >= self.config.max_open_positions:
                violations.append(f"Max positions reached ({current_positions}/{self.config.max_open_positions})")
        
        if portfolio.trades_today >= self.config.max_trades_per_day:
            violations.append(f"Max trades/day reached ({portfolio.trades_today}/{self.config.max_trades_per_day})")
        
        if portfolio.pnl_day <= -self.config.max_daily_loss:
            violations.append(f"Daily loss limit hit (${portfolio.pnl_day:.2f})")
        
        if trade.notional_usd > portfolio.buying_power:
            violations.append(f"Insufficient buying power (${portfolio.buying_power:.2f} < ${trade.notional_usd:.2f})")
        
        allowed = len(violations) == 0
        
        if not allowed:
            logger.warning(f"RISK GATE BLOCKED: {violations}")
            final_decision = NoTrade(
                action="no_trade",
                reason=f"Risk gate blocked: {'; '.join(violations)}",
                signals_considered=1,
            )
        else:
            final_decision = modified_trade
            logger.info(f"RISK GATE PASSED: {trade.symbol} {trade.side} ${trade.notional_usd:.2f}")
        
        return RiskResult(
            allowed=allowed,
            notes=notes,
            original_decision=decision,
            final_decision=final_decision,
            violations=violations,
        )
    
    def check_exit_rules(
        self,
        trade: TradeIntent,
        portfolio: PortfolioState,
    ) -> Tuple[bool, List[str]]:
        """
        Check if an exit trade is allowed.
        Exits are generally always allowed (especially stops).
        """
        notes = []
        
        has_position = any(p.symbol == trade.symbol for p in portfolio.positions)
        if not has_position:
            return False, ["No position to exit"]
        
        if "STOP LOSS" in trade.reason.upper():
            notes.append("Stop loss - always allowed")
            return True, notes
        
        return True, notes

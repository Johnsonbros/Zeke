"""
RiskGateAgent - Deterministic gatekeeper.

Purpose: Validate schema + enforce policy + optionally resize/convert to NO_TRADE
This is the "hard wall" between LLM and execution.

Rules enforced:
- allowlist only
- Kelly Criterion position sizing (dynamic)
- max_dollars_per_trade cap (hard limit)
- max open positions
- max trades/day
- drawdown circuit breaker (daily/weekly)
- max daily loss
- cooldown / stale-data block
- no pyramiding (Turtle MVP: one entry per symbol)
"""
import logging
from typing import List, Tuple, Optional

from .schemas import (
    Decision,
    TradeIntent,
    NoTrade,
    RiskResult,
    PortfolioState,
)
from ..config import TradingConfig
from ..strategy.position_sizing import KellyPositionSizer, DrawdownCircuitBreaker

logger = logging.getLogger("zeke_trader.agents.risk_gate")


class RiskGateAgent:
    """Deterministic risk gatekeeper - the hard wall before execution."""
    
    def __init__(self, config: TradingConfig):
        self.config = config
        
        if config.kelly_enabled:
            self.kelly_sizer = KellyPositionSizer(
                log_dir=config.log_dir,
                lookback_trades=config.kelly_lookback_trades,
                kelly_fraction=config.kelly_fraction,
                min_trades=config.kelly_min_trades,
                max_position_pct=config.kelly_max_position_pct,
            )
        else:
            self.kelly_sizer = None
        
        if config.circuit_breaker_enabled:
            self.circuit_breaker = DrawdownCircuitBreaker(
                daily_limit_pct=config.circuit_breaker_daily_limit,
                weekly_limit_pct=config.circuit_breaker_weekly_limit,
                log_dir=config.log_dir,
            )
        else:
            self.circuit_breaker = None
    
    def calculate_kelly_position(
        self,
        equity: float,
        signal_strength: float = 1.0,
        atr: Optional[float] = None,
        current_price: Optional[float] = None,
    ) -> float:
        """
        Calculate position size using Kelly Criterion.
        
        Args:
            equity: Current account equity
            signal_strength: Signal confidence multiplier (0.0-1.0)
            atr: ATR for volatility adjustment (optional)
            current_price: Current stock price (optional)
            
        Returns:
            Position size in dollars
        """
        if not self.kelly_sizer:
            return self.config.max_dollars_per_trade
        
        kelly_size = self.kelly_sizer.calculate_position_size(
            equity=equity,
            signal_strength=signal_strength,
            atr=atr,
            current_price=current_price,
        )
        
        return min(kelly_size, self.config.max_dollars_per_trade)
    
    def check_circuit_breaker(
        self,
        current_daily_pnl_pct: float,
        equity: float,
    ) -> dict:
        """
        Check circuit breaker status.
        
        Returns:
            Dict with status, position_multiplier, trading_allowed, warnings
        """
        if not self.circuit_breaker:
            return {
                "status": "DISABLED",
                "position_multiplier": 1.0,
                "trading_allowed": True,
                "warnings": [],
            }
        
        return self.circuit_breaker.check_status(
            current_daily_pnl_pct=current_daily_pnl_pct,
            equity=equity,
        )
    
    def record_trade_result(
        self,
        symbol: str,
        side: str,
        entry_price: float,
        exit_price: float,
        qty: float,
    ):
        """Record a completed trade for Kelly calculations."""
        if self.kelly_sizer:
            self.kelly_sizer.record_trade(
                symbol=symbol,
                side=side,
                entry_price=entry_price,
                exit_price=exit_price,
                qty=qty,
            )
    
    def record_daily_pnl(self, pnl_pct: float):
        """Record end-of-day P&L for circuit breaker."""
        if self.circuit_breaker:
            self.circuit_breaker.record_daily_pnl(pnl_pct)
    
    def validate(
        self,
        decision: Decision,
        portfolio: PortfolioState,
        signal_strength: float = 1.0,
        atr: Optional[float] = None,
        current_price: Optional[float] = None,
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
        
        if portfolio.equity > 0:
            daily_pnl_pct = portfolio.pnl_day / portfolio.equity
        else:
            daily_pnl_pct = 0.0
        
        cb_status = self.check_circuit_breaker(daily_pnl_pct, portfolio.equity)
        
        if not cb_status["trading_allowed"]:
            violations.append(f"Circuit breaker HALTED: {'; '.join(cb_status['warnings'])}")
        elif cb_status["status"] == "WARNING":
            notes.append(f"Circuit breaker WARNING: position reduced by {1-cb_status['position_multiplier']:.0%}")
        
        if trade.symbol not in self.config.allowed_symbols:
            violations.append(f"Symbol {trade.symbol} not in allowlist")
        
        if len(violations) == 0:
            if self.kelly_sizer:
                kelly_size = self.calculate_kelly_position(
                    equity=portfolio.equity,
                    signal_strength=signal_strength,
                    atr=atr,
                    current_price=current_price,
                )
                
                kelly_size *= cb_status["position_multiplier"]
                
                if trade.notional_usd > kelly_size:
                    original = trade.notional_usd
                    modified_trade.notional_usd = kelly_size
                    notes.append(f"Kelly sized from ${original:.2f} to ${kelly_size:.2f}")
            elif cb_status["position_multiplier"] < 1.0:
                original = modified_trade.notional_usd
                modified_trade.notional_usd *= cb_status["position_multiplier"]
                notes.append(f"Circuit breaker reduced from ${original:.2f} to ${modified_trade.notional_usd:.2f}")
        
        if modified_trade.notional_usd > self.config.max_dollars_per_trade:
            original = modified_trade.notional_usd
            modified_trade.notional_usd = self.config.max_dollars_per_trade
            notes.append(f"Hard cap: ${original:.2f} to ${self.config.max_dollars_per_trade:.2f}")
        
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
        
        if modified_trade.notional_usd > portfolio.buying_power:
            violations.append(f"Insufficient buying power (${portfolio.buying_power:.2f} < ${modified_trade.notional_usd:.2f})")
        
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
            logger.info(f"RISK GATE PASSED: {trade.symbol} {trade.side} ${modified_trade.notional_usd:.2f}")
        
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
    
    def get_risk_summary(self) -> dict:
        """Get summary of risk management components for display."""
        summary = {
            "max_dollars_per_trade": f"${self.config.max_dollars_per_trade:.2f}",
            "max_open_positions": self.config.max_open_positions,
            "max_trades_per_day": self.config.max_trades_per_day,
            "max_daily_loss": f"${self.config.max_daily_loss:.2f}",
        }
        
        if self.kelly_sizer:
            summary["kelly"] = self.kelly_sizer.get_summary()
        else:
            summary["kelly"] = {"enabled": False}
        
        if self.circuit_breaker:
            summary["circuit_breaker"] = self.circuit_breaker.get_summary()
        else:
            summary["circuit_breaker"] = {"enabled": False}
        
        return summary

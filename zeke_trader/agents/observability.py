"""
ObservabilityAgent - Logging and audit trail.

Purpose: Log everything every loop; keep audit trail complete.
"""
import logging
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from .schemas import (
    LoopResult,
    MarketSnapshot,
    Decision,
    RiskResult,
    OrderResult,
    PortfolioState,
    Signal,
    ExitReason,
)
from ..config import TradingConfig

logger = logging.getLogger("zeke_trader.agents.observability")


class ObservabilityAgent:
    """Logs all trading activity for audit trail."""
    
    def __init__(self, config: TradingConfig):
        self.config = config
        self.log_dir = Path(config.log_dir)
        self._ensure_log_dir()
    
    def _ensure_log_dir(self):
        """Ensure log directories exist."""
        self.log_dir.mkdir(parents=True, exist_ok=True)
        (self.log_dir / "loops").mkdir(exist_ok=True)
        (self.log_dir / "trades").mkdir(exist_ok=True)
        (self.log_dir / "equity").mkdir(exist_ok=True)
    
    def log_loop(self, result: LoopResult):
        """Log complete loop result."""
        timestamp = result.timestamp.strftime("%Y%m%d_%H%M%S")
        filename = self.log_dir / "loops" / f"loop_{timestamp}_{result.loop_id[:8]}.json"
        
        try:
            with open(filename, "w") as f:
                json.dump(result.model_dump(mode="json"), f, indent=2, default=str)
            
            logger.info(f"Loop logged: {filename}")
            
            self._log_summary(result)
            
        except Exception as e:
            logger.error(f"Failed to log loop: {e}")
    
    def _log_summary(self, result: LoopResult):
        """Log a summary line for quick review."""
        decision_type = "TRADE" if hasattr(result.decision, 'symbol') else "NO_TRADE"
        
        if decision_type == "TRADE":
            trade = result.decision
            summary = f"{trade.symbol} {trade.side} ${trade.notional_usd:.2f}"
        else:
            summary = result.decision.reason[:50] if hasattr(result.decision, 'reason') else "No reason"
        
        risk_status = "ALLOWED" if result.risk_result.allowed else "BLOCKED"
        exec_status = result.order_result.status if result.order_result else "N/A"
        
        logger.info(
            f"LOOP SUMMARY | "
            f"Signals: {len(result.signals)} | "
            f"Decision: {decision_type} | "
            f"Summary: {summary} | "
            f"Risk: {risk_status} | "
            f"Execution: {exec_status} | "
            f"Duration: {result.duration_ms:.0f}ms"
        )
    
    def log_trade(
        self,
        symbol: str,
        side: str,
        notional: float,
        order_id: Optional[str],
        status: str,
        entry_criteria: Optional[dict] = None,
        thesis: Optional[dict] = None,
    ):
        """Log individual trade with entry thesis."""
        timestamp = datetime.utcnow()
        date_str = timestamp.strftime("%Y%m%d")
        
        trade_record = {
            "timestamp": timestamp.isoformat(),
            "symbol": symbol,
            "side": side,
            "notional": notional,
            "order_id": order_id,
            "status": status,
            "entry_criteria": entry_criteria,
            "thesis": thesis,
        }
        
        trades_file = self.log_dir / "trades" / f"trades_{date_str}.jsonl"
        
        try:
            with open(trades_file, "a") as f:
                f.write(json.dumps(trade_record, default=str) + "\n")
            
            logger.info(f"Trade logged: {symbol} {side} ${notional:.2f} -> {status}")
            
        except Exception as e:
            logger.error(f"Failed to log trade: {e}")
    
    def log_exit(
        self,
        symbol: str,
        side: str,
        exit_reason: ExitReason,
        order_id: Optional[str] = None,
        status: str = "filled",
    ):
        """Log position exit with structured exit reason."""
        timestamp = datetime.utcnow()
        date_str = timestamp.strftime("%Y%m%d")
        
        exit_record = {
            "timestamp": timestamp.isoformat(),
            "symbol": symbol,
            "side": side,
            "order_id": order_id,
            "status": status,
            "exit_reason": exit_reason.model_dump() if exit_reason else None,
        }
        
        trades_file = self.log_dir / "trades" / f"trades_{date_str}.jsonl"
        
        try:
            with open(trades_file, "a") as f:
                f.write(json.dumps(exit_record, default=str) + "\n")
            
            logger.info(
                f"Exit logged: {symbol} {side} | "
                f"Type: {exit_reason.type} | "
                f"P&L: ${exit_reason.pnl_usd:.2f}"
            )
            
        except Exception as e:
            logger.error(f"Failed to log exit: {e}")
    
    def log_equity(self, portfolio: PortfolioState):
        """Log equity snapshot for tracking."""
        timestamp = portfolio.timestamp
        date_str = timestamp.strftime("%Y%m%d")
        
        equity_record = {
            "timestamp": timestamp.isoformat(),
            "equity": portfolio.equity,
            "cash": portfolio.cash,
            "buying_power": portfolio.buying_power,
            "positions_count": len(portfolio.positions),
            "pnl_day": portfolio.pnl_day,
            "trades_today": portfolio.trades_today,
        }
        
        equity_file = self.log_dir / "equity" / f"equity_{date_str}.jsonl"
        
        try:
            with open(equity_file, "a") as f:
                f.write(json.dumps(equity_record, default=str) + "\n")
                
        except Exception as e:
            logger.error(f"Failed to log equity: {e}")
    
    def get_trades_today(self) -> list[dict]:
        """Get all trades from today for counting."""
        date_str = datetime.utcnow().strftime("%Y%m%d")
        trades_file = self.log_dir / "trades" / f"trades_{date_str}.jsonl"
        
        trades = []
        
        if trades_file.exists():
            try:
                with open(trades_file, "r") as f:
                    for line in f:
                        if line.strip():
                            trades.append(json.loads(line))
            except Exception as e:
                logger.error(f"Failed to read trades: {e}")
        
        return trades
    
    def get_recent_loops(self, limit: int = 10) -> list[dict]:
        """Get recent loop results for review."""
        loops_dir = self.log_dir / "loops"
        
        if not loops_dir.exists():
            return []
        
        files = sorted(loops_dir.glob("loop_*.json"), reverse=True)[:limit]
        
        results = []
        for f in files:
            try:
                with open(f, "r") as file:
                    results.append(json.load(file))
            except:
                continue
        
        return results

"""
Metrics and analytics for trading performance.
"""
from datetime import datetime, date
from typing import Dict, List, Optional
import csv
from pathlib import Path

from .config import TradingConfig


class TradingMetrics:
    """Calculate trading performance metrics from logs."""
    
    def __init__(self, cfg: TradingConfig):
        self.cfg = cfg
        self.log_dir = Path(cfg.log_dir)
    
    def get_summary(self) -> Dict:
        """Get overall trading summary."""
        equity_history = self._read_equity_log()
        trades = self._read_trades_log()
        decisions = self._read_decisions_log()
        
        today = date.today().isoformat()
        trades_today = [t for t in trades if t.get("ts", "").startswith(today)]
        decisions_today = [d for d in decisions if d.get("ts", "").startswith(today)]
        
        risk_blocks = len([d for d in decisions if d.get("risk_allowed") == "False"])
        
        summary = {
            "total_trades": len(trades),
            "trades_today": len(trades_today),
            "total_decisions": len(decisions),
            "decisions_today": len(decisions_today),
            "risk_blocks_total": risk_blocks,
            "current_equity": 0.0,
            "starting_equity": 0.0,
            "total_pnl": 0.0,
            "win_rate": 0.0,
        }
        
        if equity_history:
            summary["current_equity"] = float(equity_history[-1].get("equity", 0))
            summary["starting_equity"] = float(equity_history[0].get("equity", 0))
            summary["total_pnl"] = summary["current_equity"] - summary["starting_equity"]
        
        winning_trades = len([t for t in trades if self._is_winning_trade(t)])
        if trades:
            summary["win_rate"] = winning_trades / len(trades)
        
        return summary
    
    def _is_winning_trade(self, trade: Dict) -> bool:
        """Determine if a trade was profitable (simplified)."""
        return trade.get("status") == "filled"
    
    def _read_equity_log(self) -> List[Dict]:
        """Read equity log."""
        filepath = self.log_dir / "equity.csv"
        if not filepath.exists():
            return []
        try:
            with open(filepath, "r") as f:
                return list(csv.DictReader(f))
        except Exception:
            return []
    
    def _read_trades_log(self) -> List[Dict]:
        """Read trades log."""
        filepath = self.log_dir / "trades.csv"
        if not filepath.exists():
            return []
        try:
            with open(filepath, "r") as f:
                return list(csv.DictReader(f))
        except Exception:
            return []
    
    def _read_decisions_log(self) -> List[Dict]:
        """Read decisions log."""
        filepath = self.log_dir / "decisions.csv"
        if not filepath.exists():
            return []
        try:
            with open(filepath, "r") as f:
                return list(csv.DictReader(f))
        except Exception:
            return []

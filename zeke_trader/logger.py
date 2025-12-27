"""
CSV-based logging for trading decisions, trades, and equity snapshots.
"""
import os
import csv
from datetime import datetime
from typing import Optional
from pathlib import Path

from .schemas import Decision, TradeIntent, NoTrade, TradeResult, MarketSnapshot, RiskCheckResult
from .config import TradingConfig


class TradingLogger:
    """Handles all trading-related logging to CSV files."""
    
    DECISIONS_HEADERS = [
        "ts", "mode", "symbol", "action", "side", "notional_usd", 
        "confidence", "reason", "risk_allowed", "risk_notes", "error"
    ]
    
    TRADES_HEADERS = [
        "ts", "symbol", "side", "notional_usd", "status", 
        "order_id", "filled_avg_price", "filled_qty", "error"
    ]
    
    EQUITY_HEADERS = ["ts", "equity", "cash", "buying_power", "pnl_day", "positions_count"]
    
    def __init__(self, cfg: TradingConfig):
        self.cfg = cfg
        self.log_dir = Path(cfg.log_dir)
        self._ensure_log_dir()
        self._ensure_headers()
    
    def _ensure_log_dir(self):
        """Create log directory if it doesn't exist."""
        self.log_dir.mkdir(parents=True, exist_ok=True)
    
    def _ensure_headers(self):
        """Ensure CSV files have headers."""
        files = [
            ("decisions.csv", self.DECISIONS_HEADERS),
            ("trades.csv", self.TRADES_HEADERS),
            ("equity.csv", self.EQUITY_HEADERS),
        ]
        for filename, headers in files:
            filepath = self.log_dir / filename
            if not filepath.exists():
                with open(filepath, "w", newline="") as f:
                    writer = csv.writer(f)
                    writer.writerow(headers)
    
    def log_decision(
        self,
        decision: Decision,
        risk_allowed: bool,
        risk_notes: str,
        error: Optional[str] = None
    ):
        """Log a trading decision."""
        ts = datetime.utcnow().isoformat()
        
        if isinstance(decision, TradeIntent):
            row = [
                ts,
                self.cfg.trading_mode.value,
                decision.symbol,
                decision.action,
                decision.side,
                decision.notional_usd,
                decision.confidence,
                decision.reason,
                risk_allowed,
                risk_notes,
                error or ""
            ]
        else:
            row = [
                ts,
                self.cfg.trading_mode.value,
                "",
                decision.action,
                "",
                "",
                decision.confidence,
                decision.reason,
                risk_allowed,
                risk_notes,
                error or ""
            ]
        
        with open(self.log_dir / "decisions.csv", "a", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(row)
    
    def log_trade(
        self,
        symbol: str,
        side: str,
        notional_usd: float,
        result: TradeResult
    ):
        """Log a trade execution result."""
        ts = datetime.utcnow().isoformat()
        status = "filled" if result.success else "failed"
        
        row = [
            ts,
            symbol,
            side,
            notional_usd,
            status,
            result.order_id or "",
            result.filled_avg_price or "",
            result.filled_qty or "",
            result.error or ""
        ]
        
        with open(self.log_dir / "trades.csv", "a", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(row)
    
    def log_equity(self, snapshot: MarketSnapshot):
        """Log equity snapshot."""
        ts = datetime.utcnow().isoformat()
        
        row = [
            ts,
            snapshot.account_equity or 0,
            snapshot.account_cash or 0,
            snapshot.account_buying_power or 0,
            snapshot.day_pnl or 0,
            len(snapshot.positions)
        ]
        
        with open(self.log_dir / "equity.csv", "a", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(row)
    
    def get_recent_decisions(self, limit: int = 20) -> list[dict]:
        """Get recent decisions from log."""
        filepath = self.log_dir / "decisions.csv"
        if not filepath.exists():
            return []
        
        try:
            with open(filepath, "r") as f:
                reader = csv.DictReader(f)
                rows = list(reader)
                return rows[-limit:] if len(rows) > limit else rows
        except Exception:
            return []
    
    def get_recent_trades(self, limit: int = 20) -> list[dict]:
        """Get recent trades from log."""
        filepath = self.log_dir / "trades.csv"
        if not filepath.exists():
            return []
        
        try:
            with open(filepath, "r") as f:
                reader = csv.DictReader(f)
                rows = list(reader)
                return rows[-limit:] if len(rows) > limit else rows
        except Exception:
            return []
    
    def get_equity_history(self) -> list[dict]:
        """Get equity history from log."""
        filepath = self.log_dir / "equity.csv"
        if not filepath.exists():
            return []
        
        try:
            with open(filepath, "r") as f:
                reader = csv.DictReader(f)
                return list(reader)
        except Exception:
            return []

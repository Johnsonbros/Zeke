"""
Deterministic risk gate - must pass before any order placement.
"""
from datetime import datetime, date
from typing import Tuple
import csv
import os

from .schemas import Decision, TradeIntent, NoTrade, RiskCheckResult, MarketSnapshot
from .config import TradingConfig


def count_trades_today(log_dir: str) -> int:
    """Count trades executed today from trades.csv."""
    trades_file = os.path.join(log_dir, "trades.csv")
    if not os.path.exists(trades_file):
        return 0
    
    today = date.today().isoformat()
    count = 0
    try:
        with open(trades_file, "r") as f:
            reader = csv.DictReader(f)
            for row in reader:
                ts = row.get("ts", "")
                if ts.startswith(today) and row.get("status") == "filled":
                    count += 1
    except Exception:
        pass
    return count


def get_daily_pnl(log_dir: str) -> float:
    """Get latest daily P&L from equity.csv."""
    equity_file = os.path.join(log_dir, "equity.csv")
    if not os.path.exists(equity_file):
        return 0.0
    
    try:
        with open(equity_file, "r") as f:
            lines = f.readlines()
            if len(lines) < 2:
                return 0.0
            reader = csv.DictReader(lines[-2:])
            for row in reader:
                pnl = row.get("pnl_day", "0")
                return float(pnl) if pnl else 0.0
    except Exception:
        pass
    return 0.0


def risk_check(
    decision: Decision,
    snapshot: MarketSnapshot,
    cfg: TradingConfig
) -> Tuple[bool, str, Decision]:
    """
    Run deterministic risk checks on a decision.
    
    Returns:
        Tuple of (allowed, notes, possibly_modified_decision)
    """
    if isinstance(decision, NoTrade):
        return True, "NO_TRADE always allowed", decision
    
    if not isinstance(decision, TradeIntent):
        return False, "Invalid decision type", NoTrade(
            action="NO_TRADE",
            reason="Invalid decision type from agent",
            confidence=0.0
        )
    
    notes = []
    trade = decision
    
    if trade.symbol not in cfg.allowed_symbols:
        return False, f"BLOCKED: Symbol {trade.symbol} not in allowed list {cfg.allowed_symbols}", NoTrade(
            action="NO_TRADE",
            reason=f"Symbol {trade.symbol} not allowed",
            confidence=0.0
        )
    notes.append(f"Symbol {trade.symbol} is allowed")
    
    if trade.notional_usd > cfg.max_dollars_per_trade:
        return False, f"BLOCKED: Notional ${trade.notional_usd:.2f} exceeds max ${cfg.max_dollars_per_trade:.2f}", NoTrade(
            action="NO_TRADE",
            reason=f"Trade size exceeds limit",
            confidence=0.0
        )
    notes.append(f"Notional ${trade.notional_usd:.2f} within limit")
    
    current_positions = len(snapshot.positions)
    if current_positions >= cfg.max_open_positions and trade.side == "buy":
        return False, f"BLOCKED: Already have {current_positions} positions (max {cfg.max_open_positions})", NoTrade(
            action="NO_TRADE",
            reason=f"Too many open positions",
            confidence=0.0
        )
    notes.append(f"Position count OK ({current_positions}/{cfg.max_open_positions})")
    
    trades_today = count_trades_today(cfg.log_dir)
    if trades_today >= cfg.max_trades_per_day:
        return False, f"BLOCKED: Already made {trades_today} trades today (max {cfg.max_trades_per_day})", NoTrade(
            action="NO_TRADE",
            reason=f"Daily trade limit reached",
            confidence=0.0
        )
    notes.append(f"Trade count OK ({trades_today}/{cfg.max_trades_per_day})")
    
    daily_pnl = snapshot.day_pnl if snapshot.day_pnl is not None else get_daily_pnl(cfg.log_dir)
    if daily_pnl < -cfg.max_daily_loss:
        return False, f"BLOCKED: Daily loss ${abs(daily_pnl):.2f} exceeds max ${cfg.max_daily_loss:.2f}", NoTrade(
            action="NO_TRADE",
            reason=f"Daily loss limit reached",
            confidence=0.0
        )
    notes.append(f"Daily P&L OK (${daily_pnl:.2f})")
    
    return True, "ALLOWED: " + "; ".join(notes), trade

"""
Position Sizing Strategies for ZEKETrade.

Implements Kelly Criterion and other position sizing algorithms
for optimal capital allocation.
"""
import logging
import json
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from dataclasses import dataclass, field, asdict
import numpy as np

logger = logging.getLogger("zeke_trader.strategy.position_sizing")


@dataclass
class TradeResult:
    """Record of a completed trade for Kelly calculations."""
    symbol: str
    side: str
    entry_price: float
    exit_price: float
    return_pct: float
    pnl_usd: float
    timestamp: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> dict:
        d = asdict(self)
        d['timestamp'] = self.timestamp.isoformat()
        return d
    
    @classmethod
    def from_dict(cls, d: dict) -> 'TradeResult':
        d['timestamp'] = datetime.fromisoformat(d['timestamp'])
        return cls(**d)


@dataclass  
class KellyStats:
    """Current Kelly Criterion statistics."""
    win_rate: float
    avg_win_pct: float
    avg_loss_pct: float
    win_loss_ratio: float
    kelly_fraction: float
    half_kelly_fraction: float
    quarter_kelly_fraction: float
    sample_size: int
    is_valid: bool
    
    def to_dict(self) -> dict:
        return asdict(self)


class KellyPositionSizer:
    """
    Kelly Criterion position sizing with rolling trade history.
    
    Uses Half-Kelly by default for more conservative sizing that
    achieves ~75% of optimal growth with much lower volatility.
    """
    
    def __init__(
        self,
        log_dir: str = "zeke_trader/logs",
        lookback_trades: int = 40,
        kelly_fraction: float = 0.5,
        min_trades: int = 10,
        max_position_pct: float = 0.25,
    ):
        """
        Initialize Kelly position sizer.
        
        Args:
            log_dir: Directory for trade history persistence
            lookback_trades: Number of trades to use for Kelly calculation
            kelly_fraction: Fraction of full Kelly (0.5 = half Kelly)
            min_trades: Minimum trades before using Kelly (use conservative sizing)
            max_position_pct: Maximum position as percentage of equity
        """
        self.log_dir = Path(log_dir)
        self.lookback_trades = lookback_trades
        self.kelly_fraction = kelly_fraction
        self.min_trades = min_trades
        self.max_position_pct = max_position_pct
        
        self.trade_history: List[TradeResult] = []
        self._load_history()
        
        logger.info(
            f"KellyPositionSizer initialized: "
            f"fraction={kelly_fraction}, lookback={lookback_trades}, "
            f"min_trades={min_trades}, loaded={len(self.trade_history)} trades"
        )
    
    def _load_history(self):
        """Load trade history from disk."""
        history_file = self.log_dir / "kelly_trade_history.json"
        if history_file.exists():
            try:
                with open(history_file, "r") as f:
                    data = json.load(f)
                    self.trade_history = [
                        TradeResult.from_dict(t) for t in data
                    ]
                logger.info(f"Loaded {len(self.trade_history)} trades from history")
            except Exception as e:
                logger.error(f"Failed to load trade history: {e}")
                self.trade_history = []
    
    def _save_history(self):
        """Save trade history to disk."""
        self.log_dir.mkdir(parents=True, exist_ok=True)
        history_file = self.log_dir / "kelly_trade_history.json"
        try:
            recent = self.trade_history[-self.lookback_trades * 2:]
            with open(history_file, "w") as f:
                json.dump([t.to_dict() for t in recent], f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save trade history: {e}")
    
    def record_trade(
        self,
        symbol: str,
        side: str,
        entry_price: float,
        exit_price: float,
        qty: float,
    ):
        """
        Record a completed trade for Kelly calculations.
        
        Args:
            symbol: Stock symbol
            side: 'buy' or 'sell' (for the entry)
            entry_price: Entry price
            exit_price: Exit price  
            qty: Number of shares
        """
        if side == "buy":
            return_pct = (exit_price - entry_price) / entry_price
        else:
            return_pct = (entry_price - exit_price) / entry_price
        
        pnl_usd = qty * (exit_price - entry_price) if side == "buy" else qty * (entry_price - exit_price)
        
        trade = TradeResult(
            symbol=symbol,
            side=side,
            entry_price=entry_price,
            exit_price=exit_price,
            return_pct=return_pct,
            pnl_usd=pnl_usd,
        )
        
        self.trade_history.append(trade)
        self._save_history()
        
        logger.info(
            f"Recorded trade: {symbol} {side} "
            f"return={return_pct:.2%} pnl=${pnl_usd:.2f}"
        )
    
    def get_kelly_stats(self) -> KellyStats:
        """Calculate current Kelly statistics from trade history."""
        recent = self.trade_history[-self.lookback_trades:]
        
        if len(recent) < self.min_trades:
            return KellyStats(
                win_rate=0.0,
                avg_win_pct=0.0,
                avg_loss_pct=0.0,
                win_loss_ratio=0.0,
                kelly_fraction=0.0,
                half_kelly_fraction=0.0,
                quarter_kelly_fraction=0.0,
                sample_size=len(recent),
                is_valid=False,
            )
        
        wins = [t for t in recent if t.return_pct > 0]
        losses = [t for t in recent if t.return_pct < 0]
        
        win_rate = len(wins) / len(recent) if recent else 0
        avg_win_pct = np.mean([t.return_pct for t in wins]) if wins else 0
        avg_loss_pct = abs(np.mean([t.return_pct for t in losses])) if losses else 0
        
        if avg_loss_pct == 0:
            win_loss_ratio = 0
            kelly = 0
        else:
            win_loss_ratio = avg_win_pct / avg_loss_pct
            kelly = win_rate - ((1 - win_rate) / win_loss_ratio) if win_loss_ratio > 0 else 0
        
        kelly = max(0, min(kelly, 1.0))
        
        return KellyStats(
            win_rate=win_rate,
            avg_win_pct=avg_win_pct,
            avg_loss_pct=avg_loss_pct,
            win_loss_ratio=win_loss_ratio,
            kelly_fraction=kelly,
            half_kelly_fraction=kelly * 0.5,
            quarter_kelly_fraction=kelly * 0.25,
            sample_size=len(recent),
            is_valid=True,
        )
    
    def calculate_position_size(
        self,
        equity: float,
        signal_strength: float = 1.0,
        atr: Optional[float] = None,
        current_price: Optional[float] = None,
    ) -> float:
        """
        Calculate optimal position size using Kelly Criterion.
        
        Args:
            equity: Current account equity
            signal_strength: Signal confidence multiplier (0.0-1.0)
            atr: ATR for volatility adjustment (optional)
            current_price: Current stock price for share calculation (optional)
            
        Returns:
            Recommended position size in dollars
        """
        stats = self.get_kelly_stats()
        
        if not stats.is_valid:
            base_pct = 0.05
            logger.info(
                f"Kelly not valid (sample={stats.sample_size}/{self.min_trades}), "
                f"using conservative {base_pct:.0%}"
            )
        else:
            base_pct = stats.kelly_fraction * self.kelly_fraction
            logger.info(
                f"Kelly stats: win_rate={stats.win_rate:.1%}, "
                f"ratio={stats.win_loss_ratio:.2f}, "
                f"raw_kelly={stats.kelly_fraction:.1%}, "
                f"using {base_pct:.1%}"
            )
        
        position_pct = base_pct * signal_strength
        
        position_pct = min(position_pct, self.max_position_pct)
        
        position_usd = equity * position_pct
        
        if atr and current_price and atr > 0:
            volatility_ratio = atr / current_price
            if volatility_ratio > 0.03:
                vol_adjustment = 0.03 / volatility_ratio
                position_usd *= vol_adjustment
                logger.info(f"Volatility adjustment: {vol_adjustment:.2f}x")
        
        return position_usd
    
    def get_summary(self) -> dict:
        """Get summary of Kelly statistics for display."""
        stats = self.get_kelly_stats()
        
        return {
            "method": "Kelly Criterion",
            "fraction_used": f"{self.kelly_fraction:.0%}",
            "sample_size": stats.sample_size,
            "min_required": self.min_trades,
            "is_active": stats.is_valid,
            "win_rate": f"{stats.win_rate:.1%}" if stats.is_valid else "N/A",
            "win_loss_ratio": f"{stats.win_loss_ratio:.2f}" if stats.is_valid else "N/A",
            "raw_kelly": f"{stats.kelly_fraction:.1%}" if stats.is_valid else "N/A",
            "effective_kelly": f"{stats.kelly_fraction * self.kelly_fraction:.1%}" if stats.is_valid else "5%",
            "max_position": f"{self.max_position_pct:.0%}",
        }


class DrawdownCircuitBreaker:
    """
    Circuit breaker that reduces or pauses trading during drawdowns.
    
    Automatically scales down position sizes or blocks trading when
    drawdown limits are exceeded.
    """
    
    def __init__(
        self,
        daily_limit_pct: float = 0.05,
        weekly_limit_pct: float = 0.10,
        reduction_factor: float = 0.5,
        log_dir: str = "zeke_trader/logs",
    ):
        """
        Initialize circuit breaker.
        
        Args:
            daily_limit_pct: Daily drawdown limit (default 5%)
            weekly_limit_pct: Weekly drawdown limit (default 10%)
            reduction_factor: Position size reduction when in warning zone
            log_dir: Directory for state persistence
        """
        self.daily_limit_pct = daily_limit_pct
        self.weekly_limit_pct = weekly_limit_pct
        self.reduction_factor = reduction_factor
        self.log_dir = Path(log_dir)
        
        self.daily_pnl: List[float] = []
        self._load_state()
        
        logger.info(
            f"DrawdownCircuitBreaker initialized: "
            f"daily={daily_limit_pct:.0%}, weekly={weekly_limit_pct:.0%}"
        )
    
    def _load_state(self):
        """Load state from disk."""
        state_file = self.log_dir / "circuit_breaker_state.json"
        if state_file.exists():
            try:
                with open(state_file, "r") as f:
                    data = json.load(f)
                    self.daily_pnl = data.get("daily_pnl", [])[-7:]
            except Exception as e:
                logger.error(f"Failed to load circuit breaker state: {e}")
    
    def _save_state(self):
        """Save state to disk."""
        self.log_dir.mkdir(parents=True, exist_ok=True)
        state_file = self.log_dir / "circuit_breaker_state.json"
        try:
            with open(state_file, "w") as f:
                json.dump({
                    "daily_pnl": self.daily_pnl[-7:],
                    "updated_at": datetime.utcnow().isoformat(),
                }, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save circuit breaker state: {e}")
    
    def record_daily_pnl(self, pnl_pct: float):
        """Record end-of-day P&L percentage."""
        self.daily_pnl.append(pnl_pct)
        self.daily_pnl = self.daily_pnl[-7:]
        self._save_state()
    
    def check_status(
        self,
        current_daily_pnl_pct: float,
        equity: float,
    ) -> dict:
        """
        Check circuit breaker status.
        
        Args:
            current_daily_pnl_pct: Current day's P&L as percentage
            equity: Current account equity
            
        Returns:
            Dict with status, position_multiplier, and warnings
        """
        weekly_pnl_pct = sum(self.daily_pnl) + current_daily_pnl_pct
        
        daily_triggered = current_daily_pnl_pct <= -self.daily_limit_pct
        weekly_triggered = weekly_pnl_pct <= -self.weekly_limit_pct
        
        daily_warning = current_daily_pnl_pct <= -self.daily_limit_pct * 0.5
        weekly_warning = weekly_pnl_pct <= -self.weekly_limit_pct * 0.5
        
        if daily_triggered or weekly_triggered:
            status = "HALTED"
            position_multiplier = 0.0
        elif daily_warning or weekly_warning:
            status = "WARNING"
            position_multiplier = self.reduction_factor
        else:
            status = "NORMAL"
            position_multiplier = 1.0
        
        warnings = []
        if daily_triggered:
            warnings.append(f"Daily loss limit hit ({current_daily_pnl_pct:.1%} vs -{self.daily_limit_pct:.0%} limit)")
        elif daily_warning:
            warnings.append(f"Approaching daily limit ({current_daily_pnl_pct:.1%})")
        
        if weekly_triggered:
            warnings.append(f"Weekly loss limit hit ({weekly_pnl_pct:.1%} vs -{self.weekly_limit_pct:.0%} limit)")
        elif weekly_warning:
            warnings.append(f"Approaching weekly limit ({weekly_pnl_pct:.1%})")
        
        result = {
            "status": status,
            "position_multiplier": position_multiplier,
            "daily_pnl_pct": current_daily_pnl_pct,
            "weekly_pnl_pct": weekly_pnl_pct,
            "daily_limit_pct": -self.daily_limit_pct,
            "weekly_limit_pct": -self.weekly_limit_pct,
            "warnings": warnings,
            "trading_allowed": position_multiplier > 0,
        }
        
        if status != "NORMAL":
            logger.warning(f"Circuit breaker {status}: {warnings}")
        
        return result
    
    def get_summary(self) -> dict:
        """Get summary for display."""
        weekly_pnl = sum(self.daily_pnl)
        return {
            "daily_limit": f"-{self.daily_limit_pct:.0%}",
            "weekly_limit": f"-{self.weekly_limit_pct:.0%}",
            "current_weekly_pnl": f"{weekly_pnl:.1%}",
            "days_tracked": len(self.daily_pnl),
            "reduction_factor": f"{self.reduction_factor:.0%}",
        }

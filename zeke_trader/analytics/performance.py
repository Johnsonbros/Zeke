"""
Performance Analytics Engine for ZEKETrade.

Tracks key trading metrics: Sharpe, Sortino, max drawdown, 
win rate, profit factor, and average R-multiple.
"""
import json
import logging
from pathlib import Path
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, asdict, field
import numpy as np

logger = logging.getLogger("zeke_trader.analytics.performance")


@dataclass
class TradeRecord:
    """Individual trade record for analytics."""
    symbol: str
    side: str
    entry_price: float
    exit_price: float
    qty: float
    pnl: float
    return_pct: float
    entry_time: datetime
    exit_time: datetime
    holding_period_hours: float
    stop_distance: Optional[float] = None
    r_multiple: Optional[float] = None
    
    @property
    def is_winner(self) -> bool:
        return self.pnl > 0


@dataclass
class PerformanceMetrics:
    """Comprehensive performance metrics."""
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0
    
    total_pnl: float = 0.0
    avg_win: float = 0.0
    avg_loss: float = 0.0
    largest_win: float = 0.0
    largest_loss: float = 0.0
    
    profit_factor: float = 0.0
    avg_r_multiple: float = 0.0
    
    sharpe_ratio: float = 0.0
    sortino_ratio: float = 0.0
    max_drawdown_pct: float = 0.0
    current_drawdown_pct: float = 0.0
    
    avg_holding_period_hours: float = 0.0
    
    equity_high: float = 0.0
    equity_low: float = 0.0
    
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    
    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class DailyEquity:
    """Daily equity snapshot."""
    date: str
    equity: float
    daily_pnl: float
    daily_return_pct: float


class PerformanceAnalytics:
    """
    Performance analytics engine that calculates key trading metrics.
    """
    
    def __init__(self, log_dir: str = "zeke_trader/logs"):
        self.log_dir = Path(log_dir)
        self.trades: List[TradeRecord] = []
        self.equity_curve: List[DailyEquity] = []
        self._load_data()
    
    def _load_data(self):
        """Load historical trades and equity data from logs."""
        trades_dir = self.log_dir / "trades"
        if trades_dir.exists():
            for f in sorted(trades_dir.glob("trades_*.jsonl")):
                try:
                    with open(f, "r") as file:
                        for line in file:
                            if line.strip():
                                try:
                                    data = json.loads(line)
                                    if data.get("exit_price") and data.get("entry_price"):
                                        trade = self._parse_trade(data)
                                        if trade:
                                            self.trades.append(trade)
                                except Exception as e:
                                    logger.debug(f"Error parsing trade: {e}")
                except Exception as e:
                    logger.error(f"Error reading trades file {f}: {e}")
        
        equity_dir = self.log_dir / "equity"
        if equity_dir.exists():
            for f in sorted(equity_dir.glob("equity_*.jsonl")):
                try:
                    with open(f, "r") as file:
                        for line in file:
                            if line.strip():
                                try:
                                    data = json.loads(line)
                                    self.equity_curve.append(DailyEquity(
                                        date=data.get("date", data.get("ts", "")),
                                        equity=float(data.get("equity", 0)),
                                        daily_pnl=float(data.get("daily_pnl", 0)),
                                        daily_return_pct=float(data.get("daily_return_pct", 0)),
                                    ))
                                except Exception as e:
                                    logger.debug(f"Error parsing equity: {e}")
                except Exception as e:
                    logger.error(f"Error reading equity file {f}: {e}")
        
        logger.info(f"Loaded {len(self.trades)} trades and {len(self.equity_curve)} equity points")
    
    def _parse_trade(self, data: dict) -> Optional[TradeRecord]:
        """Parse trade data into TradeRecord."""
        try:
            entry_price = float(data.get("entry_price", 0))
            exit_price = float(data.get("exit_price", 0))
            qty = float(data.get("qty", data.get("quantity", 1)))
            side = data.get("side", "buy")
            
            if side == "buy":
                pnl = (exit_price - entry_price) * qty
                return_pct = (exit_price - entry_price) / entry_price if entry_price else 0
            else:
                pnl = (entry_price - exit_price) * qty
                return_pct = (entry_price - exit_price) / entry_price if entry_price else 0
            
            entry_time_str = data.get("entry_time", data.get("timestamp", ""))
            exit_time_str = data.get("exit_time", "")
            
            try:
                entry_time = datetime.fromisoformat(entry_time_str.replace("Z", "+00:00")) if entry_time_str else datetime.utcnow()
                exit_time = datetime.fromisoformat(exit_time_str.replace("Z", "+00:00")) if exit_time_str else datetime.utcnow()
            except:
                entry_time = datetime.utcnow()
                exit_time = datetime.utcnow()
            
            holding_hours = (exit_time - entry_time).total_seconds() / 3600
            
            stop_distance = data.get("stop_distance")
            r_multiple = None
            if stop_distance and float(stop_distance) > 0:
                r_multiple = return_pct / float(stop_distance)
            
            return TradeRecord(
                symbol=data.get("symbol", "UNKNOWN"),
                side=side,
                entry_price=entry_price,
                exit_price=exit_price,
                qty=qty,
                pnl=pnl,
                return_pct=return_pct,
                entry_time=entry_time,
                exit_time=exit_time,
                holding_period_hours=max(0, holding_hours),
                stop_distance=float(stop_distance) if stop_distance else None,
                r_multiple=r_multiple,
            )
        except Exception as e:
            logger.error(f"Error parsing trade: {e}")
            return None
    
    def record_trade(self, trade: TradeRecord):
        """Record a new trade."""
        self.trades.append(trade)
        self._save_trade(trade)
    
    def _save_trade(self, trade: TradeRecord):
        """Save trade to log file."""
        trades_dir = self.log_dir / "trades"
        trades_dir.mkdir(parents=True, exist_ok=True)
        
        date_str = trade.exit_time.strftime("%Y%m%d")
        trades_file = trades_dir / f"trades_{date_str}.jsonl"
        
        trade_data = {
            "symbol": trade.symbol,
            "side": trade.side,
            "entry_price": trade.entry_price,
            "exit_price": trade.exit_price,
            "qty": trade.qty,
            "pnl": trade.pnl,
            "return_pct": trade.return_pct,
            "entry_time": trade.entry_time.isoformat(),
            "exit_time": trade.exit_time.isoformat(),
            "holding_period_hours": trade.holding_period_hours,
            "stop_distance": trade.stop_distance,
            "r_multiple": trade.r_multiple,
        }
        
        with open(trades_file, "a") as f:
            f.write(json.dumps(trade_data) + "\n")
    
    def record_equity(self, equity: float, daily_pnl: float):
        """Record daily equity snapshot."""
        equity_dir = self.log_dir / "equity"
        equity_dir.mkdir(parents=True, exist_ok=True)
        
        now = datetime.utcnow()
        date_str = now.strftime("%Y%m%d")
        
        prev_equity = self.equity_curve[-1].equity if self.equity_curve else equity
        daily_return_pct = (daily_pnl / prev_equity) if prev_equity > 0 else 0
        
        entry = DailyEquity(
            date=date_str,
            equity=equity,
            daily_pnl=daily_pnl,
            daily_return_pct=daily_return_pct,
        )
        self.equity_curve.append(entry)
        
        equity_file = equity_dir / f"equity_{date_str[:6]}.jsonl"
        with open(equity_file, "a") as f:
            f.write(json.dumps({
                "ts": now.isoformat(),
                "date": date_str,
                "equity": equity,
                "daily_pnl": daily_pnl,
                "daily_return_pct": daily_return_pct,
            }) + "\n")
    
    def calculate_metrics(
        self,
        lookback_days: Optional[int] = None,
        risk_free_rate: float = 0.05,
    ) -> PerformanceMetrics:
        """
        Calculate comprehensive performance metrics.
        
        Args:
            lookback_days: Only consider trades within this many days (None = all)
            risk_free_rate: Annual risk-free rate for Sharpe/Sortino calculation
        
        Returns:
            PerformanceMetrics with all calculated values
        """
        trades = self.trades
        if lookback_days:
            cutoff = datetime.utcnow() - timedelta(days=lookback_days)
            trades = [t for t in trades if t.exit_time >= cutoff]
        
        if not trades:
            return PerformanceMetrics()
        
        winners = [t for t in trades if t.is_winner]
        losers = [t for t in trades if not t.is_winner]
        
        total_trades = len(trades)
        winning_trades = len(winners)
        losing_trades = len(losers)
        win_rate = winning_trades / total_trades if total_trades else 0
        
        total_pnl = sum(t.pnl for t in trades)
        
        avg_win = np.mean([t.pnl for t in winners]) if winners else 0
        avg_loss = abs(np.mean([t.pnl for t in losers])) if losers else 0
        
        largest_win = max([t.pnl for t in winners]) if winners else 0
        largest_loss = min([t.pnl for t in losers]) if losers else 0
        
        gross_profit = sum(t.pnl for t in winners) if winners else 0
        gross_loss = abs(sum(t.pnl for t in losers)) if losers else 0
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf') if gross_profit > 0 else 0
        
        r_multiples = [t.r_multiple for t in trades if t.r_multiple is not None]
        avg_r_multiple = np.mean(r_multiples) if r_multiples else 0
        
        avg_holding = np.mean([t.holding_period_hours for t in trades])
        
        sharpe, sortino, max_dd, current_dd = self._calculate_risk_metrics(risk_free_rate)
        
        equity_values = [e.equity for e in self.equity_curve]
        equity_high = max(equity_values) if equity_values else 0
        equity_low = min(equity_values) if equity_values else 0
        
        period_start = trades[0].entry_time.isoformat() if trades else None
        period_end = trades[-1].exit_time.isoformat() if trades else None
        
        return PerformanceMetrics(
            total_trades=total_trades,
            winning_trades=winning_trades,
            losing_trades=losing_trades,
            win_rate=win_rate,
            total_pnl=total_pnl,
            avg_win=avg_win,
            avg_loss=avg_loss,
            largest_win=largest_win,
            largest_loss=largest_loss,
            profit_factor=profit_factor,
            avg_r_multiple=avg_r_multiple,
            sharpe_ratio=sharpe,
            sortino_ratio=sortino,
            max_drawdown_pct=max_dd,
            current_drawdown_pct=current_dd,
            avg_holding_period_hours=avg_holding,
            equity_high=equity_high,
            equity_low=equity_low,
            period_start=period_start,
            period_end=period_end,
        )
    
    def _calculate_risk_metrics(
        self,
        risk_free_rate: float = 0.05,
    ) -> tuple[float, float, float, float]:
        """
        Calculate Sharpe, Sortino, and drawdown metrics.
        
        Returns:
            Tuple of (sharpe_ratio, sortino_ratio, max_drawdown_pct, current_drawdown_pct)
        """
        if len(self.equity_curve) < 2:
            returns = [t.return_pct for t in self.trades]
            if not returns:
                return (0.0, 0.0, 0.0, 0.0)
            
            mean_return = np.mean(returns)
            std_return = np.std(returns)
            
            daily_rf = risk_free_rate / 252
            
            sharpe = (mean_return - daily_rf) / std_return * np.sqrt(252) if std_return > 0 else 0
            
            downside_returns = [r for r in returns if r < daily_rf]
            downside_std = np.std(downside_returns) if downside_returns else std_return
            sortino = (mean_return - daily_rf) / downside_std * np.sqrt(252) if downside_std > 0 else 0
            
            pnls = [t.pnl for t in self.trades]
            cumulative = np.cumsum(pnls)
            peak = np.maximum.accumulate(cumulative)
            drawdown = (peak - cumulative) / peak
            drawdown = np.nan_to_num(drawdown, nan=0.0)
            
            max_dd = float(np.max(drawdown)) if len(drawdown) > 0 else 0
            current_dd = float(drawdown[-1]) if len(drawdown) > 0 else 0
            
            return (sharpe, sortino, max_dd, current_dd)
        
        returns = [e.daily_return_pct for e in self.equity_curve if e.daily_return_pct != 0]
        if not returns:
            return (0.0, 0.0, 0.0, 0.0)
        
        mean_return = np.mean(returns)
        std_return = np.std(returns)
        
        daily_rf = risk_free_rate / 252
        
        sharpe = (mean_return - daily_rf) / std_return * np.sqrt(252) if std_return > 0 else 0
        
        downside_returns = [r for r in returns if r < daily_rf]
        downside_std = np.std(downside_returns) if downside_returns else std_return
        sortino = (mean_return - daily_rf) / downside_std * np.sqrt(252) if downside_std > 0 else 0
        
        equity_values = np.array([e.equity for e in self.equity_curve])
        peak = np.maximum.accumulate(equity_values)
        drawdown = (peak - equity_values) / peak
        
        max_dd = float(np.max(drawdown))
        current_dd = float(drawdown[-1])
        
        return (sharpe, sortino, max_dd, current_dd)
    
    def get_summary(self) -> dict:
        """Get a summary suitable for API response."""
        metrics = self.calculate_metrics()
        return {
            "metrics": metrics.to_dict(),
            "trade_count": len(self.trades),
            "equity_points": len(self.equity_curve),
            "data_available": len(self.trades) > 0,
        }
    
    def get_equity_chart_data(self, limit: int = 100) -> List[dict]:
        """Get equity curve data for charting."""
        recent = self.equity_curve[-limit:]
        return [{"date": e.date, "equity": e.equity, "pnl": e.daily_pnl} for e in recent]
    
    def get_trade_distribution(self) -> dict:
        """Get trade distribution by symbol."""
        distribution: Dict[str, Dict[str, Any]] = {}
        for trade in self.trades:
            if trade.symbol not in distribution:
                distribution[trade.symbol] = {"count": 0, "pnl": 0, "wins": 0}
            distribution[trade.symbol]["count"] += 1
            distribution[trade.symbol]["pnl"] += trade.pnl
            if trade.is_winner:
                distribution[trade.symbol]["wins"] += 1
        
        for sym in distribution:
            count = distribution[sym]["count"]
            distribution[sym]["win_rate"] = distribution[sym]["wins"] / count if count > 0 else 0
        
        return distribution

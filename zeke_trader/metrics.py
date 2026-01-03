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

    def evaluate_live_readiness(self) -> Dict:
        """Compute a readiness score for enabling live trading.

        The score is a weighted blend of configuration completeness,
        safety limits, paper-trading performance, discipline (risk blocks),
        and logging hygiene. It surfaces gating issues that must be resolved
        before switching to live mode.
        """

        summary = self.get_summary()
        components: List[Dict] = []
        gating_issues: List[str] = []

        def clamp(score: float) -> float:
            return max(0.0, min(100.0, score))

        # Configuration completeness
        config_score = 100.0
        config_notes: List[str] = []
        if not self.cfg.alpaca_key_id or not self.cfg.alpaca_secret_key:
            config_score -= 40
            gating_issues.append("Missing Alpaca API keys for live trading")
            config_notes.append("Alpaca API keys are not configured")
        else:
            config_notes.append("Alpaca API keys present")

        if not self.cfg.openai_api_key:
            config_score -= 20
            gating_issues.append("Missing OpenAI API key for decisioning")
            config_notes.append("OpenAI API key is not configured")
        else:
            config_notes.append("OpenAI API key present")

        if not self.cfg.allowed_symbols:
            config_score -= 20
            gating_issues.append("Allowed symbols list is empty")
            config_notes.append("No symbols configured for trading")
        else:
            config_notes.append(f"Allowed symbols: {len(self.cfg.allowed_symbols)} configured")

        components.append({
            "name": "Configuration",
            "score": clamp(config_score),
            "notes": config_notes,
        })

        # Safety limits sanity check
        safety_score = 100.0
        safety_notes: List[str] = []

        if self.cfg.max_dollars_per_trade <= 0:
            safety_score -= 35
            gating_issues.append("Max dollars per trade must be greater than 0")
            safety_notes.append("Invalid trade size limit (must be > 0)")
        elif self.cfg.max_dollars_per_trade > 500:
            safety_score -= 15
            safety_notes.append("Trade size cap is unusually high; consider tightening for live")
        else:
            safety_notes.append(f"Max dollars per trade set to ${self.cfg.max_dollars_per_trade:.2f}")

        if self.cfg.max_open_positions <= 0:
            safety_score -= 35
            gating_issues.append("Max open positions must be at least 1")
            safety_notes.append("Invalid position limit (must be >= 1)")
        else:
            safety_notes.append(f"Open position cap set to {self.cfg.max_open_positions}")

        if self.cfg.max_trades_per_day <= 0:
            safety_score -= 25
            gating_issues.append("Max trades per day must be at least 1")
            safety_notes.append("Invalid trades-per-day limit (must be >= 1)")
        else:
            safety_notes.append(f"Daily trade cap set to {self.cfg.max_trades_per_day}")

        if self.cfg.max_daily_loss <= 0:
            safety_score -= 25
            gating_issues.append("Max daily loss must be greater than 0")
            safety_notes.append("Invalid daily loss limit (must be > 0)")
        else:
            safety_notes.append(f"Daily loss circuit breaker set to ${self.cfg.max_daily_loss:.2f}")

        components.append({
            "name": "Safety Limits",
            "score": clamp(safety_score),
            "notes": safety_notes,
        })

        # Performance from paper trading
        performance_score = 30.0
        performance_notes: List[str] = []
        total_trades = summary.get("total_trades", 0)
        win_rate = summary.get("win_rate", 0.0)
        total_pnl = summary.get("total_pnl", 0.0)

        if total_trades >= 20:
            performance_score = 80.0
            performance_notes.append("Robust paper track record (20+ trades)")
        elif total_trades >= 10:
            performance_score = 65.0
            performance_notes.append("Healthy paper sample size (10+ trades)")
        elif total_trades >= 5:
            performance_score = 50.0
            performance_notes.append("Limited sample size (5+ trades); gather more before live")
        elif total_trades > 0:
            performance_score = 35.0
            performance_notes.append("Minimal sample size (<5 trades); not yet ready for live")
            gating_issues.append("Paper trading history too small (<5 trades)")
        else:
            performance_notes.append("No paper trades logged yet")
            gating_issues.append("No paper trading history to evaluate")

        performance_adjust = (win_rate - 0.5) * 40
        performance_score = clamp(performance_score + performance_adjust)

        if total_pnl > 0:
            performance_score = clamp(performance_score + 5)
            performance_notes.append(f"Positive aggregate P&L (${total_pnl:.2f})")
        elif total_pnl < 0:
            performance_score = clamp(performance_score - 5)
            performance_notes.append(f"Negative aggregate P&L (${total_pnl:.2f})")

        components.append({
            "name": "Paper Performance",
            "score": performance_score,
            "notes": performance_notes,
        })

        # Discipline: how often risk gate blocks decisions
        discipline_notes: List[str] = []
        decisions_count = summary.get("total_decisions", 0)
        risk_blocks = summary.get("risk_blocks_total", 0)
        if decisions_count > 0:
            block_rate = risk_blocks / decisions_count
            discipline_score = clamp(100.0 - (block_rate * 120))
            discipline_notes.append(f"Risk block rate: {block_rate:.0%}")
            if block_rate > 0.3:
                gating_issues.append("High rate of risk blocks; tighten decision quality")
        else:
            discipline_score = 50.0
            discipline_notes.append("No decisions logged yet")

        components.append({
            "name": "Risk Discipline",
            "score": discipline_score,
            "notes": discipline_notes,
        })

        # Logging hygiene (ensures observability when live)
        logging_score = 50.0
        logging_notes: List[str] = []
        equity_log = self.log_dir / "equity.csv"
        trades_log = self.log_dir / "trades.csv"
        decisions_log = self.log_dir / "decisions.csv"

        healthy_logs = 0
        for path, label in [
            (equity_log, "equity"),
            (trades_log, "trades"),
            (decisions_log, "decisions"),
        ]:
            if path.exists() and path.stat().st_size > 0:
                healthy_logs += 1
                logging_notes.append(f"{label} log present")
            else:
                logging_notes.append(f"{label} log missing or empty")

        logging_score = clamp(logging_score + healthy_logs * 15)
        if healthy_logs < 3:
            gating_issues.append("Logging incomplete; ensure equity/decision/trade logs are written")

        components.append({
            "name": "Logging",
            "score": logging_score,
            "notes": logging_notes,
        })

        weights = {
            "Configuration": 0.25,
            "Safety Limits": 0.2,
            "Paper Performance": 0.3,
            "Risk Discipline": 0.15,
            "Logging": 0.1,
        }

        weighted_score = 0.0
        for comp in components:
            weighted_score += comp["score"] * weights.get(comp["name"], 0)

        overall_score = round(weighted_score, 1)
        ready = overall_score >= 70 and len(gating_issues) == 0

        return {
            "overall_score": overall_score,
            "ready": ready,
            "components": components,
            "gating_issues": gating_issues,
            "summary": summary,
        }
    
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

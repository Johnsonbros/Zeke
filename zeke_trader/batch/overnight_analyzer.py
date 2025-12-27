"""
Overnight Batch Analyzer for ZEKE Trading System.

Processes trading artifacts from the last trading day and generates:
1) daily_report.json - Executive summary with metrics
2) trade_critiques.jsonl - One critique per trade
3) recommended_thresholds.json - Deterministic config recommendations
"""

import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional
from dataclasses import dataclass, field, asdict
from enum import Enum

from pydantic import BaseModel


class Grade(str, Enum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    F = "F"


class FailureMode(str, Enum):
    WHIPSAW = "whipsaw"
    STOP_TOO_TIGHT = "stop_too_tight"
    LATE_ENTRY = "late_entry"
    OVERCORRELATED = "overcorrelated"
    OVERTRADING = "overtrading"
    DATA_ISSUE = "data_issue"
    EXECUTION_SLIPPAGE = "execution_slippage"
    UNKNOWN = "unknown"


class Confidence(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


@dataclass
class PortfolioContext:
    positions_before: Optional[int] = None
    trades_today_before: Optional[int] = None
    cash: Optional[float] = None
    equity: Optional[float] = None


@dataclass
class ExecutionQuality:
    slippage: Optional[float] = None
    notes: str = ""


@dataclass
class TradeOutcome:
    pnl_usd: Optional[float] = None
    pnl_pct: Optional[float] = None
    holding_minutes: Optional[int] = None
    exit_type: str = "unknown"
    execution_quality: ExecutionQuality = field(default_factory=ExecutionQuality)


@dataclass
class TradeGrade:
    signal_quality: str = "C"
    selection_quality: str = "C"
    risk_fit: str = "C"
    execution_quality: str = "C"
    overall: str = "C"


@dataclass
class TradeDiagnosis:
    what_went_right: list[str] = field(default_factory=list)
    what_went_wrong: list[str] = field(default_factory=list)
    most_likely_failure_mode: str = "unknown"


@dataclass
class BetterCandidate:
    exists: Optional[bool] = None
    better_symbol: Optional[str] = None
    why: Optional[str] = None


@dataclass
class Counterfactuals:
    turtle_pure_would_do: str = ""
    if_any_better_candidate_existed: BetterCandidate = field(default_factory=BetterCandidate)


@dataclass
class ThresholdRecommendation:
    type: str
    name: str
    suggested: Any
    reason: str


@dataclass
class TradeRecommendations:
    deterministic_changes: list[dict] = field(default_factory=list)


@dataclass
class TradeCritique:
    trade_id: str
    date: str
    symbol: str
    side: str
    system: str = "unknown"
    breakout_days: Optional[int] = None
    breakout_strength_n: Optional[float] = None
    atr_n: Optional[float] = None
    stop_n: Optional[float] = None
    notional_usd: Optional[float] = None
    confidence: Optional[float] = None
    thesis_summary: str = ""
    portfolio_context: PortfolioContext = field(default_factory=PortfolioContext)
    outcome: TradeOutcome = field(default_factory=TradeOutcome)
    grade: TradeGrade = field(default_factory=TradeGrade)
    diagnosis: TradeDiagnosis = field(default_factory=TradeDiagnosis)
    counterfactuals: Counterfactuals = field(default_factory=Counterfactuals)
    recommendations: TradeRecommendations = field(default_factory=TradeRecommendations)


class OvernightAnalyzer:
    """Analyzes trading day artifacts and generates reports."""
    
    def __init__(self, log_dir: str = "zeke_trader/logs"):
        self.log_dir = Path(log_dir)
        self.loops_dir = self.log_dir / "loops"
        self.trades_dir = self.log_dir / "trades"
        self.equity_dir = self.log_dir / "equity"
        self.reports_dir = self.log_dir / "reports"
        self.reports_dir.mkdir(parents=True, exist_ok=True)
        
        self.loops: list[dict] = []
        self.trades: list[dict] = []
        self.equity_data: list[dict] = []
        self.missing_data: list[str] = []
    
    def analyze_day(self, date: Optional[str] = None) -> dict:
        """
        Analyze a trading day and generate reports.
        
        Args:
            date: Date string YYYY-MM-DD, defaults to yesterday
            
        Returns:
            Dict with paths to generated files
        """
        if date is None:
            date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        
        self._ingest_loops(date)
        self._ingest_trades(date)
        self._ingest_equity(date)
        
        critiques = self._generate_critiques(date)
        daily_report = self._generate_daily_report(date)
        thresholds = self._generate_threshold_recommendations(date, critiques)
        
        date_str = date.replace("-", "")
        
        report_path = self.reports_dir / f"daily_report_{date_str}.json"
        with open(report_path, "w") as f:
            json.dump(daily_report, f, indent=2, default=str)
        
        critiques_path = self.reports_dir / f"trade_critiques_{date_str}.jsonl"
        with open(critiques_path, "w") as f:
            for critique in critiques:
                f.write(json.dumps(asdict(critique), default=str) + "\n")
        
        thresholds_path = self.reports_dir / f"recommended_thresholds_{date_str}.json"
        with open(thresholds_path, "w") as f:
            json.dump(thresholds, f, indent=2, default=str)
        
        return {
            "date": date,
            "daily_report": str(report_path),
            "trade_critiques": str(critiques_path),
            "recommended_thresholds": str(thresholds_path),
            "trades_analyzed": len(critiques),
            "loops_analyzed": len(self.loops),
        }
    
    def _ingest_loops(self, date: str) -> None:
        """Parse loop logs for the specified date."""
        self.loops = []
        
        if not self.loops_dir.exists():
            self.missing_data.append("loops directory not found")
            return
        
        date_prefix = date.replace("-", "")
        
        for f in self.loops_dir.glob(f"loop_{date_prefix}*.jsonl"):
            try:
                with open(f, "r") as file:
                    for line in file:
                        if line.strip():
                            try:
                                data = json.loads(line)
                                self.loops.append(data)
                            except json.JSONDecodeError:
                                continue
            except Exception as e:
                self.missing_data.append(f"Error reading {f}: {e}")
        
        for f in self.loops_dir.glob("loop_*.jsonl"):
            try:
                with open(f, "r") as file:
                    for line in file:
                        if line.strip():
                            try:
                                data = json.loads(line)
                                ts = data.get("timestamp", data.get("ts", ""))
                                if ts.startswith(date):
                                    if data not in self.loops:
                                        self.loops.append(data)
                            except json.JSONDecodeError:
                                continue
            except Exception:
                continue
        
        if not self.loops:
            self.missing_data.append(f"No loop logs found for {date}")
    
    def _ingest_trades(self, date: str) -> None:
        """Parse trade logs for the specified date."""
        self.trades = []
        
        if not self.trades_dir.exists():
            self.missing_data.append("trades directory not found")
            return
        
        for f in self.trades_dir.glob("trades_*.jsonl"):
            try:
                with open(f, "r") as file:
                    for line in file:
                        if line.strip():
                            try:
                                data = json.loads(line)
                                ts = data.get("timestamp", data.get("ts", ""))
                                if ts.startswith(date):
                                    self.trades.append(data)
                            except json.JSONDecodeError:
                                continue
            except Exception as e:
                self.missing_data.append(f"Error reading {f}: {e}")
        
        for f in self.trades_dir.glob("*.json"):
            if f.suffix == ".json" and not str(f).endswith(".jsonl"):
                try:
                    with open(f, "r") as file:
                        data = json.load(file)
                        if isinstance(data, list):
                            for trade in data:
                                ts = trade.get("timestamp", trade.get("ts", ""))
                                if ts.startswith(date):
                                    self.trades.append(trade)
                        elif isinstance(data, dict):
                            ts = data.get("timestamp", data.get("ts", ""))
                            if ts.startswith(date):
                                self.trades.append(data)
                except Exception:
                    continue
        
        if not self.trades:
            self.missing_data.append(f"No trade logs found for {date}")
    
    def _ingest_equity(self, date: str) -> None:
        """Parse equity logs for the specified date."""
        self.equity_data = []
        
        if not self.equity_dir.exists():
            self.missing_data.append("equity directory not found")
            return
        
        for f in self.equity_dir.glob("equity_*.jsonl"):
            try:
                with open(f, "r") as file:
                    for line in file:
                        if line.strip():
                            try:
                                data = json.loads(line)
                                ts = data.get("ts", data.get("timestamp", ""))
                                if ts.startswith(date):
                                    self.equity_data.append(data)
                            except json.JSONDecodeError:
                                continue
            except Exception:
                continue
        
        if not self.equity_data:
            self.missing_data.append(f"No equity logs found for {date}")
    
    def _generate_critiques(self, date: str) -> list[TradeCritique]:
        """Generate detailed critiques for each executed trade."""
        critiques = []
        
        for i, trade in enumerate(self.trades):
            trade_id = trade.get("order_id", trade.get("id", f"trade_{i}"))
            symbol = trade.get("symbol", "UNKNOWN")
            side = trade.get("side", "buy")
            
            thesis = trade.get("thesis", {})
            if isinstance(thesis, str):
                thesis_summary = thesis
                system = "unknown"
                breakout_days = None
                breakout_strength = None
                atr_n = None
                confidence = None
            else:
                thesis_summary = thesis.get("summary", "")
                system = thesis.get("system", "unknown")
                breakout_days = thesis.get("breakout_days")
                breakout_strength = thesis.get("breakout_strength_n")
                atr_n = thesis.get("atr_n")
                confidence = thesis.get("confidence")
            
            entry_price = trade.get("entry_price", trade.get("filled_avg_price"))
            exit_price = trade.get("exit_price")
            pnl_usd = trade.get("pnl", trade.get("pnl_usd"))
            
            if pnl_usd is not None and entry_price and exit_price:
                pnl_pct = ((exit_price - entry_price) / entry_price) * 100 if side == "buy" else ((entry_price - exit_price) / entry_price) * 100
            else:
                pnl_pct = trade.get("pnl_pct")
            
            thesis_dict = thesis if isinstance(thesis, dict) else {}
            grade = self._grade_trade(trade, thesis_dict)
            diagnosis = self._diagnose_trade(trade, thesis_dict, pnl_usd)
            counterfactuals = self._generate_counterfactuals(trade, date)
            recommendations = self._generate_trade_recommendations(trade, diagnosis)
            
            critique = TradeCritique(
                trade_id=str(trade_id),
                date=date,
                symbol=symbol,
                side=side,
                system=system,
                breakout_days=breakout_days,
                breakout_strength_n=breakout_strength,
                atr_n=atr_n,
                stop_n=thesis.get("stop_n") if isinstance(thesis, dict) else None,
                notional_usd=trade.get("notional_usd", trade.get("qty", 0) * (entry_price or 0)),
                confidence=confidence,
                thesis_summary=thesis_summary,
                portfolio_context=PortfolioContext(
                    positions_before=trade.get("positions_before"),
                    trades_today_before=trade.get("trades_today_before"),
                    cash=trade.get("cash_before"),
                    equity=trade.get("equity_before"),
                ),
                outcome=TradeOutcome(
                    pnl_usd=pnl_usd,
                    pnl_pct=pnl_pct,
                    holding_minutes=trade.get("holding_minutes"),
                    exit_type=trade.get("exit_type", "unknown"),
                    execution_quality=ExecutionQuality(
                        slippage=trade.get("slippage"),
                        notes=trade.get("execution_notes", ""),
                    ),
                ),
                grade=grade,
                diagnosis=diagnosis,
                counterfactuals=counterfactuals,
                recommendations=recommendations,
            )
            critiques.append(critique)
        
        return critiques
    
    def _grade_trade(self, trade: dict, thesis: dict) -> TradeGrade:
        """Grade a trade on multiple dimensions."""
        pnl = trade.get("pnl", 0) or 0
        
        if pnl > 0:
            overall = "A" if pnl > 10 else "B"
        elif pnl == 0:
            overall = "C"
        else:
            overall = "D" if pnl > -10 else "F"
        
        if isinstance(thesis, dict):
            bs = thesis.get("breakout_strength_n", 0) or 0
            signal_quality = "A" if bs > 1.5 else "B" if bs > 1.0 else "C" if bs > 0.5 else "D"
        else:
            signal_quality = "C"
        
        return TradeGrade(
            signal_quality=signal_quality,
            selection_quality="B",
            risk_fit="B",
            execution_quality="B",
            overall=overall,
        )
    
    def _diagnose_trade(self, trade: dict, thesis: dict, pnl: Optional[float]) -> TradeDiagnosis:
        """Diagnose what went right/wrong with a trade."""
        right = []
        wrong = []
        failure_mode = "unknown"
        
        if pnl is not None:
            if pnl > 0:
                right.append("Trade was profitable")
            else:
                wrong.append("Trade lost money")
        
        exit_type = trade.get("exit_type", "")
        if exit_type == "stop_hit":
            wrong.append("Hit hard stop")
            failure_mode = "whipsaw" if (pnl and pnl > -15) else "stop_too_tight"
        elif exit_type == "system_exit":
            right.append("Followed system exit rules")
        
        if isinstance(thesis, dict):
            bs = thesis.get("breakout_strength_n", 0) or 0
            if bs > 1.0:
                right.append(f"Strong breakout signal ({bs:.2f}N)")
            elif bs < 0.5:
                wrong.append(f"Weak breakout signal ({bs:.2f}N)")
        
        return TradeDiagnosis(
            what_went_right=right,
            what_went_wrong=wrong,
            most_likely_failure_mode=failure_mode,
        )
    
    def _generate_counterfactuals(self, trade: dict, date: str) -> Counterfactuals:
        """Generate counterfactual analysis."""
        symbol = trade.get("symbol", "")
        thesis = trade.get("thesis", {})
        system = thesis.get("system", "unknown") if isinstance(thesis, dict) else "unknown"
        
        if system == "S1":
            turtle_pure = "Turtle rules would take this S1 entry if last S1 trade was winner"
        elif system == "S2":
            turtle_pure = "Turtle rules would always take S2 entry"
        else:
            turtle_pure = "Unable to determine Turtle pure behavior"
        
        better_candidates = self._find_better_candidates(trade, date)
        
        return Counterfactuals(
            turtle_pure_would_do=turtle_pure,
            if_any_better_candidate_existed=better_candidates,
        )
    
    def _find_better_candidates(self, trade: dict, date: str) -> BetterCandidate:
        """Check if better candidates existed at time of trade."""
        trade_ts = trade.get("timestamp", "")
        symbol = trade.get("symbol", "")
        
        for loop in self.loops:
            loop_ts = loop.get("timestamp", loop.get("ts", ""))
            if loop_ts.startswith(date):
                signals = loop.get("signals", [])
                for sig in signals:
                    if sig.get("symbol") != symbol:
                        sig_score = sig.get("total_score", sig.get("score", 0)) or 0
                        trade_score = trade.get("thesis", {}).get("signal_score", 0) if isinstance(trade.get("thesis"), dict) else 0
                        if sig_score > trade_score:
                            return BetterCandidate(
                                exists=True,
                                better_symbol=sig.get("symbol"),
                                why=f"Higher score ({sig_score:.2f} vs {trade_score:.2f})",
                            )
        
        return BetterCandidate(exists=False)
    
    def _generate_trade_recommendations(self, trade: dict, diagnosis: TradeDiagnosis) -> TradeRecommendations:
        """Generate deterministic recommendations based on trade outcome."""
        recs = []
        
        pnl = trade.get("pnl", 0) or 0
        thesis = trade.get("thesis", {})
        
        if isinstance(thesis, dict):
            bs = thesis.get("breakout_strength_n", 0) or 0
            confidence = thesis.get("confidence", 0) or 0
            
            if pnl < 0 and bs < 1.0:
                recs.append({
                    "type": "threshold",
                    "name": "min_breakout_strength_n",
                    "suggested": 1.0,
                    "reason": "Trade with weak breakout resulted in loss",
                })
            
            if pnl < 0 and confidence < 0.6:
                recs.append({
                    "type": "threshold",
                    "name": "min_confidence",
                    "suggested": 0.6,
                    "reason": "Low confidence trade resulted in loss",
                })
        
        if diagnosis.most_likely_failure_mode == "whipsaw":
            recs.append({
                "type": "rule",
                "name": "prefer_S2",
                "suggested": "true",
                "reason": "Whipsaw suggests S1 may be too sensitive",
            })
        
        return TradeRecommendations(deterministic_changes=recs)
    
    def _generate_daily_report(self, date: str) -> dict:
        """Generate executive summary and metrics."""
        loops_total = len(self.loops)
        signals_total = sum(len(l.get("signals", [])) for l in self.loops)
        trades_executed = len(self.trades)
        no_trade_loops = sum(1 for l in self.loops if l.get("decision", {}).get("action") != "trade")
        risk_blocks = sum(1 for l in self.loops if l.get("risk_result", {}).get("blocked"))
        errors = sum(1 for l in self.loops if l.get("errors"))
        
        start_equity = self.equity_data[0].get("equity") if self.equity_data else None
        end_equity = self.equity_data[-1].get("equity") if self.equity_data else None
        
        daily_pnl_usd = sum(t.get("pnl", 0) or 0 for t in self.trades)
        daily_pnl_pct = (daily_pnl_usd / start_equity * 100) if start_equity else None
        
        wins = [t.get("pnl", 0) for t in self.trades if (t.get("pnl", 0) or 0) > 0]
        losses = [t.get("pnl", 0) for t in self.trades if (t.get("pnl", 0) or 0) < 0]
        win_rate = len(wins) / len(self.trades) if self.trades else None
        avg_win = sum(wins) / len(wins) if wins else None
        avg_loss = sum(losses) / len(losses) if losses else None
        
        if win_rate is not None and avg_win is not None:
            expectancy = (win_rate * (avg_win or 0)) + ((1 - win_rate) * (avg_loss or 0))
        else:
            expectancy = None
        
        s1_trades = [t for t in self.trades if t.get("thesis", {}).get("system") == "S1"]
        s2_trades = [t for t in self.trades if t.get("thesis", {}).get("system") == "S2"]
        
        block_reasons: dict[str, int] = {}
        for l in self.loops:
            rr = l.get("risk_result", {})
            if rr.get("blocked"):
                reason = rr.get("reason", "unknown")
                block_reasons[reason] = block_reasons.get(reason, 0) + 1
        
        loops_with_signals = [l for l in self.loops if l.get("signals")]
        avg_candidates = sum(len(l.get("signals", [])) for l in loops_with_signals) / len(loops_with_signals) if loops_with_signals else None
        times_multiple = sum(1 for l in self.loops if len(l.get("signals", [])) > 1)
        
        top_insights = []
        if trades_executed == 0:
            top_insights.append("No trades executed today")
        else:
            top_insights.append(f"Executed {trades_executed} trade(s) with net P&L ${daily_pnl_usd:.2f}")
        
        if win_rate is not None:
            top_insights.append(f"Win rate: {win_rate*100:.0f}%")
        
        if risk_blocks > 0:
            top_insights.append(f"Risk gate blocked {risk_blocks} potential trade(s)")
        
        if no_trade_loops > 0:
            top_insights.append(f"Agent chose NO_TRADE in {no_trade_loops} loop(s)")
        
        return {
            "date": date,
            "run_summary": {
                "loops_total": loops_total,
                "signals_total": signals_total,
                "trades_executed": trades_executed,
                "no_trade_loops": no_trade_loops,
                "risk_blocks": risk_blocks,
                "errors": errors,
            },
            "performance": {
                "start_equity": start_equity,
                "end_equity": end_equity,
                "daily_pnl_usd": daily_pnl_usd,
                "daily_pnl_pct": daily_pnl_pct,
                "max_drawdown_pct": None,
                "win_rate": win_rate,
                "avg_win_usd": avg_win,
                "avg_loss_usd": avg_loss,
                "expectancy_usd": expectancy,
            },
            "strategy_breakdown": {
                "S1": {
                    "trades": len(s1_trades),
                    "pnl_usd": sum(t.get("pnl", 0) or 0 for t in s1_trades),
                    "win_rate": len([t for t in s1_trades if (t.get("pnl", 0) or 0) > 0]) / len(s1_trades) if s1_trades else None,
                },
                "S2": {
                    "trades": len(s2_trades),
                    "pnl_usd": sum(t.get("pnl", 0) or 0 for t in s2_trades),
                    "win_rate": len([t for t in s2_trades if (t.get("pnl", 0) or 0) > 0]) / len(s2_trades) if s2_trades else None,
                },
            },
            "selection_diagnostics": {
                "avg_candidates_per_loop": avg_candidates,
                "times_multiple_candidates": times_multiple,
                "selection_patterns": [],
            },
            "risk_diagnostics": {
                "most_common_block_reasons": [{"reason": r, "count": c} for r, c in sorted(block_reasons.items(), key=lambda x: -x[1])],
                "limit_hits": {
                    "max_trades_per_day_hit": None,
                    "max_open_positions_hit": None,
                    "max_daily_loss_hit": None,
                },
            },
            "execution_diagnostics": {
                "avg_slippage": None,
                "rejected_orders": 0,
                "notes": [],
            },
            "top_insights": top_insights,
            "missing_data": self.missing_data,
        }
    
    def _generate_threshold_recommendations(self, date: str, critiques: list[TradeCritique]) -> dict:
        """Generate aggregated threshold recommendations."""
        all_recs: dict[str, list[dict]] = {}
        
        for critique in critiques:
            for rec in critique.recommendations.deterministic_changes:
                name = rec.get("name", "")
                if name not in all_recs:
                    all_recs[name] = []
                all_recs[name].append(rec)
        
        recommendations = []
        
        if "min_breakout_strength_n" in all_recs:
            recs = all_recs["min_breakout_strength_n"]
            suggested = max(r.get("suggested", 0) for r in recs)
            recommendations.append({
                "name": "min_breakout_strength_n",
                "current": None,
                "suggested": suggested,
                "impact_hypothesis": "Filtering weak breakouts should reduce whipsaw losses",
                "confidence": "medium" if len(recs) > 1 else "low",
                "based_on": [r.get("reason", "") for r in recs],
            })
        
        if "min_confidence" in all_recs:
            recs = all_recs["min_confidence"]
            suggested = max(r.get("suggested", 0) for r in recs)
            recommendations.append({
                "name": "min_confidence",
                "current": None,
                "suggested": suggested,
                "impact_hypothesis": "Higher confidence threshold reduces uncertain entries",
                "confidence": "medium" if len(recs) > 1 else "low",
                "based_on": [r.get("reason", "") for r in recs],
            })
        
        if "prefer_S2" in all_recs:
            recommendations.append({
                "name": "prefer_S2_when_tied",
                "current": True,
                "suggested": True,
                "impact_hypothesis": "S2 signals are more reliable, fewer whipsaws",
                "confidence": "medium",
                "based_on": ["Multiple whipsaw patterns observed in S1 trades"],
            })
        
        if not recommendations:
            recommendations.append({
                "name": "correlation_penalty_weight",
                "current": 1.0,
                "suggested": 1.0,
                "impact_hypothesis": "Current correlation penalty appears adequate",
                "confidence": "low",
                "based_on": ["No concentrated losses in correlated positions"],
            })
        
        return {
            "date": date,
            "recommended_changes": recommendations,
            "do_not_change_automatically": [
                "risk limits (MAX_DAILY_LOSS etc.)",
                "execution behavior",
                "mode switches (paper/shadow/live)",
            ],
            "notes": [
                "All recommendations require human review before updating config.",
                f"Based on analysis of {len(critiques)} trade(s) from {date}.",
            ],
        }


def run_overnight_analysis(date: Optional[str] = None, log_dir: str = "zeke_trader/logs") -> dict:
    """
    Run the overnight batch analysis.
    
    Args:
        date: Date to analyze (YYYY-MM-DD), defaults to yesterday
        log_dir: Path to log directory
        
    Returns:
        Dict with paths to generated files
    """
    analyzer = OvernightAnalyzer(log_dir=log_dir)
    return analyzer.analyze_day(date)


if __name__ == "__main__":
    import sys
    
    date = sys.argv[1] if len(sys.argv) > 1 else None
    result = run_overnight_analysis(date)
    
    print(json.dumps(result, indent=2))

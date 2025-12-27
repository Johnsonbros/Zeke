"""
Deterministic Turtle Signal Scoring.

Ranking criteria from Turtle Directives:
1) Breakout strength: (price - breakout_level) / N
2) System priority: Prefer S2 (55-day) over S1 (20-day)
3) Volatility-adjusted momentum: 20-day return / N
4) Portfolio fit: Correlation/concentration penalty

Score formula:
score = 3.0*(breakout_strength) + 1.0*(system_bonus) + 1.0*(mom_per_N) - 1.0*(correlation_penalty)

The DecisionAgent can explain choices but MUST NOT invent criteria.
"""
from typing import List, Optional, Dict, Set
from ..agents.schemas import (
    Signal,
    SignalDirection,
    TurtleSystem,
    PortfolioState,
    ScoredSignal,
)


CORRELATION_GROUPS: Dict[str, str] = {
    "AAPL": "tech", "MSFT": "tech", "GOOGL": "tech", "GOOG": "tech",
    "NVDA": "tech", "AMD": "tech", "AVGO": "tech", "ADBE": "tech",
    "CRM": "tech", "ORCL": "tech", "META": "communication",
    "AMZN": "consumer", "TSLA": "consumer", "NFLX": "communication",
    "JPM": "finance", "BAC": "finance", "WFC": "finance",
    "GS": "finance", "MS": "finance",
    "XOM": "energy", "CVX": "energy", "COP": "energy",
    "JNJ": "healthcare", "UNH": "healthcare", "PFE": "healthcare", "MRK": "healthcare",
    "SPY": "index", "QQQ": "index", "IWM": "index", "DIA": "index",
}


class TurtleScorer:
    """
    Deterministic signal scoring for Turtle trading.
    
    This is the ranking component - it does NOT make decisions.
    The DecisionAgent uses these scores to pick winners.
    """
    
    def __init__(
        self,
        breakout_weight: float = 3.0,
        system_weight: float = 1.0,
        momentum_weight: float = 1.0,
        correlation_weight: float = 1.0,
    ):
        self.breakout_weight = breakout_weight
        self.system_weight = system_weight
        self.momentum_weight = momentum_weight
        self.correlation_weight = correlation_weight
    
    def score_signals(
        self,
        signals: List[Signal],
        portfolio: Optional[PortfolioState] = None,
        momentum_data: Optional[Dict[str, float]] = None,
    ) -> List[ScoredSignal]:
        """
        Score and rank signals using Turtle criteria.
        
        Args:
            signals: Raw signals from strategy
            portfolio: Current portfolio for correlation check
            momentum_data: Dict of symbol -> 20-day return
        
        Returns:
            List of ScoredSignal sorted by total_score descending
        """
        momentum_data = momentum_data or {}
        
        held_groups = self._get_held_correlation_groups(portfolio)
        
        scored = []
        for signal in signals:
            if signal.direction in [SignalDirection.EXIT_LONG, SignalDirection.EXIT_SHORT]:
                scored.append(ScoredSignal(
                    signal=signal,
                    breakout_strength=1.0,
                    system_bonus=0.0,
                    momentum_per_n=0.0,
                    correlation_penalty=0.0,
                ))
                continue
            
            breakout_strength = self._compute_breakout_strength(signal)
            
            system_bonus = 1.0 if signal.system == TurtleSystem.SYSTEM_2 else 0.0
            
            momentum = momentum_data.get(signal.symbol, 0.0)
            if signal.atr_n > 0:
                momentum_per_n = momentum / signal.atr_n
            else:
                momentum_per_n = 0.0
            
            correlation_penalty = self._compute_correlation_penalty(
                signal.symbol, held_groups
            )
            
            scored.append(ScoredSignal(
                signal=signal,
                breakout_strength=breakout_strength,
                system_bonus=system_bonus,
                momentum_per_n=momentum_per_n,
                correlation_penalty=correlation_penalty,
            ))
        
        scored.sort(key=lambda s: s.total_score, reverse=True)
        
        return scored
    
    def _compute_breakout_strength(self, signal: Signal) -> float:
        """
        Compute breakout strength = (price - breakout_level) / N
        
        For longs: how far above the breakout level
        For shorts: how far below the breakout level
        """
        if signal.atr_n <= 0:
            return 0.0
        
        if signal.direction == SignalDirection.LONG:
            strength = (signal.current_price - signal.entry_ref) / signal.atr_n
        elif signal.direction == SignalDirection.SHORT:
            strength = (signal.entry_ref - signal.current_price) / signal.atr_n
        else:
            return 0.0
        
        return max(0.0, strength)
    
    def _compute_correlation_penalty(
        self,
        symbol: str,
        held_groups: Set[str],
    ) -> float:
        """
        Compute correlation/concentration penalty.
        
        Increases if already holding symbols in the same group.
        """
        group = CORRELATION_GROUPS.get(symbol, "other")
        
        if group in held_groups:
            return 0.5
        
        return 0.0
    
    def _get_held_correlation_groups(
        self, 
        portfolio: Optional[PortfolioState]
    ) -> Set[str]:
        """Get set of correlation groups currently held."""
        if not portfolio or not portfolio.positions:
            return set()
        
        groups = set()
        for pos in portfolio.positions:
            group = CORRELATION_GROUPS.get(pos.symbol, "other")
            groups.add(group)
        
        return groups
    
    def pick_best_signal(
        self,
        scored_signals: List[ScoredSignal],
        max_selection: int = 1,
    ) -> List[ScoredSignal]:
        """
        Pick the best signal(s) from scored list.
        
        MVP behavior: Max 1 new entry per loop.
        Returns empty list if no valid candidates.
        """
        if not scored_signals:
            return []
        
        entry_signals = [
            s for s in scored_signals
            if s.signal.direction in [SignalDirection.LONG, SignalDirection.SHORT]
        ]
        
        exit_signals = [
            s for s in scored_signals
            if s.signal.direction in [SignalDirection.EXIT_LONG, SignalDirection.EXIT_SHORT]
        ]
        
        selected = []
        
        if exit_signals:
            selected.extend(exit_signals)
        
        if entry_signals and len(selected) < max_selection:
            selected.append(entry_signals[0])
        
        return selected[:max_selection]


def score_and_rank_signals(
    signals: List[Signal],
    portfolio: Optional[PortfolioState] = None,
    momentum_data: Optional[Dict[str, float]] = None,
) -> List[ScoredSignal]:
    """
    Convenience function to score and rank signals.
    
    Returns signals sorted by Turtle score (best first).
    """
    scorer = TurtleScorer()
    return scorer.score_signals(signals, portfolio, momentum_data)


def get_best_entry(
    scored_signals: List[ScoredSignal],
) -> Optional[ScoredSignal]:
    """
    Get the single best entry signal.
    
    MVP rule: Only one entry per loop.
    Returns None if no valid entry candidates.
    """
    for scored in scored_signals:
        if scored.signal.direction in [SignalDirection.LONG, SignalDirection.SHORT]:
            return scored
    return None

"""
Opportunity planner for qualified symbols.

Precomputes future trade triggers so ZEKE is never surprised.
Outputs TradeReadinessRecords that the trading loop can read directly.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
import logging

from .schemas import (
    QualifiedSymbol,
    TradeReadinessRecord,
    CorrelationGroup,
)


logger = logging.getLogger(__name__)


class PlannerConfig(BaseModel):
    """Configuration for opportunity planner."""
    stop_atr_multiple: float = Field(
        default=2.0,
        description="Stop distance in ATR multiples"
    )
    max_risk_per_trade_usd: float = Field(
        default=25.0,
        description="Maximum dollars at risk per trade"
    )
    record_validity_hours: int = Field(
        default=24,
        description="Hours before trade readiness record expires"
    )
    default_risk_units: float = Field(
        default=1.0,
        description="Default risk units per trade"
    )


class OpportunityPlanner:
    """
    Precompute trade triggers for qualified symbols.
    
    This creates TradeReadinessRecords that contain all the levels
    needed for the trading loop to make fast, deterministic decisions.
    """
    
    def __init__(self, config: Optional[PlannerConfig] = None):
        self.config = config or PlannerConfig()
    
    def plan(
        self,
        qualified: QualifiedSymbol,
        current_bars: Optional[List[Dict[str, Any]]] = None,
    ) -> TradeReadinessRecord:
        """
        Create a TradeReadinessRecord for a qualified symbol.
        
        Args:
            qualified: Qualified symbol with metrics
            current_bars: Current price bars for level computation
        
        Returns:
            TradeReadinessRecord with all trigger levels
        """
        now = datetime.utcnow()
        valid_until = now + timedelta(hours=self.config.record_validity_hours)
        
        high_20d = qualified.high_20d
        low_20d = qualified.low_20d
        high_55d = qualified.high_55d
        low_55d = qualified.low_55d
        high_10d = qualified.high_10d or high_20d
        low_10d = qualified.low_10d or low_20d
        
        if current_bars and len(current_bars) >= 55:
            high_20d, low_20d = self._compute_channel(current_bars[-20:])
            high_55d, low_55d = self._compute_channel(current_bars[-55:])
            high_10d, low_10d = self._compute_channel(current_bars[-10:])
        
        atr_n = qualified.atr_20
        stop_distance = atr_n * self.config.stop_atr_multiple
        
        if stop_distance > 0:
            max_notional = self.config.max_risk_per_trade_usd / (stop_distance / qualified.last_price)
        else:
            max_notional = self.config.max_risk_per_trade_usd
        
        max_notional = min(max_notional, 25.0)
        
        breakout_strength_s1 = None
        breakout_strength_s2 = None
        if atr_n > 0 and qualified.last_price > high_20d:
            breakout_strength_s1 = (qualified.last_price - high_20d) / atr_n
        if atr_n > 0 and qualified.last_price > high_55d:
            breakout_strength_s2 = (qualified.last_price - high_55d) / atr_n
        
        momentum_per_n = None
        if current_bars and len(current_bars) >= 20 and atr_n > 0:
            closes = [self._get_bar_value(b, "close") for b in current_bars]
            if closes[-20] > 0:
                ret_20d = (closes[-1] - closes[-20]) / closes[-20]
                momentum_per_n = ret_20d / atr_n if atr_n > 0 else 0
        
        return TradeReadinessRecord(
            symbol=qualified.symbol,
            computed_at=now,
            valid_until=valid_until,
            next_long_trigger_s1=high_20d,
            next_long_trigger_s2=high_55d,
            next_short_trigger_s1=low_20d,
            next_short_trigger_s2=low_55d,
            exit_long_s1=low_10d,
            exit_long_s2=low_20d,
            exit_short_s1=high_10d,
            exit_short_s2=high_20d,
            atr_n=atr_n,
            stop_distance_long=stop_distance,
            stop_distance_short=stop_distance,
            max_notional_usd=max_notional,
            risk_units=self.config.default_risk_units,
            system_candidates=self._determine_system_candidates(qualified, high_20d, high_55d),
            correlation_group=qualified.correlation_group,
            breakout_strength_s1=breakout_strength_s1,
            breakout_strength_s2=breakout_strength_s2,
            momentum_per_n=momentum_per_n,
        )
    
    def _compute_channel(self, bars: List[Dict[str, Any]]) -> tuple[float, float]:
        """Compute high/low channel from bars."""
        if not bars:
            return 0.0, 0.0
        
        highs = [self._get_bar_value(b, "high") for b in bars]
        lows = [self._get_bar_value(b, "low") for b in bars]
        
        return max(highs), min(lows)
    
    def _determine_system_candidates(
        self,
        qualified: QualifiedSymbol,
        high_20d: float,
        high_55d: float,
    ) -> List[str]:
        """Determine which Turtle systems can trade this symbol."""
        systems = []
        
        if qualified.last_price > high_20d:
            systems.append("S1")
        if qualified.last_price > high_55d:
            systems.append("S2")
        
        if not systems:
            systems = ["S1", "S2"]
        
        return systems
    
    def _get_bar_value(self, bar: Any, field: str) -> float:
        """Extract value from bar dict or object."""
        if isinstance(bar, dict):
            return bar.get(field, 0.0)
        return getattr(bar, field, 0.0)


def plan_opportunities(
    qualified_symbols: List[QualifiedSymbol],
    config: Optional[PlannerConfig] = None,
    market_data: Optional[Dict[str, List[Dict[str, Any]]]] = None,
) -> List[TradeReadinessRecord]:
    """
    Create trade readiness records for all qualified symbols.
    
    Args:
        qualified_symbols: List of qualified symbols
        config: Planner configuration
        market_data: Dict of symbol -> current price bars
    
    Returns:
        List of TradeReadinessRecords
    """
    planner = OpportunityPlanner(config)
    market_data = market_data or {}
    
    records = []
    for qualified in qualified_symbols:
        if qualified.qualification_status.value != "qualified":
            continue
        
        bars = market_data.get(qualified.symbol)
        record = planner.plan(qualified, bars)
        records.append(record)
    
    return records

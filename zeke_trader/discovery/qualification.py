"""
Qualification gate for discovery candidates.

Determines if a symbol is WORTH WATCHING, not trading.
This stage is DETERMINISTIC - no AI reasoning allowed.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
import logging

from .schemas import (
    DiscoveryCandidate,
    QualifiedSymbol,
    QualificationStatus,
    CorrelationGroup,
    ScanType,
)


logger = logging.getLogger(__name__)


class QualificationConfig(BaseModel):
    """Configuration for qualification gate."""
    min_atr_expansion: float = Field(
        default=1.2,
        description="Minimum ATR expansion ratio to show volatility awakening"
    )
    max_whipsaw_rate: float = Field(
        default=0.4,
        description="Maximum false breakout rate (0-1, lower is better)"
    )
    min_trend_strength: float = Field(
        default=0.3,
        description="Minimum trend consistency score (0-1)"
    )
    min_range_breakout: float = Field(
        default=0.02,
        description="Minimum % beyond medium-term range"
    )
    lookback_days: int = Field(
        default=60,
        description="Days to look back for trend/whipsaw analysis"
    )


SECTOR_MAP: Dict[str, CorrelationGroup] = {
    "AAPL": CorrelationGroup.TECH,
    "MSFT": CorrelationGroup.TECH,
    "GOOGL": CorrelationGroup.TECH,
    "GOOG": CorrelationGroup.TECH,
    "AMZN": CorrelationGroup.CONSUMER,
    "NVDA": CorrelationGroup.TECH,
    "META": CorrelationGroup.COMMUNICATION,
    "TSLA": CorrelationGroup.CONSUMER,
    "AMD": CorrelationGroup.TECH,
    "AVGO": CorrelationGroup.TECH,
    "NFLX": CorrelationGroup.COMMUNICATION,
    "CRM": CorrelationGroup.TECH,
    "ADBE": CorrelationGroup.TECH,
    "ORCL": CorrelationGroup.TECH,
    "JPM": CorrelationGroup.FINANCE,
    "BAC": CorrelationGroup.FINANCE,
    "WFC": CorrelationGroup.FINANCE,
    "GS": CorrelationGroup.FINANCE,
    "MS": CorrelationGroup.FINANCE,
    "XOM": CorrelationGroup.ENERGY,
    "CVX": CorrelationGroup.ENERGY,
    "COP": CorrelationGroup.ENERGY,
    "JNJ": CorrelationGroup.HEALTHCARE,
    "UNH": CorrelationGroup.HEALTHCARE,
    "PFE": CorrelationGroup.HEALTHCARE,
    "MRK": CorrelationGroup.HEALTHCARE,
    "SPY": CorrelationGroup.INDEX,
    "QQQ": CorrelationGroup.INDEX,
    "IWM": CorrelationGroup.INDEX,
    "DIA": CorrelationGroup.INDEX,
}


class QualificationGate:
    """
    Determine if symbols are worth watching.
    
    Qualification criteria:
    1. Sustained ATR expansion (volatility awakening)
    2. Clean historical breakouts (few whipsaws)
    3. Trend structure consistency
    4. Price holding beyond medium-term ranges
    
    All checks are DETERMINISTIC - no LLM involvement.
    """
    
    def __init__(self, config: Optional[QualificationConfig] = None):
        self.config = config or QualificationConfig()
    
    def qualify(
        self,
        candidate: DiscoveryCandidate,
        historical_bars: Optional[List[Dict[str, Any]]] = None,
    ) -> QualifiedSymbol:
        """
        Run qualification checks on a candidate.
        
        Args:
            candidate: Discovery candidate to qualify
            historical_bars: Historical price bars for analysis
        
        Returns:
            QualifiedSymbol with qualification status
        """
        status = QualificationStatus.QUALIFIED
        notes = []
        
        atr_expansion = candidate.atr_expansion_ratio or 1.0
        if atr_expansion < self.config.min_atr_expansion:
            status = QualificationStatus.REJECTED_ATR
            notes.append(f"ATR expansion {atr_expansion:.2f} < {self.config.min_atr_expansion}")
        
        whipsaw_score = 0.0
        trend_strength = 0.5
        breakout_cleanness = 0.5
        
        if historical_bars and len(historical_bars) >= 20:
            whipsaw_score = self._calculate_whipsaw_score(historical_bars)
            trend_strength = self._calculate_trend_strength(historical_bars)
            breakout_cleanness = self._calculate_breakout_cleanness(historical_bars)
            
            if status == QualificationStatus.QUALIFIED:
                if whipsaw_score > self.config.max_whipsaw_rate:
                    status = QualificationStatus.REJECTED_WHIPSAW
                    notes.append(f"Whipsaw score {whipsaw_score:.2f} > {self.config.max_whipsaw_rate}")
                elif trend_strength < self.config.min_trend_strength:
                    status = QualificationStatus.REJECTED_TREND
                    notes.append(f"Trend strength {trend_strength:.2f} < {self.config.min_trend_strength}")
        
        if status == QualificationStatus.QUALIFIED:
            if not self._check_range_breakout(candidate):
                status = QualificationStatus.REJECTED_RANGE
                notes.append("Price not holding beyond medium-term range")
        
        dollar_volume = candidate.dollar_volume_avg or 0.0
        if dollar_volume == 0 and candidate.volume_avg_20d and candidate.last_price:
            dollar_volume = candidate.volume_avg_20d * candidate.last_price
        
        correlation_group = self._get_correlation_group(candidate.symbol)
        
        return QualifiedSymbol(
            symbol=candidate.symbol,
            qualification_status=status,
            last_price=candidate.last_price,
            atr_20=candidate.atr_20 or 0.0,
            atr_expansion_ratio=atr_expansion,
            high_20d=candidate.high_20d or candidate.last_price,
            low_20d=candidate.low_20d or candidate.last_price,
            high_55d=candidate.high_55d or candidate.high_20d or candidate.last_price,
            low_55d=candidate.low_55d or candidate.low_20d or candidate.last_price,
            trend_strength=trend_strength,
            whipsaw_score=whipsaw_score,
            breakout_cleanness=breakout_cleanness,
            volume_avg_20d=candidate.volume_avg_20d or 0.0,
            dollar_volume_avg=dollar_volume,
            correlation_group=correlation_group,
            scan_sources=[candidate.scan_type],
            notes="; ".join(notes) if notes else None,
        )
    
    def _calculate_whipsaw_score(self, bars: List[Dict[str, Any]]) -> float:
        """
        Calculate historical false breakout rate.
        
        Counts how often price breaks above/below recent range
        only to reverse within a few days.
        
        Returns: 0.0 (clean) to 1.0 (choppy)
        """
        if len(bars) < 25:
            return 0.3
        
        closes = [self._get_bar_value(b, "close") for b in bars]
        highs = [self._get_bar_value(b, "high") for b in bars]
        lows = [self._get_bar_value(b, "low") for b in bars]
        
        false_breakouts = 0
        total_breakouts = 0
        
        for i in range(20, len(bars)):
            range_high = max(highs[i-20:i])
            range_low = min(lows[i-20:i])
            
            if closes[i] > range_high:
                total_breakouts += 1
                if i + 5 < len(bars):
                    future_low = min(closes[i+1:i+5])
                    if future_low < range_high:
                        false_breakouts += 1
            
            elif closes[i] < range_low:
                total_breakouts += 1
                if i + 5 < len(bars):
                    future_high = max(closes[i+1:i+5])
                    if future_high > range_low:
                        false_breakouts += 1
        
        if total_breakouts == 0:
            return 0.3
        
        return false_breakouts / total_breakouts
    
    def _calculate_trend_strength(self, bars: List[Dict[str, Any]]) -> float:
        """
        Calculate trend consistency score.
        
        Measures how consistently price moves in one direction
        using linear regression R-squared.
        
        Returns: 0.0 (choppy) to 1.0 (strong trend)
        """
        if len(bars) < 10:
            return 0.5
        
        closes = [self._get_bar_value(b, "close") for b in bars[-20:]]
        n = len(closes)
        
        x_mean = (n - 1) / 2
        y_mean = sum(closes) / n
        
        numerator = sum((i - x_mean) * (closes[i] - y_mean) for i in range(n))
        denominator = sum((i - x_mean) ** 2 for i in range(n))
        
        if denominator == 0:
            return 0.5
        
        slope = numerator / denominator
        intercept = y_mean - slope * x_mean
        
        ss_res = sum((closes[i] - (slope * i + intercept)) ** 2 for i in range(n))
        ss_tot = sum((closes[i] - y_mean) ** 2 for i in range(n))
        
        if ss_tot == 0:
            return 0.5
        
        r_squared = 1 - (ss_res / ss_tot)
        return max(0.0, min(1.0, r_squared))
    
    def _calculate_breakout_cleanness(self, bars: List[Dict[str, Any]]) -> float:
        """
        Calculate how clean past breakouts were.
        
        Measures the follow-through after breakouts.
        
        Returns: 0.0 (poor follow-through) to 1.0 (excellent)
        """
        if len(bars) < 25:
            return 0.5
        
        closes = [self._get_bar_value(b, "close") for b in bars]
        highs = [self._get_bar_value(b, "high") for b in bars]
        
        follow_through_scores = []
        
        for i in range(20, min(len(bars), 55)):
            range_high = max(highs[i-20:i])
            
            if closes[i] > range_high:
                if i + 10 < len(bars):
                    extension = max(closes[i+1:i+10]) - closes[i]
                    if closes[i] > 0:
                        follow_through_scores.append(extension / closes[i])
        
        if not follow_through_scores:
            return 0.5
        
        avg_follow_through = sum(follow_through_scores) / len(follow_through_scores)
        normalized = max(0.0, min(1.0, avg_follow_through * 10 + 0.5))
        return normalized
    
    def _check_range_breakout(self, candidate: DiscoveryCandidate) -> bool:
        """Check if price is holding beyond medium-term range."""
        if candidate.high_20d is None or candidate.low_20d is None:
            return True
        
        range_size = candidate.high_20d - candidate.low_20d
        if range_size <= 0:
            return True
        
        distance_above = candidate.last_price - candidate.high_20d
        distance_below = candidate.low_20d - candidate.last_price
        
        if distance_above > 0:
            return (distance_above / candidate.last_price) >= self.config.min_range_breakout
        elif distance_below > 0:
            return (distance_below / candidate.last_price) >= self.config.min_range_breakout
        
        return False
    
    def _get_correlation_group(self, symbol: str) -> CorrelationGroup:
        """Get the correlation/sector group for a symbol."""
        return SECTOR_MAP.get(symbol, CorrelationGroup.OTHER)
    
    def _get_bar_value(self, bar: Any, field: str) -> float:
        """Extract value from bar dict or object."""
        if isinstance(bar, dict):
            return bar.get(field, 0.0)
        return getattr(bar, field, 0.0)


def qualify_candidates(
    candidates: List[DiscoveryCandidate],
    config: Optional[QualificationConfig] = None,
    historical_data: Optional[Dict[str, List[Dict[str, Any]]]] = None,
) -> List[QualifiedSymbol]:
    """
    Qualify a list of candidates.
    
    Args:
        candidates: List of discovery candidates
        config: Qualification configuration
        historical_data: Dict of symbol -> historical bars
    
    Returns:
        List of QualifiedSymbol (includes both passed and failed)
    """
    gate = QualificationGate(config)
    historical_data = historical_data or {}
    
    qualified = []
    for candidate in candidates:
        bars = historical_data.get(candidate.symbol)
        result = gate.qualify(candidate, bars)
        qualified.append(result)
    
    return qualified

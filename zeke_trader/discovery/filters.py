"""
Hard filters for discovery candidates.

Immediately REJECT any symbol that fails these criteria.
If a symbol fails ANY filter, it does not exist for trading purposes.
"""
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from pydantic import BaseModel, Field

from .schemas import (
    DiscoveryCandidate,
    FilterResult,
    FilterReason,
)


class FilterConfig(BaseModel):
    """Configuration for hard filters."""
    min_avg_dollar_volume: float = Field(
        default=1_000_000.0,
        description="Minimum average daily dollar volume"
    )
    min_price: float = Field(
        default=5.0,
        description="Minimum stock price"
    )
    max_spread_percent: float = Field(
        default=0.5,
        description="Maximum bid-ask spread as percentage of price"
    )
    min_trading_days: int = Field(
        default=60,
        description="Minimum trading days of history required"
    )
    max_data_age_hours: float = Field(
        default=24.0,
        description="Maximum age of data before considered stale"
    )


class HardFilters:
    """
    Apply hard rejection filters to discovery candidates.
    
    This is deterministic - no AI reasoning. A symbol either passes or fails.
    """
    
    def __init__(self, config: Optional[FilterConfig] = None):
        self.config = config or FilterConfig()
    
    def apply_all(
        self, 
        candidate: DiscoveryCandidate,
        spread_percent: Optional[float] = None,
        trading_days: Optional[int] = None,
        is_halted: bool = False,
        has_corporate_action: bool = False,
        data_timestamp: Optional[datetime] = None,
    ) -> FilterResult:
        """
        Apply all hard filters to a candidate.
        Returns FilterResult with pass/fail and reason.
        """
        result = FilterResult(
            symbol=candidate.symbol,
            passed=True,
            reason=FilterReason.PASSED,
        )
        
        if is_halted:
            return FilterResult(
                symbol=candidate.symbol,
                passed=False,
                reason=FilterReason.HALTED,
                details="Symbol is halted from trading"
            )
        
        if has_corporate_action:
            return FilterResult(
                symbol=candidate.symbol,
                passed=False,
                reason=FilterReason.CORPORATE_ACTION,
                details="Symbol has pending corporate action"
            )
        
        if not self._check_volume(candidate):
            result.passed = False
            result.reason = FilterReason.INSUFFICIENT_VOLUME
            result.volume_check = False
            result.details = f"Dollar volume {candidate.dollar_volume_avg} < {self.config.min_avg_dollar_volume}"
            return result
        
        if not self._check_price(candidate):
            result.passed = False
            result.reason = FilterReason.PRICE_TOO_LOW
            result.price_check = False
            result.details = f"Price {candidate.last_price} < {self.config.min_price}"
            return result
        
        if spread_percent is not None:
            if not self._check_spread(spread_percent):
                result.passed = False
                result.reason = FilterReason.SPREAD_TOO_WIDE
                result.spread_check = False
                result.details = f"Spread {spread_percent:.2f}% > {self.config.max_spread_percent}%"
                return result
        
        if trading_days is not None:
            if not self._check_history(trading_days):
                result.passed = False
                result.reason = FilterReason.INSUFFICIENT_HISTORY
                result.history_check = False
                result.details = f"History {trading_days} days < {self.config.min_trading_days}"
                return result
        
        if data_timestamp is not None:
            if not self._check_data_freshness(data_timestamp):
                result.passed = False
                result.reason = FilterReason.STALE_DATA
                result.data_quality_check = False
                result.details = f"Data older than {self.config.max_data_age_hours} hours"
                return result
        
        if not self._check_data_quality(candidate):
            result.passed = False
            result.reason = FilterReason.DATA_QUALITY
            result.data_quality_check = False
            result.details = "Missing required data fields"
            return result
        
        result.filter_timestamp = datetime.utcnow()
        return result
    
    def _check_volume(self, candidate: DiscoveryCandidate) -> bool:
        """Check if dollar volume meets minimum threshold."""
        if candidate.dollar_volume_avg is None:
            if candidate.volume_avg_20d and candidate.last_price:
                dollar_vol = candidate.volume_avg_20d * candidate.last_price
                return dollar_vol >= self.config.min_avg_dollar_volume
            return False
        return candidate.dollar_volume_avg >= self.config.min_avg_dollar_volume
    
    def _check_price(self, candidate: DiscoveryCandidate) -> bool:
        """Check if price meets minimum threshold."""
        return candidate.last_price >= self.config.min_price
    
    def _check_spread(self, spread_percent: float) -> bool:
        """Check if spread is within acceptable range."""
        return spread_percent <= self.config.max_spread_percent
    
    def _check_history(self, trading_days: int) -> bool:
        """Check if symbol has sufficient trading history."""
        return trading_days >= self.config.min_trading_days
    
    def _check_data_freshness(self, data_timestamp: datetime) -> bool:
        """Check if data is fresh enough."""
        age = datetime.utcnow() - data_timestamp
        max_age = timedelta(hours=self.config.max_data_age_hours)
        return age <= max_age
    
    def _check_data_quality(self, candidate: DiscoveryCandidate) -> bool:
        """Check if all required data fields are present and valid."""
        if candidate.last_price <= 0:
            return False
        if candidate.atr_20 is None or candidate.atr_20 <= 0:
            return False
        return True


def filter_candidates(
    candidates: list[DiscoveryCandidate],
    config: Optional[FilterConfig] = None,
    additional_data: Optional[Dict[str, Dict[str, Any]]] = None,
) -> tuple[list[DiscoveryCandidate], list[FilterResult]]:
    """
    Filter a list of candidates and return passed/failed results.
    
    Args:
        candidates: List of discovery candidates
        config: Filter configuration
        additional_data: Dict of symbol -> extra data (spread, trading_days, etc)
    
    Returns:
        Tuple of (passed_candidates, all_filter_results)
    """
    filters = HardFilters(config)
    additional_data = additional_data or {}
    
    passed = []
    results = []
    
    for candidate in candidates:
        extra = additional_data.get(candidate.symbol, {})
        
        result = filters.apply_all(
            candidate,
            spread_percent=extra.get("spread_percent"),
            trading_days=extra.get("trading_days"),
            is_halted=extra.get("is_halted", False),
            has_corporate_action=extra.get("has_corporate_action", False),
            data_timestamp=extra.get("data_timestamp"),
        )
        
        results.append(result)
        
        if result.passed:
            passed.append(candidate)
    
    return passed, results

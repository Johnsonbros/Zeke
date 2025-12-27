"""
Discovery system schemas.

These define the data structures for the ticker discovery and qualification pipeline.
All schemas are designed for deterministic processing - no AI/LLM reasoning in schema logic.
"""
from enum import Enum
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class CorrelationGroup(str, Enum):
    """Sector/correlation groupings for diversification."""
    TECH = "tech"
    FINANCE = "finance"
    HEALTHCARE = "healthcare"
    CONSUMER = "consumer"
    INDUSTRIAL = "industrial"
    ENERGY = "energy"
    UTILITIES = "utilities"
    MATERIALS = "materials"
    REAL_ESTATE = "real_estate"
    COMMUNICATION = "communication"
    INDEX = "index"
    OTHER = "other"


class ScanType(str, Enum):
    """Types of universe scans."""
    NEW_20_DAY_HIGH = "new_20_day_high"
    NEW_55_DAY_HIGH = "new_55_day_high"
    NEW_20_DAY_LOW = "new_20_day_low"
    NEW_55_DAY_LOW = "new_55_day_low"
    ATR_EXPANSION = "atr_expansion"
    TOP_GAINER_1D = "top_gainer_1d"
    TOP_GAINER_5D = "top_gainer_5d"
    TOP_GAINER_20D = "top_gainer_20d"
    TOP_LOSER_1D = "top_loser_1d"
    TOP_LOSER_5D = "top_loser_5d"
    TOP_LOSER_20D = "top_loser_20d"
    INDEX_CONSTITUENT = "index_constituent"


class FilterReason(str, Enum):
    """Reasons for rejecting a symbol in filters."""
    INSUFFICIENT_VOLUME = "insufficient_volume"
    PRICE_TOO_LOW = "price_too_low"
    SPREAD_TOO_WIDE = "spread_too_wide"
    INSUFFICIENT_HISTORY = "insufficient_history"
    STALE_DATA = "stale_data"
    CORPORATE_ACTION = "corporate_action"
    HALTED = "halted"
    DATA_QUALITY = "data_quality"
    PASSED = "passed"


class QualificationStatus(str, Enum):
    """Qualification gate results."""
    QUALIFIED = "qualified"
    REJECTED_ATR = "rejected_atr"
    REJECTED_WHIPSAW = "rejected_whipsaw"
    REJECTED_TREND = "rejected_trend"
    REJECTED_RANGE = "rejected_range"
    PENDING = "pending"


class DiscoveryCandidate(BaseModel):
    """
    Raw candidate from universe scan.
    This is the first stage - unfiltered discovery.
    """
    symbol: str
    scan_type: ScanType
    scan_timestamp: datetime = Field(default_factory=datetime.utcnow)
    
    last_price: float
    volume_avg_20d: Optional[float] = None
    dollar_volume_avg: Optional[float] = None
    
    high_20d: Optional[float] = None
    low_20d: Optional[float] = None
    high_55d: Optional[float] = None
    low_55d: Optional[float] = None
    
    atr_20: Optional[float] = None
    atr_expansion_ratio: Optional[float] = Field(
        default=None,
        description="Current ATR / 20-day average ATR - expansion > 1.0"
    )
    
    return_1d: Optional[float] = None
    return_5d: Optional[float] = None
    return_20d: Optional[float] = None
    
    raw_data: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional raw data from scan"
    )
    
    class Config:
        use_enum_values = True


class FilterResult(BaseModel):
    """Result of applying hard filters to a candidate."""
    symbol: str
    passed: bool
    reason: FilterReason
    details: Optional[str] = None
    
    volume_check: bool = True
    price_check: bool = True
    spread_check: bool = True
    history_check: bool = True
    data_quality_check: bool = True
    
    filter_timestamp: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        use_enum_values = True


class QualifiedSymbol(BaseModel):
    """
    Symbol that passed qualification gate.
    Eligible for the trading watchlist.
    """
    symbol: str
    qualified_at: datetime = Field(default_factory=datetime.utcnow)
    qualification_status: QualificationStatus = QualificationStatus.QUALIFIED
    
    last_price: float
    atr_20: float
    atr_expansion_ratio: float = Field(
        default=1.0,
        description="ATR expansion vs 20-day average"
    )
    
    high_20d: float
    low_20d: float
    high_55d: float
    low_55d: float
    high_10d: Optional[float] = None
    low_10d: Optional[float] = None
    
    trend_strength: float = Field(
        default=0.0,
        description="Trend consistency score 0-1"
    )
    whipsaw_score: float = Field(
        default=0.0,
        description="Historical false breakout rate 0-1 (lower is better)"
    )
    breakout_cleanness: float = Field(
        default=0.0,
        description="How clean past breakouts were 0-1"
    )
    
    volume_avg_20d: float
    dollar_volume_avg: float
    
    correlation_group: CorrelationGroup = CorrelationGroup.OTHER
    
    scan_sources: List[ScanType] = Field(
        default_factory=list,
        description="Which scans found this symbol"
    )
    
    notes: Optional[str] = None
    
    class Config:
        use_enum_values = True


class TradeReadinessRecord(BaseModel):
    """
    Precomputed trade trigger levels for a qualified symbol.
    This is what the trading loop reads - no computation needed.
    """
    symbol: str
    computed_at: datetime = Field(default_factory=datetime.utcnow)
    valid_until: datetime = Field(
        description="Record expires and needs recomputation"
    )
    
    next_long_trigger_s1: float = Field(
        description="S1 long entry = 20-day high breakout"
    )
    next_long_trigger_s2: float = Field(
        description="S2 long entry = 55-day high breakout"
    )
    next_short_trigger_s1: float = Field(
        description="S1 short entry = 20-day low breakout"
    )
    next_short_trigger_s2: float = Field(
        description="S2 short entry = 55-day low breakout"
    )
    
    exit_long_s1: float = Field(
        description="S1 long exit = 10-day low"
    )
    exit_long_s2: float = Field(
        description="S2 long exit = 20-day low"
    )
    exit_short_s1: float = Field(
        description="S1 short exit = 10-day high"
    )
    exit_short_s2: float = Field(
        description="S2 short exit = 20-day high"
    )
    
    atr_n: float = Field(description="ATR(20) = N for sizing/stops")
    stop_distance_long: float = Field(description="2N below entry for longs")
    stop_distance_short: float = Field(description="2N above entry for shorts")
    
    max_notional_usd: float = Field(
        description="Max dollar amount for this symbol based on risk"
    )
    risk_units: float = Field(
        default=1.0,
        description="Risk units this trade would consume"
    )
    
    system_candidates: List[str] = Field(
        default_factory=lambda: ["S1", "S2"],
        description="Which systems can trade this symbol"
    )
    
    correlation_group: CorrelationGroup = CorrelationGroup.OTHER
    
    breakout_strength_s1: Optional[float] = Field(
        default=None,
        description="Distance beyond S1 breakout / N"
    )
    breakout_strength_s2: Optional[float] = Field(
        default=None,
        description="Distance beyond S2 breakout / N"
    )
    momentum_per_n: Optional[float] = Field(
        default=None,
        description="20-day return / N for ranking"
    )
    
    class Config:
        use_enum_values = True


class ScanResult(BaseModel):
    """Complete result from a universe scan run."""
    scan_id: str = Field(default_factory=lambda: datetime.utcnow().strftime("%Y%m%d_%H%M%S"))
    scan_timestamp: datetime = Field(default_factory=datetime.utcnow)
    scan_types: List[ScanType]
    
    candidates_found: int = 0
    candidates: List[DiscoveryCandidate] = Field(default_factory=list)
    
    filter_results: List[FilterResult] = Field(default_factory=list)
    candidates_passed_filter: int = 0
    candidates_rejected: int = 0
    
    qualified_symbols: List[QualifiedSymbol] = Field(default_factory=list)
    
    duration_seconds: float = 0.0
    errors: List[str] = Field(default_factory=list)
    
    class Config:
        use_enum_values = True


class WatchlistState(BaseModel):
    """Current state of the three-tier watchlist system."""
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    discovery_pool: List[str] = Field(
        default_factory=list,
        description="Raw scan results - symbols under consideration"
    )
    
    qualified_watchlist: List[str] = Field(
        default_factory=list,
        description="Symbols eligible for signals - trading loop reads this"
    )
    
    active_trading_set: List[str] = Field(
        default_factory=list,
        description="Symbols currently being traded"
    )
    
    readiness_records: Dict[str, TradeReadinessRecord] = Field(
        default_factory=dict,
        description="Precomputed trade triggers by symbol"
    )
    
    last_scan_id: Optional[str] = None
    
    class Config:
        use_enum_values = True

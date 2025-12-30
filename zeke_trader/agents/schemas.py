"""
Pydantic schemas for the trading agent system.
"""
from enum import Enum
from typing import Optional, List, Dict, Any, Union
from datetime import datetime
from pydantic import BaseModel, Field
import uuid


class AutonomyTier(str, Enum):
    MANUAL = "manual"
    MODERATE = "moderate"
    FULL_AGENTIC = "full_agentic"


class SignalDirection(str, Enum):
    LONG = "long"
    SHORT = "short"
    EXIT_LONG = "exit_long"
    EXIT_SHORT = "exit_short"


class TurtleSystem(int, Enum):
    SYSTEM_1 = 20
    SYSTEM_2 = 55


class Signal(BaseModel):
    """Deterministic signal from Turtle strategy."""
    symbol: str
    direction: SignalDirection
    system: TurtleSystem
    entry_ref: float = Field(description="Reference price for entry (breakout level)")
    current_price: float
    atr_n: float = Field(description="ATR(20) - used for position sizing and stops")
    stop_price: float = Field(description="Initial stop = entry - 2N for longs")
    exit_ref: float = Field(description="Exit breakout level (10-day for S1, 20-day for S2)")
    score_hint: float = Field(default=0.0, description="Signal strength 0-1")
    reason: str = Field(description="Human-readable reason for signal")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    volume_confirmed: Optional[bool] = Field(default=None, description="Volume > 1.5x 20-day avg")
    trend_aligned: Optional[bool] = Field(default=None, description="Price aligned with 50/200 MA")
    filters_passed: bool = Field(default=True, description="Whether all enabled filters passed")
    filter_notes: List[str] = Field(default_factory=list, description="Filter status notes")
    
    class Config:
        use_enum_values = True


class MarketRegime(str, Enum):
    """Market regime classification."""
    TREND = "trend"
    NEUTRAL = "neutral"
    VOLATILE = "volatile"


class Thesis(BaseModel):
    """Structured thesis explaining why a trade was selected."""
    summary: str = Field(description="Human-readable summary of the trade rationale")
    system: str = Field(description="S1 or S2")
    breakout_days: int = Field(description="20 or 55")
    atr_n: float = Field(description="ATR(20) value used for sizing/stops")
    stop_n: float = Field(default=2.0, description="Stop distance in ATR multiples")
    signal_score: float = Field(description="Signal strength 0-1")
    portfolio_fit: str = Field(description="How this trade fits the portfolio")
    regime: MarketRegime = Field(default=MarketRegime.NEUTRAL, description="Current market regime")
    
    class Config:
        use_enum_values = True


class ExitReason(BaseModel):
    """Structured reason for exiting a position."""
    type: str = Field(description="stop_hit, system_exit, manual")
    rule: str = Field(description="Description of the exit rule triggered")
    price: float = Field(description="Exit price")
    pnl_usd: float = Field(description="Realized P&L in USD")
    pnl_percent: float = Field(default=0.0, description="Realized P&L as percentage")
    hold_duration_hours: Optional[float] = Field(default=None, description="How long position was held")


class TradeIntent(BaseModel):
    """Intention to make a trade (from DecisionAgent)."""
    action: str = "trade"
    symbol: str
    side: str = Field(description="buy or sell")
    notional_usd: float = Field(description="Dollar amount to trade")
    signal: Optional[Signal] = Field(default=None, description="The signal this trade is based on")
    stop_price: float = Field(description="Stop loss price locked at entry")
    exit_trigger: float = Field(description="Exit level locked at entry")
    reason: str = Field(description="Why this trade was chosen")
    thesis: Optional[Thesis] = Field(default=None, description="Structured thesis for the trade")
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    
    class Config:
        use_enum_values = True


class NoTrade(BaseModel):
    """Decision to not trade."""
    action: str = "no_trade"
    reason: str
    signals_considered: int = Field(default=0)


Decision = Union[TradeIntent, NoTrade]


class RiskResult(BaseModel):
    """Output from RiskGateAgent."""
    allowed: bool
    notes: List[str] = Field(default_factory=list)
    original_decision: Decision
    final_decision: Decision = Field(description="May be modified (e.g., sized down)")
    violations: List[str] = Field(default_factory=list)
    
    class Config:
        use_enum_values = True


class Position(BaseModel):
    """Current position in portfolio."""
    symbol: str
    qty: float
    avg_entry_price: float
    market_value: float
    unrealized_pl: float
    unrealized_plpc: float
    entry_criteria: Optional[Dict[str, Any]] = Field(
        default=None, 
        description="Stored entry criteria (stop, exit levels, system) for systematic exits"
    )


class PortfolioState(BaseModel):
    """Current portfolio state from PortfolioAgent."""
    equity: float
    cash: float
    buying_power: float
    positions: List[Position] = Field(default_factory=list)
    open_orders: List[Dict[str, Any]] = Field(default_factory=list)
    trades_today: int = 0
    pnl_day: float = 0.0
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class BarData(BaseModel):
    """OHLCV bar data."""
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int


class QuoteData(BaseModel):
    """Latest quote for a symbol."""
    symbol: str
    bid: float
    ask: float
    last: float
    timestamp: datetime


class SymbolData(BaseModel):
    """Market data for a single symbol."""
    symbol: str
    bars: List[BarData] = Field(default_factory=list)
    quote: Optional[QuoteData] = None
    atr_20: Optional[float] = None
    high_20: Optional[float] = None
    low_20: Optional[float] = None
    high_55: Optional[float] = None
    low_55: Optional[float] = None
    high_10: Optional[float] = None
    low_10: Optional[float] = None
    volume_avg_20: Optional[float] = None
    current_volume: Optional[int] = None
    sma_50: Optional[float] = None
    sma_200: Optional[float] = None
    trend_aligned: Optional[bool] = None
    volume_confirmed: Optional[bool] = None


class MarketSnapshot(BaseModel):
    """Complete market data snapshot from MarketDataAgent."""
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    market_data: Dict[str, SymbolData] = Field(default_factory=dict)
    is_market_open: bool = False
    data_available: bool = True
    errors: List[str] = Field(default_factory=list)


class OrderResult(BaseModel):
    """Result from ExecutionAgent."""
    executed: bool
    order_id: Optional[str] = None
    symbol: Optional[str] = None
    side: Optional[str] = None
    qty: Optional[float] = None
    notional: Optional[float] = None
    status: str = Field(description="filled, pending, rejected, skipped, queued_for_approval")
    message: str = ""
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class PendingTradeStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"
    EXECUTED = "executed"


class PendingTrade(BaseModel):
    """Trade awaiting user approval."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    trade_intent: TradeIntent
    portfolio_state: PortfolioState
    risk_result: RiskResult
    status: PendingTradeStatus = PendingTradeStatus.PENDING
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime = Field(description="Trade expires after market conditions change")
    approved_at: Optional[datetime] = None
    rejected_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    execution_result: Optional[OrderResult] = None
    
    class Config:
        use_enum_values = True


class LoopResult(BaseModel):
    """Complete result from one orchestrator loop."""
    loop_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    market_snapshot: MarketSnapshot
    signals: List[Signal] = Field(default_factory=list)
    portfolio_state: PortfolioState
    decision: Decision
    risk_result: Optional[RiskResult] = None
    order_result: Optional[OrderResult] = None
    pending_trade: Optional[PendingTrade] = None
    perplexity_research: Optional[Dict[str, Any]] = Field(default=None, description="Research insights for high-impact signals")
    duration_ms: float = 0.0
    errors: List[str] = Field(default_factory=list)
    
    class Config:
        use_enum_values = True


class PositionStatus(str, Enum):
    """Status of a tracked position."""
    OPEN = "open"
    CLOSING = "closing"
    CLOSED = "closed"


class PositionState(BaseModel):
    """
    Turtle-specific position tracking state.
    
    Stores all entry criteria and exit levels for systematic management.
    Every open position must have a PositionState record.
    """
    symbol: str
    entry_time: datetime = Field(default_factory=datetime.utcnow)
    entry_price: float
    system_used: str = Field(description="S1 or S2")
    n_at_entry: float = Field(description="ATR(20) at entry time")
    
    stop_price: float = Field(description="Hard stop price - entry - 2N for longs, entry + 2N for shorts")
    exit_channel_level: float = Field(description="System exit level - 10-day low (S1) or 20-day low (S2) for longs")
    
    side: str = Field(description="long or short")
    qty: float
    notional_usd: float
    
    highest_close_since_entry: Optional[float] = Field(
        default=None,
        description="For trailing stop implementation (optional)"
    )
    lowest_close_since_entry: Optional[float] = Field(
        default=None,
        description="For trailing stop implementation (optional)"
    )
    
    status: PositionStatus = PositionStatus.OPEN
    
    thesis: Optional[Thesis] = None
    
    last_update_ts: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        use_enum_values = True
    
    def is_stop_hit(self, current_price: float) -> bool:
        """Check if hard stop is hit based on position side."""
        if self.side == "long":
            return current_price <= self.stop_price
        else:
            return current_price >= self.stop_price
    
    def is_exit_triggered(self, current_price: float) -> bool:
        """Check if system exit is triggered based on position side."""
        if self.side == "long":
            return current_price < self.exit_channel_level
        else:
            return current_price > self.exit_channel_level
    
    def update_extremes(self, current_close: float):
        """Update highest/lowest close since entry."""
        if self.side == "long":
            if self.highest_close_since_entry is None or current_close > self.highest_close_since_entry:
                self.highest_close_since_entry = current_close
        else:
            if self.lowest_close_since_entry is None or current_close < self.lowest_close_since_entry:
                self.lowest_close_since_entry = current_close
        self.last_update_ts = datetime.utcnow()


class ScoredSignal(BaseModel):
    """
    Signal with deterministic Turtle ranking score.
    
    Score formula from Turtle Directives:
    score = 3.0*(breakout_strength) + 1.0*(system_bonus) + 1.0*(mom_per_N) - 1.0*(correlation_penalty)
    """
    signal: Signal
    breakout_strength: float = Field(
        default=0.0,
        description="(price - breakout_level) / N for longs"
    )
    system_bonus: float = Field(
        default=0.0,
        description="1.0 if S2 (55-day), 0.0 if S1 (20-day)"
    )
    momentum_per_n: float = Field(
        default=0.0,
        description="20-day return / N"
    )
    correlation_penalty: float = Field(
        default=0.0,
        description="Increases if already holding similar exposures"
    )
    
    @property
    def total_score(self) -> float:
        """Calculate total Turtle ranking score."""
        return (
            3.0 * self.breakout_strength +
            1.0 * self.system_bonus +
            1.0 * self.momentum_per_n -
            1.0 * self.correlation_penalty
        )
    
    class Config:
        use_enum_values = True

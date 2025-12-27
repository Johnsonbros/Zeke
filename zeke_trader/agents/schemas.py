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
    risk_result: RiskResult
    order_result: Optional[OrderResult] = None
    pending_trade: Optional[PendingTrade] = None
    duration_ms: float = 0.0
    errors: List[str] = Field(default_factory=list)
    
    class Config:
        use_enum_values = True

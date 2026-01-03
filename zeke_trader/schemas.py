"""
Pydantic schemas for trade decisions - strict contract between agent and execution.
"""
from typing import Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator


class NoTrade(BaseModel):
    """Decision to not trade this loop."""
    action: Literal["NO_TRADE"] = "NO_TRADE"
    reason: str = Field(..., min_length=1, description="Explanation for no trade")
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence in decision 0-1")


class TradeIntent(BaseModel):
    """Intent to place a trade - notional-based."""
    action: Literal["TRADE"] = "TRADE"
    symbol: str = Field(..., min_length=1, max_length=10, description="Stock symbol")
    side: Literal["buy", "sell"] = Field(..., description="Trade direction")
    notional_usd: float = Field(gt=0, description="Dollar amount to trade")
    order_type: Literal["market"] = "market"
    time_in_force: Literal["day", "gtc", "ioc"] = "day"
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence in decision 0-1")
    reason: str = Field(..., min_length=1, description="Short explanation")
    
    @field_validator("symbol")
    @classmethod
    def uppercase_symbol(cls, v: str) -> str:
        return v.upper().strip()


Decision = Union[TradeIntent, NoTrade]


class MarketSnapshot(BaseModel):
    """Current market state snapshot."""
    timestamp: str
    symbols: list[str] = []
    prices: dict[str, float] = {}
    account_equity: Optional[float] = None
    account_cash: Optional[float] = None
    account_buying_power: Optional[float] = None
    positions: list[dict] = []
    day_pnl: Optional[float] = None


class TradeResult(BaseModel):
    """Result of a trade execution attempt."""
    success: bool
    order_id: Optional[str] = None
    filled_avg_price: Optional[float] = None
    filled_qty: Optional[float] = None
    error: Optional[str] = None
    mode: str = "paper"


class RiskCheckResult(BaseModel):
    """Result of risk gate check."""
    allowed: bool
    notes: str
    original_notional: Optional[float] = None
    adjusted_notional: Optional[float] = None


def parse_decision(raw: dict) -> Decision:
    """Parse raw dict into Decision, defaulting to NoTrade on any error."""
    try:
        action = raw.get("action", "").upper()
        if action == "TRADE":
            return TradeIntent(**raw)
        else:
            return NoTrade(**raw)
    except Exception as e:
        return NoTrade(
            action="NO_TRADE",
            reason=f"Failed to parse decision: {str(e)}",
            confidence=0.0
        )

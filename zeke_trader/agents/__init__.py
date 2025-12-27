"""
ZEKE Trading Agent System - Multi-agent architecture for systematic trading.

Agents (in handoff order):
1. MarketDataAgent - Fetch bars/quotes
2. SignalAgent - Generate Turtle signals (deterministic)
3. PortfolioAgent - Account state and positions
4. DecisionAgent - LLM picks one trade from signals
5. RiskGateAgent - Validate and enforce risk rules
6. ExecutionAgent - Place orders (respects autonomy tier)
7. ObservabilityAgent - Log everything

The OrchestratorAgent coordinates the loop.
"""

from .schemas import (
    Signal,
    ScoredSignal,
    TradeIntent,
    NoTrade,
    Decision,
    RiskResult,
    PortfolioState,
    PositionState,
    PositionStatus,
    MarketSnapshot,
    OrderResult,
    PendingTrade,
    AutonomyTier,
    Thesis,
)

__all__ = [
    "Signal",
    "ScoredSignal",
    "TradeIntent",
    "NoTrade",
    "Decision",
    "RiskResult",
    "PortfolioState",
    "PositionState",
    "PositionStatus",
    "MarketSnapshot",
    "OrderResult",
    "PendingTrade",
    "AutonomyTier",
    "Thesis",
]

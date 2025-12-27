"""
ZEKE Discovery Module

Safe, data-driven ticker discovery and opportunity planning system.
This module runs SEPARATELY from the trading loop - discovery is SLOW,
execution is FAST.

Key principles:
- Discovery NEVER runs inside live trading loop
- No LLM can "invent" tickers or trades
- Price + liquidity + volatility decide eligibility
- All outputs are logged and auditable
- Discovery does NOT place trades - ever
"""

from .schemas import (
    DiscoveryCandidate,
    QualifiedSymbol,
    TradeReadinessRecord,
    ScanResult,
    FilterResult,
    CorrelationGroup,
    WatchlistState,
    ScanType,
    FilterReason,
    QualificationStatus,
)
from .universe_scan import UniverseScanner, ScanConfig
from .filters import HardFilters, FilterConfig, filter_candidates
from .qualification import QualificationGate, QualificationConfig, qualify_candidates
from .planner import OpportunityPlanner, PlannerConfig, plan_opportunities
from .scheduler import DiscoveryScheduler, SchedulerConfig, load_watchlist_state

__all__ = [
    "DiscoveryCandidate",
    "QualifiedSymbol", 
    "TradeReadinessRecord",
    "ScanResult",
    "FilterResult",
    "CorrelationGroup",
    "WatchlistState",
    "ScanType",
    "FilterReason",
    "QualificationStatus",
    "UniverseScanner",
    "ScanConfig",
    "HardFilters",
    "FilterConfig",
    "filter_candidates",
    "QualificationGate",
    "QualificationConfig",
    "qualify_candidates",
    "OpportunityPlanner",
    "PlannerConfig",
    "plan_opportunities",
    "DiscoveryScheduler",
    "SchedulerConfig",
    "load_watchlist_state",
]

"""
Discovery scheduler - slow cadence runner.

Runs daily or weekly, checks market calendar, writes discovery output to logs.
NEVER blocks the trading loop.
"""
from typing import Optional, Callable, Awaitable
from datetime import datetime, timedelta, time
from pydantic import BaseModel, Field
import asyncio
import logging
import json
from pathlib import Path

from .schemas import (
    ScanResult,
    WatchlistState,
    QualifiedSymbol,
    TradeReadinessRecord,
)
from .universe_scan import UniverseScanner, ScanConfig
from .filters import HardFilters, FilterConfig, filter_candidates
from .qualification import QualificationGate, QualificationConfig, qualify_candidates
from .planner import OpportunityPlanner, PlannerConfig, plan_opportunities


logger = logging.getLogger(__name__)


class SchedulerConfig(BaseModel):
    """Configuration for discovery scheduler."""
    cadence: str = Field(
        default="daily",
        description="'daily' or 'weekly'"
    )
    run_time: time = Field(
        default=time(6, 0),
        description="Time to run discovery (UTC)"
    )
    run_days: list[int] = Field(
        default_factory=lambda: [0, 1, 2, 3, 4],
        description="Days to run (0=Monday, 6=Sunday)"
    )
    log_base_path: str = Field(
        default="zeke_trader/logs/discovery",
        description="Base path for discovery logs"
    )
    max_qualified_symbols: int = Field(
        default=50,
        description="Maximum symbols in qualified watchlist"
    )


class DiscoveryScheduler:
    """
    Slow-cadence scheduler for symbol discovery.
    
    Runs independently of the trading loop:
    - Checks market calendar
    - Runs full discovery pipeline
    - Writes results to logs
    - Updates watchlist state
    
    NEVER blocks trading execution.
    """
    
    def __init__(
        self,
        broker,
        config: Optional[SchedulerConfig] = None,
        scan_config: Optional[ScanConfig] = None,
        filter_config: Optional[FilterConfig] = None,
        qualification_config: Optional[QualificationConfig] = None,
        planner_config: Optional[PlannerConfig] = None,
    ):
        self.broker = broker
        self.config = config or SchedulerConfig()
        
        self.scanner = UniverseScanner(broker, scan_config)
        self.filters = HardFilters(filter_config)
        self.gate = QualificationGate(qualification_config)
        self.planner = OpportunityPlanner(planner_config)
        
        self._running = False
        self._last_run: Optional[datetime] = None
        self._watchlist_state = WatchlistState()
        
        self._ensure_log_dirs()
    
    def _ensure_log_dirs(self):
        """Create log directories if they don't exist."""
        base = Path(self.config.log_base_path)
        for subdir in ["scans", "qualified", "planning"]:
            (base / subdir).mkdir(parents=True, exist_ok=True)
    
    async def run_once(self) -> ScanResult:
        """
        Run a single discovery cycle.
        
        This is the main entry point for manual or scheduled runs.
        """
        logger.info("Starting discovery run...")
        start_time = datetime.utcnow()
        
        scan_result = await self.scanner.run_scan()
        logger.info(f"Scan found {scan_result.candidates_found} candidates")
        
        passed_candidates, filter_results = filter_candidates(scan_result.candidates)
        scan_result.filter_results = filter_results
        scan_result.candidates_passed_filter = len(passed_candidates)
        scan_result.candidates_rejected = len(scan_result.candidates) - len(passed_candidates)
        logger.info(f"After filtering: {len(passed_candidates)} passed, {scan_result.candidates_rejected} rejected")
        
        qualified = qualify_candidates(passed_candidates)
        scan_result.qualified_symbols = [q for q in qualified if q.qualification_status.value == "qualified"]
        logger.info(f"Qualified: {len(scan_result.qualified_symbols)} symbols")
        
        readiness_records = plan_opportunities(scan_result.qualified_symbols)
        
        self._update_watchlist_state(scan_result, readiness_records)
        
        await self._write_logs(scan_result, readiness_records)
        
        scan_result.duration_seconds = (datetime.utcnow() - start_time).total_seconds()
        self._last_run = datetime.utcnow()
        
        logger.info(f"Discovery run complete in {scan_result.duration_seconds:.1f}s")
        return scan_result
    
    def _update_watchlist_state(
        self, 
        scan_result: ScanResult,
        readiness_records: list[TradeReadinessRecord],
    ):
        """Update the three-tier watchlist state."""
        self._watchlist_state.discovery_pool = [c.symbol for c in scan_result.candidates]
        
        qualified_symbols = [q.symbol for q in scan_result.qualified_symbols]
        qualified_symbols = qualified_symbols[:self.config.max_qualified_symbols]
        self._watchlist_state.qualified_watchlist = qualified_symbols
        
        self._watchlist_state.readiness_records = {
            r.symbol: r for r in readiness_records
        }
        
        self._watchlist_state.last_scan_id = scan_result.scan_id
        self._watchlist_state.updated_at = datetime.utcnow()
    
    async def _write_logs(
        self, 
        scan_result: ScanResult,
        readiness_records: list[TradeReadinessRecord],
    ):
        """Write discovery results to log files."""
        base = Path(self.config.log_base_path)
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        
        scan_path = base / "scans" / f"scan_{timestamp}.json"
        with open(scan_path, "w") as f:
            json.dump(scan_result.model_dump(mode="json"), f, indent=2, default=str)
        
        qualified_path = base / "qualified" / "qualified_watchlist.json"
        qualified_data = {
            "updated_at": datetime.utcnow().isoformat(),
            "symbols": [q.model_dump(mode="json") for q in scan_result.qualified_symbols],
        }
        with open(qualified_path, "w") as f:
            json.dump(qualified_data, f, indent=2, default=str)
        
        planning_path = base / "planning" / f"readiness_{timestamp}.json"
        planning_data = {
            "computed_at": datetime.utcnow().isoformat(),
            "records": [r.model_dump(mode="json") for r in readiness_records],
        }
        with open(planning_path, "w") as f:
            json.dump(planning_data, f, indent=2, default=str)
        
        state_path = base / "watchlist_state.json"
        with open(state_path, "w") as f:
            json.dump(self._watchlist_state.model_dump(mode="json"), f, indent=2, default=str)
        
        logger.info(f"Logs written: {scan_path}, {qualified_path}, {planning_path}")
    
    def get_watchlist_state(self) -> WatchlistState:
        """Get current watchlist state."""
        return self._watchlist_state
    
    def get_qualified_symbols(self) -> list[str]:
        """Get list of qualified symbols for trading loop."""
        return self._watchlist_state.qualified_watchlist.copy()
    
    def get_readiness_record(self, symbol: str) -> Optional[TradeReadinessRecord]:
        """Get trade readiness record for a symbol."""
        return self._watchlist_state.readiness_records.get(symbol)
    
    def should_run(self) -> bool:
        """Check if discovery should run based on schedule."""
        now = datetime.utcnow()
        
        if now.weekday() not in self.config.run_days:
            return False
        
        if self._last_run:
            if self.config.cadence == "daily":
                min_interval = timedelta(hours=20)
            else:
                min_interval = timedelta(days=6)
            
            if now - self._last_run < min_interval:
                return False
        
        current_time = now.time()
        run_time = self.config.run_time
        time_window = timedelta(minutes=30)
        
        run_datetime = datetime.combine(now.date(), run_time)
        if abs((now - run_datetime).total_seconds()) > time_window.total_seconds():
            return False
        
        return True
    
    async def start_background_loop(self, check_interval_minutes: int = 5):
        """
        Start background loop that checks schedule and runs discovery.
        
        This runs independently and never blocks trading.
        """
        self._running = True
        logger.info("Discovery scheduler started")
        
        while self._running:
            try:
                if self.should_run():
                    await self.run_once()
            except Exception as e:
                logger.error(f"Discovery run failed: {e}")
            
            await asyncio.sleep(check_interval_minutes * 60)
    
    def stop(self):
        """Stop the background loop."""
        self._running = False
        logger.info("Discovery scheduler stopped")


def load_watchlist_state(log_base_path: str = "zeke_trader/logs/discovery") -> Optional[WatchlistState]:
    """Load watchlist state from disk."""
    state_path = Path(log_base_path) / "watchlist_state.json"
    
    if not state_path.exists():
        return None
    
    try:
        with open(state_path) as f:
            data = json.load(f)
        return WatchlistState.model_validate(data)
    except Exception as e:
        logger.error(f"Failed to load watchlist state: {e}")
        return None

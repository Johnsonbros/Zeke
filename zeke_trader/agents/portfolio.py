"""
PortfolioAgent - Manages account state and positions.

Purpose: Pull account + positions; compute exposure; compute today's trades count
Fail closed: If account state is unavailable -> NO_TRADE unless in shadow mode
"""
import logging
import json
from datetime import datetime, date
from pathlib import Path
from typing import Optional, Dict, Any
from alpaca.trading.client import TradingClient
from alpaca.trading.requests import GetOrdersRequest
from alpaca.trading.enums import QueryOrderStatus

from .schemas import PortfolioState, Position
from ..config import TradingConfig

logger = logging.getLogger("zeke_trader.agents.portfolio")


class PortfolioAgent:
    """Manages portfolio state and position tracking."""
    
    def __init__(self, config: TradingConfig):
        self.config = config
        self.client = TradingClient(
            api_key=config.alpaca_key_id,
            secret_key=config.alpaca_secret_key,
            paper=config.trading_mode.value != "live",
        )
        self.entry_criteria_file = Path(config.log_dir) / "entry_criteria.json"
        self._ensure_log_dir()
    
    def _ensure_log_dir(self):
        """Ensure log directory exists."""
        Path(self.config.log_dir).mkdir(parents=True, exist_ok=True)
    
    async def get_portfolio_state(self) -> PortfolioState:
        """
        Fetch current portfolio state from Alpaca.
        
        Returns:
            PortfolioState with account info, positions, and trade counts
        """
        try:
            account = self.client.get_account()
            
            positions = []
            alpaca_positions = self.client.get_all_positions()
            entry_criteria = self._load_entry_criteria()
            
            for pos in alpaca_positions:
                position = Position(
                    symbol=pos.symbol,
                    qty=float(pos.qty),
                    avg_entry_price=float(pos.avg_entry_price),
                    market_value=float(pos.market_value),
                    unrealized_pl=float(pos.unrealized_pl),
                    unrealized_plpc=float(pos.unrealized_plpc),
                    entry_criteria=entry_criteria.get(pos.symbol),
                )
                positions.append(position)
            
            trades_today = await self._count_trades_today()
            
            return PortfolioState(
                equity=float(account.equity),
                cash=float(account.cash),
                buying_power=float(account.buying_power),
                positions=positions,
                trades_today=trades_today,
                pnl_day=float(account.equity) - float(account.last_equity),
                timestamp=datetime.utcnow(),
            )
        
        except Exception as e:
            logger.error(f"Error fetching portfolio state: {e}")
            raise RuntimeError(f"PORTFOLIO_UNAVAILABLE: {e}")
    
    async def _count_trades_today(self) -> int:
        """Count filled orders from today."""
        try:
            today_start = datetime.combine(date.today(), datetime.min.time())
            
            orders_request = GetOrdersRequest(
                status=QueryOrderStatus.CLOSED,
                after=today_start,
            )
            orders = self.client.get_orders(orders_request)
            
            filled_count = sum(1 for o in orders if o.status.value == "filled")
            return filled_count
        
        except Exception as e:
            logger.warning(f"Could not count trades today: {e}")
            return 0
    
    def _load_entry_criteria(self) -> Dict[str, Dict[str, Any]]:
        """Load stored entry criteria for positions."""
        if not self.entry_criteria_file.exists():
            return {}
        
        try:
            with open(self.entry_criteria_file, "r") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Could not load entry criteria: {e}")
            return {}
    
    def save_entry_criteria(self, symbol: str, criteria: Dict[str, Any]):
        """
        Save entry criteria for a new position.
        
        This stores the stop price, exit levels, etc. that were set at entry time.
        These are used for systematic exits.
        """
        all_criteria = self._load_entry_criteria()
        all_criteria[symbol] = {
            **criteria,
            "saved_at": datetime.utcnow().isoformat(),
        }
        
        try:
            with open(self.entry_criteria_file, "w") as f:
                json.dump(all_criteria, f, indent=2)
            logger.info(f"Saved entry criteria for {symbol}: {criteria}")
        except Exception as e:
            logger.error(f"Could not save entry criteria: {e}")
    
    def clear_entry_criteria(self, symbol: str):
        """Remove entry criteria when position is closed."""
        all_criteria = self._load_entry_criteria()
        if symbol in all_criteria:
            del all_criteria[symbol]
            try:
                with open(self.entry_criteria_file, "w") as f:
                    json.dump(all_criteria, f, indent=2)
                logger.info(f"Cleared entry criteria for {symbol}")
            except Exception as e:
                logger.error(f"Could not clear entry criteria: {e}")
    
    def get_portfolio_state_sync(self) -> PortfolioState:
        """Synchronous version for non-async contexts."""
        import asyncio
        return asyncio.get_event_loop().run_until_complete(self.get_portfolio_state())

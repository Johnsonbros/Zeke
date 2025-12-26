"""
Configuration management with safety latches for trading modes.
"""
import os
from dataclasses import dataclass, field
from typing import List
from enum import Enum


class TradingMode(str, Enum):
    PAPER = "paper"
    SHADOW = "shadow"
    LIVE = "live"


@dataclass
class TradingConfig:
    openai_api_key: str = ""
    alpaca_key_id: str = ""
    alpaca_secret_key: str = ""
    alpaca_mcp_url: str = ""
    
    trading_mode: TradingMode = TradingMode.PAPER
    live_trading_enabled: bool = False
    
    allowed_symbols: List[str] = field(default_factory=lambda: ["NVDA", "SPY", "META", "GOOGL", "AVGO", "GOOG", "AMZN"])
    
    max_dollars_per_trade: float = 25.0
    max_open_positions: int = 3
    max_trades_per_day: int = 5
    max_daily_loss: float = 25.0
    
    loop_seconds: int = 60
    log_dir: str = "zeke_trader/logs"
    
    def __post_init__(self):
        self._validate_safety()
    
    def _validate_safety(self):
        """Ensure safety latches are properly configured."""
        if self.trading_mode == TradingMode.LIVE:
            if not self.live_trading_enabled:
                raise ValueError(
                    "SAFETY: Live trading requested but LIVE_TRADING_ENABLED is not true. "
                    "Both TRADING_MODE=live AND LIVE_TRADING_ENABLED=true are required."
                )
    
    def can_execute_orders(self) -> bool:
        """Check if order execution is allowed based on mode and latches."""
        if self.trading_mode == TradingMode.SHADOW:
            return False
        if self.trading_mode == TradingMode.LIVE:
            return self.live_trading_enabled
        return True
    
    def get_mode_description(self) -> str:
        """Get human-readable description of current mode."""
        if self.trading_mode == TradingMode.PAPER:
            return "PAPER: Orders executed against paper trading account"
        elif self.trading_mode == TradingMode.SHADOW:
            return "SHADOW: Decisions logged but NO orders placed"
        elif self.trading_mode == TradingMode.LIVE:
            if self.live_trading_enabled:
                return "LIVE: Real money trading ENABLED"
            return "LIVE: Blocked (LIVE_TRADING_ENABLED is false)"
        return "UNKNOWN"


def load_config() -> TradingConfig:
    """Load configuration from environment variables."""
    mode_str = os.getenv("TRADING_MODE", "paper").lower()
    try:
        trading_mode = TradingMode(mode_str)
    except ValueError:
        trading_mode = TradingMode.PAPER
    
    live_enabled = os.getenv("LIVE_TRADING_ENABLED", "false").lower() == "true"
    
    symbols_str = os.getenv("ALLOWED_SYMBOLS", "NVDA,SPY,META,GOOGL,AVGO,GOOG,AMZN")
    allowed_symbols = [s.strip().upper() for s in symbols_str.split(",") if s.strip()]
    
    return TradingConfig(
        openai_api_key=os.getenv("OPENAI_API_KEY", ""),
        alpaca_key_id=os.getenv("ALPACA_KEY_ID", ""),
        alpaca_secret_key=os.getenv("ALPACA_SECRET_KEY", ""),
        alpaca_mcp_url=os.getenv("ALPACA_MCP_URL", ""),
        trading_mode=trading_mode,
        live_trading_enabled=live_enabled,
        allowed_symbols=allowed_symbols,
        max_dollars_per_trade=float(os.getenv("MAX_DOLLARS_PER_TRADE", "25")),
        max_open_positions=int(os.getenv("MAX_OPEN_POSITIONS", "3")),
        max_trades_per_day=int(os.getenv("MAX_TRADES_PER_DAY", "5")),
        max_daily_loss=float(os.getenv("MAX_DAILY_LOSS", "25")),
        loop_seconds=int(os.getenv("LOOP_SECONDS", "60")),
        log_dir=os.getenv("LOG_DIR", "zeke_trader/logs"),
    )

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


class AutonomyTier(str, Enum):
    MANUAL = "manual"
    MODERATE = "moderate"
    FULL_AGENTIC = "full_agentic"


@dataclass
class TradingConfig:
    openai_api_key: str = ""
    alpaca_key_id: str = ""
    alpaca_secret_key: str = ""
    alpaca_mcp_url: str = ""
    perplexity_api_key: str = ""
    
    trading_mode: TradingMode = TradingMode.PAPER
    live_trading_enabled: bool = False
    autonomy_tier: AutonomyTier = AutonomyTier.MANUAL
    
    allowed_symbols: List[str] = field(default_factory=lambda: ["NVDA", "SPY", "META", "GOOGL", "AVGO", "GOOG", "AMZN"])
    
    max_dollars_per_trade: float = 25.0
    max_open_positions: int = 3
    max_trades_per_day: int = 5
    max_daily_loss: float = 25.0
    
    perplexity_enabled: bool = True
    perplexity_score_threshold: float = 4.0
    
    kelly_enabled: bool = True
    kelly_fraction: float = 0.5
    kelly_lookback_trades: int = 40
    kelly_min_trades: int = 10
    kelly_max_position_pct: float = 0.25
    
    circuit_breaker_enabled: bool = True
    circuit_breaker_daily_limit: float = 0.05
    circuit_breaker_weekly_limit: float = 0.10
    
    volume_filter_enabled: bool = True
    volume_threshold: float = 1.5
    trend_filter_enabled: bool = True
    
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
    
    if trading_mode == TradingMode.LIVE and live_enabled:
        api_key = os.getenv("ALPACA_KEY_ID", "")
        api_secret = os.getenv("ALPACA_SECRET_KEY", "")
    else:
        api_key = os.getenv("PAPER_API_KEY", "") or os.getenv("ALPACA_KEY_ID", "")
        api_secret = os.getenv("PAPER_API_SECRET", "") or os.getenv("ALPACA_SECRET_KEY", "")
    
    autonomy_str = os.getenv("AUTONOMY_TIER", "manual").lower()
    try:
        autonomy_tier = AutonomyTier(autonomy_str)
    except ValueError:
        autonomy_tier = AutonomyTier.MANUAL
    
    return TradingConfig(
        openai_api_key=os.getenv("OPENAI_API_KEY", ""),
        alpaca_key_id=api_key,
        alpaca_secret_key=api_secret,
        alpaca_mcp_url=os.getenv("ALPACA_MCP_URL", ""),
        perplexity_api_key=os.getenv("PERPLEXITY_API_KEY", ""),
        trading_mode=trading_mode,
        live_trading_enabled=live_enabled,
        autonomy_tier=autonomy_tier,
        allowed_symbols=allowed_symbols,
        max_dollars_per_trade=float(os.getenv("MAX_DOLLARS_PER_TRADE", "25")),
        max_open_positions=int(os.getenv("MAX_OPEN_POSITIONS", "3")),
        max_trades_per_day=int(os.getenv("MAX_TRADES_PER_DAY", "5")),
        max_daily_loss=float(os.getenv("MAX_DAILY_LOSS", "25")),
        perplexity_enabled=os.getenv("PERPLEXITY_ENABLED", "true").lower() == "true",
        perplexity_score_threshold=float(os.getenv("PERPLEXITY_SCORE_THRESHOLD", "4.0")),
        kelly_enabled=os.getenv("KELLY_ENABLED", "true").lower() == "true",
        kelly_fraction=float(os.getenv("KELLY_FRACTION", "0.5")),
        kelly_lookback_trades=int(os.getenv("KELLY_LOOKBACK_TRADES", "40")),
        kelly_min_trades=int(os.getenv("KELLY_MIN_TRADES", "10")),
        kelly_max_position_pct=float(os.getenv("KELLY_MAX_POSITION_PCT", "0.25")),
        circuit_breaker_enabled=os.getenv("CIRCUIT_BREAKER_ENABLED", "true").lower() == "true",
        circuit_breaker_daily_limit=float(os.getenv("CIRCUIT_BREAKER_DAILY_LIMIT", "0.05")),
        circuit_breaker_weekly_limit=float(os.getenv("CIRCUIT_BREAKER_WEEKLY_LIMIT", "0.10")),
        volume_filter_enabled=os.getenv("VOLUME_FILTER_ENABLED", "true").lower() == "true",
        volume_threshold=float(os.getenv("VOLUME_THRESHOLD", "1.5")),
        trend_filter_enabled=os.getenv("TREND_FILTER_ENABLED", "true").lower() == "true",
        loop_seconds=int(os.getenv("LOOP_SECONDS", "60")),
        log_dir=os.getenv("LOG_DIR", "zeke_trader/logs"),
    )

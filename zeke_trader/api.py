"""
FastAPI Trading Service - Persistent API for ZEKE trading operations.
Replaces subprocess calls with proper HTTP service.
Includes rate limiting middleware to prevent abuse.
"""
import os
import time
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any, Literal as TypeLiteral
from contextlib import asynccontextmanager
from collections import defaultdict

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .config import load_config, TradingConfig
from .broker_mcp import AlpacaBroker
from .risk import risk_check, count_trades_today, get_daily_pnl
from .schemas import TradeIntent, MarketSnapshot

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [TRADING] %(levelname)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("zeke_trader")


class RateLimiter:
    """Simple in-memory rate limiter with per-endpoint limits."""
    
    def __init__(self):
        self.requests: Dict[str, List[float]] = defaultdict(list)
        self.limits = {
            "/order": (5, 60),
            "/account": (30, 60),
            "/positions": (30, 60),
            "/orders": (30, 60),
            "/quotes": (60, 60),
            "/clock": (60, 60),
            "/bars": (30, 60),
            "/snapshot": (30, 60),
            "/news": (20, 60),
            "/risk-limits": (30, 60),
            "default": (100, 60),
        }
    
    def _clean_old_requests(self, key: str, window: int):
        """Remove requests outside the time window."""
        now = time.time()
        self.requests[key] = [t for t in self.requests[key] if now - t < window]
    
    def is_allowed(self, endpoint: str, client_id: str = "default") -> tuple[bool, int, int]:
        """Check if request is allowed under rate limit.
        
        Returns: (allowed, remaining, retry_after_seconds)
        """
        path_key = None
        for k in self.limits:
            if k in endpoint:
                path_key = k
                break
        if not path_key:
            path_key = "default"
        
        max_requests, window = self.limits[path_key]
        key = f"{client_id}:{path_key}"
        
        self._clean_old_requests(key, window)
        
        current_count = len(self.requests[key])
        remaining = max_requests - current_count
        
        if current_count >= max_requests:
            oldest = min(self.requests[key]) if self.requests[key] else time.time()
            retry_after = int(oldest + window - time.time()) + 1
            return False, 0, retry_after
        
        self.requests[key].append(time.time())
        return True, remaining - 1, 0


_rate_limiter = RateLimiter()

_cfg: Optional[TradingConfig] = None
_broker: Optional[AlpacaBroker] = None


def get_cfg() -> TradingConfig:
    if _cfg is None:
        raise HTTPException(status_code=503, detail="Trading service not initialized")
    return _cfg


def get_broker() -> AlpacaBroker:
    if _broker is None:
        raise HTTPException(status_code=503, detail="Trading service not initialized")
    return _broker


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _cfg, _broker
    logger.info("Starting ZEKE Trading Service...")
    _cfg = load_config()
    _broker = AlpacaBroker(_cfg)
    logger.info(f"Trading mode: {_cfg.trading_mode.value}")
    logger.info(f"Allowed symbols: {_cfg.allowed_symbols}")
    logger.info(f"Risk limits: ${_cfg.max_dollars_per_trade}/trade, {_cfg.max_open_positions} positions, {_cfg.max_trades_per_day} trades/day")
    yield
    if _broker:
        _broker.close()
    logger.info("Trading service shutdown complete")


app = FastAPI(
    title="ZEKE Trading Service",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class OrderRequest(BaseModel):
    symbol: str
    side: TypeLiteral["buy", "sell"]
    notional: float


class OrderResponse(BaseModel):
    success: bool
    order_id: Optional[str] = None
    error: Optional[str] = None
    mode: str


class QuoteItem(BaseModel):
    symbol: str
    price: float
    change: float = 0
    change_percent: float = 0


class RiskLimits(BaseModel):
    max_dollars_per_trade: float
    max_open_positions: int
    max_trades_per_day: int
    max_daily_loss: float
    allowed_symbols: List[str]
    trades_today: int
    daily_pnl: float


class MarketClock(BaseModel):
    timestamp: str
    is_open: bool
    next_open: Optional[str] = None
    next_close: Optional[str] = None


class HistoricalBar(BaseModel):
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: int


class StockSnapshot(BaseModel):
    symbol: str
    latest_trade_price: Optional[float] = None
    latest_trade_time: Optional[str] = None
    bid_price: Optional[float] = None
    ask_price: Optional[float] = None
    daily_bar: Optional[Dict[str, Any]] = None
    prev_daily_bar: Optional[Dict[str, Any]] = None


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Rate limiting middleware - checks limits before processing request."""
    if request.url.path == "/health":
        return await call_next(request)
    
    client_ip = request.client.host if request.client else "unknown"
    allowed, remaining, retry_after = _rate_limiter.is_allowed(request.url.path, client_ip)
    
    if not allowed:
        logger.warning(f"Rate limit exceeded for {client_ip} on {request.url.path}")
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded", "retry_after": retry_after},
            headers={"Retry-After": str(retry_after), "X-RateLimit-Remaining": "0"}
        )
    
    response = await call_next(request)
    response.headers["X-RateLimit-Remaining"] = str(remaining)
    return response


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Request logging middleware."""
    start_time = datetime.utcnow()
    response = await call_next(request)
    duration = (datetime.utcnow() - start_time).total_seconds() * 1000
    logger.info(f"{request.method} {request.url.path} - {response.status_code} ({duration:.1f}ms)")
    return response


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "zeke_trader", "timestamp": datetime.utcnow().isoformat()}


@app.get("/account")
async def get_account_info():
    cfg = get_cfg()
    broker = get_broker()
    logger.info("Fetching account info")
    account = broker.get_account()
    if "error" in account:
        logger.error(f"Account fetch failed: {account['error']}")
        raise HTTPException(status_code=500, detail=account["error"])
    account["trading_mode"] = cfg.trading_mode.value
    account["live_enabled"] = cfg.live_trading_enabled
    return account


@app.get("/positions")
async def get_positions_list():
    broker = get_broker()
    logger.info("Fetching positions")
    positions = broker.get_positions()
    return positions


@app.get("/quotes", response_model=List[QuoteItem])
async def get_quotes_list():
    cfg = get_cfg()
    broker = get_broker()
    logger.info(f"Fetching quotes for {cfg.allowed_symbols}")
    quotes = []
    for symbol in cfg.allowed_symbols:
        try:
            trade = broker.get_latest_trade(symbol)
            if "trade" in trade:
                price = float(trade["trade"].get("p", 0))
                quotes.append(QuoteItem(symbol=symbol, price=price))
        except Exception as e:
            logger.warning(f"Failed to get quote for {symbol}: {e}")
    return quotes


@app.get("/orders")
async def get_orders_list(status: str = "all", limit: int = 10):
    broker = get_broker()
    logger.info(f"Fetching orders (status={status}, limit={limit})")
    orders = broker.list_orders(status=status, limit=limit)
    return orders


@app.get("/risk-limits", response_model=RiskLimits)
async def get_risk_limits_info():
    cfg = get_cfg()
    return RiskLimits(
        max_dollars_per_trade=cfg.max_dollars_per_trade,
        max_open_positions=cfg.max_open_positions,
        max_trades_per_day=cfg.max_trades_per_day,
        max_daily_loss=cfg.max_daily_loss,
        allowed_symbols=cfg.allowed_symbols,
        trades_today=count_trades_today(cfg.log_dir),
        daily_pnl=get_daily_pnl(cfg.log_dir)
    )


@app.post("/order", response_model=OrderResponse)
async def place_order(order: OrderRequest):
    cfg = get_cfg()
    broker = get_broker()
    logger.info(f"Order request: {order.side} ${order.notional} of {order.symbol}")
    
    intent = TradeIntent(
        action="TRADE",
        symbol=order.symbol,
        side=order.side,
        notional_usd=order.notional,
        confidence=0.9,
        reason="User initiated trade from dashboard"
    )
    
    snapshot = broker.get_market_snapshot([order.symbol])
    allowed, reason, _ = risk_check(intent, snapshot, cfg)
    
    if not allowed:
        logger.warning(f"Order blocked by risk check: {reason}")
        return OrderResponse(success=False, error=reason, mode=cfg.trading_mode.value)
    
    trade_result = broker.place_order_notional(
        symbol=order.symbol,
        side=order.side,
        notional_usd=order.notional
    )
    
    if trade_result.success:
        logger.info(f"Order placed successfully: {trade_result.order_id}")
    else:
        logger.error(f"Order failed: {trade_result.error}")
    
    return OrderResponse(
        success=trade_result.success,
        order_id=trade_result.order_id,
        error=trade_result.error,
        mode=trade_result.mode
    )


@app.get("/clock", response_model=MarketClock)
async def get_market_clock_info():
    broker = get_broker()
    logger.info("Fetching market clock")
    result = broker._request("GET", "/v2/clock")
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    
    return MarketClock(
        timestamp=result.get("timestamp", datetime.utcnow().isoformat()),
        is_open=result.get("is_open", False),
        next_open=result.get("next_open"),
        next_close=result.get("next_close")
    )


@app.get("/bars/{symbol}")
async def get_historical_bars(
    symbol: str,
    timeframe: str = "1Day",
    limit: int = 30
) -> List[HistoricalBar]:
    broker = get_broker()
    logger.info(f"Fetching bars for {symbol} (timeframe={timeframe}, limit={limit})")
    result = broker.get_bars(symbol.upper(), timeframe=timeframe, limit=limit)
    
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    
    bars = []
    if "bars" in result:
        for bar in result["bars"]:
            bars.append(HistoricalBar(
                timestamp=bar.get("t", ""),
                open=float(bar.get("o", 0)),
                high=float(bar.get("h", 0)),
                low=float(bar.get("l", 0)),
                close=float(bar.get("c", 0)),
                volume=int(bar.get("v", 0))
            ))
    return bars


@app.get("/snapshot/{symbol}", response_model=StockSnapshot)
async def get_stock_snapshot_info(symbol: str):
    broker = get_broker()
    logger.info(f"Fetching snapshot for {symbol}")
    symbol = symbol.upper()
    
    result = broker._request("GET", "/v2/stocks/snapshots", base=broker.data_url, params={"symbols": symbol, "feed": "iex"})
    
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    
    snap_data = result.get(symbol, {})
    
    return StockSnapshot(
        symbol=symbol,
        latest_trade_price=float(snap_data.get("latestTrade", {}).get("p", 0)) if snap_data.get("latestTrade") else None,
        latest_trade_time=snap_data.get("latestTrade", {}).get("t"),
        bid_price=float(snap_data.get("latestQuote", {}).get("bp", 0)) if snap_data.get("latestQuote") else None,
        ask_price=float(snap_data.get("latestQuote", {}).get("ap", 0)) if snap_data.get("latestQuote") else None,
        daily_bar=snap_data.get("dailyBar"),
        prev_daily_bar=snap_data.get("prevDailyBar")
    )


@app.get("/news")
async def get_news_feed(symbols: Optional[str] = None, limit: int = 10):
    cfg = get_cfg()
    broker = get_broker()
    logger.info(f"Fetching news (symbols={symbols}, limit={limit})")
    
    symbols_param = symbols if symbols else ",".join(cfg.allowed_symbols[:5])
    
    result = broker._request("GET", "/v1beta1/news", base=broker.data_url, params={"limit": limit, "symbols": symbols_param})
    
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    
    news_items = result.get("news", [])
    return news_items


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("TRADING_SERVICE_PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port)

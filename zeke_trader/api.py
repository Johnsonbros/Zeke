"""
FastAPI Trading Service - Persistent API for ZEKE trading operations.
Replaces subprocess calls with proper HTTP service.
Includes rate limiting middleware to prevent abuse.
"""
import os
import time
import asyncio
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any, Literal as TypeLiteral
from contextlib import asynccontextmanager
from collections import defaultdict

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .config import load_config, TradingConfig, AutonomyTier
from .broker_mcp import AlpacaBroker
from .risk import risk_check, count_trades_today, get_daily_pnl
from .schemas import TradeIntent, MarketSnapshot
from .agents.orchestrator import OrchestratorAgent
from .agents.schemas import PendingTradeStatus

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
_orchestrator: Optional[OrchestratorAgent] = None
_scheduler_task: Optional[asyncio.Task] = None
_scheduler_running: bool = False


def get_cfg() -> TradingConfig:
    if _cfg is None:
        raise HTTPException(status_code=503, detail="Trading service not initialized")
    return _cfg


def get_broker() -> AlpacaBroker:
    if _broker is None:
        raise HTTPException(status_code=503, detail="Trading service not initialized")
    return _broker


async def _run_scheduled_loop():
    """Background task that runs trading loops at configured intervals."""
    global _scheduler_running
    _scheduler_running = True
    loop_seconds = _cfg.loop_seconds if _cfg else 300
    
    logger.info(f"[Scheduler] Started autonomous trading loop (every {loop_seconds}s)")
    
    while _scheduler_running:
        try:
            kill_switch = os.getenv("TRADING_KILL_SWITCH", "false").lower() == "true"
            if kill_switch:
                logger.warning("[Scheduler] Kill switch activated - pausing trading")
                await asyncio.sleep(60)
                continue
            
            if _orchestrator and _cfg and _cfg.autonomy_tier == AutonomyTier.FULL_AGENTIC:
                try:
                    clock = _broker._request("GET", "/v2/clock") if _broker else None
                    is_market_open = clock.get("is_open", False) if clock else False
                except Exception:
                    is_market_open = False
                
                if is_market_open:
                    logger.info("[Scheduler] Running autonomous trading loop...")
                    try:
                        result = await asyncio.to_thread(_orchestrator.run_loop)
                        if result.decision and result.decision.action != "hold":
                            logger.info(f"[Scheduler] Loop complete: {result.decision.action} {result.decision.symbol}")
                        else:
                            logger.info("[Scheduler] Loop complete: No trade signal")
                    except Exception as e:
                        logger.error(f"[Scheduler] Loop error: {e}")
                else:
                    logger.debug("[Scheduler] Market closed - skipping loop")
            
            await asyncio.sleep(loop_seconds)
            
        except asyncio.CancelledError:
            logger.info("[Scheduler] Stopping autonomous trading loop")
            break
        except Exception as e:
            logger.error(f"[Scheduler] Unexpected error: {e}")
            await asyncio.sleep(60)
    
    _scheduler_running = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _cfg, _broker, _orchestrator, _scheduler_task
    logger.info("Starting ZEKE Trading Service...")
    _cfg = load_config()
    _broker = AlpacaBroker(_cfg)
    _orchestrator = OrchestratorAgent(_cfg)
    logger.info(f"Trading mode: {_cfg.trading_mode.value}")
    logger.info(f"Autonomy tier: {_cfg.autonomy_tier.value}")
    logger.info(f"Allowed symbols: {_cfg.allowed_symbols}")
    logger.info(f"Risk limits: ${_cfg.max_dollars_per_trade}/trade, {_cfg.max_open_positions} positions, {_cfg.max_trades_per_day} trades/day")
    
    if _cfg.autonomy_tier == AutonomyTier.FULL_AGENTIC:
        logger.info("[Scheduler] Full autonomy enabled - starting background scheduler")
        _scheduler_task = asyncio.create_task(_run_scheduled_loop())
    
    yield
    
    if _scheduler_task:
        global _scheduler_running
        _scheduler_running = False
        _scheduler_task.cancel()
        try:
            await _scheduler_task
        except asyncio.CancelledError:
            pass
    
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


class AutonomyTierRequest(BaseModel):
    tier: str


@app.get("/agent/status")
async def get_agent_status():
    """Get current agent system status."""
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Orchestrator not initialized")
    
    status = _orchestrator.get_status()
    return status


@app.post("/agent/run-loop")
async def run_agent_loop():
    """Run one trading loop through the agent system."""
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Orchestrator not initialized")
    
    logger.info("Running agent loop...")
    result = await _orchestrator.run_loop()
    
    response = {
        "loop_id": result.loop_id,
        "timestamp": result.timestamp.isoformat(),
        "signals_count": len(result.signals),
        "decision": result.decision.model_dump() if result.decision else None,
        "risk_allowed": result.risk_result.allowed if result.risk_result else None,
        "order_status": result.order_result.status if result.order_result else None,
        "pending_trade_id": result.pending_trade.id if result.pending_trade else None,
        "duration_ms": result.duration_ms,
        "errors": result.errors,
    }
    
    return response


@app.get("/agent/pending-trades")
async def get_pending_trades_list():
    """Get all pending trades awaiting approval."""
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Orchestrator not initialized")
    
    pending = _orchestrator.get_pending_trades()
    return [p.model_dump(mode="json") for p in pending]


@app.post("/agent/approve-trade/{trade_id}")
async def approve_pending_trade(trade_id: str):
    """Approve a pending trade for execution."""
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Orchestrator not initialized")
    
    logger.info(f"Approving trade: {trade_id}")
    result = _orchestrator.approve_trade(trade_id)
    
    return {
        "executed": result.executed,
        "order_id": result.order_id,
        "status": result.status,
        "message": result.message,
    }


class RejectTradeRequest(BaseModel):
    reason: str = ""


@app.post("/agent/reject-trade/{trade_id}")
async def reject_pending_trade(trade_id: str, body: RejectTradeRequest = None):
    """Reject a pending trade."""
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Orchestrator not initialized")
    
    reason = body.reason if body else ""
    logger.info(f"Rejecting trade: {trade_id} - {reason}")
    success = _orchestrator.reject_trade(trade_id, reason)
    
    return {"success": success, "trade_id": trade_id}


@app.post("/agent/set-autonomy")
async def set_autonomy_tier(body: AutonomyTierRequest):
    """Set the autonomy tier (requires restart to take effect)."""
    try:
        tier = AutonomyTier(body.tier.lower())
        logger.info(f"Autonomy tier change requested: {tier.value}")
        return {
            "message": f"Set AUTONOMY_TIER={tier.value} environment variable and restart service",
            "current": get_cfg().autonomy_tier.value,
            "requested": tier.value,
        }
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid tier: {body.tier}. Use: manual, moderate, full_agentic")


@app.get("/agent/recent-loops")
async def get_recent_loops_history(limit: int = 10):
    """Get recent loop results for review."""
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Orchestrator not initialized")
    
    loops = _orchestrator.observability.get_recent_loops(limit)
    return loops


class ChartDataPoint(BaseModel):
    timestamp: str
    value: float
    label: Optional[str] = None


class PerformanceCharts(BaseModel):
    equity_curve: List[ChartDataPoint]
    daily_pnl: List[ChartDataPoint]
    trade_distribution: List[Dict[str, Any]]
    signal_confidence: List[ChartDataPoint]
    win_loss: Dict[str, int]
    drawdown: List[ChartDataPoint]


@app.get("/charts/performance", response_model=PerformanceCharts)
async def get_performance_charts():
    """Get aggregated chart data for performance visualizations."""
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Orchestrator not initialized")
    
    from pathlib import Path
    import json
    
    cfg = get_cfg()
    log_dir = Path(cfg.log_dir)
    
    equity_curve = []
    equity_dir = log_dir / "equity"
    if equity_dir.exists():
        for f in sorted(equity_dir.glob("equity_*.jsonl")):
            with open(f, "r") as file:
                for line in file:
                    if line.strip():
                        try:
                            data = json.loads(line)
                            equity_curve.append(ChartDataPoint(
                                timestamp=data.get("ts", data.get("timestamp", "")),
                                value=float(data.get("equity", 0)),
                            ))
                        except:
                            continue
    
    daily_pnl = []
    signal_confidence = []
    trade_counts_by_symbol: Dict[str, int] = {}
    wins = 0
    losses = 0
    
    trades_dir = log_dir / "trades"
    if trades_dir.exists():
        for f in sorted(trades_dir.glob("trades_*.jsonl")):
            with open(f, "r") as file:
                for line in file:
                    if line.strip():
                        try:
                            data = json.loads(line)
                            symbol = data.get("symbol", "UNKNOWN")
                            trade_counts_by_symbol[symbol] = trade_counts_by_symbol.get(symbol, 0) + 1
                            
                            pnl = data.get("pnl", 0)
                            if pnl != 0:
                                daily_pnl.append(ChartDataPoint(
                                    timestamp=data.get("timestamp", ""),
                                    value=float(pnl),
                                    label=symbol,
                                ))
                                if pnl > 0:
                                    wins += 1
                                else:
                                    losses += 1
                            
                            thesis = data.get("thesis")
                            if thesis:
                                score = thesis.get("signal_score", 0)
                                if score:
                                    signal_confidence.append(ChartDataPoint(
                                        timestamp=data.get("timestamp", ""),
                                        value=float(score),
                                        label=symbol,
                                    ))
                        except:
                            continue
    
    trade_distribution = [
        {"symbol": sym, "count": cnt, "fill": f"hsl({i * 45 % 360}, 70%, 50%)"}
        for i, (sym, cnt) in enumerate(trade_counts_by_symbol.items())
    ]
    
    drawdown = []
    if equity_curve:
        peak = 0
        for pt in equity_curve:
            if pt.value > peak:
                peak = pt.value
            dd = ((peak - pt.value) / peak * 100) if peak > 0 else 0
            drawdown.append(ChartDataPoint(
                timestamp=pt.timestamp,
                value=dd,
            ))
    
    return PerformanceCharts(
        equity_curve=equity_curve[-100:] if len(equity_curve) > 100 else equity_curve,
        daily_pnl=daily_pnl[-30:] if len(daily_pnl) > 30 else daily_pnl,
        trade_distribution=trade_distribution,
        signal_confidence=signal_confidence[-50:] if len(signal_confidence) > 50 else signal_confidence,
        win_loss={"wins": wins, "losses": losses},
        drawdown=drawdown[-100:] if len(drawdown) > 100 else drawdown,
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("TRADING_SERVICE_PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port)

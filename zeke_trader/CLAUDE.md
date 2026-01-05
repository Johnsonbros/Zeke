# CLAUDE.md - AI Assistant Guide for ZEKE Trader

> **Last Updated:** 2026-01-05
>
> This document provides comprehensive guidance for AI assistants (like Claude) working on the ZEKE Trader agentic trading system. It covers architecture, conventions, workflows, and best practices to ensure consistent, high-quality contributions.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Repository Structure](#repository-structure)
3. [Development Environment Setup](#development-environment-setup)
4. [Key Architectural Patterns](#key-architectural-patterns)
5. [Code Conventions & Style Guide](#code-conventions--style-guide)
6. [Common Tasks & Workflows](#common-tasks--workflows)
7. [Testing Guidelines](#testing-guidelines)
8. [Safety & Risk Management](#safety--risk-management)
9. [AI Assistant Best Practices](#ai-assistant-best-practices)
10. [Quick Reference](#quick-reference)

---

## Project Overview

### What is ZEKE Trader?

ZEKE Trader is a **self-contained agentic trading module** that uses the OpenAI Agents SDK and Alpaca API for automated trading. It's designed as a conservative, safety-first system with multiple risk gates and full auditability.

### Core Principles

1. **Paper-First**: Safe paper trading by default
2. **Shadow Mode**: Test decisions without executing orders
3. **Conservative Agent**: Low-frequency trend following, defaults to NO_TRADE
4. **Deterministic Risk Gates**: Hard limits before every trade
5. **Full Audit Trail**: Every decision, trade, and equity snapshot logged
6. **Dual Safety Latch**: Live trading requires BOTH `TRADING_MODE=live` AND `LIVE_TRADING_ENABLED=true`

### Technology Stack

**Core Framework:**
- Python 3.11+
- OpenAI Agents SDK 0.6.1
- Pydantic for schemas and validation

**Trading Infrastructure:**
- Alpaca API (paper & live trading)
- Perplexity API (fundamental research)
- Streamlit (real-time dashboard)

**Data & Analytics:**
- JSON/JSONL logging for loop results
- CSV logging for trades and equity
- Performance metrics with Kelly Criterion
- Live readiness scoring system

**Trading Strategy:**
- Turtle Trading (trend following)
- ATR-based position sizing
- Trailing stops with ATR multiples
- Regime detection (ADX-based)
- Volume and trend filters

### Design Principles

1. **Safety by Default**: Multiple layers of protection
2. **Conservative Bias**: Prefer NO_TRADE to risky trades
3. **Full Transparency**: Every decision is logged and explainable
4. **Modularity**: Each agent has a single, well-defined responsibility
5. **Deterministic Risk**: No AI-based risk decisions, only rule-based gates

---

## Repository Structure

```
zeke_trader/
├── __init__.py              # Package initialization
├── README.md                # User-facing documentation
├── CLAUDE.md                # This file
├── .env.example             # Environment variables template
│
├── main.py                  # Trading loop entry point
├── config.py                # Configuration + safety latches
├── schemas.py               # Pydantic models (old simple schemas)
├── agent.py                 # Legacy single-agent implementation
├── risk.py                  # Legacy risk check functions
├── logger.py                # CSV/JSONL logging
├── metrics.py               # Performance analytics + live readiness
├── broker_mcp.py            # Alpaca broker wrapper
│
├── agents/                  # Multi-agent system (NEW)
│   ├── __init__.py
│   ├── schemas.py           # Comprehensive Pydantic models
│   ├── orchestrator.py      # Top-level conductor
│   ├── market_data.py       # Fetch market snapshots
│   ├── signal.py            # Generate trading signals
│   ├── portfolio.py         # Account & position state
│   ├── decision.py          # Pick one trade from signals
│   ├── risk_gate.py         # Deterministic validation
│   ├── execution.py         # Execute or queue trades
│   ├── observability.py     # Comprehensive logging
│   └── perplexity_research.py # Fundamental research
│
├── strategy/                # Trading strategies
│   ├── __init__.py
│   ├── turtle.py            # Turtle Trading system
│   ├── scoring.py           # Signal quality scoring
│   └── position_sizing.py   # Kelly Criterion sizing
│
├── discovery/               # Universe management
│   ├── __init__.py
│   ├── schemas.py           # Discovery data models
│   ├── universe_scan.py     # Scan universe for opportunities
│   ├── qualification.py     # Quality checks for symbols
│   ├── filters.py           # Technical filters
│   ├── scheduler.py         # Discovery scheduling
│   └── planner.py           # Research planning
│
├── services/                # External service clients
│   ├── __init__.py
│   └── news_client.py       # News API integration
│
├── analytics/               # Performance analysis
│   ├── __init__.py
│   └── performance.py       # Trade performance analytics
│
├── batch/                   # Batch processing jobs
│   ├── __init__.py
│   └── overnight_analyzer.py # End-of-day analysis
│
├── dashboard/               # Streamlit dashboard
│   ├── __init__.py
│   └── app.py               # Real-time visualization
│
├── tests/                   # Unit and integration tests
│   ├── __init__.py
│   ├── test_metrics_live_readiness.py
│   └── test_safety.py
│
├── logs/                    # Generated at runtime
│   ├── loops/               # JSONL loop results
│   ├── equity/              # JSONL equity snapshots
│   ├── reports/             # JSON daily reports
│   ├── decisions.csv        # Legacy decision log
│   ├── trades.csv           # Legacy trade log
│   └── equity.csv           # Legacy equity log
│
└── api.py                   # FastAPI REST/WebSocket server
```

---

## Development Environment Setup

### Prerequisites

**Required:**
- **Python**: 3.11+
- **OpenAI API Key**: For agent decisions
- **Alpaca API Keys**: For market data and trading

**Optional:**
- **Perplexity API Key**: For fundamental research
- **Streamlit**: For dashboard visualization

### Installation

```bash
# From repository root
cd zeke_trader

# Install dependencies (using main project's pyproject.toml)
cd ..
pip install .

# Or with uv
uv pip install .
```

### Environment Variables

Create a `.env` file in the **repository root** (not in `zeke_trader/`):

```bash
# Copy template
cp zeke_trader/.env.example .env
```

**Required Variables:**

```bash
# OpenAI API Key (required for agent decisions)
OPENAI_API_KEY=sk-...

# Alpaca API Keys (required for trading)
ALPACA_KEY_ID=PK...
ALPACA_SECRET_KEY=...

# Trading Mode: paper | shadow | live
TRADING_MODE=paper

# Live Trading Safety Latch (both required for live trading)
LIVE_TRADING_ENABLED=false
```

**Optional Variables:**

```bash
# Autonomy Level: manual | moderate | full_agentic
AUTONOMY_TIER=manual

# Allowed Symbols (comma-separated)
ALLOWED_SYMBOLS=NVDA,SPY,META,GOOGL,AVGO,GOOG,AMZN

# Risk Limits
MAX_DOLLARS_PER_TRADE=25
MAX_OPEN_POSITIONS=3
MAX_TRADES_PER_DAY=5
MAX_DAILY_LOSS=25

# Loop Configuration
LOOP_SECONDS=60

# Perplexity Research
PERPLEXITY_API_KEY=...
PERPLEXITY_ENABLED=true
PERPLEXITY_SCORE_THRESHOLD=4.0

# Kelly Criterion Position Sizing
KELLY_ENABLED=true
KELLY_FRACTION=0.5
KELLY_LOOKBACK_TRADES=40
KELLY_MIN_TRADES=10
KELLY_MAX_POSITION_PCT=0.25

# Circuit Breaker
CIRCUIT_BREAKER_ENABLED=true
CIRCUIT_BREAKER_DAILY_LIMIT=0.05
CIRCUIT_BREAKER_WEEKLY_LIMIT=0.10

# Volume & Trend Filters
VOLUME_FILTER_ENABLED=true
VOLUME_THRESHOLD=1.5
TREND_FILTER_ENABLED=true

# Trailing Stops
TRAILING_STOP_ENABLED=true
TRAILING_STOP_ATR_MULTIPLE=2.5

# Regime Detection
REGIME_DETECTION_ENABLED=true
REGIME_ADX_PERIOD=14
REGIME_TREND_THRESHOLD=25.0

# Logging
LOG_DIR=zeke_trader/logs
```

### Running the System

**Trading Loop:**
```bash
# From repository root
python -m zeke_trader.main
```

**Dashboard (separate terminal):**
```bash
streamlit run zeke_trader/dashboard/app.py --server.port 8501 --server.address 0.0.0.0
```

**FastAPI Server (for external integration):**
```bash
python -m zeke_trader.api
# Runs on http://localhost:8000
# WebSocket: ws://localhost:8000/ws
```

---

## Key Architectural Patterns

### 1. Multi-Agent Orchestration

ZEKE Trader uses a **strict sequential handoff** pattern with 7 specialized agents coordinated by an Orchestrator.

**Agent Pipeline:**

```
┌─────────────────────────────────────────────────┐
│              OrchestratorAgent                  │
│  (Runs loop, coordinates handoffs)              │
└──────────────────┬──────────────────────────────┘
                   │
      ┌────────────┴────────────┐
      │                         │
      ▼                         ▼
┌─────────────┐           ┌─────────────┐
│ [1] Market  │──────────>│ [2] Signal  │
│ Data Agent  │           │ Agent       │
└─────────────┘           └──────┬──────┘
                                 │
                                 ▼
                          ┌─────────────┐
                          │ [3] Portfolio│
                          │ Agent       │
                          └──────┬──────┘
                                 │
      ┌──────────────────────────┘
      │
      ▼
┌─────────────┐           ┌─────────────┐
│ [4] Decision│──────────>│ [5] Risk    │
│ Agent       │           │ Gate Agent  │
└─────────────┘           └──────┬──────┘
                                 │
                                 ▼
                          ┌─────────────┐
                          │ [6] Execution│
                          │ Agent       │
                          └──────┬──────┘
                                 │
                                 ▼
                          ┌─────────────┐
                          │ [7] Observ- │
                          │ ability     │
                          └─────────────┘
```

**Agent Responsibilities:**

| Agent | File | Purpose | Output |
|-------|------|---------|--------|
| **MarketDataAgent** | `agents/market_data.py` | Fetch market snapshots | `MarketSnapshot` |
| **SignalAgent** | `agents/signal.py` | Generate trading signals | `list[TradeSignal]` |
| **PortfolioAgent** | `agents/portfolio.py` | Get account state | `PortfolioState` |
| **DecisionAgent** | `agents/decision.py` | Pick one trade | `TradeIntent` or `NoTrade` |
| **RiskGateAgent** | `agents/risk_gate.py` | Validate trade | `RiskGateResult` |
| **ExecutionAgent** | `agents/execution.py` | Execute or queue | `OrderResult`, `PendingTrade` |
| **ObservabilityAgent** | `agents/observability.py` | Log everything | JSONL logs |

**Special Agent:**

- **PerplexityResearchAgent** (`agents/perplexity_research.py`): Runs between Signal and Decision to provide fundamental research on high-score signals

**Handoff Flow:**

```python
# agents/orchestrator.py
async def run_loop(self) -> LoopResult:
    # [1/7] Fetch market data
    snapshot = await self.market_data.fetch_snapshot()

    # [2/7] Get portfolio state
    portfolio = await self.portfolio.get_portfolio_state()

    # [3/7] Generate signals
    signals = self.signal.generate_signals(snapshot, portfolio)

    # [3.5/7] Research high-impact signals (optional)
    research_insights = await self.perplexity.research_signals(signals)

    # [4/7] Make decision
    decision = self.decision.make_decision(signals, portfolio, research_insights)

    # [5/7] Validate with risk gate
    risk_result = self.risk_gate.validate(decision, portfolio)

    # [6/7] Execute trade
    order_result, pending = self.execution.execute(risk_result)

    # [7/7] Log everything
    self.observability.log_loop(result)

    return result
```

### 2. Trading Modes

ZEKE Trader supports three distinct trading modes with different execution behaviors:

**Paper Mode (Default):**
```python
TRADING_MODE=paper
```
- Orders execute on Alpaca paper trading account
- No real money at risk
- Full functionality testing

**Shadow Mode:**
```python
TRADING_MODE=shadow
```
- Agent makes decisions
- Risk checks run
- Orders are **NEVER executed** (logged only)
- Perfect for testing agent logic

**Live Mode:**
```python
TRADING_MODE=live
LIVE_TRADING_ENABLED=true  # BOTH required
```
- Real money orders execute
- Dual safety latch required
- Use with extreme caution

**Implementation:**

```python
# config.py
def can_execute_orders(self) -> bool:
    """Check if order execution is allowed."""
    if self.trading_mode == TradingMode.SHADOW:
        return False  # Never execute in shadow
    if self.trading_mode == TradingMode.LIVE:
        return self.live_trading_enabled  # Require dual latch
    return True  # Paper mode OK
```

### 3. Autonomy Tiers

The system supports three levels of human oversight:

| Tier | Value | Behavior |
|------|-------|----------|
| **Manual** | `manual` | All trades require manual approval |
| **Moderate** | `moderate` | Small trades auto-execute, large ones require approval |
| **Full Agentic** | `full_agentic` | All trades auto-execute (subject to risk gates) |

**Configuration:**
```bash
AUTONOMY_TIER=manual  # Default
```

**Implementation:**

```python
# agents/execution.py
def execute(self, risk_result: RiskGateResult) -> tuple[OrderResult, Optional[PendingTrade]]:
    if not risk_result.approved:
        return OrderResult(executed=False, status="rejected"), None

    if self.config.autonomy_tier == AutonomyTier.MANUAL:
        # Queue for manual approval
        return self._queue_for_approval(risk_result.trade_intent)

    # Auto-execute
    return self._execute_order(risk_result.trade_intent), None
```

### 4. Risk Gate System

The **RiskGateAgent** performs deterministic validation on every trade decision. This is NOT AI-based—it's rule-based and predictable.

**Risk Checks:**

```python
# agents/risk_gate.py
def validate(self, decision, portfolio, **kwargs) -> RiskGateResult:
    checks = []

    # 1. Symbol allowlist
    if decision.symbol not in self.config.allowed_symbols:
        return RiskGateResult(approved=False, reason="Symbol not allowed")

    # 2. Max dollars per trade
    if decision.notional_usd > self.config.max_dollars_per_trade:
        # Adjust notional down
        decision.notional_usd = self.config.max_dollars_per_trade
        checks.append("Notional reduced to limit")

    # 3. Max open positions
    if len(portfolio.positions) >= self.config.max_open_positions:
        return RiskGateResult(approved=False, reason="Position limit reached")

    # 4. Max trades per day
    if self._count_trades_today() >= self.config.max_trades_per_day:
        return RiskGateResult(approved=False, reason="Daily trade limit")

    # 5. Max daily loss circuit breaker
    if portfolio.pnl_day < -self.config.max_daily_loss:
        return RiskGateResult(approved=False, reason="Daily loss limit breached")

    # 6. Kelly Criterion position sizing (if enabled)
    if self.config.kelly_enabled:
        kelly_notional = self._calculate_kelly_size(decision.symbol, portfolio)
        if kelly_notional < decision.notional_usd:
            decision.notional_usd = kelly_notional
            checks.append("Kelly sizing applied")

    # 7. Circuit breaker (weekly/daily drawdown)
    if self.config.circuit_breaker_enabled:
        if self._check_circuit_breaker():
            return RiskGateResult(approved=False, reason="Circuit breaker triggered")

    return RiskGateResult(
        approved=True,
        trade_intent=decision,
        checks=checks,
    )
```

### 5. Trading Strategy (Turtle Trading)

ZEKE Trader uses a **Turtle Trading** system—a trend-following strategy based on breakouts and ATR-based stops.

**Core Components:**

```python
# strategy/turtle.py
class TurtleStrategy:
    """
    Turtle Trading System
    - Entry: 20-day high (long) or 20-day low (short)
    - Stop: 2 ATR from entry
    - Position sizing: Based on ATR and account risk
    """

    def generate_signals(self, market_data: dict, positions: list) -> list[TradeSignal]:
        signals = []

        for symbol, data in market_data.items():
            # Exit existing positions first
            if self._has_position(symbol, positions):
                exit_signal = self._check_exit(symbol, data, positions)
                if exit_signal:
                    signals.append(exit_signal)
                    continue

            # Entry signals
            if self._is_20_day_high(data):
                signals.append(self._create_long_signal(symbol, data))
            elif self._is_20_day_low(data):
                signals.append(self._create_short_signal(symbol, data))

        return signals
```

**Signal Types:**

```python
# agents/schemas.py
class SignalDirection(str, Enum):
    LONG = "long"           # Open long position
    SHORT = "short"         # Open short position
    EXIT_LONG = "exit_long" # Close long position
    EXIT_SHORT = "exit_short" # Close short position

class TradingSystem(str, Enum):
    TURTLE_20 = "turtle_20"  # 20-day breakout
    TURTLE_55 = "turtle_55"  # 55-day breakout
```

**Exit Triggers:**

```python
class ExitTrigger(str, Enum):
    STOP_HIT = "stop_hit"           # Stop loss triggered
    TURTLE_10 = "turtle_10"         # 10-day opposite breakout
    TRAILING_STOP = "trailing_stop" # Trailing stop hit
    DISCRETIONARY = "discretionary" # Manual exit
```

### 6. Position Sizing (Kelly Criterion)

The system uses the **Kelly Criterion** for position sizing based on historical win rate and avg win/loss.

**Formula:**

```
Kelly % = (win_rate * avg_win - loss_rate * avg_loss) / avg_win
Position size = Kelly % * kelly_fraction * portfolio_equity
```

**Implementation:**

```python
# strategy/position_sizing.py
def calculate_kelly_position_size(
    portfolio_equity: float,
    win_rate: float,
    avg_win: float,
    avg_loss: float,
    kelly_fraction: float = 0.5,
    max_position_pct: float = 0.25,
) -> float:
    """Calculate position size using Kelly Criterion."""
    if win_rate <= 0 or avg_win <= 0:
        return 0.0

    loss_rate = 1 - win_rate
    kelly_pct = (win_rate * avg_win - loss_rate * avg_loss) / avg_win
    kelly_pct = max(0.0, kelly_pct)  # No negative sizing

    # Apply fractional Kelly for safety
    fractional_kelly = kelly_pct * kelly_fraction

    # Cap at max position %
    final_pct = min(fractional_kelly, max_position_pct)

    return portfolio_equity * final_pct
```

**Usage in Risk Gate:**

```python
# agents/risk_gate.py
if self.config.kelly_enabled:
    trades = self._load_trade_history()
    if len(trades) >= self.config.kelly_min_trades:
        win_rate, avg_win, avg_loss = self._calculate_stats(trades)
        kelly_size = calculate_kelly_position_size(
            portfolio.equity,
            win_rate,
            avg_win,
            avg_loss,
            self.config.kelly_fraction,
            self.config.kelly_max_position_pct,
        )
        if kelly_size < decision.notional_usd:
            decision.notional_usd = kelly_size
```

### 7. Perplexity Research Integration

For high-quality signals, the system optionally queries Perplexity for fundamental research.

**Flow:**

```python
# agents/perplexity_research.py
class PerplexityResearchAgent:
    async def research_signals(
        self,
        signals: list[ScoredSignal],
    ) -> dict[str, ResearchInsight]:
        """Research top signals with Perplexity."""
        # Filter to top N signals
        top_signals = sorted(signals, key=lambda s: s.score, reverse=True)[:3]

        insights = {}
        for signal in top_signals:
            prompt = self._build_research_prompt(signal)
            response = await self._query_perplexity(prompt)
            insight = self._parse_response(response)
            insights[signal.symbol] = insight

        return insights
```

**Integration in Decision:**

```python
# agents/decision.py
def make_decision(
    self,
    signals: list[TradeSignal],
    portfolio: PortfolioState,
    research_insights: dict[str, ResearchInsight] = None,
) -> Union[TradeIntent, NoTrade]:
    # Prioritize signals with positive research
    if research_insights:
        for signal in signals:
            insight = research_insights.get(signal.symbol)
            if insight and insight.score >= self.config.perplexity_score_threshold:
                return self._create_trade_intent(signal, insight)

    # Fall back to highest-score signal
    return self._pick_best_signal(signals)
```

### 8. Logging & Observability

ZEKE Trader maintains comprehensive logs for full auditability.

**Log Types:**

| Log Type | Format | Location | Purpose |
|----------|--------|----------|---------|
| **Loop Results** | JSONL | `logs/loops/loop_*.json` | Complete loop execution trace |
| **Equity Snapshots** | JSONL | `logs/equity/equity_*.jsonl` | Time-series equity data |
| **Daily Reports** | JSON | `logs/reports/daily_report_*.json` | End-of-day summary |
| **Trade Critiques** | JSONL | `logs/reports/trade_critiques_*.jsonl` | Post-trade analysis |
| **Decisions (legacy)** | CSV | `logs/decisions.csv` | Simple decision log |
| **Trades (legacy)** | CSV | `logs/trades.csv` | Simple trade log |
| **Equity (legacy)** | CSV | `logs/equity.csv` | Simple equity log |

**Loop Result Schema:**

```python
# agents/schemas.py
class LoopResult(BaseModel):
    timestamp: datetime
    market_snapshot: MarketSnapshot
    signals: list[TradeSignal]
    portfolio_state: PortfolioState
    decision: Union[TradeIntent, NoTrade]
    risk_result: Optional[RiskGateResult]
    order_result: Optional[OrderResult]
    pending_trade: Optional[PendingTrade]
    perplexity_research: Optional[dict]
    errors: list[str]
    duration_ms: float
```

**Logging Implementation:**

```python
# agents/observability.py
class ObservabilityAgent:
    def log_loop(self, result: LoopResult):
        """Log complete loop result to JSONL."""
        timestamp = result.timestamp.strftime("%Y%m%d_%H%M%S")
        loop_id = f"loop_{timestamp}_{uuid.uuid4().hex[:8]}"

        log_path = self.config.log_dir / "loops" / f"{loop_id}.json"
        log_path.parent.mkdir(parents=True, exist_ok=True)

        with open(log_path, "w") as f:
            json.dump(result.model_dump(mode="json"), f, indent=2)
```

### 9. Live Readiness Scoring

Before enabling live trading, the system evaluates readiness across multiple dimensions.

**Components:**

```python
# metrics.py
def evaluate_live_readiness(self) -> dict:
    """Evaluate if system is ready for live trading."""
    components = [
        self._score_configuration(),      # Config completeness
        self._score_safety_limits(),      # Risk limits set
        self._score_logging_health(),     # Logs working
        self._score_paper_track_record(), # Paper performance
    ]

    overall_score = sum(c["score"] for c in components)
    gating_issues = [issue for c in components for issue in c.get("issues", [])]

    return {
        "overall_score": overall_score,
        "ready": overall_score >= 85 and len(gating_issues) == 0,
        "components": components,
        "gating_issues": gating_issues,
    }
```

**Display:**

```python
# main.py
def _print_live_readiness(self) -> None:
    readiness = self.metrics.evaluate_live_readiness()

    print("LIVE READINESS EVALUATION")
    print("-" * 60)
    print(f"Score: {readiness['overall_score']:.1f}/100 | "
          f"Ready: {'YES' if readiness['ready'] else 'NO'}")

    if readiness["gating_issues"]:
        print("Gating issues:")
        for issue in readiness["gating_issues"]:
            print(f"  • {issue}")
```

---

## Code Conventions & Style Guide

### Python Guidelines

**1. Type Hints:**

All functions must have type hints.

```python
# ✅ GOOD
async def fetch_snapshot(self) -> MarketSnapshot:
    """Fetch current market snapshot."""
    ...

def calculate_atr(prices: list[float], period: int = 14) -> float:
    """Calculate Average True Range."""
    ...

# ❌ BAD - No type hints
def fetch_snapshot(self):
    ...
```

**2. Pydantic Models:**

Use Pydantic for all data models.

```python
# ✅ GOOD
from pydantic import BaseModel, Field

class TradeSignal(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=10)
    direction: SignalDirection
    current_price: float = Field(gt=0)
    score: float = Field(ge=0, le=10)

# ❌ BAD - Plain dict
signal = {
    "symbol": "NVDA",
    "direction": "long",
    "price": 123.45,
}
```

**3. Async/Await:**

Use async for I/O operations (API calls, file I/O).

```python
# ✅ GOOD
async def fetch_market_data(self, symbols: list[str]) -> dict:
    tasks = [self._fetch_symbol(s) for s in symbols]
    results = await asyncio.gather(*tasks)
    return dict(zip(symbols, results))

# ❌ BAD - Synchronous I/O
def fetch_market_data(self, symbols: list[str]) -> dict:
    results = {}
    for symbol in symbols:
        results[symbol] = self._fetch_symbol(symbol)  # Sequential!
    return results
```

**4. Enums for Constants:**

```python
# ✅ GOOD
from enum import Enum

class SignalDirection(str, Enum):
    LONG = "long"
    SHORT = "short"
    EXIT_LONG = "exit_long"

direction = SignalDirection.LONG

# ❌ BAD - String constants
direction = "long"  # Typo-prone
```

**5. Logging:**

```python
import logging

logger = logging.getLogger("zeke_trader.agents.signal")

# ✅ GOOD
logger.info(f"Generated {len(signals)} signals for {symbol}")
logger.warning(f"Missing data for {symbol}, skipping")
logger.error(f"Failed to fetch {symbol}", exc_info=True)

# ❌ BAD - Print statements
print(f"Signals: {signals}")
```

**6. Error Handling:**

```python
# ✅ GOOD
try:
    snapshot = await self.broker.get_snapshot()
except Exception as e:
    logger.error(f"Snapshot failed: {e}", exc_info=True)
    return MarketSnapshot()  # Return safe default

# ❌ BAD - Bare except
try:
    snapshot = await self.broker.get_snapshot()
except:
    pass  # Silent failure!
```

### Naming Conventions

**Files:**
- Modules: `snake_case.py` (e.g., `market_data.py`)
- Agents: `<purpose>_agent.py` or just `<purpose>.py` in `agents/` directory

**Classes:**
- PascalCase with descriptive names
- Agents: `<Purpose>Agent` (e.g., `SignalAgent`, `RiskGateAgent`)
- Models: Descriptive nouns (e.g., `TradeSignal`, `PortfolioState`)

**Functions:**
- `snake_case` for all functions
- Async functions: No special prefix needed

**Variables:**
- `snake_case` for local variables
- `UPPER_SNAKE_CASE` for module-level constants

**Example:**

```python
# config.py
MAX_TRADES_PER_DAY = 5  # Constant

class TradingConfig:  # Class: PascalCase
    max_trades_per_day: int = MAX_TRADES_PER_DAY

    def can_execute_orders(self) -> bool:  # Method: snake_case
        return self.trading_mode != TradingMode.SHADOW

# agents/signal.py
class SignalAgent:  # Agent class
    async def generate_signals(  # Async method
        self,
        snapshot: MarketSnapshot,  # Parameter: snake_case
        portfolio: PortfolioState,
    ) -> list[TradeSignal]:
        long_signals = []  # Local var: snake_case
        ...
```

### Documentation

**Docstrings:**

```python
# ✅ GOOD - Comprehensive docstring
async def fetch_snapshot(self, symbols: list[str]) -> MarketSnapshot:
    """
    Fetch current market snapshot for given symbols.

    Args:
        symbols: List of stock symbols to fetch

    Returns:
        MarketSnapshot with current prices, account state, and positions

    Raises:
        AlpacaAPIError: If API call fails
    """
    ...

# ❌ BAD - No docstring
async def fetch_snapshot(self, symbols: list[str]) -> MarketSnapshot:
    ...
```

**Inline Comments:**

```python
# ✅ GOOD - Explain WHY
# Use fractional Kelly to reduce risk of overbetting
fractional_kelly = kelly_pct * self.config.kelly_fraction

# ❌ BAD - Explain WHAT (obvious from code)
# Multiply kelly_pct by kelly_fraction
fractional_kelly = kelly_pct * self.config.kelly_fraction
```

---

## Common Tasks & Workflows

### Adding a New Agent

**1. Create agent class:**

```python
# agents/my_new_agent.py
import logging
from .schemas import MyAgentInput, MyAgentOutput
from ..config import TradingConfig

logger = logging.getLogger("zeke_trader.agents.my_new_agent")

class MyNewAgent:
    """
    MyNewAgent - Brief description of role.

    Responsibilities:
    - First responsibility
    - Second responsibility
    """

    def __init__(self, config: TradingConfig):
        self.config = config
        logger.info("MyNewAgent initialized")

    async def do_work(self, input: MyAgentInput) -> MyAgentOutput:
        """Main agent logic."""
        logger.info("Starting work...")

        try:
            # Implementation...
            result = MyAgentOutput(...)
            return result
        except Exception as e:
            logger.error(f"Work failed: {e}", exc_info=True)
            raise
```

**2. Add schemas:**

```python
# agents/schemas.py
class MyAgentInput(BaseModel):
    """Input for MyNewAgent."""
    param1: str
    param2: int

class MyAgentOutput(BaseModel):
    """Output from MyNewAgent."""
    result: str
    confidence: float
```

**3. Integrate into orchestrator:**

```python
# agents/orchestrator.py
from .my_new_agent import MyNewAgent

class OrchestratorAgent:
    def __init__(self, config: TradingConfig):
        # ... existing agents ...
        self.my_new_agent = MyNewAgent(config)

    async def run_loop(self) -> LoopResult:
        # ... existing flow ...

        # Add at appropriate point in pipeline
        logger.info("[X/7] Running my new agent...")
        my_result = await self.my_new_agent.do_work(my_input)
        result.my_result = my_result

        # ... continue flow ...
```

**4. Export from package:**

```python
# agents/__init__.py
from .my_new_agent import MyNewAgent

__all__ = [
    "OrchestratorAgent",
    "MyNewAgent",
    # ...
]
```

### Adding a New Risk Check

**1. Add configuration:**

```python
# config.py
@dataclass
class TradingConfig:
    # ... existing config ...

    my_risk_check_enabled: bool = True
    my_risk_threshold: float = 0.5

def load_config() -> TradingConfig:
    return TradingConfig(
        # ... existing fields ...
        my_risk_check_enabled=os.getenv("MY_RISK_CHECK_ENABLED", "true").lower() == "true",
        my_risk_threshold=float(os.getenv("MY_RISK_THRESHOLD", "0.5")),
    )
```

**2. Implement check in RiskGateAgent:**

```python
# agents/risk_gate.py
def validate(self, decision, portfolio, **kwargs) -> RiskGateResult:
    # ... existing checks ...

    # My new risk check
    if self.config.my_risk_check_enabled:
        if not self._my_risk_check(decision, portfolio):
            return RiskGateResult(
                approved=False,
                trade_intent=None,
                reason="MY_RISK_CHECK_FAILED: Description of why",
                checks=[],
            )

    # ... continue validation ...

def _my_risk_check(self, decision: TradeIntent, portfolio: PortfolioState) -> bool:
    """Check my custom risk condition."""
    # Implementation...
    return True  # or False
```

**3. Add to .env.example:**

```bash
# .env.example
# My Risk Check
MY_RISK_CHECK_ENABLED=true
MY_RISK_THRESHOLD=0.5
```

### Adding a New Trading Strategy

**1. Create strategy class:**

```python
# strategy/my_strategy.py
import logging
from typing import Optional
from ..agents.schemas import TradeSignal, SignalDirection, TradingSystem

logger = logging.getLogger("zeke_trader.strategy.my_strategy")

class MyStrategy:
    """
    My Trading Strategy - Brief description.

    Entry:
    - Describe entry conditions

    Exit:
    - Describe exit conditions

    Stop Loss:
    - Describe stop logic
    """

    def __init__(self, config):
        self.config = config
        logger.info("MyStrategy initialized")

    def generate_signals(
        self,
        market_data: dict,
        positions: list,
    ) -> list[TradeSignal]:
        """Generate trading signals."""
        signals = []

        for symbol, data in market_data.items():
            # Check exits first
            if self._has_position(symbol, positions):
                exit_signal = self._check_exit(symbol, data, positions)
                if exit_signal:
                    signals.append(exit_signal)
                    continue

            # Entry logic
            if self._check_entry_long(data):
                signals.append(self._create_long_signal(symbol, data))
            elif self._check_entry_short(data):
                signals.append(self._create_short_signal(symbol, data))

        return signals

    def _check_entry_long(self, data) -> bool:
        """Check if long entry conditions met."""
        # Implementation...
        return False

    def _create_long_signal(self, symbol: str, data) -> TradeSignal:
        """Create long entry signal."""
        return TradeSignal(
            symbol=symbol,
            direction=SignalDirection.LONG,
            system=TradingSystem.MY_STRATEGY,  # Add to enum
            current_price=data.quote.last,
            score=5.0,
            # ... other fields ...
        )
```

**2. Update enums:**

```python
# agents/schemas.py
class TradingSystem(str, Enum):
    TURTLE_20 = "turtle_20"
    TURTLE_55 = "turtle_55"
    MY_STRATEGY = "my_strategy"  # Add here
```

**3. Integrate in SignalAgent:**

```python
# agents/signal.py
from ..strategy.my_strategy import MyStrategy

class SignalAgent:
    def __init__(self, config: TradingConfig):
        self.turtle = TurtleStrategy(config)
        self.my_strategy = MyStrategy(config)  # Add here

    def generate_signals(self, snapshot, portfolio) -> list[TradeSignal]:
        signals = []

        # Turtle signals
        signals.extend(self.turtle.generate_signals(snapshot.market_data, portfolio.positions))

        # My strategy signals
        signals.extend(self.my_strategy.generate_signals(snapshot.market_data, portfolio.positions))

        return signals
```

### Adding a Configuration Option

**1. Add to TradingConfig:**

```python
# config.py
@dataclass
class TradingConfig:
    # ... existing fields ...

    my_new_option: bool = False
    my_new_threshold: float = 1.0
```

**2. Add to load_config():**

```python
# config.py
def load_config() -> TradingConfig:
    return TradingConfig(
        # ... existing fields ...
        my_new_option=os.getenv("MY_NEW_OPTION", "false").lower() == "true",
        my_new_threshold=float(os.getenv("MY_NEW_THRESHOLD", "1.0")),
    )
```

**3. Add to .env.example:**

```bash
# .env.example
# My New Feature
MY_NEW_OPTION=false
MY_NEW_THRESHOLD=1.0
```

**4. Document in README:**

```markdown
# README.md
## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MY_NEW_OPTION` | `false` | Enable my new feature |
| `MY_NEW_THRESHOLD` | `1.0` | Threshold for my feature |
```

---

## Testing Guidelines

### Unit Tests

**Location:** `tests/`

**Example:**

```python
# tests/test_my_feature.py
import pytest
from zeke_trader.agents.my_agent import MyAgent
from zeke_trader.config import TradingConfig

@pytest.fixture
def config():
    """Test configuration."""
    return TradingConfig(
        openai_api_key="test",
        alpaca_key_id="test",
        alpaca_secret_key="test",
        trading_mode=TradingMode.SHADOW,
    )

@pytest.fixture
def agent(config):
    """Test agent instance."""
    return MyAgent(config)

def test_my_agent_basic(agent):
    """Test basic agent functionality."""
    result = agent.do_work(input)
    assert result.success is True

@pytest.mark.asyncio
async def test_my_agent_async(agent):
    """Test async agent functionality."""
    result = await agent.async_work(input)
    assert result is not None
```

**Running tests:**

```bash
# All tests
python -m pytest tests/ -v

# Specific test file
python -m pytest tests/test_my_feature.py -v

# With coverage
python -m pytest tests/ --cov=zeke_trader --cov-report=html

# Specific test
python -m pytest tests/test_my_feature.py::test_my_agent_basic -v
```

### Safety Tests

The system includes critical safety tests:

```python
# tests/test_safety.py
def test_live_trading_dual_latch():
    """Verify live trading requires BOTH latches."""
    # Only TRADING_MODE=live
    config = TradingConfig(
        trading_mode=TradingMode.LIVE,
        live_trading_enabled=False,
    )
    with pytest.raises(ValueError, match="SAFETY"):
        config._validate_safety()

    # Only LIVE_TRADING_ENABLED=true
    config = TradingConfig(
        trading_mode=TradingMode.PAPER,
        live_trading_enabled=True,
    )
    assert config.can_execute_orders() is True  # Paper mode OK

    # Both set correctly
    config = TradingConfig(
        trading_mode=TradingMode.LIVE,
        live_trading_enabled=True,
    )
    assert config.can_execute_orders() is True

def test_shadow_mode_never_executes():
    """Verify shadow mode never executes orders."""
    config = TradingConfig(trading_mode=TradingMode.SHADOW)
    assert config.can_execute_orders() is False
```

### Live Readiness Tests

```python
# tests/test_metrics_live_readiness.py
def test_live_readiness_scoring():
    """Test live readiness evaluation."""
    config = TradingConfig(...)
    metrics = TradingMetrics(config)

    readiness = metrics.evaluate_live_readiness()

    assert "overall_score" in readiness
    assert "ready" in readiness
    assert "components" in readiness
    assert readiness["overall_score"] >= 0
    assert readiness["overall_score"] <= 100
```

### Integration Tests

Test the full pipeline:

```python
# tests/test_integration.py
@pytest.mark.asyncio
async def test_full_loop():
    """Test complete trading loop in shadow mode."""
    config = TradingConfig(
        trading_mode=TradingMode.SHADOW,
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        alpaca_key_id=os.getenv("ALPACA_KEY_ID"),
        alpaca_secret_key=os.getenv("ALPACA_SECRET_KEY"),
    )

    orchestrator = OrchestratorAgent(config)
    result = await orchestrator.run_loop()

    assert result.timestamp is not None
    assert result.market_snapshot is not None
    assert isinstance(result.decision, (TradeIntent, NoTrade))
    assert len(result.errors) == 0
```

---

## Safety & Risk Management

### Critical Safety Principles

**1. NEVER bypass safety checks:**

```python
# ❌ EXTREMELY BAD - Bypassing safety
def execute_order_unsafe(self, symbol, side, notional):
    # Skip risk checks for "speed"
    return self.broker.place_order(symbol, side, notional)

# ✅ GOOD - Always validate
def execute_order(self, symbol, side, notional):
    risk_result = self.risk_gate.validate(decision, portfolio)
    if not risk_result.approved:
        logger.warning(f"Order blocked: {risk_result.reason}")
        return None
    return self.broker.place_order(symbol, side, notional)
```

**2. Default to NO_TRADE:**

```python
# ✅ GOOD - Conservative bias
if not self._has_clear_signal(data):
    return NoTrade(
        action="NO_TRADE",
        reason="No clear signal",
        confidence=0.0,
    )

# ❌ BAD - Forcing trades
if not self._has_clear_signal(data):
    # Trade anyway with random choice
    return TradeIntent(...)
```

**3. Validate ALL inputs:**

```python
# ✅ GOOD - Pydantic validation
class TradeIntent(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=10)
    notional_usd: float = Field(gt=0)  # Must be positive

    @field_validator("symbol")
    @classmethod
    def uppercase_symbol(cls, v: str) -> str:
        return v.upper().strip()

# ❌ BAD - No validation
def create_trade(symbol: str, notional: float):
    # Assume inputs are correct
    return {"symbol": symbol, "notional": notional}
```

**4. Log EVERYTHING:**

```python
# ✅ GOOD - Full audit trail
logger.info(f"Decision: {decision.action}, Symbol: {decision.symbol}, Notional: ${decision.notional_usd}")
logger.info(f"Risk check: {risk_result.approved}, Reason: {risk_result.reason}")
logger.info(f"Execution: {order_result.success}, Order ID: {order_result.order_id}")

# ❌ BAD - Silent execution
self.broker.place_order(symbol, side, notional)
```

**5. Test in Shadow mode first:**

```bash
# ✅ GOOD - Test new features in shadow
TRADING_MODE=shadow python -m zeke_trader.main

# ❌ BAD - Test in live immediately
TRADING_MODE=live LIVE_TRADING_ENABLED=true python -m zeke_trader.main
```

### Risk Limits Checklist

Before enabling live trading, verify:

- [ ] `MAX_DOLLARS_PER_TRADE` set to acceptable level
- [ ] `MAX_OPEN_POSITIONS` set (recommended: 3 or less)
- [ ] `MAX_TRADES_PER_DAY` set (recommended: 5 or less)
- [ ] `MAX_DAILY_LOSS` set to max acceptable loss
- [ ] `ALLOWED_SYMBOLS` limited to well-known, liquid stocks
- [ ] `KELLY_ENABLED=true` for position sizing
- [ ] `CIRCUIT_BREAKER_ENABLED=true` for drawdown protection
- [ ] Paper trading performance reviewed and acceptable
- [ ] Live readiness score >= 85

### Emergency Stop

If live trading needs to be stopped immediately:

**Method 1: Kill the process**
```bash
# Ctrl+C in terminal
# Or find and kill process
pkill -f "zeke_trader.main"
```

**Method 2: Disable via environment**
```bash
# Set in .env or environment
LIVE_TRADING_ENABLED=false

# Restart will run in paper mode
python -m zeke_trader.main
```

**Method 3: Change mode**
```bash
# Switch to shadow mode
TRADING_MODE=shadow python -m zeke_trader.main
```

---

## AI Assistant Best Practices

### When Making Changes

**1. Understand Safety Implications:**

Before modifying risk checks, trading logic, or execution:
- ✅ Read and understand the existing safety mechanisms
- ✅ Consider how change affects risk (could it allow larger positions? bypass checks?)
- ✅ Test in shadow mode first
- ❌ Never remove safety checks without explicit approval

**2. Maintain Conservative Bias:**

- ✅ When uncertain, default to NO_TRADE
- ✅ Prefer false negatives (missed opportunities) over false positives (bad trades)
- ❌ Don't optimize for "more trades"—optimize for "better trades"

**3. Test Thoroughly:**

```python
# ✅ GOOD - Test new strategy in shadow mode
def test_new_strategy():
    config = TradingConfig(trading_mode=TradingMode.SHADOW)
    # Run for full day in shadow
    # Review decision logs
    # Verify no unsafe trades would have executed

# ❌ BAD - Deploy to live immediately
def test_new_strategy():
    config = TradingConfig(trading_mode=TradingMode.LIVE, live_trading_enabled=True)
    # Hope it works!
```

**4. Document Risk Changes:**

```python
# ✅ GOOD - Clear documentation of risk change
def _check_max_position_size(self, decision: TradeIntent) -> bool:
    """
    Check if position size exceeds maximum allowed.

    SAFETY: This check prevents excessive position sizes that could
    lead to large losses. The limit is intentionally conservative.

    Changed 2026-01-05: Reduced limit from $50 to $25 per trade
    to further limit risk exposure.
    """
    return decision.notional_usd <= self.config.max_dollars_per_trade

# ❌ BAD - No explanation
def _check_max_position_size(self, decision: TradeIntent) -> bool:
    return decision.notional_usd <= self.config.max_dollars_per_trade
```

**5. Preserve Audit Trail:**

```python
# ✅ GOOD - Never delete logs
def cleanup_old_logs(self):
    """Archive logs older than 90 days (never delete)."""
    old_logs = self._find_logs_older_than(days=90)
    for log in old_logs:
        archive_path = self._get_archive_path(log)
        shutil.move(log, archive_path)
        logger.info(f"Archived log: {log} -> {archive_path}")

# ❌ BAD - Deleting audit trail
def cleanup_old_logs(self):
    old_logs = self._find_logs_older_than(days=7)
    for log in old_logs:
        os.remove(log)  # Destroys history!
```

### Code Review Checklist

When reviewing changes to ZEKE Trader:

**Safety:**
- [ ] No safety checks removed or weakened
- [ ] Risk limits still enforced
- [ ] Dual latch for live trading preserved
- [ ] Shadow mode still works
- [ ] Logging preserved

**Correctness:**
- [ ] Type hints on all functions
- [ ] Pydantic models for data
- [ ] Error handling in place
- [ ] Edge cases considered

**Testing:**
- [ ] Unit tests for new features
- [ ] Safety tests updated if needed
- [ ] Tested in shadow mode
- [ ] Integration test passes

**Documentation:**
- [ ] Docstrings on new functions
- [ ] README updated if needed
- [ ] CLAUDE.md updated if architecture changed
- [ ] .env.example updated for new config

---

## Quick Reference

### Essential Files

| File | Purpose |
|------|---------|
| `config.py` | Configuration + safety latches |
| `main.py` | Trading loop entry point |
| `agents/orchestrator.py` | Main orchestration logic |
| `agents/schemas.py` | Pydantic models for all data |
| `agents/risk_gate.py` | Deterministic risk validation |
| `agents/execution.py` | Order execution + queuing |
| `strategy/turtle.py` | Turtle trading strategy |
| `strategy/position_sizing.py` | Kelly Criterion sizing |
| `broker_mcp.py` | Alpaca API wrapper |
| `metrics.py` | Performance + live readiness |
| `api.py` | FastAPI REST/WebSocket server |

### Common Commands

```bash
# Run trading loop
python -m zeke_trader.main

# Run in shadow mode (no execution)
TRADING_MODE=shadow python -m zeke_trader.main

# Run dashboard
streamlit run zeke_trader/dashboard/app.py --server.port 8501

# Run API server
python -m zeke_trader.api

# Run tests
python -m pytest tests/ -v

# Run safety tests
python -m pytest tests/test_safety.py -v

# Run with coverage
python -m pytest tests/ --cov=zeke_trader --cov-report=html
```

### Environment Variables Quick Reference

**Essential:**
```bash
OPENAI_API_KEY=sk-...
ALPACA_KEY_ID=PK...
ALPACA_SECRET_KEY=...
TRADING_MODE=paper  # paper|shadow|live
LIVE_TRADING_ENABLED=false  # Dual latch for live
```

**Risk Limits:**
```bash
MAX_DOLLARS_PER_TRADE=25
MAX_OPEN_POSITIONS=3
MAX_TRADES_PER_DAY=5
MAX_DAILY_LOSS=25
```

**Features:**
```bash
AUTONOMY_TIER=manual  # manual|moderate|full_agentic
KELLY_ENABLED=true
PERPLEXITY_ENABLED=true
CIRCUIT_BREAKER_ENABLED=true
TRAILING_STOP_ENABLED=true
REGIME_DETECTION_ENABLED=true
```

### Agent Summary

| Agent | Purpose | Input | Output |
|-------|---------|-------|--------|
| **Orchestrator** | Coordinate pipeline | Config | LoopResult |
| **MarketData** | Fetch data | Symbols | MarketSnapshot |
| **Signal** | Generate signals | MarketSnapshot | list[TradeSignal] |
| **Portfolio** | Account state | - | PortfolioState |
| **Decision** | Pick one trade | Signals | TradeIntent/NoTrade |
| **RiskGate** | Validate | TradeIntent | RiskGateResult |
| **Execution** | Execute | RiskGateResult | OrderResult |
| **Observability** | Log | LoopResult | - |
| **Perplexity** | Research | Signals | ResearchInsight |

### Safety Checklist

Before enabling live trading:
- [ ] Paper trading successful for at least 7 days
- [ ] Live readiness score >= 85
- [ ] All risk limits configured
- [ ] Kelly sizing enabled
- [ ] Circuit breaker enabled
- [ ] Allowed symbols list reviewed
- [ ] Max position size acceptable
- [ ] Emergency stop procedures understood
- [ ] Logs reviewed and clean
- [ ] BOTH `TRADING_MODE=live` AND `LIVE_TRADING_ENABLED=true` set

### Log Files Reference

| Log | Format | Purpose |
|-----|--------|---------|
| `logs/loops/loop_*.json` | JSON | Complete loop trace |
| `logs/equity/equity_*.jsonl` | JSONL | Equity time series |
| `logs/reports/daily_report_*.json` | JSON | Daily summary |
| `logs/decisions.csv` | CSV | Legacy decisions |
| `logs/trades.csv` | CSV | Legacy trades |

---

## Additional Resources

**Main ZEKE Documentation:**
- [Main CLAUDE.md](../CLAUDE.md) - Root project guide
- [AGENTS.md](../AGENTS.md) - Main ZEKE agent system
- [CONTRIBUTING.md](../CONTRIBUTING.md) - General contributing guide

**External Documentation:**
- [OpenAI Agents SDK](https://github.com/openai/openai-agents)
- [Alpaca API Docs](https://alpaca.markets/docs/)
- [Perplexity API](https://docs.perplexity.ai/)
- [Pydantic Documentation](https://docs.pydantic.dev/)
- [Streamlit Documentation](https://docs.streamlit.io/)

**Trading Resources:**
- [Turtle Trading Rules](https://bigpicture.typepad.com/comments/files/turtlerules.pdf)
- [Kelly Criterion](https://en.wikipedia.org/wiki/Kelly_criterion)
- [ATR (Average True Range)](https://www.investopedia.com/terms/a/atr.asp)

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-05 | Initial CLAUDE.md creation for zeke_trader | Claude (AI Assistant) |

---

**Questions or Improvements?**

If you find gaps in this documentation or have suggestions, please update this file or notify the maintainer.

**REMEMBER: Safety first. When in doubt, default to conservative behavior.**

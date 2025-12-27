# ZEKE Trader

A self-contained agentic trading module for ZEKE, using OpenAI Agents SDK and Alpaca for broker access.

## Features

- **Paper-first**: Safe paper trading by default
- **Shadow mode**: Test decisions without executing orders
- **Live trading**: Protected by dual safety latch
- **Conservative agent**: Low-frequency trend following
- **Risk gate**: Deterministic checks before every trade
- **Full logging**: CSV logs for decisions, trades, and equity
- **Dashboard**: Real-time Streamlit visualization

## Quick Start

### 1. Set Environment Variables

In Replit, add these secrets:
- `OPENAI_API_KEY` - Your OpenAI API key
- `ALPACA_KEY_ID` - Alpaca paper trading API key
- `ALPACA_SECRET_KEY` - Alpaca paper trading secret key

Or copy `.env.example` to `.env` locally:
```bash
cp zeke_trader/.env.example .env
```

### 2. Run the Trading Loop

```bash
python -m zeke_trader.main
```

### 3. Run the Dashboard

```bash
streamlit run zeke_trader/dashboard/app.py --server.port 8501 --server.address 0.0.0.0
```

## Trading Modes

### Paper Mode (Default)
```bash
TRADING_MODE=paper
```
- Orders execute on Alpaca paper trading account
- No real money at risk
- Full functionality testing

### Shadow Mode
```bash
TRADING_MODE=shadow
```
- Agent makes decisions
- Risk checks run
- Orders are logged but **NEVER executed**
- Perfect for testing agent logic

### Live Mode
```bash
TRADING_MODE=live
LIVE_TRADING_ENABLED=true
```
- **BOTH** settings required to enable live trading
- Real money orders execute
- Use with extreme caution

## Safety Features

1. **Dual Latch for Live Trading**
   - Requires `TRADING_MODE=live` AND `LIVE_TRADING_ENABLED=true`
   - Missing either = orders blocked

2. **Deterministic Risk Gate**
   - Symbol allowlist enforcement
   - Max dollars per trade limit
   - Max open positions limit
   - Max trades per day limit
   - Max daily loss circuit breaker

3. **Conservative Agent**
   - Defaults to NO_TRADE
   - Simple trend following
   - Low-frequency decisions
   - No scalping/day-trading logic

4. **Full Audit Trail**
   - Every decision logged
   - Every trade logged
   - Equity snapshots logged

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TRADING_MODE` | `paper` | paper/shadow/live |
| `LIVE_TRADING_ENABLED` | `false` | Second latch for live |
| `ALLOWED_SYMBOLS` | `NVDA,SPY,...` | Tradeable symbols |
| `MAX_DOLLARS_PER_TRADE` | `25` | Max notional per order |
| `MAX_OPEN_POSITIONS` | `3` | Position limit |
| `MAX_TRADES_PER_DAY` | `5` | Daily trade limit |
| `MAX_DAILY_LOSS` | `25` | Loss circuit breaker |
| `LOOP_SECONDS` | `60` | Loop interval |

## File Structure

```
zeke_trader/
├── __init__.py
├── main.py           # Trading loop entry point
├── config.py         # Configuration + safety latches
├── schemas.py        # Pydantic models for decisions
├── agent.py          # OpenAI trading agent
├── risk.py           # Deterministic risk gate
├── broker_mcp.py     # Alpaca broker wrapper
├── logger.py         # CSV logging
├── metrics.py        # Performance analytics
├── dashboard/
│   └── app.py        # Streamlit dashboard
├── logs/             # Generated at runtime
│   ├── decisions.csv
│   ├── trades.csv
│   └── equity.csv
├── tests/
│   └── test_*.py
├── .env.example
└── README.md
```

## Logs

All logs are CSV files in `zeke_trader/logs/`:

- **decisions.csv**: Every agent decision with risk check results
- **trades.csv**: Every executed (or attempted) trade
- **equity.csv**: Periodic equity snapshots

## Integration with ZEKE

This module is self-contained but can be integrated with ZEKE's:
- Voice pipeline for "ZEKE, buy 10 shares of NVDA"
- Memory system for portfolio awareness
- Dashboard for unified view

## Troubleshooting

**Orders failing?**
- Check Alpaca API keys are set
- Verify paper trading account has funds
- Check allowed symbols list

**Agent returning NO_TRADE always?**
- Normal behavior - agent is conservative
- Check market data is being fetched
- Review decisions.csv for reasons

**Live trading blocked?**
- Both `TRADING_MODE=live` AND `LIVE_TRADING_ENABLED=true` required
- This is intentional safety behavior

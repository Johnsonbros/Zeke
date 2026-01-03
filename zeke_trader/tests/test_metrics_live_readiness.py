import csv
from pathlib import Path

from zeke_trader.config import TradingConfig, TradingMode
from zeke_trader.metrics import TradingMetrics


def write_csv(path: Path, headers: list[str], rows: list[list]):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)


def test_live_readiness_flags_missing_credentials(tmp_path):
    """Readiness should flag missing critical API keys and logging gaps."""

    cfg = TradingConfig(
        openai_api_key="",
        alpaca_key_id="",
        alpaca_secret_key="",
        trading_mode=TradingMode.PAPER,
        allowed_symbols=["NVDA"],
        log_dir=str(tmp_path / "logs"),
    )

    metrics = TradingMetrics(cfg)
    readiness = metrics.evaluate_live_readiness()

    assert readiness["ready"] is False
    gating_text = " ".join(readiness["gating_issues"])
    assert "Alpaca" in gating_text
    assert "OpenAI" in gating_text
    assert "Logging" in gating_text


def test_live_readiness_passes_with_track_record(tmp_path):
    """A healthy paper track record with safeguards should be marked ready."""

    log_dir = tmp_path / "logs_ready"
    cfg = TradingConfig(
        openai_api_key="test-openai",
        alpaca_key_id="paper-key",
        alpaca_secret_key="paper-secret",
        trading_mode=TradingMode.PAPER,
        allowed_symbols=["NVDA", "SPY"],
        max_dollars_per_trade=50,
        max_open_positions=2,
        max_trades_per_day=3,
        max_daily_loss=50,
        log_dir=str(log_dir),
    )

    # Populate logs to simulate a small but positive paper track record
    write_csv(
        log_dir / "equity.csv",
        ["ts", "equity", "cash", "buying_power", "pnl_day", "positions_count"],
        [
            ["2024-01-01T00:00:00", 1000, 1000, 1000, 5, 0],
            ["2024-01-02T00:00:00", 1010, 1010, 1010, 10, 0],
        ],
    )
    write_csv(
        log_dir / "trades.csv",
        ["ts", "symbol", "side", "notional_usd", "status", "order_id", "filled_avg_price", "filled_qty", "error"],
        [
            ["2024-01-02T10:00:00", "NVDA", "buy", 20, "filled", "1", 100, 0.2, ""],
            ["2024-01-02T11:00:00", "NVDA", "sell", 20, "filled", "2", 105, 0.19, ""],
            ["2024-01-03T10:00:00", "SPY", "buy", 20, "filled", "3", 400, 0.05, ""],
            ["2024-01-03T11:00:00", "SPY", "sell", 20, "filled", "4", 402, 0.05, ""],
            ["2024-01-04T10:00:00", "NVDA", "buy", 20, "filled", "5", 102, 0.2, ""],
            ["2024-01-04T11:00:00", "NVDA", "sell", 20, "failed", "6", "", "", "shadow"],
        ],
    )
    write_csv(
        log_dir / "decisions.csv",
        ["ts", "mode", "symbol", "action", "side", "notional_usd", "confidence", "reason", "risk_allowed", "risk_notes", "error"],
        [
            ["2024-01-02T09:59:00", "paper", "NVDA", "TRADE", "buy", 20, 0.7, "entry", "True", "ok", ""],
            ["2024-01-02T10:59:00", "paper", "NVDA", "TRADE", "sell", 20, 0.7, "exit", "True", "ok", ""],
            ["2024-01-03T09:59:00", "paper", "SPY", "TRADE", "buy", 20, 0.7, "entry", "True", "ok", ""],
            ["2024-01-03T10:59:00", "paper", "SPY", "TRADE", "sell", 20, 0.7, "exit", "True", "ok", ""],
            ["2024-01-04T09:59:00", "paper", "NVDA", "TRADE", "buy", 20, 0.7, "entry", "True", "ok", ""],
            ["2024-01-04T10:59:00", "paper", "NVDA", "TRADE", "sell", 20, 0.7, "exit", "True", "ok", ""],
        ],
    )

    metrics = TradingMetrics(cfg)
    readiness = metrics.evaluate_live_readiness()

    assert readiness["ready"] is True
    assert readiness["overall_score"] >= 70
    assert readiness["gating_issues"] == []


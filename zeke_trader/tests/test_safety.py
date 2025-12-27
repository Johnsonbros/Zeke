"""
Safety and configuration tests for ZEKE Trader.
"""
import os
import pytest
from unittest.mock import patch

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from zeke_trader.config import TradingConfig, TradingMode, load_config
from zeke_trader.schemas import TradeIntent, NoTrade, parse_decision
from zeke_trader.risk import risk_check
from zeke_trader.schemas import MarketSnapshot


class TestSafetyLatches:
    """Test safety latch behavior."""
    
    def test_paper_mode_allows_execution(self):
        """Paper mode should allow order execution."""
        cfg = TradingConfig(
            trading_mode=TradingMode.PAPER,
            live_trading_enabled=False
        )
        assert cfg.can_execute_orders() is True
    
    def test_shadow_mode_blocks_execution(self):
        """Shadow mode should block order execution."""
        cfg = TradingConfig(
            trading_mode=TradingMode.SHADOW,
            live_trading_enabled=False
        )
        assert cfg.can_execute_orders() is False
    
    def test_live_mode_without_flag_raises(self):
        """Live mode without LIVE_TRADING_ENABLED should raise ValueError."""
        with pytest.raises(ValueError, match="SAFETY"):
            TradingConfig(
                trading_mode=TradingMode.LIVE,
                live_trading_enabled=False
            )
    
    def test_live_mode_with_flag_allows_execution(self):
        """Live mode with both flags should allow execution."""
        cfg = TradingConfig(
            trading_mode=TradingMode.LIVE,
            live_trading_enabled=True
        )
        assert cfg.can_execute_orders() is True
    
    def test_default_config_is_paper(self):
        """Default configuration should be paper mode."""
        with patch.dict(os.environ, {}, clear=True):
            cfg = load_config()
            assert cfg.trading_mode == TradingMode.PAPER
            assert cfg.live_trading_enabled is False


class TestSchemaValidation:
    """Test decision schema validation."""
    
    def test_valid_trade_intent(self):
        """Valid trade intent should parse correctly."""
        raw = {
            "action": "TRADE",
            "symbol": "NVDA",
            "side": "buy",
            "notional_usd": 25.0,
            "order_type": "market",
            "time_in_force": "day",
            "confidence": 0.8,
            "reason": "Test trade"
        }
        decision = parse_decision(raw)
        assert isinstance(decision, TradeIntent)
        assert decision.symbol == "NVDA"
    
    def test_valid_no_trade(self):
        """Valid no trade should parse correctly."""
        raw = {
            "action": "NO_TRADE",
            "reason": "No clear signal",
            "confidence": 0.5
        }
        decision = parse_decision(raw)
        assert isinstance(decision, NoTrade)
    
    def test_invalid_decision_returns_no_trade(self):
        """Invalid decision should return NoTrade."""
        raw = {"garbage": "data"}
        decision = parse_decision(raw)
        assert isinstance(decision, NoTrade)
        assert "parse" in decision.reason.lower() or "failed" in decision.reason.lower()
    
    def test_symbol_uppercased(self):
        """Symbol should be uppercased automatically."""
        raw = {
            "action": "TRADE",
            "symbol": "nvda",
            "side": "buy",
            "notional_usd": 10.0,
            "confidence": 0.7,
            "reason": "test"
        }
        decision = parse_decision(raw)
        assert isinstance(decision, TradeIntent)
        assert decision.symbol == "NVDA"


class TestRiskGate:
    """Test deterministic risk checks."""
    
    def get_snapshot(self, positions=None):
        return MarketSnapshot(
            timestamp="2024-01-01T00:00:00",
            symbols=["NVDA", "SPY"],
            prices={"NVDA": 500.0, "SPY": 450.0},
            account_equity=100000.0,
            account_cash=50000.0,
            positions=positions or [],
            day_pnl=0.0
        )
    
    def get_config(self):
        return TradingConfig(
            trading_mode=TradingMode.PAPER,
            allowed_symbols=["NVDA", "SPY", "AAPL"],
            max_dollars_per_trade=25.0,
            max_open_positions=3,
            max_trades_per_day=5,
            max_daily_loss=25.0
        )
    
    def test_no_trade_always_allowed(self):
        """NO_TRADE decisions should always pass."""
        decision = NoTrade(action="NO_TRADE", reason="test", confidence=0.5)
        allowed, notes, _ = risk_check(decision, self.get_snapshot(), self.get_config())
        assert allowed is True
    
    def test_disallowed_symbol_blocked(self):
        """Trade with disallowed symbol should be blocked."""
        decision = TradeIntent(
            action="TRADE",
            symbol="TSLA",
            side="buy",
            notional_usd=10.0,
            confidence=0.8,
            reason="test"
        )
        allowed, notes, _ = risk_check(decision, self.get_snapshot(), self.get_config())
        assert allowed is False
        assert "not in allowed" in notes.lower()
    
    def test_oversized_trade_blocked(self):
        """Trade exceeding max dollars should be blocked."""
        decision = TradeIntent(
            action="TRADE",
            symbol="NVDA",
            side="buy",
            notional_usd=100.0,
            confidence=0.8,
            reason="test"
        )
        cfg = self.get_config()
        cfg.max_dollars_per_trade = 25.0
        
        allowed, notes, _ = risk_check(decision, self.get_snapshot(), cfg)
        assert allowed is False
        assert "exceeds" in notes.lower()
    
    def test_valid_trade_allowed(self):
        """Valid trade within all limits should be allowed."""
        decision = TradeIntent(
            action="TRADE",
            symbol="NVDA",
            side="buy",
            notional_usd=20.0,
            confidence=0.8,
            reason="test"
        )
        allowed, notes, result = risk_check(decision, self.get_snapshot(), self.get_config())
        assert allowed is True
        assert isinstance(result, TradeIntent)


class TestConfigLoading:
    """Test configuration loading from environment."""
    
    def test_load_allowed_symbols(self):
        """Should parse comma-separated symbols."""
        with patch.dict(os.environ, {"ALLOWED_SYMBOLS": "AAPL, MSFT, GOOG"}, clear=False):
            cfg = load_config()
            assert "AAPL" in cfg.allowed_symbols
            assert "MSFT" in cfg.allowed_symbols
            assert "GOOG" in cfg.allowed_symbols
    
    def test_load_trading_mode(self):
        """Should parse trading mode correctly."""
        with patch.dict(os.environ, {"TRADING_MODE": "shadow"}, clear=False):
            cfg = load_config()
            assert cfg.trading_mode == TradingMode.SHADOW


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

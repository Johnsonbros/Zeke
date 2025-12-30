"""
SignalAgent - Generates deterministic Turtle signals.

Purpose: Generate deterministic Turtle signals (System 1 & 2)
This is deterministic code, not LLM reasoning.
"""
import logging
from typing import List, Optional

from .schemas import Signal, MarketSnapshot, PortfolioState
from ..strategy.turtle import TurtleStrategy
from ..config import TradingConfig

logger = logging.getLogger("zeke_trader.agents.signal")


class SignalAgent:
    """Wraps Turtle strategy to generate deterministic signals."""
    
    def __init__(self, config: Optional[TradingConfig] = None):
        volume_filter = config.volume_filter_enabled if config else True
        volume_threshold = config.volume_threshold if config else 1.5
        trend_filter = config.trend_filter_enabled if config else True
        regime_enabled = config.regime_detection_enabled if config else True
        regime_adx_period = config.regime_adx_period if config else 14
        regime_trend_threshold = config.regime_trend_threshold if config else 25.0
        
        self.strategy = TurtleStrategy(
            volume_filter_enabled=volume_filter,
            volume_threshold=volume_threshold,
            trend_filter_enabled=trend_filter,
            regime_detection_enabled=regime_enabled,
            regime_adx_period=regime_adx_period,
            regime_trend_threshold=regime_trend_threshold,
        )
        
        logger.info(f"SignalAgent initialized: volume_filter={volume_filter}, trend_filter={trend_filter}, regime_detection={regime_enabled}")
    
    def generate_signals(
        self,
        snapshot: MarketSnapshot,
        portfolio: PortfolioState = None,
    ) -> List[Signal]:
        """
        Generate entry and exit signals from market data.
        
        Args:
            snapshot: Market data snapshot
            portfolio: Current portfolio state (for exit signals)
        
        Returns:
            List of signals sorted by score (highest first)
        """
        signals = []
        
        if not snapshot.data_available:
            logger.warning("No market data available - cannot generate signals")
            return signals
        
        entry_signals = self.strategy.generate_signals(snapshot)
        signals.extend(entry_signals)
        logger.info(f"Generated {len(entry_signals)} entry signals")
        
        if portfolio and portfolio.positions:
            exit_signals = self._check_exit_signals(snapshot, portfolio)
            signals.extend(exit_signals)
            logger.info(f"Generated {len(exit_signals)} exit signals")
        
        signals.sort(key=lambda s: s.score_hint, reverse=True)
        
        for sig in signals[:5]:
            logger.info(f"Signal: {sig.symbol} {sig.direction.value} score={sig.score_hint:.2f} - {sig.reason}")
        
        return signals
    
    def _check_exit_signals(
        self,
        snapshot: MarketSnapshot,
        portfolio: PortfolioState,
    ) -> List[Signal]:
        """Check for exit signals on existing positions."""
        exit_signals = []
        
        for position in portfolio.positions:
            symbol = position.symbol
            
            if symbol not in snapshot.market_data:
                continue
            
            symbol_data = snapshot.market_data[symbol]
            if not symbol_data.quote:
                continue
            
            current_price = symbol_data.quote.last
            
            entry_criteria = position.entry_criteria
            if not entry_criteria:
                continue
            
            position_side = "long" if position.qty > 0 else "short"
            
            exit_signal = self.strategy.check_exit_signals(
                symbol=symbol,
                current_price=current_price,
                position_side=position_side,
                entry_criteria=entry_criteria,
            )
            
            if exit_signal:
                logger.info(f"Exit signal for {symbol}: {exit_signal.reason}")
                exit_signals.append(exit_signal)
        
        return exit_signals

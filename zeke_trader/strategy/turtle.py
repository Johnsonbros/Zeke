"""
Turtle Trading Strategy Implementation.

The original Turtle system uses two breakout systems:
- System 1: 20-day breakout entry, 10-day breakout exit
- System 2: 55-day breakout entry, 20-day breakout exit

Position sizing is based on ATR(20) called "N":
- Unit size = 1% of equity / (N * dollar_per_point)
- Initial stop = 2N from entry
- Add positions at 1/2N intervals (pyramiding)
"""
from typing import List, Optional
from datetime import datetime
from ..agents.schemas import (
    Signal,
    SignalDirection,
    TurtleSystem,
    MarketSnapshot,
    SymbolData,
    BarData,
)


class TurtleStrategy:
    """Deterministic Turtle breakout signal generator."""
    
    def __init__(
        self,
        system_1_entry: int = 20,
        system_1_exit: int = 10,
        system_2_entry: int = 55,
        system_2_exit: int = 20,
        atr_period: int = 20,
        stop_atr_multiple: float = 2.0,
        volume_filter_enabled: bool = True,
        volume_threshold: float = 1.5,
        trend_filter_enabled: bool = True,
    ):
        self.system_1_entry = system_1_entry
        self.system_1_exit = system_1_exit
        self.system_2_entry = system_2_entry
        self.system_2_exit = system_2_exit
        self.atr_period = atr_period
        self.stop_atr_multiple = stop_atr_multiple
        self.volume_filter_enabled = volume_filter_enabled
        self.volume_threshold = volume_threshold
        self.trend_filter_enabled = trend_filter_enabled
    
    def compute_atr(self, bars: List[BarData]) -> Optional[float]:
        """Compute Average True Range over the ATR period."""
        if len(bars) < self.atr_period + 1:
            return None
        
        true_ranges = []
        for i in range(1, len(bars)):
            high = bars[i].high
            low = bars[i].low
            prev_close = bars[i - 1].close
            
            tr = max(
                high - low,
                abs(high - prev_close),
                abs(low - prev_close)
            )
            true_ranges.append(tr)
        
        if len(true_ranges) < self.atr_period:
            return None
        
        return sum(true_ranges[-self.atr_period:]) / self.atr_period
    
    def compute_channel(self, bars: List[BarData], period: int) -> Optional[tuple]:
        """Compute high/low channel over period days."""
        if len(bars) < period:
            return None
        
        recent_bars = bars[-period:]
        channel_high = max(b.high for b in recent_bars)
        channel_low = min(b.low for b in recent_bars)
        
        return channel_high, channel_low
    
    def compute_sma(self, bars: List[BarData], period: int) -> Optional[float]:
        """Compute Simple Moving Average over period days."""
        if len(bars) < period:
            return None
        recent_closes = [b.close for b in bars[-period:]]
        return sum(recent_closes) / period
    
    def compute_volume_avg(self, bars: List[BarData], period: int = 20) -> Optional[float]:
        """Compute average volume over period days."""
        if len(bars) < period:
            return None
        recent_volumes = [b.volume for b in bars[-period:]]
        return sum(recent_volumes) / period
    
    def enrich_symbol_data(self, symbol_data: SymbolData) -> SymbolData:
        """Add computed indicators to symbol data."""
        bars = symbol_data.bars
        if not bars:
            return symbol_data
        
        symbol_data.atr_20 = self.compute_atr(bars)
        
        channel_20 = self.compute_channel(bars, 20)
        if channel_20:
            symbol_data.high_20, symbol_data.low_20 = channel_20
        
        channel_55 = self.compute_channel(bars, 55)
        if channel_55:
            symbol_data.high_55, symbol_data.low_55 = channel_55
        
        channel_10 = self.compute_channel(bars, 10)
        if channel_10:
            symbol_data.high_10, symbol_data.low_10 = channel_10
        
        symbol_data.volume_avg_20 = self.compute_volume_avg(bars, 20)
        if bars:
            symbol_data.current_volume = bars[-1].volume
        
        symbol_data.sma_50 = self.compute_sma(bars, 50)
        symbol_data.sma_200 = self.compute_sma(bars, 200)
        
        if symbol_data.sma_50 and symbol_data.sma_200 and symbol_data.quote:
            price = symbol_data.quote.last
            if price > symbol_data.sma_50 > symbol_data.sma_200:
                symbol_data.trend_aligned = True
            elif price < symbol_data.sma_50 < symbol_data.sma_200:
                symbol_data.trend_aligned = True
            else:
                symbol_data.trend_aligned = False
        else:
            symbol_data.trend_aligned = None
        
        if symbol_data.current_volume and symbol_data.volume_avg_20:
            symbol_data.volume_confirmed = symbol_data.current_volume >= symbol_data.volume_avg_20 * self.volume_threshold
        else:
            symbol_data.volume_confirmed = None
        
        return symbol_data
    
    def generate_signals(self, snapshot: MarketSnapshot, include_filtered: bool = False) -> List[Signal]:
        """
        Generate deterministic Turtle signals from market snapshot.
        
        Entry signals:
        - Long: Price breaks above 20-day high (S1) or 55-day high (S2)
        - Short: Price breaks below 20-day low (S1) or 55-day low (S2)
        
        Exit signals:
        - Exit long: Price breaks below 10-day low (S1) or 20-day low (S2)
        - Exit short: Price breaks above 10-day high (S1) or 20-day high (S2)
        
        Args:
            snapshot: Market data snapshot
            include_filtered: If True, include signals that failed filters (with filters_passed=False)
        """
        signals = []
        
        for symbol, data in snapshot.market_data.items():
            data = self.enrich_symbol_data(data)
            
            if not data.quote or not data.atr_20:
                continue
            
            current_price = data.quote.last
            atr_n = data.atr_20
            
            s1_signals = self._check_system_signals(
                symbol=symbol,
                current_price=current_price,
                atr_n=atr_n,
                entry_high=data.high_20,
                entry_low=data.low_20,
                exit_high=data.high_10,
                exit_low=data.low_10,
                system=TurtleSystem.SYSTEM_1,
                symbol_data=data,
            )
            signals.extend(s1_signals)
            
            s2_signals = self._check_system_signals(
                symbol=symbol,
                current_price=current_price,
                atr_n=atr_n,
                entry_high=data.high_55,
                entry_low=data.low_55,
                exit_high=data.high_20,
                exit_low=data.low_20,
                system=TurtleSystem.SYSTEM_2,
                symbol_data=data,
            )
            signals.extend(s2_signals)
        
        if not include_filtered:
            signals = [s for s in signals if s.filters_passed]
        
        signals.sort(key=lambda s: (s.filters_passed, s.score_hint), reverse=True)
        
        return signals
    
    def _check_system_signals(
        self,
        symbol: str,
        current_price: float,
        atr_n: float,
        entry_high: Optional[float],
        entry_low: Optional[float],
        exit_high: Optional[float],
        exit_low: Optional[float],
        system: TurtleSystem,
        symbol_data: Optional[SymbolData] = None,
    ) -> List[Signal]:
        """Check for breakout signals in one system."""
        signals = []
        
        if entry_high is None or entry_low is None:
            return signals
        if exit_high is None or exit_low is None:
            return signals
        
        volume_confirmed = symbol_data.volume_confirmed if symbol_data else None
        trend_aligned = symbol_data.trend_aligned if symbol_data else None
        
        filter_notes = []
        filters_passed = True
        
        if self.volume_filter_enabled:
            if volume_confirmed is None:
                filter_notes.append("Volume: insufficient data")
            elif volume_confirmed:
                filter_notes.append("Volume: confirmed (>1.5x avg)")
            else:
                filter_notes.append("Volume: below threshold")
                filters_passed = False
        
        if self.trend_filter_enabled:
            if trend_aligned is None:
                filter_notes.append("Trend: insufficient data for 50/200 MA")
            elif trend_aligned:
                filter_notes.append("Trend: aligned with 50/200 MA")
            else:
                filter_notes.append("Trend: not aligned")
                filters_passed = False
        
        system_name = f"System {system.value}"
        
        if current_price > entry_high:
            breakout_strength = (current_price - entry_high) / atr_n
            score = min(1.0, 0.5 + breakout_strength * 0.2)
            
            if not trend_aligned and self.trend_filter_enabled and trend_aligned is not None:
                if symbol_data and symbol_data.sma_50 and current_price < symbol_data.sma_50:
                    filters_passed = False
                    filter_notes.append("Long rejected: price below 50 MA")
            
            signals.append(Signal(
                symbol=symbol,
                direction=SignalDirection.LONG,
                system=system,
                entry_ref=entry_high,
                current_price=current_price,
                atr_n=atr_n,
                stop_price=current_price - (self.stop_atr_multiple * atr_n),
                exit_ref=exit_low,
                score_hint=score,
                reason=f"{system_name} long breakout: {symbol} at ${current_price:.2f} > {system.value}-day high ${entry_high:.2f}",
                volume_confirmed=volume_confirmed,
                trend_aligned=trend_aligned,
                filters_passed=filters_passed,
                filter_notes=filter_notes,
            ))
        
        if current_price < entry_low:
            breakout_strength = (entry_low - current_price) / atr_n
            score = min(1.0, 0.5 + breakout_strength * 0.2)
            
            short_filters_passed = filters_passed
            short_filter_notes = filter_notes.copy()
            
            if not trend_aligned and self.trend_filter_enabled and trend_aligned is not None:
                if symbol_data and symbol_data.sma_50 and current_price > symbol_data.sma_50:
                    short_filters_passed = False
                    short_filter_notes.append("Short rejected: price above 50 MA")
            
            signals.append(Signal(
                symbol=symbol,
                direction=SignalDirection.SHORT,
                system=system,
                entry_ref=entry_low,
                current_price=current_price,
                atr_n=atr_n,
                stop_price=current_price + (self.stop_atr_multiple * atr_n),
                exit_ref=exit_high,
                score_hint=score,
                reason=f"{system_name} short breakout: {symbol} at ${current_price:.2f} < {system.value}-day low ${entry_low:.2f}",
                volume_confirmed=volume_confirmed,
                trend_aligned=trend_aligned,
                filters_passed=short_filters_passed,
                filter_notes=short_filter_notes,
            ))
        
        return signals
    
    def check_exit_signals(
        self,
        symbol: str,
        current_price: float,
        position_side: str,
        entry_criteria: dict,
    ) -> Optional[Signal]:
        """
        Check if an existing position should be exited based on stored criteria.
        
        Exit rules:
        - Stop loss: Price hits stop_price (2N from entry)
        - Exit breakout: Price breaks exit_ref level
        """
        stop_price = entry_criteria.get("stop_price")
        exit_ref = entry_criteria.get("exit_ref")
        atr_n = entry_criteria.get("atr_n", 1.0)
        system = entry_criteria.get("system", 20)
        
        if position_side == "long":
            if stop_price and current_price <= stop_price:
                return Signal(
                    symbol=symbol,
                    direction=SignalDirection.EXIT_LONG,
                    system=TurtleSystem(system),
                    entry_ref=stop_price,
                    current_price=current_price,
                    atr_n=atr_n,
                    stop_price=stop_price,
                    exit_ref=exit_ref or stop_price,
                    score_hint=1.0,
                    reason=f"STOP LOSS: {symbol} at ${current_price:.2f} <= stop ${stop_price:.2f}",
                )
            
            if exit_ref and current_price < exit_ref:
                return Signal(
                    symbol=symbol,
                    direction=SignalDirection.EXIT_LONG,
                    system=TurtleSystem(system),
                    entry_ref=exit_ref,
                    current_price=current_price,
                    atr_n=atr_n,
                    stop_price=stop_price or current_price,
                    exit_ref=exit_ref,
                    score_hint=0.9,
                    reason=f"EXIT BREAKOUT: {symbol} at ${current_price:.2f} < exit level ${exit_ref:.2f}",
                )
        
        elif position_side == "short":
            if stop_price and current_price >= stop_price:
                return Signal(
                    symbol=symbol,
                    direction=SignalDirection.EXIT_SHORT,
                    system=TurtleSystem(system),
                    entry_ref=stop_price,
                    current_price=current_price,
                    atr_n=atr_n,
                    stop_price=stop_price,
                    exit_ref=exit_ref or stop_price,
                    score_hint=1.0,
                    reason=f"STOP LOSS: {symbol} at ${current_price:.2f} >= stop ${stop_price:.2f}",
                )
            
            if exit_ref and current_price > exit_ref:
                return Signal(
                    symbol=symbol,
                    direction=SignalDirection.EXIT_SHORT,
                    system=TurtleSystem(system),
                    entry_ref=exit_ref,
                    current_price=current_price,
                    atr_n=atr_n,
                    stop_price=stop_price or current_price,
                    exit_ref=exit_ref,
                    score_hint=0.9,
                    reason=f"EXIT BREAKOUT: {symbol} at ${current_price:.2f} > exit level ${exit_ref:.2f}",
                )
        
        return None

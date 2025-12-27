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
    ):
        self.system_1_entry = system_1_entry
        self.system_1_exit = system_1_exit
        self.system_2_entry = system_2_entry
        self.system_2_exit = system_2_exit
        self.atr_period = atr_period
        self.stop_atr_multiple = stop_atr_multiple
    
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
        
        return symbol_data
    
    def generate_signals(self, snapshot: MarketSnapshot) -> List[Signal]:
        """
        Generate deterministic Turtle signals from market snapshot.
        
        Entry signals:
        - Long: Price breaks above 20-day high (S1) or 55-day high (S2)
        - Short: Price breaks below 20-day low (S1) or 55-day low (S2)
        
        Exit signals:
        - Exit long: Price breaks below 10-day low (S1) or 20-day low (S2)
        - Exit short: Price breaks above 10-day high (S1) or 20-day high (S2)
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
            )
            signals.extend(s2_signals)
        
        signals.sort(key=lambda s: s.score_hint, reverse=True)
        
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
    ) -> List[Signal]:
        """Check for breakout signals in one system."""
        signals = []
        
        if entry_high is None or entry_low is None:
            return signals
        if exit_high is None or exit_low is None:
            return signals
        
        system_name = f"System {system.value}"
        
        if current_price > entry_high:
            breakout_strength = (current_price - entry_high) / atr_n
            score = min(1.0, 0.5 + breakout_strength * 0.2)
            
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
            ))
        
        if current_price < entry_low:
            breakout_strength = (entry_low - current_price) / atr_n
            score = min(1.0, 0.5 + breakout_strength * 0.2)
            
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

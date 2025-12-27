"""
Universe scanning for ticker discovery.

Finds RAW CANDIDATES that MAY trend - does not predict winners.
Runs daily or weekly, NEVER intraday, independent of trading loop.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
import logging

from .schemas import (
    DiscoveryCandidate,
    ScanType,
    ScanResult,
)


logger = logging.getLogger(__name__)


class ScanConfig(BaseModel):
    """Configuration for universe scans."""
    scan_types: List[ScanType] = Field(
        default_factory=lambda: [
            ScanType.NEW_20_DAY_HIGH,
            ScanType.NEW_55_DAY_HIGH,
            ScanType.ATR_EXPANSION,
        ]
    )
    atr_expansion_threshold: float = Field(
        default=1.5,
        description="ATR must be this multiple of 20-day avg to count as expansion"
    )
    top_n_movers: int = Field(
        default=20,
        description="Number of top gainers/losers to scan"
    )
    index_constituents: List[str] = Field(
        default_factory=lambda: ["SPY", "QQQ"],
        description="Index ETFs to get constituents from"
    )


class UniverseScanner:
    """
    Scan the market universe for potential trading candidates.
    
    This class is responsible for discovering symbols that may trend.
    It does NOT make trading decisions - only finds candidates for
    the qualification pipeline.
    """
    
    def __init__(
        self, 
        broker,  # AlpacaBroker or similar
        config: Optional[ScanConfig] = None,
    ):
        self.broker = broker
        self.config = config or ScanConfig()
    
    async def run_scan(
        self,
        symbols_to_scan: Optional[List[str]] = None,
    ) -> ScanResult:
        """
        Run a complete universe scan.
        
        Args:
            symbols_to_scan: Specific symbols to scan, or None for full universe
        
        Returns:
            ScanResult with all candidates found
        """
        start_time = datetime.utcnow()
        result = ScanResult(
            scan_types=self.config.scan_types,
            scan_timestamp=start_time,
        )
        
        all_candidates: List[DiscoveryCandidate] = []
        
        try:
            if symbols_to_scan is None:
                symbols_to_scan = await self._get_scan_universe()
            
            for scan_type in self.config.scan_types:
                try:
                    candidates = await self._run_single_scan(scan_type, symbols_to_scan)
                    all_candidates.extend(candidates)
                except Exception as e:
                    logger.error(f"Scan {scan_type} failed: {e}")
                    result.errors.append(f"{scan_type}: {str(e)}")
            
            result.candidates = self._deduplicate_candidates(all_candidates)
            result.candidates_found = len(result.candidates)
            
        except Exception as e:
            logger.error(f"Universe scan failed: {e}")
            result.errors.append(str(e))
        
        result.duration_seconds = (datetime.utcnow() - start_time).total_seconds()
        return result
    
    async def _get_scan_universe(self) -> List[str]:
        """Get the full universe of symbols to scan."""
        universe = set()
        
        try:
            assets = await self.broker.get_tradeable_assets()
            for asset in assets:
                if self._is_scannable(asset):
                    universe.add(asset.get("symbol", asset))
        except Exception as e:
            logger.warning(f"Failed to get tradeable assets: {e}")
        
        default_symbols = [
            "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "NVDA", "META", "TSLA",
            "SPY", "QQQ", "IWM", "DIA",
            "AVGO", "AMD", "NFLX", "CRM", "ADBE", "ORCL",
            "JPM", "BAC", "WFC", "GS", "MS",
            "XOM", "CVX", "COP",
            "JNJ", "UNH", "PFE", "MRK",
        ]
        universe.update(default_symbols)
        
        return list(universe)
    
    def _is_scannable(self, asset: Dict[str, Any]) -> bool:
        """Check if an asset is suitable for scanning."""
        if isinstance(asset, str):
            return True
        
        if asset.get("status") != "active":
            return False
        if not asset.get("tradable", True):
            return False
        if asset.get("asset_class") != "us_equity":
            return False
        
        return True
    
    async def _run_single_scan(
        self, 
        scan_type: ScanType, 
        symbols: List[str]
    ) -> List[DiscoveryCandidate]:
        """Run a single scan type and return candidates."""
        
        if scan_type == ScanType.NEW_20_DAY_HIGH:
            return await self._scan_new_highs(symbols, days=20)
        elif scan_type == ScanType.NEW_55_DAY_HIGH:
            return await self._scan_new_highs(symbols, days=55)
        elif scan_type == ScanType.NEW_20_DAY_LOW:
            return await self._scan_new_lows(symbols, days=20)
        elif scan_type == ScanType.NEW_55_DAY_LOW:
            return await self._scan_new_lows(symbols, days=55)
        elif scan_type == ScanType.ATR_EXPANSION:
            return await self._scan_atr_expansion(symbols)
        elif scan_type in [ScanType.TOP_GAINER_1D, ScanType.TOP_GAINER_5D, ScanType.TOP_GAINER_20D]:
            days = {"top_gainer_1d": 1, "top_gainer_5d": 5, "top_gainer_20d": 20}
            return await self._scan_top_movers(symbols, days[scan_type.value], gainers=True)
        elif scan_type in [ScanType.TOP_LOSER_1D, ScanType.TOP_LOSER_5D, ScanType.TOP_LOSER_20D]:
            days = {"top_loser_1d": 1, "top_loser_5d": 5, "top_loser_20d": 20}
            return await self._scan_top_movers(symbols, days[scan_type.value], gainers=False)
        
        return []
    
    async def _scan_new_highs(self, symbols: List[str], days: int) -> List[DiscoveryCandidate]:
        """Scan for symbols making new N-day highs."""
        candidates = []
        scan_type = ScanType.NEW_20_DAY_HIGH if days == 20 else ScanType.NEW_55_DAY_HIGH
        
        for symbol in symbols:
            try:
                bars = await self.broker.get_bars(symbol, days=days + 5)
                if not bars or len(bars) < days:
                    continue
                
                closes = [b.get("close", b.close if hasattr(b, "close") else 0) for b in bars]
                highs = [b.get("high", b.high if hasattr(b, "high") else 0) for b in bars]
                volumes = [b.get("volume", b.volume if hasattr(b, "volume") else 0) for b in bars]
                
                current_price = closes[-1]
                prior_high = max(highs[:-1]) if len(highs) > 1 else highs[0]
                
                if current_price > prior_high:
                    atr = self._calculate_atr(bars)
                    candidates.append(DiscoveryCandidate(
                        symbol=symbol,
                        scan_type=scan_type,
                        last_price=current_price,
                        high_20d=max(highs[-20:]) if len(highs) >= 20 else max(highs),
                        low_20d=min([b.get("low", b.low if hasattr(b, "low") else 0) for b in bars[-20:]]) if len(bars) >= 20 else min([b.get("low", b.low if hasattr(b, "low") else 0) for b in bars]),
                        atr_20=atr,
                        volume_avg_20d=sum(volumes[-20:]) / min(20, len(volumes)) if volumes else None,
                    ))
            except Exception as e:
                logger.debug(f"Failed to scan {symbol} for new highs: {e}")
        
        return candidates
    
    async def _scan_new_lows(self, symbols: List[str], days: int) -> List[DiscoveryCandidate]:
        """Scan for symbols making new N-day lows."""
        candidates = []
        scan_type = ScanType.NEW_20_DAY_LOW if days == 20 else ScanType.NEW_55_DAY_LOW
        
        for symbol in symbols:
            try:
                bars = await self.broker.get_bars(symbol, days=days + 5)
                if not bars or len(bars) < days:
                    continue
                
                closes = [b.get("close", b.close if hasattr(b, "close") else 0) for b in bars]
                lows = [b.get("low", b.low if hasattr(b, "low") else 0) for b in bars]
                volumes = [b.get("volume", b.volume if hasattr(b, "volume") else 0) for b in bars]
                
                current_price = closes[-1]
                prior_low = min(lows[:-1]) if len(lows) > 1 else lows[0]
                
                if current_price < prior_low:
                    atr = self._calculate_atr(bars)
                    candidates.append(DiscoveryCandidate(
                        symbol=symbol,
                        scan_type=scan_type,
                        last_price=current_price,
                        high_20d=max([b.get("high", b.high if hasattr(b, "high") else 0) for b in bars[-20:]]) if len(bars) >= 20 else max([b.get("high", b.high if hasattr(b, "high") else 0) for b in bars]),
                        low_20d=min(lows[-20:]) if len(lows) >= 20 else min(lows),
                        atr_20=atr,
                        volume_avg_20d=sum(volumes[-20:]) / min(20, len(volumes)) if volumes else None,
                    ))
            except Exception as e:
                logger.debug(f"Failed to scan {symbol} for new lows: {e}")
        
        return candidates
    
    async def _scan_atr_expansion(self, symbols: List[str]) -> List[DiscoveryCandidate]:
        """Scan for symbols with ATR expansion (volatility awakening)."""
        candidates = []
        
        for symbol in symbols:
            try:
                bars = await self.broker.get_bars(symbol, days=40)
                if not bars or len(bars) < 30:
                    continue
                
                current_atr = self._calculate_atr(bars[-20:])
                historical_atr = self._calculate_atr(bars[-40:-20]) if len(bars) >= 40 else current_atr
                
                if historical_atr > 0:
                    expansion_ratio = current_atr / historical_atr
                    
                    if expansion_ratio >= self.config.atr_expansion_threshold:
                        closes = [b.get("close", b.close if hasattr(b, "close") else 0) for b in bars]
                        volumes = [b.get("volume", b.volume if hasattr(b, "volume") else 0) for b in bars]
                        
                        candidates.append(DiscoveryCandidate(
                            symbol=symbol,
                            scan_type=ScanType.ATR_EXPANSION,
                            last_price=closes[-1],
                            atr_20=current_atr,
                            atr_expansion_ratio=expansion_ratio,
                            volume_avg_20d=sum(volumes[-20:]) / min(20, len(volumes)) if volumes else None,
                        ))
            except Exception as e:
                logger.debug(f"Failed to scan {symbol} for ATR expansion: {e}")
        
        return candidates
    
    async def _scan_top_movers(
        self, 
        symbols: List[str], 
        days: int, 
        gainers: bool = True
    ) -> List[DiscoveryCandidate]:
        """Scan for top percentage gainers or losers."""
        candidates = []
        returns_data = []
        
        for symbol in symbols:
            try:
                bars = await self.broker.get_bars(symbol, days=days + 5)
                if not bars or len(bars) < days:
                    continue
                
                closes = [b.get("close", b.close if hasattr(b, "close") else 0) for b in bars]
                if len(closes) >= days and closes[-days - 1] > 0:
                    ret = (closes[-1] - closes[-days - 1]) / closes[-days - 1]
                    returns_data.append((symbol, ret, bars))
            except Exception as e:
                logger.debug(f"Failed to get returns for {symbol}: {e}")
        
        returns_data.sort(key=lambda x: x[1], reverse=gainers)
        top_movers = returns_data[:self.config.top_n_movers]
        
        for symbol, ret, bars in top_movers:
            closes = [b.get("close", b.close if hasattr(b, "close") else 0) for b in bars]
            volumes = [b.get("volume", b.volume if hasattr(b, "volume") else 0) for b in bars]
            
            scan_type_map = {
                (1, True): ScanType.TOP_GAINER_1D,
                (5, True): ScanType.TOP_GAINER_5D,
                (20, True): ScanType.TOP_GAINER_20D,
                (1, False): ScanType.TOP_LOSER_1D,
                (5, False): ScanType.TOP_LOSER_5D,
                (20, False): ScanType.TOP_LOSER_20D,
            }
            
            candidates.append(DiscoveryCandidate(
                symbol=symbol,
                scan_type=scan_type_map.get((days, gainers), ScanType.TOP_GAINER_1D),
                last_price=closes[-1],
                atr_20=self._calculate_atr(bars[-20:]) if len(bars) >= 20 else None,
                return_1d=ret if days == 1 else None,
                return_5d=ret if days == 5 else None,
                return_20d=ret if days == 20 else None,
                volume_avg_20d=sum(volumes[-20:]) / min(20, len(volumes)) if volumes else None,
            ))
        
        return candidates
    
    def _calculate_atr(self, bars: List[Any], period: int = 20) -> float:
        """Calculate Average True Range."""
        if not bars or len(bars) < 2:
            return 0.0
        
        true_ranges = []
        for i in range(1, len(bars)):
            curr = bars[i]
            prev = bars[i - 1]
            
            high = curr.get("high", curr.high if hasattr(curr, "high") else 0)
            low = curr.get("low", curr.low if hasattr(curr, "low") else 0)
            prev_close = prev.get("close", prev.close if hasattr(prev, "close") else 0)
            
            tr = max(
                high - low,
                abs(high - prev_close),
                abs(low - prev_close)
            )
            true_ranges.append(tr)
        
        if not true_ranges:
            return 0.0
        
        return sum(true_ranges[-period:]) / min(period, len(true_ranges))
    
    def _deduplicate_candidates(
        self, 
        candidates: List[DiscoveryCandidate]
    ) -> List[DiscoveryCandidate]:
        """Deduplicate candidates, keeping the most recent scan for each symbol."""
        seen: Dict[str, DiscoveryCandidate] = {}
        
        for candidate in candidates:
            existing = seen.get(candidate.symbol)
            if existing is None or candidate.scan_timestamp > existing.scan_timestamp:
                seen[candidate.symbol] = candidate
        
        return list(seen.values())

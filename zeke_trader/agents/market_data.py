"""
MarketDataAgent - Fetches bars and quotes for signal generation.

Purpose: Fetch minimal bars/quotes needed for breakouts + volatility N
Fail closed: if data missing/stale -> return DATA_UNAVAILABLE flag
"""
import logging
from datetime import datetime, timedelta
from typing import List, Optional
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.requests import StockBarsRequest, StockLatestQuoteRequest
from alpaca.data.timeframe import TimeFrame

from .schemas import (
    MarketSnapshot,
    SymbolData,
    BarData,
    QuoteData,
)
from ..config import TradingConfig

logger = logging.getLogger("zeke_trader.agents.market_data")


class MarketDataAgent:
    """Fetches market data from Alpaca for signal generation."""
    
    def __init__(self, config: TradingConfig):
        self.config = config
        self.client = StockHistoricalDataClient(
            api_key=config.alpaca_key_id,
            secret_key=config.alpaca_secret_key,
        )
    
    async def fetch_snapshot(
        self,
        symbols: Optional[List[str]] = None,
        lookback_days: int = 60,
    ) -> MarketSnapshot:
        """
        Fetch complete market snapshot for all symbols.
        
        Args:
            symbols: List of symbols to fetch (defaults to config.allowed_symbols)
            lookback_days: Number of days of historical data (need 55+ for System 2)
        
        Returns:
            MarketSnapshot with bars and quotes for each symbol
        """
        symbols = symbols or self.config.allowed_symbols
        snapshot = MarketSnapshot(
            timestamp=datetime.utcnow(),
            market_data={},
            data_available=True,
            errors=[],
        )
        
        try:
            from alpaca.trading.client import TradingClient
            trading_client = TradingClient(
                api_key=self.config.alpaca_key_id,
                secret_key=self.config.alpaca_secret_key,
                paper=self.config.trading_mode.value != "live",
            )
            clock = trading_client.get_clock()
            snapshot.is_market_open = clock.is_open
        except Exception as e:
            logger.warning(f"Could not fetch market clock: {e}")
            snapshot.is_market_open = False
        
        end_date = datetime.now()
        start_date = end_date - timedelta(days=lookback_days)
        
        for symbol in symbols:
            try:
                symbol_data = await self._fetch_symbol_data(
                    symbol=symbol,
                    start_date=start_date,
                    end_date=end_date,
                )
                if symbol_data:
                    snapshot.market_data[symbol] = symbol_data
                else:
                    snapshot.errors.append(f"No data for {symbol}")
            except Exception as e:
                logger.error(f"Error fetching {symbol}: {e}")
                snapshot.errors.append(f"{symbol}: {str(e)}")
        
        if not snapshot.market_data:
            snapshot.data_available = False
            logger.error("DATA_UNAVAILABLE: No market data fetched for any symbol")
        
        return snapshot
    
    async def _fetch_symbol_data(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime,
    ) -> Optional[SymbolData]:
        """Fetch bars and quote for a single symbol."""
        symbol_data = SymbolData(symbol=symbol)
        
        try:
            bars_request = StockBarsRequest(
                symbol_or_symbols=symbol,
                timeframe=TimeFrame.Day,
                start=start_date,
                end=end_date,
            )
            bars_response = self.client.get_stock_bars(bars_request)
            
            if symbol in bars_response.data:
                for bar in bars_response.data[symbol]:
                    symbol_data.bars.append(BarData(
                        timestamp=bar.timestamp,
                        open=float(bar.open),
                        high=float(bar.high),
                        low=float(bar.low),
                        close=float(bar.close),
                        volume=int(bar.volume),
                    ))
        except Exception as e:
            logger.error(f"Error fetching bars for {symbol}: {e}")
            return None
        
        try:
            quote_request = StockLatestQuoteRequest(symbol_or_symbols=symbol)
            quote_response = self.client.get_stock_latest_quote(quote_request)
            
            if symbol in quote_response:
                quote = quote_response[symbol]
                symbol_data.quote = QuoteData(
                    symbol=symbol,
                    bid=float(quote.bid_price) if quote.bid_price else 0.0,
                    ask=float(quote.ask_price) if quote.ask_price else 0.0,
                    last=float(quote.ask_price) if quote.ask_price else float(quote.bid_price or 0),
                    timestamp=quote.timestamp,
                )
        except Exception as e:
            logger.error(f"Error fetching quote for {symbol}: {e}")
        
        if not symbol_data.bars:
            logger.warning(f"No bars data for {symbol}")
            return None
        
        return symbol_data
    
    def fetch_snapshot_sync(
        self,
        symbols: Optional[List[str]] = None,
        lookback_days: int = 60,
    ) -> MarketSnapshot:
        """Synchronous version of fetch_snapshot for non-async contexts."""
        import asyncio
        return asyncio.get_event_loop().run_until_complete(
            self.fetch_snapshot(symbols, lookback_days)
        )

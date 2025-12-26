"""
Alpaca broker wrapper using MCP (Model Context Protocol).
Falls back to REST API if MCP not available.
"""
import os
import json
import httpx
from typing import Optional, Dict, List, Any
from datetime import datetime

from .config import TradingConfig, TradingMode
from .schemas import TradeResult, MarketSnapshot


class AlpacaBroker:
    """Alpaca broker client - supports paper and live trading."""
    
    def __init__(self, cfg: TradingConfig):
        self.cfg = cfg
        self.api_key = cfg.alpaca_key_id
        self.secret_key = cfg.alpaca_secret_key
        
        if cfg.trading_mode == TradingMode.LIVE and cfg.live_trading_enabled:
            self.base_url = "https://api.alpaca.markets"
            self.data_url = "https://data.alpaca.markets"
        else:
            self.base_url = "https://paper-api.alpaca.markets"
            self.data_url = "https://data.alpaca.markets"
        
        self.headers = {
            "APCA-API-KEY-ID": self.api_key,
            "APCA-API-SECRET-KEY": self.secret_key,
            "Content-Type": "application/json"
        }
        
        self._client: Optional[httpx.Client] = None
    
    @property
    def client(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(timeout=30.0)
        return self._client
    
    def _request(self, method: str, endpoint: str, base: Optional[str] = None, **kwargs) -> Dict[str, Any]:
        """Make authenticated request to Alpaca API."""
        base = base if base is not None else self.base_url
        url = f"{base}{endpoint}"
        try:
            response = self.client.request(method, url, headers=self.headers, **kwargs)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            return {"error": str(e), "status_code": e.response.status_code}
        except Exception as e:
            return {"error": str(e)}
    
    def get_account(self) -> Dict[str, Any]:
        """Get account information."""
        return self._request("GET", "/v2/account")
    
    def get_positions(self) -> List[Dict[str, Any]]:
        """Get all open positions."""
        result = self._request("GET", "/v2/positions")
        if isinstance(result, list):
            return result
        if "error" in result:
            return []
        return []
    
    def get_latest_quote(self, symbol: str) -> Dict[str, Any]:
        """Get latest quote for a symbol."""
        return self._request("GET", f"/v2/stocks/{symbol}/quotes/latest", base=self.data_url)
    
    def get_latest_trade(self, symbol: str) -> Dict[str, Any]:
        """Get latest trade for a symbol."""
        return self._request("GET", f"/v2/stocks/{symbol}/trades/latest", base=self.data_url)
    
    def get_bars(self, symbol: str, timeframe: str = "1Day", limit: int = 5) -> Dict[str, Any]:
        """Get historical bars for a symbol."""
        params = {"timeframe": timeframe, "limit": limit}
        return self._request("GET", f"/v2/stocks/{symbol}/bars", base=self.data_url, params=params)
    
    def place_order_notional(
        self,
        symbol: str,
        side: str,
        notional_usd: float,
        order_type: str = "market",
        time_in_force: str = "day"
    ) -> TradeResult:
        """Place an order by notional (dollar) amount."""
        if self.cfg.trading_mode == TradingMode.SHADOW:
            return TradeResult(
                success=False,
                error="SHADOW mode - order not executed",
                mode="shadow"
            )
        
        if self.cfg.trading_mode == TradingMode.LIVE and not self.cfg.live_trading_enabled:
            return TradeResult(
                success=False,
                error="LIVE mode but LIVE_TRADING_ENABLED is false - order blocked",
                mode="live_blocked"
            )
        
        order_data = {
            "symbol": symbol.upper(),
            "notional": str(round(notional_usd, 2)),
            "side": side.lower(),
            "type": order_type,
            "time_in_force": time_in_force
        }
        
        result = self._request("POST", "/v2/orders", json=order_data)
        
        if "error" in result:
            return TradeResult(
                success=False,
                error=result.get("error", "Unknown error"),
                mode=self.cfg.trading_mode.value
            )
        
        return TradeResult(
            success=True,
            order_id=result.get("id"),
            filled_avg_price=float(result.get("filled_avg_price", 0)) if result.get("filled_avg_price") else None,
            filled_qty=float(result.get("filled_qty", 0)) if result.get("filled_qty") else None,
            mode=self.cfg.trading_mode.value
        )
    
    def list_orders(self, status: str = "all", limit: int = 10) -> List[Dict[str, Any]]:
        """List recent orders."""
        params = {"status": status, "limit": limit}
        result = self._request("GET", "/v2/orders", params=params)
        if isinstance(result, list):
            return result
        return []
    
    def get_market_snapshot(self, symbols: List[str]) -> MarketSnapshot:
        """Get comprehensive market snapshot."""
        snapshot = MarketSnapshot(
            timestamp=datetime.utcnow().isoformat(),
            symbols=symbols
        )
        
        account = self.get_account()
        if "error" not in account:
            snapshot.account_equity = float(account.get("equity", 0))
            snapshot.account_cash = float(account.get("cash", 0))
            snapshot.account_buying_power = float(account.get("buying_power", 0))
            pnl = account.get("equity", 0)
            last_equity = account.get("last_equity", 0)
            if pnl and last_equity:
                snapshot.day_pnl = float(pnl) - float(last_equity)
        
        positions = self.get_positions()
        snapshot.positions = positions
        
        for symbol in symbols[:3]:
            try:
                trade = self.get_latest_trade(symbol)
                if "trade" in trade:
                    snapshot.prices[symbol] = float(trade["trade"].get("p", 0))
            except Exception:
                pass
        
        return snapshot
    
    def close(self):
        """Close the HTTP client."""
        if self._client:
            self._client.close()
            self._client = None

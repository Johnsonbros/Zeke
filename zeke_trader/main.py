"""
Main trading loop - the entry point for the trading system.
"""
import time
import signal
import sys
from datetime import datetime

from .config import load_config, TradingConfig, TradingMode
from .broker_mcp import AlpacaBroker
from .agent import TradingAgent
from .risk import risk_check
from .logger import TradingLogger
from .schemas import TradeIntent, NoTrade, MarketSnapshot


class TradingLoop:
    """Main trading loop orchestrator."""
    
    def __init__(self, cfg: TradingConfig):
        self.cfg = cfg
        self.broker = AlpacaBroker(cfg)
        self.agent = TradingAgent(cfg)
        self.logger = TradingLogger(cfg)
        self.running = False
    
    def run_once(self) -> None:
        """Run a single iteration of the trading loop."""
        print(f"\n{'='*60}")
        print(f"[{datetime.utcnow().isoformat()}] Trading Loop Iteration")
        print(f"Mode: {self.cfg.get_mode_description()}")
        print(f"{'='*60}")
        
        print("\n1. Gathering market snapshot...")
        snapshot = self.broker.get_market_snapshot(self.cfg.allowed_symbols[:3])
        self.logger.log_equity(snapshot)
        print(f"   Equity: ${snapshot.account_equity or 0:,.2f}")
        print(f"   Positions: {len(snapshot.positions)}")
        print(f"   Prices: {snapshot.prices}")
        
        print("\n2. Asking agent for decision...")
        decision = self.agent.decide(snapshot)
        print(f"   Decision: {decision.action}")
        if isinstance(decision, TradeIntent):
            print(f"   Symbol: {decision.symbol}, Side: {decision.side}, Notional: ${decision.notional_usd}")
        print(f"   Reason: {decision.reason}")
        print(f"   Confidence: {decision.confidence}")
        
        print("\n3. Running risk checks...")
        allowed, notes, final_decision = risk_check(decision, snapshot, self.cfg)
        print(f"   Allowed: {allowed}")
        print(f"   Notes: {notes}")
        
        self.logger.log_decision(decision, allowed, notes)
        
        if allowed and isinstance(final_decision, TradeIntent):
            print("\n4. Executing trade...")
            
            if self.cfg.trading_mode == TradingMode.SHADOW:
                print("   SHADOW MODE: Logging decision but NOT executing order")
                from .schemas import TradeResult as TR
                shadow_result = TR(
                    success=False,
                    order_id=None,
                    filled_avg_price=None,
                    filled_qty=None,
                    error="shadow_no_execute",
                    mode="shadow"
                )
                self.logger.log_trade(
                    final_decision.symbol,
                    final_decision.side,
                    final_decision.notional_usd,
                    result=shadow_result
                )
            elif self.cfg.can_execute_orders():
                result = self.broker.place_order_notional(
                    symbol=final_decision.symbol,
                    side=final_decision.side,
                    notional_usd=final_decision.notional_usd,
                    order_type=final_decision.order_type,
                    time_in_force=final_decision.time_in_force
                )
                self.logger.log_trade(
                    final_decision.symbol,
                    final_decision.side,
                    final_decision.notional_usd,
                    result
                )
                if result.success:
                    print(f"   SUCCESS: Order {result.order_id}")
                else:
                    print(f"   FAILED: {result.error}")
            else:
                print("   BLOCKED: Order execution not allowed in current mode")
        else:
            print("\n4. No trade to execute")
        
        print(f"\n{'='*60}")
    
    def run(self) -> None:
        """Run the main trading loop."""
        self.running = True
        
        print("\n" + "="*60)
        print("ZEKE TRADER STARTING")
        print("="*60)
        print(f"Mode: {self.cfg.get_mode_description()}")
        print(f"Allowed Symbols: {self.cfg.allowed_symbols}")
        print(f"Max $ Per Trade: ${self.cfg.max_dollars_per_trade}")
        print(f"Loop Interval: {self.cfg.loop_seconds}s")
        print("="*60 + "\n")
        
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        
        while self.running:
            try:
                self.run_once()
            except Exception as e:
                print(f"\nERROR in trading loop: {e}")
                import traceback
                traceback.print_exc()
            
            if self.running:
                print(f"\nSleeping for {self.cfg.loop_seconds} seconds...")
                time.sleep(self.cfg.loop_seconds)
        
        self.shutdown()
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals."""
        print(f"\nReceived signal {signum}, shutting down...")
        self.running = False
    
    def shutdown(self) -> None:
        """Clean shutdown."""
        print("\nShutting down ZEKE Trader...")
        self.broker.close()
        print("Goodbye!")


def main():
    """Entry point."""
    print("Loading configuration...")
    try:
        cfg = load_config()
    except ValueError as e:
        print(f"CONFIGURATION ERROR: {e}")
        sys.exit(1)
    
    if not cfg.alpaca_key_id or not cfg.alpaca_secret_key:
        print("WARNING: Alpaca API keys not set. Trading will fail.")
        print("Set ALPACA_KEY_ID and ALPACA_SECRET_KEY environment variables.")
    
    if not cfg.openai_api_key:
        print("WARNING: OpenAI API key not set. Agent decisions will fail.")
        print("Set OPENAI_API_KEY environment variable.")
    
    loop = TradingLoop(cfg)
    loop.run()


if __name__ == "__main__":
    main()

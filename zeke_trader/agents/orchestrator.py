"""
OrchestratorAgent - Top-level conductor.

Purpose: Run the loop, call sub-agents in order, and return a single result.

Handoffs (strict order):
  MarketDataAgent -> SignalAgent -> PortfolioAgent -> DecisionAgent -> RiskGateAgent -> ExecutionAgent -> ObservabilityAgent
"""
import logging
import time
from datetime import datetime
from typing import Optional

from .schemas import (
    LoopResult,
    MarketSnapshot,
    PortfolioState,
    NoTrade,
    PendingTrade,
    SignalDirection,
)
from .market_data import MarketDataAgent
from .signal import SignalAgent
from .portfolio import PortfolioAgent
from .decision import DecisionAgent
from .risk_gate import RiskGateAgent
from .execution import ExecutionAgent
from .observability import ObservabilityAgent
from .perplexity_research import PerplexityResearchAgent
from ..config import TradingConfig

logger = logging.getLogger("zeke_trader.agents.orchestrator")


class OrchestratorAgent:
    """
    Orchestrates the trading agent loop.
    
    Strict handoff order:
    1. MarketDataAgent - Fetch data
    2. SignalAgent - Generate signals
    3. PortfolioAgent - Get account state
    4. DecisionAgent - Pick one trade
    5. RiskGateAgent - Validate
    6. ExecutionAgent - Execute or queue
    7. ObservabilityAgent - Log everything
    """
    
    def __init__(self, config: TradingConfig):
        self.config = config
        
        self.market_data = MarketDataAgent(config)
        self.signal = SignalAgent(config)
        self.portfolio = PortfolioAgent(config)
        self.decision = DecisionAgent(config)
        self.risk_gate = RiskGateAgent(config)
        self.execution = ExecutionAgent(config)
        self.observability = ObservabilityAgent(config)
        self.perplexity = PerplexityResearchAgent(config)
        
        logger.info(f"Orchestrator initialized - Mode: {config.trading_mode.value}, Autonomy: {config.autonomy_tier.value}")
    
    async def run_loop(self) -> LoopResult:
        """
        Run one complete trading loop.
        
        Returns:
            LoopResult with complete audit trail
        """
        start_time = time.time()
        result = LoopResult(
            timestamp=datetime.utcnow(),
            market_snapshot=MarketSnapshot(),
            signals=[],
            portfolio_state=PortfolioState(equity=0, cash=0, buying_power=0),
            decision=NoTrade(action="no_trade", reason="Loop not completed"),
            risk_result=None,
            errors=[],
        )
        
        try:
            logger.info("=== LOOP START ===")
            
            logger.info("[1/7] Fetching market data...")
            snapshot = await self.market_data.fetch_snapshot()
            result.market_snapshot = snapshot
            
            if not snapshot.data_available:
                result.decision = NoTrade(
                    action="no_trade",
                    reason="DATA_UNAVAILABLE: Could not fetch market data",
                )
                result.duration_ms = (time.time() - start_time) * 1000
                self.observability.log_loop(result)
                return result
            
            logger.info("[2/7] Getting portfolio state...")
            try:
                portfolio = await self.portfolio.get_portfolio_state()
                result.portfolio_state = portfolio
                self.observability.log_equity(portfolio)
            except Exception as e:
                logger.error(f"Portfolio unavailable: {e}")
                if self.config.trading_mode.value != "shadow":
                    result.decision = NoTrade(
                        action="no_trade",
                        reason=f"PORTFOLIO_UNAVAILABLE: {str(e)}",
                    )
                    result.errors.append(str(e))
                    result.duration_ms = (time.time() - start_time) * 1000
                    self.observability.log_loop(result)
                    return result
                portfolio = PortfolioState(equity=0, cash=0, buying_power=0)
                result.portfolio_state = portfolio
            
            if self.config.trailing_stop_enabled and portfolio.positions:
                logger.info("[2.5/7] Updating trailing stops...")
                for pos in portfolio.positions:
                    symbol = pos.symbol
                    side = "long" if pos.qty > 0 else "short"
                    symbol_data = snapshot.market_data.get(symbol)
                    if symbol_data and symbol_data.quote:
                        current_price = symbol_data.quote.last
                        atr = symbol_data.atr_20 or 0
                        if atr > 0:
                            self.portfolio.update_trailing_stop(
                                symbol=symbol,
                                current_price=current_price,
                                atr=atr,
                                side=side,
                                atr_multiple=self.config.trailing_stop_atr_multiple,
                            )
            
            logger.info("[3/7] Generating signals...")
            signals = self.signal.generate_signals(snapshot, portfolio)
            result.signals = signals
            logger.info(f"Generated {len(signals)} signals")
            
            research_insights = {}
            precomputed_scored = None
            if signals and self.perplexity.enabled:
                filtered_scored, has_exits = self.decision.get_filtered_scored_signals(signals, portfolio)
                if not has_exits:
                    precomputed_scored = filtered_scored
                    if filtered_scored:
                        logger.info("[3.5/7] Researching high-impact signals...")
                        research_insights = await self.perplexity.research_signals(filtered_scored)
                        if research_insights:
                            result.perplexity_research = {
                                symbol: insight.model_dump(mode="json")
                                for symbol, insight in research_insights.items()
                            }
                            logger.info(f"Completed research for {len(research_insights)} high-impact signals")
                            self.observability.log_research(research_insights)
            
            logger.info("[4/7] Making decision...")
            decision = self.decision.make_decision(
                signals,
                portfolio,
                scored_signals=precomputed_scored,
                research_insights=research_insights,
            )
            result.decision = decision
            
            logger.info("[5/7] Risk gate validation...")
            signal_strength = 1.0
            atr = None
            current_price = None
            if hasattr(decision, 'signal') and decision.signal:
                signal_strength = min(decision.signal.score / 5.0, 1.0) if decision.signal.score else 1.0
                atr = decision.signal.atr_n if hasattr(decision.signal, 'atr_n') else None
                current_price = decision.signal.current_price if hasattr(decision.signal, 'current_price') else None
            risk_result = self.risk_gate.validate(
                decision,
                portfolio,
                signal_strength=signal_strength,
                atr=atr,
                current_price=current_price,
            )
            result.risk_result = risk_result
            
            logger.info("[6/7] Execution...")
            order_result, pending_trade = self.execution.execute(risk_result)
            result.order_result = order_result
            result.pending_trade = pending_trade
            
            if order_result.executed and hasattr(decision, 'signal') and decision.signal:
                sig_dir = decision.signal.direction
                is_exit = sig_dir in (SignalDirection.EXIT_LONG, SignalDirection.EXIT_SHORT)
                
                if is_exit:
                    entry_criteria = self.portfolio.get_entry_criteria(decision.symbol)
                    if entry_criteria and entry_criteria.get("entry_price"):
                        self.risk_gate.record_trade_result(
                            symbol=decision.symbol,
                            side="sell" if sig_dir == SignalDirection.EXIT_LONG else "buy",
                            entry_price=entry_criteria.get("entry_price"),
                            exit_price=decision.signal.current_price,
                            qty=order_result.qty or 1.0,
                        )
                        logger.info(f"Recorded exit trade for Kelly: {decision.symbol}")
                        self.portfolio.clear_entry_criteria(decision.symbol)
                else:
                    self.portfolio.save_entry_criteria(
                        symbol=decision.symbol,
                        criteria={
                            "stop_price": decision.stop_price,
                            "exit_ref": decision.exit_trigger,
                            "atr_n": decision.signal.atr_n,
                            "system": decision.signal.system.value,
                            "entry_price": decision.signal.current_price,
                            "entered_at": datetime.utcnow().isoformat(),
                        }
                    )
                
                thesis_dict = decision.thesis.model_dump() if decision.thesis else None
                self.observability.log_trade(
                    symbol=decision.symbol,
                    side=decision.side,
                    notional=decision.notional_usd,
                    order_id=order_result.order_id,
                    status=order_result.status,
                    entry_criteria={
                        "stop_price": decision.stop_price,
                        "exit_ref": decision.exit_trigger,
                    },
                    thesis=thesis_dict,
                )
            
            logger.info("[7/7] Logging...")
            result.duration_ms = (time.time() - start_time) * 1000
            self.observability.log_loop(result)
            
            if portfolio.equity > 0 and not snapshot.is_market_open:
                daily_pnl_pct = portfolio.pnl_day / portfolio.equity
                self.risk_gate.record_daily_pnl(daily_pnl_pct)
                logger.info(f"Recorded end-of-day P&L: {daily_pnl_pct:.2%}")
            
            logger.info(f"=== LOOP COMPLETE ({result.duration_ms:.0f}ms) ===")
            
        except Exception as e:
            logger.error(f"Loop error: {e}", exc_info=True)
            result.errors.append(str(e))
            result.duration_ms = (time.time() - start_time) * 1000
            self.observability.log_loop(result)
        
        return result
    
    def run_loop_sync(self) -> LoopResult:
        """Synchronous wrapper for run_loop."""
        import asyncio
        return asyncio.get_event_loop().run_until_complete(self.run_loop())
    
    def get_pending_trades(self) -> list[PendingTrade]:
        """Get all pending trades awaiting approval."""
        return self.execution.get_pending_trades()
    
    def approve_trade(self, trade_id: str):
        """Approve a pending trade."""
        result = self.execution.approve_trade(trade_id)
        
        if result.executed:
            pending_trades = self.execution._load_pending_trades()
            if trade_id in pending_trades:
                trade_data = pending_trades[trade_id]
                trade_intent = trade_data.get("trade_intent", {})
                
                self.portfolio.save_entry_criteria(
                    symbol=trade_intent.get("symbol", ""),
                    criteria={
                        "stop_price": trade_intent.get("stop_price"),
                        "exit_ref": trade_intent.get("exit_trigger"),
                        "entered_at": datetime.utcnow().isoformat(),
                    }
                )
                
                self.observability.log_trade(
                    symbol=trade_intent.get("symbol", ""),
                    side=trade_intent.get("side", ""),
                    notional=trade_intent.get("notional_usd", 0),
                    order_id=result.order_id,
                    status=result.status,
                )
        
        return result
    
    def reject_trade(self, trade_id: str, reason: str = ""):
        """Reject a pending trade."""
        return self.execution.reject_trade(trade_id, reason)
    
    def get_status(self) -> dict:
        """Get current orchestrator status."""
        regime_info = self.signal.strategy.get_regime_info() if hasattr(self.signal, 'strategy') else {}
        return {
            "mode": self.config.trading_mode.value,
            "autonomy": self.config.autonomy_tier.value,
            "allowed_symbols": self.config.allowed_symbols,
            "risk_limits": {
                "max_per_trade": self.config.max_dollars_per_trade,
                "max_positions": self.config.max_open_positions,
                "max_trades_day": self.config.max_trades_per_day,
                "max_daily_loss": self.config.max_daily_loss,
            },
            "can_execute": self.config.can_execute_orders(),
            "market_regime": regime_info,
            "trailing_stops_enabled": self.config.trailing_stop_enabled,
        }

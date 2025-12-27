"""
ExecutionAgent - Order placement with autonomy tier support.

Purpose: Place orders only if RiskGate allowed AND mode/autonomy allows
Respects autonomy tiers:
- MANUAL: Queue for approval
- MODERATE: Stops auto-execute, others queue
- FULL_AGENTIC: All trades auto-execute
"""
import logging
from datetime import datetime, timedelta
from typing import Optional
import json
from pathlib import Path
from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce

from .schemas import (
    Decision,
    TradeIntent,
    NoTrade,
    RiskResult,
    OrderResult,
    PendingTrade,
    PendingTradeStatus,
    SignalDirection,
)
from ..config import TradingConfig, AutonomyTier, TradingMode

logger = logging.getLogger("zeke_trader.agents.execution")


class ExecutionAgent:
    """Executes trades or queues them for approval based on autonomy tier."""
    
    def __init__(self, config: TradingConfig):
        self.config = config
        self.client = TradingClient(
            api_key=config.alpaca_key_id,
            secret_key=config.alpaca_secret_key,
            paper=config.trading_mode != TradingMode.LIVE,
        )
        self.pending_trades_file = Path(config.log_dir) / "pending_trades.json"
        self._ensure_log_dir()
    
    def _ensure_log_dir(self):
        """Ensure log directory exists."""
        Path(self.config.log_dir).mkdir(parents=True, exist_ok=True)
    
    def execute(
        self,
        risk_result: RiskResult,
    ) -> tuple[OrderResult, Optional[PendingTrade]]:
        """
        Execute or queue a trade based on risk result and autonomy tier.
        
        Returns:
            Tuple of (OrderResult, Optional[PendingTrade])
        """
        if not risk_result.allowed:
            return OrderResult(
                executed=False,
                status="blocked",
                message=f"Risk gate blocked: {risk_result.violations}",
            ), None
        
        decision = risk_result.final_decision
        
        if isinstance(decision, NoTrade):
            return OrderResult(
                executed=False,
                status="skipped",
                message=decision.reason,
            ), None
        
        trade = decision
        
        if not self.config.can_execute_orders():
            return OrderResult(
                executed=False,
                status="shadow_mode",
                message="Shadow mode - trade logged but not executed",
                symbol=trade.symbol,
                side=trade.side,
                notional=trade.notional_usd,
            ), None
        
        should_auto_execute = self._should_auto_execute(trade)
        
        if should_auto_execute:
            return self._execute_order(trade), None
        else:
            pending = self._queue_for_approval(trade, risk_result)
            return OrderResult(
                executed=False,
                status="queued_for_approval",
                message=f"Trade queued for manual approval (autonomy: {self.config.autonomy_tier.value})",
                symbol=trade.symbol,
                side=trade.side,
                notional=trade.notional_usd,
            ), pending
    
    def _should_auto_execute(self, trade: TradeIntent) -> bool:
        """Determine if trade should auto-execute based on autonomy tier."""
        tier = self.config.autonomy_tier
        
        if tier == AutonomyTier.FULL_AGENTIC:
            return True
        
        if tier == AutonomyTier.MODERATE:
            is_stop_loss = "STOP LOSS" in trade.reason.upper()
            is_exit = trade.signal.direction in [
                SignalDirection.EXIT_LONG,
                SignalDirection.EXIT_SHORT,
            ]
            return is_stop_loss or (is_exit and is_stop_loss)
        
        return False
    
    def _execute_order(self, trade: TradeIntent) -> OrderResult:
        """Execute the order via Alpaca."""
        try:
            side = OrderSide.BUY if trade.side == "buy" else OrderSide.SELL
            
            order_request = MarketOrderRequest(
                symbol=trade.symbol,
                notional=trade.notional_usd,
                side=side,
                time_in_force=TimeInForce.DAY,
            )
            
            order = self.client.submit_order(order_request)
            
            logger.info(f"ORDER PLACED: {trade.symbol} {trade.side} ${trade.notional_usd:.2f} -> {order.id}")
            
            return OrderResult(
                executed=True,
                order_id=str(order.id),
                symbol=trade.symbol,
                side=trade.side,
                notional=trade.notional_usd,
                status=order.status.value,
                message=f"Order submitted: {order.id}",
            )
            
        except Exception as e:
            logger.error(f"ORDER FAILED: {e}")
            return OrderResult(
                executed=False,
                symbol=trade.symbol,
                side=trade.side,
                notional=trade.notional_usd,
                status="error",
                message=f"Order failed: {str(e)}",
            )
    
    def _queue_for_approval(
        self,
        trade: TradeIntent,
        risk_result: RiskResult,
    ) -> PendingTrade:
        """Queue trade for manual approval."""
        from .portfolio import PortfolioAgent
        
        pending = PendingTrade(
            trade_intent=trade,
            portfolio_state=risk_result.original_decision.signal.model_dump() if hasattr(risk_result.original_decision, 'signal') else {},
            risk_result=risk_result,
            status=PendingTradeStatus.PENDING,
            expires_at=datetime.utcnow() + timedelta(hours=4),
        )
        
        self._save_pending_trade(pending)
        logger.info(f"TRADE QUEUED: {pending.id} - {trade.symbol} {trade.side} ${trade.notional_usd:.2f}")
        
        return pending
    
    def _save_pending_trade(self, pending: PendingTrade):
        """Save pending trade to file."""
        all_pending = self._load_pending_trades()
        all_pending[pending.id] = pending.model_dump(mode="json")
        
        with open(self.pending_trades_file, "w") as f:
            json.dump(all_pending, f, indent=2, default=str)
    
    def _load_pending_trades(self) -> dict:
        """Load all pending trades."""
        if not self.pending_trades_file.exists():
            return {}
        
        try:
            with open(self.pending_trades_file, "r") as f:
                return json.load(f)
        except:
            return {}
    
    def get_pending_trades(self) -> list[PendingTrade]:
        """Get all pending trades."""
        data = self._load_pending_trades()
        pending = []
        
        for trade_data in data.values():
            try:
                trade = PendingTrade.model_validate(trade_data)
                if trade.status == PendingTradeStatus.PENDING:
                    if datetime.fromisoformat(str(trade.expires_at)) > datetime.utcnow():
                        pending.append(trade)
                    else:
                        trade.status = PendingTradeStatus.EXPIRED
                        self._update_pending_trade(trade)
            except:
                continue
        
        return pending
    
    def _update_pending_trade(self, pending: PendingTrade):
        """Update a pending trade."""
        all_pending = self._load_pending_trades()
        all_pending[pending.id] = pending.model_dump(mode="json")
        
        with open(self.pending_trades_file, "w") as f:
            json.dump(all_pending, f, indent=2, default=str)
    
    def approve_trade(self, trade_id: str) -> OrderResult:
        """Approve and execute a pending trade."""
        all_pending = self._load_pending_trades()
        
        if trade_id not in all_pending:
            return OrderResult(
                executed=False,
                status="not_found",
                message=f"Trade {trade_id} not found",
            )
        
        trade_data = all_pending[trade_id]
        pending = PendingTrade.model_validate(trade_data)
        
        if pending.status != PendingTradeStatus.PENDING:
            return OrderResult(
                executed=False,
                status="invalid_state",
                message=f"Trade is {pending.status}, not pending",
            )
        
        if datetime.fromisoformat(str(pending.expires_at)) < datetime.utcnow():
            pending.status = PendingTradeStatus.EXPIRED
            self._update_pending_trade(pending)
            return OrderResult(
                executed=False,
                status="expired",
                message="Trade has expired",
            )
        
        result = self._execute_order(pending.trade_intent)
        
        pending.status = PendingTradeStatus.EXECUTED if result.executed else PendingTradeStatus.REJECTED
        pending.approved_at = datetime.utcnow()
        pending.execution_result = result
        self._update_pending_trade(pending)
        
        return result
    
    def reject_trade(self, trade_id: str, reason: str = "") -> bool:
        """Reject a pending trade."""
        all_pending = self._load_pending_trades()
        
        if trade_id not in all_pending:
            return False
        
        trade_data = all_pending[trade_id]
        pending = PendingTrade.model_validate(trade_data)
        
        pending.status = PendingTradeStatus.REJECTED
        pending.rejected_at = datetime.utcnow()
        pending.rejection_reason = reason
        self._update_pending_trade(pending)
        
        logger.info(f"TRADE REJECTED: {trade_id} - {reason}")
        return True

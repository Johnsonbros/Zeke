"""
AI Usage Logger for Python agents.

Logs all AI API calls with model string, tokens, costs, latency, and metadata.
Sends logs to Node.js via the bridge for centralized storage in SQLite.
"""

import hashlib
import time
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


class AiEndpoint(str, Enum):
    """AI API endpoint types."""
    CHAT = "chat"
    RESPONSES = "responses"
    EMBEDDINGS = "embeddings"
    TTS = "tts"
    VISION = "vision"
    BATCH = "batch"
    REALTIME = "realtime"


class AiLogStatus(str, Enum):
    """AI log status."""
    OK = "ok"
    ERROR = "error"
    TIMEOUT = "timeout"
    RATE_LIMITED = "rate_limited"


# Model pricing per 1M tokens (in cents) - Updated Dec 2024
MODEL_PRICING: dict[str, dict[str, float]] = {
    "gpt-4o": {"input": 250, "output": 1000},
    "gpt-4o-2024-11-20": {"input": 250, "output": 1000},
    "gpt-4o-2024-08-06": {"input": 250, "output": 1000},
    "gpt-4o-mini": {"input": 15, "output": 60},
    "gpt-4o-mini-2024-07-18": {"input": 15, "output": 60},
    "gpt-4-turbo": {"input": 1000, "output": 3000},
    "gpt-4-turbo-preview": {"input": 1000, "output": 3000},
    "gpt-4": {"input": 3000, "output": 6000},
    "gpt-3.5-turbo": {"input": 50, "output": 150},
    "gpt-3.5-turbo-0125": {"input": 50, "output": 150},
    "o1": {"input": 1500, "output": 6000},
    "o1-preview": {"input": 1500, "output": 6000},
    "o1-mini": {"input": 300, "output": 1200},
    "o3-mini": {"input": 110, "output": 440},
    "text-embedding-3-small": {"input": 2, "output": 0},
    "text-embedding-3-large": {"input": 13, "output": 0},
    "text-embedding-ada-002": {"input": 10, "output": 0},
}


@dataclass
class AiLogEvent:
    """AI log event data."""
    model: str
    endpoint: AiEndpoint
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    request_id: Optional[str] = None
    agent_id: Optional[str] = None
    tool_name: Optional[str] = None
    conversation_id: Optional[str] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    input_cost_cents: Optional[int] = None
    output_cost_cents: Optional[int] = None
    total_cost_cents: Optional[int] = None
    latency_ms: Optional[int] = None
    temperature: Optional[str] = None
    max_tokens: Optional[int] = None
    system_prompt_hash: Optional[str] = None
    tools_enabled: Optional[str] = None
    app_version: Optional[str] = None
    status: AiLogStatus = AiLogStatus.OK
    error_type: Optional[str] = None
    error_message: Optional[str] = None


def get_app_version() -> str:
    """Get app version from env or return dev."""
    return os.environ.get("APP_SHA") or os.environ.get("npm_package_version") or "dev"


def hash_system_prompt(prompt: Optional[str]) -> Optional[str]:
    """Hash system prompt for tracking drift without storing secrets."""
    if not prompt:
        return None
    return hashlib.sha256(prompt.encode()).hexdigest()[:16]


def calculate_cost(
    model: str,
    input_tokens: int,
    output_tokens: int
) -> tuple[int, int, int]:
    """
    Calculate cost in cents.
    
    Returns:
        Tuple of (input_cost_cents, output_cost_cents, total_cost_cents)
    """
    pricing = MODEL_PRICING.get(model, MODEL_PRICING.get("gpt-4o-mini", {"input": 15, "output": 60}))
    
    input_cost = (input_tokens / 1_000_000) * pricing["input"]
    output_cost = (output_tokens / 1_000_000) * pricing["output"]
    
    return (
        round(input_cost * 100),  # store as integer cents
        round(output_cost * 100),
        round((input_cost + output_cost) * 100),
    )


class AiLogger:
    """
    AI usage logger that sends logs to Node.js via bridge.
    
    Usage:
        ai_logger = AiLogger(bridge)
        
        # Log successful call
        ai_logger.log_event(AiLogEvent(
            model="gpt-4o",
            endpoint=AiEndpoint.CHAT,
            agent_id="conductor",
            input_tokens=1000,
            output_tokens=500,
            latency_ms=1234,
        ))
        
        # Log error
        ai_logger.log_error(
            model="gpt-4o",
            endpoint=AiEndpoint.CHAT,
            error=some_exception,
            agent_id="conductor",
        )
    """
    
    def __init__(self, bridge: Optional[Any] = None):
        """
        Initialize the AI logger.
        
        Args:
            bridge: Node.js bridge for sending logs. If None, logs locally.
        """
        self._bridge = bridge
        self._pending_logs: list[dict[str, Any]] = []
    
    def set_bridge(self, bridge: Any) -> None:
        """Set the bridge and flush any pending logs."""
        self._bridge = bridge
        self._flush_pending()
    
    def _flush_pending(self) -> None:
        """Flush pending logs that were queued before bridge was ready."""
        if self._bridge and self._pending_logs:
            for log in self._pending_logs:
                self._send_to_bridge(log)
            self._pending_logs.clear()
    
    def _send_to_bridge(self, log_data: dict[str, Any]) -> None:
        """Send log to Node.js via bridge."""
        try:
            if self._bridge:
                # Fire and forget - don't await to avoid blocking
                import asyncio
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        asyncio.create_task(self._async_send(log_data))
                    else:
                        loop.run_until_complete(self._async_send(log_data))
                except RuntimeError:
                    # No event loop - just log locally
                    logger.info(f"[AiLog] {log_data}")
            else:
                # No bridge - log locally
                logger.info(f"[AiLog] {log_data}")
        except Exception as e:
            logger.warning(f"Failed to send AI log to bridge: {e}")
    
    async def _async_send(self, log_data: dict[str, Any]) -> None:
        """Async send to bridge."""
        try:
            if self._bridge is not None:
                await self._bridge.execute_tool("log_ai_event", log_data)
        except Exception as e:
            logger.warning(f"Failed to send AI log: {e}")
    
    def log_event(self, event: AiLogEvent) -> None:
        """
        Log an AI event.
        
        Args:
            event: The AI log event to record
        """
        # Calculate costs if tokens provided
        if event.input_tokens is not None or event.output_tokens is not None:
            input_cost, output_cost, total_cost = calculate_cost(
                event.model,
                event.input_tokens or 0,
                event.output_tokens or 0,
            )
            event.input_cost_cents = event.input_cost_cents or input_cost
            event.output_cost_cents = event.output_cost_cents or output_cost
            event.total_cost_cents = event.total_cost_cents or total_cost
        
        # Set app version
        if not event.app_version:
            event.app_version = get_app_version()
        
        # Convert to dict for bridge
        log_data = {
            "model": event.model,
            "endpoint": event.endpoint.value,
            "timestamp": event.timestamp,
            "request_id": event.request_id,
            "agent_id": event.agent_id,
            "tool_name": event.tool_name,
            "conversation_id": event.conversation_id,
            "input_tokens": event.input_tokens,
            "output_tokens": event.output_tokens,
            "total_tokens": event.total_tokens or (
                (event.input_tokens or 0) + (event.output_tokens or 0)
            ),
            "input_cost_cents": event.input_cost_cents,
            "output_cost_cents": event.output_cost_cents,
            "total_cost_cents": event.total_cost_cents,
            "latency_ms": event.latency_ms,
            "temperature": event.temperature,
            "max_tokens": event.max_tokens,
            "system_prompt_hash": event.system_prompt_hash,
            "tools_enabled": event.tools_enabled,
            "app_version": event.app_version,
            "status": event.status.value,
            "error_type": event.error_type,
            "error_message": event.error_message,
        }
        
        # Remove None values
        log_data = {k: v for k, v in log_data.items() if v is not None}
        
        if self._bridge:
            self._send_to_bridge(log_data)
        else:
            # Queue for later if bridge not ready
            self._pending_logs.append(log_data)
            logger.debug(f"[AiLog] Queued: {event.model} {event.endpoint.value}")
    
    def log_error(
        self,
        model: str,
        endpoint: AiEndpoint,
        error: Exception,
        agent_id: Optional[str] = None,
        tool_name: Optional[str] = None,
        conversation_id: Optional[str] = None,
        latency_ms: Optional[int] = None,
    ) -> None:
        """
        Log an AI error.
        
        Args:
            model: Model that was called
            endpoint: API endpoint
            error: The exception that occurred
            agent_id: Agent that made the call
            tool_name: Tool that made the call
            conversation_id: Associated conversation
            latency_ms: Time elapsed before error
        """
        error_message = str(error)[:1000]  # truncate long messages
        error_type = type(error).__name__
        
        # Detect rate limiting
        status = AiLogStatus.ERROR
        if "rate limit" in error_message.lower() or getattr(error, "status_code", None) == 429:
            status = AiLogStatus.RATE_LIMITED
        elif "timeout" in error_message.lower():
            status = AiLogStatus.TIMEOUT
        
        self.log_event(AiLogEvent(
            model=model,
            endpoint=endpoint,
            agent_id=agent_id,
            tool_name=tool_name,
            conversation_id=conversation_id,
            latency_ms=latency_ms,
            status=status,
            error_type=error_type,
            error_message=error_message,
        ))


# Global logger instance
_ai_logger: Optional[AiLogger] = None


def get_ai_logger() -> AiLogger:
    """Get the global AI logger instance."""
    global _ai_logger
    if _ai_logger is None:
        _ai_logger = AiLogger()
    return _ai_logger


def set_ai_logger_bridge(bridge: Any) -> None:
    """Set the bridge for the global AI logger."""
    get_ai_logger().set_bridge(bridge)


# Convenience functions for direct logging
def log_ai_event(
    model: str,
    endpoint: AiEndpoint,
    agent_id: Optional[str] = None,
    input_tokens: Optional[int] = None,
    output_tokens: Optional[int] = None,
    latency_ms: Optional[int] = None,
    conversation_id: Optional[str] = None,
    **kwargs: Any,
) -> None:
    """
    Log an AI event using the global logger.
    
    Args:
        model: Model name (exact string passed to API)
        endpoint: API endpoint type
        agent_id: Agent that made the call
        input_tokens: Input token count
        output_tokens: Output token count
        latency_ms: Latency in milliseconds
        conversation_id: Associated conversation
        **kwargs: Additional fields
    """
    get_ai_logger().log_event(AiLogEvent(
        model=model,
        endpoint=endpoint,
        agent_id=agent_id,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=latency_ms,
        conversation_id=conversation_id,
        **kwargs,
    ))


def log_ai_error(
    model: str,
    endpoint: AiEndpoint,
    error: Exception,
    **kwargs: Any,
) -> None:
    """
    Log an AI error using the global logger.
    
    Args:
        model: Model name
        endpoint: API endpoint type
        error: The exception
        **kwargs: Additional context
    """
    get_ai_logger().log_error(model, endpoint, error, **kwargs)


logger.info("[AiLogger] Python AI logging module loaded")

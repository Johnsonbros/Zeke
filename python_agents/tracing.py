"""
Tracing and audit logging for ZEKE's multi-agent system.

This module provides structured tracing for:
- Request-level trace IDs that follow through all agent handoffs
- Agent lifecycle events (start, complete, error)
- Tool invocations and their results
- Inter-agent handoffs with timing and context
- Audit trail for security and debugging

The tracing system uses structured JSON logging for easy parsing
and integration with log aggregation systems.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any
import json
import logging
import time
import uuid

logger = logging.getLogger(__name__)


class TraceEventType(str, Enum):
    """Types of events in an agent trace."""
    REQUEST_START = "request_start"
    REQUEST_COMPLETE = "request_complete"
    AGENT_START = "agent_start"
    AGENT_COMPLETE = "agent_complete"
    AGENT_ERROR = "agent_error"
    TOOL_START = "tool_start"
    TOOL_COMPLETE = "tool_complete"
    TOOL_ERROR = "tool_error"
    HANDOFF_START = "handoff_start"
    HANDOFF_COMPLETE = "handoff_complete"
    VALIDATION_START = "validation_start"
    VALIDATION_COMPLETE = "validation_complete"
    MEMORY_ACCESS = "memory_access"
    SECURITY_CHECK = "security_check"
    RUN_BUDGET_EXCEEDED = "run_budget_exceeded"


@dataclass
class TraceEvent:
    """A single event in a trace."""
    event_type: TraceEventType
    timestamp: str
    trace_id: str
    span_id: str
    parent_span_id: str | None
    agent_id: str | None
    tool_name: str | None
    duration_ms: float | None
    data: dict[str, Any]
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "event_type": self.event_type.value,
            "timestamp": self.timestamp,
            "trace_id": self.trace_id,
            "span_id": self.span_id,
            "parent_span_id": self.parent_span_id,
            "agent_id": self.agent_id,
            "tool_name": self.tool_name,
            "duration_ms": self.duration_ms,
            **self.data
        }
    
    def to_json(self) -> str:
        """Serialize to JSON string."""
        return json.dumps(self.to_dict())


@dataclass
class TraceSpan:
    """A span representing a unit of work within a trace."""
    span_id: str
    parent_span_id: str | None
    name: str
    start_time: float
    end_time: float | None = None
    events: list[TraceEvent] = field(default_factory=list)
    
    @property
    def duration_ms(self) -> float | None:
        """Calculate duration in milliseconds."""
        if self.end_time is None:
            return None
        return (self.end_time - self.start_time) * 1000
    
    def complete(self) -> None:
        """Mark span as complete with current timestamp."""
        self.end_time = time.time()


@dataclass
class TraceContext:
    """
    Context for tracing a request through the multi-agent system.
    
    Each request gets a unique trace_id that follows through all
    agent handoffs, tool calls, and async operations.
    """
    trace_id: str
    root_span_id: str
    current_span_id: str
    spans: dict[str, TraceSpan] = field(default_factory=dict)
    events: list[TraceEvent] = field(default_factory=list)
    start_time: float = field(default_factory=time.time)
    metadata: dict[str, Any] = field(default_factory=dict)
    
    @classmethod
    def create(cls, metadata: dict[str, Any] | None = None) -> "TraceContext":
        """Create a new trace context for a request."""
        trace_id = str(uuid.uuid4())
        root_span_id = str(uuid.uuid4())[:8]
        
        ctx = cls(
            trace_id=trace_id,
            root_span_id=root_span_id,
            current_span_id=root_span_id,
            metadata=metadata or {}
        )
        
        root_span = TraceSpan(
            span_id=root_span_id,
            parent_span_id=None,
            name="request",
            start_time=time.time()
        )
        ctx.spans[root_span_id] = root_span
        
        return ctx
    
    def create_span(self, name: str) -> str:
        """
        Create a new child span under the current span.
        
        Args:
            name: Human-readable name for the span
            
        Returns:
            str: The new span ID
        """
        span_id = str(uuid.uuid4())[:8]
        span = TraceSpan(
            span_id=span_id,
            parent_span_id=self.current_span_id,
            name=name,
            start_time=time.time()
        )
        self.spans[span_id] = span
        parent_span_id = self.current_span_id
        self.current_span_id = span_id
        return span_id
    
    def complete_span(self, span_id: str) -> None:
        """
        Complete a span and return to parent.
        
        Args:
            span_id: ID of the span to complete
        """
        if span_id in self.spans:
            span = self.spans[span_id]
            span.complete()
            if span.parent_span_id:
                self.current_span_id = span.parent_span_id
            else:
                self.current_span_id = self.root_span_id
    
    def add_event(
        self,
        event_type: TraceEventType,
        agent_id: str | None = None,
        tool_name: str | None = None,
        duration_ms: float | None = None,
        **data: Any
    ) -> TraceEvent:
        """
        Add a trace event.
        
        Args:
            event_type: Type of the event
            agent_id: ID of the agent (if applicable)
            tool_name: Name of the tool (if applicable)
            duration_ms: Duration in milliseconds (if applicable)
            **data: Additional event data
            
        Returns:
            TraceEvent: The created event
        """
        event = TraceEvent(
            event_type=event_type,
            timestamp=datetime.utcnow().isoformat() + "Z",
            trace_id=self.trace_id,
            span_id=self.current_span_id,
            parent_span_id=self.spans.get(self.current_span_id, TraceSpan("", None, "", 0)).parent_span_id,
            agent_id=agent_id,
            tool_name=tool_name,
            duration_ms=duration_ms,
            data=data
        )
        self.events.append(event)
        
        if self.current_span_id in self.spans:
            self.spans[self.current_span_id].events.append(event)
        
        return event
    
    @property
    def total_duration_ms(self) -> float:
        """Get total trace duration in milliseconds."""
        return (time.time() - self.start_time) * 1000
    
    def to_summary(self) -> dict[str, Any]:
        """Generate a summary of the trace."""
        agent_events = [e for e in self.events if e.agent_id]
        tool_events = [e for e in self.events if e.tool_name]
        error_events = [e for e in self.events if "ERROR" in e.event_type.value]
        
        return {
            "trace_id": self.trace_id,
            "duration_ms": self.total_duration_ms,
            "span_count": len(self.spans),
            "event_count": len(self.events),
            "agents_involved": list(set(e.agent_id for e in agent_events if e.agent_id)),
            "tools_called": list(set(e.tool_name for e in tool_events if e.tool_name)),
            "error_count": len(error_events),
            "metadata": self.metadata
        }


class TracingLogger:
    """
    Logger wrapper that adds tracing context to all log entries.
    
    This provides structured logging with trace correlation for
    debugging and audit purposes.
    """
    
    def __init__(self, name: str = "zeke.tracing"):
        """Initialize the tracing logger."""
        self.logger = logging.getLogger(name)
        self._current_context: TraceContext | None = None
    
    def set_context(self, context: TraceContext) -> None:
        """Set the current trace context."""
        self._current_context = context
    
    def clear_context(self) -> None:
        """Clear the current trace context."""
        self._current_context = None
    
    def _format_message(self, message: str, extra: dict[str, Any] | None = None) -> str:
        """Format a log message with trace context."""
        data = extra or {}
        if self._current_context:
            data["trace_id"] = self._current_context.trace_id
            data["span_id"] = self._current_context.current_span_id
        
        if data:
            return f"{message} | {json.dumps(data)}"
        return message
    
    def info(self, message: str, **extra: Any) -> None:
        """Log an info message."""
        self.logger.info(self._format_message(message, extra))
    
    def warning(self, message: str, **extra: Any) -> None:
        """Log a warning message."""
        self.logger.warning(self._format_message(message, extra))
    
    def error(self, message: str, **extra: Any) -> None:
        """Log an error message."""
        self.logger.error(self._format_message(message, extra))
    
    def debug(self, message: str, **extra: Any) -> None:
        """Log a debug message."""
        self.logger.debug(self._format_message(message, extra))
    
    def log_event(self, event: TraceEvent) -> None:
        """Log a trace event."""
        level = logging.ERROR if "ERROR" in event.event_type.value else logging.INFO
        self.logger.log(level, f"TRACE_EVENT: {event.to_json()}")
    
    def log_request_start(
        self,
        context: TraceContext,
        source: str,
        user_message: str
    ) -> TraceEvent:
        """Log the start of a request."""
        self.set_context(context)
        event = context.add_event(
            TraceEventType.REQUEST_START,
            source=source,
            message_preview=user_message[:100] if user_message else ""
        )
        self.log_event(event)
        return event
    
    def log_request_complete(
        self,
        context: TraceContext,
        success: bool,
        response_preview: str = ""
    ) -> TraceEvent:
        """Log the completion of a request."""
        event = context.add_event(
            TraceEventType.REQUEST_COMPLETE,
            duration_ms=context.total_duration_ms,
            success=success,
            response_preview=response_preview[:100] if response_preview else ""
        )
        self.log_event(event)
        self.clear_context()
        return event
    
    def log_agent_start(
        self,
        context: TraceContext,
        agent_id: str,
        intent: str | None = None,
        span_id: str | None = None
    ) -> TraceEvent:
        """Log an agent starting to process.
        
        Args:
            context: The trace context
            agent_id: ID of the agent starting
            intent: Optional classified intent
            span_id: Optional existing span ID (if caller already created span)
        """
        original_span = context.current_span_id
        if span_id and span_id in context.spans:
            context.current_span_id = span_id
        
        try:
            event = context.add_event(
                TraceEventType.AGENT_START,
                agent_id=agent_id,
                intent=intent
            )
            self.log_event(event)
            return event
        finally:
            context.current_span_id = original_span if span_id else context.current_span_id
    
    def log_agent_complete(
        self,
        context: TraceContext,
        agent_id: str,
        result_preview: str = "",
        span_id: str | None = None
    ) -> TraceEvent:
        """Log an agent completing processing and close the span."""
        duration_ms = None
        if span_id and span_id in context.spans:
            span = context.spans[span_id]
            if span.end_time is None:
                span.complete()
            duration_ms = span.duration_ms
            if context.current_span_id == span_id:
                if span.parent_span_id:
                    context.current_span_id = span.parent_span_id
                else:
                    context.current_span_id = context.root_span_id
        
        event = context.add_event(
            TraceEventType.AGENT_COMPLETE,
            agent_id=agent_id,
            duration_ms=duration_ms,
            result_preview=result_preview[:100] if result_preview else ""
        )
        self.log_event(event)
        return event
    
    def log_agent_error(
        self,
        context: TraceContext,
        agent_id: str,
        error: str,
        span_id: str | None = None
    ) -> TraceEvent:
        """Log an agent error."""
        if span_id and span_id in context.spans:
            context.complete_span(span_id)
        
        event = context.add_event(
            TraceEventType.AGENT_ERROR,
            agent_id=agent_id,
            error=error
        )
        self.log_event(event)
        return event
    
    def log_tool_start(
        self,
        context: TraceContext,
        tool_name: str,
        agent_id: str | None = None,
        args_preview: str = ""
    ) -> tuple[TraceEvent, str]:
        """Log a tool invocation starting."""
        span_id = context.create_span(f"tool:{tool_name}")
        event = context.add_event(
            TraceEventType.TOOL_START,
            agent_id=agent_id,
            tool_name=tool_name,
            args_preview=args_preview[:200] if args_preview else ""
        )
        self.log_event(event)
        return event, span_id
    
    def log_tool_complete(
        self,
        context: TraceContext,
        tool_name: str,
        span_id: str,
        agent_id: str | None = None,
        result_preview: str = "",
        success: bool = True
    ) -> TraceEvent:
        """Log a tool invocation completing and close the span."""
        duration_ms = None
        if span_id in context.spans:
            span = context.spans[span_id]
            if span.end_time is None:
                span.complete()
            duration_ms = span.duration_ms
            if context.current_span_id == span_id:
                if span.parent_span_id:
                    context.current_span_id = span.parent_span_id
                else:
                    context.current_span_id = context.root_span_id
        
        event = context.add_event(
            TraceEventType.TOOL_COMPLETE,
            agent_id=agent_id,
            tool_name=tool_name,
            duration_ms=duration_ms,
            success=success,
            result_preview=result_preview[:200] if result_preview else ""
        )
        self.log_event(event)
        return event
    
    def log_tool_error(
        self,
        context: TraceContext,
        tool_name: str,
        span_id: str,
        error: str,
        agent_id: str | None = None
    ) -> TraceEvent:
        """Log a tool error."""
        if span_id in context.spans:
            context.complete_span(span_id)
        
        event = context.add_event(
            TraceEventType.TOOL_ERROR,
            agent_id=agent_id,
            tool_name=tool_name,
            error=error
        )
        self.log_event(event)
        return event
    
    def log_handoff(
        self,
        context: TraceContext,
        from_agent: str,
        to_agent: str,
        reason: str,
        message: str = ""
    ) -> TraceEvent:
        """Log an inter-agent handoff."""
        event = context.add_event(
            TraceEventType.HANDOFF_START,
            agent_id=from_agent,
            from_agent=from_agent,
            to_agent=to_agent,
            reason=reason,
            message=message[:200] if message else ""
        )
        self.log_event(event)
        return event
    
    def log_handoff_complete(
        self,
        context: TraceContext,
        from_agent: str,
        to_agent: str,
        success: bool
    ) -> TraceEvent:
        """Log completion of a handoff."""
        event = context.add_event(
            TraceEventType.HANDOFF_COMPLETE,
            from_agent=from_agent,
            to_agent=to_agent,
            success=success
        )
        self.log_event(event)
        return event
    
    def log_security_check(
        self,
        context: TraceContext,
        check_type: str,
        passed: bool,
        details: str = ""
    ) -> TraceEvent:
        """Log a security check."""
        event = context.add_event(
            TraceEventType.SECURITY_CHECK,
            check_type=check_type,
            passed=passed,
            details=details[:200] if details else ""
        )
        self.log_event(event)
        return event
    
    def log_memory_access(
        self,
        context: TraceContext,
        operation: str,
        memory_type: str,
        count: int = 0
    ) -> TraceEvent:
        """Log a memory access operation."""
        event = context.add_event(
            TraceEventType.MEMORY_ACCESS,
            operation=operation,
            memory_type=memory_type,
            count=count
        )
        self.log_event(event)
        return event
    
    def log_run_budget_exceeded(
        self,
        context: TraceContext,
        reason: str,
        tool_calls_used: int,
        tool_calls_limit: int,
        elapsed_seconds: float,
        timeout_seconds: float,
        tools_called: list[str],
        agent_id: str | None = None
    ) -> TraceEvent:
        """
        Log a run budget exceeded event.
        
        This is emitted when an agent run is stopped due to exceeding
        the tool call limit or timeout.
        
        Args:
            context: The trace context
            reason: Reason for budget exhaustion ("tool_calls" or "timeout")
            tool_calls_used: Number of tool calls made
            tool_calls_limit: Maximum tool calls allowed
            elapsed_seconds: Time elapsed in seconds
            timeout_seconds: Maximum time allowed
            tools_called: List of tool names that were called
            agent_id: Optional agent ID
        """
        event = context.add_event(
            TraceEventType.RUN_BUDGET_EXCEEDED,
            agent_id=agent_id,
            reason=reason,
            tool_calls_used=tool_calls_used,
            tool_calls_limit=tool_calls_limit,
            elapsed_seconds=round(elapsed_seconds, 2),
            timeout_seconds=timeout_seconds,
            tools_called=tools_called,
            summary=f"Budget exceeded: {reason} ({tool_calls_used}/{tool_calls_limit} calls, {elapsed_seconds:.1f}s/{timeout_seconds}s)"
        )
        self.log_event(event)
        return event


_tracing_logger: TracingLogger | None = None


def get_tracing_logger() -> TracingLogger:
    """Get the singleton tracing logger instance."""
    global _tracing_logger
    if _tracing_logger is None:
        _tracing_logger = TracingLogger()
    return _tracing_logger


def create_trace_context(metadata: dict[str, Any] | None = None) -> TraceContext:
    """Create a new trace context for a request."""
    return TraceContext.create(metadata)

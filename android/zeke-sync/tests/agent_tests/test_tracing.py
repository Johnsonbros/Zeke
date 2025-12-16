"""
Tests for the tracing module.

Tests TraceContext, TracingLogger, and trace event management.
"""

import pytest
import time
from unittest.mock import MagicMock, patch

from python_agents.tracing import (
    TraceContext,
    TraceSpan,
    TraceEvent,
    TraceEventType,
    TracingLogger,
    create_trace_context,
    get_tracing_logger,
)


class TestTraceContext:
    """Tests for TraceContext class."""
    
    def test_create_generates_unique_trace_id(self):
        """TraceContext.create() should generate a unique trace ID."""
        ctx1 = TraceContext.create()
        ctx2 = TraceContext.create()
        
        assert ctx1.trace_id != ctx2.trace_id
        assert len(ctx1.trace_id) == 36  # UUID format
    
    def test_create_generates_root_span(self):
        """TraceContext.create() should create a root span."""
        ctx = TraceContext.create()
        
        assert ctx.root_span_id is not None
        assert ctx.root_span_id in ctx.spans
        assert ctx.current_span_id == ctx.root_span_id
        
        root_span = ctx.spans[ctx.root_span_id]
        assert root_span.name == "request"
        assert root_span.parent_span_id is None
    
    def test_create_with_metadata(self):
        """TraceContext.create() should store provided metadata."""
        metadata = {"user_id": "test_user", "source": "web"}
        ctx = TraceContext.create(metadata)
        
        assert ctx.metadata == metadata
        assert ctx.metadata["user_id"] == "test_user"
    
    def test_create_span_generates_child_span(self):
        """create_span() should create a new child span."""
        ctx = TraceContext.create()
        original_span_id = ctx.current_span_id
        
        new_span_id = ctx.create_span("test_operation")
        
        assert new_span_id != original_span_id
        assert new_span_id in ctx.spans
        assert ctx.current_span_id == new_span_id
        
        new_span = ctx.spans[new_span_id]
        assert new_span.name == "test_operation"
        assert new_span.parent_span_id == original_span_id
    
    def test_create_span_maintains_hierarchy(self):
        """create_span() should maintain proper parent-child hierarchy."""
        ctx = TraceContext.create()
        root_id = ctx.root_span_id
        
        child1_id = ctx.create_span("child1")
        grandchild_id = ctx.create_span("grandchild")
        
        assert ctx.spans[child1_id].parent_span_id == root_id
        assert ctx.spans[grandchild_id].parent_span_id == child1_id
    
    def test_complete_span_sets_end_time(self):
        """complete_span() should set the span's end time."""
        ctx = TraceContext.create()
        span_id = ctx.create_span("test_span")
        
        time.sleep(0.01)  # Small delay to ensure measurable duration
        ctx.complete_span(span_id)
        
        span = ctx.spans[span_id]
        assert span.end_time is not None
        assert span.duration_ms is not None
        assert span.duration_ms > 0
    
    def test_complete_span_returns_to_parent(self):
        """complete_span() should update current_span_id to parent."""
        ctx = TraceContext.create()
        root_id = ctx.root_span_id
        child_id = ctx.create_span("child")
        
        ctx.complete_span(child_id)
        
        assert ctx.current_span_id == root_id
    
    def test_complete_span_to_root_stays_at_root(self):
        """complete_span() on root span should stay at root."""
        ctx = TraceContext.create()
        root_id = ctx.root_span_id
        
        ctx.complete_span(root_id)
        
        assert ctx.current_span_id == root_id
    
    def test_add_event_creates_event(self):
        """add_event() should create and store a TraceEvent."""
        ctx = TraceContext.create()
        
        event = ctx.add_event(
            TraceEventType.AGENT_START,
            agent_id="conductor",
            intent="send_message",
        )
        
        assert event.event_type == TraceEventType.AGENT_START
        assert event.agent_id == "conductor"
        assert event.trace_id == ctx.trace_id
        assert event.span_id == ctx.current_span_id
        assert "intent" in event.data
        assert event.data["intent"] == "send_message"
    
    def test_add_event_appends_to_events_list(self):
        """add_event() should append events to the events list."""
        ctx = TraceContext.create()
        
        ctx.add_event(TraceEventType.AGENT_START, agent_id="agent1")
        ctx.add_event(TraceEventType.AGENT_COMPLETE, agent_id="agent1")
        
        assert len(ctx.events) == 2
        assert ctx.events[0].event_type == TraceEventType.AGENT_START
        assert ctx.events[1].event_type == TraceEventType.AGENT_COMPLETE
    
    def test_add_event_appends_to_span_events(self):
        """add_event() should append events to the current span's events."""
        ctx = TraceContext.create()
        span_id = ctx.create_span("test_span")
        
        ctx.add_event(TraceEventType.TOOL_START, tool_name="send_sms")
        
        span = ctx.spans[span_id]
        assert len(span.events) == 1
        assert span.events[0].tool_name == "send_sms"
    
    def test_total_duration_ms(self):
        """total_duration_ms should return elapsed time since creation."""
        ctx = TraceContext.create()
        time.sleep(0.01)
        
        duration = ctx.total_duration_ms
        
        assert duration > 0
        assert duration >= 10  # At least 10ms
    
    def test_to_summary(self):
        """to_summary() should return a proper summary dict."""
        ctx = TraceContext.create({"session": "test"})
        ctx.add_event(TraceEventType.AGENT_START, agent_id="conductor")
        ctx.add_event(TraceEventType.TOOL_START, tool_name="send_sms")
        ctx.add_event(TraceEventType.AGENT_COMPLETE, agent_id="conductor")
        
        summary = ctx.to_summary()
        
        assert summary["trace_id"] == ctx.trace_id
        assert summary["span_count"] == 1
        assert summary["event_count"] == 3
        assert "conductor" in summary["agents_involved"]
        assert "send_sms" in summary["tools_called"]
        assert summary["metadata"]["session"] == "test"


class TestTraceSpan:
    """Tests for TraceSpan class."""
    
    def test_duration_ms_none_when_incomplete(self):
        """duration_ms should be None before span is complete."""
        span = TraceSpan(
            span_id="test",
            parent_span_id=None,
            name="test_span",
            start_time=time.time(),
        )
        
        assert span.duration_ms is None
    
    def test_duration_ms_calculated_when_complete(self):
        """duration_ms should be calculated after complete()."""
        span = TraceSpan(
            span_id="test",
            parent_span_id=None,
            name="test_span",
            start_time=time.time(),
        )
        
        time.sleep(0.01)
        span.complete()
        
        assert span.duration_ms is not None
        assert span.duration_ms >= 10
    
    def test_complete_sets_end_time(self):
        """complete() should set end_time."""
        span = TraceSpan(
            span_id="test",
            parent_span_id=None,
            name="test_span",
            start_time=time.time(),
        )
        
        assert span.end_time is None
        span.complete()
        assert span.end_time is not None


class TestTraceEvent:
    """Tests for TraceEvent class."""
    
    def test_to_dict(self):
        """to_dict() should serialize all fields correctly."""
        event = TraceEvent(
            event_type=TraceEventType.AGENT_START,
            timestamp="2024-01-15T10:00:00Z",
            trace_id="trace_123",
            span_id="span_456",
            parent_span_id="span_root",
            agent_id="conductor",
            tool_name=None,
            duration_ms=None,
            data={"intent": "send_message"},
        )
        
        result = event.to_dict()
        
        assert result["event_type"] == "agent_start"
        assert result["timestamp"] == "2024-01-15T10:00:00Z"
        assert result["trace_id"] == "trace_123"
        assert result["span_id"] == "span_456"
        assert result["parent_span_id"] == "span_root"
        assert result["agent_id"] == "conductor"
        assert result["intent"] == "send_message"
    
    def test_to_json(self):
        """to_json() should return valid JSON string."""
        event = TraceEvent(
            event_type=TraceEventType.TOOL_COMPLETE,
            timestamp="2024-01-15T10:00:00Z",
            trace_id="trace_123",
            span_id="span_456",
            parent_span_id=None,
            agent_id=None,
            tool_name="send_sms",
            duration_ms=150.5,
            data={"success": True},
        )
        
        json_str = event.to_json()
        
        import json
        parsed = json.loads(json_str)
        
        assert parsed["event_type"] == "tool_complete"
        assert parsed["tool_name"] == "send_sms"
        assert parsed["duration_ms"] == 150.5
        assert parsed["success"] is True


class TestTracingLogger:
    """Tests for TracingLogger class."""
    
    def test_set_and_clear_context(self):
        """set_context() and clear_context() should manage context."""
        logger = TracingLogger("test.logger")
        ctx = TraceContext.create()
        
        assert logger._current_context is None
        
        logger.set_context(ctx)
        assert logger._current_context == ctx
        
        logger.clear_context()
        assert logger._current_context is None
    
    def test_format_message_with_context(self):
        """_format_message should include trace context."""
        logger = TracingLogger("test.logger")
        ctx = TraceContext.create()
        logger.set_context(ctx)
        
        message = logger._format_message("Test message")
        
        assert "trace_id" in message
        assert ctx.trace_id in message
    
    def test_format_message_without_context(self):
        """_format_message should work without context."""
        logger = TracingLogger("test.logger")
        
        message = logger._format_message("Test message")
        
        assert message == "Test message"
    
    def test_log_agent_start(self, trace_context):
        """log_agent_start() should create AGENT_START event."""
        logger = TracingLogger("test.logger")
        
        event = logger.log_agent_start(trace_context, "conductor", intent="send_message")
        
        assert event.event_type == TraceEventType.AGENT_START
        assert event.agent_id == "conductor"
        assert event.data["intent"] == "send_message"
    
    def test_log_agent_complete(self, trace_context):
        """log_agent_complete() should create AGENT_COMPLETE event."""
        logger = TracingLogger("test.logger")
        span_id = trace_context.create_span("agent:conductor")
        
        time.sleep(0.01)
        event = logger.log_agent_complete(
            trace_context,
            "conductor",
            result_preview="Message sent successfully",
            span_id=span_id,
        )
        
        assert event.event_type == TraceEventType.AGENT_COMPLETE
        assert event.agent_id == "conductor"
        assert event.duration_ms is not None
        assert event.duration_ms > 0
    
    def test_log_agent_complete_handles_non_string_result(self, trace_context):
        """log_agent_complete() should handle non-string result_preview."""
        logger = TracingLogger("test.logger")
        span_id = trace_context.create_span("agent:test")
        
        event = logger.log_agent_complete(
            trace_context,
            "test_agent",
            result_preview="",
            span_id=span_id,
        )
        
        assert event.event_type == TraceEventType.AGENT_COMPLETE
        assert event.data.get("result_preview") == ""
    
    def test_log_agent_error(self, trace_context):
        """log_agent_error() should create AGENT_ERROR event."""
        logger = TracingLogger("test.logger")
        span_id = trace_context.create_span("agent:test")
        
        event = logger.log_agent_error(
            trace_context,
            "test_agent",
            "Connection timeout",
            span_id=span_id,
        )
        
        assert event.event_type == TraceEventType.AGENT_ERROR
        assert event.agent_id == "test_agent"
        assert event.data["error"] == "Connection timeout"
    
    def test_log_tool_start(self, trace_context):
        """log_tool_start() should create TOOL_START event and span."""
        logger = TracingLogger("test.logger")
        
        event, span_id = logger.log_tool_start(
            trace_context,
            "send_sms",
            agent_id="comms_pilot",
            args_preview='{"to": "+15551234567"}',
        )
        
        assert event.event_type == TraceEventType.TOOL_START
        assert event.tool_name == "send_sms"
        assert span_id in trace_context.spans
        assert trace_context.spans[span_id].name == "tool:send_sms"
    
    def test_log_tool_complete(self, trace_context):
        """log_tool_complete() should create TOOL_COMPLETE event."""
        logger = TracingLogger("test.logger")
        _, span_id = logger.log_tool_start(trace_context, "send_sms")
        
        time.sleep(0.01)
        event = logger.log_tool_complete(
            trace_context,
            "send_sms",
            span_id,
            result_preview='{"success": true}',
            success=True,
        )
        
        assert event.event_type == TraceEventType.TOOL_COMPLETE
        assert event.tool_name == "send_sms"
        assert event.duration_ms is not None
        assert event.data["success"] is True
    
    def test_log_tool_error(self, trace_context):
        """log_tool_error() should create TOOL_ERROR event."""
        logger = TracingLogger("test.logger")
        _, span_id = logger.log_tool_start(trace_context, "send_sms")
        
        event = logger.log_tool_error(
            trace_context,
            "send_sms",
            span_id,
            "Network timeout",
            agent_id="comms_pilot",
        )
        
        assert event.event_type == TraceEventType.TOOL_ERROR
        assert event.tool_name == "send_sms"
        assert event.data["error"] == "Network timeout"
    
    def test_log_handoff(self, trace_context):
        """log_handoff() should create HANDOFF_START event."""
        logger = TracingLogger("test.logger")
        
        event = logger.log_handoff(
            trace_context,
            from_agent="conductor",
            to_agent="comms_pilot",
            reason="capability_required",
            message="Routing SMS request",
        )
        
        assert event.event_type == TraceEventType.HANDOFF_START
        assert event.data["from_agent"] == "conductor"
        assert event.data["to_agent"] == "comms_pilot"
        assert event.data["reason"] == "capability_required"
    
    def test_log_handoff_complete(self, trace_context):
        """log_handoff_complete() should create HANDOFF_COMPLETE event."""
        logger = TracingLogger("test.logger")
        
        event = logger.log_handoff_complete(
            trace_context,
            from_agent="conductor",
            to_agent="comms_pilot",
            success=True,
        )
        
        assert event.event_type == TraceEventType.HANDOFF_COMPLETE
        assert event.data["from_agent"] == "conductor"
        assert event.data["to_agent"] == "comms_pilot"
        assert event.data["success"] is True
    
    def test_handoff_start_complete_pairing(self, trace_context):
        """HANDOFF_START should be paired with HANDOFF_COMPLETE."""
        logger = TracingLogger("test.logger")
        
        start_event = logger.log_handoff(
            trace_context,
            from_agent="conductor",
            to_agent="ops_planner",
            reason="task_continuation",
        )
        
        complete_event = logger.log_handoff_complete(
            trace_context,
            from_agent="conductor",
            to_agent="ops_planner",
            success=True,
        )
        
        handoff_events = [e for e in trace_context.events if "handoff" in e.event_type.value]
        assert len(handoff_events) == 2
        assert handoff_events[0].event_type == TraceEventType.HANDOFF_START
        assert handoff_events[1].event_type == TraceEventType.HANDOFF_COMPLETE
    
    def test_log_request_start(self, trace_context):
        """log_request_start() should create REQUEST_START event."""
        logger = TracingLogger("test.logger")
        
        event = logger.log_request_start(
            trace_context,
            source="web",
            user_message="Hello, send a text",
        )
        
        assert event.event_type == TraceEventType.REQUEST_START
        assert event.data["source"] == "web"
        assert "message_preview" in event.data
        assert logger._current_context == trace_context
    
    def test_log_request_complete(self, trace_context):
        """log_request_complete() should create REQUEST_COMPLETE event."""
        logger = TracingLogger("test.logger")
        logger.set_context(trace_context)
        
        time.sleep(0.01)
        event = logger.log_request_complete(
            trace_context,
            success=True,
            response_preview="Done!",
        )
        
        assert event.event_type == TraceEventType.REQUEST_COMPLETE
        assert event.data["success"] is True
        assert event.duration_ms is not None
        assert logger._current_context is None  # Context should be cleared
    
    def test_log_security_check(self, trace_context):
        """log_security_check() should create SECURITY_CHECK event."""
        logger = TracingLogger("test.logger")
        
        event = logger.log_security_check(
            trace_context,
            check_type="permission_verify",
            passed=True,
            details="Admin access confirmed",
        )
        
        assert event.event_type == TraceEventType.SECURITY_CHECK
        assert event.data["check_type"] == "permission_verify"
        assert event.data["passed"] is True
    
    def test_log_memory_access(self, trace_context):
        """log_memory_access() should create MEMORY_ACCESS event."""
        logger = TracingLogger("test.logger")
        
        event = logger.log_memory_access(
            trace_context,
            operation="search",
            memory_type="semantic",
            count=5,
        )
        
        assert event.event_type == TraceEventType.MEMORY_ACCESS
        assert event.data["operation"] == "search"
        assert event.data["memory_type"] == "semantic"
        assert event.data["count"] == 5


class TestModuleFunctions:
    """Tests for module-level functions."""
    
    def test_get_tracing_logger_returns_singleton(self):
        """get_tracing_logger() should return the same instance."""
        logger1 = get_tracing_logger()
        logger2 = get_tracing_logger()
        
        assert logger1 is logger2
    
    def test_create_trace_context(self):
        """create_trace_context() should create a valid TraceContext."""
        ctx = create_trace_context({"test": "value"})
        
        assert ctx.trace_id is not None
        assert ctx.root_span_id is not None
        assert ctx.metadata["test"] == "value"
    
    def test_create_trace_context_without_metadata(self):
        """create_trace_context() should work without metadata."""
        ctx = create_trace_context()
        
        assert ctx.trace_id is not None
        assert ctx.metadata == {}


class TestTraceEventType:
    """Tests for TraceEventType enum."""
    
    def test_all_event_types_exist(self):
        """All expected event types should be defined."""
        expected_types = [
            "REQUEST_START",
            "REQUEST_COMPLETE",
            "AGENT_START",
            "AGENT_COMPLETE",
            "AGENT_ERROR",
            "TOOL_START",
            "TOOL_COMPLETE",
            "TOOL_ERROR",
            "HANDOFF_START",
            "HANDOFF_COMPLETE",
            "VALIDATION_START",
            "VALIDATION_COMPLETE",
            "MEMORY_ACCESS",
            "SECURITY_CHECK",
        ]
        
        for type_name in expected_types:
            assert hasattr(TraceEventType, type_name)
    
    def test_event_type_values(self):
        """Event type values should be snake_case strings."""
        assert TraceEventType.AGENT_START.value == "agent_start"
        assert TraceEventType.TOOL_COMPLETE.value == "tool_complete"
        assert TraceEventType.HANDOFF_START.value == "handoff_start"

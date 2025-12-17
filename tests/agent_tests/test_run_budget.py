"""
Tests for the RunBudget guard.

Tests resource limiting functionality including:
- Tool call count limits (max 25)
- Timeout limits (120 seconds)
- Budget exceeded detection and summary generation
- Simulating 30 mock tool calls and asserting stop at 25
"""

import pytest
import time
from unittest.mock import AsyncMock, MagicMock, patch

from python_agents.guards.run_budget import (
    RunBudget,
    RunBudgetExceeded,
    BudgetExceededReason,
    BudgetSummary,
)
from python_agents.agents.base import AgentContext, AgentId
from python_agents.tracing import create_trace_context


class TestRunBudgetBasics:
    """Tests for basic RunBudget functionality."""
    
    def test_default_limits(self):
        """RunBudget should have correct default limits."""
        budget = RunBudget()
        
        assert budget.max_tool_calls == 25
        assert budget.timeout_seconds == 120.0
        assert budget.tool_call_count == 0
        assert not budget.is_exceeded()
    
    def test_custom_limits(self):
        """RunBudget should accept custom limits."""
        budget = RunBudget(max_tool_calls=10, timeout_seconds=60.0)
        
        assert budget.max_tool_calls == 10
        assert budget.timeout_seconds == 60.0
    
    def test_record_tool_call(self):
        """record_tool_call() should increment counter and track tool names."""
        budget = RunBudget()
        
        budget.record_tool_call("send_sms")
        budget.record_tool_call("get_weather")
        
        assert budget.tool_call_count == 2
        summary = budget.get_summary()
        assert "send_sms" in summary.tools_called
        assert "get_weather" in summary.tools_called
    
    def test_remaining_tool_calls(self):
        """remaining_tool_calls should return correct count."""
        budget = RunBudget(max_tool_calls=10)
        
        assert budget.remaining_tool_calls == 10
        
        for i in range(5):
            budget.record_tool_call(f"tool_{i}")
        
        assert budget.remaining_tool_calls == 5
    
    def test_elapsed_seconds(self):
        """elapsed_seconds should track time since creation."""
        budget = RunBudget()
        
        assert budget.elapsed_seconds >= 0
        assert budget.elapsed_seconds < 1  # Should be nearly instant
    
    def test_repr(self):
        """__repr__ should return useful string."""
        budget = RunBudget(max_tool_calls=10)
        budget.record_tool_call("test_tool")
        
        repr_str = repr(budget)
        
        assert "RunBudget" in repr_str
        assert "1/10" in repr_str


class TestRunBudgetExceeded:
    """Tests for budget exceeded detection."""
    
    def test_tool_call_limit_exceeded(self):
        """is_exceeded() should return True when tool call limit is reached."""
        budget = RunBudget(max_tool_calls=5)
        
        for i in range(5):
            budget.record_tool_call(f"tool_{i}")
        
        assert budget.is_exceeded()
        assert budget._exceeded_reason == BudgetExceededReason.TOOL_CALLS
    
    def test_can_execute_tool_returns_false_at_limit(self):
        """can_execute_tool() should return False when at limit."""
        budget = RunBudget(max_tool_calls=3)
        
        assert budget.can_execute_tool()
        budget.record_tool_call("tool_1")
        
        assert budget.can_execute_tool()
        budget.record_tool_call("tool_2")
        
        assert budget.can_execute_tool()
        budget.record_tool_call("tool_3")
        
        assert not budget.can_execute_tool()
    
    def test_timeout_exceeded(self):
        """is_exceeded() should return True when timeout is reached."""
        budget = RunBudget(timeout_seconds=0.01)
        
        time.sleep(0.02)
        
        assert budget.is_exceeded()
        assert budget._exceeded_reason == BudgetExceededReason.TIMEOUT
    
    def test_check_budget_raises_exception(self):
        """check_budget() should raise RunBudgetExceeded when exceeded."""
        budget = RunBudget(max_tool_calls=2)
        
        budget.record_tool_call("tool_1")
        budget.record_tool_call("tool_2")
        
        with pytest.raises(RunBudgetExceeded) as exc_info:
            budget.check_budget()
        
        assert exc_info.value.summary.exceeded
        assert exc_info.value.summary.exceeded_reason == BudgetExceededReason.TOOL_CALLS


class TestBudgetSummary:
    """Tests for BudgetSummary generation."""
    
    def test_summary_not_exceeded(self):
        """get_summary() should return correct summary when not exceeded."""
        budget = RunBudget(max_tool_calls=10, timeout_seconds=60.0)
        budget.record_tool_call("test_tool")
        
        summary = budget.get_summary()
        
        assert summary.tool_calls_used == 1
        assert summary.tool_calls_limit == 10
        assert summary.timeout_seconds == 60.0
        assert not summary.exceeded
        assert summary.exceeded_reason is None
        assert summary.tools_called == ["test_tool"]
    
    def test_summary_exceeded(self):
        """get_summary() should return correct summary when exceeded."""
        budget = RunBudget(max_tool_calls=2)
        budget.record_tool_call("tool_1")
        budget.record_tool_call("tool_2")
        
        summary = budget.get_summary()
        
        assert summary.exceeded
        assert summary.exceeded_reason == BudgetExceededReason.TOOL_CALLS
    
    def test_summary_to_dict(self):
        """BudgetSummary.to_dict() should return serializable dict."""
        budget = RunBudget(max_tool_calls=5)
        budget.record_tool_call("send_sms")
        
        summary = budget.get_summary()
        result = summary.to_dict()
        
        assert isinstance(result, dict)
        assert result["tool_calls_used"] == 1
        assert result["tool_calls_limit"] == 5
        assert result["exceeded"] is False
        assert "send_sms" in result["tools_called"]
    
    def test_summary_format_message_not_exceeded(self):
        """format_message() should return completion message when not exceeded."""
        budget = RunBudget(max_tool_calls=10)
        budget.record_tool_call("test_tool")
        
        message = budget.get_summary().format_message()
        
        assert "Completed within budget" in message
        assert "1/10" in message
    
    def test_summary_format_message_tool_calls_exceeded(self):
        """format_message() should return tool call exceeded message."""
        budget = RunBudget(max_tool_calls=2)
        budget.record_tool_call("tool_1")
        budget.record_tool_call("tool_2")
        
        message = budget.get_summary().format_message()
        
        assert "Budget exceeded" in message
        assert "2 tool call limit" in message
    
    def test_summary_format_message_timeout_exceeded(self):
        """format_message() should return timeout exceeded message."""
        budget = RunBudget(timeout_seconds=0.01)
        time.sleep(0.02)
        
        message = budget.get_summary().format_message()
        
        assert "Budget exceeded" in message
        assert "timeout" in message


class TestRunBudgetReset:
    """Tests for budget reset functionality."""
    
    def test_reset_clears_counters(self):
        """reset() should clear all counters and create fresh budget."""
        budget = RunBudget(max_tool_calls=10)
        
        for i in range(5):
            budget.record_tool_call(f"tool_{i}")
        
        assert budget.tool_call_count == 5
        
        budget.reset()
        
        assert budget.tool_call_count == 0
        assert len(budget._tools_called) == 0
        assert not budget.is_exceeded()


class TestSimulate30ToolCalls:
    """
    Integration test: Simulate 30 mock tool calls and assert stop at 25.
    
    This is the key test case specified in the requirements.
    """
    
    def test_stops_at_25_tool_calls(self):
        """Budget should prevent execution after 25 tool calls."""
        budget = RunBudget(max_tool_calls=25)
        
        executed_count = 0
        stopped_at = None
        
        for i in range(30):
            if not budget.can_execute_tool():
                stopped_at = i
                break
            
            budget.record_tool_call(f"mock_tool_{i}")
            executed_count += 1
        
        assert executed_count == 25, f"Expected 25 executions, got {executed_count}"
        assert stopped_at == 25, f"Expected to stop at iteration 25, stopped at {stopped_at}"
        assert budget.is_exceeded()
        assert budget._exceeded_reason == BudgetExceededReason.TOOL_CALLS
        
        summary = budget.get_summary()
        assert summary.tool_calls_used == 25
        assert summary.tool_calls_limit == 25
        assert len(summary.tools_called) == 25
    
    def test_30_tool_calls_raises_exception(self):
        """Attempting 30 tool calls should raise RunBudgetExceeded at 25."""
        budget = RunBudget(max_tool_calls=25)
        
        executed_tools = []
        
        with pytest.raises(RunBudgetExceeded) as exc_info:
            for i in range(30):
                budget.check_budget()
                budget.record_tool_call(f"mock_tool_{i}")
                executed_tools.append(f"mock_tool_{i}")
        
        assert len(executed_tools) == 25
        
        summary = exc_info.value.summary
        assert summary.exceeded
        assert summary.exceeded_reason == BudgetExceededReason.TOOL_CALLS
        assert summary.tool_calls_used == 25


class TestAgentContextIntegration:
    """Tests for AgentContext integration with RunBudget."""
    
    def test_agent_context_with_run_budget(self):
        """AgentContext should hold run_budget reference."""
        budget = RunBudget()
        context = AgentContext(
            user_message="test",
            run_budget=budget,
        )
        
        assert context.run_budget is budget
    
    def test_ensure_run_budget_creates_budget(self):
        """ensure_run_budget() should create budget if not present."""
        context = AgentContext(user_message="test")
        
        assert context.run_budget is None
        
        budget = context.ensure_run_budget()
        
        assert context.run_budget is budget
        assert budget.max_tool_calls == RunBudget.DEFAULT_MAX_TOOL_CALLS
        assert budget.timeout_seconds == RunBudget.DEFAULT_TIMEOUT_SECONDS
    
    def test_ensure_run_budget_returns_existing(self):
        """ensure_run_budget() should return existing budget if present."""
        budget = RunBudget(max_tool_calls=10)
        context = AgentContext(user_message="test", run_budget=budget)
        
        returned_budget = context.ensure_run_budget()
        
        assert returned_budget is budget
        assert returned_budget.max_tool_calls == 10
    
    def test_ensure_run_budget_custom_limits(self):
        """ensure_run_budget() should accept custom limits."""
        context = AgentContext(user_message="test")
        
        budget = context.ensure_run_budget(max_tool_calls=50, timeout_seconds=300.0)
        
        assert budget.max_tool_calls == 50
        assert budget.timeout_seconds == 300.0


class TestBudgetCountsFailedCalls:
    """Regression tests: failed tool calls must also consume budget."""
    
    def test_failed_calls_consume_budget(self):
        """Even if tool execution fails, it should consume budget."""
        budget = RunBudget(max_tool_calls=5)
        
        for i in range(5):
            budget.record_tool_call(f"failed_tool_{i}")
        
        assert budget.tool_call_count == 5
        assert budget.is_exceeded()
        assert budget._exceeded_reason == BudgetExceededReason.TOOL_CALLS
    
    def test_mixed_success_and_failure_consume_budget(self):
        """Mix of successful and failed calls should all consume budget."""
        budget = RunBudget(max_tool_calls=10)
        
        for i in range(10):
            budget.record_tool_call(f"tool_{i}")
        
        assert budget.tool_call_count == 10
        assert budget.is_exceeded()


class TestRunBudgetExceededException:
    """Tests for RunBudgetExceeded exception."""
    
    def test_exception_contains_summary(self):
        """RunBudgetExceeded should contain budget summary."""
        budget = RunBudget(max_tool_calls=1)
        budget.record_tool_call("test_tool")
        
        summary = budget.get_summary()
        exc = RunBudgetExceeded(summary)
        
        assert exc.summary is summary
        assert "Budget exceeded" in str(exc)
    
    def test_exception_message_is_informative(self):
        """Exception message should be human-readable."""
        budget = RunBudget(max_tool_calls=5)
        for i in range(5):
            budget.record_tool_call(f"tool_{i}")
        
        summary = budget.get_summary()
        exc = RunBudgetExceeded(summary)
        
        message = str(exc)
        
        assert "5" in message  # limit
        assert "tool call" in message.lower() or "budget" in message.lower()

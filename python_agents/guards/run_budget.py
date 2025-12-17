"""
RunBudget guard for limiting agent execution resources.

This module provides a guard that enforces:
- Maximum tool call count (default: 25)
- Maximum execution time (default: 120 seconds)

When either limit is exceeded, the guard signals that execution should stop
and emits a RUN_BUDGET_EXCEEDED event with a summary.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any
import time
import logging

logger = logging.getLogger(__name__)


class BudgetExceededReason(str, Enum):
    """Reason for budget exhaustion."""
    TOOL_CALLS = "tool_calls"
    TIMEOUT = "timeout"


@dataclass
class BudgetSummary:
    """Summary of budget usage when execution completes or is stopped."""
    tool_calls_used: int
    tool_calls_limit: int
    elapsed_seconds: float
    timeout_seconds: float
    exceeded: bool
    exceeded_reason: BudgetExceededReason | None
    tools_called: list[str] = field(default_factory=list)
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "tool_calls_used": self.tool_calls_used,
            "tool_calls_limit": self.tool_calls_limit,
            "elapsed_seconds": round(self.elapsed_seconds, 2),
            "timeout_seconds": self.timeout_seconds,
            "exceeded": self.exceeded,
            "exceeded_reason": self.exceeded_reason.value if self.exceeded_reason else None,
            "tools_called": self.tools_called,
        }
    
    def format_message(self) -> str:
        """Format a human-readable summary message."""
        if not self.exceeded:
            return f"Completed within budget: {self.tool_calls_used}/{self.tool_calls_limit} tool calls, {self.elapsed_seconds:.1f}s elapsed"
        
        if self.exceeded_reason == BudgetExceededReason.TOOL_CALLS:
            return f"Budget exceeded: reached {self.tool_calls_limit} tool call limit after {self.elapsed_seconds:.1f}s"
        else:
            return f"Budget exceeded: timeout after {self.timeout_seconds}s ({self.tool_calls_used} tool calls made)"


class RunBudgetExceeded(Exception):
    """Exception raised when run budget is exceeded."""
    
    def __init__(self, summary: BudgetSummary):
        self.summary = summary
        super().__init__(summary.format_message())


class RunBudget:
    """
    Guard that tracks and enforces resource limits for agent execution.
    
    This guard monitors:
    - Tool call count: Stops execution when max_tool_calls is reached
    - Execution time: Stops execution when timeout_seconds is exceeded
    
    Usage:
        budget = RunBudget(max_tool_calls=25, timeout_seconds=120)
        
        # Before each tool call
        if budget.is_exceeded():
            summary = budget.get_summary()
            # Handle budget exceeded...
        
        # After each tool call
        budget.record_tool_call("send_sms")
    
    Attributes:
        max_tool_calls: Maximum number of tool calls allowed (default: 25)
        timeout_seconds: Maximum execution time in seconds (default: 120)
    """
    
    DEFAULT_MAX_TOOL_CALLS = 25
    DEFAULT_TIMEOUT_SECONDS = 120.0
    
    def __init__(
        self,
        max_tool_calls: int = DEFAULT_MAX_TOOL_CALLS,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    ):
        """
        Initialize the RunBudget guard.
        
        Args:
            max_tool_calls: Maximum number of tool calls allowed
            timeout_seconds: Maximum execution time in seconds
        """
        self.max_tool_calls = max_tool_calls
        self.timeout_seconds = timeout_seconds
        self._tool_call_count = 0
        self._start_time = time.time()
        self._tools_called: list[str] = []
        self._exceeded_reason: BudgetExceededReason | None = None
    
    @property
    def tool_call_count(self) -> int:
        """Get the current tool call count."""
        return self._tool_call_count
    
    @property
    def elapsed_seconds(self) -> float:
        """Get elapsed time in seconds since budget was created."""
        return time.time() - self._start_time
    
    @property
    def remaining_tool_calls(self) -> int:
        """Get remaining tool calls before limit is reached."""
        return max(0, self.max_tool_calls - self._tool_call_count)
    
    @property
    def remaining_seconds(self) -> float:
        """Get remaining time before timeout."""
        return max(0.0, self.timeout_seconds - self.elapsed_seconds)
    
    def record_tool_call(self, tool_name: str) -> None:
        """
        Record that a tool was called.
        
        Args:
            tool_name: Name of the tool that was called
        """
        self._tool_call_count += 1
        self._tools_called.append(tool_name)
        logger.debug(
            f"RunBudget: tool call {self._tool_call_count}/{self.max_tool_calls} "
            f"({tool_name}), {self.elapsed_seconds:.1f}s elapsed"
        )
    
    def is_exceeded(self) -> bool:
        """
        Check if the budget has been exceeded.
        
        Returns:
            bool: True if either tool call limit or timeout has been exceeded
        """
        if self._tool_call_count >= self.max_tool_calls:
            self._exceeded_reason = BudgetExceededReason.TOOL_CALLS
            return True
        
        if self.elapsed_seconds >= self.timeout_seconds:
            self._exceeded_reason = BudgetExceededReason.TIMEOUT
            return True
        
        return False
    
    def check_budget(self) -> None:
        """
        Check budget and raise RunBudgetExceeded if exceeded.
        
        This is a convenience method that combines is_exceeded() with
        raising an exception.
        
        Raises:
            RunBudgetExceeded: If budget has been exceeded
        """
        if self.is_exceeded():
            raise RunBudgetExceeded(self.get_summary())
    
    def can_execute_tool(self) -> bool:
        """
        Check if another tool call is allowed within budget.
        
        This should be called BEFORE executing a tool to prevent
        exceeding the limit.
        
        Returns:
            bool: True if another tool call is allowed
        """
        if self._tool_call_count >= self.max_tool_calls:
            self._exceeded_reason = BudgetExceededReason.TOOL_CALLS
            return False
        
        if self.elapsed_seconds >= self.timeout_seconds:
            self._exceeded_reason = BudgetExceededReason.TIMEOUT
            return False
        
        return True
    
    def get_summary(self) -> BudgetSummary:
        """
        Get a summary of the current budget state.
        
        Returns:
            BudgetSummary: Summary of budget usage
        """
        exceeded = self.is_exceeded()
        return BudgetSummary(
            tool_calls_used=self._tool_call_count,
            tool_calls_limit=self.max_tool_calls,
            elapsed_seconds=self.elapsed_seconds,
            timeout_seconds=self.timeout_seconds,
            exceeded=exceeded,
            exceeded_reason=self._exceeded_reason if exceeded else None,
            tools_called=self._tools_called.copy(),
        )
    
    def reset(self) -> None:
        """
        Reset the budget counters.
        
        This creates a fresh budget with the same limits.
        """
        self._tool_call_count = 0
        self._start_time = time.time()
        self._tools_called = []
        self._exceeded_reason = None
    
    def __repr__(self) -> str:
        return (
            f"RunBudget(tool_calls={self._tool_call_count}/{self.max_tool_calls}, "
            f"elapsed={self.elapsed_seconds:.1f}/{self.timeout_seconds}s)"
        )

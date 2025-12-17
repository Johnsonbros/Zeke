"""
Data models for the evaluation harness.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional
from datetime import datetime


class AssertionType(Enum):
    """Types of assertions that can be made on agent outputs."""
    CONTAINS = "contains"
    NOT_CONTAINS = "not_contains"
    TOOL_CALLED = "tool_called"
    TOOL_NOT_CALLED = "tool_not_called"
    NO_PII = "no_pii"
    RESPONSE_TIME_MS = "response_time_ms"
    TOKEN_BUDGET = "token_budget"
    CUSTOM = "custom"


@dataclass
class Assertion:
    """A single assertion to validate agent behavior."""
    type: AssertionType
    expected: Any
    description: Optional[str] = None
    custom_fn: Optional[Callable[[Any], bool]] = None
    
    def __post_init__(self):
        if self.type == AssertionType.CUSTOM and not self.custom_fn:
            raise ValueError("Custom assertions require a custom_fn")


@dataclass
class TestCase:
    """A single test case for agent evaluation."""
    id: str
    name: str
    input_message: str
    assertions: list[Assertion]
    context: dict[str, Any] = field(default_factory=dict)
    tags: list[str] = field(default_factory=list)
    timeout_ms: int = 30000
    

@dataclass
class TestResult:
    """Result of running a single test case."""
    test_case_id: str
    passed: bool
    duration_ms: float
    assertions_passed: int
    assertions_failed: int
    failure_details: list[str] = field(default_factory=list)
    agent_response: Optional[str] = None
    tools_called: list[str] = field(default_factory=list)
    tokens_used: int = 0
    timestamp: datetime = field(default_factory=datetime.now)
    
    @property
    def success_rate(self) -> float:
        """Calculate assertion success rate."""
        total = self.assertions_passed + self.assertions_failed
        return self.assertions_passed / total if total > 0 else 0.0


@dataclass  
class GoldenFlow:
    """A collection of test cases representing a golden flow."""
    id: str
    name: str
    description: str
    test_cases: list[TestCase]
    tags: list[str] = field(default_factory=list)
    slo_p95_ms: Optional[int] = None
    slo_success_rate: float = 0.95
    
    @property
    def total_cases(self) -> int:
        return len(self.test_cases)


@dataclass
class FlowResult:
    """Result of running a complete golden flow."""
    flow_id: str
    flow_name: str
    passed: bool
    total_tests: int
    tests_passed: int
    tests_failed: int
    test_results: list[TestResult]
    p95_latency_ms: float
    avg_latency_ms: float
    total_duration_ms: float
    slo_met: bool
    timestamp: datetime = field(default_factory=datetime.now)
    
    @property
    def success_rate(self) -> float:
        return self.tests_passed / self.total_tests if self.total_tests > 0 else 0.0
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "flow_id": self.flow_id,
            "flow_name": self.flow_name,
            "passed": self.passed,
            "total_tests": self.total_tests,
            "tests_passed": self.tests_passed,
            "tests_failed": self.tests_failed,
            "success_rate": self.success_rate,
            "p95_latency_ms": self.p95_latency_ms,
            "avg_latency_ms": self.avg_latency_ms,
            "total_duration_ms": self.total_duration_ms,
            "slo_met": self.slo_met,
            "timestamp": self.timestamp.isoformat(),
            "test_results": [
                {
                    "test_case_id": r.test_case_id,
                    "passed": r.passed,
                    "duration_ms": r.duration_ms,
                    "assertions_passed": r.assertions_passed,
                    "assertions_failed": r.assertions_failed,
                    "failure_details": r.failure_details,
                }
                for r in self.test_results
            ]
        }

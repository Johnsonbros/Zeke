"""
Evaluation Harness for ZEKE Python Agents

Provides golden flow testing and SLO validation for agent behaviors.
"""

from .models import TestCase, TestResult, GoldenFlow, Assertion
from .runner import EvaluationRunner
from .assertions import (
    assert_contains,
    assert_not_contains,
    assert_tool_called,
    assert_no_pii,
    assert_response_time,
    assert_token_budget,
)

__all__ = [
    "TestCase",
    "TestResult", 
    "GoldenFlow",
    "Assertion",
    "EvaluationRunner",
    "assert_contains",
    "assert_not_contains",
    "assert_tool_called",
    "assert_no_pii",
    "assert_response_time",
    "assert_token_budget",
]

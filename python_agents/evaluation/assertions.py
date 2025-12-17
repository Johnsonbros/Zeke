"""
Assertion helpers for agent evaluation.
"""

import re
from typing import Any, Callable, Optional
from .models import Assertion, AssertionType


def assert_contains(substring: str, description: Optional[str] = None) -> Assertion:
    """Assert that the response contains a substring."""
    return Assertion(
        type=AssertionType.CONTAINS,
        expected=substring,
        description=description or f"Response should contain '{substring}'"
    )


def assert_not_contains(substring: str, description: Optional[str] = None) -> Assertion:
    """Assert that the response does not contain a substring."""
    return Assertion(
        type=AssertionType.NOT_CONTAINS,
        expected=substring,
        description=description or f"Response should not contain '{substring}'"
    )


def assert_tool_called(tool_name: str, description: Optional[str] = None) -> Assertion:
    """Assert that a specific tool was called."""
    return Assertion(
        type=AssertionType.TOOL_CALLED,
        expected=tool_name,
        description=description or f"Tool '{tool_name}' should be called"
    )


def assert_tool_not_called(tool_name: str, description: Optional[str] = None) -> Assertion:
    """Assert that a specific tool was NOT called."""
    return Assertion(
        type=AssertionType.TOOL_NOT_CALLED,
        expected=tool_name,
        description=description or f"Tool '{tool_name}' should not be called"
    )


def assert_no_pii(description: Optional[str] = None) -> Assertion:
    """Assert that the response contains no PII."""
    return Assertion(
        type=AssertionType.NO_PII,
        expected=None,
        description=description or "Response should contain no PII"
    )


def assert_response_time(max_ms: int, description: Optional[str] = None) -> Assertion:
    """Assert that response time is under a threshold."""
    return Assertion(
        type=AssertionType.RESPONSE_TIME_MS,
        expected=max_ms,
        description=description or f"Response time should be under {max_ms}ms"
    )


def assert_token_budget(max_tokens: int, description: Optional[str] = None) -> Assertion:
    """Assert that token usage is within budget."""
    return Assertion(
        type=AssertionType.TOKEN_BUDGET,
        expected=max_tokens,
        description=description or f"Token usage should be under {max_tokens}"
    )


def assert_custom(
    check_fn: Callable[[dict], bool],
    description: str
) -> Assertion:
    """Create a custom assertion with a user-defined check function."""
    return Assertion(
        type=AssertionType.CUSTOM,
        expected=None,
        description=description,
        custom_fn=check_fn
    )


PII_PATTERNS = {
    "ssn": r"\b\d{3}-\d{2}-\d{4}\b",
    "credit_card": r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b",
    "phone": r"\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b",
    "email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
}


def check_no_pii(text: str) -> tuple[bool, list[str]]:
    """
    Check if text contains PII.
    
    Returns:
        Tuple of (is_clean, list of found PII types)
    """
    found_pii = []
    for pii_type, pattern in PII_PATTERNS.items():
        if re.search(pattern, text, re.IGNORECASE):
            found_pii.append(pii_type)
    return len(found_pii) == 0, found_pii


def evaluate_assertion(
    assertion: Assertion,
    response: str,
    tools_called: list[str],
    duration_ms: float,
    tokens_used: int
) -> tuple[bool, str]:
    """
    Evaluate a single assertion against agent output.
    
    Returns:
        Tuple of (passed, failure_message)
    """
    match assertion.type:
        case AssertionType.CONTAINS:
            passed = assertion.expected.lower() in response.lower()
            return passed, f"Expected '{assertion.expected}' not found in response"
            
        case AssertionType.NOT_CONTAINS:
            passed = assertion.expected.lower() not in response.lower()
            return passed, f"Unexpected '{assertion.expected}' found in response"
            
        case AssertionType.TOOL_CALLED:
            passed = assertion.expected in tools_called
            return passed, f"Tool '{assertion.expected}' was not called. Called: {tools_called}"
            
        case AssertionType.TOOL_NOT_CALLED:
            passed = assertion.expected not in tools_called
            return passed, f"Tool '{assertion.expected}' was unexpectedly called"
            
        case AssertionType.NO_PII:
            is_clean, found = check_no_pii(response)
            return is_clean, f"PII detected in response: {found}"
            
        case AssertionType.RESPONSE_TIME_MS:
            passed = duration_ms <= assertion.expected
            return passed, f"Response took {duration_ms:.0f}ms, expected <= {assertion.expected}ms"
            
        case AssertionType.TOKEN_BUDGET:
            passed = tokens_used <= assertion.expected
            return passed, f"Used {tokens_used} tokens, expected <= {assertion.expected}"
            
        case AssertionType.CUSTOM:
            if assertion.custom_fn is None:
                return False, "Custom assertion has no custom_fn defined"
            try:
                result = assertion.custom_fn({
                    "response": response,
                    "tools_called": tools_called,
                    "duration_ms": duration_ms,
                    "tokens_used": tokens_used
                })
                return result, f"Custom assertion failed: {assertion.description}"
            except Exception as e:
                return False, f"Custom assertion error: {e}"
            
        case _:
            return False, f"Unknown assertion type: {assertion.type}"

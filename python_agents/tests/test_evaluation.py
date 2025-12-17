"""Tests for the evaluation harness."""

import pytest
import asyncio
from pathlib import Path
from datetime import datetime

from python_agents.evaluation.models import (
    TestCase, TestResult, GoldenFlow, FlowResult,
    Assertion, AssertionType
)
from python_agents.evaluation.assertions import (
    assert_contains,
    assert_not_contains,
    assert_tool_called,
    assert_no_pii,
    assert_response_time,
    assert_token_budget,
    evaluate_assertion,
    check_no_pii,
)
from python_agents.evaluation.runner import EvaluationRunner
from python_agents.evaluation.golden_flows import (
    get_all_golden_flows,
    get_critical_flows,
    get_flows_by_tag,
)


class TestAssertionHelpers:
    """Tests for assertion helper functions."""
    
    def test_assert_contains(self):
        assertion = assert_contains("hello")
        assert assertion.type == AssertionType.CONTAINS
        assert assertion.expected == "hello"
        
    def test_assert_not_contains(self):
        assertion = assert_not_contains("secret")
        assert assertion.type == AssertionType.NOT_CONTAINS
        assert assertion.expected == "secret"
        
    def test_assert_tool_called(self):
        assertion = assert_tool_called("search")
        assert assertion.type == AssertionType.TOOL_CALLED
        assert assertion.expected == "search"
        
    def test_assert_no_pii(self):
        assertion = assert_no_pii()
        assert assertion.type == AssertionType.NO_PII
        
    def test_assert_response_time(self):
        assertion = assert_response_time(5000)
        assert assertion.type == AssertionType.RESPONSE_TIME_MS
        assert assertion.expected == 5000
        
    def test_assert_token_budget(self):
        assertion = assert_token_budget(1000)
        assert assertion.type == AssertionType.TOKEN_BUDGET
        assert assertion.expected == 1000


class TestPIICheck:
    """Tests for PII detection."""
    
    def test_clean_text(self):
        is_clean, found = check_no_pii("Hello, how are you today?")
        assert is_clean is True
        assert found == []
        
    def test_detect_ssn(self):
        is_clean, found = check_no_pii("My SSN is 123-45-6789")
        assert is_clean is False
        assert "ssn" in found
        
    def test_detect_credit_card(self):
        is_clean, found = check_no_pii("Card: 4111-1111-1111-1111")
        assert is_clean is False
        assert "credit_card" in found
        
    def test_detect_phone(self):
        is_clean, found = check_no_pii("Call me at 555-123-4567")
        assert is_clean is False
        assert "phone" in found
        
    def test_detect_email(self):
        is_clean, found = check_no_pii("Email: test@example.com")
        assert is_clean is False
        assert "email" in found
        
    def test_detect_multiple_pii(self):
        text = "SSN: 123-45-6789, Phone: 555-123-4567"
        is_clean, found = check_no_pii(text)
        assert is_clean is False
        assert len(found) == 2


class TestEvaluateAssertion:
    """Tests for assertion evaluation."""
    
    def test_contains_pass(self):
        assertion = assert_contains("hello")
        passed, _ = evaluate_assertion(
            assertion, "Hello world!", [], 100, 50
        )
        assert passed is True
        
    def test_contains_fail(self):
        assertion = assert_contains("goodbye")
        passed, msg = evaluate_assertion(
            assertion, "Hello world!", [], 100, 50
        )
        assert passed is False
        assert "not found" in msg
        
    def test_not_contains_pass(self):
        assertion = assert_not_contains("secret")
        passed, _ = evaluate_assertion(
            assertion, "Hello world!", [], 100, 50
        )
        assert passed is True
        
    def test_not_contains_fail(self):
        assertion = assert_not_contains("hello")
        passed, msg = evaluate_assertion(
            assertion, "Hello world!", [], 100, 50
        )
        assert passed is False
        assert "found" in msg
        
    def test_tool_called_pass(self):
        assertion = assert_tool_called("search")
        passed, _ = evaluate_assertion(
            assertion, "Results", ["search", "memory"], 100, 50
        )
        assert passed is True
        
    def test_tool_called_fail(self):
        assertion = assert_tool_called("calendar")
        passed, msg = evaluate_assertion(
            assertion, "Results", ["search", "memory"], 100, 50
        )
        assert passed is False
        assert "not called" in msg
        
    def test_no_pii_pass(self):
        assertion = assert_no_pii()
        passed, _ = evaluate_assertion(
            assertion, "Clean text here", [], 100, 50
        )
        assert passed is True
        
    def test_no_pii_fail(self):
        assertion = assert_no_pii()
        passed, msg = evaluate_assertion(
            assertion, "SSN: 123-45-6789", [], 100, 50
        )
        assert passed is False
        assert "PII detected" in msg
        
    def test_response_time_pass(self):
        assertion = assert_response_time(5000)
        passed, _ = evaluate_assertion(
            assertion, "Response", [], 3000, 50
        )
        assert passed is True
        
    def test_response_time_fail(self):
        assertion = assert_response_time(1000)
        passed, msg = evaluate_assertion(
            assertion, "Response", [], 2000, 50
        )
        assert passed is False
        assert "2000ms" in msg
        
    def test_token_budget_pass(self):
        assertion = assert_token_budget(1000)
        passed, _ = evaluate_assertion(
            assertion, "Response", [], 100, 500
        )
        assert passed is True
        
    def test_token_budget_fail(self):
        assertion = assert_token_budget(500)
        passed, msg = evaluate_assertion(
            assertion, "Response", [], 100, 1000
        )
        assert passed is False
        assert "1000 tokens" in msg


class TestModels:
    """Tests for data models."""
    
    def test_test_case_creation(self):
        tc = TestCase(
            id="test-1",
            name="Test One",
            input_message="Hello",
            assertions=[assert_contains("hello")]
        )
        assert tc.id == "test-1"
        assert tc.timeout_ms == 30000
        
    def test_test_result_success_rate(self):
        result = TestResult(
            test_case_id="test-1",
            passed=True,
            duration_ms=100,
            assertions_passed=3,
            assertions_failed=1
        )
        assert result.success_rate == 0.75
        
    def test_golden_flow_total_cases(self):
        flow = GoldenFlow(
            id="flow-1",
            name="Test Flow",
            description="A test flow",
            test_cases=[
                TestCase(id="1", name="T1", input_message="Hi", assertions=[]),
                TestCase(id="2", name="T2", input_message="Hello", assertions=[]),
            ]
        )
        assert flow.total_cases == 2
        
    def test_flow_result_success_rate(self):
        result = FlowResult(
            flow_id="flow-1",
            flow_name="Test",
            passed=False,
            total_tests=10,
            tests_passed=8,
            tests_failed=2,
            test_results=[],
            p95_latency_ms=500,
            avg_latency_ms=300,
            total_duration_ms=5000,
            slo_met=True
        )
        assert result.success_rate == 0.8
        
    def test_flow_result_to_dict(self):
        result = FlowResult(
            flow_id="flow-1",
            flow_name="Test",
            passed=True,
            total_tests=5,
            tests_passed=5,
            tests_failed=0,
            test_results=[],
            p95_latency_ms=400,
            avg_latency_ms=200,
            total_duration_ms=2000,
            slo_met=True
        )
        d = result.to_dict()
        assert d["flow_id"] == "flow-1"
        assert d["passed"] is True
        assert d["success_rate"] == 1.0


class TestGoldenFlows:
    """Tests for golden flow definitions."""
    
    def test_get_all_flows(self):
        flows = get_all_golden_flows()
        assert len(flows) >= 5
        
    def test_get_critical_flows(self):
        flows = get_critical_flows()
        assert len(flows) >= 1
        for flow in flows:
            assert "critical" in flow.tags
            
    def test_get_flows_by_tag(self):
        flows = get_flows_by_tag("core")
        assert len(flows) >= 1
        for flow in flows:
            assert "core" in flow.tags


class TestEvaluationRunner:
    """Tests for the evaluation runner."""
    
    @pytest.mark.asyncio
    async def test_run_test_case_mock(self):
        runner = EvaluationRunner()
        
        test_case = TestCase(
            id="test-1",
            name="Mock Test",
            input_message="Hello",
            assertions=[
                assert_response_time(60000),
            ]
        )
        
        result = await runner.run_test_case(test_case)
        assert result.test_case_id == "test-1"
        assert result.duration_ms > 0
        
    @pytest.mark.asyncio
    async def test_run_flow_mock(self):
        runner = EvaluationRunner()
        
        flow = GoldenFlow(
            id="test-flow",
            name="Test Flow",
            description="A test flow",
            test_cases=[
                TestCase(
                    id="t1",
                    name="Test 1",
                    input_message="Hi",
                    assertions=[assert_response_time(60000)]
                ),
                TestCase(
                    id="t2",
                    name="Test 2",
                    input_message="Hello",
                    assertions=[assert_response_time(60000)]
                ),
            ],
            slo_success_rate=0.5
        )
        
        result = await runner.run_flow(flow)
        assert result.flow_id == "test-flow"
        assert result.total_tests == 2
        assert result.p95_latency_ms >= 0
        assert result.avg_latency_ms >= 0
        
    @pytest.mark.asyncio
    async def test_custom_agent_callable(self):
        async def mock_agent(message: str, context: dict):
            return {
                "response": f"Mock response to: {message}",
                "tools_called": ["mock_tool"],
                "tokens_used": 100
            }
        
        runner = EvaluationRunner(agent_callable=mock_agent)
        
        test_case = TestCase(
            id="test-1",
            name="Custom Agent Test",
            input_message="Hello",
            assertions=[
                assert_contains("mock response"),
                assert_tool_called("mock_tool"),
            ]
        )
        
        result = await runner.run_test_case(test_case)
        assert result.passed is True
        assert result.tools_called == ["mock_tool"]
        assert result.tokens_used == 100

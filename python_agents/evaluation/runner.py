"""
Evaluation runner for executing golden flow tests.
"""

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Any, Callable, Optional
from datetime import datetime

from .models import TestCase, TestResult, GoldenFlow, FlowResult
from .assertions import evaluate_assertion

logger = logging.getLogger(__name__)


class EvaluationRunner:
    """
    Runs evaluation test cases against the agent system.
    """
    
    def __init__(
        self,
        agent_callable: Optional[Callable] = None,
        output_dir: Optional[Path] = None,
        parallel: bool = False,
        max_concurrent: int = 3
    ):
        """
        Initialize the evaluation runner.
        
        Args:
            agent_callable: Async function that takes (message, context) and returns agent response
            output_dir: Directory to write results to
            parallel: Whether to run tests in parallel
            max_concurrent: Max concurrent tests when running in parallel
        """
        self.agent_callable = agent_callable
        self.output_dir = output_dir or Path("evaluation_results")
        self.parallel = parallel
        self.max_concurrent = max_concurrent
        self._semaphore = asyncio.Semaphore(max_concurrent) if parallel else None
        
    async def run_test_case(self, test_case: TestCase) -> TestResult:
        """Run a single test case and return results."""
        start_time = time.time()
        tools_called: list[str] = []
        tokens_used = 0
        agent_response = ""
        failure_details: list[str] = []
        assertions_passed = 0
        assertions_failed = 0
        
        try:
            if self.agent_callable:
                result = await asyncio.wait_for(
                    self.agent_callable(test_case.input_message, test_case.context),
                    timeout=test_case.timeout_ms / 1000
                )
                
                if isinstance(result, dict):
                    agent_response = result.get("response", str(result))
                    tools_called = result.get("tools_called", [])
                    tokens_used = result.get("tokens_used", 0)
                else:
                    agent_response = str(result)
            else:
                agent_response = f"[MOCK] Response to: {test_case.input_message}"
                tools_called = ["mock_tool"]
                tokens_used = 100
                
        except asyncio.TimeoutError:
            failure_details.append(f"Test timed out after {test_case.timeout_ms}ms")
            assertions_failed = len(test_case.assertions)
            duration_ms = test_case.timeout_ms
            
            return TestResult(
                test_case_id=test_case.id,
                passed=False,
                duration_ms=duration_ms,
                assertions_passed=0,
                assertions_failed=assertions_failed,
                failure_details=failure_details,
                agent_response=None,
                tools_called=[],
                tokens_used=0
            )
            
        except Exception as e:
            logger.error(f"Test case {test_case.id} failed with error: {e}")
            failure_details.append(f"Execution error: {str(e)}")
            
        duration_ms = (time.time() - start_time) * 1000
        
        for assertion in test_case.assertions:
            passed, failure_msg = evaluate_assertion(
                assertion,
                agent_response,
                tools_called,
                duration_ms,
                tokens_used
            )
            if passed:
                assertions_passed += 1
            else:
                assertions_failed += 1
                failure_details.append(f"{assertion.description}: {failure_msg}")
                
        return TestResult(
            test_case_id=test_case.id,
            passed=assertions_failed == 0,
            duration_ms=duration_ms,
            assertions_passed=assertions_passed,
            assertions_failed=assertions_failed,
            failure_details=failure_details,
            agent_response=agent_response,
            tools_called=tools_called,
            tokens_used=tokens_used
        )
        
    async def _run_with_semaphore(self, test_case: TestCase) -> TestResult:
        """Run test case with semaphore for parallel execution."""
        assert self._semaphore is not None
        async with self._semaphore:
            return await self.run_test_case(test_case)
    
    async def run_flow(self, flow: GoldenFlow) -> FlowResult:
        """Run all test cases in a golden flow."""
        logger.info(f"Running golden flow: {flow.name} ({flow.total_cases} tests)")
        start_time = time.time()
        
        if self.parallel and self._semaphore:
            tasks = [self._run_with_semaphore(tc) for tc in flow.test_cases]
            results = await asyncio.gather(*tasks)
        else:
            results = []
            for test_case in flow.test_cases:
                result = await self.run_test_case(test_case)
                results.append(result)
                
        total_duration_ms = (time.time() - start_time) * 1000
        
        tests_passed = sum(1 for r in results if r.passed)
        tests_failed = len(results) - tests_passed
        
        latencies = sorted([r.duration_ms for r in results])
        avg_latency = sum(latencies) / len(latencies) if latencies else 0
        p95_idx = int(len(latencies) * 0.95)
        p95_latency = latencies[p95_idx] if latencies else 0
        
        success_rate = tests_passed / len(results) if results else 0
        slo_met = success_rate >= flow.slo_success_rate
        if flow.slo_p95_ms:
            slo_met = slo_met and p95_latency <= flow.slo_p95_ms
            
        flow_result = FlowResult(
            flow_id=flow.id,
            flow_name=flow.name,
            passed=tests_failed == 0,
            total_tests=len(results),
            tests_passed=tests_passed,
            tests_failed=tests_failed,
            test_results=results,
            p95_latency_ms=p95_latency,
            avg_latency_ms=avg_latency,
            total_duration_ms=total_duration_ms,
            slo_met=slo_met
        )
        
        logger.info(
            f"Flow {flow.name} complete: {tests_passed}/{len(results)} passed, "
            f"p95={p95_latency:.0f}ms, SLO={'MET' if slo_met else 'MISSED'}"
        )
        
        return flow_result
    
    async def run_flows(self, flows: list[GoldenFlow]) -> list[FlowResult]:
        """Run multiple golden flows."""
        results = []
        for flow in flows:
            result = await self.run_flow(flow)
            results.append(result)
        return results
    
    def save_results(self, results: list[FlowResult], filename: Optional[str] = None) -> Path:
        """Save flow results to JSON file."""
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"eval_results_{timestamp}.json"
            
        filepath = self.output_dir / filename
        
        output = {
            "timestamp": datetime.now().isoformat(),
            "total_flows": len(results),
            "flows_passed": sum(1 for r in results if r.passed),
            "all_slos_met": all(r.slo_met for r in results),
            "results": [r.to_dict() for r in results]
        }
        
        with open(filepath, "w") as f:
            json.dump(output, f, indent=2)
            
        logger.info(f"Results saved to {filepath}")
        return filepath


def load_golden_flows_from_json(filepath: Path) -> list[GoldenFlow]:
    """Load golden flows from a JSON file."""
    from .models import Assertion, AssertionType
    
    with open(filepath) as f:
        data = json.load(f)
        
    flows = []
    for flow_data in data.get("flows", []):
        test_cases = []
        for tc_data in flow_data.get("test_cases", []):
            assertions = []
            for a_data in tc_data.get("assertions", []):
                assertions.append(Assertion(
                    type=AssertionType(a_data["type"]),
                    expected=a_data.get("expected"),
                    description=a_data.get("description")
                ))
            test_cases.append(TestCase(
                id=tc_data["id"],
                name=tc_data["name"],
                input_message=tc_data["input_message"],
                assertions=assertions,
                context=tc_data.get("context", {}),
                tags=tc_data.get("tags", []),
                timeout_ms=tc_data.get("timeout_ms", 30000)
            ))
        flows.append(GoldenFlow(
            id=flow_data["id"],
            name=flow_data["name"],
            description=flow_data.get("description", ""),
            test_cases=test_cases,
            tags=flow_data.get("tags", []),
            slo_p95_ms=flow_data.get("slo_p95_ms"),
            slo_success_rate=flow_data.get("slo_success_rate", 0.95)
        ))
    return flows

#!/usr/bin/env python3
"""
SLO Gate Script for CI/CD Integration

This script runs golden flow evaluations and fails if SLOs are not met.
Exit codes:
  0 - All SLOs met, deployment can proceed
  1 - SLO violations detected, deployment should be blocked
  2 - Script error (configuration, network, etc.)
"""

import argparse
import asyncio
import json
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

from .runner import EvaluationRunner
from .golden_flows import get_all_golden_flows, get_critical_flows, get_flows_by_tag
from .models import FlowResult

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)


def print_summary(results: list[FlowResult]) -> None:
    """Print a summary of flow results."""
    print("\n" + "=" * 60)
    print("EVALUATION SUMMARY")
    print("=" * 60)
    
    total_tests = sum(r.total_tests for r in results)
    tests_passed = sum(r.tests_passed for r in results)
    tests_failed = sum(r.tests_failed for r in results)
    flows_passed = sum(1 for r in results if r.passed)
    slos_met = sum(1 for r in results if r.slo_met)
    
    print(f"\nFlows: {flows_passed}/{len(results)} passed")
    print(f"Tests: {tests_passed}/{total_tests} passed ({tests_failed} failed)")
    print(f"SLOs:  {slos_met}/{len(results)} met")
    
    print("\n" + "-" * 60)
    print(f"{'Flow Name':<30} {'Tests':<12} {'P95 (ms)':<12} {'SLO':<10}")
    print("-" * 60)
    
    for r in results:
        status = "PASS" if r.slo_met else "FAIL"
        print(f"{r.flow_name:<30} {r.tests_passed}/{r.total_tests:<10} {r.p95_latency_ms:<12.0f} {status:<10}")
    
    print("-" * 60)
    
    all_passed = all(r.slo_met for r in results)
    if all_passed:
        print("\n[OK] All SLOs met - deployment can proceed")
    else:
        print("\n[FAIL] SLO violations detected - deployment blocked")
        print("\nFailed flows:")
        for r in results:
            if not r.slo_met:
                print(f"  - {r.flow_name}")
                for tr in r.test_results:
                    if not tr.passed:
                        for detail in tr.failure_details:
                            print(f"      {detail}")
    
    print("=" * 60 + "\n")


async def run_evaluation(
    tags: Optional[list[str]] = None,
    critical_only: bool = False,
    output_file: Optional[Path] = None,
    parallel: bool = False,
    agent_callable: Optional[Callable] = None
) -> tuple[bool, list[FlowResult]]:
    """
    Run evaluation and return results.
    
    Returns:
        Tuple of (all_slos_met, results)
    """
    if critical_only:
        flows = get_critical_flows()
        logger.info(f"Running {len(flows)} critical flows")
    elif tags:
        flows = []
        for tag in tags:
            flows.extend(get_flows_by_tag(tag))
        flows = list({f.id: f for f in flows}.values())
        logger.info(f"Running {len(flows)} flows matching tags: {tags}")
    else:
        flows = get_all_golden_flows()
        logger.info(f"Running all {len(flows)} golden flows")
    
    if not flows:
        logger.warning("No flows to run!")
        return True, []
    
    runner = EvaluationRunner(
        agent_callable=agent_callable,
        output_dir=Path("evaluation_results"),
        parallel=parallel
    )
    
    results = await runner.run_flows(flows)
    
    if output_file:
        runner.save_results(results, output_file.name)
    
    all_slos_met = all(r.slo_met for r in results)
    return all_slos_met, results


def main() -> int:
    """Main entry point for CLI."""
    parser = argparse.ArgumentParser(
        description="Run golden flow evaluations and check SLOs"
    )
    parser.add_argument(
        "--tags",
        nargs="+",
        help="Run only flows with these tags"
    )
    parser.add_argument(
        "--critical-only",
        action="store_true",
        help="Run only critical flows"
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Output file for results JSON"
    )
    parser.add_argument(
        "--parallel",
        action="store_true",
        help="Run tests in parallel"
    )
    parser.add_argument(
        "--json-output",
        action="store_true",
        help="Output results as JSON only (for CI parsing)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List flows without running them"
    )
    
    args = parser.parse_args()
    
    try:
        if args.dry_run:
            if args.critical_only:
                flows = get_critical_flows()
            elif args.tags:
                flows = []
                for tag in args.tags:
                    flows.extend(get_flows_by_tag(tag))
                flows = list({f.id: f for f in flows}.values())
            else:
                flows = get_all_golden_flows()
            
            print(f"Would run {len(flows)} flows:")
            for flow in flows:
                print(f"  - {flow.name} ({flow.total_cases} tests)")
            return 0
        
        all_slos_met, results = asyncio.run(run_evaluation(
            tags=args.tags,
            critical_only=args.critical_only,
            output_file=args.output,
            parallel=args.parallel
        ))
        
        if args.json_output:
            output = {
                "timestamp": datetime.now().isoformat(),
                "all_slos_met": all_slos_met,
                "results": [r.to_dict() for r in results]
            }
            print(json.dumps(output, indent=2))
        else:
            print_summary(results)
        
        return 0 if all_slos_met else 1
        
    except KeyboardInterrupt:
        logger.info("Evaluation cancelled")
        return 2
    except Exception as e:
        logger.error(f"Evaluation failed: {e}")
        return 2


if __name__ == "__main__":
    sys.exit(main())

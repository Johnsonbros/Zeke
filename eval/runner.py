#!/usr/bin/env python3
"""
Eval runner CLI.

Usage:
    python eval/runner.py                   # Run all evals
    python eval/runner.py --test router     # Run specific test
    python eval/runner.py --ci              # CI mode (fail on errors)
"""

import argparse
import json
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from eval.openai_evals import OpenAIEvalsError, upload_eval_results

EVAL_DIR = Path(__file__).parent
RUNS_DIR = EVAL_DIR / "runs"


def run_evals(
    test_filter: str = None,
    max_fail: int = None,
    verbose: bool = False,
    ci_mode: bool = False,
) -> dict:
    """
    Run evaluations and return results.
    
    Args:
        test_filter: Optional filter for specific tests
        max_fail: Stop after N failures
        verbose: Enable verbose output
        ci_mode: Enable CI mode (strict)
        
    Returns:
        dict with run summary
    """
    cmd = ["python", "-m", "pytest", str(EVAL_DIR / "tests")]
    
    if test_filter:
        cmd.extend(["-k", test_filter])
    
    if max_fail:
        cmd.extend(["--maxfail", str(max_fail)])
    
    if verbose:
        cmd.append("-v")
    else:
        cmd.append("-q")
    
    cmd.append("--disable-warnings")
    cmd.extend(["--tb", "short"])
    
    timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=str(Path(__file__).parent.parent),
    )
    
    summary = {
        "timestamp": timestamp,
        "returncode": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "passed": result.returncode == 0,
    }

    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    run_file = RUNS_DIR / f"{timestamp}.json"
    summary["run_file"] = str(run_file)
    with open(run_file, 'w') as f:
        json.dump(summary, f, indent=2)
    
    print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)
    
    print(f"\nRun saved to: {run_file}")
    
    return summary


def get_last_run() -> dict:
    """Get the most recent run summary."""
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    
    runs = sorted(RUNS_DIR.glob("*.json"), reverse=True)
    if not runs:
        return {"error": "No runs found"}
    
    with open(runs[0]) as f:
        return json.load(f)


def generate_tasks_md(run_data: dict) -> str:
    """
    Generate TASKS.md content from failed tests.
    
    Args:
        run_data: The run data dictionary
        
    Returns:
        Markdown content for TASKS.md
    """
    lines = ["# Failed Test Tasks\n"]
    lines.append(f"Generated from run: {run_data.get('timestamp', 'unknown')}\n")
    
    if run_data.get("passed"):
        lines.append("All tests passed! No tasks to generate.\n")
        return "\n".join(lines)
    
    stdout = run_data.get("stdout", "")
    
    failed_tests = []
    for line in stdout.split('\n'):
        if 'FAILED' in line:
            failed_tests.append(line.strip())
    
    if not failed_tests:
        lines.append("No specific failures to report.\n")
    else:
        lines.append("## Failed Tests\n")
        for i, test in enumerate(failed_tests, 1):
            lines.append(f"### Task {i}")
            lines.append(f"- **Test**: `{test}`")
            lines.append("- **Status**: Needs investigation")
            lines.append("- **Suggested fix area**: Check test golden data or model prompt\n")
    
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Run ZEKE evaluations")
    parser.add_argument("--test", "-t", help="Filter to specific test")
    parser.add_argument("--maxfail", "-x", type=int, help="Stop after N failures")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument("--ci", action="store_true", help="CI mode (exit non-zero on failure)")
    parser.add_argument(
        "--openai-evals",
        action="store_true",
        help="Upload results to OpenAI Evals after pytest completes",
    )
    parser.add_argument("--last", action="store_true", help="Show last run summary")
    parser.add_argument("--tasks", action="store_true", help="Generate TASKS.md from last run")
    
    args = parser.parse_args()
    
    if args.last:
        run = get_last_run()
        print(json.dumps(run, indent=2))
        return
    
    if args.tasks:
        run = get_last_run()
        tasks_md = generate_tasks_md(run)
        print(tasks_md)
        
        tasks_file = EVAL_DIR / "TASKS.md"
        with open(tasks_file, 'w') as f:
            f.write(tasks_md)
        print(f"\nSaved to: {tasks_file}")
        return
    
    summary = run_evals(
        test_filter=args.test,
        max_fail=args.maxfail,
        verbose=args.verbose,
        ci_mode=args.ci,
    )

    if args.openai_evals:
        run_file = Path(summary["run_file"])
        try:
            upload_result = upload_eval_results(
                summary,
                run_file,
                test_filter=args.test,
                ci_mode=args.ci,
            )
            summary["openai_eval"] = upload_result.__dict__
            print(f"Uploaded to OpenAI Evals: {upload_result.report_url}")
        except OpenAIEvalsError as exc:
            print(f"Failed to upload to OpenAI Evals: {exc}", file=sys.stderr)
        except Exception as exc:  # pragma: no cover - defensive
            print(f"Unexpected error posting to OpenAI Evals: {exc}", file=sys.stderr)

    eval_regressed = False
    if summary.get("openai_eval"):
        counts = summary["openai_eval"].get("result_counts", {})
        eval_regressed = counts.get("failed", 0) > 0 or counts.get("errored", 0) > 0
        if eval_regressed:
            print("OpenAI Evals detected regressions.", file=sys.stderr)

    if args.ci and (not summary["passed"] or eval_regressed):
        sys.exit(1)


if __name__ == "__main__":
    main()

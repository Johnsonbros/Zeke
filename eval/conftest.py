"""
Pytest fixtures and configuration for ZEKE evals.
"""

import json
import os
import pytest
from pathlib import Path
from datetime import datetime
from typing import Any


EVAL_DIR = Path(__file__).parent
GOLDEN_DIR = EVAL_DIR / "golden"
RUNS_DIR = EVAL_DIR / "runs"


@pytest.fixture(autouse=True)
def require_openai_api_key():
    """Skip eval tests when OpenAI credentials are not available."""

    if not os.environ.get("OPENAI_API_KEY"):
        pytest.skip(
            "OPENAI_API_KEY not set; skipping eval tests that require OpenAI access",
            allow_module_level=True,
        )


@pytest.fixture
def load_golden():
    """
    Fixture to load golden test data from JSONL files.
    
    Usage:
        def test_something(load_golden):
            cases = load_golden("summarize_simple.jsonl")
            for case in cases:
                # test with case
    """
    def _load(filename: str) -> list[dict]:
        filepath = GOLDEN_DIR / filename
        if not filepath.exists():
            pytest.skip(f"Golden file not found: {filename}")
        
        cases = []
        with open(filepath, 'r') as f:
            for line in f:
                line = line.strip()
                if line:
                    cases.append(json.loads(line))
        return cases
    
    return _load


@pytest.fixture
def eval_context():
    """
    Fixture providing evaluation context (model, commit, timestamp).
    """
    return {
        "model": os.environ.get("EVAL_MODEL", "gpt-4o-mini"),
        "commit_sha": os.environ.get("GITHUB_SHA", "local"),
        "timestamp": datetime.utcnow().isoformat(),
        "run_id": datetime.utcnow().strftime("%Y%m%d_%H%M%S"),
    }


class EvalLogger:
    """Logger for tracking eval results."""
    
    def __init__(self, run_id: str):
        self.run_id = run_id
        self.results: list[dict] = []
        self.passed = 0
        self.failed = 0
        
    def log_result(
        self,
        test_id: str,
        passed: bool,
        expected: Any = None,
        actual: Any = None,
        error: str = None,
        metadata: dict = None,
    ):
        result = {
            "test_id": test_id,
            "passed": passed,
            "expected": expected,
            "actual": actual,
            "error": error,
            "metadata": metadata or {},
        }
        self.results.append(result)
        if passed:
            self.passed += 1
        else:
            self.failed += 1
    
    def save(self, context: dict):
        """Save results to runs directory."""
        RUNS_DIR.mkdir(parents=True, exist_ok=True)
        
        run_data = {
            **context,
            "summary": {
                "total": len(self.results),
                "passed": self.passed,
                "failed": self.failed,
            },
            "results": self.results,
        }
        
        filepath = RUNS_DIR / f"{self.run_id}.json"
        with open(filepath, 'w') as f:
            json.dump(run_data, f, indent=2)
        
        return filepath


@pytest.fixture
def eval_logger(eval_context):
    """Fixture providing an eval logger instance."""
    return EvalLogger(eval_context["run_id"])


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line(
        "markers", "issue(key): Link test to a specific issue/task ID"
    )
    config.addinivalue_line(
        "markers", "flaky: Mark test as flaky (non-deterministic)"
    )
    config.addinivalue_line(
        "markers", "slow: Mark test as slow-running"
    )

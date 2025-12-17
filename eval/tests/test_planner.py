"""
Planner capability tests.

Tests ZEKE's ability to create plans and sequences of actions.
"""

import pytest
from eval.util import call_model, check_must_include, check_must_not_include


@pytest.mark.issue("ZEKE-PLANNER")
class TestPlanner:
    """Test suite for planning capabilities."""
    
    def test_meeting_planning(self, load_golden):
        """Test planning a team meeting."""
        cases = load_golden("planner_scenarios.jsonl")
        case = cases[0]
        
        output = call_model(prompt=case["prompt"])
        
        passed, missing = check_must_include(output, case["must_include"])
        assert passed, f"Missing required content: {missing}"
        
        passed, found = check_must_not_include(output, case["must_not_include"])
        assert passed, f"Found forbidden content: {found}"
    
    def test_email_reminder_steps(self, load_golden):
        """Test planning steps for an email reminder."""
        cases = load_golden("planner_scenarios.jsonl")
        case = cases[1]
        
        output = call_model(prompt=case["prompt"])
        
        passed, missing = check_must_include(output, case["must_include"])
        assert passed, f"Missing required content: {missing}"
    
    def test_action_sequence(self, load_golden):
        """Test planning a sequence of actions."""
        cases = load_golden("planner_scenarios.jsonl")
        case = cases[2]
        
        output = call_model(prompt=case["prompt"])
        
        passed, missing = check_must_include(output, case["must_include"])
        assert passed, f"Missing required content: {missing}"


@pytest.mark.issue("ZEKE-PLANNER")
@pytest.mark.parametrize("case_id", ["plan-001", "plan-002", "plan-003"])
def test_planner_parametrized(load_golden, case_id):
    """Parametrized test for all planner cases."""
    cases = load_golden("planner_scenarios.jsonl")
    case = next((c for c in cases if c["id"] == case_id), None)
    
    if case is None:
        pytest.skip(f"Case {case_id} not found")
    
    output = call_model(prompt=case["prompt"])
    
    passed, missing = check_must_include(output, case["must_include"])
    assert passed, f"[{case_id}] Missing: {missing}"
    
    passed, found = check_must_not_include(output, case["must_not_include"])
    assert passed, f"[{case_id}] Forbidden: {found}"

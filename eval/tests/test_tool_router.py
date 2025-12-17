"""
Tool router tests.

Tests ZEKE's intent classification and routing accuracy.
"""

import pytest
import json
import sys
from pathlib import Path


_classify_intent_fast = None

def get_classify_intent_fast():
    """Lazy import to avoid circular import issues."""
    global _classify_intent_fast
    if _classify_intent_fast is None:
        project_root = str(Path(__file__).parent.parent.parent)
        if project_root not in sys.path:
            sys.path.insert(0, project_root)
        from python_agents.intent_router import classify_intent_fast
        _classify_intent_fast = classify_intent_fast
    return _classify_intent_fast


@pytest.mark.issue("ZEKE-ROUTER")
class TestToolRouter:
    """Test suite for intent routing."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test."""
        self.classify = get_classify_intent_fast()
    
    def test_communication_intent(self, load_golden):
        """Test routing communication intents."""
        cases = load_golden("router_matrix.jsonl")
        case = next(c for c in cases if c["id"] == "route-001")
        
        result = self.classify(case["input"])
        
        assert result.category.value == case["expected_category"], \
            f"Expected category {case['expected_category']}, got {result.category.value}"
    
    def test_scheduling_intent(self, load_golden):
        """Test routing scheduling intents."""
        cases = load_golden("router_matrix.jsonl")
        case = next(c for c in cases if c["id"] == "route-002")
        
        result = self.classify(case["input"])
        
        assert result.category.value == case["expected_category"], \
            f"Expected category {case['expected_category']}, got {result.category.value}"
    
    def test_grocery_intent(self, load_golden):
        """Test routing grocery intents."""
        cases = load_golden("router_matrix.jsonl")
        case = next(c for c in cases if c["id"] == "route-003")
        
        result = self.classify(case["input"])
        
        assert result.category.value == case["expected_category"], \
            f"Expected category {case['expected_category']}, got {result.category.value}"


@pytest.mark.issue("ZEKE-ROUTER")
@pytest.mark.parametrize("case_id", [
    "route-001", "route-002", "route-003", "route-004",
    "route-005", "route-006", "route-007", "route-008"
])
def test_router_matrix(load_golden, case_id):
    """Parametrized test for all router cases."""
    classify = get_classify_intent_fast()
    
    cases = load_golden("router_matrix.jsonl")
    case = next((c for c in cases if c["id"] == case_id), None)
    
    if case is None:
        pytest.skip(f"Case {case_id} not found")
    
    result = classify(case["input"])
    
    assert result.category.value == case["expected_category"], \
        f"[{case_id}] Expected category '{case['expected_category']}', got '{result.category.value}'"


@pytest.mark.issue("ZEKE-ROUTER")
def test_router_confidence_threshold(load_golden):
    """Test that high-confidence classifications don't need LLM fallback."""
    classify = get_classify_intent_fast()
    cases = load_golden("router_matrix.jsonl")
    
    high_confidence_count = 0
    for case in cases:
        result = classify(case["input"])
        if result.confidence >= 0.8 and not result.needs_llm_fallback:
            high_confidence_count += 1
    
    min_expected = len(cases) * 0.5
    assert high_confidence_count >= min_expected, \
        f"Expected at least {min_expected} high-confidence classifications, got {high_confidence_count}"

"""
Summarization capability tests.

Tests ZEKE's ability to summarize text accurately without
hallucination or unnecessary preambles.
"""

import pytest
from eval.util import call_model, check_must_include, check_must_not_include


@pytest.mark.issue("ZEKE-SUMMARIZE")
class TestSummarization:
    """Test suite for summarization capabilities."""
    
    def test_single_paragraph_summary(self, load_golden):
        """Test summarizing a simple paragraph."""
        cases = load_golden("summarize_simple.jsonl")
        case = cases[0]
        
        output = call_model(prompt=case["prompt"])
        
        passed, missing = check_must_include(output, case["must_include"])
        assert passed, f"Missing required content: {missing}"
        
        passed, found = check_must_not_include(output, case["must_not_include"])
        assert passed, f"Found forbidden content: {found}"
    
    def test_meeting_note_summary(self, load_golden):
        """Test summarizing meeting notes."""
        cases = load_golden("summarize_simple.jsonl")
        case = cases[1]
        
        output = call_model(prompt=case["prompt"])
        
        passed, missing = check_must_include(output, case["must_include"])
        assert passed, f"Missing required content: {missing}"
        
        passed, found = check_must_not_include(output, case["must_not_include"])
        assert passed, f"Found forbidden content: {found}"
    
    def test_one_sentence_summary(self, load_golden):
        """Test creating a one-sentence summary."""
        cases = load_golden("summarize_simple.jsonl")
        case = cases[2]
        
        output = call_model(prompt=case["prompt"])
        
        passed, missing = check_must_include(output, case["must_include"])
        assert passed, f"Missing required content: {missing}"
        
        sentences = output.strip().split('.')
        sentences = [s.strip() for s in sentences if s.strip()]
        assert len(sentences) <= 2, f"Expected 1-2 sentences, got {len(sentences)}"


@pytest.mark.issue("ZEKE-SUMMARIZE")
@pytest.mark.parametrize("case_id", ["sum-001", "sum-002", "sum-003"])
def test_summarization_parametrized(load_golden, case_id):
    """Parametrized test for all summarization cases."""
    cases = load_golden("summarize_simple.jsonl")
    case = next((c for c in cases if c["id"] == case_id), None)
    
    if case is None:
        pytest.skip(f"Case {case_id} not found")
    
    output = call_model(prompt=case["prompt"])
    
    passed, missing = check_must_include(output, case["must_include"])
    assert passed, f"[{case_id}] Missing: {missing}"
    
    passed, found = check_must_not_include(output, case["must_not_include"])
    assert passed, f"[{case_id}] Forbidden: {found}"

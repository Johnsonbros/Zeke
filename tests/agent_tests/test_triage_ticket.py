"""
Tests for triage ticket generation.
"""

import json
import shutil
import tempfile
from datetime import datetime
from pathlib import Path

import pytest

from python_agents.triage.ticket_generator import (
    Decision,
    FailureType,
    TriageTicket,
    TriageTicketGenerator,
)


class TestDecision:
    """Tests for Decision dataclass."""
    
    def test_to_markdown_basic(self):
        """Test basic decision markdown format."""
        decision = Decision(
            timestamp="2024-12-17T10:00:00",
            agent_id="conductor",
            action="Analyzing user request",
        )
        md = decision.to_markdown()
        
        assert "2024-12-17T10:00:00" in md
        assert "conductor" in md
        assert "Analyzing user request" in md
    
    def test_to_markdown_with_tool(self):
        """Test decision with tool name."""
        decision = Decision(
            timestamp="2024-12-17T10:00:00",
            agent_id="ops_planner",
            action="Executing tool",
            tool_name="add_task",
            result="success",
        )
        md = decision.to_markdown()
        
        assert "`add_task`" in md
        assert "(success)" in md


class TestTriageTicket:
    """Tests for TriageTicket dataclass."""
    
    def test_to_markdown_complete(self):
        """Test complete ticket markdown generation."""
        decisions = [
            Decision("2024-12-17T10:00:00", "conductor", "Started"),
            Decision("2024-12-17T10:00:01", "ops_planner", "Called tool", "add_task"),
        ]
        
        ticket = TriageTicket(
            run_id="test-run-123",
            failure_type=FailureType.RUN_BUDGET_EXCEEDED,
            timestamp="2024-12-17T10:05:00",
            stack_trace="Traceback...\nRunBudgetExceeded: limit reached",
            decisions=decisions,
            redacted_inputs={"query": "Hello", "phone": "555-***-****"},
            hypothesis="Tool call limit exceeded",
            additional_context={"tool_calls_used": 25},
        )
        
        md = ticket.to_markdown()
        
        assert "# Triage Ticket: test-run-123" in md
        assert "run_budget_exceeded" in md
        assert "## Hypothesis" in md
        assert "Tool call limit exceeded" in md
        assert "## Stack Trace" in md
        assert "RunBudgetExceeded" in md
        assert "## Last 20 Decisions" in md
        assert "conductor" in md
        assert "## Redacted Inputs" in md
        assert "555-***-****" in md
        assert "## Additional Context" in md
    
    def test_to_markdown_no_decisions(self):
        """Test ticket with no decisions."""
        ticket = TriageTicket(
            run_id="test-run-456",
            failure_type=FailureType.UNHANDLED_EXCEPTION,
            timestamp="2024-12-17T10:05:00",
            stack_trace="Error",
            decisions=[],
            redacted_inputs={},
            hypothesis="Unknown error",
        )
        
        md = ticket.to_markdown()
        assert "_No decisions recorded_" in md


class TestTriageTicketGenerator:
    """Tests for TriageTicketGenerator."""
    
    @pytest.fixture
    def temp_triage_dir(self):
        """Create a temporary triage directory."""
        temp_dir = tempfile.mkdtemp()
        yield Path(temp_dir)
        shutil.rmtree(temp_dir, ignore_errors=True)
    
    def test_creates_triage_directory(self, temp_triage_dir):
        """Test that triage directory is created."""
        triage_dir = temp_triage_dir / "new_triage"
        generator = TriageTicketGenerator(triage_dir=triage_dir)
        
        assert triage_dir.exists()
    
    def test_creates_ticket_file(self, temp_triage_dir):
        """Test basic ticket file creation."""
        generator = TriageTicketGenerator(triage_dir=temp_triage_dir)
        
        filepath = generator.create_ticket(
            run_id="run-001",
            failure_type=FailureType.UNHANDLED_EXCEPTION,
        )
        
        assert filepath.exists()
        assert filepath.name == "TICKET-run-001.md"
        
        content = filepath.read_text()
        assert "# Triage Ticket: run-001" in content
    
    def test_includes_stack_trace(self, temp_triage_dir):
        """Test that exception stack trace is included."""
        generator = TriageTicketGenerator(triage_dir=temp_triage_dir)
        
        try:
            raise ValueError("Test error message")
        except ValueError as e:
            filepath = generator.create_ticket(
                run_id="run-002",
                failure_type=FailureType.UNHANDLED_EXCEPTION,
                exception=e,
            )
        
        content = filepath.read_text()
        assert "ValueError" in content
        assert "Test error message" in content
    
    def test_includes_decisions(self, temp_triage_dir):
        """Test that decisions are included."""
        generator = TriageTicketGenerator(triage_dir=temp_triage_dir)
        
        decisions = [
            Decision("2024-12-17T10:00:00", "agent1", "Action 1"),
            Decision("2024-12-17T10:00:01", "agent2", "Action 2", "tool1"),
        ]
        
        filepath = generator.create_ticket(
            run_id="run-003",
            failure_type=FailureType.TIMEOUT,
            decisions=decisions,
        )
        
        content = filepath.read_text()
        assert "agent1" in content
        assert "agent2" in content
        assert "Action 1" in content
        assert "`tool1`" in content
    
    def test_limits_decisions_to_20(self, temp_triage_dir):
        """Test that only last 20 decisions are included."""
        generator = TriageTicketGenerator(triage_dir=temp_triage_dir)
        
        decisions = [
            Decision(f"2024-12-17T10:00:{i:02d}", f"agent{i}", f"Action {i}")
            for i in range(30)
        ]
        
        filepath = generator.create_ticket(
            run_id="run-004",
            failure_type=FailureType.RUN_BUDGET_EXCEEDED,
            decisions=decisions,
        )
        
        content = filepath.read_text()
        assert "agent29" in content
        assert "agent10" in content
        assert "agent0" not in content
        assert "agent9" not in content
    
    def test_redacts_pii(self, temp_triage_dir):
        """Test that PII is redacted from inputs."""
        generator = TriageTicketGenerator(triage_dir=temp_triage_dir)
        
        filepath = generator.create_ticket(
            run_id="run-005",
            failure_type=FailureType.API_ERROR,
            inputs={
                "api_key": "sk-secret-key-123",
                "password": "my-secret-password",
                "token": "bearer-token-xyz",
                "message": "Hello world",
            },
        )
        
        content = filepath.read_text()
        
        assert "sk-secret-key-123" not in content
        assert "my-secret-password" not in content
        assert "bearer-token-xyz" not in content
        assert "[REDACTED]" in content
        assert "Hello world" in content


class TestHypothesisGeneration:
    """Tests for failure hypothesis generation."""
    
    @pytest.fixture
    def temp_triage_dir(self):
        """Create a temporary triage directory."""
        temp_dir = tempfile.mkdtemp()
        yield Path(temp_dir)
        shutil.rmtree(temp_dir, ignore_errors=True)
    
    def test_hypothesis_run_budget_tool_limit(self, temp_triage_dir):
        """Test hypothesis for tool limit exceeded."""
        generator = TriageTicketGenerator(triage_dir=temp_triage_dir)
        
        filepath = generator.create_ticket(
            run_id="run-hyp-001",
            failure_type=FailureType.RUN_BUDGET_EXCEEDED,
            context={
                "tool_calls_used": 25,
                "tool_calls_limit": 25,
                "elapsed_seconds": 30,
                "timeout_seconds": 120,
                "tools_called": ["add_task", "search", "add_task"],
            },
        )
        
        content = filepath.read_text()
        assert "Tool call limit exceeded" in content
        assert "25/25" in content
    
    def test_hypothesis_run_budget_timeout(self, temp_triage_dir):
        """Test hypothesis for timeout exceeded."""
        generator = TriageTicketGenerator(triage_dir=temp_triage_dir)
        
        filepath = generator.create_ticket(
            run_id="run-hyp-002",
            failure_type=FailureType.RUN_BUDGET_EXCEEDED,
            context={
                "tool_calls_used": 10,
                "tool_calls_limit": 25,
                "elapsed_seconds": 125,
                "timeout_seconds": 120,
            },
        )
        
        content = filepath.read_text()
        assert "Timeout exceeded" in content
        assert "125" in content
    
    def test_hypothesis_circuit_breaker(self, temp_triage_dir):
        """Test hypothesis for circuit breaker open."""
        generator = TriageTicketGenerator(triage_dir=temp_triage_dir)
        
        filepath = generator.create_ticket(
            run_id="run-hyp-003",
            failure_type=FailureType.CIRCUIT_BREAKER_OPEN,
            context={
                "service": "openai",
                "failure_count": 5,
            },
        )
        
        content = filepath.read_text()
        assert "Circuit breaker open" in content
        assert "openai" in content
        assert "5" in content
    
    def test_hypothesis_tool_policy_violation(self, temp_triage_dir):
        """Test hypothesis for tool policy violation."""
        generator = TriageTicketGenerator(triage_dir=temp_triage_dir)
        
        filepath = generator.create_ticket(
            run_id="run-hyp-004",
            failure_type=FailureType.TOOL_POLICY_VIOLATION,
            context={
                "tool_name": "dangerous_shell",
                "violation_type": "blocked_tool",
            },
        )
        
        content = filepath.read_text()
        assert "Tool policy violation" in content
        assert "dangerous_shell" in content
        assert "blocked_tool" in content


class TestTicketManagement:
    """Tests for ticket management functions."""
    
    @pytest.fixture
    def temp_triage_dir(self):
        """Create a temporary triage directory."""
        temp_dir = tempfile.mkdtemp()
        yield Path(temp_dir)
        shutil.rmtree(temp_dir, ignore_errors=True)
    
    def test_get_pending_tickets(self, temp_triage_dir):
        """Test getting list of pending tickets."""
        generator = TriageTicketGenerator(triage_dir=temp_triage_dir)
        
        generator.create_ticket("run-a", FailureType.TIMEOUT)
        generator.create_ticket("run-b", FailureType.TIMEOUT)
        generator.create_ticket("run-c", FailureType.TIMEOUT)
        
        pending = generator.get_pending_tickets()
        
        assert len(pending) == 3
        assert all(p.name.startswith("TICKET-") for p in pending)
    
    def test_archive_ticket(self, temp_triage_dir):
        """Test archiving a ticket."""
        generator = TriageTicketGenerator(triage_dir=temp_triage_dir)
        
        ticket_path = generator.create_ticket("run-archive", FailureType.TIMEOUT)
        assert ticket_path.exists()
        
        archived_path = generator.archive_ticket(ticket_path)
        
        assert not ticket_path.exists()
        assert archived_path.exists()
        assert archived_path.parent.name == "archive"

"""
Tests for the tool policy validation system.

Tests cover:
- Tool allow-list checking
- JSON Schema validation
- Additional properties rejection
- Output redaction
- INPUT_POLICY_VIOLATION events
"""

import pytest
from python_agents.guards.tool_policy import (
    ToolPolicyValidator,
    PolicyViolation,
    PolicyViolationType,
    InputPolicyViolation,
    get_policy_validator,
)


@pytest.fixture
def validator():
    """Create a fresh validator instance."""
    ToolPolicyValidator.reset_instance()
    return get_policy_validator()


class TestToolAllowList:
    """Tests for tool allow-list functionality."""
    
    def test_allowed_tool_returns_true(self, validator):
        """Allowed tools should return True."""
        assert validator.is_tool_allowed("send_sms") is True
        assert validator.is_tool_allowed("list_tasks") is True
        assert validator.is_tool_allowed("web_search") is True
    
    def test_blocked_tool_returns_false(self, validator):
        """Blocked tools should return False."""
        assert validator.is_tool_allowed("dangerous_shell_command") is False
        assert validator.is_tool_allowed("delete_all_data") is False
        assert validator.is_tool_allowed("export_user_data") is False
    
    def test_unknown_tool_uses_default_policy(self, validator):
        """Unknown tools should use default_allow setting."""
        assert validator.is_tool_allowed("unknown_tool_xyz") is False
    
    def test_requires_admin_flag(self, validator):
        """Admin-required tools should be identified."""
        assert validator.requires_admin("send_sms") is True
        assert validator.requires_admin("configure_daily_checkin") is True
        assert validator.requires_admin("list_tasks") is False
        assert validator.requires_admin("web_search") is False


class TestInputValidation:
    """Tests for input validation against JSON schemas."""
    
    def test_valid_input_passes(self, validator):
        """Valid input should not raise a violation."""
        result = validator.validate_input(
            "send_sms",
            {"to": "+15551234567", "message": "Hello!"},
            is_admin=True
        )
        assert result is None
    
    def test_missing_required_field_fails(self, validator):
        """Missing required fields should cause violation."""
        result = validator.validate_input(
            "send_sms",
            {"to": "+15551234567"},
            is_admin=True
        )
        assert result is not None
        assert result.violation_type == PolicyViolationType.MISSING_REQUIRED
        assert result.field == "message"
    
    def test_additional_property_fails(self, validator):
        """Additional properties should cause violation when not allowed."""
        result = validator.validate_input(
            "send_sms",
            {
                "to": "+15551234567",
                "message": "Hello!",
                "malicious_field": "attack_payload"
            },
            is_admin=True
        )
        assert result is not None
        assert result.violation_type == PolicyViolationType.ADDITIONAL_PROPERTIES
        assert result.field == "malicious_field"
    
    def test_type_mismatch_fails(self, validator):
        """Wrong type should cause violation."""
        result = validator.validate_input(
            "list_tasks",
            {"limit": "not_an_integer"},
            is_admin=True
        )
        assert result is not None
        assert result.violation_type == PolicyViolationType.TYPE_MISMATCH
    
    def test_constraint_violation_min(self, validator):
        """Values below minimum should fail."""
        result = validator.validate_input(
            "list_tasks",
            {"limit": 0},
            is_admin=True
        )
        assert result is not None
        assert result.violation_type == PolicyViolationType.CONSTRAINT_VIOLATION
    
    def test_constraint_violation_max(self, validator):
        """Values above maximum should fail."""
        result = validator.validate_input(
            "list_tasks",
            {"limit": 999},
            is_admin=True
        )
        assert result is not None
        assert result.violation_type == PolicyViolationType.CONSTRAINT_VIOLATION
    
    def test_enum_constraint_fails(self, validator):
        """Invalid enum values should fail."""
        result = validator.validate_input(
            "add_task",
            {"title": "Test task", "priority": "invalid_priority"},
            is_admin=True
        )
        assert result is not None
        assert result.violation_type == PolicyViolationType.CONSTRAINT_VIOLATION
    
    def test_blocked_tool_fails(self, validator):
        """Blocked tools should fail validation."""
        result = validator.validate_input(
            "dangerous_shell_command",
            {"command": "rm -rf /"},
            is_admin=True
        )
        assert result is not None
        assert result.violation_type == PolicyViolationType.TOOL_NOT_ALLOWED
    
    def test_admin_required_fails_for_non_admin(self, validator):
        """Admin-only tools should fail for non-admins."""
        result = validator.validate_input(
            "send_sms",
            {"to": "+15551234567", "message": "Hello!"},
            is_admin=False
        )
        assert result is not None
        assert result.violation_type == PolicyViolationType.ADMIN_REQUIRED


class TestInputPolicyViolationException:
    """Tests for INPUT_POLICY_VIOLATION exception handling."""
    
    def test_validate_and_raise_on_invalid_input(self, validator):
        """validate_and_raise should raise InputPolicyViolation."""
        with pytest.raises(InputPolicyViolation) as exc_info:
            validator.validate_and_raise(
                "send_sms",
                {
                    "to": "+15551234567",
                    "message": "Hello!",
                    "disallowed_field": "should_fail"
                },
                is_admin=True
            )
        
        violation = exc_info.value.violation
        assert violation.violation_type == PolicyViolationType.ADDITIONAL_PROPERTIES
        assert violation.tool_name == "send_sms"
        assert violation.field == "disallowed_field"
    
    def test_validate_and_raise_passes_on_valid_input(self, validator):
        """validate_and_raise should not raise for valid input."""
        validator.validate_and_raise(
            "list_tasks",
            {"status": "pending"},
            is_admin=True
        )
    
    def test_violation_to_dict_serialization(self, validator):
        """PolicyViolation should serialize to dict correctly."""
        violation = PolicyViolation(
            violation_type=PolicyViolationType.ADDITIONAL_PROPERTIES,
            tool_name="send_sms",
            message="Additional property not allowed",
            field="bad_field",
            expected=["to", "message"],
            actual="bad_field"
        )
        
        data = violation.to_dict()
        assert data["violation_type"] == "additional_properties"
        assert data["tool_name"] == "send_sms"
        assert data["field"] == "bad_field"


class TestOutputRedaction:
    """Tests for output redaction in logs."""
    
    def test_redacts_tool_specific_fields(self, validator):
        """Tool-specific redact_output fields should be redacted."""
        output = {
            "success": True,
            "to": "+15551234567",
            "message": "Hello!",
            "messageId": "abc123"
        }
        redacted = validator.redact_output("send_sms", output)
        
        assert redacted["to"] == "[REDACTED]"
        assert redacted["success"] is True
        assert redacted["message"] == "Hello!"
    
    def test_redacts_global_patterns(self, validator):
        """Global redact_patterns should be redacted."""
        output = {
            "data": {
                "api_key": "secret_key_123",
                "phone_number": "+15551234567",
                "content": "normal content"
            }
        }
        redacted = validator.redact_output("list_tasks", output)
        
        assert redacted["data"]["api_key"] == "[REDACTED]"
        assert redacted["data"]["phone_number"] == "[REDACTED]"
        assert redacted["data"]["content"] == "normal content"
    
    def test_redacts_nested_fields(self, validator):
        """Nested sensitive fields should be redacted."""
        output = {
            "result": {
                "user": {
                    "password": "secret123",
                    "name": "Test User"
                }
            }
        }
        redacted = validator.redact_output("list_tasks", output)
        
        assert redacted["result"]["user"]["password"] == "[REDACTED]"
        assert redacted["result"]["user"]["name"] == "Test User"
    
    def test_redacts_list_items(self, validator):
        """Items in lists should be redacted correctly."""
        output = {
            "items": [
                {"token": "secret1", "id": 1},
                {"token": "secret2", "id": 2},
            ]
        }
        redacted = validator.redact_output("list_tasks", output)
        
        assert redacted["items"][0]["token"] == "[REDACTED]"
        assert redacted["items"][0]["id"] == 1
        assert redacted["items"][1]["token"] == "[REDACTED]"


class TestSchemaValidationEdgeCases:
    """Edge case tests for schema validation."""
    
    def test_empty_object_passes_when_no_required(self, validator):
        """Empty objects should pass when no fields are required."""
        result = validator.validate_input(
            "get_today_events",
            {},
            is_admin=True
        )
        assert result is None
    
    def test_string_length_constraints(self, validator):
        """String length constraints should be enforced."""
        long_query = "x" * 600
        result = validator.validate_input(
            "web_search",
            {"query": long_query},
            is_admin=True
        )
        assert result is not None
        assert result.violation_type == PolicyViolationType.CONSTRAINT_VIOLATION
    
    def test_multiple_type_support(self, validator):
        """Fields allowing multiple types should validate correctly."""
        result_int = validator.validate_input(
            "complete_task",
            {"task_id": 123},
            is_admin=True
        )
        assert result_int is None
        
        result_str = validator.validate_input(
            "complete_task",
            {"task_id": "task-abc"},
            is_admin=True
        )
        assert result_str is None
    
    def test_boolean_not_treated_as_integer(self, validator):
        """Booleans should not be accepted where integers are expected."""
        result = validator.validate_input(
            "list_tasks",
            {"limit": True},
            is_admin=True
        )
        assert result is not None
        assert result.violation_type == PolicyViolationType.TYPE_MISMATCH


class TestPolicyViolationEvent:
    """Tests for INPUT_POLICY_VIOLATION event emission."""
    
    def test_violation_contains_all_fields(self, validator):
        """Violations should contain all necessary debugging info."""
        result = validator.validate_input(
            "send_sms",
            {"to": "+15551234567", "message": "Hi", "extra": "bad"},
            is_admin=True
        )
        
        assert result.violation_type == PolicyViolationType.ADDITIONAL_PROPERTIES
        assert result.tool_name == "send_sms"
        assert result.field == "extra"
        assert "additional" in result.message.lower()
    
    def test_blocked_tool_violation_includes_reason(self, validator):
        """Blocked tool violations should include the block reason."""
        result = validator.validate_input(
            "dangerous_shell_command",
            {},
            is_admin=True
        )
        
        assert result.violation_type == PolicyViolationType.TOOL_NOT_ALLOWED
        assert "shell" in result.message.lower() or "not permitted" in result.message.lower()

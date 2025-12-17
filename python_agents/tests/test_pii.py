"""Tests for Python PII redaction utilities."""

import pytest

from python_agents.utils.pii import (
    redact,
    redact_object,
    RedactorConfig,
    PIIRedactor,
)


class TestRedact:
    """Tests for the redact function."""

    def test_redact_email(self):
        """Should redact email addresses."""
        result = redact("Contact me at user@example.com")
        assert result == "Contact me at [EMAIL]"

    def test_redact_phone(self):
        """Should redact phone numbers."""
        result = redact("Call me at 555-123-4567")
        assert result == "Call me at [PHONE]"

    def test_redact_phone_with_country_code(self):
        """Should redact phone with country code."""
        result = redact("Call +1-555-123-4567")
        assert result == "Call [PHONE]"

    def test_redact_ssn(self):
        """Should redact SSN."""
        result = redact("My SSN is 123-45-6789")
        assert result == "My SSN is [SSN]"

    def test_redact_credit_card(self):
        """Should redact credit card numbers."""
        result = redact("Card: 4111-1111-1111-1111")
        assert result == "Card: [CC]"

    def test_redact_address(self):
        """Should redact street addresses."""
        result = redact("I live at 123 Main Street")
        assert result == "I live at [ADDRESS]"

    def test_redact_ip_address(self):
        """Should redact IP addresses."""
        result = redact("Server at 192.168.1.100")
        assert result == "Server at [IP]"

    def test_preserve_localhost_127(self):
        """Should not redact 127.0.0.1."""
        result = redact("Localhost is 127.0.0.1")
        assert result == "Localhost is 127.0.0.1"

    def test_preserve_localhost_0(self):
        """Should not redact 0.0.0.0."""
        result = redact("Bound to 0.0.0.0")
        assert result == "Bound to 0.0.0.0"

    def test_preserve_length_email(self):
        """Should preserve length when masking emails."""
        config = RedactorConfig(preserve_length=True)
        result = redact("user@example.com", config)
        assert "@" in result
        assert result.startswith("u")

    def test_preserve_length_phone(self):
        """Should preserve length when masking phones."""
        config = RedactorConfig(preserve_length=True)
        result = redact("555-123-4567", config)
        assert len(result) == len("555-123-4567")

    def test_multiple_pii_types(self):
        """Should redact multiple PII types in one string."""
        result = redact("Email: user@test.com, Phone: 555-123-4567")
        assert "[EMAIL]" in result
        assert "[PHONE]" in result

    def test_cc_before_phone_no_conflict(self):
        """Credit card should be processed before phone to avoid conflicts."""
        result = redact("Card 4111-1111-1111-1111 and phone 555-123-4567")
        assert "[CC]" in result
        assert "[PHONE]" in result

    def test_selective_redaction(self):
        """Should only redact enabled types."""
        config = RedactorConfig(redact_emails=False)
        result = redact("Email: user@test.com, Phone: 555-123-4567", config)
        assert "user@test.com" in result
        assert "[PHONE]" in result


class TestRedactObject:
    """Tests for the redact_object function."""

    def test_redact_string(self):
        """Should redact strings."""
        result = redact_object("user@example.com")
        assert result == "[EMAIL]"

    def test_redact_dict(self):
        """Should redact values in dictionaries."""
        obj = {"email": "user@example.com", "count": 42}
        result = redact_object(obj)
        assert result["email"] == "[EMAIL]"
        assert result["count"] == 42

    def test_redact_nested_dict(self):
        """Should redact nested dictionaries."""
        obj = {
            "user": {
                "email": "user@example.com",
                "phone": "555-123-4567"
            }
        }
        result = redact_object(obj)
        assert result["user"]["email"] == "[EMAIL]"
        assert result["user"]["phone"] == "[PHONE]"

    def test_redact_list(self):
        """Should redact items in lists."""
        obj = ["user@example.com", "other@test.com"]
        result = redact_object(obj)
        assert result == ["[EMAIL]", "[EMAIL]"]

    def test_redact_list_of_dicts(self):
        """Should redact list of dictionaries."""
        obj = [
            {"email": "a@test.com"},
            {"email": "b@test.com"}
        ]
        result = redact_object(obj)
        assert result[0]["email"] == "[EMAIL]"
        assert result[1]["email"] == "[EMAIL]"

    def test_handle_none(self):
        """Should handle None values."""
        assert redact_object(None) is None

    def test_handle_numbers(self):
        """Should pass through numbers unchanged."""
        assert redact_object(42) == 42
        assert redact_object(3.14) == 3.14

    def test_handle_bool(self):
        """Should pass through booleans unchanged."""
        assert redact_object(True) is True
        assert redact_object(False) is False


class TestPIIRedactor:
    """Tests for the PIIRedactor class."""

    def test_stateful_redactor(self):
        """Should use configured settings."""
        redactor = PIIRedactor(preserve_length=True)
        result = redactor.redact_string("555-123-4567")
        assert len(result) == len("555-123-4567")

    def test_redact_all(self):
        """Should redact objects with instance method."""
        redactor = PIIRedactor()
        obj = {"email": "user@test.com"}
        result = redactor.redact_all(obj)
        assert result["email"] == "[EMAIL]"

    def test_custom_mask_char(self):
        """Should use custom mask character."""
        redactor = PIIRedactor(preserve_length=True, mask_char="X")
        result = redactor.redact_string("555-123-4567")
        assert "X" in result
        assert "*" not in result

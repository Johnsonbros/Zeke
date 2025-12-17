"""
Tool Policy Validator for ZEKE's Python agent system.

Provides input validation and output redaction for tool calls based on 
a configurable policy file. Emits INPUT_POLICY_VIOLATION events when
validation fails.
"""

import json
import logging
import re
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class PolicyViolationType(str, Enum):
    """Types of policy violations."""
    TOOL_NOT_ALLOWED = "tool_not_allowed"
    TOOL_NOT_FOUND = "tool_not_found"
    SCHEMA_VALIDATION_FAILED = "schema_validation_failed"
    ADDITIONAL_PROPERTIES = "additional_properties"
    MISSING_REQUIRED = "missing_required"
    TYPE_MISMATCH = "type_mismatch"
    CONSTRAINT_VIOLATION = "constraint_violation"
    ADMIN_REQUIRED = "admin_required"


@dataclass
class PolicyViolation:
    """Represents a policy violation."""
    violation_type: PolicyViolationType
    tool_name: str
    message: str
    field: str | None = None
    expected: Any = None
    actual: Any = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "violation_type": self.violation_type.value,
            "tool_name": self.tool_name,
            "message": self.message,
            "field": self.field,
            "expected": self.expected,
            "actual": str(self.actual) if self.actual is not None else None,
        }


class InputPolicyViolation(Exception):
    """Exception raised when input validation fails."""
    
    def __init__(self, violation: PolicyViolation):
        self.violation = violation
        super().__init__(violation.message)


class ToolPolicyValidator:
    """
    Validates tool inputs against policy and redacts sensitive outputs.
    
    Loads policy from tool_policy.json and provides:
    - Tool allow-list checking
    - JSON Schema validation for inputs
    - Output redaction for logging
    - Admin permission checking
    """
    
    _instance: "ToolPolicyValidator | None" = None
    _policy: dict[str, Any] | None = None
    
    def __init__(self, policy_path: str | Path | None = None):
        """
        Initialize the validator with a policy file.
        
        Args:
            policy_path: Path to the policy JSON file. Defaults to 
                        tool_policy.json in the same directory.
        """
        if policy_path is None:
            policy_path = Path(__file__).parent / "tool_policy.json"
        
        self._policy_path = Path(policy_path)
        self._load_policy()
    
    def _load_policy(self) -> None:
        """Load the policy from the JSON file."""
        try:
            with open(self._policy_path, "r") as f:
                self._policy = json.load(f)
            logger.info(f"Loaded tool policy from {self._policy_path}")
        except FileNotFoundError:
            logger.warning(f"Policy file not found: {self._policy_path}")
            self._policy = {"settings": {"default_allow": True}, "tools": {}}
        except json.JSONDecodeError as e:
            logger.error(f"Invalid policy JSON: {e}")
            self._policy = {"settings": {"default_allow": True}, "tools": {}}
    
    @classmethod
    def get_instance(cls) -> "ToolPolicyValidator":
        """Get the singleton validator instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    @classmethod
    def reset_instance(cls) -> None:
        """Reset the singleton instance (for testing)."""
        cls._instance = None
    
    @property
    def settings(self) -> dict[str, Any]:
        """Get policy settings."""
        return self._policy.get("settings", {}) if self._policy else {}
    
    @property
    def tools(self) -> dict[str, Any]:
        """Get tool definitions from policy."""
        return self._policy.get("tools", {}) if self._policy else {}
    
    @property
    def blocked_tools(self) -> dict[str, Any]:
        """Get blocked tool definitions."""
        return self._policy.get("blocked_tools", {}) if self._policy else {}
    
    @property
    def redact_patterns(self) -> list[str]:
        """Get patterns for field names to redact."""
        return self._policy.get("redact_patterns", []) if self._policy else []
    
    def is_tool_allowed(self, tool_name: str) -> bool:
        """
        Check if a tool is allowed by the policy.
        
        Args:
            tool_name: Name of the tool to check
            
        Returns:
            bool: True if the tool is allowed
        """
        if tool_name in self.blocked_tools:
            return False
        
        if tool_name in self.tools:
            return self.tools[tool_name].get("allowed", True)
        
        return self.settings.get("default_allow", False)
    
    def requires_admin(self, tool_name: str) -> bool:
        """
        Check if a tool requires admin permissions.
        
        Args:
            tool_name: Name of the tool to check
            
        Returns:
            bool: True if admin is required
        """
        if tool_name in self.tools:
            return self.tools[tool_name].get("requires_admin", False)
        return False
    
    def validate_input(
        self, 
        tool_name: str, 
        arguments: dict[str, Any],
        is_admin: bool = True
    ) -> PolicyViolation | None:
        """
        Validate tool input against the policy schema.
        
        Args:
            tool_name: Name of the tool being called
            arguments: Arguments to validate
            is_admin: Whether the caller has admin permissions
            
        Returns:
            PolicyViolation if validation fails, None otherwise
        """
        if tool_name in self.blocked_tools:
            return PolicyViolation(
                violation_type=PolicyViolationType.TOOL_NOT_ALLOWED,
                tool_name=tool_name,
                message=f"Tool '{tool_name}' is blocked: {self.blocked_tools[tool_name].get('reason', 'Not permitted')}"
            )
        
        if not self.is_tool_allowed(tool_name):
            return PolicyViolation(
                violation_type=PolicyViolationType.TOOL_NOT_FOUND,
                tool_name=tool_name,
                message=f"Tool '{tool_name}' is not in the allow-list"
            )
        
        if self.requires_admin(tool_name) and not is_admin:
            return PolicyViolation(
                violation_type=PolicyViolationType.ADMIN_REQUIRED,
                tool_name=tool_name,
                message=f"Tool '{tool_name}' requires admin permissions"
            )
        
        tool_config = self.tools.get(tool_name)
        if not tool_config:
            if self.settings.get("default_allow", False):
                return None
            return PolicyViolation(
                violation_type=PolicyViolationType.TOOL_NOT_FOUND,
                tool_name=tool_name,
                message=f"Tool '{tool_name}' not found in policy"
            )
        
        schema = tool_config.get("schema")
        if not schema or not self.settings.get("strict_schema_validation", True):
            return None
        
        return self._validate_schema(tool_name, arguments, schema)
    
    def _validate_schema(
        self, 
        tool_name: str, 
        data: dict[str, Any], 
        schema: dict[str, Any],
        path: str = ""
    ) -> PolicyViolation | None:
        """
        Validate data against a JSON schema.
        
        Args:
            tool_name: Tool name for error reporting
            data: Data to validate
            schema: JSON schema to validate against
            path: Current path in the schema (for nested validation)
            
        Returns:
            PolicyViolation if validation fails, None otherwise
        """
        if not isinstance(data, dict):
            return PolicyViolation(
                violation_type=PolicyViolationType.TYPE_MISMATCH,
                tool_name=tool_name,
                message=f"Expected object, got {type(data).__name__}",
                field=path or "root",
                expected="object",
                actual=type(data).__name__
            )
        
        for required_field in schema.get("required", []):
            if required_field not in data:
                field_path = f"{path}.{required_field}" if path else required_field
                return PolicyViolation(
                    violation_type=PolicyViolationType.MISSING_REQUIRED,
                    tool_name=tool_name,
                    message=f"Missing required field: {field_path}",
                    field=field_path,
                    expected="present",
                    actual="missing"
                )
        
        if schema.get("additionalProperties") is False:
            allowed_properties = set(schema.get("properties", {}).keys())
            for key in data.keys():
                if key not in allowed_properties:
                    field_path = f"{path}.{key}" if path else key
                    return PolicyViolation(
                        violation_type=PolicyViolationType.ADDITIONAL_PROPERTIES,
                        tool_name=tool_name,
                        message=f"Additional property not allowed: {field_path}",
                        field=field_path,
                        expected=list(allowed_properties),
                        actual=key
                    )
        
        properties = schema.get("properties", {})
        for field_name, field_value in data.items():
            if field_name not in properties:
                continue
            
            field_schema = properties[field_name]
            field_path = f"{path}.{field_name}" if path else field_name
            
            violation = self._validate_field(
                tool_name, field_name, field_value, field_schema, field_path
            )
            if violation:
                return violation
        
        return None
    
    def _validate_field(
        self,
        tool_name: str,
        field_name: str,
        value: Any,
        schema: dict[str, Any],
        path: str
    ) -> PolicyViolation | None:
        """Validate a single field against its schema."""
        expected_type = schema.get("type")
        
        if expected_type and not self._check_type(value, expected_type):
            return PolicyViolation(
                violation_type=PolicyViolationType.TYPE_MISMATCH,
                tool_name=tool_name,
                message=f"Field '{path}' has wrong type: expected {expected_type}, got {type(value).__name__}",
                field=path,
                expected=expected_type,
                actual=type(value).__name__
            )
        
        if "enum" in schema and value not in schema["enum"]:
            return PolicyViolation(
                violation_type=PolicyViolationType.CONSTRAINT_VIOLATION,
                tool_name=tool_name,
                message=f"Field '{path}' must be one of {schema['enum']}, got '{value}'",
                field=path,
                expected=schema["enum"],
                actual=value
            )
        
        if isinstance(value, str):
            if "minLength" in schema and len(value) < schema["minLength"]:
                return PolicyViolation(
                    violation_type=PolicyViolationType.CONSTRAINT_VIOLATION,
                    tool_name=tool_name,
                    message=f"Field '{path}' too short: minimum {schema['minLength']}, got {len(value)}",
                    field=path,
                    expected=f"minLength={schema['minLength']}",
                    actual=len(value)
                )
            if "maxLength" in schema and len(value) > schema["maxLength"]:
                return PolicyViolation(
                    violation_type=PolicyViolationType.CONSTRAINT_VIOLATION,
                    tool_name=tool_name,
                    message=f"Field '{path}' too long: maximum {schema['maxLength']}, got {len(value)}",
                    field=path,
                    expected=f"maxLength={schema['maxLength']}",
                    actual=len(value)
                )
            if "pattern" in schema:
                if not re.match(schema["pattern"], value):
                    return PolicyViolation(
                        violation_type=PolicyViolationType.CONSTRAINT_VIOLATION,
                        tool_name=tool_name,
                        message=f"Field '{path}' does not match pattern: {schema['pattern']}",
                        field=path,
                        expected=f"pattern={schema['pattern']}",
                        actual=value
                    )
        
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            if "minimum" in schema and value < schema["minimum"]:
                return PolicyViolation(
                    violation_type=PolicyViolationType.CONSTRAINT_VIOLATION,
                    tool_name=tool_name,
                    message=f"Field '{path}' below minimum: {schema['minimum']}, got {value}",
                    field=path,
                    expected=f"minimum={schema['minimum']}",
                    actual=value
                )
            if "maximum" in schema and value > schema["maximum"]:
                return PolicyViolation(
                    violation_type=PolicyViolationType.CONSTRAINT_VIOLATION,
                    tool_name=tool_name,
                    message=f"Field '{path}' above maximum: {schema['maximum']}, got {value}",
                    field=path,
                    expected=f"maximum={schema['maximum']}",
                    actual=value
                )
        
        return None
    
    def _check_type(self, value: Any, expected: str | list[str]) -> bool:
        """Check if a value matches the expected type(s)."""
        if isinstance(expected, list):
            return any(self._check_type(value, t) for t in expected)
        
        type_mapping = {
            "string": str,
            "integer": int,
            "number": (int, float),
            "boolean": bool,
            "array": list,
            "object": dict,
            "null": type(None),
        }
        
        expected_types = type_mapping.get(expected)
        if expected_types is None:
            return True
        
        if expected == "integer" and isinstance(value, bool):
            return False
        
        return isinstance(value, expected_types)
    
    def redact_output(
        self, 
        tool_name: str, 
        output: Any,
        for_logging: bool = True
    ) -> Any:
        """
        Redact sensitive fields from tool output.
        
        Args:
            tool_name: Name of the tool
            output: Tool output to redact
            for_logging: Whether this is for logging purposes
            
        Returns:
            Redacted copy of the output
        """
        if not self.settings.get("log_redaction_enabled", True):
            return output
        
        tool_config = self.tools.get(tool_name, {})
        tool_redact_fields = set(tool_config.get("redact_output", []))
        global_redact_patterns = set(self.redact_patterns)
        
        return self._redact_recursive(output, tool_redact_fields, global_redact_patterns)
    
    def _redact_recursive(
        self, 
        data: Any, 
        tool_fields: set[str], 
        patterns: set[str]
    ) -> Any:
        """Recursively redact sensitive fields."""
        if isinstance(data, dict):
            result = {}
            for key, value in data.items():
                if key in tool_fields or self._matches_pattern(key, patterns):
                    result[key] = "[REDACTED]"
                else:
                    result[key] = self._redact_recursive(value, tool_fields, patterns)
            return result
        elif isinstance(data, list):
            return [self._redact_recursive(item, tool_fields, patterns) for item in data]
        else:
            return data
    
    def _matches_pattern(self, field_name: str, patterns: set[str]) -> bool:
        """Check if a field name matches any redaction pattern."""
        lower_name = field_name.lower()
        for pattern in patterns:
            if pattern.lower() in lower_name:
                return True
        return False
    
    def validate_and_raise(
        self, 
        tool_name: str, 
        arguments: dict[str, Any],
        is_admin: bool = True
    ) -> None:
        """
        Validate input and raise InputPolicyViolation if it fails.
        
        Args:
            tool_name: Name of the tool being called
            arguments: Arguments to validate
            is_admin: Whether the caller has admin permissions
            
        Raises:
            InputPolicyViolation: If validation fails
        """
        violation = self.validate_input(tool_name, arguments, is_admin)
        if violation:
            logger.warning(
                f"INPUT_POLICY_VIOLATION: {violation.violation_type.value} "
                f"for tool '{tool_name}': {violation.message}"
            )
            raise InputPolicyViolation(violation)


def get_policy_validator() -> ToolPolicyValidator:
    """Get the global policy validator instance."""
    return ToolPolicyValidator.get_instance()

"""
Safety Auditor Agent for ZEKE

This agent handles:
- Permission verification and access control validation
- Response content moderation and guardrail enforcement
- Help and guidance for users
- System status checks
- Handling unknown or ambiguous intents

The Safety Auditor acts as a final validation layer for sensitive operations
and ensures all responses adhere to ZEKE's safety guidelines.
"""

import json
import logging
from typing import Any
from dataclasses import dataclass

from .base import (
    BaseAgent,
    AgentId,
    AgentContext,
    AgentStatus,
    CapabilityCategory,
    ToolDefinition,
)

logger = logging.getLogger(__name__)


@dataclass
class PermissionCheckResult:
    """
    Result from a permission check.
    
    Attributes:
        allowed: Whether the action is permitted
        reason: Explanation of the decision
        required_level: Access level required for this action
        user_level: The user's current access level
    """
    allowed: bool
    reason: str
    required_level: str | None = None
    user_level: str | None = None


@dataclass
class ValidationResult:
    """
    Result from content validation.
    
    Attributes:
        valid: Whether the content passed validation
        issues: List of issues found
        suggestions: Suggested improvements
    """
    valid: bool
    issues: list[str] | None = None
    suggestions: list[str] | None = None


SAFETY_AUDITOR_INSTRUCTIONS = """You are ZEKE's Safety Auditor - responsible for system integrity, user guidance, and safety.

Your primary responsibilities:
1. HELP REQUESTS: Provide clear, helpful guidance when users ask for help or are confused
2. STATUS CHECKS: Report on system status, capabilities, and availability
3. PERMISSION VALIDATION: Ensure operations have proper authorization
4. UNKNOWN INTENTS: Gracefully handle unclear or ambiguous requests
5. GUARDRAILS: Ensure responses adhere to ZEKE's safety guidelines

CRITICAL PRINCIPLES:
1. Be HELPFUL first - your goal is to assist, not block
2. Explain clearly when something isn't possible and offer alternatives
3. Never expose internal system details, API keys, or sensitive implementation
4. For permission issues, explain what's needed without being judgmental
5. Always maintain Nate's privacy and security

HANDLING HELP REQUESTS:
- Explain ZEKE's capabilities clearly and concisely
- Offer specific examples of what users can do
- Guide users toward their goals

HANDLING UNKNOWN INTENTS:
- Ask clarifying questions to understand what the user wants
- Suggest similar capabilities that might help
- Never leave the user stuck - always offer a path forward

HANDLING STATUS CHECKS:
- Report system status accurately
- Check connectivity to external services when asked
- Provide actionable information about any issues

PERMISSION RESPONSES:
- Explain the permission model simply
- Suggest how to get access if appropriate
- Never reveal security implementation details

You are the last line of defense for safety and the first line of support for help.
When in doubt, prioritize being helpful while maintaining security.
"""


class SafetyAuditorAgent(BaseAgent):
    """
    Safety Auditor Agent - ZEKE's security and guidance specialist.
    
    This agent is responsible for:
    - Permission verification and access control
    - Response validation and content moderation
    - User help and guidance
    - System status reporting
    - Handling unknown or ambiguous intents
    
    The Safety Auditor acts as both a guardrail and a helpful guide,
    ensuring secure operations while keeping users unblocked.
    
    Attributes:
        agent_id: SAFETY_AUDITOR
        capabilities: [SYSTEM]
        handoff_targets: [CONDUCTOR]
    """
    
    async def _handle_check_omi_status(self, ctx: Any, args: str) -> str:
        """Handler for check_omi_status tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("check_omi_status", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"check_omi_status execution failed: {e}")
            return json.dumps({
                "success": False,
                "error": f"Status check failed: {str(e)}",
                "connected": False
            })
    
    async def _handle_get_current_time(self, ctx: Any, args: str) -> str:
        """Handler for get_current_time tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("get_current_time", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"get_current_time execution failed: {e}")
            return json.dumps({"error": f"Time check failed: {str(e)}"})
    
    def __init__(self):
        """Initialize the Safety Auditor agent with its tools and configuration."""
        tool_definitions = [
            ToolDefinition(
                name="check_omi_status",
                description=(
                    "Check if the Omi pendant API is connected and working properly. "
                    "Use this when users ask about pendant connectivity, lifelog availability, "
                    "or when troubleshooting why conversation recordings aren't available."
                ),
                parameters={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
                handler=self._handle_check_omi_status,
            ),
            ToolDefinition(
                name="get_current_time",
                description=(
                    "Get the current time. Useful for status checks and time-sensitive "
                    "operations. Returns formatted datetime in the local timezone."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "format": {
                            "type": "string",
                            "description": "Optional: Time format (12h or 24h). Defaults to 12h.",
                            "enum": ["12h", "24h"],
                        },
                    },
                    "required": [],
                },
                handler=self._handle_get_current_time,
            ),
        ]
        
        super().__init__(
            agent_id=AgentId.SAFETY_AUDITOR,
            name="SafetyAuditor",
            description="Security validation and user guidance specialist - permission checks, guardrails, help, and status",
            instructions=SAFETY_AUDITOR_INSTRUCTIONS,
            capabilities=[CapabilityCategory.SYSTEM],
            tools=tool_definitions,
            handoff_targets=[
                AgentId.CONDUCTOR,
            ],
        )
    
    def verify_permissions(
        self,
        context: AgentContext,
        required_capability: str | None = None
    ) -> tuple[bool, str | None]:
        """
        Verify that the current request has appropriate permissions.
        
        The Safety Auditor uses a deny-by-default security model.
        Only explicitly authorized requests are permitted.
        
        Args:
            context: Current request context
            required_capability: Optional specific capability to check
            
        Returns:
            tuple: (is_authorized: bool, error_message: str | None)
        """
        metadata = context.metadata
        
        if metadata.get("is_admin", False):
            return True, None
        
        source = metadata.get("source", "unknown")
        
        if source == "web":
            if metadata.get("trusted_single_user_deployment", False):
                return True, None
            return False, "Web request requires authorization."
        
        if source == "sms":
            if metadata.get("sender_is_admin", False):
                return True, None
            return False, "SMS sender is not authorized."
        
        return False, "Request source could not be verified."
    
    def validate_response(
        self,
        response: str,
        context: AgentContext
    ) -> ValidationResult:
        """
        Validate a response before sending to user.
        
        This method checks for:
        - Sensitive information leakage
        - Inappropriate content
        - Guideline violations
        
        Args:
            response: The response text to validate
            context: Request context for additional checks
            
        Returns:
            ValidationResult: Validation outcome with any issues
        """
        issues: list[str] = []
        suggestions: list[str] = []
        
        lower_response = response.lower()
        
        sensitive_patterns = [
            "api_key",
            "api key",
            "secret",
            "password",
            "token",
            "bearer ",
            "sk-",
            "pk_",
        ]
        
        for pattern in sensitive_patterns:
            if pattern in lower_response:
                issues.append(f"Response may contain sensitive data pattern: {pattern}")
                suggestions.append("Remove or redact sensitive information before responding")
        
        if not issues:
            return ValidationResult(valid=True)
        
        return ValidationResult(
            valid=False,
            issues=issues,
            suggestions=suggestions
        )
    
    async def _execute(self, input_text: str, context: AgentContext) -> str:
        """
        Execute the Safety Auditor agent's main logic.
        
        This method processes help requests, status checks, permission
        validations, and unknown intent handling.
        
        Args:
            input_text: The user's input message
            context: Context for the request
            
        Returns:
            str: The agent's response
        """
        self.status = AgentStatus.PROCESSING
        
        try:
            full_instructions = self.instructions
            
            is_authorized, auth_error = self.verify_permissions(context)
            
            if context.user_profile:
                full_instructions += f"\n\nUser Profile Context:\n{json.dumps(context.user_profile, indent=2)}"
            
            if context.metadata.get("source"):
                full_instructions += f"\n\nRequest Source: {context.metadata.get('source')}"
            
            full_instructions += f"\n\nPermission Status: {'AUTHORIZED' if is_authorized else 'LIMITED'}"
            if auth_error:
                full_instructions += f"\nNote: {auth_error}"
            
            full_instructions += "\n\nREMEMBER: Be helpful and guide the user. Even if something isn't possible, offer alternatives."
            
            from agents import Agent, Runner
            
            agent = Agent(
                name=self.name,
                instructions=full_instructions,
                tools=self.tools,
            )
            
            result = await Runner.run(agent, input_text)
            
            validation = self.validate_response(result.final_output, context)
            
            if not validation.valid:
                logger.warning(f"Response validation failed: {validation.issues}")
                self.status = AgentStatus.IDLE
                return "I apologize, but I need to rephrase my response. Let me try again with clearer information."
            
            self.status = AgentStatus.IDLE
            return result.final_output
            
        except Exception as e:
            self.status = AgentStatus.ERROR
            logger.error(f"SafetyAuditor execution error: {e}")
            raise


_safety_auditor_instance: SafetyAuditorAgent | None = None


def get_safety_auditor() -> SafetyAuditorAgent:
    """
    Get the singleton Safety Auditor agent instance.
    
    Returns:
        SafetyAuditorAgent: The Safety Auditor agent instance
    """
    global _safety_auditor_instance
    if _safety_auditor_instance is None:
        _safety_auditor_instance = SafetyAuditorAgent()
    return _safety_auditor_instance

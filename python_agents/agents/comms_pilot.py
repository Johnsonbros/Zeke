"""
Communications Pilot Agent - ZEKE's SMS and messaging specialist.

This module implements the Comms Pilot agent responsible for:
- Sending SMS messages with permission verification
- Managing daily check-in configurations
- Formatting messages appropriately for different mediums
- Enforcing contact access control rules

The Comms Pilot works with Safety Auditor to ensure all outbound
communications are authorized before sending.
"""

from dataclasses import dataclass, field
from typing import Any
import logging
import json

from agents import Agent, Runner

from .base import (
    BaseAgent,
    AgentId,
    AgentStatus,
    AgentContext,
    CapabilityCategory,
    HandoffRequest,
    HandoffReason,
    ToolDefinition,
)
from ..bridge import get_bridge


logger = logging.getLogger(__name__)


COMMS_PILOT_INSTRUCTIONS = """You are the CommsPilot, ZEKE's communications specialist. Your role is to:
1. Send SMS messages ONLY when properly authorized
2. Manage daily check-in configurations for Nate
3. Enforce strict contact permission rules
4. Format messages appropriately for SMS medium

CRITICAL PERMISSION RULES:
- Only master admin (Nate) can trigger outbound SMS from web/chat
- SMS messages from other contacts require explicit permission verification
- Never send SMS to unknown or unauthorized contacts
- Always verify the recipient has appropriate access level

DAILY CHECK-INS:
- Can configure, query, or stop daily check-ins
- Check-ins are personal to Nate's routine
- Can send immediate check-in when requested

SMS FORMATTING BEST PRACTICES:
- Keep messages concise (SMS has character limits)
- Include context when needed but avoid verbosity
- Use proper formatting for phone numbers
- Confirm successful delivery or report errors clearly

When you receive a request to send a message:
1. First verify the sender has permission (for non-web requests)
2. Validate the recipient phone number
3. Format the message appropriately
4. Send and confirm delivery status

If authorization is unclear, hand off to Safety Auditor for verification.
Never assume permissions - always check."""


@dataclass
class SmsResult:
    """
    Result from an SMS send operation.
    
    Attributes:
        success: Whether the SMS was sent successfully
        message_sid: Twilio message SID if successful
        to: Recipient phone number
        error: Error message if failed
    """
    success: bool
    to: str
    message_sid: str | None = None
    error: str | None = None


@dataclass 
class CheckInConfig:
    """
    Configuration for daily check-ins.
    
    Attributes:
        enabled: Whether check-ins are active
        time: Time of day for check-in (HH:MM format)
        phone_number: Phone to send check-ins to
        message_template: Custom message template
    """
    enabled: bool = False
    time: str = "09:00"
    phone_number: str | None = None
    message_template: str | None = None


class CommsPilotAgent(BaseAgent):
    """
    Communications Pilot Agent - ZEKE's SMS and messaging specialist.
    
    This agent is responsible for:
    - Sending SMS messages with proper authorization
    - Managing daily check-in schedules
    - Enforcing contact permission rules
    - Message formatting and delivery confirmation
    
    The Comms Pilot integrates with Twilio via the Node.js bridge
    and works with Safety Auditor for permission verification.
    
    Attributes:
        agent_id: COMMS_PILOT
        capabilities: [COMMUNICATION]
        handoff_targets: [CONDUCTOR, SAFETY_AUDITOR]
    """
    
    async def _handle_send_sms(self, ctx: Any, args: str) -> str:
        """Handler for send_sms tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("send_sms", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"send_sms execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_configure_daily_checkin(self, ctx: Any, args: str) -> str:
        """Handler for configure_daily_checkin tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("configure_daily_checkin", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"configure_daily_checkin execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_get_daily_checkin_status(self, ctx: Any, args: str) -> str:
        """Handler for get_daily_checkin_status tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("get_daily_checkin_status", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"get_daily_checkin_status execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_stop_daily_checkin(self, ctx: Any, args: str) -> str:
        """Handler for stop_daily_checkin tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("stop_daily_checkin", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"stop_daily_checkin execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    async def _handle_send_checkin_now(self, ctx: Any, args: str) -> str:
        """Handler for send_checkin_now tool - routes through Node.js bridge."""
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({"success": False, "error": f"Invalid JSON arguments: {str(e)}"})
        
        try:
            result = await self.bridge.execute_tool("send_checkin_now", arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"send_checkin_now execution failed: {e}")
            return json.dumps({"success": False, "error": f"Tool execution failed: {str(e)}"})
    
    def __init__(self):
        """Initialize the Comms Pilot agent with its tools and configuration."""
        tool_definitions = [
            ToolDefinition(
                name="send_sms",
                description="Send an SMS text message to any phone number. REQUIRES ADMIN PERMISSION. Use this when asked to text someone, send a message to someone, or notify someone via SMS.",
                parameters={
                    "type": "object",
                    "properties": {
                        "phone_number": {
                            "type": "string",
                            "description": "The phone number to send the SMS to. Include country code (e.g., '+16175551234'). If just 10 digits provided, assume +1 for US.",
                        },
                        "message": {
                            "type": "string",
                            "description": "The text message to send.",
                        },
                    },
                    "required": ["phone_number", "message"],
                },
                handler=self._handle_send_sms,
            ),
            ToolDefinition(
                name="configure_daily_checkin",
                description="Set up daily check-in texts. ZEKE will text the user once per day at the specified time with 3 multiple choice questions to better understand them. Use when user asks for daily questions, wants ZEKE to learn about them via text, or asks to set up a daily check-in.",
                parameters={
                    "type": "object",
                    "properties": {
                        "phone_number": {
                            "type": "string",
                            "description": "The phone number to send daily check-in texts to. Include country code (e.g., '+16175551234').",
                        },
                        "time": {
                            "type": "string",
                            "description": "Time to send daily check-in in 24-hour format HH:MM (e.g., '09:00' for 9am, '18:30' for 6:30pm). Defaults to 09:00 if not specified.",
                        },
                    },
                    "required": ["phone_number"],
                },
                handler=self._handle_configure_daily_checkin,
            ),
            ToolDefinition(
                name="get_daily_checkin_status",
                description="Get the current status of Nate's daily check-in configuration. Shows whether it's enabled, the scheduled time, and target phone number.",
                parameters={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
                handler=self._handle_get_daily_checkin_status,
            ),
            ToolDefinition(
                name="stop_daily_checkin",
                description="Stop the daily check-in SMS messages. Disables the automated daily check-in.",
                parameters={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
                handler=self._handle_stop_daily_checkin,
            ),
            ToolDefinition(
                name="send_checkin_now",
                description="Send a daily check-in immediately (for testing or if user wants questions right now).",
                parameters={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
                handler=self._handle_send_checkin_now,
            ),
        ]
        
        super().__init__(
            agent_id=AgentId.COMMS_PILOT,
            name="Communications Pilot",
            description="ZEKE's SMS and messaging specialist. Handles authorized communications with strict permission enforcement.",
            instructions=COMMS_PILOT_INSTRUCTIONS,
            capabilities=[CapabilityCategory.COMMUNICATION],
            tools=tool_definitions,
            handoff_targets=[
                AgentId.CONDUCTOR,
                AgentId.SAFETY_AUDITOR,
            ],
        )
    
    async def send_sms(
        self,
        phone_number: str,
        message: str,
        context: AgentContext | None = None
    ) -> SmsResult:
        """
        Send an SMS message with permission verification.
        
        This method handles the full SMS sending flow including
        phone number formatting and error handling.
        
        Args:
            phone_number: Recipient phone number (with or without country code)
            message: Message content to send
            context: Optional context for permission verification
            
        Returns:
            SmsResult: Result of the SMS send operation
        """
        try:
            result = await self.bridge.execute_tool("send_sms", {
                "phone_number": phone_number,
                "message": message,
            })
            
            if result.get("success"):
                return SmsResult(
                    success=True,
                    to=phone_number,
                    message_sid=result.get("messageSid"),
                )
            else:
                return SmsResult(
                    success=False,
                    to=phone_number,
                    error=result.get("error", "Unknown error"),
                )
        except Exception as e:
            logger.error(f"Failed to send SMS to {phone_number}: {e}")
            return SmsResult(
                success=False,
                to=phone_number,
                error=str(e),
            )
    
    async def get_checkin_status(self) -> CheckInConfig:
        """
        Get current daily check-in configuration.
        
        Returns:
            CheckInConfig: Current check-in settings
        """
        try:
            result = await self.bridge.execute_tool("get_daily_checkin_status", {})
            
            if result.get("success"):
                config = result.get("config", {})
                return CheckInConfig(
                    enabled=config.get("enabled", False),
                    time=config.get("time", "09:00"),
                    phone_number=config.get("phoneNumber"),
                    message_template=config.get("messageTemplate"),
                )
            else:
                return CheckInConfig(enabled=False)
        except Exception as e:
            logger.error(f"Failed to get check-in status: {e}")
            return CheckInConfig(enabled=False)
    
    async def configure_checkin(
        self,
        time: str,
        phone_number: str,
        message: str | None = None
    ) -> dict[str, Any]:
        """
        Configure daily check-in settings.
        
        Args:
            time: Check-in time in HH:MM format
            phone_number: Phone number to send check-ins to
            message: Optional custom message template
            
        Returns:
            dict: Configuration result
        """
        try:
            args: dict[str, Any] = {
                "time": time,
                "phone_number": phone_number,
            }
            if message:
                args["message"] = message
            
            result = await self.bridge.execute_tool("configure_daily_checkin", args)
            return result
        except Exception as e:
            logger.error(f"Failed to configure check-in: {e}")
            return {"success": False, "error": str(e)}
    
    async def stop_checkin(self) -> dict[str, Any]:
        """
        Stop daily check-in messages.
        
        Returns:
            dict: Result of stopping check-ins
        """
        try:
            result = await self.bridge.execute_tool("stop_daily_checkin", {})
            return result
        except Exception as e:
            logger.error(f"Failed to stop check-in: {e}")
            return {"success": False, "error": str(e)}
    
    async def send_checkin_now(self) -> SmsResult:
        """
        Send an immediate check-in message.
        
        Triggers a daily check-in right now instead of waiting for the scheduled time.
            
        Returns:
            SmsResult: Result of sending the check-in
        """
        try:
            result = await self.bridge.execute_tool("send_checkin_now", {})
            
            if result.get("success"):
                return SmsResult(
                    success=True,
                    to=result.get("to", ""),
                    message_sid=result.get("messageSid"),
                )
            else:
                return SmsResult(
                    success=False,
                    to="",
                    error=result.get("error", "Unknown error"),
                )
        except Exception as e:
            logger.error(f"Failed to send check-in now: {e}")
            return SmsResult(
                success=False,
                to="",
                error=str(e),
            )
    
    def should_handoff_to_safety(self, context: AgentContext) -> bool:
        """
        Determine if a request should be handed off to Safety Auditor.
        
        This checks whether the communication request needs additional
        permission verification before proceeding.
        
        Args:
            context: Current request context
            
        Returns:
            bool: True if Safety Auditor review is needed
        """
        if context.phone_number:
            return True
        
        metadata = context.metadata
        if metadata.get("source") == "sms":
            return True
        
        if not metadata.get("is_admin", False):
            return True
        
        return False
    
    def verify_permissions(self, context: AgentContext) -> tuple[bool, str | None]:
        """
        Verify the request has required permissions for communication tools.
        
        All communication tools require admin permissions. This method checks
        the context metadata to verify the request is authorized.
        
        Authorization rules (in order of precedence):
        1. is_admin=True in metadata grants immediate access
        2. Web requests require EITHER is_admin=True OR trusted_single_user_deployment=True
        3. SMS requests require sender_is_admin=True
        4. All other requests are denied by default
        
        For ZEKE's single-user deployment, the Node.js bridge should inject
        trusted_single_user_deployment=True for web requests to indicate the
        web UI is a trusted admin interface.
        
        Args:
            context: Current request context
            
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
            return False, "Web request requires admin authorization. Set is_admin=True or trusted_single_user_deployment=True in metadata."
        
        if source == "sms":
            sender = context.phone_number
            if sender and metadata.get("sender_is_admin", False):
                return True, None
            return False, f"SMS sender {sender or 'unknown'} is not authorized for outbound communication. Only admin users can trigger SMS sending."
        
        return False, "Communication tools require admin permissions. Authorization could not be verified."
    
    async def _execute(self, input_text: str, context: AgentContext) -> str:
        """
        Execute the Comms Pilot agent's main logic.
        
        This method processes communication requests, verifying permissions
        and executing the appropriate tools.
        
        Args:
            input_text: The user's input message
            context: Context for the request
            
        Returns:
            str: The agent's response
        """
        self.status = AgentStatus.PROCESSING
        
        try:
            is_authorized, error_msg = self.verify_permissions(context)
            if not is_authorized:
                self.status = AgentStatus.IDLE
                return f"Permission denied: {error_msg}"
            
            full_instructions = self.instructions
            
            if context.user_profile:
                full_instructions += f"\n\nUser Profile Context:\n{json.dumps(context.user_profile, indent=2)}"
            
            if context.metadata.get("source"):
                full_instructions += f"\n\nRequest Source: {context.metadata.get('source')}"
            if context.phone_number:
                full_instructions += f"\nSender Phone: {context.phone_number}"
            
            full_instructions += "\n\nPermission Status: AUTHORIZED - Admin access verified"
            
            from agents import Agent, Runner
            
            agent = Agent(
                name=self.name,
                instructions=full_instructions,
                tools=self.tools,
            )
            
            result = await Runner.run(agent, input_text)
            
            self.status = AgentStatus.IDLE
            return result.final_output
            
        except Exception as e:
            self.status = AgentStatus.ERROR
            logger.error(f"CommsPilot execution error: {e}")
            raise


_comms_pilot_instance: CommsPilotAgent | None = None


def get_comms_pilot() -> CommsPilotAgent:
    """
    Get the singleton Comms Pilot agent instance.
    
    Returns:
        CommsPilotAgent: The Comms Pilot agent instance
    """
    global _comms_pilot_instance
    if _comms_pilot_instance is None:
        _comms_pilot_instance = CommsPilotAgent()
    return _comms_pilot_instance

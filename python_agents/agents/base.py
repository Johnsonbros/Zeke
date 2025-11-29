"""
Base agent class for ZEKE's multi-agent architecture.

This module defines the abstract base agent class that all specialized
agents inherit from. It provides common functionality for:
- Agent identification and configuration
- Tool management and execution
- Handoff protocols for inter-agent communication
- Integration with OpenAI Agents SDK
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable
import logging
import json

from agents import Agent, Runner
from agents.tool import Tool, FunctionTool

from ..bridge import get_bridge, NodeBridge
from ..tracing import TraceContext, get_tracing_logger, create_trace_context


logger = logging.getLogger(__name__)
trace_logger = get_tracing_logger()


def create_bridge_tool(
    tool_name: str,
    description: str,
    parameters: dict[str, Any],
) -> Tool:
    """
    Factory function to create an OpenAI Agents SDK Tool that calls Node.js via the bridge.
    
    This allows specialist agents to easily define tools that execute on the Node.js
    backend without duplicating the bridge handling code.
    
    Args:
        tool_name: Name of the tool (must match a tool registered in Node.js)
        description: Human-readable description of what the tool does
        parameters: JSON schema for the tool's parameters
        
    Returns:
        Tool: An OpenAI Agents SDK FunctionTool configured to call the bridge
        
    Example:
        # Create a tool that calls the Node.js 'send_sms' capability
        send_sms_tool = create_bridge_tool(
            tool_name="send_sms",
            description="Send an SMS message to a phone number",
            parameters={
                "type": "object",
                "properties": {
                    "to": {"type": "string", "description": "Phone number"},
                    "message": {"type": "string", "description": "Message text"},
                },
                "required": ["to", "message"],
            }
        )
    """
    async def bridge_handler(ctx: Any, args: str) -> str:
        """
        Handler that routes tool invocations through the Node.js bridge.
        
        Args:
            ctx: Tool context from OpenAI Agents SDK
            args: JSON string of arguments
            
        Returns:
            str: JSON string of the tool result
        """
        try:
            arguments = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError as e:
            return json.dumps({
                "success": False,
                "error": f"Invalid JSON arguments: {str(e)}"
            })
        
        try:
            bridge = get_bridge()
            result = await bridge.execute_tool(tool_name, arguments)
            return json.dumps(result)
        except Exception as e:
            logger.error(f"Bridge tool '{tool_name}' execution failed: {e}")
            return json.dumps({
                "success": False,
                "error": f"Tool execution failed: {str(e)}"
            })
    
    return FunctionTool(
        name=tool_name,
        description=description,
        params_json_schema=parameters,
        on_invoke_tool=bridge_handler,
    )


class AgentId(str, Enum):
    """Unique identifiers for each agent in the system."""
    CONDUCTOR = "conductor"
    MEMORY_CURATOR = "memory_curator"
    COMMS_PILOT = "comms_pilot"
    OPS_PLANNER = "ops_planner"
    RESEARCH_SCOUT = "research_scout"
    PERSONAL_DATA_STEWARD = "personal_data_steward"
    SAFETY_AUDITOR = "safety_auditor"


class AgentStatus(str, Enum):
    """Current operational state of an agent."""
    IDLE = "idle"
    PROCESSING = "processing"
    WAITING_FOR_HANDOFF = "waiting_for_handoff"
    ERROR = "error"


class CapabilityCategory(str, Enum):
    """High-level capability categories."""
    COMMUNICATION = "communication"
    SCHEDULING = "scheduling"
    TASK_MANAGEMENT = "task_management"
    INFORMATION = "information"
    MEMORY = "memory"
    GROCERY = "grocery"
    PROFILE = "profile"
    SYSTEM = "system"


class HandoffReason(str, Enum):
    """Reasons for initiating a handoff."""
    CAPABILITY_REQUIRED = "capability_required"
    TASK_CONTINUATION = "task_continuation"
    MULTI_STEP_WORKFLOW = "multi_step_workflow"
    ERROR_ESCALATION = "error_escalation"
    SAFETY_CHECK = "safety_check"
    MEMORY_NEEDED = "memory_needed"


@dataclass
class ToolDefinition:
    """
    Definition of a tool available to an agent.
    
    Attributes:
        name: Unique name of the tool
        description: Human-readable description
        parameters: JSON schema for tool parameters
        handler: Optional local handler function
    """
    name: str
    description: str
    parameters: dict[str, Any]
    handler: Callable[..., Any] | None = None


@dataclass
class HandoffRequest:
    """
    Request to hand off processing to another agent.
    
    Attributes:
        source_agent: ID of the agent initiating the handoff
        target_agent: ID of the agent receiving the handoff
        reason: Reason for the handoff
        context: Contextual data to pass to the target agent
        message: Human-readable message about the handoff
    """
    source_agent: AgentId
    target_agent: AgentId
    reason: HandoffReason
    context: dict[str, Any] = field(default_factory=dict)
    message: str = ""


@dataclass
class AgentContext:
    """
    Context passed to an agent for processing.
    
    Attributes:
        conversation_id: Optional conversation ID
        user_message: The user's input message
        memory_context: Retrieved memory context
        user_profile: User profile information
        phone_number: Optional phone number for SMS context
        metadata: Additional metadata
        trace_context: Optional tracing context for audit logging
    """
    user_message: str
    conversation_id: str | None = None
    memory_context: dict[str, Any] = field(default_factory=dict)
    user_profile: dict[str, Any] = field(default_factory=dict)
    phone_number: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    trace_context: TraceContext | None = None
    
    def ensure_trace_context(self) -> TraceContext:
        """Get or create a trace context for this request."""
        if self.trace_context is None:
            self.trace_context = create_trace_context({
                "conversation_id": self.conversation_id,
                "source": self.metadata.get("source", "unknown")
            })
        return self.trace_context


class BaseAgent(ABC):
    """
    Abstract base class for all ZEKE agents.
    
    Provides common functionality for agent identification, tool management,
    and handoff protocols. All specialized agents should inherit from this
    class and implement the abstract methods.
    
    Attributes:
        agent_id: Unique identifier for this agent
        name: Human-readable name
        description: Description of the agent's responsibilities
        instructions: System instructions for the agent
        capabilities: List of capability categories this agent owns
        tools: List of tools available to this agent
        handoff_targets: List of agents this agent can hand off to
        status: Current operational status
    """
    
    def __init__(
        self,
        agent_id: AgentId,
        name: str,
        description: str,
        instructions: str,
        capabilities: list[CapabilityCategory] | None = None,
        tools: list[ToolDefinition] | None = None,
        handoff_targets: list[AgentId] | None = None,
    ):
        """
        Initialize the base agent.
        
        Args:
            agent_id: Unique identifier for this agent
            name: Human-readable name
            description: Description of the agent's responsibilities
            instructions: System instructions for the agent
            capabilities: List of capability categories this agent owns
            tools: List of tools available to this agent
            handoff_targets: List of agents this agent can hand off to
        """
        self.agent_id = agent_id
        self.name = name
        self.description = description
        self.instructions = instructions
        self.capabilities = capabilities or []
        self._tool_definitions = tools or []
        self.handoff_targets = handoff_targets or []
        self.status = AgentStatus.IDLE
        self._bridge: NodeBridge | None = None
        self._openai_agent: Agent | None = None
    
    @property
    def bridge(self) -> NodeBridge:
        """Get the Node.js bridge client."""
        if self._bridge is None:
            self._bridge = get_bridge()
        return self._bridge
    
    @property
    def tools(self) -> list[Tool]:
        """
        Get the list of tools as OpenAI Agent SDK Tool objects.
        
        Returns:
            list[Tool]: Tools available to this agent
        """
        sdk_tools: list[Tool] = []
        for tool_def in self._tool_definitions:
            if tool_def.handler:
                sdk_tools.append(
                    FunctionTool(
                        name=tool_def.name,
                        description=tool_def.description,
                        params_json_schema=tool_def.parameters,
                        on_invoke_tool=tool_def.handler,
                    )
                )
        return sdk_tools
    
    def _create_openai_agent(self) -> Agent:
        """
        Create the OpenAI Agents SDK agent instance.
        
        Returns:
            Agent: Configured OpenAI agent
        """
        return Agent(
            name=self.name,
            instructions=self.instructions,
            tools=self.tools,
        )
    
    @property
    def openai_agent(self) -> Agent:
        """Get or create the OpenAI agent instance."""
        if self._openai_agent is None:
            self._openai_agent = self._create_openai_agent()
        return self._openai_agent
    
    async def run(self, input_text: str, context: AgentContext | None = None) -> str:
        """
        Run the agent with the given input.
        
        Args:
            input_text: The user's input message
            context: Optional context for the agent
            
        Returns:
            str: The agent's response
        """
        if context is None:
            context = AgentContext(user_message=input_text)
        
        trace_ctx = context.ensure_trace_context()
        span_id = trace_ctx.create_span(f"agent:{self.agent_id.value}")
        trace_logger.log_agent_start(trace_ctx, self.agent_id.value, span_id=span_id)
        
        self.status = AgentStatus.PROCESSING
        try:
            result = await self._execute(input_text, context)
            self.status = AgentStatus.IDLE
            
            result_str = str(result) if result is not None else ""
            result_preview = result_str[:100] if len(result_str) > 100 else result_str
            
            trace_logger.log_agent_complete(
                trace_ctx, 
                self.agent_id.value, 
                result_preview=result_preview,
                span_id=span_id
            )
            return result_str
        except Exception as e:
            self.status = AgentStatus.ERROR
            logger.error(f"Agent {self.name} error: {e}")
            trace_logger.log_agent_error(trace_ctx, self.agent_id.value, str(e), span_id)
            raise
    
    @abstractmethod
    async def _execute(self, input_text: str, context: AgentContext) -> str:
        """
        Execute the agent's main logic.
        
        This method must be implemented by subclasses to define
        the agent's specific behavior.
        
        Args:
            input_text: The user's input message
            context: Context for the agent
            
        Returns:
            str: The agent's response
        """
        pass
    
    def handoff_to(
        self, 
        target_agent: AgentId, 
        reason: HandoffReason, 
        context: dict[str, Any] | None = None, 
        message: str = "",
        agent_context: AgentContext | None = None
    ) -> HandoffRequest:
        """
        Create a handoff request to another agent.
        
        Args:
            target_agent: ID of the agent to hand off to
            reason: Reason for the handoff
            context: Context to pass to the target agent
            message: Human-readable message about the handoff
            agent_context: Optional agent context for tracing
            
        Returns:
            HandoffRequest: The handoff request object
            
        Raises:
            ValueError: If the target agent is not in handoff_targets
        """
        if target_agent not in self.handoff_targets:
            raise ValueError(
                f"Agent {self.name} cannot hand off to {target_agent}. "
                f"Allowed targets: {self.handoff_targets}"
            )
        
        if agent_context and agent_context.trace_context:
            trace_logger.log_handoff(
                agent_context.trace_context,
                from_agent=self.agent_id.value,
                to_agent=target_agent.value,
                reason=reason.value,
                message=message
            )
        
        self.status = AgentStatus.WAITING_FOR_HANDOFF
        
        return HandoffRequest(
            source_agent=self.agent_id,
            target_agent=target_agent,
            reason=reason,
            context=context or {},
            message=message,
        )
    
    def complete_handoff(
        self,
        handoff_request: HandoffRequest,
        success: bool,
        agent_context: AgentContext | None = None
    ) -> None:
        """
        Mark a handoff as complete and log the completion.
        
        Args:
            handoff_request: The original handoff request
            success: Whether the handoff was successful
            agent_context: Optional agent context for tracing
        """
        self.status = AgentStatus.IDLE
        
        if agent_context and agent_context.trace_context:
            trace_logger.log_handoff_complete(
                agent_context.trace_context,
                from_agent=handoff_request.source_agent.value,
                to_agent=handoff_request.target_agent.value,
                success=success
            )
    
    async def execute_bridge_tool(
        self, 
        tool_name: str, 
        arguments: dict[str, Any],
        context: AgentContext | None = None
    ) -> dict[str, Any]:
        """
        Execute a tool through the Node.js bridge with optional tracing.
        
        Args:
            tool_name: Name of the tool to execute
            arguments: Arguments for the tool
            context: Optional agent context for tracing
            
        Returns:
            dict: Tool execution result
        """
        span_id = None
        if context and context.trace_context:
            _, span_id = trace_logger.log_tool_start(
                context.trace_context,
                tool_name,
                agent_id=self.agent_id.value,
                args_preview=json.dumps(arguments)[:200] if arguments else ""
            )
        
        try:
            result = await self.bridge.execute_tool(tool_name, arguments)
            
            if context and context.trace_context and span_id:
                success = result.get("success", True) if isinstance(result, dict) else True
                trace_logger.log_tool_complete(
                    context.trace_context,
                    tool_name,
                    span_id,
                    agent_id=self.agent_id.value,
                    result_preview=json.dumps(result)[:200] if result else "",
                    success=success
                )
            
            return result
        except Exception as e:
            if context and context.trace_context and span_id:
                trace_logger.log_tool_error(
                    context.trace_context,
                    tool_name,
                    span_id,
                    str(e),
                    agent_id=self.agent_id.value
                )
            raise
    
    def can_handle_capability(self, category: CapabilityCategory) -> bool:
        """
        Check if this agent can handle a capability category.
        
        Args:
            category: The capability category to check
            
        Returns:
            bool: True if this agent owns the capability
        """
        return category in self.capabilities
    
    def to_dict(self) -> dict[str, Any]:
        """
        Serialize the agent to a dictionary.
        
        Returns:
            dict: Agent information as a dictionary
        """
        return {
            "agent_id": self.agent_id.value,
            "name": self.name,
            "description": self.description,
            "capabilities": [c.value for c in self.capabilities],
            "tools": [t.name for t in self._tool_definitions],
            "handoff_targets": [t.value for t in self.handoff_targets],
            "status": self.status.value,
        }

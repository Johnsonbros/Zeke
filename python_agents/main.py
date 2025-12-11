"""
FastAPI application entry point for ZEKE Python Agents microservice.

This module provides the FastAPI application with:
- Health check endpoint at /health
- Chat endpoint at /api/agents/chat for routing to Conductor
- CORS configured for localhost Node.js service
- Environment variable loading for configuration
- Request-level tracing and audit logging
"""

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .config import get_settings
from .bridge import get_bridge
from .tracing import create_trace_context, get_tracing_logger
from .agents import (
    AgentContext,
    ConductorAgent,
    get_conductor,
    get_memory_curator,
    get_comms_pilot,
    get_ops_planner,
    get_research_scout,
    get_safety_auditor,
    get_omi_analyst,
    get_foresight_strategist,
)

logger = logging.getLogger(__name__)
trace_logger = get_tracing_logger()

_specialists_registered = False


def get_configured_conductor() -> ConductorAgent:
    """
    Get the Conductor agent with all specialists registered.
    
    Uses lazy initialization to register specialists only once.
    
    Returns:
        ConductorAgent: The conductor with all specialists registered
    """
    global _specialists_registered
    
    conductor = get_conductor()
    
    if not _specialists_registered:
        conductor.register_specialist(get_memory_curator())
        conductor.register_specialist(get_comms_pilot())
        conductor.register_specialist(get_ops_planner())
        conductor.register_specialist(get_research_scout())
        conductor.register_specialist(get_safety_auditor())
        conductor.register_specialist(get_omi_analyst())
        conductor.register_specialist(get_foresight_strategist())
        _specialists_registered = True
        logger.info("All specialist agents registered with conductor")
    
    return conductor


class ChatRequest(BaseModel):
    """Request model for the chat endpoint."""
    message: str = Field(..., min_length=1, description="The user's message")
    conversation_id: str | None = Field(None, description="Optional conversation ID")
    phone_number: str | None = Field(None, description="Optional phone number for SMS context")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class ChatResponse(BaseModel):
    """Response model for the chat endpoint."""
    response: str = Field(..., description="The agent's response")
    agent_id: str = Field(..., description="ID of the responding agent")
    conversation_id: str | None = Field(None, description="Conversation ID")
    trace_id: str | None = Field(None, description="Trace ID for debugging")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class HealthResponse(BaseModel):
    """Response model for health check endpoint."""
    status: str = Field(..., description="Health status")
    service: str = Field(..., description="Service name")
    version: str = Field(..., description="Service version")
    node_bridge_status: str = Field(..., description="Node.js bridge connection status")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    
    Handles startup and shutdown events.
    """
    settings = get_settings()
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    logger.info(f"Starting ZEKE Python Agents on port {settings.python_agents_port}")
    logger.info(f"Node.js bridge URL: {settings.node_bridge_url}")
    
    yield
    
    logger.info("Shutting down ZEKE Python Agents")


app = FastAPI(
    title="ZEKE Python Agents",
    description="Python-based multi-agent system for ZEKE personal AI assistant",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5000",
        "http://127.0.0.1:5000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """
    Health check endpoint.
    
    Returns the health status of the Python agents service
    and the connection status to the Node.js bridge.
    """
    bridge = get_bridge()
    
    bridge_result = await bridge.health_check()
    
    if bridge_result.get("http_ok") and bridge_result.get("json_ok"):
        node_status = "connected"
    elif bridge_result.get("http_ok"):
        node_status = "degraded"
        logger.warning(f"Node.js bridge returned non-JSON: {bridge_result.get('error')}")
    else:
        node_status = "disconnected"
        logger.warning(f"Node.js bridge health check failed: {bridge_result.get('error')}")
    
    return HealthResponse(
        status="healthy",
        service="zeke-python-agents",
        version="1.0.0",
        node_bridge_status=node_status,
    )


async def fetch_learned_preferences() -> str:
    """
    Fetch learned preferences from the feedback learning system.
    
    Returns:
        str: Formatted preferences prompt or empty string if none available
    """
    try:
        bridge = get_bridge()
        result = await bridge.call_api("GET", "/api/feedback/preferences/prompt")
        if result.get("success") and result.get("data", {}).get("hasPreferences"):
            return result["data"].get("prompt", "")
    except Exception as e:
        logger.debug(f"Could not fetch learned preferences: {e}")
    return ""


@app.post("/api/agents/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """
    Chat endpoint for the multi-agent system.
    
    Routes incoming messages to the Conductor agent which will
    classify the intent and delegate to appropriate specialist agents.
    
    Args:
        request: Chat request with user message and optional context
        
    Returns:
        ChatResponse: The agent's response with metadata
    """
    trace_ctx = create_trace_context({
        "conversation_id": request.conversation_id,
        "source": request.metadata.get("source", "api"),
        "phone_number": request.phone_number,
    })
    
    trace_logger.log_request_start(
        trace_ctx,
        source=request.metadata.get("source", "api"),
        user_message=request.message
    )
    
    try:
        logger.info(f"Received chat request: {request.message[:100]}... [trace_id={trace_ctx.trace_id}]")
        
        learned_preferences = await fetch_learned_preferences()
        
        metadata_with_preferences = dict(request.metadata)
        if learned_preferences:
            metadata_with_preferences["learned_preferences_prompt"] = learned_preferences
        
        context = AgentContext(
            user_message=request.message,
            conversation_id=request.conversation_id,
            phone_number=request.phone_number,
            metadata=metadata_with_preferences,
            trace_context=trace_ctx,
        )
        
        conductor = get_configured_conductor()
        
        response = await conductor.run(request.message, context)
        
        completion_status = conductor.get_completion_status()
        handoff_chain = conductor.get_handoff_chain()
        
        trace_logger.log_request_complete(
            trace_ctx,
            success=True,
            response_preview=response[:200] if response else ""
        )
        
        return ChatResponse(
            response=response,
            agent_id="conductor",
            conversation_id=request.conversation_id,
            trace_id=trace_ctx.trace_id,
            metadata={
                "processed_by": "python_agents",
                "completion_status": completion_status.value,
                "completion_message": conductor.last_completion_message,
                "handoff_chain": handoff_chain,
                "trace_summary": trace_ctx.to_summary(),
            }
        )
        
    except Exception as e:
        logger.error(f"Chat processing error: {e} [trace_id={trace_ctx.trace_id}]")
        trace_logger.log_request_complete(trace_ctx, success=False)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/agents/status")
async def get_agents_status() -> dict[str, Any]:
    """
    Get status of all registered agents.
    
    Returns:
        dict: Status information for each agent
    """
    from .agents import (
        get_conductor,
        get_memory_curator,
        get_comms_pilot,
        get_ops_planner,
        get_research_scout,
        get_safety_auditor,
    )
    
    agents_info = {}
    for get_agent, agent_name in [
        (get_conductor, "conductor"),
        (get_memory_curator, "memory_curator"),
        (get_comms_pilot, "comms_pilot"),
        (get_ops_planner, "ops_planner"),
        (get_research_scout, "research_scout"),
        (get_safety_auditor, "safety_auditor"),
    ]:
        try:
            agent = get_agent()
            agents_info[agent_name] = {
                "status": agent.status.value,
                "name": agent.name,
                "tool_count": len(agent._tool_definitions),
                "capabilities": [c.value for c in agent.capabilities],
            }
        except Exception as e:
            agents_info[agent_name] = {
                "status": "error",
                "error": str(e),
            }
    
    return {
        "agents": agents_info,
        "total_agents": len(agents_info),
        "service_status": "running",
        "tracing_enabled": True,
    }


if __name__ == "__main__":
    import uvicorn
    
    settings = get_settings()
    uvicorn.run(
        "python_agents.main:app",
        host="0.0.0.0",
        port=settings.python_agents_port,
        reload=True,
    )

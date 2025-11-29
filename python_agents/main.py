"""
FastAPI application entry point for ZEKE Python Agents microservice.

This module provides the FastAPI application with:
- Health check endpoint at /health
- Chat endpoint at /api/agents/chat for routing to Conductor
- CORS configured for localhost Node.js service
- Environment variable loading for configuration
"""

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .config import get_settings
from .bridge import get_bridge

logger = logging.getLogger(__name__)


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
    try:
        logger.info(f"Received chat request: {request.message[:100]}...")
        
        response = f"Python agents received: {request.message}"
        
        return ChatResponse(
            response=response,
            agent_id="conductor",
            conversation_id=request.conversation_id,
            metadata={
                "processed_by": "python_agents",
                "status": "stub_response",
            }
        )
        
    except Exception as e:
        logger.error(f"Chat processing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/agents/status")
async def get_agents_status() -> dict[str, Any]:
    """
    Get status of all registered agents.
    
    Returns:
        dict: Status information for each agent
    """
    return {
        "agents": {
            "conductor": {"status": "idle", "name": "Conductor"},
            "memory_curator": {"status": "idle", "name": "MemoryCurator"},
            "comms_pilot": {"status": "idle", "name": "CommsPilot"},
            "ops_planner": {"status": "idle", "name": "OpsPlanner"},
            "research_scout": {"status": "idle", "name": "ResearchScout"},
            "personal_data_steward": {"status": "idle", "name": "PersonalDataSteward"},
            "safety_auditor": {"status": "idle", "name": "SafetyAuditor"},
        },
        "total_agents": 7,
        "service_status": "running",
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

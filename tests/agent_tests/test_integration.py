"""
FastAPI integration tests for the Python agents microservice.

Tests the HTTP endpoints with mocked dependencies to verify:
- Health check endpoint functionality
- Chat endpoint with trace context
- Agent status endpoint
- Proper response formats and error handling
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from typing import Any

import httpx


class TestHealthEndpoint:
    """Tests for the /health endpoint."""
    
    @pytest.mark.asyncio
    async def test_health_check_healthy(self, test_client):
        """Health endpoint should return healthy status with connected bridge."""
        async with test_client as client:
            response = await client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "zeke-python-agents"
        assert data["version"] == "1.0.0"
        assert data["node_bridge_status"] == "connected"
    
    @pytest.mark.asyncio
    async def test_health_check_disconnected_bridge(self, test_client_with_error_bridge):
        """Health endpoint should report disconnected when bridge fails."""
        async with test_client_with_error_bridge as client:
            response = await client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["node_bridge_status"] == "disconnected"
    
    @pytest.mark.asyncio
    async def test_health_check_timeout_bridge(self, test_client_with_timeout_bridge):
        """Health endpoint should report disconnected on timeout."""
        async with test_client_with_timeout_bridge as client:
            response = await client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["node_bridge_status"] == "disconnected"
    
    @pytest.mark.asyncio
    async def test_health_check_degraded_bridge(self, mock_bridge):
        """Health endpoint should report degraded when JSON parsing fails."""
        async def mock_health_degraded() -> dict[str, Any]:
            return {"status": "degraded", "http_ok": True, "json_ok": False}
        
        mock_bridge.health_check = mock_health_degraded
        
        from python_agents.main import app
        
        with patch('python_agents.main.get_bridge', return_value=mock_bridge):
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app),
                base_url="http://test"
            ) as client:
                response = await client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["node_bridge_status"] == "degraded"


class TestChatEndpoint:
    """Tests for the /api/agents/chat endpoint."""
    
    @pytest.mark.asyncio
    async def test_chat_basic_request(self, test_client):
        """Chat endpoint should process basic requests."""
        async with test_client as client:
            response = await client.post(
                "/api/agents/chat",
                json={
                    "message": "What's the weather?",
                    "metadata": {"source": "web"}
                }
            )
        
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert "agent_id" in data
        assert data["agent_id"] == "conductor"
    
    @pytest.mark.asyncio
    async def test_chat_includes_trace_id(self, test_client):
        """Chat endpoint should include trace_id in response."""
        async with test_client as client:
            response = await client.post(
                "/api/agents/chat",
                json={
                    "message": "Send a text to mom",
                    "metadata": {"source": "web"}
                }
            )
        
        assert response.status_code == 200
        data = response.json()
        assert "trace_id" in data
        assert data["trace_id"] is not None
        assert len(data["trace_id"]) == 36
    
    @pytest.mark.asyncio
    async def test_chat_with_conversation_id(self, test_client):
        """Chat endpoint should preserve conversation_id."""
        conversation_id = "conv_test_12345"
        
        async with test_client as client:
            response = await client.post(
                "/api/agents/chat",
                json={
                    "message": "Hello there",
                    "conversation_id": conversation_id,
                    "metadata": {}
                }
            )
        
        assert response.status_code == 200
        data = response.json()
        assert data["conversation_id"] == conversation_id
    
    @pytest.mark.asyncio
    async def test_chat_with_phone_number(self, test_client):
        """Chat endpoint should accept phone_number for SMS context."""
        async with test_client as client:
            response = await client.post(
                "/api/agents/chat",
                json={
                    "message": "Check my schedule",
                    "phone_number": "+15551234567",
                    "metadata": {"source": "sms"}
                }
            )
        
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
    
    @pytest.mark.asyncio
    async def test_chat_includes_trace_summary(self, test_client):
        """Chat endpoint should include trace_summary in metadata."""
        async with test_client as client:
            response = await client.post(
                "/api/agents/chat",
                json={
                    "message": "Add milk to grocery list",
                    "metadata": {}
                }
            )
        
        assert response.status_code == 200
        data = response.json()
        assert "metadata" in data
        assert "trace_summary" in data["metadata"]
        trace_summary = data["metadata"]["trace_summary"]
        assert "trace_id" in trace_summary
        assert "duration_ms" in trace_summary
    
    @pytest.mark.asyncio
    async def test_chat_empty_message_rejected(self, test_client):
        """Chat endpoint should reject empty messages."""
        async with test_client as client:
            response = await client.post(
                "/api/agents/chat",
                json={
                    "message": "",
                    "metadata": {}
                }
            )
        
        assert response.status_code == 422
    
    @pytest.mark.asyncio
    async def test_chat_missing_message_rejected(self, test_client):
        """Chat endpoint should reject requests without message field."""
        async with test_client as client:
            response = await client.post(
                "/api/agents/chat",
                json={
                    "metadata": {"source": "web"}
                }
            )
        
        assert response.status_code == 422


class TestAgentStatusEndpoint:
    """Tests for the /api/agents/status endpoint."""
    
    @pytest.mark.asyncio
    async def test_status_returns_all_agents(self, test_client, mock_bridge):
        """Status endpoint should return info for all registered agents."""
        from python_agents.agents import (
            get_conductor,
            get_memory_curator,
            get_comms_pilot,
            get_ops_planner,
            get_research_scout,
            get_safety_auditor,
        )
        
        with patch('python_agents.main.get_bridge', return_value=mock_bridge):
            with patch('python_agents.bridge.get_bridge', return_value=mock_bridge):
                async with test_client as client:
                    response = await client.get("/api/agents/status")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "agents" in data
        assert "total_agents" in data
        assert "service_status" in data
        assert data["service_status"] == "running"
        assert data["tracing_enabled"] is True
        
        expected_agents = [
            "conductor", "memory_curator", "comms_pilot",
            "ops_planner", "research_scout", "safety_auditor"
        ]
        for agent_name in expected_agents:
            assert agent_name in data["agents"], f"Missing agent: {agent_name}"
    
    @pytest.mark.asyncio
    async def test_status_agent_info_structure(self, test_client, mock_bridge):
        """Each agent in status should have expected fields."""
        with patch('python_agents.main.get_bridge', return_value=mock_bridge):
            with patch('python_agents.bridge.get_bridge', return_value=mock_bridge):
                async with test_client as client:
                    response = await client.get("/api/agents/status")
        
        assert response.status_code == 200
        data = response.json()
        
        for agent_name, agent_info in data["agents"].items():
            if "error" not in agent_info:
                assert "status" in agent_info, f"{agent_name} missing status"
                assert "name" in agent_info, f"{agent_name} missing name"
                assert "tool_count" in agent_info, f"{agent_name} missing tool_count"
                assert "capabilities" in agent_info, f"{agent_name} missing capabilities"


class TestTraceContextPropagation:
    """Tests for trace context propagation through endpoints."""
    
    @pytest.mark.asyncio
    async def test_trace_id_unique_per_request(self, test_client):
        """Each request should get a unique trace_id."""
        trace_ids = set()
        
        async with test_client as client:
            for i in range(5):
                response = await client.post(
                    "/api/agents/chat",
                    json={"message": f"Request {i}", "metadata": {}}
                )
                assert response.status_code == 200
                trace_ids.add(response.json()["trace_id"])
        
        assert len(trace_ids) == 5
    
    @pytest.mark.asyncio
    async def test_trace_context_in_metadata(self, test_client):
        """Trace context should be included in response metadata."""
        async with test_client as client:
            response = await client.post(
                "/api/agents/chat",
                json={
                    "message": "Test trace context",
                    "conversation_id": "conv_trace_test",
                    "metadata": {"source": "api"}
                }
            )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["trace_id"] is not None
        assert data["metadata"]["trace_summary"]["trace_id"] == data["trace_id"]


class TestEndpointErrorHandling:
    """Tests for endpoint-level error handling."""
    
    @pytest.mark.asyncio
    async def test_invalid_json_returns_422(self, test_client):
        """Invalid JSON should return 422 Unprocessable Entity."""
        async with test_client as client:
            response = await client.post(
                "/api/agents/chat",
                content="not valid json",
                headers={"Content-Type": "application/json"}
            )
        
        assert response.status_code == 422
    
    @pytest.mark.asyncio
    async def test_missing_required_field_returns_422(self, test_client):
        """Missing required fields should return 422."""
        async with test_client as client:
            response = await client.post(
                "/api/agents/chat",
                json={}
            )
        
        assert response.status_code == 422
    
    @pytest.mark.asyncio
    async def test_health_always_returns_200(self, test_client_with_error_bridge):
        """Health endpoint should always return 200 even if dependencies fail."""
        async with test_client_with_error_bridge as client:
            response = await client.get("/health")
        
        assert response.status_code == 200


class TestCORSConfiguration:
    """Tests for CORS configuration."""
    
    @pytest.mark.asyncio
    async def test_cors_headers_present(self, test_client):
        """CORS headers should be present in response."""
        async with test_client as client:
            response = await client.options(
                "/health",
                headers={
                    "Origin": "http://localhost:5000",
                    "Access-Control-Request-Method": "GET"
                }
            )
        
        assert "access-control-allow-origin" in response.headers
    
    @pytest.mark.asyncio
    async def test_allowed_origin_accepted(self, test_client):
        """Requests from allowed origins should include CORS headers."""
        async with test_client as client:
            response = await client.get(
                "/health",
                headers={"Origin": "http://localhost:5000"}
            )
        
        assert response.status_code == 200

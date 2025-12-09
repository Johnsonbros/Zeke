"""
HTTP client for communicating with the Node.js API bridge.

This module provides an async HTTP client that allows Python agents
to execute tools, retrieve memory context, and access user profile
data through the Node.js backend.
"""

import httpx
from typing import Any
from .config import get_settings


class NodeBridge:
    """
    Async HTTP client for the Node.js API bridge.
    
    Provides methods for Python agents to interact with the Node.js
    backend, including tool execution, memory retrieval, and profile access.
    
    Attributes:
        base_url: Base URL of the Node.js API
        bridge_key: Authentication key for bridge requests
        timeout: Request timeout in seconds
    """
    
    def __init__(self, base_url: str | None = None, bridge_key: str | None = None):
        """
        Initialize the Node.js bridge client.
        
        Args:
            base_url: Override for the Node.js API base URL
            bridge_key: Override for the bridge authentication key
        """
        settings = get_settings()
        self.base_url = base_url or settings.node_bridge_url
        self.bridge_key = bridge_key or settings.internal_bridge_key
        self.timeout = 30.0
    
    def _get_headers(self) -> dict[str, str]:
        """
        Get standard headers for bridge requests.
        
        Returns:
            dict: Headers including content type and authentication
        """
        headers = {
            "Content-Type": "application/json",
        }
        if self.bridge_key:
            headers["X-Internal-Api-Key"] = self.bridge_key
        return headers
    
    async def execute_tool(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """
        Execute a tool through the Node.js API bridge.
        
        Args:
            tool_name: Name of the tool to execute
            arguments: Arguments to pass to the tool
            
        Returns:
            dict: Tool execution result
            
        Raises:
            httpx.HTTPError: If the request fails
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/api/tools/execute",
                headers=self._get_headers(),
                json={
                    "tool_name": tool_name,
                    "arguments": arguments
                }
            )
            response.raise_for_status()
            return response.json()
    
    async def get_capabilities(self) -> dict[str, Any]:
        """
        Get available capabilities and tools from the Node.js API.
        
        Returns:
            dict: Available capabilities and their tools
            
        Raises:
            httpx.HTTPError: If the request fails
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.base_url}/api/tools/capabilities",
                headers=self._get_headers()
            )
            response.raise_for_status()
            return response.json()
    
    async def get_memory_context(self, query: str, limit: int = 10) -> dict[str, Any]:
        """
        Get semantic memory context for a query.
        
        Args:
            query: Search query for memory retrieval
            limit: Maximum number of memory items to return
            
        Returns:
            dict: Relevant memory context
            
        Raises:
            httpx.HTTPError: If the request fails
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/api/memory/context",
                headers=self._get_headers(),
                json={
                    "query": query,
                    "limit": limit
                }
            )
            response.raise_for_status()
            return response.json()
    
    async def get_user_profile(self) -> dict[str, Any]:
        """
        Get the user's profile information.
        
        Returns:
            dict: User profile data
            
        Raises:
            httpx.HTTPError: If the request fails
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.base_url}/api/user/profile",
                headers=self._get_headers()
            )
            response.raise_for_status()
            return response.json()
    
    async def get_context_bundle(
        self,
        domain: str,
        query: str = "",
        route: str = "/chat",
        conversation_id: str | None = None
    ) -> dict[str, Any]:
        """
        Get a curated context bundle from the Context Router.
        
        The Context Router provides domain-specific, token-efficient context
        bundles that contain relevant information for a particular domain
        (tasks, calendar, memory, etc.).
        
        Args:
            domain: The context domain to retrieve. Valid values:
                - "global": User profile essentials, timezone, current time
                - "memory": Semantic memories relevant to the query
                - "tasks": Task list with priorities and due dates
                - "calendar": Upcoming events and schedule
                - "grocery": Grocery list items
                - "locations": Saved places and current location
                - "omi": Recent Omi wearable recordings
                - "contacts": Contact information
                - "profile": Full user profile details
                - "conversation": Conversation summary and recent messages
            query: Optional query to tailor the context (for semantic search)
            route: Current app route for context prioritization (default: /chat)
            conversation_id: Optional conversation ID for conversation context
            
        Returns:
            dict: Context bundle with structure:
                - success: bool
                - bundle: {name, priority, content, tokenEstimate}
                - error: str (if failed)
                
        Raises:
            httpx.HTTPError: If the request fails
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            payload: dict[str, Any] = {
                "domain": domain,
                "query": query,
                "route": route,
            }
            if conversation_id:
                payload["conversationId"] = conversation_id
                
            response = await client.post(
                f"{self.base_url}/api/bridge/context-bundle",
                headers=self._get_headers(),
                json=payload
            )
            response.raise_for_status()
            return response.json()
    
    async def health_check(self) -> dict[str, Any]:
        """
        Check the health of the Node.js API.
        
        Handles non-JSON responses gracefully by returning a partial success
        if the HTTP request succeeds but JSON parsing fails.
        
        Returns:
            dict: Health status of the Node.js service with keys:
                - status: "healthy", "degraded", or "unhealthy"
                - service: Service name (if available)
                - http_ok: Whether HTTP request succeeded
                - json_ok: Whether JSON parsing succeeded
                - error: Error message (if any)
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/health",
                    headers=self._get_headers()
                )
                
                http_ok = response.status_code >= 200 and response.status_code < 300
                
                try:
                    data = response.json()
                    return {
                        "status": data.get("status", "healthy") if http_ok else "unhealthy",
                        "service": data.get("service", "zeke-node"),
                        "http_ok": http_ok,
                        "json_ok": True,
                    }
                except Exception:
                    if http_ok:
                        return {
                            "status": "degraded",
                            "service": "zeke-node",
                            "http_ok": True,
                            "json_ok": False,
                            "error": "Node.js responded but returned non-JSON response",
                        }
                    else:
                        return {
                            "status": "unhealthy",
                            "service": "zeke-node",
                            "http_ok": False,
                            "json_ok": False,
                            "error": f"HTTP {response.status_code}: {response.text[:100]}",
                        }
        except httpx.ConnectError as e:
            return {
                "status": "unhealthy",
                "service": "zeke-node",
                "http_ok": False,
                "json_ok": False,
                "error": f"Connection failed: {str(e)}",
            }
        except httpx.TimeoutException as e:
            return {
                "status": "unhealthy",
                "service": "zeke-node",
                "http_ok": False,
                "json_ok": False,
                "error": f"Request timed out: {str(e)}",
            }
        except Exception as e:
            return {
                "status": "unhealthy",
                "service": "zeke-node",
                "http_ok": False,
                "json_ok": False,
                "error": f"Unexpected error: {str(e)}",
            }


_bridge_instance: NodeBridge | None = None


def get_bridge() -> NodeBridge:
    """
    Get singleton NodeBridge instance.
    
    Returns:
        NodeBridge: The shared bridge instance
    """
    global _bridge_instance
    if _bridge_instance is None:
        _bridge_instance = NodeBridge()
    return _bridge_instance

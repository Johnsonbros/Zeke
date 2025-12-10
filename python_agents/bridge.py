"""
HTTP client for communicating with the Node.js API bridge.

This module provides an async HTTP client that allows Python agents
to execute tools, retrieve memory context, and access user profile
data through the Node.js backend.

Features:
- LRU caching for read-only operations with configurable TTL
- Retry logic with exponential backoff for transient failures
- Configurable timeouts per operation type
"""

import asyncio
import hashlib
import json
import logging
import time
import httpx
from typing import Any
from .config import get_settings

logger = logging.getLogger(__name__)

CACHEABLE_TOOLS = frozenset({
    "get_user_profile",
    "check_omi_status",
    "get_weather",
    "get_current_time",
    "get_daily_checkin_status",
    "list_tasks",
    "get_calendar_events",
    "get_grocery_list",
    "get_contacts",
})

MUTATING_TOOLS = frozenset({
    "send_sms",
    "add_task",
    "complete_task",
    "add_calendar_event",
    "delete_calendar_event",
    "add_grocery_item",
    "remove_grocery_item",
    "add_contact",
    "update_contact",
    "save_memory",
    "delete_memory",
    "configure_daily_checkin",
    "send_checkin_now",
})


class CacheEntry:
    """A single cache entry with expiration tracking."""
    
    def __init__(self, value: Any, ttl_seconds: float):
        self.value = value
        self.expires_at = time.monotonic() + ttl_seconds
    
    def is_expired(self) -> bool:
        return time.monotonic() > self.expires_at


class TTLCache:
    """
    Simple in-memory LRU cache with TTL expiration.
    
    Provides fast lookups with automatic expiration and size limits.
    Tracks tool names separately to enable per-tool invalidation.
    Thread-safe for single-threaded async usage.
    """
    
    def __init__(self, max_size: int = 100, default_ttl: float = 60.0):
        self._cache: dict[str, CacheEntry] = {}
        self._tool_keys: dict[str, set[str]] = {}
        self._max_size = max_size
        self._default_ttl = default_ttl
        self._hits = 0
        self._misses = 0
    
    def _make_key(self, tool_name: str, arguments: dict[str, Any]) -> str:
        """Generate a cache key from tool name and arguments."""
        args_str = json.dumps(arguments, sort_keys=True)
        hash_input = f"{tool_name}:{args_str}"
        return hashlib.md5(hash_input.encode()).hexdigest()
    
    def get(self, tool_name: str, arguments: dict[str, Any]) -> Any | None:
        """Get a cached value if it exists and hasn't expired."""
        key = self._make_key(tool_name, arguments)
        entry = self._cache.get(key)
        
        if entry is None:
            self._misses += 1
            return None
        
        if entry.is_expired():
            del self._cache[key]
            if tool_name in self._tool_keys:
                self._tool_keys[tool_name].discard(key)
            self._misses += 1
            return None
        
        self._hits += 1
        return entry.value
    
    def set(self, tool_name: str, arguments: dict[str, Any], value: Any, ttl: float | None = None) -> None:
        """Store a value in the cache with optional custom TTL."""
        if len(self._cache) >= self._max_size:
            self._evict_oldest()
        
        key = self._make_key(tool_name, arguments)
        self._cache[key] = CacheEntry(value, ttl or self._default_ttl)
        
        if tool_name not in self._tool_keys:
            self._tool_keys[tool_name] = set()
        self._tool_keys[tool_name].add(key)
    
    def _evict_oldest(self) -> None:
        """Remove the oldest entries to make room for new ones."""
        if not self._cache:
            return
        
        expired = [k for k, v in self._cache.items() if v.is_expired()]
        for k in expired[:10]:
            del self._cache[k]
        
        if len(self._cache) >= self._max_size:
            oldest_key = next(iter(self._cache))
            del self._cache[oldest_key]
    
    def invalidate(self, tool_name: str | None = None) -> int:
        """
        Invalidate cache entries.
        
        Args:
            tool_name: If provided, only invalidate entries for this tool.
                      If None, clear the entire cache.
        
        Returns:
            int: Number of entries invalidated
        """
        if tool_name is None:
            count = len(self._cache)
            self._cache.clear()
            self._tool_keys.clear()
            return count
        
        keys_to_remove = self._tool_keys.get(tool_name, set()).copy()
        for k in keys_to_remove:
            if k in self._cache:
                del self._cache[k]
        
        if tool_name in self._tool_keys:
            del self._tool_keys[tool_name]
        
        return len(keys_to_remove)
    
    def stats(self) -> dict[str, Any]:
        """Get cache statistics."""
        total = self._hits + self._misses
        return {
            "size": len(self._cache),
            "max_size": self._max_size,
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": self._hits / total if total > 0 else 0.0,
        }


TOOL_TIMEOUTS: dict[str, float] = {
    "perplexity_search": 60.0,
    "web_search": 45.0,
    "search_lifelogs": 30.0,
    "get_recent_lifelogs": 30.0,
    "send_sms": 15.0,
    "get_weather": 15.0,
    "get_calendar_events": 15.0,
    "add_calendar_event": 20.0,
}

DEFAULT_TIMEOUT = 30.0
MAX_RETRIES = 3
RETRY_BASE_DELAY = 0.5
RETRY_MAX_DELAY = 5.0

RETRYABLE_STATUS_CODES = {408, 429, 500, 502, 503, 504}


class NodeBridge:
    """
    Async HTTP client for the Node.js API bridge.
    
    Provides methods for Python agents to interact with the Node.js
    backend, including tool execution, memory retrieval, and profile access.
    
    Features:
    - Result caching for read-only operations
    - Automatic retry with exponential backoff
    - Per-tool timeout configuration
    
    Attributes:
        base_url: Base URL of the Node.js API
        bridge_key: Authentication key for bridge requests
        cache: TTL cache for tool results
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
        self._cache = TTLCache(max_size=200, default_ttl=60.0)
        self._context_cache = TTLCache(max_size=50, default_ttl=30.0)
    
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
    
    def _get_timeout(self, tool_name: str) -> float:
        """Get the appropriate timeout for a tool."""
        return TOOL_TIMEOUTS.get(tool_name, DEFAULT_TIMEOUT)
    
    def _is_cacheable(self, tool_name: str) -> bool:
        """Check if a tool's results can be cached."""
        return tool_name in CACHEABLE_TOOLS
    
    def _is_mutating(self, tool_name: str) -> bool:
        """Check if a tool mutates state (invalidates cache)."""
        return tool_name in MUTATING_TOOLS
    
    async def _request_with_retry(
        self,
        method: str,
        url: str,
        timeout: float,
        json_data: dict[str, Any] | None = None,
    ) -> httpx.Response:
        """
        Make an HTTP request with retry logic.
        
        Uses exponential backoff for transient failures (timeouts, 5xx errors).
        
        Args:
            method: HTTP method (GET, POST, etc.)
            url: Full URL to request
            timeout: Request timeout in seconds
            json_data: Optional JSON body for POST requests
            
        Returns:
            httpx.Response: The successful response
            
        Raises:
            httpx.HTTPError: If all retries fail
        """
        last_exception: Exception | None = None
        
        for attempt in range(MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    if method.upper() == "GET":
                        response = await client.get(url, headers=self._get_headers())
                    else:
                        response = await client.post(
                            url,
                            headers=self._get_headers(),
                            json=json_data
                        )
                    
                    if response.status_code in RETRYABLE_STATUS_CODES:
                        if attempt < MAX_RETRIES - 1:
                            delay = min(
                                RETRY_BASE_DELAY * (2 ** attempt),
                                RETRY_MAX_DELAY
                            )
                            logger.warning(
                                f"Retryable status {response.status_code} for {url}, "
                                f"attempt {attempt + 1}/{MAX_RETRIES}, waiting {delay:.1f}s"
                            )
                            await asyncio.sleep(delay)
                            continue
                    
                    response.raise_for_status()
                    return response
                    
            except (httpx.TimeoutException, httpx.ConnectError) as e:
                last_exception = e
                if attempt < MAX_RETRIES - 1:
                    delay = min(
                        RETRY_BASE_DELAY * (2 ** attempt),
                        RETRY_MAX_DELAY
                    )
                    logger.warning(
                        f"Transient error for {url}: {e}, "
                        f"attempt {attempt + 1}/{MAX_RETRIES}, waiting {delay:.1f}s"
                    )
                    await asyncio.sleep(delay)
                else:
                    raise
            except httpx.HTTPStatusError:
                raise
        
        if last_exception:
            raise last_exception
        raise httpx.HTTPError("Max retries exceeded")
    
    async def execute_tool(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """
        Execute a tool through the Node.js API bridge.
        
        Features:
        - Caches results for read-only tools
        - Invalidates cache when mutating tools are called
        - Retries on transient failures
        - Uses per-tool timeout configuration
        
        Args:
            tool_name: Name of the tool to execute
            arguments: Arguments to pass to the tool
            
        Returns:
            dict: Tool execution result
            
        Raises:
            httpx.HTTPError: If the request fails after retries
        """
        if self._is_cacheable(tool_name):
            cached = self._cache.get(tool_name, arguments)
            if cached is not None:
                logger.debug(f"Cache hit for tool '{tool_name}'")
                return cached
        
        if self._is_mutating(tool_name):
            self._invalidate_related_caches(tool_name)
        
        timeout = self._get_timeout(tool_name)
        
        response = await self._request_with_retry(
            "POST",
            f"{self.base_url}/api/tools/execute",
            timeout=timeout,
            json_data={
                "tool_name": tool_name,
                "arguments": arguments
            }
        )
        
        result = response.json()
        
        if self._is_cacheable(tool_name):
            ttl = self._get_cache_ttl(tool_name)
            self._cache.set(tool_name, arguments, result, ttl)
            logger.debug(f"Cached result for tool '{tool_name}' (TTL: {ttl}s)")
        
        return result
    
    def _get_cache_ttl(self, tool_name: str) -> float:
        """Get appropriate cache TTL for a tool."""
        if tool_name in {"get_current_time"}:
            return 5.0
        elif tool_name in {"get_weather"}:
            return 300.0
        elif tool_name in {"check_omi_status", "get_daily_checkin_status"}:
            return 30.0
        elif tool_name in {"list_tasks", "get_calendar_events", "get_grocery_list"}:
            return 60.0
        elif tool_name in {"get_contacts", "get_user_profile"}:
            return 120.0
        return 60.0
    
    def _invalidate_related_caches(self, tool_name: str) -> None:
        """Invalidate caches that might be affected by a mutating tool."""
        invalidation_map = {
            "add_task": ["list_tasks"],
            "complete_task": ["list_tasks"],
            "add_calendar_event": ["get_calendar_events"],
            "delete_calendar_event": ["get_calendar_events"],
            "add_grocery_item": ["get_grocery_list"],
            "remove_grocery_item": ["get_grocery_list"],
            "add_contact": ["get_contacts"],
            "update_contact": ["get_contacts"],
            "configure_daily_checkin": ["get_daily_checkin_status"],
        }
        
        for related_tool in invalidation_map.get(tool_name, []):
            self._cache.invalidate(related_tool)
            logger.debug(f"Invalidated cache for '{related_tool}' due to '{tool_name}'")
    
    async def get_capabilities(self) -> dict[str, Any]:
        """
        Get available capabilities and tools from the Node.js API.
        
        Returns:
            dict: Available capabilities and their tools
            
        Raises:
            httpx.HTTPError: If the request fails
        """
        response = await self._request_with_retry(
            "GET",
            f"{self.base_url}/api/tools/capabilities",
            timeout=DEFAULT_TIMEOUT
        )
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
        response = await self._request_with_retry(
            "POST",
            f"{self.base_url}/api/memory/context",
            timeout=DEFAULT_TIMEOUT,
            json_data={
                "query": query,
                "limit": limit
            }
        )
        return response.json()
    
    async def get_user_profile(self) -> dict[str, Any]:
        """
        Get the user's profile information.
        
        Returns:
            dict: User profile data
            
        Raises:
            httpx.HTTPError: If the request fails
        """
        cached = self._cache.get("get_user_profile", {})
        if cached is not None:
            return cached
        
        response = await self._request_with_retry(
            "GET",
            f"{self.base_url}/api/user/profile",
            timeout=DEFAULT_TIMEOUT
        )
        result = response.json()
        
        self._cache.set("get_user_profile", {}, result, ttl=120.0)
        return result
    
    async def get_context_bundle(
        self,
        domain: str,
        query: str = "",
        route: str = "/chat",
        conversation_id: str | None = None
    ) -> dict[str, Any]:
        """
        Get a curated context bundle from the Context Router.
        
        Results are cached with short TTL for efficiency.
        
        Args:
            domain: The context domain to retrieve
            query: Optional query to tailor the context
            route: Current app route for context prioritization
            conversation_id: Optional conversation ID
            
        Returns:
            dict: Context bundle
                
        Raises:
            httpx.HTTPError: If the request fails
        """
        cache_args = {"domain": domain, "query": query, "route": route}
        cached = self._context_cache.get("context_bundle", cache_args)
        if cached is not None:
            logger.debug(f"Context cache hit for domain '{domain}'")
            return cached
        
        payload: dict[str, Any] = {
            "domain": domain,
            "query": query,
            "route": route,
        }
        if conversation_id:
            payload["conversationId"] = conversation_id
        
        response = await self._request_with_retry(
            "POST",
            f"{self.base_url}/api/bridge/context-bundle",
            timeout=DEFAULT_TIMEOUT,
            json_data=payload
        )
        result = response.json()
        
        self._context_cache.set("context_bundle", cache_args, result, ttl=30.0)
        return result
    
    async def health_check(self) -> dict[str, Any]:
        """
        Check the health of the Node.js API.
        
        Returns:
            dict: Health status of the Node.js service
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
    
    def get_cache_stats(self) -> dict[str, Any]:
        """Get cache statistics for monitoring."""
        return {
            "tool_cache": self._cache.stats(),
            "context_cache": self._context_cache.stats(),
        }
    
    def invalidate_all_caches(self) -> None:
        """Clear all caches (useful for testing or cache reset)."""
        self._cache.invalidate()
        self._context_cache.invalidate()
        logger.info("All bridge caches invalidated")


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

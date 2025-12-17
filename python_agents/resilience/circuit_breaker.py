"""
Circuit Breaker Pattern Implementation

Prevents cascade failures by stopping requests to failing services.
States: CLOSED (normal) -> OPEN (failing) -> HALF_OPEN (testing recovery)
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, Optional, TypeVar

from python_agents.config import get_config

logger = logging.getLogger(__name__)

T = TypeVar("T")


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreakerOpen(Exception):
    """Raised when circuit breaker is open and request is rejected."""
    
    def __init__(self, service: str, remaining_seconds: float):
        self.service = service
        self.remaining_seconds = remaining_seconds
        super().__init__(
            f"Circuit breaker open for '{service}', retry in {remaining_seconds:.1f}s"
        )


@dataclass
class CircuitBreaker:
    """
    Circuit breaker for a specific service.
    
    Tracks failures and opens the circuit when threshold is exceeded.
    After cooldown, allows a single test request (half-open state).
    """
    
    service: str
    fail_threshold: int = 5
    cooldown_sec: int = 60
    
    state: CircuitState = field(default=CircuitState.CLOSED, init=False)
    failure_count: int = field(default=0, init=False)
    last_failure_time: float = field(default=0.0, init=False)
    success_count_in_half_open: int = field(default=0, init=False)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, init=False)
    
    def __post_init__(self):
        config = get_config()
        if self.fail_threshold == 5:
            self.fail_threshold = config.circuit_breaker.fail_threshold
        if self.cooldown_sec == 60:
            self.cooldown_sec = config.circuit_breaker.cooldown_sec
    
    @property
    def is_open(self) -> bool:
        """Check if circuit is open (blocking requests)."""
        if self.state == CircuitState.OPEN:
            if self._cooldown_elapsed():
                return False
            return True
        return False
    
    @property
    def time_until_retry(self) -> float:
        """Seconds until circuit can be tested again."""
        if self.state != CircuitState.OPEN:
            return 0.0
        elapsed = time.time() - self.last_failure_time
        remaining = self.cooldown_sec - elapsed
        return max(0.0, remaining)
    
    def _cooldown_elapsed(self) -> bool:
        """Check if cooldown period has passed."""
        return (time.time() - self.last_failure_time) >= self.cooldown_sec
    
    async def acquire(self) -> bool:
        """
        Attempt to acquire permission to make a request.
        
        Returns True if request is allowed, raises CircuitBreakerOpen if not.
        """
        async with self._lock:
            if self.state == CircuitState.CLOSED:
                return True
            
            if self.state == CircuitState.OPEN:
                if self._cooldown_elapsed():
                    logger.info(f"Circuit '{self.service}' transitioning to HALF_OPEN")
                    self.state = CircuitState.HALF_OPEN
                    self.success_count_in_half_open = 0
                    return True
                else:
                    raise CircuitBreakerOpen(self.service, self.time_until_retry)
            
            if self.state == CircuitState.HALF_OPEN:
                return True
        
        return True
    
    async def record_success(self) -> None:
        """Record a successful request."""
        async with self._lock:
            if self.state == CircuitState.HALF_OPEN:
                self.success_count_in_half_open += 1
                if self.success_count_in_half_open >= 2:
                    logger.info(f"Circuit '{self.service}' recovered, transitioning to CLOSED")
                    self.state = CircuitState.CLOSED
                    self.failure_count = 0
            elif self.state == CircuitState.CLOSED:
                if self.failure_count > 0:
                    self.failure_count = max(0, self.failure_count - 1)
    
    async def record_failure(self, error: Optional[Exception] = None) -> None:
        """Record a failed request."""
        async with self._lock:
            self.failure_count += 1
            self.last_failure_time = time.time()
            
            if self.state == CircuitState.HALF_OPEN:
                logger.warning(
                    f"Circuit '{self.service}' failed in HALF_OPEN, reopening. "
                    f"Error: {error}"
                )
                self.state = CircuitState.OPEN
                self.success_count_in_half_open = 0
            elif self.state == CircuitState.CLOSED:
                if self.failure_count >= self.fail_threshold:
                    logger.warning(
                        f"Circuit '{self.service}' opening after {self.failure_count} failures. "
                        f"Cooldown: {self.cooldown_sec}s"
                    )
                    self.state = CircuitState.OPEN
    
    def get_state_info(self) -> Dict[str, Any]:
        """Get current state information for health reporting."""
        return {
            "service": self.service,
            "state": self.state.value,
            "failure_count": self.failure_count,
            "time_until_retry": self.time_until_retry if self.state == CircuitState.OPEN else 0,
        }
    
    async def reset(self) -> None:
        """Reset circuit to closed state."""
        async with self._lock:
            self.state = CircuitState.CLOSED
            self.failure_count = 0
            self.last_failure_time = 0.0
            self.success_count_in_half_open = 0
            logger.info(f"Circuit '{self.service}' manually reset to CLOSED")


_circuits: Dict[str, CircuitBreaker] = {}
_circuits_lock = asyncio.Lock()


async def get_circuit_breaker(service: str) -> CircuitBreaker:
    """Get or create a circuit breaker for a service."""
    async with _circuits_lock:
        if service not in _circuits:
            _circuits[service] = CircuitBreaker(service=service)
        return _circuits[service]


def get_all_circuit_states() -> Dict[str, Dict[str, Any]]:
    """Get state info for all circuit breakers."""
    return {name: cb.get_state_info() for name, cb in _circuits.items()}


async def reset_all_circuits() -> None:
    """Reset all circuit breakers to closed state."""
    for cb in _circuits.values():
        await cb.reset()

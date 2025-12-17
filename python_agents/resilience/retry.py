"""
Retry with Jittered Exponential Backoff

Provides resilient retry logic for transient failures.
"""

import asyncio
import logging
import random
import time
from dataclasses import dataclass
from typing import (
    Any,
    Awaitable,
    Callable,
    Optional,
    Set,
    Type,
    TypeVar,
    Union,
)

from python_agents.resilience.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerOpen,
    get_circuit_breaker,
)

logger = logging.getLogger(__name__)

T = TypeVar("T")


@dataclass
class RetryConfig:
    """Configuration for retry behavior."""
    
    max_attempts: int = 3
    base_delay_sec: float = 1.0
    max_delay_sec: float = 30.0
    jitter_factor: float = 0.5
    
    retryable_exceptions: tuple = (
        ConnectionError,
        TimeoutError,
        asyncio.TimeoutError,
    )


def jittered_backoff(
    attempt: int,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    jitter_factor: float = 0.5,
) -> float:
    """
    Calculate delay with exponential backoff and jitter.
    
    Uses "decorrelated jitter" strategy for better distribution.
    
    Args:
        attempt: Current attempt number (0-indexed)
        base_delay: Base delay in seconds
        max_delay: Maximum delay cap
        jitter_factor: Amount of random variation (0-1)
    
    Returns:
        Delay in seconds
    """
    exp_delay = base_delay * (2 ** attempt)
    capped_delay = min(exp_delay, max_delay)
    
    jitter_range = capped_delay * jitter_factor
    jitter = random.uniform(-jitter_range, jitter_range)
    
    final_delay = max(0.1, capped_delay + jitter)
    return min(final_delay, max_delay)


async def with_retry(
    func: Callable[[], Awaitable[T]],
    service: Optional[str] = None,
    config: Optional[RetryConfig] = None,
) -> T:
    """
    Execute an async function with retry and circuit breaker.
    
    Args:
        func: Async function to execute
        service: Service name for circuit breaker (optional)
        config: Retry configuration (uses defaults if not provided)
    
    Returns:
        Result of the function
    
    Raises:
        CircuitBreakerOpen: If circuit is open
        Exception: Final exception after all retries exhausted
    """
    config = config or RetryConfig()
    circuit: Optional[CircuitBreaker] = None
    
    if service:
        circuit = await get_circuit_breaker(service)
        await circuit.acquire()
    
    last_exception: Optional[Exception] = None
    
    for attempt in range(config.max_attempts):
        try:
            result = await func()
            
            if circuit:
                await circuit.record_success()
            
            return result
            
        except config.retryable_exceptions as e:
            last_exception = e
            
            if attempt < config.max_attempts - 1:
                delay = jittered_backoff(
                    attempt,
                    config.base_delay_sec,
                    config.max_delay_sec,
                    config.jitter_factor,
                )
                logger.warning(
                    f"Retry {attempt + 1}/{config.max_attempts} for "
                    f"{'service ' + service if service else 'function'} "
                    f"after {delay:.2f}s. Error: {e}"
                )
                await asyncio.sleep(delay)
            else:
                logger.error(
                    f"All {config.max_attempts} attempts failed for "
                    f"{'service ' + service if service else 'function'}. "
                    f"Final error: {e}"
                )
                if circuit:
                    await circuit.record_failure(e)
                raise
                
        except Exception as e:
            if circuit:
                await circuit.record_failure(e)
            raise
    
    if last_exception:
        raise last_exception
    
    raise RuntimeError("Unexpected: no result and no exception")


class RetryableHTTPCodes:
    """HTTP status codes that should trigger retry."""
    
    RETRYABLE: Set[int] = {
        408,  # Request Timeout
        429,  # Too Many Requests
        500,  # Internal Server Error
        502,  # Bad Gateway
        503,  # Service Unavailable
        504,  # Gateway Timeout
    }
    
    @classmethod
    def is_retryable(cls, status_code: int) -> bool:
        """Check if status code should trigger retry."""
        return status_code in cls.RETRYABLE

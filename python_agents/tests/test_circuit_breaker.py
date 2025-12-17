"""Tests for circuit breaker and retry patterns."""

import asyncio
import pytest
from unittest.mock import AsyncMock, patch

from python_agents.resilience.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerOpen,
    CircuitState,
    get_circuit_breaker,
    get_all_circuit_states,
    reset_all_circuits,
)
from python_agents.resilience.retry import (
    RetryConfig,
    with_retry,
    jittered_backoff,
)


class TestCircuitBreaker:
    """Tests for CircuitBreaker class."""
    
    @pytest.fixture
    def circuit(self):
        """Create a fresh circuit breaker for testing."""
        return CircuitBreaker(service="test", fail_threshold=3, cooldown_sec=1)
    
    @pytest.mark.asyncio
    async def test_initial_state_is_closed(self, circuit):
        """Circuit starts in closed state."""
        assert circuit.state == CircuitState.CLOSED
        assert circuit.failure_count == 0
        assert not circuit.is_open
    
    @pytest.mark.asyncio
    async def test_acquire_succeeds_when_closed(self, circuit):
        """Acquire returns True when circuit is closed."""
        result = await circuit.acquire()
        assert result is True
    
    @pytest.mark.asyncio
    async def test_record_success_decrements_failure_count(self, circuit):
        """Recording success decrements failure count."""
        circuit.failure_count = 2
        await circuit.record_success()
        assert circuit.failure_count == 1
    
    @pytest.mark.asyncio
    async def test_opens_after_threshold_failures(self, circuit):
        """Circuit opens after reaching failure threshold."""
        for _ in range(3):
            await circuit.record_failure()
        
        assert circuit.state == CircuitState.OPEN
        assert circuit.is_open
    
    @pytest.mark.asyncio
    async def test_open_circuit_raises_exception(self, circuit):
        """Open circuit raises CircuitBreakerOpen."""
        for _ in range(3):
            await circuit.record_failure()
        
        with pytest.raises(CircuitBreakerOpen) as exc_info:
            await circuit.acquire()
        
        assert exc_info.value.service == "test"
        assert exc_info.value.remaining_seconds > 0
    
    @pytest.mark.asyncio
    async def test_transitions_to_half_open_after_cooldown(self, circuit):
        """Circuit transitions to half-open after cooldown."""
        for _ in range(3):
            await circuit.record_failure()
        
        circuit.last_failure_time -= 2
        
        result = await circuit.acquire()
        assert result is True
        assert circuit.state == CircuitState.HALF_OPEN
    
    @pytest.mark.asyncio
    async def test_half_open_closes_after_successes(self, circuit):
        """Circuit closes after consecutive successes in half-open."""
        circuit.state = CircuitState.HALF_OPEN
        
        await circuit.record_success()
        assert circuit.state == CircuitState.HALF_OPEN
        
        await circuit.record_success()
        assert circuit.state == CircuitState.CLOSED
        assert circuit.failure_count == 0
    
    @pytest.mark.asyncio
    async def test_half_open_reopens_on_failure(self, circuit):
        """Circuit reopens if failure occurs in half-open."""
        circuit.state = CircuitState.HALF_OPEN
        
        await circuit.record_failure()
        assert circuit.state == CircuitState.OPEN
    
    @pytest.mark.asyncio
    async def test_get_state_info(self, circuit):
        """get_state_info returns correct information."""
        info = circuit.get_state_info()
        
        assert info["service"] == "test"
        assert info["state"] == "closed"
        assert info["failure_count"] == 0
        assert info["time_until_retry"] == 0
    
    @pytest.mark.asyncio
    async def test_reset(self, circuit):
        """Reset restores circuit to initial state."""
        for _ in range(3):
            await circuit.record_failure()
        
        assert circuit.state == CircuitState.OPEN
        
        await circuit.reset()
        
        assert circuit.state == CircuitState.CLOSED
        assert circuit.failure_count == 0


class TestJitteredBackoff:
    """Tests for jittered backoff calculation."""
    
    def test_first_attempt_near_base_delay(self):
        """First attempt delay is near base delay."""
        delay = jittered_backoff(0, base_delay=1.0, jitter_factor=0.0)
        assert delay == 1.0
    
    def test_exponential_growth(self):
        """Delay grows exponentially with attempts."""
        delay0 = jittered_backoff(0, base_delay=1.0, jitter_factor=0.0)
        delay1 = jittered_backoff(1, base_delay=1.0, jitter_factor=0.0)
        delay2 = jittered_backoff(2, base_delay=1.0, jitter_factor=0.0)
        
        assert delay1 == 2.0
        assert delay2 == 4.0
    
    def test_respects_max_delay(self):
        """Delay is capped at max_delay."""
        delay = jittered_backoff(10, base_delay=1.0, max_delay=5.0, jitter_factor=0.0)
        assert delay == 5.0
    
    def test_jitter_adds_variation(self):
        """Jitter adds random variation to delays."""
        delays = [jittered_backoff(1, jitter_factor=0.5) for _ in range(10)]
        assert len(set(delays)) > 1
    
    def test_minimum_delay(self):
        """Delay never goes below 0.1 seconds."""
        delay = jittered_backoff(0, base_delay=0.01, jitter_factor=0.9)
        assert delay >= 0.1


class TestWithRetry:
    """Tests for with_retry function."""
    
    @pytest.mark.asyncio
    async def test_returns_result_on_success(self):
        """Returns result when function succeeds."""
        async def success_fn():
            return "success"
        
        result = await with_retry(success_fn)
        assert result == "success"
    
    @pytest.mark.asyncio
    async def test_retries_on_transient_failure(self):
        """Retries on transient failures."""
        call_count = 0
        
        async def flaky_fn():
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise ConnectionError("Transient failure")
            return "success"
        
        config = RetryConfig(max_attempts=3, base_delay_sec=0.01)
        result = await with_retry(flaky_fn, config=config)
        
        assert result == "success"
        assert call_count == 2
    
    @pytest.mark.asyncio
    async def test_raises_after_max_attempts(self):
        """Raises exception after exhausting retries."""
        async def always_fail():
            raise ConnectionError("Always fails")
        
        config = RetryConfig(max_attempts=2, base_delay_sec=0.01)
        
        with pytest.raises(ConnectionError):
            await with_retry(always_fail, config=config)
    
    @pytest.mark.asyncio
    async def test_no_retry_on_non_retryable_exception(self):
        """Does not retry on non-retryable exceptions."""
        call_count = 0
        
        async def value_error_fn():
            nonlocal call_count
            call_count += 1
            raise ValueError("Not retryable")
        
        config = RetryConfig(max_attempts=3, base_delay_sec=0.01)
        
        with pytest.raises(ValueError):
            await with_retry(value_error_fn, config=config)
        
        assert call_count == 1
    
    @pytest.mark.asyncio
    async def test_integrates_with_circuit_breaker(self):
        """Records success/failure to circuit breaker."""
        await reset_all_circuits()
        
        async def success_fn():
            return "ok"
        
        await with_retry(success_fn, service="test_integration")
        
        states = get_all_circuit_states()
        assert "test_integration" in states
        assert states["test_integration"]["state"] == "closed"


class TestCircuitRegistry:
    """Tests for circuit breaker registry functions."""
    
    @pytest.mark.asyncio
    async def test_get_circuit_breaker_creates_new(self):
        """get_circuit_breaker creates new circuit if not exists."""
        await reset_all_circuits()
        
        cb = await get_circuit_breaker("new_service")
        assert cb.service == "new_service"
        assert cb.state == CircuitState.CLOSED
    
    @pytest.mark.asyncio
    async def test_get_circuit_breaker_returns_existing(self):
        """get_circuit_breaker returns same instance for same service."""
        await reset_all_circuits()
        
        cb1 = await get_circuit_breaker("same_service")
        cb2 = await get_circuit_breaker("same_service")
        
        assert cb1 is cb2
    
    @pytest.mark.asyncio
    async def test_get_all_circuit_states(self):
        """get_all_circuit_states returns all circuits."""
        await reset_all_circuits()
        
        await get_circuit_breaker("service_a")
        await get_circuit_breaker("service_b")
        
        states = get_all_circuit_states()
        assert "service_a" in states
        assert "service_b" in states

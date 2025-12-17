/**
 * Tests for Retry + Circuit Breaker Utility
 * 
 * Tests jittered backoff and circuit breaker state transitions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitState,
  CircuitOpenError,
  withRetry,
  withCircuitBreaker,
  withReliability,
  isRetryableError,
  is429Error,
  is5xxError,
  resetAllCircuitBreakers,
} from '../../lib/reliability/client_wrap';

describe('isRetryableError', () => {
  it('should return true for 429 status', () => {
    const error = new Error('Rate limited') as any;
    error.status = 429;
    expect(isRetryableError(error)).toBe(true);
  });

  it('should return true for 500 status', () => {
    const error = new Error('Internal Server Error') as any;
    error.status = 500;
    expect(isRetryableError(error)).toBe(true);
  });

  it('should return true for 503 status', () => {
    const error = new Error('Service Unavailable') as any;
    error.status = 503;
    expect(isRetryableError(error)).toBe(true);
  });

  it('should return true for rate limit message', () => {
    const error = new Error('Rate limit exceeded');
    expect(isRetryableError(error)).toBe(true);
  });

  it('should return true for timeout message', () => {
    const error = new Error('Request timeout');
    expect(isRetryableError(error)).toBe(true);
  });

  it('should return false for 400 status', () => {
    const error = new Error('Bad Request') as any;
    error.status = 400;
    expect(isRetryableError(error)).toBe(false);
  });

  it('should return false for 401 status', () => {
    const error = new Error('Unauthorized') as any;
    error.status = 401;
    expect(isRetryableError(error)).toBe(false);
  });
});

describe('is429Error', () => {
  it('should detect 429 status code', () => {
    const error = new Error('Too many requests') as any;
    error.status = 429;
    expect(is429Error(error)).toBe(true);
  });

  it('should detect rate limit message', () => {
    const error = new Error('Rate limit exceeded');
    expect(is429Error(error)).toBe(true);
  });

  it('should return false for other errors', () => {
    const error = new Error('Some other error');
    expect(is429Error(error)).toBe(false);
  });
});

describe('is5xxError', () => {
  it('should detect 500 status', () => {
    const error = new Error('Internal Server Error') as any;
    error.status = 500;
    expect(is5xxError(error)).toBe(true);
  });

  it('should detect 502 status', () => {
    const error = new Error('Bad Gateway') as any;
    error.status = 502;
    expect(is5xxError(error)).toBe(true);
  });

  it('should detect 503 status', () => {
    const error = new Error('Service Unavailable') as any;
    error.status = 503;
    expect(is5xxError(error)).toBe(true);
  });

  it('should return false for 400 errors', () => {
    const error = new Error('Bad Request') as any;
    error.status = 400;
    expect(is5xxError(error)).toBe(false);
  });
});

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'test',
      failureThreshold: 3,
      successThreshold: 2,
      openDurationMs: 1000,
    });
  });

  describe('initial state', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.currentState).toBe(CircuitState.CLOSED);
    });

    it('should allow execution', () => {
      expect(breaker.canExecute()).toBe(true);
    });

    it('should have zero failures', () => {
      expect(breaker.stats.failures).toBe(0);
    });
  });

  describe('CLOSED -> OPEN transition', () => {
    it('should stay CLOSED below failure threshold', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.currentState).toBe(CircuitState.CLOSED);
      expect(breaker.stats.failures).toBe(2);
    });

    it('should transition to OPEN at failure threshold', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.currentState).toBe(CircuitState.OPEN);
    });

    it('should reject execution when OPEN', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.canExecute()).toBe(false);
    });
  });

  describe('OPEN -> HALF_OPEN transition', () => {
    it('should transition to HALF_OPEN after timeout', async () => {
      breaker = new CircuitBreaker({
        name: 'test-timeout',
        failureThreshold: 3,
        successThreshold: 2,
        openDurationMs: 50,
      });

      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.currentState).toBe(CircuitState.OPEN);

      await new Promise(resolve => setTimeout(resolve, 60));

      expect(breaker.canExecute()).toBe(true);
      expect(breaker.currentState).toBe(CircuitState.HALF_OPEN);
    });
  });

  describe('HALF_OPEN -> CLOSED transition', () => {
    it('should transition to CLOSED after success threshold', async () => {
      breaker = new CircuitBreaker({
        name: 'test-recovery',
        failureThreshold: 3,
        successThreshold: 2,
        openDurationMs: 50,
      });

      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      await new Promise(resolve => setTimeout(resolve, 60));
      breaker.canExecute();
      expect(breaker.currentState).toBe(CircuitState.HALF_OPEN);

      breaker.recordSuccess();
      expect(breaker.currentState).toBe(CircuitState.HALF_OPEN);

      breaker.recordSuccess();
      expect(breaker.currentState).toBe(CircuitState.CLOSED);
    });
  });

  describe('HALF_OPEN -> OPEN transition', () => {
    it('should transition back to OPEN on failure in HALF_OPEN', async () => {
      breaker = new CircuitBreaker({
        name: 'test-fail-recovery',
        failureThreshold: 3,
        successThreshold: 2,
        openDurationMs: 50,
      });

      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      await new Promise(resolve => setTimeout(resolve, 60));
      breaker.canExecute();
      expect(breaker.currentState).toBe(CircuitState.HALF_OPEN);

      breaker.recordFailure();
      expect(breaker.currentState).toBe(CircuitState.OPEN);
    });
  });

  describe('reset', () => {
    it('should reset all counters and state', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.currentState).toBe(CircuitState.OPEN);

      breaker.reset();
      expect(breaker.currentState).toBe(CircuitState.CLOSED);
      expect(breaker.stats.failures).toBe(0);
      expect(breaker.canExecute()).toBe(true);
    });
  });

  describe('force state methods', () => {
    it('should force to OPEN state', () => {
      expect(breaker.currentState).toBe(CircuitState.CLOSED);
      breaker.forceOpen();
      expect(breaker.currentState).toBe(CircuitState.OPEN);
    });

    it('should force to HALF_OPEN state', () => {
      breaker.forceHalfOpen();
      expect(breaker.currentState).toBe(CircuitState.HALF_OPEN);
    });

    it('should force to CLOSED state', () => {
      breaker.forceOpen();
      breaker.forceClosed();
      expect(breaker.currentState).toBe(CircuitState.CLOSED);
    });
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    
    const promise = withRetry(fn, { maxRetries: 3, baseDelayMs: 100 });
    const result = await promise;
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable error', async () => {
    const error = new Error('Rate limit') as any;
    error.status = 429;
    
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('success');
    
    const promise = withRetry(fn, { maxRetries: 3, baseDelayMs: 100 });
    
    await vi.advanceTimersByTimeAsync(200);
    
    const result = await promise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry up to maxRetries on 500 errors', async () => {
    const error = new Error('Server Error') as any;
    error.status = 500;
    
    const fn = vi.fn().mockRejectedValue(error);
    
    const promise = withRetry(fn, { maxRetries: 2, baseDelayMs: 100 });
    
    await vi.advanceTimersByTimeAsync(500);
    
    await expect(promise).rejects.toThrow('Server Error');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should not retry on non-retryable errors', async () => {
    const error = new Error('Bad Request') as any;
    error.status = 400;
    
    const fn = vi.fn().mockRejectedValue(error);
    
    await expect(
      withRetry(fn, { maxRetries: 3, baseDelayMs: 100 })
    ).rejects.toThrow('Bad Request');
    
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('withCircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'test-with',
      failureThreshold: 2,
      successThreshold: 1,
      openDurationMs: 1000,
    });
  });

  it('should execute function when circuit is CLOSED', async () => {
    const fn = vi.fn().mockResolvedValue('result');
    
    const result = await withCircuitBreaker(fn, breaker);
    
    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should record success', async () => {
    const fn = vi.fn().mockResolvedValue('result');
    
    await withCircuitBreaker(fn, breaker);
    
    expect(breaker.stats.totalRequests).toBe(1);
  });

  it('should record failure and open circuit', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    
    await expect(withCircuitBreaker(fn, breaker)).rejects.toThrow('fail');
    await expect(withCircuitBreaker(fn, breaker)).rejects.toThrow('fail');
    
    expect(breaker.currentState).toBe(CircuitState.OPEN);
  });

  it('should throw CircuitOpenError when circuit is OPEN', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    
    await expect(withCircuitBreaker(fn, breaker)).rejects.toThrow('fail');
    await expect(withCircuitBreaker(fn, breaker)).rejects.toThrow('fail');
    
    await expect(
      withCircuitBreaker(vi.fn().mockResolvedValue('result'), breaker)
    ).rejects.toThrow(CircuitOpenError);
  });
});

describe('withReliability', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    breaker = new CircuitBreaker({
      name: 'test-reliability',
      failureThreshold: 3,
      successThreshold: 1,
      openDurationMs: 1000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should combine retry and circuit breaker', async () => {
    const error = new Error('Rate limit') as any;
    error.status = 429;
    
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('success');
    
    const promise = withReliability(fn, breaker, { 
      maxRetries: 3, 
      baseDelayMs: 100 
    });
    
    await vi.advanceTimersByTimeAsync(300);
    
    const result = await promise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should open circuit after max retries exhausted multiple times', async () => {
    const error = new Error('Server Error') as any;
    error.status = 500;
    
    const fn = vi.fn().mockRejectedValue(error);
    
    for (let i = 0; i < 3; i++) {
      const promise = withReliability(fn, breaker, { 
        maxRetries: 1, 
        baseDelayMs: 50 
      });
      
      await vi.advanceTimersByTimeAsync(200);
      
      try {
        await promise;
      } catch (e) {
      }
    }
    
    expect(breaker.currentState).toBe(CircuitState.OPEN);
  });
});

describe('HALF_OPEN single probe guard', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'probe-test',
      failureThreshold: 2,
      successThreshold: 1,
      openDurationMs: 50,
    });
  });

  it('should only allow one probe request in HALF_OPEN state', async () => {
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.currentState).toBe(CircuitState.OPEN);

    await new Promise(resolve => setTimeout(resolve, 60));

    const results: boolean[] = [];
    results.push(breaker.canExecute());
    results.push(breaker.canExecute());
    results.push(breaker.canExecute());

    expect(results[0]).toBe(true);
    expect(results[1]).toBe(false);
    expect(results[2]).toBe(false);
  });

  it('should allow new probe after previous probe completes successfully', async () => {
    breaker.recordFailure();
    breaker.recordFailure();

    await new Promise(resolve => setTimeout(resolve, 60));

    expect(breaker.canExecute()).toBe(true);
    expect(breaker.canExecute()).toBe(false);

    breaker.recordSuccess();
    expect(breaker.currentState).toBe(CircuitState.CLOSED);

    expect(breaker.canExecute()).toBe(true);
  });

  it('should allow new probe after previous probe fails', async () => {
    breaker.recordFailure();
    breaker.recordFailure();

    await new Promise(resolve => setTimeout(resolve, 60));

    expect(breaker.canExecute()).toBe(true);
    expect(breaker.canExecute()).toBe(false);

    breaker.recordFailure();
    expect(breaker.currentState).toBe(CircuitState.OPEN);

    await new Promise(resolve => setTimeout(resolve, 60));

    expect(breaker.canExecute()).toBe(true);
  });
});

describe('Force 429/500 and state transitions', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'api-test',
      failureThreshold: 3,
      successThreshold: 2,
      openDurationMs: 100,
    });
  });

  it('should handle 429 errors correctly', async () => {
    const rate429Error = new Error('Rate limit exceeded') as any;
    rate429Error.status = 429;

    expect(breaker.currentState).toBe(CircuitState.CLOSED);

    breaker.recordFailure();
    expect(breaker.currentState).toBe(CircuitState.CLOSED);

    breaker.recordFailure();
    expect(breaker.currentState).toBe(CircuitState.CLOSED);

    breaker.recordFailure();
    expect(breaker.currentState).toBe(CircuitState.OPEN);
    expect(breaker.canExecute()).toBe(false);
  });

  it('should handle 500 errors correctly', async () => {
    const server500Error = new Error('Internal Server Error') as any;
    server500Error.status = 500;

    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();

    expect(breaker.currentState).toBe(CircuitState.OPEN);
    expect(breaker.canExecute()).toBe(false);
  });

  it('should complete full state transition cycle', async () => {
    expect(breaker.currentState).toBe(CircuitState.CLOSED);

    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.currentState).toBe(CircuitState.OPEN);

    await new Promise(resolve => setTimeout(resolve, 120));

    expect(breaker.canExecute()).toBe(true);
    expect(breaker.currentState).toBe(CircuitState.HALF_OPEN);

    breaker.recordSuccess();
    expect(breaker.currentState).toBe(CircuitState.HALF_OPEN);

    breaker.recordSuccess();
    expect(breaker.currentState).toBe(CircuitState.CLOSED);

    expect(breaker.stats.failures).toBe(0);
  });

  it('should handle mixed 429 and 500 errors', async () => {
    const rate429 = new Error('Rate limit') as any;
    rate429.status = 429;
    
    const server500 = new Error('Server error') as any;
    server500.status = 500;

    expect(is429Error(rate429)).toBe(true);
    expect(is5xxError(rate429)).toBe(false);
    
    expect(is429Error(server500)).toBe(false);
    expect(is5xxError(server500)).toBe(true);

    breaker.recordFailure();
    expect(breaker.currentState).toBe(CircuitState.CLOSED);
    
    breaker.recordFailure();
    expect(breaker.currentState).toBe(CircuitState.CLOSED);
    
    breaker.recordFailure();
    expect(breaker.currentState).toBe(CircuitState.OPEN);
  });
});

describe('Simulated API call scenarios', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    breaker = new CircuitBreaker({
      name: 'api-scenario',
      failureThreshold: 3,
      successThreshold: 2,
      openDurationMs: 5000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should simulate OpenAI 429 rate limiting scenario', async () => {
    let callCount = 0;
    const simulatedOpenAICall = async () => {
      callCount++;
      if (callCount <= 2) {
        const error = new Error('Rate limit exceeded') as any;
        error.status = 429;
        throw error;
      }
      return { choices: [{ message: { content: 'Hello' } }] };
    };

    const promise = withReliability(simulatedOpenAICall, breaker, {
      maxRetries: 3,
      baseDelayMs: 100,
    });

    await vi.advanceTimersByTimeAsync(500);

    const result = await promise;
    expect(result).toHaveProperty('choices');
    expect(callCount).toBe(3);
    expect(breaker.currentState).toBe(CircuitState.CLOSED);
  });

  it('should simulate Omi 500 server error scenario', async () => {
    let callCount = 0;
    const simulatedOmiCall = async () => {
      callCount++;
      const error = new Error('Internal Server Error') as any;
      error.status = 500;
      throw error;
    };

    const promise = withReliability(simulatedOmiCall, breaker, {
      maxRetries: 2,
      baseDelayMs: 100,
    });

    await vi.advanceTimersByTimeAsync(500);

    await expect(promise).rejects.toThrow('Internal Server Error');
    expect(callCount).toBe(3);
    expect(breaker.stats.totalFailures).toBe(1);
  });
});

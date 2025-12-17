/**
 * Retry + Circuit Breaker Utility
 * 
 * Provides jittered exponential backoff and circuit breaker patterns
 * for wrapping external API calls (OpenAI, Omi, etc.).
 */

export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half-open',
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
  retryOn: (error: unknown) => boolean;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  openDurationMs: number;
  name: string;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastStateChange: number;
  totalRequests: number;
  totalFailures: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.3,
  retryOn: isRetryableError,
};

const DEFAULT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  openDurationMs: 30000,
  name: 'default',
};

export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const status = (error as any).status || (error as any).statusCode;
    
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
    
    if (message.includes('rate limit')) return true;
    if (message.includes('timeout')) return true;
    if (message.includes('econnreset')) return true;
    if (message.includes('socket hang up')) return true;
    if (message.includes('network')) return true;
  }
  
  return false;
}

export function is429Error(error: unknown): boolean {
  if (error instanceof Error) {
    const status = (error as any).status || (error as any).statusCode;
    if (status === 429) return true;
    if (error.message.toLowerCase().includes('rate limit')) return true;
  }
  return false;
}

export function is5xxError(error: unknown): boolean {
  if (error instanceof Error) {
    const status = (error as any).status || (error as any).statusCode;
    if (status >= 500 && status < 600) return true;
  }
  return false;
}

function calculateBackoff(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitterFactor: number
): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  
  const jitter = cappedDelay * jitterFactor * (Math.random() * 2 - 1);
  
  return Math.max(0, Math.round(cappedDelay + jitter));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number | null = null;
  private lastStateChange: number = Date.now();
  private totalRequests: number = 0;
  private totalFailures: number = 0;
  private pendingProbe: boolean = false;
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_BREAKER_CONFIG, ...config };
  }

  get currentState(): CircuitState {
    return this.state;
  }

  get stats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
    };
  }

  get name(): string {
    return this.config.name;
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state !== newState) {
      console.log(`[CircuitBreaker:${this.config.name}] ${this.state} -> ${newState}`);
      this.state = newState;
      this.lastStateChange = Date.now();
      
      if (newState === CircuitState.CLOSED) {
        this.failures = 0;
        this.successes = 0;
        this.pendingProbe = false;
      } else if (newState === CircuitState.HALF_OPEN) {
        this.successes = 0;
        this.pendingProbe = false;
      } else if (newState === CircuitState.OPEN) {
        this.pendingProbe = false;
      }
    }
  }

  private shouldAttemptReset(): boolean {
    if (this.state !== CircuitState.OPEN) return false;
    
    const timeSinceOpen = Date.now() - this.lastStateChange;
    return timeSinceOpen >= this.config.openDurationMs;
  }

  canExecute(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }
    
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN);
        if (!this.pendingProbe) {
          this.pendingProbe = true;
          return true;
        }
        return false;
      }
      return false;
    }
    
    if (this.state === CircuitState.HALF_OPEN) {
      if (!this.pendingProbe) {
        this.pendingProbe = true;
        return true;
      }
      return false;
    }
    
    return true;
  }

  recordSuccess(): void {
    this.totalRequests++;
    this.pendingProbe = false;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    } else if (this.state === CircuitState.CLOSED) {
      this.failures = 0;
    }
  }

  recordFailure(): void {
    this.totalRequests++;
    this.totalFailures++;
    this.failures++;
    this.lastFailureTime = Date.now();
    this.pendingProbe = false;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED) {
      if (this.failures >= this.config.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.lastStateChange = Date.now();
    this.pendingProbe = false;
  }

  forceOpen(): void {
    this.transitionTo(CircuitState.OPEN);
  }

  forceHalfOpen(): void {
    this.transitionTo(CircuitState.HALF_OPEN);
  }

  forceClosed(): void {
    this.transitionTo(CircuitState.CLOSED);
  }
}

export class CircuitOpenError extends Error {
  constructor(
    public readonly circuitName: string,
    public readonly stats: CircuitBreakerStats
  ) {
    super(`Circuit breaker '${circuitName}' is open. Too many recent failures.`);
    this.name = 'CircuitOpenError';
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_CONFIG, ...config };
  
  let lastError: unknown;
  
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === opts.maxRetries) {
        break;
      }
      
      if (!opts.retryOn(error)) {
        throw error;
      }
      
      const delayMs = calculateBackoff(
        attempt,
        opts.baseDelayMs,
        opts.maxDelayMs,
        opts.jitterFactor
      );
      
      console.log(`[withRetry] Attempt ${attempt + 1} failed, retrying in ${delayMs}ms...`);
      await sleep(delayMs);
    }
  }
  
  throw lastError;
}

export async function withCircuitBreaker<T>(
  fn: () => Promise<T>,
  breaker: CircuitBreaker
): Promise<T> {
  if (!breaker.canExecute()) {
    throw new CircuitOpenError(breaker.name, breaker.stats);
  }
  
  try {
    const result = await fn();
    breaker.recordSuccess();
    return result;
  } catch (error) {
    breaker.recordFailure();
    throw error;
  }
}

export async function withReliability<T>(
  fn: () => Promise<T>,
  breaker: CircuitBreaker,
  retryConfig: Partial<RetryConfig> = {}
): Promise<T> {
  return withCircuitBreaker(
    () => withRetry(fn, retryConfig),
    breaker
  );
}

const circuitBreakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(
  name: string,
  config: Partial<CircuitBreakerConfig> = {}
): CircuitBreaker {
  let breaker = circuitBreakers.get(name);
  if (!breaker) {
    breaker = new CircuitBreaker({ ...config, name });
    circuitBreakers.set(name, breaker);
  }
  return breaker;
}

export function getAllCircuitBreakers(): Map<string, CircuitBreaker> {
  return new Map(circuitBreakers);
}

export function resetAllCircuitBreakers(): void {
  circuitBreakers.forEach(breaker => breaker.reset());
}

export const openaiBreaker = getCircuitBreaker('openai', {
  failureThreshold: 5,
  successThreshold: 2,
  openDurationMs: 30000,
});

export const omiBreaker = getCircuitBreaker('omi', {
  failureThreshold: 3,
  successThreshold: 1,
  openDurationMs: 60000,
});

// Context for AI logging - set before making OpenAI calls
interface AiLoggingContext {
  model?: string;
  endpoint?: 'chat' | 'responses' | 'embeddings' | 'tts' | 'vision' | 'batch' | 'realtime';
  agentId?: string;
  toolName?: string;
  conversationId?: string;
  systemPromptHash?: string;
  temperature?: string;
  maxTokens?: number;
  toolsEnabled?: string;
}

let currentLoggingContext: AiLoggingContext = {};

export function setAiLoggingContext(context: AiLoggingContext): void {
  currentLoggingContext = { ...currentLoggingContext, ...context };
}

export function clearAiLoggingContext(): void {
  currentLoggingContext = {};
}

export function getAiLoggingContext(): AiLoggingContext {
  return { ...currentLoggingContext };
}

// Import the AI logger - using dynamic import to avoid circular deps
let logAiEventFn: ((data: any) => string) | null = null;

export function setAiLoggerFunction(fn: (data: any) => string): void {
  logAiEventFn = fn;
  console.log("[Reliability] AI logging function configured");
}

export async function wrapOpenAI<T>(fn: () => Promise<T>): Promise<T> {
  const context = getAiLoggingContext();
  const startTime = Date.now();
  
  try {
    const result = await withReliability(fn, openaiBreaker, {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      retryOn: (error) => is429Error(error) || is5xxError(error),
    });
    
    const latencyMs = Date.now() - startTime;
    
    // Auto-log if context has model and endpoint set AND usage data is present
    // This ensures we only log when we have meaningful metrics
    const usage = (result as any)?.usage;
    if (context.model && context.endpoint && logAiEventFn && usage) {
      try {
        const inputTokens = usage.prompt_tokens || 0;
        const outputTokens = usage.completion_tokens || 0;
        
        logAiEventFn({
          model: context.model,
          endpoint: context.endpoint,
          agentId: context.agentId,
          toolName: context.toolName,
          conversationId: context.conversationId,
          inputTokens,
          outputTokens,
          latencyMs,
          status: 'success',
          systemPromptHash: context.systemPromptHash,
          temperature: context.temperature,
          maxTokens: context.maxTokens,
          toolsEnabled: context.toolsEnabled,
        });
      } catch (logError) {
        console.error("[Reliability] Failed to log AI call:", logError);
      }
    }
    
    return result;
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    
    // Log errors if context is set (errors should always be logged)
    if (context.model && context.endpoint && logAiEventFn) {
      try {
        logAiEventFn({
          model: context.model,
          endpoint: context.endpoint,
          agentId: context.agentId,
          toolName: context.toolName,
          conversationId: context.conversationId,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs,
          status: 'error',
          errorType: (error as Error).name || 'Error',
          errorMessage: (error as Error).message || String(error),
          systemPromptHash: context.systemPromptHash,
          temperature: context.temperature,
          maxTokens: context.maxTokens,
          toolsEnabled: context.toolsEnabled,
        });
      } catch (logError) {
        console.error("[Reliability] Failed to log AI error:", logError);
      }
    }
    
    throw error;
  }
}

// Wrapped version that logs AI calls with explicit context
export async function wrapOpenAIWithLogging<T>(
  fn: () => Promise<T>,
  context: AiLoggingContext & { model: string; endpoint: AiLoggingContext['endpoint'] }
): Promise<{ result: T; latencyMs: number }> {
  // Set context before calling wrapOpenAI
  setAiLoggingContext(context);
  
  const startTime = Date.now();
  
  try {
    const result = await wrapOpenAI(fn);
    const latencyMs = Date.now() - startTime;
    return { result, latencyMs };
  } finally {
    // Clear context after call
    clearAiLoggingContext();
  }
}

export async function wrapOmi<T>(fn: () => Promise<T>): Promise<T> {
  return withReliability(fn, omiBreaker, {
    maxRetries: 2,
    baseDelayMs: 2000,
    maxDelayMs: 20000,
    retryOn: (error) => is429Error(error) || is5xxError(error),
  });
}

export function createWrappedClient<TClient extends object>(
  client: TClient,
  breaker: CircuitBreaker,
  retryConfig: Partial<RetryConfig> = {}
): TClient {
  return new Proxy(client, {
    get(target, prop) {
      const value = (target as any)[prop];
      
      if (typeof value === 'function') {
        return async (...args: any[]) => {
          return withReliability(
            () => value.apply(target, args),
            breaker,
            retryConfig
          );
        };
      }
      
      if (value && typeof value === 'object') {
        return createWrappedClient(value, breaker, retryConfig);
      }
      
      return value;
    },
  });
}

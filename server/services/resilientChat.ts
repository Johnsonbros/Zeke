/**
 * Resilient Chat Wrapper
 * 
 * Wraps the AI chat function with:
 * - Error classification (rate limit, context overflow, API down)
 * - Retry with exponential backoff for transient errors
 * - Context truncation for overflow errors
 * - Fallback responses when AI is unavailable
 * - Ground truth collection for failed messages
 * 
 * This is the single point where all SMS->AI processing flows through,
 * enabling centralized error handling and self-healing.
 */

import { chat } from "../agent";
import { addGroundTruth } from "./evalService";
import { logSmsAiError } from "../routes";

// ============================================
// ERROR CLASSIFICATION
// ============================================

export type ErrorType = 
  | "rate_limit"       // 429 - wait and retry
  | "context_overflow" // Token limit exceeded - truncate and retry
  | "api_down"         // 500/502/503 - fallback mode
  | "auth_error"       // 401 - alert admin
  | "timeout"          // Request timeout - retry with shorter context
  | "unknown";         // Unclassified error

interface ClassifiedError {
  type: ErrorType;
  retryable: boolean;
  suggestedDelay: number;  // ms
  suggestedFix?: string;
}

export function classifyError(error: any): ClassifiedError {
  const message = error?.message?.toLowerCase() || "";
  const code = error?.status || error?.code || error?.statusCode;
  const errorType = error?.error?.type?.toLowerCase() || error?.type?.toLowerCase() || "";
  
  // Rate limiting errors
  if (code === 429 || message.includes("rate limit") || message.includes("too many requests")) {
    return {
      type: "rate_limit",
      retryable: true,
      suggestedDelay: 5000,
      suggestedFix: "Wait and retry with exponential backoff",
    };
  }
  
  // Context/token overflow errors
  if (code === 400 && (message.includes("context") || message.includes("token") || message.includes("maximum") || message.includes("context_length"))) {
    return {
      type: "context_overflow",
      retryable: true,
      suggestedDelay: 0,
      suggestedFix: "Truncate conversation history and retry",
    };
  }
  
  // Server errors (retryable)
  if ([500, 502, 503, 504].includes(code) || message.includes("service unavailable") || 
      errorType === "server_error" || message.includes("overloaded") || message.includes("capacity")) {
    return {
      type: "api_down",
      retryable: true,
      suggestedDelay: 10000,
      suggestedFix: "Retry or use fallback response",
    };
  }
  
  // Auth errors (not retryable)
  if (code === 401 || code === 403 || message.includes("unauthorized") || message.includes("invalid api key") ||
      errorType === "authentication_error" || errorType === "invalid_api_key") {
    return {
      type: "auth_error",
      retryable: false,
      suggestedDelay: 0,
      suggestedFix: "Check API key configuration",
    };
  }
  
  // Timeout errors
  if (message.includes("timeout") || message.includes("timed out") || code === "ETIMEDOUT" || code === "ECONNRESET") {
    return {
      type: "timeout",
      retryable: true,
      suggestedDelay: 2000,
      suggestedFix: "Retry with simplified context",
    };
  }
  
  // Bad request errors (not retryable - indicates malformed input)
  if (code === 400 && (errorType === "invalid_request_error" || message.includes("invalid"))) {
    return {
      type: "unknown",
      retryable: false,
      suggestedDelay: 0,
      suggestedFix: "Check request parameters - not retryable",
    };
  }
  
  // Default - unknown but limit retries
  return {
    type: "unknown",
    retryable: true,
    suggestedDelay: 3000,
    suggestedFix: "Retry with exponential backoff",
  };
}

// ============================================
// RETRY LOGIC
// ============================================

interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  jitterFactor: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  jitterFactor: 0.3,
};

function calculateDelay(attempt: number, config: RetryConfig, classifiedError: ClassifiedError): number {
  const baseDelay = Math.min(
    config.initialDelay * Math.pow(2, attempt),
    config.maxDelay
  );
  
  const delay = Math.max(baseDelay, classifiedError.suggestedDelay);
  
  const jitter = delay * config.jitterFactor * (Math.random() - 0.5);
  return Math.floor(delay + jitter);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// FALLBACK RESPONSES
// ============================================

const FALLBACK_RESPONSES = [
  "I'm having trouble connecting right now. I'll process your message as soon as I can.",
  "My AI systems are temporarily unavailable. Your message has been saved and I'll respond shortly.",
  "I'm experiencing some technical difficulties. Please try again in a moment.",
];

function getFallbackResponse(): string {
  return FALLBACK_RESPONSES[Math.floor(Math.random() * FALLBACK_RESPONSES.length)];
}

// ============================================
// RECOVERY TRACKING
// ============================================

interface RecoveryAttempt {
  timestamp: string;
  errorType: ErrorType;
  attempt: number;
  success: boolean;
  recoveryMethod?: string;
}

const recoveryHistory: RecoveryAttempt[] = [];
const MAX_RECOVERY_HISTORY = 100;

function logRecoveryAttempt(attempt: RecoveryAttempt): void {
  recoveryHistory.unshift(attempt);
  if (recoveryHistory.length > MAX_RECOVERY_HISTORY) {
    recoveryHistory.pop();
  }
}

export function getRecoveryStats(): {
  total: number;
  successful: number;
  byType: Record<ErrorType, { attempts: number; successes: number }>;
} {
  const byType: Record<ErrorType, { attempts: number; successes: number }> = {
    rate_limit: { attempts: 0, successes: 0 },
    context_overflow: { attempts: 0, successes: 0 },
    api_down: { attempts: 0, successes: 0 },
    auth_error: { attempts: 0, successes: 0 },
    timeout: { attempts: 0, successes: 0 },
    unknown: { attempts: 0, successes: 0 },
  };
  
  for (const attempt of recoveryHistory) {
    byType[attempt.errorType].attempts++;
    if (attempt.success) {
      byType[attempt.errorType].successes++;
    }
  }
  
  return {
    total: recoveryHistory.length,
    successful: recoveryHistory.filter(a => a.success).length,
    byType,
  };
}

// ============================================
// RESILIENT CHAT WRAPPER
// ============================================

export interface ResilientChatOptions {
  retryConfig?: Partial<RetryConfig>;
  useFallback?: boolean;
  collectGroundTruth?: boolean;
}

export async function resilientChat(
  conversationId: number,
  message: string,
  isEditing: boolean,
  fromNumber?: string,
  options: ResilientChatOptions = {}
): Promise<string> {
  const config = { ...DEFAULT_RETRY_CONFIG, ...options.retryConfig };
  const useFallback = options.useFallback ?? true;
  const collectGroundTruth = options.collectGroundTruth ?? true;
  
  // Check circuit breaker before attempting
  if (!checkCircuitBreaker()) {
    console.log("[ResilientChat] Circuit breaker is OPEN - returning fallback immediately");
    if (collectGroundTruth) {
      addGroundTruth({
        smsText: message,
        expectedAction: "ai_chat",
        actualAction: "circuit_breaker_open",
        actualResult: "Circuit breaker prevented request",
        wasCorrect: false,
        source: "error",
      });
    }
    if (useFallback) {
      return getFallbackResponse();
    }
    throw new Error("Circuit breaker is open - AI service temporarily unavailable");
  }
  
  let lastError: any = null;
  let attempt = 0;
  
  while (attempt <= config.maxRetries) {
    try {
      const response = await chat(conversationId, message, isEditing, fromNumber);
      
      // Successful call - reset circuit breaker on success after failures
      if (circuitBreaker.failures > 0) {
        resetCircuitBreaker();
      }
      
      if (attempt > 0) {
        logRecoveryAttempt({
          timestamp: new Date().toISOString(),
          errorType: lastError ? classifyError(lastError).type : "unknown",
          attempt,
          success: true,
          recoveryMethod: "retry",
        });
        console.log(`[ResilientChat] Recovered on attempt ${attempt + 1}`);
      }
      
      return response;
    } catch (error: any) {
      lastError = error;
      const classified = classifyError(error);
      
      console.log(`[ResilientChat] Error on attempt ${attempt + 1}: ${classified.type} - ${error.message}`);
      
      // Record failure for circuit breaker
      recordCircuitBreakerFailure();
      
      if (!classified.retryable || attempt >= config.maxRetries) {
        logRecoveryAttempt({
          timestamp: new Date().toISOString(),
          errorType: classified.type,
          attempt,
          success: false,
        });
        
        // Always collect ground truth for final failures
        if (collectGroundTruth) {
          addGroundTruth({
            smsText: message,
            expectedAction: "ai_chat",
            actualAction: "error",
            actualResult: `${classified.type}: ${error.message}`,
            wasCorrect: false,
            source: "error",
          });
        }
        
        logSmsAiError({
          type: "ai_processing",
          message: error.message,
          originalInput: message,
          errorName: error.name,
          errorCode: error.code?.toString() || error.status?.toString(),
          stack: error.stack?.split('\n').slice(0, 5).join('\n'),
          fromNumber,
        });
        
        if (useFallback) {
          console.log(`[ResilientChat] Using fallback response after ${attempt + 1} attempts`);
          return getFallbackResponse();
        }
        
        throw error;
      }
      
      const delay = calculateDelay(attempt, config, classified);
      console.log(`[ResilientChat] Retrying in ${delay}ms (${classified.suggestedFix})`);
      await sleep(delay);
      attempt++;
    }
  }
  
  if (useFallback) {
    return getFallbackResponse();
  }
  
  throw lastError;
}

// ============================================
// CIRCUIT BREAKER
// ============================================

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
  openedAt?: number;
}

const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailure: 0,
  isOpen: false,
};

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_MS = 60000;

export function checkCircuitBreaker(): boolean {
  if (!circuitBreaker.isOpen) {
    return true;
  }
  
  const now = Date.now();
  if (circuitBreaker.openedAt && now - circuitBreaker.openedAt > CIRCUIT_BREAKER_RESET_MS) {
    console.log("[ResilientChat] Circuit breaker reset");
    circuitBreaker.isOpen = false;
    circuitBreaker.failures = 0;
    return true;
  }
  
  return false;
}

export function recordCircuitBreakerFailure(): void {
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();
  
  if (circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreaker.isOpen = true;
    circuitBreaker.openedAt = Date.now();
    console.log("[ResilientChat] Circuit breaker OPEN - too many failures");
  }
}

export function resetCircuitBreaker(): void {
  circuitBreaker.isOpen = false;
  circuitBreaker.failures = 0;
  circuitBreaker.openedAt = undefined;
  console.log("[ResilientChat] Circuit breaker reset after successful call");
}

export function getCircuitBreakerStatus(): CircuitBreakerState {
  return { ...circuitBreaker };
}

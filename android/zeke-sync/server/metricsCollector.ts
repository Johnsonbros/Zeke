/**
 * Conversation Quality Metrics Collector
 * 
 * This module provides centralized metrics collection for tracking:
 * - Tool call outcomes (success/failure/timing)
 * - Conversation quality signals (follow-ups, retries)
 * - Memory usage and accuracy tracking
 * 
 * Used by both Node.js agent (agent.ts) and Python agents (via API)
 */

import { 
  createConversationMetric, 
  updateMemoryUsage,
  confirmMemory,
  contradictMemory,
  getConversationQualityStats,
  getOverallQualityStats,
  getToolSuccessRate,
  getMemoryConfidenceStats,
} from "./db";
import type { InsertConversationMetric, ToolOutcome, ConversationQualityStats } from "@shared/schema";

// Track pending tool calls for duration measurement
const pendingToolCalls = new Map<string, { startTime: number; toolName: string; conversationId: string }>();

/**
 * Start tracking a tool call
 * Call this when a tool execution begins
 */
export function startToolTracking(
  callId: string,
  toolName: string,
  conversationId: string
): void {
  pendingToolCalls.set(callId, {
    startTime: Date.now(),
    toolName,
    conversationId,
  });
}

/**
 * Record a tool call outcome
 * Call this when a tool execution completes (success or failure)
 */
export function recordToolOutcome(
  callId: string,
  outcome: ToolOutcome,
  options?: {
    errorMessage?: string;
    messageId?: string;
    memoriesUsed?: string[];
  }
): void {
  const pending = pendingToolCalls.get(callId);
  if (!pending) {
    console.warn(`[Metrics] No pending tool call found for ID: ${callId}`);
    return;
  }

  const durationMs = Date.now() - pending.startTime;
  pendingToolCalls.delete(callId);

  try {
    createConversationMetric({
      conversationId: pending.conversationId,
      messageId: options?.messageId,
      toolName: pending.toolName,
      toolOutcome: outcome,
      toolDurationMs: durationMs,
      toolErrorMessage: options?.errorMessage,
      memoriesUsed: options?.memoriesUsed ? JSON.stringify(options.memoriesUsed) : undefined,
    });
    
    console.log(`[Metrics] Recorded tool outcome: ${pending.toolName} = ${outcome} (${durationMs}ms)`);
  } catch (error) {
    console.error(`[Metrics] Failed to record tool outcome:`, error);
  }
}

/**
 * Record a tool call result with inline timing
 * Use this for simpler tracking without separate start/end calls
 */
export async function trackToolCall<T>(
  conversationId: string,
  toolName: string,
  executor: () => Promise<T>,
  messageId?: string
): Promise<{ result: T; outcome: ToolOutcome; durationMs: number }> {
  const startTime = Date.now();
  let outcome: ToolOutcome = "success";
  let errorMessage: string | undefined;
  let result: T;

  try {
    result = await executor();
  } catch (error) {
    outcome = "failure";
    errorMessage = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    const durationMs = Date.now() - startTime;
    
    try {
      createConversationMetric({
        conversationId,
        messageId,
        toolName,
        toolOutcome: outcome,
        toolDurationMs: durationMs,
        toolErrorMessage: errorMessage,
      });
    } catch (metricError) {
      console.error(`[Metrics] Failed to record tool metric:`, metricError);
    }
  }

  return { result: result!, outcome, durationMs: Date.now() - startTime };
}

/**
 * Record conversation quality signals
 */
export function recordConversationSignal(
  conversationId: string,
  signal: {
    requiredFollowUp?: boolean;
    userRetried?: boolean;
    explicitFeedback?: "positive" | "negative" | "neutral";
    feedbackNote?: string;
    messageId?: string;
  }
): void {
  try {
    createConversationMetric({
      conversationId,
      messageId: signal.messageId,
      requiredFollowUp: signal.requiredFollowUp,
      userRetried: signal.userRetried,
      explicitFeedback: signal.explicitFeedback,
      feedbackNote: signal.feedbackNote,
    });
    
    console.log(`[Metrics] Recorded conversation signal for ${conversationId}:`, signal);
  } catch (error) {
    console.error(`[Metrics] Failed to record conversation signal:`, error);
  }
}

/**
 * Record memory usage in a conversation
 */
export function recordMemoryUsage(
  conversationId: string,
  options: {
    messageId?: string;
    memoriesUsed?: string[];
    memoriesConfirmed?: string[];
    memoriesContradicted?: string[];
  }
): void {
  try {
    // Update individual memory usage counts
    if (options.memoriesUsed) {
      for (const memoryId of options.memoriesUsed) {
        updateMemoryUsage(memoryId);
      }
    }
    
    // Boost confidence for confirmed memories
    if (options.memoriesConfirmed) {
      for (const memoryId of options.memoriesConfirmed) {
        confirmMemory(memoryId);
      }
    }
    
    // Reduce confidence for contradicted memories
    if (options.memoriesContradicted) {
      for (const memoryId of options.memoriesContradicted) {
        contradictMemory(memoryId);
      }
    }

    // Record the metric
    createConversationMetric({
      conversationId,
      messageId: options.messageId,
      memoriesUsed: options.memoriesUsed ? JSON.stringify(options.memoriesUsed) : undefined,
      memoriesConfirmed: options.memoriesConfirmed ? JSON.stringify(options.memoriesConfirmed) : undefined,
      memoriesContradicted: options.memoriesContradicted ? JSON.stringify(options.memoriesContradicted) : undefined,
    });
    
    console.log(`[Metrics] Recorded memory usage for ${conversationId}:`, {
      used: options.memoriesUsed?.length || 0,
      confirmed: options.memoriesConfirmed?.length || 0,
      contradicted: options.memoriesContradicted?.length || 0,
    });
  } catch (error) {
    console.error(`[Metrics] Failed to record memory usage:`, error);
  }
}

/**
 * Detect if a message appears to be a retry of a previous request
 */
export function detectRetry(
  currentMessage: string,
  previousMessages: string[],
  similarityThreshold: number = 0.7
): boolean {
  if (previousMessages.length === 0) return false;
  
  const normalize = (s: string) => s.toLowerCase().trim().replace(/[^\w\s]/g, '');
  const normalizedCurrent = normalize(currentMessage);
  
  // Check last 3 messages for similarity
  const recentMessages = previousMessages.slice(-3);
  
  for (const prev of recentMessages) {
    const normalizedPrev = normalize(prev);
    
    // Simple word overlap similarity
    const currentWords = new Set(normalizedCurrent.split(/\s+/));
    const prevWords = new Set(normalizedPrev.split(/\s+/));
    
    const intersection = new Set([...currentWords].filter(w => prevWords.has(w)));
    const union = new Set([...currentWords, ...prevWords]);
    
    if (union.size === 0) continue;
    
    const similarity = intersection.size / union.size;
    if (similarity >= similarityThreshold) {
      return true;
    }
  }
  
  return false;
}

/**
 * Detect if a response likely needs follow-up
 * Based on patterns that suggest incomplete answers
 */
export function detectFollowUpNeeded(response: string): boolean {
  const followUpPatterns = [
    /i couldn't find/i,
    /i'm not sure/i,
    /i don't have access/i,
    /please clarify/i,
    /can you provide more/i,
    /would you like me to/i,
    /should i try/i,
    /i apologize/i,
    /unfortunately/i,
    /i wasn't able to/i,
    /error occurred/i,
  ];
  
  return followUpPatterns.some(pattern => pattern.test(response));
}

/**
 * Get comprehensive quality metrics for a conversation
 */
export function getQualityMetrics(conversationId: string): ConversationQualityStats {
  return getConversationQualityStats(conversationId);
}

/**
 * Get overall system quality metrics
 */
export function getSystemMetrics(days: number = 7) {
  return {
    qualityStats: getOverallQualityStats(days),
    memoryStats: getMemoryConfidenceStats(),
  };
}

/**
 * Get success rate for a specific tool
 */
export function getToolMetrics(toolName: string, days: number = 7) {
  return getToolSuccessRate(toolName, days);
}

/**
 * Middleware-style function to wrap chat processing with metrics
 */
export async function withMetrics<T>(
  conversationId: string,
  processor: () => Promise<T>,
  options?: {
    userMessage?: string;
    previousMessages?: string[];
  }
): Promise<T & { metricsRecorded: boolean }> {
  // Check for retry pattern
  if (options?.userMessage && options?.previousMessages) {
    const isRetry = detectRetry(options.userMessage, options.previousMessages);
    if (isRetry) {
      recordConversationSignal(conversationId, { userRetried: true });
    }
  }
  
  const result = await processor();
  
  // Check if response needs follow-up
  if (typeof result === 'object' && result !== null && 'response' in result) {
    const response = (result as any).response;
    if (typeof response === 'string' && detectFollowUpNeeded(response)) {
      recordConversationSignal(conversationId, { requiredFollowUp: true });
    }
  }
  
  return { ...result as object, metricsRecorded: true } as T & { metricsRecorded: boolean };
}

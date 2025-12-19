/**
 * Batch-First Configuration
 * 
 * ZEKE's core architectural principle: All non-realtime AI work uses OpenAI Batch API
 * for 50% cost savings with highest quality models (GPT-4o).
 * 
 * DESIGN PRINCIPLES:
 * 1. Deterministic work (stats, aggregation, filtering) runs LOCALLY - no AI needed
 * 2. Narrative generation, explanations, insights are QUEUED TO BATCH
 * 3. Only realtime chat responses bypass batch (user-facing latency requirements)
 * 
 * THREE-LANE PROCESSING MODEL:
 * - Realtime (<2s): User chat, urgent alerts
 * - Nearline (minutes): Background context assembly
 * - Batch (hours): All AI narrative/insight generation
 * 
 * DEVELOPER GUIDELINES:
 * - Before calling OpenAI directly, ask: "Can this wait for batch?"
 * - If the answer is YES, use queueToBatch() instead
 * - Stats, correlations, pattern detection should compute locally
 * - Only the "explain in natural language" step needs AI
 */

export interface BatchFirstConfig {
  enabled: boolean;
  enforceForNarratives: boolean;
  realtimeAllowlist: string[];
  batchModel: string;
  realtimeModel: string;
  costMultiplier: number;
}

let config: BatchFirstConfig = {
  enabled: true,
  enforceForNarratives: true,
  realtimeAllowlist: [
    "chat_response",
    "urgent_alert",
    "voice_command",
    "sms_reply",
  ],
  batchModel: "gpt-4o",
  realtimeModel: "gpt-4o-mini",
  costMultiplier: 0.5,
};

export function getBatchFirstConfig(): BatchFirstConfig {
  return { ...config };
}

export function updateBatchFirstConfig(updates: Partial<BatchFirstConfig>): void {
  config = { ...config, ...updates };
}

export function isBatchRequired(): boolean {
  return config.enabled && config.enforceForNarratives;
}

export function isRealtimeAllowed(operation: string): boolean {
  return config.realtimeAllowlist.includes(operation);
}

export function shouldUseBatch(operation: string): boolean {
  if (!config.enabled) return false;
  if (isRealtimeAllowed(operation)) return false;
  return true;
}

export interface BatchQueueItem {
  id: string;
  operation: string;
  payload: Record<string, unknown>;
  priority: number;
  createdAt: string;
}

const pendingBatchItems: BatchQueueItem[] = [];

export function queueForBatch(
  operation: string,
  payload: Record<string, unknown>,
  priority: number = 5
): string {
  const item: BatchQueueItem = {
    id: `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    operation,
    payload,
    priority,
    createdAt: new Date().toISOString(),
  };
  
  pendingBatchItems.push(item);
  console.log(`[BatchFirst] Queued ${operation} for batch processing (id: ${item.id})`);
  
  return item.id;
}

export function getPendingBatchItems(): BatchQueueItem[] {
  return [...pendingBatchItems];
}

export function clearPendingBatchItems(): BatchQueueItem[] {
  const items = [...pendingBatchItems];
  pendingBatchItems.length = 0;
  return items;
}

export function getBatchQueueStats(): {
  pending: number;
  byOperation: Record<string, number>;
} {
  const byOperation: Record<string, number> = {};
  for (const item of pendingBatchItems) {
    byOperation[item.operation] = (byOperation[item.operation] || 0) + 1;
  }
  
  return {
    pending: pendingBatchItems.length,
    byOperation,
  };
}

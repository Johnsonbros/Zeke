/**
 * ZEKE Idempotency Layer
 * 
 * In-memory implementation for idempotent processing of incoming realtime chunks.
 * Tracks which idempotency keys have been processed during this process lifetime.
 * 
 * NOTE: This is process-local and will reset on restart.
 * For production, consider backing this with Redis or a database.
 */

// In-memory store for processed idempotency keys
const processedKeys = new Set<string>();

export type IdempotencyOptions = {
  idempotencyKey: string;
  userId?: string;
  sessionId?: string;
};

export type IdempotencyResult = {
  isDuplicate: boolean;
};

/**
 * Claims an idempotency key, marking it as processed.
 * Returns whether this key has already been processed (duplicate).
 */
export function claimIdempotencyKey(options: IdempotencyOptions): IdempotencyResult {
  const { idempotencyKey } = options;

  if (!idempotencyKey) {
    throw new Error("Missing idempotency_key");
  }

  if (processedKeys.has(idempotencyKey)) {
    // We've already seen this key → duplicate
    return { isDuplicate: true };
  }

  // First time seeing this key → mark as used
  processedKeys.add(idempotencyKey);
  return { isDuplicate: false };
}

/**
 * Builds a deterministic idempotency key from the request payload.
 * Used when the client doesn't provide an explicit idempotency_key.
 * 
 * In a real system, the client SHOULD send a key and reuse it on retries.
 */
export function buildIdempotencyKeyFromPayload(body: any): string {
  const userId = body.user_id ?? "unknown-user";
  const deviceId = body.device_id ?? "unknown-device";
  const sessionId = body.session_id ?? "unknown-session";
  const sequence = body.sequence ?? 0;
  const chunkStartedAt = body.chunk_started_at ?? "unknown-time";

  return `${userId}:${deviceId}:${sessionId}:${sequence}:${chunkStartedAt}`;
}

/**
 * Gets the current count of processed keys (for debugging/monitoring).
 */
export function getProcessedKeysCount(): number {
  return processedKeys.size;
}

/**
 * Clears all processed keys (mainly for testing).
 */
export function clearProcessedKeys(): void {
  processedKeys.clear();
}

/**
 * Checks if a specific key has been processed (without claiming it).
 */
export function hasProcessedKey(key: string): boolean {
  return processedKeys.has(key);
}

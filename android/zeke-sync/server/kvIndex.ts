/**
 * KV Store Index - Central exports for all Key-Value Store utilities
 * 
 * Provides unified access to:
 * - Core KV Store operations
 * - Session state persistence
 * - Preference caching
 * - Rate limiting
 * 
 * Usage:
 *   import { kvStore, sessionState, preferenceCache, rateLimiter } from "./kvIndex";
 */

export { 
  kvStore,
  kvGet,
  kvSet,
  kvDelete,
  kvList,
  kvGetOrCompute,
  kvIncrement,
  kvClearNamespace,
  kvCleanupExpired,
  getKVStats,
  resetKVStats,
  type KVNamespace,
} from "./kvStore";

export {
  sessionState,
  saveConversationState,
  getConversationState,
  updateConversationActivity,
  getActiveConversations,
  saveVoicePipelineState,
  getVoicePipelineState,
  saveAutomationState,
  getAutomationState,
  incrementAutomationTrigger,
  saveActiveContext,
  getActiveContext,
  clearAllSessionState,
  type ConversationState,
  type VoicePipelineState,
  type AutomationState,
  type ActiveContext,
} from "./kvSessionState";

export {
  preferenceCache,
  cachePreference,
  getPreference,
  getPreferencesByCategory,
  cachePreferenceBundle,
  getPreferenceBundle,
  getAllHighConfidencePreferences,
  invalidatePreference,
  invalidateCategory,
  warmPreferenceCache,
  getPreferenceCacheStats,
  type PreferenceCategory,
  type CachedPreference,
  type PreferenceBundle,
} from "./kvPreferenceCache";

export {
  rateLimiter,
  checkRateLimit,
  consumeRateLimit,
  getRateLimitStatus,
  getAllRateLimitStatus,
  setCustomLimit,
  resetRateLimit,
  resetAllRateLimits,
  trackDailyUsage,
  recordDailyUsage,
  type RateLimitType,
} from "./kvRateLimiter";

import { kvCleanupExpired } from "./kvStore";
import { log } from "./logger";

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startKVMaintenance(intervalMs: number = 5 * 60 * 1000): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  
  cleanupInterval = setInterval(async () => {
    const cleaned = await kvCleanupExpired();
    if (cleaned > 0) {
      log(`[KV Maintenance] Cleaned ${cleaned} expired entries`, "cache");
    }
  }, intervalMs);
  
  log(`[KV Maintenance] Started with interval: ${intervalMs}ms`, "info");
}

export function stopKVMaintenance(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    log("[KV Maintenance] Stopped", "info");
  }
}

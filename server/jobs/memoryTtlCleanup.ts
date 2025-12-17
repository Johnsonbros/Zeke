/**
 * Memory TTL Cleanup Job
 * 
 * Periodically cleans up expired memories based on their TTL bucket.
 * Runs hourly by default to remove transient and session memories that have expired.
 */

import cron, { ScheduledTask } from "node-cron";
import { cleanupExpiredMemories, getMemoryScopeStats } from "../db.js";

let cleanupTask: ScheduledTask | null = null;

/**
 * Run a single cleanup pass.
 * Can be called manually or by the scheduled task.
 */
export async function runMemoryCleanup(): Promise<{ deleted: number; errors: string[] }> {
  console.log("[MemoryTTL] Running cleanup...");
  const result = cleanupExpiredMemories();
  
  if (result.deleted > 0) {
    console.log(`[MemoryTTL] Cleaned up ${result.deleted} expired memories`);
  }
  
  if (result.errors.length > 0) {
    console.error(`[MemoryTTL] Cleanup errors:`, result.errors);
  }
  
  return result;
}

/**
 * Get current memory scope statistics.
 */
export function getMemoryStats(): Record<string, number> {
  return getMemoryScopeStats();
}

/**
 * Start the scheduled cleanup job.
 * Default: runs every hour at minute 15 (e.g., 1:15, 2:15, etc.)
 */
export function startMemoryTtlCleanup(cronExpression: string = "15 * * * *"): void {
  if (cleanupTask) {
    console.log("[MemoryTTL] Cleanup job already running");
    return;
  }
  
  console.log(`[MemoryTTL] Starting scheduled cleanup with expression: ${cronExpression}`);
  
  cleanupTask = cron.schedule(cronExpression, async () => {
    await runMemoryCleanup();
  });
  
  // Run initial cleanup on start
  runMemoryCleanup().catch(e => {
    console.error("[MemoryTTL] Initial cleanup failed:", e);
  });
  
  console.log("[MemoryTTL] Cleanup job started");
}

/**
 * Stop the scheduled cleanup job.
 */
export function stopMemoryTtlCleanup(): void {
  if (cleanupTask) {
    cleanupTask.stop();
    cleanupTask = null;
    console.log("[MemoryTTL] Cleanup job stopped");
  }
}

/**
 * Check if the cleanup job is running.
 */
export function isMemoryTtlCleanupRunning(): boolean {
  return cleanupTask !== null;
}

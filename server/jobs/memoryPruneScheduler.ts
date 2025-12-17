/**
 * Memory Pruning Scheduler
 * Weekly job to archive low-heat, old memories
 */

import * as cron from "node-cron";
import { pruneOldLowHeatMemories } from "../db-memory-heat";

let pruneScheduler: cron.ScheduledTask | null = null;

export function startMemoryPruneScheduler(pattern: string = "0 3 * * 0"): void {
  if (pruneScheduler) {
    console.log("[MemoryPrune] Scheduler already running");
    return;
  }

  pruneScheduler = cron.schedule(pattern, async () => {
    try {
      console.log("[MemoryPrune] Starting weekly memory prune job...");
      const pruned = pruneOldLowHeatMemories();
      console.log(`[MemoryPrune] Job complete. Pruned ${pruned} memories.`);
    } catch (error) {
      console.error("[MemoryPrune] Job failed:", error);
    }
  });

  console.log(`[MemoryPrune] Scheduled at "${pattern}"`);
}

export function stopMemoryPruneScheduler(): void {
  if (pruneScheduler) {
    pruneScheduler.stop();
    pruneScheduler = null;
    console.log("[MemoryPrune] Scheduler stopped");
  }
}

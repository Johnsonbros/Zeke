/**
 * Knowledge Graph Backfill Scheduler
 * 
 * Runs nightly to automatically extract entities from new data
 * and keep the knowledge graph up to date.
 */

import * as cron from "node-cron";
import { runBackfill, getBackfillStatus } from "../graphBackfill";

let backfillTask: cron.ScheduledTask | null = null;
let lastScheduledRun: Date | null = null;
let isInitialized = false;

/**
 * Start the nightly knowledge graph backfill scheduler
 * Runs at 2:00 AM every day to process new data
 */
export function startKnowledgeGraphBackfillScheduler(): void {
  if (isInitialized || backfillTask) {
    console.log("[KnowledgeGraphBackfill] Scheduler already initialized, skipping");
    return;
  }
  isInitialized = true;

  // Schedule for 2:00 AM every day
  backfillTask = cron.schedule("0 2 * * *", async () => {
    console.log(`[KnowledgeGraphBackfill] Starting nightly backfill at ${new Date().toISOString()}`);
    lastScheduledRun = new Date();
    
    try {
      const status = getBackfillStatus();
      if (status.isRunning) {
        console.log("[KnowledgeGraphBackfill] Backfill already in progress, skipping scheduled run");
        return;
      }

      const result = await runBackfill();
      
      if (result.success) {
        console.log(`[KnowledgeGraphBackfill] Nightly backfill completed successfully`);
        console.log(`  - Entities created: ${result.totalEntitiesCreated}`);
        console.log(`  - References created: ${result.totalReferencesCreated}`);
        console.log(`  - Duration: ${Math.round(result.durationMs / 1000)}s`);
      } else {
        console.error(`[KnowledgeGraphBackfill] Nightly backfill completed with errors: ${result.totalErrors}`);
      }
    } catch (error) {
      console.error("[KnowledgeGraphBackfill] Nightly backfill failed:", error);
    }
  });

  console.log("[KnowledgeGraphBackfill] Scheduler started - will run at 2:00 AM daily");
}

/**
 * Stop the knowledge graph backfill scheduler
 */
export function stopKnowledgeGraphBackfillScheduler(): void {
  if (backfillTask) {
    backfillTask.stop();
    backfillTask = null;
    isInitialized = false;
    console.log("[KnowledgeGraphBackfill] Scheduler stopped");
  }
}

/**
 * Get the scheduler status
 */
export function getBackfillSchedulerStatus(): {
  isSchedulerRunning: boolean;
  lastScheduledRun: Date | null;
  nextScheduledRun: string;
} {
  return {
    isSchedulerRunning: backfillTask !== null,
    lastScheduledRun,
    nextScheduledRun: "2:00 AM daily",
  };
}

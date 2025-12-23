/**
 * Knowledge Graph Backfill Scheduler
 * 
 * Runs nightly to automatically extract entities from new data
 * and keep the knowledge graph up to date.
 * 
 * Supports two modes:
 * - Batch mode (preferred): Uses OpenAI Batch API with GPT-5.2 for 50% cost savings
 * - Sync mode (fallback): Immediate processing when batch is disabled
 */

import * as cron from "node-cron";
import { runBackfill, getBackfillStatus, submitBatchBackfill, shouldUseBatchBackfill } from "../graphBackfill";

let backfillTask: cron.ScheduledTask | null = null;
let lastScheduledRun: Date | null = null;
let isInitialized = false;

/**
 * Start the nightly knowledge graph backfill scheduler
 * Runs at 2:00 AM every day to process new data
 * Uses batch API when enabled for 50% cost savings
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

      // Prefer batch mode for 50% cost savings using GPT-5.2
      if (shouldUseBatchBackfill()) {
        console.log("[KnowledgeGraphBackfill] Using batch mode with GPT-5.2 (50% cost savings)");
        const batchResult = await submitBatchBackfill();
        
        if (batchResult.success) {
          console.log(`[KnowledgeGraphBackfill] Batch job submitted: ${batchResult.jobId}`);
          console.log(`  - Items queued: ${batchResult.itemCount}`);
          console.log(`  - Results will be processed asynchronously`);
        } else {
          console.error(`[KnowledgeGraphBackfill] Batch submission failed: ${batchResult.message}`);
          // Fall back to sync mode
          console.log("[KnowledgeGraphBackfill] Falling back to sync mode...");
          await runSyncBackfill();
        }
      } else {
        // Batch not enabled, use sync mode
        await runSyncBackfill();
      }
    } catch (error) {
      console.error("[KnowledgeGraphBackfill] Nightly backfill failed:", error);
    }
  });

  console.log("[KnowledgeGraphBackfill] Scheduler started - will run at 2:00 AM daily");
  console.log(`[KnowledgeGraphBackfill] Batch mode: ${shouldUseBatchBackfill() ? "ENABLED (50% cost savings)" : "DISABLED"}`);
}

/**
 * Run synchronous backfill (fallback when batch is disabled)
 */
async function runSyncBackfill(): Promise<void> {
  const result = await runBackfill();
  
  if (result.success) {
    console.log(`[KnowledgeGraphBackfill] Sync backfill completed successfully`);
    console.log(`  - Entities created: ${result.totalEntitiesCreated}`);
    console.log(`  - References created: ${result.totalReferencesCreated}`);
    console.log(`  - Duration: ${Math.round(result.durationMs / 1000)}s`);
  } else {
    console.error(`[KnowledgeGraphBackfill] Sync backfill completed with errors: ${result.totalErrors}`);
  }
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

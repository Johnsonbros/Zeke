/**
 * Autonomous Integration Job - Orchestrates ZEKE's proactive intelligence
 *
 * This job runs periodically to:
 * 1. Process recent lifelogs for intent extraction
 * 2. Extract knowledge from multiple data sources
 * 3. Generate proactive action candidates
 * 4. Filter and execute appropriate actions
 * 5. Learn from feedback
 */

import cron from "node-cron";
import { runAutonomousOrchestration } from "../autonomousOrchestrator";
import { runFeedbackLearningCycle } from "../feedbackLearner";
import { extractKnowledge } from "../knowledgeExtractor";

// Run autonomous orchestration every 30 minutes
export function scheduleAutonomousOrchestration() {
  // Main orchestration - every 30 minutes
  cron.schedule("*/30 * * * *", async () => {
    try {
      console.log("[Autonomous Integration] Starting orchestration cycle");
      const result = await runAutonomousOrchestration();
      console.log(
        `[Autonomous Integration] Completed: ${result.actionsExecuted} executed, ${result.actionsQueued} queued, ${result.candidatesFiltered} filtered`
      );

      if (result.errors.length > 0) {
        console.error(
          `[Autonomous Integration] Errors: ${result.errors.join(", ")}`
        );
      }
    } catch (error) {
      console.error("[Autonomous Integration] Orchestration error:", error);
    }
  });

  console.log("[Autonomous Integration] Scheduled orchestration (every 30 min)");

  // Feedback learning - daily at 3 AM
  cron.schedule("0 3 * * *", async () => {
    try {
      console.log("[Autonomous Integration] Running feedback learning cycle");
      await runFeedbackLearningCycle();
      console.log("[Autonomous Integration] Feedback learning completed");
    } catch (error) {
      console.error("[Autonomous Integration] Feedback learning error:", error);
    }
  });

  console.log("[Autonomous Integration] Scheduled feedback learning (daily 3 AM)");

  // Knowledge extraction - every 6 hours
  cron.schedule("0 */6 * * *", async () => {
    try {
      console.log("[Autonomous Integration] Running knowledge extraction");
      await extractKnowledge(72); // Last 72 hours
      console.log("[Autonomous Integration] Knowledge extraction completed");
    } catch (error) {
      console.error("[Autonomous Integration] Knowledge extraction error:", error);
    }
  });

  console.log("[Autonomous Integration] Scheduled knowledge extraction (every 6 hours)");
}

// Initialize on module load
export function initializeAutonomousIntegration() {
  console.log("[Autonomous Integration] Initializing autonomous intelligence system...");

  scheduleAutonomousOrchestration();

  console.log("[Autonomous Integration] Initialization complete");
}

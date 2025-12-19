/**
 * Prediction Scheduler
 *
 * Scheduled jobs for continuous predictive intelligence:
 * - Pattern discovery (daily)
 * - Anomaly detection (hourly)
 * - Prediction generation (every 4 hours)
 * - Pattern accuracy validation (weekly)
 * 
 * BATCH-FIRST PRINCIPLE:
 * - All deterministic work (stats, pattern matching, threshold checks) runs LOCALLY
 * - Narrative generation and explanations are QUEUED TO BATCH for 50% cost savings
 * - Only user-facing chat responses use realtime AI
 */

import cron from "node-cron";
import logger from "./logging.js";
import { discoverPatterns, getActivePatterns } from "./patternRecognition.js";
import { buildFusedContext, detectAnomalies } from "./dataFusion.js";
import { db } from "./db";
import { predictions } from "../shared/schema.js";
import { eq } from "drizzle-orm";
import { queueForBatch, shouldUseBatch } from "./config/batchFirst";

/**
 * Pattern Discovery Job
 * Runs daily at 3:00 AM to discover new patterns
 */
export function schedulePatternDiscovery() {
  cron.schedule("0 3 * * *", async () => {
    try {
      logger.info("Running scheduled pattern discovery...");
      const patterns = await discoverPatterns(90); // Analyze last 90 days
      logger.info(`Pattern discovery complete: found ${patterns.length} patterns`);
    } catch (error) {
      logger.error("Error in scheduled pattern discovery:", error);
    }
  });

  logger.info("Scheduled pattern discovery job (daily at 3:00 AM)");
}

/**
 * Anomaly Detection Job
 * Runs every hour to check for behavioral anomalies
 */
export function scheduleAnomalyDetection() {
  cron.schedule("0 * * * *", async () => {
    try {
      logger.info("Running scheduled anomaly detection...");

      const activePatterns = await getActivePatterns();
      const context = await buildFusedContext(48, activePatterns);
      const anomalies = await detectAnomalies(context, activePatterns);

      if (anomalies.length > 0) {
        logger.info(`Detected ${anomalies.length} anomalies:`);
        for (const anomaly of anomalies) {
          logger.info(`  - ${anomaly.type}: ${anomaly.description} (${anomaly.severity})`);
        }

        // High-severity anomalies could trigger notifications
        const highSeverityAnomalies = anomalies.filter((a) => a.severity === "high");
        if (highSeverityAnomalies.length > 0) {
          logger.warn(`${highSeverityAnomalies.length} high-severity anomalies detected!`);
          
          // BATCH-FIRST: Queue anomaly explanation to batch
          if (shouldUseBatch("anomaly_explanation")) {
            queueForBatch("anomaly_explanation", {
              anomalies: highSeverityAnomalies,
              timestamp: new Date().toISOString(),
            }, 2);
            logger.info("Queued anomaly explanations for batch processing");
          }
        }
      } else {
        logger.info("No anomalies detected");
      }
    } catch (error) {
      logger.error("Error in scheduled anomaly detection:", error);
    }
  });

  logger.info("Scheduled anomaly detection job (every hour)");
}

/**
 * Prediction Generation Job
 * Runs every 4 hours to generate proactive predictions
 */
export function schedulePredictionGeneration() {
  cron.schedule("0 */4 * * *", async () => {
    try {
      logger.info("Running scheduled prediction generation...");

      // Build context and get patterns
      const activePatterns = await getActivePatterns();
      const context = await buildFusedContext(72, activePatterns); // Look ahead 3 days

      // Analyze for various prediction types
      const predictions: string[] = [];

      // 1. Task deadline risk detection
      const urgentTasks = context.pendingTasks.filter(
        (t) => t.hoursUntilDue !== undefined && t.hoursUntilDue < 24 && t.hoursUntilDue > 0
      );

      if (urgentTasks.length > 0 && context.tasksCompletedToday === 0) {
        predictions.push(
          `Task deadline risk: ${urgentTasks.length} task(s) due within 24 hours with no completions today`
        );
      }

      // 2. Schedule conflict detection
      if (context.hasConflicts) {
        predictions.push("Schedule conflict detected in upcoming events");
      }

      // 3. Supply prediction (grocery)
      if (context.daysSinceLastShopping !== undefined && context.daysSinceLastShopping > 7) {
        predictions.push(
          `Grocery shopping pattern: Last shopping was ${Math.round(context.daysSinceLastShopping)} days ago`
        );
      }

      // 4. Energy pattern recommendations
      if (context.taskLoad === "heavy" && context.tasksCompletedToday === 0) {
        const now = new Date();
        const hour = now.getHours();

        // Find productivity patterns
        const productivityPattern = activePatterns.find(
          (p) => p.type === "temporal" && p.dataSource === "tasks"
        );

        if (productivityPattern) {
          try {
            const def = JSON.parse(productivityPattern.patternDefinition);
            if (def.type === "task_completion_time" && def.peakHours) {
              const isProductiveHour = def.peakHours.includes(hour);
              if (isProductiveHour) {
                predictions.push(
                  `Energy pattern: Currently in typical peak productivity hours (${hour}:00) with heavy task load`
                );
              }
            }
          } catch (error) {
            logger.error("Error parsing productivity pattern:", error);
          }
        }
      }

      if (predictions.length > 0) {
        logger.info(`Generated ${predictions.length} predictions:`);
        predictions.forEach((p) => logger.info(`  - ${p}`));
        
        // BATCH-FIRST: Queue narrative generation to batch instead of calling AI inline
        if (shouldUseBatch("prediction_narrative")) {
          queueForBatch("prediction_narrative", {
            predictions,
            contextSummary: {
              taskLoad: context.taskLoad,
              tasksCompletedToday: context.tasksCompletedToday,
              urgentTaskCount: urgentTasks.length,
              hasConflicts: context.hasConflicts,
            },
            timestamp: new Date().toISOString(),
          }, 3);
          logger.info("Queued prediction narratives for batch processing");
        }
      } else {
        logger.info("No new predictions generated");
      }

    } catch (error) {
      logger.error("Error in scheduled prediction generation:", error);
    }
  });

  logger.info("Scheduled prediction generation job (every 4 hours)");
}

/**
 * Pattern Validation Job
 * Runs weekly to validate pattern accuracy based on recent predictions
 */
export function schedulePatternValidation() {
  cron.schedule("0 4 * * 0", async () => {
    // Sundays at 4:00 AM
    try {
      logger.info("Running scheduled pattern validation...");

      const activePatterns = await getActivePatterns();

      for (const pattern of activePatterns) {
        // Check if pattern has been used in predictions recently
        if (
          pattern.lastUsedAt &&
          pattern.predictionCount &&
          pattern.predictionCount > 0
        ) {
          const daysSinceUsed =
            (Date.now() - new Date(pattern.lastUsedAt).getTime()) / (1000 * 60 * 60 * 24);

          if (daysSinceUsed < 30) {
            logger.info(
              `Pattern "${pattern.name}": used ${pattern.predictionCount} times, ` +
                `accuracy rate: ${pattern.accuracyRate || "unknown"}`
            );
          }
        }
      }

      logger.info("Pattern validation complete");
    } catch (error) {
      logger.error("Error in scheduled pattern validation:", error);
    }
  });

  logger.info("Scheduled pattern validation job (weekly on Sundays at 4:00 AM)");
}

/**
 * Prediction Expiration Job
 * Runs every 6 hours to expire old predictions
 */
export function schedulePredictionExpiration() {
  cron.schedule("0 */6 * * *", async () => {
    try {
      logger.info("Running scheduled prediction expiration...");

      const now = new Date().toISOString();

      // Find predictions that have expired but are still pending
      const expiredCount = await db
        .update(predictions)
        .set({
          status: "expired",
          updatedAt: now,
        })
        .where(
          eq(predictions.status, "pending")
          // TODO: Add where clause for validUntil < now once we have proper SQL
        );

      logger.info(`Expired predictions check complete`);
    } catch (error) {
      logger.error("Error in scheduled prediction expiration:", error);
    }
  });

  logger.info("Scheduled prediction expiration job (every 6 hours)");
}

/**
 * Initialize all prediction scheduler jobs
 */
export function initializePredictionScheduler() {
  logger.info("Initializing prediction scheduler...");

  schedulePatternDiscovery();
  scheduleAnomalyDetection();
  schedulePredictionGeneration();
  schedulePatternValidation();
  schedulePredictionExpiration();

  logger.info("Prediction scheduler initialized successfully");
}

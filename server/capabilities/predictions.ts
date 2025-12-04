/**
 * Predictions Capability
 *
 * Handles predictive intelligence operations including:
 * - Building fused context
 * - Creating and managing predictions
 * - Executing anticipatory actions
 * - Recording feedback for learning
 */

import { db } from "../../db/index.js";
import {
  predictions,
  patterns,
  anticipatoryActions,
  predictionFeedback,
  type InsertPrediction,
  type Prediction,
  type Pattern,
  type InsertAnticipatoryAction,
  type InsertPredictionFeedback,
  type PredictionType,
  type PredictionConfidenceLevel,
} from "../../shared/schema.js";
import { eq, and, desc, inArray, gte } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import logger from "../logging.js";
import {
  buildFusedContext,
  detectAnomalies,
  type FusedContext,
  type BehaviorAnomaly,
} from "../dataFusion.js";
import {
  getActivePatterns,
  updatePatternAccuracy,
  discoverPatterns,
} from "../patternRecognition.js";

/**
 * Build comprehensive fused context for predictions
 */
export async function buildFusedContextTool(args: {
  look_ahead_hours?: number;
}): Promise<{ success: boolean; context?: FusedContext; error?: string }> {
  try {
    const lookAheadHours = args.look_ahead_hours || 48;
    const activePatterns = await getActivePatterns();
    const context = await buildFusedContext(lookAheadHours, activePatterns);

    return {
      success: true,
      context,
    };
  } catch (error) {
    logger.error("Error building fused context:", error);
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Get all active patterns
 */
export async function getActivePatternsTool() {
  try {
    const activePatterns = await getActivePatterns();

    return {
      success: true,
      patterns: activePatterns,
      count: activePatterns.length,
    };
  } catch (error) {
    logger.error("Error getting active patterns:", error);
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Detect behavioral anomalies
 */
export async function detectAnomaliesTool(args: {
  context: string;
  patterns: string;
}): Promise<{
  success: boolean;
  anomalies?: BehaviorAnomaly[];
  count?: number;
  error?: string;
}> {
  try {
    const context: FusedContext = JSON.parse(args.context);
    const patterns: Pattern[] = JSON.parse(args.patterns);

    const anomalies = await detectAnomalies(context, patterns);

    return {
      success: true,
      anomalies,
      count: anomalies.length,
    };
  } catch (error) {
    logger.error("Error detecting anomalies:", error);
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Calculate confidence level from score
 */
function getConfidenceLevel(score: number): PredictionConfidenceLevel {
  if (score >= 0.9) return "very_high";
  if (score >= 0.75) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

/**
 * Create a new prediction
 */
export async function createPrediction(args: {
  type: PredictionType;
  title: string;
  description: string;
  confidence_score: number;
  suggested_action: string;
  action_data?: string;
  reasoning: string;
  data_sources_used: string;
  related_pattern_ids?: string;
  priority: "low" | "medium" | "high" | "urgent";
  auto_execute?: boolean;
}): Promise<{ success: boolean; prediction?: Prediction; error?: string }> {
  try {
    const id = uuidv4();
    const now = new Date().toISOString();

    const confidenceLevel = getConfidenceLevel(args.confidence_score);

    // Only allow auto_execute for very high confidence
    const autoExecute = args.auto_execute && args.confidence_score >= 0.9;

    const predictionData: InsertPrediction = {
      type: args.type,
      title: args.title,
      description: args.description,
      confidenceScore: args.confidence_score.toString(),
      confidenceLevel,
      status: "pending",
      suggestedAction: args.suggested_action,
      actionData: args.action_data,
      autoExecute,
      requiresUserApproval: !autoExecute,
      reasoning: args.reasoning,
      dataSourcesUsed: args.data_sources_used,
      relatedPatternIds: args.related_pattern_ids,
      priority: args.priority,
      impactScore: args.confidence_score.toString(), // Use confidence as initial impact
    };

    const [prediction] = await db
      .insert(predictions)
      .values({
        id,
        ...predictionData,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    logger.info(
      `Created prediction: ${prediction.title} (confidence: ${args.confidence_score}, auto-execute: ${autoExecute})`
    );

    // If auto-execute is enabled, execute immediately
    if (autoExecute) {
      await executePrediction({ prediction_id: id });
    }

    return {
      success: true,
      prediction,
    };
  } catch (error) {
    logger.error("Error creating prediction:", error);
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Get pending predictions
 */
export async function getPendingPredictions(): Promise<{
  success: boolean;
  predictions?: Prediction[];
  count?: number;
  error?: string;
}> {
  try {
    const pendingPredictions = await db
      .select()
      .from(predictions)
      .where(eq(predictions.status, "pending"))
      .orderBy(desc(predictions.createdAt));

    return {
      success: true,
      predictions: pendingPredictions,
      count: pendingPredictions.length,
    };
  } catch (error) {
    logger.error("Error getting pending predictions:", error);
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Execute a prediction's suggested action
 */
export async function executePrediction(args: {
  prediction_id: string;
}): Promise<{
  success: boolean;
  action?: any;
  error?: string;
}> {
  try {
    const [prediction] = await db
      .select()
      .from(predictions)
      .where(eq(predictions.id, args.prediction_id))
      .limit(1);

    if (!prediction) {
      return {
        success: false,
        error: "Prediction not found",
      };
    }

    // Parse action data
    let actionData: any = {};
    if (prediction.actionData) {
      try {
        actionData = JSON.parse(prediction.actionData);
      } catch (e) {
        logger.error("Error parsing action data:", e);
      }
    }

    // Execute the action based on type
    let executionResult: any;
    let executionSuccess = false;
    let errorMessage: string | undefined;

    try {
      // Here we would route to the appropriate action handler
      // For now, we'll log the action
      logger.info(
        `Executing prediction action: ${prediction.suggestedAction}`,
        actionData
      );

      // TODO: Implement actual action execution based on prediction type
      // This would call appropriate capabilities (send_sms, create_task, etc.)

      executionResult = {
        executed: true,
        action: prediction.suggestedAction,
        data: actionData,
      };
      executionSuccess = true;
    } catch (error) {
      logger.error("Error executing prediction action:", error);
      errorMessage = String(error);
    }

    // Record the anticipatory action
    const now = new Date().toISOString();
    const actionId = uuidv4();

    const [anticipatoryAction] = await db
      .insert(anticipatoryActions)
      .values({
        id: actionId,
        predictionId: prediction.id,
        actionType: prediction.suggestedAction,
        actionDescription: prediction.description,
        actionData: JSON.stringify(actionData),
        executedAt: now,
        success: executionSuccess,
        result: JSON.stringify(executionResult),
        errorMessage,
        createdAt: now,
      })
      .returning();

    // Update prediction status
    await db
      .update(predictions)
      .set({
        status: executionSuccess ? "executed" : "pending",
        executedAt: executionSuccess ? now : undefined,
        updatedAt: now,
      })
      .where(eq(predictions.id, prediction.id));

    return {
      success: executionSuccess,
      action: anticipatoryAction,
      error: errorMessage,
    };
  } catch (error) {
    logger.error("Error executing prediction:", error);
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Record prediction feedback for learning
 */
export async function recordPredictionFeedback(args: {
  prediction_id: string;
  was_accurate: boolean;
  accuracy_score?: number;
  feedback_type: "explicit_user" | "implicit_behavior" | "outcome_validation";
  feedback_note?: string;
}): Promise<{ success: boolean; feedback?: any; error?: string }> {
  try {
    const id = uuidv4();
    const now = new Date().toISOString();

    // Get the prediction
    const [prediction] = await db
      .select()
      .from(predictions)
      .where(eq(predictions.id, args.prediction_id))
      .limit(1);

    if (!prediction) {
      return {
        success: false,
        error: "Prediction not found",
      };
    }

    // Record the feedback
    const [feedback] = await db
      .insert(predictionFeedback)
      .values({
        id,
        predictionId: args.prediction_id,
        wasAccurate: args.was_accurate,
        accuracyScore: args.accuracy_score?.toString(),
        feedbackType: args.feedback_type,
        feedbackNote: args.feedback_note,
        createdAt: now,
      })
      .returning();

    // Update prediction validation
    await db
      .update(predictions)
      .set({
        validatedAt: now,
        validationResult: args.was_accurate ? "correct" : "incorrect",
        updatedAt: now,
      })
      .where(eq(predictions.id, args.prediction_id));

    // Update pattern accuracy if related patterns exist
    if (prediction.relatedPatternIds) {
      try {
        const patternIds: string[] = JSON.parse(prediction.relatedPatternIds);
        for (const patternId of patternIds) {
          await updatePatternAccuracy(patternId, args.was_accurate);
        }
      } catch (error) {
        logger.error("Error updating pattern accuracy:", error);
      }
    }

    logger.info(
      `Recorded feedback for prediction ${args.prediction_id}: ${args.was_accurate ? "accurate" : "inaccurate"}`
    );

    return {
      success: true,
      feedback,
    };
  } catch (error) {
    logger.error("Error recording prediction feedback:", error);
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Get prediction accuracy statistics
 */
export async function getPredictionAccuracyStats(): Promise<{
  success: boolean;
  stats?: any;
  error?: string;
}> {
  try {
    // Get all validated predictions
    const validatedPredictions = await db
      .select()
      .from(predictions)
      .where(inArray(predictions.validationResult, ["correct", "incorrect"]));

    // Calculate stats by type
    const statsByType: Record<
      string,
      {
        total: number;
        correct: number;
        incorrect: number;
        accuracy: number;
      }
    > = {};

    for (const prediction of validatedPredictions) {
      const type = prediction.type;
      if (!statsByType[type]) {
        statsByType[type] = {
          total: 0,
          correct: 0,
          incorrect: 0,
          accuracy: 0,
        };
      }

      statsByType[type].total++;
      if (prediction.validationResult === "correct") {
        statsByType[type].correct++;
      } else {
        statsByType[type].incorrect++;
      }
    }

    // Calculate accuracy rates
    for (const type in statsByType) {
      const stats = statsByType[type];
      stats.accuracy = stats.correct / stats.total;
    }

    // Overall stats
    const overallStats = {
      total: validatedPredictions.length,
      correct: validatedPredictions.filter((p) => p.validationResult === "correct")
        .length,
      incorrect: validatedPredictions.filter((p) => p.validationResult === "incorrect")
        .length,
      accuracy: 0,
    };

    if (overallStats.total > 0) {
      overallStats.accuracy = overallStats.correct / overallStats.total;
    }

    return {
      success: true,
      stats: {
        overall: overallStats,
        byType: statsByType,
      },
    };
  } catch (error) {
    logger.error("Error getting prediction accuracy stats:", error);
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Discover new patterns from historical data
 */
export async function discoverNewPatterns(args: {
  days_back?: number;
}): Promise<{
  success: boolean;
  patterns?: Pattern[];
  count?: number;
  error?: string;
}> {
  try {
    const daysBack = args.days_back || 90;
    const newPatterns = await discoverPatterns(daysBack);

    return {
      success: true,
      patterns: newPatterns,
      count: newPatterns.length,
    };
  } catch (error) {
    logger.error("Error discovering new patterns:", error);
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Register all prediction tools
 */
export const predictionTools = {
  build_fused_context: buildFusedContextTool,
  get_active_patterns: getActivePatternsTool,
  detect_anomalies: detectAnomaliesTool,
  create_prediction: createPrediction,
  get_pending_predictions: getPendingPredictions,
  execute_prediction: executePrediction,
  record_prediction_feedback: recordPredictionFeedback,
  get_prediction_accuracy_stats: getPredictionAccuracyStats,
  discover_new_patterns: discoverNewPatterns,
};

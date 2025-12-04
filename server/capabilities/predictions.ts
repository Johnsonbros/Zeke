/**
 * Predictions Capability - Integrated with Autonomous Intelligence System
 *
 * This module provides tools for ZEKE's predictive intelligence,
 * now fully integrated with intent parsing, knowledge extraction,
 * and proactive action orchestration.
 */

import { getFusedContext } from "../dataFusion";
import { getTemporalPatterns, extractKnowledge } from "../knowledgeExtractor";
import { getActiveUserIntents, getActiveCommitments } from "../intentParser";
import {
  runAutonomousOrchestration,
  recordActionFeedback,
} from "../autonomousOrchestrator";
import { analyzeFeedback, getFeedbackSummary } from "../feedbackLearner";
import { db } from "../db";
import {
  proactiveActions,
  actionFeedback,
  userIntents,
  temporalPatterns,
} from "../../shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";

/**
 * Build fused context from all data sources
 */
async function build_fused_context() {
  try {
    const context = await getFusedContext();

    return {
      success: true,
      context,
      message: "Fused context built successfully",
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to build fused context: ${error}`,
    };
  }
}

/**
 * Get active behavioral patterns
 */
async function get_active_patterns() {
  try {
    const patterns = await getTemporalPatterns(0.6);

    return {
      success: true,
      patterns: patterns.map((p) => ({
        pattern: p.pattern,
        frequency: p.frequency,
        timeOfDay: p.timeOfDay,
        dayOfWeek: p.dayOfWeek,
        confidence: parseFloat(p.confidence),
        observations: p.observations,
      })),
      count: patterns.length,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get patterns: ${error}`,
    };
  }
}

/**
 * Detect anomalies in recent behavior
 */
async function detect_anomalies() {
  try {
    // Get patterns and recent context
    const [patterns, context] = await Promise.all([
      getTemporalPatterns(0.7),
      getFusedContext(),
    ]);

    // Simple anomaly detection: compare current behavior to patterns
    const anomalies: any[] = [];

    // Check if current time matches expected patterns
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" });

    for (const pattern of patterns) {
      // If pattern says user does something at this time/day, check if they're doing it
      if (pattern.dayOfWeek === dayOfWeek) {
        const expectedTimeOfDay = getTimeOfDayFromHour(hour);
        if (pattern.timeOfDay && pattern.timeOfDay !== expectedTimeOfDay) {
          anomalies.push({
            type: "timing_anomaly",
            description: `Expected ${pattern.pattern} at ${pattern.timeOfDay}, but it's ${expectedTimeOfDay}`,
            confidence: parseFloat(pattern.confidence),
          });
        }
      }
    }

    return {
      success: true,
      anomalies,
      count: anomalies.length,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to detect anomalies: ${error}`,
    };
  }
}

/**
 * Create a prediction (legacy interface - now creates proactive action)
 */
async function create_prediction(args: {
  type: string;
  title: string;
  description: string;
  confidence: number;
  reasoning: string;
  suggestedAction?: string;
  requiresApproval?: boolean;
}) {
  try {
    // Run orchestration to process and potentially execute
    const result = await runAutonomousOrchestration();

    return {
      success: true,
      message: "Orchestration cycle completed",
      result,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to create prediction: ${error}`,
    };
  }
}

/**
 * Get pending predictions (proactive actions awaiting approval)
 */
async function get_pending_predictions() {
  try {
    const pending = await db
      .select()
      .from(proactiveActions)
      .where(eq(proactiveActions.status, "pending_approval"))
      .orderBy(desc(proactiveActions.createdAt))
      .limit(20);

    return {
      success: true,
      predictions: pending.map((p) => ({
        id: p.id,
        type: p.type,
        title: p.title,
        description: p.description,
        confidence: parseFloat(p.confidence),
        priority: p.priority,
        reasoning: p.reasoning,
        suggestedAction: p.suggestedAction,
        createdAt: p.createdAt,
      })),
      count: pending.length,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get pending predictions: ${error}`,
    };
  }
}

/**
 * Execute a prediction (approve and execute proactive action)
 */
async function execute_prediction(args: { predictionId: string }) {
  try {
    await recordActionFeedback(args.predictionId, "approved");

    return {
      success: true,
      message: "Prediction approved and executed",
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to execute prediction: ${error}`,
    };
  }
}

/**
 * Record prediction feedback
 */
async function record_prediction_feedback(args: {
  predictionId: string;
  wasAccurate: boolean;
  feedbackNote?: string;
}) {
  try {
    const feedbackType = args.wasAccurate ? "positive" : "negative";

    await recordActionFeedback(
      args.predictionId,
      feedbackType,
      args.feedbackNote
    );

    return {
      success: true,
      message: "Feedback recorded successfully",
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to record feedback: ${error}`,
    };
  }
}

/**
 * Get prediction accuracy statistics
 */
async function get_prediction_accuracy_stats() {
  try {
    const insights = await analyzeFeedback(30);
    const summary = await getFeedbackSummary(7);

    return {
      success: true,
      stats: {
        overallSuccessRate: insights.overallSuccessRate,
        successRateByType: insights.successRateByType,
        successRateByPriority: insights.successRateByPriority,
        successRateByTimeOfDay: insights.successRateByTimeOfDay,
        recommendedAdjustments: insights.recommendedAdjustments,
      },
      summary,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get accuracy stats: ${error}`,
    };
  }
}

/**
 * Discover new patterns from recent data
 */
async function discover_new_patterns() {
  try {
    // Run knowledge extraction to discover new patterns
    await extractKnowledge(168); // Last week

    const newPatterns = await db
      .select()
      .from(temporalPatterns)
      .where(
        gte(
          temporalPatterns.firstObserved,
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        )
      )
      .orderBy(desc(temporalPatterns.confidence));

    return {
      success: true,
      patterns: newPatterns.map((p) => ({
        pattern: p.pattern,
        frequency: p.frequency,
        confidence: parseFloat(p.confidence),
        observations: p.observations,
        context: p.context,
      })),
      count: newPatterns.length,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to discover patterns: ${error}`,
    };
  }
}

/**
 * Get user intents and goals
 */
async function get_user_intents() {
  try {
    const intents = await getActiveUserIntents(20);

    return {
      success: true,
      intents: intents.map((i) => ({
        id: i.id,
        type: i.type,
        description: i.description,
        confidence: parseFloat(i.confidence),
        priority: i.priority,
        timeframe: i.timeframe,
        context: i.context,
        extractedAt: i.extractedAt,
      })),
      count: intents.length,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get user intents: ${error}`,
    };
  }
}

/**
 * Get user commitments
 */
async function get_user_commitments() {
  try {
    const commitments = await getActiveCommitments();

    return {
      success: true,
      commitments: commitments.map((c) => ({
        id: c.id,
        commitment: c.commitment,
        confidence: parseFloat(c.confidence),
        priority: c.priority,
        dueDate: c.dueDate,
        context: c.context,
        extractedAt: c.extractedAt,
      })),
      count: commitments.length,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get commitments: ${error}`,
    };
  }
}

/**
 * Get proactive action history
 */
async function get_action_history(args?: { limit?: number; type?: string }) {
  try {
    const limit = args?.limit || 50;
    let query = db
      .select()
      .from(proactiveActions)
      .orderBy(desc(proactiveActions.createdAt))
      .limit(limit);

    if (args?.type) {
      query = db
        .select()
        .from(proactiveActions)
        .where(eq(proactiveActions.type, args.type as any))
        .orderBy(desc(proactiveActions.createdAt))
        .limit(limit);
    }

    const actions = await query;

    return {
      success: true,
      actions: actions.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        description: a.description,
        confidence: parseFloat(a.confidence),
        priority: a.priority,
        status: a.status,
        createdAt: a.createdAt,
        executedAt: a.executedAt,
        outcome: a.outcome,
      })),
      count: actions.length,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get action history: ${error}`,
    };
  }
}

// Helper function
function getTimeOfDayFromHour(hour: number): string {
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

/**
 * Export prediction tools for Claude
 */
export const predictionTools = {
  build_fused_context,
  get_active_patterns,
  detect_anomalies,
  create_prediction,
  get_pending_predictions,
  execute_prediction,
  record_prediction_feedback,
  get_prediction_accuracy_stats,
  discover_new_patterns,
  get_user_intents,
  get_user_commitments,
  get_action_history,
};

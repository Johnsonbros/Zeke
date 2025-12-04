/**
 * Predictions Capability
 *
 * Provides tools for the predictive intelligence system including pattern discovery,
 * anomaly detection, prediction creation and management, and feedback collection.
 */

import {
  createPrediction,
  getPendingPredictions,
  updatePrediction,
  getPredictionById,
  getAllPredictions,
  getPredictionStats,
  createPredictionFeedback,
  getActivePatterns,
  incrementPatternUsage,
  createPattern,
  type Prediction,
  type Pattern,
} from "../db.js";
import {
  buildFusedContext,
  detectAnomalies,
  type FusedContext,
  type Anomaly,
} from "../dataFusion.js";
import {
  discoverPatterns as discoverNewPatterns,
  getActivePatterns as getActivePatternsFromDb,
} from "../patternRecognition.js";
import logger from "../logging.js";

// Helper to execute tool calls (for executing prediction actions)
import { toolExecutors } from "../tools.js";

interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}

/**
 * Build a fused context from multiple data sources
 */
async function build_fused_context(): Promise<ToolResult> {
  try {
    const context = await buildFusedContext();
    return {
      success: true,
      data: context,
      message: "Fused context built successfully",
    };
  } catch (error: any) {
    logger.error("Error building fused context:", error);
    return {
      success: false,
      error: error.message || "Failed to build fused context",
    };
  }
}

/**
 * Get all active patterns from the database
 */
async function get_active_patterns(): Promise<ToolResult> {
  try {
    const patterns = await getActivePatternsFromDb();
    return {
      success: true,
      data: {
        patterns,
        count: patterns.length,
      },
      message: `Retrieved ${patterns.length} active patterns`,
    };
  } catch (error: any) {
    logger.error("Error getting active patterns:", error);
    return {
      success: false,
      error: error.message || "Failed to get active patterns",
    };
  }
}

/**
 * Detect anomalies in the current context
 */
async function detect_anomalies(params?: { context?: FusedContext }): Promise<ToolResult> {
  try {
    const context = params?.context || (await buildFusedContext());
    const anomalies = await detectAnomalies(context);

    return {
      success: true,
      data: {
        anomalies,
        count: anomalies.length,
        highSeverity: anomalies.filter(a => a.severity === "high").length,
      },
      message: `Detected ${anomalies.length} anomalies`,
    };
  } catch (error: any) {
    logger.error("Error detecting anomalies:", error);
    return {
      success: false,
      error: error.message || "Failed to detect anomalies",
    };
  }
}

/**
 * Create a new prediction
 */
async function create_prediction(params: {
  type: string;
  title: string;
  description: string;
  confidenceScore: string;
  confidenceLevel: string;
  suggestedAction: string;
  reasoning: string;
  dataSourcesUsed: string[];
  relatedPatternIds?: string[];
  predictedFor?: string;
  validUntil?: string;
  priority?: string;
  impactScore?: string;
  autoExecute?: boolean;
  requiresUserApproval?: boolean;
  actionData?: any;
}): Promise<ToolResult> {
  try {
    const prediction = createPrediction({
      type: params.type as any,
      title: params.title,
      description: params.description,
      confidenceScore: params.confidenceScore,
      confidenceLevel: params.confidenceLevel as any,
      suggestedAction: params.suggestedAction,
      reasoning: params.reasoning,
      dataSourcesUsed: JSON.stringify(params.dataSourcesUsed),
      relatedPatternIds: params.relatedPatternIds ? JSON.stringify(params.relatedPatternIds) : undefined,
      predictedFor: params.predictedFor,
      validUntil: params.validUntil,
      priority: params.priority as any,
      impactScore: params.impactScore,
      autoExecute: params.autoExecute,
      requiresUserApproval: params.requiresUserApproval,
      actionData: params.actionData ? JSON.stringify(params.actionData) : undefined,
    });

    // Increment usage count for related patterns
    if (params.relatedPatternIds) {
      for (const patternId of params.relatedPatternIds) {
        try {
          incrementPatternUsage(patternId);
        } catch (e) {
          logger.warn(`Failed to increment usage for pattern ${patternId}:`, e);
        }
      }
    }

    return {
      success: true,
      data: prediction,
      message: `Prediction created: ${prediction.title}`,
    };
  } catch (error: any) {
    logger.error("Error creating prediction:", error);
    return {
      success: false,
      error: error.message || "Failed to create prediction",
    };
  }
}

/**
 * Get all pending predictions
 */
async function get_pending_predictions(params?: { limit?: number }): Promise<ToolResult> {
  try {
    const predictions = getPendingPredictions().slice(0, params?.limit || 50);
    return {
      success: true,
      data: {
        predictions,
        count: predictions.length,
      },
      message: `Retrieved ${predictions.length} pending predictions`,
    };
  } catch (error: any) {
    logger.error("Error getting pending predictions:", error);
    return {
      success: false,
      error: error.message || "Failed to get pending predictions",
    };
  }
}

/**
 * Execute a prediction (perform the suggested action)
 */
async function execute_prediction(params: { predictionId: string }): Promise<ToolResult> {
  try {
    const prediction = getPredictionById(params.predictionId);
    if (!prediction) {
      return {
        success: false,
        error: "Prediction not found",
      };
    }

    if (prediction.status !== "pending") {
      return {
        success: false,
        error: `Prediction is ${prediction.status}, cannot execute`,
      };
    }

    // Parse action data
    let actionData: any = {};
    if (prediction.actionData) {
      try {
        actionData = JSON.parse(prediction.actionData);
      } catch (e) {
        logger.warn("Failed to parse prediction action data:", e);
      }
    }

    // Attempt to execute the action
    // The suggestedAction should be a tool name that we can execute
    let executionResult: any = {
      success: false,
      message: "Action execution not implemented for this action type",
    };

    // Try to execute using tool executors if available
    if (toolExecutors && typeof toolExecutors[prediction.suggestedAction] === "function") {
      try {
        executionResult = await toolExecutors[prediction.suggestedAction](actionData);
      } catch (error: any) {
        executionResult = {
          success: false,
          error: error.message || "Tool execution failed",
        };
      }
    }

    // Update prediction status
    const now = new Date().toISOString();
    updatePrediction(params.predictionId, {
      status: executionResult.success ? "executed" : "pending",
      executedAt: executionResult.success ? now : undefined,
    });

    return {
      success: executionResult.success,
      data: {
        prediction,
        executionResult,
      },
      message: executionResult.success
        ? `Prediction executed successfully`
        : `Prediction execution failed: ${executionResult.error || "Unknown error"}`,
    };
  } catch (error: any) {
    logger.error("Error executing prediction:", error);
    return {
      success: false,
      error: error.message || "Failed to execute prediction",
    };
  }
}

/**
 * Record feedback for a prediction
 */
async function record_prediction_feedback(params: {
  predictionId: string;
  wasAccurate: boolean;
  accuracyScore?: string;
  feedbackType: "explicit_user" | "implicit_behavior" | "outcome_validation";
  feedbackNote?: string;
  lessonsLearned?: string[];
  adjustmentsMade?: string[];
  affectedPatternIds?: string[];
}): Promise<ToolResult> {
  try {
    const prediction = getPredictionById(params.predictionId);
    if (!prediction) {
      return {
        success: false,
        error: "Prediction not found",
      };
    }

    // Create feedback record
    const feedback = createPredictionFeedback({
      predictionId: params.predictionId,
      wasAccurate: params.wasAccurate,
      accuracyScore: params.accuracyScore,
      feedbackType: params.feedbackType,
      feedbackNote: params.feedbackNote,
      lessonsLearned: params.lessonsLearned ? JSON.stringify(params.lessonsLearned) : undefined,
      adjustmentsMade: params.adjustmentsMade ? JSON.stringify(params.adjustmentsMade) : undefined,
      affectedPatternIds: params.affectedPatternIds ? JSON.stringify(params.affectedPatternIds) : undefined,
    });

    // Update prediction with validation info
    const now = new Date().toISOString();
    updatePrediction(params.predictionId, {
      validatedAt: now,
      validationResult: params.wasAccurate ? "correct" : "incorrect",
      userFeedback: params.wasAccurate ? "accurate" : "inaccurate",
      userFeedbackNote: params.feedbackNote,
    });

    return {
      success: true,
      data: feedback,
      message: "Prediction feedback recorded successfully",
    };
  } catch (error: any) {
    logger.error("Error recording prediction feedback:", error);
    return {
      success: false,
      error: error.message || "Failed to record prediction feedback",
    };
  }
}

/**
 * Get prediction accuracy statistics
 */
async function get_prediction_accuracy_stats(): Promise<ToolResult> {
  try {
    const stats = getPredictionStats();
    const allPredictions = getAllPredictions();

    // Calculate accuracy metrics
    const validated = allPredictions.filter(p => p.validationResult);
    const accurate = validated.filter(p => p.validationResult === "correct");
    const accuracyRate = validated.length > 0 ? (accurate.length / validated.length) * 100 : 0;

    // Accuracy by confidence level
    const byConfidence: Record<string, { total: number; accurate: number; rate: number }> = {};
    for (const level of ["very_high", "high", "medium", "low"]) {
      const levelPreds = validated.filter(p => p.confidenceLevel === level);
      const levelAccurate = levelPreds.filter(p => p.validationResult === "correct");
      byConfidence[level] = {
        total: levelPreds.length,
        accurate: levelAccurate.length,
        rate: levelPreds.length > 0 ? (levelAccurate.length / levelPreds.length) * 100 : 0,
      };
    }

    // Accuracy by type
    const byType: Record<string, { total: number; accurate: number; rate: number }> = {};
    const types = [...new Set(validated.map(p => p.type))];
    for (const type of types) {
      const typePreds = validated.filter(p => p.type === type);
      const typeAccurate = typePreds.filter(p => p.validationResult === "correct");
      byType[type] = {
        total: typePreds.length,
        accurate: typeAccurate.length,
        rate: typePreds.length > 0 ? (typeAccurate.length / typePreds.length) * 100 : 0,
      };
    }

    return {
      success: true,
      data: {
        overall: {
          total: stats.total,
          validated: validated.length,
          accurate: accurate.length,
          accuracyRate: Math.round(accuracyRate * 10) / 10,
        },
        byStatus: stats.byStatus,
        byType: stats.byType,
        accuracyByConfidence: byConfidence,
        accuracyByType: byType,
      },
      message: `Accuracy rate: ${Math.round(accuracyRate)}% (${accurate.length}/${validated.length} validated predictions)`,
    };
  } catch (error: any) {
    logger.error("Error getting prediction accuracy stats:", error);
    return {
      success: false,
      error: error.message || "Failed to get prediction accuracy stats",
    };
  }
}

/**
 * Discover new patterns from historical data
 */
async function discover_new_patterns(params?: { daysBack?: number }): Promise<ToolResult> {
  try {
    const daysBack = params?.daysBack || 90;
    const patterns = await discoverNewPatterns(daysBack);

    // Save patterns to database
    const savedPatterns: Pattern[] = [];
    for (const patternData of patterns) {
      try {
        const pattern = createPattern(patternData);
        savedPatterns.push(pattern);
      } catch (error: any) {
        logger.warn("Failed to save pattern:", error);
      }
    }

    return {
      success: true,
      data: {
        patterns: savedPatterns,
        count: savedPatterns.length,
        daysAnalyzed: daysBack,
      },
      message: `Discovered ${savedPatterns.length} new patterns from ${daysBack} days of data`,
    };
  } catch (error: any) {
    logger.error("Error discovering new patterns:", error);
    return {
      success: false,
      error: error.message || "Failed to discover new patterns",
    };
  }
}

/**
 * Tool definitions for OpenAI API
 */
export const predictionToolDefinitions = [
  {
    name: "build_fused_context",
    description: "Build a comprehensive fused context from multiple data sources (calendar, tasks, location, grocery, Limitless lifelogs, etc.) for predictive intelligence analysis.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: build_fused_context,
  },
  {
    name: "get_active_patterns",
    description: "Retrieve all active behavioral patterns that have been discovered from historical data. These patterns can be used to make predictions about future behavior.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: get_active_patterns,
  },
  {
    name: "detect_anomalies",
    description: "Detect anomalies in the current context by comparing against historical patterns and expected behavior. Returns high, medium, and low severity anomalies.",
    parameters: {
      type: "object",
      properties: {
        context: {
          type: "object",
          description: "Optional pre-built fused context. If not provided, will build one automatically.",
        },
      },
      required: [],
    },
    execute: detect_anomalies,
  },
  {
    name: "create_prediction",
    description: "Create a new prediction about future user needs or behaviors. Include confidence scores, suggested actions, and supporting reasoning.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["task_suggestion", "schedule_conflict", "resource_shortage", "routine_disruption", "contextual_reminder", "proactive_communication", "habit_reinforcement"],
          description: "Type of prediction being made",
        },
        title: { type: "string", description: "Short title for the prediction" },
        description: { type: "string", description: "Detailed description of what is predicted" },
        confidenceScore: { type: "string", description: "Confidence score (0.0-1.0)" },
        confidenceLevel: {
          type: "string",
          enum: ["very_high", "high", "medium", "low"],
          description: "Categorized confidence level",
        },
        suggestedAction: { type: "string", description: "The suggested action to take (tool name)" },
        reasoning: { type: "string", description: "Explanation of why this prediction was made" },
        dataSourcesUsed: {
          type: "array",
          items: { type: "string" },
          description: "List of data sources used to make this prediction",
        },
        relatedPatternIds: {
          type: "array",
          items: { type: "string" },
          description: "Pattern IDs that support this prediction",
        },
        predictedFor: { type: "string", description: "ISO timestamp for when this prediction applies" },
        validUntil: { type: "string", description: "ISO timestamp for when this prediction expires" },
        priority: {
          type: "string",
          enum: ["low", "medium", "high", "urgent"],
          description: "Priority level for this prediction",
        },
        impactScore: { type: "string", description: "Impact score (0.0-1.0) for potential impact" },
        autoExecute: { type: "boolean", description: "Whether to auto-execute if confidence is high" },
        requiresUserApproval: { type: "boolean", description: "Whether user approval is required" },
        actionData: { type: "object", description: "Parameters for the suggested action" },
      },
      required: ["type", "title", "description", "confidenceScore", "confidenceLevel", "suggestedAction", "reasoning", "dataSourcesUsed"],
    },
    execute: create_prediction,
  },
  {
    name: "get_pending_predictions",
    description: "Retrieve all pending predictions that have not yet been executed or dismissed. Useful for reviewing what ZEKE thinks should happen next.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximum number of predictions to return (default: 50)" },
      },
      required: [],
    },
    execute: get_pending_predictions,
  },
  {
    name: "execute_prediction",
    description: "Execute a pending prediction by performing its suggested action. This will attempt to call the appropriate tool with the prediction's action data.",
    parameters: {
      type: "object",
      properties: {
        predictionId: { type: "string", description: "ID of the prediction to execute" },
      },
      required: ["predictionId"],
    },
    execute: execute_prediction,
  },
  {
    name: "record_prediction_feedback",
    description: "Record feedback about whether a prediction was accurate. This helps the system learn and improve future predictions.",
    parameters: {
      type: "object",
      properties: {
        predictionId: { type: "string", description: "ID of the prediction" },
        wasAccurate: { type: "boolean", description: "Whether the prediction was accurate" },
        accuracyScore: { type: "string", description: "Accuracy score (0.0-1.0) for partial accuracy" },
        feedbackType: {
          type: "string",
          enum: ["explicit_user", "implicit_behavior", "outcome_validation"],
          description: "Type of feedback being provided",
        },
        feedbackNote: { type: "string", description: "Optional note explaining the feedback" },
        lessonsLearned: {
          type: "array",
          items: { type: "string" },
          description: "What was learned from this prediction",
        },
        adjustmentsMade: {
          type: "array",
          items: { type: "string" },
          description: "What adjustments should be made to future predictions",
        },
        affectedPatternIds: {
          type: "array",
          items: { type: "string" },
          description: "Pattern IDs that should be updated based on this feedback",
        },
      },
      required: ["predictionId", "wasAccurate", "feedbackType"],
    },
    execute: record_prediction_feedback,
  },
  {
    name: "get_prediction_accuracy_stats",
    description: "Get comprehensive accuracy statistics for all predictions, including overall accuracy rate, accuracy by confidence level, and accuracy by prediction type.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: get_prediction_accuracy_stats,
  },
  {
    name: "discover_new_patterns",
    description: "Analyze historical data to discover new behavioral patterns. This runs pattern discovery algorithms across tasks, calendar, location, grocery, and conversation data.",
    parameters: {
      type: "object",
      properties: {
        daysBack: { type: "number", description: "Number of days of historical data to analyze (default: 90)" },
      },
      required: [],
    },
    execute: discover_new_patterns,
  },
];

/**
 * Tool names for easy reference
 */
export const predictionToolNames = predictionToolDefinitions.map((t) => t.name);

/**
 * Export all prediction tool functions
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
};

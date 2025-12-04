/**
 * Feedback Learner - Learns from user responses to improve proactivity
 *
 * This module analyzes user feedback patterns to:
 * 1. Adjust confidence thresholds
 * 2. Learn user preferences
 * 3. Optimize timing and frequency
 * 4. Improve action relevance
 */

import { db } from "./db";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import {
  actionFeedback,
  proactiveActions,
  userPreferences,
  proactivitySettings
} from "./schema";
import { updateProactivityConfig } from "./proactivityFilter";

export interface FeedbackInsights {
  overallSuccessRate: number;
  successRateByType: Record<string, number>;
  successRateByPriority: Record<string, number>;
  successRateByTimeOfDay: Record<string, number>;
  commonRejectionReasons: string[];
  recommendedAdjustments: Adjustment[];
}

export interface Adjustment {
  parameter: string;
  currentValue: any;
  recommendedValue: any;
  reasoning: string;
  confidence: number;
}

/**
 * Analyze feedback and generate insights
 */
export async function analyzeFeedback(
  daysBack: number = 30
): Promise<FeedbackInsights> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);

  // Get all feedback since cutoff
  const feedback = await db
    .select({
      feedback: actionFeedback,
      action: proactiveActions
    })
    .from(actionFeedback)
    .innerJoin(
      proactiveActions,
      eq(actionFeedback.actionId, proactiveActions.id)
    )
    .where(gte(actionFeedback.providedAt, cutoff.toISOString()));

  if (feedback.length === 0) {
    return {
      overallSuccessRate: 1.0,
      successRateByType: {},
      successRateByPriority: {},
      successRateByTimeOfDay: {},
      commonRejectionReasons: [],
      recommendedAdjustments: []
    };
  }

  // Calculate overall success rate
  const positive = feedback.filter(f =>
    f.feedback.feedbackType === 'positive' || f.feedback.feedbackType === 'approved'
  ).length;
  const overallSuccessRate = positive / feedback.length;

  // Success rate by action type
  const successRateByType = calculateSuccessRateByDimension(
    feedback,
    f => f.action.type
  );

  // Success rate by priority
  const successRateByPriority = calculateSuccessRateByDimension(
    feedback,
    f => f.action.priority
  );

  // Success rate by time of day
  const successRateByTimeOfDay = calculateSuccessRateByDimension(
    feedback,
    f => getTimeOfDay(f.action.executedAt || f.action.createdAt)
  );

  // Common rejection reasons
  const rejections = feedback.filter(f =>
    f.feedback.feedbackType === 'negative' || f.feedback.feedbackType === 'rejected'
  );
  const rejectionReasons = rejections
    .map(f => f.feedback.comments)
    .filter((c): c is string => !!c);

  // Generate recommended adjustments
  const adjustments = await generateRecommendedAdjustments(
    overallSuccessRate,
    successRateByType,
    successRateByPriority,
    successRateByTimeOfDay
  );

  return {
    overallSuccessRate,
    successRateByType,
    successRateByPriority,
    successRateByTimeOfDay,
    commonRejectionReasons: rejectionReasons,
    recommendedAdjustments: adjustments
  };
}

/**
 * Calculate success rate by a dimension
 */
function calculateSuccessRateByDimension(
  feedback: any[],
  dimensionExtractor: (f: any) => string
): Record<string, number> {
  const byDimension: Record<string, { total: number; positive: number }> = {};

  for (const f of feedback) {
    const dimension = dimensionExtractor(f);
    if (!dimension) continue;

    if (!byDimension[dimension]) {
      byDimension[dimension] = { total: 0, positive: 0 };
    }

    byDimension[dimension].total++;

    if (
      f.feedback.feedbackType === 'positive' ||
      f.feedback.feedbackType === 'approved'
    ) {
      byDimension[dimension].positive++;
    }
  }

  const rates: Record<string, number> = {};
  for (const [dimension, stats] of Object.entries(byDimension)) {
    rates[dimension] = stats.positive / stats.total;
  }

  return rates;
}

/**
 * Get time of day category from timestamp
 */
function getTimeOfDay(timestamp: string): string {
  const hour = new Date(timestamp).getHours();

  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

/**
 * Generate recommended adjustments based on feedback analysis
 */
async function generateRecommendedAdjustments(
  overallSuccessRate: number,
  successRateByType: Record<string, number>,
  successRateByPriority: Record<string, number>,
  successRateByTimeOfDay: Record<string, number>
): Promise<Adjustment[]> {
  const adjustments: Adjustment[] = [];

  // Get current settings
  const currentSettings = await db
    .select()
    .from(proactivitySettings)
    .limit(1);

  const current = currentSettings[0] || {
    minConfidence: '0.7',
    maxActionsPerHour: 3,
    maxActionsPerDay: 10,
    autoExecuteThreshold: '0.9'
  };

  // Adjust min confidence based on overall success rate
  if (overallSuccessRate < 0.4) {
    adjustments.push({
      parameter: 'minConfidence',
      currentValue: parseFloat(current.minConfidence),
      recommendedValue: Math.min(0.95, parseFloat(current.minConfidence) + 0.1),
      reasoning: `Success rate is low (${(overallSuccessRate * 100).toFixed(0)}%). Raising confidence threshold to be more selective.`,
      confidence: 0.9
    });
  } else if (overallSuccessRate > 0.8 && parseFloat(current.minConfidence) > 0.6) {
    adjustments.push({
      parameter: 'minConfidence',
      currentValue: parseFloat(current.minConfidence),
      recommendedValue: Math.max(0.5, parseFloat(current.minConfidence) - 0.05),
      reasoning: `Success rate is high (${(overallSuccessRate * 100).toFixed(0)}%). Can lower threshold to be more proactive.`,
      confidence: 0.7
    });
  }

  // Adjust frequency based on success rate
  if (overallSuccessRate > 0.7 && current.maxActionsPerDay < 15) {
    adjustments.push({
      parameter: 'maxActionsPerDay',
      currentValue: current.maxActionsPerDay,
      recommendedValue: current.maxActionsPerDay + 2,
      reasoning: 'High success rate indicates user finds actions helpful. Can increase frequency.',
      confidence: 0.75
    });
  } else if (overallSuccessRate < 0.4 && current.maxActionsPerDay > 5) {
    adjustments.push({
      parameter: 'maxActionsPerDay',
      currentValue: current.maxActionsPerDay,
      recommendedValue: Math.max(5, current.maxActionsPerDay - 2),
      reasoning: 'Low success rate suggests too many actions. Reducing frequency.',
      confidence: 0.85
    });
  }

  // Learn preferences from type success rates
  for (const [type, rate] of Object.entries(successRateByType)) {
    if (rate < 0.3) {
      // User doesn't like this type of action
      const prefExists = await db
        .select()
        .from(userPreferences)
        .where(
          and(
            eq(userPreferences.category, 'proactivity'),
            sql`${userPreferences.preference} LIKE ${`%${type}%`}`
          )
        )
        .limit(1);

      if (prefExists.length === 0) {
        await db.insert(userPreferences).values({
          category: 'proactivity',
          preference: `Reduce ${type} notifications`,
          strength: 'dislike',
          confidence: rate.toString(),
          context: `User rejected ${type} actions ${((1 - rate) * 100).toFixed(0)}% of the time`,
          source: 'feedback_learning',
          learnedAt: new Date().toISOString()
        });

        adjustments.push({
          parameter: `${type}_enabled`,
          currentValue: true,
          recommendedValue: false,
          reasoning: `${type} actions have low success rate (${(rate * 100).toFixed(0)}%)`,
          confidence: 0.8
        });
      }
    }
  }

  // Identify best time of day
  const bestTimeOfDay = Object.entries(successRateByTimeOfDay)
    .sort((a, b) => b[1] - a[1])[0];

  if (bestTimeOfDay && bestTimeOfDay[1] > 0.8) {
    adjustments.push({
      parameter: 'preferredTimeOfDay',
      currentValue: 'any',
      recommendedValue: bestTimeOfDay[0],
      reasoning: `${bestTimeOfDay[0]} has highest success rate (${(bestTimeOfDay[1] * 100).toFixed(0)}%)`,
      confidence: 0.7
    });
  }

  return adjustments;
}

/**
 * Apply recommended adjustments automatically
 */
export async function applyRecommendedAdjustments(
  adjustments: Adjustment[],
  minConfidenceToApply: number = 0.8
): Promise<number> {
  let applied = 0;

  for (const adjustment of adjustments) {
    if (adjustment.confidence < minConfidenceToApply) {
      console.log(`[FeedbackLearner] Skipping low-confidence adjustment: ${adjustment.parameter}`);
      continue;
    }

    try {
      if (adjustment.parameter === 'minConfidence') {
        await updateProactivityConfig({
          minConfidence: adjustment.recommendedValue
        });
        applied++;
      } else if (adjustment.parameter === 'maxActionsPerDay') {
        await updateProactivityConfig({
          maxActionsPerDay: adjustment.recommendedValue
        });
        applied++;
      } else if (adjustment.parameter === 'maxActionsPerHour') {
        await updateProactivityConfig({
          maxActionsPerHour: adjustment.recommendedValue
        });
        applied++;
      }

      console.log(
        `[FeedbackLearner] Applied adjustment: ${adjustment.parameter} = ${adjustment.recommendedValue} (was ${adjustment.currentValue})`
      );
    } catch (error) {
      console.error(`[FeedbackLearner] Error applying adjustment ${adjustment.parameter}:`, error);
    }
  }

  return applied;
}

/**
 * Run feedback learning cycle
 */
export async function runFeedbackLearningCycle(): Promise<void> {
  console.log("[FeedbackLearner] Starting feedback learning cycle");

  try {
    // Analyze feedback from last 30 days
    const insights = await analyzeFeedback(30);

    console.log(`[FeedbackLearner] Overall success rate: ${(insights.overallSuccessRate * 100).toFixed(1)}%`);
    console.log(`[FeedbackLearner] Generated ${insights.recommendedAdjustments.length} recommendations`);

    // Apply high-confidence adjustments
    const applied = await applyRecommendedAdjustments(insights.recommendedAdjustments, 0.8);

    console.log(`[FeedbackLearner] Applied ${applied} adjustments`);

    // Log insights for monitoring
    if (insights.recommendedAdjustments.length > 0) {
      for (const adj of insights.recommendedAdjustments) {
        console.log(
          `[FeedbackLearner]   ${adj.parameter}: ${adj.currentValue} → ${adj.recommendedValue} (confidence: ${adj.confidence.toFixed(2)})`
        );
        console.log(`[FeedbackLearner]   Reasoning: ${adj.reasoning}`);
      }
    }
  } catch (error) {
    console.error("[FeedbackLearner] Error in learning cycle:", error);
  }
}

/**
 * Get feedback summary for user review
 */
export async function getFeedbackSummary(daysBack: number = 7): Promise<string> {
  const insights = await analyzeFeedback(daysBack);

  let summary = `📊 ZEKE Proactivity Report (Last ${daysBack} days)\n\n`;

  summary += `Overall Success Rate: ${(insights.overallSuccessRate * 100).toFixed(1)}%\n\n`;

  if (Object.keys(insights.successRateByType).length > 0) {
    summary += "Success by Action Type:\n";
    for (const [type, rate] of Object.entries(insights.successRateByType)) {
      summary += `  ${type}: ${(rate * 100).toFixed(0)}%\n`;
    }
    summary += "\n";
  }

  if (Object.keys(insights.successRateByTimeOfDay).length > 0) {
    summary += "Best Times for Proactive Actions:\n";
    const sorted = Object.entries(insights.successRateByTimeOfDay)
      .sort((a, b) => b[1] - a[1]);

    for (const [time, rate] of sorted) {
      summary += `  ${time}: ${(rate * 100).toFixed(0)}%\n`;
    }
    summary += "\n";
  }

  if (insights.recommendedAdjustments.length > 0) {
    summary += "Recommended Adjustments:\n";
    for (const adj of insights.recommendedAdjustments.slice(0, 3)) {
      summary += `  • ${adj.reasoning}\n`;
    }
  }

  return summary;
}

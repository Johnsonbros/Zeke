/**
 * Proactivity Filter - Determines what's worth acting on
 *
 * This module prevents ZEKE from being annoying by:
 * 1. Filtering low-confidence insights
 * 2. Respecting user preferences and feedback
 * 3. Considering context appropriateness (timing, location)
 * 4. Enforcing frequency limits
 * 5. Learning from user responses
 */

import { db } from "./db";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import {
  proactiveActions,
  proactivitySettings,
  actionFeedback,
  userPreferences
} from "./schema";

export interface ProactiveActionCandidate {
  id?: string;
  type: 'reminder' | 'suggestion' | 'insight' | 'alert' | 'question' | 'automation';
  title: string;
  description: string;
  confidence: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  reasoning: string;
  suggestedAction?: string;
  requiresApproval: boolean;
  dataSourcesUsed: string[];
  validUntil?: string;
  context?: any;
}

export interface FilterResult {
  shouldAct: boolean;
  reason: string;
  adjustedPriority?: 'low' | 'medium' | 'high' | 'urgent';
  suggestedTiming?: string; // When to execute if not now
}

export interface ProactivityConfig {
  minConfidence: number; // 0-1
  maxActionsPerHour: number;
  maxActionsPerDay: number;
  quietHoursStart?: string; // "22:00"
  quietHoursEnd?: string; // "07:00"
  preferredNotificationMethods: ('sms' | 'push' | 'silent')[];
  autoExecuteThreshold: number; // Confidence threshold for auto-execution
}

/**
 * Evaluate whether a proactive action should be taken
 */
export async function evaluateProactiveAction(
  candidate: ProactiveActionCandidate
): Promise<FilterResult> {
  // Get proactivity settings
  const config = await getProactivityConfig();

  // 1. Confidence threshold check
  if (candidate.confidence < config.minConfidence) {
    return {
      shouldAct: false,
      reason: `Confidence ${candidate.confidence.toFixed(2)} below threshold ${config.minConfidence}`
    };
  }

  // 2. Frequency limit check
  const recentActions = await getRecentActionsCount();
  if (recentActions.lastHour >= config.maxActionsPerHour) {
    return {
      shouldAct: false,
      reason: `Frequency limit reached (${recentActions.lastHour}/${config.maxActionsPerHour} per hour)`,
      suggestedTiming: 'next_hour'
    };
  }

  if (recentActions.lastDay >= config.maxActionsPerDay) {
    return {
      shouldAct: false,
      reason: `Daily limit reached (${recentActions.lastDay}/${config.maxActionsPerDay} per day)`,
      suggestedTiming: 'tomorrow'
    };
  }

  // 3. Quiet hours check
  if (isQuietHours(config)) {
    // Only allow urgent items during quiet hours
    if (candidate.priority !== 'urgent') {
      return {
        shouldAct: false,
        reason: 'Quiet hours active - only urgent items allowed',
        suggestedTiming: config.quietHoursEnd
      };
    }
  }

  // 4. Check for similar recent actions (avoid redundancy)
  const isDuplicate = await checkForDuplicateAction(candidate);
  if (isDuplicate) {
    return {
      shouldAct: false,
      reason: 'Similar action already taken recently'
    };
  }

  // 5. User preference check
  const preferenceCheck = await checkUserPreferences(candidate);
  if (!preferenceCheck.allowed) {
    return {
      shouldAct: false,
      reason: preferenceCheck.reason
    };
  }

  // 6. Context appropriateness check
  const contextCheck = await checkContextAppropriateness(candidate);
  if (!contextCheck.appropriate) {
    return {
      shouldAct: false,
      reason: contextCheck.reason,
      suggestedTiming: contextCheck.suggestedTiming
    };
  }

  // 7. Historical effectiveness check
  const effectiveness = await checkHistoricalEffectiveness(candidate.type);
  if (effectiveness.successRate < 0.3 && effectiveness.totalFeedback > 5) {
    return {
      shouldAct: false,
      reason: `Low historical effectiveness (${(effectiveness.successRate * 100).toFixed(0)}% success rate)`
    };
  }

  // Adjust priority based on context
  const adjustedPriority = adjustPriorityBasedOnContext(candidate, contextCheck);

  return {
    shouldAct: true,
    reason: 'All checks passed',
    adjustedPriority
  };
}

/**
 * Get proactivity configuration
 */
async function getProactivityConfig(): Promise<ProactivityConfig> {
  try {
    const settings = await db
      .select()
      .from(proactivitySettings)
      .limit(1);

    if (settings.length > 0) {
      const s = settings[0];
      return {
        minConfidence: parseFloat(s.minConfidence),
        maxActionsPerHour: s.maxActionsPerHour,
        maxActionsPerDay: s.maxActionsPerDay,
        quietHoursStart: s.quietHoursStart || undefined,
        quietHoursEnd: s.quietHoursEnd || undefined,
        preferredNotificationMethods: s.preferredNotificationMethods
          ? JSON.parse(s.preferredNotificationMethods)
          : ['sms'],
        autoExecuteThreshold: parseFloat(s.autoExecuteThreshold)
      };
    }
  } catch (error) {
    console.error("Error loading proactivity config:", error);
  }

  // Default configuration - conservative
  return {
    minConfidence: 0.7,
    maxActionsPerHour: 3,
    maxActionsPerDay: 10,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    preferredNotificationMethods: ['sms'],
    autoExecuteThreshold: 0.9
  };
}

/**
 * Get count of recent proactive actions
 */
async function getRecentActionsCount(): Promise<{ lastHour: number; lastDay: number }> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  try {
    const lastHour = await db
      .select({ count: sql<number>`count(*)` })
      .from(proactiveActions)
      .where(
        and(
          gte(proactiveActions.executedAt, oneHourAgo.toISOString()),
          eq(proactiveActions.status, 'executed')
        )
      );

    const lastDay = await db
      .select({ count: sql<number>`count(*)` })
      .from(proactiveActions)
      .where(
        and(
          gte(proactiveActions.executedAt, oneDayAgo.toISOString()),
          eq(proactiveActions.status, 'executed')
        )
      );

    return {
      lastHour: lastHour[0]?.count || 0,
      lastDay: lastDay[0]?.count || 0
    };
  } catch (error) {
    console.error("Error getting recent actions count:", error);
    return { lastHour: 0, lastDay: 0 };
  }
}

/**
 * Check if current time is during quiet hours
 */
function isQuietHours(config: ProactivityConfig): boolean {
  if (!config.quietHoursStart || !config.quietHoursEnd) {
    return false;
  }

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;

  const [startHour, startMinute] = config.quietHoursStart.split(':').map(Number);
  const [endHour, endMinute] = config.quietHoursEnd.split(':').map(Number);

  const startTime = startHour * 60 + startMinute;
  const endTime = endHour * 60 + endMinute;

  // Handle overnight quiet hours (e.g., 22:00 to 07:00)
  if (startTime > endTime) {
    return currentTime >= startTime || currentTime < endTime;
  }

  return currentTime >= startTime && currentTime < endTime;
}

/**
 * Check for duplicate/similar actions recently taken
 */
async function checkForDuplicateAction(candidate: ProactiveActionCandidate): Promise<boolean> {
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);

  try {
    const recentActions = await db
      .select()
      .from(proactiveActions)
      .where(
        and(
          eq(proactiveActions.type, candidate.type),
          gte(proactiveActions.executedAt, oneHourAgo.toISOString())
        )
      );

    // Check for similar titles (fuzzy match)
    for (const action of recentActions) {
      if (isSimilarTitle(action.title, candidate.title)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error("Error checking for duplicate actions:", error);
    return false;
  }
}

/**
 * Check if two titles are similar (simple fuzzy match)
 */
function isSimilarTitle(title1: string, title2: string): boolean {
  const normalize = (s: string) => s.toLowerCase().trim().replace(/[^\w\s]/g, '');
  const n1 = normalize(title1);
  const n2 = normalize(title2);

  // Exact match
  if (n1 === n2) return true;

  // One contains the other
  if (n1.includes(n2) || n2.includes(n1)) return true;

  // Calculate Jaccard similarity on words
  const words1 = new Set(n1.split(/\s+/));
  const words2 = new Set(n2.split(/\s+/));

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  const similarity = intersection.size / union.size;

  return similarity > 0.6;
}

/**
 * Check user preferences for this type of action
 */
async function checkUserPreferences(
  candidate: ProactiveActionCandidate
): Promise<{ allowed: boolean; reason: string }> {
  try {
    // Check for explicit preferences about this action type
    const prefs = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.category, 'proactivity'));

    for (const pref of prefs) {
      // Check if user has expressed dislike for this type of action
      if (
        pref.strength === 'strong_dislike' &&
        pref.preference.toLowerCase().includes(candidate.type)
      ) {
        return {
          allowed: false,
          reason: `User prefers not to receive ${candidate.type} notifications`
        };
      }
    }

    return { allowed: true, reason: 'No conflicting preferences' };
  } catch (error) {
    console.error("Error checking user preferences:", error);
    return { allowed: true, reason: 'Error checking preferences, allowing by default' };
  }
}

/**
 * Check if the action is contextually appropriate right now
 */
async function checkContextAppropriateness(
  candidate: ProactiveActionCandidate
): Promise<{ appropriate: boolean; reason: string; suggestedTiming?: string }> {
  // Get current context
  const now = new Date();
  const hour = now.getHours();

  // Don't send low-priority items late at night or very early morning
  if ((hour < 7 || hour >= 22) && candidate.priority === 'low') {
    return {
      appropriate: false,
      reason: 'Low priority item outside reasonable hours',
      suggestedTiming: 'morning'
    };
  }

  // Check if user is likely in a meeting (based on calendar)
  const inMeeting = await isUserInMeeting();
  if (inMeeting && candidate.priority !== 'urgent') {
    return {
      appropriate: false,
      reason: 'User appears to be in a meeting',
      suggestedTiming: 'after_meeting'
    };
  }

  // Check if user is likely driving (based on location speed)
  const isDriving = await isUserDriving();
  if (isDriving && candidate.type !== 'alert') {
    return {
      appropriate: false,
      reason: 'User appears to be driving',
      suggestedTiming: 'when_stopped'
    };
  }

  return { appropriate: true, reason: 'Context is appropriate' };
}

/**
 * Check historical effectiveness of this action type
 */
async function checkHistoricalEffectiveness(
  actionType: string
): Promise<{ successRate: number; totalFeedback: number }> {
  try {
    const feedback = await db
      .select()
      .from(actionFeedback)
      .where(eq(actionFeedback.actionType, actionType));

    if (feedback.length === 0) {
      return { successRate: 1.0, totalFeedback: 0 }; // No data, assume good
    }

    const positive = feedback.filter(f =>
      f.feedbackType === 'positive' || f.feedbackType === 'approved'
    ).length;

    return {
      successRate: positive / feedback.length,
      totalFeedback: feedback.length
    };
  } catch (error) {
    console.error("Error checking historical effectiveness:", error);
    return { successRate: 1.0, totalFeedback: 0 };
  }
}

/**
 * Adjust priority based on context
 */
function adjustPriorityBasedOnContext(
  candidate: ProactiveActionCandidate,
  contextCheck: any
): 'low' | 'medium' | 'high' | 'urgent' {
  // If context is marginal, downgrade priority
  if (contextCheck.reason.includes('outside reasonable hours')) {
    if (candidate.priority === 'high') return 'medium';
    if (candidate.priority === 'medium') return 'low';
  }

  return candidate.priority;
}

// Helper functions
async function isUserInMeeting(): Promise<boolean> {
  try {
    const { listEvents } = await import('./googleCalendar');
    const now = new Date();
    const events = await listEvents(
      now.toISOString(),
      new Date(now.getTime() + 5 * 60 * 1000).toISOString() // Next 5 minutes
    );

    return events.length > 0;
  } catch (error) {
    return false;
  }
}

async function isUserDriving(): Promise<boolean> {
  try {
    const { locationHistory } = await import('./schema');
    const fiveMinutesAgo = new Date();
    fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);

    const recentLocations = await db
      .select()
      .from(locationHistory)
      .where(gte(locationHistory.createdAt, fiveMinutesAgo.toISOString()))
      .orderBy(desc(locationHistory.createdAt))
      .limit(5);

    if (recentLocations.length < 2) return false;

    // Check if speed indicates driving (> 10 mph / 4.5 m/s)
    const avgSpeed = recentLocations
      .filter(loc => loc.speed)
      .map(loc => parseFloat(loc.speed!))
      .reduce((sum, speed) => sum + speed, 0) / recentLocations.length;

    return avgSpeed > 4.5;
  } catch (error) {
    return false;
  }
}

/**
 * Update proactivity settings
 */
export async function updateProactivityConfig(
  updates: Partial<ProactivityConfig>
): Promise<void> {
  const current = await getProactivityConfig();
  const updated = { ...current, ...updates };

  await db.insert(proactivitySettings).values({
    minConfidence: updated.minConfidence.toString(),
    maxActionsPerHour: updated.maxActionsPerHour,
    maxActionsPerDay: updated.maxActionsPerDay,
    quietHoursStart: updated.quietHoursStart,
    quietHoursEnd: updated.quietHoursEnd,
    preferredNotificationMethods: JSON.stringify(updated.preferredNotificationMethods),
    autoExecuteThreshold: updated.autoExecuteThreshold.toString(),
    updatedAt: new Date().toISOString()
  }).onConflictDoUpdate({
    target: proactivitySettings.id,
    set: {
      minConfidence: updated.minConfidence.toString(),
      maxActionsPerHour: updated.maxActionsPerHour,
      maxActionsPerDay: updated.maxActionsPerDay,
      quietHoursStart: updated.quietHoursStart,
      quietHoursEnd: updated.quietHoursEnd,
      preferredNotificationMethods: JSON.stringify(updated.preferredNotificationMethods),
      autoExecuteThreshold: updated.autoExecuteThreshold.toString(),
      updatedAt: new Date().toISOString()
    }
  });
}

/**
 * Limitless Daily Digest - Automated Evening SMS Summaries
 * 
 * Sends a daily SMS summary of conversations captured by the Limitless pendant.
 * Features:
 * - Configurable send time (default 8pm)
 * - Character-aware SMS formatting
 * - Includes key discussions, action items, and people interacted with
 * - Respects notification preferences and quiet hours
 */

import * as cron from "node-cron";
import { getPreference, setPreference, getContactByPhone } from "./db";
import { generateDailySummary, getLifelogOverview } from "./limitless";
import { queueNotification } from "./notificationBatcher";
import { isMasterAdmin } from "@shared/schema";
import type { LimitlessDigestPreferences, LimitlessDiscussionPoint, LimitlessActionItem } from "@shared/schema";

let scheduledTask: cron.ScheduledTask | null = null;

const DEFAULT_PREFERENCES: LimitlessDigestPreferences = {
  enabled: false,
  sendTime: "20:00",
  includeSummary: true,
  includeActionItems: true,
  includeTopPeople: true,
  maxSmsLength: 700,
};

/**
 * Get current digest preferences
 */
export function getLimitlessDigestPreferences(): LimitlessDigestPreferences {
  const prefData = getPreference("limitless_digest_prefs")?.value;
  if (prefData) {
    try {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(prefData) };
    } catch {
      return DEFAULT_PREFERENCES;
    }
  }
  return DEFAULT_PREFERENCES;
}

/**
 * Update digest preferences
 */
export function updateLimitlessDigestPreferences(updates: Partial<LimitlessDigestPreferences>): LimitlessDigestPreferences {
  const current = getLimitlessDigestPreferences();
  const updated = { ...current, ...updates };
  
  setPreference({
    key: "limitless_digest_prefs",
    value: JSON.stringify(updated),
  });
  
  // Reschedule if time changed or enabled state changed
  if (updates.sendTime !== undefined || updates.enabled !== undefined) {
    if (updated.enabled && updated.phoneNumber) {
      scheduleDigest(updated.sendTime);
    } else {
      stopDigest();
    }
  }
  
  return updated;
}

/**
 * Format the daily summary for SMS with character limit awareness
 */
function formatDigestForSms(
  summary: {
    summaryTitle: string;
    keyDiscussions: LimitlessDiscussionPoint[];
    actionItems: LimitlessActionItem[];
    peopleInteracted: string[];
  },
  maxLength: number = 700
): string {
  const parts: string[] = [];
  
  // Header
  parts.push(`ZEKE DAILY DIGEST`);
  parts.push(`${summary.summaryTitle}`);
  parts.push("");
  
  // Key discussions (limit to top 2)
  if (summary.keyDiscussions.length > 0) {
    parts.push("Highlights:");
    const topDiscussions = summary.keyDiscussions.slice(0, 2);
    for (const d of topDiscussions) {
      const line = `- ${d.title}`;
      parts.push(line.length > 60 ? line.substring(0, 57) + "..." : line);
    }
    parts.push("");
  }
  
  // Action items (limit to top 3)
  const highPriorityItems = summary.actionItems.filter(a => a.priority === "high");
  const itemsToShow = highPriorityItems.length > 0 
    ? highPriorityItems.slice(0, 3)
    : summary.actionItems.slice(0, 3);
  
  if (itemsToShow.length > 0) {
    parts.push("Action Items:");
    for (const item of itemsToShow) {
      const line = `- ${item.task}${item.dueDate ? ` (${item.dueDate})` : ""}`;
      parts.push(line.length > 60 ? line.substring(0, 57) + "..." : line);
    }
    parts.push("");
  }
  
  // People interacted with
  if (summary.peopleInteracted.length > 0) {
    const people = summary.peopleInteracted.slice(0, 5).join(", ");
    parts.push(`People: ${people}`);
  }
  
  let message = parts.join("\n");
  
  // Truncate if too long
  if (message.length > maxLength) {
    message = message.substring(0, maxLength - 3) + "...";
  }
  
  return message;
}

/**
 * Generate and send the daily digest SMS
 */
export async function sendDailyDigest(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const prefs = getLimitlessDigestPreferences();
  
  if (!prefs.enabled) {
    return { success: false, error: "Digest is not enabled" };
  }
  
  if (!prefs.phoneNumber) {
    console.log("[LimitlessDigest] No phone number configured");
    return { success: false, error: "No phone number configured" };
  }
  
  // Access control check
  let isAuthorized = false;
  let authInfo = "unknown";
  
  if (isMasterAdmin(prefs.phoneNumber)) {
    isAuthorized = true;
    authInfo = "master admin";
  } else {
    const contact = getContactByPhone(prefs.phoneNumber);
    if (contact && contact.accessLevel === "admin") {
      isAuthorized = true;
      authInfo = `admin contact: ${contact.name}`;
    } else {
      authInfo = contact ? `${contact.name} (${contact.accessLevel})` : prefs.phoneNumber;
    }
  }
  
  if (!isAuthorized) {
    console.log(`[LimitlessDigest] ACCESS DENIED: Phone ${prefs.phoneNumber} is not authorized (${authInfo})`);
    return { success: false, error: "Phone number not authorized for digest" };
  }
  
  try {
    // Check if there are any conversations today
    const overview = await getLifelogOverview();
    if (!overview.connected) {
      return { success: false, error: "Limitless API not connected" };
    }
    
    if (overview.today.count === 0) {
      console.log("[LimitlessDigest] No conversations today, skipping digest");
      return { success: true, message: "No conversations to digest" };
    }
    
    // Generate the summary for today
    const today = new Date().toISOString().split("T")[0];
    const result = await generateDailySummary(today);
    
    if (!result) {
      return { success: false, error: "Failed to generate summary" };
    }
    
    // Parse the summary JSON fields
    const keyDiscussions: LimitlessDiscussionPoint[] = result.summary.keyDiscussions 
      ? JSON.parse(result.summary.keyDiscussions)
      : [];
    const actionItems: LimitlessActionItem[] = result.summary.actionItems
      ? JSON.parse(result.summary.actionItems)
      : [];
    const peopleInteracted: string[] = result.summary.peopleInteracted
      ? JSON.parse(result.summary.peopleInteracted)
      : [];
    
    // Format for SMS
    const smsContent = formatDigestForSms(
      {
        summaryTitle: result.summary.summaryTitle,
        keyDiscussions,
        actionItems,
        peopleInteracted,
      },
      prefs.maxSmsLength
    );
    
    // Queue the notification (respects quiet hours and batching)
    await queueNotification({
      recipientPhone: prefs.phoneNumber,
      title: "Daily Digest",
      content: smsContent,
      category: "reminder",
      priority: "normal",
    });
    
    console.log(`[LimitlessDigest] Queued daily digest for ${prefs.phoneNumber} (${authInfo})`);
    return { success: true, message: `Digest sent to ${prefs.phoneNumber}` };
    
  } catch (error: any) {
    console.error("[LimitlessDigest] Error sending digest:", error);
    return { success: false, error: error.message || "Failed to send digest" };
  }
}

/**
 * Schedule the daily digest at the configured time
 */
export function scheduleDigest(time: string = "20:00"): void {
  if (scheduledTask) {
    scheduledTask.stop();
    console.log("[LimitlessDigest] Stopped existing schedule");
  }
  
  const [hours, minutes] = time.split(":").map(Number);
  const cronExpression = `${minutes} ${hours} * * *`;
  
  scheduledTask = cron.schedule(
    cronExpression,
    async () => {
      console.log("[LimitlessDigest] Running scheduled daily digest...");
      const result = await sendDailyDigest();
      if (result.success) {
        console.log(`[LimitlessDigest] ${result.message}`);
      } else {
        console.log(`[LimitlessDigest] ${result.error}`);
      }
    },
    {
      timezone: "America/New_York",
    }
  );
  
  console.log(`[LimitlessDigest] Scheduled at ${time} (America/New_York) - Cron: ${cronExpression}`);
}

/**
 * Stop the scheduled digest
 */
export function stopDigest(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log("[LimitlessDigest] Stopped digest schedule");
  }
}

/**
 * Configure the daily digest
 */
export function configureDigest(phoneNumber: string, time: string = "20:00"): LimitlessDigestPreferences {
  const prefs = updateLimitlessDigestPreferences({
    enabled: true,
    phoneNumber,
    sendTime: time,
  });
  
  scheduleDigest(time);
  console.log(`[LimitlessDigest] Configured: ${phoneNumber} at ${time}`);
  
  return prefs;
}

/**
 * Initialize the digest scheduler on server startup
 */
export function initializeLimitlessDigest(): void {
  const prefs = getLimitlessDigestPreferences();
  
  if (prefs.enabled && prefs.phoneNumber) {
    scheduleDigest(prefs.sendTime);
    console.log(`[LimitlessDigest] Restored schedule for ${prefs.phoneNumber} at ${prefs.sendTime}`);
  } else {
    console.log("[LimitlessDigest] Not configured or disabled");
  }
}

/**
 * Get the current digest status
 */
export function getDigestStatus(): {
  configured: boolean;
  enabled: boolean;
  phoneNumber?: string;
  sendTime: string;
  isScheduled: boolean;
} {
  const prefs = getLimitlessDigestPreferences();
  
  return {
    configured: Boolean(prefs.phoneNumber),
    enabled: prefs.enabled,
    phoneNumber: prefs.phoneNumber,
    sendTime: prefs.sendTime,
    isScheduled: scheduledTask !== null,
  };
}

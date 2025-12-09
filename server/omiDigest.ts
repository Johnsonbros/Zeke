/**
 * Omi Daily Digest - Automated Evening SMS Summaries
 * 
 * Sends a daily SMS summary of conversations captured by the Omi wearable.
 * Features:
 * - Configurable send time (default 8pm)
 * - Character-aware SMS formatting
 * - Includes key discussions, action items, and people interacted with
 * - Respects notification preferences and quiet hours
 */

import * as cron from "node-cron";
import {
  getPreference,
  setPreference,
  getContactByPhone,
  getLocationHistoryInRange,
  findNearbyPlaces,
} from "./db";
import { generateDailySummary, getMemoryOverview } from "./omi";
import { queueNotification } from "./notificationBatcher";
import { isMasterAdmin } from "@shared/schema";
import type { OmiDigestPreferences, OmiDiscussionPoint, OmiActionItem } from "@shared/schema";

let scheduledTask: cron.ScheduledTask | null = null;

const DEFAULT_PREFERENCES: OmiDigestPreferences = {
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
export function getOmiDigestPreferences(): OmiDigestPreferences {
  const prefData = getPreference("omi_digest_prefs")?.value;
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
export function updateOmiDigestPreferences(updates: Partial<OmiDigestPreferences>): OmiDigestPreferences {
  const current = getOmiDigestPreferences();
  const updated = { ...current, ...updates };
  
  setPreference({
    key: "omi_digest_prefs",
    value: JSON.stringify(updated),
  });
  
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
 * Analyze location patterns for the day
 */
function analyzeDailyLocationPatterns(date: string): {
  placesVisited: string[];
  mostFrequentPlace?: string;
  totalPlaces: number;
} {
  try {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const locationHistory = getLocationHistoryInRange(startDate.toISOString(), endDate.toISOString());

    if (locationHistory.length === 0) {
      return { placesVisited: [], totalPlaces: 0 };
    }

    const placeVisits = new Map<string, number>();

    for (const loc of locationHistory) {
      const lat = parseFloat(loc.latitude);
      const lng = parseFloat(loc.longitude);
      const nearbyPlaces = findNearbyPlaces(lat, lng, 150);

      if (nearbyPlaces.length > 0) {
        const closestPlace = nearbyPlaces[0];
        const count = placeVisits.get(closestPlace.name) || 0;
        placeVisits.set(closestPlace.name, count + 1);
      }
    }

    const sortedPlaces = Array.from(placeVisits.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    return {
      placesVisited: sortedPlaces,
      mostFrequentPlace: sortedPlaces[0],
      totalPlaces: sortedPlaces.length,
    };
  } catch (error) {
    console.error("Error analyzing location patterns:", error);
    return { placesVisited: [], totalPlaces: 0 };
  }
}

/**
 * Format the daily summary for SMS with character limit awareness
 */
function formatDigestForSms(
  summary: {
    summaryTitle: string;
    keyDiscussions: OmiDiscussionPoint[];
    actionItems: OmiActionItem[];
    peopleInteracted: string[];
  },
  locationAnalysis: {
    placesVisited: string[];
    mostFrequentPlace?: string;
    totalPlaces: number;
  },
  maxLength: number = 700
): string {
  const parts: string[] = [];

  parts.push(`ZEKE DAILY DIGEST`);
  parts.push(`${summary.summaryTitle}`);
  parts.push("");

  if (summary.keyDiscussions.length > 0) {
    parts.push("Highlights:");
    const topDiscussions = summary.keyDiscussions.slice(0, 2);
    for (const d of topDiscussions) {
      const line = `- ${d.title}`;
      parts.push(line.length > 60 ? line.substring(0, 57) + "..." : line);
    }
    parts.push("");
  }

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

  if (locationAnalysis.totalPlaces > 0) {
    const placesLine = locationAnalysis.placesVisited.slice(0, 3).join(", ");
    if (locationAnalysis.totalPlaces === 1) {
      parts.push(`Location: ${placesLine}`);
    } else if (locationAnalysis.totalPlaces === 2) {
      parts.push(`Locations: ${placesLine}`);
    } else {
      parts.push(`Places visited: ${placesLine}${locationAnalysis.totalPlaces > 3 ? ` +${locationAnalysis.totalPlaces - 3} more` : ""}`);
    }
    parts.push("");
  }

  if (summary.peopleInteracted.length > 0) {
    const people = summary.peopleInteracted.slice(0, 5).join(", ");
    parts.push(`People: ${people}`);
  }

  let message = parts.join("\n");

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
  const prefs = getOmiDigestPreferences();
  
  if (!prefs.enabled) {
    return { success: false, error: "Digest is not enabled" };
  }
  
  if (!prefs.phoneNumber) {
    console.log("[OmiDigest] No phone number configured");
    return { success: false, error: "No phone number configured" };
  }
  
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
    console.log(`[OmiDigest] ACCESS DENIED: Phone ${prefs.phoneNumber} is not authorized (${authInfo})`);
    return { success: false, error: "Phone number not authorized for digest" };
  }
  
  try {
    const overview = await getMemoryOverview();
    if (!overview.connected) {
      return { success: false, error: "Omi API not connected" };
    }
    
    if (overview.today.count === 0) {
      console.log("[OmiDigest] No conversations today, skipping digest");
      return { success: true, message: "No conversations to digest" };
    }
    
    const today = new Date().toISOString().split("T")[0];
    const result = await generateDailySummary(today);
    
    if (!result) {
      return { success: false, error: "Failed to generate summary" };
    }
    
    const keyDiscussions: OmiDiscussionPoint[] = result.summary.keyDiscussions 
      ? JSON.parse(result.summary.keyDiscussions)
      : [];
    const actionItems: OmiActionItem[] = result.summary.actionItems
      ? JSON.parse(result.summary.actionItems)
      : [];
    const peopleInteracted: string[] = result.summary.peopleInteracted
      ? JSON.parse(result.summary.peopleInteracted)
      : [];

    const locationAnalysis = analyzeDailyLocationPatterns(today);

    const smsContent = formatDigestForSms(
      {
        summaryTitle: result.summary.summaryTitle,
        keyDiscussions,
        actionItems,
        peopleInteracted,
      },
      locationAnalysis,
      prefs.maxSmsLength
    );
    
    await queueNotification({
      recipientPhone: prefs.phoneNumber,
      title: "Daily Digest",
      content: smsContent,
      category: "reminder",
      priority: "normal",
    });
    
    console.log(`[OmiDigest] Queued daily digest for ${prefs.phoneNumber} (${authInfo})`);
    return { success: true, message: `Digest sent to ${prefs.phoneNumber}` };
    
  } catch (error: any) {
    console.error("[OmiDigest] Error sending digest:", error);
    return { success: false, error: error.message || "Failed to send digest" };
  }
}

/**
 * Schedule the daily digest at the configured time
 */
export function scheduleDigest(time: string = "20:00"): void {
  if (scheduledTask) {
    scheduledTask.stop();
    console.log("[OmiDigest] Stopped existing schedule");
  }
  
  const [hours, minutes] = time.split(":").map(Number);
  const cronExpression = `${minutes} ${hours} * * *`;
  
  scheduledTask = cron.schedule(
    cronExpression,
    async () => {
      console.log("[OmiDigest] Running scheduled daily digest...");
      const result = await sendDailyDigest();
      if (result.success) {
        console.log(`[OmiDigest] ${result.message}`);
      } else {
        console.log(`[OmiDigest] ${result.error}`);
      }
    },
    {
      timezone: "America/New_York",
    }
  );
  
  console.log(`[OmiDigest] Scheduled at ${time} (America/New_York) - Cron: ${cronExpression}`);
}

/**
 * Stop the scheduled digest
 */
export function stopDigest(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log("[OmiDigest] Stopped digest schedule");
  }
}

/**
 * Configure the daily digest
 */
export function configureDigest(phoneNumber: string, time: string = "20:00"): OmiDigestPreferences {
  const prefs = updateOmiDigestPreferences({
    enabled: true,
    phoneNumber,
    sendTime: time,
  });
  
  scheduleDigest(time);
  console.log(`[OmiDigest] Configured: ${phoneNumber} at ${time}`);
  
  return prefs;
}

/**
 * Initialize the digest scheduler on server startup
 */
export function initializeOmiDigest(): void {
  const prefs = getOmiDigestPreferences();
  
  if (prefs.enabled && prefs.phoneNumber) {
    scheduleDigest(prefs.sendTime);
    console.log(`[OmiDigest] Restored schedule for ${prefs.phoneNumber} at ${prefs.sendTime}`);
  } else {
    console.log("[OmiDigest] Not configured or disabled");
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
  const prefs = getOmiDigestPreferences();
  
  return {
    configured: Boolean(prefs.phoneNumber),
    enabled: prefs.enabled,
    phoneNumber: prefs.phoneNumber,
    sendTime: prefs.sendTime,
    isScheduled: scheduledTask !== null,
  };
}

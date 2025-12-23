/**
 * Smart Notification Batching Service for ZEKE
 * 
 * Features:
 * - Collects notifications into a queue instead of sending immediately
 * - Batches notifications based on configurable time windows
 * - Respects quiet hours (prevents notifications during sleep time)
 * - Prioritizes urgent notifications (can bypass batching and quiet hours)
 * - Groups notifications by category for cleaner message format
 */

import * as cron from "node-cron";
import {
  createNotificationQueueItem,
  getPendingNotifications,
  getAllPendingNotifications,
  getNotificationPreferences,
  updateNotificationPreferences,
  createNotificationBatch,
  getNotificationQueueStats,
  clearOldNotifications
} from "./db";
import type { 
  NotificationQueueItem, 
  InsertNotificationQueue, 
  NotificationPreferences,
  NotificationPriority,
  NotificationCategory
} from "@shared/schema";

// SMS callback function type
type SendSmsCallback = (phone: string, message: string) => Promise<void>;

let sendSmsCallback: SendSmsCallback | null = null;
let batchSchedulerTask: cron.ScheduledTask | null = null;

/**
 * Configure the SMS callback for sending batched notifications
 */
export function setNotificationSmsCallback(callback: SendSmsCallback): void {
  sendSmsCallback = callback;
  console.log("[NotificationBatcher] SMS callback configured");
}

/**
 * Check if we're currently in quiet hours
 */
export function isInQuietHours(preferences: NotificationPreferences): boolean {
  if (!preferences.quietHoursEnabled) {
    return false;
  }

  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
  const start = preferences.quietHoursStart;
  const end = preferences.quietHoursEnd;

  // Handle case where quiet hours span midnight (e.g., 21:00 - 08:00)
  if (start > end) {
    return currentTime >= start || currentTime < end;
  } else {
    return currentTime >= start && currentTime < end;
  }
}

/**
 * Queue a notification for batched sending
 * Returns the queued notification or sends immediately if urgent
 */
export async function queueNotification(data: InsertNotificationQueue): Promise<NotificationQueueItem> {
  const preferences = getNotificationPreferences();
  
  // If notifications are disabled, still queue but don't send
  if (!preferences.enabled) {
    console.log("[NotificationBatcher] Notifications disabled, queuing for later");
    return createNotificationQueueItem(data);
  }

  // If it's urgent and bypass is enabled, send immediately
  if (data.priority === "urgent" && preferences.urgentBypassQuietHours) {
    console.log("[NotificationBatcher] Urgent notification - sending immediately");
    const queued = createNotificationQueueItem(data);
    await sendSingleNotification(queued);
    return queued;
  }

  // If batching is disabled, send immediately (respecting quiet hours)
  if (!preferences.batchingEnabled) {
    if (isInQuietHours(preferences) && data.priority !== "urgent") {
      console.log("[NotificationBatcher] In quiet hours, queuing notification");
      return createNotificationQueueItem(data);
    }
    console.log("[NotificationBatcher] Batching disabled - sending immediately");
    const queued = createNotificationQueueItem(data);
    await sendSingleNotification(queued);
    return queued;
  }

  // Queue for batch sending
  console.log(`[NotificationBatcher] Queuing notification: ${data.title}`);
  return createNotificationQueueItem(data);
}

/**
 * Send a single notification immediately
 */
async function sendSingleNotification(notification: NotificationQueueItem): Promise<void> {
  if (!sendSmsCallback) {
    console.error("[NotificationBatcher] SMS callback not configured");
    return;
  }

  try {
    const message = formatSingleNotification(notification);
    await sendSmsCallback(notification.recipientPhone, message);
    
    // Mark as sent with its own batch ID
    createNotificationBatch(
      notification.recipientPhone, 
      [notification.id], 
      [notification.category]
    );
    
    console.log(`[NotificationBatcher] Sent single notification to ${notification.recipientPhone}`);
  } catch (error) {
    console.error("[NotificationBatcher] Failed to send notification:", error);
  }
}

/**
 * Format a single notification into an SMS message
 */
function formatSingleNotification(notification: NotificationQueueItem): string {
  const priorityPrefix = getPriorityPrefix(notification.priority);
  return `${priorityPrefix}${notification.title}\n\n${notification.content}`;
}

/**
 * Get text prefix for notification priority
 */
function getPriorityPrefix(priority: NotificationPriority): string {
  switch (priority) {
    case "urgent": return "[URGENT] ";
    case "high": return "[!] ";
    case "normal": return "";
    case "low": return "";
    default: return "";
  }
}

/**
 * Get category label for display
 */
function getCategoryLabel(category: NotificationCategory): string {
  const labels: Record<NotificationCategory, string> = {
    reminder: "Reminders",
    task: "Tasks",
    calendar: "Calendar",
    insight: "Insights",
    grocery: "Grocery",
    message: "Messages",
    alert: "Alerts",
    system: "System"
  };
  return labels[category] || category;
}

/**
 * Format batched notifications into a single SMS message
 */
function formatBatchedNotifications(notifications: NotificationQueueItem[]): string {
  // Group notifications by category
  const grouped = new Map<NotificationCategory, NotificationQueueItem[]>();
  
  for (const notification of notifications) {
    const category = notification.category;
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(notification);
  }

  // Build the message
  const parts: string[] = [];
  parts.push(`[ZEKE] You have ${notifications.length} notification${notifications.length > 1 ? 's' : ''}:\n`);

  for (const [category, items] of grouped) {
    const categoryLabel = getCategoryLabel(category);
    parts.push(`\n${categoryLabel}:`);
    
    for (const item of items) {
      const prefix = getPriorityPrefix(item.priority);
      parts.push(`- ${prefix}${item.title}`);
    }
  }

  parts.push("\n\nReply 'DETAILS' for more info.");

  return parts.join('\n');
}

/**
 * Process and send pending notifications for a recipient
 */
export async function processPendingNotifications(recipientPhone: string): Promise<number> {
  if (!sendSmsCallback) {
    console.error("[NotificationBatcher] SMS callback not configured");
    return 0;
  }

  const preferences = getNotificationPreferences();
  
  // Check quiet hours
  if (isInQuietHours(preferences)) {
    console.log("[NotificationBatcher] In quiet hours, skipping batch processing");
    return 0;
  }

  const pending = getPendingNotifications(recipientPhone);
  if (pending.length === 0) {
    return 0;
  }

  // Limit batch size
  const batchSize = Math.min(pending.length, preferences.maxBatchSize);
  const toSend = pending.slice(0, batchSize);

  try {
    const message = toSend.length === 1 
      ? formatSingleNotification(toSend[0])
      : formatBatchedNotifications(toSend);
    
    await sendSmsCallback(recipientPhone, message);
    
    // Create batch record
    const categories = [...new Set(toSend.map(n => n.category))];
    createNotificationBatch(
      recipientPhone,
      toSend.map(n => n.id),
      categories
    );
    
    console.log(`[NotificationBatcher] Sent batch of ${toSend.length} notifications to ${recipientPhone}`);
    return toSend.length;
  } catch (error) {
    console.error("[NotificationBatcher] Failed to send batch:", error);
    return 0;
  }
}

/**
 * Process all pending notifications across all recipients
 */
export async function processAllPendingNotifications(): Promise<number> {
  const allPending = await getAllPendingNotifications();
  if (allPending.length === 0) {
    return 0;
  }

  // Group by recipient
  const byRecipient = new Map<string, NotificationQueueItem[]>();
  for (const notification of allPending) {
    const phone = notification.recipientPhone;
    if (!byRecipient.has(phone)) {
      byRecipient.set(phone, []);
    }
    byRecipient.get(phone)!.push(notification);
  }

  let totalSent = 0;
  for (const [recipientPhone] of byRecipient) {
    const sent = await processPendingNotifications(recipientPhone);
    totalSent += sent;
  }

  return totalSent;
}

/**
 * Initialize the batch scheduler
 */
export function initializeBatchScheduler(): void {
  const preferences = getNotificationPreferences();
  const intervalMinutes = preferences.batchIntervalMinutes;
  
  // Stop existing scheduler if any
  if (batchSchedulerTask) {
    batchSchedulerTask.stop();
    batchSchedulerTask = null;
  }

  // Create cron expression for the interval
  // For example, if interval is 30 minutes, run at 0 and 30 minutes of each hour
  const cronExpression = `*/${intervalMinutes} * * * *`;

  batchSchedulerTask = cron.schedule(
    cronExpression,
    async () => {
      console.log("[NotificationBatcher] Running scheduled batch processing...");
      const sent = await processAllPendingNotifications();
      if (sent > 0) {
        console.log(`[NotificationBatcher] Sent ${sent} notifications in batch`);
      }
    },
    {
      timezone: "America/New_York"
    }
  );

  console.log(`[NotificationBatcher] Batch scheduler initialized (every ${intervalMinutes} minutes)`);

  // Also schedule daily cleanup of old notifications
  cron.schedule(
    "0 3 * * *", // 3 AM daily
    () => {
      const cleared = clearOldNotifications(7);
      if (cleared > 0) {
        console.log(`[NotificationBatcher] Cleared ${cleared} old notifications`);
      }
    },
    {
      timezone: "America/New_York"
    }
  );
}

/**
 * Update batch interval and restart scheduler
 */
export function updateBatchInterval(intervalMinutes: number): void {
  updateNotificationPreferences({ batchIntervalMinutes: intervalMinutes });
  initializeBatchScheduler();
  console.log(`[NotificationBatcher] Updated batch interval to ${intervalMinutes} minutes`);
}

/**
 * Get current notification queue status
 */
export function getQueueStatus(): {
  stats: ReturnType<typeof getNotificationQueueStats>;
  preferences: NotificationPreferences;
  isInQuietHours: boolean;
  schedulerActive: boolean;
} {
  const preferences = getNotificationPreferences();
  return {
    stats: getNotificationQueueStats(),
    preferences,
    isInQuietHours: isInQuietHours(preferences),
    schedulerActive: batchSchedulerTask !== null
  };
}

/**
 * Helper: Queue a reminder notification
 */
export async function queueReminderNotification(
  recipientPhone: string,
  title: string,
  content: string,
  reminderId?: string
): Promise<NotificationQueueItem> {
  return queueNotification({
    recipientPhone,
    category: "reminder",
    priority: "high",
    title,
    content,
    sourceType: reminderId ? "reminder" : undefined,
    sourceId: reminderId
  });
}

/**
 * Helper: Queue a task notification
 */
export async function queueTaskNotification(
  recipientPhone: string,
  title: string,
  content: string,
  taskId?: string,
  priority: NotificationPriority = "normal"
): Promise<NotificationQueueItem> {
  return queueNotification({
    recipientPhone,
    category: "task",
    priority,
    title,
    content,
    sourceType: taskId ? "task" : undefined,
    sourceId: taskId
  });
}

/**
 * Helper: Queue an insight notification
 */
export async function queueInsightNotification(
  recipientPhone: string,
  title: string,
  content: string,
  insightId?: string
): Promise<NotificationQueueItem> {
  return queueNotification({
    recipientPhone,
    category: "insight",
    priority: "low",
    title,
    content,
    sourceType: insightId ? "insight" : undefined,
    sourceId: insightId
  });
}

/**
 * Helper: Queue an alert notification (sends immediately if urgent)
 */
export async function queueAlertNotification(
  recipientPhone: string,
  title: string,
  content: string,
  urgent: boolean = false
): Promise<NotificationQueueItem> {
  return queueNotification({
    recipientPhone,
    category: "alert",
    priority: urgent ? "urgent" : "high",
    title,
    content
  });
}

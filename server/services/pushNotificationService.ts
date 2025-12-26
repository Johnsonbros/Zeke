import { db } from "../db";
import * as schema from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";

interface ExpoPushMessage {
  to: string;
  sound?: "default" | null;
  title?: string;
  body: string;
  data?: Record<string, unknown>;
  ttl?: number;
  expiration?: number;
  priority?: "default" | "normal" | "high";
  subtitle?: string;
  badge?: number;
  channelId?: string;
  categoryId?: string;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  priority?: "default" | "normal" | "high";
  channelId?: string;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function getActivePushTokens(): Promise<schema.PushToken[]> {
  const tokens = await db
    .select()
    .from(schema.pushTokens)
    .where(eq(schema.pushTokens.enabled, true));
  return tokens;
}

export async function getPushTokensByDeviceIds(deviceIds: string[]): Promise<schema.PushToken[]> {
  if (deviceIds.length === 0) return [];
  const tokens = await db
    .select()
    .from(schema.pushTokens)
    .where(and(
      inArray(schema.pushTokens.deviceId, deviceIds),
      eq(schema.pushTokens.enabled, true)
    ));
  return tokens;
}

async function sendToExpo(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
  if (messages.length === 0) return [];

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      console.error("[PushNotification] Expo API error:", response.status, response.statusText);
      return [];
    }

    const result = await response.json();
    return result.data || [];
  } catch (error) {
    console.error("[PushNotification] Failed to send to Expo:", error);
    return [];
  }
}

export async function sendPushNotification(
  payload: PushNotificationPayload,
  deviceIds?: string[]
): Promise<{ sent: number; failed: number }> {
  let tokens: schema.PushToken[];

  if (deviceIds && deviceIds.length > 0) {
    tokens = await getPushTokensByDeviceIds(deviceIds);
  } else {
    tokens = await getActivePushTokens();
  }

  if (tokens.length === 0) {
    console.log("[PushNotification] No active push tokens found");
    return { sent: 0, failed: 0 };
  }

  const messages: ExpoPushMessage[] = tokens.map((token) => ({
    to: token.token,
    sound: payload.sound ?? "default",
    title: payload.title,
    body: payload.body,
    data: payload.data,
    priority: payload.priority ?? "high",
    channelId: payload.channelId,
  }));

  console.log(`[PushNotification] Sending ${messages.length} notifications`);
  const tickets = await sendToExpo(messages);

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i];
    if (ticket.status === "ok") {
      sent++;
      const token = tokens[i];
      if (token) {
        await db
          .update(schema.pushTokens)
          .set({ lastUsedAt: new Date().toISOString() })
          .where(eq(schema.pushTokens.id, token.id));
      }
    } else {
      failed++;
      console.error(`[PushNotification] Failed ticket:`, ticket.message, ticket.details);
      
      if (ticket.details?.error === "DeviceNotRegistered") {
        const token = tokens[i];
        if (token) {
          console.log(`[PushNotification] Disabling unregistered token: ${token.deviceId}`);
          await db
            .update(schema.pushTokens)
            .set({ enabled: false })
            .where(eq(schema.pushTokens.id, token.id));
        }
      }
    }
  }

  console.log(`[PushNotification] Sent: ${sent}, Failed: ${failed}`);
  return { sent, failed };
}

export async function sendNewsNotification(
  headline: string,
  summary: string,
  storyId: string,
  topic?: string
): Promise<{ sent: number; failed: number }> {
  return sendPushNotification({
    title: topic ? `News: ${topic}` : "ZEKE News Update",
    body: headline,
    data: {
      type: "news",
      storyId,
      summary,
    },
    channelId: "news",
    priority: "default",
  });
}

export async function sendInsightNotification(
  title: string,
  insight: string,
  insightId: string,
  priority: "low" | "medium" | "high" = "medium"
): Promise<{ sent: number; failed: number }> {
  return sendPushNotification({
    title: `ZEKE Insight: ${title}`,
    body: insight,
    data: {
      type: "insight",
      insightId,
    },
    channelId: "insights",
    priority: priority === "high" ? "high" : "default",
  });
}

export async function sendAlertNotification(
  title: string,
  message: string,
  alertType: string,
  data?: Record<string, unknown>
): Promise<{ sent: number; failed: number }> {
  return sendPushNotification({
    title,
    body: message,
    data: {
      type: "alert",
      alertType,
      ...data,
    },
    channelId: "alerts",
    priority: "high",
  });
}

export async function sendBriefingNotification(
  briefingType: "morning" | "evening",
  summary: string
): Promise<{ sent: number; failed: number }> {
  const title = briefingType === "morning" 
    ? "Good Morning - Your Daily Briefing" 
    : "Evening Recap";
  
  return sendPushNotification({
    title,
    body: summary,
    data: {
      type: "briefing",
      briefingType,
    },
    channelId: "briefings",
    priority: "default",
  });
}

export async function sendReminderNotification(
  title: string,
  message: string,
  reminderId: string,
  dueAt?: string
): Promise<{ sent: number; failed: number }> {
  return sendPushNotification({
    title: `Reminder: ${title}`,
    body: message,
    data: {
      type: "reminder",
      reminderId,
      dueAt,
    },
    channelId: "reminders",
    priority: "high",
  });
}

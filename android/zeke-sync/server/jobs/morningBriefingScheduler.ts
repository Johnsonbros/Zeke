/**
 * Morning Briefing Scheduler for ZEKE
 * 
 * Runs a scheduled job at 6 AM to generate and send the morning briefing via SMS.
 * Uses Twilio for SMS delivery.
 */

import * as cron from "node-cron";
import { generateMorningBriefing, formatBriefingForSMS } from "./anticipationEngine";
import { detectPatterns, getPatternSummary } from "./patternDetection";
import { getTwilioClient, getTwilioFromPhoneNumber, isTwilioConfigured } from "../twilioClient";

let scheduledTask: cron.ScheduledTask | null = null;
let lastDeliveryTime: Date | null = null;
let lastDeliveryStatus: "success" | "failed" | "pending" | null = null;
let lastDeliveryError: string | null = null;

export interface SchedulerConfig {
  enabled: boolean;
  cronSchedule: string;
  recipientPhone: string | null;
  includePatterns: boolean;
  timezone: string;
}

let config: SchedulerConfig = {
  enabled: false,
  cronSchedule: "0 6 * * *",
  recipientPhone: null,
  includePatterns: true,
  timezone: "America/New_York",
};

async function sendSmsViaTwilio(to: string, message: string): Promise<boolean> {
  const configured = await isTwilioConfigured();
  if (!configured) {
    console.error("[MorningBriefingScheduler] Twilio not configured via Replit connector");
    return false;
  }

  try {
    const client = await getTwilioClient();
    const fromNumber = await getTwilioFromPhoneNumber();

    await client.messages.create({
      body: message,
      to,
      from: fromNumber,
    });

    console.log(`[MorningBriefingScheduler] SMS sent to ${to}`);
    return true;
  } catch (error) {
    console.error("[MorningBriefingScheduler] Failed to send SMS:", error);
    return false;
  }
}

async function deliverMorningBriefing(): Promise<void> {
  console.log(`[MorningBriefingScheduler] Starting morning briefing delivery at ${new Date().toISOString()}`);
  lastDeliveryStatus = "pending";
  lastDeliveryError = null;

  try {
    const briefing = await generateMorningBriefing();
    let smsContent = formatBriefingForSMS(briefing);

    if (config.includePatterns) {
      const patterns = await detectPatterns(168);
      if (patterns.insights.length > 0) {
        const insight = patterns.insights[0];
        if (smsContent.length + insight.length + 3 <= 320) {
          smsContent += `\n\n${insight}`;
        }
      }
    }

    if (config.recipientPhone) {
      const success = await sendSmsViaTwilio(config.recipientPhone, smsContent);
      if (success) {
        lastDeliveryStatus = "success";
        lastDeliveryTime = new Date();
        console.log("[MorningBriefingScheduler] Briefing delivered successfully");
      } else {
        lastDeliveryStatus = "failed";
        lastDeliveryError = "Failed to send SMS via Twilio";
      }
    } else {
      console.log("[MorningBriefingScheduler] No recipient configured, briefing generated but not sent");
      console.log("[MorningBriefingScheduler] SMS Content:", smsContent);
      lastDeliveryStatus = "success";
      lastDeliveryTime = new Date();
    }
  } catch (error) {
    console.error("[MorningBriefingScheduler] Delivery failed:", error);
    lastDeliveryStatus = "failed";
    lastDeliveryError = error instanceof Error ? error.message : String(error);
  }
}

export function startMorningBriefingScheduler(options?: Partial<SchedulerConfig>): void {
  if (options) {
    config = { ...config, ...options };
  }

  if (scheduledTask) {
    scheduledTask.stop();
  }

  if (!config.enabled) {
    console.log("[MorningBriefingScheduler] Scheduler is disabled");
    return;
  }

  scheduledTask = cron.schedule(
    config.cronSchedule,
    () => {
      deliverMorningBriefing();
    },
    {
      timezone: config.timezone,
    }
  );

  console.log(`[MorningBriefingScheduler] Scheduled at "${config.cronSchedule}" (${config.timezone})`);
}

export function stopMorningBriefingScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log("[MorningBriefingScheduler] Stopped");
  }
}

export function updateSchedulerConfig(updates: Partial<SchedulerConfig>): SchedulerConfig {
  config = { ...config, ...updates };

  if (scheduledTask) {
    stopMorningBriefingScheduler();
    startMorningBriefingScheduler();
  }

  return config;
}

export function getSchedulerStatus(): {
  config: SchedulerConfig;
  isRunning: boolean;
  lastDelivery: {
    time: string | null;
    status: string | null;
    error: string | null;
  };
} {
  return {
    config,
    isRunning: scheduledTask !== null && config.enabled,
    lastDelivery: {
      time: lastDeliveryTime?.toISOString() || null,
      status: lastDeliveryStatus,
      error: lastDeliveryError,
    },
  };
}

export async function triggerManualDelivery(): Promise<{
  success: boolean;
  message: string;
}> {
  console.log("[MorningBriefingScheduler] Manual delivery triggered");
  await deliverMorningBriefing();

  return {
    success: lastDeliveryStatus === "success",
    message: lastDeliveryStatus === "success" 
      ? "Briefing delivered successfully" 
      : `Delivery failed: ${lastDeliveryError || "Unknown error"}`,
  };
}

export function initializeMorningBriefingScheduler(): void {
  const enabled = process.env.MORNING_BRIEFING_ENABLED === "true";
  const recipientPhone = process.env.MORNING_BRIEFING_PHONE || null;

  if (enabled && recipientPhone) {
    startMorningBriefingScheduler({
      enabled: true,
      recipientPhone,
    });
  } else {
    console.log("[MorningBriefingScheduler] Not starting - MORNING_BRIEFING_ENABLED or MORNING_BRIEFING_PHONE not set");
  }
}

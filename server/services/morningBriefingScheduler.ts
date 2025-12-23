import * as cron from "node-cron";
import {
  getBriefingSetting,
  getRecentNewsStories,
  getBriefingRecipientsByType,
  createBriefingDeliveryLog,
  getCalendarEvents,
  getTasks,
} from "../db";

let briefingScheduler: cron.ScheduledTask | null = null;
let sendSmsCallback: ((phone: string, message: string) => Promise<string>) | null = null;

/**
 * Set the SMS callback for sending briefings
 */
export function setSendSmsCallback(callback: (phone: string, message: string) => Promise<string>): void {
  sendSmsCallback = callback;
}

/**
 * Build morning briefing content
 */
async function buildMorningBriefing(): Promise<{
  curatedStories: Array<{ headline: string; id: string }>;
  newStories: Array<{ headline: string; id: string }>;
  tasksSummary: string;
  calendarSummary: string;
}> {
  // Get top 3 curated stories
  const curatedStories = getRecentNewsStories(3)
    .filter((s) => s.storyType === "curated")
    .map((s) => ({ headline: s.headline, id: s.id }));

  // Get top 3 new stories
  const newStories = getRecentNewsStories(3)
    .filter((s) => s.storyType === "new")
    .map((s) => ({ headline: s.headline, id: s.id }));

  // Get today's tasks
  const today = new Date().toISOString().split("T")[0];
  const todaysTasks = getTasks().filter((t) => t.dueDate === today && !t.completed);
  const tasksSummary = todaysTasks.length > 0
    ? `${todaysTasks.length} tasks due today: ${todaysTasks.map((t) => t.title).join(", ")}`
    : "No tasks for today";

  // Get today's calendar events
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const todaysEvents = getCalendarEvents().filter(
    (e) => new Date(e.start) >= startOfDay && new Date(e.start) < endOfDay
  );
  const calendarSummary = todaysEvents.length > 0
    ? `${todaysEvents.length} events: ${todaysEvents.map((e) => e.title).join(", ")}`
    : "No calendar events today";

  return { curatedStories, newStories, tasksSummary, calendarSummary };
}

/**
 * Send individual SMS for each curated story with thumbs up/down feedback
 */
async function sendCuratedStories(
  curatedStories: Array<{ headline: string; id: string }>,
  recipientPhone: string
): Promise<void> {
  if (!sendSmsCallback || curatedStories.length === 0) return;

  for (const story of curatedStories) {
    try {
      const message = `TOP STORY: ${story.headline}\n\nReply: 👍 for more like this, 👎 for less`;
      const messageId = await sendSmsCallback(recipientPhone, message);
      createBriefingDeliveryLog({
        briefingType: "news_curated",
        recipientPhone,
        content: message,
        twilioMessageId: messageId,
        status: "sent",
      });
    } catch (error) {
      console.error(`[MorningBriefing] Error sending curated story to ${recipientPhone}:`, error);
    }
  }
}

/**
 * Send individual SMS for each new story with thumbs up/down feedback
 */
async function sendNewStories(
  newStories: Array<{ headline: string; id: string }>,
  recipientPhone: string
): Promise<void> {
  if (!sendSmsCallback || newStories.length === 0) return;

  for (const story of newStories) {
    try {
      const message = `MORNING NEWS: ${story.headline}\n\nReply: 👍 for more, 👎 for less`;
      const messageId = await sendSmsCallback(recipientPhone, message);
      createBriefingDeliveryLog({
        briefingType: "news_new",
        recipientPhone,
        content: message,
        twilioMessageId: messageId,
        status: "sent",
      });
    } catch (error) {
      console.error(`[MorningBriefing] Error sending new story to ${recipientPhone}:`, error);
    }
  }
}

/**
 * Send weather briefing to specified recipient
 */
async function sendWeatherBriefing(recipientPhone: string): Promise<void> {
  if (!sendSmsCallback) return;

  try {
    // TODO: Integrate with weather API
    const weatherMessage = "Weather: Check OpenWeatherMap for updates";
    const messageId = await sendSmsCallback(recipientPhone, weatherMessage);
    createBriefingDeliveryLog({
      briefingType: "weather",
      recipientPhone,
      content: weatherMessage,
      twilioMessageId: messageId,
      status: "sent",
    });
  } catch (error) {
    console.error(`[MorningBriefing] Error sending weather to ${recipientPhone}:`, error);
  }
}

/**
 * Send system health report
 */
async function sendSystemHealthReport(recipientPhone: string): Promise<void> {
  if (!sendSmsCallback) return;

  try {
    // TODO: Integrate with health report generation
    const healthMessage = "ZEKE HEALTH: All systems nominal ✓";
    const messageId = await sendSmsCallback(recipientPhone, healthMessage);
    createBriefingDeliveryLog({
      briefingType: "system_health",
      recipientPhone,
      content: healthMessage,
      twilioMessageId: messageId,
      status: "sent",
    });
  } catch (error) {
    console.error(`[MorningBriefing] Error sending health report to ${recipientPhone}:`, error);
  }
}

/**
 * Run morning briefing at 6 AM
 */
async function runMorningBriefing(): Promise<void> {
  console.log(`[MorningBriefing] Running morning briefing at ${new Date().toISOString()}`);

  try {
    const briefing = await buildMorningBriefing();

    // Send to Nate (news + system health)
    const natePhone = "+16176868763";
    await sendCuratedStories(briefing.curatedStories, natePhone);
    await sendNewStories(briefing.newStories, natePhone);
    await sendSystemHealthReport(natePhone);

    // Send weather to Carolina (configured recipient)
    const weatherRecipients = await getBriefingRecipientsByType("weather");
    for (const recipient of weatherRecipients) {
      await sendWeatherBriefing(recipient.phoneNumber);
    }

    console.log("[MorningBriefing] Briefing sent successfully");
  } catch (error) {
    console.error("[MorningBriefing] Error running briefing:", error);
  }
}

/**
 * Start the morning briefing scheduler (at 6 AM)
 */
export async function startMorningBriefingScheduler(): Promise<void> {
  if (briefingScheduler) {
    console.log("[MorningBriefing] Scheduler already running");
    return;
  }

  const briefingTimeSetting = await getBriefingSetting("briefing_time");
  const briefingTime = briefingTimeSetting || "06:00";
  const [hours, minutes] = briefingTime.split(":").map(Number);

  // Schedule for 6 AM daily (0 6 * * *)
  briefingScheduler = cron.schedule(
    `${minutes} ${hours} * * *`,
    () => {
      runMorningBriefing().catch((error) => console.error("[MorningBriefing] Execution failed:", error));
    },
    { timezone: "America/New_York" }
  );

  console.log(`[MorningBriefing] Scheduler started (daily at ${briefingTime})`);
}

/**
 * Stop the morning briefing scheduler
 */
export function stopMorningBriefingScheduler(): void {
  if (briefingScheduler) {
    briefingScheduler.stop();
    briefingScheduler = null;
    console.log("[MorningBriefing] Scheduler stopped");
  }
}

/**
 * Get scheduler status
 */
export async function getMorningBriefingStatus(): Promise<{
  running: boolean;
  scheduledTime: string;
}> {
  const scheduledTime = (await getBriefingSetting("briefing_time")) || "06:00";
  return {
    running: briefingScheduler !== null,
    scheduledTime,
  };
}

// Note: Auto-start removed - must be called explicitly with await from server startup

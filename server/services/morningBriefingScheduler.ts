import * as cron from "node-cron";
import {
  getBriefingSettingByKey,
  getRecentNewsStories,
  getBriefingRecipientsByType,
  createBriefingDeliveryLog,
  getCalendarEvents,
  getTasks,
} from "../db";
import {
  formatForecastForSms,
  formatWeatherForSms,
  getCurrentWeather,
  getWeatherForecast,
} from "../weather";
import { isTwilioConfigured } from "../twilioClient";

let briefingScheduler: cron.ScheduledTask | null = null;
let sendSmsCallback: ((phone: string, message: string) => Promise<string>) | null = null;

async function getBriefingTime(): Promise<string> {
  const briefingTime = await getBriefingSettingByKey("briefing_time");
  return briefingTime || "06:00";
}

async function getWeatherLocation(): Promise<{ city: string; state: string; country: string }> {
  const [city, state, country] = await Promise.all([
    getBriefingSettingByKey("weather_city"),
    getBriefingSettingByKey("weather_state"),
    getBriefingSettingByKey("weather_country"),
  ]);

  return {
    city: city || "Boston",
    state: state || "MA",
    country: country || "US",
  };
}

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
  const allCuratedStories = await getRecentNewsStories(3);
  const curatedStories = allCuratedStories
    .filter((s) => s.storyType === "curated")
    .map((s) => ({ headline: s.headline, id: s.id }));

  // Get top 3 new stories
  const allNewStories = await getRecentNewsStories(3);
  const newStories = allNewStories
    .filter((s) => s.storyType === "new")
    .map((s) => ({ headline: s.headline, id: s.id }));

  // Get today's tasks
  const today = new Date().toISOString().split("T")[0];
  const allTasks = await getTasks();
  const todaysTasks = allTasks.filter((t) => t.dueDate === today && !t.completed);
  const tasksSummary = todaysTasks.length > 0
    ? `${todaysTasks.length} tasks due today: ${todaysTasks.map((t) => t.title).join(", ")}`
    : "No tasks for today";

  // Get today's calendar events
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const allEvents = await getCalendarEvents();
  const todaysEvents = allEvents.filter(
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
      await createBriefingDeliveryLog({
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
      await createBriefingDeliveryLog({
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
    const { city, state, country } = await getWeatherLocation();
    const [weather, forecast] = await Promise.all([
      getCurrentWeather(city, state, country),
      getWeatherForecast(city, state, country, 2),
    ]);

    const forecastSummary = forecast.length > 0
      ? `\n\nForecast:\n${formatForecastForSms(forecast)}`
      : "";

    const weatherMessage = `${formatWeatherForSms(weather)}${forecastSummary}`;
    const messageId = await sendSmsCallback(recipientPhone, weatherMessage);
    await createBriefingDeliveryLog({
      briefingType: "weather",
      recipientPhone,
      content: weatherMessage,
      twilioMessageId: messageId,
      status: "sent",
    });
  } catch (error) {
    console.error(`[MorningBriefing] Error sending weather to ${recipientPhone}:`, error);

    await createBriefingDeliveryLog({
      briefingType: "weather",
      recipientPhone,
      content: "Weather update unavailable right now. I'll retry soon.",
      status: "failed",
    });
  }
}

/**
 * Send system health report
 */
async function sendSystemHealthReport(recipientPhone: string): Promise<void> {
  if (!sendSmsCallback) return;

  try {
    const [twilioReady, briefingTime] = await Promise.all([
      isTwilioConfigured().catch(() => false),
      getBriefingTime(),
    ]);

    const healthLines = [
      "ZEKE HEALTH CHECK",
      `• Scheduler: ${briefingScheduler ? "running" : "stopped"} (target ${briefingTime} ET)`,
      `• Twilio: ${twilioReady ? "connected" : "not configured"}`,
      `• OpenAI: ${process.env.OPENAI_API_KEY ? "api key set" : "missing key"}`,
      `• Weather: ${process.env.OPENWEATHERMAP_API_KEY ? "api key set" : "missing key"}`,
    ];

    const healthMessage = healthLines.join("\n");
    const messageId = await sendSmsCallback(recipientPhone, healthMessage);
    await createBriefingDeliveryLog({
      briefingType: "system_health",
      recipientPhone,
      content: healthMessage,
      twilioMessageId: messageId,
      status: "sent",
    });
  } catch (error) {
    console.error(`[MorningBriefing] Error sending health report to ${recipientPhone}:`, error);

    await createBriefingDeliveryLog({
      briefingType: "system_health",
      recipientPhone,
      content: "System health check unavailable right now.",
      status: "failed",
    });
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

  const briefingTime = await getBriefingTime();
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
  const scheduledTime = await getBriefingTime();
  return {
    running: briefingScheduler !== null,
    scheduledTime,
  };
}

// Note: Auto-start removed - must be called explicitly with await from server startup

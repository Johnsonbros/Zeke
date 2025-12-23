import * as cron from "node-cron";
import { v4 as uuidv4 } from "uuid";
import {
  createNewsTopic,
  getNewsTopics,
  createNewsStory,
  getBriefingRecipientsByType,
  createBriefingDeliveryLog,
  getNewsFeedbackStats,
  getBriefingSetting,
} from "../db";
import type { NewsTopic, NewsStory, NewsFeedback } from "@shared/schema";

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

interface NewsQueryResult {
  headline: string;
  summary: string;
  source: string;
  url?: string;
  urgency?: "normal" | "high" | "breaking";
}

let newsScheduler: cron.ScheduledTask | null = null;
let lastNewsQueryTime: Date | null = null;
let sendSmsCallback: ((phone: string, message: string) => Promise<string>) | null = null;

/**
 * Set the SMS callback for sending breaking news alerts
 */
export function setSendSmsCallback(callback: (phone: string, message: string) => Promise<string>): void {
  sendSmsCallback = callback;
}

/**
 * Query Perplexity API for top news stories
 */
async function queryNewsTopics(topics: NewsTopic[]): Promise<NewsQueryResult[]> {
  if (!PERPLEXITY_API_KEY || topics.length === 0) {
    return [];
  }

  try {
    const topicString = topics
      .filter((t) => t.isActive)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 5)
      .map((t) => t.topic)
      .join(", ");

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "user",
            content: `Find the top 3 most important current news stories related to these topics: ${topicString}. 
For each story, provide: headline, brief summary (1-2 sentences), source name, and URL.
Mark as "breaking" if it's urgent/breaking news that Nate should know immediately.
Format as JSON array with fields: headline, summary, source, url, urgency`,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      console.error("[NewsService] Perplexity API error:", response.status);
      return [];
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    return JSON.parse(jsonMatch[0]) as NewsQueryResult[];
  } catch (error) {
    console.error("[NewsService] Error querying news:", error);
    return [];
  }
}

/**
 * Check for breaking news and send immediate SMS
 */
async function handleBreakingNews(stories: NewsQueryResult[]): Promise<void> {
  const breakingStories = stories.filter((s) => s.urgency === "breaking");
  if (breakingStories.length === 0 || !sendSmsCallback) return;

  const recipients = await getBriefingRecipientsByType("news_curated");
  for (const story of breakingStories) {
    for (const recipient of recipients) {
      const message = `BREAKING: ${story.headline}\n\n${story.summary}\n\nSource: ${story.source}`;
      try {
        const messageId = await sendSmsCallback(recipient.phoneNumber, message);
        await createBriefingDeliveryLog({
          briefingType: "news_curated",
          recipientPhone: recipient.phoneNumber,
          content: message,
          twilioMessageId: messageId,
          status: "sent",
        });
        console.log(`[NewsService] Sent breaking news to ${recipient.phoneNumber}`);
      } catch (error) {
        console.error(`[NewsService] Failed to send breaking news to ${recipient.phoneNumber}:`, error);
      }
    }
  }
}

/**
 * Store news stories in database with feedback weighting
 */
async function storeNewsStories(stories: NewsQueryResult[], storyType: "curated" | "new"): Promise<NewsStory[]> {
  const feedbackStats = await getNewsFeedbackStats();
  const stored: NewsStory[] = [];

  for (const story of stories) {
    try {
      const newsStory = await createNewsStory({
        headline: story.headline,
        summary: story.summary,
        source: story.source,
        url: story.url,
        storyType,
      });
      stored.push(newsStory);
    } catch (error) {
      console.error("[NewsService] Error storing story:", error);
    }
  }

  return stored;
}

/**
 * Run the main news query (every 2 hours)
 */
async function runNewsQuery(): Promise<void> {
  console.log(`[NewsService] Running news query at ${new Date().toISOString()}`);
  lastNewsQueryTime = new Date();

  try {
    const topics = await getNewsTopics(true);
    if (topics.length === 0) {
      console.log("[NewsService] No active news topics configured");
      return;
    }

    const stories = await queryNewsTopics(topics);
    if (stories.length === 0) {
      console.log("[NewsService] No stories found");
      return;
    }

    // Check for breaking news and send immediately
    await handleBreakingNews(stories);

    // Store top 3 as curated stories
    const topStories = stories.slice(0, 3);
    await storeNewsStories(topStories, "curated");

    console.log(`[NewsService] Stored ${topStories.length} news stories`);
  } catch (error) {
    console.error("[NewsService] Error in news query:", error);
  }
}

/**
 * Start the news scheduler (every 2 hours)
 */
export function startNewsScheduler(): void {
  if (newsScheduler) {
    console.log("[NewsService] News scheduler already running");
    return;
  }

  // Run immediately on startup
  runNewsQuery().catch((error) => console.error("[NewsService] Initial query failed:", error));

  // Then every 2 hours (0 */2 * * *)
  newsScheduler = cron.schedule(
    "0 */2 * * *",
    () => {
      runNewsQuery().catch((error) => console.error("[NewsService] Scheduled query failed:", error));
    },
    { timezone: "America/New_York" }
  );

  console.log("[NewsService] News scheduler started (every 2 hours)");
}

/**
 * Stop the news scheduler
 */
export function stopNewsScheduler(): void {
  if (newsScheduler) {
    newsScheduler.stop();
    newsScheduler = null;
    console.log("[NewsService] News scheduler stopped");
  }
}

/**
 * Get scheduler status
 */
export async function getNewsSchedulerStatus(): Promise<{
  running: boolean;
  lastQueryTime: string | null;
  topicsCount: number;
  recipientsCount: number;
}> {
  const topics = await getNewsTopics(true);
  const recipients = await getBriefingRecipientsByType("news_curated");
  return {
    running: newsScheduler !== null,
    lastQueryTime: lastNewsQueryTime?.toISOString() || null,
    topicsCount: topics.length,
    recipientsCount: recipients.length,
  };
}

/**
 * Initialize default news topics
 */
export async function initializeDefaultTopics(): Promise<void> {
  const existing = await getNewsTopics(false);
  if (existing.length > 0) return;

  const defaults = [
    { topic: "Technology", description: "Tech news, AI, startups", priority: 8 },
    { topic: "Business", description: "Markets, business news", priority: 7 },
    { topic: "Science", description: "Scientific discoveries, research", priority: 6 },
  ];

  for (const def of defaults) {
    try {
      await createNewsTopic({
        topic: def.topic,
        description: def.description,
        keywords: JSON.stringify([def.topic.toLowerCase()]),
        priority: def.priority,
        isActive: true,
      });
    } catch (error) {
      console.error(`[NewsService] Error creating default topic ${def.topic}:`, error);
    }
  }
}

// Note: Auto-start removed - must be called explicitly with await from server startup

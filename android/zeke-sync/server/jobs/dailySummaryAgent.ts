/**
 * Daily Summary Agent for ZEKE
 * 
 * Generates comprehensive end-of-day summaries at 11 PM, analyzing all
 * conversations, tasks, memories, calendar events, and other activities
 * to create a detailed journal entry.
 */

import OpenAI from "openai";
import * as cron from "node-cron";
import {
  getAllConversations,
  getMessagesByConversation,
  getAllTasks,
  getAllMemoryNotes,
  getLocationHistoryInRange,
  createJournalEntry,
  getJournalEntryByDate,
} from "../db";
import type { MemoryNote } from "@shared/schema";
import type { JournalEntry, InsertJournalEntry } from "@shared/schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let scheduledTask: cron.ScheduledTask | null = null;
let lastRunTime: Date | null = null;
let lastRunStatus: "success" | "failed" | "pending" | null = null;
let lastRunError: string | null = null;

export interface DailySummaryConfig {
  enabled: boolean;
  cronSchedule: string;
  timezone: string;
}

let config: DailySummaryConfig = {
  enabled: true,
  cronSchedule: "0 23 * * *", // 11 PM daily
  timezone: "America/New_York",
};

interface DailyContext {
  date: string;
  conversations: Array<{
    id: string;
    title: string;
    messageCount: number;
    topics: string[];
  }>;
  tasksCompleted: Array<{
    title: string;
    category: string;
    priority: string;
  }>;
  tasksCreated: Array<{
    title: string;
    category: string;
    priority: string;
  }>;
  calendarEvents: Array<{
    title: string;
    start: string;
    end: string;
    location?: string;
  }>;
  memoriesCreated: Array<{
    type: string;
    content: string;
  }>;
  locationVisits: Array<{
    time: string;
    location: string;
  }>;
}

async function gatherDailyContext(targetDate: string): Promise<DailyContext> {
  const startOfDay = `${targetDate}T00:00:00.000Z`;
  const endOfDay = `${targetDate}T23:59:59.999Z`;
  
  // Get all conversations and filter to today's activity
  const allConversations = getAllConversations();
  const todaysConversations: DailyContext["conversations"] = [];
  
  for (const conv of allConversations) {
    const messages = getMessagesByConversation(conv.id);
    const todaysMessages = messages.filter(m => {
      const msgDate = m.createdAt.split("T")[0];
      return msgDate === targetDate;
    });
    
    if (todaysMessages.length > 0) {
      // Extract key topics from messages
      const userMessages = todaysMessages
        .filter(m => m.role === "user")
        .map(m => m.content)
        .slice(0, 5);
      
      todaysConversations.push({
        id: conv.id,
        title: conv.title || "Untitled conversation",
        messageCount: todaysMessages.length,
        topics: userMessages.map(m => m.substring(0, 100)),
      });
    }
  }
  
  // Get tasks
  const allTasks = getAllTasks(true); // Include completed
  const tasksCompleted = allTasks
    .filter(t => t.completed && t.updatedAt?.startsWith(targetDate))
    .map(t => ({
      title: t.title,
      category: t.category,
      priority: t.priority,
    }));
  
  const tasksCreated = allTasks
    .filter(t => t.createdAt.startsWith(targetDate))
    .map(t => ({
      title: t.title,
      category: t.category,
      priority: t.priority,
    }));
  
  // Calendar events - placeholder for future integration
  // TODO: Add calendar events when getCalendarEventsForDate is available
  const calendarEvents: DailyContext["calendarEvents"] = [];
  
  // Get memories created today
  const allMemories = getAllMemoryNotes(false);
  const memoriesCreated = allMemories
    .filter((m: MemoryNote) => m.createdAt.startsWith(targetDate))
    .map((m: MemoryNote) => ({
      type: m.type,
      content: m.content.substring(0, 200),
    }));
  
  // Get location history
  let locationVisits: DailyContext["locationVisits"] = [];
  try {
    const locations = getLocationHistoryInRange(startOfDay, endOfDay);
    locationVisits = locations.slice(0, 10).map(l => ({
      time: l.createdAt,
      location: `${l.latitude}, ${l.longitude}`,
    }));
  } catch (e) {
    console.log("[DailySummaryAgent] No location data found for date");
  }
  
  return {
    date: targetDate,
    conversations: todaysConversations,
    tasksCompleted,
    tasksCreated,
    calendarEvents,
    memoriesCreated,
    locationVisits,
  };
}

async function generateSummary(context: DailyContext): Promise<InsertJournalEntry> {
  const prompt = `You are ZEKE, Nate's personal AI assistant. Generate a comprehensive daily journal summary for ${context.date}.

## Today's Activity Data:

### Conversations (${context.conversations.length} total)
${context.conversations.map(c => `- "${c.title}" (${c.messageCount} messages): ${c.topics.slice(0, 2).join(", ")}`).join("\n") || "No conversations today"}

### Tasks Completed (${context.tasksCompleted.length})
${context.tasksCompleted.map(t => `- ${t.title} [${t.priority} priority, ${t.category}]`).join("\n") || "No tasks completed"}

### Tasks Created (${context.tasksCreated.length})
${context.tasksCreated.map(t => `- ${t.title} [${t.priority} priority, ${t.category}]`).join("\n") || "No new tasks"}

### Calendar Events (${context.calendarEvents.length})
${context.calendarEvents.map(e => `- ${e.title} (${e.start} - ${e.end})${e.location ? ` at ${e.location}` : ""}`).join("\n") || "No calendar events"}

### Memories Created (${context.memoriesCreated.length})
${context.memoriesCreated.map(m => `- [${m.type}] ${m.content}`).join("\n") || "No new memories"}

### Locations Visited (${context.locationVisits.length})
${context.locationVisits.length > 0 ? `${context.locationVisits.length} location check-ins recorded` : "No location data"}

Generate a response in the following JSON format:
{
  "title": "A creative, descriptive title for this day (e.g., 'A Productive Wednesday' or 'Balancing Work and Rest')",
  "summary": "A 2-4 paragraph narrative summary of the day, written in first person from Nate's perspective. Include key accomplishments, notable conversations, and overall flow of the day.",
  "mood": "One word describing the overall mood/tone of the day (e.g., productive, relaxed, hectic, focused)",
  "insights": ["Key insight or learning 1", "Key insight 2", "Up to 5 insights"],
  "keyEvents": [{"time": "approximate time or period", "event": "description of key event", "category": "work|personal|family|health|social"}],
  "highlights": ["Notable moment 1", "Achievement or positive moment 2", "Up to 5 highlights"]
}

Be accurate and specific based on the data provided. If activity was light, acknowledge that authentically.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are ZEKE, a personal AI assistant generating a journal entry. Output valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const parsed = JSON.parse(content);

    return {
      date: context.date,
      title: parsed.title || `Summary for ${context.date}`,
      summary: parsed.summary || "No summary generated.",
      mood: parsed.mood || null,
      insights: JSON.stringify(parsed.insights || []),
      keyEvents: JSON.stringify(parsed.keyEvents || []),
      highlights: JSON.stringify(parsed.highlights || []),
      metrics: JSON.stringify({
        conversationCount: context.conversations.length,
        messageCount: context.conversations.reduce((sum, c) => sum + c.messageCount, 0),
        calendarEventCount: context.calendarEvents.length,
      }),
      conversationCount: context.conversations.length,
      taskCompletedCount: context.tasksCompleted.length,
      taskCreatedCount: context.tasksCreated.length,
      memoryCreatedCount: context.memoriesCreated.length,
    };
  } catch (error) {
    console.error("[DailySummaryAgent] Failed to generate summary:", error);
    
    // Return a basic summary if AI generation fails
    return {
      date: context.date,
      title: `Summary for ${context.date}`,
      summary: `Today included ${context.conversations.length} conversations, ${context.tasksCompleted.length} tasks completed, and ${context.calendarEvents.length} calendar events.`,
      mood: null,
      insights: JSON.stringify([]),
      keyEvents: JSON.stringify([]),
      highlights: JSON.stringify([]),
      metrics: JSON.stringify({
        conversationCount: context.conversations.length,
        calendarEventCount: context.calendarEvents.length,
      }),
      conversationCount: context.conversations.length,
      taskCompletedCount: context.tasksCompleted.length,
      taskCreatedCount: context.tasksCreated.length,
      memoryCreatedCount: context.memoriesCreated.length,
    };
  }
}

export async function generateDailySummary(targetDate?: string): Promise<JournalEntry | null> {
  const date = targetDate || new Date().toISOString().split("T")[0];
  
  console.log(`[DailySummaryAgent] Generating summary for ${date}`);
  
  // Check if entry already exists for this date
  const existing = getJournalEntryByDate(date);
  if (existing) {
    console.log(`[DailySummaryAgent] Entry already exists for ${date}`);
    return existing;
  }
  
  try {
    const context = await gatherDailyContext(date);
    const summaryData = await generateSummary(context);
    const entry = createJournalEntry(summaryData);
    
    console.log(`[DailySummaryAgent] Created journal entry for ${date}: ${entry.title}`);
    return entry;
  } catch (error) {
    console.error(`[DailySummaryAgent] Failed to generate summary for ${date}:`, error);
    throw error;
  }
}

async function runDailySummaryJob(): Promise<void> {
  console.log(`[DailySummaryAgent] Starting daily summary job at ${new Date().toISOString()}`);
  lastRunStatus = "pending";
  lastRunError = null;
  
  try {
    const today = new Date().toISOString().split("T")[0];
    await generateDailySummary(today);
    
    lastRunStatus = "success";
    lastRunTime = new Date();
    console.log("[DailySummaryAgent] Daily summary job completed successfully");
  } catch (error) {
    console.error("[DailySummaryAgent] Daily summary job failed:", error);
    lastRunStatus = "failed";
    lastRunError = error instanceof Error ? error.message : String(error);
  }
}

export function startDailySummaryScheduler(options?: Partial<DailySummaryConfig>): void {
  if (options) {
    config = { ...config, ...options };
  }
  
  if (scheduledTask) {
    scheduledTask.stop();
  }
  
  if (!config.enabled) {
    console.log("[DailySummaryAgent] Scheduler is disabled");
    return;
  }
  
  scheduledTask = cron.schedule(
    config.cronSchedule,
    () => {
      runDailySummaryJob();
    },
    {
      timezone: config.timezone,
    }
  );
  
  console.log(`[DailySummaryAgent] Scheduled at "${config.cronSchedule}" (${config.timezone})`);
}

export function stopDailySummaryScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log("[DailySummaryAgent] Scheduler stopped");
  }
}

export function getDailySummaryStatus(): {
  enabled: boolean;
  cronSchedule: string;
  timezone: string;
  lastRunTime: Date | null;
  lastRunStatus: string | null;
  lastRunError: string | null;
} {
  return {
    enabled: config.enabled,
    cronSchedule: config.cronSchedule,
    timezone: config.timezone,
    lastRunTime,
    lastRunStatus,
    lastRunError,
  };
}

export function updateDailySummaryConfig(options: Partial<DailySummaryConfig>): void {
  config = { ...config, ...options };
  if (config.enabled && scheduledTask) {
    startDailySummaryScheduler();
  }
}

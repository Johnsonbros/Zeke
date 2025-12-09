/**
 * Omi AI API Service
 * 
 * Provides access to memories from the Omi wearable for ZEKE context.
 * Omi uses a webhook-based architecture for real-time data push.
 * API documentation: https://docs.omi.me
 */

import OpenAI from "openai";
import {
  getOmiSummaryByDate,
  createOmiSummary,
  getOmiSummaries,
  getOmiSummariesInRange,
} from "./db";
import type { OmiSummary, InsertOmiSummary } from "@shared/schema";

const OMI_API_BASE = "https://api.omi.me";
const TIMEZONE = "America/New_York";

/**
 * Format a Date object as a timezone-naive string for Omi API
 * The API expects "YYYY-MM-DD HH:mm:SS" format WITHOUT timezone offset.
 */
function formatForOmiApi(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';
  
  return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
}

// OpenAI client for summary generation
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured.");
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

// Omi Memory types - adapted from Limitless lifelog structure
export interface TranscriptSegment {
  text: string;
  speaker: string;
  speakerId: number;
  isUser: boolean;
  start: number;
  end: number;
}

export interface ActionItem {
  description: string;
  completed: boolean;
}

export interface StructuredData {
  title: string;
  overview: string;
  emoji: string;
  category: string;
  actionItems: ActionItem[];
  events: any[];
}

export interface OmiMemoryData {
  id: string;
  createdAt: string;
  startedAt: string;
  finishedAt: string;
  transcript: string;
  transcriptSegments: TranscriptSegment[];
  photos: string[];
  structured: StructuredData;
  pluginsResults: any[];
  geolocation: any | null;
  discarded: boolean;
  deleted: boolean;
  source: string;
  language: string;
  externalData: any | null;
  status: string;
}

export interface OmiMemoriesResponse {
  memories: OmiMemoryData[];
}

export interface OmiMemoryResponse {
  memory: OmiMemoryData | null;
}

// Webhook payload types for Omi real-time push
export interface OmiWebhookPayload {
  event: "memory_created" | "memory_updated" | "memory_deleted" | "transcript_segment";
  memory?: OmiMemoryData;
  memoryId?: string;
  segment?: TranscriptSegment;
  timestamp: string;
}

interface GetMemoriesParams {
  limit?: number;
  offset?: number;
}

function getApiKey(): string {
  const apiKey = process.env.OMI_API_KEY || process.env.OMI_DEV_API_KEY;
  if (!apiKey) {
    throw new Error("OMI_API_KEY or OMI_DEV_API_KEY is not configured. Please add it to your secrets.");
  }
  return apiKey;
}

async function fetchFromOmi<T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const apiKey = getApiKey();
  
  const url = new URL(`${OMI_API_BASE}${endpoint}`);
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });
  }
  
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json",
    },
  });
  
  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After") || "60";
      throw new Error(`Rate limit exceeded. Retry after ${retryAfter} seconds.`);
    }
    throw new Error(`Omi API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json() as Promise<T>;
}

/**
 * Get memories from Omi API
 */
export async function getMemories(params: GetMemoriesParams = {}): Promise<OmiMemoryData[]> {
  const queryParams: Record<string, string | number | boolean | undefined> = {
    limit: params.limit ?? 10,
    offset: params.offset ?? 0,
  };
  
  const response = await fetchFromOmi<OmiMemoriesResponse>("/v1/memories", queryParams);
  return response.memories || [];
}

/**
 * Get a single memory by ID
 */
export async function getMemory(id: string): Promise<OmiMemoryData | null> {
  try {
    const response = await fetchFromOmi<OmiMemoryResponse>(`/v1/memories/${id}`);
    return response.memory;
  } catch (error) {
    console.error(`Failed to get memory ${id}:`, error);
    return null;
  }
}

/**
 * Search memories - Omi uses local search on fetched data
 */
export async function searchMemories(
  query: string,
  options: {
    limit?: number;
  } = {}
): Promise<OmiMemoryData[]> {
  const memories = await getMemories({ limit: options.limit ?? 50 });
  const lowerQuery = query.toLowerCase();
  
  return memories.filter(memory => {
    const searchableText = [
      memory.transcript,
      memory.structured?.title,
      memory.structured?.overview,
      ...memory.transcriptSegments.map(s => s.text)
    ].filter(Boolean).join(' ').toLowerCase();
    
    return searchableText.includes(lowerQuery);
  });
}

/**
 * Get recent memories from today
 */
export async function getTodaysMemories(limit = 10): Promise<OmiMemoryData[]> {
  const memories = await getMemories({ limit: 50 });
  const today = new Date().toISOString().split("T")[0];
  
  return memories
    .filter(m => m.startedAt.startsWith(today))
    .slice(0, limit);
}

/**
 * Get memories from the last N hours
 */
export async function getRecentMemories(hours = 24, limit = 20): Promise<OmiMemoryData[]> {
  const memories = await getMemories({ limit: 100 });
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  return memories
    .filter(m => new Date(m.startedAt) >= cutoffTime)
    .slice(0, limit);
}

/**
 * Extract conversation content from a memory for AI context
 */
export function extractConversationContent(memory: OmiMemoryData): string {
  const parts: string[] = [];
  
  parts.push(`## ${memory.structured?.title || 'Memory'}`);
  parts.push(`Time: ${formatTimeRange(memory.startedAt, memory.finishedAt)}`);
  
  if (memory.structured?.overview) {
    parts.push("");
    parts.push(memory.structured.overview);
  }
  
  if (memory.transcript) {
    parts.push("");
    parts.push(memory.transcript);
  } else if (memory.transcriptSegments && memory.transcriptSegments.length > 0) {
    parts.push("");
    parts.push(extractTranscriptContent(memory.transcriptSegments));
  }
  
  return parts.join("\n");
}

function extractTranscriptContent(segments: TranscriptSegment[]): string {
  const parts: string[] = [];
  
  for (const segment of segments) {
    const speaker = segment.isUser ? "You" : (segment.speaker || "Speaker");
    parts.push(`${speaker}: "${segment.text}"`);
  }
  
  return parts.join("\n");
}

function formatTimeRange(startTime: string, endTime: string): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  
  const dateOptions: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: TIMEZONE,
  };
  
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TIMEZONE,
  };
  
  const dateStr = start.toLocaleDateString("en-US", dateOptions);
  const startTimeStr = start.toLocaleTimeString("en-US", timeOptions);
  const endTimeStr = end.toLocaleTimeString("en-US", timeOptions);
  
  return `${dateStr}, ${startTimeStr} - ${endTimeStr}`;
}

/**
 * Get contextual memory content for a specific topic/query
 * Returns formatted context suitable for AI system prompt
 */
export async function getMemoryContext(
  query: string,
  options: {
    maxResults?: number;
    hoursBack?: number;
  } = {}
): Promise<string> {
  const { maxResults = 5, hoursBack = 72 } = options;
  
  try {
    const memories = await searchMemories(query, { limit: maxResults });
    
    if (memories.length === 0) {
      return "";
    }
    
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const recentMemories = memories.filter(m => new Date(m.startedAt) >= cutoffTime);
    
    if (recentMemories.length === 0) {
      return "";
    }
    
    const contextParts: string[] = [
      "## Relevant Context from Recent Conversations (Omi Wearable)",
      "",
    ];
    
    for (const memory of recentMemories) {
      contextParts.push(extractConversationContent(memory));
      contextParts.push("");
      contextParts.push("---");
      contextParts.push("");
    }
    
    return contextParts.join("\n");
  } catch (error) {
    console.error("Failed to get memory context:", error);
    return "";
  }
}

/**
 * Get a summary of recent activity for daily briefings
 */
export async function getRecentActivitySummary(hours = 24): Promise<string> {
  try {
    const memories = await getRecentMemories(hours, 20);
    
    if (memories.length === 0) {
      return "No recorded conversations in the last 24 hours.";
    }
    
    const parts: string[] = [
      `Found ${memories.length} conversation(s) in the last ${hours} hours:`,
      "",
    ];
    
    for (const memory of memories) {
      const time = formatTimeRange(memory.startedAt, memory.finishedAt);
      parts.push(`- ${memory.structured?.title || 'Conversation'} (${time})`);
    }
    
    return parts.join("\n");
  } catch (error) {
    console.error("Failed to get recent activity summary:", error);
    return "Unable to retrieve recent activity from Omi.";
  }
}

/**
 * Check if Omi API is configured and working
 */
export async function checkOmiConnection(): Promise<{ connected: boolean; error?: string }> {
  try {
    getApiKey();
    await getMemories({ limit: 1 });
    return { connected: true };
  } catch (error: any) {
    return { 
      connected: false, 
      error: error.message || "Unknown error connecting to Omi" 
    };
  }
}

/**
 * Get an overview of available memory data
 */
export interface MemoryOverview {
  connected: boolean;
  today: {
    count: number;
    conversations: { title: string; time: string }[];
  };
  yesterday: {
    count: number;
    conversations: { title: string; time: string }[];
  };
  last7Days: {
    count: number;
    dates: string[];
  };
  mostRecent?: {
    title: string;
    time: string;
    age: string;
  };
}

export async function getMemoryOverview(): Promise<MemoryOverview> {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  try {
    const memories = await getMemories({ limit: 100 });
    
    const todayMems = memories.filter(m => m.startedAt.startsWith(today));
    const yesterdayMems = memories.filter(m => m.startedAt.startsWith(yesterday));
    
    const uniqueDates = Array.from(new Set(memories.map((m) => m.startedAt.split("T")[0])));
    const mostRecent = memories.length > 0 ? memories[0] : null;

    const formatConversation = (memory: OmiMemoryData) => ({
      title: memory.structured?.title || 'Conversation',
      time: formatTimeRange(memory.startedAt, memory.finishedAt),
    });

    const getAge = (dateStr: string): string => {
      const date = new Date(dateStr);
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 60) return `${diffMins} minutes ago`;
      if (diffHours < 24) return `${diffHours} hours ago`;
      return `${diffDays} days ago`;
    };

    return {
      connected: true,
      today: {
        count: todayMems.length,
        conversations: todayMems.slice(0, 5).map(formatConversation),
      },
      yesterday: {
        count: yesterdayMems.length,
        conversations: yesterdayMems.slice(0, 5).map(formatConversation),
      },
      last7Days: {
        count: memories.length,
        dates: uniqueDates.slice(0, 7),
      },
      mostRecent: mostRecent ? {
        title: mostRecent.structured?.title || 'Conversation',
        time: formatTimeRange(mostRecent.startedAt, mostRecent.finishedAt),
        age: getAge(mostRecent.startedAt),
      } : undefined,
    };
  } catch (error: any) {
    console.error("Failed to get memory overview:", error);
    return {
      connected: false,
      today: { count: 0, conversations: [] },
      yesterday: { count: 0, conversations: [] },
      last7Days: { count: 0, dates: [] },
    };
  }
}

/**
 * Extract people mentioned in a memory
 */
export interface ExtractedPerson {
  name: string;
  speakerType: "identified" | "mentioned" | "unknown";
  context: string;
  memoryId: string;
  memoryTitle: string;
  timestamp: string;
}

export function extractPeopleFromMemory(memory: OmiMemoryData): ExtractedPerson[] {
  const people: ExtractedPerson[] = [];
  const seenNames = new Set<string>();
  
  for (const segment of memory.transcriptSegments) {
    if (segment.speaker && !segment.isUser && segment.speaker !== "Unknown") {
      const name = segment.speaker.trim();
      if (!seenNames.has(name.toLowerCase())) {
        seenNames.add(name.toLowerCase());
        people.push({
          name,
          speakerType: "identified",
          context: segment.text?.substring(0, 200) || "",
          memoryId: memory.id,
          memoryTitle: memory.structured?.title || 'Conversation',
          timestamp: memory.startedAt,
        });
      }
    }
  }
  
  return people;
}

/**
 * Extract people from recent memories
 */
export async function extractPeopleFromRecentMemories(hours: number = 24): Promise<ExtractedPerson[]> {
  try {
    const memories = await getRecentMemories(hours, 50);
    const allPeople: ExtractedPerson[] = [];
    
    for (const memory of memories) {
      const people = extractPeopleFromMemory(memory);
      allPeople.push(...people);
    }
    
    const uniquePeople = Array.from(
      allPeople.reduce((map, person) => {
        const key = person.name.toLowerCase();
        if (!map.has(key) || person.speakerType === "identified") {
          map.set(key, person);
        }
        return map;
      }, new Map<string, ExtractedPerson>())
    ).map(([, person]) => person);
    
    return uniquePeople;
  } catch (error) {
    console.error("Failed to extract people from memories:", error);
    return [];
  }
}

/**
 * Search for mentions of a specific person in memories
 */
export async function searchPersonInMemories(personName: string, limit: number = 10): Promise<{
  memories: OmiMemoryData[];
  mentions: { memoryId: string; context: string; timestamp: string }[];
}> {
  try {
    const memories = await searchMemories(personName, { limit });
    const mentions: { memoryId: string; context: string; timestamp: string }[] = [];
    
    for (const memory of memories) {
      const content = extractConversationContent(memory);
      const lowerContent = content.toLowerCase();
      const lowerName = personName.toLowerCase();
      
      let index = lowerContent.indexOf(lowerName);
      while (index !== -1) {
        const start = Math.max(0, index - 100);
        const end = Math.min(content.length, index + personName.length + 100);
        mentions.push({
          memoryId: memory.id,
          context: content.substring(start, end),
          timestamp: memory.startedAt,
        });
        index = lowerContent.indexOf(lowerName, index + 1);
      }
    }
    
    return { memories, mentions };
  } catch (error) {
    console.error(`Failed to search for ${personName} in memories:`, error);
    return { memories: [], mentions: [] };
  }
}

// ============================================
// WEBHOOK HANDLER FOR OMI REAL-TIME DATA
// ============================================

// In-memory store for webhook-received memories (can be persisted to DB)
const webhookMemoryCache = new Map<string, OmiMemoryData>();

/**
 * Handle incoming webhook payload from Omi
 */
export function handleOmiWebhook(payload: OmiWebhookPayload): void {
  console.log(`Received Omi webhook: ${payload.event}`);
  
  switch (payload.event) {
    case "memory_created":
    case "memory_updated":
      if (payload.memory) {
        webhookMemoryCache.set(payload.memory.id, payload.memory);
        console.log(`Cached memory: ${payload.memory.id}`);
      }
      break;
    case "memory_deleted":
      if (payload.memoryId) {
        webhookMemoryCache.delete(payload.memoryId);
        console.log(`Removed memory from cache: ${payload.memoryId}`);
      }
      break;
    case "transcript_segment":
      console.log(`Received transcript segment: ${payload.segment?.text?.substring(0, 50)}...`);
      break;
  }
}

/**
 * Get memories from webhook cache
 */
export function getCachedMemories(): OmiMemoryData[] {
  return Array.from(webhookMemoryCache.values());
}

// ============================================
// AI-POWERED DAILY SUMMARY GENERATION
// ============================================

export interface DailySummaryResult {
  summary: OmiSummary;
  cached: boolean;
}

export interface ConversationAnalytics {
  totalConversations: number;
  totalDurationMinutes: number;
  uniqueSpeakers: string[];
  topTopics: { topic: string; count: number }[];
  conversationsByHour: { hour: number; count: number }[];
  averageDurationMinutes: number;
}

/**
 * Generate or retrieve cached AI-powered daily summary
 */
export async function generateDailySummary(
  date: string,
  forceRegenerate = false
): Promise<DailySummaryResult | null> {
  if (!forceRegenerate) {
    const cached = getOmiSummaryByDate(date);
    if (cached) {
      console.log(`Using cached summary for ${date}`);
      return { summary: cached, cached: true };
    }
  }

  try {
    const memories = await getMemories({ limit: 100 });
    const dayMemories = memories.filter(m => m.startedAt.startsWith(date));
    
    if (dayMemories.length === 0) {
      console.log(`No memories found for ${date}`);
      return null;
    }

    const conversationContent = dayMemories.map((memory) => ({
      id: memory.id,
      title: memory.structured?.title || 'Conversation',
      startTime: memory.startedAt,
      endTime: memory.finishedAt,
      content: extractConversationContent(memory),
      speakers: extractPeopleFromMemory(memory).map((p) => p.name),
    }));

    const totalDurationMinutes = dayMemories.reduce((total, memory) => {
      const start = new Date(memory.startedAt);
      const end = new Date(memory.finishedAt);
      return total + Math.round((end.getTime() - start.getTime()) / (1000 * 60));
    }, 0);

    const timeframeStart = dayMemories[0].startedAt;
    const timeframeEnd = dayMemories[dayMemories.length - 1].finishedAt;

    const client = getOpenAIClient();
    
    const summaryPrompt = `You are analyzing conversations from a personal wearable AI device (Omi) for Nate, a user who relies on ZEKE (their AI assistant) to stay organized and informed.

Date: ${date}
Total Conversations: ${dayMemories.length}
Total Duration: ${totalDurationMinutes} minutes

Conversations:
${conversationContent.map((c, i) => `
### Conversation ${i + 1}: ${c.title}
Time: ${c.startTime} - ${c.endTime}
Speakers: ${c.speakers.length > 0 ? c.speakers.join(", ") : "Unknown"}

${c.content.substring(0, 2000)}${c.content.length > 2000 ? "..." : ""}
`).join("\n---\n")}

Based on these conversations, provide a comprehensive daily summary in the following JSON format:
{
  "summaryTitle": "A brief, engaging title for the day (e.g., 'Productive Strategy Day' or 'Family Planning & Work Catch-ups')",
  "keyDiscussions": "A detailed paragraph summarizing the main discussions, decisions made, and important conversations. Be specific about what was discussed and with whom.",
  "actionItems": "A bulleted list of any action items, follow-ups, or commitments mentioned in conversations. Format as: - Item 1\\n- Item 2",
  "insights": "Key patterns, observations, or insights about the day. What themes emerged? Any notable quotes or decisions?",
  "peopleInteracted": "Comma-separated list of people Nate interacted with (extracted from speaker names)",
  "topicsDiscussed": "Comma-separated list of main topics/themes (e.g., 'project planning, family dinner, client meeting')"
}

Respond with ONLY the JSON object, no additional text.`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: summaryPrompt }],
      temperature: 0.3,
      max_tokens: 1500,
    });

    const summaryText = response.choices[0]?.message?.content?.trim() || "";
    
    let parsedSummary;
    try {
      const jsonContent = summaryText.replace(/```json\n?|\n?```/g, "").trim();
      parsedSummary = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error("Failed to parse AI summary:", parseError);
      parsedSummary = {
        summaryTitle: `${dayMemories.length} Conversations on ${date}`,
        keyDiscussions: `Had ${dayMemories.length} conversation(s) totaling ${totalDurationMinutes} minutes.`,
        actionItems: "Unable to extract action items automatically.",
        insights: "Summary generation encountered parsing issues.",
        peopleInteracted: conversationContent.flatMap((c) => c.speakers).filter((v, i, a) => a.indexOf(v) === i).join(", "),
        topicsDiscussed: dayMemories.map((m) => m.structured?.title || 'Conversation').join(", "),
      };
    }

    const summaryData: InsertOmiSummary = {
      date,
      timeframeStart,
      timeframeEnd,
      summaryTitle: parsedSummary.summaryTitle,
      keyDiscussions: parsedSummary.keyDiscussions,
      actionItems: parsedSummary.actionItems,
      insights: parsedSummary.insights,
      peopleInteracted: parsedSummary.peopleInteracted,
      topicsDiscussed: parsedSummary.topicsDiscussed,
      memoryIds: dayMemories.map((m) => m.id).join(","),
      memoryCount: dayMemories.length,
      totalDurationMinutes,
    };

    const savedSummary = createOmiSummary(summaryData);
    console.log(`Generated and saved new summary for ${date}`);

    return { summary: savedSummary, cached: false };
  } catch (error) {
    console.error(`Failed to generate daily summary for ${date}:`, error);
    throw error;
  }
}

/**
 * Get analytics data for Omi conversations over a date range
 */
export async function getConversationAnalytics(
  startDate: string,
  endDate: string
): Promise<ConversationAnalytics> {
  try {
    const memories = await getMemories({ limit: 200 });
    const filteredMemories = memories.filter(m => {
      const memDate = m.startedAt.split("T")[0];
      return memDate >= startDate && memDate <= endDate;
    });
    
    if (filteredMemories.length === 0) {
      return {
        totalConversations: 0,
        totalDurationMinutes: 0,
        uniqueSpeakers: [],
        topTopics: [],
        conversationsByHour: [],
        averageDurationMinutes: 0,
      };
    }

    const allSpeakers = new Set<string>();
    const topicCounts: Record<string, number> = {};
    const hourCounts: Record<number, number> = {};
    let totalDurationMinutes = 0;

    for (const memory of filteredMemories) {
      const start = new Date(memory.startedAt);
      const end = new Date(memory.finishedAt);
      totalDurationMinutes += Math.round((end.getTime() - start.getTime()) / (1000 * 60));

      const people = extractPeopleFromMemory(memory);
      for (const person of people) {
        allSpeakers.add(person.name);
      }

      const hour = new Date(memory.startedAt).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;

      const title = memory.structured?.title || '';
      const words = title.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length > 3 && !["with", "about", "the", "and", "for", "this", "that"].includes(word)) {
          topicCounts[word] = (topicCounts[word] || 0) + 1;
        }
      }
    }

    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic, count]) => ({ topic, count }));

    const conversationsByHour = Object.entries(hourCounts)
      .map(([hour, count]) => ({ hour: parseInt(hour), count }))
      .sort((a, b) => a.hour - b.hour);

    return {
      totalConversations: filteredMemories.length,
      totalDurationMinutes,
      uniqueSpeakers: Array.from(allSpeakers),
      topTopics,
      conversationsByHour,
      averageDurationMinutes: Math.round(totalDurationMinutes / filteredMemories.length),
    };
  } catch (error) {
    console.error("Failed to get conversation analytics:", error);
    throw error;
  }
}

/**
 * Get enhanced morning briefing content with Omi insights
 */
export async function getMorningBriefingEnhancement(): Promise<{
  recentSummary: OmiSummary | null;
  pendingActionItems: string[];
  keyHighlights: string[];
  upcomingFollowUps: string[];
}> {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    let recentSummary: OmiSummary | null = getOmiSummaryByDate(yesterdayStr) ?? null;
    
    if (!recentSummary) {
      const result = await generateDailySummary(yesterdayStr);
      recentSummary = result?.summary ?? null;
    }

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const recentSummaries = getOmiSummariesInRange(
      threeDaysAgo.toISOString().split("T")[0],
      yesterdayStr
    );

    const pendingActionItems: string[] = [];
    const keyHighlights: string[] = [];
    const upcomingFollowUps: string[] = [];

    for (const summary of recentSummaries) {
      if (summary.actionItems) {
        const items = summary.actionItems.split("\n").filter((item) => item.trim().startsWith("-"));
        pendingActionItems.push(...items.map((item) => item.trim()));
      }

      if (summary.insights) {
        keyHighlights.push(`[${summary.date}] ${summary.insights.substring(0, 200)}`);
      }
    }

    if (recentSummary) {
      const followUpPattern = /follow[- ]?up|check[- ]?in|get back to|remind|tomorrow|next week/gi;
      const matches = recentSummary.keyDiscussions.match(followUpPattern) || [];
      if (matches.length > 0) {
        upcomingFollowUps.push(`Based on yesterday's discussions, there may be follow-ups needed.`);
      }
    }

    return {
      recentSummary,
      pendingActionItems: pendingActionItems.slice(0, 10),
      keyHighlights: keyHighlights.slice(0, 5),
      upcomingFollowUps,
    };
  } catch (error) {
    console.error("Failed to get morning briefing enhancement:", error);
    return {
      recentSummary: null,
      pendingActionItems: [],
      keyHighlights: [],
      upcomingFollowUps: [],
    };
  }
}

// Re-export database functions for easy access
export { getOmiSummaries, getOmiSummaryByDate, getOmiSummariesInRange };

// ============================================
// BACKWARD COMPATIBILITY ALIASES
// These allow imports from limitless.ts to work with omi.ts
// ============================================

// Legacy ContentNode interface (matches Limitless structure)
export interface ContentNode {
  type: string;
  content: string;
  startTime?: string;
  endTime?: string;
  startOffsetMs?: number;
  endOffsetMs?: number;
  children?: ContentNode[];
  speakerName?: string | null;
  speakerIdentifier?: "user" | null;
}

// Legacy Lifelog interface (matches Limitless structure)
export interface Lifelog {
  id: string;
  title: string;
  markdown?: string | null;
  contents: ContentNode[];
  startTime: string;
  endTime: string;
  isStarred: boolean;
  updatedAt: string;
}

// Type alias for summary
export type LimitlessSummary = OmiSummary;

/**
 * Convert OmiMemoryData to legacy Lifelog format
 */
function convertToLifelog(memory: OmiMemoryData): Lifelog {
  const contents: ContentNode[] = memory.transcriptSegments.map(segment => ({
    type: "transcript",
    content: segment.text,
    startTime: memory.startedAt,
    endTime: memory.finishedAt,
    speakerName: segment.isUser ? null : segment.speaker,
    speakerIdentifier: segment.isUser ? "user" : null,
  }));

  return {
    id: memory.id,
    title: memory.structured?.title || 'Conversation',
    markdown: memory.transcript || memory.structured?.overview || null,
    contents,
    startTime: memory.startedAt,
    endTime: memory.finishedAt,
    isStarred: false,
    updatedAt: memory.createdAt,
  };
}

// Backward-compatible function aliases that return Lifelog format
export async function getRecentLifelogs(hours = 24, limit = 20): Promise<Lifelog[]> {
  const memories = await getRecentMemories(hours, limit);
  return memories.map(convertToLifelog);
}

export async function getTodaysLifelogs(limit = 10): Promise<Lifelog[]> {
  const memories = await getTodaysMemories(limit);
  return memories.map(convertToLifelog);
}

export async function searchLifelogs(query: string, options: { limit?: number } = {}): Promise<Lifelog[]> {
  const memories = await searchMemories(query, options);
  return memories.map(convertToLifelog);
}

export async function getLifelog(id: string): Promise<Lifelog | null> {
  const memory = await getMemory(id);
  return memory ? convertToLifelog(memory) : null;
}

export async function getLifelogs(params: { limit?: number; offset?: number } = {}): Promise<Lifelog[]> {
  const memories = await getMemories(params);
  return memories.map(convertToLifelog);
}

export const checkLimitlessConnection = checkOmiConnection;
export const getLifelogOverview = getMemoryOverview;
export const getLimitlessSummaries = getOmiSummaries;
export const extractPeopleFromRecentLifelogs = extractPeopleFromRecentMemories;
export const searchPersonInLifelogs = searchPersonInMemories;

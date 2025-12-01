/**
 * Limitless AI API Service
 * 
 * Provides access to lifelogs from the Limitless pendant for ZEKE context.
 * API documentation: https://api.limitless.ai
 */

import OpenAI from "openai";
import {
  getLimitlessSummaryByDate,
  createLimitlessSummary,
  getLimitlessSummaries,
  getLimitlessSummariesInRange,
} from "./db";
import type { LimitlessSummary, InsertLimitlessSummary } from "@shared/schema";

const LIMITLESS_API_BASE = "https://api.limitless.ai";
const TIMEZONE = "America/New_York";

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

export interface LifelogsResponse {
  data: {
    lifelogs: Lifelog[];
  };
  meta: {
    lifelogs: {
      nextCursor?: string | null;
      count: number;
    };
  };
}

export interface LifelogResponse {
  data: {
    lifelog: Lifelog | null;
  };
}

interface GetLifelogsParams {
  date?: string;
  start?: string;
  end?: string;
  cursor?: string;
  direction?: "asc" | "desc";
  includeMarkdown?: boolean;
  includeHeadings?: boolean;
  isStarred?: boolean;
  limit?: number;
  includeContents?: boolean;
  search?: string;
}

function getApiKey(): string {
  const apiKey = process.env.LIMITLESS_API_KEY;
  if (!apiKey) {
    throw new Error("LIMITLESS_API_KEY is not configured. Please add it to your secrets.");
  }
  return apiKey;
}

async function fetchFromLimitless<T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const apiKey = getApiKey();
  
  const url = new URL(`${LIMITLESS_API_BASE}${endpoint}`);
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });
  }
  
  // Always include timezone
  url.searchParams.append("timezone", TIMEZONE);
  
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "X-API-KEY": apiKey,
      "Accept": "application/json",
    },
  });
  
  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After") || "60";
      throw new Error(`Rate limit exceeded. Retry after ${retryAfter} seconds.`);
    }
    throw new Error(`Limitless API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json() as Promise<T>;
}

/**
 * Get lifelogs with optional filters
 */
export async function getLifelogs(params: GetLifelogsParams = {}): Promise<LifelogsResponse> {
  const queryParams: Record<string, string | number | boolean | undefined> = {
    direction: params.direction ?? "desc",
    includeMarkdown: params.includeMarkdown ?? true,
    includeHeadings: params.includeHeadings ?? true,
    includeContents: params.includeContents ?? true,
    limit: params.limit ?? 10,
  };
  
  if (params.date) queryParams.date = params.date;
  if (params.start) queryParams.start = params.start;
  if (params.end) queryParams.end = params.end;
  if (params.cursor) queryParams.cursor = params.cursor;
  if (params.isStarred !== undefined) queryParams.isStarred = params.isStarred;
  if (params.search) queryParams.search = params.search;
  
  return fetchFromLimitless<LifelogsResponse>("/v1/lifelogs", queryParams);
}

/**
 * Get a single lifelog by ID
 */
export async function getLifelog(id: string, includeMarkdown = true): Promise<LifelogResponse> {
  return fetchFromLimitless<LifelogResponse>(`/v1/lifelogs/${id}`, {
    includeMarkdown,
    includeHeadings: true,
  });
}

/**
 * Search lifelogs using hybrid search (semantic + keyword)
 */
export async function searchLifelogs(
  query: string,
  options: {
    limit?: number;
    date?: string;
    start?: string;
    end?: string;
    isStarred?: boolean;
  } = {}
): Promise<Lifelog[]> {
  const response = await getLifelogs({
    search: query,
    limit: options.limit ?? 10,
    date: options.date,
    start: options.start,
    end: options.end,
    isStarred: options.isStarred,
    includeMarkdown: true,
    includeContents: true,
  });
  
  return response.data.lifelogs;
}

/**
 * Get recent lifelogs from today
 */
export async function getTodaysLifelogs(limit = 10): Promise<Lifelog[]> {
  const today = new Date().toISOString().split("T")[0];
  const response = await getLifelogs({
    date: today,
    limit,
    direction: "desc",
  });
  
  return response.data.lifelogs;
}

/**
 * Get lifelogs from the last N hours
 */
export async function getRecentLifelogs(hours = 24, limit = 20): Promise<Lifelog[]> {
  const now = new Date();
  const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);
  
  const response = await getLifelogs({
    start: startTime.toISOString().slice(0, 19), // Remove timezone for API
    end: now.toISOString().slice(0, 19),
    limit,
    direction: "desc",
  });
  
  return response.data.lifelogs;
}

/**
 * Extract conversation content from a lifelog for AI context
 */
export function extractConversationContent(lifelog: Lifelog): string {
  const parts: string[] = [];
  
  parts.push(`## ${lifelog.title}`);
  parts.push(`Time: ${formatTimeRange(lifelog.startTime, lifelog.endTime)}`);
  
  if (lifelog.markdown) {
    parts.push("");
    parts.push(lifelog.markdown);
  } else if (lifelog.contents && lifelog.contents.length > 0) {
    parts.push("");
    parts.push(extractContentNodes(lifelog.contents));
  }
  
  return parts.join("\n");
}

function extractContentNodes(nodes: ContentNode[], depth = 0): string {
  const parts: string[] = [];
  
  for (const node of nodes) {
    const indent = "  ".repeat(depth);
    
    if (node.type === "heading1" || node.type === "heading2" || node.type === "heading3") {
      const prefix = "#".repeat(parseInt(node.type.slice(-1)));
      parts.push(`${prefix} ${node.content}`);
    } else if (node.type === "blockquote") {
      const speaker = node.speakerIdentifier === "user" ? "You" : (node.speakerName || "Speaker");
      parts.push(`${indent}${speaker}: "${node.content}"`);
    } else if (node.content) {
      parts.push(`${indent}${node.content}`);
    }
    
    if (node.children && node.children.length > 0) {
      parts.push(extractContentNodes(node.children, depth + 1));
    }
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
 * Get contextual lifelog content for a specific topic/query
 * Returns formatted context suitable for AI system prompt
 */
export async function getLifelogContext(
  query: string,
  options: {
    maxResults?: number;
    hoursBack?: number;
  } = {}
): Promise<string> {
  const { maxResults = 5, hoursBack = 72 } = options;
  
  try {
    // Calculate time range based on hoursBack
    const now = new Date();
    const startTime = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
    
    // Search for relevant lifelogs within the time range
    const lifelogs = await searchLifelogs(query, {
      limit: maxResults,
      start: startTime.toISOString().slice(0, 19),
      end: now.toISOString().slice(0, 19),
    });
    
    if (lifelogs.length === 0) {
      return "";
    }
    
    const contextParts: string[] = [
      "## Relevant Context from Recent Conversations (Limitless Pendant)",
      "",
    ];
    
    for (const lifelog of lifelogs) {
      contextParts.push(extractConversationContent(lifelog));
      contextParts.push("");
      contextParts.push("---");
      contextParts.push("");
    }
    
    return contextParts.join("\n");
  } catch (error) {
    console.error("Failed to get lifelog context:", error);
    return "";
  }
}

/**
 * Get a summary of recent activity for daily briefings
 */
export async function getRecentActivitySummary(hours = 24): Promise<string> {
  try {
    const lifelogs = await getRecentLifelogs(hours, 20);
    
    if (lifelogs.length === 0) {
      return "No recorded conversations in the last 24 hours.";
    }
    
    const parts: string[] = [
      `Found ${lifelogs.length} conversation(s) in the last ${hours} hours:`,
      "",
    ];
    
    for (const lifelog of lifelogs) {
      const time = formatTimeRange(lifelog.startTime, lifelog.endTime);
      const starred = lifelog.isStarred ? " ★" : "";
      parts.push(`• ${lifelog.title}${starred} (${time})`);
    }
    
    return parts.join("\n");
  } catch (error) {
    console.error("Failed to get recent activity summary:", error);
    return "Unable to retrieve recent activity from Limitless.";
  }
}

/**
 * Check if Limitless API is configured and working
 */
export async function checkLimitlessConnection(): Promise<{ connected: boolean; error?: string }> {
  try {
    getApiKey();
    const response = await getLifelogs({ limit: 1 });
    return { connected: true };
  } catch (error: any) {
    return { 
      connected: false, 
      error: error.message || "Unknown error connecting to Limitless" 
    };
  }
}

/**
 * Extract people mentioned in a lifelog
 * Returns an array of extracted people with context
 */
export interface ExtractedPerson {
  name: string;
  speakerType: "identified" | "mentioned" | "unknown";
  context: string;
  lifelogId: string;
  lifelogTitle: string;
  timestamp: string;
}

export function extractPeopleFromLifelog(lifelog: Lifelog): ExtractedPerson[] {
  const people: ExtractedPerson[] = [];
  const seenNames = new Set<string>();
  
  function processNode(node: ContentNode, parentContext: string = "") {
    if (node.speakerName && node.speakerIdentifier !== "user" && node.speakerName !== "Unknown") {
      const name = node.speakerName.trim();
      if (!seenNames.has(name.toLowerCase())) {
        seenNames.add(name.toLowerCase());
        people.push({
          name,
          speakerType: "identified",
          context: node.content?.substring(0, 200) || parentContext,
          lifelogId: lifelog.id,
          lifelogTitle: lifelog.title,
          timestamp: node.startTime || lifelog.startTime,
        });
      }
    }
    
    if (node.children) {
      for (const child of node.children) {
        processNode(child, node.content || parentContext);
      }
    }
  }
  
  for (const content of lifelog.contents) {
    processNode(content);
  }
  
  return people;
}

/**
 * Extract people from recent lifelogs
 * Scans lifelogs from the given time period and extracts all identified speakers
 */
export async function extractPeopleFromRecentLifelogs(hours: number = 24): Promise<ExtractedPerson[]> {
  try {
    const lifelogs = await getRecentLifelogs(hours, 50);
    const allPeople: ExtractedPerson[] = [];
    
    for (const lifelog of lifelogs) {
      const people = extractPeopleFromLifelog(lifelog);
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
    console.error("Failed to extract people from lifelogs:", error);
    return [];
  }
}

/**
 * Search for mentions of a specific person in lifelogs
 */
export async function searchPersonInLifelogs(personName: string, limit: number = 10): Promise<{
  lifelogs: Lifelog[];
  mentions: { lifelogId: string; context: string; timestamp: string }[];
}> {
  try {
    const lifelogs = await searchLifelogs(personName, { limit });
    const mentions: { lifelogId: string; context: string; timestamp: string }[] = [];
    
    for (const lifelog of lifelogs) {
      const content = extractConversationContent(lifelog);
      const lowerContent = content.toLowerCase();
      const lowerName = personName.toLowerCase();
      
      let index = lowerContent.indexOf(lowerName);
      while (index !== -1) {
        const start = Math.max(0, index - 100);
        const end = Math.min(content.length, index + personName.length + 100);
        mentions.push({
          lifelogId: lifelog.id,
          context: content.substring(start, end),
          timestamp: lifelog.startTime,
        });
        index = lowerContent.indexOf(lowerName, index + 1);
      }
    }
    
    return { lifelogs, mentions };
  } catch (error) {
    console.error(`Failed to search for ${personName} in lifelogs:`, error);
    return { lifelogs: [], mentions: [] };
  }
}

// ============================================
// AI-POWERED DAILY SUMMARY GENERATION
// ============================================

export interface DailySummaryResult {
  summary: LimitlessSummary;
  cached: boolean;
}

export interface ConversationAnalytics {
  totalConversations: number;
  totalDurationMinutes: number;
  uniqueSpeakers: string[];
  topTopics: { topic: string; count: number }[];
  conversationsByHour: { hour: number; count: number }[];
  averageDurationMinutes: number;
  starredConversations: number;
}

/**
 * Generate or retrieve cached AI-powered daily summary
 * @param date - Date in YYYY-MM-DD format
 * @param forceRegenerate - If true, regenerates even if cached summary exists
 */
export async function generateDailySummary(
  date: string,
  forceRegenerate = false
): Promise<DailySummaryResult | null> {
  // Check for cached summary first
  if (!forceRegenerate) {
    const cached = getLimitlessSummaryByDate(date);
    if (cached) {
      console.log(`Using cached summary for ${date}`);
      return { summary: cached, cached: true };
    }
  }

  try {
    // Fetch lifelogs for the given date
    const response = await getLifelogs({
      date,
      limit: 100,
      includeMarkdown: true,
      includeContents: true,
      direction: "asc",
    });

    const lifelogs = response.data.lifelogs;
    
    if (lifelogs.length === 0) {
      console.log(`No lifelogs found for ${date}`);
      return null;
    }

    // Prepare content for AI analysis
    const conversationContent = lifelogs.map((lifelog) => ({
      id: lifelog.id,
      title: lifelog.title,
      startTime: lifelog.startTime,
      endTime: lifelog.endTime,
      isStarred: lifelog.isStarred,
      content: extractConversationContent(lifelog),
      speakers: extractPeopleFromLifelog(lifelog).map((p) => p.name),
    }));

    // Calculate total duration
    const totalDurationMinutes = lifelogs.reduce((total, lifelog) => {
      const start = new Date(lifelog.startTime);
      const end = new Date(lifelog.endTime);
      return total + Math.round((end.getTime() - start.getTime()) / (1000 * 60));
    }, 0);

    // Extract timeframe
    const timeframeStart = lifelogs[0].startTime;
    const timeframeEnd = lifelogs[lifelogs.length - 1].endTime;

    // Generate summary using OpenAI
    const client = getOpenAIClient();
    
    const summaryPrompt = `You are analyzing conversations from a personal wearable AI device (Limitless pendant) for Nate, a user who relies on ZEKE (their AI assistant) to stay organized and informed.

Date: ${date}
Total Conversations: ${lifelogs.length}
Total Duration: ${totalDurationMinutes} minutes

Conversations:
${conversationContent.map((c, i) => `
### Conversation ${i + 1}: ${c.title}
Time: ${c.startTime} - ${c.endTime}
${c.isStarred ? "[STARRED - Important]" : ""}
Speakers: ${c.speakers.length > 0 ? c.speakers.join(", ") : "Unknown"}

${c.content.substring(0, 2000)}${c.content.length > 2000 ? "..." : ""}
`).join("\n---\n")}

Based on these conversations, provide a comprehensive daily summary in the following JSON format:
{
  "summaryTitle": "A brief, engaging title for the day (e.g., 'Productive Strategy Day' or 'Family Planning & Work Catch-ups')",
  "keyDiscussions": "A detailed paragraph summarizing the main discussions, decisions made, and important conversations. Be specific about what was discussed and with whom.",
  "actionItems": "A bulleted list of any action items, follow-ups, or commitments mentioned in conversations. Format as: • Item 1\\n• Item 2",
  "insights": "Key patterns, observations, or insights about the day. What themes emerged? Any notable quotes or decisions?",
  "peopleInteracted": "Comma-separated list of people Nate interacted with (extracted from speaker names)",
  "topicsDiscussed": "Comma-separated list of main topics/themes (e.g., 'project planning, family dinner, client meeting')"
}

Respond with ONLY the JSON object, no additional text.`;

    const response2 = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: summaryPrompt }],
      temperature: 0.3,
      max_tokens: 1500,
    });

    const summaryText = response2.choices[0]?.message?.content?.trim() || "";
    
    // Parse the JSON response
    let parsedSummary;
    try {
      // Handle potential markdown code blocks
      const jsonContent = summaryText.replace(/```json\n?|\n?```/g, "").trim();
      parsedSummary = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error("Failed to parse AI summary:", parseError);
      // Create a fallback summary
      parsedSummary = {
        summaryTitle: `${lifelogs.length} Conversations on ${date}`,
        keyDiscussions: `Had ${lifelogs.length} conversation(s) totaling ${totalDurationMinutes} minutes.`,
        actionItems: "Unable to extract action items automatically.",
        insights: "Summary generation encountered parsing issues.",
        peopleInteracted: conversationContent.flatMap((c) => c.speakers).filter((v, i, a) => a.indexOf(v) === i).join(", "),
        topicsDiscussed: lifelogs.map((l) => l.title).join(", "),
      };
    }

    // Store in database
    const summaryData: InsertLimitlessSummary = {
      date,
      timeframeStart,
      timeframeEnd,
      summaryTitle: parsedSummary.summaryTitle,
      keyDiscussions: parsedSummary.keyDiscussions,
      actionItems: parsedSummary.actionItems,
      insights: parsedSummary.insights,
      peopleInteracted: parsedSummary.peopleInteracted,
      topicsDiscussed: parsedSummary.topicsDiscussed,
      lifelogIds: lifelogs.map((l) => l.id).join(","),
      lifelogCount: lifelogs.length,
      totalDurationMinutes,
    };

    const savedSummary = createLimitlessSummary(summaryData);
    console.log(`Generated and saved new summary for ${date}`);

    return { summary: savedSummary, cached: false };
  } catch (error) {
    console.error(`Failed to generate daily summary for ${date}:`, error);
    throw error;
  }
}

/**
 * Get analytics data for Limitless conversations over a date range
 */
export async function getConversationAnalytics(
  startDate: string,
  endDate: string
): Promise<ConversationAnalytics> {
  try {
    const response = await getLifelogs({
      start: `${startDate}T00:00:00`,
      end: `${endDate}T23:59:59`,
      limit: 200,
      includeContents: true,
      direction: "asc",
    });

    const lifelogs = response.data.lifelogs;
    
    if (lifelogs.length === 0) {
      return {
        totalConversations: 0,
        totalDurationMinutes: 0,
        uniqueSpeakers: [],
        topTopics: [],
        conversationsByHour: [],
        averageDurationMinutes: 0,
        starredConversations: 0,
      };
    }

    // Calculate metrics
    const allSpeakers = new Set<string>();
    const topicCounts: Record<string, number> = {};
    const hourCounts: Record<number, number> = {};
    let totalDurationMinutes = 0;
    let starredCount = 0;

    for (const lifelog of lifelogs) {
      // Duration
      const start = new Date(lifelog.startTime);
      const end = new Date(lifelog.endTime);
      totalDurationMinutes += Math.round((end.getTime() - start.getTime()) / (1000 * 60));

      // Starred
      if (lifelog.isStarred) starredCount++;

      // Speakers
      const people = extractPeopleFromLifelog(lifelog);
      for (const person of people) {
        allSpeakers.add(person.name);
      }

      // Hour distribution
      const hour = new Date(lifelog.startTime).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;

      // Topics from title (simplified extraction)
      const words = lifelog.title.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length > 3 && !["with", "about", "the", "and", "for", "this", "that"].includes(word)) {
          topicCounts[word] = (topicCounts[word] || 0) + 1;
        }
      }
    }

    // Sort and format topics
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic, count]) => ({ topic, count }));

    // Format hour distribution
    const conversationsByHour = Object.entries(hourCounts)
      .map(([hour, count]) => ({ hour: parseInt(hour), count }))
      .sort((a, b) => a.hour - b.hour);

    return {
      totalConversations: lifelogs.length,
      totalDurationMinutes,
      uniqueSpeakers: Array.from(allSpeakers),
      topTopics,
      conversationsByHour,
      averageDurationMinutes: Math.round(totalDurationMinutes / lifelogs.length),
      starredConversations: starredCount,
    };
  } catch (error) {
    console.error("Failed to get conversation analytics:", error);
    throw error;
  }
}

/**
 * Get enhanced morning briefing content with Limitless insights
 */
export async function getMorningBriefingEnhancement(): Promise<{
  recentSummary: LimitlessSummary | null;
  pendingActionItems: string[];
  keyHighlights: string[];
  upcomingFollowUps: string[];
}> {
  try {
    // Get yesterday's summary
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    let recentSummary = getLimitlessSummaryByDate(yesterdayStr);
    
    // If no cached summary, try to generate one
    if (!recentSummary) {
      const result = await generateDailySummary(yesterdayStr);
      recentSummary = result?.summary || null;
    }

    // Extract pending action items from recent summaries (last 3 days)
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const recentSummaries = getLimitlessSummariesInRange(
      threeDaysAgo.toISOString().split("T")[0],
      yesterdayStr
    );

    const pendingActionItems: string[] = [];
    const keyHighlights: string[] = [];
    const upcomingFollowUps: string[] = [];

    for (const summary of recentSummaries) {
      // Parse action items
      if (summary.actionItems) {
        const items = summary.actionItems.split("\n").filter((item) => item.trim().startsWith("•"));
        pendingActionItems.push(...items.map((item) => item.trim()));
      }

      // Add highlights
      if (summary.insights) {
        keyHighlights.push(`[${summary.date}] ${summary.insights.substring(0, 200)}`);
      }
    }

    // Look for follow-up mentions in recent conversations
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
export { getLimitlessSummaries, getLimitlessSummaryByDate, getLimitlessSummariesInRange };

/**
 * Limitless AI API Service
 * 
 * Provides access to lifelogs from the Limitless pendant for ZEKE context.
 * API documentation: https://api.limitless.ai
 */

const LIMITLESS_API_BASE = "https://api.limitless.ai";
const TIMEZONE = "America/New_York";

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

import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";
import {
  searchLifelogs,
  getRecentLifelogs,
  getTodaysLifelogs,
  getLifelogContext,
  extractConversationContent,
  checkLimitlessConnection,
  getLifelogOverview,
  generateDailySummary,
  getLimitlessSummaryByDate,
  type Lifelog,
} from "../limitless";
import { createMemoryWithEmbedding } from "../semanticMemory";

export const memoryToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_lifelog_overview",
      description: "ALWAYS use this first when Nate asks about his lifelog data or what was recorded. Returns a quick overview of available Limitless lifelog data including: today's conversations, yesterday's conversations, last 7 days count, and the most recent recording with its age. This helps understand what data is available before doing specific searches.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_lifelogs",
      description: "Search through Nate's recorded conversations and lifelogs from the Limitless pendant. Uses hybrid search (semantic + keyword) to find relevant conversations by topic, person, or content. Perfect for questions like 'What did Bob say about the project?' or 'Find the conversation where we discussed pricing'. Searches across ALL available data unless a specific date is provided.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query - can be semantic (e.g., 'dinner recommendations from Bob') or keyword-based (e.g., 'blue OR red')",
          },
          limit: {
            type: "number",
            description: "Maximum number of results to return (default 5, max 100)",
          },
          date: {
            type: "string",
            description: "Filter to specific date (YYYY-MM-DD format). Omit to search all available data.",
          },
          starred_only: {
            type: "boolean",
            description: "Only return starred/important conversations",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_lifelogs",
      description: "Get recent recorded conversations from Nate's Limitless pendant. Default is 24 hours - use a larger value (48, 72, or more) when looking for 'recent' conversations that might be from earlier today or yesterday. Use get_lifelog_overview first if unsure what data is available.",
      parameters: {
        type: "object",
        properties: {
          hours: {
            type: "number",
            description: "How many hours back to look (default 24). Use 48-72 hours for a broader search.",
          },
          limit: {
            type: "number",
            description: "Maximum number of results to return (default 10)",
          },
          today_only: {
            type: "boolean",
            description: "Only get conversations from today (since midnight)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_lifelog_context",
      description: "Get relevant lifelog context for a specific topic. Returns formatted conversation excerpts that can help answer questions about what was discussed. Searches the last 72 hours by default. Use this before answering questions that might benefit from real-world context.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description: "The topic or question to find relevant context for",
          },
          max_results: {
            type: "number",
            description: "Maximum number of conversations to include (default 5)",
          },
        },
        required: ["topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_limitless_status",
      description: "Check if the Limitless pendant API is connected and working properly. Use get_lifelog_overview instead for a more informative check that also shows available data.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_daily_summary",
      description: "Generate an AI-powered summary of all conversations from a specific day. Extracts key discussions, action items, insights, people mentioned, and topics discussed. The summary is cached for faster retrieval.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date to summarize in YYYY-MM-DD format. Defaults to today if not provided.",
          },
          force_regenerate: {
            type: "boolean",
            description: "Force regeneration even if a cached summary exists (default: false)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_daily_summary",
      description: "Get a previously generated daily summary for a specific date. Returns the cached summary if it exists, without regenerating.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date to get summary for in YYYY-MM-DD format. Defaults to today if not provided.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_memory",
      description: "Create a new memory note for long-term storage. Use this to save important facts, preferences, action items, or notes about people and events.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["fact", "preference", "note", "summary"],
            description: "Type of memory: fact (general facts), preference (user preferences), note (action items, commitments, decisions), summary (summaries)",
          },
          content: {
            type: "string",
            description: "The content of the memory to save",
          },
          context: {
            type: "string",
            description: "Additional context about the memory (e.g., source, related person, date)",
          },
        },
        required: ["type", "content"],
      },
    },
  },
];

export const memoryToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  get_lifelog_overview: (p) => p.canAccessPersonalInfo,
  search_lifelogs: (p) => p.canAccessPersonalInfo,
  get_recent_lifelogs: (p) => p.canAccessPersonalInfo,
  get_lifelog_context: (p) => p.canAccessPersonalInfo,
  check_limitless_status: () => true,
  generate_daily_summary: (p) => p.isAdmin,
  get_daily_summary: (p) => p.canAccessPersonalInfo,
  create_memory: (p) => p.canAccessPersonalInfo,
};

export async function executeMemoryTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string | null> {
  switch (toolName) {
    case "get_lifelog_overview": {
      try {
        const overview = await getLifelogOverview();
        
        if (!overview.connected) {
          return JSON.stringify({
            success: false,
            error: "Unable to connect to Limitless API. Make sure the API key is configured.",
          });
        }
        
        return JSON.stringify({
          success: true,
          overview: {
            todayCount: overview.today.count,
            todayConversations: overview.today.conversations,
            yesterdayCount: overview.yesterday.count,
            yesterdayConversations: overview.yesterday.conversations,
            last7DaysCount: overview.last7Days.count,
            datesWithData: overview.last7Days.dates,
            mostRecent: overview.mostRecent,
          },
          summary: overview.today.count > 0
            ? `Found ${overview.today.count} conversation(s) today, ${overview.yesterday.count} yesterday, and ${overview.last7Days.count} total in the last 7 days.${overview.mostRecent ? ` Most recent was "${overview.mostRecent.title}" (${overview.mostRecent.age}).` : ""}`
            : overview.yesterday.count > 0
            ? `No conversations today, but found ${overview.yesterday.count} yesterday and ${overview.last7Days.count} total in the last 7 days.${overview.mostRecent ? ` Most recent was "${overview.mostRecent.title}" (${overview.mostRecent.age}).` : ""}`
            : overview.last7Days.count > 0
            ? `No recent conversations. Found ${overview.last7Days.count} in the last 7 days on these dates: ${overview.last7Days.dates.join(", ")}.${overview.mostRecent ? ` Most recent was "${overview.mostRecent.title}" (${overview.mostRecent.age}).` : ""}`
            : "No conversations found in the last 7 days. The pendant may not be recording or syncing.",
        });
      } catch (error: any) {
        console.error("Failed to get lifelog overview:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to get lifelog overview.",
        });
      }
    }
    
    case "search_lifelogs": {
      const { query, limit, date, starred_only } = args as {
        query: string;
        limit?: number;
        date?: string;
        starred_only?: boolean;
      };
      
      try {
        const lifelogs = await searchLifelogs(query, {
          limit: limit ?? 5,
          date,
          isStarred: starred_only,
        });
        
        if (lifelogs.length === 0) {
          return JSON.stringify({
            success: true,
            message: `No conversations found matching "${query}"`,
            results: [],
          });
        }
        
        const results = lifelogs.map((log: Lifelog) => ({
          id: log.id,
          title: log.title,
          startTime: log.startTime,
          endTime: log.endTime,
          isStarred: log.isStarred,
          excerpt: log.markdown?.substring(0, 500) || extractConversationContent(log).substring(0, 500),
        }));
        
        return JSON.stringify({
          success: true,
          message: `Found ${lifelogs.length} conversation(s) matching "${query}"`,
          results,
        });
      } catch (error: any) {
        console.error("Failed to search lifelogs:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to search lifelogs. Make sure Limitless API key is configured.",
        });
      }
    }
    
    case "get_recent_lifelogs": {
      const { hours, limit, today_only } = args as {
        hours?: number;
        limit?: number;
        today_only?: boolean;
      };
      
      try {
        let lifelogs: Lifelog[];
        
        if (today_only) {
          lifelogs = await getTodaysLifelogs(limit ?? 10);
        } else {
          lifelogs = await getRecentLifelogs(hours ?? 24, limit ?? 10);
        }
        
        if (lifelogs.length === 0) {
          return JSON.stringify({
            success: true,
            message: today_only 
              ? "No conversations recorded today" 
              : `No conversations in the last ${hours ?? 24} hours`,
            results: [],
          });
        }
        
        const results = lifelogs.map((log: Lifelog) => ({
          id: log.id,
          title: log.title,
          startTime: log.startTime,
          endTime: log.endTime,
          isStarred: log.isStarred,
          excerpt: log.markdown?.substring(0, 300) || extractConversationContent(log).substring(0, 300),
        }));
        
        return JSON.stringify({
          success: true,
          message: `Found ${lifelogs.length} recent conversation(s)`,
          results,
        });
      } catch (error: any) {
        console.error("Failed to get recent lifelogs:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to get recent lifelogs. Make sure Limitless API key is configured.",
        });
      }
    }
    
    case "get_lifelog_context": {
      const { topic, max_results } = args as {
        topic: string;
        max_results?: number;
      };
      
      try {
        const context = await getLifelogContext(topic, {
          maxResults: max_results ?? 5,
        });
        
        if (!context) {
          return JSON.stringify({
            success: true,
            message: `No relevant conversations found for "${topic}"`,
            context: "",
          });
        }
        
        return JSON.stringify({
          success: true,
          message: `Found relevant context for "${topic}"`,
          context,
        });
      } catch (error: any) {
        console.error("Failed to get lifelog context:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to get lifelog context. Make sure Limitless API key is configured.",
        });
      }
    }
    
    case "check_limitless_status": {
      try {
        const status = await checkLimitlessConnection();
        return JSON.stringify({
          success: true,
          connected: status.connected,
          error: status.error,
          message: status.connected 
            ? "Limitless pendant API is connected and working" 
            : `Limitless connection failed: ${status.error}`,
        });
      } catch (error: any) {
        console.error("Failed to check Limitless status:", error);
        return JSON.stringify({
          success: false,
          connected: false,
          error: error.message || "Failed to check Limitless status",
        });
      }
    }
    
    case "generate_daily_summary": {
      const { date, force_regenerate } = args as {
        date?: string;
        force_regenerate?: boolean;
      };
      
      const targetDate = date || new Date().toISOString().split("T")[0];
      
      try {
        const result = await generateDailySummary(targetDate, force_regenerate ?? false);
        
        if (!result) {
          return JSON.stringify({
            success: false,
            message: `No conversations found for ${targetDate}`,
          });
        }
        
        const summary = result.summary;
        
        const safeJsonParse = (jsonStr: string | null | undefined): unknown[] => {
          if (!jsonStr) return [];
          try {
            return JSON.parse(jsonStr);
          } catch {
            return [];
          }
        };
        
        const keyDiscussions = safeJsonParse(summary.keyDiscussions);
        const actionItems = safeJsonParse(summary.actionItems);
        const insights = safeJsonParse(summary.insights);
        const people = safeJsonParse(summary.peopleInteracted);
        const topics = safeJsonParse(summary.topicsDiscussed);
        
        return JSON.stringify({
          success: true,
          cached: result.cached,
          date: summary.date,
          title: summary.summaryTitle,
          conversationCount: summary.lifelogCount,
          totalDurationMinutes: summary.totalDurationMinutes,
          keyDiscussions,
          actionItems,
          insights,
          peopleInteracted: people,
          topicsDiscussed: topics,
          message: result.cached 
            ? `Retrieved cached summary for ${targetDate}` 
            : `Generated new summary for ${targetDate}`,
        });
      } catch (error: any) {
        console.error("Failed to generate daily summary:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to generate daily summary",
        });
      }
    }
    
    case "get_daily_summary": {
      const { date } = args as {
        date?: string;
      };
      
      const targetDate = date || new Date().toISOString().split("T")[0];
      
      try {
        const summary = getLimitlessSummaryByDate(targetDate);
        
        if (!summary) {
          return JSON.stringify({
            success: true,
            exists: false,
            message: `No summary exists for ${targetDate}. Use generate_daily_summary to create one.`,
          });
        }
        
        const safeJsonParse = (jsonStr: string | null | undefined): unknown[] => {
          if (!jsonStr) return [];
          try {
            return JSON.parse(jsonStr);
          } catch {
            return [];
          }
        };
        
        const keyDiscussions = safeJsonParse(summary.keyDiscussions);
        const actionItems = safeJsonParse(summary.actionItems);
        const insights = safeJsonParse(summary.insights);
        const people = safeJsonParse(summary.peopleInteracted);
        const topics = safeJsonParse(summary.topicsDiscussed);
        
        return JSON.stringify({
          success: true,
          exists: true,
          date: summary.date,
          title: summary.summaryTitle,
          conversationCount: summary.lifelogCount,
          totalDurationMinutes: summary.totalDurationMinutes,
          keyDiscussions,
          actionItems,
          insights,
          peopleInteracted: people,
          topicsDiscussed: topics,
          createdAt: summary.createdAt,
        });
      } catch (error: any) {
        console.error("Failed to get daily summary:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to get daily summary",
        });
      }
    }
    
    case "create_memory": {
      const { type, content, context } = args as {
        type: "fact" | "preference" | "note" | "summary";
        content: string;
        context?: string;
      };
      
      if (!type || !content) {
        return JSON.stringify({
          success: false,
          error: "type and content are required",
        });
      }
      
      const validTypes = ["fact", "preference", "note", "summary"];
      if (!validTypes.includes(type)) {
        return JSON.stringify({
          success: false,
          error: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
        });
      }
      
      try {
        const result = await createMemoryWithEmbedding({
          type,
          content,
          context: context || "",
        });
        
        if (result.isDuplicate) {
          return JSON.stringify({
            success: true,
            isDuplicate: true,
            message: "A similar memory already exists",
            memoryId: result.duplicateOf,
          });
        }
        
        return JSON.stringify({
          success: true,
          message: `Memory created: ${content.substring(0, 50)}${content.length > 50 ? "..." : ""}`,
          memoryId: result.note.id,
          type: result.note.type,
        });
      } catch (error: any) {
        console.error("Failed to create memory:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to create memory",
        });
      }
    }
    
    default:
      return null;
  }
}

export const memoryToolNames = [
  "get_lifelog_overview",
  "search_lifelogs",
  "get_recent_lifelogs",
  "get_lifelog_context",
  "check_limitless_status",
  "generate_daily_summary",
  "get_daily_summary",
  "create_memory",
];

import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";
import {
  searchMemories,
  getRecentMemories,
  getTodaysMemories,
  getMemoryContext,
  extractConversationContent,
  checkOmiConnection,
  getMemoryOverview,
  extractMemoryInsights,
  generateDailySummary,
  getOmiSummaryByDate,
  type OmiMemoryData,
} from "../omi";
import { createMemoryWithEmbedding } from "../semanticMemory";

export const memoryToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_memory_overview",
      description: "ALWAYS use this first when Nate asks about his memory data or what was recorded. Returns a quick overview of available Omi memory data including: today's memories, yesterday's memories, last 7 days count, and the most recent recording with its age. This helps understand what data is available before doing specific searches.",
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
      name: "extract_memory_insights",
      description:
        "Analyze recent or searched memories to surface themes, anomalies, and action items. Clusters related conversations, highlights contradictions, and cross-references potential task/calendar follow-ups.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Optional search query to focus analysis on a topic; omit to analyze recent memories",
          },
          hours: {
            type: "number",
            description: "Lookback window in hours when no query is provided (default 72)",
          },
          limit: {
            type: "number",
            description: "Maximum number of memories to analyze (default 12)",
          },
          include_calendar: {
            type: "boolean",
            description: "Note calendar follow-ups when mentioned in memories",
          },
          include_tasks: {
            type: "boolean",
            description: "Note task follow-ups when mentioned in memories",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_memories",
      description: "Search through Nate's recorded conversations and memories from the Omi device. Uses hybrid search (semantic + keyword) to find relevant conversations by topic, person, or content. Perfect for questions like 'What did Bob say about the project?' or 'Find the conversation where we discussed pricing'. Searches across ALL available data unless a specific date is provided.",
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
            description: "Only return starred/important memories",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_memories",
      description: "Get recent recorded conversations from Nate's Omi device. Default is 24 hours - use a larger value (48, 72, or more) when looking for 'recent' conversations that might be from earlier today or yesterday. Use get_memory_overview first if unsure what data is available.",
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
            description: "Only get memories from today (since midnight)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_memory_context",
      description: "Get relevant memory context for a specific topic. Returns formatted conversation excerpts that can help answer questions about what was discussed. Searches the last 72 hours by default. Use this before answering questions that might benefit from real-world context.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description: "The topic or question to find relevant context for",
          },
          max_results: {
            type: "number",
            description: "Maximum number of memories to include (default 5)",
          },
        },
        required: ["topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_omi_status",
      description: "Check if the Omi device API is connected and working properly. Use get_memory_overview instead for a more informative check that also shows available data.",
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
  get_memory_overview: (p) => p.canAccessPersonalInfo,
  extract_memory_insights: (p) => p.canAccessPersonalInfo,
  search_memories: (p) => p.canAccessPersonalInfo,
  get_recent_memories: (p) => p.canAccessPersonalInfo,
  get_memory_context: (p) => p.canAccessPersonalInfo,
  check_omi_status: () => true,
  generate_daily_summary: (p) => p.isAdmin,
  get_daily_summary: (p) => p.canAccessPersonalInfo,
  create_memory: (p) => p.canAccessPersonalInfo,
};

export async function executeMemoryTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string | null> {
  switch (toolName) {
    case "get_memory_overview": {
      try {
        const overview = await getMemoryOverview();
        
        if (!overview.connected) {
          return JSON.stringify({
            success: false,
            error: "Unable to connect to Omi API. Make sure the API key is configured.",
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
            ? `Found ${overview.today.count} memory(s) today, ${overview.yesterday.count} yesterday, and ${overview.last7Days.count} total in the last 7 days.${overview.mostRecent ? ` Most recent was "${overview.mostRecent.title}" (${overview.mostRecent.age}).` : ""}`
            : overview.yesterday.count > 0
            ? `No memories today, but found ${overview.yesterday.count} yesterday and ${overview.last7Days.count} total in the last 7 days.${overview.mostRecent ? ` Most recent was "${overview.mostRecent.title}" (${overview.mostRecent.age}).` : ""}`
            : overview.last7Days.count > 0
            ? `No recent memories. Found ${overview.last7Days.count} in the last 7 days on these dates: ${overview.last7Days.dates.join(", ")}.${overview.mostRecent ? ` Most recent was "${overview.mostRecent.title}" (${overview.mostRecent.age}).` : ""}`
            : "No memories found in the last 7 days. The device may not be recording or syncing.",
        });
      } catch (error: any) {
        console.error("Failed to get memory overview:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to get memory overview.",
        });
      }
    }

    case "extract_memory_insights": {
      const { query, hours, limit, include_calendar, include_tasks } = args as {
        query?: string;
        hours?: number;
        limit?: number;
        include_calendar?: boolean;
        include_tasks?: boolean;
      };

      try {
        const insights = await extractMemoryInsights({
          query,
          hours,
          limit,
          includeCalendar: include_calendar ?? true,
          includeTasks: include_tasks ?? true,
        });

        return JSON.stringify({
          success: true,
          ...insights,
        });
      } catch (error: any) {
        console.error("Failed to extract memory insights:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to extract memory insights.",
        });
      }
    }

    case "search_memories": {
      const { query, limit, date, starred_only } = args as {
        query: string;
        limit?: number;
        date?: string;
        starred_only?: boolean;
      };
      
      try {
        const memories = await searchMemories(query, {
          limit: limit ?? 5,
        });
        
        if (memories.length === 0) {
          return JSON.stringify({
            success: true,
            message: `No memories found matching "${query}"`,
            results: [],
          });
        }
        
        const results = memories.map((mem: OmiMemoryData) => ({
          id: mem.id,
          title: mem.structured?.title || 'Memory',
          startTime: mem.startedAt,
          endTime: mem.finishedAt,
          excerpt: mem.structured?.overview?.substring(0, 500) || extractConversationContent(mem).substring(0, 500),
        }));
        
        return JSON.stringify({
          success: true,
          message: `Found ${memories.length} memory(s) matching "${query}"`,
          results,
        });
      } catch (error: any) {
        console.error("Failed to search memories:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to search memories. Make sure Omi API key is configured.",
        });
      }
    }
    
    case "get_recent_memories": {
      const { hours, limit, today_only } = args as {
        hours?: number;
        limit?: number;
        today_only?: boolean;
      };
      
      try {
        let memories: OmiMemoryData[];
        
        if (today_only) {
          memories = await getTodaysMemories(limit ?? 10);
        } else {
          memories = await getRecentMemories(hours ?? 24, limit ?? 10);
        }
        
        if (memories.length === 0) {
          return JSON.stringify({
            success: true,
            message: today_only 
              ? "No memories recorded today" 
              : `No memories in the last ${hours ?? 24} hours`,
            results: [],
          });
        }
        
        const results = memories.map((mem: OmiMemoryData) => ({
          id: mem.id,
          title: mem.structured?.title || 'Memory',
          startTime: mem.startedAt,
          endTime: mem.finishedAt,
          excerpt: mem.structured?.overview?.substring(0, 300) || extractConversationContent(mem).substring(0, 300),
        }));
        
        return JSON.stringify({
          success: true,
          message: `Found ${memories.length} recent memory(s)`,
          results,
        });
      } catch (error: any) {
        console.error("Failed to get recent memories:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to get recent memories. Make sure Omi API key is configured.",
        });
      }
    }
    
    case "get_memory_context": {
      const { topic, max_results } = args as {
        topic: string;
        max_results?: number;
      };
      
      try {
        const context = await getMemoryContext(topic, {
          maxResults: max_results ?? 5,
        });
        
        if (!context) {
          return JSON.stringify({
            success: true,
            message: `No relevant memories found for "${topic}"`,
            context: "",
          });
        }
        
        return JSON.stringify({
          success: true,
          message: `Found relevant context for "${topic}"`,
          context,
        });
      } catch (error: any) {
        console.error("Failed to get memory context:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to get memory context. Make sure Omi API key is configured.",
        });
      }
    }
    
    case "check_omi_status": {
      try {
        const status = await checkOmiConnection();
        return JSON.stringify({
          success: true,
          connected: status.connected,
          error: status.error,
          message: status.connected 
            ? "Omi device API is connected and working" 
            : `Omi connection failed: ${status.error}`,
        });
      } catch (error: any) {
        console.error("Failed to check Omi status:", error);
        return JSON.stringify({
          success: false,
          connected: false,
          error: error.message || "Failed to check Omi status",
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
          conversationCount: summary.memoryCount,
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
        const summary = getOmiSummaryByDate(targetDate);
        
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
          conversationCount: summary.memoryCount,
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
  "get_memory_overview",
  "extract_memory_insights",
  "search_memories",
  "get_recent_memories",
  "get_memory_context",
  "check_omi_status",
  "generate_daily_summary",
  "get_daily_summary",
  "create_memory",
];

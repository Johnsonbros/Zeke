import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";
import {
  searchLifelogs,
  getRecentLifelogs,
  getTodaysLifelogs,
  getLifelogContext,
  extractConversationContent,
  checkLimitlessConnection,
  type Lifelog,
} from "../limitless";

export const memoryToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_lifelogs",
      description: "Search through Nate's recorded conversations and lifelogs from the Limitless pendant. Uses hybrid search (semantic + keyword) to find relevant conversations by topic, person, or content. Perfect for questions like 'What did Bob say about the project?' or 'Find the conversation where we discussed pricing'.",
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
            description: "Filter to specific date (YYYY-MM-DD format)",
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
      description: "Get recent recorded conversations from Nate's Limitless pendant. Useful for context about what happened today or in the last few hours.",
      parameters: {
        type: "object",
        properties: {
          hours: {
            type: "number",
            description: "How many hours back to look (default 24)",
          },
          limit: {
            type: "number",
            description: "Maximum number of results to return (default 10)",
          },
          today_only: {
            type: "boolean",
            description: "Only get conversations from today",
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
      description: "Get relevant lifelog context for a specific topic. Returns formatted conversation excerpts that can help answer questions about what was discussed. Use this before answering questions that might benefit from real-world context.",
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
      description: "Check if the Limitless pendant API is connected and working properly.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

export const memoryToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  search_lifelogs: (p) => p.canAccessPersonalInfo,
  get_recent_lifelogs: (p) => p.canAccessPersonalInfo,
  get_lifelog_context: (p) => p.canAccessPersonalInfo,
  check_limitless_status: () => true,
};

export async function executeMemoryTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string | null> {
  switch (toolName) {
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
    
    default:
      return null;
  }
}

export const memoryToolNames = [
  "search_lifelogs",
  "get_recent_lifelogs",
  "get_lifelog_context",
  "check_limitless_status",
];

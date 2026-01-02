import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";

export const dynamicToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "load_tool_category",
      description:
        "Load an additional category of tools (e.g., knowledgeGraph, predictions, codebase) into the active set so the agent can use them.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Name of the tool category to load. Must match a category exported from server/capabilities (e.g., knowledgeGraph, predictions, codebase).",
          },
        },
        required: ["category"],
      },
    },
  },
];

export const dynamicToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  load_tool_category: (permissions) => permissions.isAdmin,
};

export const dynamicToolNames = ["load_tool_category"] as const;

export async function executeDynamicTool(toolName: string, args: Record<string, unknown>): Promise<string | null> {
  if (toolName === "load_tool_category") {
    const category = args.category;

    if (typeof category !== "string" || category.trim().length === 0) {
      return JSON.stringify({ success: false, error: "A category name is required." });
    }

    const { loadToolCategory } = await import("../tools");

    try {
      loadToolCategory(category);
      return JSON.stringify({ success: true, loaded_category: category });
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error?.message || "Failed to load tool category.",
      });
    }
  }

  return null;
}

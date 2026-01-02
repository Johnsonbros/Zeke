Dynamic Tool Loading for ZEKE

Context

In ZEKE’s current architecture the assistant passes a static array of tool definitions into the OpenAI chat completion call. All capabilities are registered at boot time and presented to the model, and the dispatcher (server/tools.ts) knows how to call each one. This design hits the OpenAI‐imposed limit of 128 tools; as a result, entire categories of capabilities (e.g. knowledge‑graph and prediction tools) are disabled.

To keep the toolset flexible and avoid hitting hard limits, we want to support dynamic tool loading. The idea is to ship only a core set of tools initially, then allow the agent (subject to permissions) to explicitly load additional categories at runtime. This reduces the baseline number of tools while still keeping everything available on request.

Goals

Refactor server/tools.ts so the list of active tool definitions, permissions and names is computed from a set of active categories rather than being hard‑coded at import time. Maintain backwards compatibility: the agent should still be able to call tools via executeTool, but the available tools are determined by the active categories.

Introduce a new tool called load_tool_category that allows an administrator to load additional categories (e.g. knowledgeGraph, predictions, codebase) into the active set. The tool should accept the name of a category and, if that category exists in server/capabilities, add it to the active set. Only users with admin permissions may invoke this tool.

Create a new module (server/capabilities/dynamic.ts) that exports the definitions and executor for the load_tool_category tool. Add this to the default set of always‑loaded categories.

Modify server/capabilities/index.ts to export the dynamic tool definitions and names. Update the aggregator to avoid collecting definitions from non‑active categories.

Update server/agent.ts to call a function such as getActiveToolDefinitions() instead of referencing a static toolDefinitions array. Wherever tool definitions or permissions are needed, use the new getter functions.

Implementation Steps

Add a task file (codex_tasks/dynamic_tool_loading.md) with these instructions. AGENTS or Codex will use this file to apply the requested changes.

Create a new dynamic.ts capability module inside server/capabilities that defines the load_tool_category tool. This module should:

Export an array dynamicToolDefinitions with a single OpenAI.Chat.ChatCompletionTool entry for the load_tool_category function. The tool description should explain that it loads a category of tools by name.

Define an executeDynamicTool function that receives a tool name and arguments. For load_tool_category, it should call a helper function exported from server/tools.ts (see below) and return a JSON string indicating success or failure.

Provide a permissions object dynamicToolPermissions that marks load_tool_category as admin‑only.

Export an array dynamicToolNames containing the tool name.

Refactor server/tools.ts:

Maintain a Set<string> activeCategories that contains the names of categories that are currently loaded. Initialise it with the core categories you always need (e.g. communication, reminders, tasks, calendar, grocery, search, files, memory, utility, location, people, list, food, automation, weather, dynamic). Do not include the knowledge graph or prediction categories by default.

Write a helper function computeDefinitions() that iterates through activeCategories, looks up each category’s exported definitions, permissions and names in server/capabilities, and merges them. Return an object containing defs, perms, and names.

Export three getters:

export function getActiveToolDefinitions(): OpenAI.Chat.ChatCompletionTool[];
export function getActiveToolPermissions(): Record<string, (p: ToolPermissions) => boolean>;
export function getActiveToolNames(): string[];

Each getter should call computeDefinitions() and return the appropriate property. This ensures that any time the active categories change, the agent sees an updated tool list.

Export a function loadToolCategory(category: string): void that checks whether the given category exists (by testing whether server/capabilities/${category}ToolDefinitions is defined). If valid, add it to activeCategories. Otherwise throw an error.

Modify executeTool so that it refers to the dynamic permissions: instead of reading from a static TOOL_PERMISSIONS, call getActiveToolPermissions() and check the permission function for the requested tool name.

Update the existing export of toolDefinitions (if one is required by other modules) to call getActiveToolDefinitions().

Modify server/capabilities/index.ts:

Instead of building allToolDefinitions as a concatenation of all imported categories, export each category’s definitions, permissions, and names separately. For example, you might have

export { communicationToolDefinitions, communicationToolPermissions, communicationToolNames } from './communication';


and similarly for each category. Existing imports remain the same; you’re just making the exports individually available.

Import and re‑export the new dynamic capability module.

Remove the logic that concatenates tool definitions into allToolDefinitions and exclude categories; this will now be handled dynamically.

Update server/agent.ts:

Wherever the code previously referenced toolDefinitions, replace that with a call to getActiveToolDefinitions() (imported from server/tools.ts). Similarly, if you explicitly referenced TOOL_PERMISSIONS, replace that with getActiveToolPermissions().

Ensure the agent uses the new dynamic definitions when sending tool definitions to OpenAI’s API. This allows the list to grow when load_tool_category is invoked.

Testing:

Start the development environment and ensure existing functionality continues to work. The default categories should be loaded and accessible.

Create a chat session as an admin and call the load_tool_category tool with "knowledgeGraph" or "predictions" to load the additional categories. Verify that the new tools appear in the getActiveToolDefinitions() output and can be invoked.

Try calling load_tool_category as a non‑admin user and confirm that permission is denied.

Notes

Keep existing naming conventions: category modules should follow the pattern <category>.ts in server/capabilities, exporting <category>ToolDefinitions, <category>ToolPermissions, <category>ToolNames and an executor. The dynamic loader should use these names to verify that a category exists.

Avoid adding new dependencies or altering the OpenAI SDK usage.

Maintain backward compatibility with existing code; changes should be additive, not destructive.

Once these changes are implemented, ZEKE will support dynamic tool loading, allowing administrators to load heavy toolsets on demand without exceeding OpenAI’s tool limit.

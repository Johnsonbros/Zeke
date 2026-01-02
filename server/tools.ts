import type OpenAI from "openai";

import {
  automationToolDefinitions,
  automationToolNames,
  automationToolPermissions,
  calendarToolDefinitions,
  calendarToolNames,
  calendarToolPermissions,
  codebaseToolDefinitions,
  codebaseToolNames,
  codebaseToolPermissions,
  communicationToolDefinitions,
  communicationToolNames,
  communicationToolPermissions,
  documentToolDefinitions,
  documentToolNames,
  documentToolPermissions,
  dynamicToolDefinitions,
  dynamicToolNames,
  dynamicToolPermissions,
  executeAutomationTool,
  executeCalendarTool,
  executeCodebaseTool,
  executeCommunicationTool,
  executeDocumentTool,
  executeDynamicTool,
  executeFileTool,
  executeFoodTool,
  executeGroceryTool,
  executeKnowledgeGraphTool,
  executeListTool,
  executeLocationTool,
  executeMemoryTool,
  executePeopleTool,
  executeReminderTool,
  executeSearchTool,
  executeTaskTool,
  executeUtilityTool,
  fileToolDefinitions,
  fileToolNames,
  fileToolPermissions,
  foodToolDefinitions,
  foodToolNames,
  foodToolPermissions,
  getActiveReminders as getActiveRemindersFromModule,
  groceryToolDefinitions,
  groceryToolNames,
  groceryToolPermissions,
  knowledgeGraphToolDefinitions,
  knowledgeGraphToolNames,
  knowledgeGraphToolPermissions,
  listToolDefinitions,
  listToolNames,
  listToolPermissions,
  locationToolDefinitions,
  locationToolNames,
  locationToolPermissions,
  memoryToolDefinitions,
  memoryToolNames,
  memoryToolPermissions,
  peopleToolDefinitions,
  peopleToolNames,
  peopleToolPermissions,
  predictionToolDefinitions,
  predictionToolNames,
  predictionToolPermissions,
  predictionTools,
  reminderToolDefinitions,
  reminderToolNames,
  reminderToolPermissions,
  restorePendingReminders as restorePendingRemindersFromModule,
  searchToolDefinitions,
  searchToolNames,
  searchToolPermissions,
  setReminderNotifyUserCallback,
  setReminderSendSmsCallback,
  taskToolDefinitions,
  taskToolNames,
  taskToolPermissions,
  utilityToolDefinitions,
  utilityToolNames,
  utilityToolPermissions,
  weatherToolDefinitions,
  weatherToolNames,
  weatherToolPermissions,
  weatherTools,
} from "./capabilities";

export interface ToolPermissions {
  isAdmin: boolean;
  canAccessPersonalInfo: boolean;
  canAccessCalendar: boolean;
  canAccessTasks: boolean;
  canAccessGrocery: boolean;
  canSetReminders: boolean;
  canQueryMemory: boolean;
  canSendMessages: boolean;
}

type ToolExecutorContext = {
  conversationId?: string;
  sendSmsCallback?: (phone: string, message: string, source?: string) => Promise<void> | null;
  notifyUserCallback?: (conversationId: string, message: string) => Promise<void> | null;
  permissions: ToolPermissions;
};

type CapabilityConfig = {
  definitions: OpenAI.Chat.ChatCompletionTool[];
  permissions?: Record<string, (permissions: ToolPermissions) => boolean>;
  names: string[];
  executor?: (
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutorContext
  ) => Promise<string | null>;
};

const capabilityRegistry: Record<string, CapabilityConfig> = {
  communication: {
    definitions: communicationToolDefinitions,
    permissions: communicationToolPermissions,
    names: communicationToolNames,
    executor: (toolName, args, context) =>
      executeCommunicationTool(toolName, args, {
        conversationId: context.conversationId,
        sendSmsCallback: context.sendSmsCallback ?? undefined,
        notifyUserCallback: context.notifyUserCallback ?? undefined,
      }),
  },
  reminder: {
    definitions: reminderToolDefinitions,
    permissions: reminderToolPermissions,
    names: reminderToolNames,
    executor: (toolName, args, context) =>
      executeReminderTool(toolName, args, {
        conversationId: context.conversationId,
        sendSmsCallback: context.sendSmsCallback ?? undefined,
        notifyUserCallback: context.notifyUserCallback ?? undefined,
      }),
  },
  task: {
    definitions: taskToolDefinitions,
    permissions: taskToolPermissions,
    names: taskToolNames,
    executor: (toolName, args) => executeTaskTool(toolName, args),
  },
  calendar: {
    definitions: calendarToolDefinitions,
    permissions: calendarToolPermissions,
    names: calendarToolNames,
    executor: (toolName, args) => executeCalendarTool(toolName, args),
  },
  grocery: {
    definitions: groceryToolDefinitions,
    permissions: groceryToolPermissions,
    names: groceryToolNames,
    executor: (toolName, args, context) =>
      executeGroceryTool(toolName, args, {
        conversationId: context.conversationId,
        sendSmsCallback: context.sendSmsCallback ?? undefined,
        notifyUserCallback: context.notifyUserCallback ?? undefined,
      }),
  },
  search: {
    definitions: searchToolDefinitions,
    permissions: searchToolPermissions,
    names: searchToolNames,
    executor: (toolName, args, context) =>
      executeSearchTool(toolName, args, {
        conversationId: context.conversationId,
        sendSmsCallback: context.sendSmsCallback ?? undefined,
        notifyUserCallback: context.notifyUserCallback ?? undefined,
      }),
  },
  file: {
    definitions: fileToolDefinitions,
    permissions: fileToolPermissions,
    names: fileToolNames,
    executor: (toolName, args) => executeFileTool(toolName, args),
  },
  memory: {
    definitions: memoryToolDefinitions,
    permissions: memoryToolPermissions,
    names: memoryToolNames,
    executor: (toolName, args) => executeMemoryTool(toolName, args),
  },
  utility: {
    definitions: utilityToolDefinitions,
    permissions: utilityToolPermissions,
    names: utilityToolNames,
    executor: (toolName, args, context) =>
      executeUtilityTool(toolName, args, {
        conversationId: context.conversationId,
        sendSmsCallback: context.sendSmsCallback ?? undefined,
        notifyUserCallback: context.notifyUserCallback ?? undefined,
      }),
  },
  location: {
    definitions: locationToolDefinitions,
    permissions: locationToolPermissions,
    names: locationToolNames,
    executor: (toolName, args) => executeLocationTool(toolName, args),
  },
  people: {
    definitions: peopleToolDefinitions,
    permissions: peopleToolPermissions,
    names: peopleToolNames,
    executor: (toolName, args) => executePeopleTool(toolName, args),
  },
  list: {
    definitions: listToolDefinitions,
    permissions: listToolPermissions,
    names: listToolNames,
    executor: (toolName, args, context) => executeListTool(toolName, args, context.permissions),
  },
  food: {
    definitions: foodToolDefinitions,
    permissions: foodToolPermissions,
    names: foodToolNames,
    executor: (toolName, args) => executeFoodTool(toolName, args),
  },
  automation: {
    definitions: automationToolDefinitions,
    permissions: automationToolPermissions,
    names: automationToolNames,
    executor: (toolName, args, context) =>
      executeAutomationTool(toolName, args, {
        conversationId: context.conversationId,
        sendSmsCallback: context.sendSmsCallback ?? undefined,
        notifyUserCallback: context.notifyUserCallback ?? undefined,
      }),
  },
  weather: {
    definitions: weatherToolDefinitions,
    permissions: weatherToolPermissions,
    names: weatherToolNames,
    executor: async (toolName, args) => {
      const tool = weatherTools.find(t => t.name === toolName);
      if (tool) {
        return await tool.execute(args as any);
      }
      return null;
    },
  },
  knowledgeGraph: {
    definitions: knowledgeGraphToolDefinitions,
    permissions: knowledgeGraphToolPermissions,
    names: knowledgeGraphToolNames,
    executor: async (toolName, args) => {
      const kgResult = await executeKnowledgeGraphTool(toolName, args);
      return JSON.stringify(kgResult);
    },
  },
  codebase: {
    definitions: codebaseToolDefinitions,
    permissions: codebaseToolPermissions,
    names: codebaseToolNames,
    executor: (toolName, args) => executeCodebaseTool(toolName, args),
  },
  document: {
    definitions: documentToolDefinitions,
    permissions: documentToolPermissions,
    names: documentToolNames,
    executor: (toolName, args) => executeDocumentTool(toolName, args),
  },
  dynamic: {
    definitions: dynamicToolDefinitions,
    permissions: dynamicToolPermissions,
    names: Array.from(dynamicToolNames),
    executor: (toolName, args) => executeDynamicTool(toolName, args),
  },
  predictions: {
    definitions: predictionToolDefinitions,
    permissions: predictionToolPermissions,
    names: predictionToolNames,
    executor: async (toolName, args) => {
      const executor = (predictionTools as Record<string, (params: any) => any>)[toolName];
      if (!executor) {
        return null;
      }
      const result = await executor(args as any);
      return typeof result === "string" ? result : JSON.stringify(result);
    },
  },
};

let toolRegistryVersion = 1;

const activeCategories = new Set<string>([
  "communication",
  "reminder",
  "task",
  "calendar",
  "grocery",
  "search",
  "file",
  "memory",
  "utility",
  "location",
  "people",
  "list",
  "food",
  "automation",
  "weather",
  "codebase",
  "document",
  "dynamic",
]);

function computeDefinitions() {
  const defs: OpenAI.Chat.ChatCompletionTool[] = [];
  const perms: Record<string, (permissions: ToolPermissions) => boolean> = {};
  const names: string[] = [];

  for (const category of activeCategories) {
    const config = capabilityRegistry[category];
    if (!config) continue;

    defs.push(...config.definitions);
    names.push(...config.names);
    Object.assign(perms, config.permissions || {});
  }

  return { defs, perms, names };
}

export function loadToolCategory(category: string): void {
  const normalizedCategory = category.trim();
  const config = capabilityRegistry[normalizedCategory];
  if (!config) {
    throw new Error(`Unknown tool category: ${category}`);
  }
  if (!activeCategories.has(normalizedCategory)) {
    activeCategories.add(normalizedCategory);
    toolRegistryVersion += 1;
  }
}

export function getActiveToolDefinitions(): OpenAI.Chat.ChatCompletionTool[] {
  return computeDefinitions().defs;
}

export function getActiveToolPermissions(): Record<string, (p: ToolPermissions) => boolean> {
  return computeDefinitions().perms;
}

export function getActiveToolNames(): string[] {
  return computeDefinitions().names;
}

export function getToolRegistryVersion(): number {
  return toolRegistryVersion;
}

type ToolRegistryOptions = {
  permissions: ToolPermissions;
};

export function getToolRegistrySnapshot(options: ToolRegistryOptions) {
  const { permissions } = options;
  const activeTools = getActiveToolDefinitions();
  const activePermissions = getActiveToolPermissions();

  const toolCapabilities = new Map<string, string[]>();
  for (const category of activeCategories) {
    const config = capabilityRegistry[category];
    if (!config) continue;

    for (const name of config.names) {
      const existing = toolCapabilities.get(name) ?? [];
      toolCapabilities.set(name, [...existing, category]);
    }
  }

  const tools = activeTools
    .map((tool) => {
      if (tool.type !== "function" || !("function" in tool)) {
        return null;
      }

      const func = (tool as {
        type: "function";
        function: { name: string; description?: string; parameters?: unknown };
      }).function;
      const toolName = func.name;
      const permissionCheck = activePermissions[toolName];

      const permissionMatrix: Record<string, boolean> = {};
      if (permissionCheck) {
        const testPermissions: ToolPermissions = {
          isAdmin: false,
          canAccessPersonalInfo: false,
          canAccessCalendar: false,
          canAccessTasks: false,
          canAccessGrocery: false,
          canSetReminders: false,
          canQueryMemory: false,
          canSendMessages: false,
        };

        for (const key of Object.keys(testPermissions) as Array<keyof ToolPermissions>) {
          const withPermission = { ...testPermissions, [key]: true };
          permissionMatrix[key] = permissionCheck(withPermission);
        }
      }

      const allowed = permissionCheck ? permissionCheck(permissions) : true;

      return {
        name: toolName,
        description: func.description || "",
        parameters: func.parameters || {},
        categories: toolCapabilities.get(toolName) ?? [],
        allowed,
        permission_matrix: permissionMatrix,
      };
    })
    .filter((tool): tool is {
      name: string;
      description: string;
      parameters: unknown;
      categories: string[];
      allowed: boolean;
      permission_matrix: Record<string, boolean>;
    } => Boolean(tool && tool.allowed));

  return {
    version: getToolRegistryVersion(),
    tools,
  };
}

export const toolDefinitions: OpenAI.Chat.ChatCompletionTool[] = getActiveToolDefinitions();

export const TOOL_PERMISSIONS: Record<string, (permissions: ToolPermissions) => boolean> =
  getActiveToolPermissions();

let sendSmsCallback: ((phone: string, message: string, source?: string) => Promise<void>) | null = null;
let notifyUserCallback: ((conversationId: string, message: string) => Promise<void>) | null = null;

export function setSendSmsCallback(callback: (phone: string, message: string, source?: string) => Promise<void>) {
  sendSmsCallback = callback;
  setReminderSendSmsCallback(callback);
}

export function setNotifyUserCallback(callback: (conversationId: string, message: string) => Promise<void>) {
  notifyUserCallback = callback;
  setReminderNotifyUserCallback(callback);
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  conversationId?: string,
  permissions?: ToolPermissions
): Promise<string> {
  console.log(`Executing tool: ${toolName}`, args);

  const activeToolNames = new Set(getActiveToolNames());
  if (!activeToolNames.has(toolName)) {
    return JSON.stringify({ error: `Unknown or inactive tool: ${toolName}` });
  }

  const effectivePermissions: ToolPermissions = permissions || {
    isAdmin: true,
    canAccessPersonalInfo: true,
    canAccessCalendar: true,
    canAccessTasks: true,
    canAccessGrocery: true,
    canSetReminders: true,
    canQueryMemory: true,
    canSendMessages: true,
  };

  const permissionCheck = getActiveToolPermissions()[toolName];
  if (permissionCheck && !permissionCheck(effectivePermissions)) {
    console.log(`Access denied for tool ${toolName} - insufficient permissions`);
    return JSON.stringify({
      success: false,
      error: `Access denied. You do not have permission to use this feature.`,
      denied_tool: toolName,
    });
  }

  const context: ToolExecutorContext = {
    conversationId,
    sendSmsCallback,
    notifyUserCallback,
    permissions: effectivePermissions,
  };

  let result: string | null = null;

  for (const category of activeCategories) {
    const config = capabilityRegistry[category];
    if (!config || !config.names.includes(toolName)) {
      continue;
    }

    if (config.executor) {
      result = await config.executor(toolName, args, context);
      break;
    }
  }

  if (result !== null) {
    return result;
  }

  return JSON.stringify({ error: `Unknown tool: ${toolName}` });
}

export async function getActiveReminders(): Promise<{ id: string; message: string; scheduledFor: Date }[]> {
  return await getActiveRemindersFromModule();
}

export async function restorePendingReminders(): Promise<number> {
  return await restorePendingRemindersFromModule();
}

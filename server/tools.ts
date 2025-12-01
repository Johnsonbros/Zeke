import type OpenAI from "openai";

import {
  allToolDefinitions,
  allToolPermissions,
  executeCommunicationTool,
  executeReminderTool,
  executeTaskTool,
  executeCalendarTool,
  executeGroceryTool,
  executeSearchTool,
  executeFileTool,
  executeMemoryTool,
  executeUtilityTool,
  executeLocationTool,
  executePeopleTool,
  executeListTool,
  executeFoodTool,
  executeAutomationTool,
  communicationToolNames,
  reminderToolNames,
  taskToolNames,
  calendarToolNames,
  groceryToolNames,
  searchToolNames,
  fileToolNames,
  memoryToolNames,
  utilityToolNames,
  locationToolNames,
  peopleToolNames,
  listToolNames,
  foodToolNames,
  automationToolNames,
  getActiveReminders as getActiveRemindersFromModule,
  restorePendingReminders as restorePendingRemindersFromModule,
  setReminderSendSmsCallback,
  setReminderNotifyUserCallback,
} from "./capabilities";

export interface ToolPermissions {
  isAdmin: boolean;
  canAccessPersonalInfo: boolean;
  canAccessCalendar: boolean;
  canAccessTasks: boolean;
  canAccessGrocery: boolean;
  canSetReminders: boolean;
}

export const toolDefinitions: OpenAI.Chat.ChatCompletionTool[] = allToolDefinitions;

export const TOOL_PERMISSIONS: Record<string, (permissions: ToolPermissions) => boolean> = allToolPermissions;

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
  
  const effectivePermissions: ToolPermissions = permissions || {
    isAdmin: true,
    canAccessPersonalInfo: true,
    canAccessCalendar: true,
    canAccessTasks: true,
    canAccessGrocery: true,
    canSetReminders: true,
  };
  
  const permissionCheck = TOOL_PERMISSIONS[toolName];
  if (permissionCheck && !permissionCheck(effectivePermissions)) {
    console.log(`Access denied for tool ${toolName} - insufficient permissions`);
    return JSON.stringify({
      success: false,
      error: `Access denied. You do not have permission to use this feature.`,
      denied_tool: toolName,
    });
  }
  
  const options = {
    conversationId,
    sendSmsCallback,
    notifyUserCallback,
  };

  let result: string | null = null;

  if (communicationToolNames.includes(toolName)) {
    result = await executeCommunicationTool(toolName, args, options);
  } else if (reminderToolNames.includes(toolName)) {
    result = await executeReminderTool(toolName, args, options);
  } else if (taskToolNames.includes(toolName)) {
    result = await executeTaskTool(toolName, args);
  } else if (calendarToolNames.includes(toolName)) {
    result = await executeCalendarTool(toolName, args);
  } else if (groceryToolNames.includes(toolName)) {
    result = await executeGroceryTool(toolName, args);
  } else if (searchToolNames.includes(toolName)) {
    result = await executeSearchTool(toolName, args, options);
  } else if (fileToolNames.includes(toolName)) {
    result = await executeFileTool(toolName, args);
  } else if (memoryToolNames.includes(toolName)) {
    result = await executeMemoryTool(toolName, args);
  } else if (utilityToolNames.includes(toolName)) {
    result = await executeUtilityTool(toolName, args, options);
  } else if (locationToolNames.includes(toolName)) {
    result = await executeLocationTool(toolName, args);
  } else if (peopleToolNames.includes(toolName)) {
    result = await executePeopleTool(toolName, args);
  } else if (listToolNames.includes(toolName)) {
    result = await executeListTool(toolName, args, effectivePermissions);
  } else if (foodToolNames.includes(toolName)) {
    result = await executeFoodTool(toolName, args);
  } else if (automationToolNames.includes(toolName)) {
    result = await executeAutomationTool(toolName, args, options);
  }

  if (result !== null) {
    return result;
  }

  return JSON.stringify({ error: `Unknown tool: ${toolName}` });
}

export function getActiveReminders(): { id: string; message: string; scheduledFor: Date }[] {
  return getActiveRemindersFromModule();
}

export function restorePendingReminders(): number {
  return restorePendingRemindersFromModule();
}

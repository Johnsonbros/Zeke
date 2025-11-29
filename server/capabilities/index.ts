export {
  communicationToolDefinitions,
  communicationToolPermissions,
  executeCommunicationTool,
  communicationToolNames,
} from "./communication";

export {
  reminderToolDefinitions,
  reminderToolPermissions,
  executeReminderTool,
  reminderToolNames,
  getActiveReminders,
  restorePendingReminders,
  setReminderSendSmsCallback,
  setReminderNotifyUserCallback,
} from "./reminders";

export {
  taskToolDefinitions,
  taskToolPermissions,
  executeTaskTool,
  taskToolNames,
} from "./tasks";

export {
  calendarToolDefinitions,
  calendarToolPermissions,
  executeCalendarTool,
  calendarToolNames,
} from "./calendar";

export {
  groceryToolDefinitions,
  groceryToolPermissions,
  executeGroceryTool,
  groceryToolNames,
} from "./grocery";

export {
  searchToolDefinitions,
  searchToolPermissions,
  executeSearchTool,
  searchToolNames,
} from "./search";

export {
  fileToolDefinitions,
  fileToolPermissions,
  executeFileTool,
  fileToolNames,
} from "./files";

export {
  memoryToolDefinitions,
  memoryToolPermissions,
  executeMemoryTool,
  memoryToolNames,
} from "./memory";

export {
  utilityToolDefinitions,
  utilityToolPermissions,
  executeUtilityTool,
  utilityToolNames,
} from "./utilities";

import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";

import { communicationToolDefinitions, communicationToolPermissions } from "./communication";
import { reminderToolDefinitions, reminderToolPermissions } from "./reminders";
import { taskToolDefinitions, taskToolPermissions } from "./tasks";
import { calendarToolDefinitions, calendarToolPermissions } from "./calendar";
import { groceryToolDefinitions, groceryToolPermissions } from "./grocery";
import { searchToolDefinitions, searchToolPermissions } from "./search";
import { fileToolDefinitions, fileToolPermissions } from "./files";
import { memoryToolDefinitions, memoryToolPermissions } from "./memory";
import { utilityToolDefinitions, utilityToolPermissions } from "./utilities";

export const allToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  ...reminderToolDefinitions,
  ...searchToolDefinitions,
  ...fileToolDefinitions,
  ...utilityToolDefinitions,
  ...groceryToolDefinitions,
  ...communicationToolDefinitions,
  ...taskToolDefinitions,
  ...calendarToolDefinitions,
  ...memoryToolDefinitions,
];

export const allToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  ...reminderToolPermissions,
  ...searchToolPermissions,
  ...fileToolPermissions,
  ...utilityToolPermissions,
  ...groceryToolPermissions,
  ...communicationToolPermissions,
  ...taskToolPermissions,
  ...calendarToolPermissions,
  ...memoryToolPermissions,
};

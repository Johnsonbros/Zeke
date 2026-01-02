export {
  communicationToolDefinitions,
  communicationToolPermissions,
  executeCommunicationTool,
  communicationToolNames,
} from "./communication";

export {
  dynamicToolDefinitions,
  dynamicToolPermissions,
  executeDynamicTool,
  dynamicToolNames,
} from "./dynamic";

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

export {
  locationToolDefinitions,
  locationToolPermissions,
  executeLocationTool,
  locationToolNames,
} from "./location";

export {
  peopleToolDefinitions,
  peopleToolPermissions,
  executePeopleTool,
  peopleToolNames,
} from "./people";

export {
  listToolDefinitions,
  listToolPermissions,
  executeListTool,
  listToolNames,
} from "./lists";

export {
  foodToolDefinitions,
  foodToolPermissions,
  executeFoodTool,
  foodToolNames,
} from "./food";

export {
  automationToolDefinitions,
  automationToolPermissions,
  executeAutomationTool,
  automationToolNames,
} from "./automations";

export {
  predictionTools,
  predictionToolNames,
} from "./predictions";

export {
  weatherTools,
  generateAIWeatherBriefing,
  checkAndSendSevereWeatherAlerts,
  startWeatherMonitoring,
  stopWeatherMonitoring,
  getWeatherMonitoringStatus,
  setWeatherAlertCallback,
} from "./weather";

export {
  knowledgeGraphToolDefinitions,
  knowledgeGraphToolPermissions,
  executeKnowledgeGraphTool,
  knowledgeGraphToolNames,
} from "./knowledgeGraph";

export {
  codebaseToolDefinitions,
  codebaseToolPermissions,
  executeCodebaseTool,
  codebaseToolNames,
} from "./codebase";

export {
  documentToolDefinitions,
  documentToolPermissions,
  executeDocumentTool,
  documentToolNames,
} from "./documents";

import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";

import { communicationToolDefinitions, communicationToolPermissions } from "./communication";
import { dynamicToolDefinitions, dynamicToolPermissions } from "./dynamic";
import { reminderToolDefinitions, reminderToolPermissions } from "./reminders";
import { taskToolDefinitions, taskToolPermissions } from "./tasks";
import { calendarToolDefinitions, calendarToolPermissions } from "./calendar";
import { groceryToolDefinitions, groceryToolPermissions } from "./grocery";
import { searchToolDefinitions, searchToolPermissions } from "./search";
import { fileToolDefinitions, fileToolPermissions } from "./files";
import { memoryToolDefinitions, memoryToolPermissions } from "./memory";
import { utilityToolDefinitions, utilityToolPermissions } from "./utilities";
import { locationToolDefinitions, locationToolPermissions } from "./location";
import { peopleToolDefinitions, peopleToolPermissions } from "./people";
import { listToolDefinitions, listToolPermissions } from "./lists";
import { foodToolDefinitions, foodToolPermissions } from "./food";
import { automationToolDefinitions, automationToolPermissions } from "./automations";
import { weatherTools } from "./weather";
import {
  predictionToolDefinitions as predictionCapabilityDefinitions,
  predictionToolNames,
} from "./predictions";
import { knowledgeGraphToolDefinitions, knowledgeGraphToolPermissions } from "./knowledgeGraph";
import { codebaseToolDefinitions, codebaseToolPermissions } from "./codebase";
import { documentToolDefinitions, documentToolPermissions } from "./documents";

const weatherToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = weatherTools.map(tool => ({
  type: "function" as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  },
}));

const weatherToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  get_weather_briefing: (p) => p.isAdmin || p.canSetReminders,
  check_severe_weather: (p) => p.isAdmin,
  configure_weather_monitoring: (p) => p.isAdmin,
};

export const weatherToolNames = weatherTools.map(t => t.name);

const predictionToolDefinitionsFormatted: OpenAI.Chat.ChatCompletionTool[] = predictionCapabilityDefinitions.map(tool => ({
  type: "function" as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  },
}));

const predictionToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  build_fused_context: (p) => p.isAdmin,
  get_active_patterns: (p) => p.isAdmin,
  detect_anomalies: (p) => p.isAdmin,
  create_prediction: (p) => p.isAdmin,
  get_pending_predictions: (p) => p.isAdmin || p.canSetReminders,
  execute_prediction: (p) => p.isAdmin,
  record_prediction_feedback: (p) => p.isAdmin || p.canSetReminders,
  get_prediction_accuracy_stats: (p) => p.isAdmin,
  discover_new_patterns: (p) => p.isAdmin,
};

export {
  weatherToolDefinitions,
  weatherToolPermissions,
  predictionToolDefinitionsFormatted as predictionToolDefinitions,
  predictionToolPermissions,
  predictionToolNames,
  knowledgeGraphToolDefinitions,
  knowledgeGraphToolPermissions,
  dynamicToolDefinitions,
  dynamicToolPermissions,
};

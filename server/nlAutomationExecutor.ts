import * as cron from "node-cron";
import {
  getEnabledNLAutomations,
  getNLAutomationsByTriggerType,
  recordNLAutomationTrigger,
  createNLAutomationLog,
  createTask,
  createGroceryItem,
  getNLAutomation,
  getLatestLocation,
  getSavedPlace,
  getAllSavedPlaces,
  getOverdueTasks,
  getTasksDueToday,
  calculateDistance
} from "./db";
import { queueNotification } from "./notificationBatcher";
import type {
  NLAutomation,
  TimeTriggerConfig,
  EventTriggerConfig,
  LocationTriggerConfig,
  ConditionTriggerConfig,
  KeywordTriggerConfig,
  NLEventType
} from "@shared/schema";
import { MASTER_ADMIN_PHONE } from "@shared/schema";

const scheduledTasks: Map<string, cron.ScheduledTask> = new Map();

let sendSmsCallback: ((phone: string, message: string) => Promise<void>) | null = null;
let setReminderCallback: ((message: string, delayMs: number, phone?: string) => Promise<void>) | null = null;

export function setNLAutomationSmsCallback(
  callback: (phone: string, message: string) => Promise<void>
): void {
  sendSmsCallback = callback;
}

export function setNLAutomationReminderCallback(
  callback: (message: string, delayMs: number, phone?: string) => Promise<void>
): void {
  setReminderCallback = callback;
}

export interface ExecutionContext {
  triggerData?: any;
  eventType?: NLEventType;
  eventData?: any;
}

export interface ExecutionResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

export async function executeNLAutomation(
  automation: NLAutomation,
  context: ExecutionContext = {}
): Promise<ExecutionResult> {
  console.log(`[NLAutomationExecutor] Executing automation: ${automation.name} (${automation.id})`);
  
  try {
    const actionConfig = JSON.parse(automation.actionConfig);
    let result: ExecutionResult;

    switch (automation.actionType) {
      case "send_sms":
        result = await executeSendSms(actionConfig, context);
        break;
      case "create_task":
        result = await executeCreateTask(actionConfig, context);
        break;
      case "add_grocery":
        result = await executeAddGrocery(actionConfig, context);
        break;
      case "set_reminder":
        result = await executeSetReminder(actionConfig, context);
        break;
      case "notify":
        result = await executeNotify(actionConfig, context);
        break;
      case "generate_summary":
        result = await executeGenerateSummary(actionConfig, context);
        break;
      default:
        result = {
          success: false,
          message: `Unknown action type: ${automation.actionType}`,
          error: "UNKNOWN_ACTION"
        };
    }

    recordNLAutomationTrigger(automation.id);
    
    createNLAutomationLog({
      automationId: automation.id,
      triggerData: JSON.stringify(context),
      actionResult: JSON.stringify(result),
      success: result.success,
      errorMessage: result.error
    });

    console.log(`[NLAutomationExecutor] Automation ${automation.name} completed:`, result);
    return result;

  } catch (error: any) {
    console.error(`[NLAutomationExecutor] Error executing automation ${automation.id}:`, error);
    
    const result: ExecutionResult = {
      success: false,
      message: `Execution failed: ${error.message}`,
      error: error.message
    };

    createNLAutomationLog({
      automationId: automation.id,
      triggerData: JSON.stringify(context),
      success: false,
      errorMessage: error.message
    });

    return result;
  }
}

function interpolateTemplate(template: string, context: ExecutionContext): string {
  let result = template;
  
  if (context.eventData) {
    for (const [key, value] of Object.entries(context.eventData)) {
      result = result.replace(new RegExp(`{{${key}}}`, "g"), String(value));
    }
  }
  
  result = result.replace(/{{date}}/g, new Date().toLocaleDateString());
  result = result.replace(/{{time}}/g, new Date().toLocaleTimeString());
  result = result.replace(/{{day}}/g, new Date().toLocaleDateString("en-US", { weekday: "long" }));
  
  return result;
}

async function executeSendSms(config: any, context: ExecutionContext): Promise<ExecutionResult> {
  if (!sendSmsCallback) {
    return {
      success: false,
      message: "SMS callback not configured",
      error: "SMS_NOT_CONFIGURED"
    };
  }

  const phone = config.recipientPhone || MASTER_ADMIN_PHONE;
  const message = interpolateTemplate(config.messageTemplate, context);

  await sendSmsCallback(phone, message);

  return {
    success: true,
    message: `SMS sent to ${phone}`,
    data: { phone, message }
  };
}

async function executeCreateTask(config: any, context: ExecutionContext): Promise<ExecutionResult> {
  const title = interpolateTemplate(config.titleTemplate, context);
  const description = config.descriptionTemplate 
    ? interpolateTemplate(config.descriptionTemplate, context) 
    : "";

  let dueDate: string | undefined;
  if (config.dueDateOffset) {
    const now = new Date();
    const match = config.dueDateOffset.match(/\+(\d+)([dwmh])/);
    if (match) {
      const amount = parseInt(match[1]);
      const unit = match[2];
      switch (unit) {
        case "h":
          now.setHours(now.getHours() + amount);
          break;
        case "d":
          now.setDate(now.getDate() + amount);
          break;
        case "w":
          now.setDate(now.getDate() + amount * 7);
          break;
        case "m":
          now.setMonth(now.getMonth() + amount);
          break;
      }
      dueDate = now.toISOString().split("T")[0];
    }
  }

  const task = createTask({
    title,
    description,
    priority: config.priority || "medium",
    category: config.category || "personal",
    dueDate,
    completed: false
  });

  return {
    success: true,
    message: `Task created: "${title}"`,
    data: { taskId: task.id, title }
  };
}

async function executeAddGrocery(config: any, context: ExecutionContext): Promise<ExecutionResult> {
  const name = interpolateTemplate(config.itemTemplate, context);
  
  const item = createGroceryItem({
    name,
    quantity: config.quantity || "1",
    category: config.category || "Other",
    addedBy: "ZEKE Automation",
    purchased: false
  });

  return {
    success: true,
    message: `Added to grocery list: ${config.quantity || "1"} ${name}`,
    data: { itemId: item.id, name }
  };
}

async function executeSetReminder(config: any, context: ExecutionContext): Promise<ExecutionResult> {
  if (!setReminderCallback) {
    return {
      success: false,
      message: "Reminder callback not configured",
      error: "REMINDER_NOT_CONFIGURED"
    };
  }

  const message = interpolateTemplate(config.messageTemplate, context);
  
  let delayMs = 0;
  if (config.timeOffset) {
    const match = config.timeOffset.match(/\+(\d+)([mhd])/);
    if (match) {
      const amount = parseInt(match[1]);
      const unit = match[2];
      switch (unit) {
        case "m":
          delayMs = amount * 60 * 1000;
          break;
        case "h":
          delayMs = amount * 60 * 60 * 1000;
          break;
        case "d":
          delayMs = amount * 24 * 60 * 60 * 1000;
          break;
      }
    }
  }

  await setReminderCallback(message, delayMs);

  return {
    success: true,
    message: `Reminder set: "${message}"`,
    data: { message, delayMs }
  };
}

async function executeNotify(config: any, context: ExecutionContext): Promise<ExecutionResult> {
  const title = interpolateTemplate(config.titleTemplate, context);
  const content = interpolateTemplate(config.contentTemplate, context);

  queueNotification({
    recipientPhone: MASTER_ADMIN_PHONE,
    category: config.category || "system",
    priority: config.priority || "normal",
    title,
    content,
    sourceType: "automation"
  });

  return {
    success: true,
    message: `Notification queued: "${title}"`,
    data: { title, content }
  };
}

async function executeGenerateSummary(config: any, context: ExecutionContext): Promise<ExecutionResult> {
  if (!sendSmsCallback) {
    return {
      success: false,
      message: "SMS callback not configured for summary",
      error: "SMS_NOT_CONFIGURED"
    };
  }

  try {
    const { executeTool } = await import("./tools");
    
    let summary: string;
    switch (config.summaryType) {
      case "tasks":
        const taskResult = await executeTool("get_tasks", { includeCompleted: false });
        const tasks = JSON.parse(taskResult);
        if (tasks.success && tasks.tasks) {
          const taskList = tasks.tasks.slice(0, 5).map((t: any) => `- ${t.title}`).join("\n");
          summary = tasks.tasks.length > 0 
            ? `You have ${tasks.tasks.length} active task(s):\n${taskList}`
            : "You have no active tasks. Great job!";
        } else {
          summary = "Unable to retrieve task summary.";
        }
        break;
        
      case "calendar":
        const calResult = await executeTool("get_calendar_events", { days: 1 });
        const events = JSON.parse(calResult);
        if (events.success && events.events) {
          const eventList = events.events.slice(0, 5).map((e: any) => `- ${e.summary}`).join("\n");
          summary = events.events.length > 0
            ? `Today's events:\n${eventList}`
            : "No events scheduled for today.";
        } else {
          summary = "Unable to retrieve calendar summary.";
        }
        break;
        
      case "daily_briefing":
        const briefingResult = await executeTool("get_morning_briefing", {});
        const briefing = JSON.parse(briefingResult);
        summary = briefing.success && briefing.briefing 
          ? briefing.briefing 
          : "Unable to generate daily briefing.";
        break;
        
      default:
        summary = `Unknown summary type: ${config.summaryType}`;
    }

    await sendSmsCallback(MASTER_ADMIN_PHONE, summary);

    return {
      success: true,
      message: `${config.summaryType} summary sent`,
      data: { summaryType: config.summaryType }
    };

  } catch (error: any) {
    return {
      success: false,
      message: `Failed to generate summary: ${error.message}`,
      error: error.message
    };
  }
}

export function scheduleTimeAutomation(automation: NLAutomation): void {
  stopAutomation(automation.id);
  
  if (!automation.enabled) {
    console.log(`[NLAutomationExecutor] Automation ${automation.name} is disabled, not scheduling`);
    return;
  }

  if (automation.triggerType !== "time") {
    console.log(`[NLAutomationExecutor] Automation ${automation.name} is not time-based`);
    return;
  }

  try {
    const config: TimeTriggerConfig = JSON.parse(automation.triggerConfig);
    
    if (!cron.validate(config.cronExpression)) {
      console.error(`[NLAutomationExecutor] Invalid cron expression for ${automation.name}: ${config.cronExpression}`);
      return;
    }

    const task = cron.schedule(
      config.cronExpression,
      async () => {
        const current = getNLAutomation(automation.id);
        if (!current || !current.enabled) {
          stopAutomation(automation.id);
          return;
        }
        
        await executeNLAutomation(current, {
          triggerData: { type: "scheduled", cronExpression: config.cronExpression }
        });
      },
      {
        timezone: config.timezone || "America/New_York"
      }
    );

    scheduledTasks.set(automation.id, task);
    console.log(`[NLAutomationExecutor] Scheduled: ${automation.name} - Cron: ${config.cronExpression}`);

  } catch (error: any) {
    console.error(`[NLAutomationExecutor] Error scheduling ${automation.name}:`, error);
  }
}

export function stopAutomation(automationId: string): void {
  const existingTask = scheduledTasks.get(automationId);
  if (existingTask) {
    existingTask.stop();
    scheduledTasks.delete(automationId);
    console.log(`[NLAutomationExecutor] Stopped automation: ${automationId}`);
  }
}

export async function triggerEventAutomations(
  eventType: NLEventType,
  eventData: any = {}
): Promise<void> {
  const automations = getNLAutomationsByTriggerType("event");
  
  for (const automation of automations) {
    try {
      const config: EventTriggerConfig = JSON.parse(automation.triggerConfig);
      
      if (config.eventType === eventType) {
        if (config.filters && !matchesFilters(eventData, config.filters)) {
          continue;
        }

        console.log(`[NLAutomationExecutor] Event ${eventType} triggered automation: ${automation.name}`);
        await executeNLAutomation(automation, {
          eventType,
          eventData,
          triggerData: { eventType, timestamp: new Date().toISOString() }
        });
      }
    } catch (error) {
      console.error(`[NLAutomationExecutor] Error processing event automation ${automation.id}:`, error);
    }
  }
}

function matchesFilters(data: any, filters: Record<string, any>): boolean {
  for (const [key, value] of Object.entries(filters)) {
    if (data[key] !== value) {
      return false;
    }
  }
  return true;
}

// ============================================
// LOCATION-BASED TRIGGER EVALUATION
// ============================================

let lastKnownLocationCheck: { latitude: number; longitude: number } | null = null;

export async function evaluateLocationTriggers(): Promise<void> {
  const locationAutomations = getNLAutomationsByTriggerType("location");
  if (locationAutomations.length === 0) return;

  const currentLocation = getLatestLocation();
  if (!currentLocation) {
    console.log("[NLAutomationExecutor] No location data available for trigger evaluation");
    return;
  }

  const lat = parseFloat(currentLocation.latitude);
  const lng = parseFloat(currentLocation.longitude);

  // Check if location has changed significantly (> 50 meters) since last check
  if (lastKnownLocationCheck) {
    const distance = calculateDistance(
      lastKnownLocationCheck.latitude,
      lastKnownLocationCheck.longitude,
      lat,
      lng
    );

    if (distance < 50) {
      // Location hasn't changed significantly, skip evaluation
      return;
    }
  }

  lastKnownLocationCheck = { latitude: lat, longitude: lng };

  for (const automation of locationAutomations) {
    try {
      const config: LocationTriggerConfig = JSON.parse(automation.triggerConfig);

      let shouldTrigger = false;
      let placeInfo = { name: "", category: "" };

      let place = config.placeId ? getSavedPlace(config.placeId) : null;

      // If no placeId but placeName is provided, search for the place by name
      if (!place && config.placeName) {
        place = searchPlaceByName(config.placeName);
        if (place) {
          console.log(`[NLAutomationExecutor] Found place "${place.name}" by name search for automation ${automation.name}`);
        } else {
          console.warn(`[NLAutomationExecutor] Could not find place with name "${config.placeName}" for automation ${automation.name}`);
          continue;
        }
      }

      if (place) {
        const placeLat = parseFloat(place.latitude);
        const placeLng = parseFloat(place.longitude);
        const distance = calculateDistance(lat, lng, placeLat, placeLng);
        const threshold = place.proximityRadiusMeters || 200;

        placeInfo = { name: place.name, category: place.category };

        // Check if entering or leaving proximity
        const isNearby = distance <= threshold;
        const wasNearby = await wasNearLocation(automation.id, place.id);

        if (config.triggerOnArrive && isNearby && !wasNearby) {
          shouldTrigger = true;
          await recordLocationState(automation.id, place.id, true);
        } else if (config.triggerOnLeave && !isNearby && wasNearby) {
          shouldTrigger = true;
          await recordLocationState(automation.id, place.id, false);
        }
      }

      if (shouldTrigger) {
        console.log(`[NLAutomationExecutor] Location trigger fired for: ${automation.name}`);
        await executeNLAutomation(automation, {
          triggerData: {
            type: "location",
            placeName: placeInfo.name,
            placeCategory: placeInfo.category,
            arrivalOrDeparture: config.triggerOnArrive ? "arrival" : "departure",
            timestamp: new Date().toISOString()
          }
        });
      }
    } catch (error) {
      console.error(`[NLAutomationExecutor] Error evaluating location automation ${automation.id}:`, error);
    }
  }
}

// Track location state per automation to detect enter/leave events
const locationStates = new Map<string, boolean>();

async function wasNearLocation(automationId: string, placeId: string): Promise<boolean> {
  const key = `${automationId}:${placeId}`;
  return locationStates.get(key) || false;
}

async function recordLocationState(automationId: string, placeId: string, isNear: boolean): Promise<void> {
  const key = `${automationId}:${placeId}`;
  locationStates.set(key, isNear);
}

/**
 * Search for a saved place by name (case-insensitive partial match)
 * Returns the first matching place
 */
function searchPlaceByName(placeName: string): ReturnType<typeof getSavedPlace> | undefined {
  const allPlaces = getAllSavedPlaces();
  const normalizedSearch = placeName.toLowerCase().trim();

  // First try exact match (case-insensitive)
  let match = allPlaces.find(p => p.name.toLowerCase() === normalizedSearch);

  // If no exact match, try partial match (contains)
  if (!match) {
    match = allPlaces.find(p => p.name.toLowerCase().includes(normalizedSearch));
  }

  return match;
}

// ============================================
// CONDITION-BASED TRIGGER EVALUATION
// ============================================

export async function evaluateConditionTriggers(): Promise<void> {
  const conditionAutomations = getNLAutomationsByTriggerType("condition");

  for (const automation of conditionAutomations) {
    try {
      const config: ConditionTriggerConfig = JSON.parse(automation.triggerConfig);

      let conditionMet = false;

      switch (config.conditionType) {
        case "tasks_overdue": {
          const overdueTasks = getOverdueTasks();
          const threshold = config.threshold || 1;
          conditionMet = overdueTasks.length >= threshold;

          if (conditionMet) {
            console.log(`[NLAutomationExecutor] Condition trigger fired: ${overdueTasks.length} overdue tasks`);
            await executeNLAutomation(automation, {
              triggerData: {
                conditionType: "tasks_overdue",
                overdueCount: overdueTasks.length,
                timestamp: new Date().toISOString()
              }
            });
          }
          break;
        }

        case "tasks_due_today": {
          const dueTodayTasks = getTasksDueToday();
          const threshold = config.threshold || 1;
          conditionMet = dueTodayTasks.length >= threshold;

          if (conditionMet) {
            console.log(`[NLAutomationExecutor] Condition trigger fired: ${dueTodayTasks.length} tasks due today`);
            await executeNLAutomation(automation, {
              triggerData: {
                conditionType: "tasks_due_today",
                dueCount: dueTodayTasks.length,
                timestamp: new Date().toISOString()
              }
            });
          }
          break;
        }

        // Add more condition types as needed
        default:
          console.warn(`[NLAutomationExecutor] Unknown condition type: ${config.conditionType}`);
      }
    } catch (error) {
      console.error(`[NLAutomationExecutor] Error evaluating condition automation ${automation.id}:`, error);
    }
  }
}

// ============================================
// KEYWORD-BASED TRIGGER EVALUATION
// ============================================

export async function evaluateKeywordTriggers(message: string, conversationId?: string): Promise<void> {
  const keywordAutomations = getNLAutomationsByTriggerType("keyword");

  for (const automation of keywordAutomations) {
    try {
      const config: KeywordTriggerConfig = JSON.parse(automation.triggerConfig);

      const messageLower = config.caseSensitive ? message : message.toLowerCase();
      const keywords = config.caseSensitive
        ? config.keywords
        : config.keywords.map(k => k.toLowerCase());

      let matched = false;

      if (config.matchAll) {
        // All keywords must be present
        matched = keywords.every(keyword => messageLower.includes(keyword));
      } else {
        // Any keyword can trigger
        matched = keywords.some(keyword => messageLower.includes(keyword));
      }

      if (matched) {
        console.log(`[NLAutomationExecutor] Keyword trigger fired for: ${automation.name}`);
        await executeNLAutomation(automation, {
          triggerData: {
            type: "keyword",
            matchedKeywords: keywords.filter(k => messageLower.includes(k)),
            message,
            conversationId,
            timestamp: new Date().toISOString()
          }
        });
      }
    } catch (error) {
      console.error(`[NLAutomationExecutor] Error evaluating keyword automation ${automation.id}:`, error);
    }
  }
}

export function initializeNLAutomations(): void {
  console.log("[NLAutomationExecutor] Initializing NL automations...");

  const automations = getEnabledNLAutomations();
  let scheduledCount = 0;

  for (const automation of automations) {
    if (automation.triggerType === "time") {
      scheduleTimeAutomation(automation);
      scheduledCount++;
    } else if (automation.triggerType === "condition") {
      // Schedule condition checks
      const config: ConditionTriggerConfig = JSON.parse(automation.triggerConfig);
      const checkInterval = config.checkInterval || "0 */4 * * *"; // Default: every 4 hours

      if (cron.validate(checkInterval)) {
        const task = cron.schedule(
          checkInterval,
          async () => {
            await evaluateConditionTriggers();
          },
          { timezone: "America/New_York" }
        );
        scheduledTasks.set(`condition:${automation.id}`, task);
        scheduledCount++;
      }
    }
  }

  // Schedule periodic location check (every 5 minutes)
  const locationCheckTask = cron.schedule(
    "*/5 * * * *",
    async () => {
      await evaluateLocationTriggers();
    },
    { timezone: "America/New_York" }
  );
  scheduledTasks.set("location-check", locationCheckTask);

  console.log(`[NLAutomationExecutor] Initialized ${scheduledCount} automation(s) with scheduled triggers`);
}

export function getScheduledAutomationIds(): string[] {
  return Array.from(scheduledTasks.keys());
}

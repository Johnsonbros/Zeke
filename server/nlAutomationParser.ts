import OpenAI from "openai";
import type {
  NLTriggerType,
  NLActionType,
  NLEventType,
  TimeTriggerConfig,
  EventTriggerConfig,
  SendSmsActionConfig,
  CreateTaskActionConfig,
  AddGroceryActionConfig,
  SetReminderActionConfig,
  NotifyActionConfig,
  InsertNLAutomation
} from "@shared/schema";

const openai = new OpenAI();

interface ParsedAutomation {
  name: string;
  triggerType: NLTriggerType;
  triggerConfig: string;
  actionType: NLActionType;
  actionConfig: string;
  conditions?: string;
  explanation: string;
}

interface ParseResult {
  success: boolean;
  automation?: ParsedAutomation;
  error?: string;
  suggestions?: string[];
}

const SYSTEM_PROMPT = `You are an automation parser for a personal AI assistant named ZEKE. Your job is to convert natural language automation requests into structured automation rules.

CONTEXT:
- ZEKE is Nate's personal assistant that handles tasks, reminders, grocery lists, SMS communication, calendar events, and notifications
- Automations should be action-oriented and practical
- Default timezone is America/New_York

TRIGGER TYPES:
1. "time" - Cron-based schedules (daily, weekly, specific times)
   - Config: { cronExpression: "0 9 * * *", timezone: "America/New_York", description: "Every day at 9am" }
   - Common patterns:
     - "every morning at 9am" → "0 9 * * *"
     - "every weekday at 8am" → "0 8 * * 1-5"
     - "every Sunday at 10am" → "0 10 * * 0"
     - "every hour" → "0 * * * *"

2. "event" - Triggered by system events
   - Config: { eventType: "task_completed", filters: {} }
   - Event types: task_created, task_completed, task_overdue, reminder_triggered, grocery_purchased, calendar_event_soon, message_received, location_changed

3. "condition" - Triggered when conditions are met (checked periodically)
   - Config: { conditionType: "tasks_overdue", threshold: 3, checkInterval: "0 */4 * * *" }

4. "keyword" - Triggered by keywords in messages
   - Config: { keywords: ["groceries", "shopping"], matchAll: false }

5. "location" - Triggered by location changes
   - Config: { placeName: "home", triggerOnArrive: true, triggerOnLeave: false }

ACTION TYPES:
1. "send_sms" - Send an SMS message
   - Config: { recipientPhone: "", messageTemplate: "Your message here" }
   - recipientPhone can be empty to use default (Nate's phone)

2. "create_task" - Create a new task
   - Config: { titleTemplate: "Task title", descriptionTemplate: "", priority: "medium", category: "personal", dueDateOffset: "+1d" }
   - dueDateOffset: "+1d" (tomorrow), "+1w" (next week), "+0d" (today)

3. "add_grocery" - Add item to grocery list
   - Config: { itemTemplate: "Item name", quantity: "1", category: "Other" }

4. "set_reminder" - Set a reminder
   - Config: { messageTemplate: "Reminder message", timeOffset: "+30m" }

5. "notify" - Queue a notification (uses smart batching)
   - Config: { titleTemplate: "Title", contentTemplate: "Content", priority: "normal", category: "system" }
   - Categories: reminder, task, calendar, insight, grocery, message, alert, system

6. "generate_summary" - Generate and send a summary
   - Config: { summaryType: "tasks" | "calendar" | "daily_briefing" }

RESPONSE FORMAT:
Return a JSON object with this exact structure:
{
  "success": true,
  "automation": {
    "name": "Short descriptive name for the automation",
    "triggerType": "time|event|condition|keyword|location",
    "triggerConfig": { ... },
    "actionType": "send_sms|create_task|add_grocery|set_reminder|notify|generate_summary",
    "actionConfig": { ... },
    "conditions": null,
    "explanation": "Human-readable explanation of what this automation does"
  }
}

Or if parsing fails:
{
  "success": false,
  "error": "Explanation of why parsing failed",
  "suggestions": ["Alternative phrasings that would work"]
}

EXAMPLES:

Input: "Every morning at 9am, send me a task summary"
Output: {
  "success": true,
  "automation": {
    "name": "Morning Task Summary",
    "triggerType": "time",
    "triggerConfig": { "cronExpression": "0 9 * * *", "timezone": "America/New_York", "description": "Every day at 9am" },
    "actionType": "generate_summary",
    "actionConfig": { "summaryType": "tasks" },
    "conditions": null,
    "explanation": "Sends a summary of your tasks every morning at 9am"
  }
}

Input: "When I complete a task, send me an encouraging message"
Output: {
  "success": true,
  "automation": {
    "name": "Task Completion Encouragement",
    "triggerType": "event",
    "triggerConfig": { "eventType": "task_completed" },
    "actionType": "send_sms",
    "actionConfig": { "messageTemplate": "Great job completing that task! Keep up the momentum." },
    "conditions": null,
    "explanation": "Sends an encouraging SMS whenever you complete a task"
  }
}

Input: "Add milk to grocery list every week"
Output: {
  "success": true,
  "automation": {
    "name": "Weekly Milk Reminder",
    "triggerType": "time",
    "triggerConfig": { "cronExpression": "0 9 * * 0", "timezone": "America/New_York", "description": "Every Sunday at 9am" },
    "actionType": "add_grocery",
    "actionConfig": { "itemTemplate": "Milk", "quantity": "1", "category": "Dairy" },
    "conditions": null,
    "explanation": "Adds milk to the grocery list every Sunday morning"
  }
}`;

export async function parseNaturalLanguageAutomation(phrase: string): Promise<ParseResult> {
  try {
    console.log(`[NLAutomationParser] Parsing phrase: "${phrase}"`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: phrase }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 1000
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {
        success: false,
        error: "No response from AI model"
      };
    }

    const parsed = JSON.parse(content);
    
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error || "Failed to parse automation",
        suggestions: parsed.suggestions
      };
    }

    const automation = parsed.automation;
    
    // Validate required fields
    if (!automation.name || !automation.triggerType || !automation.triggerConfig || 
        !automation.actionType || !automation.actionConfig) {
      return {
        success: false,
        error: "Missing required automation fields"
      };
    }

    // Stringify configs if they're objects
    const triggerConfig = typeof automation.triggerConfig === "string" 
      ? automation.triggerConfig 
      : JSON.stringify(automation.triggerConfig);
    
    const actionConfig = typeof automation.actionConfig === "string"
      ? automation.actionConfig
      : JSON.stringify(automation.actionConfig);
    
    const conditions = automation.conditions 
      ? (typeof automation.conditions === "string" ? automation.conditions : JSON.stringify(automation.conditions))
      : undefined;

    return {
      success: true,
      automation: {
        name: automation.name,
        triggerType: automation.triggerType,
        triggerConfig,
        actionType: automation.actionType,
        actionConfig,
        conditions,
        explanation: automation.explanation || ""
      }
    };

  } catch (error: any) {
    console.error("[NLAutomationParser] Error:", error);
    return {
      success: false,
      error: `Failed to parse automation: ${error.message}`
    };
  }
}

export function convertToInsertAutomation(
  originalPhrase: string,
  parsed: ParsedAutomation
): InsertNLAutomation {
  return {
    name: parsed.name,
    originalPhrase,
    triggerType: parsed.triggerType,
    triggerConfig: parsed.triggerConfig,
    actionType: parsed.actionType,
    actionConfig: parsed.actionConfig,
    conditions: parsed.conditions || null,
    enabled: true
  };
}

export function getTriggerDescription(automation: { triggerType: string; triggerConfig: string }): string {
  try {
    const config = JSON.parse(automation.triggerConfig);
    
    switch (automation.triggerType) {
      case "time":
        return config.description || `Cron: ${config.cronExpression}`;
      case "event":
        return `When ${config.eventType?.replace(/_/g, " ")}`;
      case "condition":
        return `When ${config.conditionType?.replace(/_/g, " ")}${config.threshold ? ` >= ${config.threshold}` : ""}`;
      case "keyword":
        return `Keywords: ${config.keywords?.join(", ") || "none"}`;
      case "location":
        return `${config.triggerOnArrive ? "Arrive at" : "Leave"} ${config.placeName || "location"}`;
      default:
        return automation.triggerType;
    }
  } catch {
    return automation.triggerType;
  }
}

export function getActionDescription(automation: { actionType: string; actionConfig: string }): string {
  try {
    const config = JSON.parse(automation.actionConfig);
    
    switch (automation.actionType) {
      case "send_sms":
        const preview = config.messageTemplate?.substring(0, 50) || "";
        return `Send SMS: "${preview}${config.messageTemplate?.length > 50 ? "..." : ""}"`;
      case "create_task":
        return `Create task: "${config.titleTemplate}"`;
      case "add_grocery":
        return `Add to grocery: ${config.quantity || "1"} ${config.itemTemplate}`;
      case "set_reminder":
        return `Set reminder: "${config.messageTemplate}"`;
      case "notify":
        return `Notify: ${config.titleTemplate}`;
      case "generate_summary":
        return `Generate ${config.summaryType} summary`;
      default:
        return automation.actionType;
    }
  } catch {
    return automation.actionType;
  }
}

export type { ParsedAutomation, ParseResult };

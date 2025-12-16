/**
 * Command Parser for ZEKE Wake Word Commands
 * 
 * Uses OpenAI to parse natural language commands extracted from lifelogs
 * and convert them into structured action requests.
 */

import OpenAI from "openai";
import type { DetectedCommand } from "./wakeWordDetector";
import { findSimilarContact, getContactByPhone, getAllContacts } from "./db";
import type { Contact } from "@shared/schema";

let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured.");
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

// Supported action types
export type ActionType = 
  | "send_message" 
  | "set_reminder" 
  | "add_task" 
  | "add_grocery_item"
  | "schedule_event"
  | "search_info"
  | "get_weather"
  | "get_time"
  | "get_briefing"
  | "unknown";

export interface ParsedAction {
  actionType: ActionType;
  confidence: number;
  targetPerson: string | null;
  targetContact: Contact | null;
  message: string | null;
  reminderTime: string | null;
  taskDetails: {
    title: string;
    priority?: "low" | "medium" | "high";
    dueDate?: string;
    category?: "work" | "personal" | "family";
  } | null;
  groceryItem: {
    name: string;
    quantity?: string;
    category?: string;
  } | null;
  eventDetails: {
    title: string;
    startTime: string;
    endTime?: string;
    location?: string;
    description?: string;
    allDay?: boolean;
  } | null;
  searchQuery: string | null;
  weatherDetails: {
    city?: string;
    country?: string;
    includeForecast?: boolean;
  } | null;
  originalCommand: string;
  reasoning: string;
}

export interface ParseResult {
  success: boolean;
  action: ParsedAction | null;
  error?: string;
}

const COMMAND_PARSING_PROMPT = `You are ZEKE, Nate's personal AI assistant. You've detected a voice command directed at you through the Omi pendant lifelog.

Your job is to parse this command and extract the structured action Nate wants you to take.

AVAILABLE ACTIONS:
1. send_message - Send SMS/text to someone (requires target person and message)
2. set_reminder - Set a reminder for later (requires time and message)
3. add_task - Add a to-do item (requires task title)
4. add_grocery_item - Add item to grocery list (requires item name)
5. schedule_event - Schedule a calendar event (requires event details)
6. search_info - Look up information via web search (requires search query)
7. get_weather - Get current weather and/or forecast (can specify city, defaults to Boston)
8. get_time - Get current time/date
9. get_briefing - Get a morning briefing with weather, calendar, and tasks
10. unknown - Command unclear or not actionable

CONTEXT:
- You're Nate's digital twin and personal assistant
- Nate is CEO of Johnson Bros. Plumbing & Drain Cleaning
- Nate lives in Boston, MA (default location for weather)
- His family: wife Shakita, daughters Aurora and Carolina
- Common contacts: family members, coworkers, clients

IMPORTANT GUIDELINES:
1. Be smart about interpreting casual speech - "tell Carolina to hurry up" means send a text to Carolina
2. If someone says "text [person]" or "message [person]" or "tell [person]", that's send_message
3. Extract the actual message content, not just that a message should be sent
4. For reminders, try to parse relative times like "in an hour" or "tomorrow morning"
5. Be helpful and assume good intent - if the command seems actionable, try to parse it
6. Questions about weather like "what's the weather", "how's it outside", "is it going to rain" should use get_weather
7. Questions asking for time like "what time is it" should use get_time
8. Requests for a summary of the day, "what's on my schedule", "give me a briefing" should use get_briefing
9. For complex informational questions that aren't weather/time, use search_info

Respond with a JSON object containing:
{
  "actionType": "<one of the action types>",
  "confidence": <0.0 to 1.0>,
  "targetPerson": "<name of person if applicable, null otherwise>",
  "message": "<message content if send_message or reminder, null otherwise>",
  "reminderTime": "<ISO datetime or relative time if set_reminder, null otherwise>",
  "taskDetails": { "title": "...", "priority": "...", "dueDate": "...", "category": "..." } or null,
  "groceryItem": { "name": "...", "quantity": "...", "category": "..." } or null,
  "eventDetails": { "title": "...", "startTime": "<ISO datetime>", "endTime": "<ISO datetime or null>", "location": "...", "description": "...", "allDay": false } or null,
  "searchQuery": "<query if search_info, null otherwise>",
  "weatherDetails": { "city": "<city name or null for Boston>", "country": "<country code or null for US>", "includeForecast": <true if asking about future weather, false otherwise> } or null,
  "reasoning": "<brief explanation of your interpretation>"
}`;

/**
 * Parse a detected command into a structured action
 */
export async function parseCommand(command: DetectedCommand): Promise<ParseResult> {
  try {
    const client = getOpenAIClient();
    
    // Build context with available contacts
    const contacts = getAllContacts();
    const contactList = contacts
      .slice(0, 20)
      .map(c => `${c.name} (${c.relationship || c.accessLevel})`)
      .join(", ");
    
    const userMessage = `
Command detected: "${command.rawCommand}"
Wake word used: "${command.wakeWord}"
Speaker: ${command.speakerName || "Unknown (likely Nate)"}
Context from transcript: "${command.context}"
Lifelog title: "${command.lifelogTitle}"
Timestamp: ${command.timestamp}

Known contacts: ${contactList || "None stored yet"}

Parse this command and determine what action ZEKE should take.`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: COMMAND_PARSING_PROMPT },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { success: false, action: null, error: "No response from AI" };
    }

    const parsed = JSON.parse(content);
    
    // Try to match target person to a contact
    let targetContact: Contact | null = null;
    if (parsed.targetPerson) {
      targetContact = findSimilarContact(parsed.targetPerson);
    }

    const action: ParsedAction = {
      actionType: parsed.actionType as ActionType,
      confidence: parsed.confidence || 0.5,
      targetPerson: parsed.targetPerson || null,
      targetContact,
      message: parsed.message || null,
      reminderTime: parsed.reminderTime || null,
      taskDetails: parsed.taskDetails || null,
      groceryItem: parsed.groceryItem || null,
      eventDetails: parsed.eventDetails || null,
      searchQuery: parsed.searchQuery || null,
      weatherDetails: parsed.weatherDetails || null,
      originalCommand: command.rawCommand,
      reasoning: parsed.reasoning || "",
    };

    return { success: true, action };
  } catch (error) {
    console.error("[CommandParser] Error parsing command:", error);
    return { 
      success: false, 
      action: null, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

/**
 * Generate a friendly message for sending to someone based on the command context
 */
export async function generateFriendlyMessage(
  targetPerson: string,
  originalCommand: string,
  context: string
): Promise<string> {
  try {
    const client = getOpenAIClient();

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are ZEKE, Nate's personal AI assistant sending a message on his behalf.

Generate a natural, friendly text message to relay Nate's request. The message should:
1. Sound natural like it's from a helpful assistant
2. Convey the intent clearly but in a friendly way
3. Be concise (1-2 sentences max)
4. Sign off as ZEKE only if it makes sense

Examples:
- "tell Carolina to hurry up" → "Hey Carolina! Just a heads up - Nate mentioned you need to get moving. Let him know if you need anything!"
- "remind Shakita about dinner at 7" → "Hey Shakita! Quick reminder from Nate - dinner at 7 tonight!"
- "tell mom I'll call her back" → "Hi! Nate wanted me to let you know he'll call you back soon."`,
        },
        {
          role: "user",
          content: `Target person: ${targetPerson}
Original command: "${originalCommand}"
Additional context: "${context}"

Generate a friendly text message to send.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 150,
    });

    return response.choices[0]?.message?.content?.trim() || 
      `Hey ${targetPerson}! Nate wanted me to let you know: ${originalCommand}`;
  } catch (error) {
    console.error("[CommandParser] Error generating message:", error);
    return `Hey ${targetPerson}! Nate wanted me to let you know: ${originalCommand}`;
  }
}

/**
 * Validate if an action can be executed
 */
export function validateAction(action: ParsedAction): { valid: boolean; reason?: string } {
  switch (action.actionType) {
    case "send_message":
      if (!action.targetPerson) {
        return { valid: false, reason: "No target person specified" };
      }
      if (!action.targetContact) {
        return { valid: false, reason: `Could not find contact for "${action.targetPerson}"` };
      }
      if (!action.targetContact.phoneNumber || action.targetContact.phoneNumber.startsWith("auto-")) {
        return { valid: false, reason: `No phone number on file for ${action.targetPerson}` };
      }
      return { valid: true };

    case "set_reminder":
      if (!action.message && !action.originalCommand) {
        return { valid: false, reason: "No reminder message specified" };
      }
      return { valid: true };

    case "add_task":
      if (!action.taskDetails?.title) {
        return { valid: false, reason: "No task title specified" };
      }
      return { valid: true };

    case "add_grocery_item":
      if (!action.groceryItem?.name) {
        return { valid: false, reason: "No grocery item specified" };
      }
      return { valid: true };

    case "schedule_event":
      return { valid: true };

    case "search_info":
      if (!action.searchQuery) {
        return { valid: false, reason: "No search query specified" };
      }
      return { valid: true };

    case "get_weather":
      return { valid: true };

    case "get_time":
      return { valid: true };

    case "get_briefing":
      return { valid: true };

    case "unknown":
      return { valid: false, reason: "Command could not be parsed into an action" };

    default:
      return { valid: false, reason: "Unknown action type" };
  }
}

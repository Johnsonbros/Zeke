import fs from "fs";
import path from "path";
import type OpenAI from "openai";
import { 
  createGroceryItem, 
  getAllGroceryItems, 
  toggleGroceryItemPurchased, 
  deleteGroceryItem,
  clearPurchasedGroceryItems,
  clearAllGroceryItems,
  createReminder as dbCreateReminder,
  getReminder,
  getPendingReminders,
  updateReminderCompleted,
  deleteReminder as dbDeleteReminder,
  createTask,
  getAllTasks,
  getTask,
  updateTask,
  toggleTaskCompleted,
  deleteTask,
  clearCompletedTasks,
  getTasksDueToday,
  getOverdueTasks,
  searchTasks
} from "./db";
import type { Reminder, Task } from "@shared/schema";
import { 
  configureDailyCheckIn, 
  getDailyCheckInStatus, 
  stopDailyCheckIn, 
  sendDailyCheckIn,
  setDailyCheckInSmsCallback
} from "./dailyCheckIn";
import {
  listCalendarEvents,
  getTodaysEvents,
  getUpcomingEvents,
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
  type CalendarEvent,
} from "./googleCalendar";
import {
  getCurrentWeather,
  getWeatherForecast,
  formatWeatherForSms,
  formatForecastForSms,
} from "./weather";

interface ActiveReminder extends Reminder {
  timeoutId?: NodeJS.Timeout;
}

interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
}

// Helper function to decode HTML entities
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// Map to track active timeout IDs for reminders (by reminder ID)
const activeTimeouts: Map<string, NodeJS.Timeout> = new Map();

export const toolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "set_reminder",
      description: "Set a reminder to send a message at a specific time. Can remind the user via the current conversation or send an SMS to another phone number.",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "The reminder message to send",
          },
          delay_minutes: {
            type: "number",
            description: "Number of minutes from now to send the reminder. Use this OR scheduled_time, not both.",
          },
          scheduled_time: {
            type: "string",
            description: "ISO 8601 timestamp for when to send the reminder (e.g., '2024-01-15T14:30:00'). Use this OR delay_minutes, not both.",
          },
          recipient_phone: {
            type: "string",
            description: "Optional phone number to send SMS to. If not provided, reminder goes to the current conversation.",
          },
        },
        required: ["message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_reminders",
      description: "List all pending reminders",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_reminder",
      description: "Cancel a pending reminder by its ID",
      parameters: {
        type: "object",
        properties: {
          reminder_id: {
            type: "string",
            description: "The ID of the reminder to cancel",
          },
        },
        required: ["reminder_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for ANY information the user needs. ALWAYS use this tool when asked about: phone numbers, addresses, business hours, contact information, current events, facts, news, prices, reviews, or any factual question. Don't tell the user to search themselves - use this tool instead.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query - be specific, include location if relevant (e.g., 'Atrius Health Braintree MA phone number')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file. Use for accessing notes, documents, or data files.",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Path to the file to read (relative to the project root)",
          },
        },
        required: ["file_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file. Use for saving notes, creating documents, or storing data.",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Path to the file to write (relative to the project root)",
          },
          content: {
            type: "string",
            description: "The content to write to the file",
          },
          append: {
            type: "boolean",
            description: "If true, append to the file instead of overwriting. Default is false.",
          },
        },
        required: ["file_path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files in a directory",
      parameters: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description: "Path to the directory to list (relative to project root). Use '.' for root.",
          },
        },
        required: ["directory"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "Get the current date and time in the user's timezone",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_grocery_item",
      description: "Add an item to the shared grocery list. The grocery list is shared between Nate, Shakita, and ZEKE.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The name of the grocery item to add",
          },
          quantity: {
            type: "string",
            description: "The quantity (e.g., '1', '2 lbs', '1 dozen'). Default is '1'.",
          },
          category: {
            type: "string",
            enum: ["Produce", "Dairy", "Meat", "Bakery", "Frozen", "Beverages", "Snacks", "Household", "Other"],
            description: "The category of the item. Default is 'Other'.",
          },
          added_by: {
            type: "string",
            enum: ["Nate", "ZEKE", "Shakita"],
            description: "Who is adding this item. Use 'Nate' for items Nate requests, 'ZEKE' if you're adding it proactively, 'Shakita' if she requests it.",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_grocery_items",
      description: "List all items on the grocery list, showing what needs to be bought and what's already purchased.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_grocery_purchased",
      description: "Mark a grocery item as purchased (or toggle back to unpurchased).",
      parameters: {
        type: "object",
        properties: {
          item_name: {
            type: "string",
            description: "The name of the item to mark as purchased (partial match is supported).",
          },
        },
        required: ["item_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_grocery_item",
      description: "Remove an item from the grocery list entirely.",
      parameters: {
        type: "object",
        properties: {
          item_name: {
            type: "string",
            description: "The name of the item to remove (partial match is supported).",
          },
        },
        required: ["item_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_purchased_groceries",
      description: "Clear all purchased items from the grocery list.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_all_groceries",
      description: "Clear ALL items from the grocery list entirely. Use when user says 'clear the list', 'empty the list', 'start fresh', or 'got them all'.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_sms",
      description: "Send an SMS text message to any phone number. Use this when the user asks you to text someone, send a message to someone, or notify someone via SMS.",
      parameters: {
        type: "object",
        properties: {
          phone_number: {
            type: "string",
            description: "The phone number to send the SMS to. Include country code (e.g., '+16175551234'). If just 10 digits provided, assume +1 for US.",
          },
          message: {
            type: "string",
            description: "The text message to send.",
          },
        },
        required: ["phone_number", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "configure_daily_checkin",
      description: "Set up daily check-in texts. ZEKE will text the user once per day at the specified time with 3 multiple choice questions to better understand them. Use when user asks for daily questions, wants ZEKE to learn about them via text, or asks to set up a daily check-in.",
      parameters: {
        type: "object",
        properties: {
          phone_number: {
            type: "string",
            description: "The phone number to send daily check-in texts to. Include country code (e.g., '+16175551234').",
          },
          time: {
            type: "string",
            description: "Time to send daily check-in in 24-hour format HH:MM (e.g., '09:00' for 9am, '18:30' for 6:30pm). Defaults to 09:00 if not specified.",
          },
        },
        required: ["phone_number"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_daily_checkin_status",
      description: "Check if daily check-in is configured and get its current settings.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "stop_daily_checkin",
      description: "Stop the daily check-in texts.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_checkin_now",
      description: "Send a daily check-in immediately (for testing or if user wants questions right now).",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_task",
      description: "Add a task to the to-do list. Use for any task, to-do item, or action item Nate mentions.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The task title/description",
          },
          description: {
            type: "string",
            description: "Optional longer description or notes for the task",
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Task priority. Default is 'medium'.",
          },
          due_date: {
            type: "string",
            description: "Due date in ISO 8601 format (e.g., '2024-01-15' or '2024-01-15T14:30:00'). Optional.",
          },
          category: {
            type: "string",
            enum: ["work", "personal", "family"],
            description: "Task category. Default is 'personal'.",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tasks",
      description: "List all tasks, optionally filtered by category or status. Shows pending tasks by default.",
      parameters: {
        type: "object",
        properties: {
          include_completed: {
            type: "boolean",
            description: "Whether to include completed tasks. Default is false.",
          },
          category: {
            type: "string",
            enum: ["work", "personal", "family"],
            description: "Filter by category. If not provided, shows all categories.",
          },
          show_overdue: {
            type: "boolean",
            description: "Only show overdue tasks.",
          },
          show_due_today: {
            type: "boolean",
            description: "Only show tasks due today.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description: "Update an existing task by ID or partial title match.",
      parameters: {
        type: "object",
        properties: {
          task_identifier: {
            type: "string",
            description: "The task ID or partial title to find the task",
          },
          title: {
            type: "string",
            description: "New title for the task",
          },
          description: {
            type: "string",
            description: "New description for the task",
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "New priority level",
          },
          due_date: {
            type: "string",
            description: "New due date in ISO 8601 format, or null to remove",
          },
          category: {
            type: "string",
            enum: ["work", "personal", "family"],
            description: "New category",
          },
        },
        required: ["task_identifier"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Mark a task as completed (or toggle back to incomplete).",
      parameters: {
        type: "object",
        properties: {
          task_identifier: {
            type: "string",
            description: "The task ID or partial title to find and complete the task",
          },
        },
        required: ["task_identifier"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_task",
      description: "Delete a task from the to-do list.",
      parameters: {
        type: "object",
        properties: {
          task_identifier: {
            type: "string",
            description: "The task ID or partial title to find and delete the task",
          },
        },
        required: ["task_identifier"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_completed_tasks",
      description: "Remove all completed tasks from the list.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_calendar_events",
      description: "Get calendar events from Google Calendar. Can get today's events, upcoming events, or events within a date range.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["today", "upcoming", "range"],
            description: "Type of query: 'today' for today's events, 'upcoming' for next 7 days, 'range' for custom date range.",
          },
          days: {
            type: "number",
            description: "For 'upcoming' type: number of days to look ahead (default 7).",
          },
          start_date: {
            type: "string",
            description: "For 'range' type: start date in ISO format (e.g., '2024-01-15').",
          },
          end_date: {
            type: "string",
            description: "For 'range' type: end date in ISO format.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Create a new event on Google Calendar.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The event title/summary",
          },
          start_time: {
            type: "string",
            description: "Event start time in ISO format (e.g., '2024-01-15T14:00:00'). For all-day events, use date only (e.g., '2024-01-15').",
          },
          end_time: {
            type: "string",
            description: "Event end time in ISO format. If not provided, defaults to 1 hour after start for timed events.",
          },
          description: {
            type: "string",
            description: "Optional event description/notes.",
          },
          location: {
            type: "string",
            description: "Optional event location.",
          },
          all_day: {
            type: "boolean",
            description: "Whether this is an all-day event. Default is false.",
          },
        },
        required: ["title", "start_time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_calendar_event",
      description: "Delete an event from Google Calendar by its ID.",
      parameters: {
        type: "object",
        properties: {
          event_id: {
            type: "string",
            description: "The ID of the event to delete (obtained from get_calendar_events).",
          },
        },
        required: ["event_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather and forecast for a location. Defaults to Boston, MA where Nate lives.",
      parameters: {
        type: "object",
        properties: {
          city: {
            type: "string",
            description: "City name. Default is 'Boston'.",
          },
          country: {
            type: "string",
            description: "Country code. Default is 'US'.",
          },
          include_forecast: {
            type: "boolean",
            description: "Whether to include multi-day forecast. Default is false.",
          },
          forecast_days: {
            type: "number",
            description: "Number of days for forecast (1-5). Default is 5.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_morning_briefing",
      description: "Get a comprehensive morning briefing for Nate. Combines weather, today's calendar events, pending tasks, and any pending reminders into a single summary. Perfect for starting the day.",
      parameters: {
        type: "object",
        properties: {
          send_sms: {
            type: "boolean",
            description: "Whether to also send the briefing via SMS. Default is false.",
          },
          phone_number: {
            type: "string",
            description: "Phone number to send SMS to (required if send_sms is true).",
          },
        },
        required: [],
      },
    },
  },
];

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

let sendSmsCallback: ((phone: string, message: string) => Promise<void>) | null = null;
let notifyUserCallback: ((conversationId: string, message: string) => Promise<void>) | null = null;

export function setSendSmsCallback(callback: (phone: string, message: string) => Promise<void>) {
  sendSmsCallback = callback;
}

export function setNotifyUserCallback(callback: (conversationId: string, message: string) => Promise<void>) {
  notifyUserCallback = callback;
}

async function executeReminder(reminderId: string) {
  const reminder = getReminder(reminderId);
  if (!reminder) {
    console.log(`Reminder ${reminderId} not found in database, may have been cancelled`);
    activeTimeouts.delete(reminderId);
    return;
  }
  
  if (reminder.completed) {
    console.log(`Reminder ${reminderId} already completed, skipping`);
    activeTimeouts.delete(reminderId);
    return;
  }
  
  console.log(`Executing reminder: ${reminder.id} - "${reminder.message}"`);
  
  try {
    if (reminder.recipientPhone && sendSmsCallback) {
      await sendSmsCallback(reminder.recipientPhone, reminder.message);
      console.log(`Reminder SMS sent to ${reminder.recipientPhone}`);
    } else if (reminder.conversationId && notifyUserCallback) {
      await notifyUserCallback(reminder.conversationId, `Reminder: ${reminder.message}`);
      console.log(`Reminder notification sent to conversation ${reminder.conversationId}`);
    } else {
      console.log(`Reminder fired but no delivery method: ${reminder.message}`);
    }
    
    updateReminderCompleted(reminderId, true);
    activeTimeouts.delete(reminderId);
  } catch (error) {
    console.error("Failed to execute reminder:", error);
  }
}

interface SetReminderArgs {
  message: string;
  delay_minutes?: number;
  scheduled_time?: string;
  recipient_phone?: string;
}

interface CancelReminderArgs {
  reminder_id: string;
}

interface WebSearchArgs {
  query: string;
}

interface ReadFileArgs {
  file_path: string;
}

interface WriteFileArgs {
  file_path: string;
  content: string;
  append?: boolean;
}

interface ListFilesArgs {
  directory: string;
}

export async function executeTool(
  toolName: string, 
  args: Record<string, unknown>,
  conversationId?: string
): Promise<string> {
  console.log(`Executing tool: ${toolName}`, args);
  
  switch (toolName) {
    case "set_reminder": {
      const { message, delay_minutes, scheduled_time, recipient_phone } = args as SetReminderArgs;
      
      let scheduledFor: Date;
      
      if (delay_minutes) {
        scheduledFor = new Date(Date.now() + delay_minutes * 60 * 1000);
      } else if (scheduled_time) {
        scheduledFor = new Date(scheduled_time);
      } else {
        scheduledFor = new Date(Date.now() + 5 * 60 * 1000);
      }
      
      const reminder = dbCreateReminder({
        message,
        recipientPhone: recipient_phone || null,
        conversationId: conversationId || null,
        scheduledFor: scheduledFor.toISOString(),
        completed: false,
      });
      
      const delay = scheduledFor.getTime() - Date.now();
      if (delay > 0) {
        const timeoutId = setTimeout(() => executeReminder(reminder.id), delay);
        activeTimeouts.set(reminder.id, timeoutId);
      }
      
      const timeStr = scheduledFor.toLocaleString("en-US", { 
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        month: "short",
        day: "numeric"
      });
      
      const target = recipient_phone ? `to ${recipient_phone}` : "in this conversation";
      return JSON.stringify({
        success: true,
        reminder_id: reminder.id,
        message: `Reminder set for ${timeStr} ${target}: "${message}"`,
        scheduled_for: scheduledFor.toISOString(),
      });
    }
    
    case "list_reminders": {
      const dbReminders = getPendingReminders();
      const pendingReminders = dbReminders.map(r => ({
        id: r.id,
        message: r.message,
        scheduled_for: new Date(r.scheduledFor).toLocaleString("en-US", { timeZone: "America/New_York" }),
        recipient: r.recipientPhone || "this conversation",
      }));
      
      if (pendingReminders.length === 0) {
        return JSON.stringify({ reminders: [], message: "No pending reminders" });
      }
      
      return JSON.stringify({ reminders: pendingReminders });
    }
    
    case "cancel_reminder": {
      const { reminder_id } = args as CancelReminderArgs;
      const reminder = getReminder(reminder_id);
      
      if (!reminder) {
        return JSON.stringify({ success: false, error: "Reminder not found" });
      }
      
      const timeoutId = activeTimeouts.get(reminder_id);
      if (timeoutId) {
        clearTimeout(timeoutId);
        activeTimeouts.delete(reminder_id);
      }
      dbDeleteReminder(reminder_id);
      
      return JSON.stringify({ success: true, message: `Reminder ${reminder_id} cancelled` });
    }
    
    case "web_search": {
      const { query } = args as WebSearchArgs;
      
      try {
        const results: WebSearchResult[] = [];
        
        // Strategy 1: Try DuckDuckGo Instant Answer API first (good for facts, definitions)
        try {
          const instantResponse = await fetch(
            `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`
          );
          const instantData = await instantResponse.json();
          
          if (instantData.AbstractText) {
            results.push({
              title: instantData.Heading || "Summary",
              snippet: instantData.AbstractText,
              url: instantData.AbstractURL || "",
            });
          }
          
          // Check for Infobox (contains contact info, addresses, etc.)
          if (instantData.Infobox?.content) {
            const infoItems = instantData.Infobox.content
              .filter((item: any) => item.value)
              .map((item: any) => `${item.label}: ${item.value}`)
              .join(", ");
            if (infoItems) {
              results.push({
                title: "Contact Information",
                snippet: infoItems,
                url: instantData.AbstractURL || "",
              });
            }
          }
          
          // Check Answer field (direct answers like calculations, conversions)
          if (instantData.Answer) {
            results.push({
              title: "Answer",
              snippet: instantData.Answer,
              url: "",
            });
          }
          
          if (instantData.RelatedTopics) {
            for (const topic of instantData.RelatedTopics.slice(0, 5)) {
              if (topic.Text) {
                results.push({
                  title: topic.Text.split(" - ")[0] || "Related",
                  snippet: topic.Text,
                  url: topic.FirstURL || "",
                });
              }
              // Handle nested topics (groups)
              if (topic.Topics) {
                for (const subTopic of topic.Topics.slice(0, 2)) {
                  if (subTopic.Text) {
                    results.push({
                      title: subTopic.Text.split(" - ")[0] || "Related",
                      snippet: subTopic.Text,
                      url: subTopic.FirstURL || "",
                    });
                  }
                }
              }
            }
          }
        } catch (e) {
          console.log("Instant Answer API failed, continuing with HTML search");
        }
        
        // Strategy 2: If we don't have good results, try DuckDuckGo HTML search
        if (results.length < 3) {
          try {
            const htmlResponse = await fetch(
              `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
              {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                  "Accept-Language": "en-US,en;q=0.5",
                },
              }
            );
            
            if (!htmlResponse.ok) {
              console.log(`HTML search returned status ${htmlResponse.status}`);
            } else {
              const html = await htmlResponse.text();
              
              // Parse search results from HTML - using more flexible regex
              const resultRegex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([^<]*)/gi;
              const snippetRegex = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([^<]*)/gi;
              
              const resultArray = Array.from(html.matchAll(resultRegex));
              const snippetArray = Array.from(html.matchAll(snippetRegex));
              
              for (let i = 0; i < Math.min(resultArray.length, 5); i++) {
                try {
                  const titleMatch = resultArray[i];
                  const snippetMatch = snippetArray[i];
                  
                  if (titleMatch && titleMatch[1] && titleMatch[2]) {
                    // Clean up the URL (DuckDuckGo uses redirect URLs with uddg parameter)
                    let url = titleMatch[1];
                    
                    // Extract actual URL from DuckDuckGo redirect
                    const uddgMatch = url.match(/uddg=([^&]+)/);
                    if (uddgMatch && uddgMatch[1]) {
                      try {
                        url = decodeURIComponent(uddgMatch[1]);
                      } catch {
                        // If decoding fails, use original
                      }
                    }
                    
                    // Ensure URL is valid (starts with http)
                    if (!url.startsWith("http")) {
                      // Skip invalid URLs
                      continue;
                    }
                    
                    // Clean up snippet (remove HTML tags)
                    let snippet = "";
                    if (snippetMatch && snippetMatch[1]) {
                      snippet = snippetMatch[1].replace(/<[^>]*>/g, "").trim();
                      // Decode HTML entities
                      snippet = decodeHtmlEntities(snippet);
                    }
                    
                    const title = decodeHtmlEntities(titleMatch[2].trim());
                    
                    if (title && !results.some(r => r.title === title)) {
                      results.push({
                        title,
                        snippet: snippet || "No description available",
                        url,
                      });
                    }
                  }
                } catch (parseErr) {
                  // Skip this result and continue with others
                  console.log("Error parsing individual result:", parseErr);
                }
              }
            }
          } catch (e) {
            // Don't crash the whole search if HTML fallback fails
            console.log("HTML search fallback failed:", e);
          }
        }
        
        if (results.length === 0) {
          return JSON.stringify({
            query,
            results: [],
            message: "No results found for this search. The query may be too specific or the information may not be publicly indexed.",
          });
        }
        
        return JSON.stringify({ 
          query, 
          results: results.slice(0, 8),
          note: "Search completed. If these results don't contain the exact information needed, try reformulating the query."
        });
      } catch (error) {
        console.error("Web search error:", error);
        return JSON.stringify({ 
          query, 
          error: "Search failed. Please try again.",
          results: [] 
        });
      }
    }
    
    case "read_file": {
      const { file_path } = args as ReadFileArgs;
      
      const normalizedPath = path.normalize(file_path).replace(/^(\.\.(\/|\\|$))+/, '');
      const projectRoot = process.cwd();
      const fullPath = path.resolve(projectRoot, normalizedPath);
      
      if (!fullPath.startsWith(projectRoot)) {
        return JSON.stringify({ 
          error: "Access denied. Path traversal not allowed." 
        });
      }
      
      const relativePath = path.relative(projectRoot, fullPath);
      const allowedPrefixes = ["notes/", "notes\\", "data/", "data\\"];
      const allowedFiles = ["zeke_profile.md", "zeke_knowledge.md"];
      const isAllowed = allowedPrefixes.some(p => relativePath.startsWith(p)) || 
                        allowedFiles.includes(relativePath);
      
      if (!isAllowed) {
        return JSON.stringify({ 
          error: "Access denied. Can only read files in notes/, data/, or zeke config files." 
        });
      }
      
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        return JSON.stringify({ file_path: relativePath, content, size: content.length });
      } catch (error: any) {
        return JSON.stringify({ 
          error: error.code === "ENOENT" ? "File not found" : "Failed to read file" 
        });
      }
    }
    
    case "write_file": {
      const { file_path, content, append } = args as WriteFileArgs;
      
      const normalizedPath = path.normalize(file_path).replace(/^(\.\.(\/|\\|$))+/, '');
      const projectRoot = process.cwd();
      const fullPath = path.resolve(projectRoot, normalizedPath);
      
      if (!fullPath.startsWith(projectRoot)) {
        return JSON.stringify({ 
          error: "Access denied. Path traversal not allowed." 
        });
      }
      
      const relativePath = path.relative(projectRoot, fullPath);
      const allowedPrefixes = ["notes/", "notes\\", "data/", "data\\"];
      const isAllowed = allowedPrefixes.some(p => relativePath.startsWith(p));
      
      if (!isAllowed) {
        return JSON.stringify({ 
          error: "Access denied. Can only write files in notes/ or data/ directories." 
        });
      }
      
      try {
        const dir = path.dirname(fullPath);
        
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        if (append) {
          fs.appendFileSync(fullPath, content);
        } else {
          fs.writeFileSync(fullPath, content);
        }
        
        return JSON.stringify({ 
          success: true, 
          file_path: relativePath, 
          message: append ? "Content appended to file" : "File written successfully" 
        });
      } catch (error) {
        return JSON.stringify({ error: "Failed to write file" });
      }
    }
    
    case "list_files": {
      const { directory } = args as ListFilesArgs;
      
      const normalizedPath = path.normalize(directory).replace(/^(\.\.(\/|\\|$))+/, '');
      const projectRoot = process.cwd();
      const fullPath = path.resolve(projectRoot, normalizedPath);
      
      if (!fullPath.startsWith(projectRoot)) {
        return JSON.stringify({ 
          error: "Access denied. Path traversal not allowed." 
        });
      }
      
      const relativePath = path.relative(projectRoot, fullPath);
      const allowedDirs = ["notes", "data", ""];
      const allowedPrefixes = ["notes/", "notes\\", "data/", "data\\"];
      const isAllowed = allowedDirs.includes(relativePath) || 
                        allowedPrefixes.some(p => relativePath.startsWith(p));
      
      if (!isAllowed) {
        return JSON.stringify({ 
          error: "Access denied. Can only list files in notes/, data/, or root directory." 
        });
      }
      
      try {
        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        
        const allowedRootEntries = ["notes", "data", "zeke_profile.md", "zeke_knowledge.md"];
        
        const files = entries
          .filter(e => {
            if (e.name.startsWith(".") || e.name === "node_modules") return false;
            if (relativePath === "") {
              return allowedRootEntries.includes(e.name);
            }
            return true;
          })
          .map(e => ({
            name: e.name,
            type: e.isDirectory() ? "directory" : "file",
          }));
        
        return JSON.stringify({ directory: relativePath || ".", files });
      } catch (error) {
        return JSON.stringify({ error: "Directory not found or cannot be read" });
      }
    }
    
    case "get_current_time": {
      const now = new Date();
      return JSON.stringify({
        iso: now.toISOString(),
        local: now.toLocaleString("en-US", { 
          timeZone: "America/New_York",
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }),
        timezone: "America/New_York",
      });
    }
    
    case "add_grocery_item": {
      const { name, quantity, category, added_by } = args as {
        name: string;
        quantity?: string;
        category?: string;
        added_by?: string;
      };
      
      try {
        const item = createGroceryItem({
          name,
          quantity: quantity || "1",
          category: category || "Other",
          addedBy: added_by || "Nate",
        });
        
        return JSON.stringify({
          success: true,
          message: `Added "${name}" to the grocery list`,
          item: {
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            category: item.category,
            addedBy: item.addedBy,
          },
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: "Failed to add item to grocery list" });
      }
    }
    
    case "list_grocery_items": {
      try {
        const items = getAllGroceryItems();
        const toBuy = items.filter(i => !i.purchased);
        const purchased = items.filter(i => i.purchased);
        
        if (items.length === 0) {
          return JSON.stringify({
            message: "The grocery list is empty",
            to_buy: [],
            purchased: [],
          });
        }
        
        return JSON.stringify({
          to_buy: toBuy.map(i => ({
            id: i.id,
            name: i.name,
            quantity: i.quantity,
            category: i.category,
            addedBy: i.addedBy,
          })),
          purchased: purchased.map(i => ({
            id: i.id,
            name: i.name,
            quantity: i.quantity,
          })),
          summary: `${toBuy.length} item(s) to buy, ${purchased.length} already purchased`,
        });
      } catch (error) {
        return JSON.stringify({ error: "Failed to get grocery list" });
      }
    }
    
    case "mark_grocery_purchased": {
      const { item_name } = args as { item_name: string };
      
      try {
        const items = getAllGroceryItems();
        const searchLower = item_name.toLowerCase();
        const match = items.find(i => i.name.toLowerCase().includes(searchLower));
        
        if (!match) {
          return JSON.stringify({ 
            success: false, 
            error: `No item matching "${item_name}" found on the grocery list` 
          });
        }
        
        const updated = toggleGroceryItemPurchased(match.id);
        if (updated) {
          return JSON.stringify({
            success: true,
            message: updated.purchased 
              ? `Marked "${updated.name}" as purchased` 
              : `Marked "${updated.name}" as not purchased`,
            item: {
              name: updated.name,
              purchased: updated.purchased,
            },
          });
        }
        
        return JSON.stringify({ success: false, error: "Failed to update item" });
      } catch (error) {
        return JSON.stringify({ success: false, error: "Failed to update grocery item" });
      }
    }
    
    case "remove_grocery_item": {
      const { item_name } = args as { item_name: string };
      
      try {
        const items = getAllGroceryItems();
        const searchLower = item_name.toLowerCase();
        const match = items.find(i => i.name.toLowerCase().includes(searchLower));
        
        if (!match) {
          return JSON.stringify({ 
            success: false, 
            error: `No item matching "${item_name}" found on the grocery list` 
          });
        }
        
        const deleted = deleteGroceryItem(match.id);
        if (deleted) {
          return JSON.stringify({
            success: true,
            message: `Removed "${match.name}" from the grocery list`,
          });
        }
        
        return JSON.stringify({ success: false, error: "Failed to remove item" });
      } catch (error) {
        return JSON.stringify({ success: false, error: "Failed to remove grocery item" });
      }
    }
    
    case "clear_purchased_groceries": {
      try {
        const count = clearPurchasedGroceryItems();
        return JSON.stringify({
          success: true,
          message: count > 0 
            ? `Cleared ${count} purchased item(s) from the grocery list`
            : "No purchased items to clear",
          items_cleared: count,
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: "Failed to clear purchased items" });
      }
    }
    
    case "clear_all_groceries": {
      try {
        const count = clearAllGroceryItems();
        return JSON.stringify({
          success: true,
          message: count > 0 
            ? `Cleared all ${count} item(s) from the grocery list. List is now empty.`
            : "The grocery list was already empty",
          items_cleared: count,
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: "Failed to clear grocery list" });
      }
    }
    
    case "send_sms": {
      const { phone_number, message } = args as { phone_number: string; message: string };
      
      // Format phone number - add +1 if just 10 digits
      let formattedPhone = phone_number.replace(/[^0-9+]/g, "");
      if (formattedPhone.length === 10) {
        formattedPhone = "+1" + formattedPhone;
      } else if (!formattedPhone.startsWith("+")) {
        formattedPhone = "+" + formattedPhone;
      }
      
      if (!sendSmsCallback) {
        return JSON.stringify({ 
          success: false, 
          error: "SMS sending is not configured. Twilio credentials may be missing." 
        });
      }
      
      try {
        await sendSmsCallback(formattedPhone, message);
        return JSON.stringify({
          success: true,
          message: `SMS sent to ${formattedPhone}`,
          recipient: formattedPhone,
        });
      } catch (error: any) {
        console.error("Failed to send SMS:", error);
        return JSON.stringify({ 
          success: false, 
          error: error.message || "Failed to send SMS" 
        });
      }
    }
    
    case "configure_daily_checkin": {
      const { phone_number, time } = args as { phone_number: string; time?: string };
      
      // Format phone number
      let formattedPhone = phone_number.replace(/[^0-9+]/g, "");
      if (formattedPhone.length === 10) {
        formattedPhone = "+1" + formattedPhone;
      } else if (!formattedPhone.startsWith("+")) {
        formattedPhone = "+" + formattedPhone;
      }
      
      try {
        configureDailyCheckIn(formattedPhone, time || "09:00");
        const checkInTime = time || "09:00";
        const [h, m] = checkInTime.split(":").map(Number);
        const displayTime = new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { 
          hour: "numeric", 
          minute: "2-digit",
          hour12: true 
        });
        
        return JSON.stringify({
          success: true,
          message: `Daily check-in configured! I'll text you at ${displayTime} each day with 3 questions to learn more about you and your family.`,
          phone: formattedPhone,
          time: checkInTime,
        });
      } catch (error: any) {
        console.error("Failed to configure daily check-in:", error);
        return JSON.stringify({ 
          success: false, 
          error: error.message || "Failed to configure daily check-in" 
        });
      }
    }
    
    case "get_daily_checkin_status": {
      try {
        const status = getDailyCheckInStatus();
        if (!status.configured) {
          return JSON.stringify({
            configured: false,
            message: "Daily check-in is not configured yet.",
          });
        }
        
        const [h, m] = (status.time || "09:00").split(":").map(Number);
        const displayTime = new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { 
          hour: "numeric", 
          minute: "2-digit",
          hour12: true 
        });
        
        return JSON.stringify({
          configured: true,
          phone: status.phoneNumber,
          time: displayTime,
          message: `Daily check-in is active. Texting ${status.phoneNumber} at ${displayTime} each day.`,
        });
      } catch (error: any) {
        console.error("Failed to get check-in status:", error);
        return JSON.stringify({ success: false, error: "Failed to get status" });
      }
    }
    
    case "stop_daily_checkin": {
      try {
        stopDailyCheckIn();
        return JSON.stringify({
          success: true,
          message: "Daily check-in stopped. You won't receive daily questions anymore.",
        });
      } catch (error: any) {
        console.error("Failed to stop daily check-in:", error);
        return JSON.stringify({ success: false, error: "Failed to stop daily check-in" });
      }
    }
    
    case "send_checkin_now": {
      try {
        const sent = await sendDailyCheckIn();
        if (sent) {
          return JSON.stringify({
            success: true,
            message: "Check-in questions sent! Check your phone for 3 multiple choice questions.",
          });
        } else {
          const status = getDailyCheckInStatus();
          if (!status.configured) {
            return JSON.stringify({
              success: false,
              error: "Daily check-in is not configured. Please set it up first with your phone number.",
            });
          }
          return JSON.stringify({
            success: false,
            error: "Failed to send check-in. Make sure SMS is configured.",
          });
        }
      } catch (error: any) {
        console.error("Failed to send check-in now:", error);
        return JSON.stringify({ success: false, error: error.message || "Failed to send check-in" });
      }
    }
    
    case "add_task": {
      const { title, description, priority, due_date, category } = args as {
        title: string;
        description?: string;
        priority?: "low" | "medium" | "high";
        due_date?: string;
        category?: "work" | "personal" | "family";
      };
      
      try {
        const task = createTask({
          title,
          description: description || "",
          priority: priority || "medium",
          dueDate: due_date || null,
          category: category || "personal",
        });
        
        let message = `Added task: "${title}"`;
        if (due_date) {
          const dueStr = new Date(due_date).toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            timeZone: "America/New_York",
          });
          message += ` (due ${dueStr})`;
        }
        
        return JSON.stringify({
          success: true,
          message,
          task: {
            id: task.id,
            title: task.title,
            priority: task.priority,
            category: task.category,
            dueDate: task.dueDate,
          },
        });
      } catch (error) {
        console.error("Failed to add task:", error);
        return JSON.stringify({ success: false, error: "Failed to add task" });
      }
    }
    
    case "list_tasks": {
      const { include_completed, category, show_overdue, show_due_today } = args as {
        include_completed?: boolean;
        category?: "work" | "personal" | "family";
        show_overdue?: boolean;
        show_due_today?: boolean;
      };
      
      try {
        let tasks: Task[];
        
        if (show_overdue) {
          tasks = getOverdueTasks();
        } else if (show_due_today) {
          tasks = getTasksDueToday();
        } else if (category) {
          tasks = getAllTasks(include_completed || false).filter(t => t.category === category);
        } else {
          tasks = getAllTasks(include_completed || false);
        }
        
        if (tasks.length === 0) {
          let message = "No tasks found";
          if (show_overdue) message = "No overdue tasks";
          else if (show_due_today) message = "No tasks due today";
          else if (category) message = `No ${category} tasks`;
          
          return JSON.stringify({ tasks: [], message });
        }
        
        const pending = tasks.filter(t => !t.completed);
        const completed = tasks.filter(t => t.completed);
        
        const formatTask = (t: Task) => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          category: t.category,
          dueDate: t.dueDate,
          completed: t.completed,
        });
        
        return JSON.stringify({
          pending: pending.map(formatTask),
          completed: include_completed ? completed.map(formatTask) : undefined,
          summary: `${pending.length} pending task(s)${include_completed ? `, ${completed.length} completed` : ""}`,
        });
      } catch (error) {
        console.error("Failed to list tasks:", error);
        return JSON.stringify({ error: "Failed to list tasks" });
      }
    }
    
    case "update_task": {
      const { task_identifier, title, description, priority, due_date, category } = args as {
        task_identifier: string;
        title?: string;
        description?: string;
        priority?: "low" | "medium" | "high";
        due_date?: string | null;
        category?: "work" | "personal" | "family";
      };
      
      try {
        // Try to find task by ID first, then by partial title match
        let task = getTask(task_identifier);
        if (!task) {
          const allTasks = getAllTasks(true);
          const searchLower = task_identifier.toLowerCase();
          task = allTasks.find(t => t.title.toLowerCase().includes(searchLower));
        }
        
        if (!task) {
          return JSON.stringify({
            success: false,
            error: `No task matching "${task_identifier}" found`,
          });
        }
        
        const updated = updateTask(task.id, {
          title,
          description,
          priority,
          dueDate: due_date,
          category,
        });
        
        if (updated) {
          return JSON.stringify({
            success: true,
            message: `Updated task: "${updated.title}"`,
            task: {
              id: updated.id,
              title: updated.title,
              priority: updated.priority,
              category: updated.category,
              dueDate: updated.dueDate,
            },
          });
        }
        
        return JSON.stringify({ success: false, error: "Failed to update task" });
      } catch (error) {
        console.error("Failed to update task:", error);
        return JSON.stringify({ success: false, error: "Failed to update task" });
      }
    }
    
    case "complete_task": {
      const { task_identifier } = args as { task_identifier: string };
      
      try {
        // Try to find task by ID first, then by partial title match
        let task = getTask(task_identifier);
        if (!task) {
          const allTasks = getAllTasks(true);
          const searchLower = task_identifier.toLowerCase();
          task = allTasks.find(t => t.title.toLowerCase().includes(searchLower));
        }
        
        if (!task) {
          return JSON.stringify({
            success: false,
            error: `No task matching "${task_identifier}" found`,
          });
        }
        
        const updated = toggleTaskCompleted(task.id);
        if (updated) {
          return JSON.stringify({
            success: true,
            message: updated.completed 
              ? `Completed task: "${updated.title}"` 
              : `Marked "${updated.title}" as not completed`,
            task: {
              id: updated.id,
              title: updated.title,
              completed: updated.completed,
            },
          });
        }
        
        return JSON.stringify({ success: false, error: "Failed to update task" });
      } catch (error) {
        console.error("Failed to complete task:", error);
        return JSON.stringify({ success: false, error: "Failed to complete task" });
      }
    }
    
    case "delete_task": {
      const { task_identifier } = args as { task_identifier: string };
      
      try {
        // Try to find task by ID first, then by partial title match
        let task = getTask(task_identifier);
        if (!task) {
          const allTasks = getAllTasks(true);
          const searchLower = task_identifier.toLowerCase();
          task = allTasks.find(t => t.title.toLowerCase().includes(searchLower));
        }
        
        if (!task) {
          return JSON.stringify({
            success: false,
            error: `No task matching "${task_identifier}" found`,
          });
        }
        
        const deleted = deleteTask(task.id);
        if (deleted) {
          return JSON.stringify({
            success: true,
            message: `Deleted task: "${task.title}"`,
          });
        }
        
        return JSON.stringify({ success: false, error: "Failed to delete task" });
      } catch (error) {
        console.error("Failed to delete task:", error);
        return JSON.stringify({ success: false, error: "Failed to delete task" });
      }
    }
    
    case "clear_completed_tasks": {
      try {
        const count = clearCompletedTasks();
        return JSON.stringify({
          success: true,
          message: count > 0
            ? `Cleared ${count} completed task(s)`
            : "No completed tasks to clear",
          tasks_cleared: count,
        });
      } catch (error) {
        console.error("Failed to clear completed tasks:", error);
        return JSON.stringify({ success: false, error: "Failed to clear completed tasks" });
      }
    }
    
    case "get_calendar_events": {
      const { type, days, start_date, end_date } = args as {
        type?: "today" | "upcoming" | "range";
        days?: number;
        start_date?: string;
        end_date?: string;
      };
      
      try {
        let events: CalendarEvent[];
        
        if (type === "today") {
          events = await getTodaysEvents();
        } else if (type === "range" && start_date && end_date) {
          events = await listCalendarEvents(new Date(start_date), new Date(end_date));
        } else {
          events = await getUpcomingEvents(days || 7);
        }
        
        if (events.length === 0) {
          return JSON.stringify({
            events: [],
            message: type === "today" ? "No events scheduled for today" : "No upcoming events found",
          });
        }
        
        const formattedEvents = events.map(e => ({
          id: e.id,
          title: e.summary,
          start: e.start,
          end: e.end,
          location: e.location,
          allDay: e.allDay,
        }));
        
        return JSON.stringify({
          events: formattedEvents,
          count: events.length,
          summary: `Found ${events.length} event(s)`,
        });
      } catch (error: any) {
        console.error("Failed to get calendar events:", error);
        return JSON.stringify({ 
          success: false, 
          error: error.message || "Failed to get calendar events. Make sure Google Calendar is connected." 
        });
      }
    }
    
    case "create_calendar_event": {
      const { title, start_time, end_time, description, location, all_day } = args as {
        title: string;
        start_time: string;
        end_time?: string;
        description?: string;
        location?: string;
        all_day?: boolean;
      };
      
      try {
        const startDate = new Date(start_time);
        let endDate: Date;
        
        if (end_time) {
          endDate = new Date(end_time);
        } else if (all_day) {
          endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + 1);
        } else {
          endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour later
        }
        
        const event = await createCalendarEvent(
          title,
          startDate,
          endDate,
          description,
          location,
          all_day
        );
        
        const dateStr = new Date(event.start).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: "America/New_York",
        });
        
        const timeStr = event.allDay ? "all day" : new Date(event.start).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: "America/New_York",
        });
        
        return JSON.stringify({
          success: true,
          message: `Created event "${title}" for ${dateStr}${!event.allDay ? ` at ${timeStr}` : ""}`,
          event: {
            id: event.id,
            title: event.summary,
            start: event.start,
            end: event.end,
            location: event.location,
          },
        });
      } catch (error: any) {
        console.error("Failed to create calendar event:", error);
        return JSON.stringify({ 
          success: false, 
          error: error.message || "Failed to create calendar event" 
        });
      }
    }
    
    case "delete_calendar_event": {
      const { event_id } = args as { event_id: string };
      
      try {
        await deleteCalendarEvent(event_id);
        return JSON.stringify({
          success: true,
          message: "Event deleted from calendar",
        });
      } catch (error: any) {
        console.error("Failed to delete calendar event:", error);
        return JSON.stringify({ 
          success: false, 
          error: error.message || "Failed to delete calendar event" 
        });
      }
    }
    
    case "get_weather": {
      const { city, country, include_forecast, forecast_days } = args as {
        city?: string;
        country?: string;
        include_forecast?: boolean;
        forecast_days?: number;
      };
      
      try {
        const weather = await getCurrentWeather(city || "Boston", country || "US");
        
        const result: any = {
          current: weather,
          summary: `${weather.location}: ${weather.temperature}°F (feels like ${weather.feelsLike}°F), ${weather.description}`,
        };
        
        if (include_forecast) {
          const forecast = await getWeatherForecast(city || "Boston", country || "US", forecast_days || 5);
          result.forecast = forecast;
          result.forecast_summary = formatForecastForSms(forecast);
        }
        
        return JSON.stringify(result);
      } catch (error: any) {
        console.error("Failed to get weather:", error);
        return JSON.stringify({ 
          success: false, 
          error: error.message || "Failed to get weather. Make sure OpenWeatherMap API key is configured." 
        });
      }
    }
    
    case "get_morning_briefing": {
      const { send_sms, phone_number } = args as {
        send_sms?: boolean;
        phone_number?: string;
      };
      
      try {
        const briefingParts: string[] = [];
        const now = new Date();
        const dateStr = now.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          timeZone: "America/New_York",
        });
        
        briefingParts.push(`Good morning, Nate! Here's your briefing for ${dateStr}:`);
        
        // Weather
        try {
          const weather = await getCurrentWeather("Boston", "US");
          briefingParts.push(`\nWeather: ${weather.temperature}°F (feels like ${weather.feelsLike}°F), ${weather.description}. Sunrise ${weather.sunrise}, Sunset ${weather.sunset}.`);
        } catch (e) {
          briefingParts.push("\nWeather: Unable to fetch weather data.");
        }
        
        // Calendar events
        try {
          const events = await getTodaysEvents();
          if (events.length === 0) {
            briefingParts.push("\nCalendar: No events scheduled today.");
          } else {
            briefingParts.push(`\nCalendar (${events.length} event${events.length > 1 ? "s" : ""}):`);
            for (const event of events.slice(0, 5)) {
              if (event.allDay) {
                briefingParts.push(`  - ${event.summary} (all day)`);
              } else {
                const time = new Date(event.start).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                  timeZone: "America/New_York",
                });
                briefingParts.push(`  - ${time}: ${event.summary}${event.location ? ` @ ${event.location}` : ""}`);
              }
            }
            if (events.length > 5) {
              briefingParts.push(`  + ${events.length - 5} more event(s)`);
            }
          }
        } catch (e) {
          briefingParts.push("\nCalendar: Unable to fetch calendar events.");
        }
        
        // Tasks
        try {
          const tasks = getAllTasks(false);
          const overdueTasks = getOverdueTasks();
          const dueTodayTasks = getTasksDueToday();
          const highPriorityTasks = tasks.filter(t => t.priority === "high" && !t.completed);
          
          if (tasks.length === 0) {
            briefingParts.push("\nTasks: No pending tasks.");
          } else {
            briefingParts.push(`\nTasks (${tasks.length} pending):`);
            
            if (overdueTasks.length > 0) {
              briefingParts.push(`  OVERDUE: ${overdueTasks.map(t => t.title).join(", ")}`);
            }
            
            if (dueTodayTasks.length > 0) {
              briefingParts.push(`  Due today: ${dueTodayTasks.map(t => t.title).join(", ")}`);
            }
            
            if (highPriorityTasks.length > 0) {
              const nonOverdueHighPriority = highPriorityTasks.filter(t => 
                !overdueTasks.some(o => o.id === t.id) && 
                !dueTodayTasks.some(d => d.id === t.id)
              );
              if (nonOverdueHighPriority.length > 0) {
                briefingParts.push(`  High priority: ${nonOverdueHighPriority.map(t => t.title).join(", ")}`);
              }
            }
          }
        } catch (e) {
          briefingParts.push("\nTasks: Unable to fetch tasks.");
        }
        
        // Reminders
        try {
          const reminders = getPendingReminders();
          const todayReminders = reminders.filter(r => {
            const reminderDate = new Date(r.scheduledFor);
            return reminderDate.toDateString() === now.toDateString();
          });
          
          if (todayReminders.length > 0) {
            briefingParts.push(`\nReminders today (${todayReminders.length}):`);
            for (const r of todayReminders.slice(0, 3)) {
              const time = new Date(r.scheduledFor).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
                timeZone: "America/New_York",
              });
              briefingParts.push(`  - ${time}: ${r.message}`);
            }
          }
        } catch (e) {
          // Reminders are optional
        }
        
        briefingParts.push("\nHave a great day!");
        
        const briefing = briefingParts.join("\n");
        
        // Send SMS if requested
        if (send_sms && phone_number && sendSmsCallback) {
          let formattedPhone = phone_number.replace(/[^0-9+]/g, "");
          if (formattedPhone.length === 10) {
            formattedPhone = "+1" + formattedPhone;
          } else if (!formattedPhone.startsWith("+")) {
            formattedPhone = "+" + formattedPhone;
          }
          
          await sendSmsCallback(formattedPhone, briefing);
        }
        
        return JSON.stringify({
          success: true,
          briefing,
          sent_sms: send_sms && phone_number ? true : false,
        });
      } catch (error: any) {
        console.error("Failed to generate morning briefing:", error);
        return JSON.stringify({ 
          success: false, 
          error: error.message || "Failed to generate morning briefing" 
        });
      }
    }
    
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

export function getActiveReminders(): { id: string; message: string; scheduledFor: Date }[] {
  const pendingReminders = getPendingReminders();
  return pendingReminders.map(r => ({
    id: r.id,
    message: r.message,
    scheduledFor: new Date(r.scheduledFor),
  }));
}

export function restorePendingReminders(): number {
  const pendingReminders = getPendingReminders();
  let restoredCount = 0;
  
  for (const reminder of pendingReminders) {
    const scheduledTime = new Date(reminder.scheduledFor).getTime();
    const now = Date.now();
    const delay = scheduledTime - now;
    
    if (delay > 0) {
      const timeoutId = setTimeout(() => executeReminder(reminder.id), delay);
      activeTimeouts.set(reminder.id, timeoutId);
      restoredCount++;
      console.log(`Restored reminder ${reminder.id}: "${reminder.message}" scheduled for ${new Date(reminder.scheduledFor).toLocaleString("en-US", { timeZone: "America/New_York" })}`);
    } else {
      console.log(`Reminder ${reminder.id} is past due (scheduled for ${reminder.scheduledFor}), executing immediately`);
      executeReminder(reminder.id);
      restoredCount++;
    }
  }
  
  console.log(`Restored ${restoredCount} pending reminder(s) from database`);
  return restoredCount;
}

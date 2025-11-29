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
  deleteReminder as dbDeleteReminder
} from "./db";
import type { Reminder } from "@shared/schema";
import { 
  configureDailyCheckIn, 
  getDailyCheckInStatus, 
  stopDailyCheckIn, 
  sendDailyCheckIn,
  setDailyCheckInSmsCallback
} from "./dailyCheckIn";

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

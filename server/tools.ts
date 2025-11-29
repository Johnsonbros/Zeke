import fs from "fs";
import path from "path";
import type OpenAI from "openai";

interface Reminder {
  id: string;
  message: string;
  recipientPhone: string | null;
  conversationId: string | null;
  scheduledFor: Date;
  createdAt: Date;
  completed: boolean;
  timeoutId?: NodeJS.Timeout;
}

interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
}

const reminders: Map<string, Reminder> = new Map();

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
      description: "Search the web for information. Use this to look up current events, facts, or any information the user asks about.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query",
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

async function executeReminder(reminder: Reminder) {
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
    
    reminder.completed = true;
    reminders.delete(reminder.id);
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
      
      const reminder: Reminder = {
        id: generateId(),
        message,
        recipientPhone: recipient_phone || null,
        conversationId: conversationId || null,
        scheduledFor,
        createdAt: new Date(),
        completed: false,
      };
      
      const delay = scheduledFor.getTime() - Date.now();
      if (delay > 0) {
        const timeoutId = setTimeout(() => executeReminder(reminder), delay);
        reminder.timeoutId = timeoutId;
      }
      
      reminders.set(reminder.id, reminder);
      
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
      const pendingReminders = Array.from(reminders.values())
        .filter(r => !r.completed)
        .map(r => ({
          id: r.id,
          message: r.message,
          scheduled_for: r.scheduledFor.toLocaleString("en-US", { timeZone: "America/New_York" }),
          recipient: r.recipientPhone || "this conversation",
        }));
      
      if (pendingReminders.length === 0) {
        return JSON.stringify({ reminders: [], message: "No pending reminders" });
      }
      
      return JSON.stringify({ reminders: pendingReminders });
    }
    
    case "cancel_reminder": {
      const { reminder_id } = args as CancelReminderArgs;
      const reminder = reminders.get(reminder_id);
      
      if (!reminder) {
        return JSON.stringify({ success: false, error: "Reminder not found" });
      }
      
      if (reminder.timeoutId) {
        clearTimeout(reminder.timeoutId);
      }
      reminders.delete(reminder_id);
      
      return JSON.stringify({ success: true, message: `Reminder ${reminder_id} cancelled` });
    }
    
    case "web_search": {
      const { query } = args as WebSearchArgs;
      
      try {
        const response = await fetch(
          `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`
        );
        const data = await response.json();
        
        const results: WebSearchResult[] = [];
        
        if (data.AbstractText) {
          results.push({
            title: data.Heading || "Summary",
            snippet: data.AbstractText,
            url: data.AbstractURL || "",
          });
        }
        
        if (data.RelatedTopics) {
          for (const topic of data.RelatedTopics.slice(0, 5)) {
            if (topic.Text) {
              results.push({
                title: topic.Text.split(" - ")[0] || "Related",
                snippet: topic.Text,
                url: topic.FirstURL || "",
              });
            }
          }
        }
        
        if (results.length === 0) {
          return JSON.stringify({
            query,
            results: [],
            message: "No results found. Try a different search query.",
          });
        }
        
        return JSON.stringify({ query, results });
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
    
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

export function getActiveReminders(): Reminder[] {
  return Array.from(reminders.values()).filter(r => !r.completed);
}

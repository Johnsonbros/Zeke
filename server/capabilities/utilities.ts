import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";
import {
  getCurrentWeather,
  getWeatherForecast,
  formatForecastForSms,
} from "../weather";
import { getTodaysEvents } from "../googleCalendar";
import { 
  getAllTasks, 
  getTasksDueToday, 
  getOverdueTasks,
  getPendingReminders,
} from "../db";
import { resolvePendingMemory, getAllPendingMemories } from "../agent";

export const utilityToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
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
  {
    type: "function",
    function: {
      name: "resolve_memory_conflict",
      description: "Resolve a pending memory conflict when the user confirms or denies updating their memory. Use this when the user responds to a memory conflict question with 'yes', 'update', 'keep new', 'no', or 'keep old'.",
      parameters: {
        type: "object",
        properties: {
          conflict_id: {
            type: "string",
            description: "The ID of the pending memory conflict to resolve (from the conflict context).",
          },
          action: {
            type: "string",
            enum: ["confirm", "deny"],
            description: "The action to take: 'confirm' to update with new information, 'deny' to keep existing memory.",
          },
        },
        required: ["conflict_id", "action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_pending_memory_conflicts",
      description: "List all pending memory conflicts that are awaiting user confirmation.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

export const utilityToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  get_current_time: () => true,
  get_current_weather: () => true,
  get_weather_forecast: () => true,
  get_weather: () => true,
  get_morning_briefing: (p) => p.isAdmin,
  resolve_memory_conflict: (p) => p.isAdmin,
  list_pending_memory_conflicts: (p) => p.isAdmin,
};

interface ExecuteOptions {
  sendSmsCallback?: ((phone: string, message: string, source?: string) => Promise<void>) | null;
}

export async function executeUtilityTool(
  toolName: string,
  args: Record<string, unknown>,
  options: ExecuteOptions
): Promise<string | null> {
  const { sendSmsCallback } = options;

  switch (toolName) {
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
        
        try {
          const weather = await getCurrentWeather("Boston", "US");
          briefingParts.push(`\nWeather: ${weather.temperature}°F (feels like ${weather.feelsLike}°F), ${weather.description}. Sunrise ${weather.sunrise}, Sunset ${weather.sunset}.`);
        } catch (e) {
          briefingParts.push("\nWeather: Unable to fetch weather data.");
        }
        
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
        }
        
        briefingParts.push("\nHave a great day!");
        
        const briefing = briefingParts.join("\n");
        
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
    
    case "resolve_memory_conflict": {
      const { conflict_id, action } = args as {
        conflict_id: string;
        action: "confirm" | "deny";
      };
      
      if (!conflict_id || !action) {
        return JSON.stringify({
          success: false,
          error: "Missing conflict_id or action parameter",
        });
      }
      
      if (action !== "confirm" && action !== "deny") {
        return JSON.stringify({
          success: false,
          error: "Action must be 'confirm' or 'deny'",
        });
      }
      
      try {
        const result = await resolvePendingMemory(conflict_id, action);
        return JSON.stringify({
          success: result.success,
          message: result.message,
          action,
        });
      } catch (error: any) {
        console.error("Failed to resolve memory conflict:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to resolve memory conflict",
        });
      }
    }
    
    case "list_pending_memory_conflicts": {
      try {
        const pending = getAllPendingMemories();
        
        if (pending.length === 0) {
          return JSON.stringify({
            success: true,
            message: "No pending memory conflicts",
            conflicts: [],
          });
        }
        
        const conflicts = pending.map(p => ({
          id: p.id,
          newContent: p.content,
          existingContent: p.conflictResult.conflictingMemory?.content,
          conflictType: p.conflictResult.conflictType,
          similarity: p.conflictResult.similarity,
          createdAt: p.createdAt.toISOString(),
        }));
        
        return JSON.stringify({
          success: true,
          message: `Found ${pending.length} pending memory conflict(s)`,
          conflicts,
        });
      } catch (error: any) {
        console.error("Failed to list pending memory conflicts:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to list pending memory conflicts",
        });
      }
    }
    
    default:
      return null;
  }
}

export const utilityToolNames = [
  "get_current_time",
  "get_weather",
  "get_morning_briefing",
  "resolve_memory_conflict",
  "list_pending_memory_conflicts",
];

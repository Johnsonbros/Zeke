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
  getTasksDueTomorrow,
  getAllMemoryNotes,
} from "../db";
import { resolvePendingMemory, getAllPendingMemories } from "../agent";
import { getMorningBriefingEnhancement } from "../omi";
import { getUpcomingEvents } from "../googleCalendar";

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
      name: "get_evening_debrief",
      description: "Create a concise evening wrap-up with remaining tasks, overdue items, and reminders for tomorrow. Can optionally send a condensed SMS version.",
      parameters: {
        type: "object",
        properties: {
          send_sms: {
            type: "boolean",
            description: "Whether to send the debrief via SMS. Default is false.",
          },
          phone_number: {
            type: "string",
            description: "Phone number to send SMS to (required if send_sms is true).",
          },
          channel: {
            type: "string",
            enum: ["web", "sms"],
            description: "Channel to optimize the format for. Defaults to web.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weekly_planning",
      description: "Generate a 7-day planning brief with upcoming events, due tasks, and reminders so Nate can prioritize the week.",
      parameters: {
        type: "object",
        properties: {
          channel: {
            type: "string",
            enum: ["web", "sms"],
            description: "Channel to optimize the format for. Defaults to web.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_memory_spotlight",
      description: "Surface a handful of high-signal memories (family, work, routines) plus any pending memory conflicts that need confirmation.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of memories to include (default 5).",
          },
          channel: {
            type: "string",
            enum: ["web", "sms"],
            description: "Channel to optimize the format for. Defaults to web.",
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
  get_evening_debrief: (p) => p.isAdmin,
  get_weekly_planning: (p) => p.isAdmin,
  get_memory_spotlight: (p) => p.isAdmin,
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
      const { city, state, country, include_forecast, forecast_days } = args as {
        city?: string;
        state?: string;
        country?: string;
        include_forecast?: boolean;
        forecast_days?: number;
      };
      
      try {
        const weather = await getCurrentWeather(city || "Boston", state || "MA", country || "US");
        
        const result: any = {
          current: weather,
          summary: `${weather.location}: ${weather.temperature}°F (feels like ${weather.feelsLike}°F), ${weather.description}`,
        };
        
        if (include_forecast) {
          const forecast = await getWeatherForecast(city || "Boston", state || "MA", country || "US", forecast_days || 5);
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
          const weather = await getCurrentWeather("Boston", "MA", "US");
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
        
        // Add Omi conversation highlights from yesterday
        try {
          const omiData = await getMorningBriefingEnhancement();
          
          if (omiData.recentSummary) {
            briefingParts.push(`\nYesterday's Conversations:`);
            briefingParts.push(`  ${omiData.recentSummary.summaryTitle}`);
            
            // Add key highlights
            if (omiData.keyHighlights.length > 0) {
              briefingParts.push(`  Highlights: ${omiData.keyHighlights[0].split("] ")[1]?.substring(0, 150) || omiData.keyHighlights[0].substring(0, 150)}`);
            }
            
            // Add pending action items from conversations
            if (omiData.pendingActionItems.length > 0) {
              const topItems = omiData.pendingActionItems.slice(0, 3);
              briefingParts.push(`  Action items from conversations:`);
              for (const item of topItems) {
                briefingParts.push(`    ${item}`);
              }
            }
            
            // Add follow-up reminders
            if (omiData.upcomingFollowUps.length > 0) {
              briefingParts.push(`  Note: ${omiData.upcomingFollowUps[0]}`);
            }
          }
        } catch (e) {
          // Omi enhancement is optional, don't fail the briefing
          console.log("Omi enhancement unavailable:", e);
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

    case "get_evening_debrief": {
      const { send_sms, phone_number, channel } = args as {
        send_sms?: boolean;
        phone_number?: string;
        channel?: "web" | "sms";
      };

      try {
        const now = new Date();
        const dateStr = now.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          timeZone: "America/New_York",
        });

        const tasks = getAllTasks(false).filter(t => !t.completed);
        const overdueTasks = getOverdueTasks();
        const dueToday = getTasksDueToday();
        const dueTomorrow = getTasksDueTomorrow();
        const highPriority = tasks.filter(t => t.priority === "high");

        const reminders = getPendingReminders();
        const upcomingReminders = reminders.filter(r => {
          const reminderDate = new Date(r.scheduledFor);
          return reminderDate.getTime() - now.getTime() <= 36 * 60 * 60 * 1000 && reminderDate >= now;
        });

        const sections: string[] = [];
        sections.push(`Evening debrief for ${dateStr}`);

        if (overdueTasks.length > 0) {
          sections.push(`Overdue: ${formatList(overdueTasks.map(t => t.title), 5)}`);
        }

        if (dueToday.length > 0) {
          sections.push(`Still pending today: ${formatList(dueToday.map(t => t.title), 5)}`);
        }

        if (dueTomorrow.length > 0) {
          sections.push(`Tomorrow's priorities: ${formatList(dueTomorrow.map(t => t.title), 5)}`);
        }

        if (highPriority.length > 0 && sections.length < 6) {
          sections.push(`High priority backlog: ${formatList(highPriority.map(t => t.title), 5)}`);
        }

        if (upcomingReminders.length > 0) {
          const reminderLines = upcomingReminders.slice(0, 4).map(r => {
            const time = new Date(r.scheduledFor).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
              timeZone: "America/New_York",
            });
            return `${time}: ${r.message}`;
          });
          sections.push(`Reminders (next 36h):\n- ${reminderLines.join("\n- ")}`);
        }

        if (sections.length === 1) {
          sections.push("No tasks or reminders pending. Nice work today!");
        }

        const debrief = formatForChannel(sections, channel);

        if (send_sms && phone_number && sendSmsCallback) {
          let formattedPhone = phone_number.replace(/[^0-9+]/g, "");
          if (formattedPhone.length === 10) {
            formattedPhone = "+1" + formattedPhone;
          } else if (!formattedPhone.startsWith("+")) {
            formattedPhone = "+" + formattedPhone;
          }

          await sendSmsCallback(formattedPhone, debrief, "evening_debrief");
        }

        return JSON.stringify({
          success: true,
          debrief,
          sent_sms: Boolean(send_sms && phone_number),
        });
      } catch (error: any) {
        console.error("Failed to generate evening debrief:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to generate evening debrief",
        });
      }
    }

    case "get_weekly_planning": {
      const { channel } = args as { channel?: "web" | "sms" };

      try {
        const now = new Date();
        const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const events = await getUpcomingEvents(7);
        const tasks = getAllTasks(false).filter(t => !t.completed);
        const reminders = getPendingReminders();

        const dueThisWeek = tasks.filter(t => t.dueDate && isWithinRange(t.dueDate, now, weekEnd));
        const highPriorityBacklog = tasks
          .filter(t => t.priority === "high")
          .slice(0, 5);

        const remindersThisWeek = reminders.filter(r => isWithinRange(r.scheduledFor, now, weekEnd));

        const sections: string[] = [];
        sections.push(`Weekly game plan (${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })})`);

        if (events.length > 0) {
          const eventLines = events.slice(0, 8).map(ev => {
            const start = new Date(ev.start);
            const dayLabel = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
            if (ev.allDay) {
              return `${dayLabel}: ${ev.summary} (all day)`;
            }
            const time = start.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
              timeZone: "America/New_York",
            });
            return `${dayLabel} @ ${time}: ${ev.summary}`;
          });
          sections.push(`Events: \n- ${eventLines.join("\n- ")}`);
        } else {
          sections.push("Events: None scheduled");
        }

        if (dueThisWeek.length > 0) {
          sections.push(`Due this week: ${formatList(dueThisWeek.map(t => t.title), 6)}`);
        }

        if (highPriorityBacklog.length > 0) {
          sections.push(`High-priority backlog: ${formatList(highPriorityBacklog.map(t => t.title), 5)}`);
        }

        if (remindersThisWeek.length > 0) {
          const reminderLines = remindersThisWeek.slice(0, 5).map(r => {
            const date = new Date(r.scheduledFor);
            const when = `${date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York" })}`;
            return `${when}: ${r.message}`;
          });
          sections.push(`Reminders: \n- ${reminderLines.join("\n- ")}`);
        }

        const planning = formatForChannel(sections, channel);

        return JSON.stringify({
          success: true,
          planning,
          upcoming_events: events.length,
          tasks_due: dueThisWeek.length,
          reminders: remindersThisWeek.length,
        });
      } catch (error: any) {
        console.error("Failed to generate weekly planning:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to generate weekly planning",
        });
      }
    }

    case "get_memory_spotlight": {
      const { limit, channel } = args as { limit?: number; channel?: "web" | "sms" };

      try {
        const maxMemories = Math.max(1, Math.min(10, limit || 5));
        const memories = getAllMemoryNotes()
          .filter(m => !m.isSuperseded)
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          .slice(0, maxMemories);

        const pendingConflicts = getAllPendingMemories();

        const sections: string[] = [];
        sections.push(`Memory spotlight (${memories.length})`);

        if (memories.length > 0) {
          const memoryLines = memories.map(m => `- [${m.type}] ${m.content}`);
          sections.push(memoryLines.join("\n"));
        } else {
          sections.push("No stored memories yet.");
        }

        if (pendingConflicts.length > 0) {
          const conflictLines = pendingConflicts.slice(0, 3).map(c => `! Needs confirmation (${c.conflictResult.conflictType}): ${c.content}`);
          sections.push(`Pending memory confirmations:\n${conflictLines.join("\n")}`);
        }

        const spotlight = formatForChannel(sections, channel);

        return JSON.stringify({
          success: true,
          spotlight,
          pending_conflicts: pendingConflicts.length,
        });
      } catch (error: any) {
        console.error("Failed to generate memory spotlight:", error);
        return JSON.stringify({
          success: false,
          error: error.message || "Failed to generate memory spotlight",
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
  "get_evening_debrief",
  "get_weekly_planning",
  "get_memory_spotlight",
  "resolve_memory_conflict",
  "list_pending_memory_conflicts",
];

function formatList(items: string[], max: number): string {
  if (items.length <= max) return items.join(", ");
  const shown = items.slice(0, max);
  return `${shown.join(", ")} +${items.length - max} more`;
}

function formatForChannel(sections: string[], channel?: "web" | "sms"): string {
  const message = sections.filter(Boolean).join("\n\n");

  if (channel !== "sms") {
    return message;
  }

  const lines = message
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  const limit = 18;
  if (lines.length <= limit) return lines.join("\n");

  const trimmed = lines.slice(0, limit);
  trimmed.push(`…and ${lines.length - limit} more details. Ask for the full version on web.`);
  return trimmed.join("\n");
}

function isWithinRange(dateStr: string, start: Date, end: Date): boolean {
  const date = new Date(dateStr);
  return date >= start && date <= end;
}

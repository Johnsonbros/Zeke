import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";
import {
  listCalendarEvents,
  getTodaysEvents,
  getUpcomingEvents,
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
  type CalendarEvent,
} from "../googleCalendar";
import { trackAction, recordActionOutcome } from "../feedbackLearning";
import { getAllTasks, getTask } from "../db";
import { getSchedulingSuggestion } from "../predictiveTaskScheduler";

export const calendarToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
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
          recurrence_rule: {
            type: "string",
            description: "Optional recurrence rule (RFC 5545 RRULE, e.g. 'FREQ=WEEKLY;BYDAY=MO').",
          },
          attendees: {
            type: "array",
            description: "Optional list of attendee email addresses to invite.",
            items: { type: "string" },
          },
          create_conference_link: {
            type: "boolean",
            description: "Whether to create a video meeting link for the event.",
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
      name: "get_today_events",
      description: "Get all calendar events scheduled for today.",
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
      name: "get_upcoming_events",
      description: "Get upcoming calendar events for a specified number of days.",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "Number of days to look ahead. Default is 7.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_calendar_event",
      description: "Update an existing calendar event by its ID.",
      parameters: {
        type: "object",
        properties: {
          event_id: {
            type: "string",
            description: "The ID of the event to update (obtained from get_calendar_events).",
          },
          title: {
            type: "string",
            description: "New event title/summary.",
          },
          start_time: {
            type: "string",
            description: "New start time in ISO format (e.g., '2024-01-15T14:00:00').",
          },
          end_time: {
            type: "string",
            description: "New end time in ISO format.",
          },
          description: {
            type: "string",
            description: "New event description/notes.",
          },
          location: {
            type: "string",
            description: "New event location.",
          },
          recurrence_rule: {
            type: "string",
            description: "Updated recurrence rule (RFC 5545 RRULE, e.g. 'FREQ=MONTHLY;BYDAY=MO').",
          },
          attendees: {
            type: "array",
            description: "Replace attendees with these email addresses.",
            items: { type: "string" },
          },
          create_conference_link: {
            type: "boolean",
            description: "Create a new video meeting link if missing.",
          },
        },
        required: ["event_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sync_task_to_calendar",
      description: "Create or update a calendar event that corresponds to a task's due date and priority.",
      parameters: {
        type: "object",
        properties: {
          task_identifier: {
            type: "string",
            description: "Task ID or partial title to sync.",
          },
          duration_minutes: {
            type: "number",
            description: "Optional duration for the calendar slot (defaults to 60-90 minutes based on priority).",
          },
          attendees: {
            type: "array",
            description: "Attendee email addresses to invite when creating the event.",
            items: { type: "string" },
          },
          recurrence_rule: {
            type: "string",
            description: "Optional recurrence rule (RFC 5545 RRULE).",
          },
          description: {
            type: "string",
            description: "Additional context to include in the calendar event description.",
          },
          all_day: {
            type: "boolean",
            description: "Force an all-day event instead of a timed slot.",
          },
          start_time_override: {
            type: "string",
            description: "Override the start time instead of using the task due date/suggestion.",
          },
          create_conference_link: {
            type: "boolean",
            description: "Create a meeting link when inviting attendees.",
          },
        },
        required: ["task_identifier"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_meeting_invite",
      description: "Create a calendar event with attendees and an optional recurring rule (includes meet link support).",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Meeting title/summary.",
          },
          start_time: {
            type: "string",
            description: "Event start time in ISO format.",
          },
          end_time: {
            type: "string",
            description: "Event end time in ISO format. If omitted, defaults to 1 hour after start.",
          },
          attendees: {
            type: "array",
            description: "List of attendee email addresses to invite.",
            items: { type: "string" },
          },
          description: {
            type: "string",
            description: "Meeting description/agenda.",
          },
          location: {
            type: "string",
            description: "Meeting location.",
          },
          recurrence_rule: {
            type: "string",
            description: "Optional recurrence rule (RFC 5545 RRULE).",
          },
          create_conference_link: {
            type: "boolean",
            description: "Create a video conference link for the invite.",
          },
        },
        required: ["title", "start_time", "attendees"],
      },
    },
  },
];

export const calendarToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  get_calendar_events: (p) => p.canAccessCalendar,
  get_today_events: (p) => p.canAccessCalendar,
  get_upcoming_events: (p) => p.canAccessCalendar,
  create_calendar_event: (p) => p.canAccessCalendar,
  update_calendar_event: (p) => p.canAccessCalendar,
  delete_calendar_event: (p) => p.canAccessCalendar,
  sync_task_to_calendar: (p) => p.canAccessCalendar && p.canAccessTasks,
  send_meeting_invite: (p) => p.canAccessCalendar,
};

async function findTaskMatch(task_identifier: string) {
  let task = await getTask(task_identifier);
  if (!task) {
    const allTasks = await getAllTasks(true);
    const searchLower = task_identifier.toLowerCase();
    task = allTasks.find(t => t.title.toLowerCase().includes(searchLower));
  }
  return task;
}

function selectDefaultStartTime(baseDate: Date, priority?: string): Date {
  const start = new Date(baseDate);
  const defaultHour = priority === "high" ? 9 : priority === "low" ? 16 : 13;
  start.setHours(defaultHour, 0, 0, 0);
  return start;
}

export async function executeCalendarTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string | null> {
  switch (toolName) {
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
          const result = await listCalendarEvents(new Date(start_date), new Date(end_date));
          events = result.events;
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
      const { title, start_time, end_time, description, location, all_day, recurrence_rule, attendees, create_conference_link } = args as {
        title: string;
        start_time: string;
        end_time?: string;
        description?: string;
        location?: string;
        all_day?: boolean;
        recurrence_rule?: string;
        attendees?: string[];
        create_conference_link?: boolean;
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
          endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
        }
        
        const event = await createCalendarEvent(
          title,
          startDate,
          endDate,
          description,
          location,
          all_day,
          {
            recurrenceRule: recurrence_rule,
            attendees,
            createConferenceLink: create_conference_link,
          }
        );
        
        trackAction(
          "event_created",
          event.id,
          JSON.stringify({ title, start: event.start, end: event.end, location }),
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
            attendees: event.attendees,
            recurrence: event.recurrence,
            conferenceLink: event.conferenceLink,
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
        recordActionOutcome(event_id, "deleted");
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
    
    case "get_today_events": {
      try {
        const events = await getTodaysEvents();
        
        if (events.length === 0) {
          return JSON.stringify({
            events: [],
            message: "No events scheduled for today",
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
          summary: `Found ${events.length} event(s) for today`,
        });
      } catch (error: any) {
        console.error("Failed to get today's events:", error);
        return JSON.stringify({ 
          success: false, 
          error: error.message || "Failed to get today's events. Make sure Google Calendar is connected." 
        });
      }
    }
    
    case "get_upcoming_events": {
      const { days } = args as { days?: number };
      
      try {
        const lookAhead = days || 7;
        const events = await getUpcomingEvents(lookAhead);
        
        if (events.length === 0) {
          return JSON.stringify({
            events: [],
            message: `No upcoming events in the next ${lookAhead} days`,
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
          summary: `Found ${events.length} event(s) in the next ${lookAhead} days`,
        });
      } catch (error: any) {
        console.error("Failed to get upcoming events:", error);
        return JSON.stringify({ 
          success: false, 
          error: error.message || "Failed to get upcoming events. Make sure Google Calendar is connected." 
        });
      }
    }
    
    case "update_calendar_event": {
      const { event_id, title, start_time, end_time, description, location, recurrence_rule, attendees, create_conference_link } = args as {
        event_id: string;
        title?: string;
        start_time?: string;
        end_time?: string;
        description?: string;
        location?: string;
        recurrence_rule?: string;
        attendees?: string[];
        create_conference_link?: boolean;
      };
      
      try {
        const updates: {
          summary?: string;
          description?: string;
          location?: string;
          startTime?: Date;
          endTime?: Date;
        } = {};
        
        if (title) updates.summary = title;
        if (description !== undefined) updates.description = description;
        if (location !== undefined) updates.location = location;
        if (start_time) updates.startTime = new Date(start_time);
        if (end_time) updates.endTime = new Date(end_time);
        
        const event = await updateCalendarEvent(event_id, updates, 'primary', {
          recurrenceRule: recurrence_rule,
          attendees,
          createConferenceLink: create_conference_link,
        });
        
        return JSON.stringify({
          success: true,
          message: `Updated event "${event.summary}"`,
          event: {
            id: event.id,
            title: event.summary,
            start: event.start,
            end: event.end,
            location: event.location,
            attendees: event.attendees,
            recurrence: event.recurrence,
            conferenceLink: event.conferenceLink,
          },
        });
      } catch (error: any) {
        console.error("Failed to update calendar event:", error);
        return JSON.stringify({ 
          success: false, 
          error: error.message || "Failed to update calendar event" 
        });
      }
    }

    case "sync_task_to_calendar": {
      const { task_identifier, duration_minutes, attendees, recurrence_rule, description, all_day, start_time_override, create_conference_link } = args as {
        task_identifier: string;
        duration_minutes?: number;
        attendees?: string[];
        recurrence_rule?: string;
        description?: string;
        all_day?: boolean;
        start_time_override?: string;
        create_conference_link?: boolean;
      };

      try {
        const task = await findTaskMatch(task_identifier);

        if (!task) {
          return JSON.stringify({
            success: false,
            error: `No task matching "${task_identifier}" found`,
          });
        }

        const hasDueDate = Boolean(task.dueDate);
        const parsedDue = task.dueDate ? new Date(task.dueDate) : null;
        const useAllDay = all_day ?? (!start_time_override && task.dueDate ? !task.dueDate.includes("T") : false);

        let startTime: Date;
        if (start_time_override) {
          startTime = new Date(start_time_override);
        } else if (parsedDue) {
          startTime = task.dueDate?.includes("T") ? parsedDue : selectDefaultStartTime(parsedDue, task.priority);
        } else {
          const suggestion = await getSchedulingSuggestion(task.title, task.category, task.priority, task.description || undefined);
          startTime = new Date(`${suggestion.suggestedDate}T${suggestion.suggestedTime}`);
        }

        const effectiveDuration = duration_minutes || (task.priority === "high" ? 90 : task.priority === "low" ? 45 : 60);
        const endTime = useAllDay
          ? (() => {
              const end = new Date(startTime);
              end.setDate(end.getDate() + 1);
              return end;
            })()
          : new Date(startTime.getTime() + effectiveDuration * 60 * 1000);

        const windowStart = new Date(startTime);
        windowStart.setHours(0, 0, 0, 0);
        const windowEnd = new Date(startTime);
        windowEnd.setHours(23, 59, 59, 999);

        const existingEvents = await listCalendarEvents(windowStart, windowEnd, 50);
        const matchingEvent = existingEvents.events.find(ev =>
          ev.description?.includes(task.id) || ev.summary.toLowerCase().includes(task.title.toLowerCase())
        );

        const enrichedDescription = `Task ID: ${task.id}\nPriority: ${task.priority}\n${task.description || ""}${description ? `\nNotes: ${description}` : ""}`.trim();

        const recurrenceRules = recurrence_rule ? [recurrence_rule] : undefined;

        const event = matchingEvent
          ? await updateCalendarEvent(matchingEvent.id, {
              summary: task.title,
              description: enrichedDescription,
              startTime: useAllDay ? undefined : startTime,
              endTime: useAllDay ? undefined : endTime,
            }, matchingEvent.calendarId || "primary", {
              recurrenceRule: recurrenceRules,
              attendees,
              createConferenceLink: create_conference_link,
            })
          : await createCalendarEvent(
              task.title,
              startTime,
              endTime,
              enrichedDescription,
              undefined,
              useAllDay,
              {
                recurrenceRule: recurrenceRules,
                attendees,
                createConferenceLink: create_conference_link,
              }
            );

        const action = matchingEvent ? "Updated" : "Created";
        const timeLabel = event.allDay
          ? "all-day"
          : `${new Date(event.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;

        return JSON.stringify({
          success: true,
          message: `${action} calendar slot for task "${task.title}" (${hasDueDate ? "aligned to due date" : "suggested time"})`,
          event: {
            id: event.id,
            title: event.summary,
            start: event.start,
            end: event.end,
            location: event.location,
            attendees: event.attendees,
            recurrence: event.recurrence,
            conferenceLink: event.conferenceLink,
          },
          scheduled_time: event.start,
          time_display: timeLabel,
        });
      } catch (error: any) {
        console.error("Failed to sync task to calendar:", error);
        return JSON.stringify({ success: false, error: error.message || "Failed to sync task to calendar" });
      }
    }

    case "send_meeting_invite": {
      const { title, start_time, end_time, attendees, description, location, recurrence_rule, create_conference_link } = args as {
        title: string;
        start_time: string;
        end_time?: string;
        attendees: string[];
        description?: string;
        location?: string;
        recurrence_rule?: string;
        create_conference_link?: boolean;
      };

      try {
        const startDate = new Date(start_time);
        const endDate = end_time ? new Date(end_time) : new Date(startDate.getTime() + 60 * 60 * 1000);

        const event = await createCalendarEvent(
          title,
          startDate,
          endDate,
          description,
          location,
          false,
          {
            attendees,
            recurrenceRule: recurrence_rule,
            createConferenceLink: create_conference_link,
          }
        );

        return JSON.stringify({
          success: true,
          message: `Meeting invite sent for ${title}`,
          event: {
            id: event.id,
            title: event.summary,
            start: event.start,
            end: event.end,
            attendees: event.attendees,
            recurrence: event.recurrence,
            conferenceLink: event.conferenceLink,
          },
        });
      } catch (error: any) {
        console.error("Failed to send meeting invite:", error);
        return JSON.stringify({ success: false, error: error.message || "Failed to send meeting invite" });
      }
    }

    default:
      return null;
  }
}

export const calendarToolNames = [
  "get_calendar_events",
  "get_today_events",
  "get_upcoming_events",
  "create_calendar_event",
  "update_calendar_event",
  "delete_calendar_event",
  "sync_task_to_calendar",
  "send_meeting_invite",
];

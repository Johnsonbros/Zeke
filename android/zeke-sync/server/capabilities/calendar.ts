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
        },
        required: ["event_id"],
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
};

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
          endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
        }
        
        const event = await createCalendarEvent(
          title,
          startDate,
          endDate,
          description,
          location,
          all_day
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
      const { event_id, title, start_time, end_time, description, location } = args as {
        event_id: string;
        title?: string;
        start_time?: string;
        end_time?: string;
        description?: string;
        location?: string;
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
        
        const event = await updateCalendarEvent(event_id, updates);
        
        return JSON.stringify({
          success: true,
          message: `Updated event "${event.summary}"`,
          event: {
            id: event.id,
            title: event.summary,
            start: event.start,
            end: event.end,
            location: event.location,
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
];

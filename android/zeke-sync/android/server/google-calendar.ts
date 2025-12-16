// Google Calendar Integration via Replit Connector
import { google, calendar_v3 } from 'googleapis';

let connectionSettings: any;

async function getAccessToken(): Promise<string> {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-calendar',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Calendar not connected');
  }
  return accessToken;
}

async function getCalendarClient(): Promise<calendar_v3.Calendar> {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startTime: string;
  endTime: string;
  allDay: boolean;
  calendarId: string;
  calendarName: string;
  color: string;
}

export interface CalendarListItem {
  id: string;
  name: string;
  color: string;
  primary: boolean;
}

export async function getCalendarList(): Promise<CalendarListItem[]> {
  try {
    const calendar = await getCalendarClient();
    const response = await calendar.calendarList.list();
    
    const calendars: CalendarListItem[] = (response.data.items || []).map(cal => ({
      id: cal.id || '',
      name: cal.summary || 'Unnamed Calendar',
      color: cal.backgroundColor || '#4285F4',
      primary: cal.primary || false,
    }));
    
    return calendars;
  } catch (error) {
    console.error('[Google Calendar] Error fetching calendar list:', error);
    throw error;
  }
}

export async function getEvents(
  timeMin?: string,
  timeMax?: string,
  calendarId: string = 'primary',
  maxResults: number = 50
): Promise<CalendarEvent[]> {
  try {
    const calendar = await getCalendarClient();
    
    const calendars = await getCalendarList();
    const calendarInfo = calendars.find(c => c.id === calendarId) || 
      (calendarId === 'primary' ? calendars.find(c => c.primary) : null) ||
      { name: 'Primary', color: '#4285F4' };
    
    const now = new Date();
    const defaultTimeMin = timeMin || now.toISOString();
    const defaultTimeMax = timeMax || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const response = await calendar.events.list({
      calendarId,
      timeMin: defaultTimeMin,
      timeMax: defaultTimeMax,
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });
    
    const events: CalendarEvent[] = (response.data.items || []).map(event => {
      const startDateTime = event.start?.dateTime || event.start?.date || '';
      const endDateTime = event.end?.dateTime || event.end?.date || '';
      const isAllDay = !event.start?.dateTime;
      
      return {
        id: event.id || '',
        title: event.summary || 'Untitled Event',
        description: event.description || null,
        location: event.location || null,
        startTime: startDateTime,
        endTime: endDateTime,
        allDay: isAllDay,
        calendarId,
        calendarName: calendarInfo.name,
        color: event.colorId ? getEventColor(event.colorId) : calendarInfo.color,
      };
    });
    
    return events;
  } catch (error) {
    console.error('[Google Calendar] Error fetching events:', error);
    throw error;
  }
}

export async function getEventsFromAllCalendars(
  timeMin?: string,
  timeMax?: string,
  maxResults: number = 100
): Promise<CalendarEvent[]> {
  try {
    const calendars = await getCalendarList();
    const allEvents: CalendarEvent[] = [];
    
    for (const cal of calendars) {
      try {
        const calendar = await getCalendarClient();
        const now = new Date();
        const defaultTimeMin = timeMin || now.toISOString();
        const defaultTimeMax = timeMax || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
        
        const response = await calendar.events.list({
          calendarId: cal.id,
          timeMin: defaultTimeMin,
          timeMax: defaultTimeMax,
          maxResults: Math.floor(maxResults / calendars.length),
          singleEvents: true,
          orderBy: 'startTime',
        });
        
        const events = (response.data.items || []).map(event => {
          const startDateTime = event.start?.dateTime || event.start?.date || '';
          const endDateTime = event.end?.dateTime || event.end?.date || '';
          const isAllDay = !event.start?.dateTime;
          
          return {
            id: event.id || '',
            title: event.summary || 'Untitled Event',
            description: event.description || null,
            location: event.location || null,
            startTime: startDateTime,
            endTime: endDateTime,
            allDay: isAllDay,
            calendarId: cal.id,
            calendarName: cal.name,
            color: cal.color,
          };
        });
        
        allEvents.push(...events);
      } catch (err) {
        console.error(`[Google Calendar] Error fetching events from ${cal.name}:`, err);
      }
    }
    
    allEvents.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    
    return allEvents;
  } catch (error) {
    console.error('[Google Calendar] Error fetching events from all calendars:', error);
    throw error;
  }
}

export async function getTodayEvents(): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  
  return getEventsFromAllCalendars(startOfDay.toISOString(), endOfDay.toISOString());
}

export async function getUpcomingEvents(days: number = 7): Promise<CalendarEvent[]> {
  const now = new Date();
  const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  
  return getEventsFromAllCalendars(now.toISOString(), endDate.toISOString());
}

function getEventColor(colorId: string): string {
  const colors: Record<string, string> = {
    '1': '#7986CB',
    '2': '#33B679',
    '3': '#8E24AA',
    '4': '#E67C73',
    '5': '#F6BF26',
    '6': '#F4511E',
    '7': '#039BE5',
    '8': '#616161',
    '9': '#3F51B5',
    '10': '#0B8043',
    '11': '#D50000',
  };
  return colors[colorId] || '#4285F4';
}

const ZEKE_CALENDAR_NAME = 'ZEKE';
const ZEKE_CALENDAR_COLOR = '#8E24AA'; // Purple color for ZEKE calendar

export async function getOrCreateZekeCalendar(): Promise<CalendarListItem> {
  try {
    const calendars = await getCalendarList();
    const existingZeke = calendars.find(cal => cal.name === ZEKE_CALENDAR_NAME);
    
    if (existingZeke) {
      return {
        id: existingZeke.id,
        name: existingZeke.name,
        color: existingZeke.color || ZEKE_CALENDAR_COLOR,
        primary: existingZeke.primary,
      };
    }
    
    // Create new ZEKE calendar
    const calendar = await getCalendarClient();
    const response = await calendar.calendars.insert({
      requestBody: {
        summary: ZEKE_CALENDAR_NAME,
        description: 'ZEKE AI Assistant calendar for AI-generated events and reminders',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }
    });
    
    // Set the calendar color and get the updated calendar info
    let calendarColor = ZEKE_CALENDAR_COLOR;
    if (response.data.id) {
      const updateResponse = await calendar.calendarList.update({
        calendarId: response.data.id,
        requestBody: {
          backgroundColor: ZEKE_CALENDAR_COLOR,
          foregroundColor: '#FFFFFF',
        }
      });
      calendarColor = updateResponse.data.backgroundColor || ZEKE_CALENDAR_COLOR;
    }
    
    return {
      id: response.data.id || '',
      name: ZEKE_CALENDAR_NAME,
      color: calendarColor,
      primary: false,
    };
  } catch (error) {
    console.error('[Google Calendar] Error creating ZEKE calendar:', error);
    throw error;
  }
}

export interface CreateEventParams {
  title: string;
  startTime: string;
  endTime?: string;
  description?: string;
  location?: string;
  calendarId?: string;
}

export async function createEvent(params: CreateEventParams): Promise<CalendarEvent> {
  try {
    const calendar = await getCalendarClient();
    const targetCalendarId = params.calendarId || 'primary';
    
    const startDate = new Date(params.startTime);
    const endDate = params.endTime ? new Date(params.endTime) : new Date(startDate.getTime() + 60 * 60 * 1000); // Default 1 hour
    
    const response = await calendar.events.insert({
      calendarId: targetCalendarId,
      requestBody: {
        summary: params.title,
        description: params.description,
        location: params.location,
        start: {
          dateTime: startDate.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      },
    });
    
    // Get calendar info for the response
    const calendars = await getCalendarList();
    const calendarInfo = calendars.find(c => c.id === targetCalendarId) || { name: 'Unknown', color: '#4285F4' };
    
    return {
      id: response.data.id || '',
      title: response.data.summary || params.title,
      description: response.data.description || null,
      location: response.data.location || null,
      startTime: response.data.start?.dateTime || params.startTime,
      endTime: response.data.end?.dateTime || '',
      allDay: false,
      calendarId: targetCalendarId,
      calendarName: calendarInfo.name,
      color: calendarInfo.color,
    };
  } catch (error) {
    console.error('[Google Calendar] Error creating event:', error);
    throw error;
  }
}

export interface UpdateEventParams {
  title?: string;
  startTime?: string;
  endTime?: string;
  description?: string;
  location?: string;
}

export async function updateEvent(
  eventId: string,
  calendarId: string,
  params: UpdateEventParams
): Promise<CalendarEvent> {
  try {
    const calendar = await getCalendarClient();
    
    // First get the existing event
    const existing = await calendar.events.get({
      calendarId,
      eventId,
    });
    
    const requestBody: any = {
      summary: params.title ?? existing.data.summary,
      description: params.description ?? existing.data.description,
      location: params.location ?? existing.data.location,
    };
    
    if (params.startTime) {
      requestBody.start = {
        dateTime: new Date(params.startTime).toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    } else {
      requestBody.start = existing.data.start;
    }
    
    if (params.endTime) {
      requestBody.end = {
        dateTime: new Date(params.endTime).toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    } else {
      requestBody.end = existing.data.end;
    }
    
    const response = await calendar.events.update({
      calendarId,
      eventId,
      requestBody,
    });
    
    const calendars = await getCalendarList();
    const calendarInfo = calendars.find(c => c.id === calendarId) || { name: 'Unknown', color: '#4285F4' };
    
    return {
      id: response.data.id || eventId,
      title: response.data.summary || '',
      description: response.data.description || null,
      location: response.data.location || null,
      startTime: response.data.start?.dateTime || response.data.start?.date || '',
      endTime: response.data.end?.dateTime || response.data.end?.date || '',
      allDay: !response.data.start?.dateTime,
      calendarId,
      calendarName: calendarInfo.name,
      color: calendarInfo.color,
    };
  } catch (error) {
    console.error('[Google Calendar] Error updating event:', error);
    throw error;
  }
}

export async function deleteEvent(eventId: string, calendarId: string): Promise<void> {
  try {
    const calendar = await getCalendarClient();
    
    await calendar.events.delete({
      calendarId,
      eventId,
    });
    
    console.log(`[Google Calendar] Deleted event ${eventId} from calendar ${calendarId}`);
  } catch (error) {
    console.error('[Google Calendar] Error deleting event:', error);
    throw error;
  }
}

export async function findEventCalendarId(eventId: string): Promise<string | null> {
  try {
    const calendars = await getCalendarList();
    const calendar = await getCalendarClient();
    
    for (const cal of calendars) {
      try {
        await calendar.events.get({
          calendarId: cal.id,
          eventId,
        });
        return cal.id;
      } catch {
        // Event not in this calendar, continue
      }
    }
    
    return null;
  } catch (error) {
    console.error('[Google Calendar] Error finding event calendar:', error);
    return null;
  }
}

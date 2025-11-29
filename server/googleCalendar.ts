import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
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

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Calendar not connected');
  }
  return accessToken;
}

export async function getGoogleCalendarClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

export interface CalendarInfo {
  id: string;
  summary: string;
  backgroundColor: string;
  foregroundColor: string;
  primary?: boolean;
  selected?: boolean;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarId?: string;
  calendarName?: string;
  backgroundColor?: string;
}

export async function listCalendars(): Promise<CalendarInfo[]> {
  const calendar = await getGoogleCalendarClient();
  
  const response = await calendar.calendarList.list();
  const calendars = response.data.items || [];
  
  return calendars.map(cal => ({
    id: cal.id || '',
    summary: cal.summary || 'Untitled Calendar',
    backgroundColor: cal.backgroundColor || '#4285f4',
    foregroundColor: cal.foregroundColor || '#ffffff',
    primary: cal.primary || false,
    selected: cal.selected || false,
  }));
}

export interface CalendarFetchResult {
  events: CalendarEvent[];
  failedCalendars: { id: string; name: string; error: string }[];
}

export async function listCalendarEvents(
  timeMin?: Date, 
  timeMax?: Date, 
  maxResults: number = 10,
  calendarIds?: string[]
): Promise<CalendarFetchResult> {
  const calendar = await getGoogleCalendarClient();
  
  const now = new Date();
  const defaultTimeMin = timeMin || now;
  const defaultTimeMax = timeMax || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  const targetCalendarIds = calendarIds && calendarIds.length > 0 ? calendarIds : ['primary'];
  
  const calendarsInfo = await listCalendars();
  const calendarMap = new Map(calendarsInfo.map(c => [c.id, c]));
  
  const allEvents: CalendarEvent[] = [];
  const failedCalendars: { id: string; name: string; error: string }[] = [];
  
  for (const calendarId of targetCalendarIds) {
    try {
      const response = await calendar.events.list({
        calendarId,
        timeMin: defaultTimeMin.toISOString(),
        timeMax: defaultTimeMax.toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];
      const calInfo = calendarMap.get(calendarId);
      
      const mappedEvents = events.map(event => ({
        id: event.id || '',
        summary: event.summary || 'Untitled Event',
        description: event.description || undefined,
        location: event.location || undefined,
        start: event.start?.dateTime || event.start?.date || '',
        end: event.end?.dateTime || event.end?.date || '',
        allDay: !event.start?.dateTime,
        calendarId,
        calendarName: calInfo?.summary || calendarId,
        backgroundColor: calInfo?.backgroundColor || '#4285f4',
      }));
      
      allEvents.push(...mappedEvents);
    } catch (error: any) {
      const calInfo = calendarMap.get(calendarId);
      const errorMessage = error?.message || 'Unknown error';
      console.error(`Error fetching events from calendar ${calendarId}:`, errorMessage);
      failedCalendars.push({
        id: calendarId,
        name: calInfo?.summary || calendarId,
        error: errorMessage,
      });
    }
  }
  
  allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  
  return { events: allEvents, failedCalendars };
}

export async function getTodaysEvents(): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  
  const result = await listCalendarEvents(startOfDay, endOfDay, 50);
  return result.events;
}

export async function getUpcomingEvents(days: number = 7): Promise<CalendarEvent[]> {
  const now = new Date();
  const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  
  const result = await listCalendarEvents(now, endDate, 50);
  return result.events;
}

export async function createCalendarEvent(
  summary: string,
  startTime: Date,
  endTime: Date,
  description?: string,
  location?: string,
  allDay: boolean = false
): Promise<CalendarEvent> {
  const calendar = await getGoogleCalendarClient();
  
  const event: any = {
    summary,
    description,
    location,
  };
  
  if (allDay) {
    event.start = { date: startTime.toISOString().split('T')[0] };
    event.end = { date: endTime.toISOString().split('T')[0] };
  } else {
    event.start = { dateTime: startTime.toISOString(), timeZone: 'America/New_York' };
    event.end = { dateTime: endTime.toISOString(), timeZone: 'America/New_York' };
  }
  
  const response = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: event,
  });
  
  const created = response.data;
  return {
    id: created.id || '',
    summary: created.summary || summary,
    description: created.description || undefined,
    location: created.location || undefined,
    start: created.start?.dateTime || created.start?.date || '',
    end: created.end?.dateTime || created.end?.date || '',
    allDay: !created.start?.dateTime,
  };
}

export async function deleteCalendarEvent(eventId: string): Promise<boolean> {
  const calendar = await getGoogleCalendarClient();
  
  await calendar.events.delete({
    calendarId: 'primary',
    eventId,
  });
  
  return true;
}

export async function updateCalendarEvent(
  eventId: string,
  updates: {
    summary?: string;
    description?: string;
    location?: string;
    startTime?: Date;
    endTime?: Date;
  }
): Promise<CalendarEvent> {
  const calendar = await getGoogleCalendarClient();
  
  const existing = await calendar.events.get({
    calendarId: 'primary',
    eventId,
  });
  
  const event: any = {
    summary: updates.summary || existing.data.summary,
    description: updates.description !== undefined ? updates.description : existing.data.description,
    location: updates.location !== undefined ? updates.location : existing.data.location,
  };
  
  if (updates.startTime) {
    event.start = { dateTime: updates.startTime.toISOString(), timeZone: 'America/New_York' };
  } else {
    event.start = existing.data.start;
  }
  
  if (updates.endTime) {
    event.end = { dateTime: updates.endTime.toISOString(), timeZone: 'America/New_York' };
  } else {
    event.end = existing.data.end;
  }
  
  const response = await calendar.events.update({
    calendarId: 'primary',
    eventId,
    requestBody: event,
  });
  
  const updated = response.data;
  return {
    id: updated.id || '',
    summary: updated.summary || '',
    description: updated.description || undefined,
    location: updated.location || undefined,
    start: updated.start?.dateTime || updated.start?.date || '',
    end: updated.end?.dateTime || updated.end?.date || '',
    allDay: !updated.start?.dateTime,
  };
}

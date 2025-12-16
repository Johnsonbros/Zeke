import { getApiUrl, getLocalApiUrl, isZekeSyncMode, apiRequest } from "./query-client";

export interface ZekeConversation {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ZekeMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ZekeMemory {
  id: string;
  title: string;
  summary?: string;
  transcript: string;
  speakers?: any;
  actionItems?: string[];
  duration: number;
  isStarred: boolean;
  createdAt: string;
  updatedAt: string;
  deviceId?: string;
}

export interface ZekeDevice {
  id: string;
  name: string;
  type: string;
  macAddress?: string;
  batteryLevel?: number;
  isConnected: boolean;
  lastSyncAt?: string;
  createdAt: string;
}

export interface ZekeEvent {
  id: string;
  title: string;
  startTime: string;
  endTime?: string;
  location?: string;
  description?: string;
  calendarId?: string;
  calendarName?: string;
  color?: string;
  allDay?: boolean;
}

export interface ZekeCalendar {
  id: string;
  name: string;
  color: string;
  primary: boolean;
}

export interface ZekeTask {
  id: string;
  title: string;
  status: 'pending' | 'completed' | 'cancelled';
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string;
  createdAt: string;
}

export interface ZekeGroceryItem {
  id: string;
  name: string;
  quantity?: number;
  unit?: string;
  category?: string;
  isPurchased: boolean;
}

export interface ZekeContactConversation {
  id: string;
  title: string;
  phoneNumber?: string;
  source: 'sms' | 'app' | 'voice';
  mode: string;
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ZekeContact {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  phoneNumber?: string;
  email?: string;
  aiAssistantPhone?: string;
  imageUrl?: string;
  accessLevel: 'unknown' | 'acquaintance' | 'friend' | 'close_friend' | 'family';
  relationship?: string;
  notes?: string;
  canAccessPersonalInfo: boolean;
  canAccessCalendar: boolean;
  canAccessTasks: boolean;
  canAccessGrocery: boolean;
  canSetReminders: boolean;
  birthday?: string;
  occupation?: string;
  organization?: string;
  lastInteractionAt?: string;
  interactionCount: number;
  messageCount?: number;
  createdAt: string;
  updatedAt: string;
  conversations?: ZekeContactConversation[];
}

export interface DashboardSummary {
  eventsCount: number;
  pendingTasksCount: number;
  groceryItemsCount: number;
  memoriesCount: number;
  userName?: string;
}

export async function getConversations(): Promise<ZekeConversation[]> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/conversations', baseUrl);
  
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    if (res.status === 404) {
      return [];
    }
    throw new Error(`Failed to fetch conversations: ${res.statusText}`);
  }
  return res.json();
}

export async function createConversation(title?: string): Promise<ZekeConversation> {
  const res = await apiRequest('POST', '/api/conversations', { title: title || 'Chat with ZEKE' });
  return res.json();
}

export async function getConversationMessages(conversationId: string): Promise<ZekeMessage[]> {
  const baseUrl = getApiUrl();
  const url = new URL(`/api/conversations/${conversationId}/messages`, baseUrl);
  
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    if (res.status === 404) {
      return [];
    }
    throw new Error(`Failed to fetch messages: ${res.statusText}`);
  }
  return res.json();
}

export async function sendMessage(conversationId: string, content: string): Promise<{ userMessage: ZekeMessage; assistantMessage: ZekeMessage }> {
  const res = await apiRequest('POST', `/api/conversations/${conversationId}/messages`, { content });
  return res.json();
}

export async function chatWithZeke(message: string, phone?: string): Promise<{ response: string; conversationId?: string }> {
  const res = await apiRequest('POST', '/api/chat', { 
    message,
    phone: phone || 'mobile-app'
  });
  return res.json();
}

export async function getRecentMemories(limit: number = 10): Promise<ZekeMemory[]> {
  const baseUrl = getApiUrl();
  
  if (isZekeSyncMode()) {
    const url = new URL('/api/omi/memories', baseUrl);
    url.searchParams.set('limit', limit.toString());
    
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      if (res.status === 404) {
        return [];
      }
      throw new Error(`Failed to fetch memories: ${res.statusText}`);
    }
    const data = await res.json();
    return data.memories || data || [];
  } else {
    const url = new URL(`/api/memories?limit=${limit}`, baseUrl);
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      return [];
    }
    return res.json();
  }
}

export async function searchMemories(query: string): Promise<ZekeMemory[]> {
  try {
    if (isZekeSyncMode()) {
      const res = await apiRequest('POST', '/api/semantic-search', { query, limit: 20 });
      const data = await res.json();
      return data.results || [];
    } else {
      const res = await apiRequest('POST', '/api/memories/search', { query });
      const data = await res.json();
      return data.results || [];
    }
  } catch {
    return [];
  }
}

export async function getTasks(): Promise<any[]> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/tasks', baseUrl);
  
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    return [];
  }
  return res.json();
}

export async function getGroceryItems(): Promise<ZekeGroceryItem[]> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/grocery', baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.items || data || [];
  } catch {
    return [];
  }
}

export async function getReminders(): Promise<any[]> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/reminders', baseUrl);
  
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    return [];
  }
  return res.json();
}

export async function getContacts(): Promise<ZekeContact[]> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/contacts', baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.contacts || data || [];
  } catch {
    return [];
  }
}

export async function getContact(id: string): Promise<ZekeContact | null> {
  const baseUrl = getApiUrl();
  const url = new URL(`/api/contacts/${id}`, baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) {
      return null;
    }
    return res.json();
  } catch {
    return null;
  }
}

export async function createContact(data: Partial<ZekeContact>): Promise<ZekeContact> {
  const res = await apiRequest('POST', '/api/contacts', data);
  return res.json();
}

export async function updateContact(id: string, updates: Partial<ZekeContact>): Promise<ZekeContact> {
  const res = await apiRequest('PATCH', `/api/contacts/${id}`, updates);
  return res.json();
}

export async function deleteContact(id: string): Promise<void> {
  await apiRequest('DELETE', `/api/contacts/${id}`);
}

export async function getSmsConversations(): Promise<ZekeContactConversation[]> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/sms-log', baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.conversations || data || [];
  } catch {
    return [];
  }
}

export async function sendSms(to: string, message: string): Promise<{ sid: string; to: string; from: string; body: string; status: string }> {
  const res = await apiRequest('POST', '/api/twilio/sms/send', { to, body: message });
  return res.json();
}

export async function initiateCall(to: string): Promise<{ sid: string; to: string; from: string; status: string }> {
  const res = await apiRequest('POST', '/api/twilio/call/initiate', { to });
  return res.json();
}

export interface TwilioSmsConversation {
  phoneNumber: string;
  contactName: string | null;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  messages: TwilioSmsMessage[];
}

export interface TwilioSmsMessage {
  sid: string;
  to: string;
  from: string;
  body: string;
  status: string;
  direction: 'inbound' | 'outbound-api' | 'outbound-reply';
  dateSent: string | null;
  dateCreated: string;
}

export interface TwilioCallRecord {
  sid: string;
  to: string;
  from: string;
  status: string;
  direction: 'inbound' | 'outbound-api' | 'outbound-dial';
  duration: number;
  startTime: string | null;
  endTime: string | null;
  dateCreated: string;
}

export async function getTwilioConversations(): Promise<TwilioSmsConversation[]> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/twilio/sms/conversations', baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) {
      if (res.status === 404) {
        return [];
      }
      throw new Error(`Failed to fetch conversations: ${res.statusText}`);
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('[Twilio] Error fetching conversations:', error);
    return [];
  }
}

export async function getTwilioConversation(phoneNumber: string): Promise<TwilioSmsConversation | null> {
  const baseUrl = getApiUrl();
  const url = new URL(`/api/twilio/sms/conversation/${encodeURIComponent(phoneNumber)}`, baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) {
      if (res.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch conversation: ${res.statusText}`);
    }
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('[Twilio] Error fetching conversation:', error);
    return null;
  }
}

export async function getTwilioCalls(): Promise<TwilioCallRecord[]> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/twilio/calls', baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) {
      if (res.status === 404) {
        return [];
      }
      throw new Error(`Failed to fetch calls: ${res.statusText}`);
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('[Twilio] Error fetching calls:', error);
    return [];
  }
}

export async function getTwilioPhoneNumber(): Promise<string | null> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/twilio/phone-number', baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    return data.phoneNumber || null;
  } catch (error) {
    console.error('[Twilio] Error fetching phone number:', error);
    return null;
  }
}

export async function getHealthStatus(): Promise<{ status: string; connected: boolean }> {
  try {
    const baseUrl = getApiUrl();
    const url = new URL('/healthz', baseUrl);
    
    const res = await fetch(url, { 
      credentials: 'include',
      signal: AbortSignal.timeout(5000)
    });
    
    return { 
      status: res.ok ? 'healthy' : 'unhealthy', 
      connected: res.ok 
    };
  } catch {
    return { status: 'unreachable', connected: false };
  }
}

export async function getZekeDevices(): Promise<ZekeDevice[]> {
  try {
    const baseUrl = getApiUrl();
    
    if (isZekeSyncMode()) {
      const url = new URL('/api/omi/devices', baseUrl);
      
      const res = await fetch(url, { 
        credentials: 'include',
        signal: AbortSignal.timeout(5000)
      });
      
      if (!res.ok) {
        return getDefaultZekeDevices();
      }
      
      const data = await res.json();
      return data.devices || data || getDefaultZekeDevices();
    }
    
    return getDefaultZekeDevices();
  } catch {
    return getDefaultZekeDevices();
  }
}

function getDefaultZekeDevices(): ZekeDevice[] {
  return [
    {
      id: 'zeke-omi',
      name: 'ZEKE Omi',
      type: 'omi',
      isConnected: true,
      createdAt: new Date().toISOString(),
    }
  ];
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const baseUrl = getApiUrl();
  
  try {
    const url = new URL('/api/dashboard/summary', baseUrl);
    const res = await fetch(url, { 
      credentials: 'include',
      signal: AbortSignal.timeout(5000)
    });
    
    if (res.ok) {
      return res.json();
    }
  } catch {
  }
  
  const [events, tasks, grocery, memories] = await Promise.all([
    getTodayEvents(),
    getPendingTasks(),
    getGroceryItems(),
    getRecentMemories(100),
  ]);
  
  return {
    eventsCount: events.length,
    pendingTasksCount: tasks.length,
    groceryItemsCount: grocery.filter(g => !g.isPurchased).length,
    memoriesCount: memories.length,
  };
}

export async function getTodayEvents(): Promise<ZekeEvent[]> {
  // Always use local backend for Google Calendar integration
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/calendar/today', baseUrl);
  
  console.log('[Calendar] Fetching events from:', url.toString());
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      signal: AbortSignal.timeout(10000)
    });
    console.log('[Calendar] Response status:', res.status);
    if (!res.ok) {
      console.log('[Calendar] Response not OK');
      return [];
    }
    const data = await res.json();
    console.log('[Calendar] Fetched events count:', Array.isArray(data) ? data.length : (data.events?.length ?? 0));
    return data.events || data || [];
  } catch (error) {
    console.error('[Calendar] Fetch error:', error);
    return [];
  }
}

export async function getPendingTasks(): Promise<ZekeTask[]> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/tasks', baseUrl);
  url.searchParams.set('status', 'pending');
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return (data.tasks || data || []).filter((t: ZekeTask) => t.status === 'pending');
  } catch {
    return [];
  }
}

export async function addGroceryItem(
  name: string,
  quantity?: number,
  unit?: string,
  category?: string
): Promise<ZekeGroceryItem> {
  const res = await apiRequest('POST', '/api/grocery', { name, quantity, unit, category });
  return res.json();
}

export async function updateGroceryItem(
  id: string,
  updates: Partial<ZekeGroceryItem>
): Promise<ZekeGroceryItem> {
  const res = await apiRequest('PATCH', `/api/grocery/${id}`, updates);
  return res.json();
}

export async function deleteGroceryItem(id: string): Promise<void> {
  await apiRequest('DELETE', `/api/grocery/${id}`);
}

export async function toggleGroceryPurchased(
  id: string,
  purchased: boolean
): Promise<ZekeGroceryItem> {
  return updateGroceryItem(id, { isPurchased: purchased });
}

export async function getAllTasks(): Promise<ZekeTask[]> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/tasks', baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.tasks || data || [];
  } catch {
    return [];
  }
}

export async function createTask(
  title: string,
  dueDate?: string,
  priority?: string
): Promise<ZekeTask> {
  const res = await apiRequest('POST', '/api/tasks', { title, dueDate, priority });
  return res.json();
}

export async function updateTask(
  id: string,
  updates: Partial<ZekeTask>
): Promise<ZekeTask> {
  const res = await apiRequest('PATCH', `/api/tasks/${id}`, updates);
  return res.json();
}

export async function deleteTask(id: string): Promise<void> {
  await apiRequest('DELETE', `/api/tasks/${id}`);
}

export async function toggleTaskComplete(
  id: string,
  completed: boolean
): Promise<ZekeTask> {
  return updateTask(id, { status: completed ? 'completed' : 'pending' });
}

export async function createCalendarEvent(
  title: string,
  startTime: string,
  endTime?: string,
  location?: string,
  calendarId?: string,
  description?: string
): Promise<ZekeEvent> {
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/calendar/events', baseUrl);
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ title, startTime, endTime, location, calendarId, description }),
  });
  
  if (!res.ok) {
    throw new Error(`Failed to create event: ${res.statusText}`);
  }
  return res.json();
}

export async function updateCalendarEvent(
  eventId: string,
  updates: {
    title?: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    description?: string;
    calendarId?: string;
  }
): Promise<ZekeEvent> {
  const baseUrl = getLocalApiUrl();
  const url = new URL(`/api/calendar/events/${eventId}`, baseUrl);
  
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(updates),
  });
  
  if (!res.ok) {
    throw new Error(`Failed to update event: ${res.statusText}`);
  }
  return res.json();
}

export async function getUpcomingEvents(limit: number = 10): Promise<ZekeEvent[]> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/calendar/upcoming', baseUrl);
  url.searchParams.set('limit', limit.toString());
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.events || data || [];
  } catch {
    return [];
  }
}

export async function deleteCalendarEvent(id: string, calendarId?: string): Promise<void> {
  const baseUrl = getLocalApiUrl();
  const url = new URL(`/api/calendar/events/${id}`, baseUrl);
  if (calendarId) {
    url.searchParams.set('calendarId', calendarId);
  }
  
  const res = await fetch(url, {
    method: 'DELETE',
    credentials: 'include',
  });
  
  if (!res.ok) {
    throw new Error(`Failed to delete event: ${res.statusText}`);
  }
}

export async function getCalendarList(): Promise<ZekeCalendar[]> {
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/calendar/calendars', baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) {
      return [];
    }
    return res.json();
  } catch {
    return [];
  }
}

export async function getZekeCalendar(): Promise<ZekeCalendar | null> {
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/calendar/zeke', baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) {
      return null;
    }
    return res.json();
  } catch {
    return null;
  }
}

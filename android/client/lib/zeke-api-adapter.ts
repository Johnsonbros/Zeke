import { getApiUrl, getLocalApiUrl, isZekeSyncMode, apiRequest, getAuthHeaders } from "./query-client";
import type {
  Task,
  GroceryItem,
  CustomList,
  CustomListItem,
  CustomListWithItems,
  Contact,
  CalendarEvent,
  Message,
  Conversation,
  MemoryNote,
  AccessLevel,
} from "./zeke-types";

export type {
  Task,
  GroceryItem,
  CustomList,
  CustomListItem,
  CustomListWithItems,
  Contact,
  CalendarEvent,
  Message,
  Conversation,
  MemoryNote,
  AccessLevel,
} from "./zeke-types";

export { accessLevels, customListTypes, customListItemPriorities } from "./zeke-types";

function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

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

export type ZekeTask = Task & {
  status?: 'pending' | 'completed' | 'cancelled';
};

export type ZekeGroceryItem = GroceryItem & {
  isPurchased?: boolean;
  unit?: string;
};

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

export type ZekeContact = Contact & {
  messageCount?: number;
  conversations?: ZekeContactConversation[];
};

export interface DashboardSummary {
  eventsCount: number;
  pendingTasksCount: number;
  groceryItemsCount: number;
  memoriesCount: number;
  userName?: string;
}

export async function getConversations(): Promise<ZekeConversation[]> {
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/conversations', baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include', 
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(10000)
    });
    if (!res.ok) {
      if (res.status === 404) {
        return [];
      }
      throw new Error(`Failed to fetch conversations: ${res.statusText}`);
    }
    return res.json();
  } catch (error) {
    console.error('[ZEKE Chat] Failed to fetch conversations:', error);
    return [];
  }
}

export async function createConversation(title?: string): Promise<ZekeConversation> {
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/conversations', baseUrl);
  
  console.log('[ZEKE Chat] Creating conversation at:', url.toString());
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...getAuthHeaders() 
    },
    credentials: 'include',
    body: JSON.stringify({ title: title || 'Chat with ZEKE' }),
    signal: createTimeoutSignal(15000)
  });
  
  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    console.error('[ZEKE Chat] Create conversation failed:', res.status, errorText);
    throw new Error(`Failed to create conversation: ${res.status} ${errorText}`);
  }
  
  const contentType = res.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    console.error('[ZEKE Chat] Non-JSON response received when creating conversation');
    throw new Error('Server returned non-JSON response');
  }
  
  const data = await res.json();
  
  if (!data?.id || data.id === 'undefined' || data.id === 'null') {
    console.error('[ZEKE Chat] Invalid conversation ID in response:', data);
    throw new Error('Invalid conversation ID received from server');
  }
  
  console.log('[ZEKE Chat] Conversation created:', data.id);
  return data;
}

export async function getConversationMessages(conversationId: string): Promise<ZekeMessage[]> {
  if (!conversationId || conversationId === 'undefined' || conversationId === 'null') {
    console.error('[ZEKE Chat] Invalid conversation ID:', conversationId);
    return [];
  }
  
  const baseUrl = getLocalApiUrl();
  const url = new URL(`/api/conversations/${conversationId}/messages`, baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include', 
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(10000)
    });
    if (!res.ok) {
      if (res.status === 404) {
        return [];
      }
      throw new Error(`Failed to fetch messages: ${res.statusText}`);
    }
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.error('[ZEKE Chat] Non-JSON response received for messages');
      return [];
    }
    return res.json();
  } catch (error) {
    console.error('[ZEKE Chat] Failed to fetch messages:', error);
    return [];
  }
}

export async function sendMessage(conversationId: string, content: string): Promise<{ userMessage: ZekeMessage; assistantMessage: ZekeMessage }> {
  if (!conversationId || conversationId === 'undefined' || conversationId === 'null') {
    throw new Error('Invalid conversation ID');
  }
  
  const baseUrl = getLocalApiUrl();
  const url = new URL(`/api/conversations/${conversationId}/messages`, baseUrl);
  
  console.log('[ZEKE Chat] Sending message to:', url.toString());
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...getAuthHeaders() 
    },
    credentials: 'include',
    body: JSON.stringify({ content }),
    signal: createTimeoutSignal(30000)
  });
  
  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    console.error('[ZEKE Chat] Send message failed:', res.status, errorText);
    throw new Error(`Failed to send message: ${res.status} ${errorText}`);
  }
  
  const contentType = res.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Server returned non-JSON response');
  }
  
  return res.json();
}

export async function chatWithZeke(message: string, phone?: string): Promise<{ response: string; conversationId?: string }> {
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/zeke/chat', baseUrl);
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...getAuthHeaders() 
    },
    credentials: 'include',
    body: JSON.stringify({ message, phone: phone || 'mobile-app' }),
    signal: createTimeoutSignal(30000)
  });
  
  if (!res.ok) {
    throw new Error(`Failed to chat: ${res.statusText}`);
  }
  
  return res.json();
}

export async function getRecentMemories(limit: number = 10): Promise<ZekeMemory[]> {
  const baseUrl = getApiUrl();
  
  if (isZekeSyncMode()) {
    const url = new URL('/api/omi/memories', baseUrl);
    url.searchParams.set('limit', limit.toString());
    
    const res = await fetch(url, { credentials: 'include', headers: getAuthHeaders() });
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
    const res = await fetch(url, { credentials: 'include', headers: getAuthHeaders() });
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

export async function getTasks(): Promise<ZekeTask[]> {
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/zeke/tasks', baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(5000)
    });
    if (!res.ok) {
      console.log('[ZEKE Proxy] Tasks fetch failed:', res.status);
      return [];
    }
    const data = await res.json();
    console.log('[ZEKE Proxy] Tasks fetched:', data.tasks?.length || 0);
    return data.tasks || data || [];
  } catch (error) {
    console.error('[ZEKE Proxy] Tasks error:', error);
    return [];
  }
}

export async function getGroceryItems(): Promise<ZekeGroceryItem[]> {
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/zeke/grocery', baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(5000)
    });
    if (!res.ok) {
      console.log('[ZEKE Proxy] Grocery fetch failed:', res.status);
      return [];
    }
    const data = await res.json();
    console.log('[ZEKE Proxy] Grocery items fetched:', data.items?.length || 0);
    return data.items || data || [];
  } catch (error) {
    console.error('[ZEKE Proxy] Grocery error:', error);
    return [];
  }
}

export interface ZekeReminder {
  id: string;
  title: string;
  dueAt: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getReminders(): Promise<ZekeReminder[]> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/reminders', baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(5000)
    });
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.reminders || data || [];
  } catch {
    return [];
  }
}

export async function getContacts(): Promise<ZekeContact[]> {
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/zeke/contacts', baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(5000)
    });
    if (!res.ok) {
      console.log('[ZEKE Proxy] Contacts fetch failed:', res.status);
      return [];
    }
    const data = await res.json();
    console.log('[ZEKE Proxy] Contacts fetched:', data.contacts?.length || 0);
    return data.contacts || data || [];
  } catch (error) {
    console.error('[ZEKE Proxy] Contacts error:', error);
    return [];
  }
}

export async function getContact(id: string): Promise<ZekeContact | null> {
  const baseUrl = getLocalApiUrl();
  const url = new URL(`/api/zeke/contacts/${id}`, baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(5000)
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
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/zeke/contacts', baseUrl);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(`Failed to create contact: ${res.statusText}`);
  }
  return res.json();
}

export async function updateContact(id: string, updates: Partial<ZekeContact>): Promise<ZekeContact> {
  const baseUrl = getLocalApiUrl();
  const url = new URL(`/api/zeke/contacts/${id}`, baseUrl);
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    credentials: 'include',
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    throw new Error(`Failed to update contact: ${res.statusText}`);
  }
  return res.json();
}

export async function deleteContact(id: string): Promise<void> {
  const baseUrl = getLocalApiUrl();
  const url = new URL(`/api/zeke/contacts/${id}`, baseUrl);
  const res = await fetch(url, {
    method: 'DELETE',
    credentials: 'include',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to delete contact: ${res.statusText}`);
  }
}

export interface ImportContactData {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  email?: string;
  organization?: string;
  occupation?: string;
  notes?: string;
}

export interface ImportContactsResult {
  imported: number;
  failed: number;
  duplicates: number;
  errors: string[];
}

export async function importContacts(contacts: ImportContactData[]): Promise<ImportContactsResult> {
  const result: ImportContactsResult = {
    imported: 0,
    failed: 0,
    duplicates: 0,
    errors: [],
  };
  
  for (const contact of contacts) {
    try {
      await createContact(contact);
      result.imported++;
    } catch (error: any) {
      if (error.message?.includes('duplicate') || error.message?.includes('exists')) {
        result.duplicates++;
      } else {
        result.failed++;
        result.errors.push(`${contact.firstName || ''} ${contact.lastName || ''}: ${error.message}`);
      }
    }
  }
  
  return result;
}

export async function getSmsConversations(): Promise<ZekeContactConversation[]> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/sms-log', baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(5000)
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
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(10000)
    });
    if (!res.ok) {
      return [];
    }
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
}

export async function getTwilioConversation(phoneNumber: string): Promise<TwilioSmsConversation | null> {
  const baseUrl = getApiUrl();
  const url = new URL(`/api/twilio/sms/conversation/${encodeURIComponent(phoneNumber)}`, baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(10000)
    });
    if (!res.ok) {
      return null;
    }
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return null;
    }
    const data = await res.json();
    return data;
  } catch (error) {
    return null;
  }
}

export async function getTwilioCalls(): Promise<TwilioCallRecord[]> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/twilio/calls', baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(10000)
    });
    if (!res.ok) {
      return [];
    }
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
}

export async function getTwilioPhoneNumber(): Promise<string | null> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/twilio/phone-number', baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(5000)
    });
    if (!res.ok) {
      return null;
    }
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return null;
    }
    const data = await res.json();
    return data.phoneNumber || null;
  } catch (error) {
    return null;
  }
}

export async function getHealthStatus(): Promise<{ status: string; connected: boolean }> {
  try {
    const baseUrl = getApiUrl();
    const url = new URL('/healthz', baseUrl);
    
    const res = await fetch(url, { 
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(5000)
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
        headers: getAuthHeaders(),
        signal: createTimeoutSignal(5000)
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
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(5000)
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

export async function getEventsForDateRange(startDate: Date, endDate: Date): Promise<ZekeEvent[]> {
  const baseUrl = getLocalApiUrl();
  
  console.log('[Calendar] Fetching events for range:', startDate.toISOString(), 'to', endDate.toISOString());
  
  try {
    const url = new URL('/api/calendar/events', baseUrl);
    url.searchParams.set('timeMin', startDate.toISOString());
    url.searchParams.set('timeMax', endDate.toISOString());
    
    const res = await fetch(url, { 
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(10000)
    });
    console.log('[Calendar] Range response status:', res.status);
    if (!res.ok) {
      if (res.status === 503) {
        console.log('[Calendar] Local calendar not connected, trying ZEKE proxy');
        return getEventsFromZekeProxy(startDate, endDate);
      }
      console.log('[Calendar] Range response not OK, falling back to today events');
      return getTodayEvents();
    }
    const data = await res.json();
    console.log('[Calendar] Fetched range events count:', Array.isArray(data) ? data.length : (data.events?.length ?? 0));
    return data.events || data || [];
  } catch (error) {
    console.error('[Calendar] Range fetch error, trying ZEKE proxy:', error);
    return getEventsFromZekeProxy(startDate, endDate);
  }
}

async function getEventsFromZekeProxy(startDate: Date, endDate: Date): Promise<ZekeEvent[]> {
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/zeke/calendar/events', baseUrl);
  url.searchParams.set('timeMin', startDate.toISOString());
  url.searchParams.set('timeMax', endDate.toISOString());
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(10000)
    });
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.events || data || [];
  } catch (error) {
    console.error('[Calendar] ZEKE proxy fetch error:', error);
    return [];
  }
}

export async function getTodayEvents(): Promise<ZekeEvent[]> {
  const baseUrl = getLocalApiUrl();
  
  console.log('[Calendar] Fetching today events');
  
  try {
    const url = new URL('/api/calendar/today', baseUrl);
    
    console.log('[Calendar] Fetching events from:', url.toString());
    
    const res = await fetch(url, { 
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(10000)
    });
    console.log('[Calendar] Response status:', res.status);
    if (!res.ok) {
      if (res.status === 503) {
        console.log('[Calendar] Local calendar not connected, trying ZEKE proxy');
        return getTodayEventsFromZekeProxy();
      }
      console.log('[Calendar] Response not OK');
      return [];
    }
    const data = await res.json();
    console.log('[Calendar] Fetched events count:', Array.isArray(data) ? data.length : (data.events?.length ?? 0));
    return data.events || data || [];
  } catch (error) {
    console.error('[Calendar] Fetch error, trying ZEKE proxy:', error);
    return getTodayEventsFromZekeProxy();
  }
}

async function getTodayEventsFromZekeProxy(): Promise<ZekeEvent[]> {
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/zeke/calendar/today', baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(10000)
    });
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    console.log('[Calendar] ZEKE proxy fetched events count:', Array.isArray(data) ? data.length : (data.events?.length ?? 0));
    return data.events || data || [];
  } catch (error) {
    console.error('[Calendar] ZEKE proxy fetch error:', error);
    return [];
  }
}

export async function getPendingTasks(): Promise<ZekeTask[]> {
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/zeke/tasks', baseUrl);
  url.searchParams.set('status', 'pending');
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(5000)
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
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/zeke/grocery', baseUrl);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    credentials: 'include',
    body: JSON.stringify({ 
      name, 
      quantity: quantity !== undefined ? String(quantity) : "1", 
      unit: unit || "", 
      category: category || "General",
      addedBy: "mobile-app"
    }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to add grocery item: ${res.statusText}`);
  }
  return res.json();
}

export async function updateGroceryItem(
  id: string,
  updates: Partial<ZekeGroceryItem>
): Promise<ZekeGroceryItem> {
  const baseUrl = getLocalApiUrl();
  const url = new URL(`/api/zeke/grocery/${id}`, baseUrl);
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    credentials: 'include',
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    throw new Error(`Failed to update grocery item: ${res.statusText}`);
  }
  return res.json();
}

export async function deleteGroceryItem(id: string): Promise<void> {
  const baseUrl = getLocalApiUrl();
  const url = new URL(`/api/zeke/grocery/${id}`, baseUrl);
  const res = await fetch(url, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`Failed to delete grocery item: ${res.statusText}`);
  }
}

export async function toggleGroceryPurchased(
  id: string,
  purchased: boolean
): Promise<ZekeGroceryItem> {
  return updateGroceryItem(id, { isPurchased: purchased });
}

export async function getAllTasks(): Promise<ZekeTask[]> {
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/zeke/tasks', baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(5000)
    });
    if (!res.ok) {
      console.log('[ZEKE Proxy] getAllTasks failed:', res.status);
      return [];
    }
    const data = await res.json();
    console.log('[ZEKE Proxy] getAllTasks fetched:', data.tasks?.length || 0);
    return data.tasks || data || [];
  } catch (error) {
    console.error('[ZEKE Proxy] getAllTasks error:', error);
    return [];
  }
}

export async function createTask(
  title: string,
  dueDate?: string,
  priority?: string
): Promise<ZekeTask> {
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/zeke/tasks', baseUrl);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    credentials: 'include',
    body: JSON.stringify({ title, dueDate, priority }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create task: ${res.statusText}`);
  }
  return res.json();
}

export async function updateTask(
  id: string,
  updates: Partial<ZekeTask>
): Promise<ZekeTask> {
  const baseUrl = getLocalApiUrl();
  const url = new URL(`/api/zeke/tasks/${id}`, baseUrl);
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    credentials: 'include',
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    throw new Error(`Failed to update task: ${res.statusText}`);
  }
  return res.json();
}

export async function deleteTask(id: string): Promise<void> {
  const baseUrl = getLocalApiUrl();
  const url = new URL(`/api/zeke/tasks/${id}`, baseUrl);
  const res = await fetch(url, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`Failed to delete task: ${res.statusText}`);
  }
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
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    credentials: 'include',
    body: JSON.stringify(updates),
  });
  
  if (!res.ok) {
    throw new Error(`Failed to update event: ${res.statusText}`);
  }
  return res.json();
}

export async function getUpcomingEvents(limit: number = 10): Promise<ZekeEvent[]> {
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/calendar/upcoming', baseUrl);
  url.searchParams.set('limit', limit.toString());
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(5000)
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
    headers: getAuthHeaders(),
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
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(10000)
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
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(10000)
    });
    if (!res.ok) {
      return null;
    }
    return res.json();
  } catch {
    return null;
  }
}

export interface ActivityItem {
  id: string;
  action: string;
  timestamp: string;
  icon: 'message-circle' | 'mic' | 'check-square' | 'calendar' | 'shopping-cart' | 'user';
  rawDate: Date;
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  
  return date.toLocaleDateString();
}

export async function getRecentActivities(limit: number = 10): Promise<ActivityItem[]> {
  const activities: ActivityItem[] = [];
  
  try {
    const [memories, tasks, smsConversations, events] = await Promise.all([
      getRecentMemories(5).catch(() => []),
      getAllTasks().catch(() => []),
      getTwilioConversations().catch(() => []),
      getTodayEvents().catch(() => []),
    ]);
    
    for (const memory of memories) {
      const date = new Date(memory.createdAt);
      const durationMin = Math.round((memory.duration || 0) / 60);
      activities.push({
        id: `memory-${memory.id}`,
        action: durationMin > 0 
          ? `Recorded ${durationMin} min ${memory.title || 'audio'}` 
          : `Recorded: ${memory.title || 'audio memory'}`,
        timestamp: getRelativeTime(date),
        icon: 'mic',
        rawDate: date,
      });
    }
    
    const recentTasks = tasks
      .filter((t: ZekeTask) => t.status === 'completed' || t.createdAt)
      .slice(0, 5);
    
    for (const task of recentTasks) {
      const date = new Date(task.createdAt);
      const isCompleted = task.status === 'completed';
      activities.push({
        id: `task-${task.id}`,
        action: isCompleted 
          ? `Completed: ${task.title}` 
          : `Added task: ${task.title}`,
        timestamp: getRelativeTime(date),
        icon: 'check-square',
        rawDate: date,
      });
    }
    
    for (const convo of smsConversations.slice(0, 5)) {
      if (convo.messages && convo.messages.length > 0) {
        const lastMsg = convo.messages[convo.messages.length - 1];
        const date = new Date(lastMsg.dateCreated || lastMsg.dateSent || new Date());
        const isOutbound = lastMsg.direction?.includes('outbound');
        const contactName = convo.contactName || convo.phoneNumber || 'Unknown';
        
        activities.push({
          id: `sms-${lastMsg.sid || convo.phoneNumber}`,
          action: isOutbound 
            ? `Sent SMS to ${contactName}` 
            : `Received SMS from ${contactName}`,
          timestamp: getRelativeTime(date),
          icon: 'message-circle',
          rawDate: date,
        });
      }
    }
    
    for (const event of events.slice(0, 3)) {
      const date = new Date(event.startTime);
      activities.push({
        id: `event-${event.id}`,
        action: `Synced: ${event.title}`,
        timestamp: getRelativeTime(date),
        icon: 'calendar',
        rawDate: date,
      });
    }
    
    activities.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());
    
    return activities.slice(0, limit);
  } catch (error) {
    console.error('[Activities] Error fetching activities:', error);
    return [];
  }
}

export interface LocationSample {
  id: string;
  latitude: number;
  longitude: number;
  altitude?: number | null;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
  geocodedAddress?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  createdAt: string;
}

export interface StarredPlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  altitude?: number | null;
  geocodedAddress?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  icon?: string;
  createdAt: string;
}

export async function syncLocationSamples(samples: LocationSample[]): Promise<{ synced: number }> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/location/samples', baseUrl);
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify({ samples }),
      signal: createTimeoutSignal(10000),
    });
    
    if (!res.ok) {
      return { synced: 0 };
    }
    
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return { synced: 0 };
    }
    
    const data = await res.json();
    return { synced: data.synced || 0 };
  } catch {
    return { synced: 0 };
  }
}

export async function getLocationSamplesFromBackend(since?: string, limit?: number): Promise<LocationSample[]> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/location/samples', baseUrl);
  
  if (since) {
    url.searchParams.set('since', since);
  }
  if (limit) {
    url.searchParams.set('limit', limit.toString());
  }
  
  try {
    const res = await fetch(url, {
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(10000),
    });
    
    if (!res.ok) {
      return [];
    }
    
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return [];
    }
    
    const data = await res.json();
    return data.samples || data || [];
  } catch {
    return [];
  }
}

export async function syncStarredPlaces(places: StarredPlace[]): Promise<{ synced: number }> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/location/starred', baseUrl);
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify({ places }),
      signal: createTimeoutSignal(10000),
    });
    
    if (!res.ok) {
      return { synced: 0 };
    }
    
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return { synced: 0 };
    }
    
    const data = await res.json();
    return { synced: data.synced || 0 };
  } catch {
    return { synced: 0 };
  }
}

export async function getStarredPlacesFromBackend(): Promise<StarredPlace[]> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/location/starred', baseUrl);
  
  try {
    const res = await fetch(url, {
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(10000),
    });
    
    if (!res.ok) {
      return [];
    }
    
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return [];
    }
    
    const data = await res.json();
    return data.places || data || [];
  } catch {
    return [];
  }
}

export interface Geofence {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  listId?: string;
  triggerOn: 'enter' | 'exit' | 'both';
  isActive: boolean;
  actionType: 'notification' | 'grocery_prompt' | 'custom';
  actionData?: any;
  createdAt: string;
}

export interface LocationList {
  id: string;
  name: string;
  description?: string;
  defaultRadius: number;
  actionType: 'notification' | 'grocery_prompt' | 'custom';
  isActive: boolean;
  geofenceIds: string[];
  createdAt: string;
}

const GEOFENCE_STORAGE_KEY = '@zeke/geofences';
const LOCATION_LISTS_STORAGE_KEY = '@zeke/location_lists';

async function getAsyncStorage() {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  return AsyncStorage;
}

export async function getGeofences(): Promise<Geofence[]> {
  try {
    const AsyncStorage = await getAsyncStorage();
    const data = await AsyncStorage.getItem(GEOFENCE_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function saveGeofences(geofences: Geofence[]): Promise<void> {
  try {
    const AsyncStorage = await getAsyncStorage();
    await AsyncStorage.setItem(GEOFENCE_STORAGE_KEY, JSON.stringify(geofences));
  } catch (error) {
    console.error('Error saving geofences:', error);
  }
}

export async function addGeofence(geofence: Geofence): Promise<Geofence> {
  const geofences = await getGeofences();
  geofences.unshift(geofence);
  await saveGeofences(geofences);
  return geofence;
}

export async function updateGeofence(id: string, updates: Partial<Geofence>): Promise<Geofence | null> {
  const geofences = await getGeofences();
  const index = geofences.findIndex(g => g.id === id);
  if (index === -1) return null;
  
  geofences[index] = { ...geofences[index], ...updates };
  await saveGeofences(geofences);
  return geofences[index];
}

export async function deleteGeofence(id: string): Promise<void> {
  const geofences = await getGeofences();
  const filtered = geofences.filter(g => g.id !== id);
  await saveGeofences(filtered);
}

export async function getLocationLists(): Promise<LocationList[]> {
  try {
    const AsyncStorage = await getAsyncStorage();
    const data = await AsyncStorage.getItem(LOCATION_LISTS_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function saveLocationLists(lists: LocationList[]): Promise<void> {
  try {
    const AsyncStorage = await getAsyncStorage();
    await AsyncStorage.setItem(LOCATION_LISTS_STORAGE_KEY, JSON.stringify(lists));
  } catch (error) {
    console.error('Error saving location lists:', error);
  }
}

export async function addLocationList(list: LocationList): Promise<LocationList> {
  const lists = await getLocationLists();
  lists.unshift(list);
  await saveLocationLists(lists);
  return list;
}

export async function updateLocationList(id: string, updates: Partial<LocationList>): Promise<LocationList | null> {
  const lists = await getLocationLists();
  const index = lists.findIndex(l => l.id === id);
  if (index === -1) return null;
  
  lists[index] = { ...lists[index], ...updates };
  await saveLocationLists(lists);
  return lists[index];
}

export async function deleteLocationList(id: string): Promise<void> {
  const lists = await getLocationLists();
  const filtered = lists.filter(l => l.id !== id);
  await saveLocationLists(filtered);
}

export async function syncGeofencesToBackend(geofences: Geofence[]): Promise<{ synced: number }> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/geofences', baseUrl);
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify({ geofences }),
      signal: createTimeoutSignal(10000),
    });
    
    if (!res.ok) {
      return { synced: 0 };
    }
    
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return { synced: 0 };
    }
    
    const data = await res.json();
    return { synced: data.synced || 0 };
  } catch {
    return { synced: 0 };
  }
}

export async function getGeofencesFromBackend(): Promise<Geofence[]> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/geofences', baseUrl);
  
  try {
    const res = await fetch(url, {
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(10000),
    });
    
    if (!res.ok) {
      return [];
    }
    
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return [];
    }
    
    const data = await res.json();
    return data.geofences || data || [];
  } catch {
    return [];
  }
}

export interface GeofenceTriggerEvent {
  id: string;
  geofenceId: string;
  event: 'enter' | 'exit';
  timestamp: string;
  latitude: number;
  longitude: number;
  synced: boolean;
}

const GEOFENCE_EVENTS_STORAGE_KEY = '@zeke/geofence-events';

export async function saveGeofenceTriggerEvent(event: GeofenceTriggerEvent): Promise<void> {
  try {
    const AsyncStorage = await getAsyncStorage();
    const existing = await getGeofenceTriggerEvents();
    existing.unshift(event);
    const trimmed = existing.slice(0, 100);
    await AsyncStorage.setItem(GEOFENCE_EVENTS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error('Error saving geofence trigger event:', error);
  }
}

export async function getGeofenceTriggerEvents(): Promise<GeofenceTriggerEvent[]> {
  try {
    const AsyncStorage = await getAsyncStorage();
    const data = await AsyncStorage.getItem(GEOFENCE_EVENTS_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function markTriggerEventsSynced(eventIds: string[]): Promise<void> {
  try {
    const AsyncStorage = await getAsyncStorage();
    const events = await getGeofenceTriggerEvents();
    const updated = events.map(e => 
      eventIds.includes(e.id) ? { ...e, synced: true } : e
    );
    await AsyncStorage.setItem(GEOFENCE_EVENTS_STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Error marking events synced:', error);
  }
}

export async function syncTriggerEventsToBackend(): Promise<{ synced: number }> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/geofence-events', baseUrl);
  
  try {
    const events = await getGeofenceTriggerEvents();
    const unsyncedEvents = events.filter(e => !e.synced);
    
    if (unsyncedEvents.length === 0) {
      return { synced: 0 };
    }
    
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify({ events: unsyncedEvents }),
      signal: createTimeoutSignal(10000),
    });
    
    if (!res.ok) {
      return { synced: 0 };
    }
    
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return { synced: 0 };
    }
    
    const data = await res.json();
    const syncedCount = data.synced || unsyncedEvents.length;
    
    await markTriggerEventsSynced(unsyncedEvents.map(e => e.id));
    
    return { synced: syncedCount };
  } catch {
    return { synced: 0 };
  }
}

export async function clearGeofenceTriggerEvents(): Promise<void> {
  try {
    const AsyncStorage = await getAsyncStorage();
    await AsyncStorage.removeItem(GEOFENCE_EVENTS_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing geofence events:', error);
  }
}

export type ZekeList = CustomList & {
  description?: string;
  itemCount?: number;
};

export type ZekeListItem = CustomListItem & {
  text?: string;
  order?: number;
};

export type ZekeListWithItems = CustomListWithItems & {
  description?: string;
  itemCount?: number;
};

// Lists API functions
export async function getLists(): Promise<ZekeList[]> {
  const baseUrl = getApiUrl();
  const url = new URL('/api/lists', baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(5000)
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function getListWithItems(id: string): Promise<ZekeListWithItems | null> {
  const baseUrl = getApiUrl();
  const url = new URL(`/api/lists/${id}`, baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(5000)
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function createList(name: string, description?: string, color?: string): Promise<ZekeList> {
  const res = await apiRequest('POST', '/api/lists', { name, description, color });
  return res.json();
}

export async function updateList(id: string, updates: Partial<ZekeList>): Promise<ZekeList> {
  const res = await apiRequest('PATCH', `/api/lists/${id}`, updates);
  return res.json();
}

export async function deleteList(id: string): Promise<void> {
  await apiRequest('DELETE', `/api/lists/${id}`);
}

export async function addListItem(listId: string, text: string): Promise<ZekeListItem> {
  const res = await apiRequest('POST', `/api/lists/${listId}/items`, { text });
  return res.json();
}

export async function toggleListItem(listId: string, itemId: string): Promise<ZekeListItem> {
  const res = await apiRequest('POST', `/api/lists/${listId}/items/${itemId}/toggle`, {});
  return res.json();
}

export async function deleteListItem(listId: string, itemId: string): Promise<void> {
  await apiRequest('DELETE', `/api/lists/${listId}/items/${itemId}`);
}

export async function clearCheckedItems(listId: string): Promise<void> {
  await apiRequest('POST', `/api/lists/${listId}/clear-checked`, {});
}

export interface ZekeLocationUpdate {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  street?: string | null;
  postalCode?: string | null;
  formattedAddress?: string | null;
  recordedAt: string;
  label?: string;
}

export interface ZekeLocationSample {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  activity?: string | null;
  recordedAt: string;
}

export interface ZekeSavedPlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  formattedAddress?: string | null;
  category?: string | null;
  icon?: string | null;
  isStarred?: boolean;
  hasProximityAlert?: boolean;
  proximityRadiusMeters?: number | null;
  proximityAlertType?: string | null;
  createdAt: string;
}

export async function syncLocationToZeke(location: ZekeLocationUpdate): Promise<{ success: boolean; id?: string }> {
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/zeke/location/update', baseUrl);
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeaders() 
      },
      credentials: 'include',
      body: JSON.stringify(location),
      signal: createTimeoutSignal(10000),
    });
    
    if (!res.ok) {
      console.log('[ZEKE Location] Sync failed:', res.status);
      return { success: false };
    }
    
    const contentType = res.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      try {
        const text = await res.text();
        if (text && text.trim()) {
          const data = JSON.parse(text);
          console.log('[ZEKE Location] Location synced to Zeke backend');
          return { success: true, id: data.id };
        }
      } catch {
        // Ignore parse errors for empty responses
      }
    }
    
    console.log('[ZEKE Location] Location synced to Zeke backend');
    return { success: true };
  } catch (error) {
    console.error('[ZEKE Location] Sync error:', error);
    return { success: false };
  }
}

export async function syncLocationBatchToZeke(samples: ZekeLocationSample[]): Promise<{ success: boolean; synced: number }> {
  if (samples.length === 0) {
    return { success: true, synced: 0 };
  }
  
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/zeke/location/batch', baseUrl);
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeaders() 
      },
      credentials: 'include',
      body: JSON.stringify({ samples }),
      signal: createTimeoutSignal(15000),
    });
    
    if (!res.ok) {
      console.log('[ZEKE Location] Batch sync failed:', res.status);
      return { success: false, synced: 0 };
    }
    
    const contentType = res.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      try {
        const text = await res.text();
        if (text && text.trim()) {
          const data = JSON.parse(text);
          console.log('[ZEKE Location] Batch synced:', data.synced || samples.length, 'samples');
          return { success: true, synced: data.synced || samples.length };
        }
      } catch {
        // Ignore parse errors for empty responses
      }
    }
    
    console.log('[ZEKE Location] Batch synced:', samples.length, 'samples');
    return { success: true, synced: samples.length };
  } catch (error) {
    console.error('[ZEKE Location] Batch sync error:', error);
    return { success: false, synced: 0 };
  }
}

export async function getZekeCurrentLocation(): Promise<ZekeLocationUpdate | null> {
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/zeke/location/current', baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(5000)
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getZekeLocationHistory(options?: { 
  limit?: number; 
  startDate?: string; 
  endDate?: string 
}): Promise<ZekeLocationUpdate[]> {
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/zeke/location/history', baseUrl);
  
  if (options?.limit) url.searchParams.set('limit', options.limit.toString());
  if (options?.startDate) url.searchParams.set('startDate', options.startDate);
  if (options?.endDate) url.searchParams.set('endDate', options.endDate);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(5000)
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.locations || data || [];
  } catch {
    return [];
  }
}

export async function getZekeSavedPlaces(): Promise<ZekeSavedPlace[]> {
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/zeke/saved-places', baseUrl);
  
  try {
    const res = await fetch(url, { 
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: createTimeoutSignal(5000)
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.places || data || [];
  } catch {
    return [];
  }
}

export async function createZekeSavedPlace(place: Omit<ZekeSavedPlace, 'id' | 'createdAt'>): Promise<ZekeSavedPlace | null> {
  const baseUrl = getLocalApiUrl();
  const url = new URL('/api/zeke/saved-places', baseUrl);
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeaders() 
      },
      credentials: 'include',
      body: JSON.stringify(place),
      signal: createTimeoutSignal(10000),
    });
    
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function updateZekeSavedPlace(id: string, updates: Partial<ZekeSavedPlace>): Promise<ZekeSavedPlace | null> {
  const baseUrl = getLocalApiUrl();
  const url = new URL(`/api/zeke/saved-places/${id}`, baseUrl);
  
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeaders() 
      },
      credentials: 'include',
      body: JSON.stringify(updates),
      signal: createTimeoutSignal(10000),
    });
    
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function deleteZekeSavedPlace(id: string): Promise<boolean> {
  const baseUrl = getLocalApiUrl();
  const url = new URL(`/api/zeke/saved-places/${id}`, baseUrl);
  
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
      signal: createTimeoutSignal(10000),
    });
    
    return res.ok;
  } catch {
    return false;
  }
}

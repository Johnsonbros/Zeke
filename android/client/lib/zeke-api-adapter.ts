import { isZekeSyncMode } from "./query-client";
import { apiClient } from "./api-client";
import type {
  Task,
  GroceryItem,
  CustomList,
  CustomListItem,
  CustomListWithItems,
  Contact,
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

export {
  accessLevels,
  customListTypes,
  customListItemPriorities,
} from "./zeke-types";

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
  status?: "pending" | "completed" | "cancelled";
};

export type ZekeGroceryItem = GroceryItem & {
  isPurchased?: boolean;
  unit?: string;
};

export interface ZekeContactConversation {
  id: string;
  title: string;
  phoneNumber?: string;
  source: "sms" | "app" | "voice";
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
  try {
    // Retry, timeout, and 404 fallback now handled centrally by ZekeApiClient
    return await apiClient.get<ZekeConversation[]>("/api/conversations", {
      emptyArrayOn404: true,
    });
  } catch (error) {
    console.error("[ZEKE Chat] Failed to fetch conversations:", error);
    return [];
  }
}

export async function createConversation(
  title?: string,
): Promise<ZekeConversation> {
  console.log("[ZEKE Chat] Creating conversation...");

  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  const data = await apiClient.post<ZekeConversation>(
    "/api/conversations",
    {
      title: title || "Chat with ZEKE",
    },
    { timeoutMs: 15000 },
  );

  if (!data?.id || data.id === "undefined" || data.id === "null") {
    console.error("[ZEKE Chat] Invalid conversation ID in response:", data);
    throw new Error("Invalid conversation ID received from server");
  }

  console.log("[ZEKE Chat] Conversation created:", data.id);
  return data;
}

export async function getConversationMessages(
  conversationId: string,
): Promise<ZekeMessage[]> {
  if (
    !conversationId ||
    conversationId === "undefined" ||
    conversationId === "null"
  ) {
    console.error("[ZEKE Chat] Invalid conversation ID:", conversationId);
    return [];
  }

  try {
    // Retry, timeout, and 404 fallback now handled centrally by ZekeApiClient
    return await apiClient.get<ZekeMessage[]>(
      `/api/conversations/${conversationId}/messages`,
      { emptyArrayOn404: true },
    );
  } catch (error) {
    console.error("[ZEKE Chat] Failed to fetch messages:", error);
    return [];
  }
}

export async function sendMessage(
  conversationId: string,
  content: string,
): Promise<{ userMessage: ZekeMessage; assistantMessage: ZekeMessage }> {
  if (
    !conversationId ||
    conversationId === "undefined" ||
    conversationId === "null"
  ) {
    throw new Error("Invalid conversation ID");
  }

  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  return await apiClient.post<{
    userMessage: ZekeMessage;
    assistantMessage: ZekeMessage;
  }>(
    `/api/conversations/${conversationId}/messages`,
    { content },
    { timeoutMs: 30000 },
  );
}

export async function chatWithZeke(
  message: string,
  phone?: string,
): Promise<{ response: string; conversationId?: string }> {
  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  return await apiClient.post<{ response: string; conversationId?: string }>(
    "/api/zeke/chat",
    { message, phone: phone || "mobile-app" },
    { timeoutMs: 30000 },
  );
}


export async function getTasks(): Promise<ZekeTask[]> {
  try {
    // Retry, timeout, and 404 fallback now handled centrally by ZekeApiClient
    const data = await apiClient.get<{ tasks?: ZekeTask[] }>(
      "/api/zeke/tasks",
      { emptyArrayOn404: true },
    );
    console.log("[ZEKE Proxy] Tasks fetched:", data.tasks?.length || 0);
    return data.tasks || [];
  } catch (error) {
    console.error("[ZEKE Proxy] Tasks error:", error);
    return [];
  }
}

export async function getGroceryItems(): Promise<ZekeGroceryItem[]> {
  try {
    // Longer timeout for grocery - backend can be slow, but we have server-side caching now
    const data = await apiClient.get<{ items?: ZekeGroceryItem[]; source?: string }>(
      "/api/zeke/grocery",
      { emptyArrayOn404: true, timeoutMs: 30000 },
    );
    console.log("[ZEKE Proxy] Grocery items fetched:", data.items?.length || 0, "source:", data.source || "unknown");
    return data.items || [];
  } catch (error) {
    console.error("[ZEKE Proxy] Grocery error:", error);
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
  try {
    // Retry, timeout, and 404 fallback now handled centrally by ZekeApiClient
    const data = await apiClient.get<{ reminders?: ZekeReminder[] }>(
      "/api/reminders",
      { emptyArrayOn404: true },
    );
    return data.reminders || [];
  } catch (error) {
    console.error("[Reminders] Failed to fetch reminders:", error);
    return [];
  }
}

export async function getContacts(): Promise<ZekeContact[]> {
  try {
    // Retry, timeout, and 404 fallback now handled centrally by ZekeApiClient
    const data = await apiClient.get<{ contacts?: ZekeContact[] }>(
      "/api/zeke/contacts",
      { emptyArrayOn404: true },
    );
    console.log("[ZEKE Proxy] Contacts fetched:", data.contacts?.length || 0);
    return data.contacts || [];
  } catch (error) {
    console.error("[ZEKE Proxy] Contacts error:", error);
    return [];
  }
}

export async function getContact(id: string): Promise<ZekeContact | null> {
  try {
    // Retry and timeout now handled centrally by ZekeApiClient
    return await apiClient.get<ZekeContact>(`/api/zeke/contacts/${id}`);
  } catch (error) {
    console.error("[Contacts] Failed to fetch contact:", error);
    return null;
  }
}

export async function createContact(
  data: Partial<ZekeContact>,
): Promise<ZekeContact> {
  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  return await apiClient.post<ZekeContact>("/api/zeke/contacts", data);
}

export async function updateContact(
  id: string,
  updates: Partial<ZekeContact>,
): Promise<ZekeContact> {
  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  return await apiClient.patch<ZekeContact>(
    `/api/zeke/contacts/${id}`,
    updates,
  );
}

export async function deleteContact(id: string): Promise<void> {
  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  await apiClient.delete(`/api/zeke/contacts/${id}`);
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

export async function importContacts(
  contacts: ImportContactData[],
): Promise<ImportContactsResult> {
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
      if (
        error.message?.includes("duplicate") ||
        error.message?.includes("exists")
      ) {
        result.duplicates++;
      } else {
        result.failed++;
        result.errors.push(
          `${contact.firstName || ""} ${contact.lastName || ""}: ${error.message}`,
        );
      }
    }
  }

  return result;
}

export async function getSmsConversations(): Promise<
  ZekeContactConversation[]
> {
  try {
    // Retry, timeout, and 404 fallback now handled centrally by ZekeApiClient
    // Routes to local API via isLocalEndpoint() check
    const data = await apiClient.get<{
      conversations?: ZekeContactConversation[];
    }>("/api/sms-log", { emptyArrayOn404: true });
    return data.conversations || [];
  } catch (error) {
    console.error("[SMS] Failed to fetch SMS conversations:", error);
    return [];
  }
}

export async function sendSms(
  to: string,
  message: string,
): Promise<{
  sid: string;
  to: string;
  from: string;
  body: string;
  status: string;
}> {
  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  // Routes to local API via isLocalEndpoint() check
  return await apiClient.post<{
    sid: string;
    to: string;
    from: string;
    body: string;
    status: string;
  }>("/api/twilio/sms/send", { to, body: message });
}

export async function initiateCall(
  to: string,
): Promise<{ sid: string; to: string; from: string; status: string }> {
  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  // Routes to local API via isLocalEndpoint() check
  return await apiClient.post<{
    sid: string;
    to: string;
    from: string;
    status: string;
  }>("/api/twilio/call/initiate", { to });
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
  direction: "inbound" | "outbound-api" | "outbound-reply";
  dateSent: string | null;
  dateCreated: string;
}

export interface TwilioCallRecord {
  sid: string;
  to: string;
  from: string;
  status: string;
  direction: "inbound" | "outbound-api" | "outbound-dial";
  duration: number;
  startTime: string | null;
  endTime: string | null;
  dateCreated: string;
}

export async function getTwilioConversations(): Promise<
  TwilioSmsConversation[]
> {
  try {
    // Retry, timeout, and 404 fallback now handled centrally by ZekeApiClient
    // Routes to local API via isLocalEndpoint() check
    const data = await apiClient.get<TwilioSmsConversation[]>(
      "/api/twilio/sms/conversations",
      { emptyArrayOn404: true },
    );
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("[Twilio] Failed to fetch conversations:", error);
    return [];
  }
}

export async function getTwilioConversation(
  phoneNumber: string,
): Promise<TwilioSmsConversation | null> {
  try {
    // Retry and timeout now handled centrally by ZekeApiClient
    // Routes to local API via isLocalEndpoint() check
    return await apiClient.get<TwilioSmsConversation>(
      `/api/twilio/sms/conversation/${encodeURIComponent(phoneNumber)}`,
    );
  } catch (error) {
    console.error("[Twilio] Failed to fetch conversation:", error);
    return null;
  }
}

export async function getTwilioCalls(): Promise<TwilioCallRecord[]> {
  try {
    // Retry, timeout, and 404 fallback now handled centrally by ZekeApiClient
    // Routes to local API via isLocalEndpoint() check
    const data = await apiClient.get<TwilioCallRecord[]>("/api/twilio/calls", {
      emptyArrayOn404: true,
    });
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("[Twilio] Failed to fetch calls:", error);
    return [];
  }
}

export async function getTwilioPhoneNumber(): Promise<string | null> {
  try {
    // Retry and timeout now handled centrally by ZekeApiClient
    // Routes to local API via isLocalEndpoint() check
    const data = await apiClient.get<{ phoneNumber?: string }>(
      "/api/twilio/phone-number",
    );
    return data.phoneNumber || null;
  } catch (error) {
    console.error("[Twilio] Failed to fetch phone number:", error);
    return null;
  }
}

export async function getHealthStatus(): Promise<{
  status: string;
  connected: boolean;
}> {
  try {
    // Route through local proxy to avoid CORS/network issues on mobile
    await apiClient.get<any>("/api/zeke/health", { timeoutMs: 5000 });
    return { status: "healthy", connected: true };
  } catch {
    return { status: "unreachable", connected: false };
  }
}

export async function getZekeDevices(): Promise<ZekeDevice[]> {
  try {
    // Route through local proxy to avoid CORS/network issues on mobile
    const data = await apiClient.get<{ devices?: ZekeDevice[] }>(
      "/api/zeke/devices",
      { timeoutMs: 5000 },
    );
    return data.devices || getDefaultZekeDevices();
  } catch {
    return getDefaultZekeDevices();
  }
}

function getDefaultZekeDevices(): ZekeDevice[] {
  return [
    {
      id: "zeke-omi",
      name: "ZEKE Omi",
      type: "omi",
      isConnected: true,
      createdAt: new Date().toISOString(),
    },
  ];
}

export async function getRecentMemories(limit: number = 5): Promise<ZekeMemory[]> {
  try {
    const data = await apiClient.get<ZekeMemory[]>("/api/memories", {
      query: { limit: limit.toString() },
      timeoutMs: 5000,
    });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  try {
    // Route through local proxy to avoid CORS/network issues on mobile
    return await apiClient.get<DashboardSummary>("/api/zeke/dashboard", {
      timeoutMs: 5000,
    });
  } catch {}

  const [events, tasks, grocery] = await Promise.all([
    getTodayEvents(),
    getPendingTasks(),
    getGroceryItems(),
  ]);

  return {
    eventsCount: events.length,
    pendingTasksCount: tasks.length,
    groceryItemsCount: grocery.filter((g) => !g.isPurchased).length,
    memoriesCount: 0,
  };
}

export async function getEventsForDateRange(
  startDate: Date,
  endDate: Date,
): Promise<ZekeEvent[]> {
  console.log(
    "[Calendar] Fetching events for range:",
    startDate.toISOString(),
    "to",
    endDate.toISOString(),
  );

  try {
    // Retry and timeout now handled centrally by ZekeApiClient
    // Routes to local API via isLocalEndpoint() check
    const data = await apiClient.get<ZekeEvent[] | { events?: ZekeEvent[] }>(
      "/api/calendar/events",
      {
        query: {
          timeMin: startDate.toISOString(),
          timeMax: endDate.toISOString(),
        },
        timeoutMs: 10000,
      },
    );
    // Handle both array response (server returns events directly) and object response
    const events = Array.isArray(data) ? data : (data.events || []);
    console.log("[Calendar] Fetched range events count:", events.length);
    return events;
  } catch (error) {
    console.error("[Calendar] Range fetch error, trying ZEKE proxy:", error);
    return getEventsFromZekeProxy(startDate, endDate);
  }
}

async function getEventsFromZekeProxy(
  startDate: Date,
  endDate: Date,
): Promise<ZekeEvent[]> {
  try {
    // Retry and timeout now handled centrally by ZekeApiClient
    const data = await apiClient.get<ZekeEvent[] | { events?: ZekeEvent[] }>(
      "/api/zeke/calendar/events",
      {
        query: {
          timeMin: startDate.toISOString(),
          timeMax: endDate.toISOString(),
        },
        timeoutMs: 10000,
      },
    );
    // Handle both array response and object response
    return Array.isArray(data) ? data : (data.events || []);
  } catch (error) {
    console.error("[Calendar] ZEKE proxy fetch error:", error);
    return [];
  }
}

export async function getTodayEvents(): Promise<ZekeEvent[]> {
  console.log("[Calendar] Fetching today events");

  try {
    // Retry and timeout now handled centrally by ZekeApiClient
    // Routes to local API via isLocalEndpoint() check
    const data = await apiClient.get<ZekeEvent[] | { events?: ZekeEvent[] }>(
      "/api/calendar/today",
      { timeoutMs: 10000 },
    );
    // Handle both array response (server returns events directly) and object response
    const events = Array.isArray(data) ? data : (data.events || []);
    console.log("[Calendar] Fetched events count:", events.length);
    return events;
  } catch (error) {
    console.error("[Calendar] Fetch error, trying ZEKE proxy:", error);
    return getTodayEventsFromZekeProxy();
  }
}

async function getTodayEventsFromZekeProxy(): Promise<ZekeEvent[]> {
  try {
    // Retry and timeout now handled centrally by ZekeApiClient
    const data = await apiClient.get<ZekeEvent[] | { events?: ZekeEvent[] }>(
      "/api/zeke/calendar/today",
      { timeoutMs: 10000 },
    );
    // Handle both array response and object response
    const events = Array.isArray(data) ? data : (data.events || []);
    console.log("[Calendar] ZEKE proxy fetched events count:", events.length);
    return events;
  } catch (error) {
    console.error("[Calendar] ZEKE proxy fetch error:", error);
    return [];
  }
}

export async function getPendingTasks(): Promise<ZekeTask[]> {
  try {
    // Retry, timeout, and 404 fallback now handled centrally by ZekeApiClient
    // Routes to local API via isLocalEndpoint() check
    const data = await apiClient.get<{ tasks?: ZekeTask[] }>(
      "/api/zeke/tasks",
      { query: { status: "pending" }, emptyArrayOn404: true, timeoutMs: 5000 },
    );
    return (data.tasks || []).filter((t: ZekeTask) => t.status === "pending");
  } catch {
    return [];
  }
}

export async function addGroceryItem(
  name: string,
  quantity?: number,
  unit?: string,
  category?: string,
): Promise<ZekeGroceryItem> {
  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  return await apiClient.post<ZekeGroceryItem>("/api/zeke/grocery", {
    name,
    quantity: quantity !== undefined ? String(quantity) : "1",
    unit: unit || "",
    category: category || "General",
    addedBy: "mobile-app",
  });
}

export async function updateGroceryItem(
  id: string,
  updates: Partial<ZekeGroceryItem>,
): Promise<ZekeGroceryItem> {
  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  return await apiClient.patch<ZekeGroceryItem>(
    `/api/zeke/grocery/${id}`,
    updates,
  );
}

export async function deleteGroceryItem(id: string): Promise<void> {
  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  await apiClient.delete(`/api/zeke/grocery/${id}`);
}

export async function toggleGroceryPurchased(
  id: string,
  purchased: boolean,
): Promise<ZekeGroceryItem> {
  return updateGroceryItem(id, { isPurchased: purchased });
}

export async function getAllTasks(): Promise<ZekeTask[]> {
  try {
    // Retry, timeout, and 404 fallback now handled centrally by ZekeApiClient
    // Routes to local API via isLocalEndpoint() check
    const data = await apiClient.get<{ tasks?: ZekeTask[] }>(
      "/api/zeke/tasks",
      { emptyArrayOn404: true, timeoutMs: 5000 },
    );
    console.log("[ZEKE Proxy] getAllTasks fetched:", data.tasks?.length || 0);
    return data.tasks || [];
  } catch (error) {
    console.error("[ZEKE Proxy] getAllTasks error:", error);
    return [];
  }
}

export async function createTask(
  title: string,
  dueDate?: string,
  priority?: string,
): Promise<ZekeTask> {
  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  return await apiClient.post<ZekeTask>("/api/zeke/tasks", {
    title,
    dueDate,
    priority,
  });
}

export async function updateTask(
  id: string,
  updates: Partial<ZekeTask>,
): Promise<ZekeTask> {
  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  return await apiClient.patch<ZekeTask>(`/api/zeke/tasks/${id}`, updates);
}

export async function deleteTask(id: string): Promise<void> {
  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  await apiClient.delete(`/api/zeke/tasks/${id}`);
}

export async function toggleTaskComplete(
  id: string,
  completed: boolean,
): Promise<ZekeTask> {
  return updateTask(id, { status: completed ? "completed" : "pending" });
}

export async function createCalendarEvent(
  title: string,
  startTime: string,
  endTime?: string,
  location?: string,
  calendarId?: string,
  description?: string,
): Promise<ZekeEvent> {
  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  // Routes to local API via isLocalEndpoint() check
  return await apiClient.post<ZekeEvent>("/api/calendar/events", {
    title,
    startTime,
    endTime,
    location,
    calendarId,
    description,
  });
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
  },
): Promise<ZekeEvent> {
  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  // Routes to local API via isLocalEndpoint() check
  return await apiClient.patch<ZekeEvent>(
    `/api/calendar/events/${eventId}`,
    updates,
  );
}

export async function getUpcomingEvents(
  limit: number = 10,
): Promise<ZekeEvent[]> {
  try {
    // Retry, timeout, and 404 fallback now handled centrally by ZekeApiClient
    // Routes to local API via isLocalEndpoint() check
    const data = await apiClient.get<{ events?: ZekeEvent[] }>(
      "/api/calendar/upcoming",
      { query: { limit }, emptyArrayOn404: true },
    );
    return data.events || [];
  } catch (error) {
    console.error("[Calendar] Failed to fetch upcoming events:", error);
    return [];
  }
}

export async function deleteCalendarEvent(
  id: string,
  calendarId?: string,
): Promise<void> {
  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  // Routes to local API via isLocalEndpoint() check
  const endpoint = `/api/calendar/events/${id}`;
  await apiClient.delete(
    endpoint,
    calendarId ? { query: { calendarId } } : undefined,
  );
}

export async function getCalendarList(): Promise<ZekeCalendar[]> {
  try {
    // Retry, timeout, and 404 fallback now handled centrally by ZekeApiClient
    // Routes to local API via isLocalEndpoint() check
    return await apiClient.get<ZekeCalendar[]>("/api/calendar/calendars", {
      emptyArrayOn404: true,
      timeoutMs: 10000,
    });
  } catch (error) {
    console.error("[Calendar] Failed to fetch calendar list:", error);
    return [];
  }
}

export async function getZekeCalendar(): Promise<ZekeCalendar | null> {
  try {
    // Retry and timeout now handled centrally by ZekeApiClient
    // Routes to local API via isLocalEndpoint() check
    return await apiClient.get<ZekeCalendar>("/api/calendar/zeke", {
      timeoutMs: 10000,
    });
  } catch (error) {
    console.error("[Calendar] Failed to fetch ZEKE calendar:", error);
    return null;
  }
}

export interface CalendarConnectionStatus {
  connected: boolean;
  email?: string;
  authUrl?: string;
  error?: string;
}

export async function checkCalendarConnection(): Promise<CalendarConnectionStatus> {
  try {
    // /api/calendar/connection is a public route - doesn't require device token
    // Routes to local API via isLocalEndpoint() check
    return await apiClient.get<CalendarConnectionStatus>("/api/calendar/connection", {
      timeoutMs: 10000,
    });
  } catch (error) {
    console.error("[Calendar] Failed to check calendar connection:", error);
    return { connected: false, error: "Failed to check calendar connection" };
  }
}

export interface ActivityItem {
  id: string;
  action: string;
  timestamp: string;
  icon:
    | "message-circle"
    | "mic"
    | "check-square"
    | "calendar"
    | "shopping-cart"
    | "user";
  rawDate: Date;
  speakers?: string[];
  memoryId?: string;
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString();
}

export async function getRecentActivities(
  limit: number = 10,
): Promise<ActivityItem[]> {
  const activities: ActivityItem[] = [];

  try {
    const [tasks, smsConversations, events, memories] = await Promise.all([
      getAllTasks().catch(() => []),
      getTwilioConversations().catch(() => []),
      getTodayEvents().catch(() => []),
      getRecentMemories(5).catch(() => []),
    ]);

    for (const memory of memories.slice(0, 5)) {
      const date = new Date(memory.createdAt);
      // Handle both speaker object format {id, label, isUser} and plain string format
      const speakerList: string[] = Array.isArray(memory.speakers)
        ? memory.speakers.map((s: unknown) =>
            typeof s === 'string' ? s : (s as { label?: string }).label || 'Unknown'
          )
        : [];
      activities.push({
        id: `memory-${memory.id}`,
        action: `Recorded: ${memory.title || 'Voice memory'}`,
        timestamp: getRelativeTime(date),
        icon: "mic",
        rawDate: date,
        speakers: speakerList,
        memoryId: memory.id,
      });
    }

    const recentTasks = tasks
      .filter((t: ZekeTask) => t.status === "completed" || t.createdAt)
      .slice(0, 5);

    for (const task of recentTasks) {
      const date = new Date(task.createdAt);
      const isCompleted = task.status === "completed";
      activities.push({
        id: `task-${task.id}`,
        action: isCompleted
          ? `Completed: ${task.title}`
          : `Added task: ${task.title}`,
        timestamp: getRelativeTime(date),
        icon: "check-square",
        rawDate: date,
      });
    }

    for (const convo of smsConversations.slice(0, 5)) {
      if (convo.messages && convo.messages.length > 0) {
        const lastMsg = convo.messages[convo.messages.length - 1];
        const date = new Date(
          lastMsg.dateCreated || lastMsg.dateSent || new Date(),
        );
        const isOutbound = lastMsg.direction?.includes("outbound");
        const contactName = convo.contactName || convo.phoneNumber || "Unknown";

        activities.push({
          id: `sms-${lastMsg.sid || convo.phoneNumber}`,
          action: isOutbound
            ? `Sent SMS to ${contactName}`
            : `Received SMS from ${contactName}`,
          timestamp: getRelativeTime(date),
          icon: "message-circle",
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
        icon: "calendar",
        rawDate: date,
      });
    }

    activities.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());

    return activities.slice(0, limit);
  } catch (error) {
    console.error("[Activities] Error fetching activities:", error);
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

export async function syncLocationSamples(
  samples: LocationSample[],
): Promise<{ synced: number }> {
  try {
    // Retry, timeout, and auth now handled centrally by ZekeApiClient
    const data = await apiClient.post<{ synced?: number }>(
      "/api/location/samples",
      { samples },
      { timeoutMs: 10000 },
    );
    return { synced: data.synced || 0 };
  } catch {
    return { synced: 0 };
  }
}

export async function getLocationSamplesFromBackend(
  since?: string,
  limit?: number,
): Promise<LocationSample[]> {
  try {
    // Retry, timeout, and 404 fallback now handled centrally by ZekeApiClient
    const query: Record<string, string> = {};
    if (since) query.since = since;
    if (limit) query.limit = limit.toString();

    const data = await apiClient.get<{ samples?: LocationSample[] }>(
      "/api/location/samples",
      {
        query: Object.keys(query).length > 0 ? query : undefined,
        emptyArrayOn404: true,
        timeoutMs: 10000,
      },
    );
    return data.samples || [];
  } catch {
    return [];
  }
}

export async function syncStarredPlaces(
  places: StarredPlace[],
): Promise<{ synced: number }> {
  try {
    // Retry, timeout, and auth now handled centrally by ZekeApiClient
    const data = await apiClient.post<{ synced?: number }>(
      "/api/location/starred",
      { places },
      { timeoutMs: 10000 },
    );
    return { synced: data.synced || 0 };
  } catch {
    return { synced: 0 };
  }
}

export async function getStarredPlacesFromBackend(): Promise<StarredPlace[]> {
  try {
    // Retry, timeout, and 404 fallback now handled centrally by ZekeApiClient
    const data = await apiClient.get<{ places?: StarredPlace[] }>(
      "/api/location/starred",
      { emptyArrayOn404: true, timeoutMs: 10000 },
    );
    return data.places || [];
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
  triggerOn: "enter" | "exit" | "both";
  isActive: boolean;
  actionType: "notification" | "grocery_prompt" | "custom";
  actionData?: any;
  isHome?: boolean;
  createdAt: string;
}

export interface LocationList {
  id: string;
  name: string;
  description?: string;
  defaultRadius: number;
  actionType: "notification" | "grocery_prompt" | "custom";
  isActive: boolean;
  geofenceIds: string[];
  createdAt: string;
}

const GEOFENCE_STORAGE_KEY = "@zeke/geofences";
const LOCATION_LISTS_STORAGE_KEY = "@zeke/location_lists";

async function getAsyncStorage() {
  const AsyncStorage = (
    await import("@react-native-async-storage/async-storage")
  ).default;
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
    console.error("Error saving geofences:", error);
  }
}

export async function addGeofence(geofence: Geofence): Promise<Geofence> {
  const geofences = await getGeofences();
  geofences.unshift(geofence);
  await saveGeofences(geofences);
  return geofence;
}

export async function updateGeofence(
  id: string,
  updates: Partial<Geofence>,
): Promise<Geofence | null> {
  const geofences = await getGeofences();
  const index = geofences.findIndex((g) => g.id === id);
  if (index === -1) return null;

  geofences[index] = { ...geofences[index], ...updates };
  await saveGeofences(geofences);
  return geofences[index];
}

export async function deleteGeofence(id: string): Promise<void> {
  const geofences = await getGeofences();
  const filtered = geofences.filter((g) => g.id !== id);
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
    await AsyncStorage.setItem(
      LOCATION_LISTS_STORAGE_KEY,
      JSON.stringify(lists),
    );
  } catch (error) {
    console.error("Error saving location lists:", error);
  }
}

export async function addLocationList(
  list: LocationList,
): Promise<LocationList> {
  const lists = await getLocationLists();
  lists.unshift(list);
  await saveLocationLists(lists);
  return list;
}

export async function updateLocationList(
  id: string,
  updates: Partial<LocationList>,
): Promise<LocationList | null> {
  const lists = await getLocationLists();
  const index = lists.findIndex((l) => l.id === id);
  if (index === -1) return null;

  lists[index] = { ...lists[index], ...updates };
  await saveLocationLists(lists);
  return lists[index];
}

export async function deleteLocationList(id: string): Promise<void> {
  const lists = await getLocationLists();
  const filtered = lists.filter((l) => l.id !== id);
  await saveLocationLists(filtered);
}

export async function syncGeofencesToBackend(
  geofences: Geofence[],
): Promise<{ synced: number }> {
  try {
    // Retry, timeout, and auth now handled centrally by ZekeApiClient
    const data = await apiClient.post<{ synced?: number }>(
      "/api/geofences",
      { geofences },
      { timeoutMs: 10000 },
    );
    return { synced: data.synced || 0 };
  } catch {
    return { synced: 0 };
  }
}

export async function getGeofencesFromBackend(): Promise<Geofence[]> {
  try {
    // Retry, timeout, and 404 fallback now handled centrally by ZekeApiClient
    const data = await apiClient.get<{ geofences?: Geofence[] }>(
      "/api/geofences",
      { emptyArrayOn404: true, timeoutMs: 10000 },
    );
    return data.geofences || [];
  } catch {
    return [];
  }
}

export interface GeofenceTriggerEvent {
  id: string;
  geofenceId: string;
  event: "enter" | "exit";
  timestamp: string;
  latitude: number;
  longitude: number;
  synced: boolean;
}

const GEOFENCE_EVENTS_STORAGE_KEY = "@zeke/geofence-events";

export async function saveGeofenceTriggerEvent(
  event: GeofenceTriggerEvent,
): Promise<void> {
  try {
    const AsyncStorage = await getAsyncStorage();
    const existing = await getGeofenceTriggerEvents();
    existing.unshift(event);
    const trimmed = existing.slice(0, 100);
    await AsyncStorage.setItem(
      GEOFENCE_EVENTS_STORAGE_KEY,
      JSON.stringify(trimmed),
    );
  } catch (error) {
    console.error("Error saving geofence trigger event:", error);
  }
}

export async function getGeofenceTriggerEvents(): Promise<
  GeofenceTriggerEvent[]
> {
  try {
    const AsyncStorage = await getAsyncStorage();
    const data = await AsyncStorage.getItem(GEOFENCE_EVENTS_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function markTriggerEventsSynced(
  eventIds: string[],
): Promise<void> {
  try {
    const AsyncStorage = await getAsyncStorage();
    const events = await getGeofenceTriggerEvents();
    const updated = events.map((e) =>
      eventIds.includes(e.id) ? { ...e, synced: true } : e,
    );
    await AsyncStorage.setItem(
      GEOFENCE_EVENTS_STORAGE_KEY,
      JSON.stringify(updated),
    );
  } catch (error) {
    console.error("Error marking events synced:", error);
  }
}

export async function syncTriggerEventsToBackend(): Promise<{
  synced: number;
}> {
  try {
    const events = await getGeofenceTriggerEvents();
    const unsyncedEvents = events.filter((e) => !e.synced);

    if (unsyncedEvents.length === 0) {
      return { synced: 0 };
    }

    // Retry, timeout, and auth now handled centrally by ZekeApiClient
    const data = await apiClient.post<{ synced?: number }>(
      "/api/geofence-events",
      { events: unsyncedEvents },
      { timeoutMs: 10000 },
    );
    const syncedCount = data.synced || unsyncedEvents.length;

    await markTriggerEventsSynced(unsyncedEvents.map((e) => e.id));

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
    console.error("Error clearing geofence events:", error);
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
  try {
    // Retry, timeout, and 404 fallback now handled centrally by ZekeApiClient
    return await apiClient.get<ZekeList[]>("/api/lists", {
      emptyArrayOn404: true,
    });
  } catch (error) {
    console.error("[Lists] Failed to fetch lists:", error);
    return [];
  }
}

export async function getListWithItems(
  id: string,
): Promise<ZekeListWithItems | null> {
  try {
    // Retry and timeout now handled centrally by ZekeApiClient
    return await apiClient.get<ZekeListWithItems>(`/api/lists/${id}`);
  } catch (error) {
    console.error("[Lists] Failed to fetch list with items:", error);
    return null;
  }
}

export async function createList(
  name: string,
  description?: string,
  color?: string,
): Promise<ZekeList> {
  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  return await apiClient.post<ZekeList>("/api/lists", {
    name,
    description,
    color,
  });
}

export async function updateList(
  id: string,
  updates: Partial<ZekeList>,
): Promise<ZekeList> {
  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  return await apiClient.patch<ZekeList>(`/api/lists/${id}`, updates);
}

export async function deleteList(id: string): Promise<void> {
  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  await apiClient.delete(`/api/lists/${id}`);
}

export async function addListItem(
  listId: string,
  text: string,
): Promise<ZekeListItem> {
  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  return await apiClient.post<ZekeListItem>(`/api/lists/${listId}/items`, {
    text,
  });
}

export async function toggleListItem(
  listId: string,
  itemId: string,
): Promise<ZekeListItem> {
  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  return await apiClient.post<ZekeListItem>(
    `/api/lists/${listId}/items/${itemId}/toggle`,
    {},
  );
}

export async function deleteListItem(
  listId: string,
  itemId: string,
): Promise<void> {
  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  await apiClient.delete(`/api/lists/${listId}/items/${itemId}`);
}

export async function clearCheckedItems(listId: string): Promise<void> {
  // Retry, timeout, and auth now handled centrally by ZekeApiClient
  await apiClient.post(`/api/lists/${listId}/clear-checked`, {});
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

export async function syncLocationToZeke(
  location: ZekeLocationUpdate,
): Promise<{ success: boolean; id?: string }> {
  try {
    // Retry, timeout, and auth now handled centrally by ZekeApiClient
    // Routes to local API via isLocalEndpoint() check
    const data = await apiClient.post<{ id?: string }>(
      "/api/zeke/location/update",
      location,
      { timeoutMs: 10000 },
    );
    console.log("[ZEKE Location] Location synced to Zeke backend");
    return { success: true, id: data.id };
  } catch (error) {
    console.error("[ZEKE Location] Sync error:", error);
    return { success: false };
  }
}

export async function syncLocationBatchToZeke(
  samples: ZekeLocationSample[],
): Promise<{ success: boolean; synced: number }> {
  if (samples.length === 0) {
    return { success: true, synced: 0 };
  }

  try {
    // Retry, timeout, and auth now handled centrally by ZekeApiClient
    // Routes to local API via isLocalEndpoint() check
    const data = await apiClient.post<{ synced?: number }>(
      "/api/zeke/location/batch",
      { samples },
      { timeoutMs: 15000 },
    );
    const syncedCount = data.synced || samples.length;
    console.log("[ZEKE Location] Batch synced:", syncedCount, "samples");
    return { success: true, synced: syncedCount };
  } catch (error) {
    console.error("[ZEKE Location] Batch sync error:", error);
    return { success: false, synced: 0 };
  }
}

export async function getZekeCurrentLocation(): Promise<ZekeLocationUpdate | null> {
  try {
    // Retry and timeout now handled centrally by ZekeApiClient
    // Routes to local API via isLocalEndpoint() check
    return await apiClient.get<ZekeLocationUpdate>(
      "/api/zeke/location/current",
      { timeoutMs: 5000 },
    );
  } catch {
    return null;
  }
}

export async function getZekeLocationHistory(options?: {
  limit?: number;
  startDate?: string;
  endDate?: string;
}): Promise<ZekeLocationUpdate[]> {
  try {
    // Retry, timeout, and 404 fallback now handled centrally by ZekeApiClient
    // Routes to local API via isLocalEndpoint() check
    const query: Record<string, string> = {};
    if (options?.limit) query.limit = options.limit.toString();
    if (options?.startDate) query.startDate = options.startDate;
    if (options?.endDate) query.endDate = options.endDate;

    const data = await apiClient.get<{ locations?: ZekeLocationUpdate[] }>(
      "/api/zeke/location/history",
      {
        query: Object.keys(query).length > 0 ? query : undefined,
        emptyArrayOn404: true,
        timeoutMs: 5000,
      },
    );
    return data.locations || [];
  } catch {
    return [];
  }
}

export async function getZekeSavedPlaces(): Promise<ZekeSavedPlace[]> {
  try {
    // Retry, timeout, and 404 fallback now handled centrally by ZekeApiClient
    // Routes to local API via isLocalEndpoint() check
    const data = await apiClient.get<{ places?: ZekeSavedPlace[] }>(
      "/api/zeke/saved-places",
      { emptyArrayOn404: true, timeoutMs: 5000 },
    );
    return data.places || [];
  } catch {
    return [];
  }
}

export async function createZekeSavedPlace(
  place: Omit<ZekeSavedPlace, "id" | "createdAt">,
): Promise<ZekeSavedPlace | null> {
  try {
    // Retry, timeout, and auth now handled centrally by ZekeApiClient
    // Routes to local API via isLocalEndpoint() check
    return await apiClient.post<ZekeSavedPlace>(
      "/api/zeke/saved-places",
      place,
      { timeoutMs: 10000 },
    );
  } catch {
    return null;
  }
}

export async function updateZekeSavedPlace(
  id: string,
  updates: Partial<ZekeSavedPlace>,
): Promise<ZekeSavedPlace | null> {
  try {
    // Retry, timeout, and auth now handled centrally by ZekeApiClient
    // Routes to local API via isLocalEndpoint() check
    return await apiClient.patch<ZekeSavedPlace>(
      `/api/zeke/saved-places/${id}`,
      updates,
      { timeoutMs: 10000 },
    );
  } catch {
    return null;
  }
}

export async function deleteZekeSavedPlace(id: string): Promise<boolean> {
  try {
    // Retry, timeout, and auth now handled centrally by ZekeApiClient
    // Routes to local API via isLocalEndpoint() check
    await apiClient.delete(`/api/zeke/saved-places/${id}`, {
      timeoutMs: 10000,
    });
    return true;
  } catch {
    return false;
  }
}

export interface ZekePlaceList {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  placeIds: string[];
  hasProximityAlert: boolean;
  proximityRadiusMeters?: number;
  proximityMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ZekeNearbyPlace {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  types: string[];
  rating?: number;
  priceLevel?: number;
  openNow?: boolean;
  distanceMeters?: number;
  phoneNumber?: string;
  website?: string;
}

export interface ZekeNearbySearchResult {
  places: ZekeNearbyPlace[];
  query: string;
  radiusMeters: number;
  centerLat: number;
  centerLng: number;
}

export async function getZekePlaceLists(): Promise<ZekePlaceList[]> {
  try {
    const data = await apiClient.get<{ lists?: ZekePlaceList[] }>(
      "/api/zeke/place-lists",
      { emptyArrayOn404: true, timeoutMs: 5000 },
    );
    return data.lists || [];
  } catch {
    return [];
  }
}

export async function getZekePlaceList(id: string): Promise<ZekePlaceList | null> {
  try {
    return await apiClient.get<ZekePlaceList>(
      `/api/zeke/place-lists/${id}`,
      { timeoutMs: 5000 },
    );
  } catch {
    return null;
  }
}

export async function createZekePlaceList(
  list: Omit<ZekePlaceList, "id" | "createdAt" | "updatedAt">
): Promise<ZekePlaceList | null> {
  try {
    return await apiClient.post<ZekePlaceList>(
      "/api/zeke/place-lists",
      list,
      { timeoutMs: 10000 },
    );
  } catch {
    return null;
  }
}

export async function updateZekePlaceList(
  id: string,
  updates: Partial<ZekePlaceList>
): Promise<ZekePlaceList | null> {
  try {
    return await apiClient.patch<ZekePlaceList>(
      `/api/zeke/place-lists/${id}`,
      updates,
      { timeoutMs: 10000 },
    );
  } catch {
    return null;
  }
}

export async function deleteZekePlaceList(id: string): Promise<boolean> {
  try {
    await apiClient.delete(`/api/zeke/place-lists/${id}`, {
      timeoutMs: 10000,
    });
    return true;
  } catch {
    return false;
  }
}

export async function addPlaceToList(
  listId: string,
  placeId: string
): Promise<ZekePlaceList | null> {
  try {
    return await apiClient.post<ZekePlaceList>(
      `/api/zeke/place-lists/${listId}/places`,
      { placeId },
      { timeoutMs: 10000 },
    );
  } catch {
    return null;
  }
}

export async function removePlaceFromList(
  listId: string,
  placeId: string
): Promise<boolean> {
  try {
    await apiClient.delete(
      `/api/zeke/place-lists/${listId}/places/${placeId}`,
      { timeoutMs: 10000 },
    );
    return true;
  } catch {
    return false;
  }
}

export async function searchNearbyPlaces(
  query: string,
  latitude: number,
  longitude: number,
  radiusMeters: number = 8000,
  type?: string
): Promise<ZekeNearbySearchResult | null> {
  try {
    const params: Record<string, string> = {
      query,
      lat: latitude.toString(),
      lng: longitude.toString(),
      radius: radiusMeters.toString(),
    };
    if (type) {
      params.type = type;
    }
    return await apiClient.get<ZekeNearbySearchResult>(
      "/api/zeke/places/search",
      { query: params, timeoutMs: 15000 },
    );
  } catch (error) {
    console.error("[ZEKE Places] Search error:", error);
    return null;
  }
}

export async function addNearbyPlaceToSaved(
  nearbyPlace: ZekeNearbyPlace
): Promise<ZekeSavedPlace | null> {
  const place: Omit<ZekeSavedPlace, "id" | "createdAt"> = {
    name: nearbyPlace.name,
    latitude: nearbyPlace.latitude,
    longitude: nearbyPlace.longitude,
    formattedAddress: nearbyPlace.address,
    category: nearbyPlace.types[0] || "place",
  };
  return createZekeSavedPlace(place);
}

export async function searchAndAddToList(
  query: string,
  listId: string,
  latitude: number,
  longitude: number,
  radiusMeters: number = 8000
): Promise<{ added: ZekeSavedPlace[]; listUpdated: boolean }> {
  const result = { added: [] as ZekeSavedPlace[], listUpdated: false };

  const searchResult = await searchNearbyPlaces(query, latitude, longitude, radiusMeters);
  if (!searchResult || searchResult.places.length === 0) {
    return result;
  }

  for (const nearbyPlace of searchResult.places) {
    const savedPlace = await addNearbyPlaceToSaved(nearbyPlace);
    if (savedPlace) {
      result.added.push(savedPlace);
      await addPlaceToList(listId, savedPlace.id);
    }
  }

  result.listUpdated = result.added.length > 0;
  return result;
}

export interface ZekeActionResult {
  success: boolean;
  message: string;
  data?: any;
}

export interface ZekeAction {
  type: string;
  [key: string]: any;
}

export async function executeZekeAction(action: ZekeAction): Promise<ZekeActionResult> {
  try {
    return await apiClient.post<ZekeActionResult>(
      "/api/zeke/actions/execute",
      { action },
      { timeoutMs: 15000 },
    );
  } catch (error) {
    console.error("[ZEKE Actions] Execute error:", error);
    return { success: false, message: "Failed to execute action" };
  }
}

export async function parseAndExecuteIntent(
  message: string,
  userLocation?: { latitude: number; longitude: number }
): Promise<{ action: ZekeAction | null; result: ZekeActionResult | null }> {
  try {
    const response = await apiClient.post<{ action: ZekeAction | null; result: ZekeActionResult | null }>(
      "/api/zeke/actions/parse-intent",
      { message, userLocation },
      { timeoutMs: 15000 },
    );
    
    // Handle client-side actions returned by server
    if (response.result?.data?.clientAction) {
      await handleClientAction(response.result.data);
    }
    
    return response;
  } catch (error) {
    console.error("[ZEKE Actions] Parse intent error:", error);
    return { action: null, result: null };
  }
}

async function handleClientAction(data: { clientAction: string; geofence?: Geofence; place?: any }): Promise<void> {
  try {
    if (data.clientAction === "save_geofence" && data.geofence) {
      const existingGeofences = await getGeofences();
      const existingIndex = existingGeofences.findIndex((g: Geofence) => g.id === data.geofence!.id);
      if (existingIndex >= 0) {
        existingGeofences[existingIndex] = data.geofence;
      } else {
        existingGeofences.push(data.geofence);
      }
      await saveGeofences(existingGeofences);
      console.log("[ZEKE Actions] Saved geofence:", data.geofence.name);
    } else if (data.clientAction === "save_place" && data.place) {
      // Save to starred places via API
      await apiClient.post("/api/zeke/starred-places", data.place, { timeoutMs: 10000 });
      console.log("[ZEKE Actions] Saved place:", data.place.name);
    }
  } catch (error) {
    console.error("[ZEKE Actions] Failed to handle client action:", error);
  }
}

export async function getPlaceListsWithAlerts(): Promise<ZekePlaceList[]> {
  try {
    const data = await apiClient.get<{ lists?: ZekePlaceList[] }>(
      "/api/zeke/place-lists/with-alerts",
      { emptyArrayOn404: true, timeoutMs: 5000 },
    );
    return data.lists || [];
  } catch {
    return [];
  }
}

export interface OmiPendantHealth {
  status: "healthy" | "warning" | "error" | "disconnected" | "unknown";
  isConnected: boolean;
  batteryLevel?: number;
  lastSeenAt?: string;
  firmwareVersion?: string;
  firmwareUpdateAvailable?: boolean;
  storageUsed?: number;
  storageTotal?: number;
  lastError?: string;
  recordingStatus?: "idle" | "recording" | "processing";
  syncStatus?: "synced" | "syncing" | "pending" | "error";
}

export async function getOmiPendantHealth(): Promise<OmiPendantHealth> {
  try {
    const data = await apiClient.get<OmiPendantHealth | { health?: OmiPendantHealth }>(
      "/api/zeke/omi/health",
      { timeoutMs: 5000 },
    );
    if ("health" in data && data.health) {
      return data.health;
    }
    return data as OmiPendantHealth;
  } catch {
    return {
      status: "unknown",
      isConnected: false,
    };
  }
}

export interface NewsStory {
  id: string;
  headline: string;
  summary: string;
  source: string;
  sourceUrl: string;
  category: string;
  publishedAt: string;
  imageUrl?: string;
  urgency?: "normal" | "breaking";
}

export interface NewsBriefing {
  stories: NewsStory[];
  generatedAt: string;
  nextRefreshAt?: string;
  isOffline?: boolean;
}

const NEWS_CACHE_KEY = "zeke-news-briefing-cache";

async function getCachedNewsBriefing(): Promise<NewsBriefing | null> {
  try {
    const AsyncStorage = await getAsyncStorage();
    const cached = await AsyncStorage.getItem(NEWS_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.log("[News Cache] Failed to read cache:", error);
  }
  return null;
}

async function cacheNewsBriefing(briefing: NewsBriefing): Promise<void> {
  try {
    const AsyncStorage = await getAsyncStorage();
    await AsyncStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(briefing));
    console.log("[News Cache] Cached briefing with", briefing.stories.length, "stories");
  } catch (error) {
    console.log("[News Cache] Failed to cache:", error);
  }
}

export function shouldRefreshNews(briefing: NewsBriefing): boolean {
  if (!briefing.nextRefreshAt) return true;
  const nextRefresh = new Date(briefing.nextRefreshAt).getTime();
  return Date.now() >= nextRefresh;
}

export async function getNewsBriefing(): Promise<NewsBriefing> {
  try {
    const data = await apiClient.get<NewsBriefing | { briefing?: NewsBriefing }>(
      "/api/zeke/news/briefing",
      { timeoutMs: 10000 },
    );
    const briefing = ("briefing" in data && data.briefing) ? data.briefing : data as NewsBriefing;
    
    if (briefing.stories && briefing.stories.length > 0) {
      await cacheNewsBriefing(briefing);
    }
    
    return briefing;
  } catch (error) {
    console.log("[News Briefing] Fetch failed, checking cache:", error);
    const cached = await getCachedNewsBriefing();
    if (cached && cached.stories.length > 0) {
      console.log("[News Briefing] Returning cached data with", cached.stories.length, "stories");
      return { ...cached, isOffline: true };
    }
    return {
      stories: [],
      generatedAt: new Date().toISOString(),
    };
  }
}

export async function submitNewsFeedback(
  storyId: string,
  feedbackType: "thumbs_up" | "thumbs_down",
  reason?: string,
  topicId?: string,
): Promise<{ success: boolean }> {
  console.log(`[News Feedback] Submitting: storyId=${storyId}, feedbackType=${feedbackType}, reason=${reason || "none"}, topicId=${topicId || "none"}`);
  try {
    const payload: {
      storyId: string;
      feedbackType: "thumbs_up" | "thumbs_down";
      source: "mobile";
      reason?: string;
      topicId?: string;
    } = {
      storyId,
      feedbackType,
      source: "mobile",
    };
    if (reason && reason.trim().length > 0) {
      payload.reason = reason.trim();
    }
    if (topicId) {
      payload.topicId = topicId;
    }
    const result = await apiClient.post<{ success: boolean }>(
      "/api/zeke/news/feedback",
      payload,
      { timeoutMs: 5000 },
    );
    console.log(`[News Feedback] Response:`, result);
    return result;
  } catch (error) {
    console.error(`[News Feedback] Error submitting feedback:`, error);
    return { success: false };
  }
}

export interface ZekeNotification {
  id: string;
  type: "info" | "success" | "warning" | "error" | "reminder" | "news";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionType?: string;
  actionData?: Record<string, unknown>;
}

export async function getZekeNotifications(options?: {
  limit?: number;
  unreadOnly?: boolean;
}): Promise<ZekeNotification[]> {
  try {
    const query: Record<string, string> = {};
    if (options?.limit) query.limit = options.limit.toString();
    if (options?.unreadOnly) query.unreadOnly = "true";

    const data = await apiClient.get<{ notifications?: ZekeNotification[] }>(
      "/api/zeke/notifications",
      {
        query: Object.keys(query).length > 0 ? query : undefined,
        emptyArrayOn404: true,
        timeoutMs: 5000,
      },
    );
    return data.notifications || [];
  } catch {
    return [];
  }
}

export async function markNotificationRead(notificationId: string): Promise<boolean> {
  try {
    await apiClient.patch<void>(
      `/api/zeke/notifications/${notificationId}`,
      { read: true },
      { timeoutMs: 5000 },
    );
    return true;
  } catch {
    return false;
  }
}

export async function markAllNotificationsRead(): Promise<boolean> {
  try {
    await apiClient.post<void>(
      "/api/zeke/notifications/mark-all-read",
      {},
      { timeoutMs: 5000 },
    );
    return true;
  } catch {
    return false;
  }
}

export async function dismissNotification(notificationId: string): Promise<boolean> {
  try {
    await apiClient.post<void>(
      `/api/zeke/notifications/${notificationId}/dismiss`,
      {},
      { timeoutMs: 5000 },
    );
    return true;
  } catch {
    return false;
  }
}

export async function registerPushToken(token: string): Promise<boolean> {
  try {
    await apiClient.post<void>(
      "/api/zeke/push/register",
      { token, platform: "expo" },
      { timeoutMs: 5000 },
    );
    return true;
  } catch {
    return false;
  }
}

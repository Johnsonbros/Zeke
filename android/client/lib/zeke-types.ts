export type {
  Device,
  InsertDevice,
  Memory,
  InsertMemory,
  User,
  InsertUser,
  ChatSession,
  InsertChatSession,
  ChatMessage,
  InsertChatMessage,
  LocationRecord,
  InsertLocation,
  StarredPlace,
  InsertStarredPlace,
  DeviceToken,
  InsertDeviceToken,
} from "@shared/schema";

export type AccessLevel =
  | "family"
  | "close_friend"
  | "friend"
  | "acquaintance"
  | "unknown";

export const accessLevels: AccessLevel[] = [
  "family",
  "close_friend",
  "friend",
  "acquaintance",
  "unknown",
];

export type CustomListType = "grocery" | "todo" | "custom";
export const customListTypes: CustomListType[] = ["grocery", "todo", "custom"];

export type CustomListItemPriority = "low" | "medium" | "high";
export const customListItemPriorities: CustomListItemPriority[] = [
  "low",
  "medium",
  "high",
];

export interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  priority?: "low" | "medium" | "high";
  status?: "pending" | "in_progress" | "completed" | "cancelled";
  createdAt: string;
  updatedAt: string;
}

export interface GroceryItem {
  id: string;
  name: string;
  quantity?: number;
  unit?: string;
  category?: string;
  isPurchased?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomList {
  id: string;
  name: string;
  type: CustomListType;
  description?: string;
  icon?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomListItem {
  id: string;
  listId: string;
  content: string;
  priority?: CustomListItemPriority;
  isCompleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomListWithItems extends CustomList {
  items: CustomListItem[];
}

export interface Contact {
  id: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  phoneNumber?: string;
  email?: string;
  organization?: string;
  occupation?: string;
  birthday?: string;
  notes?: string;
  accessLevel: AccessLevel;
  canAccessCalendar: boolean;
  canAccessTasks: boolean;
  canAccessGrocery: boolean;
  canSetReminders: boolean;
  interactionCount: number;
  lastInteractionAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime?: string;
  location?: string;
  allDay?: boolean;
  calendarId?: string;
  calendarName?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  content: string;
  role: "user" | "assistant";
  createdAt: string;
}

export interface Conversation {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryNote {
  id: string;
  content: string;
  category?: string;
  importance?: "low" | "medium" | "high";
  createdAt: string;
  updatedAt: string;
}

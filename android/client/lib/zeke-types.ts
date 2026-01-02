import { z } from "zod";

import {
  accessLevelValues,
  contactModelSchema,
  conversationModelSchema,
  calendarEventModelSchema,
  memoryNoteModelSchema,
  messageModelSchema,
  reminderModelSchema,
  taskCategoryValues,
  taskModelSchema,
  taskPriorityValues,
} from "@shared-models";

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

export type AccessLevel = (typeof accessLevelValues)[number];
export const accessLevels: AccessLevel[] = [...accessLevelValues];

export type Task = z.infer<typeof taskModelSchema>;
export const taskSchema = taskModelSchema;
export const taskPriorities = [...taskPriorityValues];
export const taskCategories = [...taskCategoryValues];

export type Reminder = z.infer<typeof reminderModelSchema>;
export const reminderSchema = reminderModelSchema;

export type MemoryNote = z.infer<typeof memoryNoteModelSchema>;
export const memoryNoteSchema = memoryNoteModelSchema;

export type Contact = z.infer<typeof contactModelSchema>;
export const contactSchema = contactModelSchema;

export type Conversation = z.infer<typeof conversationModelSchema>;
export const conversationSchema = conversationModelSchema;

export type CalendarEvent = z.infer<typeof calendarEventModelSchema>;
export const calendarEventSchema = calendarEventModelSchema;

export type Message = z.infer<typeof messageModelSchema>;
export const messageSchema = messageModelSchema;

export type CustomListType = "grocery" | "todo" | "custom";
export const customListTypes: CustomListType[] = ["grocery", "todo", "custom"];

export type CustomListItemPriority = "low" | "medium" | "high";
export const customListItemPriorities: CustomListItemPriority[] = [
  "low",
  "medium",
  "high",
];

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

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Conversations table
export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("New Conversation"),
  phoneNumber: text("phone_number"),
  source: text("source", { enum: ["web", "sms"] }).notNull().default("web"),
  mode: text("mode", { enum: ["chat", "getting_to_know"] }).notNull().default("chat"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

// Messages table
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  source: text("source", { enum: ["web", "sms"] }).notNull().default("web"),
  createdAt: text("created_at").notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// Memory notes table
export const memoryNotes = sqliteTable("memory_notes", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["summary", "note", "preference", "fact"] }).notNull(),
  content: text("content").notNull(),
  context: text("context").notNull().default(""),
  embedding: text("embedding"),
  isSuperseded: integer("is_superseded", { mode: "boolean" }).notNull().default(false),
  supersededBy: text("superseded_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertMemoryNoteSchema = createInsertSchema(memoryNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMemoryNote = z.infer<typeof insertMemoryNoteSchema>;
export type MemoryNote = typeof memoryNotes.$inferSelect;

// Preferences table
export const preferences = sqliteTable("preferences", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertPreferenceSchema = createInsertSchema(preferences).omit({
  id: true,
  updatedAt: true,
});

export type InsertPreference = z.infer<typeof insertPreferenceSchema>;
export type Preference = typeof preferences.$inferSelect;

// Chat request/response types for API contracts
export const chatRequestSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().optional(),
  source: z.enum(["web", "sms"]).default("web"),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type ChatResponse = {
  message: Message;
  conversation: Conversation;
};

// API response types
export type ApiError = {
  message: string;
  code?: string;
};

// Grocery list items table
export const groceryItems = sqliteTable("grocery_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  quantity: text("quantity").default("1"),
  category: text("category").default("Other"),
  addedBy: text("added_by").notNull(),
  purchased: integer("purchased", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertGroceryItemSchema = createInsertSchema(groceryItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateGroceryItemSchema = z.object({
  name: z.string().min(1).optional(),
  quantity: z.string().optional(),
  category: z.string().optional(),
  addedBy: z.string().optional(),
  purchased: z.boolean().optional(),
});

export type InsertGroceryItem = z.infer<typeof insertGroceryItemSchema>;
export type UpdateGroceryItem = z.infer<typeof updateGroceryItemSchema>;
export type GroceryItem = typeof groceryItems.$inferSelect;

// Reminders table for persistent reminders
export const reminders = sqliteTable("reminders", {
  id: text("id").primaryKey(),
  message: text("message").notNull(),
  recipientPhone: text("recipient_phone"),
  conversationId: text("conversation_id"),
  scheduledFor: text("scheduled_for").notNull(),
  createdAt: text("created_at").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
});

export const insertReminderSchema = createInsertSchema(reminders).omit({
  id: true,
  createdAt: true,
});

export type InsertReminder = z.infer<typeof insertReminderSchema>;
export type Reminder = typeof reminders.$inferSelect;

// Tasks table for to-do management
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").default(""),
  priority: text("priority", { enum: ["low", "medium", "high"] }).notNull().default("medium"),
  dueDate: text("due_date"),
  category: text("category", { enum: ["work", "personal", "family"] }).notNull().default("personal"),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  dueDate: z.string().nullable().optional(),
  category: z.enum(["work", "personal", "family"]).optional(),
  completed: z.boolean().optional(),
});

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type UpdateTask = z.infer<typeof updateTaskSchema>;
export type Task = typeof tasks.$inferSelect;

// Access levels for contacts
export const accessLevels = ["admin", "family", "friend", "business", "restricted", "unknown"] as const;
export type AccessLevel = typeof accessLevels[number];

// Contacts table for managing who can communicate with ZEKE
export const contacts = sqliteTable("contacts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phoneNumber: text("phone_number").notNull().unique(),
  accessLevel: text("access_level", { enum: accessLevels }).notNull().default("unknown"),
  relationship: text("relationship").default(""),
  notes: text("notes").default(""),
  canAccessPersonalInfo: integer("can_access_personal_info", { mode: "boolean" }).notNull().default(false),
  canAccessCalendar: integer("can_access_calendar", { mode: "boolean" }).notNull().default(false),
  canAccessTasks: integer("can_access_tasks", { mode: "boolean" }).notNull().default(false),
  canAccessGrocery: integer("can_access_grocery", { mode: "boolean" }).notNull().default(false),
  canSetReminders: integer("can_set_reminders", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateContactSchema = z.object({
  name: z.string().min(1).optional(),
  phoneNumber: z.string().optional(),
  accessLevel: z.enum(accessLevels).optional(),
  relationship: z.string().optional(),
  notes: z.string().optional(),
  canAccessPersonalInfo: z.boolean().optional(),
  canAccessCalendar: z.boolean().optional(),
  canAccessTasks: z.boolean().optional(),
  canAccessGrocery: z.boolean().optional(),
  canSetReminders: z.boolean().optional(),
});

export type InsertContact = z.infer<typeof insertContactSchema>;
export type UpdateContact = z.infer<typeof updateContactSchema>;
export type Contact = typeof contacts.$inferSelect;

// Default permissions by access level
export const defaultPermissionsByLevel: Record<AccessLevel, {
  canAccessPersonalInfo: boolean;
  canAccessCalendar: boolean;
  canAccessTasks: boolean;
  canAccessGrocery: boolean;
  canSetReminders: boolean;
}> = {
  admin: {
    canAccessPersonalInfo: true,
    canAccessCalendar: true,
    canAccessTasks: true,
    canAccessGrocery: true,
    canSetReminders: true,
  },
  family: {
    canAccessPersonalInfo: true,
    canAccessCalendar: true,
    canAccessTasks: false,
    canAccessGrocery: true,
    canSetReminders: true,
  },
  friend: {
    canAccessPersonalInfo: false,
    canAccessCalendar: false,
    canAccessTasks: false,
    canAccessGrocery: false,
    canSetReminders: false,
  },
  business: {
    canAccessPersonalInfo: false,
    canAccessCalendar: false,
    canAccessTasks: false,
    canAccessGrocery: false,
    canSetReminders: false,
  },
  restricted: {
    canAccessPersonalInfo: false,
    canAccessCalendar: false,
    canAccessTasks: false,
    canAccessGrocery: false,
    canSetReminders: false,
  },
  unknown: {
    canAccessPersonalInfo: false,
    canAccessCalendar: false,
    canAccessTasks: false,
    canAccessGrocery: false,
    canSetReminders: false,
  },
};

// Master admin phone number
export const MASTER_ADMIN_PHONE = "6176868763";

// Check if a phone number is the master admin
export function isMasterAdmin(phoneNumber: string): boolean {
  const normalized = phoneNumber.replace(/\D/g, "");
  return normalized === MASTER_ADMIN_PHONE || normalized.endsWith(MASTER_ADMIN_PHONE);
}

// Automation types for recurring scheduled jobs
export const automationTypes = ["morning_briefing", "scheduled_sms", "daily_checkin"] as const;
export type AutomationType = typeof automationTypes[number];

// Automations table for recurring scheduled jobs
export const automations = sqliteTable("automations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: automationTypes }).notNull(),
  cronExpression: text("cron_expression").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  recipientPhone: text("recipient_phone"),
  message: text("message"),
  settings: text("settings"),
  lastRun: text("last_run"),
  nextRun: text("next_run"),
  createdAt: text("created_at").notNull(),
});

export const insertAutomationSchema = createInsertSchema(automations).omit({
  id: true,
  lastRun: true,
  nextRun: true,
  createdAt: true,
});

export type InsertAutomation = z.infer<typeof insertAutomationSchema>;
export type Automation = typeof automations.$inferSelect;

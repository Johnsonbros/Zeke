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

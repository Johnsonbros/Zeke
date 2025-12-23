import { pgTable, text, integer, boolean, varchar, numeric, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Conversations table
export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("New Conversation"),
  phoneNumber: text("phone_number"),
  source: text("source", { enum: ["web", "sms", "voice"] }).notNull().default("web"),
  mode: text("mode", { enum: ["chat", "getting_to_know"] }).notNull().default("chat"),
  summary: text("summary"),
  summarizedMessageCount: integer("summarized_message_count").default(0),
  lastSummarizedAt: text("last_summarized_at"),
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
export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  source: text("source", { enum: ["web", "sms", "voice"] }).notNull().default("web"),
  createdAt: text("created_at").notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// Memory TTL scopes for automatic expiration
export const memoryScopes = ["transient", "session", "long_term"] as const;
export type MemoryScope = typeof memoryScopes[number];

// Memory notes table with confidence scoring
export const memoryNotes = pgTable("memory_notes", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["summary", "note", "preference", "fact"] }).notNull(),
  content: text("content").notNull(),
  context: text("context").notNull().default(""),
  embedding: text("embedding"),
  isSuperseded: boolean("is_superseded").notNull().default(false),
  supersededBy: text("superseded_by"),
  placeId: text("place_id"),
  contactId: text("contact_id"),
  sourceType: text("source_type", { enum: ["conversation", "lifelog", "manual", "observation"] }).default("conversation"),
  sourceId: text("source_id"),
  // TTL bucket fields
  scope: text("scope", { enum: memoryScopes }).default("long_term"), // transient=36h, session=7d, long_term=permanent
  expiresAt: text("expires_at"), // ISO timestamp when memory should be deleted (null=never)
  // Confidence scoring fields
  confidenceScore: text("confidence_score").default("0.8"), // 0-1 scale, stored as text for precision
  lastConfirmedAt: text("last_confirmed_at"), // When the memory was last verified/used successfully
  confirmationCount: integer("confirmation_count").default(0), // Times this memory was confirmed accurate
  usageCount: integer("usage_count").default(0), // Times this memory was used in responses
  lastUsedAt: text("last_used_at"), // When this memory was last used
  // Heat tracking for memory prioritization
  accessCount: integer("access_count").default(0), // Times this memory was retrieved/accessed
  lastAccessedAt: text("last_accessed_at"), // When this memory was last accessed
  heatScore: text("heat_score").default("0.5"), // 0-1 heat score (from feedback + usage)
  isActive: boolean("is_active").notNull().default(true), // Mark for pruning
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

// ============================================
// CORE CONCEPTS SYSTEM (Deep Understanding)
// ============================================

export const conceptTypes = [
  "terminology",
  "relationship_pattern", 
  "identity",
  "value",
  "routine",
  "preference_pattern",
  "social_context",
  "domain_knowledge"
] as const;
export type ConceptType = typeof conceptTypes[number];

export const coreConcepts = pgTable("core_concepts", {
  id: text("id").primaryKey(),
  type: text("type", { enum: conceptTypes }).notNull(),
  concept: text("concept").notNull(),
  description: text("description").notNull(),
  examples: text("examples"),
  sourceMemoryIds: text("source_memory_ids"),
  confidenceScore: text("confidence_score").default("0.7"),
  usageCount: integer("usage_count").default(0),
  lastUsedAt: text("last_used_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertCoreConceptSchema = createInsertSchema(coreConcepts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCoreConcept = z.infer<typeof insertCoreConceptSchema>;
export type CoreConcept = typeof coreConcepts.$inferSelect;

// ============================================
// CONVERSATION QUALITY METRICS SYSTEM
// ============================================

// Tool call outcomes for tracking success/failure
export const toolOutcomes = ["success", "failure", "partial", "timeout", "skipped"] as const;
export type ToolOutcome = typeof toolOutcomes[number];

// Conversation metrics table - tracks quality signals per conversation
export const conversationMetrics = pgTable("conversation_metrics", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  messageId: text("message_id"), // Optional: link to specific message
  // Tool usage tracking
  toolName: text("tool_name"),
  toolOutcome: text("tool_outcome", { enum: toolOutcomes }),
  toolDurationMs: integer("tool_duration_ms"),
  toolErrorMessage: text("tool_error_message"),
  // Conversation quality signals
  requiredFollowUp: boolean("required_follow_up").default(false),
  userRetried: boolean("user_retried").default(false), // User asked same thing again
  explicitFeedback: text("explicit_feedback", { enum: ["positive", "negative", "neutral"] }),
  feedbackNote: text("feedback_note"),
  // Memory usage in this interaction
  memoriesUsed: text("memories_used"), // JSON array of memory IDs used
  memoriesConfirmed: text("memories_confirmed"), // JSON array of memory IDs confirmed accurate
  memoriesContradicted: text("memories_contradicted"), // JSON array of memory IDs found incorrect
  createdAt: text("created_at").notNull(),
});

export const insertConversationMetricSchema = createInsertSchema(conversationMetrics).omit({
  id: true,
  createdAt: true,
});

export type InsertConversationMetric = z.infer<typeof insertConversationMetricSchema>;
export type ConversationMetric = typeof conversationMetrics.$inferSelect;

// Aggregated conversation quality stats (computed periodically)
export interface ConversationQualityStats {
  conversationId: string;
  totalMessages: number;
  totalToolCalls: number;
  successfulToolCalls: number;
  failedToolCalls: number;
  toolSuccessRate: number;
  followUpCount: number;
  retryCount: number;
  positiveFeedbackCount: number;
  negativeFeedbackCount: number;
  averageToolDurationMs: number;
  memoriesUsedCount: number;
  memoriesConfirmedCount: number;
  memoriesContradictedCount: number;
  qualityScore: number; // 0-100 computed score
  computedAt: string;
}

// Memory with computed effective confidence
export interface MemoryWithConfidence extends MemoryNote {
  effectiveConfidence: number; // Computed confidence factoring in time decay
  confidenceLevel: "high" | "medium" | "low"; // Human-readable level
  needsConfirmation: boolean; // Whether to prompt user before using
}

// Preferences table
export const preferences = pgTable("preferences", {
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
  source: z.enum(["web", "sms", "voice"]).default("web"),
  fileIds: z.array(z.string()).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

// Structured card types for rich chat responses
export type CardType = 
  | "task" 
  | "reminder" 
  | "weather" 
  | "calendar_event" 
  | "grocery_list" 
  | "contact" 
  | "location"
  | "task_list"
  | "reminder_list";

export interface TaskCard {
  type: "task";
  id: string;
  title: string;
  priority: string;
  dueDate: string | null;
  completed: boolean;
  description?: string | null;
}

export interface ReminderCard {
  type: "reminder";
  id: string;
  message: string;
  scheduledFor: string;
  sent: boolean;
}

export interface WeatherCard {
  type: "weather";
  location: string;
  temperature: number;
  condition: string;
  humidity?: number;
  windSpeed?: number;
  icon?: string;
  forecast?: Array<{
    day: string;
    high: number;
    low: number;
    condition: string;
  }>;
}

export interface CalendarEventCard {
  type: "calendar_event";
  id: string;
  title: string;
  startTime: string;
  endTime?: string;
  location?: string;
  description?: string;
}

export interface GroceryListCard {
  type: "grocery_list";
  items: Array<{
    id: string;
    name: string;
    quantity: string;
    category: string;
    purchased: boolean;
  }>;
  totalItems: number;
  purchasedCount: number;
}

export interface ContactCard {
  type: "contact";
  id: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  email?: string;
  relationship?: string;
}

export interface LocationCard {
  type: "location";
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  category?: string;
}

export interface TaskListCard {
  type: "task_list";
  title: string;
  tasks: TaskCard[];
  totalCount: number;
  completedCount: number;
}

export interface ReminderListCard {
  type: "reminder_list";
  title: string;
  reminders: ReminderCard[];
  totalCount: number;
}

export type ChatCard = 
  | TaskCard 
  | ReminderCard 
  | WeatherCard 
  | CalendarEventCard 
  | GroceryListCard 
  | ContactCard 
  | LocationCard
  | TaskListCard
  | ReminderListCard;

export type ChatResponse = {
  message: Message;
  conversation: Conversation;
  cards?: ChatCard[];
};

// API response types
export type ApiError = {
  message: string;
  code?: string;
};

// Grocery list items table
export const groceryItems = pgTable("grocery_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  quantity: text("quantity").default("1"),
  category: text("category").default("Other"),
  addedBy: text("added_by").notNull(),
  purchased: boolean("purchased").notNull().default(false),
  purchasedAt: text("purchased_at"),
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

// Grocery shopping history - tracks completed purchases for quick re-add
export const groceryHistory = pgTable("grocery_history", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  quantity: text("quantity").default("1"),
  category: text("category").default("Other"),
  purchasedAt: text("purchased_at").notNull(),
  purchasedBy: text("purchased_by").notNull(),
  purchaseCount: integer("purchase_count").notNull().default(1),  // How many times this item has been bought
  lastPurchasedAt: text("last_purchased_at").notNull(),
});

export type GroceryHistoryItem = typeof groceryHistory.$inferSelect;

// Reminders table for persistent reminders
export const reminders = pgTable("reminders", {
  id: text("id").primaryKey(),
  message: text("message").notNull(),
  recipientPhone: text("recipient_phone"),
  conversationId: text("conversation_id"),
  scheduledFor: text("scheduled_for").notNull(),
  createdAt: text("created_at").notNull(),
  completed: boolean("completed").notNull().default(false),
  placeId: text("place_id"),
  parentReminderId: text("parent_reminder_id"),
  sequencePosition: integer("sequence_position"),
  sequenceTotal: integer("sequence_total"),
});

export const insertReminderSchema = createInsertSchema(reminders).omit({
  id: true,
  createdAt: true,
});

export type InsertReminder = z.infer<typeof insertReminderSchema>;
export type Reminder = typeof reminders.$inferSelect;

// Tasks table for to-do management
export const tasks = pgTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").default(""),
  priority: text("priority", { enum: ["low", "medium", "high"] }).notNull().default("medium"),
  dueDate: text("due_date"),
  category: text("category", { enum: ["work", "personal", "family"] }).notNull().default("personal"),
  completed: boolean("completed").notNull().default(false),
  placeId: text("place_id"),
  parentTaskId: text("parent_task_id"),
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
  placeId: z.string().nullable().optional(),
  parentTaskId: z.string().nullable().optional(),
});

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type UpdateTask = z.infer<typeof updateTaskSchema>;
export type Task = typeof tasks.$inferSelect;

// Calendar events table for tracking calendar data
export const calendarEvents = pgTable("calendar_events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").default(""),
  start: text("start").notNull(),
  end: text("end").notNull(),
  location: text("location"),
  isAllDay: boolean("is_all_day").notNull().default(false),
  googleCalendarId: text("google_calendar_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertCalendarEventSchema = createInsertSchema(calendarEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateCalendarEventSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  location: z.string().nullable().optional(),
  isAllDay: z.boolean().optional(),
  googleCalendarId: z.string().nullable().optional(),
});

export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;
export type UpdateCalendarEvent = z.infer<typeof updateCalendarEventSchema>;
export type CalendarEvent = typeof calendarEvents.$inferSelect;

// Access levels for contacts
export const accessLevels = ["admin", "family", "friend", "business", "restricted", "unknown"] as const;
export type AccessLevel = typeof accessLevels[number];

// Contacts table for managing who can communicate with ZEKE
export const contacts = pgTable("contacts", {
  id: text("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull().default(""),
  middleName: text("middle_name"),
  phoneNumber: text("phone_number").notNull().unique(),
  email: text("email"),
  aiAssistantPhone: text("ai_assistant_phone"),
  imageUrl: text("image_url"),
  accessLevel: text("access_level", { enum: accessLevels }).notNull().default("unknown"),
  relationship: text("relationship").default(""),
  notes: text("notes").default(""),
  canAccessPersonalInfo: boolean("can_access_personal_info").notNull().default(false),
  canAccessCalendar: boolean("can_access_calendar").notNull().default(false),
  canAccessTasks: boolean("can_access_tasks").notNull().default(false),
  canAccessGrocery: boolean("can_access_grocery").notNull().default(false),
  canSetReminders: boolean("can_set_reminders").notNull().default(false),
  birthday: text("birthday"),
  occupation: text("occupation"),
  organization: text("organization"),
  lastInteractionAt: text("last_interaction_at"),
  interactionCount: integer("interaction_count").notNull().default(0),
  metadata: text("metadata"),
  isAutoCreated: boolean("is_auto_created").notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Note types for contact observations
export const contactNoteTypes = ["interaction", "observation", "comment", "fact"] as const;
export type ContactNoteType = typeof contactNoteTypes[number];

// Contact notes table for ZEKE's observations about people
export const contactNotes = pgTable("contact_notes", {
  id: text("id").primaryKey(),
  contactId: text("contact_id").notNull(),
  content: text("content").notNull(),
  noteType: text("note_type", { enum: contactNoteTypes }).notNull().default("observation"),
  createdBy: text("created_by", { enum: ["nate", "zeke"] }).notNull().default("zeke"),
  createdAt: text("created_at").notNull(),
});

export const insertContactNoteSchema = createInsertSchema(contactNotes).omit({
  id: true,
  createdAt: true,
});

export type InsertContactNote = z.infer<typeof insertContactNoteSchema>;
export type ContactNote = typeof contactNotes.$inferSelect;

// Contact faces table for face recognition
export const contactFaces = pgTable("contact_faces", {
  id: text("id").primaryKey(),
  contactId: text("contact_id").notNull(),
  sourceImageId: text("source_image_id"), // Reference to stored_images
  facePosition: text("face_position"), // left/center/right in source image
  faceDescription: text("face_description").notNull(), // AI-generated description
  distinguishingFeatures: text("distinguishing_features"), // JSON array of notable features
  estimatedAge: text("estimated_age"),
  isPrimary: boolean("is_primary").notNull().default(false),
  confidence: text("confidence").default("0.8"), // Enrollment confidence
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertContactFaceSchema = createInsertSchema(contactFaces).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertContactFace = z.infer<typeof insertContactFaceSchema>;
export type ContactFace = typeof contactFaces.$inferSelect;

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateContactSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().optional(),
  middleName: z.string().nullable().optional(),
  phoneNumber: z.string().optional(),
  email: z.string().nullable().optional(),
  aiAssistantPhone: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  accessLevel: z.enum(accessLevels).optional(),
  relationship: z.string().optional(),
  notes: z.string().optional(),
  canAccessPersonalInfo: z.boolean().optional(),
  canAccessCalendar: z.boolean().optional(),
  canAccessTasks: z.boolean().optional(),
  canAccessGrocery: z.boolean().optional(),
  canSetReminders: z.boolean().optional(),
  birthday: z.string().nullable().optional(),
  occupation: z.string().nullable().optional(),
  organization: z.string().nullable().optional(),
  lastInteractionAt: z.string().nullable().optional(),
  interactionCount: z.number().optional(),
  metadata: z.string().nullable().optional(),
  isAutoCreated: z.boolean().optional(),
});

export type InsertContact = z.infer<typeof insertContactSchema>;
export type UpdateContact = z.infer<typeof updateContactSchema>;
export type Contact = typeof contacts.$inferSelect;

// Helper function to get full name from contact
export function getContactFullName(contact: Contact): string {
  const parts = [contact.firstName];
  if (contact.middleName) parts.push(contact.middleName);
  parts.push(contact.lastName);
  return parts.filter(Boolean).join(" ");
}

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

const MASTER_ADMIN_PHONE = "6177013332"; // Nate's phone

export function isMasterAdminPhone(phoneNumber: string): boolean {
  const normalized = phoneNumber.replace(/\D/g, "");
  return normalized === MASTER_ADMIN_PHONE || normalized.endsWith(MASTER_ADMIN_PHONE);
}

// Automation types for recurring scheduled jobs
export const automationTypes = ["sms", "daily_checkin", "scheduled_action"] as const;
export type AutomationType = typeof automationTypes[number];

export const automations = pgTable("automations", {
  id: text("id").primaryKey(),
  type: text("type", { enum: automationTypes }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  recipientPhone: text("recipient_phone"),
  message: text("message"),
  schedule: text("schedule"), // cron expression
  enabled: boolean("enabled").notNull().default(true),
  lastExecutedAt: text("last_executed_at"),
  nextExecutionAt: text("next_execution_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertAutomationSchema = createInsertSchema(automations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAutomation = z.infer<typeof insertAutomationSchema>;
export type Automation = typeof automations.$inferSelect;

// ============================================
// TWILIO SMS SYSTEM
// ============================================

export const twilioMessageDirections = ["inbound", "outbound"] as const;
export type TwilioMessageDirection = typeof twilioMessageDirections[number];

export const twilioMessageStatuses = ["pending", "queued", "sending", "sent", "failed", "delivered", "undelivered", "received"] as const;
export type TwilioMessageStatus = typeof twilioMessageStatuses[number];

export const twilioMessageSources = ["chat_api", "automation", "notification", "sms_command", "voice_transcription", "user_sms"] as const;
export type TwilioMessageSource = typeof twilioMessageSources[number];

export const twilioMessages = pgTable("twilio_messages", {
  id: text("id").primaryKey(),
  direction: text("direction", { enum: twilioMessageDirections }).notNull(),
  phoneNumber: text("phone_number").notNull(),
  content: text("content").notNull(),
  status: text("status", { enum: twilioMessageStatuses }).notNull().default("pending"),
  twilioSid: text("twilio_sid"),
  source: text("source", { enum: twilioMessageSources }).default("chat_api"),
  conversationId: text("conversation_id"),
  mediaUrls: text("media_urls"), // JSON array of media URLs
  automationId: text("automation_id"),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertTwilioMessageSchema = createInsertSchema(twilioMessages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTwilioMessage = z.infer<typeof insertTwilioMessageSchema>;
export type TwilioMessage = typeof twilioMessages.$inferSelect;

// OutboundMessage table - tracks messages sent by ZEKE
export const outboundMessages = pgTable("outbound_messages", {
  id: text("id").primaryKey(),
  recipient: text("recipient").notNull(),
  channel: text("channel", { enum: ["sms", "email", "notification"] }).notNull(),
  content: text("content").notNull(),
  status: text("status", { enum: ["pending", "sent", "failed", "delivered"] }).notNull().default("pending"),
  externalId: text("external_id"), // Twilio SID, email message ID, etc.
  conversationId: text("conversation_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertOutboundMessageSchema = createInsertSchema(outboundMessages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOutboundMessage = z.infer<typeof insertOutboundMessageSchema>;
export type OutboundMessage = typeof outboundMessages.$inferSelect;

// ============================================
// USER FEEDBACK & LEARNING SYSTEM
// ============================================

export const reactionTypes = ["positive", "negative", "neutral", "confused", "surprised"] as const;
export type ReactionType = typeof reactionTypes[number];

export const feedbackEvents = pgTable("feedback_events", {
  id: text("id").primaryKey(),
  type: text("type", { enum: reactionTypes }).notNull(),
  source: text("source", { enum: ["implicit", "explicit"] }).notNull(),
  messageId: text("message_id"),
  conversationId: text("conversation_id"),
  feedback: text("feedback"),
  createdAt: text("created_at").notNull(),
});

export const insertFeedbackEventSchema = createInsertSchema(feedbackEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertFeedbackEvent = z.infer<typeof insertFeedbackEventSchema>;
export type FeedbackEvent = typeof feedbackEvents.$inferSelect;

// ============================================
// LOCATION INTELLIGENCE
// ============================================

export const locationHistory = pgTable("location_history", {
  id: text("id").primaryKey(),
  latitude: text("latitude").notNull(),
  longitude: text("longitude").notNull(),
  accuracy: text("accuracy"),
  address: text("address"),
  placeId: text("place_id"),
  source: text("source").default("mobile_app"),
  createdAt: text("created_at").notNull(),
});

export const insertLocationHistorySchema = createInsertSchema(locationHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertLocationHistory = z.infer<typeof insertLocationHistorySchema>;
export type LocationHistory = typeof locationHistory.$inferSelect;

export const placeCategories = [
  "home",
  "work",
  "gym",
  "restaurant",
  "grocery",
  "hospital",
  "school",
  "library",
  "park",
  "airport",
  "other"
] as const;
export type PlaceCategory = typeof placeCategories[number];

export const savedPlaces = pgTable("saved_places", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category", { enum: placeCategories }).notNull(),
  latitude: text("latitude").notNull(),
  longitude: text("longitude").notNull(),
  address: text("address"),
  notes: text("notes"),
  isStarred: boolean("is_starred").notNull().default(false),
  visits: integer("visits").default(0),
  lastVisitAt: text("last_visit_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertSavedPlaceSchema = createInsertSchema(savedPlaces).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateSavedPlaceSchema = z.object({
  name: z.string().optional(),
  category: z.enum(placeCategories).optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isStarred: z.boolean().optional(),
  visits: z.number().optional(),
  lastVisitAt: z.string().nullable().optional(),
});

export type InsertSavedPlace = z.infer<typeof insertSavedPlaceSchema>;
export type UpdateSavedPlace = z.infer<typeof updateSavedPlaceSchema>;
export type SavedPlace = typeof savedPlaces.$inferSelect;

// Place lists - groups of related places
export const placeLists = pgTable("place_lists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"), // e.g., "favorite_restaurants", "gym_locations"
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertPlaceListSchema = createInsertSchema(placeLists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updatePlaceListSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
});

export type InsertPlaceList = z.infer<typeof insertPlaceListSchema>;
export type UpdatePlaceList = z.infer<typeof updatePlaceListSchema>;
export type PlaceList = typeof placeLists.$inferSelect;

// Join table for place lists
export const placeListItems = pgTable("place_list_items", {
  id: text("id").primaryKey(),
  listId: text("list_id").notNull(),
  placeId: text("place_id").notNull(),
  order: integer("order").default(0),
  createdAt: text("created_at").notNull(),
});

export const insertPlaceListItemSchema = createInsertSchema(placeListItems).omit({
  id: true,
  createdAt: true,
});

export type InsertPlaceListItem = z.infer<typeof insertPlaceListItemSchema>;
export type PlaceListItem = typeof placeListItems.$inferSelect;

// Location settings
export const locationSettings = pgTable("location_settings", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertLocationSettingsSchema = createInsertSchema(locationSettings).omit({
  id: true,
  updatedAt: true,
});

export type InsertLocationSettings = z.infer<typeof insertLocationSettingsSchema>;
export type LocationSettings = typeof locationSettings.$inferSelect;

// Proximity alerts for locations
export const proximityAlerts = pgTable("proximity_alerts", {
  id: text("id").primaryKey(),
  placeId: text("place_id").notNull(),
  radiusMeters: integer("radius_meters").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const insertProximityAlertSchema = createInsertSchema(proximityAlerts).omit({
  id: true,
  createdAt: true,
});

export type InsertProximityAlert = z.infer<typeof insertProximityAlertSchema>;
export type ProximityAlert = typeof proximityAlerts.$inferSelect;

// Location state tracking for geofence detection
export const locationStateTracking = pgTable("location_state_tracking", {
  id: text("id").primaryKey(),
  placeId: text("place_id"),
  state: text("state", { enum: ["entering", "inside", "exiting", "away"] }).notNull(),
  latitude: text("latitude").notNull(),
  longitude: text("longitude").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertLocationStateTrackingSchema = createInsertSchema(locationStateTracking).omit({
  id: true,
  createdAt: true,
});

export type InsertLocationStateTracking = z.infer<typeof insertLocationStateTrackingSchema>;
export type LocationStateTracking = typeof locationStateTracking.$inferSelect;

// ============================================
// CUSTOM LISTS
// ============================================

export const customListTypes = ["checklist", "inventory", "wishlist", "reference", "notes"] as const;
export type CustomListType = typeof customListTypes[number];

export const customListItemPriorities = ["low", "medium", "high", "urgent"] as const;
export type CustomListItemPriority = typeof customListItemPriorities[number];

export const customLists = pgTable("custom_lists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: customListTypes }).notNull().default("checklist"),
  description: text("description"),
  color: text("color"),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertCustomListSchema = createInsertSchema(customLists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateCustomListSchema = z.object({
  name: z.string().optional(),
  type: z.enum(customListTypes).optional(),
  description: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  isArchived: z.boolean().optional(),
});

export type InsertCustomList = z.infer<typeof insertCustomListSchema>;
export type UpdateCustomList = z.infer<typeof updateCustomListSchema>;
export type CustomList = typeof customLists.$inferSelect;

export const customListItems = pgTable("custom_list_items", {
  id: text("id").primaryKey(),
  listId: text("list_id").notNull(),
  content: text("content").notNull(),
  isChecked: boolean("is_checked").notNull().default(false),
  priority: text("priority", { enum: customListItemPriorities }).default("medium"),
  notes: text("notes"),
  dueDate: text("due_date"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertCustomListItemSchema = createInsertSchema(customListItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateCustomListItemSchema = z.object({
  content: z.string().optional(),
  isChecked: z.boolean().optional(),
  priority: z.enum(customListItemPriorities).optional(),
  notes: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

export type InsertCustomListItem = z.infer<typeof insertCustomListItemSchema>;
export type UpdateCustomListItem = z.infer<typeof updateCustomListItemSchema>;
export type CustomListItem = typeof customListItems.$inferSelect;

export interface CustomListWithItems extends CustomList {
  items: CustomListItem[];
}

// ============================================
// FOOD & NUTRITION
// ============================================

export const foodItemTypes = ["ingredient", "dish", "meal", "restaurant", "cuisine", "dietary_restriction"] as const;
export type FoodItemType = typeof foodItemTypes[number];

export const foodPreferenceLevels = ["love", "like", "neutral", "dislike", "allergic"] as const;
export type FoodPreferenceLevel = typeof foodPreferenceLevels[number];

export const familyMembers = pgTable("family_members", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  relationship: text("relationship"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertFamilyMemberSchema = createInsertSchema(familyMembers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateFamilyMemberSchema = z.object({
  name: z.string().optional(),
  relationship: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export type InsertFamilyMember = z.infer<typeof insertFamilyMemberSchema>;
export type UpdateFamilyMember = z.infer<typeof updateFamilyMemberSchema>;
export type FamilyMember = typeof familyMembers.$inferSelect;

export const foodPreferences = pgTable("food_preferences", {
  id: text("id").primaryKey(),
  itemName: text("item_name").notNull(),
  itemType: text("item_type", { enum: foodItemTypes }).notNull(),
  level: text("level", { enum: foodPreferenceLevels }).notNull(),
  reason: text("reason"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertFoodPreferenceSchema = createInsertSchema(foodPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFoodPreference = z.infer<typeof insertFoodPreferenceSchema>;
export type FoodPreference = typeof foodPreferences.$inferSelect;

export const dietaryRestrictionTypes = ["vegetarian", "vegan", "gluten_free", "dairy_free", "nut_allergy", "shellfish_allergy", "kosher", "halal", "low_carb", "keto", "low_sodium"] as const;
export type DietaryRestrictionType = typeof dietaryRestrictionTypes[number];

export const dietaryRestrictionSeverities = ["mild", "moderate", "severe"] as const;
export type DietaryRestrictionSeverity = typeof dietaryRestrictionSeverities[number];

export const dietaryRestrictions = pgTable("dietary_restrictions", {
  id: text("id").primaryKey(),
  type: text("type", { enum: dietaryRestrictionTypes }).notNull(),
  severity: text("severity", { enum: dietaryRestrictionSeverities }).notNull().default("moderate"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const insertDietaryRestrictionSchema = createInsertSchema(dietaryRestrictions).omit({
  id: true,
  createdAt: true,
});

export type InsertDietaryRestriction = z.infer<typeof insertDietaryRestrictionSchema>;
export type DietaryRestriction = typeof dietaryRestrictions.$inferSelect;

export const mealTypes = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = typeof mealTypes[number];

export const mealHistory = pgTable("meal_history", {
  id: text("id").primaryKey(),
  mealType: text("meal_type", { enum: mealTypes }).notNull(),
  description: text("description").notNull(),
  date: text("date").notNull(),
  rating: integer("rating"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const insertMealHistorySchema = createInsertSchema(mealHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertMealHistory = z.infer<typeof insertMealHistorySchema>;
export type MealHistory = typeof mealHistory.$inferSelect;

export const recipeMealTypes = ["breakfast", "lunch", "dinner", "snack", "dessert", "appetizer"] as const;
export type RecipeMealType = typeof recipeMealTypes[number];

export const savedRecipes = pgTable("saved_recipes", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  url: text("url"),
  source: text("source"),
  description: text("description"),
  mealTypes: text("meal_types"), // JSON array of meal types
  ingredients: text("ingredients"), // JSON array
  instructions: text("instructions"),
  isFavorite: boolean("is_favorite").notNull().default(false),
  timesCooked: integer("times_cooked").default(0),
  lastCookedAt: text("last_cooked_at"),
  rating: integer("rating"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertSavedRecipeSchema = createInsertSchema(savedRecipes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateSavedRecipeSchema = z.object({
  title: z.string().optional(),
  url: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  mealTypes: z.string().nullable().optional(),
  ingredients: z.string().nullable().optional(),
  instructions: z.string().nullable().optional(),
  isFavorite: z.boolean().optional(),
  timesCooked: z.number().optional(),
  lastCookedAt: z.string().nullable().optional(),
  rating: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type InsertSavedRecipe = z.infer<typeof insertSavedRecipeSchema>;
export type UpdateSavedRecipe = z.infer<typeof updateSavedRecipeSchema>;
export type SavedRecipe = typeof savedRecipes.$inferSelect;

// ============================================
// CROSS-DOMAIN ENTITY LINKING SYSTEM
// ============================================

// Entity types that can be extracted and linked across domains
export const entityTypes = ["person", "task", "memory", "calendar_event", "location", "grocery_item", "conversation", "topic"] as const;
export type EntityType = typeof entityTypes[number];

// Domains where entities can be referenced
export const entityDomains = ["memory", "task", "contact", "calendar", "location", "grocery", "conversation", "document", "lifelog", "sms"] as const;
export type EntityDomain = typeof entityDomains[number];

// Relationship types between entities
export const entityRelationshipTypes = ["mentions", "derived_from", "scheduled_near", "located_at", "depends_on", "same_subject", "part_of", "reinforces"] as const;
export type EntityRelationshipType = typeof entityRelationshipTypes[number];

// Entities table - canonical entities extracted from across the system
export const entities = pgTable("entities", {
  id: text("id").primaryKey(),
  type: text("type", { enum: entityTypes }).notNull(),
  label: text("label").notNull(),
  canonicalId: text("canonical_id"),
  metadata: text("metadata"),
  createdAt: text("created_at").notNull(),
});

export const insertEntitySchema = createInsertSchema(entities).omit({
  id: true,
  createdAt: true,
});

export type InsertEntity = z.infer<typeof insertEntitySchema>;
export type Entity = typeof entities.$inferSelect;

// Entity references table - tracks where entities are referenced
export const entityReferences = pgTable("entity_references", {
  id: text("id").primaryKey(),
  entityId: text("entity_id").notNull(),
  domain: text("domain", { enum: entityDomains }).notNull(),
  itemId: text("item_id").notNull(),
  confidence: text("confidence").notNull(),
  extractedAt: text("extracted_at").notNull(),
  context: text("context"),
});

export const insertEntityReferenceSchema = createInsertSchema(entityReferences).omit({
  id: true,
});

export type InsertEntityReference = z.infer<typeof insertEntityReferenceSchema>;
export type EntityReference = typeof entityReferences.$inferSelect;

// Entity links table - tracks relationships between entities
export const entityLinks = pgTable("entity_links", {
  id: text("id").primaryKey(),
  sourceEntityId: text("source_entity_id").notNull(),
  targetEntityId: text("target_entity_id").notNull(),
  relationshipType: text("relationship_type", { enum: entityRelationshipTypes }).notNull(),
  weight: text("weight").notNull(),
  firstSeenAt: text("first_seen_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  metadata: text("metadata"),
});

export const insertEntityLinkSchema = createInsertSchema(entityLinks).omit({
  id: true,
});

export type InsertEntityLink = z.infer<typeof insertEntityLinkSchema>;
export type EntityLink = typeof entityLinks.$inferSelect;

// Memory relationships table - tracks co-occurrence strength between entities
export const memoryRelationships = pgTable("memory_relationships", {
  id: text("id").primaryKey(),
  sourceEntityId: text("source_entity_id").notNull(),
  targetEntityId: text("target_entity_id").notNull(),
  coOccurrenceCount: integer("co_occurrence_count").notNull().default(1),
  relationshipStrength: text("relationship_strength").notNull().default("0.1"), // 0-1 scale
  firstSeenAt: text("first_seen_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  contextCategories: text("context_categories"), // JSON array of categories where co-occurrence happened
  metadata: text("metadata"), // Additional context about the relationship
});

export const insertMemoryRelationshipSchema = createInsertSchema(memoryRelationships).omit({
  id: true,
});

export type InsertMemoryRelationship = z.infer<typeof insertMemoryRelationshipSchema>;
export type MemoryRelationship = typeof memoryRelationships.$inferSelect;

// Helper interface for entity with its references
export interface EntityWithReferences extends Entity {
  references: EntityReference[];
}

// Helper interface for entity with linked entities
export interface EntityWithLinks extends Entity {
  linkedEntities: Array<{
    entity: Entity;
    link: EntityLink;
    direction: "source" | "target";
  }>;
}

// ============================================
// PROACTIVE INSIGHTS SYSTEM
// ============================================

// Insight types for different detector sources
export const insightTypes = [
  "task_overdue", 
  "task_cluster", 
  "task_completion_trend",
  "memory_stale", 
  "memory_low_confidence",
  "calendar_busy", 
  "calendar_conflict",
  "contact_mention", 
  "pattern",
  "cross_domain_connection"
] as const;
export type InsightType = typeof insightTypes[number];

// Categories for organizing insights
export const insightCategories = ["task_health", "memory_hygiene", "calendar_load", "cross_domain"] as const;
export type InsightCategory = typeof insightCategories[number];

// Priority levels for insights
export const insightPriorities = ["high", "medium", "low"] as const;
export type InsightPriority = typeof insightPriorities[number];

// Status tracking for insights
export const insightStatuses = ["new", "surfaced", "snoozed", "completed", "dismissed"] as const;
export type InsightStatus = typeof insightStatuses[number];

// Proactive insights table - stores generated insights from detectors
export const insights = pgTable("insights", {
  id: text("id").primaryKey(),
  type: text("type", { enum: insightTypes }).notNull(),
  category: text("category", { enum: insightCategories }).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  priority: text("priority", { enum: insightPriorities }).notNull().default("medium"),
  confidence: text("confidence").notNull().default("0.8"),
  suggestedAction: text("suggested_action"),
  actionPayload: text("action_payload"),
  status: text("status", { enum: insightStatuses }).notNull().default("new"),
  sourceEntityId: text("source_entity_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  dismissedAt: text("dismissed_at"),
  surfacedAt: text("surfaced_at"),
  expiresAt: text("expires_at"),
});

export const insertInsightSchema = createInsertSchema(insights).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateInsightSchema = z.object({
  status: z.enum(insightStatuses).optional(),
  priority: z.enum(insightPriorities).optional(),
  dismissedAt: z.string().nullable().optional(),
  surfacedAt: z.string().nullable().optional(),
});

export type InsertInsight = z.infer<typeof insertInsightSchema>;
export type UpdateInsight = z.infer<typeof updateInsightSchema>;
export type Insight = typeof insights.$inferSelect;

// Helper interface for insight statistics
export interface InsightStats {
  total: number;
  byCategory: Record<InsightCategory, number>;
  byStatus: Record<InsightStatus, number>;
  byPriority: Record<InsightPriority, number>;
}

// ============================================
// KNOWLEDGE GRAPH (NEW)
// ============================================

// Evidence sources - where relationships come from
export const evidenceSourceTypes = ["CHAT_MESSAGE", "OMI_TRANSCRIPT", "TASK", "NOTE", "CAL_EVENT", "EMAIL", "OTHER"] as const;
export type EvidenceSourceType = typeof evidenceSourceTypes[number];

// Evidence table - tracks provenance of all KG claims
export const kgEvidence = pgTable("kg_evidence", {
  id: text("id").primaryKey(),
  sourceType: text("source_type", { enum: evidenceSourceTypes }).notNull(),
  sourceId: text("source_id").notNull(),
  sourceExcerpt: text("source_excerpt"),
  sourceUrl: text("source_url"),
  createdAt: text("created_at").notNull(),
});

export const insertKgEvidenceSchema = createInsertSchema(kgEvidence).omit({
  id: true,
  createdAt: true,
});

export type InsertKgEvidence = z.infer<typeof insertKgEvidenceSchema>;
export type KgEvidence = typeof kgEvidence.$inferSelect;

// Entity types for the knowledge graph
export const kgEntityTypes = ["PERSON", "ORG", "PLACE", "PROJECT", "DEVICE", "CONCEPT", "EVENT", "OTHER"] as const;
export type KgEntityType = typeof kgEntityTypes[number];

// KG Entities table - canonical entities
export const kgEntities = pgTable("kg_entities", {
  id: text("id").primaryKey(),
  entityType: text("entity_type", { enum: kgEntityTypes }).notNull(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  canonicalKey: text("canonical_key").notNull().unique(),
  attributes: jsonb("attributes").default("{}"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
  index("kg_entities_type_idx").on(t.entityType),
  uniqueIndex("kg_entities_canonical_key_idx").on(t.canonicalKey),
]);

export const insertKgEntitySchema = createInsertSchema(kgEntities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertKgEntity = z.infer<typeof insertKgEntitySchema>;
export type KgEntity = typeof kgEntities.$inferSelect;

// Relationship types
export const kgRelationshipTypes = ["OWNS", "HAS_ROLE", "RELATED_TO", "LOCATED_IN", "WORKS_ON", "PREFERS", "MENTIONED_IN", "OCCURRED_AT", "CAUSED_BY", "BLOCKED_BY", "MEMBER_OF", "USES"] as const;
export type KgRelationshipType = typeof kgRelationshipTypes[number];

// Relationship statuses
export const kgRelationshipStatuses = ["ACTIVE", "CONTESTED", "RETRACTED"] as const;
export type KgRelationshipStatus = typeof kgRelationshipStatuses[number];

// KG Relationships table - claims with evidence chain
export const kgRelationships = pgTable("kg_relationships", {
  id: text("id").primaryKey(),
  fromEntityId: text("from_entity_id").notNull().references(() => kgEntities.id),
  toEntityId: text("to_entity_id").notNull().references(() => kgEntities.id),
  relType: text("rel_type", { enum: kgRelationshipTypes }).notNull(),
  confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
  status: text("status", { enum: kgRelationshipStatuses }).notNull().default("ACTIVE"),
  firstSeenAt: text("first_seen_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  evidenceId: text("evidence_id").references(() => kgEvidence.id),
  properties: jsonb("properties").default("{}"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
  index("kg_relationships_from_idx").on(t.fromEntityId, t.relType),
  index("kg_relationships_to_idx").on(t.toEntityId, t.relType),
  index("kg_relationships_status_idx").on(t.relType, t.status),
  index("kg_relationships_evidence_idx").on(t.evidenceId),
]);

export const insertKgRelationshipSchema = createInsertSchema(kgRelationships).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertKgRelationship = z.infer<typeof insertKgRelationshipSchema>;
export type KgRelationship = typeof kgRelationships.$inferSelect;

// ============================================
// REST OF SCHEMA (EXISTING - TRUNCATED FOR BREVITY)
// ============================================

export const profileSections = pgTable("profile_sections", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  order: integer("order").default(0),
  isVisible: boolean("is_visible").notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertProfileSectionSchema = createInsertSchema(profileSections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateProfileSectionSchema = z.object({
  name: z.string().optional(),
  content: z.string().optional(),
  order: z.number().optional(),
  isVisible: z.boolean().optional(),
});

export type InsertProfileSection = z.infer<typeof insertProfileSectionSchema>;
export type UpdateProfileSection = z.infer<typeof updateProfileSectionSchema>;
export type ProfileSection = typeof profileSections.$inferSelect;

// Keep rest of schema minimal for space - only showing KG changes
export const briefingSettings = pgTable("briefing_settings", {
  id: text("id").primaryKey(),
  settingKey: text("setting_key").notNull().unique(),
  settingValue: text("setting_value").notNull(),
  description: text("description"),
  updatedAt: text("updated_at").notNull(),
});

export const insertBriefingSettingSchema = createInsertSchema(briefingSettings).omit({
  id: true,
  updatedAt: true,
});

export type InsertBriefingSetting = z.infer<typeof insertBriefingSettingSchema>;
export type BriefingSetting = typeof briefingSettings.$inferSelect;

export const briefingTypes = ["news_curated", "news_new", "weather", "system_health"] as const;
export type BriefingType = typeof briefingTypes[number];

export const briefingRecipients = pgTable("briefing_recipients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  briefingType: text("briefing_type", { enum: briefingTypes }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertBriefingRecipientSchema = createInsertSchema(briefingRecipients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBriefingRecipient = z.infer<typeof insertBriefingRecipientSchema>;
export type BriefingRecipient = typeof briefingRecipients.$inferSelect;

export const briefingDeliveryLog = pgTable("briefing_delivery_log", {
  id: text("id").primaryKey(),
  briefingType: text("briefing_type", { enum: briefingTypes }).notNull(),
  recipientPhone: text("recipient_phone").notNull(),
  content: text("content").notNull(),
  twilioMessageId: text("twilio_message_id"),
  status: text("status", { enum: ["pending", "sent", "failed"] }).notNull().default("pending"),
  sentAt: text("sent_at"),
  createdAt: text("created_at").notNull(),
});

export const insertBriefingDeliveryLogSchema = createInsertSchema(briefingDeliveryLog).omit({
  id: true,
  createdAt: true,
});

export type InsertBriefingDeliveryLog = z.infer<typeof insertBriefingDeliveryLogSchema>;
export type BriefingDeliveryLog = typeof briefingDeliveryLog.$inferSelect;

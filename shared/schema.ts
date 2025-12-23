import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Conversations table
export const conversations = sqliteTable("conversations", {
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
export const messages = sqliteTable("messages", {
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
export const memoryNotes = sqliteTable("memory_notes", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["summary", "note", "preference", "fact"] }).notNull(),
  content: text("content").notNull(),
  context: text("context").notNull().default(""),
  embedding: text("embedding"),
  isSuperseded: integer("is_superseded", { mode: "boolean" }).notNull().default(false),
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
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true), // Mark for pruning
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

export const coreConcepts = sqliteTable("core_concepts", {
  id: text("id").primaryKey(),
  type: text("type", { enum: conceptTypes }).notNull(),
  concept: text("concept").notNull(),
  description: text("description").notNull(),
  examples: text("examples"),
  sourceMemoryIds: text("source_memory_ids"),
  confidenceScore: text("confidence_score").default("0.7"),
  usageCount: integer("usage_count").default(0),
  lastUsedAt: text("last_used_at"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
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
export const conversationMetrics = sqliteTable("conversation_metrics", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  messageId: text("message_id"), // Optional: link to specific message
  // Tool usage tracking
  toolName: text("tool_name"),
  toolOutcome: text("tool_outcome", { enum: toolOutcomes }),
  toolDurationMs: integer("tool_duration_ms"),
  toolErrorMessage: text("tool_error_message"),
  // Conversation quality signals
  requiredFollowUp: integer("required_follow_up", { mode: "boolean" }).default(false),
  userRetried: integer("user_retried", { mode: "boolean" }).default(false), // User asked same thing again
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
export const groceryItems = sqliteTable("grocery_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  quantity: text("quantity").default("1"),
  category: text("category").default("Other"),
  addedBy: text("added_by").notNull(),
  purchased: integer("purchased", { mode: "boolean" }).notNull().default(false),
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
export const groceryHistory = sqliteTable("grocery_history", {
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
export const reminders = sqliteTable("reminders", {
  id: text("id").primaryKey(),
  message: text("message").notNull(),
  recipientPhone: text("recipient_phone"),
  conversationId: text("conversation_id"),
  scheduledFor: text("scheduled_for").notNull(),
  createdAt: text("created_at").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
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
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").default(""),
  priority: text("priority", { enum: ["low", "medium", "high"] }).notNull().default("medium"),
  dueDate: text("due_date"),
  category: text("category", { enum: ["work", "personal", "family"] }).notNull().default("personal"),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
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
export const calendarEvents = sqliteTable("calendar_events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").default(""),
  start: text("start").notNull(),
  end: text("end").notNull(),
  location: text("location"),
  isAllDay: integer("is_all_day", { mode: "boolean" }).notNull().default(false),
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
export const contacts = sqliteTable("contacts", {
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
  canAccessPersonalInfo: integer("can_access_personal_info", { mode: "boolean" }).notNull().default(false),
  canAccessCalendar: integer("can_access_calendar", { mode: "boolean" }).notNull().default(false),
  canAccessTasks: integer("can_access_tasks", { mode: "boolean" }).notNull().default(false),
  canAccessGrocery: integer("can_access_grocery", { mode: "boolean" }).notNull().default(false),
  canSetReminders: integer("can_set_reminders", { mode: "boolean" }).notNull().default(false),
  birthday: text("birthday"),
  occupation: text("occupation"),
  organization: text("organization"),
  lastInteractionAt: text("last_interaction_at"),
  interactionCount: integer("interaction_count").notNull().default(0),
  metadata: text("metadata"),
  isAutoCreated: integer("is_auto_created", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Note types for contact observations
export const contactNoteTypes = ["interaction", "observation", "comment", "fact"] as const;
export type ContactNoteType = typeof contactNoteTypes[number];

// Contact notes table for ZEKE's observations about people
export const contactNotes = sqliteTable("contact_notes", {
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
export const contactFaces = sqliteTable("contact_faces", {
  id: text("id").primaryKey(),
  contactId: text("contact_id").notNull(),
  sourceImageId: text("source_image_id"), // Reference to stored_images
  facePosition: text("face_position"), // left/center/right in source image
  faceDescription: text("face_description").notNull(), // AI-generated description
  distinguishingFeatures: text("distinguishing_features"), // JSON array of notable features
  estimatedAge: text("estimated_age"),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
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

// Master admin phone number
export const MASTER_ADMIN_PHONE = "6176868763";

// Check if a phone number is the master admin
export function isMasterAdmin(phoneNumber: string): boolean {
  const normalized = phoneNumber.replace(/\D/g, "");
  return normalized === MASTER_ADMIN_PHONE || normalized.endsWith(MASTER_ADMIN_PHONE);
}

// Automation types for recurring scheduled jobs
export const automationTypes = ["morning_briefing", "scheduled_sms", "daily_checkin", "task_followup", "weather_report"] as const;
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

// User profile table for storing detailed personal context about Nate
export const userProfile = sqliteTable("user_profile", {
  id: text("id").primaryKey(),
  section: text("section").notNull(),
  data: text("data").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertProfileSchema = createInsertSchema(userProfile).omit({
  id: true,
  updatedAt: true,
});

export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type UserProfile = typeof userProfile.$inferSelect;

// Profile section types for structured data
export const profileSections = [
  "basic_info",
  "work",
  "family",
  "interests",
  "preferences",
  "goals",
  "health",
  "routines",
  "important_dates",
  "custom"
] as const;
export type ProfileSection = typeof profileSections[number];

// Structured profile data types
export interface BasicInfoData {
  fullName: string;
  nickname?: string;
  email?: string;
  phone?: string;
  location?: string;
  birthday?: string;
  bio?: string;
}

export interface WorkData {
  company?: string;
  role?: string;
  industry?: string;
  workStyle?: string;
  careerGoals?: string;
  workSchedule?: string;
  notes?: string;
}

// Family member reference with optional contact linking (for profile data)
export interface FamilyMemberRef {
  contactId?: string;    // Optional: links to an existing contact for rich context
  displayName: string;   // Display name (from contact or manually entered)
}

export interface FamilyData {
  relationshipStatus?: string;
  spouse?: FamilyMemberRef;
  children?: FamilyMemberRef[];
  parents?: FamilyMemberRef[];
  siblings?: FamilyMemberRef[];
  pets?: string[];
  notes?: string;
}

export interface InterestsData {
  hobbies?: string[];
  sports?: string[];
  music?: string[];
  movies?: string[];
  books?: string[];
  travel?: string[];
  other?: string[];
}

export interface PreferencesData {
  communicationStyle?: string;
  foodPreferences?: string;
  dietaryRestrictions?: string[];
  coffeeOrTea?: string;
  morningOrNight?: string;
  workFromHome?: string;
  other?: string;
}

export interface GoalsData {
  shortTerm?: string[];
  longTerm?: string[];
  thisYear?: string[];
  thisMonth?: string[];
  notes?: string;
}

export interface HealthData {
  exerciseRoutine?: string;
  diet?: string;
  sleepSchedule?: string;
  allergies?: string[];
  medications?: string;
  notes?: string;
}

export interface RoutinesData {
  morning?: string;
  evening?: string;
  workday?: string;
  weekend?: string;
  notes?: string;
}

export interface ImportantDateData {
  name: string;
  date: string;
  type: string;
  recurring?: boolean;
  notes?: string;
}

export interface CustomFieldData {
  label: string;
  value: string;
}

// Full profile type
export interface FullProfile {
  basicInfo?: BasicInfoData;
  work?: WorkData;
  family?: FamilyData;
  interests?: InterestsData;
  preferences?: PreferencesData;
  goals?: GoalsData;
  health?: HealthData;
  routines?: RoutinesData;
  importantDates?: ImportantDateData[];
  custom?: CustomFieldData[];
}

// Twilio message directions and statuses
export const twilioMessageDirections = ["inbound", "outbound"] as const;
export type TwilioMessageDirection = typeof twilioMessageDirections[number];

export const twilioMessageStatuses = ["queued", "sending", "sent", "delivered", "failed", "received"] as const;
export type TwilioMessageStatus = typeof twilioMessageStatuses[number];

// Sources that can trigger outbound SMS
export const twilioMessageSources = [
  "webhook",           // Inbound message from Twilio webhook
  "send_sms_tool",     // AI agent's send_sms tool  
  "reminder",          // Reminder system
  "automation",        // Scheduled automations
  "daily_checkin",     // Daily check-in system
  "web_ui",            // Direct send from web UI
  "reply",             // Reply to incoming SMS
  "context_agent",     // ZEKE Context Agent voice commands
  "notification_batch" // Smart notification batching system
] as const;
export type TwilioMessageSource = typeof twilioMessageSources[number];

// Twilio messages table for logging all SMS activity
export const twilioMessages = sqliteTable("twilio_messages", {
  id: text("id").primaryKey(),
  twilioSid: text("twilio_sid"),
  direction: text("direction", { enum: twilioMessageDirections }).notNull(),
  status: text("status", { enum: twilioMessageStatuses }).notNull(),
  source: text("source", { enum: twilioMessageSources }).notNull(),
  fromNumber: text("from_number").notNull(),
  toNumber: text("to_number").notNull(),
  body: text("body").notNull(),
  contactId: text("contact_id"),
  contactName: text("contact_name"),
  conversationId: text("conversation_id"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull(),
});

export const insertTwilioMessageSchema = createInsertSchema(twilioMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertTwilioMessage = z.infer<typeof insertTwilioMessageSchema>;
export type TwilioMessage = typeof twilioMessages.$inferSelect;

// ============================================
// OUTBOUND MESSAGE TRACKING (for feedback loop)
// ============================================

// Outbound messages table - tracks all SMS sent out with reference codes
export const outboundMessages = sqliteTable("outbound_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id"),
  toPhone: text("to_phone").notNull(),
  fromPhone: text("from_phone").notNull(),
  twilioMessageSid: text("twilio_message_sid"),
  refCode: text("ref_code").notNull(), // Short code like K7Q2 for user feedback
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertOutboundMessageSchema = createInsertSchema(outboundMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertOutboundMessage = z.infer<typeof insertOutboundMessageSchema>;
export type OutboundMessage = typeof outboundMessages.$inferSelect;

// ============================================
// FEEDBACK EVENTS (user reactions to messages)
// ============================================

// Feedback event types
export const reactionTypes = ["liked", "disliked", "loved", "laughed", "emphasized", "questioned", "unknown"] as const;
export type ReactionType = typeof reactionTypes[number];

// Feedback events table - tracks user reactions and feedback
export const feedbackEvents = sqliteTable("feedback_events", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  source: text("source", { enum: ["sms", "app"] }).notNull(),
  feedback: integer("feedback").notNull(), // +1 or -1
  reactionType: text("reaction_type", { enum: reactionTypes }).notNull().default("unknown"),
  inboundMessageSid: text("inbound_message_sid"), // Original Twilio SID if replying
  targetOutboundMessageId: text("target_outbound_message_id"), // Reference to outbound_messages.id
  targetRefCode: text("target_ref_code"), // Short code feedback is for
  quotedText: text("quoted_text"), // What text the user is reacting to
  rawBody: text("raw_body").notNull(), // Full user response/feedback
  reason: text("reason"), // Why they liked/disliked
  createdAt: text("created_at").notNull(),
});

export const insertFeedbackEventSchema = createInsertSchema(feedbackEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertFeedbackEvent = z.infer<typeof insertFeedbackEventSchema>;
export type FeedbackEvent = typeof feedbackEvents.$inferSelect;

// ============================================
// SMART NOTIFICATION BATCHING SYSTEM
// ============================================

// Notification priority levels
export const notificationPriorities = ["urgent", "high", "normal", "low"] as const;
export type NotificationPriority = typeof notificationPriorities[number];

// Notification categories for grouping
export const notificationCategories = [
  "reminder",
  "task",
  "calendar",
  "insight",
  "grocery",
  "message",
  "alert",
  "system"
] as const;
export type NotificationCategory = typeof notificationCategories[number];

// Notification queue table for pending notifications
export const notificationQueue = sqliteTable("notification_queue", {
  id: text("id").primaryKey(),
  recipientPhone: text("recipient_phone").notNull(),
  category: text("category", { enum: notificationCategories }).notNull(),
  priority: text("priority", { enum: notificationPriorities }).notNull().default("normal"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  sourceType: text("source_type"),
  sourceId: text("source_id"),
  scheduledFor: text("scheduled_for"),
  sentAt: text("sent_at"),
  batchId: text("batch_id"),
  createdAt: text("created_at").notNull(),
});

export const insertNotificationQueueSchema = createInsertSchema(notificationQueue).omit({
  id: true,
  sentAt: true,
  batchId: true,
  createdAt: true,
});

export type InsertNotificationQueue = z.infer<typeof insertNotificationQueueSchema>;
export type NotificationQueueItem = typeof notificationQueue.$inferSelect;

// Notification preferences table for batch windows
export const notificationPreferences = sqliteTable("notification_preferences", {
  id: text("id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  batchingEnabled: integer("batching_enabled", { mode: "boolean" }).notNull().default(true),
  batchIntervalMinutes: integer("batch_interval_minutes").notNull().default(30),
  quietHoursEnabled: integer("quiet_hours_enabled", { mode: "boolean" }).notNull().default(true),
  quietHoursStart: text("quiet_hours_start").notNull().default("21:00"),
  quietHoursEnd: text("quiet_hours_end").notNull().default("08:00"),
  urgentBypassQuietHours: integer("urgent_bypass_quiet_hours", { mode: "boolean" }).notNull().default(true),
  maxBatchSize: integer("max_batch_size").notNull().default(5),
  categoryPreferences: text("category_preferences"),
  updatedAt: text("updated_at").notNull(),
});

export const insertNotificationPreferencesSchema = createInsertSchema(notificationPreferences).omit({
  id: true,
  updatedAt: true,
});

export type InsertNotificationPreferences = z.infer<typeof insertNotificationPreferencesSchema>;
export type NotificationPreferences = typeof notificationPreferences.$inferSelect;

// Category-specific preferences stored as JSON
export interface CategoryPreference {
  category: NotificationCategory;
  enabled: boolean;
  priority: NotificationPriority;
  batchable: boolean;
}

// Notification batch record for tracking sent batches
export const notificationBatches = sqliteTable("notification_batches", {
  id: text("id").primaryKey(),
  recipientPhone: text("recipient_phone").notNull(),
  notificationCount: integer("notification_count").notNull(),
  categories: text("categories").notNull(),
  sentAt: text("sent_at").notNull(),
});

export type NotificationBatch = typeof notificationBatches.$inferSelect;

// ============================================
// LOCATION INTELLIGENCE SYSTEM
// ============================================

// Location history table for GPS tracking with geocoding data from companion app
export const locationHistory = sqliteTable("location_history", {
  id: text("id").primaryKey(),
  latitude: text("latitude").notNull(),
  longitude: text("longitude").notNull(),
  accuracy: text("accuracy"),
  altitude: text("altitude"),
  speed: text("speed"),
  heading: text("heading"),
  source: text("source", { enum: ["gps", "network", "manual", "overland", "companion"] }).notNull().default("gps"),
  // Geocoding data from companion app
  city: text("city"),
  region: text("region"),
  country: text("country"),
  street: text("street"),
  postalCode: text("postal_code"),
  formattedAddress: text("formatted_address"),
  label: text("label"), // User-defined label (e.g., "Home", "Work")
  recordedAt: text("recorded_at"), // Device timestamp when location was captured
  createdAt: text("created_at").notNull(),
});

export const insertLocationHistorySchema = createInsertSchema(locationHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertLocationHistory = z.infer<typeof insertLocationHistorySchema>;
export type LocationHistory = typeof locationHistory.$inferSelect;

// Schema for companion app location history requests
export const companionLocationHistorySchema = z.object({
  latitude: z.union([z.string(), z.number()]),
  longitude: z.union([z.string(), z.number()]),
  altitude: z.union([z.string(), z.number()]).optional(),
  accuracy: z.union([z.string(), z.number()]).optional(),
  heading: z.union([z.string(), z.number()]).optional(),
  speed: z.union([z.string(), z.number()]).optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
  street: z.string().optional(),
  postalCode: z.string().optional(),
  formattedAddress: z.string().optional(),
  recordedAt: z.string().optional(),
  label: z.string().optional(),
});

export type CompanionLocationHistory = z.infer<typeof companionLocationHistorySchema>;

// Place categories for organization
export const placeCategories = [
  "home",
  "work", 
  "grocery",
  "restaurant",
  "gym",
  "healthcare",
  "entertainment",
  "shopping",
  "services",
  "travel",
  "personal",
  "other"
] as const;
export type PlaceCategory = typeof placeCategories[number];

// Saved places table for starred/favorite locations
export const verificationStatuses = ["pending", "verified", "mismatch"] as const;
export type VerificationStatus = typeof verificationStatuses[number];

export const verifiedByOptions = ["ai", "manual"] as const;
export type VerifiedBy = typeof verifiedByOptions[number];

export const savedPlaces = sqliteTable("saved_places", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  label: text("label"),
  latitude: text("latitude").notNull(),
  longitude: text("longitude").notNull(),
  address: text("address"),
  category: text("category", { enum: placeCategories }).notNull().default("other"),
  notes: text("notes"),
  isStarred: integer("is_starred", { mode: "boolean" }).notNull().default(false),
  proximityAlertEnabled: integer("proximity_alert_enabled", { mode: "boolean" }).notNull().default(false),
  proximityRadiusMeters: integer("proximity_radius_meters").notNull().default(200),
  verificationStatus: text("verification_status", { enum: verificationStatuses }).default("pending"),
  verificationConfidence: text("verification_confidence"),
  lastVerifiedAt: text("last_verified_at"),
  verifiedBy: text("verified_by", { enum: verifiedByOptions }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertSavedPlaceSchema = createInsertSchema(savedPlaces).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateSavedPlaceSchema = z.object({
  name: z.string().min(1).optional(),
  label: z.string().nullable().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  address: z.string().nullable().optional(),
  category: z.enum(placeCategories).optional(),
  notes: z.string().nullable().optional(),
  isStarred: z.boolean().optional(),
  proximityAlertEnabled: z.boolean().optional(),
  proximityRadiusMeters: z.number().optional(),
  verificationStatus: z.enum(verificationStatuses).optional(),
  verificationConfidence: z.string().nullable().optional(),
  lastVerifiedAt: z.string().nullable().optional(),
  verifiedBy: z.enum(verifiedByOptions).nullable().optional(),
});

export type InsertSavedPlace = z.infer<typeof insertSavedPlaceSchema>;
export type UpdateSavedPlace = z.infer<typeof updateSavedPlaceSchema>;
export type SavedPlace = typeof savedPlaces.$inferSelect;

// Place lists table for grouping locations (e.g., "All Stop & Shop locations")
export const placeLists = sqliteTable("place_lists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  color: text("color"),
  linkedToGrocery: integer("linked_to_grocery", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertPlaceListSchema = createInsertSchema(placeLists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updatePlaceListSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  linkedToGrocery: z.boolean().optional(),
});

export type InsertPlaceList = z.infer<typeof insertPlaceListSchema>;
export type UpdatePlaceList = z.infer<typeof updatePlaceListSchema>;
export type PlaceList = typeof placeLists.$inferSelect;

// Junction table linking places to lists
export const placeListItems = sqliteTable("place_list_items", {
  id: text("id").primaryKey(),
  placeListId: text("place_list_id").notNull().references(() => placeLists.id),
  savedPlaceId: text("saved_place_id").notNull().references(() => savedPlaces.id),
  addedAt: text("added_at").notNull(),
});

export const insertPlaceListItemSchema = createInsertSchema(placeListItems).omit({
  id: true,
  addedAt: true,
});

export type InsertPlaceListItem = z.infer<typeof insertPlaceListItemSchema>;
export type PlaceListItem = typeof placeListItems.$inferSelect;

// Location settings for user preferences
export const locationSettings = sqliteTable("location_settings", {
  id: text("id").primaryKey(),
  trackingEnabled: integer("tracking_enabled", { mode: "boolean" }).notNull().default(false),
  trackingIntervalMinutes: integer("tracking_interval_minutes").notNull().default(15),
  proximityAlertsEnabled: integer("proximity_alerts_enabled", { mode: "boolean" }).notNull().default(true),
  defaultProximityRadiusMeters: integer("default_proximity_radius_meters").notNull().default(200),
  retentionDays: integer("retention_days").notNull().default(30),
  updatedAt: text("updated_at").notNull(),
});

export const insertLocationSettingsSchema = createInsertSchema(locationSettings).omit({
  id: true,
  updatedAt: true,
});

export type InsertLocationSettings = z.infer<typeof insertLocationSettingsSchema>;
export type LocationSettings = typeof locationSettings.$inferSelect;

// Proximity alerts log for tracking when alerts are triggered
export const proximityAlerts = sqliteTable("proximity_alerts", {
  id: text("id").primaryKey(),
  savedPlaceId: text("saved_place_id").notNull().references(() => savedPlaces.id),
  placeListId: text("place_list_id"),
  distanceMeters: text("distance_meters").notNull(),
  alertType: text("alert_type", { enum: ["grocery", "reminder", "general"] }).notNull(),
  alertMessage: text("alert_message").notNull(),
  acknowledged: integer("acknowledged", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const insertProximityAlertSchema = createInsertSchema(proximityAlerts).omit({
  id: true,
  createdAt: true,
});

export type InsertProximityAlert = z.infer<typeof insertProximityAlertSchema>;
export type ProximityAlert = typeof proximityAlerts.$inferSelect;

// ============================================
// COMPANION APP LOCATION DATA
// ============================================

// GPS samples from companion app (raw location data)
export const locationSamples = sqliteTable("location_samples", {
  id: text("id").primaryKey(),
  latitude: text("latitude").notNull(),
  longitude: text("longitude").notNull(),
  accuracy: text("accuracy"), // meters
  altitude: text("altitude"), // meters
  speed: text("speed"), // m/s
  heading: text("heading"), // degrees
  batteryLevel: text("battery_level"), // 0-100
  activity: text("activity"), // Activity type detected by device (walking, driving, etc.)
  source: text("source", { enum: ["gps", "network", "fused", "manual"] }).default("gps"),
  timestamp: text("timestamp").notNull(), // ISO timestamp from device (recordedAt)
  createdAt: text("created_at").notNull(), // server receive time
});

export const insertLocationSampleSchema = createInsertSchema(locationSamples).omit({
  id: true,
  createdAt: true,
});

export type InsertLocationSample = z.infer<typeof insertLocationSampleSchema>;
export type LocationSample = typeof locationSamples.$inferSelect;

// Batch upload schema for companion app (original format)
export const locationSampleBatchSchema = z.object({
  samples: z.array(z.object({
    latitude: z.union([z.string(), z.number()]),
    longitude: z.union([z.string(), z.number()]),
    accuracy: z.union([z.string(), z.number()]).optional(),
    altitude: z.union([z.string(), z.number()]).optional(),
    speed: z.union([z.string(), z.number()]).optional(),
    heading: z.union([z.string(), z.number()]).optional(),
    batteryLevel: z.union([z.string(), z.number()]).optional(),
    activity: z.string().optional(),
    source: z.enum(["gps", "network", "fused", "manual"]).optional(),
    timestamp: z.string(),
  })),
});

export type LocationSampleBatch = z.infer<typeof locationSampleBatchSchema>;

// New batch upload schema for companion app (with recordedAt format)
export const companionLocationSampleBatchSchema = z.object({
  samples: z.array(z.object({
    latitude: z.union([z.string(), z.number()]),
    longitude: z.union([z.string(), z.number()]),
    altitude: z.union([z.string(), z.number()]).optional(),
    accuracy: z.union([z.string(), z.number()]).optional(),
    heading: z.union([z.string(), z.number()]).optional(),
    speed: z.union([z.string(), z.number()]).optional(),
    activity: z.string().optional(),
    recordedAt: z.string(), // Device timestamp
  })),
});

export type CompanionLocationSampleBatch = z.infer<typeof companionLocationSampleBatchSchema>;

// Aggregated visit records (detected stays at locations)
export const locationVisits = sqliteTable("location_visits", {
  id: text("id").primaryKey(),
  latitude: text("latitude").notNull(), // center point
  longitude: text("longitude").notNull(),
  radiusMeters: text("radius_meters"), // visit area radius
  arrivalTime: text("arrival_time").notNull(),
  departureTime: text("departure_time"), // null if still there
  durationMinutes: integer("duration_minutes"),
  sampleCount: integer("sample_count").notNull().default(1),
  savedPlaceId: text("saved_place_id"), // linked to starred place if matched
  savedPlaceName: text("saved_place_name"),
  confidence: text("confidence", { enum: ["low", "medium", "high"] }).default("medium"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertLocationVisitSchema = createInsertSchema(locationVisits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLocationVisit = z.infer<typeof insertLocationVisitSchema>;
export type LocationVisit = typeof locationVisits.$inferSelect;

// ============================================
// LIFELOG-LOCATION CORRELATION SYSTEM
// ============================================

// Activity types inferred from GPS patterns
export const activityTypes = [
  "stationary",      // Not moving (general)
  "meeting",         // Stationary during business hours - likely in a meeting
  "walking",         // Slow movement - walking around
  "driving",         // Fast movement in vehicle
  "commuting",       // Regular commute patterns
  "transit",         // Public transit with stop-and-go patterns
  "at_home",         // At home location
  "at_work",         // At work location
  "at_known_place",  // At a saved place
  "unknown"          // Cannot determine
] as const;
export type ActivityType = typeof activityTypes[number];

// Lifelog-location correlation table
export const lifelogLocations = sqliteTable("lifelog_locations", {
  id: text("id").primaryKey(),
  lifelogId: text("lifelog_id").notNull(),
  lifelogTitle: text("lifelog_title").notNull(),
  lifelogStartTime: text("lifelog_start_time").notNull(),
  lifelogEndTime: text("lifelog_end_time").notNull(),
  // Location at start of lifelog
  startLatitude: text("start_latitude"),
  startLongitude: text("start_longitude"),
  startAccuracy: text("start_accuracy"),
  // Location at end of lifelog (may have moved)
  endLatitude: text("end_latitude"),
  endLongitude: text("end_longitude"),
  endAccuracy: text("end_accuracy"),
  // Matched saved place (if any)
  savedPlaceId: text("saved_place_id"),
  savedPlaceName: text("saved_place_name"),
  savedPlaceCategory: text("saved_place_category"),
  // Inferred activity based on GPS patterns
  activityType: text("activity_type", { enum: activityTypes }).default("unknown"),
  // GPS pattern metrics
  totalDistanceMeters: text("total_distance_meters"),
  averageSpeed: text("average_speed"),
  dwellTimeMinutes: text("dwell_time_minutes"),
  // Metadata
  locationConfidence: text("location_confidence").default("medium"), // low, medium, high
  correlatedAt: text("correlated_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertLifelogLocationSchema = createInsertSchema(lifelogLocations).omit({
  id: true,
  correlatedAt: true,
  createdAt: true,
});

export type InsertLifelogLocation = z.infer<typeof insertLifelogLocationSchema>;
export type LifelogLocation = typeof lifelogLocations.$inferSelect;

// Location context for a lifelog (used in context injection)
export interface LifelogLocationContext {
  lifelogId: string;
  lifelogTitle: string;
  startTime: string;
  endTime: string;
  location: {
    latitude: number;
    longitude: number;
    placeName?: string;
    placeCategory?: string;
    address?: string;
  } | null;
  activity: ActivityType;
  confidence: "low" | "medium" | "high";
}

// Unified timeline entry combining location and lifelogs
export interface TimelineEntry {
  id: string;
  type: "location" | "lifelog" | "combined";
  timestamp: string;
  endTimestamp?: string;
  // Location data
  location?: {
    latitude: number;
    longitude: number;
    placeName?: string;
    placeCategory?: string;
  };
  // Lifelog data
  lifelog?: {
    id: string;
    title: string;
    speakers?: string[];
    summary?: string;
  };
  // Activity inference
  activity?: ActivityType;
}

// Grocery item priority levels for smart reminders
export const groceryPriorities = ["low", "medium", "high", "urgent"] as const;
export type GroceryPriority = typeof groceryPriorities[number];

// ============================================
// ZEKE WAKE WORD CONTEXT AGENT
// ============================================

// Action types for wake word commands
export const wakeWordActionTypes = [
  "send_message",
  "set_reminder", 
  "add_task",
  "add_grocery_item",
  "schedule_event",
  "search_info",
  "get_weather",
  "get_time",
  "get_briefing",
  "unknown"
] as const;
export type WakeWordActionType = typeof wakeWordActionTypes[number];

// Execution status for wake word commands
export const wakeWordCommandStatuses = [
  "detected",      // Command detected, not yet parsed
  "parsed",        // Command parsed, ready for execution
  "executing",     // Currently executing
  "completed",     // Successfully executed
  "failed",        // Execution failed
  "skipped",       // Skipped (duplicate, invalid, etc.)
  "pending_approval" // Waiting for user approval (for sensitive actions)
] as const;
export type WakeWordCommandStatus = typeof wakeWordCommandStatuses[number];

// Wake word commands table for tracking detected and processed commands
export const wakeWordCommands = sqliteTable("wake_word_commands", {
  id: text("id").primaryKey(),
  lifelogId: text("lifelog_id").notNull(),
  lifelogTitle: text("lifelog_title").notNull(),
  wakeWord: text("wake_word").notNull(),
  rawCommand: text("raw_command").notNull(),
  speakerName: text("speaker_name"),
  timestamp: text("timestamp").notNull(),
  context: text("context"),
  actionType: text("action_type", { enum: wakeWordActionTypes }),
  actionDetails: text("action_details"),
  targetContactId: text("target_contact_id"),
  status: text("status", { enum: wakeWordCommandStatuses }).notNull().default("detected"),
  executionResult: text("execution_result"),
  confidence: text("confidence"),
  createdAt: text("created_at").notNull(),
  executedAt: text("executed_at"),
});

export const insertWakeWordCommandSchema = createInsertSchema(wakeWordCommands).omit({
  id: true,
  createdAt: true,
  executedAt: true,
});

export type InsertWakeWordCommand = z.infer<typeof insertWakeWordCommandSchema>;
export type WakeWordCommand = typeof wakeWordCommands.$inferSelect;

// Settings for the wake word context agent
export const contextAgentSettings = sqliteTable("context_agent_settings", {
  id: text("id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  scanIntervalMinutes: integer("scan_interval_minutes").notNull().default(5),
  lookbackHours: integer("lookback_hours").notNull().default(4),
  autoExecute: integer("auto_execute", { mode: "boolean" }).notNull().default(true),
  requireApprovalForSms: integer("require_approval_for_sms", { mode: "boolean" }).notNull().default(false),
  notifyOnExecution: integer("notify_on_execution", { mode: "boolean" }).notNull().default(true),
  lastScanAt: text("last_scan_at"),
  updatedAt: text("updated_at").notNull(),
});

export const insertContextAgentSettingsSchema = createInsertSchema(contextAgentSettings).omit({
  id: true,
  lastScanAt: true,
  updatedAt: true,
});

export type InsertContextAgentSettings = z.infer<typeof insertContextAgentSettingsSchema>;
export type ContextAgentSettings = typeof contextAgentSettings.$inferSelect;

// ============================================
// SHARED/CUSTOM LISTS SYSTEM
// ============================================

// Custom list types
export const customListTypes = ["todo", "packing", "shopping", "wishlist", "custom"] as const;
export type CustomListType = typeof customListTypes[number];

// Custom list priority levels for items
export const customListItemPriorities = ["low", "medium", "high"] as const;
export type CustomListItemPriority = typeof customListItemPriorities[number];

// Custom lists table for user-created lists
export const customLists = sqliteTable("custom_lists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: customListTypes }).notNull().default("custom"),
  icon: text("icon"),
  color: text("color"),
  isShared: integer("is_shared", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertCustomListSchema = createInsertSchema(customLists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateCustomListSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(customListTypes).optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  isShared: z.boolean().optional(),
});

export type InsertCustomList = z.infer<typeof insertCustomListSchema>;
export type UpdateCustomList = z.infer<typeof updateCustomListSchema>;
export type CustomList = typeof customLists.$inferSelect;

// Custom list items table for items within lists
export const customListItems = sqliteTable("custom_list_items", {
  id: text("id").primaryKey(),
  listId: text("list_id").notNull().references(() => customLists.id),
  content: text("content").notNull(),
  checked: integer("checked", { mode: "boolean" }).notNull().default(false),
  addedBy: text("added_by"),
  priority: text("priority", { enum: customListItemPriorities }).default("medium"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertCustomListItemSchema = createInsertSchema(customListItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateCustomListItemSchema = z.object({
  content: z.string().min(1).optional(),
  checked: z.boolean().optional(),
  addedBy: z.string().nullable().optional(),
  priority: z.enum(customListItemPriorities).optional(),
  notes: z.string().nullable().optional(),
});

export type InsertCustomListItem = z.infer<typeof insertCustomListItemSchema>;
export type UpdateCustomListItem = z.infer<typeof updateCustomListItemSchema>;
export type CustomListItem = typeof customListItems.$inferSelect;

// Custom list with items (for API responses)
export interface CustomListWithItems extends CustomList {
  items: CustomListItem[];
}

// ============================================
// FOOD PREFERENCE SYSTEM
// ============================================

// Family members table for tracking who has food preferences
export const familyMembers = sqliteTable("family_members", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: text("created_at").notNull(),
});

export const insertFamilyMemberSchema = createInsertSchema(familyMembers).omit({
  id: true,
  createdAt: true,
});

export const updateFamilyMemberSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export type InsertFamilyMember = z.infer<typeof insertFamilyMemberSchema>;
export type UpdateFamilyMember = z.infer<typeof updateFamilyMemberSchema>;
export type FamilyMember = typeof familyMembers.$inferSelect;

// Food preference item types
export const foodItemTypes = ["ingredient", "dish", "cuisine"] as const;
export type FoodItemType = typeof foodItemTypes[number];

// Food preference levels
export const foodPreferenceLevels = ["love", "like", "neutral", "dislike", "allergic"] as const;
export type FoodPreferenceLevel = typeof foodPreferenceLevels[number];

// Food preferences table for tracking likes/dislikes
export const foodPreferences = sqliteTable("food_preferences", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull(),
  itemType: text("item_type", { enum: foodItemTypes }).notNull(),
  itemName: text("item_name").notNull(),
  preference: text("preference", { enum: foodPreferenceLevels }).notNull(),
  strength: integer("strength").default(1),
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

// Dietary restriction types
export const dietaryRestrictionTypes = ["allergy", "intolerance", "religious", "health", "preference"] as const;
export type DietaryRestrictionType = typeof dietaryRestrictionTypes[number];

// Dietary restriction severity
export const dietaryRestrictionSeverities = ["strict", "moderate", "mild"] as const;
export type DietaryRestrictionSeverity = typeof dietaryRestrictionSeverities[number];

// Dietary restrictions table for allergies, religious, health restrictions
export const dietaryRestrictions = sqliteTable("dietary_restrictions", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull(),
  restrictionType: text("restriction_type", { enum: dietaryRestrictionTypes }).notNull(),
  restrictionName: text("restriction_name").notNull(),
  severity: text("severity", { enum: dietaryRestrictionSeverities }).default("strict"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const insertDietaryRestrictionSchema = createInsertSchema(dietaryRestrictions).omit({
  id: true,
  createdAt: true,
});

export type InsertDietaryRestriction = z.infer<typeof insertDietaryRestrictionSchema>;
export type DietaryRestriction = typeof dietaryRestrictions.$inferSelect;

// Meal types
export const mealTypes = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = typeof mealTypes[number];

// Meal history table for tracking meals cooked/eaten
export const mealHistory = sqliteTable("meal_history", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mealType: text("meal_type", { enum: mealTypes }).notNull(),
  cuisine: text("cuisine"),
  rating: integer("rating"),
  notes: text("notes"),
  recipeId: text("recipe_id"),
  cookedAt: text("cooked_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertMealHistorySchema = createInsertSchema(mealHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertMealHistory = z.infer<typeof insertMealHistorySchema>;
export type MealHistory = typeof mealHistory.$inferSelect;

// Recipe meal types (includes dessert)
export const recipeMealTypes = ["breakfast", "lunch", "dinner", "snack", "dessert"] as const;
export type RecipeMealType = typeof recipeMealTypes[number];

// Saved recipes table
export const savedRecipes = sqliteTable("saved_recipes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  cuisine: text("cuisine"),
  mealType: text("meal_type", { enum: recipeMealTypes }),
  prepTime: integer("prep_time"),
  cookTime: integer("cook_time"),
  servings: integer("servings"),
  ingredients: text("ingredients").notNull(),
  instructions: text("instructions").notNull(),
  source: text("source"),
  familyRating: integer("family_rating"),
  timesCooked: integer("times_cooked").default(0),
  isFavorite: integer("is_favorite", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertSavedRecipeSchema = createInsertSchema(savedRecipes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateSavedRecipeSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  cuisine: z.string().nullable().optional(),
  mealType: z.enum(recipeMealTypes).nullable().optional(),
  prepTime: z.number().nullable().optional(),
  cookTime: z.number().nullable().optional(),
  servings: z.number().nullable().optional(),
  ingredients: z.string().optional(),
  instructions: z.string().optional(),
  source: z.string().nullable().optional(),
  familyRating: z.number().min(1).max(5).nullable().optional(),
  timesCooked: z.number().optional(),
  isFavorite: z.boolean().optional(),
});

export type InsertSavedRecipe = z.infer<typeof insertSavedRecipeSchema>;
export type UpdateSavedRecipe = z.infer<typeof updateSavedRecipeSchema>;
export type SavedRecipe = typeof savedRecipes.$inferSelect;

// ============================================
// OMI AI SUMMARY SYSTEM
// ============================================

// Omi daily summaries table - stores AI-generated summaries of memory conversations
export const omiSummaries = sqliteTable("omi_summaries", {
  id: text("id").primaryKey(),
  date: text("date").notNull(), // YYYY-MM-DD format
  timeframeStart: text("timeframe_start").notNull(),
  timeframeEnd: text("timeframe_end").notNull(),
  summaryTitle: text("summary_title").notNull(),
  keyDiscussions: text("key_discussions").notNull(), // JSON array of discussion points
  actionItems: text("action_items").notNull(), // JSON array of action items extracted
  insights: text("insights"), // JSON array of notable insights/observations
  peopleInteracted: text("people_interacted"), // JSON array of people mentioned/spoken to
  topicsDiscussed: text("topics_discussed"), // JSON array of main topics
  memoryIds: text("memory_ids").notNull(), // JSON array of source Omi memory IDs
  memoryCount: integer("memory_count").notNull(),
  totalDurationMinutes: integer("total_duration_minutes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertOmiSummarySchema = createInsertSchema(omiSummaries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOmiSummary = z.infer<typeof insertOmiSummarySchema>;
export type OmiSummary = typeof omiSummaries.$inferSelect;

// Context categories for auto-tagging conversations/lifelogs
export const contextCategories = [
  "business_call",
  "customer_issue", 
  "family_planning",
  "personal_idea",
  "work_meeting",
  "social_conversation",
  "health_related",
  "financial_discussion",
  "planning_logistics",
  "learning_education",
  "casual_chat",
  "unknown"
] as const;
export type ContextCategory = typeof contextCategories[number];

// Omi memories cache - stores processed memories for local data fusion
export const omiMemories = sqliteTable("omi_memories", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  markdown: text("markdown"),
  summary: text("summary"),
  startTimestamp: text("start_timestamp").notNull(),
  endTimestamp: text("end_timestamp").notNull(),
  isStarred: integer("is_starred", { mode: "boolean" }).notNull().default(false),
  processedSuccessfully: integer("processed_successfully", { mode: "boolean" }).notNull().default(false),
  summaryId: text("summary_id"),
  // Context classification for intelligent retrieval
  contextCategory: text("context_category", { enum: contextCategories }).default("unknown"),
  contextConfidence: text("context_confidence").default("0.5"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertOmiMemorySchema = createInsertSchema(omiMemories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOmiMemory = z.infer<typeof insertOmiMemorySchema>;
export type OmiMemory = typeof omiMemories.$inferSelect;

// Weather records table - stores weather data for contextual predictions
export const weatherRecords = sqliteTable("weather_records", {
  id: text("id").primaryKey(),
  timestamp: text("timestamp").notNull(),
  temperature: text("temperature"),
  humidity: text("humidity"),
  conditions: text("conditions"),
  location: text("location"),
  createdAt: text("created_at").notNull(),
});

export const insertWeatherRecordSchema = createInsertSchema(weatherRecords).omit({
  id: true,
  createdAt: true,
});

export type InsertWeatherRecord = z.infer<typeof insertWeatherRecordSchema>;
export type WeatherRecord = typeof weatherRecords.$inferSelect;

// Parsed types for JSON fields in Omi summaries
export interface OmiDiscussionPoint {
  title: string;
  summary: string;
  participants?: string[];
  timeframe?: string;
}

export interface OmiActionItem {
  task: string;
  priority: "high" | "medium" | "low";
  assignee?: string;
  dueDate?: string;
  context?: string;
}

export interface OmiInsight {
  observation: string;
  category: "decision" | "idea" | "concern" | "opportunity" | "personal" | "other";
  importance: "high" | "medium" | "low";
}

export interface OmiAnalytics {
  dateRange: {
    start: string;
    end: string;
  };
  totalConversations: number;
  totalDurationMinutes: number;
  averageDurationMinutes: number;
  conversationsByDate: Array<{
    date: string;
    count: number;
    durationMinutes: number;
  }>;
  speakerStats: Array<{
    name: string;
    conversationCount: number;
    speakingTimeEstimate?: number;
  }>;
  topTopics: Array<{
    topic: string;
    frequency: number;
  }>;
  conversationsByHour: Array<{
    hour: number;
    count: number;
  }>;
}

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
export const entities = sqliteTable("entities", {
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
export const entityReferences = sqliteTable("entity_references", {
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
export const entityLinks = sqliteTable("entity_links", {
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
export const memoryRelationships = sqliteTable("memory_relationships", {
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
export const insights = sqliteTable("insights", {
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
// NATURAL LANGUAGE AUTOMATION SYSTEM
// ============================================

// Trigger types for NL automations
export const nlTriggerTypes = [
  "time",           // Cron-based triggers (e.g., "every morning at 9am")
  "event",          // Event-based triggers (e.g., "when I complete a task")
  "location",       // Location-based triggers (e.g., "when I arrive at home")
  "keyword",        // Keyword triggers in messages (e.g., "when someone mentions groceries")
  "condition"       // Condition-based triggers (e.g., "when tasks are overdue")
] as const;
export type NLTriggerType = typeof nlTriggerTypes[number];

// Action types for NL automations
export const nlActionTypes = [
  "send_sms",       // Send an SMS message
  "create_task",    // Create a new task
  "add_grocery",    // Add item to grocery list
  "set_reminder",   // Set a reminder
  "update_memory",  // Update or create a memory
  "generate_summary", // Generate a summary (tasks, calendar, etc.)
  "notify"          // Queue a notification (uses batching system)
] as const;
export type NLActionType = typeof nlActionTypes[number];

// Event types that can trigger automations
export const nlEventTypes = [
  "task_created",
  "task_completed",
  "task_overdue",
  "reminder_triggered",
  "grocery_purchased",
  "calendar_event_soon",
  "message_received",
  "location_changed"
] as const;
export type NLEventType = typeof nlEventTypes[number];

// NL Automations table - stores parsed natural language automation rules
export const nlAutomations = sqliteTable("nl_automations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  originalPhrase: text("original_phrase").notNull(),    // The natural language input
  triggerType: text("trigger_type", { enum: nlTriggerTypes }).notNull(),
  triggerConfig: text("trigger_config").notNull(),      // JSON config for trigger
  actionType: text("action_type", { enum: nlActionTypes }).notNull(),
  actionConfig: text("action_config").notNull(),        // JSON config for action
  conditions: text("conditions"),                        // Optional JSON conditions
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastTriggeredAt: text("last_triggered_at"),
  triggerCount: integer("trigger_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertNLAutomationSchema = createInsertSchema(nlAutomations).omit({
  id: true,
  lastTriggeredAt: true,
  triggerCount: true,
  createdAt: true,
  updatedAt: true,
});

export const updateNLAutomationSchema = z.object({
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  triggerConfig: z.string().optional(),
  actionConfig: z.string().optional(),
  conditions: z.string().nullable().optional(),
});

export type InsertNLAutomation = z.infer<typeof insertNLAutomationSchema>;
export type UpdateNLAutomation = z.infer<typeof updateNLAutomationSchema>;
export type NLAutomation = typeof nlAutomations.$inferSelect;

// Trigger config types
export interface TimeTriggerConfig {
  cronExpression: string;
  timezone?: string;
  description: string;  // Human-readable description
}

export interface EventTriggerConfig {
  eventType: NLEventType;
  filters?: Record<string, any>;  // Optional filters for the event
}

export interface LocationTriggerConfig {
  placeId?: string;
  placeName?: string;
  triggerOnArrive?: boolean;
  triggerOnLeave?: boolean;
}

export interface KeywordTriggerConfig {
  keywords: string[];
  matchAll?: boolean;  // Require all keywords to match
  caseSensitive?: boolean;
}

export interface ConditionTriggerConfig {
  conditionType: string;  // e.g., "tasks_overdue", "calendar_busy"
  threshold?: number;
  checkInterval?: string;  // Cron expression for checking
}

// Action config types
export interface SendSmsActionConfig {
  recipientPhone?: string;  // Optional, defaults to master admin
  messageTemplate: string;  // Template with {{variables}}
}

export interface CreateTaskActionConfig {
  titleTemplate: string;
  descriptionTemplate?: string;
  priority?: "low" | "medium" | "high";
  category?: "work" | "personal" | "family";
  dueDateOffset?: string;  // e.g., "+1d", "+1w"
}

export interface AddGroceryActionConfig {
  itemTemplate: string;
  quantity?: string;
  category?: string;
}

export interface SetReminderActionConfig {
  messageTemplate: string;
  timeOffset?: string;  // e.g., "+30m", "+1h"
}

export interface NotifyActionConfig {
  titleTemplate: string;
  contentTemplate: string;
  priority?: "urgent" | "high" | "normal" | "low";
  category?: string;
}

// NL Automation execution log
export const nlAutomationLogs = sqliteTable("nl_automation_logs", {
  id: text("id").primaryKey(),
  automationId: text("automation_id").notNull(),
  triggerData: text("trigger_data"),  // JSON with trigger context
  actionResult: text("action_result"),  // JSON with action outcome
  success: integer("success", { mode: "boolean" }).notNull(),
  errorMessage: text("error_message"),
  executedAt: text("executed_at").notNull(),
});

export type NLAutomationLog = typeof nlAutomationLogs.$inferSelect;

// ============================================
// OMI ENHANCED FEATURES
// ============================================

// Meetings table - tracks multi-speaker conversations detected as meetings
export const meetings = sqliteTable("meetings", {
  id: text("id").primaryKey(),
  lifelogId: text("lifelog_id").notNull(),
  title: text("title").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  participants: text("participants").notNull(), // JSON array of speaker names
  topics: text("topics"), // JSON array of detected topics
  summary: text("summary"), // AI-generated meeting summary
  actionItems: text("action_items"), // JSON array of action items
  isImportant: integer("is_important", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertMeetingSchema = createInsertSchema(meetings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMeeting = z.infer<typeof insertMeetingSchema>;
export type Meeting = typeof meetings.$inferSelect;

// Parsed types for meetings JSON fields
export interface MeetingParticipant {
  name: string;
  speakerIdentifier?: "user" | null;
  speakingTimeEstimate?: number;
}

export interface MeetingActionItem {
  task: string;
  assignee?: string;
  dueDate?: string;
  priority: "high" | "medium" | "low";
  sourceQuote?: string;
  createdTaskId?: string; // Link to tasks table if auto-created
}

// Lifelog action items table - commitments detected during real-time processing
export const lifelogActionItems = sqliteTable("lifelog_action_items", {
  id: text("id").primaryKey(),
  lifelogId: text("lifelog_id").notNull(),
  content: text("content").notNull(),
  assignee: text("assignee"), // Who committed to do this
  dueDate: text("due_date"),
  priority: text("priority", { enum: ["high", "medium", "low"] }).default("medium"),
  status: text("status", { enum: ["pending", "created_task", "dismissed"] }).default("pending"),
  sourceQuote: text("source_quote"), // Original transcript excerpt
  sourceOffsetMs: integer("source_offset_ms"), // Position in the recording
  linkedTaskId: text("linked_task_id"), // Created task ID if auto-created
  linkedContactId: text("linked_contact_id"), // Linked contact if assignee matched
  processedAt: text("processed_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertLifelogActionItemSchema = createInsertSchema(lifelogActionItems).omit({
  id: true,
  createdAt: true,
});

export type InsertLifelogActionItem = z.infer<typeof insertLifelogActionItemSchema>;
export type LifelogActionItem = typeof lifelogActionItems.$inferSelect;

// Omi analytics daily table - pre-aggregated daily analytics
export const omiAnalyticsDaily = sqliteTable("omi_analytics_daily", {
  id: text("id").primaryKey(),
  date: text("date").notNull(), // YYYY-MM-DD format
  totalConversations: integer("total_conversations").notNull().default(0),
  totalDurationMinutes: integer("total_duration_minutes").notNull().default(0),
  uniqueSpeakers: integer("unique_speakers").notNull().default(0),
  speakerStats: text("speaker_stats").notNull(), // JSON: {name: string, count: number, durationMinutes: number}[]
  topicStats: text("topic_stats").notNull(), // JSON: {topic: string, frequency: number}[]
  hourDistribution: text("hour_distribution").notNull(), // JSON: {hour: number, count: number}[]
  meetingCount: integer("meeting_count").notNull().default(0),
  actionItemsExtracted: integer("action_items_extracted").notNull().default(0),
  starredCount: integer("starred_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertOmiAnalyticsDailySchema = createInsertSchema(omiAnalyticsDaily).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOmiAnalyticsDaily = z.infer<typeof insertOmiAnalyticsDailySchema>;
export type OmiAnalyticsDaily = typeof omiAnalyticsDaily.$inferSelect;

// Parsed types for analytics JSON fields
export interface SpeakerStat {
  name: string;
  count: number;
  durationMinutes: number;
}

export interface TopicStat {
  topic: string;
  frequency: number;
}

export interface HourDistributionItem {
  hour: number;
  count: number;
}

// Omi digest preferences
export interface OmiDigestPreferences {
  enabled: boolean;
  phoneNumber?: string;
  sendTime: string; // HH:MM format, defaults to "20:00"
  includeSummary: boolean;
  includeActionItems: boolean;
  includeTopPeople: boolean;
  maxSmsLength: number; // Character limit, defaults to 700
}

// ============================================
// LOCATION CHECK-IN SYSTEM
// ============================================

// Location check-in event types
export const checkInEventTypes = ["arrival", "departure"] as const;
export type CheckInEventType = typeof checkInEventTypes[number];

// Location state tracking table - tracks current location state and check-in history
export const locationStateTracking = sqliteTable("location_state_tracking", {
  id: text("id").primaryKey(),
  savedPlaceId: text("saved_place_id").notNull(),
  savedPlaceName: text("saved_place_name").notNull(),
  eventType: text("event_type", { enum: checkInEventTypes }).notNull(),
  latitude: text("latitude").notNull(),
  longitude: text("longitude").notNull(),
  distanceMeters: text("distance_meters").notNull(),
  messageGenerated: text("message_generated"),
  smsSent: integer("sms_sent", { mode: "boolean" }).notNull().default(false),
  smsDeliveredAt: text("sms_delivered_at"),
  eventDetectedAt: text("event_detected_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertLocationStateTrackingSchema = createInsertSchema(locationStateTracking).omit({
  id: true,
  createdAt: true,
});

export type InsertLocationStateTracking = z.infer<typeof insertLocationStateTrackingSchema>;
export type LocationStateTracking = typeof locationStateTracking.$inferSelect;

// Location check-in settings
export interface LocationCheckInSettings {
  enabled: boolean;
  proximityThresholdMeters: number;  // Distance threshold for check-in detection (default: 150m)
  checkIntervalMinutes: number;       // How often to check location (default: 5 minutes)
  maxSmsPerDay: number;               // Max SMS messages per day (default: 10)
  minIntervalMinutes: number;         // Min time between SMS (default: 30 minutes)
  recipientPhone?: string;            // Phone to send SMS to (defaults to master admin)
}

// ============================================
// PREDICTIVE INTELLIGENCE ENGINE
// ============================================

// Prediction types for different categories of predictions
export const predictionTypes = [
  "schedule_optimization",
  "supply_management",
  "routine_deviation",
  "energy_pattern",
  "relationship_reminder",
  "business_forecast",
  "task_deadline_risk",
  "conflict_prevention",
  "wellness_suggestion",
  "proactive_preparation"
] as const;
export type PredictionType = typeof predictionTypes[number];

// Prediction confidence levels
export const predictionConfidenceLevels = ["very_high", "high", "medium", "low"] as const;
export type PredictionConfidenceLevel = typeof predictionConfidenceLevels[number];

// Prediction statuses
export const predictionStatuses = ["pending", "executed", "dismissed", "expired", "validated", "invalidated"] as const;
export type PredictionStatus = typeof predictionStatuses[number];

// Predictions table - stores AI-generated predictions about user needs
export const predictions = sqliteTable("predictions", {
  id: text("id").primaryKey(),
  type: text("type", { enum: predictionTypes }).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  confidenceScore: text("confidence_score").notNull(), // 0-1 scale, stored as text for precision
  confidenceLevel: text("confidence_level", { enum: predictionConfidenceLevels }).notNull(),
  status: text("status", { enum: predictionStatuses }).notNull().default("pending"),

  // What action should be taken
  suggestedAction: text("suggested_action").notNull(),
  actionData: text("action_data"), // JSON data for the action
  autoExecute: integer("auto_execute", { mode: "boolean" }).notNull().default(false),
  requiresUserApproval: integer("requires_user_approval", { mode: "boolean" }).notNull().default(true),

  // Prediction context
  reasoning: text("reasoning").notNull(), // Why this prediction was made
  dataSourcesUsed: text("data_sources_used").notNull(), // JSON array of data sources
  relatedPatternIds: text("related_pattern_ids"), // JSON array of pattern IDs

  // Timing
  predictedFor: text("predicted_for"), // When this prediction applies
  validUntil: text("valid_until"), // Expiration time for prediction
  executedAt: text("executed_at"),

  // Validation and learning
  userFeedback: text("user_feedback", { enum: ["helpful", "not_helpful", "inaccurate", "accurate"] }),
  userFeedbackNote: text("user_feedback_note"),
  validatedAt: text("validated_at"),
  validationResult: text("validation_result", { enum: ["correct", "incorrect", "partially_correct", "unknown"] }),

  // Metadata
  priority: text("priority", { enum: ["low", "medium", "high", "urgent"] }).notNull().default("medium"),
  impactScore: text("impact_score"), // 0-1 scale for potential impact
  notificationSent: integer("notification_sent", { mode: "boolean" }).notNull().default(false),
  notifiedAt: text("notified_at"),

  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertPredictionSchema = createInsertSchema(predictions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPrediction = z.infer<typeof insertPredictionSchema>;
export type Prediction = typeof predictions.$inferSelect;

// Pattern types for different categories of patterns
export const patternTypes = [
  "temporal",       // Time-based patterns (e.g., daily routines)
  "behavioral",     // Behavior patterns (e.g., task completion habits)
  "contextual",     // Context-based patterns (e.g., location-triggered behaviors)
  "seasonal",       // Seasonal/cyclical patterns
  "correlation",    // Correlated events
  "anomaly"        // Anomalous patterns (deviations from norm)
] as const;
export type PatternType = typeof patternTypes[number];

// Patterns table - stores discovered patterns from historical data
export const patterns = sqliteTable("patterns", {
  id: text("id").primaryKey(),
  type: text("type", { enum: patternTypes }).notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),

  // Pattern definition
  patternDefinition: text("pattern_definition").notNull(), // JSON describing the pattern
  frequency: text("frequency").notNull(), // How often this pattern occurs
  strength: text("strength").notNull(), // 0-1 scale for pattern strength

  // Data context
  dataSource: text("data_source").notNull(), // e.g., "calendar", "tasks", "location", "omi"
  sampleSize: integer("sample_size").notNull(), // Number of data points analyzed
  timeRangeStart: text("time_range_start").notNull(),
  timeRangeEnd: text("time_range_end").notNull(),

  // Pattern validation
  lastValidatedAt: text("last_validated_at"),
  validationCount: integer("validation_count").default(0),
  accuracyRate: text("accuracy_rate"), // 0-1 scale of prediction accuracy

  // Pattern status
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  isSuperseded: integer("is_superseded", { mode: "boolean" }).notNull().default(false),
  supersededBy: text("superseded_by"), // ID of pattern that replaced this

  // Usage tracking
  predictionCount: integer("prediction_count").default(0), // Times used for predictions
  lastUsedAt: text("last_used_at"),

  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertPatternSchema = createInsertSchema(patterns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPattern = z.infer<typeof insertPatternSchema>;
export type Pattern = typeof patterns.$inferSelect;

// Anticipatory actions - logs of proactive actions taken by ZEKE
export const anticipatoryActions = sqliteTable("anticipatory_actions", {
  id: text("id").primaryKey(),
  predictionId: text("prediction_id").notNull().references(() => predictions.id),
  actionType: text("action_type").notNull(), // e.g., "send_sms", "create_task", "adjust_calendar"
  actionDescription: text("action_description").notNull(),

  // Action details
  actionData: text("action_data").notNull(), // JSON of action parameters
  executedAt: text("executed_at").notNull(),

  // Results
  success: integer("success", { mode: "boolean" }).notNull(),
  result: text("result"), // JSON result from action
  errorMessage: text("error_message"),

  // User response
  userResponsed: integer("user_responsed", { mode: "boolean" }).notNull().default(false),
  userResponseType: text("user_response_type", { enum: ["positive", "negative", "neutral", "modified"] }),
  userResponseNote: text("user_response_note"),
  userRespondedAt: text("user_responded_at"),

  createdAt: text("created_at").notNull(),
});

export const insertAnicipatoryActionSchema = createInsertSchema(anticipatoryActions).omit({
  id: true,
  createdAt: true,
});

export type InsertAnticipatoryAction = z.infer<typeof insertAnicipatoryActionSchema>;
export type AnticipatoryAction = typeof anticipatoryActions.$inferSelect;

// Prediction feedback - tracks prediction accuracy for learning
export const predictionFeedback = sqliteTable("prediction_feedback", {
  id: text("id").primaryKey(),
  predictionId: text("prediction_id").notNull().references(() => predictions.id),

  // Feedback details
  wasAccurate: integer("was_accurate", { mode: "boolean" }).notNull(),
  accuracyScore: text("accuracy_score"), // 0-1 scale for partial accuracy
  feedbackType: text("feedback_type", { enum: ["explicit_user", "implicit_behavior", "outcome_validation"] }).notNull(),
  feedbackNote: text("feedback_note"),

  // What was learned
  lessonsLearned: text("lessons_learned"), // JSON array of insights
  adjustmentsMade: text("adjustments_made"), // JSON describing model adjustments

  // Impact on future predictions
  improvedConfidence: integer("improved_confidence", { mode: "boolean" }),
  affectedPatternIds: text("affected_pattern_ids"), // JSON array of patterns updated

  createdAt: text("created_at").notNull(),
});

export const insertPredictionFeedbackSchema = createInsertSchema(predictionFeedback).omit({
  id: true,
  createdAt: true,
});

export type InsertPredictionFeedback = z.infer<typeof insertPredictionFeedbackSchema>;
export type PredictionFeedback = typeof predictionFeedback.$inferSelect;

// Prediction settings and preferences
export interface PredictionSettings {
  enabled: boolean;
  autoExecuteHighConfidence: boolean; // Auto-execute predictions with >0.9 confidence
  minConfidenceForNotification: number; // Min confidence (0-1) to send notifications
  maxPredictionsPerDay: number;
  notifyVia: "sms" | "web" | "both";
  enabledPredictionTypes: PredictionType[];
  learningEnabled: boolean; // Whether to use feedback for learning
  analysisIntervalMinutes: number; // How often to run pattern analysis (default: 60)
}

// Extended prediction with related data
export interface PredictionWithDetails extends Prediction {
  relatedPatterns?: Pattern[];
  anticipatoryAction?: AnticipatoryAction;
  feedback?: PredictionFeedback;
}

// ============================================
// ZEKE ONTOLOGY PRIMITIVES (per ZEKE_ONTOLOGY.md)
// ============================================

// Resolution states for contradictions
export const contradictionResolutions = ["unexplained", "explained", "pattern_updated", "exception"] as const;
export type ContradictionResolution = typeof contradictionResolutions[number];

// Contradictions table - when observed behavior doesn't match stated preference or established pattern
export const contradictions = sqliteTable("contradictions", {
  id: text("id").primaryKey(),
  observation: text("observation").notNull(), // What was observed
  expected: text("expected").notNull(), // What was expected based on pattern/value
  patternId: text("pattern_id"), // Associated pattern if any
  memoryId: text("memory_id"), // Associated memory if any
  
  // Analysis
  possibleReasons: text("possible_reasons"), // JSON array of ZEKE's hypotheses
  resolution: text("resolution", { enum: contradictionResolutions }).default("unexplained"),
  userExplanation: text("user_explanation"), // If Nate explained why
  
  // Impact tracking
  impactLevel: text("impact_level", { enum: ["low", "medium", "high"] }).default("medium"),
  ledToPatternUpdate: integer("led_to_pattern_update", { mode: "boolean" }).default(false),
  ledToValueUpdate: integer("led_to_value_update", { mode: "boolean" }).default(false),
  
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
});

export const insertContradictionSchema = createInsertSchema(contradictions).omit({
  id: true,
  createdAt: true,
});

export type InsertContradiction = z.infer<typeof insertContradictionSchema>;
export type Contradiction = typeof contradictions.$inferSelect;

// Values table - what Nate prioritizes, revealed through choices and trade-offs
export const values = sqliteTable("values", {
  id: text("id").primaryKey(),
  name: text("name").notNull(), // The value (e.g., "family time", "career growth")
  stated: integer("stated", { mode: "boolean" }).default(false), // Explicitly stated
  inferred: integer("inferred", { mode: "boolean" }).default(false), // Inferred from behavior
  priority: integer("priority").default(5), // 1-10 relative importance
  
  // Evidence
  evidenceFor: text("evidence_for"), // JSON array of choices supporting this value
  evidenceAgainst: text("evidence_against"), // JSON array of choices contradicting this value
  conflicts: text("conflicts"), // JSON array of other value IDs this competes with
  
  // Tracking
  observationCount: integer("observation_count").default(0),
  lastObservedAt: text("last_observed_at"),
  
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertValueSchema = createInsertSchema(values).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertValue = z.infer<typeof insertValueSchema>;
export type Value = typeof values.$inferSelect;

// Stressor types
export const stressorTypes = ["person", "situation", "task", "environment", "time_pressure"] as const;
export type StressorType = typeof stressorTypes[number];

// Stressor frequency
export const stressorFrequencies = ["rare", "occasional", "frequent", "chronic"] as const;
export type StressorFrequency = typeof stressorFrequencies[number];

// Stressors table - situations that drain energy or trigger negative states
export const stressors = sqliteTable("stressors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: stressorTypes }).notNull(),
  
  // Details
  triggers: text("triggers"), // JSON array of what activates this stressor
  symptoms: text("symptoms"), // JSON array of observable effects
  copingStrategies: text("coping_strategies"), // JSON array of what helps
  
  // Metrics
  severity: integer("severity").default(5), // 1-10 impact level
  frequency: text("frequency", { enum: stressorFrequencies }).default("occasional"),
  
  // Tracking
  lastTriggeredAt: text("last_triggered_at"),
  triggerCount: integer("trigger_count").default(0),
  
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertStressorSchema = createInsertSchema(stressors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertStressor = z.infer<typeof insertStressorSchema>;
export type Stressor = typeof stressors.$inferSelect;

// Energy model table - Nate's available capacity across time dimensions
export const energyModel = sqliteTable("energy_model", {
  id: text("id").primaryKey(),
  
  // Time patterns
  timeOfDayPattern: text("time_of_day_pattern"), // JSON: hour ranges to energy level 1-10
  dayOfWeekPattern: text("day_of_week_pattern"), // JSON: day to energy level 1-10
  
  // Factors
  drains: text("drains"), // JSON array of what depletes energy
  restores: text("restores"), // JSON array of what replenishes energy
  
  // Current state
  currentLevel: integer("current_level"), // Estimated current energy 1-10
  lastUpdatedAt: text("last_updated_at"),
  
  // Seasonal patterns
  seasonalPatterns: text("seasonal_patterns"), // JSON for longer-term fluctuations
  
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertEnergyModelSchema = createInsertSchema(energyModel).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEnergyModel = z.infer<typeof insertEnergyModelSchema>;
export type EnergyModel = typeof energyModel.$inferSelect;

// ============================================
// OMI WEBHOOK INTEGRATION SYSTEM
// ============================================

// Status of Omi webhook processing
export const omiWebhookStatuses = ["received", "processing", "processed", "skipped", "failed"] as const;
export type OmiWebhookStatus = typeof omiWebhookStatuses[number];

// Types of Omi webhook triggers
export const omiTriggerTypes = ["memory_created", "transcript_segment", "audio_bytes"] as const;
export type OmiTriggerType = typeof omiTriggerTypes[number];

// Omi webhook lifelogs - stores raw webhook data from Omi app
export const omiWebhookLogs = sqliteTable("omi_webhook_logs", {
  id: text("id").primaryKey(),
  triggerType: text("trigger_type", { enum: omiTriggerTypes }).notNull(),
  omiSessionId: text("omi_session_id"), // Session ID from Omi
  omiMemoryId: text("omi_memory_id"), // Memory ID from Omi (for memory triggers)
  
  // Raw data from webhook
  rawPayload: text("raw_payload").notNull(), // Full JSON payload
  transcript: text("transcript"), // Extracted transcript text
  
  // Processing status
  status: text("status", { enum: omiWebhookStatuses }).notNull().default("received"),
  processedAt: text("processed_at"),
  errorMessage: text("error_message"),
  
  // Extracted data (JSON)
  extractedPeople: text("extracted_people"), // JSON array of people mentioned
  extractedTopics: text("extracted_topics"), // JSON array of topics
  extractedActionItems: text("extracted_action_items"), // JSON array of action items
  extractedInsights: text("extracted_insights"), // JSON array of insights
  extractedEmotions: text("extracted_emotions"), // JSON emotional context
  
  // Linking to Zeke's memory system
  createdMemoryNoteIds: text("created_memory_note_ids"), // JSON array of created memory note IDs
  createdContactIds: text("created_contact_ids"), // JSON array of new/updated contact IDs
  createdTaskIds: text("created_task_ids"), // JSON array of created task IDs
  
  // Metadata
  speakerCount: integer("speaker_count"),
  durationSeconds: integer("duration_seconds"),
  receivedAt: text("received_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertOmiWebhookLogSchema = createInsertSchema(omiWebhookLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertOmiWebhookLog = z.infer<typeof insertOmiWebhookLogSchema>;
export type OmiWebhookLog = typeof omiWebhookLogs.$inferSelect;

// Parsed types for Omi extraction
export interface OmiExtractedPerson {
  name: string;
  context: string; // How they were mentioned
  relationship?: string; // Inferred relationship
  sentiment?: "positive" | "neutral" | "negative";
}

export interface OmiExtractedTopic {
  topic: string;
  relevance: "high" | "medium" | "low";
  category?: string;
}

export interface OmiExtractedActionItem {
  task: string;
  owner?: string;
  dueDate?: string;
  priority: "high" | "medium" | "low";
  context: string;
}

export interface OmiExtractedInsight {
  insight: string;
  type: "decision" | "idea" | "preference" | "goal" | "concern" | "fact";
  confidence: "high" | "medium" | "low";
}

// Omi Chat Query request/response types
export const omiQueryRequestSchema = z.object({
  query: z.string().min(1),
  sessionId: z.string().optional(),
  context: z.string().optional(),
  limit: z.number().optional().default(10),
  executeActions: z.boolean().optional().default(false),
});

export type OmiQueryRequest = z.infer<typeof omiQueryRequestSchema>;

export interface OmiQueryResponse {
  answer: string;
  relevantMemories: Array<{
    id: string;
    content: string;
    type: string;
    confidence: number;
  }>;
  relatedPeople: Array<{
    name: string;
    context: string;
  }>;
  suggestedActions?: string[];
}

// Omi Memory Trigger webhook payload (from Omi docs)
export interface OmiMemoryTriggerPayload {
  memory: {
    id: string;
    created_at: string;
    started_at: string;
    finished_at: string;
    transcript: string;
    transcript_segments: Array<{
      text: string;
      speaker: string;
      speaker_id: number;
      is_user: boolean;
      start: number;
      end: number;
    }>;
    photos: string[];
    structured: {
      title: string;
      overview: string;
      emoji: string;
      category: string;
      action_items: Array<{
        description: string;
        completed: boolean;
      }>;
      events: Array<{
        title: string;
        description: string;
        start: string;
        duration: number;
        created: boolean;
      }>;
    };
    apps_response: Array<{
      app_id: string;
      content: string;
    }>;
    discarded: boolean;
    deleted: boolean;
    source: string;
    language: string;
    external_data: Record<string, unknown> | null;
    postprocessing: {
      status: string;
      model: string;
    } | null;
    status: string;
  };
  session_id: string;
  segments: Array<{
    text: string;
    speaker: string;
    speaker_id: number;
    is_user: boolean;
    start: number;
    end: number;
  }>;
}

// Omi Realtime Transcript webhook payload
export interface OmiTranscriptPayload {
  session_id: string;
  segments: Array<{
    text: string;
    speaker: string;
    speaker_id: number;
    is_user: boolean;
    start: number;
    end: number;
  }>;
}

// ============================================
// FEEDBACK LEARNING LOOP SYSTEM
// ============================================

// Action types that can be tracked for feedback learning
export const feedbackActionTypes = ["task_created", "event_created", "reminder_set", "sms_sent", "memory_saved", "grocery_added", "preference_set"] as const;
export type FeedbackActionType = typeof feedbackActionTypes[number];

// Outcome types for actions
export const actionOutcomeTypes = ["completed", "modified", "deleted", "ignored", "confirmed"] as const;
export type ActionOutcomeType = typeof actionOutcomeTypes[number];

// Action outcomes table - tracks what happens after ZEKE takes actions
export const actionOutcomes = sqliteTable("action_outcomes", {
  id: text("id").primaryKey(),
  actionType: text("action_type", { enum: feedbackActionTypes }).notNull(),
  actionId: text("action_id").notNull(),
  conversationId: text("conversation_id"),
  messageId: text("message_id"),
  outcomeType: text("outcome_type", { enum: actionOutcomeTypes }),
  timeToOutcomeMinutes: integer("time_to_outcome_minutes"),
  wasModifiedQuickly: integer("was_modified_quickly", { mode: "boolean" }).default(false),
  wasDeletedQuickly: integer("was_deleted_quickly", { mode: "boolean" }).default(false),
  originalValue: text("original_value"),
  modifiedValue: text("modified_value"),
  createdAt: text("created_at").notNull(),
  outcomeAt: text("outcome_at"),
});

export const insertActionOutcomeSchema = createInsertSchema(actionOutcomes).omit({
  id: true,
  createdAt: true,
  outcomeAt: true,
});

export type InsertActionOutcome = z.infer<typeof insertActionOutcomeSchema>;
export type ActionOutcome = typeof actionOutcomes.$inferSelect;

// Correction event types
export const correctionTypes = ["explicit", "implicit", "modification", "deletion", "retry"] as const;
export type CorrectionType = typeof correctionTypes[number];

// Correction events table - captures when user corrects ZEKE
export const correctionEvents = sqliteTable("correction_events", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  triggerMessageId: text("trigger_message_id"),
  correctionMessageId: text("correction_message_id"),
  correctionType: text("correction_type", { enum: correctionTypes }).notNull(),
  originalIntent: text("original_intent"),
  originalValue: text("original_value"),
  correctedValue: text("corrected_value"),
  correctionPattern: text("correction_pattern"),
  domain: text("domain"),
  extractedLesson: text("extracted_lesson"),
  createdAt: text("created_at").notNull(),
});

export const insertCorrectionEventSchema = createInsertSchema(correctionEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertCorrectionEvent = z.infer<typeof insertCorrectionEventSchema>;
export type CorrectionEvent = typeof correctionEvents.$inferSelect;

// Preference categories for learned preferences
export const learnedPreferenceCategories = [
  "timing",
  "communication",
  "task_defaults",
  "calendar_defaults",
  "disambiguation",
  "formatting",
  "priority",
  "workflow"
] as const;
export type LearnedPreferenceCategory = typeof learnedPreferenceCategories[number];

// Learned preferences table - stores preferences learned from patterns
export const learnedPreferences = sqliteTable("learned_preferences", {
  id: text("id").primaryKey(),
  category: text("category", { enum: learnedPreferenceCategories }).notNull(),
  preferenceKey: text("preference_key").notNull(),
  preferenceValue: text("preference_value").notNull(),
  description: text("description"),
  confidenceScore: text("confidence_score").notNull().default("0.5"),
  evidenceCount: integer("evidence_count").notNull().default(1),
  lastEvidenceAt: text("last_evidence_at"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  supersededBy: text("superseded_by"),
  sourceType: text("source_type", { enum: ["correction", "outcome", "explicit", "pattern"] }).notNull(),
  sourceIds: text("source_ids"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertLearnedPreferenceSchema = createInsertSchema(learnedPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateLearnedPreferenceSchema = z.object({
  preferenceValue: z.string().optional(),
  description: z.string().optional(),
  confidenceScore: z.string().optional(),
  evidenceCount: z.number().optional(),
  lastEvidenceAt: z.string().optional(),
  isActive: z.boolean().optional(),
  supersededBy: z.string().nullable().optional(),
});

export type InsertLearnedPreference = z.infer<typeof insertLearnedPreferenceSchema>;
export type UpdateLearnedPreference = z.infer<typeof updateLearnedPreferenceSchema>;
export type LearnedPreference = typeof learnedPreferences.$inferSelect;

// Learned preference with computed effectiveness
export interface LearnedPreferenceWithScore extends LearnedPreference {
  effectiveConfidence: number;
  reliability: "high" | "medium" | "low";
  recentlyUsed: boolean;
}

// Feedback learning statistics
export interface FeedbackLearningStats {
  totalActions: number;
  actionsWithOutcomes: number;
  quickModificationRate: number;
  quickDeletionRate: number;
  totalCorrections: number;
  correctionsByType: Record<CorrectionType, number>;
  totalLearnedPreferences: number;
  activePreferences: number;
  highConfidencePreferences: number;
  computedAt: string;
}

// Correction pattern detection result
export interface CorrectionDetection {
  isCorrection: boolean;
  correctionType: CorrectionType;
  pattern: string;
  originalValue?: string;
  correctedValue?: string;
  confidence: number;
}

// ============================================
// DOCUMENTS & FILES SYSTEM
// ============================================

// Document types
export const documentTypes = ["note", "document", "template", "reference"] as const;
export type DocumentType = typeof documentTypes[number];

// Folders table for organizing documents
export const folders = sqliteTable("folders", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  parentId: text("parent_id"),
  icon: text("icon"),
  color: text("color"),
  isExpanded: integer("is_expanded", { mode: "boolean" }).default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertFolderSchema = createInsertSchema(folders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateFolderSchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  isExpanded: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

export type InsertFolder = z.infer<typeof insertFolderSchema>;
export type UpdateFolder = z.infer<typeof updateFolderSchema>;
export type Folder = typeof folders.$inferSelect;

// Documents table for storing files and notes
export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  type: text("type", { enum: documentTypes }).notNull().default("note"),
  folderId: text("folder_id"),
  icon: text("icon"),
  color: text("color"),
  tags: text("tags"),
  isPinned: integer("is_pinned", { mode: "boolean" }).default(false),
  isArchived: integer("is_archived", { mode: "boolean" }).default(false),
  sortOrder: integer("sort_order").default(0),
  lastAccessedAt: text("last_accessed_at"),
  wordCount: integer("word_count").default(0),
  embedding: text("embedding"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateDocumentSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  type: z.enum(documentTypes).optional(),
  folderId: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  tags: z.string().nullable().optional(),
  isPinned: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  sortOrder: z.number().optional(),
  wordCount: z.number().optional(),
});

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type UpdateDocument = z.infer<typeof updateDocumentSchema>;
export type Document = typeof documents.$inferSelect;

// Document with folder info for API responses
export interface DocumentWithFolder extends Document {
  folder: Folder | null;
}

// Folder with children for tree structure
export interface FolderWithChildren extends Folder {
  children: FolderWithChildren[];
  documents: Document[];
}

// Document entity links for knowledge graph integration
export interface DocumentWithEntities extends Document {
  entities: Entity[];
  references: EntityReference[];
}

// ============================================
// STORED IMAGES (MMS/Object Storage)
// ============================================

export const imageCategories = [
  "selfie",
  "people_photo",
  "screenshot",
  "document",
  "receipt",
  "business_card",
  "location",
  "meme",
  "casual",
  "unknown",
] as const;
export type ImageCategory = typeof imageCategories[number];

export const storedImages = sqliteTable("stored_images", {
  id: text("id").primaryKey(),
  objectPath: text("object_path").notNull(),
  originalUrl: text("original_url"),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  hash: text("hash").notNull(),
  relevanceScore: integer("relevance_score").notNull(),
  category: text("category", { enum: imageCategories }).notNull(),
  senderPhone: text("sender_phone"),
  senderName: text("sender_name"),
  conversationId: text("conversation_id"),
  messageText: text("message_text"),
  detectedPeople: integer("detected_people"),
  detectedObjects: text("detected_objects"),
  extractedText: text("extracted_text"),
  isMemoryWorthy: integer("is_memory_worthy", { mode: "boolean" }),
  linkedMemoryId: text("linked_memory_id"),
  linkedContactId: text("linked_contact_id"),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at"),
});

export const insertStoredImageSchema = createInsertSchema(storedImages).omit({
  id: true,
  createdAt: true,
});

export type InsertStoredImage = z.infer<typeof insertStoredImageSchema>;
export type StoredImage = typeof storedImages.$inferSelect;

// ============================================
// UPLOADED FILES SYSTEM
// ============================================

// Supported file types for upload
export const uploadedFileTypes = [
  "image",    // jpg, png, gif, webp
  "pdf",      // PDF documents
  "document", // Word docs, text files
  "other"     // Other supported files
] as const;
export type UploadedFileType = typeof uploadedFileTypes[number];

// Processing status for uploaded files
export const fileProcessingStatuses = [
  "pending",     // Just uploaded, not yet processed
  "processing",  // Currently being analyzed
  "completed",   // Successfully processed
  "failed"       // Processing failed
] as const;
export type FileProcessingStatus = typeof fileProcessingStatuses[number];

// Uploaded files table
export const uploadedFiles = sqliteTable("uploaded_files", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileType: text("file_type", { enum: uploadedFileTypes }).notNull(),
  size: integer("size").notNull(),
  path: text("path").notNull(),
  conversationId: text("conversation_id"),
  messageId: text("message_id"),
  // Extracted content
  extractedText: text("extracted_text"),
  analysisResult: text("analysis_result"), // JSON string with structured analysis
  processingStatus: text("processing_status", { enum: fileProcessingStatuses }).notNull().default("pending"),
  processingError: text("processing_error"),
  // Metadata
  width: integer("width"),  // For images
  height: integer("height"), // For images
  pageCount: integer("page_count"), // For PDFs
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertUploadedFileSchema = createInsertSchema(uploadedFiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateUploadedFileSchema = z.object({
  extractedText: z.string().nullable().optional(),
  analysisResult: z.string().nullable().optional(),
  processingStatus: z.enum(fileProcessingStatuses).optional(),
  processingError: z.string().nullable().optional(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  pageCount: z.number().nullable().optional(),
  messageId: z.string().nullable().optional(),
  conversationId: z.string().nullable().optional(),
});

export type InsertUploadedFile = z.infer<typeof insertUploadedFileSchema>;
export type UpdateUploadedFile = z.infer<typeof updateUploadedFileSchema>;
export type UploadedFile = typeof uploadedFiles.$inferSelect;

// File with analysis result parsed
export interface UploadedFileWithAnalysis extends UploadedFile {
  analysis: {
    description?: string;
    extractedData?: Record<string, unknown>;
    tags?: string[];
    confidence?: number;
  } | null;
}

// ============================================
// JOURNAL / DAILY SUMMARY SYSTEM
// ============================================

// Journal entries table for storing nightly summaries
export const journalEntries = sqliteTable("journal_entries", {
  id: text("id").primaryKey(),
  date: text("date").notNull().unique(), // YYYY-MM-DD format, one entry per day
  title: text("title").notNull(),
  summary: text("summary").notNull(), // Main narrative summary
  insights: text("insights"), // JSON array of key insights/learnings
  metrics: text("metrics"), // JSON object with day metrics (messages, tasks, etc.)
  mood: text("mood"), // Overall detected mood for the day
  keyEvents: text("key_events"), // JSON array of key events
  highlights: text("highlights"), // JSON array of notable moments
  conversationCount: integer("conversation_count").default(0),
  taskCompletedCount: integer("task_completed_count").default(0),
  taskCreatedCount: integer("task_created_count").default(0),
  memoryCreatedCount: integer("memory_created_count").default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertJournalEntrySchema = createInsertSchema(journalEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type JournalEntry = typeof journalEntries.$inferSelect;

// Parsed journal entry with JSON fields expanded
export interface JournalEntryWithDetails extends JournalEntry {
  parsedInsights: string[];
  parsedMetrics: {
    conversationCount?: number;
    messageCount?: number;
    taskCompletedCount?: number;
    taskCreatedCount?: number;
    memoryCreatedCount?: number;
    calendarEventCount?: number;
    [key: string]: unknown;
  };
  parsedKeyEvents: Array<{
    time?: string;
    event: string;
    category?: string;
  }>;
  parsedHighlights: string[];
}

// ============================================
// AI USAGE LOGGING SYSTEM
// ============================================

// AI endpoint types
export const aiEndpoints = ["chat", "responses", "embeddings", "tts", "vision", "batch", "realtime"] as const;
export type AiEndpoint = typeof aiEndpoints[number];

// AI log status
export const aiLogStatuses = ["ok", "error", "timeout", "rate_limited"] as const;
export type AiLogStatus = typeof aiLogStatuses[number];

// AI logs table for tracking all AI API calls
export const aiLogs = sqliteTable("ai_logs", {
  id: text("id").primaryKey(),
  // Request identification
  timestamp: text("timestamp").notNull(), // UTC ISO timestamp
  requestId: text("request_id"), // From API response headers when available
  // Model info - EXACT string passed to API
  model: text("model").notNull(),
  endpoint: text("endpoint", { enum: aiEndpoints }).notNull(),
  // Agent/caller identification
  agentId: text("agent_id"), // Which agent made the call (conductor, memory_curator, etc.)
  toolName: text("tool_name"), // If called from a tool
  conversationId: text("conversation_id"), // Associated conversation if any
  // Token usage
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  totalTokens: integer("total_tokens"),
  // Cost tracking (in cents for precision)
  inputCostCents: integer("input_cost_cents"),
  outputCostCents: integer("output_cost_cents"),
  totalCostCents: integer("total_cost_cents"),
  // Performance
  latencyMs: integer("latency_ms"),
  // Configuration snapshot
  temperature: text("temperature"),
  maxTokens: integer("max_tokens"),
  systemPromptHash: text("system_prompt_hash"), // SHA256 hash of system prompt
  toolsEnabled: text("tools_enabled"), // JSON array of tool names
  // App metadata
  appVersion: text("app_version"), // Git SHA or version string
  // Status
  status: text("status", { enum: aiLogStatuses }).notNull().default("ok"),
  errorType: text("error_type"),
  errorMessage: text("error_message"),
  // Timestamps
  createdAt: text("created_at").notNull(),
});

export const insertAiLogSchema = createInsertSchema(aiLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertAiLog = z.infer<typeof insertAiLogSchema>;
export type AiLog = typeof aiLogs.$inferSelect;

// Aggregated AI usage stats
export interface AiUsageStats {
  periodStart: string;
  periodEnd: string;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostCents: number;
  averageLatencyMs: number;
  errorCount: number;
  errorRate: number;
  byModel: Record<string, {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    costCents: number;
    averageLatencyMs: number;
  }>;
  byAgent: Record<string, {
    calls: number;
    costCents: number;
  }>;
  byEndpoint: Record<string, {
    calls: number;
    costCents: number;
  }>;
}

// AI cost anomaly for alerting
export interface AiCostAnomaly {
  type: "spike" | "model_change" | "latency_increase" | "error_rate_increase";
  severity: "info" | "warning" | "critical";
  message: string;
  currentValue: number;
  previousValue: number;
  threshold: number;
  detectedAt: string;
}

// ============================================
// OVERNIGHT BATCH FACTORY SYSTEM
// ============================================

// Batch job types
export const batchJobTypes = [
  "NIGHTLY_ENRICHMENT",
  "FEEDBACK_REHAB", 
  "KG_REBUILD",
  "EVAL_GENERATION",
  "CORRELATION_NARRATIVE",
  "CALIBRATION_REVIEW",
  "SYSTEM_HEALTH_REPORT",
  "PATTERN_NARRATIVE",
  "MIDDAY_INCREMENTAL",
  "CONCEPT_REFLECTION",
  "DAILY_SUMMARY",
  "MORNING_BRIEFING",
  "OMI_DIGEST",
  "FEEDBACK_TRAINING",
  "ANTICIPATION_ENGINE",
  "KG_BACKFILL",
  "OMI_ANALYTICS",
  "OMI_MEETINGS",
  "OMI_ACTION_ITEMS",
  "SELF_UNDERSTANDING",
] as const;
export type BatchJobType = typeof batchJobTypes[number];

// Batch job statuses
export const batchJobStatuses = ["QUEUED", "SUBMITTED", "COMPLETED", "FAILED", "PARTIAL"] as const;
export type BatchJobStatus = typeof batchJobStatuses[number];

// Batch artifact types
export const batchArtifactTypes = [
  "MEMORY_SUMMARY",
  "KG_EDGES", 
  "FEEDBACK_FIX",
  "EVAL_TESTCASE",
  "CORRELATION_INSIGHT",
  "CALIBRATION_INSIGHT",
  "HEALTH_REPORT",
  "PATTERN_INSIGHT",
  "CORE_CONCEPT",
  "DAILY_SUMMARY_REPORT",
  "MORNING_BRIEFING_REPORT",
  "OMI_DIGEST_REPORT",
  "FEEDBACK_TRAINING_RESULT",
  "ANTICIPATION_INSIGHT",
  "OMI_ANALYTICS_REPORT",
  "OMI_MEETING_EXTRACTION",
  "OMI_ACTION_ITEM",
  "SELF_MODEL_UPDATE",
] as const;
export type BatchArtifactType = typeof batchArtifactTypes[number];

// Batch window types for scheduling
export type BatchWindow = "nightly" | "midday" | "on_demand";

// Batch job template for orchestrator
export interface BatchJobTemplate {
  type: BatchJobType;
  window: BatchWindow;
  priority: number;
  artifactTypes: BatchArtifactType[];
  requiresAI: boolean;
  estimatedTokensPerItem: number;
  description: string;
}

// Batch jobs table - tracks OpenAI Batch API submissions
export const batchJobs = sqliteTable("batch_jobs", {
  id: text("id").primaryKey(),
  type: text("type", { enum: batchJobTypes }).notNull(),
  status: text("status", { enum: batchJobStatuses }).notNull().default("QUEUED"),
  inputWindowStart: text("input_window_start").notNull(), // ISO timestamp
  inputWindowEnd: text("input_window_end").notNull(), // ISO timestamp
  openAiBatchId: text("openai_batch_id"), // Populated after submission
  idempotencyKey: text("idempotency_key").notNull().unique(), // Prevents duplicate runs
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  error: text("error"), // Error message if failed
  inputItemCount: integer("input_item_count").default(0), // Number of items submitted
  outputItemCount: integer("output_item_count").default(0), // Number of items returned
  model: text("model").notNull().default("gpt-4o"), // Model used for batch
  estimatedCostCents: integer("estimated_cost_cents"), // Pre-submission estimate
  actualCostCents: integer("actual_cost_cents"), // Post-completion actual cost
  submittedAt: text("submitted_at"), // When batch was submitted to OpenAI
  completedAt: text("completed_at"), // When batch finished
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertBatchJobSchema = createInsertSchema(batchJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBatchJob = z.infer<typeof insertBatchJobSchema>;
export type BatchJob = typeof batchJobs.$inferSelect;

// Batch artifacts table - stores derived data from batch processing
export const batchArtifacts = sqliteTable("batch_artifacts", {
  id: text("id").primaryKey(),
  batchJobId: text("batch_job_id").notNull().references(() => batchJobs.id),
  artifactType: text("artifact_type", { enum: batchArtifactTypes }).notNull(),
  sourceRef: text("source_ref").notNull(), // e.g., message_id(s), day_key, etc.
  payloadJson: text("payload_json").notNull(), // JSON blob with artifact data
  isProcessed: integer("is_processed", { mode: "boolean" }).notNull().default(false), // Whether artifact has been consumed
  processedAt: text("processed_at"), // When artifact was used
  createdAt: text("created_at").notNull(),
});

export const insertBatchArtifactSchema = createInsertSchema(batchArtifacts).omit({
  id: true,
  createdAt: true,
});

export type InsertBatchArtifact = z.infer<typeof insertBatchArtifactSchema>;
export type BatchArtifact = typeof batchArtifacts.$inferSelect;

// Batch model configuration table - hot-swappable models per job type
export const batchModelConfigs = sqliteTable("batch_model_configs", {
  id: text("id").primaryKey(),
  jobType: text("job_type").notNull().unique(), // BatchJobType or "GLOBAL_DEFAULT"
  model: text("model").notNull(), // e.g., "gpt-5.2-2025-12-11"
  maxTokens: integer("max_tokens").default(4096),
  temperature: text("temperature").default("0.7"),
  reasoningEffort: text("reasoning_effort"), // For reasoning models: low, medium, high
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  updatedBy: text("updated_by"), // Admin who made change
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertBatchModelConfigSchema = createInsertSchema(batchModelConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBatchModelConfig = z.infer<typeof insertBatchModelConfigSchema>;
export type BatchModelConfig = typeof batchModelConfigs.$inferSelect;

// Memory summary artifact payload structure
export interface MemorySummaryPayload {
  dayKey: string; // YYYY-MM-DD
  summaries: Array<{
    sourceMessageIds: string[];
    summary: string;
    tags: string[];
    importance: number; // 0-1
    surprise: number; // 0-1
    actionItems: Array<{
      text: string;
      dueDate: string | null; // YYYY-MM-DD or null
    }>;
  }>;
}

// Knowledge graph edges artifact payload structure
export interface KgEdgesPayload {
  entities: Array<{
    id: string; // canonical ID
    name: string;
    type: "PERSON" | "PLACE" | "ORG" | "DEVICE" | "PROJECT" | "OTHER";
    aliases: string[];
  }>;
  edges: Array<{
    from: string; // entity_id
    to: string; // entity_id
    relation: string; // OWNS, USES, LIKES, WORKS_ON, RELATED_TO, etc.
    confidence: number; // 0-1
    evidenceMessageIds: string[];
  }>;
}

// Feedback fix artifact payload structure
export interface FeedbackFixPayload {
  fixes: Array<{
    messageId: string;
    betterResponse: string;
    betterToolPlan: string[];
    rootCause: "style" | "tool_miss" | "hallucination" | "missing_context" | "other";
    newEvalTestcase: {
      prompt: string;
      expected: string;
      toolsExpected: string[];
    };
  }>;
}

// Eval testcase artifact payload structure
export interface EvalTestcasePayload {
  testcases: Array<{
    id: string;
    sourceMessageId: string;
    prompt: string;
    expectedBehavior: string;
    expectedTools: string[];
    category: string;
    severity: "critical" | "important" | "nice_to_have";
  }>;
}

// Batch job stats for observability
export interface BatchJobStats {
  totalJobs: number;
  byStatus: Record<BatchJobStatus, number>;
  byType: Record<BatchJobType, number>;
  lastCompletedAt: string | null;
  totalArtifactsProduced: number;
  totalCostCents: number;
  averageProcessingTimeMs: number;
}

// ============================================
// MOBILE APP PUSH NOTIFICATIONS
// ============================================

// Push token platforms
export const pushTokenPlatforms = ["ios", "android", "expo"] as const;
export type PushTokenPlatform = typeof pushTokenPlatforms[number];

// Push tokens table - stores Expo push notification tokens
export const pushTokens = sqliteTable("push_tokens", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  platform: text("platform", { enum: pushTokenPlatforms }).notNull(),
  deviceId: text("device_id"), // Unique device identifier
  deviceName: text("device_name"), // User-friendly device name
  appVersion: text("app_version"), // App version for compatibility
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastUsedAt: text("last_used_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertPushTokenSchema = createInsertSchema(pushTokens).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPushToken = z.infer<typeof insertPushTokenSchema>;
export type PushToken = typeof pushTokens.$inferSelect;

// Push token registration request schema (from mobile app)
export const registerPushTokenSchema = z.object({
  token: z.string().min(1, "Push token is required"),
  platform: z.enum(pushTokenPlatforms),
  deviceId: z.string().optional(),
  deviceName: z.string().optional(),
  appVersion: z.string().optional(),
});

export type RegisterPushTokenRequest = z.infer<typeof registerPushTokenSchema>;

// ============================================
// MOBILE API STANDARDIZED ERROR RESPONSE
// ============================================

// Standard mobile error response structure
export interface MobileApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

// Mobile error codes
export const mobileErrorCodes = {
  // Authentication errors
  AUTH_INVALID_SIGNATURE: "AUTH_INVALID_SIGNATURE",
  AUTH_EXPIRED_TIMESTAMP: "AUTH_EXPIRED_TIMESTAMP",
  AUTH_MISSING_HEADERS: "AUTH_MISSING_HEADERS",
  AUTH_REPLAY_DETECTED: "AUTH_REPLAY_DETECTED",
  
  // Validation errors
  VALIDATION_FAILED: "VALIDATION_FAILED",
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
  
  // Resource errors
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  
  // Server errors
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
} as const;

export type MobileErrorCode = typeof mobileErrorCodes[keyof typeof mobileErrorCodes];

// ============================================
// MOBILE SYNC STATE
// ============================================

// Sync state response - timestamps for delta sync
export interface SyncStateResponse {
  serverTime: string; // Current server time
  resources: {
    tasks: string | null; // Last modified timestamp
    reminders: string | null;
    groceryItems: string | null;
    contacts: string | null;
    savedPlaces: string | null;
    customLists: string | null;
    preferences: string | null;
  };
}

// Delta query schema for ?since= parameter
export const deltaQuerySchema = z.object({
  since: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(500).optional().default(100),
});

// ============================================
// DEVICE PAIRING / TOKEN AUTHENTICATION
// ============================================

// Device tokens table for mobile companion app authentication
export const deviceTokens = sqliteTable("device_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  token: text("token").notNull().unique(),
  deviceId: text("device_id").notNull().unique(),
  deviceName: text("device_name").notNull(),
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at").notNull(),
});

export const insertDeviceTokenSchema = createInsertSchema(deviceTokens).omit({
  id: true,
});

export type InsertDeviceToken = z.infer<typeof insertDeviceTokenSchema>;
export type DeviceToken = typeof deviceTokens.$inferSelect;

// Pairing attempts table for rate limiting
export const pairingAttempts = sqliteTable("pairing_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ipAddress: text("ip_address").notNull(),
  attemptedAt: text("attempted_at").notNull(),
  success: integer("success", { mode: "boolean" }).notNull().default(false),
});

export const insertPairingAttemptSchema = createInsertSchema(pairingAttempts).omit({
  id: true,
});

export type InsertPairingAttempt = z.infer<typeof insertPairingAttemptSchema>;
export type PairingAttempt = typeof pairingAttempts.$inferSelect;

// Pairing request schema
export const pairingRequestSchema = z.object({
  secret: z.string().min(1, "Secret is required"),
  deviceName: z.string().min(1, "Device name is required").max(255),
});

export type PairingRequest = z.infer<typeof pairingRequestSchema>;

// Pairing response types
export interface PairingSuccessResponse {
  deviceToken: string;
  deviceId: string;
  message: string;
}

export interface PairingErrorResponse {
  error: string;
}

// Verify response types
export interface VerifySuccessResponse {
  valid: true;
  deviceId: string;
}

export interface VerifyErrorResponse {
  valid: false;
  error: string;
}

// ============================================
// SMS PAIRING CODES
// ============================================

// SMS pairing codes for mobile device authentication
export const pairingCodes = sqliteTable("pairing_codes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull().unique(),
  code: text("code").notNull(),
  deviceName: text("device_name").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertPairingCodeSchema = createInsertSchema(pairingCodes).omit({
  id: true,
});

export type InsertPairingCode = z.infer<typeof insertPairingCodeSchema>;
export type PairingCode = typeof pairingCodes.$inferSelect;

// SMS pairing request schema
export const smsCodeRequestSchema = z.object({
  deviceName: z.string().min(1, "Device name is required").max(255),
});

export type SmsCodeRequest = z.infer<typeof smsCodeRequestSchema>;

// SMS code verification request schema
export const smsCodeVerifySchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
  code: z.string().length(4, "Code must be 4 digits").regex(/^\d{4}$/, "Code must be 4 digits"),
});

export type SmsCodeVerifyRequest = z.infer<typeof smsCodeVerifySchema>;

// SMS pairing response types
export interface SmsCodeRequestSuccessResponse {
  success: true;
  sessionId: string;
  expiresIn: number;
  message: string;
}

export interface SmsCodeRequestErrorResponse {
  success: false;
  error: string;
}

export interface SmsCodeVerifySuccessResponse {
  success: true;
  deviceToken: string;
  deviceId: string;
  message: string;
}

export interface SmsCodeVerifyErrorResponse {
  success: false;
  error: string;
  attemptsRemaining?: number;
}

export interface PairingStatusResponse {
  configured: boolean;
  pendingCodes: number;
}

// ============================================
// SPEECH-TO-TEXT (STT) PIPELINE
// ============================================

// STT codec types supported by the audio pipeline
export const sttCodecs = ["opus", "pcm16"] as const;
export type SttCodec = typeof sttCodecs[number];

// STT providers
export const sttProviders = ["deepgram", "whisper"] as const;
export type SttProvider = typeof sttProviders[number];

// STT sessions table - tracks audio streaming sessions
export const sttSessions = sqliteTable("stt_sessions", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull(),
  codec: text("codec", { enum: sttCodecs }).notNull().default("opus"),
  sampleRate: integer("sample_rate").notNull().default(16000),
  provider: text("provider", { enum: sttProviders }).notNull().default("deepgram"),
  frameFormat: text("frame_format").notNull().default("raw_opus_packets"),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  createdAt: text("created_at").notNull(),
});

export const insertSttSessionSchema = createInsertSchema(sttSessions).omit({
  createdAt: true,
});

export type InsertSttSession = z.infer<typeof insertSttSessionSchema>;
export type SttSession = typeof sttSessions.$inferSelect;

// STT segments table - stores transcript segments with speaker diarization
export const sttSegments = sqliteTable("stt_segments", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  speaker: text("speaker").notNull().default("SPEAKER_0"),
  startMs: integer("start_ms").notNull(),
  endMs: integer("end_ms").notNull(),
  text: text("text").notNull(),
  confidence: text("confidence").default("0.0"),
  isFinal: integer("is_final", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const insertSttSegmentSchema = createInsertSchema(sttSegments).omit({
  id: true,
  createdAt: true,
});

export type InsertSttSegment = z.infer<typeof insertSttSegmentSchema>;
export type SttSegment = typeof sttSegments.$inferSelect;

// Normalized transcript segment event sent to clients
export interface TranscriptSegmentEvent {
  type: "transcript_segment";
  sessionId: string;
  speaker: string;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number;
  isFinal: boolean;
  provider: SttProvider;
}

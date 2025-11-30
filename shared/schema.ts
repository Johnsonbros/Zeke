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
  placeId: text("place_id"),
  contactId: text("contact_id"),
  sourceType: text("source_type", { enum: ["conversation", "lifelog", "manual", "observation"] }).default("conversation"),
  sourceId: text("source_id"),
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
  placeId: text("place_id"),
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
  birthday: text("birthday"),
  occupation: text("occupation"),
  organization: text("organization"),
  email: text("email"),
  lastInteractionAt: text("last_interaction_at"),
  interactionCount: integer("interaction_count").notNull().default(0),
  metadata: text("metadata"),
  isAutoCreated: integer("is_auto_created", { mode: "boolean" }).notNull().default(false),
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
  birthday: z.string().nullable().optional(),
  occupation: z.string().nullable().optional(),
  organization: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  lastInteractionAt: z.string().nullable().optional(),
  interactionCount: z.number().optional(),
  metadata: z.string().nullable().optional(),
  isAutoCreated: z.boolean().optional(),
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

export interface FamilyData {
  relationshipStatus?: string;
  spouse?: string;
  children?: string[];
  parents?: string;
  siblings?: string;
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
  "reply"              // Reply to incoming SMS
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
// LOCATION INTELLIGENCE SYSTEM
// ============================================

// Location history table for GPS tracking
export const locationHistory = sqliteTable("location_history", {
  id: text("id").primaryKey(),
  latitude: text("latitude").notNull(),
  longitude: text("longitude").notNull(),
  accuracy: text("accuracy"),
  altitude: text("altitude"),
  speed: text("speed"),
  heading: text("heading"),
  source: text("source", { enum: ["gps", "network", "manual"] }).notNull().default("gps"),
  createdAt: text("created_at").notNull(),
});

export const insertLocationHistorySchema = createInsertSchema(locationHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertLocationHistory = z.infer<typeof insertLocationHistorySchema>;
export type LocationHistory = typeof locationHistory.$inferSelect;

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

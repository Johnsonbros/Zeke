import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import type { 
  Conversation, 
  InsertConversation, 
  Message, 
  InsertMessage,
  MemoryNote,
  InsertMemoryNote,
  Preference,
  InsertPreference,
  GroceryItem,
  InsertGroceryItem,
  Reminder,
  InsertReminder,
  Task,
  InsertTask,
  UpdateTask,
  Contact,
  InsertContact,
  UpdateContact,
  AccessLevel,
  Automation,
  InsertAutomation,
  TwilioMessage,
  InsertTwilioMessage,
  TwilioMessageDirection,
  TwilioMessageStatus,
  TwilioMessageSource,
  LocationHistory,
  InsertLocationHistory,
  SavedPlace,
  InsertSavedPlace,
  UpdateSavedPlace,
  PlaceList,
  InsertPlaceList,
  UpdatePlaceList,
  PlaceListItem,
  InsertPlaceListItem,
  LocationSettings,
  InsertLocationSettings,
  ProximityAlert,
  InsertProximityAlert,
  PlaceCategory
} from "@shared/schema";
import { MASTER_ADMIN_PHONE, defaultPermissionsByLevel } from "@shared/schema";

// Initialize SQLite database
const db = new Database("zeke.db");
db.pragma("foreign_keys = ON");

// Database error class for typed error handling
export class DatabaseError extends Error {
  constructor(message: string, public readonly operation: string, public readonly cause?: unknown) {
    super(message);
    this.name = "DatabaseError";
  }
}

// Helper to wrap database operations with error handling
function wrapDbOperation<T>(operation: string, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    throw new DatabaseError(
      `Database operation failed: ${operation}`,
      operation,
      error
    );
  }
}

// Check if migration is needed (from old camelCase schema to new snake_case schema)
function needsMigration(): boolean {
  try {
    const tableInfo = db.prepare("PRAGMA table_info(conversations)").all() as Array<{ name: string }>;
    const hasOldSchema = tableInfo.some(col => col.name === "createdAt");
    const hasNewSchema = tableInfo.some(col => col.name === "created_at");
    return hasOldSchema && !hasNewSchema;
  } catch {
    return false;
  }
}

// Migrate from old camelCase schema to new snake_case schema
function migrateSchema(): void {
  console.log("Migrating database schema to snake_case...");
  
  db.exec(`
    -- Rename old tables
    ALTER TABLE conversations RENAME TO conversations_old;
    ALTER TABLE messages RENAME TO messages_old;
    ALTER TABLE memory_notes RENAME TO memory_notes_old;
    ALTER TABLE preferences RENAME TO preferences_old;
    
    -- Create new tables with snake_case columns
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Conversation',
      phone_number TEXT,
      source TEXT NOT NULL DEFAULT 'web',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'web',
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE memory_notes (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      context TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE preferences (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    
    -- Migrate data from old tables
    INSERT INTO conversations (id, title, phone_number, source, created_at, updated_at)
    SELECT id, title, NULL, source, createdAt, updatedAt FROM conversations_old;
    
    INSERT INTO messages (id, conversation_id, role, content, source, created_at)
    SELECT id, conversationId, role, content, source, createdAt FROM messages_old;
    
    INSERT INTO memory_notes (id, type, content, context, created_at, updated_at)
    SELECT id, type, content, COALESCE(context, ''), createdAt, updatedAt FROM memory_notes_old;
    
    INSERT INTO preferences (id, key, value, updated_at)
    SELECT id, key, value, updatedAt FROM preferences_old;
    
    -- Drop old tables
    DROP TABLE conversations_old;
    DROP TABLE messages_old;
    DROP TABLE memory_notes_old;
    DROP TABLE preferences_old;
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_memory_notes_type ON memory_notes(type);
    CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone_number);
  `);
  
  console.log("Database migration completed successfully.");
}

// Check if tables exist
function tablesExist(): boolean {
  const result = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='conversations'
  `).get();
  return !!result;
}

// Run migration if needed, otherwise create new tables
if (tablesExist()) {
  if (needsMigration()) {
    migrateSchema();
  }
} else {
  // Create new tables with snake_case column names to match Drizzle schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Conversation',
      phone_number TEXT,
      source TEXT NOT NULL DEFAULT 'web',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'web',
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS memory_notes (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      context TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS preferences (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_memory_notes_type ON memory_notes(type);
    CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone_number);
  `);
}

// Create grocery_items table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS grocery_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    quantity TEXT DEFAULT '1',
    category TEXT DEFAULT 'Other',
    added_by TEXT NOT NULL,
    purchased INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_grocery_purchased ON grocery_items(purchased);
  CREATE INDEX IF NOT EXISTS idx_grocery_category ON grocery_items(category);
`);

// Create reminders table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    message TEXT NOT NULL,
    recipient_phone TEXT,
    conversation_id TEXT,
    scheduled_for TEXT NOT NULL,
    created_at TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_reminders_scheduled ON reminders(scheduled_for);
  CREATE INDEX IF NOT EXISTS idx_reminders_completed ON reminders(completed);
`);

// Create tasks table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'medium',
    due_date TEXT,
    category TEXT NOT NULL DEFAULT 'personal',
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
  CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
  CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
  CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
`);

// Add place_id column to tasks table if it doesn't exist
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN place_id TEXT`);
} catch (e) {
  // Column may already exist, ignore error
}

// Add place_id column to reminders table if it doesn't exist  
try {
  db.exec(`ALTER TABLE reminders ADD COLUMN place_id TEXT`);
} catch (e) {
  // Column may already exist, ignore error
}

// Add place_id column to memory_notes table if it doesn't exist
try {
  db.exec(`ALTER TABLE memory_notes ADD COLUMN place_id TEXT`);
} catch (e) {
  // Column may already exist, ignore error
}

// Create contacts table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone_number TEXT NOT NULL UNIQUE,
    access_level TEXT NOT NULL DEFAULT 'unknown',
    relationship TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    can_access_personal_info INTEGER NOT NULL DEFAULT 0,
    can_access_calendar INTEGER NOT NULL DEFAULT 0,
    can_access_tasks INTEGER NOT NULL DEFAULT 0,
    can_access_grocery INTEGER NOT NULL DEFAULT 0,
    can_set_reminders INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number);
  CREATE INDEX IF NOT EXISTS idx_contacts_access_level ON contacts(access_level);
`);

// Create automations table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS automations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    recipient_phone TEXT,
    message TEXT,
    settings TEXT,
    last_run TEXT,
    next_run TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_automations_enabled ON automations(enabled);
  CREATE INDEX IF NOT EXISTS idx_automations_type ON automations(type);
  CREATE INDEX IF NOT EXISTS idx_automations_next_run ON automations(next_run);
`);

// Create user_profile table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS user_profile (
    id TEXT PRIMARY KEY,
    section TEXT NOT NULL UNIQUE,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_profile_section ON user_profile(section);
`);

// Create twilio_messages table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS twilio_messages (
    id TEXT PRIMARY KEY,
    twilio_sid TEXT,
    direction TEXT NOT NULL,
    status TEXT NOT NULL,
    source TEXT NOT NULL,
    from_number TEXT NOT NULL,
    to_number TEXT NOT NULL,
    body TEXT NOT NULL,
    contact_id TEXT,
    contact_name TEXT,
    conversation_id TEXT,
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_twilio_messages_direction ON twilio_messages(direction);
  CREATE INDEX IF NOT EXISTS idx_twilio_messages_created ON twilio_messages(created_at);
  CREATE INDEX IF NOT EXISTS idx_twilio_messages_from ON twilio_messages(from_number);
  CREATE INDEX IF NOT EXISTS idx_twilio_messages_to ON twilio_messages(to_number);
  CREATE INDEX IF NOT EXISTS idx_twilio_messages_contact ON twilio_messages(contact_id);
`);

// ============================================
// LOCATION INTELLIGENCE SYSTEM TABLES
// ============================================

// Create location_history table for GPS tracking
db.exec(`
  CREATE TABLE IF NOT EXISTS location_history (
    id TEXT PRIMARY KEY,
    latitude TEXT NOT NULL,
    longitude TEXT NOT NULL,
    accuracy TEXT,
    altitude TEXT,
    speed TEXT,
    heading TEXT,
    source TEXT NOT NULL DEFAULT 'gps',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_location_history_created ON location_history(created_at);
`);

// Create saved_places table for starred/favorite locations
db.exec(`
  CREATE TABLE IF NOT EXISTS saved_places (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    label TEXT,
    latitude TEXT NOT NULL,
    longitude TEXT NOT NULL,
    address TEXT,
    category TEXT NOT NULL DEFAULT 'other',
    notes TEXT,
    is_starred INTEGER NOT NULL DEFAULT 0,
    proximity_alert_enabled INTEGER NOT NULL DEFAULT 0,
    proximity_radius_meters INTEGER NOT NULL DEFAULT 200,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_saved_places_category ON saved_places(category);
  CREATE INDEX IF NOT EXISTS idx_saved_places_starred ON saved_places(is_starred);
  CREATE INDEX IF NOT EXISTS idx_saved_places_proximity ON saved_places(proximity_alert_enabled);
`);

// Create place_lists table for grouping locations
db.exec(`
  CREATE TABLE IF NOT EXISTS place_lists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    color TEXT,
    linked_to_grocery INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_place_lists_grocery ON place_lists(linked_to_grocery);
`);

// Create place_list_items junction table
db.exec(`
  CREATE TABLE IF NOT EXISTS place_list_items (
    id TEXT PRIMARY KEY,
    place_list_id TEXT NOT NULL,
    saved_place_id TEXT NOT NULL,
    added_at TEXT NOT NULL,
    FOREIGN KEY (place_list_id) REFERENCES place_lists(id) ON DELETE CASCADE,
    FOREIGN KEY (saved_place_id) REFERENCES saved_places(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_place_list_items_list ON place_list_items(place_list_id);
  CREATE INDEX IF NOT EXISTS idx_place_list_items_place ON place_list_items(saved_place_id);
`);

// Create location_settings table for user preferences
db.exec(`
  CREATE TABLE IF NOT EXISTS location_settings (
    id TEXT PRIMARY KEY,
    tracking_enabled INTEGER NOT NULL DEFAULT 0,
    tracking_interval_minutes INTEGER NOT NULL DEFAULT 15,
    proximity_alerts_enabled INTEGER NOT NULL DEFAULT 1,
    default_proximity_radius_meters INTEGER NOT NULL DEFAULT 200,
    retention_days INTEGER NOT NULL DEFAULT 30,
    updated_at TEXT NOT NULL
  );
`);

// Create proximity_alerts table for logging triggered alerts
db.exec(`
  CREATE TABLE IF NOT EXISTS proximity_alerts (
    id TEXT PRIMARY KEY,
    saved_place_id TEXT NOT NULL,
    place_list_id TEXT,
    distance_meters TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    alert_message TEXT NOT NULL,
    acknowledged INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (saved_place_id) REFERENCES saved_places(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_proximity_alerts_place ON proximity_alerts(saved_place_id);
  CREATE INDEX IF NOT EXISTS idx_proximity_alerts_created ON proximity_alerts(created_at);
  CREATE INDEX IF NOT EXISTS idx_proximity_alerts_acknowledged ON proximity_alerts(acknowledged);
`);

// Initialize default location settings if not exists
try {
  const existingSettings = db.prepare(`SELECT id FROM location_settings LIMIT 1`).get();
  if (!existingSettings) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO location_settings (id, tracking_enabled, tracking_interval_minutes, proximity_alerts_enabled, default_proximity_radius_meters, retention_days, updated_at)
      VALUES (?, 0, 15, 1, 200, 30, ?)
    `).run(uuidv4(), now);
    console.log("Initialized default location settings");
  }
} catch (e) {
  console.error("Error initializing location settings:", e);
}

// Migration: Add mode column to conversations if it doesn't exist
try {
  const convInfo = db.prepare("PRAGMA table_info(conversations)").all() as Array<{ name: string }>;
  if (!convInfo.some(col => col.name === "mode")) {
    console.log("Adding 'mode' column to conversations table...");
    db.exec(`ALTER TABLE conversations ADD COLUMN mode TEXT NOT NULL DEFAULT 'chat'`);
  }
} catch (e) {
  console.error("Migration error for conversations.mode:", e);
}

// Migration: Add supersession columns to memory_notes if they don't exist
try {
  const memInfo = db.prepare("PRAGMA table_info(memory_notes)").all() as Array<{ name: string }>;
  if (!memInfo.some(col => col.name === "is_superseded")) {
    console.log("Adding 'is_superseded' column to memory_notes table...");
    db.exec(`ALTER TABLE memory_notes ADD COLUMN is_superseded INTEGER NOT NULL DEFAULT 0`);
  }
  if (!memInfo.some(col => col.name === "superseded_by")) {
    console.log("Adding 'superseded_by' column to memory_notes table...");
    db.exec(`ALTER TABLE memory_notes ADD COLUMN superseded_by TEXT`);
  }
  if (!memInfo.some(col => col.name === "embedding")) {
    console.log("Adding 'embedding' column to memory_notes table for semantic search...");
    db.exec(`ALTER TABLE memory_notes ADD COLUMN embedding TEXT`);
  }
} catch (e) {
  console.error("Migration error for memory_notes:", e);
}

// Database row types (snake_case from SQLite)
interface ConversationRow {
  id: string;
  title: string;
  phone_number: string | null;
  source: string;
  mode: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  source: string;
  created_at: string;
}

interface MemoryNoteRow {
  id: string;
  type: string;
  content: string;
  context: string;
  embedding: string | null;
  is_superseded: number;
  superseded_by: string | null;
  place_id: string | null;
  contact_id: string | null;
  source_type: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
}

interface PreferenceRow {
  id: string;
  key: string;
  value: string;
  updated_at: string;
}

interface GroceryItemRow {
  id: string;
  name: string;
  quantity: string;
  category: string;
  added_by: string;
  purchased: number;
  created_at: string;
  updated_at: string;
}

interface ReminderRow {
  id: string;
  message: string;
  recipient_phone: string | null;
  conversation_id: string | null;
  scheduled_for: string;
  created_at: string;
  completed: number;
  place_id: string | null;
}

interface TaskRow {
  id: string;
  title: string;
  description: string;
  priority: string;
  due_date: string | null;
  category: string;
  completed: number;
  place_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ContactRow {
  id: string;
  name: string;
  phone_number: string;
  access_level: string;
  relationship: string;
  notes: string;
  can_access_personal_info: number;
  can_access_calendar: number;
  can_access_tasks: number;
  can_access_grocery: number;
  can_set_reminders: number;
  birthday: string | null;
  occupation: string | null;
  organization: string | null;
  email: string | null;
  last_interaction_at: string | null;
  interaction_count: number;
  metadata: string | null;
  is_auto_created: number;
  created_at: string;
  updated_at: string;
}

interface AutomationRow {
  id: string;
  name: string;
  type: string;
  cron_expression: string;
  enabled: number;
  recipient_phone: string | null;
  message: string | null;
  settings: string | null;
  last_run: string | null;
  next_run: string | null;
  created_at: string;
}

interface TwilioMessageRow {
  id: string;
  twilio_sid: string | null;
  direction: string;
  status: string;
  source: string;
  from_number: string;
  to_number: string;
  body: string;
  contact_id: string | null;
  contact_name: string | null;
  conversation_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
}

// Location system row types
interface LocationHistoryRow {
  id: string;
  latitude: string;
  longitude: string;
  accuracy: string | null;
  altitude: string | null;
  speed: string | null;
  heading: string | null;
  source: string;
  created_at: string;
}

interface SavedPlaceRow {
  id: string;
  name: string;
  label: string | null;
  latitude: string;
  longitude: string;
  address: string | null;
  category: string;
  notes: string | null;
  is_starred: number;
  proximity_alert_enabled: number;
  proximity_radius_meters: number;
  created_at: string;
  updated_at: string;
}

interface PlaceListRow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  linked_to_grocery: number;
  created_at: string;
  updated_at: string;
}

interface PlaceListItemRow {
  id: string;
  place_list_id: string;
  saved_place_id: string;
  added_at: string;
}

interface LocationSettingsRow {
  id: string;
  tracking_enabled: number;
  tracking_interval_minutes: number;
  proximity_alerts_enabled: number;
  default_proximity_radius_meters: number;
  retention_days: number;
  updated_at: string;
}

interface ProximityAlertRow {
  id: string;
  saved_place_id: string;
  place_list_id: string | null;
  distance_meters: string;
  alert_type: string;
  alert_message: string;
  acknowledged: number;
  created_at: string;
}

// Helper to map database row to Conversation type (snake_case -> camelCase)
function mapConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    phoneNumber: row.phone_number,
    source: row.source as "web" | "sms",
    mode: row.mode as "chat" | "getting_to_know",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Helper to map database row to Message type
function mapMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as "user" | "assistant",
    content: row.content,
    source: row.source as "web" | "sms",
    createdAt: row.created_at,
  };
}

// Helper to map database row to MemoryNote type
function mapMemoryNote(row: MemoryNoteRow): MemoryNote {
  return {
    id: row.id,
    type: row.type as "summary" | "note" | "preference" | "fact",
    content: row.content,
    context: row.context,
    embedding: row.embedding,
    isSuperseded: Boolean(row.is_superseded),
    supersededBy: row.superseded_by,
    placeId: row.place_id || null,
    contactId: row.contact_id || null,
    sourceType: (row.source_type as "conversation" | "lifelog" | "manual" | "observation") || "conversation",
    sourceId: row.source_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Helper to parse embedding from JSON string
export function parseEmbedding(embeddingStr: string | null): number[] | null {
  if (!embeddingStr) return null;
  try {
    return JSON.parse(embeddingStr);
  } catch {
    return null;
  }
}

// Helper to map database row to Preference type
function mapPreference(row: PreferenceRow): Preference {
  return {
    id: row.id,
    key: row.key,
    value: row.value,
    updatedAt: row.updated_at,
  };
}

// Helper to map database row to Reminder type
function mapReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    message: row.message,
    recipientPhone: row.recipient_phone,
    conversationId: row.conversation_id,
    scheduledFor: row.scheduled_for,
    createdAt: row.created_at,
    completed: Boolean(row.completed),
    placeId: row.place_id || null,
  };
}

// Helper to map database row to Automation type
function mapAutomation(row: AutomationRow): Automation {
  return {
    id: row.id,
    name: row.name,
    type: row.type as "morning_briefing" | "scheduled_sms" | "daily_checkin",
    cronExpression: row.cron_expression,
    enabled: Boolean(row.enabled),
    recipientPhone: row.recipient_phone,
    message: row.message,
    settings: row.settings,
    lastRun: row.last_run,
    nextRun: row.next_run,
    createdAt: row.created_at,
  };
}

// Location system mapper functions
function mapLocationHistory(row: LocationHistoryRow): LocationHistory {
  return {
    id: row.id,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy,
    altitude: row.altitude,
    speed: row.speed,
    heading: row.heading,
    source: row.source as "gps" | "network" | "manual",
    createdAt: row.created_at,
  };
}

function mapSavedPlace(row: SavedPlaceRow): SavedPlace {
  return {
    id: row.id,
    name: row.name,
    label: row.label,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address,
    category: row.category as PlaceCategory,
    notes: row.notes,
    isStarred: Boolean(row.is_starred),
    proximityAlertEnabled: Boolean(row.proximity_alert_enabled),
    proximityRadiusMeters: row.proximity_radius_meters,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPlaceList(row: PlaceListRow): PlaceList {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    color: row.color,
    linkedToGrocery: Boolean(row.linked_to_grocery),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPlaceListItem(row: PlaceListItemRow): PlaceListItem {
  return {
    id: row.id,
    placeListId: row.place_list_id,
    savedPlaceId: row.saved_place_id,
    addedAt: row.added_at,
  };
}

function mapLocationSettings(row: LocationSettingsRow): LocationSettings {
  return {
    id: row.id,
    trackingEnabled: Boolean(row.tracking_enabled),
    trackingIntervalMinutes: row.tracking_interval_minutes,
    proximityAlertsEnabled: Boolean(row.proximity_alerts_enabled),
    defaultProximityRadiusMeters: row.default_proximity_radius_meters,
    retentionDays: row.retention_days,
    updatedAt: row.updated_at,
  };
}

function mapProximityAlert(row: ProximityAlertRow): ProximityAlert {
  return {
    id: row.id,
    savedPlaceId: row.saved_place_id,
    placeListId: row.place_list_id,
    distanceMeters: row.distance_meters,
    alertType: row.alert_type as "grocery" | "reminder" | "general",
    alertMessage: row.alert_message,
    acknowledged: Boolean(row.acknowledged),
    createdAt: row.created_at,
  };
}

// Helper to generate current ISO timestamp
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

// Conversation operations
export function createConversation(data: InsertConversation): Conversation {
  return wrapDbOperation("createConversation", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    const title = data.title || "New Conversation";
    const source = data.source || "web";
    const phoneNumber = data.phoneNumber || null;
    const mode = data.mode || "chat";
    
    db.prepare(`
      INSERT INTO conversations (id, title, phone_number, source, mode, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, phoneNumber, source, mode, now, now);
    
    return { 
      id, 
      title, 
      phoneNumber, 
      source: source as "web" | "sms",
      mode: mode as "chat" | "getting_to_know",
      createdAt: now, 
      updatedAt: now 
    };
  });
}

export function getConversation(id: string): Conversation | undefined {
  return wrapDbOperation("getConversation", () => {
    const row = db.prepare(`
      SELECT * FROM conversations WHERE id = ?
    `).get(id) as ConversationRow | undefined;
    return row ? mapConversation(row) : undefined;
  });
}

export function getAllConversations(): Conversation[] {
  return wrapDbOperation("getAllConversations", () => {
    const rows = db.prepare(`
      SELECT * FROM conversations ORDER BY updated_at DESC
    `).all() as ConversationRow[];
    return rows.map(mapConversation);
  });
}

export function updateConversationTitle(id: string, title: string): Conversation | undefined {
  return wrapDbOperation("updateConversationTitle", () => {
    const now = getCurrentTimestamp();
    db.prepare(`
      UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?
    `).run(title, now, id);
    return getConversation(id);
  });
}

export function updateConversationTimestamp(id: string): void {
  wrapDbOperation("updateConversationTimestamp", () => {
    const now = getCurrentTimestamp();
    db.prepare(`
      UPDATE conversations SET updated_at = ? WHERE id = ?
    `).run(now, id);
  });
}

export function deleteConversation(id: string): boolean {
  return wrapDbOperation("deleteConversation", () => {
    db.prepare(`DELETE FROM messages WHERE conversation_id = ?`).run(id);
    const result = db.prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

// Message operations
export function createMessage(data: InsertMessage): Message {
  return wrapDbOperation("createMessage", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    const source = data.source || "web";
    
    db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.conversationId, data.role, data.content, source, now);
    
    // Update conversation timestamp
    updateConversationTimestamp(data.conversationId);
    
    return { 
      id, 
      conversationId: data.conversationId, 
      role: data.role as "user" | "assistant", 
      content: data.content, 
      source: source as "web" | "sms", 
      createdAt: now 
    };
  });
}

export function getMessagesByConversation(conversationId: string): Message[] {
  return wrapDbOperation("getMessagesByConversation", () => {
    const rows = db.prepare(`
      SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC
    `).all(conversationId) as MessageRow[];
    return rows.map(mapMessage);
  });
}

export function getRecentMessages(conversationId: string, limit: number = 20): Message[] {
  return wrapDbOperation("getRecentMessages", () => {
    const rows = db.prepare(`
      SELECT * FROM messages 
      WHERE conversation_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(conversationId, limit) as MessageRow[];
    return rows.reverse().map(mapMessage);
  });
}

export function deleteMessage(id: string): boolean {
  return wrapDbOperation("deleteMessage", () => {
    const result = db.prepare(`DELETE FROM messages WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

// Type for creating memory notes with optional embedding as number[]
export type CreateMemoryNoteInput = Omit<InsertMemoryNote, 'embedding'> & { embedding?: number[] };

// Memory notes operations
export function createMemoryNote(data: CreateMemoryNoteInput): MemoryNote {
  return wrapDbOperation("createMemoryNote", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    const context = data.context || "";
    const embeddingStr = data.embedding ? JSON.stringify(data.embedding) : null;
    
    db.prepare(`
      INSERT INTO memory_notes (id, type, content, context, embedding, place_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.type, data.content, context, embeddingStr, data.placeId || null, now, now);
    
    return { 
      id, 
      type: data.type as "summary" | "note" | "preference" | "fact", 
      content: data.content, 
      context, 
      embedding: embeddingStr,
      isSuperseded: false,
      supersededBy: null,
      placeId: data.placeId || null,
      createdAt: now, 
      updatedAt: now 
    };
  });
}

export function getMemoryNote(id: string): MemoryNote | undefined {
  return wrapDbOperation("getMemoryNote", () => {
    const row = db.prepare(`
      SELECT * FROM memory_notes WHERE id = ?
    `).get(id) as MemoryNoteRow | undefined;
    return row ? mapMemoryNote(row) : undefined;
  });
}

export function getAllMemoryNotes(includeSuperseded: boolean = false): MemoryNote[] {
  return wrapDbOperation("getAllMemoryNotes", () => {
    const query = includeSuperseded
      ? `SELECT * FROM memory_notes ORDER BY updated_at DESC`
      : `SELECT * FROM memory_notes WHERE is_superseded = 0 ORDER BY updated_at DESC`;
    const rows = db.prepare(query).all() as MemoryNoteRow[];
    return rows.map(mapMemoryNote);
  });
}

export function getMemoryNotesByType(type: string, includeSuperseded: boolean = false): MemoryNote[] {
  return wrapDbOperation("getMemoryNotesByType", () => {
    const query = includeSuperseded
      ? `SELECT * FROM memory_notes WHERE type = ? ORDER BY updated_at DESC`
      : `SELECT * FROM memory_notes WHERE type = ? AND is_superseded = 0 ORDER BY updated_at DESC`;
    const rows = db.prepare(query).all(type) as MemoryNoteRow[];
    return rows.map(mapMemoryNote);
  });
}

export function updateMemoryNote(id: string, data: Partial<Pick<MemoryNote, "content" | "context">>): MemoryNote | undefined {
  return wrapDbOperation("updateMemoryNote", () => {
    const existing = getMemoryNote(id);
    if (!existing) return undefined;
    
    const now = getCurrentTimestamp();
    const content = data.content ?? existing.content;
    const context = data.context ?? existing.context;
    
    db.prepare(`
      UPDATE memory_notes SET content = ?, context = ?, updated_at = ? WHERE id = ?
    `).run(content, context, now, id);
    
    return getMemoryNote(id);
  });
}

export function updateMemoryNoteEmbedding(id: string, embedding: number[]): boolean {
  return wrapDbOperation("updateMemoryNoteEmbedding", () => {
    const embeddingStr = JSON.stringify(embedding);
    const now = getCurrentTimestamp();
    const result = db.prepare(`
      UPDATE memory_notes SET embedding = ?, updated_at = ? WHERE id = ?
    `).run(embeddingStr, now, id);
    return result.changes > 0;
  });
}

export function getMemoryNotesWithoutEmbeddings(): MemoryNote[] {
  return wrapDbOperation("getMemoryNotesWithoutEmbeddings", () => {
    const rows = db.prepare(`
      SELECT * FROM memory_notes 
      WHERE embedding IS NULL AND is_superseded = 0
      ORDER BY updated_at DESC
    `).all() as MemoryNoteRow[];
    return rows.map(mapMemoryNote);
  });
}

export function searchMemoryNotes(query: string): MemoryNote[] {
  return wrapDbOperation("searchMemoryNotes", () => {
    const searchTerm = `%${query.toLowerCase()}%`;
    const rows = db.prepare(`
      SELECT * FROM memory_notes 
      WHERE LOWER(content) LIKE ? OR LOWER(context) LIKE ?
      ORDER BY updated_at DESC
      LIMIT 10
    `).all(searchTerm, searchTerm) as MemoryNoteRow[];
    return rows.map(mapMemoryNote);
  });
}

export function deleteMemoryNote(id: string): boolean {
  return wrapDbOperation("deleteMemoryNote", () => {
    const result = db.prepare(`DELETE FROM memory_notes WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

// Preferences operations
export function setPreference(data: InsertPreference): Preference {
  return wrapDbOperation("setPreference", () => {
    const now = getCurrentTimestamp();
    const existing = db.prepare(`SELECT id FROM preferences WHERE key = ?`).get(data.key) as { id: string } | undefined;
    
    if (existing) {
      db.prepare(`
        UPDATE preferences SET value = ?, updated_at = ? WHERE key = ?
      `).run(data.value, now, data.key);
      return { id: existing.id, key: data.key, value: data.value, updatedAt: now };
    } else {
      const id = uuidv4();
      db.prepare(`
        INSERT INTO preferences (id, key, value, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(id, data.key, data.value, now);
      return { id, key: data.key, value: data.value, updatedAt: now };
    }
  });
}

export function getPreference(key: string): Preference | undefined {
  return wrapDbOperation("getPreference", () => {
    const row = db.prepare(`
      SELECT * FROM preferences WHERE key = ?
    `).get(key) as PreferenceRow | undefined;
    return row ? mapPreference(row) : undefined;
  });
}

export function updatePreference(key: string, value: string): Preference | undefined {
  return wrapDbOperation("updatePreference", () => {
    const existing = getPreference(key);
    if (!existing) return undefined;
    
    const now = getCurrentTimestamp();
    db.prepare(`
      UPDATE preferences SET value = ?, updated_at = ? WHERE key = ?
    `).run(value, now, key);
    
    return getPreference(key);
  });
}

export function deletePreference(key: string): boolean {
  return wrapDbOperation("deletePreference", () => {
    const result = db.prepare(`DELETE FROM preferences WHERE key = ?`).run(key);
    return result.changes > 0;
  });
}

export function getAllPreferences(): Preference[] {
  return wrapDbOperation("getAllPreferences", () => {
    const rows = db.prepare(`
      SELECT * FROM preferences ORDER BY key ASC
    `).all() as PreferenceRow[];
    return rows.map(mapPreference);
  });
}

// Find or create conversation by phone number (for SMS)
export function findOrCreateSmsConversation(phoneNumber: string): Conversation {
  return wrapDbOperation("findOrCreateSmsConversation", () => {
    // Look for existing SMS conversation from this phone
    const existing = db.prepare(`
      SELECT * FROM conversations 
      WHERE phone_number = ? AND source = 'sms'
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(phoneNumber) as ConversationRow | undefined;
    
    if (existing) {
      return mapConversation(existing);
    }
    
    // Create new SMS conversation with phone number
    return createConversation({
      title: `SMS: ${phoneNumber}`,
      source: "sms",
      phoneNumber,
    });
  });
}

// Find conversation by phone number
export function getConversationByPhoneNumber(phoneNumber: string): Conversation | undefined {
  return wrapDbOperation("getConversationByPhoneNumber", () => {
    const row = db.prepare(`
      SELECT * FROM conversations 
      WHERE phone_number = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(phoneNumber) as ConversationRow | undefined;
    return row ? mapConversation(row) : undefined;
  });
}

// Helper to map database row to GroceryItem type
function mapGroceryItem(row: GroceryItemRow): GroceryItem {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    category: row.category,
    addedBy: row.added_by,
    purchased: Boolean(row.purchased),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Grocery item operations
export function createGroceryItem(data: InsertGroceryItem): GroceryItem {
  return wrapDbOperation("createGroceryItem", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    const quantity = data.quantity || "1";
    const category = data.category || "Other";
    const purchased = data.purchased ?? false;
    
    db.prepare(`
      INSERT INTO grocery_items (id, name, quantity, category, added_by, purchased, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name, quantity, category, data.addedBy, purchased ? 1 : 0, now, now);
    
    return {
      id,
      name: data.name,
      quantity,
      category,
      addedBy: data.addedBy,
      purchased,
      createdAt: now,
      updatedAt: now,
    };
  });
}

export function getAllGroceryItems(): GroceryItem[] {
  return wrapDbOperation("getAllGroceryItems", () => {
    const rows = db.prepare(`
      SELECT * FROM grocery_items ORDER BY purchased ASC, created_at DESC
    `).all() as GroceryItemRow[];
    return rows.map(mapGroceryItem);
  });
}

export function getGroceryItem(id: string): GroceryItem | undefined {
  return wrapDbOperation("getGroceryItem", () => {
    const row = db.prepare(`
      SELECT * FROM grocery_items WHERE id = ?
    `).get(id) as GroceryItemRow | undefined;
    return row ? mapGroceryItem(row) : undefined;
  });
}

export function updateGroceryItem(id: string, data: Partial<Omit<GroceryItem, "id" | "createdAt" | "updatedAt">>): GroceryItem | undefined {
  return wrapDbOperation("updateGroceryItem", () => {
    const existing = getGroceryItem(id);
    if (!existing) return undefined;
    
    const now = getCurrentTimestamp();
    const name = data.name ?? existing.name;
    const quantity = data.quantity ?? existing.quantity;
    const category = data.category ?? existing.category;
    const addedBy = data.addedBy ?? existing.addedBy;
    const purchased = data.purchased ?? existing.purchased;
    
    db.prepare(`
      UPDATE grocery_items 
      SET name = ?, quantity = ?, category = ?, added_by = ?, purchased = ?, updated_at = ? 
      WHERE id = ?
    `).run(name, quantity, category, addedBy, purchased ? 1 : 0, now, id);
    
    return getGroceryItem(id);
  });
}

export function toggleGroceryItemPurchased(id: string): GroceryItem | undefined {
  return wrapDbOperation("toggleGroceryItemPurchased", () => {
    const existing = getGroceryItem(id);
    if (!existing) return undefined;
    
    const now = getCurrentTimestamp();
    const newPurchased = !existing.purchased;
    
    db.prepare(`
      UPDATE grocery_items SET purchased = ?, updated_at = ? WHERE id = ?
    `).run(newPurchased ? 1 : 0, now, id);
    
    return getGroceryItem(id);
  });
}

export function deleteGroceryItem(id: string): boolean {
  return wrapDbOperation("deleteGroceryItem", () => {
    const result = db.prepare(`DELETE FROM grocery_items WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

export function clearPurchasedGroceryItems(): number {
  return wrapDbOperation("clearPurchasedGroceryItems", () => {
    const result = db.prepare(`DELETE FROM grocery_items WHERE purchased = 1`).run();
    return result.changes;
  });
}

export function clearAllGroceryItems(): number {
  return wrapDbOperation("clearAllGroceryItems", () => {
    const result = db.prepare(`DELETE FROM grocery_items`).run();
    return result.changes;
  });
}

// Reminder operations
export function createReminder(data: InsertReminder): Reminder {
  return wrapDbOperation("createReminder", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    
    db.prepare(`
      INSERT INTO reminders (id, message, recipient_phone, conversation_id, scheduled_for, created_at, completed, place_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.message, data.recipientPhone || null, data.conversationId || null, data.scheduledFor, now, data.completed ? 1 : 0, data.placeId || null);
    
    return {
      id,
      message: data.message,
      recipientPhone: data.recipientPhone || null,
      conversationId: data.conversationId || null,
      scheduledFor: data.scheduledFor,
      createdAt: now,
      completed: data.completed || false,
      placeId: data.placeId || null,
    };
  });
}

export function getReminder(id: string): Reminder | undefined {
  return wrapDbOperation("getReminder", () => {
    const row = db.prepare(`
      SELECT * FROM reminders WHERE id = ?
    `).get(id) as ReminderRow | undefined;
    return row ? mapReminder(row) : undefined;
  });
}

export function getPendingReminders(): Reminder[] {
  return wrapDbOperation("getPendingReminders", () => {
    const rows = db.prepare(`
      SELECT * FROM reminders 
      WHERE completed = 0 
      ORDER BY scheduled_for ASC
    `).all() as ReminderRow[];
    return rows.map(mapReminder);
  });
}

export function getAllReminders(): Reminder[] {
  return wrapDbOperation("getAllReminders", () => {
    const rows = db.prepare(`
      SELECT * FROM reminders ORDER BY scheduled_for ASC
    `).all() as ReminderRow[];
    return rows.map(mapReminder);
  });
}

export function updateReminderCompleted(id: string, completed: boolean): Reminder | undefined {
  return wrapDbOperation("updateReminderCompleted", () => {
    db.prepare(`
      UPDATE reminders SET completed = ? WHERE id = ?
    `).run(completed ? 1 : 0, id);
    return getReminder(id);
  });
}

export function deleteReminder(id: string): boolean {
  return wrapDbOperation("deleteReminder", () => {
    const result = db.prepare(`DELETE FROM reminders WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

// Memory supersession operations
export function supersedeMemoryNote(oldNoteId: string, newNoteId: string): boolean {
  return wrapDbOperation("supersedeMemoryNote", () => {
    const now = getCurrentTimestamp();
    const result = db.prepare(`
      UPDATE memory_notes SET is_superseded = 1, superseded_by = ?, updated_at = ? WHERE id = ?
    `).run(newNoteId, now, oldNoteId);
    return result.changes > 0;
  });
}

export function findMemoryNoteByContent(searchContent: string): MemoryNote | undefined {
  return wrapDbOperation("findMemoryNoteByContent", () => {
    const searchTerm = `%${searchContent.toLowerCase()}%`;
    const row = db.prepare(`
      SELECT * FROM memory_notes 
      WHERE LOWER(content) LIKE ? AND is_superseded = 0
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(searchTerm) as MemoryNoteRow | undefined;
    return row ? mapMemoryNote(row) : undefined;
  });
}

export function createMemoryNoteWithSupersession(
  data: CreateMemoryNoteInput, 
  supersedesContentLike?: string
): MemoryNote {
  return wrapDbOperation("createMemoryNoteWithSupersession", () => {
    const newNote = createMemoryNote(data);
    
    if (supersedesContentLike) {
      const oldNote = findMemoryNoteByContent(supersedesContentLike);
      if (oldNote && oldNote.id !== newNote.id) {
        supersedeMemoryNote(oldNote.id, newNote.id);
        console.log(`Memory superseded: "${oldNote.content}" -> "${newNote.content}"`);
      }
    }
    
    return newNote;
  });
}

// Helper to map database row to Task type
function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority as "low" | "medium" | "high",
    dueDate: row.due_date,
    category: row.category as "work" | "personal" | "family",
    completed: Boolean(row.completed),
    placeId: row.place_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Task operations
export function createTask(data: InsertTask): Task {
  return wrapDbOperation("createTask", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    const description = data.description || "";
    const priority = data.priority || "medium";
    const category = data.category || "personal";
    const completed = data.completed ?? false;
    
    db.prepare(`
      INSERT INTO tasks (id, title, description, priority, due_date, category, completed, place_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.title, description, priority, data.dueDate || null, category, completed ? 1 : 0, data.placeId || null, now, now);
    
    return {
      id,
      title: data.title,
      description,
      priority: priority as "low" | "medium" | "high",
      dueDate: data.dueDate || null,
      category: category as "work" | "personal" | "family",
      completed,
      placeId: data.placeId || null,
      createdAt: now,
      updatedAt: now,
    };
  });
}

export function getTask(id: string): Task | undefined {
  return wrapDbOperation("getTask", () => {
    const row = db.prepare(`
      SELECT * FROM tasks WHERE id = ?
    `).get(id) as TaskRow | undefined;
    return row ? mapTask(row) : undefined;
  });
}

export function getAllTasks(includeCompleted: boolean = true): Task[] {
  return wrapDbOperation("getAllTasks", () => {
    const query = includeCompleted
      ? `SELECT * FROM tasks ORDER BY completed ASC, due_date ASC NULLS LAST, priority DESC, created_at DESC`
      : `SELECT * FROM tasks WHERE completed = 0 ORDER BY due_date ASC NULLS LAST, priority DESC, created_at DESC`;
    const rows = db.prepare(query).all() as TaskRow[];
    return rows.map(mapTask);
  });
}

export function getTasksByCategory(category: string, includeCompleted: boolean = true): Task[] {
  return wrapDbOperation("getTasksByCategory", () => {
    const query = includeCompleted
      ? `SELECT * FROM tasks WHERE category = ? ORDER BY completed ASC, due_date ASC NULLS LAST, priority DESC`
      : `SELECT * FROM tasks WHERE category = ? AND completed = 0 ORDER BY due_date ASC NULLS LAST, priority DESC`;
    const rows = db.prepare(query).all(category) as TaskRow[];
    return rows.map(mapTask);
  });
}

export function getTasksDueToday(): Task[] {
  return wrapDbOperation("getTasksDueToday", () => {
    const today = new Date().toISOString().split('T')[0];
    const rows = db.prepare(`
      SELECT * FROM tasks 
      WHERE due_date LIKE ? AND completed = 0
      ORDER BY priority DESC, created_at ASC
    `).all(`${today}%`) as TaskRow[];
    return rows.map(mapTask);
  });
}

export function getOverdueTasks(): Task[] {
  return wrapDbOperation("getOverdueTasks", () => {
    const now = new Date().toISOString();
    const rows = db.prepare(`
      SELECT * FROM tasks 
      WHERE due_date < ? AND due_date IS NOT NULL AND completed = 0
      ORDER BY due_date ASC, priority DESC
    `).all(now) as TaskRow[];
    return rows.map(mapTask);
  });
}

export function updateTask(id: string, data: UpdateTask): Task | undefined {
  return wrapDbOperation("updateTask", () => {
    const existing = getTask(id);
    if (!existing) return undefined;
    
    const now = getCurrentTimestamp();
    const title = data.title ?? existing.title;
    const description = data.description ?? existing.description;
    const priority = data.priority ?? existing.priority;
    const dueDate = data.dueDate !== undefined ? data.dueDate : existing.dueDate;
    const category = data.category ?? existing.category;
    const completed = data.completed ?? existing.completed;
    
    db.prepare(`
      UPDATE tasks 
      SET title = ?, description = ?, priority = ?, due_date = ?, category = ?, completed = ?, updated_at = ?
      WHERE id = ?
    `).run(title, description, priority, dueDate, category, completed ? 1 : 0, now, id);
    
    return getTask(id);
  });
}

export function toggleTaskCompleted(id: string): Task | undefined {
  return wrapDbOperation("toggleTaskCompleted", () => {
    const existing = getTask(id);
    if (!existing) return undefined;
    
    const now = getCurrentTimestamp();
    const newCompleted = !existing.completed;
    
    db.prepare(`
      UPDATE tasks SET completed = ?, updated_at = ? WHERE id = ?
    `).run(newCompleted ? 1 : 0, now, id);
    
    return getTask(id);
  });
}

export function deleteTask(id: string): boolean {
  return wrapDbOperation("deleteTask", () => {
    const result = db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

export function clearCompletedTasks(): number {
  return wrapDbOperation("clearCompletedTasks", () => {
    const result = db.prepare(`DELETE FROM tasks WHERE completed = 1`).run();
    return result.changes;
  });
}

export function searchTasks(query: string): Task[] {
  return wrapDbOperation("searchTasks", () => {
    const searchTerm = `%${query.toLowerCase()}%`;
    const rows = db.prepare(`
      SELECT * FROM tasks 
      WHERE LOWER(title) LIKE ? OR LOWER(description) LIKE ?
      ORDER BY completed ASC, due_date ASC NULLS LAST, priority DESC
    `).all(searchTerm, searchTerm) as TaskRow[];
    return rows.map(mapTask);
  });
}

// Helper to map database row to Contact type
function mapContact(row: ContactRow): Contact {
  return {
    id: row.id,
    name: row.name,
    phoneNumber: row.phone_number,
    accessLevel: row.access_level as AccessLevel,
    relationship: row.relationship,
    notes: row.notes,
    canAccessPersonalInfo: Boolean(row.can_access_personal_info),
    canAccessCalendar: Boolean(row.can_access_calendar),
    canAccessTasks: Boolean(row.can_access_tasks),
    canAccessGrocery: Boolean(row.can_access_grocery),
    canSetReminders: Boolean(row.can_set_reminders),
    birthday: row.birthday,
    occupation: row.occupation,
    organization: row.organization,
    email: row.email,
    lastInteractionAt: row.last_interaction_at,
    interactionCount: row.interaction_count || 0,
    metadata: row.metadata,
    isAutoCreated: Boolean(row.is_auto_created),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Helper to normalize phone number for comparison (strips formatting)
// Auto-created contacts use "auto-{uuid}" format - preserve those as-is
export function normalizePhoneNumber(phone: string): string {
  if (phone.startsWith("auto-")) {
    return phone; // Preserve auto-created contact identifiers
  }
  return phone.replace(/\D/g, "").replace(/^1/, ""); // Remove non-digits and leading 1
}

// Helper to check if phone is an auto-generated placeholder
export function isAutoGeneratedPhone(phone: string): boolean {
  return phone.startsWith("auto-");
}

// Contact operations
export function createContact(data: InsertContact): Contact {
  return wrapDbOperation("createContact", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    const normalizedPhone = normalizePhoneNumber(data.phoneNumber);
    const accessLevel = data.accessLevel || "unknown";
    const relationship = data.relationship || "";
    const notes = data.notes || "";
    
    // Apply default permissions based on access level if not explicitly set
    const defaults = defaultPermissionsByLevel[accessLevel as AccessLevel];
    const canAccessPersonalInfo = data.canAccessPersonalInfo ?? defaults.canAccessPersonalInfo;
    const canAccessCalendar = data.canAccessCalendar ?? defaults.canAccessCalendar;
    const canAccessTasks = data.canAccessTasks ?? defaults.canAccessTasks;
    const canAccessGrocery = data.canAccessGrocery ?? defaults.canAccessGrocery;
    const canSetReminders = data.canSetReminders ?? defaults.canSetReminders;
    
    const birthday = data.birthday || null;
    const occupation = data.occupation || null;
    const organization = data.organization || null;
    const email = data.email || null;
    const isAutoCreated = data.isAutoCreated ?? false;
    const metadata = data.metadata || null;
    
    db.prepare(`
      INSERT INTO contacts (id, name, phone_number, access_level, relationship, notes, 
        can_access_personal_info, can_access_calendar, can_access_tasks, can_access_grocery, can_set_reminders,
        birthday, occupation, organization, email, last_interaction_at, interaction_count, metadata, is_auto_created,
        created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.name, normalizedPhone, accessLevel, relationship, notes,
      canAccessPersonalInfo ? 1 : 0, canAccessCalendar ? 1 : 0, canAccessTasks ? 1 : 0, 
      canAccessGrocery ? 1 : 0, canSetReminders ? 1 : 0,
      birthday, occupation, organization, email, now, 0, metadata, isAutoCreated ? 1 : 0,
      now, now
    );
    
    return {
      id,
      name: data.name,
      phoneNumber: normalizedPhone,
      accessLevel: accessLevel as AccessLevel,
      relationship,
      notes,
      canAccessPersonalInfo,
      canAccessCalendar,
      canAccessTasks,
      canAccessGrocery,
      canSetReminders,
      birthday,
      occupation,
      organization,
      email,
      lastInteractionAt: now,
      interactionCount: 0,
      metadata,
      isAutoCreated,
      createdAt: now,
      updatedAt: now,
    };
  });
}

export function getContact(id: string): Contact | undefined {
  return wrapDbOperation("getContact", () => {
    const row = db.prepare(`
      SELECT * FROM contacts WHERE id = ?
    `).get(id) as ContactRow | undefined;
    return row ? mapContact(row) : undefined;
  });
}

export function getContactByPhone(phone: string): Contact | undefined {
  return wrapDbOperation("getContactByPhone", () => {
    const normalizedPhone = normalizePhoneNumber(phone);
    const row = db.prepare(`
      SELECT * FROM contacts WHERE phone_number = ?
    `).get(normalizedPhone) as ContactRow | undefined;
    return row ? mapContact(row) : undefined;
  });
}

export function getAllContacts(): Contact[] {
  return wrapDbOperation("getAllContacts", () => {
    const rows = db.prepare(`
      SELECT * FROM contacts ORDER BY name ASC
    `).all() as ContactRow[];
    return rows.map(mapContact);
  });
}

export function getContactsByAccessLevel(level: AccessLevel): Contact[] {
  return wrapDbOperation("getContactsByAccessLevel", () => {
    const rows = db.prepare(`
      SELECT * FROM contacts WHERE access_level = ? ORDER BY name ASC
    `).all(level) as ContactRow[];
    return rows.map(mapContact);
  });
}

export function updateContact(id: string, data: UpdateContact): Contact | undefined {
  return wrapDbOperation("updateContact", () => {
    const existing = getContact(id);
    if (!existing) return undefined;
    
    const now = getCurrentTimestamp();
    const name = data.name ?? existing.name;
    const phoneNumber = data.phoneNumber ? normalizePhoneNumber(data.phoneNumber) : existing.phoneNumber;
    const accessLevel = data.accessLevel ?? existing.accessLevel;
    const relationship = data.relationship ?? existing.relationship;
    const notes = data.notes ?? existing.notes;
    const canAccessPersonalInfo = data.canAccessPersonalInfo ?? existing.canAccessPersonalInfo;
    const canAccessCalendar = data.canAccessCalendar ?? existing.canAccessCalendar;
    const canAccessTasks = data.canAccessTasks ?? existing.canAccessTasks;
    const canAccessGrocery = data.canAccessGrocery ?? existing.canAccessGrocery;
    const canSetReminders = data.canSetReminders ?? existing.canSetReminders;
    const birthday = data.birthday !== undefined ? data.birthday : existing.birthday;
    const occupation = data.occupation !== undefined ? data.occupation : existing.occupation;
    const organization = data.organization !== undefined ? data.organization : existing.organization;
    const email = data.email !== undefined ? data.email : existing.email;
    const lastInteractionAt = data.lastInteractionAt !== undefined ? data.lastInteractionAt : existing.lastInteractionAt;
    const interactionCount = data.interactionCount ?? existing.interactionCount;
    const metadata = data.metadata !== undefined ? data.metadata : existing.metadata;
    const isAutoCreated = data.isAutoCreated ?? existing.isAutoCreated;
    
    db.prepare(`
      UPDATE contacts 
      SET name = ?, phone_number = ?, access_level = ?, relationship = ?, notes = ?,
          can_access_personal_info = ?, can_access_calendar = ?, can_access_tasks = ?,
          can_access_grocery = ?, can_set_reminders = ?,
          birthday = ?, occupation = ?, organization = ?, email = ?,
          last_interaction_at = ?, interaction_count = ?, metadata = ?, is_auto_created = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      name, phoneNumber, accessLevel, relationship, notes,
      canAccessPersonalInfo ? 1 : 0, canAccessCalendar ? 1 : 0, canAccessTasks ? 1 : 0,
      canAccessGrocery ? 1 : 0, canSetReminders ? 1 : 0,
      birthday, occupation, organization, email,
      lastInteractionAt, interactionCount, metadata, isAutoCreated ? 1 : 0,
      now, id
    );
    
    return getContact(id);
  });
}

export function deleteContact(id: string): boolean {
  return wrapDbOperation("deleteContact", () => {
    const result = db.prepare(`DELETE FROM contacts WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

// Check if a phone number is the master admin
export function isMasterAdmin(phone: string): boolean {
  const normalizedPhone = normalizePhoneNumber(phone);
  const masterNormalized = normalizePhoneNumber(MASTER_ADMIN_PHONE);
  return normalizedPhone === masterNormalized;
}

// Get or create contact for a phone number (for incoming SMS)
export function getOrCreateContactForPhone(phone: string): Contact {
  return wrapDbOperation("getOrCreateContactForPhone", () => {
    const normalizedPhone = normalizePhoneNumber(phone);
    
    // Check if master admin
    if (isMasterAdmin(phone)) {
      const existing = getContactByPhone(phone);
      if (existing) return existing;
      
      // Create master admin contact
      return createContact({
        name: "Nate (Admin)",
        phoneNumber: normalizedPhone,
        accessLevel: "admin",
        relationship: "Owner",
        notes: "Master admin account",
        canAccessPersonalInfo: true,
        canAccessCalendar: true,
        canAccessTasks: true,
        canAccessGrocery: true,
        canSetReminders: true,
      });
    }
    
    // Check for existing contact
    const existing = getContactByPhone(phone);
    if (existing) return existing;
    
    // Create unknown contact
    return createContact({
      name: `Unknown (${normalizedPhone})`,
      phoneNumber: normalizedPhone,
      accessLevel: "unknown",
      relationship: "",
      notes: "Auto-created from incoming SMS",
    });
  });
}

// Get conversations for a specific contact
export function getConversationsByPhone(phone: string): Conversation[] {
  return wrapDbOperation("getConversationsByPhone", () => {
    const normalizedPhone = normalizePhoneNumber(phone);
    const rows = db.prepare(`
      SELECT * FROM conversations 
      WHERE phone_number = ? 
      ORDER BY updated_at DESC
    `).all(normalizedPhone) as ConversationRow[];
    return rows.map(mapConversation);
  });
}

// Get message count for a contact
export function getMessageCountForPhone(phone: string): number {
  return wrapDbOperation("getMessageCountForPhone", () => {
    const normalizedPhone = normalizePhoneNumber(phone);
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE c.phone_number = ?
    `).get(normalizedPhone) as { count: number };
    return result.count;
  });
}

// People Tracking Functions

// Find contacts by name (fuzzy matching)
export function findContactsByName(name: string): Contact[] {
  return wrapDbOperation("findContactsByName", () => {
    const searchTerm = `%${name.toLowerCase()}%`;
    const rows = db.prepare(`
      SELECT * FROM contacts 
      WHERE LOWER(name) LIKE ?
      ORDER BY interaction_count DESC, name ASC
    `).all(searchTerm) as ContactRow[];
    return rows.map(mapContact);
  });
}

// Search contacts by any field
export function searchContacts(query: string): Contact[] {
  return wrapDbOperation("searchContacts", () => {
    const searchTerm = `%${query.toLowerCase()}%`;
    const rows = db.prepare(`
      SELECT * FROM contacts 
      WHERE LOWER(name) LIKE ? 
         OR LOWER(relationship) LIKE ?
         OR LOWER(occupation) LIKE ?
         OR LOWER(organization) LIKE ?
         OR LOWER(notes) LIKE ?
      ORDER BY interaction_count DESC, name ASC
    `).all(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm) as ContactRow[];
    return rows.map(mapContact);
  });
}

// Get auto-created contacts
export function getAutoCreatedContacts(): Contact[] {
  return wrapDbOperation("getAutoCreatedContacts", () => {
    const rows = db.prepare(`
      SELECT * FROM contacts 
      WHERE is_auto_created = 1
      ORDER BY last_interaction_at DESC
    `).all() as ContactRow[];
    return rows.map(mapContact);
  });
}

// Increment contact interaction and update last interaction time
export function incrementContactInteraction(id: string): Contact | undefined {
  return wrapDbOperation("incrementContactInteraction", () => {
    const now = getCurrentTimestamp();
    db.prepare(`
      UPDATE contacts 
      SET interaction_count = interaction_count + 1,
          last_interaction_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(now, now, id);
    return getContact(id);
  });
}

// Get all memories linked to a contact
export function getMemoriesForContact(contactId: string): MemoryNote[] {
  return wrapDbOperation("getMemoriesForContact", () => {
    const rows = db.prepare(`
      SELECT * FROM memory_notes 
      WHERE contact_id = ?
      ORDER BY created_at DESC
    `).all(contactId) as MemoryNoteRow[];
    return rows.map(mapMemoryNote);
  });
}

// Link a memory to a contact
export function linkMemoryToContact(memoryId: string, contactId: string): MemoryNote | undefined {
  return wrapDbOperation("linkMemoryToContact", () => {
    const now = getCurrentTimestamp();
    db.prepare(`
      UPDATE memory_notes 
      SET contact_id = ?, updated_at = ?
      WHERE id = ?
    `).run(contactId, now, memoryId);
    return getMemoryNote(memoryId);
  });
}

// Create a memory with contact linkage
export function createMemoryWithContact(
  type: "summary" | "note" | "preference" | "fact",
  content: string,
  context: string = "",
  contactId?: string,
  sourceType?: "conversation" | "lifelog" | "manual" | "observation",
  sourceId?: string
): MemoryNote {
  return wrapDbOperation("createMemoryWithContact", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    
    db.prepare(`
      INSERT INTO memory_notes (id, type, content, context, contact_id, source_type, source_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, type, content, context, contactId || null, sourceType || "conversation", sourceId || null, now, now);
    
    return {
      id,
      type,
      content,
      context,
      embedding: null,
      isSuperseded: false,
      supersededBy: null,
      placeId: null,
      contactId: contactId || null,
      sourceType: sourceType || "conversation",
      sourceId: sourceId || null,
      createdAt: now,
      updatedAt: now,
    };
  });
}

// Get recent contacts by interaction
export function getRecentlyInteractedContacts(limit: number = 10): Contact[] {
  return wrapDbOperation("getRecentlyInteractedContacts", () => {
    const rows = db.prepare(`
      SELECT * FROM contacts 
      WHERE last_interaction_at IS NOT NULL
      ORDER BY last_interaction_at DESC
      LIMIT ?
    `).all(limit) as ContactRow[];
    return rows.map(mapContact);
  });
}

// Get contacts with most interactions
export function getMostInteractedContacts(limit: number = 10): Contact[] {
  return wrapDbOperation("getMostInteractedContacts", () => {
    const rows = db.prepare(`
      SELECT * FROM contacts 
      WHERE interaction_count > 0
      ORDER BY interaction_count DESC
      LIMIT ?
    `).all(limit) as ContactRow[];
    return rows.map(mapContact);
  });
}

// Check if a contact with similar name exists
export function findSimilarContact(name: string): Contact | undefined {
  return wrapDbOperation("findSimilarContact", () => {
    // Exact match first
    const exactRow = db.prepare(`
      SELECT * FROM contacts 
      WHERE LOWER(name) = LOWER(?)
    `).get(name) as ContactRow | undefined;
    if (exactRow) return mapContact(exactRow);
    
    // Try first name match for common names
    const firstName = name.split(' ')[0].toLowerCase();
    if (firstName.length >= 3) {
      const partialRow = db.prepare(`
        SELECT * FROM contacts 
        WHERE LOWER(name) LIKE ? || '%'
        ORDER BY interaction_count DESC
        LIMIT 1
      `).get(firstName) as ContactRow | undefined;
      if (partialRow) return mapContact(partialRow);
    }
    
    return undefined;
  });
}

// Update reminder
export function updateReminder(id: string, data: Partial<{message: string, scheduledFor: string, recipientPhone: string}>): Reminder | undefined {
  return wrapDbOperation("updateReminder", () => {
    const existing = getReminder(id);
    if (!existing) return undefined;
    
    const message = data.message ?? existing.message;
    const scheduledFor = data.scheduledFor ?? existing.scheduledFor;
    const recipientPhone = data.recipientPhone !== undefined ? data.recipientPhone : existing.recipientPhone;
    
    db.prepare(`
      UPDATE reminders 
      SET message = ?, scheduled_for = ?, recipient_phone = ?
      WHERE id = ?
    `).run(message, scheduledFor, recipientPhone, id);
    
    return getReminder(id);
  });
}

// Automation operations
export function createAutomation(data: InsertAutomation): Automation {
  return wrapDbOperation("createAutomation", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    const enabled = data.enabled ?? true;
    
    db.prepare(`
      INSERT INTO automations (id, name, type, cron_expression, enabled, recipient_phone, message, settings, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, 
      data.name, 
      data.type, 
      data.cronExpression, 
      enabled ? 1 : 0, 
      data.recipientPhone || null, 
      data.message || null, 
      data.settings || null, 
      now
    );
    
    return {
      id,
      name: data.name,
      type: data.type as "morning_briefing" | "scheduled_sms" | "daily_checkin",
      cronExpression: data.cronExpression,
      enabled,
      recipientPhone: data.recipientPhone || null,
      message: data.message || null,
      settings: data.settings || null,
      lastRun: null,
      nextRun: null,
      createdAt: now,
    };
  });
}

export function getAutomation(id: string): Automation | undefined {
  return wrapDbOperation("getAutomation", () => {
    const row = db.prepare(`
      SELECT * FROM automations WHERE id = ?
    `).get(id) as AutomationRow | undefined;
    return row ? mapAutomation(row) : undefined;
  });
}

export function getAllAutomations(): Automation[] {
  return wrapDbOperation("getAllAutomations", () => {
    const rows = db.prepare(`
      SELECT * FROM automations ORDER BY created_at DESC
    `).all() as AutomationRow[];
    return rows.map(mapAutomation);
  });
}

export function updateAutomation(id: string, data: Partial<InsertAutomation>): Automation | undefined {
  return wrapDbOperation("updateAutomation", () => {
    const existing = getAutomation(id);
    if (!existing) return undefined;
    
    const name = data.name ?? existing.name;
    const type = data.type ?? existing.type;
    const cronExpression = data.cronExpression ?? existing.cronExpression;
    const enabled = data.enabled ?? existing.enabled;
    const recipientPhone = data.recipientPhone !== undefined ? data.recipientPhone : existing.recipientPhone;
    const message = data.message !== undefined ? data.message : existing.message;
    const settings = data.settings !== undefined ? data.settings : existing.settings;
    
    db.prepare(`
      UPDATE automations 
      SET name = ?, type = ?, cron_expression = ?, enabled = ?, recipient_phone = ?, message = ?, settings = ?
      WHERE id = ?
    `).run(name, type, cronExpression, enabled ? 1 : 0, recipientPhone, message, settings, id);
    
    return getAutomation(id);
  });
}

export function deleteAutomation(id: string): boolean {
  return wrapDbOperation("deleteAutomation", () => {
    const result = db.prepare(`DELETE FROM automations WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

// Update automation run timestamps
export function updateAutomationRunTimestamps(id: string, lastRun: string, nextRun: string | null): Automation | undefined {
  return wrapDbOperation("updateAutomationRunTimestamps", () => {
    db.prepare(`
      UPDATE automations SET last_run = ?, next_run = ? WHERE id = ?
    `).run(lastRun, nextRun, id);
    return getAutomation(id);
  });
}

// Get enabled automations
export function getEnabledAutomations(): Automation[] {
  return wrapDbOperation("getEnabledAutomations", () => {
    const rows = db.prepare(`
      SELECT * FROM automations WHERE enabled = 1 ORDER BY created_at DESC
    `).all() as AutomationRow[];
    return rows.map(mapAutomation);
  });
}

// ============================================
// User Profile Operations
// ============================================

interface ProfileRow {
  id: string;
  section: string;
  data: string;
  updated_at: string;
}

function mapProfile(row: ProfileRow): { id: string; section: string; data: string; updatedAt: string } {
  return {
    id: row.id,
    section: row.section,
    data: row.data,
    updatedAt: row.updated_at,
  };
}

export function getProfileSection(section: string): { id: string; section: string; data: string; updatedAt: string } | undefined {
  return wrapDbOperation("getProfileSection", () => {
    const row = db.prepare(`
      SELECT * FROM user_profile WHERE section = ?
    `).get(section) as ProfileRow | undefined;
    return row ? mapProfile(row) : undefined;
  });
}

export function getAllProfileSections(): Array<{ id: string; section: string; data: string; updatedAt: string }> {
  return wrapDbOperation("getAllProfileSections", () => {
    const rows = db.prepare(`
      SELECT * FROM user_profile ORDER BY section
    `).all() as ProfileRow[];
    return rows.map(mapProfile);
  });
}

export function upsertProfileSection(section: string, data: string): { id: string; section: string; data: string; updatedAt: string } {
  return wrapDbOperation("upsertProfileSection", () => {
    const now = getCurrentTimestamp();
    const existing = getProfileSection(section);
    
    if (existing) {
      db.prepare(`
        UPDATE user_profile SET data = ?, updated_at = ? WHERE section = ?
      `).run(data, now, section);
      return { id: existing.id, section, data, updatedAt: now };
    } else {
      const id = uuidv4();
      db.prepare(`
        INSERT INTO user_profile (id, section, data, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(id, section, data, now);
      return { id, section, data, updatedAt: now };
    }
  });
}

export function deleteProfileSection(section: string): boolean {
  return wrapDbOperation("deleteProfileSection", () => {
    const result = db.prepare(`DELETE FROM user_profile WHERE section = ?`).run(section);
    return result.changes > 0;
  });
}

// Get full profile as a structured object
export function getFullProfile(): Record<string, unknown> {
  return wrapDbOperation("getFullProfile", () => {
    const sections = getAllProfileSections();
    const profile: Record<string, unknown> = {};
    
    for (const section of sections) {
      try {
        profile[section.section] = JSON.parse(section.data);
      } catch {
        profile[section.section] = section.data;
      }
    }
    
    return profile;
  });
}

// Get profile context as a formatted string for the AI agent
export function getProfileContextForAgent(): string {
  return wrapDbOperation("getProfileContextForAgent", () => {
    const sections = getAllProfileSections();
    if (sections.length === 0) {
      return "";
    }
    
    const contextParts: string[] = ["=== NATE'S PROFILE ==="];
    
    const sectionLabels: Record<string, string> = {
      basic_info: "Basic Information",
      work: "Work & Career",
      family: "Family & Relationships",
      interests: "Interests & Hobbies",
      preferences: "Preferences",
      goals: "Goals",
      health: "Health & Wellness",
      routines: "Daily Routines",
      important_dates: "Important Dates",
      custom: "Additional Information"
    };
    
    for (const section of sections) {
      const label = sectionLabels[section.section] || section.section;
      try {
        const data = JSON.parse(section.data);
        if (Object.keys(data).length > 0) {
          contextParts.push(`\n[${label}]`);
          for (const [key, value] of Object.entries(data)) {
            if (value && (typeof value !== 'object' || (Array.isArray(value) && value.length > 0))) {
              const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
              if (Array.isArray(value)) {
                contextParts.push(`- ${formattedKey}: ${value.join(', ')}`);
              } else {
                contextParts.push(`- ${formattedKey}: ${value}`);
              }
            }
          }
        }
      } catch {
        if (section.data) {
          contextParts.push(`\n[${label}]`);
          contextParts.push(section.data);
        }
      }
    }
    
    return contextParts.length > 1 ? contextParts.join('\n') : "";
  });
}

// Helper to map database row to TwilioMessage type
function mapTwilioMessage(row: TwilioMessageRow): TwilioMessage {
  return {
    id: row.id,
    twilioSid: row.twilio_sid,
    direction: row.direction as TwilioMessageDirection,
    status: row.status as TwilioMessageStatus,
    source: row.source as TwilioMessageSource,
    fromNumber: row.from_number,
    toNumber: row.to_number,
    body: row.body,
    contactId: row.contact_id,
    contactName: row.contact_name,
    conversationId: row.conversation_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

// Twilio message operations
export function createTwilioMessage(data: InsertTwilioMessage): TwilioMessage {
  return wrapDbOperation("createTwilioMessage", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    
    db.prepare(`
      INSERT INTO twilio_messages (id, twilio_sid, direction, status, source, from_number, to_number, body, 
        contact_id, contact_name, conversation_id, error_code, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.twilioSid || null,
      data.direction,
      data.status,
      data.source,
      data.fromNumber,
      data.toNumber,
      data.body,
      data.contactId || null,
      data.contactName || null,
      data.conversationId || null,
      data.errorCode || null,
      data.errorMessage || null,
      now
    );
    
    return {
      id,
      twilioSid: data.twilioSid || null,
      direction: data.direction as TwilioMessageDirection,
      status: data.status as TwilioMessageStatus,
      source: data.source as TwilioMessageSource,
      fromNumber: data.fromNumber,
      toNumber: data.toNumber,
      body: data.body,
      contactId: data.contactId || null,
      contactName: data.contactName || null,
      conversationId: data.conversationId || null,
      errorCode: data.errorCode || null,
      errorMessage: data.errorMessage || null,
      createdAt: now,
    };
  });
}

export function getTwilioMessage(id: string): TwilioMessage | undefined {
  return wrapDbOperation("getTwilioMessage", () => {
    const row = db.prepare(`
      SELECT * FROM twilio_messages WHERE id = ?
    `).get(id) as TwilioMessageRow | undefined;
    return row ? mapTwilioMessage(row) : undefined;
  });
}

export function getAllTwilioMessages(limit: number = 100): TwilioMessage[] {
  return wrapDbOperation("getAllTwilioMessages", () => {
    const rows = db.prepare(`
      SELECT * FROM twilio_messages ORDER BY created_at DESC LIMIT ?
    `).all(limit) as TwilioMessageRow[];
    return rows.map(mapTwilioMessage);
  });
}

export function getTwilioMessagesByPhone(phone: string, limit: number = 50): TwilioMessage[] {
  return wrapDbOperation("getTwilioMessagesByPhone", () => {
    const normalizedPhone = normalizePhoneNumber(phone);
    const rows = db.prepare(`
      SELECT * FROM twilio_messages 
      WHERE REPLACE(REPLACE(REPLACE(from_number, '+', ''), '-', ''), ' ', '') LIKE ? 
         OR REPLACE(REPLACE(REPLACE(to_number, '+', ''), '-', ''), ' ', '') LIKE ?
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(`%${normalizedPhone}`, `%${normalizedPhone}`, limit) as TwilioMessageRow[];
    return rows.map(mapTwilioMessage);
  });
}

export function getTwilioMessagesByDirection(direction: TwilioMessageDirection, limit: number = 50): TwilioMessage[] {
  return wrapDbOperation("getTwilioMessagesByDirection", () => {
    const rows = db.prepare(`
      SELECT * FROM twilio_messages WHERE direction = ? ORDER BY created_at DESC LIMIT ?
    `).all(direction, limit) as TwilioMessageRow[];
    return rows.map(mapTwilioMessage);
  });
}

export function getTwilioMessagesBySource(source: TwilioMessageSource, limit: number = 50): TwilioMessage[] {
  return wrapDbOperation("getTwilioMessagesBySource", () => {
    const rows = db.prepare(`
      SELECT * FROM twilio_messages WHERE source = ? ORDER BY created_at DESC LIMIT ?
    `).all(source, limit) as TwilioMessageRow[];
    return rows.map(mapTwilioMessage);
  });
}

export function getTwilioMessagesByContact(contactId: string, limit: number = 50): TwilioMessage[] {
  return wrapDbOperation("getTwilioMessagesByContact", () => {
    const rows = db.prepare(`
      SELECT * FROM twilio_messages WHERE contact_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(contactId, limit) as TwilioMessageRow[];
    return rows.map(mapTwilioMessage);
  });
}

export function updateTwilioMessageStatus(id: string, status: TwilioMessageStatus, twilioSid?: string): TwilioMessage | undefined {
  return wrapDbOperation("updateTwilioMessageStatus", () => {
    if (twilioSid) {
      db.prepare(`
        UPDATE twilio_messages SET status = ?, twilio_sid = ? WHERE id = ?
      `).run(status, twilioSid, id);
    } else {
      db.prepare(`
        UPDATE twilio_messages SET status = ? WHERE id = ?
      `).run(status, id);
    }
    return getTwilioMessage(id);
  });
}

export function updateTwilioMessageError(id: string, errorCode: string, errorMessage: string): TwilioMessage | undefined {
  return wrapDbOperation("updateTwilioMessageError", () => {
    db.prepare(`
      UPDATE twilio_messages SET status = 'failed', error_code = ?, error_message = ? WHERE id = ?
    `).run(errorCode, errorMessage, id);
    return getTwilioMessage(id);
  });
}

export function getTwilioMessageStats(): { 
  total: number; 
  inbound: number; 
  outbound: number; 
  failed: number;
  bySource: Record<string, number>;
} {
  return wrapDbOperation("getTwilioMessageStats", () => {
    const total = (db.prepare(`SELECT COUNT(*) as count FROM twilio_messages`).get() as { count: number }).count;
    const inbound = (db.prepare(`SELECT COUNT(*) as count FROM twilio_messages WHERE direction = 'inbound'`).get() as { count: number }).count;
    const outbound = (db.prepare(`SELECT COUNT(*) as count FROM twilio_messages WHERE direction = 'outbound'`).get() as { count: number }).count;
    const failed = (db.prepare(`SELECT COUNT(*) as count FROM twilio_messages WHERE status = 'failed'`).get() as { count: number }).count;
    
    const sourceRows = db.prepare(`
      SELECT source, COUNT(*) as count FROM twilio_messages GROUP BY source
    `).all() as Array<{ source: string; count: number }>;
    
    const bySource: Record<string, number> = {};
    for (const row of sourceRows) {
      bySource[row.source] = row.count;
    }
    
    return { total, inbound, outbound, failed, bySource };
  });
}

// Get unique phone numbers we've communicated with
export function getTwilioConversationPhones(): Array<{ 
  phoneNumber: string; 
  contactId: string | null;
  contactName: string | null;
  lastMessage: string;
  lastMessageAt: string;
  messageCount: number;
}> {
  return wrapDbOperation("getTwilioConversationPhones", () => {
    const rows = db.prepare(`
      WITH RankedMessages AS (
        SELECT 
          CASE WHEN direction = 'inbound' THEN from_number ELSE to_number END as phone_number,
          contact_id,
          contact_name,
          body as last_message,
          created_at as last_message_at,
          ROW_NUMBER() OVER (
            PARTITION BY CASE WHEN direction = 'inbound' THEN from_number ELSE to_number END 
            ORDER BY created_at DESC
          ) as rn
        FROM twilio_messages
        WHERE (direction = 'inbound' AND from_number != ?) 
           OR (direction = 'outbound' AND to_number != ?)
      ),
      MessageCounts AS (
        SELECT 
          CASE WHEN direction = 'inbound' THEN from_number ELSE to_number END as phone_number,
          COUNT(*) as message_count
        FROM twilio_messages
        WHERE (direction = 'inbound' AND from_number != ?) 
           OR (direction = 'outbound' AND to_number != ?)
        GROUP BY CASE WHEN direction = 'inbound' THEN from_number ELSE to_number END
      )
      SELECT 
        rm.phone_number,
        rm.contact_id,
        rm.contact_name,
        rm.last_message,
        rm.last_message_at,
        mc.message_count
      FROM RankedMessages rm
      JOIN MessageCounts mc ON rm.phone_number = mc.phone_number
      WHERE rm.rn = 1
      ORDER BY rm.last_message_at DESC
    `).all(
      process.env.TWILIO_PHONE_NUMBER || '',
      process.env.TWILIO_PHONE_NUMBER || '',
      process.env.TWILIO_PHONE_NUMBER || '',
      process.env.TWILIO_PHONE_NUMBER || ''
    ) as Array<{
      phone_number: string;
      contact_id: string | null;
      contact_name: string | null;
      last_message: string;
      last_message_at: string;
      message_count: number;
    }>;
    
    return rows.map(row => ({
      phoneNumber: row.phone_number,
      contactId: row.contact_id,
      contactName: row.contact_name,
      lastMessage: row.last_message,
      lastMessageAt: row.last_message_at,
      messageCount: row.message_count,
    }));
  });
}

// ============================================
// LOCATION INTELLIGENCE SYSTEM OPERATIONS
// ============================================

// Location History Operations
export function createLocationHistory(data: InsertLocationHistory): LocationHistory {
  return wrapDbOperation("createLocationHistory", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    const source = data.source || "gps";
    
    db.prepare(`
      INSERT INTO location_history (id, latitude, longitude, accuracy, altitude, speed, heading, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.latitude, data.longitude, data.accuracy || null, data.altitude || null, 
           data.speed || null, data.heading || null, source, now);
    
    return {
      id,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy: data.accuracy || null,
      altitude: data.altitude || null,
      speed: data.speed || null,
      heading: data.heading || null,
      source: source as "gps" | "network" | "manual",
      createdAt: now,
    };
  });
}

export function getLocationHistory(limit: number = 100): LocationHistory[] {
  return wrapDbOperation("getLocationHistory", () => {
    const rows = db.prepare(`
      SELECT * FROM location_history ORDER BY created_at DESC LIMIT ?
    `).all(limit) as LocationHistoryRow[];
    return rows.map(mapLocationHistory);
  });
}

export function getLocationHistoryInRange(startDate: string, endDate: string): LocationHistory[] {
  return wrapDbOperation("getLocationHistoryInRange", () => {
    const rows = db.prepare(`
      SELECT * FROM location_history 
      WHERE created_at >= ? AND created_at <= ?
      ORDER BY created_at DESC
    `).all(startDate, endDate) as LocationHistoryRow[];
    return rows.map(mapLocationHistory);
  });
}

export function getLatestLocation(): LocationHistory | undefined {
  return wrapDbOperation("getLatestLocation", () => {
    const row = db.prepare(`
      SELECT * FROM location_history ORDER BY created_at DESC LIMIT 1
    `).get() as LocationHistoryRow | undefined;
    return row ? mapLocationHistory(row) : undefined;
  });
}

export function deleteOldLocationHistory(retentionDays: number): number {
  return wrapDbOperation("deleteOldLocationHistory", () => {
    if (retentionDays === 0) {
      return 0;
    }
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const result = db.prepare(`
      DELETE FROM location_history WHERE created_at < ?
    `).run(cutoffDate.toISOString());
    return result.changes;
  });
}

// Saved Places Operations
export function createSavedPlace(data: InsertSavedPlace): SavedPlace {
  return wrapDbOperation("createSavedPlace", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    
    db.prepare(`
      INSERT INTO saved_places (id, name, label, latitude, longitude, address, category, notes, is_starred, proximity_alert_enabled, proximity_radius_meters, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name, data.label || null, data.latitude, data.longitude, 
           data.address || null, data.category || "other", data.notes || null,
           data.isStarred ? 1 : 0, data.proximityAlertEnabled ? 1 : 0, 
           data.proximityRadiusMeters || 200, now, now);
    
    return {
      id,
      name: data.name,
      label: data.label || null,
      latitude: data.latitude,
      longitude: data.longitude,
      address: data.address || null,
      category: (data.category || "other") as PlaceCategory,
      notes: data.notes || null,
      isStarred: data.isStarred || false,
      proximityAlertEnabled: data.proximityAlertEnabled || false,
      proximityRadiusMeters: data.proximityRadiusMeters || 200,
      createdAt: now,
      updatedAt: now,
    };
  });
}

export function getSavedPlace(id: string): SavedPlace | undefined {
  return wrapDbOperation("getSavedPlace", () => {
    const row = db.prepare(`
      SELECT * FROM saved_places WHERE id = ?
    `).get(id) as SavedPlaceRow | undefined;
    return row ? mapSavedPlace(row) : undefined;
  });
}

export function getAllSavedPlaces(): SavedPlace[] {
  return wrapDbOperation("getAllSavedPlaces", () => {
    const rows = db.prepare(`
      SELECT * FROM saved_places ORDER BY is_starred DESC, name ASC
    `).all() as SavedPlaceRow[];
    return rows.map(mapSavedPlace);
  });
}

export function getStarredPlaces(): SavedPlace[] {
  return wrapDbOperation("getStarredPlaces", () => {
    const rows = db.prepare(`
      SELECT * FROM saved_places WHERE is_starred = 1 ORDER BY name ASC
    `).all() as SavedPlaceRow[];
    return rows.map(mapSavedPlace);
  });
}

export function getSavedPlacesByCategory(category: PlaceCategory): SavedPlace[] {
  return wrapDbOperation("getSavedPlacesByCategory", () => {
    const rows = db.prepare(`
      SELECT * FROM saved_places WHERE category = ? ORDER BY is_starred DESC, name ASC
    `).all(category) as SavedPlaceRow[];
    return rows.map(mapSavedPlace);
  });
}

export function getPlacesWithProximityAlerts(): SavedPlace[] {
  return wrapDbOperation("getPlacesWithProximityAlerts", () => {
    const rows = db.prepare(`
      SELECT * FROM saved_places WHERE proximity_alert_enabled = 1
    `).all() as SavedPlaceRow[];
    return rows.map(mapSavedPlace);
  });
}

export function updateSavedPlace(id: string, data: UpdateSavedPlace): SavedPlace | undefined {
  return wrapDbOperation("updateSavedPlace", () => {
    const now = getCurrentTimestamp();
    const updates: string[] = ["updated_at = ?"];
    const values: (string | number | null)[] = [now];
    
    if (data.name !== undefined) { updates.push("name = ?"); values.push(data.name); }
    if (data.label !== undefined) { updates.push("label = ?"); values.push(data.label); }
    if (data.latitude !== undefined) { updates.push("latitude = ?"); values.push(data.latitude); }
    if (data.longitude !== undefined) { updates.push("longitude = ?"); values.push(data.longitude); }
    if (data.address !== undefined) { updates.push("address = ?"); values.push(data.address); }
    if (data.category !== undefined) { updates.push("category = ?"); values.push(data.category); }
    if (data.notes !== undefined) { updates.push("notes = ?"); values.push(data.notes); }
    if (data.isStarred !== undefined) { updates.push("is_starred = ?"); values.push(data.isStarred ? 1 : 0); }
    if (data.proximityAlertEnabled !== undefined) { updates.push("proximity_alert_enabled = ?"); values.push(data.proximityAlertEnabled ? 1 : 0); }
    if (data.proximityRadiusMeters !== undefined) { updates.push("proximity_radius_meters = ?"); values.push(data.proximityRadiusMeters); }
    
    values.push(id);
    db.prepare(`UPDATE saved_places SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return getSavedPlace(id);
  });
}

export function deleteSavedPlace(id: string): boolean {
  return wrapDbOperation("deleteSavedPlace", () => {
    const result = db.prepare(`DELETE FROM saved_places WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

// ============================================
// LOCATION LINKING FUNCTIONS
// ============================================

// Link a task to a place
export function linkTaskToPlace(taskId: string, placeId: string): Task | undefined {
  return wrapDbOperation("linkTaskToPlace", () => {
    db.prepare(`UPDATE tasks SET place_id = ? WHERE id = ?`).run(placeId, taskId);
    return getTask(taskId);
  });
}

// Unlink a task from its place
export function unlinkTaskFromPlace(taskId: string): Task | undefined {
  return wrapDbOperation("unlinkTaskFromPlace", () => {
    db.prepare(`UPDATE tasks SET place_id = NULL WHERE id = ?`).run(taskId);
    return getTask(taskId);
  });
}

// Link a reminder to a place
export function linkReminderToPlace(reminderId: string, placeId: string): Reminder | undefined {
  return wrapDbOperation("linkReminderToPlace", () => {
    db.prepare(`UPDATE reminders SET place_id = ? WHERE id = ?`).run(placeId, reminderId);
    return getReminder(reminderId);
  });
}

// Unlink a reminder from its place
export function unlinkReminderFromPlace(reminderId: string): Reminder | undefined {
  return wrapDbOperation("unlinkReminderFromPlace", () => {
    db.prepare(`UPDATE reminders SET place_id = NULL WHERE id = ?`).run(reminderId);
    return getReminder(reminderId);
  });
}

// Link a memory note to a place
export function linkMemoryToPlace(memoryId: string, placeId: string): MemoryNote | undefined {
  return wrapDbOperation("linkMemoryToPlace", () => {
    db.prepare(`UPDATE memory_notes SET place_id = ? WHERE id = ?`).run(placeId, memoryId);
    return getMemoryNote(memoryId);
  });
}

// Unlink a memory from its place
export function unlinkMemoryFromPlace(memoryId: string): MemoryNote | undefined {
  return wrapDbOperation("unlinkMemoryFromPlace", () => {
    db.prepare(`UPDATE memory_notes SET place_id = NULL WHERE id = ?`).run(memoryId);
    return getMemoryNote(memoryId);
  });
}

// Get all tasks linked to a specific place
export function getTasksByPlace(placeId: string): Task[] {
  return wrapDbOperation("getTasksByPlace", () => {
    const rows = db.prepare(`SELECT * FROM tasks WHERE place_id = ?`).all(placeId) as TaskRow[];
    return rows.map(mapTask);
  });
}

// Get all reminders linked to a specific place
export function getRemindersByPlace(placeId: string): Reminder[] {
  return wrapDbOperation("getRemindersByPlace", () => {
    const rows = db.prepare(`SELECT * FROM reminders WHERE place_id = ?`).all(placeId) as ReminderRow[];
    return rows.map(mapReminder);
  });
}

// Get all memories linked to a specific place
export function getMemoriesByPlace(placeId: string): MemoryNote[] {
  return wrapDbOperation("getMemoriesByPlace", () => {
    const rows = db.prepare(`SELECT * FROM memory_notes WHERE place_id = ?`).all(placeId) as MemoryNoteRow[];
    return rows.map(mapMemoryNote);
  });
}

// Get a place with all linked items
export function getPlaceWithLinkedItems(placeId: string): { 
  place: SavedPlace; 
  tasks: Task[]; 
  reminders: Reminder[]; 
  memories: MemoryNote[];
  lists: PlaceList[];
} | undefined {
  return wrapDbOperation("getPlaceWithLinkedItems", () => {
    const place = getSavedPlace(placeId);
    if (!place) return undefined;
    
    return {
      place,
      tasks: getTasksByPlace(placeId),
      reminders: getRemindersByPlace(placeId),
      memories: getMemoriesByPlace(placeId),
      lists: getListsForPlace(placeId),
    };
  });
}

// Get all items linked to any location (for location intelligence overview)
export function getAllLocationLinkedItems(): {
  tasks: Array<Task & { placeName?: string }>;
  reminders: Array<Reminder & { placeName?: string }>;
  memories: Array<MemoryNote & { placeName?: string }>;
} {
  return wrapDbOperation("getAllLocationLinkedItems", () => {
    // Get tasks with place info
    const taskRows = db.prepare(`
      SELECT t.*, sp.name as place_name 
      FROM tasks t 
      LEFT JOIN saved_places sp ON t.place_id = sp.id 
      WHERE t.place_id IS NOT NULL
    `).all() as (TaskRow & { place_name?: string })[];
    
    // Get reminders with place info
    const reminderRows = db.prepare(`
      SELECT r.*, sp.name as place_name 
      FROM reminders r 
      LEFT JOIN saved_places sp ON r.place_id = sp.id 
      WHERE r.place_id IS NOT NULL
    `).all() as (ReminderRow & { place_name?: string })[];
    
    // Get memories with place info
    const memoryRows = db.prepare(`
      SELECT m.*, sp.name as place_name 
      FROM memory_notes m 
      LEFT JOIN saved_places sp ON m.place_id = sp.id 
      WHERE m.place_id IS NOT NULL
    `).all() as (MemoryNoteRow & { place_name?: string })[];
    
    return {
      tasks: taskRows.map(row => ({ ...mapTask(row), placeName: row.place_name || undefined })),
      reminders: reminderRows.map(row => ({ ...mapReminder(row), placeName: row.place_name || undefined })),
      memories: memoryRows.map(row => ({ ...mapMemoryNote(row), placeName: row.place_name || undefined })),
    };
  });
}

// Place Lists Operations
export function createPlaceList(data: InsertPlaceList): PlaceList {
  return wrapDbOperation("createPlaceList", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    
    db.prepare(`
      INSERT INTO place_lists (id, name, description, icon, color, linked_to_grocery, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name, data.description || null, data.icon || null, 
           data.color || null, data.linkedToGrocery ? 1 : 0, now, now);
    
    return {
      id,
      name: data.name,
      description: data.description || null,
      icon: data.icon || null,
      color: data.color || null,
      linkedToGrocery: data.linkedToGrocery || false,
      createdAt: now,
      updatedAt: now,
    };
  });
}

export function getPlaceList(id: string): PlaceList | undefined {
  return wrapDbOperation("getPlaceList", () => {
    const row = db.prepare(`
      SELECT * FROM place_lists WHERE id = ?
    `).get(id) as PlaceListRow | undefined;
    return row ? mapPlaceList(row) : undefined;
  });
}

export function getAllPlaceLists(): PlaceList[] {
  return wrapDbOperation("getAllPlaceLists", () => {
    const rows = db.prepare(`
      SELECT * FROM place_lists ORDER BY name ASC
    `).all() as PlaceListRow[];
    return rows.map(mapPlaceList);
  });
}

export function getGroceryLinkedPlaceLists(): PlaceList[] {
  return wrapDbOperation("getGroceryLinkedPlaceLists", () => {
    const rows = db.prepare(`
      SELECT * FROM place_lists WHERE linked_to_grocery = 1
    `).all() as PlaceListRow[];
    return rows.map(mapPlaceList);
  });
}

export function updatePlaceList(id: string, data: UpdatePlaceList): PlaceList | undefined {
  return wrapDbOperation("updatePlaceList", () => {
    const now = getCurrentTimestamp();
    const updates: string[] = ["updated_at = ?"];
    const values: (string | number | null)[] = [now];
    
    if (data.name !== undefined) { updates.push("name = ?"); values.push(data.name); }
    if (data.description !== undefined) { updates.push("description = ?"); values.push(data.description); }
    if (data.icon !== undefined) { updates.push("icon = ?"); values.push(data.icon); }
    if (data.color !== undefined) { updates.push("color = ?"); values.push(data.color); }
    if (data.linkedToGrocery !== undefined) { updates.push("linked_to_grocery = ?"); values.push(data.linkedToGrocery ? 1 : 0); }
    
    values.push(id);
    db.prepare(`UPDATE place_lists SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return getPlaceList(id);
  });
}

export function deletePlaceList(id: string): boolean {
  return wrapDbOperation("deletePlaceList", () => {
    db.prepare(`DELETE FROM place_list_items WHERE place_list_id = ?`).run(id);
    const result = db.prepare(`DELETE FROM place_lists WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

// Place List Items Operations
export function addPlaceToList(placeListId: string, savedPlaceId: string): PlaceListItem {
  return wrapDbOperation("addPlaceToList", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    
    db.prepare(`
      INSERT INTO place_list_items (id, place_list_id, saved_place_id, added_at)
      VALUES (?, ?, ?, ?)
    `).run(id, placeListId, savedPlaceId, now);
    
    return {
      id,
      placeListId,
      savedPlaceId,
      addedAt: now,
    };
  });
}

export function removePlaceFromList(placeListId: string, savedPlaceId: string): boolean {
  return wrapDbOperation("removePlaceFromList", () => {
    const result = db.prepare(`
      DELETE FROM place_list_items WHERE place_list_id = ? AND saved_place_id = ?
    `).run(placeListId, savedPlaceId);
    return result.changes > 0;
  });
}

export function getPlacesInList(placeListId: string): SavedPlace[] {
  return wrapDbOperation("getPlacesInList", () => {
    const rows = db.prepare(`
      SELECT sp.* FROM saved_places sp
      JOIN place_list_items pli ON sp.id = pli.saved_place_id
      WHERE pli.place_list_id = ?
      ORDER BY sp.name ASC
    `).all(placeListId) as SavedPlaceRow[];
    return rows.map(mapSavedPlace);
  });
}

export function getListsForPlace(savedPlaceId: string): PlaceList[] {
  return wrapDbOperation("getListsForPlace", () => {
    const rows = db.prepare(`
      SELECT pl.* FROM place_lists pl
      JOIN place_list_items pli ON pl.id = pli.place_list_id
      WHERE pli.saved_place_id = ?
      ORDER BY pl.name ASC
    `).all(savedPlaceId) as PlaceListRow[];
    return rows.map(mapPlaceList);
  });
}

// Location Settings Operations
export function getLocationSettings(): LocationSettings | undefined {
  return wrapDbOperation("getLocationSettings", () => {
    const row = db.prepare(`
      SELECT * FROM location_settings LIMIT 1
    `).get() as LocationSettingsRow | undefined;
    return row ? mapLocationSettings(row) : undefined;
  });
}

export function updateLocationSettings(data: Partial<InsertLocationSettings>): LocationSettings | undefined {
  return wrapDbOperation("updateLocationSettings", () => {
    const now = getCurrentTimestamp();
    const current = getLocationSettings();
    
    if (!current) return undefined;
    
    const updates: string[] = ["updated_at = ?"];
    const values: (string | number)[] = [now];
    
    if (data.trackingEnabled !== undefined) { updates.push("tracking_enabled = ?"); values.push(data.trackingEnabled ? 1 : 0); }
    if (data.trackingIntervalMinutes !== undefined) { updates.push("tracking_interval_minutes = ?"); values.push(data.trackingIntervalMinutes); }
    if (data.proximityAlertsEnabled !== undefined) { updates.push("proximity_alerts_enabled = ?"); values.push(data.proximityAlertsEnabled ? 1 : 0); }
    if (data.defaultProximityRadiusMeters !== undefined) { updates.push("default_proximity_radius_meters = ?"); values.push(data.defaultProximityRadiusMeters); }
    if (data.retentionDays !== undefined) { updates.push("retention_days = ?"); values.push(data.retentionDays); }
    
    values.push(current.id);
    db.prepare(`UPDATE location_settings SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return getLocationSettings();
  });
}

// Proximity Alert Operations
export function createProximityAlert(data: InsertProximityAlert): ProximityAlert {
  return wrapDbOperation("createProximityAlert", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    
    db.prepare(`
      INSERT INTO proximity_alerts (id, saved_place_id, place_list_id, distance_meters, alert_type, alert_message, acknowledged, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.savedPlaceId, data.placeListId || null, data.distanceMeters, 
           data.alertType, data.alertMessage, data.acknowledged ? 1 : 0, now);
    
    return {
      id,
      savedPlaceId: data.savedPlaceId,
      placeListId: data.placeListId || null,
      distanceMeters: data.distanceMeters,
      alertType: data.alertType as "grocery" | "reminder" | "general",
      alertMessage: data.alertMessage,
      acknowledged: data.acknowledged || false,
      createdAt: now,
    };
  });
}

export function getRecentProximityAlerts(limit: number = 20): ProximityAlert[] {
  return wrapDbOperation("getRecentProximityAlerts", () => {
    const rows = db.prepare(`
      SELECT * FROM proximity_alerts ORDER BY created_at DESC LIMIT ?
    `).all(limit) as ProximityAlertRow[];
    return rows.map(mapProximityAlert);
  });
}

export function getUnacknowledgedAlerts(): ProximityAlert[] {
  return wrapDbOperation("getUnacknowledgedAlerts", () => {
    const rows = db.prepare(`
      SELECT * FROM proximity_alerts WHERE acknowledged = 0 ORDER BY created_at DESC
    `).all() as ProximityAlertRow[];
    return rows.map(mapProximityAlert);
  });
}

export function acknowledgeProximityAlert(id: string): boolean {
  return wrapDbOperation("acknowledgeProximityAlert", () => {
    const result = db.prepare(`
      UPDATE proximity_alerts SET acknowledged = 1 WHERE id = ?
    `).run(id);
    return result.changes > 0;
  });
}

export function acknowledgeAllProximityAlerts(): number {
  return wrapDbOperation("acknowledgeAllProximityAlerts", () => {
    const result = db.prepare(`
      UPDATE proximity_alerts SET acknowledged = 1 WHERE acknowledged = 0
    `).run();
    return result.changes;
  });
}

// Proximity Calculation Helper
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return R * c; // Distance in meters
}

// Find places near a location
export function findNearbyPlaces(lat: number, lon: number, radiusMeters: number = 500): Array<SavedPlace & { distance: number }> {
  return wrapDbOperation("findNearbyPlaces", () => {
    const allPlaces = getAllSavedPlaces();
    const nearbyPlaces: Array<SavedPlace & { distance: number }> = [];
    
    for (const place of allPlaces) {
      const distance = calculateDistance(lat, lon, parseFloat(place.latitude), parseFloat(place.longitude));
      if (distance <= radiusMeters) {
        nearbyPlaces.push({ ...place, distance });
      }
    }
    
    return nearbyPlaces.sort((a, b) => a.distance - b.distance);
  });
}

// Check if user is near any grocery-linked places
export function checkGroceryProximity(lat: number, lon: number): Array<{ place: SavedPlace; list: PlaceList; distance: number }> {
  return wrapDbOperation("checkGroceryProximity", () => {
    const groceryLists = getGroceryLinkedPlaceLists();
    const nearbyGroceryPlaces: Array<{ place: SavedPlace; list: PlaceList; distance: number }> = [];
    
    for (const list of groceryLists) {
      const placesInList = getPlacesInList(list.id);
      for (const place of placesInList) {
        const distance = calculateDistance(lat, lon, parseFloat(place.latitude), parseFloat(place.longitude));
        if (distance <= place.proximityRadiusMeters) {
          nearbyGroceryPlaces.push({ place, list, distance });
        }
      }
    }
    
    return nearbyGroceryPlaces.sort((a, b) => a.distance - b.distance);
  });
}

export { db };

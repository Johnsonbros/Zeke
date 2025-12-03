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
  ContactNote,
  InsertContactNote,
  ContactNoteType,
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
  PlaceCategory,
  CustomList,
  InsertCustomList,
  UpdateCustomList,
  CustomListItem,
  InsertCustomListItem,
  UpdateCustomListItem,
  CustomListWithItems,
  CustomListType,
  CustomListItemPriority,
  FamilyMember,
  InsertFamilyMember,
  UpdateFamilyMember,
  FoodPreference,
  InsertFoodPreference,
  FoodItemType,
  FoodPreferenceLevel,
  DietaryRestriction,
  InsertDietaryRestriction,
  DietaryRestrictionType,
  DietaryRestrictionSeverity,
  MealHistory,
  InsertMealHistory,
  MealType,
  SavedRecipe,
  InsertSavedRecipe,
  UpdateSavedRecipe,
  RecipeMealType,
  ConversationMetric,
  InsertConversationMetric,
  ToolOutcome,
  ConversationQualityStats,
  MemoryWithConfidence,
  Entity,
  InsertEntity,
  EntityType,
  EntityReference,
  InsertEntityReference,
  EntityDomain,
  EntityLink,
  InsertEntityLink,
  EntityRelationshipType,
  EntityWithReferences,
  EntityWithLinks,
  Insight,
  InsertInsight,
  UpdateInsight,
  InsightType,
  InsightCategory,
  InsightPriority,
  InsightStatus,
  InsightStats,
  NotificationQueueItem,
  InsertNotificationQueue,
  NotificationPreferences,
  InsertNotificationPreferences,
  NotificationBatch,
  NotificationCategory,
  NotificationPriority,
  Meeting,
  InsertMeeting,
  LifelogActionItem,
  InsertLifelogActionItem,
  LimitlessAnalyticsDaily,
  InsertLimitlessAnalyticsDaily
} from "@shared/schema";
import { MASTER_ADMIN_PHONE, defaultPermissionsByLevel } from "@shared/schema";

// Import cache invalidation functions (lazy loaded to avoid circular dependencies)
let cacheInvalidation: typeof import("./cacheInvalidation") | null = null;
async function getCacheInvalidation() {
  if (!cacheInvalidation) {
    cacheInvalidation = await import("./cacheInvalidation");
  }
  return cacheInvalidation;
}

// Helper to invalidate cache after mutations (fire and forget)
function invalidateTaskCache() {
  getCacheInvalidation().then(m => m.onTaskChange()).catch(() => {});
}
function invalidateMemoryCache() {
  getCacheInvalidation().then(m => m.onMemoryChange()).catch(() => {});
}
function invalidateGroceryCache() {
  getCacheInvalidation().then(m => m.onGroceryChange()).catch(() => {});
}
function invalidateContactCache() {
  getCacheInvalidation().then(m => m.onContactChange()).catch(() => {});
}
function invalidateLocationCache() {
  getCacheInvalidation().then(m => m.onLocationChange()).catch(() => {});
}
function invalidateProfileCache() {
  getCacheInvalidation().then(m => m.onProfileChange()).catch(() => {});
}

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
    purchased_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_grocery_purchased ON grocery_items(purchased);
  CREATE INDEX IF NOT EXISTS idx_grocery_category ON grocery_items(category);
`);

// Migration: Add purchased_at column to grocery_items if it doesn't exist
try {
  const groceryInfo = db.prepare("PRAGMA table_info(grocery_items)").all() as Array<{ name: string }>;
  if (!groceryInfo.some(col => col.name === "purchased_at")) {
    console.log("Adding 'purchased_at' column to grocery_items table...");
    db.exec(`ALTER TABLE grocery_items ADD COLUMN purchased_at TEXT`);
  }
} catch (e) {
  console.error("Migration error for grocery_items.purchased_at:", e);
}

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

// Add parent_task_id column to tasks table if it doesn't exist
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN parent_task_id TEXT`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id)`);
} catch (e) {
  // Column may already exist, ignore error
}

// Add place_id column to reminders table if it doesn't exist  
try {
  db.exec(`ALTER TABLE reminders ADD COLUMN place_id TEXT`);
} catch (e) {
  // Column may already exist, ignore error
}

// Add sequence columns to reminders table if they don't exist
try {
  db.exec(`ALTER TABLE reminders ADD COLUMN parent_reminder_id TEXT`);
} catch (e) {
  // Column may already exist, ignore error
}
try {
  db.exec(`ALTER TABLE reminders ADD COLUMN sequence_position INTEGER`);
} catch (e) {
  // Column may already exist, ignore error
}
try {
  db.exec(`ALTER TABLE reminders ADD COLUMN sequence_total INTEGER`);
} catch (e) {
  // Column may already exist, ignore error
}
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_reminders_parent ON reminders(parent_reminder_id)`);
} catch (e) {
  // Index may already exist, ignore error
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
    name TEXT,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    middle_name TEXT,
    phone_number TEXT NOT NULL UNIQUE,
    email TEXT,
    ai_assistant_phone TEXT,
    image_url TEXT,
    access_level TEXT NOT NULL DEFAULT 'unknown',
    relationship TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    can_access_personal_info INTEGER NOT NULL DEFAULT 0,
    can_access_calendar INTEGER NOT NULL DEFAULT 0,
    can_access_tasks INTEGER NOT NULL DEFAULT 0,
    can_access_grocery INTEGER NOT NULL DEFAULT 0,
    can_set_reminders INTEGER NOT NULL DEFAULT 0,
    birthday TEXT,
    occupation TEXT,
    organization TEXT,
    last_interaction_at TEXT,
    interaction_count INTEGER NOT NULL DEFAULT 0,
    metadata TEXT,
    is_auto_created INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number);
  CREATE INDEX IF NOT EXISTS idx_contacts_access_level ON contacts(access_level);
`);

// Migration: Add new contact fields if they don't exist
try {
  db.exec(`ALTER TABLE contacts ADD COLUMN first_name TEXT NOT NULL DEFAULT ''`);
} catch (e) {
  // Column may already exist
}
try {
  db.exec(`ALTER TABLE contacts ADD COLUMN last_name TEXT NOT NULL DEFAULT ''`);
} catch (e) {
  // Column may already exist
}
try {
  db.exec(`ALTER TABLE contacts ADD COLUMN middle_name TEXT`);
} catch (e) {
  // Column may already exist
}
try {
  db.exec(`ALTER TABLE contacts ADD COLUMN ai_assistant_phone TEXT`);
} catch (e) {
  // Column may already exist
}
try {
  db.exec(`ALTER TABLE contacts ADD COLUMN image_url TEXT`);
} catch (e) {
  // Column may already exist
}
try {
  db.exec(`ALTER TABLE contacts ADD COLUMN email TEXT`);
} catch (e) {
  // Column may already exist
}
try {
  db.exec(`ALTER TABLE contacts ADD COLUMN birthday TEXT`);
} catch (e) {
  // Column may already exist
}
try {
  db.exec(`ALTER TABLE contacts ADD COLUMN occupation TEXT`);
} catch (e) {
  // Column may already exist
}
try {
  db.exec(`ALTER TABLE contacts ADD COLUMN organization TEXT`);
} catch (e) {
  // Column may already exist
}
try {
  db.exec(`ALTER TABLE contacts ADD COLUMN last_interaction_at TEXT`);
} catch (e) {
  // Column may already exist
}
try {
  db.exec(`ALTER TABLE contacts ADD COLUMN interaction_count INTEGER NOT NULL DEFAULT 0`);
} catch (e) {
  // Column may already exist
}
try {
  db.exec(`ALTER TABLE contacts ADD COLUMN metadata TEXT`);
} catch (e) {
  // Column may already exist
}
try {
  db.exec(`ALTER TABLE contacts ADD COLUMN is_auto_created INTEGER NOT NULL DEFAULT 0`);
} catch (e) {
  // Column may already exist
}

// Migrate existing contacts: split 'name' field into first_name and last_name
try {
  const contactsWithName = db.prepare(`
    SELECT id, name FROM contacts 
    WHERE name IS NOT NULL AND name != '' 
    AND (first_name IS NULL OR first_name = '')
  `).all() as Array<{ id: string; name: string }>;
  
  for (const contact of contactsWithName) {
    const nameParts = contact.name.trim().split(/\s+/);
    const firstName = nameParts[0] || contact.name;
    const lastName = nameParts.slice(1).join(' ') || '';
    
    db.prepare(`
      UPDATE contacts SET first_name = ?, last_name = ? WHERE id = ?
    `).run(firstName, lastName, contact.id);
  }
  
  if (contactsWithName.length > 0) {
    console.log(`Migrated ${contactsWithName.length} contact(s) from 'name' to first_name/last_name fields`);
  }
} catch (e) {
  // Migration may have already run or name column doesn't exist
}

// Create contact_notes table for ZEKE's observations about people
db.exec(`
  CREATE TABLE IF NOT EXISTS contact_notes (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL,
    content TEXT NOT NULL,
    note_type TEXT NOT NULL DEFAULT 'observation',
    created_by TEXT NOT NULL DEFAULT 'zeke',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_contact_notes_contact ON contact_notes(contact_id);
  CREATE INDEX IF NOT EXISTS idx_contact_notes_type ON contact_notes(note_type);
  CREATE INDEX IF NOT EXISTS idx_contact_notes_created ON contact_notes(created_at);
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

// ============================================
// LIFELOG-LOCATION CORRELATION SYSTEM
// ============================================

// Create lifelog_locations table for correlating lifelogs with GPS data
db.exec(`
  CREATE TABLE IF NOT EXISTS lifelog_locations (
    id TEXT PRIMARY KEY,
    lifelog_id TEXT NOT NULL UNIQUE,
    lifelog_title TEXT NOT NULL,
    lifelog_start_time TEXT NOT NULL,
    lifelog_end_time TEXT NOT NULL,
    start_latitude TEXT,
    start_longitude TEXT,
    start_accuracy TEXT,
    end_latitude TEXT,
    end_longitude TEXT,
    end_accuracy TEXT,
    saved_place_id TEXT,
    saved_place_name TEXT,
    saved_place_category TEXT,
    activity_type TEXT DEFAULT 'unknown',
    total_distance_meters TEXT,
    average_speed TEXT,
    dwell_time_minutes TEXT,
    location_confidence TEXT DEFAULT 'medium',
    correlated_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (saved_place_id) REFERENCES saved_places(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_lifelog_locations_lifelog ON lifelog_locations(lifelog_id);
  CREATE INDEX IF NOT EXISTS idx_lifelog_locations_place ON lifelog_locations(saved_place_id);
  CREATE INDEX IF NOT EXISTS idx_lifelog_locations_start_time ON lifelog_locations(lifelog_start_time);
  CREATE INDEX IF NOT EXISTS idx_lifelog_locations_activity ON lifelog_locations(activity_type);
  CREATE INDEX IF NOT EXISTS idx_lifelog_locations_correlated ON lifelog_locations(correlated_at);
`);

console.log("Lifelog-location correlation table initialized");

// Create wake_word_commands table for ZEKE context agent
db.exec(`
  CREATE TABLE IF NOT EXISTS wake_word_commands (
    id TEXT PRIMARY KEY,
    lifelog_id TEXT NOT NULL,
    lifelog_title TEXT NOT NULL,
    wake_word TEXT NOT NULL,
    raw_command TEXT NOT NULL,
    speaker_name TEXT,
    timestamp TEXT NOT NULL,
    context TEXT,
    action_type TEXT,
    action_details TEXT,
    target_contact_id TEXT,
    status TEXT NOT NULL DEFAULT 'detected',
    execution_result TEXT,
    confidence TEXT,
    created_at TEXT NOT NULL,
    executed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_wake_word_commands_lifelog ON wake_word_commands(lifelog_id);
  CREATE INDEX IF NOT EXISTS idx_wake_word_commands_status ON wake_word_commands(status);
  CREATE INDEX IF NOT EXISTS idx_wake_word_commands_created ON wake_word_commands(created_at);
`);

// Create context_agent_settings table for ZEKE context agent configuration
db.exec(`
  CREATE TABLE IF NOT EXISTS context_agent_settings (
    id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    scan_interval_minutes INTEGER NOT NULL DEFAULT 5,
    lookback_hours INTEGER NOT NULL DEFAULT 4,
    auto_execute INTEGER NOT NULL DEFAULT 1,
    require_approval_for_sms INTEGER NOT NULL DEFAULT 0,
    notify_on_execution INTEGER NOT NULL DEFAULT 1,
    last_scan_at TEXT,
    updated_at TEXT NOT NULL
  );
`);

// Initialize default context agent settings if not exists
try {
  const existingAgentSettings = db.prepare(`SELECT id FROM context_agent_settings LIMIT 1`).get();
  if (!existingAgentSettings) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO context_agent_settings (id, enabled, scan_interval_minutes, lookback_hours, auto_execute, require_approval_for_sms, notify_on_execution, updated_at)
      VALUES (?, 1, 5, 4, 1, 0, 1, ?)
    `).run(uuidv4(), now);
    console.log("Initialized default context agent settings");
  }
} catch (e) {
  console.error("Error initializing context agent settings:", e);
}

// ============================================
// CONVERSATION QUALITY METRICS SYSTEM
// ============================================

// Create conversation_metrics table for tracking quality signals
db.exec(`
  CREATE TABLE IF NOT EXISTS conversation_metrics (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    message_id TEXT,
    tool_name TEXT,
    tool_outcome TEXT,
    tool_duration_ms INTEGER,
    tool_error_message TEXT,
    required_follow_up INTEGER DEFAULT 0,
    user_retried INTEGER DEFAULT 0,
    explicit_feedback TEXT,
    feedback_note TEXT,
    memories_used TEXT,
    memories_confirmed TEXT,
    memories_contradicted TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_conversation_metrics_conversation ON conversation_metrics(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_conversation_metrics_message ON conversation_metrics(message_id);
  CREATE INDEX IF NOT EXISTS idx_conversation_metrics_tool ON conversation_metrics(tool_name);
  CREATE INDEX IF NOT EXISTS idx_conversation_metrics_outcome ON conversation_metrics(tool_outcome);
  CREATE INDEX IF NOT EXISTS idx_conversation_metrics_created ON conversation_metrics(created_at);
`);

// Migration: Add memory confidence fields to memory_notes table if they don't exist
try {
  db.exec(`ALTER TABLE memory_notes ADD COLUMN confidence_score TEXT DEFAULT '0.8'`);
} catch (e) {
  // Column may already exist
}
try {
  db.exec(`ALTER TABLE memory_notes ADD COLUMN last_confirmed_at TEXT`);
} catch (e) {
  // Column may already exist
}
try {
  db.exec(`ALTER TABLE memory_notes ADD COLUMN confirmation_count INTEGER DEFAULT 0`);
} catch (e) {
  // Column may already exist
}
try {
  db.exec(`ALTER TABLE memory_notes ADD COLUMN usage_count INTEGER DEFAULT 0`);
} catch (e) {
  // Column may already exist
}
try {
  db.exec(`ALTER TABLE memory_notes ADD COLUMN last_used_at TEXT`);
} catch (e) {
  // Column may already exist
}

// Create index for confidence-based queries
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_notes_confidence ON memory_notes(confidence_score)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_notes_last_used ON memory_notes(last_used_at)`);
} catch (e) {
  // Indexes may already exist
}

console.log("Conversation metrics and memory confidence tables initialized");

// ============================================
// CUSTOM LISTS SYSTEM TABLES
// ============================================

// Create custom_lists table for user-created lists
db.exec(`
  CREATE TABLE IF NOT EXISTS custom_lists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'custom',
    icon TEXT,
    color TEXT,
    is_shared INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_custom_lists_type ON custom_lists(type);
  CREATE INDEX IF NOT EXISTS idx_custom_lists_shared ON custom_lists(is_shared);
`);

// Create custom_list_items table for items within lists
db.exec(`
  CREATE TABLE IF NOT EXISTS custom_list_items (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL,
    content TEXT NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0,
    added_by TEXT,
    priority TEXT DEFAULT 'medium',
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (list_id) REFERENCES custom_lists(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_custom_list_items_list ON custom_list_items(list_id);
  CREATE INDEX IF NOT EXISTS idx_custom_list_items_checked ON custom_list_items(checked);
`);

// ============================================
// FOOD PREFERENCE SYSTEM TABLES
// ============================================

// Create family_members table for tracking who has food preferences
db.exec(`
  CREATE TABLE IF NOT EXISTS family_members (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_family_members_name ON family_members(name);
  CREATE INDEX IF NOT EXISTS idx_family_members_active ON family_members(is_active);
`);

// Create food_preferences table for tracking likes/dislikes
db.exec(`
  CREATE TABLE IF NOT EXISTS food_preferences (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL,
    item_type TEXT NOT NULL,
    item_name TEXT NOT NULL,
    preference TEXT NOT NULL,
    strength INTEGER DEFAULT 1,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_food_preferences_member ON food_preferences(member_id);
  CREATE INDEX IF NOT EXISTS idx_food_preferences_type ON food_preferences(item_type);
  CREATE INDEX IF NOT EXISTS idx_food_preferences_preference ON food_preferences(preference);
`);

// Create dietary_restrictions table for allergies, religious, health restrictions
db.exec(`
  CREATE TABLE IF NOT EXISTS dietary_restrictions (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL,
    restriction_type TEXT NOT NULL,
    restriction_name TEXT NOT NULL,
    severity TEXT DEFAULT 'strict',
    notes TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_dietary_restrictions_member ON dietary_restrictions(member_id);
  CREATE INDEX IF NOT EXISTS idx_dietary_restrictions_type ON dietary_restrictions(restriction_type);
`);

// Create meal_history table for tracking meals cooked/eaten
db.exec(`
  CREATE TABLE IF NOT EXISTS meal_history (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    meal_type TEXT NOT NULL,
    cuisine TEXT,
    rating INTEGER,
    notes TEXT,
    recipe_id TEXT,
    cooked_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_meal_history_meal_type ON meal_history(meal_type);
  CREATE INDEX IF NOT EXISTS idx_meal_history_cooked_at ON meal_history(cooked_at);
  CREATE INDEX IF NOT EXISTS idx_meal_history_rating ON meal_history(rating);
`);

// Create saved_recipes table for family recipes
db.exec(`
  CREATE TABLE IF NOT EXISTS saved_recipes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    cuisine TEXT,
    meal_type TEXT,
    prep_time INTEGER,
    cook_time INTEGER,
    servings INTEGER,
    ingredients TEXT NOT NULL,
    instructions TEXT NOT NULL,
    source TEXT,
    family_rating INTEGER,
    times_cooked INTEGER DEFAULT 0,
    is_favorite INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_saved_recipes_cuisine ON saved_recipes(cuisine);
  CREATE INDEX IF NOT EXISTS idx_saved_recipes_meal_type ON saved_recipes(meal_type);
  CREATE INDEX IF NOT EXISTS idx_saved_recipes_favorite ON saved_recipes(is_favorite);
  CREATE INDEX IF NOT EXISTS idx_saved_recipes_rating ON saved_recipes(family_rating);
`);

// ============================================
// LIMITLESS AI SUMMARY SYSTEM TABLES
// ============================================

// Create limitless_summaries table for AI-generated daily summaries
db.exec(`
  CREATE TABLE IF NOT EXISTS limitless_summaries (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    timeframe_start TEXT NOT NULL,
    timeframe_end TEXT NOT NULL,
    summary_title TEXT NOT NULL,
    key_discussions TEXT NOT NULL,
    action_items TEXT NOT NULL,
    insights TEXT,
    people_interacted TEXT,
    topics_discussed TEXT,
    lifelog_ids TEXT NOT NULL,
    lifelog_count INTEGER NOT NULL,
    total_duration_minutes INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_limitless_summaries_date ON limitless_summaries(date);
  CREATE INDEX IF NOT EXISTS idx_limitless_summaries_created ON limitless_summaries(created_at);
`);

// ============================================
// CROSS-DOMAIN ENTITY LINKING SYSTEM TABLES
// ============================================

// Create entities table for canonical entities extracted from across the system
db.exec(`
  CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    label TEXT NOT NULL,
    canonical_id TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
  CREATE INDEX IF NOT EXISTS idx_entities_label ON entities(label);
  CREATE INDEX IF NOT EXISTS idx_entities_canonical ON entities(canonical_id);
`);

// Create entity_references table for tracking where entities are referenced
db.exec(`
  CREATE TABLE IF NOT EXISTS entity_references (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    domain TEXT NOT NULL,
    item_id TEXT NOT NULL,
    confidence TEXT NOT NULL,
    extracted_at TEXT NOT NULL,
    context TEXT,
    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_entity_references_entity ON entity_references(entity_id);
  CREATE INDEX IF NOT EXISTS idx_entity_references_domain ON entity_references(domain);
  CREATE INDEX IF NOT EXISTS idx_entity_references_item ON entity_references(item_id);
  CREATE INDEX IF NOT EXISTS idx_entity_references_domain_item ON entity_references(domain, item_id);
`);

// Create entity_links table for tracking relationships between entities
db.exec(`
  CREATE TABLE IF NOT EXISTS entity_links (
    id TEXT PRIMARY KEY,
    source_entity_id TEXT NOT NULL,
    target_entity_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    weight TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    metadata TEXT,
    FOREIGN KEY (source_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
    FOREIGN KEY (target_entity_id) REFERENCES entities(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_entity_links_source ON entity_links(source_entity_id);
  CREATE INDEX IF NOT EXISTS idx_entity_links_target ON entity_links(target_entity_id);
  CREATE INDEX IF NOT EXISTS idx_entity_links_relationship ON entity_links(relationship_type);
  CREATE INDEX IF NOT EXISTS idx_entity_links_weight ON entity_links(weight);
`);

console.log("Cross-domain entity linking tables initialized");

// Create insights table for proactive insights system
db.exec(`
  CREATE TABLE IF NOT EXISTS insights (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium',
    confidence TEXT NOT NULL DEFAULT '0.8',
    suggested_action TEXT,
    action_payload TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    source_entity_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    dismissed_at TEXT,
    surfaced_at TEXT,
    expires_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_insights_status ON insights(status);
  CREATE INDEX IF NOT EXISTS idx_insights_category ON insights(category);
  CREATE INDEX IF NOT EXISTS idx_insights_type ON insights(type);
  CREATE INDEX IF NOT EXISTS idx_insights_priority ON insights(priority);
  CREATE INDEX IF NOT EXISTS idx_insights_status_category ON insights(status, category);
  CREATE INDEX IF NOT EXISTS idx_insights_created ON insights(created_at);
`);

console.log("Proactive insights table initialized");

// Create notification batching tables for smart notification system
db.exec(`
  CREATE TABLE IF NOT EXISTS notification_queue (
    id TEXT PRIMARY KEY,
    recipient_phone TEXT NOT NULL,
    category TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'normal',
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source_type TEXT,
    source_id TEXT,
    scheduled_for TEXT,
    sent_at TEXT,
    batch_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_notification_queue_recipient ON notification_queue(recipient_phone);
  CREATE INDEX IF NOT EXISTS idx_notification_queue_category ON notification_queue(category);
  CREATE INDEX IF NOT EXISTS idx_notification_queue_priority ON notification_queue(priority);
  CREATE INDEX IF NOT EXISTS idx_notification_queue_sent ON notification_queue(sent_at);
  CREATE INDEX IF NOT EXISTS idx_notification_queue_batch ON notification_queue(batch_id);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS notification_preferences (
    id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    batching_enabled INTEGER NOT NULL DEFAULT 1,
    batch_interval_minutes INTEGER NOT NULL DEFAULT 30,
    quiet_hours_enabled INTEGER NOT NULL DEFAULT 1,
    quiet_hours_start TEXT NOT NULL DEFAULT '21:00',
    quiet_hours_end TEXT NOT NULL DEFAULT '08:00',
    urgent_bypass_quiet_hours INTEGER NOT NULL DEFAULT 1,
    max_batch_size INTEGER NOT NULL DEFAULT 5,
    category_preferences TEXT,
    updated_at TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS notification_batches (
    id TEXT PRIMARY KEY,
    recipient_phone TEXT NOT NULL,
    notification_count INTEGER NOT NULL,
    categories TEXT NOT NULL,
    sent_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_notification_batches_recipient ON notification_batches(recipient_phone);
  CREATE INDEX IF NOT EXISTS idx_notification_batches_sent ON notification_batches(sent_at);
`);

console.log("Smart notification batching tables initialized");

// ============================================
// NATURAL LANGUAGE AUTOMATION SYSTEM
// ============================================

// Create nl_automations table for natural language defined automations
db.exec(`
  CREATE TABLE IF NOT EXISTS nl_automations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    original_phrase TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    trigger_config TEXT NOT NULL,
    action_type TEXT NOT NULL,
    action_config TEXT NOT NULL,
    conditions TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_triggered_at TEXT,
    trigger_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_nl_automations_enabled ON nl_automations(enabled);
  CREATE INDEX IF NOT EXISTS idx_nl_automations_trigger_type ON nl_automations(trigger_type);
  CREATE INDEX IF NOT EXISTS idx_nl_automations_action_type ON nl_automations(action_type);
`);

// Create nl_automation_logs table for execution history
db.exec(`
  CREATE TABLE IF NOT EXISTS nl_automation_logs (
    id TEXT PRIMARY KEY,
    automation_id TEXT NOT NULL,
    trigger_data TEXT,
    action_result TEXT,
    success INTEGER NOT NULL,
    error_message TEXT,
    executed_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_nl_automation_logs_automation ON nl_automation_logs(automation_id);
  CREATE INDEX IF NOT EXISTS idx_nl_automation_logs_executed ON nl_automation_logs(executed_at);
  CREATE INDEX IF NOT EXISTS idx_nl_automation_logs_success ON nl_automation_logs(success);
`);

console.log("Natural language automation tables initialized");

// ============================================
// LIMITLESS ENHANCED FEATURES TABLES
// ============================================

// Create meetings table for multi-speaker conversation tracking
db.exec(`
  CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    lifelog_id TEXT NOT NULL,
    title TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    participants TEXT NOT NULL,
    topics TEXT,
    summary TEXT,
    action_items TEXT,
    is_important INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_meetings_lifelog ON meetings(lifelog_id);
  CREATE INDEX IF NOT EXISTS idx_meetings_start_time ON meetings(start_time);
  CREATE INDEX IF NOT EXISTS idx_meetings_important ON meetings(is_important);
`);

// Create lifelog_action_items table for extracted commitments
db.exec(`
  CREATE TABLE IF NOT EXISTS lifelog_action_items (
    id TEXT PRIMARY KEY,
    lifelog_id TEXT NOT NULL,
    content TEXT NOT NULL,
    assignee TEXT,
    due_date TEXT,
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'pending',
    source_quote TEXT,
    source_offset_ms INTEGER,
    linked_task_id TEXT,
    linked_contact_id TEXT,
    processed_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_lifelog_action_items_lifelog ON lifelog_action_items(lifelog_id);
  CREATE INDEX IF NOT EXISTS idx_lifelog_action_items_status ON lifelog_action_items(status);
  CREATE INDEX IF NOT EXISTS idx_lifelog_action_items_assignee ON lifelog_action_items(assignee);
`);

// Create limitless_analytics_daily table for pre-aggregated analytics
db.exec(`
  CREATE TABLE IF NOT EXISTS limitless_analytics_daily (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL UNIQUE,
    total_conversations INTEGER NOT NULL DEFAULT 0,
    total_duration_minutes INTEGER NOT NULL DEFAULT 0,
    unique_speakers INTEGER NOT NULL DEFAULT 0,
    speaker_stats TEXT NOT NULL,
    topic_stats TEXT NOT NULL,
    hour_distribution TEXT NOT NULL,
    meeting_count INTEGER NOT NULL DEFAULT 0,
    action_items_extracted INTEGER NOT NULL DEFAULT 0,
    starred_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_limitless_analytics_daily_date ON limitless_analytics_daily(date);
`);

console.log("Limitless enhanced features tables initialized");

// Seed initial family members if table is empty
try {
  const existingMembers = db.prepare(`SELECT COUNT(*) as count FROM family_members`).get() as { count: number };
  if (existingMembers.count === 0) {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO family_members (id, name, is_active, created_at) VALUES (?, ?, 1, ?)`).run(uuidv4(), "Nate", now);
    db.prepare(`INSERT INTO family_members (id, name, is_active, created_at) VALUES (?, ?, 1, ?)`).run(uuidv4(), "Shakita", now);
    console.log("Seeded initial family members: Nate, Shakita");
  }
} catch (e) {
  console.error("Error seeding family members:", e);
}

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

// Migration: Add conversation summarization columns
try {
  const convInfo = db.prepare("PRAGMA table_info(conversations)").all() as Array<{ name: string }>;
  if (!convInfo.some(col => col.name === "summary")) {
    console.log("Adding 'summary' column to conversations table...");
    db.exec(`ALTER TABLE conversations ADD COLUMN summary TEXT`);
  }
  if (!convInfo.some(col => col.name === "summarized_message_count")) {
    console.log("Adding 'summarized_message_count' column to conversations table...");
    db.exec(`ALTER TABLE conversations ADD COLUMN summarized_message_count INTEGER DEFAULT 0`);
  }
  if (!convInfo.some(col => col.name === "last_summarized_at")) {
    console.log("Adding 'last_summarized_at' column to conversations table...");
    db.exec(`ALTER TABLE conversations ADD COLUMN last_summarized_at TEXT`);
  }
} catch (e) {
  console.error("Migration error for conversation summarization:", e);
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
  summary: string | null;
  summarized_message_count: number | null;
  last_summarized_at: string | null;
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
  purchased_at: string | null;
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
  parent_reminder_id: string | null;
  sequence_position: number | null;
  sequence_total: number | null;
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
  parent_task_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ContactRow {
  id: string;
  name: string | null;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  phone_number: string;
  email: string | null;
  ai_assistant_phone: string | null;
  image_url: string | null;
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

// Custom lists system row types
interface CustomListRow {
  id: string;
  name: string;
  type: string;
  icon: string | null;
  color: string | null;
  is_shared: number;
  created_at: string;
  updated_at: string;
}

interface CustomListItemRow {
  id: string;
  list_id: string;
  content: string;
  checked: number;
  added_by: string | null;
  priority: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Food preference system row types
interface FamilyMemberRow {
  id: string;
  name: string;
  is_active: number;
  created_at: string;
}

interface FoodPreferenceRow {
  id: string;
  member_id: string;
  item_type: string;
  item_name: string;
  preference: string;
  strength: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface DietaryRestrictionRow {
  id: string;
  member_id: string;
  restriction_type: string;
  restriction_name: string;
  severity: string;
  notes: string | null;
  created_at: string;
}

interface MealHistoryRow {
  id: string;
  name: string;
  meal_type: string;
  cuisine: string | null;
  rating: number | null;
  notes: string | null;
  recipe_id: string | null;
  cooked_at: string;
  created_at: string;
}

interface SavedRecipeRow {
  id: string;
  name: string;
  description: string | null;
  cuisine: string | null;
  meal_type: string | null;
  prep_time: number | null;
  cook_time: number | null;
  servings: number | null;
  ingredients: string;
  instructions: string;
  source: string | null;
  family_rating: number | null;
  times_cooked: number;
  is_favorite: number;
  created_at: string;
  updated_at: string;
}

// Limitless summary row type
interface LimitlessSummaryRow {
  id: string;
  date: string;
  timeframe_start: string;
  timeframe_end: string;
  summary_title: string;
  key_discussions: string;
  action_items: string;
  insights: string | null;
  people_interacted: string | null;
  topics_discussed: string | null;
  lifelog_ids: string;
  lifelog_count: number;
  total_duration_minutes: number | null;
  created_at: string;
  updated_at: string;
}

// Entity system row types
interface EntityRow {
  id: string;
  type: string;
  label: string;
  canonical_id: string | null;
  metadata: string | null;
  created_at: string;
}

interface EntityReferenceRow {
  id: string;
  entity_id: string;
  domain: string;
  item_id: string;
  confidence: string;
  extracted_at: string;
  context: string | null;
}

interface EntityLinkRow {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  weight: string;
  first_seen_at: string;
  last_seen_at: string;
  metadata: string | null;
}

// Insight system row type
interface InsightRow {
  id: string;
  type: string;
  category: string;
  title: string;
  content: string;
  priority: string;
  confidence: string;
  suggested_action: string | null;
  action_payload: string | null;
  status: string;
  source_entity_id: string | null;
  created_at: string;
  updated_at: string;
  dismissed_at: string | null;
  surfaced_at: string | null;
  expires_at: string | null;
}

// Notification batching row types
interface NotificationQueueRow {
  id: string;
  recipient_phone: string;
  category: string;
  priority: string;
  title: string;
  content: string;
  source_type: string | null;
  source_id: string | null;
  scheduled_for: string | null;
  sent_at: string | null;
  batch_id: string | null;
  created_at: string;
}

interface NotificationPreferencesRow {
  id: string;
  enabled: number;
  batching_enabled: number;
  batch_interval_minutes: number;
  quiet_hours_enabled: number;
  quiet_hours_start: string;
  quiet_hours_end: string;
  urgent_bypass_quiet_hours: number;
  max_batch_size: number;
  category_preferences: string | null;
  updated_at: string;
}

interface NotificationBatchRow {
  id: string;
  recipient_phone: string;
  notification_count: number;
  categories: string;
  sent_at: string;
}

// Helper to map database row to Conversation type (snake_case -> camelCase)
function mapConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    phoneNumber: row.phone_number,
    source: row.source as "web" | "sms",
    mode: row.mode as "chat" | "getting_to_know",
    summary: row.summary,
    summarizedMessageCount: row.summarized_message_count ?? 0,
    lastSummarizedAt: row.last_summarized_at,
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
    parentReminderId: row.parent_reminder_id || null,
    sequencePosition: row.sequence_position ?? null,
    sequenceTotal: row.sequence_total ?? null,
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

// Entity system mapper functions
function mapEntity(row: EntityRow): Entity {
  return {
    id: row.id,
    type: row.type as EntityType,
    label: row.label,
    canonicalId: row.canonical_id,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

function mapEntityReference(row: EntityReferenceRow): EntityReference {
  return {
    id: row.id,
    entityId: row.entity_id,
    domain: row.domain as EntityDomain,
    itemId: row.item_id,
    confidence: row.confidence,
    extractedAt: row.extracted_at,
    context: row.context,
  };
}

function mapEntityLink(row: EntityLinkRow): EntityLink {
  return {
    id: row.id,
    sourceEntityId: row.source_entity_id,
    targetEntityId: row.target_entity_id,
    relationshipType: row.relationship_type as EntityRelationshipType,
    weight: row.weight,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    metadata: row.metadata,
  };
}

// Insight system mapper function
function mapInsight(row: InsightRow): Insight {
  return {
    id: row.id,
    type: row.type as InsightType,
    category: row.category as InsightCategory,
    title: row.title,
    content: row.content,
    priority: row.priority as InsightPriority,
    confidence: row.confidence,
    suggestedAction: row.suggested_action,
    actionPayload: row.action_payload,
    status: row.status as InsightStatus,
    sourceEntityId: row.source_entity_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    dismissedAt: row.dismissed_at,
    surfacedAt: row.surfaced_at,
    expiresAt: row.expires_at,
  };
}

// Notification batching mapper functions
function mapNotificationQueueItem(row: NotificationQueueRow): NotificationQueueItem {
  return {
    id: row.id,
    recipientPhone: row.recipient_phone,
    category: row.category as NotificationCategory,
    priority: row.priority as NotificationPriority,
    title: row.title,
    content: row.content,
    sourceType: row.source_type,
    sourceId: row.source_id,
    scheduledFor: row.scheduled_for,
    sentAt: row.sent_at,
    batchId: row.batch_id,
    createdAt: row.created_at,
  };
}

function mapNotificationPreferences(row: NotificationPreferencesRow): NotificationPreferences {
  return {
    id: row.id,
    enabled: Boolean(row.enabled),
    batchingEnabled: Boolean(row.batching_enabled),
    batchIntervalMinutes: row.batch_interval_minutes,
    quietHoursEnabled: Boolean(row.quiet_hours_enabled),
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    urgentBypassQuietHours: Boolean(row.urgent_bypass_quiet_hours),
    maxBatchSize: row.max_batch_size,
    categoryPreferences: row.category_preferences,
    updatedAt: row.updated_at,
  };
}

function mapNotificationBatch(row: NotificationBatchRow): NotificationBatch {
  return {
    id: row.id,
    recipientPhone: row.recipient_phone,
    notificationCount: row.notification_count,
    categories: row.categories,
    sentAt: row.sent_at,
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
      summary: null,
      summarizedMessageCount: 0,
      lastSummarizedAt: null,
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

export function updateConversationSummary(
  id: string, 
  summary: string, 
  summarizedMessageCount: number
): Conversation | undefined {
  return wrapDbOperation("updateConversationSummary", () => {
    const now = getCurrentTimestamp();
    db.prepare(`
      UPDATE conversations 
      SET summary = ?, summarized_message_count = ?, last_summarized_at = ?, updated_at = ? 
      WHERE id = ?
    `).run(summary, summarizedMessageCount, now, now, id);
    return getConversation(id);
  });
}

export function getConversationsNeedingSummary(messageThreshold: number = 30): Array<{ conversationId: string; messageCount: number; summarizedCount: number }> {
  return wrapDbOperation("getConversationsNeedingSummary", () => {
    const rows = db.prepare(`
      SELECT c.id as conversation_id, 
             COUNT(m.id) as message_count,
             COALESCE(c.summarized_message_count, 0) as summarized_count
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      GROUP BY c.id
      HAVING COUNT(m.id) - COALESCE(c.summarized_message_count, 0) >= ?
    `).all(messageThreshold) as Array<{ conversation_id: string; message_count: number; summarized_count: number }>;
    
    return rows.map(r => ({
      conversationId: r.conversation_id,
      messageCount: r.message_count,
      summarizedCount: r.summarized_count
    }));
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
  const result = wrapDbOperation("createMemoryNote", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    const context = data.context || "";
    const embeddingStr = data.embedding ? JSON.stringify(data.embedding) : null;
    
    db.prepare(`
      INSERT INTO memory_notes (id, type, content, context, embedding, place_id, contact_id, source_type, source_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.type, data.content, context, embeddingStr, data.placeId || null, data.contactId || null, data.sourceType || "conversation", data.sourceId || null, now, now);
    
    return { 
      id, 
      type: data.type as "summary" | "note" | "preference" | "fact", 
      content: data.content, 
      context, 
      embedding: embeddingStr,
      isSuperseded: false,
      supersededBy: null,
      placeId: data.placeId || null,
      contactId: data.contactId || null,
      sourceType: (data.sourceType || "conversation") as "conversation" | "lifelog" | "manual" | "observation",
      sourceId: data.sourceId || null,
      createdAt: now, 
      updatedAt: now 
    };
  });
  invalidateMemoryCache();
  return result;
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
  const result = wrapDbOperation("updateMemoryNote", () => {
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
  if (result) invalidateMemoryCache();
  return result;
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
  const result = wrapDbOperation("deleteMemoryNote", () => {
    const dbResult = db.prepare(`DELETE FROM memory_notes WHERE id = ?`).run(id);
    return dbResult.changes > 0;
  });
  if (result) invalidateMemoryCache();
  return result;
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
    purchasedAt: row.purchased_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Grocery item operations
export function createGroceryItem(data: InsertGroceryItem): GroceryItem {
  const result = wrapDbOperation("createGroceryItem", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    const quantity = data.quantity || "1";
    const category = data.category || "Other";
    const purchased = data.purchased ?? false;
    const purchasedAt = purchased ? now : null;
    
    db.prepare(`
      INSERT INTO grocery_items (id, name, quantity, category, added_by, purchased, purchased_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name, quantity, category, data.addedBy, purchased ? 1 : 0, purchasedAt, now, now);
    
    return {
      id,
      name: data.name,
      quantity,
      category,
      addedBy: data.addedBy,
      purchased,
      purchasedAt,
      createdAt: now,
      updatedAt: now,
    };
  });
  invalidateGroceryCache();
  return result;
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
  const result = wrapDbOperation("updateGroceryItem", () => {
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
  if (result) invalidateGroceryCache();
  return result;
}

export function toggleGroceryItemPurchased(id: string): GroceryItem | undefined {
  const result = wrapDbOperation("toggleGroceryItemPurchased", () => {
    const existing = getGroceryItem(id);
    if (!existing) return undefined;
    
    const now = getCurrentTimestamp();
    const newPurchased = !existing.purchased;
    const purchasedAt = newPurchased ? now : null;
    
    db.prepare(`
      UPDATE grocery_items SET purchased = ?, purchased_at = ?, updated_at = ? WHERE id = ?
    `).run(newPurchased ? 1 : 0, purchasedAt, now, id);
    
    return getGroceryItem(id);
  });
  if (result) invalidateGroceryCache();
  return result;
}

export function deleteGroceryItem(id: string): boolean {
  const result = wrapDbOperation("deleteGroceryItem", () => {
    const dbResult = db.prepare(`DELETE FROM grocery_items WHERE id = ?`).run(id);
    return dbResult.changes > 0;
  });
  if (result) invalidateGroceryCache();
  return result;
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

export function getGroceryAutoClearHours(): number {
  return wrapDbOperation("getGroceryAutoClearHours", () => {
    const row = db.prepare(`
      SELECT value FROM preferences WHERE key = ?
    `).get("grocery_auto_clear_hours") as { value: string } | undefined;
    return row ? parseInt(row.value, 10) : 0;
  });
}

export function setGroceryAutoClearHours(hours: number): void {
  wrapDbOperation("setGroceryAutoClearHours", () => {
    const now = getCurrentTimestamp();
    const existing = db.prepare(`SELECT id FROM preferences WHERE key = ?`).get("grocery_auto_clear_hours");
    
    if (existing) {
      db.prepare(`UPDATE preferences SET value = ?, updated_at = ? WHERE key = ?`).run(
        hours.toString(),
        now,
        "grocery_auto_clear_hours"
      );
    } else {
      db.prepare(`INSERT INTO preferences (id, key, value, updated_at) VALUES (?, ?, ?, ?)`).run(
        uuidv4(),
        "grocery_auto_clear_hours",
        hours.toString(),
        now
      );
    }
  });
}

export function clearOldPurchasedGroceryItems(olderThanHours: number): number {
  return wrapDbOperation("clearOldPurchasedGroceryItems", () => {
    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();
    const result = db.prepare(`
      DELETE FROM grocery_items 
      WHERE purchased = 1 AND purchased_at IS NOT NULL AND purchased_at < ?
    `).run(cutoffTime);
    return result.changes;
  });
}

// Reminder operations
export function createReminder(data: InsertReminder): Reminder {
  return wrapDbOperation("createReminder", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    
    db.prepare(`
      INSERT INTO reminders (id, message, recipient_phone, conversation_id, scheduled_for, created_at, completed, place_id, parent_reminder_id, sequence_position, sequence_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, 
      data.message, 
      data.recipientPhone || null, 
      data.conversationId || null, 
      data.scheduledFor, 
      now, 
      data.completed ? 1 : 0, 
      data.placeId || null,
      data.parentReminderId || null,
      data.sequencePosition ?? null,
      data.sequenceTotal ?? null
    );
    
    return {
      id,
      message: data.message,
      recipientPhone: data.recipientPhone || null,
      conversationId: data.conversationId || null,
      scheduledFor: data.scheduledFor,
      createdAt: now,
      completed: data.completed || false,
      placeId: data.placeId || null,
      parentReminderId: data.parentReminderId || null,
      sequencePosition: data.sequencePosition ?? null,
      sequenceTotal: data.sequenceTotal ?? null,
    };
  });
}

export function getReminderSequence(parentId: string): Reminder[] {
  return wrapDbOperation("getReminderSequence", () => {
    const rows = db.prepare(`
      SELECT * FROM reminders 
      WHERE parent_reminder_id = ? OR id = ?
      ORDER BY scheduled_for ASC
    `).all(parentId, parentId) as ReminderRow[];
    return rows.map(mapReminder);
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
    parentTaskId: row.parent_task_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Task operations
export function createTask(data: InsertTask): Task {
  const result = wrapDbOperation("createTask", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    const description = data.description || "";
    const priority = data.priority || "medium";
    const category = data.category || "personal";
    const completed = data.completed ?? false;
    
    db.prepare(`
      INSERT INTO tasks (id, title, description, priority, due_date, category, completed, place_id, parent_task_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.title, description, priority, data.dueDate || null, category, completed ? 1 : 0, data.placeId || null, data.parentTaskId || null, now, now);
    
    return {
      id,
      title: data.title,
      description,
      priority: priority as "low" | "medium" | "high",
      dueDate: data.dueDate || null,
      category: category as "work" | "personal" | "family",
      completed,
      placeId: data.placeId || null,
      parentTaskId: data.parentTaskId || null,
      createdAt: now,
      updatedAt: now,
    };
  });
  invalidateTaskCache();
  return result;
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

export function getTasksDueTomorrow(): Task[] {
  return wrapDbOperation("getTasksDueTomorrow", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const rows = db.prepare(`
      SELECT * FROM tasks 
      WHERE due_date LIKE ? AND completed = 0
      ORDER BY priority DESC, created_at ASC
    `).all(`${tomorrowStr}%`) as TaskRow[];
    return rows.map(mapTask);
  });
}

export function updateTask(id: string, data: UpdateTask): Task | undefined {
  const result = wrapDbOperation("updateTask", () => {
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
  if (result) invalidateTaskCache();
  return result;
}

export function toggleTaskCompleted(id: string): Task | undefined {
  const result = wrapDbOperation("toggleTaskCompleted", () => {
    const existing = getTask(id);
    if (!existing) return undefined;
    
    const now = getCurrentTimestamp();
    const newCompleted = !existing.completed;
    
    db.prepare(`
      UPDATE tasks SET completed = ?, updated_at = ? WHERE id = ?
    `).run(newCompleted ? 1 : 0, now, id);
    
    return getTask(id);
  });
  if (result) invalidateTaskCache();
  return result;
}

export function deleteTask(id: string): boolean {
  const result = wrapDbOperation("deleteTask", () => {
    const dbResult = db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
    return dbResult.changes > 0;
  });
  if (result) invalidateTaskCache();
  return result;
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

// Get subtasks for a parent task
export function getSubtasks(parentTaskId: string): Task[] {
  return wrapDbOperation("getSubtasks", () => {
    const rows = db.prepare(`
      SELECT * FROM tasks 
      WHERE parent_task_id = ?
      ORDER BY completed ASC, due_date ASC NULLS LAST, priority DESC, created_at ASC
    `).all(parentTaskId) as TaskRow[];
    return rows.map(mapTask);
  });
}

// Get a task with its subtasks
export interface TaskWithSubtasks extends Task {
  subtasks: Task[];
}

export function getTaskWithSubtasks(taskId: string): TaskWithSubtasks | undefined {
  return wrapDbOperation("getTaskWithSubtasks", () => {
    const task = getTask(taskId);
    if (!task) return undefined;
    
    const subtasks = getSubtasks(taskId);
    return {
      ...task,
      subtasks,
    };
  });
}

// Get all parent tasks (tasks that have subtasks)
export function getParentTasks(): Task[] {
  return wrapDbOperation("getParentTasks", () => {
    const rows = db.prepare(`
      SELECT DISTINCT t.* FROM tasks t
      INNER JOIN tasks st ON st.parent_task_id = t.id
      ORDER BY t.completed ASC, t.due_date ASC NULLS LAST, t.priority DESC
    `).all() as TaskRow[];
    return rows.map(mapTask);
  });
}

// Get top-level tasks only (tasks without a parent)
export function getTopLevelTasks(includeCompleted: boolean = true): Task[] {
  return wrapDbOperation("getTopLevelTasks", () => {
    const query = includeCompleted
      ? `SELECT * FROM tasks WHERE parent_task_id IS NULL ORDER BY completed ASC, due_date ASC NULLS LAST, priority DESC, created_at DESC`
      : `SELECT * FROM tasks WHERE parent_task_id IS NULL AND completed = 0 ORDER BY due_date ASC NULLS LAST, priority DESC, created_at DESC`;
    const rows = db.prepare(query).all() as TaskRow[];
    return rows.map(mapTask);
  });
}

// Helper to map database row to Contact type
function mapContact(row: ContactRow): Contact {
  return {
    id: row.id,
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    middleName: row.middle_name,
    phoneNumber: row.phone_number,
    email: row.email,
    aiAssistantPhone: row.ai_assistant_phone,
    imageUrl: row.image_url,
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
    lastInteractionAt: row.last_interaction_at,
    interactionCount: row.interaction_count || 0,
    metadata: row.metadata,
    isAutoCreated: Boolean(row.is_auto_created),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Helper to get full name from firstName/lastName
export function getContactFullName(contact: Contact): string {
  const parts = [contact.firstName];
  if (contact.middleName) parts.push(contact.middleName);
  if (contact.lastName) parts.push(contact.lastName);
  return parts.join(' ').trim() || 'Unknown';
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
  const result = wrapDbOperation("createContact", () => {
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
    
    const firstName = data.firstName || '';
    const lastName = data.lastName || '';
    const middleName = data.middleName || null;
    const email = data.email || null;
    const aiAssistantPhone = data.aiAssistantPhone || null;
    const imageUrl = data.imageUrl || null;
    const birthday = data.birthday || null;
    const occupation = data.occupation || null;
    const organization = data.organization || null;
    const isAutoCreated = data.isAutoCreated ?? false;
    const metadata = data.metadata || null;
    
    db.prepare(`
      INSERT INTO contacts (id, first_name, last_name, middle_name, phone_number, email, ai_assistant_phone, image_url,
        access_level, relationship, notes, 
        can_access_personal_info, can_access_calendar, can_access_tasks, can_access_grocery, can_set_reminders,
        birthday, occupation, organization, last_interaction_at, interaction_count, metadata, is_auto_created,
        created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, firstName, lastName, middleName, normalizedPhone, email, aiAssistantPhone, imageUrl,
      accessLevel, relationship, notes,
      canAccessPersonalInfo ? 1 : 0, canAccessCalendar ? 1 : 0, canAccessTasks ? 1 : 0, 
      canAccessGrocery ? 1 : 0, canSetReminders ? 1 : 0,
      birthday, occupation, organization, now, 0, metadata, isAutoCreated ? 1 : 0,
      now, now
    );
    
    return {
      id,
      firstName,
      lastName,
      middleName,
      phoneNumber: normalizedPhone,
      email,
      aiAssistantPhone,
      imageUrl,
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
      lastInteractionAt: now,
      interactionCount: 0,
      metadata,
      isAutoCreated,
      createdAt: now,
      updatedAt: now,
    };
  });
  invalidateContactCache();
  return result;
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
      SELECT * FROM contacts ORDER BY first_name ASC, last_name ASC
    `).all() as ContactRow[];
    return rows.map(mapContact);
  });
}

export function getContactsByAccessLevel(level: AccessLevel): Contact[] {
  return wrapDbOperation("getContactsByAccessLevel", () => {
    const rows = db.prepare(`
      SELECT * FROM contacts WHERE access_level = ? ORDER BY first_name ASC, last_name ASC
    `).all(level) as ContactRow[];
    return rows.map(mapContact);
  });
}

export function updateContact(id: string, data: UpdateContact): Contact | undefined {
  const result = wrapDbOperation("updateContact", () => {
    const existing = getContact(id);
    if (!existing) return undefined;
    
    const now = getCurrentTimestamp();
    const firstName = data.firstName ?? existing.firstName;
    const lastName = data.lastName ?? existing.lastName;
    const middleName = data.middleName !== undefined ? data.middleName : existing.middleName;
    const phoneNumber = data.phoneNumber ? normalizePhoneNumber(data.phoneNumber) : existing.phoneNumber;
    const email = data.email !== undefined ? data.email : existing.email;
    const aiAssistantPhone = data.aiAssistantPhone !== undefined ? data.aiAssistantPhone : existing.aiAssistantPhone;
    const imageUrl = data.imageUrl !== undefined ? data.imageUrl : existing.imageUrl;
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
    const lastInteractionAt = data.lastInteractionAt !== undefined ? data.lastInteractionAt : existing.lastInteractionAt;
    const interactionCount = data.interactionCount ?? existing.interactionCount;
    const metadata = data.metadata !== undefined ? data.metadata : existing.metadata;
    const isAutoCreated = data.isAutoCreated ?? existing.isAutoCreated;
    
    db.prepare(`
      UPDATE contacts 
      SET first_name = ?, last_name = ?, middle_name = ?, phone_number = ?, email = ?, ai_assistant_phone = ?, image_url = ?,
          access_level = ?, relationship = ?, notes = ?,
          can_access_personal_info = ?, can_access_calendar = ?, can_access_tasks = ?,
          can_access_grocery = ?, can_set_reminders = ?,
          birthday = ?, occupation = ?, organization = ?,
          last_interaction_at = ?, interaction_count = ?, metadata = ?, is_auto_created = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      firstName, lastName, middleName, phoneNumber, email, aiAssistantPhone, imageUrl,
      accessLevel, relationship, notes,
      canAccessPersonalInfo ? 1 : 0, canAccessCalendar ? 1 : 0, canAccessTasks ? 1 : 0,
      canAccessGrocery ? 1 : 0, canSetReminders ? 1 : 0,
      birthday, occupation, organization,
      lastInteractionAt, interactionCount, metadata, isAutoCreated ? 1 : 0,
      now, id
    );
    
    return getContact(id);
  });
  if (result) invalidateContactCache();
  return result;
}

export function deleteContact(id: string): boolean {
  const result = wrapDbOperation("deleteContact", () => {
    const dbResult = db.prepare(`DELETE FROM contacts WHERE id = ?`).run(id);
    return dbResult.changes > 0;
  });
  if (result) invalidateContactCache();
  return result;
}

// Contact Notes CRUD operations
interface ContactNoteRow {
  id: string;
  contact_id: string;
  content: string;
  note_type: string;
  created_by: string;
  created_at: string;
}

function mapContactNote(row: ContactNoteRow): ContactNote {
  return {
    id: row.id,
    contactId: row.contact_id,
    content: row.content,
    noteType: row.note_type as ContactNoteType,
    createdBy: row.created_by as "nate" | "zeke",
    createdAt: row.created_at,
  };
}

export function createContactNote(data: InsertContactNote): ContactNote {
  return wrapDbOperation("createContactNote", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    
    db.prepare(`
      INSERT INTO contact_notes (id, contact_id, content, note_type, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.contactId, data.content, data.noteType || 'observation', data.createdBy || 'zeke', now);
    
    return {
      id,
      contactId: data.contactId,
      content: data.content,
      noteType: (data.noteType || 'observation') as ContactNoteType,
      createdBy: (data.createdBy || 'zeke') as "nate" | "zeke",
      createdAt: now,
    };
  });
}

export function getContactNotes(contactId: string): ContactNote[] {
  return wrapDbOperation("getContactNotes", () => {
    const rows = db.prepare(`
      SELECT * FROM contact_notes WHERE contact_id = ? ORDER BY created_at DESC
    `).all(contactId) as ContactNoteRow[];
    return rows.map(mapContactNote);
  });
}

export function getContactNotesByType(contactId: string, noteType: ContactNoteType): ContactNote[] {
  return wrapDbOperation("getContactNotesByType", () => {
    const rows = db.prepare(`
      SELECT * FROM contact_notes WHERE contact_id = ? AND note_type = ? ORDER BY created_at DESC
    `).all(contactId, noteType) as ContactNoteRow[];
    return rows.map(mapContactNote);
  });
}

export function deleteContactNote(id: string): boolean {
  return wrapDbOperation("deleteContactNote", () => {
    const result = db.prepare(`DELETE FROM contact_notes WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

export function deleteAllContactNotes(contactId: string): number {
  return wrapDbOperation("deleteAllContactNotes", () => {
    const result = db.prepare(`DELETE FROM contact_notes WHERE contact_id = ?`).run(contactId);
    return result.changes;
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
        firstName: "Nate",
        lastName: "(Admin)",
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
      firstName: "Unknown",
      lastName: `(${normalizedPhone})`,
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
        c.id as contact_id,
        CASE 
          WHEN c.first_name IS NOT NULL AND c.last_name IS NOT NULL 
            THEN c.first_name || ' ' || c.last_name
          WHEN c.first_name IS NOT NULL 
            THEN c.first_name
          ELSE NULL 
        END as contact_name,
        rm.last_message,
        rm.last_message_at,
        mc.message_count
      FROM RankedMessages rm
      JOIN MessageCounts mc ON rm.phone_number = mc.phone_number
      LEFT JOIN contacts c ON rm.phone_number = c.phone_number
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

// ============================================
// LIFELOG-LOCATION CORRELATION FUNCTIONS
// ============================================

import type {
  LifelogLocation,
  InsertLifelogLocation,
  ActivityType,
  LifelogLocationContext,
  TimelineEntry,
} from "@shared/schema";

interface LifelogLocationRow {
  id: string;
  lifelog_id: string;
  lifelog_title: string;
  lifelog_start_time: string;
  lifelog_end_time: string;
  start_latitude: string | null;
  start_longitude: string | null;
  start_accuracy: string | null;
  end_latitude: string | null;
  end_longitude: string | null;
  end_accuracy: string | null;
  saved_place_id: string | null;
  saved_place_name: string | null;
  saved_place_category: string | null;
  activity_type: string | null;
  total_distance_meters: string | null;
  average_speed: string | null;
  dwell_time_minutes: string | null;
  location_confidence: string | null;
  correlated_at: string;
  created_at: string;
}

function mapLifelogLocation(row: LifelogLocationRow): LifelogLocation {
  return {
    id: row.id,
    lifelogId: row.lifelog_id,
    lifelogTitle: row.lifelog_title,
    lifelogStartTime: row.lifelog_start_time,
    lifelogEndTime: row.lifelog_end_time,
    startLatitude: row.start_latitude,
    startLongitude: row.start_longitude,
    startAccuracy: row.start_accuracy,
    endLatitude: row.end_latitude,
    endLongitude: row.end_longitude,
    endAccuracy: row.end_accuracy,
    savedPlaceId: row.saved_place_id,
    savedPlaceName: row.saved_place_name,
    savedPlaceCategory: row.saved_place_category,
    activityType: (row.activity_type as ActivityType) || "unknown",
    totalDistanceMeters: row.total_distance_meters,
    averageSpeed: row.average_speed,
    dwellTimeMinutes: row.dwell_time_minutes,
    locationConfidence: row.location_confidence,
    correlatedAt: row.correlated_at,
    createdAt: row.created_at,
  };
}

// Create or update a lifelog-location correlation
export function upsertLifelogLocation(data: InsertLifelogLocation): LifelogLocation {
  return wrapDbOperation("upsertLifelogLocation", () => {
    const existing = db.prepare(`SELECT id FROM lifelog_locations WHERE lifelog_id = ?`).get(data.lifelogId) as { id: string } | undefined;
    const now = new Date().toISOString();
    
    if (existing) {
      db.prepare(`
        UPDATE lifelog_locations SET
          lifelog_title = ?,
          lifelog_start_time = ?,
          lifelog_end_time = ?,
          start_latitude = ?,
          start_longitude = ?,
          start_accuracy = ?,
          end_latitude = ?,
          end_longitude = ?,
          end_accuracy = ?,
          saved_place_id = ?,
          saved_place_name = ?,
          saved_place_category = ?,
          activity_type = ?,
          total_distance_meters = ?,
          average_speed = ?,
          dwell_time_minutes = ?,
          location_confidence = ?,
          correlated_at = ?
        WHERE id = ?
      `).run(
        data.lifelogTitle,
        data.lifelogStartTime,
        data.lifelogEndTime,
        data.startLatitude || null,
        data.startLongitude || null,
        data.startAccuracy || null,
        data.endLatitude || null,
        data.endLongitude || null,
        data.endAccuracy || null,
        data.savedPlaceId || null,
        data.savedPlaceName || null,
        data.savedPlaceCategory || null,
        data.activityType || "unknown",
        data.totalDistanceMeters || null,
        data.averageSpeed || null,
        data.dwellTimeMinutes || null,
        data.locationConfidence || "medium",
        now,
        existing.id
      );
      return getLifelogLocation(existing.id)!;
    }
    
    const id = uuidv4();
    db.prepare(`
      INSERT INTO lifelog_locations (
        id, lifelog_id, lifelog_title, lifelog_start_time, lifelog_end_time,
        start_latitude, start_longitude, start_accuracy,
        end_latitude, end_longitude, end_accuracy,
        saved_place_id, saved_place_name, saved_place_category,
        activity_type, total_distance_meters, average_speed, dwell_time_minutes,
        location_confidence, correlated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.lifelogId,
      data.lifelogTitle,
      data.lifelogStartTime,
      data.lifelogEndTime,
      data.startLatitude || null,
      data.startLongitude || null,
      data.startAccuracy || null,
      data.endLatitude || null,
      data.endLongitude || null,
      data.endAccuracy || null,
      data.savedPlaceId || null,
      data.savedPlaceName || null,
      data.savedPlaceCategory || null,
      data.activityType || "unknown",
      data.totalDistanceMeters || null,
      data.averageSpeed || null,
      data.dwellTimeMinutes || null,
      data.locationConfidence || "medium",
      now,
      now
    );
    
    return getLifelogLocation(id)!;
  });
}

// Get a lifelog location by ID
export function getLifelogLocation(id: string): LifelogLocation | undefined {
  return wrapDbOperation("getLifelogLocation", () => {
    const row = db.prepare(`SELECT * FROM lifelog_locations WHERE id = ?`).get(id) as LifelogLocationRow | undefined;
    return row ? mapLifelogLocation(row) : undefined;
  });
}

// Get lifelog location by lifelog ID
export function getLifelogLocationByLifelogId(lifelogId: string): LifelogLocation | undefined {
  return wrapDbOperation("getLifelogLocationByLifelogId", () => {
    const row = db.prepare(`SELECT * FROM lifelog_locations WHERE lifelog_id = ?`).get(lifelogId) as LifelogLocationRow | undefined;
    return row ? mapLifelogLocation(row) : undefined;
  });
}

// Get all lifelog locations for a date range
export function getLifelogLocationsInRange(startDate: string, endDate: string): LifelogLocation[] {
  return wrapDbOperation("getLifelogLocationsInRange", () => {
    const rows = db.prepare(`
      SELECT * FROM lifelog_locations 
      WHERE lifelog_start_time >= ? AND lifelog_start_time <= ?
      ORDER BY lifelog_start_time DESC
    `).all(startDate, endDate) as LifelogLocationRow[];
    return rows.map(mapLifelogLocation);
  });
}

// Get lifelogs at or near a specific place
export function getLifelogsAtPlace(placeId: string): LifelogLocation[] {
  return wrapDbOperation("getLifelogsAtPlace", () => {
    const rows = db.prepare(`
      SELECT * FROM lifelog_locations 
      WHERE saved_place_id = ?
      ORDER BY lifelog_start_time DESC
    `).all(placeId) as LifelogLocationRow[];
    return rows.map(mapLifelogLocation);
  });
}

// Get lifelogs near a location (within radius)
export function getLifelogsNearLocation(lat: number, lon: number, radiusMeters: number = 500): Array<LifelogLocation & { distance: number }> {
  return wrapDbOperation("getLifelogsNearLocation", () => {
    const allLocations = db.prepare(`
      SELECT * FROM lifelog_locations 
      WHERE start_latitude IS NOT NULL AND start_longitude IS NOT NULL
      ORDER BY lifelog_start_time DESC
    `).all() as LifelogLocationRow[];
    
    const nearbyLifelogs: Array<LifelogLocation & { distance: number }> = [];
    
    for (const row of allLocations) {
      if (row.start_latitude && row.start_longitude) {
        const distance = calculateDistance(lat, lon, parseFloat(row.start_latitude), parseFloat(row.start_longitude));
        if (distance <= radiusMeters) {
          nearbyLifelogs.push({ ...mapLifelogLocation(row), distance });
        }
      }
    }
    
    return nearbyLifelogs.sort((a, b) => a.distance - b.distance);
  });
}

// Get lifelogs by activity type
export function getLifelogsByActivity(activityType: ActivityType): LifelogLocation[] {
  return wrapDbOperation("getLifelogsByActivity", () => {
    const rows = db.prepare(`
      SELECT * FROM lifelog_locations 
      WHERE activity_type = ?
      ORDER BY lifelog_start_time DESC
    `).all(activityType) as LifelogLocationRow[];
    return rows.map(mapLifelogLocation);
  });
}

// Get recent lifelog locations
export function getRecentLifelogLocations(limit: number = 20): LifelogLocation[] {
  return wrapDbOperation("getRecentLifelogLocations", () => {
    const rows = db.prepare(`
      SELECT * FROM lifelog_locations 
      ORDER BY lifelog_start_time DESC
      LIMIT ?
    `).all(limit) as LifelogLocationRow[];
    return rows.map(mapLifelogLocation);
  });
}

// Enhanced activity detection from GPS patterns
interface ActivityDetectionParams {
  avgSpeedMetersPerMin: number;
  totalDistanceMeters: number;
  durationMinutes: number;
  timestamp: string;
  placeCategory?: string;
  locationHistory: LocationHistory[];
}

export function detectActivityFromGpsPattern(params: ActivityDetectionParams): ActivityType {
  const {
    avgSpeedMetersPerMin,
    totalDistanceMeters,
    durationMinutes,
    timestamp,
    placeCategory,
    locationHistory,
  } = params;

  // 1. If at a known place, use place-based detection
  if (placeCategory) {
    if (placeCategory === "home") return "at_home";
    if (placeCategory === "work") return "at_work";
    return "at_known_place";
  }

  // 2. Parse timestamp for time-of-day analysis
  const date = new Date(timestamp);
  const hour = date.getHours();
  const dayOfWeek = date.getDay();
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  const isBusinessHours = hour >= 8 && hour < 18;
  const isCommuteTime = (hour >= 7 && hour < 9) || (hour >= 16 && hour < 19);

  // 3. Calculate movement variance (stationarity indicator)
  let movementVariance = 0;
  if (locationHistory.length >= 3) {
    const speeds: number[] = [];
    for (let i = 1; i < locationHistory.length; i++) {
      const prev = locationHistory[i - 1];
      const curr = locationHistory[i];
      const dist = calculateDistance(
        parseFloat(prev.latitude),
        parseFloat(prev.longitude),
        parseFloat(curr.latitude),
        parseFloat(curr.longitude)
      );
      const timeDiff = (new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime()) / 1000 / 60;
      if (timeDiff > 0) {
        speeds.push(dist / timeDiff);
      }
    }
    if (speeds.length > 0) {
      const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
      movementVariance = speeds.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / speeds.length;
    }
  }

  // 4. Speed-based classification with nuanced thresholds
  const STATIONARY_THRESHOLD = 2;     // < 2 m/min = essentially not moving
  const WALKING_MIN = 2;              // > 2 m/min
  const WALKING_MAX = 100;            // < 100 m/min (~6 km/h)
  const RUNNING_MAX = 250;            // < 250 m/min (~15 km/h)
  const DRIVING_MIN = 250;            // > 250 m/min

  // Very low movement - stationary
  if (avgSpeedMetersPerMin < STATIONARY_THRESHOLD) {
    // Stationary during business hours on weekdays = likely a meeting
    if (isWeekday && isBusinessHours && durationMinutes >= 15 && durationMinutes <= 120) {
      return "meeting";
    }
    return "stationary";
  }

  // Moderate movement - walking or running
  if (avgSpeedMetersPerMin >= WALKING_MIN && avgSpeedMetersPerMin < RUNNING_MAX) {
    // High variance suggests stop-and-go (like shopping)
    if (movementVariance > 500) {
      return "walking"; // Could be shopping, browsing, etc.
    }
    return "walking";
  }

  // High speed movement - driving
  if (avgSpeedMetersPerMin >= DRIVING_MIN) {
    // During commute hours = likely commuting
    if (isWeekday && isCommuteTime) {
      return "commuting";
    }
    return "driving";
  }

  // Medium-high speed - could be transit, biking, or car
  if (avgSpeedMetersPerMin >= WALKING_MAX && avgSpeedMetersPerMin < DRIVING_MIN) {
    // Check for stop-and-go pattern typical of transit
    if (movementVariance > 1000) {
      return "transit";
    }
    // During commute hours = likely commuting
    if (isWeekday && isCommuteTime) {
      return "commuting";
    }
    return "driving";
  }

  return "unknown";
}

// Analyze location patterns to identify regular visits and routines
export function analyzeLocationPatterns(days: number = 30): {
  frequentPlaces: Array<{
    placeId: string;
    placeName: string;
    visitCount: number;
    avgDurationMinutes: number;
    commonDays: number[];
    commonHours: number[];
  }>;
  commutePatternsDetected: boolean;
  typicalHomeHours: number[];
  typicalWorkHours: number[];
} {
  return wrapDbOperation("analyzeLocationPatterns", () => {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date().toISOString();
    
    const lifelogLocs = getLifelogLocationsInRange(startDate, endDate);
    
    // Group by place
    const placeVisits: Map<string, {
      placeId: string;
      placeName: string;
      visits: Array<{
        dayOfWeek: number;
        hour: number;
        durationMinutes: number;
      }>;
    }> = new Map();
    
    let homeHours: number[] = [];
    let workHours: number[] = [];
    
    for (const loc of lifelogLocs) {
      if (!loc.savedPlaceId) continue;
      
      const date = new Date(loc.lifelogStartTime);
      const dayOfWeek = date.getDay();
      const hour = date.getHours();
      const duration = parseFloat(loc.dwellTimeMinutes || "0");
      
      const existing = placeVisits.get(loc.savedPlaceId);
      if (existing) {
        existing.visits.push({ dayOfWeek, hour, durationMinutes: duration });
      } else {
        placeVisits.set(loc.savedPlaceId, {
          placeId: loc.savedPlaceId,
          placeName: loc.savedPlaceName || "Unknown",
          visits: [{ dayOfWeek, hour, durationMinutes: duration }],
        });
      }
      
      // Track home/work hours
      if (loc.savedPlaceCategory === "home") {
        homeHours.push(hour);
      } else if (loc.savedPlaceCategory === "work") {
        workHours.push(hour);
      }
    }
    
    // Analyze each place
    const frequentPlaces = Array.from(placeVisits.values())
      .map(place => {
        const visitCount = place.visits.length;
        const avgDuration = place.visits.reduce((sum, v) => sum + v.durationMinutes, 0) / visitCount;
        
        // Find common days
        const dayCount: number[] = [0, 0, 0, 0, 0, 0, 0];
        place.visits.forEach(v => dayCount[v.dayOfWeek]++);
        const commonDays = dayCount
          .map((count, day) => ({ day, count }))
          .filter(d => d.count >= visitCount * 0.3)
          .map(d => d.day);
        
        // Find common hours
        const hourCount: number[] = new Array(24).fill(0);
        place.visits.forEach(v => hourCount[v.hour]++);
        const commonHours = hourCount
          .map((count, hour) => ({ hour, count }))
          .filter(h => h.count >= visitCount * 0.2)
          .map(h => h.hour);
        
        return {
          placeId: place.placeId,
          placeName: place.placeName,
          visitCount,
          avgDurationMinutes: Math.round(avgDuration),
          commonDays,
          commonHours,
        };
      })
      .filter(p => p.visitCount >= 2)
      .sort((a, b) => b.visitCount - a.visitCount);
    
    // Detect commute patterns (regular weekday visits to work)
    const workPlace = frequentPlaces.find(p => 
      p.commonDays.some(d => d >= 1 && d <= 5) && // weekday visits
      p.commonHours.some(h => h >= 8 && h < 18)   // business hours
    );
    const commutePatternsDetected = !!workPlace && workPlace.visitCount >= 5;
    
    // Deduplicate and find typical hours
    const typicalHomeHours = [...new Set(homeHours)].sort((a, b) => a - b);
    const typicalWorkHours = [...new Set(workHours)].sort((a, b) => a - b);
    
    return {
      frequentPlaces,
      commutePatternsDetected,
      typicalHomeHours,
      typicalWorkHours,
    };
  });
}

// Correlate a lifelog with GPS location data
export function correlateLifelogWithLocation(
  lifelogId: string,
  lifelogTitle: string,
  startTime: string,
  endTime: string
): LifelogLocation | null {
  return wrapDbOperation("correlateLifelogWithLocation", () => {
    // Find GPS data around the lifelog time window
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    
    // Extend window slightly to catch nearby GPS points
    const windowStart = new Date(startDate.getTime() - 5 * 60 * 1000).toISOString(); // 5 min before
    const windowEnd = new Date(endDate.getTime() + 5 * 60 * 1000).toISOString(); // 5 min after
    
    const locationHistory = getLocationHistoryInRange(windowStart, windowEnd);
    
    if (locationHistory.length === 0) {
      // No GPS data available, create entry with no location
      return upsertLifelogLocation({
        lifelogId,
        lifelogTitle,
        lifelogStartTime: startTime,
        lifelogEndTime: endTime,
        locationConfidence: "low",
        activityType: "unknown",
      });
    }
    
    // Sort by time
    const sorted = [...locationHistory].sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    
    // Get location closest to start time
    const startLocation = sorted.reduce((closest, loc) => {
      const locTime = new Date(loc.createdAt).getTime();
      const targetTime = startDate.getTime();
      const closestTime = new Date(closest.createdAt).getTime();
      return Math.abs(locTime - targetTime) < Math.abs(closestTime - targetTime) ? loc : closest;
    }, sorted[0]);
    
    // Get location closest to end time
    const endLocation = sorted.reduce((closest, loc) => {
      const locTime = new Date(loc.createdAt).getTime();
      const targetTime = endDate.getTime();
      const closestTime = new Date(closest.createdAt).getTime();
      return Math.abs(locTime - targetTime) < Math.abs(closestTime - targetTime) ? loc : closest;
    }, sorted[sorted.length - 1]);
    
    // Calculate total distance traveled during lifelog
    let totalDistance = 0;
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      totalDistance += calculateDistance(
        parseFloat(prev.latitude),
        parseFloat(prev.longitude),
        parseFloat(curr.latitude),
        parseFloat(curr.longitude)
      );
    }
    
    // Calculate dwell time (time spent stationary)
    const durationMinutes = (endDate.getTime() - startDate.getTime()) / 1000 / 60;
    
    // Calculate average speed (meters per minute)
    const avgSpeed = durationMinutes > 0 ? totalDistance / durationMinutes : 0;
    
    // Check if at a known place first
    const startLat = parseFloat(startLocation.latitude);
    const startLon = parseFloat(startLocation.longitude);
    const nearbyPlaces = findNearbyPlaces(startLat, startLon, 200);
    
    let savedPlaceId: string | undefined;
    let savedPlaceName: string | undefined;
    let savedPlaceCategory: string | undefined;
    
    if (nearbyPlaces.length > 0) {
      const closestPlace = nearbyPlaces[0];
      savedPlaceId = closestPlace.id;
      savedPlaceName = closestPlace.name;
      savedPlaceCategory = closestPlace.category;
    }
    
    // Use enhanced activity detection
    const activityType = detectActivityFromGpsPattern({
      avgSpeedMetersPerMin: avgSpeed,
      totalDistanceMeters: totalDistance,
      durationMinutes,
      timestamp: startTime,
      placeCategory: savedPlaceCategory,
      locationHistory: sorted,
    })
    
    // Determine confidence
    let confidence: "low" | "medium" | "high" = "medium";
    const startAccuracy = parseFloat(startLocation.accuracy || "100");
    if (startAccuracy < 20) {
      confidence = "high";
    } else if (startAccuracy > 100) {
      confidence = "low";
    }
    
    return upsertLifelogLocation({
      lifelogId,
      lifelogTitle,
      lifelogStartTime: startTime,
      lifelogEndTime: endTime,
      startLatitude: startLocation.latitude,
      startLongitude: startLocation.longitude,
      startAccuracy: startLocation.accuracy,
      endLatitude: endLocation.latitude,
      endLongitude: endLocation.longitude,
      endAccuracy: endLocation.accuracy,
      savedPlaceId,
      savedPlaceName,
      savedPlaceCategory,
      activityType,
      totalDistanceMeters: String(Math.round(totalDistance)),
      averageSpeed: String(Math.round(avgSpeed * 100) / 100),
      dwellTimeMinutes: String(Math.round(durationMinutes)),
      locationConfidence: confidence,
    });
  });
}

// Build unified timeline combining location history and lifelogs
export function buildUnifiedTimeline(startDate: string, endDate: string): TimelineEntry[] {
  return wrapDbOperation("buildUnifiedTimeline", () => {
    const timeline: TimelineEntry[] = [];
    
    // Get location history
    const locations = getLocationHistoryInRange(startDate, endDate);
    
    // Get lifelog locations
    const lifelogLocs = getLifelogLocationsInRange(startDate, endDate);
    
    // Add location points
    for (const loc of locations) {
      const nearbyPlaces = findNearbyPlaces(
        parseFloat(loc.latitude),
        parseFloat(loc.longitude),
        100
      );
      
      timeline.push({
        id: loc.id,
        type: "location",
        timestamp: loc.createdAt,
        location: {
          latitude: parseFloat(loc.latitude),
          longitude: parseFloat(loc.longitude),
          placeName: nearbyPlaces[0]?.name,
          placeCategory: nearbyPlaces[0]?.category,
        },
      });
    }
    
    // Add lifelog entries (may be combined with location)
    for (const ll of lifelogLocs) {
      // Check if there's a location entry close to this lifelog
      const existingIdx = timeline.findIndex(t => {
        if (t.type !== "location") return false;
        const timeDiff = Math.abs(
          new Date(t.timestamp).getTime() - new Date(ll.lifelogStartTime).getTime()
        );
        return timeDiff < 5 * 60 * 1000; // Within 5 minutes
      });
      
      if (existingIdx >= 0 && ll.startLatitude) {
        // Combine with existing location entry
        timeline[existingIdx].type = "combined";
        timeline[existingIdx].endTimestamp = ll.lifelogEndTime;
        timeline[existingIdx].lifelog = {
          id: ll.lifelogId,
          title: ll.lifelogTitle,
        };
        timeline[existingIdx].activity = ll.activityType as ActivityType;
      } else {
        // Add as separate lifelog entry
        timeline.push({
          id: ll.id,
          type: ll.startLatitude ? "combined" : "lifelog",
          timestamp: ll.lifelogStartTime,
          endTimestamp: ll.lifelogEndTime,
          location: ll.startLatitude ? {
            latitude: parseFloat(ll.startLatitude),
            longitude: parseFloat(ll.startLongitude!),
            placeName: ll.savedPlaceName || undefined,
            placeCategory: ll.savedPlaceCategory || undefined,
          } : undefined,
          lifelog: {
            id: ll.lifelogId,
            title: ll.lifelogTitle,
          },
          activity: ll.activityType as ActivityType,
        });
      }
    }
    
    // Sort by timestamp
    return timeline.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  });
}

// Get location context for multiple lifelogs (for context injection)
export function getLifelogLocationContexts(lifelogIds: string[]): LifelogLocationContext[] {
  return wrapDbOperation("getLifelogLocationContexts", () => {
    if (lifelogIds.length === 0) return [];
    
    const placeholders = lifelogIds.map(() => "?").join(",");
    const rows = db.prepare(`
      SELECT * FROM lifelog_locations 
      WHERE lifelog_id IN (${placeholders})
    `).all(...lifelogIds) as LifelogLocationRow[];
    
    return rows.map(row => {
      const ll = mapLifelogLocation(row);
      return {
        lifelogId: ll.lifelogId,
        lifelogTitle: ll.lifelogTitle,
        startTime: ll.lifelogStartTime,
        endTime: ll.lifelogEndTime,
        location: ll.startLatitude ? {
          latitude: parseFloat(ll.startLatitude),
          longitude: parseFloat(ll.startLongitude!),
          placeName: ll.savedPlaceName || undefined,
          placeCategory: ll.savedPlaceCategory || undefined,
        } : null,
        activity: ll.activityType as ActivityType,
        confidence: (ll.locationConfidence as "low" | "medium" | "high") || "medium",
      };
    });
  });
}

// Delete old lifelog location correlations (for cleanup)
export function deleteOldLifelogLocations(olderThanDays: number): number {
  return wrapDbOperation("deleteOldLifelogLocations", () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    const result = db.prepare(`
      DELETE FROM lifelog_locations WHERE created_at < ?
    `).run(cutoff.toISOString());
    return result.changes;
  });
}

// ============================================
// ZEKE WAKE WORD CONTEXT AGENT DATABASE FUNCTIONS
// ============================================

import type {
  WakeWordCommand,
  InsertWakeWordCommand,
  WakeWordCommandStatus,
  WakeWordActionType,
  ContextAgentSettings,
} from "@shared/schema";

interface WakeWordCommandRow {
  id: string;
  lifelog_id: string;
  lifelog_title: string;
  wake_word: string;
  raw_command: string;
  speaker_name: string | null;
  timestamp: string;
  context: string | null;
  action_type: string | null;
  action_details: string | null;
  target_contact_id: string | null;
  status: string;
  execution_result: string | null;
  confidence: string | null;
  created_at: string;
  executed_at: string | null;
}

interface ContextAgentSettingsRow {
  id: string;
  enabled: number;
  scan_interval_minutes: number;
  lookback_hours: number;
  auto_execute: number;
  require_approval_for_sms: number;
  notify_on_execution: number;
  last_scan_at: string | null;
  updated_at: string;
}

function mapWakeWordCommand(row: WakeWordCommandRow): WakeWordCommand {
  return {
    id: row.id,
    lifelogId: row.lifelog_id,
    lifelogTitle: row.lifelog_title,
    wakeWord: row.wake_word,
    rawCommand: row.raw_command,
    speakerName: row.speaker_name,
    timestamp: row.timestamp,
    context: row.context,
    actionType: row.action_type as WakeWordActionType | null,
    actionDetails: row.action_details,
    targetContactId: row.target_contact_id,
    status: row.status as WakeWordCommandStatus,
    executionResult: row.execution_result,
    confidence: row.confidence,
    createdAt: row.created_at,
    executedAt: row.executed_at,
  };
}

function mapContextAgentSettings(row: ContextAgentSettingsRow): ContextAgentSettings {
  return {
    id: row.id,
    enabled: Boolean(row.enabled),
    scanIntervalMinutes: row.scan_interval_minutes,
    lookbackHours: row.lookback_hours,
    autoExecute: Boolean(row.auto_execute),
    requireApprovalForSms: Boolean(row.require_approval_for_sms),
    notifyOnExecution: Boolean(row.notify_on_execution),
    lastScanAt: row.last_scan_at,
    updatedAt: row.updated_at,
  };
}

// Wake Word Commands CRUD

export function createWakeWordCommand(data: InsertWakeWordCommand): WakeWordCommand {
  return wrapDbOperation("createWakeWordCommand", () => {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO wake_word_commands (
        id, lifelog_id, lifelog_title, wake_word, raw_command, speaker_name,
        timestamp, context, action_type, action_details, target_contact_id,
        status, execution_result, confidence, created_at, executed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.lifelogId,
      data.lifelogTitle,
      data.wakeWord,
      data.rawCommand,
      data.speakerName || null,
      data.timestamp,
      data.context || null,
      data.actionType || null,
      data.actionDetails || null,
      data.targetContactId || null,
      data.status || "detected",
      data.executionResult || null,
      data.confidence || null,
      now,
      null
    );
    
    return {
      id,
      lifelogId: data.lifelogId,
      lifelogTitle: data.lifelogTitle,
      wakeWord: data.wakeWord,
      rawCommand: data.rawCommand,
      speakerName: data.speakerName || null,
      timestamp: data.timestamp,
      context: data.context || null,
      actionType: data.actionType || null,
      actionDetails: data.actionDetails || null,
      targetContactId: data.targetContactId || null,
      status: (data.status || "detected") as WakeWordCommandStatus,
      executionResult: data.executionResult || null,
      confidence: data.confidence || null,
      createdAt: now,
      executedAt: null,
    };
  });
}

export function getWakeWordCommand(id: string): WakeWordCommand | null {
  return wrapDbOperation("getWakeWordCommand", () => {
    const row = db.prepare(`SELECT * FROM wake_word_commands WHERE id = ?`).get(id) as WakeWordCommandRow | undefined;
    return row ? mapWakeWordCommand(row) : null;
  });
}

export function getWakeWordCommandsByLifelog(lifelogId: string): WakeWordCommand[] {
  return wrapDbOperation("getWakeWordCommandsByLifelog", () => {
    const rows = db.prepare(`
      SELECT * FROM wake_word_commands WHERE lifelog_id = ? ORDER BY created_at DESC
    `).all(lifelogId) as WakeWordCommandRow[];
    return rows.map(mapWakeWordCommand);
  });
}

export function getWakeWordCommandsByStatus(status: WakeWordCommandStatus): WakeWordCommand[] {
  return wrapDbOperation("getWakeWordCommandsByStatus", () => {
    const rows = db.prepare(`
      SELECT * FROM wake_word_commands WHERE status = ? ORDER BY created_at DESC
    `).all(status) as WakeWordCommandRow[];
    return rows.map(mapWakeWordCommand);
  });
}

export function getRecentWakeWordCommands(limit: number = 50): WakeWordCommand[] {
  return wrapDbOperation("getRecentWakeWordCommands", () => {
    const rows = db.prepare(`
      SELECT * FROM wake_word_commands ORDER BY created_at DESC LIMIT ?
    `).all(limit) as WakeWordCommandRow[];
    return rows.map(mapWakeWordCommand);
  });
}

export function getPendingWakeWordCommands(): WakeWordCommand[] {
  return wrapDbOperation("getPendingWakeWordCommands", () => {
    const rows = db.prepare(`
      SELECT * FROM wake_word_commands 
      WHERE status IN ('detected', 'parsed', 'pending_approval')
      ORDER BY created_at ASC
    `).all() as WakeWordCommandRow[];
    return rows.map(mapWakeWordCommand);
  });
}

export function updateWakeWordCommandStatus(
  id: string,
  status: WakeWordCommandStatus,
  executionResult?: string
): boolean {
  return wrapDbOperation("updateWakeWordCommandStatus", () => {
    const now = new Date().toISOString();
    const executedAt = status === "completed" || status === "failed" ? now : null;
    
    const result = db.prepare(`
      UPDATE wake_word_commands 
      SET status = ?, execution_result = COALESCE(?, execution_result), executed_at = COALESCE(?, executed_at)
      WHERE id = ?
    `).run(status, executionResult || null, executedAt, id);
    
    return result.changes > 0;
  });
}

export function updateWakeWordCommandAction(
  id: string,
  actionType: WakeWordActionType,
  actionDetails: string,
  targetContactId?: string,
  confidence?: number
): boolean {
  return wrapDbOperation("updateWakeWordCommandAction", () => {
    const result = db.prepare(`
      UPDATE wake_word_commands 
      SET action_type = ?, action_details = ?, target_contact_id = ?, confidence = ?, status = 'parsed'
      WHERE id = ?
    `).run(actionType, actionDetails, targetContactId || null, confidence?.toString() || null, id);
    
    return result.changes > 0;
  });
}

export function wakeWordCommandExists(lifelogId: string, rawCommand: string): boolean {
  return wrapDbOperation("wakeWordCommandExists", () => {
    const row = db.prepare(`
      SELECT id FROM wake_word_commands 
      WHERE lifelog_id = ? AND LOWER(raw_command) = LOWER(?)
      LIMIT 1
    `).get(lifelogId, rawCommand);
    return !!row;
  });
}

export function deleteWakeWordCommand(id: string): boolean {
  return wrapDbOperation("deleteWakeWordCommand", () => {
    const result = db.prepare(`DELETE FROM wake_word_commands WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

// Context Agent Settings

export function getContextAgentSettings(): ContextAgentSettings | null {
  return wrapDbOperation("getContextAgentSettings", () => {
    const row = db.prepare(`SELECT * FROM context_agent_settings LIMIT 1`).get() as ContextAgentSettingsRow | undefined;
    return row ? mapContextAgentSettings(row) : null;
  });
}

export function updateContextAgentSettings(data: Partial<ContextAgentSettings>): ContextAgentSettings | null {
  return wrapDbOperation("updateContextAgentSettings", () => {
    const now = new Date().toISOString();
    const current = getContextAgentSettings();
    
    if (!current) {
      return null;
    }
    
    const updates: string[] = [];
    const values: unknown[] = [];
    
    if (data.enabled !== undefined) {
      updates.push("enabled = ?");
      values.push(data.enabled ? 1 : 0);
    }
    if (data.scanIntervalMinutes !== undefined) {
      updates.push("scan_interval_minutes = ?");
      values.push(data.scanIntervalMinutes);
    }
    if (data.lookbackHours !== undefined) {
      updates.push("lookback_hours = ?");
      values.push(data.lookbackHours);
    }
    if (data.autoExecute !== undefined) {
      updates.push("auto_execute = ?");
      values.push(data.autoExecute ? 1 : 0);
    }
    if (data.requireApprovalForSms !== undefined) {
      updates.push("require_approval_for_sms = ?");
      values.push(data.requireApprovalForSms ? 1 : 0);
    }
    if (data.notifyOnExecution !== undefined) {
      updates.push("notify_on_execution = ?");
      values.push(data.notifyOnExecution ? 1 : 0);
    }
    if (data.lastScanAt !== undefined) {
      updates.push("last_scan_at = ?");
      values.push(data.lastScanAt);
    }
    
    updates.push("updated_at = ?");
    values.push(now);
    values.push(current.id);
    
    db.prepare(`
      UPDATE context_agent_settings SET ${updates.join(", ")} WHERE id = ?
    `).run(...values);
    
    return getContextAgentSettings();
  });
}

export function updateLastScanTime(): void {
  wrapDbOperation("updateLastScanTime", () => {
    const now = new Date().toISOString();
    db.prepare(`UPDATE context_agent_settings SET last_scan_at = ?, updated_at = ?`).run(now, now);
  });
}

// ============================================
// CUSTOM LISTS CRUD OPERATIONS
// ============================================

// Helper to map database row to CustomList type
function mapCustomList(row: CustomListRow): CustomList {
  return {
    id: row.id,
    name: row.name,
    type: row.type as CustomListType,
    icon: row.icon,
    color: row.color,
    isShared: Boolean(row.is_shared),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Helper to map database row to CustomListItem type
function mapCustomListItem(row: CustomListItemRow): CustomListItem {
  return {
    id: row.id,
    listId: row.list_id,
    content: row.content,
    checked: Boolean(row.checked),
    addedBy: row.added_by,
    priority: row.priority as CustomListItemPriority,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Food preference system mapper functions
function mapFamilyMember(row: FamilyMemberRow): FamilyMember {
  return {
    id: row.id,
    name: row.name,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
  };
}

function mapFoodPreference(row: FoodPreferenceRow): FoodPreference {
  return {
    id: row.id,
    memberId: row.member_id,
    itemType: row.item_type as FoodItemType,
    itemName: row.item_name,
    preference: row.preference as FoodPreferenceLevel,
    strength: row.strength,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDietaryRestriction(row: DietaryRestrictionRow): DietaryRestriction {
  return {
    id: row.id,
    memberId: row.member_id,
    restrictionType: row.restriction_type as DietaryRestrictionType,
    restrictionName: row.restriction_name,
    severity: row.severity as DietaryRestrictionSeverity,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function mapMealHistory(row: MealHistoryRow): MealHistory {
  return {
    id: row.id,
    name: row.name,
    mealType: row.meal_type as MealType,
    cuisine: row.cuisine,
    rating: row.rating,
    notes: row.notes,
    recipeId: row.recipe_id,
    cookedAt: row.cooked_at,
    createdAt: row.created_at,
  };
}

function mapSavedRecipe(row: SavedRecipeRow): SavedRecipe {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    cuisine: row.cuisine,
    mealType: row.meal_type as RecipeMealType | null,
    prepTime: row.prep_time,
    cookTime: row.cook_time,
    servings: row.servings,
    ingredients: row.ingredients,
    instructions: row.instructions,
    source: row.source,
    familyRating: row.family_rating,
    timesCooked: row.times_cooked,
    isFavorite: Boolean(row.is_favorite),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Custom List CRUD

export function createCustomList(data: InsertCustomList): CustomList {
  return wrapDbOperation("createCustomList", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    const type = data.type || "custom";
    const isShared = data.isShared ?? false;
    
    db.prepare(`
      INSERT INTO custom_lists (id, name, type, icon, color, is_shared, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name, type, data.icon || null, data.color || null, isShared ? 1 : 0, now, now);
    
    return {
      id,
      name: data.name,
      type: type as CustomListType,
      icon: data.icon || null,
      color: data.color || null,
      isShared,
      createdAt: now,
      updatedAt: now,
    };
  });
}

export function getCustomList(id: string): CustomList | undefined {
  return wrapDbOperation("getCustomList", () => {
    const row = db.prepare(`
      SELECT * FROM custom_lists WHERE id = ?
    `).get(id) as CustomListRow | undefined;
    return row ? mapCustomList(row) : undefined;
  });
}

export function getAllCustomLists(): CustomList[] {
  return wrapDbOperation("getAllCustomLists", () => {
    const rows = db.prepare(`
      SELECT * FROM custom_lists ORDER BY created_at DESC
    `).all() as CustomListRow[];
    return rows.map(mapCustomList);
  });
}

export function getCustomListByName(name: string): CustomList | undefined {
  return wrapDbOperation("getCustomListByName", () => {
    const row = db.prepare(`
      SELECT * FROM custom_lists WHERE LOWER(name) = LOWER(?)
    `).get(name) as CustomListRow | undefined;
    return row ? mapCustomList(row) : undefined;
  });
}

export function getCustomListsByType(type: CustomListType): CustomList[] {
  return wrapDbOperation("getCustomListsByType", () => {
    const rows = db.prepare(`
      SELECT * FROM custom_lists WHERE type = ? ORDER BY created_at DESC
    `).all(type) as CustomListRow[];
    return rows.map(mapCustomList);
  });
}

export function getSharedCustomLists(): CustomList[] {
  return wrapDbOperation("getSharedCustomLists", () => {
    const rows = db.prepare(`
      SELECT * FROM custom_lists WHERE is_shared = 1 ORDER BY created_at DESC
    `).all() as CustomListRow[];
    return rows.map(mapCustomList);
  });
}

export function updateCustomList(id: string, data: UpdateCustomList): CustomList | undefined {
  return wrapDbOperation("updateCustomList", () => {
    const existing = getCustomList(id);
    if (!existing) return undefined;
    
    const now = getCurrentTimestamp();
    const name = data.name ?? existing.name;
    const type = data.type ?? existing.type;
    const icon = data.icon !== undefined ? data.icon : existing.icon;
    const color = data.color !== undefined ? data.color : existing.color;
    const isShared = data.isShared ?? existing.isShared;
    
    db.prepare(`
      UPDATE custom_lists 
      SET name = ?, type = ?, icon = ?, color = ?, is_shared = ?, updated_at = ? 
      WHERE id = ?
    `).run(name, type, icon, color, isShared ? 1 : 0, now, id);
    
    return getCustomList(id);
  });
}

export function deleteCustomList(id: string): boolean {
  return wrapDbOperation("deleteCustomList", () => {
    const result = db.prepare(`DELETE FROM custom_lists WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

// Custom List Item CRUD

export function createCustomListItem(data: InsertCustomListItem): CustomListItem {
  return wrapDbOperation("createCustomListItem", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    const checked = data.checked ?? false;
    const priority = data.priority || "medium";
    
    db.prepare(`
      INSERT INTO custom_list_items (id, list_id, content, checked, added_by, priority, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.listId, data.content, checked ? 1 : 0, data.addedBy || null, priority, data.notes || null, now, now);
    
    return {
      id,
      listId: data.listId,
      content: data.content,
      checked,
      addedBy: data.addedBy || null,
      priority: priority as CustomListItemPriority,
      notes: data.notes || null,
      createdAt: now,
      updatedAt: now,
    };
  });
}

export function getCustomListItem(id: string): CustomListItem | undefined {
  return wrapDbOperation("getCustomListItem", () => {
    const row = db.prepare(`
      SELECT * FROM custom_list_items WHERE id = ?
    `).get(id) as CustomListItemRow | undefined;
    return row ? mapCustomListItem(row) : undefined;
  });
}

export function getCustomListItems(listId: string): CustomListItem[] {
  return wrapDbOperation("getCustomListItems", () => {
    const rows = db.prepare(`
      SELECT * FROM custom_list_items 
      WHERE list_id = ? 
      ORDER BY checked ASC, created_at DESC
    `).all(listId) as CustomListItemRow[];
    return rows.map(mapCustomListItem);
  });
}

export function getCustomListWithItems(id: string): CustomListWithItems | undefined {
  return wrapDbOperation("getCustomListWithItems", () => {
    const list = getCustomList(id);
    if (!list) return undefined;
    
    const items = getCustomListItems(id);
    return {
      ...list,
      items,
    };
  });
}

export function updateCustomListItem(id: string, data: UpdateCustomListItem): CustomListItem | undefined {
  return wrapDbOperation("updateCustomListItem", () => {
    const existing = getCustomListItem(id);
    if (!existing) return undefined;
    
    const now = getCurrentTimestamp();
    const content = data.content ?? existing.content;
    const checked = data.checked ?? existing.checked;
    const addedBy = data.addedBy !== undefined ? data.addedBy : existing.addedBy;
    const priority = data.priority ?? existing.priority;
    const notes = data.notes !== undefined ? data.notes : existing.notes;
    
    db.prepare(`
      UPDATE custom_list_items 
      SET content = ?, checked = ?, added_by = ?, priority = ?, notes = ?, updated_at = ? 
      WHERE id = ?
    `).run(content, checked ? 1 : 0, addedBy, priority, notes, now, id);
    
    return getCustomListItem(id);
  });
}

export function toggleCustomListItemChecked(id: string): CustomListItem | undefined {
  return wrapDbOperation("toggleCustomListItemChecked", () => {
    const existing = getCustomListItem(id);
    if (!existing) return undefined;
    
    const now = getCurrentTimestamp();
    const newChecked = !existing.checked;
    
    db.prepare(`
      UPDATE custom_list_items SET checked = ?, updated_at = ? WHERE id = ?
    `).run(newChecked ? 1 : 0, now, id);
    
    return getCustomListItem(id);
  });
}

export function deleteCustomListItem(id: string): boolean {
  return wrapDbOperation("deleteCustomListItem", () => {
    const result = db.prepare(`DELETE FROM custom_list_items WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

export function clearCheckedCustomListItems(listId: string): number {
  return wrapDbOperation("clearCheckedCustomListItems", () => {
    const result = db.prepare(`DELETE FROM custom_list_items WHERE list_id = ? AND checked = 1`).run(listId);
    return result.changes;
  });
}

// ============================================
// FOOD PREFERENCE SYSTEM CRUD OPERATIONS
// ============================================

// Family Members CRUD

export function getFamilyMembers(): FamilyMember[] {
  return wrapDbOperation("getFamilyMembers", () => {
    const rows = db.prepare(`
      SELECT * FROM family_members ORDER BY name ASC
    `).all() as FamilyMemberRow[];
    return rows.map(mapFamilyMember);
  });
}

export function getActiveFamilyMembers(): FamilyMember[] {
  return wrapDbOperation("getActiveFamilyMembers", () => {
    const rows = db.prepare(`
      SELECT * FROM family_members WHERE is_active = 1 ORDER BY name ASC
    `).all() as FamilyMemberRow[];
    return rows.map(mapFamilyMember);
  });
}

export function getFamilyMember(id: string): FamilyMember | undefined {
  return wrapDbOperation("getFamilyMember", () => {
    const row = db.prepare(`
      SELECT * FROM family_members WHERE id = ?
    `).get(id) as FamilyMemberRow | undefined;
    return row ? mapFamilyMember(row) : undefined;
  });
}

export function getFamilyMemberByName(name: string): FamilyMember | undefined {
  return wrapDbOperation("getFamilyMemberByName", () => {
    const row = db.prepare(`
      SELECT * FROM family_members WHERE LOWER(name) = LOWER(?)
    `).get(name) as FamilyMemberRow | undefined;
    return row ? mapFamilyMember(row) : undefined;
  });
}

export function createFamilyMember(name: string): FamilyMember {
  return wrapDbOperation("createFamilyMember", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    
    db.prepare(`
      INSERT INTO family_members (id, name, is_active, created_at)
      VALUES (?, ?, 1, ?)
    `).run(id, name, now);
    
    return {
      id,
      name,
      isActive: true,
      createdAt: now,
    };
  });
}

export function updateFamilyMember(id: string, updates: { name?: string; isActive?: boolean }): FamilyMember | undefined {
  return wrapDbOperation("updateFamilyMember", () => {
    const existing = getFamilyMember(id);
    if (!existing) return undefined;
    
    const name = updates.name ?? existing.name;
    const isActive = updates.isActive ?? existing.isActive;
    
    db.prepare(`
      UPDATE family_members SET name = ?, is_active = ? WHERE id = ?
    `).run(name, isActive ? 1 : 0, id);
    
    return getFamilyMember(id);
  });
}

// Food Preferences CRUD

export function getFoodPreferences(memberId?: string): FoodPreference[] {
  return wrapDbOperation("getFoodPreferences", () => {
    if (memberId) {
      const rows = db.prepare(`
        SELECT * FROM food_preferences WHERE member_id = ? ORDER BY preference, item_name ASC
      `).all(memberId) as FoodPreferenceRow[];
      return rows.map(mapFoodPreference);
    }
    const rows = db.prepare(`
      SELECT * FROM food_preferences ORDER BY member_id, preference, item_name ASC
    `).all() as FoodPreferenceRow[];
    return rows.map(mapFoodPreference);
  });
}

export function getFoodPreferencesByType(itemType: FoodItemType, memberId?: string): FoodPreference[] {
  return wrapDbOperation("getFoodPreferencesByType", () => {
    if (memberId) {
      const rows = db.prepare(`
        SELECT * FROM food_preferences WHERE item_type = ? AND member_id = ? ORDER BY preference, item_name ASC
      `).all(itemType, memberId) as FoodPreferenceRow[];
      return rows.map(mapFoodPreference);
    }
    const rows = db.prepare(`
      SELECT * FROM food_preferences WHERE item_type = ? ORDER BY member_id, preference, item_name ASC
    `).all(itemType) as FoodPreferenceRow[];
    return rows.map(mapFoodPreference);
  });
}

export function getFoodPreference(id: string): FoodPreference | undefined {
  return wrapDbOperation("getFoodPreference", () => {
    const row = db.prepare(`
      SELECT * FROM food_preferences WHERE id = ?
    `).get(id) as FoodPreferenceRow | undefined;
    return row ? mapFoodPreference(row) : undefined;
  });
}

export function upsertFoodPreference(data: InsertFoodPreference): FoodPreference {
  return wrapDbOperation("upsertFoodPreference", () => {
    const existing = db.prepare(`
      SELECT * FROM food_preferences 
      WHERE member_id = ? AND LOWER(item_name) = LOWER(?) AND item_type = ?
    `).get(data.memberId, data.itemName, data.itemType) as FoodPreferenceRow | undefined;
    
    const now = getCurrentTimestamp();
    
    if (existing) {
      const newStrength = Math.min((existing.strength || 1) + 1, 10);
      const newPreference = data.preference ?? existing.preference;
      const newNotes = data.notes !== undefined ? data.notes : existing.notes;
      
      db.prepare(`
        UPDATE food_preferences 
        SET preference = ?, strength = ?, notes = ?, updated_at = ?
        WHERE id = ?
      `).run(newPreference, newStrength, newNotes, now, existing.id);
      
      return getFoodPreference(existing.id)!;
    }
    
    const id = uuidv4();
    const strength = data.strength ?? 1;
    
    db.prepare(`
      INSERT INTO food_preferences (id, member_id, item_type, item_name, preference, strength, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.memberId, data.itemType, data.itemName, data.preference, strength, data.notes || null, now, now);
    
    return {
      id,
      memberId: data.memberId,
      itemType: data.itemType as FoodItemType,
      itemName: data.itemName,
      preference: data.preference as FoodPreferenceLevel,
      strength,
      notes: data.notes || null,
      createdAt: now,
      updatedAt: now,
    };
  });
}

export function deleteFoodPreference(id: string): boolean {
  return wrapDbOperation("deleteFoodPreference", () => {
    const result = db.prepare(`DELETE FROM food_preferences WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

export function getLikedIngredients(memberId?: string): FoodPreference[] {
  return wrapDbOperation("getLikedIngredients", () => {
    if (memberId) {
      const rows = db.prepare(`
        SELECT * FROM food_preferences 
        WHERE item_type = 'ingredient' AND preference IN ('love', 'like') AND member_id = ?
        ORDER BY preference DESC, strength DESC, item_name ASC
      `).all(memberId) as FoodPreferenceRow[];
      return rows.map(mapFoodPreference);
    }
    const rows = db.prepare(`
      SELECT * FROM food_preferences 
      WHERE item_type = 'ingredient' AND preference IN ('love', 'like')
      ORDER BY member_id, preference DESC, strength DESC, item_name ASC
    `).all() as FoodPreferenceRow[];
    return rows.map(mapFoodPreference);
  });
}

export function getDislikedIngredients(memberId?: string): FoodPreference[] {
  return wrapDbOperation("getDislikedIngredients", () => {
    if (memberId) {
      const rows = db.prepare(`
        SELECT * FROM food_preferences 
        WHERE item_type = 'ingredient' AND preference IN ('dislike', 'allergic') AND member_id = ?
        ORDER BY preference ASC, strength DESC, item_name ASC
      `).all(memberId) as FoodPreferenceRow[];
      return rows.map(mapFoodPreference);
    }
    const rows = db.prepare(`
      SELECT * FROM food_preferences 
      WHERE item_type = 'ingredient' AND preference IN ('dislike', 'allergic')
      ORDER BY member_id, preference ASC, strength DESC, item_name ASC
    `).all() as FoodPreferenceRow[];
    return rows.map(mapFoodPreference);
  });
}

// Dietary Restrictions CRUD

export function getDietaryRestrictions(memberId?: string): DietaryRestriction[] {
  return wrapDbOperation("getDietaryRestrictions", () => {
    if (memberId) {
      const rows = db.prepare(`
        SELECT * FROM dietary_restrictions WHERE member_id = ? ORDER BY severity, restriction_name ASC
      `).all(memberId) as DietaryRestrictionRow[];
      return rows.map(mapDietaryRestriction);
    }
    const rows = db.prepare(`
      SELECT * FROM dietary_restrictions ORDER BY member_id, severity, restriction_name ASC
    `).all() as DietaryRestrictionRow[];
    return rows.map(mapDietaryRestriction);
  });
}

export function getDietaryRestriction(id: string): DietaryRestriction | undefined {
  return wrapDbOperation("getDietaryRestriction", () => {
    const row = db.prepare(`
      SELECT * FROM dietary_restrictions WHERE id = ?
    `).get(id) as DietaryRestrictionRow | undefined;
    return row ? mapDietaryRestriction(row) : undefined;
  });
}

export function createDietaryRestriction(data: InsertDietaryRestriction): DietaryRestriction {
  return wrapDbOperation("createDietaryRestriction", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    const severity = data.severity || "strict";
    
    db.prepare(`
      INSERT INTO dietary_restrictions (id, member_id, restriction_type, restriction_name, severity, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.memberId, data.restrictionType, data.restrictionName, severity, data.notes || null, now);
    
    return {
      id,
      memberId: data.memberId,
      restrictionType: data.restrictionType as DietaryRestrictionType,
      restrictionName: data.restrictionName,
      severity: severity as DietaryRestrictionSeverity,
      notes: data.notes || null,
      createdAt: now,
    };
  });
}

export function deleteDietaryRestriction(id: string): boolean {
  return wrapDbOperation("deleteDietaryRestriction", () => {
    const result = db.prepare(`DELETE FROM dietary_restrictions WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

// Meal History CRUD

export function getMealHistory(limit?: number): MealHistory[] {
  return wrapDbOperation("getMealHistory", () => {
    const query = limit
      ? `SELECT * FROM meal_history ORDER BY cooked_at DESC LIMIT ?`
      : `SELECT * FROM meal_history ORDER BY cooked_at DESC`;
    const rows = limit
      ? (db.prepare(query).all(limit) as MealHistoryRow[])
      : (db.prepare(query).all() as MealHistoryRow[]);
    return rows.map(mapMealHistory);
  });
}

export function getMealHistoryEntry(id: string): MealHistory | undefined {
  return wrapDbOperation("getMealHistoryEntry", () => {
    const row = db.prepare(`
      SELECT * FROM meal_history WHERE id = ?
    `).get(id) as MealHistoryRow | undefined;
    return row ? mapMealHistory(row) : undefined;
  });
}

export function createMealHistoryEntry(data: InsertMealHistory): MealHistory {
  return wrapDbOperation("createMealHistoryEntry", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    
    db.prepare(`
      INSERT INTO meal_history (id, name, meal_type, cuisine, rating, notes, recipe_id, cooked_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name, data.mealType, data.cuisine || null, data.rating || null, data.notes || null, data.recipeId || null, data.cookedAt, now);
    
    return {
      id,
      name: data.name,
      mealType: data.mealType as MealType,
      cuisine: data.cuisine || null,
      rating: data.rating || null,
      notes: data.notes || null,
      recipeId: data.recipeId || null,
      cookedAt: data.cookedAt,
      createdAt: now,
    };
  });
}

export function updateMealRating(id: string, rating: number): MealHistory | undefined {
  return wrapDbOperation("updateMealRating", () => {
    const existing = getMealHistoryEntry(id);
    if (!existing) return undefined;
    
    db.prepare(`
      UPDATE meal_history SET rating = ? WHERE id = ?
    `).run(rating, id);
    
    return getMealHistoryEntry(id);
  });
}

export function getMostCookedMeals(limit?: number): { name: string; count: number }[] {
  return wrapDbOperation("getMostCookedMeals", () => {
    const query = limit
      ? `SELECT name, COUNT(*) as count FROM meal_history GROUP BY LOWER(name) ORDER BY count DESC LIMIT ?`
      : `SELECT name, COUNT(*) as count FROM meal_history GROUP BY LOWER(name) ORDER BY count DESC`;
    const rows = limit
      ? (db.prepare(query).all(limit) as { name: string; count: number }[])
      : (db.prepare(query).all() as { name: string; count: number }[]);
    return rows;
  });
}

// Saved Recipes CRUD

export function getSavedRecipes(filters?: { cuisine?: string; mealType?: RecipeMealType; isFavorite?: boolean }): SavedRecipe[] {
  return wrapDbOperation("getSavedRecipes", () => {
    let query = `SELECT * FROM saved_recipes WHERE 1=1`;
    const params: (string | number)[] = [];
    
    if (filters?.cuisine) {
      query += ` AND LOWER(cuisine) = LOWER(?)`;
      params.push(filters.cuisine);
    }
    if (filters?.mealType) {
      query += ` AND meal_type = ?`;
      params.push(filters.mealType);
    }
    if (filters?.isFavorite !== undefined) {
      query += ` AND is_favorite = ?`;
      params.push(filters.isFavorite ? 1 : 0);
    }
    
    query += ` ORDER BY is_favorite DESC, family_rating DESC, name ASC`;
    
    const rows = db.prepare(query).all(...params) as SavedRecipeRow[];
    return rows.map(mapSavedRecipe);
  });
}

export function getRecipeById(id: string): SavedRecipe | undefined {
  return wrapDbOperation("getRecipeById", () => {
    const row = db.prepare(`
      SELECT * FROM saved_recipes WHERE id = ?
    `).get(id) as SavedRecipeRow | undefined;
    return row ? mapSavedRecipe(row) : undefined;
  });
}

export function createRecipe(data: InsertSavedRecipe): SavedRecipe {
  return wrapDbOperation("createRecipe", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    const timesCooked = data.timesCooked ?? 0;
    const isFavorite = data.isFavorite ?? false;
    
    db.prepare(`
      INSERT INTO saved_recipes (id, name, description, cuisine, meal_type, prep_time, cook_time, servings, ingredients, instructions, source, family_rating, times_cooked, is_favorite, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, 
      data.name, 
      data.description || null, 
      data.cuisine || null, 
      data.mealType || null, 
      data.prepTime || null, 
      data.cookTime || null, 
      data.servings || null, 
      data.ingredients, 
      data.instructions, 
      data.source || null, 
      data.familyRating || null, 
      timesCooked, 
      isFavorite ? 1 : 0, 
      now, 
      now
    );
    
    return {
      id,
      name: data.name,
      description: data.description || null,
      cuisine: data.cuisine || null,
      mealType: (data.mealType as RecipeMealType) || null,
      prepTime: data.prepTime || null,
      cookTime: data.cookTime || null,
      servings: data.servings || null,
      ingredients: data.ingredients,
      instructions: data.instructions,
      source: data.source || null,
      familyRating: data.familyRating || null,
      timesCooked,
      isFavorite,
      createdAt: now,
      updatedAt: now,
    };
  });
}

export function updateRecipe(id: string, updates: UpdateSavedRecipe): SavedRecipe | undefined {
  return wrapDbOperation("updateRecipe", () => {
    const existing = getRecipeById(id);
    if (!existing) return undefined;
    
    const now = getCurrentTimestamp();
    const name = updates.name ?? existing.name;
    const description = updates.description !== undefined ? updates.description : existing.description;
    const cuisine = updates.cuisine !== undefined ? updates.cuisine : existing.cuisine;
    const mealType = updates.mealType !== undefined ? updates.mealType : existing.mealType;
    const prepTime = updates.prepTime !== undefined ? updates.prepTime : existing.prepTime;
    const cookTime = updates.cookTime !== undefined ? updates.cookTime : existing.cookTime;
    const servings = updates.servings !== undefined ? updates.servings : existing.servings;
    const ingredients = updates.ingredients ?? existing.ingredients;
    const instructions = updates.instructions ?? existing.instructions;
    const source = updates.source !== undefined ? updates.source : existing.source;
    const familyRating = updates.familyRating !== undefined ? updates.familyRating : existing.familyRating;
    const timesCooked = updates.timesCooked ?? existing.timesCooked;
    const isFavorite = updates.isFavorite ?? existing.isFavorite;
    
    db.prepare(`
      UPDATE saved_recipes 
      SET name = ?, description = ?, cuisine = ?, meal_type = ?, prep_time = ?, cook_time = ?, servings = ?, 
          ingredients = ?, instructions = ?, source = ?, family_rating = ?, times_cooked = ?, is_favorite = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name, description, cuisine, mealType, prepTime, cookTime, servings, 
      ingredients, instructions, source, familyRating, timesCooked, isFavorite ? 1 : 0, now, id
    );
    
    return getRecipeById(id);
  });
}

export function deleteRecipe(id: string): boolean {
  return wrapDbOperation("deleteRecipe", () => {
    const result = db.prepare(`DELETE FROM saved_recipes WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

export function toggleRecipeFavorite(id: string): SavedRecipe | undefined {
  return wrapDbOperation("toggleRecipeFavorite", () => {
    const existing = getRecipeById(id);
    if (!existing) return undefined;
    
    const now = getCurrentTimestamp();
    const newFavorite = !existing.isFavorite;
    
    db.prepare(`
      UPDATE saved_recipes SET is_favorite = ?, updated_at = ? WHERE id = ?
    `).run(newFavorite ? 1 : 0, now, id);
    
    return getRecipeById(id);
  });
}

export function incrementRecipeCooked(id: string): SavedRecipe | undefined {
  return wrapDbOperation("incrementRecipeCooked", () => {
    const existing = getRecipeById(id);
    if (!existing) return undefined;
    
    const now = getCurrentTimestamp();
    const newCount = (existing.timesCooked || 0) + 1;
    
    db.prepare(`
      UPDATE saved_recipes SET times_cooked = ?, updated_at = ? WHERE id = ?
    `).run(newCount, now, id);
    
    return getRecipeById(id);
  });
}

export function getFavoriteRecipes(): SavedRecipe[] {
  return wrapDbOperation("getFavoriteRecipes", () => {
    const rows = db.prepare(`
      SELECT * FROM saved_recipes WHERE is_favorite = 1 ORDER BY family_rating DESC, name ASC
    `).all() as SavedRecipeRow[];
    return rows.map(mapSavedRecipe);
  });
}

export function searchRecipes(query: string): SavedRecipe[] {
  return wrapDbOperation("searchRecipes", () => {
    const searchTerm = `%${query.toLowerCase()}%`;
    const rows = db.prepare(`
      SELECT * FROM saved_recipes 
      WHERE LOWER(name) LIKE ? 
         OR LOWER(description) LIKE ? 
         OR LOWER(cuisine) LIKE ?
         OR LOWER(ingredients) LIKE ?
      ORDER BY is_favorite DESC, family_rating DESC, name ASC
      LIMIT 50
    `).all(searchTerm, searchTerm, searchTerm, searchTerm) as SavedRecipeRow[];
    return rows.map(mapSavedRecipe);
  });
}

// ============================================
// LIMITLESS SUMMARY FUNCTIONS
// ============================================

import type { LimitlessSummary, InsertLimitlessSummary } from "@shared/schema";

function mapLimitlessSummary(row: LimitlessSummaryRow): LimitlessSummary {
  return {
    id: row.id,
    date: row.date,
    timeframeStart: row.timeframe_start,
    timeframeEnd: row.timeframe_end,
    summaryTitle: row.summary_title,
    keyDiscussions: row.key_discussions,
    actionItems: row.action_items,
    insights: row.insights,
    peopleInteracted: row.people_interacted,
    topicsDiscussed: row.topics_discussed,
    lifelogIds: row.lifelog_ids,
    lifelogCount: row.lifelog_count,
    totalDurationMinutes: row.total_duration_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getLimitlessSummaries(limit: number = 30): LimitlessSummary[] {
  return wrapDbOperation("getLimitlessSummaries", () => {
    const rows = db.prepare(`
      SELECT * FROM limitless_summaries ORDER BY date DESC, created_at DESC LIMIT ?
    `).all(limit) as LimitlessSummaryRow[];
    return rows.map(mapLimitlessSummary);
  });
}

export function getLimitlessSummaryByDate(date: string): LimitlessSummary | undefined {
  return wrapDbOperation("getLimitlessSummaryByDate", () => {
    const row = db.prepare(`
      SELECT * FROM limitless_summaries WHERE date = ? ORDER BY created_at DESC LIMIT 1
    `).get(date) as LimitlessSummaryRow | undefined;
    return row ? mapLimitlessSummary(row) : undefined;
  });
}

export function getLimitlessSummaryById(id: string): LimitlessSummary | undefined {
  return wrapDbOperation("getLimitlessSummaryById", () => {
    const row = db.prepare(`
      SELECT * FROM limitless_summaries WHERE id = ?
    `).get(id) as LimitlessSummaryRow | undefined;
    return row ? mapLimitlessSummary(row) : undefined;
  });
}

export function createLimitlessSummary(data: InsertLimitlessSummary): LimitlessSummary {
  return wrapDbOperation("createLimitlessSummary", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    
    db.prepare(`
      INSERT INTO limitless_summaries (
        id, date, timeframe_start, timeframe_end, summary_title,
        key_discussions, action_items, insights, people_interacted,
        topics_discussed, lifelog_ids, lifelog_count, total_duration_minutes,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.date,
      data.timeframeStart,
      data.timeframeEnd,
      data.summaryTitle,
      data.keyDiscussions,
      data.actionItems,
      data.insights || null,
      data.peopleInteracted || null,
      data.topicsDiscussed || null,
      data.lifelogIds,
      data.lifelogCount,
      data.totalDurationMinutes || null,
      now,
      now
    );
    
    return getLimitlessSummaryById(id)!;
  });
}

export function deleteLimitlessSummary(id: string): boolean {
  return wrapDbOperation("deleteLimitlessSummary", () => {
    const result = db.prepare(`DELETE FROM limitless_summaries WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

export function getLimitlessSummariesInRange(startDate: string, endDate: string): LimitlessSummary[] {
  return wrapDbOperation("getLimitlessSummariesInRange", () => {
    const rows = db.prepare(`
      SELECT * FROM limitless_summaries 
      WHERE date >= ? AND date <= ?
      ORDER BY date DESC, created_at DESC
    `).all(startDate, endDate) as LimitlessSummaryRow[];
    return rows.map(mapLimitlessSummary);
  });
}

// ============================================
// CONVERSATION QUALITY METRICS FUNCTIONS
// ============================================

interface ConversationMetricRow {
  id: string;
  conversation_id: string;
  message_id: string | null;
  tool_name: string | null;
  tool_outcome: string | null;
  tool_duration_ms: number | null;
  tool_error_message: string | null;
  required_follow_up: number;
  user_retried: number;
  explicit_feedback: string | null;
  feedback_note: string | null;
  memories_used: string | null;
  memories_confirmed: string | null;
  memories_contradicted: string | null;
  created_at: string;
}

function mapConversationMetric(row: ConversationMetricRow): ConversationMetric {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    toolName: row.tool_name,
    toolOutcome: row.tool_outcome as ToolOutcome | null,
    toolDurationMs: row.tool_duration_ms,
    toolErrorMessage: row.tool_error_message,
    requiredFollowUp: Boolean(row.required_follow_up),
    userRetried: Boolean(row.user_retried),
    explicitFeedback: row.explicit_feedback as "positive" | "negative" | "neutral" | null,
    feedbackNote: row.feedback_note,
    memoriesUsed: row.memories_used,
    memoriesConfirmed: row.memories_confirmed,
    memoriesContradicted: row.memories_contradicted,
    createdAt: row.created_at,
  };
}

export function createConversationMetric(data: InsertConversationMetric): ConversationMetric {
  return wrapDbOperation("createConversationMetric", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    
    db.prepare(`
      INSERT INTO conversation_metrics (
        id, conversation_id, message_id, tool_name, tool_outcome,
        tool_duration_ms, tool_error_message, required_follow_up, user_retried,
        explicit_feedback, feedback_note, memories_used, memories_confirmed,
        memories_contradicted, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.conversationId,
      data.messageId || null,
      data.toolName || null,
      data.toolOutcome || null,
      data.toolDurationMs || null,
      data.toolErrorMessage || null,
      data.requiredFollowUp ? 1 : 0,
      data.userRetried ? 1 : 0,
      data.explicitFeedback || null,
      data.feedbackNote || null,
      data.memoriesUsed || null,
      data.memoriesConfirmed || null,
      data.memoriesContradicted || null,
      now
    );
    
    return getConversationMetricById(id)!;
  });
}

export function getConversationMetricById(id: string): ConversationMetric | undefined {
  return wrapDbOperation("getConversationMetricById", () => {
    const row = db.prepare(`SELECT * FROM conversation_metrics WHERE id = ?`).get(id) as ConversationMetricRow | undefined;
    return row ? mapConversationMetric(row) : undefined;
  });
}

export function getMetricsByConversation(conversationId: string): ConversationMetric[] {
  return wrapDbOperation("getMetricsByConversation", () => {
    const rows = db.prepare(`
      SELECT * FROM conversation_metrics WHERE conversation_id = ? ORDER BY created_at DESC
    `).all(conversationId) as ConversationMetricRow[];
    return rows.map(mapConversationMetric);
  });
}

export function getMetricsByTool(toolName: string, limit: number = 100): ConversationMetric[] {
  return wrapDbOperation("getMetricsByTool", () => {
    const rows = db.prepare(`
      SELECT * FROM conversation_metrics 
      WHERE tool_name = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(toolName, limit) as ConversationMetricRow[];
    return rows.map(mapConversationMetric);
  });
}

export function getRecentMetrics(limit: number = 100): ConversationMetric[] {
  return wrapDbOperation("getRecentMetrics", () => {
    const rows = db.prepare(`
      SELECT * FROM conversation_metrics ORDER BY created_at DESC LIMIT ?
    `).all(limit) as ConversationMetricRow[];
    return rows.map(mapConversationMetric);
  });
}

export function getToolSuccessRate(toolName: string, days: number = 7): { successRate: number; total: number; successful: number; failed: number } {
  return wrapDbOperation("getToolSuccessRate", () => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoff = cutoffDate.toISOString();
    
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN tool_outcome = 'success' THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN tool_outcome = 'failure' THEN 1 ELSE 0 END) as failed
      FROM conversation_metrics
      WHERE tool_name = ? AND created_at >= ?
    `).get(toolName, cutoff) as { total: number; successful: number; failed: number };
    
    return {
      total: stats.total || 0,
      successful: stats.successful || 0,
      failed: stats.failed || 0,
      successRate: stats.total > 0 ? (stats.successful / stats.total) * 100 : 0
    };
  });
}

export function getConversationQualityStats(conversationId: string): ConversationQualityStats {
  return wrapDbOperation("getConversationQualityStats", () => {
    const metrics = getMetricsByConversation(conversationId);
    
    const totalToolCalls = metrics.filter(m => m.toolName).length;
    const successfulToolCalls = metrics.filter(m => m.toolOutcome === "success").length;
    const failedToolCalls = metrics.filter(m => m.toolOutcome === "failure").length;
    const followUpCount = metrics.filter(m => m.requiredFollowUp).length;
    const retryCount = metrics.filter(m => m.userRetried).length;
    const positiveFeedbackCount = metrics.filter(m => m.explicitFeedback === "positive").length;
    const negativeFeedbackCount = metrics.filter(m => m.explicitFeedback === "negative").length;
    
    const toolDurations = metrics.filter(m => m.toolDurationMs).map(m => m.toolDurationMs!);
    const avgToolDuration = toolDurations.length > 0 
      ? toolDurations.reduce((a, b) => a + b, 0) / toolDurations.length 
      : 0;
    
    let memoriesUsedCount = 0;
    let memoriesConfirmedCount = 0;
    let memoriesContradictedCount = 0;
    
    metrics.forEach(m => {
      if (m.memoriesUsed) {
        try { memoriesUsedCount += JSON.parse(m.memoriesUsed).length; } catch {}
      }
      if (m.memoriesConfirmed) {
        try { memoriesConfirmedCount += JSON.parse(m.memoriesConfirmed).length; } catch {}
      }
      if (m.memoriesContradicted) {
        try { memoriesContradictedCount += JSON.parse(m.memoriesContradicted).length; } catch {}
      }
    });
    
    // Calculate quality score (0-100)
    let qualityScore = 50; // Base score
    if (totalToolCalls > 0) {
      qualityScore += ((successfulToolCalls / totalToolCalls) - 0.5) * 30; // Up to +15 or -15
    }
    qualityScore -= retryCount * 5; // -5 per retry
    qualityScore -= followUpCount * 3; // -3 per follow-up needed
    qualityScore += positiveFeedbackCount * 10; // +10 per positive feedback
    qualityScore -= negativeFeedbackCount * 10; // -10 per negative feedback
    qualityScore = Math.max(0, Math.min(100, qualityScore)); // Clamp to 0-100
    
    return {
      conversationId,
      totalMessages: metrics.length,
      totalToolCalls,
      successfulToolCalls,
      failedToolCalls,
      toolSuccessRate: totalToolCalls > 0 ? (successfulToolCalls / totalToolCalls) * 100 : 0,
      followUpCount,
      retryCount,
      positiveFeedbackCount,
      negativeFeedbackCount,
      averageToolDurationMs: avgToolDuration,
      memoriesUsedCount,
      memoriesConfirmedCount,
      memoriesContradictedCount,
      qualityScore,
      computedAt: new Date().toISOString()
    };
  });
}

export function getOverallQualityStats(days: number = 7): {
  totalConversations: number;
  totalToolCalls: number;
  overallSuccessRate: number;
  averageQualityScore: number;
  toolStats: Array<{ toolName: string; successRate: number; count: number }>;
} {
  return wrapDbOperation("getOverallQualityStats", () => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoff = cutoffDate.toISOString();
    
    // Get overall stats
    const overall = db.prepare(`
      SELECT 
        COUNT(DISTINCT conversation_id) as total_conversations,
        COUNT(CASE WHEN tool_name IS NOT NULL THEN 1 END) as total_tool_calls,
        SUM(CASE WHEN tool_outcome = 'success' THEN 1 ELSE 0 END) as successful_calls
      FROM conversation_metrics
      WHERE created_at >= ?
    `).get(cutoff) as { total_conversations: number; total_tool_calls: number; successful_calls: number };
    
    // Get per-tool stats
    const toolStats = db.prepare(`
      SELECT 
        tool_name,
        COUNT(*) as count,
        SUM(CASE WHEN tool_outcome = 'success' THEN 1 ELSE 0 END) as successful
      FROM conversation_metrics
      WHERE tool_name IS NOT NULL AND created_at >= ?
      GROUP BY tool_name
      ORDER BY count DESC
    `).all(cutoff) as Array<{ tool_name: string; count: number; successful: number }>;
    
    return {
      totalConversations: overall.total_conversations || 0,
      totalToolCalls: overall.total_tool_calls || 0,
      overallSuccessRate: overall.total_tool_calls > 0 
        ? (overall.successful_calls / overall.total_tool_calls) * 100 
        : 0,
      averageQualityScore: 75, // TODO: compute from individual conversation scores
      toolStats: toolStats.map(t => ({
        toolName: t.tool_name,
        count: t.count,
        successRate: t.count > 0 ? (t.successful / t.count) * 100 : 0
      }))
    };
  });
}

// ============================================
// MEMORY CONFIDENCE FUNCTIONS
// ============================================

const CONFIDENCE_DECAY_RATE = 0.02; // 2% decay per day
const HIGH_CONFIDENCE_THRESHOLD = 0.7;
const LOW_CONFIDENCE_THRESHOLD = 0.4;
const CONFIRMATION_BOOST = 0.1;
const CONTRADICTION_PENALTY = 0.2;

export function calculateEffectiveConfidence(memory: MemoryNote): number {
  const baseConfidence = parseFloat(memory.confidenceScore || "0.8");
  const now = new Date();
  
  // Apply time decay
  let daysSinceLastConfirm = 0;
  if (memory.lastConfirmedAt) {
    daysSinceLastConfirm = Math.floor(
      (now.getTime() - new Date(memory.lastConfirmedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
  } else if (memory.lastUsedAt) {
    daysSinceLastConfirm = Math.floor(
      (now.getTime() - new Date(memory.lastUsedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
  } else {
    daysSinceLastConfirm = Math.floor(
      (now.getTime() - new Date(memory.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );
  }
  
  // Decay formula: confidence * (1 - decay_rate)^days
  const decayedConfidence = baseConfidence * Math.pow(1 - CONFIDENCE_DECAY_RATE, daysSinceLastConfirm);
  
  // Boost for confirmations
  const confirmationBoost = Math.min((memory.confirmationCount || 0) * 0.02, 0.2);
  
  // Final confidence clamped to 0-1
  return Math.max(0, Math.min(1, decayedConfidence + confirmationBoost));
}

export function getMemoryWithConfidence(memory: MemoryNote): MemoryWithConfidence {
  const effectiveConfidence = calculateEffectiveConfidence(memory);
  
  let confidenceLevel: "high" | "medium" | "low";
  if (effectiveConfidence >= HIGH_CONFIDENCE_THRESHOLD) {
    confidenceLevel = "high";
  } else if (effectiveConfidence >= LOW_CONFIDENCE_THRESHOLD) {
    confidenceLevel = "medium";
  } else {
    confidenceLevel = "low";
  }
  
  return {
    ...memory,
    effectiveConfidence,
    confidenceLevel,
    needsConfirmation: confidenceLevel === "low"
  };
}

export function updateMemoryUsage(memoryId: string): MemoryNote | undefined {
  return wrapDbOperation("updateMemoryUsage", () => {
    const now = getCurrentTimestamp();
    
    db.prepare(`
      UPDATE memory_notes 
      SET usage_count = COALESCE(usage_count, 0) + 1, 
          last_used_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(now, now, memoryId);
    
    return getMemoryNote(memoryId);
  });
}

export function confirmMemory(memoryId: string): MemoryNote | undefined {
  return wrapDbOperation("confirmMemory", () => {
    const now = getCurrentTimestamp();
    const existing = getMemoryNote(memoryId);
    if (!existing) return undefined;
    
    const currentConfidence = parseFloat(existing.confidenceScore || "0.8");
    const newConfidence = Math.min(1, currentConfidence + CONFIRMATION_BOOST);
    
    db.prepare(`
      UPDATE memory_notes 
      SET confirmation_count = COALESCE(confirmation_count, 0) + 1,
          last_confirmed_at = ?,
          confidence_score = ?,
          updated_at = ?
      WHERE id = ?
    `).run(now, newConfidence.toString(), now, memoryId);
    
    return getMemoryNote(memoryId);
  });
}

export function contradictMemory(memoryId: string): MemoryNote | undefined {
  return wrapDbOperation("contradictMemory", () => {
    const now = getCurrentTimestamp();
    const existing = getMemoryNote(memoryId);
    if (!existing) return undefined;

    const currentConfidence = parseFloat(existing.confidenceScore || "0.8");
    const newConfidence = Math.max(0, currentConfidence - CONTRADICTION_PENALTY);

    db.prepare(`
      UPDATE memory_notes
      SET confidence_score = ?,
          updated_at = ?
      WHERE id = ?
    `).run(newConfidence.toString(), now, memoryId);

    return getMemoryNote(memoryId);
  });
}

/**
 * Update confidence-related fields for a memory
 * Allows flexible updates to any combination of confidence fields
 */
export function updateMemoryConfidence(
  memoryId: string,
  updates: {
    confidenceScore?: string;
    confirmationCount?: number;
    lastConfirmedAt?: string;
    usageCount?: number;
    lastUsedAt?: string;
  }
): MemoryNote | undefined {
  return wrapDbOperation("updateMemoryConfidence", () => {
    const now = getCurrentTimestamp();
    const existing = getMemoryNote(memoryId);
    if (!existing) return undefined;

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.confidenceScore !== undefined) {
      fields.push("confidence_score = ?");
      values.push(updates.confidenceScore);
    }
    if (updates.confirmationCount !== undefined) {
      fields.push("confirmation_count = ?");
      values.push(updates.confirmationCount);
    }
    if (updates.lastConfirmedAt !== undefined) {
      fields.push("last_confirmed_at = ?");
      values.push(updates.lastConfirmedAt);
    }
    if (updates.usageCount !== undefined) {
      fields.push("usage_count = ?");
      values.push(updates.usageCount);
    }
    if (updates.lastUsedAt !== undefined) {
      fields.push("last_used_at = ?");
      values.push(updates.lastUsedAt);
    }

    if (fields.length === 0) {
      return existing;
    }

    fields.push("updated_at = ?");
    values.push(now);
    values.push(memoryId);

    db.prepare(`
      UPDATE memory_notes
      SET ${fields.join(", ")}
      WHERE id = ?
    `).run(...values);

    return getMemoryNote(memoryId);
  });
}

export function getLowConfidenceMemories(limit: number = 20): MemoryWithConfidence[] {
  return wrapDbOperation("getLowConfidenceMemories", () => {
    const allNotes = getAllMemoryNotes();
    const withConfidence = allNotes.map(getMemoryWithConfidence);
    return withConfidence
      .filter(m => m.confidenceLevel === "low" && !m.isSuperseded)
      .sort((a, b) => a.effectiveConfidence - b.effectiveConfidence)
      .slice(0, limit);
  });
}

export function getMemoriesNeedingConfirmation(): MemoryWithConfidence[] {
  return wrapDbOperation("getMemoriesNeedingConfirmation", () => {
    const allNotes = getAllMemoryNotes();
    const withConfidence = allNotes.map(getMemoryWithConfidence);
    return withConfidence
      .filter(m => m.needsConfirmation && !m.isSuperseded)
      .sort((a, b) => a.effectiveConfidence - b.effectiveConfidence);
  });
}

export function getHighConfidenceMemories(limit: number = 50): MemoryWithConfidence[] {
  return wrapDbOperation("getHighConfidenceMemories", () => {
    const allNotes = getAllMemoryNotes();
    const withConfidence = allNotes.map(getMemoryWithConfidence);
    return withConfidence
      .filter(m => m.confidenceLevel === "high" && !m.isSuperseded)
      .sort((a, b) => b.effectiveConfidence - a.effectiveConfidence)
      .slice(0, limit);
  });
}

export function getMemoryConfidenceStats(): {
  total: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  needsConfirmation: number;
  averageConfidence: number;
} {
  return wrapDbOperation("getMemoryConfidenceStats", () => {
    const allNotes = getAllMemoryNotes().filter(m => !m.isSuperseded);
    const withConfidence = allNotes.map(getMemoryWithConfidence);
    
    const highConfidence = withConfidence.filter(m => m.confidenceLevel === "high").length;
    const mediumConfidence = withConfidence.filter(m => m.confidenceLevel === "medium").length;
    const lowConfidence = withConfidence.filter(m => m.confidenceLevel === "low").length;
    const needsConfirmation = withConfidence.filter(m => m.needsConfirmation).length;
    
    const avgConfidence = withConfidence.length > 0
      ? withConfidence.reduce((sum, m) => sum + m.effectiveConfidence, 0) / withConfidence.length
      : 0;
    
    return {
      total: allNotes.length,
      highConfidence,
      mediumConfidence,
      lowConfidence,
      needsConfirmation,
      averageConfidence: avgConfidence
    };
  });
}

// ============================================
// CROSS-DOMAIN ENTITY LINKING FUNCTIONS
// ============================================

// CRUD: Create a new entity
export function createEntity(data: InsertEntity): Entity {
  return wrapDbOperation("createEntity", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    
    db.prepare(`
      INSERT INTO entities (id, type, label, canonical_id, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.type,
      data.label,
      data.canonicalId || null,
      data.metadata || null,
      now
    );
    
    return getEntity(id)!;
  });
}

// CRUD: Get entity by ID
export function getEntity(id: string): Entity | undefined {
  return wrapDbOperation("getEntity", () => {
    const row = db.prepare(`SELECT * FROM entities WHERE id = ?`).get(id) as EntityRow | undefined;
    return row ? mapEntity(row) : undefined;
  });
}

// CRUD: Update entity
export function updateEntity(id: string, data: Partial<InsertEntity>): Entity | undefined {
  return wrapDbOperation("updateEntity", () => {
    const existing = getEntity(id);
    if (!existing) return undefined;
    
    const updates: string[] = [];
    const values: (string | null)[] = [];
    
    if (data.type !== undefined) {
      updates.push("type = ?");
      values.push(data.type);
    }
    if (data.label !== undefined) {
      updates.push("label = ?");
      values.push(data.label);
    }
    if (data.canonicalId !== undefined) {
      updates.push("canonical_id = ?");
      values.push(data.canonicalId);
    }
    if (data.metadata !== undefined) {
      updates.push("metadata = ?");
      values.push(data.metadata);
    }
    
    if (updates.length > 0) {
      values.push(id);
      db.prepare(`UPDATE entities SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    }
    
    return getEntity(id);
  });
}

// CRUD: Delete entity
export function deleteEntity(id: string): boolean {
  return wrapDbOperation("deleteEntity", () => {
    const result = db.prepare(`DELETE FROM entities WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

// CRUD: Create entity reference
export function createEntityReference(data: InsertEntityReference): EntityReference {
  return wrapDbOperation("createEntityReference", () => {
    const id = uuidv4();
    
    db.prepare(`
      INSERT INTO entity_references (id, entity_id, domain, item_id, confidence, extracted_at, context)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.entityId,
      data.domain,
      data.itemId,
      data.confidence,
      data.extractedAt,
      data.context || null
    );
    
    return getEntityReference(id)!;
  });
}

// CRUD: Get entity reference by ID
export function getEntityReference(id: string): EntityReference | undefined {
  return wrapDbOperation("getEntityReference", () => {
    const row = db.prepare(`SELECT * FROM entity_references WHERE id = ?`).get(id) as EntityReferenceRow | undefined;
    return row ? mapEntityReference(row) : undefined;
  });
}

// CRUD: Get all references for an entity
export function getEntityReferences(entityId: string): EntityReference[] {
  return wrapDbOperation("getEntityReferences", () => {
    const rows = db.prepare(`SELECT * FROM entity_references WHERE entity_id = ? ORDER BY extracted_at DESC`).all(entityId) as EntityReferenceRow[];
    return rows.map(mapEntityReference);
  });
}

// CRUD: Delete entity reference
export function deleteEntityReference(id: string): boolean {
  return wrapDbOperation("deleteEntityReference", () => {
    const result = db.prepare(`DELETE FROM entity_references WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

// CRUD: Create entity link
export function createEntityLink(data: InsertEntityLink): EntityLink {
  return wrapDbOperation("createEntityLink", () => {
    const id = uuidv4();
    
    db.prepare(`
      INSERT INTO entity_links (id, source_entity_id, target_entity_id, relationship_type, weight, first_seen_at, last_seen_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.sourceEntityId,
      data.targetEntityId,
      data.relationshipType,
      data.weight,
      data.firstSeenAt,
      data.lastSeenAt,
      data.metadata || null
    );
    
    return getEntityLink(id)!;
  });
}

// CRUD: Get entity link by ID
export function getEntityLink(id: string): EntityLink | undefined {
  return wrapDbOperation("getEntityLink", () => {
    const row = db.prepare(`SELECT * FROM entity_links WHERE id = ?`).get(id) as EntityLinkRow | undefined;
    return row ? mapEntityLink(row) : undefined;
  });
}

// CRUD: Get all links for an entity (both as source and target)
export function getEntityLinks(entityId: string): EntityLink[] {
  return wrapDbOperation("getEntityLinks", () => {
    const rows = db.prepare(`
      SELECT * FROM entity_links 
      WHERE source_entity_id = ? OR target_entity_id = ? 
      ORDER BY last_seen_at DESC
    `).all(entityId, entityId) as EntityLinkRow[];
    return rows.map(mapEntityLink);
  });
}

// CRUD: Update entity link (e.g., to update weight or lastSeenAt)
export function updateEntityLink(id: string, data: Partial<{
  weight: string;
  lastSeenAt: string;
  metadata: string | null;
}>): EntityLink | undefined {
  return wrapDbOperation("updateEntityLink", () => {
    const existing = getEntityLink(id);
    if (!existing) return undefined;
    
    const updates: string[] = [];
    const values: (string | null)[] = [];
    
    if (data.weight !== undefined) {
      updates.push("weight = ?");
      values.push(data.weight);
    }
    if (data.lastSeenAt !== undefined) {
      updates.push("last_seen_at = ?");
      values.push(data.lastSeenAt);
    }
    if (data.metadata !== undefined) {
      updates.push("metadata = ?");
      values.push(data.metadata);
    }
    
    if (updates.length > 0) {
      values.push(id);
      db.prepare(`UPDATE entity_links SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    }
    
    return getEntityLink(id);
  });
}

// CRUD: Delete entity link
export function deleteEntityLink(id: string): boolean {
  return wrapDbOperation("deleteEntityLink", () => {
    const result = db.prepare(`DELETE FROM entity_links WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

// Query: Get entities by type
export function getEntitiesByType(type: EntityType): Entity[] {
  return wrapDbOperation("getEntitiesByType", () => {
    const rows = db.prepare(`SELECT * FROM entities WHERE type = ? ORDER BY created_at DESC`).all(type) as EntityRow[];
    return rows.map(mapEntity);
  });
}

// Query: Get entities for a specific domain item
export function getEntitiesForItem(domain: EntityDomain, itemId: string): Entity[] {
  return wrapDbOperation("getEntitiesForItem", () => {
    const rows = db.prepare(`
      SELECT e.* FROM entities e
      INNER JOIN entity_references r ON e.id = r.entity_id
      WHERE r.domain = ? AND r.item_id = ?
      ORDER BY r.confidence DESC
    `).all(domain, itemId) as EntityRow[];
    return rows.map(mapEntity);
  });
}

// Query: Get related entities (entities linked to a given entity)
export function getRelatedEntities(entityId: string): EntityWithLinks {
  return wrapDbOperation("getRelatedEntities", () => {
    const entity = getEntity(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }
    
    const links = getEntityLinks(entityId);
    const linkedEntities: EntityWithLinks["linkedEntities"] = [];
    
    for (const link of links) {
      const isSource = link.sourceEntityId === entityId;
      const relatedId = isSource ? link.targetEntityId : link.sourceEntityId;
      const relatedEntity = getEntity(relatedId);
      
      if (relatedEntity) {
        linkedEntities.push({
          entity: relatedEntity,
          link,
          direction: isSource ? "source" : "target"
        });
      }
    }
    
    return {
      ...entity,
      linkedEntities
    };
  });
}

// Query: Get all items across domains that reference an entity
export function getItemsRelatedToEntity(entityId: string): Array<{
  domain: EntityDomain;
  itemId: string;
  confidence: string;
  context: string | null;
}> {
  return wrapDbOperation("getItemsRelatedToEntity", () => {
    const rows = db.prepare(`
      SELECT domain, item_id, confidence, context
      FROM entity_references
      WHERE entity_id = ?
      ORDER BY confidence DESC
    `).all(entityId) as Array<{
      domain: string;
      item_id: string;
      confidence: string;
      context: string | null;
    }>;
    
    return rows.map(row => ({
      domain: row.domain as EntityDomain,
      itemId: row.item_id,
      confidence: row.confidence,
      context: row.context
    }));
  });
}

// Query: Get entity with all its references
export function getEntityWithReferences(entityId: string): EntityWithReferences | undefined {
  return wrapDbOperation("getEntityWithReferences", () => {
    const entity = getEntity(entityId);
    if (!entity) return undefined;
    
    const references = getEntityReferences(entityId);
    
    return {
      ...entity,
      references
    };
  });
}

// Query: Find entities by label (partial match)
export function findEntitiesByLabel(searchLabel: string): Entity[] {
  return wrapDbOperation("findEntitiesByLabel", () => {
    const rows = db.prepare(`
      SELECT * FROM entities 
      WHERE label LIKE ? 
      ORDER BY created_at DESC
    `).all(`%${searchLabel}%`) as EntityRow[];
    return rows.map(mapEntity);
  });
}

// Query: Get all entities
export function getAllEntities(): Entity[] {
  return wrapDbOperation("getAllEntities", () => {
    const rows = db.prepare(`SELECT * FROM entities ORDER BY created_at DESC`).all() as EntityRow[];
    return rows.map(mapEntity);
  });
}

// Query: Get links by relationship type
export function getEntityLinksByType(relationshipType: EntityRelationshipType): EntityLink[] {
  return wrapDbOperation("getEntityLinksByType", () => {
    const rows = db.prepare(`
      SELECT * FROM entity_links 
      WHERE relationship_type = ? 
      ORDER BY weight DESC
    `).all(relationshipType) as EntityLinkRow[];
    return rows.map(mapEntityLink);
  });
}

// Query: Find or create entity link (useful for updating existing relationships)
export function findOrCreateEntityLink(
  sourceEntityId: string, 
  targetEntityId: string, 
  relationshipType: EntityRelationshipType
): EntityLink {
  return wrapDbOperation("findOrCreateEntityLink", () => {
    const existing = db.prepare(`
      SELECT * FROM entity_links 
      WHERE source_entity_id = ? AND target_entity_id = ? AND relationship_type = ?
    `).get(sourceEntityId, targetEntityId, relationshipType) as EntityLinkRow | undefined;
    
    if (existing) {
      // Update lastSeenAt
      const now = getCurrentTimestamp();
      db.prepare(`UPDATE entity_links SET last_seen_at = ? WHERE id = ?`).run(now, existing.id);
      return getEntityLink(existing.id)!;
    }
    
    const now = getCurrentTimestamp();
    return createEntityLink({
      sourceEntityId,
      targetEntityId,
      relationshipType,
      weight: "0.5",
      firstSeenAt: now,
      lastSeenAt: now,
      metadata: null
    });
  });
}

// ============================================
// PROACTIVE INSIGHTS CRUD OPERATIONS
// ============================================

// CRUD: Create insight
export function createInsight(data: InsertInsight): Insight {
  return wrapDbOperation("createInsight", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    
    db.prepare(`
      INSERT INTO insights (
        id, type, category, title, content, priority, confidence, 
        suggested_action, action_payload, status, source_entity_id, 
        created_at, updated_at, dismissed_at, surfaced_at, expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.type,
      data.category,
      data.title,
      data.content,
      data.priority || "medium",
      data.confidence || "0.8",
      data.suggestedAction || null,
      data.actionPayload || null,
      data.status || "new",
      data.sourceEntityId || null,
      now,
      now,
      data.dismissedAt || null,
      data.surfacedAt || null,
      data.expiresAt || null
    );
    
    return getInsight(id)!;
  });
}

// CRUD: Get insight by ID
export function getInsight(id: string): Insight | undefined {
  return wrapDbOperation("getInsight", () => {
    const row = db.prepare(`SELECT * FROM insights WHERE id = ?`).get(id) as InsightRow | undefined;
    return row ? mapInsight(row) : undefined;
  });
}

// CRUD: Update insight
export function updateInsight(id: string, data: UpdateInsight): Insight | undefined {
  return wrapDbOperation("updateInsight", () => {
    const existing = getInsight(id);
    if (!existing) return undefined;
    
    const now = getCurrentTimestamp();
    const updates: string[] = ["updated_at = ?"];
    const values: (string | null)[] = [now];
    
    if (data.status !== undefined) {
      updates.push("status = ?");
      values.push(data.status);
    }
    if (data.priority !== undefined) {
      updates.push("priority = ?");
      values.push(data.priority);
    }
    if (data.dismissedAt !== undefined) {
      updates.push("dismissed_at = ?");
      values.push(data.dismissedAt);
    }
    if (data.surfacedAt !== undefined) {
      updates.push("surfaced_at = ?");
      values.push(data.surfacedAt);
    }
    
    values.push(id);
    db.prepare(`UPDATE insights SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    
    return getInsight(id);
  });
}

// CRUD: Delete insight
export function deleteInsight(id: string): boolean {
  return wrapDbOperation("deleteInsight", () => {
    const result = db.prepare(`DELETE FROM insights WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

// Query: Get active insights (status in ["new", "surfaced"])
export function getActiveInsights(options?: { 
  category?: InsightCategory; 
  limit?: number;
  priority?: InsightPriority;
}): Insight[] {
  return wrapDbOperation("getActiveInsights", () => {
    let query = `SELECT * FROM insights WHERE status IN ('new', 'surfaced')`;
    const params: (string | number)[] = [];
    
    if (options?.category) {
      query += ` AND category = ?`;
      params.push(options.category);
    }
    if (options?.priority) {
      query += ` AND priority = ?`;
      params.push(options.priority);
    }
    
    query += ` ORDER BY 
      CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
      created_at DESC`;
    
    if (options?.limit) {
      query += ` LIMIT ?`;
      params.push(options.limit);
    }
    
    const rows = db.prepare(query).all(...params) as InsightRow[];
    return rows.map(mapInsight);
  });
}

// Query: Get insights by category
export function getInsightsByCategory(category: InsightCategory): Insight[] {
  return wrapDbOperation("getInsightsByCategory", () => {
    const rows = db.prepare(`
      SELECT * FROM insights 
      WHERE category = ? 
      ORDER BY created_at DESC
    `).all(category) as InsightRow[];
    return rows.map(mapInsight);
  });
}

// Query: Get insights by status
export function getInsightsByStatus(status: InsightStatus): Insight[] {
  return wrapDbOperation("getInsightsByStatus", () => {
    const rows = db.prepare(`
      SELECT * FROM insights 
      WHERE status = ? 
      ORDER BY created_at DESC
    `).all(status) as InsightRow[];
    return rows.map(mapInsight);
  });
}

// Query: Get insights by type
export function getInsightsByType(type: InsightType): Insight[] {
  return wrapDbOperation("getInsightsByType", () => {
    const rows = db.prepare(`
      SELECT * FROM insights 
      WHERE type = ? 
      ORDER BY created_at DESC
    `).all(type) as InsightRow[];
    return rows.map(mapInsight);
  });
}

// Query: Get all insights with optional filtering
export function getAllInsights(options?: {
  status?: InsightStatus;
  category?: InsightCategory;
  type?: InsightType;
  limit?: number;
}): Insight[] {
  return wrapDbOperation("getAllInsights", () => {
    let query = `SELECT * FROM insights WHERE 1=1`;
    const params: (string | number)[] = [];
    
    if (options?.status) {
      query += ` AND status = ?`;
      params.push(options.status);
    }
    if (options?.category) {
      query += ` AND category = ?`;
      params.push(options.category);
    }
    if (options?.type) {
      query += ` AND type = ?`;
      params.push(options.type);
    }
    
    query += ` ORDER BY created_at DESC`;
    
    if (options?.limit) {
      query += ` LIMIT ?`;
      params.push(options.limit);
    }
    
    const rows = db.prepare(query).all(...params) as InsightRow[];
    return rows.map(mapInsight);
  });
}

// Action: Dismiss an insight
export function dismissInsight(id: string): Insight | undefined {
  return wrapDbOperation("dismissInsight", () => {
    const now = getCurrentTimestamp();
    return updateInsight(id, { 
      status: "dismissed", 
      dismissedAt: now 
    });
  });
}

// Action: Snooze an insight
export function snoozeInsight(id: string): Insight | undefined {
  return wrapDbOperation("snoozeInsight", () => {
    return updateInsight(id, { 
      status: "snoozed"
    });
  });
}

// Action: Complete an insight (action was taken)
export function completeInsight(id: string): Insight | undefined {
  return wrapDbOperation("completeInsight", () => {
    return updateInsight(id, { 
      status: "completed"
    });
  });
}

// Action: Surface an insight (mark as shown to user)
export function surfaceInsight(id: string): Insight | undefined {
  return wrapDbOperation("surfaceInsight", () => {
    const now = getCurrentTimestamp();
    return updateInsight(id, { 
      status: "surfaced", 
      surfacedAt: now 
    });
  });
}

// Query: Get insight statistics
export function getInsightStats(): InsightStats {
  return wrapDbOperation("getInsightStats", () => {
    const total = db.prepare(`SELECT COUNT(*) as count FROM insights`).get() as { count: number };
    
    const byCategory = db.prepare(`
      SELECT category, COUNT(*) as count FROM insights GROUP BY category
    `).all() as Array<{ category: string; count: number }>;
    
    const byStatus = db.prepare(`
      SELECT status, COUNT(*) as count FROM insights GROUP BY status
    `).all() as Array<{ status: string; count: number }>;
    
    const byPriority = db.prepare(`
      SELECT priority, COUNT(*) as count FROM insights GROUP BY priority
    `).all() as Array<{ priority: string; count: number }>;
    
    const categoryMap: Record<InsightCategory, number> = {
      task_health: 0,
      memory_hygiene: 0,
      calendar_load: 0,
      cross_domain: 0
    };
    byCategory.forEach(row => {
      categoryMap[row.category as InsightCategory] = row.count;
    });
    
    const statusMap: Record<InsightStatus, number> = {
      new: 0,
      surfaced: 0,
      snoozed: 0,
      completed: 0,
      dismissed: 0
    };
    byStatus.forEach(row => {
      statusMap[row.status as InsightStatus] = row.count;
    });
    
    const priorityMap: Record<InsightPriority, number> = {
      high: 0,
      medium: 0,
      low: 0
    };
    byPriority.forEach(row => {
      priorityMap[row.priority as InsightPriority] = row.count;
    });
    
    return {
      total: total.count,
      byCategory: categoryMap,
      byStatus: statusMap,
      byPriority: priorityMap
    };
  });
}

// Query: Check if insight exists for a specific type and source entity
export function insightExistsForSource(type: InsightType, sourceEntityId: string): boolean {
  return wrapDbOperation("insightExistsForSource", () => {
    const row = db.prepare(`
      SELECT id FROM insights 
      WHERE type = ? AND source_entity_id = ? AND status IN ('new', 'surfaced')
      LIMIT 1
    `).get(type, sourceEntityId) as { id: string } | undefined;
    return !!row;
  });
}

// Query: Find existing insight by type and source
export function findInsightByTypeAndSource(type: InsightType, sourceEntityId: string): Insight | undefined {
  return wrapDbOperation("findInsightByTypeAndSource", () => {
    const row = db.prepare(`
      SELECT * FROM insights 
      WHERE type = ? AND source_entity_id = ? AND status IN ('new', 'surfaced')
      LIMIT 1
    `).get(type, sourceEntityId) as InsightRow | undefined;
    return row ? mapInsight(row) : undefined;
  });
}

// Query: Cleanup expired insights
export function cleanupExpiredInsights(): number {
  return wrapDbOperation("cleanupExpiredInsights", () => {
    const now = getCurrentTimestamp();
    const result = db.prepare(`
      DELETE FROM insights 
      WHERE expires_at IS NOT NULL AND expires_at < ? AND status NOT IN ('completed', 'dismissed')
    `).run(now);
    return result.changes;
  });
}

// ============================================
// SMART NOTIFICATION BATCHING CRUD OPERATIONS
// ============================================

// CRUD: Create notification queue item
export function createNotificationQueueItem(data: InsertNotificationQueue): NotificationQueueItem {
  return wrapDbOperation("createNotificationQueueItem", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    
    db.prepare(`
      INSERT INTO notification_queue (
        id, recipient_phone, category, priority, title, content, 
        source_type, source_id, scheduled_for, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.recipientPhone,
      data.category,
      data.priority || "normal",
      data.title,
      data.content,
      data.sourceType || null,
      data.sourceId || null,
      data.scheduledFor || null,
      now
    );
    
    return getNotificationQueueItem(id)!;
  });
}

// CRUD: Get notification queue item by ID
export function getNotificationQueueItem(id: string): NotificationQueueItem | undefined {
  return wrapDbOperation("getNotificationQueueItem", () => {
    const row = db.prepare(`SELECT * FROM notification_queue WHERE id = ?`).get(id) as NotificationQueueRow | undefined;
    return row ? mapNotificationQueueItem(row) : undefined;
  });
}

// CRUD: Get pending notifications for a recipient
export function getPendingNotifications(recipientPhone: string): NotificationQueueItem[] {
  return wrapDbOperation("getPendingNotifications", () => {
    const rows = db.prepare(`
      SELECT * FROM notification_queue 
      WHERE recipient_phone = ? AND sent_at IS NULL
      ORDER BY 
        CASE priority
          WHEN 'urgent' THEN 0
          WHEN 'high' THEN 1
          WHEN 'normal' THEN 2
          WHEN 'low' THEN 3
        END,
        created_at ASC
    `).all(recipientPhone) as NotificationQueueRow[];
    return rows.map(mapNotificationQueueItem);
  });
}

// CRUD: Get all pending notifications
export function getAllPendingNotifications(): NotificationQueueItem[] {
  return wrapDbOperation("getAllPendingNotifications", () => {
    const rows = db.prepare(`
      SELECT * FROM notification_queue 
      WHERE sent_at IS NULL
      ORDER BY recipient_phone, 
        CASE priority
          WHEN 'urgent' THEN 0
          WHEN 'high' THEN 1
          WHEN 'normal' THEN 2
          WHEN 'low' THEN 3
        END,
        created_at ASC
    `).all() as NotificationQueueRow[];
    return rows.map(mapNotificationQueueItem);
  });
}

// CRUD: Mark notification as sent
export function markNotificationSent(id: string, batchId: string): NotificationQueueItem | undefined {
  return wrapDbOperation("markNotificationSent", () => {
    const now = getCurrentTimestamp();
    db.prepare(`
      UPDATE notification_queue SET sent_at = ?, batch_id = ? WHERE id = ?
    `).run(now, batchId, id);
    return getNotificationQueueItem(id);
  });
}

// CRUD: Delete notification queue item
export function deleteNotificationQueueItem(id: string): boolean {
  return wrapDbOperation("deleteNotificationQueueItem", () => {
    const result = db.prepare(`DELETE FROM notification_queue WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

// CRUD: Clear old sent notifications (older than specified days)
export function clearOldNotifications(daysOld: number): number {
  return wrapDbOperation("clearOldNotifications", () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    const result = db.prepare(`
      DELETE FROM notification_queue WHERE sent_at IS NOT NULL AND sent_at < ?
    `).run(cutoff.toISOString());
    return result.changes;
  });
}

// CRUD: Get or create notification preferences
export function getNotificationPreferences(): NotificationPreferences {
  return wrapDbOperation("getNotificationPreferences", () => {
    const row = db.prepare(`SELECT * FROM notification_preferences LIMIT 1`).get() as NotificationPreferencesRow | undefined;
    if (row) {
      return mapNotificationPreferences(row);
    }
    
    // Create default preferences if none exist
    const id = uuidv4();
    const now = getCurrentTimestamp();
    db.prepare(`
      INSERT INTO notification_preferences (id, updated_at)
      VALUES (?, ?)
    `).run(id, now);
    
    return getNotificationPreferences();
  });
}

// CRUD: Update notification preferences
export function updateNotificationPreferences(data: Partial<InsertNotificationPreferences>): NotificationPreferences {
  return wrapDbOperation("updateNotificationPreferences", () => {
    const existing = getNotificationPreferences();
    const now = getCurrentTimestamp();
    
    const updates: string[] = ["updated_at = ?"];
    const values: (string | number | null)[] = [now];
    
    if (data.enabled !== undefined) {
      updates.push("enabled = ?");
      values.push(data.enabled ? 1 : 0);
    }
    if (data.batchingEnabled !== undefined) {
      updates.push("batching_enabled = ?");
      values.push(data.batchingEnabled ? 1 : 0);
    }
    if (data.batchIntervalMinutes !== undefined) {
      updates.push("batch_interval_minutes = ?");
      values.push(data.batchIntervalMinutes);
    }
    if (data.quietHoursEnabled !== undefined) {
      updates.push("quiet_hours_enabled = ?");
      values.push(data.quietHoursEnabled ? 1 : 0);
    }
    if (data.quietHoursStart !== undefined) {
      updates.push("quiet_hours_start = ?");
      values.push(data.quietHoursStart);
    }
    if (data.quietHoursEnd !== undefined) {
      updates.push("quiet_hours_end = ?");
      values.push(data.quietHoursEnd);
    }
    if (data.urgentBypassQuietHours !== undefined) {
      updates.push("urgent_bypass_quiet_hours = ?");
      values.push(data.urgentBypassQuietHours ? 1 : 0);
    }
    if (data.maxBatchSize !== undefined) {
      updates.push("max_batch_size = ?");
      values.push(data.maxBatchSize);
    }
    if (data.categoryPreferences !== undefined) {
      updates.push("category_preferences = ?");
      values.push(data.categoryPreferences);
    }
    
    values.push(existing.id);
    db.prepare(`UPDATE notification_preferences SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    
    return getNotificationPreferences();
  });
}

// CRUD: Create notification batch record
export function createNotificationBatch(recipientPhone: string, notificationIds: string[], categories: string[]): NotificationBatch {
  return wrapDbOperation("createNotificationBatch", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    
    db.prepare(`
      INSERT INTO notification_batches (id, recipient_phone, notification_count, categories, sent_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, recipientPhone, notificationIds.length, JSON.stringify(categories), now);
    
    // Mark all notifications as sent with this batch ID
    for (const notificationId of notificationIds) {
      markNotificationSent(notificationId, id);
    }
    
    return getNotificationBatch(id)!;
  });
}

// CRUD: Get notification batch by ID
export function getNotificationBatch(id: string): NotificationBatch | undefined {
  return wrapDbOperation("getNotificationBatch", () => {
    const row = db.prepare(`SELECT * FROM notification_batches WHERE id = ?`).get(id) as NotificationBatchRow | undefined;
    return row ? mapNotificationBatch(row) : undefined;
  });
}

// CRUD: Get recent batches for recipient
export function getRecentBatches(recipientPhone: string, limit: number = 10): NotificationBatch[] {
  return wrapDbOperation("getRecentBatches", () => {
    const rows = db.prepare(`
      SELECT * FROM notification_batches 
      WHERE recipient_phone = ? 
      ORDER BY sent_at DESC 
      LIMIT ?
    `).all(recipientPhone, limit) as NotificationBatchRow[];
    return rows.map(mapNotificationBatch);
  });
}

// Query: Get notification queue statistics
export function getNotificationQueueStats(): {
  pending: number;
  sentToday: number;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
} {
  return wrapDbOperation("getNotificationQueueStats", () => {
    const pending = db.prepare(`
      SELECT COUNT(*) as count FROM notification_queue WHERE sent_at IS NULL
    `).get() as { count: number };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sentToday = db.prepare(`
      SELECT COUNT(*) as count FROM notification_queue WHERE sent_at >= ?
    `).get(today.toISOString()) as { count: number };
    
    const byCategory = db.prepare(`
      SELECT category, COUNT(*) as count FROM notification_queue WHERE sent_at IS NULL GROUP BY category
    `).all() as Array<{ category: string; count: number }>;
    
    const byPriority = db.prepare(`
      SELECT priority, COUNT(*) as count FROM notification_queue WHERE sent_at IS NULL GROUP BY priority
    `).all() as Array<{ priority: string; count: number }>;
    
    const categoryMap: Record<string, number> = {};
    byCategory.forEach(row => { categoryMap[row.category] = row.count; });
    
    const priorityMap: Record<string, number> = {};
    byPriority.forEach(row => { priorityMap[row.priority] = row.count; });
    
    return {
      pending: pending.count,
      sentToday: sentToday.count,
      byCategory: categoryMap,
      byPriority: priorityMap
    };
  });
}

// ============================================
// NATURAL LANGUAGE AUTOMATION CRUD OPERATIONS
// ============================================

import type {
  NLAutomation,
  InsertNLAutomation,
  UpdateNLAutomation,
  NLAutomationLog
} from "@shared/schema";

// Row types for NL automations
interface NLAutomationRow {
  id: string;
  name: string;
  original_phrase: string;
  trigger_type: string;
  trigger_config: string;
  action_type: string;
  action_config: string;
  conditions: string | null;
  enabled: number;
  last_triggered_at: string | null;
  trigger_count: number;
  created_at: string;
  updated_at: string;
}

interface NLAutomationLogRow {
  id: string;
  automation_id: string;
  trigger_data: string | null;
  action_result: string | null;
  success: number;
  error_message: string | null;
  executed_at: string;
}

// Map database row to NLAutomation type
function mapNLAutomation(row: NLAutomationRow): NLAutomation {
  return {
    id: row.id,
    name: row.name,
    originalPhrase: row.original_phrase,
    triggerType: row.trigger_type as NLAutomation["triggerType"],
    triggerConfig: row.trigger_config,
    actionType: row.action_type as NLAutomation["actionType"],
    actionConfig: row.action_config,
    conditions: row.conditions,
    enabled: Boolean(row.enabled),
    lastTriggeredAt: row.last_triggered_at,
    triggerCount: row.trigger_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Map database row to NLAutomationLog type
function mapNLAutomationLog(row: NLAutomationLogRow): NLAutomationLog {
  return {
    id: row.id,
    automationId: row.automation_id,
    triggerData: row.trigger_data,
    actionResult: row.action_result,
    success: Boolean(row.success),
    errorMessage: row.error_message,
    executedAt: row.executed_at
  };
}

// CRUD: Create a new NL automation
export function createNLAutomation(data: InsertNLAutomation): NLAutomation {
  return wrapDbOperation("createNLAutomation", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    
    db.prepare(`
      INSERT INTO nl_automations (id, name, original_phrase, trigger_type, trigger_config, action_type, action_config, conditions, enabled, trigger_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      id,
      data.name,
      data.originalPhrase,
      data.triggerType,
      data.triggerConfig,
      data.actionType,
      data.actionConfig,
      data.conditions || null,
      data.enabled ? 1 : 0,
      now,
      now
    );
    
    return getNLAutomation(id)!;
  });
}

// CRUD: Get NL automation by ID
export function getNLAutomation(id: string): NLAutomation | undefined {
  return wrapDbOperation("getNLAutomation", () => {
    const row = db.prepare(`SELECT * FROM nl_automations WHERE id = ?`).get(id) as NLAutomationRow | undefined;
    return row ? mapNLAutomation(row) : undefined;
  });
}

// CRUD: Get all NL automations
export function getAllNLAutomations(): NLAutomation[] {
  return wrapDbOperation("getAllNLAutomations", () => {
    const rows = db.prepare(`SELECT * FROM nl_automations ORDER BY created_at DESC`).all() as NLAutomationRow[];
    return rows.map(mapNLAutomation);
  });
}

// CRUD: Get enabled NL automations
export function getEnabledNLAutomations(): NLAutomation[] {
  return wrapDbOperation("getEnabledNLAutomations", () => {
    const rows = db.prepare(`SELECT * FROM nl_automations WHERE enabled = 1 ORDER BY created_at DESC`).all() as NLAutomationRow[];
    return rows.map(mapNLAutomation);
  });
}

// CRUD: Get NL automations by trigger type
export function getNLAutomationsByTriggerType(triggerType: string): NLAutomation[] {
  return wrapDbOperation("getNLAutomationsByTriggerType", () => {
    const rows = db.prepare(`SELECT * FROM nl_automations WHERE trigger_type = ? AND enabled = 1 ORDER BY created_at DESC`).all(triggerType) as NLAutomationRow[];
    return rows.map(mapNLAutomation);
  });
}

// CRUD: Update NL automation
export function updateNLAutomation(id: string, data: UpdateNLAutomation): NLAutomation | undefined {
  return wrapDbOperation("updateNLAutomation", () => {
    const existing = getNLAutomation(id);
    if (!existing) return undefined;
    
    const now = getCurrentTimestamp();
    const updates: string[] = ["updated_at = ?"];
    const values: any[] = [now];
    
    if (data.name !== undefined) {
      updates.push("name = ?");
      values.push(data.name);
    }
    if (data.enabled !== undefined) {
      updates.push("enabled = ?");
      values.push(data.enabled ? 1 : 0);
    }
    if (data.triggerConfig !== undefined) {
      updates.push("trigger_config = ?");
      values.push(data.triggerConfig);
    }
    if (data.actionConfig !== undefined) {
      updates.push("action_config = ?");
      values.push(data.actionConfig);
    }
    if (data.conditions !== undefined) {
      updates.push("conditions = ?");
      values.push(data.conditions);
    }
    
    values.push(id);
    
    db.prepare(`UPDATE nl_automations SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    
    return getNLAutomation(id);
  });
}

// CRUD: Delete NL automation
export function deleteNLAutomation(id: string): boolean {
  return wrapDbOperation("deleteNLAutomation", () => {
    const result = db.prepare(`DELETE FROM nl_automations WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

// CRUD: Record automation trigger
export function recordNLAutomationTrigger(automationId: string): void {
  wrapDbOperation("recordNLAutomationTrigger", () => {
    const now = getCurrentTimestamp();
    db.prepare(`
      UPDATE nl_automations 
      SET last_triggered_at = ?, trigger_count = trigger_count + 1, updated_at = ?
      WHERE id = ?
    `).run(now, now, automationId);
  });
}

// CRUD: Create automation log entry
export function createNLAutomationLog(data: {
  automationId: string;
  triggerData?: string;
  actionResult?: string;
  success: boolean;
  errorMessage?: string;
}): NLAutomationLog {
  return wrapDbOperation("createNLAutomationLog", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    
    db.prepare(`
      INSERT INTO nl_automation_logs (id, automation_id, trigger_data, action_result, success, error_message, executed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.automationId,
      data.triggerData || null,
      data.actionResult || null,
      data.success ? 1 : 0,
      data.errorMessage || null,
      now
    );
    
    return getNLAutomationLog(id)!;
  });
}

// CRUD: Get automation log by ID
export function getNLAutomationLog(id: string): NLAutomationLog | undefined {
  return wrapDbOperation("getNLAutomationLog", () => {
    const row = db.prepare(`SELECT * FROM nl_automation_logs WHERE id = ?`).get(id) as NLAutomationLogRow | undefined;
    return row ? mapNLAutomationLog(row) : undefined;
  });
}

// CRUD: Get logs for an automation
export function getNLAutomationLogs(automationId: string, limit: number = 20): NLAutomationLog[] {
  return wrapDbOperation("getNLAutomationLogs", () => {
    const rows = db.prepare(`
      SELECT * FROM nl_automation_logs 
      WHERE automation_id = ? 
      ORDER BY executed_at DESC 
      LIMIT ?
    `).all(automationId, limit) as NLAutomationLogRow[];
    return rows.map(mapNLAutomationLog);
  });
}

// CRUD: Get recent automation logs (across all automations)
export function getRecentNLAutomationLogs(limit: number = 50): NLAutomationLog[] {
  return wrapDbOperation("getRecentNLAutomationLogs", () => {
    const rows = db.prepare(`
      SELECT * FROM nl_automation_logs 
      ORDER BY executed_at DESC 
      LIMIT ?
    `).all(limit) as NLAutomationLogRow[];
    return rows.map(mapNLAutomationLog);
  });
}

// Query: Get NL automation statistics
export function getNLAutomationStats(): {
  total: number;
  enabled: number;
  disabled: number;
  byTriggerType: Record<string, number>;
  byActionType: Record<string, number>;
  recentExecutions: number;
  successRate: number;
} {
  return wrapDbOperation("getNLAutomationStats", () => {
    const total = db.prepare(`SELECT COUNT(*) as count FROM nl_automations`).get() as { count: number };
    const enabled = db.prepare(`SELECT COUNT(*) as count FROM nl_automations WHERE enabled = 1`).get() as { count: number };
    
    const byTrigger = db.prepare(`
      SELECT trigger_type, COUNT(*) as count FROM nl_automations GROUP BY trigger_type
    `).all() as Array<{ trigger_type: string; count: number }>;
    
    const byAction = db.prepare(`
      SELECT action_type, COUNT(*) as count FROM nl_automations GROUP BY action_type
    `).all() as Array<{ action_type: string; count: number }>;
    
    // Get executions from last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentExecutions = db.prepare(`
      SELECT COUNT(*) as count FROM nl_automation_logs WHERE executed_at >= ?
    `).get(yesterday) as { count: number };
    
    const recentSuccess = db.prepare(`
      SELECT COUNT(*) as count FROM nl_automation_logs WHERE executed_at >= ? AND success = 1
    `).get(yesterday) as { count: number };
    
    const triggerMap: Record<string, number> = {};
    byTrigger.forEach(row => { triggerMap[row.trigger_type] = row.count; });
    
    const actionMap: Record<string, number> = {};
    byAction.forEach(row => { actionMap[row.action_type] = row.count; });
    
    return {
      total: total.count,
      enabled: enabled.count,
      disabled: total.count - enabled.count,
      byTriggerType: triggerMap,
      byActionType: actionMap,
      recentExecutions: recentExecutions.count,
      successRate: recentExecutions.count > 0 ? recentSuccess.count / recentExecutions.count : 1.0
    };
  });
}

// ============================================
// LIMITLESS ENHANCED FEATURES - MEETINGS
// ============================================

interface MeetingRow {
  id: string;
  lifelog_id: string;
  title: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  participants: string;
  topics: string | null;
  summary: string | null;
  action_items: string | null;
  is_important: number;
  created_at: string;
  updated_at: string;
}

function mapMeeting(row: MeetingRow): Meeting {
  return {
    id: row.id,
    lifelogId: row.lifelog_id,
    title: row.title,
    startTime: row.start_time,
    endTime: row.end_time,
    durationMinutes: row.duration_minutes,
    participants: row.participants,
    topics: row.topics,
    summary: row.summary,
    actionItems: row.action_items,
    isImportant: Boolean(row.is_important),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createMeeting(data: InsertMeeting): Meeting {
  return wrapDbOperation("createMeeting", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    
    db.prepare(`
      INSERT INTO meetings (id, lifelog_id, title, start_time, end_time, duration_minutes, participants, topics, summary, action_items, is_important, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.lifelogId,
      data.title,
      data.startTime,
      data.endTime,
      data.durationMinutes,
      data.participants,
      data.topics || null,
      data.summary || null,
      data.actionItems || null,
      data.isImportant ? 1 : 0,
      now,
      now
    );
    
    return getMeeting(id)!;
  });
}

export function getMeeting(id: string): Meeting | undefined {
  return wrapDbOperation("getMeeting", () => {
    const row = db.prepare(`SELECT * FROM meetings WHERE id = ?`).get(id) as MeetingRow | undefined;
    return row ? mapMeeting(row) : undefined;
  });
}

export function getMeetingByLifelogId(lifelogId: string): Meeting | undefined {
  return wrapDbOperation("getMeetingByLifelogId", () => {
    const row = db.prepare(`SELECT * FROM meetings WHERE lifelog_id = ?`).get(lifelogId) as MeetingRow | undefined;
    return row ? mapMeeting(row) : undefined;
  });
}

export function getAllMeetings(limit: number = 50): Meeting[] {
  return wrapDbOperation("getAllMeetings", () => {
    const rows = db.prepare(`
      SELECT * FROM meetings 
      ORDER BY start_time DESC 
      LIMIT ?
    `).all(limit) as MeetingRow[];
    return rows.map(mapMeeting);
  });
}

export function getMeetingsInRange(startDate: string, endDate: string): Meeting[] {
  return wrapDbOperation("getMeetingsInRange", () => {
    const rows = db.prepare(`
      SELECT * FROM meetings 
      WHERE start_time >= ? AND start_time <= ?
      ORDER BY start_time DESC
    `).all(startDate, endDate) as MeetingRow[];
    return rows.map(mapMeeting);
  });
}

export function getMeetingsByDate(date: string): Meeting[] {
  return wrapDbOperation("getMeetingsByDate", () => {
    const rows = db.prepare(`
      SELECT * FROM meetings 
      WHERE date(start_time) = date(?)
      ORDER BY start_time DESC
    `).all(date) as MeetingRow[];
    return rows.map(mapMeeting);
  });
}

export function getImportantMeetings(limit: number = 20): Meeting[] {
  return wrapDbOperation("getImportantMeetings", () => {
    const rows = db.prepare(`
      SELECT * FROM meetings 
      WHERE is_important = 1
      ORDER BY start_time DESC 
      LIMIT ?
    `).all(limit) as MeetingRow[];
    return rows.map(mapMeeting);
  });
}

export function updateMeeting(id: string, updates: Partial<InsertMeeting>): Meeting | undefined {
  return wrapDbOperation("updateMeeting", () => {
    const meeting = getMeeting(id);
    if (!meeting) return undefined;
    
    const now = getCurrentTimestamp();
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.title !== undefined) { fields.push("title = ?"); values.push(updates.title); }
    if (updates.summary !== undefined) { fields.push("summary = ?"); values.push(updates.summary); }
    if (updates.topics !== undefined) { fields.push("topics = ?"); values.push(updates.topics); }
    if (updates.actionItems !== undefined) { fields.push("action_items = ?"); values.push(updates.actionItems); }
    if (updates.isImportant !== undefined) { fields.push("is_important = ?"); values.push(updates.isImportant ? 1 : 0); }
    
    if (fields.length === 0) return meeting;
    
    fields.push("updated_at = ?");
    values.push(now, id);
    
    db.prepare(`UPDATE meetings SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return getMeeting(id);
  });
}

export function deleteMeeting(id: string): boolean {
  return wrapDbOperation("deleteMeeting", () => {
    const result = db.prepare(`DELETE FROM meetings WHERE id = ?`).run(id);
    return result.changes > 0;
  });
}

// ============================================
// LIMITLESS ENHANCED FEATURES - ACTION ITEMS
// ============================================

interface LifelogActionItemRow {
  id: string;
  lifelog_id: string;
  content: string;
  assignee: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  source_quote: string | null;
  source_offset_ms: number | null;
  linked_task_id: string | null;
  linked_contact_id: string | null;
  processed_at: string;
  created_at: string;
}

function mapLifelogActionItem(row: LifelogActionItemRow): LifelogActionItem {
  return {
    id: row.id,
    lifelogId: row.lifelog_id,
    content: row.content,
    assignee: row.assignee,
    dueDate: row.due_date,
    priority: row.priority as "high" | "medium" | "low",
    status: row.status as "pending" | "created_task" | "dismissed",
    sourceQuote: row.source_quote,
    sourceOffsetMs: row.source_offset_ms,
    linkedTaskId: row.linked_task_id,
    linkedContactId: row.linked_contact_id,
    processedAt: row.processed_at,
    createdAt: row.created_at,
  };
}

export function createLifelogActionItem(data: InsertLifelogActionItem): LifelogActionItem {
  return wrapDbOperation("createLifelogActionItem", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    
    db.prepare(`
      INSERT INTO lifelog_action_items (id, lifelog_id, content, assignee, due_date, priority, status, source_quote, source_offset_ms, linked_task_id, linked_contact_id, processed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.lifelogId,
      data.content,
      data.assignee || null,
      data.dueDate || null,
      data.priority || "medium",
      data.status || "pending",
      data.sourceQuote || null,
      data.sourceOffsetMs || null,
      data.linkedTaskId || null,
      data.linkedContactId || null,
      data.processedAt,
      now
    );
    
    return getLifelogActionItem(id)!;
  });
}

export function getLifelogActionItem(id: string): LifelogActionItem | undefined {
  return wrapDbOperation("getLifelogActionItem", () => {
    const row = db.prepare(`SELECT * FROM lifelog_action_items WHERE id = ?`).get(id) as LifelogActionItemRow | undefined;
    return row ? mapLifelogActionItem(row) : undefined;
  });
}

export function getLifelogActionItemsByLifelog(lifelogId: string): LifelogActionItem[] {
  return wrapDbOperation("getLifelogActionItemsByLifelog", () => {
    const rows = db.prepare(`
      SELECT * FROM lifelog_action_items 
      WHERE lifelog_id = ? 
      ORDER BY created_at DESC
    `).all(lifelogId) as LifelogActionItemRow[];
    return rows.map(mapLifelogActionItem);
  });
}

export function getPendingLifelogActionItems(limit: number = 50): LifelogActionItem[] {
  return wrapDbOperation("getPendingLifelogActionItems", () => {
    const rows = db.prepare(`
      SELECT * FROM lifelog_action_items 
      WHERE status = 'pending'
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as LifelogActionItemRow[];
    return rows.map(mapLifelogActionItem);
  });
}

export function getAllLifelogActionItems(limit: number = 100): LifelogActionItem[] {
  return wrapDbOperation("getAllLifelogActionItems", () => {
    const rows = db.prepare(`
      SELECT * FROM lifelog_action_items 
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as LifelogActionItemRow[];
    return rows.map(mapLifelogActionItem);
  });
}

export function updateLifelogActionItem(id: string, updates: { status?: string; linkedTaskId?: string; linkedContactId?: string }): LifelogActionItem | undefined {
  return wrapDbOperation("updateLifelogActionItem", () => {
    const item = getLifelogActionItem(id);
    if (!item) return undefined;
    
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status); }
    if (updates.linkedTaskId !== undefined) { fields.push("linked_task_id = ?"); values.push(updates.linkedTaskId); }
    if (updates.linkedContactId !== undefined) { fields.push("linked_contact_id = ?"); values.push(updates.linkedContactId); }
    
    if (fields.length === 0) return item;
    
    values.push(id);
    db.prepare(`UPDATE lifelog_action_items SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return getLifelogActionItem(id);
  });
}

export function checkActionItemExists(lifelogId: string, sourceOffsetMs: number): boolean {
  return wrapDbOperation("checkActionItemExists", () => {
    const row = db.prepare(`
      SELECT 1 FROM lifelog_action_items 
      WHERE lifelog_id = ? AND source_offset_ms = ?
    `).get(lifelogId, sourceOffsetMs);
    return Boolean(row);
  });
}

// ============================================
// LIMITLESS ENHANCED FEATURES - DAILY ANALYTICS
// ============================================

interface LimitlessAnalyticsDailyRow {
  id: string;
  date: string;
  total_conversations: number;
  total_duration_minutes: number;
  unique_speakers: number;
  speaker_stats: string;
  topic_stats: string;
  hour_distribution: string;
  meeting_count: number;
  action_items_extracted: number;
  starred_count: number;
  created_at: string;
  updated_at: string;
}

function mapLimitlessAnalyticsDaily(row: LimitlessAnalyticsDailyRow): LimitlessAnalyticsDaily {
  return {
    id: row.id,
    date: row.date,
    totalConversations: row.total_conversations,
    totalDurationMinutes: row.total_duration_minutes,
    uniqueSpeakers: row.unique_speakers,
    speakerStats: row.speaker_stats,
    topicStats: row.topic_stats,
    hourDistribution: row.hour_distribution,
    meetingCount: row.meeting_count,
    actionItemsExtracted: row.action_items_extracted,
    starredCount: row.starred_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createOrUpdateLimitlessAnalyticsDaily(data: InsertLimitlessAnalyticsDaily): LimitlessAnalyticsDaily {
  return wrapDbOperation("createOrUpdateLimitlessAnalyticsDaily", () => {
    const existing = getLimitlessAnalyticsByDate(data.date);
    const now = getCurrentTimestamp();
    
    if (existing) {
      db.prepare(`
        UPDATE limitless_analytics_daily 
        SET total_conversations = ?, total_duration_minutes = ?, unique_speakers = ?,
            speaker_stats = ?, topic_stats = ?, hour_distribution = ?,
            meeting_count = ?, action_items_extracted = ?, starred_count = ?, updated_at = ?
        WHERE id = ?
      `).run(
        data.totalConversations,
        data.totalDurationMinutes,
        data.uniqueSpeakers,
        data.speakerStats,
        data.topicStats,
        data.hourDistribution,
        data.meetingCount,
        data.actionItemsExtracted,
        data.starredCount,
        now,
        existing.id
      );
      return getLimitlessAnalyticsByDate(data.date)!;
    }
    
    const id = uuidv4();
    db.prepare(`
      INSERT INTO limitless_analytics_daily (id, date, total_conversations, total_duration_minutes, unique_speakers, speaker_stats, topic_stats, hour_distribution, meeting_count, action_items_extracted, starred_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.date,
      data.totalConversations,
      data.totalDurationMinutes,
      data.uniqueSpeakers,
      data.speakerStats,
      data.topicStats,
      data.hourDistribution,
      data.meetingCount,
      data.actionItemsExtracted,
      data.starredCount,
      now,
      now
    );
    
    return getLimitlessAnalyticsByDate(data.date)!;
  });
}

export function getLimitlessAnalyticsByDate(date: string): LimitlessAnalyticsDaily | undefined {
  return wrapDbOperation("getLimitlessAnalyticsByDate", () => {
    const row = db.prepare(`SELECT * FROM limitless_analytics_daily WHERE date = ?`).get(date) as LimitlessAnalyticsDailyRow | undefined;
    return row ? mapLimitlessAnalyticsDaily(row) : undefined;
  });
}

export function getLimitlessAnalyticsInRange(startDate: string, endDate: string): LimitlessAnalyticsDaily[] {
  return wrapDbOperation("getLimitlessAnalyticsInRange", () => {
    const rows = db.prepare(`
      SELECT * FROM limitless_analytics_daily 
      WHERE date >= ? AND date <= ?
      ORDER BY date DESC
    `).all(startDate, endDate) as LimitlessAnalyticsDailyRow[];
    return rows.map(mapLimitlessAnalyticsDaily);
  });
}

export function getRecentLimitlessAnalytics(days: number = 7): LimitlessAnalyticsDaily[] {
  return wrapDbOperation("getRecentLimitlessAnalytics", () => {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const rows = db.prepare(`
      SELECT * FROM limitless_analytics_daily 
      WHERE date >= ?
      ORDER BY date DESC
    `).all(startDate) as LimitlessAnalyticsDailyRow[];
    return rows.map(mapLimitlessAnalyticsDaily);
  });
}

export { db };

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
  InsertReminder
} from "@shared/schema";

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
} catch (e) {
  console.error("Migration error for memory_notes supersession:", e);
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
  is_superseded: number;
  superseded_by: string | null;
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
    isSuperseded: Boolean(row.is_superseded),
    supersededBy: row.superseded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

// Memory notes operations
export function createMemoryNote(data: InsertMemoryNote): MemoryNote {
  return wrapDbOperation("createMemoryNote", () => {
    const id = uuidv4();
    const now = getCurrentTimestamp();
    const context = data.context || "";
    
    db.prepare(`
      INSERT INTO memory_notes (id, type, content, context, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.type, data.content, context, now, now);
    
    return { 
      id, 
      type: data.type as "summary" | "note" | "preference" | "fact", 
      content: data.content, 
      context, 
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
      INSERT INTO reminders (id, message, recipient_phone, conversation_id, scheduled_for, created_at, completed)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.message, data.recipientPhone || null, data.conversationId || null, data.scheduledFor, now, data.completed ? 1 : 0);
    
    return {
      id,
      message: data.message,
      recipientPhone: data.recipientPhone || null,
      conversationId: data.conversationId || null,
      scheduledFor: data.scheduledFor,
      createdAt: now,
      completed: data.completed || false,
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
  data: InsertMemoryNote, 
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

export { db };

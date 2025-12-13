/**
 * Seed Script
 * 
 * Populates the database with minimal seed data for development/testing.
 */

import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";

const db = new Database("zeke.db");

function now(): string {
  return new Date().toISOString();
}

function seed(): void {
  console.log("Starting database seed...");

  const conversationId = uuidv4();
  const timestamp = now();

  db.prepare(`
    INSERT OR IGNORE INTO conversations (id, title, source, created_at, updated_at)
    VALUES (?, 'Welcome Conversation', 'web', ?, ?)
  `).run(conversationId, timestamp, timestamp);

  db.prepare(`
    INSERT OR IGNORE INTO messages (id, conversation_id, role, content, source, created_at)
    VALUES (?, ?, 'assistant', 'Hello! I am ZEKE, your personal AI assistant.', 'web', ?)
  `).run(uuidv4(), conversationId, timestamp);

  db.prepare(`
    INSERT OR IGNORE INTO preferences (id, key, value, updated_at)
    VALUES (?, 'theme', 'dark', ?)
  `).run(uuidv4(), timestamp);

  db.prepare(`
    INSERT OR IGNORE INTO tasks (id, title, description, priority, category, completed, created_at, updated_at)
    VALUES (?, 'Sample Task', 'This is a sample task for testing', 'medium', 'personal', 0, ?, ?)
  `).run(uuidv4(), timestamp, timestamp);

  console.log("Database seed completed successfully.");
}

try {
  seed();
  db.close();
  process.exit(0);
} catch (error) {
  console.error("Seed failed:", error);
  db.close();
  process.exit(1);
}

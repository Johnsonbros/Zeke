import Database from "better-sqlite3";

// Create location_state_tracking table
const db = new Database("zeke.db");

console.log("Creating location_state_tracking table...");

db.exec(`
  CREATE TABLE IF NOT EXISTS location_state_tracking (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'default',
    current_latitude TEXT,
    current_longitude TEXT,
    current_accuracy TEXT,
    current_location_timestamp TEXT,
    current_place_id TEXT,
    current_place_name TEXT,
    current_place_category TEXT,
    arrived_at TEXT,
    previous_place_id TEXT,
    previous_place_name TEXT,
    previous_place_category TEXT,
    departed_at TEXT,
    location_state TEXT NOT NULL DEFAULT 'unknown',
    last_state_change TEXT NOT NULL,
    last_check_in_at TEXT,
    last_check_in_place_id TEXT,
    last_check_in_message TEXT,
    check_in_count INTEGER NOT NULL DEFAULT 0,
    check_ins_today INTEGER NOT NULL DEFAULT 0,
    last_check_in_date TEXT,
    updated_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

console.log("✅ location_state_tracking table created successfully");

db.close();

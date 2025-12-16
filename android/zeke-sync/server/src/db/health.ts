/**
 * Database Health Check
 * 
 * Provides functions to verify database connectivity and health.
 */

import Database from "better-sqlite3";

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database("zeke.db", { readonly: true });
  }
  return db;
}

export interface DbHealthResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
  tableCount?: number;
}

export function dbReady(): boolean {
  try {
    const database = getDb();
    const result = database.prepare("SELECT 1 as ping").get() as { ping: number } | undefined;
    return result?.ping === 1;
  } catch {
    return false;
  }
}

export async function checkDbHealth(): Promise<DbHealthResult> {
  const start = Date.now();
  try {
    const database = getDb();
    
    const pingResult = database.prepare("SELECT 1 as ping").get() as { ping: number } | undefined;
    if (pingResult?.ping !== 1) {
      return { ok: false, latencyMs: Date.now() - start, error: "Ping query failed" };
    }
    
    const tables = database.prepare(`
      SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'
    `).get() as { count: number };
    
    return {
      ok: true,
      latencyMs: Date.now() - start,
      tableCount: tables.count,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown database error",
    };
  }
}

export function closeHealthDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

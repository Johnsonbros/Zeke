/**
 * Signals Service
 * 
 * Unified event stream for cross-domain queries.
 * Domain tables remain rich, but signals provide a thin normalized stream
 * for correlation and finding computations.
 */

import Database from "better-sqlite3";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const DB_PATH = path.join(process.cwd(), "zeke.db");

function getDb(): Database.Database {
  return new Database(DB_PATH);
}

// Signal domains
export type SignalDomain = 
  | "journal"
  | "tasks"
  | "location"
  | "stressors"
  | "calendar"
  | "food"
  | "social"
  | "health"
  | "weather";

// Signal types per domain
export type SignalType = 
  | "mood"
  | "energy"
  | "task_completed"
  | "task_created"
  | "location_change"
  | "stressor_triggered"
  | "meeting"
  | "meal"
  | "sleep"
  | "interaction"
  | "weather_change";

export interface Signal {
  id: string;
  domain: SignalDomain;
  type: SignalType;
  ts: string;
  valueNum?: number;
  valueText?: string;
  meta: Record<string, any>;
  sourceId?: string;
  createdAt: string;
}

export interface InsertSignal {
  domain: SignalDomain;
  type: SignalType;
  ts: string;
  valueNum?: number;
  valueText?: string;
  meta?: Record<string, any>;
  sourceId?: string;
}

// Ensure signals table exists
function ensureSignalsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      type TEXT NOT NULL,
      ts TEXT NOT NULL,
      value_num REAL,
      value_text TEXT,
      meta TEXT NOT NULL DEFAULT '{}',
      source_id TEXT,
      created_at TEXT NOT NULL
    )
  `);
  
  db.exec(`CREATE INDEX IF NOT EXISTS idx_signals_ts ON signals(ts DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_signals_domain_type_ts ON signals(domain, type, ts DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_signals_source_id ON signals(source_id)`);
  
  console.log("[Signals] Table initialized");
}

/**
 * Record a signal (unified event)
 */
export function recordSignal(signal: InsertSignal): Signal {
  const db = getDb();
  ensureSignalsTable(db);
  
  const id = uuidv4();
  const now = new Date().toISOString();
  
  const result: Signal = {
    id,
    domain: signal.domain,
    type: signal.type,
    ts: signal.ts,
    valueNum: signal.valueNum,
    valueText: signal.valueText,
    meta: signal.meta || {},
    sourceId: signal.sourceId,
    createdAt: now,
  };
  
  db.prepare(`
    INSERT INTO signals (id, domain, type, ts, value_num, value_text, meta, source_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    result.id,
    result.domain,
    result.type,
    result.ts,
    result.valueNum ?? null,
    result.valueText ?? null,
    JSON.stringify(result.meta),
    result.sourceId ?? null,
    result.createdAt
  );
  
  db.close();
  return result;
}

/**
 * Record multiple signals in batch
 */
export function recordSignals(signals: InsertSignal[]): Signal[] {
  const db = getDb();
  ensureSignalsTable(db);
  
  const now = new Date().toISOString();
  const results: Signal[] = [];
  
  const insert = db.prepare(`
    INSERT INTO signals (id, domain, type, ts, value_num, value_text, meta, source_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertMany = db.transaction((sigs: InsertSignal[]) => {
    for (const signal of sigs) {
      const id = uuidv4();
      const result: Signal = {
        id,
        domain: signal.domain,
        type: signal.type,
        ts: signal.ts,
        valueNum: signal.valueNum,
        valueText: signal.valueText,
        meta: signal.meta || {},
        sourceId: signal.sourceId,
        createdAt: now,
      };
      
      insert.run(
        result.id,
        result.domain,
        result.type,
        result.ts,
        result.valueNum ?? null,
        result.valueText ?? null,
        JSON.stringify(result.meta),
        result.sourceId ?? null,
        result.createdAt
      );
      
      results.push(result);
    }
  });
  
  insertMany(signals);
  db.close();
  return results;
}

/**
 * Query signals with filters
 */
export function querySignals(options: {
  domain?: SignalDomain;
  type?: SignalType;
  since?: string;
  until?: string;
  limit?: number;
}): Signal[] {
  const db = getDb();
  ensureSignalsTable(db);
  
  let sql = "SELECT * FROM signals WHERE 1=1";
  const params: any[] = [];
  
  if (options.domain) {
    sql += " AND domain = ?";
    params.push(options.domain);
  }
  
  if (options.type) {
    sql += " AND type = ?";
    params.push(options.type);
  }
  
  if (options.since) {
    sql += " AND ts >= ?";
    params.push(options.since);
  }
  
  if (options.until) {
    sql += " AND ts <= ?";
    params.push(options.until);
  }
  
  sql += " ORDER BY ts DESC";
  
  if (options.limit) {
    sql += " LIMIT ?";
    params.push(options.limit);
  }
  
  const rows = db.prepare(sql).all(...params) as any[];
  db.close();
  
  return rows.map(row => ({
    id: row.id,
    domain: row.domain as SignalDomain,
    type: row.type as SignalType,
    ts: row.ts,
    valueNum: row.value_num ?? undefined,
    valueText: row.value_text ?? undefined,
    meta: JSON.parse(row.meta || "{}"),
    sourceId: row.source_id ?? undefined,
    createdAt: row.created_at,
  }));
}

/**
 * Get daily aggregates for correlation analysis
 */
export interface DailyAggregate {
  day: string;
  tasks: number;
  energy?: number;
  mood?: number;
  stressorCount: number;
  meetingCount: number;
  signalIds: string[]; // Track actual signal IDs for citation
}

export function computeDailyAggregates(since?: string): DailyAggregate[] {
  const db = getDb();
  ensureSignalsTable(db);
  
  const sinceDate = since || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  
  const signals = db.prepare(`
    SELECT id, type, ts, value_num
    FROM signals
    WHERE date(ts) >= ?
    ORDER BY ts
  `).all(sinceDate) as any[];
  
  db.close();
  
  const byDay = new Map<string, DailyAggregate>();
  
  for (const s of signals) {
    const day = s.ts.slice(0, 10);
    if (!byDay.has(day)) {
      byDay.set(day, { day, tasks: 0, stressorCount: 0, meetingCount: 0, signalIds: [] });
    }
    const agg = byDay.get(day)!;
    
    // Track signal ID for citations
    agg.signalIds.push(s.id);
    
    if (s.type === "task_completed") {
      agg.tasks += 1;
    }
    if (s.type === "energy" && typeof s.value_num === "number") {
      // Average if multiple entries
      agg.energy = agg.energy === undefined ? s.value_num : (agg.energy + s.value_num) / 2;
    }
    if (s.type === "mood" && typeof s.value_num === "number") {
      agg.mood = agg.mood === undefined ? s.value_num : (agg.mood + s.value_num) / 2;
    }
    if (s.type === "stressor_triggered") {
      agg.stressorCount += 1;
    }
    if (s.type === "meeting") {
      agg.meetingCount += 1;
    }
  }
  
  return Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * Count signals by domain (for coverage metrics)
 */
export function getSignalCounts(sinceDays: number = 30): Record<SignalDomain, number> {
  const db = getDb();
  ensureSignalsTable(db);
  
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  
  const rows = db.prepare(`
    SELECT domain, COUNT(*) as count
    FROM signals
    WHERE ts >= ?
    GROUP BY domain
  `).all(since) as any[];
  
  db.close();
  
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.domain] = row.count;
  }
  return result as Record<SignalDomain, number>;
}

/**
 * Get unique days with signals per domain (for coverage)
 */
export function getDaysWithSignals(sinceDays: number = 30): Record<SignalDomain, number> {
  const db = getDb();
  ensureSignalsTable(db);
  
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  
  const rows = db.prepare(`
    SELECT domain, COUNT(DISTINCT date(ts)) as days
    FROM signals
    WHERE ts >= ?
    GROUP BY domain
  `).all(since) as any[];
  
  db.close();
  
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.domain] = row.days;
  }
  return result as Record<SignalDomain, number>;
}

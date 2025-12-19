/**
 * Contradiction Tracker Service
 * 
 * Detects and tracks contradictions per ZEKE_ONTOLOGY.md primitive #7.
 * Contradictions are more informative than confirmations - they reveal hidden values or stressors.
 */

import Database from "better-sqlite3";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type { Contradiction, ContradictionResolution } from "@shared/schema";

const DB_PATH = path.join(process.cwd(), "zeke.db");

function getDb(): Database.Database {
  return new Database(DB_PATH);
}

function ensureContradictionsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contradictions (
      id TEXT PRIMARY KEY,
      observation TEXT NOT NULL,
      expected TEXT NOT NULL,
      pattern_id TEXT,
      memory_id TEXT,
      possible_reasons TEXT,
      resolution TEXT DEFAULT 'unexplained',
      user_explanation TEXT,
      impact_level TEXT DEFAULT 'medium',
      led_to_pattern_update INTEGER DEFAULT 0,
      led_to_value_update INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    )
  `);
}

export interface ContradictionDetection {
  observation: string;
  expected: string;
  patternId?: string;
  memoryId?: string;
  possibleReasons?: string[];
}

export interface ContradictionStats {
  total: number;
  unexplained: number;
  explained: number;
  patternUpdated: number;
  exception: number;
  recentContradictions: Contradiction[];
}

function rowToContradiction(row: any): Contradiction {
  return {
    id: row.id,
    observation: row.observation,
    expected: row.expected,
    patternId: row.pattern_id,
    memoryId: row.memory_id,
    possibleReasons: row.possible_reasons,
    resolution: row.resolution as ContradictionResolution,
    userExplanation: row.user_explanation,
    impactLevel: row.impact_level,
    ledToPatternUpdate: !!row.led_to_pattern_update,
    ledToValueUpdate: !!row.led_to_value_update,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

/**
 * Record a new contradiction
 */
export async function recordContradiction(detection: ContradictionDetection): Promise<Contradiction> {
  const db = getDb();
  try {
    ensureContradictionsTable(db);
    
    const now = new Date().toISOString();
    const id = uuidv4();
    
    db.prepare(`
      INSERT INTO contradictions (id, observation, expected, pattern_id, memory_id, possible_reasons, resolution, impact_level, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'unexplained', 'medium', ?)
    `).run(
      id,
      detection.observation,
      detection.expected,
      detection.patternId || null,
      detection.memoryId || null,
      detection.possibleReasons ? JSON.stringify(detection.possibleReasons) : null,
      now
    );
    
    console.log(`[ContradictionTracker] Recorded contradiction: "${detection.observation}" (expected: "${detection.expected}")`);
    
    return {
      id,
      observation: detection.observation,
      expected: detection.expected,
      patternId: detection.patternId || null,
      memoryId: detection.memoryId || null,
      possibleReasons: detection.possibleReasons ? JSON.stringify(detection.possibleReasons) : null,
      resolution: "unexplained",
      userExplanation: null,
      impactLevel: "medium",
      ledToPatternUpdate: false,
      ledToValueUpdate: false,
      createdAt: now,
      resolvedAt: null,
    };
  } finally {
    db.close();
  }
}

/**
 * Resolve a contradiction with user explanation or analysis
 */
export async function resolveContradiction(
  id: string,
  resolution: ContradictionResolution,
  userExplanation?: string,
  options?: {
    ledToPatternUpdate?: boolean;
    ledToValueUpdate?: boolean;
  }
): Promise<Contradiction | null> {
  const db = getDb();
  try {
    ensureContradictionsTable(db);
    
    const now = new Date().toISOString();
    
    const existing = db.prepare(`SELECT * FROM contradictions WHERE id = ?`).get(id);
    if (!existing) return null;
    
    db.prepare(`
      UPDATE contradictions SET
        resolution = ?,
        user_explanation = ?,
        resolved_at = ?,
        led_to_pattern_update = ?,
        led_to_value_update = ?
      WHERE id = ?
    `).run(
      resolution,
      userExplanation || null,
      now,
      options?.ledToPatternUpdate ? 1 : 0,
      options?.ledToValueUpdate ? 1 : 0,
      id
    );
    
    console.log(`[ContradictionTracker] Resolved contradiction ${id} as "${resolution}"`);
    
    return getContradictionById(db, id);
  } finally {
    db.close();
  }
}

function getContradictionById(db: Database.Database, id: string): Contradiction | null {
  const row = db.prepare(`SELECT * FROM contradictions WHERE id = ?`).get(id);
  return row ? rowToContradiction(row) : null;
}

/**
 * Get a single contradiction by ID
 */
export async function getContradiction(id: string): Promise<Contradiction | null> {
  const db = getDb();
  try {
    ensureContradictionsTable(db);
    return getContradictionById(db, id);
  } finally {
    db.close();
  }
}

/**
 * Get all contradictions, optionally filtered
 */
export async function getContradictions(options?: {
  resolution?: ContradictionResolution;
  patternId?: string;
  limit?: number;
}): Promise<Contradiction[]> {
  const db = getDb();
  try {
    ensureContradictionsTable(db);
    
    let query = `SELECT * FROM contradictions WHERE 1=1`;
    const params: any[] = [];
    
    if (options?.resolution) {
      query += ` AND resolution = ?`;
      params.push(options.resolution);
    }
    if (options?.patternId) {
      query += ` AND pattern_id = ?`;
      params.push(options.patternId);
    }
    
    query += ` ORDER BY created_at DESC`;
    
    if (options?.limit) {
      query += ` LIMIT ?`;
      params.push(options.limit);
    }
    
    const rows = db.prepare(query).all(...params);
    return rows.map(rowToContradiction);
  } finally {
    db.close();
  }
}

/**
 * Get contradiction statistics
 */
export async function getContradictionStats(): Promise<ContradictionStats> {
  const db = getDb();
  try {
    ensureContradictionsTable(db);
    
    const all = db.prepare(`SELECT * FROM contradictions ORDER BY created_at DESC`).all();
    const contradictionList = all.map(rowToContradiction);
    
    const stats: ContradictionStats = {
      total: contradictionList.length,
      unexplained: contradictionList.filter(c => c.resolution === "unexplained").length,
      explained: contradictionList.filter(c => c.resolution === "explained").length,
      patternUpdated: contradictionList.filter(c => c.resolution === "pattern_updated").length,
      exception: contradictionList.filter(c => c.resolution === "exception").length,
      recentContradictions: contradictionList.slice(0, 5),
    };
    
    return stats;
  } finally {
    db.close();
  }
}

/**
 * Get unresolved contradictions that need attention
 */
export async function getUnresolvedContradictions(): Promise<Contradiction[]> {
  const db = getDb();
  try {
    ensureContradictionsTable(db);
    
    const rows = db.prepare(`
      SELECT * FROM contradictions 
      WHERE resolution = 'unexplained' 
      ORDER BY created_at DESC
    `).all();
    
    return rows.map(rowToContradiction);
  } finally {
    db.close();
  }
}

/**
 * Link a contradiction to its resolution outcome
 */
export async function linkContradictionToUpdate(
  contradictionId: string,
  update: {
    patternId?: string;
    valueId?: string;
  }
): Promise<void> {
  const db = getDb();
  try {
    ensureContradictionsTable(db);
    
    db.prepare(`
      UPDATE contradictions SET
        led_to_pattern_update = ?,
        led_to_value_update = ?
      WHERE id = ?
    `).run(
      update.patternId ? 1 : 0,
      update.valueId ? 1 : 0,
      contradictionId
    );
  } finally {
    db.close();
  }
}

/**
 * Check if an observation contradicts known patterns (placeholder)
 * Returns potential contradictions that should be recorded
 */
export async function detectPatternContradictions(
  observation: string,
  context: {
    domain?: string;
    timestamp?: string;
  } = {}
): Promise<ContradictionDetection[]> {
  // TODO: Implement actual pattern contradiction detection
  // This would involve:
  // 1. Parse the observation for key behaviors
  // 2. Compare against pattern definitions
  // 3. Flag significant deviations
  console.log(`[ContradictionTracker] Pattern contradiction detection not yet implemented for: "${observation}"`);
  return [];
}

export default {
  recordContradiction,
  resolveContradiction,
  getContradiction,
  getContradictions,
  getContradictionStats,
  detectPatternContradictions,
  getUnresolvedContradictions,
  linkContradictionToUpdate,
};

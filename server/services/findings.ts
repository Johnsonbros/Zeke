/**
 * Findings Service
 * 
 * Unified storage for correlations and contradictions with deterministic IDs.
 * Findings are rankable, explainable, and traceable over time.
 */

import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";

const DB_PATH = path.join(process.cwd(), "zeke.db");

function getDb(): Database.Database {
  return new Database(DB_PATH);
}

// Finding types
export type FindingKind = "correlation" | "contradiction";
export type FindingStatus = "active" | "resolved" | "stale";

export interface FindingKey {
  kind: FindingKind;
  subject: string;
  predicate: string;
  object: string;
  window: Record<string, any>;
}

export interface Finding {
  id: string;
  kind: FindingKind;
  subject: string;
  predicate: string;
  object: string;
  window: Record<string, any>;
  stats: Record<string, any>;
  evidence: {
    signalIds: string[];
    expectationId?: string;
  };
  strength: number;
  status: FindingStatus;
  firstSeen: string;
  lastSeen: string;
  createdAt: string;
  updatedAt: string;
}

export interface InsertFinding {
  kind: FindingKind;
  subject: string;
  predicate: string;
  object: string;
  window: Record<string, any>;
  stats: Record<string, any>;
  evidence: {
    signalIds: string[];
    expectationId?: string;
  };
  strength: number;
}

/**
 * Stable JSON stringification for deterministic IDs
 */
function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",")}}`;
}

/**
 * Generate deterministic finding ID from semantic key
 * Rule: ID must NOT include variable stats - only semantic identity
 */
export function makeFindingId(key: FindingKey): string {
  const canonical = stableStringify(key);
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

// Ensure findings table exists
function ensureFindingsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS findings (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      subject TEXT NOT NULL,
      predicate TEXT NOT NULL,
      object TEXT NOT NULL,
      window TEXT NOT NULL,
      stats TEXT NOT NULL,
      evidence TEXT NOT NULL,
      strength REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  
  db.exec(`CREATE INDEX IF NOT EXISTS idx_findings_kind ON findings(kind)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_findings_subject ON findings(subject)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_findings_status ON findings(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_findings_strength ON findings(strength DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_findings_last_seen ON findings(last_seen DESC)`);
  
  console.log("[Findings] Table initialized");
}

/**
 * Upsert a finding (idempotent - safe to run repeatedly)
 * Updates stats, evidence, strength, and last_seen if finding exists
 */
export function upsertFinding(finding: InsertFinding): Finding {
  const db = getDb();
  ensureFindingsTable(db);
  
  const key: FindingKey = {
    kind: finding.kind,
    subject: finding.subject,
    predicate: finding.predicate,
    object: finding.object,
    window: finding.window,
  };
  
  const id = makeFindingId(key);
  const now = new Date().toISOString();
  
  // Check if exists
  const existing = db.prepare("SELECT * FROM findings WHERE id = ?").get(id) as any;
  
  if (existing) {
    // Update existing
    db.prepare(`
      UPDATE findings
      SET stats = ?, evidence = ?, strength = ?, last_seen = ?, updated_at = ?, status = 'active'
      WHERE id = ?
    `).run(
      JSON.stringify(finding.stats),
      JSON.stringify(finding.evidence),
      finding.strength,
      now,
      now,
      id
    );
    
    db.close();
    return {
      id,
      kind: finding.kind,
      subject: finding.subject,
      predicate: finding.predicate,
      object: finding.object,
      window: finding.window,
      stats: finding.stats,
      evidence: finding.evidence,
      strength: finding.strength,
      status: "active",
      firstSeen: existing.first_seen,
      lastSeen: now,
      createdAt: existing.created_at,
      updatedAt: now,
    };
  }
  
  // Insert new
  db.prepare(`
    INSERT INTO findings (id, kind, subject, predicate, object, window, stats, evidence, strength, status, first_seen, last_seen, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
  `).run(
    id,
    finding.kind,
    finding.subject,
    finding.predicate,
    finding.object,
    JSON.stringify(finding.window),
    JSON.stringify(finding.stats),
    JSON.stringify(finding.evidence),
    finding.strength,
    now,
    now,
    now,
    now
  );
  
  db.close();
  return {
    id,
    kind: finding.kind,
    subject: finding.subject,
    predicate: finding.predicate,
    object: finding.object,
    window: finding.window,
    stats: finding.stats,
    evidence: finding.evidence,
    strength: finding.strength,
    status: "active",
    firstSeen: now,
    lastSeen: now,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get findings by kind, subject, or status
 */
export function getFindings(options: {
  kind?: FindingKind;
  subject?: string;
  status?: FindingStatus;
  minStrength?: number;
  limit?: number;
}): Finding[] {
  const db = getDb();
  ensureFindingsTable(db);
  
  let sql = "SELECT * FROM findings WHERE 1=1";
  const params: any[] = [];
  
  if (options.kind) {
    sql += " AND kind = ?";
    params.push(options.kind);
  }
  
  if (options.subject) {
    sql += " AND subject = ?";
    params.push(options.subject);
  }
  
  if (options.status) {
    sql += " AND status = ?";
    params.push(options.status);
  }
  
  if (options.minStrength !== undefined) {
    sql += " AND ABS(strength) >= ?";
    params.push(options.minStrength);
  }
  
  sql += " ORDER BY ABS(strength) DESC";
  
  if (options.limit) {
    sql += " LIMIT ?";
    params.push(options.limit);
  }
  
  const rows = db.prepare(sql).all(...params) as any[];
  db.close();
  
  return rows.map(row => ({
    id: row.id,
    kind: row.kind as FindingKind,
    subject: row.subject,
    predicate: row.predicate,
    object: row.object,
    window: JSON.parse(row.window),
    stats: JSON.parse(row.stats),
    evidence: JSON.parse(row.evidence),
    strength: row.strength,
    status: row.status as FindingStatus,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Mark stale findings (not seen in N days)
 */
export function markStaleFindingsOlderThan(days: number): number {
  const db = getDb();
  ensureFindingsTable(db);
  
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  
  const result = db.prepare(`
    UPDATE findings
    SET status = 'stale', updated_at = ?
    WHERE status = 'active' AND last_seen < ?
  `).run(new Date().toISOString(), cutoff);
  
  db.close();
  return result.changes;
}

/**
 * Resolve a finding (mark as no longer applicable)
 */
export function resolveFinding(id: string, reason?: string): boolean {
  const db = getDb();
  ensureFindingsTable(db);
  
  const now = new Date().toISOString();
  
  const result = db.prepare(`
    UPDATE findings
    SET status = 'resolved', updated_at = ?, stats = json_set(stats, '$.resolvedReason', ?)
    WHERE id = ?
  `).run(now, reason || "manually resolved", id);
  
  db.close();
  return result.changes > 0;
}

/**
 * Get stability metric: how many findings persist across weeks
 */
export function getStabilityScore(): number {
  const db = getDb();
  ensureFindingsTable(db);
  
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  // Count findings that have persisted for at least a week
  const persistent = db.prepare(`
    SELECT COUNT(*) as count FROM findings
    WHERE status = 'active' AND first_seen < ?
  `).get(oneWeekAgo) as any;
  
  const total = db.prepare(`
    SELECT COUNT(*) as count FROM findings
    WHERE status = 'active'
  `).get() as any;
  
  db.close();
  
  if (total.count === 0) return 0;
  return persistent.count / total.count;
}

/**
 * Get finding counts by kind
 */
export function getFindingCounts(): { correlations: number; contradictions: number; active: number; stale: number } {
  const db = getDb();
  ensureFindingsTable(db);
  
  const correlations = db.prepare(`
    SELECT COUNT(*) as count FROM findings WHERE kind = 'correlation' AND status = 'active'
  `).get() as any;
  
  const contradictions = db.prepare(`
    SELECT COUNT(*) as count FROM findings WHERE kind = 'contradiction' AND status = 'active'
  `).get() as any;
  
  const active = db.prepare(`
    SELECT COUNT(*) as count FROM findings WHERE status = 'active'
  `).get() as any;
  
  const stale = db.prepare(`
    SELECT COUNT(*) as count FROM findings WHERE status = 'stale'
  `).get() as any;
  
  db.close();
  
  return {
    correlations: correlations.count,
    contradictions: contradictions.count,
    active: active.count,
    stale: stale.count,
  };
}

/**
 * Expectations Service
 * 
 * Tracks explicit predictions for measurable contradiction detection.
 * When ZEKE makes a claim that implies a prediction, store it.
 * When observation comes in, evaluate against expectation.
 */

import Database from "better-sqlite3";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { upsertFinding, makeFindingId, type FindingKey, type InsertFinding } from "./findings";

const DB_PATH = path.join(process.cwd(), "zeke.db");

function getDb(): Database.Database {
  return new Database(DB_PATH);
}

export type ExpectationSubject = "energy" | "mood" | "productivity" | "stress";
export type Comparator = ">=" | "<=" | "~";

export interface Expectation {
  id: string;
  subject: ExpectationSubject;
  expected: {
    value: number;
    comparator: Comparator;
    windowHours: number;
  };
  because: {
    findingId?: string;
    rationale: string;
  };
  context: Record<string, any>;
  dueBy: string;
  status: "pending" | "evaluated" | "expired";
  observedValue?: number;
  wasCorrect?: boolean;
  evaluatedAt?: string;
  createdAt: string;
}

export interface InsertExpectation {
  subject: ExpectationSubject;
  expected: {
    value: number;
    comparator: Comparator;
    windowHours: number;
  };
  because: {
    findingId?: string;
    rationale: string;
  };
  context?: Record<string, any>;
  dueBy: string;
}

// Ensure expectations table exists
function ensureExpectationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS expectations (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      expected TEXT NOT NULL,
      because TEXT NOT NULL,
      context TEXT NOT NULL DEFAULT '{}',
      due_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      observed_value REAL,
      was_correct INTEGER,
      evaluated_at TEXT,
      created_at TEXT NOT NULL
    )
  `);
  
  db.exec(`CREATE INDEX IF NOT EXISTS idx_expectations_status ON expectations(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_expectations_due_by ON expectations(due_by)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_expectations_subject ON expectations(subject)`);
  
  console.log("[Expectations] Table initialized");
}

/**
 * Create an expectation (ZEKE predicts something)
 */
export function createExpectation(exp: InsertExpectation): Expectation {
  const db = getDb();
  ensureExpectationsTable(db);
  
  const id = uuidv4();
  const now = new Date().toISOString();
  
  const result: Expectation = {
    id,
    subject: exp.subject,
    expected: exp.expected,
    because: exp.because,
    context: exp.context || {},
    dueBy: exp.dueBy,
    status: "pending",
    createdAt: now,
  };
  
  db.prepare(`
    INSERT INTO expectations (id, subject, expected, because, context, due_by, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    result.id,
    result.subject,
    JSON.stringify(result.expected),
    JSON.stringify(result.because),
    JSON.stringify(result.context),
    result.dueBy,
    result.createdAt
  );
  
  db.close();
  console.log(`[Expectations] Created: ${result.subject} ${result.expected.comparator} ${result.expected.value} by ${result.dueBy}`);
  return result;
}

/**
 * Compare observation against expectation
 */
function compare(observed: number, expected: Expectation["expected"]): boolean {
  if (expected.comparator === ">=") return observed >= expected.value;
  if (expected.comparator === "<=") return observed <= expected.value;
  // ~ means approximately equal (within 0.5)
  return Math.abs(observed - expected.value) <= 0.5;
}

/**
 * Evaluate a pending expectation with an observed value
 * Creates a contradiction finding if expectation was wrong
 */
export function evaluateExpectation(
  expectationId: string,
  observedValue: number,
  signalIds: string[] = []
): { wasCorrect: boolean; contradictionFinding?: ReturnType<typeof upsertFinding> } {
  const db = getDb();
  ensureExpectationsTable(db);
  
  const row = db.prepare("SELECT * FROM expectations WHERE id = ?").get(expectationId) as any;
  if (!row) {
    db.close();
    throw new Error(`Expectation ${expectationId} not found`);
  }
  
  const expected = JSON.parse(row.expected);
  const because = JSON.parse(row.because);
  const context = JSON.parse(row.context || "{}");
  const wasCorrect = compare(observedValue, expected);
  const now = new Date().toISOString();
  
  db.prepare(`
    UPDATE expectations
    SET observed_value = ?, was_correct = ?, evaluated_at = ?, status = 'evaluated'
    WHERE id = ?
  `).run(observedValue, wasCorrect ? 1 : 0, now, expectationId);
  
  db.close();
  
  console.log(`[Expectations] Evaluated ${expectationId}: observed=${observedValue}, expected=${expected.comparator}${expected.value}, correct=${wasCorrect}`);
  
  // If wrong, create a contradiction finding
  let contradictionFinding;
  if (!wasCorrect) {
    const objectLabel = context.objectLabel || `${row.subject}_after_${because.rationale.slice(0, 20).replace(/\s+/g, "_")}`;
    
    const finding: InsertFinding = {
      kind: "contradiction",
      subject: row.subject,
      predicate: "expected_vs_observed",
      object: objectLabel,
      window: { windowHours: expected.windowHours },
      stats: {
        expected: expected,
        observed: observedValue,
        matched: wasCorrect,
        expectationId: expectationId,
        rationale: because.rationale,
      },
      evidence: {
        signalIds: signalIds.slice(0, 50),
        expectationId: expectationId,
      },
      strength: 1.0, // Contradictions are important by default
    };
    
    contradictionFinding = upsertFinding(finding);
    console.log(`[Expectations] Contradiction recorded: ${finding.subject} ${finding.predicate} ${finding.object}`);
  }
  
  return { wasCorrect, contradictionFinding };
}

/**
 * Get pending expectations that are due
 */
export function getPendingExpectations(subjectFilter?: ExpectationSubject): Expectation[] {
  const db = getDb();
  ensureExpectationsTable(db);
  
  let sql = "SELECT * FROM expectations WHERE status = 'pending'";
  const params: any[] = [];
  
  if (subjectFilter) {
    sql += " AND subject = ?";
    params.push(subjectFilter);
  }
  
  sql += " ORDER BY due_by ASC";
  
  const rows = db.prepare(sql).all(...params) as any[];
  db.close();
  
  return rows.map(row => ({
    id: row.id,
    subject: row.subject as ExpectationSubject,
    expected: JSON.parse(row.expected),
    because: JSON.parse(row.because),
    context: JSON.parse(row.context || "{}"),
    dueBy: row.due_by,
    status: row.status as "pending" | "evaluated" | "expired",
    observedValue: row.observed_value ?? undefined,
    wasCorrect: row.was_correct === 1 ? true : row.was_correct === 0 ? false : undefined,
    evaluatedAt: row.evaluated_at ?? undefined,
    createdAt: row.created_at,
  }));
}

/**
 * Get overdue expectations (due_by has passed but still pending)
 */
export function getOverdueExpectations(): Expectation[] {
  const db = getDb();
  ensureExpectationsTable(db);
  
  const now = new Date().toISOString();
  
  const rows = db.prepare(`
    SELECT * FROM expectations
    WHERE status = 'pending' AND due_by < ?
    ORDER BY due_by ASC
  `).all(now) as any[];
  
  db.close();
  
  return rows.map(row => ({
    id: row.id,
    subject: row.subject as ExpectationSubject,
    expected: JSON.parse(row.expected),
    because: JSON.parse(row.because),
    context: JSON.parse(row.context || "{}"),
    dueBy: row.due_by,
    status: row.status as "pending" | "evaluated" | "expired",
    observedValue: row.observed_value ?? undefined,
    wasCorrect: row.was_correct === 1 ? true : row.was_correct === 0 ? false : undefined,
    evaluatedAt: row.evaluated_at ?? undefined,
    createdAt: row.created_at,
  }));
}

/**
 * Expire old pending expectations
 */
export function expireOldExpectations(hours: number = 48): number {
  const db = getDb();
  ensureExpectationsTable(db);
  
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  
  const result = db.prepare(`
    UPDATE expectations
    SET status = 'expired'
    WHERE status = 'pending' AND due_by < ?
  `).run(cutoff);
  
  db.close();
  return result.changes;
}

/**
 * Get calibration score: how often expectations match observations
 */
export function getCalibrationScore(): { score: number; total: number; correct: number } {
  const db = getDb();
  ensureExpectationsTable(db);
  
  const evaluated = db.prepare(`
    SELECT COUNT(*) as total, SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) as correct
    FROM expectations
    WHERE status = 'evaluated'
  `).get() as any;
  
  db.close();
  
  const total = evaluated.total || 0;
  const correct = evaluated.correct || 0;
  const score = total > 0 ? correct / total : 0;
  
  return { score, total, correct };
}

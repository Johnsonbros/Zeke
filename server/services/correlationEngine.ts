/**
 * Correlation Engine
 * 
 * Cross-domain pattern discovery per ZEKE_IDEAL.md Pillar 1 (Self-Understanding).
 * Finds connections between domains: sleep, energy, mood, location, tasks, stressors.
 * 
 * Key principle: Correlations reveal hidden patterns that single-domain analysis misses.
 */

import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";

const DB_PATH = path.join(process.cwd(), "zeke.db");

/**
 * Generate deterministic ID for a correlation based on domains
 * This ensures the same correlation pair always has the same ID for tracking
 */
function generateCorrelationId(domain1: CorrelationDomain, domain2: CorrelationDomain): string {
  const sortedDomains = [domain1, domain2].sort().join("_");
  return crypto.createHash("sha256").update(sortedDomains).digest("hex").substring(0, 16);
}

function getDb(): Database.Database {
  return new Database(DB_PATH);
}

// Domain types that can be correlated
export type CorrelationDomain = 
  | "energy"
  | "mood"
  | "location"
  | "tasks"
  | "sleep"
  | "stressors"
  | "calendar"
  | "food"
  | "social"
  | "weather";

export interface CorrelationResult {
  id: string;
  domain1: CorrelationDomain;
  domain2: CorrelationDomain;
  description: string;
  strength: number; // -1 to 1 (negative = inverse correlation)
  confidence: number; // 0 to 1
  sampleSize: number;
  examples: CorrelationExample[];
  hypothesis: string;
  actionableInsight?: string;
  discoveredAt: string;
}

export interface CorrelationExample {
  date: string;
  domain1Value: string;
  domain2Value: string;
  note?: string;
}

export interface DomainSnapshot {
  domain: CorrelationDomain;
  date: string;
  value: number | string;
  metadata?: Record<string, any>;
}

// Ensure correlation_discoveries table exists
function ensureCorrelationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS correlation_discoveries (
      id TEXT PRIMARY KEY,
      domain1 TEXT NOT NULL,
      domain2 TEXT NOT NULL,
      description TEXT NOT NULL,
      strength REAL NOT NULL,
      confidence REAL NOT NULL,
      sample_size INTEGER NOT NULL,
      examples TEXT,
      hypothesis TEXT NOT NULL,
      actionable_insight TEXT,
      is_validated INTEGER DEFAULT 0,
      validation_feedback TEXT,
      discovered_at TEXT NOT NULL,
      last_checked_at TEXT,
      created_at TEXT NOT NULL
    )
  `);
  
  // Separate table for correlation history (tracking changes over time)
  db.exec(`
    CREATE TABLE IF NOT EXISTS correlation_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      correlation_id TEXT NOT NULL,
      strength REAL NOT NULL,
      confidence REAL NOT NULL,
      sample_size INTEGER NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `);
}

/**
 * Get daily energy levels from journal entries
 */
function getEnergyData(db: Database.Database, days: number = 30): DomainSnapshot[] {
  const results: DomainSnapshot[] = [];
  
  try {
    const rows = db.prepare(`
      SELECT date, metrics FROM journal_entries 
      WHERE date >= date('now', '-' || ? || ' days')
      ORDER BY date DESC
    `).all(days) as any[];
    
    for (const row of rows) {
      if (row.metrics) {
        try {
          const metrics = JSON.parse(row.metrics);
          if (metrics.energy !== undefined) {
            results.push({
              domain: "energy",
              date: row.date,
              value: metrics.energy,
            });
          }
        } catch (e) {
          console.warn(`[CorrelationEngine] Failed to parse metrics for date ${row.date}:`, e);
        }
      }
    }
    console.log(`[CorrelationEngine] Energy data: ${results.length} data points from ${days} days`);
  } catch (e) {
    console.error("[CorrelationEngine] Failed to fetch energy data:", e);
  }
  
  return results;
}

/**
 * Get mood data from journal entries
 */
function getMoodData(db: Database.Database, days: number = 30): DomainSnapshot[] {
  const results: DomainSnapshot[] = [];
  
  try {
    const rows = db.prepare(`
      SELECT date, mood FROM journal_entries 
      WHERE date >= date('now', '-' || ? || ' days') AND mood IS NOT NULL
      ORDER BY date DESC
    `).all(days) as any[];
    
    for (const row of rows) {
      const moodScore = moodToScore(row.mood);
      if (moodScore !== null) {
        results.push({
          domain: "mood",
          date: row.date,
          value: moodScore,
          metadata: { raw: row.mood },
        });
      }
    }
    console.log(`[CorrelationEngine] Mood data: ${results.length} data points from ${days} days`);
  } catch (e) {
    console.error("[CorrelationEngine] Failed to fetch mood data:", e);
  }
  
  return results;
}

/**
 * Convert mood string to numeric score
 */
function moodToScore(mood: string): number | null {
  const moodMap: Record<string, number> = {
    "excellent": 10, "great": 9, "good": 7, "okay": 5, "fine": 5,
    "neutral": 5, "tired": 4, "stressed": 3, "bad": 2, "terrible": 1,
    "anxious": 3, "frustrated": 3, "overwhelmed": 2, "exhausted": 2,
    "happy": 8, "content": 7, "productive": 8, "focused": 8,
  };
  
  const lower = mood?.toLowerCase() || "";
  for (const [key, score] of Object.entries(moodMap)) {
    if (lower.includes(key)) return score;
  }
  return null;
}

/**
 * Get task completion data
 */
function getTaskData(db: Database.Database, days: number = 30): DomainSnapshot[] {
  const results: DomainSnapshot[] = [];
  
  try {
    const rows = db.prepare(`
      SELECT 
        date(completed_at) as date,
        COUNT(*) as completed_count
      FROM tasks 
      WHERE completed_at IS NOT NULL 
        AND date(completed_at) >= date('now', '-' || ? || ' days')
      GROUP BY date(completed_at)
      ORDER BY date DESC
    `).all(days) as any[];
    
    for (const row of rows) {
      results.push({
        domain: "tasks",
        date: row.date,
        value: row.completed_count,
      });
    }
    console.log(`[CorrelationEngine] Task data: ${results.length} data points from ${days} days`);
  } catch (e) {
    console.error("[CorrelationEngine] Failed to fetch task data:", e);
  }
  
  return results;
}

/**
 * Get stressor trigger data
 */
function getStressorData(db: Database.Database, days: number = 30): DomainSnapshot[] {
  const results: DomainSnapshot[] = [];
  
  try {
    const rows = db.prepare(`
      SELECT * FROM stressors 
      WHERE last_triggered_at IS NOT NULL 
        AND date(last_triggered_at) >= date('now', '-' || ? || ' days')
      ORDER BY last_triggered_at DESC
    `).all(days) as any[];
    
    // Group by date
    const byDate: Record<string, number> = {};
    for (const row of rows) {
      const date = row.last_triggered_at?.split("T")[0];
      if (date) {
        byDate[date] = (byDate[date] || 0) + (row.severity || 5);
      }
    }
    
    for (const [date, severity] of Object.entries(byDate)) {
      results.push({
        domain: "stressors",
        date,
        value: severity,
      });
    }
    console.log(`[CorrelationEngine] Stressor data: ${results.length} data points from ${days} days`);
  } catch (e) {
    console.error("[CorrelationEngine] Failed to fetch stressor data:", e);
  }
  
  return results;
}

/**
 * Get location variety data (unique places visited per day)
 */
function getLocationData(db: Database.Database, days: number = 30): DomainSnapshot[] {
  const results: DomainSnapshot[] = [];
  
  try {
    const rows = db.prepare(`
      SELECT 
        date(arrival_time) as date,
        COUNT(DISTINCT saved_place_id) as unique_places,
        SUM(duration_minutes) as total_minutes
      FROM location_visits 
      WHERE arrival_time IS NOT NULL 
        AND date(arrival_time) >= date('now', '-' || ? || ' days')
      GROUP BY date(arrival_time)
      ORDER BY date DESC
    `).all(days) as any[];
    
    for (const row of rows) {
      results.push({
        domain: "location",
        date: row.date,
        value: row.unique_places || 0,
        metadata: { totalMinutes: row.total_minutes },
      });
    }
    console.log(`[CorrelationEngine] Location data: ${results.length} data points from ${days} days`);
  } catch (e) {
    console.error("[CorrelationEngine] Failed to fetch location data:", e);
  }
  
  return results;
}

/**
 * Calculate Pearson correlation coefficient between two arrays
 */
function calculateCorrelation(x: number[], y: number[]): { r: number; n: number } {
  if (x.length !== y.length || x.length < 3) {
    return { r: 0, n: 0 };
  }
  
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
  const sumX2 = x.reduce((total, xi) => total + xi * xi, 0);
  const sumY2 = y.reduce((total, yi) => total + yi * yi, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  if (denominator === 0) return { r: 0, n };
  
  return { r: numerator / denominator, n };
}

/**
 * Find correlations between two domains
 */
function findDomainCorrelation(
  data1: DomainSnapshot[],
  data2: DomainSnapshot[],
  domain1: CorrelationDomain,
  domain2: CorrelationDomain
): CorrelationResult | null {
  // Match by date
  const dateMap1 = new Map(data1.map(d => [d.date, d]));
  const dateMap2 = new Map(data2.map(d => [d.date, d]));
  
  const paired: { date: string; v1: number; v2: number; d1: DomainSnapshot; d2: DomainSnapshot }[] = [];
  
  for (const [date, d1] of dateMap1) {
    const d2 = dateMap2.get(date);
    if (d2 && typeof d1.value === "number" && typeof d2.value === "number") {
      paired.push({ date, v1: d1.value, v2: d2.value, d1, d2 });
    }
  }
  
  if (paired.length < 5) return null; // Need minimum sample size
  
  const { r, n } = calculateCorrelation(
    paired.map(p => p.v1),
    paired.map(p => p.v2)
  );
  
  // Only report meaningful correlations (|r| > 0.3)
  if (Math.abs(r) < 0.3) return null;
  
  // Calculate confidence based on sample size and correlation strength
  const confidence = Math.min(1, (n / 20) * Math.abs(r));
  
  // Generate examples (most extreme cases)
  const sorted = [...paired].sort((a, b) => Math.abs(b.v1 * b.v2) - Math.abs(a.v1 * a.v2));
  const examples: CorrelationExample[] = sorted.slice(0, 3).map(p => ({
    date: p.date,
    domain1Value: String(p.v1),
    domain2Value: String(p.v2),
  }));
  
  // Generate hypothesis
  const direction = r > 0 ? "positive" : "negative";
  const strength = Math.abs(r) > 0.7 ? "strong" : Math.abs(r) > 0.5 ? "moderate" : "weak";
  const hypothesis = generateHypothesis(domain1, domain2, r);
  const actionableInsight = generateInsight(domain1, domain2, r);
  
  return {
    id: generateCorrelationId(domain1, domain2),
    domain1,
    domain2,
    description: `${strength} ${direction} correlation between ${domain1} and ${domain2}`,
    strength: r,
    confidence,
    sampleSize: n,
    examples,
    hypothesis,
    actionableInsight,
    discoveredAt: new Date().toISOString(),
  };
}

/**
 * Generate hypothesis for a correlation
 */
function generateHypothesis(domain1: CorrelationDomain, domain2: CorrelationDomain, r: number): string {
  const hypotheses: Record<string, string> = {
    "energy_mood": r > 0 
      ? "Higher energy levels may contribute to better mood, or positive mood may increase perceived energy"
      : "Energy expenditure may affect mood negatively, possibly indicating overexertion",
    "energy_tasks": r > 0
      ? "More energy enables higher task completion, creating a productivity-energy virtuous cycle"
      : "High task loads may drain energy, suggesting need for better pacing",
    "mood_tasks": r > 0
      ? "Positive mood enhances productivity, or task completion boosts mood satisfaction"
      : "Task pressure may negatively impact mood",
    "stressors_energy": r > 0
      ? "Unexpected: stress correlates with energy - possibly challenge-driven activation"
      : "Stress depletes energy reserves as expected",
    "stressors_mood": r > 0
      ? "Unexpected: stress correlates with positive mood - possibly eustress or challenge satisfaction"
      : "Stress negatively impacts emotional state as expected",
    "location_energy": r > 0
      ? "Movement and variety of places visited correlates with energy - novelty may be energizing"
      : "Staying in fewer locations correlates with higher energy - stability may be restorative",
    "location_mood": r > 0
      ? "Visiting more places correlates with better mood - social engagement or novelty effect"
      : "Fewer location changes correlates with better mood - routine may be comforting",
  };
  
  const key = `${domain1}_${domain2}`;
  const reverseKey = `${domain2}_${domain1}`;
  
  return hypotheses[key] || hypotheses[reverseKey] || 
    `Observed ${r > 0 ? "positive" : "negative"} relationship between ${domain1} and ${domain2} warrants further investigation`;
}

/**
 * Generate actionable insight from correlation
 */
function generateInsight(domain1: CorrelationDomain, domain2: CorrelationDomain, r: number): string {
  if (domain1 === "energy" && domain2 === "tasks" && r < 0) {
    return "Consider spreading tasks across days to prevent energy depletion";
  }
  if ((domain1 === "stressors" || domain2 === "stressors") && r < -0.5) {
    return "Stress reduction should be prioritized to preserve energy/mood";
  }
  if ((domain1 === "location" || domain2 === "location") && r > 0.5) {
    return "Variety in daily locations may be beneficial - consider scheduling more diverse activities";
  }
  if (domain1 === "mood" && domain2 === "tasks" && r > 0.5) {
    return "Mood and productivity reinforce each other - starting the day positively may have compounding benefits";
  }
  return "Monitor this relationship for patterns that could inform daily decisions";
}

/**
 * Run full correlation analysis across all domains
 */
export async function runCorrelationAnalysis(days: number = 30): Promise<CorrelationResult[]> {
  const db = getDb();
  try {
    ensureCorrelationsTable(db);
    
    // Gather data from all domains
    const energyData = getEnergyData(db, days);
    const moodData = getMoodData(db, days);
    const taskData = getTaskData(db, days);
    const stressorData = getStressorData(db, days);
    const locationData = getLocationData(db, days);
    
    const domains: { name: CorrelationDomain; data: DomainSnapshot[] }[] = [
      { name: "energy", data: energyData },
      { name: "mood", data: moodData },
      { name: "tasks", data: taskData },
      { name: "stressors", data: stressorData },
      { name: "location", data: locationData },
    ];
    
    const results: CorrelationResult[] = [];
    
    // Find correlations between all pairs
    for (let i = 0; i < domains.length; i++) {
      for (let j = i + 1; j < domains.length; j++) {
        const correlation = findDomainCorrelation(
          domains[i].data,
          domains[j].data,
          domains[i].name,
          domains[j].name
        );
        
        if (correlation) {
          results.push(correlation);
          
          // Store in database
          saveCorrelation(db, correlation);
        }
      }
    }
    
    console.log(`[CorrelationEngine] Found ${results.length} significant correlations across ${domains.length} domains`);
    
    return results;
  } finally {
    db.close();
  }
}

/**
 * Save a correlation discovery to the database
 */
function saveCorrelation(db: Database.Database, correlation: CorrelationResult): void {
  const now = new Date().toISOString();
  
  // Check if this correlation already exists
  const existing = db.prepare(`SELECT * FROM correlation_discoveries WHERE id = ?`).get(correlation.id) as any;
  
  if (existing) {
    // Update the existing correlation but preserve original discovery date
    db.prepare(`
      UPDATE correlation_discoveries SET
        description = ?,
        strength = ?,
        confidence = ?,
        sample_size = ?,
        examples = ?,
        hypothesis = ?,
        actionable_insight = ?,
        last_checked_at = ?
      WHERE id = ?
    `).run(
      correlation.description,
      correlation.strength,
      correlation.confidence,
      correlation.sampleSize,
      JSON.stringify(correlation.examples),
      correlation.hypothesis,
      correlation.actionableInsight || null,
      now,
      correlation.id
    );
    
    // Record in history for trend tracking
    db.prepare(`
      INSERT INTO correlation_history (correlation_id, strength, confidence, sample_size, recorded_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      correlation.id,
      correlation.strength,
      correlation.confidence,
      correlation.sampleSize,
      now
    );
    
    console.log(`[CorrelationEngine] Updated correlation ${correlation.id} (${correlation.domain1}-${correlation.domain2})`);
  } else {
    // Insert new correlation
    db.prepare(`
      INSERT INTO correlation_discoveries 
      (id, domain1, domain2, description, strength, confidence, sample_size, 
       examples, hypothesis, actionable_insight, discovered_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      correlation.id,
      correlation.domain1,
      correlation.domain2,
      correlation.description,
      correlation.strength,
      correlation.confidence,
      correlation.sampleSize,
      JSON.stringify(correlation.examples),
      correlation.hypothesis,
      correlation.actionableInsight || null,
      correlation.discoveredAt,
      now
    );
    
    // Record initial history entry
    db.prepare(`
      INSERT INTO correlation_history (correlation_id, strength, confidence, sample_size, recorded_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      correlation.id,
      correlation.strength,
      correlation.confidence,
      correlation.sampleSize,
      now
    );
    
    console.log(`[CorrelationEngine] Discovered new correlation ${correlation.id} (${correlation.domain1}-${correlation.domain2})`);
  }
}

/**
 * Get all discovered correlations
 */
export async function getCorrelations(options?: {
  domain?: CorrelationDomain;
  minStrength?: number;
  limit?: number;
}): Promise<CorrelationResult[]> {
  const db = getDb();
  try {
    ensureCorrelationsTable(db);
    
    let query = `SELECT * FROM correlation_discoveries WHERE 1=1`;
    const params: any[] = [];
    
    if (options?.domain) {
      query += ` AND (domain1 = ? OR domain2 = ?)`;
      params.push(options.domain, options.domain);
    }
    
    if (options?.minStrength) {
      query += ` AND ABS(strength) >= ?`;
      params.push(options.minStrength);
    }
    
    query += ` ORDER BY ABS(strength) DESC, confidence DESC`;
    
    if (options?.limit) {
      query += ` LIMIT ?`;
      params.push(options.limit);
    }
    
    const rows = db.prepare(query).all(...params) as any[];
    
    return rows.map(row => ({
      id: row.id,
      domain1: row.domain1,
      domain2: row.domain2,
      description: row.description,
      strength: row.strength,
      confidence: row.confidence,
      sampleSize: row.sample_size,
      examples: row.examples ? JSON.parse(row.examples) : [],
      hypothesis: row.hypothesis,
      actionableInsight: row.actionable_insight,
      discoveredAt: row.discovered_at,
    }));
  } finally {
    db.close();
  }
}

/**
 * Get correlation summary statistics
 */
export async function getCorrelationStats(): Promise<{
  totalCorrelations: number;
  strongCorrelations: number;
  domainCoverage: CorrelationDomain[];
  topInsights: string[];
}> {
  const db = getDb();
  try {
    ensureCorrelationsTable(db);
    
    const all = db.prepare(`SELECT * FROM correlation_discoveries`).all() as any[];
    
    const domains = new Set<CorrelationDomain>();
    const insights: string[] = [];
    let strong = 0;
    
    for (const row of all) {
      domains.add(row.domain1);
      domains.add(row.domain2);
      if (Math.abs(row.strength) > 0.5) strong++;
      if (row.actionable_insight) insights.push(row.actionable_insight);
    }
    
    return {
      totalCorrelations: all.length,
      strongCorrelations: strong,
      domainCoverage: Array.from(domains),
      topInsights: insights.slice(0, 5),
    };
  } finally {
    db.close();
  }
}

/**
 * Validate a correlation with user feedback
 */
export async function validateCorrelation(
  id: string,
  isValid: boolean,
  feedback?: string
): Promise<void> {
  const db = getDb();
  try {
    ensureCorrelationsTable(db);
    
    db.prepare(`
      UPDATE correlation_discoveries 
      SET is_validated = ?, validation_feedback = ?, last_checked_at = ?
      WHERE id = ?
    `).run(isValid ? 1 : 0, feedback || null, new Date().toISOString(), id);
    
    console.log(`[CorrelationEngine] Correlation ${id} validated as ${isValid ? "accurate" : "inaccurate"}`);
  } finally {
    db.close();
  }
}

export default {
  runCorrelationAnalysis,
  getCorrelations,
  getCorrelationStats,
  validateCorrelation,
};

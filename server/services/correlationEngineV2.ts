/**
 * Correlation Engine V2
 * 
 * Cross-domain pattern discovery using proper statistics (Pearson r).
 * Keep AI for synthesis/explanation, use deterministic math for discovery.
 * 
 * Evidence gates:
 * - n >= 20 (minimum sample size)
 * - |r| >= 0.25 (minimum correlation strength)
 */

import { computeDailyAggregates, type DailyAggregate, querySignals, type SignalDomain } from "./signals";
import { upsertFinding, type InsertFinding } from "./findings";

export interface CorrelationResult {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  lagDays: number;
  r: number;
  n: number;
  direction: "up" | "down";
  strength: number;
  signalIds: string[];
}

/**
 * Calculate Pearson correlation coefficient
 */
function pearson(x: number[], y: number[]): { r: number; n: number } {
  const n = Math.min(x.length, y.length);
  if (n < 10) return { r: 0, n }; // Guardrail
  
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  
  let num = 0;
  let dx = 0;
  let dy = 0;
  
  for (let i = 0; i < n; i++) {
    const vx = x[i] - mx;
    const vy = y[i] - my;
    num += vx * vy;
    dx += vx * vx;
    dy += vy * vy;
  }
  
  const denom = Math.sqrt(dx * dy);
  const r = denom === 0 ? 0 : num / denom;
  
  return { r, n };
}

/**
 * Calculate lagged correlation between two metrics
 * Returns actual signal IDs for citation
 */
function lagCorrelation(
  daily: DailyAggregate[],
  xGetter: (d: DailyAggregate) => number | undefined,
  yGetter: (d: DailyAggregate) => number | undefined,
  lagDays: number
): { r: number; n: number; pairs: Array<{ day: string; x: number; y: number }>; signalIds: string[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  const pairs: Array<{ day: string; x: number; y: number }> = [];
  const signalIds: string[] = [];
  
  for (let i = 0; i < daily.length; i++) {
    const j = i + lagDays;
    if (j >= daily.length) break;
    
    const xVal = xGetter(daily[i]);
    const yVal = yGetter(daily[j]);
    
    if (xVal !== undefined && yVal !== undefined) {
      xs.push(xVal);
      ys.push(yVal);
      pairs.push({ day: daily[j].day, x: xVal, y: yVal });
      // Collect actual signal IDs from both days
      signalIds.push(...daily[i].signalIds.slice(0, 5));
      signalIds.push(...daily[j].signalIds.slice(0, 5));
    }
  }
  
  const { r, n } = pearson(xs, ys);
  return { r, n, pairs, signalIds };
}

// Evidence gates
const MIN_SAMPLE_SIZE = 20;
const MIN_CORRELATION = 0.25;

/**
 * Discover energy-task correlation
 * "Your energy drops N days after high task volume"
 */
export function discoverEnergyTasksCorrelation(lagDays: number = 1): CorrelationResult | null {
  const daily = computeDailyAggregates();
  
  const { r, n, pairs, signalIds } = lagCorrelation(
    daily,
    d => d.tasks,
    d => d.energy,
    lagDays
  );
  
  // Evidence gates
  if (n < MIN_SAMPLE_SIZE) {
    console.log(`[CorrelationV2] energy-tasks: n=${n} < ${MIN_SAMPLE_SIZE}, skipping`);
    return null;
  }
  
  if (Math.abs(r) < MIN_CORRELATION) {
    console.log(`[CorrelationV2] energy-tasks: |r|=${Math.abs(r).toFixed(3)} < ${MIN_CORRELATION}, skipping`);
    return null;
  }
  
  // Strength heuristic: |r| * log10(n)
  const strength = Math.abs(r) * Math.log10(Math.max(n, 10));
  
  // Use actual signal IDs for citations (deduplicated, limited to 50)
  const uniqueSignalIds = [...new Set(signalIds)].slice(0, 50);
  
  const finding: InsertFinding = {
    kind: "correlation",
    subject: "energy",
    predicate: "changes_after",
    object: "high_task_volume",
    window: { lagDays },
    stats: { r: parseFloat(r.toFixed(4)), n, direction: r < 0 ? "down" : "up" },
    evidence: { signalIds: uniqueSignalIds },
    strength,
  };
  
  const result = upsertFinding(finding);
  
  console.log(`[CorrelationV2] energy-tasks: r=${r.toFixed(3)}, n=${n}, lag=${lagDays}d, direction=${r < 0 ? "down" : "up"}`);
  
  return {
    id: result.id,
    subject: "energy",
    predicate: "changes_after",
    object: "high_task_volume",
    lagDays,
    r,
    n,
    direction: r < 0 ? "down" : "up",
    strength,
    signalIds: uniqueSignalIds,
  };
}

/**
 * Discover mood-stressor correlation
 */
export function discoverMoodStressorCorrelation(lagDays: number = 0): CorrelationResult | null {
  const daily = computeDailyAggregates();
  
  const { r, n, pairs, signalIds } = lagCorrelation(
    daily,
    d => d.stressorCount,
    d => d.mood,
    lagDays
  );
  
  if (n < MIN_SAMPLE_SIZE || Math.abs(r) < MIN_CORRELATION) {
    console.log(`[CorrelationV2] mood-stressors: n=${n}, |r|=${Math.abs(r).toFixed(3)}, skipping`);
    return null;
  }
  
  const strength = Math.abs(r) * Math.log10(Math.max(n, 10));
  const uniqueSignalIds = [...new Set(signalIds)].slice(0, 50);
  
  const finding: InsertFinding = {
    kind: "correlation",
    subject: "mood",
    predicate: "changes_with",
    object: "stressor_count",
    window: { lagDays },
    stats: { r: parseFloat(r.toFixed(4)), n, direction: r < 0 ? "down" : "up" },
    evidence: { signalIds: uniqueSignalIds },
    strength,
  };
  
  const result = upsertFinding(finding);
  
  console.log(`[CorrelationV2] mood-stressors: r=${r.toFixed(3)}, n=${n}, direction=${r < 0 ? "down" : "up"}`);
  
  return {
    id: result.id,
    subject: "mood",
    predicate: "changes_with",
    object: "stressor_count",
    lagDays,
    r,
    n,
    direction: r < 0 ? "down" : "up",
    strength,
    signalIds: uniqueSignalIds,
  };
}

/**
 * Discover energy-meeting correlation
 */
export function discoverEnergyMeetingsCorrelation(lagDays: number = 0): CorrelationResult | null {
  const daily = computeDailyAggregates();
  
  const { r, n, pairs, signalIds } = lagCorrelation(
    daily,
    d => d.meetingCount,
    d => d.energy,
    lagDays
  );
  
  if (n < MIN_SAMPLE_SIZE || Math.abs(r) < MIN_CORRELATION) {
    console.log(`[CorrelationV2] energy-meetings: n=${n}, |r|=${Math.abs(r).toFixed(3)}, skipping`);
    return null;
  }
  
  const strength = Math.abs(r) * Math.log10(Math.max(n, 10));
  const uniqueSignalIds = [...new Set(signalIds)].slice(0, 50);
  
  const finding: InsertFinding = {
    kind: "correlation",
    subject: "energy",
    predicate: "changes_with",
    object: "meeting_count",
    window: { lagDays },
    stats: { r: parseFloat(r.toFixed(4)), n, direction: r < 0 ? "down" : "up" },
    evidence: { signalIds: uniqueSignalIds },
    strength,
  };
  
  const result = upsertFinding(finding);
  
  console.log(`[CorrelationV2] energy-meetings: r=${r.toFixed(3)}, n=${n}`);
  
  return {
    id: result.id,
    subject: "energy",
    predicate: "changes_with",
    object: "meeting_count",
    lagDays,
    r,
    n,
    direction: r < 0 ? "down" : "up",
    strength,
    signalIds: uniqueSignalIds,
  };
}

/**
 * Discover mood-tasks correlation
 */
export function discoverMoodTasksCorrelation(lagDays: number = 0): CorrelationResult | null {
  const daily = computeDailyAggregates();
  
  const { r, n, pairs, signalIds } = lagCorrelation(
    daily,
    d => d.tasks,
    d => d.mood,
    lagDays
  );
  
  if (n < MIN_SAMPLE_SIZE || Math.abs(r) < MIN_CORRELATION) {
    console.log(`[CorrelationV2] mood-tasks: n=${n}, |r|=${Math.abs(r).toFixed(3)}, skipping`);
    return null;
  }
  
  const strength = Math.abs(r) * Math.log10(Math.max(n, 10));
  const uniqueSignalIds = [...new Set(signalIds)].slice(0, 50);
  
  const finding: InsertFinding = {
    kind: "correlation",
    subject: "mood",
    predicate: "changes_with",
    object: "task_completion",
    window: { lagDays },
    stats: { r: parseFloat(r.toFixed(4)), n, direction: r < 0 ? "down" : "up" },
    evidence: { signalIds: uniqueSignalIds },
    strength,
  };
  
  const result = upsertFinding(finding);
  
  console.log(`[CorrelationV2] mood-tasks: r=${r.toFixed(3)}, n=${n}`);
  
  return {
    id: result.id,
    subject: "mood",
    predicate: "changes_with",
    object: "task_completion",
    lagDays,
    r,
    n,
    direction: r < 0 ? "down" : "up",
    strength,
    signalIds: uniqueSignalIds,
  };
}

/**
 * Run all correlation discoveries
 * Returns array of discovered correlations (only those passing evidence gates)
 */
export function runCorrelationDiscovery(): CorrelationResult[] {
  console.log("[CorrelationV2] Starting correlation discovery run...");
  
  const results: CorrelationResult[] = [];
  
  // Try different lag windows for energy-tasks
  for (const lag of [0, 1, 2, 3]) {
    const result = discoverEnergyTasksCorrelation(lag);
    if (result) results.push(result);
  }
  
  // Mood-stressor (same-day and next-day)
  for (const lag of [0, 1]) {
    const result = discoverMoodStressorCorrelation(lag);
    if (result) results.push(result);
  }
  
  // Energy-meetings
  const energyMeetings = discoverEnergyMeetingsCorrelation(0);
  if (energyMeetings) results.push(energyMeetings);
  
  // Mood-tasks
  const moodTasks = discoverMoodTasksCorrelation(0);
  if (moodTasks) results.push(moodTasks);
  
  console.log(`[CorrelationV2] Discovery complete: ${results.length} correlations found`);
  
  return results;
}

/**
 * Get correlation summary for self-understanding queries
 */
export function getCorrelationSummary(): {
  totalDiscovered: number;
  strongestCorrelations: Array<{ subject: string; object: string; r: number; direction: string }>;
} {
  const { getFindings } = require("./findings");
  
  const correlations = getFindings({
    kind: "correlation",
    status: "active",
    limit: 10,
  });
  
  return {
    totalDiscovered: correlations.length,
    strongestCorrelations: correlations.map((f: any) => ({
      subject: f.subject,
      object: f.object,
      r: f.stats.r,
      direction: f.stats.direction,
    })),
  };
}

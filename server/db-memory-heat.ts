/**
 * Memory Heat & Access Tracking
 * Functions to track memory access, boost/downweight heat based on feedback
 */

import Database from "better-sqlite3";

const db = new Database("zeke.db");

/**
 * Increment access count when memory is retrieved
 */
export function incrementMemoryAccess(memoryId: string): void {
  try {
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE memory_notes
      SET access_count = access_count + 1,
          last_accessed_at = ?
      WHERE id = ?
    `).run(now, memoryId);
  } catch (error) {
    console.error("[MemoryHeat] Failed to increment access:", error);
  }
}

/**
 * Boost memory heat on positive feedback (👍)
 */
export function boostMemoryHeat(memoryId: string, boost: number = 0.1): void {
  try {
    const current = db.prepare(`
      SELECT heat_score FROM memory_notes WHERE id = ?
    `).get(memoryId) as any;

    if (!current) return;

    const oldHeat = parseFloat(current.heat_score || "0.5");
    const newHeat = Math.min(oldHeat + boost, 1.0);

    db.prepare(`
      UPDATE memory_notes
      SET heat_score = ?,
          updated_at = ?
      WHERE id = ?
    `).run(newHeat.toString(), new Date().toISOString(), memoryId);

    console.log(`[MemoryHeat] Boosted ${memoryId}: ${oldHeat.toFixed(2)} → ${newHeat.toFixed(2)}`);
  } catch (error) {
    console.error("[MemoryHeat] Failed to boost memory:", error);
  }
}

/**
 * Downweight memory heat on negative feedback (👎)
 */
export function downweightMemoryHeat(memoryId: string, penalty: number = 0.1): void {
  try {
    const current = db.prepare(`
      SELECT heat_score FROM memory_notes WHERE id = ?
    `).get(memoryId) as any;

    if (!current) return;

    const oldHeat = parseFloat(current.heat_score || "0.5");
    const newHeat = Math.max(oldHeat - penalty, 0.0);

    db.prepare(`
      UPDATE memory_notes
      SET heat_score = ?,
          updated_at = ?
      WHERE id = ?
    `).run(newHeat.toString(), new Date().toISOString(), memoryId);

    console.log(`[MemoryHeat] Downweighted ${memoryId}: ${oldHeat.toFixed(2)} → ${newHeat.toFixed(2)}`);
  } catch (error) {
    console.error("[MemoryHeat] Failed to downweight memory:", error);
  }
}

/**
 * Mark memory as inactive (for weekly prune)
 */
export function markMemoryInactive(memoryId: string): void {
  try {
    db.prepare(`
      UPDATE memory_notes
      SET is_active = 0,
          updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), memoryId);
  } catch (error) {
    console.error("[MemoryHeat] Failed to mark memory inactive:", error);
  }
}

/**
 * Weekly prune: Archive low-heat, old memories
 */
export function pruneOldLowHeatMemories(): number {
  try {
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const heatThreshold = 0.2;

    const result = db.prepare(`
      UPDATE memory_notes
      SET is_active = 0
      WHERE is_active = 1
        AND heat_score < ?
        AND created_at < ?
        AND type != 'preference'
    `).run(heatThreshold.toString(), oneMonthAgo);

    const pruned = (result as any).changes || 0;
    console.log(`[MemoryHeat] Pruned ${pruned} low-heat memories older than 1 month`);
    return pruned;
  } catch (error) {
    console.error("[MemoryHeat] Prune failed:", error);
    return 0;
  }
}

/**
 * Batch boost memories (for response feedback)
 */
export function boostMemoriesByIds(memoryIds: string[]): void {
  for (const id of memoryIds) {
    boostMemoryHeat(id, 0.05);
  }
}

/**
 * Batch downweight memories (for negative response)
 */
export function downweightMemoriesByIds(memoryIds: string[]): void {
  for (const id of memoryIds) {
    downweightMemoryHeat(id, 0.05);
  }
}

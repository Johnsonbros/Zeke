/**
 * Knowledge Graph Backfill Service
 * 
 * Processes existing data to populate the knowledge graph with entity references and links.
 * Run this to backfill historical data or repair graph integrity.
 */

import {
  getAllMemoryNotes,
  getAllTasks,
  getAllContacts,
} from "./db";
import {
  processMemoryForEntities,
  processTaskForEntities,
  processLifelogForEntities,
  extractAllFromText,
  getExtractionSummary,
} from "./entityExtractor";
import { getKnowledgeGraphStats } from "./knowledgeGraph";
import { getRecentLifelogs, type OmiMemoryData } from "./omi";

interface BackfillProgress {
  domain: string;
  total: number;
  processed: number;
  entitiesCreated: number;
  referencesCreated: number;
  errors: number;
  startTime: Date;
  endTime?: Date;
}

interface BackfillResult {
  success: boolean;
  progress: BackfillProgress[];
  totalEntitiesCreated: number;
  totalReferencesCreated: number;
  totalErrors: number;
  durationMs: number;
  graphStats: ReturnType<typeof getKnowledgeGraphStats>;
}

let currentBackfill: BackfillResult | null = null;
let isBackfillRunning = false;

/**
 * Get the current backfill status
 */
export function getBackfillStatus(): { isRunning: boolean; result: BackfillResult | null } {
  return {
    isRunning: isBackfillRunning,
    result: currentBackfill
  };
}

/**
 * Backfill memories into the knowledge graph
 */
async function backfillMemories(): Promise<BackfillProgress> {
  const progress: BackfillProgress = {
    domain: "memories",
    total: 0,
    processed: 0,
    entitiesCreated: 0,
    referencesCreated: 0,
    errors: 0,
    startTime: new Date()
  };

  try {
    const memories = getAllMemoryNotes(true); // Include superseded for complete graph
    progress.total = memories.length;
    console.log(`[GraphBackfill] Processing ${memories.length} memories...`);

    for (const memory of memories) {
      try {
        const result = await processMemoryForEntities(
          memory.id,
          memory.content,
          memory.sourceId || undefined
        );
        progress.entitiesCreated += result.entities.length;
        progress.referencesCreated += result.references.length;
        progress.processed++;

        if (progress.processed % 50 === 0) {
          console.log(`[GraphBackfill] Memories: ${progress.processed}/${progress.total}`);
        }
      } catch (error) {
        console.error(`[GraphBackfill] Error processing memory ${memory.id}:`, error);
        progress.errors++;
      }
    }
  } catch (error) {
    console.error("[GraphBackfill] Error fetching memories:", error);
  }

  progress.endTime = new Date();
  return progress;
}

/**
 * Backfill tasks into the knowledge graph
 */
async function backfillTasks(): Promise<BackfillProgress> {
  const progress: BackfillProgress = {
    domain: "tasks",
    total: 0,
    processed: 0,
    entitiesCreated: 0,
    referencesCreated: 0,
    errors: 0,
    startTime: new Date()
  };

  try {
    const tasks = getAllTasks(true); // Include completed tasks
    progress.total = tasks.length;
    console.log(`[GraphBackfill] Processing ${tasks.length} tasks...`);

    for (const task of tasks) {
      try {
        const result = await processTaskForEntities(
          task.id,
          task.title,
          task.description || undefined
        );
        progress.entitiesCreated += result.entities.length;
        progress.referencesCreated += result.references.length;
        progress.processed++;

        if (progress.processed % 50 === 0) {
          console.log(`[GraphBackfill] Tasks: ${progress.processed}/${progress.total}`);
        }
      } catch (error) {
        console.error(`[GraphBackfill] Error processing task ${task.id}:`, error);
        progress.errors++;
      }
    }
  } catch (error) {
    console.error("[GraphBackfill] Error fetching tasks:", error);
  }

  progress.endTime = new Date();
  return progress;
}

/**
 * Backfill memories into the knowledge graph
 * Note: Memories are fetched from the Omi API, so we get recent ones only
 */
async function backfillLifelogs(): Promise<BackfillProgress> {
  const progress: BackfillProgress = {
    domain: "lifelogs",
    total: 0,
    processed: 0,
    entitiesCreated: 0,
    referencesCreated: 0,
    errors: 0,
    startTime: new Date()
  };

  try {
    // Fetch recent memories from Omi API (last 7 days, up to 100)
    const memories = await getRecentLifelogs(168, 100);
    progress.total = memories.length;
    console.log(`[GraphBackfill] Processing ${memories.length} recent memories...`);

    for (const memory of memories) {
      try {
        // Extract transcript text from memory
        const transcriptText = memory.transcript || memory.structured?.overview || "";
        const result = await processLifelogForEntities(
          memory.id,
          memory.structured?.title || "Untitled",
          transcriptText
        );
        progress.entitiesCreated += result.entities.length;
        progress.referencesCreated += result.references.length;
        progress.processed++;

        if (progress.processed % 10 === 0) {
          console.log(`[GraphBackfill] Memories: ${progress.processed}/${progress.total}`);
        }
      } catch (error) {
        console.error(`[GraphBackfill] Error processing memory ${memory.id}:`, error);
        progress.errors++;
      }
    }
  } catch (error) {
    console.error("[GraphBackfill] Error fetching lifelogs:", error);
  }

  progress.endTime = new Date();
  return progress;
}

/**
 * Preview what the backfill would extract (without writing to DB)
 */
export async function previewBackfill(limit: number = 5): Promise<{
  memories: { id: string; content: string; extraction: string }[];
  tasks: { id: string; title: string; extraction: string }[];
  lifelogs: { id: string; title: string; extraction: string }[];
}> {
  const memories = getAllMemoryNotes(true).slice(0, limit).map(m => ({
    id: m.id,
    content: m.content.substring(0, 100) + (m.content.length > 100 ? "..." : ""),
    extraction: getExtractionSummary(extractAllFromText(m.content))
  }));

  const tasks = getAllTasks(true).slice(0, limit).map(t => ({
    id: t.id,
    title: t.title,
    extraction: getExtractionSummary(extractAllFromText(`${t.title} ${t.description || ""}`))
  }));

  // Fetch recent memories from Omi API
  let lifelogs: { id: string; title: string; extraction: string }[] = [];
  try {
    const recentMemories = await getRecentLifelogs(72, limit);
    lifelogs = recentMemories.map((m: OmiMemoryData) => ({
      id: m.id,
      title: m.structured?.title || "Untitled",
      extraction: getExtractionSummary(extractAllFromText(`${m.structured?.title || ""} ${m.transcript || ""}`))
    }));
  } catch (error) {
    console.log("[GraphBackfill] Could not fetch lifelogs for preview:", error);
  }

  return { memories, tasks, lifelogs };
}

/**
 * Run the full knowledge graph backfill
 */
export async function runBackfill(): Promise<BackfillResult> {
  if (isBackfillRunning) {
    throw new Error("Backfill is already running");
  }

  isBackfillRunning = true;
  const startTime = Date.now();

  console.log("[GraphBackfill] Starting knowledge graph backfill...");
  console.log("[GraphBackfill] Initial graph stats:", getKnowledgeGraphStats());

  const progress: BackfillProgress[] = [];

  try {
    // Process each domain
    progress.push(await backfillMemories());
    progress.push(await backfillTasks());
    progress.push(await backfillLifelogs());

    const totalEntitiesCreated = progress.reduce((sum, p) => sum + p.entitiesCreated, 0);
    const totalReferencesCreated = progress.reduce((sum, p) => sum + p.referencesCreated, 0);
    const totalErrors = progress.reduce((sum, p) => sum + p.errors, 0);

    const result: BackfillResult = {
      success: true,
      progress,
      totalEntitiesCreated,
      totalReferencesCreated,
      totalErrors,
      durationMs: Date.now() - startTime,
      graphStats: getKnowledgeGraphStats()
    };

    currentBackfill = result;
    console.log("[GraphBackfill] Backfill complete!");
    console.log(`[GraphBackfill] Created ${totalEntitiesCreated} entities, ${totalReferencesCreated} references`);
    console.log("[GraphBackfill] Final graph stats:", result.graphStats);

    return result;
  } catch (error) {
    console.error("[GraphBackfill] Backfill failed:", error);
    throw error;
  } finally {
    isBackfillRunning = false;
  }
}

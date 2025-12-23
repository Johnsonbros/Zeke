/**
 * Knowledge Graph Backfill Service
 * 
 * Processes existing data to populate the knowledge graph with entity references and links.
 * Run this to backfill historical data or repair graph integrity.
 * 
 * Supports two modes:
 * 1. Sync mode (runBackfill): Immediate processing using rule-based extraction
 * 2. Batch mode (submitBatchBackfill): Uses OpenAI Batch API for 50% cost savings
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
import { 
  buildKgExtractionBatchRequests, 
  isBatchEnabled,
  getBatchMaxItems,
  type KgExtractionItem 
} from "./services/batchService";
import { createBatchJob, updateBatchJobStatus } from "./db";

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
  const allMemories = await getAllMemoryNotes(true);
  const memories = await Promise.all(
    allMemories.slice(0, limit).map(async m => ({
      id: m.id,
      content: m.content.substring(0, 100) + (m.content.length > 100 ? "..." : ""),
      extraction: getExtractionSummary(await extractAllFromText(m.content))
    }))
  );

  const allTasks = await getAllTasks(true);
  const tasks = await Promise.all(
    allTasks.slice(0, limit).map(async t => ({
      id: t.id,
      title: t.title,
      extraction: getExtractionSummary(await extractAllFromText(`${t.title} ${t.description || ""}`))
    }))
  );

  // Fetch recent memories from Omi API
  let lifelogs: { id: string; title: string; extraction: string }[] = [];
  try {
    const recentMemories = await getRecentLifelogs(72, limit);
    lifelogs = await Promise.all(
      recentMemories.map(async (m: OmiMemoryData) => ({
        id: m.id,
        title: m.structured?.title || "Untitled",
        extraction: getExtractionSummary(await extractAllFromText(`${m.structured?.title || ""} ${m.transcript || ""}`))
      }))
    );
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

// ============================================
// BATCH MODE BACKFILL (50% cost savings)
// ============================================

/**
 * Collect all items that need entity extraction for batch processing
 */
async function collectBatchItems(): Promise<KgExtractionItem[]> {
  const items: KgExtractionItem[] = [];
  const maxItems = getBatchMaxItems();
  
  // Collect memories
  try {
    const memories = getAllMemoryNotes(true);
    for (const memory of memories) {
      if (items.length >= maxItems) break;
      items.push({
        id: memory.id,
        domain: "memory",
        content: memory.content,
        title: undefined,
        sourceId: memory.sourceId || undefined,
      });
    }
    console.log(`[GraphBackfill] Collected ${memories.length} memories`);
  } catch (error) {
    console.error("[GraphBackfill] Error collecting memories:", error);
  }
  
  // Collect tasks
  try {
    const tasks = getAllTasks(true);
    for (const task of tasks) {
      if (items.length >= maxItems) break;
      items.push({
        id: task.id,
        domain: "task",
        content: `${task.title}\n${task.description || ""}`,
        title: task.title,
      });
    }
    console.log(`[GraphBackfill] Collected ${tasks.length} tasks`);
  } catch (error) {
    console.error("[GraphBackfill] Error collecting tasks:", error);
  }
  
  // Collect lifelogs from Omi API
  try {
    const lifelogs = await getRecentLifelogs(168, 100); // Last 7 days, up to 100
    for (const lifelog of lifelogs) {
      if (items.length >= maxItems) break;
      const transcriptText = lifelog.transcript || lifelog.structured?.overview || "";
      items.push({
        id: lifelog.id,
        domain: "lifelog",
        content: transcriptText,
        title: lifelog.structured?.title || undefined,
      });
    }
    console.log(`[GraphBackfill] Collected ${lifelogs.length} lifelogs`);
  } catch (error) {
    console.error("[GraphBackfill] Error collecting lifelogs:", error);
  }
  
  return items;
}

/**
 * Submit a batch job for knowledge graph entity extraction
 * Uses OpenAI Batch API for 50% cost savings
 * Results are processed asynchronously by the artifact consumer
 */
export async function submitBatchBackfill(): Promise<{
  success: boolean;
  jobId?: string;
  itemCount: number;
  message: string;
}> {
  if (!isBatchEnabled()) {
    return {
      success: false,
      itemCount: 0,
      message: "Batch API is not enabled. Set ENABLE_BATCH_JOBS=true to enable."
    };
  }
  
  if (isBackfillRunning) {
    return {
      success: false,
      itemCount: 0,
      message: "A sync backfill is currently running. Please wait for it to complete."
    };
  }
  
  console.log("[GraphBackfill] Collecting items for batch entity extraction...");
  const items = await collectBatchItems();
  
  if (items.length === 0) {
    return {
      success: false,
      itemCount: 0,
      message: "No items found to process. Add memories, tasks, or lifelogs first."
    };
  }
  
  console.log(`[GraphBackfill] Building batch request for ${items.length} items...`);
  const jsonlContent = buildKgExtractionBatchRequests(items);
  
  // Create a batch job in the database
  const now = new Date().toISOString();
  const idempotencyKey = `kg_backfill_${now.split("T")[0]}_${Date.now()}`;
  
  const job = await createBatchJob({
    type: "KG_BACKFILL",
    inputWindowStart: now,
    inputWindowEnd: now,
    idempotencyKey,
    model: "gpt-5.2", // Using GPT-5.2 as configured
    inputItemCount: items.length,
  });
  const jobId = job.id;
  
  try {
    // Submit to OpenAI Batch API
    const { submitBatchJob } = await import("./services/batchService");
    await submitBatchJob(jobId, jsonlContent);
    
    console.log(`[GraphBackfill] Batch job ${jobId} submitted with ${items.length} items`);
    
    return {
      success: true,
      jobId,
      itemCount: items.length,
      message: `Batch job submitted. ${items.length} items will be processed asynchronously. Check batch job status for progress.`
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await updateBatchJobStatus(jobId, "FAILED", { error: errorMessage });
    
    return {
      success: false,
      jobId,
      itemCount: items.length,
      message: `Failed to submit batch job: ${errorMessage}`
    };
  }
}

/**
 * Check if batch mode should be used for backfill
 * Returns true if batch is enabled and there are items to process
 */
export function shouldUseBatchBackfill(): boolean {
  return isBatchEnabled();
}

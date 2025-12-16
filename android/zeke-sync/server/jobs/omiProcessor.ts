/**
 * Omi Enhanced Features Processor
 * 
 * Unified background processor for Omi enhanced features.
 * Integrates with webhook-based memory processing for real-time:
 * - Meeting detection
 * - Action item extraction
 * 
 * Uses async processing queue with worker pool for:
 * - Concurrent processing of memories
 * - Automatic retry with exponential backoff
 * - Priority-based job scheduling
 * 
 * Also runs scheduled analytics aggregation.
 */

import * as cron from "node-cron";
import { registerMemoryHandler, unregisterMemoryHandler, type MemoryHandler } from "../voice/omiListener";
import { processMemoryForMeeting } from "./omiMeetings";
import { processMemoryForActionItems } from "./omiActionItems";
import { scheduleAnalyticsAggregation, runDailyAnalyticsAggregation } from "./omiAnalytics";
import { getRecentMemories, type OmiMemoryData } from "../omi";
import { classifyContextCategory } from "../entityExtractor";
import { updateOmiMemoryContext } from "../db";
import { memoryProcessingQueue, type Job, type JobPriority } from "./asyncQueue";
import { registerSpecializedWorkers, enqueueSpecializedProcessing } from "./specializedWorkers";

let isProcessorRunning = false;
let memoryHandler: MemoryHandler | null = null;
let analyticsTask: cron.ScheduledTask | null = null;

interface ProcessorConfig {
  enableMeetingDetection: boolean;
  enableActionItemExtraction: boolean;
  enableAnalytics: boolean;
  autoCreateTasks: boolean;
}

const defaultConfig: ProcessorConfig = {
  enableMeetingDetection: true,
  enableActionItemExtraction: true,
  enableAnalytics: true,
  autoCreateTasks: true,
};

let currentConfig = { ...defaultConfig };

let stats = {
  memoriesProcessed: 0,
  meetingsCreated: 0,
  actionItemsExtracted: 0,
  tasksCreated: 0,
  lastProcessedTime: new Date(),
  jobsEnqueued: 0,
  jobsCompleted: 0,
  jobsFailed: 0,
};

const JOB_TYPE_MEMORY = "memory_processing";

/**
 * Get the current processor configuration
 */
export function getProcessorConfig(): ProcessorConfig {
  return { ...currentConfig };
}

/**
 * Update the processor configuration
 */
export function updateProcessorConfig(updates: Partial<ProcessorConfig>): ProcessorConfig {
  currentConfig = { ...currentConfig, ...updates };
  return currentConfig;
}

/**
 * Process a single memory - the actual work done by queue workers
 */
async function processMemoryJob(memory: OmiMemoryData): Promise<{
  meetingCreated: boolean;
  actionItemsExtracted: number;
  tasksCreated: number;
}> {
  const result = {
    meetingCreated: false,
    actionItemsExtracted: 0,
    tasksCreated: 0,
  };

  stats.memoriesProcessed++;
  stats.lastProcessedTime = new Date();
  
  // Context classification - auto-tag the memory category
  try {
    const textToClassify = memory.transcript || memory.structured?.overview || "";
    if (textToClassify.length > 20) {
      const classification = await classifyContextCategory(
        textToClassify,
        memory.structured?.title
      );
      updateOmiMemoryContext(memory.id, classification.category, String(classification.confidence));
      console.log(`[OmiProcessor] Classified memory ${memory.id} as ${classification.category} (${classification.confidence.toFixed(2)})`);
    }
  } catch (error) {
    console.error("[OmiProcessor] Context classification error:", error);
  }
  
  if (currentConfig.enableMeetingDetection) {
    try {
      const meetingResult = await processMemoryForMeeting(memory);
      if (meetingResult.created) {
        stats.meetingsCreated++;
        result.meetingCreated = true;
        console.log(`[OmiProcessor] Detected meeting from memory ${memory.id}`);
      }
    } catch (error) {
      console.error("[OmiProcessor] Meeting detection error:", error);
    }
  }
  
  if (currentConfig.enableActionItemExtraction) {
    try {
      const actionResult = await processMemoryForActionItems(
        memory,
        currentConfig.autoCreateTasks
      );
      stats.actionItemsExtracted += actionResult.extracted;
      stats.tasksCreated += actionResult.tasksCreated;
      result.actionItemsExtracted = actionResult.extracted;
      result.tasksCreated = actionResult.tasksCreated;
      if (actionResult.extracted > 0) {
        console.log(`[OmiProcessor] Extracted ${actionResult.extracted} action items from memory ${memory.id}`);
      }
    } catch (error) {
      console.error("[OmiProcessor] Action item extraction error:", error);
    }
  }

  stats.jobsCompleted++;
  
  // Trigger specialized processing for the memory
  enqueueSpecializedProcessing(memory, { priority: "normal" });
  
  return result;
}

/**
 * Determine job priority based on memory content
 */
function determineMemoryPriority(memory: OmiMemoryData): JobPriority {
  const text = (memory.transcript || memory.structured?.overview || "").toLowerCase();
  
  // Urgent: mentions of "urgent", "asap", "emergency"
  if (/\b(urgent|asap|emergency|critical|immediately)\b/.test(text)) {
    return "urgent";
  }
  
  // High: mentions of deadlines, meetings, important
  if (/\b(deadline|meeting|important|priority|today|tomorrow)\b/.test(text)) {
    return "high";
  }
  
  // Low: casual conversations, entertainment
  if (/\b(movie|game|lunch|dinner|coffee|weekend|vacation)\b/.test(text)) {
    return "low";
  }
  
  return "normal";
}

/**
 * Handle a single memory in real-time - enqueues for async processing
 */
async function handleMemory(memory: OmiMemoryData): Promise<void> {
  const priority = determineMemoryPriority(memory);
  
  try {
    memoryProcessingQueue.enqueue(JOB_TYPE_MEMORY, memory, { priority });
    stats.jobsEnqueued++;
    console.log(`[OmiProcessor] Enqueued memory ${memory.id} for processing (priority: ${priority})`);
  } catch (error) {
    console.error("[OmiProcessor] Failed to enqueue memory:", error);
    stats.jobsFailed++;
    // Fallback to direct processing if queue fails
    await processMemoryJob(memory);
  }
}

/**
 * Start the Omi processor - hooks into webhook handler for real-time processing
 */
export function startOmiProcessor(): void {
  if (isProcessorRunning) {
    console.log("[OmiProcessor] Already running");
    return;
  }
  
  // Register the memory processing worker with the queue
  memoryProcessingQueue.registerProcessor(JOB_TYPE_MEMORY, async (payload: unknown) => {
    const memory = payload as OmiMemoryData;
    return await processMemoryJob(memory);
  });
  
  // Register specialized workers (TaskExtractor, CommitmentTracker, RelationshipAnalyzer)
  registerSpecializedWorkers();
  
  // Start the queue worker pool
  memoryProcessingQueue.start();
  console.log("[OmiProcessor] Started async processing queue with specialized workers");
  
  // Register webhook handler that enqueues memories
  memoryHandler = handleMemory;
  registerMemoryHandler(memoryHandler);
  
  isProcessorRunning = true;
  console.log("[OmiProcessor] Started real-time processing (webhook-based with async queue)");
  
  if (currentConfig.enableAnalytics) {
    scheduleAnalyticsAggregation(async () => {
      const memories = await getRecentMemories(24);
      return memories;
    });
    console.log("[OmiProcessor] Analytics aggregation scheduled (nightly at 2 AM)");
  }
}

/**
 * Stop the Omi processor
 */
export async function stopOmiProcessor(): Promise<void> {
  if (!isProcessorRunning) {
    return;
  }
  
  if (memoryHandler) {
    unregisterMemoryHandler(memoryHandler);
    memoryHandler = null;
  }
  
  // Stop the async queue gracefully
  await memoryProcessingQueue.stop();
  
  if (analyticsTask) {
    analyticsTask.stop();
    analyticsTask = null;
  }
  
  isProcessorRunning = false;
  console.log("[OmiProcessor] Stopped");
}

/**
 * Manually process recent memories (for backfill or debugging)
 */
export async function processRecentMemories(): Promise<{
  memoriesProcessed: number;
  meetingsCreated: number;
  actionItemsExtracted: number;
  tasksCreated: number;
}> {
  const result = {
    memoriesProcessed: 0,
    meetingsCreated: 0,
    actionItemsExtracted: 0,
    tasksCreated: 0,
  };

  try {
    const memories = await getRecentMemories(4);
    
    if (memories.length === 0) {
      console.log("[OmiProcessor] No memories to process");
      return result;
    }
    
    console.log(`[OmiProcessor] Processing ${memories.length} memories (backfill)...`);
    
    for (const memory of memories) {
      result.memoriesProcessed++;
      
      if (currentConfig.enableMeetingDetection) {
        try {
          const meetingResult = await processMemoryForMeeting(memory);
          if (meetingResult.created) {
            result.meetingsCreated++;
          }
        } catch (error) {
          console.error("[OmiProcessor] Meeting detection error:", error);
        }
      }
      
      if (currentConfig.enableActionItemExtraction) {
        try {
          const actionResult = await processMemoryForActionItems(
            memory,
            currentConfig.autoCreateTasks
          );
          result.actionItemsExtracted += actionResult.extracted;
          result.tasksCreated += actionResult.tasksCreated;
        } catch (error) {
          console.error("[OmiProcessor] Action item extraction error:", error);
        }
      }
    }
    
    console.log(`[OmiProcessor] Backfill complete: ${result.meetingsCreated} meetings, ${result.actionItemsExtracted} action items`);
    return result;
    
  } catch (error) {
    console.error("[OmiProcessor] Backfill processing error:", error);
    return result;
  }
}

/**
 * Get the processor status including queue stats
 */
export function getProcessorStatus(): {
  running: boolean;
  lastProcessedTime: string;
  stats: typeof stats;
  config: ProcessorConfig;
  queueStats: {
    totalEnqueued: number;
    totalCompleted: number;
    totalFailed: number;
    totalRetried: number;
    pending: number;
    processing: number;
    activeWorkers: number;
    queueSize: number;
  };
} {
  return {
    running: isProcessorRunning,
    lastProcessedTime: stats.lastProcessedTime.toISOString(),
    stats: { ...stats },
    config: currentConfig,
    queueStats: memoryProcessingQueue.getStats(),
  };
}

/**
 * Get queue status for monitoring
 */
export function getQueueStatus() {
  return {
    isActive: memoryProcessingQueue.isActive(),
    stats: memoryProcessingQueue.getStats(),
    pendingJobs: memoryProcessingQueue.getJobsByStatus("pending").length,
    processingJobs: memoryProcessingQueue.getJobsByStatus("processing").length,
    deadJobs: memoryProcessingQueue.getJobsByStatus("dead").length,
  };
}

/**
 * Retry all dead jobs in the queue
 */
export function retryDeadJobs(): number {
  return memoryProcessingQueue.retryDeadJobs();
}

/**
 * Clear completed jobs from queue to free memory
 */
export function clearCompletedJobs(): number {
  return memoryProcessingQueue.clearCompleted();
}

/**
 * Initialize the Omi enhanced features processor
 * Should be called during server startup
 */
export function initializeOmiProcessor(): void {
  if (!process.env.OMI_API_KEY && !process.env.OMI_DEV_API_KEY) {
    console.log("[OmiProcessor] Not starting - OMI_API_KEY or OMI_DEV_API_KEY not configured");
    return;
  }
  
  if (!process.env.OPENAI_API_KEY) {
    console.log("[OmiProcessor] Not starting - OPENAI_API_KEY not configured");
    return;
  }
  
  startOmiProcessor();
}

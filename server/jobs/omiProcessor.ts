/**
 * Omi Enhanced Features Processor
 * 
 * Unified background processor for Omi enhanced features.
 * Integrates with webhook-based memory processing for real-time:
 * - Meeting detection
 * - Action item extraction
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
};

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
 * Handle a single memory in real-time as it comes from webhooks
 */
async function handleMemory(memory: OmiMemoryData): Promise<void> {
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
      if (actionResult.extracted > 0) {
        console.log(`[OmiProcessor] Extracted ${actionResult.extracted} action items from memory ${memory.id}`);
      }
    } catch (error) {
      console.error("[OmiProcessor] Action item extraction error:", error);
    }
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
  
  memoryHandler = handleMemory;
  registerMemoryHandler(memoryHandler);
  
  isProcessorRunning = true;
  console.log("[OmiProcessor] Started real-time processing (webhook-based)");
  
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
export function stopOmiProcessor(): void {
  if (!isProcessorRunning) {
    return;
  }
  
  if (memoryHandler) {
    unregisterMemoryHandler(memoryHandler);
    memoryHandler = null;
  }
  
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
 * Get the processor status
 */
export function getProcessorStatus(): {
  running: boolean;
  lastProcessedTime: string;
  stats: typeof stats;
  config: ProcessorConfig;
} {
  return {
    running: isProcessorRunning,
    lastProcessedTime: stats.lastProcessedTime.toISOString(),
    stats: { ...stats },
    config: currentConfig,
  };
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

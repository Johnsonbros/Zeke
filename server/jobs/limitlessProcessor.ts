/**
 * Limitless Enhanced Features Processor
 * 
 * Unified background processor for Limitless enhanced features.
 * Integrates with the voice pipeline's lifelog processing for real-time:
 * - Meeting detection
 * - Action item extraction
 * 
 * Also runs scheduled analytics aggregation.
 */

import * as cron from "node-cron";
import { registerLifelogHandler, unregisterLifelogHandler, type LifelogHandler } from "../voice";
import { processLifelogForMeeting } from "./limitlessMeetings";
import { processLifelogForActionItems } from "./limitlessActionItems";
import { scheduleAnalyticsAggregation, runDailyAnalyticsAggregation } from "./limitlessAnalytics";
import { getRecentLifelogs, type Lifelog } from "../limitless";

let isProcessorRunning = false;
let lifelogHandler: LifelogHandler | null = null;
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

// Processing statistics
let stats = {
  lifelogsProcessed: 0,
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
 * Handle a single lifelog in real-time as it comes from the voice pipeline
 */
async function handleLifelog(lifelog: Lifelog): Promise<void> {
  stats.lifelogsProcessed++;
  stats.lastProcessedTime = new Date();
  
  // Run meeting detection
  if (currentConfig.enableMeetingDetection) {
    try {
      const meetingResult = await processLifelogForMeeting(lifelog);
      if (meetingResult.created) {
        stats.meetingsCreated++;
        console.log(`[LimitlessProcessor] Detected meeting from lifelog ${lifelog.id}`);
      }
    } catch (error) {
      console.error("[LimitlessProcessor] Meeting detection error:", error);
    }
  }
  
  // Run action item extraction
  if (currentConfig.enableActionItemExtraction) {
    try {
      const actionResult = await processLifelogForActionItems(
        lifelog,
        currentConfig.autoCreateTasks
      );
      stats.actionItemsExtracted += actionResult.extracted;
      stats.tasksCreated += actionResult.tasksCreated;
      if (actionResult.extracted > 0) {
        console.log(`[LimitlessProcessor] Extracted ${actionResult.extracted} action items from lifelog ${lifelog.id}`);
      }
    } catch (error) {
      console.error("[LimitlessProcessor] Action item extraction error:", error);
    }
  }
}

/**
 * Start the Limitless processor - hooks into voice pipeline for real-time processing
 */
export function startLimitlessProcessor(): void {
  if (isProcessorRunning) {
    console.log("[LimitlessProcessor] Already running");
    return;
  }
  
  // Register handler with voice pipeline for real-time lifelog processing
  lifelogHandler = handleLifelog;
  registerLifelogHandler(lifelogHandler);
  
  isProcessorRunning = true;
  console.log("[LimitlessProcessor] Started real-time processing (hooked into voice pipeline)");
  
  // Start nightly analytics aggregation (runs at 2 AM)
  if (currentConfig.enableAnalytics) {
    scheduleAnalyticsAggregation(async () => {
      const lifelogs = await getRecentLifelogs(24);
      return lifelogs;
    });
    console.log("[LimitlessProcessor] Analytics aggregation scheduled (nightly at 2 AM)");
  }
}

/**
 * Stop the Limitless processor
 */
export function stopLimitlessProcessor(): void {
  if (!isProcessorRunning) {
    return;
  }
  
  // Unregister from voice pipeline
  if (lifelogHandler) {
    unregisterLifelogHandler(lifelogHandler);
    lifelogHandler = null;
  }
  
  // Stop analytics task
  if (analyticsTask) {
    analyticsTask.stop();
    analyticsTask = null;
  }
  
  isProcessorRunning = false;
  console.log("[LimitlessProcessor] Stopped");
}

/**
 * Manually process recent lifelogs (for backfill or debugging)
 */
export async function processRecentLifelogs(): Promise<{
  lifelogsProcessed: number;
  meetingsCreated: number;
  actionItemsExtracted: number;
  tasksCreated: number;
}> {
  const result = {
    lifelogsProcessed: 0,
    meetingsCreated: 0,
    actionItemsExtracted: 0,
    tasksCreated: 0,
  };

  try {
    // Fetch lifelogs from the last 4 hours for backfill
    const lifelogs = await getRecentLifelogs(4);
    
    if (lifelogs.length === 0) {
      console.log("[LimitlessProcessor] No lifelogs to process");
      return result;
    }
    
    console.log(`[LimitlessProcessor] Processing ${lifelogs.length} lifelogs (backfill)...`);
    
    for (const lifelog of lifelogs) {
      result.lifelogsProcessed++;
      
      // Run meeting detection
      if (currentConfig.enableMeetingDetection) {
        try {
          const meetingResult = await processLifelogForMeeting(lifelog);
          if (meetingResult.created) {
            result.meetingsCreated++;
          }
        } catch (error) {
          console.error("[LimitlessProcessor] Meeting detection error:", error);
        }
      }
      
      // Run action item extraction
      if (currentConfig.enableActionItemExtraction) {
        try {
          const actionResult = await processLifelogForActionItems(
            lifelog,
            currentConfig.autoCreateTasks
          );
          result.actionItemsExtracted += actionResult.extracted;
          result.tasksCreated += actionResult.tasksCreated;
        } catch (error) {
          console.error("[LimitlessProcessor] Action item extraction error:", error);
        }
      }
    }
    
    console.log(`[LimitlessProcessor] Backfill complete: ${result.meetingsCreated} meetings, ${result.actionItemsExtracted} action items`);
    return result;
    
  } catch (error) {
    console.error("[LimitlessProcessor] Backfill processing error:", error);
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
 * Initialize the Limitless enhanced features processor
 * Should be called during server startup
 */
export function initializeLimitlessProcessor(): void {
  // Check if Limitless API is configured
  if (!process.env.LIMITLESS_API_KEY) {
    console.log("[LimitlessProcessor] Not starting - LIMITLESS_API_KEY not configured");
    return;
  }
  
  // Check if OpenAI is configured (needed for AI features)
  if (!process.env.OPENAI_API_KEY) {
    console.log("[LimitlessProcessor] Not starting - OPENAI_API_KEY not configured");
    return;
  }
  
  startLimitlessProcessor();
}

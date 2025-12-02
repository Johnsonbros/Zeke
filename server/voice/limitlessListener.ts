/**
 * Limitless Lifelog Listener
 * 
 * Polls the Limitless API for new lifelogs (pendant recordings) and extracts
 * transcribed text for voice command processing. Uses the official /v1/lifelogs
 * endpoint which provides transcripts after audio syncs through phone to cloud.
 * 
 * This approach is more reliable than real-time audio streaming since the
 * Limitless API doesn't support true real-time audio access.
 * 
 * API: GET /v1/lifelogs
 * Constraints:
 *   - Max 180 requests/min (~3/sec)
 *   - Audio syncs: Pendant → Phone (Bluetooth) → Cloud
 *   - Transcripts available after cloud processing
 */

import { log } from "../logger";
import { getLifelogs, type Lifelog, type ContentNode } from "../limitless";

const TIMEZONE = "America/New_York";

/**
 * Format a Date object as a timezone-naive string for Limitless API
 */
function formatForLimitlessApi(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';
  
  return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
}

export interface TranscriptChunk {
  lifelogId: string;
  text: string;
  speakerName?: string | null;
  startTime: string;
  endTime: string;
}

export type TranscriptHandler = (chunk: TranscriptChunk) => Promise<void>;

export interface LimitlessListenerConfig {
  pollIntervalMs?: number;
  onTranscript: TranscriptHandler;
  onError?: (error: Error) => void;
  lookbackMinutes?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 10000; // Poll every 10 seconds (lifelogs have delay anyway)
const DEFAULT_LOOKBACK_MINUTES = 5; // Look back 5 minutes for new lifelogs
const MAX_PROCESSED_IDS = 1000; // Keep track of last 1000 processed IDs

export class LimitlessListener {
  private pollIntervalMs: number;
  private lookbackMinutes: number;
  private onTranscript: TranscriptHandler;
  private onError: (error: Error) => void;
  
  private processedIds: Set<string> = new Set();
  private watermarkTime: Date;  // Tracks the latest processed lifelog end time
  private lastPollTime: Date;
  private isRunning: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private backoffUntil: number = 0;
  private consecutiveErrors: number = 0;

  constructor(config: LimitlessListenerConfig) {
    this.pollIntervalMs = config.pollIntervalMs || 
      parseInt(process.env.LIMITLESS_POLL_INTERVAL_MS || String(DEFAULT_POLL_INTERVAL_MS), 10);
    this.lookbackMinutes = config.lookbackMinutes || DEFAULT_LOOKBACK_MINUTES;
    this.onTranscript = config.onTranscript;
    this.onError = config.onError || ((error) => log(`LimitlessListener error: ${error.message}`, "voice"));
    
    // Initialize watermark to lookback period ago
    this.watermarkTime = new Date(Date.now() - this.lookbackMinutes * 60 * 1000);
    this.lastPollTime = new Date();
  }

  /**
   * Check if the Limitless API key is configured
   */
  isConfigured(): boolean {
    return !!process.env.LIMITLESS_API_KEY;
  }

  /**
   * Start the lifelog polling loop
   */
  start(): void {
    if (!this.isConfigured()) {
      log("Limitless API key not configured - voice pipeline disabled", "voice");
      return;
    }

    if (this.isRunning) {
      log("Limitless listener already running", "voice");
      return;
    }

    this.isRunning = true;
    this.lastPollTime = new Date(Date.now() - this.lookbackMinutes * 60 * 1000);
    this.consecutiveErrors = 0;
    this.processedIds.clear();
    
    log(`Starting Limitless listener (poll interval: ${this.pollIntervalMs}ms, lookback: ${this.lookbackMinutes}min)`, "voice");
    this.schedulePoll();
  }

  /**
   * Stop the polling loop
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    log("Limitless listener stopped", "voice");
  }

  /**
   * Get current listener status
   */
  getStatus(): { 
    running: boolean; 
    lastPollTime: string; 
    watermarkTime: string;
    processedCount: number;
    consecutiveErrors: number; 
    backoffUntil: number;
  } {
    return {
      running: this.isRunning,
      lastPollTime: this.lastPollTime.toISOString(),
      watermarkTime: this.watermarkTime.toISOString(),
      processedCount: this.processedIds.size,
      consecutiveErrors: this.consecutiveErrors,
      backoffUntil: this.backoffUntil,
    };
  }

  /**
   * Schedule the next poll
   */
  private schedulePoll(): void {
    if (!this.isRunning) {
      return;
    }

    // Calculate delay considering backoff
    const now = Date.now();
    let delay = this.pollIntervalMs;
    
    if (this.backoffUntil > now) {
      delay = Math.max(delay, this.backoffUntil - now);
    }

    this.pollTimer = setTimeout(() => this.poll(), delay);
  }

  /**
   * Perform a single poll for new lifelogs
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Use watermark to query only newer lifelogs
      // Subtract 30 seconds from watermark to create small overlap for safety
      const queryStartTime = new Date(this.watermarkTime.getTime() - 30000);
      const formattedStart = formatForLimitlessApi(queryStartTime);
      
      const response = await getLifelogs({
        start: formattedStart,
        limit: 20,
        direction: "asc",  // Oldest first to process in order
        includeContents: true,
        includeMarkdown: false,
      });

      const lifelogs = response.data.lifelogs || [];
      
      // Track newest lifelog end time to advance watermark
      let newestEndTime = this.watermarkTime;
      
      // Process new lifelogs (ones we haven't seen)
      for (const lifelog of lifelogs) {
        if (this.processedIds.has(lifelog.id)) {
          // Already processed, but still track end time for watermark
          const lifelogEnd = new Date(lifelog.endTime);
          if (lifelogEnd > newestEndTime) {
            newestEndTime = lifelogEnd;
          }
          continue;
        }

        // Extract transcript text from contents
        const transcripts = this.extractTranscripts(lifelog);
        
        if (transcripts.length > 0) {
          log(`Processing lifelog ${lifelog.id}: ${transcripts.length} transcript chunk(s)`, "voice");
        }
        
        for (const transcript of transcripts) {
          try {
            await this.onTranscript(transcript);
          } catch (handlerError: any) {
            log(`Transcript handler error: ${handlerError.message}`, "voice");
          }
        }

        // Mark as processed
        this.processedIds.add(lifelog.id);
        
        // Track end time for watermark
        const lifelogEnd = new Date(lifelog.endTime);
        if (lifelogEnd > newestEndTime) {
          newestEndTime = lifelogEnd;
        }
        
        // Cleanup old IDs to prevent memory growth
        if (this.processedIds.size > MAX_PROCESSED_IDS) {
          const idsArray = Array.from(this.processedIds);
          const toRemove = idsArray.slice(0, idsArray.length - MAX_PROCESSED_IDS / 2);
          toRemove.forEach(id => this.processedIds.delete(id));
        }
      }
      
      // Advance watermark to the newest processed lifelog end time
      if (newestEndTime > this.watermarkTime) {
        this.watermarkTime = newestEndTime;
      }

      this.lastPollTime = new Date();
      this.consecutiveErrors = 0;

    } catch (error: any) {
      this.consecutiveErrors++;
      this.onError(error);
      
      // Apply exponential backoff for repeated errors
      if (this.consecutiveErrors > 3) {
        const backoffMs = Math.min(60000, 5000 * Math.pow(2, this.consecutiveErrors - 3));
        this.backoffUntil = Date.now() + backoffMs;
        log(`Backing off for ${backoffMs}ms after ${this.consecutiveErrors} consecutive errors`, "voice");
      }
    }

    this.schedulePoll();
  }

  /**
   * Extract transcript text from lifelog contents
   */
  private extractTranscripts(lifelog: Lifelog): TranscriptChunk[] {
    const transcripts: TranscriptChunk[] = [];
    
    // Process content nodes recursively
    const processNode = (node: ContentNode) => {
      // Handle different content types
      if (node.type === "blockquote" || node.type === "paragraph") {
        if (node.content && node.content.trim()) {
          transcripts.push({
            lifelogId: lifelog.id,
            text: node.content.trim(),
            speakerName: node.speakerName,
            startTime: node.startTime || lifelog.startTime,
            endTime: node.endTime || lifelog.endTime,
          });
        }
      }
      
      // Process children recursively
      if (node.children) {
        for (const child of node.children) {
          processNode(child);
        }
      }
    };

    // Process all top-level content nodes
    for (const node of lifelog.contents || []) {
      processNode(node);
    }

    return transcripts;
  }
}

// Singleton instance for the voice pipeline
let listenerInstance: LimitlessListener | null = null;

/**
 * Get or create the Limitless listener instance
 */
export function getLimitlessListener(config?: LimitlessListenerConfig): LimitlessListener | null {
  if (!listenerInstance && config) {
    listenerInstance = new LimitlessListener(config);
  }
  return listenerInstance;
}

/**
 * Reset the listener instance (for testing)
 */
export function resetLimitlessListener(): void {
  if (listenerInstance) {
    listenerInstance.stop();
    listenerInstance = null;
  }
}

/**
 * Check if the voice pipeline is available (API key configured)
 */
export function isVoicePipelineAvailable(): boolean {
  return !!(process.env.LIMITLESS_API_KEY);
}

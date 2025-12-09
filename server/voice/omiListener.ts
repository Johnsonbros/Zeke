/**
 * Omi Memory Listener
 * 
 * Receives real-time memory updates from the Omi wearable via webhooks.
 * Unlike the polling-based Limitless approach, Omi pushes data to us
 * when new memories are created, updated, or deleted.
 * 
 * Webhook Events:
 *   - memory_created: New memory captured
 *   - memory_updated: Existing memory modified
 *   - memory_deleted: Memory removed
 *   - transcript_segment: Real-time transcript chunk
 */

import { log } from "../logger";
import type { OmiMemoryData, OmiWebhookPayload, TranscriptSegment } from "../omi";
import { handleOmiWebhook } from "../omi";

const TIMEZONE = "America/New_York";

export interface TranscriptChunk {
  memoryId: string;
  text: string;
  speakerName?: string | null;
  startTime: string;
  endTime: string;
}

export type TranscriptHandler = (chunk: TranscriptChunk) => Promise<void>;
export type MemoryHandler = (memory: OmiMemoryData) => Promise<void>;

const memoryHandlers: MemoryHandler[] = [];
const transcriptHandlers: TranscriptHandler[] = [];

/**
 * Register a callback to receive memories as they are processed.
 * Used by the Omi processor for real-time meeting/action item extraction.
 */
export function registerMemoryHandler(handler: MemoryHandler): void {
  memoryHandlers.push(handler);
  log(`Registered memory handler (total: ${memoryHandlers.length})`, "voice");
}

/**
 * Unregister a memory handler
 */
export function unregisterMemoryHandler(handler: MemoryHandler): void {
  const index = memoryHandlers.indexOf(handler);
  if (index !== -1) {
    memoryHandlers.splice(index, 1);
    log(`Unregistered memory handler (remaining: ${memoryHandlers.length})`, "voice");
  }
}

/**
 * Register a callback to receive transcript chunks
 */
export function registerTranscriptHandler(handler: TranscriptHandler): void {
  transcriptHandlers.push(handler);
  log(`Registered transcript handler (total: ${transcriptHandlers.length})`, "voice");
}

/**
 * Unregister a transcript handler
 */
export function unregisterTranscriptHandler(handler: TranscriptHandler): void {
  const index = transcriptHandlers.indexOf(handler);
  if (index !== -1) {
    transcriptHandlers.splice(index, 1);
    log(`Unregistered transcript handler (remaining: ${transcriptHandlers.length})`, "voice");
  }
}

/**
 * Notify all registered memory handlers
 */
async function notifyMemoryHandlers(memory: OmiMemoryData): Promise<void> {
  for (const handler of memoryHandlers) {
    try {
      await handler(memory);
    } catch (error: any) {
      log(`Memory handler error: ${error.message}`, "voice");
    }
  }
}

/**
 * Notify all registered transcript handlers
 */
async function notifyTranscriptHandlers(chunk: TranscriptChunk): Promise<void> {
  for (const handler of transcriptHandlers) {
    try {
      await handler(chunk);
    } catch (error: any) {
      log(`Transcript handler error: ${error.message}`, "voice");
    }
  }
}

export interface OmiListenerConfig {
  onTranscript?: TranscriptHandler;
  onMemory?: MemoryHandler;
  onError?: (error: Error) => void;
}

export interface OmiListenerStatus {
  running: boolean;
  webhookReceived: number;
  memoriesProcessed: number;
  lastWebhookTime: string | null;
  consecutiveErrors: number;
}

let listenerStatus: OmiListenerStatus = {
  running: false,
  webhookReceived: 0,
  memoriesProcessed: 0,
  lastWebhookTime: null,
  consecutiveErrors: 0,
};

let onErrorHandler: ((error: Error) => void) | null = null;

/**
 * Omi Listener - Webhook-based memory receiver
 * Unlike polling, this receives pushed data from Omi's servers
 */
export class OmiListener {
  private onTranscript: TranscriptHandler | null;
  private onMemory: MemoryHandler | null;
  private onError: (error: Error) => void;

  constructor(config: OmiListenerConfig) {
    this.onTranscript = config.onTranscript || null;
    this.onMemory = config.onMemory || null;
    this.onError = config.onError || ((error) => log(`OmiListener error: ${error.message}`, "voice"));
    onErrorHandler = this.onError;
    
    if (this.onTranscript) {
      registerTranscriptHandler(this.onTranscript);
    }
    if (this.onMemory) {
      registerMemoryHandler(this.onMemory);
    }
  }

  /**
   * Check if the Omi API key is configured
   */
  isConfigured(): boolean {
    return !!process.env.OMI_API_KEY;
  }

  /**
   * Start the listener (marks as active for webhook processing)
   */
  start(): void {
    if (!this.isConfigured()) {
      log("Omi API key not configured - voice pipeline disabled", "voice");
      return;
    }

    if (listenerStatus.running) {
      log("Omi listener already running", "voice");
      return;
    }

    listenerStatus.running = true;
    listenerStatus.consecutiveErrors = 0;
    
    log("Started Omi listener (webhook-based)", "voice");
  }

  /**
   * Stop the listener
   */
  stop(): void {
    if (!listenerStatus.running) {
      return;
    }

    listenerStatus.running = false;
    
    if (this.onTranscript) {
      unregisterTranscriptHandler(this.onTranscript);
    }
    if (this.onMemory) {
      unregisterMemoryHandler(this.onMemory);
    }

    log("Omi listener stopped", "voice");
  }

  /**
   * Get current listener status
   */
  getStatus(): OmiListenerStatus {
    return { ...listenerStatus };
  }
}

/**
 * Process an incoming webhook payload from Omi
 * Called by the webhook endpoint in routes.ts
 */
export async function processOmiWebhook(payload: OmiWebhookPayload): Promise<void> {
  if (!listenerStatus.running) {
    log("Received Omi webhook but listener not running", "voice");
  }
  
  listenerStatus.webhookReceived++;
  listenerStatus.lastWebhookTime = new Date().toISOString();
  
  try {
    handleOmiWebhook(payload);
    
    switch (payload.event) {
      case "memory_created":
      case "memory_updated":
        if (payload.memory) {
          listenerStatus.memoriesProcessed++;
          
          const transcripts = extractTranscriptsFromMemory(payload.memory);
          for (const transcript of transcripts) {
            await notifyTranscriptHandlers(transcript);
          }
          
          await notifyMemoryHandlers(payload.memory);
        }
        break;
        
      case "transcript_segment":
        if (payload.segment && payload.memoryId) {
          const chunk: TranscriptChunk = {
            memoryId: payload.memoryId,
            text: payload.segment.text,
            speakerName: payload.segment.speaker,
            startTime: new Date(payload.segment.start * 1000).toISOString(),
            endTime: new Date(payload.segment.end * 1000).toISOString(),
          };
          await notifyTranscriptHandlers(chunk);
        }
        break;
        
      case "memory_deleted":
        log(`Memory deleted: ${payload.memoryId}`, "voice");
        break;
    }
    
    listenerStatus.consecutiveErrors = 0;
  } catch (error: any) {
    listenerStatus.consecutiveErrors++;
    if (onErrorHandler) {
      onErrorHandler(error);
    }
    throw error;
  }
}

/**
 * Extract transcript chunks from a memory
 */
function extractTranscriptsFromMemory(memory: OmiMemoryData): TranscriptChunk[] {
  const transcripts: TranscriptChunk[] = [];
  
  for (const segment of memory.transcriptSegments || []) {
    if (segment.text && segment.text.trim()) {
      transcripts.push({
        memoryId: memory.id,
        text: segment.text.trim(),
        speakerName: segment.isUser ? null : segment.speaker,
        startTime: new Date(segment.start * 1000).toISOString(),
        endTime: new Date(segment.end * 1000).toISOString(),
      });
    }
  }
  
  return transcripts;
}

let listenerInstance: OmiListener | null = null;

/**
 * Get or create the Omi listener instance
 */
export function getOmiListener(config?: OmiListenerConfig): OmiListener | null {
  if (!listenerInstance && config) {
    listenerInstance = new OmiListener(config);
  }
  return listenerInstance;
}

/**
 * Reset the listener instance (for testing)
 */
export function resetOmiListener(): void {
  if (listenerInstance) {
    listenerInstance.stop();
    listenerInstance = null;
  }
  listenerStatus = {
    running: false,
    webhookReceived: 0,
    memoriesProcessed: 0,
    lastWebhookTime: null,
    consecutiveErrors: 0,
  };
}

/**
 * Check if the voice pipeline is available (API key configured)
 */
export function isVoicePipelineAvailable(): boolean {
  return !!process.env.OMI_API_KEY;
}

/**
 * Get listener status for monitoring
 */
export function getOmiListenerStatus(): OmiListenerStatus {
  return { ...listenerStatus };
}

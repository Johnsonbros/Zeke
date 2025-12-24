/**
 * Voice Pipeline Listener
 * 
 * ============================================================================
 * ARCHITECTURE: Audio from Android App via WebSocket/STT
 * ============================================================================
 * 
 * Audio data flows from the Omi pendant through the Android companion app:
 *   Omi Pendant → Bluetooth → Android App → WebSocket → Deepgram STT → Here
 * 
 * The feedSttTranscript() function connects Deepgram transcripts to the voice
 * command processing pipeline, enabling wake word detection and commands.
 * 
 * Legacy webhook handlers are preserved for compatibility but Omi cloud API
 * is disabled - all audio comes from the Android app.
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

/**
 * Feed a transcript from the Android app STT pipeline into the voice handlers.
 * This connects Deepgram transcripts to the voice command processing pipeline.
 * 
 * Called from the /ws/audio WebSocket handler when Deepgram returns transcripts.
 */
export async function feedSttTranscript(transcript: {
  sessionId: string;
  text: string;
  speaker?: string;
  startMs: number;
  endMs: number;
  isFinal?: boolean;
}): Promise<void> {
  // Only process final transcripts
  if (!transcript.isFinal) {
    return;
  }
  
  const chunk: TranscriptChunk = {
    memoryId: `stt-${transcript.sessionId}`,
    text: transcript.text,
    speakerName: transcript.speaker || null,
    startTime: new Date(transcript.startMs).toISOString(),
    endTime: new Date(transcript.endMs).toISOString(),
  };
  
  listenerStatus.webhookReceived++;
  listenerStatus.lastWebhookTime = new Date().toISOString();
  
  await notifyTranscriptHandlers(chunk);
  log(`Fed STT transcript to voice pipeline: "${transcript.text.substring(0, 50)}..."`, "voice");
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
   * Check if the listener is configured
   * Note: Omi cloud API is disabled. Audio flows from Android app via WebSocket.
   */
  isConfigured(): boolean {
    // Always configured - audio comes from Android app, not Omi cloud
    return true;
  }

  /**
   * Start the listener (marks as active for webhook processing)
   */
  start(): void {
    if (listenerStatus.running) {
      log("Voice listener already running", "voice");
      return;
    }

    listenerStatus.running = true;
    listenerStatus.consecutiveErrors = 0;
    
    log("Started voice listener (Android app via WebSocket)", "voice");
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
 * Check if the voice pipeline is available
 * Note: Omi cloud API is disabled. Audio now flows from Android app via WebSocket.
 * The voice pipeline is always available for receiving audio from the Android app.
 */
export function isVoicePipelineAvailable(): boolean {
  // Always available - audio comes from Android app via WebSocket, not Omi cloud
  return true;
}

/**
 * Get listener status for monitoring
 */
export function getOmiListenerStatus(): OmiListenerStatus {
  return { ...listenerStatus };
}

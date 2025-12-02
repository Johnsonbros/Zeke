/**
 * Voice Pipeline - Main Entry Point
 * 
 * Orchestrates the Limitless lifelog → transcript → ZEKE command pipeline.
 * Uses the Limitless API's transcripts directly when available, which is
 * more reliable than real-time audio streaming.
 * 
 * Provides a clean API for starting/stopping the voice pipeline and
 * checking its status.
 */

import { log } from "../logger";
import { 
  LimitlessListener, 
  getLimitlessListener, 
  isVoicePipelineAvailable,
  type TranscriptChunk 
} from "./limitlessListener";
import { 
  isTranscriptionAvailable,
} from "./transcriber";
import { 
  UtteranceStream, 
  getUtteranceStream,
  type Utterance 
} from "./utteranceStream";
import { 
  processVoiceCommand, 
  getVoiceConversationId,
  resetVoiceConversation,
  type VoiceCommandResult 
} from "./voiceCommandHandler";

export interface VoicePipelineStatus {
  available: boolean;
  running: boolean;
  limitlessConfigured: boolean;
  transcriptionConfigured: boolean;
  listenerStatus?: {
    running: boolean;
    lastPollTime: string;
    processedCount: number;
    consecutiveErrors: number;
  };
  streamStatus?: {
    running: boolean;
    pendingText: string;
    lastTextAge: number;
  };
  voiceConversationId: string | null;
  commandsProcessed: number;
  lastCommandAt: number | null;
}

// Pipeline state
let listener: LimitlessListener | null = null;
let utteranceStream: UtteranceStream | null = null;
let isInitialized = false;
let commandsProcessed = 0;
let lastCommandAt: number | null = null;

/**
 * Initialize the voice pipeline components
 * 
 * This sets up the chain:
 *   LimitlessListener → UtteranceStream → VoiceCommandHandler
 * 
 * The new approach uses Limitless API transcripts directly instead of
 * streaming raw audio and transcribing with Whisper. This is more reliable
 * since the Limitless API doesn't support true real-time audio streaming.
 */
export function initializeVoicePipeline(): boolean {
  if (isInitialized) {
    log("Voice pipeline already initialized", "voice");
    return true;
  }

  // Check if Limitless is available - this is the minimum requirement
  if (!isVoicePipelineAvailable()) {
    log("Voice pipeline not available - LIMITLESS_API_KEY not configured", "voice");
    isInitialized = true;  // Mark as initialized so status endpoint works
    return false;
  }

  log("Initializing voice pipeline...", "voice");

  // Initialize utterance stream with command handler
  utteranceStream = new UtteranceStream({
    silenceThresholdMs: 1000,  // 1 second of silence = end of utterance
    tickIntervalMs: 200,       // Check every 200ms
    onUtterance: async (utterance: Utterance) => {
      try {
        const result = await processVoiceCommand(utterance);
        if (result.success) {
          commandsProcessed++;
          lastCommandAt = Date.now();
          log(`Voice command processed: "${utterance.text.substring(0, 50)}..."`, "voice");
        }
      } catch (error: any) {
        log(`Voice command processing failed: ${error.message}`, "voice");
      }
    },
    onError: (error: Error) => {
      log(`UtteranceStream error: ${error.message}`, "voice");
    },
  });

  // Initialize Limitless listener with transcript handler
  listener = new LimitlessListener({
    pollIntervalMs: 10000,  // Poll every 10 seconds
    lookbackMinutes: 5,     // Look back 5 minutes for new lifelogs
    onTranscript: async (chunk: TranscriptChunk) => {
      try {
        log(`New transcript from lifelog ${chunk.lifelogId}: "${chunk.text.substring(0, 50)}..."`, "voice");
        
        // Feed transcript to utterance stream for wake word detection
        // Create a TranscriptionResult-compatible object
        const now = Date.now();
        utteranceStream!.feed({
          text: chunk.text,
          startMs: now,
          endMs: now,
          durationMs: 0,
        });
      } catch (error: any) {
        log(`Transcript processing error: ${error.message}`, "voice");
      }
    },
    onError: (error: Error) => {
      log(`LimitlessListener error: ${error.message}`, "voice");
    },
  });

  isInitialized = true;
  log("Voice pipeline initialized successfully", "voice");
  
  return true;
}

/**
 * Start the voice pipeline
 */
export function startVoicePipeline(): boolean {
  if (!isInitialized) {
    const initialized = initializeVoicePipeline();
    if (!initialized) {
      return false;
    }
  }

  if (!listener || !utteranceStream) {
    log("Voice pipeline components not available", "voice");
    return false;
  }

  log("Starting voice pipeline...", "voice");
  
  // Start components in order
  utteranceStream.start();
  listener.start();

  log("Voice pipeline started", "voice");
  return true;
}

/**
 * Stop the voice pipeline
 */
export function stopVoicePipeline(): void {
  log("Stopping voice pipeline...", "voice");

  if (listener) {
    listener.stop();
  }

  if (utteranceStream) {
    utteranceStream.stop();
  }

  log("Voice pipeline stopped", "voice");
}

/**
 * Get the current status of the voice pipeline
 */
export function getVoicePipelineStatus(): VoicePipelineStatus {
  const limitlessConfigured = isVoicePipelineAvailable();
  const transcriptionConfigured = isTranscriptionAvailable();
  const available = limitlessConfigured;  // Transcription not required with new approach

  return {
    available,
    running: !!(listener?.getStatus().running),
    limitlessConfigured,
    transcriptionConfigured,
    listenerStatus: listener?.getStatus(),
    streamStatus: utteranceStream?.getStatus(),
    voiceConversationId: getVoiceConversationId(),
    commandsProcessed,
    lastCommandAt,
  };
}

/**
 * Check if the voice pipeline is running
 */
export function isVoicePipelineRunning(): boolean {
  return !!(listener?.getStatus().running);
}

/**
 * Reset the voice pipeline state (for testing or fresh start)
 */
export function resetVoicePipeline(): void {
  stopVoicePipeline();
  resetVoiceConversation();
  commandsProcessed = 0;
  lastCommandAt = null;
  log("Voice pipeline state reset", "voice");
}

// Export all components for direct access if needed
export { 
  LimitlessListener, 
  isVoicePipelineAvailable 
} from "./limitlessListener";
export { 
  WhisperTranscriber, 
  MockTranscriber, 
  getTranscriber, 
  setTranscriber,
  isTranscriptionAvailable,
  type Transcriber, 
  type TranscriptionResult 
} from "./transcriber";
export { 
  UtteranceStream, 
  detectWakeWord, 
  stripWakeWord, 
  isActionableCommand,
  type Utterance 
} from "./utteranceStream";
export { 
  processVoiceCommand, 
  validateVoiceCommandRequest,
  type VoiceCommandRequest,
  type VoiceCommandResult 
} from "./voiceCommandHandler";

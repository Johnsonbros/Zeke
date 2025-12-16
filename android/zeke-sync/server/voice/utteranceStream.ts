/**
 * Utterance Stream
 * 
 * Accumulates partial transcriptions into complete utterances based on
 * silence detection (~1 second gap). Handles wake word detection and
 * stripping to extract actionable commands.
 * 
 * Flow:
 *   Transcription text → accumulate → silence detected → emit utterance
 *                                                     → check for wake word
 *                                                     → strip wake word
 *                                                     → call handler
 */

import { log } from "../logger";
import type { TranscriptionResult } from "./transcriber";

export interface Utterance {
  text: string;           // Command with wake word stripped
  rawText: string;        // Original full text including wake word
  startedAt: number;      // When the utterance started (ms)
  endedAt: number;        // When the utterance ended (ms)
  hasWakeWord: boolean;   // Whether ZEKE wake word was detected
}

export type UtteranceHandler = (utterance: Utterance) => Promise<void>;

export interface UtteranceStreamConfig {
  silenceThresholdMs?: number;  // Silence duration to consider utterance complete
  tickIntervalMs?: number;      // How often to check for silence
  onUtterance: UtteranceHandler;
  onError?: (error: Error) => void;
}

const DEFAULT_SILENCE_THRESHOLD_MS = 1000;  // 1 second of silence = end of utterance
const DEFAULT_TICK_INTERVAL_MS = 200;       // Check every 200ms

// Wake word patterns - case insensitive matching
// Must start with or contain "ZEKE" followed by a command indicator
const WAKE_WORD_PATTERNS = [
  /^\s*(?:hey|hi|yo|okay|ok)\s+zeke\b/i,         // "Hey ZEKE...", "OK ZEKE..."
  /^\s*zeke\s*[,.]?\s*/i,                         // "ZEKE, ..." or "ZEKE ..."
];

// Pattern to find and strip wake word from beginning
const WAKE_WORD_STRIP_PATTERN = /^\s*(?:(?:hey|hi|yo|okay|ok)\s+)?zeke\s*[,.]?\s*/i;

export class UtteranceStream {
  private silenceThresholdMs: number;
  private tickIntervalMs: number;
  private onUtterance: UtteranceHandler;
  private onError: (error: Error) => void;

  private accumulatedText: string = "";
  private utteranceStartMs: number = 0;
  private lastTextTimeMs: number = 0;
  private isRunning: boolean = false;
  private tickTimer: NodeJS.Timeout | null = null;

  constructor(config: UtteranceStreamConfig) {
    this.silenceThresholdMs = config.silenceThresholdMs || DEFAULT_SILENCE_THRESHOLD_MS;
    this.tickIntervalMs = config.tickIntervalMs || DEFAULT_TICK_INTERVAL_MS;
    this.onUtterance = config.onUtterance;
    this.onError = config.onError || ((error) => log(`UtteranceStream error: ${error.message}`, "voice"));
  }

  /**
   * Start the utterance detection loop
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.reset();
    
    log(`UtteranceStream started (silence threshold: ${this.silenceThresholdMs}ms)`, "voice");
    this.scheduleTick();
  }

  /**
   * Stop the utterance detection loop
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }

    // Emit any pending utterance before stopping
    if (this.accumulatedText.trim()) {
      this.emitUtterance();
    }

    log("UtteranceStream stopped", "voice");
  }

  /**
   * Feed a transcription result into the stream
   */
  feed(result: TranscriptionResult): void {
    if (!result.text) {
      return;
    }

    const now = Date.now();

    // If this is the start of a new utterance
    if (!this.accumulatedText) {
      this.utteranceStartMs = result.startMs || now;
    }

    // Append text with space separator
    if (this.accumulatedText) {
      this.accumulatedText += " " + result.text;
    } else {
      this.accumulatedText = result.text;
    }

    this.lastTextTimeMs = now;
  }

  /**
   * Get current stream status
   */
  getStatus(): { running: boolean; pendingText: string; lastTextAge: number } {
    return {
      running: this.isRunning,
      pendingText: this.accumulatedText,
      lastTextAge: this.lastTextTimeMs ? Date.now() - this.lastTextTimeMs : 0,
    };
  }

  /**
   * Reset the accumulated state
   */
  private reset(): void {
    this.accumulatedText = "";
    this.utteranceStartMs = 0;
    this.lastTextTimeMs = 0;
  }

  /**
   * Schedule the next tick
   */
  private scheduleTick(): void {
    if (!this.isRunning) {
      return;
    }

    this.tickTimer = setTimeout(() => this.tick(), this.tickIntervalMs);
  }

  /**
   * Check for silence and emit utterance if detected
   */
  private async tick(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Check if we have pending text and enough silence has passed
      if (this.accumulatedText && this.lastTextTimeMs) {
        const silenceDuration = Date.now() - this.lastTextTimeMs;
        
        if (silenceDuration >= this.silenceThresholdMs) {
          await this.emitUtterance();
        }
      }
    } catch (error: any) {
      this.onError(error);
    }

    this.scheduleTick();
  }

  /**
   * Emit the accumulated utterance and reset
   */
  private async emitUtterance(): Promise<void> {
    const rawText = this.accumulatedText.trim();
    
    if (!rawText) {
      this.reset();
      return;
    }

    const startedAt = this.utteranceStartMs;
    const endedAt = this.lastTextTimeMs || Date.now();

    // Check for wake word
    const hasWakeWord = this.detectWakeWord(rawText);
    
    // Strip wake word if present
    const text = hasWakeWord ? this.stripWakeWord(rawText) : rawText;

    // Reset before async handler to allow new utterances to accumulate
    this.reset();

    // Only emit if we have actual content after stripping
    if (!text.trim()) {
      return;
    }

    const utterance: Utterance = {
      text: text.trim(),
      rawText,
      startedAt,
      endedAt,
      hasWakeWord,
    };

    log(`Utterance detected: "${utterance.text.substring(0, 50)}${utterance.text.length > 50 ? '...' : ''}" (hasWakeWord: ${hasWakeWord})`, "voice");

    try {
      await this.onUtterance(utterance);
    } catch (error: any) {
      this.onError(error);
    }
  }

  /**
   * Detect if the text contains a ZEKE wake word
   */
  private detectWakeWord(text: string): boolean {
    return WAKE_WORD_PATTERNS.some(pattern => pattern.test(text));
  }

  /**
   * Strip the wake word from the beginning of the text
   */
  private stripWakeWord(text: string): string {
    return text.replace(WAKE_WORD_STRIP_PATTERN, "").trim();
  }
}

// Utility functions for testing

/**
 * Detect wake word in text (exported for testing)
 */
export function detectWakeWord(text: string): boolean {
  return WAKE_WORD_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Strip wake word from text (exported for testing)
 */
export function stripWakeWord(text: string): string {
  if (!detectWakeWord(text)) {
    return text;
  }
  return text.replace(WAKE_WORD_STRIP_PATTERN, "").trim();
}

/**
 * Check if text looks like a command (has action indicators)
 */
export function isActionableCommand(text: string): boolean {
  const actionIndicators = [
    /^tell\b/i,
    /^text\b/i,
    /^message\b/i,
    /^send\b/i,
    /^remind\b/i,
    /^add\b/i,
    /^set\b/i,
    /^create\b/i,
    /^schedule\b/i,
    /^call\b/i,
    /^notify\b/i,
    /^let\b.*\bknow\b/i,
    /^ask\b/i,
    /^check\b/i,
    /^find\b/i,
    /^look\s+up\b/i,
    /^what\b/i,
    /^what's\b/i,
    /^who\b/i,
    /^where\b/i,
    /^when\b/i,
    /^how\b/i,
    /^how's\b/i,
    /^can\s+you\b/i,
    /^please\b/i,
    /^I\s+need\s+you\s+to\b/i,
    /^get\s+(me|the)\b/i,
    /^give\s+me\b/i,
    /\bweather\b/i,
    /\bforecast\b/i,
    /\bbriefing\b/i,
    /\bschedule\b/i,
  ];

  return actionIndicators.some(pattern => pattern.test(text.trim()));
}

// Singleton instance
let streamInstance: UtteranceStream | null = null;

/**
 * Get or create the utterance stream instance
 */
export function getUtteranceStream(config?: UtteranceStreamConfig): UtteranceStream | null {
  if (!streamInstance && config) {
    streamInstance = new UtteranceStream(config);
  }
  return streamInstance;
}

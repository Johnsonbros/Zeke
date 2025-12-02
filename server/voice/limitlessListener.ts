/**
 * Limitless Audio Listener
 * 
 * Continuously polls the Limitless API for pendant audio and feeds chunks
 * to the transcription pipeline. Implements rate limiting, backoff on 429,
 * and graceful error handling.
 * 
 * API: GET /v1/download-audio?audioSource=pendant&startMs=X&endMs=Y
 * Constraints:
 *   - Max 180 requests/min (~3/sec)
 *   - startMs < endMs
 *   - Time window ≤ 2 hours
 *   - On 429: back off using retryAfter header
 *   - On 404: no audio for window, advance timestamps
 */

import { log } from "../logger";

export interface AudioChunk {
  startMs: number;
  endMs: number;
  data: Buffer;
}

export type AudioHandler = (chunk: AudioChunk) => Promise<void>;

export interface LimitlessListenerConfig {
  apiBaseUrl?: string;
  apiKey?: string;
  pollIntervalMs?: number;
  onAudioChunk: AudioHandler;
  onError?: (error: Error) => void;
}

const DEFAULT_API_BASE_URL = "https://api.limitless.ai";
const DEFAULT_POLL_INTERVAL_MS = 800;
const MAX_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours max
const MIN_WINDOW_MS = 100; // Minimum window to request

export class LimitlessListener {
  private apiBaseUrl: string;
  private apiKey: string;
  private pollIntervalMs: number;
  private onAudioChunk: AudioHandler;
  private onError: (error: Error) => void;
  
  private lastEndMs: number;
  private isRunning: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private backoffUntil: number = 0;
  private consecutiveErrors: number = 0;

  constructor(config: LimitlessListenerConfig) {
    this.apiBaseUrl = config.apiBaseUrl || process.env.LIMITLESS_API_BASE_URL || DEFAULT_API_BASE_URL;
    this.apiKey = config.apiKey || process.env.LIMITLESS_API_KEY || "";
    this.pollIntervalMs = config.pollIntervalMs || parseInt(process.env.LIMITLESS_POLL_INTERVAL_MS || String(DEFAULT_POLL_INTERVAL_MS), 10);
    this.onAudioChunk = config.onAudioChunk;
    this.onError = config.onError || ((error) => log(`Limitless error: ${error.message}`, "voice"));
    
    // Initialize lastEndMs to now - 1 second (start capturing from recent audio)
    this.lastEndMs = Date.now() - 1000;
  }

  /**
   * Check if the Limitless API key is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Start the audio polling loop
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
    this.lastEndMs = Date.now() - 1000;
    this.consecutiveErrors = 0;
    
    log(`Starting Limitless listener (poll interval: ${this.pollIntervalMs}ms)`, "voice");
    this.schedulePoll();
  }

  /**
   * Stop the audio polling loop
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
  getStatus(): { running: boolean; lastEndMs: number; consecutiveErrors: number; backoffUntil: number } {
    return {
      running: this.isRunning,
      lastEndMs: this.lastEndMs,
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
   * Perform a single poll for audio
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      const now = Date.now();
      const startMs = this.lastEndMs;
      let endMs = now;

      // Ensure window doesn't exceed 2 hours
      if (endMs - startMs > MAX_WINDOW_MS) {
        endMs = startMs + MAX_WINDOW_MS;
        log(`Capping audio window to 2 hours`, "voice");
      }

      // Skip if window is too small
      if (endMs - startMs < MIN_WINDOW_MS) {
        this.schedulePoll();
        return;
      }

      const audioData = await this.fetchAudio(startMs, endMs);

      if (audioData) {
        const chunk: AudioChunk = {
          startMs,
          endMs,
          data: audioData,
        };

        try {
          await this.onAudioChunk(chunk);
        } catch (handlerError: any) {
          log(`Audio chunk handler error: ${handlerError.message}`, "voice");
        }
      }

      // Advance timestamp regardless of whether audio was returned
      this.lastEndMs = endMs;
      this.consecutiveErrors = 0;

    } catch (error: any) {
      this.consecutiveErrors++;
      this.onError(error);
      
      // Apply exponential backoff for repeated errors
      if (this.consecutiveErrors > 5) {
        const backoffMs = Math.min(30000, 1000 * Math.pow(2, this.consecutiveErrors - 5));
        this.backoffUntil = Date.now() + backoffMs;
        log(`Backing off for ${backoffMs}ms after ${this.consecutiveErrors} consecutive errors`, "voice");
      }
    }

    this.schedulePoll();
  }

  /**
   * Fetch audio from the Limitless API
   */
  private async fetchAudio(startMs: number, endMs: number): Promise<Buffer | null> {
    const url = new URL(`${this.apiBaseUrl}/v1/download-audio`);
    url.searchParams.set("audioSource", "pendant");
    url.searchParams.set("startMs", String(startMs));
    url.searchParams.set("endMs", String(endMs));

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-API-KEY": this.apiKey,
        "Accept": "audio/ogg",
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (response.status === 429) {
      // Rate limited - parse retryAfter header
      const retryAfter = response.headers.get("Retry-After");
      const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
      this.backoffUntil = Date.now() + retryMs;
      log(`Rate limited by Limitless API, backing off ${retryMs}ms`, "voice");
      throw new Error(`Rate limited, retry after ${retryMs}ms`);
    }

    if (response.status === 404) {
      // No audio available for this window - this is normal
      return null;
    }

    if (!response.ok) {
      throw new Error(`Limitless API error: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Build the URL for a specific time window (useful for testing)
   */
  static buildAudioUrl(baseUrl: string, startMs: number, endMs: number): string {
    const url = new URL(`${baseUrl}/v1/download-audio`);
    url.searchParams.set("audioSource", "pendant");
    url.searchParams.set("startMs", String(startMs));
    url.searchParams.set("endMs", String(endMs));
    return url.toString();
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
 * Check if the voice pipeline is available (API key configured)
 */
export function isVoicePipelineAvailable(): boolean {
  return !!(process.env.LIMITLESS_API_KEY);
}

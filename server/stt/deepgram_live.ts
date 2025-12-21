/**
 * Deepgram Live STT Bridge
 * 
 * Connects to Deepgram's streaming WebSocket API for real-time transcription.
 * Requires DEEPGRAM_API_KEY environment variable.
 * 
 * Features:
 * - Diarization (speaker identification)
 * - Punctuation
 * - Configurable endpointing
 * - Binary PCM16LE streaming (no base64)
 */

import WebSocket from "ws";
import { log } from "../logger";
import type { TranscriptSegmentEvent, SttProvider } from "@shared/schema";

const DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen";

export interface DeepgramConfig {
  sampleRate?: number;
  channels?: number;
  encoding?: string;
  diarize?: boolean;
  punctuate?: boolean;
  endpointing?: number;
  language?: string;
  model?: string;
}

export interface DeepgramBridgeEvents {
  onTranscript: (segment: TranscriptSegmentEvent) => void;
  onError: (error: Error) => void;
  onClose: () => void;
  onOpen: () => void;
}

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
  punctuated_word?: string;
}

interface DeepgramAlternative {
  transcript: string;
  confidence: number;
  words?: DeepgramWord[];
}

interface DeepgramChannel {
  alternatives: DeepgramAlternative[];
}

interface DeepgramResponse {
  type: string;
  channel_index?: number[];
  duration?: number;
  start?: number;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: DeepgramChannel;
  metadata?: {
    request_id: string;
    model_info?: {
      name: string;
      version: string;
    };
  };
}

export class DeepgramLiveBridge {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private config: Required<DeepgramConfig>;
  private events: DeepgramBridgeEvents;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;

  constructor(
    sessionId: string,
    events: DeepgramBridgeEvents,
    config: DeepgramConfig = {}
  ) {
    this.sessionId = sessionId;
    this.events = events;
    this.config = {
      sampleRate: config.sampleRate || 16000,
      channels: config.channels || 1,
      encoding: config.encoding || "linear16",
      diarize: config.diarize !== false,
      punctuate: config.punctuate !== false,
      endpointing: config.endpointing || 300,
      language: config.language || "en",
      model: config.model || "nova-2",
    };
  }

  async connect(): Promise<boolean> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    
    if (!apiKey) {
      const error = new Error("DEEPGRAM_API_KEY environment variable is not set");
      log(`[DeepgramBridge] ${error.message}`, "stt");
      this.events.onError(error);
      return false;
    }

    const params = new URLSearchParams({
      encoding: this.config.encoding,
      sample_rate: this.config.sampleRate.toString(),
      channels: this.config.channels.toString(),
      diarize: this.config.diarize.toString(),
      punctuate: this.config.punctuate.toString(),
      endpointing: this.config.endpointing.toString(),
      language: this.config.language,
      model: this.config.model,
    });

    const url = `${DEEPGRAM_WS_URL}?${params.toString()}`;

    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(url, {
          headers: {
            Authorization: `Token ${apiKey}`,
          },
        });

        this.ws.on("open", () => {
          log(`[DeepgramBridge] Connected for session ${this.sessionId}`, "stt");
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.events.onOpen();
          resolve(true);
        });

        this.ws.on("message", (data: WebSocket.Data) => {
          this.handleMessage(data);
        });

        this.ws.on("error", (error: Error) => {
          log(`[DeepgramBridge] WebSocket error: ${error.message}`, "stt");
          this.events.onError(error);
        });

        this.ws.on("close", (code: number, reason: Buffer) => {
          log(`[DeepgramBridge] Connection closed: ${code} - ${reason.toString()}`, "stt");
          this.isConnected = false;
          this.events.onClose();
        });

        setTimeout(() => {
          if (!this.isConnected) {
            log(`[DeepgramBridge] Connection timeout for session ${this.sessionId}`, "stt");
            resolve(false);
          }
        }, 10000);

      } catch (error: any) {
        log(`[DeepgramBridge] Failed to connect: ${error.message}`, "stt");
        this.events.onError(error);
        resolve(false);
      }
    });
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const response: DeepgramResponse = JSON.parse(data.toString());

      if (response.type === "Results" && response.channel) {
        const channel = response.channel;
        const alternative = channel.alternatives?.[0];

        if (alternative && alternative.transcript) {
          const words = alternative.words || [];
          
          let speakerLabel = "SPEAKER_0";
          if (words.length > 0 && words[0].speaker !== undefined) {
            speakerLabel = `SPEAKER_${words[0].speaker}`;
          }

          const startMs = Math.round((response.start || 0) * 1000);
          const endMs = Math.round(((response.start || 0) + (response.duration || 0)) * 1000);

          const segment: TranscriptSegmentEvent = {
            type: "transcript_segment",
            sessionId: this.sessionId,
            speaker: speakerLabel,
            startMs,
            endMs,
            text: alternative.transcript,
            confidence: alternative.confidence || 0,
            isFinal: response.is_final || false,
            provider: "deepgram" as SttProvider,
          };

          this.events.onTranscript(segment);
        }
      }
    } catch (error: any) {
      log(`[DeepgramBridge] Failed to parse message: ${error.message}`, "stt");
    }
  }

  sendAudio(pcmData: Buffer): boolean {
    if (!this.ws || !this.isConnected) {
      return false;
    }

    try {
      this.ws.send(pcmData);
      return true;
    } catch (error: any) {
      log(`[DeepgramBridge] Failed to send audio: ${error.message}`, "stt");
      return false;
    }
  }

  isReady(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  async close(): Promise<void> {
    if (this.ws) {
      try {
        this.ws.send(JSON.stringify({ type: "CloseStream" }));
      } catch (e) {
      }

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.ws) {
            this.ws.terminate();
          }
          resolve();
        }, 2000);

        if (this.ws) {
          this.ws.once("close", () => {
            clearTimeout(timeout);
            resolve();
          });
          this.ws.close();
        } else {
          clearTimeout(timeout);
          resolve();
        }
      });

      this.ws = null;
      this.isConnected = false;
    }
  }
}

export function createDeepgramBridge(
  sessionId: string,
  events: DeepgramBridgeEvents,
  config?: DeepgramConfig
): DeepgramLiveBridge {
  return new DeepgramLiveBridge(sessionId, events, config);
}

export function isDeepgramConfigured(): boolean {
  return !!process.env.DEEPGRAM_API_KEY;
}

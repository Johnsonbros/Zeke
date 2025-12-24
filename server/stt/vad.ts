/**
 * Voice Activity Detection (VAD) Module
 * 
 * Uses WebRTC VAD to detect speech in PCM audio streams.
 * Filters silence to reduce Deepgram API costs by ~50%.
 * 
 * Input: PCM16LE audio at 16kHz mono
 * Output: Only audio chunks containing detected speech
 */

import VAD from "node-vad";
import { log } from "../logger";

export enum VADMode {
  NORMAL = VAD.Mode.NORMAL,
  LOW_BITRATE = VAD.Mode.LOW_BITRATE,
  AGGRESSIVE = VAD.Mode.AGGRESSIVE,
  VERY_AGGRESSIVE = VAD.Mode.VERY_AGGRESSIVE,
}

export interface VADConfig {
  mode?: VADMode;
  sampleRate?: number;
  debounceTime?: number;
  preSpeechPadMs?: number;
  postSpeechPadMs?: number;
}

export interface VADStats {
  framesProcessed: number;
  speechFrames: number;
  silenceFrames: number;
  currentState: "speech" | "silence";
  speechRatio: number;
}

export type VADEvent = "speech_start" | "speech_end" | "speech" | "silence";

export interface VADResult {
  event: VADEvent;
  audio: Buffer | null;
}

const DEFAULT_SAMPLE_RATE = 16000;
const DEFAULT_DEBOUNCE_MS = 500;
const DEFAULT_PRE_SPEECH_PAD_MS = 300;
const DEFAULT_POST_SPEECH_PAD_MS = 300;

export class VoiceActivityDetector {
  private vad: any;
  private sampleRate: number;
  private debounceTime: number;
  private preSpeechPadMs: number;
  private postSpeechPadMs: number;
  
  private currentState: "speech" | "silence" = "silence";
  private silenceStartTime: number = 0;
  private speechStartTime: number = 0;
  private preSpeechBuffer: Buffer[] = [];
  private preSpeechBufferDurationMs: number = 0;
  
  private stats: VADStats = {
    framesProcessed: 0,
    speechFrames: 0,
    silenceFrames: 0,
    currentState: "silence",
    speechRatio: 0,
  };

  constructor(config: VADConfig = {}) {
    const mode = config.mode ?? VADMode.NORMAL;
    this.sampleRate = config.sampleRate ?? DEFAULT_SAMPLE_RATE;
    this.debounceTime = config.debounceTime ?? DEFAULT_DEBOUNCE_MS;
    this.preSpeechPadMs = config.preSpeechPadMs ?? DEFAULT_PRE_SPEECH_PAD_MS;
    this.postSpeechPadMs = config.postSpeechPadMs ?? DEFAULT_POST_SPEECH_PAD_MS;
    
    this.vad = new VAD(mode);
    
    log(`[VAD] Initialized: mode=${VADMode[mode]}, sampleRate=${this.sampleRate}Hz, debounce=${this.debounceTime}ms`, "stt");
  }

  private getFrameDurationMs(bufferLength: number): number {
    const bytesPerSample = 2;
    const samples = bufferLength / bytesPerSample;
    return (samples / this.sampleRate) * 1000;
  }

  private addToPreSpeechBuffer(chunk: Buffer): void {
    const chunkDurationMs = this.getFrameDurationMs(chunk.length);
    this.preSpeechBuffer.push(chunk);
    this.preSpeechBufferDurationMs += chunkDurationMs;
    
    while (this.preSpeechBufferDurationMs > this.preSpeechPadMs && this.preSpeechBuffer.length > 1) {
      const removed = this.preSpeechBuffer.shift();
      if (removed) {
        this.preSpeechBufferDurationMs -= this.getFrameDurationMs(removed.length);
      }
    }
  }

  private getPreSpeechBuffer(): Buffer | null {
    if (this.preSpeechBuffer.length === 0) return null;
    const buffer = Buffer.concat(this.preSpeechBuffer);
    this.preSpeechBuffer = [];
    this.preSpeechBufferDurationMs = 0;
    return buffer;
  }

  async processChunk(pcmChunk: Buffer): Promise<VADResult> {
    this.stats.framesProcessed++;
    
    try {
      const result = await this.vad.processAudio(pcmChunk, this.sampleRate);
      const now = Date.now();
      
      if (result === VAD.Event.VOICE) {
        this.stats.speechFrames++;
        
        if (this.currentState === "silence") {
          this.currentState = "speech";
          this.speechStartTime = now;
          this.stats.currentState = "speech";
          
          const preSpeechAudio = this.getPreSpeechBuffer();
          const combinedAudio = preSpeechAudio 
            ? Buffer.concat([preSpeechAudio, pcmChunk])
            : pcmChunk;
          
          log(`[VAD] Speech started (pre-buffer: ${preSpeechAudio?.length || 0} bytes)`, "stt");
          
          return {
            event: "speech_start",
            audio: combinedAudio,
          };
        }
        
        return {
          event: "speech",
          audio: pcmChunk,
        };
        
      } else {
        this.stats.silenceFrames++;
        
        if (this.currentState === "speech") {
          if (this.silenceStartTime === 0) {
            this.silenceStartTime = now;
          }
          
          const silenceDuration = now - this.silenceStartTime;
          
          if (silenceDuration >= this.debounceTime) {
            this.currentState = "silence";
            this.silenceStartTime = 0;
            this.stats.currentState = "silence";
            
            const speechDuration = now - this.speechStartTime;
            log(`[VAD] Speech ended (duration: ${speechDuration}ms)`, "stt");
            
            return {
              event: "speech_end",
              audio: pcmChunk,
            };
          }
          
          return {
            event: "speech",
            audio: pcmChunk,
          };
        }
        
        this.silenceStartTime = 0;
        this.addToPreSpeechBuffer(pcmChunk);
        
        return {
          event: "silence",
          audio: null,
        };
      }
      
    } catch (error: any) {
      log(`[VAD] Error processing chunk: ${error.message}`, "stt");
      return {
        event: "silence",
        audio: null,
      };
    }
  }

  getStats(): VADStats {
    const total = this.stats.speechFrames + this.stats.silenceFrames;
    return {
      ...this.stats,
      speechRatio: total > 0 ? this.stats.speechFrames / total : 0,
    };
  }

  isInSpeech(): boolean {
    return this.currentState === "speech";
  }

  reset(): void {
    this.currentState = "silence";
    this.silenceStartTime = 0;
    this.speechStartTime = 0;
    this.preSpeechBuffer = [];
    this.preSpeechBufferDurationMs = 0;
    this.stats = {
      framesProcessed: 0,
      speechFrames: 0,
      silenceFrames: 0,
      currentState: "silence",
      speechRatio: 0,
    };
    log("[VAD] Reset", "stt");
  }
}

export function createVAD(config: VADConfig = {}): VoiceActivityDetector {
  return new VoiceActivityDetector(config);
}

export function isVADAvailable(): boolean {
  try {
    new VAD(VAD.Mode.NORMAL);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opus Decoder Module for STT Pipeline
 * 
 * Decodes raw Opus packets to PCM16LE mono at 16kHz.
 * Supports bounded buffering with backpressure handling.
 * 
 * Frame Format: raw_opus_packets (individual Opus packets, not OGG container)
 * Output: PCM16LE mono @ 16000Hz
 */

import OpusScript from "opusscript";
import { log } from "../logger";

const TARGET_SAMPLE_RATE = 16000;
const CHANNELS = 1;
const FRAME_DURATION_MS = 20;
const SAMPLES_PER_FRAME = (TARGET_SAMPLE_RATE * FRAME_DURATION_MS) / 1000;
const MAX_BUFFER_SECONDS = 3;
const MAX_BUFFERED_FRAMES = Math.floor((MAX_BUFFER_SECONDS * 1000) / FRAME_DURATION_MS);

export interface DecoderStats {
  framesDecoded: number;
  framesDropped: number;
  bytesProcessed: number;
  lastDecodeTimeMs: number;
}

export interface OpusDecoderConfig {
  sampleRate?: number;
  channels?: number;
  maxBufferSeconds?: number;
}

export class OpusDecoder {
  private decoder: OpusScript;
  private sampleRate: number;
  private channels: number;
  private maxBufferedFrames: number;
  private pcmBuffer: Buffer[] = [];
  private stats: DecoderStats = {
    framesDecoded: 0,
    framesDropped: 0,
    bytesProcessed: 0,
    lastDecodeTimeMs: 0,
  };
  private downstreamReady: boolean = true;

  constructor(config: OpusDecoderConfig = {}) {
    this.sampleRate = config.sampleRate || TARGET_SAMPLE_RATE;
    this.channels = config.channels || CHANNELS;
    this.maxBufferedFrames = Math.floor(
      ((config.maxBufferSeconds || MAX_BUFFER_SECONDS) * 1000) / FRAME_DURATION_MS
    );

    this.decoder = new OpusScript(this.sampleRate, this.channels, OpusScript.Application.VOIP);
    log(`[OpusDecoder] Initialized: ${this.sampleRate}Hz, ${this.channels}ch, max buffer: ${this.maxBufferedFrames} frames`, "stt");
  }

  setDownstreamReady(ready: boolean): void {
    this.downstreamReady = ready;
  }

  decodePacket(opusData: Buffer | Uint8Array): Buffer | null {
    const startTime = Date.now();
    
    try {
      const inputBuffer = Buffer.isBuffer(opusData) ? opusData : Buffer.from(opusData);
      
      if (inputBuffer.length === 0) {
        return null;
      }

      const pcmData = this.decoder.decode(inputBuffer);
      
      if (!pcmData || pcmData.length === 0) {
        return null;
      }

      const pcmBuffer = Buffer.from(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength);
      
      this.stats.framesDecoded++;
      this.stats.bytesProcessed += inputBuffer.length;
      this.stats.lastDecodeTimeMs = Date.now() - startTime;

      if (!this.downstreamReady) {
        if (this.pcmBuffer.length >= this.maxBufferedFrames) {
          this.pcmBuffer.shift();
          this.stats.framesDropped++;
          log(`[OpusDecoder] Buffer full, dropped oldest frame. Total dropped: ${this.stats.framesDropped}`, "stt");
        }
        this.pcmBuffer.push(pcmBuffer);
        return null;
      }

      if (this.pcmBuffer.length > 0) {
        const bufferedData = Buffer.concat([...this.pcmBuffer, pcmBuffer]);
        this.pcmBuffer = [];
        return bufferedData;
      }

      return pcmBuffer;
    } catch (error: any) {
      log(`[OpusDecoder] Decode error: ${error.message}`, "stt");
      return null;
    }
  }

  flushBuffer(): Buffer | null {
    if (this.pcmBuffer.length === 0) {
      return null;
    }
    const data = Buffer.concat(this.pcmBuffer);
    this.pcmBuffer = [];
    return data;
  }

  getStats(): DecoderStats {
    return { ...this.stats };
  }

  getBufferedFrameCount(): number {
    return this.pcmBuffer.length;
  }

  reset(): void {
    this.pcmBuffer = [];
    this.stats = {
      framesDecoded: 0,
      framesDropped: 0,
      bytesProcessed: 0,
      lastDecodeTimeMs: 0,
    };
    this.downstreamReady = true;
  }

  destroy(): void {
    try {
      this.decoder.delete();
    } catch (e) {
    }
    this.pcmBuffer = [];
  }
}

export function createOpusDecoder(config?: OpusDecoderConfig): OpusDecoder {
  return new OpusDecoder(config);
}

export function validateSampleRate(actualRate: number): boolean {
  if (actualRate !== TARGET_SAMPLE_RATE) {
    log(`[OpusDecoder] WARNING: Sample rate mismatch. Expected ${TARGET_SAMPLE_RATE}Hz, got ${actualRate}Hz. Resampling may be required.`, "stt");
    return false;
  }
  return true;
}

/**
 * Transcriber Interface & OpenAI Whisper Implementation
 * 
 * Provides a pluggable transcription layer for converting audio to text.
 * The initial implementation uses OpenAI's Whisper API, but the interface
 * allows for easy swapping to Deepgram, local Whisper, or other providers.
 */

import OpenAI from "openai";
import { log } from "../logger";
import type { AudioChunk } from "./limitlessListener";

export interface TranscriptionResult {
  text: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  confidence?: number;
}

export interface Transcriber {
  transcribeChunk(chunk: AudioChunk): Promise<TranscriptionResult | null>;
}

/**
 * OpenAI Whisper-based transcriber
 */
export class WhisperTranscriber implements Transcriber {
  private client: OpenAI | null = null;
  private model: string;

  constructor(model: string = "whisper-1") {
    this.model = model;
  }

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is required for Whisper transcription");
      }
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  async transcribeChunk(chunk: AudioChunk): Promise<TranscriptionResult | null> {
    if (chunk.data.length === 0) {
      return null;
    }

    try {
      const client = this.getClient();
      
      // Create a File-like object from the buffer
      // Whisper expects audio files with proper extensions
      const audioFile = new File([chunk.data], "audio.ogg", { 
        type: "audio/ogg" 
      });

      const transcription = await client.audio.transcriptions.create({
        model: this.model,
        file: audioFile,
        language: "en",
        response_format: "json",
      });

      const text = transcription.text?.trim();
      
      if (!text) {
        return null;
      }

      return {
        text,
        startMs: chunk.startMs,
        endMs: chunk.endMs,
        durationMs: chunk.endMs - chunk.startMs,
      };
    } catch (error: any) {
      // Don't log for empty/silent audio chunks which are expected
      if (error.message?.includes("audio file is too short") || 
          error.message?.includes("Invalid audio")) {
        return null;
      }
      
      log(`Transcription error: ${error.message}`, "voice");
      throw error;
    }
  }
}

/**
 * Mock transcriber for testing purposes
 */
export class MockTranscriber implements Transcriber {
  private responses: string[] = [];
  private index: number = 0;

  constructor(responses: string[] = []) {
    this.responses = responses;
  }

  addResponse(text: string): void {
    this.responses.push(text);
  }

  async transcribeChunk(chunk: AudioChunk): Promise<TranscriptionResult | null> {
    if (this.index >= this.responses.length) {
      return null;
    }

    const text = this.responses[this.index++];
    
    return {
      text,
      startMs: chunk.startMs,
      endMs: chunk.endMs,
      durationMs: chunk.endMs - chunk.startMs,
    };
  }
}

// Singleton instance
let transcriberInstance: Transcriber | null = null;

/**
 * Get or create the default transcriber instance
 */
export function getTranscriber(): Transcriber {
  if (!transcriberInstance) {
    transcriberInstance = new WhisperTranscriber();
  }
  return transcriberInstance;
}

/**
 * Set a custom transcriber (useful for testing)
 */
export function setTranscriber(transcriber: Transcriber): void {
  transcriberInstance = transcriber;
}

/**
 * Check if transcription is available (OpenAI API key configured)
 */
export function isTranscriptionAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

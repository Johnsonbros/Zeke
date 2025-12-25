/**
 * Client-side Voice Activity Detection (VAD) Service
 * 
 * Provides voice activity detection for Android native builds.
 * Uses energy-based detection for lightweight processing on mobile devices.
 * 
 * For Expo Go testing, this runs in mock mode.
 * For native Android builds, this uses real audio processing.
 */

import { Platform } from "react-native";
import { Buffer } from "buffer";

export interface VADConfig {
  sampleRate: number;
  frameSize: number;
  energyThreshold: number;
  silenceThreshold: number;
  speechMinDurationMs: number;
  silenceMinDurationMs: number;
}

export interface VADResult {
  isSpeech: boolean;
  energy: number;
  speechDurationMs: number;
  silenceDurationMs: number;
}

const DEFAULT_CONFIG: VADConfig = {
  sampleRate: 16000,
  frameSize: 480, // 30ms at 16kHz
  energyThreshold: 0.01,
  silenceThreshold: 0.005,
  speechMinDurationMs: 250,
  silenceMinDurationMs: 500,
};

class VADClient {
  private config: VADConfig;
  private isSpeaking: boolean = false;
  private speechStartTime: number = 0;
  private silenceStartTime: number = 0;
  private energyHistory: number[] = [];
  private readonly SMOOTHING_FRAMES = 3;

  constructor(config: Partial<VADConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Calculate RMS energy of audio samples
   */
  private calculateEnergy(samples: Float32Array | Int16Array): number {
    let sum = 0;
    const length = samples.length;

    if (samples instanceof Int16Array) {
      // Normalize 16-bit samples to [-1, 1]
      for (let i = 0; i < length; i++) {
        const normalized = samples[i] / 32768;
        sum += normalized * normalized;
      }
    } else {
      for (let i = 0; i < length; i++) {
        sum += samples[i] * samples[i];
      }
    }

    return Math.sqrt(sum / length);
  }

  /**
   * Apply smoothing to energy values
   */
  private smoothEnergy(energy: number): number {
    this.energyHistory.push(energy);
    if (this.energyHistory.length > this.SMOOTHING_FRAMES) {
      this.energyHistory.shift();
    }

    const sum = this.energyHistory.reduce((a, b) => a + b, 0);
    return sum / this.energyHistory.length;
  }

  /**
   * Process an audio frame and detect voice activity
   */
  processFrame(samples: Float32Array | Int16Array): VADResult {
    const rawEnergy = this.calculateEnergy(samples);
    const smoothedEnergy = this.smoothEnergy(rawEnergy);
    const now = Date.now();

    const isAboveThreshold = smoothedEnergy > this.config.energyThreshold;
    const isBelowSilence = smoothedEnergy < this.config.silenceThreshold;

    let speechDurationMs = 0;
    let silenceDurationMs = 0;

    if (isAboveThreshold && !this.isSpeaking) {
      // Potential speech start
      if (this.speechStartTime === 0) {
        this.speechStartTime = now;
      }
      speechDurationMs = now - this.speechStartTime;

      if (speechDurationMs >= this.config.speechMinDurationMs) {
        this.isSpeaking = true;
        this.silenceStartTime = 0;
      }
    } else if (isBelowSilence && this.isSpeaking) {
      // Potential speech end
      if (this.silenceStartTime === 0) {
        this.silenceStartTime = now;
      }
      silenceDurationMs = now - this.silenceStartTime;

      if (silenceDurationMs >= this.config.silenceMinDurationMs) {
        this.isSpeaking = false;
        this.speechStartTime = 0;
      }
    } else if (isAboveThreshold && this.isSpeaking) {
      // Continue speaking, reset silence timer
      this.silenceStartTime = 0;
      speechDurationMs = now - this.speechStartTime;
    } else if (!isAboveThreshold && !this.isSpeaking) {
      // Silence, reset speech timer
      this.speechStartTime = 0;
    }

    return {
      isSpeech: this.isSpeaking,
      energy: smoothedEnergy,
      speechDurationMs,
      silenceDurationMs,
    };
  }

  /**
   * Process base64-encoded audio data
   * Uses Buffer which is available in React Native
   */
  processBase64Audio(base64Data: string): VADResult {
    try {
      // Decode base64 to binary using Buffer (React Native compatible)
      const buffer = Buffer.from(base64Data, "base64");
      const bytes = new Uint8Array(buffer);

      // Convert to Int16Array (16-bit PCM)
      const samples = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
      return this.processFrame(samples);
    } catch (error) {
      console.error("[VAD Client] Error processing audio:", error);
      return {
        isSpeech: false,
        energy: 0,
        speechDurationMs: 0,
        silenceDurationMs: 0,
      };
    }
  }

  /**
   * Reset the VAD state
   */
  reset(): void {
    this.isSpeaking = false;
    this.speechStartTime = 0;
    this.silenceStartTime = 0;
    this.energyHistory = [];
  }

  /**
   * Get current speaking state
   */
  get speaking(): boolean {
    return this.isSpeaking;
  }

  /**
   * Check if VAD is supported on this platform
   */
  static isSupported(): boolean {
    // VAD works on all platforms, but audio capture may be limited
    return Platform.OS === "android" || Platform.OS === "ios";
  }
}

// Singleton instance
let vadClientInstance: VADClient | null = null;

export function getVADClient(config?: Partial<VADConfig>): VADClient {
  if (!vadClientInstance) {
    vadClientInstance = new VADClient(config);
  }
  return vadClientInstance;
}

export function resetVADClient(): void {
  if (vadClientInstance) {
    vadClientInstance.reset();
  }
}

export { VADClient };

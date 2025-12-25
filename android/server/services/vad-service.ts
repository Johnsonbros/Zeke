/**
 * Voice Activity Detection (VAD) Service
 * 
 * Detects speech activity in audio streams to:
 * - Reduce transcription costs by filtering silence
 * - Identify speech segments for processing
 * - Trigger conversation start/end events
 * 
 * Uses energy-based detection with smoothing for reliable results.
 * For production, consider Silero VAD or WebRTC VAD integration.
 */

export interface VADConfig {
  sampleRate: number;
  frameSize: number;
  energyThreshold: number;
  silenceThreshold: number;
  speechMinDuration: number;
  silenceMinDuration: number;
  smoothingFrames: number;
}

export interface VADResult {
  isSpeech: boolean;
  energy: number;
  probability: number;
  timestamp: number;
}

export interface SpeechSegment {
  startTime: number;
  endTime: number;
  duration: number;
  audioData: Int16Array;
}

export type VADEventType = "speech_start" | "speech_end" | "speech_segment";

export interface VADEvent {
  type: VADEventType;
  timestamp: number;
  segment?: SpeechSegment;
}

type VADEventCallback = (event: VADEvent) => void;

const DEFAULT_CONFIG: VADConfig = {
  sampleRate: 16000,
  frameSize: 480,
  energyThreshold: 0.01,
  silenceThreshold: 0.005,
  speechMinDuration: 250,
  silenceMinDuration: 500,
  smoothingFrames: 3,
};

class VADService {
  private config: VADConfig;
  private isSpeaking = false;
  private speechStartTime = 0;
  private silenceStartTime = 0;
  private currentSegmentAudio: Int16Array[] = [];
  private energyHistory: number[] = [];
  private eventCallbacks: VADEventCallback[] = [];
  private frameCount = 0;

  constructor(config: Partial<VADConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    console.log("[VAD Service] Initialized with config:", this.config);
  }

  /**
   * Process an audio frame and detect speech
   */
  public processFrame(pcmData: Int16Array): VADResult {
    const energy = this.calculateEnergy(pcmData);
    const smoothedEnergy = this.smoothEnergy(energy);
    const probability = this.energyToProbability(smoothedEnergy);
    const isSpeech = probability > 0.5;
    const timestamp = (this.frameCount * this.config.frameSize / this.config.sampleRate) * 1000;

    this.frameCount++;

    this.updateSpeechState(isSpeech, pcmData, timestamp);

    return {
      isSpeech,
      energy: smoothedEnergy,
      probability,
      timestamp,
    };
  }

  /**
   * Calculate RMS energy of audio frame
   */
  private calculateEnergy(pcmData: Int16Array): number {
    if (pcmData.length === 0) return 0;

    let sumSquares = 0;
    for (let i = 0; i < pcmData.length; i++) {
      const normalized = pcmData[i] / 32768;
      sumSquares += normalized * normalized;
    }

    return Math.sqrt(sumSquares / pcmData.length);
  }

  /**
   * Apply smoothing to energy values
   */
  private smoothEnergy(energy: number): number {
    this.energyHistory.push(energy);
    
    if (this.energyHistory.length > this.config.smoothingFrames) {
      this.energyHistory.shift();
    }

    const sum = this.energyHistory.reduce((a, b) => a + b, 0);
    return sum / this.energyHistory.length;
  }

  /**
   * Convert energy to speech probability
   */
  private energyToProbability(energy: number): number {
    const threshold = this.config.energyThreshold;
    const silenceThreshold = this.config.silenceThreshold;

    if (energy < silenceThreshold) {
      return 0;
    }

    if (energy >= threshold) {
      return Math.min(1, 0.5 + (energy - threshold) / threshold);
    }

    return 0.5 * (energy - silenceThreshold) / (threshold - silenceThreshold);
  }

  /**
   * Update speech detection state machine
   */
  private updateSpeechState(isSpeech: boolean, pcmData: Int16Array, timestamp: number): void {
    if (isSpeech) {
      if (!this.isSpeaking) {
        const silenceDuration = timestamp - this.silenceStartTime;
        
        if (silenceDuration >= this.config.speechMinDuration || this.silenceStartTime === 0) {
          this.isSpeaking = true;
          this.speechStartTime = timestamp;
          this.currentSegmentAudio = [];
          
          this.emitEvent({
            type: "speech_start",
            timestamp,
          });
        }
      }

      if (this.isSpeaking) {
        this.currentSegmentAudio.push(pcmData);
      }
    } else {
      if (this.isSpeaking) {
        if (this.silenceStartTime === 0) {
          this.silenceStartTime = timestamp;
        }

        const silenceDuration = timestamp - this.silenceStartTime;
        
        if (silenceDuration >= this.config.silenceMinDuration) {
          const speechDuration = this.silenceStartTime - this.speechStartTime;
          
          if (speechDuration >= this.config.speechMinDuration) {
            const segment = this.createSpeechSegment(this.speechStartTime, this.silenceStartTime);
            
            this.emitEvent({
              type: "speech_end",
              timestamp: this.silenceStartTime,
            });

            this.emitEvent({
              type: "speech_segment",
              timestamp: this.speechStartTime,
              segment,
            });
          }

          this.isSpeaking = false;
          this.currentSegmentAudio = [];
        }
      } else {
        this.silenceStartTime = timestamp;
      }
    }
  }

  /**
   * Create a speech segment from buffered audio
   */
  private createSpeechSegment(startTime: number, endTime: number): SpeechSegment {
    const totalSamples = this.currentSegmentAudio.reduce((sum, arr) => sum + arr.length, 0);
    const audioData = new Int16Array(totalSamples);
    
    let offset = 0;
    for (const frame of this.currentSegmentAudio) {
      audioData.set(frame, offset);
      offset += frame.length;
    }

    return {
      startTime,
      endTime,
      duration: endTime - startTime,
      audioData,
    };
  }

  /**
   * Register event callback
   */
  public onEvent(callback: VADEventCallback): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      this.eventCallbacks = this.eventCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Emit VAD event to all listeners
   */
  private emitEvent(event: VADEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error("[VAD Service] Event callback error:", error);
      }
    }
  }

  /**
   * Get current speech state
   */
  public getSpeechState(): {
    isSpeaking: boolean;
    speechDuration: number;
    silenceDuration: number;
  } {
    const now = (this.frameCount * this.config.frameSize / this.config.sampleRate) * 1000;
    
    return {
      isSpeaking: this.isSpeaking,
      speechDuration: this.isSpeaking ? now - this.speechStartTime : 0,
      silenceDuration: !this.isSpeaking ? now - this.silenceStartTime : 0,
    };
  }

  /**
   * Force finalize current speech segment
   */
  public finalize(): SpeechSegment | null {
    if (!this.isSpeaking || this.currentSegmentAudio.length === 0) {
      return null;
    }

    const endTime = (this.frameCount * this.config.frameSize / this.config.sampleRate) * 1000;
    const segment = this.createSpeechSegment(this.speechStartTime, endTime);
    
    this.emitEvent({
      type: "speech_end",
      timestamp: endTime,
    });

    this.emitEvent({
      type: "speech_segment",
      timestamp: this.speechStartTime,
      segment,
    });

    this.reset();
    return segment;
  }

  /**
   * Reset VAD state
   */
  public reset(): void {
    this.isSpeaking = false;
    this.speechStartTime = 0;
    this.silenceStartTime = 0;
    this.currentSegmentAudio = [];
    this.energyHistory = [];
    this.frameCount = 0;
    console.log("[VAD Service] State reset");
  }

  /**
   * Get configuration
   */
  public getConfig(): VADConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<VADConfig>): void {
    this.config = { ...this.config, ...config };
    console.log("[VAD Service] Config updated:", this.config);
  }
}

export const vadService = new VADService();

export function createVADService(config?: Partial<VADConfig>): VADService {
  return new VADService(config);
}

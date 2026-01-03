/**
 * Dual-Socket Speech Profile Processing
 *
 * Inspired by Omi's clever latency optimization, this service implements:
 * - Parallel speaker identification and transcription
 * - Zero latency cost for voice diarization
 * - Profile socket that closes after 5 seconds
 * - All audio routed to primary socket after profile is identified
 *
 * Architecture:
 * ┌─────────────┐
 * │ Audio Input │
 * └──────┬──────┘
 *        │
 *        ├─────► Primary Socket ─────► Transcription (immediate)
 *        │
 *        └─────► Profile Socket ─────► Speaker ID (first 5s only)
 *                      │
 *                      └──────────────► Merges with transcription
 */

import type { WebSocket } from 'ws';

export interface SpeakerProfile {
  speakerId: string;
  confidence: number;
  voiceprint?: Float32Array;
  identifiedAt: Date;
}

export interface TranscriptWithSpeaker {
  text: string;
  speaker?: string;
  speakerConfidence?: number;
  timestamp: number;
  isFinal: boolean;
}

export interface DualSocketConfig {
  profileDuration: number; // Duration to keep profile socket open (ms)
  sampleRate: number;
  enableCaching: boolean;
}

const DEFAULT_CONFIG: DualSocketConfig = {
  profileDuration: 5000, // 5 seconds
  sampleRate: 16000,
  enableCaching: true,
};

type TranscriptCallback = (transcript: TranscriptWithSpeaker) => void;
type ProfileCallback = (profile: SpeakerProfile) => void;

class DualSocketSpeechProcessor {
  private config: DualSocketConfig;

  // Socket state
  private primaryActive = false;
  private profileActive = false;
  private profileStartTime: Date | null = null;
  private speakerProfile: SpeakerProfile | null = null;

  // Callbacks
  private transcriptCallbacks: TranscriptCallback[] = [];
  private profileCallbacks: ProfileCallback[] = [];

  // Buffered transcripts waiting for speaker labeling
  private pendingTranscripts: TranscriptWithSpeaker[] = [];

  // Profile cache (by voiceprint hash)
  private profileCache: Map<string, SpeakerProfile> = new Map();

  // Metrics
  private metrics = {
    totalSessions: 0,
    profilesIdentified: 0,
    cacheHits: 0,
    averageProfileTimeMs: 0,
  };
  private profileTimes: number[] = [];

  constructor(config: Partial<DualSocketConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    console.log('[Dual-Socket Speech] Initialized with config:', this.config);
  }

  /**
   * Start dual-socket session
   */
  public startSession(): void {
    this.primaryActive = true;
    this.profileActive = true;
    this.profileStartTime = new Date();
    this.speakerProfile = null;
    this.pendingTranscripts = [];

    this.metrics.totalSessions++;

    // Auto-close profile socket after configured duration
    setTimeout(() => {
      this.closeProfileSocket();
    }, this.config.profileDuration);

    console.log('[Dual-Socket Speech] ✓ Session started - both sockets active');
  }

  /**
   * Stop session and cleanup
   */
  public stopSession(): void {
    this.primaryActive = false;
    this.profileActive = false;
    this.profileStartTime = null;

    // Flush any pending transcripts
    this.flushPendingTranscripts();

    console.log('[Dual-Socket Speech] Session stopped');
  }

  /**
   * Process audio through primary socket (transcription)
   */
  public async processPrimaryAudio(audioBuffer: Buffer): Promise<void> {
    if (!this.primaryActive) {
      console.warn('[Dual-Socket Speech] Primary socket not active');
      return;
    }

    // Transcribe audio immediately (no blocking)
    const transcript = await this.transcribeAudio(audioBuffer);

    if (!transcript) return;

    // If speaker profile already identified, label transcript
    if (this.speakerProfile) {
      const labeled: TranscriptWithSpeaker = {
        ...transcript,
        speaker: this.speakerProfile.speakerId,
        speakerConfidence: this.speakerProfile.confidence,
      };

      this.notifyTranscript(labeled);
    } else {
      // Buffer transcript for later labeling
      this.pendingTranscripts.push(transcript);
      console.log(`[Dual-Socket Speech] Buffered transcript (${this.pendingTranscripts.length} pending)`);
    }
  }

  /**
   * Process audio through profile socket (speaker identification)
   */
  public async processProfileAudio(audioBuffer: Buffer): Promise<void> {
    if (!this.profileActive) {
      return; // Profile socket already closed
    }

    // Identify speaker from audio
    const profile = await this.identifySpeaker(audioBuffer);

    if (profile) {
      this.speakerProfile = profile;
      this.notifyProfile(profile);

      // Apply speaker to all pending transcripts
      this.applyProfileToPending();

      // Close profile socket early (we have the speaker ID)
      this.closeProfileSocket();

      // Record profile identification time
      if (this.profileStartTime) {
        const profileTime = Date.now() - this.profileStartTime.getTime();
        this.recordProfileTime(profileTime);
      }
    }
  }

  /**
   * Close profile socket (called automatically after duration or when speaker identified)
   */
  private closeProfileSocket(): void {
    if (!this.profileActive) return;

    this.profileActive = false;
    console.log('[Dual-Socket Speech] ✗ Profile socket closed');

    // If no speaker identified, flush pending transcripts without speaker labels
    if (!this.speakerProfile) {
      console.warn('[Dual-Socket Speech] No speaker identified, flushing unlabeled transcripts');
      this.flushPendingTranscripts();
    }
  }

  /**
   * Apply speaker profile to pending transcripts
   */
  private applyProfileToPending(): void {
    if (!this.speakerProfile || this.pendingTranscripts.length === 0) {
      return;
    }

    console.log(`[Dual-Socket Speech] Applying speaker to ${this.pendingTranscripts.length} pending transcripts`);

    for (const transcript of this.pendingTranscripts) {
      const labeled: TranscriptWithSpeaker = {
        ...transcript,
        speaker: this.speakerProfile.speakerId,
        speakerConfidence: this.speakerProfile.confidence,
      };

      this.notifyTranscript(labeled);
    }

    this.pendingTranscripts = [];
  }

  /**
   * Flush pending transcripts without speaker labels
   */
  private flushPendingTranscripts(): void {
    for (const transcript of this.pendingTranscripts) {
      this.notifyTranscript(transcript);
    }

    this.pendingTranscripts = [];
  }

  /**
   * Transcribe audio (uses STT fallback service)
   */
  private async transcribeAudio(audioBuffer: Buffer): Promise<TranscriptWithSpeaker | null> {
    try {
      // Use Multi-STT fallback service for resilient transcription
      const { sttFallbackService } = await import('./stt-fallback');

      const segments = await sttFallbackService.transcribe(audioBuffer);

      if (segments.length === 0) {
        return null;
      }

      // Combine segments into single transcript
      const text = segments.map(s => s.text).join(' ');

      return {
        text,
        timestamp: Date.now(),
        isFinal: true,
      };

    } catch (error) {
      console.error('[Dual-Socket Speech] Transcription error:', error);
      return null;
    }
  }

  /**
   * Identify speaker from audio
   *
   * This is a placeholder for speaker identification logic.
   * In production, integrate with:
   * - Azure Speaker Recognition API
   * - Google Cloud Speaker Diarization
   * - Pyannote.audio (open-source)
   * - Custom ML model
   */
  private async identifySpeaker(audioBuffer: Buffer): Promise<SpeakerProfile | null> {
    // Placeholder: Simulate speaker identification
    // In production, replace with actual speaker recognition

    console.log('[Dual-Socket Speech] Identifying speaker from audio...');

    // Check cache first
    const voiceprintHash = this.generateVoiceprintHash(audioBuffer);

    if (this.config.enableCaching) {
      const cached = this.profileCache.get(voiceprintHash);
      if (cached) {
        console.log('[Dual-Socket Speech] ✓ Cache hit for speaker:', cached.speakerId);
        this.metrics.cacheHits++;
        return cached;
      }
    }

    // Simulate speaker identification delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Generate simulated speaker profile
    const profile: SpeakerProfile = {
      speakerId: `speaker_${Math.floor(Math.random() * 10)}`,
      confidence: 0.85,
      identifiedAt: new Date(),
    };

    // Cache profile
    if (this.config.enableCaching) {
      this.profileCache.set(voiceprintHash, profile);
    }

    this.metrics.profilesIdentified++;
    console.log('[Dual-Socket Speech] ✓ Speaker identified:', profile.speakerId);

    return profile;
  }

  /**
   * Generate hash from audio buffer for caching
   */
  private generateVoiceprintHash(audioBuffer: Buffer): string {
    // Simple hash based on first 1000 bytes
    const sample = audioBuffer.subarray(0, Math.min(1000, audioBuffer.length));
    let hash = 0;

    for (let i = 0; i < sample.length; i++) {
      hash = ((hash << 5) - hash) + sample[i];
      hash = hash & hash; // Convert to 32-bit integer
    }

    return `voiceprint_${hash.toString(16)}`;
  }

  /**
   * Record profile identification time for metrics
   */
  private recordProfileTime(timeMs: number): void {
    this.profileTimes.push(timeMs);

    if (this.profileTimes.length > 100) {
      this.profileTimes.shift();
    }

    this.metrics.averageProfileTimeMs =
      this.profileTimes.reduce((a, b) => a + b, 0) / this.profileTimes.length;

    console.log(`[Dual-Socket Speech] Speaker identified in ${timeMs}ms (avg: ${this.metrics.averageProfileTimeMs.toFixed(0)}ms)`);
  }

  /**
   * Register transcript callback
   */
  public onTranscript(callback: TranscriptCallback): () => void {
    this.transcriptCallbacks.push(callback);
    return () => {
      this.transcriptCallbacks = this.transcriptCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Register profile callback
   */
  public onProfile(callback: ProfileCallback): () => void {
    this.profileCallbacks.push(callback);
    return () => {
      this.profileCallbacks = this.profileCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Notify transcript callbacks
   */
  private notifyTranscript(transcript: TranscriptWithSpeaker): void {
    this.transcriptCallbacks.forEach(callback => {
      try {
        callback(transcript);
      } catch (error) {
        console.error('[Dual-Socket Speech] Transcript callback error:', error);
      }
    });
  }

  /**
   * Notify profile callbacks
   */
  private notifyProfile(profile: SpeakerProfile): void {
    this.profileCallbacks.forEach(callback => {
      try {
        callback(profile);
      } catch (error) {
        console.error('[Dual-Socket Speech] Profile callback error:', error);
      }
    });
  }

  /**
   * Get current speaker profile
   */
  public getSpeakerProfile(): SpeakerProfile | null {
    return this.speakerProfile;
  }

  /**
   * Check if profile socket is active
   */
  public isProfileActive(): boolean {
    return this.profileActive;
  }

  /**
   * Check if primary socket is active
   */
  public isPrimaryActive(): boolean {
    return this.primaryActive;
  }

  /**
   * Get metrics
   */
  public getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  /**
   * Clear profile cache
   */
  public clearCache(): void {
    this.profileCache.clear();
    console.log('[Dual-Socket Speech] Cache cleared');
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<DualSocketConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[Dual-Socket Speech] Config updated:', this.config);
  }
}

// Singleton instance
export const dualSocketSpeechProcessor = new DualSocketSpeechProcessor();

// Export for testing
export { DualSocketSpeechProcessor };

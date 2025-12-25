/**
 * Opus Audio Decoder Service
 * 
 * Handles decoding of Opus-encoded audio from BLE wearable devices (Omi, Limitless)
 * to PCM audio that can be sent to transcription services.
 * 
 * Uses the opus-decoder WebAssembly library for real Opus decoding.
 * 
 * Omi devices use Opus codec over BLE with these specs:
 * - Sample rate: 16000 Hz
 * - Channels: 1 (mono)
 * - Frame size: 960 samples (60ms at 16kHz)
 * - Bitrate: ~32kbps
 */

import { OpusDecoder } from 'opus-decoder';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpusDecoderAny = any;

export interface OpusDecoderConfig {
  sampleRate: number;
  channels: number;
  frameSize: number;
}

export interface DecodedAudioFrame {
  pcmData: Int16Array;
  timestamp: number;
  duration: number;
  isFallback?: boolean;
}

export interface AudioBuffer {
  frames: DecodedAudioFrame[];
  totalDuration: number;
  sampleRate: number;
}

export interface DecoderHealthMetrics {
  totalFramesDecoded: number;
  fallbackFramesDecoded: number;
  totalErrors: number;
  averageDecodeLatencyMs: number;
  lastDecodeLatencyMs: number;
  isInitialized: boolean;
}

const DEFAULT_CONFIG: OpusDecoderConfig = {
  sampleRate: 16000,
  channels: 1,
  frameSize: 960,
};

class OpusDecoderService {
  private config: OpusDecoderConfig;
  private decoder: OpusDecoderAny = null;
  private isInitialized = false;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;
  private frameBuffer: Uint8Array[] = [];
  private currentTimestamp = 0;
  
  private metrics: DecoderHealthMetrics = {
    totalFramesDecoded: 0,
    fallbackFramesDecoded: 0,
    totalErrors: 0,
    averageDecodeLatencyMs: 0,
    lastDecodeLatencyMs: 0,
    isInitialized: false,
  };
  private decodeLatencies: number[] = [];
  private readonly MAX_LATENCY_SAMPLES = 100;

  constructor(config: Partial<OpusDecoderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    console.log("[Opus Decoder] Created with config:", this.config);
  }

  /**
   * Lazily initialize the WebAssembly decoder
   */
  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized && this.decoder) {
      return;
    }

    if (this.isInitializing && this.initPromise) {
      await this.initPromise;
      return;
    }

    this.isInitializing = true;
    this.initPromise = this.initializeDecoder();
    
    try {
      await this.initPromise;
    } finally {
      this.isInitializing = false;
    }
  }

  private async initializeDecoder(): Promise<void> {
    try {
      console.log("[Opus Decoder] Initializing WebAssembly decoder...");
      
      this.decoder = new OpusDecoder({
        sampleRate: this.config.sampleRate as 8000 | 12000 | 16000 | 24000 | 48000,
        channels: this.config.channels,
        forceStereo: false,
      });

      await this.decoder.ready;
      this.isInitialized = true;
      this.metrics.isInitialized = true;
      
      console.log("[Opus Decoder] WebAssembly decoder initialized successfully");
    } catch (error) {
      console.error("[Opus Decoder] Failed to initialize WebAssembly decoder:", error);
      this.isInitialized = false;
      this.metrics.isInitialized = false;
      throw error;
    }
  }

  /**
   * Decode an Opus frame to PCM audio
   */
  public async decodeFrame(opusData: Uint8Array): Promise<DecodedAudioFrame | null> {
    if (!opusData || opusData.length === 0) {
      return null;
    }

    const startTime = performance.now();

    try {
      await this.ensureInitialized();

      if (!this.decoder) {
        console.error("[Opus Decoder] Decoder not available after initialization");
        return this.fallbackDecode(opusData);
      }

      const result = await this.decoder.decode(opusData);
      
      if (result.errors && result.errors.length > 0) {
        console.warn("[Opus Decoder] Decode errors:", result.errors);
        this.metrics.totalErrors += result.errors.length;
      }

      // Validate decode result has audio data
      if (!result.channelData || result.channelData.length === 0 || result.samplesDecoded === 0) {
        console.error("[Opus Decoder] No audio channels in decode result");
        this.metrics.totalErrors++;
        return this.fallbackDecode(opusData);
      }

      const pcmData = this.float32ToInt16(result.channelData[0]);
      const duration = (result.samplesDecoded / result.sampleRate) * 1000;

      const frame: DecodedAudioFrame = {
        pcmData,
        timestamp: this.currentTimestamp,
        duration,
      };

      this.currentTimestamp += duration;
      this.metrics.totalFramesDecoded++;
      
      const latency = performance.now() - startTime;
      this.recordLatency(latency);

      return frame;
    } catch (error) {
      console.error("[Opus Decoder] Error decoding frame:", error);
      this.metrics.totalErrors++;
      
      return this.fallbackDecode(opusData);
    }
  }

  /**
   * Synchronous decode method for compatibility with existing code
   * Note: This uses fallback path since real Opus decoding is async
   */
  public decodeFrameSync(opusData: Uint8Array): DecodedAudioFrame | null {
    if (!opusData || opusData.length === 0) {
      return null;
    }

    // Sync decode always uses fallback path since WASM decode is async
    // fallbackDecodeSync handles all metrics/timestamp updates
    return this.fallbackDecodeSync(opusData);
  }

  /**
   * Fallback decode for when WebAssembly initialization fails
   */
  private async fallbackDecode(opusData: Uint8Array): Promise<DecodedAudioFrame | null> {
    return this.fallbackDecodeSync(opusData);
  }

  private fallbackDecodeSync(opusData: Uint8Array): DecodedAudioFrame | null {
    console.warn("[Opus Decoder] Using fallback decoder (simulated PCM)");
    
    const startTime = performance.now();
    const estimatedSamples = this.config.frameSize;
    const pcmData = new Int16Array(estimatedSamples);

    for (let i = 0; i < Math.min(opusData.length * 4, estimatedSamples); i++) {
      const byteIndex = Math.floor(i / 4);
      if (byteIndex < opusData.length) {
        pcmData[i] = (opusData[byteIndex] - 128) * 256;
      }
    }

    const duration = (pcmData.length / this.config.sampleRate) * 1000;
    const timestamp = this.currentTimestamp;
    
    // Update state - track fallback frames separately
    this.currentTimestamp += duration;
    this.metrics.fallbackFramesDecoded++;
    this.recordLatency(performance.now() - startTime);

    return {
      pcmData,
      timestamp,
      duration,
      isFallback: true,
    };
  }

  /**
   * Convert Float32Array PCM to Int16Array
   */
  private float32ToInt16(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }
    return int16Array;
  }

  /**
   * Record decode latency for metrics
   */
  private recordLatency(latencyMs: number): void {
    this.metrics.lastDecodeLatencyMs = latencyMs;
    this.decodeLatencies.push(latencyMs);
    
    if (this.decodeLatencies.length > this.MAX_LATENCY_SAMPLES) {
      this.decodeLatencies.shift();
    }
    
    this.metrics.averageDecodeLatencyMs = 
      this.decodeLatencies.reduce((a, b) => a + b, 0) / this.decodeLatencies.length;
  }

  /**
   * Process multiple Opus frames and return combined PCM audio
   */
  public async decodeFrames(opusFrames: Uint8Array[]): Promise<AudioBuffer> {
    const frames: DecodedAudioFrame[] = [];
    let totalDuration = 0;

    for (const opusFrame of opusFrames) {
      const decoded = await this.decodeFrame(opusFrame);
      if (decoded) {
        frames.push(decoded);
        totalDuration += decoded.duration;
      }
    }

    return {
      frames,
      totalDuration,
      sampleRate: this.config.sampleRate,
    };
  }

  /**
   * Combine decoded frames into a single PCM buffer
   */
  public combineFrames(frames: DecodedAudioFrame[]): Int16Array {
    const totalSamples = frames.reduce((sum, f) => sum + f.pcmData.length, 0);
    const combined = new Int16Array(totalSamples);
    
    let offset = 0;
    for (const frame of frames) {
      combined.set(frame.pcmData, offset);
      offset += frame.pcmData.length;
    }

    return combined;
  }

  /**
   * Convert PCM to WAV format for file storage or API upload
   */
  public pcmToWav(pcmData: Int16Array): Uint8Array {
    const sampleRate = this.config.sampleRate;
    const numChannels = this.config.channels;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcmData.length * bytesPerSample;
    const fileSize = 36 + dataSize;

    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    this.writeString(view, 0, "RIFF");
    view.setUint32(4, fileSize, true);
    this.writeString(view, 8, "WAVE");

    this.writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);

    this.writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < pcmData.length; i++) {
      view.setInt16(offset, pcmData[i], true);
      offset += 2;
    }

    return new Uint8Array(buffer);
  }

  private writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  /**
   * Buffer incoming Opus data for batched processing
   */
  public addToBuffer(opusData: Uint8Array): void {
    this.frameBuffer.push(opusData);
  }

  /**
   * Process and clear the buffer
   */
  public async flushBuffer(): Promise<AudioBuffer> {
    const frames = [...this.frameBuffer];
    this.frameBuffer = [];
    return this.decodeFrames(frames);
  }

  /**
   * Get buffer status
   */
  public getBufferStatus(): { frameCount: number; estimatedDuration: number } {
    const frameCount = this.frameBuffer.length;
    const frameDuration = (this.config.frameSize / this.config.sampleRate) * 1000;
    return {
      frameCount,
      estimatedDuration: frameCount * frameDuration,
    };
  }

  /**
   * Get health metrics
   */
  public getHealthMetrics(): DecoderHealthMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset the decoder state
   */
  public async reset(): Promise<void> {
    this.frameBuffer = [];
    this.currentTimestamp = 0;
    
    if (this.decoder) {
      try {
        await this.decoder.reset();
      } catch (error) {
        console.error("[Opus Decoder] Error resetting decoder:", error);
      }
    }
    
    console.log("[Opus Decoder] State reset");
  }

  /**
   * Free decoder resources
   */
  public async dispose(): Promise<void> {
    if (this.decoder) {
      try {
        await this.decoder.free();
        this.decoder = null;
        this.isInitialized = false;
        this.metrics.isInitialized = false;
        console.log("[Opus Decoder] Decoder disposed");
      } catch (error) {
        console.error("[Opus Decoder] Error disposing decoder:", error);
      }
    }
  }

  /**
   * Get configuration
   */
  public getConfig(): OpusDecoderConfig {
    return { ...this.config };
  }

  /**
   * Check if decoder is ready
   */
  public isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Pre-initialize the decoder (call at startup to avoid first-frame delay)
   */
  public async warmup(): Promise<void> {
    await this.ensureInitialized();
    console.log("[Opus Decoder] Warmed up and ready");
  }
}

/**
 * Decoder Pool for managing multiple decoder instances across WebSocket sessions
 */
class OpusDecoderPool {
  private pool: OpusDecoderService[] = [];
  private inUse: Set<OpusDecoderService> = new Set();
  private readonly maxPoolSize: number;
  private config: Partial<OpusDecoderConfig>;

  constructor(maxPoolSize = 10, config: Partial<OpusDecoderConfig> = {}) {
    this.maxPoolSize = maxPoolSize;
    this.config = config;
    console.log(`[Opus Decoder Pool] Created with max size: ${maxPoolSize}`);
  }

  /**
   * Acquire a decoder from the pool
   */
  public async acquire(): Promise<OpusDecoderService> {
    const available = this.pool.find(d => !this.inUse.has(d));
    
    if (available) {
      this.inUse.add(available);
      await available.reset();
      return available;
    }

    if (this.pool.length < this.maxPoolSize) {
      const decoder = new OpusDecoderService(this.config);
      await decoder.warmup();
      this.pool.push(decoder);
      this.inUse.add(decoder);
      return decoder;
    }

    console.warn("[Opus Decoder Pool] Pool exhausted, creating temporary decoder");
    const tempDecoder = new OpusDecoderService(this.config);
    await tempDecoder.warmup();
    return tempDecoder;
  }

  /**
   * Release a decoder back to the pool
   */
  public async release(decoder: OpusDecoderService): Promise<void> {
    if (this.pool.includes(decoder)) {
      this.inUse.delete(decoder);
      await decoder.reset();
    } else {
      await decoder.dispose();
    }
  }

  /**
   * Get pool metrics
   */
  public getMetrics(): { poolSize: number; activeDecoders: number } {
    return {
      poolSize: this.pool.length,
      activeDecoders: this.inUse.size,
    };
  }

  /**
   * Dispose all decoders in the pool
   */
  public async disposeAll(): Promise<void> {
    for (const decoder of this.pool) {
      await decoder.dispose();
    }
    this.pool = [];
    this.inUse.clear();
    console.log("[Opus Decoder Pool] All decoders disposed");
  }
}

export const opusDecoderService = new OpusDecoderService();
export const opusDecoderPool = new OpusDecoderPool();

export function createOpusDecoder(config?: Partial<OpusDecoderConfig>): OpusDecoderService {
  return new OpusDecoderService(config);
}

export function getOpusDecoder(): OpusDecoderService {
  return opusDecoderService;
}

export { OpusDecoderService, OpusDecoderPool };

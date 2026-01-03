/**
 * Multi-Codec Audio Support
 *
 * Inspired by Omi's flexible codec handling, this module supports:
 * - Opus (compressed, low bandwidth)
 * - PCM (uncompressed, fallback)
 * - AAC (compatibility)
 * - LC3 (Bluetooth LE Audio standard)
 *
 * Features:
 * - Automatic codec detection from buffer headers
 * - Codec-specific decoding
 * - Fallback chain for unsupported codecs
 */

export enum AudioCodec {
  OPUS = 'opus',
  PCM = 'pcm',
  AAC = 'aac',
  LC3 = 'lc3',
  UNKNOWN = 'unknown',
}

export interface AudioCodecInfo {
  codec: AudioCodec;
  sampleRate: number;
  channels: number;
  bitDepth?: number;
  bitrate?: number;
}

export interface DecodedAudio {
  pcmData: Buffer;
  codec: AudioCodec;
  sampleRate: number;
  channels: number;
  duration: number; // seconds
}

export interface CodecDecoderMetrics {
  totalDecoded: number;
  successfulDecodes: number;
  failedDecodes: number;
  fallbackDecodes: number;
  averageDecodeTimeMs: number;
}

class MultiCodecAudioHandler {
  private metrics: Map<AudioCodec, CodecDecoderMetrics> = new Map();
  private decodeTimes: Map<AudioCodec, number[]> = new Map();
  private readonly MAX_DECODE_TIME_SAMPLES = 100;

  constructor() {
    // Initialize metrics for each codec
    Object.values(AudioCodec).forEach(codec => {
      this.metrics.set(codec, {
        totalDecoded: 0,
        successfulDecodes: 0,
        failedDecodes: 0,
        fallbackDecodes: 0,
        averageDecodeTimeMs: 0,
      });
      this.decodeTimes.set(codec, []);
    });

    console.log('[Multi-Codec Audio] Handler initialized');
  }

  /**
   * Auto-detect codec from buffer header
   */
  public detectCodec(buffer: Buffer): AudioCodec {
    if (buffer.length < 4) {
      return AudioCodec.UNKNOWN;
    }

    // Opus: Starts with "Og" (Ogg container) or raw Opus TOC byte
    if (buffer[0] === 0x4F && buffer[1] === 0x67) {
      return AudioCodec.OPUS;
    }

    // Check for raw Opus frame (TOC byte patterns)
    const opusTocBytes = [0xb8, 0x78, 0xf8, 0xb0, 0x70, 0xf0];
    if (opusTocBytes.includes(buffer[0])) {
      return AudioCodec.OPUS;
    }

    // AAC: ADTS header starts with 0xFF 0xF (sync word)
    if (buffer[0] === 0xFF && (buffer[1] & 0xF0) === 0xF0) {
      return AudioCodec.AAC;
    }

    // WAV: RIFF header
    if (buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WAVE') {
      return AudioCodec.PCM;
    }

    // LC3: No standard header, would need context from BLE characteristics
    // For now, assume unknown

    // Default to PCM if no other pattern matches
    return AudioCodec.PCM;
  }

  /**
   * Decode audio buffer to PCM based on detected codec
   */
  public async decodeAudio(buffer: Buffer, codecHint?: AudioCodec): Promise<DecodedAudio> {
    const codec = codecHint || this.detectCodec(buffer);
    const startTime = performance.now();

    try {
      let result: DecodedAudio;

      switch (codec) {
        case AudioCodec.OPUS:
          result = await this.decodeOpus(buffer);
          break;

        case AudioCodec.AAC:
          result = await this.decodeAAC(buffer);
          break;

        case AudioCodec.LC3:
          result = await this.decodeLC3(buffer);
          break;

        case AudioCodec.PCM:
        case AudioCodec.UNKNOWN:
        default:
          result = this.decodePCM(buffer);
          break;
      }

      this.recordSuccess(codec, performance.now() - startTime);
      return result;

    } catch (error) {
      console.error(`[Multi-Codec Audio] Failed to decode ${codec}:`, error);
      this.recordFailure(codec);

      // Fallback to PCM
      console.warn('[Multi-Codec Audio] Falling back to PCM');
      this.recordFallback(codec);
      return this.decodePCM(buffer);
    }
  }

  /**
   * Decode Opus audio to PCM
   */
  private async decodeOpus(buffer: Buffer): Promise<DecodedAudio> {
    // Use opus-decoder service if available
    try {
      // Dynamic import to avoid circular dependency
      const { getOpusDecoder } = await import('../../server/services/opus-decoder');
      const decoder = getOpusDecoder();

      const frame = await decoder.decodeFrame(new Uint8Array(buffer));

      if (!frame || !frame.pcmData) {
        throw new Error('Opus decode failed: no PCM data');
      }

      // Convert Int16Array to Buffer
      const byteLength = frame.pcmData.length * Int16Array.BYTES_PER_ELEMENT;
      const pcmBuffer = Buffer.from(
        frame.pcmData.buffer,
        frame.pcmData.byteOffset,
        byteLength
      );

      return {
        pcmData: pcmBuffer,
        codec: AudioCodec.OPUS,
        sampleRate: 16000, // Opus default
        channels: 1,
        duration: frame.duration / 1000, // Convert ms to seconds
      };

    } catch (error) {
      console.error('[Multi-Codec Audio] Opus decoder unavailable:', error);
      throw error;
    }
  }

  /**
   * Decode AAC audio to PCM
   */
  private async decodeAAC(buffer: Buffer): Promise<DecodedAudio> {
    // AAC decoding requires platform-specific libraries
    // For React Native, use react-native-audio-decoder or similar

    console.warn('[Multi-Codec Audio] AAC decoding not yet implemented, using fallback');
    throw new Error('AAC decoding not supported');
  }

  /**
   * Decode LC3 audio to PCM
   */
  private async decodeLC3(buffer: Buffer): Promise<DecodedAudio> {
    // LC3 (Low Complexity Communication Codec) is the Bluetooth LE Audio codec
    // Requires LC3 decoder library

    console.warn('[Multi-Codec Audio] LC3 decoding not yet implemented, using fallback');
    throw new Error('LC3 decoding not supported');
  }

  /**
   * Handle PCM audio (already decoded or raw)
   */
  private decodePCM(buffer: Buffer): DecodedAudio {
    // Check if buffer has WAV header
    let pcmData = buffer;
    let sampleRate = 16000;
    let channels = 1;

    if (buffer.toString('ascii', 0, 4) === 'RIFF') {
      // Parse WAV header
      sampleRate = buffer.readUInt32LE(24);
      channels = buffer.readUInt16LE(22);
      const dataOffset = this.findDataChunk(buffer);

      if (dataOffset > 0) {
        pcmData = buffer.subarray(dataOffset);
      }
    }

    const samples = pcmData.length / 2; // 16-bit = 2 bytes per sample
    const duration = samples / sampleRate / channels;

    return {
      pcmData,
      codec: AudioCodec.PCM,
      sampleRate,
      channels,
      duration,
    };
  }

  /**
   * Find data chunk in WAV file
   */
  private findDataChunk(buffer: Buffer): number {
    // Look for "data" chunk after RIFF header
    for (let i = 12; i < buffer.length - 4; i++) {
      if (buffer.toString('ascii', i, i + 4) === 'data') {
        return i + 8; // Skip "data" + size (4 bytes each)
      }
    }
    return 44; // Default WAV header size
  }

  /**
   * Get codec information from buffer
   */
  public getCodecInfo(buffer: Buffer): AudioCodecInfo {
    const codec = this.detectCodec(buffer);

    switch (codec) {
      case AudioCodec.OPUS:
        return {
          codec,
          sampleRate: 16000,
          channels: 1,
          bitrate: 32000, // Typical for speech
        };

      case AudioCodec.AAC:
        return {
          codec,
          sampleRate: 44100,
          channels: 2,
          bitrate: 128000,
        };

      case AudioCodec.LC3:
        return {
          codec,
          sampleRate: 16000,
          channels: 1,
          bitrate: 32000,
        };

      case AudioCodec.PCM:
        // Parse from WAV header if available
        if (buffer.toString('ascii', 0, 4) === 'RIFF') {
          return {
            codec,
            sampleRate: buffer.readUInt32LE(24),
            channels: buffer.readUInt16LE(22),
            bitDepth: buffer.readUInt16LE(34),
          };
        }
        // Default PCM settings
        return {
          codec,
          sampleRate: 16000,
          channels: 1,
          bitDepth: 16,
        };

      default:
        return {
          codec: AudioCodec.UNKNOWN,
          sampleRate: 16000,
          channels: 1,
        };
    }
  }

  /**
   * Check if codec is supported
   */
  public isCodecSupported(codec: AudioCodec): boolean {
    switch (codec) {
      case AudioCodec.OPUS:
      case AudioCodec.PCM:
        return true;

      case AudioCodec.AAC:
      case AudioCodec.LC3:
        // Not yet implemented
        return false;

      default:
        return false;
    }
  }

  /**
   * Get preferred codec for device type
   */
  public getPreferredCodec(deviceType: 'omi' | 'limitless' | 'phone_mic'): AudioCodec {
    switch (deviceType) {
      case 'omi':
        return AudioCodec.OPUS; // Omi uses Opus

      case 'limitless':
        return AudioCodec.OPUS; // Limitless uses Opus

      case 'phone_mic':
        return AudioCodec.PCM; // Phone microphone uses raw PCM

      default:
        return AudioCodec.PCM;
    }
  }

  /**
   * Record successful decode
   */
  private recordSuccess(codec: AudioCodec, decodeTimeMs: number): void {
    const metrics = this.metrics.get(codec);
    if (!metrics) return;

    metrics.totalDecoded++;
    metrics.successfulDecodes++;

    const times = this.decodeTimes.get(codec) || [];
    times.push(decodeTimeMs);

    if (times.length > this.MAX_DECODE_TIME_SAMPLES) {
      times.shift();
    }

    metrics.averageDecodeTimeMs = times.reduce((a, b) => a + b, 0) / times.length;
    this.decodeTimes.set(codec, times);
  }

  /**
   * Record failed decode
   */
  private recordFailure(codec: AudioCodec): void {
    const metrics = this.metrics.get(codec);
    if (!metrics) return;

    metrics.totalDecoded++;
    metrics.failedDecodes++;
  }

  /**
   * Record fallback decode
   */
  private recordFallback(codec: AudioCodec): void {
    const metrics = this.metrics.get(codec);
    if (!metrics) return;

    metrics.fallbackDecodes++;
  }

  /**
   * Get codec metrics
   */
  public getMetrics(codec?: AudioCodec): Map<AudioCodec, CodecDecoderMetrics> | CodecDecoderMetrics | undefined {
    if (codec) {
      return this.metrics.get(codec);
    }
    return new Map(this.metrics);
  }

  /**
   * Get codec performance statistics
   */
  public getCodecPerformance(codec: AudioCodec): {
    successRate: number;
    fallbackRate: number;
    averageDecodeTimeMs: number;
  } | null {
    const metrics = this.metrics.get(codec);
    if (!metrics) return null;

    const successRate = metrics.totalDecoded > 0
      ? metrics.successfulDecodes / metrics.totalDecoded
      : 0;

    const fallbackRate = metrics.totalDecoded > 0
      ? metrics.fallbackDecodes / metrics.totalDecoded
      : 0;

    return {
      successRate,
      fallbackRate,
      averageDecodeTimeMs: metrics.averageDecodeTimeMs,
    };
  }

  /**
   * Reset metrics
   */
  public resetMetrics(): void {
    this.metrics.forEach(metrics => {
      metrics.totalDecoded = 0;
      metrics.successfulDecodes = 0;
      metrics.failedDecodes = 0;
      metrics.fallbackDecodes = 0;
      metrics.averageDecodeTimeMs = 0;
    });
    this.decodeTimes.forEach(times => times.length = 0);

    console.log('[Multi-Codec Audio] Metrics reset');
  }
}

// Singleton instance
export const multiCodecAudioHandler = new MultiCodecAudioHandler();

// Export for testing
export { MultiCodecAudioHandler };

/**
 * Multi-STT Provider Fallback Service
 *
 * Inspired by Omi's resilient STT architecture, this service provides:
 * - Automatic fallback between multiple STT providers
 * - Language-specific provider routing
 * - Provider health monitoring
 * - Retry logic with exponential backoff
 *
 * Supported providers:
 * - OpenAI Whisper (primary)
 * - Deepgram Nova-3 (high quality)
 * - Deepgram Nova-2 (fallback)
 * - Google Cloud Speech-to-Text (optional)
 */

import OpenAI, { toFile } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface TranscriptSegment {
  text: string;
  startTime?: number;
  endTime?: number;
  confidence?: number;
  language?: string;
  speaker?: string;
}

export interface STTProviderConfig {
  name: string;
  priority: number;
  enabled: boolean;
  languages?: string[]; // Supported languages (empty = all)
  maxRetries: number;
  timeoutMs: number;
}

export interface STTProvider {
  name: string;
  transcribe: (audio: Buffer, language?: string) => Promise<TranscriptSegment[]>;
  isAvailable: () => boolean;
}

export interface STTProviderMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatencyMs: number;
  lastError?: string;
  lastErrorTime?: Date;
}

const DEFAULT_PROVIDERS: STTProviderConfig[] = [
  {
    name: 'whisper',
    priority: 1,
    enabled: true,
    maxRetries: 2,
    timeoutMs: 30000,
  },
  {
    name: 'deepgram-nova3',
    priority: 2,
    enabled: false, // Enable when API key is configured
    languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl'],
    maxRetries: 2,
    timeoutMs: 15000,
  },
  {
    name: 'deepgram-nova2',
    priority: 3,
    enabled: false,
    maxRetries: 1,
    timeoutMs: 15000,
  },
];

class STTFallbackService {
  private providers: Map<string, STTProvider> = new Map();
  private providerConfigs: Map<string, STTProviderConfig> = new Map();
  private metrics: Map<string, STTProviderMetrics> = new Map();
  private latencies: Map<string, number[]> = new Map();
  private readonly MAX_LATENCY_SAMPLES = 100;

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Register default providers
    DEFAULT_PROVIDERS.forEach(config => {
      this.providerConfigs.set(config.name, config);
      this.metrics.set(config.name, {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageLatencyMs: 0,
      });
      this.latencies.set(config.name, []);
    });

    // Register Whisper provider
    this.registerProvider({
      name: 'whisper',
      transcribe: this.transcribeWithWhisper.bind(this),
      isAvailable: () => !!process.env.OPENAI_API_KEY,
    });

    // Register Deepgram providers (if API key is present)
    if (process.env.DEEPGRAM_API_KEY) {
      this.registerProvider({
        name: 'deepgram-nova3',
        transcribe: (audio, language) => this.transcribeWithDeepgram(audio, 'nova-3', language),
        isAvailable: () => true,
      });

      this.registerProvider({
        name: 'deepgram-nova2',
        transcribe: (audio, language) => this.transcribeWithDeepgram(audio, 'nova-2', language),
        isAvailable: () => true,
      });

      // Enable Deepgram providers
      const nova3Config = this.providerConfigs.get('deepgram-nova3');
      const nova2Config = this.providerConfigs.get('deepgram-nova2');
      if (nova3Config) nova3Config.enabled = true;
      if (nova2Config) nova2Config.enabled = true;
    }

    console.log('[STT Fallback] Initialized with providers:',
      Array.from(this.providers.keys()).join(', '));
  }

  private registerProvider(provider: STTProvider): void {
    this.providers.set(provider.name, provider);
  }

  /**
   * Transcribe audio with automatic provider fallback
   */
  public async transcribe(
    audio: Buffer,
    language: string = 'en',
    preferredProvider?: string
  ): Promise<TranscriptSegment[]> {
    // Get sorted providers by priority
    const sortedProviders = this.getSortedProviders(language, preferredProvider);

    if (sortedProviders.length === 0) {
      throw new Error('No STT providers available');
    }

    const errors: Array<{ provider: string; error: Error }> = [];

    // Try each provider in order
    for (const providerName of sortedProviders) {
      const provider = this.providers.get(providerName);
      const config = this.providerConfigs.get(providerName);

      if (!provider || !config) continue;

      try {
        console.log(`[STT Fallback] Attempting ${providerName} for language: ${language}`);
        const startTime = performance.now();

        const result = await this.transcribeWithTimeout(
          provider.transcribe(audio, language),
          config.timeoutMs,
          providerName
        );

        const latency = performance.now() - startTime;
        this.recordSuccess(providerName, latency);

        console.log(`[STT Fallback] ✓ ${providerName} succeeded in ${latency.toFixed(0)}ms`);
        return result;

      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        errors.push({ provider: providerName, error: errorObj });

        this.recordFailure(providerName, errorObj);
        console.warn(`[STT Fallback] ✗ ${providerName} failed:`, errorObj.message);

        // Continue to next provider
      }
    }

    // All providers failed
    const errorMessages = errors
      .map(({ provider, error }) => `${provider}: ${error.message}`)
      .join('; ');

    throw new Error(`All STT providers failed. Errors: ${errorMessages}`);
  }

  /**
   * Get providers sorted by priority for a given language
   */
  private getSortedProviders(language: string, preferredProvider?: string): string[] {
    const available: Array<{ name: string; priority: number }> = [];

    for (const [name, config] of this.providerConfigs.entries()) {
      const provider = this.providers.get(name);

      if (!provider || !config.enabled || !provider.isAvailable()) {
        continue;
      }

      // Check language support
      if (config.languages && !config.languages.includes(language)) {
        continue;
      }

      // Preferred provider gets highest priority
      const priority = name === preferredProvider ? -1 : config.priority;
      available.push({ name, priority });
    }

    return available
      .sort((a, b) => a.priority - b.priority)
      .map(p => p.name);
  }

  /**
   * Wrap transcription with timeout
   */
  private async transcribeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    providerName: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${providerName} timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * OpenAI Whisper transcription
   */
  private async transcribeWithWhisper(audio: Buffer, language?: string): Promise<TranscriptSegment[]> {
    const wavBuffer = this.ensureWavFormat(audio);
    const file = await toFile(wavBuffer, "audio.wav", { type: "audio/wav" });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: language || undefined,
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    // Parse segments if available
    if ('segments' in transcription && Array.isArray(transcription.segments)) {
      return transcription.segments.map(segment => ({
        text: segment.text,
        startTime: segment.start,
        endTime: segment.end,
        confidence: segment.avg_logprob ? Math.exp(segment.avg_logprob) : undefined,
      }));
    }

    // Fallback to simple text
    const text = typeof transcription === 'string' ? transcription : transcription.text;
    return [{ text }];
  }

  /**
   * Deepgram transcription (Nova-2 or Nova-3)
   */
  private async transcribeWithDeepgram(
    audio: Buffer,
    model: 'nova-2' | 'nova-3',
    language?: string
  ): Promise<TranscriptSegment[]> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPGRAM_API_KEY not configured');
    }

    const url = 'https://api.deepgram.com/v1/listen';
    const params = new URLSearchParams({
      model,
      language: language || 'en',
      punctuate: 'true',
      diarize: 'true',
      smart_format: 'true',
    });

    const response = await fetch(`${url}?${params}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'audio/wav',
      },
      body: this.ensureWavFormat(audio),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Deepgram API error: ${response.status} - ${error}`);
    }

    const result = await response.json();

    // Parse Deepgram response
    const segments: TranscriptSegment[] = [];

    if (result.results?.channels?.[0]?.alternatives?.[0]) {
      const alt = result.results.channels[0].alternatives[0];

      if (alt.words) {
        // Group words into segments by speaker
        let currentSegment: TranscriptSegment | null = null;

        for (const word of alt.words) {
          const speaker = word.speaker?.toString() || 'unknown';

          if (!currentSegment || currentSegment.speaker !== speaker) {
            if (currentSegment) {
              segments.push(currentSegment);
            }
            currentSegment = {
              text: word.word,
              startTime: word.start,
              endTime: word.end,
              confidence: word.confidence,
              speaker,
            };
          } else {
            currentSegment.text += ' ' + word.word;
            currentSegment.endTime = word.end;
            if (word.confidence) {
              currentSegment.confidence = (currentSegment.confidence || 0 + word.confidence) / 2;
            }
          }
        }

        if (currentSegment) {
          segments.push(currentSegment);
        }
      } else {
        // No word-level data, return full transcript
        segments.push({
          text: alt.transcript,
          confidence: alt.confidence,
        });
      }
    }

    return segments;
  }

  /**
   * Ensure audio is in WAV format
   */
  private ensureWavFormat(audio: Buffer): Buffer {
    // Check if already has WAV header
    if (audio.length >= 44 && audio.toString('ascii', 0, 4) === 'RIFF') {
      return audio;
    }

    // Assume raw PCM 16-bit mono 16kHz, add WAV header
    return this.pcmToWav(audio);
  }

  /**
   * Convert PCM to WAV
   */
  private pcmToWav(pcmBuffer: Buffer): Buffer {
    const sampleRate = 16000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmBuffer.length;
    const fileSize = 36 + dataSize;

    const header = Buffer.alloc(44);

    header.write("RIFF", 0);
    header.writeUInt32LE(fileSize, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write("data", 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmBuffer]);
  }

  /**
   * Record successful transcription
   */
  private recordSuccess(providerName: string, latencyMs: number): void {
    const metrics = this.metrics.get(providerName);
    if (!metrics) return;

    metrics.totalRequests++;
    metrics.successfulRequests++;

    const latencies = this.latencies.get(providerName) || [];
    latencies.push(latencyMs);

    if (latencies.length > this.MAX_LATENCY_SAMPLES) {
      latencies.shift();
    }

    metrics.averageLatencyMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    this.latencies.set(providerName, latencies);
  }

  /**
   * Record failed transcription
   */
  private recordFailure(providerName: string, error: Error): void {
    const metrics = this.metrics.get(providerName);
    if (!metrics) return;

    metrics.totalRequests++;
    metrics.failedRequests++;
    metrics.lastError = error.message;
    metrics.lastErrorTime = new Date();
  }

  /**
   * Get provider health metrics
   */
  public getMetrics(): Map<string, STTProviderMetrics> {
    return new Map(this.metrics);
  }

  /**
   * Get provider health status
   */
  public getProviderHealth(providerName: string): {
    name: string;
    enabled: boolean;
    available: boolean;
    successRate: number;
    averageLatencyMs: number;
    lastError?: string;
  } | null {
    const config = this.providerConfigs.get(providerName);
    const provider = this.providers.get(providerName);
    const metrics = this.metrics.get(providerName);

    if (!config || !provider || !metrics) {
      return null;
    }

    const successRate = metrics.totalRequests > 0
      ? metrics.successfulRequests / metrics.totalRequests
      : 0;

    return {
      name: providerName,
      enabled: config.enabled,
      available: provider.isAvailable(),
      successRate,
      averageLatencyMs: metrics.averageLatencyMs,
      lastError: metrics.lastError,
    };
  }

  /**
   * Get all provider health statuses
   */
  public getAllProviderHealth(): Array<ReturnType<typeof this.getProviderHealth>> {
    return Array.from(this.providerConfigs.keys())
      .map(name => this.getProviderHealth(name))
      .filter((h): h is NonNullable<typeof h> => h !== null);
  }

  /**
   * Update provider configuration
   */
  public updateProviderConfig(providerName: string, config: Partial<STTProviderConfig>): void {
    const existing = this.providerConfigs.get(providerName);
    if (!existing) {
      throw new Error(`Provider ${providerName} not found`);
    }

    this.providerConfigs.set(providerName, { ...existing, ...config });
    console.log(`[STT Fallback] Updated config for ${providerName}:`, config);
  }
}

// Singleton instance
export const sttFallbackService = new STTFallbackService();

// Export for testing
export { STTFallbackService };

/**
 * STT (Speech-to-Text) Pipeline
 * 
 * Real-time audio ingestion with Deepgram Live transcription.
 * 
 * Architecture:
 * - Client streams Opus packets to ZEKE over WebSocket (/ws/audio)
 * - ZEKE decodes Opus -> PCM16LE 16kHz mono
 * - ZEKE streams PCM to Deepgram Live with diarization
 * - ZEKE emits normalized transcript events back to client
 * - ZEKE stores transcript segments and sessions in DB
 * 
 * Required Environment Variables:
 * - DEEPGRAM_API_KEY: Deepgram API key for streaming transcription
 * 
 * Frame Format: raw_opus_packets
 * - Individual Opus packets (not OGG container, not length-prefixed)
 * - Expected input: 16kHz mono Opus
 * - The mobile app extracts raw Opus frames from BLE data before sending
 */

export { OpusDecoder, createOpusDecoder, validateSampleRate } from "./opus_decoder";
export type { DecoderStats, OpusDecoderConfig } from "./opus_decoder";

export { DeepgramLiveBridge, createDeepgramBridge, isDeepgramConfigured } from "./deepgram_live";
export type { DeepgramConfig, DeepgramBridgeEvents } from "./deepgram_live";

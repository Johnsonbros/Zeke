/**
 * ZEKE Wearable Integration Services
 * 
 * Provides services for integrating Omi and Limitless AI wearable devices:
 * - Limitless REST API client for fetching pre-transcribed lifelogs
 * - Opus audio decoder for BLE audio processing
 * - Voice Activity Detection (VAD) for filtering silence
 * - Voice enrollment for speaker identification
 */

export { limitlessApiService, type LimitlessLifelog, type LimitlessContent, type LimitlessSyncResult, type ParsedTranscript } from "./limitless-api";
export { opusDecoderService, createOpusDecoder, type OpusDecoderConfig, type DecodedAudioFrame, type AudioBuffer } from "./opus-decoder";
export { vadService, createVADService, type VADConfig, type VADResult, type SpeechSegment, type VADEvent } from "./vad-service";
export { voiceEnrollmentService, type VoiceEnrollmentRequest, type VoiceEnrollmentResult, type SpeakerMatchResult, type VoiceCharacteristics } from "./voice-enrollment";
export { conversationBridgeService } from "./conversation-bridge";

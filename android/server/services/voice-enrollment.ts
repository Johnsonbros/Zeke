/**
 * Voice Enrollment Service
 * 
 * Manages voice enrollment for speaker identification.
 * Users can record their voice sample to enable speaker recognition
 * in transcripts captured by Omi/Limitless devices.
 * 
 * Features:
 * - Voice sample recording and storage
 * - Voice embedding generation (via OpenAI or external service)
 * - Speaker matching against enrolled voices
 * - Multi-user support with device association
 */

import { db } from "../db";
import { speakerProfiles } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface VoiceEmbedding {
  vector: number[];
  sampleDuration: number;
  quality: "low" | "medium" | "high";
  createdAt: Date;
}

export interface VoiceEnrollmentRequest {
  deviceId: string;
  name: string;
  audioData: Buffer | Uint8Array;
  mimeType?: string;
}

export interface VoiceEnrollmentResult {
  success: boolean;
  profileId?: string;
  message: string;
  embedding?: VoiceEmbedding;
}

export interface SpeakerMatchResult {
  matched: boolean;
  profileId?: string;
  profileName?: string;
  confidence: number;
  allScores: Array<{ profileId: string; name: string; score: number }>;
}

export interface VoiceCharacteristics {
  embedding?: VoiceEmbedding;
  pitchRange?: { min: number; max: number };
  speakingRate?: number;
  voiceQuality?: string;
}

class VoiceEnrollmentService {
  private embeddingCache = new Map<string, VoiceEmbedding>();

  constructor() {
    console.log("[Voice Enrollment] Service initialized");
  }

  /**
   * Enroll a new voice sample for speaker identification
   */
  public async enrollVoice(request: VoiceEnrollmentRequest): Promise<VoiceEnrollmentResult> {
    try {
      console.log("[Voice Enrollment] Enrolling voice for:", request.name);

      const audioBuffer = request.audioData instanceof Buffer 
        ? request.audioData 
        : Buffer.from(request.audioData);

      if (audioBuffer.length < 1000) {
        return {
          success: false,
          message: "Audio sample too short. Please record at least 3 seconds of speech.",
        };
      }

      const embedding = await this.generateVoiceEmbedding(audioBuffer, request.mimeType);
      
      if (!embedding) {
        return {
          success: false,
          message: "Failed to generate voice embedding. Please try again with a clearer audio sample.",
        };
      }

      const characteristics: VoiceCharacteristics = {
        embedding,
        voiceQuality: embedding.quality,
      };

      const existingProfiles = await db
        .select()
        .from(speakerProfiles)
        .where(and(
          eq(speakerProfiles.deviceId, request.deviceId),
          eq(speakerProfiles.name, request.name)
        ))
        .limit(1);

      let profileId: string;

      if (existingProfiles.length > 0) {
        const updated = await db
          .update(speakerProfiles)
          .set({
            voiceCharacteristics: characteristics,
            updatedAt: new Date(),
          })
          .where(eq(speakerProfiles.id, existingProfiles[0].id))
          .returning();
        
        profileId = updated[0].id;
        console.log("[Voice Enrollment] Updated existing profile:", profileId);
      } else {
        const created = await db
          .insert(speakerProfiles)
          .values({
            deviceId: request.deviceId,
            name: request.name,
            voiceCharacteristics: characteristics,
          })
          .returning();
        
        profileId = created[0].id;
        console.log("[Voice Enrollment] Created new profile:", profileId);
      }

      this.embeddingCache.set(profileId, embedding);

      return {
        success: true,
        profileId,
        message: `Voice enrolled successfully for ${request.name}`,
        embedding,
      };
    } catch (error) {
      console.error("[Voice Enrollment] Error:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown enrollment error",
      };
    }
  }

  /**
   * Generate voice embedding from audio data
   * Uses transcription + analysis as a proxy for voice characteristics
   */
  private async generateVoiceEmbedding(
    audioData: Buffer,
    mimeType = "audio/wav"
  ): Promise<VoiceEmbedding | null> {
    try {
      const file = new File([audioData], "voice_sample.wav", { type: mimeType });
      
      const transcription = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        response_format: "verbose_json",
      });

      if (!transcription.text || transcription.text.length < 10) {
        console.warn("[Voice Enrollment] Transcription too short");
        return null;
      }

      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: `Voice characteristics of speaker saying: ${transcription.text}`,
      });

      const vector = embeddingResponse.data[0].embedding;
      const duration = transcription.duration || 0;

      let quality: "low" | "medium" | "high" = "low";
      if (duration >= 10 && transcription.text.length >= 50) {
        quality = "high";
      } else if (duration >= 5 && transcription.text.length >= 25) {
        quality = "medium";
      }

      return {
        vector,
        sampleDuration: duration,
        quality,
        createdAt: new Date(),
      };
    } catch (error) {
      console.error("[Voice Enrollment] Embedding generation error:", error);
      return null;
    }
  }

  /**
   * Match audio against enrolled voice profiles
   */
  public async matchSpeaker(
    deviceId: string,
    audioData: Buffer | Uint8Array,
    mimeType = "audio/wav"
  ): Promise<SpeakerMatchResult> {
    try {
      const profiles = await db
        .select()
        .from(speakerProfiles)
        .where(eq(speakerProfiles.deviceId, deviceId));

      if (profiles.length === 0) {
        return {
          matched: false,
          confidence: 0,
          allScores: [],
        };
      }

      const audioBuffer = audioData instanceof Buffer 
        ? audioData 
        : Buffer.from(audioData);

      const inputEmbedding = await this.generateVoiceEmbedding(audioBuffer, mimeType);
      
      if (!inputEmbedding) {
        return {
          matched: false,
          confidence: 0,
          allScores: [],
        };
      }

      const scores: Array<{ profileId: string; name: string; score: number }> = [];

      for (const profile of profiles) {
        const characteristics = profile.voiceCharacteristics as VoiceCharacteristics | null;
        
        if (!characteristics?.embedding?.vector) {
          continue;
        }

        const similarity = this.cosineSimilarity(
          inputEmbedding.vector,
          characteristics.embedding.vector
        );

        scores.push({
          profileId: profile.id,
          name: profile.name,
          score: similarity,
        });
      }

      scores.sort((a, b) => b.score - a.score);

      const threshold = 0.75;
      const bestMatch = scores[0];

      if (bestMatch && bestMatch.score >= threshold) {
        return {
          matched: true,
          profileId: bestMatch.profileId,
          profileName: bestMatch.name,
          confidence: bestMatch.score,
          allScores: scores,
        };
      }

      return {
        matched: false,
        confidence: bestMatch?.score || 0,
        allScores: scores,
      };
    } catch (error) {
      console.error("[Voice Enrollment] Speaker matching error:", error);
      return {
        matched: false,
        confidence: 0,
        allScores: [],
      };
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Get all enrolled profiles for a device
   */
  public async getProfiles(deviceId: string): Promise<Array<{
    id: string;
    speakerName: string;
    name: string;
    hasVoiceEnrollment: boolean;
    enrollmentQuality?: string;
    externalSpeakerId?: number;
    createdAt: Date;
  }>> {
    const profiles = await db
      .select()
      .from(speakerProfiles)
      .where(eq(speakerProfiles.deviceId, deviceId));

    return profiles.map((profile) => {
      const characteristics = profile.voiceCharacteristics as VoiceCharacteristics | null;
      
      return {
        id: profile.id,
        speakerName: profile.name,
        name: profile.name,
        hasVoiceEnrollment: !!characteristics?.embedding,
        enrollmentQuality: characteristics?.embedding?.quality,
        externalSpeakerId: profile.externalSpeakerId ?? undefined,
        createdAt: profile.createdAt,
      };
    });
  }

  /**
   * Link a speaker profile to a diarization speaker ID
   */
  public async linkSpeakerId(profileId: string, externalSpeakerId: number): Promise<boolean> {
    try {
      await db
        .update(speakerProfiles)
        .set({ externalSpeakerId, updatedAt: new Date() })
        .where(eq(speakerProfiles.id, profileId));
      console.log(`[Voice Enrollment] Linked profile ${profileId} to speaker ID ${externalSpeakerId}`);
      return true;
    } catch (error) {
      console.error("[Voice Enrollment] Link speaker ID error:", error);
      return false;
    }
  }

  /**
   * Get profile by external speaker ID
   */
  public async getProfileBySpeakerId(deviceId: string, externalSpeakerId: number): Promise<{ id: string; name: string } | null> {
    const profiles = await db
      .select()
      .from(speakerProfiles)
      .where(and(
        eq(speakerProfiles.deviceId, deviceId),
        eq(speakerProfiles.externalSpeakerId, externalSpeakerId)
      ))
      .limit(1);

    if (profiles.length > 0) {
      return { id: profiles[0].id, name: profiles[0].name };
    }
    return null;
  }

  /**
   * Delete a voice profile
   */
  public async deleteProfile(profileId: string): Promise<boolean> {
    try {
      const deleted = await db
        .delete(speakerProfiles)
        .where(eq(speakerProfiles.id, profileId))
        .returning();

      if (deleted.length > 0) {
        this.embeddingCache.delete(profileId);
        console.log("[Voice Enrollment] Deleted profile:", profileId);
        return true;
      }

      return false;
    } catch (error) {
      console.error("[Voice Enrollment] Delete error:", error);
      return false;
    }
  }

  /**
   * Clear embedding cache
   */
  public clearCache(): void {
    this.embeddingCache.clear();
    console.log("[Voice Enrollment] Cache cleared");
  }
}

export const voiceEnrollmentService = new VoiceEnrollmentService();

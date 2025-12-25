/**
 * Conversation Bridge Service
 * 
 * Bridges Omi/Limitless wearable transcripts to the main ZEKE backend for:
 * - Conversation summarization
 * - Memory creation
 * - Knowledge graph updates
 * - Speaker relationship tracking
 */

import { db } from "../db";
import { conversationSessions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { voiceEnrollmentService } from "./voice-enrollment";

const ZEKE_BACKEND_URL = process.env.EXPO_PUBLIC_ZEKE_BACKEND_URL || "https://zekeai.replit.app";

interface TranscriptSegment {
  text: string;
  speaker: string;
  speaker_id: number;
  is_user: boolean;
  start: number;
  end: number;
}

interface ConversationContext {
  sessionId: string;
  deviceId: string;
  source: "omi" | "limitless" | "microphone";
  segments: TranscriptSegment[];
  startTime: Date;
  endTime?: Date;
  speakerProfiles?: Map<number, string>;
  unlinkedSpeakerIds?: Set<number>;
}

interface MemoryCreationResult {
  success: boolean;
  memoryId?: string;
  summary?: string;
  entities?: string[];
  error?: string;
}

interface KnowledgeGraphUpdate {
  entities: Array<{
    name: string;
    type: string;
    attributes: Record<string, any>;
  }>;
  relationships: Array<{
    source: string;
    target: string;
    type: string;
    context: string;
  }>;
}

class ConversationBridgeService {
  private activeConversations = new Map<string, ConversationContext>();

  async startConversation(
    sessionId: string,
    deviceId: string,
    source: "omi" | "limitless" | "microphone"
  ): Promise<void> {
    const existing = await db
      .select()
      .from(conversationSessions)
      .where(eq(conversationSessions.externalId, sessionId))
      .limit(1);

    if (existing.length > 0) {
      const dbSession = existing[0];
      const speakerData = dbSession.speakers as Record<string, string> | null;
      const metadata = dbSession.metadata as { segments?: TranscriptSegment[]; unlinkedSpeakerIds?: number[] } | null;
      const storedSegments = metadata?.segments || [];
      const unlinkedIds = metadata?.unlinkedSpeakerIds || [];
      
      const context: ConversationContext = {
        sessionId,
        deviceId: dbSession.deviceId,
        source: dbSession.source as "omi" | "limitless" | "microphone",
        segments: storedSegments,
        startTime: dbSession.startTime,
        endTime: dbSession.endTime || undefined,
        speakerProfiles: speakerData 
          ? new Map(Object.entries(speakerData).map(([k, v]) => [parseInt(k), v])) 
          : new Map(),
        unlinkedSpeakerIds: new Set(unlinkedIds),
      };
      
      this.activeConversations.set(sessionId, context);
      console.log(`[Conversation Bridge] Resumed existing session ${sessionId} with ${storedSegments.length} segments, ${unlinkedIds.length} unlinked speakers`);
      return;
    }

    const context: ConversationContext = {
      sessionId,
      deviceId,
      source,
      segments: [],
      startTime: new Date(),
      speakerProfiles: new Map(),
    };

    this.activeConversations.set(sessionId, context);

    await db.insert(conversationSessions).values({
      deviceId,
      externalId: sessionId,
      source,
      startTime: context.startTime,
      status: "active",
      transcript: "",
      speakers: {},
      metadata: { segments: [] },
    });

    console.log(`[Conversation Bridge] Started new session ${sessionId} from ${source}`);
  }

  async addSegments(
    sessionId: string,
    segments: TranscriptSegment[],
    deviceId: string
  ): Promise<void> {
    let context = this.activeConversations.get(sessionId);

    if (!context) {
      await this.startConversation(sessionId, deviceId, "omi");
      context = this.activeConversations.get(sessionId)!;
    }

    if (!context.unlinkedSpeakerIds) {
      context.unlinkedSpeakerIds = new Set();
    }

    for (const segment of segments) {
      const isDuplicate = context.segments.some(
        (existing) =>
          existing.start === segment.start &&
          existing.end === segment.end &&
          existing.text === segment.text
      );

      if (!isDuplicate) {
        context.segments.push(segment);

        if (!segment.is_user && segment.speaker_id !== undefined) {
          const profileName = await this.matchSpeakerProfile(deviceId, segment.speaker_id);
          if (profileName) {
            context.speakerProfiles?.set(segment.speaker_id, profileName);
          } else {
            context.unlinkedSpeakerIds.add(segment.speaker_id);
          }
        }
      }
    }

    const transcript = this.formatTranscript(context.segments, context.speakerProfiles);
    const segmentsCopy = [...context.segments];
    const unlinkedIds = Array.from(context.unlinkedSpeakerIds);
    
    await db.update(conversationSessions)
      .set({
        transcript,
        speakers: Object.fromEntries(context.speakerProfiles || []),
        metadata: { segments: segmentsCopy, unlinkedSpeakerIds: unlinkedIds },
        updatedAt: new Date(),
      })
      .where(eq(conversationSessions.externalId, sessionId));
  }

  async endConversation(sessionId: string): Promise<MemoryCreationResult> {
    let context = this.activeConversations.get(sessionId);
    let fromDb = false;

    if (!context) {
      context = await this.loadSessionFromDb(sessionId);
      fromDb = true;
      
      if (!context) {
        return { success: false, error: "Session not found" };
      }
    }

    context.endTime = new Date();
    
    const transcript = this.formatTranscript(context.segments, context.speakerProfiles);

    if (transcript.length < 50) {
      if (!fromDb) {
        this.activeConversations.delete(sessionId);
      }
      return { success: false, error: "Conversation too short for memory" };
    }

    const unlinkedIds = context.unlinkedSpeakerIds ? Array.from(context.unlinkedSpeakerIds) : [];
    
    await db.update(conversationSessions)
      .set({
        endTime: context.endTime,
        status: "completed",
        transcript,
        speakers: Object.fromEntries(context.speakerProfiles || []),
        metadata: { segments: context.segments, unlinkedSpeakerIds: unlinkedIds },
        updatedAt: new Date(),
      })
      .where(eq(conversationSessions.externalId, sessionId));

    const memoryResult = await this.createMemoryFromConversation(context);

    if (memoryResult.success) {
      await db.update(conversationSessions)
        .set({ status: "processed", memoryId: memoryResult.memoryId, updatedAt: new Date() })
        .where(eq(conversationSessions.externalId, sessionId));
    }

    if (!fromDb) {
      this.activeConversations.delete(sessionId);
    }

    console.log(`[Conversation Bridge] Ended session ${sessionId} (fromDb: ${fromDb}), memory created: ${memoryResult.success}`);

    return memoryResult;
  }

  private async createMemoryFromConversation(
    context: ConversationContext
  ): Promise<MemoryCreationResult> {
    const transcript = this.formatTranscript(context.segments, context.speakerProfiles);

    if (transcript.length < 50) {
      return { success: false, error: "Conversation too short for memory" };
    }

    try {
      const response = await fetch(`${ZEKE_BACKEND_URL}/api/memories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "conversation",
          source: context.source,
          content: transcript,
          metadata: {
            sessionId: context.sessionId,
            deviceId: context.deviceId,
            startTime: context.startTime.toISOString(),
            endTime: context.endTime?.toISOString(),
            speakers: Array.from(context.speakerProfiles?.values() || []),
            segmentCount: context.segments.length,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Conversation Bridge] Memory creation failed:", errorText);
        return { success: false, error: errorText };
      }

      const result = await response.json();

      await this.updateKnowledgeGraph(context);

      return {
        success: true,
        memoryId: result.id,
        summary: result.summary,
        entities: result.entities,
      };
    } catch (error) {
      console.error("[Conversation Bridge] Memory creation error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async updateKnowledgeGraph(context: ConversationContext): Promise<void> {
    const speakers = Array.from(context.speakerProfiles?.entries() || []);

    if (speakers.length === 0) {
      return;
    }

    const update: KnowledgeGraphUpdate = {
      entities: [],
      relationships: [],
    };

    for (const [speakerId, name] of speakers) {
      update.entities.push({
        name,
        type: "person",
        attributes: {
          speakerId,
          lastSeen: context.endTime?.toISOString() || new Date().toISOString(),
          source: context.source,
        },
      });

      update.relationships.push({
        source: "user",
        target: name,
        type: "spoke_with",
        context: `Conversation on ${context.startTime.toLocaleDateString()}`,
      });
    }

    try {
      await fetch(`${ZEKE_BACKEND_URL}/api/knowledge-graph/update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(update),
      });

      console.log(`[Conversation Bridge] Knowledge graph updated with ${speakers.length} speakers`);
    } catch (error) {
      console.error("[Conversation Bridge] Knowledge graph update failed:", error);
    }
  }

  private async matchSpeakerProfile(
    deviceId: string,
    speakerId: number
  ): Promise<string | null> {
    try {
      const profile = await voiceEnrollmentService.getProfileBySpeakerId(deviceId, speakerId);
      
      if (profile) {
        console.log(`[Conversation Bridge] Matched speaker ${speakerId} to profile "${profile.name}"`);
        return profile.name;
      }

      console.log(`[Conversation Bridge] Speaker ${speakerId} not linked - use POST /api/wearable/voice/profiles/:id/link-speaker to link`);
    } catch (error) {
      console.error("[Conversation Bridge] Speaker profile lookup failed:", error);
    }
    return null;
  }

  private async loadSessionFromDb(sessionId: string): Promise<ConversationContext | null> {
    try {
      const sessions = await db
        .select()
        .from(conversationSessions)
        .where(eq(conversationSessions.externalId, sessionId))
        .limit(1);

      if (sessions.length === 0) {
        return null;
      }

      const session = sessions[0];
      const speakerData = session.speakers as Record<string, string> | null;
      const metadata = session.metadata as { segments?: TranscriptSegment[]; unlinkedSpeakerIds?: number[] } | null;
      const storedSegments = metadata?.segments || [];
      const unlinkedIds = metadata?.unlinkedSpeakerIds || [];

      const context: ConversationContext = {
        sessionId,
        deviceId: session.deviceId,
        source: session.source as "omi" | "limitless" | "microphone",
        segments: storedSegments,
        startTime: session.startTime,
        endTime: session.endTime || undefined,
        speakerProfiles: speakerData ? new Map(Object.entries(speakerData).map(([k, v]) => [parseInt(k), v])) : new Map(),
        unlinkedSpeakerIds: new Set(unlinkedIds),
      };

      console.log(`[Conversation Bridge] Loaded session ${sessionId} from DB with ${storedSegments.length} segments, ${unlinkedIds.length} unlinked speakers`);
      return context;
    } catch (error) {
      console.error("[Conversation Bridge] Failed to load session from DB:", error);
      return null;
    }
  }

  private formatTranscript(
    segments: TranscriptSegment[],
    speakerProfiles?: Map<number, string>
  ): string {
    return segments
      .map((s) => {
        let speaker: string;
        if (s.is_user) {
          speaker = "User";
        } else if (speakerProfiles?.has(s.speaker_id)) {
          speaker = speakerProfiles.get(s.speaker_id)!;
        } else {
          speaker = s.speaker || `Speaker ${s.speaker_id}`;
        }
        return `${speaker}: ${s.text}`;
      })
      .join("\n");
  }

  async processOmiMemoryTrigger(payload: any): Promise<MemoryCreationResult> {
    const sessionId = payload.session_id || payload.memory_id;
    const segments = payload.transcript?.segments || [];

    if (!sessionId) {
      return { success: false, error: "No session ID in payload" };
    }

    if (segments.length > 0) {
      await this.addSegments(sessionId, segments, payload.device_id || "omi-webhook");
    }

    return this.endConversation(sessionId);
  }

  async processDaySummary(payload: any): Promise<void> {
    try {
      await fetch(`${ZEKE_BACKEND_URL}/api/memories/day-summary`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: payload.date || new Date().toISOString().split("T")[0],
          summary: payload.summary,
          conversations: payload.conversations,
          source: "omi",
        }),
      });

      console.log("[Conversation Bridge] Day summary sent to ZEKE backend");
    } catch (error) {
      console.error("[Conversation Bridge] Day summary failed:", error);
    }
  }

  getActiveSessionCount(): number {
    return this.activeConversations.size;
  }

  getSessionStatus(sessionId: string): ConversationContext | undefined {
    return this.activeConversations.get(sessionId);
  }

  async reconcileSession(sessionId: string): Promise<{
    success: boolean;
    transcript?: string;
    linkedSpeakers: string[];
    unlinkedSpeakerIds: number[];
    error?: string;
  }> {
    try {
      const context = await this.loadSessionFromDb(sessionId);
      
      if (!context) {
        return { success: false, linkedSpeakers: [], unlinkedSpeakerIds: [], error: "Session not found" };
      }

      const newSpeakerProfiles = new Map<number, string>();
      const stillUnlinked = new Set<number>();

      for (const segment of context.segments) {
        if (!segment.is_user && segment.speaker_id !== undefined) {
          const profileName = await this.matchSpeakerProfile(context.deviceId, segment.speaker_id);
          if (profileName) {
            newSpeakerProfiles.set(segment.speaker_id, profileName);
          } else {
            stillUnlinked.add(segment.speaker_id);
          }
        }
      }

      const transcript = this.formatTranscript(context.segments, newSpeakerProfiles);
      const unlinkedIds = Array.from(stillUnlinked);

      await db.update(conversationSessions)
        .set({
          transcript,
          speakers: Object.fromEntries(newSpeakerProfiles),
          metadata: { segments: context.segments, unlinkedSpeakerIds: unlinkedIds },
          updatedAt: new Date(),
        })
        .where(eq(conversationSessions.externalId, sessionId));

      if (newSpeakerProfiles.size > 0 && stillUnlinked.size === 0) {
        await this.updateKnowledgeGraph(context, Array.from(newSpeakerProfiles.values()));
      }

      console.log(`[Conversation Bridge] Reconciled session ${sessionId}: ${newSpeakerProfiles.size} linked, ${stillUnlinked.size} unlinked`);

      return {
        success: true,
        transcript,
        linkedSpeakers: Array.from(newSpeakerProfiles.values()),
        unlinkedSpeakerIds: unlinkedIds,
      };
    } catch (error) {
      console.error("[Conversation Bridge] Reconciliation error:", error);
      return {
        success: false,
        linkedSpeakers: [],
        unlinkedSpeakerIds: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

export const conversationBridgeService = new ConversationBridgeService();

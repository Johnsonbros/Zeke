/**
 * Wearable Integration Routes
 * 
 * API endpoints for Omi and Limitless AI wearable device integration.
 * Provides routes for:
 * - Limitless API management and lifelog syncing
 * - Voice enrollment for speaker identification
 * - Audio processing with VAD and Opus decoding
 * - Offline sync queue management
 */

import type { Express, Request, Response } from "express";
import multer from "multer";
import { db } from "./db";
import { 
  limitlessCredentials, 
  conversationSessions, 
  offlineSyncQueue, 
  speakerProfiles,
  memories 
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { 
  limitlessApiService, 
  opusDecoderService, 
  vadService, 
  voiceEnrollmentService,
  conversationBridgeService
} from "./services";

const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 50 * 1024 * 1024 } 
});

export function registerWearableRoutes(app: Express): void {
  console.log("[Wearable Routes] Registering wearable integration endpoints...");

  // ============================================
  // Limitless API Routes
  // ============================================

  app.post("/api/wearable/limitless/configure", async (req: Request, res: Response) => {
    try {
      const { deviceId, apiKey } = req.body;

      if (!deviceId || !apiKey) {
        return res.status(400).json({ error: "deviceId and apiKey are required" });
      }

      limitlessApiService.setApiKey(apiKey);
      const testResult = await limitlessApiService.testConnection();

      if (!testResult.success) {
        return res.status(400).json({ 
          error: "Failed to connect to Limitless API", 
          details: testResult.error 
        });
      }

      const existing = await db
        .select()
        .from(limitlessCredentials)
        .where(eq(limitlessCredentials.deviceId, deviceId))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(limitlessCredentials)
          .set({ apiKey, isActive: true, updatedAt: new Date() })
          .where(eq(limitlessCredentials.id, existing[0].id));
      } else {
        await db.insert(limitlessCredentials).values({
          deviceId,
          apiKey,
          isActive: true,
        });
      }

      console.log("[Wearable Routes] Limitless API configured for device:", deviceId);
      res.json({ success: true, message: "Limitless API configured successfully" });
    } catch (error) {
      console.error("[Wearable Routes] Limitless configure error:", error);
      res.status(500).json({ error: "Failed to configure Limitless API" });
    }
  });

  app.get("/api/wearable/limitless/status", async (req: Request, res: Response) => {
    try {
      const deviceId = req.query.deviceId as string;

      if (!deviceId) {
        return res.status(400).json({ error: "deviceId is required" });
      }

      const credentials = await db
        .select()
        .from(limitlessCredentials)
        .where(and(
          eq(limitlessCredentials.deviceId, deviceId),
          eq(limitlessCredentials.isActive, true)
        ))
        .limit(1);

      if (credentials.length === 0) {
        return res.json({ configured: false });
      }

      limitlessApiService.setApiKey(credentials[0].apiKey);
      const testResult = await limitlessApiService.testConnection();

      res.json({
        configured: true,
        connected: testResult.success,
        lastSyncAt: credentials[0].lastSyncAt,
        error: testResult.error,
      });
    } catch (error) {
      console.error("[Wearable Routes] Limitless status error:", error);
      res.status(500).json({ error: "Failed to get Limitless status" });
    }
  });

  app.post("/api/wearable/limitless/sync", async (req: Request, res: Response) => {
    try {
      const { deviceId } = req.body;

      if (!deviceId) {
        return res.status(400).json({ error: "deviceId is required" });
      }

      const credentials = await db
        .select()
        .from(limitlessCredentials)
        .where(and(
          eq(limitlessCredentials.deviceId, deviceId),
          eq(limitlessCredentials.isActive, true)
        ))
        .limit(1);

      if (credentials.length === 0) {
        return res.status(400).json({ error: "Limitless API not configured for this device" });
      }

      limitlessApiService.setApiKey(credentials[0].apiKey);
      const syncResult = await limitlessApiService.syncNewLifelogs();

      const createdSessions: string[] = [];
      for (const lifelog of syncResult.newLifelogs) {
        const parsed = limitlessApiService.parseLifelogToTranscript(lifelog);
        
        const session = await db.insert(conversationSessions).values({
          deviceId,
          externalId: lifelog.id,
          source: "limitless",
          status: "completed",
          startTime: new Date(lifelog.startTime),
          endTime: new Date(lifelog.endTime),
          transcript: parsed.fullText,
          speakers: Array.from(parsed.speakers.entries()).map(([name, id]) => ({ name, id })),
          metadata: { title: lifelog.title, markdown: lifelog.markdown },
        }).returning();

        createdSessions.push(session[0].id);
      }

      await db
        .update(limitlessCredentials)
        .set({ lastSyncAt: new Date(), updatedAt: new Date() })
        .where(eq(limitlessCredentials.id, credentials[0].id));

      console.log("[Wearable Routes] Synced", syncResult.syncedCount, "lifelogs from Limitless");
      res.json({
        success: true,
        syncedCount: syncResult.syncedCount,
        sessionIds: createdSessions,
        errors: syncResult.errors,
      });
    } catch (error) {
      console.error("[Wearable Routes] Limitless sync error:", error);
      res.status(500).json({ error: "Failed to sync from Limitless" });
    }
  });

  app.get("/api/wearable/limitless/lifelogs", async (req: Request, res: Response) => {
    try {
      const deviceId = req.query.deviceId as string;
      const limit = parseInt(req.query.limit as string) || 20;
      const hours = parseInt(req.query.hours as string) || 24;

      if (!deviceId) {
        return res.status(400).json({ error: "deviceId is required" });
      }

      const credentials = await db
        .select()
        .from(limitlessCredentials)
        .where(and(
          eq(limitlessCredentials.deviceId, deviceId),
          eq(limitlessCredentials.isActive, true)
        ))
        .limit(1);

      if (credentials.length === 0) {
        return res.status(400).json({ error: "Limitless API not configured" });
      }

      limitlessApiService.setApiKey(credentials[0].apiKey);
      const lifelogs = await limitlessApiService.fetchRecentLifelogs(hours);

      res.json({
        lifelogs: lifelogs.slice(0, limit),
        total: lifelogs.length,
      });
    } catch (error) {
      console.error("[Wearable Routes] Fetch lifelogs error:", error);
      res.status(500).json({ error: "Failed to fetch lifelogs" });
    }
  });

  // ============================================
  // Voice Enrollment Routes
  // ============================================

  app.post("/api/wearable/voice/enroll", upload.single("audio"), async (req: Request, res: Response) => {
    try {
      const { deviceId, name } = req.body;

      if (!deviceId || !name) {
        return res.status(400).json({ error: "deviceId and name are required" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "Audio file is required" });
      }

      const result = await voiceEnrollmentService.enrollVoice({
        deviceId,
        name,
        audioData: req.file.buffer,
        mimeType: req.file.mimetype,
      });

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error("[Wearable Routes] Voice enrollment error:", error);
      res.status(500).json({ error: "Failed to enroll voice" });
    }
  });

  app.post("/api/wearable/voice/match", upload.single("audio"), async (req: Request, res: Response) => {
    try {
      const { deviceId } = req.body;

      if (!deviceId) {
        return res.status(400).json({ error: "deviceId is required" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "Audio file is required" });
      }

      const result = await voiceEnrollmentService.matchSpeaker(
        deviceId,
        req.file.buffer,
        req.file.mimetype
      );

      res.json(result);
    } catch (error) {
      console.error("[Wearable Routes] Voice matching error:", error);
      res.status(500).json({ error: "Failed to match voice" });
    }
  });

  app.get("/api/wearable/voice/profiles", async (req: Request, res: Response) => {
    try {
      const deviceId = req.query.deviceId as string;

      if (!deviceId) {
        return res.status(400).json({ error: "deviceId is required" });
      }

      const profiles = await voiceEnrollmentService.getProfiles(deviceId);
      res.json({ profiles });
    } catch (error) {
      console.error("[Wearable Routes] Get profiles error:", error);
      res.status(500).json({ error: "Failed to get voice profiles" });
    }
  });

  app.delete("/api/wearable/voice/profiles/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const deleted = await voiceEnrollmentService.deleteProfile(id);

      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Profile not found" });
      }
    } catch (error) {
      console.error("[Wearable Routes] Delete profile error:", error);
      res.status(500).json({ error: "Failed to delete profile" });
    }
  });

  app.post("/api/wearable/voice/profiles/:id/link-speaker", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { externalSpeakerId } = req.body;

      if (externalSpeakerId === undefined || typeof externalSpeakerId !== "number") {
        return res.status(400).json({ error: "externalSpeakerId (number) is required" });
      }

      const linked = await voiceEnrollmentService.linkSpeakerId(id, externalSpeakerId);

      if (linked) {
        res.json({ success: true, profileId: id, externalSpeakerId });
      } else {
        res.status(404).json({ error: "Profile not found or link failed" });
      }
    } catch (error) {
      console.error("[Wearable Routes] Link speaker error:", error);
      res.status(500).json({ error: "Failed to link speaker" });
    }
  });

  // ============================================
  // Audio Processing Routes
  // ============================================

  app.post("/api/wearable/audio/decode-opus", upload.single("audio"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Audio file is required" });
      }

      const opusData = new Uint8Array(req.file.buffer);
      const decoded = await opusDecoderService.decodeFrame(opusData);

      if (!decoded) {
        return res.status(400).json({ error: "Failed to decode Opus audio" });
      }

      const wavData = opusDecoderService.pcmToWav(decoded.pcmData);
      
      res.set({
        "Content-Type": "audio/wav",
        "Content-Length": wavData.length,
      });
      res.send(Buffer.from(wavData));
    } catch (error) {
      console.error("[Wearable Routes] Opus decode error:", error);
      res.status(500).json({ error: "Failed to decode audio" });
    }
  });

  // Note: This endpoint inherits device auth from middleware applied to /api/* routes
  app.get("/api/wearable/audio/decoder-health", async (_req: Request, res: Response) => {
    try {
      const metrics = opusDecoderService.getHealthMetrics();
      const totalDecodes = metrics.totalFramesDecoded + metrics.fallbackFramesDecoded;
      const fallbackRatio = totalDecodes > 0 
        ? (metrics.fallbackFramesDecoded / totalDecodes) * 100 
        : 0;
      
      // Determine status with threshold checks
      let status: string;
      let httpStatus = 200;
      
      if (!metrics.isInitialized) {
        status = "not_initialized";
      } else if (metrics.fallbackFramesDecoded > 0 && metrics.totalFramesDecoded === 0) {
        status = "degraded_fallback_only";
        httpStatus = 503; // Service unavailable - decoder not working
      } else if (fallbackRatio > 50) {
        status = "degraded_high_fallback";
        httpStatus = 503; // More than half of decodes are fallback
      } else if (fallbackRatio > 10) {
        status = "warning_elevated_fallback";
      } else if (metrics.totalFramesDecoded > 0) {
        status = "healthy";
      } else {
        status = "ready";
      }
      
      res.status(httpStatus).json({
        status,
        metrics: {
          totalFramesDecoded: metrics.totalFramesDecoded,
          fallbackFramesDecoded: metrics.fallbackFramesDecoded,
          totalErrors: metrics.totalErrors,
          fallbackRatio: Math.round(fallbackRatio * 100) / 100,
          errorRate: totalDecodes > 0 
            ? Math.round((metrics.totalErrors / totalDecodes) * 10000) / 100 
            : 0,
          averageDecodeLatencyMs: Math.round(metrics.averageDecodeLatencyMs * 100) / 100,
          lastDecodeLatencyMs: Math.round(metrics.lastDecodeLatencyMs * 100) / 100,
          isInitialized: metrics.isInitialized,
        },
      });
    } catch (error) {
      console.error("[Wearable Routes] Decoder health error:", error);
      res.status(500).json({ error: "Failed to get decoder health" });
    }
  });

  app.post("/api/wearable/audio/vad", upload.single("audio"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Audio file is required" });
      }

      vadService.reset();

      const pcmData = new Int16Array(req.file.buffer);
      const frameSize = 480;
      const results: Array<{ isSpeech: boolean; energy: number; probability: number }> = [];

      for (let i = 0; i < pcmData.length; i += frameSize) {
        const frame = pcmData.slice(i, i + frameSize);
        if (frame.length === frameSize) {
          const result = vadService.processFrame(frame);
          results.push({
            isSpeech: result.isSpeech,
            energy: result.energy,
            probability: result.probability,
          });
        }
      }

      const speechFrames = results.filter(r => r.isSpeech).length;
      const totalFrames = results.length;
      const speechRatio = totalFrames > 0 ? speechFrames / totalFrames : 0;

      res.json({
        hasSpeech: speechRatio > 0.1,
        speechRatio,
        speechFrames,
        totalFrames,
        frameResults: results.slice(0, 100),
      });
    } catch (error) {
      console.error("[Wearable Routes] VAD error:", error);
      res.status(500).json({ error: "Failed to process VAD" });
    }
  });

  // ============================================
  // Conversation Sessions Routes
  // ============================================

  app.get("/api/wearable/sessions", async (req: Request, res: Response) => {
    try {
      const deviceId = req.query.deviceId as string;
      const source = req.query.source as string;
      const limit = parseInt(req.query.limit as string) || 20;

      let query = db.select().from(conversationSessions);

      if (deviceId) {
        query = query.where(eq(conversationSessions.deviceId, deviceId)) as typeof query;
      }

      if (source) {
        query = query.where(eq(conversationSessions.source, source)) as typeof query;
      }

      const sessions = await query
        .orderBy(desc(conversationSessions.startTime))
        .limit(limit);

      res.json({ sessions });
    } catch (error) {
      console.error("[Wearable Routes] Get sessions error:", error);
      res.status(500).json({ error: "Failed to get sessions" });
    }
  });

  app.get("/api/wearable/sessions/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      let sessions = await db
        .select()
        .from(conversationSessions)
        .where(eq(conversationSessions.id, id))
        .limit(1);

      if (sessions.length === 0) {
        sessions = await db
          .select()
          .from(conversationSessions)
          .where(eq(conversationSessions.externalId, id))
          .limit(1);
      }

      if (sessions.length === 0) {
        return res.status(404).json({ error: "Session not found" });
      }

      res.json(sessions[0]);
    } catch (error) {
      console.error("[Wearable Routes] Get session error:", error);
      res.status(500).json({ error: "Failed to get session" });
    }
  });

  app.post("/api/wearable/sessions/:id/create-memory", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      let sessions = await db
        .select()
        .from(conversationSessions)
        .where(eq(conversationSessions.id, id))
        .limit(1);

      if (sessions.length === 0) {
        sessions = await db
          .select()
          .from(conversationSessions)
          .where(eq(conversationSessions.externalId, id))
          .limit(1);
      }

      if (sessions.length === 0) {
        return res.status(404).json({ error: "Session not found" });
      }

      const session = sessions[0];

      if (session.memoryId) {
        return res.status(400).json({ error: "Memory already created for this session" });
      }

      if (!session.transcript) {
        return res.status(400).json({ error: "Session has no transcript" });
      }

      const metadata = session.metadata as { title?: string } | null;
      const duration = session.endTime && session.startTime 
        ? Math.round((session.endTime.getTime() - session.startTime.getTime()) / 1000)
        : 0;

      const memory = await db.insert(memories).values({
        deviceId: session.deviceId,
        title: metadata?.title || "Imported Conversation",
        transcript: session.transcript,
        speakers: session.speakers,
        duration,
        summary: null,
        actionItems: [],
        isStarred: false,
      }).returning();

      await db
        .update(conversationSessions)
        .set({ memoryId: memory[0].id, updatedAt: new Date() })
        .where(eq(conversationSessions.id, id));

      res.json({ success: true, memory: memory[0] });
    } catch (error) {
      console.error("[Wearable Routes] Create memory error:", error);
      res.status(500).json({ error: "Failed to create memory" });
    }
  });

  app.post("/api/wearable/sessions/:id/reconcile", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await conversationBridgeService.reconcileSession(id);

      if (result.success) {
        res.json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error("[Wearable Routes] Reconcile session error:", error);
      res.status(500).json({ error: "Failed to reconcile session" });
    }
  });

  // ============================================
  // Offline Sync Queue Routes
  // ============================================

  app.get("/api/wearable/sync-queue", async (req: Request, res: Response) => {
    try {
      const deviceId = req.query.deviceId as string;
      const status = req.query.status as string;

      let query = db.select().from(offlineSyncQueue);

      if (deviceId) {
        query = query.where(eq(offlineSyncQueue.deviceId, deviceId)) as typeof query;
      }

      if (status) {
        query = query.where(eq(offlineSyncQueue.status, status)) as typeof query;
      }

      const items = await query.orderBy(desc(offlineSyncQueue.priority)).limit(100);

      res.json({ items });
    } catch (error) {
      console.error("[Wearable Routes] Get sync queue error:", error);
      res.status(500).json({ error: "Failed to get sync queue" });
    }
  });

  app.post("/api/wearable/sync-queue", async (req: Request, res: Response) => {
    try {
      const { deviceId, recordingType, audioData, duration, priority = 0 } = req.body;

      if (!deviceId || !recordingType) {
        return res.status(400).json({ error: "deviceId and recordingType are required" });
      }

      const item = await db.insert(offlineSyncQueue).values({
        deviceId,
        recordingType,
        audioData,
        duration,
        priority,
        status: "pending",
        recordedAt: new Date(),
      }).returning();

      res.json({ success: true, item: item[0] });
    } catch (error) {
      console.error("[Wearable Routes] Add to sync queue error:", error);
      res.status(500).json({ error: "Failed to add to sync queue" });
    }
  });

  app.patch("/api/wearable/sync-queue/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, errorMessage } = req.body;

      const updates: Record<string, unknown> = {};
      if (status) updates.status = status;
      if (errorMessage !== undefined) updates.errorMessage = errorMessage;
      if (status === "processed") updates.processedAt = new Date();
      if (status === "failed") {
        const current = await db
          .select()
          .from(offlineSyncQueue)
          .where(eq(offlineSyncQueue.id, id))
          .limit(1);
        if (current.length > 0) {
          updates.retryCount = current[0].retryCount + 1;
        }
      }

      const updated = await db
        .update(offlineSyncQueue)
        .set(updates)
        .where(eq(offlineSyncQueue.id, id))
        .returning();

      if (updated.length === 0) {
        return res.status(404).json({ error: "Queue item not found" });
      }

      res.json(updated[0]);
    } catch (error) {
      console.error("[Wearable Routes] Update sync queue error:", error);
      res.status(500).json({ error: "Failed to update sync queue item" });
    }
  });

  // ============================================
  // Knowledge Graph Routes
  // ============================================

  const ZEKE_BACKEND_URL = process.env.EXPO_PUBLIC_ZEKE_BACKEND_URL || "https://zekeai.replit.app";

  app.get("/api/wearable/speakers/relationships", async (req: Request, res: Response) => {
    try {
      const deviceId = req.query.deviceId as string;
      const speakerId = req.query.speakerId as string;

      const response = await fetch(
        `${ZEKE_BACKEND_URL}/api/knowledge-graph/relationships?type=person${speakerId ? `&entity=${speakerId}` : ""}`,
        {
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to fetch relationships" });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("[Wearable Routes] Get speaker relationships error:", error);
      res.status(500).json({ error: "Failed to get speaker relationships" });
    }
  });

  app.post("/api/wearable/speakers/:id/link", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { entityName, relationship } = req.body;

      if (!entityName || !relationship) {
        return res.status(400).json({ error: "entityName and relationship are required" });
      }

      const profile = await db
        .select()
        .from(speakerProfiles)
        .where(eq(speakerProfiles.id, id))
        .limit(1);

      if (profile.length === 0) {
        return res.status(404).json({ error: "Speaker profile not found" });
      }

      const response = await fetch(`${ZEKE_BACKEND_URL}/api/knowledge-graph/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entities: [
            {
              name: profile[0].name,
              type: "person",
              attributes: { speakerId: id, source: "voice_enrollment" },
            },
            {
              name: entityName,
              type: "person",
              attributes: {},
            },
          ],
          relationships: [
            {
              source: profile[0].name,
              target: entityName,
              type: relationship,
              context: `Linked via voice enrollment on ${new Date().toLocaleDateString()}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to create relationship" });
      }

      res.json({ success: true, message: `Linked ${profile[0].name} to ${entityName}` });
    } catch (error) {
      console.error("[Wearable Routes] Link speaker error:", error);
      res.status(500).json({ error: "Failed to link speaker to knowledge graph" });
    }
  });

  app.get("/api/wearable/speakers/:id/context", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const profile = await db
        .select()
        .from(speakerProfiles)
        .where(eq(speakerProfiles.id, id))
        .limit(1);

      if (profile.length === 0) {
        return res.status(404).json({ error: "Speaker profile not found" });
      }

      const [relationshipsRes, sessionsRes] = await Promise.all([
        fetch(`${ZEKE_BACKEND_URL}/api/knowledge-graph/entity/${encodeURIComponent(profile[0].name)}`, {
          headers: { "Content-Type": "application/json" },
        }).catch(() => null),
        db
          .select()
          .from(conversationSessions)
          .where(eq(conversationSessions.deviceId, profile[0].deviceId))
          .orderBy(desc(conversationSessions.startTime))
          .limit(10),
      ]);

      const entityData = relationshipsRes?.ok ? await relationshipsRes.json() : null;

      res.json({
        profile: {
          id: profile[0].id,
          name: profile[0].name,
          createdAt: profile[0].createdAt,
        },
        knowledgeGraph: entityData,
        recentConversations: sessionsRes.length,
      });
    } catch (error) {
      console.error("[Wearable Routes] Get speaker context error:", error);
      res.status(500).json({ error: "Failed to get speaker context" });
    }
  });

  console.log("[Wearable Routes] Endpoints registered:");
  console.log("  POST /api/wearable/limitless/configure - Configure Limitless API");
  console.log("  GET  /api/wearable/limitless/status - Get Limitless connection status");
  console.log("  POST /api/wearable/limitless/sync - Sync lifelogs from Limitless");
  console.log("  GET  /api/wearable/limitless/lifelogs - Fetch recent lifelogs");
  console.log("  POST /api/wearable/voice/enroll - Enroll voice sample");
  console.log("  POST /api/wearable/voice/match - Match voice to profiles");
  console.log("  GET  /api/wearable/voice/profiles - Get voice profiles");
  console.log("  DELETE /api/wearable/voice/profiles/:id - Delete voice profile");
  console.log("  POST /api/wearable/voice/profiles/:id/link-speaker - Link profile to diarization ID");
  console.log("  POST /api/wearable/audio/decode-opus - Decode Opus to WAV");
  console.log("  GET  /api/wearable/audio/decoder-health - Get decoder health metrics");
  console.log("  POST /api/wearable/audio/vad - Analyze audio for speech");
  console.log("  GET  /api/wearable/sessions - Get conversation sessions");
  console.log("  GET  /api/wearable/sessions/:id - Get session details");
  console.log("  POST /api/wearable/sessions/:id/create-memory - Create memory from session");
  console.log("  POST /api/wearable/sessions/:id/reconcile - Reprocess session speaker links");
  console.log("  GET  /api/wearable/sync-queue - Get offline sync queue");
  console.log("  POST /api/wearable/sync-queue - Add to sync queue");
  console.log("  PATCH /api/wearable/sync-queue/:id - Update sync queue item");
  console.log("  GET  /api/wearable/speakers/relationships - Get speaker relationships");
  console.log("  POST /api/wearable/speakers/:id/link - Link speaker to knowledge graph");
  console.log("  GET  /api/wearable/speakers/:id/context - Get speaker context");
}

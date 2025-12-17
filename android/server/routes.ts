import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { storage } from "./storage";
import { insertDeviceSchema, insertMemorySchema, insertChatSessionSchema, insertChatMessageSchema } from "@shared/schema";
import OpenAI from "openai";
import multer from "multer";
import { registerLocationRoutes } from "./location";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const ZEKE_SYSTEM_PROMPT = `You are ZEKE, an intelligent AI companion designed to help users recall and search their memories captured by wearable devices like Omi and Limitless.

Your role is to:
- Help users find specific conversations or moments from their recorded memories
- Summarize and synthesize information across multiple memories
- Answer questions about past events, meetings, or conversations
- Provide insights and patterns from the user's memory history
- Be conversational, friendly, and helpful

You have access to the user's memory transcripts and can help them navigate their personal knowledge base. Always be respectful of the personal nature of this data and maintain user privacy.

When referring to memories, be specific about dates, participants, and context when available. If you don't have enough information, ask clarifying questions.`;

export async function registerRoutes(app: Express): Promise<Server> {
  // Device routes
  app.get("/api/devices", async (_req, res) => {
    try {
      const devices = await storage.getDevices();
      res.json(devices);
    } catch (error) {
      console.error("Error fetching devices:", error);
      res.status(500).json({ error: "Failed to fetch devices" });
    }
  });

  app.get("/api/devices/:id", async (req, res) => {
    try {
      const device = await storage.getDevice(req.params.id);
      if (!device) {
        return res.status(404).json({ error: "Device not found" });
      }
      res.json(device);
    } catch (error) {
      console.error("Error fetching device:", error);
      res.status(500).json({ error: "Failed to fetch device" });
    }
  });

  app.post("/api/devices", async (req, res) => {
    try {
      const parsed = insertDeviceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid device data", details: parsed.error.errors });
      }
      const device = await storage.createDevice(parsed.data);
      res.status(201).json(device);
    } catch (error) {
      console.error("Error creating device:", error);
      res.status(500).json({ error: "Failed to create device" });
    }
  });

  app.patch("/api/devices/:id", async (req, res) => {
    try {
      const device = await storage.updateDevice(req.params.id, req.body);
      if (!device) {
        return res.status(404).json({ error: "Device not found" });
      }
      res.json(device);
    } catch (error) {
      console.error("Error updating device:", error);
      res.status(500).json({ error: "Failed to update device" });
    }
  });

  app.delete("/api/devices/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteDevice(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Device not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting device:", error);
      res.status(500).json({ error: "Failed to delete device" });
    }
  });

  // Memory routes
  app.get("/api/memories", async (req, res) => {
    try {
      const filters: { deviceId?: string; isStarred?: boolean; search?: string; limit?: number } = {};
      
      if (req.query.deviceId) {
        filters.deviceId = req.query.deviceId as string;
      }
      if (req.query.isStarred !== undefined) {
        filters.isStarred = req.query.isStarred === "true";
      }
      if (req.query.search) {
        filters.search = req.query.search as string;
      }
      if (req.query.limit) {
        filters.limit = parseInt(req.query.limit as string, 10);
      }
      
      const memories = await storage.getMemories(filters);
      res.json(memories);
    } catch (error) {
      console.error("Error fetching memories:", error);
      res.status(500).json({ error: "Failed to fetch memories" });
    }
  });

  app.get("/api/memories/:id", async (req, res) => {
    try {
      const memory = await storage.getMemory(req.params.id);
      if (!memory) {
        return res.status(404).json({ error: "Memory not found" });
      }
      res.json(memory);
    } catch (error) {
      console.error("Error fetching memory:", error);
      res.status(500).json({ error: "Failed to fetch memory" });
    }
  });

  app.post("/api/memories", async (req, res) => {
    try {
      const { deviceId, transcript, duration, speakers } = req.body;
      
      if (!deviceId || !transcript || duration === undefined) {
        return res.status(400).json({ 
          error: "Missing required fields", 
          details: "deviceId, transcript, and duration are required" 
        });
      }

      const analysisPrompt = `Analyze the following conversation transcript and provide:
1. A short, descriptive title (max 10 words)
2. A summary (2-3 sentences)
3. A list of action items extracted from the conversation (if any)

Transcript:
${transcript}

Respond in JSON format:
{
  "title": "...",
  "summary": "...",
  "actionItems": ["action 1", "action 2", ...]
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are an AI assistant that analyzes conversation transcripts. Always respond with valid JSON." },
          { role: "user", content: analysisPrompt }
        ],
        max_completion_tokens: 500,
        response_format: { type: "json_object" }
      });

      const responseContent = completion.choices[0]?.message?.content || '{}';
      let analysis: { title?: string; summary?: string; actionItems?: string[] };
      
      try {
        analysis = JSON.parse(responseContent);
      } catch {
        analysis = {
          title: "Untitled Memory",
          summary: transcript.substring(0, 200),
          actionItems: []
        };
      }

      const memoryData = {
        deviceId,
        transcript,
        duration,
        speakers: speakers || null,
        title: analysis.title || "Untitled Memory",
        summary: analysis.summary || null,
        actionItems: analysis.actionItems || []
      };

      const parsed = insertMemorySchema.safeParse(memoryData);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid memory data", details: parsed.error.errors });
      }
      
      const memory = await storage.createMemory(parsed.data);
      res.status(201).json(memory);
    } catch (error) {
      console.error("Error creating memory:", error);
      res.status(500).json({ error: "Failed to create memory" });
    }
  });

  app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      const uint8Array = new Uint8Array(req.file.buffer);
      const file = new File([uint8Array], req.file.originalname, { type: req.file.mimetype });
      
      const transcription = await openai.audio.transcriptions.create({
        file: file,
        model: "whisper-1",
        response_format: "verbose_json"
      });

      res.json({
        text: transcription.text,
        duration: transcription.duration || 0,
        segments: transcription.segments || []
      });
    } catch (error) {
      console.error("Error transcribing audio:", error);
      res.status(500).json({ error: "Failed to transcribe audio" });
    }
  });

  app.post("/api/transcribe-and-create-memory", upload.single("audio"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      const deviceId = req.body.deviceId;
      if (!deviceId) {
        return res.status(400).json({ error: "deviceId is required" });
      }

      const uint8Array2 = new Uint8Array(req.file.buffer);
      const file = new File([uint8Array2], req.file.originalname, { type: req.file.mimetype });
      
      const transcription = await openai.audio.transcriptions.create({
        file: file,
        model: "whisper-1",
        response_format: "verbose_json"
      });

      const transcript = transcription.text;
      const duration = transcription.duration || 0;

      const analysisPrompt = `Analyze the following conversation transcript and provide:
1. A short, descriptive title (max 10 words)
2. A summary (2-3 sentences)
3. A list of action items extracted from the conversation (if any)

Transcript:
${transcript}

Respond in JSON format:
{
  "title": "...",
  "summary": "...",
  "actionItems": ["action 1", "action 2", ...]
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are an AI assistant that analyzes conversation transcripts. Always respond with valid JSON." },
          { role: "user", content: analysisPrompt }
        ],
        max_completion_tokens: 500,
        response_format: { type: "json_object" }
      });

      const responseContent = completion.choices[0]?.message?.content || '{}';
      let analysis: { title?: string; summary?: string; actionItems?: string[] };
      
      try {
        analysis = JSON.parse(responseContent);
      } catch {
        analysis = {
          title: "Untitled Memory",
          summary: transcript.substring(0, 200),
          actionItems: []
        };
      }

      const memoryData = {
        deviceId,
        transcript,
        duration,
        speakers: req.body.speakers || null,
        title: analysis.title || "Untitled Memory",
        summary: analysis.summary || null,
        actionItems: analysis.actionItems || []
      };

      const parsed = insertMemorySchema.safeParse(memoryData);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid memory data", details: parsed.error.errors });
      }
      
      const memory = await storage.createMemory(parsed.data);
      res.status(201).json(memory);
    } catch (error) {
      console.error("Error transcribing and creating memory:", error);
      res.status(500).json({ error: "Failed to transcribe and create memory" });
    }
  });

  app.patch("/api/memories/:id", async (req, res) => {
    try {
      const allowedFields = ["title", "summary", "isStarred"];
      const updates: Record<string, any> = {};
      
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }
      
      const memory = await storage.updateMemory(req.params.id, updates);
      if (!memory) {
        return res.status(404).json({ error: "Memory not found" });
      }
      res.json(memory);
    } catch (error) {
      console.error("Error updating memory:", error);
      res.status(500).json({ error: "Failed to update memory" });
    }
  });

  app.delete("/api/memories/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteMemory(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Memory not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting memory:", error);
      res.status(500).json({ error: "Failed to delete memory" });
    }
  });

  app.post("/api/memories/:id/star", async (req, res) => {
    try {
      const memory = await storage.starMemory(req.params.id);
      if (!memory) {
        return res.status(404).json({ error: "Memory not found" });
      }
      res.json(memory);
    } catch (error) {
      console.error("Error starring memory:", error);
      res.status(500).json({ error: "Failed to star memory" });
    }
  });

  app.post("/api/memories/search", async (req, res) => {
    try {
      const { query, limit = 10 } = req.body;
      
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: "Query is required" });
      }

      const memories = await storage.getMemories({ limit: 50 });
      
      if (memories.length === 0) {
        return res.json({ results: [], query });
      }

      const memoriesContext = memories.map((m, idx) => ({
        index: idx,
        id: m.id,
        title: m.title,
        summary: m.summary || '',
        transcript: m.transcript.substring(0, 500),
        createdAt: m.createdAt,
        actionItems: m.actionItems
      }));

      const searchPrompt = `You are a semantic search engine for a personal memory system. The user has recorded conversations and meetings that are stored as "memories".

Given the user's search query, analyze the memories below and return the most relevant ones ranked by relevance.

User's search query: "${query}"

Available memories:
${memoriesContext.map(m => `
[Memory ${m.index}] ID: ${m.id}
Title: ${m.title}
Summary: ${m.summary}
Transcript excerpt: ${m.transcript}
Date: ${m.createdAt}
Action items: ${JSON.stringify(m.actionItems || [])}
`).join('\n---\n')}

Instructions:
- Understand the semantic meaning of the query (not just keyword matching)
- Consider context, synonyms, and related concepts
- Queries like "meetings about budgets" should match memories discussing finances, costs, spending, etc.
- Queries like "action items from last week" should prioritize memories with action items
- Return memory IDs ranked by relevance with a relevance score (0-100)

Respond with valid JSON in this format:
{
  "results": [
    { "id": "memory-id-here", "relevanceScore": 95, "reason": "Brief reason why this is relevant" },
    ...
  ]
}

Return at most ${Math.min(limit, 10)} results. Only include memories with relevance score >= 30.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a semantic search assistant. Always respond with valid JSON." },
          { role: "user", content: searchPrompt }
        ],
        max_completion_tokens: 1000,
        response_format: { type: "json_object" }
      });

      const responseContent = completion.choices[0]?.message?.content || '{"results":[]}';
      let searchResults: { results: Array<{ id: string; relevanceScore: number; reason?: string }> };
      
      try {
        searchResults = JSON.parse(responseContent);
      } catch {
        searchResults = { results: [] };
      }

      const memoryMap = new Map(memories.map(m => [m.id, m]));
      const maxResults = Math.min(limit, 10);
      const rankedResults = searchResults.results
        .filter(r => memoryMap.has(r.id) && r.relevanceScore >= 30)
        .slice(0, maxResults)
        .map(r => ({
          ...memoryMap.get(r.id),
          relevanceScore: r.relevanceScore,
          matchReason: r.reason
        }));

      res.json({
        results: rankedResults,
        query,
        totalMatches: rankedResults.length
      });
    } catch (error) {
      console.error("Error in semantic search:", error);
      res.status(500).json({ error: "Failed to perform semantic search" });
    }
  });

  // Chat routes
  app.get("/api/chat/sessions", async (_req, res) => {
    try {
      const sessions = await storage.getChatSessions();
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching chat sessions:", error);
      res.status(500).json({ error: "Failed to fetch chat sessions" });
    }
  });

  app.post("/api/chat/sessions", async (req, res) => {
    try {
      const parsed = insertChatSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid session data", details: parsed.error.errors });
      }
      const session = await storage.createChatSession(parsed.data);
      res.status(201).json(session);
    } catch (error) {
      console.error("Error creating chat session:", error);
      res.status(500).json({ error: "Failed to create chat session" });
    }
  });

  app.get("/api/chat/sessions/:id/messages", async (req, res) => {
    try {
      const session = await storage.getChatSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      const messages = await storage.getMessagesBySession(req.params.id);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/chat/sessions/:id/messages", async (req, res) => {
    try {
      const session = await storage.getChatSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const parsed = insertChatMessageSchema.safeParse({
        sessionId: req.params.id,
        role: "user",
        content: req.body.content
      });
      
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid message data", details: parsed.error.errors });
      }

      const userMessage = await storage.createMessage(parsed.data);

      const previousMessages = await storage.getMessagesBySession(req.params.id);
      
      const recentMemories = await storage.getMemories({ limit: 10 });
      const memoryContext = recentMemories.length > 0 
        ? `\n\nRecent memories from the user's wearable devices:\n${recentMemories.map(m => 
            `- ${m.title} (${m.createdAt}): ${m.summary || m.transcript.substring(0, 200)}...`
          ).join('\n')}`
        : '';

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system", content: ZEKE_SYSTEM_PROMPT + memoryContext },
        ...previousMessages.map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content
        })),
        { role: "user", content: req.body.content }
      ];

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        max_completion_tokens: 1000
      });

      const assistantContent = completion.choices[0]?.message?.content || "I apologize, but I couldn't generate a response. Please try again.";

      const assistantMessage = await storage.createMessage({
        sessionId: req.params.id,
        role: "assistant",
        content: assistantContent
      });

      res.status(201).json({
        userMessage,
        assistantMessage
      });
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.delete("/api/chat/sessions/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteChatSession(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting session:", error);
      res.status(500).json({ error: "Failed to delete session" });
    }
  });

  // =========================================
  // Omi Webhook Routes
  // =========================================

  // Memory Trigger Webhook - Called when Omi creates a new memory/conversation
  app.post("/api/omi/memory-trigger", async (req, res) => {
    try {
      const uid = req.query.uid as string;
      const memoryData = req.body;
      
      console.log("[Omi Memory Trigger] Received memory for user:", uid);
      console.log("[Omi Memory Trigger] Memory ID:", memoryData.id);

      // Extract transcript from segments (Omi uses snake_case: transcript_segments)
      const transcriptSegments = memoryData.transcript_segments || memoryData.transcriptSegments || [];
      const transcript = transcriptSegments.map((seg: any) => seg.text).join(" ");
      
      // Get structured data
      const structured = memoryData.structured || {};
      const title = structured.title || "Omi Memory";
      const summary = structured.overview || null;
      
      // Extract action items - handle both formats
      const rawActionItems = structured.action_items || structured.actionItems || [];
      const actionItems = rawActionItems.map((item: any) => 
        typeof item === 'string' ? item : (item.description || item.text || JSON.stringify(item))
      );

      // Calculate duration from timestamps
      const startedAt = memoryData.started_at ? new Date(memoryData.started_at) : null;
      const finishedAt = memoryData.finished_at ? new Date(memoryData.finished_at) : null;
      const duration = startedAt && finishedAt 
        ? Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000)
        : 0;

      // Extract unique speakers as array with metadata
      const speakersMap = new Map<number, { id: number; label: string; isUser: boolean }>();
      for (const seg of transcriptSegments) {
        const speakerId = seg.speakerId ?? seg.speaker_id ?? 0;
        if (!speakersMap.has(speakerId)) {
          speakersMap.set(speakerId, {
            id: speakerId,
            label: seg.speaker || `Speaker ${speakerId}`,
            isUser: seg.is_user || seg.isUser || false
          });
        }
      }
      const speakers = Array.from(speakersMap.values());

      // Find or create a default Omi device
      let devices = await storage.getDevices();
      let omiDevice = devices.find(d => d.type === "omi");
      
      if (!omiDevice) {
        omiDevice = await storage.createDevice({
          name: "Omi Wearable",
          type: "omi",
          isConnected: true
        });
      }

      // Create the memory in our system
      if (transcript && !memoryData.discarded) {
        const memoryPayload = {
          deviceId: omiDevice.id,
          transcript,
          duration,
          speakers: speakers.length > 0 ? speakers : null,
          title,
          summary,
          actionItems: actionItems.length > 0 ? actionItems : []
        };

        const parsed = insertMemorySchema.safeParse(memoryPayload);
        if (parsed.success) {
          const memory = await storage.createMemory(parsed.data);
          console.log("[Omi Memory Trigger] Created memory:", memory.id);
        } else {
          console.error("[Omi Memory Trigger] Validation error:", parsed.error.errors);
        }
      }

      res.json({ status: "ok", message: "Memory processed" });
    } catch (error) {
      console.error("[Omi Memory Trigger] Error:", error);
      res.status(500).json({ error: "Failed to process memory" });
    }
  });

  // Real-time Transcript Webhook - Called with live transcript segments
  app.post("/api/omi/transcript", async (req, res) => {
    try {
      const sessionId = req.query.session_id as string;
      const uid = req.query.uid as string;
      const segments = req.body;

      console.log("[Omi Transcript] Session:", sessionId, "User:", uid);
      console.log("[Omi Transcript] Received", Array.isArray(segments) ? segments.length : 0, "segments");

      // Log the transcript segments for real-time processing
      if (Array.isArray(segments)) {
        for (const segment of segments) {
          console.log(`[Omi Transcript] Speaker ${segment.speakerId || segment.speaker}: ${segment.text}`);
        }
      }

      // Return success - real-time processing can be extended here
      res.json({ status: "ok" });
    } catch (error) {
      console.error("[Omi Transcript] Error:", error);
      res.status(500).json({ error: "Failed to process transcript" });
    }
  });

  // Audio Bytes Webhook - Called with raw PCM16 audio data
  app.post("/api/omi/audio-bytes", async (req, res) => {
    try {
      const sampleRate = req.query.sample_rate as string || "16000";
      const uid = req.query.uid as string;
      
      // Get raw audio bytes from the request body
      const audioBuffer = req.body;
      const byteLength = Buffer.isBuffer(audioBuffer) ? audioBuffer.length : 0;

      console.log("[Omi Audio Bytes] User:", uid);
      console.log("[Omi Audio Bytes] Sample rate:", sampleRate);
      console.log("[Omi Audio Bytes] Received", byteLength, "bytes");

      // Audio processing can be extended here (e.g., custom STT, VAD, etc.)
      
      res.json({ status: "ok", bytes_received: byteLength });
    } catch (error) {
      console.error("[Omi Audio Bytes] Error:", error);
      res.status(500).json({ error: "Failed to process audio" });
    }
  });

  // Day Summary Webhook - Called when a daily summary is generated
  app.post("/api/omi/day-summary", async (req, res) => {
    try {
      const uid = req.query.uid as string;
      const summaryData = req.body;

      console.log("[Omi Day Summary] User:", uid);
      console.log("[Omi Day Summary] Data:", JSON.stringify(summaryData, null, 2));

      // Find or create a default Omi device
      let devices = await storage.getDevices();
      let omiDevice = devices.find(d => d.type === "omi");
      
      if (!omiDevice) {
        omiDevice = await storage.createDevice({
          name: "Omi Wearable",
          type: "omi",
          isConnected: true
        });
      }

      // Create a memory for the day summary
      const summaryText = typeof summaryData === 'string' 
        ? summaryData 
        : summaryData.summary || summaryData.content || JSON.stringify(summaryData);

      const today = new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      const memoryPayload = {
        deviceId: omiDevice.id,
        transcript: summaryText,
        duration: 0,
        speakers: null,
        title: `Day Summary - ${today}`,
        summary: summaryText.substring(0, 500),
        actionItems: []
      };

      const parsed = insertMemorySchema.safeParse(memoryPayload);
      if (parsed.success) {
        const memory = await storage.createMemory(parsed.data);
        console.log("[Omi Day Summary] Created summary memory:", memory.id);
      }

      res.json({ status: "ok", message: "Day summary processed" });
    } catch (error) {
      console.error("[Omi Day Summary] Error:", error);
      res.status(500).json({ error: "Failed to process day summary" });
    }
  });

  // =========================================
  // Twilio SMS Routes
  // =========================================

  app.get("/api/twilio/sms/conversations", async (_req, res) => {
    try {
      const { getSmsConversations } = await import("./twilio");
      const conversations = await getSmsConversations();
      res.json(conversations);
    } catch (error) {
      console.error("[Twilio] Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/twilio/sms/conversation/:phoneNumber", async (req, res) => {
    try {
      const { getConversation } = await import("./twilio");
      const phoneNumber = decodeURIComponent(req.params.phoneNumber);
      const conversation = await getConversation(phoneNumber);
      
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      res.json(conversation);
    } catch (error) {
      console.error("[Twilio] Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  app.post("/api/twilio/sms/send", async (req, res) => {
    try {
      const { to, body } = req.body;
      
      if (!to || !body) {
        return res.status(400).json({ error: "Missing 'to' or 'body' field" });
      }
      
      const { sendSms } = await import("./twilio");
      const message = await sendSms(to, body);
      
      const { broadcastZekeSync } = await import("./websocket");
      broadcastZekeSync({
        type: 'sms',
        action: 'created',
        data: { message, direction: 'outbound' },
        timestamp: new Date().toISOString()
      });
      
      res.status(201).json(message);
    } catch (error) {
      console.error("[Twilio] Error sending SMS:", error);
      res.status(500).json({ error: "Failed to send SMS" });
    }
  });

  // =========================================
  // Twilio Voice Routes
  // =========================================

  app.get("/api/twilio/calls", async (_req, res) => {
    try {
      const { getRecentCalls } = await import("./twilio");
      const calls = await getRecentCalls();
      res.json(calls);
    } catch (error) {
      console.error("[Twilio] Error fetching calls:", error);
      res.status(500).json({ error: "Failed to fetch calls" });
    }
  });

  app.get("/api/twilio/calls/:callSid", async (req, res) => {
    try {
      const { getCallDetails } = await import("./twilio");
      const call = await getCallDetails(req.params.callSid);
      
      if (!call) {
        return res.status(404).json({ error: "Call not found" });
      }
      
      res.json(call);
    } catch (error) {
      console.error("[Twilio] Error fetching call:", error);
      res.status(500).json({ error: "Failed to fetch call" });
    }
  });

  app.post("/api/twilio/call/initiate", async (req, res) => {
    try {
      const { to } = req.body;
      
      if (!to) {
        return res.status(400).json({ error: "Missing 'to' field" });
      }
      
      const { initiateCall } = await import("./twilio");
      const call = await initiateCall(to);
      
      const { broadcastZekeSync } = await import("./websocket");
      broadcastZekeSync({
        type: 'voice',
        action: 'created',
        data: { call, direction: 'outbound' },
        timestamp: new Date().toISOString()
      });
      
      res.status(201).json(call);
    } catch (error) {
      console.error("[Twilio] Error initiating call:", error);
      res.status(500).json({ error: "Failed to initiate call" });
    }
  });

  // =========================================
  // Twilio Webhooks (for incoming calls/SMS)
  // =========================================

  app.post("/api/twilio/webhook/sms", async (req, res) => {
    try {
      const { From, To, Body, MessageSid, NumMedia } = req.body;
      
      console.log("[Twilio Webhook] Incoming SMS from", From, ":", Body);
      
      const { broadcastZekeSync } = await import("./websocket");
      broadcastZekeSync({
        type: 'sms',
        action: 'created',
        data: {
          message: {
            sid: MessageSid,
            from: From,
            to: To,
            body: Body,
            direction: 'inbound',
            numMedia: NumMedia || '0',
            dateCreated: new Date().toISOString()
          }
        },
        timestamp: new Date().toISOString()
      });
      
      res.type('text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    } catch (error) {
      console.error("[Twilio Webhook] SMS error:", error);
      res.type('text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }
  });

  app.post("/api/twilio/webhook/voice", async (req, res) => {
    try {
      const { From, To, CallSid, CallStatus, Direction } = req.body;
      
      console.log("[Twilio Webhook] Incoming call from", From, "status:", CallStatus);
      
      const { broadcastZekeSync } = await import("./websocket");
      broadcastZekeSync({
        type: 'voice',
        action: CallStatus === 'ringing' ? 'created' : 'status_change',
        data: {
          call: {
            sid: CallSid,
            from: From,
            to: To,
            status: CallStatus,
            direction: Direction,
            dateCreated: new Date().toISOString()
          }
        },
        timestamp: new Date().toISOString()
      });
      
      res.type('text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Hello! This is ZEKE. Please hold while we connect you.</Say>
  <Play>http://com.twilio.music.ambient.s3.amazonaws.com/BustinLoose.mp3</Play>
</Response>`);
    } catch (error) {
      console.error("[Twilio Webhook] Voice error:", error);
      res.type('text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
    }
  });

  app.post("/api/twilio/webhook/voice-status", async (req, res) => {
    try {
      const { CallSid, CallStatus, CallDuration, From, To } = req.body;
      
      console.log("[Twilio Webhook] Call status update:", CallSid, CallStatus, "duration:", CallDuration);
      
      const { broadcastZekeSync } = await import("./websocket");
      broadcastZekeSync({
        type: 'voice',
        action: 'status_change',
        data: {
          call: {
            sid: CallSid,
            from: From,
            to: To,
            status: CallStatus,
            duration: parseInt(CallDuration || '0', 10)
          }
        },
        timestamp: new Date().toISOString()
      });
      
      res.sendStatus(200);
    } catch (error) {
      console.error("[Twilio Webhook] Status error:", error);
      res.sendStatus(200);
    }
  });

  app.get("/api/twilio/phone-number", async (_req, res) => {
    try {
      const { getTwilioFromPhoneNumber } = await import("./twilio");
      const phoneNumber = await getTwilioFromPhoneNumber();
      res.json({ phoneNumber });
    } catch (error) {
      console.error("[Twilio] Error fetching phone number:", error);
      res.status(500).json({ error: "Failed to fetch phone number" });
    }
  });

  // =========================================
  // Google Calendar Routes
  // =========================================

  app.get("/api/calendar/today", async (_req, res) => {
    try {
      const { getTodayEvents } = await import("./google-calendar");
      const events = await getTodayEvents();
      res.json(events);
    } catch (error: any) {
      console.error("[Google Calendar] Error fetching today's events:", error);
      if (error.message?.includes('not connected')) {
        return res.status(503).json({ error: "Google Calendar not connected" });
      }
      res.status(500).json({ error: "Failed to fetch calendar events" });
    }
  });

  app.get("/api/calendar/upcoming", async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const limit = parseInt(req.query.limit as string) || 50;
      const { getUpcomingEvents } = await import("./google-calendar");
      const events = await getUpcomingEvents(days);
      res.json(events.slice(0, limit));
    } catch (error: any) {
      console.error("[Google Calendar] Error fetching upcoming events:", error);
      if (error.message?.includes('not connected')) {
        return res.status(503).json({ error: "Google Calendar not connected" });
      }
      res.status(500).json({ error: "Failed to fetch calendar events" });
    }
  });

  app.get("/api/calendar/events", async (req, res) => {
    try {
      const { timeMin, timeMax, calendarId } = req.query;
      const { getEvents } = await import("./google-calendar");
      const events = await getEvents(
        timeMin as string | undefined,
        timeMax as string | undefined,
        (calendarId as string) || 'primary'
      );
      res.json(events);
    } catch (error: any) {
      console.error("[Google Calendar] Error fetching events:", error);
      if (error.message?.includes('not connected')) {
        return res.status(503).json({ error: "Google Calendar not connected" });
      }
      res.status(500).json({ error: "Failed to fetch calendar events" });
    }
  });

  app.get("/api/calendar/calendars", async (_req, res) => {
    try {
      const { getCalendarList } = await import("./google-calendar");
      const calendars = await getCalendarList();
      res.json(calendars);
    } catch (error: any) {
      console.error("[Google Calendar] Error fetching calendar list:", error);
      if (error.message?.includes('not connected')) {
        return res.status(503).json({ error: "Google Calendar not connected" });
      }
      res.status(500).json({ error: "Failed to fetch calendar list" });
    }
  });

  app.get("/api/calendar/zeke", async (_req, res) => {
    try {
      const { getOrCreateZekeCalendar } = await import("./google-calendar");
      const zekeCalendar = await getOrCreateZekeCalendar();
      res.json(zekeCalendar);
    } catch (error: any) {
      console.error("[Google Calendar] Error getting ZEKE calendar:", error);
      if (error.message?.includes('not connected')) {
        return res.status(503).json({ error: "Google Calendar not connected" });
      }
      res.status(500).json({ error: "Failed to get ZEKE calendar" });
    }
  });

  app.post("/api/calendar/events", async (req, res) => {
    try {
      const { title, startTime, endTime, description, location, calendarId } = req.body;
      
      if (!title || !startTime) {
        return res.status(400).json({ error: "Title and startTime are required" });
      }
      
      const { createEvent } = await import("./google-calendar");
      const event = await createEvent({
        title,
        startTime,
        endTime,
        description,
        location,
        calendarId,
      });
      res.status(201).json(event);
    } catch (error: any) {
      console.error("[Google Calendar] Error creating event:", error);
      if (error.message?.includes('not connected')) {
        return res.status(503).json({ error: "Google Calendar not connected" });
      }
      res.status(500).json({ error: "Failed to create event" });
    }
  });

  app.patch("/api/calendar/events/:eventId", async (req, res) => {
    try {
      const { eventId } = req.params;
      const { calendarId, title, startTime, endTime, description, location } = req.body;
      
      let targetCalendarId = calendarId;
      
      // If no calendarId provided, try to find the event
      if (!targetCalendarId) {
        const { findEventCalendarId } = await import("./google-calendar");
        targetCalendarId = await findEventCalendarId(eventId);
        if (!targetCalendarId) {
          return res.status(404).json({ error: "Event not found" });
        }
      }
      
      const { updateEvent } = await import("./google-calendar");
      const event = await updateEvent(eventId, targetCalendarId, {
        title,
        startTime,
        endTime,
        description,
        location,
      });
      res.json(event);
    } catch (error: any) {
      console.error("[Google Calendar] Error updating event:", error);
      if (error.message?.includes('not connected')) {
        return res.status(503).json({ error: "Google Calendar not connected" });
      }
      res.status(500).json({ error: "Failed to update event" });
    }
  });

  app.delete("/api/calendar/events/:eventId", async (req, res) => {
    try {
      const { eventId } = req.params;
      const { calendarId } = req.query;
      
      let targetCalendarId = calendarId as string;
      
      // If no calendarId provided, try to find the event
      if (!targetCalendarId) {
        const { findEventCalendarId } = await import("./google-calendar");
        targetCalendarId = await findEventCalendarId(eventId) || '';
        if (!targetCalendarId) {
          return res.status(404).json({ error: "Event not found" });
        }
      }
      
      const { deleteEvent } = await import("./google-calendar");
      await deleteEvent(eventId, targetCalendarId);
      res.status(204).send();
    } catch (error: any) {
      console.error("[Google Calendar] Error deleting event:", error);
      if (error.message?.includes('not connected')) {
        return res.status(503).json({ error: "Google Calendar not connected" });
      }
      res.status(500).json({ error: "Failed to delete event" });
    }
  });

  // =========================================
  // Deepgram Configuration Status Endpoint (secure - no API key exposed)
  // =========================================
  
  app.get("/api/deepgram/status", (_req, res) => {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    
    res.json({
      configured: !!apiKey,
      wsEndpoint: "/ws/deepgram"
    });
  });

  const httpServer = createServer(app);

  // =========================================
  // Deepgram WebSocket Proxy (keeps API key server-side)
  // =========================================
  
  const WebSocket = require("ws");
  const wss = new WebSocket.Server({ noServer: true });

  httpServer.on("upgrade", (request: any, socket: any, head: any) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    
    if (pathname === "/ws/deepgram") {
      const apiKey = process.env.DEEPGRAM_API_KEY;
      
      if (!apiKey) {
        socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (clientWs: any) => {
        handleDeepgramProxy(clientWs, apiKey);
      });
    }
  });

  function handleDeepgramProxy(clientWs: any, apiKey: string) {
    let deepgramWs: any = null;
    let isClosing = false;

    const params = new URLSearchParams({
      model: "nova-2",
      language: "en-US",
      punctuate: "true",
      diarize: "true",
      smart_format: "true",
      interim_results: "true",
      utterance_end_ms: "1000",
      vad_events: "true",
      encoding: "linear16",
      sample_rate: "16000",
      channels: "1",
    });

    const deepgramUrl = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

    try {
      deepgramWs = new WebSocket(deepgramUrl, {
        headers: {
          Authorization: `Token ${apiKey}`,
        },
      });

      deepgramWs.on("open", () => {
        console.log("[Deepgram Proxy] Connected to Deepgram");
        clientWs.send(JSON.stringify({ type: "connected" }));
      });

      deepgramWs.on("message", (data: any) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data.toString());
        }
      });

      deepgramWs.on("error", (error: any) => {
        console.error("[Deepgram Proxy] Deepgram error:", error.message);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: "error", message: "Transcription service error" }));
        }
      });

      deepgramWs.on("close", (code: number, reason: string) => {
        console.log("[Deepgram Proxy] Deepgram closed:", code, reason?.toString());
        if (!isClosing && clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: "disconnected" }));
          clientWs.close();
        }
      });
    } catch (error) {
      console.error("[Deepgram Proxy] Failed to connect to Deepgram:", error);
      clientWs.send(JSON.stringify({ type: "error", message: "Failed to connect to transcription service" }));
      clientWs.close();
      return;
    }

    clientWs.on("message", (data: any) => {
      if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
        if (typeof data === "string") {
          const message = JSON.parse(data);
          if (message.type === "keepAlive") {
            deepgramWs.send(JSON.stringify({ type: "KeepAlive" }));
          } else if (message.type === "finalize") {
            deepgramWs.send(JSON.stringify({ type: "Finalize" }));
          }
        } else {
          deepgramWs.send(data);
        }
      }
    });

    clientWs.on("close", () => {
      console.log("[Deepgram Proxy] Client disconnected");
      isClosing = true;
      if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
        deepgramWs.close();
      }
    });

    clientWs.on("error", (error: any) => {
      console.error("[Deepgram Proxy] Client error:", error.message);
      isClosing = true;
      if (deepgramWs) {
        deepgramWs.close();
      }
    });
  }

  registerLocationRoutes(app);

  return httpServer;
}

import type { Express, Request, Response } from "express";
import { z } from "zod";
import OpenAI from "openai";
import {
  type OmiMemoryTriggerPayload,
  type OmiTranscriptPayload,
  type OmiExtractedPerson,
  type OmiExtractedTopic,
  type OmiExtractedActionItem,
  type OmiExtractedInsight,
  type OmiQueryRequest,
  type OmiQueryResponse,
  omiQueryRequestSchema,
} from "@shared/schema";
import {
  createOmiWebhookLog,
  updateOmiWebhookLog,
  getOmiWebhookLogs,
  getOmiWebhookLog,
  createMemoryNote,
  getAllMemoryNotes,
  createTask,
  getAllContacts,
  searchContacts,
  createContact,
  updateContact,
  createContactNote,
} from "./db";

const openai = new OpenAI();

interface ExtractionResult {
  people: OmiExtractedPerson[];
  topics: OmiExtractedTopic[];
  actionItems: OmiExtractedActionItem[];
  insights: OmiExtractedInsight[];
  emotions: string;
}

const extractionSchema = z.object({
  people: z.array(z.object({
    name: z.string(),
    context: z.string(),
    relationship: z.string().optional(),
    sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
  })).default([]),
  topics: z.array(z.object({
    topic: z.string(),
    relevance: z.enum(["high", "medium", "low"]),
    category: z.string().optional(),
  })).default([]),
  actionItems: z.array(z.object({
    task: z.string(),
    owner: z.string().optional(),
    dueDate: z.string().optional(),
    priority: z.enum(["high", "medium", "low"]),
    context: z.string(),
  })).default([]),
  insights: z.array(z.object({
    insight: z.string(),
    type: z.enum(["decision", "idea", "preference", "goal", "concern", "fact"]),
    confidence: z.enum(["high", "medium", "low"]),
  })).default([]),
  emotions: z.string().default("neutral"),
});

function safeJsonStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch (error) {
    console.error("[Omi] JSON stringify error:", error);
    return "[]";
  }
}

async function extractFromTranscript(transcript: string): Promise<ExtractionResult> {
  const systemPrompt = `You are an AI assistant that extracts structured information from conversation transcripts.
  
Extract the following from the transcript:
1. PEOPLE: Names mentioned, how they were discussed, inferred relationships
2. TOPICS: Key subjects discussed with relevance (high/medium/low)
3. ACTION ITEMS: Tasks, commitments, things to do with priority levels
4. INSIGHTS: Important facts, decisions, preferences, goals, or concerns learned

Return a JSON object with this exact structure:
{
  "people": [{"name": "string", "context": "how mentioned", "relationship": "friend/family/colleague/etc", "sentiment": "positive/neutral/negative"}],
  "topics": [{"topic": "string", "relevance": "high/medium/low", "category": "work/personal/health/etc"}],
  "actionItems": [{"task": "string", "owner": "who should do it", "dueDate": "if mentioned", "priority": "high/medium/low", "context": "why"}],
  "insights": [{"insight": "string", "type": "decision/idea/preference/goal/concern/fact", "confidence": "high/medium/low"}],
  "emotions": "brief emotional tone/mood summary"
}

Be thorough but only include items that are clearly present in the transcript.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Extract information from this transcript:\n\n${transcript}` }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const rawParsed = JSON.parse(content);
    const validated = extractionSchema.safeParse(rawParsed);
    
    if (!validated.success) {
      console.error("[Omi] Extraction validation failed:", validated.error.format());
      throw new Error(`Extraction validation failed: ${validated.error.errors.map(e => e.message).join(", ")}`);
    }

    return validated.data;
  } catch (error) {
    console.error("[Omi] Error extracting from transcript:", error);
    throw error;
  }
}

async function linkPersonToContact(person: OmiExtractedPerson, memoryTitle: string): Promise<string | null> {
  if (!person.name || person.name.length < 2) return null;

  try {
    const searchResults = searchContacts(person.name);
    
    if (searchResults.length > 0) {
      const existingContact = searchResults[0];
      
      await createContactNote({
        contactId: existingContact.id,
        content: person.context,
        noteType: "observation",
        createdBy: "zeke",
      });
      
      console.log(`[Omi] Linked "${person.name}" to existing contact ${existingContact.id}`);
      return existingContact.id;
    } else {
      const nameParts = person.name.split(" ");
      const firstName = nameParts[0] || person.name;
      const lastName = nameParts.slice(1).join(" ") || "";
      
      const newContact = createContact({
        firstName,
        lastName,
        phoneNumber: `unknown-${Date.now()}`,
        relationship: person.relationship || "",
        notes: `First mentioned in: ${memoryTitle}. Context: ${person.context}`,
        accessLevel: "unknown",
        isAutoCreated: true,
      });
      
      console.log(`[Omi] Created new contact for "${person.name}": ${newContact.id}`);
      return newContact.id;
    }
  } catch (error) {
    console.error(`[Omi] Error linking person "${person.name}":`, error);
    return null;
  }
}

async function processMemoryWebhook(payload: OmiMemoryTriggerPayload, logId: string): Promise<void> {
  const transcript = payload.memory.transcript;
  const memoryTitle = payload.memory.structured?.title || "Untitled";
  
  if (!transcript || transcript.trim().length < 20) {
    const reason = !transcript ? "Empty transcript" : "Transcript too short (under 20 characters)";
    console.log(`[Omi] Skipping memory ${payload.memory.id}: ${reason}`);
    await updateOmiWebhookLog(logId, {
      status: "skipped",
      processedAt: new Date().toISOString(),
      errorMessage: reason,
    });
    return;
  }

  try {
    await updateOmiWebhookLog(logId, { status: "processing" });

    const extraction = await extractFromTranscript(transcript);
    
    const createdMemoryNoteIds: string[] = [];
    const createdTaskIds: string[] = [];
    const linkedContactIds: string[] = [];

    for (const insight of extraction.insights) {
      const note = await createMemoryNote({
        type: insight.type === "preference" ? "preference" : 
              insight.type === "fact" ? "fact" : "note",
        content: insight.insight,
        context: `Extracted from Omi memory: ${memoryTitle}`,
        sourceType: "lifelog",
        sourceId: payload.memory.id,
        confidenceScore: insight.confidence === "high" ? "0.9" : 
                         insight.confidence === "medium" ? "0.7" : "0.5",
      });
      createdMemoryNoteIds.push(note.id);
    }

    for (const person of extraction.people) {
      if (person.context && person.name) {
        const contactId = await linkPersonToContact(person, memoryTitle);
        if (contactId) {
          linkedContactIds.push(contactId);
        }
        
        const note = await createMemoryNote({
          type: "note",
          content: `${person.name}: ${person.context}`,
          context: `Person mentioned in Omi memory: ${memoryTitle}`,
          sourceType: "lifelog",
          sourceId: payload.memory.id,
        });
        createdMemoryNoteIds.push(note.id);
      }
    }

    for (const actionItem of extraction.actionItems) {
      const task = await createTask({
        title: actionItem.task,
        description: actionItem.context,
        priority: actionItem.priority,
        dueDate: actionItem.dueDate || null,
        category: "personal",
      });
      createdTaskIds.push(task.id);
    }

    const speakerSet = new Set(payload.segments?.map(s => s.speaker) || []);
    const durationSeconds = payload.memory.finished_at && payload.memory.started_at
      ? Math.round((new Date(payload.memory.finished_at).getTime() - new Date(payload.memory.started_at).getTime()) / 1000)
      : undefined;

    await updateOmiWebhookLog(logId, {
      status: "processed",
      processedAt: new Date().toISOString(),
      extractedPeople: safeJsonStringify(extraction.people),
      extractedTopics: safeJsonStringify(extraction.topics),
      extractedActionItems: safeJsonStringify(extraction.actionItems),
      extractedInsights: safeJsonStringify(extraction.insights),
      extractedEmotions: extraction.emotions,
      createdMemoryNoteIds: safeJsonStringify(createdMemoryNoteIds),
      createdTaskIds: safeJsonStringify(createdTaskIds),
      createdContactIds: safeJsonStringify(linkedContactIds),
      speakerCount: speakerSet.size,
      durationSeconds,
    });

    console.log(`[Omi] Processed memory ${payload.memory.id}: ${createdMemoryNoteIds.length} notes, ${createdTaskIds.length} tasks, ${linkedContactIds.length} contacts linked`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Omi] Error processing memory:", error);
    await updateOmiWebhookLog(logId, {
      status: "failed",
      errorMessage,
      processedAt: new Date().toISOString(),
    });
  }
}

async function queryZekeKnowledge(query: string, limit: number = 10): Promise<OmiQueryResponse> {
  const memories = await getAllMemoryNotes();
  const contacts = await getAllContacts();

  const relevantMemories = memories
    .filter(m => !m.isSuperseded)
    .slice(0, limit)
    .map(m => ({
      id: m.id,
      content: m.content,
      type: m.type,
      confidence: parseFloat(m.confidenceScore || "0.8"),
    }));

  const relatedPeople = contacts.slice(0, 5).map(c => ({
    name: `${c.firstName} ${c.lastName}`.trim(),
    context: c.relationship || c.accessLevel,
  }));

  const systemPrompt = `You are Zeke, a personal AI assistant with deep knowledge about the user.
You have access to the user's memories and contacts. Answer the query based on this context.

MEMORIES:
${relevantMemories.map(m => `- [${m.type}] ${m.content}`).join("\n")}

PEOPLE KNOWN:
${relatedPeople.map(p => `- ${p.name} (${p.context})`).join("\n")}

Answer naturally and helpfully. If you don't have enough information, say so.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query }
      ],
      temperature: 0.7,
    });

    return {
      answer: response.choices[0]?.message?.content || "I couldn't find relevant information.",
      relevantMemories,
      relatedPeople,
    };
  } catch (error) {
    console.error("[Omi] Error querying knowledge:", error);
    return {
      answer: "I encountered an error while searching my knowledge.",
      relevantMemories: [],
      relatedPeople: [],
    };
  }
}

export function registerOmiRoutes(app: Express): void {
  app.post("/api/omi/memory-trigger", async (req: Request, res: Response) => {
    try {
      const payload = req.body as OmiMemoryTriggerPayload;
      const now = new Date().toISOString();

      const log = await createOmiWebhookLog({
        triggerType: "memory_created",
        omiSessionId: payload.session_id,
        omiMemoryId: payload.memory?.id,
        rawPayload: JSON.stringify(payload),
        transcript: payload.memory?.transcript,
        status: "received",
        receivedAt: now,
      });

      processMemoryWebhook(payload, log.id).catch(err => {
        console.error("[Omi] Background processing error:", err);
      });

      res.json({ 
        success: true, 
        logId: log.id,
        message: "Memory received and queued for processing"
      });
    } catch (error) {
      console.error("[Omi] Memory trigger error:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  app.post("/api/omi/transcript", async (req: Request, res: Response) => {
    try {
      const payload = req.body as OmiTranscriptPayload;
      const now = new Date().toISOString();

      const transcriptText = payload.segments?.map(s => `${s.speaker}: ${s.text}`).join("\n") || "";

      const log = await createOmiWebhookLog({
        triggerType: "transcript_segment",
        omiSessionId: payload.session_id,
        rawPayload: JSON.stringify(payload),
        transcript: transcriptText,
        status: "received",
        receivedAt: now,
        speakerCount: new Set(payload.segments?.map(s => s.speaker) || []).size,
      });

      res.json({ 
        success: true, 
        logId: log.id,
        message: "Transcript segment received"
      });
    } catch (error) {
      console.error("[Omi] Transcript error:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  app.post("/api/omi/query", async (req: Request, res: Response) => {
    try {
      const parsed = omiQueryRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid query request" 
        });
      }

      const { query, limit } = parsed.data;
      const response = await queryZekeKnowledge(query, limit);

      res.json(response);
    } catch (error) {
      console.error("[Omi] Query error:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  app.get("/api/omi/logs", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await getOmiWebhookLogs(limit);
      res.json(logs);
    } catch (error) {
      console.error("[Omi] Get logs error:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  app.get("/api/omi/logs/:id", async (req: Request, res: Response) => {
    try {
      const log = await getOmiWebhookLog(req.params.id);
      if (!log) {
        return res.status(404).json({ 
          success: false, 
          error: "Log not found" 
        });
      }
      res.json(log);
    } catch (error) {
      console.error("[Omi] Get log error:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  console.log("[Omi] Routes registered: /api/omi/memory-trigger, /api/omi/transcript, /api/omi/query, /api/omi/logs");
}

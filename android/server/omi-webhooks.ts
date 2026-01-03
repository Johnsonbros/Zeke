import type { Express, Request, Response } from "express";
import crypto from "crypto";
import OpenAI from "openai";
import { db } from "./db";
import { userLists, listItems, transcriptSessions, devices } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { conversationBridgeService } from "./services/conversation-bridge";

const OMI_SYSTEM_DEVICE_ID = "omi-webhook-system";

async function ensureOmiDevice(): Promise<string> {
  const existing = await db
    .select()
    .from(devices)
    .where(eq(devices.id, OMI_SYSTEM_DEVICE_ID))
    .limit(1);

  if (existing.length > 0) {
    return OMI_SYSTEM_DEVICE_ID;
  }

  await db.insert(devices).values({
    id: OMI_SYSTEM_DEVICE_ID,
    name: "Omi Wearable Webhook",
    type: "omi",
    isConnected: false,
  }).onConflictDoNothing();

  console.log("[Omi Webhooks] Created system device:", OMI_SYSTEM_DEVICE_ID);
  return OMI_SYSTEM_DEVICE_ID;
}

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getOmiWebhookSecret(): string | undefined {
  return process.env.OMI_WEBHOOK_SECRET;
}

function isLocalRequest(req: Request): boolean {
  const host = req.headers.host || "";
  const forwardedHost = req.headers["x-forwarded-host"] as string || "";
  return host.includes("localhost") || host.includes("127.0.0.1") || 
         forwardedHost.includes("localhost") || forwardedHost.includes("127.0.0.1");
}

type RawBodyRequest = Request & { rawBody?: Buffer };

export function verifyOmiWebhook(req: RawBodyRequest): boolean {
  const webhookSecret = getOmiWebhookSecret();

  if (!webhookSecret) {
    if (process.env.NODE_ENV === "development" && isLocalRequest(req)) {
      console.warn("[Omi Webhooks] OMI_WEBHOOK_SECRET not configured - allowing local development request");
      return true;
    }
    console.error("[Omi Webhooks] OMI_WEBHOOK_SECRET not configured - rejecting request in production");
    return false;
  }

  const signature = req.headers["x-omi-signature"] as string;
  const rawBody = req.rawBody && Buffer.isBuffer(req.rawBody)
    ? req.rawBody
    : typeof req.body === "string"
    ? Buffer.from(req.body)
    : req.body
    ? Buffer.from(JSON.stringify(req.body))
    : null;

  if (signature) {
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody || "")
      .digest("hex");
    
    if (signature === expectedSignature) {
      console.log("[Omi Webhooks] Valid HMAC signature");
      return true;
    }
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader === `Bearer ${webhookSecret}`) {
    console.log("[Omi Webhooks] Valid Bearer token");
    return true;
  }

  const secretParam = req.query.secret as string;
  if (secretParam && secretParam === webhookSecret) {
    console.log("[Omi Webhooks] Valid query secret");
    return true;
  }

  console.warn("[Omi Webhooks] Webhook verification failed - no valid credentials");
  return false;
}

interface TranscriptSegment {
  text: string;
  speaker: string;
  speaker_id: number;
  is_user: boolean;
  start: number;
  end: number;
}

interface RealtimeTranscriptRequest {
  session_id: string;
  segments: TranscriptSegment[];
}

interface ZekeCommand {
  detected: boolean;
  action: "add_to_list" | "remove_from_list" | "set_reminder" | "query" | "none";
  listType: string | null;
  items: string[];
  query: string | null;
  responseMessage: string;
}

const DEFAULT_LIST_TYPES = ["grocery", "books", "movies", "todo", "shopping", "recipes"];

function segmentsToString(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => `${s.is_user ? "User" : s.speaker}: ${s.text}`)
    .join("\n");
}

async function detectZekeCommand(transcript: string): Promise<ZekeCommand> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `You are ZEKE, an AI assistant that listens for wake words and commands in real-time conversation transcripts.

Your task is to detect if the user is addressing you (ZEKE) and extract actionable commands.

Wake word patterns to detect:
- "Hey ZEKE" or "Hey Zeke" or "hey zeke"
- "ZEKE" followed by a command
- "Zeke, add..." or "Zeke add..."
- Any variation of addressing ZEKE directly

Commands to detect (use lowercase action values):
1. action: "add_to_list" - User wants to add items to a list
   - ALWAYS extract the listType (grocery, books, movies, todo, shopping, recipes, reading, etc.)
   - ALWAYS extract the items array with each individual item
   Examples: "add milk to my grocery list" -> listType: "grocery", items: ["milk"]
   
2. action: "remove_from_list" - User wants to remove items from a list
   - ALWAYS extract the listType and items

3. action: "set_reminder" - User wants to set a reminder

4. action: "query" - User is asking you a question

Required JSON response format:
{
  "detected": boolean,
  "action": "add_to_list" | "remove_from_list" | "set_reminder" | "query" | "none",
  "listType": string or null (MUST be extracted from the phrase, e.g., "grocery list" -> "grocery"),
  "items": string[] (array of individual items to add/remove),
  "query": string or null,
  "responseMessage": string
}

If no wake word is detected, return detected: false.
If wake word is detected but no clear command, return detected: true with action: "none".`,
        },
        {
          role: "user",
          content: `Analyze this transcript and detect if ZEKE is being addressed with a command:\n\n${transcript}`,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1024,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      return { detected: false, action: "none", listType: null, items: [], query: null, responseMessage: "" };
    }

    const parsed = JSON.parse(content);
    
    const rawAction = (parsed.action || "none").toLowerCase().replace(/_/g, "_");
    const normalizedAction = rawAction === "add_to_list" || rawAction === "addtolist" || rawAction === "add-to-list" 
      ? "add_to_list"
      : rawAction === "remove_from_list" || rawAction === "removefromlist" || rawAction === "remove-from-list"
      ? "remove_from_list"
      : rawAction === "set_reminder" || rawAction === "setreminder" || rawAction === "set-reminder"
      ? "set_reminder"
      : rawAction === "query"
      ? "query"
      : "none";
    
    return {
      detected: parsed.detected || false,
      action: normalizedAction as ZekeCommand["action"],
      listType: parsed.listType || parsed.list_type || parsed.list || null,
      items: parsed.items || [],
      query: parsed.query || null,
      responseMessage: parsed.responseMessage || parsed.response_message || "",
    };
  } catch (error) {
    console.error("[ZEKE] Error detecting command:", error);
    return { detected: false, action: "none", listType: null, items: [], query: null, responseMessage: "" };
  }
}

async function getOrCreateList(listType: string, userId: string | null = null): Promise<string> {
  const normalizedType = listType.toLowerCase().trim();
  
  const existingList = await db
    .select()
    .from(userLists)
    .where(eq(userLists.listType, normalizedType))
    .limit(1);

  if (existingList.length > 0) {
    return existingList[0].id;
  }

  const listName = normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1) + " List";
  const newList = await db
    .insert(userLists)
    .values({
      userId,
      listType: normalizedType,
      name: listName,
    })
    .returning();

  return newList[0].id;
}

async function addItemsToList(listId: string, items: string[]): Promise<string[]> {
  const addedItems: string[] = [];

  for (const item of items) {
    const trimmedItem = item.trim();
    if (!trimmedItem) continue;

    const existing = await db
      .select()
      .from(listItems)
      .where(and(eq(listItems.listId, listId), eq(listItems.content, trimmedItem)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(listItems).values({
        listId,
        content: trimmedItem,
        isCompleted: false,
      });
      addedItems.push(trimmedItem);
    }
  }

  return addedItems;
}

async function removeItemsFromList(listId: string, items: string[]): Promise<string[]> {
  const removedItems: string[] = [];

  for (const item of items) {
    const trimmedItem = item.trim().toLowerCase();
    if (!trimmedItem) continue;

    const existing = await db
      .select()
      .from(listItems)
      .where(eq(listItems.listId, listId));

    for (const existingItem of existing) {
      if (existingItem.content.toLowerCase().includes(trimmedItem)) {
        await db.delete(listItems).where(eq(listItems.id, existingItem.id));
        removedItems.push(existingItem.content);
      }
    }
  }

  return removedItems;
}

async function handleZekeCommand(command: ZekeCommand): Promise<string> {
  if (!command.detected) {
    return "";
  }

  switch (command.action) {
    case "add_to_list": {
      if (!command.listType || command.items.length === 0) {
        return "I heard you, but I didn't catch what to add or which list. Could you say that again?";
      }

      const listId = await getOrCreateList(command.listType);
      const addedItems = await addItemsToList(listId, command.items);

      if (addedItems.length === 0) {
        return `Those items are already on your ${command.listType} list.`;
      }

      const itemsStr = addedItems.length === 1 
        ? addedItems[0] 
        : addedItems.slice(0, -1).join(", ") + " and " + addedItems[addedItems.length - 1];

      return `Got it! I added ${itemsStr} to your ${command.listType} list.`;
    }

    case "remove_from_list": {
      if (!command.listType || command.items.length === 0) {
        return "I heard you, but I didn't catch what to remove or which list. Could you say that again?";
      }

      const listId = await getOrCreateList(command.listType);
      const removedItems = await removeItemsFromList(listId, command.items);

      if (removedItems.length === 0) {
        return `I couldn't find those items on your ${command.listType} list.`;
      }

      const itemsStr = removedItems.length === 1 
        ? removedItems[0] 
        : removedItems.slice(0, -1).join(", ") + " and " + removedItems[removedItems.length - 1];

      return `Done! I removed ${itemsStr} from your ${command.listType} list.`;
    }

    case "set_reminder": {
      return "Reminders are coming soon! For now, I've noted your request.";
    }

    case "query": {
      if (command.listType) {
        const list = await db
          .select()
          .from(userLists)
          .where(eq(userLists.listType, command.listType.toLowerCase()))
          .limit(1);

        if (list.length === 0) {
          return `You don't have a ${command.listType} list yet. Would you like me to create one?`;
        }

        const items = await db
          .select()
          .from(listItems)
          .where(eq(listItems.listId, list[0].id));

        if (items.length === 0) {
          return `Your ${command.listType} list is empty.`;
        }

        const itemsList = items.map((i) => i.content).join(", ");
        return `Your ${command.listType} list has ${items.length} item${items.length !== 1 ? "s" : ""}: ${itemsList}`;
      }

      return command.responseMessage || "I'm here! How can I help you?";
    }

    case "none":
    default:
      return command.responseMessage || "I'm listening! Just say 'Hey ZEKE' followed by a command.";
  }
}

const sessionTranscripts = new Map<string, TranscriptSegment[]>();

export function registerOmiWebhooks(app: Express): void {
  console.log("[Omi Webhooks] Registering Omi webhook endpoints...");

  app.post("/api/omi/transcript", async (req: Request, res: Response) => {
    try {
      if (!verifyOmiWebhook(req)) {
        return res.status(401).json({ message: "", error: "Unauthorized" });
      }

      const data = req.body as RealtimeTranscriptRequest;
      
      console.log("[Omi Transcript] Received:", {
        sessionId: data.session_id,
        segmentCount: data.segments?.length || 0,
      });

      if (!data.segments || data.segments.length === 0) {
        return res.json({ message: "" });
      }

      const sessionId = data.session_id || "default";
      const headerDeviceId = req.headers["x-device-id"] as string;
      const deviceId = headerDeviceId || await ensureOmiDevice();
      
      await conversationBridgeService.addSegments(sessionId, data.segments, deviceId);
      
      let existingSegments = sessionTranscripts.get(sessionId) || [];
      existingSegments = [...existingSegments, ...data.segments];
      
      if (existingSegments.length > 50) {
        existingSegments = existingSegments.slice(-50);
      }
      sessionTranscripts.set(sessionId, existingSegments);

      const recentSegments = existingSegments.slice(-10);
      const transcriptText = segmentsToString(recentSegments);

      console.log("[Omi Transcript] Processing:", transcriptText.substring(0, 200));

      const command = await detectZekeCommand(transcriptText);

      console.log("[Omi Transcript] Detected command:", command);

      if (command.detected) {
        const responseMessage = await handleZekeCommand(command);
        
        if (responseMessage) {
          sessionTranscripts.delete(sessionId);
          
          console.log("[Omi Transcript] Response:", responseMessage);
          return res.json({ message: responseMessage });
        }
      }

      return res.json({ message: "" });
    } catch (error) {
      console.error("[Omi Transcript] Error:", error);
      return res.status(500).json({ message: "", error: "Internal server error" });
    }
  });

  app.post("/api/omi/memory-trigger", async (req: Request, res: Response) => {
    try {
      if (!verifyOmiWebhook(req)) {
        return res.status(401).json({ message: "", error: "Unauthorized" });
      }

      console.log("[Omi Memory] Received memory trigger:", JSON.stringify(req.body).substring(0, 500));
      
      const result = await conversationBridgeService.processOmiMemoryTrigger(req.body);
      
      if (result.success) {
        console.log(`[Omi Memory] Created memory ${result.memoryId}`);
        return res.json({ 
          message: result.summary || "Memory created successfully",
          memoryId: result.memoryId 
        });
      }
      
      console.log(`[Omi Memory] Memory creation skipped: ${result.error}`);
      return res.json({ message: "" });
    } catch (error) {
      console.error("[Omi Memory] Error:", error);
      return res.status(500).json({ message: "", error: "Internal server error" });
    }
  });

  app.post("/api/omi/audio-bytes", async (req: Request, res: Response) => {
    try {
      if (!verifyOmiWebhook(req)) {
        return res.status(401).json({ message: "", error: "Unauthorized" });
      }

      const audioData = req.body;
      console.log("[Omi Audio] Received audio bytes:", typeof audioData === "object" ? JSON.stringify(audioData).length : "raw data");
      
      return res.json({ message: "" });
    } catch (error) {
      console.error("[Omi Audio] Error:", error);
      return res.status(500).json({ message: "", error: "Internal server error" });
    }
  });

  app.post("/api/omi/day-summary", async (req: Request, res: Response) => {
    try {
      if (!verifyOmiWebhook(req)) {
        return res.status(401).json({ message: "", error: "Unauthorized" });
      }

      console.log("[Omi Day Summary] Received:", JSON.stringify(req.body).substring(0, 500));
      
      await conversationBridgeService.processDaySummary(req.body);
      
      return res.json({ message: "Day summary processed" });
    } catch (error) {
      console.error("[Omi Day Summary] Error:", error);
      return res.status(500).json({ message: "", error: "Internal server error" });
    }
  });

  app.get("/api/lists", async (_req: Request, res: Response) => {
    try {
      const lists = await db.select().from(userLists);
      
      const listsWithItems = await Promise.all(
        lists.map(async (list) => {
          const items = await db
            .select()
            .from(listItems)
            .where(eq(listItems.listId, list.id));
          return { ...list, items };
        })
      );

      return res.json(listsWithItems);
    } catch (error) {
      console.error("[Lists API] Error:", error);
      return res.status(500).json({ error: "Failed to fetch lists" });
    }
  });

  app.get("/api/lists/:type", async (req: Request, res: Response) => {
    try {
      const { type } = req.params;
      
      const list = await db
        .select()
        .from(userLists)
        .where(eq(userLists.listType, type.toLowerCase()))
        .limit(1);

      if (list.length === 0) {
        return res.json({ list: null, items: [] });
      }

      const items = await db
        .select()
        .from(listItems)
        .where(eq(listItems.listId, list[0].id));

      return res.json({ list: list[0], items });
    } catch (error) {
      console.error("[Lists API] Error:", error);
      return res.status(500).json({ error: "Failed to fetch list" });
    }
  });

  app.post("/api/lists/:type/items", async (req: Request, res: Response) => {
    try {
      const { type } = req.params;
      const { content } = req.body;

      if (!content) {
        return res.status(400).json({ error: "Content is required" });
      }

      const listId = await getOrCreateList(type);
      
      const newItem = await db
        .insert(listItems)
        .values({
          listId,
          content,
          isCompleted: false,
        })
        .returning();

      return res.json(newItem[0]);
    } catch (error) {
      console.error("[Lists API] Error:", error);
      return res.status(500).json({ error: "Failed to add item" });
    }
  });

  app.patch("/api/lists/items/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { isCompleted, content } = req.body;

      const updates: Partial<{ isCompleted: boolean; content: string }> = {};
      if (typeof isCompleted === "boolean") updates.isCompleted = isCompleted;
      if (content) updates.content = content;

      const updated = await db
        .update(listItems)
        .set(updates)
        .where(eq(listItems.id, id))
        .returning();

      if (updated.length === 0) {
        return res.status(404).json({ error: "Item not found" });
      }

      return res.json(updated[0]);
    } catch (error) {
      console.error("[Lists API] Error:", error);
      return res.status(500).json({ error: "Failed to update item" });
    }
  });

  app.delete("/api/lists/items/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const deleted = await db
        .delete(listItems)
        .where(eq(listItems.id, id))
        .returning();

      if (deleted.length === 0) {
        return res.status(404).json({ error: "Item not found" });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("[Lists API] Error:", error);
      return res.status(500).json({ error: "Failed to delete item" });
    }
  });

  console.log("[Omi Webhooks] Endpoints registered:");
  console.log("  POST /api/omi/transcript - Real-time transcript webhook");
  console.log("  POST /api/omi/memory-trigger - Conversation events webhook");
  console.log("  POST /api/omi/audio-bytes - Audio bytes webhook");
  console.log("  POST /api/omi/day-summary - Day summary webhook");
  console.log("  GET /api/lists - Get all lists");
  console.log("  GET /api/lists/:type - Get specific list");
  console.log("  POST /api/lists/:type/items - Add item to list");
  console.log("  PATCH /api/lists/items/:id - Update item");
  console.log("  DELETE /api/lists/items/:id - Delete item");
}

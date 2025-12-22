/**
 * Omi Action Item Extractor
 * 
 * Processes memories to automatically extract action items and commitments.
 * Features:
 * - AI-powered detection of commitments like "I'll send that by Friday"
 * - Automatic task creation with source tracking
 * - Speaker/contact linking
 * - Deduplication using (memoryId, sourceOffsetMs) keys
 * 
 * Supports batch processing via OpenAI Batch API for 50% cost savings.
 */

import OpenAI from "openai";
import {
  createMemoryActionItem,
  checkMemoryActionItemExists,
  updateMemoryActionItem,
  createTask,
  getAllContacts,
  createBatchJob,
} from "../db";
import type { InsertLifelogActionItem, InsertTask, Contact } from "@shared/schema";
import type { OmiMemoryData } from "../omi";
import {
  buildBatchRequestLine,
  submitBatchJob,
  generateIdempotencyKey,
} from "../services/batchService";

let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured");
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

interface ExtractedActionItem {
  task: string;
  assignee?: string;
  dueDate?: string;
  priority: "high" | "medium" | "low";
  sourceQuote: string;
  startOffsetMs?: number;
}

interface ExtractionResult {
  actionItems: ExtractedActionItem[];
}

/**
 * Extract transcript content from a memory for analysis
 */
function extractTranscriptText(memory: OmiMemoryData): { text: string; speakers: string[] } {
  const textParts: string[] = [];
  const speakers = new Set<string>();
  
  for (const segment of memory.transcriptSegments || []) {
    if (segment.speaker) {
      speakers.add(segment.speaker);
    }
    
    if (segment.text) {
      const speakerPrefix = segment.speaker ? `[${segment.speaker}]: ` : "";
      textParts.push(`${speakerPrefix}${segment.text}`);
    }
  }
  
  if (memory.transcript && textParts.length === 0) {
    textParts.push(memory.transcript);
  }
  
  return { text: textParts.join("\n"), speakers: Array.from(speakers) };
}

/**
 * Use AI to extract action items from transcript text
 */
async function extractActionItemsWithAI(
  transcript: string,
  speakers: string[]
): Promise<ExtractedActionItem[]> {
  if (transcript.length < 50) {
    return [];
  }
  
  const client = getOpenAIClient();
  
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert at extracting action items and commitments from conversations.
          
Analyze the transcript and identify any:
- Commitments someone made ("I'll send that by Friday")
- Tasks that were assigned ("Can you review this?")
- Follow-up items mentioned ("We need to discuss this later")
- Deadlines mentioned ("Let's do this by next week")

For each action item, extract:
- task: The action item description
- assignee: Who is responsible (use speaker name if identified, or null if unclear)
- dueDate: Any mentioned deadline (as natural language like "Friday", "next week", or null)
- priority: "high" if urgent/deadline soon, "medium" for normal tasks, "low" for nice-to-haves
- sourceQuote: The exact quote from the transcript (keep short, max 100 chars)

Return a JSON object with an "actionItems" array. Return empty array if no action items found.

Speakers in this conversation: ${speakers.join(", ") || "Unknown"}`,
        },
        {
          role: "user",
          content: transcript.substring(0, 4000),
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1000,
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      return [];
    }
    
    const result = JSON.parse(content) as ExtractionResult;
    return result.actionItems || [];
    
  } catch (error) {
    console.error("[ActionItemExtractor] AI extraction failed:", error);
    return [];
  }
}

/**
 * Find a matching contact for an assignee name
 */
function findContactByName(name: string, contacts: Contact[]): Contact | undefined {
  if (!name) return undefined;
  
  const normalizedName = name.toLowerCase().trim();
  
  const exactMatch = contacts.find(
    c => `${c.firstName} ${c.lastName}`.toLowerCase() === normalizedName ||
         c.firstName?.toLowerCase() === normalizedName ||
         c.lastName?.toLowerCase() === normalizedName
  );
  if (exactMatch) return exactMatch;
  
  const firstNameMatch = contacts.find(
    c => c.firstName?.toLowerCase() === normalizedName
  );
  if (firstNameMatch) return firstNameMatch;
  
  return undefined;
}

/**
 * Create a task from an extracted action item
 */
async function createTaskFromActionItem(
  actionItem: InsertLifelogActionItem,
  contact?: Contact
): Promise<string | undefined> {
  try {
    const task = createTask({
      title: actionItem.content,
      description: actionItem.sourceQuote 
        ? `Extracted from conversation: "${actionItem.sourceQuote}"`
        : "Extracted from Omi conversation",
      priority: actionItem.priority || "medium",
      category: "personal",
      status: "pending",
      contactId: contact?.id,
    } as InsertTask);
    
    return task.id;
  } catch (error) {
    console.error("[ActionItemExtractor] Failed to create task:", error);
    return undefined;
  }
}

/**
 * Process a single memory to extract action items
 * Returns simplified result for real-time processing
 */
export async function processMemoryForActionItems(
  memory: OmiMemoryData,
  autoCreateTasks: boolean = true
): Promise<{
  extracted: number;
  tasksCreated: number;
  duplicates: number;
}> {
  const { text, speakers } = extractTranscriptText(memory);
  
  if (text.length < 50) {
    return { extracted: 0, tasksCreated: 0, duplicates: 0 };
  }
  
  const extractedItems = await extractActionItemsWithAI(text, speakers);
  
  if (extractedItems.length === 0) {
    return { extracted: 0, tasksCreated: 0, duplicates: 0 };
  }
  
  const contacts = getAllContacts();
  const now = new Date().toISOString();
  let created = 0;
  let duplicates = 0;
  
  for (const item of extractedItems) {
    const offsetMs = item.startOffsetMs || 0;
    
    if (checkMemoryActionItemExists(memory.id, offsetMs)) {
      duplicates++;
      continue;
    }
    
    const contact = item.assignee ? findContactByName(item.assignee, contacts) : undefined;
    
    const actionItemData: InsertLifelogActionItem = {
      lifelogId: memory.id,
      content: item.task,
      assignee: item.assignee || null,
      dueDate: item.dueDate || null,
      priority: item.priority,
      status: "pending",
      sourceQuote: item.sourceQuote?.substring(0, 200),
      sourceOffsetMs: offsetMs,
      linkedContactId: contact?.id || null,
      processedAt: now,
    };
    
    const savedItem = createMemoryActionItem(actionItemData);
    
    if (autoCreateTasks) {
      const taskId = await createTaskFromActionItem(actionItemData, contact);
      if (taskId) {
        updateMemoryActionItem(savedItem.id, {
          status: "created_task",
          linkedTaskId: taskId,
        });
        created++;
      }
    }
  }
  
  console.log(`[ActionItemExtractor] Processed ${memory.id}: ${extractedItems.length} extracted, ${created} tasks created, ${duplicates} duplicates skipped`);
  
  return {
    extracted: extractedItems.length,
    tasksCreated: created,
    duplicates,
  };
}

/**
 * Process multiple memories for action items
 */
export async function processMemoriesForActionItems(
  memories: OmiMemoryData[],
  autoCreateTasks: boolean = true
): Promise<{
  totalExtracted: number;
  totalCreated: number;
  totalDuplicates: number;
  processedCount: number;
}> {
  let totalExtracted = 0;
  let totalCreated = 0;
  let totalDuplicates = 0;
  
  for (const memory of memories) {
    const result = await processMemoryForActionItems(memory, autoCreateTasks);
    totalExtracted += result.extracted;
    totalCreated += result.tasksCreated;
    totalDuplicates += result.duplicates;
  }
  
  return {
    totalExtracted,
    totalCreated,
    totalDuplicates,
    processedCount: memories.length,
  };
}

// ============================================
// BATCH PROCESSING FOR 50% COST SAVINGS
// ============================================

const ACTION_ITEM_SYSTEM_PROMPT = `You are an expert at extracting action items and commitments from conversations.
          
Analyze the transcript and identify any:
- Commitments someone made ("I'll send that by Friday")
- Tasks that were assigned ("Can you review this?")
- Follow-up items mentioned ("We need to discuss this later")
- Deadlines mentioned ("Let's do this by next week")

For each action item, extract:
- task: The action item description
- assignee: Who is responsible (use speaker name if identified, or null if unclear)
- dueDate: Any mentioned deadline (as natural language like "Friday", "next week", or null)
- priority: "high" if urgent/deadline soon, "medium" for normal tasks, "low" for nice-to-haves
- sourceQuote: The exact quote from the transcript (keep short, max 100 chars)

Return a JSON object with an "actionItems" array. Return empty array if no action items found.`;

/**
 * Queue action item extractions as batch job for nightly processing
 * Called by the batch orchestrator at 3 AM
 */
export async function queueOmiActionItemsBatch(): Promise<string | null> {
  // Import dynamically to avoid circular deps
  const { getRecentMemories } = await import("../omi");
  
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const windowStart = yesterday.toISOString().split("T")[0];
  const windowEnd = now.toISOString().split("T")[0];
  
  console.log(`[OmiActionItems] Preparing batch job for ${windowStart} to ${windowEnd}...`);
  
  // Get recent memories from last 24 hours
  const memories = await getRecentMemories(24, 100);
  
  // Filter for memories with substantial content that haven't been processed
  const candidates: Array<{ memory: OmiMemoryData; text: string; speakers: string[] }> = [];
  
  for (const memory of memories) {
    const { text, speakers } = extractTranscriptText(memory);
    
    // Skip if too short
    if (text.length < 50) continue;
    
    // Skip if already fully processed (has action items)
    if (checkMemoryActionItemExists(memory.id, 0)) continue;
    
    candidates.push({ memory, text, speakers });
  }
  
  if (candidates.length === 0) {
    console.log("[OmiActionItems] No candidates to process");
    return null;
  }
  
  console.log(`[OmiActionItems] Found ${candidates.length} candidates for batch processing`);
  
  // Create batch job record
  const idempotencyKey = generateIdempotencyKey("OMI_ACTION_ITEMS", windowStart, windowEnd);
  const jobId = crypto.randomUUID();
  
  createBatchJob({
    id: jobId,
    type: "OMI_ACTION_ITEMS",
    idempotencyKey,
    windowStart,
    windowEnd,
    itemCount: candidates.length,
  });
  
  // Build batch request lines
  const lines: string[] = [];
  for (const candidate of candidates) {
    const speakersInfo = candidate.speakers.length > 0 
      ? `Speakers in this conversation: ${candidate.speakers.join(", ")}`
      : "Speakers: Unknown";
    
    const userContent = `${speakersInfo}\n\nTranscript:\n${candidate.text.substring(0, 4000)}`;
    
    const line = buildBatchRequestLine(
      `OMI_ACTION_ITEM:${candidate.memory.id}`,
      ACTION_ITEM_SYSTEM_PROMPT,
      userContent,
      "OMI_ACTION_ITEMS"
    );
    lines.push(line);
  }
  
  // Submit batch job
  const jsonlContent = lines.join("\n");
  await submitBatchJob(jobId, jsonlContent);
  
  console.log(`[OmiActionItems] Submitted batch job ${jobId} with ${candidates.length} candidates`);
  return jobId;
}

/**
 * Process completed batch results and create action item records
 */
export async function processOmiActionItemsBatchResult(
  memoryId: string,
  resultJson: string,
  autoCreateTasks: boolean = true
): Promise<void> {
  try {
    const result = JSON.parse(resultJson) as { actionItems: ExtractedActionItem[] };
    const actionItems = result.actionItems || [];
    
    if (actionItems.length === 0) {
      console.log(`[OmiActionItems] No action items found for ${memoryId}`);
      return;
    }
    
    const contacts = getAllContacts();
    const now = new Date().toISOString();
    let created = 0;
    let duplicates = 0;
    
    for (const item of actionItems) {
      const offsetMs = item.startOffsetMs || 0;
      
      // Skip duplicates
      if (checkMemoryActionItemExists(memoryId, offsetMs)) {
        duplicates++;
        continue;
      }
      
      const contact = item.assignee ? findContactByName(item.assignee, contacts) : undefined;
      
      const actionItemData: InsertLifelogActionItem = {
        lifelogId: memoryId,
        content: item.task,
        assignee: item.assignee || null,
        dueDate: item.dueDate || null,
        priority: item.priority,
        status: "pending",
        sourceQuote: item.sourceQuote?.substring(0, 200),
        sourceOffsetMs: offsetMs,
        linkedContactId: contact?.id || null,
        processedAt: now,
      };
      
      const savedItem = createMemoryActionItem(actionItemData);
      
      if (autoCreateTasks) {
        const taskId = await createTaskFromActionItem(actionItemData, contact);
        if (taskId) {
          updateMemoryActionItem(savedItem.id, {
            status: "created_task",
            linkedTaskId: taskId,
          });
          created++;
        }
      }
    }
    
    console.log(`[OmiActionItems] Batch result for ${memoryId}: ${actionItems.length} extracted, ${created} tasks created, ${duplicates} duplicates`);
    
  } catch (error) {
    console.error(`[OmiActionItems] Failed to process batch result for ${memoryId}:`, error);
  }
}

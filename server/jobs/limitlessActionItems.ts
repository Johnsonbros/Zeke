/**
 * Limitless Action Item Extractor
 * 
 * Processes lifelogs to automatically extract action items and commitments.
 * Features:
 * - AI-powered detection of commitments like "I'll send that by Friday"
 * - Automatic task creation with source tracking
 * - Speaker/contact linking
 * - Deduplication using (lifelogId, sourceOffsetMs) keys
 */

import OpenAI from "openai";
import {
  createLifelogActionItem,
  checkActionItemExists,
  updateLifelogActionItem,
  createTask,
  getAllContacts,
} from "../db";
import type { InsertLifelogActionItem, InsertTask, Contact } from "@shared/schema";
import type { Lifelog, ContentNode } from "../limitless";

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
 * Extract transcript content from a lifelog for analysis
 */
function extractTranscriptText(lifelog: Lifelog): { text: string; speakers: string[] } {
  const textParts: string[] = [];
  const speakers = new Set<string>();
  
  function processNode(node: ContentNode) {
    if (node.speakerName) {
      speakers.add(node.speakerName);
    }
    
    if (node.content && (node.type === "blockquote" || node.type === "paragraph")) {
      const speakerPrefix = node.speakerName ? `[${node.speakerName}]: ` : "";
      textParts.push(`${speakerPrefix}${node.content}`);
    }
    
    if (node.children) {
      for (const child of node.children) {
        processNode(child);
      }
    }
  }
  
  for (const content of lifelog.contents || []) {
    processNode(content);
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
          content: transcript.substring(0, 4000), // Limit to avoid token limits
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
  
  // Exact match
  const exactMatch = contacts.find(
    c => c.name.toLowerCase() === normalizedName ||
         c.firstName?.toLowerCase() === normalizedName ||
         c.lastName?.toLowerCase() === normalizedName
  );
  if (exactMatch) return exactMatch;
  
  // Fuzzy match - first name match
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
        : "Extracted from Limitless conversation",
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
 * Process a single lifelog to extract action items
 * Returns simplified result for real-time processing
 */
export async function processLifelogForActionItems(
  lifelog: Lifelog,
  autoCreateTasks: boolean = true
): Promise<{
  extracted: number;
  tasksCreated: number;
  duplicates: number;
}> {
  const { text, speakers } = extractTranscriptText(lifelog);
  
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
    
    // Check for duplicates
    if (checkActionItemExists(lifelog.id, offsetMs)) {
      duplicates++;
      continue;
    }
    
    // Find matching contact
    const contact = item.assignee ? findContactByName(item.assignee, contacts) : undefined;
    
    // Create the action item record
    const actionItemData: InsertLifelogActionItem = {
      lifelogId: lifelog.id,
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
    
    const savedItem = createLifelogActionItem(actionItemData);
    
    // Auto-create task if enabled
    if (autoCreateTasks) {
      const taskId = await createTaskFromActionItem(actionItemData, contact);
      if (taskId) {
        updateLifelogActionItem(savedItem.id, {
          status: "created_task",
          linkedTaskId: taskId,
        });
        created++;
      }
    }
  }
  
  console.log(`[ActionItemExtractor] Processed ${lifelog.id}: ${extractedItems.length} extracted, ${created} tasks created, ${duplicates} duplicates skipped`);
  
  return {
    extracted: extractedItems.length,
    tasksCreated: created,
    duplicates,
  };
}

/**
 * Process multiple lifelogs for action items
 */
export async function processLifelogsForActionItems(
  lifelogs: Lifelog[],
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
  
  for (const lifelog of lifelogs) {
    const result = await processLifelogForActionItems(lifelog, autoCreateTasks);
    totalExtracted += result.extracted;
    totalCreated += result.created;
    totalDuplicates += result.duplicates;
  }
  
  return {
    totalExtracted,
    totalCreated,
    totalDuplicates,
    processedCount: lifelogs.length,
  };
}

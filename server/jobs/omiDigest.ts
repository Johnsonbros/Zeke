/**
 * Omi Daily Digest Job
 * 
 * Generates an evening digest SMS summarizing the day's wearable data.
 * Runs as part of nightly batch processing at 3 AM for 50% cost savings.
 * 
 * The digest includes:
 * - Key conversations and meetings
 * - Action items committed to
 * - People interacted with
 * - Noteworthy insights from the day
 */

import {
  createBatchJob,
  getMeetingsByDate,
} from "../db";
import {
  buildBatchRequestLine,
  submitBatchJob,
  generateIdempotencyKey,
} from "../services/batchService";

export interface DigestResult {
  greeting: string;
  summary: string;
  highlights: string[];
  actionReminders: string[];
}

// In-memory cache for daily digests (similar to morning briefing pattern)
const digestCache = new Map<string, DigestResult>();

const DIGEST_SYSTEM_PROMPT = `You are ZEKE, Nate's personal AI assistant. Generate a brief evening digest summarizing his day based on wearable data.

The digest should be:
- Conversational and personal (you know Nate well)
- Brief but comprehensive (2-4 short paragraphs)
- Highlight key moments, decisions, and commitments
- Mention notable people he interacted with
- Note any follow-ups or action items

Return JSON with:
- greeting: Brief evening greeting (1 sentence)
- summary: Main digest content (2-3 paragraphs)
- highlights: Array of 3-5 key bullet points
- actionReminders: Array of commitments/follow-ups to remember`;

/**
 * Queue daily digest as batch job for nightly processing
 * Called by the batch orchestrator at 3 AM
 */
export async function queueOmiDigestBatch(): Promise<string | null> {
  // Import dynamically to avoid circular deps
  const { getRecentMemories } = await import("../omi");
  
  // Digest is for "yesterday" (the day that just ended)
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const digestDate = yesterday.toISOString().split("T")[0];
  
  console.log(`[OmiDigest] Preparing daily digest for ${digestDate}...`);
  
  // Check if digest already exists in cache
  if (digestCache.has(digestDate)) {
    console.log(`[OmiDigest] Digest for ${digestDate} already exists, skipping`);
    return null;
  }
  
  // Gather the day's data
  const memories = await getRecentMemories(24, 50);
  const meetings = getMeetingsByDate(digestDate);
  
  if (memories.length === 0) {
    console.log("[OmiDigest] No memories to digest");
    return null;
  }
  
  // Build context for digest
  const memoryContext: string[] = [];
  for (const memory of memories) {
    const title = memory.structured?.title || "Untitled";
    const overview = memory.structured?.overview || "";
    const time = new Date(memory.startedAt).toLocaleTimeString("en-US", { 
      hour: "numeric", 
      minute: "2-digit" 
    });
    memoryContext.push(`[${time}] ${title}: ${overview.substring(0, 200)}`);
  }
  
  const meetingContext: string[] = [];
  for (const meeting of meetings) {
    const participants = JSON.parse(meeting.participants || "[]");
    const participantNames = participants.map((p: any) => p.name).join(", ");
    meetingContext.push(`- ${meeting.title} (${meeting.durationMinutes} min with ${participantNames})`);
  }
  
  const userContent = `Date: ${digestDate}

## Today's Conversations (${memories.length} total)
${memoryContext.join("\n")}

## Meetings Detected (${meetings.length} total)
${meetingContext.length > 0 ? meetingContext.join("\n") : "No formal meetings detected"}

Generate an evening digest for Nate summarizing his day.`;
  
  // Create batch job record
  const idempotencyKey = generateIdempotencyKey("OMI_DIGEST", digestDate, digestDate);
  const jobId = crypto.randomUUID();
  
  createBatchJob({
    id: jobId,
    type: "OMI_DIGEST",
    idempotencyKey,
    windowStart: digestDate,
    windowEnd: digestDate,
    itemCount: 1,
  });
  
  // Build batch request
  const line = buildBatchRequestLine(
    `OMI_DIGEST_REPORT:${digestDate}`,
    DIGEST_SYSTEM_PROMPT,
    userContent,
    "OMI_DIGEST"
  );
  
  // Submit batch job
  await submitBatchJob(jobId, line);
  
  console.log(`[OmiDigest] Submitted batch job ${jobId} for ${digestDate}`);
  return jobId;
}

/**
 * Process completed batch result and cache digest
 */
export async function processOmiDigestBatchResult(
  digestDate: string,
  resultJson: string
): Promise<boolean> {
  try {
    const result = JSON.parse(resultJson) as DigestResult;
    
    // Check if already processed
    if (digestCache.has(digestDate)) {
      console.log(`[OmiDigest] Digest for ${digestDate} already exists, skipping`);
      return false;
    }
    
    // Cache the digest
    digestCache.set(digestDate, {
      greeting: result.greeting || "",
      summary: result.summary || "",
      highlights: result.highlights || [],
      actionReminders: result.actionReminders || [],
    });
    
    console.log(`[OmiDigest] Cached digest for ${digestDate}`);
    return true;
    
  } catch (error) {
    console.error(`[OmiDigest] Failed to process batch result for ${digestDate}:`, error);
    return false;
  }
}

/**
 * Get today's digest for SMS delivery
 */
export function getTodaysDigest(): DigestResult | null {
  const today = new Date().toISOString().split("T")[0];
  return digestCache.get(today) || null;
}

/**
 * Get digest for a specific date
 */
export function getDigestForDate(date: string): DigestResult | null {
  return digestCache.get(date) || null;
}

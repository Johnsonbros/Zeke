/**
 * Omi Meeting Intelligence
 * 
 * Detects multi-speaker conversations and logs them as formal meetings.
 * Features:
 * - Multi-speaker detection (2+ speakers = meeting)
 * - AI-powered meeting summary generation
 * - Topic extraction and tagging
 * - Action item extraction specific to meeting context
 * - Importance scoring based on participants and duration
 * 
 * Supports batch processing via OpenAI Batch API for 50% cost savings.
 * Batch jobs are queued at 3 AM and processed as part of nightly enrichment.
 */

import OpenAI from "openai";
import {
  createMeeting,
  getMeetingByMemoryId,
  updateMeeting,
  createBatchJob,
} from "../db";
import type { InsertMeeting, MeetingParticipant, MeetingActionItem } from "@shared/schema";
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

interface MeetingSummaryResult {
  title: string;
  summary: string;
  topics: string[];
  actionItems: MeetingActionItem[];
  isImportant: boolean;
}

/**
 * Extract speakers and their content from a memory
 */
function extractSpeakersAndContent(memory: OmiMemoryData): {
  participants: MeetingParticipant[];
  transcript: string;
  userSpoke: boolean;
} {
  const speakerMap = new Map<string, { content: string[]; isUser: boolean }>();
  const textParts: string[] = [];
  
  for (const segment of memory.transcriptSegments || []) {
    const speakerName = segment.isUser ? "You" : (segment.speaker || "Unknown");
    
    if (!speakerMap.has(speakerName)) {
      speakerMap.set(speakerName, {
        content: [],
        isUser: segment.isUser,
      });
    }
    speakerMap.get(speakerName)!.content.push(segment.text);
    textParts.push(`[${speakerName}]: ${segment.text}`);
  }
  
  const participants: MeetingParticipant[] = [];
  let userSpoke = false;
  
  for (const [name, data] of Array.from(speakerMap.entries())) {
    participants.push({
      name,
      speakerIdentifier: data.isUser ? "user" : null,
      speakingTimeEstimate: data.content.join(" ").length,
    });
    if (data.isUser) userSpoke = true;
  }
  
  return {
    participants,
    transcript: textParts.join("\n"),
    userSpoke,
  };
}

/**
 * Calculate meeting duration in minutes from memory timestamps
 */
function calculateDuration(memory: OmiMemoryData): number {
  const start = new Date(memory.startedAt).getTime();
  const end = new Date(memory.finishedAt).getTime();
  return Math.round((end - start) / (1000 * 60));
}

/**
 * Determine if a conversation qualifies as a meeting
 * Criteria:
 * - 2+ speakers
 * - Duration > 5 minutes
 * - User participated (or is listening)
 */
function qualifiesAsMeeting(
  participants: MeetingParticipant[],
  durationMinutes: number
): boolean {
  if (participants.length < 2) return false;
  if (durationMinutes < 5) return false;
  return true;
}

/**
 * Generate a meeting summary using AI
 */
async function generateMeetingSummary(
  transcript: string,
  participants: MeetingParticipant[],
  durationMinutes: number
): Promise<MeetingSummaryResult> {
  const client = getOpenAIClient();
  
  try {
    const participantNames = participants.map(p => p.name).join(", ");
    
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert meeting analyst. Analyze this conversation and provide a structured summary.

Return a JSON object with:
- title: A concise, descriptive meeting title (max 60 chars)
- summary: A 2-3 sentence summary of what was discussed
- topics: Array of 3-5 main topics discussed (short phrases)
- actionItems: Array of action items with {task, assignee (if known), dueDate (if mentioned), priority (high/medium/low)}
- isImportant: Boolean - true if the meeting discussed decisions, deadlines, or involved 3+ people

Meeting info:
- Participants: ${participantNames}
- Duration: ${durationMinutes} minutes`,
        },
        {
          role: "user",
          content: transcript.substring(0, 6000),
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1500,
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from AI");
    }
    
    const result = JSON.parse(content);
    return {
      title: result.title || "Meeting",
      summary: result.summary || "",
      topics: result.topics || [],
      actionItems: (result.actionItems || []).map((item: any) => ({
        task: item.task,
        assignee: item.assignee,
        dueDate: item.dueDate,
        priority: item.priority || "medium",
      })),
      isImportant: result.isImportant || false,
    };
    
  } catch (error) {
    console.error("[MeetingIntelligence] AI summary failed:", error);
    return {
      title: "Meeting",
      summary: "",
      topics: [],
      actionItems: [],
      isImportant: false,
    };
  }
}

/**
 * Process a memory and create a meeting record if it qualifies
 */
export async function processMemoryAsMeeting(
  memory: OmiMemoryData
): Promise<{
  isMeeting: boolean;
  meetingId?: string;
  reason?: string;
}> {
  const existingMeeting = getMeetingByMemoryId(memory.id);
  if (existingMeeting) {
    return { isMeeting: true, meetingId: existingMeeting.id, reason: "already processed" };
  }
  
  const { participants, transcript, userSpoke } = extractSpeakersAndContent(memory);
  const durationMinutes = calculateDuration(memory);
  
  if (!qualifiesAsMeeting(participants, durationMinutes)) {
    return {
      isMeeting: false,
      reason: `Not a meeting: ${participants.length} speaker(s), ${durationMinutes} min`,
    };
  }
  
  const summaryResult = await generateMeetingSummary(transcript, participants, durationMinutes);
  
  const meetingData: InsertMeeting = {
    lifelogId: memory.id,
    title: summaryResult.title,
    startTime: memory.startedAt,
    endTime: memory.finishedAt,
    durationMinutes,
    participants: JSON.stringify(participants),
    topics: JSON.stringify(summaryResult.topics),
    summary: summaryResult.summary,
    actionItems: JSON.stringify(summaryResult.actionItems),
    isImportant: summaryResult.isImportant,
  };
  
  const meeting = createMeeting(meetingData);
  
  console.log(`[MeetingIntelligence] Created meeting: "${summaryResult.title}" (${durationMinutes} min, ${participants.length} participants)`);
  
  return {
    isMeeting: true,
    meetingId: meeting.id,
  };
}

/**
 * Process a single memory for meeting detection (real-time hook)
 * Returns simplified result for real-time processing
 */
export async function processMemoryForMeeting(
  memory: OmiMemoryData
): Promise<{
  created: boolean;
  meetingId?: string;
}> {
  const result = await processMemoryAsMeeting(memory);
  return {
    created: result.isMeeting && result.reason !== "already processed",
    meetingId: result.meetingId,
  };
}

/**
 * Process multiple memories for meeting detection
 */
export async function processMemoriesForMeetings(
  memories: OmiMemoryData[]
): Promise<{
  meetingsCreated: number;
  nonMeetings: number;
  alreadyProcessed: number;
}> {
  let meetingsCreated = 0;
  let nonMeetings = 0;
  let alreadyProcessed = 0;
  
  for (const memory of memories) {
    const result = await processMemoryAsMeeting(memory);
    
    if (result.isMeeting) {
      if (result.reason === "already processed") {
        alreadyProcessed++;
      } else {
        meetingsCreated++;
      }
    } else {
      nonMeetings++;
    }
  }
  
  console.log(`[MeetingIntelligence] Batch result: ${meetingsCreated} new meetings, ${nonMeetings} non-meetings, ${alreadyProcessed} already processed`);
  
  return {
    meetingsCreated,
    nonMeetings,
    alreadyProcessed,
  };
}

/**
 * Re-analyze an existing meeting to update its summary
 */
export async function reanalyzeMeeting(
  memory: OmiMemoryData,
  meetingId: string
): Promise<boolean> {
  const { participants, transcript } = extractSpeakersAndContent(memory);
  const durationMinutes = calculateDuration(memory);
  
  const summaryResult = await generateMeetingSummary(transcript, participants, durationMinutes);
  
  const updated = updateMeeting(meetingId, {
    title: summaryResult.title,
    summary: summaryResult.summary,
    topics: JSON.stringify(summaryResult.topics),
    actionItems: JSON.stringify(summaryResult.actionItems),
    isImportant: summaryResult.isImportant,
  });
  
  return Boolean(updated);
}

// ============================================
// BATCH PROCESSING FOR 50% COST SAVINGS
// ============================================

const MEETING_SUMMARY_SYSTEM_PROMPT = `You are an expert meeting analyst. Analyze this conversation and provide a structured summary.

Return a JSON object with:
- title: A concise, descriptive meeting title (max 60 chars)
- summary: A 2-3 sentence summary of what was discussed
- topics: Array of 3-5 main topics discussed (short phrases)
- actionItems: Array of action items with {task, assignee (if known), dueDate (if mentioned), priority (high/medium/low)}
- isImportant: Boolean - true if the meeting discussed decisions, deadlines, or involved 3+ people`;

/**
 * Queue meeting extractions as batch job for nightly processing
 * Called by the batch orchestrator at 3 AM
 */
export async function queueOmiMeetingsBatch(): Promise<string | null> {
  // Import dynamically to avoid circular deps
  const { getRecentMemories } = await import("../omi");
  
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const windowStart = yesterday.toISOString().split("T")[0];
  const windowEnd = now.toISOString().split("T")[0];
  
  console.log(`[OmiMeetings] Preparing batch job for ${windowStart} to ${windowEnd}...`);
  
  // Get recent memories from last 24 hours
  const memories = await getRecentMemories(24, 100);
  
  // Filter for meeting candidates that haven't been processed
  const meetingCandidates: Array<{ memory: OmiMemoryData; participants: MeetingParticipant[]; transcript: string; duration: number }> = [];
  
  for (const memory of memories) {
    // Skip if already processed
    if (getMeetingByMemoryId(memory.id)) continue;
    
    const { participants, transcript } = extractSpeakersAndContent(memory);
    const durationMinutes = calculateDuration(memory);
    
    // Check if qualifies as a meeting
    if (qualifiesAsMeeting(participants, durationMinutes)) {
      meetingCandidates.push({ memory, participants, transcript, duration: durationMinutes });
    }
  }
  
  if (meetingCandidates.length === 0) {
    console.log("[OmiMeetings] No meeting candidates to process");
    return null;
  }
  
  console.log(`[OmiMeetings] Found ${meetingCandidates.length} meeting candidates for batch processing`);
  
  // Create batch job record
  const idempotencyKey = generateIdempotencyKey("OMI_MEETINGS", windowStart, windowEnd);
  const jobId = crypto.randomUUID();
  
  createBatchJob({
    id: jobId,
    type: "OMI_MEETINGS",
    idempotencyKey,
    windowStart,
    windowEnd,
    itemCount: meetingCandidates.length,
  });
  
  // Build batch request lines
  const lines: string[] = [];
  for (const candidate of meetingCandidates) {
    const participantNames = candidate.participants.map(p => p.name).join(", ");
    const userContent = `Meeting info:\n- Participants: ${participantNames}\n- Duration: ${candidate.duration} minutes\n\nTranscript:\n${candidate.transcript.substring(0, 6000)}`;
    
    const line = buildBatchRequestLine(
      `OMI_MEETING_EXTRACTION:${candidate.memory.id}`,
      MEETING_SUMMARY_SYSTEM_PROMPT,
      userContent,
      "OMI_MEETINGS"
    );
    lines.push(line);
  }
  
  // Submit batch job
  const jsonlContent = lines.join("\n");
  await submitBatchJob(jobId, jsonlContent);
  
  console.log(`[OmiMeetings] Submitted batch job ${jobId} with ${meetingCandidates.length} meeting candidates`);
  return jobId;
}

/**
 * Process completed batch results and create meeting records
 */
export async function processOmiMeetingsBatchResult(
  memoryId: string,
  resultJson: string
): Promise<void> {
  // Import dynamically to avoid circular deps
  const { getMemory } = await import("../omi");
  
  try {
    const result = JSON.parse(resultJson) as MeetingSummaryResult;
    
    // Get the memory to extract participants and duration
    const memory = await getMemory(memoryId);
    if (!memory) {
      console.error(`[OmiMeetings] Memory ${memoryId} not found`);
      return;
    }
    
    // Check if already processed (race condition protection)
    if (getMeetingByMemoryId(memoryId)) {
      console.log(`[OmiMeetings] Meeting for ${memoryId} already exists, skipping`);
      return;
    }
    
    const { participants } = extractSpeakersAndContent(memory);
    const durationMinutes = calculateDuration(memory);
    
    const meetingData: InsertMeeting = {
      lifelogId: memory.id,
      title: result.title || "Meeting",
      startTime: memory.startedAt,
      endTime: memory.finishedAt,
      durationMinutes,
      participants: JSON.stringify(participants),
      topics: JSON.stringify(result.topics || []),
      summary: result.summary || "",
      actionItems: JSON.stringify(result.actionItems || []),
      isImportant: result.isImportant || false,
    };
    
    const meeting = createMeeting(meetingData);
    console.log(`[OmiMeetings] Created meeting from batch: "${result.title}" (${durationMinutes} min)`);
    
  } catch (error) {
    console.error(`[OmiMeetings] Failed to process batch result for ${memoryId}:`, error);
  }
}

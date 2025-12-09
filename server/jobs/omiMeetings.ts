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
 */

import OpenAI from "openai";
import {
  createMeeting,
  getMeetingByMemoryId,
  updateMeeting,
} from "../db";
import type { InsertMeeting, MeetingParticipant, MeetingActionItem } from "@shared/schema";
import type { OmiMemoryData, TranscriptSegment } from "../omi";

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
  
  for (const [name, data] of speakerMap) {
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
    memoryId: memory.id,
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

/**
 * Anticipation Engine for ZEKE
 * 
 * Analyzes recent memories, tasks, commitments, and meetings to generate
 * personalized morning briefings. Predicts what's important for the day
 * and synthesizes actionable insights.
 */

import OpenAI from "openai";
import {
  getTasksDueToday,
  getTasksDueTomorrow,
  getOverdueTasks,
  getAllTasks,
  getMeetingsInRange,
  getImportantMeetings,
  getAllContacts,
  createBatchJob,
} from "../db";
import { getRecentMemories } from "../omi";
import {
  getPendingCommitments,
  getOverdueCommitments,
  type TrackedCommitment,
} from "./specializedWorkers";
import { buildBatchRequestLine, submitBatchJob, generateIdempotencyKey } from "../services/batchService";
import { getModelConfig } from "../services/modelConfigService";
import type { BatchJobType } from "@shared/schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const BATCH_JOB_TYPE: BatchJobType = "MORNING_BRIEFING";

export interface MorningBriefing {
  id: string;
  generatedAt: string;
  briefingDate: string;
  summary: string;
  sections: BriefingSection[];
  urgentItems: UrgentItem[];
  peopleToFollowUp: PersonFollowUp[];
  estimatedReadTimeSeconds: number;
}

export interface BriefingSection {
  title: string;
  content: string;
  priority: "high" | "medium" | "low";
  itemCount: number;
}

export interface UrgentItem {
  type: "task" | "commitment" | "meeting" | "overdue";
  title: string;
  description: string;
  deadline: string | null;
}

export interface PersonFollowUp {
  name: string;
  reason: string;
  lastMentioned: string | null;
}

interface BriefingContext {
  tasksDueToday: Array<{ title: string; priority: string; category: string }>;
  tasksDueTomorrow: Array<{ title: string; priority: string; category: string }>;
  overdueTasks: Array<{ title: string; priority: string; dueDate: string | null }>;
  highPriorityTasks: Array<{ title: string; category: string }>;
  todaysMeetings: Array<{ title: string; startTime: string; participants: string }>;
  pendingCommitments: TrackedCommitment[];
  overdueCommitments: TrackedCommitment[];
  recentMemoryHighlights: Array<{ title: string; category: string; overview: string }>;
  importantMeetings: Array<{ title: string; summary: string | null }>;
}

async function gatherBriefingContext(): Promise<BriefingContext> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const [
    tasksDueToday,
    tasksDueTomorrow,
    overdueTasks,
    allTasks,
    todaysMeetings,
    importantMeetings,
    recentMemories,
  ] = await Promise.all([
    Promise.resolve(getTasksDueToday()),
    Promise.resolve(getTasksDueTomorrow()),
    Promise.resolve(getOverdueTasks()),
    Promise.resolve(getAllTasks(false)),
    Promise.resolve(getMeetingsInRange(startOfToday.toISOString(), endOfToday.toISOString())),
    Promise.resolve(getImportantMeetings()),
    getRecentMemories(24),
  ]);

  const pendingCommitments = getPendingCommitments();
  const overdueCommitments = getOverdueCommitments();

  const highPriorityTasks = allTasks
    .filter(t => t.priority === "high" && !t.completed)
    .slice(0, 5);

  const recentMemoryHighlights = recentMemories
    .filter(m => m.structured?.overview)
    .slice(0, 5)
    .map(m => ({
      title: m.structured?.title || "Untitled",
      category: m.structured?.category || "unknown",
      overview: m.structured?.overview || "",
    }));

  return {
    tasksDueToday: tasksDueToday.map(t => ({
      title: t.title,
      priority: t.priority,
      category: t.category,
    })),
    tasksDueTomorrow: tasksDueTomorrow.map(t => ({
      title: t.title,
      priority: t.priority,
      category: t.category,
    })),
    overdueTasks: overdueTasks.map(t => ({
      title: t.title,
      priority: t.priority,
      dueDate: t.dueDate,
    })),
    highPriorityTasks: highPriorityTasks.map(t => ({
      title: t.title,
      category: t.category,
    })),
    todaysMeetings: todaysMeetings.map(m => ({
      title: m.title,
      startTime: m.startTime,
      participants: m.participants,
    })),
    pendingCommitments,
    overdueCommitments,
    recentMemoryHighlights,
    importantMeetings: importantMeetings.slice(0, 3).map(m => ({
      title: m.title,
      summary: m.summary,
    })),
  };
}

function extractUrgentItems(context: BriefingContext): UrgentItem[] {
  const urgentItems: UrgentItem[] = [];

  for (const task of context.overdueTasks) {
    urgentItems.push({
      type: "overdue",
      title: task.title,
      description: `Task is overdue (was due ${task.dueDate || "earlier"})`,
      deadline: task.dueDate,
    });
  }

  for (const commitment of context.overdueCommitments) {
    urgentItems.push({
      type: "commitment",
      title: commitment.description.substring(0, 100),
      description: `Commitment made to ${commitment.madeTo || "someone"} is overdue`,
      deadline: commitment.deadline,
    });
  }

  for (const task of context.tasksDueToday.filter(t => t.priority === "high")) {
    urgentItems.push({
      type: "task",
      title: task.title,
      description: `High priority task due today`,
      deadline: new Date().toISOString().split("T")[0],
    });
  }

  for (const meeting of context.todaysMeetings.slice(0, 3)) {
    urgentItems.push({
      type: "meeting",
      title: meeting.title,
      description: `Meeting at ${new Date(meeting.startTime).toLocaleTimeString()} with ${meeting.participants || "attendees"}`,
      deadline: meeting.startTime,
    });
  }

  return urgentItems.slice(0, 10);
}

function extractPeopleToFollowUp(context: BriefingContext): PersonFollowUp[] {
  const peopleMap = new Map<string, PersonFollowUp>();

  for (const commitment of context.pendingCommitments) {
    if (commitment.madeTo && !peopleMap.has(commitment.madeTo)) {
      peopleMap.set(commitment.madeTo, {
        name: commitment.madeTo,
        reason: `You made a commitment: "${commitment.description.substring(0, 50)}..."`,
        lastMentioned: commitment.createdAt,
      });
    }
    if (commitment.madeBy && commitment.madeBy !== "user" && !peopleMap.has(commitment.madeBy)) {
      peopleMap.set(commitment.madeBy, {
        name: commitment.madeBy,
        reason: `They committed to: "${commitment.description.substring(0, 50)}..."`,
        lastMentioned: commitment.createdAt,
      });
    }
  }

  for (const meeting of context.todaysMeetings) {
    const participantList = meeting.participants ? meeting.participants.split(",").map(p => p.trim()) : [];
    for (const participant of participantList) {
      if (participant && !peopleMap.has(participant)) {
        peopleMap.set(participant, {
          name: participant,
          reason: `Meeting today: ${meeting.title}`,
          lastMentioned: meeting.startTime,
        });
      }
    }
  }

  return Array.from(peopleMap.values()).slice(0, 5);
}

function buildBriefingSections(context: BriefingContext): BriefingSection[] {
  const sections: BriefingSection[] = [];

  if (context.overdueTasks.length > 0) {
    sections.push({
      title: "Overdue Items Need Attention",
      content: context.overdueTasks.map(t => `- ${t.title}`).join("\n"),
      priority: "high",
      itemCount: context.overdueTasks.length,
    });
  }

  if (context.tasksDueToday.length > 0) {
    sections.push({
      title: "Tasks Due Today",
      content: context.tasksDueToday.map(t => `- ${t.title} (${t.priority})`).join("\n"),
      priority: "high",
      itemCount: context.tasksDueToday.length,
    });
  }

  if (context.todaysMeetings.length > 0) {
    const meetingList = context.todaysMeetings.map(m => {
      const time = new Date(m.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return `- ${time}: ${m.title}`;
    }).join("\n");
    sections.push({
      title: "Today's Schedule",
      content: meetingList,
      priority: "medium",
      itemCount: context.todaysMeetings.length,
    });
  }

  if (context.pendingCommitments.length > 0) {
    sections.push({
      title: "Open Commitments",
      content: context.pendingCommitments.slice(0, 5).map(c => `- ${c.description.substring(0, 80)}`).join("\n"),
      priority: "medium",
      itemCount: context.pendingCommitments.length,
    });
  }

  if (context.tasksDueTomorrow.length > 0) {
    sections.push({
      title: "Coming Up Tomorrow",
      content: context.tasksDueTomorrow.map(t => `- ${t.title}`).join("\n"),
      priority: "low",
      itemCount: context.tasksDueTomorrow.length,
    });
  }

  return sections;
}

async function generateNaturalBriefing(
  context: BriefingContext,
  sections: BriefingSection[],
  urgentItems: UrgentItem[]
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return generateFallbackBriefing(context, sections, urgentItems);
  }

  try {
    const contextSummary = {
      overdueTasks: context.overdueTasks.length,
      tasksDueToday: context.tasksDueToday.length,
      tasksDueTomorrow: context.tasksDueTomorrow.length,
      meetings: context.todaysMeetings.length,
      pendingCommitments: context.pendingCommitments.length,
      overdueCommitments: context.overdueCommitments.length,
      sections: sections.map(s => ({ title: s.title, itemCount: s.itemCount })),
      urgentItems: urgentItems.slice(0, 5),
      recentHighlights: context.recentMemoryHighlights.slice(0, 3),
    };

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are ZEKE, a thoughtful personal AI assistant. Generate a warm, concise morning briefing.
Keep it conversational but actionable. Be encouraging but honest about what needs attention.
Format: Start with a brief greeting, then prioritize what matters most today.
Use clear paragraphs. Maximum 3-4 short paragraphs. Be specific but concise.`,
        },
        {
          role: "user",
          content: `Generate a morning briefing based on this context:\n${JSON.stringify(contextSummary, null, 2)}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    return response.choices[0]?.message?.content || generateFallbackBriefing(context, sections, urgentItems);
  } catch (error) {
    console.error("[AnticipationEngine] GPT briefing generation failed:", error);
    return generateFallbackBriefing(context, sections, urgentItems);
  }
}

function generateFallbackBriefing(
  context: BriefingContext,
  sections: BriefingSection[],
  urgentItems: UrgentItem[]
): string {
  const lines: string[] = ["Good morning! Here's your briefing for today:"];

  if (urgentItems.length > 0) {
    lines.push("");
    lines.push(`You have ${urgentItems.length} urgent item${urgentItems.length > 1 ? "s" : ""} requiring attention.`);
    if (context.overdueTasks.length > 0) {
      lines.push(`${context.overdueTasks.length} task${context.overdueTasks.length > 1 ? "s are" : " is"} overdue.`);
    }
  }

  if (context.tasksDueToday.length > 0) {
    lines.push("");
    lines.push(`${context.tasksDueToday.length} task${context.tasksDueToday.length > 1 ? "s" : ""} due today.`);
  }

  if (context.todaysMeetings.length > 0) {
    lines.push("");
    lines.push(`${context.todaysMeetings.length} meeting${context.todaysMeetings.length > 1 ? "s" : ""} scheduled.`);
  }

  if (context.pendingCommitments.length > 0) {
    lines.push("");
    lines.push(`${context.pendingCommitments.length} open commitment${context.pendingCommitments.length > 1 ? "s" : ""} to track.`);
  }

  if (lines.length === 1) {
    lines.push("");
    lines.push("Your schedule looks clear today. A great opportunity to make progress on your goals!");
  }

  return lines.join("\n");
}

export async function generateMorningBriefing(): Promise<MorningBriefing> {
  console.log("[AnticipationEngine] Generating morning briefing...");

  const context = await gatherBriefingContext();
  const sections = buildBriefingSections(context);
  const urgentItems = extractUrgentItems(context);
  const peopleToFollowUp = extractPeopleToFollowUp(context);

  const summary = await generateNaturalBriefing(context, sections, urgentItems);

  const totalItems = sections.reduce((sum, s) => sum + s.itemCount, 0);
  const estimatedReadTimeSeconds = Math.max(30, Math.min(120, totalItems * 5 + 15));

  const briefing: MorningBriefing = {
    id: `briefing-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    briefingDate: new Date().toISOString().split("T")[0],
    summary,
    sections,
    urgentItems,
    peopleToFollowUp,
    estimatedReadTimeSeconds,
  };

  console.log(`[AnticipationEngine] Briefing generated with ${sections.length} sections, ${urgentItems.length} urgent items`);

  return briefing;
}

export function formatBriefingForSMS(briefing: MorningBriefing): string {
  const lines: string[] = [];

  lines.push("ZEKE Morning Briefing");
  lines.push("");

  if (briefing.urgentItems.length > 0) {
    const urgentCount = briefing.urgentItems.length;
    lines.push(`${urgentCount} urgent item${urgentCount > 1 ? "s" : ""}`);
  }

  for (const section of briefing.sections.slice(0, 3)) {
    if (section.priority === "high" || section.priority === "medium") {
      lines.push(`${section.title}: ${section.itemCount}`);
    }
  }

  if (briefing.peopleToFollowUp.length > 0) {
    lines.push("");
    lines.push(`Follow up: ${briefing.peopleToFollowUp.map(p => p.name).join(", ")}`);
  }

  const smsText = lines.join("\n");
  return smsText.length > 160 ? smsText.substring(0, 157) + "..." : smsText;
}

export function formatBriefingForDisplay(briefing: MorningBriefing): string {
  return briefing.summary;
}

let cachedBriefing: MorningBriefing | null = null;
let cacheTime: Date | null = null;

export async function getTodaysBriefing(forceRefresh = false): Promise<MorningBriefing> {
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  if (
    !forceRefresh &&
    cachedBriefing &&
    cacheTime &&
    cachedBriefing.briefingDate === today &&
    now.getTime() - cacheTime.getTime() < 60 * 60 * 1000
  ) {
    return cachedBriefing;
  }

  cachedBriefing = await generateMorningBriefing();
  cacheTime = now;
  return cachedBriefing;
}

export function getAnticipationEngineStatus(): {
  lastBriefingGenerated: string | null;
  briefingDate: string | null;
  cacheAge: number | null;
} {
  return {
    lastBriefingGenerated: cacheTime?.toISOString() || null,
    briefingDate: cachedBriefing?.briefingDate || null,
    cacheAge: cacheTime ? Date.now() - cacheTime.getTime() : null,
  };
}

// ============================================
// BATCH API INTEGRATION
// ============================================

const MORNING_BRIEFING_SYSTEM_PROMPT = `You are ZEKE, a thoughtful personal AI assistant. Generate a warm, concise morning briefing.
Keep it conversational but actionable. Be encouraging but honest about what needs attention.
Format: Start with a brief greeting, then prioritize what matters most today.
Use clear paragraphs. Maximum 3-4 short paragraphs. Be specific but concise.
Output valid JSON only.`;

/**
 * Queue morning briefing as a batch job for nightly processing (50% cost savings)
 * Called by the batch orchestrator at 3 AM to prepare briefing for same-day 6 AM delivery
 */
export async function queueMorningBriefingBatch(): Promise<string | null> {
  // Use current date - batch runs at 3 AM and delivery happens at 6 AM same day
  const date = new Date().toISOString().split("T")[0];
  console.log(`[AnticipationEngine] Preparing batch job for morning briefing on ${date}...`);
  
  const context = await gatherBriefingContext();
  const sections = buildBriefingSections(context);
  const urgentItems = extractUrgentItems(context);
  const peopleToFollowUp = extractPeopleToFollowUp(context);
  
  const contextSummary = {
    overdueTasks: context.overdueTasks.length,
    tasksDueToday: context.tasksDueToday.length,
    tasksDueTomorrow: context.tasksDueTomorrow.length,
    meetings: context.todaysMeetings.length,
    pendingCommitments: context.pendingCommitments.length,
    overdueCommitments: context.overdueCommitments.length,
    sections: sections.map(s => ({ title: s.title, itemCount: s.itemCount })),
    urgentItems: urgentItems.slice(0, 5),
    recentHighlights: context.recentMemoryHighlights.slice(0, 3),
    peopleToFollowUp: peopleToFollowUp.slice(0, 3),
  };
  
  const userPrompt = `Generate a morning briefing for ${date} based on this context:
${JSON.stringify(contextSummary, null, 2)}

Respond with JSON in this format:
{
  "summary": "A warm, conversational 2-3 paragraph briefing for Nate",
  "urgentItems": [{"type": "task|commitment|meeting|overdue", "title": "...", "description": "...", "deadline": "...or null"}],
  "sections": [{"title": "...", "content": "...", "priority": "high|medium|low", "itemCount": 0}],
  "peopleToFollowUp": [{"name": "...", "reason": "..."}],
  "estimatedReadTimeSeconds": 60
}`;

  const windowStart = `${date}T00:00:00.000Z`;
  const windowEnd = `${date}T23:59:59.999Z`;
  
  const idempotencyKey = generateIdempotencyKey(BATCH_JOB_TYPE, windowStart, windowEnd);
  const modelConfig = getModelConfig(BATCH_JOB_TYPE);
  
  const batchJob = createBatchJob({
    type: BATCH_JOB_TYPE,
    status: "QUEUED",
    inputWindowStart: windowStart,
    inputWindowEnd: windowEnd,
    idempotencyKey,
    inputItemCount: 1,
    model: modelConfig.model,
  });
  
  const customId = `MORNING_BRIEFING_REPORT:${date}`;
  const jsonlContent = buildBatchRequestLine(
    customId,
    MORNING_BRIEFING_SYSTEM_PROMPT,
    userPrompt,
    BATCH_JOB_TYPE
  );
  
  try {
    const openAiBatchId = await submitBatchJob(batchJob.id, jsonlContent);
    console.log(`[AnticipationEngine] Batch job submitted: ${openAiBatchId}`);
    return batchJob.id;
  } catch (error) {
    console.error("[AnticipationEngine] Failed to submit batch:", error);
    throw error;
  }
}

/**
 * Process batch results and cache morning briefing
 * Called by the artifact consumer when batch job completes
 */
export async function processMorningBriefingBatchResult(
  batchJobId: string,
  responseContent: string,
  sourceRef: string
): Promise<MorningBriefing | null> {
  console.log(`[AnticipationEngine] Processing batch result for job ${batchJobId}, date ${sourceRef}...`);
  
  try {
    const parsed = JSON.parse(responseContent);
    const date = sourceRef;
    
    const briefing: MorningBriefing = {
      id: `briefing-batch-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      briefingDate: date,
      summary: parsed.summary || "Good morning! Your schedule is ready.",
      sections: parsed.sections || [],
      urgentItems: parsed.urgentItems || [],
      peopleToFollowUp: parsed.peopleToFollowUp || [],
      estimatedReadTimeSeconds: parsed.estimatedReadTimeSeconds || 60,
    };
    
    // Cache the batch-generated briefing
    cachedBriefing = briefing;
    cacheTime = new Date();
    
    console.log(`[AnticipationEngine] Cached morning briefing for ${date}`);
    return briefing;
  } catch (error) {
    console.error("[AnticipationEngine] Error processing batch result:", error);
    throw error;
  }
}

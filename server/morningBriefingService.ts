/**
 * Morning Briefing Service for ZEKE
 * 
 * Generates and sends data-rich morning briefings triggered by wake detection.
 * Uses A/B/C question format and includes pros/cons for decisions.
 * 
 * Design Principles:
 * - Only A/B/C/1-2-3 style questions
 * - One question at a time for multi-step decisions
 * - Include pros/cons for important decisions
 * - Data-rich content (numbers, stats, specifics)
 */

import OpenAI from "openai";
import { getTwilioClient, getTwilioFromPhoneNumber, isTwilioConfigured } from "./twilioClient";
import { MASTER_ADMIN_PHONE } from "@shared/schema";
import { log } from "./logger";
import { getSleepSummaryForBriefing, getSleepStats, getTodaySleepEntry } from "./sleepTracker";
import { 
  getTasksDueToday, 
  getTasksDueTomorrow, 
  getOverdueTasks,
  getMeetingsInRange,
  getPreference,
  setPreference,
} from "./db";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface BriefingData {
  date: string;
  dayOfWeek: string;
  weather?: string;
  sleepSummary: string | null;
  sleepStats: ReturnType<typeof getSleepStats>;
  tasksDueToday: number;
  tasksDueTomorrow: number;
  overdueTasks: number;
  meetingsToday: Array<{ title: string; time: string; location?: string }>;
  urgentDecisions: Array<{ topic: string; options: string[]; proscons?: { pros: string[]; cons: string[] }[] }>;
}

async function gatherBriefingData(): Promise<BriefingData> {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' });
  
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  
  const [tasksDueToday, tasksDueTomorrow, overdueTasks, todaysMeetings] = await Promise.all([
    Promise.resolve(getTasksDueToday()),
    Promise.resolve(getTasksDueTomorrow()),
    Promise.resolve(getOverdueTasks()),
    Promise.resolve(getMeetingsInRange(startOfToday.toISOString(), endOfToday.toISOString())),
  ]);
  
  const sleepSummary = getSleepSummaryForBriefing();
  const sleepStats = getSleepStats(7);
  
  const meetingsFormatted = todaysMeetings.slice(0, 5).map(m => ({
    title: m.title,
    time: new Date(m.startTime).toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York' 
    }),
    location: m.location || undefined,
  }));
  
  return {
    date: today,
    dayOfWeek,
    sleepSummary,
    sleepStats,
    tasksDueToday: tasksDueToday.length,
    tasksDueTomorrow: tasksDueTomorrow.length,
    overdueTasks: overdueTasks.length,
    meetingsToday: meetingsFormatted,
    urgentDecisions: [],
  };
}

function formatDataRichBriefing(data: BriefingData): string {
  const lines: string[] = [];
  
  lines.push(`ZEKE Morning Briefing - ${data.dayOfWeek}`);
  lines.push("");
  
  // Sleep data
  if (data.sleepSummary) {
    lines.push("SLEEP:");
    lines.push(data.sleepSummary);
    lines.push("");
  }
  
  // Task summary with numbers
  if (data.overdueTasks > 0 || data.tasksDueToday > 0) {
    lines.push("TASKS:");
    if (data.overdueTasks > 0) {
      lines.push(`- ${data.overdueTasks} overdue (needs attention)`);
    }
    if (data.tasksDueToday > 0) {
      lines.push(`- ${data.tasksDueToday} due today`);
    }
    if (data.tasksDueTomorrow > 0) {
      lines.push(`- ${data.tasksDueTomorrow} due tomorrow`);
    }
    lines.push("");
  }
  
  // Meetings with times
  if (data.meetingsToday.length > 0) {
    lines.push("SCHEDULE:");
    for (const meeting of data.meetingsToday) {
      let meetingLine = `- ${meeting.time}: ${meeting.title}`;
      if (meeting.location) {
        meetingLine += ` (${meeting.location})`;
      }
      lines.push(meetingLine);
    }
    lines.push("");
  }
  
  // Quick decision format - always A/B/C
  lines.push("What would you like me to help with first?");
  lines.push("A) Review urgent items in detail");
  lines.push("B) Give me the full rundown");
  lines.push("C) Nothing right now");
  
  return lines.join("\n");
}

async function generateAIBriefing(data: BriefingData): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return formatDataRichBriefing(data);
  }
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are ZEKE, a personal AI assistant generating a morning briefing.

STRICT RULES:
1. Be data-rich: Include specific numbers, times, and facts
2. Questions MUST be A/B/C format or 1/2/3 format - NEVER open-ended
3. One question per message - if you need multiple decisions, pick the most important one
4. For decisions with tradeoffs, include brief pros/cons
5. Keep it concise but informative
6. No emojis
7. Use simple, direct language

Example question format:
"Should I reschedule the 2pm meeting?
A) Yes, move to tomorrow
B) No, keep as is
C) I'll handle it myself"

If there are pros/cons needed:
"Option A pros: More prep time. Cons: Client may be frustrated."

Generate a brief, data-rich morning briefing. End with ONE actionable A/B/C question if relevant.`
        },
        {
          role: "user",
          content: `Generate morning briefing from this data:
${JSON.stringify(data, null, 2)}

Keep it under 400 characters for SMS. Be specific with numbers and times.`
        }
      ],
      temperature: 0.7,
      max_tokens: 300,
    });
    
    return response.choices[0]?.message?.content || formatDataRichBriefing(data);
  } catch (error) {
    log(`[MorningBriefing] AI generation failed: ${error}`, "voice");
    return formatDataRichBriefing(data);
  }
}

async function sendSmsToMaster(message: string): Promise<boolean> {
  try {
    const configured = await isTwilioConfigured();
    if (!configured) {
      log(`[MorningBriefing] Twilio not configured`, "voice");
      return false;
    }

    const client = await getTwilioClient();
    const fromNumber = await getTwilioFromPhoneNumber();
    const toNumber = `+1${MASTER_ADMIN_PHONE}`;

    await client.messages.create({
      body: message,
      from: fromNumber,
      to: toNumber,
    });

    log(`[MorningBriefing] SMS sent to ${toNumber}`, "voice");
    return true;
  } catch (error: any) {
    log(`[MorningBriefing] Failed to send SMS: ${error.message}`, "voice");
    return false;
  }
}

/**
 * Send morning briefing triggered by wake detection
 */
export async function sendWakeTriggeredBriefing(): Promise<void> {
  log("[MorningBriefing] Generating wake-triggered morning briefing...", "voice");
  
  try {
    const data = await gatherBriefingData();
    const briefingText = await generateAIBriefing(data);
    
    await sendSmsToMaster(briefingText);
    
    // Record that briefing was sent
    setPreference({
      key: "last_morning_briefing",
      value: new Date().toISOString(),
    });
    
    log("[MorningBriefing] Wake-triggered briefing sent successfully", "voice");
  } catch (error: any) {
    log(`[MorningBriefing] Failed to generate/send briefing: ${error.message}`, "voice");
  }
}

/**
 * Generate a decision question with pros/cons
 */
export function formatDecisionQuestion(
  topic: string,
  options: Array<{ label: string; pros: string[]; cons: string[] }>
): string {
  const lines: string[] = [];
  lines.push(topic);
  lines.push("");
  
  options.forEach((opt, i) => {
    const letter = String.fromCharCode(65 + i); // A, B, C
    lines.push(`${letter}) ${opt.label}`);
    if (opt.pros.length > 0) {
      lines.push(`   Pros: ${opt.pros.join(", ")}`);
    }
    if (opt.cons.length > 0) {
      lines.push(`   Cons: ${opt.cons.join(", ")}`);
    }
  });
  
  lines.push("");
  lines.push("Reply with A, B, C, etc.");
  
  return lines.join("\n");
}

/**
 * Process a response to an A/B/C question
 */
export function parseABCResponse(response: string): {
  letter: string | null;
  number: number | null;
} {
  const letterMatch = response.match(/^[A-Za-z]$/);
  const numberMatch = response.match(/^[1-9]$/);
  
  return {
    letter: letterMatch ? letterMatch[0].toUpperCase() : null,
    number: numberMatch ? parseInt(numberMatch[0]) : null,
  };
}

/**
 * Store user preference for response style
 */
export function setResponseStylePreference(): void {
  setPreference({
    key: "zeke_response_style",
    value: JSON.stringify({
      questionFormat: "abc", // A/B/C or 1/2/3
      includeProsCons: true,
      oneQuestionAtATime: true,
      dataRich: true,
      noEmojis: true,
    }),
  });
}

/**
 * Get response style preference
 */
export function getResponseStylePreference(): {
  questionFormat: "abc" | "numeric";
  includeProsCons: boolean;
  oneQuestionAtATime: boolean;
  dataRich: boolean;
  noEmojis: boolean;
} {
  const pref = getPreference("zeke_response_style");
  if (pref?.value) {
    try {
      return JSON.parse(pref.value);
    } catch {
      // Return defaults
    }
  }
  
  return {
    questionFormat: "abc",
    includeProsCons: true,
    oneQuestionAtATime: true,
    dataRich: true,
    noEmojis: true,
  };
}

/**
 * Nightly Enrichment Batch Job
 * 
 * Runs nightly to process the day's messages into:
 * - Memory summaries (condensed knowledge)
 * - Knowledge graph edges (entity relationships)
 * - Feedback fixes (improvements for thumbs-down items)
 */

import * as cron from "node-cron";
import {
  createBatchJob,
  getBatchJobByIdempotencyKey,
  getAllConversations,
  getMessagesByConversation,
  getFeedbackEventsByConversation,
} from "../db";
import {
  generateIdempotencyKey,
  buildBatchRequestLine,
  submitBatchJob,
  isBatchEnabled,
  pollAllSubmittedJobs,
} from "../services/batchService";
import type { Message, FeedbackEvent, BatchJobType } from "@shared/schema";

export interface NightlyEnrichmentConfig {
  enabled: boolean;
  cronSchedule: string;
  pollSchedule: string;
  timezone: string;
}

let config: NightlyEnrichmentConfig = {
  enabled: true,
  cronSchedule: "0 3 * * *",
  pollSchedule: "0 */2 * * *",
  timezone: "America/New_York",
};

let scheduledTask: cron.ScheduledTask | null = null;
let pollTask: cron.ScheduledTask | null = null;
let lastRunTime: Date | null = null;
let lastRunStatus: "success" | "failed" | "pending" | null = null;
let lastRunError: string | null = null;
let lastPollTime: Date | null = null;

const JOB_TYPE: BatchJobType = "NIGHTLY_ENRICHMENT";

const MEMORY_SUMMARY_PROMPT = `You are a memory summarization agent. Analyze the conversation messages and extract:
- Key facts and decisions
- Preferences expressed
- Action items mentioned
- Important events or dates

Output STRICT JSON matching this schema:
{
  "day_key": "YYYY-MM-DD",
  "summaries": [
    {
      "source_message_ids": ["msg_id_1", "msg_id_2"],
      "summary": "Brief summary of key information",
      "tags": ["work", "family", "health", etc],
      "importance": 0.0-1.0,
      "surprise": 0.0-1.0,
      "action_items": [{"text": "action text", "due_date": "YYYY-MM-DD" or null}]
    }
  ]
}`;

const KG_EDGES_PROMPT = `You are a knowledge graph extraction agent. From the messages, identify:
- Entities (people, places, organizations, devices, projects)
- Relationships between entities
- Confidence levels based on evidence

Output STRICT JSON matching this schema:
{
  "entities": [
    {"id": "canonical_id", "name": "Display Name", "type": "PERSON|PLACE|ORG|DEVICE|PROJECT|OTHER", "aliases": ["nickname", "alt_name"]}
  ],
  "edges": [
    {"from": "entity_id", "to": "entity_id", "relation": "OWNS|USES|LIKES|WORKS_ON|RELATED_TO", "confidence": 0.0-1.0, "evidence_message_ids": ["msg_id"]}
  ]
}`;

const FEEDBACK_FIX_PROMPT = `You are a quality improvement agent. For the given negative feedback on ZEKE's responses, analyze:
- What went wrong (root cause)
- How the response should have been different
- What tools should have been used
- A test case to prevent this in the future

Output STRICT JSON matching this schema:
{
  "fixes": [
    {
      "message_id": "original_message_id",
      "better_response": "What ZEKE should have said",
      "better_tool_plan": ["step 1", "step 2"],
      "root_cause": "style|tool_miss|hallucination|missing_context|other",
      "new_eval_testcase": {
        "prompt": "User prompt that triggered failure",
        "expected": "Expected behavior",
        "tools_expected": ["tool_name_1", "tool_name_2"]
      }
    }
  ]
}`;

interface EnrichmentWindow {
  start: Date;
  end: Date;
  messages: Message[];
  negativeFeedback: FeedbackEvent[];
}

/**
 * Gather data from the last 24 hours for enrichment
 */
export async function gatherEnrichmentData(hoursBack: number = 24): Promise<EnrichmentWindow> {
  const end = new Date();
  const start = new Date(end.getTime() - hoursBack * 60 * 60 * 1000);
  
  const conversations = getAllConversations();
  const allMessages: Message[] = [];
  const allNegativeFeedback: FeedbackEvent[] = [];
  
  for (const conv of conversations) {
    const messages = getMessagesByConversation(conv.id);
    const windowMessages = messages.filter(m => {
      const msgTime = new Date(m.createdAt);
      return msgTime >= start && msgTime <= end;
    });
    allMessages.push(...windowMessages);
    
    const feedback = getFeedbackEventsByConversation(conv.id);
    const negativeFeedback = feedback.filter(f => {
      const fbTime = new Date(f.createdAt);
      return f.feedback < 0 && fbTime >= start && fbTime <= end;
    });
    allNegativeFeedback.push(...negativeFeedback);
  }
  
  return { start, end, messages: allMessages, negativeFeedback: allNegativeFeedback };
}

/**
 * Build JSONL content for the batch request
 */
export function buildEnrichmentJsonl(data: EnrichmentWindow): string {
  const lines: string[] = [];
  const dayKey = data.end.toISOString().split("T")[0];
  
  const messagesByConv = new Map<string, Message[]>();
  for (const msg of data.messages) {
    const existing = messagesByConv.get(msg.conversationId) || [];
    existing.push(msg);
    messagesByConv.set(msg.conversationId, existing);
  }
  
  for (const [convId, messages] of messagesByConv.entries()) {
    if (messages.length < 2) continue;
    
    const content = messages.map(m => `[${m.role}] ${m.content}`).join("\n");
    const userContent = `Day: ${dayKey}\nConversation ID: ${convId}\n\nMessages:\n${content}`;
    
    lines.push(buildBatchRequestLine(
      `MEMORY_SUMMARY:${convId}:${dayKey}`,
      MEMORY_SUMMARY_PROMPT,
      userContent
    ));
  }
  
  if (data.messages.length > 0) {
    const allContent = data.messages
      .slice(0, 100)
      .map(m => `[${m.conversationId}] [${m.role}] ${m.content}`)
      .join("\n");
    
    lines.push(buildBatchRequestLine(
      `KG_EDGES:${dayKey}`,
      KG_EDGES_PROMPT,
      `Extract entities and relationships from these messages:\n\n${allContent}`
    ));
  }
  
  for (const fb of data.negativeFeedback) {
    if (!fb.quotedText) continue;
    
    const userContent = `User feedback: ${fb.rawBody}\nOriginal ZEKE response: ${fb.quotedText}\nReason given: ${fb.reason || "none"}`;
    
    lines.push(buildBatchRequestLine(
      `FEEDBACK_FIX:${fb.id}`,
      FEEDBACK_FIX_PROMPT,
      userContent
    ));
  }
  
  return lines.join("\n");
}

/**
 * Create and optionally submit the nightly enrichment job
 */
export async function createNightlyEnrichmentJob(autoSubmit: boolean = true): Promise<{ jobId: string; submitted: boolean; itemCount: number }> {
  if (!isBatchEnabled()) {
    console.log("[NightlyEnrichment] Batch processing disabled, skipping");
    return { jobId: "", submitted: false, itemCount: 0 };
  }
  
  const data = await gatherEnrichmentData(24);
  
  if (data.messages.length === 0) {
    console.log("[NightlyEnrichment] No messages to process in the last 24 hours");
    return { jobId: "", submitted: false, itemCount: 0 };
  }
  
  const windowStart = data.start.toISOString();
  const windowEnd = data.end.toISOString();
  const idempotencyKey = generateIdempotencyKey(JOB_TYPE, windowStart, windowEnd);
  
  const existing = getBatchJobByIdempotencyKey(idempotencyKey);
  if (existing) {
    console.log(`[NightlyEnrichment] Job already exists with key ${idempotencyKey}, status: ${existing.status}`);
    return { jobId: existing.id, submitted: existing.status !== "QUEUED", itemCount: existing.inputItemCount || 0 };
  }
  
  const jsonl = buildEnrichmentJsonl(data);
  const itemCount = jsonl.split("\n").filter(l => l.trim()).length;
  
  if (itemCount === 0) {
    console.log("[NightlyEnrichment] No batch requests generated");
    return { jobId: "", submitted: false, itemCount: 0 };
  }
  
  const job = createBatchJob({
    type: JOB_TYPE,
    status: "QUEUED",
    inputWindowStart: windowStart,
    inputWindowEnd: windowEnd,
    idempotencyKey,
    inputItemCount: itemCount,
  });
  
  console.log(`[NightlyEnrichment] Created job ${job.id} with ${itemCount} items`);
  
  if (autoSubmit) {
    try {
      await submitBatchJob(job.id, jsonl);
      return { jobId: job.id, submitted: true, itemCount };
    } catch (error) {
      console.error("[NightlyEnrichment] Failed to submit batch:", error);
      return { jobId: job.id, submitted: false, itemCount };
    }
  }
  
  return { jobId: job.id, submitted: false, itemCount };
}

/**
 * Run the nightly enrichment job (called by scheduler)
 */
export async function runNightlyEnrichment(): Promise<void> {
  console.log("[NightlyEnrichment] Starting nightly enrichment run...");
  
  try {
    const result = await createNightlyEnrichmentJob(true);
    
    if (result.jobId) {
      console.log(`[NightlyEnrichment] Job ${result.jobId} created with ${result.itemCount} items, submitted: ${result.submitted}`);
    } else {
      console.log("[NightlyEnrichment] No job created (no data or disabled)");
    }
  } catch (error) {
    console.error("[NightlyEnrichment] Error running nightly enrichment:", error);
  }
}

/**
 * Start the nightly enrichment scheduler
 */
export function startNightlyEnrichmentScheduler(options?: Partial<NightlyEnrichmentConfig>): void {
  if (options) {
    config = { ...config, ...options };
  }

  if (scheduledTask) {
    scheduledTask.stop();
  }
  if (pollTask) {
    pollTask.stop();
  }

  if (!config.enabled) {
    console.log("[BatchFactory] Nightly enrichment scheduler is disabled");
    return;
  }

  if (!isBatchEnabled()) {
    console.log("[BatchFactory] Batch processing is disabled via BATCH_ENABLED=false");
    return;
  }

  scheduledTask = cron.schedule(
    config.cronSchedule,
    async () => {
      console.log(`[BatchFactory] Running nightly enrichment at ${new Date().toISOString()}`);
      lastRunStatus = "pending";
      lastRunError = null;
      
      try {
        await runNightlyEnrichment();
        lastRunStatus = "success";
        lastRunTime = new Date();
      } catch (error) {
        console.error("[BatchFactory] Nightly enrichment failed:", error);
        lastRunStatus = "failed";
        lastRunError = error instanceof Error ? error.message : String(error);
      }
    },
    {
      timezone: config.timezone,
    }
  );

  pollTask = cron.schedule(
    config.pollSchedule,
    async () => {
      console.log(`[BatchFactory] Polling submitted batch jobs at ${new Date().toISOString()}`);
      try {
        await pollAllSubmittedJobs();
        lastPollTime = new Date();
      } catch (error) {
        console.error("[BatchFactory] Batch polling failed:", error);
      }
    },
    {
      timezone: config.timezone,
    }
  );

  console.log(`[BatchFactory] Nightly enrichment scheduled at "${config.cronSchedule}" (${config.timezone})`);
  console.log(`[BatchFactory] Batch polling scheduled at "${config.pollSchedule}" (${config.timezone})`);
}

/**
 * Stop the nightly enrichment scheduler
 */
export function stopNightlyEnrichmentScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log("[BatchFactory] Nightly enrichment scheduler stopped");
  }
  if (pollTask) {
    pollTask.stop();
    pollTask = null;
    console.log("[BatchFactory] Batch polling scheduler stopped");
  }
}

/**
 * Get the current status of the nightly enrichment scheduler
 */
export function getNightlyEnrichmentStatus(): {
  enabled: boolean;
  cronSchedule: string;
  pollSchedule: string;
  timezone: string;
  lastRunTime: Date | null;
  lastRunStatus: string | null;
  lastRunError: string | null;
  lastPollTime: Date | null;
  batchEnabled: boolean;
} {
  return {
    enabled: config.enabled,
    cronSchedule: config.cronSchedule,
    pollSchedule: config.pollSchedule,
    timezone: config.timezone,
    lastRunTime,
    lastRunStatus,
    lastRunError,
    lastPollTime,
    batchEnabled: isBatchEnabled(),
  };
}

export default {
  gatherEnrichmentData,
  buildEnrichmentJsonl,
  createNightlyEnrichmentJob,
  runNightlyEnrichment,
  startNightlyEnrichmentScheduler,
  stopNightlyEnrichmentScheduler,
  getNightlyEnrichmentStatus,
};

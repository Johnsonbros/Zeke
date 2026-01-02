/**
 * Batch Service for OpenAI Batch API integration
 * 
 * Handles submission, polling, and parsing of batch jobs for:
 * - Memory summaries
 * - Knowledge graph extraction
 * - Feedback rehabilitation
 * 
 * Environment Variables:
 * - BATCH_ENABLED: Enable/disable batch processing (default: true)
 * - BATCH_MODEL: Model to use for batch processing (default: gpt-4o)
 * - BATCH_MAX_ITEMS_PER_RUN: Maximum items per batch run (default: 500)
 * - BATCH_RUN_HOUR: Hour to run nightly enrichment in UTC (default: 3, for 3 AM)
 */

import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import os from "os";
import { z } from "zod";
import {
  createBatchJob,
  getBatchJob,
  getBatchJobByIdempotencyKey,
  getQueuedBatchJobs,
  getSubmittedBatchJobs,
  updateBatchJobStatus,
  updateBatchJobOpenAiId,
  createBatchArtifact,
} from "../db";
import type {
  BatchJob,
  BatchJobType,
  BatchArtifactType,
  MemorySummaryPayload,
  KgEdgesPayload,
  FeedbackFixPayload,
} from "@shared/schema";
import { getModelConfig, getEffectiveModelForJob, initializeDefaultModel } from "./modelConfigService";

// Configuration from environment
const BATCH_ENABLED = process.env.BATCH_ENABLED !== "false";
const BATCH_MAX_ITEMS = parseInt(process.env.BATCH_MAX_ITEMS_PER_RUN || "500", 10);

// Initialize default model on module load
try {
  initializeDefaultModel();
} catch (e) {
  console.warn("[BatchService] Could not initialize default model config:", e);
}

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

/**
 * Generate idempotency key to prevent duplicate batch runs
 */
export function generateIdempotencyKey(type: BatchJobType, windowStart: string, windowEnd: string): string {
  return `${type}:${windowStart}:${windowEnd}:v1`;
}

/**
 * Check if batch processing is enabled
 */
export function isBatchEnabled(): boolean {
  return BATCH_ENABLED;
}

/**
 * Get the configured batch model for a specific job type
 * Falls back to global default if no job-specific config exists
 */
export function getBatchModel(jobType?: BatchJobType): string {
  if (jobType) {
    return getEffectiveModelForJob(jobType);
  }
  return getModelConfig("GLOBAL_DEFAULT").model;
}

/**
 * Get the configured max items per batch run
 */
export function getBatchMaxItems(): number {
  return BATCH_MAX_ITEMS;
}

// Build JSONL content for a batch request
interface BatchRequest {
  custom_id: string;
  method: "POST";
  url: "/v1/chat/completions";
  body: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    response_format?: { type: "json_object" };
    max_tokens?: number;
    temperature?: number;
    reasoning_effort?: string;
  };
}

const DEFAULT_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

const artifactValidationSchemas: Partial<Record<BatchArtifactType | "kg_extract", z.ZodSchema>> = {
  MEMORY_SUMMARY: z.object({
    day_key: z.string(),
    summaries: z.array(
      z.object({
        summary: z.string(),
        source_message_ids: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
        importance: z.number().min(0).max(1).optional(),
        surprise: z.number().min(0).max(1).optional(),
        action_items: z
          .array(
            z.object({
              text: z.string(),
              due_date: z.string().nullable().optional(),
            })
          )
          .optional(),
      })
    ),
  }),
  KG_EDGES: z.object({
    entities: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          type: z.string(),
          aliases: z.array(z.string()).optional(),
        })
      )
      .optional(),
    edges: z
      .array(
        z.object({
          from: z.string(),
          to: z.string(),
          relation: z.string(),
          confidence: z.number().min(0).max(1).optional(),
          evidence_message_ids: z.array(z.string()).optional(),
        })
      )
      .optional(),
  }),
  FEEDBACK_FIX: z.object({
    fixes: z
      .array(
        z.object({
          message_id: z.string(),
          better_response: z.string().optional(),
          better_tool_plan: z.array(z.string()).optional(),
          root_cause: z.string().optional(),
          new_eval_testcase: z
            .object({
              prompt: z.string().optional(),
              expected: z.string().optional(),
              tools_expected: z.array(z.string()).optional(),
            })
            .optional(),
        })
      )
      .optional(),
  }),
  kg_extract: z.object({
    entities: z.array(z.any()).optional(),
    relationships: z.array(z.any()).optional(),
  }),
};

const defaultArtifactSchema = z.object({}).passthrough();

function normalizeTemperature(raw: number | undefined): number {
  const value = raw ?? 0.7;
  return Math.min(1, Math.max(0, value));
}

function normalizeMaxTokens(raw: number | undefined): number {
  const value = raw ?? 4096;
  return Math.max(16, Math.min(32768, value));
}

function getBackoffDelayMs(attempt: number): number {
  return Math.min(DEFAULT_BACKOFF_MS * 2 ** Math.max(0, attempt - 1), MAX_BACKOFF_MS);
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function validateArtifactContent(artifactType: string, rawContent: string): { payloadJson?: string; error?: string } {
  let parsedContent: unknown;
  try {
    parsedContent = JSON.parse(rawContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Invalid JSON payload: ${message}` };
  }

  const schema = artifactValidationSchemas[artifactType as BatchArtifactType] || defaultArtifactSchema;
  const validation = schema.safeParse(parsedContent);
  if (!validation.success) {
    return { error: validation.error.message };
  }

  return { payloadJson: JSON.stringify(validation.data) };
}

/**
 * Build a single JSONL line for batch submission
 * @param customId - Unique identifier for this request
 * @param systemPrompt - System message content
 * @param userContent - User message content
 * @param jobType - Optional job type for model lookup (uses global default if not provided)
 */
export function buildBatchRequestLine(
  customId: string,
  systemPrompt: string,
  userContent: string,
  jobType?: BatchJobType
): string {
  const config = jobType ? getModelConfig(jobType) : getModelConfig("GLOBAL_DEFAULT");

  const normalizedSystemPrompt = systemPrompt.trim();
  const normalizedUserContent = userContent.trim();
  if (!normalizedSystemPrompt || !normalizedUserContent) {
    throw new Error("System and user prompts must be non-empty when building batch requests");
  }

  const temperature = normalizeTemperature(config.temperature);
  const maxTokens = normalizeMaxTokens(config.maxTokens);

  const request: BatchRequest = {
    custom_id: customId,
    method: "POST",
    url: "/v1/chat/completions",
    body: {
      model: config.model,
      messages: [
        { role: "system", content: normalizedSystemPrompt },
        { role: "user", content: normalizedUserContent }
      ],
      response_format: { type: "json_object" },
      temperature,
      max_tokens: maxTokens,
      reasoning_effort: config.reasoningEffort,
    }
  };
  return JSON.stringify(request);
}

/**
 * Submit a batch job to OpenAI
 */
export async function submitBatchJob(jobId: string, jsonlContent: string): Promise<string> {
  const client = getOpenAIClient();
  const job = await getBatchJob(jobId);
  if (!job) throw new Error(`[BatchService] Batch job ${jobId} not found`);

  let attempts = job.attempts;
  const maxAttempts = job.maxAttempts || 5;
  let lastError: unknown;

  while (attempts < maxAttempts) {
    const attemptNumber = attempts + 1;
    const tempPath = path.join(os.tmpdir(), `batch_${jobId}_${attemptNumber}.jsonl`);
    fs.writeFileSync(tempPath, jsonlContent, "utf-8");

    try {
      await updateBatchJobStatus(jobId, job.status, { attempts: attemptNumber, error: undefined });

      const file = await client.files.create({
        file: fs.createReadStream(tempPath),
        purpose: "batch"
      });

      const batch = await client.batches.create({
        input_file_id: file.id,
        endpoint: "/v1/chat/completions",
        completion_window: "24h"
      });

      await updateBatchJobOpenAiId(jobId, batch.id);
      await updateBatchJobStatus(jobId, "SUBMITTED", { submittedAt: new Date().toISOString(), attempts: attemptNumber });

      console.log(`[BatchService] Submitted batch ${batch.id} for job ${jobId}`);
      return batch.id;
    } catch (error) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      attempts = attemptNumber;

      const shouldRetry = attempts < maxAttempts;
      const backoffMs = getBackoffDelayMs(attempts);
      await updateBatchJobStatus(jobId, shouldRetry ? "QUEUED" : "FAILED", { attempts, error: errorMessage });

      console.error(
        `[BatchService] Failed to submit batch for job ${jobId} on attempt ${attemptNumber}/${maxAttempts}:`,
        error
      );

      if (!shouldRetry) {
        break;
      }

      console.log(`[BatchService] Retrying submission for job ${jobId} after ${backoffMs}ms`);
      await delay(backoffMs);
    } finally {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Poll a submitted batch job for status
 */
export async function pollBatchJob(jobId: string): Promise<{ status: string; outputFileId?: string }> {
  const client = getOpenAIClient();
  const job = await getBatchJob(jobId);
  if (!job || !job.openAiBatchId) {
    throw new Error(`Batch job ${jobId} not found or not submitted`);
  }

  let attempts = job.attempts;
  const maxAttempts = job.maxAttempts || 5;
  let lastError: unknown;

  while (attempts < maxAttempts) {
    const attemptNumber = attempts + 1;
    try {
      const batch = await client.batches.retrieve(job.openAiBatchId);
      console.log(`[BatchService] Batch ${job.openAiBatchId} status: ${batch.status}`);

      if (batch.status === "failed" || batch.status === "expired" || batch.status === "cancelled") {
        const errorMsg = batch.errors?.data?.[0]?.message || `Batch ${batch.status}`;
        await updateBatchJobStatus(jobId, "FAILED", { error: errorMsg, attempts: attemptNumber });
      }

      return {
        status: batch.status,
        outputFileId: batch.output_file_id || undefined
      };
    } catch (error) {
      lastError = error;
      attempts = attemptNumber;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const shouldRetry = attempts < maxAttempts;
      const backoffMs = getBackoffDelayMs(attempts);

      await updateBatchJobStatus(jobId, job.status, { attempts, error: errorMessage });
      console.warn(
        `[BatchService] Poll attempt ${attemptNumber}/${maxAttempts} for job ${jobId} failed (${errorMessage}).` +
          (shouldRetry ? ` Retrying in ${backoffMs}ms.` : " No more retries."),
      );

      if (!shouldRetry) {
        break;
      }
      await delay(backoffMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

interface BatchResultItem {
  customId: string;
  content: string;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
}

/**
 * Download and parse batch results from OpenAI
 * Now also extracts token usage information for cost tracking
 */
export async function downloadBatchResults(jobId: string, outputFileId: string): Promise<{
  results: BatchResultItem[];
  totalInputTokens: number;
  totalOutputTokens: number;
  model?: string;
  parseFailures: number;
  parseFailureReasons: string[];
}> {
  const client = getOpenAIClient();

  const response = await client.files.content(outputFileId);
  const text = await response.text();

  const results: BatchResultItem[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let detectedModel: string | undefined;
  let parseFailures = 0;
  const parseFailureReasons: string[] = [];

  for (const line of text.split("\n").filter(l => l.trim())) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.response?.body?.choices?.[0]?.message?.content) {
        const usage = parsed.response?.body?.usage;
        const inputTokens = usage?.prompt_tokens || 0;
        const outputTokens = usage?.completion_tokens || 0;
        const model = parsed.response?.body?.model;
        
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;
        if (model && !detectedModel) {
          detectedModel = model;
        }
        
        results.push({
          customId: parsed.custom_id,
          content: parsed.response.body.choices[0].message.content,
          inputTokens,
          outputTokens,
          model,
        });
      } else if (parsed.error) {
        console.error(`[BatchService] Batch item ${parsed.custom_id} failed:`, parsed.error);
        parseFailures++;
        parseFailureReasons.push(`Error for ${parsed.custom_id || "unknown"}: ${JSON.stringify(parsed.error)}`);
      }
    } catch (e) {
      console.error(`[BatchService] Failed to parse result line for job ${jobId}:`, e);
      parseFailures++;
      const reason = e instanceof Error ? e.message : String(e);
      parseFailureReasons.push(reason);
    }
  }

  return { results, totalInputTokens, totalOutputTokens, model: detectedModel, parseFailures, parseFailureReasons };
}

/**
 * Process completed batch and create artifacts
 * Also logs token usage to the AI usage tracking system
 */
export async function processBatchCompletion(jobId: string): Promise<number> {
  const job = await getBatchJob(jobId);
  if (!job || !job.openAiBatchId) {
    throw new Error(`Batch job ${jobId} not found or not submitted`);
  }
  
  const pollResult = await pollBatchJob(jobId);
  if (pollResult.status !== "completed" || !pollResult.outputFileId) {
    throw new Error(`Batch not ready: status=${pollResult.status}`);
  }

  const startTime = Date.now();
  const { results, totalInputTokens, totalOutputTokens, model: detectedModel, parseFailures, parseFailureReasons } =
    await downloadBatchResults(jobId, pollResult.outputFileId);
  let artifactsCreated = 0;
  let validationFailures = 0;
  const deadLetters: string[] = [];

  for (const result of results) {
    try {
      const colonIndex = result.customId.indexOf(":");
      const artifactType = colonIndex > 0 ? result.customId.substring(0, colonIndex) : result.customId;
      const sourceRef = colonIndex > 0 ? result.customId.substring(colonIndex + 1) : result.customId;

      const validation = validateArtifactContent(artifactType, result.content);
      if (validation.error) {
        validationFailures++;
        deadLetters.push(`${artifactType}:${sourceRef}`);
        await createBatchArtifact({
          batchJobId: jobId,
          artifactType: "DEAD_LETTER" as BatchArtifactType,
          sourceRef: sourceRef,
          payloadJson: JSON.stringify({ error: validation.error, customId: result.customId }),
        });
        continue;
      }

      await createBatchArtifact({
        batchJobId: jobId,
        artifactType: artifactType as BatchArtifactType,
        sourceRef: sourceRef,
        payloadJson: validation.payloadJson ?? result.content,
      });
      artifactsCreated++;
    } catch (e) {
      console.error(`[BatchService] Failed to create artifact for ${result.customId}:`, e);
    }
  }
  const failedCount = parseFailures + validationFailures;
  const finalStatus =
    artifactsCreated > 0 && failedCount === 0
      ? "COMPLETED"
      : artifactsCreated > 0
        ? "PARTIAL"
        : "FAILED";

  const errorSummary =
    failedCount > 0
      ? `parse_failures=${parseFailures}, validation_failures=${validationFailures}` +
        (parseFailureReasons.length > 0 ? `; reasons: ${parseFailureReasons.slice(0, 3).join(" | ")}` : "") +
        (deadLetters.length > 0 ? `; dead_lettered=${deadLetters.join(",")}` : "")
      : undefined;

  // Calculate latency from submission to completion
  const latencyMs = job.submittedAt
    ? Date.now() - new Date(job.submittedAt).getTime()
    : Date.now() - startTime;
  
  // Log batch usage to AI usage tracking
  try {
    const { logBatchEvent, calculateCost } = await import("../aiLogger");
    const usedModel = detectedModel || job.model || "gpt-4o";
    
    // Calculate actual cost (batch API has 50% discount, applied in logBatchEvent)
    const costs = calculateCost(usedModel, totalInputTokens, totalOutputTokens);
    const actualCostCents = Math.round(costs.totalCostCents / 2); // 50% batch discount

    logBatchEvent({
      model: usedModel,
      batchJobId: jobId,
      batchJobType: job.type,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      inputItems: job.inputItemCount || results.length,
      outputItems: artifactsCreated,
      status: finalStatus === "COMPLETED" ? "ok" : "error",
      latencyMs,
    });
    
    // Update job with actual cost
    await updateBatchJobStatus(jobId, finalStatus, {
      completedAt: new Date().toISOString(),
      outputItemCount: artifactsCreated,
      actualCostCents,
      error: errorSummary,
    });

    console.log(`[BatchService] Job ${jobId} completed: ${artifactsCreated} artifacts, ${totalInputTokens} input tokens, ${totalOutputTokens} output tokens, cost: ${actualCostCents}c`);
  } catch (e) {
    console.error(`[BatchService] Failed to log batch usage:`, e);
    await updateBatchJobStatus(jobId, finalStatus, {
      completedAt: new Date().toISOString(),
      outputItemCount: artifactsCreated,
      error: errorSummary,
    });
  }
  
  return artifactsCreated;
}

/**
 * Check for any pending batch jobs that need polling
 */
export async function pollAllSubmittedJobs(): Promise<void> {
  const submittedJobs = getSubmittedBatchJobs();
  
  for (const job of submittedJobs) {
    try {
      const result = await pollBatchJob(job.id);
      if (result.status === "completed" && result.outputFileId) {
        await processBatchCompletion(job.id);
      }
    } catch (error) {
      console.error(`[BatchService] Error polling job ${job.id}:`, error);
    }
  }
}

// ============================================
// KNOWLEDGE GRAPH ENTITY EXTRACTION BATCH
// ============================================

export interface KgExtractionItem {
  id: string;
  domain: "memory" | "task" | "conversation" | "lifelog";
  content: string;
  title?: string;
  sourceId?: string;
}

const KG_EXTRACTION_SYSTEM_PROMPT = `You are an entity extraction system for a personal AI assistant's knowledge graph.

Extract entities and relationships from the given text. Focus on:
1. PEOPLE: Names of individuals mentioned (first names, full names, nicknames)
2. LOCATIONS: Places, addresses, landmarks, cities, venues
3. TOPICS: Key subjects, projects, themes being discussed
4. DATES: Any temporal references (today, tomorrow, next week, specific dates)

Also identify relationships between entities when clear from context.

Return JSON with this exact structure:
{
  "entities": [
    {
      "label": "<entity name>",
      "type": "person" | "location" | "topic" | "date",
      "confidence": <0.0-1.0>,
      "aliases": ["<alternative names if any>"]
    }
  ],
  "relationships": [
    {
      "fromLabel": "<entity label>",
      "toLabel": "<entity label>",
      "relationshipType": "mentions" | "knows" | "works_with" | "located_at" | "related_to" | "works_on" | "attends" | "discusses",
      "confidence": <0.0-1.0>,
      "evidence": "<brief quote or reason>"
    }
  ],
  "contextCategory": "business_call" | "family_planning" | "work_meeting" | "health_related" | "social_conversation" | "planning_logistics" | "casual_chat" | "unknown",
  "summary": "<one sentence summary of the content>"
}

Be conservative - only extract entities you're confident about. Prefer fewer high-confidence extractions over many low-confidence ones.`;

/**
 * Build JSONL content for knowledge graph entity extraction batch
 * @param items - Array of content items to process
 * @returns JSONL string ready for batch submission
 */
export function buildKgExtractionBatchRequests(items: KgExtractionItem[]): string {
  const lines: string[] = [];
  
  for (const item of items) {
    const customId = `kg_extract:${item.domain}:${item.id}`;
    const userContent = item.title 
      ? `Title: ${item.title}\n\nContent:\n${item.content.slice(0, 4000)}`
      : item.content.slice(0, 4000);
    
    const line = buildBatchRequestLine(
      customId,
      KG_EXTRACTION_SYSTEM_PROMPT,
      userContent,
      "KG_BACKFILL"
    );
    lines.push(line);
  }
  
  return lines.join("\n");
}

/**
 * Parse a knowledge graph extraction result from batch output
 */
export function parseKgExtractionResult(customId: string, content: string): {
  sourceId: string;
  sourceDomain: string;
  parsed: any;
} | null {
  try {
    // Parse customId: kg_extract:domain:id
    const parts = customId.split(":");
    if (parts.length < 3 || parts[0] !== "kg_extract") {
      console.error(`[BatchService] Invalid KG extraction customId: ${customId}`);
      return null;
    }
    
    const sourceDomain = parts[1];
    const sourceId = parts.slice(2).join(":"); // Handle IDs with colons
    
    const parsed = JSON.parse(content);
    
    return {
      sourceId,
      sourceDomain,
      parsed,
    };
  } catch (error) {
    console.error(`[BatchService] Failed to parse KG extraction result:`, error);
    return null;
  }
}

// Export service interface
export const BatchService = {
  isBatchEnabled,
  getBatchModel,
  getBatchMaxItems,
  generateIdempotencyKey,
  buildBatchRequestLine,
  buildKgExtractionBatchRequests,
  parseKgExtractionResult,
  submitBatchJob,
  pollBatchJob,
  downloadBatchResults,
  processBatchCompletion,
  pollAllSubmittedJobs,
};

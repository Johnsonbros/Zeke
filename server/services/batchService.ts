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
  };
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
  
  const request: BatchRequest = {
    custom_id: customId,
    method: "POST",
    url: "/v1/chat/completions",
    body: {
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      response_format: { type: "json_object" }
    }
  };
  return JSON.stringify(request);
}

/**
 * Submit a batch job to OpenAI
 */
export async function submitBatchJob(jobId: string, jsonlContent: string): Promise<string> {
  const client = getOpenAIClient();
  const job = getBatchJob(jobId);
  if (!job) throw new Error(`[BatchService] Batch job ${jobId} not found`);
  
  // Increment attempts
  updateBatchJobStatus(jobId, job.status, { attempts: job.attempts + 1 });
  
  // Write JSONL to a temp file for Node.js fs.createReadStream compatibility
  const tempPath = path.join(os.tmpdir(), `batch_${jobId}.jsonl`);
  fs.writeFileSync(tempPath, jsonlContent, "utf-8");
  
  try {
    // Upload file using fs.createReadStream (Node.js compatible)
    const file = await client.files.create({
      file: fs.createReadStream(tempPath),
      purpose: "batch"
    });
    
    // Create batch
    const batch = await client.batches.create({
      input_file_id: file.id,
      endpoint: "/v1/chat/completions",
      completion_window: "24h"
    });
    
    // Update job with OpenAI batch ID
    updateBatchJobOpenAiId(jobId, batch.id);
    updateBatchJobStatus(jobId, "SUBMITTED", { submittedAt: new Date().toISOString() });
    
    console.log(`[BatchService] Submitted batch ${batch.id} for job ${jobId}`);
    return batch.id;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    updateBatchJobStatus(jobId, "FAILED", { error: errorMessage });
    console.error(`[BatchService] Failed to submit batch for job ${jobId}:`, error);
    throw error;
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

/**
 * Poll a submitted batch job for status
 */
export async function pollBatchJob(jobId: string): Promise<{ status: string; outputFileId?: string }> {
  const client = getOpenAIClient();
  const job = getBatchJob(jobId);
  if (!job || !job.openAiBatchId) {
    throw new Error(`Batch job ${jobId} not found or not submitted`);
  }
  
  const batch = await client.batches.retrieve(job.openAiBatchId);
  console.log(`[BatchService] Batch ${job.openAiBatchId} status: ${batch.status}`);
  
  // Handle failed batches
  if (batch.status === "failed" || batch.status === "expired" || batch.status === "cancelled") {
    const errorMsg = batch.errors?.data?.[0]?.message || `Batch ${batch.status}`;
    updateBatchJobStatus(jobId, "FAILED", { error: errorMsg });
  }
  
  return {
    status: batch.status,
    outputFileId: batch.output_file_id || undefined
  };
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
}> {
  const client = getOpenAIClient();
  
  const response = await client.files.content(outputFileId);
  const text = await response.text();
  
  const results: BatchResultItem[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let detectedModel: string | undefined;
  
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
      }
    } catch (e) {
      console.error(`[BatchService] Failed to parse result line for job ${jobId}:`, e);
    }
  }
  
  return { results, totalInputTokens, totalOutputTokens, model: detectedModel };
}

/**
 * Process completed batch and create artifacts
 * Also logs token usage to the AI usage tracking system
 */
export async function processBatchCompletion(jobId: string): Promise<number> {
  const job = getBatchJob(jobId);
  if (!job || !job.openAiBatchId) {
    throw new Error(`Batch job ${jobId} not found or not submitted`);
  }
  
  const pollResult = await pollBatchJob(jobId);
  if (pollResult.status !== "completed" || !pollResult.outputFileId) {
    throw new Error(`Batch not ready: status=${pollResult.status}`);
  }
  
  const startTime = Date.now();
  const { results, totalInputTokens, totalOutputTokens, model: detectedModel } = await downloadBatchResults(jobId, pollResult.outputFileId);
  let artifactsCreated = 0;
  
  for (const result of results) {
    try {
      const colonIndex = result.customId.indexOf(":");
      const artifactType = colonIndex > 0 ? result.customId.substring(0, colonIndex) : result.customId;
      const sourceRef = colonIndex > 0 ? result.customId.substring(colonIndex + 1) : result.customId;
      
      createBatchArtifact({
        batchJobId: jobId,
        artifactType: artifactType as BatchArtifactType,
        sourceRef: sourceRef,
        payloadJson: result.content,
      });
      artifactsCreated++;
    } catch (e) {
      console.error(`[BatchService] Failed to create artifact for ${result.customId}:`, e);
    }
  }
  
  const finalStatus = artifactsCreated > 0 ? (artifactsCreated === results.length ? "COMPLETED" : "PARTIAL") : "FAILED";
  
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
    updateBatchJobStatus(jobId, finalStatus, {
      completedAt: new Date().toISOString(),
      outputItemCount: artifactsCreated,
      actualCostCents,
    });
    
    console.log(`[BatchService] Job ${jobId} completed: ${artifactsCreated} artifacts, ${totalInputTokens} input tokens, ${totalOutputTokens} output tokens, cost: ${actualCostCents}c`);
  } catch (e) {
    console.error(`[BatchService] Failed to log batch usage:`, e);
    updateBatchJobStatus(jobId, finalStatus, {
      completedAt: new Date().toISOString(),
      outputItemCount: artifactsCreated
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

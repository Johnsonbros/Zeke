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

// Configuration from environment
const BATCH_ENABLED = process.env.BATCH_ENABLED !== "false";
const BATCH_MODEL = process.env.BATCH_MODEL || "gpt-4o";
const BATCH_MAX_ITEMS = parseInt(process.env.BATCH_MAX_ITEMS_PER_RUN || "500", 10);

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
 * Get the configured batch model
 */
export function getBatchModel(): string {
  return BATCH_MODEL;
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
 */
export function buildBatchRequestLine(customId: string, systemPrompt: string, userContent: string): string {
  const request: BatchRequest = {
    custom_id: customId,
    method: "POST",
    url: "/v1/chat/completions",
    body: {
      model: BATCH_MODEL,
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

/**
 * Download and parse batch results from OpenAI
 */
export async function downloadBatchResults(jobId: string, outputFileId: string): Promise<Array<{ customId: string; content: string }>> {
  const client = getOpenAIClient();
  
  const response = await client.files.content(outputFileId);
  const text = await response.text();
  
  const results: Array<{ customId: string; content: string }> = [];
  for (const line of text.split("\n").filter(l => l.trim())) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.response?.body?.choices?.[0]?.message?.content) {
        results.push({
          customId: parsed.custom_id,
          content: parsed.response.body.choices[0].message.content
        });
      } else if (parsed.error) {
        console.error(`[BatchService] Batch item ${parsed.custom_id} failed:`, parsed.error);
      }
    } catch (e) {
      console.error(`[BatchService] Failed to parse result line for job ${jobId}:`, e);
    }
  }
  
  return results;
}

/**
 * Process completed batch and create artifacts
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
  
  const results = await downloadBatchResults(jobId, pollResult.outputFileId);
  let artifactsCreated = 0;
  
  for (const result of results) {
    try {
      // Parse the custom_id to determine artifact type and source
      // Format: ARTIFACT_TYPE:source_ref
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
  updateBatchJobStatus(jobId, finalStatus, {
    completedAt: new Date().toISOString(),
    outputItemCount: artifactsCreated
  });
  
  console.log(`[BatchService] Job ${jobId} completed with ${artifactsCreated} artifacts`);
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

// Export service interface
export const BatchService = {
  isBatchEnabled,
  getBatchModel,
  getBatchMaxItems,
  generateIdempotencyKey,
  buildBatchRequestLine,
  submitBatchJob,
  pollBatchJob,
  downloadBatchResults,
  processBatchCompletion,
  pollAllSubmittedJobs,
};

/**
 * Batch Job Orchestrator
 * 
 * Central hub for all batch processing in ZEKE. Implements the "batch-first" principle:
 * - Highest quality models (GPT-4o) at 50% reduced cost via OpenAI Batch API
 * - All non-realtime AI work flows through batch pipeline
 * - Deterministic work (stats, aggregation) runs locally; narrative/explanation queued to batch
 * 
 * Batch Windows:
 * - Nightly (3am): Heavy analysis - enrichment, correlations, calibration
 * - Midday (12pm): Incremental updates - memory, signal processing
 * - On-demand: Triggered by accumulating work threshold
 * 
 * Architecture:
 * - Templates define job types with priorities and artifact outputs
 * - Orchestrator schedules and executes jobs in priority order
 * - Cost tracking built into every job for visibility
 */

import * as cron from "node-cron";
import { v4 as uuidv4 } from "uuid";
import {
  createBatchJob,
  getBatchJobByIdempotencyKey,
  createBatchArtifact,
} from "../db";
import {
  generateIdempotencyKey,
  buildBatchRequestLine,
  submitBatchJob,
  isBatchEnabled,
  pollAllSubmittedJobs,
  getBatchModel,
} from "./batchService";
import * as correlationV2 from "./correlationEngineV2";
import * as selfModelEvaluator from "./selfModelEvaluator";
import type {
  BatchJobType,
  BatchJobTemplate,
  BatchWindow,
  BatchArtifactType,
} from "@shared/schema";

// ============================================
// CONFIGURATION
// ============================================

export interface OrchestratorConfig {
  enabled: boolean;
  nightlySchedule: string;
  middaySchedule: string;
  pollSchedule: string;
  timezone: string;
  batchThreshold: number;
}

let config: OrchestratorConfig = {
  enabled: true,
  nightlySchedule: "0 3 * * *",
  middaySchedule: "0 12 * * *",
  pollSchedule: "0 */2 * * *",
  timezone: "America/New_York",
  batchThreshold: 50,
};

// ============================================
// JOB TEMPLATES
// ============================================

const JOB_TEMPLATES: BatchJobTemplate[] = [
  {
    type: "NIGHTLY_ENRICHMENT",
    window: "nightly",
    priority: 1,
    artifactTypes: ["MEMORY_SUMMARY", "KG_EDGES", "FEEDBACK_FIX"],
    requiresAI: true,
    estimatedTokensPerItem: 2000,
    description: "Process day's messages into memories, knowledge graph edges, feedback fixes",
  },
  {
    type: "CORRELATION_NARRATIVE",
    window: "nightly",
    priority: 2,
    artifactTypes: ["CORRELATION_INSIGHT"],
    requiresAI: true,
    estimatedTokensPerItem: 1500,
    description: "Generate human-readable explanations for discovered correlations",
  },
  {
    type: "CALIBRATION_REVIEW",
    window: "nightly",
    priority: 3,
    artifactTypes: ["CALIBRATION_INSIGHT"],
    requiresAI: true,
    estimatedTokensPerItem: 1000,
    description: "Review expectation accuracy and suggest improvements",
  },
  {
    type: "SYSTEM_HEALTH_REPORT",
    window: "nightly",
    priority: 4,
    artifactTypes: ["HEALTH_REPORT"],
    requiresAI: true,
    estimatedTokensPerItem: 2500,
    description: "Generate daily health report with insights and recommendations",
  },
  {
    type: "PATTERN_NARRATIVE",
    window: "nightly",
    priority: 5,
    artifactTypes: ["PATTERN_INSIGHT"],
    requiresAI: true,
    estimatedTokensPerItem: 1500,
    description: "Explain discovered behavioral patterns in natural language",
  },
  {
    type: "CONCEPT_REFLECTION",
    window: "nightly",
    priority: 6,
    artifactTypes: ["CORE_CONCEPT"],
    requiresAI: true,
    estimatedTokensPerItem: 3500,
    description: "Analyze memories to extract deep conceptual understanding (terminology, relationships, identity)",
  },
  {
    type: "DAILY_SUMMARY",
    window: "nightly",
    priority: 7,
    artifactTypes: ["DAILY_SUMMARY_REPORT"],
    requiresAI: true,
    estimatedTokensPerItem: 4500,
    description: "Generate comprehensive end-of-day journal entry with insights",
  },
  {
    type: "MORNING_BRIEFING",
    window: "nightly",
    priority: 8,
    artifactTypes: ["MORNING_BRIEFING_REPORT"],
    requiresAI: true,
    estimatedTokensPerItem: 3800,
    description: "Prepare next morning's briefing content with tasks, calendar, and recommendations",
  },
  {
    type: "OMI_DIGEST",
    window: "nightly",
    priority: 9,
    artifactTypes: ["OMI_DIGEST_REPORT"],
    requiresAI: true,
    estimatedTokensPerItem: 3100,
    description: "Summarize wearable data into evening digest SMS",
  },
  {
    type: "FEEDBACK_TRAINING",
    window: "nightly",
    priority: 10,
    artifactTypes: ["FEEDBACK_TRAINING_RESULT"],
    requiresAI: true,
    estimatedTokensPerItem: 2000,
    description: "Analyze accumulated feedback to learn style preferences and corrections",
  },
  {
    type: "ANTICIPATION_ENGINE",
    window: "nightly",
    priority: 11,
    artifactTypes: ["ANTICIPATION_INSIGHT"],
    requiresAI: true,
    estimatedTokensPerItem: 2500,
    description: "Generate proactive suggestions based on patterns and upcoming events",
  },
  {
    type: "KG_BACKFILL",
    window: "nightly",
    priority: 12,
    artifactTypes: ["KG_EDGES"],
    requiresAI: true,
    estimatedTokensPerItem: 2000,
    description: "Backfill knowledge graph with entity relationships from historical data",
  },
  {
    type: "OMI_ANALYTICS",
    window: "nightly",
    priority: 13,
    artifactTypes: ["OMI_ANALYTICS_REPORT"],
    requiresAI: true,
    estimatedTokensPerItem: 2000,
    description: "Aggregate and analyze wearable sensor data for trends",
  },
  {
    type: "OMI_MEETINGS",
    window: "nightly",
    priority: 14,
    artifactTypes: ["OMI_MEETING_EXTRACTION"],
    requiresAI: true,
    estimatedTokensPerItem: 2500,
    description: "Extract meeting summaries and action items from recorded conversations",
  },
  {
    type: "OMI_ACTION_ITEMS",
    window: "nightly",
    priority: 15,
    artifactTypes: ["OMI_ACTION_ITEM"],
    requiresAI: true,
    estimatedTokensPerItem: 1500,
    description: "Extract and prioritize action items from daily interactions",
  },
  {
    type: "SELF_UNDERSTANDING",
    window: "nightly",
    priority: 16,
    artifactTypes: ["SELF_MODEL_UPDATE"],
    requiresAI: true,
    estimatedTokensPerItem: 3000,
    description: "Update ZEKE's self-model based on interaction patterns and feedback",
  },
  {
    type: "MIDDAY_INCREMENTAL",
    window: "midday",
    priority: 1,
    artifactTypes: ["MEMORY_SUMMARY"],
    requiresAI: true,
    estimatedTokensPerItem: 1000,
    description: "Process morning's signals for quick memory updates",
  },
];

// ============================================
// PROMPTS FOR BATCH JOBS
// ============================================

const CORRELATION_NARRATIVE_PROMPT = `You are ZEKE's self-understanding agent. Given statistical correlations discovered from Nate's behavioral data, generate insightful explanations.

For each correlation, provide:
1. A clear, non-technical explanation of what this pattern means
2. Why this might be happening (psychological/physiological reasoning)
3. Actionable recommendations based on this insight
4. Confidence level in this interpretation

Output STRICT JSON:
{
  "insights": [
    {
      "correlation_id": "finding_id",
      "headline": "Brief attention-grabbing headline",
      "explanation": "What this pattern means in plain language",
      "likely_cause": "Why this happens",
      "recommendation": "What Nate could do with this insight",
      "confidence": 0.0-1.0,
      "category": "energy|productivity|mood|health|social"
    }
  ]
}`;

const CALIBRATION_REVIEW_PROMPT = `You are ZEKE's calibration agent. Review expectation predictions and their outcomes to improve future accuracy.

Analyze:
1. Which predictions were accurate vs inaccurate
2. Common patterns in prediction failures
3. Suggestions for improving the prediction model
4. Blind spots in the current expectation system

Output STRICT JSON:
{
  "accuracy_analysis": {
    "correct_count": 0,
    "incorrect_count": 0,
    "accuracy_rate": 0.0-1.0,
    "best_prediction_domain": "string",
    "worst_prediction_domain": "string"
  },
  "failure_patterns": [
    {
      "pattern": "description of failure pattern",
      "frequency": "how often this occurs",
      "suggested_fix": "how to address this"
    }
  ],
  "recommendations": ["actionable improvement 1", "improvement 2"]
}`;

const HEALTH_REPORT_PROMPT = `You are ZEKE's daily briefing agent. Generate a comprehensive self-model health report.

Create a report covering:
1. Coverage: How complete is the data picture across domains
2. Stability: How consistent are the discovered patterns
3. Calibration: How accurate are predictions
4. Key insights from today's data
5. Recommended focus areas

Output STRICT JSON:
{
  "report_date": "YYYY-MM-DD",
  "executive_summary": "2-3 sentence overview",
  "metrics": {
    "coverage_score": 0.0-1.0,
    "stability_score": 0.0-1.0,
    "calibration_score": 0.0-1.0,
    "overall_grade": "thriving|stable|developing|needs_attention"
  },
  "key_insights": ["insight 1", "insight 2"],
  "focus_areas": ["area needing attention 1", "area 2"],
  "wins": ["positive observation 1"],
  "concerns": ["concerning pattern 1"]
}`;

const PATTERN_NARRATIVE_PROMPT = `You are ZEKE's pattern analyst. Transform raw pattern data into actionable insights.

For each pattern:
1. Explain what the pattern represents in everyday terms
2. Assess reliability (how confident should we be)
3. Suggest how to leverage or address this pattern
4. Note any caveats or limitations

Output STRICT JSON:
{
  "pattern_insights": [
    {
      "pattern_id": "id",
      "name": "Short descriptive name",
      "plain_explanation": "What this means in simple terms",
      "reliability": "high|medium|low",
      "actionable_advice": "What to do with this information",
      "caveats": ["limitation 1", "caveat 2"]
    }
  ]
}`;

// ============================================
// STATE TRACKING
// ============================================

let nightlyTask: cron.ScheduledTask | null = null;
let middayTask: cron.ScheduledTask | null = null;
let pollTask: cron.ScheduledTask | null = null;
let lastNightlyRun: Date | null = null;
let lastMiddayRun: Date | null = null;
let lastPollTime: Date | null = null;
let runningJobs: Set<string> = new Set();

// Cost tracking
let totalCostCentsToday = 0;
let jobCostHistory: Array<{ type: BatchJobType; costCents: number; timestamp: string }> = [];

// ============================================
// CORE ORCHESTRATION
// ============================================

/**
 * Get all registered job templates
 */
export function getJobTemplates(): BatchJobTemplate[] {
  return [...JOB_TEMPLATES];
}

/**
 * Get templates for a specific batch window
 */
export function getTemplatesForWindow(window: BatchWindow): BatchJobTemplate[] {
  return JOB_TEMPLATES
    .filter(t => t.window === window)
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Run all jobs for a given batch window
 */
export async function runBatchWindow(window: BatchWindow): Promise<{
  jobsSubmitted: number;
  jobsSkipped: number;
  estimatedCostCents: number;
  errors: string[];
}> {
  const templates = getTemplatesForWindow(window);
  const results = {
    jobsSubmitted: 0,
    jobsSkipped: 0,
    estimatedCostCents: 0,
    errors: [] as string[],
  };
  
  console.log(`[BatchOrchestrator] Running ${window} batch window with ${templates.length} job types`);
  
  for (const template of templates) {
    try {
      const result = await runJobFromTemplate(template);
      if (result.submitted) {
        results.jobsSubmitted++;
        results.estimatedCostCents += result.estimatedCostCents;
      } else {
        results.jobsSkipped++;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      results.errors.push(`${template.type}: ${msg}`);
      console.error(`[BatchOrchestrator] Error running ${template.type}:`, error);
    }
  }
  
  console.log(`[BatchOrchestrator] ${window} window complete: ${results.jobsSubmitted} submitted, ${results.jobsSkipped} skipped`);
  return results;
}

/**
 * Run a single job from its template
 */
async function runJobFromTemplate(template: BatchJobTemplate): Promise<{
  submitted: boolean;
  estimatedCostCents: number;
  jobId?: string;
}> {
  if (!isBatchEnabled()) {
    console.log(`[BatchOrchestrator] Batch disabled, skipping ${template.type}`);
    return { submitted: false, estimatedCostCents: 0 };
  }
  
  const now = new Date();
  const windowEnd = now.toISOString();
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  
  const idempotencyKey = generateIdempotencyKey(template.type, windowStart, windowEnd);
  
  const existing = getBatchJobByIdempotencyKey(idempotencyKey);
  if (existing) {
    console.log(`[BatchOrchestrator] ${template.type} already queued/running for this window`);
    return { submitted: false, estimatedCostCents: 0 };
  }
  
  let jsonlContent = "";
  let itemCount = 0;
  
  switch (template.type) {
    case "CORRELATION_NARRATIVE":
      const correlationResult = await buildCorrelationNarrativeJob();
      jsonlContent = correlationResult.jsonl;
      itemCount = correlationResult.count;
      break;
      
    case "CALIBRATION_REVIEW":
      const calibrationResult = await buildCalibrationReviewJob();
      jsonlContent = calibrationResult.jsonl;
      itemCount = calibrationResult.count;
      break;
      
    case "SYSTEM_HEALTH_REPORT":
      const healthResult = await buildHealthReportJob();
      jsonlContent = healthResult.jsonl;
      itemCount = healthResult.count;
      break;
      
    case "PATTERN_NARRATIVE":
      const patternResult = await buildPatternNarrativeJob();
      jsonlContent = patternResult.jsonl;
      itemCount = patternResult.count;
      break;
      
    default:
      console.log(`[BatchOrchestrator] No builder for ${template.type}, skipping`);
      return { submitted: false, estimatedCostCents: 0 };
  }
  
  if (itemCount === 0) {
    console.log(`[BatchOrchestrator] No items for ${template.type}, skipping`);
    return { submitted: false, estimatedCostCents: 0 };
  }
  
  const estimatedTokens = itemCount * template.estimatedTokensPerItem;
  const estimatedCostCents = Math.ceil((estimatedTokens / 1000) * 0.5);
  
  const jobId = uuidv4();
  createBatchJob({
    type: template.type,
    status: "QUEUED",
    inputWindowStart: windowStart,
    inputWindowEnd: windowEnd,
    idempotencyKey,
    attempts: 0,
    maxAttempts: 5,
    inputItemCount: itemCount,
    model: getBatchModel(),
    estimatedCostCents,
  });
  
  console.log(`[BatchOrchestrator] Created ${template.type} job with ${itemCount} items, est. ${estimatedCostCents}¢`);
  
  try {
    await submitBatchJob(jobId, jsonlContent);
    runningJobs.add(jobId);
    return { submitted: true, estimatedCostCents, jobId };
  } catch (error) {
    console.error(`[BatchOrchestrator] Failed to submit ${template.type}:`, error);
    throw error;
  }
}

// ============================================
// JOB BUILDERS
// ============================================

/**
 * Build JSONL for correlation narrative job
 */
async function buildCorrelationNarrativeJob(): Promise<{ jsonl: string; count: number }> {
  correlationV2.runCorrelationDiscovery();
  
  const findings = correlationV2.getCorrelationSummary();
  if (!findings.strongestCorrelations || findings.strongestCorrelations.length === 0) {
    return { jsonl: "", count: 0 };
  }
  
  const correlationsForNarrative = findings.strongestCorrelations
    .slice(0, 10);
  
  if (correlationsForNarrative.length === 0) {
    return { jsonl: "", count: 0 };
  }
  
  const userContent = JSON.stringify({
    correlations: correlationsForNarrative.map((c) => ({
      subject: c.subject,
      object: c.object,
      r: c.r,
      direction: c.direction,
      strength: Math.abs(c.r || 0) >= 0.7 ? "strong" : Math.abs(c.r || 0) >= 0.4 ? "moderate" : "weak",
    })),
  });
  
  const line = buildBatchRequestLine(
    `correlation_narrative_${Date.now()}`,
    CORRELATION_NARRATIVE_PROMPT,
    userContent
  );
  
  return { jsonl: line, count: correlationsForNarrative.length };
}

/**
 * Build JSONL for calibration review job
 */
async function buildCalibrationReviewJob(): Promise<{ jsonl: string; count: number }> {
  const health = selfModelEvaluator.evaluateSelfModel(30);
  
  if (health.calibration.totalPredictions === 0) {
    return { jsonl: "", count: 0 };
  }
  
  const userContent = JSON.stringify({
    calibrationData: {
      correctPredictions: health.calibration.correctPredictions,
      totalPredictions: health.calibration.totalPredictions,
      score: health.calibration.score,
    },
    coverageByDomain: health.coverage.daysByDomain,
    stabilityScore: health.stability.score,
  });
  
  const line = buildBatchRequestLine(
    `calibration_review_${Date.now()}`,
    CALIBRATION_REVIEW_PROMPT,
    userContent
  );
  
  return { jsonl: line, count: 1 };
}

/**
 * Build JSONL for health report job
 */
async function buildHealthReportJob(): Promise<{ jsonl: string; count: number }> {
  const health = selfModelEvaluator.evaluateSelfModel(30);
  const correlationSummary = correlationV2.getCorrelationSummary();
  
  const userContent = JSON.stringify({
    date: new Date().toISOString().split("T")[0],
    coverage: health.coverage,
    stability: health.stability,
    calibration: health.calibration,
    overall: health.overall,
    findings: health.findings,
    correlations: correlationSummary.strongestCorrelations?.slice(0, 5) || [],
  });
  
  const line = buildBatchRequestLine(
    `health_report_${Date.now()}`,
    HEALTH_REPORT_PROMPT,
    userContent
  );
  
  return { jsonl: line, count: 1 };
}

/**
 * Build JSONL for pattern narrative job
 */
async function buildPatternNarrativeJob(): Promise<{ jsonl: string; count: number }> {
  return { jsonl: "", count: 0 };
}

// ============================================
// SCHEDULING
// ============================================

/**
 * Start all scheduled batch windows
 */
export function startOrchestrator(): void {
  if (!config.enabled) {
    console.log("[BatchOrchestrator] Orchestrator is disabled");
    return;
  }
  
  nightlyTask = cron.schedule(
    config.nightlySchedule,
    async () => {
      console.log(`[BatchOrchestrator] Running nightly batch at ${new Date().toISOString()}`);
      lastNightlyRun = new Date();
      try {
        await runBatchWindow("nightly");
      } catch (error) {
        console.error("[BatchOrchestrator] Nightly batch failed:", error);
      }
    },
    { timezone: config.timezone }
  );
  
  middayTask = cron.schedule(
    config.middaySchedule,
    async () => {
      console.log(`[BatchOrchestrator] Running midday batch at ${new Date().toISOString()}`);
      lastMiddayRun = new Date();
      try {
        await runBatchWindow("midday");
      } catch (error) {
        console.error("[BatchOrchestrator] Midday batch failed:", error);
      }
    },
    { timezone: config.timezone }
  );
  
  pollTask = cron.schedule(
    config.pollSchedule,
    async () => {
      console.log(`[BatchOrchestrator] Polling submitted jobs at ${new Date().toISOString()}`);
      lastPollTime = new Date();
      try {
        await pollAllSubmittedJobs();
      } catch (error) {
        console.error("[BatchOrchestrator] Polling failed:", error);
      }
    },
    { timezone: config.timezone }
  );
  
  console.log("[BatchOrchestrator] Started with schedules:");
  console.log(`  Nightly: ${config.nightlySchedule} (${config.timezone})`);
  console.log(`  Midday: ${config.middaySchedule} (${config.timezone})`);
  console.log(`  Polling: ${config.pollSchedule}`);
}

/**
 * Stop all scheduled tasks
 */
export function stopOrchestrator(): void {
  if (nightlyTask) {
    nightlyTask.stop();
    nightlyTask = null;
  }
  if (middayTask) {
    middayTask.stop();
    middayTask = null;
  }
  if (pollTask) {
    pollTask.stop();
    pollTask = null;
  }
  console.log("[BatchOrchestrator] Stopped");
}

/**
 * Get orchestrator status
 */
export function getOrchestratorStatus(): {
  enabled: boolean;
  config: OrchestratorConfig;
  lastNightlyRun: string | null;
  lastMiddayRun: string | null;
  lastPollTime: string | null;
  runningJobs: string[];
  todayCostCents: number;
  templates: BatchJobTemplate[];
} {
  return {
    enabled: config.enabled,
    config,
    lastNightlyRun: lastNightlyRun?.toISOString() || null,
    lastMiddayRun: lastMiddayRun?.toISOString() || null,
    lastPollTime: lastPollTime?.toISOString() || null,
    runningJobs: Array.from(runningJobs),
    todayCostCents: totalCostCentsToday,
    templates: JOB_TEMPLATES,
  };
}

/**
 * Update orchestrator configuration
 */
export function updateConfig(newConfig: Partial<OrchestratorConfig>): void {
  config = { ...config, ...newConfig };
  
  if (nightlyTask || middayTask || pollTask) {
    stopOrchestrator();
    startOrchestrator();
  }
}

/**
 * Manually trigger a batch window (for testing or on-demand)
 */
export async function triggerBatchWindow(window: BatchWindow): Promise<{
  jobsSubmitted: number;
  jobsSkipped: number;
  estimatedCostCents: number;
  errors: string[];
}> {
  console.log(`[BatchOrchestrator] Manual trigger for ${window} window`);
  return runBatchWindow(window);
}

/**
 * Get cost summary for reporting
 */
export function getCostSummary(): {
  todayCostCents: number;
  last7DaysCostCents: number;
  byJobType: Record<string, number>;
} {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  
  const last7Days = jobCostHistory.filter(j => new Date(j.timestamp).getTime() > sevenDaysAgo);
  
  const byJobType: Record<string, number> = {};
  for (const job of last7Days) {
    byJobType[job.type] = (byJobType[job.type] || 0) + job.costCents;
  }
  
  return {
    todayCostCents: totalCostCentsToday,
    last7DaysCostCents: last7Days.reduce((sum, j) => sum + j.costCents, 0),
    byJobType,
  };
}

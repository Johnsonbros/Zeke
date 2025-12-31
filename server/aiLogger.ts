/**
 * AI Usage Logger
 * 
 * Records all AI API calls with model string, tokens, costs, latency, and metadata.
 * Helps identify silent model changes vs bugs in code/data.
 */

import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import type { 
  AiLog, 
  InsertAiLog, 
  AiEndpoint, 
  AiLogStatus,
  AiUsageStats,
  AiCostAnomaly 
} from "@shared/schema";

const db = new Database("zeke.db");

// Model pricing per 1M tokens (in cents) - Updated Dec 2024
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 250, output: 1000 },
  "gpt-4o-2024-11-20": { input: 250, output: 1000 },
  "gpt-4o-2024-08-06": { input: 250, output: 1000 },
  "gpt-4o-mini": { input: 15, output: 60 },
  "gpt-4o-mini-2024-07-18": { input: 15, output: 60 },
  "gpt-4-turbo": { input: 1000, output: 3000 },
  "gpt-4-turbo-preview": { input: 1000, output: 3000 },
  "gpt-4": { input: 3000, output: 6000 },
  "gpt-3.5-turbo": { input: 50, output: 150 },
  "gpt-3.5-turbo-0125": { input: 50, output: 150 },
  "o1": { input: 1500, output: 6000 },
  "o1-preview": { input: 1500, output: 6000 },
  "o1-mini": { input: 300, output: 1200 },
  "o3-mini": { input: 110, output: 440 },
  "text-embedding-3-small": { input: 2, output: 0 },
  "text-embedding-3-large": { input: 13, output: 0 },
  "text-embedding-ada-002": { input: 10, output: 0 },
  "tts-1": { input: 1500, output: 0 }, // per 1M chars
  "tts-1-hd": { input: 3000, output: 0 },
  "whisper-1": { input: 600, output: 0 }, // per minute, approximated
};

// Get app version from env or git
function getAppVersion(): string {
  return process.env.APP_SHA || process.env.npm_package_version || "dev";
}

// Hash system prompt for tracking drift without storing secrets
export function hashSystemPrompt(prompt: string | undefined): string | undefined {
  if (!prompt) return undefined;
  return crypto.createHash("sha256").update(prompt).digest("hex").substring(0, 16);
}

// Calculate cost in cents
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): { inputCostCents: number; outputCostCents: number; totalCostCents: number } {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING["gpt-4o-mini"]; // fallback
  
  const inputCostCents = Math.round((inputTokens / 1_000_000) * pricing.input * 100) / 100;
  const outputCostCents = Math.round((outputTokens / 1_000_000) * pricing.output * 100) / 100;
  
  return {
    inputCostCents: Math.round(inputCostCents * 100), // store as integer cents
    outputCostCents: Math.round(outputCostCents * 100),
    totalCostCents: Math.round((inputCostCents + outputCostCents) * 100),
  };
}

// Log an AI event
export function logAiEvent(event: Partial<InsertAiLog> & { model: string; endpoint: AiEndpoint }): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  
  // Calculate costs if tokens provided
  let costs = { inputCostCents: 0, outputCostCents: 0, totalCostCents: 0 };
  if (event.inputTokens !== undefined || event.outputTokens !== undefined) {
    costs = calculateCost(
      event.model,
      event.inputTokens || 0,
      event.outputTokens || 0
    );
  }
  
  const stmt = db.prepare(`
    INSERT INTO ai_logs (
      id, timestamp, request_id, model, endpoint,
      agent_id, tool_name, conversation_id,
      input_tokens, output_tokens, total_tokens,
      input_cost_cents, output_cost_cents, total_cost_cents,
      latency_ms, temperature, max_tokens,
      system_prompt_hash, tools_enabled, app_version,
      status, error_type, error_message, created_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?
    )
  `);
  
  stmt.run(
    id,
    event.timestamp || now,
    event.requestId || null,
    event.model,
    event.endpoint,
    event.agentId || null,
    event.toolName || null,
    event.conversationId || null,
    event.inputTokens || null,
    event.outputTokens || null,
    event.totalTokens || (event.inputTokens || 0) + (event.outputTokens || 0),
    event.inputCostCents ?? costs.inputCostCents,
    event.outputCostCents ?? costs.outputCostCents,
    event.totalCostCents ?? costs.totalCostCents,
    event.latencyMs || null,
    event.temperature || null,
    event.maxTokens || null,
    event.systemPromptHash || null,
    event.toolsEnabled || null,
    event.appVersion || getAppVersion(),
    event.status || "ok",
    event.errorType || null,
    event.errorMessage || null,
    now
  );
  
  return id;
}

// Log an AI error
export function logAiError(
  model: string,
  endpoint: AiEndpoint,
  error: Error,
  context?: {
    agentId?: string;
    toolName?: string;
    conversationId?: string;
    latencyMs?: number;
  }
): string {
  const errorType = error.name || "Error";
  const errorMessage = error.message.substring(0, 1000); // truncate long messages
  
  // Detect rate limiting
  const status: AiLogStatus = 
    errorMessage.toLowerCase().includes("rate limit") || 
    (error as any).status === 429 
      ? "rate_limited" 
      : errorMessage.toLowerCase().includes("timeout") 
        ? "timeout" 
        : "error";
  
  return logAiEvent({
    model,
    endpoint,
    status,
    errorType,
    errorMessage,
    ...context,
  });
}

// Get recent AI logs
export function getRecentAiLogs(limit: number = 100): AiLog[] {
  const stmt = db.prepare(`
    SELECT * FROM ai_logs 
    ORDER BY created_at DESC 
    LIMIT ?
  `);
  return stmt.all(limit) as AiLog[];
}

// Get AI logs by model
export function getAiLogsByModel(model: string, limit: number = 100): AiLog[] {
  const stmt = db.prepare(`
    SELECT * FROM ai_logs 
    WHERE model = ?
    ORDER BY created_at DESC 
    LIMIT ?
  `);
  return stmt.all(model, limit) as AiLog[];
}

// Get AI logs by agent
export function getAiLogsByAgent(agentId: string, limit: number = 100): AiLog[] {
  const stmt = db.prepare(`
    SELECT * FROM ai_logs 
    WHERE agent_id = ?
    ORDER BY created_at DESC 
    LIMIT ?
  `);
  return stmt.all(agentId, limit) as AiLog[];
}

// Get usage stats for a time period
export function getAiUsageStats(
  startDate: string,
  endDate: string
): AiUsageStats {
  const logs = db.prepare(`
    SELECT * FROM ai_logs 
    WHERE timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp ASC
  `).all(startDate, endDate) as AiLog[];
  
  const stats: AiUsageStats = {
    periodStart: startDate,
    periodEnd: endDate,
    totalCalls: logs.length,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostCents: 0,
    averageLatencyMs: 0,
    errorCount: 0,
    errorRate: 0,
    byModel: {},
    byAgent: {},
    byEndpoint: {},
  };
  
  let totalLatency = 0;
  let latencyCount = 0;
  
  for (const log of logs) {
    stats.totalInputTokens += log.inputTokens || 0;
    stats.totalOutputTokens += log.outputTokens || 0;
    stats.totalCostCents += log.totalCostCents || 0;
    
    if (log.latencyMs) {
      totalLatency += log.latencyMs;
      latencyCount++;
    }
    
    if (log.status !== "ok") {
      stats.errorCount++;
    }
    
    // By model
    if (!stats.byModel[log.model]) {
      stats.byModel[log.model] = {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        costCents: 0,
        averageLatencyMs: 0,
      };
    }
    stats.byModel[log.model].calls++;
    stats.byModel[log.model].inputTokens += log.inputTokens || 0;
    stats.byModel[log.model].outputTokens += log.outputTokens || 0;
    stats.byModel[log.model].costCents += log.totalCostCents || 0;
    
    // By agent
    const agentKey = log.agentId || "unknown";
    if (!stats.byAgent[agentKey]) {
      stats.byAgent[agentKey] = { calls: 0, costCents: 0 };
    }
    stats.byAgent[agentKey].calls++;
    stats.byAgent[agentKey].costCents += log.totalCostCents || 0;
    
    // By endpoint
    if (!stats.byEndpoint[log.endpoint]) {
      stats.byEndpoint[log.endpoint] = { calls: 0, costCents: 0 };
    }
    stats.byEndpoint[log.endpoint].calls++;
    stats.byEndpoint[log.endpoint].costCents += log.totalCostCents || 0;
  }
  
  stats.averageLatencyMs = latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0;
  stats.errorRate = stats.totalCalls > 0 ? stats.errorCount / stats.totalCalls : 0;
  
  // Calculate per-model average latency
  for (const model of Object.keys(stats.byModel)) {
    const modelLogs = logs.filter(l => l.model === model && l.latencyMs);
    if (modelLogs.length > 0) {
      const sum = modelLogs.reduce((acc, l) => acc + (l.latencyMs || 0), 0);
      stats.byModel[model].averageLatencyMs = Math.round(sum / modelLogs.length);
    }
  }
  
  return stats;
}

// Get today's usage stats
export function getTodayAiUsageStats(): AiUsageStats {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  
  return getAiUsageStats(
    startOfDay.toISOString(),
    endOfDay.toISOString()
  );
}

// Get this week's usage stats
export function getWeekAiUsageStats(): AiUsageStats {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
  startOfWeek.setHours(0, 0, 0, 0);
  
  return getAiUsageStats(
    startOfWeek.toISOString(),
    new Date().toISOString()
  );
}

// Detect anomalies compared to previous period
export function detectAnomalies(
  currentStats: AiUsageStats,
  previousStats: AiUsageStats,
  thresholds: {
    costSpike: number; // multiplier (e.g., 2 = 2x increase)
    latencyIncrease: number; // multiplier
    errorRateIncrease: number; // absolute (e.g., 0.1 = 10%)
  } = { costSpike: 2, latencyIncrease: 1.5, errorRateIncrease: 0.1 }
): AiCostAnomaly[] {
  const anomalies: AiCostAnomaly[] = [];
  const now = new Date().toISOString();
  
  // Cost spike detection
  if (previousStats.totalCostCents > 0) {
    const costMultiplier = currentStats.totalCostCents / previousStats.totalCostCents;
    if (costMultiplier >= thresholds.costSpike) {
      anomalies.push({
        type: "spike",
        severity: costMultiplier >= 3 ? "critical" : "warning",
        message: `AI costs increased ${costMultiplier.toFixed(1)}x (${(currentStats.totalCostCents / 100).toFixed(2)}c vs ${(previousStats.totalCostCents / 100).toFixed(2)}c)`,
        currentValue: currentStats.totalCostCents,
        previousValue: previousStats.totalCostCents,
        threshold: thresholds.costSpike,
        detectedAt: now,
      });
    }
  }
  
  // Latency increase detection
  if (previousStats.averageLatencyMs > 0) {
    const latencyMultiplier = currentStats.averageLatencyMs / previousStats.averageLatencyMs;
    if (latencyMultiplier >= thresholds.latencyIncrease) {
      anomalies.push({
        type: "latency_increase",
        severity: latencyMultiplier >= 2 ? "warning" : "info",
        message: `AI latency increased ${latencyMultiplier.toFixed(1)}x (${currentStats.averageLatencyMs}ms vs ${previousStats.averageLatencyMs}ms)`,
        currentValue: currentStats.averageLatencyMs,
        previousValue: previousStats.averageLatencyMs,
        threshold: thresholds.latencyIncrease,
        detectedAt: now,
      });
    }
  }
  
  // Error rate increase detection
  const errorRateDiff = currentStats.errorRate - previousStats.errorRate;
  if (errorRateDiff >= thresholds.errorRateIncrease) {
    anomalies.push({
      type: "error_rate_increase",
      severity: errorRateDiff >= 0.2 ? "critical" : "warning",
      message: `AI error rate increased by ${(errorRateDiff * 100).toFixed(1)}% (${(currentStats.errorRate * 100).toFixed(1)}% vs ${(previousStats.errorRate * 100).toFixed(1)}%)`,
      currentValue: currentStats.errorRate,
      previousValue: previousStats.errorRate,
      threshold: thresholds.errorRateIncrease,
      detectedAt: now,
    });
  }
  
  // Model change detection - new models appearing
  const previousModels = new Set(Object.keys(previousStats.byModel));
  for (const model of Object.keys(currentStats.byModel)) {
    if (!previousModels.has(model)) {
      anomalies.push({
        type: "model_change",
        severity: "info",
        message: `New model detected: ${model} (${currentStats.byModel[model].calls} calls)`,
        currentValue: currentStats.byModel[model].calls,
        previousValue: 0,
        threshold: 0,
        detectedAt: now,
      });
    }
  }
  
  return anomalies;
}

// Get distinct models used
export function getDistinctModels(): string[] {
  const stmt = db.prepare(`
    SELECT DISTINCT model FROM ai_logs ORDER BY model ASC
  `);
  return stmt.all().map((row: any) => row.model);
}

// Get distinct agents
export function getDistinctAgents(): string[] {
  const stmt = db.prepare(`
    SELECT DISTINCT agent_id FROM ai_logs 
    WHERE agent_id IS NOT NULL 
    ORDER BY agent_id ASC
  `);
  return stmt.all().map((row: any) => row.agent_id);
}

// Cleanup old logs (keep last N days)
export function cleanupOldAiLogs(daysToKeep: number = 30): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysToKeep);
  
  const stmt = db.prepare(`
    DELETE FROM ai_logs WHERE created_at < ?
  `);
  const result = stmt.run(cutoff.toISOString());
  return result.changes;
}

// Anomaly alerting configuration
interface AnomalyAlertConfig {
  enabled: boolean;
  recipientPhone: string;
  minSeverity: "info" | "warning" | "critical";
  cooldownMinutes: number;
}

let alertConfig: AnomalyAlertConfig = {
  enabled: false,
  recipientPhone: process.env.NATE_PHONE || "",
  minSeverity: "warning",
  cooldownMinutes: 60, // Don't send duplicate alerts within 1 hour
};

let lastAlertSent: Map<string, Date> = new Map();
let alertCallback: ((phone: string, message: string) => Promise<void>) | null = null;

/**
 * Configure anomaly alerts
 */
export function configureAnomalyAlerts(config: Partial<AnomalyAlertConfig>): void {
  alertConfig = { ...alertConfig, ...config };
  console.log("[AiLogger] Anomaly alerts configured:", alertConfig.enabled ? "enabled" : "disabled");
}

/**
 * Set callback for sending SMS alerts
 */
export function setAnomalyAlertCallback(callback: (phone: string, message: string) => Promise<void>): void {
  alertCallback = callback;
  console.log("[AiLogger] Anomaly alert callback configured");
}

/**
 * Check for anomalies and send alerts if needed
 */
export async function checkAndAlertAnomalies(): Promise<AiCostAnomaly[]> {
  if (!alertConfig.enabled || !alertCallback || !alertConfig.recipientPhone) {
    return [];
  }

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  
  const currentStats = getAiUsageStats(
    yesterday.toISOString(),
    today.toISOString()
  );
  const previousStats = getAiUsageStats(
    twoDaysAgo.toISOString(),
    yesterday.toISOString()
  );
  
  const anomalies = detectAnomalies(currentStats, previousStats);
  
  // Filter by severity
  const severityOrder = { info: 0, warning: 1, critical: 2 };
  const minSeverityLevel = severityOrder[alertConfig.minSeverity];
  
  const alertableAnomalies = anomalies.filter(
    a => severityOrder[a.severity] >= minSeverityLevel
  );
  
  // Send alerts for each anomaly (with cooldown)
  const now = new Date();
  for (const anomaly of alertableAnomalies) {
    const alertKey = `${anomaly.type}-${anomaly.message}`;
    const lastAlert = lastAlertSent.get(alertKey);
    
    if (lastAlert) {
      const minutesSinceLastAlert = (now.getTime() - lastAlert.getTime()) / (1000 * 60);
      if (minutesSinceLastAlert < alertConfig.cooldownMinutes) {
        continue; // Skip - still in cooldown
      }
    }
    
    try {
      const severityEmoji = anomaly.severity === "critical" ? "!!" : 
                           anomaly.severity === "warning" ? "!" : "";
      const message = `[ZEKE AI Alert${severityEmoji}] ${anomaly.message}`;
      
      await alertCallback(alertConfig.recipientPhone, message);
      lastAlertSent.set(alertKey, now);
      console.log(`[AiLogger] Sent anomaly alert: ${anomaly.type}`);
    } catch (error) {
      console.error(`[AiLogger] Failed to send anomaly alert:`, error);
    }
  }
  
  return alertableAnomalies;
}

/**
 * Get current alert configuration
 */
export function getAnomalyAlertConfig(): AnomalyAlertConfig {
  return { ...alertConfig };
}

// =============================================================================
// Batch API Usage Tracking
// =============================================================================

interface BatchUsageStats {
  periodStart: string;
  periodEnd: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostCents: number;
  byModel: Record<string, {
    jobs: number;
    inputTokens: number;
    outputTokens: number;
    costCents: number;
  }>;
  byType: Record<string, {
    jobs: number;
    costCents: number;
  }>;
}

/**
 * Log a batch API event to the ai_logs table
 * Uses endpoint = "batch" to distinguish from real-time API calls
 */
export function logBatchEvent(event: {
  model: string;
  batchJobId: string;
  batchJobType: string;
  inputTokens?: number;
  outputTokens?: number;
  inputItems?: number;
  outputItems?: number;
  status: AiLogStatus;
  errorMessage?: string;
  latencyMs?: number;
}): string {
  let costs = { inputCostCents: 0, outputCostCents: 0, totalCostCents: 0 };
  if (event.inputTokens !== undefined || event.outputTokens !== undefined) {
    // Batch API has 50% discount, so we divide by 2
    const rawCosts = calculateCost(
      event.model,
      event.inputTokens || 0,
      event.outputTokens || 0
    );
    costs = {
      inputCostCents: Math.round(rawCosts.inputCostCents / 2),
      outputCostCents: Math.round(rawCosts.outputCostCents / 2),
      totalCostCents: Math.round(rawCosts.totalCostCents / 2),
    };
  }
  
  return logAiEvent({
    model: event.model,
    endpoint: "batch",
    agentId: event.batchJobType,
    conversationId: event.batchJobId,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    inputCostCents: costs.inputCostCents,
    outputCostCents: costs.outputCostCents,
    totalCostCents: costs.totalCostCents,
    status: event.status,
    errorMessage: event.errorMessage,
    latencyMs: event.latencyMs,
  });
}

/**
 * Get batch-specific usage stats (endpoint = "batch")
 */
export function getBatchUsageStats(
  startDate: string,
  endDate: string
): BatchUsageStats {
  const logs = db.prepare(`
    SELECT * FROM ai_logs 
    WHERE endpoint = 'batch' AND timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp ASC
  `).all(startDate, endDate) as AiLog[];
  
  const stats: BatchUsageStats = {
    periodStart: startDate,
    periodEnd: endDate,
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostCents: 0,
    byModel: {},
    byType: {},
  };
  
  // Group by conversationId (which stores batchJobId)
  const jobIds = new Set<string>();
  
  for (const log of logs) {
    if (log.conversationId) {
      jobIds.add(log.conversationId);
    }
    
    stats.totalInputTokens += log.inputTokens || 0;
    stats.totalOutputTokens += log.outputTokens || 0;
    stats.totalCostCents += log.totalCostCents || 0;
    
    if (log.status === "ok") {
      stats.completedJobs++;
    } else if (log.status === "error") {
      stats.failedJobs++;
    }
    
    // By model
    if (!stats.byModel[log.model]) {
      stats.byModel[log.model] = {
        jobs: 0,
        inputTokens: 0,
        outputTokens: 0,
        costCents: 0,
      };
    }
    stats.byModel[log.model].jobs++;
    stats.byModel[log.model].inputTokens += log.inputTokens || 0;
    stats.byModel[log.model].outputTokens += log.outputTokens || 0;
    stats.byModel[log.model].costCents += log.totalCostCents || 0;
    
    // By type (stored in agentId)
    const jobType = log.agentId || "unknown";
    if (!stats.byType[jobType]) {
      stats.byType[jobType] = { jobs: 0, costCents: 0 };
    }
    stats.byType[jobType].jobs++;
    stats.byType[jobType].costCents += log.totalCostCents || 0;
  }
  
  stats.totalJobs = jobIds.size || logs.length;
  
  return stats;
}

/**
 * Get today's batch usage stats
 */
export function getTodayBatchUsageStats(): BatchUsageStats {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  
  return getBatchUsageStats(
    startOfDay.toISOString(),
    endOfDay.toISOString()
  );
}

/**
 * Get this week's batch usage stats
 */
export function getWeekBatchUsageStats(): BatchUsageStats {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  
  return getBatchUsageStats(
    startOfWeek.toISOString(),
    new Date().toISOString()
  );
}

/**
 * Get combined stats (realtime + batch) with breakdown by source
 */
export function getCombinedAiUsageStats(
  startDate: string,
  endDate: string
): {
  realtime: AiUsageStats;
  batch: BatchUsageStats;
  combined: {
    totalCostCents: number;
    totalCalls: number;
    byModel: Record<string, { calls: number; costCents: number; source: "realtime" | "batch" | "both" }>;
  };
} {
  const realtimeStats = getAiUsageStats(startDate, endDate);
  const batchStats = getBatchUsageStats(startDate, endDate);
  
  const combined: {
    totalCostCents: number;
    totalCalls: number;
    byModel: Record<string, { calls: number; costCents: number; source: "realtime" | "batch" | "both" }>;
  } = {
    totalCostCents: realtimeStats.totalCostCents + batchStats.totalCostCents,
    totalCalls: realtimeStats.totalCalls + batchStats.totalJobs,
    byModel: {},
  };
  
  // Merge realtime models
  for (const [model, data] of Object.entries(realtimeStats.byModel)) {
    combined.byModel[model] = {
      calls: data.calls,
      costCents: data.costCents,
      source: "realtime",
    };
  }
  
  // Merge batch models
  for (const [model, data] of Object.entries(batchStats.byModel)) {
    if (combined.byModel[model]) {
      combined.byModel[model].calls += data.jobs;
      combined.byModel[model].costCents += data.costCents;
      combined.byModel[model].source = "both";
    } else {
      combined.byModel[model] = {
        calls: data.jobs,
        costCents: data.costCents,
        source: "batch",
      };
    }
  }
  
  return { realtime: realtimeStats, batch: batchStats, combined };
}

// =============================================================================
// Daily Trend Data for Charts
// =============================================================================

export interface DailyTrendPoint {
  date: string;
  costCents: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Get daily cost trends for the last N days
 */
export function getDailyTrends(days: number = 30): DailyTrendPoint[] {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const stmt = db.prepare(`
    SELECT 
      date(timestamp) as date,
      SUM(total_cost_cents) as costCents,
      COUNT(*) as calls,
      SUM(input_tokens) as inputTokens,
      SUM(output_tokens) as outputTokens
    FROM ai_logs 
    WHERE timestamp >= ? AND timestamp <= ?
    GROUP BY date(timestamp)
    ORDER BY date(timestamp) ASC
  `);
  
  const results = stmt.all(startDate.toISOString(), endDate.toISOString()) as Array<{
    date: string;
    costCents: number;
    calls: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  
  // Fill in missing days with zeros
  const trends: DailyTrendPoint[] = [];
  const dateMap = new Map(results.map(r => [r.date, r]));
  
  const current = new Date(startDate);
  while (current <= endDate) {
    const dateStr = current.toISOString().split('T')[0];
    const data = dateMap.get(dateStr);
    trends.push({
      date: dateStr,
      costCents: data?.costCents || 0,
      calls: data?.calls || 0,
      inputTokens: data?.inputTokens || 0,
      outputTokens: data?.outputTokens || 0,
    });
    current.setDate(current.getDate() + 1);
  }
  
  return trends;
}

/**
 * Get cost breakdown by agent/job
 */
export function getAgentCostBreakdown(days: number = 30): Array<{
  agentId: string;
  calls: number;
  costCents: number;
  avgLatencyMs: number;
  errorCount: number;
}> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const stmt = db.prepare(`
    SELECT 
      COALESCE(agent_id, 'unknown') as agentId,
      COUNT(*) as calls,
      SUM(total_cost_cents) as costCents,
      AVG(latency_ms) as avgLatencyMs,
      SUM(CASE WHEN status != 'ok' AND status != 'success' THEN 1 ELSE 0 END) as errorCount
    FROM ai_logs 
    WHERE timestamp >= ?
    GROUP BY agent_id
    ORDER BY costCents DESC
  `);
  
  return stmt.all(startDate.toISOString()) as Array<{
    agentId: string;
    calls: number;
    costCents: number;
    avgLatencyMs: number;
    errorCount: number;
  }>;
}

// =============================================================================
// Budget Threshold Management
// =============================================================================

interface BudgetConfig {
  dailyLimitCents: number;
  weeklyLimitCents: number;
  monthlyLimitCents: number;
  alertAtPercent: number; // Alert when spending reaches this % of limit
  enabled: boolean;
}

const BUDGET_CONFIG_KEY = "ai_budget_config";
let budgetConfig: BudgetConfig = {
  dailyLimitCents: 500, // $5/day default
  weeklyLimitCents: 2500, // $25/week default
  monthlyLimitCents: 10000, // $100/month default
  alertAtPercent: 80,
  enabled: true,
};

// Load budget config from database on startup
function loadBudgetConfig(): void {
  try {
    const stmt = db.prepare(`SELECT value FROM kv_store WHERE key = ?`);
    const result = stmt.get(BUDGET_CONFIG_KEY) as { value: string } | undefined;
    if (result) {
      budgetConfig = { ...budgetConfig, ...JSON.parse(result.value) };
    }
  } catch (e) {
    // Table might not exist yet, use defaults
  }
}

function saveBudgetConfig(): void {
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO kv_store (key, value, updated_at) 
      VALUES (?, ?, datetime('now'))
    `);
    stmt.run(BUDGET_CONFIG_KEY, JSON.stringify(budgetConfig));
  } catch (e) {
    console.error("[AiLogger] Failed to save budget config:", e);
  }
}

// Try to load on module init
try {
  loadBudgetConfig();
} catch (e) {
  // Ignore - table might not exist
}

/**
 * Get current budget configuration
 */
export function getBudgetConfig(): BudgetConfig {
  return { ...budgetConfig };
}

/**
 * Update budget configuration
 */
export function updateBudgetConfig(config: Partial<BudgetConfig>): BudgetConfig {
  budgetConfig = { ...budgetConfig, ...config };
  saveBudgetConfig();
  return budgetConfig;
}

export interface BudgetStatus {
  daily: { spent: number; limit: number; percent: number; overBudget: boolean };
  weekly: { spent: number; limit: number; percent: number; overBudget: boolean };
  monthly: { spent: number; limit: number; percent: number; overBudget: boolean };
  alerts: string[];
}

/**
 * Check current spending against budget thresholds
 */
export function checkBudgetStatus(): BudgetStatus {
  const now = new Date();
  
  // Daily spending
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayStats = getAiUsageStats(todayStart.toISOString(), now.toISOString());
  
  // Weekly spending
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekStats = getAiUsageStats(weekStart.toISOString(), now.toISOString());
  
  // Monthly spending
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStats = getAiUsageStats(monthStart.toISOString(), now.toISOString());
  
  const daily = {
    spent: todayStats.totalCostCents,
    limit: budgetConfig.dailyLimitCents,
    percent: budgetConfig.dailyLimitCents > 0 
      ? Math.round((todayStats.totalCostCents / budgetConfig.dailyLimitCents) * 100) 
      : 0,
    overBudget: todayStats.totalCostCents > budgetConfig.dailyLimitCents,
  };
  
  const weekly = {
    spent: weekStats.totalCostCents,
    limit: budgetConfig.weeklyLimitCents,
    percent: budgetConfig.weeklyLimitCents > 0 
      ? Math.round((weekStats.totalCostCents / budgetConfig.weeklyLimitCents) * 100) 
      : 0,
    overBudget: weekStats.totalCostCents > budgetConfig.weeklyLimitCents,
  };
  
  const monthly = {
    spent: monthStats.totalCostCents,
    limit: budgetConfig.monthlyLimitCents,
    percent: budgetConfig.monthlyLimitCents > 0 
      ? Math.round((monthStats.totalCostCents / budgetConfig.monthlyLimitCents) * 100) 
      : 0,
    overBudget: monthStats.totalCostCents > budgetConfig.monthlyLimitCents,
  };
  
  const alerts: string[] = [];
  if (budgetConfig.enabled) {
    if (daily.overBudget) alerts.push("Daily budget exceeded!");
    else if (daily.percent >= budgetConfig.alertAtPercent) alerts.push(`Daily spending at ${daily.percent}% of limit`);
    
    if (weekly.overBudget) alerts.push("Weekly budget exceeded!");
    else if (weekly.percent >= budgetConfig.alertAtPercent) alerts.push(`Weekly spending at ${weekly.percent}% of limit`);
    
    if (monthly.overBudget) alerts.push("Monthly budget exceeded!");
    else if (monthly.percent >= budgetConfig.alertAtPercent) alerts.push(`Monthly spending at ${monthly.percent}% of limit`);
  }
  
  return { daily, weekly, monthly, alerts };
}

console.log("[AiLogger] AI usage logging system loaded");

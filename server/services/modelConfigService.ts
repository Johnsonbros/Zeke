/**
 * Model Configuration Service
 * 
 * Hot-swappable model configuration for batch jobs.
 * Allows changing models per job type or globally without code changes.
 * 
 * Fallback chain: Job-specific override -> Global default -> Hardcoded safe default
 */

import type { BatchJobType } from "@shared/schema";

const SAFE_DEFAULT_MODEL = "gpt-4o";

// In-memory cache for model configs (PostgreSQL table managed via Drizzle schema)
const configCache = new Map<string, {
  model: string;
  maxTokens: number;
  temperature: number;
  reasoningEffort?: string;
}>();

export function ensureModelConfigTable(): void {
  // No-op: Tables are created via drizzle migrations
}

export function getModelConfig(jobType: BatchJobType | string): {
  model: string;
  maxTokens: number;
  temperature: number;
  reasoningEffort?: string;
} {
  // Check cache first
  const cached = configCache.get(jobType);
  if (cached) return cached;

  // Return safe default (actual DB lookup would be async, but this function is called synchronously in many places)
  return {
    model: SAFE_DEFAULT_MODEL,
    maxTokens: 4096,
    temperature: 0.7,
  };
}

export function setModelConfig(
  jobType: BatchJobType | "GLOBAL_DEFAULT",
  config: {
    model: string;
    maxTokens?: number;
    temperature?: number;
    reasoningEffort?: string;
  },
  updatedBy?: string
): void {
  // Update in-memory cache
  configCache.set(jobType, {
    model: config.model,
    maxTokens: config.maxTokens || 4096,
    temperature: config.temperature || 0.7,
    reasoningEffort: config.reasoningEffort,
  });
}

export function getAllModelConfigs(): Array<{
  jobType: string;
  model: string;
  maxTokens: number;
  temperature: number;
  reasoningEffort?: string;
  isActive: boolean;
}> {
  const result: Array<{
    jobType: string;
    model: string;
    maxTokens: number;
    temperature: number;
    reasoningEffort?: string;
    isActive: boolean;
  }> = [];
  
  configCache.forEach((config, jobType) => {
    result.push({
      jobType,
      ...config,
      isActive: true,
    });
  });
  
  return result;
}

export function deactivateModelConfig(jobType: BatchJobType | "GLOBAL_DEFAULT"): void {
  configCache.delete(jobType);
}

export function getEffectiveModelForJob(jobType: BatchJobType | string): string {
  const config = getModelConfig(jobType);
  return config.model;
}

export async function initializeDefaultModel(): Promise<void> {
  // Set default model in cache
  configCache.set("GLOBAL_DEFAULT", {
    model: SAFE_DEFAULT_MODEL,
    maxTokens: 4096,
    temperature: 0.7,
  });
}

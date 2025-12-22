/**
 * Model Configuration Service
 * 
 * Hot-swappable model configuration for batch jobs.
 * Allows changing models per job type or globally without code changes.
 * 
 * Fallback chain: Job-specific override -> Global default -> Hardcoded safe default
 */

import { v4 as uuidv4 } from "uuid";
import { db } from "../db";
import type { BatchJobType, BatchModelConfig } from "@shared/schema";

const SAFE_DEFAULT_MODEL = "gpt-4o";
const GLOBAL_DEFAULT_KEY = "GLOBAL_DEFAULT";

interface ModelConfigRow {
  id: string;
  job_type: string;
  model: string;
  max_tokens: number | null;
  temperature: string | null;
  reasoning_effort: string | null;
  is_active: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: ModelConfigRow): BatchModelConfig {
  return {
    id: row.id,
    jobType: row.job_type,
    model: row.model,
    maxTokens: row.max_tokens,
    temperature: row.temperature,
    reasoningEffort: row.reasoning_effort,
    isActive: row.is_active === 1,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function ensureModelConfigTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS batch_model_configs (
      id TEXT PRIMARY KEY,
      job_type TEXT NOT NULL UNIQUE,
      model TEXT NOT NULL,
      max_tokens INTEGER DEFAULT 4096,
      temperature TEXT DEFAULT '0.7',
      reasoning_effort TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

export function getModelConfig(jobType: BatchJobType | string): {
  model: string;
  maxTokens: number;
  temperature: number;
  reasoningEffort?: string;
} {
  ensureModelConfigTable();

  const jobConfig = db.prepare(`
    SELECT * FROM batch_model_configs WHERE job_type = ? AND is_active = 1
  `).get(jobType) as ModelConfigRow | undefined;

  if (jobConfig) {
    return {
      model: jobConfig.model,
      maxTokens: jobConfig.max_tokens || 4096,
      temperature: parseFloat(jobConfig.temperature || "0.7"),
      reasoningEffort: jobConfig.reasoning_effort || undefined,
    };
  }

  const globalConfig = db.prepare(`
    SELECT * FROM batch_model_configs WHERE job_type = ? AND is_active = 1
  `).get(GLOBAL_DEFAULT_KEY) as ModelConfigRow | undefined;

  if (globalConfig) {
    return {
      model: globalConfig.model,
      maxTokens: globalConfig.max_tokens || 4096,
      temperature: parseFloat(globalConfig.temperature || "0.7"),
      reasoningEffort: globalConfig.reasoning_effort || undefined,
    };
  }

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
): BatchModelConfig {
  ensureModelConfigTable();
  const now = new Date().toISOString();

  const existing = db.prepare(`
    SELECT id FROM batch_model_configs WHERE job_type = ?
  `).get(jobType) as { id: string } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE batch_model_configs 
      SET model = ?, max_tokens = ?, temperature = ?, reasoning_effort = ?, 
          updated_by = ?, updated_at = ?
      WHERE job_type = ?
    `).run(
      config.model,
      config.maxTokens || 4096,
      String(config.temperature || 0.7),
      config.reasoningEffort || null,
      updatedBy || null,
      now,
      jobType
    );

    console.log(`[ModelConfig] Updated ${jobType} to model ${config.model}`);

    const row = db.prepare(`SELECT * FROM batch_model_configs WHERE job_type = ?`).get(jobType) as ModelConfigRow;
    return mapRow(row);
  } else {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO batch_model_configs 
        (id, job_type, model, max_tokens, temperature, reasoning_effort, is_active, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      id,
      jobType,
      config.model,
      config.maxTokens || 4096,
      String(config.temperature || 0.7),
      config.reasoningEffort || null,
      updatedBy || null,
      now,
      now
    );

    console.log(`[ModelConfig] Created ${jobType} with model ${config.model}`);

    const row = db.prepare(`SELECT * FROM batch_model_configs WHERE id = ?`).get(id) as ModelConfigRow;
    return mapRow(row);
  }
}

export function setGlobalBatchModel(
  model: string,
  options?: {
    maxTokens?: number;
    temperature?: number;
    reasoningEffort?: string;
    updatedBy?: string;
  }
): BatchModelConfig {
  return setModelConfig(
    "GLOBAL_DEFAULT",
    {
      model,
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
      reasoningEffort: options?.reasoningEffort,
    },
    options?.updatedBy
  );
}

export function getAllModelConfigs(): BatchModelConfig[] {
  ensureModelConfigTable();

  const rows = db.prepare(`
    SELECT * FROM batch_model_configs ORDER BY job_type
  `).all() as ModelConfigRow[];

  return rows.map(mapRow);
}

export function deleteModelConfig(jobType: string): boolean {
  ensureModelConfigTable();

  const result = db.prepare(`DELETE FROM batch_model_configs WHERE job_type = ?`).run(jobType);
  return result.changes > 0;
}

export function getEffectiveModelForJob(jobType: BatchJobType): string {
  return getModelConfig(jobType).model;
}

export function initializeDefaultModel(): void {
  ensureModelConfigTable();

  const existing = db.prepare(`
    SELECT id FROM batch_model_configs WHERE job_type = ?
  `).get(GLOBAL_DEFAULT_KEY);

  if (!existing) {
    setGlobalBatchModel("gpt-5.2-2025-12-11", {
      maxTokens: 4096,
      temperature: 0.7,
      updatedBy: "system_init",
    });
    console.log("[ModelConfig] Initialized global default model to gpt-5.2-2025-12-11");
  }
}

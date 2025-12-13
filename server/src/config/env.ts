/**
 * Centralized Environment Configuration
 * 
 * Fail-fast Zod validation for all required environment variables.
 * Import this module early to catch missing config before app startup.
 */

import { z } from "zod";

const AppEnvSchema = z.enum(["development", "staging", "production"]);
const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);

const EnvSchema = z.object({
  APP_NAME: z.string().min(1).default("ZEKE"),
  APP_ENV: AppEnvSchema.default("development"),
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  
  LOG_LEVEL: LogLevelSchema.default("info"),
  
  SESSION_SECRET: z.string().optional(),
  
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  MASTER_ADMIN_PHONE: z.string().optional(),
  
  OMI_API_KEY: z.string().optional(),
  OMI_DEV_API_KEY: z.string().optional(),
  OMI_MCP_API_KEY: z.string().optional(),
  OMI_COMMANDS_ENABLED: z.string().optional(),
  
  GOOGLE_CALENDAR_CREDENTIALS: z.string().optional(),
  GOOGLE_CALENDAR_ID: z.string().optional(),
  
  OPENWEATHERMAP_API_KEY: z.string().optional(),
  PERPLEXITY_API_KEY: z.string().optional(),
  
  INTERNAL_BRIDGE_KEY: z.string().optional(),
  EXPORT_SECRET_TOKEN: z.string().optional(),
  OVERLAND_ACCESS_TOKEN: z.string().optional(),
  
  USE_CONTEXT_ROUTER: z.string().optional(),
  PYTHONPATH: z.string().optional(),
  PYTHON_AGENTS_PORT: z.coerce.number().int().positive().default(5001),
  
  MORNING_BRIEFING_ENABLED: z.string().optional(),
  MORNING_BRIEFING_PHONE: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;
export type AppEnv = z.infer<typeof AppEnvSchema>;
export type LogLevel = z.infer<typeof LogLevelSchema>;

let _env: Env | null = null;

function validateEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const missingVars: string[] = [];
    const invalidVars: string[] = [];

    for (const issue of result.error.issues) {
      const path = issue.path.join(".");
      if (issue.code === "invalid_type" && issue.received === "undefined") {
        missingVars.push(path);
      } else {
        invalidVars.push(`${path}: ${issue.message}`);
      }
    }

    const errorMessages: string[] = [];

    if (missingVars.length > 0) {
      errorMessages.push(`Missing required environment variables:\n  - ${missingVars.join("\n  - ")}`);
    }

    if (invalidVars.length > 0) {
      errorMessages.push(`Invalid environment variables:\n  - ${invalidVars.join("\n  - ")}`);
    }

    console.error(
      `\n${"=".repeat(60)}\nENVIRONMENT CONFIGURATION ERROR\n${"=".repeat(60)}\n\n${errorMessages.join("\n\n")}\n\nRefer to .env.example and .env.schema for required variables.\n${"=".repeat(60)}\n`
    );
    process.exit(1);
  }

  return result.data;
}

export function getEnv(): Env {
  if (!_env) {
    _env = validateEnv();
  }
  return _env;
}

export function env(): Env {
  return getEnv();
}

export function isDevelopment(): boolean {
  return getEnv().APP_ENV === "development" || getEnv().NODE_ENV === "development";
}

export function isProduction(): boolean {
  return getEnv().APP_ENV === "production" || getEnv().NODE_ENV === "production";
}

export function isStaging(): boolean {
  return getEnv().APP_ENV === "staging";
}

export function requireEnv(key: keyof Env): string {
  const value = getEnv()[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return String(value);
}

getEnv();

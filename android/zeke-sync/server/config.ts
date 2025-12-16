/**
 * Unified Environment Configuration
 * 
 * Loads and validates environment variables against the schema defined in .env.schema.
 * Throws descriptive errors if required variables are missing or invalid.
 */

import { z } from "zod";

const AppEnvSchema = z.enum(["development", "staging", "production"]);
const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);

const ConfigSchema = z.object({
  APP_NAME: z.string().min(1, "APP_NAME cannot be empty"),
  APP_ENV: AppEnvSchema,
  PORT: z.coerce.number().int().positive(),
  DATABASE_URL: z.string().min(1, "DATABASE_URL cannot be empty"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET cannot be empty"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY cannot be empty"),
  LOG_LEVEL: LogLevelSchema,
});

export type Config = z.infer<typeof ConfigSchema>;
export type AppEnv = z.infer<typeof AppEnvSchema>;
export type LogLevel = z.infer<typeof LogLevelSchema>;

function validateConfig(): Config {
  const env = {
    APP_NAME: process.env.APP_NAME,
    APP_ENV: process.env.APP_ENV,
    PORT: process.env.PORT,
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    LOG_LEVEL: process.env.LOG_LEVEL,
  };

  const result = ConfigSchema.safeParse(env);

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

    throw new Error(
      `Environment configuration validation failed:\n\n${errorMessages.join("\n\n")}\n\nRefer to .env.schema for required variables and their expected formats.`
    );
  }

  return result.data;
}

let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    _config = validateConfig();
  }
  return _config;
}

export function isDevelopment(): boolean {
  return getConfig().APP_ENV === "development";
}

export function isProduction(): boolean {
  return getConfig().APP_ENV === "production";
}

export function isStaging(): boolean {
  return getConfig().APP_ENV === "staging";
}

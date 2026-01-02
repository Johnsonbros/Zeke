import { pool } from "../../db";
import { log } from "../../logger";

let lastCheckTimestamp = 0;
let lastResult = false;

export async function dbReady(): Promise<boolean> {
  const now = Date.now();
  // Avoid hammering the database if readiness is polled frequently
  if (now - lastCheckTimestamp < 5_000) {
    return lastResult;
  }

  if (!process.env.DATABASE_URL) {
    lastCheckTimestamp = now;
    lastResult = false;
    return false;
  }

  try {
    await pool.query("SELECT 1");
    lastResult = true;
  } catch (error) {
    log("Database readiness check failed", "readyz", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    lastResult = false;
  }

  lastCheckTimestamp = now;
  return lastResult;
}

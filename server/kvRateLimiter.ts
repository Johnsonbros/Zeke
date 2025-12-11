/**
 * Rate Limiting using Replit Key-Value Store
 * 
 * Provides persistent rate limiting for API calls, SMS messages, and
 * automation triggers. Survives server restarts to prevent abuse.
 */

import { kvStore } from "./kvStore";
import { log } from "./logger";

const RATELIMIT_NAMESPACE = "ratelimit";

export type RateLimitType = 
  | "sms_outbound"
  | "sms_inbound"
  | "api_openai"
  | "api_perplexity"
  | "api_elevenlabs"
  | "api_twilio"
  | "automation"
  | "voice_command"
  | "search"
  | "calendar_sync";

interface RateLimitWindow {
  count: number;
  windowStart: number;
  windowEnd: number;
}

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  cooldownMs?: number;
}

const DEFAULT_LIMITS: Record<RateLimitType, RateLimitConfig> = {
  sms_outbound: { maxRequests: 50, windowMs: 60 * 60 * 1000 },           // 50/hour
  sms_inbound: { maxRequests: 200, windowMs: 60 * 60 * 1000 },           // 200/hour
  api_openai: { maxRequests: 100, windowMs: 60 * 1000 },                 // 100/min
  api_perplexity: { maxRequests: 30, windowMs: 60 * 1000 },              // 30/min
  api_elevenlabs: { maxRequests: 20, windowMs: 60 * 1000 },              // 20/min
  api_twilio: { maxRequests: 100, windowMs: 60 * 1000 },                 // 100/min
  automation: { maxRequests: 100, windowMs: 60 * 60 * 1000 },            // 100/hour
  voice_command: { maxRequests: 60, windowMs: 60 * 1000 },               // 60/min
  search: { maxRequests: 50, windowMs: 60 * 1000 },                      // 50/min
  calendar_sync: { maxRequests: 30, windowMs: 5 * 60 * 1000 },           // 30/5min
};

const customLimits: Partial<Record<RateLimitType, RateLimitConfig>> = {};

function getConfig(type: RateLimitType): RateLimitConfig {
  return customLimits[type] || DEFAULT_LIMITS[type];
}

export async function checkRateLimit(type: RateLimitType): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}> {
  const config = getConfig(type);
  const key = `limit:${type}`;
  const now = Date.now();
  
  let window = await kvStore.get<RateLimitWindow>(RATELIMIT_NAMESPACE, key);
  
  if (!window || window.windowEnd <= now) {
    window = {
      count: 0,
      windowStart: now,
      windowEnd: now + config.windowMs,
    };
  }
  
  const remaining = Math.max(0, config.maxRequests - window.count);
  
  return {
    allowed: remaining > 0,
    remaining,
    resetAt: window.windowEnd,
    limit: config.maxRequests,
  };
}

export async function consumeRateLimit(type: RateLimitType, amount: number = 1): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: number;
}> {
  const config = getConfig(type);
  const key = `limit:${type}`;
  const now = Date.now();
  
  let window = await kvStore.get<RateLimitWindow>(RATELIMIT_NAMESPACE, key);
  
  if (!window || window.windowEnd <= now) {
    window = {
      count: 0,
      windowStart: now,
      windowEnd: now + config.windowMs,
    };
  }
  
  if (window.count + amount > config.maxRequests) {
    log(`[RateLimiter] Rate limit exceeded for ${type}: ${window.count}/${config.maxRequests}`, "warn");
    return {
      allowed: false,
      remaining: Math.max(0, config.maxRequests - window.count),
      resetAt: window.windowEnd,
    };
  }
  
  window.count += amount;
  const ttlRemaining = window.windowEnd - now;
  await kvStore.set(RATELIMIT_NAMESPACE, key, window, ttlRemaining);
  
  return {
    allowed: true,
    remaining: config.maxRequests - window.count,
    resetAt: window.windowEnd,
  };
}

export async function getRateLimitStatus(type: RateLimitType): Promise<{
  count: number;
  limit: number;
  remaining: number;
  resetAt: number;
  percentUsed: number;
}> {
  const config = getConfig(type);
  const key = `limit:${type}`;
  const now = Date.now();
  
  const window = await kvStore.get<RateLimitWindow>(RATELIMIT_NAMESPACE, key);
  
  if (!window || window.windowEnd <= now) {
    return {
      count: 0,
      limit: config.maxRequests,
      remaining: config.maxRequests,
      resetAt: now + config.windowMs,
      percentUsed: 0,
    };
  }
  
  return {
    count: window.count,
    limit: config.maxRequests,
    remaining: Math.max(0, config.maxRequests - window.count),
    resetAt: window.windowEnd,
    percentUsed: (window.count / config.maxRequests) * 100,
  };
}

export async function getAllRateLimitStatus(): Promise<Record<RateLimitType, {
  count: number;
  limit: number;
  remaining: number;
  percentUsed: number;
}>> {
  const types: RateLimitType[] = Object.keys(DEFAULT_LIMITS) as RateLimitType[];
  const result: Record<string, { count: number; limit: number; remaining: number; percentUsed: number }> = {};
  
  for (const type of types) {
    const status = await getRateLimitStatus(type);
    result[type] = {
      count: status.count,
      limit: status.limit,
      remaining: status.remaining,
      percentUsed: status.percentUsed,
    };
  }
  
  return result as Record<RateLimitType, { count: number; limit: number; remaining: number; percentUsed: number }>;
}

export function setCustomLimit(type: RateLimitType, config: RateLimitConfig): void {
  customLimits[type] = config;
  log(`[RateLimiter] Set custom limit for ${type}: ${config.maxRequests}/${config.windowMs}ms`, "info");
}

export async function resetRateLimit(type: RateLimitType): Promise<boolean> {
  const key = `limit:${type}`;
  return await kvStore.delete(RATELIMIT_NAMESPACE, key);
}

export async function resetAllRateLimits(): Promise<void> {
  await kvStore.clearNamespace(RATELIMIT_NAMESPACE);
  log("[RateLimiter] Reset all rate limits", "info");
}

export async function trackDailyUsage(type: RateLimitType): Promise<{
  today: number;
  yesterday: number;
  weekTotal: number;
}> {
  const now = new Date();
  const todayKey = `daily:${type}:${now.toISOString().split('T')[0]}`;
  
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = `daily:${type}:${yesterday.toISOString().split('T')[0]}`;
  
  const todayCount = await kvStore.get<number>(RATELIMIT_NAMESPACE, todayKey) || 0;
  const yesterdayCount = await kvStore.get<number>(RATELIMIT_NAMESPACE, yesterdayKey) || 0;
  
  let weekTotal = todayCount;
  for (let i = 1; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `daily:${type}:${d.toISOString().split('T')[0]}`;
    const count = await kvStore.get<number>(RATELIMIT_NAMESPACE, key) || 0;
    weekTotal += count;
  }
  
  return { today: todayCount, yesterday: yesterdayCount, weekTotal };
}

export async function recordDailyUsage(type: RateLimitType, amount: number = 1): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const key = `daily:${type}:${today}`;
  
  const current = await kvStore.get<number>(RATELIMIT_NAMESPACE, key) || 0;
  await kvStore.set(RATELIMIT_NAMESPACE, key, current + amount, 7 * 24 * 60 * 60 * 1000); // 7 days TTL
}

export const rateLimiter = {
  check: checkRateLimit,
  consume: consumeRateLimit,
  getStatus: getRateLimitStatus,
  getAllStatus: getAllRateLimitStatus,
  setLimit: setCustomLimit,
  reset: resetRateLimit,
  resetAll: resetAllRateLimits,
  trackDaily: trackDailyUsage,
  recordDaily: recordDailyUsage,
};

export default rateLimiter;

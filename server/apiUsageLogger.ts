/**
 * Unified API Usage Logger
 * 
 * Tracks usage and costs for all external APIs:
 * - Twilio (SMS, MMS, Voice)
 * - Deepgram (STT)
 * - ElevenLabs (TTS)
 * - Perplexity (Search)
 * - Google Maps/Calendar
 * - OpenWeatherMap
 * - Alpaca (Trading)
 */

import { db } from "./db";
import { apiUsageLogs, apiServicePricing, dailyPnl } from "@shared/schema";
import type { ApiServiceType, ApiUnitType, InsertApiUsageLog } from "@shared/schema";
import { v4 as uuidv4 } from "uuid";
import { eq, sql, and, gte, lte } from "drizzle-orm";

// Default pricing per unit (in cents) - Updated Dec 2024
// These are fallbacks when api_service_pricing table has no entry
const DEFAULT_PRICING: Record<ApiServiceType, { costPerUnit: number; unitType: ApiUnitType; freePerMonth: number; freePerDay: number }> = {
  openai: { costPerUnit: 0, unitType: "tokens", freePerMonth: 0, freePerDay: 0 }, // Tracked separately in aiLogger
  twilio_sms: { costPerUnit: 0.79, unitType: "messages", freePerMonth: 0, freePerDay: 0 }, // $0.0079/SMS
  twilio_mms: { costPerUnit: 2.0, unitType: "messages", freePerMonth: 0, freePerDay: 0 }, // $0.02/MMS
  twilio_voice: { costPerUnit: 1.4, unitType: "minutes", freePerMonth: 0, freePerDay: 0 }, // $0.014/min
  deepgram: { costPerUnit: 0.59, unitType: "minutes", freePerMonth: 0, freePerDay: 0 }, // $0.0059/min (after $200 credit)
  elevenlabs: { costPerUnit: 30, unitType: "characters", freePerMonth: 10000, freePerDay: 0 }, // $0.30/1k chars, 10k free
  perplexity: { costPerUnit: 0.5, unitType: "requests", freePerMonth: 0, freePerDay: 0 }, // ~$0.005/search
  google_calendar: { costPerUnit: 0, unitType: "requests", freePerMonth: 0, freePerDay: 1000000 }, // Free within quota
  google_maps: { costPerUnit: 0.7, unitType: "requests", freePerMonth: 28500, freePerDay: 0 }, // $7/1k after 28.5k free
  openweathermap: { costPerUnit: 0, unitType: "requests", freePerMonth: 0, freePerDay: 1000 }, // Free under 1k/day
  alpaca: { costPerUnit: 0, unitType: "requests", freePerMonth: 0, freePerDay: 0 }, // Free API
};

// Pricing cache loaded from database (merged with defaults)
let pricingCache: Record<ApiServiceType, { costPerUnit: number; unitType: ApiUnitType; freePerMonth: number; freePerDay: number }> = { ...DEFAULT_PRICING };

// Track usage for free tier calculations
interface UsageCache {
  monthly: Record<ApiServiceType, number>;
  daily: Record<ApiServiceType, number>;
  currentMonth: string; // YYYY-MM format to detect month changes
  currentDay: string; // YYYY-MM-DD format to detect day changes
}

const usageCache: UsageCache = {
  monthly: {
    openai: 0, twilio_sms: 0, twilio_mms: 0, twilio_voice: 0, deepgram: 0,
    elevenlabs: 0, perplexity: 0, google_calendar: 0, google_maps: 0,
    openweathermap: 0, alpaca: 0,
  },
  daily: {
    openai: 0, twilio_sms: 0, twilio_mms: 0, twilio_voice: 0, deepgram: 0,
    elevenlabs: 0, perplexity: 0, google_calendar: 0, google_maps: 0,
    openweathermap: 0, alpaca: 0,
  },
  currentMonth: "",
  currentDay: "",
};

// Load pricing from database, fall back to defaults
async function loadPricingConfig(): Promise<void> {
  try {
    const rows = await db.select().from(apiServicePricing);
    for (const row of rows) {
      if (row.serviceType) {
        pricingCache[row.serviceType as ApiServiceType] = {
          costPerUnit: Number(row.costPerUnit) || DEFAULT_PRICING[row.serviceType as ApiServiceType].costPerUnit,
          unitType: row.unitType as ApiUnitType,
          freePerMonth: Number(row.freeUnitsPerMonth) || 0,
          freePerDay: Number(row.freeUnitsPerDay) || 0,
        };
      }
    }
    console.log("[ApiUsageLogger] Loaded pricing config from database");
  } catch (error) {
    console.warn("[ApiUsageLogger] Using default pricing (no db overrides):", error);
    pricingCache = { ...DEFAULT_PRICING };
  }
}

// Initialize usage from database (respecting month/day boundaries)
async function initializeUsageCache(): Promise<void> {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentDay = now.toISOString().split("T")[0];
  
  usageCache.currentMonth = currentMonth;
  usageCache.currentDay = currentDay;
  
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  try {
    // Load monthly usage
    const monthlyResult = await db.select({
      serviceType: apiUsageLogs.serviceType,
      totalUnits: sql<number>`SUM(${apiUsageLogs.unitsConsumed})`,
    })
    .from(apiUsageLogs)
    .where(gte(apiUsageLogs.timestamp, startOfMonth.toISOString()))
    .groupBy(apiUsageLogs.serviceType);
    
    for (const row of monthlyResult) {
      if (row.serviceType && row.totalUnits) {
        usageCache.monthly[row.serviceType as ApiServiceType] = Number(row.totalUnits);
      }
    }
    
    // Load daily usage
    const dailyResult = await db.select({
      serviceType: apiUsageLogs.serviceType,
      totalUnits: sql<number>`SUM(${apiUsageLogs.unitsConsumed})`,
    })
    .from(apiUsageLogs)
    .where(gte(apiUsageLogs.timestamp, startOfDay.toISOString()))
    .groupBy(apiUsageLogs.serviceType);
    
    for (const row of dailyResult) {
      if (row.serviceType && row.totalUnits) {
        usageCache.daily[row.serviceType as ApiServiceType] = Number(row.totalUnits);
      }
    }
    
    console.log("[ApiUsageLogger] Usage cache initialized for", currentMonth, currentDay);
  } catch (error) {
    console.error("[ApiUsageLogger] Failed to initialize usage cache:", error);
  }
}

// Check and reset usage cache when month/day changes
function checkUsageCacheBoundaries(): void {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentDay = now.toISOString().split("T")[0];
  
  // Reset monthly cache if month changed
  if (usageCache.currentMonth !== currentMonth) {
    console.log("[ApiUsageLogger] Month changed, resetting monthly usage cache");
    for (const key of Object.keys(usageCache.monthly)) {
      usageCache.monthly[key as ApiServiceType] = 0;
    }
    usageCache.currentMonth = currentMonth;
  }
  
  // Reset daily cache if day changed
  if (usageCache.currentDay !== currentDay) {
    console.log("[ApiUsageLogger] Day changed, resetting daily usage cache");
    for (const key of Object.keys(usageCache.daily)) {
      usageCache.daily[key as ApiServiceType] = 0;
    }
    usageCache.currentDay = currentDay;
  }
}

// Initialize on startup
Promise.all([loadPricingConfig(), initializeUsageCache()]).catch(err => 
  console.error("[ApiUsageLogger] Initialization failed:", err)
);

// Calculate cost based on service pricing and free tiers (daily and monthly)
function calculateCost(
  serviceType: ApiServiceType,
  unitsConsumed: number
): { costCents: number; isFreeQuota: boolean } {
  // Check for month/day boundary resets
  checkUsageCacheBoundaries();
  
  const pricing = pricingCache[serviceType] || DEFAULT_PRICING[serviceType];
  const currentMonthlyUsage = usageCache.monthly[serviceType] || 0;
  const currentDailyUsage = usageCache.daily[serviceType] || 0;
  const freePerMonth = pricing.freePerMonth || 0;
  const freePerDay = pricing.freePerDay || 0;
  
  // Check daily free tier first (resets more frequently)
  if (freePerDay > 0) {
    const remainingDailyFree = Math.max(0, freePerDay - currentDailyUsage);
    if (remainingDailyFree >= unitsConsumed) {
      return { costCents: 0, isFreeQuota: true };
    } else if (remainingDailyFree > 0) {
      // Partially free from daily quota
      const paidUnits = unitsConsumed - remainingDailyFree;
      const costCents = Math.round(paidUnits * pricing.costPerUnit);
      return { costCents, isFreeQuota: false };
    }
    // Daily quota exhausted, check monthly or charge full price
  }
  
  // Check monthly free tier
  if (freePerMonth > 0) {
    const remainingMonthlyFree = Math.max(0, freePerMonth - currentMonthlyUsage);
    if (remainingMonthlyFree >= unitsConsumed) {
      return { costCents: 0, isFreeQuota: true };
    } else if (remainingMonthlyFree > 0) {
      // Partially free from monthly quota
      const paidUnits = unitsConsumed - remainingMonthlyFree;
      const costCents = Math.round(paidUnits * pricing.costPerUnit);
      return { costCents, isFreeQuota: false };
    }
  }
  
  // No free tier or quota exhausted - calculate full cost
  const costCents = Math.round(unitsConsumed * pricing.costPerUnit);
  return { costCents, isFreeQuota: false };
}

// Log API usage
export async function logApiUsage(params: {
  serviceType: ApiServiceType;
  operation: string;
  unitsConsumed: number;
  agentId?: string;
  conversationId?: string;
  requestId?: string;
  latencyMs?: number;
  status?: "ok" | "error" | "rate_limited";
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const pricing = pricingCache[params.serviceType] || DEFAULT_PRICING[params.serviceType];
  
  // Calculate cost (this also checks for day/month boundary resets)
  const { costCents, isFreeQuota } = calculateCost(params.serviceType, params.unitsConsumed);
  
  // Update both daily and monthly usage caches
  usageCache.monthly[params.serviceType] = (usageCache.monthly[params.serviceType] || 0) + params.unitsConsumed;
  usageCache.daily[params.serviceType] = (usageCache.daily[params.serviceType] || 0) + params.unitsConsumed;
  
  try {
    await db.insert(apiUsageLogs).values({
      id,
      timestamp: now,
      serviceType: params.serviceType,
      operation: params.operation,
      unitType: pricing.unitType,
      unitsConsumed: params.unitsConsumed,
      costCents,
      isFreeQuota,
      agentId: params.agentId,
      conversationId: params.conversationId,
      requestId: params.requestId,
      latencyMs: params.latencyMs,
      status: params.status || "ok",
      errorMessage: params.errorMessage,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      createdAt: now,
    });
    
    // Update daily P&L asynchronously
    updateDailyPnl(params.serviceType, costCents).catch(err => 
      console.error("[ApiUsageLogger] Failed to update daily P&L:", err)
    );
    
    return id;
  } catch (error) {
    console.error("[ApiUsageLogger] Failed to log usage:", error);
    throw error;
  }
}

// Service-specific logging helpers
export const logTwilioSms = (params: {
  direction: "inbound" | "outbound";
  phoneNumber?: string;
  messageSegments?: number;
  agentId?: string;
  conversationId?: string;
  latencyMs?: number;
}) => logApiUsage({
  serviceType: "twilio_sms",
  operation: params.direction === "inbound" ? "receive_sms" : "send_sms",
  unitsConsumed: params.messageSegments || 1,
  agentId: params.agentId,
  conversationId: params.conversationId,
  latencyMs: params.latencyMs,
  metadata: { direction: params.direction, phoneNumber: params.phoneNumber },
});

export const logTwilioMms = (params: {
  direction: "inbound" | "outbound";
  mediaCount?: number;
  agentId?: string;
  conversationId?: string;
  latencyMs?: number;
}) => logApiUsage({
  serviceType: "twilio_mms",
  operation: params.direction === "inbound" ? "receive_mms" : "send_mms",
  unitsConsumed: 1,
  agentId: params.agentId,
  conversationId: params.conversationId,
  latencyMs: params.latencyMs,
  metadata: { direction: params.direction, mediaCount: params.mediaCount },
});

export const logTwilioVoice = (params: {
  direction: "inbound" | "outbound";
  durationMinutes: number;
  agentId?: string;
  conversationId?: string;
}) => logApiUsage({
  serviceType: "twilio_voice",
  operation: params.direction === "inbound" ? "receive_call" : "make_call",
  unitsConsumed: params.durationMinutes,
  agentId: params.agentId,
  conversationId: params.conversationId,
  metadata: { direction: params.direction },
});

export const logDeepgram = (params: {
  audioMinutes: number;
  model?: string;
  agentId?: string;
  conversationId?: string;
  latencyMs?: number;
}) => logApiUsage({
  serviceType: "deepgram",
  operation: "transcribe",
  unitsConsumed: params.audioMinutes,
  agentId: params.agentId,
  conversationId: params.conversationId,
  latencyMs: params.latencyMs,
  metadata: { model: params.model },
});

export const logElevenLabs = (params: {
  characterCount: number;
  voiceId?: string;
  agentId?: string;
  conversationId?: string;
  latencyMs?: number;
}) => logApiUsage({
  serviceType: "elevenlabs",
  operation: "text_to_speech",
  unitsConsumed: params.characterCount / 1000, // Convert to per-1k-char units
  agentId: params.agentId,
  conversationId: params.conversationId,
  latencyMs: params.latencyMs,
  metadata: { voiceId: params.voiceId, characters: params.characterCount },
});

export const logPerplexity = (params: {
  operation: "search" | "news" | "research";
  agentId?: string;
  conversationId?: string;
  latencyMs?: number;
  query?: string;
}) => logApiUsage({
  serviceType: "perplexity",
  operation: params.operation,
  unitsConsumed: 1,
  agentId: params.agentId,
  conversationId: params.conversationId,
  latencyMs: params.latencyMs,
  metadata: { query: params.query?.substring(0, 100) }, // Truncate for privacy
});

export const logGoogleCalendar = (params: {
  operation: "list" | "get" | "create" | "update" | "delete";
  agentId?: string;
  latencyMs?: number;
}) => logApiUsage({
  serviceType: "google_calendar",
  operation: params.operation,
  unitsConsumed: 1,
  agentId: params.agentId,
  latencyMs: params.latencyMs,
});

export const logGoogleMaps = (params: {
  operation: "geocode" | "places" | "directions" | "distance";
  agentId?: string;
  latencyMs?: number;
}) => logApiUsage({
  serviceType: "google_maps",
  operation: params.operation,
  unitsConsumed: 1,
  agentId: params.agentId,
  latencyMs: params.latencyMs,
});

export const logOpenWeatherMap = (params: {
  operation: "current" | "forecast" | "historical";
  agentId?: string;
  latencyMs?: number;
}) => logApiUsage({
  serviceType: "openweathermap",
  operation: params.operation,
  unitsConsumed: 1,
  agentId: params.agentId,
  latencyMs: params.latencyMs,
});

export const logAlpaca = (params: {
  operation: "order" | "position" | "account" | "market_data";
  agentId?: string;
  latencyMs?: number;
}) => logApiUsage({
  serviceType: "alpaca",
  operation: params.operation,
  unitsConsumed: 1,
  agentId: params.agentId,
  latencyMs: params.latencyMs,
});

// Update daily P&L with cost
async function updateDailyPnl(serviceType: ApiServiceType, costCents: number): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();
  
  // Map service types to P&L cost categories
  const costCategory = getCostCategory(serviceType);
  
  try {
    // Try to update existing record
    const existing = await db.select().from(dailyPnl).where(eq(dailyPnl.date, today));
    
    if (existing.length > 0) {
      const record = existing[0];
      const updates: Record<string, number> = {};
      
      // Update the appropriate cost field
      switch (costCategory) {
        case "ai":
          updates.aiCostCents = (record.aiCostCents || 0) + costCents;
          break;
        case "communication":
          updates.communicationCostCents = (record.communicationCostCents || 0) + costCents;
          break;
        case "voice":
          updates.voiceCostCents = (record.voiceCostCents || 0) + costCents;
          break;
        case "search":
          updates.searchCostCents = (record.searchCostCents || 0) + costCents;
          break;
        case "maps":
          updates.mapsCostCents = (record.mapsCostCents || 0) + costCents;
          break;
        default:
          updates.otherCostCents = (record.otherCostCents || 0) + costCents;
      }
      
      // Recalculate totals
      const totalCost = (record.totalCostCents || 0) + costCents;
      const totalRevenue = record.totalRevenueCents || 0;
      
      await db.update(dailyPnl)
        .set({
          ...updates,
          totalCostCents: totalCost,
          netPnlCents: totalRevenue - totalCost,
          apiCallCount: (record.apiCallCount || 0) + 1,
          updatedAt: now,
        })
        .where(eq(dailyPnl.id, record.id));
    } else {
      // Create new record for today
      const id = uuidv4();
      const initialCosts: Record<string, number> = {
        aiCostCents: 0,
        communicationCostCents: 0,
        voiceCostCents: 0,
        searchCostCents: 0,
        mapsCostCents: 0,
        otherCostCents: 0,
      };
      
      switch (costCategory) {
        case "ai": initialCosts.aiCostCents = costCents; break;
        case "communication": initialCosts.communicationCostCents = costCents; break;
        case "voice": initialCosts.voiceCostCents = costCents; break;
        case "search": initialCosts.searchCostCents = costCents; break;
        case "maps": initialCosts.mapsCostCents = costCents; break;
        default: initialCosts.otherCostCents = costCents;
      }
      
      await db.insert(dailyPnl).values({
        id,
        date: today,
        ...initialCosts,
        totalCostCents: costCents,
        netPnlCents: -costCents,
        apiCallCount: 1,
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch (error) {
    console.error("[ApiUsageLogger] Failed to update daily P&L:", error);
  }
}

function getCostCategory(serviceType: ApiServiceType): string {
  switch (serviceType) {
    case "openai":
      return "ai";
    case "twilio_sms":
    case "twilio_mms":
    case "twilio_voice":
      return "communication";
    case "deepgram":
    case "elevenlabs":
      return "voice";
    case "perplexity":
      return "search";
    case "google_maps":
      return "maps";
    default:
      return "other";
  }
}

// Get usage stats for a period
export async function getUsageStats(startDate: string, endDate: string): Promise<{
  byService: Record<string, { calls: number; unitsConsumed: number; costCents: number }>;
  totalCostCents: number;
  totalCalls: number;
}> {
  try {
    const results = await db.select({
      serviceType: apiUsageLogs.serviceType,
      calls: sql<number>`COUNT(*)`,
      unitsConsumed: sql<number>`SUM(${apiUsageLogs.unitsConsumed})`,
      costCents: sql<number>`SUM(${apiUsageLogs.costCents})`,
    })
    .from(apiUsageLogs)
    .where(and(
      gte(apiUsageLogs.timestamp, startDate),
      lte(apiUsageLogs.timestamp, endDate)
    ))
    .groupBy(apiUsageLogs.serviceType);
    
    const byService: Record<string, { calls: number; unitsConsumed: number; costCents: number }> = {};
    let totalCostCents = 0;
    let totalCalls = 0;
    
    for (const row of results) {
      byService[row.serviceType] = {
        calls: Number(row.calls),
        unitsConsumed: Number(row.unitsConsumed),
        costCents: Number(row.costCents),
      };
      totalCostCents += Number(row.costCents);
      totalCalls += Number(row.calls);
    }
    
    return { byService, totalCostCents, totalCalls };
  } catch (error) {
    console.error("[ApiUsageLogger] Failed to get usage stats:", error);
    return { byService: {}, totalCostCents: 0, totalCalls: 0 };
  }
}

// Get P&L summary
export async function getPnlSummary(startDate: string, endDate: string): Promise<{
  revenue: { trading: number; other: number; total: number };
  costs: { ai: number; communication: number; voice: number; search: number; maps: number; other: number; total: number };
  netPnl: number;
  profitMargin: number;
}> {
  try {
    const results = await db.select({
      tradingRevenue: sql<number>`SUM(${dailyPnl.tradingRevenueCents})`,
      otherRevenue: sql<number>`SUM(${dailyPnl.otherRevenueCents})`,
      aiCost: sql<number>`SUM(${dailyPnl.aiCostCents})`,
      communicationCost: sql<number>`SUM(${dailyPnl.communicationCostCents})`,
      voiceCost: sql<number>`SUM(${dailyPnl.voiceCostCents})`,
      searchCost: sql<number>`SUM(${dailyPnl.searchCostCents})`,
      mapsCost: sql<number>`SUM(${dailyPnl.mapsCostCents})`,
      otherCost: sql<number>`SUM(${dailyPnl.otherCostCents})`,
    })
    .from(dailyPnl)
    .where(and(
      gte(dailyPnl.date, startDate),
      lte(dailyPnl.date, endDate)
    ));
    
    const row = results[0] || {};
    
    const revenue = {
      trading: Number(row.tradingRevenue) || 0,
      other: Number(row.otherRevenue) || 0,
      total: (Number(row.tradingRevenue) || 0) + (Number(row.otherRevenue) || 0),
    };
    
    const costs = {
      ai: Number(row.aiCost) || 0,
      communication: Number(row.communicationCost) || 0,
      voice: Number(row.voiceCost) || 0,
      search: Number(row.searchCost) || 0,
      maps: Number(row.mapsCost) || 0,
      other: Number(row.otherCost) || 0,
      total: 0,
    };
    costs.total = costs.ai + costs.communication + costs.voice + costs.search + costs.maps + costs.other;
    
    const netPnl = revenue.total - costs.total;
    const profitMargin = revenue.total > 0 ? (netPnl / revenue.total) * 100 : 0;
    
    return { revenue, costs, netPnl, profitMargin };
  } catch (error) {
    console.error("[ApiUsageLogger] Failed to get P&L summary:", error);
    return {
      revenue: { trading: 0, other: 0, total: 0 },
      costs: { ai: 0, communication: 0, voice: 0, search: 0, maps: 0, other: 0, total: 0 },
      netPnl: 0,
      profitMargin: 0,
    };
  }
}

// Update trading revenue for P&L
export async function updateTradingRevenue(revenueCents: number, date?: string): Promise<void> {
  const targetDate = date || new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();
  
  try {
    const existing = await db.select().from(dailyPnl).where(eq(dailyPnl.date, targetDate));
    
    if (existing.length > 0) {
      const record = existing[0];
      const totalRevenue = (record.tradingRevenueCents || 0) + revenueCents + (record.otherRevenueCents || 0);
      const totalCost = record.totalCostCents || 0;
      
      await db.update(dailyPnl)
        .set({
          tradingRevenueCents: (record.tradingRevenueCents || 0) + revenueCents,
          totalRevenueCents: totalRevenue,
          netPnlCents: totalRevenue - totalCost,
          tradeCount: (record.tradeCount || 0) + 1,
          updatedAt: now,
        })
        .where(eq(dailyPnl.id, record.id));
    } else {
      await db.insert(dailyPnl).values({
        id: uuidv4(),
        date: targetDate,
        tradingRevenueCents: revenueCents,
        totalRevenueCents: revenueCents,
        netPnlCents: revenueCents,
        tradeCount: 1,
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch (error) {
    console.error("[ApiUsageLogger] Failed to update trading revenue:", error);
  }
}

// Get budget status for a service
export async function getServiceBudgetStatus(serviceType: ApiServiceType): Promise<{
  monthlyUsage: number;
  dailyUsage: number;
  monthlyCost: number;
  freeMonthlyRemaining: number;
  freeDailyRemaining: number;
  budgetRemaining: number | null;
  isOverBudget: boolean;
}> {
  // Check for day/month boundary resets
  checkUsageCacheBoundaries();
  
  const pricing = pricingCache[serviceType] || DEFAULT_PRICING[serviceType];
  const monthlyUsage = usageCache.monthly[serviceType] || 0;
  const dailyUsage = usageCache.daily[serviceType] || 0;
  const freePerMonth = pricing.freePerMonth || 0;
  const freePerDay = pricing.freePerDay || 0;
  
  // Calculate cost (accounting for free tier)
  let monthlyCost = 0;
  if (monthlyUsage > freePerMonth) {
    monthlyCost = Math.round((monthlyUsage - freePerMonth) * pricing.costPerUnit);
  }
  
  const freeMonthlyRemaining = Math.max(0, freePerMonth - monthlyUsage);
  const freeDailyRemaining = Math.max(0, freePerDay - dailyUsage);
  
  return {
    monthlyUsage,
    dailyUsage,
    monthlyCost,
    freeMonthlyRemaining,
    freeDailyRemaining,
    budgetRemaining: null, // Can be configured per service
    isOverBudget: false,
  };
}

// Export for use in ZEKE's decision making
export function getCostForAction(serviceType: ApiServiceType, units: number = 1): number {
  const pricing = pricingCache[serviceType] || DEFAULT_PRICING[serviceType];
  const { costCents } = calculateCost(serviceType, units);
  return costCents / 100; // Return in dollars
}

console.log("[ApiUsageLogger] Unified API usage tracking initialized");

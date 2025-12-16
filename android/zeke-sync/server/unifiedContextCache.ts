/**
 * Unified Context Cache Layer - ZEKE Performance Optimization
 * 
 * This module provides pre-computed, ready-to-use context snapshots that are:
 * 1. Updated incrementally when data changes (via cache invalidation hooks)
 * 2. Stored persistently in KV store for cross-restart availability
 * 3. Returned instantly (<5ms) instead of rebuilding (100-300ms)
 * 
 * Architecture:
 * - Each domain (tasks, calendar, memory, etc.) has a pre-formatted bundle
 * - Bundles are regenerated only when their domain data changes
 * - KV store provides persistence, in-memory provides speed
 * - Falls back to on-demand generation if cache is cold
 * 
 * Performance target: 2x-5x faster context assembly
 */

import { kvStore } from "./kvStore";
import { log } from "./logger";
import { 
  CACHE_TTL, 
  CacheInvalidationDomain 
} from "./contextCache";

export type UnifiedBundleName = 
  | "global"
  | "tasks" 
  | "calendar" 
  | "memory" 
  | "grocery" 
  | "contacts" 
  | "locations" 
  | "omi" 
  | "profile"
  | "conversation"
  | "knowledgegraph";

interface CachedBundle {
  content: string;
  tokenEstimate: number;
  generatedAt: number;
  version: number;
}

interface UnifiedCacheStats {
  hits: number;
  misses: number;
  regenerations: number;
  avgRegenerationMs: number;
  regenerationSamples: number;
  lastRegenerationTime: Record<UnifiedBundleName, number>;
}

const CURRENT_VERSION = 1;
const KV_PREFIX = "unified_bundle:";

export type TokenBudgetTier = "primary" | "secondary" | "tertiary";

class UnifiedContextCache {
  private memoryCache: Map<string, CachedBundle> = new Map();
  private stats: UnifiedCacheStats = {
    hits: 0,
    misses: 0,
    regenerations: 0,
    avgRegenerationMs: 0,
    regenerationSamples: 0,
    lastRegenerationTime: {} as Record<UnifiedBundleName, number>,
  };
  private regenerationLocks: Map<string, Promise<CachedBundle | null>> = new Map();

  /**
   * Get a pre-formatted bundle from cache
   * Returns null if not cached (caller should generate and store)
   * budgetTier is included in cache key to handle different token budgets
   */
  async getBundle(bundleName: UnifiedBundleName, userId: string = "default", budgetTier: TokenBudgetTier = "primary"): Promise<CachedBundle | null> {
    const cacheKey = this.createKey(bundleName, userId, budgetTier);
    
    const memEntry = this.memoryCache.get(cacheKey);
    if (memEntry && this.isValid(memEntry, bundleName)) {
      this.stats.hits++;
      return memEntry;
    }
    
    try {
      const kvEntry = await kvStore.get<CachedBundle>("context", cacheKey);
      if (kvEntry && this.isValid(kvEntry, bundleName)) {
        this.memoryCache.set(cacheKey, kvEntry);
        this.stats.hits++;
        return kvEntry;
      }
    } catch (error) {
      log(`[UnifiedCache] Error reading from KV: ${error}`, "error");
    }
    
    this.stats.misses++;
    return null;
  }

  /**
   * Store a pre-formatted bundle in both memory and KV store
   * budgetTier is included in cache key to handle different token budgets
   */
  async setBundle(
    bundleName: UnifiedBundleName, 
    content: string, 
    tokenEstimate: number,
    userId: string = "default",
    budgetTier: TokenBudgetTier = "primary"
  ): Promise<void> {
    const cacheKey = this.createKey(bundleName, userId, budgetTier);
    const now = Date.now();
    
    const bundle: CachedBundle = {
      content,
      tokenEstimate,
      generatedAt: now,
      version: CURRENT_VERSION,
    };
    
    this.memoryCache.set(cacheKey, bundle);
    
    try {
      const ttl = this.getTTL(bundleName);
      await kvStore.set("context", cacheKey, bundle, ttl);
    } catch (error) {
      log(`[UnifiedCache] Error writing to KV: ${error}`, "error");
    }
  }

  /**
   * Get a bundle or compute it if missing
   * Uses lock to prevent thundering herd on cold cache
   * budgetTier ensures different priority levels get separately cached bundles
   */
  async getOrCompute(
    bundleName: UnifiedBundleName,
    compute: () => Promise<{ content: string; tokenEstimate: number }>,
    userId: string = "default",
    budgetTier: TokenBudgetTier = "primary"
  ): Promise<CachedBundle> {
    const cached = await this.getBundle(bundleName, userId, budgetTier);
    if (cached) {
      return cached;
    }
    
    const lockKey = this.createKey(bundleName, userId, budgetTier);
    const existingLock = this.regenerationLocks.get(lockKey);
    if (existingLock) {
      const result = await existingLock;
      if (result) return result;
    }
    
    const regenerationPromise = this.regenerateBundle(bundleName, compute, userId, budgetTier);
    this.regenerationLocks.set(lockKey, regenerationPromise);
    
    try {
      const result = await regenerationPromise;
      return result || { content: "", tokenEstimate: 0, generatedAt: Date.now(), version: CURRENT_VERSION };
    } finally {
      this.regenerationLocks.delete(lockKey);
    }
  }

  /**
   * Regenerate a bundle and store it
   */
  private async regenerateBundle(
    bundleName: UnifiedBundleName,
    compute: () => Promise<{ content: string; tokenEstimate: number }>,
    userId: string,
    budgetTier: TokenBudgetTier = "primary"
  ): Promise<CachedBundle | null> {
    const startTime = Date.now();
    
    try {
      const { content, tokenEstimate } = await compute();
      await this.setBundle(bundleName, content, tokenEstimate, userId, budgetTier);
      
      const elapsed = Date.now() - startTime;
      this.updateRegenerationStats(bundleName, elapsed);
      
      return {
        content,
        tokenEstimate,
        generatedAt: Date.now(),
        version: CURRENT_VERSION,
      };
    } catch (error) {
      log(`[UnifiedCache] Regeneration failed for ${bundleName}: ${error}`, "error");
      return null;
    }
  }

  /**
   * Invalidate a specific bundle across all budget tiers (called when domain data changes)
   */
  async invalidateBundle(bundleName: UnifiedBundleName, userId: string = "default"): Promise<void> {
    const budgetTiers: TokenBudgetTier[] = ["primary", "secondary", "tertiary"];
    
    for (const tier of budgetTiers) {
      const cacheKey = this.createKey(bundleName, userId, tier);
      this.memoryCache.delete(cacheKey);
      
      try {
        await kvStore.delete("context", cacheKey);
      } catch (error) {
        log(`[UnifiedCache] Error deleting ${bundleName}:${tier} from KV: ${error}`, "error");
      }
    }
    
    log(`[UnifiedCache] Invalidated bundle: ${bundleName} (all tiers)`, "cache");
  }

  /**
   * Invalidate all bundles for a user
   */
  async invalidateAllBundles(userId: string = "default"): Promise<void> {
    const bundleNames: UnifiedBundleName[] = [
      "global", "tasks", "calendar", "memory", "grocery",
      "contacts", "locations", "omi", "profile", "conversation", "knowledgegraph"
    ];
    
    await Promise.all(bundleNames.map(name => this.invalidateBundle(name, userId)));
    log(`[UnifiedCache] Invalidated all bundles for user: ${userId}`, "cache");
  }

  /**
   * Map CacheInvalidationDomain to UnifiedBundleName
   */
  domainToBundle(domain: CacheInvalidationDomain): UnifiedBundleName | null {
    const mapping: Partial<Record<CacheInvalidationDomain, UnifiedBundleName>> = {
      tasks: "tasks",
      calendar: "calendar",
      memory: "memory",
      grocery: "grocery",
      contacts: "contacts",
      locations: "locations",
      omi: "omi",
      profile: "profile",
      conversation: "conversation",
      nlp: "knowledgegraph",
    };
    return mapping[domain] || null;
  }

  /**
   * Check if a bundle is still valid
   */
  private isValid(bundle: CachedBundle, bundleName: UnifiedBundleName): boolean {
    if (bundle.version !== CURRENT_VERSION) return false;
    const ttl = this.getTTL(bundleName);
    const age = Date.now() - bundle.generatedAt;
    return age < ttl;
  }

  /**
   * Get TTL for a bundle type
   */
  private getTTL(bundleName: UnifiedBundleName): number {
    const ttlMap: Record<UnifiedBundleName, number> = {
      global: CACHE_TTL.global,
      tasks: CACHE_TTL.tasks,
      calendar: CACHE_TTL.calendar,
      memory: CACHE_TTL.memory,
      grocery: CACHE_TTL.grocery,
      contacts: CACHE_TTL.contacts,
      locations: CACHE_TTL.locations,
      omi: CACHE_TTL.omi,
      profile: CACHE_TTL.profile,
      conversation: CACHE_TTL.conversation,
      knowledgegraph: CACHE_TTL.memory,
    };
    return ttlMap[bundleName] || 60000;
  }

  /**
   * Create cache key including budget tier
   */
  private createKey(bundleName: UnifiedBundleName, userId: string, budgetTier: TokenBudgetTier = "primary"): string {
    return `${KV_PREFIX}${bundleName}:${userId}:${budgetTier}`;
  }

  /**
   * Update regeneration statistics
   */
  private updateRegenerationStats(bundleName: UnifiedBundleName, elapsedMs: number): void {
    this.stats.regenerations++;
    this.stats.regenerationSamples++;
    this.stats.avgRegenerationMs = this.stats.avgRegenerationMs + 
      (elapsedMs - this.stats.avgRegenerationMs) / this.stats.regenerationSamples;
    this.stats.lastRegenerationTime[bundleName] = Date.now();
  }

  /**
   * Get cache statistics
   */
  getStats(): UnifiedCacheStats & { hitRate: number; memoryCacheSize: number } {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      memoryCacheSize: this.memoryCache.size,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      regenerations: 0,
      avgRegenerationMs: 0,
      regenerationSamples: 0,
      lastRegenerationTime: {} as Record<UnifiedBundleName, number>,
    };
  }

  /**
   * Clear all cached bundles
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    try {
      await kvStore.clearNamespace("context");
    } catch (error) {
      log(`[UnifiedCache] Error clearing KV namespace: ${error}`, "error");
    }
    log("[UnifiedCache] Cache cleared", "cache");
  }
}

export const unifiedContextCache = new UnifiedContextCache();

export default unifiedContextCache;

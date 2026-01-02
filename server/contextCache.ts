/**
 * Context Cache - High-performance caching for ZEKE's context bundles
 * 
 * Reduces database queries per conversation turn by caching frequently-accessed
 * context bundles with intelligent TTL and automatic invalidation.
 * 
 * Architecture:
 * - In-memory LRU cache with TTL expiration
 * - Priority-based eviction (high priority items evicted last)
 * - Model-aware TTL configurations based on data volatility
 * - Domain-specific invalidation (e.g., task changes invalidate tasks bundle)
 * - Prefetch support for predictable access patterns
 * - Route-based cache warming for common navigation paths
 * - Statistics tracking for monitoring cache effectiveness
 */

import { log } from "./logger";

export type CachePriority = "low" | "medium" | "high" | "critical";

interface CacheEntry<T> {
  data: T;
  createdAt: number;
  expiresAt: number;
  hitCount: number;
  lastAccessedAt: number;
  priority: CachePriority;
  tokenEstimate?: number;
  domain?: CacheInvalidationDomain;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  invalidations: number;
  prefetches: number;
  warmingOperations: number;
  avgLatencyMs: number;
  latencySamples: number;
}

export type CacheInvalidationDomain = 
  | "tasks" 
  | "calendar" 
  | "memory" 
  | "grocery" 
  | "contacts" 
  | "locations" 
  | "omi" 
  | "profile"
  | "conversation"
  | "nlp"
  | "all";

const DEFAULT_TTL_MS = 60000;
const MAX_ENTRIES = 200;
const PRIORITY_WEIGHTS: Record<CachePriority, number> = {
  low: 1,
  medium: 10,
  high: 100,
  critical: 1000,
};

export const DOMAIN_MODEL_AWARE_CONFIG: Record<CacheInvalidationDomain, {
  baseTtl: number;
  volatility: "high" | "medium" | "low";
  priorityBoost: number;
}> = {
  tasks: { baseTtl: 20000, volatility: "high", priorityBoost: 2 },
  calendar: { baseTtl: 60000, volatility: "medium", priorityBoost: 1 },
  memory: { baseTtl: 120000, volatility: "low", priorityBoost: 3 },
  grocery: { baseTtl: 30000, volatility: "high", priorityBoost: 1 },
  contacts: { baseTtl: 300000, volatility: "low", priorityBoost: 2 },
  locations: { baseTtl: 60000, volatility: "medium", priorityBoost: 1 },
  omi: { baseTtl: 30000, volatility: "high", priorityBoost: 2 },
  profile: { baseTtl: 600000, volatility: "low", priorityBoost: 3 },
  conversation: { baseTtl: 5000, volatility: "high", priorityBoost: 4 },
  nlp: { baseTtl: 60000, volatility: "low", priorityBoost: 1 },
  all: { baseTtl: 60000, volatility: "medium", priorityBoost: 0 },
};

export const ROUTE_PREFETCH_PATTERNS: Record<string, string[]> = {
  "/": ["tasks", "calendar"],
  "/chat": ["memory", "conversation", "omi"],
  "/tasks": ["tasks", "calendar"],
  "/grocery": ["grocery"],
  "/memory": ["memory", "contacts"],
  "/contacts": ["contacts", "memory"],
  "/automations": ["tasks", "calendar"],
  "/sms-log": ["contacts"],
  "/omi": ["omi", "memory"],
  "/locations": ["locations"],
  "/profile": ["profile"],
  "sms": ["memory", "conversation", "tasks"],
};

class ContextCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    invalidations: 0,
    prefetches: 0,
    warmingOperations: 0,
    avgLatencyMs: 0,
    latencySamples: 0,
  };
  private domainKeys: Map<CacheInvalidationDomain, Set<string>> = new Map();
  private accessPatterns: Map<string, number[]> = new Map();

  constructor() {
    const domains: CacheInvalidationDomain[] = [
      "tasks", "calendar", "memory", "grocery", "contacts", 
      "locations", "omi", "profile", "conversation", "nlp", "all"
    ];
    domains.forEach(d => this.domainKeys.set(d, new Set()));
  }

  /**
   * Get a cached value or compute it if missing/expired
   * Supports priority-based caching and latency tracking
   */
  async getOrCompute<T>(
    key: string,
    compute: () => Promise<T> | T,
    options: {
      ttlMs?: number;
      domain?: CacheInvalidationDomain;
      priority?: CachePriority;
      tokenEstimate?: number;
    } = {}
  ): Promise<T> {
    const startTime = Date.now();
    const { domain, priority = "medium", tokenEstimate } = options;
    
    const ttlMs = options.ttlMs ?? this.getModelAwareTTL(domain);
    
    const existing = this.cache.get(key);
    const now = Date.now();
    
    if (existing && existing.expiresAt > now) {
      existing.hitCount++;
      existing.lastAccessedAt = now;
      this.stats.hits++;
      this.recordAccessPattern(key, now);
      return existing.data;
    }
    
    this.stats.misses++;
    
    const data = await compute();
    const computeLatency = Date.now() - startTime;
    
    this.updateLatencyStats(computeLatency);
    
    this.set(key, data, ttlMs, domain, priority, tokenEstimate);
    
    return data;
  }

  /**
   * Get model-aware TTL based on domain volatility
   */
  private getModelAwareTTL(domain?: CacheInvalidationDomain): number {
    if (!domain || domain === "all") return DEFAULT_TTL_MS;
    const config = DOMAIN_MODEL_AWARE_CONFIG[domain];
    return config?.baseTtl ?? DEFAULT_TTL_MS;
  }

  /**
   * Record access pattern for predictive prefetching
   */
  private recordAccessPattern(key: string, timestamp: number): void {
    const pattern = this.accessPatterns.get(key) || [];
    pattern.push(timestamp);
    if (pattern.length > 20) {
      pattern.shift();
    }
    this.accessPatterns.set(key, pattern);
  }

  /**
   * Update latency statistics
   */
  private updateLatencyStats(latencyMs: number): void {
    const { avgLatencyMs, latencySamples } = this.stats;
    this.stats.latencySamples = latencySamples + 1;
    this.stats.avgLatencyMs = avgLatencyMs + (latencyMs - avgLatencyMs) / this.stats.latencySamples;
  }

  /**
   * Set a value in the cache with priority support
   */
  set<T>(
    key: string,
    data: T,
    ttlMs: number = DEFAULT_TTL_MS,
    domain?: CacheInvalidationDomain,
    priority: CachePriority = "medium",
    tokenEstimate?: number
  ): void {
    const now = Date.now();
    
    if (this.cache.size >= MAX_ENTRIES && !this.cache.has(key)) {
      this.evictByPriority();
    }
    
    this.cache.set(key, {
      data,
      createdAt: now,
      expiresAt: now + ttlMs,
      hitCount: 0,
      lastAccessedAt: now,
      priority,
      tokenEstimate,
      domain,
    });
    
    if (domain) {
      this.domainKeys.get(domain)?.add(key);
    }
  }

  /**
   * Get a cached value (returns undefined if missing or expired)
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    const now = Date.now();
    
    if (!entry || entry.expiresAt <= now) {
      if (entry) {
        this.cache.delete(key);
      }
      this.stats.misses++;
      return undefined;
    }
    
    entry.hitCount++;
    this.stats.hits++;
    return entry.data;
  }

  /**
   * Invalidate all cache entries for a specific domain
   */
  invalidateDomain(domain: CacheInvalidationDomain): number {
    if (domain === "all") {
      const count = this.cache.size;
      this.cache.clear();
      this.domainKeys.forEach(keys => keys.clear());
      this.stats.invalidations += count;
      log(`[ContextCache] Invalidated all ${count} entries`, "cache");
      return count;
    }
    
    const keys = this.domainKeys.get(domain);
    if (!keys) return 0;
    
    let count = 0;
    const keyArray = Array.from(keys);
    for (const key of keyArray) {
      if (this.cache.delete(key)) {
        count++;
      }
    }
    keys.clear();
    this.stats.invalidations += count;
    
    if (count > 0) {
      log(`[ContextCache] Invalidated ${count} entries for domain: ${domain}`, "cache");
    }
    
    return count;
  }

  /**
   * Invalidate a specific key
   */
  invalidateKey(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.invalidations++;
      // Remove from domain tracking
      this.domainKeys.forEach(keys => keys.delete(key));
    }
    return deleted;
  }

  /**
   * Prefetch multiple keys in parallel
   */
  async prefetch<T>(
    entries: Array<{
      key: string;
      compute: () => Promise<T> | T;
      ttlMs?: number;
      domain?: CacheInvalidationDomain;
    }>
  ): Promise<void> {
    const promises = entries.map(async ({ key, compute, ttlMs, domain }) => {
      // Only prefetch if not already cached
      if (!this.get(key)) {
        const data = await compute();
        this.set(key, data, ttlMs, domain);
        this.stats.prefetches++;
      }
    });
    
    await Promise.all(promises);
  }

  /**
   * Evict entries using priority-based scoring
   * Lower priority + older + fewer hits = higher eviction score
   * Priority strictly enforced: higher priority items always survive over lower priority
   */
  private evictByPriority(): void {
    let bestKey: string | null = null;
    let highestEvictionScore = -Infinity;
    let lowestPriority = Infinity;
    const now = Date.now();
    
    const entries = Array.from(this.cache.entries());
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
        this.domainKeys.forEach(keys => keys.delete(key));
        this.stats.evictions++;
        return;
      }
      
      const priorityWeight = PRIORITY_WEIGHTS[entry.priority as CachePriority] || 1;
      const ageMs = now - entry.createdAt;
      const timeSinceAccess = now - entry.lastAccessedAt;
      const hitPenalty = Math.min(entry.hitCount * 1000, 10000);
      
      if (priorityWeight < lowestPriority) {
        lowestPriority = priorityWeight;
        highestEvictionScore = (timeSinceAccess + ageMs / 2 - hitPenalty);
        bestKey = key;
      } else if (priorityWeight === lowestPriority) {
        const evictionScore = (timeSinceAccess + ageMs / 2 - hitPenalty);
        if (evictionScore > highestEvictionScore) {
          highestEvictionScore = evictionScore;
          bestKey = key;
        }
      }
    }
    
    if (bestKey) {
      this.cache.delete(bestKey);
      this.domainKeys.forEach(keys => keys.delete(bestKey!));
      this.stats.evictions++;
    }
  }

  /**
   * Warm cache for a specific route by preloading common bundles
   */
  async warmCacheForRoute(
    route: string,
    bundleLoaders: Record<string, () => Promise<any>>
  ): Promise<void> {
    const routeBundles = ROUTE_PREFETCH_PATTERNS[route as keyof typeof ROUTE_PREFETCH_PATTERNS] || [];
    
    const warmingPromises = routeBundles.map(async (bundleName) => {
      const loader = bundleLoaders[bundleName];
      if (!loader) return;
      
      const cacheKey = createCacheKey(bundleName, "warmed");
      if (this.get(cacheKey)) return;
      
      try {
        const data = await loader();
        const domain = bundleName as CacheInvalidationDomain;
        this.set(cacheKey, data, this.getModelAwareTTL(domain), domain, "high");
        this.stats.warmingOperations++;
      } catch (error) {
        console.error(`[ContextCache] Failed to warm ${bundleName}:`, error);
      }
    });
    
    await Promise.all(warmingPromises);
  }

  /**
   * Get frequently accessed keys for predictive prefetching
   */
  getFrequentlyAccessedKeys(limit: number = 10): string[] {
    const keyFrequency: Array<{ key: string; frequency: number }> = [];
    
    const patterns = Array.from(this.accessPatterns.entries());
    for (const [key, timestamps] of patterns) {
      if (timestamps.length >= 2) {
        const avgInterval = timestamps.slice(1).reduce((sum: number, t: number, i: number) => 
          sum + (t - timestamps[i]), 0) / (timestamps.length - 1);
        keyFrequency.push({ key, frequency: 1 / (avgInterval || 1) });
      }
    }
    
    return keyFrequency
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit)
      .map(kf => kf.key);
  }

  /**
   * Get cache statistics including advanced metrics
   */
  getStats(): CacheStats & { 
    size: number; 
    hitRate: number;
    priorityDistribution: Record<CachePriority, number>;
  } {
    const total = this.stats.hits + this.stats.misses;
    
    const priorityDistribution: Record<CachePriority, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };
    
    const entries = Array.from(this.cache.values());
    for (const entry of entries) {
      priorityDistribution[entry.priority as CachePriority]++;
    }
    
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      priorityDistribution,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      invalidations: 0,
      prefetches: 0,
      warmingOperations: 0,
      avgLatencyMs: 0,
      latencySamples: 0,
    };
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.domainKeys.forEach(keys => keys.clear());
    log("[ContextCache] Cache cleared", "cache");
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }
}

// Singleton instance
export const contextCache = new ContextCache();

// TTL configurations for different bundle types
export const CACHE_TTL = {
  tasks: 20000,        // 20 seconds - tasks change frequently
  calendar: 60000,     // 1 minute - calendar events are relatively stable
  memory: 120000,      // 2 minutes - memories don't change often
  grocery: 30000,      // 30 seconds - grocery items can change
  contacts: 300000,    // 5 minutes - contacts rarely change
  locations: 60000,    // 1 minute - location data
  omi: 30000,          // 30 seconds - Omi memories update frequently
  profile: 600000,     // 10 minutes - profile rarely changes
  conversation: 5000,  // 5 seconds - conversation context is very dynamic
  global: 300000,      // 5 minutes - global context is stable
} as const;

// Helper to create cache keys
export function createCacheKey(domain: string, ...parts: (string | number | undefined)[]): string {
  return [domain, ...parts.filter(p => p !== undefined)].join(":");
}

// Invalidation helpers for domain-specific changes
export const invalidateCache = {
  tasks: () => contextCache.invalidateDomain("tasks"),
  calendar: () => contextCache.invalidateDomain("calendar"),
  memory: () => contextCache.invalidateDomain("memory"),
  grocery: () => contextCache.invalidateDomain("grocery"),
  contacts: () => contextCache.invalidateDomain("contacts"),
  locations: () => contextCache.invalidateDomain("locations"),
  omi: () => contextCache.invalidateDomain("omi"),
  profile: () => contextCache.invalidateDomain("profile"),
  conversation: (conversationId?: string) => {
    if (conversationId) {
      contextCache.invalidateKey(createCacheKey("conversation", conversationId));
    } else {
      contextCache.invalidateDomain("conversation");
    }
  },
  all: () => contextCache.invalidateDomain("all"),
};

export default contextCache;

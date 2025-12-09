/**
 * Context Cache - High-performance caching for ZEKE's context bundles
 * 
 * Reduces database queries per conversation turn by caching frequently-accessed
 * context bundles with intelligent TTL and automatic invalidation.
 * 
 * Architecture:
 * - In-memory LRU cache with TTL expiration
 * - Domain-specific invalidation (e.g., task changes invalidate tasks bundle)
 * - Prefetch support for predictable access patterns
 * - Statistics tracking for monitoring cache effectiveness
 */

import { log } from "./logger";

interface CacheEntry<T> {
  data: T;
  createdAt: number;
  expiresAt: number;
  hitCount: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  invalidations: number;
  prefetches: number;
}

type CacheInvalidationDomain = 
  | "tasks" 
  | "calendar" 
  | "memory" 
  | "grocery" 
  | "contacts" 
  | "locations" 
  | "omi" 
  | "profile"
  | "conversation"
  | "all";

const DEFAULT_TTL_MS = 60000; // 1 minute default TTL
const MAX_ENTRIES = 100; // Maximum cache entries

class ContextCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    invalidations: 0,
    prefetches: 0,
  };
  private domainKeys: Map<CacheInvalidationDomain, Set<string>> = new Map();

  constructor() {
    // Initialize domain tracking
    const domains: CacheInvalidationDomain[] = [
      "tasks", "calendar", "memory", "grocery", "contacts", 
      "locations", "omi", "profile", "conversation", "all"
    ];
    domains.forEach(d => this.domainKeys.set(d, new Set()));
  }

  /**
   * Get a cached value or compute it if missing/expired
   */
  async getOrCompute<T>(
    key: string,
    compute: () => Promise<T> | T,
    options: {
      ttlMs?: number;
      domain?: CacheInvalidationDomain;
    } = {}
  ): Promise<T> {
    const { ttlMs = DEFAULT_TTL_MS, domain } = options;
    
    const existing = this.cache.get(key);
    const now = Date.now();
    
    if (existing && existing.expiresAt > now) {
      existing.hitCount++;
      this.stats.hits++;
      return existing.data;
    }
    
    this.stats.misses++;
    
    // Compute the value
    const data = await compute();
    
    // Store in cache
    this.set(key, data, ttlMs, domain);
    
    return data;
  }

  /**
   * Set a value in the cache
   */
  set<T>(
    key: string,
    data: T,
    ttlMs: number = DEFAULT_TTL_MS,
    domain?: CacheInvalidationDomain
  ): void {
    const now = Date.now();
    
    // Evict if at capacity
    if (this.cache.size >= MAX_ENTRIES && !this.cache.has(key)) {
      this.evictOldest();
    }
    
    this.cache.set(key, {
      data,
      createdAt: now,
      expiresAt: now + ttlMs,
      hitCount: 0,
    });
    
    // Track domain for invalidation
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
    for (const key of keys) {
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
   * Evict the oldest entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [key, entry] of this.cache) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.domainKeys.forEach(keys => keys.delete(oldestKey!));
      this.stats.evictions++;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { size: number; hitRate: number } {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0,
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
  tasks: 30000,        // 30 seconds - tasks change frequently
  calendar: 60000,     // 1 minute - calendar events are relatively stable
  memory: 120000,      // 2 minutes - memories don't change often
  grocery: 30000,      // 30 seconds - grocery items can change
  contacts: 300000,    // 5 minutes - contacts rarely change
  locations: 60000,    // 1 minute - location data
  omi: 30000,          // 30 seconds - Omi memories update frequently
  profile: 600000,     // 10 minutes - profile rarely changes
  conversation: 10000, // 10 seconds - conversation context is dynamic
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

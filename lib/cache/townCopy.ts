/**
 * Town Copy Cache
 * 
 * LRU cache with version-based invalidation for town-specific copy/content.
 * Provides getTownCopy(town, service) as the main retrieval API.
 * 
 * Features:
 * - LRU eviction when cache exceeds maxSize
 * - Version keys for targeted invalidation
 * - TTL-based expiration
 * - Async content loader support
 */

import { log } from "../../server/logger";

export interface TownCopyConfig {
  maxSize: number;
  defaultTTLMs: number;
}

export interface TownCopyData {
  content: string;
  metadata?: Record<string, unknown>;
}

interface CacheEntry {
  data: TownCopyData;
  version: number;
  createdAt: number;
  expiresAt: number;
  lastAccess: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  invalidations: number;
}

type ContentLoader = (town: string, service: string) => Promise<TownCopyData | null>;

const DEFAULT_CONFIG: TownCopyConfig = {
  maxSize: 100,
  defaultTTLMs: 30 * 60 * 1000, // 30 minutes
};

class TownCopyCache {
  private cache: Map<string, CacheEntry> = new Map();
  private versions: Map<string, number> = new Map();
  private config: TownCopyConfig;
  private stats: CacheStats = { hits: 0, misses: 0, evictions: 0, invalidations: 0 };
  private loader: ContentLoader | null = null;

  constructor(config: Partial<TownCopyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create cache key from town and service
   */
  private createKey(town: string, service: string): string {
    return `${town.toLowerCase()}:${service.toLowerCase()}`;
  }

  /**
   * Get current version for a town/service combination
   */
  private getVersion(town: string, service?: string): number {
    const townKey = town.toLowerCase();
    const fullKey = service ? this.createKey(town, service) : townKey;
    return this.versions.get(fullKey) ?? this.versions.get(townKey) ?? 0;
  }

  /**
   * Increment version to invalidate cache entries
   */
  private incrementVersion(town: string, service?: string): number {
    const key = service ? this.createKey(town, service) : town.toLowerCase();
    const current = this.versions.get(key) ?? 0;
    const newVersion = current + 1;
    this.versions.set(key, newVersion);
    return newVersion;
  }

  /**
   * Evict least recently accessed entries when cache is full
   */
  private evictLRU(): void {
    if (this.cache.size < this.config.maxSize) return;

    // Find entry with oldest lastAccess
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      log(`[TownCopyCache] Evicted LRU entry: ${oldestKey}`, "debug");
    }
  }

  /**
   * Check if entry is expired or version mismatch
   */
  private isValid(entry: CacheEntry, town: string, service: string): boolean {
    const now = Date.now();
    if (now > entry.expiresAt) return false;
    
    const currentVersion = this.getVersion(town, service);
    if (entry.version < currentVersion) return false;
    
    return true;
  }

  /**
   * Register a content loader function
   */
  setLoader(loader: ContentLoader): void {
    this.loader = loader;
  }

  /**
   * Get town copy from cache, loading if necessary
   */
  async getTownCopy(town: string, service: string): Promise<TownCopyData | null> {
    const key = this.createKey(town, service);
    const entry = this.cache.get(key);

    if (entry && this.isValid(entry, town, service)) {
      entry.lastAccess = Date.now();
      this.stats.hits++;
      log(`[TownCopyCache] Cache hit: ${key}`, "debug");
      return entry.data;
    }

    this.stats.misses++;

    // Try to load content
    if (this.loader) {
      try {
        const data = await this.loader(town, service);
        if (data) {
          this.set(town, service, data);
          return data;
        }
      } catch (error) {
        log(`[TownCopyCache] Loader error for ${key}: ${error}`, "error");
      }
    }

    return null;
  }

  /**
   * Directly set cache entry
   */
  set(town: string, service: string, data: TownCopyData, ttlMs?: number): void {
    const key = this.createKey(town, service);
    
    // Only evict if this is a new entry and cache is at capacity
    const isUpdate = this.cache.has(key);
    if (!isUpdate) {
      this.evictLRU();
    }

    const now = Date.now();
    const version = this.getVersion(town, service);

    this.cache.set(key, {
      data,
      version,
      createdAt: now,
      expiresAt: now + (ttlMs ?? this.config.defaultTTLMs),
      lastAccess: now,
    });

    log(`[TownCopyCache] ${isUpdate ? 'Updated' : 'Set'} entry: ${key} (v${version})`, "debug");
  }

  /**
   * Invalidate cache entries for a town (optionally specific service)
   */
  invalidate(town: string, service?: string): void {
    const newVersion = this.incrementVersion(town, service);
    this.stats.invalidations++;

    if (service) {
      const key = this.createKey(town, service);
      this.cache.delete(key);
      log(`[TownCopyCache] Invalidated ${key} -> v${newVersion}`, "info");
    } else {
      // Invalidate all entries for this town
      const townPrefix = town.toLowerCase() + ":";
      const keysToDelete: string[] = [];
      
      for (const key of this.cache.keys()) {
        if (key.startsWith(townPrefix)) {
          keysToDelete.push(key);
        }
      }

      for (const key of keysToDelete) {
        this.cache.delete(key);
      }

      log(`[TownCopyCache] Invalidated all entries for town ${town} (${keysToDelete.length} entries) -> v${newVersion}`, "info");
    }
  }

  /**
   * Invalidate all cache entries
   */
  invalidateAll(): void {
    const count = this.cache.size;
    this.cache.clear();
    this.versions.clear();
    this.stats.invalidations += count;
    log(`[TownCopyCache] Invalidated all ${count} entries`, "info");
  }

  /**
   * Check if entry exists and is valid
   */
  has(town: string, service: string): boolean {
    const key = this.createKey(town, service);
    const entry = this.cache.get(key);
    return entry ? this.isValid(entry, town, service) : false;
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
   * Clear all cache entries (but keep versions)
   */
  clear(): void {
    this.cache.clear();
    log("[TownCopyCache] Cache cleared", "info");
  }

  /**
   * Get all cached entries (for debugging)
   */
  entries(): Array<{ key: string; town: string; service: string; data: TownCopyData; version: number }> {
    const result: Array<{ key: string; town: string; service: string; data: TownCopyData; version: number }> = [];
    
    for (const [key, entry] of this.cache.entries()) {
      const [town, service] = key.split(":");
      if (this.isValid(entry, town, service)) {
        result.push({ key, town, service, data: entry.data, version: entry.version });
      }
    }

    return result;
  }
}

// Singleton instance
export const townCopyCache = new TownCopyCache();

// Convenience exports
export function getTownCopy(town: string, service: string): Promise<TownCopyData | null> {
  return townCopyCache.getTownCopy(town, service);
}

export function setTownCopy(town: string, service: string, data: TownCopyData, ttlMs?: number): void {
  townCopyCache.set(town, service, data, ttlMs);
}

export function invalidateTownCopy(town: string, service?: string): void {
  townCopyCache.invalidate(town, service);
}

export function setTownCopyLoader(loader: ContentLoader): void {
  townCopyCache.setLoader(loader);
}

export function getTownCopyStats(): ReturnType<typeof townCopyCache.getStats> {
  return townCopyCache.getStats();
}

// For testing
export function createTownCopyCache(config?: Partial<TownCopyConfig>): TownCopyCache {
  return new TownCopyCache(config);
}

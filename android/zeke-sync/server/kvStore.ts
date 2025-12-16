/**
 * Replit Key-Value Store Service for ZEKE
 * 
 * Provides persistent, fast caching using Replit's built-in Key-Value Store.
 * This complements the in-memory cache by offering:
 * - Persistence across restarts
 * - Simple key-value operations with typed access
 * - Automatic JSON serialization/deserialization
 * - TTL support via expiry timestamps
 * - Namespaced keys for organization
 * 
 * Use Cases:
 * - Session state persistence
 * - Preference caching
 * - Rate limiting
 * - Cross-restart context preservation
 */

import Database from "@replit/database";
import { log } from "./logger";

const db = new Database();

export type KVNamespace = 
  | "session" 
  | "cache" 
  | "preference" 
  | "ratelimit" 
  | "state"
  | "context"
  | "automation";

interface KVEntry<T> {
  data: T;
  createdAt: number;
  expiresAt: number | null;
  namespace: KVNamespace;
  version: number;
}

interface KVStats {
  gets: number;
  sets: number;
  deletes: number;
  hits: number;
  misses: number;
  expirations: number;
}

const stats: KVStats = {
  gets: 0,
  sets: 0,
  deletes: 0,
  hits: 0,
  misses: 0,
  expirations: 0,
};

const CURRENT_VERSION = 1;

function createKey(namespace: KVNamespace, key: string): string {
  return `${namespace}:${key}`;
}

function parseKey(fullKey: string): { namespace: KVNamespace; key: string } | null {
  const parts = fullKey.split(":");
  if (parts.length < 2) return null;
  return {
    namespace: parts[0] as KVNamespace,
    key: parts.slice(1).join(":"),
  };
}

/**
 * Get a value from the KV Store
 */
export async function kvGet<T>(namespace: KVNamespace, key: string): Promise<T | null> {
  const fullKey = createKey(namespace, key);
  stats.gets++;
  
  try {
    const raw = await db.get(fullKey) as unknown;
    
    if (!raw) {
      stats.misses++;
      return null;
    }
    
    const entry = raw as KVEntry<T>;
    
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      stats.expirations++;
      await db.delete(fullKey);
      return null;
    }
    
    stats.hits++;
    return entry.data;
  } catch (error) {
    log(`[KVStore] Error getting ${fullKey}: ${error}`, "error");
    return null;
  }
}

/**
 * Set a value in the KV Store with optional TTL
 */
export async function kvSet<T>(
  namespace: KVNamespace,
  key: string,
  data: T,
  ttlMs?: number
): Promise<boolean> {
  const fullKey = createKey(namespace, key);
  stats.sets++;
  
  try {
    const entry: KVEntry<T> = {
      data,
      createdAt: Date.now(),
      expiresAt: ttlMs ? Date.now() + ttlMs : null,
      namespace,
      version: CURRENT_VERSION,
    };
    
    await db.set(fullKey, entry);
    return true;
  } catch (error) {
    log(`[KVStore] Error setting ${fullKey}: ${error}`, "error");
    return false;
  }
}

/**
 * Delete a value from the KV Store
 */
export async function kvDelete(namespace: KVNamespace, key: string): Promise<boolean> {
  const fullKey = createKey(namespace, key);
  stats.deletes++;
  
  try {
    await db.delete(fullKey);
    return true;
  } catch (error) {
    log(`[KVStore] Error deleting ${fullKey}: ${error}`, "error");
    return false;
  }
}

/**
 * List all keys in a namespace (with optional prefix filter)
 */
export async function kvList(namespace: KVNamespace, prefix?: string): Promise<string[]> {
  try {
    const fullPrefix = prefix ? createKey(namespace, prefix) : `${namespace}:`;
    const keysResult = await db.list(fullPrefix);
    
    if (!keysResult || typeof keysResult !== 'object') {
      return [];
    }
    
    const keys = Array.isArray(keysResult) ? keysResult : 
      ('value' in keysResult && Array.isArray(keysResult.value)) ? keysResult.value : [];
    
    return keys.map((k: string) => {
      const parsed = parseKey(k);
      return parsed?.key || k;
    });
  } catch (error) {
    log(`[KVStore] Error listing keys in ${namespace}: ${error}`, "error");
    return [];
  }
}

/**
 * Get or compute a value with caching
 */
export async function kvGetOrCompute<T>(
  namespace: KVNamespace,
  key: string,
  compute: () => Promise<T> | T,
  ttlMs?: number
): Promise<T> {
  const existing = await kvGet<T>(namespace, key);
  if (existing !== null) {
    return existing;
  }
  
  const data = await compute();
  await kvSet(namespace, key, data, ttlMs);
  return data;
}

/**
 * Increment a counter (atomic-ish - uses get/set)
 */
export async function kvIncrement(
  namespace: KVNamespace,
  key: string,
  amount: number = 1,
  ttlMs?: number
): Promise<number> {
  const current = await kvGet<number>(namespace, key);
  const newValue = (current || 0) + amount;
  await kvSet(namespace, key, newValue, ttlMs);
  return newValue;
}

/**
 * Clear all keys in a namespace
 */
export async function kvClearNamespace(namespace: KVNamespace): Promise<number> {
  try {
    const keysResult = await db.list(`${namespace}:`);
    const keys = Array.isArray(keysResult) ? keysResult : 
      (keysResult && typeof keysResult === 'object' && 'value' in keysResult && Array.isArray(keysResult.value)) 
        ? keysResult.value : [];
    let count = 0;
    
    for (const key of keys) {
      await db.delete(key);
      count++;
    }
    
    log(`[KVStore] Cleared ${count} keys from namespace: ${namespace}`, "cache");
    return count;
  } catch (error) {
    log(`[KVStore] Error clearing namespace ${namespace}: ${error}`, "error");
    return 0;
  }
}

/**
 * Clean up expired entries across all namespaces
 */
export async function kvCleanupExpired(): Promise<number> {
  try {
    const keysResult = await db.list();
    const allKeys = Array.isArray(keysResult) ? keysResult : 
      (keysResult && typeof keysResult === 'object' && 'value' in keysResult && Array.isArray(keysResult.value)) 
        ? keysResult.value : [];
    let cleaned = 0;
    
    for (const key of allKeys) {
      try {
        const raw = await db.get(key) as unknown;
        if (!raw) continue;
        
        const entry = raw as KVEntry<unknown>;
        if (entry.expiresAt && entry.expiresAt < Date.now()) {
          await db.delete(key);
          cleaned++;
        }
      } catch {
        continue;
      }
    }
    
    if (cleaned > 0) {
      log(`[KVStore] Cleaned up ${cleaned} expired entries`, "cache");
    }
    
    return cleaned;
  } catch (error) {
    log(`[KVStore] Error during cleanup: ${error}`, "error");
    return 0;
  }
}

/**
 * Get KV Store statistics
 */
export function getKVStats(): KVStats & { hitRate: number } {
  const total = stats.hits + stats.misses;
  return {
    ...stats,
    hitRate: total > 0 ? stats.hits / total : 0,
  };
}

/**
 * Reset statistics
 */
export function resetKVStats(): void {
  stats.gets = 0;
  stats.sets = 0;
  stats.deletes = 0;
  stats.hits = 0;
  stats.misses = 0;
  stats.expirations = 0;
}

export const kvStore = {
  get: kvGet,
  set: kvSet,
  delete: kvDelete,
  list: kvList,
  getOrCompute: kvGetOrCompute,
  increment: kvIncrement,
  clearNamespace: kvClearNamespace,
  cleanupExpired: kvCleanupExpired,
  getStats: getKVStats,
  resetStats: resetKVStats,
};

export default kvStore;

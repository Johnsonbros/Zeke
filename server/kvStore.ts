/**
 * Key-Value Store Service for ZEKE
 * 
 * In-memory fallback (non-Replit environment)
 */

import { log } from "./logger";

// In-memory store for non-Replit environments
const memoryStore = new Map<string, unknown>();

const db = {
  async get(key: string) { return memoryStore.get(key); },
  async set(key: string, value: unknown) { memoryStore.set(key, value); },
  async delete(key: string) { memoryStore.delete(key); },
  async list(prefix?: string) { 
    const keys = Array.from(memoryStore.keys());
    return prefix ? keys.filter(k => k.startsWith(prefix)) : keys;
  }
};

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

export async function kvList(namespace: KVNamespace, prefix?: string): Promise<string[]> {
  try {
    const fullPrefix = prefix ? createKey(namespace, prefix) : `${namespace}:`;
    const keys = await db.list(fullPrefix) as string[];
    
    return keys.map((k: string) => {
      const parsed = parseKey(k);
      return parsed?.key || k;
    });
  } catch (error) {
    log(`[KVStore] Error listing keys in ${namespace}: ${error}`, "error");
    return [];
  }
}

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

export async function kvClearNamespace(namespace: KVNamespace): Promise<number> {
  try {
    const keys = await db.list(`${namespace}:`) as string[];
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

export async function kvCleanupExpired(): Promise<number> {
  try {
    const allKeys = await db.list() as string[];
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

export function getKVStats(): KVStats & { hitRate: number } {
  const total = stats.hits + stats.misses;
  return {
    ...stats,
    hitRate: total > 0 ? stats.hits / total : 0,
  };
}

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

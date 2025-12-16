/**
 * Preference Caching Layer using Replit Key-Value Store
 * 
 * Provides fast access to learned preferences that would otherwise require
 * database queries. Caches high-confidence preferences for near-instant
 * retrieval during conversations.
 */

import { kvStore } from "./kvStore";
import { log } from "./logger";

const PREFERENCE_NAMESPACE = "preference";

const TTL = {
  HIGH_CONFIDENCE: 24 * 60 * 60 * 1000,    // 24 hours for high confidence
  MEDIUM_CONFIDENCE: 4 * 60 * 60 * 1000,   // 4 hours for medium confidence
  LOW_CONFIDENCE: 60 * 60 * 1000,          // 1 hour for low confidence
  COMPUTED: 30 * 60 * 1000,                 // 30 minutes for computed preferences
};

export type PreferenceCategory = 
  | "communication" 
  | "scheduling" 
  | "task_management" 
  | "content" 
  | "behavior"
  | "ui"
  | "notification"
  | "general";

export interface CachedPreference {
  key: string;
  value: string;
  category: PreferenceCategory;
  confidence: number;
  source: "learned" | "explicit" | "inferred" | "default";
  cachedAt: number;
  hitCount: number;
}

export interface PreferenceBundle {
  category: PreferenceCategory;
  preferences: CachedPreference[];
  lastUpdated: number;
}

function getTTLForConfidence(confidence: number): number {
  if (confidence >= 0.8) return TTL.HIGH_CONFIDENCE;
  if (confidence >= 0.5) return TTL.MEDIUM_CONFIDENCE;
  return TTL.LOW_CONFIDENCE;
}

export async function cachePreference(preference: Omit<CachedPreference, 'cachedAt' | 'hitCount'>): Promise<boolean> {
  const key = `pref:${preference.category}:${preference.key}`;
  const cached: CachedPreference = {
    ...preference,
    cachedAt: Date.now(),
    hitCount: 0,
  };
  
  const ttl = getTTLForConfidence(preference.confidence);
  return await kvStore.set(PREFERENCE_NAMESPACE, key, cached, ttl);
}

export async function getPreference(category: PreferenceCategory, key: string): Promise<CachedPreference | null> {
  const cacheKey = `pref:${category}:${key}`;
  const cached = await kvStore.get<CachedPreference>(PREFERENCE_NAMESPACE, cacheKey);
  
  if (cached) {
    cached.hitCount++;
    await kvStore.set(PREFERENCE_NAMESPACE, cacheKey, cached, getTTLForConfidence(cached.confidence));
  }
  
  return cached;
}

export async function getPreferencesByCategory(category: PreferenceCategory): Promise<CachedPreference[]> {
  const keys = await kvStore.list(PREFERENCE_NAMESPACE, `pref:${category}:`);
  const preferences: CachedPreference[] = [];
  
  for (const key of keys) {
    const pref = await kvStore.get<CachedPreference>(PREFERENCE_NAMESPACE, key);
    if (pref) {
      preferences.push(pref);
    }
  }
  
  return preferences.sort((a, b) => b.confidence - a.confidence);
}

export async function cachePreferenceBundle(bundle: PreferenceBundle): Promise<boolean> {
  const key = `bundle:${bundle.category}`;
  return await kvStore.set(PREFERENCE_NAMESPACE, key, bundle, TTL.COMPUTED);
}

export async function getPreferenceBundle(category: PreferenceCategory): Promise<PreferenceBundle | null> {
  const key = `bundle:${category}`;
  return await kvStore.get<PreferenceBundle>(PREFERENCE_NAMESPACE, key);
}

export async function getAllHighConfidencePreferences(): Promise<CachedPreference[]> {
  const keys = await kvStore.list(PREFERENCE_NAMESPACE, "pref:");
  const preferences: CachedPreference[] = [];
  
  for (const key of keys) {
    const pref = await kvStore.get<CachedPreference>(PREFERENCE_NAMESPACE, key);
    if (pref && pref.confidence >= 0.8) {
      preferences.push(pref);
    }
  }
  
  return preferences.sort((a, b) => b.confidence - a.confidence);
}

export async function invalidatePreference(category: PreferenceCategory, key: string): Promise<boolean> {
  const cacheKey = `pref:${category}:${key}`;
  return await kvStore.delete(PREFERENCE_NAMESPACE, cacheKey);
}

export async function invalidateCategory(category: PreferenceCategory): Promise<number> {
  const keys = await kvStore.list(PREFERENCE_NAMESPACE, `pref:${category}:`);
  let deleted = 0;
  
  for (const key of keys) {
    const success = await kvStore.delete(PREFERENCE_NAMESPACE, key);
    if (success) deleted++;
  }
  
  await kvStore.delete(PREFERENCE_NAMESPACE, `bundle:${category}`);
  
  log(`[PreferenceCache] Invalidated ${deleted} preferences in category: ${category}`, "cache");
  return deleted;
}

export async function warmPreferenceCache(
  preferences: Array<Omit<CachedPreference, 'cachedAt' | 'hitCount'>>
): Promise<number> {
  let cached = 0;
  
  for (const pref of preferences) {
    const success = await cachePreference(pref);
    if (success) cached++;
  }
  
  log(`[PreferenceCache] Warmed cache with ${cached} preferences`, "cache");
  return cached;
}

export async function getPreferenceCacheStats(): Promise<{
  totalCached: number;
  byCategory: Record<PreferenceCategory, number>;
  avgConfidence: number;
  avgHitCount: number;
}> {
  const keys = await kvStore.list(PREFERENCE_NAMESPACE, "pref:");
  const byCategory: Record<PreferenceCategory, number> = {
    communication: 0,
    scheduling: 0,
    task_management: 0,
    content: 0,
    behavior: 0,
    ui: 0,
    notification: 0,
    general: 0,
  };
  
  let totalConfidence = 0;
  let totalHits = 0;
  let count = 0;
  
  for (const key of keys) {
    const pref = await kvStore.get<CachedPreference>(PREFERENCE_NAMESPACE, key);
    if (pref) {
      byCategory[pref.category]++;
      totalConfidence += pref.confidence;
      totalHits += pref.hitCount;
      count++;
    }
  }
  
  return {
    totalCached: count,
    byCategory,
    avgConfidence: count > 0 ? totalConfidence / count : 0,
    avgHitCount: count > 0 ? totalHits / count : 0,
  };
}

export const preferenceCache = {
  cache: cachePreference,
  get: getPreference,
  getByCategory: getPreferencesByCategory,
  cacheBundle: cachePreferenceBundle,
  getBundle: getPreferenceBundle,
  getHighConfidence: getAllHighConfidencePreferences,
  invalidate: invalidatePreference,
  invalidateCategory,
  warm: warmPreferenceCache,
  getStats: getPreferenceCacheStats,
};

export default preferenceCache;

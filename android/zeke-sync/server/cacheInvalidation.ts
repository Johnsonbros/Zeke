/**
 * Cache Invalidation Integration
 * 
 * Provides hooks to automatically invalidate context cache when data changes.
 * Import and call these functions after CRUD operations to keep cache fresh.
 * 
 * Now integrated with Unified Context Cache for pre-formatted bundle invalidation.
 * All hooks are async to properly handle KV store operations.
 */

import { invalidateCache } from "./contextCache";
import { unifiedContextCache } from "./unifiedContextCache";
import { log } from "./logger";

async function safeInvalidateUnifiedBundle(bundleName: Parameters<typeof unifiedContextCache.invalidateBundle>[0]): Promise<void> {
  try {
    await unifiedContextCache.invalidateBundle(bundleName);
  } catch (error) {
    log(`[CacheInvalidation] Failed to invalidate unified bundle ${bundleName}: ${error}`, "error");
  }
}

export async function onTaskChange(): Promise<void> {
  invalidateCache.tasks();
  await safeInvalidateUnifiedBundle("tasks");
}

export async function onMemoryChange(): Promise<void> {
  invalidateCache.memory();
  await safeInvalidateUnifiedBundle("memory");
}

export async function onGroceryChange(): Promise<void> {
  invalidateCache.grocery();
  await safeInvalidateUnifiedBundle("grocery");
}

export async function onContactChange(): Promise<void> {
  invalidateCache.contacts();
  await safeInvalidateUnifiedBundle("contacts");
}

export async function onCalendarChange(): Promise<void> {
  invalidateCache.calendar();
  await safeInvalidateUnifiedBundle("calendar");
}

export async function onLocationChange(): Promise<void> {
  invalidateCache.locations();
  await safeInvalidateUnifiedBundle("locations");
}

export async function onOmiChange(): Promise<void> {
  invalidateCache.omi();
  await safeInvalidateUnifiedBundle("omi");
}

export async function onProfileChange(): Promise<void> {
  invalidateCache.profile();
  await safeInvalidateUnifiedBundle("profile");
  await safeInvalidateUnifiedBundle("global");
}

export async function onConversationChange(conversationId?: string): Promise<void> {
  invalidateCache.conversation(conversationId);
  await safeInvalidateUnifiedBundle("conversation");
}

export async function onKnowledgeGraphChange(): Promise<void> {
  await safeInvalidateUnifiedBundle("knowledgegraph");
}

export async function onAnyChange(): Promise<void> {
  invalidateCache.all();
  try {
    await unifiedContextCache.invalidateAllBundles();
  } catch (error) {
    log(`[CacheInvalidation] Failed to invalidate all unified bundles: ${error}`, "error");
  }
}

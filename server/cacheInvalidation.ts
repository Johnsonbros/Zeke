/**
 * Cache Invalidation Integration
 * 
 * Provides hooks to automatically invalidate context cache when data changes.
 * Import and call these functions after CRUD operations to keep cache fresh.
 */

import { invalidateCache } from "./contextCache";

export function onTaskChange(): void {
  invalidateCache.tasks();
}

export function onMemoryChange(): void {
  invalidateCache.memory();
}

export function onGroceryChange(): void {
  invalidateCache.grocery();
}

export function onContactChange(): void {
  invalidateCache.contacts();
}

export function onCalendarChange(): void {
  invalidateCache.calendar();
}

export function onLocationChange(): void {
  invalidateCache.locations();
}

export function onLimitlessChange(): void {
  invalidateCache.limitless();
}

export function onProfileChange(): void {
  invalidateCache.profile();
}

export function onConversationChange(conversationId?: string): void {
  invalidateCache.conversation(conversationId);
}

export function onAnyChange(): void {
  invalidateCache.all();
}

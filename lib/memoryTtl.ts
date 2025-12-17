/**
 * Memory TTL (Time-To-Live) Bucket System
 * 
 * Manages automatic expiration of memories based on their scope:
 * - transient: Short-lived context (36 hours default)
 * - session: Medium-term state (7 days default)
 * - long_term: Permanent memories (no expiration)
 */

import type { MemoryScope } from "@shared/schema";

// Default TTL values in seconds
const DEFAULT_TTL = {
  transient: 36 * 60 * 60,    // 36 hours
  session: 7 * 24 * 60 * 60,  // 7 days
  long_term: null,             // Never expires
} as const;

// Environment-configurable TTL (in seconds)
function getTransientTtl(): number {
  return parseInt(process.env.MEM_TTL_TRANSIENT || String(DEFAULT_TTL.transient), 10);
}

function getSessionTtl(): number {
  return parseInt(process.env.MEM_TTL_SESSION || String(DEFAULT_TTL.session), 10);
}

/**
 * Calculate expiration timestamp for a given scope.
 * Returns null for long_term scope (never expires).
 */
export function calculateExpiresAt(scope: MemoryScope): string | null {
  const now = new Date();
  
  switch (scope) {
    case "transient":
      return new Date(now.getTime() + getTransientTtl() * 1000).toISOString();
    case "session":
      return new Date(now.getTime() + getSessionTtl() * 1000).toISOString();
    case "long_term":
    default:
      return null;
  }
}

/**
 * Determine the appropriate scope for a memory based on its content/context.
 * 
 * This heuristic can be enhanced with more sophisticated classification.
 */
export function inferMemoryScope(
  content: string,
  type: string,
  sourceType?: string
): MemoryScope {
  const lowerContent = content.toLowerCase();
  
  // Transient: temporary, current context, in-progress items
  const transientPatterns = [
    /\bcurrently\b/,
    /\bright now\b/,
    /\btoday\b/,
    /\bthis morning\b/,
    /\bthis afternoon\b/,
    /\bthis evening\b/,
    /\bin progress\b/,
    /\btemporary\b/,
    /\bfor now\b/,
  ];
  
  if (transientPatterns.some(p => p.test(lowerContent))) {
    return "transient";
  }
  
  // Session: weekly context, recent events
  const sessionPatterns = [
    /\bthis week\b/,
    /\brecently\b/,
    /\blast few days\b/,
    /\bupcoming\b/,
    /\bsoon\b/,
  ];
  
  if (sessionPatterns.some(p => p.test(lowerContent))) {
    return "session";
  }
  
  // Long-term: preferences, facts, important info
  if (type === "preference" || type === "fact") {
    return "long_term";
  }
  
  // Default to session for summaries, long_term for notes
  if (type === "summary") {
    return "session";
  }
  
  return "long_term";
}

/**
 * TTL configuration info for health/debug endpoints.
 */
export function getTtlConfig(): Record<string, number | null> {
  return {
    transient_seconds: getTransientTtl(),
    session_seconds: getSessionTtl(),
    long_term_seconds: null,
  };
}

/**
 * Check if a memory has expired.
 */
export function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

/**
 * Extend a memory's TTL (refresh expiration).
 * Useful when a memory is accessed/used.
 */
export function extendTtl(scope: MemoryScope): string | null {
  return calculateExpiresAt(scope);
}

/**
 * Promote a memory to a longer-lived scope.
 * Returns the new scope and expiration time.
 */
export function promoteScope(
  currentScope: MemoryScope
): { scope: MemoryScope; expiresAt: string | null } {
  switch (currentScope) {
    case "transient":
      return {
        scope: "session",
        expiresAt: calculateExpiresAt("session"),
      };
    case "session":
      return {
        scope: "long_term",
        expiresAt: null,
      };
    case "long_term":
    default:
      return {
        scope: "long_term",
        expiresAt: null,
      };
  }
}

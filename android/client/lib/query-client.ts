import { QueryClient, QueryFunction } from "@tanstack/react-query";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { Platform } from "react-native";

let cachedDeviceToken: string | null = null;
let cachedProxyOrigin: string | null = null;

export function setDeviceToken(token: string | null): void {
  cachedDeviceToken = token;
}

export function getDeviceToken(): string | null {
  return cachedDeviceToken;
}

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (cachedDeviceToken) {
    headers["X-ZEKE-Device-Token"] = cachedDeviceToken;
  }
  return headers;
}

/**
 * Fetch with timeout (compatible with Expo/React Native which doesn't support AbortSignal.timeout)
 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Extract host from an Expo deep link URL
 * Handles formats like: exps://domain/manifest, exp://domain/manifest
 */
function extractHostFromDeepLink(url: string): string | null {
  // Match exps://host or exp://host patterns
  const match = url.match(/^exps?:\/\/([^\/]+)/);
  if (match && match[1]) {
    const host = match[1];
    // Skip local Expo Go URLs (e.g., exp://192.168.x.x:8081)
    if (host.includes(':8081') || host.startsWith('192.168.') || host.startsWith('10.') || host === 'localhost') {
      return null;
    }
    return `https://${host}`;
  }
  return null;
}

/**
 * Try to verify a proxy origin by fetching runtime-config
 * Returns the verified origin if successful, null otherwise
 */
async function verifyProxyOrigin(candidateUrl: string): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(`${candidateUrl}/api/runtime-config`, 3000);
    if (response.ok) {
      const config = await response.json();
      if (config.proxyOrigin) {
        console.log(`[config] Verified proxy origin: ${config.proxyOrigin}`);
        return config.proxyOrigin;
      }
    }
  } catch (error) {
    console.log(`[config] Verification failed for ${candidateUrl}:`, error);
  }
  return null;
}

/**
 * Extract proxy URL from Expo hostUri or developer host
 * Returns the base URL with port 5000 for the Express server
 */
function extractProxyFromHostUri(hostUri: string | undefined): string | null {
  if (!hostUri) return null;
  
  // hostUri format is typically: "192.168.x.x:8081" or "hostname.replit.dev"
  // We need to convert to https with port 5000 for the Express server
  const parts = hostUri.split(':');
  const host = parts[0];
  
  // Skip local IPs - they won't work for the proxy
  if (host.startsWith('192.168.') || host.startsWith('10.') || host === 'localhost' || host === '127.0.0.1') {
    return null;
  }
  
  // For Replit domains, use HTTPS without explicit port (handled by proxy)
  if (host.includes('replit') || host.includes('kirk.')) {
    return `https://${host}`;
  }
  
  return null;
}

/**
 * Get all candidate proxy origins to try, in order of preference
 */
async function getCandidateOrigins(): Promise<string[]> {
  const candidates: string[] = [];
  
  console.log(`[config] getCandidateOrigins: Platform=${Platform.OS}`);
  
  // Web environment
  if (Platform.OS === 'web' && typeof window !== "undefined" && window.location) {
    // Candidate 1: Env var with :5000 (most likely correct in dev)
    const envDomain = process.env.EXPO_PUBLIC_DOMAIN;
    if (envDomain) {
      candidates.push(`https://${envDomain}`);
    }
    
    // Candidate 2: window.location with port 5000 (for local dev)
    const host = window.location.hostname;
    const protocol = window.location.protocol;
    if (window.location.port) {
      candidates.push(`${protocol}//${host}:5000`);
    }
    
    // Candidate 3: window.location origin as-is (for deployed, might work if same origin)
    candidates.push(window.location.origin);
    
    return candidates;
  }
  
  // Native environment
  console.log(`[config] Native environment detected`);
  
  // Log all available Constants for debugging
  const hostUri = Constants.expoConfig?.hostUri;
  const manifest = Constants.manifest2 || Constants.manifest;
  const developerHost = (manifest as any)?.extra?.expoGo?.developer?.host;
  const debuggerHost = Constants.debuggerHost;
  
  console.log(`[config] Constants.expoConfig.hostUri: ${hostUri || 'null'}`);
  console.log(`[config] manifest.extra.expoGo.developer.host: ${developerHost || 'null'}`);
  console.log(`[config] Constants.debuggerHost: ${debuggerHost || 'null'}`);
  
  // Candidate 1: hostUri from Expo config (works in Replit mobile preview)
  const hostUriProxy = extractProxyFromHostUri(hostUri);
  if (hostUriProxy) {
    console.log(`[config] Adding hostUri candidate: ${hostUriProxy}`);
    candidates.push(hostUriProxy);
  }
  
  // Candidate 2: Developer host from manifest (Expo Go dev mode)
  const devHostProxy = extractProxyFromHostUri(developerHost);
  if (devHostProxy && !candidates.includes(devHostProxy)) {
    console.log(`[config] Adding developerHost candidate: ${devHostProxy}`);
    candidates.push(devHostProxy);
  }
  
  // Candidate 3: debuggerHost (another Expo constant)
  const debuggerProxy = extractProxyFromHostUri(debuggerHost);
  if (debuggerProxy && !candidates.includes(debuggerProxy)) {
    console.log(`[config] Adding debuggerHost candidate: ${debuggerProxy}`);
    candidates.push(debuggerProxy);
  }
  
  // Candidate 4: Deep link URL (for published apps)
  try {
    const initialUrl = await Linking.getInitialURL();
    console.log(`[config] Initial URL: ${initialUrl || 'null'}`);
    if (initialUrl) {
      const origin = extractHostFromDeepLink(initialUrl);
      console.log(`[config] Extracted origin from deep link: ${origin || 'null (filtered/local)'}`);
      if (origin && !candidates.includes(origin)) {
        candidates.push(origin);
      }
    }
  } catch (error) {
    console.log(`[config] Could not get initial URL:`, error);
  }
  
  // Candidate 5: Constants.expoConfig.extra (build-time value)
  const extraDomain = Constants.expoConfig?.extra?.localApiDomain as string | undefined;
  console.log(`[config] expoConfig.extra.localApiDomain: ${extraDomain || 'null'}`);
  if (extraDomain) {
    const url = extraDomain.startsWith('http') ? extraDomain : `https://${extraDomain}`;
    if (!candidates.includes(url)) {
      candidates.push(url);
    }
  }
  
  // Candidate 6: Env var (dev mode - may not work on native)
  const envDomain = process.env.EXPO_PUBLIC_DOMAIN;
  console.log(`[config] EXPO_PUBLIC_DOMAIN env: ${envDomain || 'null'}`);
  if (envDomain) {
    const url = `https://${envDomain}`;
    if (!candidates.includes(url)) {
      candidates.push(url);
    }
  }
  
  console.log(`[config] Native candidates: ${candidates.length > 0 ? candidates.join(', ') : 'NONE'}`);
  
  return candidates;
}

/**
 * Initialize proxy origin by trying multiple candidates until one verifies
 * Call this early in app startup
 */
export async function initializeProxyOrigin(): Promise<void> {
  if (cachedProxyOrigin) return;
  
  const candidates = await getCandidateOrigins();
  console.log(`[config] Proxy origin candidates: ${candidates.join(', ') || 'NONE'}`);
  
  // Try each candidate in order until one verifies
  for (const candidate of candidates) {
    const verifiedOrigin = await verifyProxyOrigin(candidate);
    if (verifiedOrigin) {
      cachedProxyOrigin = verifiedOrigin;
      console.log(`[config] Using verified proxy origin: ${cachedProxyOrigin}`);
      return;
    }
  }
  
  // If no candidate verified, use the first candidate as fallback
  // This ensures we at least try to make requests even if verification failed
  if (candidates.length > 0) {
    cachedProxyOrigin = candidates[0];
    console.log(`[config] Using unverified proxy origin (fallback): ${cachedProxyOrigin}`);
  } else {
    // No candidates at all - this is a critical configuration issue on native
    console.error(`[config] CRITICAL: No proxy origin candidates found!`);
    console.error(`[config] Native apps need localApiDomain in app.config.js or EXPO_PUBLIC_DOMAIN env var.`);
    console.error(`[config] Falling back to main backend - proxy routes will NOT work.`);
    cachedProxyOrigin = "https://zekeai.replit.app";
  }
}

/**
 * Gets the base URL for the Express API server
 * For native/mobile: Uses the same resolution as getLocalApiUrl() to ensure
 * production builds always connect to the deployed server, never localhost.
 * For web: Uses EXPO_PUBLIC_DOMAIN or window.location
 * @returns {string} The API base URL
 */
export function getApiUrl(): string {
  // Native apps must use getLocalApiUrl() which properly resolves production domains
  // This ensures Android builds never fall back to localhost
  return getLocalApiUrl();
}

/**
 * Check if we're in sync mode (connected to external ZEKE backend via proxy)
 * This uses runtime detection based on whether the proxy origin has been verified,
 * rather than a build-time environment variable which isn't available in client bundles.
 */
export function isZekeSyncMode(): boolean {
  return !!cachedProxyOrigin;
}

/**
 * Gets the local backend URL for the Express proxy server
 * Used for integrations (Google Calendar, Twilio) and proxied ZEKE API calls
 * 
 * Resolution order:
 * 1. Cached runtime proxy origin (fetched from /api/runtime-config on startup)
 * 2. window.location.origin (web fallback - always correct)
 * 3. Constants.expoConfig.extra.localApiDomain (baked in at build time)
 * 4. process.env.EXPO_PUBLIC_DOMAIN (fallback for dev)
 * 5. Error fallback to zekeai.replit.app (will fail for proxy routes but logged)
 * 
 * @returns {string} The local API base URL
 */
export function getLocalApiUrl(): string {
  // Priority 1: Use cached runtime origin (most reliable for published apps)
  if (cachedProxyOrigin) {
    return cachedProxyOrigin;
  }
  
  // Priority 2: Web - use env var (includes correct port) or window.location
  if (Platform.OS === 'web' && typeof window !== "undefined" && window.location) {
    const envDomain = process.env.EXPO_PUBLIC_DOMAIN;
    if (envDomain) {
      return `https://${envDomain}`;
    }
    const host = window.location.hostname;
    const protocol = window.location.protocol;
    return window.location.port 
      ? `${protocol}//${host}:5000`  // Local dev - replace port with 5000
      : window.location.origin;       // Deployed - no port change needed
  }
  
  // Priority 3: Try Constants.expoConfig.extra (build-time value)
  const extraDomain = Constants.expoConfig?.extra?.localApiDomain as string | undefined;
  if (extraDomain) {
    return extraDomain.startsWith('http') ? extraDomain : `https://${extraDomain}`;
  }
  
  // Priority 4: Try env var (dev mode)
  const envDomain = process.env.EXPO_PUBLIC_DOMAIN;
  if (envDomain) {
    return `https://${envDomain}`;
  }
  
  // CRITICAL: No local domain available - proxy routes will fail
  console.error("[config] ERROR: No local API domain found! Proxy routes will fail.");
  console.error("[config] Check that app was built with EXPO_PUBLIC_DOMAIN or REPLIT_INTERNAL_APP_DOMAIN set.");
  
  // Return the main backend as last resort (proxy routes will fail, but at least it's logged)
  return "https://zekeai.replit.app";
}

async function throwIfResNotOk(res: Response): Promise<void> {
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";

/**
 * @deprecated Use ZekeApiClient (apiClient.get/post/patch/delete) instead
 *
 * This is the legacy default query function. All new queries should use
 * custom queryFn with ZekeApiClient for centralized retry, timeout, and auth handling.
 *
 * See: client/lib/api-client.ts and client/lib/zeke-api-adapter.ts
 */
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Development-only deprecation warning
    const isDev =
      typeof __DEV__ !== "undefined"
        ? __DEV__
        : process.env.NODE_ENV === "development";
    if (isDev) {
      console.warn(
        `[DEPRECATION] getQueryFn is legacy. Use ZekeApiClient instead.\n` +
          `queryKey: ${queryKey.join("/")}\n` +
          `Replace with: useQuery({ queryKey, queryFn: async () => apiClient.get(...) })`,
      );
    }

    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const res = await fetch(url, {
      credentials: "include",
      headers: getAuthHeaders(),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

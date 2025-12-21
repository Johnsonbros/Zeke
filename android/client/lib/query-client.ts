import { QueryClient, QueryFunction } from "@tanstack/react-query";

let cachedDeviceToken: string | null = null;

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
 * Gets the base URL for the Express API server
 * Uses ZEKE_BACKEND_URL if set (for syncing with main ZEKE deployment)
 * Otherwise falls back to EXPO_PUBLIC_DOMAIN (local backend)
 * @returns {string} The API base URL
 */
export function getApiUrl(): string {
  // TEMPORARY: Force to zekeai.replit.app for config lock testing
  return "https://zekeai.replit.app";
}

/**
 * Check if we're in sync mode (connected to external ZEKE backend)
 */
export function isZekeSyncMode(): boolean {
  return !!process.env.EXPO_PUBLIC_ZEKE_BACKEND_URL;
}

/**
 * Gets the local backend URL (always uses EXPO_PUBLIC_DOMAIN, ignoring external ZEKE URL)
 * Used for integrations that are only available on the local backend (e.g., Google Calendar, Twilio, Auth)
 * @returns {string} The local API base URL
 */
export function getLocalApiUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  
  // Log the configuration for debugging
  console.log(`[config] EXPO_PUBLIC_DOMAIN=${domain || 'NOT SET'}`);
  
  if (domain) {
    const url = `https://${domain}`;
    console.log(`[config] localApiUrl=${url}`);
    return url;
  }
  
  // Fallback for web: use current origin
  if (typeof window !== "undefined" && window.location) {
    console.log(`[config] localApiUrl=${window.location.origin} (web fallback)`);
    return window.location.origin;
  }
  
  // CRITICAL: Never use zekeai.replit.app as fallback for local endpoints
  // The auth endpoints only exist on the mobile app's Express server
  console.error("[config] ERROR: EXPO_PUBLIC_DOMAIN not set! Auth will fail.");
  console.error("[config] This app needs to be rebuilt with the correct domain.");
  
  // Return the main backend as last resort (auth will fail, but at least it's logged)
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

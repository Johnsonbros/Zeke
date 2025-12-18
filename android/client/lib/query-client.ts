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
    headers['X-ZEKE-Device-Token'] = cachedDeviceToken;
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
  // Check for external ZEKE backend URL first (for sync mode)
  const zekeBackendUrl = process.env.EXPO_PUBLIC_ZEKE_BACKEND_URL;
  if (zekeBackendUrl) {
    // Ensure URL has protocol
    if (zekeBackendUrl.startsWith('http')) {
      return zekeBackendUrl.endsWith('/') ? zekeBackendUrl : `${zekeBackendUrl}/`;
    }
    return `https://${zekeBackendUrl}/`;
  }

  // Fall back to local domain
  let host = process.env.EXPO_PUBLIC_DOMAIN;

  if (!host) {
    // Fallback for standalone builds - use the main ZEKE backend
    return 'https://zekeai.replit.app/';
  }

  let url = new URL(`https://${host}`);

  return url.href;
}

/**
 * Check if we're in sync mode (connected to external ZEKE backend)
 */
export function isZekeSyncMode(): boolean {
  return !!process.env.EXPO_PUBLIC_ZEKE_BACKEND_URL;
}

/**
 * Gets the local backend URL (always uses EXPO_PUBLIC_DOMAIN, ignoring external ZEKE URL)
 * Used for integrations that are only available on the local backend (e.g., Google Calendar, Twilio)
 * @returns {string} The local API base URL
 */
export function getLocalApiUrl(): string {
  let host = process.env.EXPO_PUBLIC_DOMAIN;

  if (!host) {
    // Fallback for standalone builds - use the main ZEKE backend
    return 'https://zekeai.replit.app/';
  }

  let url = new URL(`https://${host}`);

  return url.href;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const headers: Record<string, string> = {
    ...getAuthHeaders(),
  };
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
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

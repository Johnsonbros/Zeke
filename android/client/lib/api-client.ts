import { getApiUrl, getLocalApiUrl, getAuthHeaders } from "./query-client";

// Declare __DEV__ for React Native/Expo environments
declare const __DEV__: boolean;

/**
 * Custom API error with detailed context
 */
export class ApiError extends Error {
  status?: number;
  url: string;
  method: string;
  bodyText?: string;
  details?: unknown;

  constructor(
    message: string,
    init: {
      status?: number;
      url: string;
      method: string;
      bodyText?: string;
      details?: unknown;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = init.status;
    this.url = init.url;
    this.method = init.method;
    this.bodyText = init.bodyText;
    this.details = init.details;
  }
}

/**
 * Request configuration options
 */
export type RequestOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  emptyArrayOn404?: boolean;
};

/**
 * Backend ownership documentation:
 *
 * ALL API requests are routed through the LOCAL proxy server to avoid
 * CORS/network issues when mobile devices can't reach the external backend directly.
 *
 * LOCAL API (handled directly by local server):
 * - /api/calendar/*    → Google Calendar integration (events, availability)
 * - /api/twilio/*      → Twilio SMS & call management (conversations, calls)
 * - /api/sms-log       → SMS conversation history
 * - /api/conversations/* → Conversation & message management
 *
 * PROXIED API (routed through local server's /api/zeke/* proxy):
 * - /api/zeke/auth/*   → Device pairing & auth via ZEKE backend
 * - /api/zeke/tasks    → Tasks via ZEKE backend
 * - /api/zeke/grocery  → Grocery via ZEKE backend
 * - /api/zeke/memories → Memories via ZEKE backend
 * - /api/zeke/health   → Health check via ZEKE backend
 * - /api/zeke/dashboard → Dashboard via ZEKE backend
 * - /api/zeke/semantic-search → Vector search via ZEKE backend
 */

const LOCAL_API_PREFIXES = [
  "/api/calendar/",
  "/api/twilio/",
  "/api/sms-log",
  "/api/conversations",
  // REMOVED: "/api/zeke/" - Now handled specially in getBaseUrl()
];

const CORE_API_PREFIXES: string[] = [
  // Note: Most "core" endpoints are now proxied via /api/zeke/* routes
  // Keep this list minimal - only add endpoints that truly need direct access
];

/**
 * Classify endpoint as 'local' or 'core' backend
 * With development safety check to catch routing conflicts
 */
export function classifyEndpoint(endpoint: string): "local" | "core" {
  const isLocal = LOCAL_API_PREFIXES.some((prefix) =>
    endpoint.startsWith(prefix),
  );

  // Development-only safety check: catch ambiguous routing
  const isDev =
    typeof __DEV__ !== "undefined"
      ? __DEV__
      : process.env.NODE_ENV === "development";
  if (isDev) {
    const couldBeCore = CORE_API_PREFIXES.some((prefix) =>
      endpoint.startsWith(prefix),
    );
    if (isLocal && couldBeCore) {
      console.error(
        `[ZekeApiClient] ROUTING CONFLICT: "${endpoint}" matches BOTH local and core prefixes. ` +
          `Endpoints must route to exactly one backend. Fix the prefix definitions. ` +
          `Local: [${LOCAL_API_PREFIXES.join(", ")}] | Core: [${CORE_API_PREFIXES.join(", ")}]`,
      );
    }

    if (
      isLocal &&
      (endpoint.includes("/api/calendar/") ||
        endpoint.includes("/api/twilio/") ||
        endpoint === "/api/sms-log")
    ) {
      console.log(`[ZekeApiClient] Routing ${endpoint} to LOCAL API`);
    }
  }

  return isLocal ? "local" : "core";
}

/**
 * Determines if an endpoint should use local API URL instead of main API URL
 */
function isLocalEndpoint(endpoint: string): boolean {
  return classifyEndpoint(endpoint) === "local";
}

/**
 * Parse response body based on content-type
 */
async function parseResponseBody<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type");

  if (contentType?.includes("application/json")) {
    return await response.json();
  }

  // Non-JSON response with ok status
  const text = await response.text();
  if (text) {
    // Return text as-is for non-JSON types
    return text as unknown as T;
  }

  // Empty response body - return undefined
  return undefined as unknown as T;
}

/**
 * Determine the correct base URL for an endpoint
 * 
 * Routing strategy:
 * - ALL /api/zeke/* routes go through local proxy (including auth)
 *   The local proxy forwards to zekeai.replit.app server-side,
 *   bypassing CORS/network issues on mobile devices
 * - /api/calendar/*, /api/twilio/* → Local proxy (integration endpoints)
 */
function getBaseUrl(endpoint: string): { baseUrl: string; rewrittenPath: string } {
  // ALL /api/zeke/* routes go through local proxy (which forwards to ZEKE backend)
  // This includes auth endpoints - mobile devices can't reach external backend directly
  if (endpoint.startsWith("/api/zeke/")) {
    return {
      baseUrl: getLocalApiUrl(),
      rewrittenPath: endpoint
    };
  }

  // Local API routes (calendar, twilio, etc.)
  const isLocal = isLocalEndpoint(endpoint);
  return {
    baseUrl: isLocal ? getLocalApiUrl() : getApiUrl(),
    rewrittenPath: endpoint
  };
}

/**
 * Centralized API client with singleton pattern
 * Handles:
 * - Timeout management (10s default, 25s for auth via AbortController)
 * - Retry logic with exponential backoff (3 attempts: 1s, 2s, 4s)
 * - Automatic auth header injection
 * - Automatic routing (local vs core API)
 * - Query parameter handling
 * - Proper error reporting via ApiError
 */
class ZekeApiClient {
  private static instance: ZekeApiClient;
  private readonly DEFAULT_TIMEOUT_MS = 10000;
  private readonly AUTH_TIMEOUT_MS = 25000; // Longer timeout for auth operations

  private constructor() {}

  /**
   * Get or create singleton instance
   */
  static getInstance(): ZekeApiClient {
    if (!ZekeApiClient.instance) {
      ZekeApiClient.instance = new ZekeApiClient();
    }
    return ZekeApiClient.instance;
  }

  /**
   * Internal request method with retry, timeout, and auth handling
   */
  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    const {
      timeoutMs = this.DEFAULT_TIMEOUT_MS,
      signal,
      headers: customHeaders = {},
      query,
      emptyArrayOn404,
    } = options;

    // Determine base URL based on endpoint type
    const { baseUrl, rewrittenPath } = getBaseUrl(endpoint);

    // Always log URL for auth endpoints (critical for debugging)
    if (endpoint.startsWith("/api/auth/") || endpoint.startsWith("/api/zeke/auth/")) {
      console.log(`[api] ${method} ${endpoint} → ${baseUrl}${rewrittenPath !== endpoint ? ` (rewritten: ${rewrittenPath})` : ""}`);
    }

    // DEV-only: Log routing decision
    if (
      typeof __DEV__ !== "undefined"
        ? __DEV__
        : process.env.NODE_ENV === "development"
    ) {
      console.log(`[api] ${method} ${endpoint} → ${baseUrl}${rewrittenPath !== endpoint ? ` (rewritten: ${rewrittenPath})` : ""}`);
    }

    // Build URL with query parameters
    const url = new URL(rewrittenPath, baseUrl);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    // Prepare headers: auth + custom headers
    const authHeaders = getAuthHeaders();
    const finalHeaders: Record<string, string> = {
      ...authHeaders,
      ...customHeaders,
    };

    // Add Content-Type for requests with body
    if (body && !finalHeaders["Content-Type"]) {
      finalHeaders["Content-Type"] = "application/json";
    }

    // Create abort controller for timeout if signal not provided
    let controller = signal ? undefined : new AbortController();
    let timeoutId: NodeJS.Timeout | undefined;

    if (!signal && controller) {
      timeoutId = setTimeout(() => {
        if (
          typeof __DEV__ !== "undefined"
            ? __DEV__
            : process.env.NODE_ENV === "development"
        ) {
          console.log(
            `[ZekeApiClient] Timeout (${timeoutMs}ms) for ${method} ${endpoint}`,
          );
        }
        controller!.abort();
      }, timeoutMs);
    }

    const finalSignal = signal || controller?.signal;

    // Retry logic with exponential backoff
    const maxAttempts = 3;
    const retryDelays = [1000, 2000, 4000]; // ms

    let lastError: ApiError | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(url.toString(), {
          method,
          headers: finalHeaders,
          signal: finalSignal,
          body: body ? JSON.stringify(body) : undefined,
          credentials: "include",
        });

        // Clear timeout on success
        if (timeoutId) clearTimeout(timeoutId);

        // Handle 404 with emptyArrayOn404 fallback
        if (response.status === 404 && emptyArrayOn404) {
          if (
            typeof __DEV__ !== "undefined"
              ? __DEV__
              : process.env.NODE_ENV === "development"
          ) {
            console.log(
              `[ZekeApiClient] ${method} ${endpoint} - 404, returning empty array`,
            );
          }
          return [] as unknown as T;
        }

        // Handle non-ok responses
        if (!response.ok) {
          const bodyText = await response.text();
          const errorMsg = `${response.status} ${response.statusText}`;

          // Only retry on specific status codes
          const retryableStatuses = [408, 429, 500, 502, 503, 504];
          if (
            retryableStatuses.includes(response.status) &&
            attempt < maxAttempts - 1
          ) {
            if (
              typeof __DEV__ !== "undefined"
                ? __DEV__
                : process.env.NODE_ENV === "development"
            ) {
              console.log(
                `[ZekeApiClient] Retrying ${method} ${endpoint} (attempt ${attempt + 1}/${maxAttempts}) - got status ${response.status}`,
              );
            }
            await new Promise((resolve) =>
              setTimeout(resolve, retryDelays[attempt]),
            );
            continue;
          }

          // Create ApiError for non-retryable failures
          lastError = new ApiError(errorMsg, {
            status: response.status,
            url: url.toString(),
            method,
            bodyText,
          });

          throw lastError;
        }

        // Parse response
        const data = await parseResponseBody<T>(response);

        if (
          typeof __DEV__ !== "undefined"
            ? __DEV__
            : process.env.NODE_ENV === "development"
        ) {
          console.log(
            `[ZekeApiClient] ${method} ${endpoint} (${attempt + 1}/${maxAttempts}) - OK`,
          );
        }

        return data;
      } catch (error) {
        // If already an ApiError, keep it
        if (error instanceof ApiError) {
          lastError = error;
          throw lastError;
        }

        // Check for abort/timeout errors specifically
        const isAbortError =
          error instanceof Error &&
          (error.name === "AbortError" ||
            error.message === "Aborted" ||
            error.message.includes("abort"));

        // Provide clearer error message for timeouts
        let message: string;
        if (isAbortError) {
          message = `Connection timed out after ${timeoutMs / 1000} seconds. Please check your network connection.`;
        } else {
          message = error instanceof Error ? error.message : String(error);
        }

        lastError = new ApiError(message, {
          url: url.toString(),
          method,
          bodyText: error instanceof Error ? error.message : undefined,
        });

        // Don't retry abort errors - they're timeouts
        if (isAbortError) {
          throw lastError;
        }

        // Check if this is a network error or retryable status
        const isNetworkError =
          error instanceof TypeError && error.message.includes("fetch");
        const shouldRetry = isNetworkError && attempt < maxAttempts - 1;

        if (shouldRetry) {
          if (
            typeof __DEV__ !== "undefined"
              ? __DEV__
              : process.env.NODE_ENV === "development"
          ) {
            console.log(
              `[ZekeApiClient] Network error, retrying ${method} ${endpoint} (attempt ${attempt + 1}/${maxAttempts})`,
            );
          }
          await new Promise((resolve) =>
            setTimeout(resolve, retryDelays[attempt]),
          );
          continue;
        }

        // Don't retry further
        throw lastError;
      }
    }

    // Clear timeout on final error
    if (timeoutId) clearTimeout(timeoutId);

    if (
      typeof __DEV__ !== "undefined"
        ? __DEV__
        : process.env.NODE_ENV === "development"
    ) {
      console.log(
        `[ZekeApiClient] ${method} ${endpoint} - FAILED after ${maxAttempts} attempts`,
      );
    }

    throw (
      lastError ||
      new ApiError(`Failed to ${method} ${endpoint}`, {
        url: url.toString(),
        method,
      })
    );
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("GET", endpoint, undefined, options);
  }

  /**
   * POST request
   */
  async post<T>(
    endpoint: string,
    data: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    return this.request<T>("POST", endpoint, data, options);
  }

  /**
   * PATCH request
   */
  async patch<T>(
    endpoint: string,
    data: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    return this.request<T>("PATCH", endpoint, data, options);
  }

  /**
   * DELETE request (returns void)
   */
  async delete(endpoint: string, options?: RequestOptions): Promise<void> {
    await this.request<void>("DELETE", endpoint, undefined, options);
  }

  /**
   * GET request for auth operations (with longer timeout)
   */
  async authGet<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("GET", endpoint, undefined, {
      ...options,
      timeoutMs: options?.timeoutMs ?? this.AUTH_TIMEOUT_MS,
    });
  }

  /**
   * POST request for auth operations (with longer timeout)
   */
  async authPost<T>(
    endpoint: string,
    data: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    return this.request<T>("POST", endpoint, data, {
      ...options,
      timeoutMs: options?.timeoutMs ?? this.AUTH_TIMEOUT_MS,
    });
  }
}

/**
 * Export singleton instance for convenient access
 */
export const apiClient = ZekeApiClient.getInstance();

/**
 * Re-export for direct class access if needed
 */
export default ZekeApiClient;

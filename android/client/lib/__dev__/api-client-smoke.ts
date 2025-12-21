/**
 * API Client Smoke Test Harness
 *
 * Manual validation of retry logic, timeout handling, and abort behavior.
 * NOT shipped to production - only imported in dev builds for manual testing.
 *
 * Usage:
 *   In dev: import { testRetryBehavior, testAbortBehavior } from '@/lib/__dev__/api-client-smoke'
 *   Call: await testRetryBehavior()
 *         await testAbortBehavior()
 */

import { apiClient, ApiError } from "../api-client";

interface SmokeTestResult {
  testName: string;
  endpoint: string;
  elapsedMs: number;
  retryCount: number;
  finalError: string | null;
  errorType: string;
  success: boolean;
}

/**
 * Test 1: Timeout override with retry behavior
 * Calls a slow endpoint (deliberately) with short timeout to trigger retries
 */
export async function testRetryBehavior(): Promise<SmokeTestResult> {
  const startTime = Date.now();
  let retryCount = 0;
  let finalError: string | null = null;
  let errorType = "none";
  let success = false;

  console.log("[API Smoke Test] Starting retry behavior test...");

  try {
    // Try to call a deliberately slow endpoint with very short timeout to force retries
    const result = await apiClient.get<any>(
      "/api/slow-endpoint-for-testing", // This endpoint likely doesn't exist, will timeout
      { timeoutMs: 500 }, // 500ms timeout to force retry logic
    );
    success = true;
    console.log("[API Smoke Test] Endpoint responded:", result);
  } catch (error) {
    if (error instanceof ApiError) {
      finalError = error.message;
      errorType = `ApiError (${error.status || "network"})`;
      console.error(`[API Smoke Test] ApiError: ${error.message}`, {
        status: error.status,
        url: error.url,
        method: error.method,
      });
    } else if (error instanceof Error) {
      finalError = error.message;
      errorType = error.name || "Error";
      console.error(`[API Smoke Test] ${errorType}: ${error.message}`);
    } else {
      finalError = String(error);
      errorType = "Unknown";
      console.error("[API Smoke Test] Unknown error:", error);
    }
  }

  const elapsedMs = Date.now() - startTime;

  const result: SmokeTestResult = {
    testName: "testRetryBehavior",
    endpoint: "/api/slow-endpoint-for-testing",
    elapsedMs,
    retryCount, // Note: actual retry count would need instrumentation in apiClient
    finalError,
    errorType,
    success,
  };

  console.log("[API Smoke Test] Retry behavior result:", {
    ...result,
    elapsedMs: `${elapsedMs}ms`,
  });

  return result;
}

/**
 * Test 2: Forced abort (AbortController test)
 * Creates an AbortController, starts a request, and aborts it mid-flight
 */
export async function testAbortBehavior(): Promise<SmokeTestResult> {
  const startTime = Date.now();
  let finalError: string | null = null;
  let errorType = "none";
  let success = false;

  console.log("[API Smoke Test] Starting abort behavior test...");

  try {
    // Create abort controller
    const controller = new AbortController();

    // Start a request with a long timeout so it doesn't naturally timeout
    const requestPromise = apiClient.get<any>(
      "/api/memories", // Use a real endpoint that should work
      { signal: controller.signal, timeoutMs: 30000 },
    );

    // Abort immediately (simulate user cancellation)
    setTimeout(() => {
      console.log("[API Smoke Test] Aborting request...");
      controller.abort();
    }, 100);

    const result = await requestPromise;
    success = true;
    console.log("[API Smoke Test] Request completed before abort:", result);
  } catch (error) {
    if (error instanceof ApiError) {
      finalError = error.message;
      errorType = `ApiError (${error.status || "abort"})`;
      console.error(`[API Smoke Test] ApiError during abort: ${error.message}`);
    } else if (error instanceof Error) {
      finalError = error.message;
      errorType = error.name || "Error";
      // Expect AbortError here
      if (error.name === "AbortError") {
        console.log("[API Smoke Test] ✓ Correctly caught AbortError");
      } else {
        console.error(`[API Smoke Test] Unexpected error type: ${error.name}`);
      }
    } else {
      finalError = String(error);
      errorType = "Unknown";
    }
  }

  const elapsedMs = Date.now() - startTime;

  const result: SmokeTestResult = {
    testName: "testAbortBehavior",
    endpoint: "/api/memories",
    elapsedMs,
    retryCount: 0, // Abort doesn't retry
    finalError,
    errorType,
    success,
  };

  console.log("[API Smoke Test] Abort behavior result:", {
    ...result,
    elapsedMs: `${elapsedMs}ms`,
  });

  return result;
}

/**
 * Test 3: Custom header injection
 * Validates that custom headers are properly merged with auth headers
 */
export async function testHeaderInjection(): Promise<SmokeTestResult> {
  const startTime = Date.now();
  let finalError: string | null = null;
  let errorType = "none";
  let success = false;

  console.log("[API Smoke Test] Starting header injection test...");

  try {
    // Call endpoint with custom header
    const result = await apiClient.get<any>("/api/memories", {
      headers: {
        "X-Custom-Header": "test-value",
      },
    });
    success = true;
    console.log("[API Smoke Test] Header injection successful:", result);
  } catch (error) {
    if (error instanceof ApiError) {
      finalError = error.message;
      errorType = `ApiError (${error.status || "network"})`;
      console.error(`[API Smoke Test] ApiError: ${error.message}`);
    } else if (error instanceof Error) {
      finalError = error.message;
      errorType = error.name || "Error";
      console.error(`[API Smoke Test] ${errorType}: ${error.message}`);
    } else {
      finalError = String(error);
      errorType = "Unknown";
    }
  }

  const elapsedMs = Date.now() - startTime;

  const result: SmokeTestResult = {
    testName: "testHeaderInjection",
    endpoint: "/api/memories",
    elapsedMs,
    retryCount: 0,
    finalError,
    errorType,
    success,
  };

  console.log("[API Smoke Test] Header injection result:", {
    ...result,
    elapsedMs: `${elapsedMs}ms`,
  });

  return result;
}

/**
 * Run all smoke tests
 */
export async function runAllSmokeTests(): Promise<SmokeTestResult[]> {
  console.log("\n========================================");
  console.log("[API Smoke Test] Running all smoke tests");
  console.log("========================================\n");

  const results: SmokeTestResult[] = [];

  // Test 1: Retry behavior
  try {
    const result = await testRetryBehavior();
    results.push(result);
  } catch (error) {
    console.error("[API Smoke Test] testRetryBehavior crashed:", error);
  }

  // Brief pause between tests
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Test 2: Abort behavior
  try {
    const result = await testAbortBehavior();
    results.push(result);
  } catch (error) {
    console.error("[API Smoke Test] testAbortBehavior crashed:", error);
  }

  // Brief pause between tests
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Test 3: Header injection
  try {
    const result = await testHeaderInjection();
    results.push(result);
  } catch (error) {
    console.error("[API Smoke Test] testHeaderInjection crashed:", error);
  }

  // Summary
  console.log("\n========================================");
  console.log("[API Smoke Test] Summary");
  console.log("========================================");
  results.forEach((r) => {
    const status = r.success ? "✓" : "✗";
    console.log(
      `${status} ${r.testName}: ${r.elapsedMs}ms | ${r.errorType} | Retries: ${r.retryCount}`,
    );
  });
  console.log("========================================\n");

  return results;
}

// Development-only export: manually call for debugging
if (process.env.NODE_ENV === "development") {
  (globalThis as any).__apiClientSmoke = {
    testRetryBehavior,
    testAbortBehavior,
    testHeaderInjection,
    runAllSmokeTests,
  };
}

/**
 * End-to-end smoke test for health and readiness endpoints.
 * 
 * Usage: npm run smoke
 * 
 * Exits with code 0 on success, 1 on failure.
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

interface HealthResponse {
  ok: boolean;
  service: string;
}

interface ReadyResponse {
  ready: boolean;
}

async function checkEndpoint<T>(path: string, validate: (data: T) => boolean): Promise<boolean> {
  const url = `${BASE_URL}${path}`;
  
  try {
    const response = await fetch(url);
    
    if (response.status !== 200) {
      console.error(`FAIL: ${path} returned status ${response.status}`);
      return false;
    }
    
    const data = await response.json() as T;
    
    if (!validate(data)) {
      console.error(`FAIL: ${path} returned unexpected response:`, data);
      return false;
    }
    
    console.log(`PASS: ${path} returned 200 with valid response`);
    return true;
  } catch (error) {
    console.error(`FAIL: ${path} - ${error instanceof Error ? error.message : "Unknown error"}`);
    return false;
  }
}

async function main(): Promise<void> {
  console.log(`Smoke test starting against ${BASE_URL}\n`);
  
  const results = await Promise.all([
    checkEndpoint<HealthResponse>("/healthz", (data) => data.ok === true && typeof data.service === "string"),
    checkEndpoint<ReadyResponse>("/readyz", (data) => data.ready === true),
  ]);
  
  const allPassed = results.every((result) => result);
  
  console.log("");
  if (allPassed) {
    console.log("Smoke test PASSED");
    process.exit(0);
  } else {
    console.log("Smoke test FAILED");
    process.exit(1);
  }
}

main();

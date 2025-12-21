#!/usr/bin/env npx tsx
/**
 * STT Pipeline Test Harness
 * 
 * Dev-only test script to verify the real-time audio ingestion pipeline.
 * 
 * Tests:
 * 1. WebSocket connection with device token auth
 * 2. Session start/end protocol
 * 3. Deepgram connection establishment
 * 4. Transcript segment events
 * 5. Database persistence
 * 
 * Usage:
 *   npx tsx script/test-stt-pipeline.ts
 * 
 * Requirements:
 *   - DEEPGRAM_API_KEY must be set
 *   - Server must be running on localhost:5000
 *   - A valid device token must exist in the database
 */

import WebSocket from "ws";
import { getSttSession, getSttSegmentsBySession, createDeviceToken } from "../server/db";

const SERVER_URL = process.env.SERVER_URL || "ws://localhost:5000";
const TEST_DEVICE_TOKEN = process.env.TEST_DEVICE_TOKEN;

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration?: number;
}

const results: TestResult[] = [];

function log(message: string): void {
  console.log(`[STT Test] ${message}`);
}

function logResult(result: TestResult): void {
  const status = result.passed ? "PASS" : "FAIL";
  const duration = result.duration ? ` (${result.duration}ms)` : "";
  console.log(`  [${status}] ${result.name}: ${result.message}${duration}`);
  results.push(result);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testSttStatus(): Promise<void> {
  log("Testing STT status endpoint...");
  const startTime = Date.now();
  
  try {
    const response = await fetch(`http://localhost:5000/api/stt/status`);
    const data = await response.json();
    
    logResult({
      name: "STT Status Endpoint",
      passed: response.ok && data.wsEndpoint === "/ws/audio",
      message: `configured=${data.configured}, endpoint=${data.wsEndpoint}`,
      duration: Date.now() - startTime,
    });
    
    if (!data.configured) {
      log("WARNING: DEEPGRAM_API_KEY not configured. Some tests will fail.");
    }
  } catch (error: any) {
    logResult({
      name: "STT Status Endpoint",
      passed: false,
      message: `Error: ${error.message}`,
      duration: Date.now() - startTime,
    });
  }
}

async function testWebSocketConnection(deviceToken: string): Promise<{ ws: WebSocket | null; sessionId: string | null }> {
  log("Testing WebSocket connection with auth...");
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(`${SERVER_URL}/ws/audio`, {
        headers: {
          "X-ZEKE-Device-Token": deviceToken,
        },
      });

      let sessionId: string | null = null;

      ws.on("open", () => {
        logResult({
          name: "WebSocket Connection",
          passed: true,
          message: "Connected successfully",
          duration: Date.now() - startTime,
        });

        ws.send(JSON.stringify({
          type: "start_session",
          codec: "opus",
          sample_rate_hint: 16000,
          frame_format: "raw_opus_packets",
          device_id: "test-device",
        }));
      });

      ws.on("message", (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.type === "session_started") {
            sessionId = message.session_id;
            logResult({
              name: "Session Start",
              passed: true,
              message: `session_id=${sessionId}, deepgram_connected=${message.deepgram_connected}`,
              duration: Date.now() - startTime,
            });
            
            resolve({ ws, sessionId });
          }

          if (message.type === "error") {
            logResult({
              name: "Session Start",
              passed: false,
              message: `Error: ${message.message}`,
              duration: Date.now() - startTime,
            });
            ws.close();
            resolve({ ws: null, sessionId: null });
          }

          if (message.type === "transcript_segment") {
            log(`Received transcript: "${message.text}" (speaker: ${message.speaker}, final: ${message.isFinal})`);
          }
        } catch (e) {
          log(`Failed to parse message: ${data.toString()}`);
        }
      });

      ws.on("error", (error: Error) => {
        logResult({
          name: "WebSocket Connection",
          passed: false,
          message: `Error: ${error.message}`,
          duration: Date.now() - startTime,
        });
        resolve({ ws: null, sessionId: null });
      });

      ws.on("close", (code, reason) => {
        log(`WebSocket closed: ${code} - ${reason.toString()}`);
      });

      setTimeout(() => {
        if (!sessionId) {
          logResult({
            name: "Session Start",
            passed: false,
            message: "Timeout waiting for session_started",
            duration: Date.now() - startTime,
          });
          ws.close();
          resolve({ ws: null, sessionId: null });
        }
      }, 10000);

    } catch (error: any) {
      logResult({
        name: "WebSocket Connection",
        passed: false,
        message: `Error: ${error.message}`,
        duration: Date.now() - startTime,
      });
      resolve({ ws: null, sessionId: null });
    }
  });
}

async function testUnauthorizedConnection(): Promise<void> {
  log("Testing unauthorized connection rejection...");
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(`${SERVER_URL}/ws/audio`);

      ws.on("open", () => {
        logResult({
          name: "Unauthorized Rejection",
          passed: false,
          message: "Connection should have been rejected",
          duration: Date.now() - startTime,
        });
        ws.close();
        resolve();
      });

      ws.on("error", (error: Error) => {
        logResult({
          name: "Unauthorized Rejection",
          passed: true,
          message: "Connection rejected as expected",
          duration: Date.now() - startTime,
        });
        resolve();
      });

      setTimeout(() => {
        resolve();
      }, 3000);

    } catch (error: any) {
      logResult({
        name: "Unauthorized Rejection",
        passed: true,
        message: "Connection rejected",
        duration: Date.now() - startTime,
      });
      resolve();
    }
  });
}

async function testSessionEnd(ws: WebSocket, sessionId: string): Promise<void> {
  log("Testing session end...");
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    ws.send(JSON.stringify({ type: "end_session" }));

    ws.on("message", (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === "session_ended") {
          logResult({
            name: "Session End",
            passed: message.session_id === sessionId,
            message: `session_id=${message.session_id}`,
            duration: Date.now() - startTime,
          });
          ws.close();
          resolve();
        }
      } catch (e) {
      }
    });

    setTimeout(() => {
      logResult({
        name: "Session End",
        passed: false,
        message: "Timeout waiting for session_ended",
        duration: Date.now() - startTime,
      });
      ws.close();
      resolve();
    }, 5000);
  });
}

async function testDatabasePersistence(sessionId: string): Promise<void> {
  log("Testing database persistence...");
  const startTime = Date.now();
  
  try {
    const session = getSttSession(sessionId);
    
    logResult({
      name: "Session DB Persistence",
      passed: !!session,
      message: session 
        ? `Found session: codec=${session.codec}, provider=${session.provider}, ended=${!!session.endedAt}`
        : "Session not found in database",
      duration: Date.now() - startTime,
    });

    const segments = getSttSegmentsBySession(sessionId);
    
    logResult({
      name: "Segments DB Query",
      passed: true,
      message: `Found ${segments.length} segments`,
      duration: Date.now() - startTime,
    });

  } catch (error: any) {
    logResult({
      name: "Database Persistence",
      passed: false,
      message: `Error: ${error.message}`,
      duration: Date.now() - startTime,
    });
  }
}

async function getOrCreateTestToken(): Promise<string | null> {
  if (TEST_DEVICE_TOKEN) {
    return TEST_DEVICE_TOKEN;
  }

  log("No TEST_DEVICE_TOKEN provided. Creating temporary test token...");
  
  try {
    const crypto = await import("crypto");
    const token = crypto.randomBytes(32).toString("hex");
    const deviceId = `test-device-${Date.now()}`;
    
    createDeviceToken({
      token,
      deviceId,
      deviceName: "STT Test Device",
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    });
    
    log(`Created test device token for device: ${deviceId}`);
    return token;
  } catch (error: any) {
    log(`Failed to create test token: ${error.message}`);
    return null;
  }
}

async function main(): Promise<void> {
  console.log("\n=================================================");
  console.log("  ZEKE STT Pipeline Test Harness");
  console.log("=================================================\n");

  await testSttStatus();
  await testUnauthorizedConnection();

  const deviceToken = await getOrCreateTestToken();
  
  if (!deviceToken) {
    log("Cannot proceed without a device token");
    process.exit(1);
  }

  const { ws, sessionId } = await testWebSocketConnection(deviceToken);

  if (ws && sessionId) {
    log("Waiting 2 seconds for any Deepgram responses...");
    await sleep(2000);

    await testSessionEnd(ws, sessionId);

    await sleep(500);
    await testDatabasePersistence(sessionId);
  }

  console.log("\n=================================================");
  console.log("  Test Summary");
  console.log("=================================================");
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`\n  Total: ${results.length}, Passed: ${passed}, Failed: ${failed}\n`);

  if (failed > 0) {
    console.log("  Failed tests:");
    results.filter(r => !r.passed).forEach(r => {
      console.log(`    - ${r.name}: ${r.message}`);
    });
  }

  console.log("\n=================================================\n");
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Test harness error:", error);
  process.exit(1);
});

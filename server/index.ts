import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
// Force rebuild: 2025-12-23 - Twilio auth token removed for webhook testing
import { serveStatic } from "./static";
import { createServer } from "http";
import { startPythonAgents, waitForPythonAgents } from "./python-agents";
import { log } from "./logger";
import { initializeGroceryAutoClear } from "./jobs/groceryAutoClear";
import { initializeConversationSummarizer } from "./jobs/conversationSummarizer";
import { startDailySummaryScheduler } from "./jobs/dailySummaryAgent";
import { startNightlyEnrichmentScheduler } from "./jobs/nightlyEnrichment";
import { initializeVoicePipeline, startVoicePipeline, isVoicePipelineAvailable } from "./voice";
import { initializeOmiDigest } from "./omiDigest";
import { initializeOmiProcessor, startOmiProcessor } from "./jobs/omiProcessor";
import { initializeMorningBriefingScheduler } from "./jobs/morningBriefingScheduler";
import { initializePredictionScheduler } from "./predictionScheduler";
import { startKVMaintenance } from "./kvIndex";
import { startKnowledgeGraphBackfillScheduler } from "./jobs/knowledgeGraphBackfill";
import { renderDocs } from "./docs";
import { registerOpenApiRoute } from "./openapi";
import { initializeLocationCheckIn, startLocationCheckInMonitor } from "./locationCheckInMonitor";
import { initializeDailyCheckIn } from "./dailyCheckIn";
import { initializeBatchScheduler } from "./notificationBatcher";
import { initializeAutomations } from "./automations";
import { initializeNLAutomations } from "./nlAutomationExecutor";
import { startContextAgent } from "./zekeContextAgent";
import { startPeopleProcessor } from "./peopleProcessor";
import { startPendantHealthMonitor, setMorningBriefingCallback } from "./pendantHealthMonitor";
import { sendWakeTriggeredBriefing } from "./morningBriefingService";
import { startNewsScheduler, setSendSmsCallback as setNewsSmsCallback } from "./services/newsService";
import { startMorningBriefingScheduler, setSendSmsCallback as setBriefingSmsCallback } from "./services/morningBriefingScheduler";
import "./apiUsageLogger"; // Initialize unified API usage tracking

export { log };

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Raw body parser for audio streaming endpoints (must be before JSON parser)
app.use('/api/omi/audio-bytes', express.raw({ 
  type: 'application/octet-stream',
  limit: '10mb' 
}));

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Health and readiness endpoints (no auth, no logging, crash-resistant)
app.get("/healthz", (_req, res) => {
  try {
    res.json({ ok: true, service: process.env.APP_NAME || "zeke" });
  } catch {
    res.json({ ok: true, service: "zeke" });
  }
});

app.get("/readyz", async (_req, res) => {
  try {
    const { dbReady } = await import("./src/db/health");
    const dbOk = dbReady();
    if (dbOk) {
      res.json({ ready: true, db: "ok" });
    } else {
      res.status(503).json({ ready: false, db: "unavailable" });
    }
  } catch (error) {
    res.status(503).json({ ready: false, error: "health check failed" });
  }
});

// Internal documentation endpoint (no auth required)
app.get("/docs", (_req, res) => {
  try {
    const html = renderDocs();
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch {
    res.status(500).send("Failed to render documentation");
  }
});

registerOpenApiRoute(app);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  startPythonAgents();
  
  const pythonReady = await waitForPythonAgents(15000);
  if (pythonReady) {
    log("Python agents service ready", "startup");
  } else {
    log("Python agents service not available, will use fallback", "startup");
  }
  
  await registerRoutes(httpServer, app);
  
  initializeGroceryAutoClear();
  initializeConversationSummarizer();
  
  // Initialize daily journal summary scheduler (runs at 11 PM)
  startDailySummaryScheduler({ enabled: true });
  log("Daily journal summary scheduler initialized", "startup");
  
  // Initialize nightly enrichment batch scheduler (runs at 3 AM, polls every 2 hours)
  startNightlyEnrichmentScheduler({ enabled: true });
  log("Nightly enrichment batch scheduler initialized", "startup");
  
  // Initialize batch job orchestrator (nightly at 3 AM, midday at 12 PM)
  const { startOrchestrator } = await import("./services/batchJobOrchestrator");
  startOrchestrator();
  log("Batch job orchestrator initialized (nightly 3am, midday 12pm)", "startup");
  
  // Initialize and auto-start voice pipeline if API keys are configured
  if (isVoicePipelineAvailable()) {
    const voiceInitialized = initializeVoicePipeline();
    if (voiceInitialized) {
      log("Voice pipeline initialized", "startup");
      const voiceStarted = startVoicePipeline();
      if (voiceStarted) {
        log("Voice pipeline auto-started and listening for commands", "startup");
      } else {
        log("Voice pipeline initialized but failed to auto-start", "startup");
      }
    }
  }
  
  // Initialize Omi enhanced features (daily digest + processor)
  initializeOmiDigest();
  initializeOmiProcessor();
  initializeMorningBriefingScheduler();
  log("Omi enhanced features initialized", "startup");

  // Initialize prediction scheduler (pattern discovery, anomaly detection, prediction generation)
  initializePredictionScheduler();
  log("Prediction scheduler initialized", "startup");
  
  // Initialize Knowledge Graph Backfill scheduler (runs nightly at 2 AM)
  startKnowledgeGraphBackfillScheduler();
  log("Knowledge Graph backfill scheduler initialized", "startup");
  
  // Initialize Key-Value Store maintenance (periodic cleanup of expired entries)
  startKVMaintenance(5 * 60 * 1000); // Run cleanup every 5 minutes
  log("KV Store maintenance initialized", "startup");
  
  // Initialize notification batcher (callbacks are set in routes.ts)
  initializeBatchScheduler();
  log("Notification batcher initialized", "startup");
  
  // Initialize automations system
  initializeAutomations();
  initializeNLAutomations();
  log("Automations system initialized", "startup");
  
  // Initialize location check-in monitor (requires OPENAI_API_KEY and Twilio)
  if (process.env.OPENAI_API_KEY && process.env.TWILIO_ACCOUNT_SID) {
    initializeLocationCheckIn();
    startLocationCheckInMonitor();
    log("Location check-in monitor initialized and started", "startup");
  } else {
    log("Location check-in monitor skipped - missing OPENAI_API_KEY or TWILIO config", "startup");
  }
  
  // Initialize daily check-in (requires OPENAI_API_KEY and Twilio)
  if (process.env.OPENAI_API_KEY && process.env.TWILIO_ACCOUNT_SID) {
    await initializeDailyCheckIn();
    log("Daily check-in initialized", "startup");
  } else {
    log("Daily check-in skipped - missing OPENAI_API_KEY or TWILIO config", "startup");
  }
  
  // Start ZEKE context agent (scans lifelogs for wake word commands)
  if (isVoicePipelineAvailable()) {
    startContextAgent();
    log("ZEKE context agent started", "startup");
  }
  
  // Start people processor (extracts contact info from Omi memories)
  if (isVoicePipelineAvailable()) {
    startPeopleProcessor();
    log("People processor started", "startup");
  }
  
  // Start Omi processor (processes memories for meetings/action items)
  if (isVoicePipelineAvailable()) {
    startOmiProcessor();
    log("Omi processor started", "startup");
  }
  
  // Start pendant health monitor (alerts if audio stops coming from Omi pendant)
  if (isVoicePipelineAvailable()) {
    // Register morning briefing callback for wake detection
    setMorningBriefingCallback(async () => {
      await sendWakeTriggeredBriefing();
    });
    startPendantHealthMonitor();
    log("Pendant health monitor started", "startup");
  }
  
  // Start news service (queries every 2 hours, detects breaking news)
  startNewsScheduler();
  log("News query scheduler started (every 2 hours)", "startup");
  
  // Start morning briefing scheduler (6 AM daily)
  startMorningBriefingScheduler();
  log("Morning briefing scheduler started (daily at 6 AM)", "startup");
  
  log("=== ZEKE cold start complete - all services operational ===", "startup");

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();

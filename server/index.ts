import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startPythonAgents, waitForPythonAgents } from "./python-agents";
import { log } from "./logger";
import { initializeGroceryAutoClear } from "./jobs/groceryAutoClear";
import { initializeConversationSummarizer } from "./jobs/conversationSummarizer";
import { initializeVoicePipeline, startVoicePipeline, isVoicePipelineAvailable } from "./voice";
import { initializeOmiDigest } from "./omiDigest";
import { initializeOmiProcessor } from "./jobs/omiProcessor";
import { initializePredictionScheduler } from "./predictionScheduler";
import { startKVMaintenance } from "./kvIndex";

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

// Health and readiness endpoints (no auth, no logging, crash-resistant)
app.get("/healthz", (_req, res) => {
  try {
    res.json({ ok: true, service: process.env.APP_NAME || "zeke" });
  } catch {
    res.json({ ok: true, service: "zeke" });
  }
});

app.get("/readyz", (_req, res) => {
  try {
    res.json({ ready: true });
  } catch {
    res.json({ ready: true });
  }
});

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
  } else {
    log("Voice pipeline not available - OMI_API_KEY or OMI_DEV_API_KEY not configured", "startup");
  }
  
  // Initialize Omi enhanced features (daily digest + processor)
  initializeOmiDigest();
  initializeOmiProcessor();
  log("Omi enhanced features initialized", "startup");

  // Initialize prediction scheduler (pattern discovery, anomaly detection, prediction generation)
  initializePredictionScheduler();
  log("Prediction scheduler initialized", "startup");
  
  // Initialize Key-Value Store maintenance (periodic cleanup of expired entries)
  startKVMaintenance(5 * 60 * 1000); // Run cleanup every 5 minutes
  log("KV Store maintenance initialized", "startup");

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

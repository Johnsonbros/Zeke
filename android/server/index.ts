import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { registerRoutes } from "./routes";
import { setupWebSocketServer } from "./websocket";
import { authMiddleware, getAuthStatus, getLockedIPs, unlockIP, clearAllLockouts } from "./auth-middleware";
import { validateMasterSecret, registerDevice, listDevices, revokeAllDeviceTokens, isSecretConfigured } from "./device-auth";
import { registerOmiWebhooks } from "./omi-webhooks";
import { registerWearableRoutes } from "./wearable-routes";
import * as fs from "fs";
import * as path from "path";

const app = express();
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    origins.add("http://localhost:8081");
    origins.add("http://127.0.0.1:8081");

    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}:5000`);
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d: string) => {
        origins.add(`https://${d.trim()}`);
        origins.add(`https://${d.trim()}:5000`);
      });
    }

    const origin = req.header("origin");

    if (origin && origins.has(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS, PATCH",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Accept, X-ZEKE-Secret, X-ZEKE-Device-Token, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(express.raw({ 
    type: ['application/octet-stream', 'audio/*'],
    limit: '50mb'
  }));
  
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application) {
  const isProduction = process.env.NODE_ENV === "production";
  
  const templatePaths = [
    path.resolve(process.cwd(), "server", "templates", "landing-page.html"),
    path.resolve(process.cwd(), "dist", "server", "templates", "landing-page.html"),
  ];
  
  let templatePath = templatePaths[0];
  for (const p of templatePaths) {
    if (fs.existsSync(p)) {
      templatePath = p;
      break;
    }
  }
  
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  log("Serving static Expo files with dynamic manifest routing");
  log(`Environment: ${isProduction ? 'production' : 'development'}`);

  const staticBuildPath = path.resolve(process.cwd(), "dist", "web");
  const assetsPath = path.resolve(process.cwd(), "assets");

  app.use("/assets", express.static(assetsPath));
  
  if (isProduction) {
    app.use(express.static(staticBuildPath));
  }

  // Create Metro proxy ONCE outside the handler to prevent memory leaks
  // Creating inside the handler causes MaxListenersExceededWarning
  const metroProxy = !isProduction ? createProxyMiddleware({
    target: 'http://localhost:8081',
    changeOrigin: true,
    ws: true,
    logger: console,
  }) : null;

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/ws")) {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      if (req.path === "/" || req.path === "/manifest") {
        return serveExpoManifest(platform, res);
      }
    }

    const userAgent = req.header("user-agent") || "";
    const isExpoGo = userAgent.includes("Expo") || platform;
    
    if (isExpoGo && (req.path === "/" || req.path === "/manifest")) {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    if (isProduction) {
      const indexPath = path.resolve(staticBuildPath, "index.html");
      if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
      }
      return res.status(200).send(`<!DOCTYPE html><html><head><title>${appName}</title></head><body><h1>${appName}</h1><p>App is running</p></body></html>`);
    }

    // Use the pre-created proxy instance
    return metroProxy!(req, res, next);
  });

  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    res.status(status).json({ message });

    throw err;
  });
}

(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  // Authentication middleware - protects all /api/* routes
  app.use(authMiddleware);

  // Health check endpoint (public)
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Runtime config endpoint (public) - provides the correct proxy origin to clients
  // This allows published apps to discover the correct API URL at runtime
  // instead of relying on baked-in env vars that may be stale
  app.get("/api/runtime-config", (req, res) => {
    const rawHost = req.headers.host || req.hostname;
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    
    // In development, the Express server runs on port 5000
    // Replit's proxy may strip the port from the host header, so we need to add it back
    // This ensures clients use the correct URL to reach the Express server
    const isDev = process.env.NODE_ENV === 'development';
    const hasPort = rawHost.includes(':');
    
    // If host doesn't have a port and we're in dev mode, add :5000
    const host = (isDev && !hasPort && rawHost.includes('replit')) 
      ? `${rawHost}:5000` 
      : rawHost;
    
    const proxyOrigin = `${protocol}://${host}`;
    
    console.log(`[runtime-config] rawHost=${rawHost}, isDev=${isDev}, host=${host}, proxyOrigin=${proxyOrigin}`);
    
    res.json({
      proxyOrigin,
      zekeBackend: "https://zekeai.replit.app",
      timestamp: new Date().toISOString()
    });
  });

  // Security status endpoints (public - for monitoring)
  app.get("/api/auth/status", (_req, res) => {
    res.json({
      ...getAuthStatus(),
      secretConfigured: isSecretConfigured(),
      pairedDevices: listDevices().length
    });
  });

  app.get("/api/auth/locked", (_req, res) => {
    res.json({ lockedIPs: getLockedIPs() });
  });

  app.post("/api/auth/unlock/:ip", (req, res) => {
    const ip = req.params.ip;
    const success = unlockIP(ip);
    res.json({ success, ip });
  });

  // Clear all lockouts (for debugging/recovery)
  app.post("/api/auth/clear-lockouts", (_req, res) => {
    const count = clearAllLockouts();
    res.json({ success: true, clearedCount: count });
  });

  // Device pairing endpoint (public - validates master secret)
  app.post("/api/auth/pair", async (req, res) => {
    const clientIP = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    console.log(`[Auth:Pair] >>> Request received from ${clientIP}`);
    console.log(`[Auth:Pair] Headers: ${JSON.stringify({
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent']?.substring(0, 50)
    })}`);
    
    const { secret, deviceName } = req.body;
    console.log(`[Auth:Pair] Body: deviceName="${deviceName}", secret="${secret ? '***provided***' : 'MISSING'}"`);
    
    if (!secret || !deviceName) {
      console.log(`[Auth:Pair] <<< 400: Missing required fields`);
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'Both secret and deviceName are required'
      });
    }

    if (!isSecretConfigured()) {
      console.log(`[Auth:Pair] <<< 503: Service not configured`);
      return res.status(503).json({ 
        error: 'Service not configured',
        message: 'Server security is not configured'
      });
    }

    try {
      if (!validateMasterSecret(secret)) {
        console.log(`[Auth:Pair] <<< 401: Invalid secret`);
        return res.status(401).json({ 
          error: 'Invalid secret',
          message: 'The provided access key is incorrect'
        });
      }
    } catch (e) {
      console.log(`[Auth:Pair] <<< 401: Secret validation error - ${e}`);
      return res.status(401).json({ 
        error: 'Invalid secret',
        message: 'The provided access key is incorrect'
      });
    }

    const device = await registerDevice(deviceName);
    console.log(`[Auth:Pair] <<< 201: Device paired successfully (id: ${device.deviceId})`);
    
    res.status(201).json({
      success: true,
      deviceId: device.deviceId,
      deviceToken: device.token,
      message: 'Device paired successfully'
    });
  });

  // Verify device token (public - for auth check)
  // Supports both GET (from client) and POST (legacy)
  const verifyHandler = (req: Request, res: Response) => {
    const clientIP = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    console.log(`[Auth:Verify] >>> Request received from ${clientIP} (${req.method})`);
    
    const deviceToken = req.headers['x-zeke-device-token'] as string;
    console.log(`[Auth:Verify] Token: ${deviceToken ? `${deviceToken.substring(0, 10)}...` : 'MISSING'}`);
    
    if (!deviceToken) {
      console.log(`[Auth:Verify] <<< 401: No token provided`);
      return res.status(401).json({ valid: false, error: 'No token provided' });
    }

    const { validateDeviceToken } = require('./device-auth');
    const device = validateDeviceToken(deviceToken);
    
    if (device) {
      console.log(`[Auth:Verify] <<< 200: Valid token for device ${device.deviceId}`);
      return res.json({ valid: true, deviceId: device.deviceId, deviceName: device.deviceName });
    }
    
    console.log(`[Auth:Verify] <<< 401: Invalid token`);
    return res.status(401).json({ valid: false, error: 'Invalid token' });
  };
  app.get("/api/auth/verify", verifyHandler);
  app.post("/api/auth/verify", verifyHandler);

  // List paired devices (requires auth)
  app.get("/api/auth/devices", (_req, res) => {
    res.json({ devices: listDevices() });
  });

  // Revoke all device tokens (requires auth)
  app.post("/api/auth/revoke-all", (_req, res) => {
    const count = revokeAllDeviceTokens();
    res.json({ success: true, revokedCount: count });
  });

  configureExpoAndLanding(app);

  registerOmiWebhooks(app);
  registerWearableRoutes(app);

  const server = await registerRoutes(app);

  setupWebSocketServer(server);

  setupErrorHandler(app);

  const isProduction = process.env.NODE_ENV === "production";
  const defaultPort = isProduction ? 8081 : 5000;
  const port = parseInt(process.env.PORT || String(defaultPort), 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`express server serving on port ${port}`);
    },
  );
})();

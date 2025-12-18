import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { registerRoutes } from "./routes";
import { setupWebSocketServer } from "./websocket";
import { authMiddleware, getAuthStatus, getLockedIPs, unlockIP, clearAllLockouts } from "./auth-middleware";
import { validateMasterSecret, registerDevice, listDevices, revokeAllDeviceTokens, isSecretConfigured } from "./device-auth";
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

    const metroProxy = createProxyMiddleware({
      target: 'http://localhost:8081',
      changeOrigin: true,
      ws: true,
      logger: console,
    });
    return metroProxy(req, res, next);
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
    const { secret, deviceName } = req.body;
    
    if (!secret || !deviceName) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'Both secret and deviceName are required'
      });
    }

    if (!isSecretConfigured()) {
      return res.status(503).json({ 
        error: 'Service not configured',
        message: 'Server security is not configured'
      });
    }

    try {
      if (!validateMasterSecret(secret)) {
        return res.status(401).json({ 
          error: 'Invalid secret',
          message: 'The provided access key is incorrect'
        });
      }
    } catch (e) {
      return res.status(401).json({ 
        error: 'Invalid secret',
        message: 'The provided access key is incorrect'
      });
    }

    const device = await registerDevice(deviceName);
    
    res.status(201).json({
      success: true,
      deviceId: device.deviceId,
      deviceToken: device.token,
      message: 'Device paired successfully'
    });
  });

  // Verify device token (public - for auth check)
  app.post("/api/auth/verify", (req, res) => {
    const deviceToken = req.headers['x-zeke-device-token'] as string;
    
    if (!deviceToken) {
      return res.status(401).json({ valid: false, error: 'No token provided' });
    }

    const { validateDeviceToken } = require('./device-auth');
    const device = validateDeviceToken(deviceToken);
    
    if (device) {
      return res.json({ valid: true, deviceId: device.deviceId, deviceName: device.deviceName });
    }
    
    return res.status(401).json({ valid: false, error: 'Invalid token' });
  });

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

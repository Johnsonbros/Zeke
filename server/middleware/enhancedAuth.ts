import type { Request, Response, NextFunction } from "express";

export interface AuthContext {
  userId?: string;
  sessionId?: string;
  deviceToken?: string;
  source: "web" | "mobile" | "api";
  authenticated: boolean;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Enhanced authentication middleware that supports multiple auth methods
 * Supports: session cookies (web), device tokens (mobile), API keys
 */
export function enhancedAuth(options: {
  required?: boolean;
  allowDeviceToken?: boolean;
  allowApiKey?: boolean;
} = {}) {
  const {
    required = false,
    allowDeviceToken = true,
    allowApiKey = true,
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const auth: AuthContext = {
      source: "api",
      authenticated: false,
    };

    // Check for device token (mobile app)
    if (allowDeviceToken) {
      const deviceToken = req.headers["x-zeke-device-token"] as
        | string
        | undefined;
      if (deviceToken) {
        auth.deviceToken = deviceToken;
        auth.source = "mobile";
        auth.authenticated = true;
        // In production, validate the device token here
      }
    }

    // Check for API key
    if (allowApiKey && !auth.authenticated) {
      const apiKey = req.headers["x-api-key"] as string | undefined;
      if (apiKey) {
        auth.authenticated = true;
        auth.source = "api";
        // In production, validate the API key here
      }
    }

    // Check for session (web)
    if (!auth.authenticated) {
      const sessionId = req.headers["x-session-id"] as string | undefined;
      const userId = req.headers["x-user-id"] as string | undefined;
      
      if (sessionId || userId) {
        auth.sessionId = sessionId;
        auth.userId = userId;
        auth.source = "web";
        auth.authenticated = true;
        // In production, validate the session here
      }
    }

    // For ZEKE single-user system, we can be more permissive
    // If no auth is present but it's not required, allow through
    if (!auth.authenticated && !required) {
      auth.authenticated = true;
      auth.source = "api";
    }

    req.auth = auth;

    if (required && !auth.authenticated) {
      res.status(401).json({
        error: "Authentication required",
        message: "Please provide valid authentication credentials",
        acceptedMethods: [
          allowDeviceToken ? "X-ZEKE-Device-Token header" : null,
          allowApiKey ? "X-API-Key header" : null,
          "X-Session-Id header",
        ].filter(Boolean),
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to log authentication attempts for debugging
 */
export function logAuth(req: Request, res: Response, next: NextFunction): void {
  const headers = {
    deviceToken: req.headers["x-zeke-device-token"] ? "present" : "missing",
    apiKey: req.headers["x-api-key"] ? "present" : "missing",
    sessionId: req.headers["x-session-id"] ? "present" : "missing",
    userId: req.headers["x-user-id"] ? "present" : "missing",
    hmacSignature: req.headers["x-zeke-signature"] ? "present" : "missing",
  };

  console.log(`[Auth Debug] ${req.method} ${req.path}`, headers);
  
  if (req.auth) {
    console.log(`[Auth Debug] Context:`, {
      source: req.auth.source,
      authenticated: req.auth.authenticated,
    });
  }

  next();
}

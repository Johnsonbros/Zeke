import type { Request, Response, NextFunction } from "express";

interface RequestLog {
  timestamp: string;
  requestId: string;
  method: string;
  path: string;
  query: any;
  headers: {
    contentType?: string;
    userAgent?: string;
    deviceToken?: string;
    authorization?: string;
    hmacSignature?: string;
  };
  body?: any;
  ip: string;
  responseTime?: number;
  statusCode?: number;
  responseBody?: any;
  error?: string;
}

const requestLogs: RequestLog[] = [];
const MAX_LOGS = 200;

/**
 * Enhanced request/response logging middleware
 */
export function apiLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const requestId =
    (req.headers["x-zeke-request-id"] as string) ||
    `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Attach request ID for tracking
  req.headers["x-zeke-request-id"] = requestId;

  const log: RequestLog = {
    timestamp: new Date().toISOString(),
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    headers: {
      contentType: req.headers["content-type"],
      userAgent: req.headers["user-agent"],
      deviceToken: req.headers["x-zeke-device-token"] ? "***" : undefined,
      authorization: req.headers["authorization"] ? "***" : undefined,
      hmacSignature: req.headers["x-zeke-signature"] ? "***" : undefined,
    },
    body:
      req.body && Object.keys(req.body).length > 0
        ? sanitizeBody(req.body)
        : undefined,
    ip: req.ip || req.socket.remoteAddress || "unknown",
  };

  // Capture response
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.json = function (body: any) {
    log.responseTime = Date.now() - startTime;
    log.statusCode = res.statusCode;
    log.responseBody = sanitizeBody(body);
    addLog(log);
    return originalJson(body);
  };

  res.send = function (body: any) {
    log.responseTime = Date.now() - startTime;
    log.statusCode = res.statusCode;
    // Only log JSON responses
    if (typeof body === "string" && body.startsWith("{")) {
      try {
        log.responseBody = sanitizeBody(JSON.parse(body));
      } catch {
        // Not JSON, skip
      }
    }
    addLog(log);
    return originalSend(body);
  };

  // Capture errors
  res.on("finish", () => {
    if (res.statusCode >= 400 && !log.responseBody) {
      log.statusCode = res.statusCode;
      log.responseTime = Date.now() - startTime;
      addLog(log);
    }
  });

  next();
}

/**
 * Sanitize sensitive data from logs
 */
function sanitizeBody(body: any): any {
  if (!body || typeof body !== "object") {
    return body;
  }

  const sanitized = { ...body };
  const sensitiveKeys = [
    "password",
    "token",
    "secret",
    "apiKey",
    "accessToken",
    "refreshToken",
  ];

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
      sanitized[key] = "***";
    } else if (typeof sanitized[key] === "object") {
      sanitized[key] = sanitizeBody(sanitized[key]);
    }
  }

  return sanitized;
}

/**
 * Add log entry to in-memory store
 */
function addLog(log: RequestLog): void {
  requestLogs.unshift(log);
  if (requestLogs.length > MAX_LOGS) {
    requestLogs.pop();
  }

  // Console log for debugging
  const logLine = `[${log.method}] ${log.path} - ${log.statusCode} in ${log.responseTime}ms [${log.requestId}]`;
  if (log.statusCode && log.statusCode >= 400) {
    console.error(logLine, log.error || log.responseBody);
  } else {
    console.log(logLine);
  }
}

/**
 * Get recent request logs
 */
export function getRequestLogs(limit: number = 50): RequestLog[] {
  return requestLogs.slice(0, limit);
}

/**
 * Clear request logs
 */
export function clearRequestLogs(): void {
  requestLogs.length = 0;
}

/**
 * Get logs filtered by criteria
 */
export function getFilteredLogs(criteria: {
  path?: string;
  method?: string;
  statusCode?: number;
  minResponseTime?: number;
  errorOnly?: boolean;
}): RequestLog[] {
  return requestLogs.filter((log) => {
    if (criteria.path && !log.path.includes(criteria.path)) return false;
    if (criteria.method && log.method !== criteria.method) return false;
    if (criteria.statusCode && log.statusCode !== criteria.statusCode)
      return false;
    if (
      criteria.minResponseTime &&
      (log.responseTime || 0) < criteria.minResponseTime
    )
      return false;
    if (criteria.errorOnly && (!log.statusCode || log.statusCode < 400))
      return false;
    return true;
  });
}

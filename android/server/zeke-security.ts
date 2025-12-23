import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

const SHARED_SECRET = process.env.ZEKE_SHARED_SECRET || "";
const PROXY_ID = process.env.ZEKE_PROXY_ID || "zeke-mobile-proxy";
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;
const TIMESTAMP_TOLERANCE_SECONDS = Math.floor(TIMESTAMP_TOLERANCE_MS / 1000);

const usedNonces = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  const entries = Array.from(usedNonces.entries());
  for (const [nonce, timestamp] of entries) {
    if (now - timestamp > TIMESTAMP_TOLERANCE_MS * 2) {
      usedNonces.delete(nonce);
    }
  }
}, 60 * 1000);

export interface SignedRequestHeaders {
  "X-Zeke-Proxy-Id": string;
  "X-ZEKE-Timestamp": string;
  "X-ZEKE-Nonce": string;
  "X-ZEKE-Signature": string;
  "X-Zeke-Request-Id": string;
}

export function generateRequestId(): string {
  return `req_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
}

export function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

function normalizePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export function signRequest(
  method: string,
  path: string,
  body?: string,
  timestamp?: number,
  nonce?: string
): SignedRequestHeaders {
  const ts = timestamp || Math.floor(Date.now() / 1000);
  const n = nonce || generateNonce();
  const requestId = generateRequestId();
  
  const normalizedPath = normalizePath(path);
  const bodyString = body || "";
  const bodyHash = crypto.createHash("sha256").update(bodyString).digest("hex");
  
  const payload = `${ts}.${n}.${method.toUpperCase()}.${normalizedPath}.${bodyHash}`;
  
  const signature = crypto
    .createHmac("sha256", SHARED_SECRET)
    .update(payload)
    .digest("hex");
  
  return {
    "X-Zeke-Proxy-Id": PROXY_ID,
    "X-ZEKE-Timestamp": ts.toString(),
    "X-ZEKE-Nonce": n,
    "X-ZEKE-Signature": signature,
    "X-Zeke-Request-Id": requestId,
  };
}

export function verifySignature(
  method: string,
  path: string,
  body: string,
  proxyId: string,
  timestamp: string,
  nonce: string,
  signature: string
): { valid: boolean; error?: string } {
  const ts = parseInt(timestamp, 10);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const nowMs = Date.now();
  
  if (isNaN(ts) || Math.abs(nowSeconds - ts) > TIMESTAMP_TOLERANCE_SECONDS) {
    return { valid: false, error: "Timestamp expired or invalid" };
  }
  
  if (usedNonces.has(nonce)) {
    return { valid: false, error: "Nonce already used (replay attack detected)" };
  }
  
  const normalizedPath = normalizePath(path);
  const bodyString = body || "";
  const bodyHash = crypto.createHash("sha256").update(bodyString).digest("hex");
  const payload = `${timestamp}.${nonce}.${method.toUpperCase()}.${normalizedPath}.${bodyHash}`;
  
  const expectedSignature = crypto
    .createHmac("sha256", SHARED_SECRET)
    .update(payload)
    .digest("hex");
  
  let isValid = false;
  try {
    if (signature.length === expectedSignature.length) {
      isValid = crypto.timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(expectedSignature, "hex")
      );
    }
  } catch {
    return { valid: false, error: "Invalid signature format" };
  }
  
  if (isValid) {
    usedNonces.set(nonce, nowMs);
    return { valid: true };
  }
  
  return { valid: false, error: "Invalid signature" };
}

export interface CommunicationLogEntry {
  requestId: string;
  timestamp: string;
  method: string;
  path: string;
  direction: "outbound" | "inbound";
  status?: number;
  latencyMs?: number;
  proxyId: string;
  signatureValid?: boolean;
  error?: string;
  bodyHash?: string;
}

const communicationLogs: CommunicationLogEntry[] = [];
const MAX_LOG_ENTRIES = 1000;

export function logCommunication(entry: CommunicationLogEntry): void {
  console.log(
    `[ZEKE Comm] ${entry.direction.toUpperCase()} ${entry.method} ${entry.path} ` +
    `[${entry.requestId}] status=${entry.status || "pending"} latency=${entry.latencyMs || 0}ms`
  );
  
  communicationLogs.unshift(entry);
  
  if (communicationLogs.length > MAX_LOG_ENTRIES) {
    communicationLogs.pop();
  }
}

export function getCommunicationLogs(limit: number = 100): CommunicationLogEntry[] {
  return communicationLogs.slice(0, limit);
}

export function hashBody(body: string): string {
  // Return full SHA-256 hash as expected by ZEKE backend
  const bodyString = body || "";
  return crypto.createHash("sha256").update(bodyString).digest("hex");
}

export function isSecurityConfigured(): boolean {
  return !!SHARED_SECRET && SHARED_SECRET.length >= 32;
}

export function getSecurityStatus(): {
  configured: boolean;
  proxyId: string;
  secretConfigured: boolean;
  logsCount: number;
} {
  return {
    configured: isSecurityConfigured(),
    proxyId: PROXY_ID,
    secretConfigured: !!SHARED_SECRET,
    logsCount: communicationLogs.length,
  };
}

export function createVerificationMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isSecurityConfigured()) {
      return next();
    }
    
    const proxyId = req.headers["x-zeke-proxy-id"] as string;
    const timestamp = req.headers["x-zeke-timestamp"] as string;
    const nonce = req.headers["x-zeke-nonce"] as string;
    const signature = req.headers["x-zeke-signature"] as string;
    
    if (!proxyId || !timestamp || !nonce || !signature) {
      return res.status(401).json({ error: "Missing security headers" });
    }
    
    const bodyStr = typeof req.body === "string" 
      ? req.body 
      : JSON.stringify(req.body || "");
    
    const result = verifySignature(
      req.method,
      req.path,
      bodyStr,
      proxyId,
      timestamp,
      nonce,
      signature
    );
    
    if (!result.valid) {
      logCommunication({
        requestId: req.headers["x-zeke-request-id"] as string || generateRequestId(),
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        direction: "inbound",
        status: 401,
        proxyId: proxyId || "unknown",
        signatureValid: false,
        error: result.error,
      });
      
      return res.status(401).json({ error: result.error });
    }
    
    next();
  };
}

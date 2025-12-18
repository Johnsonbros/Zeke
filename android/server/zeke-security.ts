import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

const SHARED_SECRET = process.env.ZEKE_SHARED_SECRET || "";
const PROXY_ID = process.env.ZEKE_PROXY_ID || "zeke-mobile-proxy";
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

const usedNonces = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [nonce, timestamp] of usedNonces.entries()) {
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

export function signRequest(
  method: string,
  path: string,
  body?: string,
  timestamp?: number,
  nonce?: string
): SignedRequestHeaders {
  // ZEKE backend expects timestamp in SECONDS for signature validation
  const ts = timestamp || Math.floor(Date.now() / 1000);
  const n = nonce || generateNonce();
  const requestId = generateRequestId();
  
  const bodyString = body || "";
  const bodyHash = crypto.createHash("sha256").update(bodyString).digest("hex");
  
  // ZEKE backend payload format: timestamp.nonce.METHOD.path.bodyHash
  const payload = `${ts}.${n}.${method.toUpperCase()}.${path}.${bodyHash}`;
  
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
  const now = Date.now();
  
  if (isNaN(ts) || Math.abs(now - ts) > TIMESTAMP_TOLERANCE_MS) {
    return { valid: false, error: "Timestamp expired or invalid" };
  }
  
  if (usedNonces.has(nonce)) {
    return { valid: false, error: "Nonce already used (replay attack detected)" };
  }
  
  const payload = [
    method.toUpperCase(),
    path,
    body || "",
    timestamp,
    nonce,
    proxyId,
  ].join("|");
  
  const expectedSignature = crypto
    .createHmac("sha256", SHARED_SECRET)
    .update(payload)
    .digest("hex");
  
  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expectedSignature, "hex")
  );
  
  if (isValid) {
    usedNonces.set(nonce, now);
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

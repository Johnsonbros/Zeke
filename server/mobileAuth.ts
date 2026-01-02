import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import {
  getDeviceTokenByToken,
  updateDeviceTokenLastUsed,
} from './db';

interface AuditLogEntry {
  requestId: string;
  timestamp: number;
  path: string;
  method: string;
  proxyId: string | null;
  status: 'verified' | 'rejected';
  rejectionReason?: string;
  latencyMs: number;
  ip: string;
}

const auditLog: AuditLogEntry[] = [];
const MAX_AUDIT_ENTRIES = 100;
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

function addAuditEntry(entry: AuditLogEntry): void {
  auditLog.unshift(entry);
  if (auditLog.length > MAX_AUDIT_ENTRIES) {
    auditLog.pop();
  }
}

export function getAuditLogs(): AuditLogEntry[] {
  return [...auditLog];
}

export function clearAuditLogs(): void {
  auditLog.length = 0;
}

function getSharedSecret(): string | null {
  return process.env.ZEKE_SHARED_SECRET || null;
}

function computeBodyHash(body: unknown): string {
  const bodyStr = body && Object.keys(body as object).length > 0 
    ? JSON.stringify(body) 
    : '';
  return crypto.createHash('sha256').update(bodyStr).digest('hex');
}

function computeExpectedSignature(
  timestamp: string,
  nonce: string,
  method: string,
  path: string,
  bodyHash: string,
  secret: string
): string {
  const payload = `${timestamp}.${nonce}.${method}.${path}.${bodyHash}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function zekeMobileAuth(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const signature = req.headers['x-zeke-signature'] as string | undefined;
  const timestamp = req.headers['x-zeke-timestamp'] as string | undefined;
  const nonce = req.headers['x-zeke-nonce'] as string | undefined;
  const proxyId = req.headers['x-zeke-proxy-id'] as string | undefined;
  const requestId = (req.headers['x-zeke-request-id'] as string) || `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  const createRejection = (reason: string, statusCode: number = 401) => {
    const latencyMs = Date.now() - startTime;
    addAuditEntry({
      requestId,
      timestamp: Date.now(),
      path: req.path,
      method: req.method,
      proxyId: proxyId || null,
      status: 'rejected',
      rejectionReason: reason,
      latencyMs,
      ip: clientIp,
    });
    res.status(statusCode).json({ 
      error: 'Unauthorized', 
      reason,
      requestId 
    });
  };

  const secret = getSharedSecret();
  if (!secret) {
    createRejection('Server configuration error: shared secret not configured', 500);
    return;
  }

  if (!signature) {
    createRejection('Missing X-ZEKE-Signature header');
    return;
  }

  if (!timestamp) {
    createRejection('Missing X-ZEKE-Timestamp header');
    return;
  }

  // Nonce is optional - use empty string if not provided for backward compatibility
  // Clients should use the same nonce value (or empty string) when computing signature
  const effectiveNonce = nonce || '';

  const timestampNum = parseInt(timestamp, 10);
  if (isNaN(timestampNum)) {
    createRejection('Invalid timestamp format');
    return;
  }

  // Handle both Unix seconds (10 digits) and Unix milliseconds (13 digits)
  // Mobile apps typically send Unix seconds, while Date.now() returns milliseconds
  const timestampMs = timestampNum.toString().length <= 10 
    ? timestampNum * 1000  // Convert seconds to milliseconds
    : timestampNum;        // Already in milliseconds

  const age = Date.now() - timestampMs;
  if (age > TIMESTAMP_TOLERANCE_MS) {
    createRejection(`Request timestamp too old (replay protection). Age: ${age}ms, tolerance: ${TIMESTAMP_TOLERANCE_MS}ms`);
    return;
  }

  if (age < -TIMESTAMP_TOLERANCE_MS) {
    createRejection(`Request timestamp in the future. Age: ${age}ms`);
    return;
  }

  const bodyHash = computeBodyHash(req.body);
  const expectedSignature = computeExpectedSignature(
    timestamp,
    effectiveNonce,
    req.method,
    req.path,
    bodyHash,
    secret
  );

  if (!safeCompare(signature, expectedSignature)) {
    // Log debug info for signature mismatch (without exposing secrets)
    console.log(`[MOBILE AUTH DEBUG] Signature mismatch for ${req.method} ${req.path}`);
    console.log(`[MOBILE AUTH DEBUG] Payload format: ${timestamp}.${effectiveNonce}.${req.method}.${req.path}.${bodyHash}`);
    console.log(`[MOBILE AUTH DEBUG] Received signature: ${signature.substring(0, 16)}...`);
    console.log(`[MOBILE AUTH DEBUG] Expected signature: ${expectedSignature.substring(0, 16)}...`);
    console.log(`[MOBILE AUTH DEBUG] Body hash: ${bodyHash}`);
    console.log(`[MOBILE AUTH DEBUG] Empty body expected hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`);
    createRejection('Invalid signature');
    return;
  }

  const latencyMs = Date.now() - startTime;
  addAuditEntry({
    requestId,
    timestamp: Date.now(),
    path: req.path,
    method: req.method,
    proxyId: proxyId || null,
    status: 'verified',
    latencyMs,
    ip: clientIp,
  });

  (req as any).zekeRequestId = requestId;
  (req as any).zekeProxyId = proxyId;

  next();
}

export function registerSecurityLogsEndpoint(app: any): void {
  app.get('/api/mobile/security/logs', (_req: Request, res: Response) => {
    const logs = getAuditLogs();
    const summary = {
      totalEntries: logs.length,
      verified: logs.filter(l => l.status === 'verified').length,
      rejected: logs.filter(l => l.status === 'rejected').length,
      recentRejectionReasons: [...new Set(
        logs
          .filter(l => l.status === 'rejected')
          .slice(0, 10)
          .map(l => l.rejectionReason)
      )],
    };
    res.json({ summary, logs });
  });

  // Diagnostic endpoint - helps mobile team debug signature mismatches
  // POST /api/mobile/auth/diagnose with the same headers they'd use for a real request
  // Returns what signature the backend would expect
  app.post('/api/mobile/auth/diagnose', (req: Request, res: Response) => {
    const secret = getSharedSecret();
    if (!secret) {
      res.status(500).json({ error: 'Shared secret not configured' });
      return;
    }

    const timestamp = req.headers['x-zeke-timestamp'] as string | undefined;
    const nonce = req.headers['x-zeke-nonce'] as string | undefined;
    const signature = req.headers['x-zeke-signature'] as string | undefined;
    const testPath = (req.body?.path as string) || '/api/tasks';
    const testMethod = (req.body?.method as string) || 'GET';
    const testBody = req.body?.body || '';

    const effectiveNonce = nonce || '';
    const bodyStr = typeof testBody === 'string' ? testBody : JSON.stringify(testBody);
    const bodyHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
    const emptyBodyHash = crypto.createHash('sha256').update('').digest('hex');
    
    const payload = `${timestamp}.${effectiveNonce}.${testMethod}.${testPath}.${bodyHash}`;
    const expectedSignature = secret 
      ? crypto.createHmac('sha256', secret).update(payload).digest('hex')
      : 'SECRET_NOT_CONFIGURED';

    // Check if this route is even protected
    const isProtected = shouldProtectRoute(testPath);

    res.json({
      diagnosis: {
        routeProtected: isProtected,
        note: isProtected 
          ? 'This route requires HMAC authentication' 
          : 'This route is NOT protected - no auth required!',
      },
      received: {
        timestamp,
        nonce: nonce || '(not provided, using empty string)',
        signature: signature ? `${signature.substring(0, 16)}...` : null,
        path: testPath,
        method: testMethod,
        bodyProvided: bodyStr.length > 0,
      },
      expected: {
        payloadFormat: 'timestamp.nonce.method.path.bodyHash',
        payloadUsed: payload,
        bodyHash,
        emptyBodyHash,
        expectedSignaturePrefix: `${expectedSignature.substring(0, 16)}...`,
      },
      match: signature ? safeCompare(signature, expectedSignature) : false,
      hints: [
        'Ensure nonce in header matches nonce in signature payload',
        'Ensure timestamp is Unix seconds (10 digits) or milliseconds (13 digits)',
        'Ensure body hash is SHA-256 of exact body string (or empty string for no body)',
        'Path must match exactly including leading slash (e.g., /api/tasks)',
        'Method must be uppercase (GET, POST, etc.)',
      ],
    });
  });
}

export const PROTECTED_ROUTE_PATTERNS = [
  '/api/tasks',
  '/api/grocery',
  '/api/lists',
  '/api/contacts',
  '/api/chat',
  '/api/dashboard',
  '/api/memories',
  '/api/conversations',
  '/api/news/briefing',
];

export function shouldProtectRoute(path: string): boolean {
  return PROTECTED_ROUTE_PATTERNS.some(pattern => 
    path === pattern || path.startsWith(`${pattern}/`)
  );
}

// Validate device token from X-ZEKE-Device-Token header
export function validateDeviceToken(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const deviceToken = req.headers['x-zeke-device-token'] as string | undefined;
  const requestId = (req.headers['x-zeke-request-id'] as string) || `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  if (!deviceToken) {
    const latencyMs = Date.now() - startTime;
    console.log(`[DEVICE TOKEN AUTH] === REJECTED: Missing Token ===`);
    console.log(`[DEVICE TOKEN AUTH] Path: ${req.path}, Method: ${req.method}`);
    console.log(`[DEVICE TOKEN AUTH] All headers:`, Object.keys(req.headers));
    console.log(`[DEVICE TOKEN AUTH] IP: ${clientIp}, RequestId: ${requestId}`);
    
    addAuditEntry({
      requestId,
      timestamp: Date.now(),
      path: req.path,
      method: req.method,
      proxyId: null,
      status: 'rejected',
      rejectionReason: 'Missing X-ZEKE-Device-Token header',
      latencyMs,
      ip: clientIp,
    });
    res.status(401).json({ error: 'Unauthorized', reason: 'Missing device token', requestId });
    return;
  }

  try {
    const device = getDeviceTokenByToken(deviceToken);
    if (!device) {
      const latencyMs = Date.now() - startTime;
      console.log(`[DEVICE TOKEN AUTH] === REJECTED: Invalid Token ===`);
      console.log(`[DEVICE TOKEN AUTH] Path: ${req.path}, Method: ${req.method}`);
      console.log(`[DEVICE TOKEN AUTH] Token (first 8 chars): ${deviceToken.substring(0, 8)}...`);
      console.log(`[DEVICE TOKEN AUTH] IP: ${clientIp}, RequestId: ${requestId}`);
      
      addAuditEntry({
        requestId,
        timestamp: Date.now(),
        path: req.path,
        method: req.method,
        proxyId: null,
        status: 'rejected',
        rejectionReason: 'Invalid device token',
        latencyMs,
        ip: clientIp,
      });
      res.status(401).json({ valid: false, error: 'Invalid or expired device token' });
      return;
    }

    // Update last used timestamp
    updateDeviceTokenLastUsed(deviceToken);

    const latencyMs = Date.now() - startTime;
    addAuditEntry({
      requestId,
      timestamp: Date.now(),
      path: req.path,
      method: req.method,
      proxyId: device.deviceId,
      status: 'verified',
      latencyMs,
      ip: clientIp,
    });

    (req as any).zekeRequestId = requestId;
    (req as any).zekeDeviceId = device.deviceId;
    (req as any).zekeDeviceName = device.deviceName;

    next();
  } catch (error) {
    console.error('[DEVICE TOKEN AUTH] Error validating token:', error);
    res.status(500).json({ error: 'Internal server error during authentication' });
  }
}

// Generate secure device token
export function generateDeviceToken(): string {
  return crypto.randomBytes(32).toString('hex'); // 64-character hex token
}

// Generate unique device ID
export function generateDeviceId(): string {
  return `device_${crypto.randomBytes(12).toString('hex')}`; // device_24chars
}

export function createMobileAuthMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // DESIGN NOTE: ZEKE is a single-user personal AI assistant for Nate Johnson.
    // The web UI is accessed directly by Nate without authentication - it's his personal tool.
    // The mobile HMAC auth (X-ZEKE-Signature) is specifically for the companion mobile app
    // to verify requests come from the legitimate app installation.
    // 
    // Security model:
    // - Browser/web UI: No auth required (single user, direct access)
    // - Mobile app: HMAC signature verification OR device token required
    // - External webhooks (SMS, Twilio): Verified by their respective providers
    const hasSignatureHeader = !!req.headers['x-zeke-signature'];
    const hasDeviceTokenHeader = !!req.headers['x-zeke-device-token'];
    
    if (shouldProtectRoute(req.path)) {
      // If device token header is present, validate it
      if (hasDeviceTokenHeader && !hasSignatureHeader) {
        return validateDeviceToken(req, res, next);
      }
      // If signature header is present, use HMAC auth
      if (hasSignatureHeader) {
        return zekeMobileAuth(req, res, next);
      }
    }
    next();
  };
}

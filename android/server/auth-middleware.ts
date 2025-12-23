import type { Request, Response, NextFunction } from 'express';
import { validateDeviceToken, validateMasterSecret } from './device-auth';

const ZEKE_SECRET = process.env.ZEKE_SHARED_SECRET;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS_WINDOW_MS = 5 * 60 * 1000; // 5 minute sliding window

interface FailedAttempt {
  count: number;
  firstAttempt: number;
  lockedUntil: number | null;
}

const failedAttempts = new Map<string, FailedAttempt>();

const PUBLIC_ROUTES = [
  '/api/health',
  '/api/runtime-config',
  '/api/auth/status',
  '/api/auth/locked',
  '/api/auth/pair',
  '/api/auth/verify',
  '/api/auth/unlock',
  '/api/auth/clear-lockouts',
  '/api/auth/request-sms-code',
  '/api/auth/verify-sms-code',
  '/api/calendar/connection',
  '/api/zeke/health',
  '/api/zeke/auth/pair',
  '/api/zeke/auth/verify',
  '/api/zeke/auth/status',
  '/api/zeke/auth/unlock',
  '/api/omi/memory-trigger',
  '/api/omi/realtime-transcript',
  '/api/omi/transcript',
  '/api/omi/audio-bytes',
  '/api/omi/day-summary',
  '/api/twilio/webhook/sms',
  '/api/twilio/webhook/voice',
  '/api/twilio/webhook/status',
];

function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',');
    return ips[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function isPublicRoute(path: string): boolean {
  return PUBLIC_ROUTES.some(route => path.startsWith(route));
}

function isLockedOut(ip: string): boolean {
  const record = failedAttempts.get(ip);
  if (!record || !record.lockedUntil) return false;
  
  if (Date.now() > record.lockedUntil) {
    failedAttempts.delete(ip);
    return false;
  }
  
  return true;
}

function recordFailedAttempt(ip: string): { locked: boolean; remainingAttempts: number } {
  const now = Date.now();
  let record = failedAttempts.get(ip);
  
  if (!record || (now - record.firstAttempt > MAX_ATTEMPTS_WINDOW_MS)) {
    record = { count: 1, firstAttempt: now, lockedUntil: null };
  } else {
    record.count++;
  }
  
  if (record.count >= LOCKOUT_THRESHOLD) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
    failedAttempts.set(ip, record);
    return { locked: true, remainingAttempts: 0 };
  }
  
  failedAttempts.set(ip, record);
  return { locked: false, remainingAttempts: LOCKOUT_THRESHOLD - record.count };
}

function clearFailedAttempts(ip: string): void {
  failedAttempts.delete(ip);
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith('/api')) {
    return next();
  }

  if (isPublicRoute(req.path)) {
    return next();
  }

  if (!ZEKE_SECRET) {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      console.error('[Auth] CRITICAL: ZEKE_SHARED_SECRET not configured in production - rejecting request');
      return res.status(500).json({
        error: 'Server configuration error',
        message: 'Authentication system not properly configured'
      });
    }
    console.warn('[Auth] ZEKE_SHARED_SECRET not configured - allowing request (development mode only)');
    return next();
  }

  const clientIP = getClientIP(req);

  if (isLockedOut(clientIP)) {
    const record = failedAttempts.get(clientIP)!;
    const remainingMs = record.lockedUntil! - Date.now();
    const remainingMins = Math.ceil(remainingMs / 60000);
    
    console.warn(`[Auth] Blocked request from locked IP: ${clientIP}`);
    
    return res.status(429).json({
      error: 'Too many failed authentication attempts',
      message: `Access temporarily blocked. Try again in ${remainingMins} minutes.`,
      retryAfter: remainingMins
    });
  }

  const deviceToken = req.headers['x-zeke-device-token'] as string;
  const masterSecret = req.headers['x-zeke-secret'] as string;
  const bearerToken = req.headers['authorization']?.replace('Bearer ', '');

  if (deviceToken) {
    const device = validateDeviceToken(deviceToken);
    if (device) {
      clearFailedAttempts(clientIP);
      (req as any).zekeDevice = device;
      return next();
    }
  }

  if (bearerToken) {
    const device = validateDeviceToken(bearerToken);
    if (device) {
      clearFailedAttempts(clientIP);
      (req as any).zekeDevice = device;
      return next();
    }
  }

  if (masterSecret && ZEKE_SECRET) {
    try {
      if (validateMasterSecret(masterSecret)) {
        clearFailedAttempts(clientIP);
        return next();
      }
    } catch (e) {
    }
  }

  const result = recordFailedAttempt(clientIP);
  
  console.warn(`[Auth] Invalid/missing credentials from ${clientIP} - ${result.locked ? 'LOCKED OUT' : `${result.remainingAttempts} attempts remaining`}`);
  
  if (result.locked) {
    return res.status(429).json({
      error: 'Too many failed authentication attempts',
      message: 'Access temporarily blocked. Try again in 15 minutes.',
      retryAfter: 15
    });
  }
  
  return res.status(401).json({
    error: 'Authentication required',
    message: 'Valid device token or master secret required',
    remainingAttempts: result.remainingAttempts
  });
}

export function getAuthStatus(): {
  configured: boolean;
  lockedIPs: number;
  publicRoutes: string[];
} {
  return {
    configured: !!ZEKE_SECRET,
    lockedIPs: Array.from(failedAttempts.values()).filter(r => r.lockedUntil && r.lockedUntil > Date.now()).length,
    publicRoutes: PUBLIC_ROUTES
  };
}

export function getLockedIPs(): Array<{ ip: string; unlocksAt: Date; attemptCount: number }> {
  const now = Date.now();
  const locked: Array<{ ip: string; unlocksAt: Date; attemptCount: number }> = [];
  
  failedAttempts.forEach((record, ip) => {
    if (record.lockedUntil && record.lockedUntil > now) {
      locked.push({
        ip,
        unlocksAt: new Date(record.lockedUntil),
        attemptCount: record.count
      });
    }
  });
  
  return locked;
}

export function unlockIP(ip: string): boolean {
  if (failedAttempts.has(ip)) {
    failedAttempts.delete(ip);
    return true;
  }
  return false;
}

export function clearAllLockouts(): number {
  const count = failedAttempts.size;
  failedAttempts.clear();
  console.log(`[Auth] Cleared all ${count} lockouts/failed attempts`);
  return count;
}

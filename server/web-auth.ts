/**
 * Web Authentication Module
 * 
 * Implements SMS-based authentication for the web dashboard:
 * 1. User enters phone number -> 4-digit code sent via SMS
 * 2. User enters code -> code verified, session token issued
 * 3. Session token used for persistent authentication via cookie
 */

import crypto from 'crypto';
import type { Express, Request, Response, NextFunction } from 'express';
import { getTwilioClient, getTwilioFromPhoneNumber, isTwilioConfigured } from './twilioClient';
import { db, pool } from './db';
import { eq, and, lte } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import * as schema from '@shared/schema';
import { 
  webLoginRequestSchema, 
  webLoginVerifySchema,
  MASTER_ADMIN_PHONE,
  type WebLoginRequestResponse,
  type WebLoginVerifyResponse,
  type WebSession,
} from '@shared/schema';

const CODE_EXPIRY_SECONDS = 300; // 5 minutes
const SESSION_EXPIRY_DAYS = 30;
const MAX_ATTEMPTS = 3;

function getNow(): string {
  return new Date().toISOString();
}

function generate4DigitCode(): string {
  return crypto.randomInt(1000, 9999).toString();
}

function generateSessionId(): string {
  return crypto.randomBytes(24).toString('hex');
}

function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function timingSafeCodeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      crypto.timingSafeEqual(bufA, bufA);
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

function isAllowedPhone(phone: string): boolean {
  if (!MASTER_ADMIN_PHONE) return false;
  const normalized = phone.replace(/\D/g, '');
  return normalized === MASTER_ADMIN_PHONE || normalized.endsWith(MASTER_ADMIN_PHONE);
}

async function sendLoginCode(phoneNumber: string, code: string): Promise<void> {
  const client = await getTwilioClient();
  const fromNumber = await getTwilioFromPhoneNumber();
  
  const message = `ZEKE Dashboard Login Code: ${code}\n\nEnter this code to access your dashboard. Expires in 5 minutes.`;
  
  await client.messages.create({
    body: message,
    from: fromNumber,
    to: phoneNumber
  });
  
  console.log(`[WEB AUTH] Sent login code to ${phoneNumber.substring(0, 6)}***`);
}

async function cleanupExpiredCodes(): Promise<void> {
  const now = getNow();
  await db.delete(schema.webLoginCodes).where(lte(schema.webLoginCodes.expiresAt, now));
}

async function cleanupExpiredSessions(): Promise<void> {
  const now = getNow();
  await db.delete(schema.webSessions).where(lte(schema.webSessions.expiresAt, now));
}

export function registerWebAuthEndpoints(app: Express): void {
  app.post('/api/web-auth/request-code', async (req: Request, res: Response) => {
    try {
      await cleanupExpiredCodes();
      
      const twilioReady = await isTwilioConfigured();
      if (!twilioReady) {
        const response: WebLoginRequestResponse = {
          success: false,
          error: "SMS authentication not configured."
        };
        res.status(400).json(response);
        return;
      }
      
      const parseResult = webLoginRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        const response: WebLoginRequestResponse = {
          success: false,
          error: "Invalid phone number format"
        };
        res.status(400).json(response);
        return;
      }
      
      const normalizedPhone = normalizePhoneNumber(parseResult.data.phoneNumber);
      
      if (!isAllowedPhone(normalizedPhone)) {
        const response: WebLoginRequestResponse = {
          success: false,
          error: "Phone number not authorized for dashboard access"
        };
        res.status(403).json(response);
        return;
      }
      
      const code = generate4DigitCode();
      const sessionId = generateSessionId();
      const expiresAt = new Date(Date.now() + CODE_EXPIRY_SECONDS * 1000).toISOString();
      const now = getNow();
      
      await db.insert(schema.webLoginCodes).values({
        id: uuidv4(),
        sessionId,
        code,
        phoneNumber: normalizedPhone,
        attempts: 0,
        expiresAt,
        createdAt: now,
      });
      
      await sendLoginCode(normalizedPhone, code);
      
      console.log(`[WEB AUTH] Code requested for phone: ${normalizedPhone.substring(0, 6)}***`);
      
      const response: WebLoginRequestResponse = {
        success: true,
        sessionId,
        expiresIn: CODE_EXPIRY_SECONDS,
        message: "Verification code sent to your phone"
      };
      res.status(200).json(response);
      
    } catch (error: any) {
      console.error('[WEB AUTH] Error requesting code:', error);
      const response: WebLoginRequestResponse = {
        success: false,
        error: "Failed to send verification code. Please try again."
      };
      res.status(500).json(response);
    }
  });
  
  app.post('/api/web-auth/verify-code', async (req: Request, res: Response) => {
    try {
      await cleanupExpiredCodes();
      
      const parseResult = webLoginVerifySchema.safeParse(req.body);
      if (!parseResult.success) {
        const response: WebLoginVerifyResponse = {
          success: false,
          error: "Invalid request: sessionId and 4-digit code are required"
        };
        res.status(400).json(response);
        return;
      }
      
      const { sessionId, code } = parseResult.data;
      
      const [loginCode] = await db.select().from(schema.webLoginCodes)
        .where(eq(schema.webLoginCodes.sessionId, sessionId));
      
      if (!loginCode) {
        const response: WebLoginVerifyResponse = {
          success: false,
          error: "Session expired or invalid. Please request a new code."
        };
        res.status(400).json(response);
        return;
      }
      
      if (new Date(loginCode.expiresAt) < new Date()) {
        await db.delete(schema.webLoginCodes).where(eq(schema.webLoginCodes.sessionId, sessionId));
        const response: WebLoginVerifyResponse = {
          success: false,
          error: "Session expired or invalid. Please request a new code."
        };
        res.status(400).json(response);
        return;
      }
      
      if (loginCode.attempts >= MAX_ATTEMPTS) {
        await db.delete(schema.webLoginCodes).where(eq(schema.webLoginCodes.sessionId, sessionId));
        const response: WebLoginVerifyResponse = {
          success: false,
          error: "Too many failed attempts. Please request a new code.",
          attemptsRemaining: 0
        };
        res.status(400).json(response);
        return;
      }
      
      if (!timingSafeCodeCompare(loginCode.code, code)) {
        await db.update(schema.webLoginCodes)
          .set({ attempts: loginCode.attempts + 1 })
          .where(eq(schema.webLoginCodes.sessionId, sessionId));
        
        const remaining = MAX_ATTEMPTS - loginCode.attempts - 1;
        
        if (remaining <= 0) {
          await db.delete(schema.webLoginCodes).where(eq(schema.webLoginCodes.sessionId, sessionId));
          const response: WebLoginVerifyResponse = {
            success: false,
            error: "Too many failed attempts. Please request a new code.",
            attemptsRemaining: 0
          };
          res.status(400).json(response);
          return;
        }
        
        const response: WebLoginVerifyResponse = {
          success: false,
          error: `Invalid code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
          attemptsRemaining: remaining
        };
        res.status(400).json(response);
        return;
      }
      
      const sessionToken = generateSessionToken();
      const now = getNow();
      const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
      
      await db.insert(schema.webSessions).values({
        id: uuidv4(),
        sessionToken,
        phoneNumber: loginCode.phoneNumber,
        isAdmin: isAllowedPhone(loginCode.phoneNumber),
        expiresAt,
        createdAt: now,
        lastAccessedAt: now,
      });
      
      await db.delete(schema.webLoginCodes).where(eq(schema.webLoginCodes.sessionId, sessionId));
      
      res.cookie('zeke_session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
        path: '/',
      });
      
      console.log(`[WEB AUTH] Login successful for phone: ${loginCode.phoneNumber.substring(0, 6)}***`);
      
      const response: WebLoginVerifyResponse = {
        success: true,
        sessionToken,
        isAdmin: isAllowedPhone(loginCode.phoneNumber),
        message: "Login successful"
      };
      res.status(200).json(response);
      
    } catch (error: any) {
      console.error('[WEB AUTH] Error verifying code:', error);
      const response: WebLoginVerifyResponse = {
        success: false,
        error: "Failed to verify code. Please try again."
      };
      res.status(500).json(response);
    }
  });
  
  app.post('/api/web-auth/logout', async (req: Request, res: Response) => {
    try {
      const sessionToken = req.cookies?.zeke_session;
      
      if (sessionToken) {
        await db.delete(schema.webSessions).where(eq(schema.webSessions.sessionToken, sessionToken));
      }
      
      res.clearCookie('zeke_session', { path: '/' });
      res.status(200).json({ success: true, message: "Logged out successfully" });
      
    } catch (error: any) {
      console.error('[WEB AUTH] Error logging out:', error);
      res.status(500).json({ success: false, error: "Failed to logout" });
    }
  });
  
  app.get('/api/web-auth/session', async (req: Request, res: Response) => {
    try {
      await cleanupExpiredSessions();
      
      const sessionToken = req.cookies?.zeke_session;
      
      if (!sessionToken) {
        res.status(200).json({ authenticated: false });
        return;
      }
      
      const [session] = await db.select().from(schema.webSessions)
        .where(eq(schema.webSessions.sessionToken, sessionToken));
      
      if (!session || new Date(session.expiresAt) < new Date()) {
        res.clearCookie('zeke_session', { path: '/' });
        res.status(200).json({ authenticated: false });
        return;
      }
      
      await db.update(schema.webSessions)
        .set({ lastAccessedAt: getNow() })
        .where(eq(schema.webSessions.sessionToken, sessionToken));
      
      res.status(200).json({
        authenticated: true,
        isAdmin: session.isAdmin,
        phoneNumber: session.phoneNumber,
      });
      
    } catch (error: any) {
      console.error('[WEB AUTH] Error checking session:', error);
      res.status(500).json({ authenticated: false });
    }
  });
  
  app.get('/api/web-auth/status', async (_req: Request, res: Response) => {
    try {
      const twilioReady = await isTwilioConfigured();
      const hasMasterPhone = !!MASTER_ADMIN_PHONE;
      
      res.status(200).json({
        configured: twilioReady && hasMasterPhone,
        twilioReady,
        hasMasterPhone,
      });
      
    } catch (error: any) {
      console.error('[WEB AUTH] Error checking status:', error);
      res.status(500).json({ configured: false });
    }
  });
}

export async function getWebSession(sessionToken: string): Promise<WebSession | null> {
  if (!sessionToken) return null;
  
  const [session] = await db.select().from(schema.webSessions)
    .where(eq(schema.webSessions.sessionToken, sessionToken));
  
  if (!session || new Date(session.expiresAt) < new Date()) {
    return null;
  }
  
  return session;
}

export function requireWebAuth(requireAdmin: boolean = false) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionToken = req.cookies?.zeke_session;
      
      if (!sessionToken) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      
      const session = await getWebSession(sessionToken);
      
      if (!session) {
        res.clearCookie('zeke_session', { path: '/' });
        res.status(401).json({ error: "Session expired. Please login again." });
        return;
      }
      
      if (requireAdmin && !session.isAdmin) {
        res.status(403).json({ error: "Admin access required" });
        return;
      }
      
      (req as any).webSession = session;
      next();
      
    } catch (error) {
      console.error('[WEB AUTH] Middleware error:', error);
      res.status(500).json({ error: "Authentication error" });
    }
  };
}

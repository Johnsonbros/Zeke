/**
 * SMS-based Device Pairing
 * 
 * Implements secure SMS pairing flow:
 * 1. User requests pairing code -> 4-digit code sent via SMS
 * 2. User enters code in app -> code verified, device token issued
 * 3. Device token used for persistent authentication
 */

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { getTwilioClient, getTwilioFromPhoneNumber, isTwilioConfigured } from './twilioClient';
import { generateDeviceToken, generateDeviceId } from './mobileAuth';
import { 
  createPairingCode, 
  getPairingCodeBySessionId, 
  incrementPairingCodeAttempts, 
  deletePairingCode, 
  cleanupExpiredPairingCodes,
  countPendingPairingCodes,
  countPairingCodesForDevice,
  deleteOldestPairingCodeForDevice,
  createDeviceToken
} from './db';
import { 
  smsCodeRequestSchema, 
  smsCodeVerifySchema,
  type SmsCodeRequestSuccessResponse,
  type SmsCodeRequestErrorResponse,
  type SmsCodeVerifySuccessResponse,
  type SmsCodeVerifyErrorResponse,
  type PairingStatusResponse
} from '@shared/schema';

const CODE_EXPIRY_SECONDS = 300; // 5 minutes
const MAX_ATTEMPTS = 3;
const MAX_PENDING_CODES_PER_DEVICE = 3; // Limit codes to prevent flooding

function getMasterPhone(): string | null {
  return process.env.ZEKE_MASTER_PHONE || null;
}

function generate4DigitCode(): string {
  return crypto.randomInt(1000, 9999).toString();
}

function generateSessionId(): string {
  return crypto.randomBytes(24).toString('hex');
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

async function sendSmsCode(phoneNumber: string, code: string, deviceName: string): Promise<void> {
  const client = await getTwilioClient();
  const fromNumber = await getTwilioFromPhoneNumber();
  
  const message = `ZEKE Pairing Code: ${code}\n\nEnter this code in the app to pair "${deviceName}". Expires in 5 minutes.`;
  
  await client.messages.create({
    body: message,
    from: fromNumber,
    to: phoneNumber
  });
  
  console.log(`[SMS PAIRING] Sent pairing code to ${phoneNumber.substring(0, 6)}***`);
}

export function registerSmsPairingEndpoints(app: Express): void {
  // POST /api/auth/request-sms-code - Generate and send SMS pairing code
  app.post('/api/auth/request-sms-code', async (req: Request, res: Response) => {
    try {
      // Cleanup expired codes periodically
      cleanupExpiredPairingCodes();
      
      // Check if SMS pairing is configured
      const masterPhone = getMasterPhone();
      const twilioReady = await isTwilioConfigured();
      
      if (!masterPhone) {
        const response: SmsCodeRequestErrorResponse = {
          success: false,
          error: "SMS pairing not configured. Please set ZEKE_MASTER_PHONE."
        };
        res.status(400).json(response);
        return;
      }
      
      if (!twilioReady) {
        const response: SmsCodeRequestErrorResponse = {
          success: false,
          error: "Twilio not configured. Please connect Twilio integration."
        };
        res.status(400).json(response);
        return;
      }
      
      // Validate request body
      const parseResult = smsCodeRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        const response: SmsCodeRequestErrorResponse = {
          success: false,
          error: "Invalid request: deviceName is required"
        };
        res.status(400).json(response);
        return;
      }
      
      const { deviceName } = parseResult.data;
      
      // Limit pending codes per device to prevent flooding
      const existingCount = countPairingCodesForDevice(deviceName);
      if (existingCount >= MAX_PENDING_CODES_PER_DEVICE) {
        deleteOldestPairingCodeForDevice(deviceName);
      }
      
      // Generate code and session
      const code = generate4DigitCode();
      const sessionId = generateSessionId();
      const expiresAt = new Date(Date.now() + CODE_EXPIRY_SECONDS * 1000).toISOString();
      
      // Store in database
      createPairingCode(sessionId, code, deviceName, expiresAt);
      
      // Send SMS
      await sendSmsCode(masterPhone, code, deviceName);
      
      console.log(`[SMS PAIRING] Code requested for device: ${deviceName}, session: ${sessionId.substring(0, 8)}...`);
      
      const response: SmsCodeRequestSuccessResponse = {
        success: true,
        sessionId,
        expiresIn: CODE_EXPIRY_SECONDS,
        message: "Verification code sent to your phone"
      };
      res.status(200).json(response);
      
    } catch (error: any) {
      console.error('[SMS PAIRING] Error requesting code:', error);
      const response: SmsCodeRequestErrorResponse = {
        success: false,
        error: "Failed to send verification code. Please try again."
      };
      res.status(500).json(response);
    }
  });
  
  // POST /api/auth/verify-sms-code - Verify code and issue device token
  app.post('/api/auth/verify-sms-code', async (req: Request, res: Response) => {
    try {
      // Cleanup expired codes
      cleanupExpiredPairingCodes();
      
      // Validate request body
      const parseResult = smsCodeVerifySchema.safeParse(req.body);
      if (!parseResult.success) {
        const response: SmsCodeVerifyErrorResponse = {
          success: false,
          error: "Invalid request: sessionId and 4-digit code are required"
        };
        res.status(400).json(response);
        return;
      }
      
      const { sessionId, code } = parseResult.data;
      
      // Find the pairing code record
      const pairingCode = getPairingCodeBySessionId(sessionId);
      
      if (!pairingCode) {
        const response: SmsCodeVerifyErrorResponse = {
          success: false,
          error: "Session expired or invalid. Please request a new code."
        };
        res.status(400).json(response);
        return;
      }
      
      // Check if expired
      if (new Date(pairingCode.expiresAt) < new Date()) {
        deletePairingCode(sessionId);
        const response: SmsCodeVerifyErrorResponse = {
          success: false,
          error: "Session expired or invalid. Please request a new code."
        };
        res.status(400).json(response);
        return;
      }
      
      // Check attempts
      if (pairingCode.attempts >= MAX_ATTEMPTS) {
        deletePairingCode(sessionId);
        const response: SmsCodeVerifyErrorResponse = {
          success: false,
          error: "Too many failed attempts. Please request a new code.",
          attemptsRemaining: 0
        };
        res.status(400).json(response);
        return;
      }
      
      // Verify code using timing-safe comparison
      if (!timingSafeCodeCompare(pairingCode.code, code)) {
        const newAttempts = incrementPairingCodeAttempts(sessionId);
        const remaining = MAX_ATTEMPTS - newAttempts;
        
        if (remaining <= 0) {
          deletePairingCode(sessionId);
          const response: SmsCodeVerifyErrorResponse = {
            success: false,
            error: "Too many failed attempts. Please request a new code.",
            attemptsRemaining: 0
          };
          res.status(400).json(response);
          return;
        }
        
        const response: SmsCodeVerifyErrorResponse = {
          success: false,
          error: `Invalid code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
          attemptsRemaining: remaining
        };
        res.status(400).json(response);
        return;
      }
      
      // Code is valid! Generate device token
      const deviceToken = generateDeviceToken();
      const deviceId = generateDeviceId();
      
      // Create device token in database
      createDeviceToken(deviceToken, deviceId, pairingCode.deviceName);
      
      // Delete the used pairing code
      deletePairingCode(sessionId);
      
      console.log(`[SMS PAIRING] Device paired successfully: ${pairingCode.deviceName} (${deviceId})`);
      
      const response: SmsCodeVerifySuccessResponse = {
        success: true,
        deviceToken,
        deviceId,
        message: "Device paired successfully"
      };
      res.status(200).json(response);
      
    } catch (error: any) {
      console.error('[SMS PAIRING] Error verifying code:', error);
      const response: SmsCodeVerifyErrorResponse = {
        success: false,
        error: "Failed to verify code. Please try again."
      };
      res.status(500).json(response);
    }
  });
  
  // GET /api/auth/pairing-status - Check pairing configuration status
  app.get('/api/auth/pairing-status', async (_req: Request, res: Response) => {
    try {
      const masterPhone = getMasterPhone();
      const twilioReady = await isTwilioConfigured();
      const pendingCodes = countPendingPairingCodes();
      
      const response: PairingStatusResponse = {
        configured: !!masterPhone && twilioReady,
        pendingCodes
      };
      res.status(200).json(response);
      
    } catch (error: any) {
      console.error('[SMS PAIRING] Error checking status:', error);
      res.status(500).json({ configured: false, pendingCodes: 0 });
    }
  });
}

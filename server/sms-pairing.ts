/**
 * SMS-based Device Pairing
 * 
 * Implements secure SMS pairing flow:
 * 1. User requests pairing code -> 6-digit code sent via SMS
 * 2. User enters code in app -> code verified, device token issued
 * 3. Device token used for persistent authentication
 */

import type { Express, Request, Response } from 'express';
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
import {
  SMS_VERIFICATION_CONFIG,
  generateVerificationCode,
  generateSessionId,
  timingSafeCodeCompare,
  getMasterPhone,
  sendVerificationSms,
  checkTwilioReady,
  hasExceededMaxAttempts,
  calculateAttemptsRemaining,
  isCodeExpired,
} from './services/smsVerification';

const MAX_PENDING_CODES_PER_DEVICE = 3;

export function registerSmsPairingEndpoints(app: Express): void {
  // POST /api/auth/request-sms-code - Generate and send SMS pairing code
  app.post('/api/auth/request-sms-code', async (req: Request, res: Response) => {
    try {
      cleanupExpiredPairingCodes();
      
      const masterPhone = getMasterPhone();
      const twilioReady = await checkTwilioReady();
      
      if (!masterPhone) {
        const response: SmsCodeRequestErrorResponse = {
          success: false,
          error: "SMS pairing not configured. MASTER_ADMIN_PHONE is not set."
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
      
      const existingCount = countPairingCodesForDevice(deviceName);
      if (existingCount >= MAX_PENDING_CODES_PER_DEVICE) {
        deleteOldestPairingCodeForDevice(deviceName);
      }
      
      const code = generateVerificationCode();
      const sessionId = generateSessionId();
      const expiresAt = new Date(Date.now() + SMS_VERIFICATION_CONFIG.CODE_EXPIRY_SECONDS * 1000).toISOString();
      
      console.log(`[SMS PAIRING] Generated ${code.length}-digit code for device: ${deviceName}`);
      
      createPairingCode(sessionId, code, deviceName, expiresAt);
      
      await sendVerificationSms(masterPhone, code, { type: 'device_pairing', deviceName });
      
      console.log(`[SMS PAIRING] Code sent for device: ${deviceName}, session: ${sessionId.substring(0, 8)}...`);
      
      const response: SmsCodeRequestSuccessResponse = {
        success: true,
        sessionId,
        expiresIn: SMS_VERIFICATION_CONFIG.CODE_EXPIRY_SECONDS,
        message: `Verification code sent to your phone (v6-${Date.now().toString(36)})`
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
      cleanupExpiredPairingCodes();
      
      const parseResult = smsCodeVerifySchema.safeParse(req.body);
      if (!parseResult.success) {
        const response: SmsCodeVerifyErrorResponse = {
          success: false,
          error: `Invalid request: sessionId and ${SMS_VERIFICATION_CONFIG.CODE_LENGTH}-digit code are required`
        };
        res.status(400).json(response);
        return;
      }
      
      const { sessionId, code } = parseResult.data;
      
      const pairingCode = getPairingCodeBySessionId(sessionId);
      
      if (!pairingCode) {
        const response: SmsCodeVerifyErrorResponse = {
          success: false,
          error: "Session expired or invalid. Please request a new code."
        };
        res.status(400).json(response);
        return;
      }
      
      if (isCodeExpired(pairingCode.expiresAt)) {
        deletePairingCode(sessionId);
        const response: SmsCodeVerifyErrorResponse = {
          success: false,
          error: "Session expired or invalid. Please request a new code."
        };
        res.status(400).json(response);
        return;
      }
      
      if (hasExceededMaxAttempts(pairingCode.attempts)) {
        deletePairingCode(sessionId);
        const response: SmsCodeVerifyErrorResponse = {
          success: false,
          error: "Too many failed attempts. Please request a new code.",
          attemptsRemaining: 0
        };
        res.status(400).json(response);
        return;
      }
      
      if (!timingSafeCodeCompare(pairingCode.code, code)) {
        const newAttempts = incrementPairingCodeAttempts(sessionId);
        const remaining = calculateAttemptsRemaining(newAttempts);
        
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
      const twilioReady = await checkTwilioReady();
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

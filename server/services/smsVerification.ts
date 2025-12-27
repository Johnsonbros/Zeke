/**
 * SMS Verification Service
 * 
 * Centralized SMS code generation, delivery, and verification logic.
 * Used by both mobile app pairing and web authentication flows.
 */

import crypto from 'crypto';
import { getTwilioClient, getTwilioFromPhoneNumber, isTwilioConfigured } from '../twilioClient';
import { MASTER_ADMIN_PHONE } from '@shared/schema';

export const SMS_VERIFICATION_CONFIG = {
  CODE_LENGTH: 6,
  CODE_EXPIRY_SECONDS: 300, // 5 minutes
  MAX_ATTEMPTS: 3,
  SESSION_ID_BYTES: 24,
} as const;

export function generateVerificationCode(): string {
  const codeLength = SMS_VERIFICATION_CONFIG.CODE_LENGTH;
  const min = Math.pow(10, codeLength - 1);
  const max = Math.pow(10, codeLength) - 1;
  const code = crypto.randomInt(min, max + 1).toString();
  console.log(`[SMS Verification] generateVerificationCode: config.CODE_LENGTH=${codeLength}, min=${min}, max=${max}, generatedLength=${code.length}`);
  return code;
}

export function generateSessionId(): string {
  return crypto.randomBytes(SMS_VERIFICATION_CONFIG.SESSION_ID_BYTES).toString('hex');
}

export function generateSecureToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function timingSafeCodeCompare(a: string, b: string): boolean {
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

export function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

export function getMasterPhone(): string | null {
  const override = process.env.ZEKE_MASTER_PHONE;
  if (override) return normalizePhoneNumber(override);
  
  return MASTER_ADMIN_PHONE ? `+1${MASTER_ADMIN_PHONE}` : null;
}

export function isAuthorizedPhone(phone: string): boolean {
  if (!MASTER_ADMIN_PHONE) return false;
  const normalized = phone.replace(/\D/g, '');
  return normalized === MASTER_ADMIN_PHONE || normalized.endsWith(MASTER_ADMIN_PHONE);
}

export function getCodeExpiryDate(): Date {
  return new Date(Date.now() + SMS_VERIFICATION_CONFIG.CODE_EXPIRY_SECONDS * 1000);
}

export type SmsMessageContext = 
  | { type: 'device_pairing'; deviceName: string }
  | { type: 'web_login' }
  | { type: 'custom'; message: string };

function formatSmsMessage(code: string, context: SmsMessageContext): string {
  switch (context.type) {
    case 'device_pairing':
      return `ZEKE Pairing Code: ${code}\n\nEnter this 6-digit code in the app to pair "${context.deviceName}". Expires in 5 minutes.`;
    case 'web_login':
      return `ZEKE Dashboard Login Code: ${code}\n\nEnter this code to access your dashboard. Expires in 5 minutes.`;
    case 'custom':
      return context.message.replace('{code}', code);
  }
}

export async function sendVerificationSms(
  phoneNumber: string, 
  code: string, 
  context: SmsMessageContext
): Promise<void> {
  const client = await getTwilioClient();
  const fromNumber = await getTwilioFromPhoneNumber();
  
  const message = formatSmsMessage(code, context);
  
  await client.messages.create({
    body: message,
    from: fromNumber,
    to: phoneNumber
  });
  
  const logContext = context.type === 'device_pairing' ? `device: ${context.deviceName}` : context.type;
  console.log(`[SMS Verification] Sent ${SMS_VERIFICATION_CONFIG.CODE_LENGTH}-digit code to ${phoneNumber.substring(0, 6)}*** (${logContext})`);
}

export async function checkTwilioReady(): Promise<boolean> {
  return isTwilioConfigured();
}

export function calculateAttemptsRemaining(currentAttempts: number): number {
  return Math.max(0, SMS_VERIFICATION_CONFIG.MAX_ATTEMPTS - currentAttempts);
}

export function hasExceededMaxAttempts(attempts: number): boolean {
  return attempts >= SMS_VERIFICATION_CONFIG.MAX_ATTEMPTS;
}

export function isCodeExpired(expiresAt: Date | string): boolean {
  const expiry = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  return expiry < new Date();
}

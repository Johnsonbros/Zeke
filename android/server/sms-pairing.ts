/**
 * ============================================================================
 * CRITICAL FILE - SMS PAIRING SERVICE
 * ============================================================================
 * 
 * This file handles SMS code generation and verification for ZEKE AI.
 * 
 * DO NOT MODIFY without explicit approval from the project owner.
 * 
 * Critical functions:
 * - requestPairingCode() - Generates and sends SMS code
 * - verifyPairingCode() - Validates code and issues device token
 * - getPairingStatus() - Checks SMS pairing configuration
 * 
 * Changes to this file can break:
 * - SMS code delivery
 * - Code verification
 * - Device registration
 * 
 * Related critical files:
 * - client/screens/PairingScreen.tsx
 * - client/context/AuthContext.tsx
 * - server/routes.ts
 * - server/device-auth.ts
 * ============================================================================
 */

import crypto from "crypto";
import { sendSms } from "./twilio";
import { registerDevice } from "./device-auth";
import { db } from "./db";
import { pairingCodes } from "@shared/schema";
import { eq, lt } from "drizzle-orm";

const MASTER_PHONE_NUMBER = process.env.ZEKE_MASTER_PHONE;
const CODE_EXPIRY_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;

function generateCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function generateSessionId(): string {
  return crypto.randomBytes(16).toString("hex");
}

async function cleanupExpiredCodes(): Promise<void> {
  const now = new Date();
  try {
    await db.delete(pairingCodes).where(lt(pairingCodes.expiresAt, now));
  } catch (error) {
    console.error("[SMS Pairing] Failed to cleanup expired codes:", error);
  }
}

export async function requestPairingCode(deviceName: string): Promise<{
  success: boolean;
  sessionId?: string;
  error?: string;
  expiresIn?: number;
}> {
  await cleanupExpiredCodes();

  if (!MASTER_PHONE_NUMBER) {
    console.error("[SMS Pairing] ZEKE_MASTER_PHONE not configured");
    return {
      success: false,
      error: "SMS pairing not configured. Please set ZEKE_MASTER_PHONE.",
    };
  }

  const code = generateCode();
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);

  try {
    await db.insert(pairingCodes).values({
      sessionId,
      code,
      deviceName,
      attempts: 0,
      expiresAt,
    });

    await sendSms(
      MASTER_PHONE_NUMBER,
      `ZEKE Pairing Code: ${code}\n\nEnter this code in the app to pair "${deviceName}". Expires in 5 minutes.`
    );

    console.log(`[SMS Pairing] Code sent to master phone for device: ${deviceName}`);

    return {
      success: true,
      sessionId,
      expiresIn: CODE_EXPIRY_MS / 1000,
    };
  } catch (error) {
    console.error("[SMS Pairing] Failed to send SMS:", error);
    try {
      await db.delete(pairingCodes).where(eq(pairingCodes.sessionId, sessionId));
    } catch (deleteError) {
      console.error("[SMS Pairing] Failed to cleanup failed code:", deleteError);
    }
    return {
      success: false,
      error: "Failed to send verification code. Please try again.",
    };
  }
}

export async function verifyPairingCode(
  sessionId: string,
  code: string
): Promise<{
  success: boolean;
  deviceToken?: string;
  deviceId?: string;
  error?: string;
  attemptsRemaining?: number;
}> {
  await cleanupExpiredCodes();

  const [pending] = await db
    .select()
    .from(pairingCodes)
    .where(eq(pairingCodes.sessionId, sessionId))
    .limit(1);

  if (!pending) {
    return {
      success: false,
      error: "Session expired or invalid. Please request a new code.",
    };
  }

  if (new Date() > pending.expiresAt) {
    await db.delete(pairingCodes).where(eq(pairingCodes.sessionId, sessionId));
    return {
      success: false,
      error: "Code expired. Please request a new code.",
    };
  }

  const newAttempts = pending.attempts + 1;
  await db
    .update(pairingCodes)
    .set({ attempts: newAttempts })
    .where(eq(pairingCodes.sessionId, sessionId));

  if (pending.code !== code) {
    const attemptsRemaining = MAX_ATTEMPTS - newAttempts;

    if (attemptsRemaining <= 0) {
      await db.delete(pairingCodes).where(eq(pairingCodes.sessionId, sessionId));
      return {
        success: false,
        error: "Too many failed attempts. Please request a new code.",
        attemptsRemaining: 0,
      };
    }

    return {
      success: false,
      error: `Invalid code. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} remaining.`,
      attemptsRemaining,
    };
  }

  await db.delete(pairingCodes).where(eq(pairingCodes.sessionId, sessionId));

  try {
    const deviceData = await registerDevice(pending.deviceName);

    console.log(`[SMS Pairing] Device paired successfully: ${pending.deviceName} (${deviceData.deviceId})`);

    return {
      success: true,
      deviceToken: deviceData.token,
      deviceId: deviceData.deviceId,
    };
  } catch (error) {
    console.error("[SMS Pairing] Failed to register device:", error);
    return {
      success: false,
      error: "Failed to register device. Please try again.",
    };
  }
}

export async function getPairingStatus(): Promise<{
  configured: boolean;
  pendingCodes: number;
}> {
  await cleanupExpiredCodes();
  const codes = await db.select().from(pairingCodes);
  return {
    configured: !!MASTER_PHONE_NUMBER,
    pendingCodes: codes.length,
  };
}

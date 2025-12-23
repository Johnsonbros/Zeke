/**
 * ============================================================================
 * CRITICAL FILE - DEVICE AUTHENTICATION
 * ============================================================================
 * 
 * This file handles device token management for ZEKE AI.
 * 
 * DO NOT MODIFY without explicit approval from the project owner.
 * 
 * Critical functions:
 * - validateDeviceToken() - Verifies device tokens
 * - generateDeviceToken() - Creates new device tokens
 * - Token caching and persistence
 * 
 * Changes to this file can break:
 * - Device authentication
 * - Token validation
 * - Security of the pairing flow
 * 
 * Related critical files:
 * - client/screens/PairingScreen.tsx
 * - client/context/AuthContext.tsx
 * - server/routes.ts
 * - server/sms-pairing.ts
 * ============================================================================
 */

import crypto from 'crypto';
import { db } from './db';
import { deviceTokens } from '@shared/schema';
import { eq } from 'drizzle-orm';

const ZEKE_SECRET = process.env.ZEKE_SHARED_SECRET;
const TOKEN_EXPIRY_DAYS = 30;
const TOKEN_EXPIRY_MS = TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

interface DeviceTokenData {
  token: string;
  deviceId: string;
  deviceName: string;
  createdAt: Date;
  lastUsed: Date;
}

const tokenCache = new Map<string, DeviceTokenData>();
let cacheInitialized = false;

async function initializeCache(): Promise<void> {
  if (cacheInitialized) return;
  
  try {
    const storedTokens = await db.select().from(deviceTokens);
    for (const token of storedTokens) {
      tokenCache.set(token.token, {
        token: token.token,
        deviceId: token.deviceId,
        deviceName: token.deviceName,
        createdAt: token.createdAt,
        lastUsed: token.lastUsedAt,
      });
    }
    cacheInitialized = true;
    console.log(`[DeviceAuth] Loaded ${storedTokens.length} device tokens from database`);
  } catch (error) {
    console.error('[DeviceAuth] Failed to load tokens from database:', error);
  }
}

initializeCache();

export function generateDeviceToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function validateMasterSecret(secret: string): boolean {
  if (!ZEKE_SECRET) {
    console.warn('[DeviceAuth] ZEKE_SHARED_SECRET not configured');
    return false;
  }
  
  const inputBuffer = Buffer.from(secret);
  const expectedBuffer = Buffer.from(ZEKE_SECRET);
  
  if (inputBuffer.length !== expectedBuffer.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(inputBuffer, expectedBuffer);
}

export async function registerDevice(deviceName: string): Promise<DeviceTokenData> {
  const token = generateDeviceToken();
  const deviceId = `device_${crypto.randomBytes(8).toString('hex')}`;
  const now = new Date();
  
  const deviceToken: DeviceTokenData = {
    token,
    deviceId,
    deviceName,
    createdAt: now,
    lastUsed: now
  };
  
  try {
    await db.insert(deviceTokens).values({
      token,
      deviceId,
      deviceName,
    });
    console.log(`[DeviceAuth] Registered device in database: ${deviceName} (${deviceId})`);
  } catch (error) {
    console.error('[DeviceAuth] Failed to save device to database:', error);
  }
  
  tokenCache.set(token, deviceToken);
  
  return deviceToken;
}

export function validateDeviceToken(token: string): DeviceTokenData | null {
  const device = tokenCache.get(token);
  if (device) {
    const now = new Date();
    const tokenAge = now.getTime() - device.createdAt.getTime();
    
    if (tokenAge > TOKEN_EXPIRY_MS) {
      console.log(`[DeviceAuth] Token expired for device: ${device.deviceId} (age: ${Math.floor(tokenAge / (24 * 60 * 60 * 1000))} days)`);
      tokenCache.delete(token);
      db.delete(deviceTokens)
        .where(eq(deviceTokens.token, token))
        .catch(err => console.error('[DeviceAuth] Failed to delete expired token:', err));
      return null;
    }
    
    device.lastUsed = now;
    
    db.update(deviceTokens)
      .set({ lastUsedAt: device.lastUsed })
      .where(eq(deviceTokens.token, token))
      .catch(err => console.error('[DeviceAuth] Failed to update lastUsedAt:', err));
    
    return device;
  }
  return null;
}

export async function revokeDeviceToken(token: string): Promise<boolean> {
  const existed = tokenCache.has(token);
  tokenCache.delete(token);
  
  try {
    await db.delete(deviceTokens).where(eq(deviceTokens.token, token));
  } catch (error) {
    console.error('[DeviceAuth] Failed to delete token from database:', error);
  }
  
  return existed;
}

export async function revokeAllDeviceTokens(): Promise<number> {
  const count = tokenCache.size;
  tokenCache.clear();
  
  try {
    await db.delete(deviceTokens);
  } catch (error) {
    console.error('[DeviceAuth] Failed to delete all tokens from database:', error);
  }
  
  return count;
}

export function listDevices(): Array<Omit<DeviceTokenData, 'token'> & { tokenPreview: string; expiresAt: Date }> {
  return Array.from(tokenCache.values()).map(device => ({
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    createdAt: device.createdAt,
    lastUsed: device.lastUsed,
    tokenPreview: `${device.token.substring(0, 4)}****`,
    expiresAt: new Date(device.createdAt.getTime() + TOKEN_EXPIRY_MS),
  }));
}

export function isSecretConfigured(): boolean {
  return !!ZEKE_SECRET && ZEKE_SECRET.length >= 32;
}

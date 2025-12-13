import { createSavedPlace } from "./db";
import type { SavedPlace } from "@shared/schema";

interface PendingPlaceSave {
  latitude: string;
  longitude: string;
  accuracy?: string;
  timestamp: Date;
  expiresAt: Date;
}

const PENDING_PLACE_TIMEOUT_MINUTES = 10;

const pendingPlaceSaves: Map<string, PendingPlaceSave> = new Map();

export function setPendingPlaceSave(
  phoneNumber: string,
  latitude: string,
  longitude: string,
  accuracy?: string
): void {
  const normalizedPhone = normalizePhone(phoneNumber);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PENDING_PLACE_TIMEOUT_MINUTES * 60 * 1000);
  
  pendingPlaceSaves.set(normalizedPhone, {
    latitude,
    longitude,
    accuracy,
    timestamp: now,
    expiresAt,
  });
  
  console.log(`[PendingPlaceSave] Stored pending location for ${normalizedPhone}: ${latitude}, ${longitude}`);
}

export function getPendingPlaceSave(phoneNumber: string): PendingPlaceSave | null {
  const normalizedPhone = normalizePhone(phoneNumber);
  const pending = pendingPlaceSaves.get(normalizedPhone);
  
  if (!pending) {
    return null;
  }
  
  if (new Date() > pending.expiresAt) {
    pendingPlaceSaves.delete(normalizedPhone);
    console.log(`[PendingPlaceSave] Expired pending location for ${normalizedPhone}`);
    return null;
  }
  
  return pending;
}

export function clearPendingPlaceSave(phoneNumber: string): void {
  const normalizedPhone = normalizePhone(phoneNumber);
  pendingPlaceSaves.delete(normalizedPhone);
  console.log(`[PendingPlaceSave] Cleared pending location for ${normalizedPhone}`);
}

export function hasPendingPlaceSave(phoneNumber: string): boolean {
  return getPendingPlaceSave(phoneNumber) !== null;
}

export function completePendingPlaceSave(
  phoneNumber: string,
  placeName: string
): SavedPlace | null {
  const pending = getPendingPlaceSave(phoneNumber);
  
  if (!pending) {
    console.log(`[PendingPlaceSave] No pending location found for ${phoneNumber}`);
    return null;
  }
  
  try {
    const savedPlace = createSavedPlace({
      name: placeName.trim(),
      latitude: pending.latitude,
      longitude: pending.longitude,
      category: "other",
      isStarred: false,
      proximityAlertEnabled: false,
      proximityRadiusMeters: 200,
    });
    
    clearPendingPlaceSave(phoneNumber);
    
    console.log(`[PendingPlaceSave] Created place "${placeName}" for ${phoneNumber} at ${pending.latitude}, ${pending.longitude}`);
    
    return savedPlace;
  } catch (error) {
    console.error(`[PendingPlaceSave] Error creating place:`, error);
    clearPendingPlaceSave(phoneNumber);
    return null;
  }
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function cleanupExpiredPendingPlaces(): number {
  const now = new Date();
  let cleaned = 0;
  
  for (const [phone, pending] of pendingPlaceSaves.entries()) {
    if (now > pending.expiresAt) {
      pendingPlaceSaves.delete(phone);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[PendingPlaceSave] Cleaned up ${cleaned} expired pending place(s)`);
  }
  
  return cleaned;
}

/**
 * Location Check-In Monitor
 *
 * Proactive location-triggered check-ins for ZEKE
 * Monitors user location, detects arrival/departure events, and sends contextual SMS check-ins
 */

import cron from "node-cron";
import twilio from "twilio";
import {
  getLatestLocation,
  getOrCreateLocationState,
  updateLocationState,
  recordCheckIn,
  shouldAllowCheckIn,
  getAllSavedPlaces,
  createTwilioMessage,
  getContactByPhone,
  getContactFullName,
} from "./db";
import { assembleContext, type AppContext } from "./contextRouter";
import type { TwilioMessageSource } from "@shared/schema";

// Twilio helper functions
function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured");
  }

  return twilio(accountSid, authToken);
}

function formatPhoneNumber(phone: string): string {
  const digits = phone.trim().replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  } else if (digits.length === 10) {
    return `+1${digits}`;
  } else {
    return phone.trim().startsWith("+") ? phone.trim() : `+${digits}`;
  }
}

function logTwilioMessage(params: {
  direction: "inbound" | "outbound";
  source: TwilioMessageSource;
  fromNumber: string;
  toNumber: string;
  body: string;
  twilioSid?: string;
  status?: "queued" | "sending" | "sent" | "delivered" | "failed" | "received";
  conversationId?: string;
  errorCode?: string;
  errorMessage?: string;
}) {
  try {
    const contact = getContactByPhone(
      params.direction === "inbound" ? params.fromNumber : params.toNumber
    );

    createTwilioMessage({
      twilioSid: params.twilioSid || null,
      direction: params.direction,
      status: params.status || (params.direction === "inbound" ? "received" : "sent"),
      source: params.source,
      fromNumber: params.fromNumber,
      toNumber: params.toNumber,
      body: params.body,
      contactId: contact?.id || null,
      contactName: contact ? getContactFullName(contact) : null,
      conversationId: params.conversationId || null,
      errorCode: params.errorCode || null,
      errorMessage: params.errorMessage || null,
    });
  } catch (error) {
    console.error("[LocationCheckIn] Error logging Twilio message:", error);
  }
}

// Configuration
const CHECK_INTERVAL_MINUTES = 5; // How often to check location
const PROXIMITY_THRESHOLD_METERS = 150; // Distance threshold for "at a place"
const MIN_CHECKIN_INTERVAL_MINUTES = 30; // Minimum time between check-ins
const MAX_CHECKINS_PER_DAY = 10; // Maximum check-ins per day
const REQUIRE_SIGNIFICANT_LOCATION = true; // Only trigger on arrival/departure, not stationary updates

// Cron task reference
let monitorTask: cron.ScheduledTask | null = null;

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Find the nearest saved place to current location
 */
function findNearestPlace(
  currentLat: number,
  currentLon: number,
  maxDistance: number = PROXIMITY_THRESHOLD_METERS
): { place: any; distance: number } | null {
  const places = getAllSavedPlaces();

  let nearest: { place: any; distance: number } | null = null;

  for (const place of places) {
    const distance = calculateDistance(
      currentLat,
      currentLon,
      parseFloat(place.latitude),
      parseFloat(place.longitude)
    );

    if (distance <= maxDistance) {
      if (!nearest || distance < nearest.distance) {
        nearest = { place, distance };
      }
    }
  }

  return nearest;
}

/**
 * Generate contextual check-in message using the context router
 */
async function generateCheckInMessage(
  eventType: "arrival" | "departure",
  placeName: string,
  placeCategory: string | null,
  userId: string = "default"
): Promise<string> {
  try {
    // Build context using the context router
    const appContext: AppContext = {
      userId,
      currentRoute: "/locations", // Use locations route to get location-specific context
      userMessage: `User ${eventType === "arrival" ? "arrived at" : "departed from"} ${placeName}`,
      isAdmin: false,
      now: new Date(),
      timezone: "America/New_York", // TODO: Get from user preferences
    };

    const contextStr = await assembleContext(appContext, {
      primary: 1500,
      secondary: 800,
      tertiary: 400,
      global: 800,
      total: 5000,
    });

    // Extract relevant context snippets
    let contextualInfo = "";

    // Look for relevant tasks, grocery items, calendar events
    if (placeCategory === "grocery" && contextStr.includes("🛒 GROCERY LIST")) {
      contextualInfo = "\n\nYour grocery list is ready.";
    } else if (placeCategory === "work" && contextStr.includes("📋 TASKS")) {
      contextualInfo = "\n\nYou have tasks to work on.";
    } else if (contextStr.includes("📅 CALENDAR")) {
      contextualInfo = "\n\nCheck your calendar for today's schedule.";
    }

    // Generate appropriate message based on event type
    if (eventType === "arrival") {
      return `You've arrived at ${placeName}.${contextualInfo}`;
    } else {
      return `You've left ${placeName}. Safe travels!`;
    }
  } catch (error) {
    console.error("[LocationCheckIn] Error generating message:", error);

    // Fallback to simple message
    if (eventType === "arrival") {
      return `You've arrived at ${placeName}.`;
    } else {
      return `You've left ${placeName}.`;
    }
  }
}

/**
 * Send check-in SMS
 */
async function sendCheckInSMS(
  phoneNumber: string,
  message: string
): Promise<boolean> {
  try {
    const twilioClient = getTwilioClient();
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!fromNumber) {
      console.error("[LocationCheckIn] TWILIO_PHONE_NUMBER not configured");
      return false;
    }

    const formattedTo = formatPhoneNumber(phoneNumber);

    const result = await twilioClient.messages.create({
      body: message,
      from: fromNumber,
      to: formattedTo,
    });

    logTwilioMessage({
      direction: "outbound",
      source: "automation",
      fromNumber: fromNumber,
      toNumber: formattedTo,
      body: message,
      twilioSid: result.sid,
      status: "sent",
    });

    console.log(`[LocationCheckIn] ✅ Sent check-in SMS: ${message.substring(0, 50)}...`);
    return true;
  } catch (error) {
    console.error("[LocationCheckIn] Error sending SMS:", error);
    return false;
  }
}

/**
 * Main location monitoring logic
 */
async function checkLocationAndSendCheckIns(): Promise<void> {
  try {
    console.log("[LocationCheckIn] Checking location...");

    // Get latest GPS location
    const latestLocation = getLatestLocation();

    if (!latestLocation) {
      console.log("[LocationCheckIn] No location data available");
      return;
    }

    const currentLat = parseFloat(latestLocation.latitude);
    const currentLon = parseFloat(latestLocation.longitude);
    const locationTimestamp = latestLocation.createdAt;

    // Check if location is stale (older than 30 minutes)
    const locationAge = Date.now() - new Date(locationTimestamp).getTime();
    if (locationAge > 30 * 60 * 1000) {
      console.log("[LocationCheckIn] Location data is stale (>30 minutes old)");
      return;
    }

    // Get current location state
    const locationState = getOrCreateLocationState();

    // Find nearest place
    const nearestPlaceData = findNearestPlace(currentLat, currentLon);

    // Determine if user has moved to a new place
    const currentPlaceId = nearestPlaceData?.place.id || null;
    const currentPlaceName = nearestPlaceData?.place.name || null;
    const currentPlaceCategory = nearestPlaceData?.place.category || null;
    const previousPlaceId = locationState.currentPlaceId;

    // Detect location state transitions
    let eventType: "arrival" | "departure" | null = null;
    let eventPlaceName: string | null = null;
    let eventPlaceCategory: string | null = null;

    if (currentPlaceId && currentPlaceId !== previousPlaceId) {
      // Arrival at a new place
      eventType = "arrival";
      eventPlaceName = currentPlaceName;
      eventPlaceCategory = currentPlaceCategory;

      console.log(`[LocationCheckIn] 🚶 Arrival detected at: ${eventPlaceName}`);

      // Update location state
      updateLocationState("default", {
        currentLatitude: currentLat.toString(),
        currentLongitude: currentLon.toString(),
        currentLocationTimestamp: locationTimestamp,
        currentPlaceId,
        currentPlaceName,
        currentPlaceCategory,
        arrivedAt: new Date().toISOString(),
        previousPlaceId: locationState.currentPlaceId,
        previousPlaceName: locationState.currentPlaceName,
        previousPlaceCategory: locationState.currentPlaceCategory,
        locationState: "arrived",
        lastStateChange: new Date().toISOString(),
      });

    } else if (!currentPlaceId && previousPlaceId) {
      // Departure from previous place
      eventType = "departure";
      eventPlaceName = locationState.currentPlaceName;
      eventPlaceCategory = locationState.currentPlaceCategory;

      console.log(`[LocationCheckIn] 🚗 Departure detected from: ${eventPlaceName}`);

      // Update location state
      updateLocationState("default", {
        currentLatitude: currentLat.toString(),
        currentLongitude: currentLon.toString(),
        currentLocationTimestamp: locationTimestamp,
        currentPlaceId: null,
        currentPlaceName: null,
        currentPlaceCategory: null,
        departedAt: new Date().toISOString(),
        locationState: "departed",
        lastStateChange: new Date().toISOString(),
      });

    } else if (currentPlaceId && currentPlaceId === previousPlaceId) {
      // Still at the same place
      console.log(`[LocationCheckIn] 📍 Still at: ${currentPlaceName}`);

      // Update location timestamp only
      updateLocationState("default", {
        currentLatitude: currentLat.toString(),
        currentLongitude: currentLon.toString(),
        currentLocationTimestamp: locationTimestamp,
        locationState: "stationary",
      });

      // Don't trigger check-in for stationary updates if configured
      if (REQUIRE_SIGNIFICANT_LOCATION) {
        return;
      }
    } else {
      // In transit or no place nearby
      console.log("[LocationCheckIn] 🚶‍♂️ In transit / no saved place nearby");

      updateLocationState("default", {
        currentLatitude: currentLat.toString(),
        currentLongitude: currentLon.toString(),
        currentLocationTimestamp: locationTimestamp,
        locationState: "moving",
      });

      return; // Don't send check-in for transit
    }

    // If we have an event (arrival or departure), check if we should send a check-in
    if (eventType && eventPlaceName) {
      // Check throttling
      const { allowed, reason } = shouldAllowCheckIn(
        "default",
        MAX_CHECKINS_PER_DAY,
        MIN_CHECKIN_INTERVAL_MINUTES
      );

      if (!allowed) {
        console.log(`[LocationCheckIn] ⏸️  Check-in throttled: ${reason}`);
        return;
      }

      // Generate contextual message
      const message = await generateCheckInMessage(
        eventType,
        eventPlaceName,
        eventPlaceCategory
      );

      // Get user's phone number from environment or preferences
      const phoneNumber = process.env.USER_PHONE_NUMBER;

      if (!phoneNumber) {
        console.error("[LocationCheckIn] USER_PHONE_NUMBER not configured");
        return;
      }

      // Send SMS
      const sent = await sendCheckInSMS(phoneNumber, message);

      if (sent) {
        // Record the check-in
        recordCheckIn("default", currentPlaceId, message);
        console.log("[LocationCheckIn] ✅ Check-in recorded");
      }
    }

  } catch (error) {
    console.error("[LocationCheckIn] Error in location monitoring:", error);
  }
}

/**
 * Start the location check-in monitor
 */
export function startLocationCheckInMonitor(): void {
  if (monitorTask) {
    console.log("[LocationCheckIn] Monitor already running");
    return;
  }

  // Run every N minutes
  const cronExpression = `*/${CHECK_INTERVAL_MINUTES} * * * *`;

  monitorTask = cron.schedule(cronExpression, async () => {
    await checkLocationAndSendCheckIns();
  });

  console.log(`[LocationCheckIn] ✅ Monitor started (checking every ${CHECK_INTERVAL_MINUTES} minutes)`);

  // Run immediately on start
  checkLocationAndSendCheckIns().catch(err => {
    console.error("[LocationCheckIn] Error in initial check:", err);
  });
}

/**
 * Stop the location check-in monitor
 */
export function stopLocationCheckInMonitor(): void {
  if (monitorTask) {
    monitorTask.stop();
    monitorTask = null;
    console.log("[LocationCheckIn] Monitor stopped");
  }
}

/**
 * Get monitor status
 */
export function getMonitorStatus(): { running: boolean; intervalMinutes: number } {
  return {
    running: monitorTask !== null,
    intervalMinutes: CHECK_INTERVAL_MINUTES,
  };
}

/**
 * Location Check-In Monitor Service
 *
 * Proactively monitors user location and sends contextual SMS messages when
 * arrival/departure events are detected at saved places.
 *
 * Features:
 * - Runs every 5 minutes via node-cron
 * - Detects arrivals/departures using GPS proximity (150m threshold)
 * - Predictive proximity alerts with velocity-based radius adjustment
 * - Generates smart, contextual messages using AI
 * - Throttles SMS delivery (max 10/day, 30min intervals)
 * - Tracks check-in history in location_state_tracking table
 * - Creates proximity_alerts records for places with alerts enabled
 * - Prevents alert spam with 30-minute cooldown per location
 */

import * as cron from "node-cron";
import OpenAI from "openai";
import {
  getLatestLocation,
  getAllSavedPlaces,
  calculateDistance,
  getLastLocationStateByPlace,
  createLocationStateTracking,
  getCheckInsSentToday,
  getLastCheckInTime,
  getAllTasks,
  getAllGroceryItems,
  getPlacesWithProximityAlerts,
  createProximityAlert,
  getRecentAlertsForPlace,
  getLocationHistory,
  getTasksByPlace,
  getRemindersByPlace,
} from "./db";
import { getUpcomingEvents } from "./googleCalendar";
import { MASTER_ADMIN_PHONE } from "@shared/schema";
import type { SavedPlace, LocationHistory, LocationStateTracking } from "@shared/schema";

// Monitor state
let monitorTask: cron.ScheduledTask | null = null;
let isMonitorRunning = false;
let lastCheckTime: Date | null = null;
let smsCallback: ((phone: string, message: string) => Promise<void>) | null = null;
let openai: OpenAI | null = null;

// Settings with defaults
const DEFAULT_SETTINGS = {
  enabled: true,
  proximityThresholdMeters: 150,
  checkIntervalMinutes: 5,
  maxSmsPerDay: 10,
  minIntervalMinutes: 30,
  recipientPhone: MASTER_ADMIN_PHONE,
};

let settings = { ...DEFAULT_SETTINGS };

/**
 * Get OpenAI client for message generation
 */
function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured.");
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

/**
 * Set the SMS callback for sending messages
 */
export function setLocationCheckInSmsCallback(callback: (phone: string, message: string) => Promise<void>): void {
  smsCallback = callback;
}

/**
 * Update check-in settings
 */
export function updateLocationCheckInSettings(newSettings: Partial<typeof DEFAULT_SETTINGS>): void {
  settings = { ...settings, ...newSettings };
}

/**
 * Get current check-in settings
 */
export function getLocationCheckInSettings() {
  return { ...settings };
}

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * Returns distance in meters
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return calculateDistance(lat1, lon1, lat2, lon2);
}

/**
 * Calculate approach velocity based on recent location history
 * Returns velocity in meters per second (positive = approaching, negative = moving away)
 */
function calculateApproachVelocity(
  currentLocation: LocationHistory,
  targetLat: number,
  targetLon: number
): number | null {
  try {
    // Get location history from the last 15 minutes
    const history = getLocationHistory(10);
    if (history.length < 2) {
      return null;
    }

    const currentLat = parseFloat(currentLocation.latitude);
    const currentLon = parseFloat(currentLocation.longitude);
    const currentDistance = haversineDistance(currentLat, currentLon, targetLat, targetLon);

    // Find a location from 5-15 minutes ago for comparison
    const now = new Date(currentLocation.createdAt);
    const previous = history.find(loc => {
      const locTime = new Date(loc.createdAt);
      const minutesAgo = (now.getTime() - locTime.getTime()) / (1000 * 60);
      return minutesAgo >= 5 && minutesAgo <= 15;
    });

    if (!previous) {
      return null;
    }

    const prevLat = parseFloat(previous.latitude);
    const prevLon = parseFloat(previous.longitude);
    const prevDistance = haversineDistance(prevLat, prevLon, targetLat, targetLon);

    // Calculate time difference in seconds
    const timeDiff = (now.getTime() - new Date(previous.createdAt).getTime()) / 1000;
    if (timeDiff === 0) {
      return null;
    }

    // Velocity: positive if getting closer (approaching), negative if moving away
    const velocity = (prevDistance - currentDistance) / timeDiff;
    return velocity;
  } catch (error) {
    console.error("[Proximity Alert] Error calculating approach velocity:", error);
    return null;
  }
}

/**
 * Calculate predictive alert distance based on approach velocity
 * Returns the distance threshold at which to trigger an alert
 */
function getPredictiveAlertDistance(
  baseRadius: number,
  velocity: number | null
): number {
  if (!velocity || velocity <= 0) {
    // Not approaching or velocity unknown, use base radius
    return baseRadius;
  }

  // If approaching quickly, extend the alert radius to give more warning
  // velocity is in m/s, so 1 m/s = 3.6 km/h
  const speedKmh = velocity * 3.6;

  if (speedKmh > 40) {
    // Fast approach (e.g., driving), alert at 2x radius
    return baseRadius * 2;
  } else if (speedKmh > 15) {
    // Medium speed (e.g., cycling), alert at 1.5x radius
    return baseRadius * 1.5;
  } else if (speedKmh > 3) {
    // Slow approach (e.g., walking), alert at 1.2x radius
    return baseRadius * 1.2;
  }

  // Very slow approach, use base radius
  return baseRadius;
}

/**
 * Determine alert type based on place and linked items
 */
function determineAlertType(place: SavedPlace): "grocery" | "reminder" | "general" {
  // Check if it's a grocery store
  if (place.category === 'grocery') {
    return 'grocery';
  }

  // Check if there are linked tasks or reminders
  try {
    const tasks = getTasksByPlace(place.id);
    const reminders = getRemindersByPlace(place.id);
    if (tasks.length > 0 || reminders.length > 0) {
      return 'reminder';
    }
  } catch (error) {
    console.error("[Proximity Alert] Error checking linked items:", error);
  }

  return 'general';
}

/**
 * Generate proximity alert message
 */
async function generateProximityAlertMessage(
  place: SavedPlace,
  distance: number,
  alertType: "grocery" | "reminder" | "general"
): Promise<string> {
  try {
    const client = getOpenAIClient();

    // Gather relevant context based on alert type
    let contextParts: string[] = [];

    if (alertType === 'grocery') {
      const groceryItems = getAllGroceryItems().filter(g => !g.purchased);
      if (groceryItems.length > 0) {
        const itemsList = groceryItems
          .slice(0, 8)
          .map(g => `- ${g.name}${g.quantity ? ` (${g.quantity})` : ''}`)
          .join('\n');
        contextParts.push(`Grocery list:\n${itemsList}`);
      }
    }

    if (alertType === 'reminder') {
      const tasks = getTasksByPlace(place.id).filter(t => !t.completed);
      const reminders = getRemindersByPlace(place.id);

      if (tasks.length > 0) {
        const tasksList = tasks
          .slice(0, 5)
          .map(t => `- ${t.title}${t.dueDate ? ` (due: ${t.dueDate})` : ''}`)
          .join('\n');
        contextParts.push(`Tasks for this location:\n${tasksList}`);
      }

      if (reminders.length > 0) {
        const remindersList = reminders
          .slice(0, 3)
          .map(r => `- ${r.title}`)
          .join('\n');
        contextParts.push(`Reminders for this location:\n${remindersList}`);
      }
    }

    const contextString = contextParts.length > 0
      ? contextParts.join('\n\n')
      : 'No specific items or tasks linked to this location.';

    const distanceText = distance < 1000
      ? `${Math.round(distance)}m`
      : `${(distance / 1000).toFixed(1)}km`;

    const prompt = `You are ZEKE, Nate Johnson's personal AI assistant. Generate a proximity alert message:

Location: ${place.name} (${place.category})
Distance: ${distanceText} away
Alert Type: ${alertType}

Context:
${contextString}

Generate a brief, actionable SMS message (max 160 chars) that:
1. Alerts user they're near ${place.name}
2. Mentions relevant items/tasks if any
3. Is concise and helpful

Keep it short and direct.`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are ZEKE, a helpful personal AI assistant. Generate brief proximity alert messages."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_completion_tokens: 80,
      temperature: 0.7,
    });

    const message = response.choices[0]?.message?.content?.trim() ||
      `You're ${distanceText} from ${place.name}`;

    return message;
  } catch (error) {
    console.error("[Proximity Alert] Error generating message:", error);
    const distanceText = distance < 1000
      ? `${Math.round(distance)}m`
      : `${(distance / 1000).toFixed(1)}km`;
    return `You're ${distanceText} from ${place.name}`;
  }
}

/**
 * Check if we should send an SMS based on throttling rules
 */
async function shouldSendSms(): Promise<{ allowed: boolean; reason?: string }> {
  // Check daily limit
  const smsSentToday = getCheckInsSentToday();
  if (smsSentToday >= settings.maxSmsPerDay) {
    return { allowed: false, reason: `Daily SMS limit reached (${settings.maxSmsPerDay}/day)` };
  }

  // Check time interval since last SMS
  const lastSmsTime = getLastCheckInTime();
  if (lastSmsTime) {
    const lastSmsDate = new Date(lastSmsTime);
    const now = new Date();
    const minutesSinceLastSms = (now.getTime() - lastSmsDate.getTime()) / (1000 * 60);

    if (minutesSinceLastSms < settings.minIntervalMinutes) {
      return {
        allowed: false,
        reason: `Min interval not met (${Math.round(minutesSinceLastSms)}/${settings.minIntervalMinutes} min)`
      };
    }
  }

  return { allowed: true };
}

/**
 * Generate contextual check-in message using AI
 */
async function generateCheckInMessage(
  eventType: "arrival" | "departure",
  place: SavedPlace,
  currentLocation: LocationHistory
): Promise<string> {
  try {
    const client = getOpenAIClient();

    // Gather context
    const tasks = getAllTasks().filter(t => !t.completed);
    const groceryItems = getAllGroceryItems().filter(g => !g.purchased);

    let calendarEvents: any[] = [];
    try {
      const events = await getUpcomingEvents(5);
      calendarEvents = events;
    } catch (error) {
      // Calendar API might not be available
      console.log("Calendar not available for check-in context");
    }

    // Build context string
    const contextParts: string[] = [];

    if (tasks.length > 0) {
      const taskSummary = tasks
        .slice(0, 5)
        .map(t => `- ${t.title}${t.dueDate ? ` (due: ${t.dueDate})` : ''}`)
        .join('\n');
      contextParts.push(`Pending tasks:\n${taskSummary}`);
    }

    if (groceryItems.length > 0 && (place.category === 'grocery' || place.name.toLowerCase().includes('grocery') || place.name.toLowerCase().includes('shop'))) {
      const grocerySummary = groceryItems
        .slice(0, 8)
        .map(g => `- ${g.name}${g.quantity ? ` (${g.quantity})` : ''}`)
        .join('\n');
      contextParts.push(`Grocery list:\n${grocerySummary}`);
    }

    if (calendarEvents.length > 0) {
      const eventSummary = calendarEvents
        .slice(0, 3)
        .map(e => `- ${e.summary} at ${e.start}`)
        .join('\n');
      contextParts.push(`Upcoming events:\n${eventSummary}`);
    }

    const contextString = contextParts.length > 0
      ? contextParts.join('\n\n')
      : 'No pending tasks, groceries, or upcoming events.';

    // Generate message
    const prompt = `You are ZEKE, Nate Johnson's personal AI assistant. Generate a brief, helpful check-in message for the following event:

Event: ${eventType === 'arrival' ? 'Arrived at' : 'Departed from'} ${place.name}
Place Category: ${place.category}
Time: ${new Date().toLocaleTimeString()}

Current Context:
${contextString}

Generate a short, natural SMS message (1-2 sentences, max 160 chars) that:
1. Acknowledges the ${eventType}
2. Provides helpful context if relevant (e.g., remind about grocery items if at a store, mention nearby tasks, etc.)
3. Is warm and conversational, like a helpful assistant

Keep it brief and actionable. Don't be overly chatty.`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are ZEKE, a helpful personal AI assistant. Generate brief, contextual SMS messages."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_completion_tokens: 100,
      temperature: 0.7,
    });

    const message = response.choices[0]?.message?.content?.trim() ||
      `${eventType === 'arrival' ? 'Arrived at' : 'Left'} ${place.name}`;

    return message;
  } catch (error) {
    console.error("Error generating check-in message:", error);
    // Fallback message
    return `${eventType === 'arrival' ? 'Arrived at' : 'Left'} ${place.name} at ${new Date().toLocaleTimeString()}`;
  }
}

/**
 * Process location check and detect arrival/departure events
 */
async function processLocationCheck(): Promise<void> {
  try {
    if (!settings.enabled) {
      console.log("[Location Check-In] Monitor disabled");
      return;
    }

    // Get current location
    const currentLocation = getLatestLocation();
    if (!currentLocation) {
      console.log("[Location Check-In] No GPS data available");
      return;
    }

    const currentLat = parseFloat(currentLocation.latitude);
    const currentLon = parseFloat(currentLocation.longitude);

    // Get all saved places
    const savedPlaces = await getAllSavedPlaces();
    if (savedPlaces.length === 0) {
      console.log("[Location Check-In] No saved places configured");
      return;
    }

    console.log(`[Location Check-In] Checking location against ${savedPlaces.length} saved places`);

    // Check each saved place
    for (const place of savedPlaces) {
      const placeLat = parseFloat(place.latitude);
      const placeLon = parseFloat(place.longitude);
      const distance = haversineDistance(currentLat, currentLon, placeLat, placeLon);

      // Check if within proximity threshold
      const isNearby = distance <= settings.proximityThresholdMeters;

      // Get last state for this place
      const lastState = await getLastLocationStateByPlace(place.id);
      const wasNearby = lastState?.eventType === "arrival";

      // Detect state change
      let eventType: "arrival" | "departure" | null = null;

      if (isNearby && !wasNearby) {
        // Arrived
        eventType = "arrival";
        console.log(`[Location Check-In] ARRIVAL detected at ${place.name} (${Math.round(distance)}m away)`);
      } else if (!isNearby && wasNearby) {
        // Departed
        eventType = "departure";
        console.log(`[Location Check-In] DEPARTURE detected from ${place.name} (${Math.round(distance)}m away)`);
      }

      // Process event if detected
      if (eventType) {
        // Check if we should send SMS
        const throttleCheck = await shouldSendSms();

        // Generate message
        let message: string | null = null;
        let smsSent = false;
        let smsDeliveredAt: string | undefined = undefined;

        if (throttleCheck.allowed) {
          try {
            message = await generateCheckInMessage(eventType, place, currentLocation);

            // Send SMS if callback is available
            if (smsCallback && message) {
              await smsCallback(settings.recipientPhone, message);
              smsSent = true;
              smsDeliveredAt = new Date().toISOString();
              console.log(`[Location Check-In] SMS sent: ${message}`);
            } else {
              console.log(`[Location Check-In] SMS callback not available, message: ${message}`);
            }
          } catch (error) {
            console.error("[Location Check-In] Error sending SMS:", error);
          }
        } else {
          console.log(`[Location Check-In] SMS throttled: ${throttleCheck.reason}`);
          message = await generateCheckInMessage(eventType, place, currentLocation);
        }

        // Record the event in database
        createLocationStateTracking({
          savedPlaceId: place.id,
          savedPlaceName: place.name,
          eventType,
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          distanceMeters: distance.toFixed(2),
          messageGenerated: message || undefined,
          smsSent,
          smsDeliveredAt,
          eventDetectedAt: new Date().toISOString(),
        });
      }
    }

    // ============================================
    // PROCESS PROXIMITY ALERTS
    // ============================================

    // Get places with proximity alerts enabled
    const alertPlaces = getPlacesWithProximityAlerts();
    if (alertPlaces.length > 0) {
      console.log(`[Proximity Alert] Checking ${alertPlaces.length} places with alerts enabled`);

      for (const place of alertPlaces) {
        const placeLat = parseFloat(place.latitude);
        const placeLon = parseFloat(place.longitude);
        const distance = haversineDistance(currentLat, currentLon, placeLat, placeLon);

        // Calculate approach velocity for predictive alerting
        const velocity = calculateApproachVelocity(currentLocation, placeLat, placeLon);

        // Get predictive alert distance based on approach velocity
        const alertRadius = getPredictiveAlertDistance(
          place.proximityRadiusMeters || 200,
          velocity
        );

        // Check if within alert radius
        const isWithinRadius = distance <= alertRadius;

        if (isWithinRadius) {
          // Check if we've recently alerted for this place (avoid spam)
          const recentAlerts = getRecentAlertsForPlace(place.id, 30); // 30 minutes cooldown

          if (recentAlerts.length === 0) {
            // Determine alert type
            const alertType = determineAlertType(place);

            // Generate alert message
            const alertMessage = await generateProximityAlertMessage(place, distance, alertType);

            // Create proximity alert record
            const alert = createProximityAlert({
              savedPlaceId: place.id,
              distanceMeters: distance.toFixed(2),
              alertType,
              alertMessage,
              acknowledged: false,
            });

            console.log(`[Proximity Alert] ALERT created for ${place.name} at ${Math.round(distance)}m (threshold: ${Math.round(alertRadius)}m)`);

            // Log velocity info if available
            if (velocity !== null) {
              const speedKmh = velocity * 3.6;
              console.log(`[Proximity Alert] Approach velocity: ${speedKmh.toFixed(1)} km/h`);
            }

            // Note: Actual notification sending will be handled by the notification batcher
            // which batches proximity alerts with other notifications
          } else {
            console.log(`[Proximity Alert] Skipping ${place.name} - alerted within last 30 minutes`);
          }
        }
      }
    }

    lastCheckTime = new Date();
  } catch (error) {
    console.error("[Location Check-In] Error processing location check:", error);
  }
}

/**
 * Start the location check-in monitor
 */
export function startLocationCheckInMonitor(): boolean {
  if (isMonitorRunning) {
    console.log("[Location Check-In] Monitor already running");
    return false;
  }

  try {
    // Schedule the task to run every N minutes
    const cronExpression = `*/${settings.checkIntervalMinutes} * * * *`;
    monitorTask = cron.schedule(cronExpression, async () => {
      await processLocationCheck();
    });

    isMonitorRunning = true;
    console.log(`[Location Check-In] Monitor started (checking every ${settings.checkIntervalMinutes} minutes)`);

    // Run initial check
    processLocationCheck().catch(err => {
      console.error("[Location Check-In] Error in initial check:", err);
    });

    return true;
  } catch (error) {
    console.error("[Location Check-In] Error starting monitor:", error);
    return false;
  }
}

/**
 * Stop the location check-in monitor
 */
export function stopLocationCheckInMonitor(): boolean {
  if (!isMonitorRunning) {
    console.log("[Location Check-In] Monitor not running");
    return false;
  }

  try {
    if (monitorTask) {
      monitorTask.stop();
      monitorTask = null;
    }

    isMonitorRunning = false;
    console.log("[Location Check-In] Monitor stopped");
    return true;
  } catch (error) {
    console.error("[Location Check-In] Error stopping monitor:", error);
    return false;
  }
}

/**
 * Get monitor status
 */
export function getLocationCheckInStatus() {
  const smsSentToday = getCheckInsSentToday();
  const lastSmsTime = getLastCheckInTime();

  return {
    running: isMonitorRunning,
    enabled: settings.enabled,
    lastCheckTime: lastCheckTime?.toISOString() || null,
    lastSmsTime: lastSmsTime || null,
    smsSentToday,
    settings,
    throttling: {
      dailyLimit: settings.maxSmsPerDay,
      dailyUsed: smsSentToday,
      dailyRemaining: Math.max(0, settings.maxSmsPerDay - smsSentToday),
      minIntervalMinutes: settings.minIntervalMinutes,
    }
  };
}

/**
 * Get current location state
 */
export function getCurrentLocationState() {
  const currentLocation = getLatestLocation();
  if (!currentLocation) {
    return { location: null, nearbyPlaces: [] };
  }

  const currentLat = parseFloat(currentLocation.latitude);
  const currentLon = parseFloat(currentLocation.longitude);
  const savedPlaces = getAllSavedPlaces();

  const nearbyPlaces = savedPlaces
    .map(place => {
      const placeLat = parseFloat(place.latitude);
      const placeLon = parseFloat(place.longitude);
      const distance = haversineDistance(currentLat, currentLon, placeLat, placeLon);
      const lastState = getLastLocationStateByPlace(place.id);

      return {
        place,
        distance: Math.round(distance),
        isNearby: distance <= settings.proximityThresholdMeters,
        lastEvent: lastState ? {
          type: lastState.eventType,
          time: lastState.eventDetectedAt,
        } : null,
      };
    })
    .filter(p => p.isNearby || (p.lastEvent && p.distance <= settings.proximityThresholdMeters * 2))
    .sort((a, b) => a.distance - b.distance);

  return {
    location: {
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      timestamp: currentLocation.createdAt,
      accuracy: currentLocation.accuracy,
    },
    nearbyPlaces,
  };
}

/**
 * Initialize the location check-in system (called on server startup)
 */
export function initializeLocationCheckIn(): void {
  console.log("[Location Check-In] Initializing system");
  // Don't auto-start yet - wait for SMS callback to be set
}

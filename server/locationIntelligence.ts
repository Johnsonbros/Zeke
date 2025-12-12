/**
 * Location Intelligence Service
 * 
 * Provides agentic location awareness for ZEKE by correlating GPS data with
 * calendar appointments, detecting job site arrivals, monitoring GPS health,
 * and providing real-time travel/transit detection.
 * 
 * Features:
 * - Calendar-GPS correlation: Match current location to upcoming appointments
 * - Job site arrival detection: Know when user arrives at work locations
 * - Travel/transit detection: Determine if user is driving vs stationary
 * - GPS health monitoring: Alert if tracking goes stale
 * - Proactive context generation: Rich location context for AI responses
 */

import * as cron from "node-cron";
import {
  getLatestLocation,
  getLocationHistory,
  getAllSavedPlaces,
  calculateDistance,
  createLocationStateTracking,
  getLastLocationStateByPlace,
} from "./db";
import { getUpcomingEvents, getTodaysEvents } from "./googleCalendar";
import type { LocationHistory, SavedPlace } from "@shared/schema";

// Constants
const ARRIVAL_THRESHOLD_METERS = 200; // Consider arrived within 200m
const TRANSIT_SPEED_THRESHOLD_MPS = 2; // Moving faster than 2 m/s (4.5 mph) = in transit
const STALE_LOCATION_MINUTES = 15; // GPS data older than 15 min is stale
const HIGH_CONFIDENCE_ACCURACY_METERS = 50; // Accuracy better than 50m is high confidence

// State tracking
let lastKnownState: LocationState | null = null;
let healthCheckTask: cron.ScheduledTask | null = null;
let staleAlertCallback: ((message: string) => Promise<void>) | null = null;

export interface LocationState {
  timestamp: Date;
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  source: string;
  
  // Derived state
  isMoving: boolean;
  movementType: "stationary" | "walking" | "driving" | "unknown";
  dataQuality: "high" | "medium" | "low";
  dataFreshness: "fresh" | "recent" | "stale";
}

export interface NearbyAppointment {
  eventId: string;
  eventTitle: string;
  eventLocation: string;
  eventStart: Date;
  eventEnd: Date;
  distanceMeters: number;
  isArrived: boolean;
  arrivalConfidence: "high" | "medium" | "low";
  estimatedCoordinates: { lat: number; lng: number } | null;
}

export interface LocationContext {
  currentState: LocationState | null;
  nearbyPlaces: Array<{
    place: SavedPlace;
    distanceMeters: number;
    isAt: boolean;
  }>;
  nearbyAppointments: NearbyAppointment[];
  currentActivity: string;
  contextSummary: string;
  gpsHealthStatus: "healthy" | "degraded" | "offline";
  lastUpdateAge: number; // seconds
}

/**
 * Get the current location state with derived metrics
 */
export function getCurrentLocationState(): LocationState | null {
  const latest = getLatestLocation();
  if (!latest) return null;
  
  const lat = parseFloat(latest.latitude);
  const lng = parseFloat(latest.longitude);
  const accuracy = parseFloat(latest.accuracy || "100");
  const speed = latest.speed ? parseFloat(latest.speed) : null;
  const heading = latest.heading ? parseFloat(latest.heading) : null;
  const timestamp = new Date(latest.createdAt);
  
  // Determine movement type
  let isMoving = false;
  let movementType: LocationState["movementType"] = "unknown";
  
  // Speed of -1 from Overland means "unknown", treat as null
  const effectiveSpeed = (speed !== null && speed >= 0) ? speed : null;
  
  if (effectiveSpeed !== null) {
    if (effectiveSpeed < 0.5) {
      movementType = "stationary";
      isMoving = false;
    } else if (effectiveSpeed < 2) {
      movementType = "walking";
      isMoving = true;
    } else {
      movementType = "driving";
      isMoving = true;
    }
  } else {
    // Infer from recent history when speed is unknown
    const history = getLocationHistory(5);
    if (history.length >= 2) {
      // Sort by timestamp descending to ensure correct order (most recent first)
      const sortedHistory = [...history].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const recent = sortedHistory[0];
      const previous = sortedHistory[1];
      const recentTime = new Date(recent.createdAt).getTime();
      const previousTime = new Date(previous.createdAt).getTime();
      const timeDiff = Math.abs(recentTime - previousTime) / 1000;
      
      if (timeDiff > 0 && timeDiff < 300) {
        const distance = calculateDistance(
          parseFloat(recent.latitude),
          parseFloat(recent.longitude),
          parseFloat(previous.latitude),
          parseFloat(previous.longitude)
        );
        const inferredSpeed = distance / timeDiff;
        if (inferredSpeed < 0.5) {
          movementType = "stationary";
          isMoving = false;
        } else if (inferredSpeed < 2) {
          movementType = "walking";
          isMoving = true;
        } else {
          movementType = "driving";
          isMoving = true;
        }
      }
    }
  }
  
  // Data quality based on accuracy
  let dataQuality: LocationState["dataQuality"] = "low";
  if (accuracy <= HIGH_CONFIDENCE_ACCURACY_METERS) {
    dataQuality = "high";
  } else if (accuracy <= 150) {
    dataQuality = "medium";
  }
  
  // Data freshness
  const ageMinutes = (Date.now() - timestamp.getTime()) / 60000;
  let dataFreshness: LocationState["dataFreshness"] = "stale";
  if (ageMinutes < 2) {
    dataFreshness = "fresh";
  } else if (ageMinutes < STALE_LOCATION_MINUTES) {
    dataFreshness = "recent";
  }
  
  const state: LocationState = {
    timestamp,
    latitude: lat,
    longitude: lng,
    accuracy,
    speed,
    heading,
    source: latest.source,
    isMoving,
    movementType,
    dataQuality,
    dataFreshness,
  };
  
  lastKnownState = state;
  return state;
}

/**
 * Geocode an address to coordinates using a simple approach
 * Returns approximate coordinates or null if not possible
 */
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  // For now, check if we have a saved place with a matching address
  const places = getAllSavedPlaces();
  
  const normalizedAddress = address.toLowerCase().trim();
  
  for (const place of places) {
    if (place.address) {
      const placeAddress = place.address.toLowerCase().trim();
      // Check for substantial overlap
      if (placeAddress.includes(normalizedAddress) || normalizedAddress.includes(placeAddress)) {
        return {
          lat: parseFloat(place.latitude),
          lng: parseFloat(place.longitude),
        };
      }
      
      // Check street number and name match
      const addressParts = normalizedAddress.split(/[,\s]+/).filter(p => p.length > 2);
      const matchCount = addressParts.filter(part => placeAddress.includes(part)).length;
      if (matchCount >= 2) {
        return {
          lat: parseFloat(place.latitude),
          lng: parseFloat(place.longitude),
        };
      }
    }
  }
  
  return null;
}

/**
 * Get nearby calendar appointments and check if user has arrived
 */
export async function getNearbyAppointments(
  lat: number,
  lng: number,
  hoursAhead: number = 8
): Promise<NearbyAppointment[]> {
  const appointments: NearbyAppointment[] = [];
  
  try {
    // Get today's events plus upcoming events
    const events = await getTodaysEvents();
    const now = new Date();
    const cutoff = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
    
    for (const event of events) {
      // Skip events without locations
      if (!event.location) continue;
      
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      
      // Skip past events (ended more than 30 min ago)
      if (eventEnd.getTime() < now.getTime() - 30 * 60 * 1000) continue;
      
      // Skip events too far in the future
      if (eventStart.getTime() > cutoff.getTime()) continue;
      
      // Try to geocode the location - use saved places first
      let coords = await geocodeAddress(event.location);
      
      // If no match in saved places, try extracting city/state for partial matching
      if (!coords) {
        // Extract potential address components for matching
        const locationParts = event.location.split(',').map(p => p.trim());
        for (const part of locationParts) {
          if (part.length > 3) {
            coords = await geocodeAddress(part);
            if (coords) break;
          }
        }
      }
      
      let distanceMeters = Infinity;
      let arrivalConfidence: NearbyAppointment["arrivalConfidence"] = "low";
      
      if (coords) {
        distanceMeters = calculateDistance(lat, lng, coords.lat, coords.lng);
        
        if (distanceMeters <= ARRIVAL_THRESHOLD_METERS) {
          arrivalConfidence = "high";
        } else if (distanceMeters <= 500) {
          arrivalConfidence = "medium";
        }
      }
      
      const isArrived = coords !== null && distanceMeters <= ARRIVAL_THRESHOLD_METERS;
      
      appointments.push({
        eventId: event.id,
        eventTitle: event.summary,
        eventLocation: event.location,
        eventStart,
        eventEnd,
        distanceMeters: coords ? distanceMeters : Infinity,
        isArrived,
        arrivalConfidence: coords ? arrivalConfidence : "low",
        estimatedCoordinates: coords,
      });
    }
    
    // Sort by start time for events without coordinates, by distance for those with
    appointments.sort((a, b) => {
      if (a.estimatedCoordinates && b.estimatedCoordinates) {
        return a.distanceMeters - b.distanceMeters;
      }
      if (a.estimatedCoordinates) return -1;
      if (b.estimatedCoordinates) return 1;
      return a.eventStart.getTime() - b.eventStart.getTime();
    });
    
  } catch (error) {
    console.error("[LocationIntelligence] Error fetching appointments:", error);
  }
  
  return appointments;
}

/**
 * Get comprehensive location context for ZEKE's AI
 */
export async function getLocationContext(): Promise<LocationContext> {
  const state = getCurrentLocationState();
  
  const context: LocationContext = {
    currentState: state,
    nearbyPlaces: [],
    nearbyAppointments: [],
    currentActivity: "Unknown",
    contextSummary: "Location data unavailable",
    gpsHealthStatus: "offline",
    lastUpdateAge: Infinity,
  };
  
  if (!state) {
    return context;
  }
  
  // Calculate update age
  context.lastUpdateAge = Math.floor((Date.now() - state.timestamp.getTime()) / 1000);
  
  // Determine GPS health
  if (state.dataFreshness === "fresh" && state.dataQuality !== "low") {
    context.gpsHealthStatus = "healthy";
  } else if (state.dataFreshness !== "stale") {
    context.gpsHealthStatus = "degraded";
  } else {
    context.gpsHealthStatus = "offline";
  }
  
  // Find nearby saved places
  const places = getAllSavedPlaces();
  for (const place of places) {
    const placeLat = parseFloat(place.latitude);
    const placeLng = parseFloat(place.longitude);
    const distance = calculateDistance(state.latitude, state.longitude, placeLat, placeLng);
    const threshold = place.proximityRadiusMeters || ARRIVAL_THRESHOLD_METERS;
    
    if (distance <= 1000) { // Within 1km
      context.nearbyPlaces.push({
        place,
        distanceMeters: Math.round(distance),
        isAt: distance <= threshold,
      });
    }
  }
  
  // Sort by distance
  context.nearbyPlaces.sort((a, b) => a.distanceMeters - b.distanceMeters);
  
  // Get nearby appointments
  context.nearbyAppointments = await getNearbyAppointments(state.latitude, state.longitude);
  
  // Determine current activity
  const atPlace = context.nearbyPlaces.find(p => p.isAt);
  const arrivedAppointment = context.nearbyAppointments.find(a => a.isArrived);
  
  if (arrivedAppointment) {
    context.currentActivity = `At job site: ${arrivedAppointment.eventTitle}`;
  } else if (atPlace) {
    const category = atPlace.place.category || "place";
    context.currentActivity = `At ${atPlace.place.name} (${category})`;
  } else if (state.movementType === "driving") {
    const nextAppointment = context.nearbyAppointments[0];
    if (nextAppointment && nextAppointment.distanceMeters < 10000) {
      context.currentActivity = `Driving to ${nextAppointment.eventTitle}`;
    } else {
      context.currentActivity = "Driving";
    }
  } else if (state.movementType === "walking") {
    context.currentActivity = "Walking";
  } else if (state.movementType === "stationary") {
    context.currentActivity = "Stationary";
  } else {
    context.currentActivity = "Unknown";
  }
  
  // Generate context summary
  context.contextSummary = generateContextSummary(context, state);
  
  return context;
}

/**
 * Generate a human-readable context summary for AI consumption
 */
function generateContextSummary(context: LocationContext, state: LocationState): string {
  const parts: string[] = [];
  
  // Location freshness warning
  if (context.gpsHealthStatus === "degraded") {
    parts.push(`GPS data is ${Math.round(context.lastUpdateAge / 60)} minutes old.`);
  } else if (context.gpsHealthStatus === "offline") {
    parts.push("GPS tracking appears offline - location data is stale.");
  }
  
  // Current activity
  parts.push(`Current: ${context.currentActivity}.`);
  
  // Movement info
  if (state.isMoving && state.speed !== null && state.speed > 0) {
    const mph = Math.round(state.speed * 2.237); // m/s to mph
    parts.push(`Moving at ~${mph} mph.`);
  }
  
  // Nearby places
  if (context.nearbyPlaces.length > 0) {
    const closest = context.nearbyPlaces[0];
    if (closest.isAt) {
      parts.push(`At ${closest.place.name}.`);
    } else {
      parts.push(`${Math.round(closest.distanceMeters)}m from ${closest.place.name}.`);
    }
  }
  
  // Upcoming appointments with locations
  const upcomingWithLocation = context.nearbyAppointments.filter(a => 
    a.estimatedCoordinates && !a.isArrived && a.eventStart.getTime() > Date.now()
  );
  
  if (upcomingWithLocation.length > 0) {
    const next = upcomingWithLocation[0];
    const minsUntil = Math.round((next.eventStart.getTime() - Date.now()) / 60000);
    if (minsUntil > 0) {
      const distanceKm = (next.distanceMeters / 1000).toFixed(1);
      parts.push(`Next: ${next.eventTitle} in ${minsUntil} min (${distanceKm}km away).`);
    }
  }
  
  // Arrived at appointment
  const arrivedAppointment = context.nearbyAppointments.find(a => a.isArrived);
  if (arrivedAppointment) {
    parts.push(`Arrived at: ${arrivedAppointment.eventTitle} (${arrivedAppointment.eventLocation}).`);
  }
  
  return parts.join(" ");
}

/**
 * Format location context for injection into AI system prompt
 */
export async function getLocationContextForAI(): Promise<string> {
  const context = await getLocationContext();
  
  if (!context.currentState) {
    return "**Location**: Unknown (GPS data unavailable)";
  }
  
  const lines: string[] = [];
  lines.push("## Current Location Status");
  lines.push("");
  lines.push(`**Activity**: ${context.currentActivity}`);
  lines.push(`**GPS Health**: ${context.gpsHealthStatus} (last update: ${formatAge(context.lastUpdateAge)})`);
  
  if (context.currentState.isMoving) {
    const speed = context.currentState.speed;
    if (speed !== null && speed > 0) {
      lines.push(`**Movement**: ${context.currentState.movementType} at ${Math.round(speed * 2.237)} mph`);
    } else {
      lines.push(`**Movement**: ${context.currentState.movementType}`);
    }
  }
  
  // Current place
  const atPlace = context.nearbyPlaces.find(p => p.isAt);
  if (atPlace) {
    lines.push(`**At**: ${atPlace.place.name}${atPlace.place.category ? ` (${atPlace.place.category})` : ""}`);
  }
  
  // Job site detection
  const arrivedAppointment = context.nearbyAppointments.find(a => a.isArrived);
  if (arrivedAppointment) {
    lines.push("");
    lines.push("### Job Site Arrival Detected");
    lines.push(`- **Event**: ${arrivedAppointment.eventTitle}`);
    lines.push(`- **Location**: ${arrivedAppointment.eventLocation}`);
    const eventTime = arrivedAppointment.eventStart.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/New_York",
    });
    lines.push(`- **Scheduled**: ${eventTime}`);
  }
  
  // Upcoming appointments with travel context
  const upcomingJobSites = context.nearbyAppointments.filter(a => 
    !a.isArrived && 
    a.estimatedCoordinates && 
    a.eventStart.getTime() > Date.now() &&
    a.eventStart.getTime() < Date.now() + 4 * 60 * 60 * 1000 // Within 4 hours
  );
  
  if (upcomingJobSites.length > 0) {
    lines.push("");
    lines.push("### Upcoming Job Sites");
    for (const job of upcomingJobSites.slice(0, 3)) {
      const minsUntil = Math.round((job.eventStart.getTime() - Date.now()) / 60000);
      const distanceKm = (job.distanceMeters / 1000).toFixed(1);
      lines.push(`- ${job.eventTitle} (${distanceKm}km, starts in ${minsUntil} min)`);
    }
  }
  
  return lines.join("\n");
}

function formatAge(seconds: number): string {
  if (seconds < 60) return "just now";
  if (seconds < 120) return "1 min ago";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} hours ago`;
}

/**
 * Set callback for stale GPS alerts
 */
export function setStaleAlertCallback(callback: (message: string) => Promise<void>): void {
  staleAlertCallback = callback;
}

/**
 * Check GPS health and send alerts if needed
 */
async function checkGpsHealth(): Promise<void> {
  const state = getCurrentLocationState();
  
  if (!state) {
    if (staleAlertCallback) {
      await staleAlertCallback("GPS tracking is offline - no location data available.");
    }
    console.log("[LocationIntelligence] GPS offline - no data");
    return;
  }
  
  const ageMinutes = (Date.now() - state.timestamp.getTime()) / 60000;
  
  if (ageMinutes > STALE_LOCATION_MINUTES) {
    console.log(`[LocationIntelligence] GPS data is stale (${Math.round(ageMinutes)} minutes old)`);
    // Don't spam alerts, just log
  } else {
    console.log(`[LocationIntelligence] GPS healthy - last update ${Math.round(ageMinutes)} min ago, source: ${state.source}`);
  }
}

/**
 * Start GPS health monitoring
 */
export function startHealthMonitoring(intervalMinutes: number = 10): void {
  if (healthCheckTask) {
    healthCheckTask.stop();
  }
  
  healthCheckTask = cron.schedule(`*/${intervalMinutes} * * * *`, async () => {
    await checkGpsHealth();
  });
  
  console.log(`[LocationIntelligence] Health monitoring started (every ${intervalMinutes} min)`);
}

/**
 * Stop GPS health monitoring
 */
export function stopHealthMonitoring(): void {
  if (healthCheckTask) {
    healthCheckTask.stop();
    healthCheckTask = null;
  }
  console.log("[LocationIntelligence] Health monitoring stopped");
}

/**
 * Get a quick location summary for chat responses
 */
export async function getQuickLocationSummary(): Promise<string> {
  const context = await getLocationContext();
  
  if (!context.currentState) {
    return "Location unknown";
  }
  
  const atPlace = context.nearbyPlaces.find(p => p.isAt);
  const arrivedAppointment = context.nearbyAppointments.find(a => a.isArrived);
  
  if (arrivedAppointment) {
    return `At job: ${arrivedAppointment.eventTitle}`;
  } else if (atPlace) {
    return `At ${atPlace.place.name}`;
  } else if (context.currentState.movementType === "driving") {
    return "Driving";
  } else if (context.currentState.movementType === "walking") {
    return "Walking";
  } else {
    return "Stationary";
  }
}

/**
 * Check if user just arrived at a job site (for proactive notifications)
 */
export async function checkJobSiteArrival(): Promise<NearbyAppointment | null> {
  const context = await getLocationContext();
  
  // Find appointment we just arrived at
  const arrivedAppointment = context.nearbyAppointments.find(a => 
    a.isArrived && 
    a.arrivalConfidence === "high"
  );
  
  return arrivedAppointment || null;
}

// Initialize on import
console.log("[LocationIntelligence] Service loaded");

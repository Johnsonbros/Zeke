/**
 * LocationVerifier AI Agent
 * 
 * Validates saved place coordinates using reverse geocoding.
 * Uses Nominatim API (OpenStreetMap) for free geocoding.
 * 
 * Features:
 * - Reverse geocodes coordinates to get address
 * - Calculates confidence score based on distance and name similarity
 * - Auto-corrects high-confidence mismatches
 * - Queues low-confidence mismatches for user review via notifications
 */

import { getSavedPlace, updateSavedPlace } from "./db";
import { queueAlertNotification } from "./notificationBatcher";
import type { SavedPlace, VerificationStatus, VerifiedBy } from "@shared/schema";

interface NominatimResponse {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
    country?: string;
    amenity?: string;
    shop?: string;
    building?: string;
  };
  type?: string;
  category?: string;
}

interface VerificationResult {
  status: VerificationStatus;
  confidence: number;
  geocodedAddress: string | null;
  geocodedLat: number | null;
  geocodedLon: number | null;
  distanceMeters: number | null;
  nameSimilarity: number | null;
  message: string;
  correctionApplied: boolean;
  notificationQueued: boolean;
}

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
const USER_AGENT = "ZEKE-LocationVerifier/1.0";

// Rate limiting: Nominatim requires max 1 request per second
let lastNominatimRequest = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastNominatimRequest;
  
  if (timeSinceLastRequest < 1100) {
    await new Promise(resolve => setTimeout(resolve, 1100 - timeSinceLastRequest));
  }
  
  lastNominatimRequest = Date.now();
  
  return fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "application/json"
    }
  });
}

/**
 * Reverse geocode coordinates to get address using Nominatim
 */
async function reverseGeocode(lat: number, lon: number): Promise<NominatimResponse | null> {
  try {
    const url = `${NOMINATIM_BASE_URL}/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
    const response = await rateLimitedFetch(url);
    
    if (!response.ok) {
      console.error(`[LocationVerifier] Nominatim error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.error) {
      console.error(`[LocationVerifier] Nominatim error: ${data.error}`);
      return null;
    }
    
    return data as NominatimResponse;
  } catch (error) {
    console.error("[LocationVerifier] Failed to reverse geocode:", error);
    return null;
  }
}

/**
 * Search for a place by name to get its coordinates
 */
async function searchPlace(name: string, nearLat?: number, nearLon?: number): Promise<NominatimResponse[] | null> {
  try {
    let url = `${NOMINATIM_BASE_URL}/search?format=json&q=${encodeURIComponent(name)}&addressdetails=1&limit=5`;
    
    if (nearLat !== undefined && nearLon !== undefined) {
      url += `&viewbox=${nearLon - 0.1},${nearLat + 0.1},${nearLon + 0.1},${nearLat - 0.1}&bounded=0`;
    }
    
    const response = await rateLimitedFetch(url);
    
    if (!response.ok) {
      console.error(`[LocationVerifier] Nominatim search error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    return data as NominatimResponse[];
  } catch (error) {
    console.error("[LocationVerifier] Failed to search place:", error);
    return null;
  }
}

/**
 * Calculate distance between two points using Haversine formula
 */
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Calculate similarity between two strings (0-1)
 * Uses Levenshtein distance normalized by max length
 */
function calculateNameSimilarity(name1: string, name2: string): number {
  const s1 = name1.toLowerCase().trim();
  const s2 = name2.toLowerCase().trim();
  
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    return 0.8;
  }
  
  // Levenshtein distance
  const matrix: number[][] = [];
  
  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const distance = matrix[s1.length][s2.length];
  const maxLength = Math.max(s1.length, s2.length);
  
  return 1 - (distance / maxLength);
}

/**
 * Calculate overall confidence score
 */
function calculateConfidence(distanceMeters: number | null, nameSimilarity: number | null): number {
  let confidence = 0.5; // Base confidence
  
  // Distance scoring (closer = higher confidence)
  if (distanceMeters !== null) {
    if (distanceMeters < 50) {
      confidence += 0.3;
    } else if (distanceMeters < 100) {
      confidence += 0.2;
    } else if (distanceMeters < 200) {
      confidence += 0.1;
    } else if (distanceMeters > 500) {
      confidence -= 0.2;
    } else if (distanceMeters > 1000) {
      confidence -= 0.3;
    }
  }
  
  // Name similarity scoring
  if (nameSimilarity !== null) {
    if (nameSimilarity > 0.8) {
      confidence += 0.2;
    } else if (nameSimilarity > 0.5) {
      confidence += 0.1;
    } else if (nameSimilarity < 0.3) {
      confidence -= 0.1;
    }
  }
  
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Verify a saved place's coordinates
 */
export async function verifyPlace(
  placeId: string,
  recipientPhone?: string
): Promise<VerificationResult> {
  const place = getSavedPlace(placeId);
  
  if (!place) {
    return {
      status: "pending",
      confidence: 0,
      geocodedAddress: null,
      geocodedLat: null,
      geocodedLon: null,
      distanceMeters: null,
      nameSimilarity: null,
      message: "Place not found",
      correctionApplied: false,
      notificationQueued: false
    };
  }
  
  const lat = parseFloat(place.latitude);
  const lon = parseFloat(place.longitude);
  
  if (isNaN(lat) || isNaN(lon)) {
    return {
      status: "mismatch",
      confidence: 0,
      geocodedAddress: null,
      geocodedLat: null,
      geocodedLon: null,
      distanceMeters: null,
      nameSimilarity: null,
      message: "Invalid coordinates",
      correctionApplied: false,
      notificationQueued: false
    };
  }
  
  console.log(`[LocationVerifier] Verifying place: ${place.name} (${lat}, ${lon})`);
  
  // Step 1: Reverse geocode the saved coordinates
  const reverseResult = await reverseGeocode(lat, lon);
  
  // Step 2: Search for the place by name
  const searchResults = await searchPlace(place.name, lat, lon);
  
  let geocodedAddress: string | null = null;
  let geocodedLat: number | null = null;
  let geocodedLon: number | null = null;
  let distanceMeters: number | null = null;
  let nameSimilarity: number | null = null;
  
  // Process reverse geocoding result
  if (reverseResult) {
    geocodedAddress = reverseResult.display_name;
    geocodedLat = parseFloat(reverseResult.lat);
    geocodedLon = parseFloat(reverseResult.lon);
    
    // Compare address name with saved name
    const addressName = reverseResult.name || 
                       reverseResult.address?.amenity || 
                       reverseResult.address?.shop ||
                       reverseResult.address?.building || 
                       "";
    
    if (addressName) {
      nameSimilarity = calculateNameSimilarity(place.name, addressName);
    }
  }
  
  // Process search results - find the closest match
  if (searchResults && searchResults.length > 0) {
    let bestMatch: NominatimResponse | null = null;
    let bestDistance = Infinity;
    
    for (const result of searchResults) {
      const resultLat = parseFloat(result.lat);
      const resultLon = parseFloat(result.lon);
      const dist = calculateDistanceMeters(lat, lon, resultLat, resultLon);
      
      if (dist < bestDistance) {
        bestDistance = dist;
        bestMatch = result;
      }
    }
    
    if (bestMatch) {
      distanceMeters = bestDistance;
      
      // Update geocoded coordinates if search found a better match
      if (!geocodedAddress || bestDistance < 100) {
        geocodedLat = parseFloat(bestMatch.lat);
        geocodedLon = parseFloat(bestMatch.lon);
        geocodedAddress = bestMatch.display_name;
      }
      
      // Calculate name similarity with search result
      const searchName = bestMatch.name || "";
      if (searchName) {
        const searchSimilarity = calculateNameSimilarity(place.name, searchName);
        if (nameSimilarity === null || searchSimilarity > nameSimilarity) {
          nameSimilarity = searchSimilarity;
        }
      }
    }
  }
  
  // Calculate confidence score
  const confidence = calculateConfidence(distanceMeters, nameSimilarity);
  
  // Determine verification status and actions
  let status: VerificationStatus = "pending";
  let message = "";
  let correctionApplied = false;
  let notificationQueued = false;
  
  // Minimum name similarity threshold for auto-correction
  const MIN_NAME_SIMILARITY_FOR_CORRECTION = 0.5;
  
  if (confidence >= 0.8) {
    // High confidence - mark as verified
    status = "verified";
    message = "Location verified with high confidence";
    
    // Only auto-correct if name similarity is sufficient (prevents overwriting based solely on distance)
    const canAutoCorrect = distanceMeters && 
                           distanceMeters > 20 && 
                           distanceMeters < 100 && 
                           geocodedLat && 
                           geocodedLon &&
                           (nameSimilarity === null || nameSimilarity >= MIN_NAME_SIMILARITY_FOR_CORRECTION);
    
    if (canAutoCorrect) {
      updateSavedPlace(placeId, {
        latitude: geocodedLat!.toString(),
        longitude: geocodedLon!.toString(),
        address: geocodedAddress || undefined,
        verificationStatus: "verified",
        verificationConfidence: confidence.toFixed(2),
        lastVerifiedAt: new Date().toISOString(),
        verifiedBy: "ai"
      });
      correctionApplied = true;
      message = `Location verified and auto-corrected (${Math.round(distanceMeters!)}m adjustment)`;
    } else {
      updateSavedPlace(placeId, {
        verificationStatus: "verified",
        verificationConfidence: confidence.toFixed(2),
        lastVerifiedAt: new Date().toISOString(),
        verifiedBy: "ai"
      });
    }
  } else if (confidence >= 0.5) {
    // Medium confidence - mark as pending, needs review
    status = "pending";
    message = "Location needs manual review";
    
    updateSavedPlace(placeId, {
      verificationStatus: "pending",
      verificationConfidence: confidence.toFixed(2),
      lastVerifiedAt: new Date().toISOString(),
      verifiedBy: "ai"
    });
    
    // Queue notification for user review if valid phone provided
    if (recipientPhone && recipientPhone.trim().length >= 10) {
      await queueAlertNotification(
        recipientPhone,
        `Location Review: ${place.name}`,
        `The location "${place.name}" needs verification. Please check if the saved coordinates are accurate.`,
        false
      );
      notificationQueued = true;
    }
  } else {
    // Low confidence - likely mismatch
    status = "mismatch";
    message = "Location mismatch detected";
    
    updateSavedPlace(placeId, {
      verificationStatus: "mismatch",
      verificationConfidence: confidence.toFixed(2),
      lastVerifiedAt: new Date().toISOString(),
      verifiedBy: "ai"
    });
    
    // Queue urgent notification if valid phone provided
    if (recipientPhone && recipientPhone.trim().length >= 10) {
      const distanceInfo = distanceMeters ? ` (${Math.round(distanceMeters)}m difference)` : "";
      await queueAlertNotification(
        recipientPhone,
        `Location Mismatch: ${place.name}`,
        `The saved location "${place.name}" appears to be incorrect${distanceInfo}. Please verify and update the coordinates.`,
        true // urgent
      );
      notificationQueued = true;
    }
  }
  
  console.log(`[LocationVerifier] Result: ${status} (confidence: ${confidence.toFixed(2)})`);
  
  return {
    status,
    confidence,
    geocodedAddress,
    geocodedLat,
    geocodedLon,
    distanceMeters,
    nameSimilarity,
    message,
    correctionApplied,
    notificationQueued
  };
}

/**
 * Verify all pending places
 */
export async function verifyAllPendingPlaces(recipientPhone?: string): Promise<{
  total: number;
  verified: number;
  mismatch: number;
  pending: number;
}> {
  // This would need getAllSavedPlaces with filter capability
  // For now, this is a placeholder that would be expanded
  console.log("[LocationVerifier] Batch verification not yet implemented");
  
  return {
    total: 0,
    verified: 0,
    mismatch: 0,
    pending: 0
  };
}

/**
 * Manually verify a place (mark as verified by user)
 */
export function manuallyVerifyPlace(placeId: string): boolean {
  const place = getSavedPlace(placeId);
  
  if (!place) {
    return false;
  }
  
  updateSavedPlace(placeId, {
    verificationStatus: "verified",
    verificationConfidence: "1.00",
    lastVerifiedAt: new Date().toISOString(),
    verifiedBy: "manual"
  });
  
  console.log(`[LocationVerifier] Place manually verified: ${place.name}`);
  return true;
}

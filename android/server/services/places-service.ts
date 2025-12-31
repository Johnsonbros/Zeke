import { db } from "../db";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

export interface NearbyPlace {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  types: string[];
  rating?: number;
  priceLevel?: number;
  openNow?: boolean;
  distanceMeters?: number;
  phoneNumber?: string;
  website?: string;
}

export interface NearbySearchResult {
  places: NearbyPlace[];
  query: string;
  radiusMeters: number;
  centerLat: number;
  centerLng: number;
}

export interface PlaceList {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  placeIds: string[];
  hasProximityAlert: boolean;
  proximityRadiusMeters?: number;
  proximityMessage?: string;
  createdAt: string;
  updatedAt: string;
}

const placeLists = new Map<string, PlaceList>();

function generateId(): string {
  return `pl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export async function searchNearbyPlaces(
  query: string,
  latitude: number,
  longitude: number,
  radiusMeters: number = 8000,
  type?: string
): Promise<NearbySearchResult> {
  const result: NearbySearchResult = {
    places: [],
    query,
    radiusMeters,
    centerLat: latitude,
    centerLng: longitude,
  };

  if (!GOOGLE_PLACES_API_KEY) {
    console.log("[Places Service] Google Places API key not configured");
    return result;
  }

  try {
    const searchUrl = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
    searchUrl.searchParams.set("query", query);
    searchUrl.searchParams.set("location", `${latitude},${longitude}`);
    searchUrl.searchParams.set("radius", radiusMeters.toString());
    searchUrl.searchParams.set("key", GOOGLE_PLACES_API_KEY);
    if (type) {
      searchUrl.searchParams.set("type", type);
    }

    const response = await fetch(searchUrl.toString());
    if (!response.ok) {
      console.error("[Places Service] Google Places API error:", response.status);
      return result;
    }

    const data = await response.json() as {
      status: string;
      results?: Array<{
        place_id: string;
        name: string;
        formatted_address: string;
        geometry: { location: { lat: number; lng: number } };
        types?: string[];
        rating?: number;
        price_level?: number;
        opening_hours?: { open_now?: boolean };
      }>;
    };

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.error("[Places Service] Google Places API status:", data.status);
      return result;
    }

    if (data.results) {
      result.places = data.results.map((place) => ({
        placeId: place.place_id,
        name: place.name,
        address: place.formatted_address,
        latitude: place.geometry.location.lat,
        longitude: place.geometry.location.lng,
        types: place.types || [],
        rating: place.rating,
        priceLevel: place.price_level,
        openNow: place.opening_hours?.open_now,
        distanceMeters: Math.round(
          calculateDistance(latitude, longitude, place.geometry.location.lat, place.geometry.location.lng)
        ),
      }));

      result.places.sort((a, b) => (a.distanceMeters || 0) - (b.distanceMeters || 0));
    }

    console.log(`[Places Service] Found ${result.places.length} places for "${query}"`);
    return result;
  } catch (error) {
    console.error("[Places Service] Search error:", error);
    return result;
  }
}

export function getAllPlaceLists(): PlaceList[] {
  return Array.from(placeLists.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getPlaceList(id: string): PlaceList | null {
  return placeLists.get(id) || null;
}

export function createPlaceList(
  data: Omit<PlaceList, "id" | "createdAt" | "updatedAt">
): PlaceList {
  const now = new Date().toISOString();
  const list: PlaceList = {
    ...data,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  placeLists.set(list.id, list);
  console.log(`[Places Service] Created place list: ${list.name}`);
  return list;
}

export function updatePlaceList(
  id: string,
  updates: Partial<PlaceList>
): PlaceList | null {
  const existing = placeLists.get(id);
  if (!existing) {
    return null;
  }

  const updated: PlaceList = {
    ...existing,
    ...updates,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  placeLists.set(id, updated);
  console.log(`[Places Service] Updated place list: ${updated.name}`);
  return updated;
}

export function deletePlaceList(id: string): boolean {
  const existed = placeLists.has(id);
  placeLists.delete(id);
  if (existed) {
    console.log(`[Places Service] Deleted place list: ${id}`);
  }
  return existed;
}

export function addPlaceToList(listId: string, placeId: string): PlaceList | null {
  const list = placeLists.get(listId);
  if (!list) {
    return null;
  }

  if (!list.placeIds.includes(placeId)) {
    list.placeIds.push(placeId);
    list.updatedAt = new Date().toISOString();
    placeLists.set(listId, list);
    console.log(`[Places Service] Added place ${placeId} to list ${list.name}`);
  }
  return list;
}

export function removePlaceFromList(listId: string, placeId: string): PlaceList | null {
  const list = placeLists.get(listId);
  if (!list) {
    return null;
  }

  const index = list.placeIds.indexOf(placeId);
  if (index !== -1) {
    list.placeIds.splice(index, 1);
    list.updatedAt = new Date().toISOString();
    placeLists.set(listId, list);
    console.log(`[Places Service] Removed place ${placeId} from list ${list.name}`);
  }
  return list;
}

export function getPlaceListsWithPlace(placeId: string): PlaceList[] {
  return Array.from(placeLists.values()).filter((list) =>
    list.placeIds.includes(placeId)
  );
}

export function getPlaceListsWithProximityAlerts(): PlaceList[] {
  return Array.from(placeLists.values()).filter((list) => list.hasProximityAlert);
}

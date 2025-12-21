import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  syncLocationToZeke,
  syncLocationBatchToZeke,
  type ZekeLocationUpdate,
  type ZekeLocationSample,
} from "./zeke-api-adapter";

export interface LocationData {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export interface GeocodedLocation {
  city: string | null;
  region: string | null;
  country: string | null;
  street: string | null;
  postalCode: string | null;
  name: string | null;
  formattedAddress: string;
}

export interface LocationRecord {
  id: string;
  location: LocationData;
  geocoded: GeocodedLocation | null;
  createdAt: string;
  isStarred: boolean;
  label?: string;
}

export interface StarredPlace {
  id: string;
  name: string;
  location: LocationData;
  geocoded: GeocodedLocation | null;
  createdAt: string;
  icon?: string;
}

const STORAGE_KEYS = {
  LOCATION_HISTORY: "@zeke/location_history",
  STARRED_PLACES: "@zeke/starred_places",
  LAST_LOCATION: "@zeke/last_location",
  LOCATION_SETTINGS: "@zeke/location_settings",
};

export interface LocationSettings {
  trackingEnabled: boolean;
  highAccuracyMode: boolean;
  updateIntervalMs: number;
  distanceFilterMeters: number;
  saveHistoryEnabled: boolean;
  maxHistoryItems: number;
}

const DEFAULT_LOCATION_SETTINGS: LocationSettings = {
  trackingEnabled: true,
  highAccuracyMode: true,
  updateIntervalMs: 10000,
  distanceFilterMeters: 10,
  saveHistoryEnabled: true,
  maxHistoryItems: 100,
};

export function getLocationAccuracy(highAccuracy: boolean): Location.Accuracy {
  if (highAccuracy) {
    return Location.Accuracy.High;
  }
  return Location.Accuracy.Balanced;
}

export async function requestLocationPermission(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
  status: Location.PermissionStatus;
}> {
  const { status, canAskAgain } =
    await Location.requestForegroundPermissionsAsync();
  return {
    granted: status === "granted",
    canAskAgain,
    status,
  };
}

export async function checkLocationPermission(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
  status: Location.PermissionStatus;
}> {
  const { status, canAskAgain } =
    await Location.getForegroundPermissionsAsync();
  return {
    granted: status === "granted",
    canAskAgain,
    status,
  };
}

export async function getCurrentLocation(
  highAccuracy: boolean = true,
): Promise<LocationData | null> {
  try {
    const permission = await checkLocationPermission();
    if (!permission.granted) {
      console.warn("Location permission not granted");
      return null;
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: getLocationAccuracy(highAccuracy),
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      altitude: location.coords.altitude,
      accuracy: location.coords.accuracy,
      heading: location.coords.heading,
      speed: location.coords.speed,
      timestamp: location.timestamp,
    };
  } catch (error) {
    console.error("Error getting current location:", error);
    return null;
  }
}

export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<GeocodedLocation | null> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });

    if (results.length === 0) {
      return null;
    }

    const result = results[0];
    const parts: string[] = [];

    if (result.city) parts.push(result.city);
    if (result.region) parts.push(result.region);
    if (result.country && !result.region?.includes(result.country)) {
      parts.push(result.country);
    }

    return {
      city: result.city,
      region: result.region,
      country: result.country,
      street: result.street,
      postalCode: result.postalCode,
      name: result.name,
      formattedAddress:
        parts.length > 0 ? parts.join(", ") : "Unknown Location",
    };
  } catch (error) {
    console.error("Error reverse geocoding:", error);
    return null;
  }
}

export async function getLocationWithAddress(
  highAccuracy: boolean = true,
): Promise<{
  location: LocationData;
  geocoded: GeocodedLocation | null;
} | null> {
  const location = await getCurrentLocation(highAccuracy);

  if (!location) {
    return null;
  }

  const geocoded = await reverseGeocode(location.latitude, location.longitude);

  return { location, geocoded };
}

export async function getLastLocation(): Promise<LocationRecord | null> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.LAST_LOCATION);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("Error getting last location:", error);
    return null;
  }
}

export async function saveLastLocation(record: LocationRecord): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.LAST_LOCATION,
      JSON.stringify(record),
    );
  } catch (error) {
    console.error("Error saving last location:", error);
  }
}

export async function getLocationHistory(): Promise<LocationRecord[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.LOCATION_HISTORY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error getting location history:", error);
    return [];
  }
}

export async function addLocationToHistory(
  record: LocationRecord,
): Promise<void> {
  try {
    const settings = await getLocationSettings();
    if (!settings.saveHistoryEnabled) return;

    const history = await getLocationHistory();
    const updated = [record, ...history].slice(0, settings.maxHistoryItems);
    await AsyncStorage.setItem(
      STORAGE_KEYS.LOCATION_HISTORY,
      JSON.stringify(updated),
    );
  } catch (error) {
    console.error("Error adding location to history:", error);
  }
}

export async function clearLocationHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.LOCATION_HISTORY);
  } catch (error) {
    console.error("Error clearing location history:", error);
  }
}

export async function getStarredPlaces(): Promise<StarredPlace[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.STARRED_PLACES);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error getting starred places:", error);
    return [];
  }
}

export async function addStarredPlace(place: StarredPlace): Promise<void> {
  try {
    const places = await getStarredPlaces();
    const updated = [place, ...places];
    await AsyncStorage.setItem(
      STORAGE_KEYS.STARRED_PLACES,
      JSON.stringify(updated),
    );
  } catch (error) {
    console.error("Error adding starred place:", error);
  }
}

export async function removeStarredPlace(placeId: string): Promise<void> {
  try {
    const places = await getStarredPlaces();
    const updated = places.filter((p) => p.id !== placeId);
    await AsyncStorage.setItem(
      STORAGE_KEYS.STARRED_PLACES,
      JSON.stringify(updated),
    );
  } catch (error) {
    console.error("Error removing starred place:", error);
  }
}

export async function updateStarredPlace(
  placeId: string,
  updates: Partial<StarredPlace>,
): Promise<void> {
  try {
    const places = await getStarredPlaces();
    const updated = places.map((p) =>
      p.id === placeId ? { ...p, ...updates } : p,
    );
    await AsyncStorage.setItem(
      STORAGE_KEYS.STARRED_PLACES,
      JSON.stringify(updated),
    );
  } catch (error) {
    console.error("Error updating starred place:", error);
  }
}

export async function getLocationSettings(): Promise<LocationSettings> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.LOCATION_SETTINGS);
    return data
      ? { ...DEFAULT_LOCATION_SETTINGS, ...JSON.parse(data) }
      : DEFAULT_LOCATION_SETTINGS;
  } catch (error) {
    console.error("Error getting location settings:", error);
    return DEFAULT_LOCATION_SETTINGS;
  }
}

export async function saveLocationSettings(
  settings: Partial<LocationSettings>,
): Promise<void> {
  try {
    const current = await getLocationSettings();
    await AsyncStorage.setItem(
      STORAGE_KEYS.LOCATION_SETTINGS,
      JSON.stringify({ ...current, ...settings }),
    );
  } catch (error) {
    console.error("Error saving location settings:", error);
  }
}

export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  const km = meters / 1000;
  if (km < 10) {
    return `${km.toFixed(1)} km`;
  }
  return `${Math.round(km)} km`;
}

export function formatCoordinates(latitude: number, longitude: number): string {
  const latDir = latitude >= 0 ? "N" : "S";
  const lonDir = longitude >= 0 ? "E" : "W";
  return `${Math.abs(latitude).toFixed(4)}° ${latDir}, ${Math.abs(longitude).toFixed(4)}° ${lonDir}`;
}

export function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return new Date(timestamp).toLocaleDateString();
}

export function generateLocationId(): string {
  return `loc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function isLocationServicesEnabled(): Promise<boolean> {
  return Location.hasServicesEnabledAsync();
}

export type LocationSubscription = Location.LocationSubscription;

export async function startLocationUpdates(
  callback: (location: LocationData) => void,
  settings?: Partial<LocationSettings>,
): Promise<LocationSubscription | null> {
  try {
    const permission = await checkLocationPermission();
    if (!permission.granted) {
      console.warn("Location permission not granted");
      return null;
    }

    const locationSettings = await getLocationSettings();
    const mergedSettings = { ...locationSettings, ...settings };

    const subscription = await Location.watchPositionAsync(
      {
        accuracy: getLocationAccuracy(mergedSettings.highAccuracyMode),
        timeInterval: mergedSettings.updateIntervalMs,
        distanceInterval: mergedSettings.distanceFilterMeters,
      },
      (location) => {
        const locationData: LocationData = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          altitude: location.coords.altitude,
          accuracy: location.coords.accuracy,
          heading: location.coords.heading,
          speed: location.coords.speed,
          timestamp: location.timestamp,
        };
        callback(locationData);
      },
    );

    return subscription;
  } catch (error) {
    console.error("Error starting location updates:", error);
    return null;
  }
}

export function stopLocationUpdates(subscription: LocationSubscription): void {
  subscription.remove();
}

const PENDING_SYNC_KEY = "@zeke/pending_location_sync";
const SYNC_SETTINGS_KEY = "@zeke/location_sync_settings";

export interface LocationSyncSettings {
  syncEnabled: boolean;
  syncIntervalMs: number;
  batchSize: number;
  lastSyncAt: number | null;
}

const DEFAULT_SYNC_SETTINGS: LocationSyncSettings = {
  syncEnabled: true,
  syncIntervalMs: 60000,
  batchSize: 20,
  lastSyncAt: null,
};

export async function getLocationSyncSettings(): Promise<LocationSyncSettings> {
  try {
    const data = await AsyncStorage.getItem(SYNC_SETTINGS_KEY);
    return data
      ? { ...DEFAULT_SYNC_SETTINGS, ...JSON.parse(data) }
      : DEFAULT_SYNC_SETTINGS;
  } catch {
    return DEFAULT_SYNC_SETTINGS;
  }
}

export async function saveLocationSyncSettings(
  settings: Partial<LocationSyncSettings>,
): Promise<void> {
  try {
    const current = await getLocationSyncSettings();
    await AsyncStorage.setItem(
      SYNC_SETTINGS_KEY,
      JSON.stringify({ ...current, ...settings }),
    );
  } catch (error) {
    console.error("Error saving location sync settings:", error);
  }
}

export async function addPendingLocationSync(
  location: LocationData,
  geocoded: GeocodedLocation | null,
): Promise<void> {
  try {
    const pending = await getPendingLocationSyncs();
    const sample: ZekeLocationSample = {
      latitude: location.latitude,
      longitude: location.longitude,
      altitude: location.altitude,
      accuracy: location.accuracy,
      heading: location.heading,
      speed: location.speed,
      recordedAt: new Date(location.timestamp).toISOString(),
    };
    pending.push(sample);
    await AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(pending));
  } catch (error) {
    console.error("Error adding pending location sync:", error);
  }
}

export async function getPendingLocationSyncs(): Promise<ZekeLocationSample[]> {
  try {
    const data = await AsyncStorage.getItem(PENDING_SYNC_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function clearPendingLocationSyncs(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_SYNC_KEY);
  } catch (error) {
    console.error("Error clearing pending location syncs:", error);
  }
}

export async function syncPendingLocationsToZeke(): Promise<{
  success: boolean;
  synced: number;
}> {
  try {
    const syncSettings = await getLocationSyncSettings();
    if (!syncSettings.syncEnabled) {
      return { success: true, synced: 0 };
    }

    const pending = await getPendingLocationSyncs();
    if (pending.length === 0) {
      return { success: true, synced: 0 };
    }

    const batch = pending.slice(0, syncSettings.batchSize);
    const result = await syncLocationBatchToZeke(batch);

    if (result.success) {
      const remaining = pending.slice(syncSettings.batchSize);
      if (remaining.length > 0) {
        await AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(remaining));
      } else {
        await clearPendingLocationSyncs();
      }
      await saveLocationSyncSettings({ lastSyncAt: Date.now() });
    }

    return result;
  } catch (error) {
    console.error("Error syncing pending locations:", error);
    return { success: false, synced: 0 };
  }
}

export async function syncCurrentLocationToZeke(
  location: LocationData,
  geocoded: GeocodedLocation | null,
): Promise<{ success: boolean; id?: string }> {
  try {
    const update: ZekeLocationUpdate = {
      latitude: location.latitude,
      longitude: location.longitude,
      altitude: location.altitude,
      accuracy: location.accuracy,
      heading: location.heading,
      speed: location.speed,
      city: geocoded?.city,
      region: geocoded?.region,
      country: geocoded?.country,
      street: geocoded?.street,
      postalCode: geocoded?.postalCode,
      formattedAddress: geocoded?.formattedAddress,
      recordedAt: new Date(location.timestamp).toISOString(),
    };

    return await syncLocationToZeke(update);
  } catch (error) {
    console.error("Error syncing current location to Zeke:", error);
    return { success: false };
  }
}

export async function startLocationUpdatesWithZekeSync(
  callback: (location: LocationData) => void,
  settings?: Partial<LocationSettings>,
): Promise<LocationSubscription | null> {
  const syncSettings = await getLocationSyncSettings();

  return startLocationUpdates(async (location) => {
    callback(location);

    if (syncSettings.syncEnabled) {
      let geocoded: GeocodedLocation | null = null;
      try {
        geocoded = await reverseGeocode(location.latitude, location.longitude);
        const result = await syncCurrentLocationToZeke(location, geocoded);

        if (!result.success) {
          console.log(
            "[ZEKE Location] Real-time sync returned failure, queueing for batch",
          );
          await addPendingLocationSync(location, geocoded);
        }
      } catch (error) {
        console.error(
          "[ZEKE Location] Real-time sync error, queueing for batch:",
          error,
        );
        await addPendingLocationSync(location, geocoded);
      }
    }
  }, settings);
}

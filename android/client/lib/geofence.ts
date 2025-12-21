import type { Geofence } from "./zeke-api-adapter";

export interface UserLocation {
  latitude: number;
  longitude: number;
}

export function generateGeofenceId(): string {
  return `geo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function calculateDistanceToGeofence(
  userLocation: UserLocation,
  geofence: Geofence,
): number {
  const R = 6371e3;
  const phi1 = (userLocation.latitude * Math.PI) / 180;
  const phi2 = (geofence.latitude * Math.PI) / 180;
  const deltaPhi =
    ((geofence.latitude - userLocation.latitude) * Math.PI) / 180;
  const deltaLambda =
    ((geofence.longitude - userLocation.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function isInsideGeofence(
  userLocation: UserLocation,
  geofence: Geofence,
): boolean {
  const distance = calculateDistanceToGeofence(userLocation, geofence);
  return distance <= geofence.radius;
}

export function findNearbyGeofences(
  userLocation: UserLocation,
  geofences: Geofence[],
  maxDistance: number,
): { geofence: Geofence; distance: number }[] {
  const nearby: { geofence: Geofence; distance: number }[] = [];

  for (const geofence of geofences) {
    const distance = calculateDistanceToGeofence(userLocation, geofence);
    if (distance <= maxDistance) {
      nearby.push({ geofence, distance });
    }
  }

  return nearby.sort((a, b) => a.distance - b.distance);
}

export function formatRadius(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  const km = meters / 1000;
  if (km < 10) {
    return `${km.toFixed(1)}km`;
  }
  return `${Math.round(km)}km`;
}

export function getActionTypeLabel(actionType: Geofence["actionType"]): string {
  switch (actionType) {
    case "notification":
      return "Notification";
    case "grocery_prompt":
      return "Grocery Prompt";
    case "custom":
      return "Custom Action";
    default:
      return "Unknown";
  }
}

export function getTriggerLabel(triggerOn: Geofence["triggerOn"]): string {
  switch (triggerOn) {
    case "enter":
      return "On Enter";
    case "exit":
      return "On Exit";
    case "both":
      return "Enter & Exit";
    default:
      return "Unknown";
  }
}

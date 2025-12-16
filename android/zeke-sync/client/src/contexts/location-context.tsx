import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { LocationSettings, SavedPlace } from "@shared/schema";

interface NearbyPlace extends SavedPlace {
  distance: number;
}

interface ProximityAlert {
  place: NearbyPlace;
  triggeredAt: Date;
  dismissed: boolean;
}

interface LocationContextValue {
  currentPosition: { lat: number; lng: number } | null;
  accuracy: number | null;
  isTracking: boolean;
  error: string | null;
  lastUpdate: Date | null;
  nearbyPlaces: NearbyPlace[];
  proximityAlerts: ProximityAlert[];
  startTracking: () => void;
  stopTracking: () => void;
  getCurrentPosition: () => Promise<{ lat: number; lng: number }>;
  dismissAlert: (placeId: string) => void;
  clearAlerts: () => void;
}

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [currentPosition, setCurrentPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);
  const [proximityAlerts, setProximityAlerts] = useState<ProximityAlert[]>([]);

  const watchIdRef = useRef<number | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastRecordedRef = useRef<Date | null>(null);
  const alertCooldownRef = useRef<Map<string, Date>>(new Map());

  const { data: settings } = useQuery<LocationSettings>({
    queryKey: ["/api/location/settings"],
    staleTime: 30000,
  });

  const recordLocation = useCallback(async (lat: number, lng: number, acc?: number) => {
    try {
      await apiRequest("POST", "/api/location/history", {
        latitude: lat,
        longitude: lng,
        accuracy: acc,
        source: "gps"
      });
      lastRecordedRef.current = new Date();
      queryClient.invalidateQueries({ queryKey: ["/api/location/history"] });
    } catch (error) {
      console.error("Failed to record location:", error);
    }
  }, []);

  const checkProximity = useCallback(async (lat: number, lng: number) => {
    try {
      const response = await fetch(`/api/location/places/nearby?latitude=${lat}&longitude=${lng}&radiusMeters=1000`);
      if (response.ok) {
        const places: NearbyPlace[] = await response.json();
        setNearbyPlaces(places);
        
        const alertRadius = settings?.defaultProximityRadiusMeters || 500;
        const now = new Date();
        const alertCooldownMs = 30 * 60 * 1000;

        places.forEach((place) => {
          if (place.proximityAlertEnabled && place.distance <= (place.proximityRadiusMeters || alertRadius)) {
            const lastAlertTime = alertCooldownRef.current.get(place.id);
            if (!lastAlertTime || (now.getTime() - lastAlertTime.getTime()) > alertCooldownMs) {
              alertCooldownRef.current.set(place.id, now);
              setProximityAlerts((prev) => {
                if (prev.some(a => a.place.id === place.id && !a.dismissed)) {
                  return prev;
                }
                return [...prev, { place, triggeredAt: now, dismissed: false }];
              });
            }
          }
        });

        return places;
      }
    } catch (error) {
      console.error("Failed to check proximity:", error);
    }
    return [];
  }, [settings?.defaultProximityRadiusMeters]);

  const handlePositionSuccess = useCallback((position: GeolocationPosition) => {
    const { latitude, longitude, accuracy: acc } = position.coords;
    setCurrentPosition({ lat: latitude, lng: longitude });
    setAccuracy(acc);
    setError(null);
    setLastUpdate(new Date());
  }, []);

  const handlePositionError = useCallback((error: GeolocationPositionError) => {
    setError(error.message);
  }, []);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported");
      return;
    }

    setIsTracking(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePositionSuccess,
      handlePositionError,
      {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 10000,
      }
    );
  }, [handlePositionSuccess, handlePositionError]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (recordingIntervalRef.current !== null) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    setIsTracking(false);
  }, []);

  const getCurrentPosition = useCallback((): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          handlePositionSuccess(position);
          resolve({ lat: latitude, lng: longitude });
        },
        (error) => {
          handlePositionError(error);
          reject(error);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }, [handlePositionSuccess, handlePositionError]);

  const dismissAlert = useCallback((placeId: string) => {
    setProximityAlerts((prev) =>
      prev.map((a) =>
        a.place.id === placeId ? { ...a, dismissed: true } : a
      )
    );
  }, []);

  const clearAlerts = useCallback(() => {
    setProximityAlerts([]);
  }, []);

  useEffect(() => {
    if (settings?.trackingEnabled && !isTracking) {
      startTracking();
    } else if (!settings?.trackingEnabled && isTracking) {
      stopTracking();
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (recordingIntervalRef.current !== null) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, [settings?.trackingEnabled, isTracking, startTracking, stopTracking]);

  useEffect(() => {
    if (!isTracking || !currentPosition || !settings) return;

    const updateInterval = (settings.trackingIntervalMinutes || 5) * 60 * 1000;

    const shouldRecord = () => {
      if (!lastRecordedRef.current) return true;
      return (new Date().getTime() - lastRecordedRef.current.getTime()) >= updateInterval;
    };

    if (shouldRecord()) {
      recordLocation(currentPosition.lat, currentPosition.lng, accuracy ?? undefined);
      checkProximity(currentPosition.lat, currentPosition.lng);
    }

    recordingIntervalRef.current = setInterval(() => {
      if (currentPosition) {
        recordLocation(currentPosition.lat, currentPosition.lng, accuracy ?? undefined);
        checkProximity(currentPosition.lat, currentPosition.lng);
      }
    }, updateInterval);

    return () => {
      if (recordingIntervalRef.current !== null) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    };
  }, [isTracking, currentPosition, accuracy, settings, recordLocation, checkProximity]);

  return (
    <LocationContext.Provider
      value={{
        currentPosition,
        accuracy,
        isTracking,
        error,
        lastUpdate,
        nearbyPlaces,
        proximityAlerts,
        startTracking,
        stopTracking,
        getCurrentPosition,
        dismissAlert,
        clearAlerts,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error("useLocation must be used within a LocationProvider");
  }
  return context;
}

import { useEffect, useRef, useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { LocationSettings, SavedPlace } from "@shared/schema";

interface LocationTrackingState {
  currentPosition: GeolocationPosition | null;
  isTracking: boolean;
  error: string | null;
  lastUpdate: Date | null;
}

interface NearbyPlace extends SavedPlace {
  distance: number;
}

export function useLocationTracking() {
  const [state, setState] = useState<LocationTrackingState>({
    currentPosition: null,
    isTracking: false,
    error: null,
    lastUpdate: null,
  });

  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { data: settings } = useQuery<LocationSettings>({
    queryKey: ["/api/location/settings"],
    staleTime: 30000,
  });

  const recordLocation = useCallback(async (position: GeolocationPosition) => {
    try {
      await apiRequest("POST", "/api/location/history", {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        source: "gps"
      });
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
        return places;
      }
    } catch (error) {
      console.error("Failed to check proximity:", error);
    }
    return [];
  }, []);

  const handlePositionSuccess = useCallback((position: GeolocationPosition) => {
    setState(prev => ({
      ...prev,
      currentPosition: position,
      error: null,
      lastUpdate: new Date(),
    }));
  }, []);

  const handlePositionError = useCallback((error: GeolocationPositionError) => {
    setState(prev => ({
      ...prev,
      error: error.message,
    }));
  }, []);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setState(prev => ({
        ...prev,
        error: "Geolocation is not supported",
      }));
      return;
    }

    setState(prev => ({ ...prev, isTracking: true }));

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePositionSuccess,
      handlePositionError,
      {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 10000,
      }
    );

    const updateInterval = settings?.trackingIntervalMinutes || 5;
    recordingIntervalRef.current = setInterval(() => {
      if (state.currentPosition) {
        recordLocation(state.currentPosition);
        checkProximity(
          state.currentPosition.coords.latitude,
          state.currentPosition.coords.longitude
        );
      }
    }, updateInterval * 60 * 1000);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        handlePositionSuccess(position);
        recordLocation(position);
        checkProximity(position.coords.latitude, position.coords.longitude);
      },
      handlePositionError,
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [settings?.trackingIntervalMinutes, handlePositionSuccess, handlePositionError, recordLocation, checkProximity, state.currentPosition]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (recordingIntervalRef.current !== null) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    setState(prev => ({ ...prev, isTracking: false }));
  }, []);

  const getCurrentPosition = useCallback((): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          handlePositionSuccess(position);
          resolve(position);
        },
        (error) => {
          handlePositionError(error);
          reject(error);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }, [handlePositionSuccess, handlePositionError]);

  useEffect(() => {
    if (settings?.trackingEnabled && !state.isTracking) {
      startTracking();
    } else if (!settings?.trackingEnabled && state.isTracking) {
      stopTracking();
    }

    return () => {
      stopTracking();
    };
  }, [settings?.trackingEnabled]);

  return {
    ...state,
    nearbyPlaces,
    startTracking,
    stopTracking,
    getCurrentPosition,
    checkProximity,
    settings,
  };
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
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

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

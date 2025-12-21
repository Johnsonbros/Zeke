import { useEffect, useRef, useCallback, useState } from "react";
import * as Location from "expo-location";
import { Platform } from "react-native";
import {
  getGeofences,
  saveGeofenceTriggerEvent,
  type Geofence,
  type GeofenceTriggerEvent,
} from "@/lib/zeke-api-adapter";
import { isInsideGeofence, findNearbyGeofences } from "@/lib/geofence";
import {
  showGeofenceNotification,
  showGroceryPromptNotification,
  showCustomGeofenceNotification,
  requestNotificationPermissions,
} from "@/lib/notifications";

interface GeofenceState {
  [geofenceId: string]: {
    isInside: boolean;
    lastTriggeredAt: number | null;
  };
}

interface TriggerInfo {
  geofenceId: string;
  geofenceName: string;
  event: "enter" | "exit";
  timestamp: string;
}

interface NearbyGeofence {
  geofence: Geofence;
  distance: number;
}

interface UseGeofenceMonitorResult {
  isMonitoring: boolean;
  nearbyGeofences: NearbyGeofence[];
  lastTrigger: TriggerInfo | null;
  hasNotificationPermission: boolean;
  requestPermission: () => Promise<boolean>;
}

const MONITORING_INTERVAL_MS = 30000;
const TRIGGER_COOLDOWN_MS = 5 * 60 * 1000;
const NEARBY_DISTANCE_METERS = 5000;

function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function useGeofenceMonitor(enabled: boolean): UseGeofenceMonitorResult {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [nearbyGeofences, setNearbyGeofences] = useState<NearbyGeofence[]>([]);
  const [lastTrigger, setLastTrigger] = useState<TriggerInfo | null>(null);
  const [hasNotificationPermission, setHasNotificationPermission] =
    useState(false);

  const geofenceStateRef = useRef<GeofenceState>({});
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(
    null,
  );

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const granted = await requestNotificationPermissions();
    setHasNotificationPermission(granted);
    return granted;
  }, []);

  const handleGeofenceTrigger = useCallback(
    async (
      geofence: Geofence,
      event: "enter" | "exit",
      latitude: number,
      longitude: number,
    ) => {
      const now = Date.now();
      const state = geofenceStateRef.current[geofence.id];

      if (
        state?.lastTriggeredAt &&
        now - state.lastTriggeredAt < TRIGGER_COOLDOWN_MS
      ) {
        return;
      }

      geofenceStateRef.current[geofence.id] = {
        isInside: event === "enter",
        lastTriggeredAt: now,
      };

      const triggerEvent: GeofenceTriggerEvent = {
        id: generateEventId(),
        geofenceId: geofence.id,
        event,
        timestamp: new Date().toISOString(),
        latitude,
        longitude,
        synced: false,
      };

      await saveGeofenceTriggerEvent(triggerEvent);

      setLastTrigger({
        geofenceId: geofence.id,
        geofenceName: geofence.name,
        event,
        timestamp: triggerEvent.timestamp,
      });

      if (hasNotificationPermission) {
        switch (geofence.actionType) {
          case "notification":
            await showGeofenceNotification(geofence, event);
            break;
          case "grocery_prompt":
            if (event === "enter") {
              await showGroceryPromptNotification(geofence);
            }
            break;
          case "custom":
            await showCustomGeofenceNotification(geofence, event);
            break;
        }
      }
    },
    [hasNotificationPermission],
  );

  const checkGeofences = useCallback(
    async (latitude: number, longitude: number) => {
      try {
        const geofences = await getGeofences();
        const activeGeofences = geofences.filter((g) => g.isActive);

        if (activeGeofences.length === 0) {
          setNearbyGeofences([]);
          return;
        }

        const userLocation = { latitude, longitude };

        const nearby = findNearbyGeofences(
          userLocation,
          activeGeofences,
          NEARBY_DISTANCE_METERS,
        );
        setNearbyGeofences(nearby);

        for (const geofence of activeGeofences) {
          const isInside = isInsideGeofence(userLocation, geofence);
          const previousState = geofenceStateRef.current[geofence.id];
          const wasInside = previousState?.isInside ?? null;

          if (wasInside === null) {
            geofenceStateRef.current[geofence.id] = {
              isInside,
              lastTriggeredAt: null,
            };
            continue;
          }

          if (!wasInside && isInside) {
            if (
              geofence.triggerOn === "enter" ||
              geofence.triggerOn === "both"
            ) {
              await handleGeofenceTrigger(
                geofence,
                "enter",
                latitude,
                longitude,
              );
            } else {
              geofenceStateRef.current[geofence.id] = {
                isInside: true,
                lastTriggeredAt:
                  geofenceStateRef.current[geofence.id]?.lastTriggeredAt ||
                  null,
              };
            }
          } else if (wasInside && !isInside) {
            if (
              geofence.triggerOn === "exit" ||
              geofence.triggerOn === "both"
            ) {
              await handleGeofenceTrigger(
                geofence,
                "exit",
                latitude,
                longitude,
              );
            } else {
              geofenceStateRef.current[geofence.id] = {
                isInside: false,
                lastTriggeredAt:
                  geofenceStateRef.current[geofence.id]?.lastTriggeredAt ||
                  null,
              };
            }
          }
        }
      } catch (error) {
        console.error("Error checking geofences:", error);
      }
    },
    [handleGeofenceTrigger],
  );

  const startMonitoring = useCallback(async () => {
    if (Platform.OS === "web") {
      setIsMonitoring(false);
      return;
    }

    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") {
        console.warn("Location permission not granted for geofence monitoring");
        setIsMonitoring(false);
        return;
      }

      setIsMonitoring(true);

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await checkGeofences(location.coords.latitude, location.coords.longitude);

      locationSubscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: MONITORING_INTERVAL_MS,
          distanceInterval: 50,
        },
        async (location) => {
          await checkGeofences(
            location.coords.latitude,
            location.coords.longitude,
          );
        },
      );
    } catch (error) {
      console.error("Error starting geofence monitoring:", error);
      setIsMonitoring(false);
    }
  }, [checkGeofences]);

  const stopMonitoring = useCallback(() => {
    if (locationSubscriptionRef.current) {
      locationSubscriptionRef.current.remove();
      locationSubscriptionRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsMonitoring(false);
  }, []);

  useEffect(() => {
    if (enabled) {
      startMonitoring();
    } else {
      stopMonitoring();
    }

    return () => {
      stopMonitoring();
    };
  }, [enabled, startMonitoring, stopMonitoring]);

  useEffect(() => {
    const checkPermission = async () => {
      if (Platform.OS === "web") {
        setHasNotificationPermission(false);
        return;
      }
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === "granted") {
        const granted = await requestNotificationPermissions();
        setHasNotificationPermission(granted);
      }
    };
    checkPermission();
  }, []);

  return {
    isMonitoring,
    nearbyGeofences,
    lastTrigger,
    hasNotificationPermission,
    requestPermission,
  };
}

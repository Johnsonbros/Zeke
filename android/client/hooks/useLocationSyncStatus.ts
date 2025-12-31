import { useState, useEffect } from "react";
import {
  locationSyncService,
  type LocationSyncStatus,
} from "@/lib/location-sync-service";

export function useLocationSyncStatus(): LocationSyncStatus & {
  flushQueue: () => Promise<{ success: boolean; synced: number }>;
  clearQueue: () => Promise<void>;
} {
  const [status, setStatus] = useState<LocationSyncStatus>(
    locationSyncService.getStatus()
  );

  useEffect(() => {
    locationSyncService.initialize();
    const unsubscribe = locationSyncService.subscribe(setStatus);
    return unsubscribe;
  }, []);

  const flushQueue = async () => {
    return locationSyncService.flushPendingQueue();
  };

  const clearQueue = async () => {
    return locationSyncService.clearQueue();
  };

  return {
    ...status,
    flushQueue,
    clearQueue,
  };
}

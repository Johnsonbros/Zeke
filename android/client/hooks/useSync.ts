import { useEffect, useState } from "react";
import { ConnectivityService } from "@/lib/connectivity";
import { SyncTrigger } from "@/lib/sync-trigger";

interface UseSyncReturn {
  isOnline: boolean;
  isSyncing: boolean;
  triggerSync: () => Promise<void>;
  timeSinceLastSync: number;
}

/**
 * Hook for monitoring connectivity and triggering sync in components
 */
export function useSync(): UseSyncReturn {
  const [isOnline, setIsOnline] = useState(ConnectivityService.isOnline());
  const [isSyncing, setIsSyncing] = useState(false);
  const [timeSinceLastSync, setTimeSinceLastSync] = useState(0);

  useEffect(() => {
    // Subscribe to connectivity changes
    const unsubscribe = ConnectivityService.onChange((online) => {
      setIsOnline(online);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    // Update sync status periodically
    const interval = setInterval(() => {
      setIsSyncing(SyncTrigger.isSyncInProgress());
      setTimeSinceLastSync(SyncTrigger.getTimeSinceLastSync());
    }, 500);

    return () => clearInterval(interval);
  }, []);

  const triggerSync = async (): Promise<void> => {
    setIsSyncing(true);
    try {
      await SyncTrigger.triggerSync(true);
    } finally {
      setIsSyncing(false);
    }
  };

  return {
    isOnline,
    isSyncing,
    triggerSync,
    timeSinceLastSync,
  };
}

import { useState, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import {
  syncContacts,
  getContactSyncMetadata,
  getContactSyncSettings,
  setContactSyncSettings,
  shouldAutoSync,
  initializeContactMap,
  ContactSyncMetadata,
  ContactSyncSettings,
  SyncContactsResult,
} from "@/lib/contact-sync";

export interface UseContactSyncReturn {
  syncNow: () => Promise<SyncContactsResult>;
  isSyncing: boolean;
  lastSyncTime: string | null;
  lastSyncCount: number;
  syncError: string | null;
  autoSyncEnabled: boolean;
  setAutoSyncEnabled: (enabled: boolean) => Promise<void>;
}

export function useContactSync(): UseContactSyncReturn {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [metadata, setMetadata] = useState<ContactSyncMetadata>({
    lastSyncTime: null,
    lastSyncCount: 0,
    syncInProgress: false,
  });
  const [settings, setSettings] = useState<ContactSyncSettings>({
    autoSyncEnabled: true,
    syncIntervalHours: 24,
  });
  const [syncError, setSyncError] = useState<string | null>(null);
  const initialSyncDone = useRef(false);
  const autoSyncCheckDone = useRef(false);

  useEffect(() => {
    Promise.all([
      getContactSyncMetadata(),
      getContactSyncSettings(),
    ]).then(([meta, sett]) => {
      setMetadata(meta);
      setSettings(sett);
    });
    
    initializeContactMap(queryClient);
  }, [queryClient]);

  const syncNowInternal = useCallback(async (): Promise<SyncContactsResult> => {
    if (isSyncing) {
      return { success: false, count: 0, error: "Sync already in progress" };
    }

    setIsSyncing(true);
    setSyncError(null);

    try {
      const result = await syncContacts(queryClient);

      if (result.success) {
        const updatedMeta = await getContactSyncMetadata();
        setMetadata(updatedMeta);
      } else if (result.error) {
        setSyncError(result.error);
      }

      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [queryClient, isSyncing]);

  useEffect(() => {
    if (!isAuthenticated) return;
    
    if (!metadata.lastSyncTime && !initialSyncDone.current) {
      initialSyncDone.current = true;
      syncNowInternal();
      return;
    }
    
    if (
      metadata.lastSyncTime &&
      !autoSyncCheckDone.current &&
      shouldAutoSync(metadata.lastSyncTime, settings)
    ) {
      autoSyncCheckDone.current = true;
      console.log("[ContactSync] Auto-sync triggered based on interval");
      syncNowInternal();
    }
  }, [isAuthenticated, metadata.lastSyncTime, settings, syncNowInternal]);

  const syncNow = useCallback(async (): Promise<SyncContactsResult> => {
    return syncNowInternal();
  }, [syncNowInternal]);

  const setAutoSyncEnabled = useCallback(async (enabled: boolean) => {
    await setContactSyncSettings({ autoSyncEnabled: enabled });
    setSettings((prev) => ({ ...prev, autoSyncEnabled: enabled }));
  }, []);

  return {
    syncNow,
    isSyncing,
    lastSyncTime: metadata.lastSyncTime,
    lastSyncCount: metadata.lastSyncCount,
    syncError,
    autoSyncEnabled: settings.autoSyncEnabled,
    setAutoSyncEnabled,
  };
}

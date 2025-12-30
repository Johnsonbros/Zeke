import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient } from "@tanstack/react-query";
import { getContacts } from "./zeke-api-adapter";
import { buildPhoneContactMap, PhoneContactMap } from "./phone-utils";
import { Contact } from "./zeke-types";

const CONTACT_SYNC_KEY = "zeke_contact_sync_metadata";
const CONTACT_SYNC_SETTINGS_KEY = "zeke_contact_sync_settings";

export interface ContactSyncMetadata {
  lastSyncTime: string | null;
  lastSyncCount: number;
  syncInProgress: boolean;
}

export interface ContactSyncSettings {
  autoSyncEnabled: boolean;
  syncIntervalHours: number;
}

const DEFAULT_SYNC_SETTINGS: ContactSyncSettings = {
  autoSyncEnabled: true,
  syncIntervalHours: 24,
};

let cachedContactMap: PhoneContactMap = {};

export function getContactMap(): PhoneContactMap {
  return cachedContactMap;
}

export async function getContactSyncSettings(): Promise<ContactSyncSettings> {
  try {
    const stored = await AsyncStorage.getItem(CONTACT_SYNC_SETTINGS_KEY);
    if (stored) {
      return { ...DEFAULT_SYNC_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.error("[ContactSync] Failed to get settings:", error);
  }
  return DEFAULT_SYNC_SETTINGS;
}

export async function setContactSyncSettings(
  settings: Partial<ContactSyncSettings>
): Promise<void> {
  try {
    const current = await getContactSyncSettings();
    const updated = { ...current, ...settings };
    await AsyncStorage.setItem(CONTACT_SYNC_SETTINGS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("[ContactSync] Failed to save settings:", error);
  }
}

export function shouldAutoSync(
  lastSyncTime: string | null,
  settings: ContactSyncSettings
): boolean {
  if (!settings.autoSyncEnabled) return false;
  if (!lastSyncTime) return true;
  
  const lastSync = new Date(lastSyncTime).getTime();
  const now = Date.now();
  const intervalMs = settings.syncIntervalHours * 60 * 60 * 1000;
  
  return now - lastSync >= intervalMs;
}

const DEFAULT_METADATA: ContactSyncMetadata = {
  lastSyncTime: null,
  lastSyncCount: 0,
  syncInProgress: false,
};

export async function getContactSyncMetadata(): Promise<ContactSyncMetadata> {
  try {
    const stored = await AsyncStorage.getItem(CONTACT_SYNC_KEY);
    if (stored) {
      return { ...DEFAULT_METADATA, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.error("[ContactSync] Failed to get metadata:", error);
  }
  return DEFAULT_METADATA;
}

export async function setContactSyncMetadata(
  metadata: Partial<ContactSyncMetadata>
): Promise<void> {
  try {
    const current = await getContactSyncMetadata();
    const updated = { ...current, ...metadata };
    await AsyncStorage.setItem(CONTACT_SYNC_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("[ContactSync] Failed to save metadata:", error);
  }
}

export interface SyncContactsResult {
  success: boolean;
  count: number;
  error?: string;
}

export async function syncContacts(
  queryClient: QueryClient
): Promise<SyncContactsResult> {
  console.log("[ContactSync] Starting contact sync...");

  const currentMeta = await getContactSyncMetadata();
  if (currentMeta.syncInProgress) {
    console.log("[ContactSync] Sync already in progress, skipping");
    return { success: false, count: 0, error: "Sync already in progress" };
  }

  await setContactSyncMetadata({ syncInProgress: true });

  try {
    const contacts = await getContacts();
    console.log("[ContactSync] Fetched", contacts.length, "contacts from ZEKE");

    queryClient.setQueryData(["/api/contacts"], contacts);
    
    cachedContactMap = buildPhoneContactMap(contacts);
    console.log("[ContactSync] Built phone-to-contact map with", Object.keys(cachedContactMap).length, "entries");

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/twilio/sms/conversations"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/twilio/calls"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/sms-log"] }),
    ]);
    console.log("[ContactSync] Invalidated SMS/voice caches for name resolution");

    await setContactSyncMetadata({
      lastSyncTime: new Date().toISOString(),
      lastSyncCount: contacts.length,
      syncInProgress: false,
    });

    console.log("[ContactSync] Sync completed successfully");
    return { success: true, count: contacts.length };
  } catch (error: any) {
    console.error("[ContactSync] Sync failed:", error);

    await setContactSyncMetadata({ syncInProgress: false });

    return {
      success: false,
      count: 0,
      error: error.message || "Failed to sync contacts",
    };
  }
}

export async function initializeContactMap(
  queryClient: QueryClient
): Promise<void> {
  try {
    const contacts = queryClient.getQueryData<Contact[]>(["/api/contacts"]);
    if (contacts && contacts.length > 0) {
      cachedContactMap = buildPhoneContactMap(contacts);
      console.log("[ContactSync] Initialized contact map from cache with", Object.keys(cachedContactMap).length, "entries");
    }
  } catch (error) {
    console.error("[ContactSync] Failed to initialize contact map:", error);
  }
}

export async function clearContactSyncMetadata(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CONTACT_SYNC_KEY);
  } catch (error) {
    console.error("[ContactSync] Failed to clear metadata:", error);
  }
}

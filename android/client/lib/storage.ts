import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceInfo } from "@/components/DeviceCard";
import { Message } from "@/components/ChatBubble";

export interface Memory {
  id: string;
  title: string;
  transcript: string;
  timestamp: string;
  deviceType: "omi" | "limitless";
  speakers?: string[];
  isStarred: boolean;
  duration?: string;
}

const STORAGE_KEYS = {
  DEVICES: "@zeke/devices",
  MEMORIES: "@zeke/memories",
  CHAT_MESSAGES: "@zeke/chat_messages",
  SETTINGS: "@zeke/settings",
  RECENT_SEARCHES: "@zeke/recent_searches",
  OMI_API_KEY: "@zeke/omi_api_key",
  LIMITLESS_API_KEY: "@zeke/limitless_api_key",
};

export interface NotificationSettings {
  enabled: boolean;
  pendantConnected: boolean;
  pendantDisconnected: boolean;
  lowBattery: boolean;
  syncComplete: boolean;
  newMemory: boolean;
  aiResponses: boolean;
  dailySummary: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export interface Settings {
  autoSync: boolean;
  notifications: boolean;
  dataRetentionDays: number;
  notificationSettings: NotificationSettings;
}

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  pendantConnected: true,
  pendantDisconnected: true,
  lowBattery: true,
  syncComplete: false,
  newMemory: true,
  aiResponses: true,
  dailySummary: false,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
};

const DEFAULT_SETTINGS: Settings = {
  autoSync: true,
  notifications: true,
  dataRetentionDays: 30,
  notificationSettings: DEFAULT_NOTIFICATION_SETTINGS,
};

export function getDefaultNotificationSettings(): NotificationSettings {
  return { ...DEFAULT_NOTIFICATION_SETTINGS };
}

export async function getDevices(): Promise<DeviceInfo[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.DEVICES);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error getting devices:", error);
    return [];
  }
}

export async function saveDevices(devices: DeviceInfo[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.DEVICES, JSON.stringify(devices));
  } catch (error) {
    console.error("Error saving devices:", error);
  }
}

export async function getMemories(): Promise<Memory[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.MEMORIES);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error getting memories:", error);
    return [];
  }
}

export async function saveMemories(memories: Memory[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(memories));
  } catch (error) {
    console.error("Error saving memories:", error);
  }
}

export async function getChatMessages(): Promise<Message[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.CHAT_MESSAGES);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error getting chat messages:", error);
    return [];
  }
}

export async function saveChatMessages(messages: Message[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.CHAT_MESSAGES, JSON.stringify(messages));
  } catch (error) {
    console.error("Error saving chat messages:", error);
  }
}

export async function getSettings(): Promise<Settings> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
    return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
  } catch (error) {
    console.error("Error getting settings:", error);
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  try {
    const current = await getSettings();
    await AsyncStorage.setItem(
      STORAGE_KEYS.SETTINGS,
      JSON.stringify({ ...current, ...settings })
    );
  } catch (error) {
    console.error("Error saving settings:", error);
  }
}

export async function getRecentSearches(): Promise<string[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.RECENT_SEARCHES);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error getting recent searches:", error);
    return [];
  }
}

export async function addRecentSearch(query: string): Promise<void> {
  try {
    const searches = await getRecentSearches();
    const filtered = searches.filter((s) => s !== query);
    const updated = [query, ...filtered].slice(0, 10);
    await AsyncStorage.setItem(STORAGE_KEYS.RECENT_SEARCHES, JSON.stringify(updated));
  } catch (error) {
    console.error("Error adding recent search:", error);
  }
}

export async function clearRecentSearches(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.RECENT_SEARCHES);
  } catch (error) {
    console.error("Error clearing recent searches:", error);
  }
}

export async function getApiKey(type: "omi" | "limitless"): Promise<string | null> {
  try {
    const key = type === "omi" ? STORAGE_KEYS.OMI_API_KEY : STORAGE_KEYS.LIMITLESS_API_KEY;
    return await AsyncStorage.getItem(key);
  } catch (error) {
    console.error("Error getting API key:", error);
    return null;
  }
}

export async function saveApiKey(type: "omi" | "limitless", apiKey: string): Promise<void> {
  try {
    const key = type === "omi" ? STORAGE_KEYS.OMI_API_KEY : STORAGE_KEYS.LIMITLESS_API_KEY;
    await AsyncStorage.setItem(key, apiKey);
  } catch (error) {
    console.error("Error saving API key:", error);
  }
}

export async function clearAllData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
  } catch (error) {
    console.error("Error clearing all data:", error);
  }
}

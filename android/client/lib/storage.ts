import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ChatMessage, Device } from "@/lib/zeke-types";

const STORAGE_KEYS = {
  DEVICES: "@zeke/devices",
  CHAT_MESSAGES: "@zeke/chat_messages",
  SETTINGS: "@zeke/settings",
  RECENT_SEARCHES: "@zeke/recent_searches",
  OMI_API_KEY: "@zeke/omi_api_key",
  LIMITLESS_API_KEY: "@zeke/limitless_api_key",
  PROFILE_PICTURE: "@zeke/profile_picture",
  PROFILE_PICTURE_REMINDER: "@zeke/profile_picture_reminder",
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
  dataRetentionDays: -1,
  notificationSettings: DEFAULT_NOTIFICATION_SETTINGS,
};

export function getDefaultNotificationSettings(): NotificationSettings {
  return { ...DEFAULT_NOTIFICATION_SETTINGS };
}

export async function getDevices(): Promise<Device[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.DEVICES);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error getting devices:", error);
    return [];
  }
}

export async function saveDevices(devices: Device[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.DEVICES, JSON.stringify(devices));
  } catch (error) {
    console.error("Error saving devices:", error);
  }
}

export async function getChatMessages(): Promise<ChatMessage[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.CHAT_MESSAGES);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error getting chat messages:", error);
    return [];
  }
}

export async function saveChatMessages(messages: ChatMessage[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.CHAT_MESSAGES,
      JSON.stringify(messages),
    );
  } catch (error) {
    console.error("Error saving chat messages:", error);
  }
}

export async function getSettings(): Promise<Settings> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
    return data
      ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) }
      : DEFAULT_SETTINGS;
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
      JSON.stringify({ ...current, ...settings }),
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
    await AsyncStorage.setItem(
      STORAGE_KEYS.RECENT_SEARCHES,
      JSON.stringify(updated),
    );
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

export async function getApiKey(
  type: "omi" | "limitless",
): Promise<string | null> {
  try {
    const key =
      type === "omi"
        ? STORAGE_KEYS.OMI_API_KEY
        : STORAGE_KEYS.LIMITLESS_API_KEY;
    return await AsyncStorage.getItem(key);
  } catch (error) {
    console.error("Error getting API key:", error);
    return null;
  }
}

export async function saveApiKey(
  type: "omi" | "limitless",
  apiKey: string,
): Promise<void> {
  try {
    const key =
      type === "omi"
        ? STORAGE_KEYS.OMI_API_KEY
        : STORAGE_KEYS.LIMITLESS_API_KEY;
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

export interface ProfilePictureData {
  uri: string;
  capturedAt: string;
  sentToZeke: boolean;
}

export interface ProfilePictureReminder {
  lastCapturedAt: string | null;
  nextReminderAt: string | null;
  reminderEnabled: boolean;
}

const DEFAULT_REMINDER: ProfilePictureReminder = {
  lastCapturedAt: null,
  nextReminderAt: null,
  reminderEnabled: true,
};

export async function getProfilePicture(): Promise<ProfilePictureData | null> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.PROFILE_PICTURE);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("Error getting profile picture:", error);
    return null;
  }
}

export async function saveProfilePicture(data: ProfilePictureData): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.PROFILE_PICTURE, JSON.stringify(data));
  } catch (error) {
    console.error("Error saving profile picture:", error);
  }
}

export async function getProfilePictureReminder(): Promise<ProfilePictureReminder> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.PROFILE_PICTURE_REMINDER);
    return data ? { ...DEFAULT_REMINDER, ...JSON.parse(data) } : DEFAULT_REMINDER;
  } catch (error) {
    console.error("Error getting profile picture reminder:", error);
    return DEFAULT_REMINDER;
  }
}

export async function saveProfilePictureReminder(reminder: Partial<ProfilePictureReminder>): Promise<void> {
  try {
    const current = await getProfilePictureReminder();
    await AsyncStorage.setItem(
      STORAGE_KEYS.PROFILE_PICTURE_REMINDER,
      JSON.stringify({ ...current, ...reminder })
    );
  } catch (error) {
    console.error("Error saving profile picture reminder:", error);
  }
}

export function calculateNextReminderDate(): Date {
  const minDays = 7;
  const maxDays = 14;
  const randomDays = Math.floor(Math.random() * (maxDays - minDays + 1)) + minDays;
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + randomDays);
  return nextDate;
}

export async function shouldShowProfilePictureReminder(): Promise<boolean> {
  try {
    const reminder = await getProfilePictureReminder();
    if (!reminder.reminderEnabled) return false;
    if (!reminder.nextReminderAt) return true;
    
    const now = new Date();
    const nextReminder = new Date(reminder.nextReminderAt);
    return now >= nextReminder;
  } catch (error) {
    console.error("Error checking profile picture reminder:", error);
    return false;
  }
}

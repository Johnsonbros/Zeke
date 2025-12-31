import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import type { Geofence, ZekeNotification } from "./zeke-api-adapter";
import { getGroceryItems, registerPushToken } from "./zeke-api-adapter";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") {
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === "granted";
}

export async function checkNotificationPermissions(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> {
  if (Platform.OS === "web") {
    return { granted: false, canAskAgain: false };
  }

  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  return {
    granted: status === "granted",
    canAskAgain: canAskAgain ?? true,
  };
}

export async function showGeofenceNotification(
  geofence: Geofence,
  event: "enter" | "exit",
): Promise<void> {
  const action = event === "enter" ? "entered" : "left";
  const title = `Location Alert`;
  const body = `You have ${action} ${geofence.name}`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: {
        type: "geofence",
        geofenceId: geofence.id,
        geofenceName: geofence.name,
        event,
      },
    },
    trigger: null,
  });
}

export async function showGroceryPromptNotification(
  geofence: Geofence,
): Promise<void> {
  let groceryItems: { id: string; name: string; isPurchased?: boolean }[] = [];
  let unpurchasedCount = 0;
  let itemPreview = "";

  try {
    groceryItems = await getGroceryItems();
    const unpurchasedItems = groceryItems.filter((item) => !item.isPurchased);
    unpurchasedCount = unpurchasedItems.length;

    if (unpurchasedCount > 0) {
      const previewItems = unpurchasedItems
        .slice(0, 3)
        .map((item) => item.name);
      itemPreview = previewItems.join(", ");
      if (unpurchasedCount > 3) {
        itemPreview += ` +${unpurchasedCount - 3} more`;
      }
    }
  } catch (error) {
    console.log("[Notifications] Could not fetch grocery items:", error);
  }

  const body =
    unpurchasedCount > 0
      ? `You're near ${geofence.name}. You have ${unpurchasedCount} item${unpurchasedCount > 1 ? "s" : ""} to get: ${itemPreview}`
      : `You're near ${geofence.name}. Your grocery list is empty!`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Grocery Reminder",
      body,
      data: {
        type: "grocery_prompt",
        geofenceId: geofence.id,
        geofenceName: geofence.name,
        screen: "Grocery",
        navigateTo: "TasksTab",
        unpurchasedCount,
      },
    },
    trigger: null,
  });
}

export async function showCustomGeofenceNotification(
  geofence: Geofence,
  event: "enter" | "exit",
): Promise<void> {
  const action = event === "enter" ? "arrived at" : "left";
  await Notifications.scheduleNotificationAsync({
    content: {
      title: geofence.name,
      body: `You ${action} this location`,
      data: {
        type: "custom",
        geofenceId: geofence.id,
        geofenceName: geofence.name,
        event,
        actionData: geofence.actionData,
      },
    },
    trigger: null,
  });
}

export async function showPlaceListNotification(
  listName: string,
  placeName: string,
  message?: string,
): Promise<void> {
  const body = message || `You're near ${placeName} from your ${listName} list`;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${listName} Nearby`,
      body,
      data: {
        type: "place_list",
        listName,
        placeName,
      },
    },
    trigger: null,
  });
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === "web") {
    console.log("[Notifications] Push not available on web");
    return null;
  }

  if (!Device.isDevice) {
    console.log("[Notifications] Push notifications require a physical device");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("[Notifications] Permission not granted for push notifications");
    return null;
  }

  try {
    const projectId = 
      process.env.EXPO_PUBLIC_PROJECT_ID || 
      Constants.expoConfig?.extra?.eas?.projectId ||
      "fd634d5b-ef00-4215-a63a-1c962f8f4015";
    
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const token = tokenData.data;
    console.log("[Notifications] Expo push token:", token);

    const registered = await registerPushToken(token);
    if (registered) {
      console.log("[Notifications] Token registered with ZEKE backend");
    } else {
      console.log("[Notifications] Failed to register token with ZEKE backend");
    }

    return token;
  } catch (error) {
    console.error("[Notifications] Error getting push token:", error);
    return null;
  }
}

export async function showZekeNotification(notification: ZekeNotification): Promise<void> {
  const iconMap: Record<string, string> = {
    info: "information",
    success: "checkmark-circle",
    warning: "alert-triangle",
    error: "alert-circle",
    reminder: "bell",
    news: "newspaper",
  };

  await Notifications.scheduleNotificationAsync({
    content: {
      title: notification.title,
      body: notification.message,
      data: {
        type: "zeke_notification",
        notificationId: notification.id,
        notificationType: notification.type,
        actionType: notification.actionType,
        actionData: notification.actionData,
      },
    },
    trigger: null,
  });
}

export async function showZekeAlert(
  title: string,
  message: string,
  type: "info" | "success" | "warning" | "error" | "reminder" | "news" = "info",
  actionData?: Record<string, unknown>,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body: message,
      data: {
        type: "zeke_alert",
        alertType: type,
        ...actionData,
      },
    },
    trigger: null,
  });
}

export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void,
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void,
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(callback);
}

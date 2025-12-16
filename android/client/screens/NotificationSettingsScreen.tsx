import React, { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, Alert, Platform, Linking, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";

import { ThemedText } from "@/components/ThemedText";
import { SettingsRow, SettingsSection } from "@/components/SettingsRow";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { 
  getSettings, 
  saveSettings, 
  NotificationSettings,
  getDefaultNotificationSettings 
} from "@/lib/storage";

export default function NotificationSettingsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();

  const [settings, setSettings] = useState<NotificationSettings>(getDefaultNotificationSettings());
  const [permissionStatus, setPermissionStatus] = useState<Notifications.PermissionStatus | null>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);

  const hasPermission = permissionStatus === "granted";
  const notificationsEnabled = settings.enabled && hasPermission;

  useEffect(() => {
    loadSettings();
    checkPermission();
  }, []);

  const loadSettings = async () => {
    const stored = await getSettings();
    if (stored.notificationSettings) {
      setSettings(stored.notificationSettings);
    }
  };

  const checkPermission = async () => {
    const { status, canAskAgain: canAsk } = await Notifications.getPermissionsAsync();
    setPermissionStatus(status);
    setCanAskAgain(canAsk);
  };

  const requestPermission = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status, canAskAgain: canAsk } = await Notifications.requestPermissionsAsync();
    setPermissionStatus(status);
    setCanAskAgain(canAsk);
    return status === "granted";
  };

  const openSettings = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS !== "web") {
      try {
        await Linking.openSettings();
      } catch (error) {
        Alert.alert(
          "Cannot Open Settings",
          "Please manually open your device settings to enable notifications.",
          [{ text: "OK" }]
        );
      }
    }
  };

  const updateSetting = async <K extends keyof NotificationSettings>(
    key: K, 
    value: NotificationSettings[K]
  ) => {
    if (!notificationsEnabled && key !== "enabled") {
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await saveSettings({ notificationSettings: updated });
  };

  const handleMasterToggle = async (enabled: boolean) => {
    if (enabled && !hasPermission) {
      const granted = await requestPermission();
      if (!granted) {
        return;
      }
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = { ...settings, enabled };
    setSettings(updated);
    await saveSettings({ notificationSettings: updated });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      showsVerticalScrollIndicator={false}
    >
      <SettingsSection title="MAIN">
        <View style={{ borderRadius: BorderRadius.md, overflow: "hidden" }}>
          <SettingsRow
            icon="bell"
            label="Enable Notifications"
            isToggle
            toggleValue={settings.enabled && hasPermission}
            onToggle={handleMasterToggle}
          />
        </View>
        {!hasPermission && permissionStatus !== null ? (
          <View style={styles.permissionContainer}>
            <ThemedText type="caption" secondary style={styles.permissionNote}>
              {canAskAgain 
                ? "Tap below to enable notification permissions"
                : "Notifications are disabled in your device settings"}
            </ThemedText>
            {canAskAgain ? (
              <Pressable
                onPress={requestPermission}
                style={({ pressed }) => [
                  styles.permissionButton,
                  { backgroundColor: Colors.dark.primary, opacity: pressed ? 0.8 : 1 }
                ]}
              >
                <ThemedText style={{ color: "#FFFFFF" }}>Enable Notifications</ThemedText>
              </Pressable>
            ) : Platform.OS !== "web" ? (
              <Pressable
                onPress={openSettings}
                style={({ pressed }) => [
                  styles.permissionButton,
                  { backgroundColor: theme.backgroundSecondary, opacity: pressed ? 0.8 : 1 }
                ]}
              >
                <ThemedText>Open Settings</ThemedText>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </SettingsSection>

      <SettingsSection title="PENDANT EVENTS">
        <View style={{ borderRadius: BorderRadius.md, overflow: "hidden" }}>
          <SettingsRow
            icon="bluetooth"
            label="Device Connected"
            isToggle
            toggleValue={settings.pendantConnected}
            onToggle={(v) => updateSetting("pendantConnected", v)}
            disabled={!notificationsEnabled}
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SettingsRow
            icon="wifi-off"
            label="Device Disconnected"
            isToggle
            toggleValue={settings.pendantDisconnected}
            onToggle={(v) => updateSetting("pendantDisconnected", v)}
            disabled={!notificationsEnabled}
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SettingsRow
            icon="battery"
            label="Low Battery Warning"
            isToggle
            toggleValue={settings.lowBattery}
            onToggle={(v) => updateSetting("lowBattery", v)}
            disabled={!notificationsEnabled}
          />
        </View>
      </SettingsSection>

      <SettingsSection title="SYNC & MEMORIES">
        <View style={{ borderRadius: BorderRadius.md, overflow: "hidden" }}>
          <SettingsRow
            icon="refresh-cw"
            label="Sync Complete"
            isToggle
            toggleValue={settings.syncComplete}
            onToggle={(v) => updateSetting("syncComplete", v)}
            disabled={!notificationsEnabled}
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SettingsRow
            icon="layers"
            label="New Memory Captured"
            isToggle
            toggleValue={settings.newMemory}
            onToggle={(v) => updateSetting("newMemory", v)}
            disabled={!notificationsEnabled}
          />
        </View>
      </SettingsSection>

      <SettingsSection title="AI ASSISTANT">
        <View style={{ borderRadius: BorderRadius.md, overflow: "hidden" }}>
          <SettingsRow
            icon="message-circle"
            label="ZEKE AI Responses"
            isToggle
            toggleValue={settings.aiResponses}
            onToggle={(v) => updateSetting("aiResponses", v)}
            disabled={!notificationsEnabled}
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SettingsRow
            icon="sun"
            label="Daily Summary"
            isToggle
            toggleValue={settings.dailySummary}
            onToggle={(v) => updateSetting("dailySummary", v)}
            disabled={!notificationsEnabled}
          />
        </View>
      </SettingsSection>

      <SettingsSection title="QUIET HOURS">
        <View style={{ borderRadius: BorderRadius.md, overflow: "hidden" }}>
          <SettingsRow
            icon="moon"
            label="Enable Quiet Hours"
            isToggle
            toggleValue={settings.quietHoursEnabled}
            onToggle={(v) => updateSetting("quietHoursEnabled", v)}
            disabled={!notificationsEnabled}
          />
          {settings.quietHoursEnabled && notificationsEnabled ? (
            <>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <SettingsRow
                icon="clock"
                label="Start Time"
                value={settings.quietHoursStart}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              />
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <SettingsRow
                icon="clock"
                label="End Time"
                value={settings.quietHoursEnd}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              />
            </>
          ) : null}
        </View>
        <ThemedText type="caption" secondary style={styles.quietNote}>
          Notifications will be silenced during quiet hours
        </ThemedText>
      </SettingsSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    marginLeft: Spacing.lg + 32 + Spacing.md,
  },
  permissionContainer: {
    marginTop: Spacing.sm,
    marginLeft: Spacing.lg,
  },
  permissionNote: {
    marginBottom: Spacing.sm,
  },
  permissionButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    alignSelf: "flex-start",
  },
  quietNote: {
    marginTop: Spacing.sm,
    marginLeft: Spacing.lg,
  },
});

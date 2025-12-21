import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Alert,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ThemedText } from "@/components/ThemedText";
import { SettingsRow, SettingsSection } from "@/components/SettingsRow";
import { DeviceCard, DeviceInfo } from "@/components/DeviceCard";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, Colors, BorderRadius, Gradients } from "@/constants/theme";
import { clearAllData } from "@/lib/storage";
import { getZekeDevices, ZekeDevice } from "@/lib/zeke-api-adapter";
import { SettingsStackParamList } from "@/navigation/SettingsStackNavigator";
import { useAuth } from "@/context/AuthContext";

interface CalendarConnectionStatus {
  connected: boolean;
  email?: string;
  authUrl?: string;
  error?: string;
}

function mapZekeDeviceToDeviceInfo(zekeDevice: ZekeDevice): DeviceInfo {
  const deviceType = zekeDevice.type === "limitless" ? "limitless" : "omi";

  let lastSync = "Never";
  if (zekeDevice.lastSyncAt) {
    const syncDate = new Date(zekeDevice.lastSyncAt);
    const now = new Date();
    const diffMs = now.getTime() - syncDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) {
      lastSync = "Just now";
    } else if (diffMins < 60) {
      lastSync = `${diffMins} min ago`;
    } else if (diffMins < 1440) {
      const hours = Math.floor(diffMins / 60);
      lastSync = `${hours} hour${hours > 1 ? "s" : ""} ago`;
    } else {
      const days = Math.floor(diffMins / 1440);
      lastSync = `${days} day${days > 1 ? "s" : ""} ago`;
    }
  }

  return {
    id: zekeDevice.id,
    name: zekeDevice.name,
    type: deviceType,
    isConnected: zekeDevice.isConnected,
    batteryLevel: zekeDevice.batteryLevel ?? 100,
    lastSync,
  };
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const { unpairDevice } = useAuth();

  const queryClient = useQueryClient();

  const { data: zekeDevices = [], isLoading: isLoadingDevices } = useQuery({
    queryKey: ["/api/devices"],
    queryFn: getZekeDevices,
    staleTime: 30000,
  });

  const { data: calendarConnection, isLoading: isLoadingCalendar } = useQuery<CalendarConnectionStatus>({
    queryKey: ["/api/calendar/connection"],
    staleTime: 30000,
  });

  const devices: DeviceInfo[] = zekeDevices.map(mapZekeDeviceToDeviceInfo);
  const [autoSync, setAutoSync] = useState(true);
  const [isConnectingCalendar, setIsConnectingCalendar] = useState(false);

  const handleDeviceConfigure = (device: DeviceInfo) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      `Configure ${device.name}`,
      "Device configuration options would appear here.",
      [{ text: "OK" }],
    );
  };

  const handleAddDevice = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("BluetoothConnection");
  };

  const handleClearData = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      "Clear All Data",
      "This will remove your chat history and device settings. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Data",
          style: "destructive",
          onPress: async () => {
            await clearAllData();
            Alert.alert("Done", "All data has been cleared.");
          },
        },
      ],
    );
  };

  const handleUnpairDevice = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      "Unpair Device",
      "This will disconnect this device from ZEKE. You will need to enter the pairing secret again to reconnect.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unpair",
          style: "destructive",
          onPress: async () => {
            await unpairDevice();
          },
        },
      ],
    );
  };

  const handleAbout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      "ZEKE AI Companion",
      "Version 1.0.0\n\nA companion dashboard for your AI wearables.\n\nBuilt with Expo.",
      [{ text: "OK" }],
    );
  };

  const handleConnectCalendar = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (calendarConnection?.connected) {
      Alert.alert(
        "Google Calendar Connected",
        calendarConnection.email 
          ? `Connected to ${calendarConnection.email}`
          : "Your Google Calendar is already connected.",
        [{ text: "OK" }],
      );
      return;
    }

    if (!calendarConnection?.authUrl) {
      Alert.alert(
        "Connection Not Available",
        "Google Calendar connection is not available in this environment. Please connect via the ZEKE web portal.",
        [{ text: "OK" }],
      );
      return;
    }

    setIsConnectingCalendar(true);
    try {
      const result = await WebBrowser.openAuthSessionAsync(
        calendarConnection.authUrl,
        'zeke-ai://'
      );
      
      if (result.type === 'success') {
        queryClient.invalidateQueries({ queryKey: ["/api/calendar/connection"] });
        Alert.alert("Success", "Google Calendar connected successfully!");
      }
    } catch (error) {
      console.error("Error connecting calendar:", error);
      Alert.alert("Error", "Failed to connect Google Calendar. Please try again.");
    } finally {
      setIsConnectingCalendar(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: tabBarHeight + Spacing.xl + 40,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.profileSection}>
        <LinearGradient
          colors={Gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatarContainer}
        >
          <Feather name="user" size={32} color="#FFFFFF" />
        </LinearGradient>
        <ThemedText type="h3" style={styles.displayName}>
          ZEKE User
        </ThemedText>
        <ThemedText type="small" secondary>
          {devices.filter((d) => d.isConnected).length} device
          {devices.filter((d) => d.isConnected).length !== 1 ? "s" : ""}{" "}
          connected
        </ThemedText>
      </View>

      <SettingsSection title="DEVICES">
        {isLoadingDevices ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={Colors.dark.primary} />
            <ThemedText
              type="small"
              secondary
              style={{ marginTop: Spacing.sm }}
            >
              Loading devices...
            </ThemedText>
          </View>
        ) : devices.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Feather name="smartphone" size={32} color={theme.textSecondary} />
            <ThemedText
              type="body"
              secondary
              style={{ marginTop: Spacing.md, textAlign: "center" }}
            >
              No devices connected
            </ThemedText>
            <ThemedText
              type="small"
              secondary
              style={{ marginTop: Spacing.xs, textAlign: "center" }}
            >
              Tap below to add a device
            </ThemedText>
          </View>
        ) : (
          devices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              onPress={() => handleDeviceConfigure(device)}
            />
          ))
        )}
        <Pressable
          onPress={handleAddDevice}
          style={({ pressed }) => [
            styles.addDeviceButton,
            {
              backgroundColor: theme.backgroundDefault,
              borderColor: theme.border,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Feather name="plus" size={20} color={Colors.dark.primary} />
          <ThemedText
            style={{ color: Colors.dark.primary, marginLeft: Spacing.sm }}
          >
            Add Device
          </ThemedText>
        </Pressable>
      </SettingsSection>

      <SettingsSection title="INTEGRATIONS">
        <View style={{ borderRadius: BorderRadius.md, overflow: "hidden" }}>
          <Pressable
            onPress={handleConnectCalendar}
            disabled={isLoadingCalendar || isConnectingCalendar}
            style={({ pressed }) => [
              styles.integrationRow,
              {
                backgroundColor: theme.backgroundDefault,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <View style={[styles.integrationIcon, { backgroundColor: `${Colors.dark.primary}15` }]}>
              <Feather name="calendar" size={20} color={Colors.dark.primary} />
            </View>
            <View style={styles.integrationContent}>
              <ThemedText type="body">Google Calendar</ThemedText>
              {isLoadingCalendar || isConnectingCalendar ? (
                <View style={styles.integrationStatusRow}>
                  <ActivityIndicator size="small" color={Colors.dark.primary} />
                  <ThemedText type="small" secondary style={{ marginLeft: Spacing.xs }}>
                    {isConnectingCalendar ? "Connecting..." : "Checking..."}
                  </ThemedText>
                </View>
              ) : calendarConnection?.connected ? (
                <View style={styles.integrationStatusRow}>
                  <View style={[styles.statusDot, { backgroundColor: Colors.dark.success }]} />
                  <ThemedText type="small" style={{ color: Colors.dark.success }}>
                    Connected{calendarConnection.email ? ` - ${calendarConnection.email}` : ""}
                  </ThemedText>
                </View>
              ) : (
                <View style={styles.integrationStatusRow}>
                  <View style={[styles.statusDot, { backgroundColor: theme.textSecondary }]} />
                  <ThemedText type="small" secondary>
                    Not connected
                  </ThemedText>
                </View>
              )}
            </View>
            <Feather 
              name={calendarConnection?.connected ? "check-circle" : "chevron-right"} 
              size={20} 
              color={calendarConnection?.connected ? Colors.dark.success : theme.textSecondary} 
            />
          </Pressable>
        </View>
      </SettingsSection>

      <SettingsSection title="PREFERENCES">
        <View style={{ borderRadius: BorderRadius.md, overflow: "hidden" }}>
          <SettingsRow
            icon="refresh-cw"
            label="Auto-sync"
            isToggle
            toggleValue={autoSync}
            onToggle={(value) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAutoSync(value);
            }}
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SettingsRow
            icon="bell"
            label="Notifications"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("NotificationSettings");
            }}
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SettingsRow
            icon="database"
            label="Data Retention"
            value="30 days"
            onPress={() =>
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            }
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SettingsRow
            icon="cpu"
            label="Device Features"
            value="Sensors, contacts & more"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("DeviceFeatures");
            }}
          />
        </View>
      </SettingsSection>

      <SettingsSection title="ABOUT">
        <View style={{ borderRadius: BorderRadius.md, overflow: "hidden" }}>
          <SettingsRow
            icon="info"
            label="About ZEKE AI"
            onPress={handleAbout}
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SettingsRow
            icon="file-text"
            label="Privacy Policy"
            onPress={() =>
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            }
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SettingsRow
            icon="help-circle"
            label="Help & Support"
            onPress={() =>
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            }
          />
        </View>
      </SettingsSection>

      <SettingsSection title="DANGER ZONE">
        <View style={{ borderRadius: BorderRadius.md, overflow: "hidden" }}>
          <SettingsRow
            icon="log-out"
            label="Unpair Device"
            isDestructive
            showChevron={false}
            onPress={handleUnpairDevice}
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SettingsRow
            icon="trash-2"
            label="Clear All Data"
            isDestructive
            showChevron={false}
            onPress={handleClearData}
          />
        </View>
      </SettingsSection>

      <ThemedText type="caption" secondary style={styles.version}>
        ZEKE AI Companion v1.0.0
      </ThemedText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  profileSection: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  displayName: {
    marginBottom: Spacing.xs,
  },
  addDeviceButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    marginTop: Spacing.sm,
  },
  divider: {
    height: 1,
    marginLeft: Spacing.lg + 32 + Spacing.md,
  },
  version: {
    textAlign: "center",
    marginTop: Spacing.lg,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["2xl"],
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["2xl"],
    paddingHorizontal: Spacing.lg,
  },
  integrationRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  integrationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  integrationContent: {
    flex: 1,
  },
  integrationStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.xs,
  },
});

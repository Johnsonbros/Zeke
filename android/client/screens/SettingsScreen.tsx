import React, { useState } from "react";
import { View, StyleSheet, Alert, Image, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { SettingsRow, SettingsSection } from "@/components/SettingsRow";
import { DeviceCard, DeviceInfo } from "@/components/DeviceCard";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, Colors, BorderRadius, Gradients } from "@/constants/theme";
import { mockDevices } from "@/lib/mockData";
import { clearAllData } from "@/lib/storage";
import { SettingsStackParamList } from "@/navigation/SettingsStackNavigator";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();

  const [devices] = useState<DeviceInfo[]>(mockDevices);
  const [autoSync, setAutoSync] = useState(true);
  const [notifications, setNotifications] = useState(true);

  const handleDeviceConfigure = (device: DeviceInfo) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      `Configure ${device.name}`,
      "Device configuration options would appear here.",
      [{ text: "OK" }]
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
      "This will remove all your memories, chat history, and device settings. This action cannot be undone.",
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
      ]
    );
  };

  const handleAbout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      "ZEKE AI Companion",
      "Version 1.0.0\n\nA companion dashboard for your AI wearables.\n\nBuilt with Expo.",
      [{ text: "OK" }]
    );
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
          {devices.filter((d) => d.isConnected).length} device{devices.filter((d) => d.isConnected).length !== 1 ? "s" : ""} connected
        </ThemedText>
      </View>

      <SettingsSection title="DEVICES">
        {devices.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            onPress={() => handleDeviceConfigure(device)}
          />
        ))}
        <Pressable
          onPress={handleAddDevice}
          style={({ pressed }) => [
            styles.addDeviceButton,
            { backgroundColor: theme.backgroundDefault, borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Feather name="plus" size={20} color={Colors.dark.primary} />
          <ThemedText style={{ color: Colors.dark.primary, marginLeft: Spacing.sm }}>
            Add Device
          </ThemedText>
        </Pressable>
        <View style={{ marginTop: Spacing.md }}>
          <SettingsRow
            icon="mic"
            label="Live Capture"
            value="Real-time transcription"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("LiveCapture");
            }}
          />
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
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SettingsRow
            icon="download"
            label="Export Data"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("DataExport");
            }}
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SettingsRow
            icon="bar-chart-2"
            label="Analytics"
            value="View your stats"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("Analytics");
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
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SettingsRow
            icon="help-circle"
            label="Help & Support"
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          />
        </View>
      </SettingsSection>

      <SettingsSection title="DANGER ZONE">
        <View style={{ borderRadius: BorderRadius.md, overflow: "hidden" }}>
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
});

import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, StyleSheet, ScrollView, Pressable, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors, Gradients } from "@/constants/theme";
import { bluetoothService, BLEDevice, ConnectionState } from "@/lib/bluetooth";

export default function BluetoothConnectionScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation();
  const { theme } = useTheme();

  const [isScanning, setIsScanning] = useState(false);
  const [nearbyDevices, setNearbyDevices] = useState<BLEDevice[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [connectingDeviceId, setConnectingDeviceId] = useState<string | null>(null);

  const scanPulse = useSharedValue(1);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isMockMode = bluetoothService.getIsMockMode();
  const bleStatus = bluetoothService.getBleStatus();

  useEffect(() => {
    const unsubscribeDiscovery = bluetoothService.onDeviceDiscovered((device) => {
      setNearbyDevices((prev) => {
        if (prev.find((d) => d.id === device.id)) return prev;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return [...prev, device];
      });
    });

    const unsubscribeConnection = bluetoothService.onConnectionStateChange((state, device) => {
      setConnectionState(state);
      if (state === "connected" && device) {
        setConnectingDeviceId(null);
      }
    });

    return () => {
      unsubscribeDiscovery();
      unsubscribeConnection();
      bluetoothService.stopScan();
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, []);

  const handleStartScan = useCallback(() => {
    if (isMockMode && Platform.OS !== "web") {
      Alert.alert(
        "Bluetooth Not Available",
        "Bluetooth Low Energy is not available in Expo Go. To use real device pairing, please build a development version of this app.\n\nFor now, you can see how the pairing flow works with simulated devices.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Try Simulation",
            onPress: () => startScanning(),
          },
        ]
      );
      return;
    }
    startScanning();
  }, [isMockMode]);

  const startScanning = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsScanning(true);
    setNearbyDevices([]);

    scanPulse.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 1000 }),
        withTiming(1, { duration: 1000 })
      ),
      -1,
      false
    );

    bluetoothService.startScan();

    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }
    scanIntervalRef.current = setInterval(() => {
      if (!bluetoothService.getIsScanning()) {
        setIsScanning(false);
        scanPulse.value = withTiming(1);
        if (scanIntervalRef.current) {
          clearInterval(scanIntervalRef.current);
          scanIntervalRef.current = null;
        }
      }
    }, 500);
  }, []);

  const handleStopScan = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    bluetoothService.stopScan();
    setIsScanning(false);
    scanPulse.value = withTiming(1);
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
  }, []);

  const handleConnectDevice = useCallback((device: BLEDevice) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      `Connect to ${device.name}?`,
      isMockMode
        ? "This is a simulated connection. In a production build with BLE support, the device would pair here."
        : "ZEKE will pair with this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Connect",
          onPress: async () => {
            setConnectingDeviceId(device.id);
            const success = await bluetoothService.connect(device.id);
            if (success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert(
                "Connected!",
                `Successfully connected to ${device.name}${isMockMode ? " (simulated)" : ""}.`,
                [
                  {
                    text: "OK",
                    onPress: () => navigation.goBack(),
                  },
                ]
              );
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert("Connection Failed", "Could not connect to the device. Please try again.");
              setConnectingDeviceId(null);
            }
          },
        },
      ]
    );
  }, [isMockMode, navigation]);

  const getSignalIcon = (strength: number): keyof typeof Feather.glyphMap => {
    if (strength > -50) return "wifi";
    if (strength > -70) return "wifi";
    return "wifi";
  };

  const getSignalColor = (strength: number): string => {
    if (strength > -50) return Colors.dark.success;
    if (strength > -70) return Colors.dark.warning;
    return Colors.dark.error;
  };

  const scanAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scanPulse.value }],
  }));

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
      <View style={[styles.warningCard, { backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.warningIconContainer}>
          <Feather 
            name={bleStatus.mode === "real" ? "check-circle" : "info"} 
            size={20} 
            color={bleStatus.mode === "real" ? Colors.dark.success : Colors.dark.warning} 
          />
        </View>
        <View style={styles.warningContent}>
          <ThemedText type="body" style={{ fontWeight: "600" }}>
            {bleStatus.mode === "real" ? "Bluetooth Ready" : "Simulation Mode"}
          </ThemedText>
          <ThemedText type="small" secondary style={{ marginTop: Spacing.xs }}>
            {bleStatus.reason}
          </ThemedText>
          <View style={styles.bleStatusBadge}>
            <View style={[
              styles.bleStatusDot, 
              { backgroundColor: bleStatus.mode === "real" ? Colors.dark.success : Colors.dark.warning }
            ]} />
            <ThemedText type="caption" secondary>
              {bleStatus.mode.toUpperCase()} BLE ({bleStatus.platform})
            </ThemedText>
          </View>
        </View>
      </View>

      <View style={styles.scanSection}>
        <Animated.View style={[styles.scanButtonWrapper, scanAnimatedStyle]}>
          {isScanning ? (
            <View style={[styles.scanPulseRing, { borderColor: Colors.dark.primary }]} />
          ) : null}
          <Pressable
            onPress={isScanning ? handleStopScan : handleStartScan}
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          >
            <LinearGradient
              colors={isScanning ? [Colors.dark.error, Colors.dark.error] : Gradients.primary}
              style={styles.scanButton}
            >
              <Feather
                name={isScanning ? "x" : "bluetooth"}
                size={32}
                color="#FFFFFF"
              />
            </LinearGradient>
          </Pressable>
        </Animated.View>
        <ThemedText type="h3" style={styles.scanTitle}>
          {isScanning ? "Scanning for Devices..." : "Pair Your Device"}
        </ThemedText>
        <ThemedText type="body" secondary style={styles.scanSubtitle}>
          {isScanning
            ? "Looking for nearby Omi and Limitless devices"
            : "Tap to scan for nearby Bluetooth devices"}
        </ThemedText>
      </View>

      {nearbyDevices.length > 0 ? (
        <View style={styles.devicesSection}>
          <ThemedText type="h4" style={styles.sectionTitle}>
            Nearby Devices ({nearbyDevices.length})
          </ThemedText>
          {nearbyDevices.map((device) => (
            <Pressable
              key={device.id}
              onPress={() => handleConnectDevice(device)}
              disabled={connectingDeviceId === device.id}
              style={({ pressed }) => ({ opacity: pressed || connectingDeviceId === device.id ? 0.6 : 1 })}
            >
              <Card elevation={1} style={styles.deviceCard}>
                <View style={styles.deviceRow}>
                  <View
                    style={[
                      styles.deviceIcon,
                      {
                        backgroundColor:
                          device.type === "omi" ? Colors.dark.primary : Colors.dark.secondary,
                      },
                    ]}
                  >
                    <Feather
                      name={device.type === "omi" ? "circle" : "square"}
                      size={20}
                      color="#FFFFFF"
                    />
                  </View>
                  <View style={styles.deviceInfo}>
                    <ThemedText type="body" style={{ fontWeight: "600" }}>
                      {device.name}
                    </ThemedText>
                    <View style={styles.deviceMeta}>
                      <Feather
                        name={getSignalIcon(device.signalStrength)}
                        size={12}
                        color={getSignalColor(device.signalStrength)}
                      />
                      <ThemedText type="caption" secondary style={{ marginLeft: 4 }}>
                        {device.signalStrength} dBm
                      </ThemedText>
                      {device.batteryLevel !== undefined ? (
                        <>
                          <Feather
                            name="battery"
                            size={12}
                            color={theme.textSecondary}
                            style={{ marginLeft: Spacing.sm }}
                          />
                          <ThemedText type="caption" secondary style={{ marginLeft: 4 }}>
                            {device.batteryLevel}%
                          </ThemedText>
                        </>
                      ) : null}
                    </View>
                  </View>
                  {connectingDeviceId === device.id ? (
                    <ThemedText type="caption" style={{ color: Colors.dark.primary }}>
                      Connecting...
                    </ThemedText>
                  ) : (
                    <Feather name="chevron-right" size={20} color={theme.textSecondary} />
                  )}
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      ) : null}

      {!isScanning && nearbyDevices.length === 0 ? (
        <View style={styles.instructionsSection}>
          <ThemedText type="h4" style={styles.sectionTitle}>
            Quick Start
          </ThemedText>
          <View style={styles.instructionsList}>
            <View style={styles.instructionItem}>
              <View style={[styles.instructionNumber, { backgroundColor: theme.backgroundSecondary }]}>
                <ThemedText type="small">1</ThemedText>
              </View>
              <ThemedText type="body" style={styles.instructionText}>
                Make sure your device is charged and shows a solid blue light
              </ThemedText>
            </View>
            <View style={styles.instructionItem}>
              <View style={[styles.instructionNumber, { backgroundColor: theme.backgroundSecondary }]}>
                <ThemedText type="small">2</ThemedText>
              </View>
              <ThemedText type="body" style={styles.instructionText}>
                Forget any previous pairing from your phone's Bluetooth settings
              </ThemedText>
            </View>
            <View style={styles.instructionItem}>
              <View style={[styles.instructionNumber, { backgroundColor: theme.backgroundSecondary }]}>
                <ThemedText type="small">3</ThemedText>
              </View>
              <ThemedText type="body" style={styles.instructionText}>
                Tap the scan button above to search for your device
              </ThemedText>
            </View>
          </View>

          <Pressable
            onPress={() => navigation.navigate("LimitlessSetup" as never)}
            style={({ pressed }) => [
              styles.setupGuideButton,
              { backgroundColor: theme.backgroundSecondary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <View style={styles.setupGuideContent}>
              <View style={[styles.setupGuideIcon, { backgroundColor: Colors.dark.secondary }]}>
                <Feather name="disc" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.setupGuideText}>
                <ThemedText type="body" style={{ fontWeight: "600" }}>
                  Limitless Pendant Setup
                </ThemedText>
                <ThemedText type="small" secondary>
                  Factory reset instructions and troubleshooting
                </ThemedText>
              </View>
              <Feather name="chevron-right" size={20} color={theme.textSecondary} />
            </View>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  warningCard: {
    flexDirection: "row",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  warningIconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  warningContent: {
    flex: 1,
  },
  bleStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  bleStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  scanSection: {
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
    marginBottom: Spacing.xl,
  },
  scanButtonWrapper: {
    position: "relative",
    marginBottom: Spacing.lg,
  },
  scanPulseRing: {
    position: "absolute",
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    borderRadius: 60,
    borderWidth: 2,
    opacity: 0.5,
  },
  scanButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  scanTitle: {
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  scanSubtitle: {
    textAlign: "center",
    paddingHorizontal: Spacing.xl,
  },
  devicesSection: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  deviceCard: {
    marginBottom: Spacing.sm,
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  deviceIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  instructionsSection: {
    marginBottom: Spacing.xl,
  },
  instructionsList: {
    gap: Spacing.lg,
  },
  instructionItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  instructionNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  instructionText: {
    flex: 1,
    paddingTop: 2,
  },
  setupGuideButton: {
    marginTop: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  setupGuideContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  setupGuideIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  setupGuideText: {
    flex: 1,
  },
});

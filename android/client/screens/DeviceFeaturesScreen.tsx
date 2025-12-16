import React, { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, Pressable, Platform, Linking, Dimensions, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import { Accelerometer, Gyroscope, Pedometer, Barometer } from "expo-sensors";
import * as Battery from "expo-battery";
import * as Device from "expo-device";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import * as LocalAuthentication from "expo-local-authentication";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { SettingsRow, SettingsSection } from "@/components/SettingsRow";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, Colors, BorderRadius } from "@/constants/theme";

interface SensorData {
  x: number;
  y: number;
  z: number;
}

interface NetworkState {
  type: string;
  isConnected: boolean;
  isInternetReachable: boolean | null;
}

export default function DeviceFeaturesScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const isWeb = Platform.OS === "web";

  const [contactsCount, setContactsCount] = useState<number | null>(null);
  const [contactsPermission, setContactsPermission] = useState<boolean>(false);

  const [accelerometerData, setAccelerometerData] = useState<SensorData>({ x: 0, y: 0, z: 0 });
  const [gyroscopeData, setGyroscopeData] = useState<SensorData>({ x: 0, y: 0, z: 0 });
  const [barometerPressure, setBarometerPressure] = useState<number | null>(null);
  const [stepCount, setStepCount] = useState<number>(0);
  const [sensorsEnabled, setSensorsEnabled] = useState<boolean>(false);

  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [batteryState, setBatteryState] = useState<string>("Unknown");
  const [isLowPowerMode, setIsLowPowerMode] = useState<boolean>(false);

  const [deviceInfo, setDeviceInfo] = useState({
    name: "",
    model: "",
    osVersion: "",
    brand: "",
    screenWidth: 0,
    screenHeight: 0,
  });

  const [networkState, setNetworkState] = useState<NetworkState>({
    type: "Unknown",
    isConnected: false,
    isInternetReachable: null,
  });

  const [biometricEnabled, setBiometricEnabled] = useState<boolean>(false);
  const [biometricAvailable, setBiometricAvailable] = useState<boolean>(false);
  const [biometricType, setBiometricType] = useState<string>("None");

  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  useEffect(() => {
    if (!isWeb) {
      loadDeviceInfo();
      loadBatteryInfo();
      checkBiometricAvailability();
    }

    const unsubscribeNetwork = NetInfo.addEventListener((state: NetInfoState) => {
      setNetworkState({
        type: state.type,
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable,
      });
    });

    return () => {
      unsubscribeNetwork();
    };
  }, []);

  const loadDeviceInfo = async () => {
    const { width, height } = Dimensions.get("window");
    setDeviceInfo({
      name: Device.deviceName ?? "Unknown",
      model: Device.modelName ?? "Unknown",
      osVersion: Device.osVersion ?? "Unknown",
      brand: Device.brand ?? "Unknown",
      screenWidth: Math.round(width),
      screenHeight: Math.round(height),
    });
  };

  const loadBatteryInfo = async () => {
    try {
      const level = await Battery.getBatteryLevelAsync();
      const state = await Battery.getBatteryStateAsync();
      const lowPower = await Battery.isLowPowerModeEnabledAsync();

      setBatteryLevel(Math.round(level * 100));
      setIsLowPowerMode(lowPower);

      switch (state) {
        case Battery.BatteryState.CHARGING:
          setBatteryState("Charging");
          break;
        case Battery.BatteryState.FULL:
          setBatteryState("Full");
          break;
        case Battery.BatteryState.UNPLUGGED:
          setBatteryState("Unplugged");
          break;
        default:
          setBatteryState("Unknown");
      }
    } catch {
      console.log("Battery info not available");
    }
  };

  const checkBiometricAvailability = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

      setBiometricAvailable(hasHardware && isEnrolled);

      if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricType("Face ID");
      } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricType("Fingerprint");
      } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) {
        setBiometricType("Iris");
      } else {
        setBiometricType("None");
      }
    } catch {
      setBiometricAvailable(false);
    }
  };

  const requestContactsPermission = async () => {
    if (isWeb) {
      Alert.alert("Not Available", "Run in Expo Go to use this feature");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await Contacts.requestPermissionsAsync();

    if (status === "granted") {
      setContactsPermission(true);
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name],
      });
      setContactsCount(data.length);
    } else {
      Alert.alert(
        "Permission Denied",
        "Contacts permission is required to access your contacts.",
        Platform.OS !== "web"
          ? [
              { text: "Cancel", style: "cancel" },
              {
                text: "Open Settings",
                onPress: async () => {
                  try {
                    await Linking.openSettings();
                  } catch {
                    console.log("Could not open settings");
                  }
                },
              },
            ]
          : [{ text: "OK" }]
      );
    }
  };

  const toggleSensors = async () => {
    if (isWeb) {
      Alert.alert("Not Available", "Run in Expo Go to use this feature");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (sensorsEnabled) {
      Accelerometer.removeAllListeners();
      Gyroscope.removeAllListeners();
      Barometer.removeAllListeners();
      setSensorsEnabled(false);
    } else {
      setSensorsEnabled(true);

      Accelerometer.setUpdateInterval(500);
      Gyroscope.setUpdateInterval(500);
      Barometer.setUpdateInterval(1000);

      Accelerometer.addListener((data) => {
        setAccelerometerData(data);
      });

      Gyroscope.addListener((data) => {
        setGyroscopeData(data);
      });

      Barometer.addListener(({ pressure }) => {
        setBarometerPressure(pressure);
      });

      const isAvailable = await Pedometer.isAvailableAsync();
      if (isAvailable) {
        const end = new Date();
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const result = await Pedometer.getStepCountAsync(start, end);
        setStepCount(result.steps);
      }
    }
  };

  const toggleBiometric = async (value: boolean) => {
    if (isWeb) {
      Alert.alert("Not Available", "Run in Expo Go to use this feature");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (value) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Authenticate to enable biometric login",
        fallbackLabel: "Use passcode",
      });

      if (result.success) {
        setBiometricEnabled(true);
        Alert.alert("Success", "Biometric authentication enabled");
      }
    } else {
      setBiometricEnabled(false);
    }
  };

  const pickDocument = async () => {
    if (isWeb) {
      Alert.alert("Not Available", "Run in Expo Go to use this feature");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "application/msword", "text/plain"],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setSelectedDocument(asset.name);
        Alert.alert("Document Selected", `Selected: ${asset.name}`);
      }
    } catch {
      Alert.alert("Error", "Failed to pick document");
    }
  };

  const shareContent = async () => {
    if (isWeb) {
      Alert.alert("Not Available", "Run in Expo Go to use this feature");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert("Not Available", "Sharing is not available on this device");
      return;
    }

    Alert.alert(
      "Share ZEKE AI",
      "Sharing feature ready! In a real implementation, this would share app content or exported data."
    );
  };

  const testTextToSpeech = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (isSpeaking) {
      Speech.stop();
      setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);
    Speech.speak(
      "Hello! I am ZEKE, your AI assistant. I can help you manage your memories, tasks, and daily activities.",
      {
        language: "en-US",
        pitch: 1.0,
        rate: 0.9,
        onDone: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      }
    );
  };

  const renderWebFallback = (featureName: string) => (
    <View style={[styles.webFallback, { backgroundColor: theme.backgroundSecondary }]}>
      <Feather name="smartphone" size={24} color={theme.textSecondary} />
      <ThemedText type="small" secondary style={styles.webFallbackText}>
        {featureName} requires a native device. Run in Expo Go to use this feature.
      </ThemedText>
    </View>
  );

  const formatSensorValue = (value: number) => value.toFixed(3);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: insets.bottom + Spacing.xl + 40,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      showsVerticalScrollIndicator={false}
    >
      <SettingsSection title="CONTACTS ACCESS">
        {isWeb ? (
          renderWebFallback("Contacts")
        ) : (
          <View style={{ borderRadius: BorderRadius.md, overflow: "hidden" }}>
            <SettingsRow
              icon="users"
              label={contactsPermission ? "Contacts Accessible" : "Request Contacts Permission"}
              value={contactsCount !== null ? `${contactsCount} contacts` : undefined}
              onPress={requestContactsPermission}
              showChevron={!contactsPermission}
            />
          </View>
        )}
      </SettingsSection>

      <SettingsSection title="SENSORS DASHBOARD">
        {isWeb ? (
          renderWebFallback("Sensors")
        ) : (
          <View style={{ borderRadius: BorderRadius.md, overflow: "hidden" }}>
            <SettingsRow
              icon="activity"
              label="Motion Sensors"
              isToggle
              toggleValue={sensorsEnabled}
              onToggle={toggleSensors}
            />
            {sensorsEnabled ? (
              <View style={[styles.sensorData, { backgroundColor: theme.backgroundDefault }]}>
                <View style={styles.sensorRow}>
                  <ThemedText type="caption" secondary>Accelerometer:</ThemedText>
                  <ThemedText type="small">
                    X: {formatSensorValue(accelerometerData.x)} | Y: {formatSensorValue(accelerometerData.y)} | Z: {formatSensorValue(accelerometerData.z)}
                  </ThemedText>
                </View>
                <View style={styles.sensorRow}>
                  <ThemedText type="caption" secondary>Gyroscope:</ThemedText>
                  <ThemedText type="small">
                    X: {formatSensorValue(gyroscopeData.x)} | Y: {formatSensorValue(gyroscopeData.y)} | Z: {formatSensorValue(gyroscopeData.z)}
                  </ThemedText>
                </View>
                <View style={styles.sensorRow}>
                  <ThemedText type="caption" secondary>Barometer:</ThemedText>
                  <ThemedText type="small">
                    {barometerPressure !== null ? `${barometerPressure.toFixed(2)} hPa` : "Not available"}
                  </ThemedText>
                </View>
                <View style={styles.sensorRow}>
                  <ThemedText type="caption" secondary>Steps Today:</ThemedText>
                  <ThemedText type="small">{stepCount}</ThemedText>
                </View>
              </View>
            ) : null}
          </View>
        )}
      </SettingsSection>

      <SettingsSection title="BATTERY MONITOR">
        {isWeb ? (
          renderWebFallback("Battery")
        ) : (
          <View style={{ borderRadius: BorderRadius.md, overflow: "hidden" }}>
            <SettingsRow
              icon="battery"
              label="Battery Level"
              value={batteryLevel !== null ? `${batteryLevel}%` : "Loading..."}
              showChevron={false}
            />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <SettingsRow
              icon="zap"
              label="Charging State"
              value={batteryState}
              showChevron={false}
            />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <SettingsRow
              icon="power"
              label="Low Power Mode"
              value={isLowPowerMode ? "Enabled" : "Disabled"}
              showChevron={false}
            />
          </View>
        )}
      </SettingsSection>

      <SettingsSection title="DEVICE INFO">
        {isWeb ? (
          renderWebFallback("Device Info")
        ) : (
          <View style={{ borderRadius: BorderRadius.md, overflow: "hidden" }}>
            <SettingsRow
              icon="smartphone"
              label="Device Name"
              value={deviceInfo.name}
              showChevron={false}
            />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <SettingsRow
              icon="cpu"
              label="Model"
              value={`${deviceInfo.brand} ${deviceInfo.model}`}
              showChevron={false}
            />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <SettingsRow
              icon="settings"
              label="OS Version"
              value={`${Platform.OS === "ios" ? "iOS" : "Android"} ${deviceInfo.osVersion}`}
              showChevron={false}
            />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <SettingsRow
              icon="maximize"
              label="Screen Size"
              value={`${deviceInfo.screenWidth} x ${deviceInfo.screenHeight}`}
              showChevron={false}
            />
          </View>
        )}
      </SettingsSection>

      <SettingsSection title="NETWORK STATUS">
        <View style={{ borderRadius: BorderRadius.md, overflow: "hidden" }}>
          <SettingsRow
            icon="wifi"
            label="Connection Type"
            value={networkState.type}
            showChevron={false}
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SettingsRow
            icon="globe"
            label="Connected"
            value={networkState.isConnected ? "Yes" : "No"}
            showChevron={false}
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SettingsRow
            icon="cloud"
            label="Internet Reachable"
            value={networkState.isInternetReachable === null ? "Unknown" : networkState.isInternetReachable ? "Yes" : "No"}
            showChevron={false}
          />
        </View>
      </SettingsSection>

      <SettingsSection title="BIOMETRIC AUTH">
        {isWeb ? (
          renderWebFallback("Biometric Authentication")
        ) : (
          <View style={{ borderRadius: BorderRadius.md, overflow: "hidden" }}>
            <SettingsRow
              icon="lock"
              label={`Enable ${biometricType}`}
              isToggle
              toggleValue={biometricEnabled}
              onToggle={toggleBiometric}
              disabled={!biometricAvailable}
            />
            {!biometricAvailable ? (
              <View style={[styles.infoBox, { backgroundColor: theme.backgroundSecondary }]}>
                <ThemedText type="small" secondary>
                  Biometric authentication is not available or not enrolled on this device.
                </ThemedText>
              </View>
            ) : null}
          </View>
        )}
      </SettingsSection>

      <SettingsSection title="DOCUMENT PICKER">
        {isWeb ? (
          renderWebFallback("Document Picker")
        ) : (
          <View style={{ borderRadius: BorderRadius.md, overflow: "hidden" }}>
            <SettingsRow
              icon="file-text"
              label="Pick Document"
              value={selectedDocument ?? "None selected"}
              onPress={pickDocument}
            />
          </View>
        )}
      </SettingsSection>

      <SettingsSection title="SHARE FUNCTION">
        {isWeb ? (
          renderWebFallback("Native Sharing")
        ) : (
          <View style={{ borderRadius: BorderRadius.md, overflow: "hidden" }}>
            <SettingsRow
              icon="share-2"
              label="Share App Content"
              value="Use native share"
              onPress={shareContent}
            />
          </View>
        )}
      </SettingsSection>

      <SettingsSection title="TEXT-TO-SPEECH">
        <View style={{ borderRadius: BorderRadius.md, overflow: "hidden" }}>
          <SettingsRow
            icon="volume-2"
            label={isSpeaking ? "Stop Speaking" : "Test ZEKE Voice"}
            value={isSpeaking ? "Speaking..." : "Tap to hear ZEKE"}
            onPress={testTextToSpeech}
          />
        </View>
      </SettingsSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  webFallback: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  webFallbackText: {
    flex: 1,
  },
  sensorData: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  sensorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  divider: {
    height: 1,
    marginLeft: Spacing.lg + 32 + Spacing.md,
  },
  infoBox: {
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
});

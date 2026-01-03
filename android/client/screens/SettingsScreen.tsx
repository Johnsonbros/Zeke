import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  Alert,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";

import { ThemedText } from "@/components/ThemedText";
import { SettingsRow, SettingsSection } from "@/components/SettingsRow";
import { DeviceCard, DeviceInfo } from "@/components/DeviceCard";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, Colors, BorderRadius, Gradients } from "@/constants/theme";
import { 
  clearAllData,
  getProfilePicture,
  saveProfilePicture,
  saveProfilePictureReminder,
  shouldShowProfilePictureReminder,
  calculateNextReminderDate,
  ProfilePictureData,
  getSettings,
} from "@/lib/storage";
import { getRetentionLabel } from "@/screens/DataRetentionScreen";
import { getZekeDevices, ZekeDevice } from "@/lib/zeke-api-adapter";
import { bluetoothService, type ConnectionState, type BLEDevice } from "@/lib/bluetooth";
import { SettingsStackParamList } from "@/navigation/SettingsStackNavigator";
import { useAuth } from "@/context/AuthContext";
import { checkCalendarConnection, type CalendarConnectionStatus } from "@/lib/zeke-api-adapter";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import * as Linking from "expo-linking";
import { useContactSync } from "@/hooks/useContactSync";

function formatSyncTime(isoString: string): string {
  const syncDate = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - syncDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) {
    return "Just now";
  } else if (diffMins < 60) {
    return `${diffMins} min ago`;
  } else if (diffMins < 1440) {
    const hours = Math.floor(diffMins / 60);
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  } else {
    const days = Math.floor(diffMins / 1440);
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }
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
  const scrollViewRef = useRef<ScrollView>(null);

  // Reset scroll position when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    }, [])
  );

  const queryClient = useQueryClient();

  const { data: zekeDevices = [], isLoading: isLoadingDevices } = useQuery({
    queryKey: ["/api/devices"],
    queryFn: getZekeDevices,
    staleTime: 30000,
  });

  const { data: calendarConnection, isLoading: isLoadingCalendar, refetch: refetchCalendarConnection } = useQuery<CalendarConnectionStatus>({
    queryKey: ["/api/calendar/connection"],
    queryFn: checkCalendarConnection,
    staleTime: 30000,
  });

  const [autoSync, setAutoSync] = useState(true);
  const [isConnectingCalendar, setIsConnectingCalendar] = useState(false);
  const [profilePicture, setProfilePicture] = useState<ProfilePictureData | null>(null);
  const [showReminderBadge, setShowReminderBadge] = useState(false);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const [dataRetentionDays, setDataRetentionDays] = useState<number>(-1);

  const [bleConnectionState, setBleConnectionState] = useState<ConnectionState>(
    bluetoothService.getConnectionState()
  );
  const [bleConnectedDevice, setBleConnectedDevice] = useState<BLEDevice | null>(null);
  const contactSync = useContactSync();

  // Compute devices after state declarations to avoid reference error
  const devices: DeviceInfo[] = zekeDevices.map((zekeDevice) => {
    const baseDevice = mapZekeDeviceToDeviceInfo(zekeDevice);
    
    const isBleConnected = bleConnectionState === "connected" && bleConnectedDevice !== null;
    const bleDeviceTypeMatches = bleConnectedDevice?.type === baseDevice.type;
    
    const realIsConnected = isBleConnected && bleDeviceTypeMatches;
    
    return {
      ...baseDevice,
      isConnected: realIsConnected,
      batteryLevel: realIsConnected && bleConnectedDevice?.batteryLevel !== undefined 
        ? bleConnectedDevice.batteryLevel 
        : baseDevice.batteryLevel,
      lastSync: realIsConnected ? "Now" : baseDevice.lastSync,
    };
  });

  useEffect(() => {
    const unsubscribe = bluetoothService.onConnectionStateChange(
      (state, device) => {
        setBleConnectionState(state);
        setBleConnectedDevice(device);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    loadProfilePicture();
    checkReminder();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDataRetention();
    }, [])
  );

  const loadDataRetention = async () => {
    const stored = await getSettings();
    setDataRetentionDays(stored.dataRetentionDays);
  };

  const loadProfilePicture = async () => {
    const saved = await getProfilePicture();
    if (saved) {
      setProfilePicture(saved);
    }
  };

  const checkReminder = async () => {
    const shouldRemind = await shouldShowProfilePictureReminder();
    setShowReminderBadge(shouldRemind);
  };

  const sendProfileToZekeMutation = useMutation({
    mutationFn: async (imageUri: string) => {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const reader = new FileReader();
      
      return new Promise<void>((resolve, reject) => {
        reader.onloadend = async () => {
          try {
            const base64data = reader.result as string;
            const baseUrl = getApiUrl();
            const url = new URL("/api/uploads", baseUrl);
            
            const uploadRes = await fetch(url.toString(), {
              method: "POST",
              headers: {
                ...getAuthHeaders(),
                "Content-Type": "application/json",
              },
              credentials: "include",
              body: JSON.stringify({
                originalName: `profile-selfie-${new Date().toISOString().split('T')[0]}.jpg`,
                mimeType: "image/jpeg",
                fileType: "image",
                fileSize: blob.size,
                fileData: base64data.split(',')[1],
                tags: [
                  "profile-picture",
                  "aging-documentation", 
                  "selfie",
                  "master-user-enrollment",
                  "facial-recognition-primary"
                ],
                metadata: {
                  isPrimary: true,
                  userType: "master-user",
                  enrollFace: true,
                  capturedAt: new Date().toISOString(),
                },
              }),
            });
            
            if (!uploadRes.ok) throw new Error("Upload failed");
            const uploadData = await uploadRes.json();
            
            const sendUrl = new URL(`/api/uploads/${uploadData.id}/send-to-zeke`, baseUrl);
            const sendRes = await fetch(sendUrl.toString(), {
              method: "POST",
              credentials: "include",
              headers: getAuthHeaders(),
            });
            
            if (!sendRes.ok) {
              console.warn("Failed to send to ZEKE, will retry later");
            }
            
            resolve();
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = () => reject(new Error("Failed to read image"));
        reader.readAsDataURL(blob);
      });
    },
    onSuccess: async () => {
      if (profilePicture) {
        await saveProfilePicture({ ...profilePicture, sentToZeke: true });
        setProfilePicture(prev => prev ? { ...prev, sentToZeke: true } : null);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/uploads"] });
    },
  });

  const handleTakeProfilePicture = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (Platform.OS === "web") {
      Alert.alert(
        "Camera Not Available",
        "Please use Expo Go on your phone to take a selfie for your profile picture."
      );
      return;
    }
    
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Camera Permission Required",
        "Please enable camera access in your device settings to take a profile picture.",
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Open Settings", 
            onPress: async () => {
              try {
                await Linking.openSettings();
              } catch (error) {
                console.error("Could not open settings:", error);
              }
            }
          },
        ]
      );
      return;
    }
    
    setIsTakingPhoto(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets[0]) {
        const capturedAt = new Date().toISOString();
        const newPicture: ProfilePictureData = {
          uri: result.assets[0].uri,
          capturedAt,
          sentToZeke: false,
        };
        
        await saveProfilePicture(newPicture);
        setProfilePicture(newPicture);
        
        const nextReminder = calculateNextReminderDate();
        await saveProfilePictureReminder({
          lastCapturedAt: capturedAt,
          nextReminderAt: nextReminder.toISOString(),
        });
        setShowReminderBadge(false);
        
        sendProfileToZekeMutation.mutate(result.assets[0].uri);
        
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          "Profile Updated",
          "Your selfie has been saved and will be sent to ZEKE for your aging documentation project."
        );
      }
    } catch (error) {
      console.error("Error taking photo:", error);
      Alert.alert("Error", "Failed to take photo. Please try again.");
    } finally {
      setIsTakingPhoto(false);
    }
  };

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
      ref={scrollViewRef}
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: Platform.OS === "android" ? Spacing.md : headerHeight + Spacing.md,
        paddingBottom: tabBarHeight + Spacing.lg + 20,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.profileSection}>
        <Pressable 
          onPress={handleTakeProfilePicture}
          disabled={isTakingPhoto}
          style={({ pressed }) => [
            styles.avatarPressable,
            { opacity: pressed ? 0.8 : 1 }
          ]}
        >
          {profilePicture ? (
            <View style={styles.avatarImageWrapper}>
              <Image
                source={{ uri: profilePicture.uri }}
                style={styles.avatarImage}
                contentFit="cover"
              />
              <View style={styles.cameraIconOverlay}>
                <Feather name="camera" size={14} color="#FFFFFF" />
              </View>
            </View>
          ) : (
            <LinearGradient
              colors={Gradients.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarContainer}
            >
              {isTakingPhoto ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Feather name="camera" size={32} color="#FFFFFF" />
              )}
            </LinearGradient>
          )}
          {showReminderBadge ? (
            <View style={styles.reminderBadge}>
              <Feather name="clock" size={10} color="#FFFFFF" />
            </View>
          ) : null}
        </Pressable>
        <ThemedText type="h3" style={styles.displayName}>
          Your Profile
        </ThemedText>
        <ThemedText type="small" secondary>
          {profilePicture 
            ? "Tap photo to update your selfie" 
            : "Tap to take a selfie"}
        </ThemedText>
        <ThemedText type="small" secondary style={{ marginTop: Spacing.xs }}>
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
              ) : calendarConnection?.error ? (
                <View style={styles.integrationStatusRow}>
                  <View style={[styles.statusDot, { backgroundColor: Colors.dark.error }]} />
                  <ThemedText type="small" style={{ color: Colors.dark.error }}>
                    Error - tap to retry
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

      <SettingsSection title="CONTACTS">
        <View style={{ borderRadius: BorderRadius.md, overflow: "hidden" }}>
          <Pressable
            onPress={async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const result = await contactSync.syncNow();
              if (result.success) {
                Alert.alert("Sync Complete", `Synced ${result.count} contacts successfully.`);
              } else {
                Alert.alert("Sync Failed", result.error || "Failed to sync contacts.");
              }
            }}
            disabled={contactSync.isSyncing}
            style={({ pressed }) => [
              styles.integrationRow,
              {
                backgroundColor: theme.backgroundDefault,
                opacity: pressed || contactSync.isSyncing ? 0.6 : 1,
              },
            ]}
          >
            <View style={[styles.integrationIcon, { backgroundColor: `${Colors.dark.primary}15` }]}>
              <Feather name="users" size={20} color={Colors.dark.primary} />
            </View>
            <View style={styles.integrationContent}>
              <ThemedText type="body">Contact Sync</ThemedText>
              {contactSync.isSyncing ? (
                <View style={styles.integrationStatusRow}>
                  <ActivityIndicator size="small" color={Colors.dark.primary} />
                  <ThemedText type="small" secondary style={{ marginLeft: Spacing.xs }}>
                    Syncing...
                  </ThemedText>
                </View>
              ) : contactSync.syncError ? (
                <View style={styles.integrationStatusRow}>
                  <View style={[styles.statusDot, { backgroundColor: Colors.dark.error }]} />
                  <ThemedText type="small" style={{ color: Colors.dark.error }}>
                    {contactSync.syncError}
                  </ThemedText>
                </View>
              ) : contactSync.lastSyncTime ? (
                <View style={styles.integrationStatusRow}>
                  <View style={[styles.statusDot, { backgroundColor: Colors.dark.success }]} />
                  <ThemedText type="small" style={{ color: Colors.dark.success }}>
                    {contactSync.lastSyncCount} contacts - {formatSyncTime(contactSync.lastSyncTime)}
                  </ThemedText>
                </View>
              ) : (
                <View style={styles.integrationStatusRow}>
                  <View style={[styles.statusDot, { backgroundColor: theme.textSecondary }]} />
                  <ThemedText type="small" secondary>
                    Never synced
                  </ThemedText>
                </View>
              )}
            </View>
            <Feather 
              name={contactSync.isSyncing ? "loader" : "refresh-cw"} 
              size={20} 
              color={Colors.dark.primary} 
            />
          </Pressable>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SettingsRow
            icon="zap"
            label="Auto-sync Contacts"
            isToggle
            toggleValue={contactSync.autoSyncEnabled}
            onToggle={(value) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              contactSync.setAutoSyncEnabled(value);
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
            icon="tool"
            label="Tools & Actions"
            value="Live backend registry"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("ToolRegistry");
            }}
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SettingsRow
            icon="database"
            label="Data Retention"
            value={getRetentionLabel(dataRetentionDays)}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("DataRetention");
            }}
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
  },
  avatarPressable: {
    marginBottom: Spacing.md,
    position: "relative",
  },
  avatarImageWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: "hidden",
    position: "relative",
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  cameraIconOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: Colors.dark.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundRoot,
  },
  reminderBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: Colors.dark.warning,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundRoot,
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

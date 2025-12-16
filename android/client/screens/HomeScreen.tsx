import React, { useCallback } from "react";
import { View, ScrollView, StyleSheet, RefreshControl, Pressable, ActivityIndicator, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { useNavigation, CompositeNavigationProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { HomeStackParamList } from "@/navigation/HomeStackNavigator";
import type { MainTabParamList } from "@/navigation/MainTabNavigator";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

import { ThemedText } from "@/components/ThemedText";
import { GradientText } from "@/components/GradientText";
import { DeviceCard, DeviceInfo } from "@/components/DeviceCard";
import { PulsingDot } from "@/components/PulsingDot";
import { useTheme } from "@/hooks/useTheme";
import { useLocation } from "@/hooks/useLocation";
import { Spacing, Colors, BorderRadius, Gradients } from "@/constants/theme";
import { queryClient, getApiUrl, isZekeSyncMode } from "@/lib/query-client";
import { 
  getHealthStatus, 
  getDashboardSummary,
  getTodayEvents,
  getPendingTasks,
  getGroceryItems,
  type ZekeEvent,
  type ZekeTask,
  type ZekeGroceryItem,
  type DashboardSummary,
} from "@/lib/zeke-api-adapter";

interface ApiDevice {
  id: string;
  userId: string | null;
  name: string;
  type: string;
  macAddress: string | null;
  batteryLevel: number | null;
  isConnected: boolean;
  lastSyncAt: string | null;
  createdAt: string;
}

function mapApiDeviceToDeviceInfo(device: ApiDevice): DeviceInfo {
  const getRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hr ago`;
    return `${Math.floor(diffHours / 24)} days ago`;
  };

  const deviceType: "omi" | "limitless" = 
    (device.type === "omi" || device.type === "limitless") ? device.type : "omi";

  return {
    id: device.id,
    name: device.name,
    type: deviceType,
    isConnected: device.isConnected,
    batteryLevel: device.batteryLevel ?? 0,
    lastSync: getRelativeTime(device.lastSyncAt),
    isRecording: device.isConnected,
  };
}

type HomeScreenNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList, 'Home'>,
  CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList>,
    NativeStackNavigationProp<RootStackParamList>
  >
>;

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatEventTime(startTime: string, endTime?: string): string {
  const start = new Date(startTime);
  const timeStr = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (endTime) {
    const end = new Date(endTime);
    const endTimeStr = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `${timeStr} - ${endTimeStr}`;
  }
  return timeStr;
}

interface QuickActionButtonProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  gradientColors: readonly [string, string];
  onPress: () => void;
}

function QuickActionButton({ icon, label, gradientColors, onPress }: QuickActionButtonProps) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.quickActionButton, { opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.quickActionGradient}
      >
        <View style={styles.quickActionIconContainer}>
          <Feather name={icon} size={24} color="#FFFFFF" />
        </View>
        <ThemedText type="small" style={styles.quickActionLabel}>{label}</ThemedText>
      </LinearGradient>
    </Pressable>
  );
}

interface ActivityItem {
  id: string;
  action: string;
  timestamp: string;
  icon: keyof typeof Feather.glyphMap;
}

const mockActivities: ActivityItem[] = [
  { id: '1', action: 'Sent SMS to Sarah', timestamp: '2 min ago', icon: 'message-circle' },
  { id: '2', action: 'Recorded 5 min meeting', timestamp: '15 min ago', icon: 'mic' },
  { id: '3', action: 'Added task: Review proposal', timestamp: '1 hr ago', icon: 'check-square' },
  { id: '4', action: 'Synced calendar events', timestamp: '2 hr ago', icon: 'calendar' },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const isSyncMode = isZekeSyncMode();

  const {
    location,
    geocoded,
    lastUpdated,
    isLoading: isLocationLoading,
    permissionStatus,
    requestPermission,
    refreshLocation,
  } = useLocation();

  const handleUploadPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('AudioUpload');
  };

  const handleCallPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === 'web') {
      const goToComms = window.confirm('Voice Calling\n\nTo make calls directly from ZEKE, you\'ll need to set up Twilio integration for VoIP calling.\n\nIn the meantime, you can view your call history and contacts in the Communications tab.\n\nClick OK to go to Communications.');
      if (goToComms) {
        navigation.navigate('CommsTab');
      }
    } else {
      Alert.alert(
        'Voice Calling',
        'To make calls directly from ZEKE, you\'ll need to set up Twilio integration for VoIP calling.\n\nIn the meantime, you can view your call history and contacts in the Communications tab.',
        [
          { text: 'Go to Comms', onPress: () => navigation.navigate('CommsTab') },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  const handleMessagePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('SmsCompose', {});
  };

  const handleRecordPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === 'web') {
      const uploadAudio = window.confirm('Audio Recording\n\nZEKE supports two ways to capture audio:\n\n1. Connect an Omi or Limitless device for continuous recording\n\n2. Upload existing audio files for transcription\n\nClick OK to upload audio.');
      if (uploadAudio) {
        navigation.navigate('AudioUpload');
      }
    } else {
      Alert.alert(
        'Audio Recording',
        'ZEKE supports two ways to capture audio:\n\n1. Connect an Omi or Limitless device for continuous recording\n\n2. Upload existing audio files for transcription',
        [
          { text: 'Upload Audio', onPress: () => navigation.navigate('AudioUpload') },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  const handleCommandPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === 'web') {
      window.alert('Voice Commands\n\nComing soon! Voice commands will let you:\n\n• Add tasks and calendar events\n• Send messages hands-free\n• Search your memories\n• Control ZEKE settings\n\nStay tuned for updates!');
    } else {
      Alert.alert(
        'Voice Commands',
        'Coming soon! Voice commands will let you:\n\n• Add tasks and calendar events\n• Send messages hands-free\n• Search your memories\n• Control ZEKE settings\n\nStay tuned for updates!',
        [{ text: 'Got it' }]
      );
    }
  };

  const { data: connectionStatus } = useQuery({
    queryKey: ['zeke-connection-status'],
    queryFn: getHealthStatus,
    enabled: isSyncMode,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const { data: dashboardSummary } = useQuery<DashboardSummary>({
    queryKey: ['zeke-dashboard-summary'],
    queryFn: getDashboardSummary,
    enabled: isSyncMode,
    staleTime: 60000,
  });

  const { data: todayEvents = [] } = useQuery<ZekeEvent[]>({
    queryKey: ['zeke-today-events'],
    queryFn: getTodayEvents,
    enabled: isSyncMode,
    staleTime: 60000,
  });

  const { data: pendingTasks = [] } = useQuery<ZekeTask[]>({
    queryKey: ['zeke-pending-tasks'],
    queryFn: getPendingTasks,
    enabled: isSyncMode,
    staleTime: 60000,
  });

  const { data: groceryItems = [] } = useQuery<ZekeGroceryItem[]>({
    queryKey: ['zeke-grocery-items'],
    queryFn: getGroceryItems,
    enabled: isSyncMode,
    staleTime: 60000,
  });

  const { data: devicesData, isLoading: isLoadingDevices } = useQuery<ApiDevice[]>({
    queryKey: ['/api/devices'],
    enabled: !isSyncMode,
  });

  const devices: DeviceInfo[] = (devicesData ?? []).map(mapApiDeviceToDeviceInfo);
  const isLiveTranscribing = devices.some(d => d.isConnected && d.isRecording);
  const isRefreshing = isLoadingDevices;

  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isSyncMode) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['zeke-connection-status'] }),
        queryClient.invalidateQueries({ queryKey: ['zeke-dashboard-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['zeke-today-events'] }),
        queryClient.invalidateQueries({ queryKey: ['zeke-pending-tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['zeke-grocery-items'] }),
      ]);
    } else {
      await queryClient.invalidateQueries({ queryKey: ['/api/devices'] });
    }
  }, [isSyncMode]);

  const handleDevicePress = (device: DeviceInfo) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const unpurchasedGroceryItems = groceryItems.filter(item => !item.isPurchased);

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
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={Colors.dark.primary}
        />
      }
    >
      <View style={styles.headerSection}>
        <View style={styles.greetingSection}>
          <GradientText type="h2" colors={Gradients.primary}>
            {getGreeting()}{isSyncMode && dashboardSummary?.userName ? `, ${dashboardSummary.userName}` : ''}
          </GradientText>
          <ThemedText type="body" secondary style={{ marginTop: Spacing.xs }}>
            ZEKE Command Center
          </ThemedText>
        </View>

        <View style={styles.sectionHeader}>
          <ThemedText type="h4">Quick Actions</ThemedText>
        </View>
        <View style={styles.quickActionsGrid}>
          <QuickActionButton
            icon="phone"
            label="Call"
            gradientColors={['#6366F1', '#8B5CF6']}
            onPress={handleCallPress}
          />
          <QuickActionButton
            icon="message-circle"
            label="Message"
            gradientColors={['#8B5CF6', '#A855F7']}
            onPress={handleMessagePress}
          />
          <QuickActionButton
            icon="mic"
            label="Record"
            gradientColors={['#EC4899', '#F472B6']}
            onPress={handleRecordPress}
          />
          <QuickActionButton
            icon="terminal"
            label="Command"
            gradientColors={['#10B981', '#34D399']}
            onPress={handleCommandPress}
          />
        </View>

        <Pressable 
          style={[styles.monitoringCard, { backgroundColor: theme.backgroundDefault }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.navigate('Location');
          }}
        >
          <View style={styles.monitoringHeader}>
            <View style={styles.monitoringTitleRow}>
              <Feather name="map-pin" size={18} color={Colors.dark.primary} />
              <ThemedText type="h4" style={{ marginLeft: Spacing.sm }}>Location Tracking</ThemedText>
            </View>
            <View style={styles.statusIndicator}>
              {isLocationLoading ? (
                <ActivityIndicator size="small" color={Colors.dark.primary} />
              ) : permissionStatus === 'granted' && location ? (
                <>
                  <PulsingDot color={Colors.dark.success} size={8} />
                  <ThemedText type="caption" style={{ marginLeft: Spacing.xs, color: Colors.dark.success }}>Active</ThemedText>
                </>
              ) : permissionStatus === 'denied' ? (
                <ThemedText type="caption" style={{ color: Colors.dark.error }}>Denied</ThemedText>
              ) : (
                <ThemedText type="caption" style={{ color: Colors.dark.warning }}>Tap to Enable</ThemedText>
              )}
            </View>
          </View>
          <View style={styles.locationInfo}>
            {permissionStatus === 'granted' && geocoded ? (
              <>
                <ThemedText type="body">{geocoded.formattedAddress}</ThemedText>
                <ThemedText type="caption" secondary style={{ marginTop: Spacing.xs }}>
                  Last updated: {lastUpdated || 'Just now'}
                </ThemedText>
              </>
            ) : permissionStatus === 'granted' && location ? (
              <>
                <ThemedText type="body">
                  {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                </ThemedText>
                <ThemedText type="caption" secondary style={{ marginTop: Spacing.xs }}>
                  Last updated: {lastUpdated || 'Just now'}
                </ThemedText>
              </>
            ) : permissionStatus === 'denied' ? (
              <>
                <ThemedText type="body">Location access denied</ThemedText>
                <ThemedText type="caption" secondary style={{ marginTop: Spacing.xs }}>
                  {Platform.OS !== 'web' ? 'Tap to open settings' : 'Enable location in browser'}
                </ThemedText>
              </>
            ) : (
              <>
                <ThemedText type="body">Enable location access</ThemedText>
                <ThemedText type="caption" secondary style={{ marginTop: Spacing.xs }}>
                  Tap to allow ZEKE to track your location
                </ThemedText>
              </>
            )}
          </View>
        </Pressable>

        <View style={[styles.monitoringCard, { backgroundColor: theme.backgroundDefault }]}>
          <View style={styles.monitoringHeader}>
            <View style={styles.monitoringTitleRow}>
              <Feather name="activity" size={18} color={Colors.dark.accent} />
              <ThemedText type="h4" style={{ marginLeft: Spacing.sm }}>Activity Timeline</ThemedText>
            </View>
          </View>
          {mockActivities.map((activity, index) => (
            <View 
              key={activity.id} 
              style={[
                styles.activityItem, 
                index === mockActivities.length - 1 ? { marginBottom: 0 } : null
              ]}
            >
              <View style={[styles.activityIconContainer, { backgroundColor: `${Colors.dark.primary}20` }]}>
                <Feather name={activity.icon} size={14} color={Colors.dark.primary} />
              </View>
              <View style={styles.activityContent}>
                <ThemedText type="small" numberOfLines={1}>{activity.action}</ThemedText>
                <ThemedText type="caption" secondary>{activity.timestamp}</ThemedText>
              </View>
            </View>
          ))}
        </View>

        {isSyncMode ? (
          <>
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { backgroundColor: theme.backgroundDefault }]}>
                <View style={[styles.statIconContainer, { backgroundColor: 'rgba(99, 102, 241, 0.2)' }]}>
                  <Feather name="calendar" size={20} color={Colors.dark.primary} />
                </View>
                <ThemedText type="h3">{todayEvents.length}</ThemedText>
                <ThemedText type="caption" secondary>Events</ThemedText>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.backgroundDefault }]}>
                <View style={[styles.statIconContainer, { backgroundColor: 'rgba(168, 85, 247, 0.2)' }]}>
                  <Feather name="check-square" size={20} color={Colors.dark.accent} />
                </View>
                <ThemedText type="h3">{pendingTasks.length}</ThemedText>
                <ThemedText type="caption" secondary>Tasks</ThemedText>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.backgroundDefault }]}>
                <View style={[styles.statIconContainer, { backgroundColor: 'rgba(236, 72, 153, 0.2)' }]}>
                  <Feather name="shopping-cart" size={20} color="#EC4899" />
                </View>
                <ThemedText type="h3">{unpurchasedGroceryItems.length}</ThemedText>
                <ThemedText type="caption" secondary>Groceries</ThemedText>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.backgroundDefault }]}>
                <View style={[styles.statIconContainer, { backgroundColor: 'rgba(34, 197, 94, 0.2)' }]}>
                  <Feather name="wifi" size={20} color="#22C55E" />
                </View>
                <ThemedText type="h3">{connectionStatus?.status === 'ok' ? 'Online' : 'Offline'}</ThemedText>
                <ThemedText type="caption" secondary>Status</ThemedText>
              </View>
            </View>

            {todayEvents.length > 0 && (
              <View style={[styles.dashboardCard, { backgroundColor: theme.backgroundDefault }]}>
                <View style={styles.sectionHeader}>
                  <ThemedText type="h4">Today's Schedule</ThemedText>
                </View>
                {todayEvents.slice(0, 3).map((event, index) => (
                  <View key={event.id || index} style={styles.eventItem}>
                    <View style={[styles.eventDot, { backgroundColor: Colors.dark.primary }]} />
                    <View style={{ flex: 1 }}>
                      <ThemedText type="body" numberOfLines={1}>{event.title}</ThemedText>
                      <ThemedText type="caption" secondary>
                        {formatEventTime(event.startTime, event.endTime)}
                      </ThemedText>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {pendingTasks.length > 0 && (
              <View style={[styles.dashboardCard, { backgroundColor: theme.backgroundDefault }]}>
                <View style={styles.sectionHeader}>
                  <ThemedText type="h4">Pending Tasks</ThemedText>
                </View>
                {pendingTasks.slice(0, 3).map((task, index) => (
                  <View key={task.id || index} style={styles.taskItem}>
                    <View style={[
                      styles.priorityIndicator,
                      { backgroundColor: task.priority === 'high' ? Colors.dark.error : 
                        task.priority === 'medium' ? Colors.dark.warning : Colors.dark.success }
                    ]} />
                    <ThemedText type="body" numberOfLines={1} style={{ flex: 1 }}>
                      {task.title}
                    </ThemedText>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <ThemedText type="h4">Connected Devices</ThemedText>
              {devices.length > 0 && (
                <View style={styles.deviceCount}>
                  <View
                    style={[
                      styles.countBadge,
                      { backgroundColor: `${Colors.dark.primary}20` },
                    ]}
                  >
                    <ThemedText type="small" style={{ color: Colors.dark.primary }}>
                      {devices.length}
                    </ThemedText>
                  </View>
                </View>
              )}
            </View>

            {isLoadingDevices ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color={Colors.dark.primary} />
              </View>
            ) : devices.length > 0 ? (
              devices.map((device) => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  onPress={() => handleDevicePress(device)}
                />
              ))
            ) : (
              <View style={[styles.emptyCard, { backgroundColor: theme.backgroundDefault }]}>
                <View style={styles.emptyCardContent}>
                  <Feather name="bluetooth" size={32} color={theme.textSecondary} />
                  <ThemedText type="body" secondary style={{ marginTop: Spacing.md, textAlign: "center" }}>
                    No devices connected
                  </ThemedText>
                  <ThemedText type="small" secondary style={{ textAlign: "center", marginTop: Spacing.xs }}>
                    Connect your Omi or Limitless device to start capturing
                  </ThemedText>
                </View>
              </View>
            )}

            {isLiveTranscribing ? (
              <View
                style={[
                  styles.liveTranscriptionCard,
                  { backgroundColor: `${Colors.dark.accent}15` },
                ]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: Spacing.sm }}>
                  <PulsingDot color={Colors.dark.accent} />
                  <ThemedText type="small" style={{ marginLeft: Spacing.sm, color: Colors.dark.accent }}>
                    Live Transcription
                  </ThemedText>
                </View>
                <ThemedText type="body" secondary numberOfLines={2}>
                  "...and that's why we need to prioritize the user experience in the next sprint..."
                </ThemedText>
              </View>
            ) : null}
          </>
        )}

        <Pressable
          onPress={handleUploadPress}
          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, marginTop: Spacing.lg })}
        >
          <LinearGradient
            colors={Gradients.accent}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.uploadCard}
          >
            <View style={styles.uploadIconContainer}>
              <Feather name="upload-cloud" size={28} color="#FFFFFF" />
            </View>
            <View style={styles.uploadContent}>
              <ThemedText type="body" style={styles.uploadTitle}>
                Upload Audio
              </ThemedText>
              <ThemedText type="small" style={styles.uploadSubtitle}>
                Transcribe audio files and save to ZEKE
              </ThemedText>
            </View>
            <Feather name="chevron-right" size={24} color="#FFFFFF" />
          </LinearGradient>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerSection: {
    marginBottom: Spacing.md,
  },
  greetingSection: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
    marginTop: Spacing.md,
  },
  deviceCount: {
    flexDirection: "row",
    alignItems: "center",
  },
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -Spacing.xs,
    marginBottom: Spacing.lg,
  },
  quickActionButton: {
    width: "48%",
    marginHorizontal: "1%",
    marginBottom: Spacing.sm,
  },
  quickActionGradient: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 90,
  },
  quickActionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  quickActionLabel: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  monitoringCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  monitoringHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  monitoringTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
  },
  locationInfo: {
    marginTop: Spacing.xs,
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  activityIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  activityContent: {
    flex: 1,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -Spacing.xs,
    marginBottom: Spacing.lg,
    marginTop: Spacing.md,
  },
  statCard: {
    width: "48%",
    marginHorizontal: "1%",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    alignItems: "center",
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  dashboardCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  emptyCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  emptyCardContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  countBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  liveTranscriptionCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  uploadCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
  },
  uploadIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  uploadTitle: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  uploadSubtitle: {
    color: "rgba(255, 255, 255, 0.8)",
    marginTop: 2,
  },
  eventItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.sm,
    marginTop: 6,
  },
  taskItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  priorityIndicator: {
    width: 4,
    height: 16,
    borderRadius: 2,
    marginRight: Spacing.sm,
  },
  loadingContainer: {
    padding: Spacing.xl,
    alignItems: "center",
  },
});

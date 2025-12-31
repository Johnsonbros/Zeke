import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Modal,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

interface PendantStatus {
  connected: boolean;
  streaming: boolean;
  healthy: boolean;
  lastAudioReceivedAt: string | null;
  totalAudioPackets: number;
  timeSinceLastAudioMs: number | null;
}

type ConnectionState = "disconnected" | "connected" | "streaming";

const POLL_INTERVAL_MS = 3000;

function formatTime(isoString: string | null): string {
  if (!isoString) return "Never";
  const date = new Date(isoString);
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

function getConnectionState(status: PendantStatus | null | undefined): ConnectionState {
  if (!status || !status.connected) return "disconnected";
  if (status.streaming) return "streaming";
  return "connected";
}

function getStatusText(state: ConnectionState): string {
  switch (state) {
    case "streaming":
      return "Listening...";
    case "connected":
      return "Pendant connected";
    case "disconnected":
    default:
      return "Pendant disconnected";
  }
}

export function PendantStatusIndicator() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [showBottomSheet, setShowBottomSheet] = useState(false);

  const { data: status, isLoading } = useQuery<PendantStatus>({
    queryKey: ["/api/pendant/status"],
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: POLL_INTERVAL_MS - 500,
    retry: 1,
  });

  const scale = useSharedValue(1);
  const connectionState = getConnectionState(status);

  useEffect(() => {
    if (connectionState === "streaming") {
      scale.value = withRepeat(
        withTiming(1.3, { duration: 1000 }),
        -1,
        true
      );
    } else {
      cancelAnimation(scale);
      scale.value = withTiming(1, { duration: 200 });
    }
  }, [connectionState, scale]);

  const pulsingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowBottomSheet(true);
  };

  const handleCloseSheet = () => {
    setShowBottomSheet(false);
  };

  const getDotColor = (): string => {
    switch (connectionState) {
      case "streaming":
      case "connected":
        return Colors.dark.success;
      case "disconnected":
      default:
        return theme.textSecondary;
    }
  };

  const getDotOpacity = (): number => {
    return connectionState === "disconnected" ? 0.5 : 1;
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.iconContainer}>
          <Feather name="radio" size={16} color={theme.textSecondary} />
        </View>
        <View
          style={[
            styles.dot,
            { backgroundColor: theme.textSecondary, opacity: 0.5 },
          ]}
        />
      </View>
    );
  }

  return (
    <>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.container,
          { opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <View style={styles.iconContainer}>
          <Feather
            name="radio"
            size={16}
            color={connectionState === "disconnected" ? theme.textSecondary : Colors.dark.success}
          />
        </View>
        {connectionState === "streaming" ? (
          <Animated.View
            style={[
              styles.dot,
              { backgroundColor: getDotColor(), opacity: getDotOpacity() },
              pulsingStyle,
            ]}
          />
        ) : (
          <View
            style={[
              styles.dot,
              { backgroundColor: getDotColor(), opacity: getDotOpacity() },
            ]}
          />
        )}
      </Pressable>

      <Modal
        visible={showBottomSheet}
        transparent
        animationType="slide"
        onRequestClose={handleCloseSheet}
      >
        <Pressable style={styles.modalOverlay} onPress={handleCloseSheet}>
          <Pressable
            style={[
              styles.bottomSheet,
              {
                backgroundColor: theme.backgroundDefault,
                paddingBottom: insets.bottom + Spacing.lg,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderIcon}>
                <Feather
                  name="radio"
                  size={24}
                  color={connectionState === "disconnected" ? theme.textSecondary : Colors.dark.success}
                />
                {connectionState === "streaming" ? (
                  <Animated.View
                    style={[
                      styles.sheetDot,
                      { backgroundColor: Colors.dark.success },
                      pulsingStyle,
                    ]}
                  />
                ) : (
                  <View
                    style={[
                      styles.sheetDot,
                      {
                        backgroundColor: getDotColor(),
                        opacity: getDotOpacity(),
                      },
                    ]}
                  />
                )}
              </View>
              <ThemedText type="h3" style={styles.sheetTitle}>
                {getStatusText(connectionState)}
              </ThemedText>
            </View>

            <View style={styles.sheetContent}>
              <View style={styles.statusRow}>
                <ThemedText type="body" secondary>
                  Last audio received
                </ThemedText>
                <ThemedText type="body">
                  {formatTime(status?.lastAudioReceivedAt ?? null)}
                </ThemedText>
              </View>

              <View style={[styles.statusRow, styles.statusRowLast]}>
                <ThemedText type="body" secondary>
                  Total packets
                </ThemedText>
                <ThemedText type="body">
                  {formatNumber(status?.totalAudioPackets ?? 0)}
                </ThemedText>
              </View>
            </View>

            <Pressable
              style={[styles.closeButton, { backgroundColor: theme.backgroundSecondary }]}
              onPress={handleCloseSheet}
            >
              <ThemedText type="body" style={{ textAlign: "center" }}>
                Close
              </ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  iconContainer: {
    marginRight: Spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  bottomSheet: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: Spacing.lg,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  sheetHeaderIcon: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  sheetDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: Spacing.xs,
  },
  sheetTitle: {
    flex: 1,
  },
  sheetContent: {
    marginBottom: Spacing.xl,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  statusRowLast: {
    borderBottomWidth: 0,
  },
  closeButton: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
});

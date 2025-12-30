import React, { useEffect } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { getPendantStatus, type PendantStatus } from "@/lib/zeke-api-adapter";
import { isZekeSyncMode } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

type ConnectionState = "disconnected" | "connected" | "streaming";

function getConnectionState(status: PendantStatus | undefined): ConnectionState {
  if (!status) return "disconnected";
  if (status.streaming) return "streaming";
  if (status.connected) return "connected";
  return "disconnected";
}

function formatTime(isoString: string | null): string {
  if (!isoString) return "Never";
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatPacketCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toLocaleString();
}

interface PendantStatusIndicatorProps {
  onPress?: () => void;
  showLabel?: boolean;
}

export function PendantStatusIndicator({
  onPress,
  showLabel = false,
}: PendantStatusIndicatorProps) {
  const isSyncMode = isZekeSyncMode();

  const { data: status } = useQuery<PendantStatus>({
    queryKey: ["pendant-status"],
    queryFn: getPendantStatus,
    enabled: isSyncMode,
    refetchInterval: 3000,
    staleTime: 2000,
  });

  const connectionState = getConnectionState(status);

  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);

  useEffect(() => {
    if (connectionState === "streaming") {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.5, { duration: 500, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 500, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        false,
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 500, easing: Easing.out(Easing.ease) }),
          withTiming(0.6, { duration: 500, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 200 });
      pulseOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [connectionState, pulseScale, pulseOpacity]);

  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const getDotColor = () => {
    switch (connectionState) {
      case "streaming":
        return Colors.dark.success;
      case "connected":
        return Colors.dark.success;
      case "disconnected":
      default:
        return Colors.dark.textSecondary;
    }
  };

  const getStatusText = () => {
    switch (connectionState) {
      case "streaming":
        return "Listening...";
      case "connected":
        return "Pendant connected";
      case "disconnected":
      default:
        return "Pendant disconnected";
    }
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  };

  if (!isSyncMode) {
    return null;
  }

  const content = (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Feather
          name="radio"
          size={14}
          color={getDotColor()}
        />
      </View>
      <View style={styles.dotWrapper}>
        {connectionState === "streaming" ? (
          <Animated.View
            style={[
              styles.pulseDot,
              { backgroundColor: getDotColor() },
              pulseAnimatedStyle,
            ]}
          />
        ) : null}
        <View
          style={[
            styles.dot,
            { backgroundColor: getDotColor() },
          ]}
        />
      </View>
      {showLabel ? (
        <ThemedText type="caption" style={[styles.label, { color: getDotColor() }]}>
          {getStatusText()}
        </ThemedText>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={handlePress}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={({ pressed }) => [
          styles.pressable,
          pressed && styles.pressed,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

export function PendantStatusTooltip() {
  const isSyncMode = isZekeSyncMode();

  const { data: status } = useQuery<PendantStatus>({
    queryKey: ["pendant-status"],
    queryFn: getPendantStatus,
    enabled: isSyncMode,
    refetchInterval: 3000,
    staleTime: 2000,
  });

  const connectionState = getConnectionState(status);

  if (!isSyncMode || !status) {
    return null;
  }

  return (
    <View style={styles.tooltipContainer}>
      <View style={styles.tooltipRow}>
        <ThemedText type="caption" secondary>Status:</ThemedText>
        <ThemedText
          type="caption"
          style={{
            color: connectionState === "disconnected"
              ? Colors.dark.textSecondary
              : Colors.dark.success,
            fontWeight: "600",
          }}
        >
          {connectionState === "streaming"
            ? "Listening"
            : connectionState === "connected"
            ? "Connected"
            : "Disconnected"}
        </ThemedText>
      </View>
      <View style={styles.tooltipRow}>
        <ThemedText type="caption" secondary>Last audio:</ThemedText>
        <ThemedText type="caption">
          {formatTime(status.lastAudioReceivedAt)}
        </ThemedText>
      </View>
      <View style={styles.tooltipRow}>
        <ThemedText type="caption" secondary>Packets:</ThemedText>
        <ThemedText type="caption">
          {formatPacketCount(status.totalAudioPackets)}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  pressable: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(30, 41, 59, 0.4)",
  },
  pressed: {
    opacity: 0.7,
  },
  iconContainer: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dotWrapper: {
    width: 10,
    height: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseDot: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    marginLeft: Spacing.xs,
    fontWeight: "500",
  },
  tooltipContainer: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: Spacing.xs,
    minWidth: 140,
  },
  tooltipRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.md,
  },
});

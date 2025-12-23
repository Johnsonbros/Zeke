import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withSequence,
  FadeIn,
  FadeOut,
  SlideInUp,
  SlideOutUp,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";

export interface ZekeAlert {
  id: string;
  type: "info" | "success" | "warning" | "error" | "reminder" | "news";
  title: string;
  message: string;
  timestamp: string;
  actionLabel?: string;
  onAction?: () => void;
  dismissable?: boolean;
}

interface ZekeAlertBannerProps {
  alert: ZekeAlert;
  onDismiss: (alertId: string) => void;
}

function getAlertColors(type: ZekeAlert["type"]): readonly [string, string] {
  switch (type) {
    case "success":
      return ["#10B981", "#059669"] as const;
    case "warning":
      return ["#F59E0B", "#D97706"] as const;
    case "error":
      return ["#EF4444", "#DC2626"] as const;
    case "reminder":
      return ["#8B5CF6", "#7C3AED"] as const;
    case "news":
      return ["#6366F1", "#4F46E5"] as const;
    case "info":
    default:
      return ["#3B82F6", "#2563EB"] as const;
  }
}

function getAlertIcon(type: ZekeAlert["type"]): keyof typeof Feather.glyphMap {
  switch (type) {
    case "success":
      return "check-circle";
    case "warning":
      return "alert-triangle";
    case "error":
      return "alert-circle";
    case "reminder":
      return "bell";
    case "news":
      return "rss";
    case "info":
    default:
      return "info";
  }
}

export function ZekeAlertBanner({ alert, onDismiss }: ZekeAlertBannerProps) {
  const { theme } = useTheme();
  const pulseAnim = useSharedValue(1);

  useEffect(() => {
    if (alert.type === "error" || alert.type === "warning") {
      pulseAnim.value = withRepeat(
        withSequence(
          withSpring(1.02, { damping: 10 }),
          withSpring(1, { damping: 10 })
        ),
        3,
        true
      );
    }
  }, [alert.type]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDismiss(alert.id);
  };

  const handleAction = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    alert.onAction?.();
  };

  const colors = getAlertColors(alert.type);
  const icon = getAlertIcon(alert.type);

  return (
    <Animated.View
      entering={SlideInUp.springify().damping(15)}
      exiting={SlideOutUp.springify().damping(15)}
      style={[styles.container, animatedStyle]}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        <View style={styles.iconContainer}>
          <Feather name={icon} size={20} color="#FFFFFF" />
        </View>
        <View style={styles.content}>
          <ThemedText type="small" style={styles.title}>
            {alert.title}
          </ThemedText>
          <ThemedText type="caption" style={styles.message} numberOfLines={2}>
            {alert.message}
          </ThemedText>
        </View>
        <View style={styles.actions}>
          {alert.actionLabel && alert.onAction ? (
            <Pressable style={styles.actionButton} onPress={handleAction}>
              <ThemedText type="small" style={styles.actionText}>
                {alert.actionLabel}
              </ThemedText>
            </Pressable>
          ) : null}
          {alert.dismissable !== false ? (
            <Pressable style={styles.dismissButton} onPress={handleDismiss}>
              <Feather name="x" size={18} color="rgba(255,255,255,0.8)" />
            </Pressable>
          ) : null}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

interface ZekeAlertStackProps {
  alerts: ZekeAlert[];
  onDismiss: (alertId: string) => void;
  maxVisible?: number;
}

export function ZekeAlertStack({
  alerts,
  onDismiss,
  maxVisible = 3,
}: ZekeAlertStackProps) {
  const visibleAlerts = alerts.slice(0, maxVisible);

  if (visibleAlerts.length === 0) {
    return null;
  }

  return (
    <View style={styles.stackContainer}>
      {visibleAlerts.map((alert, index) => (
        <View
          key={alert.id}
          style={[
            styles.stackItem,
            { zIndex: visibleAlerts.length - index },
          ]}
        >
          <ZekeAlertBanner alert={alert} onDismiss={onDismiss} />
        </View>
      ))}
      {alerts.length > maxVisible ? (
        <Animated.View entering={FadeIn} style={styles.moreIndicator}>
          <ThemedText type="caption" secondary>
            +{alerts.length - maxVisible} more alerts
          </ThemedText>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  gradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  message: {
    color: "rgba(255,255,255,0.9)",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  actionButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: BorderRadius.sm,
  },
  actionText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  dismissButton: {
    padding: Spacing.xs,
  },
  stackContainer: {
    gap: Spacing.xs,
  },
  stackItem: {
    marginBottom: -Spacing.xs,
  },
  moreIndicator: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
});

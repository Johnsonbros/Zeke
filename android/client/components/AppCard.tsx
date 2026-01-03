import React, { useEffect } from "react";
import {
  View,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

export interface AppCardData {
  id: string;
  title: string;
  icon: keyof typeof Feather.glyphMap;
  gradientColors: readonly [string, string];
  liveData?: {
    primary?: string;
    secondary?: string;
    count?: number;
  };
  isZekeActive?: boolean;
  needsAttention?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}

interface AppCardProps extends AppCardData {
  size?: "small" | "medium" | "large";
  mode?: "grid" | "carousel";
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function AppCard({
  title,
  icon,
  gradientColors,
  liveData,
  isZekeActive = false,
  needsAttention = false,
  onPress,
  onLongPress,
  size = "medium",
  mode = "grid",
}: AppCardProps) {
  const { theme } = useTheme();
  const pulseAnim = useSharedValue(0);
  const glowAnim = useSharedValue(0);
  const scaleAnim = useSharedValue(1);

  useEffect(() => {
    if (isZekeActive) {
      pulseAnim.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1200 }),
          withTiming(0, { duration: 1200 })
        ),
        -1,
        false
      );
    } else {
      pulseAnim.value = withTiming(0, { duration: 300 });
    }
  }, [isZekeActive, pulseAnim]);

  useEffect(() => {
    if (needsAttention) {
      glowAnim.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 800 }),
          withTiming(0, { duration: 800 })
        ),
        -1,
        false
      );
    } else {
      glowAnim.value = withTiming(0, { duration: 300 });
    }
  }, [needsAttention, glowAnim]);

  const handlePressIn = () => {
    scaleAnim.value = withTiming(0.95, { duration: 100 });
  };

  const handlePressOut = () => {
    scaleAnim.value = withTiming(1, { duration: 100 });
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const handleLongPressAction = () => {
    if (onLongPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onLongPress();
    }
  };

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
  }));

  const borderAnimatedStyle = useAnimatedStyle(() => {
    const borderOpacity = interpolate(
      pulseAnim.value,
      [0, 1],
      [0, 1],
      Extrapolation.CLAMP
    );
    const borderWidth = interpolate(
      pulseAnim.value,
      [0, 1],
      [0, 3],
      Extrapolation.CLAMP
    );
    return {
      borderWidth,
      borderColor: isZekeActive
        ? `rgba(99, 102, 241, ${borderOpacity})`
        : "transparent",
    };
  });

  const glowAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      glowAnim.value,
      [0, 1],
      [0.3, 0.8],
      Extrapolation.CLAMP
    );
    return {
      opacity: needsAttention ? opacity : 0,
    };
  });

  const cardHeight = mode === "carousel" ? 240 : size === "large" ? 200 : size === "small" ? 140 : 160;

  return (
    <AnimatedPressable
      onPress={handlePress}
      onLongPress={handleLongPressAction}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.cardContainer,
        { height: cardHeight },
        cardAnimatedStyle,
      ]}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${title} app. ${liveData?.primary || ""}`}
      accessibilityHint={isZekeActive ? "ZEKE is currently active here" : undefined}
    >
      <Animated.View
        style={[
          styles.glowContainer,
          {
            borderRadius: BorderRadius.xl,
          },
          glowAnimatedStyle,
        ]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.glowGradient}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: theme.backgroundDefault,
            borderRadius: BorderRadius.xl,
          },
          borderAnimatedStyle,
        ]}
      >
        <LinearGradient
          colors={[
            `${gradientColors[0]}15`,
            `${gradientColors[1]}15`,
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cardGradient}
        >
          <View style={styles.cardHeader}>
            <View
              style={[
                styles.iconContainer,
                {
                  backgroundColor: `${gradientColors[0]}30`,
                },
              ]}
            >
              <Feather name={icon} size={28} color={gradientColors[0]} />
            </View>

            {isZekeActive && (
              <View style={styles.zekeBadge}>
                <Feather name="zap" size={10} color="#FFFFFF" />
              </View>
            )}

            {needsAttention && liveData?.count && liveData.count > 0 && (
              <View style={styles.notificationBadge}>
                <ThemedText type="caption" style={styles.badgeText}>
                  {liveData.count > 99 ? "99+" : liveData.count}
                </ThemedText>
              </View>
            )}
          </View>

          <View style={styles.cardContent}>
            <ThemedText
              type="h4"
              style={[styles.cardTitle, { color: theme.text }]}
              numberOfLines={1}
            >
              {title}
            </ThemedText>

            {liveData?.primary && (
              <ThemedText
                type="body"
                style={[styles.primaryData, { color: gradientColors[0] }]}
                numberOfLines={1}
              >
                {liveData.primary}
              </ThemedText>
            )}

            {liveData?.secondary && (
              <ThemedText
                type="small"
                style={[styles.secondaryData, { color: theme.textSecondary }]}
                numberOfLines={2}
              >
                {liveData.secondary}
              </ThemedText>
            )}
          </View>

          {mode === "grid" && (
            <View style={styles.cardFooter}>
              <View style={styles.statusIndicator}>
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: isZekeActive
                        ? "#10B981"
                        : theme.border,
                    },
                  ]}
                />
                <ThemedText type="caption" style={styles.statusText}>
                  {isZekeActive ? "Active" : "Ready"}
                </ThemedText>
              </View>
            </View>
          )}
        </LinearGradient>
      </Animated.View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    position: "relative",
    marginBottom: Spacing.md,
  },
  glowContainer: {
    position: "absolute",
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    zIndex: 0,
  },
  glowGradient: {
    flex: 1,
    borderRadius: BorderRadius.xl,
  },
  card: {
    flex: 1,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.15)",
      },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 4,
      },
    }),
  },
  cardGradient: {
    flex: 1,
    padding: Spacing.lg,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  zekeBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#1E293B",
  },
  notificationBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: "#1E293B",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  cardContent: {
    flex: 1,
    justifyContent: "center",
  },
  cardTitle: {
    fontWeight: "700",
    marginBottom: Spacing.xs,
  },
  primaryData: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  secondaryData: {
    fontSize: 13,
    lineHeight: 18,
  },
  cardFooter: {
    marginTop: Spacing.sm,
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    opacity: 0.7,
  },
});

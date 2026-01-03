import React, { useEffect } from "react";
import {
  View,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

interface ZekeStatusBarProps {
  currentAction?: string;
  isActive: boolean;
  onPress?: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ZekeStatusBar({
  currentAction = "Standing by",
  isActive = false,
  onPress,
}: ZekeStatusBarProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const pulseAnim = useSharedValue(0);
  const waveAnim = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      pulseAnim.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1000 }),
          withTiming(0, { duration: 1000 })
        ),
        -1,
        false
      );

      waveAnim.value = withRepeat(
        withTiming(1, { duration: 1500 }),
        -1,
        false
      );
    } else {
      pulseAnim.value = withTiming(0, { duration: 300 });
      waveAnim.value = withTiming(0, { duration: 300 });
    }
  }, [isActive, pulseAnim, waveAnim]);

  const handlePress = () => {
    if (onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  const iconAnimatedStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      pulseAnim.value,
      [0, 1],
      [0, 360],
      Extrapolation.CLAMP
    );
    return {
      transform: [{ rotate: `${rotate}deg` }],
    };
  });

  const waveformAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      waveAnim.value,
      [0, 0.5, 1],
      [0.8, 1.2, 0.8],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(
      waveAnim.value,
      [0, 0.5, 1],
      [0.5, 1, 0.5],
      Extrapolation.CLAMP
    );
    return {
      transform: [{ scaleY: scale }],
      opacity,
    };
  });

  return (
    <AnimatedPressable
      onPress={handlePress}
      style={[
        styles.container,
        {
          paddingBottom: insets.bottom + Spacing.sm,
        },
      ]}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`ZEKE status: ${currentAction}`}
      accessibilityHint="Tap to see ZEKE's activity details"
    >
      {Platform.OS === "ios" ? (
        <BlurView
          intensity={isDark ? 60 : 40}
          tint={isDark ? "dark" : "light"}
          style={styles.blurContainer}
        >
          <View style={[styles.overlay, { backgroundColor: theme.backgroundDefault }]} />
          <StatusBarContent
            isActive={isActive}
            currentAction={currentAction}
            iconAnimatedStyle={iconAnimatedStyle}
            waveformAnimatedStyle={waveformAnimatedStyle}
          />
        </BlurView>
      ) : (
        <View style={[styles.solidContainer, { backgroundColor: theme.backgroundDefault }]}>
          <StatusBarContent
            isActive={isActive}
            currentAction={currentAction}
            iconAnimatedStyle={iconAnimatedStyle}
            waveformAnimatedStyle={waveformAnimatedStyle}
          />
        </View>
      )}
    </AnimatedPressable>
  );
}

interface StatusBarContentProps {
  isActive: boolean;
  currentAction: string;
  iconAnimatedStyle: any;
  waveformAnimatedStyle: any;
}

function StatusBarContent({
  isActive,
  currentAction,
  iconAnimatedStyle,
  waveformAnimatedStyle,
}: StatusBarContentProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.content}>
      <View style={styles.leftSection}>
        <View style={styles.iconWrapper}>
          <LinearGradient
            colors={["#6366F1", "#8B5CF6"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconGradient}
          >
            <Animated.View style={iconAnimatedStyle}>
              <Feather
                name={isActive ? "zap" : "cpu"}
                size={18}
                color="#FFFFFF"
              />
            </Animated.View>
          </LinearGradient>
        </View>

        <View style={styles.textSection}>
          <ThemedText type="caption" style={styles.label}>
            ZEKE
          </ThemedText>
          <ThemedText
            type="small"
            style={[styles.action, { color: theme.text }]}
            numberOfLines={1}
          >
            {currentAction}
          </ThemedText>
        </View>
      </View>

      {isActive && (
        <View style={styles.waveformContainer}>
          {[0, 1, 2, 3].map((index) => (
            <Animated.View
              key={index}
              style={[
                styles.waveformBar,
                {
                  backgroundColor: "#6366F1",
                  height: 12 + index * 4,
                },
                waveformAnimatedStyle,
              ]}
            />
          ))}
        </View>
      )}

      <Feather
        name="chevron-up"
        size={16}
        color={theme.textSecondary}
        style={styles.chevron}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 999,
  },
  blurContainer: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    overflow: "hidden",
  },
  solidContainer: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    ...Platform.select({
      web: {
        boxShadow: "0px -2px 16px rgba(0, 0, 0, 0.2)",
      },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 8,
      },
    }),
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.85,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  leftSection: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  iconGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  textSection: {
    flex: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    opacity: 0.7,
    marginBottom: 2,
  },
  action: {
    fontWeight: "600",
  },
  waveformContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginRight: Spacing.md,
  },
  waveformBar: {
    width: 3,
    borderRadius: 1.5,
  },
  chevron: {
    opacity: 0.5,
  },
});

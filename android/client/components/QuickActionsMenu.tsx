import React, { useState, useCallback } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors, Gradients } from "@/constants/theme";

export interface QuickAction {
  id: string;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  gradientColors: readonly [string, string];
  onPress: () => void;
}

interface QuickActionsMenuProps {
  actions: QuickAction[];
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function QuickActionsMenu({ actions }: QuickActionsMenuProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [isOpen, setIsOpen] = useState(false);
  const animationProgress = useSharedValue(0);
  const fabRotation = useSharedValue(0);

  const handleToggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isOpen) {
      animationProgress.value = withSpring(0, { damping: 15, stiffness: 150 });
      fabRotation.value = withSpring(0, { damping: 15, stiffness: 150 });
      setIsOpen(false);
    } else {
      animationProgress.value = withSpring(1, { damping: 15, stiffness: 150 });
      fabRotation.value = withSpring(45, { damping: 15, stiffness: 150 });
      setIsOpen(true);
    }
  }, [isOpen, animationProgress, fabRotation]);

  const handleActionPress = useCallback(
    (action: QuickAction) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      animationProgress.value = withTiming(0, { duration: 200 });
      fabRotation.value = withTiming(0, { duration: 200 });
      setIsOpen(false);
      setTimeout(() => action.onPress(), 100);
    },
    [animationProgress, fabRotation],
  );

  const fabAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${fabRotation.value}deg` }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: animationProgress.value * 0.7,
  }));

  const menuContainerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: animationProgress.value,
    transform: [
      {
        translateY: interpolate(
          animationProgress.value,
          [0, 1],
          [50, 0],
          Extrapolation.CLAMP,
        ),
      },
      {
        scale: interpolate(
          animationProgress.value,
          [0, 1],
          [0.8, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <>
      <Animated.View
        style={[
          styles.backdrop,
          { backgroundColor: theme.backgroundRoot },
          backdropAnimatedStyle,
        ]}
        pointerEvents={isOpen ? "auto" : "none"}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleToggle} />
      </Animated.View>

      {isOpen ? (
        <Animated.View
          style={[
            styles.menuContainer,
            {
              bottom: tabBarHeight + Spacing.sm + 70,
              right: Spacing.lg,
            },
            menuContainerAnimatedStyle,
          ]}
        >
          <View
            style={[
              styles.menuCard,
              { backgroundColor: theme.backgroundDefault },
            ]}
          >
            <ThemedText type="h4" style={styles.menuTitle}>
              Quick Actions
            </ThemedText>
            <View style={styles.actionsGrid}>
              {actions.map((action, index) => (
                <ActionButton
                  key={action.id}
                  action={action}
                  onPress={() => handleActionPress(action)}
                  index={index}
                  animationProgress={animationProgress}
                />
              ))}
            </View>
          </View>
        </Animated.View>
      ) : null}

      <AnimatedPressable
        onPress={handleToggle}
        style={[
          styles.fab,
          {
            bottom: tabBarHeight + Spacing.sm,
            right: Spacing.lg,
          },
        ]}
      >
        <LinearGradient
          colors={Gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Animated.View style={fabAnimatedStyle}>
            <Feather name="plus" size={28} color="#FFFFFF" />
          </Animated.View>
        </LinearGradient>
      </AnimatedPressable>
    </>
  );
}

interface ActionButtonProps {
  action: QuickAction;
  onPress: () => void;
  index: number;
  animationProgress: SharedValue<number>;
}

function ActionButton({
  action,
  onPress,
  index,
  animationProgress,
}: ActionButtonProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const delay = index * 0.05;
    const adjustedProgress = Math.max(
      0,
      Math.min(1, (animationProgress.value - delay) / (1 - delay)),
    );
    return {
      opacity: adjustedProgress,
      transform: [
        {
          translateY: interpolate(
            adjustedProgress,
            [0, 1],
            [20, 0],
            Extrapolation.CLAMP,
          ),
        },
        {
          scale: interpolate(
            adjustedProgress,
            [0, 1],
            [0.8, 1],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  return (
    <Animated.View style={[styles.actionButton, animatedStyle]}>
      <Pressable onPress={onPress}>
        <LinearGradient
          colors={action.gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.actionButtonGradient}
        >
          <Feather name={action.icon} size={22} color="#FFFFFF" />
        </LinearGradient>
        <ThemedText type="caption" style={styles.actionLabel} numberOfLines={1}>
          {action.label}
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 998,
  },
  fab: {
    position: "absolute",
    zIndex: 1000,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabGradient: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  menuContainer: {
    position: "absolute",
    zIndex: 999,
    width: 280,
  },
  menuCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  menuTitle: {
    marginBottom: Spacing.md,
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  actionButton: {
    alignItems: "center",
    width: 72,
  },
  actionButtonGradient: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.lg,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  actionLabel: {
    textAlign: "center",
  },
});

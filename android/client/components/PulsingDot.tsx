import React, { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { Colors } from "@/constants/theme";

interface PulsingDotProps {
  color?: string;
  size?: number;
  isOnline?: boolean;
}

export function PulsingDot({
  color = Colors.dark.accent,
  size = 10,
  isOnline = true,
}: PulsingDotProps) {
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 800 }),
        withTiming(1, { duration: 800 }),
      ),
      -1,
      true,
    );
    scale.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 800 }),
        withTiming(1.2, { duration: 800 }),
      ),
      -1,
      true,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          backgroundColor: color,
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        animatedStyle,
      ]}
      accessibilityRole="status"
      accessibilityLabel={isOnline ? "Connected" : "Disconnected"}
      accessibilityLiveRegion="polite"
    />
  );
}

const styles = StyleSheet.create({
  dot: {},
});

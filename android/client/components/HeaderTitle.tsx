import React, { useEffect } from "react";
import { View, StyleSheet, Image } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolate,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, Colors, Gradients } from "@/constants/theme";

interface HeaderTitleProps {
  title: string;
  isOnline?: boolean;
  currentAction?: string;
  isActive?: boolean;
}

export function HeaderTitle({ 
  title, 
  isOnline = false,
  currentAction,
  isActive = false 
}: HeaderTitleProps) {
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(1);
  const statusPulse = useSharedValue(0);

  useEffect(() => {
    if (isOnline) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.4, { duration: 800, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        false,
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 800, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 200 });
      pulseOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [isOnline]);

  useEffect(() => {
    if (isActive) {
      statusPulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1000 }),
          withTiming(0, { duration: 1000 })
        ),
        -1,
        false
      );
    } else {
      statusPulse.value = withTiming(0, { duration: 300 });
    }
  }, [isActive]);

  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const statusTextStyle = useAnimatedStyle(() => ({
    opacity: interpolate(statusPulse.value, [0, 1], [0.6, 1]),
  }));

  return (
    <View style={styles.container}>
      <Image
        source={require("../../assets/images/icon.png")}
        style={styles.icon}
        resizeMode="contain"
      />
      <View style={styles.titleContainer}>
        <ThemedText style={styles.title}>{title}</ThemedText>
        <View style={styles.statusContainer}>
          <View style={styles.statusDotWrapper}>
            {isOnline ? (
              <Animated.View
                style={[
                  styles.statusDotPulse,
                  { backgroundColor: isActive ? Colors.dark.accent : Colors.dark.success },
                  pulseAnimatedStyle,
                ]}
              />
            ) : null}
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: isOnline
                    ? (isActive ? Colors.dark.accent : Colors.dark.success)
                    : Colors.dark.error,
                },
              ]}
            />
          </View>
          <Animated.View style={statusTextStyle}>
            <ThemedText
              style={[
                styles.statusText,
                { 
                  color: isOnline 
                    ? (isActive ? Colors.dark.accent : Colors.dark.success) 
                    : Colors.dark.error 
                },
              ]}
            >
              {isActive && currentAction ? currentAction : (isOnline ? "Connected" : "Offline")}
            </ThemedText>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: Spacing.sm,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  titleContainer: {
    flexDirection: "column",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 26,
    letterSpacing: 1,
    color: Gradients.primary[0],
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 1,
  },
  statusDotWrapper: {
    width: 8,
    height: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  statusDotPulse: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});

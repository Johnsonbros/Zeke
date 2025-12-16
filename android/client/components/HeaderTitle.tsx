import React, { useEffect } from "react";
import { View, StyleSheet, Image, Platform } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";

import { GradientText } from "@/components/GradientText";
import { ThemedText } from "@/components/ThemedText";
import { Spacing, Colors, Gradients } from "@/constants/theme";

interface HeaderTitleProps {
  title: string;
  isOnline?: boolean;
}

export function HeaderTitle({ title, isOnline = false }: HeaderTitleProps) {
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(1);
  const glowOpacity = useSharedValue(0.6);

  useEffect(() => {
    if (isOnline) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.4, { duration: 800, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 800, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 200 });
      pulseOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [isOnline]);

  useEffect(() => {
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.5, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <View style={styles.iconWrapper}>
        <Animated.View style={[styles.iconGlow, glowAnimatedStyle]} />
        <Image
          source={require("../../assets/images/icon.png")}
          style={styles.icon}
          resizeMode="contain"
        />
      </View>
      <View style={styles.titleContainer}>
        <GradientText type="h2" style={styles.title}>{title}</GradientText>
        <View style={styles.statusContainer}>
          <View style={styles.statusDotWrapper}>
            {isOnline ? (
              <Animated.View
                style={[
                  styles.statusDotPulse,
                  { backgroundColor: Colors.dark.success },
                  pulseAnimatedStyle,
                ]}
              />
            ) : null}
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isOnline ? Colors.dark.success : Colors.dark.error },
              ]}
            />
          </View>
          <ThemedText
            style={[
              styles.statusText,
              { color: isOnline ? Colors.dark.success : Colors.dark.error },
            ]}
          >
            {isOnline ? "Connected" : "Offline"}
          </ThemedText>
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
    gap: Spacing.md,
    flexShrink: 0,
    minWidth: 130,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  iconGlow: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Gradients.primary[0],
    ...Platform.select({
      ios: {
        shadowColor: Gradients.primary[0],
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 10,
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: `0 0 16px ${Gradients.primary[0]}`,
      },
    }),
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    flexShrink: 0,
    borderWidth: 1.5,
    borderColor: Gradients.primary[0],
  },
  titleContainer: {
    flexDirection: "column",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 26,
    letterSpacing: 1,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  statusDotWrapper: {
    width: 10,
    height: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statusDotPulse: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});

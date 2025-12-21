import React, { useEffect } from "react";
import { View, StyleSheet, Image } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, Colors, Gradients } from "@/constants/theme";

interface HeaderTitleProps {
  title: string;
  isOnline?: boolean;
}

export function HeaderTitle({ title, isOnline = false }: HeaderTitleProps) {
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(1);

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
  }, [isOnline, pulseScale, pulseOpacity]);

  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
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
                  { backgroundColor: Colors.dark.success },
                  pulseAnimatedStyle,
                ]}
              />
            ) : null}
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: isOnline
                    ? Colors.dark.success
                    : Colors.dark.error,
                },
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

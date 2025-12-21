import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Gradients, Colors } from "@/constants/theme";

export interface DeviceInfo {
  id: string;
  name: string;
  type: "omi" | "limitless";
  isConnected: boolean;
  batteryLevel: number;
  lastSync: string;
  isRecording?: boolean;
}

interface DeviceCardProps {
  device: DeviceInfo;
  onPress?: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function DeviceCard({ device, onPress }: DeviceCardProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 150 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
  };

  const getBatteryIcon = () => {
    if (device.batteryLevel > 75) return "battery";
    if (device.batteryLevel > 25) return "battery";
    return "battery";
  };

  const getBatteryColor = () => {
    if (device.batteryLevel > 50) return Colors.dark.success;
    if (device.batteryLevel > 20) return Colors.dark.warning;
    return Colors.dark.error;
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.container, animatedStyle]}
    >
      {device.isConnected ? (
        <LinearGradient
          colors={Gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBorder}
        >
          <View
            style={[
              styles.innerCard,
              { backgroundColor: theme.backgroundDefault },
            ]}
          >
            <CardContent
              device={device}
              theme={theme}
              getBatteryIcon={getBatteryIcon}
              getBatteryColor={getBatteryColor}
            />
          </View>
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.backgroundDefault,
              borderColor: theme.border,
            },
          ]}
        >
          <CardContent
            device={device}
            theme={theme}
            getBatteryIcon={getBatteryIcon}
            getBatteryColor={getBatteryColor}
          />
        </View>
      )}
    </AnimatedPressable>
  );
}

function CardContent({
  device,
  theme,
  getBatteryIcon,
  getBatteryColor,
}: {
  device: DeviceInfo;
  theme: typeof Colors.dark;
  getBatteryIcon: () => string;
  getBatteryColor: () => string;
}) {
  return (
    <>
      <View style={styles.header}>
        <View style={styles.deviceInfo}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: theme.backgroundSecondary },
            ]}
          >
            <Feather
              name={device.type === "omi" ? "headphones" : "disc"}
              size={20}
              color={
                device.isConnected ? Colors.dark.primary : theme.textSecondary
              }
            />
          </View>
          <View>
            <ThemedText type="h4">{device.name}</ThemedText>
            <ThemedText type="caption" secondary>
              {device.type === "omi" ? "Omi DevKit 2" : "Limitless Pendant"}
            </ThemedText>
          </View>
        </View>
        <View style={styles.statusContainer}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: device.isConnected
                  ? device.isRecording
                    ? Colors.dark.accent
                    : Colors.dark.success
                  : theme.textSecondary,
              },
            ]}
          />
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.stat}>
          <Feather
            name={getBatteryIcon() as any}
            size={14}
            color={getBatteryColor()}
          />
          <ThemedText type="small" secondary style={{ marginLeft: Spacing.xs }}>
            {device.batteryLevel}%
          </ThemedText>
        </View>
        <View style={styles.stat}>
          <Feather name="refresh-cw" size={14} color={theme.textSecondary} />
          <ThemedText type="small" secondary style={{ marginLeft: Spacing.xs }}>
            {device.lastSync}
          </ThemedText>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  gradientBorder: {
    borderRadius: BorderRadius.md,
    padding: 2,
  },
  innerCard: {
    borderRadius: BorderRadius.md - 2,
    padding: Spacing.lg,
  },
  card: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.lg,
  },
  deviceInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  footer: {
    flexDirection: "row",
    gap: Spacing.xl,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
  },
});

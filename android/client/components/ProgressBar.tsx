import React, { useEffect } from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import { Spacing, BorderRadius, Typography } from '@/constants/theme';

export interface ProgressBarProps {
  progress: number; // 0 to 100
  height?: number;
  showLabel?: boolean;
  color?: string;
  backgroundColor?: string;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

export function ProgressBar({
  progress,
  height = 8,
  showLabel = false,
  color,
  backgroundColor,
  style,
  accessibilityLabel,
}: ProgressBarProps) {
  const theme = useTheme();
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withSpring(Math.min(Math.max(progress, 0), 100), {
      damping: 15,
      stiffness: 100,
    });
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  return (
    <View style={[styles.container, style]}>
      {showLabel && (
        <Text
          style={[styles.label, { color: theme.textSecondary }]}
          accessibilityLabel={`${Math.round(progress)}% complete`}
        >
          {Math.round(progress)}%
        </Text>
      )}
      <View
        style={[
          styles.track,
          {
            height,
            backgroundColor: backgroundColor || theme.backgroundSecondary,
          },
        ]}
        accessibilityRole="progressbar"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min: 0, max: 100, now: progress }}
      >
        <Animated.View
          style={[
            styles.fill,
            {
              height: height - 2,
              backgroundColor: color || theme.primary,
            },
            animatedStyle,
          ]}
        />
      </View>
    </View>
  );
}

export interface ProgressCircleProps {
  progress: number; // 0 to 100
  size?: number;
  strokeWidth?: number;
  color?: string;
  backgroundColor?: string;
  showLabel?: boolean;
  accessibilityLabel?: string;
}

export function ProgressCircle({
  progress,
  size = 80,
  strokeWidth = 8,
  color,
  backgroundColor,
  showLabel = true,
  accessibilityLabel,
}: ProgressCircleProps) {
  const theme = useTheme();
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withTiming((Math.min(Math.max(progress, 0), 100) / 100) * 360, {
      duration: 800,
    });
  }, [progress]);

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View
      style={[styles.circleContainer, { width: size, height: size }]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: progress }}
    >
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
            borderColor: backgroundColor || theme.backgroundSecondary,
          },
        ]}
      />
      {showLabel && (
        <View style={styles.labelContainer}>
          <Text style={[styles.circleLabel, { color: theme.text }]}>
            {Math.round(progress)}%
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  track: {
    width: '100%',
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: {
    borderRadius: BorderRadius.full,
    margin: 1,
  },
  circleContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    position: 'absolute',
  },
  labelContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleLabel: {
    fontSize: Typography.body.fontSize,
    fontWeight: '700',
  },
});

import React, { useEffect } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/useTheme';
import { BorderRadius } from '@/constants/theme';

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: ViewStyle;
  variant?: 'text' | 'circular' | 'rectangular';
}

export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = BorderRadius.xs,
  style,
  variant = 'rectangular',
}: SkeletonProps) {
  const theme = useTheme();
  const shimmerTranslate = useSharedValue(-1);

  useEffect(() => {
    shimmerTranslate.value = withRepeat(
      withTiming(1, {
        duration: 1500,
        easing: Easing.ease,
      }),
      -1,
      false
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: shimmerTranslate.value * 200 }],
    };
  });

  const baseColor = theme.backgroundSecondary;
  const highlightColor = theme.backgroundTertiary;

  const finalBorderRadius =
    variant === 'circular'
      ? typeof width === 'number'
        ? width / 2
        : 50
      : borderRadius;

  const finalHeight =
    variant === 'circular' ? width : variant === 'text' ? 16 : height;

  return (
    <View
      style={[
        styles.container,
        {
          width,
          height: finalHeight,
          borderRadius: finalBorderRadius,
          backgroundColor: baseColor,
          overflow: 'hidden',
        },
        style,
      ]}
      accessibilityRole="none"
      accessibilityLabel="Loading"
    >
      <Animated.View style={[styles.shimmer, shimmerStyle]}>
        <LinearGradient
          colors={[baseColor, highlightColor, highlightColor, baseColor]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          locations={[0, 0.4, 0.6, 1]}
          style={styles.gradient}
        />
      </Animated.View>
    </View>
  );
}

// Preset skeleton patterns
export function SkeletonText({ lines = 3, spacing = 8 }: { lines?: number; spacing?: number }) {
  return (
    <View style={{ gap: spacing }}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          variant="text"
          width={index === lines - 1 ? '70%' : '100%'}
        />
      ))}
    </View>
  );
}

export function SkeletonCard() {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.backgroundDefault,
          borderRadius: BorderRadius['2xl'],
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <Skeleton variant="circular" width={40} height={40} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Skeleton width="60%" height={16} style={{ marginBottom: 8 }} />
          <Skeleton width="40%" height={12} />
        </View>
      </View>
      <SkeletonText lines={2} spacing={8} />
    </View>
  );
}

export function SkeletonListItem() {
  return (
    <View style={styles.listItem}>
      <Skeleton variant="circular" width={48} height={48} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Skeleton width="70%" height={16} style={{ marginBottom: 6 }} />
        <Skeleton width="50%" height={12} />
      </View>
      <Skeleton width={60} height={32} borderRadius={16} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    left: -200,
    right: -200,
    bottom: 0,
  },
  gradient: {
    flex: 1,
  },
  card: {
    padding: 24,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
});

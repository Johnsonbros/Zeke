import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Spacing, BorderRadius, Typography } from '@/constants/theme';

export type BadgeVariant = 'default' | 'success' | 'error' | 'warning' | 'info';
export type BadgeSize = 'small' | 'medium' | 'large';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

export function Badge({
  children,
  variant = 'default',
  size = 'medium',
  style,
  accessibilityLabel,
}: BadgeProps) {
  const theme = useTheme();

  const getBackgroundColor = () => {
    switch (variant) {
      case 'success':
        return theme.success;
      case 'error':
        return theme.error;
      case 'warning':
        return theme.warning;
      case 'info':
        return theme.primary;
      default:
        return theme.backgroundSecondary;
    }
  };

  const getTextColor = () => {
    if (variant === 'default') {
      return theme.text;
    }
    return theme.buttonText;
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return {
          paddingHorizontal: Spacing.xs,
          paddingVertical: 2,
          fontSize: Typography.caption.fontSize - 2,
        };
      case 'large':
        return {
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.xs,
          fontSize: Typography.small.fontSize,
        };
      default:
        return {
          paddingHorizontal: Spacing.sm,
          paddingVertical: 4,
          fontSize: Typography.caption.fontSize,
        };
    }
  };

  const sizeStyles = getSizeStyles();

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: getBackgroundColor(),
          paddingHorizontal: sizeStyles.paddingHorizontal,
          paddingVertical: sizeStyles.paddingVertical,
        },
        style,
      ]}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel || (typeof children === 'string' ? children : undefined)}
    >
      <Text
        style={[
          styles.text,
          {
            color: getTextColor(),
            fontSize: sizeStyles.fontSize,
          },
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

export interface ChipProps {
  children: React.ReactNode;
  onPress?: () => void;
  onRemove?: () => void;
  variant?: BadgeVariant;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

export function Chip({
  children,
  onPress,
  onRemove,
  variant = 'default',
  style,
  accessibilityLabel,
}: ChipProps) {
  const theme = useTheme();

  const getBackgroundColor = () => {
    switch (variant) {
      case 'success':
        return `${theme.success}20`;
      case 'error':
        return `${theme.error}20`;
      case 'warning':
        return `${theme.warning}20`;
      case 'info':
        return `${theme.primary}20`;
      default:
        return theme.backgroundSecondary;
    }
  };

  const getTextColor = () => {
    switch (variant) {
      case 'success':
        return theme.success;
      case 'error':
        return theme.error;
      case 'warning':
        return theme.warning;
      case 'info':
        return theme.primary;
      default:
        return theme.text;
    }
  };

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: getBackgroundColor(),
        },
        style,
      ]}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={accessibilityLabel}
    >
      <Text
        style={[
          styles.chipText,
          {
            color: getTextColor(),
          },
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '600',
    textAlign: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  chipText: {
    fontSize: Typography.small.fontSize,
    fontWeight: '500',
  },
});

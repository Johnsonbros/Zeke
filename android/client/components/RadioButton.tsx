import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { Spacing, Typography } from '@/constants/theme';

export interface RadioButtonProps {
  selected: boolean;
  onSelect: () => void;
  label?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
}

export function RadioButton({
  selected,
  onSelect,
  label,
  disabled = false,
  accessibilityLabel,
}: RadioButtonProps) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const dotScale = useSharedValue(selected ? 1 : 0);
  const dotOpacity = useSharedValue(selected ? 1 : 0);

  React.useEffect(() => {
    dotScale.value = withSpring(selected ? 1 : 0, {
      damping: 15,
      stiffness: 200,
    });
    dotOpacity.value = withTiming(selected ? 1 : 0, { duration: 150 });
  }, [selected]);

  const handlePress = () => {
    if (disabled) return;
    onSelect();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const circleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
    transform: [{ scale: dotScale.value }],
  }));

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={() => {
        if (!disabled) {
          scale.value = withSpring(0.95, {
            damping: 15,
            stiffness: 200,
          });
        }
      }}
      onPressOut={() => {
        if (!disabled) {
          scale.value = withSpring(1, {
            damping: 15,
            stiffness: 200,
          });
        }
      }}
      style={[styles.container, disabled && styles.disabled]}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ checked: selected, disabled }}
    >
      <Animated.View
        style={[
          styles.circle,
          {
            borderColor: selected ? theme.primary : theme.border,
          },
          circleStyle,
        ]}
      >
        <Animated.View
          style={[
            styles.dot,
            { backgroundColor: theme.primary },
            dotStyle,
          ]}
        />
      </Animated.View>
      {label && (
        <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export interface RadioGroupProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { label: string; value: T }[];
  disabled?: boolean;
  accessibilityLabel?: string;
}

export function RadioGroup<T extends string>({
  value,
  onChange,
  options,
  disabled = false,
  accessibilityLabel,
}: RadioGroupProps<T>) {
  return (
    <View
      style={styles.group}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => (
        <RadioButton
          key={option.value}
          selected={value === option.value}
          onSelect={() => onChange(option.value)}
          label={option.label}
          disabled={disabled}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.xs,
  },
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  label: {
    marginLeft: Spacing.md,
    fontSize: Typography.body.fontSize,
  },
  disabled: {
    opacity: 0.5,
  },
  group: {
    gap: Spacing.sm,
  },
});

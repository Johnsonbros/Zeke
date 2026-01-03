import React from 'react';
import { Pressable, StyleSheet, View, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { Spacing, BorderRadius, Typography } from '@/constants/theme';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  error?: boolean;
  accessibilityLabel?: string;
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
  error = false,
  accessibilityLabel,
}: CheckboxProps) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const checkOpacity = useSharedValue(checked ? 1 : 0);
  const checkScale = useSharedValue(checked ? 1 : 0);

  React.useEffect(() => {
    checkOpacity.value = withTiming(checked ? 1 : 0, { duration: 150 });
    checkScale.value = withSpring(checked ? 1 : 0, {
      damping: 15,
      stiffness: 200,
    });
  }, [checked]);

  const handlePress = () => {
    if (disabled) return;

    onChange(!checked);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const checkStyle = useAnimatedStyle(() => ({
    opacity: checkOpacity.value,
    transform: [{ scale: checkScale.value }],
  }));

  const borderColor = error
    ? theme.error
    : checked
    ? theme.primary
    : theme.border;

  const backgroundColor = checked
    ? theme.primary
    : disabled
    ? theme.backgroundSecondary
    : 'transparent';

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
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ checked, disabled }}
    >
      <Animated.View
        style={[
          styles.box,
          {
            borderColor,
            backgroundColor,
          },
          boxStyle,
        ]}
      >
        <Animated.View style={checkStyle}>
          <Feather name="check" size={16} color={theme.buttonText} />
        </Animated.View>
      </Animated.View>
      {label && (
        <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.xs,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.xs / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginLeft: Spacing.md,
    fontSize: Typography.body.fontSize,
  },
  disabled: {
    opacity: 0.5,
  },
});

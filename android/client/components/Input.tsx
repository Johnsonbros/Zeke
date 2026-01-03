import React, { useState } from 'react';
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  Pressable,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { Spacing, BorderRadius, Typography } from '@/constants/theme';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: keyof typeof Feather.glyphMap;
  rightIcon?: keyof typeof Feather.glyphMap;
  onRightIconPress?: () => void;
  containerStyle?: ViewStyle;
  showCharacterCount?: boolean;
  maxLength?: number;
  required?: boolean;
}

export function Input({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  onRightIconPress,
  containerStyle,
  showCharacterCount = false,
  maxLength,
  required = false,
  value,
  editable = true,
  ...props
}: InputProps) {
  const theme = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const focusAnim = useSharedValue(0);
  const errorAnim = useSharedValue(0);

  React.useEffect(() => {
    focusAnim.value = withSpring(isFocused ? 1 : 0, {
      damping: 15,
      stiffness: 150,
    });
  }, [isFocused]);

  React.useEffect(() => {
    if (error) {
      errorAnim.value = withTiming(1, { duration: 200 });
    } else {
      errorAnim.value = withTiming(0, { duration: 200 });
    }
  }, [error]);

  const borderStyle = useAnimatedStyle(() => {
    const borderColor = error
      ? theme.error
      : focusAnim.value > 0
      ? theme.primary
      : theme.border;

    return {
      borderColor,
      borderWidth: focusAnim.value > 0.5 || error ? 2 : 1,
    };
  });

  const errorStyle = useAnimatedStyle(() => {
    return {
      opacity: errorAnim.value,
      transform: [{ translateY: errorAnim.value * -2 }],
    };
  });

  const hasError = !!error;
  const showHelper = helperText && !hasError;
  const characterCount = value?.length || 0;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <View style={styles.labelContainer}>
          <Text
            style={[styles.label, { color: theme.text }]}
            accessibilityRole="text"
          >
            {label}
            {required && <Text style={[styles.required, { color: theme.error }]}> *</Text>}
          </Text>
        </View>
      )}

      <Animated.View
        style={[
          styles.inputContainer,
          { backgroundColor: theme.backgroundSecondary },
          borderStyle,
          !editable && styles.disabled,
        ]}
      >
        {leftIcon && (
          <View style={styles.leftIconContainer}>
            <Feather
              name={leftIcon}
              size={20}
              color={hasError ? theme.error : isFocused ? theme.primary : theme.textSecondary}
            />
          </View>
        )}

        <TextInput
          {...props}
          value={value}
          maxLength={maxLength}
          editable={editable}
          style={[
            styles.input,
            {
              color: theme.text,
              paddingLeft: leftIcon ? Spacing.xs : Spacing.lg,
              paddingRight: rightIcon ? Spacing.xs : Spacing.lg,
            },
          ]}
          placeholderTextColor={theme.textSecondary}
          onFocus={(e) => {
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
          accessibilityLabel={label || props.placeholder}
          accessibilityHint={helperText}
          accessibilityState={{
            disabled: !editable,
          }}
          accessibilityRequired={required}
          accessibilityInvalid={hasError}
        />

        {rightIcon && (
          <Pressable
            onPress={onRightIconPress}
            style={styles.rightIconContainer}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={onRightIconPress ? 'Action button' : undefined}
          >
            <Feather
              name={rightIcon}
              size={20}
              color={hasError ? theme.error : isFocused ? theme.primary : theme.textSecondary}
            />
          </Pressable>
        )}
      </Animated.View>

      {hasError && (
        <Animated.View style={[styles.helperContainer, errorStyle]}>
          <Feather name="alert-circle" size={14} color={theme.error} />
          <Text
            style={[styles.helperText, { color: theme.error }]}
            accessibilityRole="alert"
            accessibilityLive="polite"
          >
            {error}
          </Text>
        </Animated.View>
      )}

      {showHelper && (
        <View style={styles.helperContainer}>
          <Text
            style={[styles.helperText, { color: theme.textSecondary }]}
            accessibilityRole="text"
          >
            {helperText}
          </Text>
        </View>
      )}

      {showCharacterCount && maxLength && (
        <View style={styles.characterCountContainer}>
          <Text
            style={[
              styles.characterCount,
              {
                color: characterCount > maxLength ? theme.error : theme.textSecondary,
              },
            ]}
            accessibilityLabel={`${characterCount} of ${maxLength} characters`}
          >
            {characterCount}/{maxLength}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  labelContainer: {
    marginBottom: Spacing.sm,
  },
  label: {
    fontSize: Typography.small.fontSize,
    fontWeight: '600',
  },
  required: {
    fontSize: Typography.small.fontSize,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
    height: Spacing.inputHeight,
    borderWidth: 1,
  },
  disabled: {
    opacity: 0.5,
  },
  input: {
    flex: 1,
    fontSize: Typography.body.fontSize,
    height: '100%',
  },
  leftIconContainer: {
    paddingLeft: Spacing.lg,
    justifyContent: 'center',
  },
  rightIconContainer: {
    paddingRight: Spacing.lg,
    justifyContent: 'center',
  },
  helperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
    gap: Spacing.xs,
  },
  helperText: {
    fontSize: Typography.caption.fontSize,
  },
  characterCountContainer: {
    alignItems: 'flex-end',
    marginTop: Spacing.xs,
  },
  characterCount: {
    fontSize: Typography.caption.fontSize,
  },
});

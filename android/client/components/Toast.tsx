import React, { createContext, useContext, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { Spacing, BorderRadius, Typography } from '@/constants/theme';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  type?: ToastType;
  duration?: number;
  action?: {
    label: string;
    onPress: () => void;
  };
}

interface ToastData {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
  action?: {
    label: string;
    onPress: () => void;
  };
}

interface ToastContextValue {
  show: (message: string, options?: ToastOptions) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const show = useCallback((message: string, options: ToastOptions = {}) => {
    const { type = 'info', duration = 3000, action } = options;

    const id = `toast-${Date.now()}-${Math.random()}`;
    const toast: ToastData = { id, message, type, duration, action };

    setToasts((prev) => [...prev, toast]);

    // Haptic feedback based on type
    if (type === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (type === 'error') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else if (type === 'warning') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    // Auto dismiss
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const success = useCallback(
    (message: string, duration?: number) => {
      show(message, { type: 'success', duration });
    },
    [show]
  );

  const error = useCallback(
    (message: string, duration?: number) => {
      show(message, { type: 'error', duration });
    },
    [show]
  );

  const warning = useCallback(
    (message: string, duration?: number) => {
      show(message, { type: 'warning', duration });
    },
    [show]
  );

  const info = useCallback(
    (message: string, duration?: number) => {
      show(message, { type: 'info', duration });
    },
    [show]
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ show, success, error, warning, info }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

interface ToastContainerProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          top: insets.top + Spacing.lg,
        },
      ]}
      pointerEvents="box-none"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </View>
  );
}

interface ToastItemProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const theme = useTheme();
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);

  React.useEffect(() => {
    translateY.value = withSpring(0, {
      damping: 15,
      stiffness: 150,
    });
    opacity.value = withTiming(1, { duration: 200 });
  }, []);

  const dismiss = useCallback(() => {
    translateY.value = withTiming(-100, { duration: 200 });
    opacity.value = withTiming(0, { duration: 200 }, () => {
      runOnJS(onDismiss)(toast.id);
    });
  }, [toast.id, onDismiss]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
      opacity: opacity.value,
    };
  });

  const getIconName = (): keyof typeof Feather.glyphMap => {
    switch (toast.type) {
      case 'success':
        return 'check-circle';
      case 'error':
        return 'alert-circle';
      case 'warning':
        return 'alert-triangle';
      case 'info':
        return 'info';
    }
  };

  const getIconColor = () => {
    switch (toast.type) {
      case 'success':
        return theme.success;
      case 'error':
        return theme.error;
      case 'warning':
        return theme.warning;
      case 'info':
        return theme.primary;
    }
  };

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          backgroundColor: theme.backgroundSecondary,
          borderColor: getIconColor(),
        },
        animatedStyle,
      ]}
      accessibilityRole="alert"
      accessibilityLive="polite"
      accessibilityLabel={`${toast.type} notification: ${toast.message}`}
    >
      <View style={styles.iconContainer}>
        <Feather name={getIconName()} size={20} color={getIconColor()} />
      </View>

      <Text
        style={[styles.message, { color: theme.text }]}
        numberOfLines={2}
      >
        {toast.message}
      </Text>

      {toast.action && (
        <Pressable
          onPress={() => {
            toast.action?.onPress();
            dismiss();
          }}
          style={({ pressed }) => [
            styles.actionButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={toast.action.label}
        >
          <Text style={[styles.actionText, { color: getIconColor() }]}>
            {toast.action.label}
          </Text>
        </Pressable>
      )}

      <Pressable
        onPress={dismiss}
        style={({ pressed }) => [
          styles.closeButton,
          { opacity: pressed ? 0.7 : 1 },
        ]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Dismiss notification"
      >
        <Feather name="x" size={18} color={theme.textSecondary} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 9999,
    ...Platform.select({
      web: {
        position: 'fixed' as any,
      },
    }),
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  iconContainer: {
    marginRight: Spacing.md,
  },
  message: {
    flex: 1,
    fontSize: Typography.body.fontSize,
    fontWeight: '500',
  },
  actionButton: {
    marginLeft: Spacing.md,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  actionText: {
    fontSize: Typography.small.fontSize,
    fontWeight: '600',
  },
  closeButton: {
    marginLeft: Spacing.sm,
    padding: Spacing.xs,
  },
});

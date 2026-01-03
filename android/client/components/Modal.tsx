import React, { useEffect } from 'react';
import {
  View,
  Text,
  Modal as RNModal,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/hooks/useTheme';
import { Spacing, BorderRadius, Typography } from '@/constants/theme';

export interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'small' | 'medium' | 'large' | 'fullscreen';
  showCloseButton?: boolean;
  accessibilityLabel?: string;
}

export function Modal({
  visible,
  onClose,
  title,
  children,
  footer,
  size = 'medium',
  showCloseButton = true,
  accessibilityLabel,
}: ModalProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const backdropOpacity = useSharedValue(0);
  const modalTranslateY = useSharedValue(100);
  const modalOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: 200 });
      modalTranslateY.value = withSpring(0, {
        damping: 20,
        stiffness: 150,
      });
      modalOpacity.value = withTiming(1, { duration: 200 });
    } else {
      backdropOpacity.value = withTiming(0, { duration: 200 });
      modalTranslateY.value = withTiming(100, { duration: 200 });
      modalOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const modalStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: modalTranslateY.value }],
    opacity: modalOpacity.value,
  }));

  const getMaxWidth = () => {
    switch (size) {
      case 'small':
        return 400;
      case 'large':
        return 800;
      case 'fullscreen':
        return '100%';
      default:
        return 600;
    }
  };

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      accessibilityViewIsModal
      accessibilityLabel={accessibilityLabel || title}
    >
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={20} style={StyleSheet.absoluteFill} />
          ) : (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: 'rgba(0, 0, 0, 0.7)' },
              ]}
            />
          )}
        </Animated.View>

        <Pressable style={styles.backdropTouchable} onPress={onClose} />

        <Animated.View
          style={[
            styles.modalContainer,
            {
              maxWidth: getMaxWidth(),
              paddingTop: size === 'fullscreen' ? insets.top : Spacing.xl,
              paddingBottom: size === 'fullscreen' ? insets.bottom : Spacing.xl,
            },
            modalStyle,
          ]}
        >
          <View
            style={[
              styles.modal,
              {
                backgroundColor: theme.backgroundDefault,
                height: size === 'fullscreen' ? '100%' : undefined,
              },
            ]}
          >
            {(title || showCloseButton) && (
              <View style={styles.header}>
                {title && (
                  <Text
                    style={[styles.title, { color: theme.text }]}
                    accessibilityRole="header"
                  >
                    {title}
                  </Text>
                )}
                {showCloseButton && (
                  <Pressable
                    onPress={onClose}
                    style={({ pressed }) => [
                      styles.closeButton,
                      { opacity: pressed ? 0.7 : 1 },
                    ]}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Close modal"
                  >
                    <Feather name="x" size={24} color={theme.text} />
                  </Pressable>
                )}
              </View>
            )}

            <ScrollView
              style={styles.content}
              contentContainerStyle={styles.contentContainer}
              showsVerticalScrollIndicator={true}
            >
              {children}
            </ScrollView>

            {footer && (
              <View
                style={[
                  styles.footer,
                  { borderTopColor: theme.border },
                ]}
              >
                {footer}
              </View>
            )}
          </View>
        </Animated.View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropTouchable: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    width: '90%',
    maxHeight: '90%',
    zIndex: 1,
  },
  modal: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  title: {
    fontSize: Typography.h3.fontSize,
    fontWeight: Typography.h3.fontWeight,
    flex: 1,
  },
  closeButton: {
    padding: Spacing.xs,
    marginLeft: Spacing.md,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  footer: {
    padding: Spacing.xl,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
  },
});

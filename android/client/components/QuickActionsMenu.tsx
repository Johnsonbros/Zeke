import React, { useState, useCallback, useRef } from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withDelay,
  withTiming,
  interpolate,
  Extrapolation,
  SharedValue,
  Easing,
} from "react-native-reanimated";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Gradients } from "@/constants/theme";

const SPRING_CONFIG = {
  damping: 12,
  stiffness: 120,
  mass: 0.8,
};

const SPRING_CONFIG_BOUNCY = {
  damping: 10,
  stiffness: 100,
  mass: 0.6,
};

const SPRING_CONFIG_SNAPPY = {
  damping: 14,
  stiffness: 180,
  mass: 0.5,
};

const FAB_SIZE = 60;
const ACTION_BUTTON_SIZE = 56;
const ARC_RADIUS = 130;
const STAGGER_DELAY = 50;

export interface QuickAction {
  id: string;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  gradientColors: readonly [string, string];
  onPress: () => void;
}

interface QuickActionsMenuProps {
  actions: QuickAction[];
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function QuickActionsMenu({ actions }: QuickActionsMenuProps) {
  const { theme } = useTheme();
  const tabBarHeight = useBottomTabBarHeight();
  const [isOpen, setIsOpen] = useState(false);
  const fabScale = useSharedValue(1);
  const fabRotation = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);

  const actionAnimationsRef = useRef<SharedValue<number>[]>([]);
  if (actionAnimationsRef.current.length !== actions.length) {
    actionAnimationsRef.current = actions.map(() => useSharedValue(0));
  }
  const actionAnimations = actionAnimationsRef.current;

  const fabBottomPosition = tabBarHeight + Spacing.sm;
  const fabRightPosition = Spacing.lg;
  const menuCentered = true;

  const handleToggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isOpen) {
      actions.forEach((_, index) => {
        const reverseIndex = actions.length - 1 - index;
        actionAnimations[index].value = withDelay(
          reverseIndex * STAGGER_DELAY,
          withSpring(0, SPRING_CONFIG_SNAPPY)
        );
      });
      backdropOpacity.value = withTiming(0, { duration: 250 });
      fabRotation.value = withSpring(0, SPRING_CONFIG);
      fabScale.value = withSpring(1, SPRING_CONFIG_BOUNCY);
      setTimeout(() => setIsOpen(false), 300);
    } else {
      setIsOpen(true);
      actions.forEach((_, index) => {
        actionAnimations[index].value = withDelay(
          index * STAGGER_DELAY,
          withSpring(1, SPRING_CONFIG_BOUNCY)
        );
      });
      backdropOpacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
      fabRotation.value = withSpring(135, SPRING_CONFIG_BOUNCY);
      fabScale.value = withSpring(0.9, SPRING_CONFIG_BOUNCY);
    }
  }, [isOpen, actions, actionAnimations, backdropOpacity, fabRotation, fabScale]);

  const handleActionPress = useCallback(
    (action: QuickAction) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      actions.forEach((_, index) => {
        const reverseIndex = actions.length - 1 - index;
        actionAnimations[index].value = withDelay(
          reverseIndex * (STAGGER_DELAY / 2),
          withSpring(0, { ...SPRING_CONFIG, stiffness: 200 })
        );
      });
      backdropOpacity.value = withTiming(0, { duration: 200 });
      fabRotation.value = withSpring(0, SPRING_CONFIG);
      fabScale.value = withSpring(1, SPRING_CONFIG_BOUNCY);
      setTimeout(() => {
        setIsOpen(false);
        action.onPress();
      }, 200);
    },
    [actions, actionAnimations, backdropOpacity, fabRotation, fabScale],
  );

  const fabAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: fabScale.value },
      { rotate: `${fabRotation.value}deg` },
    ],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const calculateArcPosition = (index: number, total: number) => {
    const spreadAngle = Math.PI * 0.85;
    const centerAngle = -Math.PI / 2;
    const startAngle = centerAngle - spreadAngle / 2;
    const endAngle = centerAngle + spreadAngle / 2;
    const angleRange = endAngle - startAngle;
    const angleStep = total > 1 ? angleRange / (total - 1) : 0;
    const angle = total === 1 ? centerAngle : startAngle + angleStep * index;
    
    return {
      x: Math.cos(angle) * ARC_RADIUS,
      y: Math.sin(angle) * ARC_RADIUS,
    };
  };

  const blurLayer1Style = useAnimatedStyle(() => ({
    opacity: interpolate(
      backdropOpacity.value,
      [0, 0.4, 1],
      [0, 1, 0],
      Extrapolation.CLAMP
    ),
  }));

  const blurLayer2Style = useAnimatedStyle(() => ({
    opacity: interpolate(
      backdropOpacity.value,
      [0.3, 0.7, 1],
      [0, 1, 0],
      Extrapolation.CLAMP
    ),
  }));

  const blurLayer3Style = useAnimatedStyle(() => ({
    opacity: interpolate(
      backdropOpacity.value,
      [0.5, 1],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  return (
    <>
      {isOpen ? (
        <Animated.View
          style={[styles.backdrop, backdropAnimatedStyle]}
        >
          <Animated.View style={[StyleSheet.absoluteFill, blurLayer1Style]}>
            <BlurView
              intensity={Platform.OS === 'web' ? 8 : 15}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, blurLayer2Style]}>
            <BlurView
              intensity={Platform.OS === 'web' ? 16 : 30}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, blurLayer3Style]}>
            <BlurView
              intensity={Platform.OS === 'web' ? 25 : 50}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <Animated.View 
            style={[
              StyleSheet.absoluteFill, 
              { backgroundColor: 'rgba(0,0,0,0.2)' },
            ]} 
          />
          <Pressable style={StyleSheet.absoluteFill} onPress={handleToggle} />
        </Animated.View>
      ) : null}

      {actions.map((action, index) => {
        const position = calculateArcPosition(index, actions.length);
        const rotationOffset = actions.length <= 1 
          ? 0 
          : interpolate(
              index,
              [0, actions.length - 1],
              [-25, 25],
              Extrapolation.CLAMP
            );
        return (
          <RadialActionButton
            key={action.id}
            action={action}
            onPress={() => handleActionPress(action)}
            index={index}
            totalActions={actions.length}
            animationProgress={actionAnimations[index]}
            menuCentered={menuCentered}
            targetX={position.x}
            targetY={position.y}
            rotationOffset={rotationOffset}
            isOpen={isOpen}
          />
        );
      })}

      <AnimatedPressable
        onPress={handleToggle}
        style={[
          styles.fab,
          {
            bottom: fabBottomPosition,
            right: fabRightPosition,
          },
          fabAnimatedStyle,
        ]}
      >
        <LinearGradient
          colors={Gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Feather name="plus" size={28} color="#FFFFFF" />
        </LinearGradient>
      </AnimatedPressable>
    </>
  );
}

interface RadialActionButtonProps {
  action: QuickAction;
  onPress: () => void;
  index: number;
  totalActions: number;
  animationProgress: SharedValue<number>;
  menuCentered: boolean;
  targetX: number;
  targetY: number;
  rotationOffset: number;
  isOpen: boolean;
}

function RadialActionButton({
  action,
  onPress,
  index,
  totalActions,
  animationProgress,
  menuCentered,
  targetX,
  targetY,
  rotationOffset,
  isOpen,
}: RadialActionButtonProps) {
  const { theme } = useTheme();
  
  const animatedStyle = useAnimatedStyle(() => {
    const progress = animationProgress.value;
    
    const overshootX = targetX * 1.08;
    const overshootY = targetY * 1.08;
    
    const translateX = interpolate(
      progress,
      [0, 0.7, 1],
      [0, overshootX, targetX],
      Extrapolation.CLAMP
    );
    
    const translateY = interpolate(
      progress,
      [0, 0.7, 1],
      [0, overshootY, targetY],
      Extrapolation.CLAMP
    );
    
    const scale = interpolate(
      progress,
      [0, 0.4, 0.85, 1],
      [0.2, 0.7, 1.12, 1],
      Extrapolation.CLAMP
    );
    
    const opacity = interpolate(
      progress,
      [0, 0.25, 1],
      [0, 0.9, 1],
      Extrapolation.CLAMP
    );
    
    const rotation = interpolate(
      progress,
      [0, 0.6, 1],
      [-60 + rotationOffset, rotationOffset * 0.5, 0],
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [
        { translateX },
        { translateY },
        { scale },
        { rotate: `${rotation}deg` },
      ],
    };
  });

  const labelAnimatedStyle = useAnimatedStyle(() => {
    const progress = animationProgress.value;
    
    const opacity = interpolate(
      progress,
      [0.6, 1],
      [0, 1],
      Extrapolation.CLAMP
    );
    
    const translateY = interpolate(
      progress,
      [0.6, 1],
      [8, 0],
      Extrapolation.CLAMP
    );
    
    const scale = interpolate(
      progress,
      [0.6, 1],
      [0.8, 1],
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [{ translateY }, { scale }],
    };
  });

  return (
    <Animated.View
      style={[
        styles.radialActionContainer,
        menuCentered ? styles.radialActionCentered : null,
        animatedStyle,
      ]}
      pointerEvents={isOpen ? "auto" : "none"}
    >
      <Pressable onPress={onPress} style={styles.radialActionPressable}>
        <View style={[styles.actionButtonShadow, Platform.OS !== "web" ? { shadowColor: action.gradientColors[0] } : null]}>
          <LinearGradient
            colors={action.gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.radialActionGradient}
          >
            <Feather name={action.icon} size={24} color="#FFFFFF" />
          </LinearGradient>
        </View>
        <Animated.View style={labelAnimatedStyle}>
          <View style={[styles.labelContainer, { backgroundColor: theme.backgroundDefault }]}>
            <ThemedText type="caption" style={styles.actionLabel} numberOfLines={1}>
              {action.label}
            </ThemedText>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 998,
  },
  fab: {
    position: "absolute",
    zIndex: 1000,
    elevation: 12,
    ...Platform.select({
      web: {
        boxShadow: "0px 6px 20px rgba(0, 0, 0, 0.35)",
      },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
    }),
  },
  fabCentered: {
    left: "50%",
    marginLeft: -FAB_SIZE / 2,
  },
  fabGradient: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    justifyContent: "center",
    alignItems: "center",
  },
  radialActionContainer: {
    position: "absolute",
    zIndex: 999,
    alignItems: "center",
  },
  radialActionCentered: {
    left: "50%",
    top: "50%",
    marginLeft: -ACTION_BUTTON_SIZE / 2,
    marginTop: -ACTION_BUTTON_SIZE / 2,
  },
  radialActionPressable: {
    alignItems: "center",
  },
  actionButtonShadow: {
    elevation: 8,
    borderRadius: ACTION_BUTTON_SIZE / 2,
    ...Platform.select({
      web: {
        boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.4)",
      },
      default: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
    }),
  },
  radialActionGradient: {
    width: ACTION_BUTTON_SIZE,
    height: ACTION_BUTTON_SIZE,
    borderRadius: ACTION_BUTTON_SIZE / 2,
    justifyContent: "center",
    alignItems: "center",
  },
  labelContainer: {
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs / 2,
    borderRadius: BorderRadius.sm,
  },
  actionLabel: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: "500",
  },
});

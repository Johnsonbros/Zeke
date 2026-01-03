import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Pressable,
  StyleSheet,
  Dimensions,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius } from "@/constants/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const CUBE_SIZE_COLLAPSED = 56;
const CUBE_SIZE_EXPANDED = Math.min(SCREEN_WIDTH * 0.7, 280);

const SPRING_CONFIG = {
  damping: 20,
  stiffness: 160,
  mass: 0.8,
};

export interface CubeAction {
  id: string;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  gradientColors: readonly [string, string];
  onPress: () => void;
}

interface ZekeCubeProps {
  actions: CubeAction[];
  onZekePress?: () => void;
}

const GRADIENT_COLORS: readonly [string, string] = ["#6366F1", "#8B5CF6"];

export function ZekeCube({ actions, onZekePress }: ZekeCubeProps) {
  const insets = useSafeAreaInsets();
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentFace, setCurrentFace] = useState(0);

  const actionsPerFace = 2;
  const totalFaces = Math.ceil(actions.length / actionsPerFace) + 1;

  const cubeSize = useSharedValue(CUBE_SIZE_COLLAPSED);
  const backdropOpacity = useSharedValue(0);
  const rotationY = useSharedValue(0);
  const scale = useSharedValue(1);

  const handleExpand = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsExpanded(true);
    cubeSize.value = withSpring(CUBE_SIZE_EXPANDED, SPRING_CONFIG);
    backdropOpacity.value = withTiming(1, { duration: 250 });
  }, [cubeSize, backdropOpacity]);

  const handleCollapse = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    cubeSize.value = withSpring(CUBE_SIZE_COLLAPSED, SPRING_CONFIG);
    backdropOpacity.value = withTiming(0, { duration: 200 });
    rotationY.value = withSpring(0, SPRING_CONFIG);
    setTimeout(() => {
      setIsExpanded(false);
      setCurrentFace(0);
    }, 200);
  }, [cubeSize, backdropOpacity, rotationY]);

  const handleActionPress = useCallback((action: CubeAction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    handleCollapse();
    setTimeout(() => action.onPress(), 250);
  }, [handleCollapse]);

  const handleZekePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    handleCollapse();
    if (onZekePress) {
      setTimeout(() => onZekePress(), 250);
    }
  }, [handleCollapse, onZekePress]);

  const nextFace = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentFace((prev) => (prev + 1) % totalFaces);
    rotationY.value = withSpring(0, SPRING_CONFIG);
  }, [totalFaces, rotationY]);

  const prevFace = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentFace((prev) => (prev - 1 + totalFaces) % totalFaces);
    rotationY.value = withSpring(0, SPRING_CONFIG);
  }, [totalFaces, rotationY]);

  const tapGesture = Gesture.Tap().onEnd(() => {
    if (!isExpanded) {
      runOnJS(handleExpand)();
    }
  });

  const panGesture = Gesture.Pan()
    .enabled(isExpanded)
    .onUpdate((event) => {
      rotationY.value = event.translationX * 0.12;
    })
    .onEnd((event) => {
      if (event.translationX > 60) {
        runOnJS(prevFace)();
      } else if (event.translationX < -60) {
        runOnJS(nextFace)();
      } else {
        rotationY.value = withSpring(0, SPRING_CONFIG);
      }
    });

  const composedGesture = Gesture.Race(panGesture, tapGesture);

  const cubeStyle = useAnimatedStyle(() => ({
    width: cubeSize.value,
    height: cubeSize.value,
    borderRadius: interpolate(
      cubeSize.value,
      [CUBE_SIZE_COLLAPSED, CUBE_SIZE_EXPANDED],
      [16, 24],
      Extrapolation.CLAMP
    ),
    transform: [
      { perspective: 800 },
      { rotateY: `${rotationY.value}deg` },
      { scale: scale.value },
    ],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const faceActions = useMemo(() => {
    if (currentFace === 0) return null;
    return actions.slice((currentFace - 1) * actionsPerFace, currentFace * actionsPerFace);
  }, [currentFace, actions, actionsPerFace]);

  return (
    <>
      {isExpanded ? (
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <BlurView
            intensity={Platform.OS === "web" ? 20 : 40}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.backdropOverlay} />
          <Pressable style={StyleSheet.absoluteFill} onPress={handleCollapse} />
        </Animated.View>
      ) : null}

      <View
        style={[
          styles.cubeWrapper,
          isExpanded ? styles.cubeWrapperExpanded : styles.cubeWrapperCollapsed,
          !isExpanded && {
            bottom: insets.bottom + 90,
            right: Spacing.lg,
          },
        ]}
      >
        <View style={[styles.glow, { 
          width: isExpanded ? CUBE_SIZE_EXPANDED + 30 : CUBE_SIZE_COLLAPSED + 16,
          height: isExpanded ? CUBE_SIZE_EXPANDED + 30 : CUBE_SIZE_COLLAPSED + 16,
          borderRadius: isExpanded ? 28 : 20,
        }]} />

        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[styles.cube, cubeStyle]}>
            <LinearGradient
              colors={GRADIENT_COLORS}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cubeGradient}
            >
              <View style={styles.glassShine} />

              {currentFace === 0 ? (
                <Pressable style={styles.zekeFace} onPress={handleZekePress}>
                  <View style={[styles.zekeIcon, { 
                    width: isExpanded ? 64 : 32,
                    height: isExpanded ? 64 : 32,
                    borderRadius: isExpanded ? 32 : 16,
                  }]}>
                    <Feather name="zap" size={isExpanded ? 32 : 18} color="#FFFFFF" />
                  </View>
                  {isExpanded ? (
                    <ThemedText style={styles.zekeLabel}>ZEKE</ThemedText>
                  ) : null}
                </Pressable>
              ) : (
                <View style={styles.actionFace}>
                  {faceActions?.map((action) => (
                    <Pressable
                      key={action.id}
                      style={({ pressed }) => [
                        styles.actionButton,
                        pressed && styles.actionButtonPressed,
                      ]}
                      onPress={() => handleActionPress(action)}
                    >
                      <View style={styles.actionIcon}>
                        <Feather name={action.icon} size={isExpanded ? 24 : 16} color="#FFFFFF" />
                      </View>
                      {isExpanded ? (
                        <ThemedText style={styles.actionLabel}>{action.label}</ThemedText>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              )}
            </LinearGradient>
          </Animated.View>
        </GestureDetector>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 998,
  },
  backdropOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  cubeWrapper: {
    position: "absolute",
    zIndex: 1000,
    alignItems: "center",
    justifyContent: "center",
  },
  cubeWrapperCollapsed: {},
  cubeWrapperExpanded: {
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  glow: {
    position: "absolute",
    backgroundColor: "rgba(99, 102, 241, 0.25)",
  },
  cube: {
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0px 8px 32px rgba(99, 102, 241, 0.35)",
      },
      default: {
        shadowColor: "#6366F1",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 12,
      },
    }),
  },
  cubeGradient: {
    flex: 1,
    padding: Spacing.md,
  },
  glassShine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  zekeFace: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  zekeIcon: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  zekeLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 3,
  },
  actionFace: {
    flex: 1,
    justifyContent: "center",
    gap: Spacing.lg,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  actionButtonPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});

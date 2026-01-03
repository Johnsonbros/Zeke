import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  interpolate,
  Extrapolation,
  SharedValue,
  runOnJS,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors, Gradients } from "@/constants/theme";
import {
  AnchorPosition,
  calculateDiamondPositions,
  getClampedMenuSize,
  getCenteredMenuPositionStyle,
  getIconAnchorStyle,
  getSnapPoints,
  findClosestSnapPoint,
  RingPosition,
} from "@/lib/launcher-layout";
import { LauncherSkin, DEFAULT_SKIN, getSkin } from "@/lib/launcher-skins";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const ORDER_STORAGE_KEY = "@zeke_launcher_order";
const ANCHOR_STORAGE_KEY = "@zeke_launcher_anchor";
const SKIN_STORAGE_KEY = "@zeke_launcher_skin";
const ALLOWED_ANCHORS: AnchorPosition[] = [
  "bottom-left",
  "bottom-center",
  "bottom-right",
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-right",
];

const DRAG_ACTIVATION_DURATION = 350;
const DRAG_HINT_DURATION = 2400;

export interface LauncherItem {
  id: string;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  gradientColors: readonly [string, string];
  onPress: () => void;
}

interface ZekeLauncherProps {
  items: LauncherItem[];
  skinId?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface TriggerButtonProps {
  onPress: () => void;
  onLongPress: () => void;
  isOpen: boolean;
  pulseAnim: SharedValue<number>;
  glowAnim: SharedValue<number>;
  anchor: AnchorPosition;
  skin: LauncherSkin;
  isDraggable: boolean;
  onDragEnd: (newAnchor: AnchorPosition) => void;
}

function TriggerButton({
  onPress,
  onLongPress,
  isOpen,
  pulseAnim,
  glowAnim,
  anchor,
  skin,
  isDraggable,
  onDragEnd,
}: TriggerButtonProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [showDragHint, setShowDragHint] = useState(true);
  const handleX = useSharedValue(0);
  const handleY = useSharedValue(0);
  const dragStartX = useSharedValue(0);
  const dragStartY = useSharedValue(0);
  const dragScale = useSharedValue(1);
  const hasPositioned = useRef(false);

  useEffect(() => {
    if (!isDraggable) {
      setShowDragHint(false);
      return;
    }

    setShowDragHint(true);
    const hintTimeout = setTimeout(() => setShowDragHint(false), DRAG_HINT_DURATION);
    return () => clearTimeout(hintTimeout);
  }, [isDraggable, anchor]);

  const updateHandlePosition = useCallback(
    (targetAnchor: AnchorPosition, animated: boolean = true) => {
      const snapPoints = getSnapPoints(
        SCREEN_WIDTH,
        SCREEN_HEIGHT,
        skin.trigger.size,
        insets,
        skin.layout.padding,
      );
      const target = snapPoints.find((point) => point.anchor === targetAnchor) ?? snapPoints[0];

      const config = { duration: 200, easing: Easing.out(Easing.cubic) } as const;
      if (animated) {
        handleX.value = withTiming(target.x, config);
        handleY.value = withTiming(target.y, config);
      } else {
        handleX.value = target.x;
        handleY.value = target.y;
      }
    },
    [handleX, handleY, insets, skin],
  );

  useEffect(() => {
    updateHandlePosition(anchor, hasPositioned.current);
    hasPositioned.current = true;
  }, [anchor, updateHandlePosition]);

  const triggerAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulseAnim.value, [0, 1], [1, 1.05]) * dragScale.value;
    const rotate = isOpen ? 45 : 0;
    return {
      transform: [
        { scale },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    left: handleX.value - skin.trigger.size / 2,
    top: handleY.value - skin.trigger.size / 2,
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(glowAnim.value, [0, 1], [0.3, 0.8]);
    const scale = interpolate(glowAnim.value, [0, 1], [1, 1.3]);
    return {
      opacity,
      transform: [
        { scale },
      ],
    };
  });

  const innerGlowStyle = useAnimatedStyle(() => {
    const opacity = interpolate(glowAnim.value, [0, 1], [0.5, 1]);
    return { opacity };
  });

  const auraStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulseAnim.value, [0, 1], [0.94, 1.12]) * dragScale.value;
    const opacity = interpolate(glowAnim.value, [0, 1], [0.25, 0.5]);
    return {
      opacity: isOpen ? 0.2 : opacity,
      transform: [{ scale }],
    };
  });

  const labelStyle = useAnimatedStyle(() => {
    const translateY = interpolate(pulseAnim.value, [0, 1], [2, 0]);
    const opacity = isOpen ? 0 : interpolate(glowAnim.value, [0, 1], [0.5, 1]);

    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  const longPressGesture = Gesture.LongPress()
    .minDuration(DRAG_ACTIVATION_DURATION)
    .onStart(() => {
      if (isDraggable) {
        dragScale.value = withSpring(1.15);
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Heavy);
        runOnJS(onLongPress)();
        runOnJS(setShowDragHint)(false);
      }
    });

  const panGesture = Gesture.Pan()
    .enabled(isDraggable && !isOpen)
    .activateAfterLongPress(DRAG_ACTIVATION_DURATION)
    .onStart(() => {
      dragStartX.value = handleX.value;
      dragStartY.value = handleY.value;
    })
    .onUpdate((event) => {
      const snapPoints = getSnapPoints(
        SCREEN_WIDTH,
        SCREEN_HEIGHT,
        skin.trigger.size,
        insets,
        skin.layout.padding,
      );

      const halfSize = skin.trigger.size / 2;
      const minX = insets.left + skin.layout.padding + halfSize;
      const maxX = SCREEN_WIDTH - insets.right - skin.layout.padding - halfSize;
      const minY = insets.top + skin.layout.padding + halfSize;
      const maxY = SCREEN_HEIGHT - insets.bottom - skin.layout.padding - halfSize;

      let desiredX = dragStartX.value + event.translationX;
      let desiredY = dragStartY.value + event.translationY;
      desiredX = Math.min(Math.max(desiredX, minX), maxX);
      desiredY = Math.min(Math.max(desiredY, minY), maxY);

      const candidate = findClosestSnapPoint(desiredX, desiredY, snapPoints);
      const distance = Math.hypot(desiredX - candidate.x, desiredY - candidate.y);
      const magneticRadius = skin.trigger.size * 1.4;

      if (distance <= magneticRadius) {
        desiredX = candidate.x;
        desiredY = candidate.y;
      }

      handleX.value = desiredX;
      handleY.value = desiredY;
    })
    .onEnd(() => {
      const snapPoints = getSnapPoints(
        SCREEN_WIDTH,
        SCREEN_HEIGHT,
        skin.trigger.size,
        insets,
        skin.layout.padding,
      );
      const closest = findClosestSnapPoint(handleX.value, handleY.value, snapPoints);

      dragScale.value = withSpring(1);
      updateHandlePosition(closest.anchor);
      runOnJS(onDragEnd)(closest.anchor);
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
    });

  const tapGesture = Gesture.Tap()
    .maxDuration(400)
    .onEnd(() => {
      runOnJS(onPress)();
    });

  const composedGesture = Gesture.Race(
    panGesture,
    Gesture.Simultaneous(longPressGesture, tapGesture)
  );

  return (
    <Animated.View
      style={[
        styles.triggerContainer,
        { width: skin.trigger.size, height: skin.trigger.size },
        containerAnimatedStyle,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.triggerAura,
          {
            width: skin.trigger.size * 1.5,
            height: skin.trigger.size * 1.5,
            borderRadius: skin.trigger.borderRadius * 1.5,
          },
          auraStyle,
        ]}
      >
        <LinearGradient
          colors={[skin.trigger.glowColors[0], "rgba(236, 72, 153, 0.45)", skin.trigger.glowColors[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.triggerAuraGradient}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.triggerGlow,
          {
            width: skin.trigger.size + 20,
            height: skin.trigger.size + 20,
            borderRadius: skin.trigger.borderRadius + 10,
          },
          glowAnimatedStyle,
        ]}
      >
        <LinearGradient
          colors={skin.trigger.glowColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.triggerGlowGradient,
            { borderRadius: skin.trigger.borderRadius + 10 },
          ]}
        />
      </Animated.View>

      {showDragHint && isDraggable && !isOpen && (
        <View style={[styles.dragHint, { top: -(skin.trigger.size * 0.85) }]}>
          <ThemedText style={styles.dragHintText}>Drag to move</ThemedText>
        </View>
      )}

      <GestureDetector gesture={composedGesture}>
        <AnimatedPressable
          accessible
          accessibilityRole="button"
          accessibilityLabel={isOpen ? "Close launcher" : "Open launcher"}
          accessibilityHint={
            isDraggable
              ? "Long press and drag to reposition the launcher handle"
              : "Opens the ZEKE quick launcher"
          }
          accessibilityState={{ expanded: isOpen }}
          style={[
            styles.trigger,
            {
              width: skin.trigger.size,
              height: skin.trigger.size,
              borderRadius: skin.trigger.borderRadius,
              ...(Platform.OS !== "web" ? { shadowColor: skin.trigger.shadowColor } : {}),
            },
            triggerAnimatedStyle,
          ]}
        >
          <LinearGradient
            colors={skin.trigger.gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.triggerGradient,
              { borderRadius: skin.trigger.borderRadius },
            ]}
          >
            <Animated.View
              style={[
                styles.triggerInnerGlow,
                { borderRadius: skin.trigger.borderRadius },
                innerGlowStyle,
              ]}
            />
            <View style={styles.triggerIconContainer}>
              <Feather
                name={isOpen ? "x" : "grid"}
                size={skin.trigger.iconSize}
                color={skin.trigger.iconColor}
              />
            </View>
          </LinearGradient>
        </AnimatedPressable>
      </GestureDetector>

      <Animated.View
        pointerEvents="none"
        style={[styles.triggerLabel, labelStyle]}
      >
        <View style={styles.triggerLabelPill}>
          <Feather name="sunrise" size={14} color="#FFFFFF" />
          <ThemedText type="caption" style={styles.triggerLabelText} numberOfLines={1}>
            Open menu
          </ThemedText>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

interface LauncherIconProps {
  item: LauncherItem;
  index: number;
  totalItems: number;
  animationProgress: SharedValue<number>;
  isEditMode: boolean;
  position: RingPosition;
  skin: LauncherSkin;
  onPress: () => void;
  onLongPress: () => void;
  onDragStart: (index: number) => void;
  onDragUpdate: (index: number, x: number, y: number) => void;
  onDragEnd: (index: number) => void;
  isDragging: boolean;
  isBeingDragged: boolean;
}

function LauncherIcon({
  item,
  index,
  totalItems,
  animationProgress,
  isEditMode,
  position,
  skin,
  onPress,
  onLongPress,
  onDragStart,
  onDragUpdate,
  onDragEnd,
  isDragging,
  isBeingDragged,
}: LauncherIconProps) {
  const { theme } = useTheme();
  const wiggleAnim = useSharedValue(0);
  const scaleAnim = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  
  const animatedBaseX = useSharedValue(position.x);
  const animatedBaseY = useSharedValue(position.y);
  const dragStartX = useSharedValue(position.x);
  const dragStartY = useSharedValue(position.y);
  const hoverScale = useSharedValue(1);

  useEffect(() => {
    if (!isBeingDragged) {
      const bubbleConfig = { damping: 16, stiffness: 140, mass: 0.5 };
      animatedBaseX.value = withSpring(position.x, bubbleConfig);
      animatedBaseY.value = withSpring(position.y, bubbleConfig);
    }
  }, [position.x, position.y, isBeingDragged, animatedBaseX, animatedBaseY]);

  useEffect(() => {
    if (isDragging && !isBeingDragged) {
      hoverScale.value = withSpring(0.94, { damping: 18, stiffness: 200 });
    } else if (!isBeingDragged) {
      hoverScale.value = withSpring(1, { damping: 16, stiffness: 160 });
    }
  }, [isDragging, isBeingDragged, hoverScale]);

  useEffect(() => {
    if (isEditMode && !isBeingDragged) {
      wiggleAnim.value = withRepeat(
        withSequence(
          withTiming(-2, { duration: 80, easing: Easing.linear }),
          withTiming(2, { duration: 80, easing: Easing.linear }),
          withTiming(-2, { duration: 80, easing: Easing.linear }),
          withTiming(0, { duration: 80, easing: Easing.linear }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(wiggleAnim);
      wiggleAnim.value = withTiming(0, { duration: 100 });
    }
  }, [isEditMode, isBeingDragged, wiggleAnim]);

  const iconAnimatedStyle = useAnimatedStyle(() => {
    const staggerDelay = index * 0.06;
    const adjustedProgress = Math.max(
      0,
      Math.min(1, (animationProgress.value - staggerDelay) / (1 - staggerDelay)),
    );

    const baseX = animatedBaseX.value;
    const baseY = animatedBaseY.value;

    const liquidOvershoot = 1.12;
    const liquidBounce = 0.96;
    
    const currentX = interpolate(
      adjustedProgress,
      [0, 0.4, 0.7, 1],
      [0, baseX * liquidOvershoot, baseX * liquidBounce, baseX],
      Extrapolation.CLAMP,
    );

    const currentY = interpolate(
      adjustedProgress,
      [0, 0.4, 0.7, 1],
      [0, baseY * liquidOvershoot, baseY * liquidBounce, baseY],
      Extrapolation.CLAMP,
    );

    const scale = interpolate(
      adjustedProgress,
      [0, 0.3, 0.5, 0.8, 1],
      [0.1, 1.18, 1.08, 0.97, 1],
      Extrapolation.CLAMP,
    );

    const opacity = interpolate(
      adjustedProgress,
      [0, 0.15, 0.4],
      [0, 0.8, 1],
      Extrapolation.CLAMP,
    );

    const liquidRotate = interpolate(
      adjustedProgress,
      [0, 0.3, 0.6, 1],
      [0, 3, -2, 0],
      Extrapolation.CLAMP,
    );

    const wiggle = isEditMode ? wiggleAnim.value : 0;
    const dragScale = isBeingDragged ? scaleAnim.value : (isDragging ? hoverScale.value : 1);

    const finalX = isBeingDragged 
      ? dragStartX.value + translateX.value 
      : currentX;
    const finalY = isBeingDragged 
      ? dragStartY.value + translateY.value 
      : currentY;

    return {
      opacity,
      transform: [
        { translateX: finalX },
        { translateY: finalY },
        { scale: scale * dragScale },
        { rotate: `${wiggle + liquidRotate}deg` },
      ],
      zIndex: isBeingDragged ? 100 : 1,
    };
  });

  const glowStyle = useAnimatedStyle(() => {
    const glowOpacity = isBeingDragged ? 0.8 : 0.4;
    const glowScale = isBeingDragged ? 1.3 : 1;
    return {
      opacity: glowOpacity,
      transform: [{ scale: glowScale }],
    };
  });

  const longPressGesture = Gesture.LongPress()
    .minDuration(400)
    .onStart(() => {
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Heavy);
      runOnJS(onLongPress)();
    });

  const tapGesture = Gesture.Tap()
    .maxDuration(400)
    .onEnd(() => {
      if (!isEditMode) {
        runOnJS(onPress)();
      }
    });

  const bubbleSpringConfig = { damping: 18, stiffness: 180, mass: 0.6 };
  const snapBackSpringConfig = { damping: 16, stiffness: 160, mass: 0.5 };

  const panGesture = Gesture.Pan()
    .enabled(isEditMode)
    .onStart(() => {
      dragStartX.value = animatedBaseX.value;
      dragStartY.value = animatedBaseY.value;
      runOnJS(onDragStart)(index);
      scaleAnim.value = withSpring(1.18, bubbleSpringConfig);
    })
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
      const currentDragX = dragStartX.value + event.translationX;
      const currentDragY = dragStartY.value + event.translationY;
      runOnJS(onDragUpdate)(index, currentDragX, currentDragY);
    })
    .onEnd(() => {
      scaleAnim.value = withSpring(1, snapBackSpringConfig);
      translateX.value = withSpring(0, snapBackSpringConfig);
      translateY.value = withSpring(0, snapBackSpringConfig);
      runOnJS(onDragEnd)(index);
    });

  const composedGesture = Gesture.Race(
    panGesture,
    Gesture.Simultaneous(longPressGesture, tapGesture),
  );

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        style={[
          styles.iconWrapper,
          {
            width: skin.icon.containerSize,
            height: skin.icon.containerSize + 20,
            marginLeft: -skin.icon.containerSize / 2,
            marginTop: -skin.icon.containerSize / 2,
          },
          iconAnimatedStyle,
        ]}
      >
        <Animated.View
          style={[
            styles.iconGlow,
            {
              top: -4,
              left: (skin.icon.containerSize - skin.icon.size) / 2 - 4,
              width: skin.icon.size + 8,
              height: skin.icon.size + 8,
              borderRadius: skin.icon.borderRadius,
            },
            glowStyle,
          ]}
        >
          <LinearGradient
            colors={item.gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.iconGlowGradient,
              { borderRadius: skin.icon.borderRadius },
            ]}
          />
        </Animated.View>
        
        <View
          style={[
            styles.iconContainer,
            {
              width: skin.icon.size,
              height: skin.icon.size,
              borderRadius: skin.icon.borderRadius,
              ...(Platform.OS !== "web" ? { shadowColor: skin.icon.shadowColor } : {}),
            },
          ]}
        >
          <LinearGradient
            colors={item.gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.iconGradient,
              { borderRadius: skin.icon.borderRadius },
            ]}
          >
            <View
              style={[
                styles.iconInnerBorder,
                {
                  borderRadius: skin.icon.borderRadius,
                  borderColor: skin.icon.innerBorderColor,
                },
              ]}
            />
            <Feather name={item.icon} size={skin.icon.iconSize} color="#FFFFFF" />
          </LinearGradient>
        </View>
        
        <ThemedText
          type="caption"
          style={[
            styles.iconLabel,
            {
              fontSize: skin.icon.labelFontSize,
              width: skin.icon.containerSize,
            },
          ]}
          numberOfLines={1}
        >
          {item.label}
        </ThemedText>

        {isEditMode ? (
          <View
            style={[
              styles.deleteButton,
              {
                left: (skin.icon.containerSize - skin.icon.size) / 2 - 4,
              },
            ]}
          >
            <Feather name="minus" size={10} color="#FFFFFF" />
          </View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

export function ZekeLauncher({ items, skinId = "default" }: ZekeLauncherProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [isOpen, setIsOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [orderedItems, setOrderedItems] = useState<LauncherItem[]>(items);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [previewOrder, setPreviewOrder] = useState<LauncherItem[]>([]);
  const [anchor, setAnchor] = useState<AnchorPosition>("bottom-right");
  const [currentSkinId, setCurrentSkinId] = useState(skinId);

  const skin = useMemo(() => getSkin(currentSkinId), [currentSkinId]);

  const animationProgress = useSharedValue(0);
  const pulseAnim = useSharedValue(0);
  const glowAnim = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );

    glowAnim.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [pulseAnim, glowAnim]);

  const loadSettings = async () => {
    try {
      const [savedOrder, savedAnchor, savedSkin] = await Promise.all([
        AsyncStorage.getItem(ORDER_STORAGE_KEY),
        AsyncStorage.getItem(ANCHOR_STORAGE_KEY),
        AsyncStorage.getItem(SKIN_STORAGE_KEY),
      ]);
      
      if (savedOrder) {
        const orderIds: string[] = JSON.parse(savedOrder);
        const reordered = orderIds
          .map((id) => items.find((item) => item.id === id))
          .filter(Boolean) as LauncherItem[];
        const newItems = items.filter((item) => !orderIds.includes(item.id));
        setOrderedItems([...reordered, ...newItems]);
      } else {
        setOrderedItems(items);
      }
      
      if (savedAnchor && ALLOWED_ANCHORS.includes(savedAnchor as AnchorPosition)) {
        setAnchor(savedAnchor as AnchorPosition);
      }
      
      if (savedSkin) {
        setCurrentSkinId(savedSkin);
      }
    } catch {
      setOrderedItems(items);
    }
  };

  const saveOrder = async (newOrder: LauncherItem[]) => {
    try {
      const orderIds = newOrder.map((item) => item.id);
      await AsyncStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(orderIds));
    } catch {
      console.log("Failed to save order");
    }
  };

  const saveAnchor = async (newAnchor: AnchorPosition) => {
    try {
      await AsyncStorage.setItem(ANCHOR_STORAGE_KEY, newAnchor);
    } catch {
      console.log("Failed to save anchor");
    }
  };

  const handleToggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    if (isOpen) {
      if (isEditMode) {
        setIsEditMode(false);
        return;
      }
      animationProgress.value = withSpring(0, {
        damping: 18,
        stiffness: 280,
        mass: 0.7,
        overshootClamping: false,
      });
      backdropOpacity.value = withTiming(0, { duration: 280 });
      setTimeout(() => setIsOpen(false), 350);
    } else {
      setIsOpen(true);
      backdropOpacity.value = withTiming(1, { duration: 250 });
      animationProgress.value = withSpring(1, {
        damping: 14,
        stiffness: 180,
        mass: 0.5,
        overshootClamping: false,
      });
    }
  }, [isOpen, isEditMode, animationProgress, backdropOpacity, skin]);

  const handleTriggerLongPress = useCallback(() => {
    // Trigger long press enables drag mode (visual feedback only)
  }, []);

  const handleTriggerDragEnd = useCallback((newAnchor: AnchorPosition) => {
    setAnchor(newAnchor);
    saveAnchor(newAnchor);
  }, []);

  const handleItemPress = useCallback(
    (item: LauncherItem) => {
      if (isEditMode) return;
      
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      animationProgress.value = withTiming(0, { duration: 200 });
      backdropOpacity.value = withTiming(0, { duration: 200 });
      
      setTimeout(() => {
        setIsOpen(false);
        item.onPress();
      }, 150);
    },
    [isEditMode, animationProgress, backdropOpacity],
  );

  const handleLongPress = useCallback(() => {
    setIsEditMode(true);
  }, []);

  const { menuSize: clampedMenuSize, scale: menuScale } = useMemo(() => {
    const displayItems = previewOrder.length > 0 ? previewOrder : orderedItems;
    return getClampedMenuSize(
      displayItems.length,
      anchor,
      SCREEN_WIDTH,
      SCREEN_HEIGHT,
      skin.trigger.size,
      insets,
      skin.layout.padding,
      {
        iconSize: skin.icon.size,
        iconContainerSize: skin.icon.containerSize,
        baseRadius: skin.layout.baseRadius,
        ringSpacing: skin.layout.ringSpacing,
        minIconSpacing: 12,
      }
    );
  }, [orderedItems, previewOrder, anchor, skin, insets]);

  const positions = useMemo(() => {
    const displayItems = previewOrder.length > 0 ? previewOrder : orderedItems;
    const config = {
      iconSize: skin.icon.size,
      iconContainerSize: skin.icon.containerSize,
      baseRadius: skin.layout.baseRadius,
      ringSpacing: skin.layout.ringSpacing,
      minIconSpacing: 12,
    };
    const rawPositions = calculateDiamondPositions(displayItems.length, config);
    if (menuScale >= 1) {
      return rawPositions;
    }
    return rawPositions.map(pos => ({
      ...pos,
      x: pos.x * menuScale,
      y: pos.y * menuScale,
    }));
  }, [orderedItems, previewOrder, skin, menuScale]);

  const findClosestPosition = useCallback((x: number, y: number): number => {
    let closest = 0;
    let minDist = Infinity;
    
    positions.forEach((pos, idx) => {
      const dist = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));
      if (dist < minDist) {
        minDist = dist;
        closest = idx;
      }
    });
    
    return closest;
  }, [positions]);

  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
    setPreviewOrder([...orderedItems]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [orderedItems]);

  const handleDragUpdate = useCallback((fromIndex: number, x: number, y: number) => {
    const targetIndex = findClosestPosition(x, y);
    
    if (targetIndex !== fromIndex && previewOrder.length > 0) {
      const newOrder = [...orderedItems];
      const [removed] = newOrder.splice(fromIndex, 1);
      newOrder.splice(targetIndex, 0, removed);
      
      if (JSON.stringify(newOrder.map(i => i.id)) !== JSON.stringify(previewOrder.map(i => i.id))) {
        setPreviewOrder(newOrder);
        Haptics.selectionAsync();
      }
    }
  }, [orderedItems, previewOrder, findClosestPosition]);

  const handleDragEnd = useCallback((_fromIndex: number) => {
    if (previewOrder.length > 0) {
      setOrderedItems(previewOrder);
      saveOrder(previewOrder);
    }
    setDraggedIndex(null);
    setPreviewOrder([]);
  }, [previewOrder]);

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value * 0.85,
  }));

  const menuContainerStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      animationProgress.value,
      [0, 0.3, 0.6, 0.85, 1],
      [0.6, 1.08, 0.98, 1.02, 1],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      animationProgress.value,
      [0, 0.15, 0.35],
      [0, 0.7, 1],
      Extrapolation.CLAMP,
    );
    const rotate = interpolate(
      animationProgress.value,
      [0, 0.4, 0.7, 1],
      [5, -2, 1, 0],
      Extrapolation.CLAMP,
    );
    return {
      opacity,
      transform: [{ scale }, { rotate: `${rotate}deg` }],
    };
  });

  const displayItems = previewOrder.length > 0 ? previewOrder : orderedItems;

  const menuPositionStyle = getCenteredMenuPositionStyle(
    clampedMenuSize,
    SCREEN_WIDTH,
    SCREEN_HEIGHT,
    insets,
    skin.layout.padding,
  );

  const iconAnchorStyle = getIconAnchorStyle(
    anchor,
    clampedMenuSize,
    skin.trigger.size
  );

  return (
    <>
      {isOpen ? (
        <>
          <Animated.View
            style={[
              styles.backdrop,
              { backgroundColor: theme.backgroundRoot },
              backdropAnimatedStyle,
            ]}
            pointerEvents="auto"
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={handleToggle}
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.menuContainer,
              {
                width: clampedMenuSize,
                height: clampedMenuSize,
              },
              menuPositionStyle,
              menuContainerStyle,
            ]}
          >
            <View pointerEvents="none" style={styles.menuChrome}>
              <LinearGradient
                colors={[Gradients.primary[0], "rgba(236, 72, 153, 0.25)", Gradients.primary[1]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.menuHalo, { borderRadius: skin.menu.borderRadius * 1.2 }]}
              />
              <View style={[styles.menuHeader, { padding: Spacing.md }]}>
                <View style={styles.menuHeaderIcon}>
                  <Feather name="aperture" size={18} color="#FFFFFF" />
                </View>
                <View style={styles.menuHeaderTextBlock}>
                  <ThemedText type="small" style={styles.menuHeaderTitle}>
                    ZEKE menu
                  </ThemedText>
                  <ThemedText type="caption" style={styles.menuHeaderSubtitle} numberOfLines={1}>
                    {isEditMode ? "Drag icons to reorder" : "Tap to launch. Long-press to edit."}
                  </ThemedText>
                </View>
              </View>
            </View>
            {Platform.OS === "ios" ? (
              <BlurView
                intensity={skin.menu.blurIntensity}
                tint={isDark ? "dark" : "light"}
                style={[
                  styles.semiCircleContainer,
                  {
                    borderRadius: skin.menu.borderRadius,
                    borderWidth: skin.menu.borderWidth,
                    borderColor: skin.menu.borderColor,
                  },
                ]}
              >
                <View style={[styles.iconAnchor, iconAnchorStyle]}>
                  {isEditMode ? (
                    <Pressable
                      onPress={() => setIsEditMode(false)}
                      style={styles.doneButtonFloat}
                    >
                      <ThemedText type="small" style={{ color: Colors.dark.primary }}>
                        Done
                      </ThemedText>
                    </Pressable>
                  ) : null}
                  {displayItems.map((item, index) => {
                    const originalIndex = orderedItems.findIndex(i => i.id === item.id);
                    const isBeingDragged = draggedIndex === originalIndex;
                    
                    return (
                      <LauncherIcon
                        key={item.id}
                        item={item}
                        index={index}
                        totalItems={displayItems.length}
                        animationProgress={animationProgress}
                        isEditMode={isEditMode}
                        position={positions[index] || { x: 0, y: 0, angle: 0, ring: 0, indexInRing: 0 }}
                        skin={skin}
                        onPress={() => handleItemPress(item)}
                        onLongPress={handleLongPress}
                        onDragStart={handleDragStart}
                        onDragUpdate={handleDragUpdate}
                        onDragEnd={handleDragEnd}
                        isDragging={draggedIndex !== null}
                        isBeingDragged={isBeingDragged}
                      />
                    );
                  })}
                </View>
              </BlurView>
            ) : (
              <View
                style={[
                  styles.semiCircleContainerAndroid,
                  {
                    backgroundColor: theme.backgroundDefault,
                    borderRadius: skin.menu.borderRadius,
                    borderWidth: skin.menu.borderWidth,
                    borderColor: theme.border,
                  },
                ]}
              >
                <View style={[styles.iconAnchor, iconAnchorStyle]}>
                  {isEditMode ? (
                    <Pressable
                      onPress={() => setIsEditMode(false)}
                      style={styles.doneButtonFloat}
                    >
                      <ThemedText type="small" style={{ color: Colors.dark.primary }}>
                        Done
                      </ThemedText>
                    </Pressable>
                  ) : null}
                  {displayItems.map((item, index) => {
                    const originalIndex = orderedItems.findIndex(i => i.id === item.id);
                    const isBeingDragged = draggedIndex === originalIndex;
                    
                    return (
                      <LauncherIcon
                        key={item.id}
                        item={item}
                        index={index}
                        totalItems={displayItems.length}
                        animationProgress={animationProgress}
                        isEditMode={isEditMode}
                        position={positions[index] || { x: 0, y: 0, angle: 0, ring: 0, indexInRing: 0 }}
                        skin={skin}
                        onPress={() => handleItemPress(item)}
                        onLongPress={handleLongPress}
                        onDragStart={handleDragStart}
                        onDragUpdate={handleDragUpdate}
                        onDragEnd={handleDragEnd}
                        isDragging={draggedIndex !== null}
                        isBeingDragged={isBeingDragged}
                      />
                    );
                  })}
                </View>
              </View>
            )}
          </Animated.View>
        </>
      ) : null}

      <TriggerButton
        onPress={handleToggle}
        onLongPress={handleTriggerLongPress}
        isOpen={isOpen}
        pulseAnim={pulseAnim}
        glowAnim={glowAnim}
        anchor={anchor}
        skin={skin}
        isDraggable={!isOpen}
        onDragEnd={handleTriggerDragEnd}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 998,
  },
  triggerContainer: {
    position: "absolute",
    zIndex: 1000,
    alignItems: "center",
    justifyContent: "center",
  },
  triggerAura: {
    position: "absolute",
    zIndex: 999,
    opacity: 0.6,
  },
  triggerAuraGradient: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    opacity: 0.9,
  },
  triggerGlow: {
    position: "absolute",
  },
  triggerGlowGradient: {
    width: "100%",
    height: "100%",
  },
  dragHint: {
    position: "absolute",
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    borderRadius: BorderRadius.md,
  },
  dragHintText: {
    color: "#FFFFFF",
    fontSize: 12,
    letterSpacing: 0.2,
  },
  trigger: {
    overflow: "hidden",
    elevation: 12,
    ...Platform.select({
      web: {
        boxShadow: "0px 4px 24px rgba(0, 0, 0, 0.5)",
      },
      default: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 12,
      },
    }),
  },
  triggerGradient: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  triggerInnerGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  triggerIconContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  triggerLabel: {
    position: "absolute",
    bottom: -Spacing.xl,
  },
  triggerLabelPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  triggerLabelText: {
    color: "#FFFFFF",
    marginLeft: Spacing.xs,
    letterSpacing: 0.3,
  },
  menuContainer: {
    position: "absolute",
    zIndex: 999,
  },
  menuChrome: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-start",
  },
  menuHalo: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.4,
  },
  menuHeader: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: Spacing.sm,
  },
  menuHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  menuHeaderTextBlock: {
    flex: 1,
  },
  menuHeaderTitle: {
    color: "#FFFFFF",
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  menuHeaderSubtitle: {
    color: "#E2E8F0",
    opacity: 0.8,
  },
  semiCircleContainer: {
    flex: 1,
  },
  semiCircleContainerAndroid: {
    flex: 1,
  },
  iconAnchor: {
    position: "absolute",
    width: 0,
    height: 0,
  },
  iconWrapper: {
    position: "absolute",
    alignItems: "center",
  },
  iconGlow: {
    position: "absolute",
  },
  iconGlowGradient: {
    width: "100%",
    height: "100%",
  },
  iconContainer: {
    overflow: "hidden",
    elevation: 6,
    ...Platform.select({
      web: {
        boxShadow: "0px 2px 12px rgba(0, 0, 0, 0.3)",
      },
      default: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
    }),
  },
  iconGradient: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  iconInnerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
  },
  iconLabel: {
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  deleteButton: {
    position: "absolute",
    top: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.error,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    ...Platform.select({
      web: {
        boxShadow: "0px 1px 4px rgba(0, 0, 0, 0.3)",
      },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 2,
      },
    }),
  },
  doneButtonFloat: {
    position: "absolute",
    left: -150,
    top: -80,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.4)",
  },
});

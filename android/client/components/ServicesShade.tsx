import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Platform,
  Modal,
  Pressable,
  FlatList,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
  clamp,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppCard, AppCardData } from "@/components/AppCard";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

type ShadePosition = "collapsed" | "expanded";

const SPRING_CONFIG = {
  damping: 26,
  stiffness: 160,
  mass: 0.8,
  overshootClamping: true,
};

const CAROUSEL_CARD_HEIGHT = 170;
const QUICK_BUTTONS_HEIGHT = 72;
const HEADER_HEIGHT = 48;
const HANDLE_HEIGHT = 24;
const COLLAPSED_PEEK_HEIGHT = 96;
const CLOSE_VELOCITY_THRESHOLD = 1200;
const CLOSE_DISTANCE_THRESHOLD = 0.4;
const QUICK_BUTTONS_STORAGE_KEY = "@zeke_quick_buttons";
const MAX_QUICK_BUTTONS = 4;

interface ServicesShadeProps {
  apps: AppCardData[];
  onShadePositionChange?: (position: ShadePosition) => void;
}

interface QuickAction {
  id: string;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}

interface QuickButtonConfig {
  appId: string;
  order: number;
}

export function ServicesShade({
  apps,
  onShadePositionChange,
}: ServicesShadeProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const flatListRef = useRef<FlatList>(null);
  
  const [shadePosition, setShadePosition] = useState<ShadePosition>("expanded");
  const [isScrollEnabled, setIsScrollEnabled] = useState(true);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [selectedApp, setSelectedApp] = useState<AppCardData | null>(null);
  const [showQuickButtonEditor, setShowQuickButtonEditor] = useState(false);
  const [quickButtonIds, setQuickButtonIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadQuickButtonConfig();
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (quickButtonIds.length === 0 && apps.length > 0) {
      const defaultIds = apps.slice(0, MAX_QUICK_BUTTONS).map(app => app.id);
      setQuickButtonIds(defaultIds);
      debouncedSaveQuickButtonConfig(defaultIds);
    }
  }, [apps, quickButtonIds.length]);

  const loadQuickButtonConfig = async () => {
    try {
      const stored = await AsyncStorage.getItem(QUICK_BUTTONS_STORAGE_KEY);
      if (stored) {
        const config: QuickButtonConfig[] = JSON.parse(stored);
        setQuickButtonIds(config.sort((a, b) => a.order - b.order).map(c => c.appId));
      }
    } catch (error) {
      console.log("Failed to load quick button config:", error);
    }
  };

  const saveQuickButtonConfig = async (ids: string[]) => {
    try {
      const config: QuickButtonConfig[] = ids.map((id, index) => ({
        appId: id,
        order: index,
      }));
      await AsyncStorage.setItem(QUICK_BUTTONS_STORAGE_KEY, JSON.stringify(config));
    } catch (error) {
      console.log("Failed to save quick button config:", error);
    }
  };

  const debouncedSaveQuickButtonConfig = useCallback((ids: string[]) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveQuickButtonConfig(ids);
    }, 500);
  }, []);

  const quickButtonApps = useMemo(() => {
    return quickButtonIds
      .map(id => apps.find(app => app.id === id))
      .filter((app): app is AppCardData => app !== undefined)
      .slice(0, MAX_QUICK_BUTTONS);
  }, [quickButtonIds, apps]);

  const loopedApps = useMemo(() => {
    if (apps.length <= 1) return apps;
    return [...apps, ...apps, ...apps];
  }, [apps]);

  const getShadePositions = useCallback(() => {
    const bottomSafeArea = insets.bottom;
    const topSafeArea = insets.top;
    
    const collapsedHeight = COLLAPSED_PEEK_HEIGHT + bottomSafeArea;
    const expandedHeight = QUICK_BUTTONS_HEIGHT + CAROUSEL_CARD_HEIGHT + HEADER_HEIGHT + HANDLE_HEIGHT + Spacing.xl * 2 + bottomSafeArea + 60;
    
    const maxExpandedHeight = screenHeight - topSafeArea - 40;
    
    return {
      collapsed: collapsedHeight,
      expanded: Math.min(expandedHeight, maxExpandedHeight),
    };
  }, [screenHeight, insets.bottom, insets.top]);

  const positions = getShadePositions();
  const shadeHeight = useSharedValue(positions.expanded);
  const backdropOpacity = useSharedValue(0);
  const startHeight = useSharedValue(positions.expanded);

  useEffect(() => {
    const newPositions = getShadePositions();
    shadeHeight.value = withSpring(newPositions[shadePosition], SPRING_CONFIG);
  }, [screenHeight, shadePosition, getShadePositions, shadeHeight]);

  const updateShadePosition = useCallback((position: ShadePosition) => {
    setShadePosition(position);
    setIsScrollEnabled(position !== "collapsed");
    onShadePositionChange?.(position);
  }, [onShadePositionChange]);

  const snapToPosition = useCallback((targetPosition: ShadePosition) => {
    const currentPositions = getShadePositions();
    const targetHeight = currentPositions[targetPosition];
    shadeHeight.value = withSpring(targetHeight, SPRING_CONFIG);
    runOnJS(updateShadePosition)(targetPosition);
  }, [shadeHeight, updateShadePosition, getShadePositions]);

  const handleAppLongPress = useCallback((app: AppCardData) => {
    setSelectedApp(app);
    setShowQuickActions(true);
    backdropOpacity.value = withTiming(1, { duration: 200 });
  }, [backdropOpacity]);

  const closeQuickActions = useCallback(() => {
    backdropOpacity.value = withTiming(0, { duration: 200 });
    setTimeout(() => {
      setShowQuickActions(false);
      setSelectedApp(null);
    }, 200);
  }, [backdropOpacity]);

  const handleToggleQuickButton = useCallback((appId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQuickButtonIds(prev => {
      let newIds: string[];
      if (prev.includes(appId)) {
        newIds = prev.filter(id => id !== appId);
      } else if (prev.length < MAX_QUICK_BUTTONS) {
        newIds = [...prev, appId];
      } else {
        newIds = prev;
      }
      debouncedSaveQuickButtonConfig(newIds);
      return newIds;
    });
  }, [debouncedSaveQuickButtonConfig]);

  const handleMoveQuickButton = useCallback((appId: string, direction: "up" | "down") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setQuickButtonIds(prev => {
      const index = prev.indexOf(appId);
      if (index === -1) return prev;
      
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      
      const newIds = [...prev];
      [newIds[index], newIds[newIndex]] = [newIds[newIndex], newIds[index]];
      debouncedSaveQuickButtonConfig(newIds);
      return newIds;
    });
  }, [debouncedSaveQuickButtonConfig]);

  const quickActions: QuickAction[] = useMemo(() => {
    if (!selectedApp) return [];

    const isQuickButton = quickButtonIds.includes(selectedApp.id);

    return [
      {
        id: "toggle-quick",
        icon: isQuickButton ? "minus-circle" : "plus-circle",
        label: isQuickButton ? "Remove from Quick Buttons" : "Add to Quick Buttons",
        onPress: () => {
          handleToggleQuickButton(selectedApp.id);
          closeQuickActions();
        },
      },
      {
        id: "configure",
        icon: "settings",
        label: `Open ${selectedApp.title}`,
        onPress: () => {
          closeQuickActions();
          selectedApp.onPress();
        },
      },
    ];
  }, [selectedApp, closeQuickActions, quickButtonIds, handleToggleQuickButton]);

  const handleTapToExpand = useCallback(() => {
    if (shadePosition === "collapsed") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      snapToPosition("expanded");
    }
  }, [shadePosition, snapToPosition]);

  const tapGesture = Gesture.Tap()
    .onEnd(() => {
      runOnJS(handleTapToExpand)();
    });

  const panGesture = Gesture.Pan()
    .onStart(() => {
      startHeight.value = shadeHeight.value;
    })
    .onUpdate((event) => {
      const currentPositions = getShadePositions();
      const newHeight = startHeight.value - event.translationY;
      shadeHeight.value = clamp(
        newHeight,
        currentPositions.collapsed,
        currentPositions.expanded
      );
    })
    .onEnd((event) => {
      const currentPositions = getShadePositions();
      const velocity = -event.velocityY;
      const currentHeight = shadeHeight.value;
      
      let targetPosition: ShadePosition = "expanded";
      
      const totalRange = currentPositions.expanded - currentPositions.collapsed;
      const distanceFromOpen = currentPositions.expanded - currentHeight;
      const closeProgress = distanceFromOpen / totalRange;
      
      const isClosingSwipe = velocity < -CLOSE_VELOCITY_THRESHOLD;
      const isDraggedPastThreshold = closeProgress > CLOSE_DISTANCE_THRESHOLD;
      
      if (isClosingSwipe || isDraggedPastThreshold) {
        targetPosition = "collapsed";
      }
      
      runOnJS(snapToPosition)(targetPosition);
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
    });

  const composedGesture = Gesture.Exclusive(panGesture, tapGesture);

  const shadeAnimatedStyle = useAnimatedStyle(() => ({
    height: shadeHeight.value,
  }));

  const handleIndicatorStyle = useAnimatedStyle(() => {
    const currentPositions = getShadePositions();
    return {
      opacity: interpolate(
        shadeHeight.value,
        [currentPositions.collapsed, currentPositions.expanded],
        [1, 0.5],
        Extrapolation.CLAMP
      ),
      transform: [
        {
          scaleX: interpolate(
            shadeHeight.value,
            [currentPositions.collapsed, currentPositions.expanded],
            [1.3, 1],
            Extrapolation.CLAMP
          ),
        },
      ],
    };
  });

  const collapsedPeekStyle = useAnimatedStyle(() => {
    const currentPositions = getShadePositions();
    return {
      opacity: interpolate(
        shadeHeight.value,
        [currentPositions.collapsed, currentPositions.collapsed + 60],
        [1, 0],
        Extrapolation.CLAMP
      ),
      transform: [
        {
          translateY: interpolate(
            shadeHeight.value,
            [currentPositions.collapsed, currentPositions.expanded],
            [0, -20],
            Extrapolation.CLAMP
          ),
        },
      ],
    };
  });

  const contentOpacityStyle = useAnimatedStyle(() => {
    const currentPositions = getShadePositions();
    return {
      opacity: interpolate(
        shadeHeight.value,
        [currentPositions.collapsed, currentPositions.collapsed + 100],
        [0, 1],
        Extrapolation.CLAMP
      ),
    };
  });

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const cardWidth = screenWidth * 0.75;
  const cardSpacing = Spacing.md;

  const handleScrollEnd = useCallback((event: any) => {
    if (apps.length === 0) return;
    
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / (cardWidth + cardSpacing));
    const realIndex = ((index % apps.length) + apps.length) % apps.length;
    setCurrentIndex(realIndex);
    
    if (apps.length > 1) {
      const middleStart = apps.length;
      
      if (index < apps.length * 0.5) {
        flatListRef.current?.scrollToOffset({
          offset: (middleStart + realIndex) * (cardWidth + cardSpacing),
          animated: false,
        });
      } else if (index >= apps.length * 2.5) {
        flatListRef.current?.scrollToOffset({
          offset: (middleStart + realIndex) * (cardWidth + cardSpacing),
          animated: false,
        });
      }
    }
  }, [apps.length, cardWidth, cardSpacing]);

  useEffect(() => {
    if (apps.length > 1 && flatListRef.current) {
      const middleStart = apps.length;
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({
          offset: middleStart * (cardWidth + cardSpacing),
          animated: false,
        });
      }, 100);
    }
  }, [apps.length, cardWidth, cardSpacing]);

  const handleQuickButtonPress = useCallback((app: AppCardData) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    app.onPress();
  }, []);

  const renderQuickButton = (app: AppCardData, index: number) => (
    <Pressable
      key={app.id}
      onPress={() => handleQuickButtonPress(app)}
      onLongPress={() => handleAppLongPress(app)}
      style={({ pressed }) => [
        styles.quickButton,
        {
          backgroundColor: pressed ? `${app.gradientColors[0]}30` : `${app.gradientColors[0]}15`,
          borderColor: `${app.gradientColors[0]}40`,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${app.title}`}
      accessibilityHint="Tap to open, long press for more options"
    >
      <View style={[styles.quickButtonIcon, { backgroundColor: `${app.gradientColors[0]}25` }]}>
        <Feather name={app.icon} size={18} color={app.gradientColors[0]} />
      </View>
      <ThemedText type="caption" numberOfLines={1} style={[styles.quickButtonLabel, { color: theme.text }]}>
        {app.title}
      </ThemedText>
    </Pressable>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerCenter}>
        <ThemedText type="h3" style={[styles.headerTitle, { color: theme.text }]}>
          Services
        </ThemedText>
        <ThemedText type="caption" style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
          {apps.length} available
        </ThemedText>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <GestureDetector gesture={composedGesture}>
        <Animated.View 
          style={[
            styles.shadeContainer, 
            { backgroundColor: theme.backgroundDefault },
            shadeAnimatedStyle
          ]}
        >
          <Animated.View style={[styles.handleContainer, handleIndicatorStyle]}>
            <View style={[styles.handle, { backgroundColor: "#6366F1" }]} />
          </Animated.View>

          <Animated.View 
            style={[styles.collapsedPeek, collapsedPeekStyle]}
            accessibilityRole="button"
            accessibilityLabel="Expand services menu"
            accessibilityHint="Tap to show all services"
          >
            <View style={styles.collapsedPeekHeader}>
              <View style={styles.collapsedPeekTitleRow}>
                <Feather name="layers" size={14} color="#6366F1" />
                <ThemedText type="caption" style={[styles.collapsedPeekText, { color: theme.text }]}>
                  Services
                </ThemedText>
                <View style={styles.collapsedPeekDot} />
                <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                  {apps.length}
                </ThemedText>
              </View>
              <Feather name="chevron-up" size={14} color={theme.textSecondary} />
            </View>
            <View style={styles.collapsedQuickButtons}>
              {quickButtonApps.slice(0, 4).map((app) => (
                <Pressable
                  key={app.id}
                  onPress={() => handleQuickButtonPress(app)}
                  style={({ pressed }) => [
                    styles.collapsedQuickButton,
                    {
                      backgroundColor: pressed ? `${app.gradientColors[0]}30` : `${app.gradientColors[0]}15`,
                      borderColor: `${app.gradientColors[0]}30`,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${app.title}`}
                  accessibilityHint={`Quickly access ${app.title} service`}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Feather name={app.icon} size={18} color={app.gradientColors[0]} />
                </Pressable>
              ))}
            </View>
          </Animated.View>

          <Animated.View style={[styles.mainContent, contentOpacityStyle]}>
            {renderHeader()}

            <View style={styles.quickButtonsContainer}>
              {quickButtonApps.map((app, index) => renderQuickButton(app, index))}
              {quickButtonApps.length < MAX_QUICK_BUTTONS ? (
                <Pressable
                  onPress={() => setShowQuickButtonEditor(true)}
                  style={[styles.quickButton, styles.addQuickButton, { borderColor: theme.border }]}
                >
                  <Feather name="plus" size={20} color={theme.textSecondary} />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.carouselContainer}>
              <FlatList
                ref={flatListRef}
                data={loopedApps}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={cardWidth + cardSpacing}
                decelerationRate="fast"
                onMomentumScrollEnd={handleScrollEnd}
                contentContainerStyle={[
                  styles.carouselContent,
                  { paddingHorizontal: (screenWidth - cardWidth) / 2 },
                ]}
                scrollEnabled={isScrollEnabled}
                getItemLayout={(_, index) => ({
                  length: cardWidth + cardSpacing,
                  offset: (cardWidth + cardSpacing) * index,
                  index,
                })}
                renderItem={({ item, index }) => (
                  <View
                    style={[
                      styles.carouselItem,
                      {
                        width: cardWidth,
                        marginRight: cardSpacing,
                      },
                    ]}
                  >
                    <AppCard
                      {...item}
                      mode="carousel"
                      size="small"
                      onLongPress={() => handleAppLongPress(item)}
                    />
                  </View>
                )}
                keyExtractor={(item, index) => `${item.id}-${index}`}
              />

              <View style={styles.carouselIndicators}>
                {apps.map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.indicator,
                      {
                        backgroundColor: index === currentIndex ? "#6366F1" : theme.border,
                        width: index === currentIndex ? 16 : 6,
                      },
                    ]}
                  />
                ))}
              </View>

              <ThemedText type="caption" style={[styles.footerText, { color: theme.textSecondary }]}>
                Swipe to browse - Long-press for actions
              </ThemedText>
            </View>
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      <Modal
        visible={showQuickActions}
        transparent
        animationType="none"
        onRequestClose={closeQuickActions}
      >
        <Pressable style={styles.modalContainer} onPress={closeQuickActions}>
          <Animated.View style={[styles.modalBackdrop, backdropAnimatedStyle]} pointerEvents="none">
            {Platform.OS === "ios" ? (
              <BlurView
                intensity={isDark ? 40 : 30}
                tint={isDark ? "dark" : "light"}
                style={StyleSheet.absoluteFill}
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0, 0, 0, 0.7)" }]} />
            )}
          </Animated.View>

          <Pressable 
            style={[styles.quickActionsContainer, { bottom: insets.bottom + 100 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.quickActionsHeader, { backgroundColor: theme.backgroundDefault }]}>
              <Feather name={selectedApp?.icon || "box"} size={20} color="#6366F1" />
              <ThemedText type="body" style={[styles.quickActionsTitle, { color: theme.text }]}>
                {selectedApp?.title}
              </ThemedText>
            </View>

            {quickActions.map((action) => (
              <Pressable
                key={action.id}
                onPress={action.onPress}
                style={({ pressed }) => [
                  styles.quickActionItem,
                  { backgroundColor: theme.backgroundDefault },
                  pressed && styles.quickActionItemPressed,
                ]}
              >
                <View style={styles.quickActionIcon}>
                  <Feather name={action.icon} size={18} color="#6366F1" />
                </View>
                <ThemedText type="small" style={[styles.quickActionLabel, { color: theme.text }]}>
                  {action.label}
                </ThemedText>
                <Feather name="chevron-right" size={16} color={theme.textSecondary} />
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showQuickButtonEditor}
        transparent
        animationType="slide"
        onRequestClose={() => setShowQuickButtonEditor(false)}
      >
        <View style={[styles.editorModal, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
          <View style={[styles.editorContainer, { backgroundColor: theme.backgroundDefault }]}>
            <View style={styles.editorHeader}>
              <ThemedText type="h3" style={{ color: theme.text }}>
                Edit Quick Buttons
              </ThemedText>
              <Pressable onPress={() => setShowQuickButtonEditor(false)}>
                <Feather name="x" size={24} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ThemedText type="caption" style={[styles.editorSubtitle, { color: theme.textSecondary }]}>
              Select up to {MAX_QUICK_BUTTONS} services for quick access
            </ThemedText>

            <View style={styles.editorSection}>
              <ThemedText type="small" style={[styles.editorSectionTitle, { color: theme.textSecondary }]}>
                Current Quick Buttons
              </ThemedText>
              {quickButtonApps.map((app, index) => (
                <View key={app.id} style={[styles.editorItem, { backgroundColor: theme.backgroundSecondary }]}>
                  <View style={styles.editorItemLeft}>
                    <Feather name={app.icon} size={18} color={app.gradientColors[0]} />
                    <ThemedText type="body" style={{ color: theme.text, marginLeft: Spacing.sm }}>
                      {app.title}
                    </ThemedText>
                  </View>
                  <View style={styles.editorItemActions}>
                    <Pressable
                      onPress={() => handleMoveQuickButton(app.id, "up")}
                      disabled={index === 0}
                      style={[styles.editorActionBtn, index === 0 && styles.editorActionBtnDisabled]}
                    >
                      <Feather name="chevron-up" size={18} color={index === 0 ? theme.border : theme.textSecondary} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleMoveQuickButton(app.id, "down")}
                      disabled={index === quickButtonApps.length - 1}
                      style={[styles.editorActionBtn, index === quickButtonApps.length - 1 && styles.editorActionBtnDisabled]}
                    >
                      <Feather name="chevron-down" size={18} color={index === quickButtonApps.length - 1 ? theme.border : theme.textSecondary} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleToggleQuickButton(app.id)}
                      style={styles.editorActionBtn}
                    >
                      <Feather name="x" size={18} color="#EF4444" />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.editorSection}>
              <ThemedText type="small" style={[styles.editorSectionTitle, { color: theme.textSecondary }]}>
                Available Services
              </ThemedText>
              {apps.filter(app => !quickButtonIds.includes(app.id)).map(app => (
                <Pressable
                  key={app.id}
                  onPress={() => handleToggleQuickButton(app.id)}
                  disabled={quickButtonIds.length >= MAX_QUICK_BUTTONS}
                  style={[
                    styles.editorItem,
                    { backgroundColor: theme.backgroundSecondary },
                    quickButtonIds.length >= MAX_QUICK_BUTTONS && styles.editorItemDisabled,
                  ]}
                >
                  <View style={styles.editorItemLeft}>
                    <Feather name={app.icon} size={18} color={app.gradientColors[0]} />
                    <ThemedText type="body" style={{ color: theme.text, marginLeft: Spacing.sm }}>
                      {app.title}
                    </ThemedText>
                  </View>
                  <Feather
                    name="plus-circle"
                    size={20}
                    color={quickButtonIds.length >= MAX_QUICK_BUTTONS ? theme.border : "#10B981"}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  shadeContainer: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0px -4px 20px rgba(0, 0, 0, 0.3)",
      },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 20,
      },
    }),
  },
  handleContainer: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    fontWeight: "700",
  },
  headerSubtitle: {
    marginTop: 2,
  },
  quickButtonsContainer: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  quickButton: {
    flex: 1,
    height: 56,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xs,
  },
  addQuickButton: {
    borderStyle: "dashed",
    backgroundColor: "transparent",
  },
  quickButtonIcon: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  quickButtonLabel: {
    fontSize: 10,
    textAlign: "center",
  },
  carouselContainer: {
    flex: 1,
  },
  carouselContent: {
    paddingVertical: Spacing.sm,
  },
  carouselItem: {
    height: CAROUSEL_CARD_HEIGHT,
  },
  carouselIndicators: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  indicator: {
    height: 6,
    borderRadius: 3,
  },
  footerText: {
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  quickActionsContainer: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0px 8px 32px rgba(0, 0, 0, 0.3)",
      },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 12,
      },
    }),
  },
  quickActionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  quickActionsTitle: {
    fontWeight: "700",
  },
  quickActionItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  quickActionItemPressed: {
    opacity: 0.7,
  },
  quickActionIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(99, 102, 241, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  quickActionLabel: {
    flex: 1,
    fontWeight: "600",
  },
  collapsedPeek: {
    position: "absolute",
    top: HANDLE_HEIGHT,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.md,
  },
  collapsedPeekHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  collapsedPeekTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  collapsedPeekText: {
    fontWeight: "600",
    fontSize: 12,
  },
  collapsedPeekDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#6366F1",
    marginLeft: 2,
  },
  collapsedQuickButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  collapsedQuickButton: {
    flex: 1,
    height: 48,
    minWidth: 48,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  mainContent: {
    flex: 1,
  },
  editorModal: {
    flex: 1,
    justifyContent: "flex-end",
  },
  editorContainer: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    maxHeight: "80%",
  },
  editorHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  editorSubtitle: {
    marginBottom: Spacing.lg,
  },
  editorSection: {
    marginBottom: Spacing.lg,
  },
  editorSectionTitle: {
    marginBottom: Spacing.sm,
    fontWeight: "600",
  },
  editorItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
  },
  editorItemDisabled: {
    opacity: 0.5,
  },
  editorItemLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  editorItemActions: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  editorActionBtn: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  editorActionBtnDisabled: {
    opacity: 0.3,
  },
});

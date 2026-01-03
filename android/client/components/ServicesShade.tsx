import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  ScrollView,
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

type ViewMode = "grid" | "carousel";
type ShadePosition = "collapsed" | "half" | "full";

const SPRING_CONFIG = {
  damping: 26,
  stiffness: 160,
  mass: 0.8,
  overshootClamping: true,
};

const CAROUSEL_CARD_HEIGHT = 240;
const HEADER_HEIGHT = 60;
const HANDLE_HEIGHT = 24;

interface ServicesShadeProps {
  apps: AppCardData[];
  onViewModeChange?: (mode: ViewMode) => void;
  onShadePositionChange?: (position: ShadePosition) => void;
}

interface QuickAction {
  id: string;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}

export function ServicesShade({
  apps,
  onViewModeChange,
  onShadePositionChange,
}: ServicesShadeProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [shadePosition, setShadePosition] = useState<ShadePosition>("half");
  const [isScrollEnabled, setIsScrollEnabled] = useState(true);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [selectedApp, setSelectedApp] = useState<AppCardData | null>(null);

  const getShadePositions = useCallback(() => {
    const bottomSafeArea = insets.bottom;
    const topSafeArea = insets.top;
    
    const collapsedHeight = HANDLE_HEIGHT + Spacing.lg + bottomSafeArea;
    
    const carouselOptimalHeight = CAROUSEL_CARD_HEIGHT + HEADER_HEIGHT + HANDLE_HEIGHT + Spacing.xl * 2 + bottomSafeArea;
    
    const halfHeight = viewMode === "carousel" 
      ? carouselOptimalHeight
      : screenHeight * 0.5;
    
    const fullHeight = screenHeight - topSafeArea - Spacing.lg;
    
    return {
      collapsed: collapsedHeight,
      half: halfHeight,
      full: fullHeight,
    };
  }, [screenHeight, insets.bottom, insets.top, viewMode]);

  const positions = getShadePositions();
  const shadeHeight = useSharedValue(positions.half);
  const backdropOpacity = useSharedValue(0);
  const startHeight = useSharedValue(positions.half);

  useEffect(() => {
    const newPositions = getShadePositions();
    shadeHeight.value = withSpring(newPositions[shadePosition], SPRING_CONFIG);
  }, [screenHeight, shadePosition, getShadePositions, shadeHeight]);

  useEffect(() => {
    const newPositions = getShadePositions();
    if (shadePosition === "half") {
      shadeHeight.value = withSpring(newPositions.half, SPRING_CONFIG);
    }
  }, [viewMode, getShadePositions, shadeHeight, shadePosition]);

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

  const handleViewModeSwitch = useCallback((newMode: ViewMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setViewMode(newMode);
    onViewModeChange?.(newMode);
  }, [onViewModeChange]);

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

  const quickActions: QuickAction[] = useMemo(() => {
    if (!selectedApp) return [];

    return [
      {
        id: "ask-zeke",
        icon: "message-circle",
        label: `Ask ZEKE about ${selectedApp.title}`,
        onPress: () => {
          closeQuickActions();
        },
      },
      {
        id: "view-activity",
        icon: "activity",
        label: "View ZEKE's recent actions",
        onPress: () => {
          closeQuickActions();
        },
      },
      {
        id: "configure",
        icon: "settings",
        label: `Configure ${selectedApp.title}`,
        onPress: () => {
          closeQuickActions();
          selectedApp.onPress();
        },
      },
    ];
  }, [selectedApp, closeQuickActions]);

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
        currentPositions.full
      );
    })
    .onEnd((event) => {
      const currentPositions = getShadePositions();
      const velocity = -event.velocityY;
      const currentHeight = shadeHeight.value;
      
      const positionList = [
        { key: "collapsed" as ShadePosition, value: currentPositions.collapsed },
        { key: "half" as ShadePosition, value: currentPositions.half },
        { key: "full" as ShadePosition, value: currentPositions.full },
      ];
      
      let targetPosition: ShadePosition = "half";
      
      if (Math.abs(velocity) > 500) {
        if (velocity > 0) {
          if (currentHeight < currentPositions.half) {
            targetPosition = "half";
          } else {
            targetPosition = "full";
          }
        } else {
          if (currentHeight > currentPositions.half) {
            targetPosition = "half";
          } else {
            targetPosition = "collapsed";
          }
        }
      } else {
        let minDist = Infinity;
        for (const pos of positionList) {
          const dist = Math.abs(currentHeight - pos.value);
          if (dist < minDist) {
            minDist = dist;
            targetPosition = pos.key;
          }
        }
      }
      
      runOnJS(snapToPosition)(targetPosition);
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
    });

  const shadeAnimatedStyle = useAnimatedStyle(() => ({
    height: shadeHeight.value,
  }));

  const handleIndicatorOpacity = useAnimatedStyle(() => {
    const currentPositions = getShadePositions();
    return {
      opacity: interpolate(
        shadeHeight.value,
        [currentPositions.collapsed, currentPositions.half],
        [1, 0.6],
        Extrapolation.CLAMP
      ),
    };
  });

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const numColumns = 2;
  const cardSpacing = Spacing.md;
  const horizontalPadding = Spacing.lg;
  const cardWidth = (screenWidth - horizontalPadding * 2 - cardSpacing * (numColumns - 1)) / numColumns;

  const renderHeader = () => (
    <View style={styles.header}>
      <Pressable
        onPress={() => handleViewModeSwitch("grid")}
        style={[
          styles.viewModeButton,
          viewMode === "grid" && styles.viewModeButtonActive,
        ]}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Grid view"
      >
        <Feather 
          name="grid" 
          size={20} 
          color={viewMode === "grid" ? "#6366F1" : theme.textSecondary} 
        />
      </Pressable>

      <View style={styles.headerCenter}>
        <ThemedText type="h3" style={[styles.headerTitle, { color: theme.text }]}>
          Services
        </ThemedText>
        <ThemedText type="caption" style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
          {apps.length} available
        </ThemedText>
      </View>

      <Pressable
        onPress={() => handleViewModeSwitch("carousel")}
        style={[
          styles.viewModeButton,
          viewMode === "carousel" && styles.viewModeButtonActive,
        ]}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Stack view"
      >
        <Feather 
          name="layers" 
          size={20} 
          color={viewMode === "carousel" ? "#6366F1" : theme.textSecondary} 
        />
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <GestureDetector gesture={panGesture}>
        <Animated.View 
          style={[
            styles.shadeContainer, 
            { backgroundColor: theme.backgroundDefault },
            shadeAnimatedStyle
          ]}
        >
          <Animated.View style={[styles.handleContainer, handleIndicatorOpacity]}>
            <View style={[styles.handle, { backgroundColor: theme.border }]} />
          </Animated.View>

          {renderHeader()}

          {viewMode === "grid" ? (
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={[
                styles.gridScrollContent,
                {
                  paddingBottom: insets.bottom + 80,
                  paddingHorizontal: horizontalPadding,
                },
              ]}
              showsVerticalScrollIndicator={false}
              scrollEnabled={isScrollEnabled}
            >
              <View style={styles.grid}>
                {apps.map((app) => (
                  <View
                    key={app.id}
                    style={[styles.gridItem, { width: cardWidth }]}
                  >
                    <AppCard
                      {...app}
                      mode="grid"
                      size="medium"
                      onLongPress={() => handleAppLongPress(app)}
                    />
                  </View>
                ))}
              </View>

              <View style={styles.gridFooter}>
                <ThemedText type="caption" style={[styles.footerText, { color: theme.textSecondary }]}>
                  Swipe to browse - Long-press for actions
                </ThemedText>
              </View>
            </ScrollView>
          ) : (
            <View style={styles.carouselContainer}>
              <FlatList
                data={apps}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                snapToInterval={screenWidth * 0.85}
                decelerationRate="fast"
                contentContainerStyle={[
                  styles.carouselContent,
                  { paddingBottom: insets.bottom + 80 },
                ]}
                scrollEnabled={isScrollEnabled}
                renderItem={({ item, index }) => (
                  <View
                    style={[
                      styles.carouselItem,
                      {
                        width: screenWidth * 0.85,
                        marginLeft: index === 0 ? screenWidth * 0.075 : Spacing.md,
                        marginRight: index === apps.length - 1 ? screenWidth * 0.075 : 0,
                      },
                    ]}
                  >
                    <AppCard
                      {...item}
                      mode="carousel"
                      size="large"
                      onLongPress={() => handleAppLongPress(item)}
                    />
                  </View>
                )}
                keyExtractor={(item) => item.id}
              />

              <View style={styles.carouselFooter}>
                <ThemedText type="caption" style={[styles.footerText, { color: theme.textSecondary }]}>
                  Swipe to browse - Long-press for actions
                </ThemedText>
              </View>
            </View>
          )}
        </Animated.View>
      </GestureDetector>


      <Modal
        visible={showQuickActions}
        transparent
        animationType="none"
        onRequestClose={closeQuickActions}
      >
        <View style={styles.modalContainer}>
          <Animated.View style={[styles.modalBackdrop, backdropAnimatedStyle]}>
            {Platform.OS === "ios" ? (
              <BlurView
                intensity={isDark ? 40 : 30}
                tint={isDark ? "dark" : "light"}
                style={StyleSheet.absoluteFill}
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0, 0, 0, 0.7)" }]} />
            )}
            <Pressable style={StyleSheet.absoluteFill} onPress={closeQuickActions} />
          </Animated.View>

          <View style={[styles.quickActionsContainer, { bottom: insets.bottom + 100 }]}>
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
    paddingBottom: Spacing.md,
  },
  headerCenter: {
    alignItems: "center",
  },
  headerTitle: {
    fontWeight: "700",
  },
  headerSubtitle: {
    marginTop: 2,
  },
  viewModeButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewModeButtonActive: {
    backgroundColor: "rgba(99, 102, 241, 0.15)",
  },
  scrollView: {
    flex: 1,
  },
  gridScrollContent: {
    flexGrow: 1,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  gridItem: {
    marginBottom: Spacing.xs,
  },
  gridFooter: {
    marginTop: Spacing.xl,
    alignItems: "center",
    paddingBottom: Spacing.xl,
  },
  footerText: {
    textAlign: "center",
  },
  carouselContainer: {
    flex: 1,
  },
  carouselContent: {
    paddingVertical: Spacing.lg,
  },
  carouselItem: {
    height: 200,
  },
  carouselFooter: {
    alignItems: "center",
    paddingBottom: Spacing.lg,
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
});

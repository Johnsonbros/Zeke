import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Dimensions,
  Platform,
  Modal,
  Pressable,
  FlatList,
} from "react-native";
import { Feather } from "@expo/vector-icons";
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

import { AppCard, AppCardData } from "@/components/AppCard";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

type ViewMode = "grid" | "carousel";

interface ZekeServicesHubProps {
  apps: AppCardData[];
  onViewModeChange?: (mode: ViewMode) => void;
}

interface QuickAction {
  id: string;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}

const SPRING_CONFIG = {
  damping: 20,
  stiffness: 160,
  mass: 0.8,
};

export function ZekeServicesHub({
  apps,
  onViewModeChange,
}: ZekeServicesHubProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [selectedApp, setSelectedApp] = useState<AppCardData | null>(null);

  const translateX = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);
  const carouselIndex = useSharedValue(0);

  const handleViewModeSwitch = useCallback((newMode: ViewMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setViewMode(newMode);
    if (onViewModeChange) {
      onViewModeChange(newMode);
    }
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
          // TODO: Implement ask ZEKE functionality
        },
      },
      {
        id: "view-activity",
        icon: "activity",
        label: "View ZEKE's recent actions",
        onPress: () => {
          closeQuickActions();
          // TODO: Implement view activity functionality
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
    .enabled(viewMode === "grid")
    .onUpdate((event) => {
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      if (event.translationX > 100 && event.velocityX > 300) {
        // Swipe right - switch to carousel
        translateX.value = withSpring(0, SPRING_CONFIG);
        runOnJS(handleViewModeSwitch)("carousel");
      } else if (event.translationX < -100 && event.velocityX < -300) {
        // Swipe left - keep grid
        translateX.value = withSpring(0, SPRING_CONFIG);
      } else {
        translateX.value = withSpring(0, SPRING_CONFIG);
      }
    });

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value * 0.3 }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const numColumns = 2;
  const cardSpacing = Spacing.md;
  const horizontalPadding = Spacing.lg;
  const cardWidth = (SCREEN_WIDTH - horizontalPadding * 2 - cardSpacing * (numColumns - 1)) / numColumns;

  return (
    <View style={styles.container}>
      {viewMode === "grid" ? (
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.gridContainer, containerAnimatedStyle]}>
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={[
                styles.gridScrollContent,
                {
                  paddingTop: insets.top + Spacing.xl,
                  paddingBottom: insets.bottom + 120,
                  paddingHorizontal: horizontalPadding,
                },
              ]}
              showsVerticalScrollIndicator={false}
            >
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
                  <ThemedText type="h2" style={[styles.headerTitle, { color: theme.text }]}>
                    ZEKE Apps
                  </ThemedText>
                  <ThemedText type="small" style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
                    {apps.length} services available
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

              <View style={styles.grid}>
                {apps.map((app) => (
                  <View
                    key={app.id}
                    style={[
                      styles.gridItem,
                      { width: cardWidth },
                    ]}
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
                  Long-press any app for quick actions
                </ThemedText>
              </View>
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      ) : (
        <View style={styles.carouselContainer}>
          <View style={styles.carouselHeader}>
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
              <ThemedText type="small" style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
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

          <FlatList
            data={apps}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            snapToInterval={SCREEN_WIDTH * 0.85}
            decelerationRate="fast"
            contentContainerStyle={[
              styles.carouselContent,
              {
                paddingTop: Spacing.xl,
                paddingBottom: insets.bottom + 120,
              },
            ]}
            renderItem={({ item, index }) => (
              <View
                style={[
                  styles.carouselItem,
                  {
                    width: SCREEN_WIDTH * 0.85,
                    marginLeft: index === 0 ? SCREEN_WIDTH * 0.075 : Spacing.md,
                    marginRight: index === apps.length - 1 ? SCREEN_WIDTH * 0.075 : 0,
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

          <View style={[styles.carouselFooter, { paddingBottom: insets.bottom + 100 }]}>
            <ThemedText type="caption" style={[styles.footerText, { color: theme.textSecondary }]}>
              Swipe to browse • Long-press for actions
            </ThemedText>
          </View>
        </View>
      )}


      <Modal
        visible={showQuickActions}
        transparent
        animationType="none"
        onRequestClose={closeQuickActions}
      >
        <View style={styles.modalContainer}>
          <Animated.View
            style={[
              styles.modalBackdrop,
              backdropAnimatedStyle,
            ]}
          >
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

          <View style={[styles.quickActionsContainer, { bottom: insets.bottom + 140 }]}>
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
    flex: 1,
  },
  gridContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  gridScrollContent: {
    flexGrow: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xl,
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
  },
  footerText: {
    textAlign: "center",
  },
  carouselContainer: {
    flex: 1,
  },
  carouselHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  carouselContent: {
    paddingVertical: Spacing.lg,
  },
  carouselItem: {
    height: 240,
  },
  carouselFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
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

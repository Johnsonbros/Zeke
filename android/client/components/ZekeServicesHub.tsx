import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
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
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppCard, AppCardData } from "@/components/AppCard";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

const CAROUSEL_CARD_HEIGHT = 170;
const MAX_QUICK_BUTTONS = 4;
const QUICK_BUTTONS_STORAGE_KEY = "@zeke_quick_buttons";

interface ZekeServicesHubProps {
  apps: AppCardData[];
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

export function ZekeServicesHub({ apps }: ZekeServicesHubProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const flatListRef = useRef<FlatList>(null);

  const [showQuickActions, setShowQuickActions] = useState(false);
  const [selectedApp, setSelectedApp] = useState<AppCardData | null>(null);
  const [showQuickButtonEditor, setShowQuickButtonEditor] = useState(false);
  const [quickButtonIds, setQuickButtonIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    loadQuickButtonConfig();
  }, []);

  useEffect(() => {
    if (quickButtonIds.length === 0 && apps.length > 0) {
      const defaultIds = apps.slice(0, MAX_QUICK_BUTTONS).map(app => app.id);
      setQuickButtonIds(defaultIds);
      saveQuickButtonConfig(defaultIds);
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
    setQuickButtonIds(prev => {
      let newIds: string[];
      if (prev.includes(appId)) {
        newIds = prev.filter(id => id !== appId);
      } else if (prev.length < MAX_QUICK_BUTTONS) {
        newIds = [...prev, appId];
      } else {
        newIds = prev;
      }
      saveQuickButtonConfig(newIds);
      return newIds;
    });
  }, []);

  const handleMoveQuickButton = useCallback((appId: string, direction: "up" | "down") => {
    setQuickButtonIds(prev => {
      const index = prev.indexOf(appId);
      if (index === -1) return prev;
      
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      
      const newIds = [...prev];
      [newIds[index], newIds[newIndex]] = [newIds[newIndex], newIds[index]];
      saveQuickButtonConfig(newIds);
      return newIds;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

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

  const renderQuickButton = (app: AppCardData) => (
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
    >
      <View style={[styles.quickButtonIcon, { backgroundColor: `${app.gradientColors[0]}25` }]}>
        <Feather name={app.icon} size={18} color={app.gradientColors[0]} />
      </View>
      <ThemedText type="caption" numberOfLines={1} style={[styles.quickButtonLabel, { color: theme.text }]}>
        {app.title}
      </ThemedText>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerCenter}>
          <ThemedText type="h3" style={[styles.headerTitle, { color: theme.text }]}>
            Services
          </ThemedText>
          <ThemedText type="caption" style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
            {apps.length} available
          </ThemedText>
        </View>

        <Pressable
          onPress={() => setShowQuickButtonEditor(true)}
          style={styles.editButton}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Edit quick buttons"
        >
          <Feather name="edit-2" size={16} color={theme.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.quickButtonsContainer}>
        {quickButtonApps.map((app) => renderQuickButton(app))}
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
    flex: 1,
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
  editButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
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

import React, { useState, useCallback } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  interpolate,
  Easing,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, Colors, BorderRadius } from "@/constants/theme";
import { queryClient } from "@/lib/query-client";
import {
  getRecentActivities,
  type ActivityItem,
} from "@/lib/zeke-api-adapter";
import { getSpeakerColor } from "@/lib/speaker-matcher";
import { SpeakerTagList } from "@/components/SpeakerTag";

interface ActivityGroup {
  title: string;
  key: string;
  activities: ActivityItem[];
}

function groupActivitiesByDate(activities: ActivityItem[]): ActivityGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const groups: Record<string, ActivityItem[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    older: [],
  };

  for (const activity of activities) {
    const activityDate = new Date(activity.rawDate);
    const activityDay = new Date(
      activityDate.getFullYear(),
      activityDate.getMonth(),
      activityDate.getDate()
    );

    if (activityDay.getTime() >= today.getTime()) {
      groups.today.push(activity);
    } else if (activityDay.getTime() >= yesterday.getTime()) {
      groups.yesterday.push(activity);
    } else if (activityDay.getTime() >= lastWeek.getTime()) {
      groups.thisWeek.push(activity);
    } else {
      groups.older.push(activity);
    }
  }

  const sortByDate = (a: ActivityItem, b: ActivityItem) => 
    b.rawDate.getTime() - a.rawDate.getTime();

  const result: ActivityGroup[] = [];

  if (groups.today.length > 0) {
    result.push({ title: "Today", key: "today", activities: groups.today.sort(sortByDate) });
  }
  if (groups.yesterday.length > 0) {
    result.push({ title: "Yesterday", key: "yesterday", activities: groups.yesterday.sort(sortByDate) });
  }
  if (groups.thisWeek.length > 0) {
    result.push({ title: "This Week", key: "thisWeek", activities: groups.thisWeek.sort(sortByDate) });
  }
  if (groups.older.length > 0) {
    result.push({ title: "Older", key: "older", activities: groups.older.sort(sortByDate) });
  }

  return result;
}

interface AccordionSectionProps {
  group: ActivityGroup;
  defaultExpanded?: boolean;
}

function AccordionSection({ group, defaultExpanded = true }: AccordionSectionProps) {
  const { theme } = useTheme();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const rotation = useSharedValue(defaultExpanded ? 1 : 0);
  const height = useSharedValue(defaultExpanded ? 1 : 0);

  const toggleExpanded = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    rotation.value = withSpring(newExpanded ? 1 : 0, { damping: 15 });
    height.value = withTiming(newExpanded ? 1 : 0, {
      duration: 250,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
  };

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(rotation.value, [0, 1], [0, 180])}deg` }],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: height.value,
    maxHeight: interpolate(height.value, [0, 1], [0, 2000]),
    overflow: "hidden" as const,
  }));

  return (
    <View style={[styles.sectionContainer, { backgroundColor: theme.backgroundDefault }]}>
      <Pressable
        onPress={toggleExpanded}
        style={({ pressed }) => [
          styles.sectionHeader,
          pressed && { opacity: 0.7 },
        ]}
      >
        <View style={styles.sectionTitleRow}>
          <ThemedText type="h4">{group.title}</ThemedText>
          <View style={[styles.countBadge, { backgroundColor: `${Colors.dark.primary}20` }]}>
            <ThemedText type="caption" style={{ color: Colors.dark.primary }}>
              {group.activities.length}
            </ThemedText>
          </View>
        </View>
        <Animated.View style={chevronStyle}>
          <Feather name="chevron-up" size={20} color={theme.textSecondary} />
        </Animated.View>
      </Pressable>

      <Animated.View style={contentStyle}>
        <View style={styles.sectionContent}>
          {group.activities.map((activity, index) => (
            <ActivityRow
              key={activity.id}
              activity={activity}
              isLast={index === group.activities.length - 1}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

interface ActivityRowProps {
  activity: ActivityItem;
  isLast: boolean;
}

function ActivityRow({ activity, isLast }: ActivityRowProps) {
  const { theme } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);

  const getIconColor = (icon: string): string => {
    const iconColors: Record<string, string> = {
      mic: Colors.dark.primary,
      "message-circle": Colors.dark.accent,
      "check-square": Colors.dark.success,
      calendar: "#F59E0B",
      "shopping-cart": "#EC4899",
      user: Colors.dark.secondary,
    };
    return iconColors[icon] || Colors.dark.primary;
  };

  const iconColor = getIconColor(activity.icon);

  const handlePress = () => {
    if (activity.speakers && activity.speakers.length > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.activityRow,
        !isLast && styles.activityRowBorder,
        pressed && activity.speakers?.length ? { opacity: 0.8 } : null,
      ]}
    >
      <View style={[styles.activityIcon, { backgroundColor: `${iconColor}20` }]}>
        <Feather name={activity.icon} size={16} color={iconColor} />
      </View>
      
      <View style={styles.activityContent}>
        <ThemedText type="body" numberOfLines={isExpanded ? undefined : 2}>
          {activity.action}
        </ThemedText>
        <View style={styles.activityMeta}>
          <ThemedText type="caption" secondary>
            {activity.timestamp}
          </ThemedText>
          {activity.speakers && activity.speakers.length > 0 ? (
            <View style={styles.expandIndicator}>
              <Feather
                name={isExpanded ? "chevron-up" : "chevron-down"}
                size={12}
                color={theme.textSecondary}
              />
            </View>
          ) : null}
        </View>
        
        {isExpanded && activity.speakers && activity.speakers.length > 0 ? (
          <View style={styles.speakersContainer}>
            <SpeakerTagList
              speakers={activity.speakers.map((name, i) => ({
                label: name,
                color: getSpeakerColor(i),
              }))}
              size="small"
            />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function ActivityHistoryScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  
  let tabBarHeight = 0;
  try {
    tabBarHeight = useBottomTabBarHeight();
  } catch {
    tabBarHeight = insets.bottom + 60;
  }

  const {
    data: activities = [],
    isLoading,
    isRefetching,
  } = useQuery<ActivityItem[]>({
    queryKey: ["zeke-activity-history"],
    queryFn: () => getRecentActivities(50),
    staleTime: 30000,
  });

  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await queryClient.invalidateQueries({ queryKey: ["zeke-activity-history"] });
  }, []);

  const groupedActivities = groupActivitiesByDate(activities);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <ThemedText type="small" secondary style={{ marginTop: Spacing.md }}>
          Loading activity history...
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.backgroundRoot }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.md,
          paddingBottom: tabBarHeight + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={Colors.dark.primary}
          />
        }
      >
        {groupedActivities.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: theme.backgroundDefault }]}>
            <Feather name="inbox" size={48} color={theme.textSecondary} />
            <ThemedText type="h4" style={{ marginTop: Spacing.lg, textAlign: "center" }}>
              No activity yet
            </ThemedText>
            <ThemedText type="small" secondary style={{ marginTop: Spacing.sm, textAlign: "center" }}>
              Your recordings, messages, and tasks will appear here
            </ThemedText>
          </View>
        ) : (
          groupedActivities.map((group, index) => (
            <AccordionSection
              key={group.key}
              group={group}
              defaultExpanded={index === 0}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    padding: Spacing["2xl"],
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.xl,
  },
  sectionContainer: {
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  countBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  sectionContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: Spacing.md,
  },
  activityRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  activityContent: {
    flex: 1,
  },
  activityMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xs,
    gap: Spacing.sm,
  },
  expandIndicator: {
    marginLeft: "auto",
  },
  speakersContainer: {
    marginTop: Spacing.sm,
  },
});

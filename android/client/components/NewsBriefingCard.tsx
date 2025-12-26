import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Linking,
  ScrollView,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors, Gradients } from "@/constants/theme";

export interface NewsStory {
  id: string;
  headline: string;
  summary: string;
  source: string;
  sourceUrl: string;
  category: string;
  publishedAt: string;
  imageUrl?: string;
  urgency?: "normal" | "breaking";
}

interface NewsBriefingCardProps {
  story: NewsStory;
  onFeedback: (storyId: string, feedback: "up" | "down", reason?: string) => Promise<void>;
  isSubmitting?: boolean;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function getCategoryColor(category: string): string {
  const categoryColors: Record<string, string> = {
    Technology: "#6366F1",
    Business: "#10B981",
    Science: "#8B5CF6",
    Politics: "#EF4444",
    Entertainment: "#EC4899",
    Sports: "#F59E0B",
    Health: "#06B6D4",
    World: "#3B82F6",
  };
  return categoryColors[category] || Colors.dark.primary;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function NewsBriefingCard({
  story,
  onFeedback,
  isSubmitting = false,
}: NewsBriefingCardProps) {
  const { theme } = useTheme();
  const [feedbackState, setFeedbackState] = useState<"none" | "up" | "down" | "reason">("none");
  const [reason, setReason] = useState("");
  const [localSubmitting, setLocalSubmitting] = useState(false);

  const scaleUp = useSharedValue(1);
  const scaleDown = useSharedValue(1);

  const animatedUpStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleUp.value }],
  }));

  const animatedDownStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleDown.value }],
  }));

  const handleOpenLink = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Linking.openURL(story.sourceUrl);
    } catch (error) {
      console.error("Failed to open URL:", error);
    }
  };

  const handleThumbsUp = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scaleUp.value = withSpring(1.2, { damping: 10 }, () => {
      scaleUp.value = withSpring(1);
    });
    setFeedbackState("up");
    setLocalSubmitting(true);
    try {
      await onFeedback(story.id, "up");
    } finally {
      setLocalSubmitting(false);
    }
  };

  const handleThumbsDown = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scaleDown.value = withSpring(1.2, { damping: 10 }, () => {
      scaleDown.value = withSpring(1);
    });
    setFeedbackState("reason");
  };

  const handleSubmitReason = async () => {
    if (!reason.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLocalSubmitting(true);
    try {
      await onFeedback(story.id, "down", reason.trim());
      setFeedbackState("down");
    } catch {
      // Keep in reason state on error so user can retry
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLocalSubmitting(false);
    }
  };

  const handleCancelReason = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReason("");
    setFeedbackState("none");
  };

  const categoryColor = getCategoryColor(story.category);
  const isBreaking = story.urgency === "breaking";

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundDefault }]}>
      {isBreaking ? (
        <LinearGradient
          colors={["#EF4444", "#DC2626"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.breakingBanner}
        >
          <Feather name="zap" size={12} color="#FFFFFF" />
          <ThemedText type="caption" style={styles.breakingText}>
            BREAKING
          </ThemedText>
        </LinearGradient>
      ) : null}

      <View style={styles.header}>
        <View style={[styles.categoryBadge, { backgroundColor: `${categoryColor}20` }]}>
          <ThemedText type="caption" style={[styles.categoryText, { color: categoryColor }]}>
            {story.category}
          </ThemedText>
        </View>
        <View style={styles.metaRow}>
          <ThemedText type="caption" secondary>
            {story.source}
          </ThemedText>
          <View style={styles.dot} />
          <ThemedText type="caption" secondary>
            {formatRelativeTime(story.publishedAt)}
          </ThemedText>
        </View>
      </View>

      <Pressable onPress={handleOpenLink}>
        <ThemedText type="h4" style={styles.headline}>
          {story.headline}
        </ThemedText>
      </Pressable>

      <ThemedText type="small" secondary style={styles.summary} numberOfLines={3}>
        {story.summary}
      </ThemedText>

      <Pressable style={styles.linkRow} onPress={handleOpenLink}>
        <Feather name="external-link" size={14} color={Colors.dark.primary} />
        <ThemedText type="small" style={styles.linkText}>
          Read full article
        </ThemedText>
      </Pressable>

      <View style={styles.divider} />

      {feedbackState === "none" ? (
        <View style={styles.feedbackRow}>
          <ThemedText type="caption" secondary>
            Was this helpful?
          </ThemedText>
          <View style={styles.feedbackButtons}>
            <AnimatedPressable
              style={[styles.feedbackButton, animatedUpStyle]}
              onPress={handleThumbsUp}
              disabled={isSubmitting || localSubmitting}
            >
              {localSubmitting ? (
                <ActivityIndicator size="small" color={Colors.dark.success} />
              ) : (
                <Feather name="thumbs-up" size={20} color={Colors.dark.success} />
              )}
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.feedbackButton, animatedDownStyle]}
              onPress={handleThumbsDown}
              disabled={isSubmitting || localSubmitting}
            >
              <Feather name="thumbs-down" size={20} color={Colors.dark.error} />
            </AnimatedPressable>
          </View>
        </View>
      ) : feedbackState === "up" ? (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.feedbackConfirm}>
          <Feather name="check-circle" size={16} color={Colors.dark.success} />
          <ThemedText type="small" style={{ color: Colors.dark.success }}>
            Thanks! You'll see more like this.
          </ThemedText>
        </Animated.View>
      ) : feedbackState === "down" ? (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.feedbackConfirm}>
          <Feather name="check-circle" size={16} color={Colors.dark.primary} />
          <ThemedText type="small" style={{ color: Colors.dark.primary }}>
            Feedback sent to ZEKE
          </ThemedText>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.reasonContainer}>
          <ThemedText type="small" secondary style={styles.reasonLabel}>
            Tell ZEKE why:
          </ThemedText>
          <TextInput
            style={[styles.reasonInput, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
            placeholder="e.g., Not interested in this topic..."
            placeholderTextColor={theme.textSecondary}
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={2}
            maxLength={200}
          />
          <View style={styles.reasonActions}>
            <Pressable
              style={[styles.reasonButton, styles.cancelButton]}
              onPress={handleCancelReason}
              disabled={localSubmitting}
            >
              <ThemedText type="small">Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.reasonButton, styles.submitButton]}
              onPress={handleSubmitReason}
              disabled={localSubmitting}
            >
              {localSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <ThemedText type="small" style={{ color: "#FFFFFF" }}>
                  Send
                </ThemedText>
              )}
            </Pressable>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

interface NewsBriefingSectionProps {
  stories: NewsStory[];
  onFeedback: (storyId: string, feedback: "up" | "down", reason?: string) => Promise<void>;
  isLoading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

export function NewsBriefingSection({
  stories,
  onFeedback,
  isLoading = false,
  error = null,
  onRefresh,
}: NewsBriefingSectionProps) {
  const { theme } = useTheme();

  if (isLoading) {
    return (
      <View style={[styles.sectionContainer, { backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.sectionHeader}>
          <LinearGradient
            colors={Gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.sectionIcon}
          >
            <Feather name="rss" size={16} color="#FFFFFF" />
          </LinearGradient>
          <ThemedText type="h4">News</ThemedText>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
          <ThemedText type="small" secondary style={styles.loadingText}>
            Fetching your news...
          </ThemedText>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.sectionContainer, { backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.sectionHeader}>
          <LinearGradient
            colors={Gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.sectionIcon}
          >
            <Feather name="rss" size={16} color="#FFFFFF" />
          </LinearGradient>
          <ThemedText type="h4">News</ThemedText>
        </View>
        <View style={styles.errorContainer}>
          <Feather name="alert-circle" size={24} color={Colors.dark.error} />
          <ThemedText type="small" style={{ color: Colors.dark.error }}>
            {error}
          </ThemedText>
          {onRefresh ? (
            <Pressable style={styles.retryButton} onPress={onRefresh}>
              <ThemedText type="small" style={{ color: Colors.dark.primary }}>
                Try Again
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  if (stories.length === 0) {
    return (
      <View style={[styles.sectionContainer, { backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.sectionHeader}>
          <LinearGradient
            colors={Gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.sectionIcon}
          >
            <Feather name="rss" size={16} color="#FFFFFF" />
          </LinearGradient>
          <ThemedText type="h4">News</ThemedText>
        </View>
        <View style={styles.emptyContainer}>
          <Feather name="inbox" size={32} color={theme.textSecondary} />
          <ThemedText type="small" secondary style={styles.emptyText}>
            No news stories available
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.sectionWrapper}>
      <View style={styles.sectionHeader}>
        <LinearGradient
          colors={Gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.sectionIcon}
        >
          <Feather name="rss" size={16} color="#FFFFFF" />
        </LinearGradient>
        <ThemedText type="h4">News</ThemedText>
        <ThemedText type="caption" secondary style={styles.storyCount}>
          Top {stories.length} stories
        </ThemedText>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.storiesScrollContent}
        decelerationRate="fast"
        snapToInterval={320}
        snapToAlignment="start"
      >
        {stories.map((story) => (
          <View key={story.id} style={styles.storyCardWrapper}>
            <NewsBriefingCard story={story} onFeedback={onFeedback} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    width: 300,
  },
  breakingBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    marginHorizontal: -Spacing.lg,
    marginTop: -Spacing.lg,
    marginBottom: Spacing.md,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
  },
  breakingText: {
    color: "#FFFFFF",
    fontWeight: "700",
    letterSpacing: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  categoryBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  categoryText: {
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  headline: {
    marginBottom: Spacing.sm,
    lineHeight: 24,
  },
  summary: {
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  linkText: {
    color: Colors.dark.primary,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginVertical: Spacing.md,
  },
  feedbackRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  feedbackButtons: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  feedbackButton: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  feedbackConfirm: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  reasonContainer: {
    gap: Spacing.sm,
  },
  reasonLabel: {
    marginBottom: Spacing.xs,
  },
  reasonInput: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: "top",
  },
  reasonActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.sm,
  },
  reasonButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  cancelButton: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  submitButton: {
    backgroundColor: Colors.dark.primary,
  },
  sectionContainer: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  sectionWrapper: {
    marginVertical: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  storyCount: {
    marginLeft: "auto",
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
    gap: Spacing.md,
  },
  loadingText: {
    marginTop: Spacing.xs,
  },
  errorContainer: {
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
    gap: Spacing.md,
  },
  retryButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
    gap: Spacing.md,
  },
  emptyText: {
    textAlign: "center",
  },
  storiesScrollContent: {
    paddingHorizontal: Spacing.xs,
    gap: Spacing.md,
  },
  storyCardWrapper: {
    marginRight: Spacing.md,
  },
});

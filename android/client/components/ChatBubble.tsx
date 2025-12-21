import React, { useEffect } from "react";
import { View, StyleSheet, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Gradients, Fonts, Colors } from "@/constants/theme";

export interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: string;
  isCode?: boolean;
  channel?: "chat" | "sms";
}

interface ChatBubbleProps {
  message: Message;
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const { theme } = useTheme();
  const isUser = message.role === "user";
  const isSms = message.channel === "sms";

  // Channel indicator component
  const ChannelIndicator = isSms ? (
    <View style={styles.channelIndicator}>
      <Feather name="smartphone" size={10} color={Colors.dark.primary} />
      <ThemedText type="caption" style={styles.channelLabel}>SMS</ThemedText>
    </View>
  ) : null;

  if (isUser) {
    return (
      <View style={[styles.container, styles.userContainer]}>
        <LinearGradient
          colors={isSms ? [Colors.dark.secondary, Colors.dark.accent] : Gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.userBubble}
        >
          <ThemedText style={styles.userText}>{message.content}</ThemedText>
        </LinearGradient>
        <View style={styles.metaRow}>
          {ChannelIndicator}
          <ThemedText type="caption" secondary style={styles.timestamp}>
            {message.timestamp}
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, styles.assistantContainer]}>
      <View
        style={[
          styles.assistantBubble,
          { 
            backgroundColor: theme.backgroundDefault,
            borderLeftColor: isSms ? Colors.dark.primary : "transparent",
            borderLeftWidth: isSms ? 2 : 0,
          },
        ]}
      >
        {message.isCode ? (
          <View
            style={[
              styles.codeBlock,
              { backgroundColor: theme.backgroundSecondary },
            ]}
          >
            <Text
              style={[
                styles.codeText,
                { color: theme.text, fontFamily: Fonts?.mono || "monospace" },
              ]}
            >
              {message.content}
            </Text>
          </View>
        ) : (
          <ThemedText>{message.content}</ThemedText>
        )}
      </View>
      <View style={styles.metaRow}>
        {ChannelIndicator}
        <ThemedText type="caption" secondary style={styles.timestamp}>
          {message.timestamp}
        </ThemedText>
      </View>
    </View>
  );
}

function AnimatedDot({ delay, color }: { delay: number; color: string }) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-6, { duration: 300 }),
          withTiming(0, { duration: 300 })
        ),
        -1,
        false
      )
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 300 }),
          withTiming(0.4, { duration: 300 })
        ),
        -1,
        false
      )
    );
  }, [delay, translateY, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[styles.dot, { backgroundColor: color }, animatedStyle]}
    />
  );
}

export function TypingIndicator() {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, styles.assistantContainer]}>
      <View
        style={[
          styles.assistantBubble,
          styles.typingBubble,
          { backgroundColor: theme.backgroundDefault },
        ]}
      >
        <View style={styles.typingDots}>
          <AnimatedDot delay={0} color={theme.primary} />
          <AnimatedDot delay={150} color={theme.secondary} />
          <AnimatedDot delay={300} color={theme.accent} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
    maxWidth: "85%",
  },
  userContainer: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  assistantContainer: {
    alignSelf: "flex-start",
    alignItems: "flex-start",
  },
  userBubble: {
    borderRadius: BorderRadius.md,
    borderBottomRightRadius: BorderRadius.xs,
    padding: Spacing.md,
  },
  userText: {
    color: "#FFFFFF",
  },
  assistantBubble: {
    borderRadius: BorderRadius.md,
    borderBottomLeftRadius: BorderRadius.xs,
    padding: Spacing.md,
  },
  typingBubble: {
    paddingVertical: Spacing.lg,
  },
  timestamp: {
    marginTop: Spacing.xs,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xs,
    gap: Spacing.sm,
  },
  channelIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  channelLabel: {
    fontSize: 10,
    color: Colors.dark.primary,
  },
  codeBlock: {
    borderRadius: BorderRadius.xs,
    padding: Spacing.md,
    overflow: "hidden",
  },
  codeText: {
    fontSize: 14,
  },
  typingDots: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

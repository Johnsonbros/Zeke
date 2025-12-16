import React from "react";
import { View, StyleSheet, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Gradients, Fonts } from "@/constants/theme";

export interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: string;
  isCode?: boolean;
}

interface ChatBubbleProps {
  message: Message;
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const { theme } = useTheme();
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <View style={[styles.container, styles.userContainer]}>
        <LinearGradient
          colors={Gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.userBubble}
        >
          <ThemedText style={styles.userText}>{message.content}</ThemedText>
        </LinearGradient>
        <ThemedText type="caption" secondary style={styles.timestamp}>
          {message.timestamp}
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.container, styles.assistantContainer]}>
      <View style={[styles.assistantBubble, { backgroundColor: theme.backgroundDefault }]}>
        {message.isCode ? (
          <View style={[styles.codeBlock, { backgroundColor: theme.backgroundSecondary }]}>
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
      <ThemedText type="caption" secondary style={styles.timestamp}>
        {message.timestamp}
      </ThemedText>
    </View>
  );
}

export function TypingIndicator() {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, styles.assistantContainer]}>
      <View style={[styles.assistantBubble, styles.typingBubble, { backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.typingDots}>
          <View style={[styles.dot, { backgroundColor: theme.primary }]} />
          <View style={[styles.dot, { backgroundColor: theme.secondary }]} />
          <View style={[styles.dot, { backgroundColor: theme.accent }]} />
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

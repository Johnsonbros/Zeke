import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { ThemedText } from "./ThemedText";
import { Spacing } from "@/constants/theme";

interface SpeakerTagProps {
  label: string;
  color: string;
  isUnknown?: boolean;
  onPress?: () => void;
  size?: "small" | "medium";
}

export function SpeakerTag({
  label,
  color,
  isUnknown = false,
  onPress,
  size = "medium",
}: SpeakerTagProps) {
  const content = (
    <View
      style={[
        styles.container,
        { backgroundColor: `${color}20`, borderColor: `${color}40` },
        size === "small" && styles.containerSmall,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText
        style={[
          styles.label,
          { color },
          size === "small" && styles.labelSmall,
          isUnknown && styles.labelItalic,
        ]}
      >
        {label}
      </ThemedText>
      {isUnknown && onPress ? (
        <ThemedText style={[styles.assignHint, { color }]}>+</ThemedText>
      ) : null}
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }

  return content;
}

interface SpeakerTagListProps {
  speakers: Array<{ label: string; color: string; isUnknown?: boolean }>;
  onSpeakerPress?: (index: number) => void;
  size?: "small" | "medium";
}

export function SpeakerTagList({
  speakers,
  onSpeakerPress,
  size = "medium",
}: SpeakerTagListProps) {
  return (
    <View style={styles.list}>
      {speakers.map((speaker, index) => (
        <SpeakerTag
          key={index}
          label={speaker.label}
          color={speaker.color}
          isUnknown={speaker.isUnknown}
          onPress={onSpeakerPress ? () => onSpeakerPress(index) : undefined}
          size={size}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  containerSmall: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.xs,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
  },
  labelSmall: {
    fontSize: 12,
  },
  labelItalic: {
    fontStyle: "italic",
  },
  assignHint: {
    marginLeft: Spacing.xs,
    fontSize: 14,
    fontWeight: "700",
  },
  list: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
});

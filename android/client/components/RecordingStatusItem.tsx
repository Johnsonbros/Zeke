import React from "react";
import { View, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "./ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, Colors, BorderRadius } from "@/constants/theme";

interface RecordingStatusItemProps {
  id: string;
  filename: string;
  duration: number;
  status: "pending" | "syncing" | "synced" | "failed";
  attempts?: number;
  maxAttempts?: number;
  onRetry?: (id: string) => void;
}

export function RecordingStatusItem({
  id,
  filename,
  duration,
  status,
  attempts = 0,
  maxAttempts = 3,
  onRetry,
}: RecordingStatusItemProps) {
  const { theme } = useTheme();

  const getStatusIcon = () => {
    switch (status) {
      case "pending":
        return (
          <View style={[styles.statusDot, { backgroundColor: Colors.dark.warning }]} />
        );
      case "syncing":
        return (
          <ActivityIndicator
            size="small"
            color={Colors.dark.primary}
            style={styles.spinner}
          />
        );
      case "synced":
        return (
          <Feather
            name="check-circle"
            size={16}
            color={Colors.dark.success}
            style={styles.icon}
          />
        );
      case "failed":
        return (
          <Feather
            name="x-circle"
            size={16}
            color={Colors.dark.error}
            style={styles.icon}
          />
        );
    }
  };

  const getStatusText = () => {
    switch (status) {
      case "pending":
        return "Waiting";
      case "syncing":
        return "Uploading...";
      case "synced":
        return "Synced";
      case "failed":
        return `Failed (${attempts}/${maxAttempts})`;
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.backgroundDefault,
          borderLeftColor:
            status === "synced"
              ? Colors.dark.success
              : status === "failed"
                ? Colors.dark.error
                : status === "syncing"
                  ? Colors.dark.primary
                  : Colors.dark.warning,
        },
      ]}
    >
      <View style={styles.iconContainer}>{getStatusIcon()}</View>

      <View style={styles.contentContainer}>
        <ThemedText type="body" numberOfLines={1}>
          {filename.replace(/\.m4a$/, "")}
        </ThemedText>
        <View style={styles.metaRow}>
          <ThemedText type="small" secondary>
            {formatDuration(duration)}
          </ThemedText>
          <View style={styles.separator} />
          <ThemedText
            type="small"
            style={{
              color:
                status === "synced"
                  ? Colors.dark.success
                  : status === "failed"
                    ? Colors.dark.error
                    : Colors.dark.textSecondary,
            }}
          >
            {getStatusText()}
          </ThemedText>
        </View>
      </View>

      {status === "failed" && onRetry && (
        <Pressable
          onPress={() => onRetry(id)}
          style={({ pressed }) => [
            styles.retryButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="refresh-cw" size={14} color={Colors.dark.primary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    marginVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
  },
  iconContainer: {
    marginRight: Spacing.md,
    width: 20,
    justifyContent: "center",
  },
  spinner: {
    marginHorizontal: 2,
  },
  icon: {
    marginHorizontal: 2,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  contentContainer: {
    flex: 1,
    gap: Spacing.xs,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  separator: {
    width: 1,
    height: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  retryButton: {
    padding: Spacing.sm,
    marginLeft: Spacing.sm,
  },
});

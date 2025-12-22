import React from "react";
import { View, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "./ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useSync } from "@/hooks/useSync";
import { useUploadQueue } from "@/hooks/useUploadQueue";
import { Spacing, Colors, BorderRadius } from "@/constants/theme";

interface SyncStatusBarProps {
  onPressPending?: () => void;
}

export function SyncStatusBar({ onPressPending }: SyncStatusBarProps) {
  const { theme } = useTheme();
  const { isOnline } = useSync();
  const { stats, isProcessing, lastProgress } = useUploadQueue();

  const totalPending = stats.pending + stats.syncing;
  const showBar = !isOnline || totalPending > 0 || stats.failed > 0;

  if (!showBar) {
    return null;
  }

  return (
    <Pressable
      onPress={onPressPending}
      style={[
        styles.container,
        {
          backgroundColor: !isOnline
            ? Colors.dark.error + "20"
            : isProcessing
              ? Colors.dark.warning + "20"
              : stats.failed > 0
                ? Colors.dark.error + "20"
                : Colors.dark.primary + "20",
        },
      ]}
    >
      <View style={styles.leftContent}>
        {!isOnline ? (
          <>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: Colors.dark.error },
              ]}
            />
            <View style={styles.textContent}>
              <ThemedText type="small" style={styles.label}>
                Offline
              </ThemedText>
              <ThemedText type="caption" secondary>
                {totalPending > 0
                  ? `${totalPending} recording${totalPending !== 1 ? "s" : ""} waiting`
                  : "Waiting for network"}
              </ThemedText>
            </View>
          </>
        ) : isProcessing ? (
          <>
            <ActivityIndicator
              size="small"
              color={Colors.dark.primary}
              style={styles.spinner}
            />
            <View style={styles.textContent}>
              <ThemedText type="small" style={styles.label}>
                Syncing
              </ThemedText>
              <ThemedText type="caption" secondary>
                {lastProgress
                  ? `${lastProgress.status}`
                  : `${stats.syncing}/${totalPending} uploading`}
              </ThemedText>
            </View>
          </>
        ) : stats.failed > 0 ? (
          <>
            <Feather
              name="alert-circle"
              size={16}
              color={Colors.dark.error}
              style={styles.icon}
            />
            <View style={styles.textContent}>
              <ThemedText type="small" style={{ color: Colors.dark.error }}>
                Upload Failed
              </ThemedText>
              <ThemedText type="caption" secondary>
                {stats.failed} recording${stats.failed !== 1 ? "s" : ""} need retry
              </ThemedText>
            </View>
          </>
        ) : null}
      </View>

      {totalPending > 0 && (
        <View style={styles.badge}>
          <ThemedText type="caption" style={styles.badgeText}>
            {totalPending}
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.sm,
  },
  leftContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: Spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  spinner: {
    marginHorizontal: 4,
  },
  icon: {
    marginHorizontal: 4,
  },
  textContent: {
    flex: 1,
  },
  label: {
    fontWeight: "600",
  },
  badge: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    minWidth: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    color: "#fff",
    fontWeight: "600",
  },
});

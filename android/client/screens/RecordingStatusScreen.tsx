import React, { useEffect, useState } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

import { ThemedText } from "@/components/ThemedText";
import { RecordingStatusItem } from "@/components/RecordingStatusItem";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useSync } from "@/hooks/useSync";
import { useUploadQueue } from "@/hooks/useUploadQueue";
import { LocalAudioStorageService } from "@/lib/local-audio-storage";
import { Spacing, Colors, BorderRadius } from "@/constants/theme";

interface RecordingWithStatus {
  id: string;
  filename: string;
  duration: number;
  status: "pending" | "syncing" | "synced" | "failed";
  attempts: number;
  maxAttempts: number;
}

export default function RecordingStatusScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { isOnline } = useSync();
  const { stats, retryFailed, isProcessing } = useUploadQueue();
  const [recordings, setRecordings] = useState<RecordingWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadRecordings();
  }, []);

  const loadRecordings = async () => {
    setIsLoading(true);
    try {
      const [storageRecordings, queueItems] = await Promise.all([
        LocalAudioStorageService.getLocalRecordings(),
        LocalAudioStorageService.getSyncQueue(),
      ]);

      const mapped: RecordingWithStatus[] = storageRecordings.map((rec) => {
        const queueEntry = queueItems.find((q) => q.recordingId === rec.id);
        return {
          id: rec.id,
          filename: rec.filename,
          duration: rec.duration,
          status: rec.status as any,
          attempts: queueEntry?.attempts || 0,
          maxAttempts: queueEntry?.maxAttempts || 3,
        };
      });

      // Sort by newest first
      setRecordings(mapped.sort((a, b) => b.id.localeCompare(a.id)));
    } catch (error) {
      console.error("[RecordingStatus] Failed to load recordings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = async (recordingId: string) => {
    await retryFailed(recordingId);
    loadRecordings();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: tabBarHeight + Spacing.xl + 40,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={loadRecordings}
          tintColor={Colors.dark.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Status Overview */}
      <Card elevation={1} style={styles.overviewCard}>
        <View style={styles.statusGrid}>
          <View style={styles.statusItem}>
            <ThemedText type="h4" style={{ color: Colors.dark.warning }}>
              {stats.pending}
            </ThemedText>
            <ThemedText type="small" secondary>
              Pending
            </ThemedText>
          </View>

          <View style={styles.divider} />

          <View style={styles.statusItem}>
            <ThemedText type="h4" style={{ color: Colors.dark.primary }}>
              {stats.syncing}
            </ThemedText>
            <ThemedText type="small" secondary>
              Uploading
            </ThemedText>
          </View>

          <View style={styles.divider} />

          <View style={styles.statusItem}>
            <ThemedText type="h4" style={{ color: Colors.dark.success }}>
              {stats.synced}
            </ThemedText>
            <ThemedText type="small" secondary>
              Synced
            </ThemedText>
          </View>

          <View style={styles.divider} />

          <View style={styles.statusItem}>
            <ThemedText type="h4" style={{ color: Colors.dark.error }}>
              {stats.failed}
            </ThemedText>
            <ThemedText type="small" secondary>
              Failed
            </ThemedText>
          </View>
        </View>
      </Card>

      {/* Connection Status */}
      <Card
        elevation={1}
        style={[
          styles.statusCard,
          {
            backgroundColor: isOnline
              ? Colors.dark.success + "15"
              : Colors.dark.error + "15",
          },
        ]}
      >
        <View style={styles.connectionRow}>
          <View
            style={[
              styles.connectionDot,
              {
                backgroundColor: isOnline ? Colors.dark.success : Colors.dark.error,
              },
            ]}
          />
          <ThemedText
            style={{
              color: isOnline ? Colors.dark.success : Colors.dark.error,
              fontWeight: "600",
            }}
          >
            {isOnline ? "Online" : "Offline"}
          </ThemedText>
          {isProcessing && (
            <ThemedText type="small" secondary style={styles.processingText}>
              • Syncing...
            </ThemedText>
          )}
        </View>
      </Card>

      {/* Recordings List */}
      {recordings.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ThemedText type="body" secondary style={{ textAlign: "center" }}>
            No recordings yet
          </ThemedText>
        </View>
      ) : (
        <>
          <ThemedText
            type="small"
            secondary
            style={styles.listHeader}
          >
            {recordings.length} recording{recordings.length !== 1 ? "s" : ""}
          </ThemedText>
          <View style={styles.recordingsList}>
            {recordings.map((rec) => (
              <RecordingStatusItem
                key={rec.id}
                id={rec.id}
                filename={rec.filename}
                duration={rec.duration}
                status={rec.status}
                attempts={rec.attempts}
                maxAttempts={rec.maxAttempts}
                onRetry={rec.status === "failed" ? handleRetry : undefined}
              />
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  overviewCard: {
    marginBottom: Spacing.xl,
  },
  statusGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  statusItem: {
    flex: 1,
    alignItems: "center",
    gap: Spacing.xs,
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  statusCard: {
    marginBottom: Spacing.lg,
  },
  connectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  connectionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  processingText: {
    marginLeft: Spacing.sm,
  },
  listHeader: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  recordingsList: {
    gap: Spacing.sm,
  },
  emptyContainer: {
    paddingVertical: Spacing.xl * 2,
    justifyContent: "center",
    alignItems: "center",
  },
});

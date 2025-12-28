import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { ThemedText } from "@/components/ThemedText";
import { PulsingDot } from "@/components/PulsingDot";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors, Gradients } from "@/constants/theme";
import { bluetoothService, type BLEDevice, type ConnectionState } from "@/lib/bluetooth";
import { audioStreamer, type StreamingMetrics } from "@/lib/audioStreamer";

interface LimitlessHealthCardProps {
  onPress?: () => void;
}

function getBatteryColor(level: number | undefined): string {
  if (level === undefined) return Colors.dark.textSecondary;
  if (level > 50) return Colors.dark.success;
  if (level > 20) return Colors.dark.warning;
  return Colors.dark.error;
}

function formatLastSeen(timestamp: number | undefined): string {
  if (!timestamp) return "Never";
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}

export function LimitlessHealthCard({ onPress }: LimitlessHealthCardProps) {
  const { theme } = useTheme();
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    bluetoothService.getConnectionState()
  );
  const [connectedDevice, setConnectedDevice] = useState<BLEDevice | null>(null);
  const [lastSeenTimestamp, setLastSeenTimestamp] = useState<number | undefined>(
    Date.now()
  );
  const [streamingMetrics, setStreamingMetrics] = useState<StreamingMetrics | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    const unsubscribe = bluetoothService.onConnectionStateChange(
      (state, device) => {
        setConnectionState(state);
        setConnectedDevice(device);
        if (state === "connected") {
          setLastSeenTimestamp(Date.now());
        }
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = audioStreamer.onMetricsUpdate((metrics) => {
      setStreamingMetrics(metrics);
      setIsStreaming(audioStreamer.isStreaming());
    });
    return unsubscribe;
  }, []);

  const isConnected = connectionState === "connected";
  const batteryLevel = connectedDevice?.batteryLevel;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundDefault }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <LinearGradient
            colors={Gradients.accent}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconContainer}
          >
            <Feather name="circle" size={18} color="#FFFFFF" />
          </LinearGradient>
          <ThemedText type="h4" style={styles.title}>
            Limitless Pendant
          </ThemedText>
        </View>
        <View style={styles.statusBadge}>
          {isConnected ? (
            <PulsingDot color={Colors.dark.success} size={8} />
          ) : (
            <View style={[styles.statusDot, { backgroundColor: Colors.dark.error }]} />
          )}
          <ThemedText
            type="caption"
            style={[styles.statusText, { color: isConnected ? Colors.dark.success : Colors.dark.error }]}
          >
            {isConnected ? "Online" : "Offline"}
          </ThemedText>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <View style={styles.metricHeader}>
              <Feather name="battery" size={14} color={getBatteryColor(batteryLevel)} />
              <ThemedText type="caption" secondary style={styles.metricLabel}>
                Battery
              </ThemedText>
            </View>
            <ThemedText type="h4" style={{ color: getBatteryColor(batteryLevel) }}>
              {batteryLevel !== undefined ? `${batteryLevel}%` : "--"}
            </ThemedText>
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.metricItem}>
            <View style={styles.metricHeader}>
              <Feather name="activity" size={14} color={isConnected ? Colors.dark.success : Colors.dark.error} />
              <ThemedText type="caption" secondary style={styles.metricLabel}>
                Health
              </ThemedText>
            </View>
            <View style={styles.healthStatus}>
              <Feather 
                name={isConnected ? "check-circle" : "alert-circle"} 
                size={16} 
                color={isConnected ? Colors.dark.success : Colors.dark.error} 
              />
              <ThemedText 
                type="small" 
                style={[styles.healthText, { color: isConnected ? Colors.dark.success : Colors.dark.error }]}
              >
                {isConnected ? "Connected" : "Disconnected"}
              </ThemedText>
            </View>
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.metricItem}>
            <View style={styles.metricHeader}>
              <Feather name="clock" size={14} color={theme.textSecondary} />
              <ThemedText type="caption" secondary style={styles.metricLabel}>
                Last Seen
              </ThemedText>
            </View>
            <ThemedText type="small">
              {isConnected ? "Now" : formatLastSeen(lastSeenTimestamp)}
            </ThemedText>
          </View>
        </View>

        {connectedDevice?.name ? (
          <View style={styles.deviceInfoRow}>
            <Feather name="bluetooth" size={12} color={theme.textSecondary} />
            <ThemedText type="caption" secondary style={styles.deviceInfoText}>
              {connectedDevice.name}
            </ThemedText>
          </View>
        ) : null}

        {isStreaming && streamingMetrics ? (
          <View style={[styles.streamingIndicator, { backgroundColor: theme.backgroundSecondary }]}>
            <PulsingDot color={Colors.dark.success} size={6} />
            <ThemedText type="caption" style={{ color: Colors.dark.success, fontWeight: "600" }}>
              Streaming
            </ThemedText>
            <View style={styles.streamingDivider} />
            <Feather name="mic" size={12} color={theme.textSecondary} />
            <ThemedText type="caption" secondary>
              {streamingMetrics.framesReceived}
            </ThemedText>
            <Feather name="arrow-right" size={10} color={theme.textSecondary} />
            <Feather name="upload-cloud" size={12} color={theme.textSecondary} />
            <ThemedText type="caption" secondary>
              {streamingMetrics.framesSent}
            </ThemedText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    marginLeft: Spacing.xs,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    marginLeft: Spacing.xs,
  },
  content: {
    gap: Spacing.md,
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metricItem: {
    flex: 1,
    alignItems: "center",
    gap: Spacing.xs,
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  metricLabel: {
    marginLeft: 2,
  },
  metricDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  healthStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  healthText: {
    marginLeft: 2,
  },
  deviceInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  deviceInfoText: {
    marginLeft: 4,
  },
  streamingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.sm,
  },
  streamingDivider: {
    width: 1,
    height: 12,
    backgroundColor: Colors.dark.border,
    marginHorizontal: Spacing.xs,
  },
});

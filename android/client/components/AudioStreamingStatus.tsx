import React, { useState, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { PulsingDot } from "@/components/PulsingDot";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { audioStreamer, type StreamingMetrics } from "@/lib/audioStreamer";

interface AudioStreamingStatusProps {
  isVisible?: boolean;
  compact?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return "Never";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 1) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

export function AudioStreamingStatus({ isVisible = true, compact = false }: AudioStreamingStatusProps) {
  const { theme } = useTheme();
  const [metrics, setMetrics] = useState<StreamingMetrics>(audioStreamer.getMetrics());
  const [isStreaming, setIsStreaming] = useState(audioStreamer.isStreaming());

  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    const unsubscribe = audioStreamer.onMetricsUpdate((newMetrics) => {
      setMetrics(newMetrics);
      setIsStreaming(audioStreamer.isStreaming());
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isStreaming && metrics.wsConnected) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        -1,
        false
      );
    } else {
      pulseOpacity.value = withTiming(1);
    }
  }, [isStreaming, metrics.wsConnected, pulseOpacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  if (!isVisible) return null;

  const getStatusColor = () => {
    if (!isStreaming) return Colors.dark.textSecondary;
    if (!metrics.wsConnected) return Colors.dark.error;
    if (!metrics.configAcknowledged) return Colors.dark.warning;
    return Colors.dark.success;
  };

  const getStatusText = () => {
    if (!isStreaming) return "Idle";
    if (!metrics.wsConnected) return "Disconnected";
    if (!metrics.configAcknowledged) return "Configuring...";
    return "Streaming";
  };

  if (compact) {
    return (
      <View style={[styles.compactContainer, { backgroundColor: theme.backgroundSecondary }]}>
        <View style={styles.compactRow}>
          {isStreaming && metrics.wsConnected ? (
            <PulsingDot color={getStatusColor()} size={8} />
          ) : (
            <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
          )}
          <ThemedText type="caption" style={[styles.compactText, { color: getStatusColor() }]}>
            {getStatusText()}
          </ThemedText>
          {isStreaming && (
            <>
              <View style={styles.compactDivider} />
              <Feather name="mic" size={12} color={theme.textSecondary} />
              <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                {metrics.framesReceived}
              </ThemedText>
              <Feather name="arrow-right" size={10} color={theme.textSecondary} />
              <Feather name="upload-cloud" size={12} color={theme.textSecondary} />
              <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                {metrics.framesSent}
              </ThemedText>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <Card style={[styles.container, { backgroundColor: theme.backgroundDefault }]}>
      <View style={styles.header}>
        <Animated.View style={[styles.headerIcon, animatedStyle]}>
          <Feather 
            name={isStreaming ? "activity" : "pause-circle"} 
            size={20} 
            color={getStatusColor()} 
          />
        </Animated.View>
        <ThemedText type="h4" style={styles.title}>
          Audio Streaming
        </ThemedText>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor() + "20" }]}>
          {isStreaming && metrics.wsConnected ? (
            <PulsingDot color={getStatusColor()} size={6} />
          ) : null}
          <ThemedText type="caption" style={{ color: getStatusColor() }}>
            {getStatusText()}
          </ThemedText>
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <View style={[styles.metricCard, { backgroundColor: theme.backgroundSecondary }]}>
          <View style={styles.metricHeader}>
            <Feather name="mic" size={16} color={Colors.dark.primary} />
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              From Hardware
            </ThemedText>
          </View>
          <ThemedText type="h3" style={{ color: theme.text }}>
            {metrics.framesReceived}
          </ThemedText>
          <ThemedText type="caption" style={{ color: theme.textSecondary }}>
            frames ({formatBytes(metrics.bytesReceived)})
          </ThemedText>
          <ThemedText type="caption" style={{ color: theme.textSecondary, marginTop: 4 }}>
            Last: {formatTimeAgo(metrics.lastFrameTimestamp)}
          </ThemedText>
        </View>

        <View style={[styles.metricCard, { backgroundColor: theme.backgroundSecondary }]}>
          <View style={styles.metricHeader}>
            <Feather name="upload-cloud" size={16} color={Colors.dark.secondary} />
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              To Backend
            </ThemedText>
          </View>
          <ThemedText type="h3" style={{ color: theme.text }}>
            {metrics.framesSent}
          </ThemedText>
          <ThemedText type="caption" style={{ color: theme.textSecondary }}>
            packets ({formatBytes(metrics.bytesSent)})
          </ThemedText>
          <View style={[styles.connectionIndicator, { 
            backgroundColor: metrics.wsConnected ? Colors.dark.success + "20" : Colors.dark.error + "20" 
          }]}>
            <View style={[styles.connDot, { 
              backgroundColor: metrics.wsConnected ? Colors.dark.success : Colors.dark.error 
            }]} />
            <ThemedText type="caption" style={{ 
              color: metrics.wsConnected ? Colors.dark.success : Colors.dark.error 
            }}>
              {metrics.wsConnected ? "WS Connected" : "WS Disconnected"}
            </ThemedText>
          </View>
        </View>

        <View style={[styles.metricCard, { backgroundColor: theme.backgroundSecondary }]}>
          <View style={styles.metricHeader}>
            <Feather name="message-circle" size={16} color={Colors.dark.accent} />
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              Transcriptions
            </ThemedText>
          </View>
          <ThemedText type="h3" style={{ color: theme.text }}>
            {metrics.transcriptionsReceived}
          </ThemedText>
          <ThemedText type="caption" style={{ color: theme.textSecondary }}>
            received
          </ThemedText>
          <ThemedText type="caption" style={{ color: theme.textSecondary, marginTop: 4 }}>
            Last: {formatTimeAgo(metrics.lastTranscriptionTimestamp)}
          </ThemedText>
        </View>
      </View>

      <View style={[styles.pipelineStatus, { backgroundColor: theme.backgroundSecondary }]}>
        <ThemedText type="caption" style={{ color: theme.textSecondary }}>
          Pipeline Status
        </ThemedText>
        <View style={styles.pipelineRow}>
          <View style={styles.pipelineStep}>
            <Feather 
              name="bluetooth" 
              size={14} 
              color={metrics.framesReceived > 0 ? Colors.dark.success : theme.textSecondary} 
            />
            <ThemedText type="caption" style={{ 
              color: metrics.framesReceived > 0 ? Colors.dark.success : theme.textSecondary 
            }}>
              BLE
            </ThemedText>
          </View>
          <Feather name="chevron-right" size={14} color={theme.textSecondary} />
          <View style={styles.pipelineStep}>
            <Feather 
              name="smartphone" 
              size={14} 
              color={isStreaming ? Colors.dark.success : theme.textSecondary} 
            />
            <ThemedText type="caption" style={{ 
              color: isStreaming ? Colors.dark.success : theme.textSecondary 
            }}>
              App
            </ThemedText>
          </View>
          <Feather name="chevron-right" size={14} color={theme.textSecondary} />
          <View style={styles.pipelineStep}>
            <Feather 
              name="server" 
              size={14} 
              color={metrics.wsConnected ? Colors.dark.success : theme.textSecondary} 
            />
            <ThemedText type="caption" style={{ 
              color: metrics.wsConnected ? Colors.dark.success : theme.textSecondary 
            }}>
              Server
            </ThemedText>
          </View>
          <Feather name="chevron-right" size={14} color={theme.textSecondary} />
          <View style={styles.pipelineStep}>
            <Feather 
              name="cloud" 
              size={14} 
              color={metrics.transcriptionsReceived > 0 ? Colors.dark.success : theme.textSecondary} 
            />
            <ThemedText type="caption" style={{ 
              color: metrics.transcriptionsReceived > 0 ? Colors.dark.success : theme.textSecondary 
            }}>
              ZEKE
            </ThemedText>
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  headerIcon: {
    marginRight: Spacing.sm,
  },
  title: {
    flex: 1,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  metricsGrid: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  metricCard: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  connectionIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
    marginTop: Spacing.xs,
  },
  connDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pipelineStatus: {
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  pipelineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
  },
  pipelineStep: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  compactContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  compactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  compactText: {
    fontWeight: "600",
  },
  compactDivider: {
    width: 1,
    height: 12,
    backgroundColor: Colors.dark.border,
    marginHorizontal: Spacing.xs,
  },
});

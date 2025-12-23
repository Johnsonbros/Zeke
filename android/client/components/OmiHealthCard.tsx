import React from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";

import { ThemedText } from "@/components/ThemedText";
import { PulsingDot } from "@/components/PulsingDot";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors, Gradients } from "@/constants/theme";
import { getOmiPendantHealth, type OmiPendantHealth } from "@/lib/zeke-api-adapter";

interface OmiHealthCardProps {
  onPress?: () => void;
}

function getHealthStatusColor(status: string): string {
  switch (status) {
    case "healthy":
    case "connected":
      return Colors.dark.success;
    case "warning":
    case "low_battery":
      return Colors.dark.warning;
    case "error":
    case "disconnected":
      return Colors.dark.error;
    default:
      return Colors.dark.textSecondary;
  }
}

function getHealthStatusIcon(status: string): keyof typeof Feather.glyphMap {
  switch (status) {
    case "healthy":
    case "connected":
      return "check-circle";
    case "warning":
    case "low_battery":
      return "alert-triangle";
    case "error":
    case "disconnected":
      return "alert-circle";
    default:
      return "help-circle";
  }
}

function formatLastSeen(dateStr: string | undefined): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}

function getBatteryIcon(level: number | undefined): keyof typeof Feather.glyphMap {
  if (level === undefined) return "battery";
  if (level > 80) return "battery";
  if (level > 50) return "battery";
  if (level > 20) return "battery";
  return "battery";
}

function getBatteryColor(level: number | undefined): string {
  if (level === undefined) return Colors.dark.textSecondary;
  if (level > 50) return Colors.dark.success;
  if (level > 20) return Colors.dark.warning;
  return Colors.dark.error;
}

export function OmiHealthCard({ onPress }: OmiHealthCardProps) {
  const { theme } = useTheme();
  
  const { data: health, isLoading, isError } = useQuery<OmiPendantHealth>({
    queryKey: ["omi-pendant-health"],
    queryFn: getOmiPendantHealth,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const statusColor = getHealthStatusColor(health?.status || "unknown");
  const statusIcon = getHealthStatusIcon(health?.status || "unknown");

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
            <Feather name="disc" size={18} color="#FFFFFF" />
          </LinearGradient>
          <ThemedText type="h4" style={styles.title}>
            Omi Pendant
          </ThemedText>
        </View>
        <View style={styles.statusBadge}>
          {isLoading ? (
            <ActivityIndicator size="small" color={Colors.dark.primary} />
          ) : (
            <>
              {health?.isConnected ? (
                <PulsingDot color={Colors.dark.success} size={8} />
              ) : (
                <View style={[styles.statusDot, { backgroundColor: Colors.dark.error }]} />
              )}
              <ThemedText
                type="caption"
                style={[styles.statusText, { color: health?.isConnected ? Colors.dark.success : Colors.dark.error }]}
              >
                {health?.isConnected ? "Online" : "Offline"}
              </ThemedText>
            </>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={Colors.dark.primary} />
          <ThemedText type="caption" secondary style={styles.loadingText}>
            Checking pendant status...
          </ThemedText>
        </View>
      ) : isError ? (
        <View style={styles.errorContainer}>
          <Feather name="alert-circle" size={20} color={Colors.dark.error} />
          <ThemedText type="small" style={[styles.errorText, { color: Colors.dark.error }]}>
            Unable to fetch pendant status
          </ThemedText>
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <View style={styles.metricHeader}>
                <Feather name={getBatteryIcon(health?.batteryLevel)} size={14} color={getBatteryColor(health?.batteryLevel)} />
                <ThemedText type="caption" secondary style={styles.metricLabel}>
                  Battery
                </ThemedText>
              </View>
              <ThemedText type="h4" style={{ color: getBatteryColor(health?.batteryLevel) }}>
                {health?.batteryLevel !== undefined ? `${health.batteryLevel}%` : "--"}
              </ThemedText>
            </View>

            <View style={styles.metricDivider} />

            <View style={styles.metricItem}>
              <View style={styles.metricHeader}>
                <Feather name="activity" size={14} color={statusColor} />
                <ThemedText type="caption" secondary style={styles.metricLabel}>
                  Health
                </ThemedText>
              </View>
              <View style={styles.healthStatus}>
                <Feather name={statusIcon} size={16} color={statusColor} />
                <ThemedText type="small" style={[styles.healthText, { color: statusColor }]}>
                  {health?.status ? health.status.charAt(0).toUpperCase() + health.status.slice(1) : "Unknown"}
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
                {formatLastSeen(health?.lastSeenAt)}
              </ThemedText>
            </View>
          </View>

          {health?.firmwareVersion ? (
            <View style={styles.firmwareRow}>
              <Feather name="cpu" size={12} color={theme.textSecondary} />
              <ThemedText type="caption" secondary style={styles.firmwareText}>
                Firmware: {health.firmwareVersion}
              </ThemedText>
              {health.firmwareUpdateAvailable ? (
                <View style={styles.updateBadge}>
                  <ThemedText type="caption" style={styles.updateText}>
                    Update Available
                  </ThemedText>
                </View>
              ) : null}
            </View>
          ) : null}

          {health?.storageUsed !== undefined && health?.storageTotal !== undefined ? (
            <View style={styles.storageRow}>
              <View style={styles.storageHeader}>
                <Feather name="hard-drive" size={12} color={theme.textSecondary} />
                <ThemedText type="caption" secondary style={styles.storageLabel}>
                  Storage: {health.storageUsed}MB / {health.storageTotal}MB
                </ThemedText>
              </View>
              <View style={styles.storageBar}>
                <View
                  style={[
                    styles.storageProgress,
                    {
                      width: `${(health.storageUsed / health.storageTotal) * 100}%`,
                      backgroundColor: health.storageUsed / health.storageTotal > 0.9 ? Colors.dark.error : Colors.dark.primary,
                    },
                  ]}
                />
              </View>
            </View>
          ) : null}

          {health?.lastError ? (
            <View style={styles.errorBanner}>
              <Feather name="alert-triangle" size={14} color={Colors.dark.warning} />
              <ThemedText type="caption" style={styles.errorBannerText}>
                {health.lastError}
              </ThemedText>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
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
  loadingContainer: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  loadingText: {
    marginTop: Spacing.xs,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  errorText: {
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
  firmwareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  firmwareText: {
    marginLeft: 4,
  },
  updateBadge: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    marginLeft: Spacing.sm,
  },
  updateText: {
    color: "#FFFFFF",
    fontSize: 10,
  },
  storageRow: {
    gap: Spacing.xs,
  },
  storageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  storageLabel: {
    marginLeft: 4,
  },
  storageBar: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 2,
    overflow: "hidden",
  },
  storageProgress: {
    height: "100%",
    borderRadius: 2,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: `${Colors.dark.warning}20`,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  errorBannerText: {
    flex: 1,
    color: Colors.dark.warning,
  },
});

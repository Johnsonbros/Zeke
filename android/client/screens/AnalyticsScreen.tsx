import React, { useMemo } from "react";
import { View, StyleSheet, ScrollView, Dimensions, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { getZekeDevices, getRecentMemories, ZekeDevice, ZekeMemory } from "@/lib/zeke-api-adapter";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CHART_HEIGHT = 120;

interface StatCardProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  trend?: string;
  trendPositive?: boolean;
}

function StatCard({ icon, label, value, trend, trendPositive }: StatCardProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.statCard, { backgroundColor: theme.backgroundDefault }]}>
      <View style={[styles.statIconContainer, { backgroundColor: theme.backgroundSecondary }]}>
        <Feather name={icon} size={20} color={Colors.dark.primary} />
      </View>
      <ThemedText type="caption" secondary style={styles.statLabel}>
        {label}
      </ThemedText>
      <ThemedText type="h2" style={styles.statValue}>
        {value}
      </ThemedText>
      {trend ? (
        <View style={styles.trendContainer}>
          <Feather
            name={trendPositive ? "trending-up" : "trending-down"}
            size={12}
            color={trendPositive ? Colors.dark.success : Colors.dark.error}
          />
          <ThemedText
            type="caption"
            style={{ color: trendPositive ? Colors.dark.success : Colors.dark.error, marginLeft: 4 }}
          >
            {trend}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

interface BarChartProps {
  data: { label: string; value: number }[];
  maxValue: number;
  color: string;
}

function BarChart({ data, maxValue, color }: BarChartProps) {
  const { theme } = useTheme();
  const safeMaxValue = maxValue > 0 ? maxValue : 1;

  return (
    <View style={styles.barChartContainer}>
      {data.map((item, index) => (
        <View key={index} style={styles.barColumn}>
          <View style={styles.barWrapper}>
            <View
              style={[
                styles.bar,
                {
                  height: `${(item.value / safeMaxValue) * 100}%`,
                  backgroundColor: color,
                },
              ]}
            />
          </View>
          <ThemedText type="caption" secondary style={styles.barLabel}>
            {item.label}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

interface PieSegmentProps {
  percentage: number;
  color: string;
  startAngle: number;
}

interface DeviceUsageRingProps {
  memories: ZekeMemory[];
}

function DeviceUsageRing({ memories }: DeviceUsageRingProps) {
  const { theme } = useTheme();
  
  const omiCount = memories.filter(m => m.deviceId?.toLowerCase().includes('omi')).length;
  const limitlessCount = memories.filter(m => m.deviceId?.toLowerCase().includes('limitless')).length;
  const otherCount = memories.length - omiCount - limitlessCount;
  const total = memories.length;
  const omiPercentage = total > 0 ? Math.round((omiCount / total) * 100) : 50;
  const limitlessPercentage = total > 0 ? Math.round((limitlessCount / total) * 100) : 50;

  return (
    <View style={styles.pieContainer}>
      <View style={styles.pieChart}>
        <View style={[styles.pieSegment, { backgroundColor: Colors.dark.primary }]} />
        <View
          style={[
            styles.pieOverlay,
            {
              backgroundColor: Colors.dark.secondary,
              transform: [{ rotate: `${(omiPercentage / 100) * 360}deg` }],
            },
          ]}
        />
        <View style={[styles.pieCenter, { backgroundColor: theme.backgroundDefault }]}>
          <ThemedText type="h3">{total}</ThemedText>
          <ThemedText type="caption" secondary>
            Total
          </ThemedText>
        </View>
      </View>
      <View style={styles.legendContainer}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.dark.primary }]} />
          <ThemedText type="small">Omi ({omiPercentage}%)</ThemedText>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.dark.secondary }]} />
          <ThemedText type="small">Limitless ({limitlessPercentage}%)</ThemedText>
        </View>
      </View>
    </View>
  );
}

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();

  const { data: devices = [], isLoading: isLoadingDevices } = useQuery({
    queryKey: ['/api/devices'],
    queryFn: getZekeDevices,
    staleTime: 30000,
  });

  const { data: memories = [], isLoading: isLoadingMemories } = useQuery({
    queryKey: ['/api/memories'],
    queryFn: () => getRecentMemories(100),
    staleTime: 30000,
  });

  const isLoading = isLoadingDevices || isLoadingMemories;

  const stats = useMemo(() => {
    const totalMemories = memories.length;
    const starredMemories = memories.filter(m => m.isStarred).length;
    const connectedDevices = devices.filter(d => d.isConnected).length;
    
    const totalSeconds = memories.reduce((acc, m) => {
      return acc + (m.duration || 0);
    }, 0);
    const totalHours = Math.round((totalSeconds / 3600) * 10) / 10;

    return {
      totalMemories,
      starredMemories,
      connectedDevices,
      totalHours,
    };
  }, [memories, devices]);

  const weeklyData = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts: Record<string, number> = {};
    days.forEach(d => counts[d] = 0);
    
    memories.forEach(memory => {
      const date = new Date(memory.createdAt);
      const day = days[date.getDay()];
      counts[day] = (counts[day] || 0) + 1;
    });
    
    return [
      { label: "Mon", value: counts["Mon"] },
      { label: "Tue", value: counts["Tue"] },
      { label: "Wed", value: counts["Wed"] },
      { label: "Thu", value: counts["Thu"] },
      { label: "Fri", value: counts["Fri"] },
      { label: "Sat", value: counts["Sat"] },
      { label: "Sun", value: counts["Sun"] },
    ];
  }, [memories]);

  const speakerData = useMemo(() => {
    const speakerCounts: Record<string, number> = {};
    memories.forEach(memory => {
      const speakers = Array.isArray(memory.speakers) ? memory.speakers : [];
      speakers.forEach((speaker: string) => {
        if (typeof speaker === 'string') {
          speakerCounts[speaker] = (speakerCounts[speaker] || 0) + 1;
        }
      });
    });
    
    return Object.entries(speakerCounts)
      .map(([speaker, count]) => ({ speaker, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [memories]);

  const avgDuration = useMemo(() => {
    if (memories.length === 0) return 0;
    const totalSeconds = memories.reduce((acc, m) => acc + (m.duration || 0), 0);
    return Math.round(totalSeconds / memories.length / 60);
  }, [memories]);

  const avgParticipants = useMemo(() => {
    if (memories.length === 0) return 0;
    const totalParticipants = memories.reduce((acc, m) => {
      const speakers = Array.isArray(m.speakers) ? m.speakers.length : 0;
      return acc + speakers;
    }, 0);
    return Math.round((totalParticipants / memories.length) * 10) / 10;
  }, [memories]);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <ThemedText type="body" secondary style={styles.loadingText}>
          Loading analytics...
        </ThemedText>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.statsGrid}>
        <StatCard
          icon="file-text"
          label="Total Memories"
          value={stats.totalMemories.toString()}
        />
        <StatCard
          icon="star"
          label="Starred"
          value={stats.starredMemories.toString()}
        />
        <StatCard
          icon="clock"
          label="Recording Hours"
          value={`${stats.totalHours}h`}
        />
        <StatCard
          icon="bluetooth"
          label="Active Devices"
          value={stats.connectedDevices.toString()}
        />
      </View>

      <Card elevation={1} style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <ThemedText type="h4">Weekly Activity</ThemedText>
          <ThemedText type="caption" secondary>
            Memories recorded per day
          </ThemedText>
        </View>
        <View style={styles.chartContent}>
          <BarChart
            data={weeklyData}
            maxValue={Math.max(...weeklyData.map(d => d.value), 1)}
            color={Colors.dark.primary}
          />
        </View>
      </Card>

      <Card elevation={1} style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <ThemedText type="h4">Device Usage</ThemedText>
          <ThemedText type="caption" secondary>
            Memories by device type
          </ThemedText>
        </View>
        <DeviceUsageRing memories={memories} />
      </Card>

      <Card elevation={1} style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <ThemedText type="h4">Top Speakers</ThemedText>
          <ThemedText type="caption" secondary>
            Most frequent conversation participants
          </ThemedText>
        </View>
        <View style={styles.speakerList}>
          {speakerData.length > 0 ? (
            speakerData.map((item, index) => (
              <View key={item.speaker} style={styles.speakerRow}>
                <View style={styles.speakerRank}>
                  <ThemedText type="caption" secondary>
                    {index + 1}
                  </ThemedText>
                </View>
                <ThemedText type="body" style={styles.speakerName}>
                  {item.speaker}
                </ThemedText>
                <View style={styles.speakerBarContainer}>
                  <View
                    style={[
                      styles.speakerBar,
                      {
                        width: `${(item.count / speakerData[0].count) * 100}%`,
                        backgroundColor: index === 0 ? Colors.dark.primary : Colors.dark.secondary,
                      },
                    ]}
                  />
                </View>
                <ThemedText type="small" secondary style={styles.speakerCount}>
                  {item.count}
                </ThemedText>
              </View>
            ))
          ) : (
            <ThemedText type="body" secondary style={styles.emptyText}>
              No speaker data available
            </ThemedText>
          )}
        </View>
      </Card>

      <Card elevation={1} style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <ThemedText type="h4">Recording Insights</ThemedText>
          <ThemedText type="caption" secondary>
            Summary of your activity
          </ThemedText>
        </View>
        <View style={styles.insightsList}>
          <View style={styles.insightRow}>
            <Feather name="mic" size={16} color={Colors.dark.success} />
            <ThemedText type="body" style={styles.insightText}>
              Average recording: {avgDuration > 0 ? `${avgDuration} minutes` : 'No data'}
            </ThemedText>
          </View>
          <View style={styles.insightRow}>
            <Feather name="users" size={16} color={Colors.dark.secondary} />
            <ThemedText type="body" style={styles.insightText}>
              Average participants: {avgParticipants > 0 ? `${avgParticipants} per memory` : 'No data'}
            </ThemedText>
          </View>
          <View style={styles.insightRow}>
            <Feather name="database" size={16} color={Colors.dark.primary} />
            <ThemedText type="body" style={styles.insightText}>
              Total memories: {stats.totalMemories}
            </ThemedText>
          </View>
          <View style={styles.insightRow}>
            <Feather name="bluetooth" size={16} color={Colors.dark.warning} />
            <ThemedText type="body" style={styles.insightText}>
              Connected devices: {stats.connectedDevices}
            </ThemedText>
          </View>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: Spacing.md,
  },
  emptyText: {
    textAlign: "center",
    paddingVertical: Spacing.lg,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  statCard: {
    width: (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.md) / 2,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  statLabel: {
    marginBottom: Spacing.xs,
  },
  statValue: {
    marginBottom: Spacing.xs,
  },
  trendContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  chartCard: {
    marginBottom: Spacing.lg,
  },
  chartHeader: {
    marginBottom: Spacing.lg,
  },
  chartContent: {
    height: CHART_HEIGHT,
  },
  barChartContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: "100%",
    paddingHorizontal: Spacing.sm,
  },
  barColumn: {
    flex: 1,
    alignItems: "center",
    height: "100%",
  },
  barWrapper: {
    flex: 1,
    width: "60%",
    justifyContent: "flex-end",
  },
  bar: {
    width: "100%",
    borderRadius: BorderRadius.xs,
    minHeight: 4,
  },
  barLabel: {
    marginTop: Spacing.xs,
  },
  pieContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: Spacing.md,
  },
  pieChart: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: "hidden",
    position: "relative",
  },
  pieSegment: {
    position: "absolute",
    width: "100%",
    height: "100%",
  },
  pieOverlay: {
    position: "absolute",
    width: "50%",
    height: "100%",
    right: 0,
    transformOrigin: "left center",
  },
  pieCenter: {
    position: "absolute",
    top: 20,
    left: 20,
    right: 20,
    bottom: 20,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  legendContainer: {
    gap: Spacing.sm,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  speakerList: {
    gap: Spacing.md,
  },
  speakerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  speakerRank: {
    width: 24,
    alignItems: "center",
  },
  speakerName: {
    width: 80,
  },
  speakerBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    borderRadius: 4,
    overflow: "hidden",
  },
  speakerBar: {
    height: "100%",
    borderRadius: 4,
  },
  speakerCount: {
    width: 24,
    textAlign: "right",
  },
  insightsList: {
    gap: Spacing.md,
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  insightText: {
    flex: 1,
  },
});

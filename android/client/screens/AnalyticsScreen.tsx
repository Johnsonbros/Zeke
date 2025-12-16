import React, { useMemo } from "react";
import { View, StyleSheet, ScrollView, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { mockMemories, mockDevices } from "@/lib/mockData";

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

  return (
    <View style={styles.barChartContainer}>
      {data.map((item, index) => (
        <View key={index} style={styles.barColumn}>
          <View style={styles.barWrapper}>
            <View
              style={[
                styles.bar,
                {
                  height: `${(item.value / maxValue) * 100}%`,
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

function DeviceUsageRing() {
  const { theme } = useTheme();
  
  const omiCount = mockMemories.filter(m => m.deviceType === "omi").length;
  const limitlessCount = mockMemories.filter(m => m.deviceType === "limitless").length;
  const total = omiCount + limitlessCount;
  const omiPercentage = total > 0 ? Math.round((omiCount / total) * 100) : 50;
  const limitlessPercentage = 100 - omiPercentage;

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

  const stats = useMemo(() => {
    const totalMemories = mockMemories.length;
    const starredMemories = mockMemories.filter(m => m.isStarred).length;
    const connectedDevices = mockDevices.filter(d => d.isConnected).length;
    
    const totalMinutes = mockMemories.reduce((acc, m) => {
      const match = m.duration?.match(/(\d+)/);
      return acc + (match ? parseInt(match[1], 10) : 0);
    }, 0);
    const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

    return {
      totalMemories,
      starredMemories,
      connectedDevices,
      totalHours,
    };
  }, []);

  const weeklyData = useMemo(() => {
    return [
      { label: "Mon", value: 3 },
      { label: "Tue", value: 5 },
      { label: "Wed", value: 2 },
      { label: "Thu", value: 7 },
      { label: "Fri", value: 4 },
      { label: "Sat", value: 1 },
      { label: "Sun", value: 2 },
    ];
  }, []);

  const speakerData = useMemo(() => {
    const speakerCounts: Record<string, number> = {};
    mockMemories.forEach(memory => {
      memory.speakers?.forEach(speaker => {
        speakerCounts[speaker] = (speakerCounts[speaker] || 0) + 1;
      });
    });
    
    return Object.entries(speakerCounts)
      .map(([speaker, count]) => ({ speaker, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, []);

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
          trend="+12% this week"
          trendPositive
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
          trend="+5% this week"
          trendPositive
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
            maxValue={Math.max(...weeklyData.map(d => d.value))}
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
        <DeviceUsageRing />
      </Card>

      <Card elevation={1} style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <ThemedText type="h4">Top Speakers</ThemedText>
          <ThemedText type="caption" secondary>
            Most frequent conversation participants
          </ThemedText>
        </View>
        <View style={styles.speakerList}>
          {speakerData.map((item, index) => (
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
          ))}
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
            <Feather name="sun" size={16} color={Colors.dark.warning} />
            <ThemedText type="body" style={styles.insightText}>
              Most active time: 9:00 AM - 11:00 AM
            </ThemedText>
          </View>
          <View style={styles.insightRow}>
            <Feather name="calendar" size={16} color={Colors.dark.primary} />
            <ThemedText type="body" style={styles.insightText}>
              Most productive day: Thursday
            </ThemedText>
          </View>
          <View style={styles.insightRow}>
            <Feather name="mic" size={16} color={Colors.dark.success} />
            <ThemedText type="body" style={styles.insightText}>
              Average recording: 31 minutes
            </ThemedText>
          </View>
          <View style={styles.insightRow}>
            <Feather name="users" size={16} color={Colors.dark.secondary} />
            <ThemedText type="body" style={styles.insightText}>
              Average participants: 2.4 per memory
            </ThemedText>
          </View>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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

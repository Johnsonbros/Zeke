import React, { useCallback } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";

import { ThemedText } from "@/components/ThemedText";
import { GradientText } from "@/components/GradientText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, Colors, BorderRadius, Gradients } from "@/constants/theme";
import {
  getTradingAccount,
  getTradingPositions,
  getTradingQuotes,
  getAgentStatus,
  getDecisionLogs,
  getRiskLimits,
  getPendingTrades,
} from "@/lib/zeke-api-adapter";

export default function TradingScreen() {
  const { colors } = useTheme();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();

  const { data: account, isLoading: accountLoading, refetch: refetchAccount } = useQuery({
    queryKey: ["trading", "account"],
    queryFn: getTradingAccount,
    staleTime: 30000,
  });

  const { data: positions, isLoading: positionsLoading, refetch: refetchPositions } = useQuery({
    queryKey: ["trading", "positions"],
    queryFn: getTradingPositions,
    staleTime: 30000,
  });

  const { data: quotes, isLoading: quotesLoading, refetch: refetchQuotes } = useQuery({
    queryKey: ["trading", "quotes"],
    queryFn: getTradingQuotes,
    staleTime: 15000,
  });

  const { data: agentStatus, isLoading: agentLoading, refetch: refetchAgent } = useQuery({
    queryKey: ["trading", "agent-status"],
    queryFn: getAgentStatus,
    staleTime: 10000,
  });

  const { data: decisions, isLoading: decisionsLoading, refetch: refetchDecisions } = useQuery({
    queryKey: ["trading", "decisions"],
    queryFn: getDecisionLogs,
    staleTime: 30000,
  });

  const { data: riskLimits, refetch: refetchRiskLimits } = useQuery({
    queryKey: ["trading", "risk-limits"],
    queryFn: getRiskLimits,
    staleTime: 60000,
  });

  const { data: pendingTrades, refetch: refetchPending } = useQuery({
    queryKey: ["trading", "pending"],
    queryFn: getPendingTrades,
    staleTime: 10000,
  });

  const isLoading = accountLoading || positionsLoading || agentLoading;
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refetchAccount(),
      refetchPositions(),
      refetchQuotes(),
      refetchAgent(),
      refetchDecisions(),
      refetchRiskLimits(),
      refetchPending(),
    ]);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      onRefresh();
    }, [])
  );

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(num);
  };

  const formatPnl = (value: number) => {
    const prefix = value >= 0 ? "+" : "";
    return prefix + formatCurrency(value);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundRoot }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: headerHeight + Spacing.md,
            paddingBottom: tabBarHeight + Spacing.xl + 80,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <GradientText style={styles.title} colors={Gradients.accent}>
            Trading
          </GradientText>
          <ThemedText style={styles.subtitle}>
            ZEKE Autonomous Trading
          </ThemedText>
        </View>

        {/* Agent Status Card */}
        <View style={[styles.card, { backgroundColor: colors.backgroundDefault }]}>
          <View style={styles.cardHeader}>
            <Feather name="cpu" size={18} color={colors.primary} />
            <ThemedText style={styles.cardTitle}>Agent Status</ThemedText>
            {agentStatus?.enabled && (
              <View style={[styles.statusBadge, { backgroundColor: Colors.light.success + "20" }]}>
                <View style={[styles.statusDot, { backgroundColor: Colors.light.success }]} />
                <ThemedText style={[styles.statusText, { color: Colors.light.success }]}>
                  Active
                </ThemedText>
              </View>
            )}
          </View>
          {agentLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : agentStatus ? (
            <View style={styles.agentInfo}>
              <View style={styles.agentRow}>
                <ThemedText style={styles.agentLabel}>Mode</ThemedText>
                <ThemedText style={styles.agentValue}>
                  {agentStatus.mode === "paper" ? "Paper Trading" : "Live Trading"}
                </ThemedText>
              </View>
              <View style={styles.agentRow}>
                <ThemedText style={styles.agentLabel}>Autonomy</ThemedText>
                <ThemedText style={styles.agentValue}>
                  {agentStatus.autonomy_tier.replace("_", " ").toUpperCase()}
                </ThemedText>
              </View>
              <View style={styles.agentRow}>
                <ThemedText style={styles.agentLabel}>Market</ThemedText>
                <ThemedText style={[
                  styles.agentValue,
                  { color: agentStatus.market_open ? Colors.light.success : Colors.light.error }
                ]}>
                  {agentStatus.market_open ? "Open" : "Closed"}
                </ThemedText>
              </View>
              <View style={styles.agentRow}>
                <ThemedText style={styles.agentLabel}>Trades Today</ThemedText>
                <ThemedText style={styles.agentValue}>{agentStatus.trades_today}</ThemedText>
              </View>
              {agentStatus.next_loop_in_seconds !== null && (
                <View style={styles.agentRow}>
                  <ThemedText style={styles.agentLabel}>Next Loop</ThemedText>
                  <ThemedText style={styles.agentValue}>
                    {Math.floor(agentStatus.next_loop_in_seconds / 60)}m {agentStatus.next_loop_in_seconds % 60}s
                  </ThemedText>
                </View>
              )}
            </View>
          ) : (
            <ThemedText style={styles.emptyText}>Agent status unavailable</ThemedText>
          )}
        </View>

        {/* Account Overview */}
        <View style={[styles.card, { backgroundColor: colors.backgroundDefault }]}>
          <View style={styles.cardHeader}>
            <Feather name="dollar-sign" size={18} color={colors.primary} />
            <ThemedText style={styles.cardTitle}>Account</ThemedText>
          </View>
          {accountLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : account ? (
            <View style={styles.accountGrid}>
              <View style={styles.accountItem}>
                <ThemedText style={styles.accountLabel}>Equity</ThemedText>
                <ThemedText style={styles.accountValue}>
                  {formatCurrency(account.equity)}
                </ThemedText>
              </View>
              <View style={styles.accountItem}>
                <ThemedText style={styles.accountLabel}>Cash</ThemedText>
                <ThemedText style={styles.accountValue}>
                  {formatCurrency(account.cash)}
                </ThemedText>
              </View>
              <View style={styles.accountItem}>
                <ThemedText style={styles.accountLabel}>Buying Power</ThemedText>
                <ThemedText style={styles.accountValue}>
                  {formatCurrency(account.buying_power)}
                </ThemedText>
              </View>
              <View style={styles.accountItem}>
                <ThemedText style={styles.accountLabel}>Day P&L</ThemedText>
                <ThemedText style={[
                  styles.accountValue,
                  { color: account.pnl_day >= 0 ? Colors.light.success : Colors.light.error }
                ]}>
                  {formatPnl(account.pnl_day)}
                </ThemedText>
              </View>
            </View>
          ) : (
            <ThemedText style={styles.emptyText}>Account data unavailable</ThemedText>
          )}
        </View>

        {/* Risk Limits */}
        {riskLimits && (
          <View style={[styles.card, { backgroundColor: colors.backgroundDefault }]}>
            <View style={styles.cardHeader}>
              <Feather name="shield" size={18} color={Colors.light.warning} />
              <ThemedText style={styles.cardTitle}>Risk Limits</ThemedText>
            </View>
            <View style={styles.riskGrid}>
              <View style={styles.riskItem}>
                <ThemedText style={styles.riskValue}>
                  {formatCurrency(riskLimits.max_dollars_per_trade)}
                </ThemedText>
                <ThemedText style={styles.riskLabel}>Per Trade</ThemedText>
              </View>
              <View style={styles.riskItem}>
                <ThemedText style={styles.riskValue}>
                  {riskLimits.max_open_positions}
                </ThemedText>
                <ThemedText style={styles.riskLabel}>Max Positions</ThemedText>
              </View>
              <View style={styles.riskItem}>
                <ThemedText style={styles.riskValue}>
                  {riskLimits.max_trades_per_day}
                </ThemedText>
                <ThemedText style={styles.riskLabel}>Trades/Day</ThemedText>
              </View>
              <View style={styles.riskItem}>
                <ThemedText style={styles.riskValue}>
                  {formatCurrency(riskLimits.max_daily_loss)}
                </ThemedText>
                <ThemedText style={styles.riskLabel}>Daily Loss Limit</ThemedText>
              </View>
            </View>
          </View>
        )}

        {/* Open Positions */}
        <View style={[styles.card, { backgroundColor: colors.backgroundDefault }]}>
          <View style={styles.cardHeader}>
            <Feather name="briefcase" size={18} color={colors.primary} />
            <ThemedText style={styles.cardTitle}>Positions</ThemedText>
            {positions && positions.length > 0 && (
              <View style={[styles.countBadge, { backgroundColor: colors.primary + "20" }]}>
                <ThemedText style={[styles.countText, { color: colors.primary }]}>
                  {positions.length}
                </ThemedText>
              </View>
            )}
          </View>
          {positionsLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : positions && positions.length > 0 ? (
            <View style={styles.positionsList}>
              {positions.map((pos) => (
                <View key={pos.symbol} style={[styles.positionCard, { backgroundColor: colors.backgroundSecondary }]}>
                  <View style={styles.positionHeader}>
                    <ThemedText style={styles.positionSymbol}>{pos.symbol}</ThemedText>
                    <ThemedText style={[
                      styles.positionPnl,
                      { color: parseFloat(pos.unrealized_pl) >= 0 ? Colors.light.success : Colors.light.error }
                    ]}>
                      {formatPnl(parseFloat(pos.unrealized_pl))}
                    </ThemedText>
                  </View>
                  <View style={styles.positionDetails}>
                    <View style={styles.positionDetail}>
                      <ThemedText style={styles.positionDetailLabel}>Qty</ThemedText>
                      <ThemedText style={styles.positionDetailValue}>
                        {parseFloat(pos.qty).toFixed(4)}
                      </ThemedText>
                    </View>
                    <View style={styles.positionDetail}>
                      <ThemedText style={styles.positionDetailLabel}>Entry</ThemedText>
                      <ThemedText style={styles.positionDetailValue}>
                        {formatCurrency(pos.avg_entry_price)}
                      </ThemedText>
                    </View>
                    <View style={styles.positionDetail}>
                      <ThemedText style={styles.positionDetailLabel}>Current</ThemedText>
                      <ThemedText style={styles.positionDetailValue}>
                        {formatCurrency(pos.current_price)}
                      </ThemedText>
                    </View>
                    <View style={styles.positionDetail}>
                      <ThemedText style={styles.positionDetailLabel}>Value</ThemedText>
                      <ThemedText style={styles.positionDetailValue}>
                        {formatCurrency(pos.market_value)}
                      </ThemedText>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Feather name="inbox" size={32} color={colors.textSecondary} />
              <ThemedText style={styles.emptyText}>No open positions</ThemedText>
            </View>
          )}
        </View>

        {/* Watchlist Quotes */}
        <View style={[styles.card, { backgroundColor: colors.backgroundDefault }]}>
          <View style={styles.cardHeader}>
            <Feather name="trending-up" size={18} color={colors.primary} />
            <ThemedText style={styles.cardTitle}>Watchlist</ThemedText>
          </View>
          {quotesLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : quotes && quotes.length > 0 ? (
            <View style={styles.quotesList}>
              {quotes.map((quote) => (
                <View key={quote.symbol} style={[styles.quoteRow, { borderBottomColor: colors.border }]}>
                  <ThemedText style={styles.quoteSymbol}>{quote.symbol}</ThemedText>
                  <View style={styles.quoteRight}>
                    <ThemedText style={styles.quotePrice}>
                      {formatCurrency(quote.price)}
                    </ThemedText>
                    <View style={[
                      styles.quoteChangeBadge,
                      { backgroundColor: quote.change >= 0 ? Colors.light.success + "20" : Colors.light.error + "20" }
                    ]}>
                      <ThemedText style={[
                        styles.quoteChange,
                        { color: quote.change >= 0 ? Colors.light.success : Colors.light.error }
                      ]}>
                        {quote.change >= 0 ? "+" : ""}{quote.change_pct.toFixed(2)}%
                      </ThemedText>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <ThemedText style={styles.emptyText}>No quotes available</ThemedText>
          )}
        </View>

        {/* Decision Log */}
        <View style={[styles.card, { backgroundColor: colors.backgroundDefault }]}>
          <View style={styles.cardHeader}>
            <Feather name="activity" size={18} color={colors.secondary} />
            <ThemedText style={styles.cardTitle}>Decision Log</ThemedText>
          </View>
          {decisionsLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : decisions && decisions.length > 0 ? (
            <View style={styles.decisionsList}>
              {decisions.slice(0, 10).map((decision) => (
                <View key={decision.id} style={[styles.decisionCard, { backgroundColor: colors.backgroundSecondary }]}>
                  <View style={styles.decisionHeader}>
                    <View style={[
                      styles.decisionTypeBadge,
                      {
                        backgroundColor:
                          decision.decision_type === "entry" ? Colors.light.success + "20" :
                          decision.decision_type === "exit" ? Colors.light.error + "20" :
                          colors.backgroundTertiary
                      }
                    ]}>
                      <Feather
                        name={
                          decision.decision_type === "entry" ? "arrow-up-right" :
                          decision.decision_type === "exit" ? "arrow-down-right" :
                          "minus"
                        }
                        size={12}
                        color={
                          decision.decision_type === "entry" ? Colors.light.success :
                          decision.decision_type === "exit" ? Colors.light.error :
                          colors.textSecondary
                        }
                      />
                      <ThemedText style={[
                        styles.decisionTypeText,
                        {
                          color:
                            decision.decision_type === "entry" ? Colors.light.success :
                            decision.decision_type === "exit" ? Colors.light.error :
                            colors.textSecondary
                        }
                      ]}>
                        {decision.decision_type.toUpperCase()}
                      </ThemedText>
                    </View>
                    {decision.symbol && (
                      <ThemedText style={styles.decisionSymbol}>{decision.symbol}</ThemedText>
                    )}
                    <ThemedText style={styles.decisionTime}>
                      {new Date(decision.timestamp).toLocaleTimeString()}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.decisionReason} numberOfLines={2}>
                    {decision.reason}
                  </ThemedText>
                  {decision.confidence !== undefined && (
                    <View style={styles.confidenceBar}>
                      <View style={styles.confidenceLabel}>
                        <ThemedText style={styles.confidenceText}>
                          Confidence: {(decision.confidence * 100).toFixed(0)}%
                        </ThemedText>
                      </View>
                      <View style={[styles.confidenceTrack, { backgroundColor: colors.backgroundTertiary }]}>
                        <View
                          style={[
                            styles.confidenceFill,
                            {
                              width: `${decision.confidence * 100}%`,
                              backgroundColor: colors.primary
                            }
                          ]}
                        />
                      </View>
                    </View>
                  )}
                  {decision.scored_signals && decision.scored_signals.length > 0 && (
                    <View style={styles.signalsPreview}>
                      <ThemedText style={styles.signalsLabel}>
                        Signals considered: {decision.signals_considered}
                      </ThemedText>
                    </View>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Feather name="clock" size={32} color={colors.textSecondary} />
              <ThemedText style={styles.emptyText}>No decisions yet</ThemedText>
              <ThemedText style={styles.emptySubtext}>
                Decisions will appear here as ZEKE analyzes the market
              </ThemedText>
            </View>
          )}
        </View>

        {/* Turtle Strategy Info */}
        <View style={[styles.card, { backgroundColor: colors.backgroundDefault }]}>
          <View style={styles.cardHeader}>
            <Feather name="target" size={18} color={colors.accent} />
            <ThemedText style={styles.cardTitle}>Turtle Strategy</ThemedText>
          </View>
          <View style={styles.strategyGrid}>
            <View style={[styles.strategyItem, { backgroundColor: colors.backgroundSecondary }]}>
              <ThemedText style={styles.strategyLabel}>Entry Systems</ThemedText>
              <ThemedText style={styles.strategyValue}>S1: 20d / S2: 55d</ThemedText>
            </View>
            <View style={[styles.strategyItem, { backgroundColor: colors.backgroundSecondary }]}>
              <ThemedText style={styles.strategyLabel}>Exit Channels</ThemedText>
              <ThemedText style={styles.strategyValue}>S1: 10d / S2: 20d</ThemedText>
            </View>
            <View style={[styles.strategyItem, { backgroundColor: colors.backgroundSecondary }]}>
              <ThemedText style={styles.strategyLabel}>Hard Stop</ThemedText>
              <ThemedText style={styles.strategyValue}>2N from entry</ThemedText>
            </View>
            <View style={[styles.strategyItem, { backgroundColor: colors.backgroundSecondary }]}>
              <ThemedText style={styles.strategyLabel}>Pyramiding</ThemedText>
              <ThemedText style={[styles.strategyValue, { color: Colors.light.error }]}>
                Disabled
              </ThemedText>
            </View>
          </View>
          <View style={[styles.scoringFormula, { backgroundColor: colors.backgroundSecondary }]}>
            <ThemedText style={styles.formulaTitle}>Scoring Formula</ThemedText>
            <ThemedText style={styles.formulaText}>
              3.0 x breakout + 1.0 x system + 1.0 x momentum - 1.0 x correlation
            </ThemedText>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: Spacing.xs,
  },
  card: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  countBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  countText: {
    fontSize: 12,
    fontWeight: "600",
  },
  agentInfo: {
    gap: Spacing.sm,
  },
  agentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  agentLabel: {
    fontSize: 14,
    opacity: 0.7,
  },
  agentValue: {
    fontSize: 14,
    fontWeight: "500",
  },
  accountGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  accountItem: {
    width: "47%",
  },
  accountLabel: {
    fontSize: 12,
    opacity: 0.6,
    marginBottom: 2,
  },
  accountValue: {
    fontSize: 18,
    fontWeight: "600",
  },
  riskGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  riskItem: {
    width: "47%",
    alignItems: "center",
    padding: Spacing.sm,
  },
  riskValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  riskLabel: {
    fontSize: 11,
    opacity: 0.6,
    marginTop: 2,
  },
  positionsList: {
    gap: Spacing.sm,
  },
  positionCard: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
  },
  positionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  positionSymbol: {
    fontSize: 18,
    fontWeight: "700",
  },
  positionPnl: {
    fontSize: 16,
    fontWeight: "600",
  },
  positionDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  positionDetail: {
    width: "47%",
  },
  positionDetailLabel: {
    fontSize: 11,
    opacity: 0.6,
  },
  positionDetailValue: {
    fontSize: 14,
    fontWeight: "500",
  },
  quotesList: {
    gap: 0,
  },
  quoteRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  quoteSymbol: {
    fontSize: 15,
    fontWeight: "600",
  },
  quoteRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  quotePrice: {
    fontSize: 15,
    fontWeight: "500",
  },
  quoteChangeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  quoteChange: {
    fontSize: 12,
    fontWeight: "600",
  },
  decisionsList: {
    gap: Spacing.sm,
  },
  decisionCard: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
  },
  decisionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  decisionTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    gap: 4,
  },
  decisionTypeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  decisionSymbol: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  decisionTime: {
    fontSize: 11,
    opacity: 0.6,
  },
  decisionReason: {
    fontSize: 13,
    opacity: 0.8,
    lineHeight: 18,
  },
  confidenceBar: {
    marginTop: Spacing.sm,
  },
  confidenceLabel: {
    marginBottom: 4,
  },
  confidenceText: {
    fontSize: 11,
    opacity: 0.7,
  },
  confidenceTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  confidenceFill: {
    height: "100%",
    borderRadius: 2,
  },
  signalsPreview: {
    marginTop: Spacing.sm,
  },
  signalsLabel: {
    fontSize: 11,
    opacity: 0.6,
  },
  strategyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  strategyItem: {
    width: "47%",
    padding: Spacing.sm,
    borderRadius: BorderRadius.xs,
    alignItems: "center",
  },
  strategyLabel: {
    fontSize: 11,
    opacity: 0.6,
    marginBottom: 2,
  },
  strategyValue: {
    fontSize: 13,
    fontWeight: "600",
  },
  scoringFormula: {
    padding: Spacing.md,
    borderRadius: BorderRadius.xs,
  },
  formulaTitle: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  formulaText: {
    fontSize: 11,
    opacity: 0.8,
    fontFamily: "monospace",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.6,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 12,
    opacity: 0.5,
    textAlign: "center",
  },
});

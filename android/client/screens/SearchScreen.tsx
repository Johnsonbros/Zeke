import React, { useState, useCallback } from "react";
import { View, FlatList, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";

import { ThemedText } from "@/components/ThemedText";
import { SearchBar } from "@/components/SearchBar";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { Memory } from "@/lib/storage";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, Colors, BorderRadius } from "@/constants/theme";
import { getApiUrl, isZekeSyncMode } from "@/lib/query-client";
import { searchMemories as searchZekeMemories } from "@/lib/zeke-api-adapter";

interface ApiDevice {
  id: string;
  name: string;
  type: string;
}

interface ApiMemory {
  id: string;
  deviceId: string;
  title: string;
  summary: string | null;
  transcript: string;
  speakers: string[] | null;
  actionItems: string[] | null;
  duration: number;
  isStarred: boolean;
  createdAt: string;
  updatedAt: string;
}

function formatTimestamp(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  
  const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isToday) return `Today, ${timeStr}`;
  if (isYesterday) return `Yesterday, ${timeStr}`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" }) + `, ${timeStr}`;
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  return `${mins} min`;
}

function mapApiMemoryToMemory(memory: ApiMemory, deviceType: "omi" | "limitless"): Memory {
  return {
    id: memory.id,
    title: memory.title,
    transcript: memory.transcript,
    timestamp: formatTimestamp(memory.createdAt),
    deviceType,
    speakers: memory.speakers ?? undefined,
    isStarred: memory.isStarred,
    duration: formatDuration(memory.duration),
  };
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const isSyncMode = isZekeSyncMode();

  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [activeSearchQuery, setActiveSearchQuery] = useState<string | null>(null);

  const { data: devicesData } = useQuery<ApiDevice[]>({
    queryKey: ['/api/devices'],
    enabled: !isSyncMode,
  });

  interface SemanticSearchResult extends ApiMemory {
    relevanceScore: number;
    matchReason?: string;
  }

  interface SemanticSearchResponse {
    results: SemanticSearchResult[];
    query: string;
    totalMatches: number;
  }

  const { data: searchResponse, isLoading: isSearching, isError } = useQuery<SemanticSearchResponse>({
    queryKey: isSyncMode ? ['zeke-search', activeSearchQuery] : ['/api/memories/search', activeSearchQuery],
    queryFn: async () => {
      if (!activeSearchQuery) return { results: [], query: '', totalMatches: 0 };
      
      if (isSyncMode) {
        const results = await searchZekeMemories(activeSearchQuery);
        return {
          results: results.map(m => ({
            id: m.id,
            deviceId: m.deviceId || 'zeke-main',
            title: m.title,
            summary: m.summary || null,
            transcript: m.transcript,
            speakers: m.speakers || null,
            actionItems: m.actionItems || null,
            duration: m.duration,
            isStarred: m.isStarred,
            createdAt: m.createdAt,
            updatedAt: m.updatedAt,
            relevanceScore: 100,
          })),
          query: activeSearchQuery,
          totalMatches: results.length,
        };
      } else {
        const url = new URL('/api/memories/search', getApiUrl());
        const res = await fetch(url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ query: activeSearchQuery, limit: 10 })
        });
        if (!res.ok) throw new Error('Failed to search memories');
        return res.json();
      }
    },
    enabled: !!activeSearchQuery,
  });

  const deviceTypeMap = new Map<string, "omi" | "limitless">();
  (devicesData ?? []).forEach(d => {
    deviceTypeMap.set(d.id, d.type as "omi" | "limitless");
  });

  const results: Memory[] = (searchResponse?.results ?? []).map(m => 
    mapApiMemoryToMemory(m, deviceTypeMap.get(m.deviceId) ?? "omi")
  );

  const handleSearch = useCallback(() => {
    if (!query.trim()) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveSearchQuery(query.trim());

    if (!recentSearches.includes(query.trim())) {
      setRecentSearches((prev) => [query.trim(), ...prev].slice(0, 10));
    }
  }, [query, recentSearches]);

  const handleRecentSearch = (search: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQuery(search);
    setActiveSearchQuery(search);
  };

  const handleClearRecent = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRecentSearches([]);
  };

  const handleMemoryPress = (memory: Memory) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const renderRecentSearches = () => (
    <View style={styles.recentSection}>
      <View style={styles.recentHeader}>
        <ThemedText type="h4">Recent Searches</ThemedText>
        {recentSearches.length > 0 ? (
          <Pressable
            onPress={handleClearRecent}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <ThemedText type="small" style={{ color: Colors.dark.primary }}>
              Clear
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
      {recentSearches.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.recentChips}
        >
          {recentSearches.map((search, index) => (
            <Pressable
              key={index}
              onPress={() => handleRecentSearch(search)}
              style={({ pressed }) => [
                styles.recentChip,
                { backgroundColor: theme.backgroundDefault, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Feather name="clock" size={14} color={theme.textSecondary} />
              <ThemedText type="small" style={{ color: Colors.dark.primary, marginLeft: Spacing.xs }}>
                {search}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <ThemedText type="body" secondary>No recent searches</ThemedText>
      )}

      <View style={styles.suggestionsSection}>
        <ThemedText type="h4" style={{ marginBottom: Spacing.md }}>
          AI-Powered Search
        </ThemedText>
        <ThemedText type="body" secondary>
          Try natural language queries like "meetings about budgets" or "what action items do I have?"
        </ThemedText>
      </View>
    </View>
  );

  const renderResults = () => {
    if (isSearching) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.dark.primary} />
          <ThemedText type="body" secondary style={{ marginTop: Spacing.md }}>
            AI is analyzing your memories...
          </ThemedText>
        </View>
      );
    }

    if (isError) {
      return (
        <EmptyState
          icon="alert-circle"
          title="Search failed"
          description="Something went wrong. Please try again."
        />
      );
    }

    if (results.length === 0) {
      return (
        <EmptyState
          icon="search"
          title="No results found"
          description={`We couldn't find any memories matching "${activeSearchQuery}". Try a different search term.`}
        />
      );
    }

    return (
      <View>
        <ThemedText type="small" secondary style={styles.resultsCount}>
          {results.length} result{results.length !== 1 ? "s" : ""} found
        </ThemedText>
        {results.map((memory) => (
          <Pressable
            key={memory.id}
            onPress={() => handleMemoryPress(memory)}
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          >
            <Card style={styles.resultCard}>
              <ThemedText type="body" style={{ fontWeight: "600" }} numberOfLines={1}>
                {memory.title}
              </ThemedText>
              <ThemedText type="small" secondary style={{ marginTop: Spacing.xs }}>
                {memory.timestamp} - {memory.duration}
              </ThemedText>
              <ThemedText type="caption" secondary numberOfLines={2} style={{ marginTop: Spacing.sm }}>
                {memory.transcript}
              </ThemedText>
            </Card>
          </Pressable>
        ))}
      </View>
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: tabBarHeight + Spacing.xl + 40,
        paddingHorizontal: Spacing.lg,
        flexGrow: 1,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <SearchBar
        value={query}
        onChangeText={setQuery}
        onSubmit={handleSearch}
        placeholder="Search your memories..."
        autoFocus={false}
      />

      {activeSearchQuery ? renderResults() : renderRecentSearches()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  recentSection: {
    marginTop: Spacing.xl,
  },
  recentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  recentChips: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingRight: Spacing.lg,
  },
  recentChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  suggestionsSection: {
    marginTop: Spacing["2xl"],
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: Spacing["3xl"],
  },
  resultsCount: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  resultCard: {
    marginBottom: Spacing.md,
  },
});

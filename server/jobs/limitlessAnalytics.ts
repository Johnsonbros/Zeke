/**
 * Limitless Analytics Aggregator
 * 
 * Computes daily analytics from lifelogs and stores pre-aggregated data.
 * Features:
 * - Daily conversation counts and durations
 * - Speaker frequency analysis
 * - Topic extraction and trending
 * - Hour-by-hour distribution
 * - Weekly/monthly trend computation
 */

import * as cron from "node-cron";
import {
  createOrUpdateLimitlessAnalyticsDaily,
  getLimitlessAnalyticsByDate,
  getRecentLimitlessAnalytics,
  getMeetingsByDate,
  getLifelogActionItemsByLifelog,
} from "../db";
import type { 
  InsertLimitlessAnalyticsDaily, 
  SpeakerStat, 
  TopicStat, 
  HourDistributionItem 
} from "@shared/schema";
import type { Lifelog, ContentNode } from "../limitless";

let scheduledTask: cron.ScheduledTask | null = null;

/**
 * Extract speaker statistics from lifelogs
 */
function extractSpeakerStats(lifelogs: Lifelog[]): SpeakerStat[] {
  const speakerMap = new Map<string, { count: number; durationMs: number }>();
  
  for (const lifelog of lifelogs) {
    const duration = new Date(lifelog.endTime).getTime() - new Date(lifelog.startTime).getTime();
    const speakers = new Set<string>();
    
    function extractSpeakers(node: ContentNode) {
      if (node.speakerName && node.speakerName !== "user") {
        speakers.add(node.speakerName);
      }
      if (node.children) {
        for (const child of node.children) {
          extractSpeakers(child);
        }
      }
    }
    
    for (const content of lifelog.contents || []) {
      extractSpeakers(content);
    }
    
    // Distribute duration evenly among speakers
    const durationPerSpeaker = speakers.size > 0 ? duration / speakers.size : 0;
    
    for (const speaker of speakers) {
      const existing = speakerMap.get(speaker) || { count: 0, durationMs: 0 };
      speakerMap.set(speaker, {
        count: existing.count + 1,
        durationMs: existing.durationMs + durationPerSpeaker,
      });
    }
  }
  
  return Array.from(speakerMap.entries())
    .map(([name, stats]) => ({
      name,
      count: stats.count,
      durationMinutes: Math.round(stats.durationMs / (1000 * 60)),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20); // Top 20 speakers
}

/**
 * Extract topics from lifelogs using simple keyword extraction
 */
function extractTopicStats(lifelogs: Lifelog[]): TopicStat[] {
  const topicCounts = new Map<string, number>();
  
  // Common topics/keywords to track
  const topicKeywords = [
    "meeting", "project", "deadline", "review", "call", "email",
    "lunch", "dinner", "coffee", "family", "kids", "school",
    "work", "home", "car", "travel", "vacation", "weekend",
    "money", "budget", "health", "doctor", "exercise",
    "shopping", "groceries", "plans", "schedule", "appointment",
  ];
  
  for (const lifelog of lifelogs) {
    const fullText = extractFullText(lifelog).toLowerCase();
    
    for (const topic of topicKeywords) {
      if (fullText.includes(topic)) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      }
    }
  }
  
  return Array.from(topicCounts.entries())
    .map(([topic, frequency]) => ({ topic, frequency }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 15); // Top 15 topics
}

/**
 * Extract full text from a lifelog
 */
function extractFullText(lifelog: Lifelog): string {
  const parts: string[] = [];
  
  function extractText(node: ContentNode) {
    if (node.content) {
      parts.push(node.content);
    }
    if (node.children) {
      for (const child of node.children) {
        extractText(child);
      }
    }
  }
  
  for (const content of lifelog.contents || []) {
    extractText(content);
  }
  
  return parts.join(" ");
}

/**
 * Compute hour-by-hour distribution
 */
function computeHourDistribution(lifelogs: Lifelog[]): HourDistributionItem[] {
  const hourCounts = new Array(24).fill(0);
  
  for (const lifelog of lifelogs) {
    const hour = new Date(lifelog.startTime).getHours();
    hourCounts[hour]++;
  }
  
  return hourCounts.map((count, hour) => ({ hour, count }));
}

/**
 * Aggregate analytics for a specific date
 */
export async function aggregateAnalyticsForDate(
  date: string, // YYYY-MM-DD format
  lifelogs: Lifelog[]
): Promise<InsertLimitlessAnalyticsDaily> {
  // Filter lifelogs for the specific date
  const dateLifelogs = lifelogs.filter(l => 
    l.startTime.startsWith(date)
  );
  
  // Calculate totals
  let totalDurationMinutes = 0;
  const uniqueSpeakers = new Set<string>();
  
  for (const lifelog of dateLifelogs) {
    const duration = new Date(lifelog.endTime).getTime() - new Date(lifelog.startTime).getTime();
    totalDurationMinutes += Math.round(duration / (1000 * 60));
    
    function extractSpeakers(node: ContentNode) {
      if (node.speakerName) {
        uniqueSpeakers.add(node.speakerName);
      }
      if (node.children) {
        for (const child of node.children) {
          extractSpeakers(child);
        }
      }
    }
    
    for (const content of lifelog.contents || []) {
      extractSpeakers(content);
    }
  }
  
  // Get meeting count for the day
  const meetings = getMeetingsByDate(date);
  
  // Count action items extracted for this date's lifelogs
  let actionItemsExtracted = 0;
  for (const lifelog of dateLifelogs) {
    const items = getLifelogActionItemsByLifelog(lifelog.id);
    actionItemsExtracted += items.length;
  }
  
  // Extract stats
  const speakerStats = extractSpeakerStats(dateLifelogs);
  const topicStats = extractTopicStats(dateLifelogs);
  const hourDistribution = computeHourDistribution(dateLifelogs);
  
  // Count starred lifelogs (if API provides this)
  const starredCount = dateLifelogs.filter(l => l.starred).length;
  
  return {
    date,
    totalConversations: dateLifelogs.length,
    totalDurationMinutes,
    uniqueSpeakers: uniqueSpeakers.size,
    speakerStats: JSON.stringify(speakerStats),
    topicStats: JSON.stringify(topicStats),
    hourDistribution: JSON.stringify(hourDistribution),
    meetingCount: meetings.length,
    actionItemsExtracted,
    starredCount,
  };
}

/**
 * Run analytics aggregation for today and store results
 */
export async function runDailyAnalyticsAggregation(
  lifelogs: Lifelog[]
): Promise<{ date: string; success: boolean }> {
  const today = new Date().toISOString().split("T")[0];
  
  try {
    const analytics = await aggregateAnalyticsForDate(today, lifelogs);
    createOrUpdateLimitlessAnalyticsDaily(analytics);
    
    console.log(`[LimitlessAnalytics] Aggregated analytics for ${today}: ${analytics.totalConversations} conversations, ${analytics.totalDurationMinutes} min`);
    
    return { date: today, success: true };
  } catch (error) {
    console.error(`[LimitlessAnalytics] Failed to aggregate for ${today}:`, error);
    return { date: today, success: false };
  }
}

/**
 * Get weekly trends from analytics data
 */
export function getWeeklyTrends(): {
  averageConversations: number;
  averageDuration: number;
  topSpeakers: SpeakerStat[];
  topTopics: TopicStat[];
  peakHours: number[];
  trend: "increasing" | "decreasing" | "stable";
} {
  const analytics = getRecentLimitlessAnalytics(7);
  
  if (analytics.length === 0) {
    return {
      averageConversations: 0,
      averageDuration: 0,
      topSpeakers: [],
      topTopics: [],
      peakHours: [],
      trend: "stable",
    };
  }
  
  // Aggregate stats
  let totalConversations = 0;
  let totalDuration = 0;
  const speakerAgg = new Map<string, { count: number; duration: number }>();
  const topicAgg = new Map<string, number>();
  const hourCounts = new Array(24).fill(0);
  
  for (const day of analytics) {
    totalConversations += day.totalConversations;
    totalDuration += day.totalDurationMinutes;
    
    try {
      const speakers = JSON.parse(day.speakerStats) as SpeakerStat[];
      for (const s of speakers) {
        const existing = speakerAgg.get(s.name) || { count: 0, duration: 0 };
        speakerAgg.set(s.name, {
          count: existing.count + s.count,
          duration: existing.duration + s.durationMinutes,
        });
      }
      
      const topics = JSON.parse(day.topicStats) as TopicStat[];
      for (const t of topics) {
        topicAgg.set(t.topic, (topicAgg.get(t.topic) || 0) + t.frequency);
      }
      
      const hours = JSON.parse(day.hourDistribution) as HourDistributionItem[];
      for (const h of hours) {
        hourCounts[h.hour] += h.count;
      }
    } catch {
      // Skip malformed JSON
    }
  }
  
  // Compute averages
  const days = analytics.length;
  const averageConversations = Math.round(totalConversations / days);
  const averageDuration = Math.round(totalDuration / days);
  
  // Top speakers
  const topSpeakers = Array.from(speakerAgg.entries())
    .map(([name, stats]) => ({ name, count: stats.count, durationMinutes: stats.duration }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  // Top topics
  const topTopics = Array.from(topicAgg.entries())
    .map(([topic, frequency]) => ({ topic, frequency }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 5);
  
  // Peak hours (hours with most conversations)
  const peakHours = hourCounts
    .map((count, hour) => ({ hour, count }))
    .filter(h => h.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(h => h.hour);
  
  // Determine trend (compare first half vs second half of week)
  let trend: "increasing" | "decreasing" | "stable" = "stable";
  if (analytics.length >= 4) {
    const midpoint = Math.floor(analytics.length / 2);
    const recentHalf = analytics.slice(0, midpoint);
    const olderHalf = analytics.slice(midpoint);
    
    const recentAvg = recentHalf.reduce((sum, d) => sum + d.totalConversations, 0) / recentHalf.length;
    const olderAvg = olderHalf.reduce((sum, d) => sum + d.totalConversations, 0) / olderHalf.length;
    
    const change = (recentAvg - olderAvg) / (olderAvg || 1);
    if (change > 0.1) trend = "increasing";
    else if (change < -0.1) trend = "decreasing";
  }
  
  return {
    averageConversations,
    averageDuration,
    topSpeakers,
    topTopics,
    peakHours,
    trend,
  };
}

/**
 * Schedule nightly analytics aggregation
 */
export function scheduleAnalyticsAggregation(
  fetchLifelogs: () => Promise<Lifelog[]>
): void {
  if (scheduledTask) {
    scheduledTask.stop();
  }
  
  // Run at 2 AM daily
  scheduledTask = cron.schedule(
    "0 2 * * *",
    async () => {
      console.log("[LimitlessAnalytics] Running nightly aggregation...");
      try {
        const lifelogs = await fetchLifelogs();
        await runDailyAnalyticsAggregation(lifelogs);
      } catch (error) {
        console.error("[LimitlessAnalytics] Nightly aggregation failed:", error);
      }
    },
    {
      timezone: "America/New_York",
    }
  );
  
  console.log("[LimitlessAnalytics] Scheduled nightly aggregation at 2 AM EST");
}

/**
 * Stop the scheduled aggregation
 */
export function stopAnalyticsAggregation(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log("[LimitlessAnalytics] Stopped analytics aggregation schedule");
  }
}

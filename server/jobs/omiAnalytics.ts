/**
 * Omi Analytics Aggregator
 * 
 * Computes daily analytics from memories and stores pre-aggregated data.
 * Features:
 * - Daily conversation counts and durations
 * - Speaker frequency analysis
 * - Topic extraction and trending
 * - Hour-by-hour distribution
 * - Weekly/monthly trend computation
 */

import * as cron from "node-cron";
import {
  createOrUpdateOmiAnalyticsDaily,
  getOmiAnalyticsByDate,
  getRecentOmiAnalytics,
  getMeetingsByDate,
  getMemoryActionItemsByMemory,
} from "../db";
import type { 
  InsertOmiAnalyticsDaily, 
  SpeakerStat, 
  TopicStat, 
  HourDistributionItem 
} from "@shared/schema";
import type { OmiMemoryData, TranscriptSegment } from "../omi";

let scheduledTask: cron.ScheduledTask | null = null;

/**
 * Extract speaker statistics from memories
 */
function extractSpeakerStats(memories: OmiMemoryData[]): SpeakerStat[] {
  const speakerMap = new Map<string, { count: number; durationMs: number }>();
  
  for (const memory of memories) {
    const duration = new Date(memory.finishedAt).getTime() - new Date(memory.startedAt).getTime();
    const speakers = new Set<string>();
    
    for (const segment of memory.transcriptSegments || []) {
      if (segment.speaker && !segment.isUser) {
        speakers.add(segment.speaker);
      }
    }
    
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
    .slice(0, 20);
}

/**
 * Extract topics from memories using simple keyword extraction
 */
function extractTopicStats(memories: OmiMemoryData[]): TopicStat[] {
  const topicCounts = new Map<string, number>();
  
  const topicKeywords = [
    "meeting", "project", "deadline", "review", "call", "email",
    "lunch", "dinner", "coffee", "family", "kids", "school",
    "work", "home", "car", "travel", "vacation", "weekend",
    "money", "budget", "health", "doctor", "exercise",
    "shopping", "groceries", "plans", "schedule", "appointment",
  ];
  
  for (const memory of memories) {
    const fullText = extractFullText(memory).toLowerCase();
    
    for (const topic of topicKeywords) {
      if (fullText.includes(topic)) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      }
    }
  }
  
  return Array.from(topicCounts.entries())
    .map(([topic, frequency]) => ({ topic, frequency }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 15);
}

/**
 * Extract full text from a memory
 */
function extractFullText(memory: OmiMemoryData): string {
  const parts: string[] = [];
  
  if (memory.transcript) {
    parts.push(memory.transcript);
  }
  
  for (const segment of memory.transcriptSegments || []) {
    if (segment.text) {
      parts.push(segment.text);
    }
  }
  
  return parts.join(" ");
}

/**
 * Compute hour-by-hour distribution
 */
function computeHourDistribution(memories: OmiMemoryData[]): HourDistributionItem[] {
  const hourCounts = new Array(24).fill(0);
  
  for (const memory of memories) {
    const hour = new Date(memory.startedAt).getHours();
    hourCounts[hour]++;
  }
  
  return hourCounts.map((count, hour) => ({ hour, count }));
}

/**
 * Aggregate analytics for a specific date
 */
export async function aggregateAnalyticsForDate(
  date: string,
  memories: OmiMemoryData[]
): Promise<InsertOmiAnalyticsDaily> {
  const dateMemories = memories.filter(m => 
    m.startedAt?.startsWith(date)
  );
  
  let totalDurationMinutes = 0;
  const uniqueSpeakers = new Set<string>();
  
  for (const memory of dateMemories) {
    const duration = new Date(memory.finishedAt).getTime() - new Date(memory.startedAt).getTime();
    totalDurationMinutes += Math.round(duration / (1000 * 60));
    
    for (const segment of memory.transcriptSegments || []) {
      if (segment.speaker) {
        uniqueSpeakers.add(segment.speaker);
      }
    }
  }
  
  const meetings = getMeetingsByDate(date);
  
  let actionItemsExtracted = 0;
  for (const memory of dateMemories) {
    const items = getMemoryActionItemsByMemory(memory.id);
    actionItemsExtracted += items.length;
  }
  
  const speakerStats = extractSpeakerStats(dateMemories);
  const topicStats = extractTopicStats(dateMemories);
  const hourDistribution = computeHourDistribution(dateMemories);
  
  const starredCount = dateMemories.filter(m => !m.discarded).length;
  
  return {
    date,
    totalConversations: dateMemories.length,
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
  memories: OmiMemoryData[]
): Promise<{ date: string; success: boolean }> {
  const today = new Date().toISOString().split("T")[0];
  
  try {
    const analytics = await aggregateAnalyticsForDate(today, memories);
    createOrUpdateOmiAnalyticsDaily(analytics);
    
    console.log(`[OmiAnalytics] Aggregated analytics for ${today}: ${analytics.totalConversations} conversations, ${analytics.totalDurationMinutes} min`);
    
    return { date: today, success: true };
  } catch (error) {
    console.error(`[OmiAnalytics] Failed to aggregate for ${today}:`, error);
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
  const analytics = getRecentOmiAnalytics(7);
  
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
  
  const days = analytics.length;
  const averageConversations = Math.round(totalConversations / days);
  const averageDuration = Math.round(totalDuration / days);
  
  const topSpeakers = Array.from(speakerAgg.entries())
    .map(([name, stats]) => ({ name, count: stats.count, durationMinutes: stats.duration }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  const topTopics = Array.from(topicAgg.entries())
    .map(([topic, frequency]) => ({ topic, frequency }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 5);
  
  const peakHours = hourCounts
    .map((count, hour) => ({ hour, count }))
    .filter(h => h.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(h => h.hour);
  
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
  fetchMemories: () => Promise<OmiMemoryData[]>
): void {
  if (scheduledTask) {
    scheduledTask.stop();
  }
  
  scheduledTask = cron.schedule(
    "0 2 * * *",
    async () => {
      console.log("[OmiAnalytics] Running nightly aggregation...");
      try {
        const memories = await fetchMemories();
        await runDailyAnalyticsAggregation(memories);
      } catch (error) {
        console.error("[OmiAnalytics] Nightly aggregation failed:", error);
      }
    },
    {
      timezone: "America/New_York",
    }
  );
  
  console.log("[OmiAnalytics] Scheduled nightly aggregation at 2 AM EST");
}

/**
 * Stop the scheduled aggregation
 */
export function stopAnalyticsAggregation(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log("[OmiAnalytics] Stopped analytics aggregation schedule");
  }
}

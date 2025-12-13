/**
 * Pattern Detection for ZEKE
 * 
 * Analyzes memories and behaviors to detect:
 * - Recurring topics (themes that come up frequently)
 * - Missed commitments and overdue patterns
 * - Relationship patterns (who you interact with most)
 * - Time-based patterns (when you're most productive, etc.)
 */

import { getOverdueCommitments, getPendingCommitments, type TrackedCommitment } from "./specializedWorkers";
import { getOverdueTasks, getAllTasks } from "../db";
import { getRecentMemories } from "../omi";

export interface RecurringTopic {
  topic: string;
  frequency: number;
  lastMentioned: string;
  contexts: string[];
}

export interface MissedCommitmentPattern {
  totalMissed: number;
  totalPending: number;
  overdueCount: number;
  averageOverdueDays: number;
  peopleWithMostMissed: Array<{ name: string; count: number }>;
}

export interface RelationshipPattern {
  personName: string;
  mentionCount: number;
  contexts: string[];
  sentiment: "positive" | "neutral" | "negative";
}

export interface DetectedPatterns {
  recurringTopics: RecurringTopic[];
  missedCommitments: MissedCommitmentPattern;
  relationshipPatterns: RelationshipPattern[];
  insights: string[];
  generatedAt: string;
}

function extractTopicsFromText(text: string): string[] {
  const topics: string[] = [];
  const lowerText = text.toLowerCase();

  const workPatterns = [
    /\b(meeting|project|deadline|client|presentation|report|budget|strategy)\b/gi,
    /\b(team|manager|colleague|boss|review|feedback)\b/gi,
  ];

  const personalPatterns = [
    /\b(family|kids|wife|husband|parents|vacation|holiday)\b/gi,
    /\b(health|doctor|exercise|gym|sleep|diet)\b/gi,
    /\b(friends|party|dinner|coffee|lunch|weekend)\b/gi,
  ];

  const financialPatterns = [
    /\b(money|savings|investment|budget|expenses|bills|payment)\b/gi,
  ];

  for (const pattern of [...workPatterns, ...personalPatterns, ...financialPatterns]) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const topic = match[1].toLowerCase();
      if (!topics.includes(topic)) {
        topics.push(topic);
      }
    }
  }

  return topics;
}

async function detectRecurringTopics(hoursBack: number = 168): Promise<RecurringTopic[]> {
  const memories = await getRecentMemories(hoursBack);
  const topicMap = new Map<string, { count: number; lastMentioned: string; contexts: Set<string> }>();

  for (const memory of memories) {
    const text = memory.transcript || memory.structured?.overview || "";
    const category = memory.structured?.category || "unknown";
    const topics = extractTopicsFromText(text);

    for (const topic of topics) {
      const existing = topicMap.get(topic);
      if (existing) {
        existing.count++;
        existing.lastMentioned = memory.createdAt;
        existing.contexts.add(category);
      } else {
        topicMap.set(topic, {
          count: 1,
          lastMentioned: memory.createdAt,
          contexts: new Set([category]),
        });
      }
    }
  }

  const recurring: RecurringTopic[] = [];
  for (const [topic, data] of topicMap) {
    if (data.count >= 2) {
      recurring.push({
        topic,
        frequency: data.count,
        lastMentioned: data.lastMentioned,
        contexts: Array.from(data.contexts),
      });
    }
  }

  return recurring.sort((a, b) => b.frequency - a.frequency).slice(0, 10);
}

function analyzeMissedCommitments(): MissedCommitmentPattern {
  const pending = getPendingCommitments();
  const overdue = getOverdueCommitments();
  const overdueTasks = getOverdueTasks();

  const now = new Date();
  let totalOverdueDays = 0;
  let overdueWithDeadline = 0;

  for (const commitment of overdue) {
    if (commitment.deadline) {
      const deadline = new Date(commitment.deadline);
      const daysDiff = Math.floor((now.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24));
      totalOverdueDays += daysDiff;
      overdueWithDeadline++;
    }
  }

  const peopleCount = new Map<string, number>();
  for (const commitment of [...pending, ...overdue]) {
    if (commitment.madeTo) {
      peopleCount.set(commitment.madeTo, (peopleCount.get(commitment.madeTo) || 0) + 1);
    }
  }

  const peopleWithMostMissed = Array.from(peopleCount.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalMissed: overdue.length + overdueTasks.length,
    totalPending: pending.length,
    overdueCount: overdue.length,
    averageOverdueDays: overdueWithDeadline > 0 ? totalOverdueDays / overdueWithDeadline : 0,
    peopleWithMostMissed,
  };
}

async function analyzeRelationshipPatterns(hoursBack: number = 168): Promise<RelationshipPattern[]> {
  const memories = await getRecentMemories(hoursBack);
  const peopleMap = new Map<string, { count: number; contexts: Set<string> }>();

  const namePattern = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/g;

  for (const memory of memories) {
    const text = memory.transcript || memory.structured?.overview || "";
    const category = memory.structured?.category || "unknown";

    let match;
    while ((match = namePattern.exec(text)) !== null) {
      const name = match[1];
      if (name.length > 2 && !isCommonWord(name)) {
        const existing = peopleMap.get(name);
        if (existing) {
          existing.count++;
          existing.contexts.add(category);
        } else {
          peopleMap.set(name, { count: 1, contexts: new Set([category]) });
        }
      }
    }
  }

  const patterns: RelationshipPattern[] = [];
  for (const [name, data] of peopleMap) {
    if (data.count >= 2) {
      patterns.push({
        personName: name,
        mentionCount: data.count,
        contexts: Array.from(data.contexts),
        sentiment: "neutral",
      });
    }
  }

  return patterns.sort((a, b) => b.mentionCount - a.mentionCount).slice(0, 10);
}

function isCommonWord(word: string): boolean {
  const commonWords = new Set([
    "The", "This", "That", "What", "When", "Where", "Who", "Why", "How",
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
    "January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December",
    "Today", "Tomorrow", "Yesterday", "Morning", "Evening", "Night",
    "Thanks", "Hello", "Goodbye", "Yes", "No", "Maybe", "Sure", "Okay",
  ]);
  return commonWords.has(word);
}

function generateInsights(
  topics: RecurringTopic[],
  missed: MissedCommitmentPattern,
  relationships: RelationshipPattern[]
): string[] {
  const insights: string[] = [];

  if (topics.length > 0) {
    const topTopic = topics[0];
    insights.push(`"${topTopic.topic}" has been a recurring theme (mentioned ${topTopic.frequency} times).`);
  }

  if (missed.overdueCount > 0) {
    insights.push(`You have ${missed.overdueCount} overdue commitment${missed.overdueCount > 1 ? "s" : ""} that need attention.`);
  }

  if (missed.averageOverdueDays > 3) {
    insights.push(`Items are averaging ${Math.round(missed.averageOverdueDays)} days overdue. Consider prioritizing catch-up time.`);
  }

  if (missed.peopleWithMostMissed.length > 0 && missed.peopleWithMostMissed[0].count > 2) {
    const person = missed.peopleWithMostMissed[0];
    insights.push(`You have ${person.count} open commitments involving ${person.name}.`);
  }

  if (relationships.length > 0) {
    const topPerson = relationships[0];
    insights.push(`${topPerson.personName} appears frequently in your conversations (${topPerson.mentionCount} mentions).`);
  }

  if (insights.length === 0) {
    insights.push("No significant patterns detected yet. Keep using ZEKE to build up your data.");
  }

  return insights;
}

export async function detectPatterns(hoursBack: number = 168): Promise<DetectedPatterns> {
  console.log(`[PatternDetection] Analyzing patterns from last ${hoursBack} hours...`);

  const [recurringTopics, relationshipPatterns] = await Promise.all([
    detectRecurringTopics(hoursBack),
    analyzeRelationshipPatterns(hoursBack),
  ]);

  const missedCommitments = analyzeMissedCommitments();
  const insights = generateInsights(recurringTopics, missedCommitments, relationshipPatterns);

  console.log(`[PatternDetection] Found ${recurringTopics.length} topics, ${relationshipPatterns.length} relationships`);

  return {
    recurringTopics,
    missedCommitments,
    relationshipPatterns,
    insights,
    generatedAt: new Date().toISOString(),
  };
}

export function getPatternSummary(patterns: DetectedPatterns): string {
  const lines: string[] = ["Pattern Summary:"];

  if (patterns.recurringTopics.length > 0) {
    const topics = patterns.recurringTopics.slice(0, 3).map(t => t.topic).join(", ");
    lines.push(`Top topics: ${topics}`);
  }

  if (patterns.missedCommitments.overdueCount > 0) {
    lines.push(`${patterns.missedCommitments.overdueCount} overdue items`);
  }

  if (patterns.insights.length > 0) {
    lines.push("");
    lines.push(patterns.insights[0]);
  }

  return lines.join("\n");
}

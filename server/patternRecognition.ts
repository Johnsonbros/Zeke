/**
 * Pattern Recognition Service
 *
 * Analyzes historical data from multiple sources to discover behavioral patterns,
 * temporal trends, and predictive insights about user behavior.
 */

import { db } from "./db";
import {
  patterns,
  type InsertPattern,
  type Pattern,
  type PatternType,
  tasks,
  calendarEvents,
  locationHistory,
  groceryItems,
  omiMemories,
  messages,
} from "../shared/schema.js";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import logger from "./logging.js";

/**
 * Pattern recognition algorithms for different data types
 */

interface TemporalPattern {
  timeOfDay?: string; // e.g., "morning", "afternoon", "evening"
  dayOfWeek?: number; // 0-6
  weekOfMonth?: number; // 1-4
  frequency: string; // e.g., "daily", "weekly", "monthly"
  occurrences: number;
}

interface BehavioralPattern {
  action: string;
  context: Record<string, any>;
  frequency: number;
  consistency: number; // 0-1 scale
}

interface ContextualPattern {
  trigger: string;
  response: string;
  context: Record<string, any>;
  reliability: number; // 0-1 scale
}

/**
 * Analyzes task completion patterns
 */
export async function analyzeTaskPatterns(daysBack: number = 90): Promise<InsertPattern[]> {
  const patterns: InsertPattern[] = [];
  const now = new Date();
  const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

  try {
    // Get all completed tasks in time range
    const completedTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.completed, true),
          gte(tasks.updatedAt, startDate.toISOString())
        )
      );

    if (completedTasks.length < 5) {
      return patterns; // Not enough data
    }

    // Analyze completion time patterns
    const completionByHour: Record<number, number> = {};
    const completionByDay: Record<number, number> = {};
    const completionByCategory: Record<string, number> = {};

    for (const task of completedTasks) {
      const date = new Date(task.updatedAt);
      const hour = date.getHours();
      const day = date.getDay();
      const category = task.category;

      completionByHour[hour] = (completionByHour[hour] || 0) + 1;
      completionByDay[day] = (completionByDay[day] || 0) + 1;
      completionByCategory[category] = (completionByCategory[category] || 0) + 1;
    }

    // Find peak productivity hours
    const peakHours = Object.entries(completionByHour)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([hour]) => parseInt(hour));

    if (peakHours.length > 0) {
      const strength = Math.min(
        Object.values(completionByHour).reduce((a, b) => Math.max(a, b), 0) / completedTasks.length,
        1
      );

      patterns.push({
        type: "temporal",
        name: "Peak Productivity Hours",
        description: `Tasks are most frequently completed during hours: ${peakHours.join(", ")}`,
        patternDefinition: JSON.stringify({
          type: "task_completion_time",
          peakHours,
          distribution: completionByHour,
        }),
        frequency: "daily",
        strength: strength.toString(),
        dataSource: "tasks",
        sampleSize: completedTasks.length,
        timeRangeStart: startDate.toISOString(),
        timeRangeEnd: now.toISOString(),
      });
    }

    // Find preferred days for different categories
    for (const [category, count] of Object.entries(completionByCategory)) {
      if (count < 3) continue;

      const categoryTasks = completedTasks.filter((t) => t.category === category);
      const categoryDayDist: Record<number, number> = {};

      for (const task of categoryTasks) {
        const day = new Date(task.updatedAt).getDay();
        categoryDayDist[day] = (categoryDayDist[day] || 0) + 1;
      }

      const preferredDay = Object.entries(categoryDayDist)
        .sort(([, a], [, b]) => b - a)[0];

      if (preferredDay && preferredDay[1] >= count * 0.4) {
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        patterns.push({
          type: "behavioral",
          name: `${category} Task Pattern`,
          description: `${category} tasks are often completed on ${dayNames[parseInt(preferredDay[0])]}`,
          patternDefinition: JSON.stringify({
            type: "category_day_preference",
            category,
            preferredDay: parseInt(preferredDay[0]),
            distribution: categoryDayDist,
          }),
          frequency: "weekly",
          strength: (preferredDay[1] / count).toString(),
          dataSource: "tasks",
          sampleSize: categoryTasks.length,
          timeRangeStart: startDate.toISOString(),
          timeRangeEnd: now.toISOString(),
        });
      }
    }

    // Analyze task deadline adherence
    const tasksWithDeadlines = completedTasks.filter((t) => t.dueDate);
    if (tasksWithDeadlines.length >= 5) {
      let onTime = 0;
      let early = 0;
      let late = 0;

      for (const task of tasksWithDeadlines) {
        const completed = new Date(task.updatedAt);
        const due = new Date(task.dueDate!);
        const diff = completed.getTime() - due.getTime();

        if (Math.abs(diff) < 24 * 60 * 60 * 1000) onTime++;
        else if (diff < 0) early++;
        else late++;
      }

      const adherenceRate = (onTime + early) / tasksWithDeadlines.length;

      patterns.push({
        type: "behavioral",
        name: "Task Deadline Adherence",
        description: `Completes ${Math.round(adherenceRate * 100)}% of tasks on time or early`,
        patternDefinition: JSON.stringify({
          type: "deadline_adherence",
          onTime,
          early,
          late,
          adherenceRate,
        }),
        frequency: "continuous",
        strength: adherenceRate.toString(),
        dataSource: "tasks",
        sampleSize: tasksWithDeadlines.length,
        timeRangeStart: startDate.toISOString(),
        timeRangeEnd: now.toISOString(),
      });
    }

    logger.info(`Analyzed task patterns: found ${patterns.length} patterns from ${completedTasks.length} tasks`);
  } catch (error) {
    logger.error("Error analyzing task patterns:", error);
  }

  return patterns;
}

/**
 * Analyzes calendar and scheduling patterns
 */
export async function analyzeCalendarPatterns(daysBack: number = 90): Promise<InsertPattern[]> {
  const patterns: InsertPattern[] = [];
  const now = new Date();
  const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

  try {
    const events = await db
      .select()
      .from(calendarEvents)
      .where(
        and(
          gte(calendarEvents.start, startDate.toISOString()),
          lte(calendarEvents.start, now.toISOString())
        )
      );

    if (events.length < 10) {
      return patterns;
    }

    // Analyze scheduling preferences
    const eventsByHour: Record<number, number> = {};
    const eventsByDay: Record<number, number> = {};
    const eventDurations: number[] = [];

    for (const event of events) {
      const start = new Date(event.start);
      const end = new Date(event.end);
      const hour = start.getHours();
      const day = start.getDay();
      const duration = (end.getTime() - start.getTime()) / (1000 * 60); // minutes

      eventsByHour[hour] = (eventsByHour[hour] || 0) + 1;
      eventsByDay[day] = (eventsByDay[day] || 0) + 1;
      eventDurations.push(duration);
    }

    // Find preferred meeting times
    const preferredHours = Object.entries(eventsByHour)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([hour]) => parseInt(hour));

    if (preferredHours.length > 0) {
      patterns.push({
        type: "temporal",
        name: "Preferred Meeting Times",
        description: `Meetings typically scheduled during hours: ${preferredHours.join(", ")}`,
        patternDefinition: JSON.stringify({
          type: "meeting_time_preference",
          preferredHours,
          distribution: eventsByHour,
        }),
        frequency: "daily",
        strength: (Object.values(eventsByHour).reduce((a, b) => Math.max(a, b), 0) / events.length).toString(),
        dataSource: "calendar",
        sampleSize: events.length,
        timeRangeStart: startDate.toISOString(),
        timeRangeEnd: now.toISOString(),
      });
    }

    // Average meeting duration
    const avgDuration = eventDurations.reduce((a, b) => a + b, 0) / eventDurations.length;
    patterns.push({
      type: "behavioral",
      name: "Typical Meeting Duration",
      description: `Meetings typically last ${Math.round(avgDuration)} minutes`,
      patternDefinition: JSON.stringify({
        type: "meeting_duration",
        avgDuration,
        medianDuration: eventDurations.sort((a, b) => a - b)[Math.floor(eventDurations.length / 2)],
      }),
      frequency: "continuous",
      strength: "0.8",
      dataSource: "calendar",
      sampleSize: events.length,
      timeRangeStart: startDate.toISOString(),
      timeRangeEnd: now.toISOString(),
    });

    // Busiest days
    const busiestDays = Object.entries(eventsByDay)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)
      .map(([day]) => parseInt(day));

    if (busiestDays.length > 0) {
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      patterns.push({
        type: "temporal",
        name: "Busiest Days",
        description: `Schedule is typically busiest on ${busiestDays.map((d) => dayNames[d]).join(" and ")}`,
        patternDefinition: JSON.stringify({
          type: "busy_days",
          busiestDays,
          distribution: eventsByDay,
        }),
        frequency: "weekly",
        strength: (Math.max(...Object.values(eventsByDay)) / events.length).toString(),
        dataSource: "calendar",
        sampleSize: events.length,
        timeRangeStart: startDate.toISOString(),
        timeRangeEnd: now.toISOString(),
      });
    }

    logger.info(`Analyzed calendar patterns: found ${patterns.length} patterns from ${events.length} events`);
  } catch (error) {
    logger.error("Error analyzing calendar patterns:", error);
  }

  return patterns;
}

/**
 * Analyzes location and movement patterns
 */
export async function analyzeLocationPatterns(daysBack: number = 90): Promise<InsertPattern[]> {
  const patterns: InsertPattern[] = [];
  const now = new Date();
  const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

  try {
    const locations = await db
      .select()
      .from(locationHistory)
      .where(
        gte(locationHistory.timestamp, startDate.toISOString())
      )
      .orderBy(desc(locationHistory.timestamp))
      .limit(10000);

    if (locations.length < 20) {
      return patterns;
    }

    // Analyze location patterns by time of day and day of week
    const locationsByTimeAndDay: Record<string, Record<number, Record<number, number>>> = {};

    for (const loc of locations) {
      if (!loc.savedPlaceId) continue;

      const date = new Date(loc.timestamp);
      const hour = date.getHours();
      const day = date.getDay();

      if (!locationsByTimeAndDay[loc.savedPlaceId]) {
        locationsByTimeAndDay[loc.savedPlaceId] = {};
      }
      if (!locationsByTimeAndDay[loc.savedPlaceId][day]) {
        locationsByTimeAndDay[loc.savedPlaceId][day] = {};
      }
      locationsByTimeAndDay[loc.savedPlaceId][day][hour] =
        (locationsByTimeAndDay[loc.savedPlaceId][day][hour] || 0) + 1;
    }

    // Find routine location patterns
    for (const [placeId, dayData] of Object.entries(locationsByTimeAndDay)) {
      for (const [day, hourData] of Object.entries(dayData)) {
        const totalVisits = Object.values(hourData).reduce((a, b) => a + b, 0);
        if (totalVisits < 3) continue;

        const peakHour = Object.entries(hourData)
          .sort(([, a], [, b]) => b - a)[0];

        if (peakHour && peakHour[1] >= totalVisits * 0.5) {
          const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          patterns.push({
            type: "contextual",
            name: `Routine Location Pattern`,
            description: `Regularly at this location on ${dayNames[parseInt(day)]} around ${peakHour[0]}:00`,
            patternDefinition: JSON.stringify({
              type: "routine_location",
              placeId,
              day: parseInt(day),
              peakHour: parseInt(peakHour[0]),
              visits: totalVisits,
            }),
            frequency: "weekly",
            strength: (peakHour[1] / totalVisits).toString(),
            dataSource: "location",
            sampleSize: totalVisits,
            timeRangeStart: startDate.toISOString(),
            timeRangeEnd: now.toISOString(),
          });
        }
      }
    }

    logger.info(`Analyzed location patterns: found ${patterns.length} patterns from ${locations.length} locations`);
  } catch (error) {
    logger.error("Error analyzing location patterns:", error);
  }

  return patterns;
}

/**
 * Analyzes grocery shopping patterns
 */
export async function analyzeGroceryPatterns(daysBack: number = 90): Promise<InsertPattern[]> {
  const patterns: InsertPattern[] = [];
  const now = new Date();
  const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

  try {
    const items = await db
      .select()
      .from(groceryItems)
      .where(
        and(
          eq(groceryItems.purchased, true),
          gte(groceryItems.purchasedAt!, startDate.toISOString())
        )
      );

    if (items.length < 10) {
      return patterns;
    }

    // Analyze purchase frequency by item
    const itemFrequency: Record<string, number> = {};
    const categoryFrequency: Record<string, number> = {};

    for (const item of items) {
      const itemName = item.name.toLowerCase();
      itemFrequency[itemName] = (itemFrequency[itemName] || 0) + 1;
      categoryFrequency[item.category] = (categoryFrequency[item.category] || 0) + 1;
    }

    // Find frequently purchased items (appearing in >30% of weeks)
    const weeksSinceStart = daysBack / 7;
    const frequentItems = Object.entries(itemFrequency)
      .filter(([, count]) => count / weeksSinceStart >= 0.3)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    if (frequentItems.length > 0) {
      patterns.push({
        type: "behavioral",
        name: "Regular Grocery Items",
        description: `Regularly purchases: ${frequentItems.map(([name]) => name).join(", ")}`,
        patternDefinition: JSON.stringify({
          type: "frequent_purchases",
          items: frequentItems.map(([name, count]) => ({ name, count })),
        }),
        frequency: "weekly",
        strength: (frequentItems[0][1] / items.length).toString(),
        dataSource: "grocery",
        sampleSize: items.length,
        timeRangeStart: startDate.toISOString(),
        timeRangeEnd: now.toISOString(),
      });
    }

    // Analyze shopping day patterns
    const dayOfWeekPurchases: Record<number, number> = {};
    for (const item of items) {
      if (!item.purchasedAt) continue;
      const day = new Date(item.purchasedAt).getDay();
      dayOfWeekPurchases[day] = (dayOfWeekPurchases[day] || 0) + 1;
    }

    const preferredShoppingDay = Object.entries(dayOfWeekPurchases)
      .sort(([, a], [, b]) => b - a)[0];

    if (preferredShoppingDay) {
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      patterns.push({
        type: "temporal",
        name: "Preferred Shopping Day",
        description: `Typically shops on ${dayNames[parseInt(preferredShoppingDay[0])]}`,
        patternDefinition: JSON.stringify({
          type: "shopping_day",
          preferredDay: parseInt(preferredShoppingDay[0]),
          distribution: dayOfWeekPurchases,
        }),
        frequency: "weekly",
        strength: (preferredShoppingDay[1] / items.length).toString(),
        dataSource: "grocery",
        sampleSize: items.length,
        timeRangeStart: startDate.toISOString(),
        timeRangeEnd: now.toISOString(),
      });
    }

    logger.info(`Analyzed grocery patterns: found ${patterns.length} patterns from ${items.length} items`);
  } catch (error) {
    logger.error("Error analyzing grocery patterns:", error);
  }

  return patterns;
}

/**
 * Analyzes conversation and interaction patterns from Omi lifelogs
 */
export async function analyzeConversationPatterns(daysBack: number = 90): Promise<InsertPattern[]> {
  const patterns: InsertPattern[] = [];
  const now = new Date();
  const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

  try {
    const lifelogs = await db
      .select()
      .from(omiMemories)
      .where(
        and(
          gte(omiMemories.startTimestamp, startDate.toISOString()),
          eq(omiMemories.processedSuccessfully, true)
        )
      );

    if (lifelogs.length < 5) {
      return patterns;
    }

    // Analyze conversation timing
    const conversationsByHour: Record<number, number> = {};
    const conversationsByDay: Record<number, number> = {};
    let totalDuration = 0;

    for (const log of lifelogs) {
      const start = new Date(log.startTimestamp);
      const hour = start.getHours();
      const day = start.getDay();

      conversationsByHour[hour] = (conversationsByHour[hour] || 0) + 1;
      conversationsByDay[day] = (conversationsByDay[day] || 0) + 1;

      if (log.durationSeconds) {
        totalDuration += log.durationSeconds;
      }
    }

    // Find typical conversation times
    const peakConversationHours = Object.entries(conversationsByHour)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([hour]) => parseInt(hour));

    if (peakConversationHours.length > 0) {
      patterns.push({
        type: "temporal",
        name: "Peak Conversation Times",
        description: `Most conversations occur during hours: ${peakConversationHours.join(", ")}`,
        patternDefinition: JSON.stringify({
          type: "conversation_timing",
          peakHours: peakConversationHours,
          distribution: conversationsByHour,
        }),
        frequency: "daily",
        strength: (Object.values(conversationsByHour).reduce((a, b) => Math.max(a, b), 0) / lifelogs.length).toString(),
        dataSource: "omi",
        sampleSize: lifelogs.length,
        timeRangeStart: startDate.toISOString(),
        timeRangeEnd: now.toISOString(),
      });
    }

    // Average conversation duration
    const avgDuration = totalDuration / lifelogs.length;
    patterns.push({
      type: "behavioral",
      name: "Typical Conversation Length",
      description: `Conversations typically last ${Math.round(avgDuration / 60)} minutes`,
      patternDefinition: JSON.stringify({
        type: "conversation_duration",
        avgDuration,
      }),
      frequency: "continuous",
      strength: "0.75",
      dataSource: "limitless",
      sampleSize: lifelogs.length,
      timeRangeStart: startDate.toISOString(),
      timeRangeEnd: now.toISOString(),
    });

    logger.info(`Analyzed conversation patterns: found ${patterns.length} patterns from ${lifelogs.length} lifelogs`);
  } catch (error) {
    logger.error("Error analyzing conversation patterns:", error);
  }

  return patterns;
}

/**
 * Main pattern discovery function - runs all analyzers
 */
export async function discoverPatterns(daysBack: number = 90): Promise<Pattern[]> {
  logger.info(`Starting pattern discovery for last ${daysBack} days...`);

  const allPatterns: InsertPattern[] = [];

  // Run all analyzers in parallel
  const [taskPatterns, calendarPatterns, locationPatterns, groceryPatterns, conversationPatterns] =
    await Promise.all([
      analyzeTaskPatterns(daysBack),
      analyzeCalendarPatterns(daysBack),
      analyzeLocationPatterns(daysBack),
      analyzeGroceryPatterns(daysBack),
      analyzeConversationPatterns(daysBack),
    ]);

  allPatterns.push(...taskPatterns);
  allPatterns.push(...calendarPatterns);
  allPatterns.push(...locationPatterns);
  allPatterns.push(...groceryPatterns);
  allPatterns.push(...conversationPatterns);

  // Save patterns to database
  const savedPatterns: Pattern[] = [];
  for (const pattern of allPatterns) {
    try {
      const id = uuidv4();
      const now = new Date().toISOString();

      const [saved] = await db
        .insert(patterns)
        .values({
          id,
          ...pattern,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      savedPatterns.push(saved);
    } catch (error) {
      logger.error("Error saving pattern:", error);
    }
  }

  logger.info(`Pattern discovery complete: found and saved ${savedPatterns.length} patterns`);
  return savedPatterns;
}

/**
 * Get active patterns for prediction use
 */
export async function getActivePatterns(): Promise<Pattern[]> {
  return await db
    .select()
    .from(patterns)
    .where(
      and(
        eq(patterns.isActive, true),
        eq(patterns.isSuperseded, false)
      )
    )
    .orderBy(desc(patterns.createdAt));
}

/**
 * Update pattern accuracy based on prediction feedback
 */
export async function updatePatternAccuracy(
  patternId: string,
  wasAccurate: boolean
): Promise<void> {
  const pattern = await db
    .select()
    .from(patterns)
    .where(eq(patterns.id, patternId))
    .limit(1);

  if (pattern.length === 0) return;

  const currentPattern = pattern[0];
  const currentValidation = currentPattern.validationCount || 0;
  const currentAccuracy = parseFloat(currentPattern.accuracyRate || "0");

  // Update accuracy rate with new feedback
  const newValidationCount = currentValidation + 1;
  const newAccuracyRate =
    (currentAccuracy * currentValidation + (wasAccurate ? 1 : 0)) / newValidationCount;

  await db
    .update(patterns)
    .set({
      validationCount: newValidationCount,
      accuracyRate: newAccuracyRate.toString(),
      lastValidatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(patterns.id, patternId));

  logger.info(`Updated pattern ${patternId} accuracy: ${newAccuracyRate.toFixed(2)} (${newValidationCount} validations)`);
}

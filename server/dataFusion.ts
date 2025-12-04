/**
 * Data Fusion Layer
 *
 * Combines and correlates data from multiple sources (calendar, tasks, location, grocery,
 * Limitless lifelogs, etc.) to create rich contextual insights for predictive intelligence.
 */

import { db } from "../db/index.js";
import {
  tasks,
  calendarEvents,
  locationHistory,
  savedPlaces,
  groceryItems,
  limitlessLifelogs,
  messages,
  weatherRecords,
  memoryNotes,
  type Pattern,
} from "../shared/schema.js";
import { eq, and, gte, lte, desc, or } from "drizzle-orm";
import logger from "./logging.js";

/**
 * Fused data context combining multiple data sources
 */
export interface FusedContext {
  // Temporal context
  currentTime: Date;
  timeOfDay: "early_morning" | "morning" | "afternoon" | "evening" | "night" | "late_night";
  dayOfWeek: number;
  isWeekend: boolean;

  // Calendar context
  upcomingEvents: Array<{
    id: string;
    title: string;
    start: Date;
    end: Date;
    location?: string;
    hoursUntil: number;
  }>;
  hasConflicts: boolean;
  freeTimeWindows: Array<{ start: Date; end: Date; durationMinutes: number }>;

  // Task context
  pendingTasks: Array<{
    id: string;
    title: string;
    priority: string;
    dueDate?: Date;
    hoursUntilDue?: number;
    category: string;
  }>;
  overdueTasks: number;
  tasksCompletedToday: number;
  taskLoad: "light" | "moderate" | "heavy";

  // Location context
  currentLocation?: {
    savedPlaceId: string;
    name: string;
    category: string;
    latitude: string;
    longitude: string;
  };
  recentLocationHistory: Array<{
    savedPlaceId: string;
    savedPlaceName: string;
    timestamp: Date;
  }>;

  // Grocery context
  groceryListSize: number;
  lastShoppingDate?: Date;
  daysSinceLastShopping?: number;

  // Conversation context (from Limitless)
  recentConversationTopics: string[];
  conversationsToday: number;
  lastConversationTime?: Date;

  // Weather context
  currentWeather?: {
    temp: number;
    condition: string;
    isAdverse: boolean;
  };

  // Memory and preferences
  relevantMemories: Array<{
    id: string;
    content: string;
    type: string;
    confidence: number;
  }>;

  // Patterns
  activePatterns: Pattern[];
}

/**
 * Get time of day category
 */
function getTimeOfDay(date: Date): FusedContext["timeOfDay"] {
  const hour = date.getHours();

  if (hour >= 0 && hour < 5) return "late_night";
  if (hour >= 5 && hour < 8) return "early_morning";
  if (hour >= 8 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

/**
 * Build comprehensive fused context
 */
export async function buildFusedContext(
  lookAheadHours: number = 48,
  activePatterns: Pattern[] = []
): Promise<FusedContext> {
  const now = new Date();
  const lookAheadTime = new Date(now.getTime() + lookAheadHours * 60 * 60 * 1000);

  logger.info(`Building fused context (looking ahead ${lookAheadHours} hours)`);

  // Calendar context
  const upcomingEventsRaw = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        gte(calendarEvents.start, now.toISOString()),
        lte(calendarEvents.start, lookAheadTime.toISOString())
      )
    )
    .orderBy(calendarEvents.start);

  const upcomingEvents = upcomingEventsRaw.map((event) => {
    const start = new Date(event.start);
    const end = new Date(event.end);
    return {
      id: event.id,
      title: event.title,
      start,
      end,
      location: event.location || undefined,
      hoursUntil: (start.getTime() - now.getTime()) / (1000 * 60 * 60),
    };
  });

  // Check for scheduling conflicts
  let hasConflicts = false;
  for (let i = 0; i < upcomingEvents.length - 1; i++) {
    if (upcomingEvents[i].end > upcomingEvents[i + 1].start) {
      hasConflicts = true;
      break;
    }
  }

  // Calculate free time windows
  const freeTimeWindows: Array<{ start: Date; end: Date; durationMinutes: number }> = [];
  for (let i = 0; i < upcomingEvents.length - 1; i++) {
    const gapStart = upcomingEvents[i].end;
    const gapEnd = upcomingEvents[i + 1].start;
    const durationMinutes = (gapEnd.getTime() - gapStart.getTime()) / (1000 * 60);

    if (durationMinutes >= 30) {
      // Only include gaps of 30+ minutes
      freeTimeWindows.push({
        start: gapStart,
        end: gapEnd,
        durationMinutes,
      });
    }
  }

  // Task context
  const allTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.completed, false));

  const pendingTasks = allTasks.map((task) => {
    let hoursUntilDue: number | undefined;
    if (task.dueDate) {
      const due = new Date(task.dueDate);
      hoursUntilDue = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
    }

    return {
      id: task.id,
      title: task.title,
      priority: task.priority,
      dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
      hoursUntilDue,
      category: task.category,
    };
  });

  const overdueTasks = pendingTasks.filter(
    (t) => t.hoursUntilDue !== undefined && t.hoursUntilDue < 0
  ).length;

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const tasksCompletedToday = (
    await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.completed, true),
          gte(tasks.updatedAt, todayStart.toISOString())
        )
      )
  ).length;

  const taskLoad: FusedContext["taskLoad"] =
    pendingTasks.length < 3 ? "light" : pendingTasks.length < 8 ? "moderate" : "heavy";

  // Location context
  const recentLocations = await db
    .select()
    .from(locationHistory)
    .orderBy(desc(locationHistory.timestamp))
    .limit(20);

  let currentLocation: FusedContext["currentLocation"];
  if (recentLocations.length > 0 && recentLocations[0].savedPlaceId) {
    const place = await db
      .select()
      .from(savedPlaces)
      .where(eq(savedPlaces.id, recentLocations[0].savedPlaceId))
      .limit(1);

    if (place.length > 0) {
      currentLocation = {
        savedPlaceId: place[0].id,
        name: place[0].name,
        category: place[0].category,
        latitude: recentLocations[0].latitude,
        longitude: recentLocations[0].longitude,
      };
    }
  }

  const recentLocationHistory = recentLocations
    .filter((loc) => loc.savedPlaceId && loc.savedPlaceName)
    .map((loc) => ({
      savedPlaceId: loc.savedPlaceId!,
      savedPlaceName: loc.savedPlaceName!,
      timestamp: new Date(loc.timestamp),
    }))
    .slice(0, 10);

  // Grocery context
  const groceryList = await db
    .select()
    .from(groceryItems)
    .where(eq(groceryItems.purchased, false));

  const lastPurchase = await db
    .select()
    .from(groceryItems)
    .where(eq(groceryItems.purchased, true))
    .orderBy(desc(groceryItems.purchasedAt))
    .limit(1);

  let lastShoppingDate: Date | undefined;
  let daysSinceLastShopping: number | undefined;
  if (lastPurchase.length > 0 && lastPurchase[0].purchasedAt) {
    lastShoppingDate = new Date(lastPurchase[0].purchasedAt);
    daysSinceLastShopping = (now.getTime() - lastShoppingDate.getTime()) / (1000 * 60 * 60 * 24);
  }

  // Conversation context (from Limitless)
  const todayConversations = await db
    .select()
    .from(limitlessLifelogs)
    .where(
      and(
        gte(limitlessLifelogs.startTimestamp, todayStart.toISOString()),
        eq(limitlessLifelogs.processedSuccessfully, true)
      )
    );

  const recentConversations = await db
    .select()
    .from(limitlessLifelogs)
    .where(eq(limitlessLifelogs.processedSuccessfully, true))
    .orderBy(desc(limitlessLifelogs.startTimestamp))
    .limit(5);

  const recentConversationTopics = recentConversations
    .filter((conv) => conv.summary)
    .map((conv) => conv.summary!)
    .slice(0, 5);

  const lastConversationTime = recentConversations.length > 0
    ? new Date(recentConversations[0].startTimestamp)
    : undefined;

  // Weather context
  const currentWeatherRecord = await db
    .select()
    .from(weatherRecords)
    .orderBy(desc(weatherRecords.timestamp))
    .limit(1);

  let currentWeather: FusedContext["currentWeather"];
  if (currentWeatherRecord.length > 0) {
    const weather = currentWeatherRecord[0];
    currentWeather = {
      temp: parseFloat(weather.temperature),
      condition: weather.condition,
      isAdverse: weather.isSevere || false,
    };
  }

  // Relevant memories (high confidence)
  const relevantMemoriesRaw = await db
    .select()
    .from(memoryNotes)
    .where(
      and(
        eq(memoryNotes.isSuperseded, false),
        gte(memoryNotes.confidenceScore, "0.7")
      )
    )
    .orderBy(desc(memoryNotes.lastUsedAt))
    .limit(10);

  const relevantMemories = relevantMemoriesRaw.map((mem) => ({
    id: mem.id,
    content: mem.content,
    type: mem.type,
    confidence: parseFloat(mem.confidenceScore || "0.8"),
  }));

  const fusedContext: FusedContext = {
    currentTime: now,
    timeOfDay: getTimeOfDay(now),
    dayOfWeek: now.getDay(),
    isWeekend: now.getDay() === 0 || now.getDay() === 6,
    upcomingEvents,
    hasConflicts,
    freeTimeWindows,
    pendingTasks,
    overdueTasks,
    tasksCompletedToday,
    taskLoad,
    currentLocation,
    recentLocationHistory,
    groceryListSize: groceryList.length,
    lastShoppingDate,
    daysSinceLastShopping,
    recentConversationTopics,
    conversationsToday: todayConversations.length,
    lastConversationTime,
    currentWeather,
    relevantMemories,
    activePatterns,
  };

  logger.info(`Fused context built: ${pendingTasks.length} tasks, ${upcomingEvents.length} events, ${activePatterns.length} patterns`);

  return fusedContext;
}

/**
 * Detect anomalies in current behavior vs patterns
 */
export interface BehaviorAnomaly {
  type: "schedule_deviation" | "location_deviation" | "task_delay" | "routine_break";
  description: string;
  severity: "low" | "medium" | "high";
  expectedBehavior: string;
  actualBehavior: string;
  relatedPattern?: Pattern;
}

export async function detectAnomalies(
  context: FusedContext,
  patterns: Pattern[]
): Promise<BehaviorAnomaly[]> {
  const anomalies: BehaviorAnomaly[] = [];

  // Check for location deviations
  const locationPatterns = patterns.filter((p) => p.type === "contextual" && p.dataSource === "location");

  for (const pattern of locationPatterns) {
    try {
      const def = JSON.parse(pattern.patternDefinition);
      if (def.type === "routine_location") {
        const expectedDay = def.day;
        const expectedHour = def.peakHour;
        const currentDay = context.dayOfWeek;
        const currentHour = context.currentTime.getHours();

        // Check if should be at this location now
        if (currentDay === expectedDay && Math.abs(currentHour - expectedHour) <= 1) {
          if (
            !context.currentLocation ||
            context.currentLocation.savedPlaceId !== def.placeId
          ) {
            anomalies.push({
              type: "location_deviation",
              description: "Not at expected location based on routine",
              severity: "medium",
              expectedBehavior: `Usually at saved place ${def.placeId} on this day/time`,
              actualBehavior: context.currentLocation
                ? `Currently at ${context.currentLocation.name}`
                : "Location unknown",
              relatedPattern: pattern,
            });
          }
        }
      }
    } catch (error) {
      logger.error("Error checking location pattern:", error);
    }
  }

  // Check for task deadline risks
  const urgentTasks = context.pendingTasks.filter(
    (t) => t.hoursUntilDue !== undefined && t.hoursUntilDue < 24 && t.hoursUntilDue > 0
  );

  if (urgentTasks.length > 0 && context.tasksCompletedToday === 0) {
    anomalies.push({
      type: "task_delay",
      description: `${urgentTasks.length} task(s) due within 24 hours, but no tasks completed today`,
      severity: urgentTasks.some((t) => t.priority === "high") ? "high" : "medium",
      expectedBehavior: "Making progress on urgent tasks",
      actualBehavior: "No task completions today",
    });
  }

  // Check for schedule conflicts
  if (context.hasConflicts) {
    anomalies.push({
      type: "schedule_deviation",
      description: "Calendar has overlapping events",
      severity: "high",
      expectedBehavior: "Non-overlapping calendar events",
      actualBehavior: "Multiple events scheduled at the same time",
    });
  }

  // Check for productivity patterns
  const taskPatterns = patterns.filter((p) => p.type === "temporal" && p.dataSource === "tasks");

  for (const pattern of taskPatterns) {
    try {
      const def = JSON.parse(pattern.patternDefinition);
      if (def.type === "task_completion_time") {
        const currentHour = context.currentTime.getHours();
        const isPeakHour = def.peakHours.includes(currentHour);

        // If it's peak productivity time but taskLoad is heavy and nothing completed today
        if (isPeakHour && context.taskLoad === "heavy" && context.tasksCompletedToday === 0) {
          anomalies.push({
            type: "routine_break",
            description: "During typical peak productivity hours but no tasks completed",
            severity: "low",
            expectedBehavior: `Usually completes tasks during hour ${currentHour}`,
            actualBehavior: "No task completions today",
            relatedPattern: pattern,
          });
        }
      }
    } catch (error) {
      logger.error("Error checking task pattern:", error);
    }
  }

  logger.info(`Detected ${anomalies.length} behavioral anomalies`);
  return anomalies;
}

/**
 * Correlate events across data sources
 */
export interface EventCorrelation {
  primaryEvent: {
    type: "calendar" | "task" | "location" | "conversation";
    id: string;
    title: string;
    timestamp: Date;
  };
  relatedEvents: Array<{
    type: "calendar" | "task" | "location" | "conversation";
    id: string;
    title: string;
    timestamp: Date;
    correlation: string; // How it's related
  }>;
}

export async function correlateEvents(
  timeWindowHours: number = 2
): Promise<EventCorrelation[]> {
  const correlations: EventCorrelation[] = [];
  const now = new Date();
  const windowStart = new Date(now.getTime() - timeWindowHours * 60 * 60 * 1000);

  // Get recent events from all sources
  const recentCalendarEvents = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        gte(calendarEvents.start, windowStart.toISOString()),
        lte(calendarEvents.start, now.toISOString())
      )
    );

  const recentTaskCompletions = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.completed, true),
        gte(tasks.updatedAt, windowStart.toISOString())
      )
    );

  const recentConversations = await db
    .select()
    .from(limitlessLifelogs)
    .where(
      and(
        gte(limitlessLifelogs.startTimestamp, windowStart.toISOString()),
        eq(limitlessLifelogs.processedSuccessfully, true)
      )
    );

  // Correlate calendar events with tasks and conversations
  for (const event of recentCalendarEvents) {
    const eventTime = new Date(event.start);
    const related: EventCorrelation["relatedEvents"] = [];

    // Find tasks completed around the same time
    for (const task of recentTaskCompletions) {
      const taskTime = new Date(task.updatedAt);
      const timeDiff = Math.abs(taskTime.getTime() - eventTime.getTime()) / (1000 * 60); // minutes

      if (timeDiff < 60) {
        // Within 1 hour
        related.push({
          type: "task",
          id: task.id,
          title: task.title,
          timestamp: taskTime,
          correlation: `Task completed ${Math.round(timeDiff)} minutes from event`,
        });
      }
    }

    // Find conversations during the event
    for (const conv of recentConversations) {
      const convStart = new Date(conv.startTimestamp);
      const convEnd = new Date(conv.endTimestamp);

      if (convStart <= new Date(event.end) && convEnd >= eventTime) {
        related.push({
          type: "conversation",
          id: conv.id,
          title: conv.summary || "Conversation",
          timestamp: convStart,
          correlation: "Conversation occurred during event",
        });
      }
    }

    if (related.length > 0) {
      correlations.push({
        primaryEvent: {
          type: "calendar",
          id: event.id,
          title: event.title,
          timestamp: eventTime,
        },
        relatedEvents: related,
      });
    }
  }

  logger.info(`Found ${correlations.length} event correlations in the last ${timeWindowHours} hours`);
  return correlations;
}

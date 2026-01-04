/**
 * Proactive Context Injection for ZEKE
 * 
 * Makes ZEKE more genuinely helpful by proactively surfacing relevant
 * context, suggestions, and action items based on:
 * - Time of day patterns
 * - Location awareness
 * - Recent conversation context
 * - Upcoming calendar events
 * - Memory patterns and knowledge graph insights
 */

import {
  getTasksDueToday,
  getTasksDueTomorrow,
  getOverdueTasks,
  getUpcomingReminders,
  getLatestLocation,
  findNearbyPlaces,
  checkGroceryProximity,
  getAllGroceryItems,
  getRecentLocationSamples,
} from "./db";
import { getUpcomingEvents } from "./googleCalendar";
import { getRecentMemories } from "./omi";
import { getSmartMemoryContext } from "./semanticMemory";
import { getCurrentLocationState, getLocationContextForAI } from "./locationIntelligence";
import { getCurrentWeather, type WeatherData } from "./weather";
import type { GroceryItem, Task } from "@shared/schema";

export interface ProactiveInsight {
  type: "reminder" | "suggestion" | "context" | "action" | "alert";
  priority: "high" | "medium" | "low";
  title: string;
  content: string;
  actionable?: boolean;
  action?: string;
  expiresAt?: string;
}

export interface ProactiveContext {
  insights: ProactiveInsight[];
  summary: string;
  generatedAt: string;
  triggers: string[];
}

interface TimeContext {
  hour: number;
  dayOfWeek: number;
  isWeekend: boolean;
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
  isWorkHours: boolean;
}

function getTimeContext(now: Date = new Date()): TimeContext {
  const hour = now.getHours();
  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  
  let timeOfDay: TimeContext["timeOfDay"];
  if (hour >= 5 && hour < 12) {
    timeOfDay = "morning";
  } else if (hour >= 12 && hour < 17) {
    timeOfDay = "afternoon";
  } else if (hour >= 17 && hour < 21) {
    timeOfDay = "evening";
  } else {
    timeOfDay = "night";
  }
  
  const isWorkHours = !isWeekend && hour >= 9 && hour < 18;
  
  return { hour, dayOfWeek, isWeekend, timeOfDay, isWorkHours };
}

export async function generateProactiveContext(
  userMessage: string,
  conversationId?: string
): Promise<ProactiveContext> {
  const now = new Date();
  const timeContext = getTimeContext(now);
  const insights: ProactiveInsight[] = [];
  const triggers: string[] = [];

  const [
    tasksDueToday,
    overdueTasks,
    upcomingReminders,
    groceryItems,
    upcomingEvents,
    latestLocation,
    recentMemories,
  ] = await Promise.all([
    Promise.resolve(getTasksDueToday()),
    Promise.resolve(getOverdueTasks()),
    Promise.resolve(getUpcomingReminders(60)),
    Promise.resolve(getAllGroceryItems()),
    getUpcomingEvents(3).catch(() => []),
    getLatestLocation().catch(() => null),
    getRecentMemories(6).catch(() => []),
  ]);

  if (overdueTasks.length > 0) {
    triggers.push("overdue_tasks");
    insights.push({
      type: "alert",
      priority: "high",
      title: "Overdue Tasks",
      content: `You have ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? "s" : ""}: ${overdueTasks.slice(0, 3).map(t => t.title).join(", ")}${overdueTasks.length > 3 ? ` and ${overdueTasks.length - 3} more` : ""}`,
      actionable: true,
      action: "Would you like me to help prioritize these tasks?",
    });
  }

  if (tasksDueToday.length > 0) {
    triggers.push("tasks_due_today");
    const highPriority = tasksDueToday.filter(t => t.priority === "high");
    if (highPriority.length > 0) {
      insights.push({
        type: "reminder",
        priority: "high",
        title: "High Priority Tasks Today",
        content: `${highPriority.length} high-priority task${highPriority.length > 1 ? "s" : ""} due today: ${highPriority.map(t => t.title).join(", ")}`,
        actionable: true,
      });
    }
  }

  if (upcomingReminders.length > 0) {
    triggers.push("upcoming_reminders");
    const nextReminder = upcomingReminders[0];
    insights.push({
      type: "reminder",
      priority: "medium",
      title: "Upcoming Reminder",
      content: nextReminder.content,
      expiresAt: nextReminder.scheduledFor,
    });
  }

  if (upcomingEvents.length > 0) {
    triggers.push("calendar_events");
    const nextEvent = upcomingEvents[0];
    const eventStart = new Date(nextEvent.start?.dateTime || nextEvent.start?.date || "");
    const minutesUntil = Math.round((eventStart.getTime() - now.getTime()) / (1000 * 60));
    
    if (minutesUntil > 0 && minutesUntil <= 60) {
      insights.push({
        type: "alert",
        priority: "high",
        title: "Upcoming Event",
        content: `"${nextEvent.summary}" starts in ${minutesUntil} minutes`,
        actionable: true,
        action: "Need any prep assistance?",
      });
    } else if (minutesUntil > 60 && minutesUntil <= 180) {
      insights.push({
        type: "context",
        priority: "medium",
        title: "Later Today",
        content: `"${nextEvent.summary}" at ${eventStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
      });
    }
  }

  if (latestLocation) {
    const groceryCheck = checkGroceryProximity(latestLocation.latitude, latestLocation.longitude);
    if (groceryCheck) {
      const unpurchasedItems = groceryItems.filter(g => !g.purchased);
      if (unpurchasedItems.length > 0) {
        triggers.push("grocery_proximity");
        insights.push({
          type: "suggestion",
          priority: "medium",
          title: "Grocery Store Nearby",
          content: `You're near ${groceryCheck.place.name}. You have ${unpurchasedItems.length} item${unpurchasedItems.length > 1 ? "s" : ""} on your grocery list: ${unpurchasedItems.slice(0, 5).map(g => g.name).join(", ")}`,
          actionable: true,
          action: "Want me to read your full list?",
        });
      }
    }
  }

  if (timeContext.timeOfDay === "morning" && timeContext.hour >= 6 && timeContext.hour <= 9) {
    triggers.push("morning_context");
    
    try {
      const weatherData = await getCurrentWeather();
      if (weatherData) {
        insights.push({
          type: "context",
          priority: "low",
          title: "Weather",
          content: `Currently ${Math.round(weatherData.temperature)}°F, ${weatherData.description}. High of ${Math.round(weatherData.high)}°F, low of ${Math.round(weatherData.low)}°F.`,
        });
      }
    } catch (e) {
    }
  }

  if (userMessage && userMessage.length > 10) {
    try {
      const memoryContext = await getSmartMemoryContext(userMessage, 3);
      if (memoryContext.memories.length > 0) {
        triggers.push("relevant_memories");
        const relevantMemory = memoryContext.memories[0];
        if (relevantMemory.content && relevantMemory.content.length > 20) {
          insights.push({
            type: "context",
            priority: "low",
            title: "Related Memory",
            content: relevantMemory.content.substring(0, 200) + (relevantMemory.content.length > 200 ? "..." : ""),
          });
        }
      }
    } catch (e) {
    }
  }

  insights.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  const summary = generateProactiveSummary(insights, timeContext);

  return {
    insights: insights.slice(0, 5),
    summary,
    generatedAt: now.toISOString(),
    triggers,
  };
}

function generateProactiveSummary(
  insights: ProactiveInsight[],
  timeContext: TimeContext
): string {
  if (insights.length === 0) {
    const greetings: Record<TimeContext["timeOfDay"], string> = {
      morning: "Good morning! How can I help you today?",
      afternoon: "Good afternoon! What can I assist with?",
      evening: "Good evening! How can I help?",
      night: "Hello! What can I do for you?",
    };
    return greetings[timeContext.timeOfDay];
  }

  const highPriorityCount = insights.filter(i => i.priority === "high").length;
  
  if (highPriorityCount > 0) {
    return `I have ${highPriorityCount} important item${highPriorityCount > 1 ? "s" : ""} for your attention.`;
  }

  return `I have ${insights.length} update${insights.length > 1 ? "s" : ""} that might be helpful.`;
}

export function formatProactiveContextForPrompt(context: ProactiveContext): string {
  if (context.insights.length === 0) {
    return "";
  }

  const lines: string[] = [
    "## Proactive Context",
    "",
  ];

  for (const insight of context.insights) {
    const icon = {
      alert: "[!]",
      reminder: "[R]",
      suggestion: "[S]",
      context: "[C]",
      action: "[A]",
    }[insight.type];

    lines.push(`${icon} **${insight.title}**: ${insight.content}`);
    if (insight.action) {
      lines.push(`   → ${insight.action}`);
    }
  }

  lines.push("");
  lines.push("Use this context to provide proactive, helpful responses. If any items are urgent, mention them naturally in your response.");

  return lines.join("\n");
}

export async function shouldTriggerProactiveResponse(
  userMessage: string,
  lastInteractionTime?: Date
): Promise<boolean> {
  const now = new Date();
  const timeSinceLastInteraction = lastInteractionTime 
    ? (now.getTime() - lastInteractionTime.getTime()) / (1000 * 60)
    : Infinity;

  if (timeSinceLastInteraction > 60) {
    return true;
  }

  const greetingPatterns = /^(hi|hello|hey|good\s*(morning|afternoon|evening)|what's\s*up|yo)\b/i;
  if (greetingPatterns.test(userMessage.trim())) {
    return true;
  }

  const statusPatterns = /\b(what.*should|what.*do|any.*update|anything.*know|catch.*up|what.*miss)\b/i;
  if (statusPatterns.test(userMessage)) {
    return true;
  }

  return false;
}

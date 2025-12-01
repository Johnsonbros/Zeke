import {
  createInsight,
  getOverdueTasks,
  getAllTasks,
  getLowConfidenceMemories,
  getMemoriesNeedingConfirmation,
  getAllMemoryNotes,
  getEntitiesByType,
  getEntityLinks,
  getItemsRelatedToEntity,
  insightExistsForSource,
  findInsightByTypeAndSource,
  cleanupExpiredInsights,
} from "./db";
import type {
  InsertInsight,
  Insight,
  Task,
  MemoryWithConfidence,
  Entity,
  EntityDomain,
} from "@shared/schema";

interface DetectorResult {
  insights: InsertInsight[];
  skipped: number;
}

// Detect insights related to task health
export function detectTaskInsights(): DetectorResult {
  const insights: InsertInsight[] = [];
  let skipped = 0;

  try {
    // 1. Find overdue tasks
    const overdueTasks = getOverdueTasks();
    for (const task of overdueTasks) {
      const sourceId = `task:${task.id}`;
      
      if (insightExistsForSource("task_overdue", sourceId)) {
        skipped++;
        continue;
      }

      const daysPastDue = task.dueDate 
        ? Math.floor((Date.now() - new Date(task.dueDate).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      const priority = daysPastDue > 7 ? "high" : daysPastDue > 3 ? "medium" : "low";

      insights.push({
        type: "task_overdue",
        category: "task_health",
        title: `Overdue: ${task.title}`,
        content: `Task "${task.title}" is ${daysPastDue} day(s) overdue. ${task.description ? `Description: ${task.description}` : ""}`,
        priority,
        confidence: "0.95",
        suggestedAction: "Review and reschedule or complete this task",
        actionPayload: JSON.stringify({ taskId: task.id, action: "review_task" }),
        sourceEntityId: sourceId,
        expiresAt: null,
      });
    }

    // 2. Find task clusters (multiple pending tasks in same category)
    const allTasks = getAllTasks(false); // Only incomplete tasks
    const tasksByCategory = new Map<string, Task[]>();
    
    for (const task of allTasks) {
      if (!task.category) continue;
      const existing = tasksByCategory.get(task.category) || [];
      existing.push(task);
      tasksByCategory.set(task.category, existing);
    }

    for (const [category, tasks] of tasksByCategory) {
      if (tasks.length >= 3) {
        const sourceId = `task_cluster:${category}`;
        
        if (insightExistsForSource("task_cluster", sourceId)) {
          skipped++;
          continue;
        }

        const taskTitles = tasks.slice(0, 5).map(t => t.title).join(", ");
        
        insights.push({
          type: "task_cluster",
          category: "task_health",
          title: `${tasks.length} pending tasks in "${category}"`,
          content: `You have ${tasks.length} pending tasks in the "${category}" category: ${taskTitles}${tasks.length > 5 ? "..." : ""}. Consider batching or prioritizing these.`,
          priority: tasks.length >= 5 ? "medium" : "low",
          confidence: "0.8",
          suggestedAction: `Review ${category} tasks together`,
          actionPayload: JSON.stringify({ category, taskIds: tasks.map(t => t.id), action: "batch_review" }),
          sourceEntityId: sourceId,
          expiresAt: null,
        });
      }
    }

    // 3. Check task completion trends (if many tasks completed recently)
    const completedTasks = getAllTasks(true).filter(t => t.completed);
    const recentlyCompleted = completedTasks.filter(t => {
      const updated = new Date(t.updatedAt);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return updated >= weekAgo;
    });

    if (recentlyCompleted.length >= 5) {
      const sourceId = `completion_trend:weekly`;
      
      if (!insightExistsForSource("task_completion_trend", sourceId)) {
        insights.push({
          type: "task_completion_trend",
          category: "task_health",
          title: `Great progress: ${recentlyCompleted.length} tasks completed this week`,
          content: `You've completed ${recentlyCompleted.length} tasks in the last 7 days. Keep up the momentum!`,
          priority: "low",
          confidence: "0.9",
          suggestedAction: null,
          actionPayload: JSON.stringify({ count: recentlyCompleted.length, action: "celebrate" }),
          sourceEntityId: sourceId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
      } else {
        skipped++;
      }
    }

  } catch (error) {
    console.error("[InsightsGenerator] Error detecting task insights:", error);
  }

  return { insights, skipped };
}

// Detect insights related to memory hygiene
export function detectMemoryInsights(): DetectorResult {
  const insights: InsertInsight[] = [];
  let skipped = 0;

  try {
    // 1. Find memories with low confidence
    const lowConfidenceMemories = getLowConfidenceMemories(10);
    
    if (lowConfidenceMemories.length >= 3) {
      const sourceId = `memory_confidence:low_batch`;
      
      if (!insightExistsForSource("memory_low_confidence", sourceId)) {
        const sampleMemories = lowConfidenceMemories.slice(0, 3).map(m => m.content.substring(0, 50) + "...").join("; ");
        
        insights.push({
          type: "memory_low_confidence",
          category: "memory_hygiene",
          title: `${lowConfidenceMemories.length} memories need confirmation`,
          content: `There are ${lowConfidenceMemories.length} memories with low confidence that could benefit from verification. Examples: ${sampleMemories}`,
          priority: "medium",
          confidence: "0.85",
          suggestedAction: "Review and confirm or update these memories",
          actionPayload: JSON.stringify({ 
            memoryIds: lowConfidenceMemories.map(m => m.id),
            action: "review_memories"
          }),
          sourceEntityId: sourceId,
          expiresAt: null,
        });
      } else {
        skipped++;
      }
    }

    // 2. Find memories needing explicit confirmation
    const needsConfirmation = getMemoriesNeedingConfirmation();
    
    for (const memory of needsConfirmation.slice(0, 5)) {
      const sourceId = `memory:${memory.id}`;
      
      if (insightExistsForSource("memory_low_confidence", sourceId)) {
        skipped++;
        continue;
      }

      insights.push({
        type: "memory_low_confidence",
        category: "memory_hygiene",
        title: `Memory needs confirmation`,
        content: `"${memory.content.substring(0, 100)}${memory.content.length > 100 ? "..." : ""}" - This memory has not been confirmed and may need verification.`,
        priority: "low",
        confidence: String(memory.confidenceScore),
        suggestedAction: "Confirm or update this memory",
        actionPayload: JSON.stringify({ memoryId: memory.id, action: "confirm_memory" }),
        sourceEntityId: sourceId,
        expiresAt: null,
      });
    }

    // 3. Find stale memories (not updated in 30+ days)
    const allMemories = getAllMemoryNotes(false);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const staleMemories = allMemories.filter(m => new Date(m.updatedAt) < thirtyDaysAgo);

    if (staleMemories.length >= 5) {
      const sourceId = `memory_stale:batch`;
      
      if (!insightExistsForSource("memory_stale", sourceId)) {
        insights.push({
          type: "memory_stale",
          category: "memory_hygiene",
          title: `${staleMemories.length} memories haven't been updated in 30+ days`,
          content: `There are ${staleMemories.length} memories that haven't been reviewed or updated in over a month. Some information may be outdated.`,
          priority: "low",
          confidence: "0.7",
          suggestedAction: "Review older memories for accuracy",
          actionPayload: JSON.stringify({ 
            count: staleMemories.length,
            oldestDate: staleMemories[staleMemories.length - 1]?.updatedAt,
            action: "review_stale_memories"
          }),
          sourceEntityId: sourceId,
          expiresAt: null,
        });
      } else {
        skipped++;
      }
    }

  } catch (error) {
    console.error("[InsightsGenerator] Error detecting memory insights:", error);
  }

  return { insights, skipped };
}

// Detect insights related to calendar load
export function detectCalendarInsights(): DetectorResult {
  const insights: InsertInsight[] = [];
  let skipped = 0;

  try {
    // Look for calendar events from the entity system
    const calendarEntities = getEntitiesByType("calendar_event");
    
    if (calendarEntities.length === 0) {
      // No calendar events tracked, skip
      return { insights, skipped };
    }

    // Group events by date from metadata
    const eventsByDate = new Map<string, Entity[]>();
    
    for (const entity of calendarEntities) {
      if (!entity.metadata) continue;
      
      try {
        const meta = JSON.parse(entity.metadata);
        const eventDate = meta.date || meta.startDate;
        if (eventDate) {
          const dateKey = eventDate.split("T")[0];
          const existing = eventsByDate.get(dateKey) || [];
          existing.push(entity);
          eventsByDate.set(dateKey, existing);
        }
      } catch {
        continue;
      }
    }

    // Find busy days (4+ events)
    const today = new Date();
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    for (const [dateStr, events] of eventsByDate) {
      const eventDate = new Date(dateStr);
      
      // Only care about upcoming dates
      if (eventDate < today || eventDate > nextWeek) continue;
      
      if (events.length >= 4) {
        const sourceId = `calendar_busy:${dateStr}`;
        
        if (insightExistsForSource("calendar_busy", sourceId)) {
          skipped++;
          continue;
        }

        const eventTitles = events.slice(0, 3).map(e => e.label).join(", ");
        
        insights.push({
          type: "calendar_busy",
          category: "calendar_load",
          title: `Busy day: ${events.length} events on ${dateStr}`,
          content: `You have ${events.length} events scheduled for ${dateStr}: ${eventTitles}${events.length > 3 ? "..." : ""}. Consider preparing in advance.`,
          priority: events.length >= 6 ? "high" : "medium",
          confidence: "0.9",
          suggestedAction: "Review and prepare for busy day",
          actionPayload: JSON.stringify({ 
            date: dateStr,
            eventCount: events.length,
            action: "review_day"
          }),
          sourceEntityId: sourceId,
          expiresAt: new Date(eventDate.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    }

    // Check for tasks due on busy days
    const tasksDueToday = getOverdueTasks();
    const todayStr = today.toISOString().split("T")[0];
    const todayEvents = eventsByDate.get(todayStr) || [];
    
    if (todayEvents.length >= 3 && tasksDueToday.length > 0) {
      const sourceId = `calendar_conflict:${todayStr}`;
      
      if (!insightExistsForSource("calendar_conflict", sourceId)) {
        insights.push({
          type: "calendar_conflict",
          category: "calendar_load",
          title: `Busy day with overdue tasks`,
          content: `You have ${todayEvents.length} events today and ${tasksDueToday.length} overdue task(s). Consider rescheduling some items.`,
          priority: "high",
          confidence: "0.85",
          suggestedAction: "Prioritize or reschedule tasks",
          actionPayload: JSON.stringify({ 
            eventCount: todayEvents.length,
            overdueTaskCount: tasksDueToday.length,
            action: "resolve_conflict"
          }),
          sourceEntityId: sourceId,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      } else {
        skipped++;
      }
    }

  } catch (error) {
    console.error("[InsightsGenerator] Error detecting calendar insights:", error);
  }

  return { insights, skipped };
}

// Detect cross-domain insights (connections between different areas)
export function detectCrossDomainInsights(): DetectorResult {
  const insights: InsertInsight[] = [];
  let skipped = 0;

  try {
    // 1. Find person entities that appear across multiple domains
    const personEntities = getEntitiesByType("person");
    
    for (const person of personEntities) {
      const relatedItems = getItemsRelatedToEntity(person.id);
      
      // Count unique domains
      const domains = new Set(relatedItems.map(item => item.domain));
      
      if (domains.size >= 3) {
        const sourceId = `cross_domain:person:${person.id}`;
        
        if (insightExistsForSource("cross_domain_connection", sourceId)) {
          skipped++;
          continue;
        }

        const domainList = Array.from(domains).join(", ");
        const itemCount = relatedItems.length;

        insights.push({
          type: "cross_domain_connection",
          category: "cross_domain",
          title: `${person.label} appears across ${domains.size} areas`,
          content: `"${person.label}" is referenced in ${itemCount} items across ${domainList}. This person may be important in multiple contexts.`,
          priority: domains.size >= 4 ? "medium" : "low",
          confidence: "0.75",
          suggestedAction: "View all references to this person",
          actionPayload: JSON.stringify({ 
            entityId: person.id,
            entityLabel: person.label,
            domains: Array.from(domains),
            action: "view_entity_connections"
          }),
          sourceEntityId: sourceId,
          expiresAt: null,
        });
      }
    }

    // 2. Find topics that connect different items
    const topicEntities = getEntitiesByType("topic");
    
    for (const topic of topicEntities.slice(0, 20)) {
      const links = getEntityLinks(topic.id);
      
      if (links.length >= 5) {
        const sourceId = `cross_domain:topic:${topic.id}`;
        
        if (insightExistsForSource("cross_domain_connection", sourceId)) {
          skipped++;
          continue;
        }

        insights.push({
          type: "cross_domain_connection",
          category: "cross_domain",
          title: `Topic "${topic.label}" connects ${links.length} items`,
          content: `The topic "${topic.label}" links ${links.length} different items together. This may represent a recurring theme or project.`,
          priority: "low",
          confidence: "0.7",
          suggestedAction: "Explore connected items",
          actionPayload: JSON.stringify({ 
            entityId: topic.id,
            entityLabel: topic.label,
            linkCount: links.length,
            action: "explore_topic"
          }),
          sourceEntityId: sourceId,
          expiresAt: null,
        });
      }
    }

    // 3. Find highly connected entities (any type with many links)
    const allEntities = [
      ...getEntitiesByType("location"),
      ...getEntitiesByType("task"),
      ...getEntitiesByType("memory"),
    ];

    for (const entity of allEntities.slice(0, 30)) {
      const relatedItems = getItemsRelatedToEntity(entity.id);
      
      if (relatedItems.length >= 10) {
        const sourceId = `cross_domain:connections:${entity.id}`;
        
        if (insightExistsForSource("cross_domain_connection", sourceId)) {
          skipped++;
          continue;
        }

        insights.push({
          type: "cross_domain_connection",
          category: "cross_domain",
          title: `"${entity.label}" has ${relatedItems.length} connections`,
          content: `The ${entity.type} "${entity.label}" is referenced ${relatedItems.length} times. This appears to be a significant item in your system.`,
          priority: "low",
          confidence: "0.65",
          suggestedAction: "Review connections",
          actionPayload: JSON.stringify({ 
            entityId: entity.id,
            entityType: entity.type,
            connectionCount: relatedItems.length,
            action: "view_connections"
          }),
          sourceEntityId: sourceId,
          expiresAt: null,
        });
      }
    }

  } catch (error) {
    console.error("[InsightsGenerator] Error detecting cross-domain insights:", error);
  }

  return { insights, skipped };
}

// Generate all insights from all detectors
export async function generateAllInsights(): Promise<{
  created: number;
  skipped: number;
  byCategory: Record<string, number>;
  errors: string[];
}> {
  const results = {
    created: 0,
    skipped: 0,
    byCategory: {} as Record<string, number>,
    errors: [] as string[],
  };

  console.log("[InsightsGenerator] Starting insight generation...");

  // Clean up expired insights first
  try {
    const cleaned = cleanupExpiredInsights();
    if (cleaned > 0) {
      console.log(`[InsightsGenerator] Cleaned up ${cleaned} expired insights`);
    }
  } catch (error) {
    console.error("[InsightsGenerator] Error cleaning up expired insights:", error);
  }

  // Run all detectors
  const detectors = [
    { name: "task", fn: detectTaskInsights },
    { name: "memory", fn: detectMemoryInsights },
    { name: "calendar", fn: detectCalendarInsights },
    { name: "cross_domain", fn: detectCrossDomainInsights },
  ];

  for (const detector of detectors) {
    try {
      console.log(`[InsightsGenerator] Running ${detector.name} detector...`);
      const result = detector.fn();
      
      results.skipped += result.skipped;
      
      // Save new insights
      for (const insight of result.insights) {
        try {
          createInsight(insight);
          results.created++;
          
          const category = insight.category;
          results.byCategory[category] = (results.byCategory[category] || 0) + 1;
        } catch (error) {
          console.error(`[InsightsGenerator] Error creating insight:`, error);
          results.errors.push(`Failed to create insight: ${insight.title}`);
        }
      }
      
      console.log(`[InsightsGenerator] ${detector.name}: created ${result.insights.length}, skipped ${result.skipped}`);
    } catch (error) {
      console.error(`[InsightsGenerator] Error in ${detector.name} detector:`, error);
      results.errors.push(`Detector ${detector.name} failed: ${error}`);
    }
  }

  console.log(`[InsightsGenerator] Complete: created ${results.created}, skipped ${results.skipped}`);
  
  return results;
}

// Export individual detectors for testing
export const detectors = {
  task: detectTaskInsights,
  memory: detectMemoryInsights,
  calendar: detectCalendarInsights,
  crossDomain: detectCrossDomainInsights,
};

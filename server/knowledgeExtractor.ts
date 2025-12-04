/**
 * Knowledge Extractor - Builds semantic understanding from multiple data sources
 *
 * This module correlates information across lifelogs, location, tasks, and calendar
 * to build a rich understanding of the user's life patterns, relationships, and context.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import {
  knowledgeGraph,
  semanticClusters,
  contextualAssociations,
  temporalPatterns
} from "./schema";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface SemanticKnowledge {
  topics: TopicCluster[];
  relationships: EntityRelationship[];
  patterns: TemporalPattern[];
  associations: ContextAssociation[];
}

export interface TopicCluster {
  topic: string;
  frequency: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  relatedTopics: string[];
  firstMentioned: string;
  lastMentioned: string;
  contexts: string[]; // Where this topic appears
}

export interface EntityRelationship {
  entity1: string;
  entity1Type: string;
  entity2: string;
  entity2Type: string;
  relationshipType: string;
  strength: number; // 0-1
  evidence: string[];
}

export interface TemporalPattern {
  pattern: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'occasional';
  timeOfDay?: string;
  dayOfWeek?: string;
  confidence: number;
  observations: number;
  context: string;
}

export interface ContextAssociation {
  trigger: string;
  response: string;
  context: string;
  confidence: number;
  observations: number;
}

/**
 * Extract semantic knowledge from recent user data
 */
export async function extractKnowledge(
  timeRangeHours: number = 168 // Default: last week
): Promise<SemanticKnowledge> {
  const cutoffTime = new Date();
  cutoffTime.setHours(cutoffTime.getHours() - timeRangeHours);

  // Gather data from multiple sources
  const [lifelogs, locations, tasks, calendar] = await Promise.all([
    getRecentLifelogs(cutoffTime.toISOString()),
    getRecentLocations(cutoffTime.toISOString()),
    getRecentTasks(cutoffTime.toISOString()),
    getRecentCalendarEvents(cutoffTime.toISOString())
  ]);

  // Build comprehensive context
  const context = buildDataContext(lifelogs, locations, tasks, calendar);

  // Use Claude to extract semantic understanding
  const knowledge = await extractSemanticUnderstanding(context);

  // Store in database for future reference
  await storeKnowledge(knowledge);

  return knowledge;
}

/**
 * Build context string from multiple data sources
 */
function buildDataContext(
  lifelogs: any[],
  locations: any[],
  tasks: any[],
  calendar: any[]
): string {
  let context = "USER DATA CONTEXT:\n\n";

  // Lifelogs
  if (lifelogs.length > 0) {
    context += "RECENT CONVERSATIONS:\n";
    for (const log of lifelogs.slice(0, 10)) {
      context += `- [${log.startTime}] ${log.title}\n`;
      if (log.markdown) {
        context += `  ${log.markdown.substring(0, 200)}...\n`;
      }
    }
    context += "\n";
  }

  // Locations
  if (locations.length > 0) {
    context += "LOCATION PATTERNS:\n";
    const locationGroups = groupLocationsByPlace(locations);
    for (const [place, visits] of Object.entries(locationGroups).slice(0, 10)) {
      context += `- ${place}: ${visits.length} visits\n`;
    }
    context += "\n";
  }

  // Tasks
  if (tasks.length > 0) {
    context += "TASK ACTIVITY:\n";
    for (const task of tasks.slice(0, 10)) {
      context += `- [${task.status}] ${task.title}\n`;
    }
    context += "\n";
  }

  // Calendar
  if (calendar.length > 0) {
    context += "CALENDAR EVENTS:\n";
    for (const event of calendar.slice(0, 10)) {
      context += `- [${event.start}] ${event.summary}\n`;
    }
    context += "\n";
  }

  return context;
}

/**
 * Use Claude to extract semantic understanding
 */
async function extractSemanticUnderstanding(context: string): Promise<SemanticKnowledge> {
  const prompt = `You are analyzing user data to extract semantic knowledge and patterns.

${context}

Extract the following semantic knowledge:

1. TOPIC CLUSTERS - What topics/themes appear frequently?
   - Topic name
   - Frequency (how often mentioned)
   - Sentiment (positive/neutral/negative)
   - Related topics
   - Contexts where it appears

2. ENTITY RELATIONSHIPS - How are people, places, projects related?
   - Entity 1 and type (person/place/project/etc)
   - Entity 2 and type
   - Relationship type (works_with, located_at, part_of, etc)
   - Strength (0-1 confidence)
   - Evidence (why you think this relationship exists)

3. TEMPORAL PATTERNS - What happens regularly?
   - Pattern description
   - Frequency (daily/weekly/monthly/occasional)
   - Time of day (if applicable)
   - Day of week (if applicable)
   - Confidence (0-1)
   - Number of observations
   - Context

4. CONTEXTUAL ASSOCIATIONS - What triggers lead to what responses?
   - Trigger (situation/condition)
   - Response (what typically happens)
   - Context
   - Confidence (0-1)
   - Number of observations

Return as JSON:
{
  "topics": [
    {
      "topic": "topic name",
      "frequency": number,
      "sentiment": "positive|neutral|negative",
      "relatedTopics": ["topic1", "topic2"],
      "firstMentioned": "ISO date",
      "lastMentioned": "ISO date",
      "contexts": ["context1", "context2"]
    }
  ],
  "relationships": [
    {
      "entity1": "name",
      "entity1Type": "type",
      "entity2": "name",
      "entity2Type": "type",
      "relationshipType": "type",
      "strength": 0.0-1.0,
      "evidence": ["evidence1", "evidence2"]
    }
  ],
  "patterns": [
    {
      "pattern": "description",
      "frequency": "daily|weekly|monthly|occasional",
      "timeOfDay": "morning|afternoon|evening|night",
      "dayOfWeek": "Monday|Tuesday|...",
      "confidence": 0.0-1.0,
      "observations": number,
      "context": "context"
    }
  ],
  "associations": [
    {
      "trigger": "trigger description",
      "response": "response description",
      "context": "context",
      "confidence": 0.0-1.0,
      "observations": number
    }
  ]
}

IMPORTANT: Only extract patterns with strong evidence. Higher confidence for repeated observations.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: prompt
      }]
    });

    const responseText = message.content[0].type === 'text'
      ? message.content[0].text
      : '';

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to extract JSON from Claude response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      topics: parsed.topics || [],
      relationships: parsed.relationships || [],
      patterns: parsed.patterns || [],
      associations: parsed.associations || []
    };
  } catch (error) {
    console.error("Error extracting semantic understanding:", error);
    throw error;
  }
}

/**
 * Store extracted knowledge in database
 */
async function storeKnowledge(knowledge: SemanticKnowledge): Promise<void> {
  const now = new Date().toISOString();

  // Store topic clusters
  for (const topic of knowledge.topics) {
    if (topic.frequency < 2) continue; // Only store if mentioned multiple times

    await db.insert(semanticClusters).values({
      topic: topic.topic,
      frequency: topic.frequency,
      sentiment: topic.sentiment,
      relatedTopics: JSON.stringify(topic.relatedTopics),
      firstMentioned: topic.firstMentioned,
      lastMentioned: topic.lastMentioned,
      contexts: JSON.stringify(topic.contexts),
      updatedAt: now
    }).onConflictDoUpdate({
      target: semanticClusters.topic,
      set: {
        frequency: topic.frequency,
        sentiment: topic.sentiment,
        relatedTopics: JSON.stringify(topic.relatedTopics),
        lastMentioned: topic.lastMentioned,
        contexts: JSON.stringify(topic.contexts),
        updatedAt: now
      }
    });
  }

  // Store relationships in knowledge graph
  for (const rel of knowledge.relationships) {
    if (rel.strength < 0.5) continue; // Only store confident relationships

    await db.insert(knowledgeGraph).values({
      entity1: rel.entity1,
      entity1Type: rel.entity1Type,
      entity2: rel.entity2,
      entity2Type: rel.entity2Type,
      relationshipType: rel.relationshipType,
      strength: rel.strength.toString(),
      evidence: JSON.stringify(rel.evidence),
      discoveredAt: now,
      lastSeen: now
    }).onConflictDoUpdate({
      target: [knowledgeGraph.entity1, knowledgeGraph.entity2, knowledgeGraph.relationshipType],
      set: {
        strength: rel.strength.toString(),
        evidence: JSON.stringify(rel.evidence),
        lastSeen: now
      }
    });
  }

  // Store temporal patterns
  for (const pattern of knowledge.patterns) {
    if (pattern.confidence < 0.6) continue; // Only store confident patterns

    await db.insert(temporalPatterns).values({
      pattern: pattern.pattern,
      frequency: pattern.frequency,
      timeOfDay: pattern.timeOfDay,
      dayOfWeek: pattern.dayOfWeek,
      confidence: pattern.confidence.toString(),
      observations: pattern.observations,
      context: pattern.context,
      firstObserved: now,
      lastObserved: now
    }).onConflictDoUpdate({
      target: temporalPatterns.pattern,
      set: {
        frequency: pattern.frequency,
        confidence: pattern.confidence.toString(),
        observations: pattern.observations,
        lastObserved: now
      }
    });
  }

  // Store contextual associations
  for (const assoc of knowledge.associations) {
    if (assoc.confidence < 0.6) continue;

    await db.insert(contextualAssociations).values({
      trigger: assoc.trigger,
      response: assoc.response,
      context: assoc.context,
      confidence: assoc.confidence.toString(),
      observations: assoc.observations,
      firstObserved: now,
      lastObserved: now
    }).onConflictDoUpdate({
      target: [contextualAssociations.trigger, contextualAssociations.response],
      set: {
        confidence: assoc.confidence.toString(),
        observations: assoc.observations,
        lastObserved: now
      }
    });
  }
}

// Helper functions to fetch data
async function getRecentLifelogs(since: string): Promise<any[]> {
  // Fetch from limitless_lifelogs table
  try {
    const { limitlessLifelogs } = await import('./schema');
    return await db
      .select()
      .from(limitlessLifelogs)
      .where(gte(limitlessLifelogs.startTime, since))
      .orderBy(desc(limitlessLifelogs.startTime))
      .limit(50);
  } catch (error) {
    console.error("Error fetching recent lifelogs:", error);
    return [];
  }
}

async function getRecentLocations(since: string): Promise<any[]> {
  try {
    const { locationHistory } = await import('./schema');
    return await db
      .select()
      .from(locationHistory)
      .where(gte(locationHistory.createdAt, since))
      .orderBy(desc(locationHistory.createdAt))
      .limit(100);
  } catch (error) {
    console.error("Error fetching recent locations:", error);
    return [];
  }
}

async function getRecentTasks(since: string): Promise<any[]> {
  try {
    const { tasks } = await import('./schema');
    return await db
      .select()
      .from(tasks)
      .where(gte(tasks.createdAt, since))
      .orderBy(desc(tasks.createdAt))
      .limit(50);
  } catch (error) {
    console.error("Error fetching recent tasks:", error);
    return [];
  }
}

async function getRecentCalendarEvents(since: string): Promise<any[]> {
  try {
    // Fetch from Google Calendar
    const { listEvents } = await import('./googleCalendar');
    return await listEvents(since);
  } catch (error) {
    console.error("Error fetching calendar events:", error);
    return [];
  }
}

function groupLocationsByPlace(locations: any[]): Record<string, any[]> {
  const groups: Record<string, any[]> = {};

  for (const loc of locations) {
    // Simple grouping by coordinates (could be enhanced with place names)
    const key = `${parseFloat(loc.latitude).toFixed(3)},${parseFloat(loc.longitude).toFixed(3)}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(loc);
  }

  return groups;
}

/**
 * Get topic clusters for context
 */
export async function getTopicClusters(limit: number = 20): Promise<any[]> {
  return await db
    .select()
    .from(semanticClusters)
    .orderBy(desc(semanticClusters.frequency))
    .limit(limit);
}

/**
 * Get temporal patterns
 */
export async function getTemporalPatterns(minConfidence: number = 0.6): Promise<any[]> {
  return await db
    .select()
    .from(temporalPatterns)
    .where(gte(temporalPatterns.confidence, minConfidence.toString()))
    .orderBy(desc(temporalPatterns.confidence));
}

/**
 * Get contextual associations
 */
export async function getContextualAssociations(minConfidence: number = 0.6): Promise<any[]> {
  return await db
    .select()
    .from(contextualAssociations)
    .where(gte(contextualAssociations.confidence, minConfidence.toString()))
    .orderBy(desc(contextualAssociations.confidence));
}

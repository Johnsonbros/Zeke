/**
 * Intent Parser - Extracts user goals, preferences, and commitments from lifelogs
 *
 * This module analyzes conversation transcripts to understand what the user
 * cares about, what they're trying to accomplish, and what they prefer.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { eq, desc, and, gte } from "drizzle-orm";
import {
  userIntents,
  userPreferences,
  userCommitments,
  intentCategories
} from "./schema";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ExtractedIntent {
  category: 'goal' | 'preference' | 'commitment' | 'concern' | 'question' | 'dislike';
  description: string;
  confidence: number; // 0-1 scale
  context: string;
  extractedFrom: string; // lifelog ID or source
  relatedEntities: string[];
  timeframe?: string; // "this week", "by friday", "ongoing", etc.
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

export interface ParsedLifelogIntent {
  lifelogId: string;
  title: string;
  timestamp: string;
  intents: ExtractedIntent[];
  keyTopics: string[];
  emotionalTone: 'positive' | 'neutral' | 'negative' | 'mixed';
  actionableInsights: string[];
}

/**
 * Parse a lifelog to extract user intents, preferences, and commitments
 */
export async function parseLifelogForIntent(
  lifelogId: string,
  lifelogContent: string,
  title: string,
  timestamp: string
): Promise<ParsedLifelogIntent> {
  const prompt = `You are analyzing a transcript of a user's conversation/lifelog to extract their intents, goals, preferences, and commitments.

CONVERSATION TRANSCRIPT:
Title: ${title}
Time: ${timestamp}

${lifelogContent}

Extract the following from this conversation:

1. INTENTS - What is the user trying to accomplish? What are their goals?
   - Category: goal, preference, commitment, concern, question, or dislike
   - Description: Clear description of the intent
   - Confidence: 0-1 (how certain are you this is a real intent?)
   - Context: Why/when is this relevant?
   - Timeframe: When do they want this? (if mentioned)
   - Priority: low/medium/high/urgent (if determinable)
   - Related entities: People, places, projects mentioned

2. KEY TOPICS - Main subjects discussed (3-5 topics max)

3. EMOTIONAL TONE - Overall sentiment (positive/neutral/negative/mixed)

4. ACTIONABLE INSIGHTS - What could an AI assistant proactively do based on this conversation?

Return your analysis as JSON:
{
  "intents": [
    {
      "category": "goal|preference|commitment|concern|question|dislike",
      "description": "clear description",
      "confidence": 0.0-1.0,
      "context": "why this matters",
      "timeframe": "when relevant",
      "priority": "low|medium|high|urgent",
      "relatedEntities": ["person", "place", "thing"]
    }
  ],
  "keyTopics": ["topic1", "topic2", "topic3"],
  "emotionalTone": "positive|neutral|negative|mixed",
  "actionableInsights": ["insight 1", "insight 2"]
}

IMPORTANT:
- Only extract REAL intents with good evidence in the transcript
- Higher confidence (0.7+) for explicit statements
- Lower confidence (0.3-0.6) for implied/inferred intents
- Don't hallucinate - if there's nothing actionable, return empty arrays`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: prompt
      }]
    });

    const responseText = message.content[0].type === 'text'
      ? message.content[0].text
      : '';

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to extract JSON from Claude response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      lifelogId,
      title,
      timestamp,
      intents: parsed.intents || [],
      keyTopics: parsed.keyTopics || [],
      emotionalTone: parsed.emotionalTone || 'neutral',
      actionableInsights: parsed.actionableInsights || []
    };
  } catch (error) {
    console.error("Error parsing lifelog for intent:", error);
    throw error;
  }
}

/**
 * Store extracted intents in the database
 */
export async function storeExtractedIntents(parsed: ParsedLifelogIntent): Promise<void> {
  for (const intent of parsed.intents) {
    // Only store high-confidence intents to avoid noise
    if (intent.confidence < 0.5) {
      continue;
    }

    // Categorize and store based on type
    if (intent.category === 'goal' || intent.category === 'concern' || intent.category === 'question') {
      await db.insert(userIntents).values({
        type: intent.category,
        description: intent.description,
        confidence: intent.confidence.toString(),
        context: intent.context,
        source: 'lifelog',
        sourceId: parsed.lifelogId,
        relatedEntities: JSON.stringify(intent.relatedEntities),
        timeframe: intent.timeframe,
        priority: intent.priority || 'medium',
        status: 'active',
        extractedAt: new Date().toISOString()
      });
    } else if (intent.category === 'preference' || intent.category === 'dislike') {
      await db.insert(userPreferences).values({
        category: inferPreferenceCategory(intent.description),
        preference: intent.description,
        strength: intent.category === 'dislike' ? 'strong_dislike' : 'prefer',
        confidence: intent.confidence.toString(),
        context: intent.context,
        source: 'lifelog',
        sourceId: parsed.lifelogId,
        learnedAt: new Date().toISOString()
      });
    } else if (intent.category === 'commitment') {
      await db.insert(userCommitments).values({
        commitment: intent.description,
        confidence: intent.confidence.toString(),
        context: intent.context,
        source: 'lifelog',
        sourceId: parsed.lifelogId,
        relatedEntities: JSON.stringify(intent.relatedEntities),
        dueDate: parseTimeframeToDate(intent.timeframe),
        priority: intent.priority || 'medium',
        status: 'active',
        extractedAt: new Date().toISOString()
      });
    }
  }
}

/**
 * Infer preference category from description
 */
function inferPreferenceCategory(description: string): string {
  const lower = description.toLowerCase();

  if (lower.includes('food') || lower.includes('restaurant') || lower.includes('eat')) {
    return 'food';
  } else if (lower.includes('work') || lower.includes('meeting') || lower.includes('schedule')) {
    return 'work_style';
  } else if (lower.includes('communicate') || lower.includes('message') || lower.includes('call')) {
    return 'communication';
  } else if (lower.includes('time') || lower.includes('when') || lower.includes('schedule')) {
    return 'timing';
  } else if (lower.includes('place') || lower.includes('location') || lower.includes('where')) {
    return 'location';
  }

  return 'general';
}

/**
 * Parse natural language timeframe to approximate date
 */
function parseTimeframeToDate(timeframe?: string): string | undefined {
  if (!timeframe) return undefined;

  const lower = timeframe.toLowerCase();
  const now = new Date();

  if (lower.includes('today')) {
    return now.toISOString();
  } else if (lower.includes('tomorrow')) {
    now.setDate(now.getDate() + 1);
    return now.toISOString();
  } else if (lower.includes('this week')) {
    now.setDate(now.getDate() + 7);
    return now.toISOString();
  } else if (lower.includes('next week')) {
    now.setDate(now.getDate() + 14);
    return now.toISOString();
  } else if (lower.includes('month')) {
    now.setMonth(now.getMonth() + 1);
    return now.toISOString();
  }

  return undefined;
}

/**
 * Get active user intents for context
 */
export async function getActiveUserIntents(limit: number = 10): Promise<any[]> {
  return await db
    .select()
    .from(userIntents)
    .where(eq(userIntents.status, 'active'))
    .orderBy(desc(userIntents.extractedAt))
    .limit(limit);
}

/**
 * Get user preferences by category
 */
export async function getUserPreferences(category?: string): Promise<any[]> {
  if (category) {
    return await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.category, category))
      .orderBy(desc(userPreferences.learnedAt));
  }

  return await db
    .select()
    .from(userPreferences)
    .orderBy(desc(userPreferences.learnedAt));
}

/**
 * Get active user commitments
 */
export async function getActiveCommitments(): Promise<any[]> {
  return await db
    .select()
    .from(userCommitments)
    .where(eq(userCommitments.status, 'active'))
    .orderBy(desc(userCommitments.extractedAt));
}

/**
 * Mark intent as fulfilled
 */
export async function fulfillIntent(intentId: string, outcome: string): Promise<void> {
  await db
    .update(userIntents)
    .set({
      status: 'fulfilled',
      fulfilledAt: new Date().toISOString(),
      outcome
    })
    .where(eq(userIntents.id, intentId));
}

/**
 * Mark commitment as completed
 */
export async function completeCommitment(commitmentId: string, outcome: string): Promise<void> {
  await db
    .update(userCommitments)
    .set({
      status: 'completed',
      completedAt: new Date().toISOString(),
      outcome
    })
    .where(eq(userCommitments.id, commitmentId));
}

import OpenAI from "openai";
import {
  getAllNewsTags,
  getNewsTag,
  createNewsTag,
  updateNewsTag,
  getStoryTags,
  addStoryTag,
  incrementTagFeedback,
  createTagEvolutionRequest,
  getAllTagEvolutionRequests,
  getRecentNewsStories,
  getNewsFeedback,
  getNewsFeedbackStats,
} from "../db";
import type { NewsTag, NewsStory, NewsFeedback, TagEvolutionRequest } from "@shared/schema";

const openai = new OpenAI();

const MIN_FEEDBACK_FOR_WEIGHT_CHANGE = 20;
const WEIGHT_CHANGE_THRESHOLD = 0.3;
const AUTO_APPROVAL_DATA_POINTS = 50;

interface TagSuggestion {
  displayName: string;
  confidence: number;
  reason: string;
  isNew: boolean;
  existingTagId?: string;
}

interface PatternInsight {
  type: "echo_chamber_risk" | "pattern_shift" | "new_interest" | "declining_interest";
  description: string;
  affectedTags: string[];
  dataPoints: number;
  suggestedAction?: string;
}

export async function analyzeStoryForTags(story: NewsStory): Promise<TagSuggestion[]> {
  try {
    const existingTags = await getAllNewsTags();
    const tagContext = existingTags.map(t => `${t.displayName} (weight: ${t.weight})`).join(", ");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a news content analyzer for ZEKE, Nate's AI assistant. Analyze news stories and suggest semantic tags.

Available tags (with weights 0-100): ${tagContext || "None yet - suggest new ones"}

Guidelines:
1. Suggest 2-5 relevant tags per story
2. Match existing tags when appropriate (use exact name)
3. Create new tags only for genuinely new concepts
4. Higher confidence (80-100) for clear matches, lower (60-80) for tangential
5. Consider perspective diversity - flag if story challenges common views
6. Be conservative - better to use existing tags than create duplicates

Return JSON array: [{ displayName: string, confidence: number (60-100), reason: string, isNew: boolean }]`,
        },
        {
          role: "user",
          content: `Analyze this news story for tags:

Headline: ${story.headline}
Summary: ${story.summary || "No summary"}
Topic: ${story.topic}
Source: ${story.source || "Unknown"}`,
        },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const suggestions = Array.isArray(parsed) ? parsed : parsed.tags || [];

    const result: TagSuggestion[] = [];
    for (const s of suggestions) {
      const existing = existingTags.find(
        t => t.displayName.toLowerCase() === s.displayName?.toLowerCase() ||
             t.name === s.displayName?.toLowerCase().replace(/\s+/g, "-")
      );
      result.push({
        displayName: s.displayName,
        confidence: s.confidence || 80,
        reason: s.reason || "",
        isNew: !existing,
        existingTagId: existing?.id,
      });
    }

    return result;
  } catch (error) {
    console.error("[NewsTaggingAgent] Error analyzing story:", error);
    return [];
  }
}

export async function applyTagsToStory(storyId: string, suggestions: TagSuggestion[]): Promise<void> {
  for (const suggestion of suggestions) {
    try {
      let tagId = suggestion.existingTagId;

      if (suggestion.isNew) {
        const newTag = await createNewsTag({
          displayName: suggestion.displayName,
          weight: 50,
          isSystemTag: false,
        });
        tagId = newTag.id;
        console.log(`[NewsTaggingAgent] Created new tag: ${suggestion.displayName}`);
      }

      if (tagId) {
        await addStoryTag(storyId, tagId, suggestion.confidence, "agent");
        console.log(`[NewsTaggingAgent] Applied tag ${suggestion.displayName} to story ${storyId}`);
      }
    } catch (error) {
      console.error(`[NewsTaggingAgent] Error applying tag ${suggestion.displayName}:`, error);
    }
  }
}

export async function processFeedbackForTagEvolution(
  storyId: string,
  feedbackType: "thumbs_up" | "thumbs_down"
): Promise<void> {
  try {
    const storyTags = await getStoryTags(storyId);
    const isPositive = feedbackType === "thumbs_up";

    for (const { storyTag, tag } of storyTags) {
      if (tag) {
        await incrementTagFeedback(tag.id, isPositive);
      }
    }

    console.log(`[NewsTaggingAgent] Updated feedback for ${storyTags.length} tags on story ${storyId}`);
  } catch (error) {
    console.error("[NewsTaggingAgent] Error processing feedback:", error);
  }
}

export async function analyzeTagPatterns(): Promise<PatternInsight[]> {
  const insights: PatternInsight[] = [];
  const tags = await getAllNewsTags();

  for (const tag of tags) {
    const totalFeedback = tag.positiveCount + tag.negativeCount;
    if (totalFeedback < MIN_FEEDBACK_FOR_WEIGHT_CHANGE) continue;

    const positiveRatio = tag.positiveCount / totalFeedback;
    const impliedWeight = Math.round(positiveRatio * 100);
    const weightDiff = Math.abs(impliedWeight - tag.weight);

    if (weightDiff >= WEIGHT_CHANGE_THRESHOLD * 100) {
      const type = impliedWeight > tag.weight ? "new_interest" : "declining_interest";
      insights.push({
        type,
        description: `Tag "${tag.displayName}" has ${positiveRatio > 0.5 ? "positive" : "negative"} feedback trend (${Math.round(positiveRatio * 100)}% positive)`,
        affectedTags: [tag.displayName],
        dataPoints: totalFeedback,
        suggestedAction: `Consider ${impliedWeight > tag.weight ? "increasing" : "decreasing"} weight from ${tag.weight} to ${impliedWeight}`,
      });
    }
  }

  const highWeightTags = tags.filter(t => t.weight > 70);
  if (highWeightTags.length > 3) {
    const topicDiversity = new Set(highWeightTags.map(t => t.displayName.split(" ")[0])).size;
    if (topicDiversity < highWeightTags.length / 2) {
      insights.push({
        type: "echo_chamber_risk",
        description: `${highWeightTags.length} tags with high weight may be limiting perspective diversity`,
        affectedTags: highWeightTags.map(t => t.displayName),
        dataPoints: highWeightTags.reduce((sum, t) => sum + t.usageCount, 0),
        suggestedAction: "Consider boosting challenge perspective topics or diversifying interests",
      });
    }
  }

  return insights;
}

export async function proposeWeightEvolution(): Promise<TagEvolutionRequest[]> {
  const created: TagEvolutionRequest[] = [];
  const tags = await getAllNewsTags();
  const pendingRequests = await getAllTagEvolutionRequests("pending");
  const pendingTagIds = new Set(pendingRequests.map(r => r.tagId));

  for (const tag of tags) {
    if (pendingTagIds.has(tag.id)) continue;
    if (tag.isSystemTag) continue;

    const totalFeedback = tag.positiveCount + tag.negativeCount;
    if (totalFeedback < MIN_FEEDBACK_FOR_WEIGHT_CHANGE) continue;

    const positiveRatio = tag.positiveCount / totalFeedback;
    const impliedWeight = Math.round(positiveRatio * 100);
    const weightDiff = Math.abs(impliedWeight - tag.weight);

    if (weightDiff >= WEIGHT_CHANGE_THRESHOLD * 100) {
      const isIncreasing = impliedWeight > tag.weight;
      const hasStrongSignal = isIncreasing ? positiveRatio >= 0.7 : positiveRatio <= 0.3;
      const shouldAutoApply = totalFeedback >= AUTO_APPROVAL_DATA_POINTS && hasStrongSignal;
      
      const request = await createTagEvolutionRequest({
        tagId: tag.id,
        requestType: "update_weight",
        proposedChange: JSON.stringify({
          oldWeight: tag.weight,
          newWeight: impliedWeight,
          direction: isIncreasing ? "increase" : "decrease",
          signalStrength: hasStrongSignal ? "strong" : "moderate",
        }),
        reasoning: `Based on ${totalFeedback} feedback data points: ${Math.round(positiveRatio * 100)}% positive. Current weight ${tag.weight} → suggested ${impliedWeight}. Signal: ${hasStrongSignal ? "strong" : "moderate"}.`,
        dataPointsCount: totalFeedback,
        status: shouldAutoApply ? "approved" : "pending",
      });

      if (shouldAutoApply) {
        await updateNewsTag(tag.id, { weight: impliedWeight });
        console.log(`[NewsTaggingAgent] Auto-applied weight change for ${tag.displayName}: ${tag.weight} → ${impliedWeight} (strong ${isIncreasing ? "positive" : "negative"} signal)`);
      } else if (totalFeedback >= AUTO_APPROVAL_DATA_POINTS) {
        console.log(`[NewsTaggingAgent] Weight change for ${tag.displayName} requires manual approval (moderate signal)`);
      }

      created.push(request);
    }
  }

  return created;
}

export async function generatePatternAlertMessage(): Promise<string | null> {
  const insights = await analyzeTagPatterns();
  const criticalInsights = insights.filter(
    i => i.type === "echo_chamber_risk" || i.dataPoints >= 30
  );

  if (criticalInsights.length === 0) return null;

  const pendingRequests = await getAllTagEvolutionRequests("pending");
  
  let message = "ZEKE News Patterns Update:\n\n";
  
  for (const insight of criticalInsights) {
    message += `${insight.type === "echo_chamber_risk" ? "Warning" : "Notice"}: ${insight.description}\n`;
    if (insight.suggestedAction) {
      message += `Suggestion: ${insight.suggestedAction}\n`;
    }
    message += "\n";
  }

  if (pendingRequests.length > 0) {
    message += `\n${pendingRequests.length} tag weight changes pending your approval. Check the News page to review.`;
  }

  return message;
}

export async function autoTagRecentStories(limit: number = 10): Promise<number> {
  const stories = await getRecentNewsStories(limit);
  let taggedCount = 0;

  for (const story of stories) {
    const existingTags = await getStoryTags(story.id);
    if (existingTags.length > 0) continue;

    const suggestions = await analyzeStoryForTags(story);
    if (suggestions.length > 0) {
      await applyTagsToStory(story.id, suggestions);
      taggedCount++;
    }
  }

  console.log(`[NewsTaggingAgent] Auto-tagged ${taggedCount} stories`);
  return taggedCount;
}

/**
 * Feedback Learning Loop System
 * 
 * This module implements a closed-loop learning system that allows ZEKE to
 * learn from corrections, action outcomes, and user behavior patterns.
 * 
 * Key Components:
 * 1. Action Outcome Tracking - Monitor what happens after ZEKE takes actions
 * 2. Correction Detection - Detect when user corrects ZEKE's actions
 * 3. Preference Learning - Extract and store learned preferences with confidence
 * 4. Preference Application - Query preferences to guide future decisions
 */

import OpenAI from "openai";
import {
  createActionOutcome,
  getActionOutcomeByActionId,
  updateActionOutcome,
  createCorrectionEvent,
  getRecentCorrectionEvents,
  createLearnedPreference,
  getLearnedPreferenceByKey,
  getActiveLearnedPreferences,
  getHighConfidencePreferences,
  reinforceLearnedPreference,
  supersedPreference,
  getFeedbackLearningStats,
} from "./db";
import type {
  FeedbackActionType,
  ActionOutcomeType,
  CorrectionType,
  LearnedPreferenceCategory,
  CorrectionDetection,
  LearnedPreference,
  FeedbackLearningStats,
} from "@shared/schema";
import { log } from "./logger";

const openai = new OpenAI();

// Correction pattern keywords for quick detection
const CORRECTION_PATTERNS = {
  explicit: [
    "no, i meant",
    "no i meant",
    "actually,",
    "actually ",
    "that's wrong",
    "thats wrong",
    "not what i asked",
    "i said",
    "what i meant was",
    "i didn't mean",
    "i didnt mean",
    "wrong",
    "incorrect",
    "that's not right",
    "thats not right",
  ],
  implicit: [
    "let me clarify",
    "to clarify",
    "what i want is",
    "instead,",
    "rather,",
    "i'd prefer",
    "id prefer",
  ],
  modification: [
    "change that to",
    "change it to",
    "update that to",
    "make it",
    "set it to",
    "should be",
  ],
  retry: [
    "try again",
    "do that again",
    "one more time",
    "let's try",
    "lets try",
  ],
};

/**
 * Track an action that ZEKE has taken for outcome monitoring
 */
export function trackAction(
  actionType: FeedbackActionType,
  actionId: string,
  originalValue: string,
  conversationId?: string,
  messageId?: string
): void {
  try {
    createActionOutcome({
      actionType,
      actionId,
      conversationId: conversationId || null,
      messageId: messageId || null,
      originalValue,
    });
    log(`[FeedbackLearning] Tracking action: ${actionType} - ${actionId}`, "feedback");
  } catch (error) {
    log(`[FeedbackLearning] Error tracking action: ${error}`, "feedback");
  }
}

/**
 * Record the outcome of a tracked action
 */
export function recordActionOutcome(
  actionId: string,
  outcomeType: ActionOutcomeType,
  modifiedValue?: string
): void {
  try {
    const existing = getActionOutcomeByActionId(actionId);
    if (existing) {
      updateActionOutcome(existing.id, outcomeType, modifiedValue);
      log(`[FeedbackLearning] Recorded outcome: ${actionId} -> ${outcomeType}`, "feedback");
      
      // If modified/deleted quickly, this might indicate a preference to learn
      if (existing.wasModifiedQuickly || existing.wasDeletedQuickly) {
        analyzeQuickModification(existing.actionType, existing.originalValue, modifiedValue);
      }
    }
  } catch (error) {
    log(`[FeedbackLearning] Error recording outcome: ${error}`, "feedback");
  }
}

/**
 * Quick pattern-based correction detection (no AI call)
 */
export function detectCorrectionQuick(message: string): CorrectionDetection {
  const lowerMessage = message.toLowerCase().trim();
  
  for (const [type, patterns] of Object.entries(CORRECTION_PATTERNS)) {
    for (const pattern of patterns) {
      if (lowerMessage.includes(pattern)) {
        return {
          isCorrection: true,
          correctionType: type as CorrectionType,
          pattern,
          confidence: 0.7,
        };
      }
    }
  }
  
  return {
    isCorrection: false,
    correctionType: "implicit",
    pattern: "",
    confidence: 0,
  };
}

/**
 * AI-powered correction detection with lesson extraction
 */
export async function detectCorrectionAI(
  userMessage: string,
  previousAssistantMessage: string,
  conversationContext?: string
): Promise<CorrectionDetection & { extractedLesson?: string }> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `You are analyzing a conversation to detect if the user is correcting an AI assistant's previous action or response.

Analyze the messages and determine:
1. Is this a correction? (true/false)
2. What type of correction? (explicit, implicit, modification, deletion, retry)
3. What was wrong in the original response?
4. What does the user actually want?
5. What lesson can be learned for future interactions?

Respond in JSON format:
{
  "isCorrection": boolean,
  "correctionType": "explicit" | "implicit" | "modification" | "deletion" | "retry",
  "confidence": number (0-1),
  "originalValue": string or null,
  "correctedValue": string or null,
  "extractedLesson": string or null,
  "domain": string or null (e.g., "timing", "communication", "task_defaults", "calendar_defaults", "disambiguation")
}`
        },
        {
          role: "user",
          content: `Previous assistant message: "${previousAssistantMessage}"

Current user message: "${userMessage}"

${conversationContext ? `Additional context: ${conversationContext}` : ""}`
        }
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0]?.message?.content || "{}");
    
    return {
      isCorrection: result.isCorrection || false,
      correctionType: result.correctionType || "implicit",
      pattern: "ai_detected",
      confidence: result.confidence || 0.5,
      originalValue: result.originalValue,
      correctedValue: result.correctedValue,
      extractedLesson: result.extractedLesson,
    };
  } catch (error) {
    log(`[FeedbackLearning] AI correction detection error: ${error}`, "feedback");
    return detectCorrectionQuick(userMessage);
  }
}

/**
 * Process a detected correction and store it
 */
export async function processCorrectionEvent(
  conversationId: string,
  userMessage: string,
  previousAssistantMessage: string,
  triggerMessageId?: string,
  correctionMessageId?: string
): Promise<void> {
  try {
    // First do quick detection
    const quickDetection = detectCorrectionQuick(userMessage);
    
    if (!quickDetection.isCorrection) {
      // No obvious correction pattern
      return;
    }

    // Get AI analysis for deeper understanding
    const aiDetection = await detectCorrectionAI(userMessage, previousAssistantMessage);
    
    if (!aiDetection.isCorrection) {
      return;
    }

    // Store the correction event
    const correctionEvent = createCorrectionEvent({
      conversationId,
      triggerMessageId: triggerMessageId || null,
      correctionMessageId: correctionMessageId || null,
      correctionType: aiDetection.correctionType,
      originalIntent: null,
      originalValue: aiDetection.originalValue || null,
      correctedValue: aiDetection.correctedValue || null,
      correctionPattern: aiDetection.pattern,
      domain: null,
      extractedLesson: aiDetection.extractedLesson || null,
    });

    log(`[FeedbackLearning] Stored correction event: ${correctionEvent.id}`, "feedback");

    // Try to learn a preference from this correction
    if (aiDetection.extractedLesson) {
      await learnFromCorrection(correctionEvent.id, aiDetection);
    }
  } catch (error) {
    log(`[FeedbackLearning] Error processing correction: ${error}`, "feedback");
  }
}

/**
 * Learn a preference from a correction
 */
async function learnFromCorrection(
  correctionId: string,
  detection: CorrectionDetection & { extractedLesson?: string }
): Promise<void> {
  if (!detection.extractedLesson || !detection.originalValue || !detection.correctedValue) {
    return;
  }

  try {
    // Use AI to categorize and structure the preference
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `You are extracting a learned preference from a correction event.
          
Given the correction details, create a structured preference that can guide future decisions.

Categories:
- timing: Preferences about when to do things (morning vs evening, etc.)
- communication: Preferences about how to communicate (tone, length, etc.)
- task_defaults: Default values for task creation (priority, category, etc.)
- calendar_defaults: Default values for calendar events (duration, reminders, etc.)
- disambiguation: Preferences for resolving ambiguous references (which Bob, which project, etc.)
- formatting: Preferences about how to format responses
- priority: Preferences about priority ordering
- workflow: Preferences about how to approach tasks

Respond in JSON:
{
  "category": string,
  "preferenceKey": string (short identifier like "default_reminder_time" or "preferred_contact_bob"),
  "preferenceValue": string,
  "description": string (human readable explanation),
  "confidence": number (0-1, start low for first evidence)
}`
        },
        {
          role: "user",
          content: `Correction details:
- Original value: "${detection.originalValue}"
- Corrected value: "${detection.correctedValue}"
- Lesson: "${detection.extractedLesson}"`
        }
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0]?.message?.content || "{}");
    
    if (!result.category || !result.preferenceKey || !result.preferenceValue) {
      return;
    }

    // Check if this preference already exists
    const existing = getLearnedPreferenceByKey(
      result.category as LearnedPreferenceCategory,
      result.preferenceKey
    );

    if (existing) {
      // Reinforce existing preference
      if (existing.preferenceValue === result.preferenceValue) {
        reinforceLearnedPreference(existing.id, correctionId);
        log(`[FeedbackLearning] Reinforced preference: ${existing.preferenceKey}`, "feedback");
      } else {
        // Value changed - create new preference and supersede old one
        const newPref = createLearnedPreference({
          category: result.category as LearnedPreferenceCategory,
          preferenceKey: result.preferenceKey,
          preferenceValue: result.preferenceValue,
          description: result.description,
          confidenceScore: result.confidence?.toString() || "0.5",
          sourceType: "correction",
          sourceIds: JSON.stringify([correctionId]),
        });
        supersedPreference(existing.id, newPref.id);
        log(`[FeedbackLearning] Superseded preference: ${existing.preferenceKey}`, "feedback");
      }
    } else {
      // Create new preference
      createLearnedPreference({
        category: result.category as LearnedPreferenceCategory,
        preferenceKey: result.preferenceKey,
        preferenceValue: result.preferenceValue,
        description: result.description,
        confidenceScore: result.confidence?.toString() || "0.5",
        sourceType: "correction",
        sourceIds: JSON.stringify([correctionId]),
      });
      log(`[FeedbackLearning] Created new preference: ${result.preferenceKey}`, "feedback");
    }
  } catch (error) {
    log(`[FeedbackLearning] Error learning from correction: ${error}`, "feedback");
  }
}

/**
 * Analyze a quick modification to potentially learn a preference
 */
async function analyzeQuickModification(
  actionType: FeedbackActionType,
  originalValue: string | null,
  modifiedValue: string | undefined
): Promise<void> {
  if (!originalValue || !modifiedValue) {
    return;
  }

  try {
    // Use AI to detect patterns
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `Analyze this quick modification pattern. The user modified something ZEKE created almost immediately after creation, suggesting ZEKE got something wrong.

Determine if there's a learnable preference here.

Respond in JSON:
{
  "hasLearnablePattern": boolean,
  "category": string or null,
  "preferenceKey": string or null,
  "preferenceValue": string or null,
  "description": string or null
}`
        },
        {
          role: "user",
          content: `Action type: ${actionType}
Original: ${originalValue}
Modified to: ${modifiedValue}`
        }
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0]?.message?.content || "{}");
    
    if (result.hasLearnablePattern && result.category && result.preferenceKey && result.preferenceValue) {
      const existing = getLearnedPreferenceByKey(
        result.category as LearnedPreferenceCategory,
        result.preferenceKey
      );

      if (existing) {
        reinforceLearnedPreference(existing.id);
      } else {
        createLearnedPreference({
          category: result.category as LearnedPreferenceCategory,
          preferenceKey: result.preferenceKey,
          preferenceValue: result.preferenceValue,
          description: result.description,
          confidenceScore: "0.4",
          sourceType: "outcome",
        });
        log(`[FeedbackLearning] Learned from quick modification: ${result.preferenceKey}`, "feedback");
      }
    }
  } catch (error) {
    log(`[FeedbackLearning] Error analyzing quick modification: ${error}`, "feedback");
  }
}

/**
 * Get learned preferences relevant to a specific context/domain
 */
export function getPreferencesForContext(
  categories?: LearnedPreferenceCategory[],
  minConfidence: number = 0.6
): LearnedPreference[] {
  try {
    const allPreferences = categories
      ? getActiveLearnedPreferences().filter(p => categories.includes(p.category))
      : getActiveLearnedPreferences();

    return allPreferences.filter(p => parseFloat(p.confidenceScore) >= minConfidence);
  } catch (error) {
    log(`[FeedbackLearning] Error getting preferences: ${error}`, "feedback");
    return [];
  }
}

/**
 * Get a specific preference value if it exists and is confident enough
 */
export function getPreferenceValue(
  category: LearnedPreferenceCategory,
  key: string,
  minConfidence: number = 0.6
): string | null {
  try {
    const pref = getLearnedPreferenceByKey(category, key);
    if (pref && parseFloat(pref.confidenceScore) >= minConfidence) {
      return pref.preferenceValue;
    }
    return null;
  } catch (error) {
    log(`[FeedbackLearning] Error getting preference value: ${error}`, "feedback");
    return null;
  }
}

/**
 * Format learned preferences for context injection into agent prompts
 */
export function formatPreferencesForPrompt(
  categories?: LearnedPreferenceCategory[]
): string {
  // Lower threshold to 0.35 so new preferences (starting at 0.4-0.5) are immediately useful
  const preferences = getPreferencesForContext(categories, 0.35);
  
  if (preferences.length === 0) {
    return "";
  }

  const grouped = preferences.reduce((acc, pref) => {
    if (!acc[pref.category]) {
      acc[pref.category] = [];
    }
    acc[pref.category].push(pref);
    return acc;
  }, {} as Record<string, LearnedPreference[]>);

  let prompt = "\n\n## Learned User Preferences\nThe following preferences have been learned from past interactions:\n\n";

  for (const [category, prefs] of Object.entries(grouped)) {
    prompt += `### ${category.replace(/_/g, " ").toUpperCase()}\n`;
    for (const pref of prefs) {
      const confidence = parseFloat(pref.confidenceScore);
      const confidenceLabel = confidence >= 0.8 ? "high" : confidence >= 0.6 ? "medium" : "low";
      prompt += `- ${pref.description || pref.preferenceKey}: ${pref.preferenceValue} (confidence: ${confidenceLabel})\n`;
    }
    prompt += "\n";
  }

  return prompt;
}

/**
 * Get feedback learning statistics
 */
export function getLearningStats(): FeedbackLearningStats {
  return getFeedbackLearningStats();
}

/**
 * Record explicit user feedback (positive/negative)
 */
export function recordExplicitFeedback(
  actionId: string,
  isPositive: boolean
): void {
  try {
    const existing = getActionOutcomeByActionId(actionId);
    if (existing) {
      updateActionOutcome(
        existing.id,
        isPositive ? "confirmed" : "modified"
      );
      log(`[FeedbackLearning] Recorded explicit feedback: ${actionId} -> ${isPositive ? "positive" : "negative"}`, "feedback");
    }
  } catch (error) {
    log(`[FeedbackLearning] Error recording feedback: ${error}`, "feedback");
  }
}

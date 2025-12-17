/**
 * Implicit Feedback Detection
 * 
 * Detects when user repeats a similar request within 10 minutes,
 * automatically creating a -1 feedback event (suggesting prior response didn't satisfy)
 */

import { getRecentMessages, createFeedbackEvent, getOutboundMessageByConversationId } from "../db";
import type { InsertFeedbackEvent } from "@shared/schema";

interface RecentUserMessage {
  conversationId: string;
  content: string;
  createdAt: Date;
  assistantResponseId?: string;
}

// Rolling window of recent messages per phone (kept in memory, short-lived)
const recentUserMessagesByPhone: Map<string, RecentUserMessage[]> = new Map();

const MAX_WINDOW_SIZE = 10; // Keep last 10 messages
const TIME_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const SIMILARITY_THRESHOLD = 0.65; // 65% overlap to consider "repeat"

/**
 * Normalize text for comparison (lowercase, remove punctuation, extra spaces)
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .join(" ");
}

/**
 * Calculate simple token overlap similarity (0-1)
 */
function calculateSimilarity(text1: string, text2: string): number {
  const norm1 = normalizeText(text1);
  const norm2 = normalizeText(text2);

  if (norm1 === norm2) return 1; // Exact match

  const tokens1 = new Set(norm1.split(" "));
  const tokens2 = new Set(norm2.split(" "));

  let intersection = 0;
  for (const token of tokens1) {
    if (tokens2.has(token)) {
      intersection++;
    }
  }

  const union = tokens1.size + tokens2.size - intersection;
  return union > 0 ? intersection / union : 0; // Jaccard similarity
}

/**
 * Track a user message in the rolling window
 */
export function trackUserMessage(
  phoneNumber: string,
  conversationId: string,
  messageContent: string,
  assistantResponseId?: string
): void {
  if (!recentUserMessagesByPhone.has(phoneNumber)) {
    recentUserMessagesByPhone.set(phoneNumber, []);
  }

  const window = recentUserMessagesByPhone.get(phoneNumber)!;
  window.push({
    conversationId,
    content: messageContent,
    createdAt: new Date(),
    assistantResponseId,
  });

  // Keep only recent messages
  if (window.length > MAX_WINDOW_SIZE) {
    window.shift();
  }
}

/**
 * Detect if user is repeating a request (implicit negative feedback)
 * Returns true if repeat detected, false otherwise
 */
export function isRepeatedRequest(
  phoneNumber: string,
  currentMessage: string,
  currentTime: Date = new Date()
): boolean {
  const window = recentUserMessagesByPhone.get(phoneNumber);
  if (!window || window.length === 0) {
    return false;
  }

  // Check against messages in the time window
  for (const recent of window) {
    const timeDiff = currentTime.getTime() - recent.createdAt.getTime();

    // Only consider messages within the time window
    if (timeDiff <= TIME_WINDOW_MS) {
      const similarity = calculateSimilarity(currentMessage, recent.content);
      if (similarity >= SIMILARITY_THRESHOLD) {
        console.log(
          `[ImplicitFeedback] Detected repeat request (${(similarity * 100).toFixed(1)}% similar)`
        );
        return true;
      }
    }
  }

  return false;
}

/**
 * Get the most recent assistant message ID for a conversation
 */
function getMostRecentAssistantMessageId(conversationId: string): string | undefined {
  try {
    const messages = getRecentMessages(conversationId, 5);
    for (const msg of messages) {
      if (msg.role === "assistant") {
        return msg.id;
      }
    }
  } catch (error) {
    console.error("[ImplicitFeedback] Error finding assistant message:", error);
  }
  return undefined;
}

/**
 * Create implicit negative feedback event
 */
export async function createImplicitFeedback(
  conversationId: string,
  phoneNumber: string,
  userMessage: string
): Promise<void> {
  try {
    // Find most recent outbound message to this phone
    const assistantMessageId = getMostRecentAssistantMessageId(conversationId);

    if (assistantMessageId) {
      const feedbackData: InsertFeedbackEvent = {
        conversationId,
        source: "sms",
        feedback: -1,
        reactionType: "implicit_repeat",
        reason: "User repeated request",
        targetOutboundMessageId: assistantMessageId,
        rawBody: userMessage,
      };

      createFeedbackEvent(feedbackData);
      console.log(
        `[ImplicitFeedback] Created implicit negative feedback for ${phoneNumber}: implicit_repeat`
      );
    }
  } catch (error) {
    console.error("[ImplicitFeedback] Error creating implicit feedback:", error);
  }
}

/**
 * Clear old messages from window (call periodically)
 */
export function cleanupOldMessages(): void {
  const now = Date.now();
  for (const [phone, window] of recentUserMessagesByPhone.entries()) {
    const filtered = window.filter((msg) => now - msg.createdAt.getTime() < TIME_WINDOW_MS * 2);
    if (filtered.length === 0) {
      recentUserMessagesByPhone.delete(phone);
    } else {
      recentUserMessagesByPhone.set(phone, filtered);
    }
  }
}

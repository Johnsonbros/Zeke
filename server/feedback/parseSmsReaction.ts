import {
  getOutboundMessageByRefCode,
  getRecentOutboundMessages,
} from "../db";
import type { InsertFeedbackEvent } from "@shared/schema";

export interface ParsedReaction {
  isReaction: boolean;
  feedback: 1 | -1 | null;
  reactionType: "liked" | "disliked" | "loved" | "laughed" | "emphasized" | "questioned" | "unknown";
  refCode?: string;
  quotedText?: string;
  reason?: string;
}

// Reaction emoji patterns (using Unicode code points for reliability)
const POSITIVE_EMOJI = /\u{1F44D}|\u2705|\u{1F4AF}/u;
const NEGATIVE_EMOJI = /\u{1F44E}|\u274C/u;

// iMessage/SMS reaction patterns (handles both straight and smart quotes)
const REACTION_PATTERNS = [
  { pattern: /^Liked\s+[""](.+?)[""](?:\s+(.+))?$/i, type: "liked" as const },
  { pattern: /^Loved\s+[""](.+?)[""](?:\s+(.+))?$/i, type: "loved" as const },
  { pattern: /^Disliked\s+[""](.+?)[""](?:\s+(.+))?$/i, type: "disliked" as const },
  { pattern: /^Laughed at\s+[""](.+?)[""](?:\s+(.+))?$/i, type: "laughed" as const },
  { pattern: /^Emphasized\s+[""](.+?)[""](?:\s+(.+))?$/i, type: "emphasized" as const },
  { pattern: /^Questioned\s+[""](.+?)[""](?:\s+(.+))?$/i, type: "questioned" as const },
];

/**
 * Parse SMS message to detect feedback reactions
 * Supports:
 * - Direct emoji: 👍 or 👎
 * - Ref-based: 👍 K7Q2 [reason text]
 * - iMessage reactions: Liked "", Loved "", etc.
 */
export function parseSmsReaction(messageBody: string): ParsedReaction {
  if (!messageBody || messageBody.trim().length === 0) {
    return { isReaction: false, feedback: null, reactionType: "unknown" };
  }

  const body = messageBody.trim();

  // Check for direct emoji (👍 or 👎)
  const hasPositive = POSITIVE_EMOJI.test(body);
  const hasNegative = NEGATIVE_EMOJI.test(body);

  // Try to extract ref code (4 alphanumeric chars like K7Q2)
  const refCodeMatch = body.match(/\b([A-Z0-9]{4})\b/);
  const refCode = refCodeMatch ? refCodeMatch[1] : undefined;

  // Case 1: Emoji with optional ref code
  if (hasPositive || hasNegative) {
    const feedback = hasPositive ? (1 as const) : (-1 as const);
    const reactionType = hasPositive ? "liked" : "disliked";
    
    // Extract reason text (anything after emoji and ref code)
    const reasonMatch = body
      .replace(POSITIVE_EMOJI, "")
      .replace(NEGATIVE_EMOJI, "")
      .replace(/\b[A-Z0-9]{4}\b/, "")
      .trim();
    
    return {
      isReaction: true,
      feedback,
      reactionType,
      refCode,
      reason: reasonMatch.length > 0 ? reasonMatch : undefined,
    };
  }

  // Case 2: iMessage/SMS reaction patterns
  for (const { pattern, type } of REACTION_PATTERNS) {
    const match = body.match(pattern);
    if (match) {
      const quotedText = match[1];
      const reason = match[2];

      // Questioned and Disliked are negative feedback
      const isNegativeFeedback = type === "disliked" || type === "questioned";
      return {
        isReaction: true,
        feedback: isNegativeFeedback ? (-1 as const) : (1 as const),
        reactionType: type,
        quotedText,
        reason: reason?.trim(),
      };
    }
  }

  // Not a reaction
  return { isReaction: false, feedback: null, reactionType: "unknown" };
}

/**
 * Link a parsed reaction to an outbound message
 * Returns the outbound message ID and any additional context
 */
export async function linkReactionToOutboundMessage(
  reaction: ParsedReaction,
  toPhone: string
): Promise<{
  outboundMessageId?: string;
  refCode?: string;
  quotedText?: string;
}> {
  // Case 1: Ref code directly specified
  if (reaction.refCode) {
    const outboundMsg = getOutboundMessageByRefCode(reaction.refCode);
    if (outboundMsg) {
      return {
        outboundMessageId: outboundMsg.id,
        refCode: reaction.refCode,
      };
    }
  }

  // Case 2: Quoted text - search recent messages for match
  if (reaction.quotedText) {
    const recentMessages = getRecentOutboundMessages(toPhone, 1440); // Last 24 hours

    // Try exact match first (strip ref code from body)
    for (const msg of recentMessages) {
      const msgBodyWithoutRef = msg.body.replace(/\s*\(ref:\s*[A-Z0-9]{4}\)$/i, "");
      if (msgBodyWithoutRef === reaction.quotedText) {
        return {
          outboundMessageId: msg.id,
          refCode: msg.refCode,
          quotedText: reaction.quotedText,
        };
      }
    }

    // Fallback: fuzzy contains match
    for (const msg of recentMessages) {
      if (msg.body.includes(reaction.quotedText)) {
        return {
          outboundMessageId: msg.id,
          refCode: msg.refCode,
          quotedText: reaction.quotedText,
        };
      }
    }
  }

  // Case 3: Just emoji - use most recent message (within 10 minutes)
  if (reaction.feedback !== null && !reaction.refCode && !reaction.quotedText) {
    const recentMessages = getRecentOutboundMessages(toPhone, 10);
    if (recentMessages.length > 0) {
      const mostRecent = recentMessages[0];
      return {
        outboundMessageId: mostRecent.id,
        refCode: mostRecent.refCode,
      };
    }
  }

  // No match found
  return {};
}

/**
 * Build a feedback event from parsed reaction
 */
export async function buildFeedbackEvent(
  reaction: ParsedReaction,
  conversationId: string,
  toPhone: string,
  inboundMessageSid?: string,
  rawBody?: string
): Promise<InsertFeedbackEvent | null> {
  if (!reaction.isReaction) {
    return null;
  }

  const linkedMsg = await linkReactionToOutboundMessage(reaction, toPhone);

  return {
    conversationId,
    source: "sms",
    feedback: reaction.feedback as 1 | -1,
    reactionType: reaction.reactionType,
    inboundMessageSid: inboundMessageSid,
    targetOutboundMessageId: linkedMsg.outboundMessageId,
    targetRefCode: linkedMsg.refCode,
    quotedText: reaction.quotedText,
    rawBody: rawBody || "",
    reason: reaction.reason,
  };
}

/**
 * Generate a short Twilio TwiML response for feedback
 */
export function generateFeedbackTwimlResponse(reaction: ParsedReaction): string {
  if (!reaction.isReaction) {
    return "";
  }

  const responses: Record<string, string> = {
    liked: "Got it 👍",
    disliked: "Thanks for the feedback — I'll adjust.",
    loved: "Awesome 💯",
    laughed: "Glad I made you laugh 😄",
    emphasized: "Message heard! 📌",
    questioned: "Good point — I'll reconsider.",
  };

  return responses[reaction.reactionType] || "Got it 👍";
}

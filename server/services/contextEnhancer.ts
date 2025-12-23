import { semanticSearch } from "../semanticMemory";
import { getContact, getContactFullName, getAllMemoryNotes, getSavedPlace } from "../db";
import { FaceMatch } from "./faceRecognitionService";
import type { MemoryNote, Contact } from "@shared/schema";

interface EnhancedContext {
  relatedMemories: string[];
  peopleContext: string[];
  locationContext: string[];
}

export async function enhanceContextWithRelatedInfo(
  matchedFaces?: FaceMatch[],
  locationName?: string,
  setting?: string
): Promise<EnhancedContext> {
  const result: EnhancedContext = {
    relatedMemories: [],
    peopleContext: [],
    locationContext: [],
  };

  try {
    if (matchedFaces && matchedFaces.length > 0) {
      const contactIds = [...new Set(matchedFaces.map(f => f.contactId))];

      for (const contactId of contactIds) {
        const contact = getContact(contactId);
        if (contact) {
          const fullName = getContactFullName(contact);

          const contactMemories = getAllMemoryNotes()
            .filter(m => !m.isSuperseded && m.contactId === contactId)
            .slice(0, 3);

          if (contactMemories.length > 0) {
            result.peopleContext.push(`${fullName}: ${contactMemories.map(m => m.content).join("; ")}`);
          }

          const searchResults = await semanticSearch(fullName, { limit: 3, minScore: 0.5 });
          for (const sr of searchResults) {
            if (!result.relatedMemories.includes(sr.item.content)) {
              result.relatedMemories.push(sr.item.content);
            }
          }
        }
      }
    }

    if (locationName || setting) {
      const locationQuery = locationName || setting || "";
      if (locationQuery.length > 3) {
        const locationMemories = await semanticSearch(locationQuery, { limit: 3, minScore: 0.4 });
        for (const lm of locationMemories) {
          if (!result.relatedMemories.includes(lm.item.content)) {
            result.locationContext.push(lm.item.content);
          }
        }
      }
    }
  } catch (error: any) {
    console.warn(`[ContextEnhancer] Error enhancing context: ${error.message}`);
  }

  return result;
}

export function formatEnhancedContextForAI(enhanced: EnhancedContext): string {
  const parts: string[] = [];

  if (enhanced.peopleContext.length > 0) {
    parts.push("RELEVANT CONTEXT ABOUT PEOPLE IN PHOTO:");
    enhanced.peopleContext.forEach(p => parts.push(`- ${p}`));
  }

  if (enhanced.locationContext.length > 0) {
    parts.push("RELEVANT LOCATION MEMORIES:");
    enhanced.locationContext.forEach(l => parts.push(`- ${l}`));
  }

  if (enhanced.relatedMemories.length > 0 && enhanced.relatedMemories.length <= 5) {
    parts.push("RELATED MEMORIES:");
    enhanced.relatedMemories.forEach(m => parts.push(`- ${m}`));
  }

  return parts.length > 0 ? "\n" + parts.join("\n") : "";
}

export interface RelevanceScore {
  score: number;
  reason: string;
}

export function scoreMessageRelevance(
  messageContent: string,
  currentQuery: string,
  matchedNames: string[],
  recencyDays: number
): RelevanceScore {
  let score = 0;
  const reasons: string[] = [];

  const lowerContent = messageContent.toLowerCase();
  const lowerQuery = currentQuery.toLowerCase();

  for (const name of matchedNames) {
    if (lowerContent.includes(name.toLowerCase())) {
      score += 3;
      reasons.push(`mentions ${name}`);
    }
  }

  const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 3);
  let wordMatches = 0;
  for (const word of queryWords) {
    if (lowerContent.includes(word)) {
      wordMatches++;
    }
  }
  if (wordMatches > 0) {
    score += Math.min(wordMatches, 3);
    reasons.push(`${wordMatches} keyword matches`);
  }

  if (recencyDays <= 1) {
    score += 2;
    reasons.push("very recent");
  } else if (recencyDays <= 7) {
    score += 1;
    reasons.push("recent");
  } else if (recencyDays > 30) {
    score -= 1;
    reasons.push("old");
  }

  return {
    score: Math.max(0, score),
    reason: reasons.join(", ") || "no specific relevance",
  };
}

export function selectRelevantMessages<T extends { content: string; createdAt: string }>(
  messages: T[],
  currentQuery: string,
  matchedNames: string[],
  maxMessages: number = 15
): T[] {
  // Handle null/undefined messages
  if (!messages || !Array.isArray(messages)) {
    return [];
  }
  
  const now = Date.now();

  const scored = messages.map(msg => {
    const createdAt = new Date(msg.createdAt).getTime();
    const recencyDays = (now - createdAt) / (1000 * 60 * 60 * 24);
    const relevance = scoreMessageRelevance(msg.content, currentQuery, matchedNames, recencyDays);

    return {
      message: msg,
      score: relevance.score,
      recencyDays,
    };
  });

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.recencyDays - b.recencyDays;
  });

  const selected = scored.slice(0, maxMessages).map(s => s.message);

  selected.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return selected;
}

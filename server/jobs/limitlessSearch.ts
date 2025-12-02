/**
 * Limitless Conversation Search Enhancement
 * 
 * Provides natural language search over lifelog data.
 * Features:
 * - Semantic search across conversation transcripts
 * - Time-based filtering
 * - Speaker filtering
 * - Topic matching
 * - Relevance ranking
 */

import OpenAI from "openai";
import type { Lifelog, ContentNode } from "../limitless";

let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured");
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

export interface SearchResult {
  lifelogId: string;
  title: string;
  startTime: string;
  endTime: string;
  relevanceScore: number;
  matchedSnippet: string;
  speakers: string[];
}

export interface ParsedQuery {
  keywords: string[];
  speakers: string[];
  dateRange?: { start?: string; end?: string };
  topics: string[];
  isQuestion: boolean;
  originalQuery: string;
}

/**
 * Parse a natural language query into structured search criteria
 */
export async function parseSearchQuery(query: string): Promise<ParsedQuery> {
  const client = getOpenAIClient();
  
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Parse this search query for a conversation database.

Extract:
- keywords: Important search terms (array of strings)
- speakers: Any mentioned people/names (array of strings)
- dateRange: If mentioned (object with "start" and/or "end" in YYYY-MM-DD format)
- topics: General topics mentioned (array of strings)
- isQuestion: true if this is asking a question about conversations

Examples:
"What did I talk about with John last week?" -> keywords: ["talk"], speakers: ["John"], dateRange: {start: "[7 days ago date]", end: "[today]"}, topics: [], isQuestion: true
"meetings about the project" -> keywords: ["meetings", "project"], speakers: [], dateRange: null, topics: ["project", "work"], isQuestion: false

Return JSON object only.`,
        },
        {
          role: "user",
          content: query,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 300,
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response");
    }
    
    const parsed = JSON.parse(content);
    return {
      keywords: parsed.keywords || [],
      speakers: parsed.speakers || [],
      dateRange: parsed.dateRange,
      topics: parsed.topics || [],
      isQuestion: parsed.isQuestion || false,
      originalQuery: query,
    };
    
  } catch (error) {
    // Fallback to simple keyword extraction
    return {
      keywords: query.toLowerCase().split(/\s+/).filter(w => w.length > 2),
      speakers: [],
      topics: [],
      isQuestion: query.includes("?"),
      originalQuery: query,
    };
  }
}

/**
 * Extract full text and metadata from a lifelog
 */
function extractLifelogContent(lifelog: Lifelog): {
  text: string;
  speakers: string[];
  title: string;
} {
  const textParts: string[] = [];
  const speakers = new Set<string>();
  
  function processNode(node: ContentNode) {
    if (node.speakerName) {
      speakers.add(node.speakerName);
    }
    if (node.content) {
      textParts.push(node.content);
    }
    if (node.children) {
      for (const child of node.children) {
        processNode(child);
      }
    }
  }
  
  for (const content of lifelog.contents || []) {
    processNode(content);
  }
  
  return {
    text: textParts.join(" "),
    speakers: Array.from(speakers),
    title: lifelog.title || "Untitled Conversation",
  };
}

/**
 * Calculate relevance score for a lifelog against parsed query
 */
function calculateRelevance(
  content: { text: string; speakers: string[]; title: string },
  query: ParsedQuery
): { score: number; matchedSnippet: string } {
  let score = 0;
  let matchedSnippet = "";
  const textLower = content.text.toLowerCase();
  const titleLower = content.title.toLowerCase();
  
  // Keyword matches (weighted by position)
  for (const keyword of query.keywords) {
    const keywordLower = keyword.toLowerCase();
    
    // Title match (high weight)
    if (titleLower.includes(keywordLower)) {
      score += 30;
    }
    
    // Content match
    const index = textLower.indexOf(keywordLower);
    if (index !== -1) {
      score += 10;
      
      // Extract snippet around match
      if (!matchedSnippet) {
        const start = Math.max(0, index - 50);
        const end = Math.min(content.text.length, index + keyword.length + 50);
        matchedSnippet = "..." + content.text.substring(start, end) + "...";
      }
    }
  }
  
  // Speaker matches (high weight)
  for (const querySpeaker of query.speakers) {
    const speakerLower = querySpeaker.toLowerCase();
    for (const speaker of content.speakers) {
      if (speaker.toLowerCase().includes(speakerLower)) {
        score += 40;
        break;
      }
    }
  }
  
  // Topic matches
  for (const topic of query.topics) {
    if (textLower.includes(topic.toLowerCase())) {
      score += 5;
    }
  }
  
  // Fallback snippet
  if (!matchedSnippet && content.text.length > 0) {
    matchedSnippet = content.text.substring(0, 100) + "...";
  }
  
  return { score, matchedSnippet };
}

/**
 * Filter lifelogs by date range
 */
function filterByDateRange(
  lifelogs: Lifelog[],
  dateRange?: { start?: string; end?: string }
): Lifelog[] {
  if (!dateRange || (!dateRange.start && !dateRange.end)) {
    return lifelogs;
  }
  
  return lifelogs.filter(lifelog => {
    const date = lifelog.startTime.split("T")[0];
    if (dateRange.start && date < dateRange.start) return false;
    if (dateRange.end && date > dateRange.end) return false;
    return true;
  });
}

/**
 * Search conversations using natural language query
 */
export async function searchConversations(
  lifelogs: Lifelog[],
  query: string,
  limit: number = 10
): Promise<{
  results: SearchResult[];
  parsedQuery: ParsedQuery;
  totalMatches: number;
}> {
  // Parse the query
  const parsedQuery = await parseSearchQuery(query);
  
  // Filter by date range if specified
  const filteredLifelogs = filterByDateRange(lifelogs, parsedQuery.dateRange);
  
  // Score all lifelogs
  const scoredResults: Array<{
    lifelog: Lifelog;
    content: { text: string; speakers: string[]; title: string };
    score: number;
    matchedSnippet: string;
  }> = [];
  
  for (const lifelog of filteredLifelogs) {
    const content = extractLifelogContent(lifelog);
    const { score, matchedSnippet } = calculateRelevance(content, parsedQuery);
    
    if (score > 0) {
      scoredResults.push({ lifelog, content, score, matchedSnippet });
    }
  }
  
  // Sort by relevance
  scoredResults.sort((a, b) => b.score - a.score);
  
  // Take top results
  const topResults = scoredResults.slice(0, limit);
  
  const results: SearchResult[] = topResults.map(r => ({
    lifelogId: r.lifelog.id,
    title: r.content.title,
    startTime: r.lifelog.startTime,
    endTime: r.lifelog.endTime,
    relevanceScore: r.score,
    matchedSnippet: r.matchedSnippet,
    speakers: r.content.speakers,
  }));
  
  return {
    results,
    parsedQuery,
    totalMatches: scoredResults.length,
  };
}

/**
 * Answer a question about conversations using AI
 */
export async function answerConversationQuestion(
  lifelogs: Lifelog[],
  question: string
): Promise<{
  answer: string;
  sourceConversations: string[];
  confidence: "high" | "medium" | "low";
}> {
  // First search for relevant conversations
  const searchResults = await searchConversations(lifelogs, question, 5);
  
  if (searchResults.results.length === 0) {
    return {
      answer: "I couldn't find any relevant conversations to answer that question.",
      sourceConversations: [],
      confidence: "low",
    };
  }
  
  // Build context from top results
  const contextParts: string[] = [];
  const sourceIds: string[] = [];
  
  for (const result of searchResults.results) {
    const lifelog = lifelogs.find(l => l.id === result.lifelogId);
    if (lifelog) {
      const { text, speakers } = extractLifelogContent(lifelog);
      const truncatedText = text.substring(0, 1500); // Limit per conversation
      contextParts.push(`[Conversation: ${result.title}, Speakers: ${speakers.join(", ")}]\n${truncatedText}`);
      sourceIds.push(result.lifelogId);
    }
  }
  
  const client = getOpenAIClient();
  
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant answering questions about conversations the user had.
Answer based ONLY on the conversation excerpts provided. Be direct and specific.
If the answer isn't in the conversations, say so clearly.

Return JSON with:
- answer: Your answer to the question
- confidence: "high" if answer is clearly supported, "medium" if partially, "low" if uncertain`,
        },
        {
          role: "user",
          content: `Question: ${question}\n\nConversation excerpts:\n${contextParts.join("\n\n")}`,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 500,
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response");
    }
    
    const result = JSON.parse(content);
    return {
      answer: result.answer || "I couldn't determine an answer.",
      sourceConversations: sourceIds,
      confidence: result.confidence || "medium",
    };
    
  } catch (error) {
    console.error("[LimitlessSearch] AI answer generation failed:", error);
    return {
      answer: "I had trouble analyzing the conversations. Please try again.",
      sourceConversations: sourceIds,
      confidence: "low",
    };
  }
}

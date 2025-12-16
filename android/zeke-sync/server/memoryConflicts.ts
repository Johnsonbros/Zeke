import OpenAI from "openai";
import { getAllMemoryNotes, parseEmbedding } from "./db";
import { generateEmbedding, cosineSimilarity } from "./embeddings";
import type { MemoryNote } from "@shared/schema";

let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured.");
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

export type ConflictType = "update" | "contradiction" | "none";

export interface ConflictDetectionResult {
  hasConflict: boolean;
  conflictingMemory?: MemoryNote;
  similarity: number;
  conflictType: ConflictType;
  analysis?: string;
}

export interface ConflictAnalysis {
  conflictType: ConflictType;
  reasoning: string;
  suggestedResolution?: "keep_existing" | "replace" | "ask_user";
}

const CONFLICT_SIMILARITY_THRESHOLD = 0.78;
const HIGH_SIMILARITY_THRESHOLD = 0.85;

async function analyzeConflict(
  newContent: string,
  existingContent: string,
  existingType: string
): Promise<ConflictAnalysis> {
  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You analyze whether new information conflicts with existing stored memory.

Types of conflicts:
1. "contradiction" - Direct factual conflict (e.g., "favorite color is blue" vs "favorite color is green", "works at Apple" vs "works at Google")
2. "update" - New information that updates/refines old info (e.g., "lives in Boston" vs "moved to Seattle", "prefers coffee" vs "now prefers tea")
3. "none" - Information is compatible, complementary, or about different things

Consider:
- Same entity with different values = conflict
- Time-sensitive info with newer date = update
- Different aspects of same topic = usually not conflict
- Vague vs specific = could be update
- Preferences can change = often update

Return JSON:
{
  "conflictType": "contradiction" | "update" | "none",
  "reasoning": "brief explanation",
  "suggestedResolution": "keep_existing" | "replace" | "ask_user"
}

Use "ask_user" when:
- Not sure which is correct
- Both could be valid at different times
- Information seems important enough to confirm`
        },
        {
          role: "user",
          content: `Existing memory (type: ${existingType}): "${existingContent}"

New information: "${newContent}"

Analyze if this is a conflict.`
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 200,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { conflictType: "none", reasoning: "Failed to analyze" };
    }

    return JSON.parse(content) as ConflictAnalysis;
  } catch (error) {
    console.error("Error analyzing conflict:", error);
    return { conflictType: "none", reasoning: "Analysis error" };
  }
}

export async function findSimilarMemories(
  content: string,
  options: {
    minSimilarity?: number;
    limit?: number;
    types?: Array<"fact" | "preference" | "note" | "summary">;
  } = {}
): Promise<Array<{ memory: MemoryNote; similarity: number }>> {
  const { 
    minSimilarity = CONFLICT_SIMILARITY_THRESHOLD, 
    limit = 5,
    types 
  } = options;

  try {
    const embedding = await Promise.race([
      generateEmbedding(content),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Embedding timeout")), 5000)
      )
    ]);

    let allNotes = getAllMemoryNotes().filter(n => !n.isSuperseded);
    
    if (types && types.length > 0) {
      allNotes = allNotes.filter(n => types.includes(n.type as any));
    }

    const notesWithEmbeddings = allNotes
      .filter(n => n.embedding !== null)
      .map(n => ({
        memory: n,
        parsedEmbedding: parseEmbedding(n.embedding ?? null),
      }))
      .filter(n => n.parsedEmbedding !== null);

    const scored = notesWithEmbeddings
      .map(({ memory, parsedEmbedding }) => ({
        memory,
        similarity: cosineSimilarity(embedding, parsedEmbedding!),
      }))
      .filter(({ similarity }) => similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return scored;
  } catch (error) {
    console.error("Error finding similar memories:", error);
    return [];
  }
}

export async function detectMemoryConflict(
  newContent: string,
  options: {
    conflictThreshold?: number;
    analyzeConflicts?: boolean;
    types?: Array<"fact" | "preference" | "note" | "summary">;
  } = {}
): Promise<ConflictDetectionResult> {
  const { 
    conflictThreshold = CONFLICT_SIMILARITY_THRESHOLD, 
    analyzeConflicts = true,
    types = ["fact", "preference"]
  } = options;

  try {
    const similarMemories = await findSimilarMemories(newContent, {
      minSimilarity: conflictThreshold,
      limit: 3,
      types,
    });

    if (similarMemories.length === 0) {
      return {
        hasConflict: false,
        similarity: 0,
        conflictType: "none",
      };
    }

    const topMatch = similarMemories[0];
    
    if (topMatch.similarity >= 0.92) {
      return {
        hasConflict: false,
        conflictingMemory: topMatch.memory,
        similarity: topMatch.similarity,
        conflictType: "none",
        analysis: "Likely duplicate - very high similarity",
      };
    }

    if (!analyzeConflicts) {
      const isHighSimilarity = topMatch.similarity >= HIGH_SIMILARITY_THRESHOLD;
      return {
        hasConflict: isHighSimilarity,
        conflictingMemory: topMatch.memory,
        similarity: topMatch.similarity,
        conflictType: isHighSimilarity ? "update" : "none",
        analysis: "Semantic similarity detected - needs analysis",
      };
    }

    const analysis = await analyzeConflict(
      newContent,
      topMatch.memory.content,
      topMatch.memory.type
    );

    const hasConflict = analysis.conflictType !== "none";

    return {
      hasConflict,
      conflictingMemory: hasConflict ? topMatch.memory : undefined,
      similarity: topMatch.similarity,
      conflictType: analysis.conflictType,
      analysis: analysis.reasoning,
    };
  } catch (error) {
    console.error("Error detecting memory conflict:", error);
    return {
      hasConflict: false,
      similarity: 0,
      conflictType: "none",
      analysis: "Error during conflict detection",
    };
  }
}

export function formatConflictQuestion(
  newContent: string,
  existingMemory: MemoryNote,
  conflictType: ConflictType = "update"
): string {
  const typeLabel = existingMemory.type === "preference" ? "preference" : "information";
  
  if (conflictType === "contradiction") {
    return `I have this ${typeLabel} stored: "${existingMemory.content}"\n\nBut you just said: "${newContent}"\n\nThese seem to contradict each other. Which one is correct?`;
  }
  
  if (conflictType === "update") {
    return `I have this ${typeLabel} saved: "${existingMemory.content}"\n\nYou mentioned: "${newContent}"\n\nShould I update my memory with the new information?`;
  }
  
  return `I found a similar memory: "${existingMemory.content}"\n\nYou said: "${newContent}"\n\nIs this new information I should remember, or is it the same thing?`;
}

export function formatConflictSummary(
  result: ConflictDetectionResult
): string | null {
  if (!result.hasConflict || !result.conflictingMemory) {
    return null;
  }

  const similarity = (result.similarity * 100).toFixed(0);
  const typeStr = result.conflictType === "contradiction" 
    ? "contradicts" 
    : "may update";

  return `[Memory conflict detected: "${result.conflictingMemory.content.substring(0, 50)}..." ${typeStr} new info (${similarity}% similar)]`;
}

export async function checkAndFormatConflict(
  newContent: string,
  options?: Parameters<typeof detectMemoryConflict>[1]
): Promise<{
  hasConflict: boolean;
  question?: string;
  result: ConflictDetectionResult;
}> {
  const result = await detectMemoryConflict(newContent, options);
  
  if (!result.hasConflict || !result.conflictingMemory) {
    return { hasConflict: false, result };
  }

  const question = formatConflictQuestion(
    newContent,
    result.conflictingMemory,
    result.conflictType
  );

  return { hasConflict: true, question, result };
}

export { CONFLICT_SIMILARITY_THRESHOLD, HIGH_SIMILARITY_THRESHOLD };

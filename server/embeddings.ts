import OpenAI from "openai";

let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "OpenAI API key not configured. Please add OPENAI_API_KEY to your secrets.",
      );
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient();
  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  
  const client = getOpenAIClient();
  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });
  return response.data.map(d => d.embedding);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface ScoredMemory<T> {
  item: T;
  score: number;
  recencyScore: number;
  relevanceScore: number;
  importanceScore: number;
}

export interface MemoryWithEmbedding {
  id: string;
  content: string;
  type: string;
  embedding: number[] | null;
  updatedAt: string;
  createdAt: string;
}

export function scoreMemories<T extends MemoryWithEmbedding>(
  memories: T[],
  queryEmbedding: number[],
  options: {
    recencyWeight?: number;
    relevanceWeight?: number;
    importanceWeight?: number;
    importanceByType?: Record<string, number>;
  } = {}
): ScoredMemory<T>[] {
  const {
    recencyWeight = 0.2,
    relevanceWeight = 0.6,
    importanceWeight = 0.2,
    importanceByType = {
      fact: 1.0,
      preference: 0.9,
      note: 0.7,
      summary: 0.5,
    },
  } = options;

  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const MAX_AGE_DAYS = 365;

  const scored = memories.map((memory) => {
    const relevanceScore = memory.embedding
      ? cosineSimilarity(queryEmbedding, memory.embedding)
      : 0;

    const memoryDate = new Date(memory.updatedAt).getTime();
    const ageInDays = Math.max(0, (now - memoryDate) / ONE_DAY_MS);
    const recencyScore = Math.max(0, 1 - ageInDays / MAX_AGE_DAYS);

    const importanceScore = importanceByType[memory.type] ?? 0.5;

    const totalScore =
      recencyWeight * recencyScore +
      relevanceWeight * relevanceScore +
      importanceWeight * importanceScore;

    return {
      item: memory,
      score: totalScore,
      recencyScore,
      relevanceScore,
      importanceScore,
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

export function findDuplicates<T extends MemoryWithEmbedding>(
  newEmbedding: number[],
  existingMemories: T[],
  threshold: number = 0.92
): T[] {
  return existingMemories.filter((memory) => {
    if (!memory.embedding) return false;
    const similarity = cosineSimilarity(newEmbedding, memory.embedding);
    return similarity >= threshold;
  });
}

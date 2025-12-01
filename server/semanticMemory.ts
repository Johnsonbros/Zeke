import { 
  getAllMemoryNotes, 
  createMemoryNote,
  type CreateMemoryNoteInput,
  updateMemoryNoteEmbedding,
  getMemoryNotesWithoutEmbeddings,
  parseEmbedding,
  supersedeMemoryNote,
  findMemoryNoteByContent,
  getMemoryWithConfidence,
  type MemoryWithConfidence
} from "./db";
import { 
  generateEmbedding, 
  generateEmbeddings, 
  scoreMemories, 
  findDuplicates,
  type MemoryWithEmbedding,
  type ScoredMemory
} from "./embeddings";
import type { MemoryNote, InsertMemoryNote } from "@shared/schema";

export interface SemanticMemoryNote extends MemoryNote {
  parsedEmbedding: number[] | null;
}

function toSemanticMemory(note: MemoryNote): SemanticMemoryNote {
  return {
    ...note,
    parsedEmbedding: parseEmbedding(note.embedding ?? null),
  };
}

function toEmbeddingFormat(note: SemanticMemoryNote): MemoryWithEmbedding {
  return {
    id: note.id,
    content: note.content,
    type: note.type,
    embedding: note.parsedEmbedding,
    updatedAt: note.updatedAt,
    createdAt: note.createdAt,
  };
}

export async function createMemoryWithEmbedding(
  data: Omit<CreateMemoryNoteInput, 'embedding'>,
  options: {
    checkDuplicates?: boolean;
    duplicateThreshold?: number;
    supersedesContentLike?: string;
  } = {}
): Promise<{ note: MemoryNote; isDuplicate: boolean; duplicateOf?: string; wasCreated: boolean }> {
  const { checkDuplicates = true, duplicateThreshold = 0.92, supersedesContentLike } = options;

  const existingNotes = getAllMemoryNotes().map(toSemanticMemory);

  try {
    const embedding = await Promise.race([
      generateEmbedding(data.content),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Embedding generation timeout")), 5000)
      )
    ]);

    if (checkDuplicates && !supersedesContentLike) {
      const notesWithEmbeddings = existingNotes
        .filter(n => n.parsedEmbedding !== null)
        .map(toEmbeddingFormat);

      const duplicates = findDuplicates(embedding, notesWithEmbeddings, duplicateThreshold);
      
      if (duplicates.length > 0) {
        console.log(`Duplicate memory detected (similarity >= ${duplicateThreshold}): "${data.content}" is similar to "${duplicates[0].content}"`);
        return { 
          note: existingNotes.find(n => n.id === duplicates[0].id)!, 
          isDuplicate: true, 
          duplicateOf: duplicates[0].id,
          wasCreated: false
        };
      }
    }

    const note = createMemoryNote({ 
      type: data.type,
      content: data.content,
      context: data.context,
      embedding 
    });

    if (supersedesContentLike) {
      const oldNote = findMemoryNoteByContent(supersedesContentLike);
      if (oldNote && oldNote.id !== note.id) {
        supersedeMemoryNote(oldNote.id, note.id);
        console.log(`Memory superseded: "${oldNote.content}" -> "${note.content}"`);
      }
    }

    console.log(`Created memory with embedding: [${note.type}] ${note.content.substring(0, 50)}...`);
    return { note, isDuplicate: false, wasCreated: true };
  } catch (error) {
    console.error("Error creating memory with embedding, falling back to basic:", error);
    
    if (checkDuplicates && !supersedesContentLike) {
      const exactMatch = existingNotes.find(n => 
        n.content.toLowerCase().trim() === data.content.toLowerCase().trim()
      );
      if (exactMatch) {
        console.log(`Duplicate memory detected (exact match fallback): "${data.content}"`);
        return { 
          note: exactMatch, 
          isDuplicate: true, 
          duplicateOf: exactMatch.id,
          wasCreated: false
        };
      }
    }
    
    const note = createMemoryNote({ 
      type: data.type,
      content: data.content,
      context: data.context
    });
    
    if (supersedesContentLike) {
      const oldNote = findMemoryNoteByContent(supersedesContentLike);
      if (oldNote && oldNote.id !== note.id) {
        supersedeMemoryNote(oldNote.id, note.id);
        console.log(`Memory superseded (fallback): "${oldNote.content}" -> "${note.content}"`);
      }
    }
    
    return { note, isDuplicate: false, wasCreated: true };
  }
}

export async function semanticSearch(
  query: string,
  options: {
    limit?: number;
    minScore?: number;
    types?: Array<"fact" | "preference" | "note" | "summary">;
  } = {}
): Promise<ScoredMemory<SemanticMemoryNote>[]> {
  const { limit = 10, minScore = 0.3, types } = options;

  try {
    const queryEmbedding = await generateEmbedding(query);
    
    let allNotes = getAllMemoryNotes().map(toSemanticMemory);
    
    if (types && types.length > 0) {
      allNotes = allNotes.filter(n => types.includes(n.type as any));
    }

    const notesWithEmbeddings = allNotes
      .filter(n => n.parsedEmbedding !== null)
      .map(n => ({
        ...toEmbeddingFormat(n),
        originalNote: n,
      }));

    const scored = scoreMemories(notesWithEmbeddings, queryEmbedding);

    return scored
      .filter(s => s.score >= minScore)
      .slice(0, limit)
      .map(s => ({
        ...s,
        item: (s.item as any).originalNote as SemanticMemoryNote,
      }));
  } catch (error) {
    console.error("Error in semantic search:", error);
    return [];
  }
}

function buildBasicMemoryContext(allNotes: SemanticMemoryNote[]): string {
  let context = "";

  const recentFacts = allNotes.filter(n => n.type === "fact").slice(0, 5);
  const recentPreferences = allNotes.filter(n => n.type === "preference").slice(0, 5);
  const recentSummaries = allNotes.filter(n => n.type === "summary").slice(0, 3);

  if (recentFacts.length > 0) {
    context += "## Known Facts\n";
    recentFacts.forEach(note => {
      context += `- ${note.content}\n`;
    });
    context += "\n";
  }

  if (recentPreferences.length > 0) {
    context += "## Preferences\n";
    recentPreferences.forEach(note => {
      context += `- ${note.content}\n`;
    });
    context += "\n";
  }

  if (recentSummaries.length > 0) {
    context += "## Recent Conversation Summaries\n";
    recentSummaries.forEach(note => {
      context += `- ${note.content}\n`;
    });
    context += "\n";
  }

  return context;
}

// Helper to get confidence label for display
function getConfidenceLabel(confidence: MemoryWithConfidence): string {
  const score = confidence.effectiveScore;
  if (score >= 0.8) return "high";
  if (score >= 0.5) return "medium";
  if (score >= 0.3) return "low";
  return "uncertain";
}

// Helper to format memory with confidence info
function formatMemoryWithConfidence(note: SemanticMemoryNote, relevanceScore?: number): string {
  const confidence = getMemoryWithConfidence(note);
  const confidenceLabel = getConfidenceLabel(confidence);
  const confidenceStr = `[confidence: ${confidenceLabel}]`;
  const relevanceStr = relevanceScore !== undefined 
    ? `[relevance: ${(relevanceScore * 100).toFixed(0)}%]` 
    : "";
  
  // Add warning for uncertain memories
  const warningStr = confidence.needsConfirmation ? " [NEEDS VERIFICATION]" : "";
  
  return `- [${note.type}] ${note.content} ${relevanceStr} ${confidenceStr}${warningStr}`;
}

export async function getSmartMemoryContext(userMessage: string): Promise<string> {
  const allNotes = getAllMemoryNotes().map(toSemanticMemory);
  
  if (allNotes.length === 0) {
    return "";
  }

  try {
    const relevantMemories = await Promise.race([
      semanticSearch(userMessage, {
        limit: 8,
        minScore: 0.35,
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Semantic search timeout")), 5000)
      )
    ]);

    if (relevantMemories.length === 0) {
      console.log("Semantic search returned no results, using basic context");
      return buildBasicMemoryContext(allNotes);
    }

    const recentFacts = allNotes
      .filter(n => n.type === "fact")
      .slice(0, 5);

    const recentPreferences = allNotes
      .filter(n => n.type === "preference")
      .slice(0, 5);

    const recentSummaries = allNotes
      .filter(n => n.type === "summary")
      .slice(0, 2);

    let context = "";
    
    // Collect memories needing confirmation for special section
    const memoriesNeedingConfirmation: Array<{note: SemanticMemoryNote, relevanceScore?: number}> = [];

    context += "## Relevant Memory (by semantic similarity)\n";
    relevantMemories.forEach(({ item, relevanceScore }) => {
      const confidence = getMemoryWithConfidence(item);
      if (confidence.needsConfirmation) {
        memoriesNeedingConfirmation.push({ note: item, relevanceScore });
      }
      context += formatMemoryWithConfidence(item, relevanceScore) + "\n";
    });
    context += "\n";

    const relevantIds = new Set(relevantMemories.map(m => m.item.id));

    const additionalFacts = recentFacts.filter(n => !relevantIds.has(n.id));
    if (additionalFacts.length > 0) {
      context += "## Known Facts\n";
      additionalFacts.forEach(note => {
        const confidence = getMemoryWithConfidence(note);
        if (confidence.needsConfirmation) {
          memoriesNeedingConfirmation.push({ note });
        }
        context += formatMemoryWithConfidence(note) + "\n";
      });
      context += "\n";
    }

    const additionalPreferences = recentPreferences.filter(n => !relevantIds.has(n.id));
    if (additionalPreferences.length > 0) {
      context += "## Preferences\n";
      additionalPreferences.forEach(note => {
        const confidence = getMemoryWithConfidence(note);
        if (confidence.needsConfirmation) {
          memoriesNeedingConfirmation.push({ note });
        }
        context += formatMemoryWithConfidence(note) + "\n";
      });
      context += "\n";
    }

    const additionalSummaries = recentSummaries.filter(n => !relevantIds.has(n.id));
    if (additionalSummaries.length > 0) {
      context += "## Recent Conversation Summaries\n";
      additionalSummaries.forEach(note => {
        context += formatMemoryWithConfidence(note) + "\n";
      });
      context += "\n";
    }
    
    // Add special section for memories needing verification
    if (memoriesNeedingConfirmation.length > 0) {
      context += "## MEMORIES NEEDING VERIFICATION\n";
      context += "The following memories have low confidence or haven't been confirmed recently. ";
      context += "If you use any of these in your response, consider naturally asking the user to confirm if this is still accurate:\n";
      memoriesNeedingConfirmation.forEach(({ note }) => {
        context += `- "${note.content}" (${note.type})\n`;
      });
      context += "\n";
    }

    return context;
  } catch (error) {
    console.error("Error getting smart memory context, falling back to basic:", error);
    return buildBasicMemoryContext(allNotes);
  }
}

export async function backfillEmbeddings(): Promise<{ processed: number; failed: number }> {
  const notesWithoutEmbeddings = getMemoryNotesWithoutEmbeddings();
  
  if (notesWithoutEmbeddings.length === 0) {
    console.log("All memories already have embeddings.");
    return { processed: 0, failed: 0 };
  }

  console.log(`Backfilling embeddings for ${notesWithoutEmbeddings.length} memories...`);

  const BATCH_SIZE = 20;
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < notesWithoutEmbeddings.length; i += BATCH_SIZE) {
    const batch = notesWithoutEmbeddings.slice(i, i + BATCH_SIZE);
    const contents = batch.map(n => n.content);

    try {
      const embeddings = await generateEmbeddings(contents);
      
      for (let j = 0; j < batch.length; j++) {
        const note = batch[j];
        const embedding = embeddings[j];
        
        if (embedding) {
          const success = updateMemoryNoteEmbedding(note.id, embedding);
          if (success) {
            processed++;
          } else {
            failed++;
          }
        } else {
          failed++;
        }
      }
      
      console.log(`Processed batch ${Math.floor(i / BATCH_SIZE) + 1}: ${processed} successful, ${failed} failed`);
    } catch (error) {
      console.error(`Error processing batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
      failed += batch.length;
    }
  }

  console.log(`Backfill complete: ${processed} processed, ${failed} failed`);
  return { processed, failed };
}

export async function getMemoryStats(): Promise<{
  total: number;
  withEmbeddings: number;
  byType: Record<string, number>;
}> {
  const allNotes = getAllMemoryNotes();
  const withEmbeddings = allNotes.filter(n => n.embedding !== null).length;
  
  const byType: Record<string, number> = {};
  allNotes.forEach(n => {
    byType[n.type] = (byType[n.type] || 0) + 1;
  });

  return {
    total: allNotes.length,
    withEmbeddings,
    byType,
  };
}

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
  type MemoryWithConfidence,
  getLocationHistoryInRange,
  findNearbyPlaces,
  getLatestLocation,
  correlateLifelogWithLocation,
  getLifelogLocationByLifelogId,
} from "./db";
import { 
  generateEmbedding, 
  generateEmbeddings, 
  scoreMemories, 
  findDuplicates,
  type MemoryWithEmbedding,
  type ScoredMemory
} from "./embeddings";
import { onMemoryCreated } from "./entityExtractor";
import type { MemoryNote, InsertMemoryNote, MemoryNoteSourceType } from "@shared/schema";

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

export interface CreateMemoryOptions {
  checkDuplicates?: boolean;
  duplicateThreshold?: number;
  supersedesContentLike?: string;
  enrichWithLocation?: boolean;
  lifelogId?: string;
  sourceTimestamp?: string;
}

export async function createMemoryWithEmbedding(
  data: Omit<CreateMemoryNoteInput, 'embedding'>,
  options: CreateMemoryOptions = {}
): Promise<{ note: MemoryNote; isDuplicate: boolean; duplicateOf?: string; wasCreated: boolean; locationEnriched?: boolean }> {
  const { 
    checkDuplicates = true, 
    duplicateThreshold = 0.92, 
    supersedesContentLike,
    enrichWithLocation = true,
    lifelogId,
    sourceTimestamp,
  } = options;

  const existingNotes = getAllMemoryNotes().map(toSemanticMemory);

  // Enrich with location context if requested
  let locationContext = enrichLocationContext(data, { lifelogId, sourceTimestamp });
  const enrichedData = { ...data, ...locationContext };

  try {
    const embedding = await Promise.race([
      generateEmbedding(enrichedData.content),
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
        console.log(`Duplicate memory detected (similarity >= ${duplicateThreshold}): "${enrichedData.content}" is similar to "${duplicates[0].content}"`);
        return { 
          note: existingNotes.find(n => n.id === duplicates[0].id)!, 
          isDuplicate: true, 
          duplicateOf: duplicates[0].id,
          wasCreated: false,
          locationEnriched: false
        };
      }
    }

    const note = createMemoryNote({ 
      type: enrichedData.type,
      content: enrichedData.content,
      context: enrichedData.context,
      placeId: enrichedData.placeId,
      sourceType: enrichedData.sourceType,
      sourceId: enrichedData.sourceId,
      contactId: enrichedData.contactId,
      embedding 
    });

    if (supersedesContentLike) {
      const oldNote = findMemoryNoteByContent(supersedesContentLike);
      if (oldNote && oldNote.id !== note.id) {
        supersedeMemoryNote(oldNote.id, note.id);
        console.log(`Memory superseded: "${oldNote.content}" -> "${note.content}"`);
      }
    }

    console.log(`Created memory with embedding: [${note.type}] ${note.content.substring(0, 50)}...${locationContext.placeId ? ` (at ${locationContext.placeId})` : ''}`);
    
    onMemoryCreated(note).catch(err => {
      console.error("[SemanticMemory] Entity extraction failed:", err);
    });
    
    return { 
      note, 
      isDuplicate: false, 
      wasCreated: true,
      locationEnriched: !!locationContext.placeId
    };
  } catch (error) {
    console.error("Error creating memory with embedding, falling back to basic:", error);
    
    if (checkDuplicates && !supersedesContentLike) {
      const exactMatch = existingNotes.find(n => 
        n.content.toLowerCase().trim() === enrichedData.content.toLowerCase().trim()
      );
      if (exactMatch) {
        console.log(`Duplicate memory detected (exact match fallback): "${enrichedData.content}"`);
        return { 
          note: exactMatch, 
          isDuplicate: true, 
          duplicateOf: exactMatch.id,
          wasCreated: false,
          locationEnriched: false
        };
      }
    }
    
    const note = createMemoryNote({ 
      type: enrichedData.type,
      content: enrichedData.content,
      context: enrichedData.context,
      placeId: enrichedData.placeId,
      sourceType: enrichedData.sourceType,
      sourceId: enrichedData.sourceId,
      contactId: enrichedData.contactId,
    });
    
    if (supersedesContentLike) {
      const oldNote = findMemoryNoteByContent(supersedesContentLike);
      if (oldNote && oldNote.id !== note.id) {
        supersedeMemoryNote(oldNote.id, note.id);
        console.log(`Memory superseded (fallback): "${oldNote.content}" -> "${note.content}"`);
      }
    }
    
    onMemoryCreated(note).catch(err => {
      console.error("[SemanticMemory] Entity extraction failed (fallback):", err);
    });
    
    return { 
      note, 
      isDuplicate: false, 
      wasCreated: true,
      locationEnriched: !!locationContext.placeId
    };
  }
}

/**
 * Enrich memory data with location context based on lifelog ID or timestamp
 */
function enrichLocationContext(
  data: Omit<CreateMemoryNoteInput, 'embedding'>,
  options: { lifelogId?: string; sourceTimestamp?: string }
): Partial<CreateMemoryNoteInput> {
  const result: Partial<CreateMemoryNoteInput> = {};
  
  try {
    // If we have a lifelog ID, check if it's already correlated with location
    if (options.lifelogId) {
      const lifelogLocation = getLifelogLocationByLifelogId(options.lifelogId);
      if (lifelogLocation) {
        if (lifelogLocation.savedPlaceId) {
          result.placeId = lifelogLocation.savedPlaceId;
        }
        result.sourceType = "lifelog" as MemoryNoteSourceType;
        result.sourceId = options.lifelogId;
        
        // Enrich context with location info
        if (lifelogLocation.savedPlaceName && !data.context?.includes(lifelogLocation.savedPlaceName)) {
          const locationInfo = `Location: ${lifelogLocation.savedPlaceName}`;
          const activityInfo = lifelogLocation.activityType !== "unknown" 
            ? ` (${lifelogLocation.activityType})` 
            : "";
          result.context = data.context 
            ? `${data.context}. ${locationInfo}${activityInfo}` 
            : `${locationInfo}${activityInfo}`;
        }
        return result;
      }
    }
    
    // If we have a timestamp, try to find location at that time
    if (options.sourceTimestamp) {
      const timestamp = new Date(options.sourceTimestamp);
      const windowMs = 5 * 60 * 1000; // 5 minute window
      
      const startTime = new Date(timestamp.getTime() - windowMs).toISOString();
      const endTime = new Date(timestamp.getTime() + windowMs).toISOString();
      
      const locationHistory = getLocationHistoryInRange(startTime, endTime);
      
      if (locationHistory.length > 0) {
        // Find the closest location to our timestamp
        const closestLocation = locationHistory.reduce((closest, loc) => {
          const locTime = new Date(loc.createdAt).getTime();
          const targetTime = timestamp.getTime();
          const closestTime = new Date(closest.createdAt).getTime();
          return Math.abs(locTime - targetTime) < Math.abs(closestTime - targetTime) ? loc : closest;
        }, locationHistory[0]);
        
        const lat = parseFloat(closestLocation.latitude);
        const lng = parseFloat(closestLocation.longitude);
        
        // Check if near a saved place
        const nearbyPlaces = findNearbyPlaces(lat, lng, 200);
        if (nearbyPlaces.length > 0) {
          result.placeId = nearbyPlaces[0].id;
          
          // Enrich context with location info
          if (!data.context?.includes(nearbyPlaces[0].name)) {
            const locationInfo = `Location: ${nearbyPlaces[0].name}`;
            result.context = data.context 
              ? `${data.context}. ${locationInfo}` 
              : locationInfo;
          }
        }
      }
    }
    
    // Fallback: use current location if very recent
    if (!result.placeId) {
      const currentLocation = getLatestLocation();
      if (currentLocation) {
        const ageMs = Date.now() - new Date(currentLocation.createdAt).getTime();
        const maxAgeMs = 10 * 60 * 1000; // 10 minutes
        
        if (ageMs <= maxAgeMs) {
          const lat = parseFloat(currentLocation.latitude);
          const lng = parseFloat(currentLocation.longitude);
          
          const nearbyPlaces = findNearbyPlaces(lat, lng, 100);
          if (nearbyPlaces.length > 0) {
            result.placeId = nearbyPlaces[0].id;
          }
        }
      }
    }
  } catch (error) {
    console.error("[SemanticMemory] Error enriching location context:", error);
  }
  
  return result;
}

/**
 * Get location context for a specific memory (for display purposes)
 */
export function getMemoryLocationContext(memoryId: string): {
  placeName?: string;
  placeCategory?: string;
  sourceLifelogId?: string;
  sourceLifelogTitle?: string;
} | null {
  try {
    const note = getAllMemoryNotes().find(n => n.id === memoryId);
    if (!note) return null;
    
    const result: any = {};
    
    // If memory has a placeId, get place info
    if (note.placeId) {
      const nearbyPlaces = findNearbyPlaces(0, 0, 0); // This won't work, need proper lookup
      // For now, just return the placeId
      result.placeId = note.placeId;
    }
    
    // If memory has a lifelog source, get lifelog info
    if (note.sourceType === "lifelog" && note.sourceId) {
      const lifelogLocation = getLifelogLocationByLifelogId(note.sourceId);
      if (lifelogLocation) {
        result.sourceLifelogId = lifelogLocation.lifelogId;
        result.sourceLifelogTitle = lifelogLocation.lifelogTitle;
        result.placeName = lifelogLocation.savedPlaceName;
        result.placeCategory = lifelogLocation.savedPlaceCategory;
      }
    }
    
    return Object.keys(result).length > 0 ? result : null;
  } catch (error) {
    console.error("[SemanticMemory] Error getting memory location context:", error);
    return null;
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

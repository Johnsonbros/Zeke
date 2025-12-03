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

/**
 * Calculate temporal decay score for a memory based on age
 * More recent = higher score (approaches 1.0)
 * Older = lower score (approaches 0.0)
 */
function calculateMemoryTemporalDecay(createdAt: string, decayDays: number = 90): number {
  const now = new Date();
  const then = new Date(createdAt);
  const daysDiff = (now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24);

  // Exponential decay: e^(-daysDiff / decayDays)
  const decay = Math.exp(-daysDiff / decayDays);

  // Ensure minimum score of 0.1 for very old memories
  return Math.max(decay, 0.1);
}

/**
 * Calculate effective confidence score including temporal decay
 * Factors in: base confidence, confirmation count, usage, and age
 */
function calculateEffectiveConfidence(memory: MemoryNote): number {
  const baseConfidence = parseFloat(memory.confidenceScore || "0.8");
  const confirmationCount = memory.confirmationCount || 0;
  const usageCount = memory.usageCount || 0;

  // Boost confidence based on confirmations (max +0.15)
  const confirmationBoost = Math.min(confirmationCount * 0.05, 0.15);

  // Slight boost from usage (max +0.05)
  const usageBoost = Math.min(usageCount * 0.01, 0.05);

  // Apply temporal decay
  const temporalDecay = calculateMemoryTemporalDecay(memory.createdAt);

  // Combine factors
  let effectiveConfidence = baseConfidence + confirmationBoost + usageBoost;
  effectiveConfidence = Math.min(effectiveConfidence, 1.0);

  // Apply temporal decay (older memories less confident)
  effectiveConfidence *= (0.5 + 0.5 * temporalDecay);

  return effectiveConfidence;
}

export async function semanticSearch(
  query: string,
  options: {
    limit?: number;
    minScore?: number;
    types?: Array<"fact" | "preference" | "note" | "summary">;
    useConfidenceWeighting?: boolean;
  } = {}
): Promise<ScoredMemory<SemanticMemoryNote>[]> {
  const { limit = 10, minScore = 0.3, types, useConfidenceWeighting = true } = options;

  try {
    const queryEmbedding = await generateEmbedding(query);

    let allNotes = getAllMemoryNotes().map(toSemanticMemory);

    // Filter out superseded memories
    allNotes = allNotes.filter(n => !n.isSuperseded);

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

    // Apply confidence weighting to scores
    const confidenceWeighted = scored.map(s => {
      if (!useConfidenceWeighting) return s;

      const effectiveConfidence = calculateEffectiveConfidence(s.memory.originalNote);
      const weightedScore = s.score * (0.4 + 0.6 * effectiveConfidence);

      return {
        ...s,
        score: weightedScore,
        originalScore: s.score,
        effectiveConfidence
      };
    });

    return confidenceWeighted
      .filter(s => s.score >= minScore)
      .sort((a, b) => b.score - a.score)
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

// ============================================
// PROACTIVE MEMORY VERIFICATION SYSTEM
// ============================================

export interface MemoryVerificationStatus {
  memoryId: string;
  content: string;
  type: string;
  effectiveConfidence: number;
  needsVerification: boolean;
  verificationReason: string;
  lastConfirmedAt: string | null;
  daysSinceConfirmation: number | null;
  usageCount: number;
  confirmationCount: number;
}

/**
 * Get all memories that need verification
 * Returns memories with low confidence or haven't been confirmed recently
 */
export function getMemoriesNeedingVerification(): MemoryVerificationStatus[] {
  const allNotes = getAllMemoryNotes().filter(n => !n.isSuperseded);
  const results: MemoryVerificationStatus[] = [];

  const now = new Date();

  for (const note of allNotes) {
    const effectiveConfidence = calculateEffectiveConfidence(note);
    let needsVerification = false;
    let reason = "";

    // Check if confidence is low
    if (effectiveConfidence < 0.5) {
      needsVerification = true;
      reason = "Low confidence score";
    }

    // Check if heavily used but never confirmed
    if (note.usageCount && note.usageCount >= 3 && note.confirmationCount === 0) {
      needsVerification = true;
      reason = reason ? `${reason}, Used multiple times but never confirmed` : "Used multiple times but never confirmed";
    }

    // Check if old and not confirmed recently
    if (note.lastConfirmedAt) {
      const daysSinceConfirmation = (now.getTime() - new Date(note.lastConfirmedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceConfirmation > 60 && note.type !== "summary") {
        needsVerification = true;
        reason = reason ? `${reason}, Not confirmed in ${Math.round(daysSinceConfirmation)} days` : `Not confirmed in ${Math.round(daysSinceConfirmation)} days`;
      }
    } else if (note.usageCount && note.usageCount > 0) {
      // Used but never confirmed
      needsVerification = true;
      reason = reason ? `${reason}, Used but never confirmed` : "Used but never confirmed";
    }

    if (needsVerification) {
      const daysSinceConfirmation = note.lastConfirmedAt
        ? (now.getTime() - new Date(note.lastConfirmedAt).getTime()) / (1000 * 60 * 60 * 24)
        : null;

      results.push({
        memoryId: note.id,
        content: note.content,
        type: note.type,
        effectiveConfidence,
        needsVerification: true,
        verificationReason: reason,
        lastConfirmedAt: note.lastConfirmedAt || null,
        daysSinceConfirmation,
        usageCount: note.usageCount || 0,
        confirmationCount: note.confirmationCount || 0
      });
    }
  }

  // Sort by priority: lowest confidence and most used first
  return results.sort((a, b) => {
    const aScore = a.effectiveConfidence - (a.usageCount * 0.01);
    const bScore = b.effectiveConfidence - (b.usageCount * 0.01);
    return aScore - bScore;
  });
}

/**
 * Mark a memory as confirmed by the user
 * Updates confidence score and confirmation timestamp
 */
export async function confirmMemory(memoryId: string): Promise<void> {
  const { updateMemoryConfidence } = await import("./db");

  const memory = getAllMemoryNotes().find(n => n.id === memoryId);
  if (!memory) {
    console.warn(`[SemanticMemory] Cannot confirm memory ${memoryId}: not found`);
    return;
  }

  const confirmationCount = (memory.confirmationCount || 0) + 1;
  const now = new Date().toISOString();

  updateMemoryConfidence(memoryId, {
    confirmationCount,
    lastConfirmedAt: now
  });

  console.log(`[SemanticMemory] Memory confirmed: "${memory.content.substring(0, 50)}..." (confirmations: ${confirmationCount})`);
}

/**
 * Mark a memory as contradicted/incorrect
 * Lowers confidence score significantly
 */
export async function contradictMemory(memoryId: string): Promise<void> {
  const { updateMemoryConfidence } = await import("./db");

  const memory = getAllMemoryNotes().find(n => n.id === memoryId);
  if (!memory) {
    console.warn(`[SemanticMemory] Cannot contradict memory ${memoryId}: not found`);
    return;
  }

  const currentConfidence = parseFloat(memory.confidenceScore || "0.8");
  const newConfidence = Math.max(currentConfidence - 0.3, 0.1);

  updateMemoryConfidence(memoryId, {
    confidenceScore: newConfidence.toString()
  });

  console.log(`[SemanticMemory] Memory contradicted: "${memory.content.substring(0, 50)}..." (confidence: ${currentConfidence.toFixed(2)} → ${newConfidence.toFixed(2)})`);
}

/**
 * Increment usage count when a memory is used in a response
 */
export async function recordMemoryUsage(memoryId: string): Promise<void> {
  const { updateMemoryConfidence } = await import("./db");

  const memory = getAllMemoryNotes().find(n => n.id === memoryId);
  if (!memory) return;

  const usageCount = (memory.usageCount || 0) + 1;
  const now = new Date().toISOString();

  updateMemoryConfidence(memoryId, {
    usageCount,
    lastUsedAt: now
  });

  console.log(`[SemanticMemory] Memory usage recorded: "${memory.content.substring(0, 50)}..." (uses: ${usageCount})`);
}

/**
 * Auto-detect confirmation or contradiction in user messages
 * Returns memory IDs that should be updated
 */
export async function detectMemoryValidation(
  userMessage: string,
  conversationContext: { memoryIdsUsed?: string[] }
): Promise<{
  confirmed: string[];
  contradicted: string[];
}> {
  const confirmed: string[] = [];
  const contradicted: string[] = [];

  if (!conversationContext.memoryIdsUsed || conversationContext.memoryIdsUsed.length === 0) {
    return { confirmed, contradicted };
  }

  const messageLower = userMessage.toLowerCase();

  // Confirmation patterns
  const confirmationPatterns = [
    /\b(yes|yeah|yep|correct|right|exactly|that's right|true)\b/,
    /\b(still (like|love|prefer))\b/,
    /\b(that'?s still)\b/,
  ];

  // Contradiction patterns
  const contradictionPatterns = [
    /\b(no|nope|not (anymore|really|quite)|wrong|incorrect|actually)\b/,
    /\b(don't (like|love|prefer|want) (that|those|it) anymore)\b/,
    /\b(changed my mind|not a fan|used to)\b/,
  ];

  const hasConfirmation = confirmationPatterns.some(p => p.test(messageLower));
  const hasContradiction = contradictionPatterns.some(p => p.test(messageLower));

  // If recent memories were used and user confirms/contradicts
  if (hasConfirmation) {
    confirmed.push(...conversationContext.memoryIdsUsed);
  } else if (hasContradiction) {
    contradicted.push(...conversationContext.memoryIdsUsed);
  }

  return { confirmed, contradicted };
}

/**
 * Artifact Consumer Service
 * 
 * Consumes batch processing artifacts and integrates them into the system:
 * - MEMORY_SUMMARY: Creates memory notes from summaries
 * - KG_EDGES: Updates knowledge graph with entity relationships  
 * - FEEDBACK_FIX: Logs improvements from negative feedback analysis
 */

import { z } from "zod";
import {
  getUnprocessedArtifactsByType,
  markArtifactProcessed,
  createMemoryNote,
  createEntity,
  createEntityLink,
  getEntityByLabel,
} from "../db";
import { processConceptReflectionBatchResult } from "../jobs/conceptReflection";
import type { 
  BatchArtifact,
  EntityType,
  EntityRelationshipType,
} from "@shared/schema";

// Zod schemas for validating batch artifact payloads (snake_case from OpenAI JSON output)
const memorySummaryPayloadSchema = z.object({
  day_key: z.string(),
  summaries: z.array(z.object({
    source_message_ids: z.array(z.string()).optional(),
    summary: z.string(),
    tags: z.array(z.string()).optional(),
    importance: z.number().min(0).max(1).optional(),
    surprise: z.number().min(0).max(1).optional(),
    action_items: z.array(z.object({
      text: z.string(),
      due_date: z.string().nullable().optional(),
    })).optional(),
  })).optional().default([]),
});

const kgEdgesPayloadSchema = z.object({
  entities: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["PERSON", "PLACE", "ORG", "DEVICE", "PROJECT", "OTHER"]),
    aliases: z.array(z.string()).optional().default([]),
  })).optional().default([]),
  edges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    relation: z.string(),
    confidence: z.number().min(0).max(1).optional().default(0.5),
    evidence_message_ids: z.array(z.string()).optional().default([]),
  })).optional().default([]),
});

const feedbackFixPayloadSchema = z.object({
  fixes: z.array(z.object({
    message_id: z.string(),
    better_response: z.string().optional(),
    better_tool_plan: z.array(z.string()).optional(),
    root_cause: z.enum(["style", "tool_miss", "hallucination", "missing_context", "other"]).optional(),
    new_eval_testcase: z.object({
      prompt: z.string().optional(),
      expected: z.string().optional(),
      tools_expected: z.array(z.string()).optional(),
    }).optional(),
  })).optional().default([]),
});

type MemorySummaryPayload = z.infer<typeof memorySummaryPayloadSchema>;
type KgEdgesPayload = z.infer<typeof kgEdgesPayloadSchema>;
type FeedbackFixPayload = z.infer<typeof feedbackFixPayloadSchema>;

/**
 * Consume MEMORY_SUMMARY artifacts and create memory notes
 */
export async function consumeMemorySummaryArtifacts(): Promise<{ processed: number; errors: number; itemsCreated: number; itemsFailed: number }> {
  const artifacts = getUnprocessedArtifactsByType("MEMORY_SUMMARY");
  let processed = 0;
  let errors = 0;
  let itemsCreated = 0;
  let itemsFailed = 0;

  for (const artifact of artifacts) {
    let payload: MemorySummaryPayload;
    let allItemsSucceeded = true;
    let currentItemsCreated = 0;
    
    try {
      // Parse JSON with try/catch
      let rawPayload: unknown;
      try {
        rawPayload = JSON.parse(artifact.payloadJson);
      } catch (parseError) {
        console.error(`[ArtifactConsumer] Failed to parse JSON for MEMORY_SUMMARY artifact ${artifact.id}:`, parseError);
        errors++;
        continue;
      }
      
      // Validate payload structure with Zod
      const validationResult = memorySummaryPayloadSchema.safeParse(rawPayload);
      if (!validationResult.success) {
        console.error(`[ArtifactConsumer] Validation failed for MEMORY_SUMMARY artifact ${artifact.id}:`, validationResult.error.format());
        errors++;
        continue;
      }
      payload = validationResult.data;
      
      // Process each summary item
      for (const summary of payload.summaries) {
        try {
          const tags = summary.tags?.join(", ") || "";
          const content = summary.summary;
          
          createMemoryNote({
            type: "fact",
            content,
            context: `Batch enrichment from ${payload.day_key}. Tags: ${tags}. Importance: ${summary.importance || 0.5}`,
            source: "batch_enrichment",
          });
          
          currentItemsCreated++;
          console.log(`[ArtifactConsumer] Created memory note from batch: "${content.substring(0, 50)}..."`);
        } catch (itemError) {
          allItemsSucceeded = false;
          itemsFailed++;
          console.error(`[ArtifactConsumer] Failed to create memory note for artifact ${artifact.id}, summary: "${summary.summary?.substring(0, 30)}..."`, itemError);
        }
      }
      
      // Only mark as processed if ALL items succeeded
      if (allItemsSucceeded) {
        markArtifactProcessed(artifact.id);
        processed++;
        itemsCreated += currentItemsCreated;
      } else {
        console.warn(`[ArtifactConsumer] Artifact ${artifact.id} partially failed - not marking as processed for retry`);
        errors++;
      }
    } catch (error) {
      console.error(`[ArtifactConsumer] Error processing MEMORY_SUMMARY artifact ${artifact.id}:`, error);
      errors++;
    }
  }

  if (processed > 0 || errors > 0) {
    console.log(`[ArtifactConsumer] MEMORY_SUMMARY: processed=${processed}, errors=${errors}, itemsCreated=${itemsCreated}, itemsFailed=${itemsFailed}`);
  }

  return { processed, errors, itemsCreated, itemsFailed };
}

/**
 * Consume KG_EDGES artifacts and update knowledge graph
 */
export async function consumeKgEdgesArtifacts(): Promise<{ processed: number; entities: number; edges: number; errors: number; entitiesFailed: number; edgesFailed: number }> {
  const artifacts = getUnprocessedArtifactsByType("KG_EDGES");
  let processed = 0;
  let entitiesCreated = 0;
  let edgesCreated = 0;
  let errors = 0;
  let entitiesFailed = 0;
  let edgesFailed = 0;

  const entityTypeMap: Record<string, EntityType> = {
    "PERSON": "PERSON",
    "PLACE": "LOCATION",
    "ORG": "ORGANIZATION",
    "DEVICE": "PRODUCT",
    "PROJECT": "PROJECT",
    "OTHER": "OTHER",
  };

  const relationMap: Record<string, EntityRelationshipType> = {
    "OWNS": "HAS",
    "USES": "HAS",
    "LIKES": "MENTIONS",
    "WORKS_ON": "COLLABORATES_WITH",
    "RELATED_TO": "RELATES_TO",
  };

  for (const artifact of artifacts) {
    let payload: KgEdgesPayload;
    let allItemsSucceeded = true;
    const entityIdMap = new Map<string, string>();
    let currentEntitiesCreated = 0;
    let currentEdgesCreated = 0;
    
    try {
      // Parse JSON with try/catch
      let rawPayload: unknown;
      try {
        rawPayload = JSON.parse(artifact.payloadJson);
      } catch (parseError) {
        console.error(`[ArtifactConsumer] Failed to parse JSON for KG_EDGES artifact ${artifact.id}:`, parseError);
        errors++;
        continue;
      }
      
      // Validate payload structure with Zod
      const validationResult = kgEdgesPayloadSchema.safeParse(rawPayload);
      if (!validationResult.success) {
        console.error(`[ArtifactConsumer] Validation failed for KG_EDGES artifact ${artifact.id}:`, validationResult.error.format());
        errors++;
        continue;
      }
      payload = validationResult.data;

      // Process entities
      for (const entity of payload.entities) {
        try {
          const existing = getEntityByLabel(entity.name);
          if (existing) {
            entityIdMap.set(entity.id, existing.id);
          } else {
            const entityType = entityTypeMap[entity.type] || "OTHER";
            const created = createEntity({
              type: entityType,
              label: entity.name,
              canonicalId: entity.id,
              metadata: JSON.stringify({ aliases: entity.aliases }),
            });
            entityIdMap.set(entity.id, created.id);
            currentEntitiesCreated++;
            console.log(`[ArtifactConsumer] Created entity: ${entity.name} (${entityType})`);
          }
        } catch (itemError) {
          allItemsSucceeded = false;
          entitiesFailed++;
          console.error(`[ArtifactConsumer] Failed to create entity "${entity.name}" for artifact ${artifact.id}:`, itemError);
        }
      }

      // Process edges
      for (const edge of payload.edges) {
        try {
          const sourceId = entityIdMap.get(edge.from);
          const targetId = entityIdMap.get(edge.to);
          
          if (sourceId && targetId) {
            const relType = relationMap[edge.relation] || "RELATES_TO";
            createEntityLink({
              sourceEntityId: sourceId,
              targetEntityId: targetId,
              relationshipType: relType,
              weight: edge.confidence,
              firstSeenAt: new Date().toISOString(),
              lastSeenAt: new Date().toISOString(),
              metadata: JSON.stringify({ evidence: edge.evidence_message_ids }),
            });
            currentEdgesCreated++;
          } else {
            console.warn(`[ArtifactConsumer] Skipping edge ${edge.from} -> ${edge.to}: entity not found in map`);
          }
        } catch (itemError) {
          allItemsSucceeded = false;
          edgesFailed++;
          console.error(`[ArtifactConsumer] Failed to create edge ${edge.from} -> ${edge.to} for artifact ${artifact.id}:`, itemError);
        }
      }
      
      // Only mark as processed if ALL items succeeded
      if (allItemsSucceeded) {
        markArtifactProcessed(artifact.id);
        processed++;
        entitiesCreated += currentEntitiesCreated;
        edgesCreated += currentEdgesCreated;
      } else {
        console.warn(`[ArtifactConsumer] Artifact ${artifact.id} partially failed - not marking as processed for retry`);
        errors++;
      }
    } catch (error) {
      console.error(`[ArtifactConsumer] Error processing KG_EDGES artifact ${artifact.id}:`, error);
      errors++;
    }
  }

  if (processed > 0 || errors > 0) {
    console.log(`[ArtifactConsumer] KG_EDGES: processed=${processed}, errors=${errors}, entities=${entitiesCreated}, edges=${edgesCreated}, entitiesFailed=${entitiesFailed}, edgesFailed=${edgesFailed}`);
  }

  return { processed, entities: entitiesCreated, edges: edgesCreated, errors, entitiesFailed, edgesFailed };
}

/**
 * Consume FEEDBACK_FIX artifacts and log improvements
 */
export async function consumeFeedbackFixArtifacts(): Promise<{ processed: number; fixes: number; errors: number; fixesFailed: number }> {
  const artifacts = getUnprocessedArtifactsByType("FEEDBACK_FIX");
  let processed = 0;
  let fixesLogged = 0;
  let errors = 0;
  let fixesFailed = 0;

  for (const artifact of artifacts) {
    let payload: FeedbackFixPayload;
    let allItemsSucceeded = true;
    let currentFixesLogged = 0;
    
    try {
      // Parse JSON with try/catch
      let rawPayload: unknown;
      try {
        rawPayload = JSON.parse(artifact.payloadJson);
      } catch (parseError) {
        console.error(`[ArtifactConsumer] Failed to parse JSON for FEEDBACK_FIX artifact ${artifact.id}:`, parseError);
        errors++;
        continue;
      }
      
      // Validate payload structure with Zod
      const validationResult = feedbackFixPayloadSchema.safeParse(rawPayload);
      if (!validationResult.success) {
        console.error(`[ArtifactConsumer] Validation failed for FEEDBACK_FIX artifact ${artifact.id}:`, validationResult.error.format());
        errors++;
        continue;
      }
      payload = validationResult.data;
      
      // Process each fix
      for (const fix of payload.fixes) {
        try {
          console.log(`[ArtifactConsumer] Feedback fix for message ${fix.message_id}:`);
          console.log(`  Root cause: ${fix.root_cause || "unknown"}`);
          console.log(`  Better response: ${fix.better_response?.substring(0, 100) || "none"}...`);
          console.log(`  Tool plan: ${fix.better_tool_plan?.join(" -> ") || "none"}`);
          
          if (fix.new_eval_testcase) {
            console.log(`  New test case: "${fix.new_eval_testcase.prompt?.substring(0, 50) || "none"}..."`);
          }
          
          currentFixesLogged++;
        } catch (itemError) {
          allItemsSucceeded = false;
          fixesFailed++;
          console.error(`[ArtifactConsumer] Failed to process fix for message ${fix.message_id} in artifact ${artifact.id}:`, itemError);
        }
      }
      
      // Only mark as processed if ALL items succeeded
      if (allItemsSucceeded) {
        markArtifactProcessed(artifact.id);
        processed++;
        fixesLogged += currentFixesLogged;
      } else {
        console.warn(`[ArtifactConsumer] Artifact ${artifact.id} partially failed - not marking as processed for retry`);
        errors++;
      }
    } catch (error) {
      console.error(`[ArtifactConsumer] Error processing FEEDBACK_FIX artifact ${artifact.id}:`, error);
      errors++;
    }
  }

  if (processed > 0 || errors > 0) {
    console.log(`[ArtifactConsumer] FEEDBACK_FIX: processed=${processed}, errors=${errors}, fixes=${fixesLogged}, fixesFailed=${fixesFailed}`);
  }

  return { processed, fixes: fixesLogged, errors, fixesFailed };
}

/**
 * Consume CORE_CONCEPT artifacts and extract/update concepts
 */
export async function consumeCoreConceptArtifacts(): Promise<{ processed: number; conceptsCreated: number; conceptsUpdated: number; errors: number }> {
  const artifacts = getUnprocessedArtifactsByType("CORE_CONCEPT");
  let processed = 0;
  let totalConceptsCreated = 0;
  let totalConceptsUpdated = 0;
  let errors = 0;

  for (const artifact of artifacts) {
    try {
      const result = await processConceptReflectionBatchResult(
        artifact.batchJobId,
        artifact.payloadJson
      );
      
      totalConceptsCreated += result.conceptsCreated;
      totalConceptsUpdated += result.conceptsUpdated;
      markArtifactProcessed(artifact.id);
      processed++;
    } catch (error) {
      console.error(`[ArtifactConsumer] Error processing CORE_CONCEPT artifact ${artifact.id}:`, error);
      errors++;
    }
  }

  if (processed > 0 || errors > 0) {
    console.log(`[ArtifactConsumer] CORE_CONCEPT: processed=${processed}, errors=${errors}, created=${totalConceptsCreated}, updated=${totalConceptsUpdated}`);
  }

  return { processed, conceptsCreated: totalConceptsCreated, conceptsUpdated: totalConceptsUpdated, errors };
}

/**
 * Consume all unprocessed artifacts
 */
export async function consumeAllArtifacts(): Promise<{
  memorySummaries: { processed: number; errors: number; itemsCreated: number; itemsFailed: number };
  kgEdges: { processed: number; entities: number; edges: number; errors: number; entitiesFailed: number; edgesFailed: number };
  feedbackFixes: { processed: number; fixes: number; errors: number; fixesFailed: number };
  coreConcepts: { processed: number; conceptsCreated: number; conceptsUpdated: number; errors: number };
}> {
  console.log("[ArtifactConsumer] Consuming all unprocessed artifacts...");
  
  const memorySummaries = await consumeMemorySummaryArtifacts();
  const kgEdges = await consumeKgEdgesArtifacts();
  const feedbackFixes = await consumeFeedbackFixArtifacts();
  const coreConcepts = await consumeCoreConceptArtifacts();
  
  return { memorySummaries, kgEdges, feedbackFixes, coreConcepts };
}

export const ArtifactConsumer = {
  consumeMemorySummaryArtifacts,
  consumeKgEdgesArtifacts,
  consumeFeedbackFixArtifacts,
  consumeCoreConceptArtifacts,
  consumeAllArtifacts,
};

/**
 * Artifact Consumer Service
 * 
 * Consumes batch processing artifacts and integrates them into the system:
 * - MEMORY_SUMMARY: Creates memory notes from summaries
 * - KG_EDGES: Updates knowledge graph with entity relationships  
 * - FEEDBACK_FIX: Logs improvements from negative feedback analysis
 */

import {
  getUnprocessedArtifactsByType,
  markArtifactProcessed,
  createMemoryNote,
  createEntity,
  createEntityLink,
  getEntityByLabel,
} from "../db";
import type { 
  BatchArtifact,
  MemorySummaryPayload,
  KgEdgesPayload,
  FeedbackFixPayload,
  EntityType,
  EntityRelationshipType,
} from "@shared/schema";

/**
 * Consume MEMORY_SUMMARY artifacts and create memory notes
 */
export async function consumeMemorySummaryArtifacts(): Promise<{ processed: number; errors: number }> {
  const artifacts = getUnprocessedArtifactsByType("MEMORY_SUMMARY");
  let processed = 0;
  let errors = 0;

  for (const artifact of artifacts) {
    try {
      const payload = JSON.parse(artifact.payloadJson) as MemorySummaryPayload;
      
      for (const summary of payload.summaries || []) {
        const tags = summary.tags?.join(", ") || "";
        const content = summary.summary;
        
        createMemoryNote({
          type: "fact",
          content,
          context: `Batch enrichment from ${payload.day_key}. Tags: ${tags}. Importance: ${summary.importance}`,
          source: "batch_enrichment",
        });
        
        console.log(`[BatchFactory] Created memory note from batch: "${content.substring(0, 50)}..."`);
      }
      
      markArtifactProcessed(artifact.id);
      processed++;
    } catch (error) {
      console.error(`[BatchFactory] Error processing MEMORY_SUMMARY artifact ${artifact.id}:`, error);
      errors++;
    }
  }

  if (processed > 0) {
    console.log(`[BatchFactory] Processed ${processed} MEMORY_SUMMARY artifacts (${errors} errors)`);
  }

  return { processed, errors };
}

/**
 * Consume KG_EDGES artifacts and update knowledge graph
 */
export async function consumeKgEdgesArtifacts(): Promise<{ processed: number; entities: number; edges: number; errors: number }> {
  const artifacts = getUnprocessedArtifactsByType("KG_EDGES");
  let processed = 0;
  let entitiesCreated = 0;
  let edgesCreated = 0;
  let errors = 0;

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
    try {
      const payload = JSON.parse(artifact.payloadJson) as KgEdgesPayload;
      const entityIdMap = new Map<string, string>();

      for (const entity of payload.entities || []) {
        const existing = getEntityByLabel(entity.name);
        if (existing) {
          entityIdMap.set(entity.id, existing.id);
        } else {
          const entityType = entityTypeMap[entity.type] || "OTHER";
          const created = createEntity({
            type: entityType,
            label: entity.name,
            canonicalId: entity.id,
            metadata: JSON.stringify({ aliases: entity.aliases || [] }),
          });
          entityIdMap.set(entity.id, created.id);
          entitiesCreated++;
          console.log(`[BatchFactory] Created entity: ${entity.name} (${entityType})`);
        }
      }

      for (const edge of payload.edges || []) {
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
            metadata: JSON.stringify({ evidence: edge.evidence_message_ids || [] }),
          });
          edgesCreated++;
        }
      }
      
      markArtifactProcessed(artifact.id);
      processed++;
    } catch (error) {
      console.error(`[BatchFactory] Error processing KG_EDGES artifact ${artifact.id}:`, error);
      errors++;
    }
  }

  if (processed > 0) {
    console.log(`[BatchFactory] Processed ${processed} KG_EDGES artifacts: ${entitiesCreated} entities, ${edgesCreated} edges (${errors} errors)`);
  }

  return { processed, entities: entitiesCreated, edges: edgesCreated, errors };
}

/**
 * Consume FEEDBACK_FIX artifacts and log improvements
 */
export async function consumeFeedbackFixArtifacts(): Promise<{ processed: number; fixes: number; errors: number }> {
  const artifacts = getUnprocessedArtifactsByType("FEEDBACK_FIX");
  let processed = 0;
  let fixesLogged = 0;
  let errors = 0;

  for (const artifact of artifacts) {
    try {
      const payload = JSON.parse(artifact.payloadJson) as FeedbackFixPayload;
      
      for (const fix of payload.fixes || []) {
        console.log(`[BatchFactory] Feedback fix for message ${fix.message_id}:`);
        console.log(`  Root cause: ${fix.root_cause}`);
        console.log(`  Better response: ${fix.better_response?.substring(0, 100)}...`);
        console.log(`  Tool plan: ${fix.better_tool_plan?.join(" -> ") || "none"}`);
        
        if (fix.new_eval_testcase) {
          console.log(`  New test case: "${fix.new_eval_testcase.prompt?.substring(0, 50)}..."`);
        }
        
        fixesLogged++;
      }
      
      markArtifactProcessed(artifact.id);
      processed++;
    } catch (error) {
      console.error(`[BatchFactory] Error processing FEEDBACK_FIX artifact ${artifact.id}:`, error);
      errors++;
    }
  }

  if (processed > 0) {
    console.log(`[BatchFactory] Processed ${processed} FEEDBACK_FIX artifacts: ${fixesLogged} fixes logged (${errors} errors)`);
  }

  return { processed, fixes: fixesLogged, errors };
}

/**
 * Consume all unprocessed artifacts
 */
export async function consumeAllArtifacts(): Promise<{
  memorySummaries: { processed: number; errors: number };
  kgEdges: { processed: number; entities: number; edges: number; errors: number };
  feedbackFixes: { processed: number; fixes: number; errors: number };
}> {
  console.log("[BatchFactory] Consuming all unprocessed artifacts...");
  
  const memorySummaries = await consumeMemorySummaryArtifacts();
  const kgEdges = await consumeKgEdgesArtifacts();
  const feedbackFixes = await consumeFeedbackFixArtifacts();
  
  return { memorySummaries, kgEdges, feedbackFixes };
}

export const ArtifactConsumer = {
  consumeMemorySummaryArtifacts,
  consumeKgEdgesArtifacts,
  consumeFeedbackFixArtifacts,
  consumeAllArtifacts,
};

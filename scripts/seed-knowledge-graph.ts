/**
 * Seed script for Knowledge Graph - creates demo entities and relationships
 * Run with: npm run seed:kg
 */

import * as graphService from "../server/graph-service";

async function seedKnowledgeGraph() {
  console.log("[KG Seed] Starting Knowledge Graph seed...\n");

  try {
    // Create entities
    console.log("[KG Seed] Creating entities...");

    const nateId = await graphService.upsertEntity({
      entityType: "PERSON",
      name: "Nate Johnson",
      attributes: { role: "ZEKE owner", timezone: "EST" },
    });
    console.log(`  Created: Nate Johnson (${nateId})`);

    const zeekId = await graphService.upsertEntity({
      entityType: "DEVICE",
      name: "ZEKE",
      attributes: { type: "AI Assistant", version: "1.0" },
    });
    console.log(`  Created: ZEKE (${zeekId})`);

    const bostonId = await graphService.upsertEntity({
      entityType: "PLACE",
      name: "Boston",
      attributes: { state: "MA", country: "USA" },
    });
    console.log(`  Created: Boston (${bostonId})`);

    const masonryId = await graphService.upsertEntity({
      entityType: "CONCEPT",
      name: "Freemasonry",
      attributes: { category: "hobby", interest_level: "high" },
    });
    console.log(`  Created: Freemasonry (${masonryId})`);

    const pythonId = await graphService.upsertEntity({
      entityType: "CONCEPT",
      name: "Python Programming",
      attributes: { category: "skill", expertise: "expert" },
    });
    console.log(`  Created: Python Programming (${pythonId})\n`);

    // Create evidence
    console.log("[KG Seed] Creating evidence...");

    const evidence1Id = await graphService.upsertEvidence({
      sourceType: "CHAT_MESSAGE",
      sourceId: "msg_001",
      sourceExcerpt: "I'm going to the lodge meeting tonight",
    });
    console.log(`  Created evidence: ${evidence1Id}`);

    const evidence2Id = await graphService.upsertEvidence({
      sourceType: "TASK",
      sourceId: "task_Boston",
      sourceExcerpt: "Visit Boston for the conference",
    });
    console.log(`  Created evidence: ${evidence2Id}\n`);

    // Create relationships
    console.log("[KG Seed] Creating relationships...");

    const rel1 = await graphService.upsertRelationship({
      fromEntityId: nateId,
      toEntityId: zeekId,
      relType: "USES",
      confidence: 0.95,
      evidenceId: evidence1Id,
      properties: { interaction_type: "primary_user" },
    });
    console.log(`  Nate -[USES]-> ZEKE (confidence: 0.95)`);

    const rel2 = await graphService.upsertRelationship({
      fromEntityId: nateId,
      toEntityId: bostonId,
      relType: "LOCATED_IN",
      confidence: 0.9,
      evidenceId: evidence2Id,
    });
    console.log(`  Nate -[LOCATED_IN]-> Boston (confidence: 0.9)`);

    const rel3 = await graphService.upsertRelationship({
      fromEntityId: nateId,
      toEntityId: masonryId,
      relType: "PREFERS",
      confidence: 0.85,
      properties: { hobby: true, active: true },
    });
    console.log(`  Nate -[PREFERS]-> Freemasonry (confidence: 0.85)`);

    const rel4 = await graphService.upsertRelationship({
      fromEntityId: nateId,
      toEntityId: pythonId,
      relType: "WORKS_ON",
      confidence: 0.95,
    });
    console.log(`  Nate -[WORKS_ON]-> Python Programming (confidence: 0.95)\n`);

    // Get neighborhood
    console.log("[KG Seed] Testing neighborhood traversal...");
    const neighborhood = await graphService.getNeighborhood(nateId, 1, 100);
    console.log(`  Neighborhood stats: ${neighborhood.stats.totalNodes} nodes, ${neighborhood.stats.totalRelationships} relationships\n`);

    // Get stats
    console.log("[KG Seed] Testing graph statistics...");
    const stats = await graphService.getGraphStats();
    console.log(`  Total entities: ${stats.totalEntities}`);
    console.log(`  Total relationships: ${stats.totalRelationships}`);
    console.log(`  Total evidence: ${stats.totalEvidence}`);
    console.log(`  Average confidence: ${stats.averageConfidence.toFixed(2)}\n`);

    // Test conflict creation
    console.log("[KG Seed] Testing conflict resolution...");
    const conflictEvidence = await graphService.upsertEvidence({
      sourceType: "CHAT_MESSAGE",
      sourceId: "msg_conflict",
      sourceExcerpt: "Actually, Nate moved to New York",
    });

    const { contestedId, newId } = await graphService.contestRelationship(rel2, {
      fromEntityId: nateId,
      toEntityId: nateId, // Placeholder - would be New York entity
      relType: "LOCATED_IN",
      confidence: 0.92,
      evidenceId: conflictEvidence,
    });
    console.log(`  Created contested claim: ${contestedId} -> ${newId}\n`);

    console.log("[KG Seed] Seed complete! Knowledge Graph initialized.\n");
  } catch (error) {
    console.error("[KG Seed] Error during seeding:", error);
    process.exit(1);
  }
}

seedKnowledgeGraph().catch(console.error);

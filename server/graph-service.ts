import { v4 as uuidv4 } from "uuid";
import { eq, and, or, desc, asc, sql, lte, inArray } from "drizzle-orm";
import { db } from "./db";
import * as schema from "@shared/schema";
import type {
  KgEntity,
  InsertKgEntity,
  KgEvidence,
  InsertKgEvidence,
  KgRelationship,
  InsertKgRelationship,
  KgEntityType,
  KgRelationshipType,
  KgRelationshipStatus,
  EvidenceSourceType,
} from "@shared/schema";

// Normalize entity names for canonical keys
export function normalizeEntityName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/-/g, " ")        // Replace hyphens with spaces first
    .replace(/\s+/g, " ")      // Collapse multiple spaces
    .replace(/[^\w\s]/g, "");  // Remove most punctuation
}

// Generate canonical key from entity type and normalized name
export function generateCanonicalKey(entityType: KgEntityType, name: string): string {
  const normalized = normalizeEntityName(name);
  return `${entityType}:${normalized}`;
}

// Evidence operations
export async function upsertEvidence(input: InsertKgEvidence): Promise<string> {
  const id = uuidv4();
  const now = new Date().toISOString();

  const [result] = await db
    .insert(schema.kgEvidence)
    .values({
      ...input,
      id,
      createdAt: now,
    })
    .returning();

  return result.id;
}

export async function getEvidenceById(id: string): Promise<KgEvidence | undefined> {
  const [result] = await db
    .select()
    .from(schema.kgEvidence)
    .where(eq(schema.kgEvidence.id, id));
  return result;
}

// Entity operations
export async function upsertEntity(input: {
  entityType: KgEntityType;
  name: string;
  attributes?: Record<string, unknown>;
}): Promise<string> {
  const normalized = normalizeEntityName(input.name);
  const canonicalKey = generateCanonicalKey(input.entityType, input.name);
  const now = new Date().toISOString();

  // Try to find existing entity by canonical key
  const [existing] = await db
    .select()
    .from(schema.kgEntities)
    .where(eq(schema.kgEntities.canonicalKey, canonicalKey));

  if (existing) {
    // Update attributes if provided
    if (input.attributes) {
      await db
        .update(schema.kgEntities)
        .set({
          attributes: JSON.stringify(input.attributes),
          updatedAt: now,
        })
        .where(eq(schema.kgEntities.id, existing.id));
    }
    return existing.id;
  }

  // Create new entity
  const id = uuidv4();
  const [result] = await db
    .insert(schema.kgEntities)
    .values({
      id,
      entityType: input.entityType,
      name: input.name,
      normalizedName: normalized,
      canonicalKey,
      attributes: input.attributes ? JSON.stringify(input.attributes) : "{}",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return result.id;
}

export async function getEntityById(id: string): Promise<KgEntity | undefined> {
  const [result] = await db
    .select()
    .from(schema.kgEntities)
    .where(eq(schema.kgEntities.id, id));
  return result;
}

export async function searchEntities(q: string, limit: number = 50): Promise<KgEntity[]> {
  const normalized = normalizeEntityName(q);
  const results = await db
    .select()
    .from(schema.kgEntities)
    .where(
      or(
        sql`${schema.kgEntities.normalizedName} ILIKE ${"%" + normalized + "%"}`,
        sql`${schema.kgEntities.name} ILIKE ${"%" + q + "%"}`
      )
    )
    .limit(limit);
  return results;
}

// Relationship operations with idempotency
export async function upsertRelationship(input: {
  fromEntityId: string;
  toEntityId: string;
  relType: KgRelationshipType;
  confidence: number;
  status?: KgRelationshipStatus;
  evidenceId?: string;
  properties?: Record<string, unknown>;
}): Promise<string> {
  const now = new Date().toISOString();
  const status = input.status || "ACTIVE";

  // Find existing relationship (same entities, same relationship type, same status)
  const [existing] = await db
    .select()
    .from(schema.kgRelationships)
    .where(
      and(
        eq(schema.kgRelationships.fromEntityId, input.fromEntityId),
        eq(schema.kgRelationships.toEntityId, input.toEntityId),
        eq(schema.kgRelationships.relType, input.relType),
        eq(schema.kgRelationships.status, status)
      )
    );

  if (existing) {
    // Update existing relationship: bump last_seen_at, cap confidence at 1.0, optionally update evidence
    const newConfidence = Math.min(
      parseFloat(existing.confidence) + 0.05,
      1.0
    ).toString();

    await db
      .update(schema.kgRelationships)
      .set({
        confidence: newConfidence,
        lastSeenAt: now,
        evidenceId: input.evidenceId || existing.evidenceId,
        properties: input.properties
          ? JSON.stringify(input.properties)
          : existing.properties,
      })
      .where(eq(schema.kgRelationships.id, existing.id));

    return existing.id;
  }

  // Create new relationship
  const id = uuidv4();
  const [result] = await db
    .insert(schema.kgRelationships)
    .values({
      id,
      fromEntityId: input.fromEntityId,
      toEntityId: input.toEntityId,
      relType: input.relType,
      confidence: input.confidence.toString(),
      status,
      lastSeenAt: now,
      evidenceId: input.evidenceId,
      properties: input.properties ? JSON.stringify(input.properties) : "{}",
      createdAt: now,
    })
    .returning();

  return result.id;
}

export async function getRelationshipById(id: string): Promise<KgRelationship | undefined> {
  const [result] = await db
    .select()
    .from(schema.kgRelationships)
    .where(eq(schema.kgRelationships.id, id));
  return result;
}

// Neighborhood traversal (depth-based with limit)
export interface GraphNode {
  entity: KgEntity;
  depth: number;
  relationships: {
    relationship: KgRelationship;
    direction: "outgoing" | "incoming";
    linkedEntity: KgEntity;
  }[];
}

export interface GraphNeighborhood {
  center: KgEntity;
  nodes: GraphNode[];
  relationships: KgRelationship[];
  evidence: Record<string, KgEvidence>;
  stats: {
    totalNodes: number;
    totalRelationships: number;
    maxDepth: number;
  };
}

export async function getNeighborhood(
  entityId: string,
  depth: number = 1,
  limit: number = 100,
  minConfidence?: number,
  status?: KgRelationshipStatus
): Promise<GraphNeighborhood> {
  // Get center entity
  const center = await getEntityById(entityId);
  if (!center) {
    throw new Error(`Entity ${entityId} not found`);
  }

  const nodes = new Map<string, GraphNode>();
  const relationships: KgRelationship[] = [];
  const visitedEntities = new Set<string>([entityId]);
  const evidenceIds = new Set<string>();

  // Helper to fetch relationships with filters
  async function getRelationshipsForEntity(
    eid: string,
    direction: "outgoing" | "incoming"
  ) {
    const conditions = [];

    if (direction === "outgoing") {
      conditions.push(eq(schema.kgRelationships.fromEntityId, eid));
    } else {
      conditions.push(eq(schema.kgRelationships.toEntityId, eid));
    }

    if (status) {
      conditions.push(eq(schema.kgRelationships.status, status));
    }

    const results = await db
      .select()
      .from(schema.kgRelationships)
      .where(and(...conditions))
      .limit(limit);

    return results;
  }

  // BFS traversal
  const queue: { entityId: string; depth: number }[] = [{ entityId, depth: 0 }];

  while (queue.length > 0 && visitedEntities.size < limit) {
    const { entityId: eid, depth: currentDepth } = queue.shift()!;

    if (currentDepth >= depth) break;

    // Get outgoing and incoming relationships
    const outgoing = await getRelationshipsForEntity(eid, "outgoing");
    const incoming = await getRelationshipsForEntity(eid, "incoming");

    for (const rel of [...outgoing, ...incoming]) {
      // Filter by confidence if provided
      if (minConfidence && parseFloat(rel.confidence) < minConfidence) {
        continue;
      }

      const linkedEntityId =
        rel.fromEntityId === eid ? rel.toEntityId : rel.fromEntityId;
      const direction = rel.fromEntityId === eid ? "outgoing" : "incoming";

      if (!visitedEntities.has(linkedEntityId)) {
        visitedEntities.add(linkedEntityId);
        queue.push({ entityId: linkedEntityId, depth: currentDepth + 1 });
      }

      // Store relationship
      relationships.push(rel);
      if (rel.evidenceId) {
        evidenceIds.add(rel.evidenceId);
      }

      // Get linked entity and add to nodes
      const linkedEntity = await getEntityById(linkedEntityId);
      if (linkedEntity) {
        if (!nodes.has(linkedEntityId)) {
          nodes.set(linkedEntityId, {
            entity: linkedEntity,
            depth: currentDepth + 1,
            relationships: [],
          });
        }

        const node = nodes.get(linkedEntityId)!;
        node.relationships.push({
          relationship: rel,
          direction,
          linkedEntity: await getEntityById(
            direction === "outgoing" ? rel.toEntityId : rel.fromEntityId
          )!,
        });
      }
    }
  }

  // Fetch all evidence
  const evidence: Record<string, KgEvidence> = {};
  for (const evidenceId of evidenceIds) {
    const ev = await getEvidenceById(evidenceId);
    if (ev) {
      evidence[ev.id] = ev;
    }
  }

  return {
    center,
    nodes: Array.from(nodes.values()),
    relationships,
    evidence,
    stats: {
      totalNodes: visitedEntities.size,
      totalRelationships: relationships.length,
      maxDepth: depth,
    },
  };
}

// Conflict resolution: mark existing ACTIVE relationship as CONTESTED, create new claim
export async function contestRelationship(
  relationshipId: string,
  newInput: {
    fromEntityId: string;
    toEntityId: string;
    relType: KgRelationshipType;
    confidence: number;
    evidenceId?: string;
    properties?: Record<string, unknown>;
  }
): Promise<{ contestedId: string; newId: string }> {
  const now = new Date().toISOString();

  // Mark existing as CONTESTED
  await db
    .update(schema.kgRelationships)
    .set({
      status: "CONTESTED",
      updatedAt: now,
    })
    .where(eq(schema.kgRelationships.id, relationshipId));

  // Create new claim with ACTIVE status
  const newId = await upsertRelationship({
    ...newInput,
    status: "ACTIVE",
  });

  return { contestedId: relationshipId, newId };
}

// Retract a relationship claim
export async function retractRelationship(relationshipId: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(schema.kgRelationships)
    .set({
      status: "RETRACTED",
      updatedAt: now,
    })
    .where(eq(schema.kgRelationships.id, relationshipId));
}

// Query: Find all CONTESTED relationships
export async function getContestedRelationships(): Promise<
  Array<{
    active: KgRelationship;
    contested: KgRelationship[];
  }>
> {
  const contested = await db
    .select()
    .from(schema.kgRelationships)
    .where(eq(schema.kgRelationships.status, "CONTESTED"));

  const grouped = new Map<string, KgRelationship[]>();
  for (const rel of contested) {
    // Group by the relationship "key" (from + to + relType)
    const key = `${rel.fromEntityId}:${rel.toEntityId}:${rel.relType}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(rel);
  }

  // For each group, find the ACTIVE version
  const result = [];
  for (const [key, contestedRels] of grouped) {
    const [activeRel] = await db
      .select()
      .from(schema.kgRelationships)
      .where(
        and(
          eq(schema.kgRelationships.status, "ACTIVE"),
          eq(
            schema.kgRelationships.fromEntityId,
            contestedRels[0].fromEntityId
          ),
          eq(schema.kgRelationships.toEntityId, contestedRels[0].toEntityId),
          eq(schema.kgRelationships.relType, contestedRels[0].relType)
        )
      );

    if (activeRel) {
      result.push({ active: activeRel, contested: contestedRels });
    }
  }

  return result;
}

// Query: Get statistics about the graph
export async function getGraphStats(): Promise<{
  totalEntities: number;
  totalRelationships: number;
  totalEvidence: number;
  relationshipsByStatus: Record<KgRelationshipStatus, number>;
  relationshipsByType: Record<KgRelationshipType, number>;
  entitiesByType: Record<KgEntityType, number>;
  averageConfidence: number;
}> {
  // Total entities
  const entityCountResult = await db.execute(
    sql`SELECT COUNT(*) as count FROM ${schema.kgEntities}`
  );
  const totalEntities = entityCountResult.rows[0]?.count ?? 0;

  // Total relationships
  const relCountResult = await db.execute(
    sql`SELECT COUNT(*) as count FROM ${schema.kgRelationships}`
  );
  const totalRelationships = relCountResult.rows[0]?.count ?? 0;

  // Total evidence
  const evidenceCountResult = await db.execute(
    sql`SELECT COUNT(*) as count FROM ${schema.kgEvidence}`
  );
  const totalEvidence = evidenceCountResult.rows[0]?.count ?? 0;

  // By status
  const statusCountsResult = await db.execute(
    sql`SELECT status, COUNT(*) as count FROM ${schema.kgRelationships} GROUP BY status`
  );

  // By type
  const typeCountsResult = await db.execute(
    sql`SELECT rel_type, COUNT(*) as count FROM ${schema.kgRelationships} GROUP BY rel_type`
  );

  // By entity type
  const entityTypeCountsResult = await db.execute(
    sql`SELECT entity_type, COUNT(*) as count FROM ${schema.kgEntities} GROUP BY entity_type`
  );

  // Average confidence
  const avgResult = await db.execute(
    sql`SELECT AVG(confidence::float) as avg FROM ${schema.kgRelationships}`
  );
  const avg = avgResult.rows[0]?.avg ?? 0;

  return {
    totalEntities: parseInt(String(totalEntities)),
    totalRelationships: parseInt(String(totalRelationships)),
    totalEvidence: parseInt(String(totalEvidence)),
    relationshipsByStatus: (statusCountsResult.rows as any[]).reduce(
      (acc, row) => {
        acc[row.status] = parseInt(row.count);
        return acc;
      },
      {} as Record<KgRelationshipStatus, number>
    ),
    relationshipsByType: (typeCountsResult.rows as any[]).reduce(
      (acc, row) => {
        acc[row.rel_type] = parseInt(row.count);
        return acc;
      },
      {} as Record<KgRelationshipType, number>
    ),
    entitiesByType: (entityTypeCountsResult.rows as any[]).reduce(
      (acc, row) => {
        acc[row.entity_type] = parseInt(row.count);
        return acc;
      },
      {} as Record<KgEntityType, number>
    ),
    averageConfidence: avg ? parseFloat(String(avg)) : 0,
  };
}

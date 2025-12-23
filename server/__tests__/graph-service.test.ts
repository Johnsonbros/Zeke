/**
 * Knowledge Graph Service Tests
 * 
 * Test 1: Entity normalization + canonical_key determinism
 * Test 2: Upsert entity idempotency
 * Test 3: Relationship upsert updates last_seen_at instead of duplicating
 * Test 4: Neighborhood query returns consistent nodes/edges and includes evidence
 * 
 * Run with: npx vitest server/__tests__/graph-service.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as graphService from "../graph-service";
import { db } from "../db";
import * as schema from "@shared/schema";
import { eq, and } from "drizzle-orm";

describe("Knowledge Graph Service", () => {
  // Cleanup function
  async function cleanup() {
    try {
      // Delete in order to avoid FK constraints
      await db.delete(schema.kgRelationships);
      await db.delete(schema.kgEntities);
      await db.delete(schema.kgEvidence);
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  // ============================================
  // TEST 1: Entity Normalization + Canonical Key Determinism
  // ============================================
  describe("Entity Normalization & Canonical Keys", () => {
    it("should normalize entity names consistently", () => {
      // Test various inputs that should normalize to the same canonical key
      const inputs = [
        "Nate Johnson",
        "  nate johnson  ",
        "NATE JOHNSON",
        "nate  johnson",
        "Nate-Johnson", // hyphen removed
      ];

      const normalized = inputs.map((name) =>
        graphService.normalizeEntityName(name)
      );

      // All should normalize to same value
      expect(normalized[0]).toBe("nate johnson");
      expect(normalized.every((n) => n === normalized[0])).toBe(true);
    });

    it("should generate deterministic canonical keys", () => {
      const entityType = "PERSON" as const;
      const names = [
        "Nate Johnson",
        "nate johnson",
        "  NATE JOHNSON  ",
      ];

      const keys = names.map((name) =>
        graphService.generateCanonicalKey(entityType, name)
      );

      // All should generate same canonical key
      expect(keys[0]).toBe("PERSON:nate johnson");
      expect(keys.every((k) => k === keys[0])).toBe(true);
    });

    it("should handle punctuation removal in normalization", () => {
      const input = "Johnson Bros. Plumbing & Drain Cleaning!";
      const normalized = graphService.normalizeEntityName(input);
      const key = graphService.generateCanonicalKey("ORG", input);

      // Punctuation should be removed
      expect(normalized).not.toContain(".");
      expect(normalized).not.toContain("&");
      expect(normalized).not.toContain("!");
      expect(key).toBe("ORG:" + normalized);
    });
  });

  // ============================================
  // TEST 2: Upsert Entity Idempotency
  // ============================================
  describe("Entity Upsert Idempotency", () => {
    it("should return same entity ID for identical inputs", async () => {
      const input = {
        entityType: "PERSON" as const,
        name: "Nate Johnson",
        attributes: { role: "owner" },
      };

      // First upsert
      const id1 = await graphService.upsertEntity(input);

      // Second upsert with same input
      const id2 = await graphService.upsertEntity(input);

      // Should return the same ID
      expect(id1).toBe(id2);

      // Verify only one entity exists in DB
      const entities = await db
        .select()
        .from(schema.kgEntities)
        .where(
          eq(
            schema.kgEntities.canonicalKey,
            graphService.generateCanonicalKey(input.entityType, input.name)
          )
        );

      expect(entities).toHaveLength(1);
      expect(entities[0].id).toBe(id1);
    });

    it("should return same ID for different case variations", async () => {
      const input1 = {
        entityType: "PERSON" as const,
        name: "Aurora Smith",
        attributes: {},
      };

      const input2 = {
        entityType: "PERSON" as const,
        name: "AURORA SMITH",
        attributes: {},
      };

      const id1 = await graphService.upsertEntity(input1);
      const id2 = await graphService.upsertEntity(input2);

      expect(id1).toBe(id2);
    });

    it("should return same ID for whitespace variations", async () => {
      const input1 = {
        entityType: "PLACE" as const,
        name: "Quincy, MA",
        attributes: { state: "MA" },
      };

      const input2 = {
        entityType: "PLACE" as const,
        name: "  quincy,  ma  ",
        attributes: { state: "MA" },
      };

      const id1 = await graphService.upsertEntity(input1);
      const id2 = await graphService.upsertEntity(input2);

      expect(id1).toBe(id2);
    });

    it("should update attributes without changing entity ID", async () => {
      const baseInput = {
        entityType: "ORG" as const,
        name: "Johnson Bros. Plumbing",
        attributes: { industry: "plumbing" },
      };

      // First upsert
      const id1 = await graphService.upsertEntity(baseInput);

      // Upsert with updated attributes
      const updatedInput = {
        ...baseInput,
        attributes: { industry: "plumbing", status: "active" },
      };
      const id2 = await graphService.upsertEntity(updatedInput);

      // Same ID
      expect(id1).toBe(id2);

      // Verify attributes were updated
      const entity = await graphService.getEntityById(id1);
      expect(entity).toBeDefined();
      expect(entity?.attributes).toHaveProperty("status", "active");
    });
  });

  // ============================================
  // TEST 3: Relationship Upsert + Last Seen Update
  // ============================================
  describe("Relationship Upsert & Last Seen Tracking", () => {
    it("should create new relationship on first upsert", async () => {
      // Create entities
      const entityId1 = await graphService.upsertEntity({
        entityType: "PERSON" as const,
        name: "Person A",
      });

      const entityId2 = await graphService.upsertEntity({
        entityType: "PERSON" as const,
        name: "Person B",
      });

      // Create relationship
      const relId = await graphService.upsertRelationship({
        fromEntityId: entityId1,
        toEntityId: entityId2,
        relType: "KNOWS" as const,
        confidence: 0.8,
        status: "ACTIVE",
      });

      // Verify created
      const rel = await graphService.getRelationshipById(relId);
      expect(rel).toBeDefined();
      expect(rel?.confidence).toBe("0.8");
      expect(rel?.status).toBe("ACTIVE");
      expect(rel?.firstSeenAt).toBe(rel?.lastSeenAt);
    });

    it("should NOT duplicate on second upsert, should update last_seen_at", async () => {
      // Create entities
      const entityId1 = await graphService.upsertEntity({
        entityType: "PERSON" as const,
        name: "Alice",
      });

      const entityId2 = await graphService.upsertEntity({
        entityType: "PERSON" as const,
        name: "Bob",
      });

      // First upsert
      const relId1 = await graphService.upsertRelationship({
        fromEntityId: entityId1,
        toEntityId: entityId2,
        relType: "LIKES" as const,
        confidence: 0.75,
        status: "ACTIVE",
      });

      const rel1 = await graphService.getRelationshipById(relId1);
      const firstLastSeen = rel1?.lastSeenAt;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second upsert (should update, not create)
      const relId2 = await graphService.upsertRelationship({
        fromEntityId: entityId1,
        toEntityId: entityId2,
        relType: "LIKES" as const,
        confidence: 0.75,
        status: "ACTIVE",
      });

      // Same relationship ID
      expect(relId1).toBe(relId2);

      const rel2 = await graphService.getRelationshipById(relId2);

      // Verify last_seen_at was updated
      expect(rel2?.lastSeenAt).not.toBe(firstLastSeen);
      expect(new Date(rel2?.lastSeenAt || "") > new Date(firstLastSeen || "")).toBe(
        true
      );

      // Verify no duplicate in DB
      const allRels = await db
        .select()
        .from(schema.kgRelationships)
        .where(
          and(
            eq(schema.kgRelationships.fromEntityId, entityId1),
            eq(schema.kgRelationships.toEntityId, entityId2),
            eq(schema.kgRelationships.relType, "LIKES")
          )
        );

      expect(allRels).toHaveLength(1);
    });

    it("should increment confidence on repeated upserts (capped at 1.0)", async () => {
      const entityId1 = await graphService.upsertEntity({
        entityType: "PERSON" as const,
        name: "Charlie",
      });

      const entityId2 = await graphService.upsertEntity({
        entityType: "PERSON" as const,
        name: "Diana",
      });

      // Start with 0.7 confidence
      let relId = await graphService.upsertRelationship({
        fromEntityId: entityId1,
        toEntityId: entityId2,
        relType: "WORKS_WITH" as const,
        confidence: 0.7,
        status: "ACTIVE",
      });

      let rel = await graphService.getRelationshipById(relId);
      expect(parseFloat(rel?.confidence || "0")).toBeCloseTo(0.7, 1);

      // Upsert again - should increment by 0.05
      relId = await graphService.upsertRelationship({
        fromEntityId: entityId1,
        toEntityId: entityId2,
        relType: "WORKS_WITH" as const,
        confidence: 0.7,
        status: "ACTIVE",
      });

      rel = await graphService.getRelationshipById(relId);
      expect(parseFloat(rel?.confidence || "0")).toBeCloseTo(0.75, 1);

      // Upsert multiple times to approach 1.0
      for (let i = 0; i < 10; i++) {
        await graphService.upsertRelationship({
          fromEntityId: entityId1,
          toEntityId: entityId2,
          relType: "WORKS_WITH" as const,
          confidence: 0.7,
          status: "ACTIVE",
        });
      }

      rel = await graphService.getRelationshipById(relId);
      // Should be capped at 1.0
      const confidence = parseFloat(rel?.confidence || "0");
      expect(confidence).toBeLessThanOrEqual(1.0);
      expect(confidence).toBeGreaterThan(0.8);
    });

    it("should treat different statuses as different relationships", async () => {
      const entityId1 = await graphService.upsertEntity({
        entityType: "PERSON" as const,
        name: "Eve",
      });

      const entityId2 = await graphService.upsertEntity({
        entityType: "PERSON" as const,
        name: "Frank",
      });

      // Create ACTIVE relationship
      const activeId = await graphService.upsertRelationship({
        fromEntityId: entityId1,
        toEntityId: entityId2,
        relType: "MANAGES" as const,
        confidence: 0.9,
        status: "ACTIVE",
      });

      // Try to create CONTESTED relationship with same entities/type
      const contestedId = await graphService.upsertRelationship({
        fromEntityId: entityId1,
        toEntityId: entityId2,
        relType: "MANAGES" as const,
        confidence: 0.7,
        status: "CONTESTED",
      });

      // Should create separate relationships
      expect(activeId).not.toBe(contestedId);

      // Verify both exist
      const active = await graphService.getRelationshipById(activeId);
      const contested = await graphService.getRelationshipById(contestedId);

      expect(active?.status).toBe("ACTIVE");
      expect(contested?.status).toBe("CONTESTED");
    });
  });

  // ============================================
  // TEST 4: Neighborhood Query
  // ============================================
  describe("Neighborhood Query with Evidence", () => {
    it("should return neighborhood with correct nodes and evidence", async () => {
      // Create entities
      const nateId = await graphService.upsertEntity({
        entityType: "PERSON" as const,
        name: "Nate",
      });

      const jbpId = await graphService.upsertEntity({
        entityType: "ORG" as const,
        name: "Johnson Bros Plumbing",
      });

      const quincyId = await graphService.upsertEntity({
        entityType: "PLACE" as const,
        name: "Quincy, MA",
      });

      // Create evidence
      const evidenceId = await graphService.upsertEvidence({
        sourceType: "CHAT_MESSAGE",
        sourceId: "msg_001",
        sourceExcerpt: "Nate owns Johnson Bros",
      });

      // Create relationships
      const relId1 = await graphService.upsertRelationship({
        fromEntityId: nateId,
        toEntityId: jbpId,
        relType: "OWNS" as const,
        confidence: 0.95,
        evidenceId,
      });

      const relId2 = await graphService.upsertRelationship({
        fromEntityId: jbpId,
        toEntityId: quincyId,
        relType: "LOCATED_IN" as const,
        confidence: 0.92,
        evidenceId,
      });

      // Get neighborhood (depth 1 from Nate)
      const neighborhood = await graphService.getNeighborhood(nateId, 1);

      // Verify center entity
      expect(neighborhood.center.id).toBe(nateId);

      // Verify relationships
      expect(neighborhood.relationships.length).toBeGreaterThan(0);
      expect(neighborhood.relationships.some((r) => r.id === relId1)).toBe(true);

      // Verify evidence is included
      expect(Object.keys(neighborhood.evidence).length).toBeGreaterThan(0);
      expect(neighborhood.evidence[evidenceId]).toBeDefined();
      expect(neighborhood.evidence[evidenceId].sourceExcerpt).toBe(
        "Nate owns Johnson Bros"
      );

      // Verify stats
      expect(neighborhood.stats.totalNodes).toBeGreaterThan(0);
      expect(neighborhood.stats.totalRelationships).toBeGreaterThan(0);
    });

    it("should filter relationships by minConfidence", async () => {
      const entity1 = await graphService.upsertEntity({
        entityType: "PERSON" as const,
        name: "High Confidence Person",
      });

      const entity2 = await graphService.upsertEntity({
        entityType: "PERSON" as const,
        name: "Low Confidence Person",
      });

      // High confidence relationship
      await graphService.upsertRelationship({
        fromEntityId: entity1,
        toEntityId: entity2,
        relType: "KNOWS" as const,
        confidence: 0.95,
      });

      // Get neighborhood with minConfidence filter
      const neighborhoodHigh = await graphService.getNeighborhood(
        entity1,
        1,
        100,
        0.9
      );

      // Should include the high confidence rel
      expect(neighborhoodHigh.relationships.length).toBeGreaterThan(0);

      // Get neighborhood with stricter filter
      const neighborhoodStrict = await graphService.getNeighborhood(
        entity1,
        1,
        100,
        0.98
      );

      // Should exclude the relationship
      expect(neighborhoodStrict.relationships.length).toBe(0);
    });

    it("should filter relationships by status", async () => {
      const entity1 = await graphService.upsertEntity({
        entityType: "PERSON" as const,
        name: "Status Filter Test 1",
      });

      const entity2 = await graphService.upsertEntity({
        entityType: "PERSON" as const,
        name: "Status Filter Test 2",
      });

      // Create ACTIVE and CONTESTED relationships
      await graphService.upsertRelationship({
        fromEntityId: entity1,
        toEntityId: entity2,
        relType: "LIKES" as const,
        confidence: 0.8,
        status: "ACTIVE",
      });

      await graphService.upsertRelationship({
        fromEntityId: entity1,
        toEntityId: entity2,
        relType: "LIKES" as const,
        confidence: 0.6,
        status: "CONTESTED",
      });

      // Get neighborhood filtering for ACTIVE only
      const activeOnly = await graphService.getNeighborhood(entity1, 1, 100, undefined, "ACTIVE");

      // Should only have ACTIVE
      expect(activeOnly.relationships.every((r) => r.status === "ACTIVE")).toBe(
        true
      );

      // Get neighborhood filtering for CONTESTED only
      const contestedOnly = await graphService.getNeighborhood(
        entity1,
        1,
        100,
        undefined,
        "CONTESTED"
      );

      expect(
        contestedOnly.relationships.every((r) => r.status === "CONTESTED")
      ).toBe(true);
    });

    it("should respect depth parameter", async () => {
      // Create chain: A -> B -> C
      const a = await graphService.upsertEntity({
        entityType: "PERSON" as const,
        name: "Depth Test A",
      });

      const b = await graphService.upsertEntity({
        entityType: "PERSON" as const,
        name: "Depth Test B",
      });

      const c = await graphService.upsertEntity({
        entityType: "PERSON" as const,
        name: "Depth Test C",
      });

      await graphService.upsertRelationship({
        fromEntityId: a,
        toEntityId: b,
        relType: "KNOWS" as const,
        confidence: 0.9,
      });

      await graphService.upsertRelationship({
        fromEntityId: b,
        toEntityId: c,
        relType: "KNOWS" as const,
        confidence: 0.9,
      });

      // Depth 1 from A should only get B
      const depth1 = await graphService.getNeighborhood(a, 1);
      expect(depth1.stats.maxDepth).toBeLessThanOrEqual(1);

      // Depth 2 from A might get B and C
      const depth2 = await graphService.getNeighborhood(a, 2);
      expect(depth2.stats.maxDepth).toBeLessThanOrEqual(2);

      // Depth 1 should have fewer or equal nodes than depth 2
      expect(depth1.nodes.length).toBeLessThanOrEqual(depth2.nodes.length);
    });
  });
});

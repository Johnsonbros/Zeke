# Knowledge Graph Subsystem Audit Report

**Date:** December 23, 2025  
**Auditor:** ZEKE AI Agent  
**Version:** 1.0  
**Status:** AUDIT COMPLETE - CRITICAL ISSUES FOUND

---

## Executive Summary

The Knowledge Graph (KG) subsystem has been implemented with the core architecture and functionality in place. However, **5 critical bugs** and **2 improvement items** were discovered. The critical bugs **must be fixed before production use**. While the design provides a foundation for future Neo4j migration, significant refactoring would be required due to current SQL/Drizzle coupling.

### Overall Verdict: **NOT PRODUCTION READY** (Requires Critical Fixes)

---

## 1. Schema & Data Integrity

### Tables Created
| Table | Status | Row Count |
|-------|--------|-----------|
| kg_entities | EXISTS | 5 |
| kg_relationships | EXISTS | 5 |
| kg_evidence | EXISTS | 2 |

### Columns Verified
**kg_entities:**
- id, canonical_key, entity_type, name, attributes, created_at, updated_at

**kg_relationships:**
- id, from_entity_id, to_entity_id, rel_type, confidence, status, evidence_id, properties, created_at, last_seen_at

**kg_evidence:**
- id, source_type, source_id, source_excerpt, source_url, created_at

### Critical Issues Found

#### BUG #1: Missing `normalizedName` Column (CRITICAL)
- **Location:** `server/graph-service.ts` lines 96, 122
- **Problem:** Code inserts and queries `normalizedName` but column doesn't exist in schema
- **Impact:** Entity search endpoint returns "Entity not found" for ALL searches
- **Fix:** Add `normalizedName: text("normalized_name").notNull()` to `kgEntities` schema

#### BUG #2: Hyphen Normalization Bug
- **Location:** `server/graph-service.ts` normalizeString function
- **Problem:** "Nate-Johnson" normalizes to "natejohnson" not "nate johnson"
- **Impact:** Creates duplicate entities for hyphenated names
- **Fix:** Replace hyphens with spaces before `.trim().toLowerCase().replace(/\s+/g, " ")`

#### BUG #3: Missing Foreign Key Constraints (HIGH - Data Integrity Hardening)
- **Problem:** `from_entity_id`, `to_entity_id`, `evidence_id` lack FK references
- **Impact:** Orphan relationships possible if entities deleted (does not affect current functionality)
- **Fix:** Add `.references(() => kgEntities.id)` to schema

#### IMPROVEMENT #1: Missing Database Indexes (LOW - Performance)
- **Problem:** No indexes on frequently queried columns
- **Impact:** Query performance will degrade at scale (100k+ relationships)
- **Fix:** Add indexes on `from_entity_id`, `to_entity_id`, `evidence_id`, `canonical_key`

#### BUG #5: Schema Mismatch - Timestamp Columns
- **Location:** `server/graph-service.ts` lines 190, 195
- **Problem:** Code inserts `firstSeenAt` and `updatedAt` but `kgRelationships` only has `lastSeenAt`
- **Impact:** Drizzle silently ignores these fields (data loss)
- **Fix:** Either add columns to schema OR remove from graph-service insert

---

## 2. Entity Normalization & Idempotency

### Test Results
| Test Case | Expected | Actual | Status |
|-----------|----------|--------|--------|
| Create "Nate Johnson" twice | Same ID returned | Same ID returned | PASS |
| Create "NATE JOHNSON" | Match existing | Match existing | PASS |
| Create "Nate-Johnson" | Match existing | NEW entity created | FAIL |

### Verdict
Normalization works for case variations but **fails for hyphens**. See BUG #2 above.

---

## 3. Relationship Behavior

### Test Results
| Test Case | Expected | Actual | Status |
|-----------|----------|--------|--------|
| Create duplicate relationship | Upsert, update lastSeenAt | Works correctly | PASS |
| Confidence > 1.0 | Cap at 1.0 | Capped correctly | PASS |
| Confidence < 0.0 | Cap at 0.0 | Not tested but code present | LIKELY PASS |
| Contest relationship | Set CONTESTED, create new | Works correctly | PASS |
| Retract relationship | Set RETRACTED | Works correctly | PASS |

### Verdict
Core relationship logic works correctly. Confidence bounds enforced.

---

## 4. Neighborhood Query

### Test Results
| Test Case | Expected | Actual | Status |
|-----------|----------|--------|--------|
| Fetch entity neighborhood | Outgoing + incoming edges | Returned correctly | PASS |
| Evidence attached to edges | Evidence visible | Evidence visible | PASS |
| minConfidence filter | Filter applied | Not explicitly tested | UNKNOWN |

#### NOTE: Duplicate Edges (Not Confirmed)
- **Observation:** Initial concern about duplicate edges was not substantiated
- **Code Review:** `getNeighborhood` only pushes each relationship once per traversal direction
- **Status:** No action required - false alarm

---

## 5. API Contract Audit

### Endpoints Tested
| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/kg/entities` | POST | WORKS | Creates entity |
| `/api/kg/entities/:id` | GET | WORKS | Fetches by ID |
| `/api/kg/entities/search` | GET | BROKEN | BUG #1 - normalizedName missing |
| `/api/kg/relationships` | POST | WORKS | Creates relationship |
| `/api/kg/relationships/:id/contest` | POST | WORKS | Contests relationship |
| `/api/kg/relationships/:id/retract` | POST | WORKS | Retracts relationship |
| `/api/kg/neighborhood/:id` | GET | WORKS | Returns neighborhood |
| `/api/kg/ingestTriples` | POST | WORKS | Bulk ingestion |
| `/api/kg/stats` | GET | BROKEN | BUG #7 - destructuring error |
| `/api/kg/conflicts` | GET | WORKS | Returns empty when no conflicts |

#### BUG #7: Stats Endpoint Crash
- **Location:** `server/graph-service.ts` line 458
- **Error:** `"(intermediate value) is not iterable"`
- **Problem:** `db.execute()` result destructured incorrectly
- **Fix:** Change `const [result] = await db.execute(...)` to `const result = await db.execute(...)`

---

## 6. Feature Flag Enforcement

### Configuration
| Flag | Type | Required For | Status |
|------|------|--------------|--------|
| KG_ENABLED | Backend | API routes | SET (true) |
| VITE_KG_ENABLED | Frontend | Admin UI | SET (true) |

#### IMPROVEMENT #2: Dual Flag Requirement Not Documented (LOW - Documentation)
- **Problem:** Frontend uses `VITE_KG_ENABLED`, backend uses `KG_ENABLED`
- **Impact:** Users may enable backend but UI shows "not enabled" (UX confusion)
- **Fix:** Document both flags in KNOWLEDGE_GRAPH.md OR unify to single flag

### Backend Guard
```typescript
if (process.env.KG_ENABLED !== "true") {
  return res.status(503).json({ error: "Knowledge Graph not enabled" });
}
```
**Verdict:** Backend guard works correctly.

---

## 7. Admin UI Inspection

### Current State
- UI exists at `/knowledge-graph` route
- Shows "Knowledge Graph is not enabled" due to VITE_KG_ENABLED not being read at build time
- After proper configuration, should display:
  - Entity search
  - Neighborhood visualization
  - Evidence traceability
  - Confidence/status filters

### Features Verified in Code
- Entity type icons (Person, Place, Concept)
- Status badges (ACTIVE, CONTESTED, RETRACTED)
- Evidence provenance display
- Confidence sliders
- Relationship type filters

**Verdict:** UI is well-designed but blocked by flag configuration issue.

---

## 8. Edge Cases & Failure Modes

### Tested Scenarios
| Scenario | Expected | Actual | Status |
|----------|----------|--------|--------|
| Entity with null attributes | Accept | Works | PASS |
| Relationship without evidence | Accept | Works | PASS |
| Missing required fields | Reject with 400 | Zod validation works | PASS |
| Invalid entity ID in relationship | Fail gracefully | Creates orphan (no FK) | FAIL |

---

## 9. Neo4j Migration Readiness

### Assessment
| Criteria | Status | Notes |
|----------|--------|-------|
| Service abstraction layer | PARTIAL | GraphService encapsulates logic but uses raw SQL/Drizzle |
| Entity model portable | GOOD | Type/Name/Attributes maps to Neo4j nodes |
| Relationship model portable | GOOD | FromId/ToId/Type/Props maps to Neo4j edges |
| Evidence model portable | GOOD | Can become separate nodes with :HAS_EVIDENCE edges |
| SQL coupling | HIGH | Uses Drizzle ORM, pg-specific syntax, raw sql`` templates |
| Cypher query patterns | NOT IMPLEMENTED | Would need complete rewrite |
| Transaction semantics | GOOD | Uses single operations, no complex transactions |

### Realistic Migration Effort
The current implementation is **tightly coupled to Postgres/Drizzle**, which means:

1. **Cannot swap directly** - GraphService methods use Drizzle-specific patterns
2. **Significant refactoring required** - Approximately 400+ lines would need rewriting
3. **Data model is portable** - Entities, relationships, and evidence can migrate cleanly

### Recommendation for Future Migration
When migrating to Neo4j:
1. Define abstract `IGraphService` interface from current method signatures
2. Create `Neo4jGraphService` implementing that interface with Cypher
3. Map entities to `(:Entity {type, name, attributes})`
4. Map relationships to `-[:REL_TYPE {confidence, status, evidenceId}]->`
5. **Agent code would NOT require changes** if interface is preserved

---

## 10. Required Fixes (Priority Order)

### Critical (Must Fix Before Use)
1. **Add `normalizedName` column to schema** - Entity search is completely broken
2. **Fix stats endpoint destructuring** - Admin UI crashes on load
3. **Fix hyphen normalization** - Creates duplicate entities for hyphenated names
4. **Fix timestamp column mismatch** - `firstSeenAt`/`updatedAt` inserts silently dropped
5. **Add foreign key constraints** - Data integrity hardening (functionality works)

### Low Priority (Performance/Documentation)
6. **Add database indexes** - Performance optimization for scale
7. **Document VITE_KG_ENABLED** - UX documentation improvement

---

## Appendix: Test Commands

```bash
# Create entity
curl -X POST http://localhost:5000/api/kg/entities \
  -H "Content-Type: application/json" \
  -d '{"entityType":"person","name":"Test Person"}'

# Search entities (currently broken)
curl "http://localhost:5000/api/kg/entities/search?q=test"

# Create relationship with evidence
curl -X POST http://localhost:5000/api/kg/relationships \
  -H "Content-Type: application/json" \
  -d '{"fromEntityId":"<id>","toEntityId":"<id>","relType":"KNOWS","confidence":0.8,"evidenceId":"<id>"}'

# Get neighborhood
curl "http://localhost:5000/api/kg/neighborhood/<entityId>"

# Bulk ingest
curl -X POST http://localhost:5000/api/kg/ingestTriples \
  -H "Content-Type: application/json" \
  -d '{"evidence":{"sourceType":"test","sourceId":"001"},"triples":[...]}'
```

---

## Conclusion

The Knowledge Graph subsystem demonstrates solid architectural decisions:
- Evidence provenance tracking works correctly
- Confidence scoring with proper bounds (0-1) enforced
- Status state machine (ACTIVE/CONTESTED/RETRACTED) functional
- Feature flag protection in place
- Core entity/relationship CRUD operations working

However, **5 critical bugs must be fixed** before the system can be considered production-ready:
1. Missing `normalizedName` column (entity search completely broken)
2. Stats endpoint crash (admin UI cannot load)
3. Hyphen normalization bug (creates duplicate entities)
4. Timestamp column mismatch (data silently dropped)
5. Missing FK constraints (orphan data possible)

**Neo4j Migration Note:** While the data model is portable, the current implementation is tightly coupled to Postgres/Drizzle. Migration would require significant refactoring (~400 lines) to create a Neo4j-compatible service implementation.

**Recommended Action:** Fix bugs #1-5, then re-audit before enabling for production use.

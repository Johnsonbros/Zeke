# Knowledge Graph (KG) System Documentation

## Overview

The Knowledge Graph system is a Postgres-backed semantic network for tracking entities, relationships, and evidence with confidence scores and conflict resolution. Designed for future Neo4j integration without requiring agent logic changes.

**Status**: Behind `KG_ENABLED` feature flag (`process.env.KG_ENABLED === "true"`)

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              Client (React Admin UI)                 │
│  - Entity search                                     │
│  - Detail inspection (attributes, edges, evidence)   │
│  - Filters (confidence, status, depth)               │
└──────────────────┬──────────────────────────────────┘
                   │
         HTTP REST API Endpoints
         (10 routes behind KG_ENABLED)
                   │
┌──────────────────▼──────────────────────────────────┐
│          GraphService (server/graph-service.ts)      │
│  - upsertEntity()                                    │
│  - upsertRelationship()                              │
│  - upsertEvidence()                                  │
│  - contestRelationship() [ACTIVE→CONTESTED]          │
│  - retractRelationship() [→RETRACTED]                │
│  - getNeighborhood(depth, filters)                   │
│  - getGraphStats()                                   │
└──────────────────┬──────────────────────────────────┘
                   │
           PostgreSQL Database
                   │
        ┌──────────┼──────────┐
        │          │          │
    ┌───▼──┐  ┌────▼──┐  ┌───▼────┐
    │Entity│  │Rel'ship│  │Evidence│
    │Table │  │ Table  │  │ Table  │
    └──────┘  └────────┘  └────────┘
```

## Database Schema

### kg_entities
- `id` (UUID primary key)
- `entityType` (PERSON, PLACE, ORG, CONCEPT, etc.)
- `canonicalKey` (generated: `${type}:${normalized_name}` for deduplication)
- `name` (original display name)
- `attributes` (JSONB - custom properties)
- `createdAt` (ISO timestamp)
- `updatedAt` (ISO timestamp)

### kg_relationships
- `id` (UUID primary key)
- `fromEntityId` (FK to kg_entities)
- `toEntityId` (FK to kg_entities)
- `relType` (OWNS, LIKES, LOCATED_IN, WORKS_AT, etc.)
- `confidence` (numeric 0.00-1.00, incremental)
- `status` (ACTIVE | CONTESTED | RETRACTED)
- `evidenceId` (FK to kg_evidence)
- `properties` (JSONB)
- `lastSeenAt` (ISO timestamp)
- `createdAt`, `updatedAt`

### kg_evidence
- `id` (UUID primary key)
- `sourceType` (CHAT_MESSAGE, MEMORY_NOTE, TASK, CALENDAR, SMS, etc.)
- `sourceId` (internal identifier in source system)
- `sourceExcerpt` (quoted text)
- `sourceUrl` (link to source)
- `createdAt` (ISO timestamp)

## API Endpoints

All endpoints require `Content-Type: application/json` and only work if `KG_ENABLED=true`.

### Entity Operations

**POST /api/kg/entities** - Create or update entity
```json
{
  "entityType": "PERSON",
  "name": "Nate Johnson",
  "attributes": { "role": "owner" }
}
```

**GET /api/kg/entities/:id** - Get entity by ID

**GET /api/kg/entities/search?q=...** - Search entities (min 2 chars)

### Relationship Operations

**POST /api/kg/relationships** - Create relationship
```json
{
  "fromEntityId": "uuid1",
  "toEntityId": "uuid2",
  "relType": "OWNS",
  "confidence": 0.95,
  "status": "ACTIVE",
  "evidenceId": "uuid_evidence",
  "properties": {}
}
```

**POST /api/kg/relationships/:id/contest** - Contest a relationship (ACTIVE → CONTESTED)
```json
{
  "fromEntityId": "uuid1",
  "toEntityId": "uuid3",
  "relType": "LOCATED_IN",
  "confidence": 0.92,
  "evidenceId": "uuid_new_evidence"
}
```

**POST /api/kg/relationships/:id/retract** - Retract a relationship (→ RETRACTED)

### Bulk Operations

**POST /api/kg/ingestTriples** - Bulk ingest entities + relationships
```json
{
  "evidence": {
    "sourceType": "CHAT_MESSAGE",
    "sourceId": "msg_001",
    "sourceExcerpt": "Nate owns Johnson Bros",
    "sourceUrl": "https://..."
  },
  "triples": [
    {
      "from": { "type": "PERSON", "name": "Nate Johnson" },
      "rel_type": "OWNS",
      "to": { "type": "ORG", "name": "Johnson Bros. Plumbing" },
      "confidence": 0.95,
      "status": "ACTIVE",
      "properties": {}
    }
  ]
}
```

**Returns**:
```json
{
  "evidence": "uuid_evidence",
  "triples": [
    { "fromEntityId": "uuid1", "toEntityId": "uuid2", "relationshipId": "uuid3" }
  ]
}
```

### Query Operations

**GET /api/kg/neighborhood/:entityId** - Get entity with relationships
Query params:
- `depth` (1 or 2, default 1)
- `limit` (default 100)
- `minConfidence` (0-1, optional)
- `status` (ACTIVE|CONTESTED|RETRACTED, optional)

**GET /api/kg/stats** - Get graph statistics

**GET /api/kg/conflicts** - Get all contested relationships

### Evidence

**POST /api/kg/evidence** - Create evidence record
```json
{
  "sourceType": "MEMORY_NOTE",
  "sourceId": "mem_123",
  "sourceExcerpt": "text...",
  "sourceUrl": "..."
}
```

## Admin UI Features

Navigate to `/knowledge-graph` page:

1. **Search Panel** (left)
   - Type entity name (min 2 chars)
   - Click result to view details

2. **Detail Panel** (right)
   - Entity name, type, attributes
   - Outgoing relationships (entity → others)
   - Incoming relationships (others → entity)
   - Each edge shows:
     - Relationship type
     - Confidence %
     - Status badge
     - Last seen date
     - Evidence (source, excerpt, ID)

3. **Filters** (right sidebar)
   - Min Confidence slider (0-100%)
   - Status filter (All, ACTIVE, CONTESTED, RETRACTED)
   - Depth selector (1 = direct, 2 = one hop)

4. **Stats Bar** (top)
   - Total entities, relationships, evidence
   - Average confidence across graph

## Usage Examples

### Example 1: Ingest business ownership

```bash
curl -X POST http://localhost:5000/api/kg/ingestTriples \
  -H "Content-Type: application/json" \
  -d '{
    "evidence": {
      "sourceType": "CHAT_MESSAGE",
      "sourceId": "msg_20250101_001",
      "sourceExcerpt": "Nate owns Johnson Bros Plumbing"
    },
    "triples": [
      {
        "from": { "type": "PERSON", "name": "Nate Johnson" },
        "rel_type": "OWNS",
        "to": { "type": "ORG", "name": "Johnson Bros. Plumbing" },
        "confidence": 0.95
      },
      {
        "from": { "type": "ORG", "name": "Johnson Bros. Plumbing" },
        "rel_type": "LOCATED_IN",
        "to": { "type": "PLACE", "name": "Quincy, MA" },
        "confidence": 0.92
      }
    ]
  }'
```

### Example 2: View entity neighborhood

```bash
curl http://localhost:5000/api/kg/entities/search?q=nate
# Get the entity ID from results
curl "http://localhost:5000/api/kg/neighborhood/{entityId}?depth=1&minConfidence=0.7"
```

### Example 3: Contest a relationship

```bash
curl -X POST "http://localhost:5000/api/kg/relationships/{relId}/contest" \
  -H "Content-Type: application/json" \
  -d '{
    "fromEntityId": "uuid1",
    "toEntityId": "uuid3",
    "relType": "LOCATED_IN",
    "confidence": 0.92,
    "evidenceId": "uuid_new_evidence"
  }'
```

## State Transitions

Relationships follow a state machine:

```
ACTIVE ──[contest]──> CONTESTED ──[retract]──> RETRACTED
  ▲                                                │
  └────────────────[new evidence]──────────────────┘
```

- **ACTIVE**: Current best claim
- **CONTESTED**: Multiple versions with different evidence
- **RETRACTED**: Marked as false/invalid

## Design Decisions

1. **Postgres Only (No Neo4j Yet)**
   - Uses normalized SQL with JSON columns
   - Full-text search on entities
   - Supports confidence incrementing
   - Easy to migrate to Neo4j in future

2. **Canonical Keys for Deduplication**
   - `${entityType}:${normalized_name}` format
   - Prevents duplicate entities (case-insensitive, whitespace-normalized)
   - Upsert pattern automatically handles duplicates

3. **Confidence as Numeric(3,2)**
   - Stores 0.00 - 1.00 with 2 decimal precision
   - Supports incremental updates
   - Capped at 1.0

4. **Timestamps as ISO Strings**
   - Matches ZEKE's existing patterns
   - `createdAt`, `updatedAt`, `lastSeenAt` fields
   - Human-readable in admin UI

5. **Evidence Provenance**
   - Every relationship links to source evidence
   - Evidence includes: source type, ID, excerpt, URL
   - Enables traceability and conflict resolution

## Scripts

### Seed Script (TypeScript)
```bash
npx tsx scripts/seed-knowledge-graph.ts
```
Creates demo entities (Nate, ZEKE, Boston, Freemasonry) with sample relationships.

### Demo Ingest Script (TypeScript)
```bash
npx tsx scripts/demo-ingest-triples.ts
```
Calls `ingestTriples` endpoint with demo data:
- Nate → OWNS → Johnson Bros Plumbing
- Johnson Bros → LOCATED_IN → Quincy, MA
- Aurora → LIKES → Moon

### Manual Test (Bash)
```bash
/tmp/test-ingest.sh
```

## Environment Variables

```bash
# Enable Knowledge Graph system
KG_ENABLED=true

# Database (existing ZEKE setup)
DATABASE_URL=postgresql://...
```

## Future Enhancements

1. **Force-graph Visualization**
   - D3/vis.js graph rendering
   - Interactive node dragging
   - Link strength by confidence

2. **Conflict Resolution UI**
   - Contest/retract buttons in admin UI
   - Evidence comparison view
   - Voting mechanism

3. **Neo4j Backend**
   - Migrate with GraphService abstraction
   - Agent queries unchanged
   - Graph algorithms (shortest path, etc.)

4. **Advanced Queries**
   - SPARQL-like query builder
   - Path finding
   - Transitive relationships

5. **Temporal Dimension**
   - Track relationship validity periods
   - Historical snapshots
   - Temporal queries

## Troubleshooting

**KG is disabled**
```bash
export KG_ENABLED=true
npm run dev
```

**Endpoints return 404**
- Verify `KG_ENABLED=true` in environment
- Check that app is running on correct port

**No entities found**
- Run demo script: `npx tsx scripts/demo-ingest-triples.ts`
- Or use `ingestTriples` endpoint

**Confidence scores not updating**
- Upsert same relationship with higher confidence
- System automatically increments (capped at 1.0)

## Code References

- **GraphService**: `server/graph-service.ts` (business logic)
- **API Routes**: `server/routes.ts` (lines 26-320)
- **Schema**: `shared/schema.ts` (kg_entities, kg_relationships, kg_evidence)
- **Admin UI**: `client/src/pages/knowledge-graph.tsx`
- **Database**: `server/db.ts` (CRUD operations)

---

**Last Updated**: December 23, 2025
**Status**: Production-ready (feature-flagged)

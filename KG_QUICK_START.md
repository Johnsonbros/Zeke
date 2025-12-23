# Knowledge Graph - Quick Start Guide

## Enable & Start

```bash
export KG_ENABLED=true
npm run dev
```

Navigate to `/knowledge-graph` in the UI (left sidebar).

## Run Demo

**Option 1: Using TypeScript script (recommended)**
```bash
npx tsx scripts/demo-ingest-triples.ts
```

**Option 2: Manual curl test**
```bash
curl -X POST http://localhost:5000/api/kg/ingestTriples \
  -H "Content-Type: application/json" \
  -d '{
    "evidence": {
      "sourceType": "DEMO",
      "sourceId": "demo_001",
      "sourceExcerpt": "Demo data"
    },
    "triples": [
      {
        "from": { "type": "PERSON", "name": "Nate Johnson" },
        "rel_type": "OWNS",
        "to": { "type": "ORG", "name": "Johnson Bros. Plumbing" },
        "confidence": 0.95
      }
    ]
  }'
```

## What Gets Created

After running the demo, you'll see:

### Entities
- **Nate Johnson** (PERSON)
- **Johnson Bros. Plumbing & Drain Cleaning** (ORG)
- **Quincy, MA** (PLACE)
- **Aurora** (PERSON)
- **Moon** (CONCEPT)

### Relationships
- Nate → **OWNS** → Johnson Bros (95% confidence)
- Johnson Bros → **LOCATED_IN** → Quincy, MA (92% confidence)
- Aurora → **LIKES** → Moon (85% confidence)

### Evidence
- Each relationship links to source evidence (what system created it, when, excerpt)

## Admin UI Features

1. **Search** (left panel)
   - Type entity name (min 2 chars)
   - Click to view details

2. **Details** (right panel)
   - Entity attributes
   - Outgoing edges (entity → others)
   - Incoming edges (others → entity)
   - Evidence for each relationship

3. **Filters** (sidebar)
   - Min Confidence: 0-100% slider
   - Status: All, ACTIVE, CONTESTED, RETRACTED
   - Depth: Direct (1) or One hop (2)

## Key Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/kg/ingestTriples` | Bulk insert entities + relationships |
| GET | `/api/kg/entities/search?q=...` | Search entities |
| GET | `/api/kg/neighborhood/:id` | Get entity with relationships |
| GET | `/api/kg/stats` | Graph statistics |
| POST | `/api/kg/relationships/:id/contest` | Mark as disputed |
| POST | `/api/kg/relationships/:id/retract` | Mark as false |

## File Structure

```
server/
├── graph-service.ts      # Core business logic
└── routes.ts             # API endpoints (lines 26-320)

client/src/
└── pages/knowledge-graph.tsx  # Admin UI inspector

shared/
└── schema.ts             # kg_entities, kg_relationships, kg_evidence

scripts/
├── demo-ingest-triples.ts  # Test the full pipeline
└── seed-knowledge-graph.ts  # Seed with demo data

KNOWLEDGE_GRAPH.md         # Full documentation
```

## Next Steps

1. ✅ Enable KG_ENABLED=true
2. ✅ Run demo script
3. ✅ Explore Admin UI
4. ⏭️ Integrate with agent (modify agent to call `/api/kg/ingestTriples`)
5. ⏭️ Build force-graph visualization (optional)

## Architecture Highlights

- **Postgres-based** (not Neo4j) for simplicity
- **Idempotent upserts** prevent duplicates
- **Evidence provenance** for every relationship
- **Confidence scores** (0-1.0) for certainty
- **State machine** for conflict resolution (ACTIVE → CONTESTED → RETRACTED)
- **Feature-flagged** so it can be disabled
- **Future Neo4j ready** (GraphService abstraction)

## Troubleshooting

**"Knowledge Graph is not enabled"**
→ Set `export KG_ENABLED=true` before starting

**No entities showing**
→ Run `npx tsx scripts/demo-ingest-triples.ts`

**Build errors**
→ Ensure all dependencies installed: `npm install`

**API returning 500**
→ Check server logs: `npm run dev` shows error details

---

**Ready to go!** 🚀 Start with the demo, explore the UI, then integrate with your agent.

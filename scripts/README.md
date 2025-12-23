# KG Scripts

## demo-ingest-triples.ts
Test the full ingestTriples pipeline with demo data:
```bash
npx tsx scripts/demo-ingest-triples.ts
```

Creates:
- Nate (PERSON) → OWNS → Johnson Bros Plumbing (ORG)
- Johnson Bros → LOCATED_IN → Quincy, MA (PLACE)
- Aurora (PERSON) → LIKES → Moon (CONCEPT)

## seed-knowledge-graph.ts
Seed initial knowledge graph with demo entities and relationships:
```bash
npx tsx scripts/seed-knowledge-graph.ts
```

Creates Nate, ZEKE, Boston entities and sample relationships directly via GraphService.

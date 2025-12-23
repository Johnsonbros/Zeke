# Knowledge Graph Tests

## Running Tests

### Install Vitest (if not already installed)
```bash
npm install -D vitest
```

### Run All Tests
```bash
npx vitest
```

### Run Specific Test File
```bash
npx vitest server/__tests__/graph-service.test.ts
```

### Run in Watch Mode
```bash
npx vitest --watch
```

### Run with Coverage
```bash
npx vitest --coverage
```

## Test Coverage

### Test 1: Entity Normalization + Canonical Key Determinism
- ✅ `normalizeEntityName()` produces consistent results
- ✅ `generateCanonicalKey()` is deterministic
- ✅ Punctuation is properly removed
- ✅ Case variations produce same canonical key
- ✅ Whitespace variations produce same canonical key

### Test 2: Upsert Entity Idempotency
- ✅ Identical inputs return same entity ID
- ✅ Case variations return same ID
- ✅ Whitespace variations return same ID
- ✅ Attributes can be updated without changing ID
- ✅ Only one entity exists per canonical key

### Test 3: Relationship Upsert & Last Seen Tracking
- ✅ First upsert creates new relationship
- ✅ Second upsert updates existing (doesn't duplicate)
- ✅ `last_seen_at` timestamp is updated on repeated upserts
- ✅ Confidence increments on repeated upserts (capped at 1.0)
- ✅ Different statuses are treated as different relationships

### Test 4: Neighborhood Query with Evidence
- ✅ Returns correct center entity
- ✅ Includes all relationships and nodes
- ✅ Includes evidence with source metadata
- ✅ Filters by minConfidence
- ✅ Filters by status (ACTIVE, CONTESTED, RETRACTED)
- ✅ Respects depth parameter (1 = direct, 2 = one hop)
- ✅ Returns consistent stats

## Key Test Data

Tests use simple entity chains:
- Person ↔ Organization ↔ Place
- KNOWS, OWNS, LOCATED_IN relationships
- CHAT_MESSAGE evidence

## Assertions

Each test verifies:
1. **Determinism**: Same inputs always produce same outputs
2. **Idempotency**: Repeated operations don't duplicate
3. **Correctness**: Data is stored and retrieved accurately
4. **Filtering**: Query filters work correctly
5. **Evidence**: Source provenance is tracked and included

## Database

Tests use the development database (DATABASE_URL).
All data is cleaned up before and after test runs.

## Expected Results

All 18 test cases should pass:
- 3 normalization tests
- 4 idempotency tests
- 5 relationship/last_seen tests
- 4 neighborhood/evidence tests
- 2 filtering tests

---

Tests ensure the KG system maintains data integrity and consistency.

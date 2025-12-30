# ZEKE Sync Architecture Roadmap

## Overview

This document outlines the implementation plan for enhancing synchronization between the ZEKE mobile app and backend. These improvements will provide real-time updates, offline capabilities, and robust conflict resolution.

---

## Phase 1: Revision Tracking & WebSocket Events (2 weeks)

### What to Implement

#### Backend (Express Proxy)

1. **Add revision metadata to all responses**
   - Every API response includes `revisionId` (timestamp or incrementing ID)
   - Store last-known revision per entity type in memory/Redis
   
   ```typescript
   // Example response structure
   {
     data: { ... },
     meta: {
       revisionId: "rev_1704067200_abc123",
       updatedAt: "2024-01-01T00:00:00Z"
     }
   }
   ```

2. **Broadcast typed WebSocket events**
   - Emit events when data changes through the proxy
   - Include entity type, action, and revision ID
   
   ```typescript
   // WebSocket event format
   {
     type: "sync_event",
     entity: "contact",
     action: "updated",
     id: "contact_123",
     revisionId: "rev_1704067200_abc123",
     payload: { name: "John Doe", phone: "+15551234567" }
   }
   ```

3. **Add resumable subscriptions**
   - Accept `lastRevisionId` on WebSocket connect
   - Send missed events since that revision

#### Mobile App (Expo/React Native)

1. **Store revision IDs in AsyncStorage**
   - Track last-seen revision per entity type
   - Persist across app restarts

2. **Listen for WebSocket sync events**
   - Subscribe to change events by entity type
   - Invalidate specific React Query caches on receive

3. **Update query client to use revisions**
   - Include revision in cache keys for precise invalidation

### Why This Improves the App

| Improvement | User Benefit |
|-------------|--------------|
| Real-time updates | Changes appear instantly without manual refresh |
| Precise cache invalidation | Only refetch what changed, not everything |
| Resumable sync | No missed updates even after brief disconnections |
| Reduced API calls | Fewer redundant fetches = faster app, lower data usage |

---

## Phase 2: Conflict Detection & Resolution (2-3 weeks)

### What to Implement

#### Backend (Express Proxy)

1. **Version checking on mutations**
   - Accept `If-Match` header with expected revision ID
   - Return 409 Conflict if revision doesn't match
   
   ```typescript
   // Conflict response
   {
     error: "conflict",
     message: "Record was modified by another device",
     currentRevision: "rev_1704067300_xyz789",
     serverData: { ... },
     clientData: { ... }
   }
   ```

2. **Merge strategies per entity type**
   - Contacts: Server-authoritative (backend is source of truth)
   - Tasks: Last-writer-wins with timestamp comparison
   - Lists: Additive merge (combine items from both versions)

3. **Feature flag for gradual rollout**
   - Start with advisory mode (log conflicts but accept writes)
   - Enable enforcement once clients are ready

#### Mobile App (Expo/React Native)

1. **Include revision in mutation requests**
   - Send `If-Match` header with last-known revision
   - Handle 409 responses gracefully

2. **Conflict resolution UI**
   - Show user-friendly message when conflict detected
   - Options: Keep mine, Keep server's, or Merge

3. **Automatic retry with updated data**
   - Refetch current version and retry mutation
   - Apply merge strategy based on entity type

### Why This Improves the App

| Improvement | User Benefit |
|-------------|--------------|
| No silent data loss | Conflicting edits are detected and resolved |
| Multi-device support | Edit on phone and tablet without overwriting |
| Transparent handling | Users understand when conflicts occur |
| Smart merging | Most conflicts resolve automatically |

---

## Phase 3: Offline Queue & Replay (1.5-2 weeks)

### What to Implement

#### Mobile App (Expo/React Native)

1. **Durable mutation queue**
   - Store pending mutations in AsyncStorage
   - Include timestamp, entity type, operation, and payload
   
   ```typescript
   // Queue entry structure
   {
     id: "mutation_abc123",
     timestamp: 1704067200000,
     entity: "contact",
     operation: "create",
     payload: { name: "Jane Doe", phone: "+15559876543" },
     status: "pending", // pending | syncing | failed | completed
     retryCount: 0
   }
   ```

2. **Optimistic UI updates**
   - Apply changes immediately to local cache
   - Mark as "pending sync" in UI
   - Rollback if server rejects

3. **Queue processing on reconnect**
   - Detect network restoration
   - Replay pending mutations in order
   - Handle conflicts using Phase 2 strategies

4. **Retry with exponential backoff**
   - First retry: 1 second
   - Subsequent: 2s, 4s, 8s, max 60s
   - Mark as failed after 5 attempts

#### Backend (Express Proxy)

1. **Idempotency keys**
   - Accept `Idempotency-Key` header on mutations
   - Return cached response for duplicate requests

2. **Batch mutation endpoint**
   - Accept array of mutations
   - Process in order, return individual results

### Why This Improves the App

| Improvement | User Benefit |
|-------------|--------------|
| Works offline | Make changes without internet, sync later |
| No lost work | Pending changes survive app restarts |
| Immediate feedback | UI updates instantly, feels responsive |
| Graceful recovery | Automatic sync when connection returns |

---

## Phase 4: Push Notifications for Background Sync (1 week)

### What to Implement

#### Backend (Express Proxy)

1. **Push notification triggers**
   - Send push when important data changes
   - Include sync hint in notification payload
   
   ```typescript
   // Silent push payload
   {
     data: {
       type: "sync_trigger",
       entity: "contact",
       revisionId: "rev_1704067200_abc123"
     }
   }
   ```

2. **Topic-based subscriptions**
   - Subscribe devices to entity topics (contacts, tasks, etc.)
   - Only send relevant notifications per device

#### Mobile App (Expo/React Native)

1. **Register for push notifications**
   - Store push token on backend
   - Subscribe to relevant topics

2. **Handle background notifications**
   - Trigger sync on notification receive
   - Update revision tracking
   - Prefetch changed data

### Why This Improves the App

| Improvement | User Benefit |
|-------------|--------------|
| Fresh data on open | App already has latest changes |
| Battery efficient | Sync only when needed, not on timer |
| Multi-device sync | Changes on one device push to others |
| Important alerts | Know immediately when critical data changes |

---

## Phase 5: Delta Sync (1.5 weeks)

### What to Implement

#### Backend (Express Proxy)

1. **Changes endpoint**
   - `GET /api/sync/changes?since=rev_123&entities=contacts,tasks`
   - Return only records modified since revision
   
   ```typescript
   // Delta response
   {
     changes: [
       { entity: "contact", action: "updated", id: "123", data: {...} },
       { entity: "contact", action: "deleted", id: "456" },
       { entity: "task", action: "created", id: "789", data: {...} }
     ],
     currentRevision: "rev_1704067400_def456",
     hasMore: false
   }
   ```

2. **Tombstones for deletions**
   - Track deleted record IDs
   - Include in delta response for client cleanup

3. **Pagination for large changesets**
   - Limit changes per request
   - Support cursor-based pagination

#### Mobile App (Expo/React Native)

1. **Incremental sync on app open**
   - Check stored revision ID
   - Fetch only changes since last sync
   - Apply changes to local cache

2. **Full sync fallback**
   - If revision too old or missing, do full refresh
   - Reset revision tracking

### Why This Improves the App

| Improvement | User Benefit |
|-------------|--------------|
| Faster sync | Download only what changed, not everything |
| Lower data usage | Minimal bandwidth for updates |
| Quicker app startup | Less to process on launch |
| Scales with data | Performance stays good as data grows |

---

## Implementation Priority Matrix

| Phase | Impact | Effort | Dependencies | Priority |
|-------|--------|--------|--------------|----------|
| Phase 1: Revision & WebSocket | High | Medium | None | **Start here** |
| Phase 2: Conflict Resolution | High | High | Phase 1 | Second |
| Phase 3: Offline Queue | High | Medium | Phase 1, 2 | Third |
| Phase 4: Push Notifications | Medium | Low | Phase 1 | Can parallel |
| Phase 5: Delta Sync | Medium | Medium | Phase 1 | After Phase 3 |

---

## Technical Requirements

### Backend Dependencies
- Redis (optional but recommended for multi-instance cache coherence)
- Expo Push Notification service credentials

### Mobile App Dependencies
- Already has: AsyncStorage, React Query, WebSocket support
- Needs: Enhanced queue management, conflict UI components

### ZEKE Backend Requirements
- Revision ID support on all entities
- Changes/delta endpoint
- Webhook support for real-time event emission

---

## Success Metrics

Track these metrics to validate improvements:

1. **Sync latency**: Time from change to visible update
2. **Conflict rate**: Percentage of mutations with conflicts
3. **Offline queue size**: Average pending mutations
4. **Cache hit rate**: Percentage of requests served from cache
5. **Full sync rate**: How often delta sync falls back to full refresh

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing clients | Feature flags for gradual rollout |
| Data loss during transition | Keep existing sync as fallback |
| Performance regression | Monitor metrics, load test phases |
| Complex conflict UI | Start with automatic resolution only |

---

## Next Steps

1. **Design revision schema** - Agree on revision ID format with ZEKE backend team
2. **Prototype WebSocket events** - Test with contacts first
3. **Set up monitoring** - Track sync health metrics from day one
4. **Plan client updates** - Ensure app store releases align with backend changes

---

*Document created: December 2024*
*Last updated: December 2024*

# ZEKE AI Backend Integration Test Documentation

## Airstrike Testing Methodology

This document provides a comprehensive testing framework for validating the ZEKE AI mobile app's backend integration. These tests ensure all API calls correctly route through the configured backend, implement proper error handling, retry logic, timeout management, and graceful offline recovery.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Summary](#architecture-summary)
3. [Test Execution Guide](#test-execution-guide)
4. [Airstrike Test Scripts](#airstrike-test-scripts)
5. [Quick Reference Checklist](#quick-reference-checklist)
6. [Troubleshooting](#troubleshooting)

---

## Overview

### Purpose
Validate the centralized `ZekeApiClient` architecture handles:
- API URL configuration and locking
- Request routing (LOCAL vs CORE endpoints)
- Authentication header injection
- Retry logic with exponential backoff
- Timeout management
- Offline recovery

### Key Files
| File | Purpose |
|------|---------|
| `client/lib/api-client.ts` | Centralized API client with retry/timeout/auth |
| `client/lib/zeke-api-adapter.ts` | Endpoint-specific API functions |
| `client/lib/query-client.ts` | React Query configuration and URL helpers |

### Minimum Shippable Criteria
- Airstrikes 1-6 must PASS for production deployment
- Airstrikes 7-10 can have isolated failures if pre-existing

---

## Architecture Summary

### API URL Configuration
```typescript
// client/lib/query-client.ts
export function getApiUrl(): string {
  return 'https://zekeai.replit.app';  // CORE API
}

export function getLocalApiUrl(): string {
  return 'https://zekeai.replit.app';  // LOCAL API
}
```

### Routing Classification
```typescript
// client/lib/api-client.ts
const LOCAL_API_PREFIXES = [
  '/api/calendar/',
  '/api/twilio/',
  '/api/sms-log',
  '/api/conversations',
  '/api/zeke/',
];

const CORE_API_PREFIXES = [
  '/api/memories',
  '/api/omi/',
  '/api/semantic-search',
  '/api/chat/',
  '/api/reminders',
  '/healthz',
  '/api/dashboard/',
];
```

### Retry Configuration
```typescript
const maxAttempts = 3;
const retryDelays = [1000, 2000, 4000]; // ms
const retryableStatuses = [408, 429, 500, 502, 503, 504];
// NOTE: 4xx errors (400, 401, 403, 404) are NOT retried
```

---

## Test Execution Guide

### Prerequisites
1. Access to the codebase
2. Development server running (`npm run all:dev`)
3. Ability to read console logs
4. (For Airstrike 10) Ability to toggle airplane mode

### Execution Methods
- **Code Review**: Verify implementation patterns in source files
- **Console Monitoring**: Watch for [api], [auth], [ZekeApiClient] prefixed logs
- **Manual Testing**: Trigger actions in the app and verify behavior

---

## Airstrike Test Scripts

### AIRSTRIKE 1 — CONFIG LOCK

**Objective**: Verify API URLs cannot drift at runtime.

**Steps**:
1. Open `client/lib/query-client.ts`
2. Verify `getApiUrl()` returns hardcoded URL (not env variable)
3. Verify `getLocalApiUrl()` returns hardcoded URL (not env variable)
4. Verify per-request logging in `api-client.ts` shows base URL

**Verification Code Patterns**:
```typescript
// EXPECTED in query-client.ts
export function getApiUrl(): string {
  return 'https://zekeai.replit.app';  // Hardcoded, not process.env
}

export function getLocalApiUrl(): string {
  return 'https://zekeai.replit.app';  // Hardcoded, not process.env
}

// EXPECTED per-request logging in api-client.ts
console.log(`[api] ${method} ${endpoint} → ${baseUrl}`);
```

**Pass Criteria**:
- [ ] `getApiUrl()` returns hardcoded string
- [ ] `getLocalApiUrl()` returns hardcoded string
- [ ] No runtime URL switching logic
- [ ] Per-request URL logging present (shows base URL in console)

**Fail Indicators**:
- URL comes from `process.env.EXPO_PUBLIC_*`
- Runtime conditionals change URL
- No logging of base URL in requests

---

### AIRSTRIKE 2 — ROUTING PROOF

**Objective**: Verify endpoint routing logs show correct base URL.

**Steps**:
1. Open `client/lib/api-client.ts`
2. Find `determineBaseUrl()` function
3. Verify LOCAL_API_PREFIXES and CORE_API_PREFIXES arrays
4. Check console.log statements include endpoint and base URL

**Verification Code Patterns**:
```typescript
// EXPECTED logging pattern
console.log(`[api] ${method} ${endpoint} → ${baseUrl}`);
```

**Endpoint Classification Table**:
| Prefix | Classification | Base URL | Notes |
|--------|---------------|----------|-------|
| `/api/calendar/*` | LOCAL | getLocalApiUrl() | Google Calendar integration |
| `/api/twilio/*` | LOCAL | getLocalApiUrl() | SMS/Voice via Twilio |
| `/api/sms-log` | LOCAL | getLocalApiUrl() | SMS conversation logs |
| `/api/conversations` | LOCAL | getLocalApiUrl() | Chat conversations |
| `/api/zeke/*` | LOCAL | getLocalApiUrl() | Tasks, Grocery, Contacts |
| `/api/memories` | CORE | getApiUrl() | Contact/Memory storage |
| `/api/omi/*` | CORE | getApiUrl() | Omi wearable data |
| `/api/chat/*` | CORE | getApiUrl() | AI chat messages |
| `/api/reminders` | CORE | getApiUrl() | Legacy reminders (deprecated) |
| `/api/dashboard/*` | CORE | getApiUrl() | Dashboard analytics |

**Pass Criteria**:
- [ ] `determineBaseUrl()` function exists
- [ ] LOCAL_API_PREFIXES array defined
- [ ] CORE_API_PREFIXES array defined
- [ ] Logging shows routing decision

**Fail Indicators**:
- No routing classification
- All endpoints go to same base URL without logic
- Missing logging

---

### AIRSTRIKE 3 — AUTH PIPELINE

**Objective**: Verify authentication headers are injected on all requests.

**Steps**:
1. Open `client/lib/api-client.ts`
2. Find `request()` method
3. Verify `getAuthHeaders()` is called
4. Check headers are merged into fetch options

**Verification Code Patterns**:
```typescript
// EXPECTED in request() method
const authHeaders = getAuthHeaders();
const finalHeaders = { ...authHeaders, ...headers };

// EXPECTED header format
headers['X-ZEKE-Device-Token'] = token;

// EXPECTED logging
console.log(`[auth] Authorization header: Bearer ${token.substring(0, 8)}***`);
```

**Pass Criteria**:
- [ ] `getAuthHeaders()` called in request pipeline
- [ ] Headers merged with request headers
- [ ] Token format is `X-ZEKE-Device-Token`
- [ ] Auth logging present (truncated for security)

**Fail Indicators**:
- Auth headers not injected
- Token exposed in full in logs
- No auth logging

---

### AIRSTRIKE 4 — FAILURE MODES

**Objective**: Verify timeout, retry, and error handling behavior.

**Steps**:
1. Open `client/lib/api-client.ts`
2. Verify timeout configuration (AbortController)
3. Verify retry logic with exponential backoff
4. Verify `ApiError` class with proper context

**Verification Code Patterns**:
```typescript
// EXPECTED timeout handling
const controller = new AbortController();
timeoutId = setTimeout(() => {
  controller.abort();
}, timeoutMs);

// EXPECTED retry logic
const maxAttempts = 3;
const retryDelays = [1000, 2000, 4000];
const retryableStatuses = [408, 429, 500, 502, 503, 504];

for (let attempt = 0; attempt < maxAttempts; attempt++) {
  // ... retry on network error or retryable status
}

// EXPECTED ApiError class
export class ApiError extends Error {
  status?: number;
  url: string;
  method: string;
  bodyText?: string;
}
```

**Retry Behavior Table**:
| Status Code | Description | Retried? |
|-------------|-------------|----------|
| 408 | Request Timeout | YES |
| 429 | Rate Limited | YES |
| 500 | Server Error | YES |
| 502 | Bad Gateway | YES |
| 503 | Service Unavailable | YES |
| 504 | Gateway Timeout | YES |
| 400 | Bad Request | NO |
| 401 | Unauthorized | NO |
| 403 | Forbidden | NO |
| 404 | Not Found | NO (fallback to empty array if configured) |

**Pass Criteria**:
- [ ] AbortController used for timeout
- [ ] Default timeout is 10000ms (10s)
- [ ] 3 retry attempts configured
- [ ] Backoff delays: 1s, 2s, 4s
- [ ] Only 5xx/429/408 statuses retried
- [ ] 4xx statuses NOT retried
- [ ] ApiError class includes context

**Fail Indicators**:
- No timeout configured
- All errors retried (including 4xx)
- No exponential backoff
- Errors thrown without context

---

### AIRSTRIKE 5 — CHAT PIPELINE

**Objective**: Verify chat message send and history retrieval.

**Steps**:
1. Open `client/screens/ChatScreen.tsx`
2. Verify message send uses `apiClient.post()`
3. Verify history uses `useQuery()` with proper queryKey
4. Check optimistic UI and cache invalidation

**Verification Code Patterns**:
```typescript
// EXPECTED message send
const data = await apiClient.post(
  `/api/chat/sessions/${sessionId}/messages`,
  { content: messageContent }
);

// EXPECTED history query
const { data: messagesData } = useQuery<ApiChatMessage[]>({
  queryKey: ['chat-messages', sessionId],
  queryFn: () => getChatHistory(sessionId),
});

// EXPECTED optimistic UI
setOptimisticMessages(prev => [...prev, tempMessage]);
// On success:
setOptimisticMessages(prev => prev.filter(m => m.id !== tempId));
```

**Pass Criteria**:
- [ ] Messages sent via `apiClient.post()`
- [ ] Endpoint: `/api/chat/sessions/{id}/messages`
- [ ] History loaded via React Query
- [ ] Optimistic updates implemented
- [ ] Cache invalidated on new message
- [ ] Error alerts shown on failure

**Fail Indicators**:
- Direct fetch() calls bypassing apiClient
- No cache invalidation
- No optimistic UI
- Silent failures

---

### AIRSTRIKE 6 — CRUD GAUNTLET

**Objective**: Verify all CRUD operations for Tasks and Groceries.

**Steps**:
1. Open `client/lib/zeke-api-adapter.ts`
2. Verify all 8 CRUD functions exist
3. Open `client/screens/TasksScreen.tsx` and `GroceryScreen.tsx`
4. Verify screens use adapter functions

**CRUD Function Table**:
| Entity | Operation | Function | Endpoint | Method |
|--------|-----------|----------|----------|--------|
| Task | Create | `createTask()` | `/api/zeke/tasks` | POST |
| Task | Read | `getAllTasks()` | `/api/zeke/tasks` | GET |
| Task | Update | `updateTask()` | `/api/zeke/tasks/{id}` | PATCH |
| Task | Delete | `deleteTask()` | `/api/zeke/tasks/{id}` | DELETE |
| Grocery | Create | `createGroceryItem()` | `/api/zeke/grocery` | POST |
| Grocery | Read | `getGroceryItems()` | `/api/zeke/grocery` | GET |
| Grocery | Update | `updateGroceryItem()` | `/api/zeke/grocery/{id}` | PATCH |
| Grocery | Delete | `deleteGroceryItem()` | `/api/zeke/grocery/{id}` | DELETE |

**Pass Criteria**:
- [ ] All 8 CRUD functions exist
- [ ] All use `apiClient.get/post/patch/delete()`
- [ ] Correct endpoints and methods
- [ ] Cache invalidation on mutations
- [ ] No duplicate requests

**Fail Indicators**:
- Missing CRUD functions
- Direct fetch() calls
- Wrong HTTP methods
- No cache refresh

---

### AIRSTRIKE 7 — CONTACTS + IMPORT

**Objective**: Verify contact CRUD and import functionality.

**Steps**:
1. Open `client/lib/zeke-api-adapter.ts`
2. Verify contact functions exist
3. Open `client/screens/ContactsScreen.tsx`
4. Verify import uses device contacts

**Contact Function Table**:
| Operation | Function | Endpoint | Method |
|-----------|----------|----------|--------|
| Create | `createContact()` | `/api/memories` | POST |
| Read | `getContacts()` | `/api/memories?type=contact` | GET |
| Update | `updateContact()` | `/api/memories/{id}` | PATCH |
| Delete | `deleteContact()` | `/api/memories/{id}` | DELETE |
| Import | `importContacts()` | `/api/memories/batch` | POST |

**Pass Criteria**:
- [ ] All contact CRUD functions exist
- [ ] Endpoint: `/api/memories` with type=contact
- [ ] Import uses batch endpoint
- [ ] Device contacts accessed via expo-contacts
- [ ] Duplicate detection on import
- [ ] Cache invalidation after import

**Fail Indicators**:
- Missing import function
- No duplicate detection
- Mock data used instead of device contacts

---

### AIRSTRIKE 8 — CALENDAR + DATE RANGE

**Objective**: Verify calendar endpoints route to LOCAL API.

**Steps**:
1. Open `client/lib/zeke-api-adapter.ts`
2. Find all calendar-related functions
3. Verify all use `/api/calendar/` prefix
4. Confirm routing goes to LOCAL

**Calendar Function Table**:
| Function | Endpoint | Routing |
|----------|----------|---------|
| `getCalendarEvents()` | `/api/calendar/events` | LOCAL |
| `getCalendarEvent()` | `/api/calendar/events/{id}` | LOCAL |
| `createCalendarEvent()` | `/api/calendar/events` | LOCAL |
| `updateCalendarEvent()` | `/api/calendar/events/{id}` | LOCAL |
| `deleteCalendarEvent()` | `/api/calendar/events/{id}` | LOCAL |
| `getCalendarList()` | `/api/calendar/calendars` | LOCAL |

**Pass Criteria**:
- [ ] All calendar endpoints use `/api/calendar/` prefix
- [ ] All route to LOCAL (not CORE)
- [ ] Date range queries supported
- [ ] No CORE API overlap

**Fail Indicators**:
- Calendar endpoints route to CORE
- Missing date range support
- Mixed routing

---

### AIRSTRIKE 9 — TWILIO / SMS

**Objective**: Verify SMS/Twilio endpoints route to LOCAL API with no 4xx retry spam.

**Steps**:
1. Open `client/lib/zeke-api-adapter.ts`
2. Find all Twilio/SMS functions
3. Verify all use `/api/twilio/` or `/api/sms-log` prefix
4. Confirm 4xx errors are NOT retried

**Twilio Function Table**:
| Function | Endpoint | Method | Routing |
|----------|----------|--------|---------|
| `getTwilioConversations()` | `/api/twilio/sms/conversations` | GET | LOCAL |
| `getTwilioConversation()` | `/api/twilio/sms/conversation/{phone}` | GET | LOCAL |
| `sendSms()` | `/api/twilio/sms/send` | POST | LOCAL |
| `initiateCall()` | `/api/twilio/call/initiate` | POST | LOCAL |
| `getTwilioCalls()` | `/api/twilio/calls` | GET | LOCAL |
| `getTwilioPhoneNumber()` | `/api/twilio/phone-number` | GET | LOCAL |
| `getSmsConversations()` | `/api/sms-log` | GET | LOCAL |

**Pass Criteria**:
- [ ] All Twilio endpoints use `/api/twilio/` prefix
- [ ] All route to LOCAL (not CORE)
- [ ] 4xx errors NOT retried (only 5xx/429/408)
- [ ] Phone numbers URL encoded
- [ ] Auto-refresh on conversation queries

**Fail Indicators**:
- Twilio endpoints route to CORE
- 4xx errors cause retry loops
- Phone numbers not encoded

---

### AIRSTRIKE 10 — OFFLINE → RECOVERY

**Objective**: Verify app recovers cleanly after network loss.

**Steps**:
1. Turn airplane mode ON
2. Trigger a request (send message, load data, etc.)
3. Observe error message
4. Turn airplane mode OFF
5. Trigger the SAME request again
6. Verify request succeeds

**Verification Code Patterns**:
```typescript
// EXPECTED network error detection
const isNetworkError = error instanceof TypeError && error.message.includes('fetch');

// EXPECTED retry on network error
if (isNetworkError && attempt < maxAttempts - 1) {
  await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
  continue;
}

// EXPECTED error handling in screens
catch (error) {
  setIsLoading(false);  // Clear loading state
  Alert.alert('Error', error.message);  // Show user-friendly error
}
```

**Pass Criteria**:
- [ ] Error shown while offline (Alert.alert)
- [ ] Loading state cleared on error
- [ ] No stuck spinners
- [ ] Request succeeds after reconnect
- [ ] No app restart required
- [ ] Manual refetch available (pull-to-refresh)

**Fail Indicators**:
- App crashes on network error
- Stuck loading state
- Requires app restart
- No error message shown

---

## Quick Reference Checklist

### Pre-Deployment Checklist

```
AIRSTRIKE 1 — CONFIG LOCK
[ ] getApiUrl() hardcoded
[ ] getLocalApiUrl() hardcoded
[ ] Boot logging present

AIRSTRIKE 2 — ROUTING PROOF
[ ] LOCAL_API_PREFIXES defined
[ ] CORE_API_PREFIXES defined
[ ] Routing logs present

AIRSTRIKE 3 — AUTH PIPELINE
[ ] X-ZEKE-Device-Token injected
[ ] Auth logging (truncated)

AIRSTRIKE 4 — FAILURE MODES
[ ] 10s timeout configured
[ ] 3 retries with backoff
[ ] Only 5xx/429/408 retried
[ ] ApiError class with context

AIRSTRIKE 5 — CHAT PIPELINE
[ ] Message send via apiClient
[ ] History via React Query
[ ] Optimistic UI
[ ] Cache invalidation

AIRSTRIKE 6 — CRUD GAUNTLET
[ ] 4 Task operations
[ ] 4 Grocery operations
[ ] All via apiClient

--- MINIMUM SHIPPABLE: Airstrikes 1-6 PASS ---

AIRSTRIKE 7 — CONTACTS + IMPORT
[ ] Contact CRUD
[ ] Batch import
[ ] Duplicate detection

AIRSTRIKE 8 — CALENDAR + DATE RANGE
[ ] All /api/calendar/* LOCAL
[ ] Date range queries

AIRSTRIKE 9 — TWILIO / SMS
[ ] All /api/twilio/* LOCAL
[ ] No 4xx retry spam

AIRSTRIKE 10 — OFFLINE → RECOVERY
[ ] Error shown offline
[ ] Recovers on reconnect
[ ] No restart needed
```

### GO / NO-GO Decision Matrix

| Scenario | Decision |
|----------|----------|
| Airstrikes 1-6 PASS | GO (Minimum Shippable) |
| Airstrikes 1-10 PASS | GO (Full Validation) |
| Any Airstrike 1-6 FAIL | NO-GO (Fix Required) |
| Airstrike 7-10 FAIL (isolated) | GO (Known Issues) |

---

## Troubleshooting

### Common Issues

**Issue**: API calls going to wrong base URL
**Solution**: Check `determineBaseUrl()` in api-client.ts, verify endpoint prefix matches LOCAL_API_PREFIXES or CORE_API_PREFIXES

**Issue**: Auth headers not appearing in requests
**Solution**: Verify `getAuthHeaders()` is called in request pipeline, check token is set via `setDeviceToken()`

**Issue**: 4xx errors causing retry loops
**Solution**: Verify `retryableStatuses` array only contains 408, 429, 500, 502, 503, 504

**Issue**: Stuck loading state after error
**Solution**: Ensure catch blocks call `setIsLoading(false)` before throwing/alerting

**Issue**: Cache not refreshing after mutation
**Solution**: Add `queryClient.invalidateQueries({ queryKey: [...] })` in onSuccess handlers

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12-20 | Initial airstrike test documentation |

---

## Contact

For questions about this testing methodology, refer to the implementation files:
- `client/lib/api-client.ts` — Core API client
- `client/lib/zeke-api-adapter.ts` — Endpoint adapters
- `client/lib/query-client.ts` — React Query config

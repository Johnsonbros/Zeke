# ZEKE Backend API Specification

## Overview

The ZEKE Mobile App communicates with an external backend at `https://zekeai.replit.app`. This document provides detailed specifications for implementing two missing endpoints that the mobile app expects.

## Architecture Context

The mobile app uses a **proxy pattern**:
- Local Express server runs at `localhost:5000`
- Requests to `/api/zeke/*` are forwarded to `https://zekeai.replit.app/api/*`
- Authentication uses HMAC signatures with the following headers:
  - `X-Zeke-Proxy-Id`: `zeke-mobile-proxy`
  - `X-ZEKE-Timestamp`: Unix timestamp
  - `X-ZEKE-Nonce`: Random 32-character hex string
  - `X-ZEKE-Signature`: HMAC-SHA256 signature
  - `X-Zeke-Request-Id`: Unique request ID for tracing
  - `x-zeke-device-token`: Device authentication token

---

## Missing Endpoint #1: Dashboard Summary

### Endpoint
```
GET /api/dashboard
```

### Purpose
Provides a summary of the user's data for the home screen quick stats display.

### Request Headers
```
Content-Type: application/json
X-Zeke-Proxy-Id: zeke-mobile-proxy
X-ZEKE-Timestamp: <unix_timestamp>
X-ZEKE-Nonce: <32_char_hex>
X-ZEKE-Signature: <hmac_signature>
x-zeke-device-token: <device_token>
```

### Response Schema

**Success (200 OK)**:
```typescript
interface DashboardSummary {
  eventsCount: number;        // Number of calendar events for today
  pendingTasksCount: number;  // Number of incomplete/pending tasks
  groceryItemsCount: number;  // Number of items on grocery list (not purchased)
  memoriesCount: number;      // Total number of saved memories
  userName?: string;          // User's display name (optional)
}
```

**Example Response**:
```json
{
  "eventsCount": 3,
  "pendingTasksCount": 7,
  "groceryItemsCount": 12,
  "memoriesCount": 45,
  "userName": "John"
}
```

**Error Response (4xx/5xx)**:
```json
{
  "error": "Not Found",
  "message": "API endpoint not found",
  "path": "/api/dashboard"
}
```

### Implementation Notes

1. The mobile app calls this endpoint on home screen load
2. Data should be computed from existing collections:
   - `eventsCount`: Count calendar events where `startTime` is today
   - `pendingTasksCount`: Count tasks where `status !== 'completed'`
   - `groceryItemsCount`: Count grocery items where `isPurchased !== true`
   - `memoriesCount`: Total count of memory documents
3. Response time should be under 500ms (cached aggregations recommended)
4. If the endpoint returns 404, the mobile app falls back to making 3 separate API calls

---

## Missing Endpoint #2: Notifications

### Endpoints

#### GET /api/notifications
Retrieves user notifications.

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | No | Maximum notifications to return (default: 20) |
| `unreadOnly` | boolean | No | If `true`, only return unread notifications |

**Request Headers**:
```
Content-Type: application/json
X-Zeke-Proxy-Id: zeke-mobile-proxy
X-ZEKE-Timestamp: <unix_timestamp>
X-ZEKE-Nonce: <32_char_hex>
X-ZEKE-Signature: <hmac_signature>
x-zeke-device-token: <device_token>
```

**Response Schema**:

**Success (200 OK)**:
```typescript
interface ZekeNotification {
  id: string;                           // Unique notification ID
  type: "info" | "success" | "warning" | "error" | "reminder" | "news";
  title: string;                        // Notification title
  message: string;                      // Notification body text
  timestamp: string;                    // ISO 8601 datetime
  read: boolean;                        // Has user seen this notification
  actionType?: string;                  // Optional: Action to take on tap
  actionData?: Record<string, unknown>; // Optional: Data for the action
}

interface NotificationsResponse {
  notifications: ZekeNotification[];
}
```

**Example Response**:
```json
{
  "notifications": [
    {
      "id": "notif_abc123",
      "type": "reminder",
      "title": "Meeting in 15 minutes",
      "message": "Weekly standup with the team",
      "timestamp": "2024-12-31T10:45:00Z",
      "read": false,
      "actionType": "openCalendar",
      "actionData": {
        "eventId": "event_xyz789"
      }
    },
    {
      "id": "notif_def456",
      "type": "news",
      "title": "Morning Briefing Ready",
      "message": "Your personalized news summary is available",
      "timestamp": "2024-12-31T07:00:00Z",
      "read": true
    }
  ]
}
```

**Empty Response**:
```json
{
  "notifications": []
}
```

---

#### POST /api/notifications/:id/dismiss
Marks a notification as read/dismissed.

**URL Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Notification ID to dismiss |

**Request Headers**:
Same as GET endpoint.

**Response Schema**:

**Success (200 OK)**:
```json
{
  "success": true,
  "notificationId": "notif_abc123"
}
```

**Not Found (404)**:
```json
{
  "error": "Notification not found",
  "notificationId": "notif_abc123"
}
```

---

#### PATCH /api/notifications/:id
Updates notification properties (e.g., marking as read).

**URL Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Notification ID to update |

**Request Body**:
```json
{
  "read": true
}
```

**Response Schema**:

**Success (200 OK)**:
```json
{
  "success": true
}
```

---

## Notification Types and Use Cases

| Type | Use Case | Example |
|------|----------|---------|
| `info` | General information | "New feature available" |
| `success` | Successful operations | "Memory saved successfully" |
| `warning` | Warnings requiring attention | "Low battery on pendant" |
| `error` | Errors or failures | "Sync failed, retry needed" |
| `reminder` | Calendar/task reminders | "Meeting in 15 minutes" |
| `news` | News briefing notifications | "Morning briefing ready" |

---

## Action Types for Notifications

When `actionType` is provided, the mobile app will navigate accordingly:

| actionType | actionData | Behavior |
|------------|------------|----------|
| `openCalendar` | `{ eventId: string }` | Opens calendar event detail |
| `openTask` | `{ taskId: string }` | Opens task detail |
| `openMemory` | `{ memoryId: string }` | Opens memory detail |
| `openNews` | `{}` | Opens news briefing |
| `openSettings` | `{ section?: string }` | Opens settings (optional section) |
| `openUrl` | `{ url: string }` | Opens external URL in browser |

---

## Database Schema Recommendations

### notifications collection
```typescript
{
  _id: ObjectId,
  userId: string,           // User identifier
  deviceId?: string,        // Optional device-specific notification
  type: string,             // info | success | warning | error | reminder | news
  title: string,
  message: string,
  timestamp: Date,
  read: boolean,
  dismissed: boolean,
  actionType?: string,
  actionData?: object,
  expiresAt?: Date,         // Optional: Auto-delete after this date
  createdAt: Date,
  updatedAt: Date
}

// Indexes
{ userId: 1, read: 1, timestamp: -1 }
{ userId: 1, dismissed: 1 }
{ expiresAt: 1 }  // For TTL cleanup
```

---

## Error Handling

All endpoints should return consistent error responses:

```typescript
interface ErrorResponse {
  error: string;      // Error type (e.g., "Not Found", "Unauthorized")
  message: string;    // Human-readable message
  path?: string;      // Request path for debugging
  requestId?: string; // Echo back X-Zeke-Request-Id if provided
}
```

**HTTP Status Codes**:
| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request (invalid parameters) |
| 401 | Unauthorized (invalid/missing auth) |
| 404 | Resource not found |
| 429 | Rate limited |
| 500 | Internal server error |

---

## CORS Configuration

Ensure the following headers are set:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-Zeke-Proxy-Id, X-ZEKE-Timestamp, X-ZEKE-Nonce, X-ZEKE-Signature, X-Zeke-Request-Id, x-zeke-device-token
```

---

## Testing

### Dashboard Endpoint Test
```bash
curl -X GET "https://zekeai.replit.app/api/dashboard" \
  -H "Content-Type: application/json" \
  -H "X-Zeke-Proxy-Id: zeke-mobile-proxy" \
  -H "x-zeke-device-token: test_token"
```

Expected: 200 OK with `DashboardSummary` JSON

### Notifications Endpoint Test
```bash
curl -X GET "https://zekeai.replit.app/api/notifications?limit=5&unreadOnly=true" \
  -H "Content-Type: application/json" \
  -H "X-Zeke-Proxy-Id: zeke-mobile-proxy" \
  -H "x-zeke-device-token: test_token"
```

Expected: 200 OK with `{ notifications: [...] }` JSON

---

## Mobile App Fallback Behavior

If these endpoints return 404:

1. **Dashboard**: App makes 3 parallel calls to `/api/calendar/today`, `/api/tasks`, and `/api/grocery` to compute summary locally
2. **Notifications**: App returns empty array `[]` and notifications panel shows "No notifications"

Both fallbacks work but result in degraded user experience and slower load times.

---

## Priority

**HIGH** - Both endpoints are called on every app launch and home screen navigation. Missing endpoints cause visible errors in logs and slower app performance.

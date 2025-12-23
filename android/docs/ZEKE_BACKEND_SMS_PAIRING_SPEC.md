# ZEKE Unified SMS Authentication System

## Overview

This document describes the unified SMS-based authentication system used across all ZEKE clients. The system provides secure 6-digit SMS verification for:
- **Mobile App Device Pairing** - Authenticating the ZEKE Command Center mobile app
- **Web Dashboard Login** - Authenticating admin access to the web UI

Both flows share a centralized verification service (`server/services/smsVerification.ts`) ensuring consistent security policies and code reuse.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Shared SMS Verification Service               │
│                 (server/services/smsVerification.ts)             │
├─────────────────────────────────────────────────────────────────┤
│  - 6-digit code generation (cryptographically secure)           │
│  - Timing-safe code comparison                                   │
│  - Twilio SMS dispatch with context-aware templates             │
│  - Session ID generation                                         │
│  - Expiration and attempt tracking                              │
└─────────────────────────────────────────────────────────────────┘
                    ▲                           ▲
                    │                           │
         ┌──────────┴──────────┐     ┌─────────┴──────────┐
         │   Mobile Pairing    │     │   Web Dashboard    │
         │  (sms-pairing.ts)   │     │   (web-auth.ts)    │
         └─────────────────────┘     └────────────────────┘
```

## Security Configuration

All authentication flows use these consistent security parameters:

| Parameter | Value | Description |
|-----------|-------|-------------|
| Code Length | 6 digits | Numeric verification code |
| Code Expiry | 5 minutes | Time before code becomes invalid |
| Max Attempts | 3 | Failed attempts before code invalidation |
| Device Token | 64 hex chars | 256-bit secure token for mobile |
| Session Token | 64 hex chars | 256-bit secure token for web |
| Web Session Expiry | 30 days | Duration of authenticated web session |

## Mobile App Pairing Flow

### Endpoints

#### `POST /api/auth/request-sms-code`

Generates a 6-digit code and sends it via SMS to the master admin phone.

**Request:**
```json
{
  "deviceName": "iPhone 15 Pro"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "sessionId": "abc123def456...",
  "expiresIn": 300,
  "message": "Verification code sent to your phone"
}
```

**Error Responses:**
```json
// SMS not configured (400)
{
  "success": false,
  "error": "SMS pairing not configured. MASTER_ADMIN_PHONE is not set."
}

// Twilio not ready (400)
{
  "success": false,
  "error": "Twilio not configured. Please connect Twilio integration."
}
```

#### `POST /api/auth/verify-sms-code`

Verifies the 6-digit code and issues a device token for persistent authentication.

**Request:**
```json
{
  "sessionId": "abc123def456...",
  "code": "123456"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "deviceToken": "64-character-hex-token...",
  "deviceId": "device_abc123...",
  "message": "Device paired successfully"
}
```

**Error Responses:**
```json
// Invalid code (400)
{
  "success": false,
  "error": "Invalid code. 2 attempts remaining.",
  "attemptsRemaining": 2
}

// Expired session (400)
{
  "success": false,
  "error": "Session expired or invalid. Please request a new code."
}

// Too many attempts (400)
{
  "success": false,
  "error": "Too many failed attempts. Please request a new code.",
  "attemptsRemaining": 0
}
```

#### `GET /api/auth/pairing-status`

Returns the current SMS pairing configuration status.

**Response:**
```json
{
  "configured": true,
  "pendingCodes": 0
}
```

#### `GET /api/auth/verify-device`

Validates a stored device token (used on app startup).

**Headers:**
```
X-ZEKE-Device-Token: <64-character-hex-token>
```

**Success Response (200):**
```json
{
  "valid": true,
  "deviceId": "device_abc123...",
  "deviceName": "iPhone 15 Pro"
}
```

## Web Dashboard Login Flow

### Endpoints

#### `POST /api/web-auth/request-code`

Generates a 6-digit code for web login (only authorized phone numbers).

**Request:**
```json
{
  "phoneNumber": "+15551234567"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "sessionId": "session_abc123...",
  "expiresIn": 300,
  "message": "Verification code sent"
}
```

**Error Responses:**
```json
// Phone not authorized (403)
{
  "success": false,
  "error": "Phone number not authorized for dashboard access"
}
```

#### `POST /api/web-auth/verify-code`

Verifies the 6-digit code and creates an authenticated session.

**Request:**
```json
{
  "sessionId": "session_abc123...",
  "code": "123456"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "sessionToken": "token...",
  "isAdmin": true,
  "message": "Login successful"
}
```

Sets HttpOnly cookie: `zeke_session` (30-day expiry, SameSite=Lax)

#### `GET /api/web-auth/session`

Checks current authentication status.

**Response (authenticated):**
```json
{
  "authenticated": true,
  "isAdmin": true,
  "phoneNumber": "+1555****567"
}
```

**Response (not authenticated):**
```json
{
  "authenticated": false
}
```

#### `POST /api/web-auth/logout`

Terminates the current session.

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

## Database Schema

### `pairing_codes` table (Mobile App)

```sql
CREATE TABLE pairing_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL,
  device_name TEXT NOT NULL,
  attempts INTEGER DEFAULT 0 NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

### `device_tokens` table (Mobile App)

```sql
CREATE TABLE device_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  device_id TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);
```

### `web_login_codes` table (Web Dashboard)

```sql
CREATE TABLE web_login_codes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  attempts INTEGER DEFAULT 0 NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

### `web_sessions` table (Web Dashboard)

```sql
CREATE TABLE web_sessions (
  id TEXT PRIMARY KEY,
  session_token TEXT NOT NULL UNIQUE,
  phone_number TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_accessed_at TEXT NOT NULL
);
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MASTER_ADMIN_PHONE` | Phone number for SMS verification (E.164 format) | Yes |

The phone number constant is defined in `shared/schema.ts` as `MASTER_ADMIN_PHONE`.

## SMS Message Formats

### Mobile App Pairing
```
ZEKE Pairing: 123456

Enter this code to pair "iPhone 15 Pro". Expires in 5 min.
```

### Web Dashboard Login
```
ZEKE Login: 123456

Enter this code to access the dashboard. Expires in 5 min.
```

## Mobile App Integration

### Authentication Context (React Native)

The mobile app uses `AuthContext.tsx` which provides:

```typescript
interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  deviceId: string | null;
  error: string | null;
  isOfflineMode: boolean;
  
  // SMS-based pairing (primary method)
  requestSmsCode: (deviceName: string) => Promise<SmsCodeResult>;
  verifySmsCode: (sessionId: string, code: string) => Promise<VerifyCodeResult>;
  checkSmsPairingStatus: () => Promise<SmsPairingStatus | null>;
  smsPairingState: SmsPairingState;
  
  // Device management
  checkAuth: () => Promise<boolean>;
  unpairDevice: () => Promise<void>;
}
```

### Pairing Flow

1. User opens app, taps "Send Code to Phone"
2. App calls `POST /api/auth/request-sms-code`
3. Backend generates 6-digit code, stores in DB, sends SMS
4. User receives SMS with verification code
5. User enters code in app (6 input boxes, auto-advances)
6. App calls `POST /api/auth/verify-sms-code`
7. Backend verifies code, issues device token
8. App stores token in SecureStore (native) or localStorage (web)
9. User is authenticated and can access ZEKE features

### Token Storage

- **iOS/Android**: Stored in Expo SecureStore (encrypted)
- **Web**: Stored in localStorage
- **Offline Support**: Cached auth valid for 7 days without re-verification

## API Route Protection

Protected routes require the `X-ZEKE-Device-Token` header:

```typescript
const PROTECTED_ROUTE_PATTERNS = [
  '/api/tasks',
  '/api/grocery',
  '/api/lists',
  '/api/contacts',
  '/api/chat',
  '/api/dashboard',
  '/api/memories',
  '/api/conversations',
];
```

The `mobileAuth.ts` middleware validates device tokens and optionally supports HMAC signature verification for additional security.

## Files Reference

| File | Purpose |
|------|---------|
| `server/services/smsVerification.ts` | Shared SMS verification service |
| `server/sms-pairing.ts` | Mobile app SMS pairing endpoints |
| `server/web-auth.ts` | Web dashboard authentication endpoints |
| `server/mobileAuth.ts` | Device token validation middleware |
| `shared/schema.ts` | Database schemas and types |
| `android/client/context/AuthContext.tsx` | Mobile app auth context |
| `client/src/pages/login.tsx` | Web dashboard login page |
| `client/src/contexts/auth-context.tsx` | Web dashboard auth context |

## Migration Notes

### Deprecated: Legacy Secret-Based Pairing

The following legacy authentication method has been deprecated:
- `POST /api/auth/pair` (uses `ZEKE_SHARED_SECRET`)
- `GET /api/auth/verify`

These endpoints are no longer registered in `routes.ts` and are scheduled for removal in the next version. All clients should use SMS-based pairing exclusively.

### Update from 4-digit to 6-digit Codes

As of December 2024, all verification codes are 6 digits (previously 4 digits). Ensure mobile app clients are updated to accept 6-digit input fields.

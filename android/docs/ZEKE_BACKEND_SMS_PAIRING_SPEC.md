# ZEKE Backend SMS Pairing Integration Spec

## Overview

This document describes the SMS-based device pairing flow implemented in the ZEKE Command Center mobile app. The pairing allows users to securely connect their mobile devices to the ZEKE backend using a 4-digit verification code sent via SMS.

## Architecture

The current implementation handles SMS pairing **locally** on the Command Center backend (this Replit project). However, if you want to move this functionality to the main ZEKE backend (`zekeai.replit.app`), this spec provides the contract.

## Current Implementation (Command Center)

The Command Center already handles:
1. Generating 4-digit codes
2. Storing codes in PostgreSQL with 5-minute expiry
3. Sending SMS via Twilio integration
4. Verifying codes and issuing device tokens
5. Storing device tokens for persistent auth

### Endpoints Created

#### `POST /api/auth/request-sms-code`

Generates a 4-digit code and sends it via SMS to the master phone number.

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

**Error Response (400):**
```json
{
  "success": false,
  "error": "SMS pairing not configured. Please set ZEKE_MASTER_PHONE."
}
```

#### `POST /api/auth/verify-sms-code`

Verifies the code and issues a device token for persistent authentication.

**Request:**
```json
{
  "sessionId": "abc123def456...",
  "code": "1234"
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

**Error Responses (400):**

Invalid code:
```json
{
  "success": false,
  "error": "Invalid code. 2 attempts remaining.",
  "attemptsRemaining": 2
}
```

Expired session:
```json
{
  "success": false,
  "error": "Session expired or invalid. Please request a new code."
}
```

Too many attempts:
```json
{
  "success": false,
  "error": "Too many failed attempts. Please request a new code.",
  "attemptsRemaining": 0
}
```

#### `GET /api/auth/pairing-status`

Returns the current pairing configuration status.

**Response:**
```json
{
  "configured": true,
  "pendingCodes": 0
}
```

## Database Schema

### `pairing_codes` table

```sql
CREATE TABLE pairing_codes (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL,
  device_name TEXT NOT NULL,
  attempts INTEGER DEFAULT 0 NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
```

### `device_tokens` table (existing)

```sql
CREATE TABLE device_tokens (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  device_id VARCHAR NOT NULL UNIQUE,
  device_name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  last_used_at TIMESTAMP DEFAULT NOW() NOT NULL
);
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ZEKE_MASTER_PHONE` | Phone number to receive pairing codes (E.164 format, e.g., +1234567890) | Yes |
| `ZEKE_SHARED_SECRET` | Existing secret for legacy pairing (still supported) | Optional |

## SMS Message Format

The SMS sent to the master phone number:

```
ZEKE Pairing Code: 1234

Enter this code in the app to pair "iPhone 15 Pro". Expires in 5 minutes.
```

## Security Considerations

1. **Rate Limiting**: Maximum 3 attempts per session before code invalidation
2. **Expiry**: Codes expire after 5 minutes
3. **One-time Use**: Codes are deleted after successful verification
4. **Secure Token**: Device tokens are 64-character hex strings (256 bits of entropy)
5. **Database Storage**: Pending codes stored in PostgreSQL, auto-cleaned on expiry

## Twilio Integration

The SMS is sent using the Twilio integration. The Twilio credentials are managed by Replit's integration system:

```typescript
import { sendSms } from "./twilio";

await sendSms(
  MASTER_PHONE_NUMBER,
  `ZEKE Pairing Code: ${code}\n\nEnter this code in the app to pair "${deviceName}". Expires in 5 minutes.`
);
```

## Mobile App Flow

1. User opens app, sees "Send Code to Phone" button
2. User taps button
3. App calls `POST /api/auth/request-sms-code`
4. Backend generates code, stores in DB, sends SMS
5. User receives SMS with 4-digit code
6. User enters code in app (4 separate input boxes, auto-advances)
7. App calls `POST /api/auth/verify-sms-code`
8. Backend verifies code, issues device token
9. App stores token in SecureStore (native) or localStorage (web)
10. User is now authenticated and can access all ZEKE features

## Integration with ZEKE Backend (Optional)

If the ZEKE backend (`zekeai.replit.app`) wants to handle SMS pairing directly:

1. Implement the two endpoints above
2. Configure Twilio credentials
3. Set `ZEKE_MASTER_PHONE` environment variable
4. The Command Center can proxy requests to `/api/zeke/auth/request-sms-code` and `/api/zeke/auth/verify-sms-code`

The current implementation keeps SMS pairing local to the Command Center for:
- Lower latency (no proxy needed)
- Direct Twilio access via Replit integration
- Simpler deployment

## Testing

To test the SMS pairing:

1. Set `ZEKE_MASTER_PHONE` to your phone number (E.164 format)
2. Open the app in Expo Go or web browser
3. Tap "Send Code to Phone"
4. Check your phone for SMS
5. Enter the 4-digit code
6. Verify authentication succeeds

## Files Changed

- `server/sms-pairing.ts` - SMS pairing logic
- `server/routes.ts` - Added pairing endpoints
- `shared/schema.ts` - Added `pairing_codes` table
- `client/screens/PairingScreen.tsx` - Updated UI for SMS pairing
- `client/context/AuthContext.tsx` - Added SMS pairing methods

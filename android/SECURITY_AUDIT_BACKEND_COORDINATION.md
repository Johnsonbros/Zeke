# ZEKE Mobile Proxy Security Audit - Backend Coordination

## Overview
A comprehensive security audit was performed on the ZEKE AI Companion mobile proxy. This document outlines the fixes implemented and the corresponding changes required on the ZEKE backend to ensure compatibility.

---

## CRITICAL: HMAC Signature Format Alignment

### Issue Found
The mobile proxy's `signRequest()` and `verifySignature()` functions were using **completely different payload formats**, rendering the HMAC security layer non-functional.

### Fix Implemented (Mobile Proxy)
We've standardized on the following signature format:

```
Payload: ${timestamp}.${nonce}.${METHOD}.${path}.${bodyHash}
```

Where:
- `timestamp` = Unix timestamp in **SECONDS** (not milliseconds)
- `nonce` = 32-character hex string from `crypto.randomBytes(16)`
- `METHOD` = HTTP method in UPPERCASE (GET, POST, PATCH, DELETE)
- `path` = Request path, **URL-decoded** (e.g., `/api/tasks/hello world` not `/api/tasks/hello%20world`)
- `bodyHash` = SHA-256 hash of request body (or empty string for no body)

**Important**: Both sides must use the same path encoding. We normalize by URL-decoding the path before hashing.

### Backend Action Required
Ensure your signature verification uses the **exact same payload format**:

```typescript
// Backend verification should build payload like this:
function normalizePath(path: string): string {
  try { return decodeURIComponent(path); } catch { return path; }
}

const normalizedPath = normalizePath(path);
const bodyHash = crypto.createHash("sha256").update(body || "").digest("hex");
const payload = `${timestamp}.${nonce}.${method.toUpperCase()}.${normalizedPath}.${bodyHash}`;
const expectedSignature = crypto.createHmac("sha256", SHARED_SECRET).update(payload).digest("hex");
```

### Headers Sent by Mobile Proxy
```
X-Zeke-Proxy-Id: <proxy identifier>
X-ZEKE-Timestamp: <unix seconds>
X-ZEKE-Nonce: <32-char hex>
X-ZEKE-Signature: <HMAC-SHA256 hex>
X-Zeke-Request-Id: <request tracking ID>
```

---

## SMS Pairing Code Changes

### Issue Found
- Pairing codes were generated using `Math.random()` (not cryptographically secure)
- Only 4-digit codes (9,000 combinations)
- No rate limiting on code requests

### Fix Implemented
- Now using `crypto.randomInt(100000, 999999)` for 6-digit codes
- Rate limiting: 3 requests per minute per IP address
- Returns `429 Too Many Requests` with `Retry-After` header when rate limited

### Backend Action Required
**None required** - These changes are local to the mobile proxy's SMS pairing flow.

---

## Device Token Expiration

### Issue Found
Device tokens never expired, creating long-term security risk.

### Fix Implemented
- Device tokens now expire after **30 days** from creation
- Expired tokens are automatically cleaned up during validation
- Token expiration date is now returned in device list API

### Backend Action Required
If your backend validates device tokens independently:
- Consider implementing matching 30-day expiration
- Or trust the mobile proxy's validation (tokens won't reach backend if expired)

---

## Security Endpoint Protection

### Issue Found
`/api/zeke/security/status` was exposed as a public route, leaking security configuration details.

### Fix Implemented
Removed from `PUBLIC_ROUTES` - now requires authentication.

### Backend Action Required
**None required** - This was a mobile proxy misconfiguration.

---

## Cache Key Security

### Issue Found
Anonymous (unauthenticated) requests were cached under `endpoint:anonymous` key, potentially leaking data.

### Fix Implemented
Anonymous requests now use `endpoint:no-cache` key and are not served from cache.

### Backend Action Required
**None required** - Cache is local to mobile proxy.

---

## Production Mode Security

### Issue Found
When `ZEKE_SHARED_SECRET` was not configured, all authentication was bypassed.

### Fix Implemented
- In `NODE_ENV=production`, missing secret now returns 500 error
- Development mode still allows bypass with warning log

### Backend Action Required
Ensure `ZEKE_SHARED_SECRET` is properly configured in production environments.

---

## Logging Security

### Issue Found
Headers containing auth tokens and error response bodies were logged in plaintext.

### Fix Implemented
- In production mode, sensitive headers are redacted
- Error response bodies are not logged in production

### Backend Action Required
**None required** - Consider implementing similar logging hygiene.

---

## Verification Checklist for Backend Team

1. [ ] Verify HMAC signature payload format matches: `${timestamp}.${nonce}.${METHOD}.${path}.${bodyHash}`
2. [ ] Confirm timestamps are expected in **SECONDS** (not milliseconds)
3. [ ] Ensure 5-minute timestamp tolerance is configured
4. [ ] Verify `ZEKE_SHARED_SECRET` is set in production
5. [ ] (Optional) Implement matching 30-day device token expiration

---

## Testing the Signature

Here's a test case to verify signature compatibility:

```typescript
// Test values
const method = "GET";
const path = "/api/tasks";
const body = "";
const timestamp = "1703376000";  // Unix seconds
const nonce = "a1b2c3d4e5f6789012345678901234ab";
const sharedSecret = "test-secret-key-at-least-32-characters";

// Expected payload
const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
const payload = `${timestamp}.${nonce}.${method}.${path}.${bodyHash}`;
// payload = "1703376000.a1b2c3d4e5f6789012345678901234ab.GET./api/tasks.e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

const signature = crypto.createHmac("sha256", sharedSecret).update(payload).digest("hex");
```

---

## Contact

If you have questions about these changes, please reach out to the mobile app team.

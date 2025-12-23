# ZEKE Mobile App Security Compliance Sprint

## Context

The ZEKE proxy server has been security-hardened with the following changes that require mobile app updates:

1. **SMS pairing codes upgraded from 4-digit to 6-digit** (crypto-secure generation)
2. **Rate limiting added**: 3 requests/minute per IP, returns 429 with Retry-After header
3. **Device tokens now expire after 30 days**
4. **Production logging redacts sensitive data**

This document provides implementation tasks for the ZEKEapp companion mobile app.

---

## TASK 1: Update SMS Pairing to 6-Digit Codes

### File: `client/screens/PairingScreen.tsx`

#### 1.1 Update state initialization (line ~51)

```typescript
// BEFORE:
const [code, setCode] = useState(["", "", "", ""]);

// AFTER:
const [code, setCode] = useState(["", "", "", "", "", ""]);
```

#### 1.2 Update paste handler (line ~126)

```typescript
// BEFORE:
const digits = value.replace(/\D/g, '').slice(0, 4).split('');
const newCode = ["", "", "", ""];

// AFTER:
const digits = value.replace(/\D/g, '').slice(0, 6).split('');
const newCode = ["", "", "", "", "", ""];
```

#### 1.3 Update auto-focus on paste (line ~133-136)

```typescript
// BEFORE:
if (digits.length === 4) {
  inputRefs.current[3]?.focus();
} else if (digits.length > 0) {
  inputRefs.current[Math.min(digits.length, 3)]?.focus();
}

// AFTER:
if (digits.length === 6) {
  inputRefs.current[5]?.focus();
} else if (digits.length > 0) {
  inputRefs.current[Math.min(digits.length, 5)]?.focus();
}
```

#### 1.4 Update auto-advance on single digit (line ~146)

```typescript
// BEFORE:
if (value && index < 3) {

// AFTER:
if (value && index < 5) {
```

#### 1.5 Update validation (line ~159-160)

```typescript
// BEFORE:
if (finalCode.length !== 4) {
  setLocalError("Please enter all 4 digits");

// AFTER:
if (finalCode.length !== 6) {
  setLocalError("Please enter all 6 digits");
```

#### 1.6 Update reset states (line ~178 and ~204)

```typescript
// BEFORE:
setCode(["", "", "", ""]);

// AFTER:
setCode(["", "", "", "", "", ""]);
```

#### 1.7 Update UI text (line ~314)

```typescript
// BEFORE:
Enter the 4-digit code below

// AFTER:
Enter the 6-digit code below
```

#### 1.8 Update first input maxLength (line ~332)

```typescript
// BEFORE:
maxLength={index === 0 ? 4 : 1}

// AFTER:
maxLength={index === 0 ? 6 : 1}
```

#### 1.9 Adjust input container styling for 6 inputs

```typescript
// May need to reduce gap/width to fit 6 inputs comfortably on screen:
codeInputContainer: {
  flexDirection: "row",
  justifyContent: "center",
  gap: 8, // Reduce from 12 if needed
},

codeInput: {
  width: 44, // Reduce from 52 if needed to fit 6 inputs
  height: 56,
},
```

### File: `client/context/AuthContext.tsx`

#### 1.10 Update documentation comment (line ~12)

```typescript
// BEFORE:
* - verifySmsCode() - Verifies 4-digit SMS code

// AFTER:
* - verifySmsCode() - Verifies 6-digit SMS code
```

---

## TASK 2: Handle Rate Limiting (429 Errors)

### File: `client/lib/api-client.ts`

#### 2.1 Add RateLimitError class

```typescript
export class RateLimitError extends Error {
  public retryAfterSeconds: number;
  
  constructor(retryAfter: number) {
    super(`Rate limited. Try again in ${retryAfter} seconds.`);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfter;
  }
}
```

#### 2.2 Add 429 handling in fetch wrapper

In the response handling section, add before other error checks:

```typescript
if (response.status === 429) {
  const retryAfter = parseInt(response.headers.get("Retry-After") || "60", 10);
  throw new RateLimitError(retryAfter);
}
```

### File: `client/context/AuthContext.tsx`

#### 2.3 Update SmsCodeResult interface

```typescript
interface SmsCodeResult {
  success: boolean;
  sessionId?: string;
  expiresIn?: number;
  error?: string;
  retryAfterSeconds?: number; // ADD THIS FIELD
}
```

#### 2.4 Update requestSmsCode catch block to handle RateLimitError

```typescript
} catch (error) {
  console.error("[Auth] SMS code request error:", error);
  
  // ADD: Handle rate limit error
  if (error instanceof RateLimitError) {
    const errorMessage = `Too many requests. Please wait ${error.retryAfterSeconds} seconds.`;
    setState((prev) => ({ ...prev, isLoading: false, error: errorMessage }));
    return { 
      success: false, 
      error: errorMessage,
      retryAfterSeconds: error.retryAfterSeconds 
    };
  }
  
  const errorMessage =
    error instanceof ApiError
      ? error.message
      : "Connection error. Please try again.";
  setState((prev) => ({ ...prev, isLoading: false, error: errorMessage }));
  return { success: false, error: errorMessage };
}
```

#### 2.5 Import RateLimitError at top of file

```typescript
import { apiClient, ApiError, RateLimitError } from "@/lib/api-client";
```

### File: `client/screens/PairingScreen.tsx`

#### 2.6 Add rate limit countdown state

```typescript
const [rateLimitCountdown, setRateLimitCountdown] = useState<number>(0);
```

#### 2.7 Add rate limit countdown effect (after existing countdown effect)

```typescript
useEffect(() => {
  if (rateLimitCountdown <= 0) return;
  
  const timer = setInterval(() => {
    setRateLimitCountdown((prev) => {
      if (prev <= 1) {
        clearInterval(timer);
        return 0;
      }
      return prev - 1;
    });
  }, 1000);

  return () => clearInterval(timer);
}, [rateLimitCountdown]);
```

#### 2.8 Update handleRequestCode to set rate limit countdown

```typescript
const handleRequestCode = async () => {
  setLocalError(null);
  setAttemptsRemaining(null);
  setCodeSentSuccess(false);
  const deviceName = getDeviceName();
  const result = await requestSmsCode(deviceName);
  
  if (result.success && result.sessionId) {
    setSessionId(result.sessionId);
    setCountdown(result.expiresIn || 300);
    setCodeSentSuccess(true);
    setStep("verify");
    setTimeout(() => inputRefs.current[0]?.focus(), 100);
  } else if (result.retryAfterSeconds) {
    // Handle rate limiting - show countdown
    setRateLimitCountdown(result.retryAfterSeconds);
  }
};
```

#### 2.9 Update Send Code button to show rate limit state

```typescript
<Pressable
  onPress={handleRequestCode}
  disabled={isLoading || rateLimitCountdown > 0}
  style={[
    styles.primaryButton,
    (isLoading || rateLimitCountdown > 0) && styles.primaryButtonDisabled
  ]}
>
  {isLoading ? (
    <ActivityIndicator color="#fff" />
  ) : rateLimitCountdown > 0 ? (
    <ThemedText style={styles.primaryButtonText}>
      Try again in {rateLimitCountdown}s
    </ThemedText>
  ) : (
    <ThemedText style={styles.primaryButtonText}>
      Send Verification Code
    </ThemedText>
  )}
</Pressable>
```

---

## TASK 3: Improve Token Expiration Message

### File: `client/context/AuthContext.tsx`

#### 3.1 Update 401 error message (around line ~248)

```typescript
// BEFORE:
error: "Session expired. Please pair again.",

// AFTER:
error: "Your session has expired. Please pair your device again.",
```

---

## TASK 4: Secure Logging Practices

### File: `client/context/AuthContext.tsx`

#### 4.1 Add token redaction helper function

```typescript
function redactToken(token: string | null): string {
  if (!token) return "null";
  if (token.length <= 4) return "****";
  return `${token.substring(0, 4)}****`;
}
```

#### 4.2 Use redaction if logging token values anywhere

```typescript
// If you have any logs that show actual tokens, replace with:
console.log("[Auth] Token:", redactToken(token));
```

---

## TASK 5: Additional Error Handling

### File: `client/lib/api-client.ts`

#### 5.1 Add comprehensive HTTP error handling

```typescript
async function handleResponse<T>(response: Response, url: string): Promise<T> {
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get("Retry-After") || "60", 10);
    throw new RateLimitError(retryAfter);
  }
  
  if (response.status === 401) {
    throw new ApiError(401, url, "Session expired. Please authenticate again.");
  }
  
  if (response.status === 500) {
    throw new ApiError(500, url, "Server error. Please try again later.");
  }
  
  if (response.status === 503) {
    throw new ApiError(503, url, "Service temporarily unavailable. Please try again.");
  }
  
  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new ApiError(response.status, url, text);
  }
  
  return response.json();
}
```

---

## Testing Checklist

After implementing all changes, verify:

- [ ] SMS code input shows 6 input fields (not 4)
- [ ] Pasting a 6-digit code auto-fills all 6 fields correctly
- [ ] Validation requires exactly 6 digits before submitting
- [ ] Submitting 4-digit code shows "Please enter all 6 digits" error
- [ ] Rate limiting shows countdown timer and disables button
- [ ] After countdown expires, button becomes active again
- [ ] Token expiration shows clear "session has expired" message
- [ ] No sensitive tokens appear in console logs
- [ ] All error messages are user-friendly (no technical jargon)
- [ ] Offline mode still works within 7-day window

---

## Summary of Files to Modify

| File | Changes |
|------|---------|
| `client/screens/PairingScreen.tsx` | 6-digit inputs, rate limit UI, styling adjustments |
| `client/context/AuthContext.tsx` | Rate limit handling, expiration messages, secure logging |
| `client/lib/api-client.ts` | RateLimitError class, 429 handling, error improvements |

---

## Important Notes

1. **Do not modify server files** - the proxy server has already been updated
2. **Test on both iOS and Android** - ensure 6 input fields fit properly on both platforms
3. **The proxy server expects 6-digit codes** - 4-digit codes will be rejected with "Invalid code"
4. **Rate limit is 3 requests per minute** - users will see 429 error if exceeded
5. **Device tokens expire after 30 days** - users will need to re-pair after expiration

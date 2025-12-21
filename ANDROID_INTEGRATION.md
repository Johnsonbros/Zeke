# Android App Integration Guide

This guide shows how to integrate the new backend improvements into the ZEKE Android companion app.

## Quick Start

The backend now provides better error handling, validation, and monitoring. Here's how to use these features in the mobile app.

## 1. Health Check Integration

Add a health check on app startup to verify backend connectivity.

### Create a Health Check Hook

**File: `android/client/hooks/useBackendHealth.ts`**

```typescript
import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";

export interface BackendHealth {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  checks: {
    database: { status: string };
    pythonAgents: { status: string };
  };
}

export function useBackendHealth() {
  return useQuery({
    queryKey: ["/api/health/detailed"],
    queryFn: async () => {
      const url = new URL("/api/health/detailed", getApiUrl());
      const res = await fetch(url);
      if (!res.ok) throw new Error("Health check failed");
      return res.json() as Promise<BackendHealth>;
    },
    refetchInterval: 30000, // Check every 30 seconds
    retry: 2,
  });
}
```

### Use in HomeScreen

**File: `android/client/screens/HomeScreen.tsx`**

```typescript
import { useBackendHealth } from "@/hooks/useBackendHealth";

export function HomeScreen() {
  const { data: health, isError } = useBackendHealth();
  
  if (isError) {
    return (
      <View style={styles.errorContainer}>
        <ThemedText style={styles.errorText}>
          Unable to connect to ZEKE backend
        </ThemedText>
        <Button onPress={() => queryClient.invalidateQueries({ queryKey: ["/api/health/detailed"] })}>
          Retry
        </Button>
      </View>
    );
  }
  
  if (health?.status === "unhealthy") {
    return (
      <View style={styles.warningContainer}>
        <ThemedText style={styles.warningText}>
          ⚠️ Backend is experiencing issues
        </ThemedText>
      </View>
    );
  }
  
  // Normal app content
  return <YourNormalContent />;
}
```

## 2. Mobile Status Check

Get mobile-specific features and capabilities.

### Create Mobile Status Hook

**File: `android/client/hooks/useMobileStatus.ts`**

```typescript
import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";

export interface MobileStatus {
  backend: {
    url: string;
    reachable: boolean;
    version: string;
  };
  authentication: {
    configured: boolean;
    hmacEnabled: boolean;
  };
  features: {
    conversations: boolean;
    tasks: boolean;
    grocery: boolean;
    calendar: boolean;
    contacts: boolean;
    voice: boolean;
    sms: boolean;
  };
}

export function useMobileStatus() {
  return useQuery({
    queryKey: ["/api/mobile/status"],
    queryFn: async () => {
      const url = new URL("/api/mobile/status", getApiUrl());
      const res = await fetch(url);
      if (!res.ok) throw new Error("Status check failed");
      return res.json() as Promise<MobileStatus>;
    },
    staleTime: 60000, // Cache for 1 minute
  });
}
```

### Use Feature Flags

```typescript
import { useMobileStatus } from "@/hooks/useMobileStatus";

export function CalendarScreen() {
  const { data: status } = useMobileStatus();
  
  if (!status?.features.calendar) {
    return (
      <View>
        <ThemedText>Calendar feature is not available</ThemedText>
        <ThemedText style={styles.help}>
          Please configure Google Calendar in backend settings
        </ThemedText>
      </View>
    );
  }
  
  return <CalendarView />;
}
```

## 3. Enhanced Error Handling

Handle validation errors and display helpful messages.

### Create Error Handler Utility

**File: `android/client/lib/errorHandler.ts`**

```typescript
import { Alert } from "react-native";

export interface ApiError {
  error: string;
  message?: string;
  details?: Array<{
    path: string;
    message: string;
  }>;
  requestId?: string;
}

export function handleApiError(error: any) {
  if (error.details) {
    // Validation errors
    const messages = error.details
      .map((d: any) => `${d.path}: ${d.message}`)
      .join("\n");
    
    Alert.alert("Validation Error", messages, [{ text: "OK" }]);
  } else if (error.message) {
    // Standard error
    Alert.alert("Error", error.message, [{ text: "OK" }]);
  } else {
    // Unknown error
    Alert.alert("Error", "Something went wrong. Please try again.", [
      { text: "OK" },
    ]);
  }
}
```

### Use in API Calls

```typescript
import { handleApiError } from "@/lib/errorHandler";
import { useMutation } from "@tanstack/react-query";

export function ChatScreen() {
  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`${getApiUrl()}/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ content }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw error;
      }
      
      return res.json();
    },
    onError: handleApiError,
  });
  
  return (
    <View>
      <TextInput
        onSubmitEditing={(e) => sendMessage.mutate(e.nativeEvent.text)}
      />
    </View>
  );
}
```

## 4. Request Logging

Track API requests for debugging.

### Create Request Logger

**File: `android/client/lib/requestLogger.ts`**

```typescript
interface RequestLog {
  timestamp: Date;
  method: string;
  url: string;
  status: number;
  duration: number;
  error?: string;
}

const requestLogs: RequestLog[] = [];
const MAX_LOGS = 100;

export function logRequest(log: Omit<RequestLog, "timestamp">) {
  requestLogs.unshift({
    ...log,
    timestamp: new Date(),
  });
  
  if (requestLogs.length > MAX_LOGS) {
    requestLogs.pop();
  }
  
  // Console log in development
  if (__DEV__) {
    console.log(
      `[API] ${log.method} ${log.url} - ${log.status} in ${log.duration}ms`,
      log.error || ""
    );
  }
}

export function getRequestLogs(): RequestLog[] {
  return [...requestLogs];
}

export function clearRequestLogs() {
  requestLogs.length = 0;
}
```

### Add to API Client

**File: `android/client/lib/api-client.ts`** (if it exists, or create it)

```typescript
import { logRequest } from "./requestLogger";

export async function apiRequest(
  method: string,
  path: string,
  body?: any
): Promise<any> {
  const startTime = Date.now();
  const url = `${getApiUrl()}${path}`;
  
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    const duration = Date.now() - startTime;
    
    logRequest({
      method,
      url: path,
      status: res.status,
      duration,
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw error;
    }
    
    return res.json();
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    logRequest({
      method,
      url: path,
      status: 0,
      duration,
      error: error.message || "Network error",
    });
    
    throw error;
  }
}
```

## 5. Debug Screen

Create a debug screen to view backend status and logs.

### Create Debug Screen

**File: `android/client/screens/DebugScreen.tsx`**

```typescript
import React from "react";
import { View, ScrollView, StyleSheet, Button } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { useMobileStatus } from "@/hooks/useMobileStatus";
import { getRequestLogs, clearRequestLogs } from "@/lib/requestLogger";

export function DebugScreen() {
  const { data: health } = useBackendHealth();
  const { data: status } = useMobileStatus();
  const [logs, setLogs] = React.useState(getRequestLogs());
  
  React.useEffect(() => {
    const interval = setInterval(() => {
      setLogs(getRequestLogs());
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  
  return (
    <ScrollView style={styles.container}>
      <ThemedText style={styles.title}>Backend Health</ThemedText>
      <ThemedText>Status: {health?.status}</ThemedText>
      <ThemedText>Database: {health?.checks.database.status}</ThemedText>
      <ThemedText>Python Agents: {health?.checks.pythonAgents.status}</ThemedText>
      
      <ThemedText style={styles.title}>Features</ThemedText>
      <ThemedText>Calendar: {status?.features.calendar ? "✓" : "✗"}</ThemedText>
      <ThemedText>Voice: {status?.features.voice ? "✓" : "✗"}</ThemedText>
      <ThemedText>SMS: {status?.features.sms ? "✓" : "✗"}</ThemedText>
      
      <ThemedText style={styles.title}>Recent API Calls</ThemedText>
      <Button title="Clear Logs" onPress={() => {
        clearRequestLogs();
        setLogs([]);
      }} />
      
      {logs.map((log, i) => (
        <View key={i} style={styles.logEntry}>
          <ThemedText style={styles.logMethod}>{log.method}</ThemedText>
          <ThemedText style={styles.logUrl}>{log.url}</ThemedText>
          <ThemedText style={styles.logStatus}>{log.status}</ThemedText>
          <ThemedText style={styles.logDuration}>{log.duration}ms</ThemedText>
          {log.error && (
            <ThemedText style={styles.logError}>{log.error}</ThemedText>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 8,
  },
  logEntry: {
    marginVertical: 4,
    padding: 8,
    backgroundColor: "#f0f0f0",
    borderRadius: 4,
  },
  logMethod: {
    fontWeight: "bold",
  },
  logUrl: {
    fontSize: 12,
  },
  logStatus: {
    fontSize: 12,
  },
  logDuration: {
    fontSize: 12,
    color: "#666",
  },
  logError: {
    color: "red",
    fontSize: 12,
  },
});
```

## 6. Connection Quality Indicator

Show connection quality in the UI.

### Create Connection Quality Hook

**File: `android/client/hooks/useConnectionQuality.ts`**

```typescript
import { useState, useEffect } from "react";
import { getRequestLogs } from "@/lib/requestLogger";

export type ConnectionQuality = "excellent" | "good" | "fair" | "poor";

export function useConnectionQuality(): ConnectionQuality {
  const [quality, setQuality] = useState<ConnectionQuality>("good");
  
  useEffect(() => {
    const interval = setInterval(() => {
      const logs = getRequestLogs().slice(0, 10); // Last 10 requests
      
      if (logs.length === 0) {
        setQuality("good");
        return;
      }
      
      const avgDuration =
        logs.reduce((sum, log) => sum + log.duration, 0) / logs.length;
      const errorRate = logs.filter((log) => log.error).length / logs.length;
      
      if (errorRate > 0.5) {
        setQuality("poor");
      } else if (avgDuration > 5000) {
        setQuality("poor");
      } else if (avgDuration > 2000 || errorRate > 0.2) {
        setQuality("fair");
      } else if (avgDuration < 500) {
        setQuality("excellent");
      } else {
        setQuality("good");
      }
    }, 5000); // Check every 5 seconds
    
    return () => clearInterval(interval);
  }, []);
  
  return quality;
}
```

### Display in UI

```typescript
import { useConnectionQuality } from "@/hooks/useConnectionQuality";

export function Header() {
  const quality = useConnectionQuality();
  
  const getQualityColor = () => {
    switch (quality) {
      case "excellent": return "#00ff00";
      case "good": return "#90ee90";
      case "fair": return "#ffa500";
      case "poor": return "#ff0000";
    }
  };
  
  return (
    <View style={styles.header}>
      <Text style={styles.title}>ZEKE</Text>
      <View style={[styles.indicator, { backgroundColor: getQualityColor() }]} />
    </View>
  );
}
```

## Testing

### 1. Test Health Endpoints

```typescript
// In HomeScreen or App.tsx
useEffect(() => {
  fetch(`${getApiUrl()}/api/health`)
    .then(res => res.json())
    .then(data => console.log("Health check:", data))
    .catch(err => console.error("Health check failed:", err));
}, []);
```

### 2. Test Mobile Status

```typescript
useEffect(() => {
  fetch(`${getApiUrl()}/api/mobile/status`)
    .then(res => res.json())
    .then(data => console.log("Mobile status:", data))
    .catch(err => console.error("Status check failed:", err));
}, []);
```

### 3. Test Validation

```typescript
// This should fail with validation error
fetch(`${getApiUrl()}/api/conversations`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: 123 }), // Invalid: should be string
})
  .then(res => res.json())
  .then(data => console.log("Response:", data));
```

## Troubleshooting

### Issue: "Cannot connect to backend"

1. Check `EXPO_PUBLIC_ZEKE_BACKEND_URL` in `.env`
2. Verify backend is running: `curl https://zekeai.replit.app/api/health`
3. Check mobile app logs for network errors

### Issue: "Validation errors on valid data"

1. Check request body matches schema
2. Ensure types are correct (string, not number)
3. Review backend schema in `server/routes.ts`

### Issue: "Authentication fails"

1. Verify device token is set: `getDeviceToken()`
2. Check headers are sent: `getAuthHeaders()`
3. Check backend logs for authentication errors

## Summary

The backend improvements provide:

✅ Real-time health monitoring
✅ Feature detection
✅ Better error messages
✅ Request logging
✅ Connection quality tracking

Integrate these into your Android app for a more robust user experience.

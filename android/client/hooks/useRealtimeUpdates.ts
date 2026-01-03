import { useEffect, useRef } from "react";
import { Platform } from "react-native";

import { useAuth } from "@/context/AuthContext";
import { getApiUrl, getDeviceToken, isZekeSyncMode, queryClient } from "@/lib/query-client";

interface RealtimeMessage {
  type:
    | "task"
    | "event"
    | "memory"
    | "automation_status"
    | "activity"
    | "notification"
    | "device_status"
    | "sms"
    | "voice";
  action: "created" | "updated" | "deleted" | "status_change";
  data?: unknown;
  timestamp?: string;
}

function refreshTasks(): void {
  queryClient.invalidateQueries({ queryKey: ["zeke-pending-tasks"] });
  queryClient.invalidateQueries({ queryKey: ["zeke-all-tasks"] });
  queryClient.invalidateQueries({ queryKey: ["zeke-dashboard-summary"] });
}

function refreshEvents(): void {
  queryClient.invalidateQueries({ queryKey: ["zeke-today-events"] });
  queryClient.invalidateQueries({ queryKey: ["zeke-dashboard-summary"] });
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === "string" && key.includes("calendar-events");
    },
  });
}

function refreshMemories(): void {
  queryClient.invalidateQueries({ queryKey: ["/api/memories"] });
}

function refreshAutomationStatus(): void {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === "string" && key.toLowerCase().includes("automation");
    },
  });
}

function refreshNotifications(): void {
  queryClient.invalidateQueries({ queryKey: ["zeke-notifications"] });
  queryClient.invalidateQueries({ queryKey: ["zeke-recent-activities"] });
}

function buildWebSocketUrl(token: string | null): string {
  const baseUrl = getApiUrl();
  const wsUrl = baseUrl.replace(/^http/, "ws");
  const url = new URL("/ws/zeke", wsUrl);

  if (token) {
    url.searchParams.set("token", token);
  }

  return url.toString();
}

export function useRealtimeUpdates(): void {
  const { isAuthenticated } = useAuth();
  const isSyncMode = isZekeSyncMode();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(1000);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Only connect when authenticated and using the sync backend
    if (!isAuthenticated || !isSyncMode) {
      return () => {};
    }

    // Skip WebSocket on web if protocol isn't supported (e.g., file://)
    if (Platform.OS === "web" && typeof window !== "undefined" && !window.location.protocol.startsWith("http")) {
      return () => {};
    }

    let isUnmounted = false;
    const token = getDeviceToken();
    const wsUrl = buildWebSocketUrl(token);

    const cleanup = () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };

    const handleMessage = (event: MessageEvent) => {
      try {
        const payload: RealtimeMessage = JSON.parse(event.data as string);

        switch (payload.type) {
          case "task":
            refreshTasks();
            break;
          case "event":
            refreshEvents();
            break;
          case "memory":
            refreshMemories();
            break;
          case "automation_status":
            refreshAutomationStatus();
            break;
          case "activity":
            queryClient.invalidateQueries({ queryKey: ["zeke-recent-activities"] });
            break;
          case "notification":
            refreshNotifications();
            break;
          default:
            // Ignore other message types (sms/voice/device_status) for now
            break;
        }
      } catch (error) {
        console.warn("[Realtime] Failed to parse message", error);
      }
    };

    const connect = () => {
      if (isUnmounted) return;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          reconnectDelayRef.current = 1000;
          console.log("[Realtime] Connected to ZEKE sync");
        };

        ws.onmessage = handleMessage;

        ws.onerror = (err) => {
          console.warn("[Realtime] WebSocket error", err);
        };

        ws.onclose = () => {
          if (isUnmounted) return;

          const nextDelay = Math.min(reconnectDelayRef.current * 2, 30000);
          reconnectDelayRef.current = nextDelay;

          reconnectTimeoutRef.current = setTimeout(connect, reconnectDelayRef.current);
        };
      } catch (error) {
        console.warn("[Realtime] Failed to open WebSocket", error);
        reconnectTimeoutRef.current = setTimeout(connect, reconnectDelayRef.current);
      }
    };

    connect();

    return () => {
      isUnmounted = true;
      cleanup();
    };
  }, [isAuthenticated, isSyncMode]);
}

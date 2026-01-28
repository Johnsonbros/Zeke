import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";

export type ZekeSyncMessageType =
  | "sms"
  | "voice"
  | "activity"
  | "device_status"
  | "notification"
  | "task"
  | "grocery"
  | "list"
  | "calendar"
  | "contact";

export interface ZekeSyncMessage {
  type: ZekeSyncMessageType;
  action: "created" | "updated" | "deleted";
  data?: unknown;
  timestamp: string;
}

export type ConnectionStatus = "connected" | "connecting" | "disconnected";

interface UseZekeSyncOptions {
  enabled?: boolean;
  onMessage?: (message: ZekeSyncMessage) => void;
}

const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const RECONNECT_MULTIPLIER = 2;

// TODO: RELIABILITY - Add heartbeat/ping mechanism to detect stale connections before they timeout
// TODO: SECURITY - Send device token with WebSocket connection for authentication
// TODO: FEATURE - Add connection quality indicator (latency, message drop rate)
// TODO: ARCHITECTURE - Consider consolidating with useRealtimeUpdates hook to avoid duplication

export function useZekeSync(options: UseZekeSyncOptions = {}) {
  const { enabled = true, onMessage } = options;
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const mountedRef = useRef(true);

  const invalidateQueriesForType = useCallback(
    (type: ZekeSyncMessageType) => {
      switch (type) {
        case "sms":
          queryClient.invalidateQueries({ queryKey: ["/api/sms"] });
          queryClient.invalidateQueries({ queryKey: ["/api/communications"] });
          break;
        case "voice":
          queryClient.invalidateQueries({ queryKey: ["/api/voice"] });
          queryClient.invalidateQueries({ queryKey: ["/api/communications"] });
          break;
        case "activity":
          queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
          queryClient.invalidateQueries({ queryKey: ["/api/timeline"] });
          break;
        case "device_status":
          queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
          queryClient.invalidateQueries({ queryKey: ["/api/device"] });
          break;
        case "notification":
          queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          break;
        case "task":
          queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
          break;
        case "grocery":
          queryClient.invalidateQueries({ queryKey: ["/api/grocery"] });
          break;
        case "list":
          queryClient.invalidateQueries({ queryKey: ["/api/lists"] });
          break;
        case "calendar":
          queryClient.invalidateQueries({ queryKey: ["/api/calendar"] });
          break;
        case "contact":
          queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
          break;
      }
    },
    [queryClient],
  );

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return;

    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    setStatus("connecting");

    try {
      const baseUrl = getApiUrl();
      const wsProtocol = baseUrl.startsWith("https") ? "wss" : "ws";
      const host = new URL(baseUrl).host;
      const wsUrl = `${wsProtocol}://${host}/ws/zeke`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close();
          return;
        }
        console.log("[ZEKE Sync] Connected");
        setStatus("connected");
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;

        try {
          const message: ZekeSyncMessage = JSON.parse(event.data);
          console.log(
            "[ZEKE Sync] Message received:",
            message.type,
            message.action,
          );

          invalidateQueriesForType(message.type);
          onMessage?.(message);
        } catch (error) {
          console.error("[ZEKE Sync] Failed to parse message:", error);
        }
      };

      ws.onclose = (event) => {
        if (!mountedRef.current) return;

        console.log("[ZEKE Sync] Disconnected", event.code, event.reason);
        setStatus("disconnected");
        wsRef.current = null;

        if (enabled) {
          const delay = reconnectDelayRef.current;
          console.log(`[ZEKE Sync] Reconnecting in ${delay}ms...`);

          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectDelayRef.current = Math.min(
              reconnectDelayRef.current * RECONNECT_MULTIPLIER,
              MAX_RECONNECT_DELAY,
            );
            connect();
          }, delay);
        }
      };

      ws.onerror = (error) => {
        // TODO: LOGGING - Send WebSocket errors to monitoring service
        // TODO: UX - Show user-friendly notification when sync connection is degraded
        console.error("[ZEKE Sync] WebSocket error:", error);
      };
    } catch (error) {
      console.error("[ZEKE Sync] Failed to create WebSocket:", error);
      setStatus("disconnected");
    }
  }, [enabled, invalidateQueriesForType, onMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setStatus("disconnected");
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (enabled) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    status,
    isConnected: status === "connected",
    isConnecting: status === "connecting",
    reconnect: connect,
    disconnect,
  };
}

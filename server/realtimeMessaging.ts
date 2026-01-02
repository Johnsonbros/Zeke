import type { Express } from "express";
import type { IncomingMessage, Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import { getDeviceTokenByToken } from "./db";
import { log } from "./logger";

const REALTIME_PATH = "/ws/realtime";
const REALTIME_CHANNELS = ["tasks", "events", "memories", "automations"] as const;
const DEFAULT_SUBSCRIPTIONS = new Set(REALTIME_CHANNELS);
const TOKEN_TTL_MS = 15 * 60 * 1000;

export type RealtimeChannel = (typeof REALTIME_CHANNELS)[number];

export interface RealtimeEvent<T = unknown> {
  channel: RealtimeChannel;
  event: string;
  data: T;
  timestamp?: string;
}

interface AuthSession {
  token: string;
  deviceId: string;
  deviceToken: string;
  expiresAt: number;
  subscriptions: Set<RealtimeChannel>;
}

interface ClientState {
  deviceId: string;
  subscriptions: Set<RealtimeChannel>;
  connectedAt: string;
  lastSeen: number;
  token: string;
}

function sanitizeChannels(channels: string[] | undefined): Set<RealtimeChannel> {
  if (!channels || channels.length === 0) {
    return new Set(DEFAULT_SUBSCRIPTIONS);
  }

  const sanitized: RealtimeChannel[] = [];

  channels.forEach((channel) => {
    if (REALTIME_CHANNELS.includes(channel as RealtimeChannel)) {
      sanitized.push(channel as RealtimeChannel);
    }
  });

  return new Set(sanitized.length > 0 ? sanitized : DEFAULT_SUBSCRIPTIONS);
}

export function createRealtimeService(httpServer: Server) {
  const wss = new WebSocketServer({ noServer: true });
  const authSessions = new Map<string, AuthSession>();
  const clients = new Map<WebSocket, ClientState>();

  function expireToken(token: string): void {
    const session = authSessions.get(token);
    if (!session) return;
    authSessions.delete(token);
    clients.forEach((state, ws) => {
      if (state.token === token) {
        clients.delete(ws);
        try {
          ws.close(4401, "session_expired");
        } catch {}
      }
    });
  }

  function validateSession(token: string | null): AuthSession | null {
    if (!token) return null;
    const session = authSessions.get(token);
    if (!session) return null;

    if (Date.now() > session.expiresAt) {
      expireToken(token);
      return null;
    }

    const device = getDeviceTokenByToken(session.deviceToken);
    if (!device || !!device.revokedAt) {
      expireToken(token);
      return null;
    }

    session.expiresAt = Date.now() + TOKEN_TTL_MS;
    return session;
  }

  function issueToken(deviceToken: string, deviceId: string, channels?: string[]): AuthSession {
    const token = uuidv4();
    const subscriptions = sanitizeChannels(channels);
    const session: AuthSession = {
      token,
      deviceId,
      deviceToken,
      subscriptions,
      expiresAt: Date.now() + TOKEN_TTL_MS,
    };

    authSessions.set(token, session);
    return session;
  }

  function updateSubscriptions(token: string, channels: string[]): AuthSession | null {
    const session = validateSession(token);
    if (!session) return null;

    session.subscriptions = sanitizeChannels(channels);
    authSessions.set(token, session);

    clients.forEach((state) => {
      if (state.token === token) {
        state.subscriptions = new Set(session.subscriptions);
      }
    });

    return session;
  }

  function publish(event: RealtimeEvent): void {
    const payload = JSON.stringify({
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    });

    let delivered = 0;

    clients.forEach((state, ws) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (!state.subscriptions.has(event.channel)) return;

      ws.send(payload);
      delivered += 1;
    });

    if (delivered > 0) {
      log(`Realtime broadcast on ${event.channel} => ${delivered} clients`, "realtime");
    }
  }

  function registerEndpoints(app: Express): void {
    app.post("/api/realtime/auth", (req, res) => {
      const deviceToken =
        (req.headers["x-zeke-device-token"] as string | undefined) ||
        (req.body && (req.body.deviceToken as string | undefined));

      if (!deviceToken) {
        res.status(400).json({ error: "Missing device token" });
        return;
      }

      const device = getDeviceTokenByToken(deviceToken);
      if (!device || device.revokedAt) {
        res.status(401).json({ error: "Invalid or revoked device token" });
        return;
      }

      const session = issueToken(deviceToken, device.deviceId);
      res.json({
        token: session.token,
        expiresAt: new Date(session.expiresAt).toISOString(),
        channels: Array.from(session.subscriptions),
      });
    });

    app.post("/api/realtime/subscribe", (req, res) => {
      const token =
        (req.headers["x-realtime-token"] as string | undefined) ||
        (req.body && (req.body.token as string | undefined));

      const channels = (req.body?.channels as string[] | undefined) || [];

      if (!token) {
        res.status(400).json({ error: "Missing realtime token" });
        return;
      }

      const session = updateSubscriptions(token, channels);
      if (!session) {
        res.status(401).json({ error: "Invalid or expired realtime token" });
        return;
      }

      res.json({
        token: session.token,
        channels: Array.from(session.subscriptions),
        expiresAt: new Date(session.expiresAt).toISOString(),
      });
    });
  }

  function handleUpgrade(request: IncomingMessage, socket: any, head: any) {
    const host = request.headers.host || "localhost:5000";
    const url = new URL(request.url || "/", `http://${host}`);
    const token = (request.headers["x-realtime-token"] as string) || url.searchParams.get("token");
    const session = validateSession(token);

    if (!session) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request, session);
    });
  }

  wss.on("connection", (ws: WebSocket, _request: IncomingMessage, session: AuthSession) => {
    const state: ClientState = {
      deviceId: session.deviceId,
      subscriptions: new Set(session.subscriptions),
      connectedAt: new Date().toISOString(),
      lastSeen: Date.now(),
      token: session.token,
    };

    clients.set(ws, state);

    ws.send(
      JSON.stringify({
        type: "welcome",
        deviceId: session.deviceId,
        channels: Array.from(state.subscriptions),
        timestamp: state.connectedAt,
      }),
    );

    ws.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        state.lastSeen = Date.now();

        if (message.type === "subscribe" && Array.isArray(message.channels)) {
          const updated = updateSubscriptions(state.token, message.channels);
          if (updated) {
            ws.send(
              JSON.stringify({
                type: "subscribed",
                channels: Array.from(updated.subscriptions),
                timestamp: new Date().toISOString(),
              }),
            );
          }
          return;
        }

        if (message.type === "ping") {
          ws.send(
            JSON.stringify({
              type: "pong",
              timestamp: new Date().toISOString(),
            }),
          );
          return;
        }
      } catch (error) {
        log(`Realtime message parse error: ${(error as Error).message}`, "realtime");
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });

    ws.on("error", (error: Error) => {
      log(`Realtime websocket error: ${error.message}`, "realtime");
      clients.delete(ws);
    });
  });

  const heartbeat = setInterval(() => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.ping();
        } catch {}
      }
    });
  }, 30_000);

  httpServer.on("close", () => clearInterval(heartbeat));

  return {
    path: REALTIME_PATH,
    registerEndpoints,
    handleUpgrade,
    publish,
  };
}

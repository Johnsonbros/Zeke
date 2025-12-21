import type { Express, Request, Response } from "express";
import type { IncomingHttpHeaders } from "http";
import {
  signRequest,
  logCommunication,
  hashBody,
  isSecurityConfigured,
  getSecurityStatus,
  getCommunicationLogs,
  generateRequestId,
} from "./zeke-security";

const ZEKE_BACKEND_URL = process.env.EXPO_PUBLIC_ZEKE_BACKEND_URL || "https://zekeai.replit.app";

const FORWARD_HEADERS = [
  "cookie",
  "authorization",
  "x-api-key",
  "x-user-id",
  "x-session-id",
  "x-request-id",
  "user-agent",
  "x-zeke-device-token",
];

interface ProxyResult {
  success: boolean;
  status: number;
  data?: any;
  error?: string;
  requestId?: string;
  latencyMs?: number;
}

function extractForwardHeaders(reqHeaders: IncomingHttpHeaders): Record<string, string> {
  const headers: Record<string, string> = {};
  
  for (const key of FORWARD_HEADERS) {
    const value = reqHeaders[key];
    if (value) {
      headers[key] = Array.isArray(value) ? value.join(", ") : value;
    }
  }
  
  return headers;
}

async function proxyToZeke(
  method: string,
  path: string,
  body?: any,
  clientHeaders?: Record<string, string>
): Promise<ProxyResult> {
  const url = new URL(path, ZEKE_BACKEND_URL);
  const startTime = Date.now();
  const bodyStr = body ? JSON.stringify(body) : "";
  
  const securityHeaders = isSecurityConfigured() 
    ? signRequest(method, path, bodyStr)
    : { "X-Zeke-Request-Id": generateRequestId() } as any;
  
  const requestId = securityHeaders["X-Zeke-Request-Id"];
  
  logCommunication({
    requestId,
    timestamp: new Date().toISOString(),
    method,
    path,
    direction: "outbound",
    proxyId: securityHeaders["X-Zeke-Proxy-Id"] || "unsigned",
    signatureValid: isSecurityConfigured(),
    bodyHash: hashBody(bodyStr),
  });
  
  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...clientHeaders,
        ...securityHeaders,
      },
    };
    
    if (body && method !== "GET" && method !== "HEAD") {
      fetchOptions.body = bodyStr;
    }
    
    console.log(`[ZEKE Proxy] ${method} ${url.href} [${requestId}]`);
    console.log(`[ZEKE Proxy] Headers:`, JSON.stringify(fetchOptions.headers, null, 2));
    
    const response = await fetch(url.href, fetchOptions);
    const contentType = response.headers.get("content-type");
    const latencyMs = Date.now() - startTime;
    
    let data;
    if (contentType?.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    
    console.log(`[ZEKE Proxy] Response: ${response.status} [${requestId}] ${latencyMs}ms`);
    if (!response.ok) {
      console.log(`[ZEKE Proxy] Error response body:`, JSON.stringify(data, null, 2));
    }
    
    logCommunication({
      requestId,
      timestamp: new Date().toISOString(),
      method,
      path,
      direction: "inbound",
      status: response.status,
      latencyMs,
      proxyId: securityHeaders["X-Zeke-Proxy-Id"] || "unsigned",
      signatureValid: true,
    });
    
    return {
      success: response.ok,
      status: response.status,
      data,
      requestId,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    console.error(`[ZEKE Proxy] Error [${requestId}]:`, error);
    
    logCommunication({
      requestId,
      timestamp: new Date().toISOString(),
      method,
      path,
      direction: "inbound",
      status: 503,
      latencyMs,
      proxyId: securityHeaders["X-Zeke-Proxy-Id"] || "unsigned",
      signatureValid: false,
      error: error instanceof Error ? error.message : "Connection failed",
    });
    
    return {
      success: false,
      status: 503,
      error: error instanceof Error ? error.message : "Connection failed",
      requestId,
      latencyMs,
    };
  }
}

export function registerZekeProxyRoutes(app: Express): void {
  console.log(`[ZEKE Proxy] Registering routes, backend: ${ZEKE_BACKEND_URL}`);

  app.get("/api/zeke/health", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("GET", "/api/health", undefined, headers);
    const security = getSecurityStatus();
    res.json({
      proxy: "connected",
      backend: ZEKE_BACKEND_URL,
      backendStatus: result.success ? "connected" : "unreachable",
      backendResponse: result.data,
      security: {
        handshakeEnabled: security.configured,
        proxyId: security.proxyId,
        logsCount: security.logsCount,
      },
      requestId: result.requestId,
      latencyMs: result.latencyMs,
    });
  });

  app.get("/api/zeke/security/status", async (_req: Request, res: Response) => {
    const security = getSecurityStatus();
    res.json({
      configured: security.configured,
      proxyId: security.proxyId,
      secretConfigured: security.secretConfigured,
      logsCount: security.logsCount,
      backend: ZEKE_BACKEND_URL,
    });
  });

  app.get("/api/zeke/security/logs", async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const logs = getCommunicationLogs(Math.min(limit, 500));
    res.json({
      logs,
      total: logs.length,
      securityEnabled: isSecurityConfigured(),
    });
  });

  app.get("/api/zeke/tasks", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("GET", "/api/tasks", undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to fetch tasks", tasks: [] });
    }
    const tasks = result.data?.tasks || result.data || [];
    res.json({ tasks, source: "zeke-backend" });
  });

  app.post("/api/zeke/tasks", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("POST", "/api/tasks", req.body, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to create task" });
    }
    res.status(201).json(result.data);
  });

  app.patch("/api/zeke/tasks/:id", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("PATCH", `/api/tasks/${req.params.id}`, req.body, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to update task" });
    }
    res.json(result.data);
  });

  app.delete("/api/zeke/tasks/:id", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("DELETE", `/api/tasks/${req.params.id}`, undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to delete task" });
    }
    res.status(204).send();
  });

  app.get("/api/zeke/grocery", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("GET", "/api/grocery", undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to fetch grocery items", items: [] });
    }
    const items = result.data?.items || result.data || [];
    res.json({ items, source: "zeke-backend" });
  });

  app.post("/api/zeke/grocery", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("POST", "/api/grocery", req.body, headers);
    if (!result.success) {
      const errorMsg = result.data?.error || result.data?.message || result.error || "Failed to create grocery item";
      return res.status(result.status).json({ error: errorMsg, details: result.data });
    }
    res.status(201).json(result.data);
  });

  app.patch("/api/zeke/grocery/:id", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("PATCH", `/api/grocery/${req.params.id}`, req.body, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to update grocery item" });
    }
    res.json(result.data);
  });

  app.delete("/api/zeke/grocery/:id", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("DELETE", `/api/grocery/${req.params.id}`, undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to delete grocery item" });
    }
    res.status(204).send();
  });

  app.get("/api/zeke/lists", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("GET", "/api/lists", undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to fetch lists", lists: [] });
    }
    const lists = result.data?.lists || result.data || [];
    res.json({ lists, source: "zeke-backend" });
  });

  app.post("/api/zeke/lists", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("POST", "/api/lists", req.body, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to create list" });
    }
    res.status(201).json(result.data);
  });

  app.get("/api/zeke/lists/:id", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("GET", `/api/lists/${req.params.id}`, undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to fetch list" });
    }
    res.json(result.data);
  });

  app.patch("/api/zeke/lists/:id", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("PATCH", `/api/lists/${req.params.id}`, req.body, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to update list" });
    }
    res.json(result.data);
  });

  app.delete("/api/zeke/lists/:id", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("DELETE", `/api/lists/${req.params.id}`, undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to delete list" });
    }
    res.status(204).send();
  });

  app.post("/api/zeke/lists/:id/items", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("POST", `/api/lists/${req.params.id}/items`, req.body, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to add list item" });
    }
    res.status(201).json(result.data);
  });

  app.patch("/api/zeke/lists/:listId/items/:itemId", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("PATCH", `/api/lists/${req.params.listId}/items/${req.params.itemId}`, req.body, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to update list item" });
    }
    res.json(result.data);
  });

  app.delete("/api/zeke/lists/:listId/items/:itemId", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("DELETE", `/api/lists/${req.params.listId}/items/${req.params.itemId}`, undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to delete list item" });
    }
    res.status(204).send();
  });

  app.get("/api/zeke/contacts", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("GET", "/api/contacts", undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to fetch contacts", contacts: [] });
    }
    const contacts = result.data?.contacts || result.data || [];
    res.json({ contacts, source: "zeke-backend" });
  });

  app.post("/api/zeke/contacts", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("POST", "/api/contacts", req.body, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to create contact" });
    }
    res.status(201).json(result.data);
  });

  app.get("/api/zeke/contacts/:id", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("GET", `/api/contacts/${req.params.id}`, undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to fetch contact" });
    }
    res.json(result.data);
  });

  app.patch("/api/zeke/contacts/:id", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("PATCH", `/api/contacts/${req.params.id}`, req.body, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to update contact" });
    }
    res.json(result.data);
  });

  app.delete("/api/zeke/contacts/:id", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("DELETE", `/api/contacts/${req.params.id}`, undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to delete contact" });
    }
    res.status(204).send();
  });

  app.get("/api/zeke/chat/conversations", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("GET", "/api/chat/conversations", undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to fetch conversations", conversations: [] });
    }
    res.json(result.data);
  });

  app.post("/api/zeke/chat", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("POST", "/api/chat", req.body, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to send message" });
    }
    res.json(result.data);
  });

  app.get("/api/conversations", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("GET", "/api/conversations", undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to fetch conversations", conversations: [] });
    }
    res.json(result.data);
  });

  app.post("/api/conversations", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("POST", "/api/conversations", req.body, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to create conversation" });
    }
    res.status(201).json(result.data);
  });

  app.get("/api/conversations/:id", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("GET", `/api/conversations/${req.params.id}`, undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to fetch conversation" });
    }
    res.json(result.data);
  });

  app.get("/api/conversations/:id/messages", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("GET", `/api/conversations/${req.params.id}/messages`, undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to fetch messages", messages: [] });
    }
    res.json(result.data);
  });

  app.post("/api/conversations/:id/messages", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("POST", `/api/conversations/${req.params.id}/messages`, req.body, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to send message" });
    }
    res.status(201).json(result.data);
  });

  app.get("/api/zeke/dashboard", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("GET", "/api/dashboard", undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to fetch dashboard" });
    }
    res.json(result.data);
  });


  app.get("/api/zeke/devices", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("GET", "/api/omi/devices", undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to fetch devices", devices: [] });
    }
    res.json(result.data);
  });

  app.get("/api/zeke/calendar/today", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("GET", "/api/calendar/today", undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to fetch calendar events", events: [] });
    }
    res.json(result.data);
  });

  app.get("/api/zeke/calendar/upcoming", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const days = req.query.days || '7';
    const result = await proxyToZeke("GET", `/api/calendar/upcoming?days=${days}`, undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to fetch upcoming events", events: [] });
    }
    res.json(result.data);
  });

  app.get("/api/zeke/calendar/events", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const { timeMin, timeMax, calendarId } = req.query;
    let queryString = '';
    if (timeMin) queryString += `timeMin=${encodeURIComponent(timeMin as string)}&`;
    if (timeMax) queryString += `timeMax=${encodeURIComponent(timeMax as string)}&`;
    if (calendarId) queryString += `calendarId=${encodeURIComponent(calendarId as string)}`;
    const result = await proxyToZeke("GET", `/api/calendar/events${queryString ? '?' + queryString : ''}`, undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to fetch events", events: [] });
    }
    res.json(result.data);
  });

  app.get("/api/zeke/calendar/calendars", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("GET", "/api/calendar/calendars", undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to fetch calendars", calendars: [] });
    }
    res.json(result.data);
  });

  app.post("/api/zeke/calendar/events", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("POST", "/api/calendar/events", req.body, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to create event" });
    }
    res.status(201).json(result.data);
  });

  app.patch("/api/zeke/calendar/events/:eventId", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("PATCH", `/api/calendar/events/${req.params.eventId}`, req.body, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to update event" });
    }
    res.json(result.data);
  });

  app.delete("/api/zeke/calendar/events/:eventId", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const calendarId = req.query.calendarId ? `?calendarId=${encodeURIComponent(req.query.calendarId as string)}` : '';
    const result = await proxyToZeke("DELETE", `/api/calendar/events/${req.params.eventId}${calendarId}`, undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to delete event" });
    }
    res.status(204).send();
  });

  app.post("/api/zeke/location/update", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("POST", "/api/location-history", req.body, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to update location" });
    }
    res.status(201).json(result.data);
  });

  app.post("/api/zeke/location/batch", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("POST", "/api/location-samples/batch", req.body, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to sync location samples" });
    }
    res.status(201).json(result.data);
  });

  app.get("/api/zeke/location/current", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("GET", "/api/location-history/latest", undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to fetch current location" });
    }
    res.json(result.data);
  });

  app.get("/api/zeke/location/history", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const { limit, startDate, endDate } = req.query;
    let queryString = '';
    if (limit) queryString += `limit=${encodeURIComponent(limit as string)}&`;
    if (startDate) queryString += `startDate=${encodeURIComponent(startDate as string)}&`;
    if (endDate) queryString += `endDate=${encodeURIComponent(endDate as string)}`;
    const result = await proxyToZeke("GET", `/api/location-history${queryString ? '?' + queryString : ''}`, undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to fetch location history", locations: [] });
    }
    res.json(result.data);
  });

  app.get("/api/zeke/saved-places", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("GET", "/api/saved-places", undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to fetch saved places", places: [] });
    }
    res.json(result.data);
  });

  app.post("/api/zeke/saved-places", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("POST", "/api/saved-places", req.body, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to save place" });
    }
    res.status(201).json(result.data);
  });

  app.patch("/api/zeke/saved-places/:id", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("PATCH", `/api/saved-places/${req.params.id}`, req.body, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to update saved place" });
    }
    res.json(result.data);
  });

  app.delete("/api/zeke/saved-places/:id", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("DELETE", `/api/saved-places/${req.params.id}`, undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to delete saved place" });
    }
    res.status(204).send();
  });

  // Auth proxy routes - forward to ZEKE backend for device pairing
  app.post("/api/zeke/auth/pair", async (req: Request, res: Response) => {
    console.log("[ZEKE Proxy] Auth pair request received");
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("POST", "/api/auth/pair", req.body, headers);
    if (!result.success) {
      return res.status(result.status).json({ 
        error: result.error || "Failed to pair device",
        message: result.data?.message || result.error
      });
    }
    res.json(result.data);
  });

  app.get("/api/zeke/auth/verify", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("GET", "/api/auth/verify", undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ 
        valid: false, 
        error: result.error || "Token verification failed" 
      });
    }
    res.json(result.data);
  });

  app.get("/api/zeke/auth/status", async (req: Request, res: Response) => {
    const headers = extractForwardHeaders(req.headers);
    const result = await proxyToZeke("GET", "/api/auth/status", undefined, headers);
    if (!result.success) {
      return res.status(result.status).json({ error: result.error || "Failed to get auth status" });
    }
    res.json(result.data);
  });

  console.log("[ZEKE Proxy] Routes registered successfully");
}

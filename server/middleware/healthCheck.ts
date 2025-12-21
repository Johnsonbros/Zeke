import type { Request, Response } from "express";
import { getAllConversations } from "../db";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  checks: {
    database: {
      status: "ok" | "error";
      responseTime?: number;
      error?: string;
    };
    pythonAgents: {
      status: "ok" | "error" | "unavailable";
      responseTime?: number;
      error?: string;
    };
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
  };
}

interface MobileStatus {
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
  };
  connectivity: {
    latency?: number;
    lastSuccessfulRequest?: string;
  };
}

/**
 * Comprehensive health check endpoint
 * GET /api/health
 */
export async function healthCheckHandler(
  _req: Request,
  res: Response
): Promise<void> {
  const startTime = Date.now();
  const health: HealthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV || "development",
    checks: {
      database: {
        status: "ok",
      },
      pythonAgents: {
        status: "unavailable",
      },
      memory: {
        used: 0,
        total: 0,
        percentage: 0,
      },
    },
  };

  // Check database
  try {
    const dbStartTime = Date.now();
    getAllConversations(); // Simple DB query
    health.checks.database.responseTime = Date.now() - dbStartTime;
    health.checks.database.status = "ok";
  } catch (error) {
    health.checks.database.status = "error";
    health.checks.database.error =
      error instanceof Error ? error.message : "Unknown error";
    health.status = "degraded";
  }

  // Check Python agents
  try {
    const agentsStartTime = Date.now();
    const response = await fetch("http://localhost:5001/health", {
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      health.checks.pythonAgents.status = "ok";
      health.checks.pythonAgents.responseTime = Date.now() - agentsStartTime;
    } else {
      health.checks.pythonAgents.status = "error";
      health.checks.pythonAgents.error = `HTTP ${response.status}`;
    }
  } catch (error) {
    health.checks.pythonAgents.status = "unavailable";
    health.checks.pythonAgents.error =
      error instanceof Error ? error.message : "Not running";
  }

  // Memory usage
  const memUsage = process.memoryUsage();
  health.checks.memory = {
    used: Math.round(memUsage.heapUsed / 1024 / 1024),
    total: Math.round(memUsage.heapTotal / 1024 / 1024),
    percentage: Math.round(
      (memUsage.heapUsed / memUsage.heapTotal) * 100
    ),
  };

  // Determine overall status
  if (health.checks.database.status === "error") {
    health.status = "unhealthy";
  } else if (
    health.checks.pythonAgents.status === "error" ||
    health.checks.memory.percentage > 90
  ) {
    health.status = "degraded";
  }

  const statusCode = health.status === "unhealthy" ? 503 : 200;
  res.status(statusCode).json(health);
}

/**
 * Mobile-specific status endpoint
 * GET /api/mobile/status
 */
export async function mobileStatusHandler(
  _req: Request,
  res: Response
): Promise<void> {
  const status: MobileStatus = {
    backend: {
      url: process.env.EXPO_PUBLIC_ZEKE_BACKEND_URL || "http://localhost:5000",
      reachable: true,
      version: process.env.npm_package_version || "1.0.0",
    },
    authentication: {
      configured: !!process.env.ZEKE_SHARED_SECRET,
      hmacEnabled: !!process.env.ZEKE_SHARED_SECRET,
    },
    features: {
      conversations: true,
      tasks: true,
      grocery: true,
      calendar: !!process.env.GOOGLE_CLIENT_ID,
      contacts: true,
    },
    connectivity: {
      latency: undefined,
      lastSuccessfulRequest: new Date().toISOString(),
    },
  };

  res.json(status);
}

/**
 * API routes documentation endpoint
 * GET /api/routes
 */
export function apiRoutesHandler(_req: Request, res: Response): void {
  const routes = {
    conversations: {
      "POST /api/conversations": "Create a new conversation",
      "GET /api/conversations": "Get all conversations",
      "GET /api/conversations/:id": "Get a specific conversation",
      "DELETE /api/conversations/:id": "Delete a conversation",
      "GET /api/conversations/:id/messages": "Get messages in a conversation",
      "POST /api/conversations/:id/messages": "Send a message",
    },
    tasks: {
      "POST /api/tasks": "Create a new task",
      "GET /api/tasks": "Get all tasks",
      "GET /api/tasks/:id": "Get a specific task",
      "PATCH /api/tasks/:id": "Update a task",
      "DELETE /api/tasks/:id": "Delete a task",
      "POST /api/tasks/:id/toggle": "Toggle task completion",
    },
    grocery: {
      "POST /api/grocery": "Add grocery item",
      "GET /api/grocery": "Get all grocery items",
      "PATCH /api/grocery/:id": "Update grocery item",
      "DELETE /api/grocery/:id": "Delete grocery item",
      "POST /api/grocery/:id/toggle": "Toggle purchased status",
    },
    contacts: {
      "POST /api/contacts": "Create a contact",
      "GET /api/contacts": "Get all contacts",
      "GET /api/contacts/:id": "Get a specific contact",
      "PATCH /api/contacts/:id": "Update a contact",
      "DELETE /api/contacts/:id": "Delete a contact",
    },
    calendar: {
      "GET /api/calendar/events": "Get calendar events",
      "POST /api/calendar/events": "Create calendar event",
      "GET /api/calendar/sync": "Trigger calendar sync",
    },
    memories: {
      "POST /api/memories": "Create a memory note",
      "GET /api/memories": "Get all memory notes",
      "DELETE /api/memories/:id": "Delete a memory note",
    },
    health: {
      "GET /api/health": "Backend health status",
      "GET /api/mobile/status": "Mobile app specific status",
      "GET /api/routes": "This documentation",
    },
  };

  res.json({
    title: "ZEKE API Routes",
    description: "Available API endpoints for the ZEKE backend",
    baseUrl: process.env.EXPO_PUBLIC_ZEKE_BACKEND_URL || "http://localhost:5000",
    version: "1.0.0",
    routes,
  });
}

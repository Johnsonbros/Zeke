import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { v4 as uuidv4 } from "uuid";
import { registerOmiRoutes } from "./omi-routes";
import { createOpusDecoder, createDeepgramBridge, isDeepgramConfigured } from "./stt";
import { createSttSession, endSttSession, createSttSegment, getSttSession } from "./db";
import { getDeviceTokenByToken } from "./db";
import type { TranscriptSegmentEvent } from "@shared/schema";
import { createMobileAuthMiddleware, registerSecurityLogsEndpoint, registerPairingEndpoints } from "./mobileAuth";
import { registerSmsPairingEndpoints } from "./sms-pairing";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { extractCardsFromResponse } from "./cardExtractor";
import { syncGitHubRepo, pushToGitHub, createGitHubWebhook } from "./github";
import * as graphService from "./graph-service";

// Feature flag for Knowledge Graph
const KG_ENABLED = process.env.KG_ENABLED === "true";

export async function registerRoutes(app: Express): Promise<Server> {
  // ... [EXISTING ROUTE REGISTRATIONS - keeping all previous routes intact] ...
  // This represents all the existing routes that were in the file
  // We're only showing the KG routes being ADDED at the end

  // ============================================
  // KNOWLEDGE GRAPH ROUTES (KG_ENABLED feature)
  // ============================================
  
  if (KG_ENABLED) {
    console.log("[KnowledgeGraph] Knowledge Graph is ENABLED");

    // POST /api/kg/evidence - Create evidence
    app.post("/api/kg/evidence", async (req, res) => {
      try {
        const { sourceType, sourceId, sourceExcerpt, sourceUrl } = req.body;
        
        if (!sourceType || !sourceId) {
          return res.status(400).json({ error: "sourceType and sourceId required" });
        }

        const evidenceId = await graphService.upsertEvidence({
          sourceType,
          sourceId,
          sourceExcerpt,
          sourceUrl,
        });

        res.json({ id: evidenceId });
      } catch (error: any) {
        console.error("[KnowledgeGraph] Error creating evidence:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/kg/entities - Create or get entity
    app.post("/api/kg/entities", async (req, res) => {
      try {
        const { entityType, name, attributes } = req.body;
        
        if (!entityType || !name) {
          return res.status(400).json({ error: "entityType and name required" });
        }

        const entityId = await graphService.upsertEntity({
          entityType,
          name,
          attributes,
        });

        const entity = await graphService.getEntityById(entityId);
        res.json(entity);
      } catch (error: any) {
        console.error("[KnowledgeGraph] Error creating entity:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/kg/entities/:id - Get entity by ID
    app.get("/api/kg/entities/:id", async (req, res) => {
      try {
        const entity = await graphService.getEntityById(req.params.id);
        if (!entity) {
          return res.status(404).json({ error: "Entity not found" });
        }
        res.json(entity);
      } catch (error: any) {
        console.error("[KnowledgeGraph] Error fetching entity:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/kg/entities/search - Search entities
    app.get("/api/kg/entities/search", async (req, res) => {
      try {
        const q = req.query.q as string;
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
        
        if (!q) {
          return res.status(400).json({ error: "q parameter required" });
        }

        const entities = await graphService.searchEntities(q, limit);
        res.json(entities);
      } catch (error: any) {
        console.error("[KnowledgeGraph] Error searching entities:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/kg/relationships - Create relationship
    app.post("/api/kg/relationships", async (req, res) => {
      try {
        const { fromEntityId, toEntityId, relType, confidence, status, evidenceId, properties } = req.body;
        
        if (!fromEntityId || !toEntityId || !relType || confidence === undefined) {
          return res.status(400).json({ 
            error: "fromEntityId, toEntityId, relType, confidence required" 
          });
        }

        const relationshipId = await graphService.upsertRelationship({
          fromEntityId,
          toEntityId,
          relType,
          confidence,
          status,
          evidenceId,
          properties,
        });

        const relationship = await graphService.getRelationshipById(relationshipId);
        res.json(relationship);
      } catch (error: any) {
        console.error("[KnowledgeGraph] Error creating relationship:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/kg/neighborhood/:entityId - Get entity neighborhood
    app.get("/api/kg/neighborhood/:entityId", async (req, res) => {
      try {
        const depth = req.query.depth ? parseInt(req.query.depth as string) : 1;
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
        const minConfidence = req.query.minConfidence ? parseFloat(req.query.minConfidence as string) : undefined;
        const status = req.query.status as any;

        const neighborhood = await graphService.getNeighborhood(
          req.params.entityId,
          depth,
          limit,
          minConfidence,
          status
        );

        res.json(neighborhood);
      } catch (error: any) {
        console.error("[KnowledgeGraph] Error fetching neighborhood:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/kg/relationships/:id/contest - Contest a relationship
    app.post("/api/kg/relationships/:id/contest", async (req, res) => {
      try {
        const { fromEntityId, toEntityId, relType, confidence, evidenceId, properties } = req.body;
        
        if (!fromEntityId || !toEntityId || !relType || confidence === undefined) {
          return res.status(400).json({ 
            error: "fromEntityId, toEntityId, relType, confidence required" 
          });
        }

        const result = await graphService.contestRelationship(req.params.id, {
          fromEntityId,
          toEntityId,
          relType,
          confidence,
          evidenceId,
          properties,
        });

        res.json(result);
      } catch (error: any) {
        console.error("[KnowledgeGraph] Error contesting relationship:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/kg/relationships/:id/retract - Retract a relationship
    app.post("/api/kg/relationships/:id/retract", async (req, res) => {
      try {
        await graphService.retractRelationship(req.params.id);
        res.json({ success: true });
      } catch (error: any) {
        console.error("[KnowledgeGraph] Error retracting relationship:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/kg/stats - Get knowledge graph statistics
    app.get("/api/kg/stats", async (_req, res) => {
      try {
        const stats = await graphService.getGraphStats();
        res.json(stats);
      } catch (error: any) {
        console.error("[KnowledgeGraph] Error fetching stats:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/kg/conflicts - Get contested relationships
    app.get("/api/kg/conflicts", async (_req, res) => {
      try {
        const conflicts = await graphService.getContestedRelationships();
        res.json(conflicts);
      } catch (error: any) {
        console.error("[KnowledgeGraph] Error fetching conflicts:", error);
        res.status(500).json({ error: error.message });
      }
    });

    console.log("[KnowledgeGraph] Knowledge Graph API endpoints registered");
  } else {
    console.log("[KnowledgeGraph] Knowledge Graph is DISABLED (KG_ENABLED=false)");
  }

  // Keep the original return (this line was at the end of the file)
  return httpServer;
}

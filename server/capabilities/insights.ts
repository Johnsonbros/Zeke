import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";
import {
  analyzeTemporalPatterns,
  findBridgingEntities,
  getKnowledgeGraphStats,
} from "../knowledgeGraph";
import { getActivePatterns, getPendingPredictions } from "../db";

const DEFAULT_TREND_DAYS = 30;
const DEFAULT_BRIDGE_LIMIT = 5;

export const insightToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_knowledge_graph_briefing",
      description:
        "Summarize the health of the knowledge graph, including key connectors, activity trends, and domain coverage. Use this to give users an overview instead of exposing raw graph queries.",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "How many recent days to analyze for trends (default: 30)",
          },
          bridge_limit: {
            type: "number",
            description: "How many top bridging entities to highlight (default: 5)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recommend_cross_domain_bridges",
      description:
        "Recommend the strongest bridging entities that connect multiple domains. Great for suggesting who or what to involve to connect topics, locations, tasks, or memories without running raw graph traversals.",
      parameters: {
        type: "object",
        properties: {
          target_domains: {
            type: "array",
            description: "Optional list of domains to focus on (e.g., tasks, calendar, contacts, memory)",
            items: { type: "string" },
          },
          min_domains: {
            type: "number",
            description: "Minimum number of domains an entity should bridge (default: 2)",
          },
          limit: {
            type: "number",
            description: "Maximum number of recommendations to return (default: 5)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_prediction_next_actions",
      description:
        "Summarize pending predictions and suggest the next user-facing actions, including confidence and supporting patterns. Use this to surface proactive steps without exposing raw prediction APIs.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of predictions to summarize (default: 5)",
          },
        },
        required: [],
      },
    },
  },
];

export const insightToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  get_knowledge_graph_briefing: (p) => p.isAdmin || p.canQueryMemory,
  recommend_cross_domain_bridges: (p) => p.isAdmin || p.canQueryMemory,
  suggest_prediction_next_actions: (p) => p.isAdmin || p.canSetReminders,
};

export const insightToolNames = insightToolDefinitions.map(tool => (tool as { function: { name: string } }).function.name);

type ToolResult = { success: boolean; result?: any; error?: string };

type InsightArgs = Record<string, any>;

function buildGraphBriefing(args: InsightArgs): ToolResult {
  const days = typeof args.days === "number" ? args.days : DEFAULT_TREND_DAYS;
  const bridgeLimit = typeof args.bridge_limit === "number" ? args.bridge_limit : DEFAULT_BRIDGE_LIMIT;

  const stats = getKnowledgeGraphStats();
  const topBridges = findBridgingEntities(2).slice(0, bridgeLimit);
  const temporal = analyzeTemporalPatterns(undefined, days).slice(0, 5);

  const summary = {
    headline: `Knowledge graph has ${stats.totalEntities} entities across ${Object.keys(stats.referencesByDomain).length} domains with ${stats.totalLinks} connections`,
    connectorsHighlight: topBridges.map(b => `${b.entityLabel} (${b.domains.length} domains, strength ${b.connectionStrength.toFixed(2)})`).slice(0, 3),
    recentActivity: stats.recentActivity,
  };

  return {
    success: true,
    result: {
      summary,
      stats: {
        totalEntities: stats.totalEntities,
        totalLinks: stats.totalLinks,
        totalReferences: stats.totalReferences,
        entitiesByType: stats.entitiesByType,
        referencesByDomain: stats.referencesByDomain,
        mostConnectedEntities: stats.mostConnectedEntities.slice(0, 10),
      },
      topBridgingEntities: topBridges,
      trendingEntities: temporal,
    },
  };
}

function recommendBridges(args: InsightArgs): ToolResult {
  const minDomains = typeof args.min_domains === "number" ? args.min_domains : 2;
  const limit = typeof args.limit === "number" ? args.limit : DEFAULT_BRIDGE_LIMIT;
  const requestedDomains = Array.isArray(args.target_domains)
    ? (args.target_domains as string[]).map(domain => domain.toLowerCase())
    : [];

  const bridgingEntities = findBridgingEntities(minDomains);
  const filtered = requestedDomains.length > 0
    ? bridgingEntities.filter(connection =>
        connection.domains.some(d => requestedDomains.includes(d.domain.toLowerCase())),
      )
    : bridgingEntities;

  const recommendations = filtered.slice(0, limit).map(connection => ({
    entity: {
      id: connection.entityId,
      label: connection.entityLabel,
      type: connection.entityType,
    },
    connectionStrength: connection.connectionStrength,
    domains: connection.domains.map(d => d.domain),
    anchorExamples: connection.domains.slice(0, 3).map(d => d.itemSummary),
  }));

  return {
    success: true,
    result: {
      requestedDomains,
      availableCandidates: bridgingEntities.length,
      shown: recommendations.length,
      recommendations,
    },
  };
}

async function suggestNextActions(args: InsightArgs): Promise<ToolResult> {
  const limit = typeof args.limit === "number" ? args.limit : DEFAULT_BRIDGE_LIMIT;

  const pendingPredictions = (await getPendingPredictions()).slice(0, limit);
  const activePatterns = (await getActivePatterns()).slice(0, 3);

  const recommendations = pendingPredictions.map(prediction => ({
    id: prediction.id,
    title: prediction.title,
    type: prediction.type,
    priority: prediction.priority,
    confidence: prediction.confidenceLevel,
    confidenceScore: prediction.confidenceScore,
    suggestedAction: prediction.suggestedAction,
    requiresApproval: prediction.requiresUserApproval,
    predictedFor: prediction.predictedFor,
    validUntil: prediction.validUntil,
  }));

  const supportingPatterns = activePatterns.map(pattern => ({
    id: pattern.id,
    name: pattern.name,
    type: pattern.type,
    strength: pattern.strength,
    accuracyRate: pattern.accuracyRate,
    lastValidatedAt: pattern.lastValidatedAt,
  }));

  return {
    success: true,
    result: {
      pendingCount: pendingPredictions.length,
      recommendations,
      supportingPatterns,
    },
  };
}

export async function executeInsightTool(toolName: string, args: InsightArgs): Promise<ToolResult> {
  try {
    switch (toolName) {
      case "get_knowledge_graph_briefing":
        return buildGraphBriefing(args);
      case "recommend_cross_domain_bridges":
        return recommendBridges(args);
      case "suggest_prediction_next_actions":
        return await suggestNextActions(args);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error: any) {
    console.error(`[InsightTool] Error executing ${toolName}:`, error);
    return { success: false, error: error.message || "Tool execution failed" };
  }
}

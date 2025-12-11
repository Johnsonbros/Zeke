/**
 * Knowledge Graph Tools for ZEKE
 * 
 * These tools enable ZEKE to explore and query the unified knowledge graph,
 * finding connections across domains (memories, tasks, contacts, lifelogs, etc.)
 */

import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";
import {
  queryKnowledgeGraph,
  traverseGraph,
  getEntityNeighborhood,
  getCrossDomainConnections,
  findBridgingEntities,
  findShortestPath,
  getPersonContext,
  analyzeTemporalPatterns,
  getKnowledgeGraphStats,
} from "../knowledgeGraph";
import { findEntitiesByLabel, getEntity } from "../db";

export const knowledgeGraphToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "explore_connections",
      description: "Explore connections in Nate's knowledge graph. Use this to find relationships between people, topics, tasks, and memories. Perfect for questions like 'What do I know about Bob?', 'How are these topics related?', or 'Show me connections between work and travel'. This searches across ALL domains including memories, tasks, calendar events, conversations, and lifelogs.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Natural language query describing what connections to find. Can be a person's name, topic, question, or concept.",
          },
          max_depth: {
            type: "number",
            description: "How many relationship hops to explore (default 2, max 5). Higher values find more distant connections.",
          },
          max_nodes: {
            type: "number",
            description: "Maximum entities to return (default 30). Increase for broader exploration.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_person_context",
      description: "Get comprehensive context about a person from all connected data sources. Returns their mentions across memories, tasks, calendar events, conversations, and lifelogs. Use this before answering questions about specific people like 'What's my relationship with Bob?' or 'When did I last talk to Sarah?'",
      parameters: {
        type: "object",
        properties: {
          person_name: {
            type: "string",
            description: "The name of the person to get context for",
          },
        },
        required: ["person_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_related_entities",
      description: "Given an entity (person, topic, location), find everything connected to it across all domains. Shows memories mentioning them, tasks involving them, calendar events, and more. Great for deep dives into specific entities.",
      parameters: {
        type: "object",
        properties: {
          entity_label: {
            type: "string",
            description: "The name/label of the entity to explore (e.g., 'Bob', 'work', 'Boston')",
          },
          entity_type: {
            type: "string",
            enum: ["person", "location", "topic", "date"],
            description: "Type of entity to search for (optional, helps narrow results)",
          },
          max_depth: {
            type: "number",
            description: "How many hops to traverse (default 2)",
          },
        },
        required: ["entity_label"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_connection_path",
      description: "Find how two entities are connected through the knowledge graph. Shows the relationship chain between them. Use for questions like 'How do I know Bob through Sarah?' or 'What connects my work tasks to the Boston trip?'",
      parameters: {
        type: "object",
        properties: {
          from_entity: {
            type: "string",
            description: "Name/label of the starting entity",
          },
          to_entity: {
            type: "string",
            description: "Name/label of the target entity",
          },
          max_depth: {
            type: "number",
            description: "Maximum path length to search (default 5)",
          },
        },
        required: ["from_entity", "to_entity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_bridging_entities",
      description: "Find entities that appear across multiple domains, acting as bridges between different areas of life. These are often important people, key topics, or significant locations. Use this to understand what connects different aspects of Nate's life.",
      parameters: {
        type: "object",
        properties: {
          min_domains: {
            type: "number",
            description: "Minimum number of domains an entity must appear in (default 2). Higher values find more significant cross-domain entities.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_temporal_patterns",
      description: "Analyze temporal patterns in the knowledge graph. Find which entities are most active in different time periods, trending topics, and activity patterns over time.",
      parameters: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            enum: ["person", "location", "topic", "date"],
            description: "Type of entity to analyze (optional, analyzes all if not specified)",
          },
          days: {
            type: "number",
            description: "Number of days to analyze (default 30)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_knowledge_graph_stats",
      description: "Get statistics about the knowledge graph including total entities, references, and domain breakdown. Use this to understand the breadth and depth of the connected knowledge.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

export const knowledgeGraphToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  explore_connections: (p) => p.isAdmin || p.canQueryMemory,
  get_person_context: (p) => p.isAdmin || p.canQueryMemory,
  find_related_entities: (p) => p.isAdmin || p.canQueryMemory,
  find_connection_path: (p) => p.isAdmin || p.canQueryMemory,
  get_bridging_entities: (p) => p.isAdmin || p.canQueryMemory,
  get_temporal_patterns: (p) => p.isAdmin || p.canQueryMemory,
  get_knowledge_graph_stats: (p) => p.isAdmin || p.canQueryMemory,
};

export const knowledgeGraphToolNames = knowledgeGraphToolDefinitions.map(t => (t as { function: { name: string } }).function.name);

type ToolResult = {
  success: boolean;
  result?: any;
  error?: string;
};

export async function executeKnowledgeGraphTool(
  toolName: string,
  args: Record<string, any>
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case "explore_connections": {
        const { query, max_depth = 2, max_nodes = 30 } = args;
        const result = await queryKnowledgeGraph(query, { 
          maxDepth: max_depth, 
          maxNodes: max_nodes 
        });
        return { success: true, result };
      }

      case "get_person_context": {
        const { person_name } = args;
        // Find person entity by name
        const entities = findEntitiesByLabel(person_name);
        const personEntity = entities.find(e => e.type === "person");
        
        if (!personEntity) {
          return { 
            success: true, 
            result: {
              found: false,
              message: `No person named "${person_name}" found in the knowledge graph. They may not have been mentioned in any memories, tasks, or conversations.`
            }
          };
        }
        
        const context = getPersonContext(personEntity.canonicalId || personEntity.id);
        return { success: true, result: { found: true, person_name, ...context } };
      }

      case "find_related_entities": {
        const { entity_label, entity_type, max_depth = 2 } = args;
        
        // Find entity by label
        let entities = findEntitiesByLabel(entity_label);
        if (entity_type) {
          entities = entities.filter(e => e.type === entity_type);
        }
        
        if (entities.length === 0) {
          return { 
            success: true, 
            result: {
              found: false,
              message: `No entity "${entity_label}" found in the knowledge graph.`
            }
          };
        }
        
        const entity = entities[0];
        const neighborhood = getEntityNeighborhood(entity.id, { maxDepth: max_depth, maxNodes: 50 });
        const connections = getCrossDomainConnections(entity.id);
        
        return { 
          success: true, 
          result: {
            found: true,
            entity: {
              id: entity.id,
              type: entity.type,
              label: entity.label,
            },
            neighborhood,
            crossDomainConnections: connections,
          }
        };
      }

      case "find_connection_path": {
        const { from_entity, to_entity, max_depth = 5 } = args;
        
        // Find both entities
        const fromEntities = findEntitiesByLabel(from_entity);
        const toEntities = findEntitiesByLabel(to_entity);
        
        if (fromEntities.length === 0) {
          return { 
            success: true, 
            result: { found: false, message: `Entity "${from_entity}" not found` }
          };
        }
        
        if (toEntities.length === 0) {
          return { 
            success: true, 
            result: { found: false, message: `Entity "${to_entity}" not found` }
          };
        }
        
        const path = findShortestPath(fromEntities[0].id, toEntities[0].id, max_depth);
        
        if (!path) {
          return { 
            success: true, 
            result: {
              found: false,
              message: `No connection found between "${from_entity}" and "${to_entity}" within ${max_depth} hops.`
            }
          };
        }
        
        return { 
          success: true, 
          result: {
            found: true,
            from: from_entity,
            to: to_entity,
            path,
            pathLength: path.length,
          }
        };
      }

      case "get_bridging_entities": {
        const { min_domains = 2 } = args;
        const bridging = findBridgingEntities(min_domains);
        return { 
          success: true, 
          result: {
            minDomains: min_domains,
            count: bridging.length,
            entities: bridging.slice(0, 20), // Limit to top 20
          }
        };
      }

      case "get_temporal_patterns": {
        const { entity_type, days = 30 } = args;
        const patterns = analyzeTemporalPatterns(entity_type, days);
        return { 
          success: true, 
          result: {
            type: entity_type || "all",
            days,
            patterns: patterns.slice(0, 20), // Limit to top 20
          }
        };
      }

      case "get_knowledge_graph_stats": {
        const stats = getKnowledgeGraphStats();
        return { success: true, result: stats };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error: any) {
    console.error(`[KnowledgeGraphTool] Error executing ${toolName}:`, error);
    return { success: false, error: error.message || "Tool execution failed" };
  }
}

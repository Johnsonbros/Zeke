/**
 * Knowledge Graph Service for ZEKE
 * 
 * Provides advanced graph-based retrieval and reasoning capabilities:
 * - Multi-hop graph traversal (BFS/DFS)
 * - Temporal decay scoring for recency-aware retrieval
 * - Entity neighborhood discovery
 * - Cross-domain relationship mapping
 * - Unified search combining vector similarity + graph relationships
 * 
 * This transforms ZEKE from "assistant with good memory" to 
 * "assistant that truly understands your life connections"
 */

import {
  Entity,
  EntityType,
  EntityLink,
  EntityReference,
  EntityDomain,
  EntityRelationshipType,
  Contact,
  MemoryNote,
  Task,
  Message,
  Conversation,
  GroceryItem,
  SavedPlace,
} from "@shared/schema";

import {
  getEntity,
  getAllEntities,
  getEntitiesByType,
  getEntityLinks,
  getEntityReferences,
  getEntitiesForItem,
  getItemsRelatedToEntity,
  getRelatedEntities,
  findEntitiesByLabel,
  getContact,
  getMemoryNote,
  getTask,
  getConversation,
  getSavedPlace,
  getGroceryItem,
  getAllMemoryNotes,
  getAllTasks,
  getAllContacts,
  getMessagesByConversation,
} from "./db";

import { getSmartMemoryContext, semanticSearch } from "./semanticMemory";

// ============================================
// TYPES AND INTERFACES
// ============================================

export interface GraphNode {
  entity: Entity;
  depth: number;
  score: number;
  path: string[];
  temporalScore: number;
  relationshipPath: EntityRelationshipType[];
}

export interface GraphTraversalOptions {
  maxDepth: number;
  maxNodes: number;
  minScore: number;
  includeTypes?: EntityType[];
  excludeTypes?: EntityType[];
  relationshipFilter?: EntityRelationshipType[];
  temporalDecayDays?: number;
  includeReferences?: boolean;
}

export interface GraphNeighborhood {
  center: Entity;
  nodes: GraphNode[];
  edges: Array<{
    source: string;
    target: string;
    relationship: EntityRelationshipType;
    weight: number;
    lastSeen: string;
  }>;
  stats: {
    totalNodes: number;
    totalEdges: number;
    avgDepth: number;
    maxDepth: number;
    typeDistribution: Record<EntityType, number>;
  };
}

export interface CrossDomainConnection {
  entityId: string;
  entityLabel: string;
  entityType: EntityType;
  domains: Array<{
    domain: EntityDomain;
    itemId: string;
    itemSummary: string;
    confidence: number;
    extractedAt: string;
  }>;
  connectionStrength: number;
}

export interface GraphQueryResult {
  entities: GraphNode[];
  connections: CrossDomainConnection[];
  relevantItems: Array<{
    domain: EntityDomain;
    itemId: string;
    item: any;
    relevanceScore: number;
  }>;
  queryContext: string;
}

export interface TemporalPattern {
  entityId: string;
  entityLabel: string;
  firstMention: string;
  lastMention: string;
  mentionCount: number;
  peakActivity: string;
  trend: "increasing" | "decreasing" | "stable";
}

export interface KnowledgeGraphStats {
  totalEntities: number;
  totalLinks: number;
  totalReferences: number;
  entitiesByType: Record<EntityType, number>;
  linksByType: Record<EntityRelationshipType, number>;
  referencesByDomain: Record<EntityDomain, number>;
  mostConnectedEntities: Array<{
    entity: Entity;
    connectionCount: number;
  }>;
  recentActivity: {
    lastDay: number;
    lastWeek: number;
    lastMonth: number;
  };
}

// Default traversal options
const DEFAULT_TRAVERSAL_OPTIONS: GraphTraversalOptions = {
  maxDepth: 3,
  maxNodes: 50,
  minScore: 0.1,
  temporalDecayDays: 30,
  includeReferences: true,
};

// ============================================
// TEMPORAL DECAY SCORING
// ============================================

/**
 * Calculate temporal decay score based on how recent an interaction was
 * More recent = higher score (approaches 1.0)
 * Older = lower score (approaches 0.0)
 */
export function calculateTemporalDecay(
  timestamp: string | Date,
  decayDays: number = 30
): number {
  const now = new Date();
  const then = new Date(timestamp);
  const daysDiff = (now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24);
  
  // Exponential decay: e^(-daysDiff / decayDays)
  // At 0 days: 1.0
  // At decayDays: ~0.37
  // At 2*decayDays: ~0.14
  const decay = Math.exp(-daysDiff / decayDays);
  
  // Ensure minimum score of 0.05 for very old items
  return Math.max(decay, 0.05);
}

/**
 * Calculate combined relevance score for an entity
 * Factors: connection weight, temporal recency, relationship strength
 */
export function calculateEntityScore(
  entity: Entity,
  link: EntityLink | null,
  depth: number,
  options: GraphTraversalOptions
): number {
  let score = 1.0;
  
  // Depth penalty: deeper nodes are less relevant
  score *= Math.pow(0.7, depth);
  
  // Link weight boost
  if (link) {
    score *= parseFloat(link.weight) || 0.5;
    
    // Temporal boost based on lastSeenAt
    const temporalScore = calculateTemporalDecay(
      link.lastSeenAt,
      options.temporalDecayDays || 30
    );
    score *= (0.5 + 0.5 * temporalScore); // Blend base score with temporal
  }
  
  return score;
}

// ============================================
// GRAPH TRAVERSAL (BFS)
// ============================================

/**
 * Traverse the knowledge graph using BFS starting from a given entity
 * Returns all reachable nodes within the specified depth and score thresholds
 */
export function traverseGraph(
  startEntityId: string,
  options: Partial<GraphTraversalOptions> = {}
): GraphNode[] {
  const opts = { ...DEFAULT_TRAVERSAL_OPTIONS, ...options };
  const startEntity = getEntity(startEntityId);
  
  if (!startEntity) {
    console.warn(`[KnowledgeGraph] Entity not found: ${startEntityId}`);
    return [];
  }
  
  const visited = new Set<string>();
  const result: GraphNode[] = [];
  
  // BFS queue: [entityId, depth, score, path, relationshipPath]
  const queue: Array<[string, number, number, string[], EntityRelationshipType[]]> = [
    [startEntityId, 0, 1.0, [startEntity.label], []]
  ];
  
  while (queue.length > 0 && result.length < opts.maxNodes) {
    const [currentId, depth, pathScore, path, relPath] = queue.shift()!;
    
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    
    const entity = getEntity(currentId);
    if (!entity) continue;
    
    // Type filtering
    if (opts.includeTypes && !opts.includeTypes.includes(entity.type)) continue;
    if (opts.excludeTypes && opts.excludeTypes.includes(entity.type)) continue;
    
    // Calculate temporal score for this entity
    const temporalScore = calculateTemporalDecay(entity.createdAt, opts.temporalDecayDays);
    const finalScore = pathScore * (0.5 + 0.5 * temporalScore);
    
    // Score filtering
    if (finalScore < opts.minScore) continue;
    
    result.push({
      entity,
      depth,
      score: finalScore,
      path,
      temporalScore,
      relationshipPath: relPath,
    });
    
    // Don't explore beyond maxDepth
    if (depth >= opts.maxDepth) continue;
    
    // Get all links from this entity
    const links = getEntityLinks(currentId);
    
    for (const link of links) {
      const isSource = link.sourceEntityId === currentId;
      const neighborId = isSource ? link.targetEntityId : link.sourceEntityId;
      
      if (visited.has(neighborId)) continue;
      
      // Relationship filtering
      if (opts.relationshipFilter && !opts.relationshipFilter.includes(link.relationshipType)) {
        continue;
      }
      
      const neighborEntity = getEntity(neighborId);
      if (!neighborEntity) continue;
      
      const linkScore = calculateEntityScore(neighborEntity, link, depth + 1, opts);
      const newScore = pathScore * linkScore;
      
      if (newScore >= opts.minScore) {
        queue.push([
          neighborId,
          depth + 1,
          newScore,
          [...path, neighborEntity.label],
          [...relPath, link.relationshipType],
        ]);
      }
    }
  }
  
  // Sort by score descending
  result.sort((a, b) => b.score - a.score);
  
  return result;
}

/**
 * Get the full neighborhood around an entity
 * Returns nodes, edges, and statistics
 */
export function getEntityNeighborhood(
  entityId: string,
  options: Partial<GraphTraversalOptions> = {}
): GraphNeighborhood | null {
  const center = getEntity(entityId);
  if (!center) return null;
  
  const nodes = traverseGraph(entityId, options);
  const nodeIds = new Set(nodes.map(n => n.entity.id));
  
  // Collect all edges between discovered nodes
  const edges: GraphNeighborhood["edges"] = [];
  const seenEdges = new Set<string>();
  
  for (const node of nodes) {
    const links = getEntityLinks(node.entity.id);
    for (const link of links) {
      // Only include edges between nodes in our neighborhood
      if (!nodeIds.has(link.sourceEntityId) || !nodeIds.has(link.targetEntityId)) {
        continue;
      }
      
      const edgeKey = `${link.sourceEntityId}-${link.targetEntityId}-${link.relationshipType}`;
      if (seenEdges.has(edgeKey)) continue;
      seenEdges.add(edgeKey);
      
      edges.push({
        source: link.sourceEntityId,
        target: link.targetEntityId,
        relationship: link.relationshipType,
        weight: parseFloat(link.weight) || 0.5,
        lastSeen: link.lastSeenAt,
      });
    }
  }
  
  // Calculate statistics
  const typeDistribution: Record<EntityType, number> = {} as any;
  let totalDepth = 0;
  let maxDepth = 0;
  
  for (const node of nodes) {
    typeDistribution[node.entity.type] = (typeDistribution[node.entity.type] || 0) + 1;
    totalDepth += node.depth;
    maxDepth = Math.max(maxDepth, node.depth);
  }
  
  return {
    center,
    nodes,
    edges,
    stats: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      avgDepth: nodes.length > 0 ? totalDepth / nodes.length : 0,
      maxDepth,
      typeDistribution,
    },
  };
}

// ============================================
// CROSS-DOMAIN CONNECTIONS
// ============================================

/**
 * Find all cross-domain connections for an entity
 * Shows how an entity connects different domains (memory, task, calendar, etc.)
 */
export function getCrossDomainConnections(entityId: string): CrossDomainConnection | null {
  const entity = getEntity(entityId);
  if (!entity) return null;
  
  const references = getEntityReferences(entityId);
  const domains: CrossDomainConnection["domains"] = [];
  
  for (const ref of references) {
    const itemSummary = getItemSummary(ref.domain, ref.itemId);
    
    domains.push({
      domain: ref.domain,
      itemId: ref.itemId,
      itemSummary,
      confidence: parseFloat(ref.confidence) || 0.5,
      extractedAt: ref.extractedAt,
    });
  }
  
  // Calculate connection strength based on number of domains and average confidence
  const uniqueDomains = new Set(domains.map(d => d.domain)).size;
  const avgConfidence = domains.length > 0
    ? domains.reduce((sum, d) => sum + d.confidence, 0) / domains.length
    : 0;
  
  return {
    entityId: entity.id,
    entityLabel: entity.label,
    entityType: entity.type,
    domains,
    connectionStrength: (uniqueDomains / 7) * avgConfidence, // 7 = total domain types
  };
}

/**
 * Get a summary string for an item in a given domain
 */
function getItemSummary(domain: EntityDomain, itemId: string): string {
  try {
    switch (domain) {
      case "memory": {
        const memory = getMemoryNote(itemId);
        return memory ? `[${memory.type}] ${memory.content.substring(0, 100)}...` : "Memory note";
      }
      case "task": {
        const task = getTask(itemId);
        return task ? `${task.title} (${task.priority}, ${task.completed ? "done" : "pending"})` : "Task";
      }
      case "contact": {
        const contact = getContact(itemId);
        return contact ? `${contact.firstName} ${contact.lastName}` : "Contact";
      }
      case "conversation": {
        const conv = getConversation(itemId);
        return conv ? `Conversation: ${conv.title}` : "Conversation";
      }
      case "location": {
        const place = getSavedPlace(itemId);
        return place ? `${place.name} (${place.category || "place"})` : "Location";
      }
      case "grocery": {
        const item = getGroceryItem(itemId);
        return item ? `${item.name} (${item.category || "grocery"})` : "Grocery item";
      }
      default:
        return `${domain} item`;
    }
  } catch {
    return `${domain} item`;
  }
}

/**
 * Find entities that bridge multiple domains
 * These are key connectors in the knowledge graph
 */
export function findBridgingEntities(minDomains: number = 2): CrossDomainConnection[] {
  const allEntities = getAllEntities();
  const bridging: CrossDomainConnection[] = [];
  
  for (const entity of allEntities) {
    const connection = getCrossDomainConnections(entity.id);
    if (!connection) continue;
    
    const uniqueDomains = new Set(connection.domains.map(d => d.domain)).size;
    if (uniqueDomains >= minDomains) {
      bridging.push(connection);
    }
  }
  
  // Sort by connection strength
  bridging.sort((a, b) => b.connectionStrength - a.connectionStrength);
  
  return bridging;
}

// ============================================
// UNIFIED GRAPH QUERY
// ============================================

/**
 * Query the knowledge graph with natural language
 * Combines semantic search with graph traversal for comprehensive results
 */
export async function queryKnowledgeGraph(
  query: string,
  options: Partial<GraphTraversalOptions> = {}
): Promise<GraphQueryResult> {
  const opts = { ...DEFAULT_TRAVERSAL_OPTIONS, ...options };
  const entities: GraphNode[] = [];
  const connections: CrossDomainConnection[] = [];
  const relevantItems: GraphQueryResult["relevantItems"] = [];
  const seenEntityIds = new Set<string>();
  const seenItemKeys = new Set<string>();
  
  // Step 1: Find entities by label matching
  const labelMatches = findEntitiesByLabel(query);
  for (const entity of labelMatches.slice(0, 10)) {
    if (!seenEntityIds.has(entity.id)) {
      seenEntityIds.add(entity.id);
      
      const temporalScore = calculateTemporalDecay(entity.createdAt, opts.temporalDecayDays);
      entities.push({
        entity,
        depth: 0,
        score: 0.9, // High score for direct label match
        path: [entity.label],
        temporalScore,
        relationshipPath: [],
      });
    }
  }
  
  // Step 2: Semantic search for relevant memories
  try {
    const semanticResults = await semanticSearch(query, 10);
    for (const result of semanticResults) {
      // Get entities referenced in this memory
      const memoryEntities = getEntitiesForItem("memory", result.id);
      for (const entity of memoryEntities) {
        if (!seenEntityIds.has(entity.id)) {
          seenEntityIds.add(entity.id);
          
          const temporalScore = calculateTemporalDecay(entity.createdAt, opts.temporalDecayDays);
          entities.push({
            entity,
            depth: 1,
            score: result.similarity * 0.8,
            path: [`[memory] ${result.content.substring(0, 50)}...`, entity.label],
            temporalScore,
            relationshipPath: ["mentions" as EntityRelationshipType],
          });
        }
      }
      
      // Add the memory itself as a relevant item
      const itemKey = `memory:${result.id}`;
      if (!seenItemKeys.has(itemKey)) {
        seenItemKeys.add(itemKey);
        relevantItems.push({
          domain: "memory",
          itemId: result.id,
          item: result,
          relevanceScore: result.similarity,
        });
      }
    }
  } catch (error) {
    console.error("[KnowledgeGraph] Semantic search error:", error);
  }
  
  // Step 3: Traverse graph from found entities
  for (const startNode of entities.slice(0, 5)) { // Limit starting points
    const neighborhood = traverseGraph(startNode.entity.id, {
      ...opts,
      maxDepth: 2, // Shallower for query expansion
      maxNodes: 20,
    });
    
    for (const node of neighborhood) {
      if (!seenEntityIds.has(node.entity.id)) {
        seenEntityIds.add(node.entity.id);
        
        // Adjust score based on starting point
        node.score *= startNode.score;
        node.path = [...startNode.path, ...node.path.slice(1)];
        node.depth += startNode.depth;
        
        entities.push(node);
      }
    }
  }
  
  // Step 4: Get cross-domain connections for top entities
  for (const node of entities.slice(0, 15)) {
    const connection = getCrossDomainConnections(node.entity.id);
    if (connection && connection.domains.length > 0) {
      connections.push(connection);
      
      // Add domain items to relevant items
      for (const domain of connection.domains) {
        const itemKey = `${domain.domain}:${domain.itemId}`;
        if (!seenItemKeys.has(itemKey)) {
          seenItemKeys.add(itemKey);
          
          const item = await fetchDomainItem(domain.domain, domain.itemId);
          if (item) {
            relevantItems.push({
              domain: domain.domain,
              itemId: domain.itemId,
              item,
              relevanceScore: node.score * domain.confidence,
            });
          }
        }
      }
    }
  }
  
  // Sort all results
  entities.sort((a, b) => b.score - a.score);
  connections.sort((a, b) => b.connectionStrength - a.connectionStrength);
  relevantItems.sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  // Build query context summary
  const topEntities = entities.slice(0, 5).map(e => e.entity.label).join(", ");
  const topDomains = [...new Set(relevantItems.slice(0, 10).map(i => i.domain))].join(", ");
  const queryContext = `Found ${entities.length} entities (${topEntities || "none"}) across domains: ${topDomains || "none"}`;
  
  return {
    entities: entities.slice(0, opts.maxNodes),
    connections: connections.slice(0, 20),
    relevantItems: relevantItems.slice(0, 30),
    queryContext,
  };
}

/**
 * Fetch an item from a specific domain
 */
async function fetchDomainItem(domain: EntityDomain, itemId: string): Promise<any> {
  try {
    switch (domain) {
      case "memory":
        return getMemoryNote(itemId);
      case "task":
        return getTask(itemId);
      case "contact":
        return getContact(itemId);
      case "conversation":
        return getConversation(itemId);
      case "location":
        return getSavedPlace(itemId);
      case "grocery":
        return getGroceryItem(itemId);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ============================================
// RELATIONSHIP QUERIES
// ============================================

/**
 * Find the shortest path between two entities
 */
export function findShortestPath(
  fromEntityId: string,
  toEntityId: string,
  maxDepth: number = 5
): GraphNode[] | null {
  const fromEntity = getEntity(fromEntityId);
  const toEntity = getEntity(toEntityId);
  
  if (!fromEntity || !toEntity) return null;
  
  // BFS to find shortest path
  const visited = new Set<string>();
  const queue: Array<{ id: string; path: GraphNode[] }> = [
    { 
      id: fromEntityId, 
      path: [{
        entity: fromEntity,
        depth: 0,
        score: 1.0,
        path: [fromEntity.label],
        temporalScore: 1.0,
        relationshipPath: [],
      }]
    }
  ];
  
  while (queue.length > 0) {
    const { id, path } = queue.shift()!;
    
    if (id === toEntityId) {
      return path;
    }
    
    if (path.length > maxDepth) continue;
    if (visited.has(id)) continue;
    visited.add(id);
    
    const links = getEntityLinks(id);
    for (const link of links) {
      const isSource = link.sourceEntityId === id;
      const neighborId = isSource ? link.targetEntityId : link.sourceEntityId;
      
      if (visited.has(neighborId)) continue;
      
      const neighborEntity = getEntity(neighborId);
      if (!neighborEntity) continue;
      
      const newPath = [...path, {
        entity: neighborEntity,
        depth: path.length,
        score: parseFloat(link.weight) || 0.5,
        path: [...path[path.length - 1].path, neighborEntity.label],
        temporalScore: calculateTemporalDecay(link.lastSeenAt),
        relationshipPath: [...path[path.length - 1].relationshipPath, link.relationshipType],
      }];
      
      queue.push({ id: neighborId, path: newPath });
    }
  }
  
  return null; // No path found
}

/**
 * Find all entities related to a person
 */
export function getPersonContext(contactId: string): {
  person: Entity | null;
  memories: MemoryNote[];
  tasks: Task[];
  conversations: Conversation[];
  connections: GraphNode[];
} {
  // Find person entity
  const personEntities = getEntitiesByType("person").filter(e => e.canonicalId === contactId);
  const personEntity = personEntities[0] || null;
  
  if (!personEntity) {
    return {
      person: null,
      memories: [],
      tasks: [],
      conversations: [],
      connections: [],
    };
  }
  
  // Get all references
  const references = getEntityReferences(personEntity.id);
  const memories: MemoryNote[] = [];
  const tasks: Task[] = [];
  const conversations: Conversation[] = [];
  
  for (const ref of references) {
    switch (ref.domain) {
      case "memory": {
        const memory = getMemoryNote(ref.itemId);
        if (memory) memories.push(memory);
        break;
      }
      case "task": {
        const task = getTask(ref.itemId);
        if (task) tasks.push(task);
        break;
      }
      case "conversation": {
        const conv = getConversation(ref.itemId);
        if (conv) conversations.push(conv);
        break;
      }
    }
  }
  
  // Get connected entities
  const connections = traverseGraph(personEntity.id, {
    maxDepth: 2,
    maxNodes: 20,
    excludeTypes: ["person"], // Don't include other people in primary connections
  });
  
  return {
    person: personEntity,
    memories,
    tasks,
    conversations,
    connections,
  };
}

/**
 * Find entities that frequently co-occur
 */
export function findFrequentCooccurrences(
  minOccurrences: number = 3
): Array<{
  entity1: Entity;
  entity2: Entity;
  occurrences: number;
  relationship: EntityRelationshipType;
}> {
  const allLinks = getAllEntities().flatMap(e => getEntityLinks(e.id));
  const linkCounts = new Map<string, { link: EntityLink; count: number }>();
  
  for (const link of allLinks) {
    const key = `${link.sourceEntityId}-${link.targetEntityId}`;
    const existing = linkCounts.get(key);
    if (existing) {
      existing.count++;
    } else {
      linkCounts.set(key, { link, count: 1 });
    }
  }
  
  const result: Array<{
    entity1: Entity;
    entity2: Entity;
    occurrences: number;
    relationship: EntityRelationshipType;
  }> = [];
  
  for (const [_, data] of linkCounts) {
    if (data.count >= minOccurrences) {
      const entity1 = getEntity(data.link.sourceEntityId);
      const entity2 = getEntity(data.link.targetEntityId);
      
      if (entity1 && entity2) {
        result.push({
          entity1,
          entity2,
          occurrences: data.count,
          relationship: data.link.relationshipType,
        });
      }
    }
  }
  
  result.sort((a, b) => b.occurrences - a.occurrences);
  return result;
}

// ============================================
// TEMPORAL PATTERNS
// ============================================

/**
 * Analyze temporal patterns for entities
 */
export function analyzeTemporalPatterns(
  entityType?: EntityType,
  days: number = 30
): TemporalPattern[] {
  const entities = entityType ? getEntitiesByType(entityType) : getAllEntities();
  const patterns: TemporalPattern[] = [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  
  for (const entity of entities) {
    const references = getEntityReferences(entity.id);
    const recentRefs = references.filter(r => new Date(r.extractedAt) >= cutoff);
    
    if (recentRefs.length === 0) continue;
    
    // Sort by date
    recentRefs.sort((a, b) => new Date(a.extractedAt).getTime() - new Date(b.extractedAt).getTime());
    
    const firstMention = recentRefs[0].extractedAt;
    const lastMention = recentRefs[recentRefs.length - 1].extractedAt;
    
    // Calculate trend
    const midPoint = new Date(cutoff.getTime() + (Date.now() - cutoff.getTime()) / 2);
    const earlyCount = recentRefs.filter(r => new Date(r.extractedAt) < midPoint).length;
    const lateCount = recentRefs.filter(r => new Date(r.extractedAt) >= midPoint).length;
    
    let trend: "increasing" | "decreasing" | "stable" = "stable";
    if (lateCount > earlyCount * 1.5) trend = "increasing";
    else if (earlyCount > lateCount * 1.5) trend = "decreasing";
    
    // Find peak activity (day with most mentions)
    const byDay = new Map<string, number>();
    for (const ref of recentRefs) {
      const day = new Date(ref.extractedAt).toISOString().split("T")[0];
      byDay.set(day, (byDay.get(day) || 0) + 1);
    }
    
    let peakDay = "";
    let peakCount = 0;
    for (const [day, count] of byDay) {
      if (count > peakCount) {
        peakCount = count;
        peakDay = day;
      }
    }
    
    patterns.push({
      entityId: entity.id,
      entityLabel: entity.label,
      firstMention,
      lastMention,
      mentionCount: recentRefs.length,
      peakActivity: peakDay,
      trend,
    });
  }
  
  // Sort by mention count
  patterns.sort((a, b) => b.mentionCount - a.mentionCount);
  return patterns;
}

// ============================================
// GRAPH STATISTICS
// ============================================

/**
 * Get comprehensive statistics about the knowledge graph
 */
export function getKnowledgeGraphStats(): KnowledgeGraphStats {
  const allEntities = getAllEntities();
  const entitiesByType: Record<EntityType, number> = {} as any;
  const linksByType: Record<EntityRelationshipType, number> = {} as any;
  const referencesByDomain: Record<EntityDomain, number> = {} as any;
  
  let totalLinks = 0;
  let totalReferences = 0;
  const connectionCounts = new Map<string, number>();
  
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  let lastDay = 0;
  let lastWeek = 0;
  let lastMonth = 0;
  
  for (const entity of allEntities) {
    // Count by type
    entitiesByType[entity.type] = (entitiesByType[entity.type] || 0) + 1;
    
    // Count links
    const links = getEntityLinks(entity.id);
    for (const link of links) {
      if (link.sourceEntityId === entity.id) { // Count each link once
        totalLinks++;
        linksByType[link.relationshipType] = (linksByType[link.relationshipType] || 0) + 1;
        
        const linkDate = new Date(link.lastSeenAt);
        if (linkDate >= dayAgo) lastDay++;
        if (linkDate >= weekAgo) lastWeek++;
        if (linkDate >= monthAgo) lastMonth++;
      }
    }
    connectionCounts.set(entity.id, links.length);
    
    // Count references
    const refs = getEntityReferences(entity.id);
    totalReferences += refs.length;
    for (const ref of refs) {
      referencesByDomain[ref.domain] = (referencesByDomain[ref.domain] || 0) + 1;
    }
  }
  
  // Find most connected entities
  const sortedByConnections = [...connectionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  const mostConnectedEntities = sortedByConnections
    .map(([id, count]) => ({
      entity: getEntity(id)!,
      connectionCount: count,
    }))
    .filter(e => e.entity);
  
  return {
    totalEntities: allEntities.length,
    totalLinks,
    totalReferences,
    entitiesByType,
    linksByType,
    referencesByDomain,
    mostConnectedEntities,
    recentActivity: {
      lastDay,
      lastWeek,
      lastMonth,
    },
  };
}

// ============================================
// CONTEXT BUNDLE FOR AGENTS
// ============================================

/**
 * Build a knowledge graph context bundle for agent queries
 * Provides rich, connected context for better reasoning
 */
export async function buildGraphContextBundle(
  query: string,
  maxTokens: number = 2000
): Promise<string> {
  const parts: string[] = [];
  
  try {
    const graphResult = await queryKnowledgeGraph(query, {
      maxDepth: 2,
      maxNodes: 30,
      minScore: 0.2,
    });
    
    // Add relevant entities
    if (graphResult.entities.length > 0) {
      const entityList = graphResult.entities
        .slice(0, 10)
        .map(n => {
          const path = n.relationshipPath.length > 0 
            ? ` (via: ${n.relationshipPath.join(" → ")})` 
            : "";
          return `- ${n.entity.label} [${n.entity.type}]${path}`;
        })
        .join("\n");
      parts.push(`## Relevant Entities\n${entityList}`);
    }
    
    // Add cross-domain connections
    if (graphResult.connections.length > 0) {
      const connectionList = graphResult.connections
        .slice(0, 5)
        .map(c => {
          const domains = [...new Set(c.domains.map(d => d.domain))].join(", ");
          return `- ${c.entityLabel} connects: ${domains} (${c.domains.length} references)`;
        })
        .join("\n");
      parts.push(`## Cross-Domain Connections\n${connectionList}`);
    }
    
    // Add relevant items by domain
    const itemsByDomain = new Map<EntityDomain, string[]>();
    for (const item of graphResult.relevantItems.slice(0, 15)) {
      const list = itemsByDomain.get(item.domain) || [];
      const summary = item.domain === "memory" 
        ? item.item?.content?.substring(0, 80) + "..."
        : item.domain === "task"
          ? `${item.item?.title} (${item.item?.priority}, ${item.item?.completed ? "done" : "pending"})`
          : JSON.stringify(item.item).substring(0, 80);
      list.push(`- ${summary}`);
      itemsByDomain.set(item.domain, list);
    }
    
    for (const [domain, items] of itemsByDomain) {
      if (items.length > 0) {
        parts.push(`### ${domain.charAt(0).toUpperCase() + domain.slice(1)} Items\n${items.join("\n")}`);
      }
    }
    
    // Add query context summary
    parts.push(`\n_Graph context: ${graphResult.queryContext}_`);
    
  } catch (error) {
    console.error("[KnowledgeGraph] Error building context bundle:", error);
    parts.push("## Graph Context\nUnable to retrieve graph context.");
  }
  
  const content = parts.join("\n\n");
  
  // Truncate if needed
  const maxChars = maxTokens * 4;
  if (content.length > maxChars) {
    return content.substring(0, maxChars - 20) + "\n[...truncated]";
  }
  
  return content;
}

console.log("[KnowledgeGraph] Knowledge Graph Service initialized");

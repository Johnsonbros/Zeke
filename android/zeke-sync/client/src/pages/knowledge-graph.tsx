import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  Network, 
  Users, 
  MapPin, 
  Tag,
  Search,
  Link2,
  TrendingUp,
  Activity,
  Loader2,
  ChevronRight,
  Sparkles,
  Brain,
  Calendar,
  MessageSquare,
  ListTodo,
  Mic,
  RefreshCw,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { useState, useEffect } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Entity {
  id: string;
  type: string;
  label: string;
  canonicalId: string | null;
  metadata: any;
  createdAt: string;
}

interface EntityWithConnections {
  entity: Entity;
  connectionCount: number;
}

interface GraphStats {
  totalEntities: number;
  totalLinks: number;
  totalReferences: number;
  entitiesByType: Record<string, number>;
  linksByType: Record<string, number>;
  referencesByDomain: Record<string, number>;
  mostConnectedEntities: EntityWithConnections[];
  recentActivity: {
    lastDay: number;
    lastWeek: number;
    lastMonth: number;
  };
}

interface GraphNode {
  entity: Entity;
  depth: number;
  score: number;
  path: string[];
  temporalScore?: number;
  relationshipPath?: string[];
}

interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
  weight: number;
  lastSeen: string;
}

interface EntityNeighborhood {
  center: Entity;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    avgDepth: number;
    maxDepth: number;
    typeDistribution: Record<string, number>;
  };
}

interface BackfillProgress {
  domain: string;
  total: number;
  processed: number;
  entitiesCreated: number;
  referencesCreated: number;
  errors: number;
}

interface BackfillResult {
  success: boolean;
  progress: BackfillProgress[];
  totalEntitiesCreated: number;
  totalReferencesCreated: number;
  totalErrors: number;
  durationMs: number;
}

interface BackfillStatus {
  isRunning: boolean;
  result: BackfillResult | null;
}

function getEntityIcon(type: string) {
  switch (type) {
    case "person":
      return <Users className="h-4 w-4" />;
    case "location":
      return <MapPin className="h-4 w-4" />;
    case "topic":
      return <Tag className="h-4 w-4" />;
    default:
      return <Network className="h-4 w-4" />;
  }
}

function getEntityColor(type: string) {
  switch (type) {
    case "person":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "location":
      return "bg-green-500/10 text-green-500 border-green-500/20";
    case "topic":
      return "bg-purple-500/10 text-purple-500 border-purple-500/20";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getDomainIcon(domain: string) {
  switch (domain) {
    case "memory":
      return <Brain className="h-3 w-3" />;
    case "task":
      return <ListTodo className="h-3 w-3" />;
    case "calendar":
      return <Calendar className="h-3 w-3" />;
    case "lifelog":
      return <Mic className="h-3 w-3" />;
    case "sms":
      return <MessageSquare className="h-3 w-3" />;
    default:
      return <Tag className="h-3 w-3" />;
  }
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  description 
}: { 
  title: string; 
  value: number | string; 
  icon: any;
  description?: string;
}) {
  return (
    <Card data-testid={`stat-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{title}</p>
            {description && (
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">{description}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EntityCard({ 
  entity, 
  connectionCount,
  onClick,
  isSelected
}: { 
  entity: Entity; 
  connectionCount?: number;
  onClick?: () => void;
  isSelected?: boolean;
}) {
  return (
    <Card 
      className={`cursor-pointer transition-all hover-elevate ${isSelected ? "ring-2 ring-primary" : ""}`}
      onClick={onClick}
      data-testid={`entity-card-${entity.id}`}
    >
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${getEntityColor(entity.type)}`}>
            {getEntityIcon(entity.type)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate capitalize">{entity.label}</p>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] capitalize">
                {entity.type}
              </Badge>
              {connectionCount !== undefined && (
                <span className="text-[10px] text-muted-foreground">
                  {connectionCount} connections
                </span>
              )}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

function EntityDetail({ entityId }: { entityId: string }) {
  const { data: neighborhood, isLoading } = useQuery<EntityNeighborhood>({
    queryKey: ["/api/graph/neighborhood", entityId],
    enabled: !!entityId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!neighborhood) {
    return (
      <div className="text-center text-muted-foreground py-8">
        Select an entity to view details
      </div>
    );
  }

  const { center, nodes, edges, stats } = neighborhood;
  const connectedNodes = nodes.filter(n => n.entity.id !== center.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
        <div className={`p-3 rounded-lg ${getEntityColor(center.type)}`}>
          {getEntityIcon(center.type)}
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold capitalize">{center.label}</h3>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="capitalize">{center.type}</Badge>
            <span className="text-xs text-muted-foreground">
              {stats.totalNodes} nodes, {stats.totalEdges} edges
            </span>
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Connected Entities ({connectedNodes.length})
        </h4>
        {connectedNodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No direct connections</p>
        ) : (
          <div className="space-y-2">
            {connectedNodes.slice(0, 10).map((node, idx) => (
              <div 
                key={idx} 
                className="flex items-center gap-2 p-2 bg-background rounded border"
                data-testid={`neighbor-${node.entity.id}`}
              >
                <div className={`p-1.5 rounded ${getEntityColor(node.entity.type)}`}>
                  {getEntityIcon(node.entity.type)}
                </div>
                <span className="text-sm capitalize flex-1">{node.entity.label}</span>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="text-[10px]">
                    depth {node.depth}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {Math.round(node.score * 100)}%
                  </span>
                </div>
              </div>
            ))}
            {connectedNodes.length > 10 && (
              <p className="text-xs text-muted-foreground text-center">
                +{connectedNodes.length - 10} more connections
              </p>
            )}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Relationship Paths ({edges.length})
        </h4>
        {edges.length === 0 ? (
          <p className="text-sm text-muted-foreground">No relationship paths found</p>
        ) : (
          <div className="space-y-2">
            {edges.slice(0, 8).map((edge, idx) => {
              const sourceNode = nodes.find(n => n.entity.id === edge.source);
              const targetNode = nodes.find(n => n.entity.id === edge.target);
              return (
                <div 
                  key={idx} 
                  className="flex items-center gap-2 p-2 bg-background rounded border text-xs"
                  data-testid={`edge-${idx}`}
                >
                  <span className="capitalize truncate">{sourceNode?.entity.label || "?"}</span>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {edge.relationship.replace(/_/g, " ")}
                  </Badge>
                  <span className="capitalize truncate">{targetNode?.entity.label || "?"}</span>
                </div>
              );
            })}
            {edges.length > 8 && (
              <p className="text-xs text-muted-foreground text-center">
                +{edges.length - 8} more relationships
              </p>
            )}
          </div>
        )}
      </div>

      {Object.keys(stats.typeDistribution).length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Type Distribution</h4>
          <div className="flex flex-wrap gap-1">
            {Object.entries(stats.typeDistribution).map(([type, count]) => (
              <Badge key={type} variant="outline" className={`text-[10px] ${getEntityColor(type)}`}>
                {type}: {count}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function KnowledgeGraphPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const { toast } = useToast();

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<GraphStats>({
    queryKey: ["/api/graph/stats"],
  });

  const { data: searchResults, isLoading: searchLoading } = useQuery<{ entities: Entity[] }>({
    queryKey: ["/api/graph/query", searchQuery],
    enabled: searchQuery.length >= 2,
  });

  const { data: backfillStatus, refetch: refetchBackfillStatus } = useQuery<BackfillStatus>({
    queryKey: ["/api/graph/backfill/status"],
    refetchInterval: (query) => {
      const data = query.state.data as BackfillStatus | undefined;
      return data?.isRunning ? 2000 : false;
    },
  });

  const backfillMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/graph/backfill");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Backfill Complete",
        description: `Created ${data.totalEntitiesCreated} entities and ${data.totalReferencesCreated} references`,
      });
      refetchStats();
      refetchBackfillStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/graph"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Backfill Failed",
        description: error.message,
        variant: "destructive",
      });
      refetchBackfillStatus();
    },
  });

  useEffect(() => {
    if (backfillStatus?.isRunning) {
      const interval = setInterval(() => {
        refetchBackfillStatus();
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [backfillStatus?.isRunning, refetchBackfillStatus]);

  const isBackfillRunning = backfillStatus?.isRunning || backfillMutation.isPending;
  const isEmpty = !stats || stats.totalEntities === 0;

  const filteredEntities = stats?.mostConnectedEntities?.filter(e => 
    activeTab === "all" || e.entity.type === activeTab
  ) || [];

  const entityTypes = stats ? Object.keys(stats.entitiesByType) : [];

  if (statsLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading Knowledge Graph...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Network className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-semibold">Knowledge Graph</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Explore connections across your data
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => backfillMutation.mutate()}
            disabled={isBackfillRunning}
            data-testid="button-refresh-graph"
          >
            {isBackfillRunning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                <span className="hidden sm:inline">Processing...</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Refresh Graph</span>
              </>
            )}
          </Button>
        </div>
        {isBackfillRunning && (
          <div className="mt-3 p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Extracting entities from your data...</span>
            </div>
          </div>
        )}
        {backfillStatus?.result && !isBackfillRunning && backfillStatus.result.success && (
          <div className="mt-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              <span>
                Last backfill: {backfillStatus.result.totalEntitiesCreated} entities, {backfillStatus.result.totalReferencesCreated} references 
                ({Math.round(backfillStatus.result.durationMs / 1000)}s)
              </span>
            </div>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard 
              title="Entities" 
              value={stats?.totalEntities || 0} 
              icon={Network}
              description="People, places, topics"
            />
            <StatCard 
              title="Connections" 
              value={stats?.totalLinks || 0} 
              icon={Link2}
              description="Entity relationships"
            />
            <StatCard 
              title="References" 
              value={stats?.totalReferences || 0} 
              icon={Activity}
              description="Cross-domain links"
            />
            <StatCard 
              title="This Week" 
              value={stats?.recentActivity?.lastWeek || 0} 
              icon={TrendingUp}
              description="New connections"
            />
          </div>

          {stats && Object.keys(stats.referencesByDomain).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Domain Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(stats.referencesByDomain).map(([domain, count]) => {
                  const total = stats.totalReferences;
                  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={domain} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          {getDomainIcon(domain)}
                          <span className="capitalize">{domain}</span>
                        </div>
                        <span className="text-muted-foreground">{count} ({percentage}%)</span>
                      </div>
                      <Progress value={percentage} className="h-1.5" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Explore Entities</CardTitle>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search entities..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-entity-search"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="w-full justify-start mb-3">
                    <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                    {entityTypes.map(type => (
                      <TabsTrigger key={type} value={type} className="text-xs capitalize">
                        {type} ({stats?.entitiesByType[type] || 0})
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  <ScrollArea className="h-[300px]">
                    <div className="space-y-2 pr-3">
                      {searchQuery.length >= 2 ? (
                        searchLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : searchResults?.entities?.length ? (
                          searchResults.entities.map(entity => (
                            <EntityCard
                              key={entity.id}
                              entity={entity}
                              onClick={() => setSelectedEntityId(entity.id)}
                              isSelected={selectedEntityId === entity.id}
                            />
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-8">
                            No entities found for "{searchQuery}"
                          </p>
                        )
                      ) : filteredEntities.length > 0 ? (
                        filteredEntities.map(({ entity, connectionCount }) => (
                          <EntityCard
                            key={entity.id}
                            entity={entity}
                            connectionCount={connectionCount}
                            onClick={() => setSelectedEntityId(entity.id)}
                            isSelected={selectedEntityId === entity.id}
                          />
                        ))
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8 gap-4">
                          <Network className="h-12 w-12 text-muted-foreground/30" />
                          <p className="text-sm text-muted-foreground text-center">
                            No entities found. Run a backfill to populate the graph.
                          </p>
                          <Button
                            onClick={() => backfillMutation.mutate()}
                            disabled={isBackfillRunning}
                            data-testid="button-run-backfill"
                          >
                            {isBackfillRunning ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Processing...
                              </>
                            ) : (
                              <>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Run Backfill
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </Tabs>
              </CardContent>
            </Card>

            <Card className="lg:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Entity Details</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[360px]">
                  {selectedEntityId ? (
                    <EntityDetail entityId={selectedEntityId} />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-center">
                      <Network className="h-12 w-12 text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Select an entity to explore its connections
                      </p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {stats?.mostConnectedEntities && stats.mostConnectedEntities.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Most Connected Entities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {stats.mostConnectedEntities.slice(0, 15).map(({ entity, connectionCount }) => (
                    <Badge 
                      key={entity.id}
                      variant="secondary"
                      className={`cursor-pointer hover-elevate ${getEntityColor(entity.type)}`}
                      onClick={() => setSelectedEntityId(entity.id)}
                      data-testid={`badge-entity-${entity.id}`}
                    >
                      {getEntityIcon(entity.type)}
                      <span className="ml-1 capitalize">{entity.label}</span>
                      <span className="ml-1 opacity-60">({connectionCount})</span>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

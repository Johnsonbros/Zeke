import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  Info,
} from "lucide-react";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Types matching the KG schema
interface KGEntity {
  id: string;
  entityType: string;
  canonicalKey: string;
  name: string;
  attributes: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

interface KGRelationship {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  relType: string;
  confidence: number;
  status: "ACTIVE" | "CONTESTED" | "RETRACTED";
  evidenceId: string | null;
  properties: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

interface KGEvidence {
  id: string;
  sourceType: string;
  sourceId: string;
  sourceExcerpt: string | null;
  sourceUrl: string | null;
  createdAt: string;
}

interface Neighborhood {
  center: KGEntity;
  outgoing: Array<{
    relationship: KGRelationship;
    toEntity: KGEntity;
    evidence: KGEvidence | null;
  }>;
  incoming: Array<{
    relationship: KGRelationship;
    fromEntity: KGEntity;
    evidence: KGEvidence | null;
  }>;
  stats: {
    totalOutgoing: number;
    totalIncoming: number;
    relTypeDistribution: Record<string, number>;
  };
}

interface GraphStats {
  totalEntities: number;
  totalRelationships: number;
  totalEvidence: number;
  averageConfidence: number;
  statusDistribution: Record<string, number>;
  relTypeDistribution: Record<string, number>;
}

function getEntityIcon(type: string) {
  switch (type?.toUpperCase()) {
    case "PERSON":
      return <Users className="h-4 w-4" />;
    case "PLACE":
      return <MapPin className="h-4 w-4" />;
    case "CONCEPT":
      return <Tag className="h-4 w-4" />;
    default:
      return <Network className="h-4 w-4" />;
  }
}

function getEntityColor(type: string) {
  switch (type?.toUpperCase()) {
    case "PERSON":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "PLACE":
      return "bg-green-500/10 text-green-500 border-green-500/20";
    case "CONCEPT":
      return "bg-purple-500/10 text-purple-500 border-purple-500/20";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "ACTIVE":
      return "bg-green-500/10 text-green-600 border-green-500/20";
    case "CONTESTED":
      return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
    case "RETRACTED":
      return "bg-red-500/10 text-red-600 border-red-500/20";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function EntitySearchResults({
  searchQuery,
  isLoading,
  results,
  onSelect,
  selectedId,
}: {
  searchQuery: string;
  isLoading: boolean;
  results: KGEntity[] | undefined;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  if (!searchQuery) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <p className="text-sm">Enter a search query...</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!results || results.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <p className="text-sm">No entities found</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {results.map((entity) => (
        <button
          key={entity.id}
          onClick={() => onSelect(entity.id)}
          className={`w-full text-left p-3 rounded-lg border transition-all hover-elevate ${
            selectedId === entity.id
              ? "ring-2 ring-primary border-primary"
              : "border-muted"
          }`}
          data-testid={`entity-search-result-${entity.id}`}
        >
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded ${getEntityColor(entity.entityType)}`}>
              {getEntityIcon(entity.entityType)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{entity.name}</p>
              <p className="text-xs text-muted-foreground">{entity.entityType}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </button>
      ))}
    </div>
  );
}

function RelationshipEdge({
  rel,
  entity,
  evidence,
  isIncoming,
}: {
  rel: KGRelationship;
  entity: KGEntity;
  evidence: KGEvidence | null;
  isIncoming: boolean;
}) {
  return (
    <Card className="text-sm" data-testid={`edge-${rel.id}`}>
      <CardContent className="p-3">
        <div className="space-y-2">
          {/* Edge header with confidence and status */}
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-xs uppercase text-muted-foreground">
              {rel.relType}
            </span>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                {(rel.confidence * 100).toFixed(0)}%
              </Badge>
              <Badge className={`text-[10px] ${getStatusColor(rel.status)}`}>
                {rel.status}
              </Badge>
            </div>
          </div>

          {/* Entity reference */}
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
            <div className={`p-1.5 rounded ${getEntityColor(entity.entityType)}`}>
              {getEntityIcon(entity.entityType)}
            </div>
            <span className="text-xs font-medium flex-1 truncate">{entity.name}</span>
            {isIncoming && <span className="text-[10px] text-muted-foreground">→ entity</span>}
            {!isIncoming && <span className="text-[10px] text-muted-foreground">entity →</span>}
          </div>

          {/* Last seen timestamp */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>
              {new Date(rel.lastSeenAt).toLocaleDateString()}
            </span>
          </div>

          {/* Evidence */}
          {evidence && (
            <div className="p-2 bg-muted/30 rounded border border-muted text-[11px]">
              <p className="font-medium mb-1">{evidence.sourceType}</p>
              {evidence.sourceExcerpt && (
                <p className="text-muted-foreground italic line-clamp-2">
                  "{evidence.sourceExcerpt}"
                </p>
              )}
              {evidence.sourceUrl && (
                <p className="text-[10px] text-primary truncate mt-1">
                  {evidence.sourceUrl}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">
                ID: {evidence.sourceId}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EntityDetail({
  entityId,
  minConfidence,
  status,
  depth,
}: {
  entityId: string;
  minConfidence: number;
  status: string;
  depth: number;
}) {
  const { data: neighborhood, isLoading } = useQuery<Neighborhood>({
    queryKey: ["/api/kg/neighborhood", entityId, { minConfidence, status, depth }],
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
        <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Select an entity to view details</p>
      </div>
    );
  }

  const { center, outgoing, incoming, stats } = neighborhood;

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Entity header */}
        <div className="flex items-start gap-3 pb-4 border-b">
          <div className={`p-3 rounded-lg ${getEntityColor(center.entityType)}`}>
            {getEntityIcon(center.entityType)}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold break-words">{center.name}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="secondary" className="capitalize">
                {center.entityType}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Created {new Date(center.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        {/* Attributes */}
        {Object.keys(center.attributes || {}).length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Attributes</h4>
            <div className="space-y-1 text-sm">
              {Object.entries(center.attributes || {}).map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <span className="text-muted-foreground">{key}:</span>
                  <span className="font-medium break-words">
                    {String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Outgoing relationships */}
        {outgoing.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">
              Outgoing ({outgoing.length})
            </h4>
            <div className="space-y-2">
              {outgoing.map((item) => (
                <RelationshipEdge
                  key={item.relationship.id}
                  rel={item.relationship}
                  entity={item.toEntity}
                  evidence={item.evidence}
                  isIncoming={false}
                />
              ))}
            </div>
          </div>
        )}

        {/* Incoming relationships */}
        {incoming.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">
              Incoming ({incoming.length})
            </h4>
            <div className="space-y-2">
              {incoming.map((item) => (
                <RelationshipEdge
                  key={item.relationship.id}
                  rel={item.relationship}
                  entity={item.fromEntity}
                  evidence={item.evidence}
                  isIncoming={true}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {outgoing.length === 0 && incoming.length === 0 && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <p className="text-sm">No relationships found with current filters</p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

export default function KnowledgeGraphPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [minConfidence, setMinConfidence] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [depthFilter, setDepthFilter] = useState<"1" | "2">("1");

  const { toast } = useToast();

  // Get stats
  const { data: stats, isLoading: statsLoading } = useQuery<GraphStats>({
    queryKey: ["/api/kg/stats"],
    enabled: import.meta.env.VITE_KG_ENABLED === "true",
  });

  // Search entities
  const { data: searchResults, isLoading: searchLoading } = useQuery<KGEntity[]>({
    queryKey: ["/api/kg/entities/search", searchQuery],
    enabled: searchQuery.length >= 2,
  });

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

  if (!stats) {
    return (
      <div className="h-full flex items-center justify-center">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Knowledge Graph is not enabled
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Set KG_ENABLED=true to use this feature
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Network className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-semibold">Knowledge Graph Inspector</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Explore entities, relationships, and evidence
            </p>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="border-b px-4 py-3 sm:px-6 bg-muted/30 grid grid-cols-4 gap-3">
        <div className="text-center" data-testid="stat-entities">
          <p className="text-lg font-bold">{stats.totalEntities}</p>
          <p className="text-xs text-muted-foreground">Entities</p>
        </div>
        <div className="text-center" data-testid="stat-relationships">
          <p className="text-lg font-bold">{stats.totalRelationships}</p>
          <p className="text-xs text-muted-foreground">Relationships</p>
        </div>
        <div className="text-center" data-testid="stat-evidence">
          <p className="text-lg font-bold">{stats.totalEvidence}</p>
          <p className="text-xs text-muted-foreground">Evidence</p>
        </div>
        <div className="text-center" data-testid="stat-confidence">
          <p className="text-lg font-bold">
            {(stats.averageConfidence * 100).toFixed(0)}%
          </p>
          <p className="text-xs text-muted-foreground">Avg Confidence</p>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex gap-4 p-4 sm:p-6">
        {/* Left panel: Search */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <Card className="flex-1 flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Search className="h-4 w-4" />
                Search Entities
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by entity name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-entity-search"
                />
              </div>

              <ScrollArea className="flex-1">
                <EntitySearchResults
                  searchQuery={searchQuery}
                  isLoading={searchLoading}
                  results={searchResults}
                  onSelect={setSelectedEntityId}
                  selectedId={selectedEntityId}
                />
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Right panel: Details + Filters */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* Filters */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Min Confidence Slider */}
              <div>
                <label className="text-xs font-medium">
                  Min Confidence: {(minConfidence * 100).toFixed(0)}%
                </label>
                <Slider
                  value={[minConfidence]}
                  onValueChange={(val) => setMinConfidence(val[0])}
                  min={0}
                  max={1}
                  step={0.1}
                  className="mt-2"
                  data-testid="slider-confidence"
                />
              </div>

              {/* Status Filter */}
              <div>
                <label className="text-xs font-medium mb-2 block">
                  Status Filter
                </label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger
                    className="text-xs"
                    data-testid="select-status"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="CONTESTED">Contested</SelectItem>
                    <SelectItem value="RETRACTED">Retracted</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Depth Selector */}
              <div>
                <label className="text-xs font-medium mb-2 block">
                  Traversal Depth
                </label>
                <Select value={depthFilter} onValueChange={(v) => setDepthFilter(v as "1" | "2")}>
                  <SelectTrigger
                    className="text-xs"
                    data-testid="select-depth"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Depth 1 (direct)</SelectItem>
                    <SelectItem value="2">Depth 2 (one hop)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Entity Detail */}
          <Card className="flex-1 flex flex-col overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                {selectedEntityId ? "Entity Details" : "Select an entity..."}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden">
              <EntityDetail
                entityId={selectedEntityId || ""}
                minConfidence={minConfidence}
                status={statusFilter === "all" ? "" : statusFilter}
                depth={parseInt(depthFilter)}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

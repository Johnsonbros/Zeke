import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  DollarSign,
  Zap,
  Clock,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  BarChart3,
  Server,
  Bot,
  Cpu,
  Calendar,
} from "lucide-react";
import { format, parseISO, subDays } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface AiUsageStats {
  periodStart: string;
  periodEnd: string;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostCents: number;
  averageLatencyMs: number;
  errorCount: number;
  errorRate: number;
  byModel: Record<string, {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    costCents: number;
    averageLatencyMs: number;
  }>;
  byAgent: Record<string, { calls: number; costCents: number }>;
  byEndpoint: Record<string, { calls: number; costCents: number }>;
}

interface DailyStats extends AiUsageStats {
  date: string;
}

interface AiLog {
  id: string;
  timestamp: string;
  model: string;
  endpoint: string;
  agentId?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalCostCents?: number;
  latencyMs?: number;
  status: string;
  errorMessage?: string;
}

const COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#84cc16"];

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: typeof Activity;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <Card data-testid={`stat-card-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            <p className="text-2xl sm:text-3xl font-semibold mt-1" data-testid={`stat-value-${title.toLowerCase().replace(/\s+/g, "-")}`}>
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className={`p-3 rounded-xl ${trend === "up" ? "bg-green-500/10" : trend === "down" ? "bg-red-500/10" : "bg-primary/10"}`}>
            <Icon className={`h-5 w-5 ${trend === "up" ? "text-green-500" : trend === "down" ? "text-red-500" : "text-primary"}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return tokens.toString();
}

export default function AiUsagePage() {
  const [daysRange, setDaysRange] = useState<string>("7");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selectedTab, setSelectedTab] = useState("overview");

  const { data: todayStats, isLoading: todayLoading, refetch: refetchToday } = useQuery<AiUsageStats>({
    queryKey: ["/api/ai-logs/stats/today"],
    refetchInterval: autoRefresh ? 30000 : false,
  });

  const { data: weekStats, isLoading: weekLoading } = useQuery<AiUsageStats>({
    queryKey: ["/api/ai-logs/stats/week"],
    refetchInterval: autoRefresh ? 60000 : false,
  });

  const { data: dailyStats, isLoading: dailyLoading, refetch: refetchDaily } = useQuery<DailyStats[]>({
    queryKey: ["/api/ai-logs/stats/daily", daysRange],
    queryFn: async () => {
      const response = await fetch(`/api/ai-logs/stats/daily?days=${daysRange}`);
      if (!response.ok) throw new Error("Failed to fetch daily stats");
      return response.json();
    },
    refetchInterval: autoRefresh ? 60000 : false,
  });

  const { data: recentLogs, isLoading: logsLoading } = useQuery<AiLog[]>({
    queryKey: ["/api/ai-logs"],
    queryFn: async () => {
      const response = await fetch("/api/ai-logs?limit=100");
      if (!response.ok) throw new Error("Failed to fetch logs");
      return response.json();
    },
    refetchInterval: autoRefresh ? 15000 : false,
  });

  const { data: models } = useQuery<string[]>({
    queryKey: ["/api/ai-logs/models"],
  });

  const { data: agents } = useQuery<string[]>({
    queryKey: ["/api/ai-logs/agents"],
  });

  const handleRefresh = () => {
    refetchToday();
    refetchDaily();
  };

  const isLoading = todayLoading || weekLoading || dailyLoading;

  const chartData = dailyStats?.map(day => ({
    date: format(parseISO(day.date), "MMM d"),
    cost: day.totalCostCents / 100,
    calls: day.totalCalls,
    tokens: (day.totalInputTokens + day.totalOutputTokens) / 1000,
    errors: day.errorCount,
    latency: day.averageLatencyMs,
  })) || [];

  const modelPieData = todayStats?.byModel 
    ? Object.entries(todayStats.byModel).map(([model, data]) => ({
        name: model.replace("gpt-", ""),
        value: data.costCents,
        calls: data.calls,
      }))
    : [];

  const agentPieData = todayStats?.byAgent
    ? Object.entries(todayStats.byAgent).map(([agent, data]) => ({
        name: agent || "unknown",
        value: data.costCents,
        calls: data.calls,
      }))
    : [];

  return (
    <ScrollArea className="h-full">
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold" data-testid="page-title">AI Usage Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track ZEKE's AI consumption and costs in real-time
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={daysRange} onValueChange={setDaysRange}>
              <SelectTrigger className="w-[130px]" data-testid="select-days-range">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="60">Last 60 days</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="gap-2"
              data-testid="button-auto-refresh"
            >
              <RefreshCw className={`h-4 w-4 ${autoRefresh ? "animate-spin" : ""}`} />
              {autoRefresh ? "Live" : "Auto"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-[100px]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <StatCard
              title="Cost Today"
              value={formatCost(todayStats?.totalCostCents || 0)}
              subtitle={`Week: ${formatCost(weekStats?.totalCostCents || 0)}`}
              icon={DollarSign}
            />
            <StatCard
              title="API Calls Today"
              value={todayStats?.totalCalls || 0}
              subtitle={`Week: ${weekStats?.totalCalls || 0}`}
              icon={Zap}
            />
            <StatCard
              title="Avg Latency"
              value={`${todayStats?.averageLatencyMs || 0}ms`}
              subtitle="Response time"
              icon={Clock}
            />
            <StatCard
              title="Error Rate"
              value={`${((todayStats?.errorRate || 0) * 100).toFixed(1)}%`}
              subtitle={`${todayStats?.errorCount || 0} errors today`}
              icon={AlertTriangle}
              trend={todayStats?.errorRate && todayStats.errorRate > 0.05 ? "down" : "neutral"}
            />
          </div>
        )}

        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="daily" data-testid="tab-daily">Daily History</TabsTrigger>
            <TabsTrigger value="breakdown" data-testid="tab-breakdown">Breakdown</TabsTrigger>
            <TabsTrigger value="logs" data-testid="tab-logs">Recent Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Cost Trend ({daysRange} days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                        <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" tickFormatter={(v) => `$${v}`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                          labelStyle={{ color: "hsl(var(--foreground))" }}
                          formatter={(value: number) => [`$${value.toFixed(2)}`, "Cost"]}
                        />
                        <Line type="monotone" dataKey="cost" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    API Calls ({daysRange} days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                        <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                        <Tooltip
                          contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                          labelStyle={{ color: "hsl(var(--foreground))" }}
                        />
                        <Bar dataKey="calls" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Cpu className="h-4 w-4" />
                    Cost by Model (Today)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    {modelPieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={modelPieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={2}
                            dataKey="value"
                            label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          >
                            {modelPieData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                            formatter={(value: number) => [formatCost(value), "Cost"]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                        No data for today
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    Cost by Agent (Today)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    {agentPieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={agentPieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={2}
                            dataKey="value"
                            label={({ name, percent }) => `${name.slice(0, 15)} (${(percent * 100).toFixed(0)}%)`}
                          >
                            {agentPieData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                            formatter={(value: number) => [formatCost(value), "Cost"]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                        No data for today
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="daily" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Daily Usage History
                </CardTitle>
                <CardDescription>
                  Historical AI usage breakdown by day
                </CardDescription>
              </CardHeader>
              <CardContent>
                {dailyLoading ? (
                  <div className="space-y-2">
                    {[...Array(7)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Calls</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          <TableHead className="text-right">Tokens</TableHead>
                          <TableHead className="text-right">Avg Latency</TableHead>
                          <TableHead className="text-right">Errors</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dailyStats?.slice().reverse().map((day) => (
                          <TableRow key={day.date} data-testid={`row-daily-${day.date}`}>
                            <TableCell className="font-medium">
                              {format(parseISO(day.date), "EEE, MMM d")}
                            </TableCell>
                            <TableCell className="text-right">{day.totalCalls}</TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCost(day.totalCostCents)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatTokens(day.totalInputTokens + day.totalOutputTokens)}
                            </TableCell>
                            <TableCell className="text-right">{day.averageLatencyMs}ms</TableCell>
                            <TableCell className="text-right">
                              {day.errorCount > 0 ? (
                                <Badge variant="destructive" className="text-xs">
                                  {day.errorCount}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="breakdown" className="mt-4 space-y-4">
            <Accordion type="multiple" defaultValue={["models", "agents", "endpoints"]}>
              <AccordionItem value="models">
                <AccordionTrigger className="text-base" data-testid="accordion-models">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4" />
                    Usage by Model (Today)
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Model</TableHead>
                          <TableHead className="text-right">Calls</TableHead>
                          <TableHead className="text-right">Input Tokens</TableHead>
                          <TableHead className="text-right">Output Tokens</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          <TableHead className="text-right">Avg Latency</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {todayStats?.byModel && Object.entries(todayStats.byModel).length > 0 ? (
                          Object.entries(todayStats.byModel)
                            .sort((a, b) => b[1].costCents - a[1].costCents)
                            .map(([model, data]) => (
                              <TableRow key={model} data-testid={`row-model-${model}`}>
                                <TableCell className="font-medium font-mono text-sm">{model}</TableCell>
                                <TableCell className="text-right">{data.calls}</TableCell>
                                <TableCell className="text-right">{formatTokens(data.inputTokens)}</TableCell>
                                <TableCell className="text-right">{formatTokens(data.outputTokens)}</TableCell>
                                <TableCell className="text-right font-mono">{formatCost(data.costCents)}</TableCell>
                                <TableCell className="text-right">{data.averageLatencyMs}ms</TableCell>
                              </TableRow>
                            ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground">
                              No model data for today
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="agents">
                <AccordionTrigger className="text-base" data-testid="accordion-agents">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    Usage by Agent (Today)
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Agent</TableHead>
                          <TableHead className="text-right">Calls</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {todayStats?.byAgent && Object.entries(todayStats.byAgent).length > 0 ? (
                          Object.entries(todayStats.byAgent)
                            .sort((a, b) => b[1].costCents - a[1].costCents)
                            .map(([agent, data]) => (
                              <TableRow key={agent} data-testid={`row-agent-${agent}`}>
                                <TableCell className="font-medium">{agent || "unknown"}</TableCell>
                                <TableCell className="text-right">{data.calls}</TableCell>
                                <TableCell className="text-right font-mono">{formatCost(data.costCents)}</TableCell>
                              </TableRow>
                            ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground">
                              No agent data for today
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="endpoints">
                <AccordionTrigger className="text-base" data-testid="accordion-endpoints">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4" />
                    Usage by Endpoint (Today)
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Endpoint</TableHead>
                          <TableHead className="text-right">Calls</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {todayStats?.byEndpoint && Object.entries(todayStats.byEndpoint).length > 0 ? (
                          Object.entries(todayStats.byEndpoint)
                            .sort((a, b) => b[1].costCents - a[1].costCents)
                            .map(([endpoint, data]) => (
                              <TableRow key={endpoint} data-testid={`row-endpoint-${endpoint}`}>
                                <TableCell className="font-medium font-mono text-sm">{endpoint}</TableCell>
                                <TableCell className="text-right">{data.calls}</TableCell>
                                <TableCell className="text-right font-mono">{formatCost(data.costCents)}</TableCell>
                              </TableRow>
                            ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground">
                              No endpoint data for today
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </TabsContent>

          <TabsContent value="logs" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Recent API Calls
                </CardTitle>
                <CardDescription>
                  Last 100 AI API calls with details
                </CardDescription>
              </CardHeader>
              <CardContent>
                {logsLoading ? (
                  <div className="space-y-2">
                    {[...Array(10)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Model</TableHead>
                          <TableHead>Endpoint</TableHead>
                          <TableHead>Agent</TableHead>
                          <TableHead className="text-right">Tokens</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          <TableHead className="text-right">Latency</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentLogs && recentLogs.length > 0 ? (
                          recentLogs.slice(0, 50).map((log) => (
                            <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                              <TableCell className="text-sm whitespace-nowrap">
                                {format(parseISO(log.timestamp), "HH:mm:ss")}
                              </TableCell>
                              <TableCell className="font-mono text-xs">{log.model}</TableCell>
                              <TableCell className="font-mono text-xs">{log.endpoint}</TableCell>
                              <TableCell className="text-sm">{log.agentId || "-"}</TableCell>
                              <TableCell className="text-right text-sm">
                                {formatTokens((log.inputTokens || 0) + (log.outputTokens || 0))}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {formatCost(log.totalCostCents || 0)}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {log.latencyMs ? `${log.latencyMs}ms` : "-"}
                              </TableCell>
                              <TableCell>
                                {log.status === "ok" ? (
                                  <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-500">
                                    OK
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive" className="text-xs">
                                    {log.status}
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-muted-foreground">
                              No recent logs
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}

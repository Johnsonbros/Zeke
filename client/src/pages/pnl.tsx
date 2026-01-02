import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Wallet,
  Phone,
  Mic,
  Search,
  Map,
  Bot,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
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

interface PnlSummary {
  revenue: { trading: number; other: number; total: number };
  costs: { ai: number; communication: number; voice: number; search: number; maps: number; other: number; total: number };
  netPnl: number;
  profitMargin: number;
  period: { start: string; end: string; days: number };
}

interface DailyPnl {
  id: string;
  date: string;
  tradingRevenueCents: number;
  otherRevenueCents: number;
  totalRevenueCents: number;
  aiCostCents: number;
  communicationCostCents: number;
  voiceCostCents: number;
  searchCostCents: number;
  mapsCostCents: number;
  otherCostCents: number;
  totalCostCents: number;
  netPnlCents: number;
  tradeCount: number;
  apiCallCount: number;
}

interface ApiUsageStats {
  byService: Record<string, {
    calls: number;
    unitsConsumed: number;
    costCents: number;
    averageLatencyMs?: number;
    maxLatencyMs?: number;
  }>;
  totalCostCents: number;
  totalCalls: number;
  averageLatencyMs?: number;
  slowestOperations?: Array<{
    id: string;
    serviceType: string;
    operation: string | null;
    latencyMs: number | null;
    timestamp: string;
    status: string | null;
    costCents: number;
  }>;
  period: { start: string; end: string; days: number };
}

interface ApiUsageLog {
  id: string;
  timestamp: string;
  serviceType: string;
  operation: string;
  unitsConsumed: number;
  costCents: number;
  isFreeQuota?: boolean;
  agentId: string | null;
  conversationId: string | null;
  status?: string | null;
  latencyMs?: number | null;
}

const COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#84cc16"];
const COST_COLORS: Record<string, string> = {
  ai: "#8b5cf6",
  communication: "#3b82f6",
  voice: "#10b981",
  search: "#f59e0b",
  maps: "#06b6d4",
  other: "#6b7280",
};
const SERVICE_ICONS: Record<string, typeof DollarSign> = {
  openai: Bot,
  twilio_sms: Phone,
  twilio_mms: Phone,
  twilio_voice: Phone,
  deepgram: Mic,
  elevenlabs: Mic,
  perplexity: Search,
  google_maps: Map,
};

function formatCost(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${dollars.toFixed(2)}`;
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function formatLatency(latencyMs?: number | null): string {
  if (latencyMs === null || latencyMs === undefined) return "—";
  if (latencyMs >= 1000) return `${(latencyMs / 1000).toFixed(1)}s`;
  return `${latencyMs.toFixed(0)} ms`;
}

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

export default function PnlPage() {
  const [daysRange, setDaysRange] = useState<string>("30");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selectedTab, setSelectedTab] = useState("overview");

  const { data: pnlSummary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<PnlSummary>({
    queryKey: ["/api/pnl/summary", daysRange],
    queryFn: async () => {
      const response = await fetch(`/api/pnl/summary?days=${daysRange}`);
      if (!response.ok) throw new Error("Failed to fetch P&L summary");
      return response.json();
    },
    refetchInterval: autoRefresh ? 60000 : false,
  });

  const { data: dailyPnl, isLoading: dailyLoading } = useQuery<{ data: DailyPnl[]; period: { days: number } }>({
    queryKey: ["/api/pnl/daily", daysRange],
    queryFn: async () => {
      const response = await fetch(`/api/pnl/daily?days=${daysRange}`);
      if (!response.ok) throw new Error("Failed to fetch daily P&L");
      return response.json();
    },
    refetchInterval: autoRefresh ? 60000 : false,
  });

  const { data: apiStats, isLoading: apiStatsLoading } = useQuery<ApiUsageStats>({
    queryKey: ["/api/api-usage/stats", daysRange],
    queryFn: async () => {
      const response = await fetch(`/api/api-usage/stats?days=${daysRange}`);
      if (!response.ok) throw new Error("Failed to fetch API usage stats");
      return response.json();
    },
    refetchInterval: autoRefresh ? 60000 : false,
  });

  const { data: recentLogs, isLoading: logsLoading } = useQuery<{ logs: ApiUsageLog[] }>({
    queryKey: ["/api/api-usage/logs"],
    queryFn: async () => {
      const response = await fetch("/api/api-usage/logs?limit=50");
      if (!response.ok) throw new Error("Failed to fetch API logs");
      return response.json();
    },
    refetchInterval: autoRefresh ? 30000 : false,
  });

  const handleRefresh = () => {
    refetchSummary();
  };

  const chartData = dailyPnl?.data?.map((day) => ({
    date: format(parseISO(day.date), "MMM d"),
    revenue: (day.totalRevenueCents || 0) / 100,
    costs: (day.totalCostCents || 0) / 100,
    netPnl: (day.netPnlCents || 0) / 100,
    trades: day.tradeCount || 0,
    apiCalls: day.apiCallCount || 0,
  })) || [];

  const costBreakdownData = pnlSummary ? [
    { name: "AI (OpenAI)", value: pnlSummary.costs.ai / 100, color: COST_COLORS.ai },
    { name: "Communication", value: pnlSummary.costs.communication / 100, color: COST_COLORS.communication },
    { name: "Voice (STT/TTS)", value: pnlSummary.costs.voice / 100, color: COST_COLORS.voice },
    { name: "Search", value: pnlSummary.costs.search / 100, color: COST_COLORS.search },
    { name: "Maps", value: pnlSummary.costs.maps / 100, color: COST_COLORS.maps },
    { name: "Other", value: pnlSummary.costs.other / 100, color: COST_COLORS.other },
  ].filter(item => item.value > 0) : [];

  const serviceTableData = apiStats?.byService ? Object.entries(apiStats.byService)
    .map(([service, stats]) => ({
      service,
      calls: stats.calls,
      units: stats.unitsConsumed,
      cost: stats.costCents,
      averageLatencyMs: stats.averageLatencyMs,
      maxLatencyMs: stats.maxLatencyMs,
    }))
    .sort((a, b) => b.cost - a.cost) : [];

  const latencyTableData = [...serviceTableData].sort((a, b) => (b.averageLatencyMs || 0) - (a.averageLatencyMs || 0));

  const slowOperations = apiStats?.slowestOperations ? apiStats.slowestOperations.slice(0, 10) : [];
  const averageLatencyMs = apiStats?.averageLatencyMs;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-page-title">ZEKE P&L Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track operating costs vs trading revenue
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={daysRange} onValueChange={setDaysRange}>
            <SelectTrigger className="w-32" data-testid="select-date-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant={autoRefresh ? "default" : "outline"}
            onClick={() => setAutoRefresh(!autoRefresh)}
            data-testid="button-auto-refresh"
          >
            {autoRefresh ? "Auto-Refresh On" : "Auto-Refresh Off"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryLoading ? (
          <>
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </>
        ) : (
          <>
            <StatCard
              title="Net P&L"
              value={formatCost(pnlSummary?.netPnl || 0)}
              subtitle={`${daysRange}-day period`}
              icon={(pnlSummary?.netPnl || 0) >= 0 ? TrendingUp : TrendingDown}
              trend={(pnlSummary?.netPnl || 0) >= 0 ? "up" : "down"}
            />
            <StatCard
              title="Trading Revenue"
              value={formatCost(pnlSummary?.revenue.trading || 0)}
              subtitle="From automated trades"
              icon={Wallet}
              trend="neutral"
            />
            <StatCard
              title="Total Costs"
              value={formatCost(pnlSummary?.costs.total || 0)}
              subtitle="All API and service costs"
              icon={DollarSign}
              trend="neutral"
            />
            <StatCard
              title="Profit Margin"
              value={`${(pnlSummary?.profitMargin || 0).toFixed(1)}%`}
              subtitle="Revenue coverage"
              icon={BarChart3}
              trend={(pnlSummary?.profitMargin || 0) > 0 ? "up" : "down"}
            />
          </>
        )}
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-flex">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="costs" data-testid="tab-costs">Cost Breakdown</TabsTrigger>
          <TabsTrigger value="logs" data-testid="tab-logs">Recent Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">P&L Trend</CardTitle>
                <CardDescription>Daily revenue vs costs</CardDescription>
              </CardHeader>
              <CardContent>
                {dailyLoading ? (
                  <Skeleton className="h-64" />
                ) : chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" />
                      <YAxis className="text-xs" tickFormatter={(v) => `$${v}`} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload) return null;
                          return (
                            <div className="bg-popover p-3 rounded-md border shadow-lg">
                              <p className="font-medium">{label}</p>
                              {payload.map((entry: any, index: number) => (
                                <p key={index} style={{ color: entry.color }}>
                                  {entry.name}: ${entry.value.toFixed(2)}
                                </p>
                              ))}
                            </div>
                          );
                        }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="revenue" stroke="#10b981" name="Revenue" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="costs" stroke="#ef4444" name="Costs" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="netPnl" stroke="#8b5cf6" name="Net P&L" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">
                    No data available for the selected period
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Cost Distribution</CardTitle>
                <CardDescription>By category</CardDescription>
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <Skeleton className="h-64" />
                ) : costBreakdownData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={costBreakdownData}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, value }) => `${name}: $${value.toFixed(2)}`}
                        labelLine={false}
                      >
                        {costBreakdownData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">
                    No cost data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Daily Activity</CardTitle>
              <CardDescription>Trades and API calls per day</CardDescription>
            </CardHeader>
            <CardContent>
              {dailyLoading ? (
                <Skeleton className="h-48" />
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload) return null;
                        return (
                          <div className="bg-popover p-3 rounded-md border shadow-lg">
                            <p className="font-medium">{label}</p>
                            {payload.map((entry: any, index: number) => (
                              <p key={index} style={{ color: entry.color }}>
                                {entry.name}: {entry.value}
                              </p>
                            ))}
                          </div>
                        );
                      }}
                    />
                    <Legend />
                    <Bar dataKey="trades" fill="#10b981" name="Trades" />
                    <Bar dataKey="apiCalls" fill="#3b82f6" name="API Calls" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center text-muted-foreground">
                  No activity data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="costs" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Cost by Service</CardTitle>
              <CardDescription>API usage and costs by service type</CardDescription>
            </CardHeader>
            <CardContent>
              {apiStatsLoading ? (
                <Skeleton className="h-48" />
              ) : serviceTableData.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {serviceTableData.map((row) => {
                      const Icon = SERVICE_ICONS[row.service] || Activity;
                      return (
                        <TableRow key={row.service} data-testid={`row-service-${row.service}`}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{row.service}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{formatNumber(row.calls)}</TableCell>
                          <TableCell className="text-right">{formatNumber(row.units)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCost(row.cost)}</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="font-bold bg-muted/50">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{formatNumber(apiStats?.totalCalls || 0)}</TableCell>
                      <TableCell className="text-right">-</TableCell>
                      <TableCell className="text-right">{formatCost(apiStats?.totalCostCents || 0)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  No API usage data available for the selected period
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { name: "AI (OpenAI)", cost: pnlSummary?.costs.ai || 0, icon: Bot, color: "bg-purple-500/10 text-purple-500" },
              { name: "Communication", cost: pnlSummary?.costs.communication || 0, icon: Phone, color: "bg-blue-500/10 text-blue-500" },
              { name: "Voice (STT/TTS)", cost: pnlSummary?.costs.voice || 0, icon: Mic, color: "bg-green-500/10 text-green-500" },
              { name: "Search", cost: pnlSummary?.costs.search || 0, icon: Search, color: "bg-yellow-500/10 text-yellow-500" },
              { name: "Maps", cost: pnlSummary?.costs.maps || 0, icon: Map, color: "bg-cyan-500/10 text-cyan-500" },
              { name: "Other", cost: pnlSummary?.costs.other || 0, icon: Activity, color: "bg-gray-500/10 text-gray-500" },
            ].map((category) => (
              <Card key={category.name} data-testid={`card-category-${category.name.toLowerCase().replace(/\s+/g, "-")}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${category.color}`}>
                      <category.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{category.name}</p>
                      <p className="text-xl font-bold">{formatCost(category.cost)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="logs" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent API Activity</CardTitle>
              <CardDescription>Last 50 API calls with costs</CardDescription>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <Skeleton className="h-64" />
              ) : recentLogs?.logs && recentLogs.logs.length > 0 ? (
                <div className="max-h-96 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Service</TableHead>
                        <TableHead>Operation</TableHead>
                        <TableHead className="text-right">Units</TableHead>
                        <TableHead className="text-right">Latency</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentLogs.logs.map((log) => {
                        const Icon = SERVICE_ICONS[log.serviceType] || Activity;
                        const status = log.status || "ok";
                        const statusVariant = status === "error" ? "destructive" : status === "rate_limited" ? "secondary" : "default";
                        return (
                          <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                            <TableCell className="text-muted-foreground text-sm">
                              {format(parseISO(log.timestamp), "MMM d, h:mm a")}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Icon className="h-3 w-3 text-muted-foreground" />
                                <span className="text-sm">{log.serviceType}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{log.operation}</TableCell>
                            <TableCell className="text-right text-sm">{log.unitsConsumed.toFixed(2)}</TableCell>
                            <TableCell className="text-right text-sm">{formatLatency(log.latencyMs)}</TableCell>
                            <TableCell className="text-right text-sm font-medium">
                              {log.isFreeQuota ? (
                                <Badge variant="secondary">Free</Badge>
                              ) : (
                                formatCost(log.costCents)
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusVariant}>{status.replace("_", " ")}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  No recent API activity
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Latency by Service</CardTitle>
                <CardDescription>
                  Track average and worst-case API latency for companion app traffic
                </CardDescription>
              </CardHeader>
              <CardContent>
                {apiStatsLoading ? (
                  <Skeleton className="h-48" />
                ) : latencyTableData.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Service</TableHead>
                        <TableHead className="text-right">Avg Latency</TableHead>
                        <TableHead className="text-right">Max Latency</TableHead>
                        <TableHead className="text-right">Calls</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {latencyTableData.map((row) => {
                        const Icon = SERVICE_ICONS[row.service] || Activity;
                        return (
                          <TableRow key={`latency-${row.service}`}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">{row.service}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{formatLatency(row.averageLatencyMs)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{formatLatency(row.maxLatencyMs)}</TableCell>
                            <TableCell className="text-right">{formatNumber(row.calls)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    No latency data available for the selected period
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Slowest Operations</CardTitle>
                <CardDescription>
                  Highest-latency API calls over the last {apiStats?.period.days || daysRange} days
                </CardDescription>
              </CardHeader>
              <CardContent>
                {apiStatsLoading ? (
                  <Skeleton className="h-48" />
                ) : slowOperations.length > 0 ? (
                  <div className="space-y-3">
                    {averageLatencyMs !== undefined && (
                      <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                        <div>
                          <p className="text-sm font-medium">Average latency</p>
                          <p className="text-xs text-muted-foreground">Across all services</p>
                        </div>
                        <Badge variant="secondary">{formatLatency(averageLatencyMs)}</Badge>
                      </div>
                    )}

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Service</TableHead>
                          <TableHead>Operation</TableHead>
                          <TableHead className="text-right">Latency</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {slowOperations.map((op) => {
                          const Icon = SERVICE_ICONS[op.serviceType] || Activity;
                          return (
                            <TableRow key={op.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Icon className="h-4 w-4 text-muted-foreground" />
                                  <div className="flex flex-col">
                                    <span className="font-medium">{op.serviceType}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {format(parseISO(op.timestamp), "MMM d, h:mm a")}
                                    </span>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">{op.operation || "Unknown"}</TableCell>
                              <TableCell className="text-right font-medium">{formatLatency(op.latencyMs)}</TableCell>
                              <TableCell className="text-right text-sm">
                                {op.costCents > 0 ? formatCost(op.costCents) : "Free"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    No high-latency operations recorded in this window
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

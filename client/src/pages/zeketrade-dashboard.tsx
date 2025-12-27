import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  Activity,
  Clock,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Bot,
  Target,
  Zap,
  ShieldCheck,
  LineChart,
  BarChart3,
  CheckCircle,
  XCircle,
  Play,
  AlertTriangle,
  ArrowLeft,
  History,
  Eye,
  AlertCircle,
  Timer,
  Pause,
  TrendingDown as TrendDown,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import {
  LineChart as RechartsLine,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from "recharts";

interface TradingAccount {
  status: string;
  equity: number;
  cash: number;
  buying_power: number;
  day_pnl: number;
  day_pnl_percent: number;
  positions_count: number;
  trading_mode: string;
  live_enabled: boolean;
}

interface Position {
  symbol: string;
  qty: string;
  market_value: string;
  avg_entry_price: string;
  current_price: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  side: string;
}

interface Quote {
  symbol: string;
  price: number;
  change: number;
  change_percent: number;
}

interface Order {
  id: string;
  symbol: string;
  side: string;
  notional: string;
  qty: string;
  status: string;
  created_at: string;
  filled_at?: string;
  filled_avg_price: string;
  type: string;
}

interface MarketClock {
  timestamp: string;
  is_open: boolean;
  next_open?: string;
  next_close?: string;
}

interface AgentStatus {
  conductor: { status: string; last_run?: string };
  decision: { status: string; last_decision?: string };
  risk_gate: { status: string; checks_passed?: number };
  execution: { status: string; orders_today?: number };
}

interface PendingTrade {
  symbol: string;
  action: string;
  thesis: string;
  score: number;
  expires_at: string;
  created_at: string;
}

interface PerformanceData {
  equity_curve: { date: string; equity: number }[];
  drawdown_curve: { date: string; drawdown: number }[];
  trade_results: { date: string; pnl: number; symbol: string }[];
}

interface RiskLimits {
  max_position_size: number;
  max_positions: number;
  max_daily_trades: number;
  daily_loss_limit: number;
  current_positions: number;
  trades_today: number;
  daily_pnl: number;
}

export default function ZekeTradeDashboard() {
  const { data: account, isLoading: accountLoading } = useQuery<TradingAccount>({
    queryKey: ["/api/trading/account"],
    refetchInterval: 15000,
  });

  const { data: positions, isLoading: positionsLoading } = useQuery<Position[]>({
    queryKey: ["/api/trading/positions"],
    refetchInterval: 10000,
  });

  const { data: quotes, isLoading: quotesLoading } = useQuery<Quote[]>({
    queryKey: ["/api/trading/quotes"],
    refetchInterval: 10000,
  });

  const { data: orders, isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["/api/trading/orders"],
    refetchInterval: 15000,
  });

  const { data: marketClock } = useQuery<MarketClock>({
    queryKey: ["/api/trading/clock"],
    refetchInterval: 30000,
  });

  const { data: agentStatus } = useQuery<AgentStatus>({
    queryKey: ["/api/trading/agent/status"],
    refetchInterval: 5000,
  });

  const { data: pendingTrades } = useQuery<PendingTrade[]>({
    queryKey: ["/api/trading/agent/pending-trades"],
    refetchInterval: 5000,
  });

  const { data: performanceData } = useQuery<PerformanceData>({
    queryKey: ["/api/trading/charts/performance"],
    refetchInterval: 60000,
  });

  const { data: riskLimits } = useQuery<RiskLimits>({
    queryKey: ["/api/trading/risk-limits"],
    refetchInterval: 30000,
  });

  const isPaperMode = account?.trading_mode === "paper";
  const totalUnrealizedPnL = positions?.reduce((sum, p) => sum + parseFloat(p.unrealized_pl || "0"), 0) ?? 0;
  
  const filledOrders = orders?.filter(o => o.status === "filled") ?? [];
  const pendingOrders = orders?.filter(o => ["new", "pending_new", "accepted", "partially_filled"].includes(o.status)) ?? [];

  const winningTrades = filledOrders.filter(o => parseFloat(o.filled_avg_price || "0") > 0);
  const losingTrades = filledOrders.filter(o => parseFloat(o.filled_avg_price || "0") <= 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/zeketrade">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-lg font-bold text-primary-foreground">Z</span>
              </div>
              <div>
                <h1 className="text-xl font-bold" data-testid="text-dashboard-title">ZEKETrade Dashboard</h1>
                <p className="text-xs text-muted-foreground">Full Transparency View</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={marketClock?.is_open ? "default" : "outline"} className="gap-1">
              <Clock className="h-3 w-3" />
              {marketClock?.is_open ? "Market Open" : "Closed"}
            </Badge>
            <Badge variant={isPaperMode ? "secondary" : "destructive"} className="gap-1">
              {isPaperMode ? <ShieldCheck className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {isPaperMode ? "Paper" : "LIVE"}
            </Badge>
            {marketClock?.next_open && !marketClock.is_open && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Timer className="h-3 w-3" />
                Opens {format(new Date(marketClock.next_open), "EEE h:mm a")}
              </Badge>
            )}
          </div>
        </div>
      </header>

      {/* Quick Stats Bar */}
      <div className="border-b bg-card/30">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-muted-foreground">Portfolio</p>
                <p className="text-lg font-bold" data-testid="stat-equity">
                  ${account?.equity?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "..."}
                </p>
              </div>
              <Separator orientation="vertical" className="h-8" />
              <div>
                <p className="text-xs text-muted-foreground">Day P&L</p>
                <p className={`text-lg font-bold ${(account?.day_pnl ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`} data-testid="stat-day-pnl">
                  {(account?.day_pnl ?? 0) >= 0 ? "+" : ""}${account?.day_pnl?.toFixed(2) ?? "0.00"}
                </p>
              </div>
              <Separator orientation="vertical" className="h-8" />
              <div>
                <p className="text-xs text-muted-foreground">Unrealized</p>
                <p className={`text-lg font-bold ${totalUnrealizedPnL >= 0 ? "text-green-500" : "text-red-500"}`} data-testid="stat-unrealized">
                  {totalUnrealizedPnL >= 0 ? "+" : ""}${totalUnrealizedPnL.toFixed(2)}
                </p>
              </div>
              <Separator orientation="vertical" className="h-8" />
              <div>
                <p className="text-xs text-muted-foreground">Positions</p>
                <p className="text-lg font-bold" data-testid="stat-positions">{positions?.length ?? 0}</p>
              </div>
              <Separator orientation="vertical" className="h-8" />
              <div>
                <p className="text-xs text-muted-foreground">Trades Today</p>
                <p className="text-lg font-bold" data-testid="stat-trades-today">{riskLimits?.trades_today ?? 0}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {pendingTrades && pendingTrades.length > 0 && (
                <Badge variant="default" className="gap-1 animate-pulse">
                  <Target className="h-3 w-3" />
                  {pendingTrades.length} Pending Signal{pendingTrades.length > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="live" className="space-y-6">
          <TabsList className="grid w-full max-w-2xl mx-auto grid-cols-5">
            <TabsTrigger value="live" data-testid="tab-live" className="gap-1">
              <Activity className="h-3 w-3" />
              Live
            </TabsTrigger>
            <TabsTrigger value="positions" data-testid="tab-positions" className="gap-1">
              <TrendingUp className="h-3 w-3" />
              Positions
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history" className="gap-1">
              <History className="h-3 w-3" />
              History
            </TabsTrigger>
            <TabsTrigger value="pending" data-testid="tab-pending" className="gap-1">
              <Target className="h-3 w-3" />
              Signals
            </TabsTrigger>
            <TabsTrigger value="analytics" data-testid="tab-analytics" className="gap-1">
              <BarChart3 className="h-3 w-3" />
              Analytics
            </TabsTrigger>
          </TabsList>

          {/* Live Tab - Agent Activity & Real-time View */}
          <TabsContent value="live" className="space-y-6">
            {/* Agent Status Grid */}
            <div className="grid md:grid-cols-4 gap-4">
              <Card className={agentStatus?.conductor?.status === "active" ? "border-primary/50" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Bot className="h-4 w-4 text-primary" />
                    Conductor
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <Badge variant={agentStatus?.conductor?.status === "active" ? "default" : "secondary"}>
                      {agentStatus?.conductor?.status === "active" ? <Play className="h-3 w-3 mr-1" /> : <Pause className="h-3 w-3 mr-1" />}
                      {agentStatus?.conductor?.status ?? "idle"}
                    </Badge>
                  </div>
                  {agentStatus?.conductor?.last_run && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Last: {formatDistanceToNow(new Date(agentStatus.conductor.last_run), { addSuffix: true })}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className={agentStatus?.decision?.status === "active" ? "border-blue-500/50" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Target className="h-4 w-4 text-blue-500" />
                    DecisionAgent
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant={agentStatus?.decision?.status === "active" ? "default" : "secondary"}>
                    {agentStatus?.decision?.status === "active" ? <Zap className="h-3 w-3 mr-1" /> : <Pause className="h-3 w-3 mr-1" />}
                    {agentStatus?.decision?.status ?? "idle"}
                  </Badge>
                  {agentStatus?.decision?.last_decision && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Last decision: {formatDistanceToNow(new Date(agentStatus.decision.last_decision), { addSuffix: true })}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className={agentStatus?.risk_gate?.status === "active" ? "border-green-500/50" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <ShieldCheck className="h-4 w-4 text-green-500" />
                    RiskGateAgent
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant={agentStatus?.risk_gate?.status === "active" ? "default" : "secondary"}>
                    {agentStatus?.risk_gate?.status === "active" ? <CheckCircle className="h-3 w-3 mr-1" /> : <Pause className="h-3 w-3 mr-1" />}
                    {agentStatus?.risk_gate?.status ?? "idle"}
                  </Badge>
                  {agentStatus?.risk_gate?.checks_passed !== undefined && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {agentStatus.risk_gate.checks_passed} checks passed today
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className={agentStatus?.execution?.status === "active" ? "border-yellow-500/50" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    ExecutionAgent
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant={agentStatus?.execution?.status === "active" ? "default" : "secondary"}>
                    {agentStatus?.execution?.status === "active" ? <Activity className="h-3 w-3 mr-1" /> : <Pause className="h-3 w-3 mr-1" />}
                    {agentStatus?.execution?.status ?? "idle"}
                  </Badge>
                  {agentStatus?.execution?.orders_today !== undefined && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {agentStatus.execution.orders_today} orders today
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Risk Limits Usage */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-5 w-5" />
                  Risk Limits Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Positions</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xl font-bold">{riskLimits?.current_positions ?? 0} / {riskLimits?.max_positions ?? 3}</p>
                      {(riskLimits?.current_positions ?? 0) >= (riskLimits?.max_positions ?? 3) && (
                        <Badge variant="destructive" className="text-xs">MAXED</Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Trades Today</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xl font-bold">{riskLimits?.trades_today ?? 0} / {riskLimits?.max_daily_trades ?? 5}</p>
                      {(riskLimits?.trades_today ?? 0) >= (riskLimits?.max_daily_trades ?? 5) && (
                        <Badge variant="destructive" className="text-xs">LIMIT</Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Daily P&L</p>
                    <div className="flex items-center gap-2">
                      <p className={`text-xl font-bold ${(riskLimits?.daily_pnl ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                        ${riskLimits?.daily_pnl?.toFixed(2) ?? "0.00"}
                      </p>
                      {(riskLimits?.daily_pnl ?? 0) <= (riskLimits?.daily_loss_limit ?? -25) && (
                        <Badge variant="destructive" className="text-xs">STOPPED</Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Max Trade Size</p>
                    <p className="text-xl font-bold">${riskLimits?.max_position_size ?? 25}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Watchlist with Live Prices */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Eye className="h-5 w-5" />
                    Watchlist (Live Prices)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {quotesLoading ? (
                      Array(7).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
                    ) : quotes?.map((quote) => (
                      <div key={quote.symbol} className="flex items-center justify-between py-2 border-b last:border-0">
                        <span className="font-medium">{quote.symbol}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono">${quote.price?.toFixed(2)}</span>
                          <Badge variant={quote.change >= 0 ? "default" : "destructive"} className="gap-1 min-w-16 justify-center">
                            {quote.change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            {quote.change_percent?.toFixed(2)}%
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Wallet className="h-5 w-5" />
                    Account Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Equity</span>
                      <span className="font-bold">${account?.equity?.toLocaleString() ?? "0"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cash</span>
                      <span className="font-bold">${account?.cash?.toLocaleString() ?? "0"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Buying Power</span>
                      <span className="font-bold">${account?.buying_power?.toLocaleString() ?? "0"}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Day P&L</span>
                      <span className={`font-bold ${(account?.day_pnl ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                        {(account?.day_pnl ?? 0) >= 0 ? "+" : ""}${account?.day_pnl?.toFixed(2) ?? "0.00"}
                        {account?.day_pnl_percent !== undefined && (
                          <span className="text-sm ml-1">({account.day_pnl_percent.toFixed(2)}%)</span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Unrealized P&L</span>
                      <span className={`font-bold ${totalUnrealizedPnL >= 0 ? "text-green-500" : "text-red-500"}`}>
                        {totalUnrealizedPnL >= 0 ? "+" : ""}${totalUnrealizedPnL.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Positions Tab */}
          <TabsContent value="positions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Current Positions
                </CardTitle>
                <CardDescription>
                  All active holdings with real-time pricing and Turtle stop levels
                </CardDescription>
              </CardHeader>
              <CardContent>
                {positionsLoading ? (
                  <div className="space-y-4">
                    {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
                  </div>
                ) : positions && positions.length > 0 ? (
                  <div className="space-y-4">
                    {positions.map((position) => {
                      const pnl = parseFloat(position.unrealized_pl || "0");
                      const pnlPercent = parseFloat(position.unrealized_plpc || "0") * 100;
                      const entryPrice = parseFloat(position.avg_entry_price || "0");
                      const currentPrice = parseFloat(position.current_price || "0");
                      const marketValue = parseFloat(position.market_value || "0");
                      
                      return (
                        <Card key={position.symbol} className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                                <span className="font-bold text-primary">{position.symbol.slice(0, 2)}</span>
                              </div>
                              <div>
                                <p className="font-bold text-lg">{position.symbol}</p>
                                <p className="text-sm text-muted-foreground">
                                  {position.qty} shares @ ${entryPrice.toFixed(2)} avg
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-lg">${marketValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                              <p className={`text-sm font-medium ${pnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                                {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} ({pnlPercent >= 0 ? "+" : ""}{pnlPercent.toFixed(2)}%)
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-4 gap-4 pt-3 border-t">
                            <div>
                              <p className="text-xs text-muted-foreground">Entry Price</p>
                              <p className="font-mono">${entryPrice.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Current Price</p>
                              <p className="font-mono">${currentPrice.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">2N Stop (Est.)</p>
                              <p className="font-mono text-red-500">${(entryPrice * 0.96).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Side</p>
                              <Badge variant={position.side === "long" ? "default" : "destructive"}>
                                {position.side?.toUpperCase() ?? "LONG"}
                              </Badge>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No Open Positions</p>
                    <p className="text-sm">The system is waiting for qualified trading signals</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pending Exits */}
            {positions && positions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendDown className="h-5 w-5 text-yellow-500" />
                    Exit Monitoring
                  </CardTitle>
                  <CardDescription>Positions being monitored for exit signals</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {positions.map((position) => {
                      const currentPrice = parseFloat(position.current_price || "0");
                      const entryPrice = parseFloat(position.avg_entry_price || "0");
                      const stopPrice = entryPrice * 0.96;
                      const distanceToStop = ((currentPrice - stopPrice) / currentPrice) * 100;
                      
                      return (
                        <div key={position.symbol} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{position.symbol}</span>
                            <Badge variant={distanceToStop < 2 ? "destructive" : distanceToStop < 5 ? "outline" : "secondary"}>
                              {distanceToStop < 2 ? "Near Stop" : distanceToStop < 5 ? "Caution" : "Safe"}
                            </Badge>
                          </div>
                          <div className="text-right text-sm">
                            <p className="text-muted-foreground">
                              {distanceToStop.toFixed(1)}% to 2N stop
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Trade History
                </CardTitle>
                <CardDescription>
                  Complete log of all executed trades with P&L details
                </CardDescription>
              </CardHeader>
              <CardContent>
                {ordersLoading ? (
                  <div className="space-y-2">
                    {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : orders && orders.length > 0 ? (
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-3">
                      {orders.map((order) => {
                        const filledPrice = parseFloat(order.filled_avg_price || "0");
                        return (
                          <Card key={order.id} className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                <Badge variant={order.side === "buy" ? "default" : "destructive"} className="uppercase">
                                  {order.side}
                                </Badge>
                                <div>
                                  <p className="font-bold">{order.symbol}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {order.created_at ? format(new Date(order.created_at), "MMM d, yyyy h:mm a") : "N/A"}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <Badge variant={order.status === "filled" ? "secondary" : order.status === "canceled" ? "outline" : "default"}>
                                  {order.status}
                                </Badge>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t">
                              <div>
                                <p className="text-xs text-muted-foreground">Quantity</p>
                                <p className="font-mono">{order.qty} shares</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Fill Price</p>
                                <p className="font-mono">{filledPrice > 0 ? `$${filledPrice.toFixed(2)}` : "-"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Order Type</p>
                                <p className="capitalize">{order.type ?? "market"}</p>
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No Trade History</p>
                    <p className="text-sm">Trades will appear here once executed</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pending Signals Tab */}
          <TabsContent value="pending" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Pending Trade Signals
                </CardTitle>
                <CardDescription>
                  Qualified Turtle signals awaiting execution with AI reasoning
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pendingTrades && pendingTrades.length > 0 ? (
                  <div className="space-y-4">
                    {pendingTrades.map((trade, idx) => (
                      <Card key={idx} className="p-4 border-primary/30">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <Badge variant={trade.action === "BUY" ? "default" : "destructive"} className="text-lg px-3 py-1">
                              {trade.action}
                            </Badge>
                            <div>
                              <p className="font-bold text-xl">{trade.symbol}</p>
                              <p className="text-xs text-muted-foreground">
                                Created {formatDistanceToNow(new Date(trade.created_at), { addSuffix: true })}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-primary">{trade.score?.toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground">Signal Score</p>
                          </div>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3 mb-3">
                          <p className="text-sm font-medium mb-1">AI Thesis:</p>
                          <p className="text-sm text-muted-foreground">{trade.thesis}</p>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Timer className="h-4 w-4" />
                            Expires {formatDistanceToNow(new Date(trade.expires_at), { addSuffix: true })}
                          </div>
                          <Badge variant="outline">Awaiting Execution</Badge>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No Pending Signals</p>
                    <p className="text-sm">The system is actively scanning for Turtle breakout opportunities</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Signal Criteria */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Signal Qualification Criteria</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="font-medium">Entry Signals</p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li className="flex items-center gap-2">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        S1: 20-day high breakout
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        S2: 55-day high breakout (priority)
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        Positive momentum per N
                      </li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium">Risk Checks</p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li className="flex items-center gap-2">
                        <ShieldCheck className="h-3 w-3 text-blue-500" />
                        Position limit: 3 max
                      </li>
                      <li className="flex items-center gap-2">
                        <ShieldCheck className="h-3 w-3 text-blue-500" />
                        Trade limit: 5/day
                      </li>
                      <li className="flex items-center gap-2">
                        <ShieldCheck className="h-3 w-3 text-blue-500" />
                        Daily loss limit: -$25
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            {/* Equity Curve */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LineChart className="h-5 w-5" />
                  Equity Curve
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {performanceData?.equity_curve && performanceData.equity_curve.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={performanceData.equity_curve}>
                        <defs>
                          <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                          formatter={(value: number) => [`$${value.toLocaleString()}`, 'Equity']}
                        />
                        <Area type="monotone" dataKey="equity" stroke="hsl(var(--primary))" fill="url(#equityGradient)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center bg-muted/20 rounded-md">
                      <p className="text-muted-foreground text-sm">Equity curve will appear after trades</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Drawdown Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-red-500" />
                  Drawdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  {performanceData?.drawdown_curve && performanceData.drawdown_curve.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={performanceData.drawdown_curve}>
                        <defs>
                          <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                          formatter={(value: number) => [`${value.toFixed(2)}%`, 'Drawdown']}
                        />
                        <Area type="monotone" dataKey="drawdown" stroke="hsl(var(--destructive))" fill="url(#drawdownGradient)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center bg-muted/20 rounded-md">
                      <p className="text-muted-foreground text-sm">Drawdown data will appear after trades</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Key Metrics */}
            <div className="grid md:grid-cols-4 gap-4">
              <Card className="text-center p-6">
                <p className="text-3xl font-bold">{filledOrders.length}</p>
                <p className="text-sm text-muted-foreground">Total Trades</p>
              </Card>
              <Card className="text-center p-6">
                <p className="text-3xl font-bold text-green-500">
                  {filledOrders.length > 0 ? ((winningTrades.length / filledOrders.length) * 100).toFixed(0) : 0}%
                </p>
                <p className="text-sm text-muted-foreground">Win Rate</p>
              </Card>
              <Card className="text-center p-6">
                <p className="text-3xl font-bold">${account?.equity?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "0"}</p>
                <p className="text-sm text-muted-foreground">Current Equity</p>
              </Card>
              <Card className="text-center p-6">
                <p className={`text-3xl font-bold ${(account?.day_pnl ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                  {(account?.day_pnl ?? 0) >= 0 ? "+" : ""}${account?.day_pnl?.toFixed(2) ?? "0"}
                </p>
                <p className="text-sm text-muted-foreground">Today's P&L</p>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t py-6 mt-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>ZEKETrade - Real-time autonomous trading transparency</p>
          <p className="mt-1">Paper trading mode. Not financial advice.</p>
        </div>
      </footer>
    </div>
  );
}

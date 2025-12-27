import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
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
  ExternalLink,
  Github,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
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
} from "recharts";

const TRADING_API_BASE = "http://localhost:8000";

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
  filled_avg_price: string;
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

export default function ZekeTradePage() {
  // Fetch all trading data
  const { data: account, isLoading: accountLoading, refetch: refetchAccount } = useQuery<TradingAccount>({
    queryKey: ["/api/trading/account"],
    refetchInterval: 30000,
  });

  const { data: positions, isLoading: positionsLoading } = useQuery<Position[]>({
    queryKey: ["/api/trading/positions"],
    refetchInterval: 15000,
  });

  const { data: quotes, isLoading: quotesLoading } = useQuery<Quote[]>({
    queryKey: ["/api/trading/quotes"],
    refetchInterval: 15000,
  });

  const { data: orders } = useQuery<Order[]>({
    queryKey: ["/api/trading/orders"],
    refetchInterval: 30000,
  });

  const { data: marketClock } = useQuery<MarketClock>({
    queryKey: ["/api/trading/clock"],
    refetchInterval: 60000,
  });

  const { data: agentStatus } = useQuery<AgentStatus>({
    queryKey: ["/api/trading/agent/status"],
    refetchInterval: 10000,
  });

  const { data: pendingTrades } = useQuery<PendingTrade[]>({
    queryKey: ["/api/trading/agent/pending-trades"],
    refetchInterval: 10000,
  });

  const { data: performanceData } = useQuery<PerformanceData>({
    queryKey: ["/api/trading/charts/performance"],
    refetchInterval: 60000,
  });

  const isPaperMode = account?.trading_mode === "paper";
  const totalPnL = positions?.reduce((sum, p) => sum + parseFloat(p.unrealized_pl || "0"), 0) ?? 0;

  // Calculate win rate from orders
  const filledOrders = orders?.filter(o => o.status === "filled") ?? [];
  const winningTrades = filledOrders.filter(o => parseFloat(o.filled_avg_price || "0") > 0).length;
  const winRate = filledOrders.length > 0 ? (winningTrades / filledOrders.length * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-lg font-bold text-primary-foreground">Z</span>
            </div>
            <div>
              <h1 className="text-xl font-bold" data-testid="text-zeketrade-title">ZEKETrade</h1>
              <p className="text-xs text-muted-foreground">Autonomous AI Trading</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={marketClock?.is_open ? "default" : "outline"} className="gap-1">
              <Clock className="h-3 w-3" />
              {marketClock?.is_open ? "Market Open" : "Market Closed"}
            </Badge>
            <Badge variant={isPaperMode ? "secondary" : "destructive"} className="gap-1">
              {isPaperMode ? <ShieldCheck className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {isPaperMode ? "Paper" : "LIVE"}
            </Badge>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-background via-background to-primary/5 py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              AI-Powered <span className="text-primary">Turtle Trading</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Watch ZEKE's multi-agent system execute the classic Turtle Trading strategy with modern AI enhancements. 
              Real-time transparency into every decision.
            </p>
          </div>

          {/* Key Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            <Card className="text-center">
              <CardContent className="pt-6">
                {accountLoading ? (
                  <Skeleton className="h-8 w-24 mx-auto mb-2" />
                ) : (
                  <p className="text-2xl md:text-3xl font-bold text-primary" data-testid="text-equity">
                    ${account?.equity?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "0"}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">Portfolio Value</p>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-6">
                {accountLoading ? (
                  <Skeleton className="h-8 w-24 mx-auto mb-2" />
                ) : (
                  <p className={`text-2xl md:text-3xl font-bold ${(account?.day_pnl ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`} data-testid="text-day-pnl">
                    {(account?.day_pnl ?? 0) >= 0 ? "+" : ""}${account?.day_pnl?.toFixed(2) ?? "0.00"}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">Today's P&L</p>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-6">
                <p className="text-2xl md:text-3xl font-bold" data-testid="text-positions-count">
                  {positions?.length ?? 0}
                </p>
                <p className="text-sm text-muted-foreground">Open Positions</p>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-6">
                <p className="text-2xl md:text-3xl font-bold" data-testid="text-trades-count">
                  {filledOrders.length}
                </p>
                <p className="text-sm text-muted-foreground">Trades Executed</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Main Dashboard */}
      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full max-w-lg mx-auto grid-cols-4">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="agents" data-testid="tab-agents">Agents</TabsTrigger>
            <TabsTrigger value="positions" data-testid="tab-positions">Positions</TabsTrigger>
            <TabsTrigger value="strategy" data-testid="tab-strategy">Strategy</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Equity Chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <LineChart className="h-4 w-4" />
                    Equity Curve
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-48">
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
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                          <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                          <Tooltip
                            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                            formatter={(value: number) => [`$${value.toLocaleString()}`, 'Equity']}
                          />
                          <Area type="monotone" dataKey="equity" stroke="hsl(var(--primary))" fill="url(#equityGradient)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center bg-muted/20 rounded-md">
                        <p className="text-muted-foreground text-sm">Equity data will appear after trades</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Watchlist */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="h-4 w-4" />
                    Watchlist
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {quotesLoading ? (
                      Array(5).fill(0).map((_, i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                      ))
                    ) : quotes && quotes.length > 0 ? (
                      quotes.slice(0, 7).map((quote) => (
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
                      ))
                    ) : (
                      <p className="text-muted-foreground text-sm text-center py-4">No quotes available</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Account Details */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="h-4 w-4" />
                  Account Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Equity</p>
                    <p className="text-lg font-bold">${account?.equity?.toLocaleString() ?? "0"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Cash</p>
                    <p className="text-lg font-bold">${account?.cash?.toLocaleString() ?? "0"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Buying Power</p>
                    <p className="text-lg font-bold">${account?.buying_power?.toLocaleString() ?? "0"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Unrealized P&L</p>
                    <p className={`text-lg font-bold ${totalPnL >= 0 ? "text-green-500" : "text-red-500"}`}>
                      {totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Orders */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4" />
                  Recent Orders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-48">
                  {orders && orders.length > 0 ? (
                    <div className="space-y-2">
                      {orders.slice(0, 10).map((order) => (
                        <div key={order.id} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div className="flex items-center gap-2">
                            <Badge variant={order.side === "buy" ? "default" : "destructive"} className="uppercase text-xs">
                              {order.side}
                            </Badge>
                            <span className="font-medium">{order.symbol}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <span className="text-muted-foreground">
                              {order.qty} shares @ ${parseFloat(order.filled_avg_price || "0").toFixed(2)}
                            </span>
                            <Badge variant={order.status === "filled" ? "secondary" : "outline"} className="capitalize">
                              {order.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-muted-foreground text-sm">No orders yet</p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Agents Tab */}
          <TabsContent value="agents" className="space-y-6">
            {/* Agent Status Cards */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Bot className="h-4 w-4 text-primary" />
                    Conductor
                  </CardTitle>
                  <CardDescription>Orchestrates the trading loop</CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant={agentStatus?.conductor?.status === "active" ? "default" : "secondary"} className="gap-1">
                    {agentStatus?.conductor?.status === "active" ? <Play className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                    {agentStatus?.conductor?.status ?? "idle"}
                  </Badge>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Target className="h-4 w-4 text-blue-500" />
                    DecisionAgent
                  </CardTitle>
                  <CardDescription>GPT-4o trade selection</CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant={agentStatus?.decision?.status === "active" ? "default" : "secondary"} className="gap-1">
                    {agentStatus?.decision?.status === "active" ? <Zap className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                    {agentStatus?.decision?.status ?? "idle"}
                  </Badge>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <ShieldCheck className="h-4 w-4 text-green-500" />
                    RiskGateAgent
                  </CardTitle>
                  <CardDescription>Enforces risk limits</CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant={agentStatus?.risk_gate?.status === "active" ? "default" : "secondary"} className="gap-1">
                    {agentStatus?.risk_gate?.status === "active" ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                    {agentStatus?.risk_gate?.status ?? "idle"}
                  </Badge>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    ExecutionAgent
                  </CardTitle>
                  <CardDescription>Executes approved trades</CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant={agentStatus?.execution?.status === "active" ? "default" : "secondary"} className="gap-1">
                    {agentStatus?.execution?.status === "active" ? <Activity className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                    {agentStatus?.execution?.status ?? "idle"}
                  </Badge>
                </CardContent>
              </Card>
            </div>

            {/* Pending Trades */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Pending Trade Decisions
                </CardTitle>
                <CardDescription>Trades awaiting execution or expiration</CardDescription>
              </CardHeader>
              <CardContent>
                {pendingTrades && pendingTrades.length > 0 ? (
                  <div className="space-y-4">
                    {pendingTrades.map((trade, idx) => (
                      <div key={idx} className="p-4 border rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant={trade.action === "BUY" ? "default" : "destructive"}>{trade.action}</Badge>
                            <span className="font-bold text-lg">{trade.symbol}</span>
                          </div>
                          <Badge variant="outline">Score: {trade.score?.toFixed(2)}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{trade.thesis}</p>
                        <p className="text-xs text-muted-foreground">
                          Expires {formatDistanceToNow(new Date(trade.expires_at), { addSuffix: true })}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Bot className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No pending trades</p>
                    <p className="text-sm">The system is monitoring for opportunities</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Positions Tab */}
          <TabsContent value="positions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Current Positions
                </CardTitle>
                <CardDescription>Active holdings managed by ZEKE</CardDescription>
              </CardHeader>
              <CardContent>
                {positionsLoading ? (
                  <div className="space-y-2">
                    {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : positions && positions.length > 0 ? (
                  <div className="space-y-4">
                    {positions.map((position) => {
                      const pnl = parseFloat(position.unrealized_pl || "0");
                      const pnlPercent = parseFloat(position.unrealized_plpc || "0") * 100;
                      return (
                        <div key={position.symbol} className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-lg">{position.symbol}</span>
                              <Badge variant="outline">{position.qty} shares</Badge>
                            </div>
                            <div className="text-right">
                              <p className="font-mono">${parseFloat(position.market_value).toLocaleString()}</p>
                              <p className={`text-sm ${pnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                                {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} ({pnlPercent.toFixed(2)}%)
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Entry: </span>
                              <span className="font-mono">${parseFloat(position.avg_entry_price).toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Current: </span>
                              <span className="font-mono">${parseFloat(position.current_price).toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Wallet className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No open positions</p>
                    <p className="text-sm">ZEKE is waiting for the right opportunity</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Strategy Tab */}
          <TabsContent value="strategy" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Turtle Trading Strategy
                </CardTitle>
                <CardDescription>The classic trend-following system with AI enhancements</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Badge variant="default">S1</Badge> Short-Term System
                    </h4>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <ArrowUpRight className="h-4 w-4 text-green-500" />
                        Entry: 20-day high breakout
                      </li>
                      <li className="flex items-center gap-2">
                        <ArrowDownRight className="h-4 w-4 text-red-500" />
                        Exit: 10-day low channel break
                      </li>
                      <li className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4" />
                        Stop: 2N ATR from entry
                      </li>
                    </ul>
                  </div>
                  <div className="space-y-4">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Badge variant="secondary">S2</Badge> Long-Term System
                    </h4>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <ArrowUpRight className="h-4 w-4 text-green-500" />
                        Entry: 55-day high breakout
                      </li>
                      <li className="flex items-center gap-2">
                        <ArrowDownRight className="h-4 w-4 text-red-500" />
                        Exit: 20-day low channel break
                      </li>
                      <li className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4" />
                        Stop: 2N ATR from entry
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h4 className="font-semibold mb-4">Scoring Formula</h4>
                  <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                    <code>
                      score = 3.0 × breakout_strength + 1.0 × system_bonus + 1.0 × momentum_per_N - 1.0 × correlation_penalty
                    </code>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h4 className="font-semibold mb-4">Risk Management</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-muted/30 rounded-lg">
                      <p className="text-2xl font-bold text-primary">$25</p>
                      <p className="text-xs text-muted-foreground">Max per trade</p>
                    </div>
                    <div className="text-center p-3 bg-muted/30 rounded-lg">
                      <p className="text-2xl font-bold text-primary">3</p>
                      <p className="text-xs text-muted-foreground">Max positions</p>
                    </div>
                    <div className="text-center p-3 bg-muted/30 rounded-lg">
                      <p className="text-2xl font-bold text-primary">5</p>
                      <p className="text-xs text-muted-foreground">Trades per day</p>
                    </div>
                    <div className="text-center p-3 bg-muted/30 rounded-lg">
                      <p className="text-2xl font-bold text-red-500">-$25</p>
                      <p className="text-xs text-muted-foreground">Daily loss limit</p>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h4 className="font-semibold mb-4">Watchlist</h4>
                  <div className="flex flex-wrap gap-2">
                    {["NVDA", "SPY", "META", "GOOGL", "AVGO", "GOOG", "AMZN"].map((symbol) => (
                      <Badge key={symbol} variant="outline" className="text-sm">
                        {symbol}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Multi-Agent Architecture */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Multi-Agent Architecture
                </CardTitle>
                <CardDescription>How ZEKE's trading agents work together</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-4 gap-4">
                  <div className="p-4 border rounded-lg text-center">
                    <Bot className="h-8 w-8 mx-auto mb-2 text-primary" />
                    <h5 className="font-semibold">Conductor</h5>
                    <p className="text-xs text-muted-foreground mt-1">
                      Orchestrates the trading loop, manages agent coordination
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg text-center">
                    <Target className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                    <h5 className="font-semibold">DecisionAgent</h5>
                    <p className="text-xs text-muted-foreground mt-1">
                      GPT-4o selects from scored Turtle signals
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg text-center">
                    <ShieldCheck className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <h5 className="font-semibold">RiskGateAgent</h5>
                    <p className="text-xs text-muted-foreground mt-1">
                      Enforces position limits and risk controls
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg text-center">
                    <Zap className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
                    <h5 className="font-semibold">ExecutionAgent</h5>
                    <p className="text-xs text-muted-foreground mt-1">
                      Executes approved trades via Alpaca
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t bg-card/50 py-8 mt-12">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            ZEKETrade is an experimental AI trading system. Past performance does not guarantee future results.
          </p>
          <p className="text-xs text-muted-foreground">
            Built with ZEKE - Your Personal AI That Actually Acts
          </p>
        </div>
      </footer>
    </div>
  );
}

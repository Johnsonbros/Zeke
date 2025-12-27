import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  BarChart3,
  Activity,
  AlertTriangle,
  ShieldCheck,
  Clock,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  LineChart,
  Banknote,
  Target,
  Zap,
  Play,
  CheckCircle,
  XCircle,
  Bot,
  PieChart,
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
  BarChart,
  Bar,
  PieChart as RechartsPie,
  Pie,
  Cell,
  AreaChart,
  Area,
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
  filled_avg_price: string;
}

interface RiskLimits {
  max_dollars_per_trade: number;
  max_open_positions: number;
  max_trades_per_day: number;
  max_daily_loss: number;
  allowed_symbols: string[];
  trades_today: number;
  daily_pnl: number;
}

interface MarketClock {
  timestamp: string;
  is_open: boolean;
  next_open?: string;
  next_close?: string;
}

interface NewsItem {
  id: number;
  headline: string;
  summary: string;
  author: string;
  source: string;
  url: string;
  symbols: string[];
  created_at: string;
}

interface TradeResult {
  success: boolean;
  order_id?: string;
  error?: string;
  mode: string;
}

interface AgentStatus {
  mode: string;
  autonomy: string;
  allowed_symbols: string[];
  risk_limits: {
    max_per_trade: number;
    max_positions: number;
    max_trades_day: number;
    max_daily_loss: number;
  };
  can_execute: boolean;
}

interface PendingTrade {
  id: string;
  trade_intent: {
    symbol: string;
    side: string;
    notional_usd: number;
    reason: string;
    confidence: number;
    stop_price: number;
    exit_trigger: number;
  };
  status: string;
  created_at: string;
  expires_at: string;
}

interface LoopResult {
  loop_id: string;
  timestamp: string;
  signals_count: number;
  decision: any;
  risk_allowed: boolean;
  order_status: string;
  pending_trade_id: string | null;
  duration_ms: number;
  errors: string[];
}

interface ChartDataPoint {
  timestamp: string;
  value: number;
  label?: string;
}

interface PerformanceCharts {
  equity_curve: ChartDataPoint[];
  daily_pnl: ChartDataPoint[];
  trade_distribution: { symbol: string; count: number; fill: string }[];
  signal_confidence: ChartDataPoint[];
  win_loss: { wins: number; losses: number };
  drawdown: ChartDataPoint[];
}

export default function TradingPage() {
  const { toast } = useToast();
  const [selectedSymbol, setSelectedSymbol] = useState("SPY");
  const [tradeAmount, setTradeAmount] = useState("10");
  const [tradeSide, setTradeSide] = useState<"buy" | "sell">("buy");

  const { data: account, isLoading: accountLoading, refetch: refetchAccount } = useQuery<TradingAccount>({
    queryKey: ["/api/trading/account"],
    refetchInterval: 30000,
  });

  const { data: positions, isLoading: positionsLoading, refetch: refetchPositions } = useQuery<Position[]>({
    queryKey: ["/api/trading/positions"],
    refetchInterval: 30000,
  });

  const { data: quotes, isLoading: quotesLoading, refetch: refetchQuotes } = useQuery<Quote[]>({
    queryKey: ["/api/trading/quotes"],
    refetchInterval: 15000,
  });

  const { data: orders, isLoading: ordersLoading, refetch: refetchOrders } = useQuery<Order[]>({
    queryKey: ["/api/trading/orders"],
    refetchInterval: 30000,
  });

  const { data: riskLimits } = useQuery<RiskLimits>({
    queryKey: ["/api/trading/risk-limits"],
  });

  const { data: marketClock } = useQuery<MarketClock>({
    queryKey: ["/api/trading/clock"],
    refetchInterval: 60000,
  });

  const { data: marketNews } = useQuery<NewsItem[]>({
    queryKey: ["/api/trading/news"],
    refetchInterval: 300000,
  });

  const { data: agentStatus } = useQuery<AgentStatus>({
    queryKey: ["/api/trading/agent/status"],
    refetchInterval: 30000,
  });

  const { data: pendingTrades, refetch: refetchPendingTrades } = useQuery<PendingTrade[]>({
    queryKey: ["/api/trading/agent/pending-trades"],
    refetchInterval: 10000,
  });

  const { data: performanceCharts, isLoading: chartsLoading } = useQuery<PerformanceCharts>({
    queryKey: ["/api/trading/charts/performance"],
    refetchInterval: 60000,
  });

  const runLoopMutation = useMutation<LoopResult, Error>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/trading/agent/run-loop", {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Analysis Complete",
        description: `Found ${data.signals_count} signals. ${data.pending_trade_id ? "Trade pending approval." : "No trade recommended."}`,
      });
      refetchPendingTrades();
      queryClient.invalidateQueries({ queryKey: ["/api/trading/agent/status"] });
    },
    onError: (error) => {
      toast({
        title: "Analysis Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const approveTradeMutation = useMutation<any, Error, string>({
    mutationFn: async (tradeId) => {
      const res = await apiRequest("POST", `/api/trading/agent/approve-trade/${tradeId}`, {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.executed ? "Trade Executed" : "Approval Failed",
        description: data.message,
        variant: data.executed ? "default" : "destructive",
      });
      refetchPendingTrades();
      queryClient.invalidateQueries({ queryKey: ["/api/trading/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trading/positions"] });
    },
  });

  const rejectTradeMutation = useMutation<any, Error, string>({
    mutationFn: async (tradeId) => {
      const res = await apiRequest("POST", `/api/trading/agent/reject-trade/${tradeId}`, { reason: "User rejected" });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Trade Rejected",
        description: "The pending trade has been rejected.",
      });
      refetchPendingTrades();
    },
  });

  const placeTradeMutation = useMutation<TradeResult, Error, { symbol: string; side: string; notional: number }>({
    mutationFn: async (trade) => {
      const res = await apiRequest("POST", "/api/trading/order", trade);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Order Placed",
          description: `${tradeSide.toUpperCase()} order for $${tradeAmount} of ${selectedSymbol} submitted`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/trading/orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/trading/positions"] });
        queryClient.invalidateQueries({ queryKey: ["/api/trading/account"] });
      } else {
        toast({
          title: "Order Failed",
          description: data.error || "Unknown error",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Order Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleTrade = () => {
    const amount = parseFloat(tradeAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid dollar amount",
        variant: "destructive",
      });
      return;
    }
    placeTradeMutation.mutate({
      symbol: selectedSymbol,
      side: tradeSide,
      notional: amount,
    });
  };

  const refreshAll = () => {
    refetchAccount();
    refetchPositions();
    refetchQuotes();
    refetchOrders();
  };

  const isPaperMode = account?.trading_mode === "paper";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 p-3 md:p-6 border-b">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg md:text-2xl font-bold" data-testid="text-trading-title">Trading</h1>
            <Badge variant={marketClock?.is_open ? "default" : "outline"} className="gap-1 text-xs">
              <Clock className="h-3 w-3" />
              <span className="hidden sm:inline">{marketClock?.is_open ? "Market Open" : `Opens ${marketClock?.next_open ? format(new Date(marketClock.next_open), "EEE h:mm a") : "Mon"}`}</span>
              <span className="sm:hidden">{marketClock?.is_open ? "Open" : format(new Date(marketClock?.next_open ?? ""), "EEE")}</span>
            </Badge>
            <Badge variant={isPaperMode ? "secondary" : "destructive"} className="gap-1 text-xs">
              {isPaperMode ? <ShieldCheck className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              <span className="hidden sm:inline">{isPaperMode ? "Paper Trading" : "LIVE Trading"}</span>
              <span className="sm:hidden">{isPaperMode ? "Paper" : "LIVE"}</span>
            </Badge>
          </div>
          <p className="text-xs md:text-sm text-muted-foreground hidden md:block">
            Trade stocks with ZEKE's intelligent assistance
          </p>
        </div>
        <Button size="icon" variant="ghost" onClick={refreshAll} data-testid="button-refresh-trading">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 md:p-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
            <Card>
              <CardContent className="p-3 md:pt-4 md:px-6">
                <div className="flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
                  <span className="text-xs md:text-sm text-muted-foreground">Equity</span>
                </div>
                {accountLoading ? (
                  <Skeleton className="h-6 w-20 mt-1" />
                ) : (
                  <p className="text-base md:text-xl font-bold mt-1" data-testid="text-equity">
                    ${account?.equity?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "0"}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 md:pt-4 md:px-6">
                <div className="flex items-center gap-1.5">
                  <Banknote className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
                  <span className="text-xs md:text-sm text-muted-foreground">Cash</span>
                </div>
                {accountLoading ? (
                  <Skeleton className="h-6 w-20 mt-1" />
                ) : (
                  <p className="text-base md:text-xl font-bold mt-1" data-testid="text-cash">
                    ${account?.cash?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "0"}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 md:pt-4 md:px-6">
                <div className="flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
                  <span className="text-xs md:text-sm text-muted-foreground">Buying Power</span>
                </div>
                {accountLoading ? (
                  <Skeleton className="h-6 w-20 mt-1" />
                ) : (
                  <p className="text-base md:text-xl font-bold mt-1" data-testid="text-buying-power">
                    ${account?.buying_power?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "0"}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 md:pt-4 md:px-6">
                <div className="flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
                  <span className="text-xs md:text-sm text-muted-foreground">Day P&L</span>
                </div>
                {accountLoading ? (
                  <Skeleton className="h-6 w-20 mt-1" />
                ) : (
                  <p className={`text-base md:text-xl font-bold mt-1 ${(account?.day_pnl ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`} data-testid="text-day-pnl">
                    {(account?.day_pnl ?? 0) >= 0 ? "+" : ""}${account?.day_pnl?.toFixed(2) ?? "0.00"}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Card className="md:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="h-4 w-4" />
                  Quick Trade
                </CardTitle>
                <CardDescription>Place a trade with risk controls</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Symbol</Label>
                  <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
                    <SelectTrigger data-testid="select-symbol">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {riskLimits?.allowed_symbols?.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      )) ?? (
                        <>
                          <SelectItem value="SPY">SPY</SelectItem>
                          <SelectItem value="NVDA">NVDA</SelectItem>
                          <SelectItem value="META">META</SelectItem>
                          <SelectItem value="GOOGL">GOOGL</SelectItem>
                          <SelectItem value="AMZN">AMZN</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Amount (USD)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      value={tradeAmount}
                      onChange={(e) => setTradeAmount(e.target.value)}
                      className="pl-9"
                      placeholder="10.00"
                      max={riskLimits?.max_dollars_per_trade ?? 25}
                      data-testid="input-trade-amount"
                    />
                  </div>
                  {riskLimits && (
                    <p className="text-xs text-muted-foreground">
                      Max: ${riskLimits.max_dollars_per_trade} per trade
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={tradeSide === "buy" ? "default" : "outline"}
                    className={tradeSide === "buy" ? "bg-green-600 hover:bg-green-700" : ""}
                    onClick={() => setTradeSide("buy")}
                    data-testid="button-side-buy"
                  >
                    <ArrowUpRight className="h-4 w-4 mr-1" />
                    Buy
                  </Button>
                  <Button
                    variant={tradeSide === "sell" ? "default" : "outline"}
                    className={tradeSide === "sell" ? "bg-red-600 hover:bg-red-700" : ""}
                    onClick={() => setTradeSide("sell")}
                    data-testid="button-side-sell"
                  >
                    <ArrowDownRight className="h-4 w-4 mr-1" />
                    Sell
                  </Button>
                </div>

                <Button
                  className="w-full"
                  onClick={handleTrade}
                  disabled={placeTradeMutation.isPending}
                  data-testid="button-place-trade"
                >
                  {placeTradeMutation.isPending ? "Placing Order..." : `Place ${tradeSide.toUpperCase()} Order`}
                </Button>

                {riskLimits && (
                  <div className="pt-2 border-t space-y-1">
                    <p className="text-xs text-muted-foreground flex justify-between">
                      <span>Trades today:</span>
                      <span>{riskLimits.trades_today} / {riskLimits.max_trades_per_day}</span>
                    </p>
                    <p className="text-xs text-muted-foreground flex justify-between">
                      <span>Daily P&L limit:</span>
                      <span className={riskLimits.daily_pnl < 0 ? "text-red-400" : ""}>
                        ${riskLimits.daily_pnl?.toFixed(2)} / -${riskLimits.max_daily_loss}
                      </span>
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <LineChart className="h-4 w-4" />
                  Market Watch
                </CardTitle>
                <CardDescription>Real-time prices for allowed symbols</CardDescription>
              </CardHeader>
              <CardContent>
                {quotesLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : quotes && quotes.length > 0 ? (
                  <div className="space-y-2">
                    {quotes.map((quote) => (
                      <div
                        key={quote.symbol}
                        className="flex items-center justify-between p-3 rounded-md bg-muted/50 hover-elevate cursor-pointer"
                        onClick={() => setSelectedSymbol(quote.symbol)}
                        data-testid={`quote-${quote.symbol}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-md bg-background flex items-center justify-center font-bold text-sm">
                            {quote.symbol.slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-medium">{quote.symbol}</p>
                            <p className="text-xs text-muted-foreground">
                              {selectedSymbol === quote.symbol ? "Selected" : "Click to select"}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">${quote.price?.toFixed(2) ?? "—"}</p>
                          <p className={`text-xs flex items-center gap-1 ${(quote.change ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {(quote.change ?? 0) >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {(quote.change ?? 0) >= 0 ? "+" : ""}{quote.change_percent?.toFixed(2) ?? "0.00"}%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Market data unavailable</p>
                    <p className="text-xs">Markets may be closed</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="analytics" className="w-full">
            <TabsList className="w-full flex flex-wrap gap-1 h-auto p-1">
              <TabsTrigger value="analytics" className="flex-1 min-w-fit text-xs md:text-sm" data-testid="tab-analytics">
                <BarChart3 className="h-3 w-3 mr-1" />
                <span className="hidden sm:inline">Analytics</span>
                <span className="sm:hidden">Charts</span>
              </TabsTrigger>
              <TabsTrigger value="positions" className="flex-1 min-w-fit text-xs md:text-sm" data-testid="tab-positions">
                <span className="hidden sm:inline">Positions</span>
                <span className="sm:hidden">Pos</span>
                <span className="ml-1">({positions?.length ?? 0})</span>
              </TabsTrigger>
              <TabsTrigger value="orders" className="flex-1 min-w-fit text-xs md:text-sm" data-testid="tab-orders">
                <span className="hidden sm:inline">Orders</span>
                <span className="sm:hidden">Ord</span>
                <span className="ml-1">({orders?.length ?? 0})</span>
              </TabsTrigger>
              <TabsTrigger value="news" className="flex-1 min-w-fit text-xs md:text-sm" data-testid="tab-news">
                News
              </TabsTrigger>
              <TabsTrigger value="agent" className="flex-1 min-w-fit text-xs md:text-sm" data-testid="tab-agent">
                Agent {pendingTrades && pendingTrades.length > 0 && `(${pendingTrades.length})`}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="analytics" className="mt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm md:text-base">
                      <TrendingUp className="h-4 w-4" />
                      Equity Curve
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 md:p-6 pt-0">
                    {chartsLoading ? (
                      <Skeleton className="h-32 md:h-48 w-full" />
                    ) : performanceCharts?.equity_curve && performanceCharts.equity_curve.length > 0 ? (
                      <ResponsiveContainer width="100%" height={150}>
                        <AreaChart data={performanceCharts.equity_curve.map(d => ({ 
                          time: d.timestamp.slice(5, 16), 
                          equity: d.value 
                        }))}>
                          <defs>
                            <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="time" tick={{ fontSize: 9 }} className="text-muted-foreground" />
                          <YAxis tick={{ fontSize: 9 }} domain={['auto', 'auto']} className="text-muted-foreground" width={45} />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))', 
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '6px'
                            }}
                            formatter={(value: number) => [`$${value.toLocaleString()}`, 'Equity']}
                          />
                          <Area type="monotone" dataKey="equity" stroke="hsl(var(--primary))" fill="url(#equityGradient)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-32 md:h-48 flex items-center justify-center text-muted-foreground bg-muted/30 rounded-md">
                        <div className="text-center p-4">
                          <LineChart className="h-6 w-6 md:h-8 md:w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-xs md:text-sm">No equity data yet</p>
                          <p className="text-xs text-muted-foreground mt-1">Run trading loop to generate data</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm md:text-base">
                      <Activity className="h-4 w-4" />
                      Drawdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 md:p-6 pt-0">
                    {chartsLoading ? (
                      <Skeleton className="h-32 md:h-48 w-full" />
                    ) : performanceCharts?.drawdown && performanceCharts.drawdown.length > 0 ? (
                      <ResponsiveContainer width="100%" height={150}>
                        <AreaChart data={performanceCharts.drawdown.map(d => ({ 
                          time: d.timestamp.slice(5, 16), 
                          dd: d.value 
                        }))}>
                          <defs>
                            <linearGradient id="ddGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="time" tick={{ fontSize: 9 }} className="text-muted-foreground" />
                          <YAxis tick={{ fontSize: 9 }} domain={[0, 'auto']} className="text-muted-foreground" width={35} />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))', 
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '6px'
                            }}
                            formatter={(value: number) => [`${value.toFixed(2)}%`, 'Drawdown']}
                          />
                          <Area type="monotone" dataKey="dd" stroke="hsl(var(--destructive))" fill="url(#ddGradient)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-32 md:h-48 flex items-center justify-center text-muted-foreground bg-muted/30 rounded-md">
                        <div className="text-center p-4">
                          <TrendingDown className="h-6 w-6 md:h-8 md:w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-xs md:text-sm">No drawdown data yet</p>
                          <p className="text-xs text-muted-foreground mt-1">Tracks peak-to-trough declines</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm md:text-base">
                      <DollarSign className="h-4 w-4" />
                      P&L by Trade
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 md:p-6 pt-0">
                    {chartsLoading ? (
                      <Skeleton className="h-28 md:h-40 w-full" />
                    ) : performanceCharts?.daily_pnl && performanceCharts.daily_pnl.length > 0 ? (
                      <ResponsiveContainer width="100%" height={120}>
                        <BarChart data={performanceCharts.daily_pnl.map((d, i) => ({ 
                          idx: i + 1, 
                          pnl: d.value,
                          symbol: d.label
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="idx" tick={{ fontSize: 9 }} className="text-muted-foreground" />
                          <YAxis tick={{ fontSize: 9 }} className="text-muted-foreground" width={35} />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))', 
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '6px'
                            }}
                            formatter={(value: number, name: string, props: any) => [
                              `$${value.toFixed(2)}`, 
                              props.payload.symbol || 'P&L'
                            ]}
                          />
                          <Bar 
                            dataKey="pnl" 
                            fill="hsl(var(--primary))"
                            radius={[2, 2, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-28 md:h-40 flex items-center justify-center text-muted-foreground bg-muted/30 rounded-md">
                        <div className="text-center p-4">
                          <BarChart3 className="h-6 w-6 mx-auto mb-2 opacity-50" />
                          <p className="text-xs md:text-sm">No P&L data yet</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm md:text-base">
                      <PieChart className="h-4 w-4" />
                      Trades by Symbol
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 md:p-6 pt-0">
                    {chartsLoading ? (
                      <Skeleton className="h-28 md:h-40 w-full" />
                    ) : performanceCharts?.trade_distribution && performanceCharts.trade_distribution.length > 0 ? (
                      <ResponsiveContainer width="100%" height={120}>
                        <RechartsPie>
                          <Pie
                            data={performanceCharts.trade_distribution}
                            dataKey="count"
                            nameKey="symbol"
                            cx="50%"
                            cy="50%"
                            outerRadius={45}
                            label={({ symbol, percent }) => `${symbol} ${(percent * 100).toFixed(0)}%`}
                            labelLine={false}
                          >
                            {performanceCharts.trade_distribution.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))', 
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '6px'
                            }}
                          />
                        </RechartsPie>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-28 md:h-40 flex items-center justify-center text-muted-foreground bg-muted/30 rounded-md">
                        <div className="text-center p-4">
                          <PieChart className="h-6 w-6 mx-auto mb-2 opacity-50" />
                          <p className="text-xs md:text-sm">No trade data yet</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="sm:col-span-2 md:col-span-1">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm md:text-base">
                      <Target className="h-4 w-4" />
                      Win/Loss Ratio
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 md:p-6 pt-0">
                    {chartsLoading ? (
                      <Skeleton className="h-28 md:h-40 w-full" />
                    ) : performanceCharts?.win_loss && (performanceCharts.win_loss.wins > 0 || performanceCharts.win_loss.losses > 0) ? (
                      <div className="h-28 md:h-40 flex flex-col items-center justify-center">
                        <div className="flex items-center gap-4 mb-3">
                          <div className="text-center">
                            <p className="text-xl md:text-2xl font-bold text-green-500">{performanceCharts.win_loss.wins}</p>
                            <p className="text-xs text-muted-foreground">Wins</p>
                          </div>
                          <div className="text-xl md:text-2xl text-muted-foreground">/</div>
                          <div className="text-center">
                            <p className="text-xl md:text-2xl font-bold text-red-500">{performanceCharts.win_loss.losses}</p>
                            <p className="text-xs text-muted-foreground">Losses</p>
                          </div>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                          <div 
                            className="h-full bg-green-500 transition-all"
                            style={{ 
                              width: `${(performanceCharts.win_loss.wins / (performanceCharts.win_loss.wins + performanceCharts.win_loss.losses)) * 100}%` 
                            }}
                          />
                        </div>
                        <p className="text-xs md:text-sm text-muted-foreground mt-2">
                          {((performanceCharts.win_loss.wins / (performanceCharts.win_loss.wins + performanceCharts.win_loss.losses)) * 100).toFixed(0)}% Win Rate
                        </p>
                      </div>
                    ) : (
                      <div className="h-28 md:h-40 flex items-center justify-center text-muted-foreground bg-muted/30 rounded-md">
                        <div className="text-center p-4">
                          <Target className="h-6 w-6 mx-auto mb-2 opacity-50" />
                          <p className="text-xs md:text-sm">No win/loss data yet</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm md:text-base">
                    <Zap className="h-4 w-4" />
                    Signal Confidence History
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 md:p-6 pt-0">
                  {chartsLoading ? (
                    <Skeleton className="h-24 md:h-32 w-full" />
                  ) : performanceCharts?.signal_confidence && performanceCharts.signal_confidence.length > 0 ? (
                    <ResponsiveContainer width="100%" height={100}>
                      <RechartsLine data={performanceCharts.signal_confidence.map((d, i) => ({ 
                        idx: i + 1, 
                        score: d.value,
                        symbol: d.label 
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="idx" tick={{ fontSize: 9 }} className="text-muted-foreground" />
                        <YAxis tick={{ fontSize: 9 }} domain={[0, 1]} className="text-muted-foreground" width={30} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '6px'
                          }}
                          formatter={(value: number, name: string, props: any) => [
                            `${(value * 100).toFixed(0)}%`, 
                            props.payload.symbol || 'Confidence'
                          ]}
                        />
                        <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2 }} />
                      </RechartsLine>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-24 md:h-32 flex items-center justify-center text-muted-foreground bg-muted/30 rounded-md">
                      <div className="text-center p-4">
                        <Zap className="h-6 w-6 mx-auto mb-2 opacity-50" />
                        <p className="text-xs md:text-sm">No signal confidence data yet</p>
                        <p className="text-xs text-muted-foreground mt-1">Tracks AI decision confidence</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm md:text-base">
                    <Bot className="h-4 w-4" />
                    Turtle Strategy Config
                  </CardTitle>
                  <CardDescription className="text-xs md:text-sm">
                    Deterministic Turtle trading rules
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-3 md:p-6 pt-0">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
                    <div className="text-center p-2 md:p-3 rounded-md bg-muted/30">
                      <p className="text-xs text-muted-foreground">Entry</p>
                      <div className="mt-1 flex flex-col gap-1">
                        <Badge variant="outline" className="text-xs">S1: 20d</Badge>
                        <Badge variant="outline" className="text-xs">S2: 55d</Badge>
                      </div>
                    </div>
                    <div className="text-center p-2 md:p-3 rounded-md bg-muted/30">
                      <p className="text-xs text-muted-foreground">Exit</p>
                      <div className="mt-1 flex flex-col gap-1">
                        <Badge variant="outline" className="text-xs">S1: 10d</Badge>
                        <Badge variant="outline" className="text-xs">S2: 20d</Badge>
                      </div>
                    </div>
                    <div className="text-center p-2 md:p-3 rounded-md bg-muted/30">
                      <p className="text-xs text-muted-foreground">Hard Stop</p>
                      <p className="text-base md:text-lg font-bold mt-1">2N</p>
                      <p className="text-xs text-muted-foreground">from entry</p>
                    </div>
                    <div className="text-center p-2 md:p-3 rounded-md bg-muted/30">
                      <p className="text-xs text-muted-foreground">Pyramiding</p>
                      <p className="text-base md:text-lg font-bold mt-1 text-destructive">Off</p>
                      <p className="text-xs text-muted-foreground">MVP rule</p>
                    </div>
                  </div>
                  <div className="mt-3 md:mt-4 p-2 md:p-3 rounded-md border">
                    <p className="text-xs md:text-sm font-medium mb-2">Scoring Formula</p>
                    <code className="text-xs bg-muted p-1.5 md:p-2 rounded block overflow-x-auto whitespace-nowrap">
                      3.0*breakout + 1.0*S2_bonus + 1.0*momentum/N - 1.0*correlation
                    </code>
                    <div className="grid grid-cols-4 gap-1 md:gap-2 mt-2 md:mt-3 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Breakout</p>
                        <p className="text-sm md:text-base font-bold">3.0x</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">S2</p>
                        <p className="text-sm md:text-base font-bold">1.0x</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Momentum</p>
                        <p className="text-sm md:text-base font-bold">1.0x</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Corr</p>
                        <p className="text-sm md:text-base font-bold text-destructive">-1.0x</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="positions" className="mt-4">
              <Card>
                <CardContent className="pt-4">
                  {positionsLoading ? (
                    <div className="space-y-3">
                      {[1, 2].map((i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : positions && positions.length > 0 ? (
                    <div className="space-y-3">
                      {positions.map((pos) => (
                        <div
                          key={pos.symbol}
                          className="flex items-center justify-between p-4 rounded-md border"
                          data-testid={`position-${pos.symbol}`}
                        >
                          <div>
                            <p className="font-bold text-lg">{pos.symbol}</p>
                            <p className="text-sm text-muted-foreground">
                              {parseFloat(pos.qty).toFixed(4)} shares @ ${parseFloat(pos.avg_entry_price).toFixed(2)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">${parseFloat(pos.market_value).toFixed(2)}</p>
                            <p className={`text-sm ${parseFloat(pos.unrealized_pl) >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {parseFloat(pos.unrealized_pl) >= 0 ? "+" : ""}${parseFloat(pos.unrealized_pl).toFixed(2)}
                              <span className="text-xs ml-1">
                                ({(parseFloat(pos.unrealized_plpc) * 100).toFixed(2)}%)
                              </span>
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Wallet className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No open positions</p>
                      <p className="text-xs">Place a trade to get started</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="orders" className="mt-4">
              <Card>
                <CardContent className="pt-4">
                  {ordersLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-14 w-full" />
                      ))}
                    </div>
                  ) : orders && orders.length > 0 ? (
                    <div className="space-y-2">
                      {orders.slice(0, 10).map((order) => (
                        <div
                          key={order.id}
                          className="flex items-center justify-between p-3 rounded-md bg-muted/30"
                          data-testid={`order-${order.id.slice(0, 8)}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center ${order.side === "buy" ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"}`}>
                              {order.side === "buy" ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                            </div>
                            <div>
                              <p className="font-medium">{order.symbol} - {order.side.toUpperCase()}</p>
                              <p className="text-xs text-muted-foreground">
                                ${order.notional ?? (parseFloat(order.qty || "0") * parseFloat(order.filled_avg_price || "0")).toFixed(2)}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant={
                              order.status === "filled" ? "default" :
                              order.status === "accepted" || order.status === "pending_new" ? "secondary" :
                              order.status === "canceled" || order.status === "rejected" ? "destructive" :
                              "outline"
                            }>
                              {order.status}
                            </Badge>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No recent orders</p>
                      <p className="text-xs">Your order history will appear here</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="news" className="mt-4">
              <Card>
                <CardContent className="pt-4">
                  {marketNews && marketNews.length > 0 ? (
                    <div className="space-y-4">
                      {marketNews.slice(0, 8).map((news) => (
                        <a
                          key={news.id}
                          href={news.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block p-3 rounded-md border hover-elevate"
                          data-testid={`news-${news.id}`}
                        >
                          <p className="font-medium line-clamp-2">{news.headline}</p>
                          {news.summary && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{news.summary}</p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs text-muted-foreground">{news.source}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(news.created_at), { addSuffix: true })}
                            </span>
                            {news.symbols?.slice(0, 3).map((sym) => (
                              <Badge key={sym} variant="outline" className="text-xs">
                                {sym}
                              </Badge>
                            ))}
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No market news available</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="agent" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4" />
                      Turtle Trading Agent
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {agentStatus?.autonomy === "manual" ? "Manual" : 
                         agentStatus?.autonomy === "moderate" ? "Moderate" : 
                         agentStatus?.autonomy === "full_agentic" ? "Full Auto" : "Manual"}
                      </Badge>
                      <Button
                        size="sm"
                        onClick={() => runLoopMutation.mutate()}
                        disabled={runLoopMutation.isPending}
                        data-testid="button-run-analysis"
                      >
                        <Play className="h-3 w-3 mr-1" />
                        {runLoopMutation.isPending ? "Analyzing..." : "Run Analysis"}
                      </Button>
                    </div>
                  </CardTitle>
                  <CardDescription>
                    Autonomous Turtle strategy with 3 autonomy tiers
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="p-2 rounded-md bg-muted/30">
                      <p className="text-muted-foreground">Mode</p>
                      <p className="font-medium">{agentStatus?.mode ?? "paper"}</p>
                    </div>
                    <div className="p-2 rounded-md bg-muted/30">
                      <p className="text-muted-foreground">Can Execute</p>
                      <p className="font-medium">{agentStatus?.can_execute ? "Yes" : "No"}</p>
                    </div>
                    <div className="p-2 rounded-md bg-muted/30">
                      <p className="text-muted-foreground">Max/Trade</p>
                      <p className="font-medium">${agentStatus?.risk_limits?.max_per_trade ?? 25}</p>
                    </div>
                    <div className="p-2 rounded-md bg-muted/30">
                      <p className="text-muted-foreground">Max Positions</p>
                      <p className="font-medium">{agentStatus?.risk_limits?.max_positions ?? 3}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Clock className="h-4 w-4" />
                    Pending Trades
                  </CardTitle>
                  <CardDescription>
                    Trades awaiting your approval
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {pendingTrades && pendingTrades.length > 0 ? (
                    <div className="space-y-3">
                      {pendingTrades.map((trade) => (
                        <div
                          key={trade.id}
                          className="p-4 rounded-md border"
                          data-testid={`pending-trade-${trade.id.slice(0, 8)}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                                trade.trade_intent.side === "buy" 
                                  ? "bg-green-500/20 text-green-500" 
                                  : "bg-red-500/20 text-red-500"
                              }`}>
                                {trade.trade_intent.side === "buy" 
                                  ? <ArrowUpRight className="h-4 w-4" /> 
                                  : <ArrowDownRight className="h-4 w-4" />}
                              </div>
                              <div>
                                <p className="font-bold">{trade.trade_intent.symbol}</p>
                                <p className="text-sm text-muted-foreground">
                                  {trade.trade_intent.side.toUpperCase()} ${trade.trade_intent.notional_usd.toFixed(2)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => approveTradeMutation.mutate(trade.id)}
                                disabled={approveTradeMutation.isPending}
                                data-testid={`button-approve-${trade.id.slice(0, 8)}`}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => rejectTradeMutation.mutate(trade.id)}
                                disabled={rejectTradeMutation.isPending}
                                data-testid={`button-reject-${trade.id.slice(0, 8)}`}
                              >
                                <XCircle className="h-3 w-3 mr-1" />
                                Reject
                              </Button>
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p>{trade.trade_intent.reason}</p>
                            <div className="flex items-center gap-4 text-xs">
                              <span>Stop: ${trade.trade_intent.stop_price?.toFixed(2) ?? "—"}</span>
                              <span>Exit: ${trade.trade_intent.exit_trigger?.toFixed(2) ?? "—"}</span>
                              <span>Confidence: {((trade.trade_intent.confidence ?? 0.5) * 100).toFixed(0)}%</span>
                              <span>
                                Expires {formatDistanceToNow(new Date(trade.expires_at), { addSuffix: true })}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No pending trades</p>
                      <p className="text-xs">Run analysis to generate trade recommendations</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}

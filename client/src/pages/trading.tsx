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
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

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
      <div className="flex items-center justify-between gap-4 p-4 md:p-6 border-b">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-trading-title">Trading</h1>
          <p className="text-sm text-muted-foreground">
            Trade stocks with ZEKE's intelligent assistance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={marketClock?.is_open ? "default" : "outline"} className="gap-1">
            <Clock className="h-3 w-3" />
            {marketClock?.is_open ? "Market Open" : `Opens ${marketClock?.next_open ? format(new Date(marketClock.next_open), "EEE h:mm a") : "Mon"}`}
          </Badge>
          <Badge variant={isPaperMode ? "secondary" : "destructive"} className="gap-1">
            {isPaperMode ? <ShieldCheck className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
            {isPaperMode ? "Paper Trading" : "LIVE Trading"}
          </Badge>
          <Button size="icon" variant="ghost" onClick={refreshAll} data-testid="button-refresh-trading">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 md:p-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Equity</span>
                </div>
                {accountLoading ? (
                  <Skeleton className="h-7 w-24 mt-1" />
                ) : (
                  <p className="text-xl font-bold mt-1" data-testid="text-equity">
                    ${account?.equity?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? "0.00"}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Cash</span>
                </div>
                {accountLoading ? (
                  <Skeleton className="h-7 w-24 mt-1" />
                ) : (
                  <p className="text-xl font-bold mt-1" data-testid="text-cash">
                    ${account?.cash?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? "0.00"}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Buying Power</span>
                </div>
                {accountLoading ? (
                  <Skeleton className="h-7 w-24 mt-1" />
                ) : (
                  <p className="text-xl font-bold mt-1" data-testid="text-buying-power">
                    ${account?.buying_power?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? "0.00"}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Day P&L</span>
                </div>
                {accountLoading ? (
                  <Skeleton className="h-7 w-24 mt-1" />
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <p className={`text-xl font-bold ${(account?.day_pnl ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`} data-testid="text-day-pnl">
                      {(account?.day_pnl ?? 0) >= 0 ? "+" : ""}${account?.day_pnl?.toFixed(2) ?? "0.00"}
                    </p>
                  </div>
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

          <Tabs defaultValue="positions" className="w-full">
            <TabsList>
              <TabsTrigger value="positions" data-testid="tab-positions">
                Positions ({positions?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="orders" data-testid="tab-orders">
                Orders ({orders?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="news" data-testid="tab-news">
                News
              </TabsTrigger>
            </TabsList>

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
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}

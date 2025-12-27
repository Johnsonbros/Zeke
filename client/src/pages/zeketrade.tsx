import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  TrendingDown,
  Bot,
  Target,
  Zap,
  ShieldCheck,
  ArrowRight,
  Activity,
  BarChart3,
  Clock,
  Play,
  CheckCircle,
  Brain,
  Cpu,
  LineChart,
  Shield,
  Eye,
  Rocket,
} from "lucide-react";
import { Link } from "wouter";

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

interface MarketClock {
  is_open: boolean;
  next_open?: string;
  next_close?: string;
}

interface Position {
  symbol: string;
  qty: string;
  market_value: string;
  unrealized_pl: string;
}

interface Order {
  id: string;
  status: string;
  filled_avg_price: string;
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

export default function ZekeTradeLanding() {
  const { data: account, isLoading: accountLoading } = useQuery<TradingAccount>({
    queryKey: ["/api/trading/account"],
    refetchInterval: 30000,
  });

  const { data: marketClock } = useQuery<MarketClock>({
    queryKey: ["/api/trading/clock"],
    refetchInterval: 60000,
  });

  const { data: positions } = useQuery<Position[]>({
    queryKey: ["/api/trading/positions"],
    refetchInterval: 30000,
  });

  const { data: orders } = useQuery<Order[]>({
    queryKey: ["/api/trading/orders"],
    refetchInterval: 30000,
  });

  const { data: riskLimits } = useQuery<RiskLimits>({
    queryKey: ["/api/trading/risk-limits"],
    refetchInterval: 60000,
  });

  const isPaperMode = account?.trading_mode === "paper";
  const filledOrders = orders?.filter(o => o.status === "filled") ?? [];
  const totalUnrealizedPnL = positions?.reduce((sum, p) => sum + parseFloat(p.unrealized_pl || "0"), 0) ?? 0;

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/10" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-lg font-bold text-primary-foreground">Z</span>
            </div>
            <div>
              <h1 className="text-xl font-bold" data-testid="text-zeketrade-title">ZEKETrade</h1>
              <p className="text-xs text-muted-foreground">Autonomous AI Trading</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={marketClock?.is_open ? "default" : "outline"} className="gap-1">
              <Clock className="h-3 w-3" />
              {marketClock?.is_open ? "Market Open" : "Market Closed"}
            </Badge>
            <Badge variant={isPaperMode ? "secondary" : "destructive"}>
              {isPaperMode ? "Paper Trading" : "LIVE"}
            </Badge>
            <Link href="/zeketrade/dashboard">
              <Button variant="outline" className="gap-2" data-testid="button-view-dashboard">
                <Eye className="h-4 w-4" />
                Live Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 md:py-32">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-4xl mx-auto">
            <Badge variant="outline" className="mb-6 gap-2 px-4 py-1.5">
              <Rocket className="h-3 w-3" />
              Fully Autonomous Trading System
            </Badge>
            
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
              AI-Powered{" "}
              <span className="text-primary relative">
                Turtle Trading
                <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" fill="none">
                  <path d="M2 10C50 2 100 2 150 6C200 10 250 10 298 2" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" opacity="0.3"/>
                </svg>
              </span>
            </h1>
            
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Watch a multi-agent AI system execute the legendary Turtle Trading strategy in real-time. 
              Complete transparency into every decision, signal, and trade.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Link href="/zeketrade/dashboard">
                <Button size="lg" className="gap-2 text-lg px-8" data-testid="button-see-live-trades">
                  See Live Trades
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <a href="#how-it-works">
                <Button size="lg" variant="outline" className="gap-2 text-lg px-8" data-testid="button-learn-how">
                  Learn How It Works
                </Button>
              </a>
            </div>

            {/* Live Stats Banner */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
              <Card className="bg-card/50 backdrop-blur border-primary/20">
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl md:text-4xl font-bold text-primary" data-testid="stat-portfolio">
                    {accountLoading ? "..." : `$${((account?.equity ?? 0) / 1000).toFixed(0)}K`}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Portfolio Value</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 backdrop-blur border-primary/20">
                <CardContent className="pt-6 text-center">
                  <p className={`text-3xl md:text-4xl font-bold ${(account?.day_pnl ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`} data-testid="stat-pnl">
                    {accountLoading ? "..." : `${(account?.day_pnl ?? 0) >= 0 ? "+" : ""}$${(account?.day_pnl ?? 0).toFixed(0)}`}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Today's P&L</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 backdrop-blur border-primary/20">
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl md:text-4xl font-bold" data-testid="stat-positions">
                    {positions?.length ?? 0}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Open Positions</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 backdrop-blur border-primary/20">
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl md:text-4xl font-bold" data-testid="stat-trades">
                    {filledOrders.length}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Trades Executed</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 bg-card/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4">The System</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Four Agents. One Mission.</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              A coordinated multi-agent system where each AI has a specialized role in the trading process.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {/* Agent 1: Conductor */}
            <Card className="relative overflow-hidden group hover-elevate">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-primary/50" />
              <CardContent className="pt-8 pb-6">
                <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Bot className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-lg font-bold mb-2">Conductor</h3>
                <p className="text-sm text-muted-foreground">
                  Orchestrates the entire trading loop. Coordinates timing, triggers analysis, and ensures smooth operation.
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <Play className="h-3 w-3" />
                  <span>Loop Controller</span>
                </div>
              </CardContent>
            </Card>

            {/* Agent 2: Decision */}
            <Card className="relative overflow-hidden group hover-elevate">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-blue-500/50" />
              <CardContent className="pt-8 pb-6">
                <div className="h-14 w-14 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Brain className="h-7 w-7 text-blue-500" />
                </div>
                <h3 className="text-lg font-bold mb-2">DecisionAgent</h3>
                <p className="text-sm text-muted-foreground">
                  GPT-4o powered analysis. Evaluates scored signals and selects optimal trades with documented reasoning.
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <Target className="h-3 w-3" />
                  <span>Trade Selector</span>
                </div>
              </CardContent>
            </Card>

            {/* Agent 3: Risk Gate */}
            <Card className="relative overflow-hidden group hover-elevate">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 to-green-500/50" />
              <CardContent className="pt-8 pb-6">
                <div className="h-14 w-14 rounded-xl bg-green-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <ShieldCheck className="h-7 w-7 text-green-500" />
                </div>
                <h3 className="text-lg font-bold mb-2">RiskGateAgent</h3>
                <p className="text-sm text-muted-foreground">
                  Enforces strict risk limits. Position sizing, daily loss limits, and correlation checks before any trade.
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <Shield className="h-3 w-3" />
                  <span>Risk Guardian</span>
                </div>
              </CardContent>
            </Card>

            {/* Agent 4: Execution */}
            <Card className="relative overflow-hidden group hover-elevate">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-500 to-yellow-500/50" />
              <CardContent className="pt-8 pb-6">
                <div className="h-14 w-14 rounded-xl bg-yellow-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Zap className="h-7 w-7 text-yellow-500" />
                </div>
                <h3 className="text-lg font-bold mb-2">ExecutionAgent</h3>
                <p className="text-sm text-muted-foreground">
                  Handles order placement with Alpaca. Manages fills, tracks position state, and logs all activity.
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <Activity className="h-3 w-3" />
                  <span>Order Handler</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Workflow Diagram */}
          <div className="mt-16 max-w-4xl mx-auto">
            <Card className="p-6">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <BarChart3 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Market Data</p>
                    <p className="text-xs text-muted-foreground">20/55-day breakouts</p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground hidden md:block" />
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <Cpu className="h-6 w-6 text-blue-500" />
                  </div>
                  <div>
                    <p className="font-medium">Signal Scoring</p>
                    <p className="text-xs text-muted-foreground">Turtle formula</p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground hidden md:block" />
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle className="h-6 w-6 text-green-500" />
                  </div>
                  <div>
                    <p className="font-medium">Risk Check</p>
                    <p className="text-xs text-muted-foreground">All limits pass</p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground hidden md:block" />
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
                    <Zap className="h-6 w-6 text-yellow-500" />
                  </div>
                  <div>
                    <p className="font-medium">Execute</p>
                    <p className="text-xs text-muted-foreground">Place order</p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Turtle Strategy Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
            <div>
              <Badge variant="outline" className="mb-4">The Strategy</Badge>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Classic Turtle Trading, <span className="text-primary">Modernized</span>
              </h2>
              <p className="text-muted-foreground mb-6">
                The original Turtle Trading system made $175M in the 1980s. We've preserved the core 
                deterministic rules while adding AI-powered analysis for optimal trade selection.
              </p>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">20-Day Breakout (S1)</p>
                    <p className="text-sm text-muted-foreground">Enter on new 20-day highs with 10-day exit channel</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <TrendingDown className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">55-Day Breakout (S2)</p>
                    <p className="text-sm text-muted-foreground">Longer-term signals with 20-day exit channel</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Shield className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">2N Hard Stop</p>
                    <p className="text-sm text-muted-foreground">Risk control using ATR-based position sizing</p>
                  </div>
                </div>
              </div>
            </div>

            <Card className="p-6 bg-card/50">
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <LineChart className="h-5 w-5 text-primary" />
                Scoring Formula
              </h3>
              <div className="font-mono text-sm bg-background/50 rounded-lg p-4 mb-4">
                <p className="text-primary">score =</p>
                <p className="ml-4">3.0 * breakout_strength</p>
                <p className="ml-4">+ 1.0 * system_bonus</p>
                <p className="ml-4">+ 1.0 * momentum_per_N</p>
                <p className="ml-4">- 1.0 * correlation_penalty</p>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p><span className="text-foreground font-medium">breakout_strength:</span> How far price broke above the channel</p>
                <p><span className="text-foreground font-medium">system_bonus:</span> Extra weight for S2 (55-day) signals</p>
                <p><span className="text-foreground font-medium">momentum_per_N:</span> Trend strength relative to volatility</p>
                <p><span className="text-foreground font-medium">correlation_penalty:</span> Reduces score if correlated with existing positions</p>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Risk Management Section */}
      <section className="py-20 bg-card/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4">Risk Controls</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Deterministic Safety Limits</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Hard-coded risk limits that cannot be overridden, even by the AI.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            <Card className="text-center p-6">
              <p className="text-3xl font-bold text-primary mb-2">${riskLimits?.max_position_size ?? 25}</p>
              <p className="text-sm text-muted-foreground">Max Per Trade</p>
            </Card>
            <Card className="text-center p-6">
              <p className="text-3xl font-bold text-primary mb-2">{riskLimits?.max_positions ?? 3}</p>
              <p className="text-sm text-muted-foreground">Max Positions</p>
            </Card>
            <Card className="text-center p-6">
              <p className="text-3xl font-bold text-primary mb-2">{riskLimits?.max_daily_trades ?? 5}</p>
              <p className="text-sm text-muted-foreground">Trades Per Day</p>
            </Card>
            <Card className="text-center p-6">
              <p className="text-3xl font-bold text-red-500 mb-2">${riskLimits?.daily_loss_limit ?? -25}</p>
              <p className="text-sm text-muted-foreground">Daily Loss Limit</p>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <Card className="max-w-4xl mx-auto p-8 md:p-12 text-center bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              See Every Trade. Every Decision.
            </h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Full transparency into the AI's reasoning. Historical trades, pending signals, 
              real-time positions, and detailed performance analytics.
            </p>
            <Link href="/zeketrade/dashboard">
              <Button size="lg" className="gap-2 text-lg px-8" data-testid="button-view-live-dashboard">
                <Eye className="h-5 w-5" />
                View Live Dashboard
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-sm font-bold text-primary-foreground">Z</span>
              </div>
              <span className="text-sm text-muted-foreground">
                ZEKETrade - Built by ZEKE AI Assistant
              </span>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Paper trading mode. Not financial advice. Past performance does not guarantee future results.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

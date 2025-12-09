import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import {
  Brain,
  Calendar,
  Clock,
  FileText,
  Lightbulb,
  ListChecks,
  MessageSquare,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
  Mic,
} from "lucide-react";
import { format, parseISO, subDays } from "date-fns";

interface OmiSummary {
  id: string;
  date: string;
  summaryTitle: string;
  aiSummary: string;
  keyDiscussions: string;
  actionItems: string;
  insights: string;
  totalConversations: number;
  totalDurationMinutes: number;
  peopleInteracted: string;
  topicsDiscussed: string;
  createdAt: string;
}

interface AnalyticsData {
  dateRange: {
    start: string;
    end: string;
  };
  totalConversations: number;
  totalDurationMinutes: number;
  avgConversationsPerDay: number;
  avgDurationPerConversation: number;
  summariesGenerated: number;
  topPeople: { name: string; count: number }[];
  topTopics: { topic: string; count: number }[];
  actionItemsCount: number;
  dailyStats: {
    date: string;
    conversations: number;
    durationMinutes: number;
  }[];
}

const chartConfig = {
  conversations: {
    label: "Conversations",
    color: "hsl(9, 75%, 61%)",
  },
  duration: {
    label: "Duration (min)",
    color: "hsl(30, 15%, 52%)",
  },
};

const COLORS = [
  "hsl(9, 75%, 61%)",
  "hsl(30, 45%, 50%)",
  "hsl(45, 55%, 55%)",
  "hsl(25, 65%, 45%)",
  "hsl(15, 50%, 40%)",
];

function SummaryCard({ summary }: { summary: OmiSummary }) {
  const [expanded, setExpanded] = useState(false);

  const safeJsonParse = (jsonStr: string | null | undefined): unknown[] => {
    if (!jsonStr) return [];
    try {
      return JSON.parse(jsonStr);
    } catch {
      return [];
    }
  };

  const keyDiscussions = safeJsonParse(summary.keyDiscussions) as string[];
  const actionItems = safeJsonParse(summary.actionItems) as string[];
  const insights = safeJsonParse(summary.insights) as string[];
  const people = safeJsonParse(summary.peopleInteracted) as string[];
  const topics = safeJsonParse(summary.topicsDiscussed) as string[];

  return (
    <Card className="mb-4" data-testid={`summary-card-${summary.date}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {format(parseISO(summary.date), "EEEE, MMMM d, yyyy")}
              </span>
            </div>
            <CardTitle className="text-base line-clamp-1" data-testid={`summary-title-${summary.date}`}>
              {summary.summaryTitle}
            </CardTitle>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant="secondary" className="text-xs">
              <MessageSquare className="h-3 w-3 mr-1" />
              {summary.totalConversations}
            </Badge>
            <Badge variant="outline" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              {summary.totalDurationMinutes}m
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className={`text-sm text-muted-foreground ${expanded ? "" : "line-clamp-2"}`}>
          {summary.aiSummary}
        </p>

        {expanded && (
          <div className="space-y-4 pt-2 border-t">
            {keyDiscussions.length > 0 && (
              <div>
                <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Key Discussions
                </h4>
                <ul className="space-y-1">
                  {keyDiscussions.map((item: string, i: number) => (
                    <li key={i} className="text-sm text-muted-foreground pl-6">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {actionItems.length > 0 && (
              <div>
                <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                  <ListChecks className="h-4 w-4 text-green-500" />
                  Action Items
                </h4>
                <ul className="space-y-1">
                  {actionItems.map((item: string, i: number) => (
                    <li key={i} className="text-sm text-muted-foreground pl-6 flex items-start gap-2">
                      <span className="text-green-500">-</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {insights.length > 0 && (
              <div>
                <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                  <Lightbulb className="h-4 w-4 text-yellow-500" />
                  Insights
                </h4>
                <ul className="space-y-1">
                  {insights.map((item: string, i: number) => (
                    <li key={i} className="text-sm text-muted-foreground pl-6">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-4">
              {people.length > 0 && (
                <div className="flex-1 min-w-[150px]">
                  <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    People
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {people.map((person: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {person}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {topics.length > 0 && (
                <div className="flex-1 min-w-[150px]">
                  <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    Topics
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {topics.map((topic: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="w-full text-xs"
          data-testid={`button-expand-${summary.date}`}
        >
          {expanded ? "Show Less" : "Show More"}
        </Button>
      </CardContent>
    </Card>
  );
}

function AnalyticsOverview({ analytics }: { analytics: AnalyticsData }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Card data-testid="stat-total-conversations">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{analytics.totalConversations ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total Conversations</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="stat-total-duration">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{Math.round((analytics.totalDurationMinutes ?? 0) / 60)}h</p>
              <p className="text-xs text-muted-foreground">Total Duration</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="stat-avg-per-day">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{(analytics.avgConversationsPerDay ?? 0).toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">Avg/Day</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="stat-action-items">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <ListChecks className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{analytics.actionItemsCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Action Items</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DailyTrendsChart({ dailyStats }: { dailyStats: AnalyticsData["dailyStats"] }) {
  const chartData = dailyStats.map((stat) => ({
    date: format(parseISO(stat.date), "MMM d"),
    conversations: stat.conversations,
    duration: stat.durationMinutes,
  }));

  return (
    <Card data-testid="chart-daily-trends">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Daily Conversation Trends
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[250px] w-full">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
            />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey="conversations"
              fill="var(--color-conversations)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function TopPeopleChart({ topPeople }: { topPeople: AnalyticsData["topPeople"] }) {
  if (!topPeople || topPeople.length === 0) {
    return (
      <Card data-testid="chart-top-people">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Top Contacts
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[200px]">
          <p className="text-sm text-muted-foreground">No contact data yet</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = topPeople.slice(0, 5).map((person, i) => ({
    name: person.name,
    value: person.count,
    fill: COLORS[i % COLORS.length],
  }));

  return (
    <Card data-testid="chart-top-people">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Top Contacts
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="h-[180px] w-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  dataKey="value"
                  paddingAngle={2}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-2">
            {chartData.map((person, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: person.fill }}
                  />
                  <span className="text-sm truncate max-w-[120px]">{person.name}</span>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {person.value}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TopTopicsChart({ topTopics }: { topTopics: AnalyticsData["topTopics"] }) {
  if (!topTopics || topTopics.length === 0) {
    return (
      <Card data-testid="chart-top-topics">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Top Topics
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[200px]">
          <p className="text-sm text-muted-foreground">No topic data yet</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = topTopics.slice(0, 5).map((topic, i) => ({
    topic: topic.topic,
    count: topic.count,
    fill: COLORS[i % COLORS.length],
  }));

  return (
    <Card data-testid="chart-top-topics">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Top Topics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={{
            count: { label: "Mentions", color: COLORS[0] },
          }}
          className="h-[200px] w-full"
        >
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="topic"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
              width={100}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export default function OmiPage() {
  const [daysRange, setDaysRange] = useState(7);
  const { toast } = useToast();

  const summariesQuery = useQuery<OmiSummary[]>({
    queryKey: ["/api/omi/summaries", 30],
  });

  const analyticsQuery = useQuery<AnalyticsData>({
    queryKey: ["/api/omi/analytics", daysRange],
    queryFn: async () => {
      const res = await fetch(`/api/omi/analytics?days=${daysRange}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

  const generateTodayMutation = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const res = await apiRequest("POST", "/api/omi/generate-summary", {
        date: today,
        forceRegenerate: false,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/omi/summaries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/omi/analytics"] });
      toast({
        title: "Summary Generated",
        description: "Today's conversation summary has been created.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="p-4 sm:p-6 border-b">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Mic className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold" data-testid="page-title">
                Omi Analytics
              </h1>
              <p className="text-sm text-muted-foreground">
                AI-powered insights from your daily conversations
              </p>
            </div>
          </div>
          <Button
            onClick={() => generateTodayMutation.mutate()}
            disabled={generateTodayMutation.isPending}
            data-testid="button-generate-summary"
          >
            {generateTodayMutation.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Generate Today's Summary
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 space-y-6">
          <Tabs defaultValue="analytics" className="w-full">
            <TabsList className="mb-4" data-testid="tabs-omi">
              <TabsTrigger value="analytics" data-testid="tab-analytics">
                <TrendingUp className="h-4 w-4 mr-2" />
                Analytics
              </TabsTrigger>
              <TabsTrigger value="summaries" data-testid="tab-summaries">
                <FileText className="h-4 w-4 mr-2" />
                Daily Summaries
              </TabsTrigger>
            </TabsList>

            <TabsContent value="analytics" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium">Overview</h2>
                <div className="flex gap-2">
                  {[7, 14, 30].map((days) => (
                    <Button
                      key={days}
                      variant={daysRange === days ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDaysRange(days)}
                      data-testid={`button-range-${days}`}
                    >
                      {days}D
                    </Button>
                  ))}
                </div>
              </div>

              {analyticsQuery.isLoading ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map((i) => (
                      <Card key={i}>
                        <CardContent className="p-4">
                          <Skeleton className="h-16 w-full" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  <Skeleton className="h-[300px] w-full" />
                </div>
              ) : analyticsQuery.error ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-medium mb-2">No Analytics Data</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Generate your first daily summary to start seeing analytics.
                    </p>
                    <Button
                      onClick={() => generateTodayMutation.mutate()}
                      disabled={generateTodayMutation.isPending}
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate First Summary
                    </Button>
                  </CardContent>
                </Card>
              ) : analyticsQuery.data ? (
                <>
                  <AnalyticsOverview analytics={analyticsQuery.data} />

                  {analyticsQuery.data.dailyStats && analyticsQuery.data.dailyStats.length > 0 && (
                    <DailyTrendsChart dailyStats={analyticsQuery.data.dailyStats} />
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <TopPeopleChart topPeople={analyticsQuery.data.topPeople || []} />
                    <TopTopicsChart topTopics={analyticsQuery.data.topTopics || []} />
                  </div>
                </>
              ) : null}
            </TabsContent>

            <TabsContent value="summaries">
              {summariesQuery.isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Card key={i}>
                      <CardContent className="p-4">
                        <Skeleton className="h-24 w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : summariesQuery.error ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-medium mb-2">No Summaries Yet</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Generate your first daily summary to see it here.
                    </p>
                    <Button
                      onClick={() => generateTodayMutation.mutate()}
                      disabled={generateTodayMutation.isPending}
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate First Summary
                    </Button>
                  </CardContent>
                </Card>
              ) : summariesQuery.data && summariesQuery.data.length > 0 ? (
                <div>
                  {summariesQuery.data.map((summary) => (
                    <SummaryCard key={summary.id} summary={summary} />
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-8 text-center">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-medium mb-2">No Summaries Yet</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Generate your first daily summary to see it here.
                    </p>
                    <Button
                      onClick={() => generateTodayMutation.mutate()}
                      disabled={generateTodayMutation.isPending}
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate First Summary
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}

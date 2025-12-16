import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Brain,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  BarChart3,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Prediction {
  id: string;
  type: string;
  title: string;
  description: string;
  confidenceScore: string;
  confidenceLevel: string;
  status: string;
  suggestedAction: string;
  reasoning: string;
  priority: string;
  createdAt: string;
  executedAt?: string;
  validatedAt?: string;
  validationResult?: string;
}

interface Pattern {
  id: string;
  type: string;
  name: string;
  description: string;
  frequency: string;
  strength: string;
  dataSource: string;
  accuracyRate?: string;
  predictionCount?: number;
  isActive: boolean;
}

export default function PredictionsPage() {
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState("active");

  // Fetch predictions
  const { data: predictionsData, isLoading: loadingPredictions } = useQuery({
    queryKey: ["/api/predictions"],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch patterns
  const { data: patternsData, isLoading: loadingPatterns } = useQuery({
    queryKey: ["/api/patterns"],
  });

  // Fetch accuracy stats
  const { data: statsData } = useQuery({
    queryKey: ["/api/predictions/stats"],
  });

  const predictions: Prediction[] = (predictionsData as { predictions?: Prediction[] })?.predictions || [];
  const patterns: Pattern[] = (patternsData as { patterns?: Pattern[] })?.patterns || [];
  const stats = (statsData as { stats?: Record<string, unknown> })?.stats;

  const activePredictions = predictions.filter((p) => p.status === "pending");
  const executedPredictions = predictions.filter((p) => p.status === "executed");
  const validatedPredictions = predictions.filter((p) => p.validatedAt);

  // Get confidence badge color
  const getConfidenceBadge = (level: string) => {
    const colors = {
      very_high: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
      high: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
      medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
      low: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
    };
    return colors[level as keyof typeof colors] || colors.medium;
  };

  // Get priority badge color
  const getPriorityBadge = (priority: string) => {
    const colors = {
      urgent: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
      high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
      medium: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
      low: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
    };
    return colors[priority as keyof typeof colors] || colors.medium;
  };

  // Format prediction type
  const formatType = (type: string) => {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div className="container max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="w-8 h-8 text-coral-red" />
            Predictive Intelligence
          </h1>
          <p className="text-muted-foreground mt-1">
            Proactive predictions and behavioral insights powered by AI
          </p>
        </div>
        <Button variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Predictions</p>
                  <p className="text-2xl font-bold">{activePredictions.length}</p>
                </div>
                <Sparkles className="w-8 h-8 text-coral-red" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Executed</p>
                  <p className="text-2xl font-bold">{executedPredictions.length}</p>
                </div>
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Accuracy Rate</p>
                  <p className="text-2xl font-bold">
                    {(stats as { overall?: { accuracy?: number } } | undefined)?.overall?.accuracy
                      ? `${Math.round(((stats as { overall?: { accuracy?: number } }).overall?.accuracy || 0) * 100)}%`
                      : "N/A"}
                  </p>
                </div>
                <BarChart3 className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Patterns</p>
                  <p className="text-2xl font-bold">
                    {patterns.filter((p) => p.isActive).length}
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="active">Active Predictions</TabsTrigger>
          <TabsTrigger value="patterns">Patterns</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Active Predictions Tab */}
        <TabsContent value="active" className="space-y-4">
          {loadingPredictions ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Loading predictions...
              </CardContent>
            </Card>
          ) : activePredictions.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No active predictions at this time</p>
                <p className="text-sm mt-2">
                  ZEKE is continuously analyzing your patterns and will notify you of insights
                </p>
              </CardContent>
            </Card>
          ) : (
            activePredictions.map((prediction) => (
              <Card key={prediction.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={getConfidenceBadge(prediction.confidenceLevel)}>
                          {Math.round(parseFloat(prediction.confidenceScore) * 100)}% confidence
                        </Badge>
                        <Badge className={getPriorityBadge(prediction.priority)}>
                          {prediction.priority}
                        </Badge>
                        <Badge variant="outline">{formatType(prediction.type)}</Badge>
                      </div>
                      <CardTitle className="text-xl">{prediction.title}</CardTitle>
                      <CardDescription className="mt-2">{prediction.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-1">Suggested Action:</p>
                    <p className="text-sm text-muted-foreground">{prediction.suggestedAction}</p>
                  </div>

                  <div>
                    <p className="text-sm font-medium mb-1">Reasoning:</p>
                    <p className="text-sm text-muted-foreground">{prediction.reasoning}</p>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="default">
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Approve
                    </Button>
                    <Button size="sm" variant="outline">
                      <XCircle className="w-4 h-4 mr-2" />
                      Dismiss
                    </Button>
                    <Button size="sm" variant="ghost">
                      <Clock className="w-4 h-4 mr-2" />
                      Remind Later
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Patterns Tab */}
        <TabsContent value="patterns" className="space-y-4">
          {loadingPatterns ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Loading patterns...
              </CardContent>
            </Card>
          ) : patterns.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No patterns discovered yet</p>
                <p className="text-sm mt-2">
                  Patterns will be discovered as ZEKE learns your behaviors
                </p>
              </CardContent>
            </Card>
          ) : (
            patterns
              .filter((p) => p.isActive)
              .map((pattern) => (
                <Card key={pattern.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline">{formatType(pattern.type)}</Badge>
                          <Badge variant="outline">{pattern.dataSource}</Badge>
                          {pattern.accuracyRate && (
                            <Badge className="bg-green-100 text-green-800">
                              {Math.round(parseFloat(pattern.accuracyRate) * 100)}% accurate
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-lg">{pattern.name}</CardTitle>
                        <CardDescription className="mt-2">{pattern.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="font-medium">Frequency</p>
                        <p className="text-muted-foreground">{pattern.frequency}</p>
                      </div>
                      <div>
                        <p className="font-medium">Strength</p>
                        <p className="text-muted-foreground">
                          {Math.round(parseFloat(pattern.strength) * 100)}%
                        </p>
                      </div>
                      <div>
                        <p className="font-medium">Predictions</p>
                        <p className="text-muted-foreground">{pattern.predictionCount || 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          {validatedPredictions.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No prediction history yet</p>
              </CardContent>
            </Card>
          ) : (
            validatedPredictions.map((prediction) => (
              <Card key={prediction.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={prediction.validationResult === "correct" ? "default" : "destructive"}>
                          {prediction.validationResult}
                        </Badge>
                        <Badge variant="outline">{formatType(prediction.type)}</Badge>
                      </div>
                      <CardTitle className="text-lg">{prediction.title}</CardTitle>
                      <CardDescription className="mt-2">{prediction.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    <p>
                      Predicted: {new Date(prediction.createdAt).toLocaleDateString()}
                    </p>
                    {prediction.executedAt && (
                      <p>
                        Executed: {new Date(prediction.executedAt).toLocaleDateString()}
                      </p>
                    )}
                    {prediction.validatedAt && (
                      <p>
                        Validated: {new Date(prediction.validatedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Target,
  Brain,
  Database,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  AlertCircle,
} from "lucide-react";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface CriterionScore {
  name: string;
  score: number;
  maxScore: number;
  evidence: string;
  status: "met" | "partial" | "missing";
}

interface PillarScore {
  pillar: string;
  score: number;
  maxScore: number;
  criteria: CriterionScore[];
  gaps: string[];
  recommendations: string[];
}

interface IdealEvaluation {
  overallScore: number;
  pillars: PillarScore[];
  evaluatedAt: string;
  summary: string;
  criticalGaps: string[];
  nextPriorities: string[];
}

export default function EvalPage() {
  const [expandedPillars, setExpandedPillars] = useState<Set<number>>(new Set([0, 1, 2]));

  const { data: evaluation, isLoading, isError, error, refetch, isFetching } = useQuery<IdealEvaluation>({
    queryKey: ["/api/eval"],
  });

  const togglePillar = (index: number) => {
    const newExpanded = new Set(expandedPillars);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedPillars(newExpanded);
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-green-500";
    if (score >= 40) return "text-yellow-500";
    return "text-red-500";
  };

  const getScoreBg = (score: number) => {
    if (score >= 70) return "bg-green-500";
    if (score >= 40) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getStatusIcon = (status: "met" | "partial" | "missing") => {
    switch (status) {
      case "met":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "partial":
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case "missing":
        return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getPillarIcon = (pillarName: string) => {
    if (pillarName.includes("Self-Understanding")) return Brain;
    if (pillarName.includes("Memory")) return Database;
    if (pillarName.includes("Autonomy")) return Shield;
    return Target;
  };

  if (isLoading) {
    return (
      <div className="container max-w-5xl mx-auto p-6 space-y-6" data-testid="eval-loading">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Target className="w-8 h-8 text-primary" />
              ZEKE Ideal Evaluation
            </h1>
            <p className="text-muted-foreground mt-1">
              Measuring alignment with the three pillars
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (isError || !evaluation) {
    return (
      <div className="container max-w-5xl mx-auto p-6 space-y-6" data-testid="eval-error">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Target className="w-8 h-8 text-primary" />
              ZEKE Ideal Evaluation
            </h1>
            <p className="text-muted-foreground mt-1">
              Measuring alignment with the three pillars
            </p>
          </div>
        </div>
        <Card className="border-destructive" data-testid="card-error">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              Evaluation Unavailable
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Unable to run the ideal evaluation. This may happen if:
            </p>
            <ul className="text-sm text-muted-foreground list-disc pl-6 space-y-1">
              <li>The database is not yet initialized</li>
              <li>Required tables have not been created</li>
              <li>The evaluation service is temporarily unavailable</li>
            </ul>
            {error && (
              <p className="text-xs text-muted-foreground font-mono mt-4">
                {(error as Error).message}
              </p>
            )}
            <Button 
              onClick={() => refetch()} 
              disabled={isFetching}
              data-testid="button-retry-eval"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Target className="w-8 h-8 text-primary" />
            ZEKE Ideal Evaluation
          </h1>
          <p className="text-muted-foreground mt-1">
            Measuring alignment with the three pillars
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh-eval"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Re-evaluate
        </Button>
      </div>

      {evaluation && (
        <>
          <Card className="border-2" data-testid="card-overall-score">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Overall Ideal Alignment</CardTitle>
                <span className={`text-4xl font-bold ${getScoreColor(evaluation.overallScore)}`}>
                  {evaluation.overallScore}
                </span>
              </div>
              <CardDescription>{evaluation.summary}</CardDescription>
            </CardHeader>
            <CardContent>
              <Progress
                value={evaluation.overallScore}
                className="h-3"
              />
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>Early Stage</span>
                <span>Foundational</span>
                <span>Aligned</span>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-3 gap-4">
            {evaluation.pillars.map((pillar, index) => {
              const PillarIcon = getPillarIcon(pillar.pillar);
              return (
                <Card key={index} className="text-center" data-testid={`card-pillar-${index}`}>
                  <CardHeader className="pb-2">
                    <PillarIcon className={`w-8 h-8 mx-auto ${getScoreColor(pillar.score)}`} />
                    <CardTitle className="text-sm mt-2">
                      {pillar.pillar.split(" ").slice(0, 2).join(" ")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-3xl font-bold ${getScoreColor(pillar.score)}`}>
                      {pillar.score}
                    </div>
                    <Progress value={pillar.score} className="h-2 mt-2" />
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="space-y-4">
            {evaluation.pillars.map((pillar, pillarIndex) => {
              const PillarIcon = getPillarIcon(pillar.pillar);
              const isExpanded = expandedPillars.has(pillarIndex);

              return (
                <Collapsible
                  key={pillarIndex}
                  open={isExpanded}
                  onOpenChange={() => togglePillar(pillarIndex)}
                >
                  <Card data-testid={`card-pillar-detail-${pillarIndex}`}>
                    <CollapsibleTrigger className="w-full">
                      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
                        <div className="flex items-center gap-3">
                          <PillarIcon className={`w-6 h-6 ${getScoreColor(pillar.score)}`} />
                          <div className="text-left">
                            <CardTitle className="text-base">{pillar.pillar}</CardTitle>
                            <CardDescription className="text-xs">
                              {pillar.criteria.filter(c => c.status === "met").length}/{pillar.criteria.length} criteria met
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={`text-2xl font-bold ${getScoreColor(pillar.score)}`}>
                            {pillar.score}
                          </div>
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <CardContent className="pt-0 space-y-4">
                        <div className="space-y-2">
                          {pillar.criteria.map((criterion, criterionIndex) => (
                            <div
                              key={criterionIndex}
                              className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                              data-testid={`criterion-${pillarIndex}-${criterionIndex}`}
                            >
                              {getStatusIcon(criterion.status)}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium text-sm">{criterion.name}</span>
                                  <Badge
                                    variant="outline"
                                    className={criterion.status === "met" ? "border-green-500 text-green-500" :
                                      criterion.status === "partial" ? "border-yellow-500 text-yellow-500" :
                                        "border-red-500 text-red-500"}
                                  >
                                    {criterion.score}/{criterion.maxScore}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {criterion.evidence}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>

                        {pillar.gaps.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-yellow-500" />
                              Gaps Identified
                            </h4>
                            <ul className="text-sm text-muted-foreground space-y-1 pl-6 list-disc">
                              {pillar.gaps.map((gap, i) => (
                                <li key={i}>{gap}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {pillar.recommendations.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium flex items-center gap-2">
                              <Lightbulb className="w-4 h-4 text-blue-500" />
                              Recommendations
                            </h4>
                            <ul className="text-sm text-muted-foreground space-y-1 pl-6 list-disc">
                              {pillar.recommendations.map((rec, i) => (
                                <li key={i}>{rec}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })}
          </div>

          {evaluation.nextPriorities.length > 0 && (
            <Card data-testid="card-priorities">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Next Priorities
                </CardTitle>
                <CardDescription>
                  Top recommendations to improve ideal alignment
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2 list-decimal list-inside">
                  {evaluation.nextPriorities.map((priority, i) => (
                    <li key={i} className="text-sm" data-testid={`priority-${i}`}>
                      {priority}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          <div className="text-xs text-muted-foreground text-center">
            Last evaluated: {new Date(evaluation.evaluatedAt).toLocaleString()}
          </div>
        </>
      )}
    </div>
  );
}

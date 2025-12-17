/**
 * Types for the evaluation harness.
 */

export interface EvalStep {
  name: string;
  description: string;
  expectedTool?: string;
  expectedArgs?: Record<string, unknown>;
  validate?: (result: unknown) => boolean;
}

export interface EvalScenario {
  id: string;
  name: string;
  description: string;
  userMessage: string;
  expectedSteps: EvalStep[];
  expectedFinalResponse?: string | RegExp;
}

export interface StepResult {
  stepName: string;
  passed: boolean;
  latencyMs: number;
  toolCalled?: string;
  toolArgs?: Record<string, unknown>;
  error?: string;
}

export interface EvalMetrics {
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  latencies: number[];
  p50LatencyMs: number;
  p95LatencyMs: number;
  totalCost: number;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface EvalResult {
  scenarioId: string;
  scenarioName: string;
  timestamp: string;
  passed: boolean;
  steps: StepResult[];
  metrics: EvalMetrics;
  finalResponse?: string;
  error?: string;
}

export interface EvalRunSummary {
  runId: string;
  timestamp: string;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  results: EvalResult[];
  aggregateMetrics: {
    p50LatencyMs: number;
    p95LatencyMs: number;
    totalCost: number;
    avgStepsPerScenario: number;
  };
}

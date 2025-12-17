/**
 * Eval runner for golden flow tests.
 */

import type { EvalScenario, EvalResult, EvalRunSummary, StepResult } from './types';
import { calculateMetrics, aggregateResults, formatResultsTable, writeResultsJson } from './metrics';
import { IntegrationStubs } from './stubs';

export interface RunOptions {
  verbose?: boolean;
  outputJson?: boolean;
  outputPath?: string;
}

export class EvalRunner {
  private scenarios: EvalScenario[] = [];
  private stubs: IntegrationStubs;

  constructor(stubs?: IntegrationStubs) {
    this.stubs = stubs ?? new IntegrationStubs();
  }

  registerScenario(scenario: EvalScenario): void {
    this.scenarios.push(scenario);
  }

  async runScenario(
    scenario: EvalScenario,
    executeFn: (message: string) => Promise<{
      response: string;
      toolCalls: Array<{ name: string; args: Record<string, unknown>; latencyMs: number }>;
      tokenUsage: { promptTokens: number; completionTokens: number };
    }>
  ): Promise<EvalResult> {
    const startTime = Date.now();
    const steps: StepResult[] = [];
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let finalResponse = '';
    let error: string | undefined;

    try {
      const result = await executeFn(scenario.userMessage);
      finalResponse = result.response;
      totalPromptTokens = result.tokenUsage.promptTokens;
      totalCompletionTokens = result.tokenUsage.completionTokens;

      for (let i = 0; i < scenario.expectedSteps.length; i++) {
        const expectedStep = scenario.expectedSteps[i];
        const actualCall = result.toolCalls[i];

        const stepResult: StepResult = {
          stepName: expectedStep.name,
          passed: false,
          latencyMs: actualCall?.latencyMs ?? 0,
          toolCalled: actualCall?.name,
          toolArgs: actualCall?.args,
        };

        if (!actualCall) {
          stepResult.error = `Expected tool call not found: ${expectedStep.expectedTool}`;
        } else if (expectedStep.expectedTool && actualCall.name !== expectedStep.expectedTool) {
          stepResult.error = `Expected tool ${expectedStep.expectedTool}, got ${actualCall.name}`;
        } else if (expectedStep.validate && !expectedStep.validate(actualCall)) {
          stepResult.error = 'Validation failed';
        } else {
          stepResult.passed = true;
        }

        steps.push(stepResult);
      }

      if (scenario.expectedFinalResponse) {
        if (typeof scenario.expectedFinalResponse === 'string') {
          if (!finalResponse.includes(scenario.expectedFinalResponse)) {
            steps.push({
              stepName: 'Final Response Check',
              passed: false,
              latencyMs: 0,
              error: `Expected response to contain: ${scenario.expectedFinalResponse}`,
            });
          } else {
            steps.push({
              stepName: 'Final Response Check',
              passed: true,
              latencyMs: 0,
            });
          }
        } else if (scenario.expectedFinalResponse instanceof RegExp) {
          if (!scenario.expectedFinalResponse.test(finalResponse)) {
            steps.push({
              stepName: 'Final Response Check',
              passed: false,
              latencyMs: 0,
              error: `Response did not match pattern: ${scenario.expectedFinalResponse}`,
            });
          } else {
            steps.push({
              stepName: 'Final Response Check',
              passed: true,
              latencyMs: 0,
            });
          }
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    const metrics = calculateMetrics(steps, {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
    });

    const passed = steps.length > 0 && steps.every(s => s.passed) && !error;

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      timestamp: new Date().toISOString(),
      passed,
      steps,
      metrics,
      finalResponse,
      error,
    };
  }

  async runAll(
    executeFn: (message: string) => Promise<{
      response: string;
      toolCalls: Array<{ name: string; args: Record<string, unknown>; latencyMs: number }>;
      tokenUsage: { promptTokens: number; completionTokens: number };
    }>,
    options: RunOptions = {}
  ): Promise<EvalRunSummary> {
    const results: EvalResult[] = [];

    for (const scenario of this.scenarios) {
      if (options.verbose) {
        console.log(`Running: ${scenario.name}...`);
      }

      const result = await this.runScenario(scenario, executeFn);
      results.push(result);

      if (options.verbose) {
        console.log(`  ${result.passed ? 'PASS' : 'FAIL'} (${result.metrics.p50LatencyMs}ms p50)`);
      }
    }

    const summary: EvalRunSummary = {
      runId: `eval_${Date.now()}`,
      timestamp: new Date().toISOString(),
      totalScenarios: results.length,
      passedScenarios: results.filter(r => r.passed).length,
      failedScenarios: results.filter(r => !r.passed).length,
      results,
      aggregateMetrics: aggregateResults(results),
    };

    if (options.outputJson) {
      const outputPath = options.outputPath ?? 'eval/results/eval-results.json';
      await writeResultsJson(summary, outputPath);
    }

    return summary;
  }

  printResults(summary: EvalRunSummary): void {
    console.log(formatResultsTable(summary));
  }
}

export function createEvalRunner(stubs?: IntegrationStubs): EvalRunner {
  return new EvalRunner(stubs);
}

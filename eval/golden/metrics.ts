/**
 * Metrics collection and calculation utilities.
 */

import type { EvalMetrics, StepResult, EvalResult, EvalRunSummary } from './types';

const OPENAI_COST_PER_1K_PROMPT = 0.005;
const OPENAI_COST_PER_1K_COMPLETION = 0.015;

export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export function calculateCost(promptTokens: number, completionTokens: number): number {
  const promptCost = (promptTokens / 1000) * OPENAI_COST_PER_1K_PROMPT;
  const completionCost = (completionTokens / 1000) * OPENAI_COST_PER_1K_COMPLETION;
  return Number((promptCost + completionCost).toFixed(6));
}

export function calculateMetrics(
  steps: StepResult[],
  tokenUsage: { promptTokens: number; completionTokens: number }
): EvalMetrics {
  const latencies = steps.map(s => s.latencyMs);
  const passedSteps = steps.filter(s => s.passed).length;
  
  return {
    totalSteps: steps.length,
    passedSteps,
    failedSteps: steps.length - passedSteps,
    latencies,
    p50LatencyMs: calculatePercentile(latencies, 50),
    p95LatencyMs: calculatePercentile(latencies, 95),
    totalCost: calculateCost(tokenUsage.promptTokens, tokenUsage.completionTokens),
    tokenUsage,
  };
}

export function aggregateResults(results: EvalResult[]): EvalRunSummary['aggregateMetrics'] {
  const allLatencies = results.flatMap(r => r.metrics.latencies);
  const totalCost = results.reduce((sum, r) => sum + r.metrics.totalCost, 0);
  const totalSteps = results.reduce((sum, r) => sum + r.metrics.totalSteps, 0);
  
  return {
    p50LatencyMs: calculatePercentile(allLatencies, 50),
    p95LatencyMs: calculatePercentile(allLatencies, 95),
    totalCost: Number(totalCost.toFixed(6)),
    avgStepsPerScenario: results.length > 0 ? Number((totalSteps / results.length).toFixed(2)) : 0,
  };
}

export function formatResultsTable(summary: EvalRunSummary): string {
  const lines: string[] = [];
  
  const divider = '+' + '-'.repeat(42) + '+' + '-'.repeat(10) + '+' + '-'.repeat(12) + '+' + '-'.repeat(12) + '+' + '-'.repeat(10) + '+';
  
  lines.push('');
  lines.push('=' .repeat(90));
  lines.push(`  EVAL RUN: ${summary.runId}`);
  lines.push(`  Timestamp: ${summary.timestamp}`);
  lines.push('=' .repeat(90));
  lines.push('');
  
  lines.push(divider);
  lines.push(`| ${'Scenario'.padEnd(40)} | ${'Status'.padEnd(8)} | ${'p50 (ms)'.padEnd(10)} | ${'p95 (ms)'.padEnd(10)} | ${'Cost'.padEnd(8)} |`);
  lines.push(divider);
  
  for (const result of summary.results) {
    const status = result.passed ? 'PASS' : 'FAIL';
    const statusColor = result.passed ? status : status;
    const name = result.scenarioName.length > 40 
      ? result.scenarioName.substring(0, 37) + '...'
      : result.scenarioName;
    
    lines.push(
      `| ${name.padEnd(40)} | ${statusColor.padEnd(8)} | ${result.metrics.p50LatencyMs.toString().padEnd(10)} | ${result.metrics.p95LatencyMs.toString().padEnd(10)} | $${result.metrics.totalCost.toFixed(4).padEnd(7)} |`
    );
  }
  
  lines.push(divider);
  lines.push('');
  
  lines.push('  SUMMARY');
  lines.push('  ' + '-'.repeat(40));
  lines.push(`  Total Scenarios:  ${summary.totalScenarios}`);
  lines.push(`  Passed:           ${summary.passedScenarios}`);
  lines.push(`  Failed:           ${summary.failedScenarios}`);
  lines.push(`  Pass Rate:        ${((summary.passedScenarios / summary.totalScenarios) * 100).toFixed(1)}%`);
  lines.push('');
  lines.push('  AGGREGATE METRICS');
  lines.push('  ' + '-'.repeat(40));
  lines.push(`  p50 Latency:      ${summary.aggregateMetrics.p50LatencyMs}ms`);
  lines.push(`  p95 Latency:      ${summary.aggregateMetrics.p95LatencyMs}ms`);
  lines.push(`  Total Cost:       $${summary.aggregateMetrics.totalCost.toFixed(4)}`);
  lines.push(`  Avg Steps/Scen:   ${summary.aggregateMetrics.avgStepsPerScenario}`);
  lines.push('');
  lines.push('=' .repeat(90));
  
  return lines.join('\n');
}

export async function writeResultsJson(
  summary: EvalRunSummary,
  outputPath: string = 'eval/results/eval-results.json'
): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');
  
  const dir = path.dirname(outputPath);
  await fs.mkdir(dir, { recursive: true });
  
  await fs.writeFile(outputPath, JSON.stringify(summary, null, 2));
}

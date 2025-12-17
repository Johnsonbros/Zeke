#!/usr/bin/env npx tsx
/**
 * SLO Gate Script
 * 
 * Validates evaluation results against configurable SLO thresholds.
 * Fails CI if any SLO is breached.
 * 
 * Usage:
 *   npx tsx scripts/slo_check.ts [--results-path <path>] [--config <path>]
 * 
 * Default results path: eval/results/eval-results.json
 */

import * as fs from 'fs/promises';
import * as path from 'path';

interface EvalRunSummary {
  runId: string;
  timestamp: string;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  results: Array<{
    scenarioId: string;
    scenarioName: string;
    passed: boolean;
    metrics: {
      p50LatencyMs: number;
      p95LatencyMs: number;
      totalCost: number;
    };
  }>;
  aggregateMetrics: {
    p50LatencyMs: number;
    p95LatencyMs: number;
    totalCost: number;
    avgStepsPerScenario: number;
  };
}

export interface SLOConfig {
  minPassRate: number;
  maxP50LatencyMs: number;
  maxP95LatencyMs: number;
  maxCostPerRun: number;
  maxAgeHours: number;
}

const DEFAULT_SLO_CONFIG: SLOConfig = {
  minPassRate: 0.95,
  maxP50LatencyMs: 500,
  maxP95LatencyMs: 2000,
  maxCostPerRun: 1.0,
  maxAgeHours: 168,
};

interface SLOViolation {
  slo: string;
  threshold: string;
  actual: string;
  severity: 'error' | 'warning';
}

export interface SLOCheckResult {
  passed: boolean;
  violations: SLOViolation[];
  summary: {
    passRate: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    totalCost: number;
    resultsAge: string;
  };
}

function parseArgs(): { resultsPath: string; configPath?: string } {
  const args = process.argv.slice(2);
  let resultsPath = 'eval/results/eval-results.json';
  let configPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--results-path' && args[i + 1]) {
      resultsPath = args[i + 1];
      i++;
    } else if (args[i] === '--config' && args[i + 1]) {
      configPath = args[i + 1];
      i++;
    }
  }

  return { resultsPath, configPath };
}

async function loadConfig(configPath?: string): Promise<SLOConfig> {
  if (!configPath) {
    return DEFAULT_SLO_CONFIG;
  }

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const userConfig = JSON.parse(content);
    return { ...DEFAULT_SLO_CONFIG, ...userConfig };
  } catch {
    console.warn(`Warning: Could not load config from ${configPath}, using defaults`);
    return DEFAULT_SLO_CONFIG;
  }
}

async function loadResults(resultsPath: string): Promise<EvalRunSummary> {
  const absolutePath = path.resolve(resultsPath);
  
  try {
    const content = await fs.readFile(absolutePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to load eval results from ${absolutePath}: ${error}`);
  }
}

function calculateResultsAge(timestamp: string): { hours: number; formatted: string } {
  const resultsDate = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - resultsDate.getTime();
  const hours = diffMs / (1000 * 60 * 60);
  
  if (hours < 1) {
    return { hours, formatted: `${Math.round(hours * 60)} minutes ago` };
  } else if (hours < 24) {
    return { hours, formatted: `${Math.round(hours)} hours ago` };
  } else {
    const days = Math.round(hours / 24);
    return { hours, formatted: `${days} days ago` };
  }
}

export function checkSLOs(results: EvalRunSummary, config: SLOConfig): SLOCheckResult {
  const violations: SLOViolation[] = [];
  
  const passRate = results.totalScenarios > 0
    ? results.passedScenarios / results.totalScenarios
    : 0;
  
  const { hours: ageHours, formatted: ageFormatted } = calculateResultsAge(results.timestamp);
  
  if (passRate < config.minPassRate) {
    violations.push({
      slo: 'Pass Rate',
      threshold: `>= ${(config.minPassRate * 100).toFixed(1)}%`,
      actual: `${(passRate * 100).toFixed(1)}%`,
      severity: 'error',
    });
  }
  
  if (results.aggregateMetrics.p50LatencyMs > config.maxP50LatencyMs) {
    violations.push({
      slo: 'P50 Latency',
      threshold: `<= ${config.maxP50LatencyMs}ms`,
      actual: `${results.aggregateMetrics.p50LatencyMs}ms`,
      severity: 'error',
    });
  }
  
  if (results.aggregateMetrics.p95LatencyMs > config.maxP95LatencyMs) {
    violations.push({
      slo: 'P95 Latency',
      threshold: `<= ${config.maxP95LatencyMs}ms`,
      actual: `${results.aggregateMetrics.p95LatencyMs}ms`,
      severity: 'error',
    });
  }
  
  if (results.aggregateMetrics.totalCost > config.maxCostPerRun) {
    violations.push({
      slo: 'Cost Per Run',
      threshold: `<= $${config.maxCostPerRun.toFixed(2)}`,
      actual: `$${results.aggregateMetrics.totalCost.toFixed(4)}`,
      severity: 'warning',
    });
  }
  
  if (ageHours > config.maxAgeHours) {
    violations.push({
      slo: 'Results Freshness',
      threshold: `<= ${config.maxAgeHours} hours`,
      actual: ageFormatted,
      severity: 'warning',
    });
  }
  
  const hasErrors = violations.some(v => v.severity === 'error');
  
  return {
    passed: !hasErrors,
    violations,
    summary: {
      passRate,
      p50LatencyMs: results.aggregateMetrics.p50LatencyMs,
      p95LatencyMs: results.aggregateMetrics.p95LatencyMs,
      totalCost: results.aggregateMetrics.totalCost,
      resultsAge: ageFormatted,
    },
  };
}

function formatReport(result: SLOCheckResult, config: SLOConfig): string {
  const lines: string[] = [];
  
  lines.push('');
  lines.push('=' .repeat(60));
  lines.push('  SLO GATE CHECK');
  lines.push('=' .repeat(60));
  lines.push('');
  
  lines.push('  THRESHOLDS');
  lines.push('  ' + '-'.repeat(40));
  lines.push(`  Min Pass Rate:     ${(config.minPassRate * 100).toFixed(1)}%`);
  lines.push(`  Max P50 Latency:   ${config.maxP50LatencyMs}ms`);
  lines.push(`  Max P95 Latency:   ${config.maxP95LatencyMs}ms`);
  lines.push(`  Max Cost Per Run:  $${config.maxCostPerRun.toFixed(2)}`);
  lines.push(`  Max Results Age:   ${config.maxAgeHours} hours`);
  lines.push('');
  
  lines.push('  ACTUAL METRICS');
  lines.push('  ' + '-'.repeat(40));
  lines.push(`  Pass Rate:         ${(result.summary.passRate * 100).toFixed(1)}%`);
  lines.push(`  P50 Latency:       ${result.summary.p50LatencyMs}ms`);
  lines.push(`  P95 Latency:       ${result.summary.p95LatencyMs}ms`);
  lines.push(`  Total Cost:        $${result.summary.totalCost.toFixed(4)}`);
  lines.push(`  Results Age:       ${result.summary.resultsAge}`);
  lines.push('');
  
  if (result.violations.length > 0) {
    lines.push('  VIOLATIONS');
    lines.push('  ' + '-'.repeat(40));
    for (const v of result.violations) {
      const icon = v.severity === 'error' ? 'X' : '!';
      lines.push(`  [${icon}] ${v.slo}: ${v.actual} (threshold: ${v.threshold})`);
    }
    lines.push('');
  }
  
  const status = result.passed ? 'PASSED' : 'FAILED';
  lines.push('  ' + '-'.repeat(40));
  lines.push(`  STATUS: ${status}`);
  lines.push('=' .repeat(60));
  lines.push('');
  
  return lines.join('\n');
}

async function main(): Promise<void> {
  const { resultsPath, configPath } = parseArgs();
  
  console.log(`Loading eval results from: ${resultsPath}`);
  
  const [config, results] = await Promise.all([
    loadConfig(configPath),
    loadResults(resultsPath),
  ]);
  
  const checkResult = checkSLOs(results, config);
  const report = formatReport(checkResult, config);
  
  console.log(report);
  
  if (!checkResult.passed) {
    console.error('SLO gate check failed. See violations above.');
    process.exit(1);
  }
  
  console.log('SLO gate check passed.');
  process.exit(0);
}

const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
  process.argv[1]?.endsWith('slo_check.ts');

if (isMainModule) {
  main().catch((error) => {
    console.error('SLO check error:', error.message);
    process.exit(1);
  });
}

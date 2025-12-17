import { describe, it, expect } from 'vitest';
import { checkSLOs, SLOConfig } from '../../scripts/slo_check';

const DEFAULT_CONFIG: SLOConfig = {
  minPassRate: 0.95,
  maxP50LatencyMs: 500,
  maxP95LatencyMs: 2000,
  maxCostPerRun: 1.0,
  maxAgeHours: 168,
};

function createMockResults(overrides: Partial<{
  passedScenarios: number;
  totalScenarios: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  totalCost: number;
  timestamp: string;
}> = {}) {
  const now = new Date();
  return {
    runId: 'test-run-1',
    timestamp: overrides.timestamp ?? now.toISOString(),
    totalScenarios: overrides.totalScenarios ?? 10,
    passedScenarios: overrides.passedScenarios ?? 10,
    failedScenarios: (overrides.totalScenarios ?? 10) - (overrides.passedScenarios ?? 10),
    results: [],
    aggregateMetrics: {
      p50LatencyMs: overrides.p50LatencyMs ?? 100,
      p95LatencyMs: overrides.p95LatencyMs ?? 500,
      totalCost: overrides.totalCost ?? 0.5,
      avgStepsPerScenario: 3,
    },
  };
}

describe('SLO Check', () => {
  describe('pass rate validation', () => {
    it('should pass when pass rate meets threshold', () => {
      const results = createMockResults({ passedScenarios: 10, totalScenarios: 10 });
      const check = checkSLOs(results, DEFAULT_CONFIG);
      
      expect(check.passed).toBe(true);
      expect(check.violations).toHaveLength(0);
      expect(check.summary.passRate).toBe(1.0);
    });

    it('should fail when pass rate below threshold', () => {
      const results = createMockResults({ passedScenarios: 9, totalScenarios: 10 });
      const check = checkSLOs(results, DEFAULT_CONFIG);
      
      expect(check.passed).toBe(false);
      expect(check.violations).toContainEqual(
        expect.objectContaining({
          slo: 'Pass Rate',
          severity: 'error',
        })
      );
    });

    it('should handle zero scenarios gracefully', () => {
      const results = createMockResults({ passedScenarios: 0, totalScenarios: 0 });
      const check = checkSLOs(results, DEFAULT_CONFIG);
      
      expect(check.summary.passRate).toBe(0);
      expect(check.passed).toBe(false);
    });
  });

  describe('latency validation', () => {
    it('should pass when latencies within limits', () => {
      const results = createMockResults({ p50LatencyMs: 400, p95LatencyMs: 1800 });
      const check = checkSLOs(results, DEFAULT_CONFIG);
      
      expect(check.passed).toBe(true);
      expect(check.violations.filter(v => v.slo.includes('Latency'))).toHaveLength(0);
    });

    it('should fail when P50 latency exceeds limit', () => {
      const results = createMockResults({ p50LatencyMs: 600 });
      const check = checkSLOs(results, DEFAULT_CONFIG);
      
      expect(check.passed).toBe(false);
      expect(check.violations).toContainEqual(
        expect.objectContaining({
          slo: 'P50 Latency',
          severity: 'error',
        })
      );
    });

    it('should fail when P95 latency exceeds limit', () => {
      const results = createMockResults({ p95LatencyMs: 2500 });
      const check = checkSLOs(results, DEFAULT_CONFIG);
      
      expect(check.passed).toBe(false);
      expect(check.violations).toContainEqual(
        expect.objectContaining({
          slo: 'P95 Latency',
          severity: 'error',
        })
      );
    });
  });

  describe('cost validation', () => {
    it('should pass when cost within limit', () => {
      const results = createMockResults({ totalCost: 0.8 });
      const check = checkSLOs(results, DEFAULT_CONFIG);
      
      expect(check.violations.filter(v => v.slo === 'Cost Per Run')).toHaveLength(0);
    });

    it('should warn when cost exceeds limit (not fail)', () => {
      const results = createMockResults({ totalCost: 1.5 });
      const check = checkSLOs(results, DEFAULT_CONFIG);
      
      expect(check.violations).toContainEqual(
        expect.objectContaining({
          slo: 'Cost Per Run',
          severity: 'warning',
        })
      );
      expect(check.passed).toBe(true);
    });
  });

  describe('results freshness validation', () => {
    it('should pass when results are fresh', () => {
      const results = createMockResults();
      const check = checkSLOs(results, DEFAULT_CONFIG);
      
      expect(check.violations.filter(v => v.slo === 'Results Freshness')).toHaveLength(0);
    });

    it('should warn when results are stale (not fail)', () => {
      const staleDate = new Date();
      staleDate.setHours(staleDate.getHours() - 200);
      const results = createMockResults({ timestamp: staleDate.toISOString() });
      const check = checkSLOs(results, DEFAULT_CONFIG);
      
      expect(check.violations).toContainEqual(
        expect.objectContaining({
          slo: 'Results Freshness',
          severity: 'warning',
        })
      );
      expect(check.passed).toBe(true);
    });
  });

  describe('custom config', () => {
    it('should use custom thresholds', () => {
      const strictConfig: SLOConfig = {
        minPassRate: 1.0,
        maxP50LatencyMs: 100,
        maxP95LatencyMs: 500,
        maxCostPerRun: 0.1,
        maxAgeHours: 24,
      };
      
      const results = createMockResults({
        passedScenarios: 10,
        totalScenarios: 10,
        p50LatencyMs: 150,
      });
      
      const check = checkSLOs(results, strictConfig);
      
      expect(check.passed).toBe(false);
      expect(check.violations).toContainEqual(
        expect.objectContaining({ slo: 'P50 Latency' })
      );
    });
  });

  describe('multiple violations', () => {
    it('should report all violations', () => {
      const results = createMockResults({
        passedScenarios: 8,
        totalScenarios: 10,
        p50LatencyMs: 600,
        p95LatencyMs: 2500,
        totalCost: 2.0,
      });
      
      const check = checkSLOs(results, DEFAULT_CONFIG);
      
      expect(check.passed).toBe(false);
      expect(check.violations.length).toBeGreaterThanOrEqual(3);
      
      const slos = check.violations.map(v => v.slo);
      expect(slos).toContain('Pass Rate');
      expect(slos).toContain('P50 Latency');
      expect(slos).toContain('P95 Latency');
    });
  });
});

/**
 * Self Model Evaluator
 * 
 * Replaces abstract "pillar scores" with measurable health metrics:
 * - Coverage: how many days have usable signals for each domain
 * - Stability: how many findings persist across weeks
 * - Calibration: how often expectations match observations
 */

import { getDaysWithSignals, getSignalCounts } from "./signals";
import { getFindings, getFindingCounts, getStabilityScore } from "./findings";
import { getCalibrationScore } from "./expectations";

export interface SelfModelHealth {
  coverage: {
    score: number; // 0-1
    daysByDomain: Record<string, number>;
    totalDays: number;
    targetDays: number;
  };
  stability: {
    score: number; // 0-1
    persistentFindings: number;
    totalActiveFindings: number;
  };
  calibration: {
    score: number; // 0-1
    correctPredictions: number;
    totalPredictions: number;
  };
  overall: {
    score: number; // 0-1 (weighted average)
    grade: "excellent" | "good" | "developing" | "sparse";
    message: string;
  };
  findings: {
    correlations: number;
    contradictions: number;
    stale: number;
  };
}

/**
 * Evaluate the health of the self-model
 */
export function evaluateSelfModel(sinceDays: number = 30): SelfModelHealth {
  // Coverage: days with signals per domain
  const daysByDomain = getDaysWithSignals(sinceDays);
  const totalDays = Math.max(...Object.values(daysByDomain), 0);
  const targetDays = sinceDays;
  const coverageScore = Math.min(1, totalDays / targetDays);
  
  // Stability: findings that persist
  const stabilityScore = getStabilityScore();
  const findingCounts = getFindingCounts();
  
  // Calibration: prediction accuracy
  const calibration = getCalibrationScore();
  
  // Overall weighted score
  // Weights: coverage 0.3, stability 0.3, calibration 0.4
  const overallScore = (coverageScore * 0.3) + (stabilityScore * 0.3) + (calibration.score * 0.4);
  
  // Grade based on overall score
  let grade: SelfModelHealth["overall"]["grade"];
  let message: string;
  
  if (overallScore >= 0.8) {
    grade = "excellent";
    message = "Self-model is well-calibrated with strong data coverage and stable patterns.";
  } else if (overallScore >= 0.6) {
    grade = "good";
    message = "Self-model is developing nicely. Continue logging to strengthen patterns.";
  } else if (overallScore >= 0.3) {
    grade = "developing";
    message = "Self-model needs more data to discover meaningful patterns.";
  } else {
    grade = "sparse";
    message = "Insufficient data for self-understanding. Start by logging daily energy and mood.";
  }
  
  return {
    coverage: {
      score: coverageScore,
      daysByDomain,
      totalDays,
      targetDays,
    },
    stability: {
      score: stabilityScore,
      persistentFindings: Math.round(findingCounts.active * stabilityScore),
      totalActiveFindings: findingCounts.active,
    },
    calibration: {
      score: calibration.score,
      correctPredictions: calibration.correct,
      totalPredictions: calibration.total,
    },
    overall: {
      score: overallScore,
      grade,
      message,
    },
    findings: {
      correlations: findingCounts.correlations,
      contradictions: findingCounts.contradictions,
      stale: findingCounts.stale,
    },
  };
}

/**
 * Get a quick summary for the dashboard
 */
export function getSelfModelQuickSummary(): {
  health: string;
  score: number;
  correlations: number;
  contradictions: number;
  suggestion: string;
} {
  const health = evaluateSelfModel(30);
  
  let suggestion: string;
  if (health.coverage.score < 0.3) {
    suggestion = "Log your daily energy and mood to start building patterns.";
  } else if (health.calibration.total < 5) {
    suggestion = "ZEKE needs to make more predictions to learn your patterns.";
  } else if (health.findings.contradictions > health.findings.correlations) {
    suggestion = "Review contradictions - they reveal what ZEKE doesn't understand yet.";
  } else {
    suggestion = "Model is healthy. Ask ZEKE what affects your energy or mood.";
  }
  
  return {
    health: health.overall.grade,
    score: Math.round(health.overall.score * 100),
    correlations: health.findings.correlations,
    contradictions: health.findings.contradictions,
    suggestion,
  };
}

/**
 * Get understanding packet for AI synthesis (with citations)
 */
export function getUnderstandingPacket(subject: string): {
  findings: Array<{
    id: string;
    kind: string;
    subject: string;
    predicate: string;
    object: string;
    stats: any;
    strength: number;
  }>;
  signalIds: string[];
} {
  const findings = getFindings({
    subject,
    status: "active",
    limit: 12,
  });
  
  const signalIds = findings.flatMap(f => f.evidence.signalIds || []).slice(0, 200);
  
  return {
    findings: findings.map(f => ({
      id: f.id,
      kind: f.kind,
      subject: f.subject,
      predicate: f.predicate,
      object: f.object,
      stats: f.stats,
      strength: f.strength,
    })),
    signalIds,
  };
}

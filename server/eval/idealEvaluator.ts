/**
 * ZEKE Ideal Evaluator
 * 
 * Scores ZEKE's implementation against the three pillars defined in ZEKE_IDEAL.md:
 * 1. Self-Understanding Before Optimization
 * 2. Memory Is a Living Model
 * 3. Autonomy Is Earned, Reversible, and Bounded
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "zeke.db");

export interface PillarScore {
  pillar: string;
  score: number;
  maxScore: number;
  criteria: CriterionScore[];
  gaps: string[];
  recommendations: string[];
}

export interface CriterionScore {
  name: string;
  score: number;
  maxScore: number;
  evidence: string;
  status: 'met' | 'partial' | 'missing';
}

export interface IdealEvaluation {
  overallScore: number;
  pillars: PillarScore[];
  evaluatedAt: string;
  summary: string;
  criticalGaps: string[];
  nextPriorities: string[];
}

function getDb(): Database.Database | null {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return null;
    }
    return new Database(DB_PATH, { readonly: true });
  } catch {
    return null;
  }
}

function tableExists(db: Database.Database, tableName: string): boolean {
  try {
    const result = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
    ).get(tableName);
    return !!result;
  } catch {
    return false;
  }
}

function safeQuery<T>(db: Database.Database, query: string, defaultValue: T): T {
  try {
    return db.prepare(query).get() as T ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

function safeQueryAll<T>(db: Database.Database, query: string): T[] {
  try {
    return db.prepare(query).all() as T[];
  } catch {
    return [];
  }
}

/**
 * Pillar 1: Self-Understanding Before Optimization
 */
function evaluateSelfUnderstanding(db: Database.Database | null): PillarScore {
  const criteria: CriterionScore[] = [];
  const gaps: string[] = [];
  const recommendations: string[] = [];

  if (!db) {
    return createMissingDbPillar('Self-Understanding Before Optimization');
  }

  // Criterion 1: Pattern evidence tracking
  if (tableExists(db, 'patterns')) {
    const patterns = safeQuery<{ count: number }>(db, 
      `SELECT COUNT(*) as count FROM patterns WHERE is_active = 1`, 
      { count: 0 }
    );
    const patternsWithDefinition = safeQuery<{ count: number }>(db,
      `SELECT COUNT(*) as count FROM patterns WHERE is_active = 1 AND pattern_definition IS NOT NULL AND pattern_definition != ''`,
      { count: 0 }
    );
    
    const ratio = patterns.count > 0 ? patternsWithDefinition.count / patterns.count : 0;
    const score = patterns.count > 0 ? Math.round(ratio * 100) : 0;
    
    criteria.push({
      name: 'Pattern Evidence Tracking',
      score,
      maxScore: 100,
      evidence: `${patternsWithDefinition.count}/${patterns.count} patterns have evidence definitions`,
      status: score >= 80 ? 'met' : score >= 40 ? 'partial' : 'missing'
    });
    
    if (score < 80) {
      gaps.push('Not all patterns have supporting evidence stored');
      recommendations.push('Add evidence array to pattern definitions');
    }
  } else {
    criteria.push({
      name: 'Pattern Evidence Tracking',
      score: 0,
      maxScore: 100,
      evidence: 'Patterns table not found',
      status: 'missing'
    });
    gaps.push('Pattern system not implemented');
  }

  // Criterion 2: Cross-domain correlations
  if (tableExists(db, 'patterns')) {
    const correlations = safeQuery<{ count: number }>(db,
      `SELECT COUNT(*) as count FROM patterns WHERE type = 'correlation' AND is_active = 1`,
      { count: 0 }
    );
    
    const score = correlations.count >= 10 ? 100 : correlations.count >= 5 ? 70 : correlations.count >= 1 ? 40 : 0;
    
    criteria.push({
      name: 'Cross-Domain Correlations',
      score,
      maxScore: 100,
      evidence: `${correlations.count} correlation patterns discovered`,
      status: score >= 80 ? 'met' : score >= 40 ? 'partial' : 'missing'
    });
    
    if (score < 80) {
      gaps.push('Limited cross-domain correlation discovery');
      recommendations.push('Implement correlation engine in patternRecognition.ts');
    }
  } else {
    criteria.push({
      name: 'Cross-Domain Correlations',
      score: 0,
      maxScore: 100,
      evidence: 'Patterns table not found',
      status: 'missing'
    });
  }

  // Criterion 3: Narrative insights
  if (tableExists(db, 'insights')) {
    const insights = safeQuery<{ count: number }>(db,
      `SELECT COUNT(*) as count FROM insights`,
      { count: 0 }
    );
    const narrativeInsights = safeQuery<{ count: number }>(db,
      `SELECT COUNT(*) as count FROM insights WHERE LENGTH(content) > 100 AND suggested_action IS NOT NULL`,
      { count: 0 }
    );
    
    const ratio = insights.count > 0 ? narrativeInsights.count / insights.count : 0;
    const score = insights.count > 0 ? Math.round(ratio * 100) : 0;
    
    criteria.push({
      name: 'Narrative Insights',
      score,
      maxScore: 100,
      evidence: `${narrativeInsights.count}/${insights.count} insights are narrative with actions`,
      status: score >= 80 ? 'met' : score >= 40 ? 'partial' : 'missing'
    });
    
    if (score < 80) {
      gaps.push('Insights are too brief or missing actionable suggestions');
      recommendations.push('Enhance insightsGenerator.ts to produce narrative explanations');
    }
  } else {
    criteria.push({
      name: 'Narrative Insights',
      score: 0,
      maxScore: 100,
      evidence: 'Insights table not found',
      status: 'missing'
    });
  }

  // Criterion 4: Hypothesis formation
  if (tableExists(db, 'patterns')) {
    const patternsWithHypothesis = safeQuery<{ count: number }>(db,
      `SELECT COUNT(*) as count FROM patterns WHERE pattern_definition LIKE '%hypothesis%' OR pattern_definition LIKE '%because%' OR pattern_definition LIKE '%causes%'`,
      { count: 0 }
    );
    
    const score = patternsWithHypothesis.count >= 5 ? 100 : patternsWithHypothesis.count >= 2 ? 60 : patternsWithHypothesis.count >= 1 ? 30 : 0;
    
    criteria.push({
      name: 'Hypothesis Formation',
      score,
      maxScore: 100,
      evidence: `${patternsWithHypothesis.count} patterns include causal hypotheses`,
      status: score >= 80 ? 'met' : score >= 40 ? 'partial' : 'missing'
    });
    
    if (score < 80) {
      gaps.push('Patterns lack causal hypothesis explanations');
      recommendations.push('Add hypothesis field to patterns and generate causal reasoning');
    }
  } else {
    criteria.push({
      name: 'Hypothesis Formation',
      score: 0,
      maxScore: 100,
      evidence: 'Patterns table not found',
      status: 'missing'
    });
  }

  // Criterion 5: Self-understanding queries (API capability check - always missing for now)
  criteria.push({
    name: 'Self-Understanding Query API',
    score: 0,
    maxScore: 100,
    evidence: 'Not implemented yet',
    status: 'missing'
  });
  gaps.push('No natural language interface to ask "What do you know about X?"');
  recommendations.push('Implement selfUnderstanding.ts with /api/self-understanding endpoint');

  return calculatePillarScore('Self-Understanding Before Optimization', criteria, gaps, recommendations);
}

/**
 * Pillar 2: Memory Is a Living Model, Not a Log
 */
function evaluateLivingMemory(db: Database.Database | null): PillarScore {
  const criteria: CriterionScore[] = [];
  const gaps: string[] = [];
  const recommendations: string[] = [];

  if (!db) {
    return createMissingDbPillar('Memory Is a Living Model');
  }

  // Criterion 1: Pattern strength dynamics
  if (tableExists(db, 'patterns')) {
    const patternsWithStrength = safeQuery<{ count: number }>(db,
      `SELECT COUNT(*) as count FROM patterns WHERE strength IS NOT NULL`,
      { count: 0 }
    );
    const patternsWithValidation = safeQuery<{ count: number }>(db,
      `SELECT COUNT(*) as count FROM patterns WHERE last_validated_at IS NOT NULL`,
      { count: 0 }
    );
    const totalPatterns = safeQuery<{ count: number }>(db,
      `SELECT COUNT(*) as count FROM patterns`,
      { count: 0 }
    );
    
    const strengthRatio = totalPatterns.count > 0 ? patternsWithStrength.count / totalPatterns.count : 0;
    const validationRatio = totalPatterns.count > 0 ? patternsWithValidation.count / totalPatterns.count : 0;
    const score = totalPatterns.count > 0 ? Math.round(((strengthRatio + validationRatio) / 2) * 100) : 0;
    
    criteria.push({
      name: 'Pattern Strength Dynamics',
      score,
      maxScore: 100,
      evidence: `${patternsWithStrength.count} with strength, ${patternsWithValidation.count} validated of ${totalPatterns.count} total`,
      status: score >= 80 ? 'met' : score >= 40 ? 'partial' : 'missing'
    });
    
    if (score < 80) {
      gaps.push('Pattern strength not consistently tracked or validated');
    }
  } else {
    criteria.push({
      name: 'Pattern Strength Dynamics',
      score: 0,
      maxScore: 100,
      evidence: 'Patterns table not found',
      status: 'missing'
    });
  }

  // Criterion 2: Memory confidence decay
  if (tableExists(db, 'memory_notes')) {
    const memoriesWithConfidence = safeQuery<{ count: number }>(db,
      `SELECT COUNT(*) as count FROM memory_notes WHERE confidence_score IS NOT NULL AND is_active = 1`,
      { count: 0 }
    );
    const totalMemories = safeQuery<{ count: number }>(db,
      `SELECT COUNT(*) as count FROM memory_notes WHERE is_active = 1`,
      { count: 0 }
    );
    
    const ratio = totalMemories.count > 0 ? memoriesWithConfidence.count / totalMemories.count : 0;
    const score = totalMemories.count > 0 ? Math.round(ratio * 100) : 0;
    
    criteria.push({
      name: 'Memory Confidence Decay',
      score,
      maxScore: 100,
      evidence: `${memoriesWithConfidence.count}/${totalMemories.count} memories have confidence scores`,
      status: score >= 80 ? 'met' : score >= 40 ? 'partial' : 'missing'
    });
    
    if (score < 80) {
      gaps.push('Memory confidence not consistently tracked');
      recommendations.push('Ensure all memories have confidence scores that decay over time');
    }
  } else {
    criteria.push({
      name: 'Memory Confidence Decay',
      score: 0,
      maxScore: 100,
      evidence: 'Memory notes table not found',
      status: 'missing'
    });
  }

  // Criterion 3: Contradiction tracking
  if (tableExists(db, 'contradictions')) {
    const contradictions = safeQuery<{ count: number }>(db,
      `SELECT COUNT(*) as count FROM contradictions`,
      { count: 0 }
    );
    const score = contradictions.count >= 10 ? 100 : contradictions.count >= 5 ? 70 : contradictions.count >= 1 ? 40 : 20;
    
    criteria.push({
      name: 'Contradiction Tracking',
      score,
      maxScore: 100,
      evidence: `${contradictions.count} contradictions logged`,
      status: score >= 80 ? 'met' : score >= 40 ? 'partial' : 'missing'
    });
  } else if (tableExists(db, 'conversation_metrics')) {
    const metricsWithContradictions = safeQuery<{ count: number }>(db,
      `SELECT COUNT(*) as count FROM conversation_metrics WHERE memories_contradicted IS NOT NULL AND memories_contradicted != '[]'`,
      { count: 0 }
    );
    
    const score = metricsWithContradictions.count >= 5 ? 60 : metricsWithContradictions.count >= 1 ? 30 : 0;
    
    criteria.push({
      name: 'Contradiction Tracking',
      score,
      maxScore: 100,
      evidence: `Using conversation_metrics: ${metricsWithContradictions.count} contradictions noted`,
      status: score >= 80 ? 'met' : score >= 40 ? 'partial' : 'missing'
    });
    
    if (score < 80) {
      gaps.push('Dedicated contradiction tracking system missing');
      recommendations.push('Create contradictions table per ZEKE_ONTOLOGY.md');
    }
  } else {
    criteria.push({
      name: 'Contradiction Tracking',
      score: 0,
      maxScore: 100,
      evidence: 'No contradiction tracking found',
      status: 'missing'
    });
    gaps.push('Dedicated contradiction tracking system missing');
    recommendations.push('Create contradictions table per ZEKE_ONTOLOGY.md');
  }

  // Criterion 4: Surprise/anomaly detection
  if (tableExists(db, 'patterns')) {
    const anomalyPatterns = safeQuery<{ count: number }>(db,
      `SELECT COUNT(*) as count FROM patterns WHERE type = 'anomaly'`,
      { count: 0 }
    );
    
    const score = anomalyPatterns.count >= 5 ? 100 : anomalyPatterns.count >= 2 ? 60 : anomalyPatterns.count >= 1 ? 30 : 0;
    
    criteria.push({
      name: 'Surprise/Anomaly Detection',
      score,
      maxScore: 100,
      evidence: `${anomalyPatterns.count} anomaly patterns detected`,
      status: score >= 80 ? 'met' : score >= 40 ? 'partial' : 'missing'
    });
    
    if (score < 80) {
      gaps.push('Limited anomaly/surprise detection');
      recommendations.push('Enhance pattern detection to flag deviations from established patterns');
    }
  } else {
    criteria.push({
      name: 'Surprise/Anomaly Detection',
      score: 0,
      maxScore: 100,
      evidence: 'Patterns table not found',
      status: 'missing'
    });
  }

  // Criterion 5: Pattern decay mechanism
  if (tableExists(db, 'patterns')) {
    const supersededPatterns = safeQuery<{ count: number }>(db,
      `SELECT COUNT(*) as count FROM patterns WHERE is_superseded = 1`,
      { count: 0 }
    );
    const inactivePatterns = safeQuery<{ count: number }>(db,
      `SELECT COUNT(*) as count FROM patterns WHERE is_active = 0`,
      { count: 0 }
    );
    
    const hasDecayMechanism = supersededPatterns.count > 0 || inactivePatterns.count > 0;
    const score = hasDecayMechanism ? 70 : 0;
    
    criteria.push({
      name: 'Pattern Decay Mechanism',
      score,
      maxScore: 100,
      evidence: `${supersededPatterns.count} superseded, ${inactivePatterns.count} inactive patterns`,
      status: score >= 80 ? 'met' : score >= 40 ? 'partial' : 'missing'
    });
    
    if (score < 80) {
      gaps.push('Automatic pattern decay not fully implemented');
      recommendations.push('Add scheduled job to decay pattern strength over time');
    }
  } else {
    criteria.push({
      name: 'Pattern Decay Mechanism',
      score: 0,
      maxScore: 100,
      evidence: 'Patterns table not found',
      status: 'missing'
    });
  }

  return calculatePillarScore('Memory Is a Living Model', criteria, gaps, recommendations);
}

/**
 * Pillar 3: Autonomy Is Earned, Reversible, and Bounded
 */
function evaluateEarnedAutonomy(db: Database.Database | null): PillarScore {
  const criteria: CriterionScore[] = [];
  const gaps: string[] = [];
  const recommendations: string[] = [];

  if (!db) {
    return createMissingDbPillar('Autonomy Is Earned, Reversible, and Bounded');
  }

  // Criterion 1: Action logging with intent
  if (tableExists(db, 'anticipatory_actions')) {
    const actions = safeQuery<{ count: number }>(db,
      `SELECT COUNT(*) as count FROM anticipatory_actions`,
      { count: 0 }
    );
    const actionsWithDescription = safeQuery<{ count: number }>(db,
      `SELECT COUNT(*) as count FROM anticipatory_actions WHERE action_description IS NOT NULL AND action_description != ''`,
      { count: 0 }
    );
    
    const ratio = actions.count > 0 ? actionsWithDescription.count / actions.count : 0;
    const score = actions.count > 0 ? Math.round(ratio * 100) : 0;
    
    criteria.push({
      name: 'Action Logging with Intent',
      score,
      maxScore: 100,
      evidence: `${actionsWithDescription.count}/${actions.count} actions have descriptions`,
      status: score >= 80 ? 'met' : score >= 40 ? 'partial' : 'missing'
    });
    
    if (actions.count === 0) {
      gaps.push('No autonomous actions logged yet');
      recommendations.push('Implement action execution engine with logging');
    }
  } else {
    criteria.push({
      name: 'Action Logging with Intent',
      score: 0,
      maxScore: 100,
      evidence: 'Anticipatory actions table not found',
      status: 'missing'
    });
    gaps.push('Action logging system not implemented');
  }

  // Criterion 2: Rollback capability (always missing for now)
  criteria.push({
    name: 'Rollback Capability',
    score: 0,
    maxScore: 100,
    evidence: 'Not implemented yet',
    status: 'missing'
  });
  gaps.push('Actions cannot be rolled back');
  recommendations.push('Add rollback capability to action executor');

  // Criterion 3: Trust framework (always missing for now)
  if (tableExists(db, 'trust_settings')) {
    const trustSettings = safeQuery<{ count: number }>(db,
      `SELECT COUNT(*) as count FROM trust_settings`,
      { count: 0 }
    );
    const score = trustSettings.count >= 5 ? 100 : trustSettings.count >= 1 ? 60 : 20;
    
    criteria.push({
      name: 'Trust Framework',
      score,
      maxScore: 100,
      evidence: `${trustSettings.count} action types with trust levels`,
      status: score >= 80 ? 'met' : score >= 40 ? 'partial' : 'missing'
    });
  } else {
    criteria.push({
      name: 'Trust Framework',
      score: 0,
      maxScore: 100,
      evidence: 'Trust settings table not implemented',
      status: 'missing'
    });
    gaps.push('No trust framework for action types');
    recommendations.push('Create trust_settings table and trustManager.ts');
  }

  // Criterion 4: Feedback affects trust
  if (tableExists(db, 'prediction_feedback')) {
    const feedbackWithPatternUpdates = safeQuery<{ count: number }>(db,
      `SELECT COUNT(*) as count FROM prediction_feedback WHERE affected_pattern_ids IS NOT NULL AND affected_pattern_ids != '[]'`,
      { count: 0 }
    );
    const totalFeedback = safeQuery<{ count: number }>(db,
      `SELECT COUNT(*) as count FROM prediction_feedback`,
      { count: 0 }
    );
    
    const ratio = totalFeedback.count > 0 ? feedbackWithPatternUpdates.count / totalFeedback.count : 0;
    const score = totalFeedback.count > 0 ? Math.round(ratio * 100) : 0;
    
    criteria.push({
      name: 'Feedback Affects Trust',
      score: Math.max(score, totalFeedback.count > 0 ? 30 : 0),
      maxScore: 100,
      evidence: `${feedbackWithPatternUpdates.count}/${totalFeedback.count} feedback events updated patterns`,
      status: score >= 80 ? 'met' : score >= 40 ? 'partial' : 'missing'
    });
    
    if (score < 80) {
      gaps.push('Feedback not consistently updating trust levels');
      recommendations.push('Connect feedback loop to trust framework');
    }
  } else {
    criteria.push({
      name: 'Feedback Affects Trust',
      score: 0,
      maxScore: 100,
      evidence: 'Prediction feedback table not found',
      status: 'missing'
    });
  }

  // Criterion 5: User response tracking
  if (tableExists(db, 'anticipatory_actions')) {
    const actionsWithUserResponse = safeQuery<{ count: number }>(db,
      `SELECT COUNT(*) as count FROM anticipatory_actions WHERE user_responsed = 1`,
      { count: 0 }
    );
    const totalActions = safeQuery<{ count: number }>(db,
      `SELECT COUNT(*) as count FROM anticipatory_actions`,
      { count: 0 }
    );
    
    const score = totalActions.count > 0 && actionsWithUserResponse.count > 0 ? 70 : 0;
    
    criteria.push({
      name: 'User Response Tracking',
      score,
      maxScore: 100,
      evidence: `${actionsWithUserResponse.count}/${totalActions.count} actions have user responses`,
      status: score >= 80 ? 'met' : score >= 40 ? 'partial' : 'missing'
    });
    
    if (score < 80 && totalActions.count > 0) {
      gaps.push('User responses to actions not being captured');
      recommendations.push('Add UI for users to approve/decline/rate actions');
    }
  } else {
    criteria.push({
      name: 'User Response Tracking',
      score: 0,
      maxScore: 100,
      evidence: 'Anticipatory actions table not found',
      status: 'missing'
    });
  }

  return calculatePillarScore('Autonomy Is Earned, Reversible, and Bounded', criteria, gaps, recommendations);
}

function createMissingDbPillar(pillarName: string): PillarScore {
  return {
    pillar: pillarName,
    score: 0,
    maxScore: 100,
    criteria: [{
      name: 'Database Connection',
      score: 0,
      maxScore: 100,
      evidence: 'Database not accessible',
      status: 'missing'
    }],
    gaps: ['Database not accessible - evaluation cannot be performed'],
    recommendations: ['Ensure zeke.db exists and is accessible']
  };
}

function calculatePillarScore(
  pillarName: string, 
  criteria: CriterionScore[], 
  gaps: string[], 
  recommendations: string[]
): PillarScore {
  const totalScore = criteria.reduce((sum, c) => sum + c.score, 0);
  const maxScore = criteria.reduce((sum, c) => sum + c.maxScore, 0);
  const pillarScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

  return {
    pillar: pillarName,
    score: pillarScore,
    maxScore: 100,
    criteria,
    gaps,
    recommendations
  };
}

/**
 * Run the full ZEKE Ideal evaluation
 */
export function evaluateIdeal(): IdealEvaluation {
  const db = getDb();
  
  try {
    const pillars = [
      evaluateSelfUnderstanding(db),
      evaluateLivingMemory(db),
      evaluateEarnedAutonomy(db)
    ];

    const overallScore = Math.round(
      pillars.reduce((sum, p) => sum + p.score, 0) / pillars.length
    );

    const criticalGaps = pillars
      .flatMap(p => p.gaps)
      .filter(g => g.includes('not implemented') || g.includes('missing') || g.includes('not found'));

    const allRecommendations = pillars.flatMap(p => p.recommendations);
    const nextPriorities = [...new Set(allRecommendations)].slice(0, 5);

    let summary: string;
    if (overallScore >= 70) {
      summary = `ZEKE is well-aligned with its ideal (${overallScore}/100). Focus on refinement.`;
    } else if (overallScore >= 40) {
      summary = `ZEKE has foundational elements but significant gaps remain (${overallScore}/100). Priority: ${pillars.sort((a, b) => a.score - b.score)[0].pillar}`;
    } else {
      summary = `ZEKE is early in its journey toward the ideal (${overallScore}/100). Build core capabilities first.`;
    }

    return {
      overallScore,
      pillars,
      evaluatedAt: new Date().toISOString(),
      summary,
      criticalGaps,
      nextPriorities
    };
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}

/**
 * Get a quick summary suitable for display
 */
export function getEvaluationSummary(): {
  overall: number;
  selfUnderstanding: number;
  livingMemory: number;
  earnedAutonomy: number;
  topGap: string;
  topPriority: string;
} {
  const evaluation = evaluateIdeal();
  
  return {
    overall: evaluation.overallScore,
    selfUnderstanding: evaluation.pillars[0]?.score ?? 0,
    livingMemory: evaluation.pillars[1]?.score ?? 0,
    earnedAutonomy: evaluation.pillars[2]?.score ?? 0,
    topGap: evaluation.criticalGaps[0] || 'None identified',
    topPriority: evaluation.nextPriorities[0] || 'Continue current progress'
  };
}

export default {
  evaluateIdeal,
  getEvaluationSummary
};

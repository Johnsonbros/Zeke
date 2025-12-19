/**
 * Self Understanding Service V2
 * 
 * Query synthesis with mandatory citations.
 * The LLM never freewheels - it gets:
 * - Top correlations
 * - Top contradictions
 * - Exact evidence pointers (signal IDs)
 * - Strict answer template
 */

import OpenAI from "openai";
import { getFindings, type Finding } from "./findings";
import { querySignals, getDaysWithSignals } from "./signals";
import { evaluateSelfModel } from "./selfModelEvaluator";

const openai = new OpenAI();

export interface SelfUnderstandingQuery {
  question: string;
  subject?: string; // e.g., "energy", "mood"
  timeRangeDays?: number;
}

export interface SelfUnderstandingAnswer {
  answer: string;
  confidence: number;
  citations: Array<{
    findingId: string;
    kind: string;
    description: string;
    strength: number;
  }>;
  dataQuality: {
    grade: string;
    coverageDays: number;
    findingsUsed: number;
  };
  followUpQuestions: string[];
  generatedAt: string;
}

/**
 * Infer the subject from the question
 */
function inferSubject(question: string): string | undefined {
  const q = question.toLowerCase();
  if (q.includes("energy") || q.includes("tired") || q.includes("fatigue")) return "energy";
  if (q.includes("mood") || q.includes("happy") || q.includes("sad") || q.includes("anxious")) return "mood";
  if (q.includes("stress") || q.includes("overwhelm")) return "stress";
  if (q.includes("productiv") || q.includes("focus") || q.includes("work")) return "productivity";
  if (q.includes("sleep") || q.includes("rest")) return "sleep";
  return undefined;
}

/**
 * Build the prompt with findings and strict template
 */
function buildPrompt(
  question: string,
  findings: Finding[],
  modelHealth: ReturnType<typeof evaluateSelfModel>
): string {
  const findingsText = findings.length > 0
    ? findings.map((f, i) => {
        const stats = f.stats;
        const desc = f.kind === "correlation"
          ? `${f.subject} ${f.predicate} ${f.object} (r=${stats.r?.toFixed(2) || "?"}, n=${stats.n || "?"}, direction: ${stats.direction || "?"})`
          : `Expected: ${JSON.stringify(stats.expected)}, Observed: ${stats.observed}, Matched: ${stats.matched}`;
        return `[${i + 1}] ${f.kind.toUpperCase()}: ${desc} [ID: ${f.id.slice(0, 8)}]`;
      }).join("\n")
    : "No findings available yet.";
  
  const coverageText = `Data coverage: ${modelHealth.coverage.totalDays}/${modelHealth.coverage.targetDays} days, ` +
    `${modelHealth.findings.correlations} correlations, ${modelHealth.findings.contradictions} contradictions`;
  
  return `You are ZEKE's self-understanding module. Answer the user's question using ONLY the findings provided below.

RULES:
1. You MUST cite finding IDs for each claim (e.g., "[ID: a1b2c3d4]")
2. If evidence is weak (n < 30 or |r| < 0.3), say so explicitly
3. List any unresolved contradictions
4. If there's not enough data, be honest and suggest what data would help
5. Keep the answer concise and actionable

FINDINGS:
${findingsText}

DATA QUALITY:
${coverageText}
Model health: ${modelHealth.overall.grade} (${Math.round(modelHealth.overall.score * 100)}%)

USER QUESTION:
${question}

Answer:`;
}

/**
 * Answer a self-understanding question with citations
 */
export async function answerWithCitations(query: SelfUnderstandingQuery): Promise<SelfUnderstandingAnswer> {
  const subject = query.subject || inferSubject(query.question);
  const days = query.timeRangeDays || 30;
  
  // Get relevant findings
  const correlations = getFindings({
    kind: "correlation",
    subject,
    status: "active",
    minStrength: 0.1,
    limit: 10,
  });
  
  const contradictions = getFindings({
    kind: "contradiction",
    subject,
    status: "active",
    limit: 5,
  });
  
  const allFindings = [...correlations, ...contradictions]
    .sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength))
    .slice(0, 12);
  
  // Get model health
  const modelHealth = evaluateSelfModel(days);
  
  // Build citations list
  const citations = allFindings.map(f => ({
    findingId: f.id,
    kind: f.kind,
    description: `${f.subject} ${f.predicate} ${f.object}`,
    strength: f.strength,
  }));
  
  // Determine confidence based on data quality
  let confidence = modelHealth.overall.score;
  if (allFindings.length === 0) confidence = 0.1;
  else if (allFindings.length < 3) confidence = Math.min(confidence, 0.4);
  
  // Generate answer with AI
  let answer: string;
  
  if (allFindings.length === 0) {
    answer = `I don't have enough data yet to answer "${query.question}" with confidence. ` +
      `Currently, I have ${modelHealth.coverage.totalDays} days of data and no significant patterns discovered. ` +
      `To help me learn, try logging your daily energy and mood levels, or tell me about recent experiences.`;
  } else {
    const prompt = buildPrompt(query.question, allFindings, modelHealth);
    
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 600,
      });
      
      answer = response.choices[0]?.message?.content || "Unable to generate answer.";
    } catch (error) {
      console.error("[SelfUnderstandingV2] OpenAI error:", error);
      answer = `Based on the available findings, I can see patterns related to your question, ` +
        `but I encountered an error generating a detailed synthesis. The key findings are: ` +
        allFindings.slice(0, 3).map(f => `${f.subject} ${f.predicate} ${f.object}`).join("; ") + ".";
    }
  }
  
  // Generate follow-up questions
  const followUpQuestions = generateFollowUps(query.question, subject, allFindings);
  
  return {
    answer,
    confidence,
    citations,
    dataQuality: {
      grade: modelHealth.overall.grade,
      coverageDays: modelHealth.coverage.totalDays,
      findingsUsed: allFindings.length,
    },
    followUpQuestions,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate contextual follow-up questions
 */
function generateFollowUps(question: string, subject: string | undefined, findings: Finding[]): string[] {
  const questions: string[] = [];
  
  if (findings.length === 0) {
    questions.push("Would you like to start logging your daily energy and mood?");
    questions.push("What activities do you find energizing or draining?");
    return questions;
  }
  
  // Add subject-specific follow-ups
  if (subject === "energy") {
    questions.push("What time of day do you feel most energetic?");
    questions.push("How does your sleep affect your energy levels?");
  } else if (subject === "mood") {
    questions.push("Are there specific situations that consistently affect your mood?");
    questions.push("How do social interactions impact how you feel?");
  }
  
  // Add finding-based follow-ups
  const hasContradictions = findings.some(f => f.kind === "contradiction");
  if (hasContradictions) {
    questions.push("I noticed some contradictions - would you like to explore why predictions didn't match reality?");
  }
  
  const strongCorrelation = findings.find(f => f.kind === "correlation" && Math.abs(f.strength) > 0.5);
  if (strongCorrelation) {
    questions.push(`Would you like to know more about how ${strongCorrelation.object} affects your ${strongCorrelation.subject}?`);
  }
  
  return questions.slice(0, 4);
}

/**
 * Get quick insights without AI call (fast)
 */
export function getQuickInsights(subject?: string): {
  topCorrelation: { description: string; strength: number } | null;
  unresolvedContradictions: number;
  dataQuality: string;
} {
  const correlations = getFindings({
    kind: "correlation",
    subject,
    status: "active",
    minStrength: 0.25,
    limit: 1,
  });
  
  const contradictions = getFindings({
    kind: "contradiction",
    subject,
    status: "active",
  });
  
  const modelHealth = evaluateSelfModel(30);
  
  return {
    topCorrelation: correlations.length > 0
      ? {
          description: `${correlations[0].subject} ${correlations[0].predicate} ${correlations[0].object}`,
          strength: correlations[0].strength,
        }
      : null,
    unresolvedContradictions: contradictions.length,
    dataQuality: modelHealth.overall.grade,
  };
}

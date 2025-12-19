/**
 * Self-Understanding Query Service
 * 
 * Per ZEKE_IDEAL.md Pillar 1: "Help Nate understand himself through data analysis."
 * 
 * This service synthesizes information from multiple domains to answer
 * self-understanding questions like:
 * - "Why do I feel drained on Mondays?"
 * - "What patterns do I have around productivity?"
 * - "When am I most creative?"
 */

import Database from "better-sqlite3";
import path from "path";
import OpenAI from "openai";

const DB_PATH = path.join(process.cwd(), "zeke.db");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getDb(): Database.Database {
  return new Database(DB_PATH);
}

export interface SelfUnderstandingQuery {
  question: string;
  domains?: string[]; // Optional: limit to specific domains
  timeRange?: {
    startDate?: string;
    endDate?: string;
  };
}

export interface SelfUnderstandingAnswer {
  answer: string;
  confidence: number; // 0-1
  dataSources: DataSourceSummary[];
  patterns: PatternReference[];
  contradictions: ContradictionReference[];
  followUpQuestions: string[];
  generatedAt: string;
}

export interface DataSourceSummary {
  domain: string;
  dataPointCount: number;
  summary: string;
}

export interface PatternReference {
  patternId?: string;
  description: string;
  relevance: string;
}

export interface ContradictionReference {
  contradictionId: string;
  description: string;
  relevance: string;
}

/**
 * Gather context from multiple domains for answering a self-understanding question
 */
async function gatherContextForQuestion(
  db: Database.Database, 
  question: string,
  options?: {
    domains?: string[];
    timeRange?: { startDate?: string; endDate?: string };
  }
): Promise<{
  journalContext: any[];
  taskContext: any[];
  stressorContext: any[];
  patternContext: any[];
  correlationContext: any[];
  contradictionContext: any[];
  memoryContext: any[];
}> {
  // Calculate date range - default to 60 days if not specified
  let dateFilter = "date('now', '-60 days')";
  if (options?.timeRange?.startDate) {
    dateFilter = `'${options.timeRange.startDate}'`;
  }
  const endDateFilter = options?.timeRange?.endDate ? `'${options.timeRange.endDate}'` : "date('now')";
  
  // Determine which domains to query
  const allDomains = ["journal", "tasks", "stressors", "patterns", "correlations", "contradictions", "memory"];
  const requestedDomains = new Set(options?.domains?.length ? options.domains : allDomains);
  
  console.log(`[SelfUnderstanding] Gathering context for domains: ${Array.from(requestedDomains).join(", ")}`);
  console.log(`[SelfUnderstanding] Date range: ${dateFilter} to ${endDateFilter}`);
  
  // Journal entries (mood, energy, insights)
  let journalContext: any[] = [];
  if (requestedDomains.has("journal") || requestedDomains.has("energy") || requestedDomains.has("mood")) {
    try {
      journalContext = db.prepare(`
        SELECT date, mood, metrics, insights, summary, key_events 
        FROM journal_entries 
        WHERE date >= ${dateFilter} AND date <= ${endDateFilter}
        ORDER BY date DESC
        LIMIT 30
      `).all() as any[];
      console.log(`[SelfUnderstanding] Gathered ${journalContext.length} journal entries`);
    } catch (e) {
      console.warn("[SelfUnderstanding] Failed to get journal context:", e);
    }
  }
  
  // Task completion patterns
  let taskContext: any[] = [];
  if (requestedDomains.has("tasks")) {
    try {
      taskContext = db.prepare(`
        SELECT 
          strftime('%w', completed_at) as day_of_week,
          strftime('%H', completed_at) as hour,
          COUNT(*) as count,
          AVG(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completion_rate
        FROM tasks 
        WHERE completed_at IS NOT NULL 
          AND date(completed_at) >= ${dateFilter}
          AND date(completed_at) <= ${endDateFilter}
        GROUP BY day_of_week, hour
        ORDER BY count DESC
        LIMIT 20
      `).all() as any[];
      console.log(`[SelfUnderstanding] Gathered ${taskContext.length} task patterns`);
    } catch (e) {
      console.warn("[SelfUnderstanding] Failed to get task context:", e);
    }
  }
  
  // Stressors
  let stressorContext: any[] = [];
  if (requestedDomains.has("stressors")) {
    try {
      stressorContext = db.prepare(`
        SELECT name, type, severity, frequency, triggers, symptoms, coping_strategies, trigger_count
        FROM stressors 
        ORDER BY trigger_count DESC
        LIMIT 10
      `).all() as any[];
      console.log(`[SelfUnderstanding] Gathered ${stressorContext.length} stressors`);
    } catch (e) {
      console.warn("[SelfUnderstanding] Failed to get stressor context:", e);
    }
  }
  
  // Patterns from pattern detection
  let patternContext: any[] = [];
  if (requestedDomains.has("patterns")) {
    try {
      patternContext = db.prepare(`
        SELECT name, description, type, pattern_definition, frequency, strength 
        FROM patterns 
        WHERE is_active = 1
        ORDER BY strength DESC
        LIMIT 15
      `).all() as any[];
      console.log(`[SelfUnderstanding] Gathered ${patternContext.length} active patterns`);
    } catch (e) {
      console.warn("[SelfUnderstanding] Failed to get pattern context:", e);
    }
  }
  
  // Correlations
  let correlationContext: any[] = [];
  if (requestedDomains.has("correlations")) {
    try {
      correlationContext = db.prepare(`
        SELECT domain1, domain2, description, strength, hypothesis, actionable_insight
        FROM correlation_discoveries 
        WHERE ABS(strength) >= 0.3
        ORDER BY ABS(strength) DESC
        LIMIT 10
      `).all() as any[];
      console.log(`[SelfUnderstanding] Gathered ${correlationContext.length} correlations`);
    } catch (e) {
      console.warn("[SelfUnderstanding] Failed to get correlation context:", e);
    }
  }
  
  // Contradictions (unresolved)
  let contradictionContext: any[] = [];
  if (requestedDomains.has("contradictions")) {
    try {
      contradictionContext = db.prepare(`
        SELECT id, observation, expected, possible_reasons, resolution
        FROM contradictions 
        WHERE resolution = 'unexplained'
        ORDER BY created_at DESC
        LIMIT 10
      `).all() as any[];
      console.log(`[SelfUnderstanding] Gathered ${contradictionContext.length} contradictions`);
    } catch (e) {
      console.warn("[SelfUnderstanding] Failed to get contradiction context:", e);
    }
  }
  
  // Relevant memories (searching for relevant content)
  let memoryContext: any[] = [];
  if (requestedDomains.has("memory")) {
    try {
      const keywords = extractKeywords(question);
      if (keywords.length > 0) {
        const searchPattern = keywords.join("%") + "%";
        memoryContext = db.prepare(`
          SELECT content, category, created_at 
          FROM memory_notes 
          WHERE (content LIKE ? OR category LIKE ?)
            AND created_at >= ${dateFilter}
          ORDER BY created_at DESC
          LIMIT 10
        `).all(`%${searchPattern}%`, `%${searchPattern}%`) as any[];
      }
      console.log(`[SelfUnderstanding] Gathered ${memoryContext.length} relevant memories`);
    } catch (e) {
      console.warn("[SelfUnderstanding] Failed to get memory context:", e);
    }
  }
  
  return {
    journalContext,
    taskContext,
    stressorContext,
    patternContext,
    correlationContext,
    contradictionContext,
    memoryContext,
  };
}

/**
 * Extract keywords from a question for searching
 */
function extractKeywords(question: string): string[] {
  const stopWords = new Set([
    "i", "me", "my", "myself", "we", "our", "you", "your", "it", "its",
    "what", "why", "when", "how", "where", "who", "which",
    "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
    "a", "an", "the", "and", "or", "but", "if", "then", "so", "because",
    "about", "with", "from", "to", "for", "on", "at", "in", "of", "by",
    "feel", "always", "sometimes", "usually", "often", "never",
  ]);
  
  return question
    .toLowerCase()
    .replace(/[?.,!]/g, "")
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

/**
 * Generate data source summaries for transparency
 */
function generateDataSourceSummaries(context: Awaited<ReturnType<typeof gatherContextForQuestion>>): DataSourceSummary[] {
  const summaries: DataSourceSummary[] = [];
  
  if (context.journalContext.length > 0) {
    const moods = context.journalContext.filter(j => j.mood).map(j => j.mood);
    summaries.push({
      domain: "journal",
      dataPointCount: context.journalContext.length,
      summary: moods.length > 0 
        ? `${moods.length} mood entries, common moods: ${[...new Set(moods)].slice(0, 3).join(", ")}`
        : `${context.journalContext.length} daily entries`,
    });
  }
  
  if (context.taskContext.length > 0) {
    summaries.push({
      domain: "tasks",
      dataPointCount: context.taskContext.length,
      summary: `Task completion patterns across ${context.taskContext.length} time segments`,
    });
  }
  
  if (context.stressorContext.length > 0) {
    summaries.push({
      domain: "stressors",
      dataPointCount: context.stressorContext.length,
      summary: `${context.stressorContext.length} tracked stressors, top: ${context.stressorContext.slice(0, 2).map(s => s.name).join(", ")}`,
    });
  }
  
  if (context.patternContext.length > 0) {
    summaries.push({
      domain: "patterns",
      dataPointCount: context.patternContext.length,
      summary: `${context.patternContext.length} active behavioral patterns`,
    });
  }
  
  if (context.correlationContext.length > 0) {
    summaries.push({
      domain: "correlations",
      dataPointCount: context.correlationContext.length,
      summary: `${context.correlationContext.length} cross-domain correlations discovered`,
    });
  }
  
  if (context.contradictionContext.length > 0) {
    summaries.push({
      domain: "contradictions",
      dataPointCount: context.contradictionContext.length,
      summary: `${context.contradictionContext.length} unexplained contradictions to explore`,
    });
  }
  
  return summaries;
}

/**
 * Answer a self-understanding question using AI synthesis
 */
export async function answerSelfUnderstandingQuestion(
  query: SelfUnderstandingQuery
): Promise<SelfUnderstandingAnswer> {
  const db = getDb();
  
  try {
    // Gather context from all domains
    const context = await gatherContextForQuestion(db, query.question, {
      domains: query.domains,
      timeRange: query.timeRange,
    });
    
    // Generate data source summaries
    const dataSources = generateDataSourceSummaries(context);
    
    // Build prompt for AI synthesis
    const systemPrompt = `You are ZEKE, helping Nate understand himself through data analysis.
Your role is to synthesize insights from multiple data sources to answer self-understanding questions.

Guidelines:
- Be honest about data limitations (say "Based on the data available...")
- Highlight patterns and contradictions when relevant
- Suggest hypotheses, not certainties
- Recommend ways to gather more data if needed
- Be concise but thorough
- Don't make up data - only reference what's provided

Respond in JSON format:
{
  "answer": "Your synthesized answer to the question",
  "confidence": 0.0-1.0 (based on data availability),
  "patterns": [{"description": "pattern description", "relevance": "why it matters"}],
  "contradictions": [{"id": "if known", "description": "what contradicts", "relevance": "significance"}],
  "followUpQuestions": ["questions that would deepen understanding"]
}`;

    const userPrompt = `Question: ${query.question}

Available Data Context:

JOURNAL ENTRIES (mood, energy, daily summaries):
${JSON.stringify(context.journalContext.slice(0, 10), null, 2)}

TASK PATTERNS (completion patterns by day/time):
${JSON.stringify(context.taskContext, null, 2)}

KNOWN STRESSORS:
${JSON.stringify(context.stressorContext, null, 2)}

DETECTED PATTERNS:
${JSON.stringify(context.patternContext, null, 2)}

CORRELATIONS (cross-domain relationships):
${JSON.stringify(context.correlationContext, null, 2)}

UNRESOLVED CONTRADICTIONS:
${JSON.stringify(context.contradictionContext, null, 2)}

RELEVANT MEMORIES:
${JSON.stringify(context.memoryContext, null, 2)}

Based on this data, answer the self-understanding question. Be honest about what the data shows and what's uncertain.`;

    // Call OpenAI for synthesis
    let aiResponse: any;
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      });
      
      const content = completion.choices[0]?.message?.content || "{}";
      aiResponse = JSON.parse(content);
    } catch (e) {
      console.error("[SelfUnderstanding] AI synthesis failed:", e);
      aiResponse = {
        answer: "I don't have enough data yet to answer this question well. As you use ZEKE more, I'll build a better understanding of your patterns.",
        confidence: 0.1,
        patterns: [],
        contradictions: [],
        followUpQuestions: ["What aspects of this question matter most to you?"],
      };
    }
    
    // Extract pattern references
    const patterns: PatternReference[] = (aiResponse.patterns || []).map((p: any) => ({
      patternId: p.id || undefined,
      description: p.description || "",
      relevance: p.relevance || "",
    }));
    
    // Extract contradiction references
    const contradictions: ContradictionReference[] = (aiResponse.contradictions || []).map((c: any) => ({
      contradictionId: c.id || "",
      description: c.description || "",
      relevance: c.relevance || "",
    }));
    
    return {
      answer: aiResponse.answer || "Unable to generate answer",
      confidence: aiResponse.confidence || 0.5,
      dataSources,
      patterns,
      contradictions,
      followUpQuestions: aiResponse.followUpQuestions || [],
      generatedAt: new Date().toISOString(),
    };
  } finally {
    db.close();
  }
}

/**
 * Get quick insights about a specific domain
 */
export async function getDomainInsight(domain: string): Promise<{
  domain: string;
  summary: string;
  dataPoints: number;
  trends: string[];
}> {
  const db = getDb();
  
  try {
    let summary = "";
    let dataPoints = 0;
    const trends: string[] = [];
    
    switch (domain) {
      case "energy":
        try {
          const energyData = db.prepare(`
            SELECT metrics FROM journal_entries 
            WHERE metrics IS NOT NULL
            ORDER BY date DESC
            LIMIT 30
          `).all() as any[];
          
          const energyValues: number[] = [];
          for (const row of energyData) {
            try {
              const metrics = JSON.parse(row.metrics);
              if (metrics.energy !== undefined) energyValues.push(metrics.energy);
            } catch {}
          }
          
          dataPoints = energyValues.length;
          if (energyValues.length > 0) {
            const avg = energyValues.reduce((a, b) => a + b, 0) / energyValues.length;
            summary = `Average energy level: ${avg.toFixed(1)}/10 over ${dataPoints} days`;
            
            // Check trend
            if (energyValues.length >= 7) {
              const recent = energyValues.slice(0, 7).reduce((a, b) => a + b, 0) / 7;
              const older = energyValues.slice(7, 14).reduce((a, b) => a + b, 0) / Math.min(7, energyValues.length - 7);
              if (recent > older + 0.5) trends.push("Energy trending upward");
              else if (recent < older - 0.5) trends.push("Energy trending downward");
            }
          } else {
            summary = "No energy data recorded yet";
          }
        } catch {}
        break;
        
      case "mood":
        try {
          const moodData = db.prepare(`
            SELECT mood, COUNT(*) as count FROM journal_entries 
            WHERE mood IS NOT NULL
            GROUP BY mood
            ORDER BY count DESC
          `).all() as any[];
          
          dataPoints = moodData.reduce((sum, m) => sum + m.count, 0);
          if (moodData.length > 0) {
            summary = `Most common moods: ${moodData.slice(0, 3).map(m => m.mood).join(", ")}`;
          } else {
            summary = "No mood data recorded yet";
          }
        } catch {}
        break;
        
      case "stressors":
        try {
          const stressors = db.prepare(`
            SELECT name, severity, trigger_count FROM stressors
            ORDER BY trigger_count DESC
            LIMIT 5
          `).all() as any[];
          
          dataPoints = stressors.length;
          if (stressors.length > 0) {
            summary = `Top stressors: ${stressors.slice(0, 3).map(s => s.name).join(", ")}`;
            trends.push(`${stressors.reduce((sum, s) => sum + (s.trigger_count || 0), 0)} total triggers recorded`);
          } else {
            summary = "No stressors tracked yet";
          }
        } catch {}
        break;
        
      default:
        summary = `No insight available for domain: ${domain}`;
    }
    
    return { domain, summary, dataPoints, trends };
  } finally {
    db.close();
  }
}

/**
 * Get available domains for self-understanding queries
 */
export function getAvailableDomains(): string[] {
  return [
    "energy",
    "mood",
    "tasks",
    "stressors",
    "location",
    "calendar",
    "food",
    "social",
    "sleep",
  ];
}

export default {
  answerSelfUnderstandingQuestion,
  getDomainInsight,
  getAvailableDomains,
};

# Project Plan: Memory Synthesis
## Discovering Patterns and Generating Insights from Nate's Life

### Vision

ZEKE doesn't just retrieve memories - he synthesizes understanding across all of Nate's data to discover patterns, generate insights, and help Nate understand himself better. This is the difference between "search" and "wisdom."

---

## Current State (What ZEKE Has Now)

### Existing Components

| Component | Location | What It Does |
|-----------|----------|--------------|
| `patternRecognition.ts` | `server/` | Analyzes tasks, calendar, location, grocery, conversations for temporal and behavioral patterns |
| `patternDetection.ts` | `server/jobs/` | Detects recurring topics, missed commitments, relationship patterns |
| `insightsGenerator.ts` | `server/` | Generates insights about task health, memory hygiene, calendar conflicts, cross-domain connections |
| `anticipationEngine.ts` | `server/jobs/` | Morning briefings with urgent items and people to follow up |

### Current Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     DATA SOURCES                             │
├──────────┬──────────┬──────────┬──────────┬────────────────┤
│  Tasks   │ Calendar │ Location │ Grocery  │ Omi Memories   │
└────┬─────┴────┬─────┴────┬─────┴────┬─────┴───────┬────────┘
     │          │          │          │             │
     ▼          ▼          ▼          ▼             ▼
┌─────────────────────────────────────────────────────────────┐
│              patternRecognition.ts                          │
│  • analyzeTaskPatterns() - peak hours, day preferences      │
│  • analyzeCalendarPatterns() - meeting times, durations     │
│  • analyzeLocationPatterns() - routine locations            │
│  • analyzeGroceryPatterns() - frequent purchases            │
│  • analyzeConversationPatterns() - conversation timing      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              patterns table (SQLite)                        │
│  type, name, description, patternDefinition, strength       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              insightsGenerator.ts                           │
│  • detectTaskInsights() - overdue, clusters, trends         │
│  • detectMemoryInsights() - low confidence, stale           │
│  • detectCalendarInsights() - busy days, conflicts          │
│  • detectCrossDomainInsights() - entity connections         │
└─────────────────────────────────────────────────────────────┘
```

### Current Capabilities

**Pattern Recognition:**
```typescript
// From patternRecognition.ts
{
  type: "temporal",
  name: "Peak Productivity Hours",
  description: "Tasks are most frequently completed during hours: 9, 10, 14",
  strength: "0.73",
  dataSource: "tasks"
}
```

**Insight Generation:**
```typescript
// From insightsGenerator.ts
{
  type: "task_overdue",
  title: "Overdue: Review quarterly report",
  content: "Task is 3 days overdue",
  priority: "high",
  suggestedAction: "Review and reschedule or complete this task"
}
```

---

## What's Missing (The Gap)

### 1. Cross-Domain Correlation

**Current:** Each analyzer works within its own domain (tasks find task patterns, calendar finds calendar patterns).

**Missing:** Connecting patterns ACROSS domains to find causation.

| Current Output | Missing Correlation |
|----------------|---------------------|
| "You exercise on Tuesday mornings" | "On days you exercise before 9am, your task completion rate is 40% higher" |
| "You sleep 7.2 hours on average" | "When you skip exercise, your sleep drops by 45 minutes on average" |
| "You grocery shop on Sundays" | "You eat out more during high-stress work weeks" |

### 2. Causal Hypothesis Generation

**Current:** Detects WHAT patterns exist.

**Missing:** Explains WHY patterns exist and tests hypotheses.

```
Current: "You tend to cancel plans on Wednesdays"
Missing: "Hypothesis: Wednesday cancellations correlate with high meeting 
         density on Tuesdays (evidence: 8/10 cancellations followed 4+ 
         meeting days)"
```

### 3. Life Insights vs. Alerts

**Current:** Generates actionable alerts ("You have 3 overdue tasks").

**Missing:** Generates wisdom ("You've been more stressed lately - here's what the data shows and what helped last time").

### 4. Self-Understanding Interface

**Current:** No way to ask "What do you know about X?"

**Missing:** Natural language queries about life patterns with narrative answers.

---

## Implementation Plan

### Phase 1: Correlation Engine (Build on Existing)

**Extend `patternRecognition.ts`:**

```typescript
// NEW: Add to patternRecognition.ts

interface CrossDomainCorrelation {
  domainA: string;
  domainB: string;
  patternA: string;
  patternB: string;
  correlationStrength: number; // -1 to 1
  direction: 'positive' | 'negative';
  sampleSize: number;
  hypothesis: string;
  evidence: string[];
}

export async function findCrossDomainCorrelations(): Promise<CrossDomainCorrelation[]> {
  const correlations: CrossDomainCorrelation[] = [];
  
  // Get time-series data from multiple domains
  const exerciseData = await getExerciseTimeSeries(90); // days
  const sleepData = await getSleepTimeSeries(90);
  const productivityData = await getProductivityTimeSeries(90);
  const moodData = await getMoodTimeSeries(90);
  
  // Calculate correlations between pairs
  const pairs = [
    { a: exerciseData, b: productivityData, nameA: 'exercise', nameB: 'productivity' },
    { a: exerciseData, b: sleepData, nameA: 'exercise', nameB: 'sleep' },
    { a: sleepData, b: moodData, nameA: 'sleep', nameB: 'mood' },
    // ... more pairs
  ];
  
  for (const pair of pairs) {
    const correlation = calculateCorrelation(pair.a, pair.b);
    if (Math.abs(correlation) > 0.3) { // Meaningful correlation threshold
      correlations.push({
        domainA: pair.nameA,
        domainB: pair.nameB,
        correlationStrength: correlation,
        direction: correlation > 0 ? 'positive' : 'negative',
        sampleSize: Math.min(pair.a.length, pair.b.length),
        hypothesis: generateHypothesis(pair.nameA, pair.nameB, correlation),
        evidence: gatherEvidence(pair.a, pair.b, correlation)
      });
    }
  }
  
  return correlations;
}
```

**Add to database schema (`shared/schema.ts`):**

```typescript
export const correlations = sqliteTable("correlations", {
  id: text("id").primaryKey(),
  domainA: text("domain_a").notNull(),
  domainB: text("domain_b").notNull(),
  correlationStrength: real("correlation_strength").notNull(),
  direction: text("direction").notNull(),
  hypothesis: text("hypothesis"),
  evidence: text("evidence"), // JSON array
  sampleSize: integer("sample_size"),
  discoveredAt: text("discovered_at").notNull(),
  lastConfirmedAt: text("last_confirmed_at"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
});
```

### Phase 2: Insight Synthesis (Extend Existing)

**Extend `insightsGenerator.ts`:**

```typescript
// NEW: Add to insightsGenerator.ts

export function detectCorrelationInsights(): DetectorResult {
  const insights: InsertInsight[] = [];
  
  // Get correlations with high confidence
  const correlations = getActiveCorrelations();
  
  for (const corr of correlations) {
    if (corr.correlationStrength > 0.5 && corr.sampleSize > 20) {
      const sourceId = `correlation:${corr.domainA}:${corr.domainB}`;
      
      if (insightExistsForSource("correlation_discovery", sourceId)) continue;
      
      insights.push({
        type: "correlation_discovery",
        category: "life_pattern",
        title: generateCorrelationTitle(corr),
        content: generateCorrelationExplanation(corr),
        priority: corr.correlationStrength > 0.7 ? "high" : "medium",
        confidence: String(corr.correlationStrength),
        suggestedAction: generateCorrelationAction(corr),
        sourceEntityId: sourceId,
      });
    }
  }
  
  return { insights, skipped: 0 };
}

function generateCorrelationExplanation(corr: CrossDomainCorrelation): string {
  const direction = corr.direction === 'positive' ? 'increases with' : 'decreases when';
  return `I've noticed your ${corr.domainB} ${direction} ${corr.domainA}. ` +
         `Based on ${corr.sampleSize} data points: ${corr.hypothesis}. ` +
         `Evidence: ${corr.evidence.slice(0, 2).join('; ')}`;
}
```

### Phase 3: Self-Understanding API (New Capability)

**Create `server/selfUnderstanding.ts`:**

```typescript
// NEW FILE: server/selfUnderstanding.ts

import OpenAI from "openai";
import { getActivePatterns, getActiveCorrelations } from "./db";
import { getRecentMemories } from "./omi";
import { getAllContacts } from "./db";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface SelfUnderstandingQuery {
  question: string;
  context?: string;
}

export interface SelfUnderstandingResponse {
  answer: string;
  supportingData: any[];
  confidence: number;
  relatedPatterns: string[];
}

export async function answerSelfUnderstandingQuery(
  query: SelfUnderstandingQuery
): Promise<SelfUnderstandingResponse> {
  // Gather all relevant data
  const [patterns, correlations, memories, contacts] = await Promise.all([
    getActivePatterns(),
    getActiveCorrelations(),
    getRecentMemories(168), // Last week
    getAllContacts(),
  ]);
  
  // Detect query type
  const queryType = classifyQuery(query.question);
  
  // Build context based on query type
  let relevantData;
  switch (queryType) {
    case 'relationship':
      relevantData = gatherRelationshipData(query.question, memories, contacts);
      break;
    case 'pattern':
      relevantData = gatherPatternData(query.question, patterns, correlations);
      break;
    case 'trend':
      relevantData = gatherTrendData(query.question, patterns, memories);
      break;
    default:
      relevantData = { patterns, correlations, memories: memories.slice(0, 20) };
  }
  
  // Generate narrative answer using LLM
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are ZEKE, helping Nate understand himself through his data.
        Answer questions about his patterns, relationships, and life trends.
        Be specific with data. Use numbers when available. Be warm but factual.`
      },
      {
        role: "user",
        content: `Question: ${query.question}
        
Available data:
${JSON.stringify(relevantData, null, 2)}

Generate a thoughtful, data-backed response.`
      }
    ],
    temperature: 0.7,
    max_tokens: 800,
  });
  
  return {
    answer: response.choices[0]?.message?.content || "I don't have enough data yet.",
    supportingData: relevantData,
    confidence: calculateConfidence(relevantData),
    relatedPatterns: extractRelatedPatterns(patterns, query.question),
  };
}

// Example queries this enables:
// "What do you know about my relationship with Jake?"
// "What are my patterns around exercise?"
// "How have I changed in the last 6 months?"
// "What affects my productivity the most?"
// "When am I happiest?"
```

**Add API route (`server/routes.ts`):**

```typescript
// Add to routes.ts

app.post("/api/self-understanding", async (req, res) => {
  try {
    const { question, context } = req.body;
    const response = await answerSelfUnderstandingQuery({ question, context });
    res.json(response);
  } catch (error) {
    console.error("Self-understanding query failed:", error);
    res.status(500).json({ error: "Failed to process query" });
  }
});
```

### Phase 4: Proactive Insight Delivery (Extend Existing)

**Extend `anticipationEngine.ts`:**

```typescript
// Add to anticipationEngine.ts

interface LifeInsight {
  type: 'correlation' | 'trend' | 'anomaly' | 'milestone';
  title: string;
  narrative: string;
  actionable: boolean;
  suggestedAction?: string;
}

async function generateLifeInsights(): Promise<LifeInsight[]> {
  const insights: LifeInsight[] = [];
  
  // Check for new correlations worth sharing
  const newCorrelations = await getUnsharedCorrelations();
  for (const corr of newCorrelations) {
    if (shouldShareCorrelation(corr)) {
      insights.push({
        type: 'correlation',
        title: `Pattern discovered: ${corr.domainA} affects ${corr.domainB}`,
        narrative: generateCorrelationNarrative(corr),
        actionable: true,
        suggestedAction: generateCorrelationAction(corr)
      });
    }
  }
  
  // Check for significant trends
  const trends = await detectSignificantTrends();
  for (const trend of trends) {
    insights.push({
      type: 'trend',
      title: `${trend.direction} trend in ${trend.domain}`,
      narrative: trend.explanation,
      actionable: trend.isActionable,
      suggestedAction: trend.suggestedAction
    });
  }
  
  return insights;
}

// Integrate into morning briefing
export async function generateMorningBriefing(): Promise<MorningBriefing> {
  // ... existing code ...
  
  // NEW: Add life insights
  const lifeInsights = await generateLifeInsights();
  
  return {
    // ... existing fields ...
    lifeInsights, // NEW
  };
}
```

---

## Concrete Examples

### Before (Current)

```
Nate: "When did I last talk to Mom?"
ZEKE: "You called her on December 5th."
```

### After (With Memory Synthesis)

```
Nate: "When did I last talk to Mom?"
ZEKE: "December 5th - about two weeks ago. That's a bit longer than 
your usual pattern of calling every 10 days. Interestingly, you tend 
to call more often during stressful work periods, maybe as a comfort 
thing. Want me to remind you to call this weekend?"
```

### Before (Current)

```
Morning Briefing:
- 3 tasks due today
- 2 meetings scheduled
- 1 overdue commitment
```

### After (With Memory Synthesis)

```
Morning Briefing:
...
INSIGHT: I noticed something this week - your productivity has been 
40% higher on days you exercised before 9am. You haven't exercised 
yet today, but you have a light morning. Might be worth a quick 
workout before your 10am meeting.
```

---

## Files to Modify/Create

| File | Action | Changes |
|------|--------|---------|
| `shared/schema.ts` | Modify | Add `correlations` table |
| `server/patternRecognition.ts` | Modify | Add `findCrossDomainCorrelations()` |
| `server/insightsGenerator.ts` | Modify | Add `detectCorrelationInsights()` |
| `server/selfUnderstanding.ts` | Create | New file for self-understanding queries |
| `server/routes.ts` | Modify | Add `/api/self-understanding` endpoint |
| `server/jobs/anticipationEngine.ts` | Modify | Add `generateLifeInsights()` |
| `server/db.ts` | Modify | Add correlation CRUD functions |

---

## Success Metrics

| Metric | How to Measure |
|--------|----------------|
| Correlation accuracy | Manual review of discovered correlations |
| Insight engagement | User asks follow-up questions after insights |
| Self-understanding usage | Queries to `/api/self-understanding` endpoint |
| Narrative quality | User feedback on insight explanations |
| Pattern accuracy | Track pattern predictions vs. actual outcomes |

---

## Summary

The current system is a solid foundation with pattern detection across multiple domains. The enhancement path is:

1. **Connect the dots** - Add cross-domain correlation engine
2. **Explain the why** - Generate causal hypotheses with evidence
3. **Enable self-discovery** - Build query interface for life understanding
4. **Proactively share wisdom** - Integrate insights into daily briefings

This transforms ZEKE from a pattern detector into a wisdom engine.

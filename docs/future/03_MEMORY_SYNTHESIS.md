# Project Plan: Memory Synthesis
## Discovering Patterns and Generating Insights from Nate's Life

### Vision

ZEKE doesn't just retrieve memories - he synthesizes understanding across all of Nate's data to discover patterns, generate insights, and help Nate understand himself better. This is the difference between "search" and "wisdom."

---

## The Difference

### Current State: Memory Retrieval
```
Nate: "When did I last talk to Mom?"
ZEKE: "You called her on December 5th."
```

### With Memory Synthesis: Pattern Discovery
```
Nate: "When did I last talk to Mom?"
ZEKE: "December 5th - about two weeks ago. That's a bit longer than 
your usual pattern of calling every 10 days. Interestingly, you tend 
to call more often during stressful work periods, maybe as a 
comfort thing. Want me to remind you to call this weekend?"
```

---

## Core Capabilities

### 1. Pattern Detection

Discover recurring patterns across:
- **Behavioral:** What does Nate do regularly? When do habits break?
- **Emotional:** What triggers good/bad moods? What helps?
- **Social:** Who does Nate reach out to when? Why?
- **Productivity:** When is Nate most effective? What blocks him?
- **Health:** Sleep, exercise, energy patterns and correlations

### 2. Correlation Discovery

Find non-obvious connections:
- "You tend to sleep worse after evening screen time"
- "Your productivity spikes on days you exercise in the morning"
- "You're more likely to cancel plans when work stress is high"
- "You eat out more when you're stressed"

### 3. Trend Analysis

Track changes over time:
- "You've been exercising more consistently this quarter vs last"
- "Your relationship with Sarah has strengthened - you talk twice as often"
- "You're spending less on dining out compared to 6 months ago"
- "Your mood seems generally better this month"

### 4. Insight Generation

Proactively share discoveries:
- "I noticed something interesting..."
- "Here's a pattern I've been tracking..."
- "Want to hear what I've learned about your [productivity/sleep/etc]?"

### 5. Self-Understanding Tools

Help Nate reflect:
- "What does ZEKE know about my relationship with [person]?"
- "What are my patterns around [topic]?"
- "What have I been thinking about lately?"
- "How have I changed in the last year?"

---

## Implementation Phases

### Phase 1: Pattern Detection Engine (Months 1-2)

**Goal:** Automatically detect patterns in Nate's data.

**Tasks:**
1. Build pattern detection algorithms for different data types
2. Create pattern storage and confidence scoring
3. Implement basic pattern queries
4. Build pattern notification system (share discoveries appropriately)
5. Create pattern dashboards for visualization

**Patterns to detect:**
- Time-based routines (daily, weekly, monthly, seasonal)
- Event correlations (X tends to happen after Y)
- Trend lines (increasing/decreasing over time)
- Anomalies (breaks from normal patterns)

**Deliverable:** ZEKE notices patterns without being asked.

### Phase 2: Correlation Discovery (Months 2-3)

**Goal:** Find meaningful connections between different life areas.

**Tasks:**
1. Build multi-domain correlation analysis
2. Create causal hypothesis generation
3. Implement significance testing (avoid spurious correlations)
4. Build "insight cards" summarizing discoveries
5. Create "why" analysis for patterns

**Example correlations:**
- Sleep quality ↔ next-day mood
- Exercise ↔ productivity
- Social contact ↔ reported happiness
- Work stress ↔ eating habits

**Deliverable:** ZEKE explains *why* patterns exist.

### Phase 3: Insight Delivery (Months 3-4)

**Goal:** Share insights at the right time in the right way.

**Tasks:**
1. Build insight timing system (when to share)
2. Create insight relevance scoring
3. Implement natural insertion into conversation
4. Build weekly/monthly synthesis reports
5. Create "insight memory" (don't repeat old insights)

**Delivery modes:**
- Spontaneous: "By the way, I noticed..."
- Contextual: "This is relevant because..."
- Requested: "Tell me about my patterns with..."
- Scheduled: Weekly insight digest

**Deliverable:** Insights feel helpful, not intrusive.

### Phase 4: Self-Understanding Interface (Months 4-6)

**Goal:** Nate can explore and understand his own patterns.

**Tasks:**
1. Build "ask about myself" query interface
2. Create pattern visualization dashboard
3. Implement comparative analysis ("me now vs 6 months ago")
4. Build life timeline with pattern overlays
5. Create "ZEKE's observations" summary page

**Deliverable:** Nate gains self-knowledge through ZEKE.

---

## Concrete Examples

### Example 1: Spontaneous Insight

```
[After a productive week]
ZEKE: "Hey, interesting pattern: you've had 3 really productive days 
this week, and they all had something in common - you exercised 
before 9am. On days you exercise later or skip, your focus rating 
drops by about 30%. Might be worth keeping the morning routine."
```

### Example 2: Contextual Insight

```
Nate: "Why am I so tired today?"
ZEKE: "Looking at the data: you went to bed at 1:30am (2 hours 
later than your average), had screen time until 1:15am (you usually 
stop 30 min before bed), and didn't exercise yesterday. Any one of 
those correlates with lower next-day energy for you. All three 
together? That's your tiredness explained."
```

### Example 3: Life Understanding Query

```
Nate: "What do you know about my friendship with Jake?"
ZEKE: "You've known Jake for about 3 years. You text regularly - 
about every 4-5 days on average. You tend to hang out in person 
once every 2-3 weeks, usually for dinner or drinks. Your mood 
in conversations with him is consistently positive - he's one of 
the people you seem most relaxed with. You've mentioned him in 
12 memories, mostly around shared experiences and advice he's given. 
Want more detail on any of that?"
```

### Example 4: Trend Report

```
[Monthly synthesis]
ZEKE: "Quick look at December so far:

Sleep: Averaging 6.8 hours (down from 7.2 in November)
Exercise: 8 sessions (on track to beat last month's 10)
Social: More family contact, less friend contact than usual
Work: Stress mentions up 40%, likely holiday deadline related
Mood: Slightly lower than your baseline, correlates with sleep

The main lever I'd suggest: prioritizing sleep. When you get 7+ 
hours, your next-day mood rating is 35% higher on average.

Want to dig into any of these?"
```

### Example 5: Year in Review

```
Nate: "How have I changed this year?"
ZEKE: "Big picture on 2024:

Growth: You took on 3 major new responsibilities at work and 
handled them well. Your confidence in professional conversations 
has visibly increased.

Relationships: You got closer to Sarah and Jake, more distant 
from the college friend group. Family contact stayed consistent.

Health: Exercise is up 20% vs last year. Sleep is slightly down. 
You've mentioned feeling more energetic overall.

Challenges: March and August were tough months - work stress 
peaked both times. You handled them better in August, suggesting 
you're building resilience.

Goals: You hit 4 of 6 new year goals, missed the reading goal 
and the savings goal.

If I had to summarize: 2024 was a year of professional growth 
and relationship deepening, with some health trade-offs. 
Sound accurate?"
```

---

## Technical Architecture

### Pattern Detection System

```typescript
interface Pattern {
  id: string;
  type: PatternType; // routine, correlation, trend, anomaly
  
  description: string; // human-readable summary
  data: PatternData; // underlying evidence
  
  confidence: number; // 0-1
  significance: number; // how meaningful is this?
  
  discovered: Date;
  lastConfirmed: Date;
  occurrences: number;
  
  insightGenerated: boolean;
  insightDelivered: boolean;
}

type PatternType = 
  | 'routine'      // Regular behavior at specific times
  | 'correlation'  // X tends to happen with Y
  | 'trend'        // Increasing/decreasing over time
  | 'anomaly'      // Deviation from normal
  | 'cycle'        // Recurring but not time-fixed
  | 'trigger';     // X causes Y
```

### Correlation Engine

```typescript
async function findCorrelations(
  timeWindow: DateRange,
  domains: string[] = ['all']
): Promise<Correlation[]> {
  // 1. Gather time-series data from all domains
  const data = await gatherDomainData(timeWindow, domains);
  
  // 2. Normalize and align time series
  const aligned = alignTimeSeries(data);
  
  // 3. Calculate correlations between all pairs
  const rawCorrelations = calculateAllCorrelations(aligned);
  
  // 4. Filter for significance
  const significant = filterBySignificance(rawCorrelations, 0.05);
  
  // 5. Filter for minimum correlation strength
  const meaningful = filterByStrength(significant, 0.3);
  
  // 6. Generate human explanations
  const explained = await generateExplanations(meaningful);
  
  return explained;
}
```

### Insight Delivery System

```typescript
async function shouldDeliverInsight(
  insight: Insight,
  context: ConversationContext
): Promise<DeliveryDecision> {
  // Don't repeat recent insights
  if (await wasRecentlyDelivered(insight)) {
    return { deliver: false, reason: 'too_recent' };
  }
  
  // Check if contextually relevant
  const relevance = await checkRelevance(insight, context);
  if (relevance < 0.5) {
    return { deliver: false, reason: 'not_relevant_now' };
  }
  
  // Check emotional appropriateness
  const mood = await getCurrentMood();
  if (mood.isNegative && !insight.isPositive) {
    return { deliver: false, reason: 'bad_timing' };
  }
  
  // Check insight quota (don't overwhelm)
  const recentInsights = await getRecentInsightCount();
  if (recentInsights > 2) {
    return { deliver: false, reason: 'too_many_today' };
  }
  
  return { 
    deliver: true, 
    style: determineDeliveryStyle(context, insight)
  };
}
```

### Database Schema

```sql
-- Detected patterns
CREATE TABLE patterns (
  id TEXT PRIMARY KEY,
  pattern_type TEXT NOT NULL,
  description TEXT NOT NULL,
  data JSON NOT NULL,
  
  confidence REAL NOT NULL,
  significance REAL NOT NULL,
  
  discovered_at TIMESTAMP NOT NULL,
  last_confirmed TIMESTAMP,
  occurrences INTEGER DEFAULT 1,
  
  active BOOLEAN DEFAULT TRUE
);

-- Correlations discovered
CREATE TABLE correlations (
  id TEXT PRIMARY KEY,
  domain_a TEXT NOT NULL,
  domain_b TEXT NOT NULL,
  correlation_strength REAL NOT NULL,
  direction TEXT, -- positive, negative
  
  hypothesis TEXT, -- why might this exist?
  confidence REAL,
  
  discovered_at TIMESTAMP,
  sample_size INTEGER
);

-- Insights generated and delivery tracking
CREATE TABLE insights (
  id TEXT PRIMARY KEY,
  source_pattern_id TEXT REFERENCES patterns(id),
  
  content TEXT NOT NULL,
  insight_type TEXT, -- observation, suggestion, correlation
  
  created_at TIMESTAMP,
  delivered_at TIMESTAMP,
  delivery_context TEXT,
  
  reception TEXT, -- positive, neutral, negative, unknown
  
  expires_at TIMESTAMP -- some insights become stale
);

-- Life metrics for trend tracking
CREATE TABLE life_metrics (
  id TEXT PRIMARY KEY,
  metric_name TEXT NOT NULL,
  metric_value REAL NOT NULL,
  recorded_at TIMESTAMP NOT NULL,
  
  source TEXT, -- where did this data come from?
  confidence REAL
);
```

---

## Dependencies

- **Existing:** Memory system, conversation history, entity extraction
- **Recommended:** World Model (provides structure for patterns)
- **Recommended:** Emotional Continuity (mood data for correlations)
- **External:** None required

## Challenges

1. **Spurious Correlations:** Must avoid "ice cream causes drowning" patterns
2. **Privacy:** Some patterns might be uncomfortable to surface
3. **Timing:** Insights must come at appropriate moments
4. **Accuracy:** Wrong insights damage trust
5. **Actionability:** Insights should help, not just observe

## Success Metrics

- User engages with insights (asks follow-ups)
- User mentions self-understanding gained from ZEKE
- Patterns influence actual behavior change
- User explicitly requests pattern analysis
- Accuracy of predictions based on patterns

---

## Summary

Memory Synthesis transforms ZEKE's memory from a filing cabinet into a wisdom engine. Instead of just answering "what happened," ZEKE can answer "why does this keep happening," "what should I do differently," and "how have I changed." This is one of the most powerful ways an AI assistant can provide value - helping someone understand themselves.

**Priority:** HIGH - This differentiates ZEKE from every other assistant.

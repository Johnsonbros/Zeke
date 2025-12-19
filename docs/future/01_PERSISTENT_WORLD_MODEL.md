# Project Plan: Persistent World Model
## ZEKE's Living Simulation of Nate's Life

### Vision

ZEKE maintains a real-time, continuously-updating model of Nate's life - not just memories of what happened, but a dynamic simulation of his current state, relationships, goals, routines, and environment. This "world model" allows ZEKE to:

- Understand context without being told
- Predict needs before they arise
- Notice when something is "off"
- Answer questions about Nate's life with deep understanding

---

## Core Components

### 1. Life State Graph

A graph database representation of Nate's life with these node types:

```
PEOPLE (relationships, last contact, sentiment, importance)
  └── Family, Friends, Colleagues, Acquaintances

PLACES (frequency, purpose, associations)
  └── Home, Work, Gym, Restaurants, Travel destinations

ROUTINES (timing, flexibility, importance)
  └── Morning routine, Work patterns, Exercise, Sleep

GOALS (status, timeline, blockers, progress)
  └── Short-term, Long-term, Dreams, Commitments

PROJECTS (active/archived, deadlines, dependencies)
  └── Work projects, Personal projects, Learning

OBJECTS (location, importance, last used)
  └── Devices, Vehicles, Important possessions

HEALTH (current state, trends, concerns)
  └── Energy, Mood, Sleep quality, Exercise

FINANCES (summary, concerns, goals)
  └── Budget status, Upcoming expenses, Savings progress
```

### 2. State Inference Engine

Continuously infers Nate's current state from:
- Recent conversations
- Calendar data
- Location patterns
- Time of day/week/year
- Omi pendant transcripts
- Explicit updates

Example inferences:
```
"Nate is at work" (location + time)
"Nate seems stressed this week" (language patterns + schedule density)
"Nate hasn't talked to Mom in 3 weeks" (contact tracking)
"Nate's sleep has been poor lately" (health data + mentions)
```

### 3. Prediction Layer

Uses the world model to anticipate needs:

| Trigger | Prediction | Action |
|---------|------------|--------|
| Friday afternoon + no dinner plans | Nate might want restaurant suggestion | Proactively offer options |
| 2 weeks before anniversary | Gift needed | Start suggesting ideas |
| Work stress + weekend approaching | Needs relaxation | Suggest downtime activities |
| Low contact with friend + their birthday approaching | Reconnection opportunity | Remind to reach out |

---

## Implementation Phases

### Phase 1: Foundation (Months 1-2)

**Goal:** Build the basic world model schema and populate it from existing data.

**Tasks:**
1. Create `world_model` table structure in SQLite
2. Define node types and relationship schemas
3. Build importers to populate from:
   - Existing memories
   - Contact list
   - Calendar events
   - Location history
4. Create basic query interface: "What do you know about [X]?"

**Deliverable:** ZEKE can answer "Who is [person]?" with rich context.

### Phase 2: Live Updates (Months 2-3)

**Goal:** World model updates automatically from conversations and data.

**Tasks:**
1. Entity extraction pipeline for conversations
2. Relationship inference ("Nate mentioned having lunch with Sarah" → update contact)
3. State change detection ("I got a new job" → update work node)
4. Temporal decay (relationships fade without contact)
5. Importance scoring (frequently mentioned = more important)

**Deliverable:** World model stays current without manual updates.

### Phase 3: State Inference (Months 3-4)

**Goal:** ZEKE infers Nate's current state and context.

**Tasks:**
1. Multi-signal state inference (location + time + calendar + recent chat)
2. Mood/energy estimation from language patterns
3. "Current context" summary generation
4. Routine deviation detection ("You usually exercise on Tuesdays")
5. Relationship health monitoring

**Deliverable:** ZEKE understands context without being told.

### Phase 4: Predictions (Months 4-6)

**Goal:** ZEKE anticipates needs and offers proactive assistance.

**Tasks:**
1. Pattern-based prediction engine
2. Calendar-aware anticipation (upcoming events → needs)
3. Relationship maintenance alerts
4. Goal progress tracking and nudges
5. "What if" scenario simulation

**Deliverable:** ZEKE proactively helps before being asked.

---

## Concrete Examples

### Example 1: Deep Context Understanding

**Without World Model:**
```
Nate: "Should I call her?"
ZEKE: "Who would you like to call?"
```

**With World Model:**
```
Nate: "Should I call her?"
ZEKE: "If you mean Sarah, you mentioned things were tense after 
last week's conversation. It's been 5 days - might be good timing 
to reconnect. Want me to suggest some talking points?"
```

### Example 2: Proactive Assistance

```
ZEKE: "Hey, your mom's birthday is in 10 days. Last year you got 
her that cooking class which she loved. I found a few similar 
experiences in her area - want to see them?"
```

### Example 3: Anomaly Detection

```
ZEKE: "I noticed you've skipped the gym three times this week, 
which is unusual for you. Everything okay? Want me to reschedule 
tomorrow's session or adjust your fitness goals?"
```

### Example 4: Seamless Context

```
Nate: "I'm nervous about tomorrow"
ZEKE: "The presentation to the board? You've been preparing for 
two weeks and your practice run on Tuesday went well. Remember, 
you've done 4 board presentations before and they all went fine. 
Want to do a quick run-through tonight?"
```

---

## Technical Architecture

### Database Schema (SQLite Extension)

```sql
-- Core world model tables
CREATE TABLE world_nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- person, place, routine, goal, etc.
  name TEXT NOT NULL,
  data JSON NOT NULL, -- flexible attributes
  importance_score REAL DEFAULT 0.5,
  last_updated TIMESTAMP,
  last_referenced TIMESTAMP
);

CREATE TABLE world_edges (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES world_nodes(id),
  target_id TEXT REFERENCES world_nodes(id),
  relationship TEXT NOT NULL, -- knows, visits, works_on, etc.
  strength REAL DEFAULT 0.5,
  data JSON,
  last_updated TIMESTAMP
);

CREATE TABLE state_snapshots (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL,
  inferred_state JSON NOT NULL, -- current context
  confidence REAL,
  signals_used JSON -- what data led to this inference
);

CREATE TABLE predictions (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMP,
  prediction_type TEXT,
  content TEXT,
  target_date TIMESTAMP,
  confidence REAL,
  status TEXT, -- pending, acted_on, dismissed, expired
  outcome TEXT -- was prediction accurate?
);
```

### Context Assembly

When Nate sends a message, ZEKE assembles context:

```typescript
async function assembleWorldContext(message: string) {
  // 1. Extract entities mentioned
  const entities = await extractEntities(message);
  
  // 2. Fetch relevant nodes from world model
  const nodes = await getRelevantNodes(entities);
  
  // 3. Get current state inference
  const currentState = await getCurrentState();
  
  // 4. Check active predictions
  const predictions = await getActivePredictions();
  
  // 5. Assemble context bundle
  return {
    worldContext: nodes,
    currentState,
    predictions,
    recentPatterns: await getRecentPatterns()
  };
}
```

---

## Dependencies

- **Existing:** Memory system, entity extraction, conversation history
- **New:** Graph query layer, prediction engine, state inference pipeline
- **External:** None required (enhances existing capabilities)

## Challenges

1. **Accuracy:** Inferences must be correct or ZEKE loses trust
2. **Privacy:** Sensitive data needs careful handling
3. **Staleness:** Model must stay current without constant updates
4. **Complexity:** Graph can grow unwieldy - need pruning strategies

## Success Metrics

- ZEKE correctly infers context without being told (measure via user corrections)
- Predictions are acted upon (not dismissed)
- User explicitly praises contextual understanding
- Reduction in "who/what/when" clarifying questions from ZEKE

---

## Summary

The Persistent World Model transforms ZEKE from a reactive assistant into one that truly understands Nate's life. It's the foundation for many other ambitious features - emotional continuity, proactive orchestration, and memory synthesis all build on top of this world understanding.

**Priority:** HIGH - This is foundational infrastructure for the next evolution of ZEKE.

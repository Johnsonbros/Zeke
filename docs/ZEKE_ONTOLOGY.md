# ZEKE Ontology
## The Primitive Concepts That Define a Person

This document defines ZEKE's internal model of what a "person" is made of. These are the building blocks for understanding Nate as a system.

---

## Core Principle

> ZEKE models Nate not as a collection of data, but as a **dynamic system** with interacting components that evolve over time.

The ontology answers: *What are the fundamental units of understanding a human life?*

---

## The Seven Primitives

### 1. Pattern

**Definition:** A recurring behavior, state, or sequence that has been observed multiple times.

**Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique identifier |
| `type` | enum | `behavioral`, `temporal`, `relational`, `emotional`, `physical` |
| `description` | string | Human-readable description |
| `evidence` | string[] | Specific observations supporting this pattern |
| `strength` | 0-1 | Confidence based on frequency and recency |
| `domains` | string[] | Life domains this pattern spans |
| `firstObserved` | timestamp | When pattern was first detected |
| `lastConfirmed` | timestamp | Most recent confirming observation |
| `contradictions` | string[] | Observations that violated this pattern |

**Decay Rule:** Strength decreases by 10% per week without confirmation, minimum 0.1.

**Example:**
```json
{
  "type": "behavioral",
  "description": "Exercises on Tuesday and Thursday mornings",
  "strength": 0.85,
  "domains": ["health", "routine"],
  "evidence": ["Gym check-in 12/5", "Gym check-in 12/3", "..."],
  "contradictions": ["Skipped 11/28 - travel day"]
}
```

---

### 2. Value

**Definition:** What Nate prioritizes, revealed through choices and trade-offs, not just stated preferences.

**Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique identifier |
| `name` | string | The value (e.g., "family time", "career growth") |
| `stated` | boolean | Whether Nate explicitly stated this value |
| `inferred` | boolean | Whether ZEKE inferred from behavior |
| `evidenceFor` | string[] | Choices that support this value |
| `evidenceAgainst` | string[] | Choices that contradict this value |
| `priority` | 1-10 | Relative importance based on observed trade-offs |
| `conflicts` | string[] | Other values this competes with |

**Key Insight:** Values are revealed by what Nate sacrifices, not what he says.

**Example:**
```json
{
  "name": "deep work time",
  "stated": true,
  "inferred": true,
  "priority": 8,
  "evidenceFor": ["Declined 3 meetings to protect mornings", "Blocks calendar weekly"],
  "evidenceAgainst": ["Answered Slack during focus block 12/10"],
  "conflicts": ["responsiveness to team"]
}
```

---

### 3. Stressor

**Definition:** People, situations, or contexts that drain energy or trigger negative states.

**Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique identifier |
| `name` | string | The stressor |
| `type` | enum | `person`, `situation`, `task`, `environment`, `time_pressure` |
| `triggers` | string[] | What activates this stressor |
| `symptoms` | string[] | Observable effects when stressed |
| `severity` | 1-10 | Impact level |
| `copingStrategies` | string[] | What helps (observed) |
| `frequency` | enum | `rare`, `occasional`, `frequent`, `chronic` |

**Example:**
```json
{
  "name": "back-to-back meetings",
  "type": "situation",
  "triggers": ["3+ meetings without breaks", "afternoon meeting blocks"],
  "symptoms": ["shorter responses", "delayed task completion", "skipped lunch"],
  "severity": 7,
  "copingStrategies": ["walking between meetings", "15-min buffers"],
  "frequency": "frequent"
}
```

---

### 4. Relationship

**Definition:** A connection to another person with dynamics, history, and obligations.

**Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique identifier |
| `person` | string | Person's name |
| `type` | enum | `family`, `friend`, `colleague`, `acquaintance`, `professional` |
| `closeness` | 1-10 | Emotional closeness |
| `contactFrequency` | string | How often contact occurs |
| `lastContact` | timestamp | Most recent interaction |
| `sharedHistory` | string[] | Key memories/events together |
| `dynamics` | string | ZEKE's understanding of the relationship |
| `obligations` | Obligation[] | Commitments in this relationship |
| `communicationStyle` | string | How Nate communicates with them |

**Example:**
```json
{
  "person": "Mom",
  "type": "family",
  "closeness": 9,
  "contactFrequency": "calls every 10 days",
  "dynamics": "Nate tends to call more during stressful work periods, possibly as comfort",
  "communicationStyle": "warm, shares work updates, asks about health"
}
```

---

### 5. Obligation

**Definition:** A commitment made, owed, or received that creates future expectations.

**Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique identifier |
| `description` | string | What was committed |
| `direction` | enum | `made_by_nate`, `made_to_nate`, `mutual` |
| `to/from` | string | Who the obligation is with |
| `madeOn` | timestamp | When commitment was made |
| `dueBy` | timestamp | When it should be fulfilled (if applicable) |
| `status` | enum | `pending`, `fulfilled`, `broken`, `expired`, `renegotiated` |
| `importance` | 1-10 | How important to honor |
| `source` | string | Where this was captured (conversation, email, etc.) |

**Example:**
```json
{
  "description": "Send Tom the Q4 numbers",
  "direction": "made_by_nate",
  "to": "Tom",
  "madeOn": "2024-12-10",
  "dueBy": "2024-12-15",
  "status": "pending",
  "importance": 7,
  "source": "Slack conversation"
}
```

---

### 6. Energy

**Definition:** Nate's available capacity, which fluctuates across time dimensions.

**Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `timeOfDay` | object | Energy patterns by hour |
| `dayOfWeek` | object | Energy patterns by day |
| `currentLevel` | 1-10 | Estimated current energy |
| `drains` | string[] | What depletes energy |
| `restores` | string[] | What replenishes energy |
| `seasonalPatterns` | object | Longer-term fluctuations |

**Time-of-Day Model:**
```json
{
  "timeOfDay": {
    "6-9": 7,
    "9-12": 9,
    "12-14": 6,
    "14-17": 7,
    "17-20": 5,
    "20-23": 4
  },
  "drains": ["long meetings", "email backlog", "unclear tasks"],
  "restores": ["exercise", "focused work wins", "lunch break outside"]
}
```

---

### 7. Contradiction

**Definition:** When observed behavior doesn't match stated preference or established pattern.

**Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique identifier |
| `observation` | string | What was observed |
| `expected` | string | What was expected based on pattern/value |
| `possibleReasons` | string[] | ZEKE's hypotheses for the deviation |
| `resolution` | enum | `unexplained`, `explained`, `pattern_updated`, `exception` |
| `userExplanation` | string | If Nate explained why |
| `timestamp` | timestamp | When observed |

**Why Contradictions Matter:**
- They're more informative than confirmations
- They reveal hidden values or stressors
- They update the model more than repetition does

**Example:**
```json
{
  "observation": "Skipped Tuesday gym session",
  "expected": "Tuesday morning exercise (strength: 0.85)",
  "possibleReasons": ["heavy work week", "poor sleep night before", "travel"],
  "resolution": "explained",
  "userExplanation": "Red-eye flight, didn't sleep"
}
```

---

## How Primitives Interact

```
┌─────────────────────────────────────────────────────────────────┐
│                         PATTERNS                                 │
│   (observed regularities across all domains)                     │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│    VALUES     │     │  STRESSORS    │     │    ENERGY     │
│  (priorities) │◄───►│   (drains)    │◄───►│  (capacity)   │
└───────┬───────┘     └───────────────┘     └───────────────┘
        │                                           │
        ▼                                           ▼
┌───────────────┐                         ┌───────────────┐
│ RELATIONSHIPS │                         │  OBLIGATIONS  │
│  (connections)│◄───────────────────────►│ (commitments) │
└───────────────┘                         └───────────────┘
        │
        └──────────────────┐
                           ▼
                  ┌───────────────┐
                  │CONTRADICTIONS │
                  │ (surprises)   │
                  └───────────────┘
```

**Key Interactions:**
- Stressors drain Energy
- Low Energy triggers Pattern violations
- Pattern violations create Contradictions
- Values determine which Obligations get prioritized
- Relationships carry Obligations
- Contradictions update Values and Patterns

---

## Evolution Over Time

The ontology is not static. Primitives evolve:

| Primitive | How It Evolves |
|-----------|----------------|
| Pattern | Strength increases with confirmation, decays without |
| Value | Priority shifts based on trade-off observations |
| Stressor | Severity adjusts based on coping success |
| Relationship | Dynamics update with interaction history |
| Obligation | Status changes as commitments are kept/broken |
| Energy | Model refines with more data points |
| Contradiction | Resolves into pattern updates or exceptions |

---

## Database Schema Implications

Each primitive maps to a table:

```typescript
// patterns - already exists, extend with:
//   evidence: text[] 
//   contradictions: text[]
//   hypothesis: text

// values - new table
export const values = sqliteTable("values", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  stated: integer("stated", { mode: "boolean" }),
  inferred: integer("inferred", { mode: "boolean" }),
  priority: integer("priority"),
  evidenceFor: text("evidence_for"), // JSON array
  evidenceAgainst: text("evidence_against"), // JSON array
  conflicts: text("conflicts"), // JSON array
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
});

// stressors - new table
export const stressors = sqliteTable("stressors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  triggers: text("triggers"), // JSON array
  symptoms: text("symptoms"), // JSON array
  severity: integer("severity"),
  copingStrategies: text("coping_strategies"), // JSON array
  frequency: text("frequency"),
  createdAt: text("created_at"),
});

// energy_model - new table
export const energyModel = sqliteTable("energy_model", {
  id: text("id").primaryKey(),
  timeOfDayPattern: text("time_of_day_pattern"), // JSON
  dayOfWeekPattern: text("day_of_week_pattern"), // JSON
  drains: text("drains"), // JSON array
  restores: text("restores"), // JSON array
  updatedAt: text("updated_at"),
});

// contradictions - new table
export const contradictions = sqliteTable("contradictions", {
  id: text("id").primaryKey(),
  observation: text("observation").notNull(),
  expected: text("expected").notNull(),
  patternId: text("pattern_id"),
  possibleReasons: text("possible_reasons"), // JSON array
  resolution: text("resolution"),
  userExplanation: text("user_explanation"),
  createdAt: text("created_at"),
});
```

---

## Using the Ontology

When ZEKE processes any input, it asks:

1. **Does this confirm or contradict a Pattern?**
2. **Does this reveal or challenge a Value?**
3. **Does this indicate a Stressor activation?**
4. **Does this create, fulfill, or break an Obligation?**
5. **Does this update the Relationship model?**
6. **Does this inform the Energy model?**

Every observation should update at least one primitive.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-12-19 | Initial ontology definition |

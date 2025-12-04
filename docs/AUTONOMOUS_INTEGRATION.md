# ZEKE Autonomous Integration System

## Overview

This document describes ZEKE's autonomous intelligence system that integrates lifelogs, GPS location tracking, proactive task management, and automated system integration to create a truly autonomous and contextually proactive AI assistant.

## Architecture

The autonomous system consists of 6 main layers:

### Layer 1: Intent & Knowledge Extraction

**Intent Parser** (`server/intentParser.ts`)
- Parses lifelogs to extract user goals, preferences, commitments, and concerns
- Uses Claude to analyze conversation transcripts
- Stores high-confidence intents (>0.5) in the database
- Categorizes intents: goals, preferences, commitments, concerns, questions, dislikes

**Knowledge Extractor** (`server/knowledgeExtractor.ts`)
- Builds semantic understanding from multiple data sources:
  - Recent conversations from lifelogs
  - Location visit patterns
  - Task activity and completion patterns
  - Calendar events and scheduling
- Extracts:
  - Topic clusters (what the user talks about)
  - Entity relationships (how people, places, projects relate)
  - Temporal patterns (recurring behaviors)
  - Contextual associations (trigger-response patterns)

### Layer 2: Context Fusion & Understanding

**Data Fusion** (`server/dataFusion.ts` - existing)
- Correlates information from:
  - Temporal context (time, day, date)
  - Calendar (upcoming events, conflicts, free time)
  - Tasks (pending, overdue, completed)
  - Location (current place, recent history)
  - Conversations (recent topics, people, discussions)
  - Weather (current conditions, alerts)
  - Memory & preferences
  - Patterns & associations

### Layer 3: Proactivity Filter

**Proactivity Filter** (`server/proactivityFilter.ts`)
- Determines what's worth acting on using multi-criteria evaluation:
  1. **Confidence Threshold** - Only acts on high-confidence insights (default: 0.7)
  2. **Frequency Limits** - Max 3 actions/hour, 10/day (configurable)
  3. **Quiet Hours** - Respects 22:00-07:00 quiet time (configurable)
  4. **Duplicate Detection** - Avoids redundant actions within 1 hour
  5. **User Preferences** - Learns what types of actions user prefers
  6. **Context Appropriateness** - Considers:
     - Time of day
     - User's likely activity (meeting, driving, etc.)
     - Priority level
  7. **Historical Effectiveness** - Adjusts based on past success rate

### Layer 4: Autonomous Action Orchestrator

**Autonomous Orchestrator** (`server/autonomousOrchestrator.ts`)
- Main conductor that coordinates proactive behavior:
  1. **Process** recent lifelogs for new intents
  2. **Extract** knowledge from recent data
  3. **Generate** proactive action candidates using Claude
  4. **Filter** candidates through proactivity filter
  5. **Prioritize** and sort actions
  6. **Execute** or queue for approval
  7. **Track** outcomes

**Action Types:**
- `reminder` - Time-based or context-triggered reminders
- `suggestion` - Helpful suggestions based on patterns
- `insight` - Interesting observations from data
- `alert` - Important notifications requiring attention
- `question` - Clarifying questions to better understand user
- `automation` - Automated task execution

**Execution Modes:**
- **Auto-execute**: High-confidence actions (>0.9) execute automatically
- **Requires approval**: Medium confidence actions ask user first
- **Queued**: Actions waiting for better timing

### Layer 5: Feedback Learning

**Feedback Learner** (`server/feedbackLearner.ts`)
- Continuously learns from user responses:
  - Tracks success rate by action type, priority, time of day
  - Identifies common rejection reasons
  - Generates recommended adjustments
  - Automatically applies high-confidence adjustments (>0.8)
  - Updates proactivity settings based on feedback

**Learning Adjustments:**
- Raises/lowers confidence thresholds
- Increases/decreases action frequency
- Learns preferences for action types
- Identifies best times for proactive actions

### Layer 6: Integration & Scheduling

**Autonomous Integration Job** (`server/jobs/autonomousIntegration.ts`)
- Scheduled jobs:
  - **Every 30 minutes**: Main orchestration cycle
  - **Every 6 hours**: Knowledge extraction
  - **Daily at 3 AM**: Feedback learning cycle

## Database Schema

### User Intents
```sql
CREATE TABLE user_intents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- goal | concern | question
  description TEXT NOT NULL,
  confidence TEXT NOT NULL, -- 0-1 scale
  context TEXT NOT NULL,
  source TEXT NOT NULL, -- lifelog | conversation | manual
  source_id TEXT,
  related_entities TEXT, -- JSON array
  timeframe TEXT, -- "this week", "by friday", etc.
  priority TEXT, -- low | medium | high | urgent
  status TEXT NOT NULL, -- active | fulfilled | expired | archived
  extracted_at TEXT NOT NULL,
  fulfilled_at TEXT,
  outcome TEXT
);
```

### User Preferences
```sql
CREATE TABLE user_preferences (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL, -- food | timing | communication | proactivity
  preference TEXT NOT NULL,
  strength TEXT NOT NULL, -- strong_prefer | prefer | neutral | dislike | strong_dislike
  confidence TEXT NOT NULL,
  context TEXT,
  source TEXT NOT NULL,
  source_id TEXT,
  learned_at TEXT NOT NULL,
  last_confirmed_at TEXT,
  times_confirmed INTEGER DEFAULT 0
);
```

### User Commitments
```sql
CREATE TABLE user_commitments (
  id TEXT PRIMARY KEY,
  commitment TEXT NOT NULL,
  confidence TEXT NOT NULL,
  context TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT,
  related_entities TEXT, -- JSON array
  due_date TEXT,
  priority TEXT,
  status TEXT NOT NULL, -- active | completed | cancelled | missed
  extracted_at TEXT NOT NULL,
  completed_at TEXT,
  outcome TEXT
);
```

### Semantic Clusters
```sql
CREATE TABLE semantic_clusters (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL UNIQUE,
  frequency INTEGER NOT NULL,
  sentiment TEXT NOT NULL, -- positive | neutral | negative
  related_topics TEXT, -- JSON array
  first_mentioned TEXT NOT NULL,
  last_mentioned TEXT NOT NULL,
  contexts TEXT, -- JSON array
  updated_at TEXT NOT NULL
);
```

### Temporal Patterns
```sql
CREATE TABLE temporal_patterns (
  id TEXT PRIMARY KEY,
  pattern TEXT NOT NULL UNIQUE,
  frequency TEXT NOT NULL, -- daily | weekly | monthly | occasional
  time_of_day TEXT, -- morning | afternoon | evening | night
  day_of_week TEXT, -- Monday | Tuesday | etc.
  confidence TEXT NOT NULL,
  observations INTEGER NOT NULL,
  context TEXT NOT NULL,
  first_observed TEXT NOT NULL,
  last_observed TEXT NOT NULL
);
```

### Contextual Associations
```sql
CREATE TABLE contextual_associations (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL,
  response TEXT NOT NULL,
  context TEXT NOT NULL,
  confidence TEXT NOT NULL,
  observations INTEGER NOT NULL,
  first_observed TEXT NOT NULL,
  last_observed TEXT NOT NULL
);
```

### Knowledge Graph
```sql
CREATE TABLE knowledge_graph (
  id TEXT PRIMARY KEY,
  entity1 TEXT NOT NULL,
  entity1_type TEXT NOT NULL,
  entity2 TEXT NOT NULL,
  entity2_type TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  strength TEXT NOT NULL, -- 0-1 confidence
  evidence TEXT, -- JSON array
  discovered_at TEXT NOT NULL,
  last_seen TEXT NOT NULL
);
```

### Proactive Actions
```sql
CREATE TABLE proactive_actions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- reminder | suggestion | insight | alert | question | automation
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  confidence TEXT NOT NULL,
  priority TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  suggested_action TEXT,
  requires_approval INTEGER NOT NULL,
  data_sources_used TEXT NOT NULL, -- JSON array
  status TEXT NOT NULL, -- pending | pending_approval | approved | rejected | executed | queued | expired
  valid_until TEXT,
  created_at TEXT NOT NULL,
  executed_at TEXT,
  outcome TEXT
);
```

### Proactivity Settings
```sql
CREATE TABLE proactivity_settings (
  id TEXT PRIMARY KEY,
  min_confidence TEXT NOT NULL DEFAULT '0.7',
  max_actions_per_hour INTEGER NOT NULL DEFAULT 3,
  max_actions_per_day INTEGER NOT NULL DEFAULT 10,
  quiet_hours_start TEXT, -- "22:00"
  quiet_hours_end TEXT, -- "07:00"
  preferred_notification_methods TEXT, -- JSON array
  auto_execute_threshold TEXT NOT NULL DEFAULT '0.9',
  updated_at TEXT NOT NULL
);
```

### Action Feedback
```sql
CREATE TABLE action_feedback (
  id TEXT PRIMARY KEY,
  action_id TEXT NOT NULL REFERENCES proactive_actions(id),
  action_type TEXT NOT NULL,
  feedback_type TEXT NOT NULL, -- positive | negative | neutral | approved | rejected
  comments TEXT,
  provided_at TEXT NOT NULL
);
```

## API / Capabilities

Updated `server/capabilities/predictions.ts` with new tools:

### Prediction Tools

- `build_fused_context()` - Get comprehensive context from all data sources
- `get_active_patterns()` - Get behavioral patterns with >0.6 confidence
- `detect_anomalies()` - Detect deviations from expected patterns
- `get_pending_predictions()` - Get actions awaiting user approval
- `execute_prediction(predictionId)` - Approve and execute an action
- `record_prediction_feedback(predictionId, wasAccurate, feedbackNote)` - Provide feedback
- `get_prediction_accuracy_stats()` - Get success rates and recommendations
- `discover_new_patterns()` - Run knowledge extraction to find new patterns

### New Tools

- `get_user_intents()` - Get active user goals and concerns
- `get_user_commitments()` - Get user commitments and promises
- `get_action_history(limit?, type?)` - Get proactive action history

## Configuration

### Default Proactivity Settings

```typescript
{
  minConfidence: 0.7,            // Only act on 70%+ confidence
  maxActionsPerHour: 3,          // Max 3 proactive actions per hour
  maxActionsPerDay: 10,          // Max 10 per day
  quietHoursStart: "22:00",      // Don't disturb after 10 PM
  quietHoursEnd: "07:00",        // Don't disturb before 7 AM
  preferredNotificationMethods: ["sms"], // How to notify
  autoExecuteThreshold: 0.9      // Auto-execute at 90%+ confidence
}
```

### Adjusting Settings

Settings automatically adjust based on feedback:
- If success rate < 40%: Raise confidence threshold (+0.1)
- If success rate > 80%: Lower confidence threshold (-0.05)
- If user likes actions: Increase frequency limit (+2/day)
- If user dislikes actions: Decrease frequency limit (-2/day)

## Integration Points

### Lifelog Processing

The system hooks into the existing lifelog processing pipeline:

1. **Voice Pipeline** (`server/voice/limitlessListener.ts`) polls Limitless API
2. **Intent Parser** processes new lifelogs to extract intents
3. **Knowledge Extractor** runs periodically to build semantic understanding
4. **Orchestrator** generates proactive actions based on extracted knowledge

### Location Integration

Location data is used to:
- Detect patterns in location visits
- Trigger context-aware actions (e.g., "You're near the grocery store and have 5 items on your list")
- Understand user routines and habits

### Task Management Integration

Task data is used to:
- Identify overdue or upcoming tasks
- Suggest task breakdowns
- Remind about commitments extracted from conversations

### Calendar Integration

Calendar events are used to:
- Avoid sending actions during meetings
- Suggest prep for upcoming events
- Detect scheduling conflicts

## How It Works: Example Flow

1. **User has conversation** captured by Limitless
2. **Intent Parser** analyzes the transcript:
   - Extracts: "User wants to finish the project proposal by Friday" (confidence: 0.85)
   - Stores as active intent with high priority
3. **Knowledge Extractor** runs every 6 hours:
   - Identifies topic cluster: "work projects" (mentioned 15 times this week)
   - Identifies pattern: "User typically works on proposals in the morning"
4. **Orchestrator** runs every 30 minutes:
   - Generates candidate action: "Remind user about project proposal (due Friday)"
   - Confidence: 0.88, Priority: high
5. **Proactivity Filter** evaluates:
   - ✓ Confidence 0.88 > threshold 0.7
   - ✓ 1 action this hour < limit 3
   - ✓ Not quiet hours (currently 2 PM)
   - ✓ No similar action in last hour
   - ✓ User typically responds well to work reminders (75% success rate)
   - ✓ Not in a meeting, not driving
   - **Decision: Execute**
6. **Action Execution**:
   - Sends SMS: "⏰ Project proposal due Friday\n\nYou mentioned wanting to finish this. You typically work on proposals in the morning - good time to tackle it?"
7. **User responds**: "Thanks, I'll work on it now"
8. **Feedback Learner**:
   - Records positive feedback
   - Confirms "work reminders" are valuable
   - Notes "morning" is a good time for this type of action

## Monitoring & Debugging

### Check System Status

```typescript
// Get pending actions
const pending = await get_pending_predictions();

// Get action history
const history = await get_action_history({ limit: 50 });

// Get accuracy stats
const stats = await get_prediction_accuracy_stats();

// Get active patterns
const patterns = await get_active_patterns();

// Get user intents
const intents = await get_user_intents();
```

### Logs

The system logs all major operations:
- `[Autonomous Integration]` - Job scheduling and execution
- `[Orchestrator]` - Action generation and execution
- `[Proactivity Filter]` - Filtering decisions
- `[FeedbackLearner]` - Learning adjustments

## Safety & Privacy

### Confidence-Based Gating

Only high-confidence insights trigger actions. Low-confidence observations are stored but don't result in notifications.

### Frequency Limits

Hard limits prevent overwhelming the user with too many actions.

### User Control

- All settings are configurable
- User can approve/reject actions
- Feedback automatically tunes the system
- User preferences are learned and respected

### Data Sources

All actions cite their data sources, so the user understands why ZEKE is taking action.

## Future Enhancements

### Potential Improvements

1. **Multi-modal notifications**: Push notifications, email, voice
2. **Richer entity extraction**: Better understanding of people, places, projects
3. **Predictive scheduling**: "You usually go grocery shopping on Saturday mornings"
4. **Habit formation**: "You've been consistent with morning runs for 2 weeks!"
5. **Social context**: "John usually replies within an hour, but it's been 2 days"
6. **Financial insights**: "Your grocery spending is 20% higher this month"
7. **Health tracking**: Integration with health devices and patterns

## Troubleshooting

### No actions being generated

- Check if autonomous orchestration job is running
- Verify there's lifelog data to analyze
- Check confidence thresholds (may be too high)
- Review frequency limits (may have hit daily cap)

### Too many actions

- Increase `minConfidence` threshold
- Decrease `maxActionsPerDay` limit
- Provide negative feedback to tune the system

### Actions not relevant

- Provide feedback on each action (positive/negative)
- System will learn over time
- Check that lifelogs are being processed correctly

### Actions at wrong times

- Configure quiet hours
- Provide feedback about timing
- System will learn best times from feedback

## Summary

The Autonomous Integration System transforms ZEKE from a reactive assistant to a proactive intelligence that:

✅ **Understands** user goals, preferences, and commitments
✅ **Learns** patterns and relationships from multiple data sources
✅ **Predicts** when proactive action would be helpful
✅ **Filters** to avoid being annoying or inappropriate
✅ **Acts** autonomously when confident, or asks for approval
✅ **Learns** from feedback to continuously improve

The system is designed to be:
- **Contextually aware**: Considers time, location, calendar, mood
- **Confidence-based**: Only acts on high-confidence insights
- **User-respectful**: Respects preferences, quiet hours, frequency limits
- **Self-improving**: Learns from every interaction
- **Transparent**: Explains reasoning for every action

This makes ZEKE a truly autonomous and proactive AI assistant that anticipates needs and takes action at the right time, in the right way.

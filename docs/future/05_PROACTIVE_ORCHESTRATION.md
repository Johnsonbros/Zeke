# Project Plan: Proactive Life Orchestration
## ZEKE Acts Autonomously on Nate's Behalf

### Vision

ZEKE doesn't wait for instructions - he anticipates needs, takes action, and manages aspects of Nate's life autonomously. From scheduling to communication to problem-solving, ZEKE operates as a true executive assistant who handles things before Nate even knows they need handling.

---

## Current State (What ZEKE Has Now)

### Existing Components

| Component | Location | What It Does |
|-----------|----------|--------------|
| `anticipationEngine.ts` | `server/jobs/` | Morning briefings with tasks, meetings, commitments, people to follow up |
| `morningBriefingService.ts` | `server/` | Schedules and delivers morning briefings |
| `notificationBatcher.ts` | `server/` | Groups notifications to reduce interruption |
| `predictiveTaskScheduler.ts` | `server/` | Suggests optimal times for tasks based on patterns |
| `predictionScheduler.ts` | `server/` | Generates predictions about future events |
| `locationIntelligence.ts` | `server/` | Location-based proactive suggestions |
| `nlAutomationExecutor.ts` | `server/` | Executes natural language automations |

### Current Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   ANTICIPATION ENGINE                        │
│                  (anticipationEngine.ts)                     │
└─────────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ gatherBrief- │  │ extractUrg-  │  │ extractPeo-  │
│ ingContext() │  │ entItems()   │  │ pleToFollow  │
│              │  │              │  │ Up()         │
└──────────────┘  └──────────────┘  └──────────────┘
        │                  │                  │
        ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    MorningBriefing                           │
│  • summary (GPT-generated natural language)                  │
│  • sections[] (tasks, meetings, commitments)                 │
│  • urgentItems[] (overdue, high-priority)                    │
│  • peopleToFollowUp[] (pending commitments)                  │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
                  Delivered via SMS / Dashboard
```

### Current Capabilities (Code Examples)

**Morning Briefing Generation (from `anticipationEngine.ts`):**
```typescript
export async function generateMorningBriefing(): Promise<MorningBriefing> {
  const context = await gatherBriefingContext();
  const sections = buildBriefingSections(context);
  const urgentItems = extractUrgentItems(context);
  const peopleToFollowUp = extractPeopleToFollowUp(context);
  const summary = await generateNaturalBriefing(context, sections, urgentItems);
  
  return {
    id: `briefing-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    summary,
    sections,
    urgentItems,
    peopleToFollowUp,
  };
}
```

**Current Output Example:**
```
Good morning! Here's your briefing for today:

You have 2 urgent items requiring attention.
1 task is overdue.

3 tasks due today.
2 meetings scheduled.
3 open commitments to track.

Follow up: Sarah, Mike, Jennifer
```

---

## What's Missing (The Gap)

### 1. Action Execution

**Current:** ZEKE tells Nate what needs to happen.

**Missing:** ZEKE actually DOES things on Nate's behalf.

| Current Output | Missing Capability |
|----------------|-------------------|
| "You have a meeting conflict" | "I've already messaged Mike to reschedule to 3pm and accepted Sarah's invite" |
| "Follow up with Tom about Q4 numbers" | "I sent Tom a follow-up email this morning" |

### 2. Trust Framework

**Current:** No concept of what ZEKE can do autonomously.

**Missing:** Action categories with different approval levels.

```
AUTONOMOUS (no approval):
  - Add calendar reminders
  - Update task statuses
  - Block focus time

CONFIRM (quick approval):
  - Send scheduling confirmations
  - Follow up on pending items
  - Decline low-priority invites

SUGGEST (full review):
  - Cancel commitments
  - Financial actions
  - Important external communication
```

### 3. Complex Orchestration

**Current:** Single-step notifications.

**Missing:** Multi-step goal decomposition and execution.

| Current | Missing Orchestration |
|---------|----------------------|
| "You have a trip next week" | "I'm handling your NYC trip: Booked flight (9am AA234), reserved hotel (Marriott Midtown), blocked calendar, created packing list, set airport departure reminder" |

### 4. Rollback & Recovery

**Current:** No action history.

**Missing:** Ability to undo autonomous actions.

---

## Implementation Plan

### Phase 1: Action Execution Engine (New Capability)

**Create `server/actionExecutor.ts`:**

```typescript
// NEW FILE: server/actionExecutor.ts

import { sendSms } from "./twilioClient";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "./googleCalendar";
import { createTask, updateTask } from "./db";

export type ActionType = 
  | 'calendar.create'
  | 'calendar.update'
  | 'calendar.delete'
  | 'calendar.reminder'
  | 'sms.send'
  | 'email.send'
  | 'task.create'
  | 'task.update'
  | 'task.reminder';

export type TrustLevel = 'autonomous' | 'confirm' | 'suggest';

export interface PlannedAction {
  id: string;
  type: ActionType;
  description: string;
  trustLevel: TrustLevel;
  params: Record<string, any>;
  
  // Execution state
  status: 'pending' | 'approved' | 'executing' | 'completed' | 'failed' | 'rolled_back';
  approvedAt?: string;
  executedAt?: string;
  result?: any;
  error?: string;
  
  // Rollback info
  reversible: boolean;
  rollbackParams?: Record<string, any>;
}

// Action handlers
const actionHandlers: Record<ActionType, (params: any) => Promise<any>> = {
  'calendar.create': async (params) => {
    return await createCalendarEvent(params);
  },
  'calendar.update': async (params) => {
    return await updateCalendarEvent(params.eventId, params.updates);
  },
  'calendar.delete': async (params) => {
    return await deleteCalendarEvent(params.eventId);
  },
  'calendar.reminder': async (params) => {
    // Add reminder to existing event
    return await updateCalendarEvent(params.eventId, {
      reminders: [...(params.existingReminders || []), params.reminder]
    });
  },
  'sms.send': async (params) => {
    return await sendSms(params.to, params.body);
  },
  'task.create': async (params) => {
    return await createTask(params);
  },
  'task.update': async (params) => {
    return await updateTask(params.taskId, params.updates);
  },
  // ... more handlers
};

// Trust level configuration
const trustConfig: Record<ActionType, TrustLevel> = {
  'calendar.reminder': 'autonomous',
  'task.update': 'autonomous',
  'calendar.create': 'confirm',
  'calendar.update': 'confirm',
  'sms.send': 'confirm',
  'task.create': 'confirm',
  'calendar.delete': 'suggest',
};

export async function executeAction(action: PlannedAction): Promise<PlannedAction> {
  // Check trust level
  if (action.trustLevel !== 'autonomous' && action.status !== 'approved') {
    return { ...action, status: 'pending' };
  }
  
  try {
    action.status = 'executing';
    const handler = actionHandlers[action.type];
    
    if (!handler) {
      throw new Error(`Unknown action type: ${action.type}`);
    }
    
    const result = await handler(action.params);
    
    // Log the action
    await logAction(action, result);
    
    return {
      ...action,
      status: 'completed',
      executedAt: new Date().toISOString(),
      result
    };
  } catch (error: any) {
    return {
      ...action,
      status: 'failed',
      error: error.message
    };
  }
}

export async function rollbackAction(action: PlannedAction): Promise<boolean> {
  if (!action.reversible || !action.rollbackParams) {
    return false;
  }
  
  try {
    // Determine rollback action
    const rollbackType = getRollbackType(action.type);
    if (!rollbackType) return false;
    
    const handler = actionHandlers[rollbackType];
    await handler(action.rollbackParams);
    
    action.status = 'rolled_back';
    await logAction(action, { rolledBack: true });
    
    return true;
  } catch (error) {
    console.error(`Rollback failed for action ${action.id}:`, error);
    return false;
  }
}

function getRollbackType(actionType: ActionType): ActionType | null {
  const rollbackMap: Partial<Record<ActionType, ActionType>> = {
    'calendar.create': 'calendar.delete',
    'calendar.update': 'calendar.update', // Use stored original values
  };
  return rollbackMap[actionType] || null;
}
```

### Phase 2: Trust Framework (New Capability)

**Create `server/trustManager.ts`:**

```typescript
// NEW FILE: server/trustManager.ts

import { db } from "./db";

export interface TrustSettings {
  actionType: string;
  trustLevel: 'autonomous' | 'confirm' | 'suggest';
  successCount: number;
  failureCount: number;
  lastUpdated: string;
}

// Default trust levels (can be elevated over time)
const defaultTrustLevels: Record<string, TrustLevel> = {
  'calendar.reminder': 'autonomous',
  'task.update_status': 'autonomous',
  'focus_time.block': 'autonomous',
  
  'calendar.create_internal': 'confirm',
  'sms.send_template': 'confirm',
  'email.follow_up': 'confirm',
  
  'calendar.delete': 'suggest',
  'sms.send_custom': 'suggest',
  'external.communication': 'suggest',
};

export function getTrustLevel(actionType: string): TrustLevel {
  // Check for custom trust setting
  const custom = getCustomTrustSetting(actionType);
  if (custom) return custom.trustLevel;
  
  // Fall back to default
  return defaultTrustLevels[actionType] || 'suggest';
}

export async function recordActionOutcome(
  actionType: string,
  success: boolean
): Promise<void> {
  const setting = await getOrCreateTrustSetting(actionType);
  
  if (success) {
    setting.successCount++;
  } else {
    setting.failureCount++;
  }
  
  setting.lastUpdated = new Date().toISOString();
  await saveTrustSetting(setting);
  
  // Check for trust elevation
  await checkForTrustElevation(setting);
}

async function checkForTrustElevation(setting: TrustSettings): Promise<void> {
  const successRate = setting.successCount / (setting.successCount + setting.failureCount);
  const totalActions = setting.successCount + setting.failureCount;
  
  // Criteria for trust elevation
  if (successRate > 0.95 && totalActions > 20) {
    if (setting.trustLevel === 'confirm') {
      // Suggest elevating to autonomous
      await createTrustElevationSuggestion(setting.actionType);
    }
  }
}

async function createTrustElevationSuggestion(actionType: string): Promise<void> {
  // Create a notification for Nate
  const message = `I've handled ${actionType} successfully 20+ times with 95%+ accuracy. ` +
                  `Want me to do these automatically from now on?`;
  
  await createSystemNotification({
    type: 'trust_elevation',
    title: 'Trust Elevation Suggestion',
    message,
    actionType,
    actions: ['approve', 'decline']
  });
}
```

### Phase 3: Confirmable Actions UI

**Add confirmation endpoint:**

```typescript
// Add to routes.ts

// Get pending actions needing approval
app.get("/api/actions/pending", async (req, res) => {
  const pendingActions = await getPendingActions();
  res.json(pendingActions);
});

// Approve an action
app.post("/api/actions/:actionId/approve", async (req, res) => {
  const { actionId } = req.params;
  const action = await approveAction(actionId);
  
  // Execute immediately after approval
  const result = await executeAction(action);
  res.json(result);
});

// Decline an action
app.post("/api/actions/:actionId/decline", async (req, res) => {
  const { actionId } = req.params;
  await declineAction(actionId);
  res.json({ success: true });
});

// Rollback a completed action
app.post("/api/actions/:actionId/rollback", async (req, res) => {
  const { actionId } = req.params;
  const action = await getAction(actionId);
  const success = await rollbackAction(action);
  res.json({ success });
});
```

### Phase 4: Proactive Action Generation (Extend Existing)

**Extend `anticipationEngine.ts`:**

```typescript
// Add to anticipationEngine.ts

import { PlannedAction, getTrustLevel } from "../actionExecutor";

interface ProactiveActions {
  autonomous: PlannedAction[]; // Execute immediately
  needsConfirmation: PlannedAction[]; // Present for quick approval
  suggestions: PlannedAction[]; // Present for full review
}

async function generateProactiveActions(
  context: BriefingContext
): Promise<ProactiveActions> {
  const actions: ProactiveActions = {
    autonomous: [],
    needsConfirmation: [],
    suggestions: []
  };
  
  // 1. Calendar conflict resolution
  const conflicts = detectCalendarConflicts(context.todaysMeetings);
  for (const conflict of conflicts) {
    const resolution = await proposeConflictResolution(conflict);
    categorizeAction(actions, resolution);
  }
  
  // 2. Follow-up reminders
  for (const person of context.peopleToFollowUp) {
    const action = createFollowUpAction(person);
    categorizeAction(actions, action);
  }
  
  // 3. Overdue task handling
  for (const task of context.overdueTasks) {
    const action = createRescheduleAction(task);
    categorizeAction(actions, action);
  }
  
  // 4. Commitment follow-ups
  for (const commitment of context.overdueCommitments) {
    if (commitment.madeBy !== 'user') {
      // Someone owes Nate - suggest follow-up
      const action = createCommitmentFollowUpAction(commitment);
      categorizeAction(actions, action);
    }
  }
  
  return actions;
}

function categorizeAction(
  actions: ProactiveActions,
  action: PlannedAction
): void {
  const trustLevel = getTrustLevel(action.type);
  
  switch (trustLevel) {
    case 'autonomous':
      actions.autonomous.push(action);
      break;
    case 'confirm':
      actions.needsConfirmation.push(action);
      break;
    case 'suggest':
      actions.suggestions.push(action);
      break;
  }
}

// Enhanced morning briefing with actions
export async function generateMorningBriefingWithActions(): Promise<{
  briefing: MorningBriefing;
  actions: ProactiveActions;
  executedActions: PlannedAction[];
}> {
  const context = await gatherBriefingContext();
  const briefing = await generateMorningBriefing();
  const actions = await generateProactiveActions(context);
  
  // Execute autonomous actions immediately
  const executedActions: PlannedAction[] = [];
  for (const action of actions.autonomous) {
    const result = await executeAction(action);
    executedActions.push(result);
  }
  
  return { briefing, actions, executedActions };
}
```

### Phase 5: Complex Orchestration (New Capability)

**Create `server/orchestrationEngine.ts`:**

```typescript
// NEW FILE: server/orchestrationEngine.ts

import OpenAI from "openai";
import { PlannedAction, executeAction } from "./actionExecutor";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface Orchestration {
  id: string;
  goal: string;
  status: 'planning' | 'executing' | 'paused' | 'completed' | 'failed';
  steps: OrchestrationStep[];
  currentStep: number;
  createdAt: string;
  completedAt?: string;
}

export interface OrchestrationStep {
  id: string;
  description: string;
  actions: PlannedAction[];
  dependsOn: string[]; // Step IDs
  status: 'pending' | 'ready' | 'executing' | 'completed' | 'failed';
}

export async function createOrchestration(goal: string): Promise<Orchestration> {
  // Use LLM to decompose goal into steps
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a task planner. Break down goals into concrete, executable steps.
        Each step should be a discrete action that can be verified.
        Consider dependencies between steps.
        Available action types: calendar.create, calendar.update, sms.send, task.create, task.update`
      },
      {
        role: "user",
        content: `Break down this goal into steps: "${goal}"
        
Respond in JSON:
{
  "steps": [
    {
      "id": "step_1",
      "description": "What this step does",
      "dependsOn": [],
      "actions": [
        {
          "type": "action_type",
          "description": "Human readable",
          "params": { ... }
        }
      ]
    }
  ]
}`
      }
    ],
    max_tokens: 1500,
    response_format: { type: "json_object" }
  });
  
  const plan = JSON.parse(response.choices[0]?.message?.content || '{}');
  
  return {
    id: `orch_${Date.now()}`,
    goal,
    status: 'planning',
    steps: plan.steps.map(s => ({
      ...s,
      status: s.dependsOn.length === 0 ? 'ready' : 'pending'
    })),
    currentStep: 0,
    createdAt: new Date().toISOString()
  };
}

export async function executeOrchestration(
  orchestration: Orchestration
): Promise<Orchestration> {
  orchestration.status = 'executing';
  
  // Execute steps in dependency order
  for (const step of orchestration.steps) {
    // Check dependencies
    const dependenciesMet = step.dependsOn.every(depId => {
      const depStep = orchestration.steps.find(s => s.id === depId);
      return depStep?.status === 'completed';
    });
    
    if (!dependenciesMet) continue;
    
    step.status = 'executing';
    
    try {
      // Execute all actions in this step
      for (const action of step.actions) {
        await executeAction(action);
      }
      step.status = 'completed';
    } catch (error) {
      step.status = 'failed';
      orchestration.status = 'failed';
      break;
    }
    
    orchestration.currentStep++;
  }
  
  // Check if all steps completed
  if (orchestration.steps.every(s => s.status === 'completed')) {
    orchestration.status = 'completed';
    orchestration.completedAt = new Date().toISOString();
  }
  
  return orchestration;
}
```

---

## Concrete Examples

### Before (Current)

```
Morning Briefing:
- 3 tasks due today
- 2 meetings scheduled (conflict at 2pm)
- 1 overdue commitment to Tom

Follow up: Tom, Sarah
```

### After (With Proactive Orchestration)

```
Morning Briefing:
- 3 tasks due today
- 2 meetings scheduled

AUTONOMOUS ACTIONS (done):
- Added reminders to your 3 meetings
- Blocked 2 hours focus time this morning
- Updated 4 task statuses from yesterday

ACTIONS TAKEN (pre-approved):
- Resolved 2pm conflict: Moved Mike's 1:1 to 3pm (he confirmed)
- Sent follow-up to Tom about Q4 numbers

PENDING YOUR INPUT:
- Sarah requested moving Friday's meeting - approve new time?
- Should I decline the low-priority vendor call?

FLAGGED FOR TOMORROW:
- Quarterly report due in 5 days
- Mom's birthday in 3 days - gift not yet ordered
```

### Complex Orchestration Example

```
Nate: "Plan my trip to NYC next week"

ZEKE: "I'll handle that. Here's my plan:

STEP 1: Book flights
- Searching for flights on your preferred airlines
- Found AA234 departing 9am Monday, returning 6pm Thursday
- Cost: $420 (within your typical budget)

STEP 2: Reserve hotel  
- Checking Marriott properties near your meeting location
- Found Marriott Midtown, $280/night
- Booking confirmation pending

STEP 3: Calendar management
- Blocking travel time Monday/Thursday
- Moving conflicting meetings (will notify attendees)
- Adding hotel and flight details to calendar

STEP 4: Preparation
- Created packing list based on weather forecast
- Set reminder to leave for airport Sunday 6pm
- Saved offline maps for Manhattan

Approve this plan? [Approve All] [Review Details] [Cancel]"
```

---

## Files to Modify/Create

| File | Action | Changes |
|------|--------|---------|
| `server/actionExecutor.ts` | Create | Action execution engine with handlers |
| `server/trustManager.ts` | Create | Trust level management and elevation |
| `server/orchestrationEngine.ts` | Create | Complex multi-step orchestration |
| `server/jobs/anticipationEngine.ts` | Modify | Add `generateProactiveActions()` |
| `server/routes.ts` | Modify | Add action approval/rollback endpoints |
| `shared/schema.ts` | Modify | Add `actions`, `orchestrations` tables |

---

## Database Schema Additions

```typescript
// Add to shared/schema.ts

export const actions = sqliteTable("actions", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  trustLevel: text("trust_level").notNull(),
  params: text("params").notNull(), // JSON
  
  status: text("status").notNull().default("pending"),
  approvedAt: text("approved_at"),
  executedAt: text("executed_at"),
  result: text("result"), // JSON
  error: text("error"),
  
  reversible: integer("reversible", { mode: "boolean" }).default(false),
  rollbackParams: text("rollback_params"), // JSON
  
  orchestrationId: text("orchestration_id"),
  createdAt: text("created_at").notNull(),
});

export const trustSettings = sqliteTable("trust_settings", {
  actionType: text("action_type").primaryKey(),
  trustLevel: text("trust_level").notNull(),
  successCount: integer("success_count").default(0),
  failureCount: integer("failure_count").default(0),
  lastUpdated: text("last_updated"),
});

export const orchestrations = sqliteTable("orchestrations", {
  id: text("id").primaryKey(),
  goal: text("goal").notNull(),
  status: text("status").notNull(),
  steps: text("steps").notNull(), // JSON
  currentStep: integer("current_step").default(0),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});
```

---

## Success Metrics

| Metric | How to Measure |
|--------|----------------|
| Autonomous action accuracy | % of autonomous actions that don't need rollback |
| Confirmation approval rate | % of confirm-level actions that get approved |
| Time saved | User estimate of time saved per week |
| Trust elevation | Number of action types elevated over time |
| Orchestration success | % of complex orchestrations completed successfully |

---

## Summary

The current system provides excellent proactive notifications through the anticipation engine. The enhancement path is:

1. **Add action execution** - Actually DO things, not just suggest them
2. **Build trust framework** - Categorize actions by approval level
3. **Enable rollback** - Undo autonomous actions when needed
4. **Support complex orchestration** - Handle multi-step goals end-to-end

This transforms ZEKE from "assistant who tells you things" to "assistant who handles things for you."

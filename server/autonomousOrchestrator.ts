/**
 * Autonomous Action Orchestrator - Coordinates ZEKE's proactive intelligence
 *
 * This is the main conductor that brings together:
 * - Intent parsing from lifelogs
 * - Knowledge extraction from multiple sources
 * - Proactivity filtering
 * - Action generation and execution
 * - Feedback learning
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { proactiveActions, actionFeedback } from "./schema";

import { parseLifelogForIntent, getActiveUserIntents, getActiveCommitments } from "./intentParser";
import { extractKnowledge, getTopicClusters, getTemporalPatterns } from "./knowledgeExtractor";
import {
  evaluateProactiveAction,
  ProactiveActionCandidate,
  updateProactivityConfig
} from "./proactivityFilter";
import { getFusedContext } from "./dataFusion";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface OrchestrationResult {
  candidatesGenerated: number;
  candidatesFiltered: number;
  actionsExecuted: number;
  actionsQueued: number;
  errors: string[];
}

/**
 * Main orchestration loop - should be called periodically (e.g., every 30 minutes)
 */
export async function runAutonomousOrchestration(): Promise<OrchestrationResult> {
  console.log("[Autonomous Orchestrator] Starting orchestration cycle");

  const result: OrchestrationResult = {
    candidatesGenerated: 0,
    candidatesFiltered: 0,
    actionsExecuted: 0,
    actionsQueued: 0,
    errors: []
  };

  try {
    // Step 1: Process recent lifelogs for new intents
    await processRecentLifelogsForIntent();

    // Step 2: Extract knowledge from recent data
    await extractKnowledge(24); // Last 24 hours

    // Step 3: Get comprehensive context
    const context = await getFusedContext();

    // Step 4: Generate proactive action candidates
    const candidates = await generateActionCandidates(context);
    result.candidatesGenerated = candidates.length;

    console.log(`[Orchestrator] Generated ${candidates.length} candidate actions`);

    // Step 5: Filter and prioritize candidates
    const filteredCandidates: ProactiveActionCandidate[] = [];

    for (const candidate of candidates) {
      const filterResult = await evaluateProactiveAction(candidate);

      if (filterResult.shouldAct) {
        if (filterResult.adjustedPriority) {
          candidate.priority = filterResult.adjustedPriority;
        }
        filteredCandidates.push(candidate);
      } else {
        result.candidatesFiltered++;
        console.log(
          `[Orchestrator] Filtered out: ${candidate.title} - ${filterResult.reason}`
        );

        // Store for future reference if timing is just wrong
        if (filterResult.suggestedTiming) {
          await storeQueuedAction(candidate, filterResult.suggestedTiming);
        }
      }
    }

    console.log(`[Orchestrator] ${filteredCandidates.length} actions passed filter`);

    // Step 6: Sort by priority and execute
    const sortedCandidates = prioritizeCandidates(filteredCandidates);

    for (const candidate of sortedCandidates) {
      try {
        if (candidate.requiresApproval) {
          await queueForApproval(candidate);
          result.actionsQueued++;
        } else {
          await executeAction(candidate);
          result.actionsExecuted++;
        }
      } catch (error) {
        const errorMsg = `Failed to execute ${candidate.title}: ${error}`;
        console.error(`[Orchestrator] ${errorMsg}`);
        result.errors.push(errorMsg);
      }
    }

    console.log(
      `[Orchestrator] Executed ${result.actionsExecuted}, Queued ${result.actionsQueued}`
    );
  } catch (error) {
    const errorMsg = `Orchestration error: ${error}`;
    console.error(`[Orchestrator] ${errorMsg}`);
    result.errors.push(errorMsg);
  }

  return result;
}

/**
 * Process recent lifelogs to extract intents
 */
async function processRecentLifelogsForIntent(): Promise<void> {
  try {
    const { limitlessLifelogs } = await import('./schema');

    // Get lifelogs from last 12 hours that haven't been processed for intent
    const twelveHoursAgo = new Date();
    twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);

    const recentLifelogs = await db
      .select()
      .from(limitlessLifelogs)
      .where(gte(limitlessLifelogs.startTime, twelveHoursAgo.toISOString()))
      .orderBy(desc(limitlessLifelogs.startTime))
      .limit(10);

    console.log(`[Orchestrator] Processing ${recentLifelogs.length} recent lifelogs for intent`);

    for (const lifelog of recentLifelogs) {
      try {
        // Check if already processed
        const { userIntents } = await import('./schema');
        const existing = await db
          .select()
          .from(userIntents)
          .where(eq(userIntents.sourceId, lifelog.id))
          .limit(1);

        if (existing.length > 0) {
          continue; // Already processed
        }

        const content = lifelog.markdown || JSON.stringify(lifelog.contents);
        if (!content || content.length < 100) {
          continue; // Too short to extract meaningful intent
        }

        const parsed = await parseLifelogForIntent(
          lifelog.id,
          content,
          lifelog.title,
          lifelog.startTime
        );

        const { storeExtractedIntents } = await import('./intentParser');
        await storeExtractedIntents(parsed);

        console.log(`[Orchestrator] Extracted ${parsed.intents.length} intents from lifelog ${lifelog.title}`);
      } catch (error) {
        console.error(`[Orchestrator] Error processing lifelog ${lifelog.id}:`, error);
      }
    }
  } catch (error) {
    console.error("[Orchestrator] Error in processRecentLifelogsForIntent:", error);
  }
}

/**
 * Generate proactive action candidates based on context
 */
async function generateActionCandidates(context: any): Promise<ProactiveActionCandidate[]> {
  const candidates: ProactiveActionCandidate[] = [];

  // Get intents, commitments, patterns
  const [intents, commitments, patterns, topics] = await Promise.all([
    getActiveUserIntents(20),
    getActiveCommitments(),
    getTemporalPatterns(0.7),
    getTopicClusters(15)
  ]);

  // Build context summary for Claude
  const contextSummary = buildContextSummary(context, intents, commitments, patterns, topics);

  // Use Claude to generate intelligent action candidates
  const prompt = `You are ZEKE's autonomous intelligence system. Based on the user's context, intents, and patterns, generate proactive actions that would be genuinely helpful.

${contextSummary}

Generate 3-8 proactive action candidates that ZEKE should consider taking. For each candidate:

1. TYPE: reminder | suggestion | insight | alert | question | automation
2. TITLE: Clear, concise title (5-10 words)
3. DESCRIPTION: What the action is and why it's valuable
4. CONFIDENCE: 0-1 (how confident are you this would be helpful?)
5. PRIORITY: low | medium | high | urgent
6. REASONING: Why you think this action would be valuable now
7. SUGGESTED_ACTION: Specific action ZEKE should take (optional)
8. REQUIRES_APPROVAL: true/false (should user approve first?)
9. DATA_SOURCES: Which data informed this suggestion

Return as JSON array:
[
  {
    "type": "reminder|suggestion|insight|alert|question|automation",
    "title": "title",
    "description": "description",
    "confidence": 0.0-1.0,
    "priority": "low|medium|high|urgent",
    "reasoning": "why now",
    "suggestedAction": "specific action",
    "requiresApproval": true|false,
    "dataSourcesUsed": ["source1", "source2"]
  }
]

IMPORTANT:
- Only suggest actions that are GENUINELY helpful based on REAL evidence
- Higher confidence (0.8+) for clear, immediate needs
- Lower confidence (0.5-0.7) for nice-to-have suggestions
- Consider timing and context appropriateness
- Don't be annoying - quality over quantity
- Prioritize actions that help user achieve their stated intents
- Consider temporal patterns and typical behavior`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 3000,
      messages: [{
        role: "user",
        content: prompt
      }]
    });

    const responseText = message.content[0].type === 'text'
      ? message.content[0].text
      : '';

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("[Orchestrator] Failed to extract JSON from Claude response");
      return candidates;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    for (const item of parsed) {
      candidates.push({
        type: item.type,
        title: item.title,
        description: item.description,
        confidence: item.confidence,
        priority: item.priority,
        reasoning: item.reasoning,
        suggestedAction: item.suggestedAction,
        requiresApproval: item.requiresApproval,
        dataSourcesUsed: item.dataSourcesUsed
      });
    }
  } catch (error) {
    console.error("[Orchestrator] Error generating action candidates:", error);
  }

  return candidates;
}

/**
 * Build context summary for Claude
 */
function buildContextSummary(
  context: any,
  intents: any[],
  commitments: any[],
  patterns: any[],
  topics: any[]
): string {
  let summary = "CURRENT CONTEXT:\n\n";

  // Time context
  const now = new Date();
  summary += `Time: ${now.toLocaleString()}\n`;
  summary += `Day: ${now.toLocaleDateString('en-US', { weekday: 'long' })}\n\n`;

  // User intents
  if (intents.length > 0) {
    summary += "ACTIVE USER INTENTS:\n";
    for (const intent of intents.slice(0, 5)) {
      summary += `- [${intent.type}] ${intent.description}\n`;
      summary += `  Priority: ${intent.priority}, Confidence: ${parseFloat(intent.confidence).toFixed(2)}\n`;
      if (intent.timeframe) {
        summary += `  Timeframe: ${intent.timeframe}\n`;
      }
    }
    summary += "\n";
  }

  // Commitments
  if (commitments.length > 0) {
    summary += "ACTIVE COMMITMENTS:\n";
    for (const commitment of commitments.slice(0, 5)) {
      summary += `- ${commitment.commitment}\n`;
      if (commitment.dueDate) {
        summary += `  Due: ${commitment.dueDate}\n`;
      }
    }
    summary += "\n";
  }

  // Recent topics
  if (topics.length > 0) {
    summary += "RECENT TOPICS:\n";
    for (const topic of topics.slice(0, 8)) {
      summary += `- ${topic.topic} (mentioned ${topic.frequency} times, ${topic.sentiment})\n`;
    }
    summary += "\n";
  }

  // Patterns
  if (patterns.length > 0) {
    summary += "BEHAVIORAL PATTERNS:\n";
    for (const pattern of patterns.slice(0, 5)) {
      summary += `- ${pattern.pattern} (${pattern.frequency})\n`;
      if (pattern.timeOfDay) {
        summary += `  Typically: ${pattern.timeOfDay}\n`;
      }
    }
    summary += "\n";
  }

  // Tasks
  if (context.tasks) {
    summary += `TASKS: ${context.tasks.pending || 0} pending, ${context.tasks.overdue || 0} overdue\n`;
  }

  // Calendar
  if (context.calendar?.nextEvent) {
    summary += `NEXT EVENT: ${context.calendar.nextEvent.summary} at ${context.calendar.nextEvent.start}\n`;
  }

  // Location
  if (context.location?.currentPlace) {
    summary += `LOCATION: ${context.location.currentPlace.name}\n`;
  }

  return summary;
}

/**
 * Prioritize candidates (sort by priority and confidence)
 */
function prioritizeCandidates(candidates: ProactiveActionCandidate[]): ProactiveActionCandidate[] {
  const priorityScore = (p: string) => {
    switch (p) {
      case 'urgent': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  };

  return candidates.sort((a, b) => {
    const scoreA = priorityScore(a.priority) + a.confidence;
    const scoreB = priorityScore(b.priority) + b.confidence;
    return scoreB - scoreA;
  });
}

/**
 * Execute a proactive action
 */
async function executeAction(candidate: ProactiveActionCandidate): Promise<void> {
  const actionId = crypto.randomUUID();

  // Store the action
  await db.insert(proactiveActions).values({
    id: actionId,
    type: candidate.type,
    title: candidate.title,
    description: candidate.description,
    confidence: candidate.confidence.toString(),
    priority: candidate.priority,
    reasoning: candidate.reasoning,
    suggestedAction: candidate.suggestedAction,
    requiresApproval: candidate.requiresApproval,
    dataSourcesUsed: JSON.stringify(candidate.dataSourcesUsed),
    status: 'executed',
    executedAt: new Date().toISOString()
  });

  // Execute based on type
  switch (candidate.type) {
    case 'reminder':
      await sendReminder(candidate);
      break;

    case 'suggestion':
      await sendSuggestion(candidate);
      break;

    case 'insight':
      await sendInsight(candidate);
      break;

    case 'alert':
      await sendAlert(candidate);
      break;

    case 'question':
      await askQuestion(candidate);
      break;

    case 'automation':
      await executeAutomation(candidate);
      break;
  }

  console.log(`[Orchestrator] Executed action: ${candidate.title}`);
}

/**
 * Queue action for user approval
 */
async function queueForApproval(candidate: ProactiveActionCandidate): Promise<void> {
  const actionId = crypto.randomUUID();

  await db.insert(proactiveActions).values({
    id: actionId,
    type: candidate.type,
    title: candidate.title,
    description: candidate.description,
    confidence: candidate.confidence.toString(),
    priority: candidate.priority,
    reasoning: candidate.reasoning,
    suggestedAction: candidate.suggestedAction,
    requiresApproval: true,
    dataSourcesUsed: JSON.stringify(candidate.dataSourcesUsed),
    status: 'pending_approval',
    createdAt: new Date().toISOString()
  });

  // Send notification asking for approval
  await sendApprovalRequest(actionId, candidate);

  console.log(`[Orchestrator] Queued for approval: ${candidate.title}`);
}

/**
 * Store action for later execution
 */
async function storeQueuedAction(candidate: ProactiveActionCandidate, timing: string): Promise<void> {
  const actionId = crypto.randomUUID();

  await db.insert(proactiveActions).values({
    id: actionId,
    type: candidate.type,
    title: candidate.title,
    description: candidate.description,
    confidence: candidate.confidence.toString(),
    priority: candidate.priority,
    reasoning: candidate.reasoning,
    suggestedAction: candidate.suggestedAction,
    requiresApproval: candidate.requiresApproval,
    dataSourcesUsed: JSON.stringify(candidate.dataSourcesUsed),
    status: 'queued',
    validUntil: calculateValidUntil(timing),
    createdAt: new Date().toISOString()
  });
}

function calculateValidUntil(timing: string): string {
  const now = new Date();

  switch (timing) {
    case 'next_hour':
      now.setHours(now.getHours() + 1);
      break;
    case 'morning':
      now.setDate(now.getDate() + 1);
      now.setHours(8, 0, 0, 0);
      break;
    case 'tomorrow':
      now.setDate(now.getDate() + 1);
      break;
    case 'after_meeting':
      now.setHours(now.getHours() + 2);
      break;
    case 'when_stopped':
      now.setMinutes(now.getMinutes() + 30);
      break;
    default:
      now.setHours(now.getHours() + 4);
  }

  return now.toISOString();
}

// Action execution functions
async function sendReminder(candidate: ProactiveActionCandidate): Promise<void> {
  const { sendSMS } = await import('./twilio');
  await sendSMS(
    `⏰ ${candidate.title}\n\n${candidate.description}`
  );
}

async function sendSuggestion(candidate: ProactiveActionCandidate): Promise<void> {
  const { sendSMS } = await import('./twilio');
  await sendSMS(
    `💡 ${candidate.title}\n\n${candidate.description}`
  );
}

async function sendInsight(candidate: ProactiveActionCandidate): Promise<void> {
  const { sendSMS } = await import('./twilio');
  await sendSMS(
    `🧠 ${candidate.title}\n\n${candidate.description}`
  );
}

async function sendAlert(candidate: ProactiveActionCandidate): Promise<void> {
  const { sendSMS } = await import('./twilio');
  await sendSMS(
    `🚨 ${candidate.title}\n\n${candidate.description}`
  );
}

async function askQuestion(candidate: ProactiveActionCandidate): Promise<void> {
  const { sendSMS } = await import('./twilio');
  await sendSMS(
    `❓ ${candidate.title}\n\n${candidate.description}\n\nReply to let me know!`
  );
}

async function executeAutomation(candidate: ProactiveActionCandidate): Promise<void> {
  // Execute suggested automation
  if (candidate.suggestedAction) {
    console.log(`[Orchestrator] Executing automation: ${candidate.suggestedAction}`);
    // This would interface with the automation system
  }
}

async function sendApprovalRequest(actionId: string, candidate: ProactiveActionCandidate): Promise<void> {
  const { sendSMS } = await import('./twilio');
  await sendSMS(
    `🤖 ZEKE wants to help:\n\n${candidate.title}\n\n${candidate.description}\n\nReply YES to approve or NO to decline.`
  );
}

/**
 * Record user feedback on a proactive action
 */
export async function recordActionFeedback(
  actionId: string,
  feedbackType: 'positive' | 'negative' | 'neutral' | 'approved' | 'rejected',
  comments?: string
): Promise<void> {
  // Get the action
  const action = await db
    .select()
    .from(proactiveActions)
    .where(eq(proactiveActions.id, actionId))
    .limit(1);

  if (action.length === 0) {
    throw new Error(`Action ${actionId} not found`);
  }

  // Store feedback
  await db.insert(actionFeedback).values({
    actionId,
    actionType: action[0].type,
    feedbackType,
    comments,
    providedAt: new Date().toISOString()
  });

  // Update action status if approved/rejected
  if (feedbackType === 'approved') {
    await db
      .update(proactiveActions)
      .set({ status: 'approved' })
      .where(eq(proactiveActions.id, actionId));

    // Execute the action now
    const candidate: ProactiveActionCandidate = {
      type: action[0].type as any,
      title: action[0].title,
      description: action[0].description,
      confidence: parseFloat(action[0].confidence),
      priority: action[0].priority as any,
      reasoning: action[0].reasoning,
      suggestedAction: action[0].suggestedAction || undefined,
      requiresApproval: false,
      dataSourcesUsed: JSON.parse(action[0].dataSourcesUsed)
    };

    await executeAction(candidate);
  } else if (feedbackType === 'rejected') {
    await db
      .update(proactiveActions)
      .set({ status: 'rejected' })
      .where(eq(proactiveActions.id, actionId));
  }

  console.log(`[Orchestrator] Recorded ${feedbackType} feedback for action ${actionId}`);
}

export { ProactiveActionCandidate };

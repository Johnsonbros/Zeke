/**
 * Eval Service - OpenAI Evals API Integration for ZEKE Self-Improvement
 * 
 * Implements automated testing and improvement of ZEKE's SMS/AI processing:
 * - Collects ground truth data from failed messages and corrections
 * - Creates and manages evals for quick action patterns and AI responses
 * - Runs overnight eval analysis via batch orchestrator
 * - Suggests and auto-applies improvements based on eval results
 * 
 * Architecture:
 * - Ground truth buffer stores failed messages with expected outcomes
 * - Nightly job uploads data and runs evals
 * - Results trigger pattern improvements or prompt refinements
 */

import OpenAI from "openai";
import fs from "fs";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import { createQuickActionPattern, findQuickActionPatternByPattern } from "../db";
import type { QuickActionType } from "@shared/schema";

// ============================================
// TYPES
// ============================================

export interface GroundTruthEntry {
  id: string;
  timestamp: string;
  smsText: string;
  expectedAction: "add_grocery" | "set_reminder" | "store_memory" | "ai_chat" | "unknown";
  expectedResult?: string;
  actualAction?: string;
  actualResult?: string;
  wasCorrect: boolean;
  errorId?: string;
  correctedBy?: "user" | "auto" | "batch";
  source: "error" | "correction" | "feedback";
}

export interface EvalConfig {
  id: string;
  name: string;
  description: string;
  openaiEvalId?: string;
  createdAt: string;
  lastRunAt?: string;
  testingCriteria: EvalCriterion[];
}

export interface EvalCriterion {
  type: "string_check" | "model_grader" | "text_similarity";
  name: string;
  input: string;
  operation?: string;
  reference?: string;
  model?: string;
}

export interface EvalRunResult {
  evalId: string;
  runId: string;
  timestamp: string;
  totalItems: number;
  passedItems: number;
  failedItems: number;
  passRate: number;
  insights: string[];
  suggestedPatterns: SuggestedPattern[];
}

export interface SuggestedPattern {
  pattern: string;
  action: string;
  confidence: number;
  basedOnExamples: string[];
  autoApplySafe: boolean;
}

// Helper to map action strings to QuickActionType enum
function mapActionToQuickActionType(action: string): QuickActionType | null {
  const actionMap: Record<string, QuickActionType> = {
    "add_grocery": "add_grocery",
    "grocery": "add_grocery",
    "set_reminder": "set_reminder",
    "reminder": "set_reminder",
    "remind": "set_reminder",
    "store_memory": "store_memory",
    "memory": "store_memory",
    "remember": "store_memory",
    "list": "list",
  };
  return actionMap[action.toLowerCase()] || null;
}

// ============================================
// GROUND TRUTH BUFFER
// ============================================

const groundTruthBuffer: GroundTruthEntry[] = [];
const MAX_GROUND_TRUTH_SIZE = 200;

export function addGroundTruth(entry: Omit<GroundTruthEntry, "id" | "timestamp">): string {
  const id = uuidv4();
  const fullEntry: GroundTruthEntry = {
    id,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  groundTruthBuffer.unshift(fullEntry);
  if (groundTruthBuffer.length > MAX_GROUND_TRUTH_SIZE) {
    groundTruthBuffer.pop();
  }
  console.log(`[EvalService] Added ground truth: ${entry.source} - ${entry.expectedAction}`);
  return id;
}

export function getGroundTruth(limit = 50): GroundTruthEntry[] {
  return groundTruthBuffer.slice(0, limit);
}

export function getUnprocessedGroundTruth(): GroundTruthEntry[] {
  return groundTruthBuffer.filter(e => !e.correctedBy);
}

export function clearGroundTruth(): void {
  groundTruthBuffer.length = 0;
}

export function markGroundTruthProcessed(ids: string[], correctedBy: "auto" | "batch"): void {
  for (const entry of groundTruthBuffer) {
    if (ids.includes(entry.id)) {
      entry.correctedBy = correctedBy;
    }
  }
}

// ============================================
// EVAL DEFINITIONS
// ============================================

const ZEKE_EVALS: EvalConfig[] = [
  {
    id: "quick_action_matching",
    name: "Quick Action Pattern Matching",
    description: "Tests if SMS messages are correctly matched to quick action patterns",
    createdAt: new Date().toISOString(),
    testingCriteria: [
      {
        type: "string_check",
        name: "Action type match",
        input: "{{ sample.predicted_action }}",
        operation: "eq",
        reference: "{{ item.expected_action }}",
      },
    ],
  },
  {
    id: "ai_response_quality",
    name: "AI Response Quality",
    description: "Evaluates if AI responses are helpful and accurate",
    createdAt: new Date().toISOString(),
    testingCriteria: [
      {
        type: "model_grader",
        name: "Response helpfulness",
        input: "{{ sample.response }}",
        model: "gpt-4o-mini",
      },
    ],
  },
  {
    id: "error_recovery",
    name: "Error Recovery Success",
    description: "Tests if self-healing mechanisms successfully recover from errors",
    createdAt: new Date().toISOString(),
    testingCriteria: [
      {
        type: "string_check",
        name: "Recovery success",
        input: "{{ sample.recovered }}",
        operation: "eq",
        reference: "true",
      },
    ],
  },
];

// ============================================
// OPENAI EVALS API INTEGRATION
// ============================================

let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured");
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

export async function createOrGetEval(evalConfig: EvalConfig): Promise<string> {
  if (evalConfig.openaiEvalId) {
    return evalConfig.openaiEvalId;
  }
  
  const client = getOpenAIClient();
  
  try {
    const evalObj = await client.evals.create({
      name: evalConfig.name,
      data_source_config: {
        type: "custom",
        item_schema: {
          type: "object",
          properties: {
            sms_text: { type: "string" },
            expected_action: { type: "string" },
            expected_result: { type: "string" },
          },
          required: ["sms_text", "expected_action"],
        },
        include_sample_schema: true,
      },
      testing_criteria: evalConfig.testingCriteria.map(c => ({
        type: c.type,
        name: c.name,
        input: c.input,
        operation: c.operation,
        reference: c.reference,
      })),
    });
    
    evalConfig.openaiEvalId = evalObj.id;
    console.log(`[EvalService] Created eval: ${evalConfig.name} (${evalObj.id})`);
    return evalObj.id;
  } catch (error) {
    console.error(`[EvalService] Failed to create eval:`, error);
    throw error;
  }
}

export async function uploadGroundTruthFile(entries: GroundTruthEntry[]): Promise<string> {
  const client = getOpenAIClient();
  
  const jsonlContent = entries.map(e => JSON.stringify({
    item: {
      sms_text: e.smsText,
      expected_action: e.expectedAction,
      expected_result: e.expectedResult || "",
    },
  })).join("\n");
  
  const tmpFile = path.join(os.tmpdir(), `zeke_eval_${Date.now()}.jsonl`);
  fs.writeFileSync(tmpFile, jsonlContent);
  
  try {
    const file = await client.files.create({
      file: fs.createReadStream(tmpFile),
      purpose: "evals",
    });
    
    console.log(`[EvalService] Uploaded eval data file: ${file.id} (${entries.length} items)`);
    return file.id;
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

export async function runEval(
  evalId: string,
  fileId: string,
  promptTemplate: string
): Promise<EvalRunResult> {
  const client = getOpenAIClient();
  
  try {
    const run = await client.evals.runs.create(evalId, {
      name: `ZEKE auto-eval ${new Date().toISOString()}`,
      data_source: {
        type: "responses",
        model: "gpt-4o-mini",
        input_messages: {
          type: "template",
          template: [
            { role: "developer", content: promptTemplate },
            { role: "user", content: "{{ item.sms_text }}" },
          ],
        },
        source: { type: "file_id", id: fileId },
      },
    });
    
    console.log(`[EvalService] Started eval run: ${run.id}`);
    
    // Return initial result - full results come from polling
    return {
      evalId,
      runId: run.id,
      timestamp: new Date().toISOString(),
      totalItems: 0,
      passedItems: 0,
      failedItems: 0,
      passRate: 0,
      insights: [],
      suggestedPatterns: [],
    };
  } catch (error) {
    console.error(`[EvalService] Failed to run eval:`, error);
    throw error;
  }
}

// ============================================
// PATTERN SUGGESTION ENGINE
// ============================================

const PATTERN_ANALYSIS_PROMPT = `You are analyzing failed SMS messages to suggest new quick action patterns for ZEKE, an AI assistant.

Current quick action patterns:
- Grocery: "buy X", "need X", "get X", "X to shopping list", "add X to groceries"
- Reminders: "remind me to X", "don't forget X", "reminder: X"
- Memory: "remember X", "note that X", "FYI X"

Analyze these failed messages and suggest new regex patterns that would correctly match them:

Failed messages:
{{FAILED_MESSAGES}}

For each suggested pattern, provide:
1. The regex pattern
2. The action type (add_grocery, set_reminder, store_memory)
3. Confidence score (0-1)
4. Whether it's safe to auto-apply (no risk of false positives)

Respond in JSON format:
{
  "patterns": [
    {
      "pattern": "regex pattern here",
      "action": "action_type",
      "confidence": 0.95,
      "autoApplySafe": true,
      "reasoning": "explanation"
    }
  ]
}`;

export async function analyzeFailedMessagesForPatterns(
  failedMessages: GroundTruthEntry[]
): Promise<SuggestedPattern[]> {
  if (failedMessages.length === 0) {
    return [];
  }
  
  const client = getOpenAIClient();
  
  const messagesText = failedMessages
    .map(m => `- "${m.smsText}" (expected: ${m.expectedAction})`)
    .join("\n");
  
  const prompt = PATTERN_ANALYSIS_PROMPT.replace("{{FAILED_MESSAGES}}", messagesText);
  
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) return [];
    
    const result = JSON.parse(content);
    
    return (result.patterns || []).map((p: any) => ({
      pattern: p.pattern,
      action: p.action,
      confidence: p.confidence,
      basedOnExamples: failedMessages.map(m => m.smsText),
      autoApplySafe: p.autoApplySafe && p.confidence >= 0.9,
    }));
  } catch (error) {
    console.error(`[EvalService] Pattern analysis failed:`, error);
    return [];
  }
}

// ============================================
// NIGHTLY EVAL JOB
// ============================================

export interface NightlyEvalResult {
  timestamp: string;
  groundTruthProcessed: number;
  evalsRun: number;
  patternsGenerated: number;
  patternsAutoApplied: number;
  insights: string[];
}

export async function runNightlyEvalJob(): Promise<NightlyEvalResult> {
  console.log("[EvalService] Starting nightly eval job...");
  
  const result: NightlyEvalResult = {
    timestamp: new Date().toISOString(),
    groundTruthProcessed: 0,
    evalsRun: 0,
    patternsGenerated: 0,
    patternsAutoApplied: 0,
    insights: [],
  };
  
  try {
    // Get unprocessed ground truth
    const unprocessed = getUnprocessedGroundTruth();
    result.groundTruthProcessed = unprocessed.length;
    
    if (unprocessed.length === 0) {
      result.insights.push("No new ground truth data to process");
      return result;
    }
    
    // Group by expected action for focused analysis
    const byAction = new Map<string, GroundTruthEntry[]>();
    for (const entry of unprocessed) {
      const list = byAction.get(entry.expectedAction) || [];
      list.push(entry);
      byAction.set(entry.expectedAction, list);
    }
    
    // Analyze failed quick actions for new patterns
    const quickActionFailures = unprocessed.filter(
      e => e.source === "error" && e.expectedAction !== "ai_chat"
    );
    
    if (quickActionFailures.length >= 3) {
      const suggestions = await analyzeFailedMessagesForPatterns(quickActionFailures);
      result.patternsGenerated = suggestions.length;
      
      // Auto-apply safe patterns
      const safePatterns = suggestions.filter(s => s.autoApplySafe);
      result.patternsAutoApplied = safePatterns.length;
      
      for (const pattern of safePatterns) {
        result.insights.push(
          `Auto-applied pattern: ${pattern.pattern} -> ${pattern.action} (confidence: ${pattern.confidence})`
        );

        // Add pattern to database for dynamic matching
        try {
          // Check if pattern already exists
          const existing = await findQuickActionPatternByPattern(pattern.pattern);
          if (!existing) {
            // Map action string to QuickActionType
            const actionType = mapActionToQuickActionType(pattern.action);
            if (actionType) {
              await createQuickActionPattern({
                pattern: pattern.pattern,
                action: actionType,
                description: `Auto-learned pattern from eval: matches ${pattern.action}`,
                confidenceScore: pattern.confidence.toString(),
                examples: JSON.stringify(pattern.basedOnExamples),
                source: "auto",
                isActive: true,
              });
              console.log(`[EvalService] Added new quick action pattern: ${pattern.pattern} -> ${actionType}`);
            }
          } else {
            console.log(`[EvalService] Pattern already exists: ${pattern.pattern}`);
          }
        } catch (err) {
          console.error(`[EvalService] Failed to add pattern: ${pattern.pattern}`, err);
        }
      }
      
      // Log unsafe patterns for review
      const unsafePatterns = suggestions.filter(s => !s.autoApplySafe);
      for (const pattern of unsafePatterns) {
        result.insights.push(
          `Suggested pattern (needs review): ${pattern.pattern} -> ${pattern.action} (confidence: ${pattern.confidence})`
        );
      }
    }
    
    // Mark processed
    markGroundTruthProcessed(unprocessed.map(e => e.id), "batch");
    
    console.log(`[EvalService] Nightly eval complete:`, result);
    return result;
  } catch (error) {
    console.error("[EvalService] Nightly eval job failed:", error);
    result.insights.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }
}

// ============================================
// API ENDPOINTS HELPERS
// ============================================

export function getEvalStats() {
  return {
    groundTruthTotal: groundTruthBuffer.length,
    groundTruthUnprocessed: getUnprocessedGroundTruth().length,
    evalConfigs: ZEKE_EVALS.length,
    lastGroundTruth: groundTruthBuffer[0] || null,
  };
}

export function getEvalConfigs(): EvalConfig[] {
  return ZEKE_EVALS;
}

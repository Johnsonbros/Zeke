/**
 * Enhanced NLP Parser - Advanced multi-stage natural language processing
 * 
 * This module implements a Transformer-based NLP pipeline for nuanced understanding
 * of complex commands with contextual disambiguation.
 * 
 * Pipeline Stages:
 * 1. Intent Classification - Determine what the user wants to do
 * 2. Entity Extraction - Extract structured data from the input
 * 3. Temporal Resolution - Parse ambiguous time references
 * 4. Context Integration - Query knowledge graph for disambiguation
 * 5. Automation Generation - Create final structured automation
 */

import OpenAI from "openai";
import type {
  NLTriggerType,
  NLActionType,
  InsertNLAutomation
} from "@shared/schema";
import { queryKnowledgeGraph } from "./knowledgeGraph";
import { getSmartMemoryContext } from "./semanticMemory";
import { contextCache, CACHE_TTL, createCacheKey } from "./contextCache";

const openai = new OpenAI();

export type IntentCategory = 
  | "reminder"
  | "task_creation"
  | "grocery"
  | "notification"
  | "sms"
  | "summary"
  | "automation"
  | "query"
  | "unknown";

export interface ExtractedEntity {
  type: "person" | "location" | "time" | "item" | "event" | "quantity" | "priority" | "category";
  value: string;
  normalized?: string;
  confidence: number;
  position: { start: number; end: number };
}

export interface TemporalResolution {
  type: "absolute" | "relative" | "recurring" | "contextual";
  resolved: string;
  cronExpression?: string;
  description: string;
  confidence: number;
  ambiguous: boolean;
  alternatives?: string[];
}

export interface IntentClassification {
  primary: IntentCategory;
  secondary?: IntentCategory;
  confidence: number;
  subIntent?: string;
  requiresContext: boolean;
}

export interface ContextDisambiguation {
  needed: boolean;
  disambiguatedEntities: Map<string, string>;
  relatedMemories: string[];
  suggestedInterpretation?: string;
}

export interface EnhancedParseResult {
  success: boolean;
  intent: IntentClassification;
  entities: ExtractedEntity[];
  temporal?: TemporalResolution;
  disambiguation?: ContextDisambiguation;
  automation?: {
    name: string;
    triggerType: NLTriggerType;
    triggerConfig: string;
    actionType: NLActionType;
    actionConfig: string;
    conditions?: string;
    explanation: string;
  };
  error?: string;
  suggestions?: string[];
  processingStages: {
    stage: string;
    durationMs: number;
    result: "success" | "partial" | "skipped" | "error";
  }[];
}

const INTENT_CLASSIFICATION_PROMPT = `You are an intent classifier for a personal AI assistant. Analyze the user's natural language input and classify their intent.

INTENT CATEGORIES:
- reminder: User wants to be reminded about something
- task_creation: User wants to create a task or to-do item
- grocery: User wants to add items to grocery/shopping list
- notification: User wants to receive a notification
- sms: User wants to send an SMS message
- summary: User wants a summary or briefing
- automation: User wants to create a recurring automation rule
- query: User is asking a question (not an action request)
- unknown: Cannot determine intent

Respond with JSON:
{
  "primary": "intent_category",
  "secondary": "optional_secondary_intent",
  "confidence": 0.0-1.0,
  "subIntent": "more_specific_intent",
  "requiresContext": true/false (if ambiguous and needs memory/context to resolve)
}`;

const ENTITY_EXTRACTION_PROMPT = `You are an entity extractor for a personal AI assistant. Extract all relevant entities from the user's input.

ENTITY TYPES:
- person: Names of people (family members, contacts, etc.)
- location: Places, stores, addresses
- time: Time references (dates, times, durations, recurring patterns)
- item: Objects, products, groceries
- event: Events, appointments, activities
- quantity: Numbers, amounts
- priority: Urgency levels (high, low, urgent, etc.)
- category: Categories or labels

For each entity, provide:
- type: Entity type
- value: The raw text
- normalized: Standardized form (if applicable)
- confidence: 0.0-1.0
- position: { start: number, end: number } character positions

Respond with JSON:
{
  "entities": [
    { "type": "...", "value": "...", "normalized": "...", "confidence": 0.9, "position": { "start": 0, "end": 10 } }
  ]
}`;

const TEMPORAL_RESOLUTION_PROMPT = `You are a temporal expression resolver for a personal AI assistant. Parse and resolve time references to concrete schedules.

CURRENT CONTEXT:
- Current time: {{currentTime}}
- Current timezone: America/New_York
- Day of week: {{dayOfWeek}}

RESOLUTION TYPES:
- absolute: Specific date/time (e.g., "December 15th at 3pm")
- relative: Relative to now (e.g., "in 2 hours", "tomorrow morning")
- recurring: Repeating pattern (e.g., "every Monday", "weekly")
- contextual: Depends on context (e.g., "later this week", "when I get home")

For recurring patterns, generate a cron expression.

Common cron patterns:
- "every morning at 9am" → "0 9 * * *"
- "every weekday" → "0 9 * * 1-5"
- "every Sunday" → "0 9 * * 0"
- "every hour" → "0 * * * *"
- "every day at noon" → "0 12 * * *"

Respond with JSON:
{
  "type": "absolute|relative|recurring|contextual",
  "resolved": "ISO datetime or cron expression",
  "cronExpression": "if recurring, the cron pattern",
  "description": "Human-readable description",
  "confidence": 0.0-1.0,
  "ambiguous": true/false,
  "alternatives": ["other possible interpretations if ambiguous"]
}`;

const AUTOMATION_GENERATION_PROMPT = `You are an automation generator for a personal AI assistant named ZEKE. Generate a structured automation from the analyzed intent, entities, and temporal data.

INPUT ANALYSIS:
- Intent: {{intent}}
- Entities: {{entities}}
- Temporal: {{temporal}}
- Context: {{context}}

TRIGGER TYPES:
1. "time" - Cron-based schedules
   - Config: { cronExpression: "0 9 * * *", timezone: "America/New_York", description: "..." }

2. "event" - System events
   - Config: { eventType: "task_completed|task_created|reminder_triggered|...", filters: {} }

3. "condition" - State-based triggers
   - Config: { conditionType: "tasks_overdue", threshold: 3, checkInterval: "0 */4 * * *" }

4. "keyword" - Message triggers
   - Config: { keywords: ["..."], matchAll: false }

5. "location" - Location triggers
   - Config: { placeName: "...", triggerOnArrive: true, triggerOnLeave: false }

ACTION TYPES:
1. "send_sms" - { recipientPhone: "", messageTemplate: "..." }
2. "create_task" - { titleTemplate: "...", priority: "medium", dueDateOffset: "+1d" }
3. "add_grocery" - { itemTemplate: "...", quantity: "1", category: "..." }
4. "set_reminder" - { messageTemplate: "...", timeOffset: "+30m" }
5. "notify" - { titleTemplate: "...", contentTemplate: "...", priority: "normal" }
6. "generate_summary" - { summaryType: "tasks|calendar|daily_briefing" }

Respond with JSON:
{
  "success": true,
  "automation": {
    "name": "Short descriptive name",
    "triggerType": "time|event|condition|keyword|location",
    "triggerConfig": { ... },
    "actionType": "...",
    "actionConfig": { ... },
    "conditions": null,
    "explanation": "Human-readable explanation"
  }
}`;

export class EnhancedNLParser {
  private useParallelProcessing: boolean = true;

  async parse(
    phrase: string,
    options: {
      includeContext?: boolean;
      maxContextTokens?: number;
    } = {}
  ): Promise<EnhancedParseResult> {
    const stages: EnhancedParseResult["processingStages"] = [];
    const startTime = Date.now();

    try {
      console.log(`[EnhancedNLParser] Starting multi-stage parse: "${phrase}"`);

      const [intentResult, entitiesResult] = await Promise.all([
        this.classifyIntent(phrase, stages),
        this.extractEntities(phrase, stages),
      ]);

      if (!intentResult.success || intentResult.intent.primary === "unknown") {
        return {
          success: false,
          intent: intentResult.intent,
          entities: entitiesResult.entities,
          error: "Could not determine user intent",
          suggestions: [
            "Try being more specific about what action you want",
            "Include a time reference for scheduling",
            "Mention what you want to be reminded about",
          ],
          processingStages: stages,
        };
      }

      const temporalEntities = entitiesResult.entities.filter(e => e.type === "time");
      let temporal: TemporalResolution | undefined;
      
      if (temporalEntities.length > 0 || this.hasImplicitTemporal(phrase)) {
        temporal = await this.resolveTemporal(phrase, temporalEntities, stages);
      }

      let disambiguation: ContextDisambiguation | undefined;
      if (options.includeContext && intentResult.intent.requiresContext) {
        disambiguation = await this.disambiguateWithContext(
          phrase,
          entitiesResult.entities,
          options.maxContextTokens || 500,
          stages
        );
      }

      const automation = await this.generateAutomation(
        phrase,
        intentResult.intent,
        entitiesResult.entities,
        temporal,
        disambiguation,
        stages
      );

      const totalDuration = Date.now() - startTime;
      console.log(`[EnhancedNLParser] Completed in ${totalDuration}ms`);

      return {
        success: automation.success,
        intent: intentResult.intent,
        entities: entitiesResult.entities,
        temporal,
        disambiguation,
        automation: automation.automation,
        error: automation.error,
        suggestions: automation.suggestions,
        processingStages: stages,
      };

    } catch (error: any) {
      console.error("[EnhancedNLParser] Error:", error);
      return {
        success: false,
        intent: { primary: "unknown", confidence: 0, requiresContext: false },
        entities: [],
        error: `Parse failed: ${error.message}`,
        processingStages: stages,
      };
    }
  }

  private async classifyIntent(
    phrase: string,
    stages: EnhancedParseResult["processingStages"]
  ): Promise<{ success: boolean; intent: IntentClassification }> {
    const stageStart = Date.now();
    
    try {
      const cacheKey = createCacheKey("nlp", "intent", this.hashPhrase(phrase));
      const cached = contextCache.get<IntentClassification>(cacheKey);
      
      if (cached) {
        stages.push({ stage: "intent_classification", durationMs: Date.now() - stageStart, result: "success" });
        return { success: true, intent: cached };
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: INTENT_CLASSIFICATION_PROMPT },
          { role: "user", content: phrase }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 200,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        stages.push({ stage: "intent_classification", durationMs: Date.now() - stageStart, result: "error" });
        return { success: false, intent: { primary: "unknown", confidence: 0, requiresContext: false } };
      }

      const intent = JSON.parse(content) as IntentClassification;
      
      contextCache.set(cacheKey, intent, 60000);

      stages.push({ stage: "intent_classification", durationMs: Date.now() - stageStart, result: "success" });
      return { success: true, intent };

    } catch (error) {
      console.error("[EnhancedNLParser] Intent classification error:", error);
      stages.push({ stage: "intent_classification", durationMs: Date.now() - stageStart, result: "error" });
      return { success: false, intent: { primary: "unknown", confidence: 0, requiresContext: false } };
    }
  }

  private async extractEntities(
    phrase: string,
    stages: EnhancedParseResult["processingStages"]
  ): Promise<{ entities: ExtractedEntity[] }> {
    const stageStart = Date.now();
    
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: ENTITY_EXTRACTION_PROMPT },
          { role: "user", content: phrase }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        stages.push({ stage: "entity_extraction", durationMs: Date.now() - stageStart, result: "error" });
        return { entities: [] };
      }

      const result = JSON.parse(content);
      stages.push({ stage: "entity_extraction", durationMs: Date.now() - stageStart, result: "success" });
      return { entities: result.entities || [] };

    } catch (error) {
      console.error("[EnhancedNLParser] Entity extraction error:", error);
      stages.push({ stage: "entity_extraction", durationMs: Date.now() - stageStart, result: "error" });
      return { entities: [] };
    }
  }

  private async resolveTemporal(
    phrase: string,
    temporalEntities: ExtractedEntity[],
    stages: EnhancedParseResult["processingStages"]
  ): Promise<TemporalResolution> {
    const stageStart = Date.now();
    
    try {
      const now = new Date();
      const prompt = TEMPORAL_RESOLUTION_PROMPT
        .replace("{{currentTime}}", now.toISOString())
        .replace("{{dayOfWeek}}", now.toLocaleDateString("en-US", { weekday: "long" }));

      const userContent = `Phrase: "${phrase}"\nExtracted time references: ${JSON.stringify(temporalEntities.map(e => e.value))}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: userContent }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 300,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        stages.push({ stage: "temporal_resolution", durationMs: Date.now() - stageStart, result: "error" });
        return this.getDefaultTemporal();
      }

      const result = JSON.parse(content) as TemporalResolution;
      stages.push({ stage: "temporal_resolution", durationMs: Date.now() - stageStart, result: "success" });
      return result;

    } catch (error) {
      console.error("[EnhancedNLParser] Temporal resolution error:", error);
      stages.push({ stage: "temporal_resolution", durationMs: Date.now() - stageStart, result: "error" });
      return this.getDefaultTemporal();
    }
  }

  private async disambiguateWithContext(
    phrase: string,
    entities: ExtractedEntity[],
    maxTokens: number,
    stages: EnhancedParseResult["processingStages"]
  ): Promise<ContextDisambiguation> {
    const stageStart = Date.now();
    
    try {
      const [memoryContext, graphResults] = await Promise.all([
        getSmartMemoryContext(phrase).catch(() => ""),
        this.queryGraphForEntities(entities).catch(() => []),
      ]);

      const disambiguatedEntities = new Map<string, string>();
      const relatedMemories: string[] = [];

      for (const entity of entities.filter(e => e.type === "person" || e.type === "location")) {
        const graphMatch = graphResults.find(
          (r: any) => r.name?.toLowerCase().includes(entity.value.toLowerCase())
        );
        if (graphMatch) {
          disambiguatedEntities.set(entity.value, graphMatch.id);
        }
      }

      if (memoryContext && memoryContext.length > 0) {
        const memories = memoryContext.split("\n").filter(m => m.trim()).slice(0, 3);
        relatedMemories.push(...memories);
      }

      stages.push({ stage: "context_disambiguation", durationMs: Date.now() - stageStart, result: "success" });
      
      return {
        needed: true,
        disambiguatedEntities,
        relatedMemories,
        suggestedInterpretation: relatedMemories.length > 0 
          ? `Based on your history: ${relatedMemories[0]}`
          : undefined,
      };

    } catch (error) {
      console.error("[EnhancedNLParser] Context disambiguation error:", error);
      stages.push({ stage: "context_disambiguation", durationMs: Date.now() - stageStart, result: "error" });
      return { needed: false, disambiguatedEntities: new Map(), relatedMemories: [] };
    }
  }

  private async queryGraphForEntities(entities: ExtractedEntity[]): Promise<any[]> {
    const personAndLocationEntities = entities.filter(
      e => e.type === "person" || e.type === "location"
    );
    
    if (personAndLocationEntities.length === 0) {
      return [];
    }

    try {
      const results = await Promise.all(
        personAndLocationEntities.slice(0, 3).map(async entity => {
          try {
            const graphResult = await queryKnowledgeGraph(entity.value, {
              includeTypes: entity.type === "person" ? ["person"] : ["location"],
              maxNodes: 1,
            });
            return graphResult.entities[0] || null;
          } catch {
            return null;
          }
        })
      );
      
      return results.filter(r => r !== null);
    } catch {
      return [];
    }
  }

  private async generateAutomation(
    phrase: string,
    intent: IntentClassification,
    entities: ExtractedEntity[],
    temporal: TemporalResolution | undefined,
    disambiguation: ContextDisambiguation | undefined,
    stages: EnhancedParseResult["processingStages"]
  ): Promise<{
    success: boolean;
    automation?: EnhancedParseResult["automation"];
    error?: string;
    suggestions?: string[];
  }> {
    const stageStart = Date.now();
    
    try {
      const contextStr = disambiguation?.relatedMemories.length 
        ? disambiguation.relatedMemories.slice(0, 2).join("; ")
        : "No additional context";

      const prompt = AUTOMATION_GENERATION_PROMPT
        .replace("{{intent}}", JSON.stringify(intent))
        .replace("{{entities}}", JSON.stringify(entities))
        .replace("{{temporal}}", JSON.stringify(temporal || {}))
        .replace("{{context}}", contextStr);

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: phrase }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 800,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        stages.push({ stage: "automation_generation", durationMs: Date.now() - stageStart, result: "error" });
        return { success: false, error: "No response from AI model" };
      }

      const result = JSON.parse(content);
      
      if (!result.success || !result.automation) {
        stages.push({ stage: "automation_generation", durationMs: Date.now() - stageStart, result: "error" });
        return {
          success: false,
          error: result.error || "Failed to generate automation",
          suggestions: result.suggestions,
        };
      }

      const automation = result.automation;
      const triggerConfig = typeof automation.triggerConfig === "string"
        ? automation.triggerConfig
        : JSON.stringify(automation.triggerConfig);
      const actionConfig = typeof automation.actionConfig === "string"
        ? automation.actionConfig
        : JSON.stringify(automation.actionConfig);
      const conditions = automation.conditions
        ? (typeof automation.conditions === "string" ? automation.conditions : JSON.stringify(automation.conditions))
        : undefined;

      stages.push({ stage: "automation_generation", durationMs: Date.now() - stageStart, result: "success" });
      
      return {
        success: true,
        automation: {
          name: automation.name,
          triggerType: automation.triggerType,
          triggerConfig,
          actionType: automation.actionType,
          actionConfig,
          conditions,
          explanation: automation.explanation || "",
        },
      };

    } catch (error: any) {
      console.error("[EnhancedNLParser] Automation generation error:", error);
      stages.push({ stage: "automation_generation", durationMs: Date.now() - stageStart, result: "error" });
      return { success: false, error: `Generation failed: ${error.message}` };
    }
  }

  private hasImplicitTemporal(phrase: string): boolean {
    const temporalKeywords = [
      "every", "daily", "weekly", "monthly", "morning", "evening", "night",
      "remind", "later", "soon", "tomorrow", "today", "next", "when",
      "after", "before", "hour", "minute", "day", "week", "month",
    ];
    const lowerPhrase = phrase.toLowerCase();
    return temporalKeywords.some(keyword => lowerPhrase.includes(keyword));
  }

  private getDefaultTemporal(): TemporalResolution {
    return {
      type: "relative",
      resolved: new Date(Date.now() + 3600000).toISOString(),
      description: "In 1 hour (default)",
      confidence: 0.5,
      ambiguous: true,
      alternatives: ["Tomorrow morning", "Later today"],
    };
  }

  private hashPhrase(phrase: string): string {
    let hash = 0;
    for (let i = 0; i < phrase.length; i++) {
      const char = phrase.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}

export function convertEnhancedToInsertAutomation(
  originalPhrase: string,
  parsed: EnhancedParseResult
): InsertNLAutomation | null {
  if (!parsed.success || !parsed.automation) {
    return null;
  }

  return {
    name: parsed.automation.name,
    originalPhrase,
    triggerType: parsed.automation.triggerType,
    triggerConfig: parsed.automation.triggerConfig,
    actionType: parsed.automation.actionType,
    actionConfig: parsed.automation.actionConfig,
    conditions: parsed.automation.conditions || null,
    enabled: true,
  };
}

export const enhancedNLParser = new EnhancedNLParser();

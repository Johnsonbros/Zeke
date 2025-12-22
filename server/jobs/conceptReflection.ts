/**
 * Concept Reflection Batch Job
 * 
 * Runs after-hours to analyze accumulated memories and extract deeper patterns/concepts.
 * This is where ZEKE develops genuine understanding through reflection, not just recording facts.
 * 
 * Core concepts include:
 * - Terminology: Personal vocabulary patterns ("brother" = Freemason brother)
 * - Relationship patterns: How the user relates to groups of people
 * - Identity: Who the user is and their social identity markers
 * - Values: What matters to the user
 * - Routines: Behavioral patterns
 * - Domain knowledge: Specialized knowledge areas (e.g., Freemasonry, plumbing business)
 */

import * as cron from "node-cron";
import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import { getAllMemoryNotes } from "../db";
import type { MemoryNote, CoreConcept, InsertCoreConcept, ConceptType } from "@shared/schema";

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

interface ReflectionConfig {
  enabled: boolean;
  cronSchedule: string;
  timezone: string;
}

let config: ReflectionConfig = {
  enabled: true,
  cronSchedule: "30 3 * * *",
  timezone: "America/New_York",
};

let scheduledTask: cron.ScheduledTask | null = null;
let lastRunTime: Date | null = null;
let lastRunStatus: "success" | "failed" | "pending" | null = null;

const REFLECTION_PROMPT = `You are a deep understanding agent for ZEKE, a personal AI assistant. Your job is to analyze memories and extract deeper patterns, concepts, and understanding about the user.

You are reflecting on memories to build CORE CONCEPTS - abstract understanding that goes beyond individual facts.

Types of concepts to extract:
- terminology: Personal vocabulary patterns (e.g., "when user says 'brother', they typically mean Freemason brother")
- relationship_pattern: How the user relates to groups (e.g., "user is part of Masonic community")
- identity: Social identity markers (e.g., "user is a Freemason and this is important to their social life")
- value: What matters to them deeply
- routine: Behavioral patterns across time
- preference_pattern: Consistent preferences that span multiple situations
- social_context: Understanding of their social world
- domain_knowledge: Areas of specialized knowledge

For each concept, provide:
1. A clear, concise concept statement
2. A description explaining the deeper meaning
3. Examples from the memories that support this concept
4. Confidence score (0.0-1.0)

Output STRICT JSON matching this schema:
{
  "concepts": [
    {
      "type": "terminology|relationship_pattern|identity|value|routine|preference_pattern|social_context|domain_knowledge",
      "concept": "Brief concept statement",
      "description": "Deeper explanation of what this means for understanding the user",
      "examples": ["example 1 from memories", "example 2"],
      "confidence": 0.0-1.0,
      "source_memory_ids": ["id1", "id2"]
    }
  ],
  "insights": "Brief narrative of what you learned about this person through reflection"
}`;

interface ExtractedConcept {
  type: ConceptType;
  concept: string;
  description: string;
  examples: string[];
  confidence: number;
  source_memory_ids: string[];
}

interface ReflectionResult {
  concepts: ExtractedConcept[];
  insights: string;
}

export async function runConceptReflection(): Promise<{
  conceptsCreated: number;
  conceptsUpdated: number;
  insights: string;
}> {
  console.log("[ConceptReflection] Starting reflection job...");
  lastRunStatus = "pending";
  
  try {
    const memories = getAllMemoryNotes().filter(m => 
      !m.isSuperseded && 
      m.isActive &&
      (m.type === "fact" || m.type === "preference")
    );
    
    if (memories.length === 0) {
      console.log("[ConceptReflection] No memories to reflect on");
      lastRunStatus = "success";
      lastRunTime = new Date();
      return { conceptsCreated: 0, conceptsUpdated: 0, insights: "No memories to analyze" };
    }
    
    const recentMemories = memories
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 100);
    
    const memoryContent = recentMemories.map(m => 
      `[${m.id}] [${m.type}] ${m.content}${m.context ? ` (context: ${m.context})` : ""}`
    ).join("\n");
    
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: REFLECTION_PROMPT },
        { 
          role: "user", 
          content: `Reflect on these memories and extract core concepts:\n\n${memoryContent}` 
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2000,
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from reflection");
    }
    
    const result: ReflectionResult = JSON.parse(content);
    
    let conceptsCreated = 0;
    let conceptsUpdated = 0;
    
    for (const concept of result.concepts) {
      const existing = await findExistingConcept(concept.concept);
      
      if (existing) {
        await updateCoreConcept(existing.id, {
          description: concept.description,
          examples: JSON.stringify(concept.examples),
          confidenceScore: String(concept.confidence),
          sourceMemoryIds: JSON.stringify(concept.source_memory_ids),
        });
        conceptsUpdated++;
        console.log(`[ConceptReflection] Updated concept: ${concept.concept}`);
      } else {
        await createCoreConcept({
          type: concept.type,
          concept: concept.concept,
          description: concept.description,
          examples: JSON.stringify(concept.examples),
          confidenceScore: String(concept.confidence),
          sourceMemoryIds: JSON.stringify(concept.source_memory_ids),
        });
        conceptsCreated++;
        console.log(`[ConceptReflection] Created concept: ${concept.concept}`);
      }
    }
    
    console.log(`[ConceptReflection] Complete. Created: ${conceptsCreated}, Updated: ${conceptsUpdated}`);
    console.log(`[ConceptReflection] Insights: ${result.insights}`);
    
    lastRunStatus = "success";
    lastRunTime = new Date();
    
    return {
      conceptsCreated,
      conceptsUpdated,
      insights: result.insights,
    };
  } catch (error) {
    console.error("[ConceptReflection] Error:", error);
    lastRunStatus = "failed";
    lastRunTime = new Date();
    throw error;
  }
}

import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "zeke.db");

function getDb(): Database.Database {
  return new Database(dbPath);
}

async function findExistingConcept(conceptText: string): Promise<CoreConcept | null> {
  const db = getDb();
  try {
    const result = db.prepare(`
      SELECT * FROM core_concepts 
      WHERE concept = ? AND is_active = 1
      LIMIT 1
    `).get(conceptText) as CoreConcept | undefined;
    return result || null;
  } finally {
    db.close();
  }
}

async function createCoreConcept(data: InsertCoreConcept): Promise<CoreConcept> {
  const db = getDb();
  const now = new Date().toISOString();
  const id = uuidv4();
  
  try {
    db.prepare(`
      INSERT INTO core_concepts (id, type, concept, description, examples, source_memory_ids, confidence_score, usage_count, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)
    `).run(
      id,
      data.type,
      data.concept,
      data.description,
      data.examples || null,
      data.sourceMemoryIds || null,
      data.confidenceScore || "0.7",
      now,
      now
    );
    
    return db.prepare("SELECT * FROM core_concepts WHERE id = ?").get(id) as CoreConcept;
  } finally {
    db.close();
  }
}

async function updateCoreConcept(id: string, updates: Partial<InsertCoreConcept>): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  
  try {
    const setClauses: string[] = ["updated_at = ?"];
    const values: any[] = [now];
    
    if (updates.description) {
      setClauses.push("description = ?");
      values.push(updates.description);
    }
    if (updates.examples) {
      setClauses.push("examples = ?");
      values.push(updates.examples);
    }
    if (updates.confidenceScore) {
      setClauses.push("confidence_score = ?");
      values.push(updates.confidenceScore);
    }
    if (updates.sourceMemoryIds) {
      setClauses.push("source_memory_ids = ?");
      values.push(updates.sourceMemoryIds);
    }
    
    values.push(id);
    
    db.prepare(`
      UPDATE core_concepts SET ${setClauses.join(", ")} WHERE id = ?
    `).run(...values);
  } finally {
    db.close();
  }
}

export function getAllCoreConcepts(): CoreConcept[] {
  const db = getDb();
  try {
    return db.prepare(`
      SELECT * FROM core_concepts 
      WHERE is_active = 1 
      ORDER BY confidence_score DESC, usage_count DESC
    `).all() as CoreConcept[];
  } finally {
    db.close();
  }
}

export function getCoreConceptsByType(type: ConceptType): CoreConcept[] {
  const db = getDb();
  try {
    return db.prepare(`
      SELECT * FROM core_concepts 
      WHERE type = ? AND is_active = 1 
      ORDER BY confidence_score DESC
    `).all(type) as CoreConcept[];
  } finally {
    db.close();
  }
}

export function getTerminologyContext(): string {
  const concepts = getCoreConceptsByType("terminology");
  if (concepts.length === 0) return "";
  
  return concepts.map(c => `- ${c.concept}: ${c.description}`).join("\n");
}

export function getIdentityContext(): string {
  const identityConcepts = getCoreConceptsByType("identity");
  const socialConcepts = getCoreConceptsByType("social_context");
  const allConcepts = [...identityConcepts, ...socialConcepts];
  
  if (allConcepts.length === 0) return "";
  
  return allConcepts.map(c => `- ${c.concept}`).join("\n");
}

export function getCoreConceptsContext(): string {
  const concepts = getAllCoreConcepts();
  if (concepts.length === 0) return "";
  
  const grouped: Record<string, CoreConcept[]> = {};
  for (const c of concepts) {
    if (!grouped[c.type]) grouped[c.type] = [];
    grouped[c.type].push(c);
  }
  
  const sections: string[] = [];
  
  if (grouped.terminology?.length) {
    sections.push("**Personal Vocabulary:**\n" + 
      grouped.terminology.map(c => `- ${c.concept}`).join("\n"));
  }
  
  if (grouped.identity?.length) {
    sections.push("**Identity & Social Context:**\n" + 
      grouped.identity.map(c => `- ${c.concept}`).join("\n"));
  }
  
  if (grouped.relationship_pattern?.length) {
    sections.push("**Relationship Patterns:**\n" + 
      grouped.relationship_pattern.map(c => `- ${c.concept}`).join("\n"));
  }
  
  if (grouped.value?.length) {
    sections.push("**Values:**\n" + 
      grouped.value.map(c => `- ${c.concept}`).join("\n"));
  }
  
  return sections.join("\n\n");
}

export function startConceptReflectionScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
  }
  
  if (!config.enabled) {
    console.log("[ConceptReflection] Scheduler disabled");
    return;
  }
  
  scheduledTask = cron.schedule(config.cronSchedule, async () => {
    console.log(`[ConceptReflection] Scheduled run at ${new Date().toISOString()}`);
    try {
      await runConceptReflection();
    } catch (error) {
      console.error("[ConceptReflection] Scheduled run failed:", error);
    }
  }, {
    timezone: config.timezone,
  });
  
  console.log(`[ConceptReflection] Scheduled at "${config.cronSchedule}" (${config.timezone})`);
}

export function getConceptReflectionStatus(): {
  enabled: boolean;
  lastRunTime: Date | null;
  lastRunStatus: string | null;
  schedule: string;
} {
  return {
    enabled: config.enabled,
    lastRunTime,
    lastRunStatus,
    schedule: config.cronSchedule,
  };
}

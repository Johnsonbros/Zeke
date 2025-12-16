/**
 * Specialized Workers for ZEKE Memory Processing
 * 
 * These workers run as part of the async processing queue and handle
 * specific types of intelligence extraction from memories:
 * 
 * - TaskExtractor: Identifies actionable tasks from conversations
 * - CommitmentTracker: Tracks promises and commitments made
 * - RelationshipAnalyzer: Analyzes relationship dynamics between people
 */

import OpenAI from "openai";
import { memoryProcessingQueue, type JobPriority } from "./asyncQueue";
import type { OmiMemoryData } from "../omi";
import {
  createTask,
  getAllContacts,
  findOrCreateMemoryRelationship,
  createEntity,
  findEntitiesByLabel,
} from "../db";
import { extractPeopleFromText, extractDatesFromText } from "../entityExtractor";
import { v4 as uuidv4 } from "uuid";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const JOB_TYPE_TASK_EXTRACTION = "task_extraction";
const JOB_TYPE_COMMITMENT_TRACKING = "commitment_tracking";
const JOB_TYPE_RELATIONSHIP_ANALYSIS = "relationship_analysis";

export interface ExtractedTask {
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  dueDate: string | null;
  assignee: string | null;
  source: "conversation" | "meeting" | "personal";
  category: "work" | "personal" | "family";
}

export interface TrackedCommitment {
  id: string;
  description: string;
  madeBy: string | null;
  madeTo: string | null;
  deadline: string | null;
  status: "pending" | "fulfilled" | "missed";
  memoryId: string;
  createdAt: string;
}

export interface RelationshipInsight {
  person1: string;
  person2: string;
  interactionType: "collaboration" | "conflict" | "social" | "professional";
  sentiment: "positive" | "neutral" | "negative";
  topics: string[];
  strength: number;
}

const commitments: Map<string, TrackedCommitment> = new Map();

async function extractTasksWithGPT(text: string, title?: string): Promise<ExtractedTask[]> {
  if (!process.env.OPENAI_API_KEY) {
    return extractTasksFallback(text);
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a task extraction assistant. Analyze the conversation and extract actionable tasks.
Return a JSON object with tasks array:
{"tasks": [{
  "title": "Brief task title",
  "description": "Detailed description",
  "priority": "low|medium|high",
  "dueDate": "ISO date string or null",
  "assignee": "Person name or null",
  "source": "conversation|meeting|personal",
  "category": "work|personal|family"
}]}
Only extract clear, actionable tasks. Return {"tasks": []} if no tasks found.`
        },
        {
          role: "user",
          content: `Title: ${title || "Untitled"}\n\nConversation:\n${text}`
        }
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    return Array.isArray(parsed.tasks) ? parsed.tasks : (Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    console.error("[TaskExtractor] GPT extraction failed:", error);
    return extractTasksFallback(text);
  }
}

function extractTasksFallback(text: string): ExtractedTask[] {
  const tasks: ExtractedTask[] = [];
  const lowerText = text.toLowerCase();

  const taskPatterns = [
    /(?:need to|have to|should|must|going to|will|i'll|we'll|let's)\s+([^.!?]+)/gi,
    /(?:don't forget to|remember to|make sure to)\s+([^.!?]+)/gi,
    /(?:todo|to-do|action item):\s*([^.!?\n]+)/gi,
  ];

  for (const pattern of taskPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const taskText = match[1].trim();
      if (taskText.length > 10 && taskText.length < 200) {
        let priority: ExtractedTask["priority"] = "medium";
        if (/urgent|asap|immediately|critical|important|priority|deadline/i.test(taskText)) {
          priority = "high";
        } else if (/whenever|eventually|sometime/i.test(taskText)) {
          priority = "low";
        }

        tasks.push({
          title: taskText.substring(0, 100),
          description: taskText,
          priority,
          dueDate: null,
          assignee: null,
          source: "conversation",
          category: "personal"
        });
      }
    }
  }

  return tasks.slice(0, 5);
}

async function processTaskExtraction(memory: OmiMemoryData): Promise<{
  tasksFound: number;
  tasksCreated: number;
}> {
  const result = { tasksFound: 0, tasksCreated: 0 };
  const text = memory.transcript || memory.structured?.overview || "";
  
  if (text.length < 50) return result;

  const extractedTasks = await extractTasksWithGPT(text, memory.structured?.title);
  result.tasksFound = extractedTasks.length;

  for (const task of extractedTasks) {
    try {
      createTask({
        title: task.title,
        description: `${task.description}\n\n[Source: ${task.source}, Memory: ${memory.id}]`,
        priority: task.priority,
        dueDate: task.dueDate,
        category: task.category || "personal",
        parentTaskId: null,
      });
      result.tasksCreated++;
      console.log(`[TaskExtractor] Created task: ${task.title}`);
    } catch (error) {
      console.error("[TaskExtractor] Failed to create task:", error);
    }
  }

  return result;
}

async function extractCommitmentsWithGPT(text: string): Promise<Array<{
  description: string;
  madeBy: string | null;
  madeTo: string | null;
  deadline: string | null;
}>> {
  if (!process.env.OPENAI_API_KEY) {
    return extractCommitmentsFallback(text);
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a commitment tracking assistant. Identify promises, agreements, and commitments.
Return JSON: { "commitments": [{ "description": "...", "madeBy": "name or null", "madeTo": "name or null", "deadline": "ISO date or null" }] }
Look for: "I promise", "I'll do", "I'll send", "we agreed", "let me know by", etc.`
        },
        { role: "user", content: text }
      ],
      temperature: 0.3,
      max_tokens: 800,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    return parsed.commitments || [];
  } catch (error) {
    console.error("[CommitmentTracker] GPT extraction failed:", error);
    return extractCommitmentsFallback(text);
  }
}

function extractCommitmentsFallback(text: string): Array<{
  description: string;
  madeBy: string | null;
  madeTo: string | null;
  deadline: string | null;
}> {
  const results: Array<{
    description: string;
    madeBy: string | null;
    madeTo: string | null;
    deadline: string | null;
  }> = [];

  const patterns = [
    /(?:i promise|i'll|i will|let me|allow me to)\s+([^.!?]+)/gi,
    /(?:we agreed|we decided|we committed)\s+([^.!?]+)/gi,
    /(?:by|before|until)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week)\s+([^.!?]+)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const commitmentText = match[1]?.trim() || match[0].trim();
      if (commitmentText.length > 10) {
        results.push({
          description: commitmentText,
          madeBy: null,
          madeTo: null,
          deadline: null
        });
      }
    }
  }

  return results.slice(0, 5);
}

async function processCommitmentTracking(memory: OmiMemoryData): Promise<{
  commitmentsFound: number;
  commitmentsTracked: number;
}> {
  const result = { commitmentsFound: 0, commitmentsTracked: 0 };
  const text = memory.transcript || memory.structured?.overview || "";
  
  if (text.length < 30) return result;

  const extracted = await extractCommitmentsWithGPT(text);
  result.commitmentsFound = extracted.length;

  for (const commitment of extracted) {
    const id = uuidv4();
    const tracked: TrackedCommitment = {
      id,
      description: commitment.description,
      madeBy: commitment.madeBy,
      madeTo: commitment.madeTo,
      deadline: commitment.deadline,
      status: "pending",
      memoryId: memory.id,
      createdAt: new Date().toISOString()
    };

    commitments.set(id, tracked);
    result.commitmentsTracked++;
    console.log(`[CommitmentTracker] Tracked commitment: ${commitment.description.substring(0, 50)}...`);
  }

  return result;
}

async function analyzeRelationshipsWithGPT(text: string, people: string[]): Promise<RelationshipInsight[]> {
  if (!process.env.OPENAI_API_KEY || people.length < 2) {
    return [];
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Analyze relationship dynamics between people mentioned. Return JSON:
{ "insights": [{ 
  "person1": "name", "person2": "name",
  "interactionType": "collaboration|conflict|social|professional",
  "sentiment": "positive|neutral|negative",
  "topics": ["topic1", "topic2"],
  "strength": 0.0-1.0
}] }`
        },
        {
          role: "user",
          content: `People: ${people.join(", ")}\n\nConversation:\n${text}`
        }
      ],
      temperature: 0.3,
      max_tokens: 800,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    return parsed.insights || [];
  } catch (error) {
    console.error("[RelationshipAnalyzer] GPT analysis failed:", error);
    return [];
  }
}

async function processRelationshipAnalysis(memory: OmiMemoryData): Promise<{
  peopleFound: number;
  relationshipsAnalyzed: number;
}> {
  const result = { peopleFound: 0, relationshipsAnalyzed: 0 };
  const text = memory.transcript || memory.structured?.overview || "";
  
  if (text.length < 50) return result;

  const contacts = getAllContacts();
  const peopleMatches = extractPeopleFromText(text, contacts);
  result.peopleFound = peopleMatches.length;

  if (peopleMatches.length < 2) return result;

  const peopleNames = peopleMatches.map(m => 
    `${m.contact.firstName} ${m.contact.lastName}`.trim()
  );

  const insights = await analyzeRelationshipsWithGPT(text, peopleNames);

  for (const insight of insights) {
    const entity1 = findEntitiesByLabel(insight.person1).find(e => e.type === "person");
    const entity2 = findEntitiesByLabel(insight.person2).find(e => e.type === "person");

    if (entity1 && entity2) {
      findOrCreateMemoryRelationship(entity1.id, entity2.id);
      result.relationshipsAnalyzed++;
      console.log(`[RelationshipAnalyzer] Analyzed ${insight.person1} <-> ${insight.person2}: ${insight.interactionType} (${insight.sentiment})`);
    }
  }

  return result;
}

export function registerSpecializedWorkers(): void {
  memoryProcessingQueue.registerProcessor(JOB_TYPE_TASK_EXTRACTION, async (payload: unknown) => {
    const memory = payload as OmiMemoryData;
    return await processTaskExtraction(memory);
  });

  memoryProcessingQueue.registerProcessor(JOB_TYPE_COMMITMENT_TRACKING, async (payload: unknown) => {
    const memory = payload as OmiMemoryData;
    return await processCommitmentTracking(memory);
  });

  memoryProcessingQueue.registerProcessor(JOB_TYPE_RELATIONSHIP_ANALYSIS, async (payload: unknown) => {
    const memory = payload as OmiMemoryData;
    return await processRelationshipAnalysis(memory);
  });

  console.log("[SpecializedWorkers] Registered TaskExtractor, CommitmentTracker, RelationshipAnalyzer");
}

export function enqueueSpecializedProcessing(
  memory: OmiMemoryData,
  options: { priority?: JobPriority } = {}
): void {
  const priority = options.priority || "normal";

  memoryProcessingQueue.enqueue(JOB_TYPE_TASK_EXTRACTION, memory, { priority });
  memoryProcessingQueue.enqueue(JOB_TYPE_COMMITMENT_TRACKING, memory, { priority });
  memoryProcessingQueue.enqueue(JOB_TYPE_RELATIONSHIP_ANALYSIS, memory, { priority: "low" });

  console.log(`[SpecializedWorkers] Enqueued specialized processing for memory ${memory.id}`);
}

export function getCommitments(): TrackedCommitment[] {
  return Array.from(commitments.values());
}

export function getPendingCommitments(): TrackedCommitment[] {
  return Array.from(commitments.values()).filter(c => c.status === "pending");
}

export function getOverdueCommitments(): TrackedCommitment[] {
  const now = new Date();
  return Array.from(commitments.values()).filter(c => {
    if (c.status !== "pending" || !c.deadline) return false;
    return new Date(c.deadline) < now;
  });
}

export function markCommitmentFulfilled(id: string): boolean {
  const commitment = commitments.get(id);
  if (commitment) {
    commitment.status = "fulfilled";
    return true;
  }
  return false;
}

export function markCommitmentMissed(id: string): boolean {
  const commitment = commitments.get(id);
  if (commitment) {
    commitment.status = "missed";
    return true;
  }
  return false;
}

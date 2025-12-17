/**
 * Feedback Trainer Job for ZEKE
 * 
 * Nightly job (2:30 AM) that:
 * 1. Fetches negative feedback from last 24h
 * 2. Clusters by heuristics (tone, verbosity, task)
 * 3. Writes learning notes to semantic memory
 * 4. Updates style_profile JSON with preferences
 */

import * as cron from "node-cron";
import fs from "fs";
import path from "path";
import { getFeedbackEventsByConversation, getAllConversations } from "../db";
import { createMemoryWithEmbedding } from "../semanticMemory";
import type { FeedbackEvent } from "@shared/schema";

export interface StyleProfile {
  verbosity: "low" | "medium" | "high";
  tone: "direct" | "neutral" | "friendly";
  formatting: {
    bulletHeavy: boolean;
    numberedLists: boolean;
    concise: boolean;
  };
  preferences: string[];
  lastUpdated: string;
}

const DEFAULT_STYLE_PROFILE: StyleProfile = {
  verbosity: "medium",
  tone: "neutral",
  formatting: {
    bulletHeavy: false,
    numberedLists: false,
    concise: true,
  },
  preferences: ["default: concise unless asked"],
  lastUpdated: new Date().toISOString(),
};

let scheduledTask: cron.ScheduledTask | null = null;

const STYLE_PROFILE_PATH = path.join(process.cwd(), "data", "style_profile.json");

/**
 * Load or initialize style profile
 */
export function getStyleProfile(): StyleProfile {
  try {
    if (fs.existsSync(STYLE_PROFILE_PATH)) {
      const content = fs.readFileSync(STYLE_PROFILE_PATH, "utf-8");
      return JSON.parse(content);
    }
  } catch (error) {
    console.error("[FeedbackTrainer] Error loading style profile:", error);
  }
  return DEFAULT_STYLE_PROFILE;
}

/**
 * Save style profile
 */
function saveStyleProfile(profile: StyleProfile): void {
  try {
    const dir = path.dirname(STYLE_PROFILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STYLE_PROFILE_PATH, JSON.stringify(profile, null, 2));
    console.log("[FeedbackTrainer] Saved style profile");
  } catch (error) {
    console.error("[FeedbackTrainer] Error saving style profile:", error);
  }
}

/**
 * Cluster feedback by heuristics
 */
interface FeedbackCluster {
  type: "tone" | "verbosity" | "task" | "unknown";
  feedback: FeedbackEvent[];
  summary: string;
}

function clusterFeedback(feedback: FeedbackEvent[]): FeedbackCluster[] {
  const clusters: Map<string, FeedbackCluster> = new Map();

  for (const fb of feedback) {
    const reason = (fb.reason || "").toLowerCase();
    const quotedText = (fb.quotedText || "").toLowerCase();

    let clusterKey = "unknown";
    let summary = "";

    // Tone cluster
    if (
      reason.includes("rude") ||
      reason.includes("formal") ||
      reason.includes("casual") ||
      reason.includes("attitude") ||
      reason.includes("annoying")
    ) {
      clusterKey = "tone";
      if (reason.includes("formal")) summary = "Too formal/stiff";
      else if (reason.includes("casual")) summary = "Too casual";
      else if (reason.includes("rude")) summary = "Rude tone";
      else summary = "Tone issue";
    }
    // Verbosity cluster
    else if (reason.includes("long") || reason.includes("short")) {
      clusterKey = "verbosity";
      summary = reason.includes("long") ? "Too verbose" : "Too short";
    }
    // Task/correctness cluster
    else if (
      reason.includes("wrong") ||
      reason.includes("didn't do") ||
      reason.includes("not what")
    ) {
      clusterKey = "task";
      summary = "Didn't follow instructions correctly";
    }

    const key = clusterKey;
    if (!clusters.has(key)) {
      clusters.set(key, {
        type: (clusterKey as any) || "unknown",
        feedback: [],
        summary,
      });
    }
    clusters.get(key)!.feedback.push(fb);
  }

  return Array.from(clusters.values());
}

/**
 * Generate learning notes from clusters
 */
async function generateLearningNotes(clusters: FeedbackCluster[]): Promise<void> {
  for (const cluster of clusters) {
    if (cluster.feedback.length === 0) continue;

    let memory = "";

    if (cluster.type === "tone") {
      const toneMentions = cluster.feedback.map((fb) => fb.reason).join("; ");
      memory = `NATE PREFERS: More ${
        toneMentions.includes("formal") ? "direct, fewer disclaimers" : "conversational"
      } tone. Issues: ${cluster.summary}`;
    } else if (cluster.type === "verbosity") {
      const isLong = cluster.summary.includes("verbose");
      memory = `NATE PREFERS: ${
        isLong
          ? "Concise, bullet-point responses. Skip verbose explanations."
          : "More detailed explanations. Don't be too brief."
      }`;
    } else if (cluster.type === "task") {
      const exampleQuotes = cluster.feedback
        .slice(0, 2)
        .map((fb) => `"${fb.quotedText}"`)
        .join(", ");
      memory = `PLAYBOOK: When Nate mentions ${exampleQuotes}, verify the exact task before responding. ${cluster.summary}.`;
    }

    if (memory) {
      try {
        await createMemoryWithEmbedding({
          type: "preference",
          content: memory,
        });
        console.log(`[FeedbackTrainer] Created memory: ${memory.substring(0, 60)}...`);
      } catch (error) {
        console.error("[FeedbackTrainer] Error creating memory:", error);
      }
    }
  }
}

/**
 * Update style profile based on clusters
 */
function updateStyleProfile(clusters: FeedbackCluster[]): StyleProfile {
  const profile = getStyleProfile();

  for (const cluster of clusters) {
    if (cluster.type === "tone") {
      const reasons = cluster.feedback.map((fb) => fb.reason || "").join(" ");
      if (reasons.includes("formal")) {
        profile.tone = "direct";
        profile.preferences.push("Prefer direct, minimal disclaimers");
      } else if (reasons.includes("casual")) {
        profile.tone = "friendly";
      }
    } else if (cluster.type === "verbosity") {
      if (cluster.summary.includes("verbose")) {
        profile.verbosity = "low";
        profile.formatting.concise = true;
        profile.preferences.push("Keep it concise");
      } else {
        profile.verbosity = "high";
        profile.formatting.concise = false;
      }
    } else if (cluster.type === "task") {
      profile.preferences.push("Double-check task interpretation before responding");
    }
  }

  profile.lastUpdated = new Date().toISOString();
  saveStyleProfile(profile);
  return profile;
}

/**
 * Main training job
 */
async function trainOnFeedback(): Promise<void> {
  console.log("[FeedbackTrainer] Starting nightly feedback training at", new Date().toISOString());

  try {
    // Fetch all conversations
    const conversations = getAllConversations();
    if (conversations.length === 0) {
      console.log("[FeedbackTrainer] No conversations found");
      return;
    }

    // Collect negative feedback from last 24h
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const negativeFeedback: FeedbackEvent[] = [];

    for (const conv of conversations) {
      const allFeedback = getFeedbackEventsByConversation(conv.id);
      for (const fb of allFeedback) {
        // Negative feedback from last 24h
        if (
          fb.feedback === -1 &&
          now - new Date(fb.createdAt).getTime() < oneDayMs
        ) {
          negativeFeedback.push(fb);
        }
      }
    }

    console.log(`[FeedbackTrainer] Found ${negativeFeedback.length} negative feedback events`);

    if (negativeFeedback.length === 0) {
      console.log("[FeedbackTrainer] No negative feedback to process");
      return;
    }

    // Cluster and process
    const clusters = clusterFeedback(negativeFeedback);
    console.log(`[FeedbackTrainer] Clustered into ${clusters.length} groups`);

    // Generate learning notes
    await generateLearningNotes(clusters);

    // Update style profile
    const updatedProfile = updateStyleProfile(clusters);
    console.log(
      `[FeedbackTrainer] Updated profile: tone=${updatedProfile.tone}, verbosity=${updatedProfile.verbosity}`
    );

    console.log("[FeedbackTrainer] Training complete");
  } catch (error) {
    console.error("[FeedbackTrainer] Training failed:", error);
  }
}

/**
 * Start the feedback trainer scheduler
 */
export function startFeedbackTrainer(cronSchedule: string = "30 2 * * *"): void {
  if (scheduledTask) {
    scheduledTask.stop();
  }

  scheduledTask = cron.schedule(cronSchedule, () => {
    trainOnFeedback();
  });

  console.log(`[FeedbackTrainer] Scheduled at "${cronSchedule}" (America/New_York)`);
}

/**
 * Stop the scheduler
 */
export function stopFeedbackTrainer(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log("[FeedbackTrainer] Stopped");
  }
}

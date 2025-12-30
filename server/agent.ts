import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { withTrace } from "@openai/agents";
import { wrapOpenAI, openaiBreaker, setAiLoggingContext, clearAiLoggingContext } from "../lib/reliability/client_wrap";
import { logAiEvent, logAiError, hashSystemPrompt } from "./aiLogger";
import {
  getRecentMessages,
  getAllMemoryNotes,
  searchMemoryNotes,
  updateConversationTitle,
  getConversation,
  getContactByPhone,
  getOrCreateContactForPhone,
  getAllProfileSections,
  getLatestLocation,
  getStarredPlaces,
  findNearbyPlaces,
  checkGroceryProximity,
  getLocationSettings,
  getContactFullName,
} from "./db";
import { toolDefinitions, executeTool, getActiveReminders } from "./tools";
import { 
  buildGettingToKnowSystemPrompt, 
  detectMemoryCorrection, 
  handleMemoryCorrection 
} from "./gettingToKnow";
import {
  createMemoryWithEmbedding,
  getSmartMemoryContext,
} from "./semanticMemory";
import { selectRelevantMessages } from "./services/contextEnhancer";
import {
  detectMemoryConflict,
  formatConflictQuestion,
  type ConflictDetectionResult,
} from "./memoryConflicts";
import { supersedeMemoryNote } from "./db";
import { getStyleProfile } from "./jobs/feedbackTrainer";
import type { Message, Contact } from "@shared/schema";
import { isMasterAdmin } from "@shared/schema";
import { 
  assembleContext, 
  detectIntent,
  buildCrossDomainBundle,
  type AppContext,
  type TokenBudget,
  DEFAULT_TOKEN_BUDGET 
} from "./contextRouter";
import { summarizeConversation } from "./conversationSummarizer";
import {
  startToolTracking,
  recordToolOutcome,
  recordConversationSignal,
  detectRetry,
  detectFollowUpNeeded,
} from "./metricsCollector";
import { getCoreConceptsContext } from "./jobs/conceptReflection";

export interface PendingMemory {
  id: string;
  content: string;
  type: "fact" | "preference" | "note" | "summary";
  context: string;
  conflictResult: ConflictDetectionResult;
  createdAt: Date;
}

const pendingMemories: Map<string, PendingMemory> = new Map();

export function getPendingMemory(id: string): PendingMemory | undefined {
  return pendingMemories.get(id);
}

export function getAllPendingMemories(): PendingMemory[] {
  return Array.from(pendingMemories.values());
}

export function clearExpiredPendingMemories(): void {
  const expirationMs = 30 * 60 * 1000;
  const now = Date.now();
  const entries = Array.from(pendingMemories.entries());
  for (let i = 0; i < entries.length; i++) {
    const [id, memory] = entries[i];
    if (now - memory.createdAt.getTime() > expirationMs) {
      pendingMemories.delete(id);
    }
  }
}

export async function resolvePendingMemory(
  id: string, 
  action: "confirm" | "deny"
): Promise<{ success: boolean; message: string }> {
  const pending = pendingMemories.get(id);
  if (!pending) {
    return { success: false, message: "Pending memory not found or expired" };
  }
  
  pendingMemories.delete(id);
  
  if (action === "deny") {
    console.log(`Memory conflict resolved: Keeping old memory, discarding "${pending.content}"`);
    return { success: true, message: "Kept existing memory, discarded new information" };
  }
  
  try {
    const supersedesContent = pending.conflictResult.conflictingMemory?.content;
    const result = await createMemoryWithEmbedding({
      type: pending.type,
      content: pending.content,
      context: pending.context,
    }, { 
      checkDuplicates: false,
      supersedesContentLike: supersedesContent,
    });
    
    if (result.wasCreated) {
      console.log(`Memory conflict resolved: Updated with "${pending.content}"`);
      return { success: true, message: "Memory updated successfully" };
    }
    return { success: false, message: "Failed to create memory" };
  } catch (error) {
    console.error("Error resolving pending memory:", error);
    return { success: false, message: "Error creating memory" };
  }
}

// Permission context passed to the agent for access control
export interface UserPermissions {
  isAdmin: boolean;
  isMasterAdmin: boolean;
  accessLevel: string;
  canAccessPersonalInfo: boolean;
  canAccessCalendar: boolean;
  canAccessTasks: boolean;
  canAccessGrocery: boolean;
  canSetReminders: boolean;
  canQueryMemory?: boolean;
  contactName?: string;
  source: 'web' | 'sms';
}

// Get permissions for a phone number
export function getPermissionsForPhone(phoneNumber: string): UserPermissions {
  const normalizedPhone = phoneNumber.replace(/\D/g, "");
  
  // Check if master admin
  if (isMasterAdmin(normalizedPhone)) {
    return {
      isAdmin: true,
      isMasterAdmin: true,
      accessLevel: 'admin',
      canAccessPersonalInfo: true,
      canAccessCalendar: true,
      canAccessTasks: true,
      canAccessGrocery: true,
      canSetReminders: true,
      contactName: 'Nate Johnson',
      source: 'sms',
    };
  }
  
  // Look up contact in database
  const contact = getContactByPhone(phoneNumber);
  
  if (contact) {
    return {
      isAdmin: contact.accessLevel === 'admin',
      isMasterAdmin: false,
      accessLevel: contact.accessLevel,
      canAccessPersonalInfo: contact.canAccessPersonalInfo,
      canAccessCalendar: contact.canAccessCalendar,
      canAccessTasks: contact.canAccessTasks,
      canAccessGrocery: contact.canAccessGrocery,
      canSetReminders: contact.canSetReminders,
      contactName: getContactFullName(contact),
      source: 'sms',
    };
  }
  
  // Create a new unknown contact and return restricted permissions
  const newContact = getOrCreateContactForPhone(phoneNumber);
  return {
    isAdmin: false,
    isMasterAdmin: false,
    accessLevel: newContact.accessLevel,
    canAccessPersonalInfo: newContact.canAccessPersonalInfo,
    canAccessCalendar: newContact.canAccessCalendar,
    canAccessTasks: newContact.canAccessTasks,
    canAccessGrocery: newContact.canAccessGrocery,
    canSetReminders: newContact.canSetReminders,
    contactName: getContactFullName(newContact),
    source: 'sms',
  };
}

// Web users have the most restricted access
export function getWebUserPermissions(): UserPermissions {
  return {
    isAdmin: false,
    isMasterAdmin: false,
    accessLevel: 'web',
    canAccessPersonalInfo: false,
    canAccessCalendar: false,
    canAccessTasks: false,
    canAccessGrocery: false,
    canSetReminders: false,
    source: 'web',
  };
}

// Admin permissions for web interface (used when web is in admin mode)
export function getAdminPermissions(): UserPermissions {
  return {
    isAdmin: true,
    isMasterAdmin: true,
    accessLevel: 'admin',
    canAccessPersonalInfo: true,
    canAccessCalendar: true,
    canAccessTasks: true,
    canAccessGrocery: true,
    canSetReminders: true,
    source: 'web',
  };
}

// Default model - configurable via OPENAI_MODEL env var
// Use "gpt-4o" as the stable default, can be updated to newer models like "gpt-4.1" when available
const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_MINI_MODEL = "gpt-4o-mini";

export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

export function getOpenAIMiniModel(): string {
  return process.env.OPENAI_MINI_MODEL || DEFAULT_MINI_MODEL;
}

// Lazily initialize OpenAI client to allow app to start without API key
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "OpenAI API key not configured. Please add OPENAI_API_KEY to your secrets.",
      );
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

async function createChatCompletion(
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  context?: { agentId?: string; toolName?: string; conversationId?: string }
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const client = getOpenAIClient();
  const model = params.model;
  
  // Extract system prompt hash for drift detection
  const systemPrompt = params.messages.find(m => m.role === 'system')?.content;
  const systemPromptHashValue = typeof systemPrompt === 'string' ? hashSystemPrompt(systemPrompt) : undefined;
  
  // Extract tool names if present
  const toolNames = params.tools?.map(t => t.function?.name).filter(Boolean).join(',');
  
  // Set logging context before the call - wrapOpenAI will auto-log
  setAiLoggingContext({
    model,
    endpoint: "chat",
    agentId: context?.agentId || "zeke_main",
    toolName: context?.toolName,
    conversationId: context?.conversationId,
    systemPromptHash: systemPromptHashValue,
    temperature: params.temperature?.toString(),
    maxTokens: params.max_completion_tokens || params.max_tokens as number | undefined,
    toolsEnabled: toolNames,
  });
  
  try {
    const response = await wrapOpenAI(() => client.chat.completions.create(params));
    return response;
  } finally {
    clearAiLoggingContext();
  }
}

// Load profile and knowledge files, plus database profile sections
function loadProfileContext(): string {
  const profilePath = path.join(process.cwd(), "zeke_profile.md");
  const knowledgePath = path.join(process.cwd(), "zeke_knowledge.md");

  let context = "";

  // Load markdown profile files (legacy support)
  try {
    if (fs.existsSync(profilePath)) {
      context += fs.readFileSync(profilePath, "utf-8") + "\n\n";
    }
  } catch (e) {
    console.error("Error reading profile:", e);
  }

  try {
    if (fs.existsSync(knowledgePath)) {
      context += fs.readFileSync(knowledgePath, "utf-8");
    }
  } catch (e) {
    console.error("Error reading knowledge:", e);
  }

  // Load profile from database (new structured profile system)
  try {
    const profileSections = getAllProfileSections();
    if (profileSections.length > 0) {
      context += "\n## Nate's Profile (Detailed)\n";
      
      const sectionLabels: Record<string, string> = {
        basic: "Basic Information",
        work: "Work & Career",
        family: "Family & Relationships",
        interests: "Interests & Hobbies",
        preferences: "Preferences",
        goals: "Goals",
        health: "Health & Wellness",
        routines: "Daily Routines",
        dates: "Important Dates",
        custom: "Additional Notes",
      };
      
      for (const section of profileSections) {
        try {
          const data = JSON.parse(section.data);
          if (Object.keys(data).length > 0) {
            const label = sectionLabels[section.section] || section.section;
            context += `\n### ${label}\n`;
            context += formatProfileSection(section.section, data);
          }
        } catch {
          // Skip if can't parse JSON
        }
      }
    }
  } catch (e) {
    console.error("Error reading profile sections:", e);
  }

  return context;
}

// Format a profile section for the AI context
function formatProfileSection(sectionName: string, data: Record<string, unknown>): string {
  let formatted = "";
  
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined || value === "") continue;
    
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
    
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      
      // Handle array of objects (like important dates or custom fields)
      if (typeof value[0] === 'object' && value[0] !== null) {
        formatted += `- ${label}:\n`;
        for (const item of value) {
          const itemStr = Object.entries(item as Record<string, unknown>)
            .filter(([_, v]) => v !== null && v !== undefined && v !== "")
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ");
          if (itemStr) formatted += `  - ${itemStr}\n`;
        }
      } else {
        // Simple array of strings
        formatted += `- ${label}: ${value.join(", ")}\n`;
      }
    } else if (typeof value === 'object' && value !== null) {
      // Handle nested objects
      formatted += `- ${label}: ${JSON.stringify(value)}\n`;
    } else {
      // Simple value
      formatted += `- ${label}: ${value}\n`;
    }
  }
  
  return formatted;
}

// Get relevant memory context (sync fallback for when async isn't available)
function getMemoryContextSync(userMessage: string): string {
  const allNotes = getAllMemoryNotes();
  const relevantNotes = searchMemoryNotes(userMessage);

  const recentFacts = allNotes.filter((n) => n.type === "fact").slice(0, 5);
  const recentPreferences = allNotes
    .filter((n) => n.type === "preference")
    .slice(0, 5);
  const recentSummaries = allNotes
    .filter((n) => n.type === "summary")
    .slice(0, 3);

  let context = "";

  if (relevantNotes.length > 0) {
    context += "## Relevant Memory\n";
    relevantNotes.forEach((note) => {
      context += `- [${note.type}] ${note.content}\n`;
    });
    context += "\n";
  }

  if (recentFacts.length > 0) {
    context += "## Known Facts\n";
    recentFacts.forEach((note) => {
      context += `- ${note.content}\n`;
    });
    context += "\n";
  }

  if (recentPreferences.length > 0) {
    context += "## Preferences\n";
    recentPreferences.forEach((note) => {
      context += `- ${note.content}\n`;
    });
    context += "\n";
  }

  if (recentSummaries.length > 0) {
    context += "## Recent Conversation Summaries\n";
    recentSummaries.forEach((note) => {
      context += `- ${note.content}\n`;
    });
    context += "\n";
  }

  return context;
}

// Get relevant memory context using semantic search
async function getMemoryContext(userMessage: string): Promise<string> {
  try {
    return await getSmartMemoryContext(userMessage);
  } catch (error) {
    console.error("Semantic memory search failed, falling back to basic:", error);
    return getMemoryContextSync(userMessage);
  }
}

// Build access control section based on permissions
function buildAccessControlPrompt(permissions: UserPermissions): string {
  if (permissions.isMasterAdmin) {
    return `## Access Level: MASTER ADMIN
You are speaking with Nate Johnson, the master admin. Full access to all features and personal information.`;
  }
  
  if (permissions.isAdmin) {
    return `## Access Level: ADMIN
You are speaking with ${permissions.contactName || 'an admin'}. Full access to all features.`;
  }
  
  const restrictions: string[] = [];
  const allowed: string[] = [];
  
  // Build restrictions based on permissions
  if (!permissions.canAccessPersonalInfo) {
    restrictions.push("- DO NOT share personal information about Nate or his family (names, relationships, personal details)");
  } else {
    allowed.push("- Can access personal info about Nate and family");
  }
  
  if (!permissions.canAccessCalendar) {
    restrictions.push("- DO NOT share calendar or schedule information");
  } else {
    allowed.push("- Can view and create calendar events");
  }
  
  if (!permissions.canAccessTasks) {
    restrictions.push("- DO NOT share task list or to-do items");
  } else {
    allowed.push("- Can view and manage tasks");
  }
  
  if (!permissions.canAccessGrocery) {
    restrictions.push("- DO NOT share or modify the grocery list");
  } else {
    allowed.push("- Can view and modify grocery list");
  }
  
  if (!permissions.canSetReminders) {
    restrictions.push("- DO NOT set reminders for this user");
  } else {
    allowed.push("- Can set reminders");
  }
  
  const accessLevel = permissions.accessLevel || 'guest';
  const source = permissions.source || 'sms';
  let accessSection = `## Access Level: ${accessLevel.toUpperCase()}
You are speaking with ${permissions.contactName || 'an SMS user'} via ${source.toUpperCase()}.

### ALLOWED:
${allowed.length > 0 ? allowed.join("\n") : "- Basic conversation only"}

### STRICT RESTRICTIONS (NEVER VIOLATE):
${restrictions.length > 0 ? restrictions.join("\n") : "- None"}

If they ask for restricted information, politely decline and explain you cannot share that information with them. Be friendly but firm about access restrictions.`;
  
  return accessSection;
}

// Get location context for the agent
function getLocationContext(): string {
  try {
    const settings = getLocationSettings();
    if (!settings || !settings.trackingEnabled) {
      return "";
    }

    const latestLocation = getLatestLocation();
    const starredPlaces = getStarredPlaces();
    
    let context = `## GPS Location Access - FULL PERMISSION GRANTED
**You have continuous, real-time GPS access via Overland.** Nate has explicitly granted you full permission to see his location at all times to help him accomplish goals, tasks, and life activities.

You KNOW where Nate is. Use this information proactively to:
- Remind him about nearby tasks or errands
- Suggest relevant actions based on his location
- Alert him when he's near grocery stores (if he has items on his list)
- Provide location-aware assistance without being asked

`;
    
    if (latestLocation) {
      const lat = parseFloat(latestLocation.latitude);
      const lng = parseFloat(latestLocation.longitude);
      const timestamp = new Date(latestLocation.createdAt).toLocaleString("en-US", { timeZone: "America/New_York" });
      
      context += `### Current Location\n`;
      context += `- Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}\n`;
      context += `- Last updated: ${timestamp}\n\n`;
      
      const nearbyPlaces = findNearbyPlaces(lat, lng, 1000);
      if (nearbyPlaces.length > 0) {
        context += `### Nearby Saved Places (within 1km)\n`;
        nearbyPlaces.slice(0, 5).forEach(place => {
          const distanceStr = place.distance < 1000 
            ? `${Math.round(place.distance)}m` 
            : `${(place.distance / 1000).toFixed(1)}km`;
          context += `- ${place.name} (${place.category}) - ${distanceStr} away`;
          if (place.proximityAlertEnabled) {
            context += ` [ALERT ENABLED]`;
          }
          context += `\n`;
        });
        context += "\n";
      }
      
      const nearbyGroceryStores = checkGroceryProximity(lat, lng);
      if (nearbyGroceryStores.length > 0) {
        context += `### ALERT: Near Grocery Stores!\n`;
        context += `User is near the following grocery-linked stores. Consider checking if they have grocery items to buy:\n`;
        nearbyGroceryStores.forEach(({ place, list, distance }) => {
          const distanceStr = distance < 1000 
            ? `${Math.round(distance)}m` 
            : `${(distance / 1000).toFixed(1)}km`;
          context += `- ${place.name} (${list.name} list) - ${distanceStr} away\n`;
        });
        context += "\n";
      }
    }
    
    if (starredPlaces.length > 0) {
      context += `### Starred Places\n`;
      starredPlaces.slice(0, 5).forEach(place => {
        context += `- ${place.name} (${place.category})`;
        if (place.label) context += ` - "${place.label}"`;
        context += `\n`;
      });
      context += "\n";
    }
    
    return context;
  } catch (error) {
    console.error("Error getting location context:", error);
    return "";
  }
}

function getPendingMemoryConflictContext(): string {
  const pending = getAllPendingMemories();
  if (pending.length === 0) return "";
  
  let context = "## Pending Memory Conflicts\n";
  context += "The following new information conflicts with existing memories. Ask the user to confirm:\n\n";
  
  for (const p of pending) {
    if (p.conflictResult.conflictingMemory) {
      const question = formatConflictQuestion(
        p.content,
        p.conflictResult.conflictingMemory,
        p.conflictResult.conflictType
      );
      context += `**Conflict ID: ${p.id}**\n${question}\n\n`;
    }
  }
  
  context += `When the user responds to confirm (yes, update, keep new) or deny (no, keep old), use the resolve_memory_conflict tool.\n`;
  context += `For "yes"/"update"/"keep new" responses, resolve with action: "confirm".\n`;
  context += `For "no"/"keep old" responses, resolve with action: "deny".\n\n`;
  
  return context;
}

/**
 * Build dynamic context using the Context Router
 * This is a smarter, more token-efficient alternative to the legacy context building
 * 
 * @param userMessage - The user's message
 * @param currentRoute - The current app route (e.g., "/chat", "/tasks", "sms")
 * @param userPhoneNumber - Optional phone number for SMS context
 * @param isAdmin - Whether the user has admin access
 * @param conversationId - Optional conversation ID for conversation context
 */
export async function buildSmartContext(
  userMessage: string,
  currentRoute: string = "/chat",
  userPhoneNumber?: string,
  isAdmin: boolean = true,
  conversationId?: string
): Promise<string> {
  const appContext: AppContext = {
    userId: "nate", // Single-user system
    currentRoute,
    userMessage,
    userPhoneNumber,
    conversationId,
    isAdmin,
    now: new Date(),
    timezone: "America/New_York",
  };

  try {
    const context = await assembleContext(appContext);
    console.log(`[ContextRouter] Built smart context for route "${currentRoute}", intent: "${detectIntent(userMessage)}"`);
    return context;
  } catch (error) {
    console.error("[ContextRouter] Error building smart context, falling back to empty:", error);
    return "";
  }
}

// Build the system prompt
// Set USE_CONTEXT_ROUTER=true to enable the new Context Router for smarter context assembly
const USE_CONTEXT_ROUTER = process.env.USE_CONTEXT_ROUTER === "true";

async function buildSystemPrompt(
  userMessage: string, 
  userPhoneNumber?: string, 
  permissions?: UserPermissions,
  currentRoute: string = "/chat",
  conversationId?: string
): Promise<string> {
  // Default to admin permissions for web (maintains current behavior)
  const userPermissions = permissions || getAdminPermissions();
  
  let dynamicContext: string;
  
  if (USE_CONTEXT_ROUTER && userPermissions.canAccessPersonalInfo) {
    // Use the new Context Router for smarter, token-efficient context assembly
    // Note: assembleContext now includes cross-domain bundle automatically
    const smartContext = await buildSmartContext(
      userMessage,
      currentRoute,
      userPhoneNumber,
      userPermissions.isAdmin,
      conversationId
    );
    dynamicContext = smartContext;
    console.log("[Agent] Using Context Router for dynamic context");
  } else {
    // Legacy context building (fallback)
    const profileContext = userPermissions.canAccessPersonalInfo ? loadProfileContext() : "";
    const memoryContext = userPermissions.canAccessPersonalInfo ? await getMemoryContext(userMessage) : "";
    const locationContext = userPermissions.canAccessPersonalInfo ? getLocationContext() : "";
    
    // Add cross-domain context for legacy path
    let crossDomainContext = "";
    if (userPermissions.canAccessPersonalInfo && conversationId) {
      try {
        crossDomainContext = await buildCrossDomainBundle(conversationId);
        if (crossDomainContext) {
          console.log("[Agent] Added cross-domain context to legacy prompt");
        }
      } catch (error) {
        console.error("[Agent] Error building cross-domain context:", error);
      }
    }
    
    dynamicContext = `${profileContext}\n\n${memoryContext}\n\n${locationContext}\n\n${crossDomainContext}`;
  }

  const activeReminders = getActiveReminders();
  const reminderContext =
    activeReminders.length > 0 && userPermissions.canSetReminders
      ? `## Active Reminders\n${activeReminders.map((r) => `- "${r.message}" scheduled for ${r.scheduledFor.toLocaleString("en-US", { timeZone: "America/New_York" })}`).join("\n")}\n\n`
      : "";
  
  // Add phone number context so ZEKE knows where to send SMS reminders
  const phoneContext = userPhoneNumber && userPermissions.canSetReminders
    ? `\n## Current User Phone\nThe user's phone number is: ${userPhoneNumber}\nWhen setting reminders, ALWAYS include recipient_phone: "${userPhoneNumber}" to send SMS reminders.\n`
    : "";
  
  // Build access control section
  const accessControlSection = buildAccessControlPrompt(userPermissions);
  
  // Get pending memory conflicts context
  const pendingConflictContext = userPermissions.isAdmin ? getPendingMemoryConflictContext() : "";
  
  // Inject learned style profile
  const styleProfile = getStyleProfile();
  const stylePrompt = `LEARNED PREFERENCES (from feedback):
- Verbosity: ${styleProfile.verbosity} (${styleProfile.formatting.concise ? "concise" : "detailed"})
- Tone: ${styleProfile.tone}
- User preferences: ${styleProfile.preferences.join("; ")}
`;

  return `You are ZEKE — Nate Johnson's personal AI assistant (single-user, SMS + web).

STYLE (learned + default):
- Direct, professional, conversational. Minimal fluff.
- Be concise by default; expand only when needed.
- ${styleProfile.formatting.concise ? "Prioritize brevity." : "Include details."}
- Tone: ${styleProfile.tone}

${stylePrompt}

MISSION:
- Reduce Nate's cognitive load: plan, decide, track, remind, summarize, and execute.
- Prefer doing the work (tools) over advising Nate to do it.

NON-NEGOTIABLE RULES:
1) Access control is law. Follow the "ACCESS CONTROL" section below exactly.
2) Don't guess when a tool can answer. Use tools, then report results plainly.
3) Never deflect: do not tell the user to "check a website/call them/search it" if you can do it.
4) If the user asks about "today / earlier / that conversation / what did X say":
   - FIRST call get_lifelog_overview.
   - THEN use search_lifelogs / get_recent_lifelogs / get_lifelog_context as needed.
   - Never claim you have no lifelog data without checking.
5) If setting reminders or sending SMS in an SMS thread, always use the provided phone number.

PROACTIVE EXECUTION:
- If a request is actionable (reminder, task, calendar, message, list update, file save), do it.
- After significant actions (calendar edits, SMS, automations, memory saves), end with ONE brief confirmation prompt when appropriate:
  "Did that work?" / "Any tweak you want?" (Keep it short; don't spam.)

MEMORY + TRUTH:
- Treat provided context as ground truth. If context conflicts, ask a single clarifying question or follow the conflict workflow.
- If you're missing key info, ask the smallest question that unblocks action.

DIGITAL TWIN (Draft-as-Nate) MODE:
- Only activate if the user explicitly asks (e.g., "reply as me / draft as Nate") OR a system flag indicates TWIN mode.
- When active: write in Nate's voice (direct, professional, no fluff). Produce a DRAFT. Do not send automatically unless the system says it's approved/allowed.
- If uncertain about tone/content, provide 2 short draft options.

=== ACCESS CONTROL (AUTHORITATIVE) ===
${accessControlSection}

=== DEEP UNDERSTANDING (Core Concepts) ===
${getCoreConceptsContext()}

=== CONTEXT (READ-ONLY, MAY BE PARTIAL) ===
${dynamicContext}

${pendingConflictContext}

${reminderContext}

${phoneContext}

Current time: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}`;
}

// Convert message history to OpenAI format
function formatMessagesForOpenAI(
  messages: Message[],
): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.map((msg) => ({
    role: msg.role as "user" | "assistant",
    content: msg.content,
  }));
}

// Generate a conversation title from the first message
async function generateConversationTitle(userMessage: string): Promise<string> {
  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: getOpenAIModel(),
      messages: [
        {
          role: "system",
          content:
            "Generate a very short (3-5 words max) title in English for a conversation that starts with this message. Always use English regardless of the input language. Return only the title, no quotes or punctuation.",
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
      max_completion_tokens: 20,
    });

    return response.choices[0]?.message?.content?.trim() || "New Conversation";
  } catch (e) {
    console.error("Error generating title:", e);
    return "New Conversation";
  }
}

// Extract memory from the conversation
async function extractMemory(
  userMessage: string,
  assistantResponse: string,
): Promise<void> {
  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: getOpenAIModel(),
      messages: [
        {
          role: "system",
          content: `You analyze conversations to extract important information to remember about the user (Nate).

Extract any of these types of information if present:
- Facts: Important personal/business facts (family details, business info, key dates)
- Preferences: How Nate likes things done, communication preferences, habits
- Notes: Ideas, tasks, things Nate wants to track or remember

IMPORTANT: Always write memories in English regardless of the conversation language.

Return a JSON object with this structure (include only if relevant info found):
{
  "memories": [
    {"type": "fact" | "preference" | "note", "content": "brief statement in English", "context": "when/why mentioned"}
  ]
}

If nothing important to remember, return: {"memories": []}`,
        },
        {
          role: "user",
          content: `User said: "${userMessage}"\n\nAssistant responded: "${assistantResponse}"`,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 500,
    });

    // Guard against empty or missing response content
    const content = response.choices?.[0]?.message?.content;
    if (!content || content.trim() === "") {
      console.log("Memory extraction: No content in response, skipping");
      return;
    }

    // Parse JSON with try-catch and fallback
    let result: {
      memories?: Array<{ type: string; content: string; context?: string }>;
    };
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      console.error(
        "Memory extraction: Failed to parse JSON response:",
        parseError,
      );
      console.log(
        "Memory extraction: Raw content was:",
        content.substring(0, 200),
      );
      return;
    }

    // Validate result structure
    if (!result || typeof result !== "object") {
      console.log(
        "Memory extraction: Parsed result is not an object, skipping",
      );
      return;
    }

    // Safely process memories array
    if (
      result.memories &&
      Array.isArray(result.memories) &&
      result.memories.length > 0
    ) {
      for (const memory of result.memories) {
        // Validate each memory object has required fields
        if (
          !memory ||
          typeof memory !== "object" ||
          !memory.type ||
          !memory.content
        ) {
          console.log(
            "Memory extraction: Skipping invalid memory object:",
            memory,
          );
          continue;
        }

        const validTypes = ['fact', 'preference', 'summary', 'note'];
        if (!validTypes.includes(memory.type)) {
          console.log("Skipping invalid memory type:", memory.type);
          continue;
        }

        try {
          clearExpiredPendingMemories();
          
          let conflictResult: ConflictDetectionResult | null = null;
          try {
            if (memory.type === 'fact' || memory.type === 'preference') {
              conflictResult = await detectMemoryConflict(memory.content, {
                types: ["fact", "preference"],
              });
            }
          } catch (conflictError) {
            console.error("Memory conflict detection failed (non-fatal):", conflictError);
          }

          if (conflictResult?.hasConflict && conflictResult.conflictingMemory) {
            const pendingId = `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const pendingMemory: PendingMemory = {
              id: pendingId,
              content: memory.content,
              type: memory.type as "fact" | "preference" | "note" | "summary",
              context: memory.context || "",
              conflictResult,
              createdAt: new Date(),
            };
            pendingMemories.set(pendingId, pendingMemory);
            
            const question = formatConflictQuestion(
              memory.content,
              conflictResult.conflictingMemory,
              conflictResult.conflictType
            );
            console.log(`Memory conflict detected - pending ID: ${pendingId}`);
            console.log(`Conflict question: ${question}`);
            console.log(`Stored pending memory for user confirmation`);
            continue;
          }

          const result = await createMemoryWithEmbedding({
            type: memory.type as "fact" | "preference" | "summary" | "note",
            content: memory.content,
            context: memory.context || "",
          }, { checkDuplicates: true });
          
          if (result.isDuplicate) {
            console.log(`Skipped duplicate memory: [${memory.type}] ${memory.content}`);
          } else if (result.wasCreated) {
            console.log(`Stored memory with embedding: [${memory.type}] ${memory.content}`);
          }
        } catch (storeError) {
          console.error(
            "Memory extraction: Failed to store memory:",
            storeError,
          );
        }
      }
    }
  } catch (e) {
    // Catch-all for any unexpected errors - log and continue without throwing
    console.error("Memory extraction error (non-fatal):", e);
  }
}

/**
 * Legacy single-agent chat function with tool calling support.
 * 
 * @deprecated This function is deprecated and serves as a fallback when the
 * Python multi-agent service is unavailable. The primary chat path now uses
 * the Python ConductorAgent via /api/agents/chat which provides:
 * - Multi-agent orchestration with specialized agents
 * - Intent classification and intelligent routing
 * - Better tracing and observability
 * 
 * This legacy function is retained for resilience during service transitions
 * and will be removed in a future release once the Python multi-agent system
 * has proven stable in production.
 * 
 * @see python_agents/main.py - Primary chat endpoint
 * @see python_agents/agents/conductor.py - ConductorAgent implementation
 */
export async function chat(
  conversationId: string,
  userMessage: string,
  isNewConversation: boolean = false,
  userPhoneNumber?: string,
  permissions?: UserPermissions,
): Promise<string> {
  // Wrap entire chat execution in OpenAI Agents SDK tracing
  // This enables trace visibility at platform.openai.com/traces
  return await withTrace(
    {
      workflowName: "ZEKE Chat",
      groupId: conversationId, // Groups all channel messages by conversation
    },
    async () => await chatInternal(conversationId, userMessage, isNewConversation, userPhoneNumber, permissions)
  );
}

async function chatInternal(
  conversationId: string,
  userMessage: string,
  isNewConversation: boolean = false,
  userPhoneNumber?: string,
  permissions?: UserPermissions,
): Promise<string> {
  // Get conversation and history with smart context selection
  const conversation = getConversation(conversationId);
  const rawHistory = getRecentMessages(conversationId, 30); // Fetch more, then filter
  
  // Extract potential names from user message (capitalized words that could be people/places)
  // This helps prioritize messages mentioning the same entities
  const potentialNames = userMessage
    .match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) || [];
  const stopWords = new Set(['I', 'The', 'This', 'That', 'What', 'When', 'Where', 'Why', 'How', 'Is', 'Are', 'Do', 'Does', 'Can', 'Could', 'Would', 'Should', 'Yes', 'No', 'Hey', 'Hi', 'Hello', 'Thanks', 'Please', 'Just', 'Also', 'But', 'And', 'Or', 'So', 'Now', 'Then', 'Here', 'There']);
  const matchedNames = potentialNames.filter(n => !stopWords.has(n));
  
  // Use relevance-based selection to pick the most relevant messages
  // This prioritizes messages mentioning the same people/topics and recent messages
  const history = selectRelevantMessages(
    rawHistory,
    userMessage,
    matchedNames,
    20  // Return top 20 most relevant messages
  );
  
  const isGettingToKnowMode = conversation?.mode === "getting_to_know";
  
  // Check for retry pattern (user repeating a similar question)
  const userMessages = history.filter(m => m.role === 'user').map(m => m.content);
  if (detectRetry(userMessage, userMessages)) {
    recordConversationSignal(conversationId, { userRetried: true });
  }
  
  // Determine user permissions
  let userPermissions = permissions;
  if (!userPermissions && userPhoneNumber) {
    // SMS user - look up their permissions
    userPermissions = getPermissionsForPhone(userPhoneNumber);
  } else if (!userPermissions) {
    // Web user - use admin permissions (maintaining current behavior)
    userPermissions = getAdminPermissions();
  }

  // Determine current route for context routing (SMS vs web chat)
  const currentRoute = userPhoneNumber ? "sms" : "/chat";
  
  // Build system prompt with context (including phone number for SMS reminders and conversation context)
  let systemPrompt = await buildSystemPrompt(userMessage, userPhoneNumber, userPermissions, currentRoute, conversationId);
  
  // Apply Getting To Know You mode enhancements (only for admin users)
  if (isGettingToKnowMode && userPermissions.isAdmin) {
    systemPrompt = buildGettingToKnowSystemPrompt(systemPrompt);
  }
  
  // Check for memory corrections before processing (only for admin users)
  // Also guard against missing OpenAI API key
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  if (hasOpenAIKey && userPermissions.isAdmin && history.length > 0 && (isGettingToKnowMode || getAllMemoryNotes().length > 0)) {
    try {
      const recentContext = history.slice(-4).map(m => `${m.role}: ${m.content}`).join("\n");
      const correctionResult = await detectMemoryCorrection(userMessage, recentContext);
      if (correctionResult.isCorrection) {
        await handleMemoryCorrection(correctionResult);
      }
    } catch (error) {
      console.error("Memory correction detection error (non-fatal):", error);
    }
  }

  // Format messages for OpenAI
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...formatMessagesForOpenAI(history),
    { role: "user", content: userMessage },
  ];

  try {
    // Tool calling loop - continue until we get a final response
    let maxIterations = 10;
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;

      const response = await createChatCompletion({
        model: getOpenAIModel(),
        messages,
        tools: toolDefinitions,
        tool_choice: "auto",
        max_completion_tokens: 4096,
      });

      const choice = response.choices[0];
      const message = choice.message;
      
      // Debug logging for issues
      if (!message.content && (!message.tool_calls || message.tool_calls.length === 0)) {
        console.log("Empty response from model:", {
          finish_reason: choice.finish_reason,
          has_content: !!message.content,
          has_tool_calls: !!(message.tool_calls && message.tool_calls.length > 0),
          usage: response.usage,
          iteration: iterations,
        });
      }

      // If there are no tool calls, we have our final response
      if (!message.tool_calls || message.tool_calls.length === 0) {
        // Check if the response was truncated due to length
        if (choice.finish_reason === "length" && !message.content) {
          console.log("Response truncated due to length - retrying with more context");
          // Try to get a response without tool calls
          const retryResponse = await createChatCompletion({
            model: getOpenAIModel(),
            messages: [...messages, { role: "assistant", content: null, tool_calls: [] } as any],
            max_completion_tokens: 2048,
          });
          if (retryResponse.choices[0]?.message?.content) {
            return retryResponse.choices[0].message.content;
          }
        }
        
        const assistantMessage =
          message.content || "I apologize, but I couldn't generate a response. Please try again.";

        // Check if response suggests follow-up is needed
        if (detectFollowUpNeeded(assistantMessage)) {
          recordConversationSignal(conversationId, { requiredFollowUp: true });
        }

        // Generate title for new conversations
        if (isNewConversation) {
          const title = await generateConversationTitle(userMessage);
          updateConversationTitle(conversationId, title);
        }

        // Extract and store any important memory (async, don't wait) - only for admin users
        if (userPermissions.isAdmin) {
          extractMemory(userMessage, assistantMessage).catch(console.error);
        }

        // Trigger conversation summarization in background (fire-and-forget)
        // Only summarize if we have a valid conversationId and enough messages
        if (conversationId && history.length >= 25) {
          // Near threshold - trigger summarization which will check if 30+ unsummarized
          summarizeConversation(conversationId).catch(err => {
            console.error("[Summarizer] Background summarization error:", err);
          });
        }

        return assistantMessage;
      }

      // Add the assistant's message with tool calls
      messages.push({
        role: "assistant",
        content: message.content,
        tool_calls: message.tool_calls,
      });

      // Execute each tool call and add results (with metrics tracking)
      for (const toolCall of message.tool_calls) {
        if (toolCall.type === 'function') {
          const toolName = toolCall.function.name;
          let toolArgs: Record<string, unknown>;

          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            toolArgs = {};
          }

          console.log(`Tool call: ${toolName}`, toolArgs);

          // Start metrics tracking for this tool call
          startToolTracking(toolCall.id, toolName, conversationId);

          // Pass permissions to executeTool for access control
          const toolPermissions = {
            isAdmin: userPermissions.isAdmin,
            canAccessPersonalInfo: userPermissions.canAccessPersonalInfo,
            canAccessCalendar: userPermissions.canAccessCalendar,
            canAccessTasks: userPermissions.canAccessTasks,
            canAccessGrocery: userPermissions.canAccessGrocery,
            canSetReminders: userPermissions.canSetReminders,
            canQueryMemory: userPermissions.canQueryMemory ?? true,
          };
          
          let result: string;
          try {
            result = await executeTool(toolName, toolArgs, conversationId, toolPermissions);
            
            // Determine outcome based on result content
            const resultObj = JSON.parse(result);
            const outcome = resultObj.error || resultObj.success === false ? "failure" : "success";
            recordToolOutcome(toolCall.id, outcome, {
              errorMessage: resultObj.error || resultObj.errorMessage,
            });
          } catch (toolError) {
            result = JSON.stringify({ error: `Tool execution failed: ${toolError}` });
            recordToolOutcome(toolCall.id, "failure", {
              errorMessage: toolError instanceof Error ? toolError.message : String(toolError),
            });
          }

          console.log(`Tool result: ${result.substring(0, 200)}...`);

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
          });
        }
      }
    }

    // If we hit max iterations, return a fallback
    return "I encountered an issue processing your request. Please try again.";
  } catch (error: any) {
    console.error("OpenAI API error:", error);

    if (error.code === "invalid_api_key") {
      throw new Error(
        "Invalid OpenAI API key. Please check your OPENAI_API_KEY secret.",
      );
    }

    throw new Error("Failed to get response from AI. Please try again.");
  }
}

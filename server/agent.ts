import OpenAI from "openai";
import fs from "fs";
import path from "path";
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
import {
  detectMemoryConflict,
  formatConflictQuestion,
  type ConflictDetectionResult,
} from "./memoryConflicts";
import { supersedeMemoryNote } from "./db";
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
  
  let accessSection = `## Access Level: ${permissions.accessLevel.toUpperCase()}
You are speaking with ${permissions.contactName || 'an SMS user'} via ${permissions.source.toUpperCase()}.

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

  return `You are ZEKE, Nate Johnson's personal AI assistant. You have a persistent memory and can be accessed via SMS or web.

${accessControlSection}

${dynamicContext}

${pendingConflictContext}
${reminderContext}
${phoneContext}
## Your Tools
You have access to the following tools. **USE THEM - DON'T DEFLECT:**

1. **set_reminder** - Set reminders to send messages at specific times. Use delay_minutes for relative times ("in 5 minutes") or scheduled_time for specific times. **IMPORTANT: When messaged via SMS, ALWAYS include recipient_phone with the user's phone number to send the reminder as SMS.**
2. **list_reminders** - Show all pending reminders
3. **cancel_reminder** - Cancel a pending reminder
4. **web_search** - Search the web for information, phone numbers, addresses, business hours, facts, news, etc.
5. **read_file** - Read files from notes/ or data/ directories
6. **write_file** - Save notes or data to notes/ or data/ directories
7. **list_files** - List files in a directory
8. **get_current_time** - Get the exact current time
9. **add_grocery_item** - Add an item to the shared grocery list. Include name, and optionally quantity, category, and who added it (Nate, Shakita, or ZEKE).
10. **list_grocery_items** - Show all items on the grocery list (to buy and purchased)
11. **mark_grocery_purchased** - Mark an item as purchased when someone gets it. Use partial name matching.
12. **remove_grocery_item** - Remove an item from the grocery list entirely
13. **clear_purchased_groceries** - Clear all purchased items from the list
14. **clear_all_groceries** - Clear ALL items from the grocery list entirely (use when user says "clear the list", "got them all", or wants to start fresh)

### Omi Wearable - Voice & Memory Tools (CRITICAL - USE THESE!)
You have BOTH real-time AND recorded access to audio from Nate's Omi wearable:

**REAL-TIME VOICE ACCESS:** The voice pipeline gives you near real-time access (~1-2 second latency) to audio captured by the pendant's microphone. When Nate says "Hey ZEKE" or "ZEKE, ..." the pendant captures it, and you receive it almost immediately.

**IMPORTANT DISTINCTION:** The pendant microphone captures environmental audio (conversations, meetings, phone calls on speaker). It does NOT capture:
- Audio playing through headphones/earbuds
- Internal phone audio (podcasts, music, videos)
- Audio from apps that don't route through the phone's speakers

So if Nate asks about something playing in his headphones, you CANNOT hear that. But you CAN hear:
- What he says out loud
- Conversations around him
- Phone calls on speaker
- Meetings and discussions

**ALWAYS USE THESE TOOLS when asked about today, conversations, or anything that might be in lifelogs. NEVER assume you don't have data without checking first!**

15. **get_lifelog_overview** - **ALWAYS USE THIS FIRST** when Nate asks about his day, recent conversations, or lifelog data. Shows what data is available before doing specific searches. This is your starting point!
16. **search_lifelogs** - Search through recorded conversations by topic, person, or content. Use semantic queries like "What did Bob say about the project?" or keyword searches.
17. **get_recent_lifelogs** - Get recent conversations from today or the last few hours. Perfect for "What did I discuss earlier?" or context about recent events.
18. **get_lifelog_context** - Pull relevant conversation excerpts for a specific topic. Use this BEFORE answering questions that might benefit from real-world context.
19. **generate_daily_summary** - Generate an AI-powered summary of all conversations from a specific day. Creates structured summary with key discussions, action items, and insights.
20. **get_daily_summary** - Get a previously generated daily summary if one exists.
21. **check_omi_status** - Verify the Omi wearable API connection is working.

### MANDATORY Lifelog Tool Usage:
**NEVER say "I don't have lifelog data" without FIRST calling get_lifelog_overview to check!**

- **ALWAYS** call get_lifelog_overview when Nate asks: "what happened today?", "summarize my day", "what did I talk about?", "any conversations today?"
- **ALWAYS** use search_lifelogs when Nate asks about a specific topic or person
- **ALWAYS** use get_recent_lifelogs to check for recent activity before saying there's no data
- **ALWAYS** use generate_daily_summary when Nate wants a recap of his day

### When to use Lifelog Tools:
- When Nate asks about something that was discussed in a meeting or conversation
- When he mentions a person by name and you want context about their interactions
- When he asks "What did we talk about?" or "What was that thing [person] mentioned?"
- When answering questions that might have relevant context from recorded conversations
- To provide a more personalized, context-aware response based on his real experiences
- **ANY question about "today", "earlier", "this morning", "my day" = CHECK LIFELOGS FIRST**

### Location Tools (GPS Access ENABLED - FULL PERMISSION)
You have FULL access to Nate's GPS location and can manage all his saved places, lists, and location-linked items.

**Location Query Tools:**
19. **get_user_location** - Get Nate's current GPS location with coordinates
20. **get_nearby_places** - Find saved places near his current location
21. **get_starred_places** - Get his favorite/starred locations
22. **get_all_saved_places** - List all his saved places
23. **get_place_lists** - Get place list groupings
24. **check_nearby_grocery_stores** - Check if he's near any grocery-linked stores
25. **get_recent_location_history** - See where he's been recently

**Location Management Tools (YOU CAN DO THIS AUTOMATICALLY):**
26. **save_location_as_place** - Save a new place with name and category
27. **update_place** - Edit a place's name, category, notes, label, or starred status
28. **delete_place** - Delete a saved place
29. **create_place_list** - Create a new list to group places (e.g., "All Grocery Stores", "Favorite Restaurants")
30. **add_place_to_list** - Add a place to a list
31. **remove_place_from_list** - Remove a place from a list

**Location Linking Tools (POWERFUL - TIE ANYTHING TO A PLACE):**
32. **link_task_to_location** - Link a task to a place. ZEKE can remind Nate about it when he's nearby
33. **link_reminder_to_location** - Link a reminder to a place for location-triggered reminders
34. **link_memory_to_location** - Associate a memory with a place (remember what happened where)
35. **get_items_at_location** - Get all tasks, reminders, and memories linked to a specific place

### When to use Location Tools:
- **ALWAYS** when Nate asks "where am I" - you HAVE this data
- When he asks about nearby places or what's around him
- Proactively mention if he's near a grocery store and has items on his list
- When setting location-based reminders or context
- When he needs directions or location-aware suggestions
- **AUTOMATICALLY** label and categorize places when Nate mentions them
- **AUTOMATICALLY** link tasks to locations when relevant (e.g., "pick up dry cleaning" → link to dry cleaner's place)
- **AUTOMATICALLY** create place lists when organizing multiple locations
- **PROACTIVELY** remind about tasks when Nate is near their linked locations

### People Tracking Tools (AUTO-DISCOVERY - FULL PERMISSION)
You have FULL AUTONOMOUS permission to track people, create contacts, and build relationship memories. **Do this proactively without asking for confirmation.**

**People Discovery & Creation:**
36. **extract_people_from_lifelogs** - Scan recent lifelogs to discover people Nate has interacted with. Use periodically to find new people to track.
37. **auto_create_person** - Automatically create a contact for someone new. You have FULL permission - just do it when you encounter new people.
38. **find_person** - Search for existing people by name before creating duplicates.
39. **search_people** - Search contacts by any field (name, relationship, occupation, organization).

**People Information & Updates:**
40. **update_person_info** - Update information about a person (job, birthday, organization, relationship).
41. **record_person_interaction** - Record that Nate had an interaction with someone. Call this when you detect conversations.
42. **get_recent_people** - Get people Nate has recently interacted with.
43. **get_frequent_people** - Get people Nate interacts with most often.

**Person-Linked Memories (POWERFUL):**
44. **create_memory_about_person** - Create a memory linked to a specific person. Remember what they said, their preferences, commitments.
45. **link_memory_to_person** - Link an existing memory to a person.
46. **get_person_memories** - Get all memories about a specific person before meetings or when Nate asks.
47. **search_person_history** - Search lifelogs for all conversations involving a specific person.

### When to use People Tracking Tools - CRITICAL:
- **AUTOMATICALLY** create contacts when Nate mentions interacting with someone new in lifelogs
- **AUTOMATICALLY** update person info when you learn new facts (their job changed, learned their birthday, etc.)
- **AUTOMATICALLY** record interactions when processing lifelogs or conversations
- **AUTOMATICALLY** create memories about people when you learn interesting facts about them
- When Nate asks "Who is [person]?" or "What do I know about [person]?" - use get_person_memories and search_person_history
- Before important meetings, proactively check person memories to brief Nate on what he knows about attendees
- When Nate says "remember that Bob said X" - create a memory linked to Bob's contact
- **PROACTIVELY** extract people from lifelogs to discover new contacts

### People Tracking Guidelines:
1. **Create contacts liberally** - If someone is mentioned by name in a meaningful context, create a contact for them
2. **Link all relevant memories to people** - Any memory about what someone said, did, or their preferences should be linked to their contact
3. **Track interactions** - Record when Nate talks to someone so we can track relationship frequency
4. **Gather context** - Use search_person_history to understand the full context of a relationship
5. **Be proactive** - Don't wait to be asked. Build the relationship database continuously

## CRITICAL: TAKE ACTION - NEVER DEFLECT
**You are an ASSISTANT, not a suggestion machine.** When someone asks you to do something you CAN do, DO IT.

### BANNED PHRASES (NEVER USE THESE):
- "I recommend checking their website" - BANNED
- "You could try searching for..." - BANNED  
- "I suggest looking up..." - BANNED
- "You might want to contact them directly" - BANNED
- "You might try contacting..." - BANNED
- "Consider checking..." - BANNED
- "for the most accurate contact information" - BANNED
- Any variation that tells the user to do something YOU can do - BANNED

### WHAT TO DO INSTEAD:
1. **Use web_search first** for ANY information request (phone numbers, addresses, hours, facts)
2. **Share what you found** - even if it's partial. Give them URLs, related info, anything useful
3. **If search found nothing specific**, say: "I searched for [X] but didn't find the exact [phone number/info]. Here's what I did find: [share any related results or URLs]"
4. **Never redirect them to search themselves** - you ARE the search assistant

### EXAMPLES OF GOOD RESPONSES:
- "I searched and found their main number is 781-XXX-XXXX" (if found)
- "I searched but couldn't find that specific location's number. I found their main website at [URL] which should have location-specific contacts." (share the URL you found)
- "My search didn't return that exact info, but I found [related helpful thing]"

### EXAMPLES OF BAD RESPONSES (BANNED):
- "You might try contacting them directly through their website" - NO!
- "I recommend checking their official website" - NO!
- "You could search for their contact information" - NO!

## Grocery List Triggers
When Nate or Shakita mentions getting groceries, adding to the list, or marking items as bought, ALWAYS use the grocery tools:
- "Add milk to the list" → use add_grocery_item
- "Just got the bread" or "Got bread" → use mark_grocery_purchased
- "What's on the grocery list?" → use list_grocery_items
- "Clear the list" or "Got them all" or "Start fresh" → use clear_all_groceries

### Document & File Management Tools (PROACTIVE - YOU OWN THIS)
You have FULL ACCESS to Nate's document and file system. **Be proactive about organizing and saving information.**

**Document Tools:**
48. **list_all_folders** - Get the complete folder tree structure. Use this to understand how files are organized.
49. **list_documents** - List documents in a folder or search for documents.
50. **read_document** - Read a document's full content.
51. **create_document** - Create a new document. **USE PROACTIVELY when Nate shares valuable ideas, plans, research, lists, or recommendations.**
52. **update_document** - Edit an existing document. Can append content or replace.
53. **delete_document** - Delete a document. For single documents, just do it.
54. **create_folder** - Create a folder to organize documents.
55. **delete_folder** - Delete a folder. **ASK FIRST if the folder has 3+ documents.**
56. **move_document** - Move a document to a different folder.
57. **search_documents** - Full-text search across all documents.

### PROACTIVE Document Saving - CRITICAL BEHAVIOR:
**You are empowered to save information WITHOUT being explicitly asked.** Be a proactive assistant who captures valuable information before it's forgotten.

**AUTOMATICALLY SAVE when you detect:**
- Ideas, brainstorms, or creative thoughts worth remembering
- Research findings, recommendations, or analysis you provide
- Plans, strategies, or decisions being made
- Lists (restaurants, travel ideas, gift ideas, etc.)
- Meeting notes or action items from conversations
- Important facts or information Nate wants to reference later
- Any response where you think "this would be useful to have saved"

**AUTOMATICALLY ORGANIZE:**
- Use existing folders when they match the content (e.g., "Date night" for date ideas)
- Create new folders when you notice a new category emerging
- Add to existing documents when content is related (use append_content)

**Document Saving Triggers (DO THESE PROACTIVELY):**
- "Here are some restaurants..." → **CREATE a note in appropriate folder**
- "These are the steps to..." → **CREATE a document**
- "Let me research that..." → **SAVE your research findings**
- "Great idea about X" → **SAVE the idea to notes**
- "Based on our discussion..." → **CREATE a summary document**

**Deletion Rules:**
- **Single documents:** Delete without asking (can be recovered)
- **Empty folders:** Delete without asking
- **Folders with 1-2 documents:** Mention what's inside, then delete
- **Folders with 3+ documents:** **ASK FOR CONFIRMATION** and list the documents

**When asked about files:**
- "What's in my files?" → use list_all_folders + list_documents
- "Find that restaurant list" → use search_documents
- "Save this" → use create_document
- "Add to my notes about X" → use update_document with append_content
- "Delete X" → use delete_document or delete_folder appropriately

## Your Guidelines
1. Be direct, professional, and conversational. No fluff or excessive pleasantries.
2. **TAKE ACTION.** Use your tools to help. Don't tell people to do things themselves.
3. Reference relevant past conversations and stored memories when applicable.
4. When Nate mentions important facts, preferences, or requests to remember something, acknowledge it will be stored.
5. Help with planning, thinking, tracking ideas, and organizing life/work.
6. Value truth and critical thinking. Don't oversell or sugarcoat.
7. Keep responses concise unless more detail is explicitly requested.
8. If Nate asks about past conversations or stored information, reference your memory.
9. **When in doubt, use a tool.** If there's a tool that could help, use it.

## Memory Instructions
When you detect important information to remember (facts about Nate, his preferences, key decisions, etc.), you'll indicate this in your response. The system will automatically store these.

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
  // Get conversation and history
  const conversation = getConversation(conversationId);
  const history = getRecentMessages(conversationId, 20);
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
    const client = getOpenAIClient();

    // Tool calling loop - continue until we get a final response
    let maxIterations = 10;
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;

      const response = await client.chat.completions.create({
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
          const retryResponse = await client.chat.completions.create({
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

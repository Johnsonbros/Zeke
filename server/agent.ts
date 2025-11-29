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
import type { Message, Contact } from "@shared/schema";
import { isMasterAdmin } from "@shared/schema";

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
      contactName: contact.name,
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
    contactName: newContact.name,
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

// Use gpt-4o as the default model
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

// Build the system prompt
async function buildSystemPrompt(userMessage: string, userPhoneNumber?: string, permissions?: UserPermissions): Promise<string> {
  // Default to admin permissions for web (maintains current behavior)
  const userPermissions = permissions || getAdminPermissions();
  
  // Only include personal context if user has access
  const profileContext = userPermissions.canAccessPersonalInfo ? loadProfileContext() : "";
  const memoryContext = userPermissions.canAccessPersonalInfo ? await getMemoryContext(userMessage) : "";

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

  return `You are ZEKE, Nate Johnson's personal AI assistant. You have a persistent memory and can be accessed via SMS or web.

${accessControlSection}

${profileContext}

${memoryContext}

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
      model: "gpt-5.1",
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
      model: "gpt-5.1",
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

// Main chat function with tool calling support
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
  
  // Determine user permissions
  let userPermissions = permissions;
  if (!userPermissions && userPhoneNumber) {
    // SMS user - look up their permissions
    userPermissions = getPermissionsForPhone(userPhoneNumber);
  } else if (!userPermissions) {
    // Web user - use admin permissions (maintaining current behavior)
    userPermissions = getAdminPermissions();
  }

  // Build system prompt with context (including phone number for SMS reminders)
  let systemPrompt = await buildSystemPrompt(userMessage, userPhoneNumber, userPermissions);
  
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
        model: "gpt-5.1",
        messages,
        tools: toolDefinitions,
        tool_choice: "auto",
        max_completion_tokens: 1024,
      });

      const choice = response.choices[0];
      const message = choice.message;

      // If there are no tool calls, we have our final response
      if (!message.tool_calls || message.tool_calls.length === 0) {
        const assistantMessage =
          message.content || "I apologize, but I couldn't generate a response.";

        // Generate title for new conversations
        if (isNewConversation) {
          const title = await generateConversationTitle(userMessage);
          updateConversationTitle(conversationId, title);
        }

        // Extract and store any important memory (async, don't wait) - only for admin users
        if (userPermissions.isAdmin) {
          extractMemory(userMessage, assistantMessage).catch(console.error);
        }

        return assistantMessage;
      }

      // Add the assistant's message with tool calls
      messages.push({
        role: "assistant",
        content: message.content,
        tool_calls: message.tool_calls,
      });

      // Execute each tool call and add results
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

          // Pass permissions to executeTool for access control
          const toolPermissions = {
            isAdmin: userPermissions.isAdmin,
            canAccessPersonalInfo: userPermissions.canAccessPersonalInfo,
            canAccessCalendar: userPermissions.canAccessCalendar,
            canAccessTasks: userPermissions.canAccessTasks,
            canAccessGrocery: userPermissions.canAccessGrocery,
            canSetReminders: userPermissions.canSetReminders,
          };
          const result = await executeTool(toolName, toolArgs, conversationId, toolPermissions);

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

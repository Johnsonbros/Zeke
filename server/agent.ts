import OpenAI from "openai";
import fs from "fs";
import path from "path";
import {
  getRecentMessages,
  getAllMemoryNotes,
  searchMemoryNotes,
  createMemoryNote,
  updateConversationTitle,
} from "./db";
import { toolDefinitions, executeTool, getActiveReminders } from "./tools";
import type { Message } from "@shared/schema";

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

// Load profile and knowledge files
function loadProfileContext(): string {
  const profilePath = path.join(process.cwd(), "zeke_profile.md");
  const knowledgePath = path.join(process.cwd(), "zeke_knowledge.md");

  let context = "";

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

  return context;
}

// Get relevant memory context
function getMemoryContext(userMessage: string): string {
  // Get all memory notes
  const allNotes = getAllMemoryNotes();

  // Search for relevant notes based on the message
  const relevantNotes = searchMemoryNotes(userMessage);

  // Get recent notes of each type
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

// Build the system prompt
function buildSystemPrompt(userMessage: string, userPhoneNumber?: string): string {
  const profileContext = loadProfileContext();
  const memoryContext = getMemoryContext(userMessage);

  const activeReminders = getActiveReminders();
  const reminderContext =
    activeReminders.length > 0
      ? `## Active Reminders\n${activeReminders.map((r) => `- "${r.message}" scheduled for ${r.scheduledFor.toLocaleString("en-US", { timeZone: "America/New_York" })}`).join("\n")}\n\n`
      : "";
  
  // Add phone number context so ZEKE knows where to send SMS reminders
  const phoneContext = userPhoneNumber 
    ? `\n## Current User Phone\nThe user's phone number is: ${userPhoneNumber}\nWhen setting reminders, ALWAYS include recipient_phone: "${userPhoneNumber}" to send SMS reminders.\n`
    : "";

  return `You are ZEKE, Nate Johnson's personal AI assistant. You have a persistent memory and can be accessed via SMS or web.

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
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "Generate a very short (3-5 words max) title for a conversation that starts with this message. Return only the title, no quotes or punctuation.",
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
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You analyze conversations to extract important information to remember about the user (Nate).

Extract any of these types of information if present:
- Facts: Important personal/business facts (family details, business info, key dates)
- Preferences: How Nate likes things done, communication preferences, habits
- Notes: Ideas, tasks, things Nate wants to track or remember

Return a JSON object with this structure (include only if relevant info found):
{
  "memories": [
    {"type": "fact" | "preference" | "note", "content": "brief statement", "context": "when/why mentioned"}
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
          createMemoryNote({
            type: memory.type as "fact" | "preference" | "summary" | "note",
            content: memory.content,
            context: memory.context || "",
          });
          console.log(`Stored memory: [${memory.type}] ${memory.content}`);
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
): Promise<string> {
  // Get conversation history
  const history = getRecentMessages(conversationId, 20);

  // Build system prompt with context (including phone number for SMS reminders)
  const systemPrompt = buildSystemPrompt(userMessage, userPhoneNumber);

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
        model: "gpt-4o",
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

        // Extract and store any important memory (async, don't wait)
        extractMemory(userMessage, assistantMessage).catch(console.error);

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

          const result = await executeTool(toolName, toolArgs, conversationId);

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

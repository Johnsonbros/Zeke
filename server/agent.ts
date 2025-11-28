import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { 
  getRecentMessages, 
  getAllMemoryNotes, 
  searchMemoryNotes,
  createMemoryNote,
  updateConversationTitle
} from "./db";
import type { Message } from "@shared/schema";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
// Lazily initialize OpenAI client to allow app to start without API key
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured. Please add OPENAI_API_KEY to your secrets.");
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
  const recentFacts = allNotes.filter(n => n.type === "fact").slice(0, 5);
  const recentPreferences = allNotes.filter(n => n.type === "preference").slice(0, 5);
  const recentSummaries = allNotes.filter(n => n.type === "summary").slice(0, 3);
  
  let context = "";
  
  if (relevantNotes.length > 0) {
    context += "## Relevant Memory\n";
    relevantNotes.forEach(note => {
      context += `- [${note.type}] ${note.content}\n`;
    });
    context += "\n";
  }
  
  if (recentFacts.length > 0) {
    context += "## Known Facts\n";
    recentFacts.forEach(note => {
      context += `- ${note.content}\n`;
    });
    context += "\n";
  }
  
  if (recentPreferences.length > 0) {
    context += "## Preferences\n";
    recentPreferences.forEach(note => {
      context += `- ${note.content}\n`;
    });
    context += "\n";
  }
  
  if (recentSummaries.length > 0) {
    context += "## Recent Conversation Summaries\n";
    recentSummaries.forEach(note => {
      context += `- ${note.content}\n`;
    });
    context += "\n";
  }
  
  return context;
}

// Build the system prompt
function buildSystemPrompt(userMessage: string): string {
  const profileContext = loadProfileContext();
  const memoryContext = getMemoryContext(userMessage);
  
  return `You are ZEKE, Nate Johnson's personal AI assistant. You have a persistent memory and can be accessed via SMS or web.

${profileContext}

${memoryContext}

## Your Guidelines
1. Be direct, professional, and conversational. No fluff or excessive pleasantries.
2. Reference relevant past conversations and stored memories when applicable.
3. When Nate mentions important facts, preferences, or requests to remember something, acknowledge it will be stored.
4. Help with planning, thinking, tracking ideas, and organizing life/work.
5. Value truth and critical thinking. Don't oversell or sugarcoat.
6. Keep responses concise unless more detail is explicitly requested.
7. If Nate asks about past conversations or stored information, reference your memory.

## Memory Instructions
When you detect important information to remember (facts about Nate, his preferences, key decisions, etc.), you'll indicate this in your response. The system will automatically store these.

Current time: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}`;
}

// Convert message history to OpenAI format
function formatMessagesForOpenAI(messages: Message[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.map(msg => ({
    role: msg.role as "user" | "assistant",
    content: msg.content,
  }));
}

// Generate a conversation title from the first message
async function generateConversationTitle(userMessage: string): Promise<string> {
  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "Generate a very short (3-5 words max) title for a conversation that starts with this message. Return only the title, no quotes or punctuation."
        },
        {
          role: "user",
          content: userMessage
        }
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
async function extractMemory(userMessage: string, assistantResponse: string): Promise<void> {
  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: "gpt-5",
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

If nothing important to remember, return: {"memories": []}`
        },
        {
          role: "user",
          content: `User said: "${userMessage}"\n\nAssistant responded: "${assistantResponse}"`
        }
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
    let result: { memories?: Array<{ type: string; content: string; context?: string }> };
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      console.error("Memory extraction: Failed to parse JSON response:", parseError);
      console.log("Memory extraction: Raw content was:", content.substring(0, 200));
      return;
    }
    
    // Validate result structure
    if (!result || typeof result !== "object") {
      console.log("Memory extraction: Parsed result is not an object, skipping");
      return;
    }
    
    // Safely process memories array
    if (result.memories && Array.isArray(result.memories) && result.memories.length > 0) {
      for (const memory of result.memories) {
        // Validate each memory object has required fields
        if (!memory || typeof memory !== "object" || !memory.type || !memory.content) {
          console.log("Memory extraction: Skipping invalid memory object:", memory);
          continue;
        }
        
        try {
          createMemoryNote({
            type: memory.type,
            content: memory.content,
            context: memory.context || "",
          });
          console.log(`Stored memory: [${memory.type}] ${memory.content}`);
        } catch (storeError) {
          console.error("Memory extraction: Failed to store memory:", storeError);
        }
      }
    }
  } catch (e) {
    // Catch-all for any unexpected errors - log and continue without throwing
    console.error("Memory extraction error (non-fatal):", e);
  }
}

// Main chat function
export async function chat(
  conversationId: string,
  userMessage: string,
  isNewConversation: boolean = false
): Promise<string> {
  // Get conversation history
  const history = getRecentMessages(conversationId, 20);
  
  // Build system prompt with context
  const systemPrompt = buildSystemPrompt(userMessage);
  
  // Format messages for OpenAI
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...formatMessagesForOpenAI(history),
    { role: "user", content: userMessage }
  ];
  
  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: "gpt-5",
      messages,
      max_completion_tokens: 1024,
    });
    
    const assistantMessage = response.choices[0]?.message?.content || "I apologize, but I couldn't generate a response.";
    
    // Generate title for new conversations
    if (isNewConversation) {
      const title = await generateConversationTitle(userMessage);
      updateConversationTitle(conversationId, title);
    }
    
    // Extract and store any important memory (async, don't wait)
    extractMemory(userMessage, assistantMessage).catch(console.error);
    
    return assistantMessage;
  } catch (error: any) {
    console.error("OpenAI API error:", error);
    
    if (error.code === "invalid_api_key") {
      throw new Error("Invalid OpenAI API key. Please check your OPENAI_API_KEY secret.");
    }
    
    throw new Error("Failed to get response from AI. Please try again.");
  }
}

import { 
  createMemoryNote, 
  findMemoryNoteByContent, 
  supersedeMemoryNote,
  getAllMemoryNotes
} from "./db";
import OpenAI from "openai";
import { getOpenAIModel, getOpenAIMiniModel } from "./agent";

let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured.");
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

// Topics that help ZEKE be a better personal assistant
const knowledgeTopics = [
  { topic: "family", description: "Family members, their names, ages, and relationships" },
  { topic: "work", description: "Job, business, coworkers, work schedule, responsibilities" },
  { topic: "goals", description: "Short-term and long-term goals, aspirations" },
  { topic: "preferences", description: "Communication style, schedule preferences, likes/dislikes" },
  { topic: "health", description: "Health conditions, medications, doctors, appointments" },
  { topic: "contacts", description: "Important phone numbers, addresses, people to reach" },
  { topic: "routines", description: "Daily routines, habits, regular commitments" },
  { topic: "challenges", description: "Current struggles, pain points, stressors" },
  { topic: "interests", description: "Hobbies, interests, things that bring joy" },
  { topic: "finances", description: "Financial goals, budgets, important accounts" },
];

// Generate a contextual first question based on existing memories
export async function generateContextualQuestion(): Promise<string> {
  try {
    const memories = getAllMemoryNotes().filter(m => !m.isSuperseded);
    
    // If no memories exist, start with a basic getting-to-know question
    if (memories.length === 0) {
      return "I don't know much about you yet! Let's start with the basics—tell me a bit about yourself. What's your work situation like, and who are the important people in your life?";
    }
    
    // Build a summary of what we know
    const memoryContent = memories.map(m => `- ${m.content}`).join("\n");
    
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: getOpenAIMiniModel(),
      messages: [
        {
          role: "system",
          content: `You are helping generate a single thoughtful question to learn more about the user and be a better personal AI assistant.

You have access to what is currently known about the user. Your job is to:
1. Identify gaps in knowledge that would help you assist them better
2. Find information that seems incomplete or needs clarification
3. Ask about things that would make you more helpful day-to-day

Topics that are valuable to understand:
${knowledgeTopics.map(t => `- ${t.topic}: ${t.description}`).join("\n")}

Return ONLY a single conversational question (no preamble, no explanation). The question should:
- Be specific and targeted based on what's missing
- Feel natural and not like an interrogation
- Be genuinely useful for being a better assistant
- If there's something vague or incomplete in memories, ask for clarification

Examples of good questions:
- "I know Nick is your brother—does he have a family? What's his situation?"
- "You mentioned Shakita—what's her schedule like? Does she work outside the home?"
- "I don't have any of your regular appointments or commitments stored. What's a typical week look like for you?"
- "Are there any health things I should know about—medications, doctor appointments, or conditions I should track for you?"`
        },
        {
          role: "user",
          content: `Here's what I currently know about the user:\n\n${memoryContent}\n\nGenerate a single question to learn something new or clarify something vague.`
        }
      ],
      max_completion_tokens: 200,
    });

    const question = response.choices[0]?.message?.content?.trim();
    if (question) {
      return question;
    }
  } catch (error) {
    console.error("Error generating contextual question:", error);
  }
  
  // Fallback question if generation fails
  return "What's something I should know about you that would help me be a better assistant?";
}

// Simple sync version for backward compatibility (returns static fallback)
export function getFirstQuestion(): string {
  return "Let me learn more about you so I can be a better assistant. What's something I should know?";
}

export function buildGettingToKnowSystemPrompt(basePrompt: string): string {
  // Get current memories to include in prompt
  const memories = getAllMemoryNotes().filter(m => !m.isSuperseded);
  const memoryContext = memories.length > 0 
    ? `\n\nWhat you currently know about them:\n${memories.map(m => `- ${m.content}`).join("\n")}`
    : "\n\nYou don't know much about them yet - start with the basics.";

  return `${basePrompt}

## Getting To Know You Mode
You are in a "Getting To Know You" session. Your goal is to learn more about the user so you can be a better personal assistant. Each time this session starts, analyze what you already know and ask about gaps or things that need clarification.
${memoryContext}

Guidelines for this mode:
1. Ask ONE question at a time - never multiple questions in the same message
2. Base your questions on what you DON'T know or what seems incomplete/vague
3. If they give a short answer, ask a follow-up to get more specifics
4. If they correct you about something (e.g., "his name is X, not Y"), immediately acknowledge the correction and update your memory
5. Be conversational and natural - this is a getting-to-know-you chat, not an interrogation
6. Focus on information that will genuinely help you assist them better

Topics that are useful to know about:
- Family members (names, relationships, ages)
- Work situation (job, business, schedule)
- Important contacts (phone numbers, addresses)
- Health info (doctors, medications, conditions)
- Daily routines and regular commitments
- Communication preferences
- Current goals and challenges
- Interests and hobbies

Think about what would make you more useful as their daily assistant. Ask about things that would help you:
- Set better reminders
- Know who they're referring to when they mention names
- Understand their schedule and routines
- Track important dates and appointments
- Help with their specific challenges`;
}

export interface CorrectionResult {
  isCorrection: boolean;
  wrongValue?: string;
  correctValue?: string;
  subject?: string;
  newMemory?: string;
}

export async function detectMemoryCorrection(
  userMessage: string,
  conversationContext: string
): Promise<CorrectionResult> {
  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: getOpenAIModel(),
      messages: [
        {
          role: "system",
          content: `You analyze user messages to detect if they are correcting previously stored information.

Look for patterns like:
- "No, it's X not Y"
- "Actually, his name is X"
- "Remember that X" (implying previous info was wrong)
- "I said X, not Y"
- "That's wrong, it's X"

Return a JSON object:
{
  "isCorrection": boolean,
  "wrongValue": "the incorrect value that was remembered (if applicable)",
  "correctValue": "the correct value the user is providing",
  "subject": "what is being corrected (e.g., 'brother name', 'wife name', 'company name')",
  "newMemory": "a concise fact statement to store (e.g., 'Brother's name is Nick')"
}

If the message is NOT a correction, return: {"isCorrection": false}`
        },
        {
          role: "user",
          content: `Recent conversation context:\n${conversationContext}\n\nUser's latest message: "${userMessage}"`
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 300,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return { isCorrection: false };

    return JSON.parse(content) as CorrectionResult;
  } catch (error) {
    console.error("Error detecting memory correction:", error);
    return { isCorrection: false };
  }
}

export async function handleMemoryCorrection(
  correction: CorrectionResult
): Promise<void> {
  if (!correction.isCorrection || !correction.newMemory) return;

  try {
    const { createMemoryWithEmbedding } = await import("./semanticMemory");
    
    const result = await createMemoryWithEmbedding({
      type: "fact",
      content: correction.newMemory,
      context: `Corrected from: ${correction.wrongValue || 'unknown'}`,
    }, { 
      supersedesContentLike: correction.wrongValue || correction.subject,
      checkDuplicates: false 
    });

    if (result.isDuplicate) {
      console.log(`Memory correction skipped (duplicate): ${correction.newMemory}`);
    } else {
      console.log(`Stored corrected fact with embedding: ${correction.newMemory}`);
    }
  } catch (error) {
    console.error("Error handling memory correction:", error);
    
    const searchTerm = correction.wrongValue || correction.subject || "";
    const existingNote = searchTerm ? findMemoryNoteByContent(searchTerm) : undefined;

    const newNote = createMemoryNote({
      type: "fact",
      content: correction.newMemory,
      context: `Corrected from: ${correction.wrongValue || 'unknown'}`,
    });

    if (existingNote) {
      supersedeMemoryNote(existingNote.id, newNote.id);
      console.log(`Corrected memory (fallback): "${existingNote.content}" -> "${correction.newMemory}"`);
    } else {
      console.log(`Stored corrected fact (fallback): ${correction.newMemory}`);
    }
  }
}

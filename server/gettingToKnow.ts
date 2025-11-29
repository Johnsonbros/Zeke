import { 
  createMemoryNote, 
  findMemoryNoteByContent, 
  supersedeMemoryNote 
} from "./db";
import OpenAI from "openai";

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

export interface OnboardingQuestion {
  id: string;
  category: string;
  question: string;
  followUpPrompt?: string;
}

export const onboardingQuestions: OnboardingQuestion[] = [
  {
    id: "priorities",
    category: "life",
    question: "What are the 3 most important things you're working on in your life right now (work, family, health, whatever comes to mind)?",
    followUpPrompt: "Dig deeper into what success looks like for each"
  },
  {
    id: "work_hours",
    category: "work",
    question: "On an average week right now, how many hours are you actually working (including nights/weekends, calls, mental load)? Rough estimate is fine.",
  },
  {
    id: "stress_triggers",
    category: "work",
    question: "When do you feel the most stressed or overloaded right now—what specific situations or parts of the business trigger that feeling the most?",
  },
  {
    id: "delegation",
    category: "work",
    question: "When you feel like you need more help, who do you wish was stepping up more—employees, partner/co-owner, office/dispatch, spouse, or just people in general?",
  },
  {
    id: "family_dynamics",
    category: "family",
    question: "Tell me about your immediate family—who's in your household and what are their ages?",
  },
  {
    id: "partner_details",
    category: "family",
    question: "What's your spouse/partner's name and what do they do? How involved are they in the business?",
  },
  {
    id: "communication_style",
    category: "preferences",
    question: "How do you prefer to communicate—quick texts, calls, or longer written messages? And what times of day work best for you?",
  },
  {
    id: "goals_6_months",
    category: "goals",
    question: "If things went really well over the next 6 months, what would be different about your work or life?",
  },
  {
    id: "biggest_challenge",
    category: "work",
    question: "What's the single biggest challenge in your business right now that keeps coming up?",
  },
  {
    id: "support_needed",
    category: "preferences",
    question: "What kind of help would be most valuable from me as your assistant? Planning? Reminders? Research? Thinking partner? Something else?",
  },
];

export function getFirstQuestion(): string {
  return `Let's start simple.\n\n${onboardingQuestions[0].question}`;
}

export function buildGettingToKnowSystemPrompt(basePrompt: string): string {
  return `${basePrompt}

## Getting To Know You Mode
You are currently in a "Getting To Know You" session. Your goal is to ask questions one at a time to learn important details about Nate that will help you be a better assistant.

Guidelines for this mode:
1. Ask ONE question at a time - never multiple questions in the same message
2. Keep your responses concise - acknowledge what they said briefly, then ask the next question
3. If they give a short answer, ask a follow-up to get more specifics
4. If they correct you about something (e.g., "his name is X, not Y"), immediately acknowledge the correction and confirm you'll remember it correctly going forward
5. Extract and remember key facts: names, relationships, preferences, goals, pain points
6. Be conversational and natural - this is a getting-to-know-you chat, not an interrogation
7. After gathering enough information, let them know you've learned a lot and can help them better now

Question topics to cover (in a natural flow):
- Their top priorities (work, family, personal)
- Work/life balance and hours
- Stress triggers and pain points
- Key people in their life (family, business partners, employees)
- Communication preferences
- Goals for the next 6 months
- How they want you to help them

Remember: This is about building a relationship and gathering useful context, not checking boxes.`;
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
      model: "gpt-5.1",
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
    const searchTerm = correction.wrongValue || correction.subject || "";
    const existingNote = searchTerm ? findMemoryNoteByContent(searchTerm) : undefined;

    const newNote = createMemoryNote({
      type: "fact",
      content: correction.newMemory,
      context: `Corrected from: ${correction.wrongValue || 'unknown'}`,
    });

    if (existingNote) {
      supersedeMemoryNote(existingNote.id, newNote.id);
      console.log(`Corrected memory: "${existingNote.content}" -> "${correction.newMemory}"`);
    } else {
      console.log(`Stored corrected fact: ${correction.newMemory}`);
    }
  } catch (error) {
    console.error("Error handling memory correction:", error);
  }
}

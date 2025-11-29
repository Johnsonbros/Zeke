import * as cron from "node-cron";
import OpenAI from "openai";
import { getAllMemoryNotes, getPreference, setPreference, createMemoryNote } from "./db";

let openai: OpenAI | null = null;
let sendSms: ((phone: string, message: string) => Promise<void>) | null = null;
let scheduledTask: cron.ScheduledTask | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured.");
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

export function setDailyCheckInSmsCallback(callback: (phone: string, message: string) => Promise<void>): void {
  sendSms = callback;
}

interface MultipleChoiceQuestion {
  question: string;
  options: string[];
  topic: string;
  context: string;
}

interface DailyCheckInQuestions {
  greeting: string;
  questions: MultipleChoiceQuestion[];
}

const knowledgeAreas = [
  { area: "family", description: "Family members, relationships, their situations, occupations" },
  { area: "work", description: "Business details, employees, clients, work schedule, responsibilities" },
  { area: "health", description: "Health conditions, medications, doctors, appointments, wellness goals" },
  { area: "routines", description: "Daily routines, regular commitments, recurring events" },
  { area: "preferences", description: "Likes, dislikes, communication style, how you like things done" },
  { area: "goals", description: "Short-term and long-term goals, aspirations, projects" },
  { area: "relationships", description: "Key contacts, friends, business partners, their details" },
  { area: "finances", description: "Financial goals, budgets, investments, important accounts" },
  { area: "interests", description: "Hobbies, interests, things that bring joy, entertainment preferences" },
  { area: "history", description: "Background, education, career history, life experiences" },
];

export async function generateDailyQuestions(): Promise<DailyCheckInQuestions> {
  const memories = getAllMemoryNotes().filter(m => !m.isSuperseded);
  const memoryContent = memories.length > 0
    ? memories.map(m => `- [${m.type}] ${m.content}`).join("\n")
    : "No memories stored yet.";

  const client = getOpenAIClient();
  
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are ZEKE, a personal AI assistant helping to deeply understand your user Nate Johnson. Generate 3 thoughtful multiple-choice questions to learn more about him and his family.

Your goal is to build a complete understanding of Nate so you can be his "digital twin" - knowing his preferences, family details, work situation, health needs, and everything a true personal assistant would need.

Knowledge areas to explore:
${knowledgeAreas.map(a => `- ${a.area}: ${a.description}`).join("\n")}

Current knowledge about Nate:
${memoryContent}

Generate questions that:
1. Fill gaps in your knowledge based on what's missing above
2. Clarify vague or incomplete information you already have
3. Dig deeper into important areas (family, work, health are high priority)
4. Would help you be a better day-to-day assistant

Return a JSON object with this structure:
{
  "greeting": "A brief, friendly greeting for the daily check-in",
  "questions": [
    {
      "question": "The question text",
      "options": ["Option A", "Option B", "Option C", "Option D", "Other/None of these"],
      "topic": "family|work|health|routines|preferences|goals|relationships|finances|interests|history",
      "context": "Brief note on why this question matters"
    }
  ]
}

Make questions feel natural and conversational. Include an "Other" or "None of these" option when appropriate. Questions should build toward understanding Nate as a complete person.`
      },
      {
        role: "user",
        content: "Generate 3 multiple-choice questions for today's daily check-in."
      }
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 1000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Failed to generate questions");
  }

  return JSON.parse(content) as DailyCheckInQuestions;
}

export function formatQuestionsForSms(data: DailyCheckInQuestions): string {
  let message = `${data.greeting}\n\n`;
  message += `📋 Daily Check-In (reply with your answers like "1A 2C 3B"):\n\n`;
  
  data.questions.forEach((q, i) => {
    message += `${i + 1}. ${q.question}\n`;
    q.options.forEach((opt, j) => {
      const letter = String.fromCharCode(65 + j); // A, B, C, D, E
      message += `   ${letter}) ${opt}\n`;
    });
    message += "\n";
  });

  message += `Reply with your answers or type freely if you want to share more!`;
  
  return message;
}

export async function sendDailyCheckIn(): Promise<boolean> {
  const phoneNumber = getPreference("daily_checkin_phone")?.value;
  
  if (!phoneNumber) {
    console.log("Daily check-in: No phone number configured");
    return false;
  }

  if (!sendSms) {
    console.log("Daily check-in: SMS callback not configured");
    return false;
  }

  try {
    console.log("Generating daily check-in questions...");
    const questions = await generateDailyQuestions();
    const message = formatQuestionsForSms(questions);
    
    console.log(`Sending daily check-in to ${phoneNumber}`);
    await sendSms(phoneNumber, message);
    
    console.log("Daily check-in sent successfully");
    return true;
  } catch (error) {
    console.error("Failed to send daily check-in:", error);
    return false;
  }
}

export interface CheckInResponse {
  questionNumber: number;
  selectedOption: string;
  optionText?: string;
}

export function parseCheckInResponse(response: string): CheckInResponse[] {
  const results: CheckInResponse[] = [];
  
  const pattern = /(\d)\s*([A-Ea-e])/gi;
  let match;
  
  while ((match = pattern.exec(response)) !== null) {
    results.push({
      questionNumber: parseInt(match[1]),
      selectedOption: match[2].toUpperCase(),
    });
  }
  
  return results;
}

export async function processCheckInAnswers(
  answers: CheckInResponse[],
  originalQuestions: MultipleChoiceQuestion[]
): Promise<string[]> {
  const learnings: string[] = [];
  
  for (const answer of answers) {
    const qIndex = answer.questionNumber - 1;
    if (qIndex >= 0 && qIndex < originalQuestions.length) {
      const question = originalQuestions[qIndex];
      const optIndex = answer.selectedOption.charCodeAt(0) - 65;
      
      if (optIndex >= 0 && optIndex < question.options.length) {
        const selectedText = question.options[optIndex];
        
        if (!selectedText.toLowerCase().includes("other") && 
            !selectedText.toLowerCase().includes("none")) {
          const learning = `${question.topic}: ${selectedText} (from: ${question.question})`;
          learnings.push(learning);
          
          createMemoryNote({
            type: "fact",
            content: selectedText,
            context: `Daily check-in response to: "${question.question}"`,
          });
        }
      }
    }
  }
  
  return learnings;
}

export function scheduleDailyCheckIn(cronExpression: string = "0 9 * * *"): void {
  if (scheduledTask) {
    scheduledTask.stop();
    console.log("Stopped existing daily check-in schedule");
  }

  scheduledTask = cron.schedule(cronExpression, async () => {
    console.log("Running scheduled daily check-in...");
    await sendDailyCheckIn();
  }, {
    timezone: "America/New_York"
  });

  console.log(`Daily check-in scheduled with cron: ${cronExpression} (America/New_York)`);
}

export function stopDailyCheckIn(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log("Daily check-in stopped");
  }
}

export function configureDailyCheckIn(phoneNumber: string, time: string = "09:00"): void {
  setPreference({
    key: "daily_checkin_phone",
    value: phoneNumber,
  });

  const [hours, minutes] = time.split(":").map(Number);
  const cronExpression = `${minutes} ${hours} * * *`;
  
  setPreference({
    key: "daily_checkin_time",
    value: time,
  });

  setPreference({
    key: "daily_checkin_cron",
    value: cronExpression,
  });

  scheduleDailyCheckIn(cronExpression);
  
  console.log(`Daily check-in configured: ${phoneNumber} at ${time}`);
}

export function initializeDailyCheckIn(): void {
  const phone = getPreference("daily_checkin_phone")?.value;
  const cronExpr = getPreference("daily_checkin_cron")?.value;

  if (phone && cronExpr) {
    scheduleDailyCheckIn(cronExpr);
    console.log(`Restored daily check-in schedule for ${phone}`);
  } else {
    console.log("Daily check-in not configured yet");
  }
}

export function getDailyCheckInStatus(): {
  configured: boolean;
  phoneNumber?: string;
  time?: string;
  nextRun?: string;
} {
  const phone = getPreference("daily_checkin_phone")?.value;
  const time = getPreference("daily_checkin_time")?.value;

  if (!phone) {
    return { configured: false };
  }

  return {
    configured: true,
    phoneNumber: phone,
    time: time || "09:00",
  };
}

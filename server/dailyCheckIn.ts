import * as cron from "node-cron";
import OpenAI from "openai";
import { getAllMemoryNotes, getPreference, setPreference, createMemoryNote, getContactByPhone } from "./db";
import { isMasterAdmin } from "@shared/schema";

const scheduledTasks = new Map<string, cron.ScheduledTask>();

let openai: OpenAI | null = null;
let sendSms: ((phone: string, message: string) => Promise<void>) | null = null;

function normalizePhoneNumber(phoneNumber: string): string {
  let formattedPhone = phoneNumber.replace(/[^0-9+]/g, "");
  if (formattedPhone.length === 10) {
    formattedPhone = "+1" + formattedPhone;
  } else if (!formattedPhone.startsWith("+")) {
    formattedPhone = "+" + formattedPhone;
  }
  return formattedPhone;
}

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

export interface MultipleChoiceQuestion {
  question: string;
  options: string[];
  topic?: string;
  context?: string;
}

export interface DailyCheckInQuestions {
  greeting: string;
  questions: MultipleChoiceQuestion[];
}

export interface CheckInConfig {
  phoneNumber: string;
  time: string;
  templateName?: string;
  customQuestions?: DailyCheckInQuestions;
}

interface SendCheckInOptions {
  recipients?: string[];
  questions?: DailyCheckInQuestions;
  templateName?: string;
  greetingOverride?: string;
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
  const memories = (await getAllMemoryNotes()).filter(m => !m.isSuperseded);
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

  message += "Thanks! Your responses help me understand you better. 😊";
  return message;
}

export function generateCronExpression(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return `${minutes} ${hours} * * *`;
}

async function getConfiguredCheckIns(): Promise<CheckInConfig[]> {
  const configs: CheckInConfig[] = [];

  const storedConfigs = await getPreference("daily_checkin_configs");
  if (storedConfigs?.value) {
    try {
      const parsed = JSON.parse(storedConfigs.value) as CheckInConfig[];
      parsed.forEach(cfg => {
        if (cfg.phoneNumber) {
          configs.push({
            phoneNumber: normalizePhoneNumber(cfg.phoneNumber),
            time: cfg.time || "09:00",
            templateName: cfg.templateName,
            customQuestions: cfg.customQuestions,
          });
        }
      });
    } catch (error) {
      console.error("Failed to parse stored daily check-in configs:", error);
    }
  }

  if (configs.length === 0) {
    const legacyPhone = await getPreference("daily_checkin_phone");
    if (legacyPhone?.value) {
      configs.push({
        phoneNumber: normalizePhoneNumber(legacyPhone.value),
        time: (await getPreference("daily_checkin_time"))?.value || "09:00",
      });
    }
  }

  return configs;
}

async function saveCheckInConfigs(configs: CheckInConfig[]): Promise<void> {
  await setPreference({
    key: "daily_checkin_configs",
    value: JSON.stringify(configs),
  });
}

function stopAllSchedules(): void {
  scheduledTasks.forEach(task => task.stop());
  scheduledTasks.clear();
}

function scheduleCheckIn(config: CheckInConfig): void {
  const { phoneNumber, time, templateName, customQuestions } = config;
  const cronExpression = generateCronExpression(time);

  const existingTask = scheduledTasks.get(phoneNumber);
  if (existingTask) {
    existingTask.stop();
  }

  const task = cron.schedule(cronExpression, async () => {
    console.log(`Running scheduled daily check-in for ${phoneNumber}...`);
    await sendDailyCheckIn({
      recipients: [phoneNumber],
      questions: customQuestions,
      templateName,
    });
  }, {
    timezone: "America/New_York"
  });

  scheduledTasks.set(phoneNumber, task);
  console.log(`Daily check-in scheduled for ${phoneNumber} with cron: ${cronExpression} (America/New_York)`);
}

export async function sendDailyCheckIn(options: SendCheckInOptions = {}): Promise<boolean> {
  if (!sendSms) {
    console.log("Daily check-in: SMS callback not configured");
    return false;
  }

  const configuredCheckIns = await getConfiguredCheckIns();
  const recipients = options.recipients?.map(normalizePhoneNumber)
    ?? configuredCheckIns.map(cfg => cfg.phoneNumber);

  const uniqueRecipients = Array.from(new Set(recipients));

  if (uniqueRecipients.length === 0) {
    console.log("Daily check-in: No recipients configured");
    return false;
  }

  let generatedQuestions: DailyCheckInQuestions | null = null;
  let successCount = 0;

  for (const phoneNumber of uniqueRecipients) {
    const contact = await getContactByPhone(phoneNumber);

    const authorized = isMasterAdmin(phoneNumber)
      || (contact && contact.accessLevel === 'admin');

    if (!authorized) {
      const authInfo = contact ? `${contact.name} (${contact.accessLevel})` : phoneNumber;
      console.log(`ACCESS DENIED: Daily check-in blocked - phone ${phoneNumber} is not authorized (${authInfo})`);
      continue;
    }

    const recipientConfig = configuredCheckIns.find(cfg => normalizePhoneNumber(cfg.phoneNumber) === phoneNumber);
    const templateName = options.templateName || recipientConfig?.templateName;

    const questions = options.questions
      ?? recipientConfig?.customQuestions
      ?? (generatedQuestions || (generatedQuestions = await generateDailyQuestions()));

    const greeting = options.greetingOverride || questions.greeting;

    const message = formatQuestionsForSms({
      ...questions,
      greeting: templateName ? `${greeting} [Template: ${templateName}]` : greeting,
    });

    try {
      console.log(`Sending daily check-in to ${phoneNumber}`);
      await sendSms(phoneNumber, message);
      successCount++;
    } catch (error) {
      console.error(`Failed to send daily check-in to ${phoneNumber}:`, error);
    }
  }

  return successCount > 0;
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

          await createMemoryNote({
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

export async function stopDailyCheckIn(): Promise<void> {
  stopAllSchedules();
  await saveCheckInConfigs([]);
  console.log("Daily check-in stopped");
}

export async function configureDailyCheckIn(
  inputs: CheckInConfig | CheckInConfig[],
  fallbackTime: string = "09:00",
): Promise<CheckInConfig[]> {
  const inputList = Array.isArray(inputs) ? inputs : [inputs];
  const existingConfigs = await getConfiguredCheckIns();
  const configMap = new Map<string, CheckInConfig>();

  existingConfigs.forEach(cfg => {
    configMap.set(normalizePhoneNumber(cfg.phoneNumber), cfg);
  });

  inputList.forEach(input => {
    const normalizedPhone = normalizePhoneNumber(input.phoneNumber);
    const merged: CheckInConfig = {
      phoneNumber: normalizedPhone,
      time: input.time || configMap.get(normalizedPhone)?.time || fallbackTime,
      templateName: input.templateName ?? configMap.get(normalizedPhone)?.templateName,
      customQuestions: input.customQuestions ?? configMap.get(normalizedPhone)?.customQuestions,
    };
    configMap.set(normalizedPhone, merged);
  });

  const configs = Array.from(configMap.values());
  await saveCheckInConfigs(configs);

  stopAllSchedules();
  configs.forEach(scheduleCheckIn);

  console.log(`Daily check-in configured for ${configs.length} recipient(s)`);
  return configs;
}

export async function initializeDailyCheckIn(): Promise<void> {
  const configs = await getConfiguredCheckIns();
  if (configs.length === 0) {
    console.log("Daily check-in not configured yet");
    return;
  }

  stopAllSchedules();
  configs.forEach(scheduleCheckIn);
  console.log(`Restored daily check-in schedules for ${configs.length} recipient(s)`);
}

export async function getDailyCheckInStatus(): Promise<{
  configured: boolean;
  recipients?: CheckInConfig[];
}> {
  const configs = await getConfiguredCheckIns();

  if (configs.length === 0) {
    return { configured: false };
  }

  return {
    configured: true,
    recipients: configs,
  };
}

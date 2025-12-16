import OpenAI from "openai";
import type { Task } from "@shared/schema";

const openai = new OpenAI();

export interface SubtaskSuggestion {
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  relativeDueDays: number | null;
}

export interface TaskBreakdownResult {
  shouldBreakdown: boolean;
  reason: string;
  subtasks: SubtaskSuggestion[];
}

export async function analyzeAndBreakdownTask(task: Task): Promise<TaskBreakdownResult> {
  const systemPrompt = `You are a task management assistant that helps break down complex tasks into actionable subtasks.

Your job is to analyze a task and determine if it should be broken down into subtasks.

RULES FOR BREAKING DOWN TASKS:
1. Simple, single-action tasks should NOT be broken down (e.g., "Buy milk", "Call mom", "Send email to John")
2. Complex, multi-step tasks SHOULD be broken down (e.g., "Plan birthday party", "Prepare for job interview", "Organize home office")
3. Tasks with clear deadlines benefit from subtasks with relative due dates
4. Each subtask should be a concrete, actionable item
5. Limit subtasks to 3-7 items - don't over-complicate simple things

When creating subtasks:
- Make titles clear and actionable (start with a verb)
- Keep descriptions brief but helpful
- Set appropriate priority based on importance and dependencies
- relativeDueDays is the number of days before the parent task's due date this subtask should be completed
  - Use negative numbers (e.g., -3 means 3 days before parent due date)
  - Use 0 for tasks that should be done on the due date
  - Use null if timing doesn't matter or parent has no due date

Respond in JSON format:
{
  "shouldBreakdown": boolean,
  "reason": "Brief explanation of decision",
  "subtasks": [
    {
      "title": "Subtask title",
      "description": "Brief description",
      "priority": "low" | "medium" | "high",
      "relativeDueDays": number | null
    }
  ]
}`;

  const taskContext = `Task to analyze:
Title: ${task.title}
Description: ${task.description || "No description provided"}
Priority: ${task.priority}
Category: ${task.category}
Due Date: ${task.dueDate || "No due date set"}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: taskContext },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {
        shouldBreakdown: false,
        reason: "Failed to get AI response",
        subtasks: [],
      };
    }

    const result = JSON.parse(content) as TaskBreakdownResult;
    
    if (!result.subtasks) {
      result.subtasks = [];
    }
    
    result.subtasks = result.subtasks.map(subtask => ({
      title: subtask.title || "Untitled subtask",
      description: subtask.description || "",
      priority: (["low", "medium", "high"].includes(subtask.priority) ? subtask.priority : "medium") as "low" | "medium" | "high",
      relativeDueDays: typeof subtask.relativeDueDays === "number" ? subtask.relativeDueDays : null,
    }));

    return result;
  } catch (error) {
    console.error("Error analyzing task for breakdown:", error);
    return {
      shouldBreakdown: false,
      reason: `Error analyzing task: ${error instanceof Error ? error.message : "Unknown error"}`,
      subtasks: [],
    };
  }
}

export function calculateSubtaskDueDate(
  parentDueDate: string | null,
  relativeDueDays: number | null
): string | null {
  if (!parentDueDate || relativeDueDays === null) {
    return null;
  }

  const parentDate = new Date(parentDueDate);
  if (isNaN(parentDate.getTime())) {
    return null;
  }

  const subtaskDate = new Date(parentDate);
  subtaskDate.setDate(subtaskDate.getDate() + relativeDueDays);
  
  return subtaskDate.toISOString();
}

export interface GrocerySuggestion {
  name: string;
  reason: string;
  category: "Produce" | "Dairy" | "Meat" | "Bakery" | "Frozen" | "Beverages" | "Snacks" | "Household" | "Other";
  mealConcept?: string;
}

export interface GrocerySuggestionResult {
  suggestions: GrocerySuggestion[];
  mealIdeas: string[];
}

export async function suggestRelatedGroceryItems(
  itemName: string,
  currentItems: string[]
): Promise<GrocerySuggestionResult> {
  const systemPrompt = `You are a smart grocery assistant that suggests complementary items based on common meal planning patterns and cooking needs.

Your job is to suggest related grocery items when someone adds an item to their list.

RULES FOR SUGGESTIONS:
1. Consider common meal/recipe patterns (e.g., pasta → sauce, garlic, parmesan)
2. Think about cooking essentials that often go together
3. Consider dietary balance and practical cooking needs
4. NEVER suggest items already on the current list
5. Keep suggestions practical and immediately useful
6. Limit to 3-5 high-quality suggestions, don't overwhelm
7. Group suggestions by meal concept when applicable

CATEGORIES to use:
- Produce (fruits, vegetables, herbs)
- Dairy (milk, cheese, eggs, butter)
- Meat (chicken, beef, fish, pork)
- Bakery (bread, rolls, pastries)
- Frozen (frozen foods)
- Beverages (drinks)
- Snacks (chips, crackers, etc.)
- Household (non-food items)
- Other (anything else)

Respond in JSON format:
{
  "suggestions": [
    {
      "name": "Item name",
      "reason": "Brief reason why this goes well with the added item",
      "category": "Category",
      "mealConcept": "Optional meal idea this relates to"
    }
  ],
  "mealIdeas": ["Simple meal idea 1", "Simple meal idea 2"]
}`;

  const currentItemsList = currentItems.length > 0 
    ? `\n\nCurrent items on the list (DO NOT suggest these):\n${currentItems.join(", ")}`
    : "";

  const userMessage = `Someone just added "${itemName}" to their grocery list.${currentItemsList}

Suggest complementary items that would go well with "${itemName}" for cooking or meal planning.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 800,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {
        suggestions: [],
        mealIdeas: [],
      };
    }

    const result = JSON.parse(content) as GrocerySuggestionResult;
    
    if (!result.suggestions) {
      result.suggestions = [];
    }
    
    if (!result.mealIdeas) {
      result.mealIdeas = [];
    }
    
    const validCategories = ["Produce", "Dairy", "Meat", "Bakery", "Frozen", "Beverages", "Snacks", "Household", "Other"];
    result.suggestions = result.suggestions.map(suggestion => ({
      name: suggestion.name || "Unknown item",
      reason: suggestion.reason || "Complements your grocery list",
      category: (validCategories.includes(suggestion.category) ? suggestion.category : "Other") as GrocerySuggestion["category"],
      mealConcept: suggestion.mealConcept,
    }));

    const currentLower = currentItems.map(i => i.toLowerCase());
    result.suggestions = result.suggestions.filter(
      s => !currentLower.includes(s.name.toLowerCase())
    );

    return result;
  } catch (error) {
    console.error("Error suggesting grocery items:", error);
    return {
      suggestions: [],
      mealIdeas: [],
    };
  }
}

export async function suggestRelatedGroceryItemsBulk(
  items: string[],
  currentItems: string[]
): Promise<GrocerySuggestionResult> {
  const systemPrompt = `You are a smart grocery assistant that suggests complementary items based on common meal planning patterns and cooking needs.

Your job is to analyze a list of grocery items and suggest additional items that would complete meals or enhance the shopping list.

RULES FOR SUGGESTIONS:
1. Look for meal patterns in the items (e.g., pasta + sauce ingredients = Italian dinner)
2. Identify missing components for complete meals
3. Consider cooking essentials that tie items together
4. NEVER suggest items already on the current list
5. Prioritize high-impact suggestions (staples, missing key ingredients)
6. Limit to 5-8 suggestions total
7. Group by meal concept when items clearly form a meal

CATEGORIES to use:
- Produce (fruits, vegetables, herbs)
- Dairy (milk, cheese, eggs, butter)
- Meat (chicken, beef, fish, pork)
- Bakery (bread, rolls, pastries)
- Frozen (frozen foods)
- Beverages (drinks)
- Snacks (chips, crackers, etc.)
- Household (non-food items)
- Other (anything else)

Respond in JSON format:
{
  "suggestions": [
    {
      "name": "Item name",
      "reason": "Brief reason why this completes or enhances the list",
      "category": "Category",
      "mealConcept": "Optional meal idea this relates to"
    }
  ],
  "mealIdeas": ["Meal you could make with these items"]
}`;

  const itemsList = items.join(", ");
  const currentItemsList = currentItems.length > 0 
    ? `\n\nItems already on the list (DO NOT suggest these):\n${currentItems.join(", ")}`
    : "";

  const userMessage = `Analyze these grocery items and suggest complementary items:
${itemsList}${currentItemsList}

What items would complete meals or enhance this shopping list?`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {
        suggestions: [],
        mealIdeas: [],
      };
    }

    const result = JSON.parse(content) as GrocerySuggestionResult;
    
    if (!result.suggestions) {
      result.suggestions = [];
    }
    
    if (!result.mealIdeas) {
      result.mealIdeas = [];
    }
    
    const validCategories = ["Produce", "Dairy", "Meat", "Bakery", "Frozen", "Beverages", "Snacks", "Household", "Other"];
    result.suggestions = result.suggestions.map(suggestion => ({
      name: suggestion.name || "Unknown item",
      reason: suggestion.reason || "Complements your grocery list",
      category: (validCategories.includes(suggestion.category) ? suggestion.category : "Other") as GrocerySuggestion["category"],
      mealConcept: suggestion.mealConcept,
    }));

    const allCurrentLower = [...items, ...currentItems].map(i => i.toLowerCase());
    result.suggestions = result.suggestions.filter(
      s => !allCurrentLower.includes(s.name.toLowerCase())
    );

    return result;
  } catch (error) {
    console.error("Error suggesting grocery items:", error);
    return {
      suggestions: [],
      mealIdeas: [],
    };
  }
}

export interface TaskFollowUpItem {
  title: string;
  suggestedAction: string;
  priority: "low" | "medium" | "high";
  category: string;
}

export interface TaskFollowUpResult {
  overdueTasks: TaskFollowUpItem[];
  todayTasks: TaskFollowUpItem[];
  tomorrowTasks: TaskFollowUpItem[];
  smsMessage: string;
  hasActionItems: boolean;
}

export async function generateTaskFollowUp(
  overdueTasks: Task[],
  todayTasks: Task[],
  tomorrowTasks: Task[]
): Promise<TaskFollowUpResult> {
  const allTasks = [
    ...overdueTasks.map(t => ({ ...t, status: "overdue" })),
    ...todayTasks.map(t => ({ ...t, status: "today" })),
    ...tomorrowTasks.map(t => ({ ...t, status: "tomorrow" })),
  ];

  if (allTasks.length === 0) {
    return {
      overdueTasks: [],
      todayTasks: [],
      tomorrowTasks: [],
      smsMessage: "Morning! You're all caught up - no pressing tasks today. Enjoy your day!",
      hasActionItems: false,
    };
  }

  const systemPrompt = `You are a helpful personal assistant generating a daily task check-in SMS message.

Your job is to create a concise, actionable follow-up message about the user's tasks.

RULES:
1. Keep the message SMS-friendly (under 600 characters total if possible)
2. For each task, suggest ONE clear, actionable next step
3. Prioritize high-priority tasks first, then by due date urgency
4. Be encouraging but not annoying - professional and helpful
5. Use simple bullet points for clarity
6. Maximum 5-6 tasks in the message - prioritize the most important
7. Suggested actions should be specific and immediately doable

CATEGORIES:
- OVERDUE: Tasks past their due date (most urgent)
- DUE TODAY: Tasks due today
- TOMORROW: Tasks due tomorrow (preview)

Respond in JSON format:
{
  "overdueTasks": [{ "title": "Task title", "suggestedAction": "Clear next step" }],
  "todayTasks": [{ "title": "Task title", "suggestedAction": "Clear next step" }],
  "tomorrowTasks": [{ "title": "Task title", "suggestedAction": "Clear next step" }],
  "smsMessage": "The formatted SMS message ready to send"
}`;

  const taskContext = allTasks.map(t => {
    return `- [${t.status.toUpperCase()}] ${t.title} (Priority: ${t.priority}, Category: ${t.category})${t.description ? ` - ${t.description}` : ""}`;
  }).join("\n");

  const userMessage = `Generate a daily task follow-up message for these tasks:\n\n${taskContext}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return generateFallbackMessage(overdueTasks, todayTasks, tomorrowTasks);
    }

    const result = JSON.parse(content);

    const mapItems = (items: any[], tasks: Task[]): TaskFollowUpItem[] => {
      if (!items || !Array.isArray(items)) return [];
      return items.slice(0, 3).map((item, idx) => {
        const task = tasks[idx];
        return {
          title: item.title || task?.title || "Unknown task",
          suggestedAction: item.suggestedAction || "Complete this task",
          priority: (task?.priority || "medium") as "low" | "medium" | "high",
          category: task?.category || "personal",
        };
      });
    };

    return {
      overdueTasks: mapItems(result.overdueTasks, overdueTasks),
      todayTasks: mapItems(result.todayTasks, todayTasks),
      tomorrowTasks: mapItems(result.tomorrowTasks, tomorrowTasks),
      smsMessage: result.smsMessage || generateFallbackMessage(overdueTasks, todayTasks, tomorrowTasks).smsMessage,
      hasActionItems: allTasks.length > 0,
    };
  } catch (error) {
    console.error("Error generating task follow-up:", error);
    return generateFallbackMessage(overdueTasks, todayTasks, tomorrowTasks);
  }
}

function generateFallbackMessage(
  overdueTasks: Task[],
  todayTasks: Task[],
  tomorrowTasks: Task[]
): TaskFollowUpResult {
  const lines: string[] = ["Morning Nate!"];
  const overdueItems: TaskFollowUpItem[] = [];
  const todayItems: TaskFollowUpItem[] = [];
  const tomorrowItems: TaskFollowUpItem[] = [];

  if (overdueTasks.length > 0) {
    lines.push("\nOVERDUE:");
    overdueTasks.slice(0, 2).forEach(task => {
      lines.push(`- ${task.title}`);
      overdueItems.push({
        title: task.title,
        suggestedAction: "Schedule time to complete this today",
        priority: task.priority as "low" | "medium" | "high",
        category: task.category,
      });
    });
  }

  if (todayTasks.length > 0) {
    lines.push("\nDUE TODAY:");
    todayTasks.slice(0, 2).forEach(task => {
      lines.push(`- ${task.title}`);
      todayItems.push({
        title: task.title,
        suggestedAction: "Complete before end of day",
        priority: task.priority as "low" | "medium" | "high",
        category: task.category,
      });
    });
  }

  if (tomorrowTasks.length > 0) {
    lines.push("\nTOMORROW:");
    tomorrowTasks.slice(0, 2).forEach(task => {
      lines.push(`- ${task.title}`);
      tomorrowItems.push({
        title: task.title,
        suggestedAction: "Prepare or plan ahead",
        priority: task.priority as "low" | "medium" | "high",
        category: task.category,
      });
    });
  }

  lines.push("\nReply for help with any task!");

  return {
    overdueTasks: overdueItems,
    todayTasks: todayItems,
    tomorrowTasks: tomorrowItems,
    smsMessage: lines.join("\n"),
    hasActionItems: overdueTasks.length + todayTasks.length + tomorrowTasks.length > 0,
  };
}

export interface ParsedInterval {
  value: number;
  unit: "minute" | "hour" | "day" | "week";
  milliseconds: number;
  humanReadable: string;
}

export interface ReminderSequenceItem {
  message: string;
  scheduledFor: Date;
  sequencePosition: number;
  intervalDescription: string;
}

export interface ReminderSequenceResult {
  success: boolean;
  items: ReminderSequenceItem[];
  eventTime: Date;
  originalMessage: string;
  error?: string;
}

export function parseInterval(interval: string): ParsedInterval | null {
  const normalized = interval.toLowerCase().trim();
  
  const patterns = [
    { regex: /^(\d+)\s*(?:minute|minutes|min|mins?)$/i, unit: "minute" as const, multiplier: 60 * 1000 },
    { regex: /^(\d+)\s*(?:hour|hours|hr|hrs?)$/i, unit: "hour" as const, multiplier: 60 * 60 * 1000 },
    { regex: /^(\d+)\s*(?:day|days?)$/i, unit: "day" as const, multiplier: 24 * 60 * 60 * 1000 },
    { regex: /^(\d+)\s*(?:week|weeks|wk|wks?)$/i, unit: "week" as const, multiplier: 7 * 24 * 60 * 60 * 1000 },
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern.regex);
    if (match) {
      const value = parseInt(match[1], 10);
      if (value > 0) {
        let humanReadable: string;
        if (value === 1) {
          humanReadable = `1 ${pattern.unit}`;
        } else {
          humanReadable = `${value} ${pattern.unit}s`;
        }
        return {
          value,
          unit: pattern.unit,
          milliseconds: value * pattern.multiplier,
          humanReadable,
        };
      }
    }
  }

  return null;
}

export function generateSequenceMessage(
  baseMessage: string,
  interval: ParsedInterval,
  position: number,
  total: number
): string {
  const { value, unit } = interval;
  
  let timeDescription: string;
  if (unit === "minute") {
    timeDescription = value === 1 ? "in 1 minute" : `in ${value} minutes`;
  } else if (unit === "hour") {
    timeDescription = value === 1 ? "in 1 hour" : `in ${value} hours`;
  } else if (unit === "day") {
    if (value === 1) {
      timeDescription = "tomorrow";
    } else {
      timeDescription = `in ${value} days`;
    }
  } else if (unit === "week") {
    timeDescription = value === 1 ? "in 1 week" : `in ${value} weeks`;
  } else {
    timeDescription = `in ${interval.humanReadable}`;
  }

  const reminderPrefix = total > 1 ? `[${position}/${total}] ` : "";
  
  return `${reminderPrefix}Reminder: ${baseMessage} is ${timeDescription}!`;
}

export function createReminderSequenceData(
  eventTime: Date,
  message: string,
  intervals: string[]
): ReminderSequenceResult {
  if (!intervals || intervals.length === 0) {
    return {
      success: false,
      items: [],
      eventTime,
      originalMessage: message,
      error: "No intervals provided",
    };
  }

  const parsedIntervals: { interval: ParsedInterval; originalString: string }[] = [];
  
  for (const intervalStr of intervals) {
    const parsed = parseInterval(intervalStr);
    if (!parsed) {
      return {
        success: false,
        items: [],
        eventTime,
        originalMessage: message,
        error: `Could not parse interval: "${intervalStr}". Use formats like "1 week", "2 days", "3 hours", "30 minutes"`,
      };
    }
    parsedIntervals.push({ interval: parsed, originalString: intervalStr });
  }

  parsedIntervals.sort((a, b) => b.interval.milliseconds - a.interval.milliseconds);

  const eventTimeMs = eventTime.getTime();
  const items: ReminderSequenceItem[] = [];
  const total = parsedIntervals.length;

  for (let i = 0; i < parsedIntervals.length; i++) {
    const { interval, originalString } = parsedIntervals[i];
    const scheduledFor = new Date(eventTimeMs - interval.milliseconds);
    
    if (scheduledFor.getTime() < Date.now()) {
      continue;
    }

    const sequenceMessage = generateSequenceMessage(message, interval, i + 1, total);

    items.push({
      message: sequenceMessage,
      scheduledFor,
      sequencePosition: i + 1,
      intervalDescription: originalString,
    });
  }

  if (items.length === 0) {
    return {
      success: false,
      items: [],
      eventTime,
      originalMessage: message,
      error: "All reminder times are in the past",
    };
  }

  return {
    success: true,
    items,
    eventTime,
    originalMessage: message,
  };
}

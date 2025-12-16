import OpenAI from "openai";
import { getAllTasks } from "./db";
import type { Task } from "@shared/schema";
import { format, parseISO, getDay, getHours, isAfter, addDays } from "date-fns";

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new OpenAI({ apiKey });
}

interface TaskPattern {
  category: string;
  priority: string;
  dayOfWeek: { [key: string]: number };
  hourOfDay: { [key: number]: number };
  averageCompletionRate: number;
  taskCount: number;
}

export interface SchedulingSuggestion {
  suggestedDate: string;
  suggestedTime: string;
  confidence: number;
  reasoning: string;
  alternativeTimes: Array<{
    date: string;
    time: string;
    reason: string;
  }>;
}

export interface PatternAnalysis {
  patterns: TaskPattern[];
  insights: string[];
  preferredDays: string[];
  preferredHours: number[];
  categoryBreakdown: { [key: string]: number };
  priorityBreakdown: { [key: string]: number };
}

export interface QuickSuggestion {
  label: string;
  date: string;
  time: string;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function analyzeTaskPatterns(): Promise<PatternAnalysis> {
  const allTasks = getAllTasks(true);
  
  const categoryPatterns: { [key: string]: TaskPattern } = {};
  const categoryBreakdown: { [key: string]: number } = {};
  const priorityBreakdown: { [key: string]: number } = {};
  const dayOfWeekCounts: { [key: string]: number } = {};
  const hourOfDayCounts: { [key: number]: number } = {};
  
  let completedCount = 0;
  let totalWithDueDate = 0;
  
  for (const task of allTasks) {
    const category = task.category || "personal";
    const priority = task.priority || "medium";
    
    categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1;
    priorityBreakdown[priority] = (priorityBreakdown[priority] || 0) + 1;
    
    if (!categoryPatterns[category]) {
      categoryPatterns[category] = {
        category,
        priority: "medium",
        dayOfWeek: {},
        hourOfDay: {},
        averageCompletionRate: 0,
        taskCount: 0,
      };
    }
    
    categoryPatterns[category].taskCount++;
    
    if (task.completed) {
      completedCount++;
    }
    
    if (task.dueDate) {
      totalWithDueDate++;
      try {
        const dueDate = parseISO(task.dueDate);
        const dayName = DAY_NAMES[getDay(dueDate)];
        const hour = getHours(dueDate);
        
        categoryPatterns[category].dayOfWeek[dayName] = 
          (categoryPatterns[category].dayOfWeek[dayName] || 0) + 1;
        categoryPatterns[category].hourOfDay[hour] = 
          (categoryPatterns[category].hourOfDay[hour] || 0) + 1;
        
        dayOfWeekCounts[dayName] = (dayOfWeekCounts[dayName] || 0) + 1;
        hourOfDayCounts[hour] = (hourOfDayCounts[hour] || 0) + 1;
      } catch (e) {
        // Invalid date, skip
      }
    }
  }
  
  for (const category of Object.keys(categoryPatterns)) {
    const pattern = categoryPatterns[category];
    const categoryTasks = allTasks.filter((t: Task) => t.category === category);
    const completedInCategory = categoryTasks.filter((t: Task) => t.completed).length;
    pattern.averageCompletionRate = categoryTasks.length > 0 
      ? completedInCategory / categoryTasks.length 
      : 0;
  }
  
  const preferredDays = Object.entries(dayOfWeekCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([day]) => day);
  
  const preferredHours = Object.entries(hourOfDayCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour]) => parseInt(hour));
  
  const insights: string[] = [];
  
  if (preferredDays.length > 0) {
    insights.push(`You tend to schedule tasks on ${preferredDays.slice(0, 2).join(" and ")}`);
  }
  
  if (preferredHours.length > 0) {
    const formatHour = (h: number) => h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
    insights.push(`Your preferred task times are around ${preferredHours.slice(0, 2).map(formatHour).join(" and ")}`);
  }
  
  const topCategory = Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1])[0];
  if (topCategory) {
    insights.push(`Most of your tasks are ${topCategory[0]} (${Math.round(topCategory[1] / allTasks.length * 100)}%)`);
  }
  
  if (allTasks.length > 0) {
    const completionRate = Math.round(completedCount / allTasks.length * 100);
    insights.push(`Your overall task completion rate is ${completionRate}%`);
  }
  
  return {
    patterns: Object.values(categoryPatterns),
    insights,
    preferredDays,
    preferredHours,
    categoryBreakdown,
    priorityBreakdown,
  };
}

export async function getSchedulingSuggestion(
  taskTitle: string,
  taskCategory: string = "personal",
  taskPriority: string = "medium",
  taskDescription?: string
): Promise<SchedulingSuggestion> {
  const patterns = await analyzeTaskPatterns();
  
  const now = new Date();
  const tomorrow = addDays(now, 1);
  
  const defaultSuggestion: SchedulingSuggestion = {
    suggestedDate: format(tomorrow, "yyyy-MM-dd"),
    suggestedTime: "09:00",
    confidence: 0.5,
    reasoning: "Based on general scheduling best practices",
    alternativeTimes: [],
  };
  
  const openai = getOpenAIClient();
  if (!openai) {
    return defaultSuggestion;
  }
  
  try {
    const systemPrompt = `You are a scheduling assistant that analyzes task patterns and suggests optimal times.
Based on the user's historical patterns and the task details, suggest the best time to schedule this task.

User's task patterns:
- Preferred days: ${patterns.preferredDays.join(", ") || "No clear preference"}
- Preferred hours: ${patterns.preferredHours.length > 0 ? patterns.preferredHours.map(h => h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`).join(", ") : "No clear preference"}
- Category breakdown: ${JSON.stringify(patterns.categoryBreakdown)}
- Insights: ${patterns.insights.join("; ")}

Current date/time: ${format(now, "EEEE, MMMM d, yyyy 'at' h:mm a")}

Consider:
1. The task priority (${taskPriority}) - high priority tasks should be scheduled sooner
2. The task category (${taskCategory}) - use patterns for that category
3. Time of day preferences
4. Avoid scheduling too many tasks on the same day`;

    const userPrompt = `Suggest the optimal scheduling for this task:
Title: "${taskTitle}"
Category: ${taskCategory}
Priority: ${taskPriority}
${taskDescription ? `Description: ${taskDescription}` : ""}

Respond in this exact JSON format:
{
  "suggestedDate": "YYYY-MM-DD",
  "suggestedTime": "HH:mm",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation",
  "alternativeTimes": [
    { "date": "YYYY-MM-DD", "time": "HH:mm", "reason": "Why this is an alternative" }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return defaultSuggestion;
    }

    const suggestion = JSON.parse(content) as SchedulingSuggestion;
    
    if (suggestion.suggestedDate) {
      const suggestedDateTime = parseISO(`${suggestion.suggestedDate}T${suggestion.suggestedTime || "09:00"}`);
      if (!isAfter(suggestedDateTime, now)) {
        const tomorrowDate = addDays(now, 1);
        tomorrowDate.setHours(patterns.preferredHours[0] || 9, 0, 0, 0);
        suggestion.suggestedDate = format(tomorrowDate, "yyyy-MM-dd");
        suggestion.suggestedTime = format(tomorrowDate, "HH:mm");
      }
    }

    return suggestion;
  } catch (error) {
    console.error("[PredictiveScheduler] Error generating suggestion:", error);
    return defaultSuggestion;
  }
}

export async function getQuickSchedulingSuggestions(
  taskTitle: string,
  taskCategory: string = "personal",
  taskPriority: string = "medium"
): Promise<QuickSuggestion[]> {
  const patterns = await analyzeTaskPatterns();
  const now = new Date();
  
  const suggestions: QuickSuggestion[] = [];
  
  const preferredHour = patterns.preferredHours[0] || 9;
  const formatHour = (h: number) => `${String(h).padStart(2, "0")}:00`;
  
  const currentHour = now.getHours();
  if (currentHour < preferredHour) {
    suggestions.push({
      label: "Today",
      date: format(now, "yyyy-MM-dd"),
      time: formatHour(preferredHour),
    });
  }
  
  const tomorrow = addDays(now, 1);
  suggestions.push({
    label: "Tomorrow",
    date: format(tomorrow, "yyyy-MM-dd"),
    time: formatHour(preferredHour),
  });
  
  if (taskPriority === "high") {
    if (currentHour < 18) {
      suggestions.unshift({
        label: "This evening",
        date: format(now, "yyyy-MM-dd"),
        time: "18:00",
      });
    }
  }
  
  const nextWeek = addDays(now, 7);
  suggestions.push({
    label: "Next week",
    date: format(nextWeek, "yyyy-MM-dd"),
    time: formatHour(preferredHour),
  });
  
  if (patterns.preferredDays.length > 0 && taskPriority !== "high") {
    const preferredDay = patterns.preferredDays[0];
    const targetDayIndex = DAY_NAMES.indexOf(preferredDay);
    const currentDayIndex = getDay(now);
    
    let daysUntilPreferred = targetDayIndex - currentDayIndex;
    if (daysUntilPreferred <= 0) {
      daysUntilPreferred += 7;
    }
    
    const preferredDayDate = addDays(now, daysUntilPreferred);
    
    if (!suggestions.some(s => s.date === format(preferredDayDate, "yyyy-MM-dd"))) {
      suggestions.push({
        label: `${preferredDay} (your usual)`,
        date: format(preferredDayDate, "yyyy-MM-dd"),
        time: formatHour(preferredHour),
      });
    }
  }
  
  return suggestions.slice(0, 5);
}

export async function getPatternInsights(): Promise<{
  patterns: PatternAnalysis;
  recommendations: string[];
}> {
  const patterns = await analyzeTaskPatterns();
  const recommendations: string[] = [];
  
  if (patterns.preferredHours.length > 0 && patterns.preferredHours[0] >= 16) {
    recommendations.push("Consider scheduling more tasks in the morning for better focus");
  }
  
  const workTasks = patterns.categoryBreakdown["work"] || 0;
  const personalTasks = patterns.categoryBreakdown["personal"] || 0;
  if (workTasks > 0 && personalTasks > 0) {
    const ratio = workTasks / (workTasks + personalTasks);
    if (ratio > 0.7) {
      recommendations.push("You have mostly work tasks - consider adding some personal tasks for balance");
    }
  }
  
  const highPriority = patterns.priorityBreakdown["high"] || 0;
  const totalTasks = Object.values(patterns.priorityBreakdown).reduce((a, b) => a + b, 0);
  if (totalTasks > 0 && highPriority / totalTasks > 0.5) {
    recommendations.push("Many of your tasks are high priority - consider re-prioritizing some tasks");
  }
  
  const lowPattern = patterns.patterns.find(p => p.averageCompletionRate < 0.5 && p.taskCount > 5);
  if (lowPattern) {
    recommendations.push(`Your ${lowPattern.category} task completion rate is low - try breaking them into smaller subtasks`);
  }
  
  return { patterns, recommendations };
}

console.log("[PredictiveScheduler] Service initialized");

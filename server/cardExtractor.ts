/**
 * Card Extractor - Parses AI responses to extract structured card data
 * 
 * This module detects when the AI response contains information that
 * should be displayed as rich cards (tasks, reminders, weather, etc.)
 */

import type { 
  ChatCard, 
  TaskCard, 
  ReminderCard, 
  WeatherCard,
  CalendarEventCard,
  GroceryListCard,
  TaskListCard,
  ReminderListCard
} from "@shared/schema";
import {
  getAllTasks,
  getAllReminders,
  getAllGroceryItems,
} from "./db";

interface ExtractedCards {
  cards: ChatCard[];
  cleanedResponse: string;
}

// Patterns to detect card-worthy content
const TASK_PATTERNS = [
  /(?:created|added|set up|scheduled).*task/i,
  /task.*(?:created|added|set|done)/i,
  /(?:here's|here are).*(?:your )?tasks?/i,
  /(?:todo|to-do) list/i,
  /tasks? (?:due|for) (?:today|tomorrow|this week)/i,
];

const REMINDER_PATTERNS = [
  /(?:created|set|scheduled).*reminder/i,
  /remind(?:er|ing)? (?:you|set)/i,
  /(?:here's|here are).*(?:your )?reminders?/i,
  /I'll remind you/i,
];

const WEATHER_PATTERNS = [
  /(?:weather|temperature|forecast)/i,
  /(?:degrees|°[FC])/i,
  /(?:sunny|cloudy|rainy|snowing|clear|overcast)/i,
];

const GROCERY_PATTERNS = [
  /(?:grocery|groceries|shopping) list/i,
  /(?:added|removed).*(?:to|from).*(?:grocery|list)/i,
  /(?:here's|here are).*(?:grocery|shopping)/i,
];

const CALENDAR_PATTERNS = [
  /(?:calendar|event|meeting|appointment)/i,
  /scheduled for/i,
  /(?:here's|here are).*(?:your )?(?:calendar|events|meetings)/i,
];

/**
 * Extract embedded card JSON from response
 * Format: <!--CARD:{"type":"task",...}-->
 */
function extractEmbeddedCards(response: string): { cards: ChatCard[]; cleanedResponse: string } {
  const cards: ChatCard[] = [];
  let cleanedResponse = response;
  
  const cardPattern = /<!--CARD:(.*?)-->/gs;
  let match;
  
  while ((match = cardPattern.exec(response)) !== null) {
    try {
      const cardData = JSON.parse(match[1]);
      if (cardData && cardData.type) {
        cards.push(cardData as ChatCard);
      }
      cleanedResponse = cleanedResponse.replace(match[0], '');
    } catch (e) {
      console.error('Failed to parse embedded card:', e);
    }
  }
  
  return { cards, cleanedResponse: cleanedResponse.trim() };
}

/**
 * Detect if response mentions tasks and fetch recent task data
 */
function detectTaskCards(response: string, userMessage: string): TaskCard[] {
  const mentionsTasks = TASK_PATTERNS.some(p => p.test(response)) || 
                        TASK_PATTERNS.some(p => p.test(userMessage));
  
  if (!mentionsTasks) return [];
  
  // Check if asking about tasks or just created one
  const isListQuery = /(?:what|show|list|get|my|all).*tasks?/i.test(userMessage) ||
                      /tasks? (?:due|for|today|tomorrow)/i.test(userMessage);
  const isCreation = /(?:created|added|set up).*task/i.test(response);
  
  if (isListQuery) {
    // Return task list card
    const allTasks = getAllTasks();
    const incompleteTasks = allTasks.filter(t => !t.completed).slice(0, 5);
    
    if (incompleteTasks.length > 0) {
      return incompleteTasks.map(t => ({
        type: "task" as const,
        id: t.id,
        title: t.title,
        priority: t.priority,
        dueDate: t.dueDate,
        completed: t.completed,
        description: t.description,
      }));
    }
  } else if (isCreation) {
    // Try to find the most recently created task
    const allTasks = getAllTasks();
    const recentTask = allTasks
      .filter(t => !t.completed)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    
    if (recentTask) {
      return [{
        type: "task" as const,
        id: recentTask.id,
        title: recentTask.title,
        priority: recentTask.priority,
        dueDate: recentTask.dueDate,
        completed: recentTask.completed,
        description: recentTask.description,
      }];
    }
  }
  
  return [];
}

/**
 * Detect if response mentions reminders and fetch reminder data
 */
function detectReminderCards(response: string, userMessage: string): ReminderCard[] {
  const mentionsReminders = REMINDER_PATTERNS.some(p => p.test(response)) ||
                            REMINDER_PATTERNS.some(p => p.test(userMessage));
  
  if (!mentionsReminders) return [];
  
  const isListQuery = /(?:what|show|list|get|my|all).*reminders?/i.test(userMessage);
  const isCreation = /(?:created|set|scheduled|I'll remind)/i.test(response);
  
  const allReminders = getAllReminders();
  const pendingReminders = allReminders.filter(r => !r.sent);
  
  if (isListQuery && pendingReminders.length > 0) {
    return pendingReminders.slice(0, 5).map(r => ({
      type: "reminder" as const,
      id: r.id,
      message: r.message,
      scheduledFor: r.scheduledFor,
      sent: r.sent,
    }));
  } else if (isCreation && pendingReminders.length > 0) {
    // Return most recent reminder
    const recentReminder = pendingReminders
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    
    return [{
      type: "reminder" as const,
      id: recentReminder.id,
      message: recentReminder.message,
      scheduledFor: recentReminder.scheduledFor,
      sent: recentReminder.sent,
    }];
  }
  
  return [];
}

/**
 * Detect weather info in response and parse it
 */
function detectWeatherCard(response: string): WeatherCard | null {
  if (!WEATHER_PATTERNS.some(p => p.test(response))) return null;
  
  // Try to extract weather info from response
  const tempMatch = response.match(/(\d+)\s*(?:degrees|°)\s*([FC])?/i);
  const conditionMatch = response.match(/(?:it's|currently|weather is)\s*(\w+(?:\s+\w+)?)/i);
  const locationMatch = response.match(/(?:in|for|at)\s+([A-Z][a-zA-Z\s,]+?)(?:\.|,|:|\s+it)/i);
  
  if (tempMatch) {
    const temp = parseInt(tempMatch[1]);
    let condition = conditionMatch ? conditionMatch[1].toLowerCase() : 'unknown';
    
    // Clean up condition
    if (condition.includes('sunny') || condition.includes('clear')) {
      condition = 'Clear';
    } else if (condition.includes('cloud')) {
      condition = 'Cloudy';
    } else if (condition.includes('rain')) {
      condition = 'Rainy';
    } else if (condition.includes('snow')) {
      condition = 'Snowy';
    }
    
    return {
      type: "weather",
      location: locationMatch ? locationMatch[1].trim() : 'Your location',
      temperature: temp,
      condition: condition.charAt(0).toUpperCase() + condition.slice(1),
    };
  }
  
  return null;
}

/**
 * Detect grocery list mentions
 */
function detectGroceryCard(response: string, userMessage: string): GroceryListCard | null {
  const mentionsGrocery = GROCERY_PATTERNS.some(p => p.test(response)) ||
                          GROCERY_PATTERNS.some(p => p.test(userMessage));
  
  if (!mentionsGrocery) return null;
  
  const isListQuery = /(?:what|show|list|get|my|all).*(?:grocery|groceries|shopping)/i.test(userMessage) ||
                      /grocery list/i.test(userMessage);
  
  if (isListQuery) {
    const items = getAllGroceryItems();
    const unpurchased = items.filter(i => !i.purchased);
    
    if (unpurchased.length > 0) {
      return {
        type: "grocery_list",
        items: unpurchased.slice(0, 10).map(i => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity || "1",
          category: i.category || "Other",
          purchased: i.purchased,
        })),
        totalItems: unpurchased.length,
        purchasedCount: items.filter(i => i.purchased).length,
      };
    }
  }
  
  return null;
}

/**
 * Main extraction function
 */
export function extractCardsFromResponse(
  response: string, 
  userMessage: string
): ExtractedCards {
  const cards: ChatCard[] = [];
  let cleanedResponse = response;
  
  // First, extract any embedded cards
  const embedded = extractEmbeddedCards(response);
  cards.push(...embedded.cards);
  cleanedResponse = embedded.cleanedResponse;
  
  // Then detect cards from response content
  const taskCards = detectTaskCards(response, userMessage);
  cards.push(...taskCards);
  
  const reminderCards = detectReminderCards(response, userMessage);
  cards.push(...reminderCards);
  
  const weatherCard = detectWeatherCard(response);
  if (weatherCard) cards.push(weatherCard);
  
  const groceryCard = detectGroceryCard(response, userMessage);
  if (groceryCard) cards.push(groceryCard);
  
  return { cards, cleanedResponse };
}

export default extractCardsFromResponse;

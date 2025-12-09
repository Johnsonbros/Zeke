/**
 * Context Router - ZEKE's intelligent context assembly system
 * 
 * This module implements a "context router" that:
 * 1. Detects the user's intent and current app section
 * 2. Determines which context bundles to load based on route + query
 * 3. Assembles context with token budgets to keep prompts lean
 * 4. Provides curated, relevant context to agents instead of dumping everything
 * 
 * Architecture:
 * - Layer A: Global context (always included) - user profile, timezone, preferences
 * - Layer B: Route-aware bundles (mode-aware) - tasks, calendar, locations, etc.
 * - Layer C: On-demand retrieval (RAG) - semantic search for specific queries
 * 
 * Performance:
 * - Uses contextCache for frequently-accessed bundles
 * - Reduces database queries per conversation turn
 * - Automatic cache invalidation when data changes
 */

import {
  getAllProfileSections,
  getLatestLocation,
  getStarredPlaces,
  findNearbyPlaces,
  checkGroceryProximity,
  getAllTasks,
  getAllGroceryItems,
  getAllContacts,
  getAllMemoryNotes,
  getConversation,
  getEntitiesForItem,
  getItemsRelatedToEntity,
  getEntity,
  getMessagesByConversation,
  getMemoryNote,
  getTask,
  getSavedPlace,
  getContact,
  getLifelogsAtPlace,
  getLifelogsNearLocation,
  getRecentLifelogLocations,
  correlateLifelogWithLocation,
  getLifelogLocationContexts,
} from "./db";
import { getSmartMemoryContext } from "./semanticMemory";
import { getRecentMemories, getMemoryOverview } from "./omi";
import { getUpcomingEvents } from "./googleCalendar";
import { getConversationContext } from "./conversationSummarizer";
import { contextCache, CACHE_TTL, createCacheKey } from "./contextCache";
import { 
  queryKnowledgeGraph, 
  buildGraphContextBundle,
  findBridgingEntities,
  getKnowledgeGraphStats 
} from "./knowledgeGraph";
import type { GroceryItem, Task, Contact, MemoryNote, Message, Entity, EntityDomain, LifelogLocation, ActivityType } from "@shared/schema";

/**
 * Application context available to the router
 */
export interface AppContext {
  userId: string;
  currentRoute: string;
  userMessage: string;
  userPhoneNumber?: string;
  conversationId?: string;
  isAdmin: boolean;
  now: Date;
  timezone: string;
}

/**
 * A context bundle with its content and metadata
 */
export interface ContextBundle {
  name: string;
  priority: "primary" | "secondary" | "tertiary";
  content: string;
  tokenEstimate: number;
}

/**
 * Route configuration for context assembly
 */
export interface RouteConfig {
  primary: string[];
  secondary: string[];
  tertiary?: string[];
}

/**
 * Token budget configuration per bundle priority
 */
export interface TokenBudget {
  primary: number;
  secondary: number;
  tertiary: number;
  global: number;
  total: number;
}

/**
 * Default token budgets - keep total under 8000 tokens for context
 */
export const DEFAULT_TOKEN_BUDGET: TokenBudget = {
  primary: 2000,
  secondary: 800,
  tertiary: 400,
  global: 1000,
  total: 6000,
};

/**
 * Route-to-bundle mapping table
 * Maps each app route to which bundles to prioritize
 */
export const ROUTE_BUNDLES: Record<string, RouteConfig> = {
  "/": {
    primary: ["tasks", "calendar"],
    secondary: ["memory", "grocery", "knowledgegraph"],
    tertiary: ["locations"],
  },
  "/chat": {
    primary: ["memory", "conversation"],
    secondary: ["tasks", "calendar", "omi", "knowledgegraph"],
    tertiary: ["locations", "contacts"],
  },
  "/tasks": {
    primary: ["tasks"],
    secondary: ["calendar", "memory"],
    tertiary: ["locations"],
  },
  "/grocery": {
    primary: ["grocery"],
    secondary: ["memory"],
    tertiary: ["tasks"],
  },
  "/memory": {
    primary: ["memory"],
    secondary: ["contacts", "omi", "knowledgegraph"],
    tertiary: ["tasks"],
  },
  "/contacts": {
    primary: ["contacts"],
    secondary: ["memory", "sms", "knowledgegraph"],
    tertiary: ["calendar"],
  },
  "/automations": {
    primary: ["tasks", "calendar"],
    secondary: ["memory"],
    tertiary: ["grocery"],
  },
  "/sms-log": {
    primary: ["sms", "contacts"],
    secondary: ["memory"],
    tertiary: ["tasks"],
  },
  "/omi": {
    primary: ["omi"],
    secondary: ["memory", "contacts", "knowledgegraph"],
    tertiary: ["tasks"],
  },
  "/locations": {
    primary: ["locations"],
    secondary: ["tasks", "grocery"],
    tertiary: ["calendar"],
  },
  "/food": {
    primary: ["food", "grocery"],
    secondary: ["memory"],
    tertiary: ["tasks"],
  },
  "/profile": {
    primary: ["profile"],
    secondary: ["memory", "contacts", "knowledgegraph"],
    tertiary: ["tasks"],
  },
  // SMS fallback - used when route is unknown (SMS conversations)
  "sms": {
    primary: ["memory", "conversation"],
    secondary: ["tasks", "calendar", "grocery", "omi", "knowledgegraph"],
    tertiary: ["locations", "contacts"],
  },
};

/**
 * Estimate tokens in a string (rough: ~4 chars per token)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to fit within token budget
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars - 20) + "\n[...truncated]";
}

/**
 * Build the global context bundle (Layer A)
 * Always included in every request
 * Uses caching for profile data
 */
export async function buildGlobalBundle(ctx: AppContext): Promise<ContextBundle> {
  const parts: string[] = [];
  
  // Current time context
  const now = new Date();
  const timeString = now.toLocaleString("en-US", { 
    timeZone: ctx.timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
  parts.push(`## Current Time\n${timeString} (${ctx.timezone})`);
  
  // Load user profile sections (cached)
  try {
    const cacheKey = createCacheKey("profile", "all");
    const profileSections = await contextCache.getOrCompute(
      cacheKey,
      () => getAllProfileSections(),
      { ttlMs: CACHE_TTL.profile, domain: "profile" }
    );
    if (profileSections.length > 0) {
      const basicInfo = profileSections.find(s => s.section === "basic_info");
      const work = profileSections.find(s => s.section === "work");
      const family = profileSections.find(s => s.section === "family");
      const preferences = profileSections.find(s => s.section === "preferences");
      
      const profileParts: string[] = [];
      
      if (basicInfo?.data) {
        const data = typeof basicInfo.data === 'string' ? JSON.parse(basicInfo.data) : basicInfo.data;
        if (data.fullName) profileParts.push(`Name: ${data.fullName}`);
        if (data.location) profileParts.push(`Location: ${data.location}`);
        if (data.timezone) profileParts.push(`Timezone: ${data.timezone}`);
      }
      
      if (work?.data) {
        const data = typeof work.data === 'string' ? JSON.parse(work.data) : work.data;
        if (data.occupation) profileParts.push(`Occupation: ${data.occupation}`);
        if (data.company) profileParts.push(`Company: ${data.company}`);
      }
      
      if (family?.data) {
        const data = typeof family.data === 'string' ? JSON.parse(family.data) : family.data;
        const familyMembers: string[] = [];
        if (data.spouse?.displayName) familyMembers.push(`Spouse: ${data.spouse.displayName}`);
        if (data.children?.length > 0) {
          const childNames = data.children.map((c: any) => c.displayName).filter(Boolean);
          if (childNames.length > 0) familyMembers.push(`Children: ${childNames.join(", ")}`);
        }
        if (familyMembers.length > 0) profileParts.push(familyMembers.join("; "));
      }
      
      if (preferences?.data) {
        const data = typeof preferences.data === 'string' ? JSON.parse(preferences.data) : preferences.data;
        if (data.communicationStyle) profileParts.push(`Communication style: ${data.communicationStyle}`);
      }
      
      if (profileParts.length > 0) {
        parts.push(`## User Profile\n${profileParts.join("\n")}`);
      }
    }
  } catch (error) {
    console.error("Error loading profile for global bundle:", error);
  }
  
  // User access level
  if (ctx.isAdmin) {
    parts.push(`## Access Level\nAdmin (full access to all features)`);
  }
  
  const content = parts.join("\n\n");
  return {
    name: "global",
    priority: "primary",
    content,
    tokenEstimate: estimateTokens(content),
  };
}

/**
 * Build the memory context bundle
 * Includes semantic search results relevant to the query
 * Uses caching for recent memories to reduce DB queries
 */
export async function buildMemoryBundle(ctx: AppContext, maxTokens: number): Promise<ContextBundle> {
  const parts: string[] = [];
  
  try {
    // Get semantic memory context for the query (not cached - depends on query)
    const memoryContext = await getSmartMemoryContext(ctx.userMessage);
    if (memoryContext && memoryContext.length > 0) {
      parts.push(`## Relevant Memories\n${memoryContext}`);
    }
    
    // Get recent important memories if query-based search returned little
    if (parts.length === 0 || estimateTokens(parts.join("\n")) < 200) {
      // Cache recent memories to reduce DB queries
      const cacheKey = createCacheKey("memory", "recent");
      const allNotes = await contextCache.getOrCompute(
        cacheKey,
        () => getAllMemoryNotes(),
        { ttlMs: CACHE_TTL.memory, domain: "memory" }
      );
      const recentNotes = allNotes
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);
      
      if (recentNotes.length > 0) {
        const notesList = recentNotes.map(n => `- [${n.type}] ${n.content}`).join("\n");
        parts.push(`## Recent Memories\n${notesList}`);
      }
    }
  } catch (error) {
    console.error("Error building memory bundle:", error);
  }
  
  const content = truncateToTokens(parts.join("\n\n"), maxTokens);
  return {
    name: "memory",
    priority: "secondary",
    content,
    tokenEstimate: estimateTokens(content),
  };
}

/**
 * Build the tasks context bundle
 * Uses caching to reduce database queries
 */
export async function buildTasksBundle(ctx: AppContext, maxTokens: number): Promise<ContextBundle> {
  const parts: string[] = [];
  
  try {
    // Cache tasks data to reduce DB queries per conversation turn
    const cacheKey = createCacheKey("tasks", "all");
    const allTasks = await contextCache.getOrCompute(
      cacheKey,
      () => getAllTasks(),
      { ttlMs: CACHE_TTL.tasks, domain: "tasks" }
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Overdue tasks
    const overdueTasks = allTasks.filter(t => 
      !t.completed && 
      t.dueDate && 
      new Date(t.dueDate) < today
    );
    
    // Today's tasks
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const todaysTasks = allTasks.filter(t =>
      !t.completed &&
      t.dueDate &&
      new Date(t.dueDate) >= today &&
      new Date(t.dueDate) <= todayEnd
    );
    
    // High priority incomplete tasks
    const highPriorityTasks = allTasks.filter(t =>
      !t.completed &&
      t.priority === "high"
    ).slice(0, 5);
    
    // Upcoming tasks (next 7 days)
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    const upcomingTasks = allTasks.filter(t =>
      !t.completed &&
      t.dueDate &&
      new Date(t.dueDate) > todayEnd &&
      new Date(t.dueDate) <= weekFromNow
    ).slice(0, 5);
    
    // Build task summary
    const incompleteTasks = allTasks.filter(t => !t.completed);
    parts.push(`## Tasks Overview\nTotal incomplete: ${incompleteTasks.length}, Overdue: ${overdueTasks.length}, Due today: ${todaysTasks.length}`);
    
    if (overdueTasks.length > 0) {
      const overdueList = overdueTasks.slice(0, 5).map(t => 
        `- [OVERDUE] ${t.title}${t.priority === "high" ? " (HIGH)" : ""}`
      ).join("\n");
      parts.push(`### Overdue Tasks\n${overdueList}`);
    }
    
    if (todaysTasks.length > 0) {
      const todayList = todaysTasks.map(t => 
        `- ${t.title}${t.priority === "high" ? " (HIGH)" : ""}`
      ).join("\n");
      parts.push(`### Today's Tasks\n${todayList}`);
    }
    
    if (highPriorityTasks.length > 0 && highPriorityTasks.some(t => !todaysTasks.includes(t) && !overdueTasks.includes(t))) {
      const priorityList = highPriorityTasks
        .filter(t => !todaysTasks.includes(t) && !overdueTasks.includes(t))
        .map(t => `- ${t.title}${t.dueDate ? ` (due: ${new Date(t.dueDate).toLocaleDateString()})` : ""}`)
        .join("\n");
      if (priorityList) parts.push(`### High Priority\n${priorityList}`);
    }
    
    if (upcomingTasks.length > 0) {
      const upcomingList = upcomingTasks.map(t => 
        `- ${t.title} (due: ${new Date(t.dueDate!).toLocaleDateString()})`
      ).join("\n");
      parts.push(`### Upcoming This Week\n${upcomingList}`);
    }
  } catch (error) {
    console.error("Error building tasks bundle:", error);
  }
  
  const content = truncateToTokens(parts.join("\n\n"), maxTokens);
  return {
    name: "tasks",
    priority: "primary",
    content,
    tokenEstimate: estimateTokens(content),
  };
}

/**
 * Build the calendar context bundle
 * Uses caching to reduce API calls to Google Calendar
 */
export async function buildCalendarBundle(ctx: AppContext, maxTokens: number): Promise<ContextBundle> {
  const parts: string[] = [];
  
  try {
    // Cache calendar events to reduce Google Calendar API calls
    const cacheKey = createCacheKey("calendar", "upcoming");
    const events = await contextCache.getOrCompute(
      cacheKey,
      () => getUpcomingEvents(10),
      { ttlMs: CACHE_TTL.calendar, domain: "calendar" }
    );
    
    if (events && events.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const todaysEvents = events.filter((e: any) => {
        const eventDate = new Date(e.start?.dateTime || e.start?.date);
        return eventDate >= today && eventDate < tomorrow;
      });
      
      const upcomingEvents = events.filter((e: any) => {
        const eventDate = new Date(e.start?.dateTime || e.start?.date);
        return eventDate >= tomorrow;
      });
      
      if (todaysEvents.length > 0) {
        const eventList = todaysEvents.map((e: any) => {
          const time = e.start?.dateTime 
            ? new Date(e.start.dateTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
            : "All day";
          return `- ${time}: ${e.summary}`;
        }).join("\n");
        parts.push(`## Today's Schedule\n${eventList}`);
      } else {
        parts.push(`## Today's Schedule\nNo events scheduled for today.`);
      }
      
      if (upcomingEvents.length > 0) {
        const eventList = upcomingEvents.slice(0, 5).map((e: any) => {
          const date = new Date(e.start?.dateTime || e.start?.date);
          const dateStr = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
          const time = e.start?.dateTime 
            ? new Date(e.start.dateTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
            : "All day";
          return `- ${dateStr} ${time}: ${e.summary}`;
        }).join("\n");
        parts.push(`### Upcoming Events\n${eventList}`);
      }
    } else {
      parts.push(`## Calendar\nNo upcoming events found.`);
    }
  } catch (error) {
    // Calendar might not be configured
    parts.push(`## Calendar\nCalendar not configured or unavailable.`);
  }
  
  const content = truncateToTokens(parts.join("\n\n"), maxTokens);
  return {
    name: "calendar",
    priority: "secondary",
    content,
    tokenEstimate: estimateTokens(content),
  };
}

/**
 * Build the grocery context bundle
 * Uses caching to reduce database queries
 */
export async function buildGroceryBundle(ctx: AppContext, maxTokens: number): Promise<ContextBundle> {
  const parts: string[] = [];
  
  try {
    // Cache grocery items to reduce DB queries
    const cacheKey = createCacheKey("grocery", "all");
    const items = await contextCache.getOrCompute(
      cacheKey,
      () => getAllGroceryItems(),
      { ttlMs: CACHE_TTL.grocery, domain: "grocery" }
    );
    const toBuy = items.filter((i: GroceryItem) => !i.purchased);
    const purchased = items.filter((i: GroceryItem) => i.purchased);
    
    parts.push(`## Grocery List\nItems to buy: ${toBuy.length}, Recently purchased: ${purchased.length}`);
    
    if (toBuy.length > 0) {
      // Group by category
      const byCategory: Record<string, GroceryItem[]> = {};
      toBuy.forEach((item: GroceryItem) => {
        const cat = item.category || "Other";
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(item);
      });
      
      const categoryList = Object.entries(byCategory).map(([cat, categoryItems]) => {
        const itemList = categoryItems.map((i: GroceryItem) => 
          `  - ${i.name}${i.quantity && i.quantity !== "1" ? ` (${i.quantity})` : ""}`
        ).join("\n");
        return `**${cat}:**\n${itemList}`;
      }).join("\n");
      
      parts.push(`### To Buy\n${categoryList}`);
    }
  } catch (error) {
    console.error("Error building grocery bundle:", error);
  }
  
  const content = truncateToTokens(parts.join("\n\n"), maxTokens);
  return {
    name: "grocery",
    priority: "secondary",
    content,
    tokenEstimate: estimateTokens(content),
  };
}

/**
 * Build the locations context bundle (enhanced with lifelog correlation)
 */
export async function buildLocationsBundle(ctx: AppContext, maxTokens: number): Promise<ContextBundle> {
  const parts: string[] = [];

  try {
    // Get current location
    const location = getLatestLocation();
    if (location) {
      const ageMs = Date.now() - new Date(location.createdAt).getTime();
      const ageMinutes = Math.floor(ageMs / 60000);
      const ageStr = ageMinutes < 60
        ? `${ageMinutes} minutes ago`
        : `${Math.floor(ageMinutes / 60)} hours ago`;

      // Latitude and longitude are strings in the schema
      const lat = parseFloat(location.latitude);
      const lng = parseFloat(location.longitude);

      // Check nearby places (requires numeric lat/lng)
      const nearbyPlaces = findNearbyPlaces(lat, lng, 500);
      const closestPlace = nearbyPlaces.length > 0 ? nearbyPlaces[0] : null;

      // Enhanced header with place name if at a saved location
      if (closestPlace && closestPlace.distance < 150) {
        parts.push(`## Current Location\n📍 At ${closestPlace.name} (${closestPlace.category || "place"}) - ${ageStr}`);
      } else {
        parts.push(`## Current Location\nLat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)} (${ageStr})`);
      }

      if (nearbyPlaces.length > 0) {
        const placeList = nearbyPlaces.slice(0, 3).map(p =>
          `- ${p.name} (${p.category || "place"}, ${Math.round(p.distance)}m away)`
        ).join("\n");
        parts.push(`### Nearby Saved Places\n${placeList}`);

        // Get past conversations at this location - ALWAYS include if available (key feature!)
        if (closestPlace) {
          const lifelogsAtPlace = getLifelogsAtPlace(closestPlace.id);
          if (lifelogsAtPlace.length > 0) {
            const recentLifelogs = lifelogsAtPlace.slice(0, 8); // More when location is important
            const lifelogList = recentLifelogs.map((ll: LifelogLocation) => {
              const date = new Date(ll.lifelogStartTime);
              const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
              return `- "${ll.lifelogTitle}" (${dateStr} at ${timeStr})`;
            }).join("\n");
            parts.push(`### Past Conversations at ${closestPlace.name}\n${lifelogList}`);

            // Add insight about frequency
            if (lifelogsAtPlace.length > 5) {
              parts.push(`*You've had ${lifelogsAtPlace.length} conversations here - this is a frequently visited location*`);
            }
          }

          // Get linked tasks for this place
          const linkedTasks = getTasksByPlace(closestPlace.id).filter(t => !t.completed);
          if (linkedTasks.length > 0) {
            const taskList = linkedTasks.slice(0, 5).map(t =>
              `- ${t.title}${t.priority === "high" ? " (HIGH PRIORITY)" : ""}`
            ).join("\n");
            parts.push(`### 🎯 Tasks Linked to ${closestPlace.name}\n${taskList}`);
          }

          // Get linked reminders for this place
          const linkedReminders = getRemindersByPlace(closestPlace.id);
          if (linkedReminders.length > 0) {
            const reminderList = linkedReminders.slice(0, 3).map(r => `- ${r.message}`).join("\n");
            parts.push(`### 🔔 Location Reminders\n${reminderList}`);
          }
        }
      }

      // Also check for nearby lifelogs (even if not at a saved place)
      const nearbyLifelogs = getLifelogsNearLocation(lat, lng, 500);
      if (nearbyLifelogs.length > 0 && nearbyPlaces.length === 0) {
        // Only show if not already showing place-specific lifelogs
        const recentNearby = nearbyLifelogs.slice(0, 3);
        const nearbyList = recentNearby.map((ll: LifelogLocation & { distance: number }) => {
          const date = new Date(ll.lifelogStartTime);
          const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          return `- "${ll.lifelogTitle}" (${dateStr}, ${Math.round(ll.distance)}m away)`;
        }).join("\n");
        parts.push(`### Past Conversations Nearby\n${nearbyList}`);
      }

      // Check grocery proximity - returns an array of nearby grocery stores
      const groceryProximity = checkGroceryProximity(lat, lng);
      if (groceryProximity && groceryProximity.length > 0) {
        const storeNames = groceryProximity.map(g => g.place.name).join(", ");
        const items = getAllGroceryItems().filter((i: GroceryItem) => !i.purchased);
        if (items.length > 0) {
          const topItems = items.slice(0, 5).map(i => i.name).join(", ");
          parts.push(`### 🛒 Grocery Alert\nNear: ${storeNames}. You have ${items.length} items on your list: ${topItems}${items.length > 5 ? "..." : ""}`);
        }
      }
    }

    // Starred places
    const starred = getStarredPlaces();
    if (starred.length > 0) {
      const starredList = starred.slice(0, 5).map(p => `- ${p.name} (${p.category || "starred"})`).join("\n");
      parts.push(`### ⭐ Favorite Places\n${starredList}`);
    }

    // Recent location-tagged conversations
    const recentLocatedLifelogs = getRecentLifelogLocations(5);
    const withPlaces = recentLocatedLifelogs.filter((ll: LifelogLocation) => ll.savedPlaceName);
    if (withPlaces.length > 0) {
      const locatedList = withPlaces.slice(0, 3).map((ll: LifelogLocation) => {
        const date = new Date(ll.lifelogStartTime);
        const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        const activity = formatActivityType(ll.activityType as ActivityType);
        return `- "${ll.lifelogTitle}" at ${ll.savedPlaceName} (${timeStr}${activity ? `, ${activity}` : ""})`;
      }).join("\n");
      parts.push(`### Recent Location-Tagged Conversations\n${locatedList}`);
    }
  } catch (error) {
    console.error("Error building locations bundle:", error);
  }

  const content = truncateToTokens(parts.join("\n\n"), maxTokens);
  return {
    name: "locations",
    priority: "tertiary",
    content,
    tokenEstimate: estimateTokens(content),
  };
}

/**
 * Format activity type for human-readable display
 */
function formatActivityType(activity: ActivityType | undefined): string {
  if (!activity || activity === "unknown") return "";
  const labels: Record<ActivityType, string> = {
    "stationary": "stationary",
    "walking": "walking",
    "driving": "driving",
    "commuting": "commuting",
    "at_home": "at home",
    "at_work": "at work",
    "at_known_place": "at location",
    "unknown": "",
  };
  return labels[activity] || "";
}

/**
 * Build the Omi memory context bundle (enhanced with location context)
 */
export async function buildOmiBundle(ctx: AppContext, maxTokens: number): Promise<ContextBundle> {
  const parts: string[] = [];
  
  try {
    // Get memory overview
    const overview = await getMemoryOverview();
    
    if (overview && overview.connected) {
      parts.push(`## Omi Memory Data`);
      parts.push(`Today: ${overview.today.count} memories, Yesterday: ${overview.yesterday.count}, Last 7 days: ${overview.last7Days.count}`);
      
      if (overview.mostRecent) {
        parts.push(`Most recent: "${overview.mostRecent.title}" (${overview.mostRecent.age})`);
      }
      
      // If the user message seems to be asking about memories, search
      const memoryKeywords = ["today", "earlier", "conversation", "said", "talked", "meeting", "discussed", "mentioned", "where"];
      const hasMemoryIntent = memoryKeywords.some(k => ctx.userMessage.toLowerCase().includes(k));
      
      // Check if asking about location-specific memories
      const locationKeywords = ["where", "place", "location", "at the", "when i was at"];
      const hasLocationIntent = locationKeywords.some(k => ctx.userMessage.toLowerCase().includes(k));
      
      if (hasMemoryIntent && overview.today.count > 0) {
        // Get recent memories
        const recent = await getRecentMemories(24, 5);
        if (recent && recent.length > 0) {
          // Get location context for these memories
          const memoryIds = recent.map((l: any) => l.id);
          const locationContexts = getLifelogLocationContexts(memoryIds);
          
          // Build a map for quick lookup
          const locationMap = new Map(locationContexts.map(lc => [lc.lifelogId, lc]));
          
          const recentList = recent.map((l: any) => {
            const timeStr = new Date(l.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
            const locCtx = locationMap.get(l.id);
            
            // Build location string if available
            let locationStr = "";
            if (locCtx && locCtx.location) {
              if (locCtx.location.placeName) {
                locationStr = ` at ${locCtx.location.placeName}`;
              }
              const activity = formatActivityType(locCtx.activity);
              if (activity) {
                locationStr += ` (${activity})`;
              }
            }
            
            return `- "${l.title}" at ${timeStr}${locationStr}`;
          }).join("\n");
          parts.push(`### Recent Memories\n${recentList}`);
          
          // If user is asking about location-specific memories
          if (hasLocationIntent) {
            // Get location-tagged memories with places
            const locatedMemories = getRecentLifelogLocations(10)
              .filter((ll: LifelogLocation) => ll.savedPlaceName);
            
            if (locatedMemories.length > 0) {
              // Group by place
              const byPlace = new Map<string, LifelogLocation[]>();
              for (const ll of locatedMemories) {
                const placeName = ll.savedPlaceName || "Unknown";
                if (!byPlace.has(placeName)) {
                  byPlace.set(placeName, []);
                }
                byPlace.get(placeName)!.push(ll);
              }
              
              const placesList = Array.from(byPlace.entries())
                .slice(0, 3)
                .map(([place, memories]) => {
                  const titles = memories.slice(0, 2).map(ll => `"${ll.lifelogTitle}"`).join(", ");
                  return `- **${place}**: ${titles}${memories.length > 2 ? ` (+${memories.length - 2} more)` : ""}`;
                }).join("\n");
              parts.push(`### Memories by Location\n${placesList}`);
            }
          }
        }
      }
    } else {
      parts.push(`## Omi Memory\nNot connected or no API key configured.`);
    }
  } catch (error) {
    console.error("Error building omi bundle:", error);
    parts.push(`## Omi Memory\nUnable to fetch data.`);
  }
  
  const content = truncateToTokens(parts.join("\n\n"), maxTokens);
  return {
    name: "omi",
    priority: "secondary",
    content,
    tokenEstimate: estimateTokens(content),
  };
}

/**
 * Build the contacts context bundle
 * Uses caching to reduce database queries
 */
export async function buildContactsBundle(ctx: AppContext, maxTokens: number): Promise<ContextBundle> {
  const parts: string[] = [];
  
  try {
    // Cache contacts to reduce DB queries
    const cacheKey = createCacheKey("contacts", "all");
    const contacts = await contextCache.getOrCompute(
      cacheKey,
      () => getAllContacts(),
      { ttlMs: CACHE_TTL.contacts, domain: "contacts" }
    );
    
    // Summary
    parts.push(`## Contacts\nTotal: ${contacts.length}`);
    
    // Family members
    const family = contacts.filter(c => 
      c.relationship && ["spouse", "parent", "child", "sibling", "family"].some(r => 
        c.relationship!.toLowerCase().includes(r)
      )
    );
    if (family.length > 0) {
      const familyList = family.slice(0, 5).map(c => {
        const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
        return `- ${name}${c.relationship ? ` (${c.relationship})` : ""}`;
      }).join("\n");
      parts.push(`### Family\n${familyList}`);
    }
    
    // Recently contacted
    const recentContacts = contacts
      .filter(c => c.lastInteractionAt)
      .sort((a, b) => new Date(b.lastInteractionAt!).getTime() - new Date(a.lastInteractionAt!).getTime())
      .slice(0, 5);
    
    if (recentContacts.length > 0) {
      const recentList = recentContacts.map(c => {
        const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
        return `- ${name}`;
      }).join("\n");
      parts.push(`### Recent Contacts\n${recentList}`);
    }
  } catch (error) {
    console.error("Error building contacts bundle:", error);
  }
  
  const content = truncateToTokens(parts.join("\n\n"), maxTokens);
  return {
    name: "contacts",
    priority: "tertiary",
    content,
    tokenEstimate: estimateTokens(content),
  };
}

/**
 * Build a minimal SMS context bundle (just summary, not full logs)
 */
export async function buildSmsBundle(ctx: AppContext, maxTokens: number): Promise<ContextBundle> {
  // SMS bundle is lightweight - just indicates the context
  const content = `## SMS Context\nUser is communicating via SMS from ${ctx.userPhoneNumber || "unknown number"}.`;
  return {
    name: "sms",
    priority: "tertiary",
    content,
    tokenEstimate: estimateTokens(content),
  };
}

/**
 * Build food preferences context bundle
 */
export async function buildFoodBundle(ctx: AppContext, maxTokens: number): Promise<ContextBundle> {
  // Food bundle would pull from food preferences, recipes, meal history
  // For now, a placeholder that can be expanded
  const content = `## Food Context\nFood preferences and meal planning features available.`;
  return {
    name: "food",
    priority: "tertiary",
    content,
    tokenEstimate: estimateTokens(content),
  };
}

/**
 * Build conversation history bundle with summarization
 * 
 * Note: This bundle provides a SUMMARY view of conversation history for context.
 * The actual message history is still passed separately to the chat completion.
 * This summary helps the agent understand the broader conversation arc without
 * duplicating the raw messages that are already in the messages array.
 * 
 * When a summary exists (for long conversations), we include:
 * - The compressed summary of older messages
 * - A note about how many messages were summarized
 * 
 * We intentionally do NOT include recent raw messages here because:
 * - They're already in the chat completion's messages array
 * - Including them here would cause token waste and confusion
 */
export async function buildConversationBundle(ctx: AppContext, maxTokens: number): Promise<ContextBundle> {
  if (!ctx.conversationId) {
    return {
      name: "conversation",
      priority: "primary",
      content: "",
      tokenEstimate: 0,
    };
  }

  try {
    const { summary, recentMessages, totalMessages, summarizedCount } = getConversationContext(ctx.conversationId);
    const parts: string[] = [];

    // Only include the summary if we have one (long conversations)
    // Recent messages are NOT included here - they're in the messages array
    if (summary && summarizedCount > 0) {
      parts.push(`## Conversation History Summary`);
      parts.push(`The following summarizes ${summarizedCount} earlier messages in this conversation:`);
      parts.push(summary);
      parts.push(`\n(${recentMessages.length} recent messages follow in the conversation below)`);
    } else if (totalMessages > 0) {
      // No summary yet - just note the conversation exists
      // Don't duplicate messages that are already in the chat history
      parts.push(`## Conversation Context`);
      parts.push(`This conversation has ${totalMessages} message(s). Recent messages are included below.`);
    }

    const content = truncateToTokens(parts.join("\n\n"), maxTokens);
    return {
      name: "conversation",
      priority: "primary",
      content,
      tokenEstimate: estimateTokens(content),
    };
  } catch (error) {
    console.error("Error building conversation bundle:", error);
    return {
      name: "conversation",
      priority: "primary",
      content: "",
      tokenEstimate: 0,
    };
  }
}

/**
 * Build profile context bundle (more detailed than global)
 */
export async function buildProfileBundle(ctx: AppContext, maxTokens: number): Promise<ContextBundle> {
  const parts: string[] = [];
  
  try {
    const profileSections = getAllProfileSections();
    
    for (const profileSection of profileSections) {
      if (!profileSection.data) continue;
      
      const data = typeof profileSection.data === 'string' ? JSON.parse(profileSection.data) : profileSection.data;
      const sectionName = profileSection.section.replace(/_/g, " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase());
      
      // Format section data
      const entries = Object.entries(data)
        .filter(([_, v]) => v && (typeof v !== 'object' || (Array.isArray(v) && v.length > 0)))
        .map(([k, v]) => {
          if (Array.isArray(v)) {
            return `${k}: ${v.map((item: any) => item.displayName || item.name || item).join(", ")}`;
          }
          if (typeof v === 'object' && v !== null) {
            return `${k}: ${(v as any).displayName || JSON.stringify(v)}`;
          }
          return `${k}: ${v}`;
        });
      
      if (entries.length > 0) {
        parts.push(`### ${sectionName}\n${entries.join("\n")}`);
      }
    }
  } catch (error) {
    console.error("Error building profile bundle:", error);
  }
  
  const content = truncateToTokens(parts.join("\n\n"), maxTokens);
  return {
    name: "profile",
    priority: "primary",
    content,
    tokenEstimate: estimateTokens(content),
  };
}

/**
 * Build knowledge graph context bundle
 * 
 * This uses graph traversal and semantic search to find connected context
 * across all domains. It provides:
 * - Related entities discovered via graph traversal
 * - Cross-domain connections showing how entities bridge domains
 * - Relevant items from multiple domains based on graph relationships
 */
export async function buildKnowledgeGraphBundle(ctx: AppContext, maxTokens: number): Promise<ContextBundle> {
  try {
    // Use the user message to query the knowledge graph
    const graphContext = await buildGraphContextBundle(ctx.userMessage, maxTokens);
    
    if (!graphContext || graphContext.trim().length === 0) {
      return {
        name: "knowledgegraph",
        priority: "secondary",
        content: "",
        tokenEstimate: 0,
      };
    }
    
    return {
      name: "knowledgegraph",
      priority: "secondary",
      content: graphContext,
      tokenEstimate: estimateTokens(graphContext),
    };
  } catch (error) {
    console.error("Error building knowledge graph bundle:", error);
    return {
      name: "knowledgegraph",
      priority: "secondary",
      content: "",
      tokenEstimate: 0,
    };
  }
}

/**
 * Build cross-domain context bundle (Layer C - on-demand context)
 * 
 * This bundle finds entities referenced in the current conversation and
 * surfaces related items from other domains, creating cross-domain connections.
 * 
 * Examples of cross-domain context:
 * - "About John Smith: Mentioned in 3 memories, has upcoming calendar event 'Lunch with John', appears in 2 tasks"
 * - "About Home: Location appears in memory about family routines, nearby task 'Pick up dry cleaning'"
 * 
 * @param conversationId - Optional conversation ID to extract entities from
 * @param recentEntities - Optional array of entities to include directly
 * @returns A context string with cross-domain connections (max 800 tokens)
 */
export async function buildCrossDomainBundle(
  conversationId?: string,
  recentEntities?: Entity[]
): Promise<string> {
  const maxTokens = 800;
  const parts: string[] = [];
  const seenEntityIds = new Set<string>();
  const entitySummaries: Array<{ label: string; summary: string }> = [];

  try {
    // Collect entities from conversation messages
    if (conversationId) {
      const messages = getMessagesByConversation(conversationId);
      
      for (const message of messages.slice(-10)) {
        const entities = getEntitiesForItem("conversation", message.id);
        for (const entity of entities) {
          if (!seenEntityIds.has(entity.id)) {
            seenEntityIds.add(entity.id);
            recentEntities = recentEntities || [];
            recentEntities.push(entity);
          }
        }
      }
    }

    // Process each entity and find related items across domains
    if (recentEntities && recentEntities.length > 0) {
      for (const entity of recentEntities) {
        if (seenEntityIds.has(entity.id) === false) {
          seenEntityIds.add(entity.id);
        }
        
        const relatedItems = getItemsRelatedToEntity(entity.id);
        if (relatedItems.length === 0) continue;

        // Group items by domain
        const byDomain: Record<EntityDomain, Array<{ itemId: string; context: string | null }>> = {
          memory: [],
          task: [],
          contact: [],
          calendar: [],
          location: [],
          grocery: [],
          conversation: [],
        };

        for (const item of relatedItems) {
          byDomain[item.domain].push({ itemId: item.itemId, context: item.context });
        }

        // Build summary for this entity
        const summaryParts: string[] = [];

        // Memory references
        if (byDomain.memory.length > 0) {
          const memoryDetails = byDomain.memory.slice(0, 3).map(m => {
            const note = getMemoryNote(m.itemId);
            return note ? note.content.substring(0, 50) + (note.content.length > 50 ? "..." : "") : null;
          }).filter(Boolean);
          
          if (memoryDetails.length > 0) {
            summaryParts.push(`Mentioned in ${byDomain.memory.length} memories (${memoryDetails.join("; ")})`);
          } else {
            summaryParts.push(`Mentioned in ${byDomain.memory.length} memories`);
          }
        }

        // Task references
        if (byDomain.task.length > 0) {
          const taskDetails = byDomain.task.slice(0, 3).map(t => {
            const task = getTask(t.itemId);
            return task ? `"${task.title}"${task.completed ? " (done)" : ""}` : null;
          }).filter(Boolean);
          
          if (taskDetails.length > 0) {
            summaryParts.push(`Related tasks: ${taskDetails.join(", ")}`);
          } else {
            summaryParts.push(`Appears in ${byDomain.task.length} tasks`);
          }
        }

        // Calendar references
        if (byDomain.calendar.length > 0) {
          summaryParts.push(`Has ${byDomain.calendar.length} calendar event(s)`);
        }

        // Location references
        if (byDomain.location.length > 0) {
          const locationDetails = byDomain.location.slice(0, 2).map(l => {
            const place = getSavedPlace(l.itemId);
            return place ? place.name : null;
          }).filter(Boolean);
          
          if (locationDetails.length > 0) {
            summaryParts.push(`Associated with: ${locationDetails.join(", ")}`);
          } else {
            summaryParts.push(`Linked to ${byDomain.location.length} location(s)`);
          }
        }

        // Contact references
        if (byDomain.contact.length > 0) {
          const contactDetails = byDomain.contact.slice(0, 2).map(c => {
            const contact = getContact(c.itemId);
            return contact ? `${contact.firstName} ${contact.lastName}`.trim() : null;
          }).filter(Boolean);
          
          if (contactDetails.length > 0) {
            summaryParts.push(`Related to: ${contactDetails.join(", ")}`);
          } else {
            summaryParts.push(`Connected to ${byDomain.contact.length} contact(s)`);
          }
        }

        if (summaryParts.length > 0) {
          entitySummaries.push({
            label: entity.label,
            summary: summaryParts.join("; "),
          });
        }
      }
    }

    // Build the final context string
    if (entitySummaries.length > 0) {
      parts.push("## Related Context");
      
      for (const { label, summary } of entitySummaries.slice(0, 10)) {
        parts.push(`About ${label}: ${summary}`);
      }
    }
  } catch (error) {
    console.error("Error building cross-domain bundle:", error);
  }

  const content = truncateToTokens(parts.join("\n"), maxTokens);
  return content;
}

/**
 * Bundle builder registry
 */
const BUNDLE_BUILDERS: Record<string, (ctx: AppContext, maxTokens: number) => Promise<ContextBundle>> = {
  memory: buildMemoryBundle,
  tasks: buildTasksBundle,
  calendar: buildCalendarBundle,
  grocery: buildGroceryBundle,
  locations: buildLocationsBundle,
  omi: buildOmiBundle,
  contacts: buildContactsBundle,
  sms: buildSmsBundle,
  food: buildFoodBundle,
  profile: buildProfileBundle,
  conversation: buildConversationBundle,
  knowledgegraph: buildKnowledgeGraphBundle,
};

/**
 * Detect if user is currently at a significant place
 * Returns the place info if they are, null otherwise
 */
function detectCurrentSignificantPlace(): { name: string; category: string } | null {
  try {
    const location = getLatestLocation();
    if (!location) return null;

    const lat = parseFloat(location.latitude);
    const lng = parseFloat(location.longitude);

    // Check if near any starred places first (highest priority)
    const starredPlaces = getStarredPlaces();
    for (const place of starredPlaces) {
      const placeLat = parseFloat(place.latitude);
      const placeLng = parseFloat(place.longitude);
      const distance = calculateHaversineDistance(lat, lng, placeLat, placeLng);
      const threshold = place.proximityRadiusMeters || 150;

      if (distance <= threshold) {
        return { name: place.name, category: place.category || "starred" };
      }
    }

    // Check for important category places (work, home)
    const nearbyPlaces = findNearbyPlaces(lat, lng, 200);
    const importantPlace = nearbyPlaces.find(p =>
      p.category === "work" ||
      p.category === "home" ||
      p.category === "frequent"
    );

    if (importantPlace) {
      return { name: importantPlace.name, category: importantPlace.category || "place" };
    }

    return null;
  } catch (error) {
    console.error("Error detecting current place:", error);
    return null;
  }
}

/**
 * Simple haversine distance calculation (meters)
 */
function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Main context router - assembles context based on route and query
 */
export async function assembleContext(
  ctx: AppContext,
  budget: TokenBudget = DEFAULT_TOKEN_BUDGET
): Promise<string> {
  const bundles: ContextBundle[] = [];

  // Always include global bundle
  const globalBundle = await buildGlobalBundle(ctx);
  bundles.push(globalBundle);

  // Determine route config
  let routeConfig = ROUTE_BUNDLES[ctx.currentRoute];
  if (!routeConfig) {
    // Default to SMS config for unknown routes (likely SMS conversation)
    routeConfig = ROUTE_BUNDLES["sms"];
  }

  // INTELLIGENT LOCATION PROMOTION: If user is at a significant place, boost location to PRIMARY
  const currentPlace = detectCurrentSignificantPlace();
  if (currentPlace && !routeConfig.primary.includes("locations")) {
    console.log(`[ContextRouter] User is at ${currentPlace.name} (${currentPlace.category}) - promoting location to PRIMARY context`);

    // Create a modified route config with location as primary
    routeConfig = {
      ...routeConfig,
      primary: [...routeConfig.primary, "locations"],
      secondary: routeConfig.secondary.filter(b => b !== "locations"),
      tertiary: routeConfig.tertiary?.filter(b => b !== "locations"),
    };
  }
  
  // Build primary bundles
  for (const bundleName of routeConfig.primary) {
    const builder = BUNDLE_BUILDERS[bundleName];
    if (builder) {
      try {
        const bundle = await builder(ctx, budget.primary);
        bundle.priority = "primary";
        bundles.push(bundle);
      } catch (error) {
        console.error(`Error building ${bundleName} bundle:`, error);
      }
    }
  }
  
  // Build secondary bundles
  for (const bundleName of routeConfig.secondary) {
    const builder = BUNDLE_BUILDERS[bundleName];
    if (builder) {
      try {
        const bundle = await builder(ctx, budget.secondary);
        bundle.priority = "secondary";
        bundles.push(bundle);
      } catch (error) {
        console.error(`Error building ${bundleName} bundle:`, error);
      }
    }
  }
  
  // Build tertiary bundles if we have token budget
  const usedTokens = bundles.reduce((sum, b) => sum + b.tokenEstimate, 0);
  if (usedTokens < budget.total - budget.tertiary && routeConfig.tertiary) {
    for (const bundleName of routeConfig.tertiary) {
      const builder = BUNDLE_BUILDERS[bundleName];
      if (builder) {
        try {
          const bundle = await builder(ctx, budget.tertiary);
          bundle.priority = "tertiary";
          bundles.push(bundle);
        } catch (error) {
          console.error(`Error building ${bundleName} bundle:`, error);
        }
      }
    }
  }
  
  // Layer C: Build cross-domain bundle for on-demand context
  // This surfaces entities from the conversation and their related items across domains
  let crossDomainContent = "";
  if (ctx.conversationId) {
    try {
      crossDomainContent = await buildCrossDomainBundle(ctx.conversationId);
    } catch (error) {
      console.error("Error building cross-domain bundle:", error);
    }
  }
  
  // Assemble final context string
  const contextParts: string[] = [];
  
  // Global context first
  const global = bundles.find(b => b.name === "global");
  if (global && global.content) {
    contextParts.push(global.content);
  }
  
  // Primary bundles
  const primaryBundles = bundles.filter(b => b.priority === "primary" && b.name !== "global" && b.content);
  for (const bundle of primaryBundles) {
    contextParts.push(bundle.content);
  }
  
  // Secondary bundles
  const secondaryBundles = bundles.filter(b => b.priority === "secondary" && b.content);
  for (const bundle of secondaryBundles) {
    contextParts.push(bundle.content);
  }
  
  // Tertiary bundles (if included)
  const tertiaryBundles = bundles.filter(b => b.priority === "tertiary" && b.content);
  for (const bundle of tertiaryBundles) {
    contextParts.push(bundle.content);
  }
  
  // Layer C: Add cross-domain context (on-demand)
  if (crossDomainContent) {
    contextParts.push(crossDomainContent);
  }
  
  const assembledContext = contextParts.join("\n\n");
  
  // Log context assembly for debugging
  console.log(`[ContextRouter] Assembled context for route "${ctx.currentRoute}":`, {
    bundles: bundles.map(b => ({ name: b.name, priority: b.priority, tokens: b.tokenEstimate })),
    totalTokens: bundles.reduce((sum, b) => sum + b.tokenEstimate, 0),
    hasCrossDomainContext: !!crossDomainContent,
  });
  
  return assembledContext;
}

/**
 * Detect intent from user message to help with routing
 */
export function detectIntent(userMessage: string): string {
  const lowerMessage = userMessage.toLowerCase();
  
  // Task-related
  if (/\b(task|todo|to-do|remind|deadline|overdue|priority)\b/.test(lowerMessage)) {
    return "tasks";
  }
  
  // Calendar-related
  if (/\b(calendar|schedule|event|meeting|appointment|busy|free|available)\b/.test(lowerMessage)) {
    return "calendar";
  }
  
  // Grocery-related
  if (/\b(grocery|groceries|shopping|buy|store|food|meal|recipe)\b/.test(lowerMessage)) {
    return "grocery";
  }
  
  // Location-related
  if (/\b(location|where|near|nearby|directions|address|place|gps)\b/.test(lowerMessage)) {
    return "locations";
  }
  
  // Omi/memory-related
  if (/\b(today|earlier|conversation|said|talked|meeting|discussed|mentioned|pendant|omi|memory)\b/.test(lowerMessage)) {
    return "omi";
  }
  
  // Memory-related
  if (/\b(remember|memory|recall|forgot|fact|preference|note)\b/.test(lowerMessage)) {
    return "memory";
  }
  
  // Contact-related
  if (/\b(contact|person|people|call|text|phone|email)\b/.test(lowerMessage)) {
    return "contacts";
  }
  
  return "general";
}

/**
 * Background processor for extracting and managing people from lifelogs
 * 
 * This runs periodically to:
 * 1. Scan lifelogs for new people
 * 2. Auto-create contacts for identified speakers
 * 3. Update interaction counts for existing contacts
 * 4. Extract and store relevant memories about people
 */

import * as cron from "node-cron";
import { v4 as uuidv4 } from "uuid";
import {
  extractPeopleFromRecentLifelogs,
  type ExtractedPerson,
} from "./limitless";
import {
  createContact,
  findSimilarContact,
  incrementContactInteraction,
  getContact,
  getAutoCreatedContacts,
} from "./db";

interface ProcessingResult {
  processed: number;
  newContacts: number;
  updatedContacts: number;
  errors: string[];
}

let lastProcessedTime: Date | null = null;
let isProcessing = false;
let scheduledTask: cron.ScheduledTask | null = null;

export async function processPeopleFromLifelogs(hours: number = 4): Promise<ProcessingResult> {
  if (isProcessing) {
    console.log("[PeopleProcessor] Already processing, skipping...");
    return {
      processed: 0,
      newContacts: 0,
      updatedContacts: 0,
      errors: ["Already processing"],
    };
  }
  
  isProcessing = true;
  const startTime = Date.now();
  const result: ProcessingResult = {
    processed: 0,
    newContacts: 0,
    updatedContacts: 0,
    errors: [],
  };
  
  try {
    console.log(`[PeopleProcessor] Starting people extraction from last ${hours} hours of lifelogs...`);
    
    const extractedPeople = await extractPeopleFromRecentLifelogs(hours);
    result.processed = extractedPeople.length;
    
    if (extractedPeople.length === 0) {
      console.log("[PeopleProcessor] No people found in lifelogs");
      return result;
    }
    
    console.log(`[PeopleProcessor] Found ${extractedPeople.length} people in lifelogs`);
    
    for (const person of extractedPeople) {
      try {
        const existingContact = findSimilarContact(person.name);
        
        if (existingContact) {
          incrementContactInteraction(existingContact.id);
          result.updatedContacts++;
          console.log(`[PeopleProcessor] Updated interaction for existing contact: ${existingContact.name}`);
        } else {
          const uniquePhonePlaceholder = `auto-${uuidv4()}`;
          
          const newContact = createContact({
            name: person.name,
            phoneNumber: uniquePhonePlaceholder,
            relationship: "",
            accessLevel: "unknown",
            isAutoCreated: true,
            notes: `Auto-created from lifelog: ${person.lifelogTitle}\nContext: ${person.context.substring(0, 200)}`,
          });
          
          result.newContacts++;
          console.log(`[PeopleProcessor] Created new contact: ${newContact.name} (${newContact.id})`);
        }
      } catch (error: any) {
        const errorMsg = `Failed to process person ${person.name}: ${error.message}`;
        result.errors.push(errorMsg);
        console.error(`[PeopleProcessor] ${errorMsg}`);
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`[PeopleProcessor] Completed in ${duration}ms. New: ${result.newContacts}, Updated: ${result.updatedContacts}`);
    
    lastProcessedTime = new Date();
    
    return result;
  } catch (error: any) {
    console.error("[PeopleProcessor] Fatal error:", error);
    result.errors.push(`Fatal error: ${error.message}`);
    return result;
  } finally {
    isProcessing = false;
  }
}

export function startPeopleProcessor(): void {
  if (scheduledTask) {
    console.log("[PeopleProcessor] Already running, stopping existing task...");
    scheduledTask.stop();
  }
  
  scheduledTask = cron.schedule(
    "0 */4 * * *",
    async () => {
      console.log("[PeopleProcessor] Running scheduled people extraction...");
      await processPeopleFromLifelogs(4);
    },
    {
      timezone: "America/New_York",
    }
  );
  
  console.log("[PeopleProcessor] Background processor started (runs every 4 hours)");
}

export function stopPeopleProcessor(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log("[PeopleProcessor] Background processor stopped");
  }
}

export function getProcessorStatus(): {
  isRunning: boolean;
  isProcessing: boolean;
  lastProcessedTime: string | null;
} {
  return {
    isRunning: scheduledTask !== null,
    isProcessing,
    lastProcessedTime: lastProcessedTime?.toISOString() || null,
  };
}

export function getAutoCreatedPeopleStats(): {
  totalAutoCreated: number;
  recentlyAdded: number;
} {
  try {
    const autoCreated = getAutoCreatedContacts();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const recentlyAdded = autoCreated.filter(c => {
      const createdAt = new Date(c.createdAt);
      return createdAt > oneDayAgo;
    }).length;
    
    return {
      totalAutoCreated: autoCreated.length,
      recentlyAdded,
    };
  } catch (error) {
    console.error("[PeopleProcessor] Error getting stats:", error);
    return {
      totalAutoCreated: 0,
      recentlyAdded: 0,
    };
  }
}

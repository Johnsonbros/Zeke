/**
 * Entity Extraction Service for ZEKE
 * 
 * Automatically detects and links entities when content is created or updated.
 * Uses rule-based pattern matching to extract:
 * - People (from contacts)
 * - Locations (from saved places)
 * - Dates/times (regex patterns)
 * - Topics (keyword matching)
 * - Context categories (via GPT-4 classification)
 */

import OpenAI from "openai";
import type { 
  Contact, 
  SavedPlace, 
  MemoryNote, 
  Task, 
  Message,
  Entity,
  EntityReference,
  EntityDomain,
  EntityType,
  EntityRelationshipType,
  ContextCategory
} from "@shared/schema";
import { contextCategories } from "@shared/schema";

import {
  getAllContacts,
  getAllSavedPlaces,
  createEntity,
  createEntityReference,
  createEntityLink,
  findEntitiesByLabel,
  getMessagesByConversation,
  findOrCreateEntityLink,
  getEntitiesForItem,
  findOrCreateMemoryRelationship
} from "./db";
import { getContactFullName } from "@shared/schema";

// Confidence score constants
const CONFIDENCE_EXACT = "0.9";
const CONFIDENCE_PARTIAL = "0.7";
const CONFIDENCE_FUZZY = "0.5";

// Common topics for keyword extraction
const TOPIC_KEYWORDS: Record<string, string[]> = {
  work: ["work", "job", "office", "meeting", "project", "deadline", "client", "boss", "colleague", "presentation", "report", "email", "calendar", "schedule", "career"],
  family: ["family", "mom", "dad", "mother", "father", "sister", "brother", "wife", "husband", "son", "daughter", "kids", "children", "baby", "grandma", "grandpa", "aunt", "uncle", "cousin"],
  health: ["health", "doctor", "appointment", "medicine", "pharmacy", "hospital", "sick", "exercise", "gym", "workout", "diet", "sleep", "therapy", "dentist", "checkup", "prescription"],
  travel: ["travel", "trip", "vacation", "flight", "hotel", "airport", "destination", "booking", "luggage", "passport", "visa", "itinerary", "road trip", "beach", "mountains"],
  finance: ["money", "budget", "payment", "bill", "bank", "savings", "investment", "tax", "expense", "salary", "rent", "mortgage", "insurance", "credit", "loan"],
  shopping: ["shopping", "store", "buy", "purchase", "order", "delivery", "amazon", "package", "gift", "price", "sale", "discount"],
  food: ["food", "dinner", "lunch", "breakfast", "restaurant", "recipe", "cook", "grocery", "meal", "snack", "coffee", "tea"],
  social: ["party", "birthday", "wedding", "celebration", "gathering", "friend", "date", "event", "concert", "movie", "game"],
  home: ["home", "house", "apartment", "cleaning", "repair", "maintenance", "furniture", "garden", "yard", "renovation"],
  education: ["school", "class", "course", "study", "learn", "homework", "exam", "test", "grade", "teacher", "student", "university", "college"]
};

// Date patterns for regex extraction
const DATE_PATTERNS = [
  { pattern: /\btomorrow\b/i, type: "relative" },
  { pattern: /\btoday\b/i, type: "relative" },
  { pattern: /\byesterday\b/i, type: "relative" },
  { pattern: /\bnext week\b/i, type: "relative" },
  { pattern: /\bthis week\b/i, type: "relative" },
  { pattern: /\blast week\b/i, type: "relative" },
  { pattern: /\bnext month\b/i, type: "relative" },
  { pattern: /\bthis month\b/i, type: "relative" },
  { pattern: /\bnext (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, type: "relative" },
  { pattern: /\bthis (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, type: "relative" },
  { pattern: /\bon (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, type: "weekday" },
  { pattern: /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?\b/i, type: "absolute" },
  { pattern: /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\b/i, type: "absolute" },
  { pattern: /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/, type: "numeric" },
  { pattern: /\b\d{4}-\d{2}-\d{2}\b/, type: "iso" },
  { pattern: /\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i, type: "time" },
  { pattern: /\b\d{1,2}:\d{2}\s*(?:am|pm)?\b/i, type: "time" },
  { pattern: /\bin the morning\b/i, type: "time" },
  { pattern: /\bin the afternoon\b/i, type: "time" },
  { pattern: /\bin the evening\b/i, type: "time" },
  { pattern: /\btonight\b/i, type: "time" },
  { pattern: /\beod\b/i, type: "time" },
  { pattern: /\bend of day\b/i, type: "time" },
  { pattern: /\bend of week\b/i, type: "relative" }
];

// ============================================
// RESULT TYPES
// ============================================

export interface PersonMatch {
  contact: Contact;
  matchedText: string;
  confidence: string;
  position: number;
}

export interface LocationMatch {
  place: SavedPlace;
  matchedText: string;
  confidence: string;
  position: number;
}

export interface DateMatch {
  text: string;
  type: string;
  confidence: string;
  position: number;
}

export interface TopicMatch {
  topic: string;
  keywords: string[];
  confidence: string;
}

export interface ExtractionResult {
  people: PersonMatch[];
  locations: LocationMatch[];
  dates: DateMatch[];
  topics: TopicMatch[];
}

// ============================================
// ENTITY DETECTION FUNCTIONS
// ============================================

/**
 * Extract people mentions from text by matching against existing contacts
 */
export function extractPeopleFromText(text: string, existingContacts: Contact[]): PersonMatch[] {
  const matches: PersonMatch[] = [];
  const lowerText = text.toLowerCase();
  
  for (const contact of existingContacts) {
    const fullName = getContactFullName(contact).toLowerCase();
    const firstName = contact.firstName.toLowerCase();
    const lastName = contact.lastName.toLowerCase();
    
    // Check for exact full name match
    let position = lowerText.indexOf(fullName);
    if (fullName.length > 2 && position !== -1) {
      matches.push({
        contact,
        matchedText: fullName,
        confidence: CONFIDENCE_EXACT,
        position
      });
      continue;
    }
    
    // Check for first name match (must be at word boundary)
    if (firstName.length > 2) {
      const firstNameRegex = new RegExp(`\\b${escapeRegex(firstName)}\\b`, 'gi');
      const firstNameMatch = firstNameRegex.exec(text);
      if (firstNameMatch) {
        // Check if this is likely the same person (not a common word)
        const isCommonWord = ["will", "may", "grace", "joy", "hope", "faith", "mark", "bill"].includes(firstName);
        
        if (!isCommonWord) {
          matches.push({
            contact,
            matchedText: firstNameMatch[0],
            confidence: CONFIDENCE_PARTIAL,
            position: firstNameMatch.index
          });
          continue;
        }
      }
    }
    
    // Check for last name match (longer names only, at word boundary)
    if (lastName.length > 4) {
      const lastNameRegex = new RegExp(`\\b${escapeRegex(lastName)}\\b`, 'gi');
      const lastNameMatch = lastNameRegex.exec(text);
      if (lastNameMatch) {
        matches.push({
          contact,
          matchedText: lastNameMatch[0],
          confidence: CONFIDENCE_FUZZY,
          position: lastNameMatch.index
        });
      }
    }
  }
  
  // Remove duplicates (keep highest confidence)
  const uniqueMatches = new Map<string, PersonMatch>();
  for (const match of matches) {
    const existing = uniqueMatches.get(match.contact.id);
    if (!existing || parseFloat(match.confidence) > parseFloat(existing.confidence)) {
      uniqueMatches.set(match.contact.id, match);
    }
  }
  
  return Array.from(uniqueMatches.values());
}

/**
 * Extract location mentions from text by matching against saved places
 */
export function extractLocationsFromText(text: string, savedPlaces: SavedPlace[]): LocationMatch[] {
  const matches: LocationMatch[] = [];
  const lowerText = text.toLowerCase();
  
  for (const place of savedPlaces) {
    const placeName = place.name.toLowerCase();
    const placeLabel = place.label?.toLowerCase();
    
    // Check for exact place name match
    let position = lowerText.indexOf(placeName);
    if (placeName.length > 2 && position !== -1) {
      matches.push({
        place,
        matchedText: placeName,
        confidence: CONFIDENCE_EXACT,
        position
      });
      continue;
    }
    
    // Check for label match if available
    if (placeLabel && placeLabel.length > 2) {
      position = lowerText.indexOf(placeLabel);
      if (position !== -1) {
        matches.push({
          place,
          matchedText: placeLabel,
          confidence: CONFIDENCE_EXACT,
          position
        });
        continue;
      }
    }
    
    // Check for partial address match (city names, etc.)
    if (place.address) {
      const addressParts = place.address.toLowerCase().split(/[,\s]+/).filter(p => p.length > 4);
      for (const part of addressParts) {
        const partRegex = new RegExp(`\\b${escapeRegex(part)}\\b`, 'gi');
        const partMatch = partRegex.exec(text);
        if (partMatch) {
          matches.push({
            place,
            matchedText: partMatch[0],
            confidence: CONFIDENCE_FUZZY,
            position: partMatch.index
          });
          break;
        }
      }
    }
  }
  
  // Remove duplicates (keep highest confidence)
  const uniqueMatches = new Map<string, LocationMatch>();
  for (const match of matches) {
    const existing = uniqueMatches.get(match.place.id);
    if (!existing || parseFloat(match.confidence) > parseFloat(existing.confidence)) {
      uniqueMatches.set(match.place.id, match);
    }
  }
  
  return Array.from(uniqueMatches.values());
}

/**
 * Extract date and time references from text using regex patterns
 */
export function extractDatesFromText(text: string): DateMatch[] {
  const matches: DateMatch[] = [];
  
  for (const { pattern, type } of DATE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags + 'g');
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      // Determine confidence based on pattern type
      let confidence = CONFIDENCE_PARTIAL;
      if (type === "iso" || type === "absolute") {
        confidence = CONFIDENCE_EXACT;
      } else if (type === "relative") {
        confidence = CONFIDENCE_PARTIAL;
      } else if (type === "time" || type === "weekday" || type === "numeric") {
        confidence = CONFIDENCE_FUZZY;
      }
      
      matches.push({
        text: match[0],
        type,
        confidence,
        position: match.index
      });
    }
  }
  
  // Remove overlapping matches (keep longer/higher confidence ones)
  const filteredMatches: DateMatch[] = [];
  for (const match of matches) {
    const overlaps = filteredMatches.some(existing => 
      (match.position >= existing.position && match.position < existing.position + existing.text.length) ||
      (existing.position >= match.position && existing.position < match.position + match.text.length)
    );
    
    if (!overlaps) {
      filteredMatches.push(match);
    }
  }
  
  return filteredMatches;
}

/**
 * Extract topics from text using keyword matching
 */
export function extractTopicsFromText(text: string): TopicMatch[] {
  const matches: TopicMatch[] = [];
  const lowerText = text.toLowerCase();
  const words = lowerText.split(/\s+/);
  
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    const foundKeywords: string[] = [];
    
    for (const keyword of keywords) {
      // Check if keyword exists in text (as word boundary)
      const keywordRegex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i');
      if (keywordRegex.test(lowerText)) {
        foundKeywords.push(keyword);
      }
    }
    
    if (foundKeywords.length > 0) {
      // Calculate confidence based on number of matching keywords
      let confidence = CONFIDENCE_FUZZY;
      if (foundKeywords.length >= 3) {
        confidence = CONFIDENCE_EXACT;
      } else if (foundKeywords.length >= 2) {
        confidence = CONFIDENCE_PARTIAL;
      }
      
      matches.push({
        topic,
        keywords: foundKeywords,
        confidence
      });
    }
  }
  
  // Sort by confidence (highest first)
  return matches.sort((a, b) => parseFloat(b.confidence) - parseFloat(a.confidence));
}

/**
 * Extract all entity types from text
 */
export async function extractAllFromText(text: string): Promise<ExtractionResult> {
  const contacts = await getAllContacts();
  const places = await getAllSavedPlaces();
  
  return {
    people: extractPeopleFromText(text, contacts),
    locations: extractLocationsFromText(text, places),
    dates: extractDatesFromText(text),
    topics: extractTopicsFromText(text)
  };
}

// ============================================
// ENTITY CREATION AND LINKING FUNCTIONS
// ============================================

/**
 * Find or create an entity for a person (contact)
 */
async function findOrCreatePersonEntity(contact: Contact): Promise<Entity> {
  const label = getContactFullName(contact);
  const existing = (await findEntitiesByLabel(label)).find(e => 
    e.type === "person" && e.canonicalId === contact.id
  );
  
  if (existing) {
    return existing;
  }
  
  return await createEntity({
    type: "person",
    label,
    canonicalId: contact.id,
    metadata: JSON.stringify({ phoneNumber: contact.phoneNumber, relationship: contact.relationship })
  });
}

/**
 * Find or create an entity for a location (saved place)
 */
async function findOrCreateLocationEntity(place: SavedPlace): Promise<Entity> {
  const label = place.label || place.name;
  const existing = (await findEntitiesByLabel(label)).find(e => 
    e.type === "location" && e.canonicalId === place.id
  );
  
  if (existing) {
    return existing;
  }
  
  return await createEntity({
    type: "location",
    label,
    canonicalId: place.id,
    metadata: JSON.stringify({ category: place.category, address: place.address })
  });
}

/**
 * Find or create an entity for a topic
 */
async function findOrCreateTopicEntity(topic: string): Promise<Entity> {
  const existing = (await findEntitiesByLabel(topic)).find(e => e.type === "topic");
  
  if (existing) {
    return existing;
  }
  
  return await createEntity({
    type: "topic",
    label: topic,
    canonicalId: null,
    metadata: null
  });
}

/**
 * Process a memory note for entities and create references
 */
export async function processMemoryForEntities(
  memoryId: string, 
  memoryContent: string, 
  conversationId?: string
): Promise<{ entities: Entity[]; references: EntityReference[] }> {
  const extraction = await extractAllFromText(memoryContent);
  const now = new Date().toISOString();
  const entities: Entity[] = [];
  const references: EntityReference[] = [];
  
  // Process people matches
  for (const personMatch of extraction.people) {
    const entity = await findOrCreatePersonEntity(personMatch.contact);
    entities.push(entity);
    
    const ref = await createEntityReference({
      entityId: entity.id,
      domain: "memory",
      itemId: memoryId,
      confidence: personMatch.confidence,
      extractedAt: now,
      context: personMatch.matchedText
    });
    references.push(ref);
  }
  
  // Process location matches
  for (const locationMatch of extraction.locations) {
    const entity = await findOrCreateLocationEntity(locationMatch.place);
    entities.push(entity);
    
    const ref = await createEntityReference({
      entityId: entity.id,
      domain: "memory",
      itemId: memoryId,
      confidence: locationMatch.confidence,
      extractedAt: now,
      context: locationMatch.matchedText
    });
    references.push(ref);
  }
  
  // Process topic matches
  for (const topicMatch of extraction.topics) {
    const entity = await findOrCreateTopicEntity(topicMatch.topic);
    entities.push(entity);
    
    const ref = await createEntityReference({
      entityId: entity.id,
      domain: "memory",
      itemId: memoryId,
      confidence: topicMatch.confidence,
      extractedAt: now,
      context: topicMatch.keywords.join(", ")
    });
    references.push(ref);
  }
  
  // Create links between co-occurring entities and track relationship strength
  if (entities.length > 1) {
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        await findOrCreateEntityLink(entities[i].id, entities[j].id, "same_subject");
        // Also track in memory relationships table for strength over time
        await findOrCreateMemoryRelationship(entities[i].id, entities[j].id);
      }
    }
  }
  
  // If there's a conversation ID, link memory entities to conversation
  if (conversationId) {
    const conversationEntities = await getEntitiesForItem("conversation", conversationId);
    for (const memoryEntity of entities) {
      for (const convEntity of conversationEntities) {
        if (memoryEntity.id !== convEntity.id) {
          await findOrCreateEntityLink(memoryEntity.id, convEntity.id, "derived_from");
        }
      }
    }
  }
  
  return { entities, references };
}

/**
 * Process a task for entities and create references
 */
export async function processTaskForEntities(
  taskId: string, 
  taskTitle: string, 
  taskDescription?: string
): Promise<{ entities: Entity[]; references: EntityReference[] }> {
  const fullText = taskDescription ? `${taskTitle} ${taskDescription}` : taskTitle;
  const extraction = await extractAllFromText(fullText);
  const now = new Date().toISOString();
  const entities: Entity[] = [];
  const references: EntityReference[] = [];
  
  // Process people matches
  for (const personMatch of extraction.people) {
    const entity = await findOrCreatePersonEntity(personMatch.contact);
    entities.push(entity);
    
    const ref = await createEntityReference({
      entityId: entity.id,
      domain: "task",
      itemId: taskId,
      confidence: personMatch.confidence,
      extractedAt: now,
      context: personMatch.matchedText
    });
    references.push(ref);
  }
  
  // Process location matches
  for (const locationMatch of extraction.locations) {
    const entity = await findOrCreateLocationEntity(locationMatch.place);
    entities.push(entity);
    
    const ref = await createEntityReference({
      entityId: entity.id,
      domain: "task",
      itemId: taskId,
      confidence: locationMatch.confidence,
      extractedAt: now,
      context: locationMatch.matchedText
    });
    references.push(ref);
  }
  
  // Process topic matches
  for (const topicMatch of extraction.topics) {
    const entity = await findOrCreateTopicEntity(topicMatch.topic);
    entities.push(entity);
    
    const ref = await createEntityReference({
      entityId: entity.id,
      domain: "task",
      itemId: taskId,
      confidence: topicMatch.confidence,
      extractedAt: now,
      context: topicMatch.keywords.join(", ")
    });
    references.push(ref);
  }
  
  // Create links between co-occurring entities
  if (entities.length > 1) {
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        await findOrCreateEntityLink(entities[i].id, entities[j].id, "same_subject");
      }
    }
  }
  
  return { entities, references };
}

/**
 * Process a conversation for entities and create references
 */
export async function processConversationForEntities(
  conversationId: string, 
  messages: Message[]
): Promise<{ entities: Entity[]; references: EntityReference[] }> {
  const now = new Date().toISOString();
  const allEntities: Entity[] = [];
  const allReferences: EntityReference[] = [];
  const seenEntityIds = new Set<string>();
  
  // Combine all message content for topic extraction
  const fullConversationText = messages.map(m => m.content).join(" ");
  const topicExtraction = extractTopicsFromText(fullConversationText);
  
  // Process each message for people and locations
  for (const message of messages) {
    const extraction = await extractAllFromText(message.content);
    
    // Process people matches
    for (const personMatch of extraction.people) {
      const entity = await findOrCreatePersonEntity(personMatch.contact);
      
      if (!seenEntityIds.has(entity.id)) {
        allEntities.push(entity);
        seenEntityIds.add(entity.id);
        
        const ref = await createEntityReference({
          entityId: entity.id,
          domain: "conversation",
          itemId: conversationId,
          confidence: personMatch.confidence,
          extractedAt: now,
          context: personMatch.matchedText
        });
        allReferences.push(ref);
      }
    }
    
    // Process location matches
    for (const locationMatch of extraction.locations) {
      const entity = await findOrCreateLocationEntity(locationMatch.place);
      
      if (!seenEntityIds.has(entity.id)) {
        allEntities.push(entity);
        seenEntityIds.add(entity.id);
        
        const ref = await createEntityReference({
          entityId: entity.id,
          domain: "conversation",
          itemId: conversationId,
          confidence: locationMatch.confidence,
          extractedAt: now,
          context: locationMatch.matchedText
        });
        allReferences.push(ref);
      }
    }
  }
  
  // Add topic entities for the whole conversation
  for (const topicMatch of topicExtraction) {
    const entity = await findOrCreateTopicEntity(topicMatch.topic);
    
    if (!seenEntityIds.has(entity.id)) {
      allEntities.push(entity);
      seenEntityIds.add(entity.id);
      
      const ref = await createEntityReference({
        entityId: entity.id,
        domain: "conversation",
        itemId: conversationId,
        confidence: topicMatch.confidence,
        extractedAt: now,
        context: topicMatch.keywords.join(", ")
      });
      allReferences.push(ref);
    }
  }
  
  // Create links between co-occurring entities in the conversation
  if (allEntities.length > 1) {
    for (let i = 0; i < allEntities.length; i++) {
      for (let j = i + 1; j < allEntities.length; j++) {
        await findOrCreateEntityLink(allEntities[i].id, allEntities[j].id, "same_subject");
      }
    }
  }
  
  return { entities: allEntities, references: allReferences };
}

// ============================================
// INTEGRATION HOOKS
// ============================================

/**
 * Hook called when a memory note is created
 */
export async function onMemoryCreated(memory: MemoryNote): Promise<void> {
  try {
    console.log(`[EntityExtractor] Processing memory: ${memory.id}`);
    const result = await processMemoryForEntities(
      memory.id, 
      memory.content,
      memory.sourceId || undefined
    );
    console.log(`[EntityExtractor] Extracted ${result.entities.length} entities from memory ${memory.id}`);
  } catch (error) {
    console.error(`[EntityExtractor] Error processing memory ${memory.id}:`, error);
  }
}

/**
 * Hook called when a task is created
 */
export async function onTaskCreated(task: Task): Promise<void> {
  try {
    console.log(`[EntityExtractor] Processing task: ${task.id}`);
    const result = await processTaskForEntities(
      task.id, 
      task.title, 
      task.description || undefined
    );
    console.log(`[EntityExtractor] Extracted ${result.entities.length} entities from task ${task.id}`);
  } catch (error) {
    console.error(`[EntityExtractor] Error processing task ${task.id}:`, error);
  }
}

/**
 * Hook called when a conversation is updated with new messages
 */
export async function onConversationUpdated(conversationId: string): Promise<void> {
  try {
    console.log(`[EntityExtractor] Processing conversation: ${conversationId}`);
    const messages = await getMessagesByConversation(conversationId);
    
    if (messages.length === 0) {
      console.log(`[EntityExtractor] No messages found for conversation ${conversationId}`);
      return;
    }
    
    const result = await processConversationForEntities(conversationId, messages);
    console.log(`[EntityExtractor] Extracted ${result.entities.length} entities from conversation ${conversationId}`);
  } catch (error) {
    console.error(`[EntityExtractor] Error processing conversation ${conversationId}:`, error);
  }
}

/**
 * Process a lifelog for entities and create references
 * Lifelogs are transcripts of conversations/meetings
 */
export async function processLifelogForEntities(
  lifelogId: string,
  title: string,
  transcriptText: string
): Promise<{ entities: Entity[]; references: EntityReference[] }> {
  const fullText = `${title} ${transcriptText}`;
  const extraction = await extractAllFromText(fullText);
  const now = new Date().toISOString();
  const entities: Entity[] = [];
  const references: EntityReference[] = [];
  
  // Process people matches
  for (const personMatch of extraction.people) {
    const entity = await findOrCreatePersonEntity(personMatch.contact);
    entities.push(entity);
    
    const ref = await createEntityReference({
      entityId: entity.id,
      domain: "lifelog",
      itemId: lifelogId,
      confidence: personMatch.confidence,
      extractedAt: now,
      context: personMatch.matchedText
    });
    references.push(ref);
  }
  
  // Process location matches
  for (const locationMatch of extraction.locations) {
    const entity = await findOrCreateLocationEntity(locationMatch.place);
    entities.push(entity);
    
    const ref = await createEntityReference({
      entityId: entity.id,
      domain: "lifelog",
      itemId: lifelogId,
      confidence: locationMatch.confidence,
      extractedAt: now,
      context: locationMatch.matchedText
    });
    references.push(ref);
  }
  
  // Process topic matches
  for (const topicMatch of extraction.topics) {
    const entity = await findOrCreateTopicEntity(topicMatch.topic);
    entities.push(entity);
    
    const ref = await createEntityReference({
      entityId: entity.id,
      domain: "lifelog",
      itemId: lifelogId,
      confidence: topicMatch.confidence,
      extractedAt: now,
      context: topicMatch.keywords.join(", ")
    });
    references.push(ref);
  }
  
  // Create links between co-occurring entities
  if (entities.length > 1) {
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        await findOrCreateEntityLink(entities[i].id, entities[j].id, "same_subject");
      }
    }
  }
  
  return { entities, references };
}

/**
 * Process a calendar event for entities and create references
 */
export async function processCalendarEventForEntities(
  eventId: string,
  summary: string,
  description?: string,
  location?: string
): Promise<{ entities: Entity[]; references: EntityReference[] }> {
  // Combine all text fields for extraction
  const fullText = [summary, description, location].filter(Boolean).join(" ");
  const extraction = await extractAllFromText(fullText);
  const now = new Date().toISOString();
  const entities: Entity[] = [];
  const references: EntityReference[] = [];
  
  // Process people matches
  for (const personMatch of extraction.people) {
    const entity = await findOrCreatePersonEntity(personMatch.contact);
    entities.push(entity);
    
    const ref = await createEntityReference({
      entityId: entity.id,
      domain: "calendar",
      itemId: eventId,
      confidence: personMatch.confidence,
      extractedAt: now,
      context: personMatch.matchedText
    });
    references.push(ref);
  }
  
  // Process location matches
  for (const locationMatch of extraction.locations) {
    const entity = await findOrCreateLocationEntity(locationMatch.place);
    entities.push(entity);
    
    const ref = await createEntityReference({
      entityId: entity.id,
      domain: "calendar",
      itemId: eventId,
      confidence: locationMatch.confidence,
      extractedAt: now,
      context: locationMatch.matchedText
    });
    references.push(ref);
  }
  
  // Process topic matches
  for (const topicMatch of extraction.topics) {
    const entity = await findOrCreateTopicEntity(topicMatch.topic);
    entities.push(entity);
    
    const ref = await createEntityReference({
      entityId: entity.id,
      domain: "calendar",
      itemId: eventId,
      confidence: topicMatch.confidence,
      extractedAt: now,
      context: topicMatch.keywords.join(", ")
    });
    references.push(ref);
  }
  
  // Create links between co-occurring entities
  if (entities.length > 1) {
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        await findOrCreateEntityLink(entities[i].id, entities[j].id, "same_subject");
      }
    }
  }
  
  return { entities, references };
}

/**
 * Process an SMS message for entities and create references
 */
export async function processSmsForEntities(
  messageId: string,
  messageContent: string,
  phoneNumber: string
): Promise<{ entities: Entity[]; references: EntityReference[] }> {
  const extraction = await extractAllFromText(messageContent);
  const now = new Date().toISOString();
  const entities: Entity[] = [];
  const references: EntityReference[] = [];
  
  // Try to link to contact by phone number
  const contacts = await getAllContacts();
  const matchingContact = contacts.find(c => 
    c.phoneNumber === phoneNumber || 
    c.phoneNumber.replace(/\D/g, '') === phoneNumber.replace(/\D/g, '')
  );
  
  if (matchingContact) {
    const contactEntity = await findOrCreatePersonEntity(matchingContact);
    entities.push(contactEntity);
    
    const ref = await createEntityReference({
      entityId: contactEntity.id,
      domain: "sms",
      itemId: messageId,
      confidence: CONFIDENCE_EXACT,
      extractedAt: now,
      context: `Phone: ${phoneNumber}`
    });
    references.push(ref);
  }
  
  // Process additional people mentions in message content
  for (const personMatch of extraction.people) {
    // Skip if already added via phone number match
    if (matchingContact && personMatch.contact.id === matchingContact.id) continue;
    
    const entity = await findOrCreatePersonEntity(personMatch.contact);
    entities.push(entity);
    
    const ref = await createEntityReference({
      entityId: entity.id,
      domain: "sms",
      itemId: messageId,
      confidence: personMatch.confidence,
      extractedAt: now,
      context: personMatch.matchedText
    });
    references.push(ref);
  }
  
  // Process location matches
  for (const locationMatch of extraction.locations) {
    const entity = await findOrCreateLocationEntity(locationMatch.place);
    entities.push(entity);
    
    const ref = await createEntityReference({
      entityId: entity.id,
      domain: "sms",
      itemId: messageId,
      confidence: locationMatch.confidence,
      extractedAt: now,
      context: locationMatch.matchedText
    });
    references.push(ref);
  }
  
  // Process topic matches
  for (const topicMatch of extraction.topics) {
    const entity = await findOrCreateTopicEntity(topicMatch.topic);
    entities.push(entity);
    
    const ref = await createEntityReference({
      entityId: entity.id,
      domain: "sms",
      itemId: messageId,
      confidence: topicMatch.confidence,
      extractedAt: now,
      context: topicMatch.keywords.join(", ")
    });
    references.push(ref);
  }
  
  // Create links between co-occurring entities
  if (entities.length > 1) {
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        await findOrCreateEntityLink(entities[i].id, entities[j].id, "same_subject");
      }
    }
  }
  
  return { entities, references };
}

/**
 * Hook called when a lifelog is processed
 */
export async function onLifelogProcessed(
  lifelogId: string,
  title: string,
  transcriptText: string
): Promise<void> {
  try {
    console.log(`[EntityExtractor] Processing lifelog: ${lifelogId}`);
    const result = await processLifelogForEntities(lifelogId, title, transcriptText);
    console.log(`[EntityExtractor] Extracted ${result.entities.length} entities from lifelog ${lifelogId}`);
  } catch (error) {
    console.error(`[EntityExtractor] Error processing lifelog ${lifelogId}:`, error);
  }
}

/**
 * Hook called when a calendar event is synced
 */
export async function onCalendarEventSynced(
  eventId: string,
  summary: string,
  description?: string,
  location?: string
): Promise<void> {
  try {
    console.log(`[EntityExtractor] Processing calendar event: ${eventId}`);
    const result = await processCalendarEventForEntities(eventId, summary, description, location);
    console.log(`[EntityExtractor] Extracted ${result.entities.length} entities from calendar event ${eventId}`);
  } catch (error) {
    console.error(`[EntityExtractor] Error processing calendar event ${eventId}:`, error);
  }
}

/**
 * Hook called when an SMS is received or sent
 */
export async function onSmsProcessed(
  messageId: string,
  messageContent: string,
  phoneNumber: string
): Promise<void> {
  try {
    console.log(`[EntityExtractor] Processing SMS: ${messageId}`);
    const result = await processSmsForEntities(messageId, messageContent, phoneNumber);
    console.log(`[EntityExtractor] Extracted ${result.entities.length} entities from SMS ${messageId}`);
  } catch (error) {
    console.error(`[EntityExtractor] Error processing SMS ${messageId}:`, error);
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get a summary of extraction results
 */
export function getExtractionSummary(result: ExtractionResult): string {
  const parts: string[] = [];
  
  if (result.people.length > 0) {
    parts.push(`${result.people.length} person(s): ${result.people.map(p => getContactFullName(p.contact)).join(", ")}`);
  }
  
  if (result.locations.length > 0) {
    parts.push(`${result.locations.length} location(s): ${result.locations.map(l => l.place.name).join(", ")}`);
  }
  
  if (result.dates.length > 0) {
    parts.push(`${result.dates.length} date/time reference(s): ${result.dates.map(d => d.text).join(", ")}`);
  }
  
  if (result.topics.length > 0) {
    parts.push(`${result.topics.length} topic(s): ${result.topics.map(t => t.topic).join(", ")}`);
  }
  
  return parts.length > 0 ? parts.join("; ") : "No entities extracted";
}

// ============================================
// CONTEXT CLASSIFICATION (GPT-4)
// ============================================

export interface ContextClassification {
  category: ContextCategory;
  confidence: number;
  reasoning: string;
}

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI | null {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      return null;
    }
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

/**
 * Classify the context category of a text using GPT-4
 * Falls back to rule-based classification if OpenAI is unavailable
 * Used for auto-tagging lifelogs/conversations for intelligent retrieval
 */
export async function classifyContextCategory(
  text: string,
  title?: string
): Promise<ContextClassification> {
  const client = getOpenAI();
  
  if (!client) {
    console.log("[EntityExtractor] OpenAI unavailable, using fast rule-based classifier");
    return classifyContextFast(text);
  }
  
  try {
    
    const categoriesDescription = contextCategories.map(c => {
      const descriptions: Record<string, string> = {
        business_call: "Professional phone calls, business meetings, client discussions",
        customer_issue: "Customer complaints, support issues, service problems",
        family_planning: "Family events, scheduling with family members, household planning",
        personal_idea: "Creative thoughts, personal projects, brainstorming",
        work_meeting: "Internal work meetings, team discussions, project planning",
        social_conversation: "Casual chats with friends, social events, gatherings",
        health_related: "Medical appointments, health discussions, fitness",
        financial_discussion: "Money matters, budgets, investments, bills",
        planning_logistics: "Travel planning, event logistics, coordination",
        learning_education: "Learning new skills, courses, educational content",
        casual_chat: "General small talk, everyday conversations",
        unknown: "Cannot be clearly categorized"
      };
      return `- ${c}: ${descriptions[c] || c}`;
    }).join("\n");

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a context classifier for a personal AI assistant's lifelog system.
Classify the given conversation/memory into ONE of these categories:

${categoriesDescription}

Return JSON: { "category": "<category>", "confidence": <0-1>, "reasoning": "<brief explanation>" }`
        },
        {
          role: "user",
          content: title ? `Title: ${title}\n\nContent:\n${text.slice(0, 2000)}` : text.slice(0, 2000)
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 150
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { category: "unknown", confidence: 0.5, reasoning: "No response from classifier" };
    }

    const result = JSON.parse(content);
    const category = contextCategories.includes(result.category) ? result.category : "unknown";
    
    return {
      category: category as ContextCategory,
      confidence: Math.min(1, Math.max(0, result.confidence || 0.5)),
      reasoning: result.reasoning || ""
    };
  } catch (error) {
    console.error("[EntityExtractor] Context classification error, falling back to rule-based:", error);
    return classifyContextFast(text);
  }
}

/**
 * Fast rule-based context classification (no API call)
 * Use as fallback or for quick pre-screening
 */
export function classifyContextFast(text: string): ContextClassification {
  const lowerText = text.toLowerCase();
  
  const patterns: Array<{ category: ContextCategory; keywords: string[]; weight: number }> = [
    { category: "business_call", keywords: ["client", "proposal", "contract", "invoice", "meeting with", "call with"], weight: 0.8 },
    { category: "customer_issue", keywords: ["complaint", "refund", "frustrated", "issue with", "problem with", "not working"], weight: 0.75 },
    { category: "family_planning", keywords: ["kids", "wife", "husband", "mom", "dad", "family dinner", "birthday party"], weight: 0.7 },
    { category: "personal_idea", keywords: ["i think", "idea for", "what if", "maybe i should", "brainstorm"], weight: 0.6 },
    { category: "work_meeting", keywords: ["standup", "sprint", "project update", "team meeting", "roadmap"], weight: 0.75 },
    { category: "health_related", keywords: ["doctor", "appointment", "medicine", "symptoms", "checkup", "therapy"], weight: 0.8 },
    { category: "financial_discussion", keywords: ["budget", "savings", "investment", "payment", "bill", "tax"], weight: 0.7 },
    { category: "planning_logistics", keywords: ["schedule", "booking", "reservation", "flight", "hotel", "pick up"], weight: 0.65 },
    { category: "learning_education", keywords: ["course", "tutorial", "learning", "study", "class", "lesson"], weight: 0.7 },
  ];

  let bestMatch: ContextClassification = { category: "casual_chat", confidence: 0.4, reasoning: "Default category" };
  let maxScore = 0;

  for (const { category, keywords, weight } of patterns) {
    const matchCount = keywords.filter(k => lowerText.includes(k)).length;
    if (matchCount > 0) {
      const score = (matchCount / keywords.length) * weight;
      if (score > maxScore) {
        maxScore = score;
        bestMatch = {
          category,
          confidence: Math.min(0.85, score + 0.3),
          reasoning: `Matched ${matchCount} keywords`
        };
      }
    }
  }

  return bestMatch;
}

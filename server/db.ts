import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { v4 as uuidv4 } from "uuid";
import { eq, sql, and, or, like, desc, asc, gte, lte, lt, gt, isNull, isNotNull, ne, inArray, notInArray } from "drizzle-orm";
import * as schema from "@shared/schema";
import type { 
  Conversation, 
  InsertConversation, 
  Message, 
  InsertMessage,
  MemoryNote,
  InsertMemoryNote,
  Preference,
  InsertPreference,
  GroceryItem,
  InsertGroceryItem,
  Reminder,
  InsertReminder,
  Task,
  InsertTask,
  UpdateTask,
  Contact,
  InsertContact,
  UpdateContact,
  AccessLevel,
  ContactNote,
  InsertContactNote,
  ContactNoteType,
  ContactFace,
  InsertContactFace,
  Automation,
  InsertAutomation,
  TwilioMessage,
  InsertTwilioMessage,
  TwilioMessageDirection,
  TwilioMessageStatus,
  TwilioMessageSource,
  OutboundMessage,
  InsertOutboundMessage,
  FeedbackEvent,
  InsertFeedbackEvent,
  ReactionType,
  LocationHistory,
  InsertLocationHistory,
  SavedPlace,
  InsertSavedPlace,
  UpdateSavedPlace,
  PlaceList,
  InsertPlaceList,
  UpdatePlaceList,
  PlaceListItem,
  InsertPlaceListItem,
  LocationSettings,
  InsertLocationSettings,
  ProximityAlert,
  InsertProximityAlert,
  LocationStateTracking,
  InsertLocationStateTracking,
  PlaceCategory,
  CustomList,
  InsertCustomList,
  UpdateCustomList,
  CustomListItem,
  InsertCustomListItem,
  UpdateCustomListItem,
  CustomListWithItems,
  CustomListType,
  CustomListItemPriority,
  FamilyMember,
  InsertFamilyMember,
  UpdateFamilyMember,
  FoodPreference,
  InsertFoodPreference,
  FoodItemType,
  FoodPreferenceLevel,
  DietaryRestriction,
  InsertDietaryRestriction,
  DietaryRestrictionType,
  DietaryRestrictionSeverity,
  MealHistory,
  InsertMealHistory,
  MealType,
  SavedRecipe,
  InsertSavedRecipe,
  UpdateSavedRecipe,
  RecipeMealType,
  ConversationMetric,
  InsertConversationMetric,
  ToolOutcome,
  ConversationQualityStats,
  MemoryWithConfidence,
  Entity,
  InsertEntity,
  EntityType,
  EntityReference,
  InsertEntityReference,
  EntityDomain,
  EntityLink,
  InsertEntityLink,
  EntityRelationshipType,
  EntityWithReferences,
  EntityWithLinks,
  Insight,
  InsertInsight,
  UpdateInsight,
  InsightType,
  InsightCategory,
  InsightPriority,
  InsightStatus,
  InsightStats,
  NotificationQueueItem,
  InsertNotificationQueue,
  NotificationPreferences,
  InsertNotificationPreferences,
  NotificationBatch,
  NotificationCategory,
  NotificationPriority,
  Meeting,
  InsertMeeting,
  LifelogActionItem,
  InsertLifelogActionItem,
  OmiAnalyticsDaily,
  InsertOmiAnalyticsDaily,
  Prediction,
  InsertPrediction,
  Pattern,
  InsertPattern,
  AnticipatoryAction,
  InsertAnticipatoryAction,
  PredictionFeedback,
  InsertPredictionFeedback,
  PredictionWithDetails,
  OmiWebhookLog,
  InsertOmiWebhookLog,
  OmiWebhookStatus,
  OmiTriggerType,
  ActionOutcome,
  InsertActionOutcome,
  FeedbackActionType,
  ActionOutcomeType,
  CorrectionEvent,
  InsertCorrectionEvent,
  CorrectionType,
  LearnedPreference,
  InsertLearnedPreference,
  UpdateLearnedPreference,
  LearnedPreferenceCategory,
  FeedbackLearningStats,
  Folder,
  InsertFolder,
  UpdateFolder,
  Document,
  InsertDocument,
  UpdateDocument,
  DocumentWithFolder,
  FolderWithChildren,
  DocumentType,
  UploadedFile,
  InsertUploadedFile,
  UpdateUploadedFile,
  UploadedFileType,
  FileProcessingStatus,
  JournalEntry,
  InsertJournalEntry,
  VerificationStatus,
  VerifiedBy,
  BatchJob,
  InsertBatchJob,
  BatchJobType,
  BatchJobStatus,
  BatchArtifact,
  InsertBatchArtifact,
  BatchArtifactType,
  BatchJobStats,
  SttSession,
  SttSegment,
  SttCodec,
  SttProvider,
  NewsTopic,
  InsertNewsTopic,
  NewsStory,
  InsertNewsStory,
  NewsFeedback,
  InsertNewsFeedback,
  NewsFeedbackType,
  BriefingSetting,
  InsertBriefingSetting,
  BriefingRecipient,
  InsertBriefingRecipient,
  BriefingType,
  BriefingDeliveryLog,
  InsertBriefingDeliveryLog,
  CalendarEvent,
} from "@shared/schema";
import { MASTER_ADMIN_PHONE, defaultPermissionsByLevel } from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

let cacheInvalidation: typeof import("./cacheInvalidation") | null = null;
async function getCacheInvalidation() {
  if (!cacheInvalidation) {
    cacheInvalidation = await import("./cacheInvalidation");
  }
  return cacheInvalidation;
}

function invalidateTaskCache() {
  getCacheInvalidation().then(m => m.onTaskChange()).catch(() => {});
}
function invalidateMemoryCache() {
  getCacheInvalidation().then(m => m.onMemoryChange()).catch(() => {});
}
function invalidateGroceryCache() {
  getCacheInvalidation().then(m => m.onGroceryChange()).catch(() => {});
}
function invalidateContactCache() {
  getCacheInvalidation().then(m => m.onContactChange()).catch(() => {});
}
function invalidateLocationCache() {
  getCacheInvalidation().then(m => m.onLocationChange()).catch(() => {});
}
function invalidateProfileCache() {
  getCacheInvalidation().then(m => m.onProfileChange()).catch(() => {});
}

export function getDb() {
  return db;
}

export class DatabaseError extends Error {
  constructor(message: string, public readonly operation: string, public readonly cause?: unknown) {
    super(message);
    this.name = "DatabaseError";
  }
}

async function wrapDbOperation<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw new DatabaseError(
      `Database operation failed: ${operation}`,
      operation,
      error
    );
  }
}

function getNow(): string {
  return new Date().toISOString();
}

export function parseEmbedding(embeddingStr: string | null): number[] | null {
  if (!embeddingStr) return null;
  try {
    return JSON.parse(embeddingStr);
  } catch {
    return null;
  }
}

export async function createConversation(data: InsertConversation): Promise<Conversation> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.conversations).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  const [result] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, id));
  return result;
}

export async function getAllConversations(): Promise<Conversation[]> {
  return await db.select().from(schema.conversations).orderBy(desc(schema.conversations.updatedAt));
}

export async function updateConversationTitle(id: string, title: string): Promise<Conversation | undefined> {
  const [result] = await db.update(schema.conversations)
    .set({ title, updatedAt: getNow() })
    .where(eq(schema.conversations.id, id))
    .returning();
  return result;
}

export async function updateConversationTimestamp(id: string): Promise<void> {
  await db.update(schema.conversations)
    .set({ updatedAt: getNow() })
    .where(eq(schema.conversations.id, id));
}

export async function updateConversationSummary(
  conversationId: string,
  summary: string,
  messageCount: number
): Promise<void> {
  await db.update(schema.conversations)
    .set({
      summary,
      summarizedMessageCount: messageCount,
      lastSummarizedAt: getNow(),
      updatedAt: getNow(),
    })
    .where(eq(schema.conversations.id, conversationId));
}

export async function getConversationsNeedingSummary(messageThreshold: number = 30): Promise<Array<{ conversationId: string; messageCount: number; summarizedCount: number }>> {
  const results = await db.execute(sql`
    SELECT 
      c.id as conversation_id,
      COUNT(m.id) as message_count,
      COALESCE(c.summarized_message_count, 0) as summarized_count
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    GROUP BY c.id
    HAVING COUNT(m.id) - COALESCE(c.summarized_message_count, 0) >= ${messageThreshold}
  `);
  return (results.rows as any[]).map(row => ({
    conversationId: row.conversation_id,
    messageCount: Number(row.message_count),
    summarizedCount: Number(row.summarized_count),
  }));
}

export async function deleteConversation(id: string): Promise<boolean> {
  const result = await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function createMessage(data: InsertMessage): Promise<Message> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.messages).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  await updateConversationTimestamp(data.conversationId);
  return result;
}

export async function getMessagesByConversation(conversationId: string): Promise<Message[]> {
  return await db.select().from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(asc(schema.messages.createdAt));
}

export async function getRecentMessages(conversationId: string, limit: number = 20): Promise<Message[]> {
  const results = await db.select().from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(desc(schema.messages.createdAt))
    .limit(limit);
  return results.reverse();
}

export async function deleteMessage(id: string): Promise<boolean> {
  const result = await db.delete(schema.messages).where(eq(schema.messages.id, id));
  return (result.rowCount ?? 0) > 0;
}

interface CreateMemoryNoteInput extends InsertMemoryNote {
  embedding?: number[] | null;
}

export async function createMemoryNote(data: CreateMemoryNoteInput): Promise<MemoryNote> {
  const now = getNow();
  const id = uuidv4();
  const embeddingStr = data.embedding ? JSON.stringify(data.embedding) : null;
  const [result] = await db.insert(schema.memoryNotes).values({
    ...data,
    id,
    embedding: embeddingStr,
    createdAt: now,
    updatedAt: now,
  }).returning();
  invalidateMemoryCache();
  return result;
}

export async function getMemoryNote(id: string): Promise<MemoryNote | undefined> {
  const [result] = await db.select().from(schema.memoryNotes).where(eq(schema.memoryNotes.id, id));
  return result;
}

export async function getAllMemoryNotes(includeSuperseded: boolean = false): Promise<MemoryNote[]> {
  if (includeSuperseded) {
    return await db.select().from(schema.memoryNotes).orderBy(desc(schema.memoryNotes.createdAt));
  }
  return await db.select().from(schema.memoryNotes)
    .where(eq(schema.memoryNotes.isSuperseded, false))
    .orderBy(desc(schema.memoryNotes.createdAt));
}

export async function getMemoryNotesByType(type: string, includeSuperseded: boolean = false): Promise<MemoryNote[]> {
  if (includeSuperseded) {
    return await db.select().from(schema.memoryNotes)
      .where(eq(schema.memoryNotes.type, type as any))
      .orderBy(desc(schema.memoryNotes.createdAt));
  }
  return await db.select().from(schema.memoryNotes)
    .where(and(eq(schema.memoryNotes.type, type as any), eq(schema.memoryNotes.isSuperseded, false)))
    .orderBy(desc(schema.memoryNotes.createdAt));
}

export async function updateMemoryNote(id: string, data: Partial<Pick<MemoryNote, "content" | "context">>): Promise<MemoryNote | undefined> {
  const [result] = await db.update(schema.memoryNotes)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.memoryNotes.id, id))
    .returning();
  invalidateMemoryCache();
  return result;
}

export async function updateMemoryNoteEmbedding(id: string, embedding: number[]): Promise<boolean> {
  const result = await db.update(schema.memoryNotes)
    .set({ embedding: JSON.stringify(embedding), updatedAt: getNow() })
    .where(eq(schema.memoryNotes.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function getMemoryNotesWithoutEmbeddings(): Promise<MemoryNote[]> {
  return await db.select().from(schema.memoryNotes)
    .where(and(isNull(schema.memoryNotes.embedding), eq(schema.memoryNotes.isSuperseded, false)))
    .limit(100);
}

export async function searchMemoryNotes(query: string): Promise<MemoryNote[]> {
  const searchPattern = `%${query}%`;
  return await db.select().from(schema.memoryNotes)
    .where(and(
      or(
        like(schema.memoryNotes.content, searchPattern),
        like(schema.memoryNotes.context, searchPattern)
      ),
      eq(schema.memoryNotes.isSuperseded, false)
    ))
    .orderBy(desc(schema.memoryNotes.createdAt));
}

export async function deleteMemoryNote(id: string): Promise<boolean> {
  const result = await db.delete(schema.memoryNotes).where(eq(schema.memoryNotes.id, id));
  invalidateMemoryCache();
  return (result.rowCount ?? 0) > 0;
}

export async function cleanupExpiredMemories(): Promise<{ deleted: number; errors: string[] }> {
  const now = getNow();
  const result = await db.delete(schema.memoryNotes)
    .where(and(
      lte(schema.memoryNotes.expiresAt, now),
      eq(schema.memoryNotes.isSuperseded, false)
    ));
  return { deleted: result.rowCount ?? 0, errors: [] };
}

export async function getMemoryScopeStats(): Promise<Record<string, number>> {
  const results = await db.execute(sql`
    SELECT scope, COUNT(*) as count
    FROM memory_notes
    WHERE is_superseded = false
    GROUP BY scope
  `);
  const stats: Record<string, number> = {};
  for (const row of results.rows as any[]) {
    stats[row.scope || 'long_term'] = Number(row.count);
  }
  return stats;
}

export async function updateMemoryScope(
  id: string,
  scope: string,
  expiresAt?: string | null
): Promise<boolean> {
  const result = await db.update(schema.memoryNotes)
    .set({ scope: scope as any, expiresAt, updatedAt: getNow() })
    .where(eq(schema.memoryNotes.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function setPreference(data: InsertPreference): Promise<Preference> {
  const now = getNow();
  const id = uuidv4();
  const existing = await getPreference(data.key);
  if (existing) {
    const [result] = await db.update(schema.preferences)
      .set({ value: data.value, updatedAt: now })
      .where(eq(schema.preferences.key, data.key))
      .returning();
    return result;
  }
  const [result] = await db.insert(schema.preferences).values({
    ...data,
    id,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getPreference(key: string): Promise<Preference | undefined> {
  const [result] = await db.select().from(schema.preferences).where(eq(schema.preferences.key, key));
  return result;
}

export async function updatePreference(key: string, value: string): Promise<Preference | undefined> {
  const [result] = await db.update(schema.preferences)
    .set({ value, updatedAt: getNow() })
    .where(eq(schema.preferences.key, key))
    .returning();
  return result;
}

export async function deletePreference(key: string): Promise<boolean> {
  const result = await db.delete(schema.preferences).where(eq(schema.preferences.key, key));
  return (result.rowCount ?? 0) > 0;
}

export async function getAllPreferences(): Promise<Preference[]> {
  return await db.select().from(schema.preferences);
}

export async function findOrCreateSmsConversation(phoneNumber: string): Promise<Conversation> {
  const existing = await getConversationByPhoneNumber(phoneNumber);
  if (existing) {
    return existing;
  }
  return await createConversation({
    title: `SMS: ${phoneNumber}`,
    phoneNumber,
    source: "sms",
    mode: "chat",
  });
}

export async function getConversationByPhoneNumber(phoneNumber: string): Promise<Conversation | undefined> {
  const [result] = await db.select().from(schema.conversations)
    .where(and(
      eq(schema.conversations.phoneNumber, phoneNumber),
      eq(schema.conversations.source, "sms")
    ));
  return result;
}

export async function findOrCreateUnifiedConversation(channel: 'web' | 'sms' | 'voice' | 'app' = 'web'): Promise<Conversation> {
  const prefKey = 'unified_conversation_id';
  const pref = await getPreference(prefKey);
  if (pref) {
    const existing = await getConversation(pref.value);
    if (existing) return existing;
  }
  const conv = await createConversation({
    title: 'Unified Conversation',
    source: channel,
    mode: 'chat',
  });
  await setPreference({ key: prefKey, value: conv.id });
  return conv;
}

export function isMasterAdminPhone(phoneNumber: string): boolean {
  if (!MASTER_ADMIN_PHONE || !phoneNumber) return false;
  const normalizedPhone = phoneNumber.replace(/\D/g, '');
  const normalizedMaster = MASTER_ADMIN_PHONE.replace(/\D/g, '');
  return normalizedPhone === normalizedMaster || normalizedPhone.endsWith(normalizedMaster);
}

export async function getUnifiedConversationId(): Promise<string> {
  const pref = await getPreference('unified_conversation_id');
  if (pref) return pref.value;
  const conv = await findOrCreateUnifiedConversation();
  return conv.id;
}

export async function createGroceryItem(data: InsertGroceryItem): Promise<GroceryItem> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.groceryItems).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  invalidateGroceryCache();
  return result;
}

export async function getAllGroceryItems(): Promise<GroceryItem[]> {
  return await db.select().from(schema.groceryItems).orderBy(desc(schema.groceryItems.createdAt));
}

export async function getGroceryItem(id: string): Promise<GroceryItem | undefined> {
  const [result] = await db.select().from(schema.groceryItems).where(eq(schema.groceryItems.id, id));
  return result;
}

export async function updateGroceryItem(id: string, data: Partial<Omit<GroceryItem, "id" | "createdAt" | "updatedAt">>): Promise<GroceryItem | undefined> {
  const [result] = await db.update(schema.groceryItems)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.groceryItems.id, id))
    .returning();
  invalidateGroceryCache();
  return result;
}

export async function toggleGroceryItemPurchased(id: string): Promise<GroceryItem | undefined> {
  const item = await getGroceryItem(id);
  if (!item) return undefined;
  const now = getNow();
  const [result] = await db.update(schema.groceryItems)
    .set({
      purchased: !item.purchased,
      purchasedAt: !item.purchased ? now : null,
      updatedAt: now,
    })
    .where(eq(schema.groceryItems.id, id))
    .returning();
  invalidateGroceryCache();
  return result;
}

export async function deleteGroceryItem(id: string): Promise<boolean> {
  const result = await db.delete(schema.groceryItems).where(eq(schema.groceryItems.id, id));
  invalidateGroceryCache();
  return (result.rowCount ?? 0) > 0;
}

export async function clearPurchasedGroceryItems(): Promise<number> {
  const purchased = await db.select().from(schema.groceryItems).where(eq(schema.groceryItems.purchased, true));
  for (const item of purchased) {
    await addToGroceryHistory({
      name: item.name,
      quantity: item.quantity || '1',
      category: item.category || 'Other',
      purchasedBy: item.addedBy,
    });
  }
  const result = await db.delete(schema.groceryItems).where(eq(schema.groceryItems.purchased, true));
  invalidateGroceryCache();
  return result.rowCount ?? 0;
}

export async function clearAllGroceryItems(): Promise<number> {
  const result = await db.delete(schema.groceryItems);
  invalidateGroceryCache();
  return result.rowCount ?? 0;
}

export async function getGroceryAutoClearHours(): Promise<number> {
  const pref = await getPreference('grocery_auto_clear_hours');
  return pref ? parseInt(pref.value, 10) : 24;
}

export async function setGroceryAutoClearHours(hours: number): Promise<void> {
  await setPreference({ key: 'grocery_auto_clear_hours', value: hours.toString() });
}

export async function clearOldPurchasedGroceryItems(olderThanHours: number): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();
  const oldPurchased = await db.select().from(schema.groceryItems)
    .where(and(
      eq(schema.groceryItems.purchased, true),
      lte(schema.groceryItems.purchasedAt, cutoff)
    ));
  for (const item of oldPurchased) {
    await addToGroceryHistory({
      name: item.name,
      quantity: item.quantity || '1',
      category: item.category || 'Other',
      purchasedBy: item.addedBy,
    });
  }
  const result = await db.delete(schema.groceryItems)
    .where(and(
      eq(schema.groceryItems.purchased, true),
      lte(schema.groceryItems.purchasedAt, cutoff)
    ));
  invalidateGroceryCache();
  return result.rowCount ?? 0;
}

export async function addToGroceryHistory(item: { name: string; quantity?: string; category?: string; purchasedBy: string }): Promise<typeof schema.groceryHistory.$inferSelect> {
  const now = getNow();
  const existing = await db.select().from(schema.groceryHistory)
    .where(eq(schema.groceryHistory.name, item.name.toLowerCase()))
    .limit(1);
  if (existing.length > 0) {
    const [result] = await db.update(schema.groceryHistory)
      .set({
        purchaseCount: existing[0].purchaseCount + 1,
        lastPurchasedAt: now,
        quantity: item.quantity || existing[0].quantity,
        category: item.category || existing[0].category,
      })
      .where(eq(schema.groceryHistory.id, existing[0].id))
      .returning();
    return result;
  }
  const id = uuidv4();
  const [result] = await db.insert(schema.groceryHistory).values({
    id,
    name: item.name.toLowerCase(),
    quantity: item.quantity || '1',
    category: item.category || 'Other',
    purchasedAt: now,
    purchasedBy: item.purchasedBy,
    purchaseCount: 1,
    lastPurchasedAt: now,
  }).returning();
  return result;
}

export async function getGroceryHistory(limit: number = 50): Promise<typeof schema.groceryHistory.$inferSelect[]> {
  return await db.select().from(schema.groceryHistory)
    .orderBy(desc(schema.groceryHistory.lastPurchasedAt))
    .limit(limit);
}

export async function getFrequentGroceryItems(limit: number = 20): Promise<typeof schema.groceryHistory.$inferSelect[]> {
  return await db.select().from(schema.groceryHistory)
    .orderBy(desc(schema.groceryHistory.purchaseCount))
    .limit(limit);
}

export async function searchGroceryHistory(query: string, limit: number = 10): Promise<typeof schema.groceryHistory.$inferSelect[]> {
  return await db.select().from(schema.groceryHistory)
    .where(like(schema.groceryHistory.name, `%${query.toLowerCase()}%`))
    .orderBy(desc(schema.groceryHistory.purchaseCount))
    .limit(limit);
}

export async function createReminder(data: InsertReminder): Promise<Reminder> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.reminders).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  return result;
}

export async function getReminderSequence(parentId: string): Promise<Reminder[]> {
  return await db.select().from(schema.reminders)
    .where(eq(schema.reminders.parentReminderId, parentId))
    .orderBy(asc(schema.reminders.sequencePosition));
}

export async function getReminder(id: string): Promise<Reminder | undefined> {
  const [result] = await db.select().from(schema.reminders).where(eq(schema.reminders.id, id));
  return result;
}

export async function getPendingReminders(): Promise<Reminder[]> {
  const now = getNow();
  return await db.select().from(schema.reminders)
    .where(and(
      eq(schema.reminders.completed, false),
      lte(schema.reminders.scheduledFor, now)
    ))
    .orderBy(asc(schema.reminders.scheduledFor));
}

export async function getAllReminders(): Promise<Reminder[]> {
  return await db.select().from(schema.reminders).orderBy(asc(schema.reminders.scheduledFor));
}

export async function updateReminderCompleted(id: string, completed: boolean): Promise<Reminder | undefined> {
  const [result] = await db.update(schema.reminders)
    .set({ completed })
    .where(eq(schema.reminders.id, id))
    .returning();
  return result;
}

export async function deleteReminder(id: string): Promise<boolean> {
  const result = await db.delete(schema.reminders).where(eq(schema.reminders.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function supersedeMemoryNote(oldNoteId: string, newNoteId: string): Promise<boolean> {
  const result = await db.update(schema.memoryNotes)
    .set({ isSuperseded: true, supersededBy: newNoteId, updatedAt: getNow() })
    .where(eq(schema.memoryNotes.id, oldNoteId));
  invalidateMemoryCache();
  return (result.rowCount ?? 0) > 0;
}

export async function findMemoryNoteByContent(searchContent: string): Promise<MemoryNote | undefined> {
  const [result] = await db.select().from(schema.memoryNotes)
    .where(and(
      like(schema.memoryNotes.content, `%${searchContent}%`),
      eq(schema.memoryNotes.isSuperseded, false)
    ))
    .limit(1);
  return result;
}

export async function createMemoryNoteWithSupersession(
  data: CreateMemoryNoteInput,
  supersededNoteId?: string
): Promise<MemoryNote> {
  const newNote = await createMemoryNote(data);
  if (supersededNoteId) {
    await supersedeMemoryNote(supersededNoteId, newNote.id);
  }
  return newNote;
}

export async function createTask(data: InsertTask): Promise<Task> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.tasks).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  invalidateTaskCache();
  return result;
}

export async function getTask(id: string): Promise<Task | undefined> {
  const [result] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
  return result;
}

export async function getAllTasks(includeCompleted: boolean = true): Promise<Task[]> {
  if (includeCompleted) {
    return await db.select().from(schema.tasks).orderBy(desc(schema.tasks.createdAt));
  }
  return await db.select().from(schema.tasks)
    .where(eq(schema.tasks.completed, false))
    .orderBy(desc(schema.tasks.createdAt));
}

export async function getTasks(includeCompleted: boolean = true): Promise<Task[]> {
  return await getAllTasks(includeCompleted);
}

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  return await db.select().from(schema.calendarEvents).orderBy(asc(schema.calendarEvents.start));
}

export async function getTasksByCategory(category: string, includeCompleted: boolean = true): Promise<Task[]> {
  if (includeCompleted) {
    return await db.select().from(schema.tasks)
      .where(eq(schema.tasks.category, category as any))
      .orderBy(desc(schema.tasks.createdAt));
  }
  return await db.select().from(schema.tasks)
    .where(and(eq(schema.tasks.category, category as any), eq(schema.tasks.completed, false)))
    .orderBy(desc(schema.tasks.createdAt));
}

export async function getTasksDueToday(): Promise<Task[]> {
  const today = new Date().toISOString().split('T')[0];
  return await db.select().from(schema.tasks)
    .where(and(
      eq(schema.tasks.dueDate, today),
      eq(schema.tasks.completed, false)
    ))
    .orderBy(asc(schema.tasks.dueDate));
}

export async function getOverdueTasks(): Promise<Task[]> {
  const today = new Date().toISOString().split('T')[0];
  return await db.select().from(schema.tasks)
    .where(and(
      lt(schema.tasks.dueDate, today),
      eq(schema.tasks.completed, false)
    ))
    .orderBy(asc(schema.tasks.dueDate));
}

export async function getTasksDueTomorrow(): Promise<Task[]> {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  return await db.select().from(schema.tasks)
    .where(and(
      eq(schema.tasks.dueDate, tomorrow),
      eq(schema.tasks.completed, false)
    ))
    .orderBy(asc(schema.tasks.dueDate));
}

export async function updateTask(id: string, data: UpdateTask): Promise<Task | undefined> {
  const [result] = await db.update(schema.tasks)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.tasks.id, id))
    .returning();
  invalidateTaskCache();
  return result;
}

export async function toggleTaskCompleted(id: string): Promise<Task | undefined> {
  const task = await getTask(id);
  if (!task) return undefined;
  const [result] = await db.update(schema.tasks)
    .set({ completed: !task.completed, updatedAt: getNow() })
    .where(eq(schema.tasks.id, id))
    .returning();
  invalidateTaskCache();
  return result;
}

export async function deleteTask(id: string): Promise<boolean> {
  const result = await db.delete(schema.tasks).where(eq(schema.tasks.id, id));
  invalidateTaskCache();
  return (result.rowCount ?? 0) > 0;
}

export async function clearCompletedTasks(): Promise<number> {
  const result = await db.delete(schema.tasks).where(eq(schema.tasks.completed, true));
  invalidateTaskCache();
  return result.rowCount ?? 0;
}

export async function searchTasks(query: string): Promise<Task[]> {
  const searchPattern = `%${query}%`;
  return await db.select().from(schema.tasks)
    .where(or(
      like(schema.tasks.title, searchPattern),
      like(schema.tasks.description, searchPattern)
    ))
    .orderBy(desc(schema.tasks.createdAt));
}

export async function getSubtasks(parentTaskId: string): Promise<Task[]> {
  return await db.select().from(schema.tasks)
    .where(eq(schema.tasks.parentTaskId, parentTaskId))
    .orderBy(asc(schema.tasks.createdAt));
}

interface TaskWithSubtasks extends Task {
  subtasks: Task[];
}

export async function getTaskWithSubtasks(taskId: string): Promise<TaskWithSubtasks | undefined> {
  const task = await getTask(taskId);
  if (!task) return undefined;
  const subtasks = await getSubtasks(taskId);
  return { ...task, subtasks };
}

export async function getParentTasks(): Promise<Task[]> {
  const result = await db.execute(sql`
    SELECT DISTINCT t.* FROM tasks t
    WHERE EXISTS (SELECT 1 FROM tasks sub WHERE sub.parent_task_id = t.id)
    ORDER BY t.created_at DESC
  `);
  return result.rows as Task[];
}

export async function getTopLevelTasks(includeCompleted: boolean = true): Promise<Task[]> {
  if (includeCompleted) {
    return await db.select().from(schema.tasks)
      .where(isNull(schema.tasks.parentTaskId))
      .orderBy(desc(schema.tasks.createdAt));
  }
  return await db.select().from(schema.tasks)
    .where(and(isNull(schema.tasks.parentTaskId), eq(schema.tasks.completed, false)))
    .orderBy(desc(schema.tasks.createdAt));
}

export function getContactFullName(contact: Contact): string {
  const parts = [contact.firstName];
  if (contact.middleName) parts.push(contact.middleName);
  parts.push(contact.lastName);
  return parts.filter(Boolean).join(" ");
}

export function normalizePhoneNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function isAutoGeneratedPhone(phone: string): boolean {
  return phone.startsWith('AUTO-');
}

export async function createContact(data: InsertContact): Promise<Contact> {
  const now = getNow();
  const id = uuidv4();
  const defaults = defaultPermissionsByLevel[data.accessLevel || 'unknown'];
  const [result] = await db.insert(schema.contacts).values({
    ...defaults,
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  invalidateContactCache();
  return result;
}

export async function getContact(id: string): Promise<Contact | undefined> {
  const [result] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, id));
  return result;
}

export async function getContactByPhone(phone: string): Promise<Contact | undefined> {
  const normalized = normalizePhoneNumber(phone);
  const contacts = await db.select().from(schema.contacts);
  return contacts.find(c => normalizePhoneNumber(c.phoneNumber) === normalized);
}

export async function getAllContacts(): Promise<Contact[]> {
  return await db.select().from(schema.contacts).orderBy(asc(schema.contacts.firstName));
}

export async function getContactsByAccessLevel(level: AccessLevel): Promise<Contact[]> {
  return await db.select().from(schema.contacts)
    .where(eq(schema.contacts.accessLevel, level))
    .orderBy(asc(schema.contacts.firstName));
}

export async function updateContact(id: string, data: UpdateContact): Promise<Contact | undefined> {
  const [result] = await db.update(schema.contacts)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.contacts.id, id))
    .returning();
  invalidateContactCache();
  return result;
}

export async function deleteContact(id: string): Promise<boolean> {
  await db.delete(schema.contactNotes).where(eq(schema.contactNotes.contactId, id));
  await db.delete(schema.contactFaces).where(eq(schema.contactFaces.contactId, id));
  const result = await db.delete(schema.contacts).where(eq(schema.contacts.id, id));
  invalidateContactCache();
  return (result.rowCount ?? 0) > 0;
}

export async function createContactNote(data: InsertContactNote): Promise<ContactNote> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.contactNotes).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  return result;
}

export async function getContactNotes(contactId: string): Promise<ContactNote[]> {
  return await db.select().from(schema.contactNotes)
    .where(eq(schema.contactNotes.contactId, contactId))
    .orderBy(desc(schema.contactNotes.createdAt));
}

export async function getContactNotesByType(contactId: string, noteType: ContactNoteType): Promise<ContactNote[]> {
  return await db.select().from(schema.contactNotes)
    .where(and(
      eq(schema.contactNotes.contactId, contactId),
      eq(schema.contactNotes.noteType, noteType)
    ))
    .orderBy(desc(schema.contactNotes.createdAt));
}

export async function deleteContactNote(id: string): Promise<boolean> {
  const result = await db.delete(schema.contactNotes).where(eq(schema.contactNotes.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function deleteAllContactNotes(contactId: string): Promise<number> {
  const result = await db.delete(schema.contactNotes).where(eq(schema.contactNotes.contactId, contactId));
  return result.rowCount ?? 0;
}

export async function createContactFace(data: InsertContactFace): Promise<ContactFace> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.contactFaces).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getContactFaces(contactId: string): Promise<ContactFace[]> {
  return await db.select().from(schema.contactFaces)
    .where(eq(schema.contactFaces.contactId, contactId))
    .orderBy(desc(schema.contactFaces.createdAt));
}

export async function getPrimaryContactFace(contactId: string): Promise<ContactFace | undefined> {
  const [result] = await db.select().from(schema.contactFaces)
    .where(and(
      eq(schema.contactFaces.contactId, contactId),
      eq(schema.contactFaces.isPrimary, true)
    ))
    .limit(1);
  return result;
}

export async function getAllContactFaces(): Promise<ContactFace[]> {
  return await db.select().from(schema.contactFaces).orderBy(desc(schema.contactFaces.createdAt));
}

export async function deleteContactFace(id: string): Promise<boolean> {
  const result = await db.delete(schema.contactFaces).where(eq(schema.contactFaces.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function deleteAllContactFaces(contactId: string): Promise<number> {
  const result = await db.delete(schema.contactFaces).where(eq(schema.contactFaces.contactId, contactId));
  return result.rowCount ?? 0;
}

export async function createCalendarEvent(data: typeof schema.calendarEvents.$inferInsert): Promise<CalendarEvent> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.calendarEvents).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getCalendarEvent(id: string): Promise<CalendarEvent | undefined> {
  const [result] = await db.select().from(schema.calendarEvents).where(eq(schema.calendarEvents.id, id));
  return result;
}

export async function updateCalendarEvent(id: string, data: Partial<CalendarEvent>): Promise<CalendarEvent | undefined> {
  const [result] = await db.update(schema.calendarEvents)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.calendarEvents.id, id))
    .returning();
  return result;
}

export async function deleteCalendarEvent(id: string): Promise<boolean> {
  const result = await db.delete(schema.calendarEvents).where(eq(schema.calendarEvents.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function getCalendarEventsInRange(start: string, end: string): Promise<CalendarEvent[]> {
  return await db.select().from(schema.calendarEvents)
    .where(and(
      gte(schema.calendarEvents.start, start),
      lte(schema.calendarEvents.start, end)
    ))
    .orderBy(asc(schema.calendarEvents.start));
}

export async function createLocationHistory(data: InsertLocationHistory): Promise<LocationHistory> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.locationHistory).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  invalidateLocationCache();
  return result;
}

export async function getLocationHistory(limit: number = 100): Promise<LocationHistory[]> {
  return await db.select().from(schema.locationHistory)
    .orderBy(desc(schema.locationHistory.createdAt))
    .limit(limit);
}

export async function getLatestLocation(): Promise<LocationHistory | undefined> {
  const [result] = await db.select().from(schema.locationHistory)
    .orderBy(desc(schema.locationHistory.createdAt))
    .limit(1);
  return result;
}

export async function createSavedPlace(data: InsertSavedPlace): Promise<SavedPlace> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.savedPlaces).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  invalidateLocationCache();
  return result;
}

export async function getSavedPlace(id: string): Promise<SavedPlace | undefined> {
  const [result] = await db.select().from(schema.savedPlaces).where(eq(schema.savedPlaces.id, id));
  return result;
}

export async function getAllSavedPlaces(): Promise<SavedPlace[]> {
  return await db.select().from(schema.savedPlaces).orderBy(asc(schema.savedPlaces.name));
}

export async function updateSavedPlace(id: string, data: UpdateSavedPlace): Promise<SavedPlace | undefined> {
  const [result] = await db.update(schema.savedPlaces)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.savedPlaces.id, id))
    .returning();
  invalidateLocationCache();
  return result;
}

export async function deleteSavedPlace(id: string): Promise<boolean> {
  const result = await db.delete(schema.savedPlaces).where(eq(schema.savedPlaces.id, id));
  invalidateLocationCache();
  return (result.rowCount ?? 0) > 0;
}

export async function createUploadedFile(data: InsertUploadedFile): Promise<UploadedFile> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.uploadedFiles).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getUploadedFile(id: string): Promise<UploadedFile | undefined> {
  const [result] = await db.select().from(schema.uploadedFiles).where(eq(schema.uploadedFiles.id, id));
  return result;
}

export async function updateUploadedFile(id: string, data: UpdateUploadedFile): Promise<UploadedFile | undefined> {
  const [result] = await db.update(schema.uploadedFiles)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.uploadedFiles.id, id))
    .returning();
  return result;
}

export async function deleteUploadedFile(id: string): Promise<boolean> {
  const result = await db.delete(schema.uploadedFiles).where(eq(schema.uploadedFiles.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function getUploadedFilesByConversation(conversationId: string): Promise<UploadedFile[]> {
  return await db.select().from(schema.uploadedFiles)
    .where(eq(schema.uploadedFiles.conversationId, conversationId))
    .orderBy(desc(schema.uploadedFiles.createdAt));
}

export async function getPendingUploadedFiles(): Promise<UploadedFile[]> {
  return await db.select().from(schema.uploadedFiles)
    .where(eq(schema.uploadedFiles.processingStatus, 'pending'))
    .orderBy(asc(schema.uploadedFiles.createdAt));
}

export async function createDocument(data: InsertDocument): Promise<Document> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.documents).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getDocument(id: string): Promise<Document | undefined> {
  const [result] = await db.select().from(schema.documents).where(eq(schema.documents.id, id));
  return result;
}

export async function getAllDocuments(): Promise<Document[]> {
  return await db.select().from(schema.documents)
    .where(eq(schema.documents.isArchived, false))
    .orderBy(desc(schema.documents.updatedAt));
}

export async function updateDocument(id: string, data: UpdateDocument): Promise<Document | undefined> {
  const [result] = await db.update(schema.documents)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.documents.id, id))
    .returning();
  return result;
}

export async function deleteDocument(id: string): Promise<boolean> {
  const result = await db.delete(schema.documents).where(eq(schema.documents.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function createFolder(data: InsertFolder): Promise<Folder> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.folders).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getFolder(id: string): Promise<Folder | undefined> {
  const [result] = await db.select().from(schema.folders).where(eq(schema.folders.id, id));
  return result;
}

export async function getAllFolders(): Promise<Folder[]> {
  return await db.select().from(schema.folders).orderBy(asc(schema.folders.name));
}

export async function updateFolder(id: string, data: UpdateFolder): Promise<Folder | undefined> {
  const [result] = await db.update(schema.folders)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.folders.id, id))
    .returning();
  return result;
}

export async function deleteFolder(id: string): Promise<boolean> {
  const result = await db.delete(schema.folders).where(eq(schema.folders.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function createFeedbackEvent(data: InsertFeedbackEvent): Promise<FeedbackEvent> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.feedbackEvents).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  return result;
}

export async function getFeedbackEvents(conversationId?: string): Promise<FeedbackEvent[]> {
  if (conversationId) {
    return await db.select().from(schema.feedbackEvents)
      .where(eq(schema.feedbackEvents.conversationId, conversationId))
      .orderBy(desc(schema.feedbackEvents.createdAt));
  }
  return await db.select().from(schema.feedbackEvents)
    .orderBy(desc(schema.feedbackEvents.createdAt));
}

export async function createTwilioMessage(data: InsertTwilioMessage): Promise<TwilioMessage> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.twilioMessages).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getTwilioMessage(id: string): Promise<TwilioMessage | undefined> {
  const [result] = await db.select().from(schema.twilioMessages).where(eq(schema.twilioMessages.id, id));
  return result;
}

export async function getTwilioMessageBySid(messageSid: string): Promise<TwilioMessage | undefined> {
  const [result] = await db.select().from(schema.twilioMessages)
    .where(eq(schema.twilioMessages.messageSid, messageSid));
  return result;
}

export async function updateTwilioMessageStatus(messageSid: string, status: TwilioMessageStatus): Promise<TwilioMessage | undefined> {
  const [result] = await db.update(schema.twilioMessages)
    .set({ status, updatedAt: getNow() })
    .where(eq(schema.twilioMessages.messageSid, messageSid))
    .returning();
  return result;
}

export async function createJournalEntry(data: InsertJournalEntry): Promise<JournalEntry> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.journalEntries).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getJournalEntry(id: string): Promise<JournalEntry | undefined> {
  const [result] = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, id));
  return result;
}

export async function getJournalEntryByDate(date: string): Promise<JournalEntry | undefined> {
  const [result] = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.date, date));
  return result;
}

export async function getAllJournalEntries(): Promise<JournalEntry[]> {
  return await db.select().from(schema.journalEntries).orderBy(desc(schema.journalEntries.date));
}

export async function createBatchJob(data: InsertBatchJob): Promise<BatchJob> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.batchJobs).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getBatchJob(id: string): Promise<BatchJob | undefined> {
  const [result] = await db.select().from(schema.batchJobs).where(eq(schema.batchJobs.id, id));
  return result;
}

export async function updateBatchJob(id: string, data: Partial<BatchJob>): Promise<BatchJob | undefined> {
  const [result] = await db.update(schema.batchJobs)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.batchJobs.id, id))
    .returning();
  return result;
}

export async function createBatchArtifact(data: InsertBatchArtifact): Promise<BatchArtifact> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.batchArtifacts).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  return result;
}

export async function getBatchArtifactsByJob(batchJobId: string): Promise<BatchArtifact[]> {
  return await db.select().from(schema.batchArtifacts)
    .where(eq(schema.batchArtifacts.batchJobId, batchJobId))
    .orderBy(desc(schema.batchArtifacts.createdAt));
}

export async function createSttSession(data: { codec: SttCodec; provider: SttProvider; conversationId?: string }): Promise<SttSession> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.sttSessions).values({
    ...data,
    id,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getSttSession(id: string): Promise<SttSession | undefined> {
  const [result] = await db.select().from(schema.sttSessions).where(eq(schema.sttSessions.id, id));
  return result;
}

export async function endSttSession(id: string, finalTranscript?: string): Promise<SttSession | undefined> {
  const [result] = await db.update(schema.sttSessions)
    .set({ 
      status: 'completed', 
      finalTranscript,
      endedAt: getNow(),
      updatedAt: getNow() 
    })
    .where(eq(schema.sttSessions.id, id))
    .returning();
  return result;
}

export async function createSttSegment(data: { sessionId: string; text: string; isFinal: boolean; confidence?: number; startMs?: number; endMs?: number }): Promise<SttSegment> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.sttSegments).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  return result;
}

export async function getDeviceTokenByToken(token: string): Promise<typeof schema.deviceTokens.$inferSelect | undefined> {
  const [result] = await db.select().from(schema.deviceTokens).where(eq(schema.deviceTokens.token, token));
  return result;
}

export async function createDeviceToken(data: { token: string; platform: string; deviceId?: string }): Promise<typeof schema.deviceTokens.$inferSelect> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.deviceTokens).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function updateDeviceToken(id: string, data: Partial<typeof schema.deviceTokens.$inferInsert>): Promise<typeof schema.deviceTokens.$inferSelect | undefined> {
  const [result] = await db.update(schema.deviceTokens)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.deviceTokens.id, id))
    .returning();
  return result;
}

export async function createAutomation(data: InsertAutomation): Promise<Automation> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.automations).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getAutomation(id: string): Promise<Automation | undefined> {
  const [result] = await db.select().from(schema.automations).where(eq(schema.automations.id, id));
  return result;
}

export async function getAllAutomations(): Promise<Automation[]> {
  return await db.select().from(schema.automations).orderBy(desc(schema.automations.createdAt));
}

export async function updateAutomation(id: string, data: Partial<Automation>): Promise<Automation | undefined> {
  const [result] = await db.update(schema.automations)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.automations.id, id))
    .returning();
  return result;
}

export async function deleteAutomation(id: string): Promise<boolean> {
  const result = await db.delete(schema.automations).where(eq(schema.automations.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function getEnabledAutomations(): Promise<Automation[]> {
  return await db.select().from(schema.automations)
    .where(eq(schema.automations.enabled, true))
    .orderBy(asc(schema.automations.name));
}

export async function createInsight(data: InsertInsight): Promise<Insight> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.insights).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getInsight(id: string): Promise<Insight | undefined> {
  const [result] = await db.select().from(schema.insights).where(eq(schema.insights.id, id));
  return result;
}

export async function getAllInsights(): Promise<Insight[]> {
  return await db.select().from(schema.insights).orderBy(desc(schema.insights.createdAt));
}

export async function updateInsight(id: string, data: UpdateInsight): Promise<Insight | undefined> {
  const [result] = await db.update(schema.insights)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.insights.id, id))
    .returning();
  return result;
}

export async function deleteInsight(id: string): Promise<boolean> {
  const result = await db.delete(schema.insights).where(eq(schema.insights.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function getActiveInsights(): Promise<Insight[]> {
  return await db.select().from(schema.insights)
    .where(eq(schema.insights.status, 'new'))
    .orderBy(desc(schema.insights.createdAt));
}

export async function createCoreConcept(data: typeof schema.coreConcepts.$inferInsert): Promise<typeof schema.coreConcepts.$inferSelect> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.coreConcepts).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getCoreConcept(id: string): Promise<typeof schema.coreConcepts.$inferSelect | undefined> {
  const [result] = await db.select().from(schema.coreConcepts).where(eq(schema.coreConcepts.id, id));
  return result;
}

export async function getAllCoreConcepts(): Promise<typeof schema.coreConcepts.$inferSelect[]> {
  return await db.select().from(schema.coreConcepts)
    .where(eq(schema.coreConcepts.isActive, true))
    .orderBy(desc(schema.coreConcepts.createdAt));
}

export async function updateCoreConcept(id: string, data: Partial<typeof schema.coreConcepts.$inferInsert>): Promise<typeof schema.coreConcepts.$inferSelect | undefined> {
  const [result] = await db.update(schema.coreConcepts)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.coreConcepts.id, id))
    .returning();
  return result;
}

export async function createEntity(data: InsertEntity): Promise<Entity> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.entities).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getEntity(id: string): Promise<Entity | undefined> {
  const [result] = await db.select().from(schema.entities).where(eq(schema.entities.id, id));
  return result;
}

export async function getAllEntities(): Promise<Entity[]> {
  return await db.select().from(schema.entities).orderBy(desc(schema.entities.createdAt));
}

export async function updateEntity(id: string, data: Partial<Entity>): Promise<Entity | undefined> {
  const [result] = await db.update(schema.entities)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.entities.id, id))
    .returning();
  return result;
}

export async function deleteEntity(id: string): Promise<boolean> {
  const result = await db.delete(schema.entities).where(eq(schema.entities.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function createEntityReference(data: InsertEntityReference): Promise<EntityReference> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.entityReferences).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  return result;
}

export async function getEntityReferences(entityId: string): Promise<EntityReference[]> {
  return await db.select().from(schema.entityReferences)
    .where(eq(schema.entityReferences.entityId, entityId))
    .orderBy(desc(schema.entityReferences.createdAt));
}

export async function createEntityLink(data: InsertEntityLink): Promise<EntityLink> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.entityLinks).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getEntityLinks(entityId: string): Promise<EntityLink[]> {
  return await db.select().from(schema.entityLinks)
    .where(or(
      eq(schema.entityLinks.sourceEntityId, entityId),
      eq(schema.entityLinks.targetEntityId, entityId)
    ))
    .orderBy(desc(schema.entityLinks.createdAt));
}

export async function createFamilyMember(data: InsertFamilyMember): Promise<FamilyMember> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.familyMembers).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getFamilyMember(id: string): Promise<FamilyMember | undefined> {
  const [result] = await db.select().from(schema.familyMembers).where(eq(schema.familyMembers.id, id));
  return result;
}

export async function getAllFamilyMembers(): Promise<FamilyMember[]> {
  return await db.select().from(schema.familyMembers).orderBy(asc(schema.familyMembers.name));
}

export async function updateFamilyMember(id: string, data: UpdateFamilyMember): Promise<FamilyMember | undefined> {
  const [result] = await db.update(schema.familyMembers)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.familyMembers.id, id))
    .returning();
  return result;
}

export async function deleteFamilyMember(id: string): Promise<boolean> {
  const result = await db.delete(schema.familyMembers).where(eq(schema.familyMembers.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function createCustomList(data: InsertCustomList): Promise<CustomList> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.customLists).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getCustomList(id: string): Promise<CustomList | undefined> {
  const [result] = await db.select().from(schema.customLists).where(eq(schema.customLists.id, id));
  return result;
}

export async function getAllCustomLists(): Promise<CustomList[]> {
  return await db.select().from(schema.customLists).orderBy(desc(schema.customLists.updatedAt));
}

export async function updateCustomList(id: string, data: UpdateCustomList): Promise<CustomList | undefined> {
  const [result] = await db.update(schema.customLists)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.customLists.id, id))
    .returning();
  return result;
}

export async function deleteCustomList(id: string): Promise<boolean> {
  await db.delete(schema.customListItems).where(eq(schema.customListItems.listId, id));
  const result = await db.delete(schema.customLists).where(eq(schema.customLists.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function createCustomListItem(data: InsertCustomListItem): Promise<CustomListItem> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.customListItems).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getCustomListItems(listId: string): Promise<CustomListItem[]> {
  return await db.select().from(schema.customListItems)
    .where(eq(schema.customListItems.listId, listId))
    .orderBy(asc(schema.customListItems.sortOrder));
}

export async function updateCustomListItem(id: string, data: UpdateCustomListItem): Promise<CustomListItem | undefined> {
  const [result] = await db.update(schema.customListItems)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.customListItems.id, id))
    .returning();
  return result;
}

export async function deleteCustomListItem(id: string): Promise<boolean> {
  const result = await db.delete(schema.customListItems).where(eq(schema.customListItems.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function getCustomListWithItems(id: string): Promise<CustomListWithItems | undefined> {
  const list = await getCustomList(id);
  if (!list) return undefined;
  const items = await getCustomListItems(id);
  return { ...list, items };
}

export async function createAiLog(data: typeof schema.aiLogs.$inferInsert): Promise<typeof schema.aiLogs.$inferSelect> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.aiLogs).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  return result;
}

export async function getAiLogs(limit: number = 100): Promise<typeof schema.aiLogs.$inferSelect[]> {
  return await db.select().from(schema.aiLogs)
    .orderBy(desc(schema.aiLogs.createdAt))
    .limit(limit);
}

export async function createOmiWebhookLog(data: InsertOmiWebhookLog): Promise<OmiWebhookLog> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.omiWebhookLogs).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  return result;
}

export async function getOmiWebhookLogs(limit: number = 100): Promise<OmiWebhookLog[]> {
  return await db.select().from(schema.omiWebhookLogs)
    .orderBy(desc(schema.omiWebhookLogs.createdAt))
    .limit(limit);
}

export async function createLifelog(data: typeof schema.lifelogs.$inferInsert): Promise<typeof schema.lifelogs.$inferSelect> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.lifelogs).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getLifelog(id: string): Promise<typeof schema.lifelogs.$inferSelect | undefined> {
  const [result] = await db.select().from(schema.lifelogs).where(eq(schema.lifelogs.id, id));
  return result;
}

export async function getAllLifelogs(limit: number = 100): Promise<typeof schema.lifelogs.$inferSelect[]> {
  return await db.select().from(schema.lifelogs)
    .orderBy(desc(schema.lifelogs.createdAt))
    .limit(limit);
}

export async function updateLifelog(id: string, data: Partial<typeof schema.lifelogs.$inferInsert>): Promise<typeof schema.lifelogs.$inferSelect | undefined> {
  const [result] = await db.update(schema.lifelogs)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.lifelogs.id, id))
    .returning();
  return result;
}

export async function getLifelogByOmiId(omiMemoryId: string): Promise<typeof schema.lifelogs.$inferSelect | undefined> {
  const [result] = await db.select().from(schema.lifelogs)
    .where(eq(schema.lifelogs.omiMemoryId, omiMemoryId));
  return result;
}

export async function createPrediction(data: InsertPrediction): Promise<Prediction> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.predictions).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getPrediction(id: string): Promise<Prediction | undefined> {
  const [result] = await db.select().from(schema.predictions).where(eq(schema.predictions.id, id));
  return result;
}

export async function getAllPredictions(): Promise<Prediction[]> {
  return await db.select().from(schema.predictions).orderBy(desc(schema.predictions.createdAt));
}

export async function updatePrediction(id: string, data: Partial<Prediction>): Promise<Prediction | undefined> {
  const [result] = await db.update(schema.predictions)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.predictions.id, id))
    .returning();
  return result;
}

export async function createPattern(data: InsertPattern): Promise<Pattern> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.patterns).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getPattern(id: string): Promise<Pattern | undefined> {
  const [result] = await db.select().from(schema.patterns).where(eq(schema.patterns.id, id));
  return result;
}

export async function getAllPatterns(): Promise<Pattern[]> {
  return await db.select().from(schema.patterns)
    .where(eq(schema.patterns.isActive, true))
    .orderBy(desc(schema.patterns.createdAt));
}

export async function updatePattern(id: string, data: Partial<Pattern>): Promise<Pattern | undefined> {
  const [result] = await db.update(schema.patterns)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.patterns.id, id))
    .returning();
  return result;
}

export async function createMeeting(data: InsertMeeting): Promise<Meeting> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.meetings).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getMeeting(id: string): Promise<Meeting | undefined> {
  const [result] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, id));
  return result;
}

export async function getAllMeetings(): Promise<Meeting[]> {
  return await db.select().from(schema.meetings).orderBy(desc(schema.meetings.startTime));
}

export async function createStoredImage(data: typeof schema.storedImages.$inferInsert): Promise<typeof schema.storedImages.$inferSelect> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.storedImages).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  return result;
}

export async function getStoredImage(id: string): Promise<typeof schema.storedImages.$inferSelect | undefined> {
  const [result] = await db.select().from(schema.storedImages).where(eq(schema.storedImages.id, id));
  return result;
}

export async function getAllStoredImages(limit: number = 100): Promise<typeof schema.storedImages.$inferSelect[]> {
  return await db.select().from(schema.storedImages)
    .orderBy(desc(schema.storedImages.createdAt))
    .limit(limit);
}

export async function createNewsTopic(data: InsertNewsTopic): Promise<NewsTopic> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.newsTopics).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getNewsTopic(id: string): Promise<NewsTopic | undefined> {
  const [result] = await db.select().from(schema.newsTopics).where(eq(schema.newsTopics.id, id));
  return result;
}

export async function getAllNewsTopics(): Promise<NewsTopic[]> {
  return await db.select().from(schema.newsTopics)
    .where(eq(schema.newsTopics.isActive, true))
    .orderBy(asc(schema.newsTopics.name));
}

export async function updateNewsTopic(id: string, data: Partial<NewsTopic>): Promise<NewsTopic | undefined> {
  const [result] = await db.update(schema.newsTopics)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.newsTopics.id, id))
    .returning();
  return result;
}

export async function deleteNewsTopic(id: string): Promise<boolean> {
  const result = await db.delete(schema.newsTopics).where(eq(schema.newsTopics.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function createNewsStory(data: InsertNewsStory): Promise<NewsStory> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.newsStories).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  return result;
}

export async function getNewsStory(id: string): Promise<NewsStory | undefined> {
  const [result] = await db.select().from(schema.newsStories).where(eq(schema.newsStories.id, id));
  return result;
}

export async function getRecentNewsStories(limit: number = 50): Promise<NewsStory[]> {
  return await db.select().from(schema.newsStories)
    .orderBy(desc(schema.newsStories.createdAt))
    .limit(limit);
}

export async function createBriefingSetting(data: InsertBriefingSetting): Promise<BriefingSetting> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.briefingSettings).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getBriefingSetting(id: string): Promise<BriefingSetting | undefined> {
  const [result] = await db.select().from(schema.briefingSettings).where(eq(schema.briefingSettings.id, id));
  return result;
}

export async function getAllBriefingSettings(): Promise<BriefingSetting[]> {
  return await db.select().from(schema.briefingSettings).orderBy(asc(schema.briefingSettings.name));
}

export async function updateBriefingSetting(id: string, data: Partial<BriefingSetting>): Promise<BriefingSetting | undefined> {
  const [result] = await db.update(schema.briefingSettings)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.briefingSettings.id, id))
    .returning();
  return result;
}

export async function deleteBriefingSetting(id: string): Promise<boolean> {
  const result = await db.delete(schema.briefingSettings).where(eq(schema.briefingSettings.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function createConversationMetric(data: InsertConversationMetric): Promise<ConversationMetric> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.conversationMetrics).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  return result;
}

export async function getConversationMetrics(conversationId: string): Promise<ConversationMetric[]> {
  return await db.select().from(schema.conversationMetrics)
    .where(eq(schema.conversationMetrics.conversationId, conversationId))
    .orderBy(desc(schema.conversationMetrics.createdAt));
}

export async function createLocationStateTracking(data: InsertLocationStateTracking): Promise<LocationStateTracking> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.locationStateTracking).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  return result;
}

export async function getLocationStateTrackingHistory(limit: number = 50): Promise<LocationStateTracking[]> {
  return await db.select().from(schema.locationStateTracking)
    .orderBy(desc(schema.locationStateTracking.createdAt))
    .limit(limit);
}

export async function createNLAutomation(data: typeof schema.nlAutomations.$inferInsert): Promise<typeof schema.nlAutomations.$inferSelect> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.nlAutomations).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getNLAutomation(id: string): Promise<typeof schema.nlAutomations.$inferSelect | undefined> {
  const [result] = await db.select().from(schema.nlAutomations).where(eq(schema.nlAutomations.id, id));
  return result;
}

export async function getAllNLAutomations(): Promise<typeof schema.nlAutomations.$inferSelect[]> {
  return await db.select().from(schema.nlAutomations).orderBy(desc(schema.nlAutomations.createdAt));
}

export async function updateNLAutomation(id: string, data: Partial<typeof schema.nlAutomations.$inferInsert>): Promise<typeof schema.nlAutomations.$inferSelect | undefined> {
  const [result] = await db.update(schema.nlAutomations)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.nlAutomations.id, id))
    .returning();
  return result;
}

export async function deleteNLAutomation(id: string): Promise<boolean> {
  const result = await db.delete(schema.nlAutomations).where(eq(schema.nlAutomations.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function getEnabledNLAutomations(): Promise<typeof schema.nlAutomations.$inferSelect[]> {
  return await db.select().from(schema.nlAutomations)
    .where(eq(schema.nlAutomations.enabled, true))
    .orderBy(asc(schema.nlAutomations.name));
}

export async function createLearnedPreference(data: InsertLearnedPreference): Promise<LearnedPreference> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.learnedPreferences).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getLearnedPreference(id: string): Promise<LearnedPreference | undefined> {
  const [result] = await db.select().from(schema.learnedPreferences).where(eq(schema.learnedPreferences.id, id));
  return result;
}

export async function getAllLearnedPreferences(): Promise<LearnedPreference[]> {
  return await db.select().from(schema.learnedPreferences)
    .where(eq(schema.learnedPreferences.isActive, true))
    .orderBy(desc(schema.learnedPreferences.createdAt));
}

export async function updateLearnedPreference(id: string, data: UpdateLearnedPreference): Promise<LearnedPreference | undefined> {
  const [result] = await db.update(schema.learnedPreferences)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.learnedPreferences.id, id))
    .returning();
  return result;
}

export async function createCorrectionEvent(data: InsertCorrectionEvent): Promise<CorrectionEvent> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.correctionEvents).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  return result;
}

export async function getCorrectionEvents(conversationId?: string): Promise<CorrectionEvent[]> {
  if (conversationId) {
    return await db.select().from(schema.correctionEvents)
      .where(eq(schema.correctionEvents.conversationId, conversationId))
      .orderBy(desc(schema.correctionEvents.createdAt));
  }
  return await db.select().from(schema.correctionEvents)
    .orderBy(desc(schema.correctionEvents.createdAt));
}

export async function createActionOutcome(data: InsertActionOutcome): Promise<ActionOutcome> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.actionOutcomes).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  return result;
}

export async function getActionOutcomes(limit: number = 100): Promise<ActionOutcome[]> {
  return await db.select().from(schema.actionOutcomes)
    .orderBy(desc(schema.actionOutcomes.createdAt))
    .limit(limit);
}

export async function createPlaceList(data: InsertPlaceList): Promise<PlaceList> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.placeLists).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getPlaceList(id: string): Promise<PlaceList | undefined> {
  const [result] = await db.select().from(schema.placeLists).where(eq(schema.placeLists.id, id));
  return result;
}

export async function getAllPlaceLists(): Promise<PlaceList[]> {
  return await db.select().from(schema.placeLists).orderBy(asc(schema.placeLists.name));
}

export async function updatePlaceList(id: string, data: UpdatePlaceList): Promise<PlaceList | undefined> {
  const [result] = await db.update(schema.placeLists)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.placeLists.id, id))
    .returning();
  return result;
}

export async function deletePlaceList(id: string): Promise<boolean> {
  await db.delete(schema.placeListItems).where(eq(schema.placeListItems.listId, id));
  const result = await db.delete(schema.placeLists).where(eq(schema.placeLists.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function createPlaceListItem(data: InsertPlaceListItem): Promise<PlaceListItem> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.placeListItems).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  return result;
}

export async function getPlaceListItems(listId: string): Promise<PlaceListItem[]> {
  return await db.select().from(schema.placeListItems)
    .where(eq(schema.placeListItems.listId, listId))
    .orderBy(asc(schema.placeListItems.sortOrder));
}

export async function deletePlaceListItem(id: string): Promise<boolean> {
  const result = await db.delete(schema.placeListItems).where(eq(schema.placeListItems.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function createProximityAlert(data: InsertProximityAlert): Promise<ProximityAlert> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.proximityAlerts).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  return result;
}

export async function getProximityAlert(id: string): Promise<ProximityAlert | undefined> {
  const [result] = await db.select().from(schema.proximityAlerts).where(eq(schema.proximityAlerts.id, id));
  return result;
}

export async function getAllProximityAlerts(): Promise<ProximityAlert[]> {
  return await db.select().from(schema.proximityAlerts).orderBy(desc(schema.proximityAlerts.createdAt));
}

export async function updateProximityAlert(id: string, data: Partial<ProximityAlert>): Promise<ProximityAlert | undefined> {
  const [result] = await db.update(schema.proximityAlerts)
    .set(data)
    .where(eq(schema.proximityAlerts.id, id))
    .returning();
  return result;
}

export async function deleteProximityAlert(id: string): Promise<boolean> {
  const result = await db.delete(schema.proximityAlerts).where(eq(schema.proximityAlerts.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function getActiveProximityAlerts(): Promise<ProximityAlert[]> {
  return await db.select().from(schema.proximityAlerts)
    .where(eq(schema.proximityAlerts.triggered, false))
    .orderBy(desc(schema.proximityAlerts.createdAt));
}

export async function createFoodPreference(data: InsertFoodPreference): Promise<FoodPreference> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.foodPreferences).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getFoodPreference(id: string): Promise<FoodPreference | undefined> {
  const [result] = await db.select().from(schema.foodPreferences).where(eq(schema.foodPreferences.id, id));
  return result;
}

export async function getAllFoodPreferences(): Promise<FoodPreference[]> {
  return await db.select().from(schema.foodPreferences).orderBy(asc(schema.foodPreferences.itemName));
}

export async function getFoodPreferencesByMember(familyMemberId: string): Promise<FoodPreference[]> {
  return await db.select().from(schema.foodPreferences)
    .where(eq(schema.foodPreferences.familyMemberId, familyMemberId))
    .orderBy(asc(schema.foodPreferences.itemName));
}

export async function updateFoodPreference(id: string, data: Partial<FoodPreference>): Promise<FoodPreference | undefined> {
  const [result] = await db.update(schema.foodPreferences)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.foodPreferences.id, id))
    .returning();
  return result;
}

export async function deleteFoodPreference(id: string): Promise<boolean> {
  const result = await db.delete(schema.foodPreferences).where(eq(schema.foodPreferences.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function createDietaryRestriction(data: InsertDietaryRestriction): Promise<DietaryRestriction> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.dietaryRestrictions).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getDietaryRestriction(id: string): Promise<DietaryRestriction | undefined> {
  const [result] = await db.select().from(schema.dietaryRestrictions).where(eq(schema.dietaryRestrictions.id, id));
  return result;
}

export async function getAllDietaryRestrictions(): Promise<DietaryRestriction[]> {
  return await db.select().from(schema.dietaryRestrictions).orderBy(asc(schema.dietaryRestrictions.restrictionName));
}

export async function getDietaryRestrictionsByMember(familyMemberId: string): Promise<DietaryRestriction[]> {
  return await db.select().from(schema.dietaryRestrictions)
    .where(eq(schema.dietaryRestrictions.familyMemberId, familyMemberId))
    .orderBy(asc(schema.dietaryRestrictions.restrictionName));
}

export async function updateDietaryRestriction(id: string, data: Partial<DietaryRestriction>): Promise<DietaryRestriction | undefined> {
  const [result] = await db.update(schema.dietaryRestrictions)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.dietaryRestrictions.id, id))
    .returning();
  return result;
}

export async function deleteDietaryRestriction(id: string): Promise<boolean> {
  const result = await db.delete(schema.dietaryRestrictions).where(eq(schema.dietaryRestrictions.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function createMealHistory(data: InsertMealHistory): Promise<MealHistory> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.mealHistory).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  return result;
}

export async function getMealHistory(limit: number = 50): Promise<MealHistory[]> {
  return await db.select().from(schema.mealHistory)
    .orderBy(desc(schema.mealHistory.cookedAt))
    .limit(limit);
}

export async function createSavedRecipe(data: InsertSavedRecipe): Promise<SavedRecipe> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.savedRecipes).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getSavedRecipe(id: string): Promise<SavedRecipe | undefined> {
  const [result] = await db.select().from(schema.savedRecipes).where(eq(schema.savedRecipes.id, id));
  return result;
}

export async function getAllSavedRecipes(): Promise<SavedRecipe[]> {
  return await db.select().from(schema.savedRecipes).orderBy(asc(schema.savedRecipes.name));
}

export async function updateSavedRecipe(id: string, data: UpdateSavedRecipe): Promise<SavedRecipe | undefined> {
  const [result] = await db.update(schema.savedRecipes)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.savedRecipes.id, id))
    .returning();
  return result;
}

export async function deleteSavedRecipe(id: string): Promise<boolean> {
  const result = await db.delete(schema.savedRecipes).where(eq(schema.savedRecipes.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function searchSavedRecipes(query: string): Promise<SavedRecipe[]> {
  const searchPattern = `%${query}%`;
  return await db.select().from(schema.savedRecipes)
    .where(or(
      like(schema.savedRecipes.name, searchPattern),
      like(schema.savedRecipes.description, searchPattern)
    ))
    .orderBy(asc(schema.savedRecipes.name));
}

export async function createOutboundMessage(data: InsertOutboundMessage): Promise<OutboundMessage> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.outboundMessages).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getOutboundMessage(id: string): Promise<OutboundMessage | undefined> {
  const [result] = await db.select().from(schema.outboundMessages).where(eq(schema.outboundMessages.id, id));
  return result;
}

export async function getOutboundMessagesByPhone(phoneNumber: string, limit: number = 50): Promise<OutboundMessage[]> {
  return await db.select().from(schema.outboundMessages)
    .where(eq(schema.outboundMessages.toPhone, phoneNumber))
    .orderBy(desc(schema.outboundMessages.createdAt))
    .limit(limit);
}

export async function updateOutboundMessage(id: string, data: Partial<OutboundMessage>): Promise<OutboundMessage | undefined> {
  const [result] = await db.update(schema.outboundMessages)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.outboundMessages.id, id))
    .returning();
  return result;
}

export async function createLocationSettings(data: InsertLocationSettings): Promise<LocationSettings> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.locationSettings).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getLocationSettings(): Promise<LocationSettings | undefined> {
  const [result] = await db.select().from(schema.locationSettings).limit(1);
  return result;
}

export async function updateLocationSettings(id: string, data: Partial<LocationSettings>): Promise<LocationSettings | undefined> {
  const [result] = await db.update(schema.locationSettings)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.locationSettings.id, id))
    .returning();
  return result;
}

export async function createNotificationQueueItem(data: InsertNotificationQueue): Promise<NotificationQueueItem> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.notificationQueue).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  return result;
}

export async function getPendingNotifications(): Promise<NotificationQueueItem[]> {
  return await db.select().from(schema.notificationQueue)
    .where(eq(schema.notificationQueue.status, 'pending'))
    .orderBy(asc(schema.notificationQueue.createdAt));
}

export async function updateNotificationQueueItem(id: string, data: Partial<NotificationQueueItem>): Promise<NotificationQueueItem | undefined> {
  const [result] = await db.update(schema.notificationQueue)
    .set(data)
    .where(eq(schema.notificationQueue.id, id))
    .returning();
  return result;
}

export async function createOmiAnalyticsDaily(data: InsertOmiAnalyticsDaily): Promise<OmiAnalyticsDaily> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.omiAnalyticsDaily).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getOmiAnalyticsDaily(date: string): Promise<OmiAnalyticsDaily | undefined> {
  const [result] = await db.select().from(schema.omiAnalyticsDaily)
    .where(eq(schema.omiAnalyticsDaily.date, date));
  return result;
}

export async function updateOmiAnalyticsDaily(id: string, data: Partial<OmiAnalyticsDaily>): Promise<OmiAnalyticsDaily | undefined> {
  const [result] = await db.update(schema.omiAnalyticsDaily)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.omiAnalyticsDaily.id, id))
    .returning();
  return result;
}

export async function createLifelogActionItem(data: InsertLifelogActionItem): Promise<LifelogActionItem> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.lifelogActionItems).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  return result;
}

export async function getLifelogActionItems(lifelogId: string): Promise<LifelogActionItem[]> {
  return await db.select().from(schema.lifelogActionItems)
    .where(eq(schema.lifelogActionItems.lifelogId, lifelogId))
    .orderBy(asc(schema.lifelogActionItems.createdAt));
}

export async function getPendingLifelogActionItems(): Promise<LifelogActionItem[]> {
  return await db.select().from(schema.lifelogActionItems)
    .where(eq(schema.lifelogActionItems.status, 'pending'))
    .orderBy(asc(schema.lifelogActionItems.createdAt));
}

export async function updateLifelogActionItem(id: string, data: Partial<LifelogActionItem>): Promise<LifelogActionItem | undefined> {
  const [result] = await db.update(schema.lifelogActionItems)
    .set(data)
    .where(eq(schema.lifelogActionItems.id, id))
    .returning();
  return result;
}

export async function createAnticipatoryAction(data: InsertAnticipatoryAction): Promise<AnticipatoryAction> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.anticipatoryActions).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  return result;
}

export async function getAnticipatoryActions(predictionId: string): Promise<AnticipatoryAction[]> {
  return await db.select().from(schema.anticipatoryActions)
    .where(eq(schema.anticipatoryActions.predictionId, predictionId))
    .orderBy(desc(schema.anticipatoryActions.createdAt));
}

export async function updateAnticipatoryAction(id: string, data: Partial<AnticipatoryAction>): Promise<AnticipatoryAction | undefined> {
  const [result] = await db.update(schema.anticipatoryActions)
    .set(data)
    .where(eq(schema.anticipatoryActions.id, id))
    .returning();
  return result;
}

export async function createPredictionFeedback(data: InsertPredictionFeedback): Promise<PredictionFeedback> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.predictionFeedback).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  return result;
}

export async function getPredictionFeedback(predictionId: string): Promise<PredictionFeedback[]> {
  return await db.select().from(schema.predictionFeedback)
    .where(eq(schema.predictionFeedback.predictionId, predictionId))
    .orderBy(desc(schema.predictionFeedback.createdAt));
}

export async function createNewsFeedback(data: InsertNewsFeedback): Promise<NewsFeedback> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.newsFeedback).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  return result;
}

export async function getNewsFeedback(storyId: string): Promise<NewsFeedback[]> {
  return await db.select().from(schema.newsFeedback)
    .where(eq(schema.newsFeedback.storyId, storyId))
    .orderBy(desc(schema.newsFeedback.createdAt));
}

export async function createBriefingRecipient(data: InsertBriefingRecipient): Promise<BriefingRecipient> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.briefingRecipients).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getBriefingRecipients(briefingId: string): Promise<BriefingRecipient[]> {
  return await db.select().from(schema.briefingRecipients)
    .where(eq(schema.briefingRecipients.briefingId, briefingId))
    .orderBy(asc(schema.briefingRecipients.createdAt));
}

export async function updateBriefingRecipient(id: string, data: Partial<BriefingRecipient>): Promise<BriefingRecipient | undefined> {
  const [result] = await db.update(schema.briefingRecipients)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.briefingRecipients.id, id))
    .returning();
  return result;
}

export async function deleteBriefingRecipient(id: string): Promise<boolean> {
  const result = await db.delete(schema.briefingRecipients).where(eq(schema.briefingRecipients.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function createBriefingDeliveryLog(data: InsertBriefingDeliveryLog): Promise<BriefingDeliveryLog> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.briefingDeliveryLogs).values({
    ...data,
    id,
    createdAt: now,
  }).returning();
  return result;
}

export async function getBriefingDeliveryLogs(briefingId: string): Promise<BriefingDeliveryLog[]> {
  return await db.select().from(schema.briefingDeliveryLogs)
    .where(eq(schema.briefingDeliveryLogs.briefingId, briefingId))
    .orderBy(desc(schema.briefingDeliveryLogs.createdAt));
}

export async function getBatchJobByIdempotencyKey(key: string): Promise<BatchJob | undefined> {
  const [result] = await db.select().from(schema.batchJobs)
    .where(eq(schema.batchJobs.idempotencyKey, key));
  return result;
}

export async function getPendingBatchJobs(): Promise<BatchJob[]> {
  return await db.select().from(schema.batchJobs)
    .where(eq(schema.batchJobs.status, 'QUEUED'))
    .orderBy(asc(schema.batchJobs.createdAt));
}

export async function getUnprocessedBatchArtifacts(artifactType: BatchArtifactType): Promise<BatchArtifact[]> {
  return await db.select().from(schema.batchArtifacts)
    .where(and(
      eq(schema.batchArtifacts.artifactType, artifactType),
      eq(schema.batchArtifacts.isProcessed, false)
    ))
    .orderBy(asc(schema.batchArtifacts.createdAt));
}

export async function markBatchArtifactProcessed(id: string): Promise<BatchArtifact | undefined> {
  const [result] = await db.update(schema.batchArtifacts)
    .set({ isProcessed: true, processedAt: getNow() })
    .where(eq(schema.batchArtifacts.id, id))
    .returning();
  return result;
}

export async function getRecentBatchJobs(limit: number = 20): Promise<BatchJob[]> {
  return await db.select().from(schema.batchJobs)
    .orderBy(desc(schema.batchJobs.createdAt))
    .limit(limit);
}

export async function getBatchModelConfig(jobType: string): Promise<typeof schema.batchModelConfigs.$inferSelect | undefined> {
  const [result] = await db.select().from(schema.batchModelConfigs)
    .where(eq(schema.batchModelConfigs.jobType, jobType));
  return result;
}

export async function createBatchModelConfig(data: typeof schema.batchModelConfigs.$inferInsert): Promise<typeof schema.batchModelConfigs.$inferSelect> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.batchModelConfigs).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function updateBatchModelConfig(id: string, data: Partial<typeof schema.batchModelConfigs.$inferInsert>): Promise<typeof schema.batchModelConfigs.$inferSelect | undefined> {
  const [result] = await db.update(schema.batchModelConfigs)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.batchModelConfigs.id, id))
    .returning();
  return result;
}

export async function getLocationHistoryInRange(start: string, end: string): Promise<LocationHistory[]> {
  return await db.select().from(schema.locationHistory)
    .where(and(
      gte(schema.locationHistory.createdAt, start),
      lte(schema.locationHistory.createdAt, end)
    ))
    .orderBy(desc(schema.locationHistory.createdAt));
}

export async function getMessagesInRange(start: string, end: string): Promise<Message[]> {
  return await db.select().from(schema.messages)
    .where(and(
      gte(schema.messages.createdAt, start),
      lte(schema.messages.createdAt, end)
    ))
    .orderBy(asc(schema.messages.createdAt));
}

export async function getTasksCreatedInRange(start: string, end: string): Promise<Task[]> {
  return await db.select().from(schema.tasks)
    .where(and(
      gte(schema.tasks.createdAt, start),
      lte(schema.tasks.createdAt, end)
    ))
    .orderBy(asc(schema.tasks.createdAt));
}

export async function getMemoryNotesCreatedInRange(start: string, end: string): Promise<MemoryNote[]> {
  return await db.select().from(schema.memoryNotes)
    .where(and(
      gte(schema.memoryNotes.createdAt, start),
      lte(schema.memoryNotes.createdAt, end)
    ))
    .orderBy(asc(schema.memoryNotes.createdAt));
}

export async function getLifelogsInRange(start: string, end: string): Promise<typeof schema.lifelogs.$inferSelect[]> {
  return await db.select().from(schema.lifelogs)
    .where(and(
      gte(schema.lifelogs.createdAt, start),
      lte(schema.lifelogs.createdAt, end)
    ))
    .orderBy(asc(schema.lifelogs.createdAt));
}

export async function findSimilarContact(name: string): Promise<Contact | undefined> {
  const contacts = await getAllContacts();
  const lowerName = name.toLowerCase();
  const exactMatch = contacts.find(c => c.firstName.toLowerCase() === lowerName);
  if (exactMatch) return exactMatch;
  const firstName = name.split(' ')[0].toLowerCase();
  if (firstName.length >= 3) {
    const partialMatch = contacts.find(c => c.firstName.toLowerCase().startsWith(firstName));
    if (partialMatch) return partialMatch;
  }
  return undefined;
}

export async function getActionOutcomeByActionId(actionId: string): Promise<ActionOutcome | undefined> {
  const [result] = await db.select().from(schema.actionOutcomes)
    .where(eq(schema.actionOutcomes.actionId, actionId));
  return result;
}

export async function updateReminder(id: string, data: Partial<{message: string, scheduledFor: string, recipientPhone: string}>): Promise<Reminder | undefined> {
  const [result] = await db.update(schema.reminders)
    .set(data)
    .where(eq(schema.reminders.id, id))
    .returning();
  return result;
}

export async function getActionOutcome(id: string): Promise<ActionOutcome | undefined> {
  const [result] = await db.select().from(schema.actionOutcomes).where(eq(schema.actionOutcomes.id, id));
  return result;
}

export async function updateActionOutcome(id: string, outcomeType: ActionOutcomeType, modifiedValue?: string): Promise<ActionOutcome | undefined> {
  const now = getNow();
  const existing = await getActionOutcome(id);
  if (!existing) return undefined;
  const createdAt = new Date(existing.createdAt).getTime();
  const outcomeAt = new Date(now).getTime();
  const timeToOutcomeMinutes = Math.round((outcomeAt - createdAt) / 60000);
  const isQuick = timeToOutcomeMinutes <= 5;
  const [result] = await db.update(schema.actionOutcomes)
    .set({
      outcomeType,
      timeToOutcomeMinutes,
      wasModifiedQuickly: outcomeType === "modified" && isQuick,
      wasDeletedQuickly: outcomeType === "deleted" && isQuick,
      modifiedValue: modifiedValue || null,
      outcomeAt: now,
    })
    .where(eq(schema.actionOutcomes.id, id))
    .returning();
  return result;
}

export async function getRecentActionOutcomes(limit: number = 50): Promise<ActionOutcome[]> {
  return await db.select().from(schema.actionOutcomes)
    .orderBy(desc(schema.actionOutcomes.createdAt))
    .limit(limit);
}

export async function getActionOutcomeStats(): Promise<{ quickModifications: number; quickDeletions: number; total: number }> {
  const outcomes = await db.select().from(schema.actionOutcomes);
  return {
    quickModifications: outcomes.filter(o => o.wasModifiedQuickly).length,
    quickDeletions: outcomes.filter(o => o.wasDeletedQuickly).length,
    total: outcomes.length,
  };
}

export async function getNotificationPreferences(): Promise<NotificationPreferences | undefined> {
  const [result] = await db.select().from(schema.notificationPreferences).limit(1);
  return result;
}

export async function createNotificationPreferences(data: InsertNotificationPreferences): Promise<NotificationPreferences> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.notificationPreferences).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function updateNotificationPreferences(id: string, data: Partial<NotificationPreferences>): Promise<NotificationPreferences | undefined> {
  const [result] = await db.update(schema.notificationPreferences)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.notificationPreferences.id, id))
    .returning();
  return result;
}

export async function getActiveReminders(): Promise<Reminder[]> {
  return await db.select().from(schema.reminders)
    .where(eq(schema.reminders.completed, false))
    .orderBy(asc(schema.reminders.scheduledFor));
}

export async function getUpcomingReminders(beforeTime: string): Promise<Reminder[]> {
  return await db.select().from(schema.reminders)
    .where(and(
      eq(schema.reminders.completed, false),
      lte(schema.reminders.scheduledFor, beforeTime)
    ))
    .orderBy(asc(schema.reminders.scheduledFor));
}

export async function completeReminder(id: string): Promise<Reminder | undefined> {
  const [result] = await db.update(schema.reminders)
    .set({ completed: true })
    .where(eq(schema.reminders.id, id))
    .returning();
  return result;
}

export async function getRemindersByPhone(phone: string): Promise<Reminder[]> {
  return await db.select().from(schema.reminders)
    .where(eq(schema.reminders.recipientPhone, phone))
    .orderBy(asc(schema.reminders.scheduledFor));
}

export async function getMemoryNotesByPlaceId(placeId: string): Promise<MemoryNote[]> {
  return await db.select().from(schema.memoryNotes)
    .where(and(
      eq(schema.memoryNotes.placeId, placeId),
      eq(schema.memoryNotes.isSuperseded, false)
    ))
    .orderBy(desc(schema.memoryNotes.createdAt));
}

export async function getMemoryNotesByContactId(contactId: string): Promise<MemoryNote[]> {
  return await db.select().from(schema.memoryNotes)
    .where(and(
      eq(schema.memoryNotes.contactId, contactId),
      eq(schema.memoryNotes.isSuperseded, false)
    ))
    .orderBy(desc(schema.memoryNotes.createdAt));
}

export async function updateMemoryNoteConfidence(id: string, confidenceScore: string): Promise<boolean> {
  const result = await db.update(schema.memoryNotes)
    .set({ confidenceScore, updatedAt: getNow() })
    .where(eq(schema.memoryNotes.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function incrementMemoryNoteUsage(id: string): Promise<boolean> {
  const note = await getMemoryNote(id);
  if (!note) return false;
  const result = await db.update(schema.memoryNotes)
    .set({
      usageCount: (note.usageCount || 0) + 1,
      lastUsedAt: getNow(),
      updatedAt: getNow(),
    })
    .where(eq(schema.memoryNotes.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function incrementMemoryNoteAccess(id: string): Promise<boolean> {
  const note = await getMemoryNote(id);
  if (!note) return false;
  const result = await db.update(schema.memoryNotes)
    .set({
      accessCount: (note.accessCount || 0) + 1,
      lastAccessedAt: getNow(),
      updatedAt: getNow(),
    })
    .where(eq(schema.memoryNotes.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function updateMemoryNoteHeat(id: string, heatScore: string): Promise<boolean> {
  const result = await db.update(schema.memoryNotes)
    .set({ heatScore, updatedAt: getNow() })
    .where(eq(schema.memoryNotes.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function getActiveMemoryNotes(): Promise<MemoryNote[]> {
  return await db.select().from(schema.memoryNotes)
    .where(and(
      eq(schema.memoryNotes.isActive, true),
      eq(schema.memoryNotes.isSuperseded, false)
    ))
    .orderBy(desc(schema.memoryNotes.createdAt));
}

export async function getMemoriesWithEmbeddings(): Promise<MemoryNote[]> {
  return await db.select().from(schema.memoryNotes)
    .where(and(
      sql`${schema.memoryNotes.embedding} IS NOT NULL`,
      eq(schema.memoryNotes.isSuperseded, false)
    ))
    .orderBy(desc(schema.memoryNotes.createdAt));
}

export async function getHighConfidenceMemories(minConfidence: number = 0.7): Promise<MemoryNote[]> {
  return await db.select().from(schema.memoryNotes)
    .where(and(
      gte(schema.memoryNotes.confidenceScore, minConfidence.toString()),
      eq(schema.memoryNotes.isSuperseded, false)
    ))
    .orderBy(desc(schema.memoryNotes.createdAt));
}

export async function getHotMemories(minHeat: number = 0.5, limit: number = 50): Promise<MemoryNote[]> {
  return await db.select().from(schema.memoryNotes)
    .where(and(
      gte(schema.memoryNotes.heatScore, minHeat.toString()),
      eq(schema.memoryNotes.isSuperseded, false)
    ))
    .orderBy(desc(schema.memoryNotes.heatScore))
    .limit(limit);
}

export async function confirmMemoryNote(id: string): Promise<boolean> {
  const note = await getMemoryNote(id);
  if (!note) return false;
  const result = await db.update(schema.memoryNotes)
    .set({
      lastConfirmedAt: getNow(),
      confirmationCount: (note.confirmationCount || 0) + 1,
      updatedAt: getNow(),
    })
    .where(eq(schema.memoryNotes.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function getRecentCorrectionEvents(limit: number = 50): Promise<CorrectionEvent[]> {
  return await db.select().from(schema.correctionEvents)
    .orderBy(desc(schema.correctionEvents.createdAt))
    .limit(limit);
}

export async function getLearnedPreferenceByKey(key: string): Promise<LearnedPreference | undefined> {
  const [result] = await db.select().from(schema.learnedPreferences)
    .where(eq(schema.learnedPreferences.preferenceKey, key));
  return result;
}

export async function getActiveLearnedPreferences(): Promise<LearnedPreference[]> {
  return await db.select().from(schema.learnedPreferences)
    .where(eq(schema.learnedPreferences.isActive, true))
    .orderBy(desc(schema.learnedPreferences.createdAt));
}

export async function getHighConfidencePreferences(minConfidence: number = 0.7): Promise<LearnedPreference[]> {
  return await db.select().from(schema.learnedPreferences)
    .where(and(
      eq(schema.learnedPreferences.isActive, true),
      gte(schema.learnedPreferences.confidenceScore, minConfidence.toString())
    ))
    .orderBy(desc(schema.learnedPreferences.confidenceScore));
}

export async function reinforceLearnedPreference(id: string): Promise<LearnedPreference | undefined> {
  const pref = await getLearnedPreference(id);
  if (!pref) return undefined;
  const newConfidence = Math.min(1, parseFloat(pref.confidenceScore || '0.5') + 0.1);
  const [result] = await db.update(schema.learnedPreferences)
    .set({
      confidenceScore: newConfidence.toFixed(2),
      appliedCount: (pref.appliedCount || 0) + 1,
      lastAppliedAt: getNow(),
      updatedAt: getNow(),
    })
    .where(eq(schema.learnedPreferences.id, id))
    .returning();
  return result;
}

export async function supersedPreference(oldId: string, newId: string): Promise<boolean> {
  const result = await db.update(schema.learnedPreferences)
    .set({ isActive: false, supersededBy: newId, updatedAt: getNow() })
    .where(eq(schema.learnedPreferences.id, oldId));
  return (result.rowCount ?? 0) > 0;
}

export async function getFeedbackLearningStats(): Promise<FeedbackLearningStats> {
  const [prefs, corrections, outcomes] = await Promise.all([
    db.select().from(schema.learnedPreferences),
    db.select().from(schema.correctionEvents),
    db.select().from(schema.actionOutcomes),
  ]);
  
  const activePrefs = prefs.filter(p => p.isActive);
  const avgConfidence = activePrefs.length > 0
    ? activePrefs.reduce((sum, p) => sum + parseFloat(p.confidenceScore || '0'), 0) / activePrefs.length
    : 0;
  
  return {
    totalPreferences: prefs.length,
    activePreferences: activePrefs.length,
    supersededPreferences: prefs.filter(p => !p.isActive).length,
    averageConfidence: parseFloat(avgConfidence.toFixed(3)),
    totalCorrections: corrections.length,
    recentCorrections: corrections.filter(c => {
      const date = new Date(c.createdAt);
      return date > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }).length,
    totalOutcomes: outcomes.length,
    quickModifications: outcomes.filter(o => o.wasModifiedQuickly).length,
    quickDeletions: outcomes.filter(o => o.wasDeletedQuickly).length,
  };
}

export async function getSavedPlaceByName(name: string): Promise<SavedPlace | undefined> {
  const [result] = await db.select().from(schema.savedPlaces)
    .where(eq(schema.savedPlaces.name, name));
  return result;
}

export async function getTwilioMessagesByPhone(phone: string, limit: number = 50): Promise<TwilioMessage[]> {
  return await db.select().from(schema.twilioMessages)
    .where(or(
      eq(schema.twilioMessages.fromPhone, phone),
      eq(schema.twilioMessages.toPhone, phone)
    ))
    .orderBy(desc(schema.twilioMessages.createdAt))
    .limit(limit);
}

export async function getRecentTwilioMessages(limit: number = 50): Promise<TwilioMessage[]> {
  return await db.select().from(schema.twilioMessages)
    .orderBy(desc(schema.twilioMessages.createdAt))
    .limit(limit);
}

export async function getGroceryItemsByCategory(category: string): Promise<GroceryItem[]> {
  return await db.select().from(schema.groceryItems)
    .where(eq(schema.groceryItems.category, category))
    .orderBy(desc(schema.groceryItems.createdAt));
}

export async function getUnpurchasedGroceryItems(): Promise<GroceryItem[]> {
  return await db.select().from(schema.groceryItems)
    .where(eq(schema.groceryItems.purchased, false))
    .orderBy(desc(schema.groceryItems.createdAt));
}

export async function markContactFaceAsPrimary(id: string): Promise<ContactFace | undefined> {
  const face = await db.select().from(schema.contactFaces).where(eq(schema.contactFaces.id, id));
  if (face.length === 0) return undefined;
  
  await db.update(schema.contactFaces)
    .set({ isPrimary: false })
    .where(eq(schema.contactFaces.contactId, face[0].contactId));
  
  const [result] = await db.update(schema.contactFaces)
    .set({ isPrimary: true, updatedAt: getNow() })
    .where(eq(schema.contactFaces.id, id))
    .returning();
  return result;
}

export async function updateContactFace(id: string, data: Partial<ContactFace>): Promise<ContactFace | undefined> {
  const [result] = await db.update(schema.contactFaces)
    .set({ ...data, updatedAt: getNow() })
    .where(eq(schema.contactFaces.id, id))
    .returning();
  return result;
}

export async function getContactWithNotes(contactId: string): Promise<{ contact: Contact; notes: ContactNote[] } | undefined> {
  const contact = await getContact(contactId);
  if (!contact) return undefined;
  const notes = await getContactNotes(contactId);
  return { contact, notes };
}

export async function incrementContactInteractionCount(id: string): Promise<boolean> {
  const contact = await getContact(id);
  if (!contact) return false;
  const result = await db.update(schema.contacts)
    .set({
      interactionCount: (contact.interactionCount || 0) + 1,
      lastInteractionAt: getNow(),
      updatedAt: getNow(),
    })
    .where(eq(schema.contacts.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function getContactsByRelationship(relationship: string): Promise<Contact[]> {
  return await db.select().from(schema.contacts)
    .where(eq(schema.contacts.relationship, relationship as any))
    .orderBy(asc(schema.contacts.firstName));
}

export async function searchContacts(query: string): Promise<Contact[]> {
  const searchPattern = `%${query}%`;
  return await db.select().from(schema.contacts)
    .where(or(
      like(schema.contacts.firstName, searchPattern),
      like(schema.contacts.lastName, searchPattern),
      like(schema.contacts.phoneNumber, searchPattern),
      like(schema.contacts.email, searchPattern)
    ))
    .orderBy(asc(schema.contacts.firstName));
}

export async function getRecentContacts(limit: number = 10): Promise<Contact[]> {
  return await db.select().from(schema.contacts)
    .orderBy(desc(schema.contacts.lastInteractionAt))
    .limit(limit);
}

export async function getTasksDueInRange(start: string, end: string): Promise<Task[]> {
  return await db.select().from(schema.tasks)
    .where(and(
      gte(schema.tasks.dueDate, start),
      lte(schema.tasks.dueDate, end),
      eq(schema.tasks.completed, false)
    ))
    .orderBy(asc(schema.tasks.dueDate));
}

export async function getTasksByPriority(priority: string): Promise<Task[]> {
  return await db.select().from(schema.tasks)
    .where(and(
      eq(schema.tasks.priority, priority as any),
      eq(schema.tasks.completed, false)
    ))
    .orderBy(desc(schema.tasks.createdAt));
}

export async function getCompletedTasks(limit: number = 50): Promise<Task[]> {
  return await db.select().from(schema.tasks)
    .where(eq(schema.tasks.completed, true))
    .orderBy(desc(schema.tasks.updatedAt))
    .limit(limit);
}

export async function getLastNMessages(conversationId: string, n: number): Promise<Message[]> {
  return await getRecentMessages(conversationId, n);
}

export async function countMessages(conversationId: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(*) as count FROM messages WHERE conversation_id = ${conversationId}
  `);
  return parseInt((result.rows[0] as any)?.count || '0', 10);
}

export async function getSavedPlacesByCategory(category: PlaceCategory): Promise<SavedPlace[]> {
  return await db.select().from(schema.savedPlaces)
    .where(eq(schema.savedPlaces.category, category))
    .orderBy(asc(schema.savedPlaces.name));
}

export async function getDocumentsByFolder(folderId: string): Promise<Document[]> {
  return await db.select().from(schema.documents)
    .where(and(
      eq(schema.documents.folderId, folderId),
      eq(schema.documents.isArchived, false)
    ))
    .orderBy(desc(schema.documents.updatedAt));
}

export async function searchDocuments(query: string): Promise<Document[]> {
  const searchPattern = `%${query}%`;
  return await db.select().from(schema.documents)
    .where(and(
      or(
        like(schema.documents.title, searchPattern),
        like(schema.documents.content, searchPattern)
      ),
      eq(schema.documents.isArchived, false)
    ))
    .orderBy(desc(schema.documents.updatedAt));
}

export async function archiveDocument(id: string): Promise<Document | undefined> {
  const [result] = await db.update(schema.documents)
    .set({ isArchived: true, updatedAt: getNow() })
    .where(eq(schema.documents.id, id))
    .returning();
  return result;
}

export async function getActivePredictions(): Promise<Prediction[]> {
  return await db.select().from(schema.predictions)
    .where(eq(schema.predictions.status, 'pending'))
    .orderBy(desc(schema.predictions.createdAt));
}

export async function getRecentPatterns(limit: number = 20): Promise<Pattern[]> {
  return await db.select().from(schema.patterns)
    .where(eq(schema.patterns.isActive, true))
    .orderBy(desc(schema.patterns.createdAt))
    .limit(limit);
}

export async function findEntitiesByLabel(label: string): Promise<Entity[]> {
  const searchPattern = `%${label}%`;
  return await db.select().from(schema.entities)
    .where(like(schema.entities.label, searchPattern))
    .orderBy(desc(schema.entities.createdAt));
}

export async function getEntitiesForItem(domain: EntityDomain, itemId: string): Promise<Entity[]> {
  const refs = await db.select().from(schema.entityReferences)
    .where(and(
      eq(schema.entityReferences.sourceDomain, domain),
      eq(schema.entityReferences.sourceId, itemId)
    ));
  if (refs.length === 0) return [];
  const entityIds = refs.map(r => r.entityId);
  return await db.select().from(schema.entities)
    .where(sql`${schema.entities.id} IN (${sql.join(entityIds.map(id => sql`${id}`), sql`, `)})`);
}

export async function findOrCreateEntityLink(entity1Id: string, entity2Id: string, relationshipType: EntityRelationshipType): Promise<EntityLink> {
  const existing = await db.select().from(schema.entityLinks)
    .where(and(
      eq(schema.entityLinks.fromEntityId, entity1Id),
      eq(schema.entityLinks.toEntityId, entity2Id),
      eq(schema.entityLinks.relationshipType, relationshipType)
    ));
  if (existing.length > 0) return existing[0];
  
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.entityLinks).values({
    id,
    fromEntityId: entity1Id,
    toEntityId: entity2Id,
    relationshipType,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function findOrCreateMemoryRelationship(memory1Id: string, memory2Id: string, relationshipType: string, strength?: string): Promise<MemoryRelationship> {
  const existing = await db.select().from(schema.memoryRelationships)
    .where(and(
      eq(schema.memoryRelationships.sourceMemoryId, memory1Id),
      eq(schema.memoryRelationships.targetMemoryId, memory2Id),
      eq(schema.memoryRelationships.relationshipType, relationshipType as any)
    ));
  if (existing.length > 0) return existing[0];
  
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.memoryRelationships).values({
    id,
    sourceMemoryId: memory1Id,
    targetMemoryId: memory2Id,
    relationshipType: relationshipType as any,
    strength: strength || "0.5",
    createdAt: now,
  }).returning();
  return result;
}

export async function findContactsByName(name: string): Promise<Contact[]> {
  const searchPattern = `%${name}%`;
  return await db.select().from(schema.contacts)
    .where(or(
      like(schema.contacts.firstName, searchPattern),
      like(schema.contacts.lastName, searchPattern)
    ))
    .orderBy(asc(schema.contacts.firstName));
}

export async function getAllUploadedFiles(): Promise<UploadedFile[]> {
  return await db.select().from(schema.uploadedFiles)
    .orderBy(desc(schema.uploadedFiles.createdAt));
}

export async function createOmiSummary(data: InsertOmiSummary): Promise<OmiSummary> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.omiSummaries).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getOmiSummaryByDate(date: string): Promise<OmiSummary | undefined> {
  const [result] = await db.select().from(schema.omiSummaries)
    .where(eq(schema.omiSummaries.date, date));
  return result;
}

export async function getOmiSummaries(): Promise<OmiSummary[]> {
  return await db.select().from(schema.omiSummaries)
    .orderBy(desc(schema.omiSummaries.date));
}

export async function getOmiSummariesInRange(start: string, end: string): Promise<OmiSummary[]> {
  return await db.select().from(schema.omiSummaries)
    .where(and(
      gte(schema.omiSummaries.date, start),
      lte(schema.omiSummaries.date, end)
    ))
    .orderBy(asc(schema.omiSummaries.date));
}

export async function findNearbyPlaces(lat: number, lng: number, radiusMeters: number = 100): Promise<SavedPlace[]> {
  const places = await getAllSavedPlaces();
  return places.filter(place => {
    if (!place.latitude || !place.longitude) return false;
    const distance = Math.sqrt(
      Math.pow((parseFloat(place.latitude) - lat) * 111320, 2) +
      Math.pow((parseFloat(place.longitude) - lng) * 111320 * Math.cos(lat * Math.PI / 180), 2)
    );
    return distance <= radiusMeters;
  });
}

export async function correlateLifelogWithLocation(lifelogId: string, locationId: string, placeId?: string): Promise<LifelogLocation> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.lifelogLocations).values({
    id,
    lifelogId,
    locationId,
    placeId: placeId || null,
    createdAt: now,
  }).returning();
  return result;
}

export async function getLifelogLocationByLifelogId(lifelogId: string): Promise<LifelogLocation | undefined> {
  const [result] = await db.select().from(schema.lifelogLocations)
    .where(eq(schema.lifelogLocations.lifelogId, lifelogId));
  return result;
}

export interface MemoryWithConfidence {
  note: MemoryNote;
  confidence: number;
}

export async function getMemoryWithConfidence(id: string): Promise<MemoryWithConfidence | undefined> {
  const note = await getMemoryNote(id);
  if (!note) return undefined;
  return {
    note,
    confidence: parseFloat(note.confidenceScore || '0.5'),
  };
}

export async function getStarredPlaces(): Promise<SavedPlace[]> {
  return await db.select().from(schema.savedPlaces)
    .where(eq(schema.savedPlaces.isStarred, true))
    .orderBy(asc(schema.savedPlaces.name));
}

export async function checkGroceryProximity(lat: number, lng: number): Promise<boolean> {
  const places = await findNearbyPlaces(lat, lng, 200);
  return places.some(p => p.category === 'grocery');
}

export async function addPlaceToList(placeId: string, listId: string): Promise<PlaceListItem> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.placeListItems).values({
    id,
    placeId,
    listId,
    createdAt: now,
  }).returning();
  return result;
}

export async function removePlaceFromList(placeId: string, listId: string): Promise<boolean> {
  const result = await db.delete(schema.placeListItems)
    .where(and(
      eq(schema.placeListItems.placeId, placeId),
      eq(schema.placeListItems.listId, listId)
    ));
  return (result.rowCount ?? 0) > 0;
}

export async function getPlacesInList(listId: string): Promise<SavedPlace[]> {
  const items = await db.select().from(schema.placeListItems)
    .where(eq(schema.placeListItems.listId, listId));
  if (items.length === 0) return [];
  const placeIds = items.map(i => i.placeId);
  return await db.select().from(schema.savedPlaces)
    .where(sql`${schema.savedPlaces.id} IN (${sql.join(placeIds.map(id => sql`${id}`), sql`, `)})`);
}

export async function linkTaskToPlace(taskId: string, placeId: string): Promise<boolean> {
  const result = await db.update(schema.tasks)
    .set({ placeId, updatedAt: getNow() })
    .where(eq(schema.tasks.id, taskId));
  return (result.rowCount ?? 0) > 0;
}

export async function linkReminderToPlace(reminderId: string, placeId: string): Promise<boolean> {
  const result = await db.update(schema.reminders)
    .set({ placeId, updatedAt: getNow() })
    .where(eq(schema.reminders.id, reminderId));
  return (result.rowCount ?? 0) > 0;
}

export async function linkMemoryToPlace(memoryId: string, placeId: string): Promise<boolean> {
  const result = await db.update(schema.memoryNotes)
    .set({ placeId, updatedAt: getNow() })
    .where(eq(schema.memoryNotes.id, memoryId));
  return (result.rowCount ?? 0) > 0;
}

export async function unlinkTaskFromPlace(taskId: string): Promise<boolean> {
  const result = await db.update(schema.tasks)
    .set({ placeId: null, updatedAt: getNow() })
    .where(eq(schema.tasks.id, taskId));
  return (result.rowCount ?? 0) > 0;
}

export async function unlinkReminderFromPlace(reminderId: string): Promise<boolean> {
  const result = await db.update(schema.reminders)
    .set({ placeId: null, updatedAt: getNow() })
    .where(eq(schema.reminders.id, reminderId));
  return (result.rowCount ?? 0) > 0;
}

export async function unlinkMemoryFromPlace(memoryId: string): Promise<boolean> {
  const result = await db.update(schema.memoryNotes)
    .set({ placeId: null, updatedAt: getNow() })
    .where(eq(schema.memoryNotes.id, memoryId));
  return (result.rowCount ?? 0) > 0;
}

export interface PlaceWithLinkedItems {
  place: SavedPlace;
  tasks: Task[];
  reminders: Reminder[];
  memories: MemoryNote[];
}

export async function getPlaceWithLinkedItems(placeId: string): Promise<PlaceWithLinkedItems | undefined> {
  const place = await getSavedPlace(placeId);
  if (!place) return undefined;
  const [tasks, reminders, memories] = await Promise.all([
    getTasksByPlace(placeId),
    getRemindersByPlace(placeId),
    getMemoriesByPlace(placeId),
  ]);
  return { place, tasks, reminders, memories };
}

export async function getTasksByPlace(placeId: string): Promise<Task[]> {
  return await db.select().from(schema.tasks)
    .where(eq(schema.tasks.placeId, placeId))
    .orderBy(desc(schema.tasks.createdAt));
}

export async function getRemindersByPlace(placeId: string): Promise<Reminder[]> {
  return await db.select().from(schema.reminders)
    .where(eq(schema.reminders.placeId, placeId))
    .orderBy(desc(schema.reminders.createdAt));
}

export async function getMemoriesByPlace(placeId: string): Promise<MemoryNote[]> {
  return await db.select().from(schema.memoryNotes)
    .where(eq(schema.memoryNotes.placeId, placeId))
    .orderBy(desc(schema.memoryNotes.createdAt));
}

export async function incrementContactInteraction(id: string): Promise<boolean> {
  const contact = await getContact(id);
  if (!contact) return false;
  const result = await db.update(schema.contacts)
    .set({
      interactionCount: (contact.interactionCount || 0) + 1,
      lastInteractionAt: getNow(),
      updatedAt: getNow(),
    })
    .where(eq(schema.contacts.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function getMemoriesForContact(contactId: string): Promise<MemoryNote[]> {
  return await db.select().from(schema.memoryNotes)
    .where(and(
      eq(schema.memoryNotes.contactId, contactId),
      eq(schema.memoryNotes.isSuperseded, false)
    ))
    .orderBy(desc(schema.memoryNotes.createdAt));
}

export async function linkMemoryToContact(memoryId: string, contactId: string): Promise<boolean> {
  const result = await db.update(schema.memoryNotes)
    .set({ contactId, updatedAt: getNow() })
    .where(eq(schema.memoryNotes.id, memoryId));
  return (result.rowCount ?? 0) > 0;
}

export async function createMemoryWithContact(data: InsertMemoryNote, contactId: string): Promise<MemoryNote> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.memoryNotes).values({
    ...data,
    id,
    contactId,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getRecentlyInteractedContacts(limit: number = 10): Promise<Contact[]> {
  return await db.select().from(schema.contacts)
    .where(sql`${schema.contacts.lastInteractionAt} IS NOT NULL`)
    .orderBy(desc(schema.contacts.lastInteractionAt))
    .limit(limit);
}

export async function getMostInteractedContacts(limit: number = 10): Promise<Contact[]> {
  return await db.select().from(schema.contacts)
    .orderBy(desc(schema.contacts.interactionCount))
    .limit(limit);
}

export async function getAutoCreatedContacts(): Promise<Contact[]> {
  return await db.select().from(schema.contacts)
    .where(eq(schema.contacts.isAutoCreated, true))
    .orderBy(desc(schema.contacts.createdAt));
}

export async function toggleCustomListItemChecked(id: string): Promise<CustomListItem | undefined> {
  const [existing] = await db.select().from(schema.customListItems).where(eq(schema.customListItems.id, id));
  if (!existing) return undefined;
  const [result] = await db.update(schema.customListItems)
    .set({ isChecked: !existing.isChecked, updatedAt: getNow() })
    .where(eq(schema.customListItems.id, id))
    .returning();
  return result;
}

export async function clearCheckedCustomListItems(listId: string): Promise<number> {
  const result = await db.delete(schema.customListItems)
    .where(and(
      eq(schema.customListItems.listId, listId),
      eq(schema.customListItems.isChecked, true)
    ));
  return result.rowCount ?? 0;
}

export async function upsertFoodPreference(data: InsertFoodPreference): Promise<FoodPreference> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.foodPreferences).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function createMealHistoryEntry(data: InsertMealHistory): Promise<MealHistory> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.mealHistory).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getFoodPreferences(familyMemberId?: string): Promise<FoodPreference[]> {
  if (familyMemberId) {
    return await db.select().from(schema.foodPreferences)
      .where(eq(schema.foodPreferences.familyMemberId, familyMemberId))
      .orderBy(desc(schema.foodPreferences.createdAt));
  }
  return await db.select().from(schema.foodPreferences)
    .orderBy(desc(schema.foodPreferences.createdAt));
}

export async function getLikedIngredients(familyMemberId?: string): Promise<FoodPreference[]> {
  if (familyMemberId) {
    return await db.select().from(schema.foodPreferences)
      .where(and(
        eq(schema.foodPreferences.familyMemberId, familyMemberId),
        eq(schema.foodPreferences.itemType, 'ingredient'),
        eq(schema.foodPreferences.preferenceLevel, 'love')
      ))
      .orderBy(asc(schema.foodPreferences.itemName));
  }
  return await db.select().from(schema.foodPreferences)
    .where(and(
      eq(schema.foodPreferences.itemType, 'ingredient'),
      eq(schema.foodPreferences.preferenceLevel, 'love')
    ))
    .orderBy(asc(schema.foodPreferences.itemName));
}

export async function getDislikedIngredients(familyMemberId?: string): Promise<FoodPreference[]> {
  if (familyMemberId) {
    return await db.select().from(schema.foodPreferences)
      .where(and(
        eq(schema.foodPreferences.familyMemberId, familyMemberId),
        eq(schema.foodPreferences.itemType, 'ingredient'),
        or(
          eq(schema.foodPreferences.preferenceLevel, 'hate'),
          eq(schema.foodPreferences.preferenceLevel, 'dislike')
        )
      ))
      .orderBy(asc(schema.foodPreferences.itemName));
  }
  return await db.select().from(schema.foodPreferences)
    .where(and(
      eq(schema.foodPreferences.itemType, 'ingredient'),
      or(
        eq(schema.foodPreferences.preferenceLevel, 'hate'),
        eq(schema.foodPreferences.preferenceLevel, 'dislike')
      )
    ))
    .orderBy(asc(schema.foodPreferences.itemName));
}

export async function getFavoriteRecipes(): Promise<Recipe[]> {
  return await db.select().from(schema.recipes)
    .where(eq(schema.recipes.isFavorite, true))
    .orderBy(asc(schema.recipes.name));
}

export async function searchRecipes(query: string): Promise<Recipe[]> {
  const searchPattern = `%${query}%`;
  return await db.select().from(schema.recipes)
    .where(or(
      like(schema.recipes.name, searchPattern),
      like(schema.recipes.description, searchPattern)
    ))
    .orderBy(asc(schema.recipes.name));
}

export async function getRecipeById(id: string): Promise<Recipe | undefined> {
  const [result] = await db.select().from(schema.recipes).where(eq(schema.recipes.id, id));
  return result;
}

export async function getFamilyMemberByName(name: string): Promise<FamilyMember | undefined> {
  const [result] = await db.select().from(schema.familyMembers)
    .where(eq(schema.familyMembers.name, name));
  return result;
}

export async function getActiveFamilyMembers(): Promise<FamilyMember[]> {
  return await db.select().from(schema.familyMembers)
    .where(eq(schema.familyMembers.isActive, true))
    .orderBy(asc(schema.familyMembers.name));
}

export async function createRecipe(data: InsertRecipe): Promise<Recipe> {
  const now = getNow();
  const id = uuidv4();
  const [result] = await db.insert(schema.recipes).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return result;
}

export async function getDietaryRestrictions(familyMemberId?: string): Promise<DietaryRestriction[]> {
  if (familyMemberId) {
    return await db.select().from(schema.dietaryRestrictions)
      .where(eq(schema.dietaryRestrictions.familyMemberId, familyMemberId))
      .orderBy(desc(schema.dietaryRestrictions.createdAt));
  }
  return await db.select().from(schema.dietaryRestrictions)
    .orderBy(desc(schema.dietaryRestrictions.createdAt));
}

export async function getProfileSection(section: string): Promise<UserProfile | undefined> {
  const [result] = await db.select().from(schema.userProfile)
    .where(eq(schema.userProfile.section, section))
    .limit(1);
  return result;
}

export async function getAllProfileSections(): Promise<UserProfile[]> {
  return await db.select().from(schema.userProfile)
    .orderBy(asc(schema.userProfile.section));
}

export async function updateAutomationRunTimestamps(id: string, lastRun: string, nextRun: string | null): Promise<Automation | undefined> {
  await db.update(schema.automations)
    .set({ lastRun, nextRun })
    .where(eq(schema.automations.id, id));
  return await getAutomation(id);
}

export async function getPredictionById(id: string): Promise<Prediction | undefined> {
  const [result] = await db.select().from(schema.predictions)
    .where(eq(schema.predictions.id, id))
    .limit(1);
  return result;
}

export async function getPendingPredictions(): Promise<Prediction[]> {
  return await getAllPredictions({ status: 'pending' });
}

export async function getPredictionStats(): Promise<{ total: number; byStatus: Record<string, number>; byType: Record<string, number> }> {
  const allPredictions = await db.select().from(schema.predictions);
  const total = allPredictions.length;
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const p of allPredictions) {
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    byType[p.type] = (byType[p.type] || 0) + 1;
  }
  return { total, byStatus, byType };
}

export async function getActivePatterns(): Promise<Pattern[]> {
  return await db.select().from(schema.patterns)
    .where(eq(schema.patterns.isActive, true))
    .orderBy(desc(schema.patterns.strength));
}

export async function incrementPatternUsage(id: string): Promise<void> {
  const now = getNow();
  const [pattern] = await db.select().from(schema.patterns)
    .where(eq(schema.patterns.id, id))
    .limit(1);
  if (pattern) {
    await db.update(schema.patterns)
      .set({
        predictionCount: (pattern.predictionCount || 0) + 1,
        lastUsedAt: now,
      })
      .where(eq(schema.patterns.id, id));
  }
}

export async function getEntitiesByType(type: string): Promise<Entity[]> {
  return await db.select().from(schema.entities)
    .where(eq(schema.entities.type, type as any))
    .orderBy(desc(schema.entities.createdAt));
}

export async function getDocumentWithFolder(id: string): Promise<(Document & { folder: Folder | null }) | undefined> {
  const document = await getDocument(id);
  if (!document) return undefined;
  const folder = document.folderId ? await getFolder(document.folderId) : null;
  return { ...document, folder };
}

export async function getFolderTree(): Promise<(Folder & { children: Folder[]; documents: Document[] })[]> {
  const allFolders = await getAllFolders();
  const allDocuments = await getAllDocuments();
  
  const folderMap = new Map<string, Folder & { children: Folder[]; documents: Document[] }>();
  for (const folder of allFolders) {
    folderMap.set(folder.id, { ...folder, children: [], documents: [] });
  }
  
  const rootFolders: (Folder & { children: Folder[]; documents: Document[] })[] = [];
  for (const folder of allFolders) {
    const node = folderMap.get(folder.id)!;
    if (folder.parentId && folderMap.has(folder.parentId)) {
      folderMap.get(folder.parentId)!.children.push(node);
    } else {
      rootFolders.push(node);
    }
  }
  
  for (const doc of allDocuments) {
    if (doc.folderId && folderMap.has(doc.folderId)) {
      folderMap.get(doc.folderId)!.documents.push(doc);
    }
  }
  
  return rootFolders;
}

export async function getFoldersByParent(parentId: string | null): Promise<Folder[]> {
  if (parentId === null) {
    return await db.select().from(schema.folders)
      .where(isNull(schema.folders.parentId))
      .orderBy(asc(schema.folders.sortOrder), asc(schema.folders.name));
  }
  return await db.select().from(schema.folders)
    .where(eq(schema.folders.parentId, parentId))
    .orderBy(asc(schema.folders.sortOrder), asc(schema.folders.name));
}

export function getDocumentWordCount(content: string): number {
  if (!content || content.trim() === "") return 0;
  return content.trim().split(/\s+/).filter(word => word.length > 0).length;
}

export async function getFeedbackEventsByConversation(conversationId: string): Promise<FeedbackEvent[]> {
  return await db.select().from(schema.feedbackEvents)
    .where(eq(schema.feedbackEvents.conversationId, conversationId))
    .orderBy(desc(schema.feedbackEvents.createdAt));
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export async function getLastLocationStateByPlace(savedPlaceId: string): Promise<LocationStateTracking | null> {
  const [result] = await db.select().from(schema.locationStateTracking)
    .where(eq(schema.locationStateTracking.savedPlaceId, savedPlaceId))
    .orderBy(desc(schema.locationStateTracking.eventDetectedAt))
    .limit(1);
  return result || null;
}

export async function getItemsRelatedToEntity(entityId: string): Promise<Array<{ domain: string; itemId: string; confidence: string; context: string | null }>> {
  const rows = await db.select({
    domain: schema.entityReferences.domain,
    itemId: schema.entityReferences.itemId,
    confidence: schema.entityReferences.confidence,
    context: schema.entityReferences.context,
  }).from(schema.entityReferences)
    .where(eq(schema.entityReferences.entityId, entityId))
    .orderBy(desc(schema.entityReferences.confidence));
  return rows;
}

export async function getLifelogsAtPlace(placeId: string): Promise<LifelogLocation[]> {
  return await db.select().from(schema.lifelogLocations)
    .where(eq(schema.lifelogLocations.savedPlaceId, placeId))
    .orderBy(desc(schema.lifelogLocations.lifelogStartTime));
}

export async function getLifelogsNearLocation(lat: number, lon: number, radiusMeters: number = 500): Promise<Array<LifelogLocation & { distance: number }>> {
  const allLocations = await db.select().from(schema.lifelogLocations)
    .where(and(
      isNotNull(schema.lifelogLocations.startLatitude),
      isNotNull(schema.lifelogLocations.startLongitude)
    ))
    .orderBy(desc(schema.lifelogLocations.lifelogStartTime));
  
  const nearbyLifelogs: Array<LifelogLocation & { distance: number }> = [];
  for (const loc of allLocations) {
    if (loc.startLatitude && loc.startLongitude) {
      const distance = calculateDistance(lat, lon, parseFloat(loc.startLatitude), parseFloat(loc.startLongitude));
      if (distance <= radiusMeters) {
        nearbyLifelogs.push({ ...loc, distance });
      }
    }
  }
  return nearbyLifelogs;
}

export async function getRecentLifelogLocations(limit: number = 20): Promise<LifelogLocation[]> {
  return await db.select().from(schema.lifelogLocations)
    .orderBy(desc(schema.lifelogLocations.lifelogStartTime))
    .limit(limit);
}

export async function getLifelogLocationContexts(lifelogIds: string[]): Promise<LifelogLocation[]> {
  if (lifelogIds.length === 0) return [];
  return await db.select().from(schema.lifelogLocations)
    .where(inArray(schema.lifelogLocations.lifelogId, lifelogIds));
}

const CONFIRMATION_BOOST = 0.1;
const CONTRADICTION_PENALTY = 0.2;

export async function confirmMemory(memoryId: string): Promise<MemoryNote | undefined> {
  const now = getNow();
  const existing = await getMemoryNote(memoryId);
  if (!existing) return undefined;
  const currentConfidence = parseFloat(existing.confidenceScore || "0.8");
  const newConfidence = Math.min(1, currentConfidence + CONFIRMATION_BOOST);
  await db.update(schema.memoryNotes)
    .set({
      confirmationCount: (existing.confirmationCount || 0) + 1,
      lastConfirmedAt: now,
      confidenceScore: newConfidence.toString(),
      updatedAt: now,
    })
    .where(eq(schema.memoryNotes.id, memoryId));
  return await getMemoryNote(memoryId);
}

export async function contradictMemory(memoryId: string): Promise<MemoryNote | undefined> {
  const now = getNow();
  const existing = await getMemoryNote(memoryId);
  if (!existing) return undefined;
  const currentConfidence = parseFloat(existing.confidenceScore || "0.8");
  const newConfidence = Math.max(0, currentConfidence - CONTRADICTION_PENALTY);
  await db.update(schema.memoryNotes)
    .set({ confidenceScore: newConfidence.toString(), updatedAt: now })
    .where(eq(schema.memoryNotes.id, memoryId));
  return await getMemoryNote(memoryId);
}

export async function updateMemoryUsage(memoryId: string): Promise<MemoryNote | undefined> {
  const now = getNow();
  const existing = await getMemoryNote(memoryId);
  if (!existing) return undefined;
  await db.update(schema.memoryNotes)
    .set({
      usageCount: (existing.usageCount || 0) + 1,
      lastUsedAt: now,
      updatedAt: now,
    })
    .where(eq(schema.memoryNotes.id, memoryId));
  return await getMemoryNote(memoryId);
}

export async function getToolSuccessRate(toolName: string, days: number = 7): Promise<{ successRate: number; total: number; successful: number; failed: number }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoff = cutoffDate.toISOString();
  
  const metrics = await db.select().from(schema.conversationMetrics)
    .where(and(
      eq(schema.conversationMetrics.toolName, toolName),
      gte(schema.conversationMetrics.createdAt, cutoff)
    ));
  
  const total = metrics.length;
  const successful = metrics.filter(m => m.toolOutcome === 'success').length;
  const failed = metrics.filter(m => m.toolOutcome === 'failure').length;
  
  return {
    total,
    successful,
    failed,
    successRate: total > 0 ? (successful / total) * 100 : 0
  };
}

export async function getConversationQualityStats(conversationId: string): Promise<{
  totalToolCalls: number;
  successfulToolCalls: number;
  failedToolCalls: number;
  followUpCount: number;
  retryCount: number;
  positiveFeedbackCount: number;
  negativeFeedbackCount: number;
  avgToolDuration: number;
}> {
  const metrics = await db.select().from(schema.conversationMetrics)
    .where(eq(schema.conversationMetrics.conversationId, conversationId));
  
  const totalToolCalls = metrics.filter(m => m.toolName).length;
  const successfulToolCalls = metrics.filter(m => m.toolOutcome === "success").length;
  const failedToolCalls = metrics.filter(m => m.toolOutcome === "failure").length;
  const followUpCount = metrics.filter(m => m.requiredFollowUp).length;
  const retryCount = metrics.filter(m => m.userRetried).length;
  const positiveFeedbackCount = metrics.filter(m => m.explicitFeedback === "positive").length;
  const negativeFeedbackCount = metrics.filter(m => m.explicitFeedback === "negative").length;
  
  const toolDurations = metrics.filter(m => m.toolDurationMs).map(m => m.toolDurationMs!);
  const avgToolDuration = toolDurations.length > 0 
    ? toolDurations.reduce((a, b) => a + b, 0) / toolDurations.length 
    : 0;
  
  return {
    totalToolCalls,
    successfulToolCalls,
    failedToolCalls,
    followUpCount,
    retryCount,
    positiveFeedbackCount,
    negativeFeedbackCount,
    avgToolDuration,
  };
}

export async function getOverallQualityStats(days: number = 7): Promise<{
  totalConversations: number;
  totalToolCalls: number;
  overallSuccessRate: number;
  averageQualityScore: number;
  averageResponseTimeMs: number;
  retryRate: number;
  followUpRate: number;
  toolStats: Array<{ toolName: string; successRate: number; count: number }>;
}> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoff = cutoffDate.toISOString();
  
  const metrics = await db.select().from(schema.conversationMetrics)
    .where(gte(schema.conversationMetrics.createdAt, cutoff));
  
  const conversationIds = new Set(metrics.map(m => m.conversationId));
  const toolCalls = metrics.filter(m => m.toolName);
  const successfulCalls = toolCalls.filter(m => m.toolOutcome === 'success').length;
  const retryCount = metrics.filter(m => m.userRetried).length;
  const followUpCount = metrics.filter(m => m.requiredFollowUp).length;
  
  const toolDurations = toolCalls.filter(m => m.toolDurationMs).map(m => m.toolDurationMs!);
  const avgDuration = toolDurations.length > 0 
    ? toolDurations.reduce((a, b) => a + b, 0) / toolDurations.length 
    : 0;
  
  const toolCounts: Record<string, { success: number; total: number }> = {};
  for (const m of toolCalls) {
    if (!m.toolName) continue;
    if (!toolCounts[m.toolName]) toolCounts[m.toolName] = { success: 0, total: 0 };
    toolCounts[m.toolName].total++;
    if (m.toolOutcome === 'success') toolCounts[m.toolName].success++;
  }
  
  const toolStats = Object.entries(toolCounts).map(([toolName, stats]) => ({
    toolName,
    count: stats.total,
    successRate: stats.total > 0 ? (stats.success / stats.total) * 100 : 0,
  }));
  
  return {
    totalConversations: conversationIds.size,
    totalToolCalls: toolCalls.length,
    overallSuccessRate: toolCalls.length > 0 ? (successfulCalls / toolCalls.length) * 100 : 0,
    averageQualityScore: 0,
    averageResponseTimeMs: avgDuration,
    retryRate: metrics.length > 0 ? (retryCount / metrics.length) * 100 : 0,
    followUpRate: metrics.length > 0 ? (followUpCount / metrics.length) * 100 : 0,
    toolStats,
  };
}

export async function getMemoryConfidenceStats(): Promise<{
  total: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  needsConfirmation: number;
  averageConfidence: number;
}> {
  const allNotes = await getAllMemoryNotes();
  const activeNotes = allNotes.filter(m => !m.isSuperseded);
  
  let highConfidence = 0;
  let mediumConfidence = 0;
  let lowConfidence = 0;
  let totalConfidence = 0;
  
  for (const note of activeNotes) {
    const confidence = parseFloat(note.confidenceScore || "0.8");
    totalConfidence += confidence;
    if (confidence >= 0.8) highConfidence++;
    else if (confidence >= 0.5) mediumConfidence++;
    else lowConfidence++;
  }
  
  return {
    total: activeNotes.length,
    highConfidence,
    mediumConfidence,
    lowConfidence,
    needsConfirmation: lowConfidence,
    averageConfidence: activeNotes.length > 0 ? totalConfidence / activeNotes.length : 0,
  };
}

export async function getSubmittedBatchJobs(): Promise<BatchJob[]> {
  return await db.select().from(schema.batchJobs)
    .where(eq(schema.batchJobs.status, 'SUBMITTED'))
    .orderBy(asc(schema.batchJobs.submittedAt));
}

export async function getQueuedBatchJobs(): Promise<BatchJob[]> {
  return await db.select().from(schema.batchJobs)
    .where(eq(schema.batchJobs.status, 'QUEUED'))
    .orderBy(asc(schema.batchJobs.createdAt));
}

export async function updateBatchJobStatus(id: string, status: string, updates?: Partial<BatchJob>): Promise<BatchJob | undefined> {
  const now = getNow();
  const existing = await getBatchJob(id);
  if (!existing) return undefined;
  
  await db.update(schema.batchJobs)
    .set({
      status: status as any,
      attempts: updates?.attempts ?? existing.attempts,
      error: updates?.error ?? existing.error,
      inputItemCount: updates?.inputItemCount ?? existing.inputItemCount,
      outputItemCount: updates?.outputItemCount ?? existing.outputItemCount,
      estimatedCostCents: updates?.estimatedCostCents ?? existing.estimatedCostCents,
      actualCostCents: updates?.actualCostCents ?? existing.actualCostCents,
      completedAt: status === 'COMPLETED' || status === 'FAILED' ? now : existing.completedAt,
      updatedAt: now,
    })
    .where(eq(schema.batchJobs.id, id));
  
  return await getBatchJob(id);
}

export async function updateBatchJobOpenAiId(id: string, openAiBatchId: string): Promise<void> {
  const now = getNow();
  await db.update(schema.batchJobs)
    .set({ openAiBatchId, updatedAt: now })
    .where(eq(schema.batchJobs.id, id));
}

export async function getOmiWebhookLog(id: string): Promise<OmiWebhookLog | undefined> {
  const [result] = await db.select().from(schema.omiWebhookLogs)
    .where(eq(schema.omiWebhookLogs.id, id))
    .limit(1);
  return result;
}

export async function updateOmiWebhookLog(id: string, data: Partial<InsertOmiWebhookLog>): Promise<OmiWebhookLog | undefined> {
  await db.update(schema.omiWebhookLogs)
    .set(data)
    .where(eq(schema.omiWebhookLogs.id, id));
  return await getOmiWebhookLog(id);
}

export async function updateDeviceTokenLastUsed(token: string): Promise<void> {
  const now = getNow();
  await db.update(schema.deviceTokens)
    .set({ lastUsedAt: now })
    .where(eq(schema.deviceTokens.token, token));
}

export async function recordPairingAttempt(ipAddress: string, success: boolean): Promise<void> {
  const now = getNow();
  await db.insert(schema.pairingAttempts).values({
    ipAddress,
    attemptedAt: now,
    success,
  });
}

export async function getRecentFailedPairingAttempts(ipAddress: string, windowMinutes: number = 15): Promise<number> {
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const results = await db.select().from(schema.pairingAttempts)
    .where(and(
      eq(schema.pairingAttempts.ipAddress, ipAddress),
      eq(schema.pairingAttempts.success, false),
      gte(schema.pairingAttempts.attemptedAt, cutoff)
    ));
  return results.length;
}

export async function cleanupOldPairingAttempts(olderThanMinutes: number = 60): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();
  const result = await db.delete(schema.pairingAttempts)
    .where(lt(schema.pairingAttempts.attemptedAt, cutoff));
  return 0;
}

export async function createPairingCode(sessionId: string, code: string, deviceName: string, expiresAt: string): Promise<PairingCode> {
  const now = getNow();
  await db.insert(schema.pairingCodes).values({
    sessionId,
    code,
    deviceName,
    attempts: 0,
    expiresAt,
    createdAt: now,
  });
  const result = await getPairingCodeBySessionId(sessionId);
  return result!;
}

export async function getPairingCodeBySessionId(sessionId: string): Promise<PairingCode | null> {
  const [result] = await db.select().from(schema.pairingCodes)
    .where(eq(schema.pairingCodes.sessionId, sessionId))
    .limit(1);
  return result ?? null;
}

export async function incrementPairingCodeAttempts(sessionId: string): Promise<number> {
  await db.update(schema.pairingCodes)
    .set({ attempts: sql`${schema.pairingCodes.attempts} + 1` })
    .where(eq(schema.pairingCodes.sessionId, sessionId));
  const result = await getPairingCodeBySessionId(sessionId);
  return result?.attempts ?? 0;
}

export async function deletePairingCode(sessionId: string): Promise<void> {
  await db.delete(schema.pairingCodes)
    .where(eq(schema.pairingCodes.sessionId, sessionId));
}

export async function cleanupExpiredPairingCodes(): Promise<number> {
  const now = getNow();
  await db.delete(schema.pairingCodes)
    .where(lt(schema.pairingCodes.expiresAt, now));
  return 0;
}

export async function countPendingPairingCodes(): Promise<number> {
  const now = getNow();
  const results = await db.select().from(schema.pairingCodes)
    .where(gte(schema.pairingCodes.expiresAt, now));
  return results.length;
}

export async function countPairingCodesForDevice(deviceName: string): Promise<number> {
  const now = getNow();
  const results = await db.select().from(schema.pairingCodes)
    .where(and(
      eq(schema.pairingCodes.deviceName, deviceName),
      gte(schema.pairingCodes.expiresAt, now)
    ));
  return results.length;
}

export async function deleteOldestPairingCodeForDevice(deviceName: string): Promise<void> {
  const [oldest] = await db.select().from(schema.pairingCodes)
    .where(eq(schema.pairingCodes.deviceName, deviceName))
    .orderBy(asc(schema.pairingCodes.createdAt))
    .limit(1);
  if (oldest) {
    await db.delete(schema.pairingCodes)
      .where(eq(schema.pairingCodes.id, oldest.id));
  }
}

// Wake Word and Context Agent Functions
export async function createWakeWordCommand(data: InsertWakeWordCommand): Promise<WakeWordCommand> {
  const id = uuidv4();
  const now = getNow();
  await db.insert(schema.wakeWordCommands).values({
    ...data,
    id,
    createdAt: now,
  });
  const [result] = await db.select().from(schema.wakeWordCommands).where(eq(schema.wakeWordCommands.id, id)).limit(1);
  return result;
}

export async function getRecentWakeWordCommands(limit: number = 50): Promise<WakeWordCommand[]> {
  return await db.select().from(schema.wakeWordCommands)
    .orderBy(desc(schema.wakeWordCommands.createdAt))
    .limit(limit);
}

export async function getPendingWakeWordCommands(): Promise<WakeWordCommand[]> {
  return await db.select().from(schema.wakeWordCommands)
    .where(inArray(schema.wakeWordCommands.status, ['detected', 'parsed', 'pending_approval']))
    .orderBy(asc(schema.wakeWordCommands.createdAt));
}

export async function updateWakeWordCommandStatus(
  id: string,
  status: string,
  executionResult?: string
): Promise<boolean> {
  const now = getNow();
  const executedAt = status === 'completed' || status === 'failed' ? now : null;
  await db.update(schema.wakeWordCommands)
    .set({ 
      status: status as any, 
      executionResult: executionResult, 
      executedAt 
    })
    .where(eq(schema.wakeWordCommands.id, id));
  return true;
}

export async function updateWakeWordCommandAction(
  id: string,
  actionType: string,
  actionDetails: string,
  targetContactId?: string,
  confidence?: number
): Promise<boolean> {
  await db.update(schema.wakeWordCommands)
    .set({
      actionType: actionType as any,
      actionDetails,
      targetContactId: targetContactId || null,
      confidence: confidence?.toString() || null,
      status: 'parsed',
    })
    .where(eq(schema.wakeWordCommands.id, id));
  return true;
}

export async function wakeWordCommandExists(lifelogId: string, rawCommand: string): Promise<boolean> {
  const [result] = await db.select({ id: schema.wakeWordCommands.id })
    .from(schema.wakeWordCommands)
    .where(and(
      eq(schema.wakeWordCommands.lifelogId, lifelogId),
      eq(sql`LOWER(${schema.wakeWordCommands.rawCommand})`, rawCommand.toLowerCase())
    ))
    .limit(1);
  return !!result;
}

export async function deleteWakeWordCommand(id: string): Promise<boolean> {
  await db.delete(schema.wakeWordCommands)
    .where(eq(schema.wakeWordCommands.id, id));
  return true;
}

export async function getContextAgentSettings(): Promise<ContextAgentSettings | null> {
  const [result] = await db.select().from(schema.contextAgentSettings).limit(1);
  return result ?? null;
}

export async function updateContextAgentSettings(data: Partial<ContextAgentSettings>): Promise<ContextAgentSettings | null> {
  const now = getNow();
  const current = await getContextAgentSettings();
  if (!current) return null;
  
  await db.update(schema.contextAgentSettings)
    .set({ ...data, updatedAt: now })
    .where(eq(schema.contextAgentSettings.id, current.id));
  
  return await getContextAgentSettings();
}

export async function updateLastScanTime(): Promise<void> {
  const now = getNow();
  await db.update(schema.contextAgentSettings)
    .set({ lastScanAt: now, updatedAt: now });
}

// Location and Check-In Functions
export async function getPlacesWithProximityAlerts(): Promise<SavedPlace[]> {
  return await db.select().from(schema.savedPlaces)
    .where(eq(schema.savedPlaces.proximityAlertEnabled, true));
}

export async function getRecentAlertsForPlace(savedPlaceId: string, minutesAgo: number = 30): Promise<ProximityAlert[]> {
  const cutoffTime = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
  return await db.select().from(schema.proximityAlerts)
    .where(and(
      eq(schema.proximityAlerts.savedPlaceId, savedPlaceId),
      gte(schema.proximityAlerts.createdAt, cutoffTime)
    ))
    .orderBy(desc(schema.proximityAlerts.createdAt));
}

export async function getCheckInsSentToday(): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();
  
  const results = await db.select().from(schema.locationStateTracking)
    .where(and(
      eq(schema.locationStateTracking.smsSent, true),
      gte(schema.locationStateTracking.eventDetectedAt, todayISO)
    ));
  return results.length;
}

export async function getLastCheckInTime(): Promise<string | null> {
  const [result] = await db.select({ eventDetectedAt: schema.locationStateTracking.eventDetectedAt })
    .from(schema.locationStateTracking)
    .where(eq(schema.locationStateTracking.smsSent, true))
    .orderBy(desc(schema.locationStateTracking.eventDetectedAt))
    .limit(1);
  return result?.eventDetectedAt || null;
}

// News and Briefing Functions (additional)
export async function getNewsTopics(activeOnly: boolean = true): Promise<NewsTopic[]> {
  if (activeOnly) {
    return await db.select().from(schema.newsTopics)
      .where(eq(schema.newsTopics.isActive, true))
      .orderBy(desc(schema.newsTopics.priority));
  }
  return await db.select().from(schema.newsTopics)
    .orderBy(desc(schema.newsTopics.priority));
}

export async function getBriefingRecipientsByType(briefingType: string): Promise<BriefingRecipient[]> {
  return await db.select().from(schema.briefingRecipients)
    .where(and(
      eq(schema.briefingRecipients.briefingType, briefingType as any),
      eq(schema.briefingRecipients.isActive, true)
    ));
}

export async function getNewsFeedbackStats(): Promise<{ thumbsUp: number; thumbsDown: number; byTopic: Record<string, { up: number; down: number }> }> {
  const rows = await db.select().from(schema.newsFeedback);
  let thumbsUp = 0;
  let thumbsDown = 0;
  const byTopic: Record<string, { up: number; down: number }> = {};
  
  for (const row of rows) {
    if (row.feedbackType === 'thumbs_up') thumbsUp++;
    else thumbsDown++;
    if (row.topicId) {
      if (!byTopic[row.topicId]) byTopic[row.topicId] = { up: 0, down: 0 };
      if (row.feedbackType === 'thumbs_up') byTopic[row.topicId].up++;
      else byTopic[row.topicId].down++;
    }
  }
  return { thumbsUp, thumbsDown, byTopic };
}

export async function getBriefingSettingByKey(key: string): Promise<string | null> {
  const [result] = await db.select({ settingValue: schema.briefingSettings.settingValue })
    .from(schema.briefingSettings)
    .where(eq(schema.briefingSettings.settingKey, key))
    .limit(1);
  return result?.settingValue || null;
}

// Insight and Entity Functions (additional)
export async function getLowConfidenceMemories(limit: number = 20): Promise<MemoryWithConfidence[]> {
  const allNotes = await getAllMemoryNotes();
  const withConfidence = allNotes.map(getMemoryWithConfidence);
  return withConfidence
    .filter(m => m.confidenceLevel === "low" && !m.isSuperseded)
    .sort((a, b) => a.effectiveConfidence - b.effectiveConfidence)
    .slice(0, limit);
}

export async function getMemoriesNeedingConfirmation(): Promise<MemoryWithConfidence[]> {
  const allNotes = await getAllMemoryNotes();
  const withConfidence = allNotes.map(getMemoryWithConfidence);
  return withConfidence
    .filter(m => m.needsConfirmation && !m.isSuperseded)
    .sort((a, b) => a.effectiveConfidence - b.effectiveConfidence);
}

export async function insightExistsForSource(type: string, sourceEntityId: string): Promise<boolean> {
  const [result] = await db.select({ id: schema.insights.id })
    .from(schema.insights)
    .where(and(
      eq(schema.insights.type, type as any),
      eq(schema.insights.sourceEntityId, sourceEntityId),
      inArray(schema.insights.status, ['new', 'surfaced'])
    ))
    .limit(1);
  return !!result;
}

export async function findInsightByTypeAndSource(type: string, sourceEntityId: string): Promise<Insight | undefined> {
  const [result] = await db.select().from(schema.insights)
    .where(and(
      eq(schema.insights.type, type as any),
      eq(schema.insights.sourceEntityId, sourceEntityId),
      inArray(schema.insights.status, ['new', 'surfaced'])
    ))
    .limit(1);
  return result;
}

export async function cleanupExpiredInsights(): Promise<number> {
  const now = getNow();
  await db.delete(schema.insights)
    .where(and(
      isNotNull(schema.insights.expiresAt),
      lt(schema.insights.expiresAt, now),
      notInArray(schema.insights.status, ['completed', 'dismissed'])
    ));
  return 0;
}

// Notification Functions
export async function getAllPendingNotifications(): Promise<NotificationQueueItem[]> {
  return await db.select().from(schema.notificationQueue)
    .where(isNull(schema.notificationQueue.sentAt))
    .orderBy(
      asc(schema.notificationQueue.recipientPhone),
      asc(schema.notificationQueue.createdAt)
    );
}

export async function clearOldNotifications(daysOld: number): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);
  await db.delete(schema.notificationQueue)
    .where(and(
      isNotNull(schema.notificationQueue.sentAt),
      lt(schema.notificationQueue.sentAt, cutoff.toISOString())
    ));
  return 0;
}

export async function createNotificationBatch(recipientPhone: string, notificationIds: string[], categories: string[]): Promise<NotificationBatch> {
  const id = uuidv4();
  const now = getNow();
  
  await db.insert(schema.notificationBatches).values({
    id,
    recipientPhone,
    notificationCount: notificationIds.length,
    categories: JSON.stringify(categories),
    sentAt: now,
  });
  
  // Mark all notifications as sent with this batch ID
  for (const notificationId of notificationIds) {
    await markNotificationSent(notificationId, id);
  }
  
  const [result] = await db.select().from(schema.notificationBatches).where(eq(schema.notificationBatches.id, id)).limit(1);
  return result;
}

export async function getNotificationQueueStats(): Promise<{
  pending: number;
  sentToday: number;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
}> {
  const pending = await db.select().from(schema.notificationQueue).where(isNull(schema.notificationQueue.sentAt));
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sent = await db.select().from(schema.notificationQueue)
    .where(and(
      isNotNull(schema.notificationQueue.sentAt),
      gte(schema.notificationQueue.sentAt, today.toISOString())
    ));
  
  const byCategory: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  
  for (const item of pending) {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    byPriority[item.priority] = (byPriority[item.priority] || 0) + 1;
  }
  
  return { pending: pending.length, sentToday: sent.length, byCategory, byPriority };
}

// NL Automation Functions
export async function createNLAutomationLog(data: {
  automationId: string;
  triggerData?: string;
  actionResult?: string;
  success: boolean;
  errorMessage?: string;
}): Promise<NLAutomationLog> {
  const id = uuidv4();
  const now = getNow();
  
  await db.insert(schema.nlAutomationLogs).values({
    id,
    automationId: data.automationId,
    triggerData: data.triggerData || null,
    actionResult: data.actionResult || null,
    success: data.success,
    errorMessage: data.errorMessage || null,
    executedAt: now,
  });
  
  const [result] = await db.select().from(schema.nlAutomationLogs).where(eq(schema.nlAutomationLogs.id, id)).limit(1);
  return result;
}

// Device Token Functions
export async function getAllDeviceTokens(): Promise<DeviceToken[]> {
  return await db.select().from(schema.deviceTokens)
    .orderBy(desc(schema.deviceTokens.lastUsedAt));
}

export async function deleteDeviceToken(token: string): Promise<void> {
  await db.delete(schema.deviceTokens)
    .where(eq(schema.deviceTokens.token, token));
}

// Twilio Messages Functions
export async function getAllTwilioMessages(): Promise<TwilioMessage[]> {
  return await db.select().from(schema.twilioMessages)
    .orderBy(desc(schema.twilioMessages.timestamp));
}

// Briefing Recipients Functions
export async function getAllBriefingRecipients(): Promise<BriefingRecipient[]> {
  return await db.select().from(schema.briefingRecipients)
    .orderBy(asc(schema.briefingRecipients.briefingType), asc(schema.briefingRecipients.name));
}

// Delete Functions
export async function deleteJournalEntry(id: string): Promise<boolean> {
  await db.delete(schema.journalEntries).where(eq(schema.journalEntries.id, id));
  return true;
}

export async function deleteMeeting(id: string): Promise<boolean> {
  await db.delete(schema.meetings).where(eq(schema.meetings.id, id));
  return true;
}

export async function deleteRecipe(id: string): Promise<boolean> {
  await db.delete(schema.recipes).where(eq(schema.recipes.id, id));
  return true;
}

export async function deletePrediction(id: string): Promise<boolean> {
  await db.delete(schema.predictions).where(eq(schema.predictions.id, id));
  return true;
}

export async function deletePattern(id: string): Promise<boolean> {
  await db.delete(schema.patterns).where(eq(schema.patterns.id, id));
  return true;
}

export async function deleteProfileSection(id: string): Promise<boolean> {
  await db.delete(schema.profileSections).where(eq(schema.profileSections.id, id));
  return true;
}

export async function deleteEntityLink(id: string): Promise<boolean> {
  await db.delete(schema.entityLinks).where(eq(schema.entityLinks.id, id));
  return true;
}

export async function deleteEntityReference(id: string): Promise<boolean> {
  await db.delete(schema.entityReferences).where(eq(schema.entityReferences.id, id));
  return true;
}

export async function deleteNotificationQueueItem(id: string): Promise<boolean> {
  await db.delete(schema.notificationQueue).where(eq(schema.notificationQueue.id, id));
  return true;
}

export async function deleteOmiSummary(id: string): Promise<boolean> {
  await db.delete(schema.omiSummaries).where(eq(schema.omiSummaries.id, id));
  return true;
}

// Insight Functions
export async function dismissInsight(id: string): Promise<boolean> {
  await db.update(schema.insights)
    .set({ status: 'dismissed' })
    .where(eq(schema.insights.id, id));
  return true;
}

export async function completeInsight(id: string): Promise<boolean> {
  await db.update(schema.insights)
    .set({ status: 'completed' })
    .where(eq(schema.insights.id, id));
  return true;
}

// NL Automation Additional Functions
export async function getNLAutomationsByTriggerType(triggerType: string): Promise<NLAutomation[]> {
  return await db.select().from(schema.nlAutomations)
    .where(and(
      eq(schema.nlAutomations.triggerType, triggerType as any),
      eq(schema.nlAutomations.enabled, true)
    ))
    .orderBy(desc(schema.nlAutomations.createdAt));
}

export async function recordNLAutomationTrigger(automationId: string): Promise<void> {
  const now = getNow();
  await db.update(schema.nlAutomations)
    .set({
      lastTriggeredAt: now,
      triggerCount: sql`${schema.nlAutomations.triggerCount} + 1`,
      updatedAt: now,
    })
    .where(eq(schema.nlAutomations.id, automationId));
}

// Push Token Functions
export async function deletePushToken(token: string): Promise<void> {
  await db.delete(schema.pushTokens)
    .where(eq(schema.pushTokens.token, token));
}

export async function disablePushToken(token: string): Promise<void> {
  await db.update(schema.pushTokens)
    .set({ isActive: false })
    .where(eq(schema.pushTokens.token, token));
}

// STT Functions
export async function deleteSttSession(id: string): Promise<void> {
  await db.delete(schema.sttSessions)
    .where(eq(schema.sttSessions.id, id));
}

export async function deleteSttSegmentsBySession(sessionId: string): Promise<void> {
  await db.delete(schema.sttSegments)
    .where(eq(schema.sttSegments.sessionId, sessionId));
}

// Location Functions (additional)
export async function deleteOldLocationHistory(daysOld: number): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);
  await db.delete(schema.locationHistory)
    .where(lt(schema.locationHistory.timestamp, cutoff.toISOString()));
  return 0;
}

export async function deleteOldLifelogLocations(daysOld: number): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);
  await db.delete(schema.lifelogLocations)
    .where(lt(schema.lifelogLocations.timestamp, cutoff.toISOString()));
  return 0;
}

export async function deleteOldProximityAlerts(daysOld: number): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);
  await db.delete(schema.proximityAlerts)
    .where(lt(schema.proximityAlerts.createdAt, cutoff.toISOString()));
  return 0;
}

// Proximity Alert Functions
export async function acknowledgeProximityAlert(id: string): Promise<boolean> {
  await db.update(schema.proximityAlerts)
    .set({ acknowledged: true })
    .where(eq(schema.proximityAlerts.id, id));
  return true;
}

export async function acknowledgeAllProximityAlerts(): Promise<number> {
  await db.update(schema.proximityAlerts)
    .set({ acknowledged: true })
    .where(eq(schema.proximityAlerts.acknowledged, false));
  return 0;
}

// Contacts Functions
export async function getContactsSince(since: string): Promise<Contact[]> {
  return await db.select().from(schema.contacts)
    .where(gte(schema.contacts.createdAt, since))
    .orderBy(desc(schema.contacts.createdAt));
}

// Lifelog Action Items
export async function getAllLifelogActionItems(): Promise<LifelogActionItem[]> {
  return await db.select().from(schema.lifelogActionItems)
    .orderBy(desc(schema.lifelogActionItems.createdAt));
}

export async function checkActionItemExists(lifelogId: string, actionText: string): Promise<boolean> {
  const [result] = await db.select({ id: schema.lifelogActionItems.id })
    .from(schema.lifelogActionItems)
    .where(and(
      eq(schema.lifelogActionItems.lifelogId, lifelogId),
      eq(schema.lifelogActionItems.actionText, actionText)
    ))
    .limit(1);
  return !!result;
}

// Memory Action Items
export async function createMemoryActionItem(data: InsertMemoryActionItem): Promise<MemoryActionItem> {
  const id = uuidv4();
  const now = getNow();
  await db.insert(schema.memoryActionItems).values({
    ...data,
    id,
    createdAt: now,
  });
  const [result] = await db.select().from(schema.memoryActionItems).where(eq(schema.memoryActionItems.id, id)).limit(1);
  return result;
}

export async function checkMemoryActionItemExists(memoryId: string, actionText: string): Promise<boolean> {
  const [result] = await db.select({ id: schema.memoryActionItems.id })
    .from(schema.memoryActionItems)
    .where(and(
      eq(schema.memoryActionItems.memoryId, memoryId),
      eq(schema.memoryActionItems.actionText, actionText)
    ))
    .limit(1);
  return !!result;
}

// Memory Relationship Functions
export async function createMemoryRelationship(data: InsertMemoryRelationship): Promise<MemoryRelationship> {
  const id = uuidv4();
  const now = getNow();
  await db.insert(schema.memoryRelationships).values({
    ...data,
    id,
    createdAt: now,
  });
  const [result] = await db.select().from(schema.memoryRelationships).where(eq(schema.memoryRelationships.id, id)).limit(1);
  return result;
}

export async function findMemoryRelationship(fromMemoryId: string, toMemoryId: string): Promise<MemoryRelationship | null> {
  const [result] = await db.select().from(schema.memoryRelationships)
    .where(and(
      eq(schema.memoryRelationships.fromMemoryId, fromMemoryId),
      eq(schema.memoryRelationships.toMemoryId, toMemoryId)
    ))
    .limit(1);
  return result ?? null;
}

// OMI Analytics Functions
export async function createOrUpdateOmiAnalyticsDaily(data: InsertOmiAnalyticsDaily): Promise<OmiAnalyticsDaily> {
  const now = getNow();
  const [existing] = await db.select().from(schema.omiAnalyticsDaily)
    .where(eq(schema.omiAnalyticsDaily.date, data.date))
    .limit(1);
  
  if (existing) {
    await db.update(schema.omiAnalyticsDaily)
      .set({ ...data, updatedAt: now })
      .where(eq(schema.omiAnalyticsDaily.id, existing.id));
    const [result] = await db.select().from(schema.omiAnalyticsDaily).where(eq(schema.omiAnalyticsDaily.id, existing.id)).limit(1);
    return result;
  } else {
    const id = uuidv4();
    await db.insert(schema.omiAnalyticsDaily).values({
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    });
    const [result] = await db.select().from(schema.omiAnalyticsDaily).where(eq(schema.omiAnalyticsDaily.id, id)).limit(1);
    return result;
  }
}

// Additional Custom List Functions (unique)
export async function getCustomListByName(name: string): Promise<CustomList | undefined> {
  const [result] = await db.select().from(schema.customLists)
    .where(eq(sql`LOWER(${schema.customLists.name})`, name.toLowerCase()))
    .limit(1);
  return result;
}

export async function getCustomListsByType(type: string): Promise<CustomList[]> {
  return await db.select().from(schema.customLists)
    .where(eq(schema.customLists.type, type as any))
    .orderBy(desc(schema.customLists.createdAt));
}

export async function getCustomListItem(id: string): Promise<CustomListItem | undefined> {
  const [result] = await db.select().from(schema.customListItems)
    .where(eq(schema.customListItems.id, id))
    .limit(1);
  return result;
}

// Batch Job Stats Functions
export async function getBatchJobStats(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}> {
  const all = await db.select().from(schema.batchJobs);
  return {
    pending: all.filter(j => j.status === 'pending').length,
    processing: all.filter(j => j.status === 'processing').length,
    completed: all.filter(j => j.status === 'completed').length,
    failed: all.filter(j => j.status === 'failed').length,
  };
}

export async function getArtifactCountByJob(jobId: string): Promise<number> {
  const artifacts = await db.select().from(schema.batchJobArtifacts)
    .where(eq(schema.batchJobArtifacts.jobId, jobId));
  return artifacts.length;
}

// Anticipatory Actions
export async function getAnticipatoryActionById(id: string): Promise<AnticipatoryAction | undefined> {
  const [result] = await db.select().from(schema.anticipatoryActions)
    .where(eq(schema.anticipatoryActions.id, id))
    .limit(1);
  return result;
}

export async function getAnticipatoryActionsByPrediction(predictionId: string): Promise<AnticipatoryAction[]> {
  return await db.select().from(schema.anticipatoryActions)
    .where(eq(schema.anticipatoryActions.predictionId, predictionId));
}

// Conversation Metrics
export async function getConversationMetricById(id: string): Promise<ConversationMetric | undefined> {
  const [result] = await db.select().from(schema.conversationMetrics)
    .where(eq(schema.conversationMetrics.id, id))
    .limit(1);
  return result;
}

export async function getConversationsByPhone(phone: string): Promise<Conversation[]> {
  const normalized = normalizePhoneNumber(phone);
  return await db.select().from(schema.conversations)
    .where(eq(schema.conversations.fromNumber, normalized))
    .orderBy(desc(schema.conversations.startedAt));
}

// Correction Events
export async function getCorrectionEvent(id: string): Promise<CorrectionEvent | undefined> {
  const [result] = await db.select().from(schema.correctionEvents)
    .where(eq(schema.correctionEvents.id, id))
    .limit(1);
  return result;
}

export async function getCorrectionEventsByDomain(domain: string): Promise<CorrectionEvent[]> {
  return await db.select().from(schema.correctionEvents)
    .where(eq(schema.correctionEvents.domain, domain))
    .orderBy(desc(schema.correctionEvents.createdAt));
}

// Entity Functions
export async function getEntityByLabel(label: string): Promise<Entity | undefined> {
  const [result] = await db.select().from(schema.entities)
    .where(eq(sql`LOWER(${schema.entities.label})`, label.toLowerCase()))
    .limit(1);
  return result;
}

export async function getEntityLinksByType(relationshipType: string): Promise<EntityLink[]> {
  return await db.select().from(schema.entityLinks)
    .where(eq(schema.entityLinks.relationshipType, relationshipType as any))
    .orderBy(desc(schema.entityLinks.weight));
}

export async function getEntityReference(id: string): Promise<EntityReference | undefined> {
  const [result] = await db.select().from(schema.entityReferences)
    .where(eq(schema.entityReferences.id, id))
    .limit(1);
  return result;
}

export async function getEntityWithReferences(entityId: string): Promise<{ entity: Entity; references: EntityReference[] } | undefined> {
  const entity = await getEntity(entityId);
  if (!entity) return undefined;
  
  const references = await db.select().from(schema.entityReferences)
    .where(eq(schema.entityReferences.entityId, entityId));
  
  return { entity, references };
}

// Family Members
export async function getFamilyMembers(): Promise<Contact[]> {
  return await db.select().from(schema.contacts)
    .where(eq(schema.contacts.relationship, 'family'))
    .orderBy(asc(schema.contacts.firstName));
}

// Feedback Events
export async function getFeedbackEventsByRefCode(refCode: string): Promise<FeedbackEvent[]> {
  return await db.select().from(schema.feedbackEvents)
    .where(eq(schema.feedbackEvents.refCode, refCode))
    .orderBy(desc(schema.feedbackEvents.createdAt));
}

export async function getOrCreateContactForPhone(phone: string): Promise<Contact> {
  const normalizedPhone = normalizePhoneNumber(phone);
  
  const existing = await getContactByPhone(phone);
  if (existing) return existing;
  
  if (isMasterAdmin(phone)) {
    return await createContact({
      firstName: "Admin",
      lastName: "",
      phoneNumber: normalizedPhone,
      accessLevel: "admin",
      relationship: "Owner",
      notes: "Master admin account",
      canAccessPersonalInfo: true,
      canAccessCalendar: true,
      canAccessTasks: true,
      canAccessGrocery: true,
      canTriggerAutomations: true,
      canReceiveNotifications: true,
    } as any);
  }
  
  return await createContact({
    firstName: "Unknown",
    lastName: "",
    phoneNumber: normalizedPhone,
    accessLevel: "basic",
    relationship: "Unknown",
    notes: "Auto-created contact from incoming message",
    canAccessPersonalInfo: false,
    canAccessCalendar: false,
    canAccessTasks: false,
    canAccessGrocery: false,
    canTriggerAutomations: false,
    canReceiveNotifications: false,
  } as any);
}

// Location Functions
export async function getLocationSamples(options: { since?: string; limit?: number } = {}): Promise<LocationSample[]> {
  const { since, limit = 100 } = options;
  let query = db.select().from(schema.locationSamples).orderBy(desc(schema.locationSamples.timestamp)).limit(limit);
  if (since) {
    query = db.select().from(schema.locationSamples).where(gte(schema.locationSamples.timestamp, since)).orderBy(desc(schema.locationSamples.timestamp)).limit(limit);
  }
  return await query;
}

export async function getLocationVisits(options: { since?: string; limit?: number } = {}): Promise<LocationVisit[]> {
  const { since, limit = 50 } = options;
  let query = db.select().from(schema.locationVisits).orderBy(desc(schema.locationVisits.arrivalTime)).limit(limit);
  if (since) {
    query = db.select().from(schema.locationVisits).where(gte(schema.locationVisits.arrivalTime, since)).orderBy(desc(schema.locationVisits.arrivalTime)).limit(limit);
  }
  return await query;
}

export async function getCurrentVisit(): Promise<LocationVisit | undefined> {
  const [result] = await db.select().from(schema.locationVisits)
    .where(isNull(schema.locationVisits.departureTime))
    .orderBy(desc(schema.locationVisits.arrivalTime))
    .limit(1);
  return result;
}

export async function createLocationVisit(data: InsertLocationVisit): Promise<LocationVisit> {
  const id = `visit_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const now = getNow();
  await db.insert(schema.locationVisits).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  });
  const [result] = await db.select().from(schema.locationVisits).where(eq(schema.locationVisits.id, id)).limit(1);
  return result;
}

export async function createLocationSamples(samples: Array<Omit<InsertLocationSample, "id">>): Promise<LocationSample[]> {
  const now = getNow();
  const created: LocationSample[] = [];
  for (const sample of samples) {
    const id = `sample_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await db.insert(schema.locationSamples).values({
      ...sample,
      id,
      createdAt: now,
    } as any);
    const [result] = await db.select().from(schema.locationSamples).where(eq(schema.locationSamples.id, id)).limit(1);
    if (result) created.push(result);
  }
  return created;
}

export async function updateLocationVisit(id: string, data: Partial<InsertLocationVisit>): Promise<LocationVisit | undefined> {
  const now = getNow();
  await db.update(schema.locationVisits)
    .set({ ...data, updatedAt: now })
    .where(eq(schema.locationVisits.id, id));
  const [result] = await db.select().from(schema.locationVisits).where(eq(schema.locationVisits.id, id)).limit(1);
  return result;
}

// Master Admin Check
export function isMasterAdmin(phone: string): boolean {
  const masterPhone = process.env.MASTER_PHONE_NUMBER;
  if (!masterPhone) return false;
  return normalizePhoneNumber(phone) === normalizePhoneNumber(masterPhone);
}

// Push Token Functions
export async function getPushTokens(): Promise<PushToken[]> {
  return await db.select().from(schema.pushTokens);
}

export async function getPushTokenByDevice(deviceId: string): Promise<PushToken | undefined> {
  const [result] = await db.select().from(schema.pushTokens)
    .where(eq(schema.pushTokens.deviceId, deviceId))
    .limit(1);
  return result;
}

export async function registerPushToken(data: InsertPushToken): Promise<PushToken> {
  const now = getNow();
  const existing = await getPushTokenByDevice(data.deviceId);
  if (existing) {
    await db.update(schema.pushTokens)
      .set({ token: data.token, updatedAt: now })
      .where(eq(schema.pushTokens.deviceId, data.deviceId));
    const [result] = await db.select().from(schema.pushTokens).where(eq(schema.pushTokens.deviceId, data.deviceId)).limit(1);
    return result;
  }
  const id = uuidv4();
  await db.insert(schema.pushTokens).values({ ...data, id, createdAt: now, updatedAt: now });
  const [result] = await db.select().from(schema.pushTokens).where(eq(schema.pushTokens.id, id)).limit(1);
  return result;
}

// Journal Entry Functions  
export async function getJournalEntries(limit = 50): Promise<JournalEntry[]> {
  return await db.select().from(schema.journalEntries)
    .orderBy(desc(schema.journalEntries.createdAt))
    .limit(limit);
}

export async function getJournalEntriesInRange(startDate: string, endDate: string): Promise<JournalEntry[]> {
  return await db.select().from(schema.journalEntries)
    .where(and(
      gte(schema.journalEntries.createdAt, startDate),
      lte(schema.journalEntries.createdAt, endDate)
    ))
    .orderBy(desc(schema.journalEntries.createdAt));
}

export async function getJournalEntryById(id: string): Promise<JournalEntry | undefined> {
  const [result] = await db.select().from(schema.journalEntries)
    .where(eq(schema.journalEntries.id, id))
    .limit(1);
  return result;
}

export async function getJournalEntryCount(): Promise<number> {
  const entries = await db.select().from(schema.journalEntries);
  return entries.length;
}

export async function updateJournalEntry(id: string, data: Partial<InsertJournalEntry>): Promise<JournalEntry | undefined> {
  const now = getNow();
  await db.update(schema.journalEntries)
    .set({ ...data, updatedAt: now })
    .where(eq(schema.journalEntries.id, id));
  return await getJournalEntryById(id);
}

// Insight Functions
export async function getInsightsByCategory(category: string): Promise<Insight[]> {
  return await db.select().from(schema.insights)
    .where(eq(schema.insights.category, category as any))
    .orderBy(desc(schema.insights.createdAt));
}

export async function getInsightsByStatus(status: string): Promise<Insight[]> {
  return await db.select().from(schema.insights)
    .where(eq(schema.insights.status, status as any))
    .orderBy(desc(schema.insights.createdAt));
}

export async function getInsightsByType(insightType: string): Promise<Insight[]> {
  return await db.select().from(schema.insights)
    .where(eq(schema.insights.type, insightType as any))
    .orderBy(desc(schema.insights.createdAt));
}

export async function getInsightStats(): Promise<{ total: number; pending: number; surfaced: number; dismissed: number }> {
  const all = await db.select().from(schema.insights);
  return {
    total: all.length,
    pending: all.filter(i => i.status === 'pending').length,
    surfaced: all.filter(i => i.status === 'surfaced').length,
    dismissed: all.filter(i => i.status === 'dismissed').length,
  };
}

export async function snoozeInsight(id: string, until: string): Promise<Insight | undefined> {
  const now = getNow();
  await db.update(schema.insights)
    .set({ status: 'snoozed' as any, snoozedUntil: until, updatedAt: now })
    .where(eq(schema.insights.id, id));
  return await getInsight(id);
}

export async function surfaceInsight(id: string): Promise<Insight | undefined> {
  const now = getNow();
  await db.update(schema.insights)
    .set({ status: 'surfaced' as any, surfacedAt: now, updatedAt: now })
    .where(eq(schema.insights.id, id));
  return await getInsight(id);
}

// NL Automation Log Functions
export async function getNLAutomationLog(id: string): Promise<NLAutomationLog | undefined> {
  const [result] = await db.select().from(schema.nlAutomationLogs)
    .where(eq(schema.nlAutomationLogs.id, id))
    .limit(1);
  return result;
}

export async function getNLAutomationLogs(automationId: string, limit = 50): Promise<NLAutomationLog[]> {
  return await db.select().from(schema.nlAutomationLogs)
    .where(eq(schema.nlAutomationLogs.automationId, automationId))
    .orderBy(desc(schema.nlAutomationLogs.executedAt))
    .limit(limit);
}

export async function getNLAutomationStats(automationId: string): Promise<{ total: number; successful: number; failed: number }> {
  const logs = await getNLAutomationLogs(automationId, 1000);
  return {
    total: logs.length,
    successful: logs.filter(l => l.success).length,
    failed: logs.filter(l => !l.success).length,
  };
}

export async function getRecentNLAutomationLogs(limit = 50): Promise<NLAutomationLog[]> {
  return await db.select().from(schema.nlAutomationLogs)
    .orderBy(desc(schema.nlAutomationLogs.executedAt))
    .limit(limit);
}

// Notification Functions
export async function getNotificationBatch(id: string): Promise<NotificationBatch | undefined> {
  const [result] = await db.select().from(schema.notificationBatches)
    .where(eq(schema.notificationBatches.id, id))
    .limit(1);
  return result;
}

export async function getNotificationQueueItem(id: string): Promise<NotificationQueueItem | undefined> {
  const [result] = await db.select().from(schema.notificationQueue)
    .where(eq(schema.notificationQueue.id, id))
    .limit(1);
  return result;
}

export async function getRecentBatches(limit = 20): Promise<NotificationBatch[]> {
  return await db.select().from(schema.notificationBatches)
    .orderBy(desc(schema.notificationBatches.createdAt))
    .limit(limit);
}

export async function markNotificationSent(id: string): Promise<void> {
  const now = getNow();
  await db.update(schema.notificationQueue)
    .set({ status: 'sent' as any, sentAt: now, updatedAt: now })
    .where(eq(schema.notificationQueue.id, id));
}

// Outbound Message Functions
export async function getOutboundMessageByRefCode(refCode: string): Promise<OutboundMessage | undefined> {
  const [result] = await db.select().from(schema.outboundMessages)
    .where(eq(schema.outboundMessages.refCode, refCode))
    .limit(1);
  return result;
}

export async function getRecentOutboundMessages(limit = 50): Promise<OutboundMessage[]> {
  return await db.select().from(schema.outboundMessages)
    .orderBy(desc(schema.outboundMessages.createdAt))
    .limit(limit);
}

export async function updateOutboundMessageSid(id: string, messageSid: string): Promise<void> {
  await db.update(schema.outboundMessages)
    .set({ twilioMessageSid: messageSid })
    .where(eq(schema.outboundMessages.id, id));
}

// OMI Functions
export async function getOmiMemoryById(id: string): Promise<OmiMemory | undefined> {
  const [result] = await db.select().from(schema.omiMemories)
    .where(eq(schema.omiMemories.id, id))
    .limit(1);
  return result;
}

export async function getOmiMemoriesByContextCategory(category: string): Promise<OmiMemory[]> {
  return await db.select().from(schema.omiMemories)
    .where(eq(schema.omiMemories.contextCategory, category))
    .orderBy(desc(schema.omiMemories.createdAt));
}

export async function updateOmiMemoryContext(id: string, contextData: any): Promise<OmiMemory | undefined> {
  const now = getNow();
  await db.update(schema.omiMemories)
    .set({ contextData: JSON.stringify(contextData), updatedAt: now })
    .where(eq(schema.omiMemories.id, id));
  return await getOmiMemoryById(id);
}

export async function getOmiSummaryById(id: string): Promise<OmiSummary | undefined> {
  const [result] = await db.select().from(schema.omiSummaries)
    .where(eq(schema.omiSummaries.id, id))
    .limit(1);
  return result;
}

export async function getOmiAnalyticsByDate(date: string): Promise<OmiAnalyticsDaily | undefined> {
  const [result] = await db.select().from(schema.omiAnalyticsDaily)
    .where(eq(schema.omiAnalyticsDaily.date, date))
    .limit(1);
  return result;
}

export async function getOmiAnalyticsInRange(startDate: string, endDate: string): Promise<OmiAnalyticsDaily[]> {
  return await db.select().from(schema.omiAnalyticsDaily)
    .where(and(
      gte(schema.omiAnalyticsDaily.date, startDate),
      lte(schema.omiAnalyticsDaily.date, endDate)
    ))
    .orderBy(desc(schema.omiAnalyticsDaily.date));
}

export async function getRecentOmiAnalytics(limit = 30): Promise<OmiAnalyticsDaily[]> {
  return await db.select().from(schema.omiAnalyticsDaily)
    .orderBy(desc(schema.omiAnalyticsDaily.date))
    .limit(limit);
}

// Profile Functions
export async function getFullProfile(): Promise<Record<string, any>> {
  const sections = await db.select().from(schema.profileSections);
  const profile: Record<string, any> = {};
  for (const section of sections) {
    try {
      profile[section.sectionKey] = JSON.parse(section.data || '{}');
    } catch {
      profile[section.sectionKey] = section.data;
    }
  }
  return profile;
}

export async function getProfileContextForAgent(): Promise<string> {
  const profile = await getFullProfile();
  return JSON.stringify(profile, null, 2);
}

export async function upsertProfileSection(sectionKey: string, data: any): Promise<ProfileSection> {
  const now = getNow();
  const [existing] = await db.select().from(schema.profileSections)
    .where(eq(schema.profileSections.sectionKey, sectionKey))
    .limit(1);
  
  if (existing) {
    await db.update(schema.profileSections)
      .set({ data: JSON.stringify(data), updatedAt: now })
      .where(eq(schema.profileSections.sectionKey, sectionKey));
    const [result] = await db.select().from(schema.profileSections).where(eq(schema.profileSections.sectionKey, sectionKey)).limit(1);
    return result;
  }
  
  const id = uuidv4();
  await db.insert(schema.profileSections).values({
    id,
    sectionKey,
    data: JSON.stringify(data),
    createdAt: now,
    updatedAt: now,
  });
  const [result] = await db.select().from(schema.profileSections).where(eq(schema.profileSections.id, id)).limit(1);
  return result;
}

// Shared Custom Lists
export async function getSharedCustomLists(): Promise<CustomList[]> {
  return await db.select().from(schema.customLists)
    .where(eq(schema.customLists.isShared, true))
    .orderBy(desc(schema.customLists.createdAt));
}

// Sync State Functions
export async function getSyncState(key: string): Promise<SyncState | undefined> {
  const [result] = await db.select().from(schema.syncStates)
    .where(eq(schema.syncStates.key, key))
    .limit(1);
  return result;
}

// Meeting Functions
export async function getMeetingByLifelogId(lifelogId: string): Promise<Meeting | undefined> {
  const [result] = await db.select().from(schema.meetings)
    .where(eq(schema.meetings.lifelogId, lifelogId))
    .limit(1);
  return result;
}

export async function getMeetingByMemoryId(memoryId: string): Promise<Meeting | undefined> {
  const [result] = await db.select().from(schema.meetings)
    .where(eq(schema.meetings.omiMemoryId, memoryId))
    .limit(1);
  return result;
}

export async function getMeetingsByDate(date: string): Promise<Meeting[]> {
  return await db.select().from(schema.meetings)
    .where(like(schema.meetings.startTime, `${date}%`))
    .orderBy(asc(schema.meetings.startTime));
}

export async function getMeetingsInRange(startDate: string, endDate: string): Promise<Meeting[]> {
  return await db.select().from(schema.meetings)
    .where(and(
      gte(schema.meetings.startTime, startDate),
      lte(schema.meetings.startTime, endDate)
    ))
    .orderBy(asc(schema.meetings.startTime));
}

export async function getImportantMeetings(): Promise<Meeting[]> {
  return await db.select().from(schema.meetings)
    .where(eq(schema.meetings.importance, 'high' as any))
    .orderBy(desc(schema.meetings.startTime));
}

export async function updateMeeting(id: string, data: Partial<InsertMeeting>): Promise<Meeting | undefined> {
  const now = getNow();
  await db.update(schema.meetings)
    .set({ ...data, updatedAt: now })
    .where(eq(schema.meetings.id, id));
  const [result] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, id)).limit(1);
  return result;
}

// Location Analysis Functions
export async function analyzeLocationPatterns(): Promise<any[]> {
  const visits = await db.select().from(schema.locationVisits).orderBy(desc(schema.locationVisits.arrivalTime)).limit(100);
  return visits;
}

export async function aggregateSamplesToVisit(samples: LocationSample[]): Promise<LocationVisit | null> {
  if (samples.length === 0) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  return await createLocationVisit({
    latitude: first.latitude,
    longitude: first.longitude,
    radiusMeters: '50',
    arrivalTime: first.timestamp,
    departureTime: last.timestamp,
    sampleCount: samples.length,
    confidence: '0.8',
  } as any);
}

export async function buildUnifiedTimeline(startDate: string, endDate: string): Promise<any[]> {
  const visits = await getLocationVisits({ since: startDate, limit: 100 });
  return visits.map(v => ({ type: 'visit', data: v, timestamp: v.arrivalTime }));
}

export function calculateEffectiveConfidence(baseConfidence: number, factors: Record<string, number>): number {
  let confidence = baseConfidence;
  for (const factor of Object.values(factors)) {
    confidence *= factor;
  }
  return Math.min(1, Math.max(0, confidence));
}

export function detectActivityFromGpsPattern(samples: LocationSample[]): string {
  if (samples.length < 2) return 'stationary';
  const speeds = samples.map(s => parseFloat(s.speed || '0')).filter(s => !isNaN(s));
  const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
  if (avgSpeed > 20) return 'driving';
  if (avgSpeed > 5) return 'cycling';
  if (avgSpeed > 1) return 'walking';
  return 'stationary';
}

export async function findNearbyStarredPlaces(lat: number, lng: number, radiusKm: number = 0.5): Promise<SavedPlace[]> {
  const places = await db.select().from(schema.savedPlaces).where(eq(schema.savedPlaces.isStarred, true));
  return places.filter(p => {
    const placeLat = parseFloat(p.latitude || '0');
    const placeLng = parseFloat(p.longitude || '0');
    const dist = Math.sqrt(Math.pow(placeLat - lat, 2) + Math.pow(placeLng - lng, 2)) * 111;
    return dist <= radiusKm;
  });
}

export async function getAllLocationLinkedItems(placeId: string): Promise<any[]> {
  const customListItems = await db.select().from(schema.customListItems).where(eq(schema.customListItems.linkedPlaceId, placeId));
  const groceryItems = await db.select().from(schema.groceryItems).where(eq(schema.groceryItems.linkedPlaceId, placeId));
  return [...customListItems, ...groceryItems];
}

// Device Token Functions
export async function getDeviceTokenByDeviceId(deviceId: string): Promise<DeviceToken | undefined> {
  const [result] = await db.select().from(schema.deviceTokens)
    .where(eq(schema.deviceTokens.deviceId, deviceId))
    .limit(1);
  return result;
}

// Entity Link Functions
export async function getEntityLink(id: string): Promise<EntityLink | undefined> {
  const [result] = await db.select().from(schema.entityLinks)
    .where(eq(schema.entityLinks.id, id))
    .limit(1);
  return result;
}

export async function updateEntityLink(id: string, data: Partial<InsertEntityLink>): Promise<EntityLink | undefined> {
  const now = getNow();
  await db.update(schema.entityLinks)
    .set({ ...data, updatedAt: now })
    .where(eq(schema.entityLinks.id, id));
  const [result] = await db.select().from(schema.entityLinks).where(eq(schema.entityLinks.id, id)).limit(1);
  return result;
}

// STT Functions
export async function getFinalSttSegmentsBySession(sessionId: string): Promise<SttSegment[]> {
  return await db.select().from(schema.sttSegments)
    .where(and(eq(schema.sttSegments.sessionId, sessionId), eq(schema.sttSegments.isFinal, true)))
    .orderBy(asc(schema.sttSegments.startMs));
}

export async function getSttSegmentsBySession(sessionId: string): Promise<SttSegment[]> {
  return await db.select().from(schema.sttSegments)
    .where(eq(schema.sttSegments.sessionId, sessionId))
    .orderBy(asc(schema.sttSegments.startMs));
}

export async function getSttSessionsByDevice(deviceId: string, limit = 20): Promise<SttSession[]> {
  return await db.select().from(schema.sttSessions)
    .where(eq(schema.sttSessions.deviceId, deviceId))
    .orderBy(desc(schema.sttSessions.startedAt))
    .limit(limit);
}

// Food Preferences
export async function getFoodPreferencesByType(type: string): Promise<FoodPreference[]> {
  return await db.select().from(schema.foodPreferences)
    .where(eq(schema.foodPreferences.preferenceType, type as any))
    .orderBy(desc(schema.foodPreferences.strength));
}

// Grocery Functions
export async function getGroceryItemsSince(since: string): Promise<GroceryItem[]> {
  return await db.select().from(schema.groceryItems)
    .where(gte(schema.groceryItems.createdAt, since))
    .orderBy(desc(schema.groceryItems.createdAt));
}

export async function getGroceryLinkedPlaceLists(): Promise<any[]> {
  const items = await db.select().from(schema.groceryItems)
    .where(isNotNull(schema.groceryItems.linkedPlaceId));
  return items;
}

// Learned Preferences
export async function getLearnedPreferencesByCategory(category: string): Promise<LearnedPreference[]> {
  return await db.select().from(schema.learnedPreferences)
    .where(eq(schema.learnedPreferences.category, category))
    .orderBy(desc(schema.learnedPreferences.confidence));
}

// Lifelog Functions
export async function getLifelogActionItem(id: string): Promise<LifelogActionItem | undefined> {
  const [result] = await db.select().from(schema.lifelogActionItems)
    .where(eq(schema.lifelogActionItems.id, id))
    .limit(1);
  return result;
}

export async function getLifelogActionItemsByLifelog(lifelogId: string): Promise<LifelogActionItem[]> {
  return await db.select().from(schema.lifelogActionItems)
    .where(eq(schema.lifelogActionItems.lifelogId, lifelogId))
    .orderBy(asc(schema.lifelogActionItems.createdAt));
}

export async function getLifelogLocation(id: string): Promise<LifelogLocation | undefined> {
  const [result] = await db.select().from(schema.lifelogLocations)
    .where(eq(schema.lifelogLocations.id, id))
    .limit(1);
  return result;
}

export async function getLifelogLocationsInRange(startDate: string, endDate: string): Promise<LifelogLocation[]> {
  return await db.select().from(schema.lifelogLocations)
    .where(and(
      gte(schema.lifelogLocations.startTime, startDate),
      lte(schema.lifelogLocations.startTime, endDate)
    ))
    .orderBy(asc(schema.lifelogLocations.startTime));
}

export async function getLifelogsByActivity(activity: string): Promise<Lifelog[]> {
  return await db.select().from(schema.lifelogs)
    .where(eq(schema.lifelogs.activity, activity))
    .orderBy(desc(schema.lifelogs.startTime));
}

export async function upsertLifelogLocation(data: InsertLifelogLocation): Promise<LifelogLocation> {
  const now = getNow();
  const id = uuidv4();
  await db.insert(schema.lifelogLocations).values({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  });
  const [result] = await db.select().from(schema.lifelogLocations).where(eq(schema.lifelogLocations.id, id)).limit(1);
  return result;
}

// Place Lists
export async function getListsForPlace(placeId: string): Promise<CustomList[]> {
  const items = await db.select().from(schema.customListItems)
    .where(eq(schema.customListItems.linkedPlaceId, placeId));
  const listIds = [...new Set(items.map(i => i.listId))];
  const lists: CustomList[] = [];
  for (const listId of listIds) {
    const list = await getCustomList(listId);
    if (list) lists.push(list);
  }
  return lists;
}

// Location State Tracking
export async function getLocationStateTrackingByPlace(placeId: string): Promise<LocationStateTracking | undefined> {
  const [result] = await db.select().from(schema.locationStateTracking)
    .where(eq(schema.locationStateTracking.placeId, placeId))
    .limit(1);
  return result;
}

export async function getRecentLocationStateTracking(limit = 20): Promise<LocationStateTracking[]> {
  return await db.select().from(schema.locationStateTracking)
    .orderBy(desc(schema.locationStateTracking.lastCheckedAt))
    .limit(limit);
}

export async function updateLocationStateTrackingSms(id: string, smsSent: boolean): Promise<void> {
  const now = getNow();
  await db.update(schema.locationStateTracking)
    .set({ smsSent, updatedAt: now })
    .where(eq(schema.locationStateTracking.id, id));
}

// Meal History
export async function getMealHistoryEntry(id: string): Promise<MealHistoryEntry | undefined> {
  const [result] = await db.select().from(schema.mealHistory)
    .where(eq(schema.mealHistory.id, id))
    .limit(1);
  return result;
}

export async function getMostCookedMeals(limit = 10): Promise<any[]> {
  return await db.select().from(schema.mealHistory)
    .orderBy(desc(schema.mealHistory.createdAt))
    .limit(limit);
}

export async function updateMealRating(id: string, rating: number): Promise<void> {
  const now = getNow();
  await db.update(schema.mealHistory)
    .set({ rating, updatedAt: now })
    .where(eq(schema.mealHistory.id, id));
}

// Memory Functions
export async function getMemoryActionItemsByMemory(memoryId: string): Promise<MemoryActionItem[]> {
  return await db.select().from(schema.memoryActionItems)
    .where(eq(schema.memoryActionItems.memoryId, memoryId))
    .orderBy(asc(schema.memoryActionItems.createdAt));
}

export async function getMemoryRelationshipById(id: string): Promise<MemoryRelationship | undefined> {
  const [result] = await db.select().from(schema.memoryRelationships)
    .where(eq(schema.memoryRelationships.id, id))
    .limit(1);
  return result;
}

export async function incrementMemoryRelationshipStrength(id: string): Promise<void> {
  const now = getNow();
  await db.update(schema.memoryRelationships)
    .set({ 
      strength: sql`${schema.memoryRelationships.strength} + 1`,
      updatedAt: now 
    })
    .where(eq(schema.memoryRelationships.id, id));
}

export async function updateMemoryActionItem(id: string, data: Partial<InsertMemoryActionItem>): Promise<MemoryActionItem | undefined> {
  const now = getNow();
  await db.update(schema.memoryActionItems)
    .set({ ...data, updatedAt: now })
    .where(eq(schema.memoryActionItems.id, id));
  const [result] = await db.select().from(schema.memoryActionItems).where(eq(schema.memoryActionItems.id, id)).limit(1);
  return result;
}

export async function updateMemoryConfidence(id: string, confidence: number): Promise<void> {
  const now = getNow();
  await db.update(schema.memories)
    .set({ confidence: confidence.toString(), updatedAt: now })
    .where(eq(schema.memories.id, id));
}

// Message Count
export async function getMessageCountForPhone(phone: string): Promise<number> {
  const normalized = normalizePhoneNumber(phone);
  const messages = await db.select().from(schema.twilioMessages)
    .where(or(
      eq(schema.twilioMessages.fromNumber, normalized),
      eq(schema.twilioMessages.toNumber, normalized)
    ));
  return messages.length;
}

// Metrics
export async function getMetricsByConversation(conversationId: string): Promise<ConversationMetric[]> {
  return await db.select().from(schema.conversationMetrics)
    .where(eq(schema.conversationMetrics.conversationId, conversationId))
    .orderBy(desc(schema.conversationMetrics.createdAt));
}

export async function getMetricsByTool(toolName: string): Promise<ToolMetric[]> {
  return await db.select().from(schema.toolMetrics)
    .where(eq(schema.toolMetrics.toolName, toolName))
    .orderBy(desc(schema.toolMetrics.createdAt));
}

export async function getRecentMetrics(limit = 50): Promise<ToolMetric[]> {
  return await db.select().from(schema.toolMetrics)
    .orderBy(desc(schema.toolMetrics.createdAt))
    .limit(limit);
}

// News Functions
export async function getNewsFeedbackByTopic(topic: string): Promise<NewsFeedback[]> {
  return await db.select().from(schema.newsFeedback)
    .where(eq(schema.newsFeedback.topic, topic))
    .orderBy(desc(schema.newsFeedback.createdAt));
}

export async function getNewsStoryByMessageId(messageId: string): Promise<NewsStory | undefined> {
  const [result] = await db.select().from(schema.newsStories)
    .where(eq(schema.newsStories.sentMessageId, messageId))
    .limit(1);
  return result;
}

export async function updateNewsStorySent(id: string, messageId: string): Promise<void> {
  const now = getNow();
  await db.update(schema.newsStories)
    .set({ sentMessageId: messageId, sentAt: now, updatedAt: now })
    .where(eq(schema.newsStories.id, id));
}

// Pattern Functions
export async function getPatternById(id: string): Promise<Pattern | undefined> {
  const [result] = await db.select().from(schema.patterns)
    .where(eq(schema.patterns.id, id))
    .limit(1);
  return result;
}

// Prediction Functions
export async function getPredictionFeedbackById(id: string): Promise<PredictionFeedback | undefined> {
  const [result] = await db.select().from(schema.predictionFeedback)
    .where(eq(schema.predictionFeedback.id, id))
    .limit(1);
  return result;
}

export async function getPredictionFeedbackByPrediction(predictionId: string): Promise<PredictionFeedback[]> {
  return await db.select().from(schema.predictionFeedback)
    .where(eq(schema.predictionFeedback.predictionId, predictionId))
    .orderBy(desc(schema.predictionFeedback.createdAt));
}

export async function getPredictionWithDetails(id: string): Promise<{ prediction: Prediction; feedback: PredictionFeedback[] } | undefined> {
  const prediction = await getPrediction(id);
  if (!prediction) return undefined;
  const feedback = await getPredictionFeedbackByPrediction(id);
  return { prediction, feedback };
}

// Proximity Alerts
export async function getProximityAlertsForPlace(placeId: string): Promise<ProximityAlert[]> {
  return await db.select().from(schema.proximityAlerts)
    .where(eq(schema.proximityAlerts.placeId, placeId))
    .orderBy(desc(schema.proximityAlerts.createdAt));
}

export async function getRecentProximityAlerts(limit = 20): Promise<ProximityAlert[]> {
  return await db.select().from(schema.proximityAlerts)
    .orderBy(desc(schema.proximityAlerts.createdAt))
    .limit(limit);
}

export async function getUnacknowledgedAlerts(): Promise<ProximityAlert[]> {
  return await db.select().from(schema.proximityAlerts)
    .where(eq(schema.proximityAlerts.acknowledged, false))
    .orderBy(desc(schema.proximityAlerts.createdAt));
}

// Briefing Functions
export async function getRecentBriefingDeliveries(limit = 20): Promise<BriefingDelivery[]> {
  return await db.select().from(schema.briefingDeliveries)
    .orderBy(desc(schema.briefingDeliveries.deliveredAt))
    .limit(limit);
}

export async function setBriefingSetting(key: string, value: any): Promise<void> {
  const now = getNow();
  const [existing] = await db.select().from(schema.briefingSettings)
    .where(eq(schema.briefingSettings.settingKey, key))
    .limit(1);
  
  if (existing) {
    await db.update(schema.briefingSettings)
      .set({ settingValue: JSON.stringify(value), updatedAt: now })
      .where(eq(schema.briefingSettings.settingKey, key));
  } else {
    const id = uuidv4();
    await db.insert(schema.briefingSettings).values({
      id,
      settingKey: key,
      settingValue: JSON.stringify(value),
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function updateBriefingDeliveryStatus(id: string, status: string): Promise<void> {
  const now = getNow();
  await db.update(schema.briefingDeliveries)
    .set({ status: status as any, updatedAt: now })
    .where(eq(schema.briefingDeliveries.id, id));
}

// Entity Relationships
export async function getRelatedEntities(entityId: string): Promise<Entity[]> {
  const links = await db.select().from(schema.entityLinks)
    .where(or(
      eq(schema.entityLinks.sourceEntityId, entityId),
      eq(schema.entityLinks.targetEntityId, entityId)
    ));
  
  const relatedIds = links.map(l => l.sourceEntityId === entityId ? l.targetEntityId : l.sourceEntityId);
  const entities: Entity[] = [];
  for (const id of relatedIds) {
    const entity = await getEntity(id);
    if (entity) entities.push(entity);
  }
  return entities;
}

export async function getRelationshipsForEntity(entityId: string): Promise<EntityLink[]> {
  return await db.select().from(schema.entityLinks)
    .where(or(
      eq(schema.entityLinks.sourceEntityId, entityId),
      eq(schema.entityLinks.targetEntityId, entityId)
    ))
    .orderBy(desc(schema.entityLinks.weight));
}

export async function getStrongestRelationships(limit = 10): Promise<EntityLink[]> {
  return await db.select().from(schema.entityLinks)
    .orderBy(desc(schema.entityLinks.weight))
    .limit(limit);
}

// Reminders & Tasks
export async function getRemindersSince(since: string): Promise<Reminder[]> {
  return await db.select().from(schema.reminders)
    .where(gte(schema.reminders.createdAt, since))
    .orderBy(desc(schema.reminders.createdAt));
}

export async function getTasksSince(since: string): Promise<Task[]> {
  return await db.select().from(schema.tasks)
    .where(gte(schema.tasks.createdAt, since))
    .orderBy(desc(schema.tasks.createdAt));
}

// Saved Places & Recipes
export async function getSavedPlacesSince(since: string): Promise<SavedPlace[]> {
  return await db.select().from(schema.savedPlaces)
    .where(gte(schema.savedPlaces.createdAt, since))
    .orderBy(desc(schema.savedPlaces.createdAt));
}

export async function getSavedRecipes(): Promise<Recipe[]> {
  return await db.select().from(schema.recipes)
    .where(eq(schema.recipes.isFavorite, true))
    .orderBy(desc(schema.recipes.createdAt));
}

export async function incrementRecipeCooked(id: string): Promise<void> {
  const now = getNow();
  await db.update(schema.recipes)
    .set({ 
      timesCooked: sql`${schema.recipes.timesCooked} + 1`,
      updatedAt: now 
    })
    .where(eq(schema.recipes.id, id));
}

export async function toggleRecipeFavorite(id: string): Promise<Recipe | undefined> {
  const recipe = await getRecipe(id);
  if (!recipe) return undefined;
  const now = getNow();
  await db.update(schema.recipes)
    .set({ isFavorite: !recipe.isFavorite, updatedAt: now })
    .where(eq(schema.recipes.id, id));
  return await getRecipe(id);
}

export async function updateRecipe(id: string, data: Partial<InsertRecipe>): Promise<Recipe | undefined> {
  const now = getNow();
  await db.update(schema.recipes)
    .set({ ...data, updatedAt: now })
    .where(eq(schema.recipes.id, id));
  return await getRecipe(id);
}

// Twilio Message Functions
export async function getTwilioConversationPhones(): Promise<string[]> {
  const messages = await db.select().from(schema.twilioMessages);
  const phones = new Set<string>();
  messages.forEach(m => {
    if (m.fromNumber) phones.add(m.fromNumber);
    if (m.toNumber) phones.add(m.toNumber);
  });
  return Array.from(phones);
}

export async function getTwilioMessagesByContact(phone: string): Promise<TwilioMessage[]> {
  const normalized = normalizePhoneNumber(phone);
  return await db.select().from(schema.twilioMessages)
    .where(or(
      eq(schema.twilioMessages.fromNumber, normalized),
      eq(schema.twilioMessages.toNumber, normalized)
    ))
    .orderBy(desc(schema.twilioMessages.createdAt));
}

export async function getTwilioMessagesByDirection(direction: string): Promise<TwilioMessage[]> {
  return await db.select().from(schema.twilioMessages)
    .where(eq(schema.twilioMessages.direction, direction as any))
    .orderBy(desc(schema.twilioMessages.createdAt));
}

export async function getTwilioMessagesBySource(source: string): Promise<TwilioMessage[]> {
  return await db.select().from(schema.twilioMessages)
    .where(eq(schema.twilioMessages.source, source as any))
    .orderBy(desc(schema.twilioMessages.createdAt));
}

export async function getTwilioMessageStats(): Promise<{ total: number; inbound: number; outbound: number }> {
  const all = await db.select().from(schema.twilioMessages);
  return {
    total: all.length,
    inbound: all.filter(m => m.direction === 'inbound').length,
    outbound: all.filter(m => m.direction === 'outbound').length,
  };
}

export async function updateTwilioMessageError(id: string, errorCode: string, errorMessage: string): Promise<void> {
  const now = getNow();
  await db.update(schema.twilioMessages)
    .set({ errorCode, errorMessage, updatedAt: now })
    .where(eq(schema.twilioMessages.id, id));
}

// Batch Job Artifacts
export async function getUnprocessedArtifactsByType(artifactType: string): Promise<BatchJobArtifact[]> {
  return await db.select().from(schema.batchJobArtifacts)
    .where(and(
      eq(schema.batchJobArtifacts.type, artifactType as any),
      eq(schema.batchJobArtifacts.processed, false)
    ))
    .orderBy(asc(schema.batchJobArtifacts.createdAt));
}

export async function markArtifactProcessed(id: string): Promise<void> {
  const now = getNow();
  await db.update(schema.batchJobArtifacts)
    .set({ processed: true, processedAt: now, updatedAt: now })
    .where(eq(schema.batchJobArtifacts.id, id));
}

// Uploaded Files
export async function getUploadedFilesByMessage(messageId: string): Promise<UploadedFile[]> {
  return await db.select().from(schema.uploadedFiles)
    .where(eq(schema.uploadedFiles.messageId, messageId))
    .orderBy(asc(schema.uploadedFiles.createdAt));
}

export async function getUploadedFilesByStatus(status: string): Promise<UploadedFile[]> {
  return await db.select().from(schema.uploadedFiles)
    .where(eq(schema.uploadedFiles.status, status as any))
    .orderBy(desc(schema.uploadedFiles.createdAt));
}

export async function linkFileToMessage(fileId: string, messageId: string): Promise<void> {
  const now = getNow();
  await db.update(schema.uploadedFiles)
    .set({ messageId, updatedAt: now })
    .where(eq(schema.uploadedFiles.id, fileId));
}

// Wake Word Commands
export async function getWakeWordCommand(id: string): Promise<WakeWordCommand | undefined> {
  const [result] = await db.select().from(schema.wakeWordCommands)
    .where(eq(schema.wakeWordCommands.id, id))
    .limit(1);
  return result;
}

export async function getWakeWordCommandsByLifelog(lifelogId: string): Promise<WakeWordCommand[]> {
  return await db.select().from(schema.wakeWordCommands)
    .where(eq(schema.wakeWordCommands.lifelogId, lifelogId))
    .orderBy(asc(schema.wakeWordCommands.createdAt));
}

export async function getWakeWordCommandsByStatus(status: string): Promise<WakeWordCommand[]> {
  return await db.select().from(schema.wakeWordCommands)
    .where(eq(schema.wakeWordCommands.status, status as any))
    .orderBy(desc(schema.wakeWordCommands.createdAt));
}

// Init functions (no-ops for PostgreSQL since tables are created via migrations)
export async function initLocationSamplesTable(): Promise<void> {
  // No-op: Tables are created via drizzle migrations
}

export async function initLocationVisitsTable(): Promise<void> {
  // No-op: Tables are created via drizzle migrations
}


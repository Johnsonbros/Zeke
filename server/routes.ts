import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { registerOmiRoutes } from "./omi-routes";
import { syncGitHubRepo, pushToGitHub, createGitHubWebhook } from "./github";
import { 
  createConversation, 
  getConversation, 
  getAllConversations,
  deleteConversation,
  createMessage,
  getMessagesByConversation,
  findOrCreateSmsConversation,
  getAllMemoryNotes,
  createMemoryNote,
  deleteMemoryNote,
  getAllPreferences,
  setPreference,
  createGroceryItem,
  getAllGroceryItems,
  getGroceryItem,
  updateGroceryItem,
  toggleGroceryItemPurchased,
  deleteGroceryItem,
  clearPurchasedGroceryItems,
  getGroceryAutoClearHours,
  setGroceryAutoClearHours,
  createTask,
  getAllTasks,
  getTask,
  updateTask,
  toggleTaskCompleted,
  deleteTask,
  clearCompletedTasks,
  getTasksDueToday,
  getOverdueTasks,
  getTasksDueTomorrow,
  getSubtasks,
  getTaskWithSubtasks,
  getAllContacts,
  getContact,
  getContactByPhone,
  searchContacts,
  createContact,
  updateContact,
  deleteContact,
  getOrCreateContactForPhone,
  getConversationsByPhone,
  getMessageCountForPhone,
  isMasterAdmin,
  getAllReminders,
  getReminder,
  updateReminder,
  deleteReminder,
  getAllAutomations,
  getAutomation,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  getAllProfileSections,
  getProfileSection,
  upsertProfileSection,
  deleteProfileSection,
  getFullProfile,
  createTwilioMessage,
  getAllTwilioMessages,
  getTwilioMessagesByPhone,
  getTwilioMessageStats,
  getTwilioConversationPhones,
  updateTwilioMessageStatus,
  updateTwilioMessageError,
  normalizePhoneNumber,
  createLocationHistory,
  getLocationHistory,
  getLocationHistoryInRange,
  getLatestLocation,
  deleteOldLocationHistory,
  createSavedPlace,
  getSavedPlace,
  getAllSavedPlaces,
  getStarredPlaces,
  getSavedPlacesByCategory,
  getPlacesWithProximityAlerts,
  updateSavedPlace,
  deleteSavedPlace,
  createPlaceList,
  getPlaceList,
  getAllPlaceLists,
  getGroceryLinkedPlaceLists,
  updatePlaceList,
  deletePlaceList,
  addPlaceToList,
  removePlaceFromList,
  getPlacesInList,
  getListsForPlace,
  getLocationSettings,
  updateLocationSettings,
  createProximityAlert,
  getRecentProximityAlerts,
  getUnacknowledgedAlerts,
  acknowledgeProximityAlert,
  acknowledgeAllProximityAlerts,
  getProximityAlertsForPlace,
  getRecentAlertsForPlace,
  deleteOldProximityAlerts,
  findNearbyPlaces,
  checkGroceryProximity,
  calculateDistance,
  createLocationSamples,
  getLocationSamples,
  getLocationVisits,
  findNearbyStarredPlaces,
  linkTaskToPlace,
  linkReminderToPlace,
  linkMemoryToPlace,
  unlinkTaskFromPlace,
  unlinkReminderFromPlace,
  unlinkMemoryFromPlace,
  getPlaceWithLinkedItems,
  getTasksByPlace,
  getRemindersByPlace,
  getMemoriesByPlace,
  getReminderSequence,
  createReminder as dbCreateReminder,
  createCustomList,
  getCustomList,
  getAllCustomLists,
  updateCustomList,
  deleteCustomList,
  createCustomListItem,
  getCustomListItem,
  getCustomListItems,
  getCustomListWithItems,
  updateCustomListItem,
  toggleCustomListItemChecked,
  deleteCustomListItem,
  clearCheckedCustomListItems,
  getFamilyMembers,
  getFoodPreferences,
  upsertFoodPreference,
  getDietaryRestrictions,
  createDietaryRestriction,
  getMealHistory,
  createMealHistoryEntry,
  updateMealRating,
  searchRecipes,
  getRecipeById,
  toggleRecipeFavorite,
  getFavoriteRecipes,
  getActiveFamilyMembers,
  deleteFoodPreference,
  getLikedIngredients,
  getDislikedIngredients,
  deleteDietaryRestriction,
  getSavedRecipes,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  incrementRecipeCooked,
  getMostCookedMeals,
  createContactNote,
  getContactNotes,
  getContactNotesByType,
  deleteContactNote,
  deleteAllContactNotes,
  getLifelogsAtPlace,
  getLifelogsNearLocation,
  getRecentLifelogLocations,
  correlateLifelogWithLocation,
  getLifelogLocationContexts,
  buildUnifiedTimeline,
  getLifelogLocation,
  getLifelogLocationByLifelogId,
  getLifelogLocationsInRange,
  getLifelogsByActivity,
  analyzeLocationPatterns,
  getAllMeetings,
  getMeetingsByDate,
  getPendingLifelogActionItems,
  getAllLifelogActionItems,
  createPrediction,
  getPredictionById,
  getAllPredictions,
  getPendingPredictions,
  updatePrediction,
  deletePrediction,
  getPredictionStats,
  getPredictionWithDetails,
  createPattern,
  getPatternById,
  getAllPatterns,
  getActivePatterns,
  updatePattern,
  deletePattern,
  createFolder,
  getFolder,
  getAllFolders,
  getFoldersByParent,
  updateFolder,
  deleteFolder,
  getFolderTree,
  createDocument,
  getDocument,
  getAllDocuments,
  getDocumentsByFolder,
  updateDocument,
  deleteDocument,
  getDocumentWithFolder,
  searchDocuments,
  createUploadedFile,
  getUploadedFile,
  getAllUploadedFiles,
  getUploadedFilesByConversation,
  updateUploadedFile,
  deleteUploadedFile,
  linkFileToMessage,
  getJournalEntries,
  getJournalEntryById,
  getJournalEntryByDate,
} from "./db";
import type { TwilioMessageSource, UploadedFileType } from "@shared/schema";
import { insertFolderSchema, updateFolderSchema, insertDocumentSchema, updateDocumentSchema, locationSampleBatchSchema, insertSavedPlaceSchema } from "@shared/schema";
import {
  logAiEvent,
  getRecentAiLogs,
  getAiLogsByModel,
  getAiLogsByAgent,
  getAiUsageStats,
  getTodayAiUsageStats,
  getWeekAiUsageStats,
  detectAnomalies,
  getDistinctModels,
  getDistinctAgents,
  cleanupOldAiLogs,
  configureAnomalyAlerts,
  setAnomalyAlertCallback,
  checkAndAlertAnomalies,
  getAnomalyAlertConfig,
} from "./aiLogger";
import { setAiLoggerFunction } from "../lib/reliability/client_wrap";
import multer from "multer";
import path from "path";
import fsNode from "fs";
import { generateContextualQuestion } from "./gettingToKnow";
import { chat, getPermissionsForPhone, getAdminPermissions } from "./agent";
import { setSendSmsCallback, restorePendingReminders, executeTool, toolDefinitions, TOOL_PERMISSIONS, type ToolPermissions } from "./tools";
import { getSmartMemoryContext, semanticSearch } from "./semanticMemory";
import {
  communicationToolNames,
  reminderToolNames,
  taskToolNames,
  calendarToolNames,
  groceryToolNames,
  searchToolNames,
  fileToolNames,
  memoryToolNames,
  utilityToolNames,
  predictionTools,
} from "./capabilities";
import { createReminderSequenceData } from "./capabilities/workflows";
import { scheduleReminderExecution } from "./capabilities/reminders";
import { setDailyCheckInSmsCallback, initializeDailyCheckIn } from "./dailyCheckIn";
import { startPeopleProcessor } from "./peopleProcessor";
import { startMemoryTtlCleanup } from "./jobs/memoryTtlCleanup";
import { 
  startContextAgent, 
  stopContextAgent, 
  setContextAgentSmsCallback, 
  getContextAgentStatus,
  toggleContextAgent,
  processContextCommands,
  approveAndExecuteCommand
} from "./zekeContextAgent";
import {
  startLocationCheckInMonitor,
  stopLocationCheckInMonitor,
  getLocationCheckInStatus,
  getCurrentLocationState,
  setLocationCheckInSmsCallback,
} from "./locationCheckInMonitor";
import {
  getRecentWakeWordCommands,
  getPendingWakeWordCommands,
  getContextAgentSettings,
  updateContextAgentSettings,
  updateWakeWordCommandStatus,
  deleteWakeWordCommand
} from "./db";
import { 
  initializeAutomations, 
  setAutomationSmsCallback, 
  scheduleAutomation, 
  stopAutomation,
  runAutomationNow 
} from "./automations";
import {
  generateDailySummary as generateOmiDailySummary,
  getConversationAnalytics,
  getMorningBriefingEnhancement,
  getOmiSummaries,
  getRecentLifelogs,
  getRecentMemories,
} from "./omi";
import {
  generateDailySummary as generateJournalEntry,
  getDailySummaryStatus as getJournalSchedulerStatus,
} from "./jobs/dailySummaryAgent";
import {
  recordConversationSignal,
  recordMemoryUsage,
  recordToolOutcome,
  getQualityMetrics,
  getSystemMetrics,
  getToolMetrics,
} from "./metricsCollector";
import {
  startVoicePipeline,
  stopVoicePipeline,
  getVoicePipelineStatus,
  isVoicePipelineRunning,
  validateVoiceCommandRequest,
  processVoiceCommand,
} from "./voice";
import { processOmiWebhook, getOmiListenerStatus } from "./voice/omiListener";
import {
  getConversationQualityStats,
  getOverallQualityStats,
  getMemoryConfidenceStats,
  getLowConfidenceMemories,
  getMemoriesNeedingConfirmation,
  getHighConfidenceMemories,
  getMemoryWithConfidence,
  confirmMemory,
  contradictMemory,
  getEntity,
  getEntityWithReferences,
  getRelatedEntities,
  getEntitiesForItem,
  getItemsRelatedToEntity,
  findEntitiesByLabel,
  getEntitiesByType,
  getInsight,
  getActiveInsights,
  getAllInsights,
  updateInsight,
  dismissInsight,
  snoozeInsight,
  completeInsight,
  getInsightStats,
  getNotificationPreferences as getNotificationPreferencesDb,
  updateNotificationPreferences as updateNotificationPreferencesDb,
  getPendingNotifications as getPendingNotificationsDb,
  getAllPendingNotifications as getAllPendingNotificationsDb,
  deleteNotificationQueueItem as deleteNotificationQueueItemDb,
  getRecentBatches as getRecentBatchesDb,
} from "./db";
import { generateAllInsights } from "./insightsGenerator";
import {
  queueNotification,
  processPendingNotifications,
  processAllPendingNotifications,
  getQueueStatus,
  updateBatchInterval,
  initializeBatchScheduler,
  setNotificationSmsCallback,
} from "./notificationBatcher";
import {
  parseNaturalLanguageAutomation,
  convertToInsertAutomation,
} from "./nlAutomationParser";
import {
  executeNLAutomation,
  scheduleTimeAutomation,
  stopAutomation as stopNLAutomation,
  initializeNLAutomations,
  setNLAutomationSmsCallback,
  getScheduledAutomationIds,
} from "./nlAutomationExecutor";
import {
  getAllNLAutomations as getAllNLAutomationsDb,
  getNLAutomation as getNLAutomationDb,
  createNLAutomation as createNLAutomationDb,
  updateNLAutomation as updateNLAutomationDb,
  deleteNLAutomation as deleteNLAutomationDb,
  getNLAutomationLogs as getNLAutomationLogsDb,
  getNLAutomationStats as getNLAutomationStatsDb,
} from "./db";
import type { EntityDomain, EntityType, InsightCategory, InsightStatus, InsightPriority, ActivityType } from "@shared/schema";
import { chatRequestSchema, insertMemoryNoteSchema, insertPreferenceSchema, insertGroceryItemSchema, updateGroceryItemSchema, insertTaskSchema, updateTaskSchema, insertContactSchema, updateContactSchema, insertContactNoteSchema, insertAutomationSchema, insertCustomListSchema, updateCustomListSchema, insertCustomListItemSchema, updateCustomListItemSchema, insertFoodPreferenceSchema, insertDietaryRestrictionSchema, insertSavedRecipeSchema, updateSavedRecipeSchema, insertMealHistorySchema, type Automation, type InsertAutomation, getContactFullName } from "@shared/schema";
import { getTwilioClient, getTwilioFromPhoneNumber, isTwilioConfigured } from "./twilioClient";
import { z } from "zod";
import { listCalendarEvents, getTodaysEvents, getUpcomingEvents, createCalendarEvent, deleteCalendarEvent, updateCalendarEvent, listCalendars, type CalendarEvent, type CalendarInfo } from "./googleCalendar";
import { parseQuickAction } from "./quickActions";
import { generateSpeechAudio, getAudioFilePath, isElevenLabsConfigured } from "./elevenlabs";
import { analyzeAndBreakdownTask, calculateSubtaskDueDate, suggestRelatedGroceryItems, suggestRelatedGroceryItemsBulk, generateTaskFollowUp, type TaskFollowUpResult } from "./capabilities/workflows";
import {
  type AppContext,
  type ContextBundle,
  buildGlobalBundle,
  buildMemoryBundle,
  buildTasksBundle,
  buildCalendarBundle,
  buildGroceryBundle,
  buildLocationsBundle,
  buildOmiBundle,
  buildContactsBundle,
  buildProfileBundle,
  buildConversationBundle,
  DEFAULT_TOKEN_BUDGET,
} from "./contextRouter";
import { onTaskCreated } from "./entityExtractor";
import { 
  queryKnowledgeGraph, 
  traverseGraph, 
  getEntityNeighborhood, 
  getCrossDomainConnections,
  findBridgingEntities,
  findShortestPath,
  getPersonContext,
  analyzeTemporalPatterns,
  getKnowledgeGraphStats,
  type GraphTraversalOptions
} from "./knowledgeGraph";
import {
  runBackfill,
  previewBackfill,
  getBackfillStatus
} from "./graphBackfill";
import {
  analyzeTaskPatterns,
  getSchedulingSuggestion,
  getQuickSchedulingSuggestions,
  getPatternInsights,
} from "./predictiveTaskScheduler";
import {
  claimIdempotencyKey,
  buildIdempotencyKeyFromPayload,
  getProcessedKeysCount,
} from "./idempotency";
import { analyzeMmsImage, type ImageAnalysisResult, type PersonPhotoAnalysisResult } from "./services/fileProcessor";
import { setPendingPlaceSave, hasPendingPlaceSave, completePendingPlaceSave, cleanupExpiredPendingPlaces } from "./pendingPlaceSave";
import { verifyPlace, manuallyVerifyPlace } from "./locationVerifier";
import { recordSleepQuality, shouldAskSleepQuality, markSleepQualityAsked } from "./sleepTracker";

// Format phone number for Twilio - handles various input formats
function formatPhoneNumber(phone: string): string {
  const digits = phone.trim().replace(/\D/g, ""); // Remove all non-digits
  // If it's 11 digits starting with 1, it already has US country code
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  } else if (digits.length === 10) {
    // 10 digit US number, add +1
    return `+1${digits}`;
  } else {
    // Other formats, just add + if needed
    return phone.trim().startsWith("+") ? phone.trim() : `+${digits}`;
  }
}

// Helper to log Twilio SMS messages
function logTwilioMessage(params: {
  direction: "inbound" | "outbound";
  source: TwilioMessageSource;
  fromNumber: string;
  toNumber: string;
  body: string;
  twilioSid?: string;
  status?: "queued" | "sending" | "sent" | "delivered" | "failed" | "received";
  conversationId?: string;
  errorCode?: string;
  errorMessage?: string;
}) {
  try {
    const contact = getContactByPhone(
      params.direction === "inbound" ? params.fromNumber : params.toNumber
    );
    
    createTwilioMessage({
      twilioSid: params.twilioSid || null,
      direction: params.direction,
      status: params.status || (params.direction === "inbound" ? "received" : "sent"),
      source: params.source,
      fromNumber: params.fromNumber,
      toNumber: params.toNumber,
      body: params.body,
      contactId: contact?.id || null,
      contactName: contact ? getContactFullName(contact) : null,
      conversationId: params.conversationId || null,
      errorCode: params.errorCode || null,
      errorMessage: params.errorMessage || null,
    });
    
    console.log(`[TWILIO LOG] ${params.direction} ${params.source}: ${params.direction === "inbound" ? params.fromNumber : params.toNumber} - ${params.body.substring(0, 50)}...`);
  } catch (error) {
    console.error("[TWILIO LOG] Failed to log message:", error);
  }
}

// Schema for outbound SMS
const sendSmsSchema = z.object({
  to: z.string().min(10, "Phone number required"),
  message: z.string().min(1, "Message required"),
});

// Helper to build a location context summary for proactive surfacing
function buildLocationContextSummary(
  closestPlace: { id: string; name: string; category: string; distance: number } | null,
  lifelogs: any[],
  nearbyGrocery: { place: { id: string; name: string }; distance: number } | null
): string {
  const parts: string[] = [];
  
  if (closestPlace) {
    if (closestPlace.category === "home") {
      parts.push(`You're at home (${closestPlace.name})`);
    } else if (closestPlace.category === "work") {
      parts.push(`You're at work (${closestPlace.name})`);
    } else {
      parts.push(`You're near ${closestPlace.name} (${Math.round(closestPlace.distance)}m away)`);
    }
  }
  
  if (lifelogs.length > 0) {
    const recentConvo = lifelogs[0];
    const date = new Date(recentConvo.lifelogStartTime);
    const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    parts.push(`Last conversation here: "${recentConvo.lifelogTitle}" on ${dateStr}`);
    
    if (lifelogs.length > 1) {
      parts.push(`${lifelogs.length - 1} more conversation(s) recorded at this location`);
    }
  }
  
  if (nearbyGrocery) {
    parts.push(`Near grocery store: ${nearbyGrocery.place.name} (${Math.round(nearbyGrocery.distance)}m)`);
  }
  
  return parts.length > 0 ? parts.join(". ") + "." : "No location context available.";
}

// Schema for updating reminders
const updateReminderSchema = z.object({
  message: z.string().min(1).optional(),
  scheduledFor: z.string().optional(),
  recipientPhone: z.string().optional(),
});

// Schema for updating automations
const updateAutomationSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["morning_briefing", "scheduled_sms", "daily_checkin"]).optional(),
  cronExpression: z.string().optional(),
  enabled: z.boolean().optional(),
  recipientPhone: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  settings: z.string().nullable().optional(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Initialize Twilio client and phone number for use throughout routes (now async via Replit connector)
  let twilioClient: Awaited<ReturnType<typeof getTwilioClient>> | null = null;
  let twilioFromNumber: string | undefined = undefined;
  
  try {
    if (await isTwilioConfigured()) {
      twilioClient = await getTwilioClient();
      twilioFromNumber = await getTwilioFromPhoneNumber();
      console.log("[Twilio] Connected via Replit connector");
    }
  } catch (error) {
    console.log("[Twilio] Not configured via Replit connector, SMS features will be disabled");
  }
  
  // Wire up AI logging to the reliability wrapper so all wrapOpenAI calls are logged
  setAiLoggerFunction(logAiEvent);
  
  // Set up SMS callback for tools (reminders and send_sms tool)
  setSendSmsCallback(async (phone: string, message: string, source?: string) => {
    const fromNumber = await getTwilioFromPhoneNumber();
    if (!fromNumber) {
      console.error("Twilio phone number not configured for reminder SMS");
      return;
    }
    
    const formattedPhone = formatPhoneNumber(phone);
    const smsSource = (source || "reminder") as TwilioMessageSource;
    
    try {
      const client = await getTwilioClient();
      const result = await client.messages.create({
        body: message,
        from: fromNumber,
        to: formattedPhone,
      });
      
      logTwilioMessage({
        direction: "outbound",
        source: smsSource,
        fromNumber: fromNumber,
        toNumber: formattedPhone,
        body: message,
        twilioSid: result.sid,
        status: "sent",
      });
      
      console.log(`Reminder SMS sent to ${formattedPhone}`);
    } catch (error: any) {
      logTwilioMessage({
        direction: "outbound",
        source: smsSource,
        fromNumber: fromNumber,
        toNumber: formattedPhone,
        body: message,
        status: "failed",
        errorCode: error.code?.toString() || "UNKNOWN",
        errorMessage: error.message || "Unknown error",
      });
      
      console.error("Failed to send reminder SMS:", error);
      throw error;
    }
  });
  
  // Restore pending reminders from database after server startup
  restorePendingReminders();
  
  // Set up daily check-in SMS callback and restore scheduled check-ins
  setDailyCheckInSmsCallback(async (phone: string, message: string) => {
    const fromNumber = await getTwilioFromPhoneNumber();
    if (!fromNumber) {
      console.error("Twilio phone number not configured for daily check-in");
      throw new Error("Twilio not configured");
    }
    
    const formattedPhone = formatPhoneNumber(phone);
    
    try {
      const client = await getTwilioClient();
      const result = await client.messages.create({
        body: message,
        from: fromNumber,
        to: formattedPhone,
      });
      
      logTwilioMessage({
        direction: "outbound",
        source: "daily_checkin",
        fromNumber: fromNumber,
        toNumber: formattedPhone,
        body: message,
        twilioSid: result.sid,
        status: "sent",
      });
      
      console.log(`Daily check-in SMS sent to ${formattedPhone}`);
    } catch (error: any) {
      logTwilioMessage({
        direction: "outbound",
        source: "daily_checkin",
        fromNumber: fromNumber,
        toNumber: formattedPhone,
        body: message,
        status: "failed",
        errorCode: error.code?.toString() || "UNKNOWN",
        errorMessage: error.message || "Unknown error",
      });
      
      console.error("Failed to send daily check-in SMS:", error);
      throw error;
    }
  });
  initializeDailyCheckIn();
  
  // Set up automation SMS callback and initialize scheduled automations
  setAutomationSmsCallback(async (phone: string, message: string) => {
    const fromNumber = await getTwilioFromPhoneNumber();
    if (!fromNumber) {
      console.error("Twilio phone number not configured for automation SMS");
      throw new Error("Twilio not configured");
    }
    
    const formattedPhone = formatPhoneNumber(phone);
    
    try {
      const client = await getTwilioClient();
      const result = await client.messages.create({
        body: message,
        from: fromNumber,
        to: formattedPhone,
      });
      
      logTwilioMessage({
        direction: "outbound",
        source: "automation",
        fromNumber: fromNumber,
        toNumber: formattedPhone,
        body: message,
        twilioSid: result.sid,
        status: "sent",
      });
      
      console.log(`Automation SMS sent to ${formattedPhone}`);
    } catch (error: any) {
      logTwilioMessage({
        direction: "outbound",
        source: "automation",
        fromNumber: fromNumber,
        toNumber: formattedPhone,
        body: message,
        status: "failed",
        errorCode: error.code?.toString() || "UNKNOWN",
        errorMessage: error.message || "Unknown error",
      });
      
      console.error("Failed to send automation SMS:", error);
      throw error;
    }
  });
  initializeAutomations();
  
  // Start background people extraction from lifelogs
  startPeopleProcessor();
  
  // Start memory TTL cleanup job (hourly)
  startMemoryTtlCleanup();
  
  // Initialize smart notification batching
  setNotificationSmsCallback(async (phone: string, message: string) => {
    const fromNumber = await getTwilioFromPhoneNumber();
    if (!fromNumber) {
      console.log("[NotificationBatcher] Twilio not configured, cannot send SMS");
      throw new Error("Twilio not configured");
    }
    
    const formattedPhone = phone.startsWith('+') ? phone : `+1${phone}`;
    
    try {
      const client = await getTwilioClient();
      const result = await client.messages.create({
        body: message,
        from: fromNumber,
        to: formattedPhone,
      });
      
      logTwilioMessage({
        direction: "outbound",
        source: "notification_batch",
        fromNumber: fromNumber,
        toNumber: formattedPhone,
        body: message,
        twilioSid: result.sid,
        status: "sent",
      });
      
      console.log(`[NotificationBatcher] SMS sent to ${formattedPhone}`);
    } catch (error: any) {
      logTwilioMessage({
        direction: "outbound",
        source: "notification_batch",
        fromNumber: fromNumber,
        toNumber: formattedPhone,
        body: message,
        status: "failed",
        errorCode: error.code?.toString() || "UNKNOWN",
        errorMessage: error.message || "Unknown error",
      });
      
      console.error("[NotificationBatcher] Failed to send SMS:", error);
      throw error;
    }
  });
  initializeBatchScheduler();

  // Initialize NL Automation system
  setNLAutomationSmsCallback(async (phone: string, message: string) => {
    const fromNumber = await getTwilioFromPhoneNumber();
    if (!fromNumber) {
      console.log("[NLAutomation] Twilio not configured, cannot send SMS");
      throw new Error("Twilio not configured");
    }
    
    const formattedPhone = phone.startsWith('+') ? phone : `+1${phone}`;
    
    try {
      const client = await getTwilioClient();
      const result = await client.messages.create({
        body: message,
        from: fromNumber,
        to: formattedPhone,
      });
      
      logTwilioMessage({
        direction: "outbound",
        source: "automation",
        fromNumber: fromNumber,
        toNumber: formattedPhone,
        body: message,
        twilioSid: result.sid,
        status: "sent",
      });
      
      console.log(`[NLAutomation] SMS sent to ${formattedPhone}`);
    } catch (error: any) {
      logTwilioMessage({
        direction: "outbound",
        source: "automation",
        fromNumber: fromNumber,
        toNumber: formattedPhone,
        body: message,
        status: "failed",
        errorCode: error.code?.toString() || "UNKNOWN",
        errorMessage: error.message || "Unknown error",
      });
      
      console.error("[NLAutomation] Failed to send SMS:", error);
      throw error;
    }
  });
  initializeNLAutomations();
  
  // Start ZEKE Context Agent for wake word detection
  setContextAgentSmsCallback(async (phone: string, message: string, source?: string) => {
    const fromNumber = await getTwilioFromPhoneNumber();
    if (!fromNumber) {
      console.log("[ContextAgent] Twilio not configured, cannot send SMS");
      throw new Error("Twilio not configured");
    }
    
    const formattedPhone = phone.startsWith('+') ? phone : `+1${phone}`;
    
    try {
      const client = await getTwilioClient();
      const result = await client.messages.create({
        body: message,
        from: fromNumber,
        to: formattedPhone,
      });
      
      logTwilioMessage({
        direction: "outbound",
        source: (source || "context_agent") as TwilioMessageSource,
        fromNumber: fromNumber,
        toNumber: formattedPhone,
        body: message,
        twilioSid: result.sid,
        status: "sent",
      });
      
      console.log(`[ContextAgent] SMS sent to ${formattedPhone}`);
    } catch (error: any) {
      logTwilioMessage({
        direction: "outbound",
        source: (source || "context_agent") as TwilioMessageSource,
        fromNumber: fromNumber,
        toNumber: formattedPhone,
        body: message,
        status: "failed",
        errorCode: error.code?.toString() || "UNKNOWN",
        errorMessage: error.message || "Unknown error",
      });
      
      console.error("[ContextAgent] Failed to send SMS:", error);
      throw error;
    }
  });
  startContextAgent();

  // Set up location check-in SMS callback and auto-start monitor
  setLocationCheckInSmsCallback(async (phone: string, message: string) => {
    const fromNumber = await getTwilioFromPhoneNumber();
    if (!fromNumber) {
      console.log("[LocationCheckIn] Twilio not configured, cannot send SMS");
      throw new Error("Twilio not configured");
    }

    const formattedPhone = phone.startsWith('+') ? phone : `+1${phone}`;

    try {
      const client = await getTwilioClient();
      const result = await client.messages.create({
        body: message,
        from: fromNumber,
        to: formattedPhone,
      });

      logTwilioMessage({
        direction: "outbound",
        source: "automation",
        fromNumber: fromNumber,
        toNumber: formattedPhone,
        body: message,
        twilioSid: result.sid,
        status: "sent",
      });

      console.log(`[LocationCheckIn] SMS sent to ${formattedPhone}: ${message.substring(0, 50)}...`);
    } catch (error: any) {
      logTwilioMessage({
        direction: "outbound",
        source: "automation",
        fromNumber: fromNumber,
        toNumber: formattedPhone,
        body: message,
        status: "failed",
        errorCode: error.code?.toString() || "UNKNOWN",
        errorMessage: error.message || "Unknown error",
      });

      console.error("[LocationCheckIn] Failed to send SMS:", error);
      throw error;
    }
  });

  // Auto-start location check-in monitor if Twilio is configured
  if (twilioClient) {
    startLocationCheckInMonitor();
    console.log("[LocationCheckIn] Monitor auto-started on server initialization");
  }

  // Start location intelligence health monitoring
  const { startHealthMonitoring } = await import("./locationIntelligence");
  startHealthMonitoring(10); // Check every 10 minutes
  console.log("[LocationIntelligence] Health monitoring initialized");

  // Set up AI usage anomaly alerting via SMS
  setAnomalyAlertCallback(async (phone: string, message: string) => {
    const fromNumber = await getTwilioFromPhoneNumber();
    if (!fromNumber) {
      console.log("[AiAnomalyAlert] Twilio not configured, cannot send SMS");
      throw new Error("Twilio not configured");
    }

    const formattedPhone = phone.startsWith('+') ? phone : `+1${phone}`;

    try {
      const client = await getTwilioClient();
      const result = await client.messages.create({
        body: message,
        from: fromNumber,
        to: formattedPhone,
      });

      logTwilioMessage({
        direction: "outbound",
        source: "automation",
        fromNumber: fromNumber,
        toNumber: formattedPhone,
        body: message,
        twilioSid: result.sid,
        status: "sent",
      });

      console.log(`[AiAnomalyAlert] SMS sent to ${formattedPhone}`);
    } catch (error: any) {
      logTwilioMessage({
        direction: "outbound",
        source: "automation",
        fromNumber: fromNumber,
        toNumber: formattedPhone,
        body: message,
        status: "failed",
        errorCode: error.code?.toString() || "UNKNOWN",
        errorMessage: error.message || "Unknown error",
      });

      console.error("[AiAnomalyAlert] Failed to send SMS:", error);
      throw error;
    }
  });

  // Enable anomaly alerts if NATE_PHONE is configured
  if (process.env.NATE_PHONE) {
    configureAnomalyAlerts({
      enabled: true,
      recipientPhone: process.env.NATE_PHONE,
      minSeverity: "warning",
      cooldownMinutes: 60,
    });
    
    // Schedule hourly anomaly check
    cron.schedule('0 * * * *', async () => {
      console.log("[AiAnomalyAlert] Running scheduled anomaly check...");
      try {
        const anomalies = await checkAndAlertAnomalies();
        if (anomalies.length > 0) {
          console.log(`[AiAnomalyAlert] Found ${anomalies.length} anomalies`);
        }
      } catch (error) {
        console.error("[AiAnomalyAlert] Error during scheduled check:", error);
      }
    });
    
    console.log("[AiAnomalyAlert] Anomaly monitoring enabled - hourly checks scheduled");
  } else {
    console.log("[AiAnomalyAlert] NATE_PHONE not set - anomaly SMS alerts disabled");
  }

  // Health check endpoint for Python agents bridge
  app.get("/api/health", (_req, res) => {
    res.json({ status: "healthy", service: "zeke-node" });
  });

  // Detailed health check endpoint - verifies all critical services
  app.get("/api/health/detailed", async (_req, res) => {
    const checks: Record<string, { status: string; message?: string }> = {};
    
    // Check OpenAI API key
    checks.openai = process.env.OPENAI_API_KEY 
      ? { status: "ok", message: "API key configured" }
      : { status: "error", message: "OPENAI_API_KEY not set" };
    
    // Check Twilio credentials (via Replit connector)
    try {
      const twilioConfigured = await isTwilioConfigured();
      checks.twilio = twilioConfigured
        ? { status: "ok", message: "Connected via Replit connector" }
        : { status: "error", message: "Twilio not connected via Replit connector" };
    } catch {
      checks.twilio = { status: "error", message: "Twilio not connected via Replit connector" };
    }
    
    // Check master admin phone
    checks.masterAdmin = process.env.MASTER_ADMIN_PHONE
      ? { status: "ok", message: `Configured: ${process.env.MASTER_ADMIN_PHONE}` }
      : { status: "warning", message: "MASTER_ADMIN_PHONE not set" };
    
    // Check database by trying a simple query
    try {
      const conversations = getAllConversations();
      checks.database = { status: "ok", message: `${conversations.length} conversations` };
    } catch (error: any) {
      checks.database = { status: "error", message: error.message };
    }
    
    // Overall status
    const hasErrors = Object.values(checks).some(c => c.status === "error");
    const overallStatus = hasErrors ? "unhealthy" : "healthy";
    
    res.json({
      status: overallStatus,
      service: "zeke-node",
      timestamp: new Date().toISOString(),
      checks
    });
  });
  
  // Cache statistics endpoint for monitoring
  app.get("/api/cache/stats", async (_req, res) => {
    try {
      const { contextCache } = await import("./contextCache");
      const stats = contextCache.getStats();
      res.json({
        size: stats.size,
        hits: stats.hits,
        misses: stats.misses,
        evictions: stats.evictions,
        invalidations: stats.invalidations,
        prefetches: stats.prefetches,
        hitRate: (stats.hitRate * 100).toFixed(1) + '%',
        total: stats.hits + stats.misses
      });
    } catch (error) {
      console.error("[CacheStats] Error:", error);
      res.status(500).json({ error: "Failed to get cache stats" });
    }
  });
  
  // Voice transcription endpoint - converts audio to text using OpenAI Whisper
  app.post("/api/transcribe", async (req, res) => {
    try {
      const { audio, mimeType } = req.body;
      
      if (!audio || typeof audio !== "string") {
        return res.status(400).json({ error: "Audio data is required (base64 encoded)" });
      }
      
      // Size validation - max 10MB of base64 (about 7.5MB of audio)
      const MAX_BASE64_SIZE = 10 * 1024 * 1024;
      if (audio.length > MAX_BASE64_SIZE) {
        return res.status(413).json({ error: "Audio file too large (max 10MB)" });
      }
      
      // Validate mimeType - allow common audio types or empty (auto-detect)
      const allowedMimeTypes = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/aac", "audio/x-m4a", "audio/mp3"];
      if (mimeType && !allowedMimeTypes.includes(mimeType)) {
        return res.status(400).json({ error: `Unsupported audio format: ${mimeType}. Allowed formats: ${allowedMimeTypes.join(", ")}` });
      }
      
      const { isTranscriptionAvailable, getTranscriber } = await import("./voice/transcriber");
      
      if (!isTranscriptionAvailable()) {
        return res.status(503).json({ error: "Transcription service not available (OpenAI API key not configured)" });
      }
      
      // Decode base64 audio
      const audioBuffer = Buffer.from(audio, "base64");
      
      if (audioBuffer.length === 0) {
        return res.status(400).json({ error: "Audio data is empty" });
      }
      
      // Create audio chunk for transcription
      const audioChunk = {
        startMs: 0,
        endMs: 0,
        data: audioBuffer,
      };
      
      const transcriber = getTranscriber();
      const result = await transcriber.transcribeChunk(audioChunk);
      
      if (!result || !result.text) {
        return res.status(200).json({ text: "", message: "No speech detected" });
      }
      
      console.log(`[Transcribe] Successfully transcribed ${audioBuffer.length} bytes: "${result.text.substring(0, 50)}..."`);
      
      res.json({ text: result.text });
    } catch (error: any) {
      console.error("[Transcribe] Error:", error);
      
      if (error.message?.includes("audio file is too short")) {
        return res.status(200).json({ text: "", message: "Recording too short" });
      }
      
      res.status(500).json({ error: error.message || "Failed to transcribe audio" });
    }
  });
  
  // Chat endpoint - sends message and gets AI response
  app.post("/api/chat", async (req, res) => {
    try {
      const parsed = chatRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body" });
      }
      
      const { message, conversationId, source, fileIds } = parsed.data;
      let conversation;
      let isNewConversation = false;
      
      if (conversationId) {
        conversation = getConversation(conversationId);
        if (!conversation) {
          return res.status(404).json({ message: "Conversation not found" });
        }
      } else {
        conversation = createConversation({ source });
        isNewConversation = true;
      }
      
      // Store user message
      const userMessage = createMessage({
        conversationId: conversation.id,
        role: "user",
        content: message,
        source,
      });
      
      // Link attached files to the user message
      if (fileIds && fileIds.length > 0) {
        for (const fileId of fileIds) {
          linkFileToMessage(fileId, userMessage.id);
        }
      }
      
      // Get user permissions for the Python agent
      let userPermissions;
      if (conversation.phoneNumber) {
        userPermissions = getPermissionsForPhone(conversation.phoneNumber);
      } else {
        userPermissions = getAdminPermissions();
      }
      
      // Get AI response - try Python multi-agent service first, fallback to legacy
      let aiResponse: string;
      
      try {
        // Call Python multi-agent service
        // For web requests without a phone number, this is the trusted admin interface
        const isWebAdmin = source === 'web' && !conversation.phoneNumber;
        const pythonResponse = await fetch('http://127.0.0.1:5001/api/agents/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            conversation_id: conversation.id,
            phone_number: conversation.phoneNumber || undefined,
            metadata: {
              source,
              permissions: userPermissions,
              is_admin: isWebAdmin || userPermissions.isAdmin,
              trusted_single_user_deployment: true,
              file_ids: fileIds || [],
            }
          }),
          signal: AbortSignal.timeout(30000), // 30 second timeout
        });
        
        if (pythonResponse.ok) {
          const result = await pythonResponse.json() as { response: string; trace_id?: string; metadata?: { completion_status?: string } };
          aiResponse = result.response;
          // Log trace_id for observability
          console.log(`[Python Agent] trace_id=${result.trace_id}, status=${result.metadata?.completion_status}`);
        } else {
          throw new Error(`Python agent returned ${pythonResponse.status}`);
        }
      } catch (pythonError) {
        // Fallback to legacy single-agent chat (deprecated)
        console.warn('[Python Agent] FALLBACK_TO_LEGACY - Python agent unavailable, using deprecated single-agent loop');
        console.warn('[Python Agent] Error details:', pythonError);
        aiResponse = await chat(conversation.id, message, isNewConversation, conversation.phoneNumber || undefined);
      }
      
      // Store assistant message
      const assistantMessage = createMessage({
        conversationId: conversation.id,
        role: "assistant",
        content: aiResponse,
        source,
      });
      
      // If this is an SMS conversation, also send the AI response via SMS
      if (conversation.source === "sms" && conversation.phoneNumber) {
        try {
          const fromNumber = await getTwilioFromPhoneNumber();
          if (fromNumber) {
            const client = await getTwilioClient();
            const formattedPhone = formatPhoneNumber(conversation.phoneNumber);
            await client.messages.create({
              body: aiResponse,
              from: fromNumber,
              to: formattedPhone,
            });
            console.log(`SMS reply sent to ${formattedPhone} from web chat`);
          } else {
            console.warn("Twilio phone number not configured - SMS reply not sent");
          }
        } catch (smsError: any) {
          console.error("Failed to send SMS reply:", smsError);
          // Don't fail the request, just log the error
        }
      }
      
      // Get updated conversation (for new title if generated)
      const updatedConversation = getConversation(conversation.id);
      
      res.json({
        message: assistantMessage,
        conversation: updatedConversation,
      });
    } catch (error: any) {
      console.error("Chat error:", error);
      res.status(500).json({ message: error.message || "Failed to process chat" });
    }
  });
  
  // Create a Getting To Know You conversation (resets each time, generates contextual questions)
  app.post("/api/conversations/getting-to-know", async (_req, res) => {
    try {
      const conversation = createConversation({ 
        source: "web",
        title: "Getting To Know You",
        mode: "getting_to_know"
      });
      
      // Generate a contextual question based on existing memories
      const firstQuestion = await generateContextualQuestion();
      
      const assistantMessage = createMessage({
        conversationId: conversation.id,
        role: "assistant",
        content: firstQuestion,
        source: "web",
      });
      
      res.json({
        conversation,
        message: assistantMessage,
      });
    } catch (error: any) {
      console.error("Create getting to know conversation error:", error);
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });
  
  // Get all conversations
  app.get("/api/conversations", async (_req, res) => {
    try {
      const conversations = getAllConversations();
      res.json(conversations);
    } catch (error: any) {
      console.error("Get conversations error:", error);
      res.status(500).json({ message: "Failed to get conversations" });
    }
  });
  
  // Get single conversation with messages
  app.get("/api/conversations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const conversation = getConversation(id);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      const messages = getMessagesByConversation(id);
      
      res.json({ conversation, messages });
    } catch (error: any) {
      console.error("Get conversation error:", error);
      res.status(500).json({ message: "Failed to get conversation" });
    }
  });
  
  // Delete conversation
  app.delete("/api/conversations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const conversation = getConversation(id);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      deleteConversation(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete conversation error:", error);
      res.status(500).json({ message: "Failed to delete conversation" });
    }
  });
  
  // Twilio SMS webhook - sends reply via API for reliability
  app.post("/api/twilio/webhook", async (req, res) => {
    try {
      // Log full request for debugging
      console.log("Twilio webhook received:", JSON.stringify(req.body));
      
      const { 
        Body: message, 
        From: rawFromNumber, 
        MessageSid: messageSid,
        NumMedia: numMediaStr,
      } = req.body;
      
      const numMedia = parseInt(numMediaStr || "0", 10);
      
      // Allow messages without text body if they have media (MMS)
      if ((!message && numMedia === 0) || !rawFromNumber) {
        console.log("Missing message/media or phone number in webhook");
        return res.status(200).send("OK"); // Return 200 to prevent Twilio retries
      }
      
      // Format phone number consistently
      const fromNumber = formatPhoneNumber(rawFromNumber);
      let twilioFromNumber = "";
      try {
        twilioFromNumber = await getTwilioFromPhoneNumber() || "";
      } catch {
        console.warn("Could not get Twilio phone number for inbound logging");
      }
      console.log(`SMS received from ${fromNumber}: ${message || "(no text)"}, Media: ${numMedia}`);
      
      // Extract MMS media URLs if present
      const mediaUrls: Array<{ url: string; contentType: string }> = [];
      for (let i = 0; i < numMedia; i++) {
        const mediaUrl = req.body[`MediaUrl${i}`];
        const mediaContentType = req.body[`MediaContentType${i}`];
        if (mediaUrl) {
          mediaUrls.push({ url: mediaUrl, contentType: mediaContentType || "image/jpeg" });
          console.log(`[MMS] Media ${i}: ${mediaContentType} - ${mediaUrl}`);
        }
      }
      
      // Log inbound message
      logTwilioMessage({
        direction: "inbound",
        source: "webhook",
        fromNumber: fromNumber,
        toNumber: twilioFromNumber,
        body: message || `[MMS: ${numMedia} attachment(s)]`,
        twilioSid: messageSid,
        status: "received",
      });
      
      // Immediately acknowledge receipt to Twilio (prevents timeout issues)
      res.status(200).send("OK");
      
      // Process message asynchronously
      try {
        // Find or create SMS conversation using formatted phone number
        const conversation = findOrCreateSmsConversation(fromNumber);
        
        // Get sender info for context
        const contact = getContactByPhone(fromNumber);
        const senderName = contact ? getContactFullName(contact) : undefined;
        
        // Process MMS images if present
        let imageAnalysisContext = "";
        let imageAnalysisResults: Array<ImageAnalysisResult & { personAnalysis?: PersonPhotoAnalysisResult }> = [];
        
        if (mediaUrls.length > 0) {
          console.log(`[MMS] Processing ${mediaUrls.length} media attachment(s) from ${fromNumber}`);
          
          for (const media of mediaUrls) {
            if (media.contentType.startsWith("image/")) {
              try {
                const analysis = await analyzeMmsImage(media.url, {
                  senderName,
                  senderPhone: fromNumber,
                  messageText: message,
                });
                imageAnalysisResults.push(analysis);
                console.log(`[MMS] Image analyzed: ${analysis.description?.substring(0, 100)}...`);
              } catch (error: any) {
                console.error(`[MMS] Failed to analyze image: ${error.message}`);
                imageAnalysisResults.push({
                  description: "Image could not be analyzed",
                  confidence: 0,
                });
              }
            }
          }
          
          // Build context string for AI
          if (imageAnalysisResults.length > 0) {
            imageAnalysisContext = "\n\n[IMAGE ANALYSIS]\n";
            imageAnalysisResults.forEach((result, idx) => {
              imageAnalysisContext += `Image ${idx + 1}:\n`;
              imageAnalysisContext += `- Description: ${result.description}\n`;
              if (result.personAnalysis?.hasPeople) {
                imageAnalysisContext += `- People: ${result.personAnalysis.peopleCount} person(s) detected\n`;
                result.personAnalysis.peopleDescriptions.forEach((person, pIdx) => {
                  imageAnalysisContext += `  Person ${pIdx + 1} (${person.position}): ${person.description}`;
                  if (person.clothing) imageAnalysisContext += `, wearing ${person.clothing}`;
                  if (person.distinguishingFeatures) imageAnalysisContext += `, ${person.distinguishingFeatures}`;
                  imageAnalysisContext += "\n";
                });
                if (result.personAnalysis.setting) {
                  imageAnalysisContext += `- Setting: ${result.personAnalysis.setting}\n`;
                }
                if (result.personAnalysis.occasion) {
                  imageAnalysisContext += `- Occasion: ${result.personAnalysis.occasion}\n`;
                }
                if (result.personAnalysis.suggestedMemory) {
                  imageAnalysisContext += `- Suggested memory: ${result.personAnalysis.suggestedMemory}\n`;
                }
              }
              if (result.objects?.length) {
                imageAnalysisContext += `- Objects: ${result.objects.join(", ")}\n`;
              }
            });
          }
        }
        
        // Combine message with image context
        const fullMessage = message 
          ? (imageAnalysisContext ? `${message}${imageAnalysisContext}` : message)
          : (imageAnalysisContext ? `[User sent an image]${imageAnalysisContext}` : "[User sent empty message]");
        
        // Check if user is responding to a pending place save request BEFORE storing message
        if (hasPendingPlaceSave(fromNumber) && message && message.trim().length > 0 && message.trim().length < 100) {
          const placeName = message.trim();
          const savedPlace = completePendingPlaceSave(fromNumber, placeName);
          
          if (savedPlace) {
            const confirmationMsg = `Saved "${savedPlace.name}" at this location! I'll remember this place for you.`;
            
            // Log inbound message for auditing
            logTwilioMessage({
              direction: "inbound",
              source: "webhook",
              fromNumber: fromNumber,
              toNumber: twilioFromNumber,
              body: `[Place name reply] ${placeName}`,
              twilioSid: messageSid,
              status: "received",
            });
            
            // Log both the place name reply and confirmation in conversation
            createMessage({
              conversationId: conversation.id,
              role: "user",
              content: `[Place name reply] ${placeName}`,
              source: "sms",
            });
            
            createMessage({
              conversationId: conversation.id,
              role: "assistant",
              content: confirmationMsg,
              source: "sms",
            });
            
            try {
              const replyFromNumber = await getTwilioFromPhoneNumber();
              if (replyFromNumber) {
                const client = await getTwilioClient();
                await client.messages.create({
                  body: confirmationMsg,
                  from: replyFromNumber,
                  to: fromNumber,
                });
                
                logTwilioMessage({
                  direction: "outbound",
                  source: "reply",
                  fromNumber: replyFromNumber,
                  toNumber: fromNumber,
                  body: confirmationMsg,
                  status: "sent",
                  conversationId: conversation.id,
                });
                
                console.log(`[SavePlace] Confirmed place save to ${fromNumber}: "${savedPlace.name}"`);
              }
            } catch (sendErr: any) {
              console.error(`[SavePlace] Failed to send confirmation SMS:`, sendErr);
            }
            
            return; // Exit early, don't process as regular message
          }
        }
        
        // Store user message (only if not a pending place reply)
        createMessage({
          conversationId: conversation.id,
          role: "user",
          content: fullMessage,
          source: "sms",
        });
        
        // Check for sleep quality response (1-10 rating or A/B/C/D from morning briefing)
        if (message && shouldAskSleepQuality()) {
          const trimmedMsg = message.trim().toUpperCase();
          
          // Parse rating - accept 1-10 directly or A/B/C/D mapped to ranges
          let quality: number | null = null;
          const numericMatch = trimmedMsg.match(/^([1-9]|10)$/);
          
          if (numericMatch) {
            quality = parseInt(numericMatch[1]);
          } else if (trimmedMsg === "A") {
            quality = 2; // Poor: 1-3
          } else if (trimmedMsg === "B") {
            quality = 5; // Fair: 4-5
          } else if (trimmedMsg === "C") {
            quality = 7; // Good: 6-7
          } else if (trimmedMsg === "D") {
            quality = 9; // Great: 8-10
          }
          
          if (quality !== null) {
            recordSleepQuality(quality);
            markSleepQualityAsked(); // Mark as asked to prevent repeat prompts
            
            let qualityResponse = "";
            if (quality >= 8) {
              qualityResponse = `Great, recorded sleep quality ${quality}/10. Have a productive day!`;
            } else if (quality >= 6) {
              qualityResponse = `Recorded ${quality}/10 sleep. Solid rest. Have a good day!`;
            } else if (quality >= 4) {
              qualityResponse = `Recorded ${quality}/10 sleep. Maybe a power nap later if needed.`;
            } else {
              qualityResponse = `Noted ${quality}/10 sleep. Take it easy today if you can.`;
            }
            
            createMessage({
              conversationId: conversation.id,
              role: "assistant",
              content: qualityResponse,
              source: "sms",
            });
            
            try {
              const replyFromNumber = await getTwilioFromPhoneNumber();
              if (replyFromNumber) {
                const client = await getTwilioClient();
                await client.messages.create({
                  body: qualityResponse,
                  from: replyFromNumber,
                  to: fromNumber,
                });
                logTwilioMessage({
                  direction: "outbound",
                  source: "reply",
                  fromNumber: replyFromNumber,
                  toNumber: fromNumber,
                  body: qualityResponse,
                  status: "sent",
                  conversationId: conversation.id,
                });
                console.log(`[SleepQuality] Recorded quality ${quality}/10 from ${fromNumber}`);
              }
            } catch (sendErr: any) {
              console.error(`[SleepQuality] Failed to send confirmation SMS:`, sendErr);
            }
            
            return; // Exit early, handled as sleep quality response
          }
        }
        
        // Check for quick action commands first (GROCERY, REMIND, REMEMBER, LIST)
        // Skip quick actions if there are images - let AI handle them for memory/contact updates
        console.log(`[QuickAction] Processing message from ${fromNumber}: "${(message || "").substring(0, 50)}${(message || "").length > 50 ? '...' : ''}"`);
        const quickAction = mediaUrls.length === 0 ? parseQuickAction(message || "") : { isQuickAction: false, type: null, params: {}, response: "" };
        let aiResponse: string;
        
        if (quickAction.isQuickAction) {
          console.log(`[QuickAction] Matched: type="${quickAction.type}", params=${JSON.stringify(quickAction.params)}`);
          aiResponse = quickAction.response;
        } else {
          console.log(`[QuickAction] No match - forwarding to AI`);
          aiResponse = await chat(conversation.id, fullMessage, false, fromNumber);
        }
        
        // Store assistant message
        createMessage({
          conversationId: conversation.id,
          role: "assistant",
          content: aiResponse,
          source: "sms",
        });
        
        // Send SMS reply via Twilio API
        try {
          const replyFromNumber = await getTwilioFromPhoneNumber();
          if (replyFromNumber) {
            const client = await getTwilioClient();
            const result = await client.messages.create({
              body: aiResponse,
              from: replyFromNumber,
              to: fromNumber,
            });
            
            // Log outbound reply
            logTwilioMessage({
              direction: "outbound",
              source: "reply",
              fromNumber: replyFromNumber,
              toNumber: fromNumber,
              body: aiResponse,
              twilioSid: result.sid,
              status: "sent",
              conversationId: conversation.id,
            });
            
            console.log(`SMS reply sent to ${fromNumber}`);
          } else {
            console.error("Twilio phone number not configured for reply");
          }
        } catch (sendError: any) {
          logTwilioMessage({
            direction: "outbound",
            source: "reply",
            fromNumber: twilioFromNumber,
            toNumber: fromNumber,
            body: aiResponse,
            status: "failed",
            conversationId: conversation.id,
            errorCode: sendError.code?.toString() || "UNKNOWN",
            errorMessage: sendError.message || "Unknown error",
          });
          throw sendError;
        }
      } catch (processError: any) {
        console.error("Error processing SMS:", processError);
        // Try to send error message
        try {
          const errorFromNumber = await getTwilioFromPhoneNumber();
          if (errorFromNumber) {
            const client = await getTwilioClient();
            const errorMsg = "Sorry, I encountered an error. Please try again.";
            const result = await client.messages.create({
              body: errorMsg,
              from: errorFromNumber,
              to: fromNumber,
            });
            
            logTwilioMessage({
              direction: "outbound",
              source: "reply",
              fromNumber: errorFromNumber,
              toNumber: fromNumber,
              body: errorMsg,
              twilioSid: result.sid,
              status: "sent",
            });
          }
        } catch (sendError: any) {
          console.error("Failed to send error SMS:", sendError);
        }
      }
    } catch (error: any) {
      console.error("Twilio webhook error:", error);
      res.status(200).send("OK"); // Always return 200 to prevent retries
    }
  });

  // Serve ElevenLabs generated audio files
  app.get("/api/audio/:audioId", async (req, res) => {
    try {
      const { audioId } = req.params;
      const filePath = getAudioFilePath(audioId);
      
      if (!filePath) {
        return res.status(404).send("Audio not found");
      }
      
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(filePath);
    } catch (error: any) {
      console.error("Audio serving error:", error);
      res.status(500).send("Error serving audio");
    }
  });

  // Twilio Voice webhook - handles incoming phone calls
  app.post("/api/twilio/voice", async (req, res) => {
    try {
      console.log("Twilio voice webhook received:", JSON.stringify(req.body));
      
      const { From: rawFromNumber, CallSid: callSid } = req.body;
      const fromNumber = rawFromNumber ? normalizePhoneNumber(rawFromNumber) : "Unknown";
      
      console.log(`Incoming call from ${fromNumber}, CallSid: ${callSid}`);
      
      const contact = getContactByPhone(fromNumber);
      const contactName = contact?.firstName || 'there';
      const greeting = contact 
        ? `Hello ${contactName}! This is Zeke, your personal AI assistant. How can I help you today?`
        : `Hello! This is Zeke, your personal AI assistant. How can I help you today?`;
      
      // Always use production URL for Twilio callbacks (dev domains aren't publicly accessible)
      const baseUrl = 'https://zekeai.replit.app';
      
      let twiml: string;
      
      if (isElevenLabsConfigured()) {
        try {
          const audioId = await generateSpeechAudio(greeting);
          twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${baseUrl}/api/audio/${audioId}</Play>
  <Gather input="speech" action="${baseUrl}/api/twilio/voice-response" method="POST" speechTimeout="auto" language="en-US">
  </Gather>
  <Say voice="Polly.Matthew">I didn't hear anything. Goodbye!</Say>
</Response>`;
        } catch (elevenLabsError) {
          console.error("ElevenLabs error, falling back to Polly:", elevenLabsError);
          twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">${escapeXml(greeting)}</Say>
  <Gather input="speech" action="${baseUrl}/api/twilio/voice-response" method="POST" speechTimeout="auto" language="en-US">
  </Gather>
  <Say voice="Polly.Matthew">I didn't hear anything. Goodbye!</Say>
</Response>`;
        }
      } else {
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">${escapeXml(greeting)}</Say>
  <Gather input="speech" action="${baseUrl}/api/twilio/voice-response" method="POST" speechTimeout="auto" language="en-US">
  </Gather>
  <Say voice="Polly.Matthew">I didn't hear anything. Goodbye!</Say>
</Response>`;
      }
      
      res.type('text/xml');
      res.send(twiml);
    } catch (error: any) {
      console.error("Twilio voice webhook error:", error);
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">Sorry, I encountered an error. Please try again later.</Say>
</Response>`;
      res.type('text/xml');
      res.send(errorTwiml);
    }
  });

  // Twilio Voice response - processes speech input and generates AI response
  app.post("/api/twilio/voice-response", async (req, res) => {
    try {
      console.log("Twilio voice-response received:", JSON.stringify(req.body));
      
      const { SpeechResult: speechText, From: rawFromNumber, CallSid: callSid } = req.body;
      // Use normalizePhoneNumber for consistent contact/conversation lookup
      const fromNumber = rawFromNumber ? normalizePhoneNumber(rawFromNumber) : "Unknown";
      
      console.log(`Speech from ${fromNumber}: "${speechText}"`);
      
      // Always use production URL for Twilio callbacks (dev domains aren't publicly accessible)
      const baseUrl = 'https://zekeai.replit.app';
      
      if (!speechText) {
        const noInputTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">I didn't catch that. Could you please repeat?</Say>
  <Gather input="speech" action="${baseUrl}/api/twilio/voice-response" method="POST" speechTimeout="auto" language="en-US">
  </Gather>
  <Say voice="Polly.Matthew">I still couldn't hear you. Goodbye!</Say>
</Response>`;
        res.type('text/xml');
        return res.send(noInputTwiml);
      }
      
      // Find or create conversation for this phone call (uses normalized phone number)
      const conversation = findOrCreateSmsConversation(fromNumber);
      
      // Store user message
      createMessage({
        conversationId: conversation.id,
        role: "user",
        content: speechText,
        source: "voice",
      });
      
      // Generate AI response
      let aiResponse: string;
      try {
        // Check for quick actions first
        const quickAction = parseQuickAction(speechText);
        if (quickAction.isQuickAction) {
          aiResponse = quickAction.response;
        } else {
          aiResponse = await chat(conversation.id, speechText, false, fromNumber);
        }
      } catch (aiError: any) {
        console.error("AI response error:", aiError);
        aiResponse = "Sorry, I had trouble processing that. Could you try again?";
      }
      
      // Store assistant message
      createMessage({
        conversationId: conversation.id,
        role: "assistant",
        content: aiResponse,
        source: "voice",
      });
      
      console.log(`AI response for voice: "${aiResponse.substring(0, 100)}..."`);
      
      let responseTwiml: string;
      
      if (isElevenLabsConfigured()) {
        try {
          // Combine response and follow-up into single audio generation to save time
          const combinedMessage = `${aiResponse} ... Is there anything else I can help you with?`;
          const audioId = await generateSpeechAudio(combinedMessage);
          responseTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${baseUrl}/api/twilio/voice-response" method="POST" speechTimeout="auto" language="en-US">
    <Play>${baseUrl}/api/audio/${audioId}</Play>
  </Gather>
  <Say voice="Polly.Matthew">Thank you for calling. Goodbye!</Say>
</Response>`;
        } catch (elevenLabsError) {
          console.error("ElevenLabs error, falling back to Polly:", elevenLabsError);
          responseTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${baseUrl}/api/twilio/voice-response" method="POST" speechTimeout="auto" language="en-US">
    <Say voice="Polly.Matthew">${escapeXml(aiResponse)} Is there anything else I can help you with?</Say>
  </Gather>
  <Say voice="Polly.Matthew">Thank you for calling. Goodbye!</Say>
</Response>`;
        }
      } else {
        responseTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${baseUrl}/api/twilio/voice-response" method="POST" speechTimeout="auto" language="en-US">
    <Say voice="Polly.Matthew">${escapeXml(aiResponse)} Is there anything else I can help you with?</Say>
  </Gather>
  <Say voice="Polly.Matthew">Thank you for calling. Goodbye!</Say>
</Response>`;
      }
      
      res.type('text/xml');
      res.send(responseTwiml);
    } catch (error: any) {
      console.error("Twilio voice-response error:", error);
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">Sorry, I encountered an error. Please try again later.</Say>
</Response>`;
      res.type('text/xml');
      res.send(errorTwiml);
    }
  });

  // Twilio Status callback - receives delivery/call status updates
  app.post("/api/twilio/status", async (req, res) => {
    try {
      console.log("Twilio status callback received:", JSON.stringify(req.body));
      
      const { 
        MessageSid, 
        CallSid,
        MessageStatus, 
        CallStatus,
        ErrorCode, 
        ErrorMessage 
      } = req.body;
      
      // Handle SMS status updates
      if (MessageSid && MessageStatus) {
        console.log(`SMS ${MessageSid} status: ${MessageStatus}`);
        updateTwilioMessageStatus(MessageSid, MessageStatus);
        
        if (ErrorCode || ErrorMessage) {
          updateTwilioMessageError(MessageSid, ErrorCode || "UNKNOWN", ErrorMessage || "Unknown error");
        }
      }
      
      // Handle Call status updates
      if (CallSid && CallStatus) {
        console.log(`Call ${CallSid} status: ${CallStatus}`);
        // Could track call status in database if needed
      }
      
      res.status(200).send("OK");
    } catch (error: any) {
      console.error("Twilio status callback error:", error);
      res.status(200).send("OK"); // Always return 200 to prevent retries
    }
  });

  // Initiate outbound voice call
  app.post("/api/twilio/call", async (req, res) => {
    try {
      const { phoneNumber, message } = req.body;
      
      if (!phoneNumber) {
        return res.status(400).json({ message: "Phone number is required" });
      }
      
      const twilioFromNumber = await getTwilioFromPhoneNumber();
      if (!twilioFromNumber) {
        return res.status(500).json({ message: "Twilio phone number not configured" });
      }
      
      // Use formatPhoneNumber for Twilio API (needs +1 format)
      const formattedPhone = formatPhoneNumber(phoneNumber);
      // Use normalizePhoneNumber for contact lookup (consistent with storage)
      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      const client = await getTwilioClient();
      
      // Always use production URL for Twilio callbacks (dev domains aren't publicly accessible)
      const baseUrl = 'https://zekeai.replit.app';
      
      // Determine what to say on the call - escape contact name for URL safety
      const contact = getContactByPhone(normalizedPhone);
      const contactName = contact?.firstName || 'there';
      const greeting = contact 
        ? `Hello ${contactName}! This is Zeke calling.`
        : `Hello! This is Zeke calling.`;
      
      const spokenMessage = message 
        ? `${greeting} ${message}` 
        : `${greeting} How can I help you today?`;
      
      // Create TwiML for the outbound call (encodeURIComponent handles special chars)
      const twimlUrl = `${baseUrl}/api/twilio/outbound-twiml?message=${encodeURIComponent(spokenMessage)}`;
      
      const call = await client.calls.create({
        url: twimlUrl,
        to: formattedPhone,
        from: twilioFromNumber,
        statusCallback: `${baseUrl}/api/twilio/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
      });
      
      console.log(`Outbound call initiated to ${formattedPhone}, CallSid: ${call.sid}`);
      
      res.json({ 
        success: true, 
        callSid: call.sid,
        to: formattedPhone,
        message: "Call initiated successfully"
      });
    } catch (error: any) {
      console.error("Failed to initiate call:", error);
      res.status(500).json({ 
        message: "Failed to initiate call", 
        error: error.message 
      });
    }
  });

  // TwiML endpoint for outbound calls
  app.get("/api/twilio/outbound-twiml", async (req, res) => {
    try {
      const message = req.query.message as string || "Hello! This is Zeke. How can I help you?";
      
      // Always use production URL for Twilio callbacks (dev domains aren't publicly accessible)
      const baseUrl = 'https://zekeai.replit.app';
      
      let twiml: string;
      
      if (isElevenLabsConfigured()) {
        try {
          const audioId = await generateSpeechAudio(message);
          twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${baseUrl}/api/audio/${audioId}</Play>
  <Gather input="speech" action="${baseUrl}/api/twilio/voice-response" method="POST" speechTimeout="auto" language="en-US">
  </Gather>
  <Say voice="Polly.Matthew">I didn't hear a response. Goodbye!</Say>
</Response>`;
        } catch (elevenLabsError) {
          console.error("ElevenLabs error, falling back to Polly:", elevenLabsError);
          twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">${escapeXml(message)}</Say>
  <Gather input="speech" action="${baseUrl}/api/twilio/voice-response" method="POST" speechTimeout="auto" language="en-US">
  </Gather>
  <Say voice="Polly.Matthew">I didn't hear a response. Goodbye!</Say>
</Response>`;
        }
      } else {
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">${escapeXml(message)}</Say>
  <Gather input="speech" action="${baseUrl}/api/twilio/voice-response" method="POST" speechTimeout="auto" language="en-US">
  </Gather>
  <Say voice="Polly.Matthew">I didn't hear a response. Goodbye!</Say>
</Response>`;
      }
      
      res.type('text/xml');
      res.send(twiml);
    } catch (error: any) {
      console.error("Outbound TwiML error:", error);
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">Sorry, there was an error. Goodbye.</Say>
</Response>`;
      res.type('text/xml');
      res.send(errorTwiml);
    }
  });

  // Omi wearable webhook - receives real-time memory updates
  app.post("/api/omi/webhook", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Omi webhook received:`, JSON.stringify(req.body).substring(0, 200));
      
      const payload = req.body;
      
      if (!payload || !payload.event) {
        console.log("Invalid Omi webhook payload - missing event type");
        return res.status(400).json({ message: "Missing event type" });
      }
      
      // Immediately acknowledge receipt
      res.status(200).json({ received: true });
      
      // Process webhook asynchronously
      try {
        await processOmiWebhook(payload);
        console.log(`[Omi] Webhook processed successfully: ${payload.event}`);
      } catch (processError: any) {
        console.error("[Omi] Webhook processing error:", processError);
      }
    } catch (error: any) {
      console.error("Omi webhook error:", error);
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });

  // GET /api/omi/status - Get Omi listener status
  app.get("/api/omi/status", async (_req, res) => {
    try {
      const status = getOmiListenerStatus();
      res.json({
        ...status,
        type: "webhook-based",
        message: status.running 
          ? "Omi listener is active and receiving webhooks" 
          : "Omi listener is not running - configure OMI_USER_ID to enable"
      });
    } catch (error: any) {
      console.error("Omi status error:", error);
      res.status(500).json({ message: "Failed to get Omi status" });
    }
  });
  
  // Get all memory notes
  app.get("/api/memory", async (_req, res) => {
    try {
      const notes = getAllMemoryNotes();
      res.json(notes);
    } catch (error: any) {
      console.error("Get memory error:", error);
      res.status(500).json({ message: "Failed to get memory notes" });
    }
  });
  
  // Create memory note
  app.post("/api/memory", async (req, res) => {
    try {
      const parsed = insertMemoryNoteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body" });
      }
      
      const { embedding, ...restData } = parsed.data;
      const noteInput = {
        ...restData,
        embedding: undefined, // Embeddings are generated server-side
      };
      const note = createMemoryNote(noteInput);
      res.json(note);
    } catch (error: any) {
      console.error("Create memory error:", error);
      res.status(500).json({ message: "Failed to create memory note" });
    }
  });
  
  // Delete memory note
  app.delete("/api/memory/:id", async (req, res) => {
    try {
      const { id } = req.params;
      deleteMemoryNote(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete memory error:", error);
      res.status(500).json({ message: "Failed to delete memory note" });
    }
  });
  
  // Get all preferences
  app.get("/api/preferences", async (_req, res) => {
    try {
      const prefs = getAllPreferences();
      res.json(prefs);
    } catch (error: any) {
      console.error("Get preferences error:", error);
      res.status(500).json({ message: "Failed to get preferences" });
    }
  });
  
  // Set preference
  app.post("/api/preferences", async (req, res) => {
    try {
      const parsed = insertPreferenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body" });
      }
      
      const pref = setPreference(parsed.data);
      res.json(pref);
    } catch (error: any) {
      console.error("Set preference error:", error);
      res.status(500).json({ message: "Failed to set preference" });
    }
  });
  
  // Export all data as JSON backup
  // SECURITY: This endpoint exposes sensitive data. Multiple layers of protection:
  // 1. Logging all access attempts
  // 2. Origin/Referer header check for same-origin requests (web UI only)
  // 3. Optional secret token via query param or header for programmatic access
  app.get("/api/export", async (req, res) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const origin = req.headers['origin'] || '';
    const referer = req.headers['referer'] || '';
    
    // Log all access attempts for security audit
    console.log(`[SECURITY] Export endpoint accessed - IP: ${clientIp}, User-Agent: ${userAgent}, Origin: ${origin}, Referer: ${referer}`);
    
    try {
      // Check for secret token if configured (for programmatic access)
      const exportToken = process.env.EXPORT_SECRET_TOKEN;
      const providedToken = req.query.token as string || req.headers['x-export-token'] as string;
      
      // If token is configured, allow access with valid token
      if (exportToken && providedToken === exportToken) {
        console.log(`[SECURITY] Export access granted via secret token - IP: ${clientIp}`);
      } else {
        // Otherwise, verify this is a same-origin request from the web UI
        const host = req.headers['host'] || '';
        const isSameOrigin = origin ? origin.includes(host) : true; // If no origin header, might be direct navigation
        const isSameReferer = referer ? referer.includes(host) : true;
        
        // Block requests with mismatched origins (CSRF-like protection)
        if (origin && !isSameOrigin) {
          console.warn(`[SECURITY] Export blocked - origin mismatch. Origin: ${origin}, Host: ${host}, IP: ${clientIp}`);
          return res.status(403).json({ message: "Access denied" });
        }
        
        // If a token is configured but not provided/matched, require same-origin
        if (exportToken && !isSameReferer && !isSameOrigin) {
          console.warn(`[SECURITY] Export blocked - token required for cross-origin access. IP: ${clientIp}`);
          return res.status(403).json({ message: "Access denied - authentication required" });
        }
        
        console.log(`[SECURITY] Export access granted via same-origin check - IP: ${clientIp}`);
      }
      
      const memories = getAllMemoryNotes();
      const preferences = getAllPreferences();
      const contacts = getAllContacts();
      const groceryItems = getAllGroceryItems();
      const tasks = getAllTasks();
      const reminders = getAllReminders();
      
      const exportData = {
        exportedAt: new Date().toISOString(),
        version: "1.0",
        data: {
          memories,
          preferences,
          contacts,
          groceryItems,
          tasks,
          reminders,
        },
      };
      
      const filename = `zeke-backup-${new Date().toISOString().split('T')[0]}.json`;
      
      console.log(`[SECURITY] Export completed successfully - Records: ${memories.length} memories, ${contacts.length} contacts, ${tasks.length} tasks - IP: ${clientIp}`);
      
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.json(exportData);
    } catch (error: any) {
      console.error(`[SECURITY] Export failed - IP: ${clientIp}, Error:`, error);
      res.status(500).json({ message: "Export operation failed" });
    }
  });
  
  // Send outbound SMS
  // SECURITY NOTE: This is a privileged admin-only endpoint accessible from the web interface.
  // The web interface is trusted with admin permissions by design.
  app.post("/api/sms/send", async (req, res) => {
    try {
      const parsed = sendSmsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body" });
      }
      
      const { to, message } = parsed.data;
      const fromNumber = await getTwilioFromPhoneNumber();
      
      if (!fromNumber) {
        return res.status(500).json({ message: "Twilio phone number not configured" });
      }
      
      // Log privileged operation for security audit
      console.log(`PRIVILEGED: Direct SMS send requested via web interface to ${to}`);
      
      const client = await getTwilioClient();
      
      // Format phone number
      const formattedTo = formatPhoneNumber(to);
      
      try {
        const result = await client.messages.create({
          body: message,
          from: fromNumber,
          to: formattedTo,
        });
        
        logTwilioMessage({
          direction: "outbound",
          source: "web_ui",
          fromNumber: fromNumber,
          toNumber: formattedTo,
          body: message,
          twilioSid: result.sid,
          status: "sent",
        });
        
        console.log(`SMS sent to ${formattedTo}: ${result.sid}`);
        
        res.json({ 
          success: true, 
          sid: result.sid,
          to: formattedTo,
        });
      } catch (sendError: any) {
        logTwilioMessage({
          direction: "outbound",
          source: "web_ui",
          fromNumber: fromNumber,
          toNumber: formattedTo,
          body: message,
          status: "failed",
          errorCode: sendError.code?.toString() || "UNKNOWN",
          errorMessage: sendError.message || "Unknown error",
        });
        
        throw sendError;
      }
    } catch (error: any) {
      console.error("Send SMS error:", error);
      res.status(500).json({ message: error.message || "Failed to send SMS" });
    }
  });
  
  // === GROCERY LIST API ROUTES ===
  
  // Get all grocery items
  app.get("/api/grocery", async (_req, res) => {
    try {
      const items = getAllGroceryItems();
      res.json(items);
    } catch (error: any) {
      console.error("Get grocery items error:", error);
      res.status(500).json({ message: "Failed to get grocery items" });
    }
  });
  
  // Create grocery item
  app.post("/api/grocery", async (req, res) => {
    try {
      const parsed = insertGroceryItemSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      
      const item = createGroceryItem(parsed.data);
      res.json(item);
    } catch (error: any) {
      console.error("Create grocery item error:", error);
      res.status(500).json({ message: "Failed to create grocery item" });
    }
  });
  
  // Update grocery item
  app.patch("/api/grocery/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = getGroceryItem(id);
      
      if (!existing) {
        return res.status(404).json({ message: "Grocery item not found" });
      }
      
      const parsed = updateGroceryItemSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      
      const item = updateGroceryItem(id, parsed.data);
      res.json(item);
    } catch (error: any) {
      console.error("Update grocery item error:", error);
      res.status(500).json({ message: "Failed to update grocery item" });
    }
  });
  
  // Toggle grocery item purchased status
  app.post("/api/grocery/:id/toggle", async (req, res) => {
    try {
      const { id } = req.params;
      const item = toggleGroceryItemPurchased(id);
      
      if (!item) {
        return res.status(404).json({ message: "Grocery item not found" });
      }
      
      res.json(item);
    } catch (error: any) {
      console.error("Toggle grocery item error:", error);
      res.status(500).json({ message: "Failed to toggle grocery item" });
    }
  });
  
  // Delete grocery item
  app.delete("/api/grocery/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = getGroceryItem(id);
      
      if (!existing) {
        return res.status(404).json({ message: "Grocery item not found" });
      }
      
      deleteGroceryItem(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete grocery item error:", error);
      res.status(500).json({ message: "Failed to delete grocery item" });
    }
  });
  
  // Clear all purchased items
  app.post("/api/grocery/clear-purchased", async (_req, res) => {
    try {
      const count = clearPurchasedGroceryItems();
      res.json({ success: true, deleted: count });
    } catch (error: any) {
      console.error("Clear purchased items error:", error);
      res.status(500).json({ message: "Failed to clear purchased items" });
    }
  });
  
  // Get grocery auto-clear settings
  app.get("/api/grocery/settings", async (_req, res) => {
    try {
      const autoClearHours = getGroceryAutoClearHours();
      res.json({ autoClearHours });
    } catch (error: any) {
      console.error("Get grocery settings error:", error);
      res.status(500).json({ message: "Failed to get grocery settings" });
    }
  });
  
  // Update grocery auto-clear settings
  app.post("/api/grocery/settings", async (req, res) => {
    try {
      const { autoClearHours } = req.body;
      if (typeof autoClearHours !== "number" || autoClearHours < 0) {
        return res.status(400).json({ message: "Invalid autoClearHours value" });
      }
      setGroceryAutoClearHours(autoClearHours);
      res.json({ success: true, autoClearHours });
    } catch (error: any) {
      console.error("Update grocery settings error:", error);
      res.status(500).json({ message: "Failed to update grocery settings" });
    }
  });
  
  // Get AI-powered grocery suggestions
  app.post("/api/grocery/suggestions", async (req, res) => {
    try {
      const { item, items } = req.body as { item?: string; items?: string[] };
      
      if (!item && (!items || items.length === 0)) {
        return res.status(400).json({ 
          message: "Please provide either 'item' (single item) or 'items' (array of items) to get suggestions" 
        });
      }
      
      const currentGroceryList = getAllGroceryItems();
      const currentItemNames = currentGroceryList.map(i => i.name);
      
      let result;
      if (item) {
        result = await suggestRelatedGroceryItems(item, currentItemNames);
      } else if (items && items.length > 0) {
        result = await suggestRelatedGroceryItemsBulk(items, currentItemNames);
      }
      
      res.json({
        success: true,
        suggestions: result?.suggestions || [],
        mealIdeas: result?.mealIdeas || [],
        message: result?.suggestions && result.suggestions.length > 0 
          ? `Found ${result.suggestions.length} suggestion(s) for items that go well with your groceries`
          : "No additional suggestions at this time",
      });
    } catch (error: any) {
      console.error("Get grocery suggestions error:", error);
      res.status(500).json({ message: "Failed to get grocery suggestions" });
    }
  });
  
  // === CUSTOM LISTS API ROUTES ===
  // SECURITY: These routes log access for audit purposes and validate inputs strictly.
  // For a single-user app accessed via web UI, we trust same-origin requests.
  // Error messages are kept generic to avoid information disclosure.
  
  // Helper to log list access attempts
  const logListAccess = (action: string, req: Request, listId?: string) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    console.log(`[LIST ACCESS] ${action}${listId ? ` (list: ${listId})` : ''} - IP: ${clientIp}, UA: ${userAgent?.toString().substring(0, 50)}`);
  };
  
  // Get all custom lists
  app.get("/api/lists", async (req, res) => {
    logListAccess("GET /api/lists", req);
    try {
      const lists = getAllCustomLists();
      res.json(lists);
    } catch (error: any) {
      console.error("Get custom lists error:", error);
      res.status(500).json({ message: "Operation failed" });
    }
  });
  
  // Create custom list
  app.post("/api/lists", async (req, res) => {
    logListAccess("POST /api/lists", req);
    try {
      const parsed = insertCustomListSchema.safeParse(req.body);
      if (!parsed.success) {
        console.log("[LIST ACCESS] Invalid create request - validation failed");
        return res.status(400).json({ message: "Invalid request" });
      }
      
      const list = createCustomList(parsed.data);
      console.log(`[LIST ACCESS] Created list: ${list.id} - "${list.name}"`);
      res.json(list);
    } catch (error: any) {
      console.error("Create custom list error:", error);
      res.status(500).json({ message: "Operation failed" });
    }
  });
  
  // Get custom list with items
  app.get("/api/lists/:id", async (req, res) => {
    const { id } = req.params;
    logListAccess("GET /api/lists/:id", req, id);
    
    // Validate ID format (should be UUID-like)
    if (!id || typeof id !== 'string' || id.length > 100) {
      return res.status(400).json({ message: "Invalid request" });
    }
    
    try {
      const list = getCustomListWithItems(id);
      
      if (!list) {
        return res.status(404).json({ message: "Not found" });
      }
      
      res.json(list);
    } catch (error: any) {
      console.error("Get custom list error:", error);
      res.status(500).json({ message: "Operation failed" });
    }
  });
  
  // Update custom list
  app.patch("/api/lists/:id", async (req, res) => {
    const { id } = req.params;
    logListAccess("PATCH /api/lists/:id", req, id);
    
    if (!id || typeof id !== 'string' || id.length > 100) {
      return res.status(400).json({ message: "Invalid request" });
    }
    
    try {
      const existing = getCustomList(id);
      
      if (!existing) {
        return res.status(404).json({ message: "Not found" });
      }
      
      const parsed = updateCustomListSchema.safeParse(req.body);
      if (!parsed.success) {
        console.log(`[LIST ACCESS] Invalid update request for list ${id} - validation failed`);
        return res.status(400).json({ message: "Invalid request" });
      }
      
      const list = updateCustomList(id, parsed.data);
      console.log(`[LIST ACCESS] Updated list: ${id}`);
      res.json(list);
    } catch (error: any) {
      console.error("Update custom list error:", error);
      res.status(500).json({ message: "Operation failed" });
    }
  });
  
  // Delete custom list
  app.delete("/api/lists/:id", async (req, res) => {
    const { id } = req.params;
    logListAccess("DELETE /api/lists/:id", req, id);
    
    if (!id || typeof id !== 'string' || id.length > 100) {
      return res.status(400).json({ message: "Invalid request" });
    }
    
    try {
      const existing = getCustomList(id);
      
      if (!existing) {
        return res.status(404).json({ message: "Not found" });
      }
      
      deleteCustomList(id);
      console.log(`[LIST ACCESS] Deleted list: ${id} - "${existing.name}"`);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete custom list error:", error);
      res.status(500).json({ message: "Operation failed" });
    }
  });
  
  // Add item to custom list
  app.post("/api/lists/:id/items", async (req, res) => {
    const { id } = req.params;
    logListAccess("POST /api/lists/:id/items", req, id);
    
    if (!id || typeof id !== 'string' || id.length > 100) {
      return res.status(400).json({ message: "Invalid request" });
    }
    
    try {
      const existing = getCustomList(id);
      
      if (!existing) {
        return res.status(404).json({ message: "Not found" });
      }
      
      const parsed = insertCustomListItemSchema.safeParse({ ...req.body, listId: id });
      if (!parsed.success) {
        console.log(`[LIST ACCESS] Invalid item create request for list ${id.replace(/[^\w-]/g, '_')} - validation failed`);
        return res.status(400).json({ message: "Invalid request" });
      }
      
      const item = createCustomListItem(parsed.data);
      console.log(`[LIST ACCESS] Created item in list ${id}: ${item.id}`);
      res.json(item);
    } catch (error: any) {
      console.error("Create custom list item error:", error);
      res.status(500).json({ message: "Operation failed" });
    }
  });
  
  // Update custom list item
  app.patch("/api/lists/:id/items/:itemId", async (req, res) => {
    const { id, itemId } = req.params;
    logListAccess("PATCH /api/lists/:id/items/:itemId", req, id);
    
    if (!id || !itemId || typeof id !== 'string' || typeof itemId !== 'string' || id.length > 100 || itemId.length > 100) {
      return res.status(400).json({ message: "Invalid request" });
    }
    
    try {
      const existingList = getCustomList(id);
      
      if (!existingList) {
        return res.status(404).json({ message: "Not found" });
      }
      
      const existingItem = getCustomListItem(itemId);
      if (!existingItem || existingItem.listId !== id) {
        return res.status(404).json({ message: "Not found" });
      }
      
      const parsed = updateCustomListItemSchema.safeParse(req.body);
      if (!parsed.success) {
        console.log(`[LIST ACCESS] Invalid item update request for item ${itemId} - validation failed`);
        return res.status(400).json({ message: "Invalid request" });
      }
      
      const item = updateCustomListItem(itemId, parsed.data);
      console.log(`[LIST ACCESS] Updated item ${itemId} in list ${id}`);
      res.json(item);
    } catch (error: any) {
      console.error("Update custom list item error:", error);
      res.status(500).json({ message: "Operation failed" });
    }
  });
  
  // Delete custom list item
  app.delete("/api/lists/:id/items/:itemId", async (req, res) => {
    const { id, itemId } = req.params;
    logListAccess("DELETE /api/lists/:id/items/:itemId", req, id);
    
    if (!id || !itemId || typeof id !== 'string' || typeof itemId !== 'string' || id.length > 100 || itemId.length > 100) {
      return res.status(400).json({ message: "Invalid request" });
    }
    
    try {
      const existingList = getCustomList(id);
      
      if (!existingList) {
        return res.status(404).json({ message: "Not found" });
      }
      
      const existingItem = getCustomListItem(itemId);
      if (!existingItem || existingItem.listId !== id) {
        return res.status(404).json({ message: "Not found" });
      }
      
      deleteCustomListItem(itemId);
      console.log(`[LIST ACCESS] Deleted item ${itemId} from list ${id}`);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete custom list item error:", error);
      res.status(500).json({ message: "Operation failed" });
    }
  });
  
  // Toggle custom list item checked status
  app.post("/api/lists/:id/items/:itemId/toggle", async (req, res) => {
    const { id, itemId } = req.params;
    logListAccess("POST /api/lists/:id/items/:itemId/toggle", req, id);
    
    if (!id || !itemId || typeof id !== 'string' || typeof itemId !== 'string' || id.length > 100 || itemId.length > 100) {
      return res.status(400).json({ message: "Invalid request" });
    }
    
    try {
      const existingList = getCustomList(id);
      
      if (!existingList) {
        return res.status(404).json({ message: "Not found" });
      }
      
      const existingItem = getCustomListItem(itemId);
      if (!existingItem || existingItem.listId !== id) {
        return res.status(404).json({ message: "Not found" });
      }
      
      const item = toggleCustomListItemChecked(itemId);
      console.log(`[LIST ACCESS] Toggled item ${itemId} in list ${id} - checked: ${item?.checked}`);
      res.json(item);
    } catch (error: any) {
      console.error("Toggle custom list item error:", error);
      res.status(500).json({ message: "Operation failed" });
    }
  });
  
  // Clear all checked items from a list
  app.post("/api/lists/:id/clear-checked", async (req, res) => {
    const { id } = req.params;
    logListAccess("POST /api/lists/:id/clear-checked", req, id);
    
    if (!id || typeof id !== 'string' || id.length > 100) {
      return res.status(400).json({ message: "Invalid request" });
    }
    
    try {
      const existing = getCustomList(id);
      
      if (!existing) {
        return res.status(404).json({ message: "Not found" });
      }
      
      const count = clearCheckedCustomListItems(id);
      console.log(`[LIST ACCESS] Cleared ${count} checked items from list ${id}`);
      res.json({ success: true, deleted: count });
    } catch (error: any) {
      console.error("Clear checked items error:", error);
      res.status(500).json({ message: "Operation failed" });
    }
  });

  // === FOLDERS API ROUTES ===

  app.get("/api/folders", async (req, res) => {
    try {
      const folders = getAllFolders();
      res.json(folders);
    } catch (error: any) {
      console.error("Get folders error:", error);
      res.status(500).json({ message: "Failed to get folders" });
    }
  });

  app.get("/api/folders/tree", async (req, res) => {
    try {
      const tree = getFolderTree();
      res.json(tree);
    } catch (error: any) {
      console.error("Get folder tree error:", error);
      res.status(500).json({ message: "Failed to get folder tree" });
    }
  });

  app.get("/api/folders/:id", async (req, res) => {
    try {
      const folder = getFolder(req.params.id);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }
      res.json(folder);
    } catch (error: any) {
      console.error("Get folder error:", error);
      res.status(500).json({ message: "Failed to get folder" });
    }
  });

  app.post("/api/folders", async (req, res) => {
    try {
      const parsed = insertFolderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid folder data" });
      }
      const folder = createFolder(parsed.data);
      res.status(201).json(folder);
    } catch (error: any) {
      console.error("Create folder error:", error);
      res.status(500).json({ message: "Failed to create folder" });
    }
  });

  app.patch("/api/folders/:id", async (req, res) => {
    try {
      const existing = getFolder(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Folder not found" });
      }
      const parsed = updateFolderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid update data" });
      }
      const folder = updateFolder(req.params.id, parsed.data);
      res.json(folder);
    } catch (error: any) {
      console.error("Update folder error:", error);
      res.status(500).json({ message: "Failed to update folder" });
    }
  });

  app.delete("/api/folders/:id", async (req, res) => {
    try {
      const existing = getFolder(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Folder not found" });
      }
      deleteFolder(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete folder error:", error);
      res.status(500).json({ message: "Failed to delete folder" });
    }
  });

  // === DOCUMENTS API ROUTES ===

  app.get("/api/documents", async (req, res) => {
    try {
      const { folderId, search } = req.query;
      if (search && typeof search === "string") {
        const documents = searchDocuments(search);
        return res.json(documents);
      }
      if (folderId !== undefined) {
        const documents = getDocumentsByFolder(folderId === "null" ? null : folderId as string);
        return res.json(documents);
      }
      const documents = getAllDocuments();
      res.json(documents);
    } catch (error: any) {
      console.error("Get documents error:", error);
      res.status(500).json({ message: "Failed to get documents" });
    }
  });

  app.get("/api/documents/:id", async (req, res) => {
    try {
      const document = getDocumentWithFolder(req.params.id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      res.json(document);
    } catch (error: any) {
      console.error("Get document error:", error);
      res.status(500).json({ message: "Failed to get document" });
    }
  });

  app.post("/api/documents", async (req, res) => {
    try {
      const parsed = insertDocumentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid document data" });
      }
      const document = createDocument(parsed.data);
      res.status(201).json(document);
    } catch (error: any) {
      console.error("Create document error:", error);
      res.status(500).json({ message: "Failed to create document" });
    }
  });

  app.patch("/api/documents/:id", async (req, res) => {
    try {
      const existing = getDocument(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Document not found" });
      }
      const parsed = updateDocumentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid update data" });
      }
      const document = updateDocument(req.params.id, parsed.data);
      res.json(document);
    } catch (error: any) {
      console.error("Update document error:", error);
      res.status(500).json({ message: "Failed to update document" });
    }
  });

  app.delete("/api/documents/:id", async (req, res) => {
    try {
      const existing = getDocument(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Document not found" });
      }
      deleteDocument(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete document error:", error);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });
  
  // === TASKS API ROUTES ===
  
  // Get all tasks
  app.get("/api/tasks", async (req, res) => {
    try {
      const includeCompleted = req.query.includeCompleted === "true";
      const category = req.query.category as string | undefined;
      const dueToday = req.query.dueToday === "true";
      const overdue = req.query.overdue === "true";
      
      let tasks;
      if (dueToday) {
        tasks = getTasksDueToday();
      } else if (overdue) {
        tasks = getOverdueTasks();
      } else {
        tasks = getAllTasks(includeCompleted);
        if (category) {
          tasks = tasks.filter(t => t.category === category);
        }
      }
      
      res.json(tasks);
    } catch (error: any) {
      console.error("Get tasks error:", error);
      res.status(500).json({ message: "Failed to get tasks" });
    }
  });
  
  // Create task
  app.post("/api/tasks", async (req, res) => {
    try {
      const parsed = insertTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      
      const task = createTask(parsed.data);
      
      onTaskCreated(task).catch(err => {
        console.error("[Routes] Entity extraction for task failed:", err);
      });
      
      res.json(task);
    } catch (error: any) {
      console.error("Create task error:", error);
      res.status(500).json({ message: "Failed to create task" });
    }
  });
  
  // Get single task
  app.get("/api/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const task = getTask(id);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      res.json(task);
    } catch (error: any) {
      console.error("Get task error:", error);
      res.status(500).json({ message: "Failed to get task" });
    }
  });
  
  // Update task
  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = getTask(id);
      
      if (!existing) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      const parsed = updateTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      
      const task = updateTask(id, parsed.data);
      res.json(task);
    } catch (error: any) {
      console.error("Update task error:", error);
      res.status(500).json({ message: "Failed to update task" });
    }
  });
  
  // Toggle task completed status
  app.post("/api/tasks/:id/toggle", async (req, res) => {
    try {
      const { id } = req.params;
      const task = toggleTaskCompleted(id);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      res.json(task);
    } catch (error: any) {
      console.error("Toggle task error:", error);
      res.status(500).json({ message: "Failed to toggle task" });
    }
  });
  
  // Delete task
  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = getTask(id);
      
      if (!existing) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      deleteTask(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete task error:", error);
      res.status(500).json({ message: "Failed to delete task" });
    }
  });
  
  // Clear all completed tasks
  app.post("/api/tasks/clear-completed", async (_req, res) => {
    try {
      const count = clearCompletedTasks();
      res.json({ success: true, deleted: count });
    } catch (error: any) {
      console.error("Clear completed tasks error:", error);
      res.status(500).json({ message: "Failed to clear completed tasks" });
    }
  });
  
  // AI-powered task breakdown - analyze a task and create subtasks
  app.post("/api/tasks/:id/breakdown", async (req, res) => {
    try {
      const { id } = req.params;
      const task = getTask(id);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      // Check if task already has subtasks
      const existingSubtasks = getSubtasks(id);
      if (existingSubtasks.length > 0) {
        return res.status(400).json({ 
          message: `Task already has ${existingSubtasks.length} subtask(s). Delete them first to regenerate.`,
          existing_subtasks: existingSubtasks
        });
      }
      
      // Use AI to analyze and generate subtask suggestions
      const breakdown = await analyzeAndBreakdownTask(task);
      
      if (!breakdown.shouldBreakdown) {
        return res.json({
          success: true,
          breakdown_created: false,
          message: `Task doesn't need to be broken down: ${breakdown.reason}`,
          task
        });
      }
      
      // Create the subtasks
      const createdSubtasks = [];
      for (const suggestion of breakdown.subtasks) {
        const subtaskDueDate = calculateSubtaskDueDate(task.dueDate, suggestion.relativeDueDays);
        
        const subtask = createTask({
          title: suggestion.title,
          description: suggestion.description,
          priority: suggestion.priority,
          dueDate: subtaskDueDate,
          category: task.category,
          parentTaskId: task.id,
        });
        createdSubtasks.push(subtask);
        
        onTaskCreated(subtask).catch(err => {
          console.error("[Routes] Entity extraction for subtask failed:", err);
        });
      }
      
      res.json({
        success: true,
        breakdown_created: true,
        message: `Created ${createdSubtasks.length} subtask(s) for "${task.title}"`,
        reason: breakdown.reason,
        parent_task: task,
        subtasks: createdSubtasks
      });
    } catch (error: any) {
      console.error("Task breakdown error:", error);
      res.status(500).json({ message: "Failed to breakdown task", error: error.message });
    }
  });
  
  // Get subtasks for a task
  app.get("/api/tasks/:id/subtasks", async (req, res) => {
    try {
      const { id } = req.params;
      const task = getTask(id);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      const subtasks = getSubtasks(id);
      res.json({
        parent_task: task,
        subtasks,
        count: subtasks.length,
        completed: subtasks.filter(st => st.completed).length
      });
    } catch (error: any) {
      console.error("Get subtasks error:", error);
      res.status(500).json({ message: "Failed to get subtasks" });
    }
  });
  
  // Get task with all its subtasks in a hierarchical view
  app.get("/api/tasks/:id/with-subtasks", async (req, res) => {
    try {
      const { id } = req.params;
      const taskWithSubtasks = getTaskWithSubtasks(id);
      
      if (!taskWithSubtasks) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      res.json(taskWithSubtasks);
    } catch (error: any) {
      console.error("Get task with subtasks error:", error);
      res.status(500).json({ message: "Failed to get task with subtasks" });
    }
  });
  
  // Preview task follow-up message (what would be sent)
  app.post("/api/tasks/followup/preview", async (_req, res) => {
    try {
      const overdue = getOverdueTasks();
      const today = getTasksDueToday();
      const tomorrow = getTasksDueTomorrow();
      
      const followUp = await generateTaskFollowUp(overdue, today, tomorrow);
      
      res.json({
        success: true,
        preview: followUp,
        taskCounts: {
          overdue: overdue.length,
          today: today.length,
          tomorrow: tomorrow.length,
          total: overdue.length + today.length + tomorrow.length,
        },
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Task follow-up preview error:", error);
      res.status(500).json({ message: "Failed to generate preview", error: error.message });
    }
  });

  // ==================== PREDICTIVE TASK SCHEDULING API ====================
  
  // Get task scheduling patterns analysis
  app.get("/api/tasks/scheduling/patterns", async (_req, res) => {
    try {
      const patterns = await analyzeTaskPatterns();
      res.json({
        success: true,
        ...patterns,
      });
    } catch (error: any) {
      console.error("Task pattern analysis error:", error?.message || "Unknown error");
      res.status(500).json({ success: false, message: "Failed to analyze patterns" });
    }
  });

  // Get AI-powered scheduling suggestion for a new task
  app.post("/api/tasks/scheduling/suggest", async (req, res) => {
    try {
      const { title, category, priority, description } = req.body;
      
      if (!title || typeof title !== "string" || title.trim().length === 0) {
        return res.status(400).json({ success: false, message: "Task title is required" });
      }
      
      const suggestion = await getSchedulingSuggestion(
        title.trim(),
        category || "personal",
        priority || "medium",
        description
      );
      
      res.json({
        success: true,
        suggestion,
      });
    } catch (error: any) {
      console.error("Scheduling suggestion error:", error?.message || "Unknown error");
      res.status(500).json({ success: false, message: "Failed to get suggestion" });
    }
  });

  // Get quick scheduling options based on patterns
  app.post("/api/tasks/scheduling/quick-options", async (req, res) => {
    try {
      const { title, category, priority } = req.body;
      
      const suggestions = await getQuickSchedulingSuggestions(
        title && typeof title === "string" && title.trim().length > 0 ? title.trim() : "Task",
        category || "personal",
        priority || "medium"
      );
      
      res.json({
        success: true,
        suggestions,
      });
    } catch (error: any) {
      console.error("Quick scheduling options error:", error?.message || "Unknown error");
      res.status(500).json({ success: false, message: "Failed to get options", suggestions: [] });
    }
  });

  // Get pattern insights and recommendations
  app.get("/api/tasks/scheduling/insights", async (_req, res) => {
    try {
      const insights = await getPatternInsights();
      res.json({
        success: true,
        ...insights,
      });
    } catch (error: any) {
      console.error("Pattern insights error:", error?.message || "Unknown error");
      res.status(500).json({ 
        success: false, 
        message: "Failed to get insights",
        patterns: { patterns: [], insights: [], preferredDays: [], preferredHours: [], categoryBreakdown: {}, priorityBreakdown: {} },
        recommendations: []
      });
    }
  });
  
  // ==================== CONTACTS API ====================
  
  // Search contacts by name
  app.get("/api/contacts/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.length < 1) {
        return res.json([]);
      }
      const contacts = searchContacts(query);
      res.json(contacts);
    } catch (error: any) {
      console.error("Search contacts error:", error);
      res.status(500).json({ message: "Failed to search contacts" });
    }
  });
  
  // Get all contacts
  app.get("/api/contacts", async (_req, res) => {
    try {
      const contacts = getAllContacts();
      // Enhance with message counts
      const contactsWithStats = contacts.map(contact => ({
        ...contact,
        messageCount: getMessageCountForPhone(contact.phoneNumber),
        conversations: getConversationsByPhone(contact.phoneNumber),
      }));
      res.json(contactsWithStats);
    } catch (error: any) {
      console.error("Get contacts error:", error);
      res.status(500).json({ message: "Failed to get contacts" });
    }
  });
  
  // Get single contact by ID
  app.get("/api/contacts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const contact = getContact(id);
      
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      // Enhance with conversations and message count
      const enhanced = {
        ...contact,
        messageCount: getMessageCountForPhone(contact.phoneNumber),
        conversations: getConversationsByPhone(contact.phoneNumber),
      };
      
      res.json(enhanced);
    } catch (error: any) {
      console.error("Get contact error:", error);
      res.status(500).json({ message: "Failed to get contact" });
    }
  });
  
  // Get contact by phone number
  app.get("/api/contacts/phone/:phone", async (req, res) => {
    try {
      const { phone } = req.params;
      const contact = getContactByPhone(phone);
      
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      // Enhance with conversations and message count
      const enhanced = {
        ...contact,
        messageCount: getMessageCountForPhone(contact.phoneNumber),
        conversations: getConversationsByPhone(contact.phoneNumber),
      };
      
      res.json(enhanced);
    } catch (error: any) {
      console.error("Get contact by phone error:", error);
      res.status(500).json({ message: "Failed to get contact" });
    }
  });
  
  // Create new contact
  app.post("/api/contacts", async (req, res) => {
    try {
      const parsed = insertContactSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      
      // Check if phone number already exists
      const existing = getContactByPhone(parsed.data.phoneNumber);
      if (existing) {
        return res.status(409).json({ message: "Contact with this phone number already exists" });
      }
      
      const contact = createContact(parsed.data);
      res.json(contact);
    } catch (error: any) {
      console.error("Create contact error:", error);
      res.status(500).json({ message: "Failed to create contact" });
    }
  });
  
  // Update contact
  app.patch("/api/contacts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = getContact(id);
      
      if (!existing) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      const parsed = updateContactSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      
      // If updating phone number, check for duplicates
      if (parsed.data.phoneNumber) {
        const phoneConflict = getContactByPhone(parsed.data.phoneNumber);
        if (phoneConflict && phoneConflict.id !== id) {
          return res.status(409).json({ message: "Another contact with this phone number already exists" });
        }
      }
      
      const contact = updateContact(id, parsed.data);
      res.json(contact);
    } catch (error: any) {
      console.error("Update contact error:", error);
      res.status(500).json({ message: "Failed to update contact" });
    }
  });
  
  // Delete contact
  app.delete("/api/contacts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = getContact(id);
      
      if (!existing) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      // Prevent deleting master admin
      if (isMasterAdmin(existing.phoneNumber)) {
        return res.status(403).json({ message: "Cannot delete master admin contact" });
      }
      
      deleteContact(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete contact error:", error);
      res.status(500).json({ message: "Failed to delete contact" });
    }
  });
  
  // Get conversations for a contact
  app.get("/api/contacts/:id/conversations", async (req, res) => {
    try {
      const { id } = req.params;
      const contact = getContact(id);
      
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      const conversations = getConversationsByPhone(contact.phoneNumber);
      res.json(conversations);
    } catch (error: any) {
      console.error("Get contact conversations error:", error);
      res.status(500).json({ message: "Failed to get conversations" });
    }
  });
  
  // Get notes for a contact
  app.get("/api/contacts/:id/notes", async (req, res) => {
    try {
      const { id } = req.params;
      const contact = getContact(id);
      
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      const noteType = req.query.type as string | undefined;
      const notes = noteType 
        ? getContactNotesByType(id, noteType as any)
        : getContactNotes(id);
      res.json(notes);
    } catch (error: any) {
      console.error("Get contact notes error:", error);
      res.status(500).json({ message: "Failed to get contact notes" });
    }
  });
  
  // Create a note for a contact
  app.post("/api/contacts/:id/notes", async (req, res) => {
    try {
      const { id } = req.params;
      const contact = getContact(id);
      
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      const parsed = insertContactNoteSchema.safeParse({
        ...req.body,
        contactId: id
      });
      
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      
      const note = createContactNote(parsed.data);
      res.json(note);
    } catch (error: any) {
      console.error("Create contact note error:", error);
      res.status(500).json({ message: "Failed to create contact note" });
    }
  });
  
  // Delete a specific note
  app.delete("/api/contacts/:id/notes/:noteId", async (req, res) => {
    try {
      const { id, noteId } = req.params;
      const contact = getContact(id);
      
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      const deleted = deleteContactNote(noteId);
      if (!deleted) {
        return res.status(404).json({ message: "Note not found" });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete contact note error:", error);
      res.status(500).json({ message: "Failed to delete contact note" });
    }
  });
  
  // Delete all notes for a contact
  app.delete("/api/contacts/:id/notes", async (req, res) => {
    try {
      const { id } = req.params;
      const contact = getContact(id);
      
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      const deletedCount = deleteAllContactNotes(id);
      res.json({ success: true, deletedCount });
    } catch (error: any) {
      console.error("Delete all contact notes error:", error);
      res.status(500).json({ message: "Failed to delete contact notes" });
    }
  });
  
  // ==================== REMINDERS API ====================
  
  // Get all reminders (both pending and completed)
  app.get("/api/reminders", async (_req, res) => {
    try {
      const reminders = getAllReminders();
      res.json(reminders);
    } catch (error: any) {
      console.error("Get reminders error:", error);
      res.status(500).json({ message: "Failed to get reminders" });
    }
  });
  
  // Update reminder
  app.patch("/api/reminders/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = getReminder(id);
      
      if (!existing) {
        return res.status(404).json({ message: "Reminder not found" });
      }
      
      const parsed = updateReminderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      
      const reminder = updateReminder(id, parsed.data);
      res.json(reminder);
    } catch (error: any) {
      console.error("Update reminder error:", error);
      res.status(500).json({ message: "Failed to update reminder" });
    }
  });
  
  // Delete reminder
  app.delete("/api/reminders/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = getReminder(id);
      
      if (!existing) {
        return res.status(404).json({ message: "Reminder not found" });
      }
      
      deleteReminder(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete reminder error:", error);
      res.status(500).json({ message: "Failed to delete reminder" });
    }
  });

  // Create reminder sequence
  const reminderSequenceSchema = z.object({
    message: z.string().min(1, "Message is required"),
    event_time: z.string().refine((val) => !isNaN(new Date(val).getTime()), {
      message: "Invalid event_time format. Use ISO 8601 format (e.g., '2024-12-25T14:00:00')"
    }),
    intervals: z.array(z.string()).min(1, "At least one interval is required"),
    recipient_phone: z.string().optional(),
  });

  app.post("/api/reminders/sequence", async (req, res) => {
    try {
      const parsed = reminderSequenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid request body", 
          errors: parsed.error.errors 
        });
      }

      const { message, event_time, intervals, recipient_phone } = parsed.data;
      const eventTime = new Date(event_time);

      const sequenceResult = createReminderSequenceData(eventTime, message, intervals);

      if (!sequenceResult.success) {
        return res.status(400).json({
          success: false,
          message: sequenceResult.error,
        });
      }

      const createdReminders = [];
      const total = sequenceResult.items.length;
      let parentReminderId: string | null = null;

      for (const item of sequenceResult.items) {
        const reminder = dbCreateReminder({
          message: item.message,
          recipientPhone: recipient_phone || null,
          conversationId: null,
          scheduledFor: item.scheduledFor.toISOString(),
          completed: false,
          parentReminderId: parentReminderId,
          sequencePosition: item.sequencePosition,
          sequenceTotal: total,
        });

        if (!parentReminderId) {
          parentReminderId = reminder.id;
        }

        scheduleReminderExecution(reminder.id, item.scheduledFor);
        createdReminders.push(reminder);
      }

      const eventTimeStr = eventTime.toLocaleString("en-US", { 
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        weekday: "short",
        month: "short",
        day: "numeric"
      });

      res.json({
        success: true,
        parent_reminder_id: parentReminderId,
        event_time: eventTime.toISOString(),
        event_time_formatted: eventTimeStr,
        reminders_created: createdReminders.length,
        reminders: createdReminders.map(r => ({
          id: r.id,
          message: r.message,
          scheduled_for: r.scheduledFor,
          scheduled_for_formatted: new Date(r.scheduledFor).toLocaleString("en-US", {
            timeZone: "America/New_York",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            weekday: "short",
            month: "short",
            day: "numeric"
          }),
          sequence_position: r.sequencePosition,
          sequence_total: r.sequenceTotal,
        })),
        message: `Created ${createdReminders.length} reminder(s) for "${message}". Event is at ${eventTimeStr}.`,
      });
    } catch (error: any) {
      console.error("Create reminder sequence error:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to create reminder sequence" 
      });
    }
  });

  // Get reminder sequence by parent ID
  app.get("/api/reminders/sequence/:parentId", async (req, res) => {
    try {
      const { parentId } = req.params;
      const sequence = getReminderSequence(parentId);
      
      if (sequence.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: "Reminder sequence not found" 
        });
      }

      res.json({
        success: true,
        parent_reminder_id: parentId,
        reminders: sequence.map(r => ({
          id: r.id,
          message: r.message,
          scheduled_for: r.scheduledFor,
          scheduled_for_formatted: new Date(r.scheduledFor).toLocaleString("en-US", {
            timeZone: "America/New_York",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            weekday: "short",
            month: "short",
            day: "numeric"
          }),
          completed: r.completed,
          sequence_position: r.sequencePosition,
          sequence_total: r.sequenceTotal,
        })),
      });
    } catch (error: any) {
      console.error("Get reminder sequence error:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to get reminder sequence" 
      });
    }
  });
  
  // ==================== AUTOMATIONS API ====================
  // SECURITY NOTE: Web UI automation endpoints are trusted with admin permissions by design.
  // All operations are logged for security audit trail.
  
  // Get all automations
  app.get("/api/automations", async (_req, res) => {
    try {
      const automations = getAllAutomations();
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Listed ${automations.length} automations`);
      res.json(automations);
    } catch (error: any) {
      console.error("Get automations error:", error);
      res.status(500).json({ message: "Failed to get automations" });
    }
  });
  
  // Create automation
  app.post("/api/automations", async (req, res) => {
    try {
      const parsed = insertAutomationSchema.safeParse(req.body);
      if (!parsed.success) {
        console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Failed to create automation - invalid request body`);
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      
      const automation = createAutomation(parsed.data);
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Created automation "${automation.name}" (${automation.id}) - Type: ${automation.type}, Enabled: ${automation.enabled}, Recipient: ${automation.recipientPhone || "N/A"}`);
      
      // Schedule the new automation if enabled
      if (automation.enabled) {
        scheduleAutomation(automation);
      }
      
      res.json(automation);
    } catch (error: any) {
      console.error("Create automation error:", error);
      res.status(500).json({ message: "Failed to create automation" });
    }
  });
  
  // Get or create task follow-up automation (MUST be before generic /:id route)
  app.get("/api/automations/task-followup", async (_req, res) => {
    try {
      const automations = getAllAutomations();
      let taskFollowup = automations.find(a => a.type === "task_followup");
      
      if (!taskFollowup) {
        taskFollowup = createAutomation({
          name: "Daily Task Follow-up",
          type: "task_followup",
          cronExpression: "0 8 * * *",
          enabled: false,
          recipientPhone: null,
          message: null,
          settings: JSON.stringify({ sendEvenIfEmpty: false }),
        });
        console.log(`[AUDIT] [${new Date().toISOString()}] Created default task follow-up automation`);
      }
      
      const overdue = getOverdueTasks();
      const today = getTasksDueToday();
      const tomorrow = getTasksDueTomorrow();
      
      res.json({
        automation: taskFollowup,
        taskSummary: {
          overdue: overdue.length,
          today: today.length,
          tomorrow: tomorrow.length,
          total: overdue.length + today.length + tomorrow.length,
        },
      });
    } catch (error: any) {
      console.error("Get task follow-up automation error:", error);
      res.status(500).json({ message: "Failed to get task follow-up automation" });
    }
  });
  
  // Update task follow-up automation settings (MUST be before generic /:id route)
  app.patch("/api/automations/task-followup", async (req, res) => {
    try {
      const automations = getAllAutomations();
      let taskFollowup = automations.find(a => a.type === "task_followup");
      
      if (!taskFollowup) {
        taskFollowup = createAutomation({
          name: "Daily Task Follow-up",
          type: "task_followup",
          cronExpression: "0 8 * * *",
          enabled: false,
          recipientPhone: null,
          message: null,
          settings: JSON.stringify({ sendEvenIfEmpty: false }),
        });
      }
      
      const updateSchema = z.object({
        enabled: z.boolean().optional(),
        cronExpression: z.string().optional(),
        settings: z.string().optional(),
      });
      
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      
      const updated = updateAutomation(taskFollowup.id, parsed.data);
      
      if (updated) {
        scheduleAutomation(updated);
        console.log(`[AUDIT] [${new Date().toISOString()}] Updated task follow-up automation: ${JSON.stringify(parsed.data)}`);
      }
      
      res.json({ automation: updated });
    } catch (error: any) {
      console.error("Update task follow-up automation error:", error);
      res.status(500).json({ message: "Failed to update task follow-up automation" });
    }
  });
  
  // Update automation (generic route - must come after specific routes)
  app.patch("/api/automations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = getAutomation(id);
      
      if (!existing) {
        console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Failed to update automation ${id} - not found`);
        return res.status(404).json({ message: "Automation not found" });
      }
      
      const parsed = updateAutomationSchema.safeParse(req.body);
      if (!parsed.success) {
        console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Failed to update automation ${id} - invalid request body`);
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      
      const automation = updateAutomation(id, parsed.data);
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Updated automation "${existing.name}" (${id}) - Changes: ${JSON.stringify(parsed.data)}`);
      
      // Reschedule the automation (handles enable/disable and cron changes)
      if (automation) {
        scheduleAutomation(automation);
      }
      
      res.json(automation);
    } catch (error: any) {
      console.error("Update automation error:", error);
      res.status(500).json({ message: "Failed to update automation" });
    }
  });
  
  // Delete automation
  app.delete("/api/automations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = getAutomation(id);
      
      if (!existing) {
        console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Failed to delete automation ${id} - not found`);
        return res.status(404).json({ message: "Automation not found" });
      }
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Deleting automation "${existing.name}" (${id}) - Type: ${existing.type}, Recipient: ${existing.recipientPhone || "N/A"}`);
      
      // Stop the scheduled task before deleting
      stopAutomation(id);
      
      deleteAutomation(id);
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Automation ${id} deleted successfully`);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete automation error:", error);
      res.status(500).json({ message: "Failed to delete automation" });
    }
  });
  
  // Toggle automation enabled/disabled status
  app.post("/api/automations/:id/toggle", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = getAutomation(id);
      
      if (!existing) {
        console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Failed to toggle automation ${id} - not found`);
        return res.status(404).json({ message: "Automation not found" });
      }
      
      const newState = !existing.enabled;
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Toggling automation "${existing.name}" (${id}) - ${existing.enabled ? "DISABLING" : "ENABLING"}`);
      
      const automation = updateAutomation(id, { enabled: newState });
      
      // Update the schedule based on new enabled state
      if (automation) {
        scheduleAutomation(automation);
        console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Automation ${id} is now ${newState ? "ENABLED" : "DISABLED"}`);
      }
      
      res.json(automation);
    } catch (error: any) {
      console.error("Toggle automation error:", error);
      res.status(500).json({ message: "Failed to toggle automation" });
    }
  });
  
  // Manually trigger an automation (for testing)
  app.post("/api/automations/:id/run", async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Manual trigger requested for automation ${id}`);
      
      const result = await runAutomationNow(id);
      
      if (!result.automation) {
        console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Manual trigger failed - automation ${id} not found`);
        return res.status(404).json({ message: "Automation not found" });
      }
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Manual trigger completed for "${result.automation.name}" (${id}) - Success: ${result.success}, Message: ${result.message}`);
      res.json(result);
    } catch (error: any) {
      console.error("Run automation error:", error);
      res.status(500).json({ message: "Failed to run automation" });
    }
  });
  
  // ============================================
  // Profile Endpoints
  // ============================================
  
  // Get all profile sections
  app.get("/api/profile", async (req, res) => {
    try {
      const sections = getAllProfileSections();
      const profile: Record<string, unknown> = {};
      
      // Helper to convert snake_case to camelCase
      const toCamelCase = (str: string) => str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      
      // Keys that should never be set on objects to prevent prototype pollution
      const dangerousKeys = new Set(['__proto__', 'constructor', 'prototype']);
      
      for (const section of sections) {
        // Convert section key from snake_case (basic_info) to camelCase (basicInfo)
        const camelKey = toCamelCase(section.section);
        
        // Skip dangerous keys to prevent prototype pollution
        if (dangerousKeys.has(camelKey)) {
          continue;
        }
        
        try {
          profile[camelKey] = JSON.parse(section.data);
        } catch {
          profile[camelKey] = section.data;
        }
      }
      
      res.json(profile);
    } catch (error: any) {
      console.error("Get profile error:", error);
      res.status(500).json({ message: "Failed to get profile" });
    }
  });
  
  // Get a specific profile section
  app.get("/api/profile/:section", async (req, res) => {
    try {
      const { section } = req.params;
      const profileSection = getProfileSection(section);
      
      if (!profileSection) {
        return res.json({ section, data: {} });
      }
      
      try {
        res.json({ section, data: JSON.parse(profileSection.data), updatedAt: profileSection.updatedAt });
      } catch {
        res.json({ section, data: profileSection.data, updatedAt: profileSection.updatedAt });
      }
    } catch (error: any) {
      console.error("Get profile section error:", error);
      res.status(500).json({ message: "Failed to get profile section" });
    }
  });
  
  // Update a profile section
  app.put("/api/profile/:section", async (req, res) => {
    try {
      const { section } = req.params;
      const { data } = req.body;
      
      if (data === undefined) {
        return res.status(400).json({ message: "Data is required" });
      }
      
      const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
      const result = upsertProfileSection(section, dataStr);
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Updated profile section "${section}"`);
      
      res.json({ 
        section: result.section, 
        data: typeof data === 'string' ? data : data,
        updatedAt: result.updatedAt 
      });
    } catch (error: any) {
      console.error("Update profile section error:", error);
      res.status(500).json({ message: "Failed to update profile section" });
    }
  });
  
  // Delete a profile section
  app.delete("/api/profile/:section", async (req, res) => {
    try {
      const { section } = req.params;
      const success = deleteProfileSection(section);
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Deleted profile section "${section}" - Success: ${success}`);
      
      res.json({ success });
    } catch (error: any) {
      console.error("Delete profile section error:", error);
      res.status(500).json({ message: "Failed to delete profile section" });
    }
  });
  
  // === TWILIO MESSAGE LOG API ROUTES ===
  
  // Get all Twilio messages (with optional limit)
  app.get("/api/twilio/messages", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const messages = getAllTwilioMessages(limit);
      res.json(messages);
    } catch (error: any) {
      console.error("Get twilio messages error:", error);
      res.status(500).json({ message: "Failed to get Twilio messages" });
    }
  });
  
  // Get Twilio messages by phone number
  app.get("/api/twilio/messages/phone/:phone", async (req, res) => {
    try {
      const { phone } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const messages = getTwilioMessagesByPhone(phone, limit);
      res.json(messages);
    } catch (error: any) {
      console.error("Get twilio messages by phone error:", error);
      res.status(500).json({ message: "Failed to get Twilio messages" });
    }
  });
  
  // Get Twilio message stats
  app.get("/api/twilio/stats", async (_req, res) => {
    try {
      const stats = getTwilioMessageStats();
      res.json(stats);
    } catch (error: any) {
      console.error("Get twilio stats error:", error);
      res.status(500).json({ message: "Failed to get Twilio stats" });
    }
  });
  
  // Get unique conversation phone numbers (for sidebar)
  app.get("/api/twilio/conversations", async (_req, res) => {
    try {
      const conversations = getTwilioConversationPhones();
      res.json(conversations);
    } catch (error: any) {
      console.error("Get twilio conversations error:", error);
      res.status(500).json({ message: "Failed to get Twilio conversations" });
    }
  });
  
  // ==================== CALENDAR API ====================
  
  // Get list of all calendars (for toggle UI)
  app.get("/api/calendar/list", async (_req, res) => {
    try {
      const calendars = await listCalendars();
      res.json(calendars);
    } catch (error: any) {
      console.error("Calendar list error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch calendars" });
    }
  });
  
  // Get calendar events with optional date range and calendar filtering
  app.get("/api/calendar/events", async (req, res) => {
    try {
      const { start, end, days, calendars } = req.query;
      
      const calendarIds = calendars 
        ? (calendars as string).split(',').filter(Boolean) 
        : undefined;
      
      let result;
      if (start && end) {
        result = await listCalendarEvents(new Date(start as string), new Date(end as string), 100, calendarIds);
      } else if (days) {
        const events = await getUpcomingEvents(parseInt(days as string));
        result = { events, failedCalendars: [] };
      } else {
        const events = await getUpcomingEvents(7);
        result = { events, failedCalendars: [] };
      }
      
      res.json(result);
    } catch (error: any) {
      console.error("Calendar fetch error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch calendar events" });
    }
  });
  
  // Get today's events
  app.get("/api/calendar/today", async (req, res) => {
    try {
      const events = await getTodaysEvents();
      res.json(events);
    } catch (error: any) {
      console.error("Calendar today fetch error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch today's events" });
    }
  });
  
  // Create a new calendar event
  app.post("/api/calendar/events", async (req, res) => {
    try {
      const { summary, startTime, endTime, description, location, allDay } = req.body;
      const event = await createCalendarEvent(
        summary,
        new Date(startTime),
        new Date(endTime),
        description,
        location,
        allDay
      );
      res.json(event);
    } catch (error: any) {
      console.error("Calendar create error:", error);
      res.status(500).json({ error: error.message || "Failed to create calendar event" });
    }
  });
  
  // Delete a calendar event
  app.delete("/api/calendar/events/:id", async (req, res) => {
    try {
      const calendarId = req.query.calendarId as string || 'primary';
      await deleteCalendarEvent(req.params.id, calendarId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Calendar delete error:", error);
      res.status(500).json({ error: error.message || "Failed to delete calendar event" });
    }
  });

  // Update a calendar event
  app.put("/api/calendar/events/:id", async (req, res) => {
    try {
      const { summary, startTime, endTime, description, location, calendarId } = req.body;
      const updates: {
        summary?: string;
        description?: string;
        location?: string;
        startTime?: Date;
        endTime?: Date;
      } = {};
      
      if (summary) updates.summary = summary;
      if (description !== undefined) updates.description = description;
      if (location !== undefined) updates.location = location;
      if (startTime) updates.startTime = new Date(startTime);
      if (endTime) updates.endTime = new Date(endTime);
      
      const event = await updateCalendarEvent(req.params.id, updates, calendarId || 'primary');
      res.json(event);
    } catch (error: any) {
      console.error("Calendar update error:", error);
      res.status(500).json({ error: error.message || "Failed to update calendar event" });
    }
  });

  // ============================================
  // INTERNAL API BRIDGE FOR PYTHON AGENTS
  // ============================================
  
  // Internal API key authentication middleware
  const requireInternalApiKey = (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers["x-internal-api-key"] as string;
    const expectedKey = process.env.INTERNAL_BRIDGE_KEY;
    
    if (!expectedKey) {
      console.warn("INTERNAL_BRIDGE_KEY not configured - internal API endpoints disabled");
      return res.status(503).json({ 
        success: false, 
        error: "Internal API bridge not configured" 
      });
    }
    
    if (!apiKey || apiKey !== expectedKey) {
      return res.status(401).json({ 
        success: false, 
        error: "Invalid or missing API key" 
      });
    }
    
    next();
  };

  // Capability module mapping with descriptions
  const capabilityModules: Record<string, { tools: string[]; description: string }> = {
    communication: {
      tools: communicationToolNames,
      description: "SMS messaging and daily check-in tools for communication with users"
    },
    reminders: {
      tools: reminderToolNames,
      description: "Schedule and manage reminders with time-based notifications"
    },
    tasks: {
      tools: taskToolNames,
      description: "Create, update, and manage to-do items and task lists"
    },
    calendar: {
      tools: calendarToolNames,
      description: "Google Calendar integration for events and scheduling"
    },
    grocery: {
      tools: groceryToolNames,
      description: "Manage grocery shopping lists and items"
    },
    search: {
      tools: searchToolNames,
      description: "Web search and information retrieval capabilities"
    },
    files: {
      tools: fileToolNames,
      description: "File system operations for notes and documents"
    },
    memory: {
      tools: memoryToolNames,
      description: "Access to Omi pendant lifelogs and conversation memory"
    },
    utilities: {
      tools: utilityToolNames,
      description: "Utility functions like weather, time, and system operations"
    }
  };

  // Helper to get capability for a tool name
  function getToolCapability(toolName: string): string[] {
    const capabilities: string[] = [];
    for (const [capability, info] of Object.entries(capabilityModules)) {
      if (info.tools.includes(toolName)) {
        capabilities.push(capability);
      }
    }
    return capabilities;
  }

  // POST /api/tools/execute - Execute a specific tool
  app.post("/api/tools/execute", requireInternalApiKey, async (req, res) => {
    try {
      const { tool_name, arguments: toolArgs, context } = req.body;
      
      if (!tool_name || typeof tool_name !== "string") {
        return res.status(400).json({
          success: false,
          error: "tool_name is required and must be a string"
        });
      }
      
      if (!toolArgs || typeof toolArgs !== "object") {
        return res.status(400).json({
          success: false,
          error: "arguments is required and must be an object"
        });
      }
      
      // Build permissions from context
      const permissions: ToolPermissions = context?.permissions || {
        isAdmin: true,
        canAccessPersonalInfo: true,
        canAccessCalendar: true,
        canAccessTasks: true,
        canAccessGrocery: true,
        canSetReminders: true,
      };
      
      // Execute the tool
      const resultStr = await executeTool(
        tool_name,
        toolArgs,
        undefined, // conversationId - not needed for Python agent calls
        permissions
      );
      
      // Parse the result
      let result: unknown;
      try {
        result = JSON.parse(resultStr);
      } catch {
        result = resultStr;
      }
      
      res.json({
        success: true,
        result
      });
    } catch (error: any) {
      console.error("Tool execution error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to execute tool"
      });
    }
  });

  // GET /api/tools/catalog - Get available tools catalog
  app.get("/api/tools/catalog", requireInternalApiKey, (req, res) => {
    try {
      const tools = toolDefinitions.map((tool) => {
        if (tool.type !== 'function' || !('function' in tool)) {
          return null;
        }
        const func = (tool as { type: 'function'; function: { name: string; description?: string; parameters?: unknown } }).function;
        const toolName = func.name;
        const capabilities = getToolCapability(toolName);
        
        // Get permission info
        const permissionCheck = TOOL_PERMISSIONS[toolName];
        const permissionInfo: Record<string, boolean> = {};
        
        if (permissionCheck) {
          // Check which permission flags affect this tool
          const testPermissions: ToolPermissions = {
            isAdmin: false,
            canAccessPersonalInfo: false,
            canAccessCalendar: false,
            canAccessTasks: false,
            canAccessGrocery: false,
            canSetReminders: false,
            canQueryMemory: false,
          };
          
          // Test each permission flag
          for (const key of Object.keys(testPermissions) as Array<keyof ToolPermissions>) {
            const withPermission = { ...testPermissions, [key]: true };
            permissionInfo[key] = permissionCheck(withPermission);
          }
        }
        
        return {
          name: toolName,
          description: func.description || "",
          parameters: func.parameters || {},
          capabilities,
          permissions: permissionInfo
        };
      });
      
      res.json({ tools: tools.filter(Boolean) });
    } catch (error: any) {
      console.error("Catalog fetch error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch tools catalog" });
    }
  });

  // GET /api/tools/capabilities - Get capability groups
  app.get("/api/tools/capabilities", requireInternalApiKey, (req, res) => {
    try {
      res.json({ capabilities: capabilityModules });
    } catch (error: any) {
      console.error("Capabilities fetch error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch capabilities" });
    }
  });

  // POST /api/memory/context - Get smart memory context
  app.post("/api/memory/context", requireInternalApiKey, async (req, res) => {
    try {
      const { query, limit } = req.body;
      
      if (!query || typeof query !== "string") {
        return res.status(400).json({
          success: false,
          error: "query is required and must be a string"
        });
      }
      
      // Get smart memory context
      const context = await getSmartMemoryContext(query);
      
      // Also get the relevant memories for structured data
      const relevantMemories = await semanticSearch(query, {
        limit: limit || 10,
        minScore: 0.3
      });
      
      const memories = relevantMemories.map(({ item, score, relevanceScore }) => ({
        id: item.id,
        type: item.type,
        content: item.content,
        context: item.context,
        score: relevanceScore || score,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }));
      
      res.json({
        context,
        memories,
        total_found: memories.length
      });
    } catch (error: any) {
      console.error("Memory context error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to get memory context"
      });
    }
  });

  // GET /api/user/profile - Get user profile context for personalization
  app.get("/api/user/profile", requireInternalApiKey, (req, res) => {
    try {
      const profile = getFullProfile();
      const preferences = getAllPreferences();
      
      // Convert preferences array to object
      const preferencesObj: Record<string, string> = {};
      for (const pref of preferences) {
        preferencesObj[pref.key] = pref.value;
      }
      
      res.json({
        profile,
        preferences: preferencesObj
      });
    } catch (error: any) {
      console.error("Profile fetch error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch user profile" });
    }
  });

  // POST /api/bridge/context-bundle - Get a curated context bundle for Python agents
  // Note: ZEKE is a single-user system for Nate Johnson, so userId is always "nate"
  app.post("/api/bridge/context-bundle", requireInternalApiKey, async (req, res) => {
    try {
      const { domain, query, route, conversationId } = req.body;
      
      if (!domain || typeof domain !== "string") {
        return res.status(400).json({
          success: false,
          error: "domain is required and must be a string"
        });
      }
      
      const validDomains = [
        "global", "memory", "tasks", "calendar", "grocery",
        "locations", "omi", "contacts", "profile", "conversation"
      ];
      
      if (!validDomains.includes(domain)) {
        return res.status(400).json({
          success: false,
          error: `Invalid domain. Must be one of: ${validDomains.join(", ")}`
        });
      }
      
      // ZEKE is a single-user system for Nate Johnson
      const ctx: AppContext = {
        userId: "nate",
        currentRoute: route || "/chat",
        userMessage: query || "",
        conversationId: conversationId,
        isAdmin: true,
        now: new Date(),
        timezone: "America/New_York",
      };
      
      let bundle: ContextBundle;
      
      // Use appropriate token budgets per domain type
      switch (domain) {
        case "global":
          // Global bundle uses its dedicated budget
          bundle = await buildGlobalBundle(ctx);
          break;
        case "memory":
          bundle = await buildMemoryBundle(ctx, DEFAULT_TOKEN_BUDGET.primary);
          break;
        case "tasks":
          bundle = await buildTasksBundle(ctx, DEFAULT_TOKEN_BUDGET.primary);
          break;
        case "calendar":
          bundle = await buildCalendarBundle(ctx, DEFAULT_TOKEN_BUDGET.primary);
          break;
        case "grocery":
          bundle = await buildGroceryBundle(ctx, DEFAULT_TOKEN_BUDGET.secondary);
          break;
        case "locations":
          bundle = await buildLocationsBundle(ctx, DEFAULT_TOKEN_BUDGET.tertiary);
          break;
        case "omi":
          bundle = await buildOmiBundle(ctx, DEFAULT_TOKEN_BUDGET.primary);
          break;
        case "contacts":
          bundle = await buildContactsBundle(ctx, DEFAULT_TOKEN_BUDGET.secondary);
          break;
        case "profile":
          bundle = await buildProfileBundle(ctx, DEFAULT_TOKEN_BUDGET.secondary);
          break;
        case "conversation":
          bundle = await buildConversationBundle(ctx, DEFAULT_TOKEN_BUDGET.primary);
          break;
        default:
          bundle = await buildGlobalBundle(ctx);
      }
      
      res.json({
        success: true,
        bundle: {
          name: bundle.name,
          priority: bundle.priority,
          content: bundle.content,
          tokenEstimate: bundle.tokenEstimate,
        }
      });
    } catch (error: any) {
      console.error("Context bundle error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to build context bundle"
      });
    }
  });

  // ============================================
  // LOCATION INTELLIGENCE API ENDPOINTS
  // ============================================

  // === Location Settings ===
  
  // GET /api/location/settings - Get current location settings
  app.get("/api/location/settings", (req, res) => {
    try {
      const settings = getLocationSettings();
      res.json(settings || {
        trackingEnabled: false,
        trackingIntervalMinutes: 15,
        proximityAlertsEnabled: true,
        defaultProximityRadiusMeters: 200,
        retentionDays: 30
      });
    } catch (error: any) {
      console.error("Location settings fetch error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch location settings" });
    }
  });

  // PATCH /api/location/settings - Update location settings
  app.patch("/api/location/settings", (req, res) => {
    try {
      const updated = updateLocationSettings(req.body);
      if (!updated) {
        return res.status(404).json({ error: "Location settings not found" });
      }
      res.json(updated);
    } catch (error: any) {
      console.error("Location settings update error:", error);
      res.status(500).json({ error: error.message || "Failed to update location settings" });
    }
  });

  // === Location History ===
  
  // POST /api/location/history - Record a new location
  app.post("/api/location/history", (req, res) => {
    try {
      const { latitude, longitude, accuracy, altitude, speed, heading, source } = req.body;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ error: "latitude and longitude are required" });
      }
      
      const location = createLocationHistory({
        latitude: String(latitude),
        longitude: String(longitude),
        accuracy: accuracy ? String(accuracy) : undefined,
        altitude: altitude ? String(altitude) : undefined,
        speed: speed ? String(speed) : undefined,
        heading: heading ? String(heading) : undefined,
        source: source || "gps"
      });
      
      res.status(201).json(location);
    } catch (error: any) {
      console.error("Location history create error:", error);
      res.status(500).json({ error: error.message || "Failed to record location" });
    }
  });

  // GET /api/location/history - Get location history
  app.get("/api/location/history", (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      
      let history;
      if (startDate && endDate) {
        history = getLocationHistoryInRange(startDate, endDate);
      } else {
        history = getLocationHistory(limit);
      }
      
      res.json(history);
    } catch (error: any) {
      console.error("Location history fetch error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch location history" });
    }
  });

  // GET /api/location/current - Get the most recent location
  app.get("/api/location/current", (req, res) => {
    try {
      const location = getLatestLocation();
      if (!location) {
        return res.status(404).json({ error: "No location history available" });
      }
      res.json(location);
    } catch (error: any) {
      console.error("Current location fetch error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch current location" });
    }
  });

  // DELETE /api/location/history - Delete old location history
  app.delete("/api/location/history", (req, res) => {
    try {
      const retentionDays = parseInt(req.query.retentionDays as string) || 30;
      const deleted = deleteOldLocationHistory(retentionDays);
      res.json({ deleted, message: `Deleted ${deleted} location records older than ${retentionDays} days` });
    } catch (error: any) {
      console.error("Location history delete error:", error);
      res.status(500).json({ error: error.message || "Failed to delete location history" });
    }
  });

  // === Saved Places ===
  
  // GET /api/location/places - Get all saved places
  app.get("/api/location/places", (req, res) => {
    try {
      const category = req.query.category as string;
      const starred = req.query.starred === "true";
      
      let places;
      if (category) {
        places = getSavedPlacesByCategory(category as any);
      } else if (starred) {
        places = getStarredPlaces();
      } else {
        places = getAllSavedPlaces();
      }
      
      res.json(places);
    } catch (error: any) {
      console.error("Saved places fetch error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch saved places" });
    }
  });

  // POST /api/location/places - Create a new saved place
  app.post("/api/location/places", (req, res) => {
    try {
      const { name, latitude, longitude, label, address, category, notes, isStarred, proximityAlertEnabled, proximityRadiusMeters } = req.body;
      
      if (!name || !latitude || !longitude) {
        return res.status(400).json({ error: "name, latitude, and longitude are required" });
      }
      
      const place = createSavedPlace({
        name,
        latitude: String(latitude),
        longitude: String(longitude),
        label,
        address,
        category: category || "other",
        notes,
        isStarred: isStarred || false,
        proximityAlertEnabled: proximityAlertEnabled || false,
        proximityRadiusMeters: proximityRadiusMeters || 200
      });
      
      res.status(201).json(place);
    } catch (error: any) {
      console.error("Saved place create error:", error);
      res.status(500).json({ error: error.message || "Failed to create saved place" });
    }
  });

  // GET /api/location/places/:id - Get a specific saved place
  app.get("/api/location/places/:id", (req, res) => {
    try {
      const place = getSavedPlace(req.params.id);
      if (!place) {
        return res.status(404).json({ error: "Place not found" });
      }
      res.json(place);
    } catch (error: any) {
      console.error("Saved place fetch error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch saved place" });
    }
  });

  // PATCH /api/location/places/:id - Update a saved place
  app.patch("/api/location/places/:id", (req, res) => {
    try {
      const updated = updateSavedPlace(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Place not found" });
      }
      res.json(updated);
    } catch (error: any) {
      console.error("Saved place update error:", error);
      res.status(500).json({ error: error.message || "Failed to update saved place" });
    }
  });

  // DELETE /api/location/places/:id - Delete a saved place
  app.delete("/api/location/places/:id", (req, res) => {
    try {
      const deleted = deleteSavedPlace(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Place not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Saved place delete error:", error);
      res.status(500).json({ error: error.message || "Failed to delete saved place" });
    }
  });

  // POST /api/location/places/:id/star - Toggle star status
  app.post("/api/location/places/:id/star", (req, res) => {
    try {
      const place = getSavedPlace(req.params.id);
      if (!place) {
        return res.status(404).json({ error: "Place not found" });
      }
      const updated = updateSavedPlace(req.params.id, { isStarred: !place.isStarred });
      res.json(updated);
    } catch (error: any) {
      console.error("Star toggle error:", error);
      res.status(500).json({ error: error.message || "Failed to toggle star" });
    }
  });

  // POST /api/location/places/:id/verify - Verify a place using AI geocoding
  app.post("/api/location/places/:id/verify", async (req, res) => {
    try {
      const { recipientPhone } = req.body;
      const result = await verifyPlace(req.params.id, recipientPhone);
      res.json(result);
    } catch (error: any) {
      console.error("Place verification error:", error);
      res.status(500).json({ error: error.message || "Failed to verify place" });
    }
  });

  // POST /api/location/places/:id/verify-manual - Manually mark a place as verified
  app.post("/api/location/places/:id/verify-manual", (req, res) => {
    try {
      const success = manuallyVerifyPlace(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Place not found" });
      }
      const place = getSavedPlace(req.params.id);
      res.json({ success: true, place });
    } catch (error: any) {
      console.error("Manual verification error:", error);
      res.status(500).json({ error: error.message || "Failed to manually verify place" });
    }
  });

  // === Companion App Location Endpoints ===

  // POST /api/location/samples - Batch upload GPS points from companion app
  app.post("/api/location/samples", (req, res) => {
    try {
      // Validate request body with zod schema
      const parseResult = locationSampleBatchSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid request body", 
          details: parseResult.error.flatten() 
        });
      }
      
      const { samples } = parseResult.data;
      
      if (samples.length === 0) {
        return res.status(400).json({ error: "samples array cannot be empty" });
      }
      
      // Normalize samples for database
      const normalizedSamples = samples.map((s) => ({
        latitude: String(s.latitude),
        longitude: String(s.longitude),
        accuracy: s.accuracy ? String(s.accuracy) : undefined,
        altitude: s.altitude ? String(s.altitude) : undefined,
        speed: s.speed ? String(s.speed) : undefined,
        heading: s.heading ? String(s.heading) : undefined,
        batteryLevel: s.batteryLevel ? String(s.batteryLevel) : undefined,
        source: s.source || "gps",
        timestamp: s.timestamp,
      }));
      
      const created = createLocationSamples(normalizedSamples);
      
      res.status(201).json({
        success: true,
        count: created.length,
        samples: created
      });
    } catch (error: any) {
      console.error("Location samples upload error:", error);
      res.status(500).json({ error: error.message || "Failed to upload location samples" });
    }
  });

  // GET /api/location/samples - Fetch GPS sample history
  app.get("/api/location/samples", (req, res) => {
    try {
      const since = req.query.since as string | undefined;
      const limit = parseInt(req.query.limit as string) || 100;
      
      const samples = getLocationSamples({ since, limit });
      
      res.json({
        count: samples.length,
        samples
      });
    } catch (error: any) {
      console.error("Location samples fetch error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch location samples" });
    }
  });

  // GET /api/location/visits - Get aggregated visit records
  app.get("/api/location/visits", (req, res) => {
    try {
      const since = req.query.since as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const visits = getLocationVisits({ since, limit });
      
      res.json({
        count: visits.length,
        visits
      });
    } catch (error: any) {
      console.error("Location visits fetch error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch location visits" });
    }
  });

  // Companion app starred place schema - derived from insertSavedPlaceSchema
  // Allows flexible input (numbers for lat/lon) while maintaining schema consistency
  const companionStarredPlaceSchema = insertSavedPlaceSchema.extend({
    // Allow numbers for lat/lon (companion app convenience), will be converted to strings
    latitude: z.union([z.string(), z.number()]).transform(v => String(v)),
    longitude: z.union([z.string(), z.number()]).transform(v => String(v)),
  }).partial().extend({
    // Make required fields explicit
    name: z.string().min(1, "name is required"),
    latitude: z.union([z.string(), z.number()]).transform(v => String(v)),
    longitude: z.union([z.string(), z.number()]).transform(v => String(v)),
  });

  // POST /api/location/starred - Save a starred place (simplified for companion app)
  app.post("/api/location/starred", (req, res) => {
    try {
      // Validate request body with schema derived from insertSavedPlaceSchema
      const parseResult = companionStarredPlaceSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid request body", 
          details: parseResult.error.flatten() 
        });
      }
      
      const validatedData = parseResult.data;
      
      // Create place with validated data and starred defaults
      const place = createSavedPlace({
        name: validatedData.name,
        latitude: validatedData.latitude,
        longitude: validatedData.longitude,
        label: validatedData.label ?? undefined,
        address: validatedData.address ?? undefined,
        category: validatedData.category ?? "other",
        notes: validatedData.notes ?? undefined,
        isStarred: true, // Always starred for this endpoint
        proximityAlertEnabled: validatedData.proximityAlertEnabled ?? false,
        proximityRadiusMeters: validatedData.proximityRadiusMeters ?? 200,
        verificationStatus: validatedData.verificationStatus ?? "pending",
        verificationConfidence: validatedData.verificationConfidence ?? undefined,
        lastVerifiedAt: validatedData.lastVerifiedAt ?? undefined,
        verifiedBy: validatedData.verifiedBy ?? undefined,
      });
      
      res.status(201).json({
        success: true,
        place
      });
    } catch (error: any) {
      console.error("Starred place creation error:", error);
      res.status(500).json({ error: error.message || "Failed to save starred place" });
    }
  });

  // GET /api/location/nearby - Find nearby starred places
  app.get("/api/location/nearby", (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lon = parseFloat(req.query.lon as string);
      const radius = parseInt(req.query.radius as string) || 1000;
      
      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: "lat and lon query parameters are required" });
      }
      
      const nearby = findNearbyStarredPlaces(lat, lon, radius);
      
      res.json({
        count: nearby.length,
        places: nearby.map(p => ({
          id: p.id,
          name: p.name,
          latitude: p.latitude,
          longitude: p.longitude,
          address: p.address,
          category: p.category,
          distance: Math.round(p.distance),
          isStarred: p.isStarred,
        }))
      });
    } catch (error: any) {
      console.error("Nearby places fetch error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch nearby places" });
    }
  });

  // === Place Lists ===
  
  // GET /api/location/lists - Get all place lists
  app.get("/api/location/lists", (req, res) => {
    try {
      const groceryLinked = req.query.groceryLinked === "true";
      
      let lists;
      if (groceryLinked) {
        lists = getGroceryLinkedPlaceLists();
      } else {
        lists = getAllPlaceLists();
      }
      
      res.json(lists);
    } catch (error: any) {
      console.error("Place lists fetch error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch place lists" });
    }
  });

  // POST /api/location/lists - Create a new place list
  app.post("/api/location/lists", (req, res) => {
    try {
      const { name, description, icon, color, linkedToGrocery } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: "name is required" });
      }
      
      const list = createPlaceList({
        name,
        description,
        icon,
        color,
        linkedToGrocery: linkedToGrocery || false
      });
      
      res.status(201).json(list);
    } catch (error: any) {
      console.error("Place list create error:", error);
      res.status(500).json({ error: error.message || "Failed to create place list" });
    }
  });

  // GET /api/location/lists/:id - Get a specific place list with its places
  app.get("/api/location/lists/:id", (req, res) => {
    try {
      const list = getPlaceList(req.params.id);
      if (!list) {
        return res.status(404).json({ error: "List not found" });
      }
      
      const places = getPlacesInList(req.params.id);
      res.json({ ...list, places });
    } catch (error: any) {
      console.error("Place list fetch error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch place list" });
    }
  });

  // PATCH /api/location/lists/:id - Update a place list
  app.patch("/api/location/lists/:id", (req, res) => {
    try {
      const updated = updatePlaceList(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "List not found" });
      }
      res.json(updated);
    } catch (error: any) {
      console.error("Place list update error:", error);
      res.status(500).json({ error: error.message || "Failed to update place list" });
    }
  });

  // DELETE /api/location/lists/:id - Delete a place list
  app.delete("/api/location/lists/:id", (req, res) => {
    try {
      const deleted = deletePlaceList(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "List not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Place list delete error:", error);
      res.status(500).json({ error: error.message || "Failed to delete place list" });
    }
  });

  // POST /api/location/lists/:id/places - Add a place to a list
  app.post("/api/location/lists/:id/places", (req, res) => {
    try {
      const { placeId } = req.body;
      
      if (!placeId) {
        return res.status(400).json({ error: "placeId is required" });
      }
      
      const list = getPlaceList(req.params.id);
      if (!list) {
        return res.status(404).json({ error: "List not found" });
      }
      
      const place = getSavedPlace(placeId);
      if (!place) {
        return res.status(404).json({ error: "Place not found" });
      }
      
      const item = addPlaceToList(req.params.id, placeId);
      res.status(201).json(item);
    } catch (error: any) {
      console.error("Add place to list error:", error);
      res.status(500).json({ error: error.message || "Failed to add place to list" });
    }
  });

  // DELETE /api/location/lists/:id/places/:placeId - Remove a place from a list
  app.delete("/api/location/lists/:listId/places/:placeId", (req, res) => {
    try {
      const removed = removePlaceFromList(req.params.listId, req.params.placeId);
      if (!removed) {
        return res.status(404).json({ error: "Place not in list" });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Remove place from list error:", error);
      res.status(500).json({ error: error.message || "Failed to remove place from list" });
    }
  });

  // === Proximity & Nearby ===
  
  // POST /api/location/nearby - Find places near a location
  app.post("/api/location/nearby", (req, res) => {
    try {
      const { latitude, longitude, radiusMeters } = req.body;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ error: "latitude and longitude are required" });
      }
      
      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);
      const radius = radiusMeters || 500;
      
      const nearbyPlaces = findNearbyPlaces(lat, lon, radius);
      res.json(nearbyPlaces);
    } catch (error: any) {
      console.error("Nearby places error:", error);
      res.status(500).json({ error: error.message || "Failed to find nearby places" });
    }
  });

  // POST /api/location/check-grocery-proximity - Check if near grocery-linked places
  app.post("/api/location/check-grocery-proximity", (req, res) => {
    try {
      const { latitude, longitude } = req.body;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ error: "latitude and longitude are required" });
      }
      
      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);
      
      const nearbyGroceryPlaces = checkGroceryProximity(lat, lon);
      
      // Also get high-priority grocery items due today
      const todaysTasks = getTasksDueToday();
      const highPriorityGroceryItems = todaysTasks.filter(
        (task: any) => task.category === "grocery" && task.priority === "high" && !task.completed
      );
      
      res.json({
        nearbyGroceryPlaces,
        highPriorityGroceryItems,
        shouldAlert: nearbyGroceryPlaces.length > 0 && highPriorityGroceryItems.length > 0
      });
    } catch (error: any) {
      console.error("Grocery proximity check error:", error);
      res.status(500).json({ error: error.message || "Failed to check grocery proximity" });
    }
  });

  // === Proximity Alerts ===
  
  // GET /api/location/alerts - Get recent proximity alerts
  app.get("/api/location/alerts", (req, res) => {
    try {
      const unacknowledged = req.query.unacknowledged === "true";
      const limit = parseInt(req.query.limit as string) || 20;
      
      let alerts;
      if (unacknowledged) {
        alerts = getUnacknowledgedAlerts();
      } else {
        alerts = getRecentProximityAlerts(limit);
      }
      
      res.json(alerts);
    } catch (error: any) {
      console.error("Proximity alerts fetch error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch proximity alerts" });
    }
  });

  // POST /api/location/alerts - Create a new proximity alert
  app.post("/api/location/alerts", (req, res) => {
    try {
      const { savedPlaceId, placeListId, distanceMeters, alertType, alertMessage } = req.body;
      
      if (!savedPlaceId || !distanceMeters || !alertType || !alertMessage) {
        return res.status(400).json({ error: "savedPlaceId, distanceMeters, alertType, and alertMessage are required" });
      }
      
      const alert = createProximityAlert({
        savedPlaceId,
        placeListId,
        distanceMeters: String(distanceMeters),
        alertType,
        alertMessage
      });
      
      res.status(201).json(alert);
    } catch (error: any) {
      console.error("Proximity alert create error:", error);
      res.status(500).json({ error: error.message || "Failed to create proximity alert" });
    }
  });

  // POST /api/location/alerts/:id/acknowledge - Acknowledge an alert
  app.post("/api/location/alerts/:id/acknowledge", (req, res) => {
    try {
      const acknowledged = acknowledgeProximityAlert(req.params.id);
      if (!acknowledged) {
        return res.status(404).json({ error: "Alert not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Acknowledge alert error:", error);
      res.status(500).json({ error: error.message || "Failed to acknowledge alert" });
    }
  });

  // POST /api/location/alerts/acknowledge-all - Acknowledge all alerts
  app.post("/api/location/alerts/acknowledge-all", (req, res) => {
    try {
      const count = acknowledgeAllProximityAlerts();
      res.json({ acknowledged: count });
    } catch (error: any) {
      console.error("Acknowledge all alerts error:", error);
      res.status(500).json({ error: error.message || "Failed to acknowledge all alerts" });
    }
  });

  // GET /api/location/places/:id/alerts - Get proximity alerts for a specific place
  app.get("/api/location/places/:id/alerts", (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const alerts = getProximityAlertsForPlace(req.params.id, limit);
      res.json(alerts);
    } catch (error: any) {
      console.error("Get place alerts error:", error);
      res.status(500).json({ error: error.message || "Failed to get alerts for place" });
    }
  });

  // DELETE /api/location/alerts/old - Delete old proximity alerts
  app.delete("/api/location/alerts/old", (req, res) => {
    try {
      const daysOld = parseInt(req.query.daysOld as string) || 30;
      const count = deleteOldProximityAlerts(daysOld);
      res.json({ deleted: count });
    } catch (error: any) {
      console.error("Delete old alerts error:", error);
      res.status(500).json({ error: error.message || "Failed to delete old alerts" });
    }
  });

  // GET /api/location/places/:id/lists - Get lists that contain a place
  app.get("/api/location/places/:id/lists", (req, res) => {
    try {
      const place = getSavedPlace(req.params.id);
      if (!place) {
        return res.status(404).json({ error: "Place not found" });
      }
      
      const lists = getListsForPlace(req.params.id);
      res.json(lists);
    } catch (error: any) {
      console.error("Get lists for place error:", error);
      res.status(500).json({ error: error.message || "Failed to get lists for place" });
    }
  });

  // === Location Linking Routes ===
  
  // GET /api/location/places/:id/items - Get all items linked to a place
  app.get("/api/location/places/:id/items", (req, res) => {
    try {
      const result = getPlaceWithLinkedItems(req.params.id);
      if (!result) {
        return res.status(404).json({ error: "Place not found" });
      }
      res.json(result);
    } catch (error: any) {
      console.error("Get place items error:", error);
      res.status(500).json({ error: error.message || "Failed to get items for place" });
    }
  });

  // POST /api/location/places/:id/link/task - Link a task to a place
  app.post("/api/location/places/:id/link/task", (req, res) => {
    try {
      const { taskId } = req.body;
      if (!taskId) {
        return res.status(400).json({ error: "taskId is required" });
      }
      
      const task = linkTaskToPlace(taskId, req.params.id);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error: any) {
      console.error("Link task to place error:", error);
      res.status(500).json({ error: error.message || "Failed to link task to place" });
    }
  });

  // DELETE /api/location/places/:id/link/task/:taskId - Unlink a task from a place
  app.delete("/api/location/places/:id/link/task/:taskId", (req, res) => {
    try {
      const task = unlinkTaskFromPlace(req.params.taskId);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error: any) {
      console.error("Unlink task from place error:", error);
      res.status(500).json({ error: error.message || "Failed to unlink task from place" });
    }
  });

  // POST /api/location/places/:id/link/reminder - Link a reminder to a place
  app.post("/api/location/places/:id/link/reminder", (req, res) => {
    try {
      const { reminderId } = req.body;
      if (!reminderId) {
        return res.status(400).json({ error: "reminderId is required" });
      }
      
      const reminder = linkReminderToPlace(reminderId, req.params.id);
      if (!reminder) {
        return res.status(404).json({ error: "Reminder not found" });
      }
      res.json(reminder);
    } catch (error: any) {
      console.error("Link reminder to place error:", error);
      res.status(500).json({ error: error.message || "Failed to link reminder to place" });
    }
  });

  // DELETE /api/location/places/:id/link/reminder/:reminderId - Unlink a reminder from a place
  app.delete("/api/location/places/:id/link/reminder/:reminderId", (req, res) => {
    try {
      const reminder = unlinkReminderFromPlace(req.params.reminderId);
      if (!reminder) {
        return res.status(404).json({ error: "Reminder not found" });
      }
      res.json(reminder);
    } catch (error: any) {
      console.error("Unlink reminder from place error:", error);
      res.status(500).json({ error: error.message || "Failed to unlink reminder from place" });
    }
  });

  // POST /api/location/places/:id/link/memory - Link a memory to a place
  app.post("/api/location/places/:id/link/memory", (req, res) => {
    try {
      const { memoryId } = req.body;
      if (!memoryId) {
        return res.status(400).json({ error: "memoryId is required" });
      }
      
      const memory = linkMemoryToPlace(memoryId, req.params.id);
      if (!memory) {
        return res.status(404).json({ error: "Memory not found" });
      }
      res.json(memory);
    } catch (error: any) {
      console.error("Link memory to place error:", error);
      res.status(500).json({ error: error.message || "Failed to link memory to place" });
    }
  });

  // DELETE /api/location/places/:id/link/memory/:memoryId - Unlink a memory from a place
  app.delete("/api/location/places/:id/link/memory/:memoryId", (req, res) => {
    try {
      const memory = unlinkMemoryFromPlace(req.params.memoryId);
      if (!memory) {
        return res.status(404).json({ error: "Memory not found" });
      }
      res.json(memory);
    } catch (error: any) {
      console.error("Unlink memory from place error:", error);
      res.status(500).json({ error: error.message || "Failed to unlink memory from place" });
    }
  });

  // GET /api/location/places/:id/tasks - Get all tasks linked to a place
  app.get("/api/location/places/:id/tasks", (req, res) => {
    try {
      const tasks = getTasksByPlace(req.params.id);
      res.json(tasks);
    } catch (error: any) {
      console.error("Get tasks by place error:", error);
      res.status(500).json({ error: error.message || "Failed to get tasks for place" });
    }
  });

  // GET /api/location/places/:id/reminders - Get all reminders linked to a place
  app.get("/api/location/places/:id/reminders", (req, res) => {
    try {
      const reminders = getRemindersByPlace(req.params.id);
      res.json(reminders);
    } catch (error: any) {
      console.error("Get reminders by place error:", error);
      res.status(500).json({ error: error.message || "Failed to get reminders for place" });
    }
  });

  // GET /api/location/places/:id/memories - Get all memories linked to a place
  app.get("/api/location/places/:id/memories", (req, res) => {
    try {
      const memories = getMemoriesByPlace(req.params.id);
      res.json(memories);
    } catch (error: any) {
      console.error("Get memories by place error:", error);
      res.status(500).json({ error: error.message || "Failed to get memories for place" });
    }
  });

  // === Overland GPS Tracking Webhook ===
  // POST /api/location/overland - Receive location data from Overland iOS/Android app
  // Overland sends GeoJSON format: https://overland.p3k.app/
  app.post("/api/location/overland", (req, res) => {
    try {
      // Verify access token (sent in Authorization header or query param)
      const authHeader = req.headers.authorization;
      const queryToken = req.query.token as string;
      const expectedToken = process.env.OVERLAND_ACCESS_TOKEN;
      
      if (!expectedToken) {
        console.error("[Overland] OVERLAND_ACCESS_TOKEN not configured");
        return res.status(500).json({ error: "Server not configured for Overland" });
      }
      
      // Overland can send token as:
      // 1. Authorization header: "Bearer <token>" or just "<token>"
      // 2. Query parameter: ?token=<token>
      const headerToken = authHeader?.replace(/^Bearer\s+/i, "").trim();
      const providedToken = headerToken || queryToken;
      
      if (!providedToken || providedToken !== expectedToken) {
        console.warn(`[Overland] Token mismatch - Provided: ${providedToken ? providedToken.substring(0, 4) + '...' : 'none'}`);
        return res.status(401).json({ error: "Invalid access token" });
      }
      
      // Parse Overland's GeoJSON format
      const { locations } = req.body;
      
      if (!locations || !Array.isArray(locations)) {
        return res.status(400).json({ error: "Invalid payload: expected { locations: [...] }" });
      }
      
      let savedCount = 0;
      
      for (const location of locations) {
        try {
          // Overland sends GeoJSON Feature format
          if (location.type !== "Feature" || !location.geometry || location.geometry.type !== "Point") {
            console.warn("[Overland] Skipping non-Point location:", location.type);
            continue;
          }

          const [longitude, latitude] = location.geometry.coordinates;
          const props = location.properties || {};

          // Extract properties from Overland payload
          const accuracy = props.horizontal_accuracy;
          const altitude = props.altitude;
          const speed = props.speed;
          const heading = props.course;
          const timestamp = props.timestamp;

          // Save to location history
          const savedLocation = createLocationHistory({
            latitude: String(latitude),
            longitude: String(longitude),
            accuracy: accuracy !== undefined ? String(accuracy) : undefined,
            altitude: altitude !== undefined ? String(altitude) : undefined,
            speed: speed !== undefined ? String(speed) : undefined,
            heading: heading !== undefined ? String(heading) : undefined,
            source: "overland"
          });

          savedCount++;

          // Log detailed info for the first location in the batch
          if (savedCount === 1) {
            console.log(`[Overland] GPS data received - Lat: ${latitude.toFixed(6)}, Lon: ${longitude.toFixed(6)}, Accuracy: ${accuracy ? accuracy.toFixed(0) + 'm' : 'N/A'}${timestamp ? ', Time: ' + new Date(timestamp * 1000).toISOString() : ''}`);
          }
        } catch (locError) {
          console.error("[Overland] Error processing location:", locError);
        }
      }

      console.log(`[Overland] ✓ Saved ${savedCount}/${locations.length} location${savedCount !== 1 ? 's' : ''} from Overland GPS`);
      
      // Overland expects a specific response format
      res.json({ 
        result: "ok",
        saved: savedCount
      });
    } catch (error: any) {
      console.error("[Overland] Webhook error:", error);
      res.status(500).json({ error: error.message || "Failed to process location data" });
    }
  });

  // GET /api/location/overland/status - Check Overland integration status
  app.get("/api/location/overland/status", (req, res) => {
    try {
      const hasToken = !!process.env.OVERLAND_ACCESS_TOKEN;
      const latestLocation = getLatestLocation();
      
      res.json({
        configured: hasToken,
        lastLocationAt: latestLocation?.createdAt || null,
        locationCount: getLocationHistory(1).length > 0 ? "has_data" : "no_data"
      });
    } catch (error: any) {
      console.error("[Overland] Status check error:", error);
      res.status(500).json({ error: error.message || "Failed to check status" });
    }
  });

  // === Apple Shortcuts Location Webhook ===
  // POST /api/location/shortcut - Receive location data from Apple Shortcuts
  // Simple format: { latitude, longitude, accuracy?, altitude?, speed?, heading? }
  app.post("/api/location/shortcut", (req, res) => {
    try {
      // Verify access token (sent in query param or Authorization header)
      const authHeader = req.headers.authorization;
      const queryToken = req.query.token as string;
      const expectedToken = process.env.OVERLAND_ACCESS_TOKEN;
      
      if (!expectedToken) {
        console.error("[Shortcut] OVERLAND_ACCESS_TOKEN not configured");
        return res.status(500).json({ error: "Server not configured for location tracking" });
      }
      
      const headerToken = authHeader?.replace(/^Bearer\s+/i, "").trim();
      const providedToken = headerToken || queryToken;
      
      if (!providedToken || providedToken !== expectedToken) {
        console.warn(`[Shortcut] Token mismatch`);
        return res.status(401).json({ error: "Invalid access token" });
      }
      
      // Parse simple location format from Shortcuts
      const { latitude, longitude, accuracy, altitude, speed, heading } = req.body;
      
      if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({ error: "Missing required fields: latitude, longitude" });
      }
      
      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);
      
      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: "Invalid coordinates: latitude and longitude must be numbers" });
      }
      
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return res.status(400).json({ error: "Invalid coordinates: out of range" });
      }
      
      // Save to location history
      const savedLocation = createLocationHistory({
        latitude: String(lat),
        longitude: String(lon),
        accuracy: accuracy !== undefined ? String(accuracy) : undefined,
        altitude: altitude !== undefined ? String(altitude) : undefined,
        speed: speed !== undefined ? String(speed) : undefined,
        heading: heading !== undefined ? String(heading) : undefined,
        source: "manual"
      });
      
      console.log(`[Shortcut] GPS data received - Lat: ${lat.toFixed(6)}, Lon: ${lon.toFixed(6)}, Accuracy: ${accuracy ? accuracy + 'm' : 'N/A'}`);
      
      res.json({ 
        success: true,
        message: "Location saved",
        id: savedLocation.id,
        timestamp: savedLocation.createdAt
      });
    } catch (error: any) {
      console.error("[Shortcut] Webhook error:", error);
      res.status(500).json({ error: error.message || "Failed to process location data" });
    }
  });

  // === Apple Shortcuts Save Place via SMS ===
  // POST /api/location/shortcut/save-place - Trigger SMS conversation to save current location as a place
  app.post("/api/location/shortcut/save-place", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const queryToken = req.query.token as string;
      const expectedToken = process.env.OVERLAND_ACCESS_TOKEN;
      
      if (!expectedToken) {
        console.error("[SavePlace] OVERLAND_ACCESS_TOKEN not configured");
        return res.status(500).json({ error: "Server not configured for location tracking" });
      }
      
      const headerToken = authHeader?.replace(/^Bearer\s+/i, "").trim();
      const providedToken = headerToken || queryToken;
      
      if (!providedToken || providedToken !== expectedToken) {
        console.warn(`[SavePlace] Token mismatch`);
        return res.status(401).json({ error: "Invalid access token" });
      }
      
      const { latitude, longitude, accuracy, phone } = req.body;
      
      if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({ error: "Missing required fields: latitude, longitude" });
      }
      
      if (!phone) {
        return res.status(400).json({ error: "Missing required field: phone (your phone number to receive SMS)" });
      }
      
      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);
      
      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: "Invalid coordinates" });
      }
      
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return res.status(400).json({ error: "Invalid coordinates: out of range" });
      }
      
      const formattedPhone = formatPhoneNumber(phone);
      
      // Security: Verify phone is master admin or known contact
      const isAdmin = isMasterAdmin(formattedPhone);
      const contact = getContactByPhone(formattedPhone);
      
      if (!isAdmin && !contact) {
        console.warn(`[SavePlace] Rejected - phone ${formattedPhone} is not admin or known contact`);
        return res.status(403).json({ error: "Phone number not authorized. Must be admin or known contact." });
      }
      
      setPendingPlaceSave(formattedPhone, String(lat), String(lon), accuracy ? String(accuracy) : undefined);
      
      try {
        const twilioFromNumber = await getTwilioFromPhoneNumber();
        if (twilioFromNumber) {
          const client = await getTwilioClient();
          await client.messages.create({
            body: "Got your location! What would you like to name this place? (Reply with just the name)",
            from: twilioFromNumber,
            to: formattedPhone,
          });
          
          logTwilioMessage({
            direction: "outbound",
            source: "api",
            fromNumber: twilioFromNumber,
            toNumber: formattedPhone,
            body: "Got your location! What would you like to name this place? (Reply with just the name)",
            status: "sent",
          });
          
          console.log(`[SavePlace] SMS sent to ${formattedPhone} asking for place name`);
          
          res.json({
            success: true,
            message: "Location received. SMS sent asking for place name.",
            coordinates: { latitude: lat, longitude: lon }
          });
        } else {
          console.error("[SavePlace] Twilio not configured");
          res.status(500).json({ error: "SMS service not configured" });
        }
      } catch (smsError: any) {
        console.error("[SavePlace] Failed to send SMS:", smsError);
        res.status(500).json({ error: "Failed to send SMS: " + smsError.message });
      }
    } catch (error: any) {
      console.error("[SavePlace] Webhook error:", error);
      res.status(500).json({ error: error.message || "Failed to process save place request" });
    }
  });

  // === Lifelog-Location Correlation Routes ===

  // GET /api/location/lifelogs - Get recent lifelogs with location data
  app.get("/api/location/lifelogs", (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const activity = req.query.activity as ActivityType | undefined;
      
      let lifelogs;
      if (activity && activity !== "unknown") {
        lifelogs = getLifelogsByActivity(activity).slice(0, limit);
      } else {
        lifelogs = getRecentLifelogLocations(limit);
      }
      
      res.json(lifelogs);
    } catch (error: any) {
      console.error("Get lifelog locations error:", error);
      res.status(500).json({ error: error.message || "Failed to get lifelog locations" });
    }
  });

  // GET /api/location/lifelogs/nearby - Get lifelogs near current location
  app.get("/api/location/lifelogs/nearby", (req, res) => {
    try {
      const radiusMeters = parseInt(req.query.radius as string) || 500;
      
      // Get current location
      const currentLocation = getLatestLocation();
      if (!currentLocation) {
        return res.status(404).json({ error: "No current location available" });
      }
      
      const lat = parseFloat(currentLocation.latitude);
      const lng = parseFloat(currentLocation.longitude);
      
      const nearbyLifelogs = getLifelogsNearLocation(lat, lng, radiusMeters);
      
      res.json({
        currentLocation: {
          latitude: lat,
          longitude: lng,
          accuracy: currentLocation.accuracy,
          updatedAt: currentLocation.createdAt
        },
        radiusMeters,
        lifelogs: nearbyLifelogs
      });
    } catch (error: any) {
      console.error("Get nearby lifelogs error:", error);
      res.status(500).json({ error: error.message || "Failed to get nearby lifelogs" });
    }
  });

  // GET /api/location/places/:id/lifelogs - Get lifelogs at a specific place
  app.get("/api/location/places/:id/lifelogs", (req, res) => {
    try {
      const place = getSavedPlace(req.params.id);
      if (!place) {
        return res.status(404).json({ error: "Place not found" });
      }
      
      const lifelogs = getLifelogsAtPlace(req.params.id);
      
      res.json({
        place: {
          id: place.id,
          name: place.name,
          category: place.category
        },
        lifelogs
      });
    } catch (error: any) {
      console.error("Get place lifelogs error:", error);
      res.status(500).json({ error: error.message || "Failed to get lifelogs for place" });
    }
  });

  // GET /api/location/timeline - Get unified timeline combining location and lifelogs
  app.get("/api/location/timeline", (req, res) => {
    try {
      const startDate = req.query.startDate as string || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = req.query.endDate as string || new Date().toISOString();
      
      const timeline = buildUnifiedTimeline(startDate, endDate);
      
      res.json({
        startDate,
        endDate,
        entries: timeline
      });
    } catch (error: any) {
      console.error("Get timeline error:", error);
      res.status(500).json({ error: error.message || "Failed to build timeline" });
    }
  });

  // POST /api/location/lifelogs/correlate - Trigger correlation of recent lifelogs with GPS
  app.post("/api/location/lifelogs/correlate", async (req, res) => {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      
      // Get recent lifelogs from Omi
      const recentLifelogs = await getRecentLifelogs(hours, 50);
      
      if (!recentLifelogs || recentLifelogs.length === 0) {
        return res.json({ 
          success: true, 
          message: "No recent lifelogs to correlate", 
          correlated: 0 
        });
      }
      
      const correlatedResults = [];
      
      for (const lifelog of recentLifelogs) {
        try {
          const result = correlateLifelogWithLocation(
            lifelog.id,
            lifelog.title,
            lifelog.startTime,
            lifelog.endTime
          );
          
          if (result) {
            correlatedResults.push({
              lifelogId: lifelog.id,
              title: lifelog.title,
              locationCorrelated: !!result.startLatitude,
              placeName: result.savedPlaceName,
              activity: result.activityType
            });
          }
        } catch (err) {
          console.error(`[Correlate] Error processing lifelog ${lifelog.id}:`, err);
        }
      }
      
      res.json({
        success: true,
        message: `Correlated ${correlatedResults.length} lifelogs`,
        correlated: correlatedResults.length,
        results: correlatedResults
      });
    } catch (error: any) {
      console.error("Correlate lifelogs error:", error);
      res.status(500).json({ error: error.message || "Failed to correlate lifelogs" });
    }
  });

  // GET /api/location/lifelogs/:id - Get a specific lifelog's location data
  app.get("/api/location/lifelogs/:id", (req, res) => {
    try {
      const lifelogLocation = getLifelogLocationByLifelogId(req.params.id);
      if (!lifelogLocation) {
        return res.status(404).json({ error: "Lifelog location data not found" });
      }
      res.json(lifelogLocation);
    } catch (error: any) {
      console.error("Get lifelog location error:", error);
      res.status(500).json({ error: error.message || "Failed to get lifelog location" });
    }
  });

  // GET /api/location/patterns - Analyze location patterns and routines
  app.get("/api/location/patterns", (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const patterns = analyzeLocationPatterns(days);
      
      res.json({
        analyzedDays: days,
        frequentPlaces: patterns.frequentPlaces,
        commutePatternsDetected: patterns.commutePatternsDetected,
        typicalHomeHours: patterns.typicalHomeHours,
        typicalWorkHours: patterns.typicalWorkHours,
        summary: {
          totalFrequentPlaces: patterns.frequentPlaces.length,
          hasCommutePattern: patterns.commutePatternsDetected,
          avgHomeHoursPerDay: patterns.typicalHomeHours.length,
          avgWorkHoursPerDay: patterns.typicalWorkHours.length,
        }
      });
    } catch (error: any) {
      console.error("Analyze patterns error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze patterns" });
    }
  });

  // GET /api/location/intelligence - Get enhanced location intelligence with job site detection
  app.get("/api/location/intelligence", async (req, res) => {
    try {
      const { getLocationContext, getQuickLocationSummary } = await import("./locationIntelligence");
      const context = await getLocationContext();
      const summary = await getQuickLocationSummary();
      
      res.json({
        summary,
        gpsHealth: context.gpsHealthStatus,
        lastUpdateAge: context.lastUpdateAge,
        currentActivity: context.currentActivity,
        currentState: context.currentState ? {
          latitude: context.currentState.latitude,
          longitude: context.currentState.longitude,
          accuracy: context.currentState.accuracy,
          isMoving: context.currentState.isMoving,
          movementType: context.currentState.movementType,
          speed: context.currentState.speed,
          heading: context.currentState.heading,
          dataQuality: context.currentState.dataQuality,
          dataFreshness: context.currentState.dataFreshness,
          source: context.currentState.source,
        } : null,
        nearbyPlaces: context.nearbyPlaces.map(p => ({
          id: p.place.id,
          name: p.place.name,
          category: p.place.category,
          distanceMeters: p.distanceMeters,
          isAt: p.isAt,
        })),
        nearbyAppointments: context.nearbyAppointments.map(a => ({
          eventId: a.eventId,
          eventTitle: a.eventTitle,
          eventLocation: a.eventLocation,
          eventStart: a.eventStart.toISOString(),
          eventEnd: a.eventEnd.toISOString(),
          distanceMeters: a.distanceMeters === Infinity ? null : a.distanceMeters,
          isArrived: a.isArrived,
          arrivalConfidence: a.arrivalConfidence,
          hasCoordinates: a.estimatedCoordinates !== null,
        })),
        contextSummary: context.contextSummary,
      });
    } catch (error: any) {
      console.error("Get location intelligence error:", error);
      res.status(500).json({ error: error.message || "Failed to get location intelligence" });
    }
  });

  // GET /api/location/context - Get location-aware context for current position
  app.get("/api/location/context", async (req, res) => {
    try {
      const currentLocation = getLatestLocation();
      if (!currentLocation) {
        return res.json({ 
          hasLocation: false,
          message: "No location data available" 
        });
      }
      
      const lat = parseFloat(currentLocation.latitude);
      const lng = parseFloat(currentLocation.longitude);
      const radiusMeters = parseInt(req.query.radius as string) || 500;
      
      // Get nearby saved places
      const nearbyPlaces = findNearbyPlaces(lat, lng, radiusMeters);
      const closestPlace = nearbyPlaces.length > 0 ? nearbyPlaces[0] : null;
      
      // Get lifelogs at this location
      let relevantLifelogs;
      if (closestPlace) {
        relevantLifelogs = getLifelogsAtPlace(closestPlace.id).slice(0, 5);
      } else {
        relevantLifelogs = getLifelogsNearLocation(lat, lng, radiusMeters).slice(0, 5);
      }
      
      // Check grocery proximity
      const groceryProximity = checkGroceryProximity(lat, lng);
      const nearbyGrocery = groceryProximity.length > 0 ? groceryProximity[0] : null;
      
      res.json({
        hasLocation: true,
        currentLocation: {
          latitude: lat,
          longitude: lng,
          accuracy: currentLocation.accuracy,
          updatedAt: currentLocation.createdAt
        },
        closestPlace: closestPlace ? {
          id: closestPlace.id,
          name: closestPlace.name,
          category: closestPlace.category,
          distance: closestPlace.distance
        } : null,
        nearbyGroceryStore: nearbyGrocery ? {
          place: {
            id: nearbyGrocery.place.id,
            name: nearbyGrocery.place.name
          },
          distance: nearbyGrocery.distance
        } : null,
        pastConversations: relevantLifelogs.map(ll => ({
          id: ll.lifelogId,
          title: ll.lifelogTitle,
          startTime: ll.lifelogStartTime,
          activity: ll.activityType,
          placeName: ll.savedPlaceName
        })),
        contextSummary: buildLocationContextSummary(closestPlace, relevantLifelogs, nearbyGrocery)
      });
    } catch (error: any) {
      console.error("Get location context error:", error);
      res.status(500).json({ error: error.message || "Failed to get location context" });
    }
  });

  // === Location Check-In System Routes ===

  // GET /api/location/checkin/status - Get check-in monitor status
  app.get("/api/location/checkin/status", (req, res) => {
    try {
      const status = getLocationCheckInStatus();
      res.json(status);
    } catch (error: any) {
      console.error("Get check-in status error:", error);
      res.status(500).json({ error: error.message || "Failed to get check-in status" });
    }
  });

  // POST /api/location/checkin/start - Start the check-in monitor
  app.post("/api/location/checkin/start", (req, res) => {
    try {
      const started = startLocationCheckInMonitor();
      if (started) {
        res.json({ success: true, message: "Check-in monitor started" });
      } else {
        res.json({ success: false, message: "Check-in monitor already running" });
      }
    } catch (error: any) {
      console.error("Start check-in monitor error:", error);
      res.status(500).json({ error: error.message || "Failed to start check-in monitor" });
    }
  });

  // POST /api/location/checkin/stop - Stop the check-in monitor
  app.post("/api/location/checkin/stop", (req, res) => {
    try {
      const stopped = stopLocationCheckInMonitor();
      if (stopped) {
        res.json({ success: true, message: "Check-in monitor stopped" });
      } else {
        res.json({ success: false, message: "Check-in monitor not running" });
      }
    } catch (error: any) {
      console.error("Stop check-in monitor error:", error);
      res.status(500).json({ error: error.message || "Failed to stop check-in monitor" });
    }
  });

  // GET /api/location/checkin/state - Get current location state and nearby places
  app.get("/api/location/checkin/state", (req, res) => {
    try {
      const state = getCurrentLocationState();
      res.json(state);
    } catch (error: any) {
      console.error("Get location state error:", error);
      res.status(500).json({ error: error.message || "Failed to get location state" });
    }
  });

  // === ZEKE Context Agent Routes ===
  
  // GET /api/context-agent/status - Get current context agent status
  app.get("/api/context-agent/status", (req, res) => {
    try {
      const status = getContextAgentStatus();
      res.json(status);
    } catch (error: any) {
      console.error("Get context agent status error:", error);
      res.status(500).json({ error: error.message || "Failed to get status" });
    }
  });

  // GET /api/context-agent/settings - Get context agent settings
  app.get("/api/context-agent/settings", (req, res) => {
    try {
      const settings = getContextAgentSettings();
      res.json(settings);
    } catch (error: any) {
      console.error("Get context agent settings error:", error);
      res.status(500).json({ error: error.message || "Failed to get settings" });
    }
  });

  // PATCH /api/context-agent/settings - Update context agent settings
  app.patch("/api/context-agent/settings", (req, res) => {
    try {
      const settings = updateContextAgentSettings(req.body);
      
      // Restart the agent if enabled status changed
      if (req.body.enabled !== undefined) {
        toggleContextAgent(req.body.enabled);
      }
      
      res.json(settings);
    } catch (error: any) {
      console.error("Update context agent settings error:", error);
      res.status(500).json({ error: error.message || "Failed to update settings" });
    }
  });

  // POST /api/context-agent/toggle - Toggle context agent on/off
  app.post("/api/context-agent/toggle", (req, res) => {
    try {
      const { enabled } = req.body;
      const settings = toggleContextAgent(enabled);
      res.json({ success: true, settings });
    } catch (error: any) {
      console.error("Toggle context agent error:", error);
      res.status(500).json({ error: error.message || "Failed to toggle agent" });
    }
  });

  // POST /api/context-agent/scan - Trigger a manual scan
  app.post("/api/context-agent/scan", async (req, res) => {
    try {
      const { hours } = req.body;
      const result = await processContextCommands(hours);
      res.json(result);
    } catch (error: any) {
      console.error("Manual scan error:", error);
      res.status(500).json({ error: error.message || "Failed to run scan" });
    }
  });

  // GET /api/context-agent/commands - Get recent wake word commands
  app.get("/api/context-agent/commands", (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const commands = getRecentWakeWordCommands(limit);
      res.json(commands);
    } catch (error: any) {
      console.error("Get commands error:", error);
      res.status(500).json({ error: error.message || "Failed to get commands" });
    }
  });

  // GET /api/context-agent/commands/pending - Get pending commands
  app.get("/api/context-agent/commands/pending", (req, res) => {
    try {
      const commands = getPendingWakeWordCommands();
      res.json(commands);
    } catch (error: any) {
      console.error("Get pending commands error:", error);
      res.status(500).json({ error: error.message || "Failed to get pending commands" });
    }
  });

  // POST /api/context-agent/commands/:id/approve - Approve and execute a pending command
  app.post("/api/context-agent/commands/:id/approve", async (req, res) => {
    try {
      const result = await approveAndExecuteCommand(req.params.id);
      res.json(result);
    } catch (error: any) {
      console.error("Approve command error:", error);
      res.status(500).json({ error: error.message || "Failed to approve command" });
    }
  });

  // POST /api/context-agent/commands/:id/reject - Reject a pending command
  app.post("/api/context-agent/commands/:id/reject", (req, res) => {
    try {
      const success = updateWakeWordCommandStatus(req.params.id, "skipped", "Manually rejected");
      res.json({ success });
    } catch (error: any) {
      console.error("Reject command error:", error);
      res.status(500).json({ error: error.message || "Failed to reject command" });
    }
  });

  // DELETE /api/context-agent/commands/:id - Delete a command
  app.delete("/api/context-agent/commands/:id", (req, res) => {
    try {
      const success = deleteWakeWordCommand(req.params.id);
      res.json({ success });
    } catch (error: any) {
      console.error("Delete command error:", error);
      res.status(500).json({ error: error.message || "Failed to delete command" });
    }
  });

  // === Food Preferences & Recipes API Routes ===

  // GET /api/food/family - Get all family members
  app.get("/api/food/family", (req, res) => {
    try {
      const members = getActiveFamilyMembers();
      res.json(members);
    } catch (error: any) {
      console.error("Get family members error:", error);
      res.status(500).json({ error: error.message || "Failed to get family members" });
    }
  });

  // GET /api/food/preferences - Get all food preferences
  app.get("/api/food/preferences", (req, res) => {
    try {
      const memberId = req.query.memberId as string | undefined;
      const preferences = getFoodPreferences(memberId);
      res.json(preferences);
    } catch (error: any) {
      console.error("Get food preferences error:", error);
      res.status(500).json({ error: error.message || "Failed to get food preferences" });
    }
  });

  // POST /api/food/preferences - Add a food preference
  app.post("/api/food/preferences", (req, res) => {
    try {
      const parsed = insertFoodPreferenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Creating/updating food preference for member ${parsed.data.memberId}`);
      const pref = upsertFoodPreference(parsed.data);
      res.json(pref);
    } catch (error: any) {
      console.error("Add food preference error:", error);
      res.status(500).json({ error: error.message || "Failed to add food preference" });
    }
  });

  // DELETE /api/food/preferences/:id - Delete a food preference
  app.delete("/api/food/preferences/:id", (req, res) => {
    try {
      const { id } = req.params;
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Deleting food preference ${id}`);
      const success = deleteFoodPreference(id);
      if (!success) {
        return res.status(404).json({ error: "Food preference not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete food preference error:", error);
      res.status(500).json({ error: error.message || "Failed to delete food preference" });
    }
  });

  // GET /api/food/preferences/summary - Get summary of preferences by member
  app.get("/api/food/preferences/summary", (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Fetching food preferences summary`);
      const liked = getLikedIngredients();
      const disliked = getDislikedIngredients();
      const loved = getFoodPreferences().filter(p => p.preference === "love");
      res.json({ liked, disliked, loved });
    } catch (error: any) {
      console.error("Get food preferences summary error:", error);
      res.status(500).json({ error: error.message || "Failed to get food preferences summary" });
    }
  });

  // GET /api/food/restrictions - Get all dietary restrictions
  app.get("/api/food/restrictions", (req, res) => {
    try {
      const memberId = req.query.memberId as string | undefined;
      const restrictions = getDietaryRestrictions(memberId);
      res.json(restrictions);
    } catch (error: any) {
      console.error("Get dietary restrictions error:", error);
      res.status(500).json({ error: error.message || "Failed to get dietary restrictions" });
    }
  });

  // POST /api/food/restrictions - Add a dietary restriction
  app.post("/api/food/restrictions", (req, res) => {
    try {
      const parsed = insertDietaryRestrictionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Creating dietary restriction for member ${parsed.data.memberId}`);
      const restriction = createDietaryRestriction(parsed.data);
      res.json(restriction);
    } catch (error: any) {
      console.error("Add dietary restriction error:", error);
      res.status(500).json({ error: error.message || "Failed to add dietary restriction" });
    }
  });

  // DELETE /api/food/restrictions/:id - Delete a dietary restriction
  app.delete("/api/food/restrictions/:id", (req, res) => {
    try {
      const { id } = req.params;
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Deleting dietary restriction ${id}`);
      const success = deleteDietaryRestriction(id);
      if (!success) {
        return res.status(404).json({ error: "Dietary restriction not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete dietary restriction error:", error);
      res.status(500).json({ error: error.message || "Failed to delete dietary restriction" });
    }
  });

  // GET /api/recipes - Get all recipes with optional filters
  app.get("/api/recipes", (req, res) => {
    try {
      const search = req.query.search as string | undefined;
      const cuisine = req.query.cuisine as string | undefined;
      const mealType = req.query.mealType as string | undefined;
      const isFavorite = req.query.isFavorite === "true" ? true : (req.query.isFavorite === "false" ? false : undefined);
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Fetching recipes with filters - search: ${search || 'none'}, cuisine: ${cuisine || 'none'}, mealType: ${mealType || 'none'}, isFavorite: ${isFavorite}`);
      
      let recipes;
      if (search) {
        recipes = searchRecipes(search);
      } else if (cuisine || mealType || isFavorite !== undefined) {
        recipes = getSavedRecipes({
          cuisine,
          mealType: mealType as any,
          isFavorite
        });
      } else {
        recipes = getSavedRecipes();
      }
      res.json(recipes);
    } catch (error: any) {
      console.error("Get recipes error:", error);
      res.status(500).json({ error: error.message || "Failed to get recipes" });
    }
  });

  // POST /api/recipes - Create a new recipe
  app.post("/api/recipes", (req, res) => {
    try {
      const parsed = insertSavedRecipeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Creating recipe "${parsed.data.name}"`);
      const recipe = createRecipe(parsed.data);
      res.json(recipe);
    } catch (error: any) {
      console.error("Create recipe error:", error);
      res.status(500).json({ error: error.message || "Failed to create recipe" });
    }
  });

  // GET /api/recipes/:id - Get a single recipe
  app.get("/api/recipes/:id", (req, res) => {
    try {
      const recipe = getRecipeById(req.params.id);
      if (!recipe) {
        return res.status(404).json({ error: "Recipe not found" });
      }
      res.json(recipe);
    } catch (error: any) {
      console.error("Get recipe error:", error);
      res.status(500).json({ error: error.message || "Failed to get recipe" });
    }
  });

  // PUT /api/recipes/:id - Update a recipe
  app.put("/api/recipes/:id", (req, res) => {
    try {
      const { id } = req.params;
      const existing = getRecipeById(id);
      if (!existing) {
        return res.status(404).json({ error: "Recipe not found" });
      }
      
      const parsed = updateSavedRecipeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Updating recipe "${existing.name}" (${id})`);
      const recipe = updateRecipe(id, parsed.data);
      res.json(recipe);
    } catch (error: any) {
      console.error("Update recipe error:", error);
      res.status(500).json({ error: error.message || "Failed to update recipe" });
    }
  });

  // DELETE /api/recipes/:id - Delete a recipe
  app.delete("/api/recipes/:id", (req, res) => {
    try {
      const { id } = req.params;
      const existing = getRecipeById(id);
      if (!existing) {
        return res.status(404).json({ error: "Recipe not found" });
      }
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Deleting recipe "${existing.name}" (${id})`);
      const success = deleteRecipe(id);
      res.json({ success });
    } catch (error: any) {
      console.error("Delete recipe error:", error);
      res.status(500).json({ error: error.message || "Failed to delete recipe" });
    }
  });

  // POST /api/recipes/:id/favorite - Toggle recipe favorite
  app.post("/api/recipes/:id/favorite", (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Toggling favorite for recipe ${req.params.id}`);
      const recipe = toggleRecipeFavorite(req.params.id);
      if (!recipe) {
        return res.status(404).json({ error: "Recipe not found" });
      }
      res.json(recipe);
    } catch (error: any) {
      console.error("Toggle recipe favorite error:", error);
      res.status(500).json({ error: error.message || "Failed to toggle favorite" });
    }
  });

  // POST /api/recipes/:id/cook - Log cooking a recipe and increment times cooked
  app.post("/api/recipes/:id/cook", (req, res) => {
    try {
      const { id } = req.params;
      const { rating } = req.body;
      
      const recipe = getRecipeById(id);
      if (!recipe) {
        return res.status(404).json({ error: "Recipe not found" });
      }
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Logging cook for recipe "${recipe.name}" (${id})`);
      
      const updatedRecipe = incrementRecipeCooked(id);
      
      const mealEntry = createMealHistoryEntry({
        name: recipe.name,
        mealType: (recipe.mealType === "dessert" ? "snack" : recipe.mealType) || "dinner",
        cuisine: recipe.cuisine || null,
        rating: rating || null,
        notes: `Cooked from saved recipe`,
        recipeId: id,
        cookedAt: new Date().toISOString(),
      });
      
      res.json({ recipe: updatedRecipe, mealEntry });
    } catch (error: any) {
      console.error("Log recipe cook error:", error);
      res.status(500).json({ error: error.message || "Failed to log recipe cook" });
    }
  });

  // GET /api/meals/stats - Get meal statistics (must be before /api/meals/:id routes)
  app.get("/api/meals/stats", (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Fetching meal statistics`);
      
      const allMeals = getMealHistory();
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const thisMonth = allMeals.filter(meal => {
        const cookedAt = new Date(meal.cookedAt);
        return cookedAt >= startOfMonth;
      }).length;
      
      const mostCooked = getMostCookedMeals(10);
      
      res.json({ thisMonth, mostCooked });
    } catch (error: any) {
      console.error("Get meal stats error:", error);
      res.status(500).json({ error: error.message || "Failed to get meal statistics" });
    }
  });

  // GET /api/meals - Get meal history
  app.get("/api/meals", (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Fetching meal history with limit ${limit}`);
      const meals = getMealHistory(limit);
      res.json(meals);
    } catch (error: any) {
      console.error("Get meal history error:", error);
      res.status(500).json({ error: error.message || "Failed to get meal history" });
    }
  });

  // POST /api/meals - Log a meal
  app.post("/api/meals", (req, res) => {
    try {
      const parsed = insertMealHistorySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Logging meal "${parsed.data.name}"`);
      const meal = createMealHistoryEntry({
        ...parsed.data,
        cookedAt: parsed.data.cookedAt || new Date().toISOString(),
      });
      res.json(meal);
    } catch (error: any) {
      console.error("Log meal error:", error);
      res.status(500).json({ error: error.message || "Failed to log meal" });
    }
  });

  // PUT /api/meals/:id/rating - Update meal rating
  app.put("/api/meals/:id/rating", (req, res) => {
    try {
      const { rating } = req.body;
      if (rating === undefined || rating < 1 || rating > 5) {
        return res.status(400).json({ error: "Rating must be between 1 and 5" });
      }
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Updating rating for meal ${req.params.id} to ${rating}`);
      const meal = updateMealRating(req.params.id, rating);
      if (!meal) {
        return res.status(404).json({ error: "Meal not found" });
      }
      res.json(meal);
    } catch (error: any) {
      console.error("Update meal rating error:", error);
      res.status(500).json({ error: error.message || "Failed to update rating" });
    }
  });

  // GET /api/family - Get all family members
  app.get("/api/family", (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Fetching family members`);
      const members = getFamilyMembers();
      res.json(members);
    } catch (error: any) {
      console.error("Get family members error:", error);
      res.status(500).json({ error: error.message || "Failed to get family members" });
    }
  });

  // ============================================
  // OMI AI SUMMARY ROUTES
  // ============================================

  // GET /api/omi/summaries - Get all cached summaries
  app.get("/api/omi/summaries", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 30;
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Fetching Omi summaries (limit: ${limit})`);
      const summaries = getOmiSummaries(limit);
      res.json(summaries);
    } catch (error: any) {
      console.error("Get Omi summaries error:", error);
      res.status(500).json({ error: error.message || "Failed to get summaries" });
    }
  });

  // GET /api/omi/summary/:date - Get or generate summary for a specific date
  app.get("/api/omi/summary/:date", async (req, res) => {
    try {
      const { date } = req.params;
      const forceRegenerate = req.query.regenerate === "true";
      
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
      }
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Getting Omi summary for ${date} (regenerate: ${forceRegenerate})`);
      
      const result = await generateOmiDailySummary(date, forceRegenerate);
      
      if (!result) {
        return res.status(404).json({ error: "No conversations found for this date" });
      }
      
      res.json(result);
    } catch (error: any) {
      console.error("Get Omi summary error:", error);
      res.status(500).json({ error: error.message || "Failed to get summary" });
    }
  });

  // GET /api/omi/analytics - Get conversation analytics for a date range
  app.get("/api/omi/analytics", async (req, res) => {
    try {
      const { start, end, days } = req.query;
      
      let startDate: string;
      let endDate: string;
      
      if (start && end) {
        startDate = start as string;
        endDate = end as string;
      } else {
        // Default to last N days
        const daysBack = parseInt(days as string) || 7;
        const endDateObj = new Date();
        const startDateObj = new Date();
        startDateObj.setDate(startDateObj.getDate() - daysBack);
        
        startDate = startDateObj.toISOString().split("T")[0];
        endDate = endDateObj.toISOString().split("T")[0];
      }
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Fetching Omi analytics (${startDate} to ${endDate})`);
      
      const analytics = await getConversationAnalytics(startDate, endDate);
      res.json({
        dateRange: { start: startDate, end: endDate },
        ...analytics,
      });
    } catch (error: any) {
      console.error("Get Omi analytics error:", error);
      res.status(500).json({ error: error.message || "Failed to get analytics" });
    }
  });

  // GET /api/omi/morning-briefing - Get enhanced morning briefing content
  app.get("/api/omi/morning-briefing", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Fetching Omi morning briefing enhancement`);
      const briefingData = await getMorningBriefingEnhancement();
      res.json(briefingData);
    } catch (error: any) {
      console.error("Get morning briefing enhancement error:", error);
      res.status(500).json({ error: error.message || "Failed to get morning briefing" });
    }
  });

  // GET /api/omi/recent - Test endpoint for recent memories from API
  app.get("/api/omi/recent", async (req, res) => {
    try {
      const hours = parseInt(req.query.hours as string) || 4;
      const limit = parseInt(req.query.limit as string) || 10;
      console.log(`[AUDIT] [${new Date().toISOString()}] Testing Omi API: fetching ${limit} memories from last ${hours} hours`);
      const lifelogs = await getRecentLifelogs(hours, limit);
      res.json({
        count: lifelogs.length,
        hours,
        lifelogs: lifelogs.map(l => ({
          id: l.id,
          title: l.title,
          startTime: l.startTime,
          endTime: l.endTime,
        })),
      });
    } catch (error: any) {
      console.error("Get recent memories error:", error);
      res.status(500).json({ error: error.message || "Failed to get recent memories" });
    }
  });

  // POST /api/omi/generate-summary - Manually trigger summary generation for a date
  app.post("/api/omi/generate-summary", async (req, res) => {
    try {
      const { date, forceRegenerate = false } = req.body;
      
      if (!date) {
        return res.status(400).json({ error: "Date is required" });
      }
      
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
      }
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Generating Omi summary for ${date} (force: ${forceRegenerate})`);
      
      const result = await generateOmiDailySummary(date, forceRegenerate);
      
      if (!result) {
        return res.status(404).json({ error: "No conversations found for this date" });
      }
      
      res.json({
        success: true,
        cached: result.cached,
        summary: result.summary,
      });
    } catch (error: any) {
      console.error("Generate Omi summary error:", error);
      res.status(500).json({ error: error.message || "Failed to generate summary" });
    }
  });

  // ============================================
  // OMI ENHANCED FEATURES API
  // ============================================
  
  // Daily Digest API routes
  const { 
    getOmiDigestPreferences, 
    updateOmiDigestPreferences, 
    sendDailyDigest,
    configureDigest,
    getDigestStatus 
  } = await import("./omiDigest");
  
  // Meeting Intelligence API routes
  const { 
    processMemoryAsMeeting, 
    processMemoriesForMeetings 
  } = await import("./jobs/omiMeetings");
  
  // Action Item Extractor API routes
  const { 
    processMemoryForActionItems, 
    processMemoriesForActionItems 
  } = await import("./jobs/omiActionItems");
  
  // Analytics API routes
  const { 
    runDailyAnalyticsAggregation, 
    getWeeklyTrends 
  } = await import("./jobs/omiAnalytics");
  
  // Conversation Search API routes
  const { 
    searchConversations, 
    answerConversationQuestion 
  } = await import("./jobs/omiSearch");
  
  // GET /api/omi/digest/status - Get digest configuration status
  app.get("/api/omi/digest/status", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Getting Omi digest status`);
      const status = getDigestStatus();
      const prefs = getOmiDigestPreferences();
      res.json({ ...status, preferences: prefs });
    } catch (error: any) {
      console.error("Get digest status error:", error);
      res.status(500).json({ error: error.message || "Failed to get digest status" });
    }
  });
  
  // POST /api/omi/digest/configure - Configure the daily digest
  app.post("/api/omi/digest/configure", async (req, res) => {
    try {
      const { phoneNumber, sendTime } = req.body;
      
      if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number is required" });
      }
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Configuring Omi digest for ${phoneNumber} at ${sendTime || "20:00"}`);
      const prefs = configureDigest(phoneNumber, sendTime || "20:00");
      res.json({ success: true, preferences: prefs });
    } catch (error: any) {
      console.error("Configure digest error:", error);
      res.status(500).json({ error: error.message || "Failed to configure digest" });
    }
  });
  
  // PATCH /api/omi/digest/preferences - Update digest preferences
  app.patch("/api/omi/digest/preferences", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Updating Omi digest preferences`);
      const prefs = updateOmiDigestPreferences(req.body);
      res.json({ success: true, preferences: prefs });
    } catch (error: any) {
      console.error("Update digest preferences error:", error);
      res.status(500).json({ error: error.message || "Failed to update digest preferences" });
    }
  });
  
  // POST /api/omi/digest/send - Manually trigger a digest send
  app.post("/api/omi/digest/send", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Manually triggering Omi digest`);
      const result = await sendDailyDigest();
      res.json(result);
    } catch (error: any) {
      console.error("Send digest error:", error);
      res.status(500).json({ error: error.message || "Failed to send digest" });
    }
  });
  
  // GET /api/omi/meetings - Get all meetings
  app.get("/api/omi/meetings", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      console.log(`[AUDIT] [${new Date().toISOString()}] Fetching Omi meetings (limit: ${limit})`);
      const meetings = getAllMeetings(limit);
      res.json(meetings);
    } catch (error: any) {
      console.error("Get meetings error:", error);
      res.status(500).json({ error: error.message || "Failed to get meetings" });
    }
  });
  
  // GET /api/omi/meetings/date/:date - Get meetings for a specific date
  app.get("/api/omi/meetings/date/:date", async (req, res) => {
    try {
      const { date } = req.params;
      console.log(`[AUDIT] [${new Date().toISOString()}] Fetching Omi meetings for ${date}`);
      const meetings = getMeetingsByDate(date);
      res.json(meetings);
    } catch (error: any) {
      console.error("Get meetings by date error:", error);
      res.status(500).json({ error: error.message || "Failed to get meetings" });
    }
  });
  
  // GET /api/omi/action-items - Get extracted action items
  app.get("/api/omi/action-items", async (req, res) => {
    try {
      const status = req.query.status as string;
      const limit = parseInt(req.query.limit as string) || 50;
      console.log(`[AUDIT] [${new Date().toISOString()}] Fetching Omi action items (status: ${status || "all"}, limit: ${limit})`);
      
      let items;
      if (status === "pending") {
        items = getPendingLifelogActionItems(limit);
      } else {
        items = getAllLifelogActionItems(limit);
      }
      res.json(items);
    } catch (error: any) {
      console.error("Get action items error:", error);
      res.status(500).json({ error: error.message || "Failed to get action items" });
    }
  });
  
  // POST /api/omi/action-items/extract - Extract action items from recent lifelogs
  app.post("/api/omi/action-items/extract", async (req, res) => {
    try {
      const { autoCreateTasks = true, hours = 4 } = req.body;
      console.log(`[AUDIT] [${new Date().toISOString()}] Extracting action items from last ${hours} hours`);
      
      const memories = await getRecentMemories(hours);
      const result = await processMemoriesForActionItems(memories, autoCreateTasks);
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("Extract action items error:", error);
      res.status(500).json({ error: error.message || "Failed to extract action items" });
    }
  });
  
  // GET /api/omi/weekly-trends - Get weekly conversation trends
  app.get("/api/omi/weekly-trends", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Fetching weekly trends`);
      const trends = getWeeklyTrends();
      res.json(trends);
    } catch (error: any) {
      console.error("Get weekly trends error:", error);
      res.status(500).json({ error: error.message || "Failed to get weekly trends" });
    }
  });
  
  // POST /api/omi/analytics/aggregate - Manually run analytics aggregation
  app.post("/api/omi/analytics/aggregate", async (req, res) => {
    try {
      const { hours = 24 } = req.body;
      console.log(`[AUDIT] [${new Date().toISOString()}] Running analytics aggregation for last ${hours} hours`);
      
      const memories = await getRecentMemories(hours);
      const result = await runDailyAnalyticsAggregation(memories);
      res.json(result);
    } catch (error: any) {
      console.error("Run analytics aggregation error:", error);
      res.status(500).json({ error: error.message || "Failed to run analytics" });
    }
  });
  
  // GET /api/omi/search - Search conversations
  app.get("/api/omi/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      const limit = parseInt(req.query.limit as string) || 10;
      
      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Searching conversations: "${query}"`);
      
      const memories = await getRecentMemories(72); // Search last 3 days
      const result = await searchConversations(memories, query, limit);
      res.json(result);
    } catch (error: any) {
      console.error("Search conversations error:", error);
      res.status(500).json({ error: error.message || "Failed to search conversations" });
    }
  });
  
  // POST /api/omi/ask - Ask a question about conversations
  app.post("/api/omi/ask", async (req, res) => {
    try {
      const { question, hours = 72 } = req.body;
      
      if (!question) {
        return res.status(400).json({ error: "Question is required" });
      }
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Answering question about conversations: "${question}"`);
      
      const memories = await getRecentMemories(hours);
      const result = await answerConversationQuestion(memories, question);
      res.json(result);
    } catch (error: any) {
      console.error("Answer question error:", error);
      res.status(500).json({ error: error.message || "Failed to answer question" });
    }
  });
  
  // POST /api/omi/meetings/detect - Detect meetings from recent lifelogs
  app.post("/api/omi/meetings/detect", async (req, res) => {
    try {
      const { hours = 4 } = req.body;
      console.log(`[AUDIT] [${new Date().toISOString()}] Detecting meetings from last ${hours} hours`);
      
      const memories = await getRecentMemories(hours);
      const result = await processMemoriesForMeetings(memories);
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("Detect meetings error:", error);
      res.status(500).json({ error: error.message || "Failed to detect meetings" });
    }
  });
  
  // Omi Processor API routes
  const { 
    getProcessorStatus, 
    processRecentMemories, 
    updateProcessorConfig 
  } = await import("./jobs/omiProcessor");
  
  // GET /api/omi/processor/status - Get processor status
  app.get("/api/omi/processor/status", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Getting Omi processor status`);
      const status = getProcessorStatus();
      res.json(status);
    } catch (error: any) {
      console.error("Get processor status error:", error);
      res.status(500).json({ error: error.message || "Failed to get processor status" });
    }
  });
  
  // POST /api/omi/processor/run - Manually run the processor
  app.post("/api/omi/processor/run", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Manually running Omi processor`);
      const result = await processRecentMemories();
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("Run processor error:", error);
      res.status(500).json({ error: error.message || "Failed to run processor" });
    }
  });
  
  // PATCH /api/omi/processor/config - Update processor configuration
  app.patch("/api/omi/processor/config", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Updating Omi processor config`);
      const config = updateProcessorConfig(req.body);
      res.json({ success: true, config });
    } catch (error: any) {
      console.error("Update processor config error:", error);
      res.status(500).json({ error: error.message || "Failed to update processor config" });
    }
  });

  // ============================================
  // ANTICIPATION ENGINE / MORNING BRIEFING API
  // ============================================

  const {
    getTodaysBriefing,
    generateMorningBriefing,
    formatBriefingForSMS,
    formatBriefingForDisplay,
    getAnticipationEngineStatus,
  } = await import("./jobs/anticipationEngine");

  // GET /api/briefing - Get today's morning briefing
  app.get("/api/briefing", async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === "true";
      console.log(`[AUDIT] [${new Date().toISOString()}] Getting morning briefing (refresh: ${forceRefresh})`);
      const briefing = await getTodaysBriefing(forceRefresh);
      res.json(briefing);
    } catch (error: any) {
      console.error("Get briefing error:", error);
      res.status(500).json({ error: error.message || "Failed to get briefing" });
    }
  });

  // POST /api/briefing/generate - Force generate a new briefing
  app.post("/api/briefing/generate", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Generating new morning briefing`);
      const briefing = await generateMorningBriefing();
      res.json({ success: true, briefing });
    } catch (error: any) {
      console.error("Generate briefing error:", error);
      res.status(500).json({ error: error.message || "Failed to generate briefing" });
    }
  });

  // GET /api/briefing/sms - Get briefing formatted for SMS
  app.get("/api/briefing/sms", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Getting SMS-formatted briefing`);
      const briefing = await getTodaysBriefing();
      const smsText = formatBriefingForSMS(briefing);
      res.json({ text: smsText, characterCount: smsText.length });
    } catch (error: any) {
      console.error("Get SMS briefing error:", error);
      res.status(500).json({ error: error.message || "Failed to get SMS briefing" });
    }
  });

  // GET /api/briefing/status - Get anticipation engine status
  app.get("/api/briefing/status", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Getting anticipation engine status`);
      const status = getAnticipationEngineStatus();
      res.json(status);
    } catch (error: any) {
      console.error("Get briefing status error:", error);
      res.status(500).json({ error: error.message || "Failed to get briefing status" });
    }
  });

  // ============================================
  // PATTERN DETECTION API
  // ============================================

  const { detectPatterns, getPatternSummary } = await import("./jobs/patternDetection");

  // GET /api/patterns - Detect and return patterns
  app.get("/api/patterns", async (req, res) => {
    try {
      const hours = parseInt(req.query.hours as string) || 168;
      console.log(`[AUDIT] [${new Date().toISOString()}] Detecting patterns (hours: ${hours})`);
      const patterns = await detectPatterns(hours);
      res.json(patterns);
    } catch (error: any) {
      console.error("Detect patterns error:", error);
      res.status(500).json({ error: error.message || "Failed to detect patterns" });
    }
  });

  // ============================================
  // MORNING BRIEFING SCHEDULER API
  // ============================================

  const {
    getSchedulerStatus,
    updateSchedulerConfig,
    triggerManualDelivery,
    startMorningBriefingScheduler,
    stopMorningBriefingScheduler,
  } = await import("./jobs/morningBriefingScheduler");

  // GET /api/scheduler/status - Get scheduler status
  app.get("/api/scheduler/status", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Getting scheduler status`);
      const status = getSchedulerStatus();
      res.json(status);
    } catch (error: any) {
      console.error("Get scheduler status error:", error);
      res.status(500).json({ error: error.message || "Failed to get scheduler status" });
    }
  });

  // PATCH /api/scheduler/config - Update scheduler config
  app.patch("/api/scheduler/config", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Updating scheduler config`);
      const config = updateSchedulerConfig(req.body);
      res.json({ success: true, config });
    } catch (error: any) {
      console.error("Update scheduler config error:", error);
      res.status(500).json({ error: error.message || "Failed to update scheduler config" });
    }
  });

  // POST /api/scheduler/start - Start the scheduler
  app.post("/api/scheduler/start", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Starting scheduler`);
      startMorningBriefingScheduler(req.body);
      const status = getSchedulerStatus();
      res.json({ success: true, status });
    } catch (error: any) {
      console.error("Start scheduler error:", error);
      res.status(500).json({ error: error.message || "Failed to start scheduler" });
    }
  });

  // POST /api/scheduler/stop - Stop the scheduler
  app.post("/api/scheduler/stop", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Stopping scheduler`);
      stopMorningBriefingScheduler();
      res.json({ success: true, message: "Scheduler stopped" });
    } catch (error: any) {
      console.error("Stop scheduler error:", error);
      res.status(500).json({ error: error.message || "Failed to stop scheduler" });
    }
  });

  // POST /api/scheduler/trigger - Manually trigger a briefing delivery
  app.post("/api/scheduler/trigger", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Manually triggering briefing delivery`);
      const result = await triggerManualDelivery();
      res.json(result);
    } catch (error: any) {
      console.error("Trigger delivery error:", error);
      res.status(500).json({ error: error.message || "Failed to trigger delivery" });
    }
  });

  // ============================================
  // CONVERSATION QUALITY METRICS API
  // ============================================

  // GET /api/metrics/quality - Get overall system quality metrics
  app.get("/api/metrics/quality", async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Fetching system quality metrics (days: ${days})`);
      
      const metrics = getSystemMetrics(days);
      res.json(metrics);
    } catch (error: any) {
      console.error("Get quality metrics error:", error);
      res.status(500).json({ error: error.message || "Failed to get quality metrics" });
    }
  });

  // GET /api/metrics/conversation/:id - Get quality metrics for a specific conversation
  app.get("/api/metrics/conversation/:id", async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Fetching conversation metrics for ${id}`);
      
      const metrics = getQualityMetrics(id);
      res.json(metrics);
    } catch (error: any) {
      console.error("Get conversation metrics error:", error);
      res.status(500).json({ error: error.message || "Failed to get conversation metrics" });
    }
  });

  // GET /api/metrics/tool/:name - Get success rate for a specific tool
  app.get("/api/metrics/tool/:name", async (req, res) => {
    try {
      const { name } = req.params;
      const days = parseInt(req.query.days as string) || 7;
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Fetching tool metrics for ${name} (days: ${days})`);
      
      const metrics = getToolMetrics(name, days);
      res.json(metrics);
    } catch (error: any) {
      console.error("Get tool metrics error:", error);
      res.status(500).json({ error: error.message || "Failed to get tool metrics" });
    }
  });

  // GET /api/metrics/summary - Get summary metrics for dashboard widget
  app.get("/api/metrics/summary", async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Fetching metrics summary for dashboard (days: ${days})`);
      
      const systemMetrics = getSystemMetrics(days);
      const { qualityStats } = systemMetrics;

      // Calculate metrics for dashboard
      const totalConversations = qualityStats.totalConversations || 0;

      // Success rate is already a percentage, convert to 0-1 range
      const avgToolSuccessRate = (qualityStats.overallSuccessRate || 0) / 100;

      // Get metrics from quality stats (now computed from actual data)
      const avgResponseTimeMs = qualityStats.averageResponseTimeMs || 0;
      const avgRetryRate = qualityStats.retryRate || 0;
      const avgFollowUpNeeded = qualityStats.followUpRate || 0;

      // Determine trend based on total conversations and quality metrics
      let recentTrend: "improving" | "stable" | "declining" = "stable";
      if (totalConversations > 10) {
        // Quality is improving if success rate is high, retry and follow-up rates are low
        const qualityScore = (avgToolSuccessRate * 0.5) + ((1 - avgRetryRate) * 0.25) + ((1 - avgFollowUpNeeded) * 0.25);
        if (qualityScore >= 0.75) {
          recentTrend = "improving";
        } else if (qualityScore < 0.5) {
          recentTrend = "declining";
        }
      } else if (totalConversations > 5 && avgToolSuccessRate < 0.5) {
        recentTrend = "declining";
      }

      res.json({
        totalConversations,
        avgToolSuccessRate,
        avgResponseTimeMs,
        avgRetryRate,
        avgFollowUpNeeded,
        recentTrend,
      });
    } catch (error: any) {
      console.error("Get metrics summary error:", error);
      res.status(500).json({ error: error.message || "Failed to get metrics summary" });
    }
  });

  // POST /api/metrics/feedback - Record explicit user feedback
  app.post("/api/metrics/feedback", async (req, res) => {
    try {
      const { conversationId, feedback, note, messageId } = req.body;
      
      if (!conversationId || !feedback) {
        return res.status(400).json({ error: "conversationId and feedback are required" });
      }
      
      if (!["positive", "negative", "neutral"].includes(feedback)) {
        return res.status(400).json({ error: "feedback must be positive, negative, or neutral" });
      }
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Recording feedback for ${conversationId}: ${feedback}`);
      
      recordConversationSignal(conversationId, {
        explicitFeedback: feedback,
        feedbackNote: note,
        messageId,
      });
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Record feedback error:", error);
      res.status(500).json({ error: error.message || "Failed to record feedback" });
    }
  });

  // POST /api/metrics/tool-outcome - Record tool outcome (for Python agents)
  app.post("/api/metrics/tool-outcome", async (req, res) => {
    try {
      const { conversationId, toolName, outcome, durationMs, errorMessage, messageId, memoriesUsed } = req.body;
      
      if (!conversationId || !toolName || !outcome) {
        return res.status(400).json({ error: "conversationId, toolName, and outcome are required" });
      }
      
      if (!["success", "failure", "partial", "timeout", "skipped"].includes(outcome)) {
        return res.status(400).json({ error: "Invalid outcome value" });
      }
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Recording tool outcome: ${toolName} = ${outcome}`);
      
      // Use a synthetic call ID for direct recording
      const callId = `api_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const { startToolTracking } = await import("./metricsCollector");
      startToolTracking(callId, toolName, conversationId);
      recordToolOutcome(callId, outcome, { errorMessage, messageId, memoriesUsed });
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Record tool outcome error:", error);
      res.status(500).json({ error: error.message || "Failed to record tool outcome" });
    }
  });

  // ============================================
  // MEMORY CONFIDENCE API
  // ============================================

  // GET /api/memory/confidence/stats - Get overall memory confidence stats
  app.get("/api/memory/confidence/stats", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Fetching memory confidence stats`);
      const stats = getMemoryConfidenceStats();
      res.json(stats);
    } catch (error: any) {
      console.error("Get memory confidence stats error:", error);
      res.status(500).json({ error: error.message || "Failed to get memory confidence stats" });
    }
  });

  // GET /api/memory/confidence/low - Get memories with low confidence
  app.get("/api/memory/confidence/low", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Fetching low confidence memories (limit: ${limit})`);
      const memories = getLowConfidenceMemories(limit);
      res.json(memories);
    } catch (error: any) {
      console.error("Get low confidence memories error:", error);
      res.status(500).json({ error: error.message || "Failed to get low confidence memories" });
    }
  });

  // GET /api/memory/confidence/needs-confirmation - Get memories needing confirmation
  app.get("/api/memory/confidence/needs-confirmation", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Fetching memories needing confirmation`);
      const memories = getMemoriesNeedingConfirmation();
      res.json(memories);
    } catch (error: any) {
      console.error("Get memories needing confirmation error:", error);
      res.status(500).json({ error: error.message || "Failed to get memories needing confirmation" });
    }
  });

  // GET /api/memory/confidence/high - Get high confidence memories
  app.get("/api/memory/confidence/high", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Fetching high confidence memories (limit: ${limit})`);
      const memories = getHighConfidenceMemories(limit);
      res.json(memories);
    } catch (error: any) {
      console.error("Get high confidence memories error:", error);
      res.status(500).json({ error: error.message || "Failed to get high confidence memories" });
    }
  });

  // POST /api/memory/:id/confirm - Confirm a memory is accurate
  app.post("/api/memory/:id/confirm", async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`[AUDIT] [${new Date().toISOString()}] Confirming memory: ${id}`);
      
      const memory = confirmMemory(id);
      if (!memory) {
        return res.status(404).json({ error: "Memory not found" });
      }
      
      res.json({ success: true, memory: getMemoryWithConfidence(memory) });
    } catch (error: any) {
      console.error("Confirm memory error:", error);
      res.status(500).json({ error: error.message || "Failed to confirm memory" });
    }
  });

  // POST /api/memory/:id/contradict - Mark a memory as contradicted
  app.post("/api/memory/:id/contradict", async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`[AUDIT] [${new Date().toISOString()}] Contradicting memory: ${id}`);
      
      const memory = contradictMemory(id);
      if (!memory) {
        return res.status(404).json({ error: "Memory not found" });
      }
      
      res.json({ success: true, memory: getMemoryWithConfidence(memory) });
    } catch (error: any) {
      console.error("Contradict memory error:", error);
      res.status(500).json({ error: error.message || "Failed to contradict memory" });
    }
  });

  // POST /api/memory/usage - Record memory usage in a conversation (for Python agents)
  app.post("/api/memory/usage", async (req, res) => {
    try {
      const { conversationId, messageId, memoriesUsed, memoriesConfirmed, memoriesContradicted } = req.body;
      
      if (!conversationId) {
        return res.status(400).json({ error: "conversationId is required" });
      }
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Recording memory usage for conversation ${conversationId}`);
      
      recordMemoryUsage(conversationId, {
        messageId,
        memoriesUsed,
        memoriesConfirmed,
        memoriesContradicted,
      });
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Record memory usage error:", error);
      res.status(500).json({ error: error.message || "Failed to record memory usage" });
    }
  });

  // === ENTITY AND CROSS-DOMAIN CONTEXT API ===

  // GET /api/entities/search - Search entities by label and optional type
  app.get("/api/entities/search", async (req, res) => {
    try {
      const q = req.query.q as string;
      const type = req.query.type as EntityType | undefined;
      
      if (!q || q.trim().length === 0) {
        return res.status(400).json({ error: "Search query 'q' is required" });
      }
      
      let entities = findEntitiesByLabel(q.trim());
      
      if (type) {
        const validTypes: EntityType[] = ["person", "location", "topic", "task", "memory", "calendar_event", "grocery_item", "conversation"];
        if (!validTypes.includes(type)) {
          return res.status(400).json({ 
            error: `Invalid type. Must be one of: ${validTypes.join(", ")}` 
          });
        }
        entities = entities.filter(e => e.type === type);
      }
      
      res.json({
        query: q,
        type: type || "all",
        count: entities.length,
        entities
      });
    } catch (error: any) {
      console.error("Entity search error:", error);
      res.status(500).json({ error: error.message || "Failed to search entities" });
    }
  });

  // GET /api/entities/:id - Get entity by ID with its references
  app.get("/api/entities/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const entityWithRefs = getEntityWithReferences(id);
      
      if (!entityWithRefs) {
        return res.status(404).json({ error: "Entity not found" });
      }
      
      res.json(entityWithRefs);
    } catch (error: any) {
      console.error("Get entity error:", error);
      res.status(500).json({ error: error.message || "Failed to get entity" });
    }
  });

  // GET /api/entities/:id/related - Get entities related to a given entity (via links)
  app.get("/api/entities/:id/related", async (req, res) => {
    try {
      const { id } = req.params;
      
      const entity = getEntity(id);
      if (!entity) {
        return res.status(404).json({ error: "Entity not found" });
      }
      
      const relatedEntities = getRelatedEntities(id);
      
      res.json(relatedEntities);
    } catch (error: any) {
      console.error("Get related entities error:", error);
      res.status(500).json({ error: error.message || "Failed to get related entities" });
    }
  });

  // GET /api/cross-domain/:domain/:itemId - Get all entities referenced by a specific item
  app.get("/api/cross-domain/:domain/:itemId", async (req, res) => {
    try {
      const { domain, itemId } = req.params;
      
      const validDomains: EntityDomain[] = ["memory", "task", "conversation", "contact", "location", "calendar", "grocery", "document"];
      if (!validDomains.includes(domain as EntityDomain)) {
        return res.status(400).json({ 
          error: `Invalid domain. Must be one of: ${validDomains.join(", ")}` 
        });
      }
      
      const entities = getEntitiesForItem(domain as EntityDomain, itemId);
      
      res.json({
        domain,
        itemId,
        count: entities.length,
        entities
      });
    } catch (error: any) {
      console.error("Get cross-domain entities error:", error);
      res.status(500).json({ error: error.message || "Failed to get cross-domain entities" });
    }
  });

  // GET /api/cross-domain/:domain/:itemId/related-items - Get items from other domains that share entities
  app.get("/api/cross-domain/:domain/:itemId/related-items", async (req, res) => {
    try {
      const { domain, itemId } = req.params;
      
      const validDomains: EntityDomain[] = ["memory", "task", "conversation", "contact", "location", "calendar", "grocery", "document"];
      if (!validDomains.includes(domain as EntityDomain)) {
        return res.status(400).json({ 
          error: `Invalid domain. Must be one of: ${validDomains.join(", ")}` 
        });
      }
      
      const entities = getEntitiesForItem(domain as EntityDomain, itemId);
      
      if (entities.length === 0) {
        return res.json({
          domain,
          itemId,
          sharedEntities: [],
          relatedItems: {},
          totalRelatedItems: 0
        });
      }
      
      const relatedItemsMap: Record<EntityDomain, Array<{
        itemId: string;
        confidence: string;
        context: string | null;
        sharedEntityIds: string[];
        relevanceScore: number;
      }>> = {
        memory: [],
        task: [],
        conversation: [],
        contact: [],
        location: [],
        calendar: [],
        grocery: [],
        document: []
      };
      
      const itemEntityMap = new Map<string, { 
        confidences: number[]; 
        entityIds: string[]; 
        context: string | null;
        domain: EntityDomain;
      }>();
      
      for (const entity of entities) {
        const items = getItemsRelatedToEntity(entity.id);
        
        for (const item of items) {
          if (item.domain === domain && item.itemId === itemId) {
            continue;
          }
          
          const key = `${item.domain}:${item.itemId}`;
          const existing = itemEntityMap.get(key);
          
          if (existing) {
            existing.confidences.push(parseFloat(item.confidence));
            existing.entityIds.push(entity.id);
          } else {
            itemEntityMap.set(key, {
              confidences: [parseFloat(item.confidence)],
              entityIds: [entity.id],
              context: item.context,
              domain: item.domain
            });
          }
        }
      }
      
      for (const [key, data] of Array.from(itemEntityMap.entries())) {
        const [itemDomain, relatedItemId] = key.split(":");
        const avgConfidence = data.confidences.reduce((a: number, b: number) => a + b, 0) / data.confidences.length;
        const entityCount = data.entityIds.length;
        const relevanceScore = avgConfidence * (1 + Math.log(entityCount + 1));
        
        relatedItemsMap[data.domain].push({
          itemId: relatedItemId,
          confidence: avgConfidence.toFixed(2),
          context: data.context,
          sharedEntityIds: data.entityIds,
          relevanceScore: parseFloat(relevanceScore.toFixed(3))
        });
      }
      
      for (const domainKey of Object.keys(relatedItemsMap) as EntityDomain[]) {
        relatedItemsMap[domainKey].sort((a, b) => b.relevanceScore - a.relevanceScore);
      }
      
      const totalRelatedItems = Object.values(relatedItemsMap)
        .reduce((sum, items) => sum + items.length, 0);
      
      res.json({
        domain,
        itemId,
        sharedEntities: entities.map(e => ({ id: e.id, type: e.type, label: e.label })),
        relatedItems: relatedItemsMap,
        totalRelatedItems
      });
    } catch (error: any) {
      console.error("Get related items error:", error);
      res.status(500).json({ error: error.message || "Failed to get related items" });
    }
  });

  // === KNOWLEDGE GRAPH API ===

  // GET /api/graph/query - Query the knowledge graph with natural language
  app.get("/api/graph/query", async (req, res) => {
    try {
      const query = req.query.q as string;
      const maxDepth = req.query.maxDepth ? parseInt(req.query.maxDepth as string) : 2;
      const maxNodes = req.query.maxNodes ? parseInt(req.query.maxNodes as string) : 30;
      
      if (!query || query.trim().length === 0) {
        return res.status(400).json({ error: "Query 'q' is required" });
      }
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Knowledge Graph: Query "${query}" (depth: ${maxDepth}, nodes: ${maxNodes})`);
      
      const result = await queryKnowledgeGraph(query, { maxDepth, maxNodes });
      
      res.json({
        query,
        ...result
      });
    } catch (error: any) {
      console.error("Knowledge graph query error:", error);
      res.status(500).json({ error: error.message || "Failed to query knowledge graph" });
    }
  });

  // GET /api/graph/traverse/:entityId - Traverse graph from entity
  app.get("/api/graph/traverse/:entityId", async (req, res) => {
    try {
      const { entityId } = req.params;
      const maxDepth = req.query.maxDepth ? parseInt(req.query.maxDepth as string) : 3;
      const maxNodes = req.query.maxNodes ? parseInt(req.query.maxNodes as string) : 50;
      const minScore = req.query.minScore ? parseFloat(req.query.minScore as string) : 0.1;
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Knowledge Graph: Traverse from ${entityId}`);
      
      const entity = getEntity(entityId);
      if (!entity) {
        return res.status(404).json({ error: "Entity not found" });
      }
      
      const nodes = traverseGraph(entityId, { maxDepth, maxNodes, minScore });
      
      res.json({
        startEntity: entity,
        nodes,
        count: nodes.length
      });
    } catch (error: any) {
      console.error("Graph traversal error:", error);
      res.status(500).json({ error: error.message || "Failed to traverse graph" });
    }
  });

  // GET /api/graph/neighborhood/:entityId - Get entity neighborhood with edges
  app.get("/api/graph/neighborhood/:entityId", async (req, res) => {
    try {
      const { entityId } = req.params;
      const maxDepth = req.query.maxDepth ? parseInt(req.query.maxDepth as string) : 2;
      const maxNodes = req.query.maxNodes ? parseInt(req.query.maxNodes as string) : 30;
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Knowledge Graph: Neighborhood for ${entityId}`);
      
      const neighborhood = getEntityNeighborhood(entityId, { maxDepth, maxNodes });
      
      if (!neighborhood) {
        return res.status(404).json({ error: "Entity not found" });
      }
      
      res.json(neighborhood);
    } catch (error: any) {
      console.error("Get neighborhood error:", error);
      res.status(500).json({ error: error.message || "Failed to get entity neighborhood" });
    }
  });

  // GET /api/graph/connections/:entityId - Get cross-domain connections for entity
  app.get("/api/graph/connections/:entityId", async (req, res) => {
    try {
      const { entityId } = req.params;
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Knowledge Graph: Connections for ${entityId}`);
      
      const connections = getCrossDomainConnections(entityId);
      
      if (!connections) {
        return res.status(404).json({ error: "Entity not found" });
      }
      
      res.json(connections);
    } catch (error: any) {
      console.error("Get connections error:", error);
      res.status(500).json({ error: error.message || "Failed to get cross-domain connections" });
    }
  });

  // GET /api/graph/bridging - Find entities that bridge multiple domains
  app.get("/api/graph/bridging", async (req, res) => {
    try {
      const minDomains = req.query.minDomains ? parseInt(req.query.minDomains as string) : 2;
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Knowledge Graph: Finding bridging entities (minDomains: ${minDomains})`);
      
      const bridging = findBridgingEntities(minDomains);
      
      res.json({
        minDomains,
        count: bridging.length,
        entities: bridging
      });
    } catch (error: any) {
      console.error("Find bridging entities error:", error);
      res.status(500).json({ error: error.message || "Failed to find bridging entities" });
    }
  });

  // GET /api/graph/path - Find shortest path between two entities
  app.get("/api/graph/path", async (req, res) => {
    try {
      const fromId = req.query.from as string;
      const toId = req.query.to as string;
      const maxDepth = req.query.maxDepth ? parseInt(req.query.maxDepth as string) : 5;
      
      if (!fromId || !toId) {
        return res.status(400).json({ error: "Both 'from' and 'to' entity IDs are required" });
      }
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Knowledge Graph: Finding path from ${fromId} to ${toId}`);
      
      const path = findShortestPath(fromId, toId, maxDepth);
      
      if (!path) {
        return res.json({ 
          found: false, 
          message: "No path found between entities",
          from: fromId,
          to: toId
        });
      }
      
      res.json({
        found: true,
        path,
        length: path.length
      });
    } catch (error: any) {
      console.error("Find path error:", error);
      res.status(500).json({ error: error.message || "Failed to find path" });
    }
  });

  // GET /api/graph/person/:contactId - Get full context for a person
  app.get("/api/graph/person/:contactId", async (req, res) => {
    try {
      const { contactId } = req.params;
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Knowledge Graph: Person context for ${contactId}`);
      
      const context = getPersonContext(contactId);
      
      res.json(context);
    } catch (error: any) {
      console.error("Get person context error:", error);
      res.status(500).json({ error: error.message || "Failed to get person context" });
    }
  });

  // GET /api/graph/temporal - Analyze temporal patterns
  app.get("/api/graph/temporal", async (req, res) => {
    try {
      const type = req.query.type as EntityType | undefined;
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Knowledge Graph: Temporal patterns (type: ${type || "all"}, days: ${days})`);
      
      const patterns = analyzeTemporalPatterns(type, days);
      
      res.json({
        type: type || "all",
        days,
        count: patterns.length,
        patterns
      });
    } catch (error: any) {
      console.error("Analyze temporal patterns error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze temporal patterns" });
    }
  });

  // GET /api/graph/stats - Get knowledge graph statistics
  app.get("/api/graph/stats", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Knowledge Graph: Fetching statistics`);
      
      const stats = getKnowledgeGraphStats();
      
      res.json(stats);
    } catch (error: any) {
      console.error("Get graph stats error:", error);
      res.status(500).json({ error: error.message || "Failed to get graph statistics" });
    }
  });

  // GET /api/graph/backfill/status - Get backfill status
  app.get("/api/graph/backfill/status", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Knowledge Graph: Checking backfill status`);
      const status = getBackfillStatus();
      res.json(status);
    } catch (error: any) {
      console.error("Get backfill status error:", error);
      res.status(500).json({ error: error.message || "Failed to get backfill status" });
    }
  });

  // GET /api/graph/backfill/preview - Preview what backfill would extract
  app.get("/api/graph/backfill/preview", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      console.log(`[AUDIT] [${new Date().toISOString()}] Knowledge Graph: Preview backfill (limit: ${limit})`);
      
      const preview = await previewBackfill(limit);
      res.json(preview);
    } catch (error: any) {
      console.error("Preview backfill error:", error);
      res.status(500).json({ error: error.message || "Failed to preview backfill" });
    }
  });

  // POST /api/graph/backfill - Run knowledge graph backfill
  app.post("/api/graph/backfill", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Knowledge Graph: Starting backfill...`);
      
      // Check if already running
      const status = getBackfillStatus();
      if (status.isRunning) {
        return res.status(409).json({ 
          error: "Backfill is already running",
          status
        });
      }
      
      // Run backfill (this could take a while)
      const result = await runBackfill();
      
      res.json({
        success: true,
        message: "Backfill completed successfully",
        result
      });
    } catch (error: any) {
      console.error("Run backfill error:", error);
      res.status(500).json({ error: error.message || "Failed to run backfill" });
    }
  });

  // === PROACTIVE INSIGHTS API ===

  // GET /api/insights - Get insights with optional filters
  app.get("/api/insights", async (req, res) => {
    try {
      const status = req.query.status as InsightStatus | undefined;
      const category = req.query.category as InsightCategory | undefined;
      const priority = req.query.priority as InsightPriority | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const activeOnly = req.query.active === "true";
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Fetching insights (status: ${status || "any"}, category: ${category || "any"}, limit: ${limit || "all"})`);
      
      let insights;
      if (activeOnly) {
        insights = getActiveInsights({ category, limit, priority });
      } else {
        insights = getAllInsights({ status, category, limit });
      }
      
      res.json({
        count: insights.length,
        insights
      });
    } catch (error: any) {
      console.error("Get insights error:", error);
      res.status(500).json({ error: error.message || "Failed to get insights" });
    }
  });

  // GET /api/insights/stats - Get insight statistics
  app.get("/api/insights/stats", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Fetching insight statistics`);
      const stats = getInsightStats();
      res.json(stats);
    } catch (error: any) {
      console.error("Get insight stats error:", error);
      res.status(500).json({ error: error.message || "Failed to get insight statistics" });
    }
  });

  // GET /api/insights/:id - Get single insight by ID
  app.get("/api/insights/:id", async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Fetching insight ${id}`);
      
      const insight = getInsight(id);
      if (!insight) {
        return res.status(404).json({ error: "Insight not found" });
      }
      
      res.json(insight);
    } catch (error: any) {
      console.error("Get insight error:", error);
      res.status(500).json({ error: error.message || "Failed to get insight" });
    }
  });

  // PATCH /api/insights/:id - Update insight status
  app.patch("/api/insights/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { action, priority } = req.body;
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Updating insight ${id} (action: ${action})`);
      
      let updatedInsight;
      
      switch (action) {
        case "dismiss":
          updatedInsight = dismissInsight(id);
          break;
        case "snooze":
          updatedInsight = snoozeInsight(id);
          break;
        case "complete":
          updatedInsight = completeInsight(id);
          break;
        case "update":
          if (priority) {
            updatedInsight = updateInsight(id, { priority });
          } else {
            return res.status(400).json({ error: "Priority required for update action" });
          }
          break;
        default:
          return res.status(400).json({ error: "Invalid action. Use: dismiss, snooze, complete, or update" });
      }
      
      if (!updatedInsight) {
        return res.status(404).json({ error: "Insight not found" });
      }
      
      res.json({ success: true, insight: updatedInsight });
    } catch (error: any) {
      console.error("Update insight error:", error);
      res.status(500).json({ error: error.message || "Failed to update insight" });
    }
  });

  // POST /api/insights/refresh - Trigger manual insight generation
  app.post("/api/insights/refresh", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Triggering insight generation`);
      
      const result = await generateAllInsights();
      
      res.json({
        success: true,
        created: result.created,
        skipped: result.skipped,
        byCategory: result.byCategory,
        errors: result.errors.length > 0 ? result.errors : undefined
      });
    } catch (error: any) {
      console.error("Refresh insights error:", error);
      res.status(500).json({ error: error.message || "Failed to generate insights" });
    }
  });

  // ============================================
  // FEEDBACK LEARNING SYSTEM ROUTES
  // ============================================

  // GET /api/feedback/stats - Get feedback learning statistics
  app.get("/api/feedback/stats", async (req, res) => {
    try {
      const { getLearningStats } = await import("./feedbackLearning");
      const stats = getLearningStats();
      res.json(stats);
    } catch (error: any) {
      console.error("Get feedback stats error:", error);
      res.status(500).json({ error: error.message || "Failed to get feedback statistics" });
    }
  });

  // GET /api/feedback/preferences - Get all active learned preferences
  app.get("/api/feedback/preferences", async (req, res) => {
    try {
      const { getPreferencesForContext } = await import("./feedbackLearning");
      const minConfidence = req.query.minConfidence ? parseFloat(req.query.minConfidence as string) : 0;
      const category = req.query.category as string | undefined;
      const categories = category ? [category as any] : undefined;
      const preferences = getPreferencesForContext(categories, minConfidence);
      res.json({ preferences, count: preferences.length });
    } catch (error: any) {
      console.error("Get learned preferences error:", error);
      res.status(500).json({ error: error.message || "Failed to get learned preferences" });
    }
  });

  // GET /api/feedback/preferences/prompt - Get preferences formatted for AI prompts
  app.get("/api/feedback/preferences/prompt", async (req, res) => {
    try {
      const { formatPreferencesForPrompt } = await import("./feedbackLearning");
      const category = req.query.category as string | undefined;
      const categories = category ? [category as any] : undefined;
      const prompt = formatPreferencesForPrompt(categories);
      res.json({ prompt, hasPreferences: prompt.length > 0 });
    } catch (error: any) {
      console.error("Get preferences prompt error:", error);
      res.status(500).json({ error: error.message || "Failed to format preferences for prompt" });
    }
  });

  // ============================================
  // SMART NOTIFICATION BATCHING ROUTES
  // ============================================

  // GET /api/notifications/status - Get queue status and preferences
  app.get("/api/notifications/status", async (req, res) => {
    try {
      const status = getQueueStatus();
      res.json(status);
    } catch (error: any) {
      console.error("Get notification status error:", error);
      res.status(500).json({ error: error.message || "Failed to get notification status" });
    }
  });

  // GET /api/notifications/preferences - Get notification preferences
  app.get("/api/notifications/preferences", async (req, res) => {
    try {
      const preferences = getNotificationPreferencesDb();
      res.json(preferences);
    } catch (error: any) {
      console.error("Get notification preferences error:", error);
      res.status(500).json({ error: error.message || "Failed to get notification preferences" });
    }
  });

  // PATCH /api/notifications/preferences - Update notification preferences
  app.patch("/api/notifications/preferences", async (req, res) => {
    try {
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Updating notification preferences`);
      
      const updates = req.body;
      const preferences = updateNotificationPreferencesDb(updates);
      
      // If batch interval changed, restart the scheduler
      if (updates.batchIntervalMinutes !== undefined) {
        updateBatchInterval(updates.batchIntervalMinutes);
      }
      
      res.json({ success: true, preferences });
    } catch (error: any) {
      console.error("Update notification preferences error:", error);
      res.status(500).json({ error: error.message || "Failed to update notification preferences" });
    }
  });

  // GET /api/notifications/queue - Get pending notifications
  app.get("/api/notifications/queue", async (req, res) => {
    try {
      const { phone } = req.query;
      
      let pending;
      if (phone && typeof phone === "string") {
        pending = getPendingNotificationsDb(phone);
      } else {
        pending = getAllPendingNotificationsDb();
      }
      
      res.json(pending);
    } catch (error: any) {
      console.error("Get notification queue error:", error);
      res.status(500).json({ error: error.message || "Failed to get notification queue" });
    }
  });

  // POST /api/notifications/queue - Add notification to queue
  app.post("/api/notifications/queue", async (req, res) => {
    try {
      const { recipientPhone, category, priority, title, content, sourceType, sourceId } = req.body;
      
      if (!recipientPhone || !category || !title || !content) {
        return res.status(400).json({ error: "recipientPhone, category, title, and content are required" });
      }
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Queueing notification for ${recipientPhone}`);
      
      const notification = await queueNotification({
        recipientPhone,
        category,
        priority: priority || "normal",
        title,
        content,
        sourceType,
        sourceId
      });
      
      res.json({ success: true, notification });
    } catch (error: any) {
      console.error("Queue notification error:", error);
      res.status(500).json({ error: error.message || "Failed to queue notification" });
    }
  });

  // DELETE /api/notifications/queue/:id - Remove notification from queue
  app.delete("/api/notifications/queue/:id", async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Deleting notification ${id}`);
      
      const deleted = deleteNotificationQueueItemDb(id);
      if (!deleted) {
        return res.status(404).json({ error: "Notification not found" });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete notification error:", error);
      res.status(500).json({ error: error.message || "Failed to delete notification" });
    }
  });

  // POST /api/notifications/process - Manually process pending notifications
  app.post("/api/notifications/process", async (req, res) => {
    try {
      const { phone } = req.body;
      console.log(`[AUDIT] [${new Date().toISOString()}] Web UI: Processing pending notifications`);
      
      let sent;
      if (phone) {
        sent = await processPendingNotifications(phone);
      } else {
        sent = await processAllPendingNotifications();
      }
      
      res.json({ success: true, sent });
    } catch (error: any) {
      console.error("Process notifications error:", error);
      res.status(500).json({ error: error.message || "Failed to process notifications" });
    }
  });

  // GET /api/notifications/batches - Get recent batch history
  app.get("/api/notifications/batches", async (req, res) => {
    try {
      const { phone, limit = "10" } = req.query;
      
      if (!phone || typeof phone !== "string") {
        return res.status(400).json({ error: "Phone number required" });
      }
      
      const batches = getRecentBatchesDb(phone, parseInt(limit as string) || 10);
      res.json(batches);
    } catch (error: any) {
      console.error("Get notification batches error:", error);
      res.status(500).json({ error: error.message || "Failed to get notification batches" });
    }
  });

  // ============================================
  // NATURAL LANGUAGE AUTOMATION ROUTES
  // ============================================

  // GET /api/nl-automations - Get all NL automations
  app.get("/api/nl-automations", async (req, res) => {
    try {
      const automations = getAllNLAutomationsDb();
      res.json(automations);
    } catch (error: any) {
      console.error("Get NL automations error:", error);
      res.status(500).json({ error: error.message || "Failed to get automations" });
    }
  });

  // GET /api/nl-automations/stats - Get automation statistics
  app.get("/api/nl-automations/stats", async (req, res) => {
    try {
      const stats = getNLAutomationStatsDb();
      const scheduledIds = getScheduledAutomationIds();
      res.json({ ...stats, scheduledCount: scheduledIds.length });
    } catch (error: any) {
      console.error("Get NL automation stats error:", error);
      res.status(500).json({ error: error.message || "Failed to get automation stats" });
    }
  });

  // GET /api/nl-automations/:id - Get a specific automation
  app.get("/api/nl-automations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const automation = getNLAutomationDb(id);
      
      if (!automation) {
        return res.status(404).json({ error: "Automation not found" });
      }
      
      res.json(automation);
    } catch (error: any) {
      console.error("Get NL automation error:", error);
      res.status(500).json({ error: error.message || "Failed to get automation" });
    }
  });

  // POST /api/nl-automations/parse - Parse natural language into automation
  app.post("/api/nl-automations/parse", async (req, res) => {
    try {
      const { phrase } = req.body;
      
      if (!phrase || typeof phrase !== "string") {
        return res.status(400).json({ error: "Phrase is required" });
      }
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Parsing NL automation: "${phrase}"`);
      
      const result = await parseNaturalLanguageAutomation(phrase);
      res.json(result);
    } catch (error: any) {
      console.error("Parse NL automation error:", error);
      res.status(500).json({ error: error.message || "Failed to parse automation" });
    }
  });

  // POST /api/nl-automations - Create a new automation from parsed result
  app.post("/api/nl-automations", async (req, res) => {
    try {
      const { phrase, parsed } = req.body;
      
      if (!phrase || !parsed) {
        return res.status(400).json({ error: "Phrase and parsed automation are required" });
      }
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Creating NL automation from: "${phrase}"`);
      
      const insertData = convertToInsertAutomation(phrase, parsed);
      const automation = createNLAutomationDb(insertData);
      
      if (automation.triggerType === "time") {
        scheduleTimeAutomation(automation);
      }
      
      res.json({ success: true, automation });
    } catch (error: any) {
      console.error("Create NL automation error:", error);
      res.status(500).json({ error: error.message || "Failed to create automation" });
    }
  });

  // PATCH /api/nl-automations/:id - Update an automation
  app.patch("/api/nl-automations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Updating NL automation ${id}`);
      
      const automation = updateNLAutomationDb(id, updates);
      
      if (!automation) {
        return res.status(404).json({ error: "Automation not found" });
      }
      
      if (automation.triggerType === "time") {
        if (automation.enabled) {
          scheduleTimeAutomation(automation);
        } else {
          stopNLAutomation(id);
        }
      }
      
      res.json({ success: true, automation });
    } catch (error: any) {
      console.error("Update NL automation error:", error);
      res.status(500).json({ error: error.message || "Failed to update automation" });
    }
  });

  // DELETE /api/nl-automations/:id - Delete an automation
  app.delete("/api/nl-automations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Deleting NL automation ${id}`);
      
      stopNLAutomation(id);
      const deleted = deleteNLAutomationDb(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Automation not found" });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete NL automation error:", error);
      res.status(500).json({ error: error.message || "Failed to delete automation" });
    }
  });

  // POST /api/nl-automations/:id/test - Test an automation manually
  app.post("/api/nl-automations/:id/test", async (req, res) => {
    try {
      const { id } = req.params;
      
      const automation = getNLAutomationDb(id);
      if (!automation) {
        return res.status(404).json({ error: "Automation not found" });
      }
      
      console.log(`[AUDIT] [${new Date().toISOString()}] Testing NL automation ${id}: ${automation.name}`);
      
      const result = await executeNLAutomation(automation, {
        triggerData: { type: "manual_test", timestamp: new Date().toISOString() }
      });
      
      res.json({ success: result.success, result });
    } catch (error: any) {
      console.error("Test NL automation error:", error);
      res.status(500).json({ error: error.message || "Failed to test automation" });
    }
  });

  // GET /api/nl-automations/:id/logs - Get execution logs for an automation
  app.get("/api/nl-automations/:id/logs", async (req, res) => {
    try {
      const { id } = req.params;
      const { limit = "20" } = req.query;
      
      const logs = getNLAutomationLogsDb(id, parseInt(limit as string) || 20);
      res.json(logs);
    } catch (error: any) {
      console.error("Get NL automation logs error:", error);
      res.status(500).json({ error: error.message || "Failed to get automation logs" });
    }
  });

  // ============================================
  // PREDICTION SYSTEM ENDPOINTS
  // ============================================

  // GET /api/predictions - Get all predictions (with optional filters)
  app.get("/api/predictions", async (req, res) => {
    try {
      const { status, type, limit } = req.query;
      const predictions = getAllPredictions({
        status: status as string | undefined,
        type: type as string | undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      });
      res.json(predictions);
    } catch (error: any) {
      console.error("Get predictions error:", error);
      res.status(500).json({ error: error.message || "Failed to get predictions" });
    }
  });

  // GET /api/predictions/pending - Get pending predictions
  app.get("/api/predictions/pending", async (_req, res) => {
    try {
      const predictions = getPendingPredictions();
      res.json(predictions);
    } catch (error: any) {
      console.error("Get pending predictions error:", error);
      res.status(500).json({ error: error.message || "Failed to get pending predictions" });
    }
  });

  // GET /api/predictions/stats - Get prediction statistics
  app.get("/api/predictions/stats", async (_req, res) => {
    try {
      const stats = getPredictionStats();
      res.json(stats);
    } catch (error: any) {
      console.error("Get prediction stats error:", error);
      res.status(500).json({ error: error.message || "Failed to get prediction stats" });
    }
  });

  // GET /api/predictions/:id - Get a specific prediction with details
  app.get("/api/predictions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const prediction = getPredictionWithDetails(id);
      if (!prediction) {
        return res.status(404).json({ error: "Prediction not found" });
      }
      res.json(prediction);
    } catch (error: any) {
      console.error("Get prediction error:", error);
      res.status(500).json({ error: error.message || "Failed to get prediction" });
    }
  });

  // POST /api/predictions - Create a new prediction
  app.post("/api/predictions", async (req, res) => {
    try {
      const prediction = createPrediction(req.body);
      res.json(prediction);
    } catch (error: any) {
      console.error("Create prediction error:", error);
      res.status(500).json({ error: error.message || "Failed to create prediction" });
    }
  });

  // PUT /api/predictions/:id - Update a prediction
  app.put("/api/predictions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const prediction = updatePrediction(id, req.body);
      if (!prediction) {
        return res.status(404).json({ error: "Prediction not found" });
      }
      res.json(prediction);
    } catch (error: any) {
      console.error("Update prediction error:", error);
      res.status(500).json({ error: error.message || "Failed to update prediction" });
    }
  });

  // DELETE /api/predictions/:id - Delete a prediction
  app.delete("/api/predictions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const success = deletePrediction(id);
      if (!success) {
        return res.status(404).json({ error: "Prediction not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete prediction error:", error);
      res.status(500).json({ error: error.message || "Failed to delete prediction" });
    }
  });

  // POST /api/predictions/:id/execute - Execute a prediction
  app.post("/api/predictions/:id/execute", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await predictionTools.execute_prediction({ predictionId: id });
      res.json(result);
    } catch (error: any) {
      console.error("Execute prediction error:", error);
      res.status(500).json({ error: error.message || "Failed to execute prediction" });
    }
  });

  // POST /api/predictions/:id/feedback - Record feedback for a prediction
  app.post("/api/predictions/:id/feedback", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await predictionTools.record_prediction_feedback({
        predictionId: id,
        ...req.body,
      });
      res.json(result);
    } catch (error: any) {
      console.error("Record prediction feedback error:", error);
      res.status(500).json({ error: error.message || "Failed to record feedback" });
    }
  });

  // GET /api/patterns - Get all patterns (with optional filters)
  app.get("/api/patterns", async (req, res) => {
    try {
      const { type, isActive, dataSource } = req.query;
      const patterns = getAllPatterns({
        type: type as string | undefined,
        isActive: isActive ? isActive === "true" : undefined,
        dataSource: dataSource as string | undefined,
      });
      res.json(patterns);
    } catch (error: any) {
      console.error("Get patterns error:", error);
      res.status(500).json({ error: error.message || "Failed to get patterns" });
    }
  });

  // GET /api/patterns/active - Get active patterns
  app.get("/api/patterns/active", async (_req, res) => {
    try {
      const patterns = getActivePatterns();
      res.json(patterns);
    } catch (error: any) {
      console.error("Get active patterns error:", error);
      res.status(500).json({ error: error.message || "Failed to get active patterns" });
    }
  });

  // GET /api/patterns/:id - Get a specific pattern
  app.get("/api/patterns/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const pattern = getPatternById(id);
      if (!pattern) {
        return res.status(404).json({ error: "Pattern not found" });
      }
      res.json(pattern);
    } catch (error: any) {
      console.error("Get pattern error:", error);
      res.status(500).json({ error: error.message || "Failed to get pattern" });
    }
  });

  // POST /api/patterns/discover - Discover new patterns from historical data
  app.post("/api/patterns/discover", async (req, res) => {
    try {
      const { daysBack } = req.body;
      const result = await predictionTools.discover_new_patterns({ daysBack });
      res.json(result);
    } catch (error: any) {
      console.error("Discover patterns error:", error);
      res.status(500).json({ error: error.message || "Failed to discover patterns" });
    }
  });

  // ============================================
  // VOICE PIPELINE ENDPOINTS
  // ============================================

  // GET /api/voice/status - Get voice pipeline status
  app.get("/api/voice/status", async (_req, res) => {
    try {
      const status = getVoicePipelineStatus();
      res.json(status);
    } catch (error: any) {
      console.error("Get voice status error:", error);
      res.status(500).json({ error: error.message || "Failed to get voice status" });
    }
  });

  // POST /api/voice/start - Start the voice pipeline
  app.post("/api/voice/start", async (_req, res) => {
    try {
      const success = startVoicePipeline();
      res.json({ success, status: getVoicePipelineStatus() });
    } catch (error: any) {
      console.error("Start voice pipeline error:", error);
      res.status(500).json({ error: error.message || "Failed to start voice pipeline" });
    }
  });

  // POST /api/voice/stop - Stop the voice pipeline
  app.post("/api/voice/stop", async (_req, res) => {
    try {
      stopVoicePipeline();
      res.json({ success: true, status: getVoicePipelineStatus() });
    } catch (error: any) {
      console.error("Stop voice pipeline error:", error);
      res.status(500).json({ error: error.message || "Failed to stop voice pipeline" });
    }
  });

  // POST /internal/voice-command - Process a voice command (internal use)
  // This endpoint is used by the voice pipeline to send commands to ZEKE
  app.post("/internal/voice-command", async (req, res) => {
    try {
      const validatedRequest = validateVoiceCommandRequest(req.body);
      
      if (!validatedRequest) {
        return res.status(400).json({ error: "Invalid voice command request" });
      }

      console.log(`[Voice Command] Received: "${validatedRequest.text.substring(0, 50)}..." from ${validatedRequest.source}`);

      // Convert to utterance format and process
      const result = await processVoiceCommand({
        text: validatedRequest.text,
        rawText: validatedRequest.rawText,
        startedAt: validatedRequest.startedAt,
        endedAt: validatedRequest.endedAt,
        hasWakeWord: true, // Assumed true for direct API calls
      });

      res.json(result);
    } catch (error: any) {
      console.error("Voice command error:", error);
      res.status(500).json({ error: error.message || "Failed to process voice command" });
    }
  });

  // Note: Voice pipeline is initialized in server/index.ts at startup
  // Use POST /api/voice/start to begin listening

  // ============================================
  // ZEKE REALTIME CHUNK IDEMPOTENCY LAYER
  // ============================================

  // POST /api/realtime-chunk - Process incoming realtime chunks with idempotency
  app.post("/api/realtime-chunk", (req: Request, res: Response) => {
    try {
      let idempotencyKey: string | undefined = req.body.idempotency_key;

      // Derive a deterministic key if not provided
      if (!idempotencyKey) {
        idempotencyKey = buildIdempotencyKeyFromPayload(req.body);
      }

      const { isDuplicate } = claimIdempotencyKey({
        idempotencyKey,
        userId: req.body.user_id,
        sessionId: req.body.session_id,
      });

      if (isDuplicate) {
        console.log("[IDEMPOTENCY] Duplicate key:", idempotencyKey);
        return res.status(409).json({
          ok: false,
          duplicate: true,
          idempotency_key: idempotencyKey,
          message: "This chunk has already been processed.",
        });
      }

      // FIRST-TIME PROCESSING: safe place to run side effects
      console.log("[IDEMPOTENCY] New key:", idempotencyKey);
      console.log("[CHUNK] Incoming payload:", JSON.stringify(req.body, null, 2));

      // TODO: Hook in the actual ZEKE / agent logic here.
      // e.g. call tools, update memories, enqueue jobs, etc.

      return res.json({
        ok: true,
        duplicate: false,
        idempotency_key: idempotencyKey,
        message: "Chunk processed successfully.",
      });
    } catch (err: any) {
      console.error("Error in /api/realtime-chunk:", err);
      return res.status(500).json({
        ok: false,
        error: err?.message ?? "Unknown error",
      });
    }
  });

  // GET /api/realtime-chunk/status - Health check and stats for idempotency layer
  app.get("/api/realtime-chunk/status", (_req: Request, res: Response) => {
    res.json({
      status: "running",
      message: "ZEKE idempotency layer is running.",
      processedKeysCount: getProcessedKeysCount(),
    });
  });

  // ============================================
  // INTEGRATIONS STATUS ENDPOINT
  // ============================================

  // GET /api/integrations/status - Get integration status for admin panel
  app.get("/api/integrations/status", async (_req, res) => {
    try {
      const domain = process.env.ZEKE_PRODUCTION_DOMAIN || "zekeai.replit.app";

      const webhooks = [
        {
          name: "Omi Conversation Events",
          path: "/api/omi/memory-trigger",
          method: "POST",
          description: "Triggers after each conversation ends. Extracts people, topics, action items, and insights.",
        },
        {
          name: "Omi Real-time Transcript",
          path: "/api/omi/transcript",
          method: "POST",
          description: "Receives live transcript segments during Omi conversations.",
        },
        {
          name: "Omi Audio Bytes",
          path: "/api/omi/audio-bytes",
          method: "POST",
          description: "Receives raw PCM16 audio bytes. Query params: sample_rate (default 16000), uid. Content-Type: application/octet-stream",
        },
        {
          name: "Omi Day Summary",
          path: "/api/omi/day-summary",
          method: "POST",
          description: "Receives daily summary when generated by Omi.",
        },
        {
          name: "Omi Chat Query",
          path: "/api/omi/query",
          method: "POST",
          description: "Allows Omi to query ZEKE's knowledge base during chat.",
        },
        {
          name: "Twilio SMS Webhook",
          path: "/api/twilio/webhook",
          method: "POST",
          description: "Receives incoming SMS messages from Twilio. Set as your Twilio phone number's webhook URL.",
        },
        {
          name: "Twilio Status Callback",
          path: "/api/twilio/status",
          method: "POST",
          description: "Receives SMS/call delivery status updates from Twilio.",
        },
        {
          name: "Twilio Voice Webhook",
          path: "/api/twilio/voice",
          method: "POST",
          description: "Receives incoming phone calls from Twilio. Set as your Twilio phone number's Voice webhook URL.",
        },
        {
          name: "Overland GPS",
          path: "/api/location/overland",
          method: "POST",
          description: "Receives GPS location data from Overland app. Configure this URL in Overland settings.",
        },
      ];

      const apiKeys = [
        {
          name: "OpenAI API Key",
          envVar: "OPENAI_API_KEY",
          configured: !!process.env.OPENAI_API_KEY,
          description: "Required for AI responses and embeddings",
          required: true,
        },
        {
          name: "Twilio Account SID",
          envVar: "TWILIO_ACCOUNT_SID",
          configured: !!process.env.TWILIO_ACCOUNT_SID,
          description: "Twilio account identifier for SMS",
          required: false,
        },
        {
          name: "Twilio Auth Token",
          envVar: "TWILIO_AUTH_TOKEN",
          configured: !!process.env.TWILIO_AUTH_TOKEN,
          description: "Twilio authentication token",
          required: false,
        },
        {
          name: "Twilio Phone Number",
          envVar: "TWILIO_PHONE_NUMBER",
          configured: !!process.env.TWILIO_PHONE_NUMBER,
          description: "Your Twilio phone number for sending SMS",
          required: false,
        },
        {
          name: "Omi Developer API Key",
          envVar: "OMI_DEV_API_KEY",
          configured: !!process.env.OMI_DEV_API_KEY,
          description: "API key for direct Omi API access (memories, conversations, action items)",
          required: false,
        },
        {
          name: "OpenWeatherMap API Key",
          envVar: "OPENWEATHERMAP_API_KEY",
          configured: !!process.env.OPENWEATHERMAP_API_KEY,
          description: "API key for weather data",
          required: false,
        },
        {
          name: "Perplexity API Key",
          envVar: "PERPLEXITY_API_KEY",
          configured: !!process.env.PERPLEXITY_API_KEY,
          description: "API key for enhanced web search",
          required: false,
        },
        {
          name: "Master Admin Phone",
          envVar: "MASTER_ADMIN_PHONE",
          configured: !!process.env.MASTER_ADMIN_PHONE,
          description: "Phone number for admin notifications",
          required: false,
        },
        {
          name: "Internal Bridge Key",
          envVar: "INTERNAL_BRIDGE_KEY",
          configured: !!process.env.INTERNAL_BRIDGE_KEY,
          description: "Internal service communication key",
          required: false,
        },
        {
          name: "Session Secret",
          envVar: "SESSION_SECRET",
          configured: !!process.env.SESSION_SECRET,
          description: "Session encryption key",
          required: true,
        },
      ];

      const services = [
        {
          name: "OpenAI",
          icon: "openai",
          status: process.env.OPENAI_API_KEY ? "connected" : "not_configured",
          description: "AI responses, embeddings, and text generation",
          requiredKeys: ["OPENAI_API_KEY"],
        },
        {
          name: "Twilio SMS",
          icon: "twilio",
          status: (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) 
            ? "connected" 
            : (process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_AUTH_TOKEN) 
              ? "partial" 
              : "not_configured",
          description: "Send and receive SMS messages",
          requiredKeys: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"],
        },
        {
          name: "Omi Pendant",
          icon: "omi",
          status: (process.env.OMI_API_KEY || process.env.OMI_DEV_API_KEY) ? "connected" : "not_configured",
          description: "Voice conversation recording and analysis",
          requiredKeys: ["OMI_API_KEY"],
        },
        {
          name: "Google Calendar",
          icon: "calendar",
          status: process.env.REPLIT_CONNECTORS_HOSTNAME ? "connected" : "not_configured",
          description: "Calendar events and scheduling via Replit connector",
          requiredKeys: [],
        },
        {
          name: "Weather",
          icon: "weather",
          status: process.env.OPENWEATHERMAP_API_KEY ? "connected" : "not_configured",
          description: "Weather forecasts and alerts",
          requiredKeys: ["OPENWEATHERMAP_API_KEY"],
        },
      ];

      res.json({
        domain,
        webhooks,
        apiKeys,
        services,
      });
    } catch (error: any) {
      console.error("Get integrations status error:", error);
      res.status(500).json({ error: error.message || "Failed to get integrations status" });
    }
  });
  
  // ============================================
  // FILE UPLOAD ROUTES
  // ============================================
  
  // Configure multer for file uploads
  const uploadDir = path.join(process.cwd(), "uploads");
  if (!fsNode.existsSync(uploadDir)) {
    fsNode.mkdirSync(uploadDir, { recursive: true });
  }
  
  const fileStorage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${require("uuid").v4()}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    }
  });
  
  const fileUpload = multer({
    storage: fileStorage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
    fileFilter: (req, file, cb) => {
      const allowedTypes = [
        "image/jpeg", "image/png", "image/gif", "image/webp",
        "application/pdf"
      ];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: jpg, png, gif, webp, pdf`));
      }
    }
  });
  
  // Helper to determine file type from mimetype
  function getFileType(mimetype: string): UploadedFileType {
    if (mimetype.startsWith("image/")) return "image";
    if (mimetype === "application/pdf") return "pdf";
    return "other";
  }
  
  // POST /api/files - Upload a file
  app.post("/api/files", fileUpload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      const { conversationId } = req.body;
      
      const uploadedFile = createUploadedFile({
        originalName: req.file.originalname,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        filePath: req.file.path,
        fileType: getFileType(req.file.mimetype),
        conversationId: conversationId || null,
        processingStatus: "pending",
      });
      
      console.log(`[FILE UPLOAD] Created file ${uploadedFile.id}: ${req.file.originalname}`);
      res.status(201).json(uploadedFile);
    } catch (error: any) {
      console.error("[FILE UPLOAD] Error:", error);
      if (error.message?.includes("Invalid file type")) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: error.message || "Failed to upload file" });
    }
  });
  
  // GET /api/files - List all files
  app.get("/api/files", async (req: Request, res: Response) => {
    try {
      const { conversationId } = req.query;
      
      let files;
      if (conversationId && typeof conversationId === "string") {
        files = getUploadedFilesByConversation(conversationId);
      } else {
        files = getAllUploadedFiles();
      }
      
      res.json(files);
    } catch (error: any) {
      console.error("[FILE LIST] Error:", error);
      res.status(500).json({ error: error.message || "Failed to list files" });
    }
  });
  
  // GET /api/files/:id - Get file metadata
  app.get("/api/files/:id", async (req: Request, res: Response) => {
    try {
      const file = getUploadedFile(req.params.id);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      res.json(file);
    } catch (error: any) {
      console.error("[FILE GET] Error:", error);
      res.status(500).json({ error: error.message || "Failed to get file" });
    }
  });
  
  // GET /api/files/:id/content - Stream file binary
  app.get("/api/files/:id/content", async (req: Request, res: Response) => {
    try {
      const file = getUploadedFile(req.params.id);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      if (!fsNode.existsSync(file.filePath)) {
        return res.status(404).json({ error: "File content not found on disk" });
      }
      
      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Content-Disposition", `inline; filename="${file.originalName}"`);
      
      const fileStream = fsNode.createReadStream(file.filePath);
      fileStream.pipe(res);
    } catch (error: any) {
      console.error("[FILE CONTENT] Error:", error);
      res.status(500).json({ error: error.message || "Failed to stream file" });
    }
  });
  
  // DELETE /api/files/:id - Delete a file
  app.delete("/api/files/:id", async (req: Request, res: Response) => {
    try {
      const file = getUploadedFile(req.params.id);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      // Delete from disk
      if (fsNode.existsSync(file.filePath)) {
        fsNode.unlinkSync(file.filePath);
      }
      
      // Delete from database
      deleteUploadedFile(req.params.id);
      
      console.log(`[FILE DELETE] Deleted file ${req.params.id}: ${file.originalName}`);
      res.json({ success: true, message: "File deleted" });
    } catch (error: any) {
      console.error("[FILE DELETE] Error:", error);
      res.status(500).json({ error: error.message || "Failed to delete file" });
    }
  });
  
  // ============================================
  // JOURNAL ROUTES
  // ============================================

  // GET /api/journal - Get all journal entries
  app.get("/api/journal", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 30;
      const offset = parseInt(req.query.offset as string) || 0;
      const entries = getJournalEntries(limit, offset);
      res.json(entries);
    } catch (error: any) {
      console.error("[JOURNAL] Error getting entries:", error);
      res.status(500).json({ error: error.message || "Failed to get journal entries" });
    }
  });

  // GET /api/journal/status - Get scheduler status
  app.get("/api/journal/status", async (_req: Request, res: Response) => {
    try {
      const status = getJournalSchedulerStatus();
      res.json(status);
    } catch (error: any) {
      console.error("[JOURNAL] Error getting status:", error);
      res.status(500).json({ error: error.message || "Failed to get journal status" });
    }
  });

  // GET /api/journal/date/:date - Get entry by date
  app.get("/api/journal/date/:date", async (req: Request, res: Response) => {
    try {
      const { date } = req.params;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
      }
      const entry = getJournalEntryByDate(date);
      if (!entry) {
        return res.status(404).json({ error: "No journal entry for this date" });
      }
      res.json(entry);
    } catch (error: any) {
      console.error("[JOURNAL] Error getting entry by date:", error);
      res.status(500).json({ error: error.message || "Failed to get journal entry" });
    }
  });

  // GET /api/journal/:id - Get entry by ID
  app.get("/api/journal/:id", async (req: Request, res: Response) => {
    try {
      const entry = getJournalEntryById(req.params.id);
      if (!entry) {
        return res.status(404).json({ error: "Journal entry not found" });
      }
      res.json(entry);
    } catch (error: any) {
      console.error("[JOURNAL] Error getting entry by ID:", error);
      res.status(500).json({ error: error.message || "Failed to get journal entry" });
    }
  });

  // POST /api/journal/generate - Manually trigger summary generation
  app.post("/api/journal/generate", async (req: Request, res: Response) => {
    try {
      const date = req.body.date || new Date().toISOString().split("T")[0];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
      }
      console.log(`[JOURNAL] Generating entry for ${date}`);
      const entry = await generateJournalEntry(date);
      if (!entry) {
        return res.status(500).json({ error: "Failed to generate journal entry" });
      }
      res.json(entry);
    } catch (error: any) {
      console.error("[JOURNAL] Error generating entry:", error);
      res.status(500).json({ error: error.message || "Failed to generate journal entry" });
    }
  });

  // Register Omi integration routes
  registerOmiRoutes(app);

  // === GitHub Webhook for ZEKEapp Sync ===
  
  // Configuration for GitHub repo sync
  const GITHUB_SYNC_CONFIG = {
    repos: [
      { owner: 'Johnsonbros', repo: 'ZEKEapp', targetPath: './android' }
    ]
  };

  // POST /api/github/webhook - Handle GitHub push events
  app.post("/api/github/webhook", async (req: Request, res: Response) => {
    try {
      const event = req.headers['x-github-event'] as string;
      const payload = req.body;

      console.log(`[GitHub Webhook] Received event: ${event}`);

      // Only handle push events
      if (event !== 'push') {
        return res.json({ status: 'ignored', reason: `Event type '${event}' not handled` });
      }

      const repoFullName = payload.repository?.full_name;
      const branch = payload.ref?.replace('refs/heads/', '');
      
      console.log(`[GitHub Webhook] Push to ${repoFullName} on branch ${branch}`);

      // Find matching repo config
      const repoConfig = GITHUB_SYNC_CONFIG.repos.find(
        r => `${r.owner}/${r.repo}`.toLowerCase() === repoFullName?.toLowerCase()
      );

      if (!repoConfig) {
        console.log(`[GitHub Webhook] No sync configured for ${repoFullName}`);
        return res.json({ status: 'ignored', reason: `Repository ${repoFullName} not configured for sync` });
      }

      // Only sync main/master branch
      if (branch !== 'main' && branch !== 'master') {
        return res.json({ status: 'ignored', reason: `Branch ${branch} not synced (only main/master)` });
      }

      // Perform sync
      console.log(`[GitHub Webhook] Syncing ${repoFullName} to ${repoConfig.targetPath}...`);
      const result = await syncGitHubRepo(repoConfig.owner, repoConfig.repo, repoConfig.targetPath);

      if (result.success) {
        console.log(`[GitHub Webhook] Sync successful: ${result.message}`);
        res.json({ status: 'success', message: result.message });
      } else {
        console.error(`[GitHub Webhook] Sync failed: ${result.message}`);
        res.status(500).json({ status: 'error', message: result.message });
      }
    } catch (error: any) {
      console.error("[GitHub Webhook] Error:", error);
      res.status(500).json({ status: 'error', message: error.message || 'Unknown error' });
    }
  });

  // GET /api/github/sync-status - Check sync status and trigger manual sync
  app.get("/api/github/sync-status", async (req: Request, res: Response) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const statuses = GITHUB_SYNC_CONFIG.repos.map(config => {
        const targetPath = path.resolve(config.targetPath);
        const gitPath = path.join(targetPath, '.git');
        const exists = fs.existsSync(targetPath);
        const isGitRepo = fs.existsSync(gitPath);
        
        return {
          repo: `${config.owner}/${config.repo}`,
          targetPath: config.targetPath,
          cloned: exists && isGitRepo,
          exists
        };
      });

      res.json({
        webhookUrl: `${process.env.REPLIT_DEV_DOMAIN || 'your-replit-url'}/api/github/webhook`,
        repos: statuses
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to get sync status' });
    }
  });

  // POST /api/github/sync - Manually trigger sync for all configured repos
  app.post("/api/github/sync", async (req: Request, res: Response) => {
    try {
      const results = [];
      
      for (const config of GITHUB_SYNC_CONFIG.repos) {
        const result = await syncGitHubRepo(config.owner, config.repo, config.targetPath);
        results.push({
          repo: `${config.owner}/${config.repo}`,
          ...result
        });
      }

      res.json({ results });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to sync repos' });
    }
  });

  // POST /api/github/push - Push local changes to GitHub
  app.post("/api/github/push", async (req: Request, res: Response) => {
    try {
      const { message } = req.body;
      const commitMessage = message || `Update from ZEKE - ${new Date().toISOString()}`;
      const results = [];
      
      for (const config of GITHUB_SYNC_CONFIG.repos) {
        const result = await pushToGitHub(config.owner, config.repo, config.targetPath, commitMessage);
        results.push({
          repo: `${config.owner}/${config.repo}`,
          ...result
        });
      }

      res.json({ results });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to push to GitHub' });
    }
  });

  // POST /api/github/create-webhook - Create webhook on GitHub repos
  app.post("/api/github/create-webhook", async (req: Request, res: Response) => {
    try {
      const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPL_SLUG + '.replit.dev';
      const webhookUrl = `https://${domain}/api/github/webhook`;
      const results = [];
      
      for (const config of GITHUB_SYNC_CONFIG.repos) {
        const result = await createGitHubWebhook(config.owner, config.repo, webhookUrl);
        results.push({
          repo: `${config.owner}/${config.repo}`,
          webhookUrl,
          ...result
        });
      }

      res.json({ results });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to create webhook' });
    }
  });

  // ============================================
  // ======== AI USAGE LOGGING API ==============
  // ============================================
  
  // GET /api/ai-logs - Get recent AI logs with optional filters
  app.get("/api/ai-logs", (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const model = req.query.model as string;
      const agentId = req.query.agent_id as string;
      
      let logs;
      if (model) {
        logs = getAiLogsByModel(model, limit);
      } else if (agentId) {
        logs = getAiLogsByAgent(agentId, limit);
      } else {
        logs = getRecentAiLogs(limit);
      }
      
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch AI logs' });
    }
  });
  
  // GET /api/ai-logs/stats/today - Get today's AI usage stats
  app.get("/api/ai-logs/stats/today", (req: Request, res: Response) => {
    try {
      const stats = getTodayAiUsageStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch AI stats' });
    }
  });
  
  // GET /api/ai-logs/stats/week - Get this week's AI usage stats
  app.get("/api/ai-logs/stats/week", (req: Request, res: Response) => {
    try {
      const stats = getWeekAiUsageStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch AI stats' });
    }
  });
  
  // GET /api/ai-logs/stats - Get AI usage stats for a custom date range
  app.get("/api/ai-logs/stats", (req: Request, res: Response) => {
    try {
      const startDate = req.query.start_date as string;
      const endDate = req.query.end_date as string;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'start_date and end_date are required' });
      }
      
      const stats = getAiUsageStats(startDate, endDate);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch AI stats' });
    }
  });
  
  // GET /api/ai-logs/anomalies - Detect cost and performance anomalies
  app.get("/api/ai-logs/anomalies", (req: Request, res: Response) => {
    try {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      
      const currentStats = getAiUsageStats(
        yesterday.toISOString(),
        today.toISOString()
      );
      const previousStats = getAiUsageStats(
        twoDaysAgo.toISOString(),
        yesterday.toISOString()
      );
      
      const anomalies = detectAnomalies(currentStats, previousStats);
      res.json({ anomalies, currentStats, previousStats });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to detect anomalies' });
    }
  });
  
  // GET /api/ai-logs/models - Get list of distinct models used
  app.get("/api/ai-logs/models", (req: Request, res: Response) => {
    try {
      const models = getDistinctModels();
      res.json(models);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch models' });
    }
  });
  
  // GET /api/ai-logs/agents - Get list of distinct agents
  app.get("/api/ai-logs/agents", (req: Request, res: Response) => {
    try {
      const agents = getDistinctAgents();
      res.json(agents);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch agents' });
    }
  });
  
  // POST /api/ai-logs/cleanup - Cleanup old logs
  app.post("/api/ai-logs/cleanup", (req: Request, res: Response) => {
    try {
      const daysToKeep = parseInt(req.body.days_to_keep) || 30;
      const deleted = cleanupOldAiLogs(daysToKeep);
      res.json({ deleted, daysKept: daysToKeep });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to cleanup logs' });
    }
  });
  
  // GET /api/ai-logs/alerts/config - Get current anomaly alert configuration
  app.get("/api/ai-logs/alerts/config", (req: Request, res: Response) => {
    try {
      const config = getAnomalyAlertConfig();
      res.json(config);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to get alert config' });
    }
  });
  
  // PATCH /api/ai-logs/alerts/config - Update anomaly alert configuration
  app.patch("/api/ai-logs/alerts/config", (req: Request, res: Response) => {
    try {
      const { enabled, minSeverity, cooldownMinutes } = req.body;
      const updates: any = {};
      
      if (typeof enabled === 'boolean') updates.enabled = enabled;
      if (minSeverity && ['info', 'warning', 'critical'].includes(minSeverity)) {
        updates.minSeverity = minSeverity;
      }
      if (typeof cooldownMinutes === 'number' && cooldownMinutes > 0) {
        updates.cooldownMinutes = cooldownMinutes;
      }
      
      configureAnomalyAlerts(updates);
      res.json({ success: true, config: getAnomalyAlertConfig() });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update alert config' });
    }
  });
  
  // POST /api/ai-logs/alerts/check - Manually trigger anomaly check
  app.post("/api/ai-logs/alerts/check", async (req: Request, res: Response) => {
    try {
      const anomalies = await checkAndAlertAnomalies();
      res.json({ 
        checked: true, 
        anomaliesFound: anomalies.length,
        anomalies 
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to check anomalies' });
    }
  });
  
  // POST /api/ai-logs - Log an AI event (for Python bridge)
  app.post("/api/ai-logs", (req: Request, res: Response) => {
    try {
      const eventData = req.body;
      const id = logAiEvent({
        model: eventData.model,
        endpoint: eventData.endpoint,
        timestamp: eventData.timestamp,
        requestId: eventData.request_id,
        agentId: eventData.agent_id,
        toolName: eventData.tool_name,
        conversationId: eventData.conversation_id,
        inputTokens: eventData.input_tokens,
        outputTokens: eventData.output_tokens,
        totalTokens: eventData.total_tokens,
        inputCostCents: eventData.input_cost_cents,
        outputCostCents: eventData.output_cost_cents,
        totalCostCents: eventData.total_cost_cents,
        latencyMs: eventData.latency_ms,
        temperature: eventData.temperature,
        maxTokens: eventData.max_tokens,
        systemPromptHash: eventData.system_prompt_hash,
        toolsEnabled: eventData.tools_enabled,
        appVersion: eventData.app_version,
        status: eventData.status || 'ok',
        errorType: eventData.error_type,
        errorMessage: eventData.error_message,
      });
      res.json({ id, success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to log AI event' });
    }
  });
  
  return httpServer;
}

// Helper function to escape XML special characters
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

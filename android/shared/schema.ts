import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const devices = pgTable("devices", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  name: text("name").notNull(),
  type: text("type").notNull(),
  macAddress: text("mac_address"),
  batteryLevel: integer("battery_level"),
  signalStrength: integer("signal_strength"),
  firmwareVersion: text("firmware_version"),
  isConnected: boolean("is_connected").default(false).notNull(),
  lastHeartbeat: timestamp("last_heartbeat"),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const memories = pgTable(
  "memories",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    deviceId: varchar("device_id").references(() => devices.id).notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    transcript: text("transcript").notNull(),
    speakers: jsonb("speakers"),
    actionItems: jsonb("action_items"),
    duration: integer("duration").notNull(),
    isStarred: boolean("is_starred").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    memoriesDeviceCreatedAtIdx: index("memories_device_created_at_idx").on(
      table.deviceId,
      table.createdAt,
    ),
    memoriesDeviceUpdatedAtIdx: index("memories_device_updated_at_idx").on(
      table.deviceId,
      table.updatedAt,
    ),
    memoriesStarredCreatedAtIdx: index("memories_starred_created_at_idx").on(
      table.isStarred,
      table.createdAt,
    ),
    memoriesUpdatedAtIdx: index("memories_updated_at_idx").on(table.updatedAt),
  }),
);

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    title: text("title"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    chatSessionsUpdatedAtIdx: index("chat_sessions_updated_at_idx").on(
      table.updatedAt,
    ),
  }),
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    sessionId: varchar("session_id")
      .references(() => chatSessions.id)
      .notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    chatMessagesSessionCreatedAtIdx: index(
      "chat_messages_session_created_at_idx",
    ).on(table.sessionId, table.createdAt),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  devices: many(devices),
}));

export const devicesRelations = relations(devices, ({ one, many }) => ({
  user: one(users, {
    fields: [devices.userId],
    references: [users.id],
  }),
  memories: many(memories),
  speakers: many(speakerProfiles),
}));

export const memoriesRelations = relations(memories, ({ one }) => ({
  device: one(devices, {
    fields: [memories.deviceId],
    references: [devices.id],
  }),
}));

export const chatSessionsRelations = relations(chatSessions, ({ many }) => ({
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, {
    fields: [chatMessages.sessionId],
    references: [chatSessions.id],
  }),
}));

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertDeviceSchema = createInsertSchema(devices).omit({
  id: true,
  createdAt: true,
});

export const insertMemorySchema = createInsertSchema(memories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChatSessionSchema = createInsertSchema(chatSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Device = typeof devices.$inferSelect;

export type InsertMemory = z.infer<typeof insertMemorySchema>;
export type Memory = typeof memories.$inferSelect;

export type InsertChatSession = z.infer<typeof insertChatSessionSchema>;
export type ChatSession = typeof chatSessions.$inferSelect;

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

export const locations = pgTable("locations", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  latitude: text("latitude").notNull(),
  longitude: text("longitude").notNull(),
  altitude: text("altitude"),
  accuracy: text("accuracy"),
  heading: text("heading"),
  speed: text("speed"),
  city: text("city"),
  region: text("region"),
  country: text("country"),
  street: text("street"),
  postalCode: text("postal_code"),
  formattedAddress: text("formatted_address"),
  isStarred: boolean("is_starred").default(false).notNull(),
  label: text("label"),
  recordedAt: timestamp("recorded_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const starredPlaces = pgTable("starred_places", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  name: text("name").notNull(),
  latitude: text("latitude").notNull(),
  longitude: text("longitude").notNull(),
  city: text("city"),
  region: text("region"),
  country: text("country"),
  formattedAddress: text("formatted_address"),
  icon: text("icon"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const locationsRelations = relations(locations, ({ one }) => ({
  user: one(users, {
    fields: [locations.userId],
    references: [users.id],
  }),
}));

export const starredPlacesRelations = relations(starredPlaces, ({ one }) => ({
  user: one(users, {
    fields: [starredPlaces.userId],
    references: [users.id],
  }),
}));

export const insertLocationSchema = createInsertSchema(locations).omit({
  id: true,
  createdAt: true,
});

export const insertStarredPlaceSchema = createInsertSchema(starredPlaces).omit({
  id: true,
  createdAt: true,
});

export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type LocationRecord = typeof locations.$inferSelect;

export type InsertStarredPlace = z.infer<typeof insertStarredPlaceSchema>;
export type StarredPlace = typeof starredPlaces.$inferSelect;

export const deviceTokens = pgTable("device_tokens", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(),
  deviceId: varchar("device_id").notNull().unique(),
  deviceName: text("device_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at").defaultNow().notNull(),
});

export const pairingCodes = pgTable("pairing_codes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  sessionId: text("session_id").notNull().unique(),
  code: text("code").notNull(),
  deviceName: text("device_name").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDeviceTokenSchema = createInsertSchema(deviceTokens).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
});

export const insertPairingCodeSchema = createInsertSchema(pairingCodes).omit({
  id: true,
  createdAt: true,
});

export type InsertDeviceToken = z.infer<typeof insertDeviceTokenSchema>;
export type DeviceToken = typeof deviceTokens.$inferSelect;

export type InsertPairingCode = z.infer<typeof insertPairingCodeSchema>;
export type PairingCode = typeof pairingCodes.$inferSelect;

export const userLists = pgTable("user_lists", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  listType: text("list_type").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const listItems = pgTable("list_items", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  listId: varchar("list_id").references(() => userLists.id).notNull(),
  content: text("content").notNull(),
  isCompleted: boolean("is_completed").default(false).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const transcriptSessions = pgTable("transcript_sessions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  sessionId: text("session_id").notNull(),
  segments: jsonb("segments").default([]).notNull(),
  lastProcessedAt: timestamp("last_processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const speakerProfiles = pgTable("speaker_profiles", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  deviceId: varchar("device_id").references(() => devices.id).notNull(),
  name: text("name").notNull(),
  externalSpeakerId: integer("external_speaker_id"),
  voiceCharacteristics: jsonb("voice_characteristics"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userListsRelations = relations(userLists, ({ many }) => ({
  items: many(listItems),
}));

export const listItemsRelations = relations(listItems, ({ one }) => ({
  list: one(userLists, {
    fields: [listItems.listId],
    references: [userLists.id],
  }),
}));

export const speakerProfilesRelations = relations(speakerProfiles, ({ one }) => ({
  device: one(devices, {
    fields: [speakerProfiles.deviceId],
    references: [devices.id],
  }),
}));

export const insertUserListSchema = createInsertSchema(userLists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertListItemSchema = createInsertSchema(listItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTranscriptSessionSchema = createInsertSchema(transcriptSessions).omit({
  id: true,
  createdAt: true,
});

export const insertSpeakerProfileSchema = createInsertSchema(speakerProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserList = z.infer<typeof insertUserListSchema>;
export type UserList = typeof userLists.$inferSelect;

export type InsertListItem = z.infer<typeof insertListItemSchema>;
export type ListItem = typeof listItems.$inferSelect;

export type InsertTranscriptSession = z.infer<typeof insertTranscriptSessionSchema>;
export type TranscriptSession = typeof transcriptSessions.$inferSelect;

export type InsertSpeakerProfile = z.infer<typeof insertSpeakerProfileSchema>;
export type SpeakerProfile = typeof speakerProfiles.$inferSelect;

// Limitless API credentials
export const limitlessCredentials = pgTable("limitless_credentials", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  deviceId: varchar("device_id").references(() => devices.id),
  apiKey: text("api_key").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Conversation sessions for wearable transcripts
export const conversationSessions = pgTable("conversation_sessions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  deviceId: varchar("device_id").references(() => devices.id).notNull(),
  externalId: text("external_id"),
  source: text("source").notNull(),
  status: text("status").default("active").notNull(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  transcript: text("transcript"),
  speakers: jsonb("speakers"),
  metadata: jsonb("metadata"),
  memoryId: varchar("memory_id").references(() => memories.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Offline sync queue for audio recordings
export const offlineSyncQueue = pgTable("offline_sync_queue", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  deviceId: varchar("device_id").references(() => devices.id).notNull(),
  recordingType: text("recording_type").notNull(),
  audioPath: text("audio_path"),
  audioData: text("audio_data"),
  duration: integer("duration"),
  priority: integer("priority").default(0).notNull(),
  status: text("status").default("pending").notNull(),
  retryCount: integer("retry_count").default(0).notNull(),
  errorMessage: text("error_message"),
  recordedAt: timestamp("recorded_at").notNull(),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const limitlessCredentialsRelations = relations(limitlessCredentials, ({ one }) => ({
  device: one(devices, {
    fields: [limitlessCredentials.deviceId],
    references: [devices.id],
  }),
}));

export const conversationSessionsRelations = relations(conversationSessions, ({ one }) => ({
  device: one(devices, {
    fields: [conversationSessions.deviceId],
    references: [devices.id],
  }),
  memory: one(memories, {
    fields: [conversationSessions.memoryId],
    references: [memories.id],
  }),
}));

export const offlineSyncQueueRelations = relations(offlineSyncQueue, ({ one }) => ({
  device: one(devices, {
    fields: [offlineSyncQueue.deviceId],
    references: [devices.id],
  }),
}));

export const insertLimitlessCredentialsSchema = createInsertSchema(limitlessCredentials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertConversationSessionSchema = createInsertSchema(conversationSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOfflineSyncQueueSchema = createInsertSchema(offlineSyncQueue).omit({
  id: true,
  createdAt: true,
});

export type InsertLimitlessCredentials = z.infer<typeof insertLimitlessCredentialsSchema>;
export type LimitlessCredentials = typeof limitlessCredentials.$inferSelect;

export type InsertConversationSession = z.infer<typeof insertConversationSessionSchema>;
export type ConversationSession = typeof conversationSessions.$inferSelect;

export type InsertOfflineSyncQueue = z.infer<typeof insertOfflineSyncQueueSchema>;
export type OfflineSyncQueueItem = typeof offlineSyncQueue.$inferSelect;

// Uploads table for storing any file type (audio, images, documents, etc.)
export const uploads = pgTable("uploads", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  deviceId: varchar("device_id").references(() => devices.id),
  fileName: text("file_name").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileType: text("file_type").notNull(), // 'audio', 'image', 'document', 'video', 'other'
  fileSize: integer("file_size").notNull(),
  filePath: text("file_path"), // Local path if stored on server
  fileData: text("file_data"), // Base64 encoded data for small files
  tags: jsonb("tags").default([]).notNull(), // Array of string tags
  metadata: jsonb("metadata"), // Additional metadata (e.g., facial recognition enrollment flags)
  status: text("status").default("pending").notNull(), // 'pending', 'processing', 'processed', 'sent', 'error'
  processingResult: jsonb("processing_result"), // Transcription, OCR, etc.
  memoryId: varchar("memory_id").references(() => memories.id), // Link to created memory
  sentToZekeAt: timestamp("sent_to_zeke_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const uploadsRelations = relations(uploads, ({ one }) => ({
  device: one(devices, {
    fields: [uploads.deviceId],
    references: [devices.id],
  }),
  memory: one(memories, {
    fields: [uploads.memoryId],
    references: [memories.id],
  }),
}));

export const insertUploadSchema = createInsertSchema(uploads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUpload = z.infer<typeof insertUploadSchema>;
export type Upload = typeof uploads.$inferSelect;

// Geofences table for location-based reminders and automations
export const geofences = pgTable("geofences", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  name: text("name").notNull(),
  latitude: text("latitude").notNull(),
  longitude: text("longitude").notNull(),
  radius: integer("radius").notNull().default(100),
  triggerOn: text("trigger_on").notNull().default("both"), // 'enter', 'exit', 'both'
  actionType: text("action_type").notNull().default("notification"), // 'notification', 'grocery_prompt', 'custom'
  actionData: jsonb("action_data"),
  isActive: boolean("is_active").default(true).notNull(),
  isHome: boolean("is_home").default(false).notNull(),
  listId: varchar("list_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const geofencesRelations = relations(geofences, ({ one }) => ({
  user: one(users, {
    fields: [geofences.userId],
    references: [users.id],
  }),
}));

export const insertGeofenceSchema = createInsertSchema(geofences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGeofence = z.infer<typeof insertGeofenceSchema>;
export type GeofenceRecord = typeof geofences.$inferSelect;

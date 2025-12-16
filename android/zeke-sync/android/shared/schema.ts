import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
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
  isConnected: boolean("is_connected").default(false).notNull(),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const memories = pgTable("memories", {
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
});

export const chatSessions = pgTable("chat_sessions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  title: text("title"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => chatSessions.id).notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  devices: many(devices),
}));

export const devicesRelations = relations(devices, ({ one, many }) => ({
  user: one(users, {
    fields: [devices.userId],
    references: [users.id],
  }),
  memories: many(memories),
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

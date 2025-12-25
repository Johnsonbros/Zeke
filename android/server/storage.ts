import { 
  type User, type InsertUser, users,
  type Device, type InsertDevice, devices,
  type Memory, type InsertMemory, memories,
  type ChatSession, type InsertChatSession, chatSessions,
  type ChatMessage, type InsertChatMessage, chatMessages,
  type SpeakerProfile, type InsertSpeakerProfile, speakerProfiles,
  type Upload, type InsertUpload, uploads
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, ilike, and, or } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getDevices(): Promise<Device[]>;
  getDevice(id: string): Promise<Device | undefined>;
  createDevice(device: InsertDevice): Promise<Device>;
  updateDevice(id: string, data: Partial<InsertDevice>): Promise<Device | undefined>;
  deleteDevice(id: string): Promise<boolean>;
  
  getMemories(filters?: { deviceId?: string; isStarred?: boolean; search?: string; limit?: number }): Promise<Memory[]>;
  getMemory(id: string): Promise<Memory | undefined>;
  createMemory(memory: InsertMemory): Promise<Memory>;
  updateMemory(id: string, data: Partial<Pick<InsertMemory, 'title' | 'summary' | 'isStarred' | 'speakers'>>): Promise<Memory | undefined>;
  deleteMemory(id: string): Promise<boolean>;
  starMemory(id: string): Promise<Memory | undefined>;
  
  getChatSessions(): Promise<ChatSession[]>;
  getChatSession(id: string): Promise<ChatSession | undefined>;
  createChatSession(session: InsertChatSession): Promise<ChatSession>;
  deleteChatSession(id: string): Promise<boolean>;
  
  getMessagesBySession(sessionId: string): Promise<ChatMessage[]>;
  createMessage(message: InsertChatMessage): Promise<ChatMessage>;

  getSpeakerProfiles(deviceId?: string): Promise<SpeakerProfile[]>;
  getSpeakerProfile(id: string): Promise<SpeakerProfile | undefined>;
  createSpeakerProfile(speaker: InsertSpeakerProfile): Promise<SpeakerProfile>;
  updateSpeakerProfile(id: string, data: Partial<Pick<InsertSpeakerProfile, 'name' | 'voiceCharacteristics'>>): Promise<SpeakerProfile | undefined>;
  deleteSpeakerProfile(id: string): Promise<boolean>;

  getUploads(filters?: { deviceId?: string; status?: string; fileType?: string; limit?: number }): Promise<Upload[]>;
  getUpload(id: string): Promise<Upload | undefined>;
  createUpload(upload: InsertUpload): Promise<Upload>;
  updateUpload(id: string, data: Partial<InsertUpload>): Promise<Upload | undefined>;
  deleteUpload(id: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getDevices(): Promise<Device[]> {
    return db.select().from(devices).orderBy(desc(devices.createdAt));
  }

  async getDevice(id: string): Promise<Device | undefined> {
    const [device] = await db.select().from(devices).where(eq(devices.id, id));
    return device;
  }

  async createDevice(device: InsertDevice): Promise<Device> {
    const [newDevice] = await db.insert(devices).values(device).returning();
    return newDevice;
  }

  async updateDevice(id: string, data: Partial<InsertDevice>): Promise<Device | undefined> {
    const [updated] = await db.update(devices).set(data).where(eq(devices.id, id)).returning();
    return updated;
  }

  async deleteDevice(id: string): Promise<boolean> {
    const result = await db.delete(devices).where(eq(devices.id, id)).returning();
    return result.length > 0;
  }

  async getMemories(filters?: { deviceId?: string; isStarred?: boolean; search?: string; limit?: number }): Promise<Memory[]> {
    const conditions: any[] = [];
    
    if (filters?.deviceId) {
      conditions.push(eq(memories.deviceId, filters.deviceId));
    }
    
    if (filters?.isStarred !== undefined) {
      conditions.push(eq(memories.isStarred, filters.isStarred));
    }
    
    if (filters?.search) {
      conditions.push(
        or(
          ilike(memories.title, `%${filters.search}%`),
          ilike(memories.transcript, `%${filters.search}%`),
          ilike(memories.summary, `%${filters.search}%`)
        )
      );
    }
    
    let query = db.select().from(memories);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    query = query.orderBy(desc(memories.createdAt)) as any;
    
    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }
    
    return query;
  }

  async getMemory(id: string): Promise<Memory | undefined> {
    const [memory] = await db.select().from(memories).where(eq(memories.id, id));
    return memory;
  }

  async createMemory(memory: InsertMemory): Promise<Memory> {
    const [newMemory] = await db.insert(memories).values(memory).returning();
    return newMemory;
  }

  async updateMemory(id: string, data: Partial<Pick<InsertMemory, 'title' | 'summary' | 'isStarred' | 'speakers'>>): Promise<Memory | undefined> {
    const [updated] = await db.update(memories)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(memories.id, id))
      .returning();
    return updated;
  }

  async deleteMemory(id: string): Promise<boolean> {
    const result = await db.delete(memories).where(eq(memories.id, id)).returning();
    return result.length > 0;
  }

  async starMemory(id: string): Promise<Memory | undefined> {
    const memory = await this.getMemory(id);
    if (!memory) return undefined;
    
    const [updated] = await db.update(memories)
      .set({ isStarred: !memory.isStarred, updatedAt: new Date() })
      .where(eq(memories.id, id))
      .returning();
    return updated;
  }

  async getChatSessions(): Promise<ChatSession[]> {
    return db.select().from(chatSessions).orderBy(desc(chatSessions.updatedAt));
  }

  async getChatSession(id: string): Promise<ChatSession | undefined> {
    const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, id));
    return session;
  }

  async createChatSession(session: InsertChatSession): Promise<ChatSession> {
    const [newSession] = await db.insert(chatSessions).values(session).returning();
    return newSession;
  }

  async deleteChatSession(id: string): Promise<boolean> {
    await db.delete(chatMessages).where(eq(chatMessages.sessionId, id));
    const result = await db.delete(chatSessions).where(eq(chatSessions.id, id)).returning();
    return result.length > 0;
  }

  async getMessagesBySession(sessionId: string): Promise<ChatMessage[]> {
    return db.select().from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(chatMessages.createdAt);
  }

  async createMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [newMessage] = await db.insert(chatMessages).values(message).returning();
    
    await db.update(chatSessions)
      .set({ updatedAt: new Date() })
      .where(eq(chatSessions.id, message.sessionId));
    
    return newMessage;
  }

  async getSpeakerProfiles(deviceId?: string): Promise<SpeakerProfile[]> {
    let query = db.select().from(speakerProfiles);
    if (deviceId) {
      query = query.where(eq(speakerProfiles.deviceId, deviceId)) as any;
    }
    return query.orderBy(desc(speakerProfiles.createdAt));
  }

  async getSpeakerProfile(id: string): Promise<SpeakerProfile | undefined> {
    const [speaker] = await db.select().from(speakerProfiles).where(eq(speakerProfiles.id, id));
    return speaker;
  }

  async createSpeakerProfile(speaker: InsertSpeakerProfile): Promise<SpeakerProfile> {
    const [newSpeaker] = await db.insert(speakerProfiles).values(speaker).returning();
    return newSpeaker;
  }

  async updateSpeakerProfile(id: string, data: Partial<Pick<InsertSpeakerProfile, 'name' | 'voiceCharacteristics'>>): Promise<SpeakerProfile | undefined> {
    const [updated] = await db.update(speakerProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(speakerProfiles.id, id))
      .returning();
    return updated;
  }

  async deleteSpeakerProfile(id: string): Promise<boolean> {
    const result = await db.delete(speakerProfiles).where(eq(speakerProfiles.id, id)).returning();
    return result.length > 0;
  }

  async getUploads(filters?: { deviceId?: string; status?: string; fileType?: string; limit?: number }): Promise<Upload[]> {
    const conditions: any[] = [];
    
    if (filters?.deviceId) {
      conditions.push(eq(uploads.deviceId, filters.deviceId));
    }
    
    if (filters?.status) {
      conditions.push(eq(uploads.status, filters.status));
    }
    
    if (filters?.fileType) {
      conditions.push(eq(uploads.fileType, filters.fileType));
    }
    
    let query = db.select().from(uploads);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    query = query.orderBy(desc(uploads.createdAt)) as any;
    
    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }
    
    return query;
  }

  async getUpload(id: string): Promise<Upload | undefined> {
    const [upload] = await db.select().from(uploads).where(eq(uploads.id, id));
    return upload;
  }

  async createUpload(upload: InsertUpload): Promise<Upload> {
    const [newUpload] = await db.insert(uploads).values(upload).returning();
    return newUpload;
  }

  async updateUpload(id: string, data: Partial<InsertUpload>): Promise<Upload | undefined> {
    const [updated] = await db.update(uploads)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(uploads.id, id))
      .returning();
    return updated;
  }

  async deleteUpload(id: string): Promise<boolean> {
    const result = await db.delete(uploads).where(eq(uploads.id, id)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();

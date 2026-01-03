import * as SQLite from "expo-sqlite";
import { CalendarEvent, Task } from "./zeke-types";

export type OfflineEntityType = "task" | "reminder" | "event" | "memory";

export interface OfflineTask extends Task {
  status?: "pending" | "in_progress" | "completed" | "cancelled";
  version?: number;
  dirtyAction?: "create" | "update" | "delete" | null;
}

export interface OfflineReminder {
  id: string;
  title: string;
  dueAt: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  version?: number;
  dirtyAction?: "create" | "update" | "delete" | null;
}

export interface OfflineEvent extends CalendarEvent {
  version?: number;
  dirtyAction?: "create" | "update" | "delete" | null;
}

export interface OfflineMemorySummary {
  id: string;
  title: string;
  summary?: string;
  createdAt: string;
  updatedAt: string;
  version?: number;
  dirtyAction?: "create" | "update" | "delete" | null;
}

export type OfflineEntity =
  | OfflineTask
  | OfflineReminder
  | OfflineEvent
  | OfflineMemorySummary;

export interface OutboundChange {
  id: string;
  entityType: OfflineEntityType;
  entityId: string;
  action: "create" | "update" | "delete";
  payload: Record<string, unknown>;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class LocalDataLayer {
  private db: SQLite.SQLiteDatabase;
  private initialized = false;

  constructor() {
    this.db = SQLite.openDatabaseSync("zeke_offline.db");
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.runMigrations();
    this.initialized = true;
  }

  runMigrations(): void {
    
    this.execute(
      `CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        dueDate TEXT,
        priority TEXT,
        status TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        version INTEGER DEFAULT 0,
        dirtyAction TEXT
      )`,
    );

    this.execute(
      `CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        dueAt TEXT NOT NULL,
        completed INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        version INTEGER DEFAULT 0,
        dirtyAction TEXT
      )`,
    );

    this.execute(
      `CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        startTime TEXT NOT NULL,
        endTime TEXT,
        location TEXT,
        allDay INTEGER,
        calendarId TEXT,
        calendarName TEXT,
        color TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        version INTEGER DEFAULT 0,
        dirtyAction TEXT
      )`,
    );

    this.execute(
      `CREATE TABLE IF NOT EXISTS memory_summaries (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        version INTEGER DEFAULT 0,
        dirtyAction TEXT
      )`,
    );

    this.execute(
      `CREATE TABLE IF NOT EXISTS outbound_changes (
        id TEXT PRIMARY KEY NOT NULL,
        entityType TEXT NOT NULL,
        entityId TEXT NOT NULL,
        action TEXT NOT NULL,
        payload TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )`,
    );
  }

  async getTasks(): Promise<OfflineTask[]> {
    const result = this.db.getAllSync(
      "SELECT * FROM tasks ORDER BY datetime(updatedAt) DESC",
    );
    return result.map((row: any) => ({
      id: row.id,
      title: row.title,
      description: row.description || undefined,
      dueDate: row.dueDate || undefined,
      priority: row.priority || undefined,
      status: row.status || undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version ?? 0,
      dirtyAction: row.dirtyAction || null,
    }));
  }

  async upsertTasks(tasks: OfflineTask[]): Promise<void> {
    if (!tasks.length) return;
    for (const task of tasks) {
      this.db.runSync(
        `INSERT OR REPLACE INTO tasks (id, title, description, dueDate, priority, status, createdAt, updatedAt, version, dirtyAction)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT dirtyAction FROM tasks WHERE id = ?), NULL))`,
        [
          task.id,
          task.title,
          task.description ?? null,
          task.dueDate ?? null,
          task.priority ?? null,
          task.status ?? null,
          task.createdAt,
          task.updatedAt,
          task.version ?? 0,
          task.id,
        ],
      );
    }
  }

  async getReminders(): Promise<OfflineReminder[]> {
    const result = this.db.getAllSync(
      "SELECT * FROM reminders ORDER BY datetime(updatedAt) DESC",
    );
    return result.map((row: any) => ({
      id: row.id,
      title: row.title,
      dueAt: row.dueAt,
      completed: row.completed === 1,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version ?? 0,
      dirtyAction: row.dirtyAction || null,
    }));
  }

  async upsertReminders(reminders: OfflineReminder[]): Promise<void> {
    if (!reminders.length) return;
    for (const reminder of reminders) {
      this.db.runSync(
        `INSERT OR REPLACE INTO reminders (id, title, dueAt, completed, createdAt, updatedAt, version, dirtyAction)
         VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT dirtyAction FROM reminders WHERE id = ?), NULL))`,
        [
          reminder.id,
          reminder.title,
          reminder.dueAt,
          reminder.completed ? 1 : 0,
          reminder.createdAt,
          reminder.updatedAt,
          reminder.version ?? 0,
          reminder.id,
        ],
      );
    }
  }

  async getEvents(): Promise<OfflineEvent[]> {
    const result = this.db.getAllSync(
      "SELECT * FROM events ORDER BY datetime(startTime) ASC",
    );
    return result.map((row: any) => ({
      id: row.id,
      title: row.title,
      description: row.description || undefined,
      startTime: row.startTime,
      endTime: row.endTime || undefined,
      location: row.location || undefined,
      allDay: row.allDay === 1,
      calendarId: row.calendarId || undefined,
      calendarName: row.calendarName || undefined,
      color: row.color || undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version ?? 0,
      dirtyAction: row.dirtyAction || null,
    }));
  }

  async upsertEvents(events: OfflineEvent[]): Promise<void> {
    if (!events.length) return;
    for (const event of events) {
      this.db.runSync(
        `INSERT OR REPLACE INTO events (id, title, description, startTime, endTime, location, allDay, calendarId, calendarName, color, createdAt, updatedAt, version, dirtyAction)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT dirtyAction FROM events WHERE id = ?), NULL))`,
        [
          event.id,
          event.title,
          event.description ?? null,
          event.startTime,
          event.endTime ?? null,
          event.location ?? null,
          event.allDay ? 1 : 0,
          event.calendarId ?? null,
          event.calendarName ?? null,
          event.color ?? null,
          event.createdAt,
          event.updatedAt,
          event.version ?? 0,
          event.id,
        ],
      );
    }
  }

  async getMemorySummaries(): Promise<OfflineMemorySummary[]> {
    const result = this.db.getAllSync(
      "SELECT * FROM memory_summaries ORDER BY datetime(updatedAt) DESC",
    );
    return result.map((row: any) => ({
      id: row.id,
      title: row.title,
      summary: row.summary || undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version ?? 0,
      dirtyAction: row.dirtyAction || null,
    }));
  }

  async upsertMemorySummaries(memories: OfflineMemorySummary[]): Promise<void> {
    if (!memories.length) return;
    for (const memory of memories) {
      this.db.runSync(
        `INSERT OR REPLACE INTO memory_summaries (id, title, summary, createdAt, updatedAt, version, dirtyAction)
         VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT dirtyAction FROM memory_summaries WHERE id = ?), NULL))`,
        [
          memory.id,
          memory.title,
          memory.summary ?? null,
          memory.createdAt,
          memory.updatedAt,
          memory.version ?? 0,
          memory.id,
        ],
      );
    }
  }

  async deleteMissing(
    table: string,
    serverIds: string[],
    dirtyOnly: boolean = false,
  ): Promise<void> {
    const dirtyFilter = dirtyOnly ? "dirtyAction IS NULL" : "1=1";
    if (!serverIds.length) {
      this.db.runSync(`DELETE FROM ${table} WHERE ${dirtyFilter}`);
      return;
    }
    const placeholders = serverIds.map(() => "?").join(",");
    this.db.runSync(
      `DELETE FROM ${table} WHERE id NOT IN (${placeholders}) AND ${dirtyFilter}`,
      serverIds,
    );
  }

  async markDirty(
    table: string,
    entity: OfflineEntity,
    action: "create" | "update" | "delete",
  ): Promise<void> {
    this.db.runSync(
      `UPDATE ${table} SET dirtyAction = ? , updatedAt = ? WHERE id = ?`,
      [action, entity.updatedAt, entity.id],
    );
  }

  async queueOutboundChange(change: Omit<OutboundChange, "id" | "attempts" | "createdAt" | "updatedAt">): Promise<OutboundChange> {
    const id = `change_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payload = JSON.stringify(change.payload);
    const timestamp = nowIso();
    this.db.runSync(
      `INSERT INTO outbound_changes (id, entityType, entityId, action, payload, attempts, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [id, change.entityType, change.entityId, change.action, payload, timestamp, timestamp],
    );
    return {
      ...change,
      id,
      payload: change.payload,
      attempts: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  async getOutboundChanges(limit = 25): Promise<OutboundChange[]> {
    const result = this.db.getAllSync(
      "SELECT * FROM outbound_changes ORDER BY datetime(createdAt) ASC LIMIT ?",
      [limit],
    );
    return result.map((row: any) => ({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action,
      payload: JSON.parse(row.payload || "{}"),
      attempts: row.attempts,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async incrementChangeAttempts(id: string): Promise<void> {
    this.db.runSync(
      `UPDATE outbound_changes SET attempts = attempts + 1, updatedAt = ? WHERE id = ?`,
      [nowIso(), id],
    );
  }

  async removeOutboundChange(id: string): Promise<void> {
    this.db.runSync("DELETE FROM outbound_changes WHERE id = ?", [id]);
  }

  async removeById(table: string, id: string): Promise<void> {
    this.db.runSync(`DELETE FROM ${table} WHERE id = ?`, [id]);
  }

  private execute(sql: string, params: any[] = []): void {
    this.db.runSync(sql, params);
  }
}

export const localDataLayer = new LocalDataLayer();

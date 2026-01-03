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
  private initialized = false;

  constructor() {}

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  runMigrations(): void {}

  async getTasks(): Promise<OfflineTask[]> {
    return [];
  }

  async upsertTasks(_tasks: OfflineTask[]): Promise<void> {}

  async getReminders(): Promise<OfflineReminder[]> {
    return [];
  }

  async upsertReminders(_reminders: OfflineReminder[]): Promise<void> {}

  async getEvents(): Promise<OfflineEvent[]> {
    return [];
  }

  async upsertEvents(_events: OfflineEvent[]): Promise<void> {}

  async getMemorySummaries(): Promise<OfflineMemorySummary[]> {
    return [];
  }

  async upsertMemorySummaries(_memories: OfflineMemorySummary[]): Promise<void> {}

  async deleteMissing(
    _table: string,
    _serverIds: string[],
    _dirtyOnly: boolean = false,
  ): Promise<void> {}

  async markDirty(
    _table: string,
    _entity: OfflineEntity,
    _action: "create" | "update" | "delete",
  ): Promise<void> {}

  async queueOutboundChange(change: Omit<OutboundChange, "id" | "attempts" | "createdAt" | "updatedAt">): Promise<OutboundChange> {
    const id = `change_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = nowIso();
    return {
      ...change,
      id,
      payload: change.payload,
      attempts: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  async getOutboundChanges(_limit = 25): Promise<OutboundChange[]> {
    return [];
  }

  async incrementChangeAttempts(_id: string): Promise<void> {}

  async removeOutboundChange(_id: string): Promise<void> {}

  async removeById(_table: string, _id: string): Promise<void> {}
}

export const localDataLayer = new LocalDataLayer();

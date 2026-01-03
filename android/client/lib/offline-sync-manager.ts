import { ConnectivityService } from "./connectivity";
import { apiClient } from "./api-client";
import {
  localDataLayer,
  OfflineEntityType,
  OfflineEvent,
  OfflineMemorySummary,
  OfflineReminder,
  OfflineTask,
  OutboundChange,
} from "./offline-data-layer";

function toNumberVersion(value?: number): number {
  return typeof value === "number" ? value : 0;
}

function isServerPreferred(
  localUpdatedAt?: string,
  serverUpdatedAt?: string,
  localVersion?: number,
  serverVersion?: number,
): boolean {
  if (serverVersion !== undefined && localVersion !== undefined) {
    return serverVersion >= localVersion;
  }

  if (serverUpdatedAt && localUpdatedAt) {
    return new Date(serverUpdatedAt).getTime() >= new Date(localUpdatedAt).getTime();
  }

  return true;
}

export class OfflineSyncManager {
  private initialized = false;
  private syncingQueue = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await localDataLayer.initialize();
    ConnectivityService.initialize({
      onOnline: () => this.syncOutboundChanges(),
    });
    this.initialized = true;
  }

  isOnline(): boolean {
    return ConnectivityService.isOnline();
  }

  async getTasks(fetcher: () => Promise<OfflineTask[]>): Promise<OfflineTask[]> {
    await this.initialize();
    const cached = await localDataLayer.getTasks();

    if (!this.isOnline()) {
      return cached;
    }

    try {
      const remote = await fetcher();
      await this.applyServerState("task", remote);
      return remote;
    } catch (error) {
      console.warn("[Offline Sync] Falling back to cached tasks", error);
      return cached;
    }
  }

  async getReminders(
    fetcher: () => Promise<OfflineReminder[]>,
  ): Promise<OfflineReminder[]> {
    await this.initialize();
    const cached = await localDataLayer.getReminders();

    if (!this.isOnline()) return cached;

    try {
      const remote = await fetcher();
      await this.applyServerState("reminder", remote);
      return remote;
    } catch (error) {
      console.warn("[Offline Sync] Falling back to cached reminders", error);
      return cached;
    }
  }

  async getEvents(
    fetcher: () => Promise<OfflineEvent[]>,
    range?: { start?: Date; end?: Date },
  ): Promise<OfflineEvent[]> {
    await this.initialize();
    const cached = await localDataLayer.getEvents();
    const filteredCached = this.filterEvents(cached, range);

    if (!this.isOnline()) return filteredCached;

    try {
      const remote = await fetcher();
      await this.applyServerState("event", remote);
      return this.filterEvents(remote, range);
    } catch (error) {
      console.warn("[Offline Sync] Falling back to cached events", error);
      return filteredCached;
    }
  }

  async getMemorySummaries(
    fetcher: () => Promise<OfflineMemorySummary[]>,
    limit?: number,
  ): Promise<OfflineMemorySummary[]> {
    await this.initialize();
    const cached = await localDataLayer.getMemorySummaries();
    const slicedCached = typeof limit === "number" ? cached.slice(0, limit) : cached;

    if (!this.isOnline()) return slicedCached;

    try {
      const remote = await fetcher();
      await this.applyServerState("memory", remote);
      return typeof limit === "number" ? remote.slice(0, limit) : remote;
    } catch (error) {
      console.warn("[Offline Sync] Falling back to cached memories", error);
      return slicedCached;
    }
  }

  async recordTaskChange(
    task: OfflineTask,
    action: "create" | "update" | "delete",
    payload: Record<string, unknown>,
  ): Promise<OfflineTask> {
    await this.initialize();

    await localDataLayer.upsertTasks([task]);
    await localDataLayer.markDirty("tasks", task, action);
    await localDataLayer.queueOutboundChange({
      entityType: "task",
      entityId: task.id,
      action,
      payload,
    });
    return task;
  }

  async saveServerTasks(tasks: OfflineTask[]): Promise<void> {
    await this.initialize();
    await this.applyServerState("task", tasks);
  }

  async getCachedTasks(): Promise<OfflineTask[]> {
    await this.initialize();
    return localDataLayer.getTasks();
  }

  async removeTaskLocally(id: string): Promise<void> {
    await this.initialize();
    await localDataLayer.removeById("tasks", id);
  }

  async syncOutboundChanges(): Promise<void> {
    if (!this.isOnline() || this.syncingQueue) return;

    this.syncingQueue = true;
    try {
      const changes = await localDataLayer.getOutboundChanges();
      for (const change of changes) {
        try {
          await this.uploadChange(change);
          await localDataLayer.removeOutboundChange(change.id);
        } catch (error) {
          console.warn("[Offline Sync] Failed to upload change", change.id, error);
          await localDataLayer.incrementChangeAttempts(change.id);
        }
      }
    } finally {
      this.syncingQueue = false;
    }
  }

  private async uploadChange(change: OutboundChange): Promise<void> {
    if (change.entityType !== "task") {
      return;
    }

    if (change.action === "create") {
      const created = await apiClient.post<any>("/api/zeke/tasks", change.payload);
      await localDataLayer.removeById("tasks", change.entityId);
      await this.applyServerState("task", [this.normalizeTask(created)]);
      return;
    }

    if (change.action === "update") {
      const updated = await apiClient.patch<any>(
        `/api/zeke/tasks/${change.entityId}`,
        change.payload,
      );
      await this.applyServerState("task", [this.normalizeTask(updated)]);
      return;
    }

    if (change.action === "delete") {
      await apiClient.delete(`/api/zeke/tasks/${change.entityId}`);
      await localDataLayer.removeById("tasks", change.entityId);
    }
  }

  private normalizeTask(task: any): OfflineTask {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      dueDate: task.dueDate,
      priority: task.priority,
      status: task.status,
      createdAt: task.createdAt || new Date().toISOString(),
      updatedAt: task.updatedAt || new Date().toISOString(),
      version: toNumberVersion(task.version),
    };
  }

  private filterEvents(
    events: OfflineEvent[],
    range?: { start?: Date; end?: Date },
  ): OfflineEvent[] {
    if (!range?.start && !range?.end) return events;

    return events.filter((event) => {
      const startTime = new Date(event.startTime).getTime();
      if (range.start && startTime < range.start.getTime()) {
        return false;
      }
      if (range.end && startTime > range.end.getTime()) {
        return false;
      }
      return true;
    });
  }

  private async applyServerState(
    entityType: OfflineEntityType,
    items: (OfflineTask | OfflineReminder | OfflineEvent | OfflineMemorySummary)[],
  ): Promise<void> {
    const ids = items.map((item) => item.id);

    switch (entityType) {
      case "task": {
        const local = await localDataLayer.getTasks();
        const merged: OfflineTask[] = [];
        const localMap = new Map(local.map((t) => [t.id, t]));
        for (const item of items as OfflineTask[]) {
          const existing = localMap.get(item.id);
          if (existing?.dirtyAction && !isServerPreferred(
            existing.updatedAt,
            item.updatedAt,
            existing.version,
            item.version,
          )) {
            continue;
          }
          merged.push({ ...item, dirtyAction: null });
        }
        await localDataLayer.upsertTasks(merged);
        await localDataLayer.deleteMissing("tasks", ids, true);
        return;
      }
      case "reminder": {
        const local = await localDataLayer.getReminders();
        const merged: OfflineReminder[] = [];
        const localMap = new Map(local.map((r) => [r.id, r]));
        for (const item of items as OfflineReminder[]) {
          const existing = localMap.get(item.id);
          if (existing?.dirtyAction && !isServerPreferred(
            existing.updatedAt,
            item.updatedAt,
            existing.version,
            item.version,
          )) {
            continue;
          }
          merged.push({ ...item, dirtyAction: null });
        }
        await localDataLayer.upsertReminders(merged);
        await localDataLayer.deleteMissing("reminders", ids, true);
        return;
      }
      case "event": {
        const local = await localDataLayer.getEvents();
        const merged: OfflineEvent[] = [];
        const localMap = new Map(local.map((e) => [e.id, e]));
        for (const item of items as OfflineEvent[]) {
          const existing = localMap.get(item.id);
          if (existing?.dirtyAction && !isServerPreferred(
            existing.updatedAt,
            item.updatedAt,
            existing.version,
            item.version,
          )) {
            continue;
          }
          merged.push({ ...item, dirtyAction: null });
        }
        await localDataLayer.upsertEvents(merged);
        await localDataLayer.deleteMissing("events", ids, true);
        return;
      }
      case "memory": {
        const local = await localDataLayer.getMemorySummaries();
        const merged: OfflineMemorySummary[] = [];
        const localMap = new Map(local.map((m) => [m.id, m]));
        for (const item of items as OfflineMemorySummary[]) {
          const existing = localMap.get(item.id);
          if (existing?.dirtyAction && !isServerPreferred(
            existing.updatedAt,
            item.updatedAt,
            existing.version,
            item.version,
          )) {
            continue;
          }
          merged.push({ ...item, dirtyAction: null });
        }
        await localDataLayer.upsertMemorySummaries(merged);
        await localDataLayer.deleteMissing("memory_summaries", ids, true);
        return;
      }
    }
  }
}

export const offlineSyncManager = new OfflineSyncManager();

/**
 * Offline Sync Queue Service
 * 
 * Smart offline queue for audio recordings that:
 * - Queues recordings when offline
 * - Prioritizes important recordings
 * - Auto-syncs when back online
 * - Handles retry logic with exponential backoff
 * - Batches uploads for efficiency
 */

import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import * as FileSystem from "expo-file-system";
import { wearableApi, OfflineSyncItem } from "./wearable-api";

type SyncState = "idle" | "syncing" | "paused" | "error";
type SyncEventType = "state_change" | "item_synced" | "item_failed" | "queue_empty";

interface SyncEvent {
  type: SyncEventType;
  state?: SyncState;
  item?: LocalQueueItem;
  error?: string;
}

interface LocalQueueItem {
  id: string;
  deviceId: string;
  recordingType: "omi" | "limitless" | "microphone";
  audioUri: string;
  duration: number;
  priority: number;
  createdAt: string;
  retryCount: number;
  lastError?: string;
}

type SyncEventCallback = (event: SyncEvent) => void;

const QUEUE_STORAGE_KEY = "offline_sync_queue";
const MAX_RETRY_COUNT = 5;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_BATCH_SIZE = 5;

class OfflineSyncService {
  private queue: LocalQueueItem[] = [];
  private state: SyncState = "idle";
  private isOnline = true;
  private netInfoUnsubscribe: (() => void) | null = null;
  private syncTimeout: ReturnType<typeof setTimeout> | null = null;
  private eventCallbacks: SyncEventCallback[] = [];
  private deviceId: string | null = null;

  constructor() {
    console.log("[Offline Sync] Service initialized");
  }

  public async initialize(deviceId: string): Promise<void> {
    this.deviceId = deviceId;
    await this.loadQueue();
    this.subscribeToNetworkChanges();
    
    const state = await NetInfo.fetch();
    this.isOnline = state.isConnected ?? false;

    if (this.isOnline && this.queue.length > 0) {
      this.startSync();
    }

    console.log("[Offline Sync] Initialized, queue size:", this.queue.length);
  }

  private subscribeToNetworkChanges(): void {
    this.netInfoUnsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const wasOnline = this.isOnline;
      this.isOnline = state.isConnected ?? false;

      if (!wasOnline && this.isOnline && this.queue.length > 0) {
        console.log("[Offline Sync] Back online, starting sync");
        this.startSync();
      } else if (wasOnline && !this.isOnline) {
        console.log("[Offline Sync] Went offline, pausing sync");
        this.pauseSync();
      }
    });
  }

  public async addToQueue(item: {
    recordingType: "omi" | "limitless" | "microphone";
    audioUri: string;
    duration: number;
    priority?: number;
  }): Promise<LocalQueueItem> {
    if (!this.deviceId) {
      throw new Error("Service not initialized with device ID");
    }

    const queueItem: LocalQueueItem = {
      id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      deviceId: this.deviceId,
      recordingType: item.recordingType,
      audioUri: item.audioUri,
      duration: item.duration,
      priority: item.priority ?? this.calculatePriority(item.duration),
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    this.queue.push(queueItem);
    this.sortQueue();
    await this.saveQueue();

    console.log("[Offline Sync] Added to queue:", queueItem.id, "Priority:", queueItem.priority);

    if (this.isOnline && this.state === "idle") {
      this.startSync();
    }

    return queueItem;
  }

  private calculatePriority(duration: number): number {
    if (duration > 300) return 10;
    if (duration > 120) return 7;
    if (duration > 60) return 5;
    return 3;
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }

  private async startSync(): Promise<void> {
    if (this.state === "syncing") {
      return;
    }

    this.setState("syncing");
    await this.processQueue();
  }

  private pauseSync(): void {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }
    this.setState("paused");
  }

  private async processQueue(): Promise<void> {
    if (!this.isOnline || this.queue.length === 0) {
      this.setState("idle");
      this.emitEvent({ type: "queue_empty" });
      return;
    }

    const batch = this.queue.slice(0, MAX_BATCH_SIZE);

    for (const item of batch) {
      if (!this.isOnline) {
        this.pauseSync();
        return;
      }

      try {
        await this.syncItem(item);
        this.removeFromQueue(item.id);
        this.emitEvent({ type: "item_synced", item });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        item.lastError = errorMessage;
        item.retryCount++;

        if (item.retryCount >= MAX_RETRY_COUNT) {
          console.log("[Offline Sync] Max retries reached for:", item.id);
          this.removeFromQueue(item.id);
          this.emitEvent({ type: "item_failed", item, error: errorMessage });
        } else {
          const delay = BASE_RETRY_DELAY_MS * Math.pow(2, item.retryCount);
          console.log("[Offline Sync] Retry scheduled for:", item.id, "in", delay, "ms");
          
          this.syncTimeout = setTimeout(() => {
            this.processQueue();
          }, delay);
          return;
        }
      }
    }

    await this.saveQueue();

    if (this.queue.length > 0) {
      this.syncTimeout = setTimeout(() => {
        this.processQueue();
      }, 1000);
    } else {
      this.setState("idle");
      this.emitEvent({ type: "queue_empty" });
    }
  }

  private async syncItem(item: LocalQueueItem): Promise<void> {
    console.log("[Offline Sync] Syncing item:", item.id);

    const fileInfo = await FileSystem.getInfoAsync(item.audioUri);
    if (!fileInfo.exists) {
      throw new Error("Audio file not found: " + item.audioUri);
    }

    const audioBase64 = await FileSystem.readAsStringAsync(item.audioUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    await wearableApi.addToSyncQueue({
      deviceId: item.deviceId,
      recordingType: item.recordingType,
      audioData: audioBase64,
      duration: item.duration,
      priority: item.priority,
    });

    try {
      await FileSystem.deleteAsync(item.audioUri, { idempotent: true });
    } catch {
    }

    console.log("[Offline Sync] Item synced successfully:", item.id);
  }

  private removeFromQueue(itemId: string): void {
    this.queue = this.queue.filter(item => item.id !== itemId);
  }

  private async loadQueue(): Promise<void> {
    try {
      const queuePath = `${FileSystem.documentDirectory}${QUEUE_STORAGE_KEY}.json`;
      const fileInfo = await FileSystem.getInfoAsync(queuePath);
      
      if (fileInfo.exists) {
        const data = await FileSystem.readAsStringAsync(queuePath);
        const parsed = JSON.parse(data);
        this.queue = parsed as LocalQueueItem[];
        this.sortQueue();
      }
    } catch (error) {
      console.error("[Offline Sync] Failed to load queue:", error);
      this.queue = [];
    }
  }

  private async saveQueue(): Promise<void> {
    try {
      const queuePath = `${FileSystem.documentDirectory}${QUEUE_STORAGE_KEY}.json`;
      await FileSystem.writeAsStringAsync(queuePath, JSON.stringify(this.queue));
    } catch (error) {
      console.error("[Offline Sync] Failed to save queue:", error);
    }
  }

  public getQueue(): LocalQueueItem[] {
    return [...this.queue];
  }

  public getState(): SyncState {
    return this.state;
  }

  public getStats(): {
    queueSize: number;
    state: SyncState;
    isOnline: boolean;
    totalDuration: number;
  } {
    return {
      queueSize: this.queue.length,
      state: this.state,
      isOnline: this.isOnline,
      totalDuration: this.queue.reduce((sum, item) => sum + item.duration, 0),
    };
  }

  public onEvent(callback: SyncEventCallback): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      this.eventCallbacks = this.eventCallbacks.filter(cb => cb !== callback);
    };
  }

  private setState(newState: SyncState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.emitEvent({ type: "state_change", state: newState });
    }
  }

  private emitEvent(event: SyncEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error("[Offline Sync] Event callback error:", error);
      }
    }
  }

  public async clearQueue(): Promise<void> {
    for (const item of this.queue) {
      try {
        await FileSystem.deleteAsync(item.audioUri, { idempotent: true });
      } catch {
      }
    }

    this.queue = [];
    await this.saveQueue();
    console.log("[Offline Sync] Queue cleared");
  }

  public cleanup(): void {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }

    if (this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe();
      this.netInfoUnsubscribe = null;
    }

    this.setState("idle");
    console.log("[Offline Sync] Cleaned up");
  }
}

export const offlineSyncService = new OfflineSyncService();

import { LocalAudioStorageService, type SyncQueueEntry } from "./local-audio-storage";
import { queryClient } from "./query-client";
import * as FileSystem from "expo-file-system";

// Event emitter for upload progress
interface UploadQueueEvent {
  type: "started" | "progress" | "success" | "failed" | "retrying" | "completed";
  recordingId: string;
  status?: string;
  error?: string;
  attempt?: number;
  maxAttempts?: number;
}

type EventCallback = (event: UploadQueueEvent) => void;

const EXPONENTIAL_BACKOFF_BASE = 1000; // 1 second
const MAX_CONCURRENT_UPLOADS = 1; // FIFO, one at a time

export const UploadQueueProcessor = {
  _isProcessing: false,
  _isPaused: false,
  _isInitialized: false,
  _currentUpload: null as string | null,
  _eventCallbacks: [] as EventCallback[],

  /**
   * Initialize the upload queue processor (lazy, runs once)
   * Resets any stale "syncing" items to "pending" (from app crash/kill)
   */
  async _ensureInitialized(): Promise<void> {
    if (this._isInitialized) return;

    try {
      const queue = await LocalAudioStorageService.getSyncQueue();
      let resetCount = 0;

      for (const item of queue) {
        if (item.status === "syncing") {
          await LocalAudioStorageService.updateRecordingStatus(
            item.recordingId,
            "pending",
          );
          resetCount++;
        }
      }

      if (resetCount > 0) {
        console.log(
          `[UploadQueue] Reset ${resetCount} stale syncing item(s) to pending`,
        );
      }
      this._isInitialized = true;
      console.log("[UploadQueue] Processor initialized");
    } catch (error) {
      console.error("[UploadQueue] Failed to initialize:", error);
    }
  },

  /**
   * Subscribe to upload events
   */
  onEvent(callback: EventCallback): () => void {
    this._eventCallbacks.push(callback);
    return () => {
      this._eventCallbacks = this._eventCallbacks.filter((cb) => cb !== callback);
    };
  },

  /**
   * Emit event to all subscribers
   */
  _emitEvent(event: UploadQueueEvent): void {
    console.log(
      `[UploadQueue] Event: ${event.type} (${event.recordingId}) - ${event.status || ""}`,
    );
    this._eventCallbacks.forEach((cb) => {
      try {
        cb(event);
      } catch (error) {
        console.error("[UploadQueue] Error in event callback:", error);
      }
    });
  },

  /**
   * Process the upload queue in FIFO order
   */
  async processQueue(): Promise<void> {
    // Ensure stale "syncing" items are reset before first run
    await this._ensureInitialized();

    if (this._isProcessing) {
      console.log("[UploadQueue] Queue processing already in progress");
      return;
    }

    this._isProcessing = true;
    this._emitEvent({
      type: "started",
      recordingId: "queue",
      status: "Queue processing started",
    });

    try {
      while (!this._isPaused) {
        const pendingItems = await LocalAudioStorageService.getPendingSyncItems();

        if (pendingItems.length === 0) {
          console.log("[UploadQueue] Queue empty, processing complete");
          break;
        }

        // Process first item (FIFO)
        const item = pendingItems[0];
        const success = await this._processQueueItem(item);

        if (!success) {
          // If this item failed permanently, continue to next
          continue;
        }
      }

      this._emitEvent({
        type: "completed",
        recordingId: "queue",
        status: "Queue processing completed",
      });
    } catch (error) {
      console.error("[UploadQueue] Queue processing error:", error);
    } finally {
      this._isProcessing = false;
      this._currentUpload = null;
    }
  },

  /**
   * Process a single queue item with retries
   */
  async _processQueueItem(item: SyncQueueEntry): Promise<boolean> {
    this._currentUpload = item.recordingId;

    try {
      // Check if file still exists
      const fileInfo = await FileSystem.getInfoAsync(item.filepath);
      if (!fileInfo.exists) {
        console.log(
          `[UploadQueue] File no longer exists: ${item.recordingId}`,
        );
        await LocalAudioStorageService.deleteLocalRecording(item.recordingId);
        this._emitEvent({
          type: "success",
          recordingId: item.recordingId,
          status: "File deleted (no longer exists)",
        });
        return true;
      }

      // Update status to uploading
      await LocalAudioStorageService.updateRecordingStatus(
        item.recordingId,
        "syncing",
      );

      this._emitEvent({
        type: "progress",
        recordingId: item.recordingId,
        status: `Uploading (attempt ${item.attempts + 1}/${item.maxAttempts})`,
        attempt: item.attempts + 1,
        maxAttempts: item.maxAttempts,
      });

      // Attempt upload
      const uploadSuccess = await this._uploadRecording(item);

      if (uploadSuccess) {
        // Success: remove file and mark as synced
        await FileSystem.deleteAsync(item.filepath, { idempotent: true });
        await LocalAudioStorageService.updateRecordingStatus(
          item.recordingId,
          "synced",
        );
        await LocalAudioStorageService._removeFromSyncQueue(item.recordingId);

        this._emitEvent({
          type: "success",
          recordingId: item.recordingId,
          status: "Upload successful, local file removed",
        });

        // Invalidate recording cache to update UI
        queryClient.invalidateQueries({
          queryKey: ["/api/memories"],
        });

        return true;
      } else {
        // Failed: increment attempt counter
        await LocalAudioStorageService.markSyncAttempt(
          item.recordingId,
          "Upload failed",
        );

        const updatedItem = (await LocalAudioStorageService.getSyncQueue()).find(
          (e) => e.recordingId === item.recordingId,
        );

        if (updatedItem?.status === "failed") {
          this._emitEvent({
            type: "failed",
            recordingId: item.recordingId,
            status: `Upload failed after ${updatedItem.attempts} attempts`,
            attempt: updatedItem.attempts,
            maxAttempts: updatedItem.maxAttempts,
          });
        } else {
          // Schedule retry with exponential backoff
          const backoffMs = this._calculateBackoff(updatedItem?.attempts || 0);
          this._emitEvent({
            type: "retrying",
            recordingId: item.recordingId,
            status: `Retrying in ${backoffMs}ms (attempt ${(updatedItem?.attempts || 0) + 1}/${item.maxAttempts})`,
            attempt: (updatedItem?.attempts || 0) + 1,
            maxAttempts: item.maxAttempts,
          });

          await this._sleep(backoffMs);
          // Don't return true/false here, let next loop handle it
        }

        return false;
      }
    } catch (error) {
      console.error(
        `[UploadQueue] Error processing item ${item.recordingId}:`,
        error,
      );
      await LocalAudioStorageService.markSyncAttempt(
        item.recordingId,
        String(error),
      );
      return false;
    }
  },

  /**
   * Upload a single recording
   */
  async _uploadRecording(item: SyncQueueEntry): Promise<boolean> {
    try {
      // This is a placeholder for the actual upload implementation
      // In a real app, this would:
      // 1. Read the audio file from filepath
      // 2. Create FormData with file + metadata
      // 3. POST to /api/memory/upload or similar endpoint
      // 4. Return true if 200-299 status, false otherwise

      console.log(
        `[UploadQueue] Would upload: ${item.recordingId} (${item.duration}s)`,
      );

      // For now, simulate upload with random success
      // This will be implemented in the actual API integration
      const success = Math.random() > 0.1; // 90% success rate for demo
      return success;
    } catch (error) {
      console.error("[UploadQueue] Upload error:", error);
      return false;
    }
  },

  /**
   * Calculate exponential backoff delay
   * 1st retry: 1s, 2nd: 2s, 3rd: 4s
   */
  _calculateBackoff(attemptNumber: number): number {
    return EXPONENTIAL_BACKOFF_BASE * Math.pow(2, attemptNumber);
  },

  /**
   * Sleep utility
   */
  _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  /**
   * Pause queue processing
   */
  pause(): void {
    this._isPaused = true;
    console.log("[UploadQueue] Processing paused");
  },

  /**
   * Resume queue processing
   */
  async resume(): Promise<void> {
    this._isPaused = false;
    console.log("[UploadQueue] Processing resumed");
    await this.processQueue();
  },

  /**
   * Is queue processing active
   */
  isProcessing(): boolean {
    return this._isProcessing;
  },

  /**
   * Get current upload ID
   */
  getCurrentUpload(): string | null {
    return this._currentUpload;
  },

  /**
   * Retry a specific failed recording
   */
  async retryRecording(recordingId: string): Promise<void> {
    try {
      // Reset attempts counter to allow retries
      const queue = await LocalAudioStorageService.getSyncQueue();
      const entry = queue.find((e) => e.recordingId === recordingId);

      if (entry) {
        entry.status = "pending";
        entry.attempts = 0;
        entry.error = undefined;
        entry.updatedAt = new Date().toISOString();

        await LocalAudioStorageService.updateRecordingStatus(
          recordingId,
          "pending",
        );

        console.log(`[UploadQueue] Reset recording for retry: ${recordingId}`);

        // Trigger queue processing
        await this.processQueue();
      }
    } catch (error) {
      console.error("[UploadQueue] Error retrying recording:", error);
      throw error;
    }
  },

  /**
   * Get queue stats
   */
  async getQueueStats(): Promise<{
    pending: number;
    syncing: number;
    synced: number;
    failed: number;
    totalSize: number;
  }> {
    try {
      const stats = await LocalAudioStorageService.getStorageStats();
      return {
        pending: stats.pendingSync,
        syncing: this._isProcessing ? 1 : 0,
        synced: stats.synced,
        failed: stats.failed,
        totalSize: stats.totalSize,
      };
    } catch (error) {
      console.error("[UploadQueue] Error getting queue stats:", error);
      return {
        pending: 0,
        syncing: 0,
        synced: 0,
        failed: 0,
        totalSize: 0,
      };
    }
  },
};

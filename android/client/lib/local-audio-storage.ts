import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";

// Types
export interface LocalRecording {
  id: string;
  filename: string;
  filepath: string;
  duration: number;
  timestamp: number;
  deviceId: string;
  status: "pending" | "synced" | "syncing" | "failed";
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface SyncQueueEntry {
  recordingId: string;
  filename: string;
  filepath: string;
  duration: number;
  timestamp: number;
  deviceId: string;
  status: "pending" | "syncing" | "synced" | "failed";
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

// Constants
const RECORDINGS_DIR = `${FileSystem.DocumentDirectory}zeke-recordings`;
const STORAGE_KEY_RECORDINGS = "@zeke/audio_recordings";
const STORAGE_KEY_SYNC_QUEUE = "@zeke/audio_sync_queue";
const MAX_RETRY_ATTEMPTS = 3;

// Service
export const LocalAudioStorageService = {
  /**
   * Initialize the recordings directory
   */
  async initialize(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(RECORDINGS_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(RECORDINGS_DIR, {
          intermediates: true,
        });
        console.log("[LocalAudioStorage] Created recordings directory");
      }
    } catch (error) {
      console.error("[LocalAudioStorage] Failed to initialize directory:", error);
      throw error;
    }
  },

  /**
   * Save a recording to local storage
   */
  async saveRecording(
    audioUri: string,
    duration: number,
    deviceId: string,
  ): Promise<LocalRecording> {
    try {
      await this.initialize();

      const id = `recording_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const filename = `${id}.m4a`;
      const filepath = `${RECORDINGS_DIR}/${filename}`;

      // Copy audio file to persistent storage
      await FileSystem.copyAsync({
        from: audioUri,
        to: filepath,
      });

      const now = new Date().toISOString();
      const recording: LocalRecording = {
        id,
        filename,
        filepath,
        duration,
        timestamp: Date.now(),
        deviceId,
        status: "pending",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      };

      // Save recording to AsyncStorage
      const recordings = await this.getLocalRecordings();
      recordings.push(recording);
      await AsyncStorage.setItem(
        STORAGE_KEY_RECORDINGS,
        JSON.stringify(recordings),
      );

      // Add to sync queue
      await this._addToSyncQueue(recording);

      console.log(
        `[LocalAudioStorage] Saved recording: ${id} (${duration}s)`,
      );
      return recording;
    } catch (error) {
      console.error("[LocalAudioStorage] Failed to save recording:", error);
      throw error;
    }
  },

  /**
   * Get all local recordings
   */
  async getLocalRecordings(): Promise<LocalRecording[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY_RECORDINGS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("[LocalAudioStorage] Failed to get recordings:", error);
      return [];
    }
  },

  /**
   * Delete a local recording
   */
  async deleteLocalRecording(recordingId: string): Promise<void> {
    try {
      // Remove from file system
      const recordings = await this.getLocalRecordings();
      const recording = recordings.find((r) => r.id === recordingId);

      if (recording) {
        await FileSystem.deleteAsync(recording.filepath, { idempotent: true });

        // Remove from metadata storage
        const updated = recordings.filter((r) => r.id !== recordingId);
        await AsyncStorage.setItem(
          STORAGE_KEY_RECORDINGS,
          JSON.stringify(updated),
        );

        // Remove from sync queue
        await this._removeFromSyncQueue(recordingId);

        console.log(`[LocalAudioStorage] Deleted recording: ${recordingId}`);
      }
    } catch (error) {
      console.error("[LocalAudioStorage] Failed to delete recording:", error);
      throw error;
    }
  },

  /**
   * Get sync queue
   */
  async getSyncQueue(): Promise<SyncQueueEntry[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY_SYNC_QUEUE);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("[LocalAudioStorage] Failed to get sync queue:", error);
      return [];
    }
  },

  /**
   * Update recording status
   */
  async updateRecordingStatus(
    recordingId: string,
    status: LocalRecording["status"],
  ): Promise<void> {
    try {
      const recordings = await this.getLocalRecordings();
      const recording = recordings.find((r) => r.id === recordingId);

      if (recording) {
        recording.status = status;
        recording.updatedAt = new Date().toISOString();
        await AsyncStorage.setItem(
          STORAGE_KEY_RECORDINGS,
          JSON.stringify(recordings),
        );
      }

      // Also update sync queue
      const queue = await this.getSyncQueue();
      const entry = queue.find((e) => e.recordingId === recordingId);
      if (entry) {
        entry.status = status;
        entry.updatedAt = new Date().toISOString();
        await AsyncStorage.setItem(
          STORAGE_KEY_SYNC_QUEUE,
          JSON.stringify(queue),
        );
      }
    } catch (error) {
      console.error(
        "[LocalAudioStorage] Failed to update recording status:",
        error,
      );
      throw error;
    }
  },

  /**
   * Mark sync attempt
   */
  async markSyncAttempt(recordingId: string, error?: string): Promise<void> {
    try {
      const queue = await this.getSyncQueue();
      const entry = queue.find((e) => e.recordingId === recordingId);

      if (entry) {
        entry.attempts += 1;
        entry.lastAttemptAt = Date.now();
        if (error) {
          entry.error = error;
        }
        entry.updatedAt = new Date().toISOString();

        // Mark as failed if exceeded max attempts
        if (entry.attempts >= entry.maxAttempts) {
          entry.status = "failed";
          await this.updateRecordingStatus(recordingId, "failed");
        }

        await AsyncStorage.setItem(
          STORAGE_KEY_SYNC_QUEUE,
          JSON.stringify(queue),
        );

        console.log(
          `[LocalAudioStorage] Sync attempt ${entry.attempts}/${entry.maxAttempts} for ${recordingId}`,
        );
      }
    } catch (error) {
      console.error(
        "[LocalAudioStorage] Failed to mark sync attempt:",
        error,
      );
      throw error;
    }
  },

  /**
   * Get pending sync items
   */
  async getPendingSyncItems(): Promise<SyncQueueEntry[]> {
    try {
      const queue = await this.getSyncQueue();
      return queue.filter((e) => e.status === "pending");
    } catch (error) {
      console.error(
        "[LocalAudioStorage] Failed to get pending sync items:",
        error,
      );
      return [];
    }
  },

  /**
   * Clear sync queue
   */
  async clearSyncQueue(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY_SYNC_QUEUE);
      console.log("[LocalAudioStorage] Cleared sync queue");
    } catch (error) {
      console.error("[LocalAudioStorage] Failed to clear sync queue:", error);
      throw error;
    }
  },

  /**
   * Get local recordings directory info
   */
  async getStorageStats(): Promise<{
    totalRecordings: number;
    totalSize: number;
    pendingSync: number;
    synced: number;
    failed: number;
  }> {
    try {
      const recordings = await this.getLocalRecordings();
      const queue = await this.getSyncQueue();

      let totalSize = 0;
      for (const recording of recordings) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(recording.filepath);
          if (fileInfo.exists && typeof fileInfo.size === "number") {
            totalSize += fileInfo.size;
          }
        } catch {
          // File might have been deleted
        }
      }

      return {
        totalRecordings: recordings.length,
        totalSize,
        pendingSync: queue.filter((e) => e.status === "pending").length,
        synced: recordings.filter((r) => r.status === "synced").length,
        failed: recordings.filter((r) => r.status === "failed").length,
      };
    } catch (error) {
      console.error("[LocalAudioStorage] Failed to get storage stats:", error);
      return {
        totalRecordings: 0,
        totalSize: 0,
        pendingSync: 0,
        synced: 0,
        failed: 0,
      };
    }
  },

  // Private helper methods

  /**
   * Add recording to sync queue
   */
  async _addToSyncQueue(recording: LocalRecording): Promise<void> {
    try {
      const queue = await this.getSyncQueue();
      const entry: SyncQueueEntry = {
        recordingId: recording.id,
        filename: recording.filename,
        filepath: recording.filepath,
        duration: recording.duration,
        timestamp: recording.timestamp,
        deviceId: recording.deviceId,
        status: "pending",
        attempts: 0,
        maxAttempts: MAX_RETRY_ATTEMPTS,
        createdAt: recording.createdAt,
        updatedAt: recording.updatedAt,
      };

      queue.push(entry);
      await AsyncStorage.setItem(
        STORAGE_KEY_SYNC_QUEUE,
        JSON.stringify(queue),
      );
    } catch (error) {
      console.error("[LocalAudioStorage] Failed to add to sync queue:", error);
      throw error;
    }
  },

  /**
   * Remove recording from sync queue
   */
  async _removeFromSyncQueue(recordingId: string): Promise<void> {
    try {
      const queue = await this.getSyncQueue();
      const filtered = queue.filter((e) => e.recordingId !== recordingId);
      await AsyncStorage.setItem(
        STORAGE_KEY_SYNC_QUEUE,
        JSON.stringify(filtered),
      );
    } catch (error) {
      console.error(
        "[LocalAudioStorage] Failed to remove from sync queue:",
        error,
      );
      throw error;
    }
  },
};

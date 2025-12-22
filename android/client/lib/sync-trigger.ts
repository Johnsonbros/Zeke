import { LocalAudioStorageService } from "./local-audio-storage";
import { UploadQueueProcessor } from "./upload-queue";

let _syncInProgress = false;
let _lastSyncTime = 0;
const SYNC_DEBOUNCE_MS = 1000; // Wait 1s after coming online before syncing

export const SyncTrigger = {
  /**
   * Trigger sync exactly once (with debounce to prevent duplicates)
   */
  async triggerSync(force: boolean = false): Promise<void> {
    const now = Date.now();
    const timeSinceLastSync = now - _lastSyncTime;

    // Prevent duplicate triggers within debounce window
    if (!force && timeSinceLastSync < SYNC_DEBOUNCE_MS) {
      console.log(
        `[SyncTrigger] Skipping sync (debounce: ${Math.round(SYNC_DEBOUNCE_MS - timeSinceLastSync)}ms remaining)`,
      );
      return;
    }

    // Prevent concurrent syncs
    if (_syncInProgress) {
      console.log("[SyncTrigger] Sync already in progress, skipping");
      return;
    }

    _syncInProgress = true;
    _lastSyncTime = now;

    try {
      console.log("[SyncTrigger] Starting sync of pending recordings");

      // Get pending sync items
      const pendingItems = await LocalAudioStorageService.getPendingSyncItems();

      if (pendingItems.length === 0) {
        console.log("[SyncTrigger] No pending recordings to sync");
        return;
      }

      console.log(
        `[SyncTrigger] Found ${pendingItems.length} pending recording(s) to sync`,
      );

      // Start background upload queue processing (FIFO with retries)
      await UploadQueueProcessor.processQueue();

      console.log("[SyncTrigger] Sync triggered successfully");
    } catch (error) {
      console.error("[SyncTrigger] Error during sync:", error);
    } finally {
      _syncInProgress = false;
    }
  },

  /**
   * Check if sync is currently in progress
   */
  isSyncInProgress(): boolean {
    return _syncInProgress;
  },

  /**
   * Get time since last sync attempt
   */
  getTimeSinceLastSync(): number {
    return Date.now() - _lastSyncTime;
  },

  /**
   * Reset sync tracking (useful for testing)
   */
  reset(): void {
    _syncInProgress = false;
    _lastSyncTime = 0;
    console.log("[SyncTrigger] Reset");
  },
};

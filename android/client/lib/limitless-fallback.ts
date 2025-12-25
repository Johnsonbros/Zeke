/**
 * Limitless Fallback Service
 * 
 * Provides automatic fallback to Limitless REST API when BLE streaming fails.
 * Monitors BLE connection state and triggers API sync when:
 * - BLE connection is lost
 * - Audio streaming fails
 * - Device goes out of range
 * 
 * Works with the wearable-api client to fetch pre-transcribed lifelogs.
 */

import { wearableApi, LimitlessStatus, LimitlessSyncResult } from "./wearable-api";
import { bluetoothService, BluetoothConnectionState } from "./bluetooth";

type FallbackState = "idle" | "monitoring" | "syncing" | "error";
type FallbackEventType = "state_change" | "sync_complete" | "sync_error";

interface FallbackEvent {
  type: FallbackEventType;
  state?: FallbackState;
  result?: LimitlessSyncResult;
  error?: string;
}

type FallbackEventCallback = (event: FallbackEvent) => void;

class LimitlessFallbackService {
  private deviceId: string | null = null;
  private state: FallbackState = "idle";
  private lastSyncTime: Date | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private bleUnsubscribe: (() => void) | null = null;
  private eventCallbacks: FallbackEventCallback[] = [];
  private autoSyncEnabled = false;
  private syncIntervalMs = 5 * 60 * 1000;

  constructor() {
    console.log("[Limitless Fallback] Service initialized");
  }

  public async initialize(deviceId: string): Promise<boolean> {
    this.deviceId = deviceId;

    try {
      const status = await wearableApi.getLimitlessStatus(deviceId);
      
      if (!status.configured) {
        console.log("[Limitless Fallback] Limitless API not configured for device");
        return false;
      }

      this.subscribeToBleEvents();
      this.setState("monitoring");
      console.log("[Limitless Fallback] Initialized for device:", deviceId);
      return true;
    } catch (error) {
      console.error("[Limitless Fallback] Initialization error:", error);
      return false;
    }
  }

  private subscribeToBleEvents(): void {
    this.bleUnsubscribe = bluetoothService.onConnectionStateChange((state: BluetoothConnectionState) => {
      this.handleBleStateChange(state);
    });
  }

  private handleBleStateChange(state: BluetoothConnectionState): void {
    console.log("[Limitless Fallback] BLE state changed:", state);

    if (state === "disconnected" || state === "error") {
      if (this.state === "monitoring" && this.autoSyncEnabled) {
        console.log("[Limitless Fallback] BLE disconnected, triggering sync");
        this.triggerSync();
      }
    }
  }

  public async triggerSync(): Promise<LimitlessSyncResult | null> {
    if (!this.deviceId) {
      console.error("[Limitless Fallback] No device ID configured");
      return null;
    }

    if (this.state === "syncing") {
      console.log("[Limitless Fallback] Sync already in progress");
      return null;
    }

    this.setState("syncing");

    try {
      const result = await wearableApi.syncLimitless(this.deviceId);
      this.lastSyncTime = new Date();
      this.setState("monitoring");

      this.emitEvent({
        type: "sync_complete",
        result,
      });

      console.log("[Limitless Fallback] Sync complete:", result.syncedCount, "items");
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown sync error";
      this.setState("error");

      this.emitEvent({
        type: "sync_error",
        error: errorMessage,
      });

      console.error("[Limitless Fallback] Sync error:", errorMessage);
      return null;
    }
  }

  public enableAutoSync(intervalMs?: number): void {
    this.autoSyncEnabled = true;
    
    if (intervalMs) {
      this.syncIntervalMs = intervalMs;
    }

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      if (this.state === "monitoring") {
        this.triggerSync();
      }
    }, this.syncIntervalMs);

    console.log("[Limitless Fallback] Auto-sync enabled, interval:", this.syncIntervalMs, "ms");
  }

  public disableAutoSync(): void {
    this.autoSyncEnabled = false;

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    console.log("[Limitless Fallback] Auto-sync disabled");
  }

  public async getStatus(): Promise<{
    state: FallbackState;
    deviceId: string | null;
    lastSyncTime: Date | null;
    autoSyncEnabled: boolean;
    limitlessStatus: LimitlessStatus | null;
  }> {
    let limitlessStatus: LimitlessStatus | null = null;

    if (this.deviceId) {
      try {
        limitlessStatus = await wearableApi.getLimitlessStatus(this.deviceId);
      } catch {
      }
    }

    return {
      state: this.state,
      deviceId: this.deviceId,
      lastSyncTime: this.lastSyncTime,
      autoSyncEnabled: this.autoSyncEnabled,
      limitlessStatus,
    };
  }

  public onEvent(callback: FallbackEventCallback): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      this.eventCallbacks = this.eventCallbacks.filter(cb => cb !== callback);
    };
  }

  private setState(newState: FallbackState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.emitEvent({ type: "state_change", state: newState });
    }
  }

  private emitEvent(event: FallbackEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error("[Limitless Fallback] Event callback error:", error);
      }
    }
  }

  public cleanup(): void {
    this.disableAutoSync();

    if (this.bleUnsubscribe) {
      this.bleUnsubscribe();
      this.bleUnsubscribe = null;
    }

    this.setState("idle");
    this.deviceId = null;
    console.log("[Limitless Fallback] Cleaned up");
  }
}

export const limitlessFallbackService = new LimitlessFallbackService();

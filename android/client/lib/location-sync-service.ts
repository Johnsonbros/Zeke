import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  syncLocationBatchToZeke,
  type ZekeLocationSample,
} from "./zeke-api-adapter";
import { calculateDistance, type LocationData, type GeocodedLocation } from "./location";

const PENDING_SYNC_KEY = "@zeke/pending_location_sync_v2";
const GEOCODE_CACHE_KEY = "@zeke/geocode_cache";
const SYNC_STATUS_KEY = "@zeke/location_sync_status";

const MAX_QUEUE_SIZE = 100;
const MAX_RETRY_COUNT = 5;
const BASE_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 5 * 60 * 1_000;
const DEDUP_DISTANCE_METERS = 50;
const GEOCODE_CACHE_RADIUS_METERS = 100;
const GEOCODE_CACHE_MAX_ENTRIES = 50;
const GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface PendingLocationItem {
  sample: ZekeLocationSample;
  priority: "normal" | "high";
  addedAt: number;
  retryCount: number;
}

export interface GeocodeCache {
  entries: GeocodeCacheEntry[];
}

export interface GeocodeCacheEntry {
  latitude: number;
  longitude: number;
  geocoded: GeocodedLocation;
  cachedAt: number;
}

export interface LocationSyncStatus {
  pendingCount: number;
  lastSyncAt: number | null;
  lastSyncSuccess: boolean;
  isOnline: boolean;
  isSyncing: boolean;
}

type SyncStatusListener = (status: LocationSyncStatus) => void;

class LocationSyncService {
  private isInitialized = false;
  private isOnline = true;
  private isSyncing = false;
  private unsubscribeNetInfo: (() => void) | null = null;
  private statusListeners: Set<SyncStatusListener> = new Set();
  private syncStatus: LocationSyncStatus = {
    pendingCount: 0,
    lastSyncAt: null,
    lastSyncSuccess: true,
    isOnline: true,
    isSyncing: false,
  };

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const savedStatus = await this.loadSyncStatus();
    if (savedStatus) {
      this.syncStatus = { ...this.syncStatus, ...savedStatus };
    }

    const pendingCount = await this.getPendingCount();
    this.syncStatus.pendingCount = pendingCount;

    this.unsubscribeNetInfo = NetInfo.addEventListener(this.handleNetworkChange);

    const state = await NetInfo.fetch();
    this.isOnline = state.isConnected ?? true;
    this.syncStatus.isOnline = this.isOnline;

    this.isInitialized = true;
    console.log("[LocationSync] Service initialized, online:", this.isOnline, "pending:", pendingCount);

    if (this.isOnline && pendingCount > 0) {
      this.flushPendingQueue();
    }
  }

  private handleNetworkChange = (state: NetInfoState): void => {
    const wasOnline = this.isOnline;
    this.isOnline = state.isConnected ?? false;
    this.syncStatus.isOnline = this.isOnline;
    this.notifyListeners();

    console.log("[LocationSync] Network changed, online:", this.isOnline);

    if (!wasOnline && this.isOnline) {
      console.log("[LocationSync] Back online, flushing pending queue");
      this.flushPendingQueue();
    }
  };

  async addLocation(
    location: LocationData,
    geocoded: GeocodedLocation | null,
    priority: "normal" | "high" = "normal"
  ): Promise<void> {
    try {
      const pending = await this.getPendingQueue();

      const isDuplicate = pending.some((item) => {
        const distance = calculateDistance(
          location.latitude,
          location.longitude,
          item.sample.latitude,
          item.sample.longitude
        );
        return distance < DEDUP_DISTANCE_METERS;
      });

      if (isDuplicate && priority === "normal") {
        console.log("[LocationSync] Skipping duplicate location within", DEDUP_DISTANCE_METERS, "m");
        return;
      }

      const sample: ZekeLocationSample = {
        latitude: location.latitude,
        longitude: location.longitude,
        altitude: location.altitude,
        accuracy: location.accuracy,
        heading: location.heading,
        speed: location.speed,
        recordedAt: new Date(location.timestamp).toISOString(),
      };

      const newItem: PendingLocationItem = {
        sample,
        priority,
        addedAt: Date.now(),
        retryCount: 0,
      };

      let updatedQueue = [...pending, newItem];

      if (updatedQueue.length > MAX_QUEUE_SIZE) {
        updatedQueue.sort((a, b) => {
          if (a.priority !== b.priority) {
            return a.priority === "high" ? -1 : 1;
          }
          return b.addedAt - a.addedAt;
        });
        updatedQueue = updatedQueue.slice(0, MAX_QUEUE_SIZE);
        console.log("[LocationSync] Queue exceeded max size, trimmed to", MAX_QUEUE_SIZE);
      }

      await this.savePendingQueue(updatedQueue);
      this.syncStatus.pendingCount = updatedQueue.length;
      this.notifyListeners();

      if (geocoded) {
        await this.cacheGeocode(location.latitude, location.longitude, geocoded);
      }

      if (this.isOnline && !this.isSyncing) {
        this.flushPendingQueue();
      }
    } catch (error) {
      console.error("[LocationSync] Error adding location:", error);
    }
  }

  async flushPendingQueue(): Promise<{ success: boolean; synced: number }> {
    if (this.isSyncing) {
      return { success: false, synced: 0 };
    }

    if (!this.isOnline) {
      console.log("[LocationSync] Offline, skipping sync");
      return { success: false, synced: 0 };
    }

    this.isSyncing = true;
    this.syncStatus.isSyncing = true;
    this.notifyListeners();

    try {
      const pending = await this.getPendingQueue();
      if (pending.length === 0) {
        this.isSyncing = false;
        this.syncStatus.isSyncing = false;
        this.notifyListeners();
        return { success: true, synced: 0 };
      }

      const highPriority = pending.filter((item) => item.priority === "high");
      const normalPriority = pending.filter((item) => item.priority === "normal");
      const sortedQueue = [...highPriority, ...normalPriority];

      const batchSize = 20;
      const batch = sortedQueue.slice(0, batchSize);
      const samples = batch.map((item) => item.sample);

      console.log("[LocationSync] Syncing batch of", samples.length, "locations");
      const result = await syncLocationBatchToZeke(samples);

      if (result.success) {
        const remaining = sortedQueue.slice(batchSize);
        const filteredRemaining = remaining.filter((item) => item.retryCount <= MAX_RETRY_COUNT);

        if (filteredRemaining.length !== remaining.length) {
          console.warn(
            "[LocationSync] Dropped",
            remaining.length - filteredRemaining.length,
            "locations exceeding max retry attempts"
          );
        }

        await this.savePendingQueue(filteredRemaining);

        this.syncStatus.pendingCount = filteredRemaining.length;
        this.syncStatus.lastSyncAt = Date.now();
        this.syncStatus.lastSyncSuccess = true;
        await this.saveSyncStatus();

        console.log(
          "[LocationSync] Synced",
          result.synced,
          "locations,",
          filteredRemaining.length,
          "remaining"
        );

        if (filteredRemaining.length > 0 && this.isOnline) {
          setTimeout(() => this.flushPendingQueue(), 1_000);
        }
      } else {
        const updated = sortedQueue.map((item, index) => {
          if (index < batchSize) {
            return { ...item, retryCount: item.retryCount + 1 };
          }
          return item;
        });
        await this.savePendingQueue(updated);
        this.syncStatus.lastSyncSuccess = false;
        await this.saveSyncStatus();
        console.log("[LocationSync] Sync failed, will retry with backoff");

        const attempted = updated.slice(0, batchSize);
        const retryDelay = this.calculateBackoffDelay(attempted);

        if (this.isOnline) {
          setTimeout(() => this.flushPendingQueue(), retryDelay);
        }
      }

      this.isSyncing = false;
      this.syncStatus.isSyncing = false;
      this.notifyListeners();
      return result;
    } catch (error) {
      console.error("[LocationSync] Flush error:", error);
      this.isSyncing = false;
      this.syncStatus.isSyncing = false;
      this.syncStatus.lastSyncSuccess = false;
      await this.saveSyncStatus();
      this.notifyListeners();
      return { success: false, synced: 0 };
    }
  }

  private calculateBackoffDelay(attempted: PendingLocationItem[]): number {
    const highestRetry = attempted.reduce((max, item) => Math.max(max, item.retryCount), 0);
    const exponentialDelay = BASE_RETRY_DELAY_MS * Math.pow(2, highestRetry);
    const jitter = Math.floor(Math.random() * BASE_RETRY_DELAY_MS);
    return Math.min(exponentialDelay + jitter, MAX_RETRY_DELAY_MS);
  }

  async getCachedGeocode(
    latitude: number,
    longitude: number
  ): Promise<GeocodedLocation | null> {
    try {
      const cache = await this.getGeocodeCache();
      const now = Date.now();

      for (const entry of cache.entries) {
        if (now - entry.cachedAt > GEOCODE_CACHE_TTL_MS) {
          continue;
        }

        const distance = calculateDistance(
          latitude,
          longitude,
          entry.latitude,
          entry.longitude
        );

        if (distance < GEOCODE_CACHE_RADIUS_METERS) {
          console.log("[LocationSync] Geocode cache hit, distance:", Math.round(distance), "m");
          return entry.geocoded;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private async cacheGeocode(
    latitude: number,
    longitude: number,
    geocoded: GeocodedLocation
  ): Promise<void> {
    try {
      const cache = await this.getGeocodeCache();

      const entry: GeocodeCacheEntry = {
        latitude,
        longitude,
        geocoded,
        cachedAt: Date.now(),
      };

      cache.entries.unshift(entry);

      if (cache.entries.length > GEOCODE_CACHE_MAX_ENTRIES) {
        cache.entries = cache.entries.slice(0, GEOCODE_CACHE_MAX_ENTRIES);
      }

      await AsyncStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.error("[LocationSync] Error caching geocode:", error);
    }
  }

  private async getGeocodeCache(): Promise<GeocodeCache> {
    try {
      const data = await AsyncStorage.getItem(GEOCODE_CACHE_KEY);
      return data ? JSON.parse(data) : { entries: [] };
    } catch {
      return { entries: [] };
    }
  }

  private async getPendingQueue(): Promise<PendingLocationItem[]> {
    try {
      const data = await AsyncStorage.getItem(PENDING_SYNC_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private async savePendingQueue(queue: PendingLocationItem[]): Promise<void> {
    await AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(queue));
  }

  private async getPendingCount(): Promise<number> {
    const queue = await this.getPendingQueue();
    return queue.length;
  }

  private async loadSyncStatus(): Promise<Partial<LocationSyncStatus> | null> {
    try {
      const data = await AsyncStorage.getItem(SYNC_STATUS_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  private async saveSyncStatus(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        SYNC_STATUS_KEY,
        JSON.stringify({
          lastSyncAt: this.syncStatus.lastSyncAt,
          lastSyncSuccess: this.syncStatus.lastSyncSuccess,
        })
      );
    } catch {
    }
  }

  getStatus(): LocationSyncStatus {
    return { ...this.syncStatus };
  }

  subscribe(listener: SyncStatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.syncStatus);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.statusListeners) {
      listener(this.syncStatus);
    }
  }

  async clearQueue(): Promise<void> {
    await AsyncStorage.removeItem(PENDING_SYNC_KEY);
    this.syncStatus.pendingCount = 0;
    this.notifyListeners();
  }

  destroy(): void {
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
      this.unsubscribeNetInfo = null;
    }
    this.statusListeners.clear();
    this.isInitialized = false;
  }
}

export const locationSyncService = new LocationSyncService();

import { db } from "../db";
import { limitlessClient, type Lifelog } from "./limitless";
import { preferences } from "@shared/schema";
import { eq } from "drizzle-orm";
import * as cron from "node-cron";

const SYNC_STATE_KEY = "limitless_sync_state";
const DEFAULT_SYNC_INTERVAL = "0 */2 * * *";

interface SyncState {
  lastSyncAt: string | null;
  lastLifelogId: string | null;
  totalSynced: number;
  errors: number;
}

interface SyncedLifelog {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  duration: number;
  markdown?: string;
  syncedAt: string;
}

class LimitlessSyncService {
  private scheduledTask: cron.ScheduledTask | null = null;
  private isRunning = false;
  private syncedLogs: Map<string, SyncedLifelog> = new Map();
  
  async loadSyncState(): Promise<SyncState> {
    try {
      const stored = await db
        .select()
        .from(preferences)
        .where(eq(preferences.key, SYNC_STATE_KEY))
        .limit(1);
      
      if (stored.length > 0 && stored[0].value) {
        return JSON.parse(stored[0].value) as SyncState;
      }
    } catch (error) {
      console.error("[LimitlessSync] Failed to load sync state:", error);
    }
    
    return {
      lastSyncAt: null,
      lastLifelogId: null,
      totalSynced: 0,
      errors: 0,
    };
  }
  
  async saveSyncState(state: SyncState): Promise<void> {
    try {
      const { v4: uuidv4 } = await import("uuid");
      const now = new Date().toISOString();
      const stateJson = JSON.stringify(state);
      
      await db
        .insert(preferences)
        .values({
          id: uuidv4(),
          key: SYNC_STATE_KEY,
          value: stateJson,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: preferences.key,
          set: { value: stateJson, updatedAt: now },
        });
    } catch (error) {
      console.error("[LimitlessSync] Failed to save sync state:", error);
    }
  }
  
  async syncLifelogs(options?: { since?: string; limit?: number }): Promise<{
    synced: number;
    skipped: number;
    errors: number;
    lifelogs: Lifelog[];
  }> {
    if (!limitlessClient.isConfigured()) {
      await limitlessClient.loadConfig();
      if (!limitlessClient.isConfigured()) {
        console.log("[LimitlessSync] Skipping sync - API not configured");
        return { synced: 0, skipped: 0, errors: 0, lifelogs: [] };
      }
    }
    
    const result = {
      synced: 0,
      skipped: 0,
      errors: 0,
      lifelogs: [] as Lifelog[],
    };
    
    try {
      const state = await this.loadSyncState();
      
      const params = {
        limit: options?.limit || 50,
        includeMarkdown: true,
        includeHeadings: true,
        direction: "desc" as const,
        start: options?.since || state.lastSyncAt || undefined,
      };
      
      console.log(`[LimitlessSync] Fetching lifelogs since ${params.start || "beginning"}`);
      
      const response = await limitlessClient.listLifelogs(params);
      const lifelogs = response.data.lifelogs;
      
      console.log(`[LimitlessSync] Received ${lifelogs.length} lifelogs`);
      
      for (const log of lifelogs) {
        if (this.syncedLogs.has(log.id)) {
          result.skipped++;
          continue;
        }
        
        try {
          const syncedLog: SyncedLifelog = {
            id: log.id,
            title: log.title,
            startTime: log.startTime,
            endTime: log.endTime,
            duration: log.duration,
            markdown: log.markdown,
            syncedAt: new Date().toISOString(),
          };
          
          this.syncedLogs.set(log.id, syncedLog);
          result.synced++;
          result.lifelogs.push(log);
        } catch (error) {
          console.error(`[LimitlessSync] Error processing lifelog ${log.id}:`, error);
          result.errors++;
        }
      }
      
      if (lifelogs.length > 0) {
        const latestLog = lifelogs[0];
        state.lastSyncAt = new Date().toISOString();
        state.lastLifelogId = latestLog.id;
        state.totalSynced += result.synced;
        state.errors += result.errors;
        await this.saveSyncState(state);
      }
      
      console.log(`[LimitlessSync] Sync complete: ${result.synced} synced, ${result.skipped} skipped, ${result.errors} errors`);
      
    } catch (error) {
      console.error("[LimitlessSync] Sync failed:", error);
      result.errors++;
    }
    
    return result;
  }
  
  async getSyncedLifelogs(): Promise<SyncedLifelog[]> {
    return Array.from(this.syncedLogs.values()).sort((a, b) => 
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
  }
  
  getSyncedCount(): number {
    return this.syncedLogs.size;
  }
  
  start(cronExpression = DEFAULT_SYNC_INTERVAL): void {
    if (this.scheduledTask) {
      console.log("[LimitlessSync] Already running, stopping existing task");
      this.stop();
    }
    
    this.scheduledTask = cron.schedule(cronExpression, async () => {
      if (this.isRunning) {
        console.log("[LimitlessSync] Previous sync still running, skipping");
        return;
      }
      
      this.isRunning = true;
      try {
        await this.syncLifelogs();
      } finally {
        this.isRunning = false;
      }
    }, {
      timezone: "America/New_York",
    });
    
    console.log(`[LimitlessSync] Scheduled sync job at "${cronExpression}" (America/New_York)`);
  }
  
  stop(): void {
    if (this.scheduledTask) {
      this.scheduledTask.stop();
      this.scheduledTask = null;
      console.log("[LimitlessSync] Sync job stopped");
    }
  }
  
  async runNow(): Promise<{
    synced: number;
    skipped: number;
    errors: number;
    lifelogs: Lifelog[];
  }> {
    if (this.isRunning) {
      console.log("[LimitlessSync] Sync already in progress");
      return { synced: 0, skipped: 0, errors: 0, lifelogs: [] };
    }
    
    this.isRunning = true;
    try {
      return await this.syncLifelogs();
    } finally {
      this.isRunning = false;
    }
  }
  
  getStatus(): {
    isRunning: boolean;
    isScheduled: boolean;
    syncedCount: number;
  } {
    return {
      isRunning: this.isRunning,
      isScheduled: this.scheduledTask !== null,
      syncedCount: this.syncedLogs.size,
    };
  }
}

export const limitlessSyncService = new LimitlessSyncService();

export async function initLimitlessSync(): Promise<void> {
  await limitlessClient.loadConfig();
  if (limitlessClient.isConfigured()) {
    limitlessSyncService.start();
    console.log("[LimitlessSync] Initialized and scheduled");
    
    setTimeout(async () => {
      console.log("[LimitlessSync] Running initial sync...");
      await limitlessSyncService.runNow();
    }, 5000);
  } else {
    console.log("[LimitlessSync] Not configured - sync disabled");
  }
}

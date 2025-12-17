/**
 * Sleep Tracker Service for ZEKE
 * 
 * Tracks sleep patterns including:
 * - Sleep/wake times based on pendant audio activity
 * - Night-time audio events (noises during sleep hours)
 * - User-reported sleep quality ratings (1-10)
 * 
 * Data is stored in data/sleep_log.json for easy viewing
 */

import * as fs from "fs";
import * as path from "path";
import { log } from "./logger";

const SLEEP_LOG_PATH = path.join(process.cwd(), "data", "sleep_log.json");
const NIGHT_HOURS_START = 21; // 9 PM - consider sleep period starts
const NIGHT_HOURS_END = 6;    // 6 AM - consider morning
const MORNING_HOURS_END = 10; // 10 AM - latest to ask about sleep

export interface NightAudioEvent {
  timestamp: string;
  duration: number; // seconds of audio activity
  source: string;
  description?: string;
}

export interface SleepEntry {
  date: string; // YYYY-MM-DD
  sleepTime: string | null; // ISO timestamp when pendant went silent
  wakeTime: string | null; // ISO timestamp when pendant first received audio
  sleepQuality: number | null; // 1-10 rating
  nightAudioEvents: NightAudioEvent[];
  notes: string;
  totalSleepMinutes: number | null;
  pendantWasOff: boolean; // true if pendant was likely off vs just silent
  createdAt: string;
  updatedAt: string;
}

export interface SleepLog {
  entries: SleepEntry[];
  lastUpdated: string;
  preferences: {
    nightStartHour: number;
    nightEndHour: number;
    morningBriefingDelayMinutes: number;
    askSleepQuality: boolean;
  };
}

interface SleepTrackerState {
  lastAudioTime: Date | null;
  pendantSilentSince: Date | null;
  wasAskedAboutSleep: boolean;
  pendingWakeDetected: boolean;
  wakeDetectedAt: Date | null;
  todaySleepQualityAsked: boolean;
}

const state: SleepTrackerState = {
  lastAudioTime: null,
  pendantSilentSince: null,
  wasAskedAboutSleep: false,
  pendingWakeDetected: false,
  wakeDetectedAt: null,
  todaySleepQualityAsked: false,
};

function ensureDataDir(): void {
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function loadSleepLog(): SleepLog {
  ensureDataDir();
  
  if (fs.existsSync(SLEEP_LOG_PATH)) {
    try {
      const data = fs.readFileSync(SLEEP_LOG_PATH, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      log("[SleepTracker] Error reading sleep log, creating new one", "voice");
    }
  }
  
  return {
    entries: [],
    lastUpdated: new Date().toISOString(),
    preferences: {
      nightStartHour: NIGHT_HOURS_START,
      nightEndHour: NIGHT_HOURS_END,
      morningBriefingDelayMinutes: 2,
      askSleepQuality: true,
    },
  };
}

function saveSleepLog(sleepLog: SleepLog): void {
  ensureDataDir();
  sleepLog.lastUpdated = new Date().toISOString();
  fs.writeFileSync(SLEEP_LOG_PATH, JSON.stringify(sleepLog, null, 2));
  log("[SleepTracker] Sleep log saved", "voice");
}

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function getOrCreateTodayEntry(): SleepEntry {
  const sleepLog = loadSleepLog();
  const today = getTodayDate();
  
  let entry = sleepLog.entries.find(e => e.date === today);
  
  if (!entry) {
    entry = {
      date: today,
      sleepTime: null,
      wakeTime: null,
      sleepQuality: null,
      nightAudioEvents: [],
      notes: "",
      totalSleepMinutes: null,
      pendantWasOff: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    sleepLog.entries.push(entry);
    saveSleepLog(sleepLog);
  }
  
  return entry;
}

function isNightTime(date: Date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= NIGHT_HOURS_START || hour < NIGHT_HOURS_END;
}

function isMorningTime(date: Date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= NIGHT_HOURS_END && hour < MORNING_HOURS_END;
}

/**
 * Record audio activity - used to track wake time and night sounds
 */
export function recordSleepAudioActivity(source: string = "pendant"): {
  isWakeUp: boolean;
  shouldAskSleepQuality: boolean;
  sleepDurationMinutes: number | null;
} {
  const now = new Date();
  const sleepLog = loadSleepLog();
  const entry = getOrCreateTodayEntry();
  
  const wasLongSilence = state.pendantSilentSince && 
    (now.getTime() - state.pendantSilentSince.getTime()) > (4 * 60 * 60 * 1000); // 4+ hours
  
  const isMorning = isMorningTime(now);
  const isFirstAudioToday = !entry.wakeTime;
  
  let isWakeUp = false;
  let shouldAskSleepQuality = false;
  let sleepDurationMinutes: number | null = null;
  
  // Detect wake-up: first audio in morning after long silence
  if (isFirstAudioToday && isMorning && (wasLongSilence || !state.lastAudioTime)) {
    isWakeUp = true;
    entry.wakeTime = now.toISOString();
    entry.updatedAt = now.toISOString();
    
    // Calculate sleep duration if we have a sleep time
    if (entry.sleepTime) {
      const sleepStart = new Date(entry.sleepTime);
      sleepDurationMinutes = Math.round((now.getTime() - sleepStart.getTime()) / (60 * 1000));
      entry.totalSleepMinutes = sleepDurationMinutes;
    }
    
    // Should ask about sleep quality if we haven't already today
    if (sleepLog.preferences.askSleepQuality && !state.todaySleepQualityAsked) {
      shouldAskSleepQuality = true;
      state.pendingWakeDetected = true;
      state.wakeDetectedAt = now;
    }
    
    state.wasAskedAboutSleep = true;
    log(`[SleepTracker] Wake-up detected at ${now.toLocaleTimeString()}. Sleep duration: ${sleepDurationMinutes || 'unknown'} minutes`, "voice");
    
    // Save entry
    const entryIndex = sleepLog.entries.findIndex(e => e.date === entry.date);
    if (entryIndex >= 0) {
      sleepLog.entries[entryIndex] = entry;
    }
    saveSleepLog(sleepLog);
  }
  
  // Track night-time audio events
  if (isNightTime(now) && entry.sleepTime) {
    const lastEventTime = entry.nightAudioEvents.length > 0 
      ? new Date(entry.nightAudioEvents[entry.nightAudioEvents.length - 1].timestamp)
      : null;
    
    // Only log if it's been at least 5 minutes since last event
    if (!lastEventTime || (now.getTime() - lastEventTime.getTime()) > 5 * 60 * 1000) {
      entry.nightAudioEvents.push({
        timestamp: now.toISOString(),
        duration: 0,
        source,
        description: "Audio detected during sleep hours",
      });
      entry.updatedAt = now.toISOString();
      
      const entryIndex = sleepLog.entries.findIndex(e => e.date === entry.date);
      if (entryIndex >= 0) {
        sleepLog.entries[entryIndex] = entry;
      }
      saveSleepLog(sleepLog);
      
      log(`[SleepTracker] Night audio event recorded at ${now.toLocaleTimeString()}`, "voice");
    }
  }
  
  state.lastAudioTime = now;
  state.pendantSilentSince = null;
  
  return { isWakeUp, shouldAskSleepQuality, sleepDurationMinutes };
}

/**
 * Record that the pendant has gone silent (called when pendant health check detects silence)
 */
export function recordPendantSilence(): void {
  const now = new Date();
  
  if (!state.pendantSilentSince) {
    state.pendantSilentSince = now;
    log(`[SleepTracker] Pendant went silent at ${now.toLocaleTimeString()}`, "voice");
  }
  
  // If it's night time and silence started after 8 PM, record as potential sleep time
  if (isNightTime(now) && !state.pendantSilentSince) {
    const sleepLog = loadSleepLog();
    const entry = getOrCreateTodayEntry();
    
    if (!entry.sleepTime) {
      entry.sleepTime = now.toISOString();
      entry.updatedAt = now.toISOString();
      
      const entryIndex = sleepLog.entries.findIndex(e => e.date === entry.date);
      if (entryIndex >= 0) {
        sleepLog.entries[entryIndex] = entry;
      }
      saveSleepLog(sleepLog);
      
      log(`[SleepTracker] Sleep time recorded at ${now.toLocaleTimeString()}`, "voice");
    }
  }
}

/**
 * Record sleep quality rating from user
 */
export function recordSleepQuality(rating: number, notes: string = ""): SleepEntry {
  const validRating = Math.max(1, Math.min(10, Math.round(rating)));
  
  const sleepLog = loadSleepLog();
  const entry = getOrCreateTodayEntry();
  
  entry.sleepQuality = validRating;
  entry.notes = notes;
  entry.updatedAt = new Date().toISOString();
  
  const entryIndex = sleepLog.entries.findIndex(e => e.date === entry.date);
  if (entryIndex >= 0) {
    sleepLog.entries[entryIndex] = entry;
  }
  saveSleepLog(sleepLog);
  
  state.todaySleepQualityAsked = true;
  state.pendingWakeDetected = false;
  
  log(`[SleepTracker] Sleep quality recorded: ${validRating}/10`, "voice");
  
  return entry;
}

/**
 * Get recent sleep data for analysis
 */
export function getSleepHistory(days: number = 7): SleepEntry[] {
  const sleepLog = loadSleepLog();
  return sleepLog.entries
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, days);
}

/**
 * Get sleep statistics
 */
export function getSleepStats(days: number = 7): {
  averageSleepQuality: number | null;
  averageSleepDuration: number | null;
  totalNightEvents: number;
  sleepQualityTrend: "improving" | "declining" | "stable" | "unknown";
  recentEntries: number;
} {
  const entries = getSleepHistory(days);
  
  if (entries.length === 0) {
    return {
      averageSleepQuality: null,
      averageSleepDuration: null,
      totalNightEvents: 0,
      sleepQualityTrend: "unknown",
      recentEntries: 0,
    };
  }
  
  const qualityRatings = entries.filter(e => e.sleepQuality !== null).map(e => e.sleepQuality!);
  const sleepDurations = entries.filter(e => e.totalSleepMinutes !== null).map(e => e.totalSleepMinutes!);
  const totalNightEvents = entries.reduce((sum, e) => sum + e.nightAudioEvents.length, 0);
  
  const averageSleepQuality = qualityRatings.length > 0 
    ? Math.round((qualityRatings.reduce((a, b) => a + b, 0) / qualityRatings.length) * 10) / 10
    : null;
  
  const averageSleepDuration = sleepDurations.length > 0
    ? Math.round(sleepDurations.reduce((a, b) => a + b, 0) / sleepDurations.length)
    : null;
  
  // Calculate trend
  let sleepQualityTrend: "improving" | "declining" | "stable" | "unknown" = "unknown";
  if (qualityRatings.length >= 3) {
    const recent = qualityRatings.slice(0, Math.ceil(qualityRatings.length / 2));
    const older = qualityRatings.slice(Math.ceil(qualityRatings.length / 2));
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    if (recentAvg - olderAvg > 0.5) {
      sleepQualityTrend = "improving";
    } else if (olderAvg - recentAvg > 0.5) {
      sleepQualityTrend = "declining";
    } else {
      sleepQualityTrend = "stable";
    }
  }
  
  return {
    averageSleepQuality,
    averageSleepDuration,
    totalNightEvents,
    sleepQualityTrend,
    recentEntries: entries.length,
  };
}

/**
 * Get today's sleep entry
 */
export function getTodaySleepEntry(): SleepEntry | null {
  const sleepLog = loadSleepLog();
  return sleepLog.entries.find(e => e.date === getTodayDate()) || null;
}

/**
 * Check if we should ask about sleep quality
 */
export function shouldAskSleepQuality(): boolean {
  return state.pendingWakeDetected && !state.todaySleepQualityAsked;
}

/**
 * Check if wake was detected
 */
export function wasWakeDetected(): boolean {
  return state.pendingWakeDetected;
}

/**
 * Get time since wake was detected
 */
export function getTimeSinceWake(): number | null {
  if (!state.wakeDetectedAt) return null;
  return Date.now() - state.wakeDetectedAt.getTime();
}

/**
 * Mark that sleep quality was asked (to prevent repeat asks)
 */
export function markSleepQualityAsked(): void {
  state.todaySleepQualityAsked = true;
  state.pendingWakeDetected = false;
}

/**
 * Reset daily state (call at midnight)
 */
export function resetDailyState(): void {
  state.wasAskedAboutSleep = false;
  state.todaySleepQualityAsked = false;
  state.pendingWakeDetected = false;
  state.wakeDetectedAt = null;
}

/**
 * Get current tracker state (for debugging)
 */
export function getSleepTrackerState(): SleepTrackerState & { isNightTime: boolean; isMorningTime: boolean } {
  return {
    ...state,
    isNightTime: isNightTime(),
    isMorningTime: isMorningTime(),
  };
}

/**
 * Generate a sleep summary for the morning briefing
 */
export function getSleepSummaryForBriefing(): string | null {
  const entry = getTodaySleepEntry();
  const stats = getSleepStats(7);
  
  if (!entry) return null;
  
  const lines: string[] = [];
  
  if (entry.wakeTime) {
    const wakeDate = new Date(entry.wakeTime);
    lines.push(`Wake time: ${wakeDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })}`);
  }
  
  if (entry.totalSleepMinutes) {
    const hours = Math.floor(entry.totalSleepMinutes / 60);
    const mins = entry.totalSleepMinutes % 60;
    lines.push(`Sleep duration: ${hours}h ${mins}m`);
  }
  
  if (entry.nightAudioEvents.length > 0) {
    lines.push(`Night disturbances: ${entry.nightAudioEvents.length}`);
  }
  
  if (stats.averageSleepQuality !== null) {
    lines.push(`7-day avg quality: ${stats.averageSleepQuality}/10 (${stats.sleepQualityTrend})`);
  }
  
  return lines.length > 0 ? lines.join("\n") : null;
}

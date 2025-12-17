/**
 * Pendant Health Monitor
 * 
 * Monitors audio bytes from Omi pendant and sends alerts if the pendant
 * stops transmitting audio data to ZEKE.
 * 
 * Enhanced Features:
 * - Detects morning wake-up (first audio after overnight silence)
 * - Triggers sleep quality question and morning briefing on wake
 * - Integrates with sleep tracker for night-time audio monitoring
 * 
 * Alert Conditions:
 * - No audio bytes received within the expected interval (default: 5 minutes)
 * - Sends SMS to master admin phone number
 * 
 * The audio-bytes endpoint should call `recordAudioReceived()` when data arrives.
 */

import { getTwilioClient, getTwilioFromPhoneNumber, isTwilioConfigured } from "./twilioClient";
import { MASTER_ADMIN_PHONE } from "@shared/schema";
import { log } from "./logger";
import { 
  recordSleepAudioActivity, 
  recordPendantSilence,
  getSleepStats
} from "./sleepTracker";

const PENDANT_AUDIO_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes (slightly longer than 300s interval)
const HEALTH_CHECK_INTERVAL_MS = 60 * 1000; // Check every minute
const ALERT_COOLDOWN_MS = 15 * 60 * 1000; // Don't spam - only alert every 15 minutes max
const MORNING_BRIEFING_DELAY_MS = 2 * 60 * 1000; // Wait 2 minutes after wake before briefing

interface PendantHealthState {
  lastAudioReceivedAt: Date | null;
  lastAlertSentAt: Date | null;
  isHealthy: boolean;
  consecutiveMissedChecks: number;
  totalAudioPacketsReceived: number;
  morningBriefingSentToday: boolean;
  lastMorningBriefingDate: string | null;
  wakeUpDetectedAt: Date | null;
  pendingMorningBriefing: boolean;
}

const state: PendantHealthState = {
  lastAudioReceivedAt: null,
  lastAlertSentAt: null,
  isHealthy: true,
  consecutiveMissedChecks: 0,
  totalAudioPacketsReceived: 0,
  morningBriefingSentToday: false,
  lastMorningBriefingDate: null,
  wakeUpDetectedAt: null,
  pendingMorningBriefing: false,
};

let healthCheckInterval: NodeJS.Timeout | null = null;
let morningBriefingCallback: (() => Promise<void>) | null = null;

/**
 * Set the callback for triggering morning briefing
 */
export function setMorningBriefingCallback(callback: () => Promise<void>): void {
  morningBriefingCallback = callback;
  log("[PendantHealth] Morning briefing callback registered", "voice");
}

/**
 * Send SMS to master admin
 */
async function sendSmsToMaster(message: string): Promise<boolean> {
  try {
    const configured = await isTwilioConfigured();
    if (!configured) {
      log(`[PendantHealth] Twilio not configured - cannot send SMS`, "voice");
      return false;
    }

    const client = await getTwilioClient();
    const fromNumber = await getTwilioFromPhoneNumber();
    const toNumber = `+1${MASTER_ADMIN_PHONE}`;

    await client.messages.create({
      body: message,
      from: fromNumber,
      to: toNumber,
    });

    log(`[PendantHealth] SMS sent to ${toNumber}`, "voice");
    return true;
  } catch (error: any) {
    log(`[PendantHealth] Failed to send SMS: ${error.message}`, "voice");
    return false;
  }
}

/**
 * Send sleep quality question
 */
async function sendSleepQualityQuestion(sleepDurationMinutes: number | null): Promise<void> {
  let message = "Good morning! How did you sleep last night?\n\n";
  message += "Rate your sleep quality 1-10:\n";
  message += "A) 1-3 (Poor - restless, woke often)\n";
  message += "B) 4-5 (Fair - some issues)\n";
  message += "C) 6-7 (Good - decent rest)\n";
  message += "D) 8-10 (Great - well rested)\n\n";
  
  if (sleepDurationMinutes) {
    const hours = Math.floor(sleepDurationMinutes / 60);
    const mins = sleepDurationMinutes % 60;
    message += `I tracked about ${hours}h ${mins}m of sleep time.\n\n`;
  }
  
  message += "Reply with A, B, C, D or a number 1-10.";
  
  await sendSmsToMaster(message);
  log("[PendantHealth] Sleep quality question sent", "voice");
}

/**
 * Record that audio bytes were received from the pendant.
 * Call this from the audio-bytes endpoint.
 * 
 * Returns true if this is a wake-up event (first audio after overnight silence)
 */
export async function recordAudioReceived(): Promise<{ isWakeUp: boolean }> {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  
  // Reset daily flags if it's a new day
  if (state.lastMorningBriefingDate !== today) {
    state.morningBriefingSentToday = false;
    state.lastMorningBriefingDate = today;
    state.pendingMorningBriefing = false;
    state.wakeUpDetectedAt = null;
  }
  
  state.lastAudioReceivedAt = now;
  state.totalAudioPacketsReceived++;
  state.consecutiveMissedChecks = 0;
  
  // If we were unhealthy and now receiving audio, log recovery
  if (!state.isHealthy) {
    state.isHealthy = true;
    log(`[PendantHealth] Pendant audio connection restored. Total packets: ${state.totalAudioPacketsReceived}`, "voice");
  }
  
  // Check with sleep tracker for wake-up detection
  const sleepResult = recordSleepAudioActivity("pendant");
  
  if (sleepResult.isWakeUp && !state.morningBriefingSentToday) {
    log(`[PendantHealth] Wake-up detected! Preparing morning flow...`, "voice");
    state.wakeUpDetectedAt = now;
    state.pendingMorningBriefing = true;
    
    // Send sleep quality question
    if (sleepResult.shouldAskSleepQuality) {
      await sendSleepQualityQuestion(sleepResult.sleepDurationMinutes);
    }
    
    // Schedule morning briefing after delay
    setTimeout(async () => {
      if (state.pendingMorningBriefing && !state.morningBriefingSentToday) {
        await triggerMorningBriefing();
      }
    }, MORNING_BRIEFING_DELAY_MS);
  }
  
  return { isWakeUp: sleepResult.isWakeUp };
}

/**
 * Trigger the morning briefing
 */
async function triggerMorningBriefing(): Promise<void> {
  if (state.morningBriefingSentToday) {
    log("[PendantHealth] Morning briefing already sent today", "voice");
    return;
  }
  
  state.morningBriefingSentToday = true;
  state.pendingMorningBriefing = false;
  
  log("[PendantHealth] Triggering morning briefing...", "voice");
  
  if (morningBriefingCallback) {
    try {
      await morningBriefingCallback();
    } catch (error: any) {
      log(`[PendantHealth] Morning briefing callback failed: ${error.message}`, "voice");
    }
  } else {
    log("[PendantHealth] No morning briefing callback registered", "voice");
  }
}

/**
 * Get the current health status of the pendant
 */
export function getPendantHealthStatus(): PendantHealthState & { 
  timeoutMs: number; 
  checkIntervalMs: number;
  sleepStats: ReturnType<typeof getSleepStats>;
} {
  return {
    ...state,
    timeoutMs: PENDANT_AUDIO_TIMEOUT_MS,
    checkIntervalMs: HEALTH_CHECK_INTERVAL_MS,
    sleepStats: getSleepStats(7),
  };
}

/**
 * Check pendant health and send alerts if needed
 */
async function checkPendantHealth(): Promise<void> {
  const now = new Date();
  
  // If we've never received audio, skip the check (pendant might not be set up yet)
  if (!state.lastAudioReceivedAt) {
    return;
  }

  const timeSinceLastAudio = now.getTime() - state.lastAudioReceivedAt.getTime();
  
  if (timeSinceLastAudio > PENDANT_AUDIO_TIMEOUT_MS) {
    state.consecutiveMissedChecks++;
    state.isHealthy = false;
    
    // Notify sleep tracker of silence
    recordPendantSilence();
    
    // Check if we should send an alert (respect cooldown)
    const shouldAlert = !state.lastAlertSentAt || 
      (now.getTime() - state.lastAlertSentAt.getTime() > ALERT_COOLDOWN_MS);
    
    if (shouldAlert) {
      const minutesSinceAudio = Math.round(timeSinceLastAudio / 60000);
      const alertMessage = `ZEKE Alert: Omi pendant audio not received for ${minutesSinceAudio} minutes. ` +
        `Last audio: ${state.lastAudioReceivedAt.toLocaleTimeString('en-US', { timeZone: 'America/New_York' })} ET. ` +
        `Check that the pendant is on and Omi app is open.`;
      
      log(`[PendantHealth] Pendant unhealthy - sending alert. Minutes since audio: ${minutesSinceAudio}`, "voice");
      await sendSmsToMaster(alertMessage);
      state.lastAlertSentAt = now;
    } else {
      log(`[PendantHealth] Pendant unhealthy but in cooldown. Missed checks: ${state.consecutiveMissedChecks}`, "voice");
    }
  }
}

/**
 * Start the pendant health monitor
 */
export function startPendantHealthMonitor(): void {
  if (healthCheckInterval) {
    log("[PendantHealth] Monitor already running", "voice");
    return;
  }

  log(`[PendantHealth] Starting pendant health monitor. Timeout: ${PENDANT_AUDIO_TIMEOUT_MS / 1000}s, Check interval: ${HEALTH_CHECK_INTERVAL_MS / 1000}s`, "voice");
  
  healthCheckInterval = setInterval(async () => {
    try {
      await checkPendantHealth();
    } catch (error: any) {
      log(`[PendantHealth] Health check error: ${error.message}`, "voice");
    }
  }, HEALTH_CHECK_INTERVAL_MS);
}

/**
 * Stop the pendant health monitor
 */
export function stopPendantHealthMonitor(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    log("[PendantHealth] Monitor stopped", "voice");
  }
}

/**
 * Reset the health monitor state (for testing)
 */
export function resetPendantHealthState(): void {
  state.lastAudioReceivedAt = null;
  state.lastAlertSentAt = null;
  state.isHealthy = true;
  state.consecutiveMissedChecks = 0;
  state.totalAudioPacketsReceived = 0;
  state.morningBriefingSentToday = false;
  state.lastMorningBriefingDate = null;
  state.wakeUpDetectedAt = null;
  state.pendingMorningBriefing = false;
}

/**
 * Manually trigger morning briefing (for testing)
 */
export async function manualTriggerMorningBriefing(): Promise<void> {
  state.morningBriefingSentToday = false;
  await triggerMorningBriefing();
}

/**
 * Pendant Health Monitor
 * 
 * Monitors audio bytes from Omi pendant and sends alerts if the pendant
 * stops transmitting audio data to ZEKE.
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

const PENDANT_AUDIO_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes (slightly longer than 300s interval)
const HEALTH_CHECK_INTERVAL_MS = 60 * 1000; // Check every minute
const ALERT_COOLDOWN_MS = 15 * 60 * 1000; // Don't spam - only alert every 15 minutes max

interface PendantHealthState {
  lastAudioReceivedAt: Date | null;
  lastAlertSentAt: Date | null;
  isHealthy: boolean;
  consecutiveMissedChecks: number;
  totalAudioPacketsReceived: number;
}

const state: PendantHealthState = {
  lastAudioReceivedAt: null,
  lastAlertSentAt: null,
  isHealthy: true,
  consecutiveMissedChecks: 0,
  totalAudioPacketsReceived: 0,
};

let healthCheckInterval: NodeJS.Timeout | null = null;

/**
 * Record that audio bytes were received from the pendant.
 * Call this from the audio-bytes endpoint.
 */
export function recordAudioReceived(): void {
  const now = new Date();
  state.lastAudioReceivedAt = now;
  state.totalAudioPacketsReceived++;
  state.consecutiveMissedChecks = 0;
  
  // If we were unhealthy and now receiving audio, log recovery
  if (!state.isHealthy) {
    state.isHealthy = true;
    log(`[PendantHealth] Pendant audio connection restored. Total packets: ${state.totalAudioPacketsReceived}`, "voice");
  }
}

/**
 * Get the current health status of the pendant
 */
export function getPendantHealthStatus(): PendantHealthState & { timeoutMs: number; checkIntervalMs: number } {
  return {
    ...state,
    timeoutMs: PENDANT_AUDIO_TIMEOUT_MS,
    checkIntervalMs: HEALTH_CHECK_INTERVAL_MS,
  };
}

/**
 * Send an alert SMS to the master admin
 */
async function sendPendantAlert(message: string): Promise<boolean> {
  try {
    const configured = await isTwilioConfigured();
    if (!configured) {
      log(`[PendantHealth] Twilio not configured - cannot send alert SMS`, "voice");
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

    log(`[PendantHealth] Alert SMS sent to ${toNumber}`, "voice");
    state.lastAlertSentAt = new Date();
    return true;
  } catch (error: any) {
    log(`[PendantHealth] Failed to send alert SMS: ${error.message}`, "voice");
    return false;
  }
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
    
    // Check if we should send an alert (respect cooldown)
    const shouldAlert = !state.lastAlertSentAt || 
      (now.getTime() - state.lastAlertSentAt.getTime() > ALERT_COOLDOWN_MS);
    
    if (shouldAlert) {
      const minutesSinceAudio = Math.round(timeSinceLastAudio / 60000);
      const alertMessage = `ZEKE Alert: Omi pendant audio not received for ${minutesSinceAudio} minutes. ` +
        `Last audio: ${state.lastAudioReceivedAt.toLocaleTimeString('en-US', { timeZone: 'America/New_York' })} ET. ` +
        `Check that the pendant is on and Omi app is open.`;
      
      log(`[PendantHealth] Pendant unhealthy - sending alert. Minutes since audio: ${minutesSinceAudio}`, "voice");
      await sendPendantAlert(alertMessage);
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
}

/**
 * Twilio Client - Replit Integration
 * 
 * Uses Replit's Twilio connector for secure credential management.
 * This module provides a centralized Twilio client and phone number access.
 */

import twilio from 'twilio';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.account_sid || !connectionSettings.settings.api_key || !connectionSettings.settings.api_key_secret)) {
    throw new Error('Twilio not connected');
  }
  return {
    accountSid: connectionSettings.settings.account_sid,
    apiKey: connectionSettings.settings.api_key,
    apiKeySecret: connectionSettings.settings.api_key_secret,
    phoneNumber: connectionSettings.settings.phone_number
  };
}

export async function getTwilioClient() {
  const { accountSid, apiKey, apiKeySecret } = await getCredentials();
  return twilio(apiKey, apiKeySecret, {
    accountSid: accountSid
  });
}

export async function getTwilioFromPhoneNumber() {
  const { phoneNumber } = await getCredentials();
  return phoneNumber;
}

export async function isTwilioConfigured(): Promise<boolean> {
  try {
    await getCredentials();
    return true;
  } catch {
    return false;
  }
}

export async function getTwilioApiCredentials(): Promise<{ apiKey: string; apiKeySecret: string; accountSid: string }> {
  const { accountSid, apiKey, apiKeySecret } = await getCredentials();
  return { apiKey, apiKeySecret, accountSid };
}

/**
 * Get the Auth Token for Twilio webhook signature validation.
 * Note: Twilio webhook signatures use the account Auth Token (from Console),
 * NOT the API Key Secret used for making API calls.
 * 
 * The Auth Token must be set as TWILIO_AUTH_TOKEN environment variable/secret.
 */
export function getTwilioAuthToken(): string | null {
  return process.env.TWILIO_AUTH_TOKEN || null;
}

/**
 * Validate an incoming Twilio webhook request signature.
 * Returns true if the request is authentic, false otherwise.
 * 
 * If TWILIO_AUTH_TOKEN is not configured, returns true with a warning
 * to avoid breaking existing functionality while the token is being set up.
 */
export async function validateTwilioSignature(
  signature: string | undefined,
  url: string,
  params: Record<string, string>
): Promise<boolean> {
  const authToken = getTwilioAuthToken();
  
  // If Auth Token not configured, allow request but warn (once per session)
  if (!authToken) {
    if (!validateTwilioSignature.hasWarnedNoToken) {
      console.warn('[Twilio Security] TWILIO_AUTH_TOKEN not set - signature validation disabled. Set this secret to enable webhook security.');
      validateTwilioSignature.hasWarnedNoToken = true;
    }
    return true;  // Allow request when auth token not configured
  }
  
  if (!signature) {
    console.warn('[Twilio Security] Missing X-Twilio-Signature header - rejecting request');
    return false;
  }
  
  try {
    const twilio = await import('twilio');
    const isValid = twilio.validateRequest(authToken, signature, url, params);
    
    if (!isValid) {
      console.warn('[Twilio Security] Invalid signature - request rejected');
    } else {
      console.log('[Twilio Security] Request signature verified');
    }
    
    return isValid;
  } catch (error) {
    console.error('[Twilio Security] Signature validation error:', error);
    return false;
  }
}
// Track if we've warned about missing token
validateTwilioSignature.hasWarnedNoToken = false;

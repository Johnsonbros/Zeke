/**
 * Enhanced Plugin Architecture with Audio Streaming
 *
 * Inspired by Omi's plugin system, this service provides:
 * - Real-time audio streaming to external apps
 * - Event-driven webhook triggers
 * - HMAC webhook signing (security improvement over Omi)
 * - Retry logic with exponential backoff
 * - Plugin capability declaration
 *
 * Supported triggers:
 * - audio_bytes: Stream raw audio to external processors
 * - memory_creation: New conversation completed
 * - transcript_processed: Real-time segment updates
 * - conversation_started: Conversation detection
 * - action_item_detected: Proactive task extraction
 */

import crypto from 'crypto';

export enum PluginTrigger {
  AUDIO_BYTES = 'audio_bytes',
  MEMORY_CREATION = 'memory_creation',
  TRANSCRIPT_PROCESSED = 'transcript_processed',
  CONVERSATION_STARTED = 'conversation_started',
  ACTION_ITEM_DETECTED = 'action_item_detected',
}

export enum PluginCapability {
  CHAT = 'chat',
  MEMORIES = 'memories',
  EXTERNAL_INTEGRATION = 'external_integration',
  PROACTIVE_NOTIFICATION = 'proactive_notification',
  AUDIO_PROCESSING = 'audio_processing',
}

export interface PluginWebhook {
  id: string;
  name: string;
  url: string;
  trigger: PluginTrigger;
  userId: string;
  hmacSecret: string;
  capabilities: PluginCapability[];
  enabled: boolean;
  timeout: number; // ms
  maxRetries: number;
}

export interface WebhookPayload {
  trigger: PluginTrigger;
  timestamp: string;
  userId: string;
  data: unknown;
}

export interface WebhookResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  responseTime: number; // ms
  retries: number;
}

export interface PluginMetrics {
  totalTriggers: number;
  successfulTriggers: number;
  failedTriggers: number;
  averageResponseTime: number;
  lastTriggerTime: Date | null;
  lastError?: string;
}

const DEFAULT_WEBHOOK_TIMEOUT = 30000; // 30 seconds
const DEFAULT_MAX_RETRIES = 3;

class PluginWebhookService {
  private webhooks: Map<string, PluginWebhook> = new Map();
  private metrics: Map<string, PluginMetrics> = new Map();
  private responseTimes: Map<string, number[]> = new Map();
  private readonly MAX_RESPONSE_TIME_SAMPLES = 100;

  // Audio streaming subscriptions
  private audioStreamSubscriptions: Set<string> = new Set();

  constructor() {
    console.log('[Plugin Webhooks] Service initialized');
  }

  /**
   * Register a plugin webhook
   */
  public registerWebhook(webhook: Omit<PluginWebhook, 'id'>): string {
    const id = crypto.randomUUID();

    const fullWebhook: PluginWebhook = {
      id,
      ...webhook,
      timeout: webhook.timeout || DEFAULT_WEBHOOK_TIMEOUT,
      maxRetries: webhook.maxRetries || DEFAULT_MAX_RETRIES,
    };

    this.webhooks.set(id, fullWebhook);
    this.metrics.set(id, {
      totalTriggers: 0,
      successfulTriggers: 0,
      failedTriggers: 0,
      averageResponseTime: 0,
      lastTriggerTime: null,
    });
    this.responseTimes.set(id, []);

    // Subscribe to audio streaming if needed
    if (webhook.trigger === PluginTrigger.AUDIO_BYTES) {
      this.audioStreamSubscriptions.add(id);
    }

    console.log(`[Plugin Webhooks] Registered webhook: ${webhook.name} (${id}) for trigger: ${webhook.trigger}`);

    return id;
  }

  /**
   * Unregister a plugin webhook
   */
  public unregisterWebhook(webhookId: string): void {
    this.webhooks.delete(webhookId);
    this.metrics.delete(webhookId);
    this.responseTimes.delete(webhookId);
    this.audioStreamSubscriptions.delete(webhookId);

    console.log(`[Plugin Webhooks] Unregistered webhook: ${webhookId}`);
  }

  /**
   * Trigger webhook with payload
   */
  public async triggerWebhook(
    webhookId: string,
    payload: Omit<WebhookPayload, 'timestamp' | 'userId'>
  ): Promise<WebhookResult> {
    const webhook = this.webhooks.get(webhookId);

    if (!webhook) {
      throw new Error(`Webhook ${webhookId} not found`);
    }

    if (!webhook.enabled) {
      console.log(`[Plugin Webhooks] Webhook ${webhook.name} is disabled, skipping`);
      return {
        success: false,
        error: 'Webhook disabled',
        responseTime: 0,
        retries: 0,
      };
    }

    const fullPayload: WebhookPayload = {
      ...payload,
      timestamp: new Date().toISOString(),
      userId: webhook.userId,
    };

    const metrics = this.metrics.get(webhookId);
    if (metrics) {
      metrics.totalTriggers++;
      metrics.lastTriggerTime = new Date();
    }

    // Execute webhook with retry logic
    const result = await this.executeWithRetry(webhook, fullPayload);

    // Update metrics
    if (metrics) {
      if (result.success) {
        metrics.successfulTriggers++;
      } else {
        metrics.failedTriggers++;
        metrics.lastError = result.error;
      }

      this.recordResponseTime(webhookId, result.responseTime);
    }

    return result;
  }

  /**
   * Trigger all webhooks for a specific event type
   */
  public async triggerAll(
    trigger: PluginTrigger,
    data: unknown
  ): Promise<Map<string, WebhookResult>> {
    const results = new Map<string, WebhookResult>();

    // Find all webhooks for this trigger
    const relevantWebhooks = Array.from(this.webhooks.entries())
      .filter(([_, webhook]) => webhook.trigger === trigger && webhook.enabled);

    console.log(`[Plugin Webhooks] Triggering ${relevantWebhooks.length} webhooks for: ${trigger}`);

    // Trigger all webhooks in parallel
    await Promise.all(
      relevantWebhooks.map(async ([id, _]) => {
        try {
          const result = await this.triggerWebhook(id, { trigger, data });
          results.set(id, result);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          results.set(id, {
            success: false,
            error: errorMessage,
            responseTime: 0,
            retries: 0,
          });
        }
      })
    );

    return results;
  }

  /**
   * Stream audio bytes to subscribed plugins
   */
  public async streamAudioBytes(audioBuffer: Buffer, userId: string): Promise<void> {
    if (this.audioStreamSubscriptions.size === 0) {
      return; // No subscribers
    }

    const base64Audio = audioBuffer.toString('base64');

    // Trigger all audio_bytes webhooks
    await this.triggerAll(PluginTrigger.AUDIO_BYTES, {
      audio: base64Audio,
      format: 'base64',
      sampleRate: 16000,
      channels: 1,
      bitDepth: 16,
    });
  }

  /**
   * Execute webhook with retry logic and exponential backoff
   */
  private async executeWithRetry(
    webhook: PluginWebhook,
    payload: WebhookPayload
  ): Promise<WebhookResult> {
    let lastError: string | undefined;
    let retries = 0;

    for (let attempt = 0; attempt <= webhook.maxRetries; attempt++) {
      try {
        const startTime = performance.now();

        const result = await this.executeWebhook(webhook, payload);

        const responseTime = performance.now() - startTime;

        if (result.success) {
          return {
            success: true,
            statusCode: result.statusCode,
            responseTime,
            retries: attempt,
          };
        }

        lastError = result.error;
        retries = attempt;

        // Exponential backoff: 2s, 4s, 8s
        if (attempt < webhook.maxRetries) {
          const backoffMs = Math.pow(2, attempt + 1) * 1000;
          console.warn(`[Plugin Webhooks] Retry ${attempt + 1}/${webhook.maxRetries} after ${backoffMs}ms for ${webhook.name}`);
          await this.sleep(backoffMs);
        }

      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        retries = attempt;

        if (attempt < webhook.maxRetries) {
          const backoffMs = Math.pow(2, attempt + 1) * 1000;
          await this.sleep(backoffMs);
        }
      }
    }

    return {
      success: false,
      error: lastError || 'Unknown error',
      responseTime: 0,
      retries,
    };
  }

  /**
   * Execute webhook HTTP request
   */
  private async executeWebhook(
    webhook: PluginWebhook,
    payload: WebhookPayload
  ): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const timestamp = Date.now();
    const signature = this.generateHMAC(webhook.hmacSecret, payload, timestamp);

    const url = `${webhook.url}?uid=${webhook.userId}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), webhook.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ZEKE-Timestamp': timestamp.toString(),
          'X-ZEKE-Signature': signature,
          'X-ZEKE-Webhook-Id': webhook.id,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          statusCode: response.status,
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }

      console.log(`[Plugin Webhooks] ✓ ${webhook.name} responded with ${response.status}`);

      return {
        success: true,
        statusCode: response.status,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Plugin Webhooks] ✗ ${webhook.name} failed:`, errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Generate HMAC signature for webhook security
   */
  private generateHMAC(secret: string, payload: WebhookPayload, timestamp: number): string {
    const data = `${timestamp}.${JSON.stringify(payload)}`;
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Sleep utility for retry backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Record response time for metrics
   */
  private recordResponseTime(webhookId: string, responseTime: number): void {
    const times = this.responseTimes.get(webhookId) || [];
    times.push(responseTime);

    if (times.length > this.MAX_RESPONSE_TIME_SAMPLES) {
      times.shift();
    }

    const metrics = this.metrics.get(webhookId);
    if (metrics) {
      metrics.averageResponseTime = times.reduce((a, b) => a + b, 0) / times.length;
    }

    this.responseTimes.set(webhookId, times);
  }

  /**
   * Get webhook by ID
   */
  public getWebhook(webhookId: string): PluginWebhook | undefined {
    return this.webhooks.get(webhookId);
  }

  /**
   * Get all webhooks for a user
   */
  public getUserWebhooks(userId: string): PluginWebhook[] {
    return Array.from(this.webhooks.values())
      .filter(webhook => webhook.userId === userId);
  }

  /**
   * Get metrics for a webhook
   */
  public getMetrics(webhookId: string): PluginMetrics | undefined {
    return this.metrics.get(webhookId);
  }

  /**
   * Get all webhooks
   */
  public getAllWebhooks(): PluginWebhook[] {
    return Array.from(this.webhooks.values());
  }

  /**
   * Enable/disable webhook
   */
  public setWebhookEnabled(webhookId: string, enabled: boolean): void {
    const webhook = this.webhooks.get(webhookId);
    if (webhook) {
      webhook.enabled = enabled;
      console.log(`[Plugin Webhooks] Webhook ${webhook.name} ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * Update webhook configuration
   */
  public updateWebhook(webhookId: string, updates: Partial<PluginWebhook>): void {
    const webhook = this.webhooks.get(webhookId);
    if (webhook) {
      Object.assign(webhook, updates);
      console.log(`[Plugin Webhooks] Updated webhook: ${webhook.name}`);
    }
  }

  /**
   * Clear all webhooks (for testing)
   */
  public clearAll(): void {
    this.webhooks.clear();
    this.metrics.clear();
    this.responseTimes.clear();
    this.audioStreamSubscriptions.clear();
    console.log('[Plugin Webhooks] Cleared all webhooks');
  }
}

// Singleton instance
export const pluginWebhookService = new PluginWebhookService();

// Export for testing
export { PluginWebhookService };

/**
 * Wearable Integration API Client
 * 
 * Client-side API for interacting with Omi and Limitless wearable devices.
 * Provides methods for:
 * - Limitless API configuration and lifelog syncing
 * - Voice enrollment for speaker identification
 * - Conversation session management
 * - Offline sync queue management
 */

import { getLocalApiUrl, getAuthHeaders } from "./query-client";
import * as FileSystem from "expo-file-system";

export interface LimitlessStatus {
  configured: boolean;
  connected: boolean;
  lastSyncAt?: string;
  error?: string;
}

export interface LimitlessSyncResult {
  success: boolean;
  syncedCount: number;
  sessionIds: string[];
  errors: string[];
}

export interface LimitlessLifelog {
  id: string;
  title: string;
  markdown: string;
  startTime: string;
  endTime: string;
}

export interface VoiceProfile {
  id: string;
  name: string;
  hasVoiceEnrollment: boolean;
  enrollmentQuality?: "low" | "medium" | "high";
  createdAt: string;
}

export interface VoiceEnrollmentResult {
  success: boolean;
  profileId?: string;
  message: string;
}

export interface SpeakerMatchResult {
  matched: boolean;
  profileId?: string;
  profileName?: string;
  confidence: number;
}

export interface ConversationSession {
  id: string;
  deviceId: string;
  externalId?: string;
  source: string;
  status: string;
  startTime: string;
  endTime?: string;
  transcript?: string;
  speakers?: Array<{ name: string; id: string }>;
  memoryId?: string;
  createdAt: string;
}

export interface OfflineSyncItem {
  id: string;
  deviceId: string;
  recordingType: string;
  duration?: number;
  priority: number;
  status: string;
  retryCount: number;
  errorMessage?: string;
  recordedAt: string;
}

class WearableApiClient {
  private getBaseUrl(): string {
    return getLocalApiUrl();
  }

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.getBaseUrl()}${endpoint}`;
    const headers = {
      ...getAuthHeaders(),
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  // ============================================
  // Limitless API Methods
  // ============================================

  async configureLimitless(deviceId: string, apiKey: string): Promise<{ success: boolean; message: string }> {
    return this.fetch("/api/wearable/limitless/configure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, apiKey }),
    });
  }

  async getLimitlessStatus(deviceId: string): Promise<LimitlessStatus> {
    return this.fetch(`/api/wearable/limitless/status?deviceId=${encodeURIComponent(deviceId)}`);
  }

  async syncLimitless(deviceId: string): Promise<LimitlessSyncResult> {
    return this.fetch("/api/wearable/limitless/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
    });
  }

  async getLimitlessLifelogs(
    deviceId: string,
    options: { limit?: number; hours?: number } = {}
  ): Promise<{ lifelogs: LimitlessLifelog[]; total: number }> {
    const params = new URLSearchParams({ deviceId });
    if (options.limit) params.append("limit", options.limit.toString());
    if (options.hours) params.append("hours", options.hours.toString());
    return this.fetch(`/api/wearable/limitless/lifelogs?${params.toString()}`);
  }

  // ============================================
  // Voice Enrollment Methods
  // ============================================

  async enrollVoice(
    deviceId: string,
    name: string,
    audioUri: string
  ): Promise<VoiceEnrollmentResult> {
    const formData = new FormData();
    formData.append("deviceId", deviceId);
    formData.append("name", name);

    const fileInfo = await FileSystem.getInfoAsync(audioUri);
    if (!fileInfo.exists) {
      throw new Error("Audio file not found");
    }

    const file = new FileSystem.File(audioUri);
    formData.append("audio", file as unknown as Blob);

    const url = `${this.getBaseUrl()}/api/wearable/voice/enroll`;
    const response = await fetch(url, {
      method: "POST",
      headers: getAuthHeaders(),
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, message: error.error || "Enrollment failed" };
    }

    return response.json();
  }

  async matchVoice(deviceId: string, audioUri: string): Promise<SpeakerMatchResult> {
    const formData = new FormData();
    formData.append("deviceId", deviceId);

    const file = new FileSystem.File(audioUri);
    formData.append("audio", file as unknown as Blob);

    const url = `${this.getBaseUrl()}/api/wearable/voice/match`;
    const response = await fetch(url, {
      method: "POST",
      headers: getAuthHeaders(),
      body: formData,
    });

    return response.json();
  }

  async getVoiceProfiles(deviceId: string): Promise<{ profiles: VoiceProfile[] }> {
    return this.fetch(`/api/wearable/voice/profiles?deviceId=${encodeURIComponent(deviceId)}`);
  }

  async deleteVoiceProfile(profileId: string): Promise<{ success: boolean }> {
    return this.fetch(`/api/wearable/voice/profiles/${profileId}`, {
      method: "DELETE",
    });
  }

  // ============================================
  // Conversation Sessions Methods
  // ============================================

  async getSessions(
    options: { deviceId?: string; source?: string; limit?: number } = {}
  ): Promise<{ sessions: ConversationSession[] }> {
    const params = new URLSearchParams();
    if (options.deviceId) params.append("deviceId", options.deviceId);
    if (options.source) params.append("source", options.source);
    if (options.limit) params.append("limit", options.limit.toString());
    return this.fetch(`/api/wearable/sessions?${params.toString()}`);
  }

  async getSession(sessionId: string): Promise<ConversationSession> {
    return this.fetch(`/api/wearable/sessions/${sessionId}`);
  }

  async createMemoryFromSession(sessionId: string): Promise<{ success: boolean; memory: unknown }> {
    return this.fetch(`/api/wearable/sessions/${sessionId}/create-memory`, {
      method: "POST",
    });
  }

  // ============================================
  // Offline Sync Queue Methods
  // ============================================

  async getSyncQueue(
    options: { deviceId?: string; status?: string } = {}
  ): Promise<{ items: OfflineSyncItem[] }> {
    const params = new URLSearchParams();
    if (options.deviceId) params.append("deviceId", options.deviceId);
    if (options.status) params.append("status", options.status);
    return this.fetch(`/api/wearable/sync-queue?${params.toString()}`);
  }

  async addToSyncQueue(item: {
    deviceId: string;
    recordingType: string;
    audioData?: string;
    duration?: number;
    priority?: number;
  }): Promise<{ success: boolean; item: OfflineSyncItem }> {
    return this.fetch("/api/wearable/sync-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
  }

  async updateSyncQueueItem(
    itemId: string,
    updates: { status?: string; errorMessage?: string }
  ): Promise<OfflineSyncItem> {
    return this.fetch(`/api/wearable/sync-queue/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
  }
}

export const wearableApi = new WearableApiClient();

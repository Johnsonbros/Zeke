/**
 * Audio Streaming Client
 * 
 * Handles WebSocket connection to ZEKE backend for audio streaming.
 * Implements the spec-compliant protocol with:
 * - Config message format
 * - Heartbeat mechanism (30-second interval)
 * - Silence marker support
 * - Binary Opus packet streaming
 */

import { Platform } from "react-native";
import { getApiUrl } from "./query-client";
import { getVADClient, type VADResult } from "./vad-client";

export interface AudioStreamConfig {
  codec: "opus" | "pcm";
  sampleRate: number;
  frameFormat: "raw_opus_packets" | "pcm_16bit";
  deviceType: "omi" | "limitless" | "phone_mic";
  deviceId: string;
}

export interface TranscriptEvent {
  text: string;
  isFinal: boolean;
}

export type TranscriptCallback = (event: TranscriptEvent) => void;
export type ErrorCallback = (error: string) => void;
export type ConnectionCallback = (connected: boolean) => void;

const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds

class AudioStreamingClient {
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private config: AudioStreamConfig | null = null;
  private batteryLevel: number | null = null;
  private signalStrength: number | null = null;
  private isConfigured: boolean = false;
  
  private transcriptCallbacks: Set<TranscriptCallback> = new Set();
  private errorCallbacks: Set<ErrorCallback> = new Set();
  private connectionCallbacks: Set<ConnectionCallback> = new Set();

  /**
   * Connect to the audio WebSocket endpoint
   */
  async connect(config: AudioStreamConfig): Promise<boolean> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log("[AudioStream] Already connected");
      return true;
    }

    this.config = config;
    const apiUrl = getApiUrl();
    const wsUrl = apiUrl.replace(/^http/, "ws") + "/ws/audio";

    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log("[AudioStream] WebSocket connected");
          this.sendConfig();
          this.startHeartbeat();
          this.notifyConnection(true);
          resolve(true);
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error("[AudioStream] WebSocket error:", error);
          this.notifyError("WebSocket connection error");
          resolve(false);
        };

        this.ws.onclose = () => {
          console.log("[AudioStream] WebSocket closed");
          this.cleanup();
          this.notifyConnection(false);
        };
      } catch (error) {
        console.error("[AudioStream] Failed to create WebSocket:", error);
        resolve(false);
      }
    });
  }

  /**
   * Send config message to server
   */
  private sendConfig(): void {
    if (!this.ws || !this.config) return;

    const configMessage = {
      type: "config",
      codec: this.config.codec,
      sample_rate: this.config.sampleRate,
      frame_format: this.config.frameFormat,
      device_type: this.config.deviceType,
      device_id: this.config.deviceId,
    };

    this.ws.send(JSON.stringify(configMessage));
    console.log("[AudioStream] Sent config:", configMessage);
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Send heartbeat message
   */
  private sendHeartbeat(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const heartbeatMessage: any = { type: "heartbeat" };
    
    if (this.batteryLevel !== null) {
      heartbeatMessage.battery_level = this.batteryLevel;
    }
    if (this.signalStrength !== null) {
      heartbeatMessage.signal_strength = this.signalStrength;
    }

    this.ws.send(JSON.stringify(heartbeatMessage));
    console.log("[AudioStream] Sent heartbeat");
  }

  /**
   * Update device status for heartbeat
   */
  updateDeviceStatus(batteryLevel?: number, signalStrength?: number): void {
    if (batteryLevel !== undefined) this.batteryLevel = batteryLevel;
    if (signalStrength !== undefined) this.signalStrength = signalStrength;
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case "config_ack":
          this.isConfigured = true;
          console.log("[AudioStream] Config acknowledged");
          break;

        case "TRANSCRIPTION":
          this.notifyTranscript({
            text: message.text || "",
            isFinal: message.isFinal || false,
          });
          break;

        case "heartbeat_ack":
          console.log("[AudioStream] Heartbeat acknowledged");
          break;

        case "ERROR":
          console.error("[AudioStream] Server error:", message.message);
          this.notifyError(message.message || "Unknown server error");
          break;
      }
    } catch (error) {
      console.error("[AudioStream] Failed to parse message:", error);
    }
  }

  /**
   * Send audio data (base64 encoded)
   */
  sendAudio(base64Data: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isConfigured) {
      return;
    }

    // Check VAD before sending
    const vadClient = getVADClient();
    const vadResult = vadClient.processBase64Audio(base64Data);

    if (vadResult.isSpeech) {
      const audioMessage = {
        type: "audio",
        data: base64Data,
      };
      this.ws.send(JSON.stringify(audioMessage));
    } else if (vadResult.silenceDurationMs > 0 && vadResult.silenceDurationMs < 100) {
      // Only send silence marker once when silence is first detected
      this.sendSilence();
    }
  }

  /**
   * Send raw audio data without VAD filtering (JSON format)
   */
  sendAudioRaw(base64Data: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isConfigured) {
      return;
    }

    const audioMessage = {
      type: "audio",
      data: base64Data,
    };
    this.ws.send(JSON.stringify(audioMessage));
  }

  /**
   * Send binary Opus frame directly (spec-compliant format)
   * Use this for raw Opus packets from wearable devices
   */
  sendBinaryOpus(opusData: Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isConfigured) {
      return;
    }

    // Send as binary data (ArrayBuffer)
    this.ws.send(opusData);
  }

  /**
   * Send silence marker
   */
  sendSilence(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(JSON.stringify({ type: "silence" }));
  }

  /**
   * Stop streaming and close connection
   */
  stop(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(JSON.stringify({ type: "stop" }));
    console.log("[AudioStream] Sent stop message");
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.stop();
      this.ws.close();
    }
    this.cleanup();
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.stopHeartbeat();
    this.ws = null;
    this.isConfigured = false;
  }

  /**
   * Check if connected and configured
   */
  get isConnected(): boolean {
    return this.ws !== null && 
           this.ws.readyState === WebSocket.OPEN && 
           this.isConfigured;
  }

  // Callback management
  onTranscript(callback: TranscriptCallback): () => void {
    this.transcriptCallbacks.add(callback);
    return () => this.transcriptCallbacks.delete(callback);
  }

  onError(callback: ErrorCallback): () => void {
    this.errorCallbacks.add(callback);
    return () => this.errorCallbacks.delete(callback);
  }

  onConnection(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.add(callback);
    return () => this.connectionCallbacks.delete(callback);
  }

  private notifyTranscript(event: TranscriptEvent): void {
    this.transcriptCallbacks.forEach((cb) => cb(event));
  }

  private notifyError(error: string): void {
    this.errorCallbacks.forEach((cb) => cb(error));
  }

  private notifyConnection(connected: boolean): void {
    this.connectionCallbacks.forEach((cb) => cb(connected));
  }
}

// Singleton instance
let audioStreamingInstance: AudioStreamingClient | null = null;

export function getAudioStreamingClient(): AudioStreamingClient {
  if (!audioStreamingInstance) {
    audioStreamingInstance = new AudioStreamingClient();
  }
  return audioStreamingInstance;
}

export { AudioStreamingClient };

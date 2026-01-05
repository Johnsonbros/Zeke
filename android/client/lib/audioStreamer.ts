import { bluetoothService, type AudioChunk, type DeviceType } from "./bluetooth";
import { getApiUrl } from "./query-client";

export type TranscriptionCallback = (text: string, isFinal: boolean) => void;
export type WarningCallback = (message: string) => void;
export type MetricsCallback = (metrics: StreamingMetrics) => void;

export interface StreamingMetrics {
  framesReceived: number;
  framesSent: number;
  bytesReceived: number;
  bytesSent: number;
  transcriptionsReceived: number;
  lastFrameTimestamp: number;
  lastTranscriptionTimestamp: number;
  wsConnected: boolean;
  configAcknowledged: boolean;
}

export interface AudioStreamer {
  start(
    deviceId: string,
    onTranscription: TranscriptionCallback,
    onWarning?: WarningCallback,
  ): Promise<void>;
  stop(): Promise<string>;
  isStreaming(): boolean;
  getMetrics(): StreamingMetrics;
  onMetricsUpdate(callback: MetricsCallback): () => void;
}

interface ServerMessage {
  type: "TRANSCRIPTION" | "ERROR" | "WARNING" | "config_ack" | "heartbeat_ack";
  text?: string;
  isFinal?: boolean;
  message?: string;
}

const HEARTBEAT_INTERVAL_MS = 30000;

function getWebSocketUrl(): string {
  const apiUrl = getApiUrl();
  const wsProtocol = apiUrl.startsWith("https") ? "wss" : "ws";
  const host = apiUrl.replace(/^https?:\/\//, "");
  return `${wsProtocol}://${host}/ws/audio`;
}

class AudioStreamerImpl implements AudioStreamer {
  private ws: WebSocket | null = null;
  private unsubscribeAudioChunk: (() => void) | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private transcriptionCallback: TranscriptionCallback | null = null;
  private warningCallback: WarningCallback | null = null;
  private fullTranscript: string = "";
  private streaming: boolean = false;
  private isConfigured: boolean = false;
  private deviceId: string = "";
  private deviceType: DeviceType = "omi";
  private resolveStop: ((value: string) => void) | null = null;
  private pendingChunks: Uint8Array[] = [];
  private metricsCallbacks: Set<MetricsCallback> = new Set();
  private metrics: StreamingMetrics = this.createEmptyMetrics();

  private createEmptyMetrics(): StreamingMetrics {
    return {
      framesReceived: 0,
      framesSent: 0,
      bytesReceived: 0,
      bytesSent: 0,
      transcriptionsReceived: 0,
      lastFrameTimestamp: 0,
      lastTranscriptionTimestamp: 0,
      wsConnected: false,
      configAcknowledged: false,
    };
  }

  private notifyMetricsUpdate(): void {
    this.metricsCallbacks.forEach((callback) => callback({ ...this.metrics }));
  }

  public getMetrics(): StreamingMetrics {
    return { ...this.metrics };
  }

  public onMetricsUpdate(callback: MetricsCallback): () => void {
    this.metricsCallbacks.add(callback);
    callback({ ...this.metrics });
    return () => {
      this.metricsCallbacks.delete(callback);
    };
  }

  public async start(
    deviceId: string,
    onTranscription: TranscriptionCallback,
    onWarning?: WarningCallback,
  ): Promise<void> {
    if (this.streaming) {
      console.warn("AudioStreamer already streaming");
      return;
    }

    this.deviceId = deviceId;
    this.transcriptionCallback = onTranscription;
    this.warningCallback = onWarning || null;
    this.fullTranscript = "";
    this.isConfigured = false;
    this.pendingChunks = [];
    this.metrics = this.createEmptyMetrics();
    this.notifyMetricsUpdate();

    const connectedDevice = await bluetoothService.getConnectedDevice();
    this.deviceType = connectedDevice?.type || "omi";

    return new Promise((resolve, reject) => {
      const wsUrl = getWebSocketUrl();
      console.log("[AudioStreamer] Connecting to WebSocket:", wsUrl);

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("[AudioStreamer] WebSocket connected");
        this.metrics.wsConnected = true;
        this.notifyMetricsUpdate();

        this.sendConfig();

        this.unsubscribeAudioChunk = bluetoothService.onAudioChunk(
          (chunk: AudioChunk) => {
            this.metrics.framesReceived++;
            this.metrics.bytesReceived += chunk.data.length;
            this.metrics.lastFrameTimestamp = Date.now();
            this.sendBinaryOpus(chunk.data);
            this.notifyMetricsUpdate();
          },
        );

        this.streaming = true;
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: ServerMessage = JSON.parse(event.data);
          this.handleServerMessage(message);
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        if (!this.streaming) {
          reject(new Error("WebSocket connection failed"));
        }
      };

      this.ws.onclose = () => {
        console.log("WebSocket closed");
        this.metrics.wsConnected = false;
        this.notifyMetricsUpdate();
        this.cleanup();
      };
    });
  }

  public async stop(): Promise<string> {
    if (!this.streaming) {
      return this.fullTranscript;
    }

    return new Promise((resolve) => {
      this.resolveStop = resolve;

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "stop" }));
      }

      setTimeout(() => {
        if (this.resolveStop) {
          this.resolveStop(this.fullTranscript);
          this.resolveStop = null;
        }
        this.cleanup();
      }, 3000);
    });
  }

  public isStreaming(): boolean {
    return this.streaming;
  }

  private sendConfig(): void {
    if (!this.ws) return;

    const configMessage = {
      type: "config",
      codec: "opus",
      sample_rate: 16000,
      frame_format: "raw_opus_packets",
      device_type: this.deviceType,
      device_id: this.deviceId,
    };

    this.ws.send(JSON.stringify(configMessage));
    console.log("[AudioStreamer] Sent config:", configMessage);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const connectedDevice = await bluetoothService.getConnectedDevice();
    const heartbeatMessage: any = { type: "heartbeat" };
    
    if (connectedDevice?.batteryLevel !== undefined) {
      heartbeatMessage.battery_level = connectedDevice.batteryLevel;
    }
    if (connectedDevice?.signalStrength !== undefined) {
      heartbeatMessage.signal_strength = connectedDevice.signalStrength;
    }

    this.ws.send(JSON.stringify(heartbeatMessage));
  }

  private sendBinaryOpus(opusData: Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    if (!this.isConfigured) {
      this.pendingChunks.push(opusData);
      return;
    }

    this.ws.send(opusData);
    this.metrics.framesSent++;
    this.metrics.bytesSent += opusData.length;
  }

  private flushPendingChunks(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    console.log(`[AudioStreamer] Flushing ${this.pendingChunks.length} buffered chunks`);
    for (const chunk of this.pendingChunks) {
      this.ws.send(chunk);
    }
    this.pendingChunks = [];
  }

  private handleServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case "config_ack":
        this.isConfigured = true;
        this.metrics.configAcknowledged = true;
        this.notifyMetricsUpdate();
        this.flushPendingChunks();
        this.startHeartbeat();
        console.log("[AudioStreamer] Config acknowledged, ready for audio");
        break;

      case "TRANSCRIPTION":
        if (message.text) {
          this.fullTranscript +=
            (this.fullTranscript ? " " : "") + message.text;
          this.metrics.transcriptionsReceived++;
          this.metrics.lastTranscriptionTimestamp = Date.now();
          this.notifyMetricsUpdate();
          this.transcriptionCallback?.(message.text, message.isFinal || false);
        }

        if (message.isFinal && this.resolveStop) {
          this.resolveStop(this.fullTranscript);
          this.resolveStop = null;
          this.cleanup();
        }
        break;

      case "WARNING":
        console.warn("[AudioStreamer] Server warning:", message.message);
        this.warningCallback?.(message.message || "Unknown warning");
        break;

      case "ERROR":
        console.error("[AudioStreamer] Server error:", message.message);
        break;

      case "heartbeat_ack":
        break;

      default:
        console.warn("[AudioStreamer] Unknown message type:", (message as any).type);
    }
  }

  private cleanup(): void {
    this.stopHeartbeat();

    if (this.unsubscribeAudioChunk) {
      this.unsubscribeAudioChunk();
      this.unsubscribeAudioChunk = null;
    }

    if (this.ws) {
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }

    this.streaming = false;
    this.isConfigured = false;
    this.metrics.wsConnected = false;
    this.metrics.configAcknowledged = false;
    this.notifyMetricsUpdate();
    this.transcriptionCallback = null;
    this.warningCallback = null;
  }
}

export const audioStreamer: AudioStreamer = new AudioStreamerImpl();

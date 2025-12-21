import { getApiUrl } from "./query-client";
import { bluetoothService } from "./bluetooth";

export type TranscriptionCallback = (
  transcript: string,
  isFinal: boolean,
) => void;
export type ConnectionStateCallback = (state: DeepgramConnectionState) => void;
export type ErrorCallback = (error: string) => void;

export type DeepgramConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

interface DeepgramAlternative {
  transcript: string;
  confidence: number;
  words?: DeepgramWord[];
}

interface DeepgramChannel {
  alternatives: DeepgramAlternative[];
}

interface DeepgramResponse {
  type:
    | "Results"
    | "Metadata"
    | "UtteranceEnd"
    | "connected"
    | "disconnected"
    | "error";
  channel_index?: number[];
  duration?: number;
  start?: number;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: DeepgramChannel;
  message?: string;
}

interface TranscriptSegment {
  text: string;
  timestamp: number;
  isFinal: boolean;
  speaker?: string;
}

interface DeepgramStatus {
  configured: boolean;
  wsEndpoint: string;
}

class DeepgramService {
  private ws: WebSocket | null = null;
  private connectionState: DeepgramConnectionState = "disconnected";
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 1000;

  private transcriptionCallbacks: TranscriptionCallback[] = [];
  private connectionStateCallbacks: ConnectionStateCallback[] = [];
  private errorCallbacks: ErrorCallback[] = [];

  private fullTranscript: string = "";
  private transcriptSegments: TranscriptSegment[] = [];
  private isStreaming = false;
  private unsubscribeBluetooth: (() => void) | null = null;
  private audioBuffer: Uint8Array[] = [];
  private sessionId: string | null = null;
  private sessionStartTime: number = 0;
  private configLoaded = false;
  private isConfiguredFlag = false;

  public async fetchConfig(): Promise<boolean> {
    if (this.configLoaded) {
      return this.isConfiguredFlag;
    }

    try {
      const baseUrl = getApiUrl();
      const statusUrl = new URL("/api/deepgram/status", baseUrl);
      const response = await fetch(statusUrl.toString());

      if (!response.ok) {
        console.error("Failed to fetch Deepgram status:", response.status);
        return false;
      }

      const status: DeepgramStatus = await response.json();
      this.isConfiguredFlag = status.configured;
      this.configLoaded = true;
      return this.isConfiguredFlag;
    } catch (error) {
      console.error("Error fetching Deepgram status:", error);
      return false;
    }
  }

  public isConfigured(): boolean {
    return this.configLoaded && this.isConfiguredFlag;
  }

  public getConnectionState(): DeepgramConnectionState {
    return this.connectionState;
  }

  public getFullTranscript(): string {
    return this.fullTranscript;
  }

  public getTranscriptSegments(): TranscriptSegment[] {
    return [...this.transcriptSegments];
  }

  public onTranscription(callback: TranscriptionCallback): () => void {
    this.transcriptionCallbacks.push(callback);
    return () => {
      this.transcriptionCallbacks = this.transcriptionCallbacks.filter(
        (cb) => cb !== callback,
      );
    };
  }

  public onConnectionStateChange(
    callback: ConnectionStateCallback,
  ): () => void {
    this.connectionStateCallbacks.push(callback);
    callback(this.connectionState);
    return () => {
      this.connectionStateCallbacks = this.connectionStateCallbacks.filter(
        (cb) => cb !== callback,
      );
    };
  }

  public onError(callback: ErrorCallback): () => void {
    this.errorCallbacks.push(callback);
    return () => {
      this.errorCallbacks = this.errorCallbacks.filter((cb) => cb !== callback);
    };
  }

  private notifyTranscription(transcript: string, isFinal: boolean): void {
    this.transcriptionCallbacks.forEach((cb) => cb(transcript, isFinal));
  }

  private notifyConnectionStateChange(): void {
    this.connectionStateCallbacks.forEach((cb) => cb(this.connectionState));
  }

  private notifyError(error: string): void {
    this.errorCallbacks.forEach((cb) => cb(error));
  }

  private buildProxyWebSocketUrl(): string {
    const baseUrl = getApiUrl();
    const wsProtocol = baseUrl.startsWith("https") ? "wss" : "ws";
    const host = baseUrl.replace(/^https?:\/\//, "");
    return `${wsProtocol}://${host}/ws/deepgram`;
  }

  public async connect(): Promise<boolean> {
    if (!this.isConfiguredFlag) {
      const configured = await this.fetchConfig();
      if (!configured) {
        this.notifyError("Deepgram transcription is not configured");
        return false;
      }
    }

    if (
      this.connectionState === "connected" ||
      this.connectionState === "connecting"
    ) {
      return true;
    }

    this.connectionState = "connecting";
    this.notifyConnectionStateChange();
    this.sessionId = `session_${Date.now()}`;
    this.sessionStartTime = Date.now();

    return new Promise((resolve) => {
      try {
        const url = this.buildProxyWebSocketUrl();
        console.log("[Deepgram] Connecting to proxy:", url);
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log("[Deepgram] WebSocket connected to proxy");
        };

        this.ws.onmessage = (event) => {
          try {
            const data: DeepgramResponse = JSON.parse(event.data);

            if (data.type === "connected") {
              console.log("[Deepgram] Connected to transcription service");
              this.connectionState = "connected";
              this.reconnectAttempts = 0;
              this.notifyConnectionStateChange();
              resolve(true);
            } else if (data.type === "error") {
              console.error("[Deepgram] Server error:", data.message);
              this.connectionState = "error";
              this.notifyConnectionStateChange();
              this.notifyError(data.message || "Transcription error");
              resolve(false);
            } else if (data.type === "disconnected") {
              console.log("[Deepgram] Disconnected from transcription service");
              this.handleDisconnect();
            } else {
              this.handleTranscriptionMessage(data);
            }
          } catch (error) {
            console.error("[Deepgram] Error parsing message:", error);
          }
        };

        this.ws.onerror = (error) => {
          console.error("[Deepgram] WebSocket error:", error);
          this.connectionState = "error";
          this.notifyConnectionStateChange();
          this.notifyError("WebSocket connection error");
          resolve(false);
        };

        this.ws.onclose = (event) => {
          console.log("[Deepgram] WebSocket closed:", event.code, event.reason);
          this.handleDisconnect();
        };

        setTimeout(() => {
          if (this.connectionState === "connecting") {
            this.connectionState = "error";
            this.notifyConnectionStateChange();
            this.notifyError("Connection timeout");
            resolve(false);
          }
        }, 10000);
      } catch (error) {
        console.error("[Deepgram] Failed to create WebSocket:", error);
        this.connectionState = "error";
        this.notifyConnectionStateChange();
        this.notifyError("Failed to connect");
        resolve(false);
      }
    });
  }

  private handleDisconnect(): void {
    const wasConnected = this.connectionState === "connected";
    this.connectionState = "disconnected";
    this.notifyConnectionStateChange();

    if (
      wasConnected &&
      this.isStreaming &&
      this.reconnectAttempts < this.maxReconnectAttempts
    ) {
      this.reconnectAttempts++;
      console.log(
        `[Deepgram] Attempting reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
      );
      setTimeout(
        () => this.connect(),
        this.reconnectDelay * this.reconnectAttempts,
      );
    }
  }

  private handleTranscriptionMessage(data: DeepgramResponse): void {
    if (data.type === "Results" && data.channel?.alternatives?.[0]) {
      const alternative = data.channel.alternatives[0];
      const transcript = alternative.transcript;
      const isFinal = data.is_final === true;

      if (transcript) {
        if (isFinal) {
          this.fullTranscript += (this.fullTranscript ? " " : "") + transcript;
          this.transcriptSegments.push({
            text: transcript,
            timestamp: Date.now(),
            isFinal: true,
          });
        }

        this.notifyTranscription(transcript, isFinal);
      }
    }
  }

  public disconnect(): void {
    this.stopStreaming();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connectionState = "disconnected";
    this.notifyConnectionStateChange();
  }

  public async startStreamingFromBluetooth(): Promise<boolean> {
    const connected = await this.connect();
    if (!connected) {
      return false;
    }

    this.isStreaming = true;
    this.audioBuffer = [];

    this.unsubscribeBluetooth = bluetoothService.onAudioData(
      (audioData: Uint8Array) => {
        this.sendAudioData(audioData);
      },
    );

    const streamStarted = await bluetoothService.startStreamingAudio();
    if (!streamStarted) {
      this.stopStreaming();
      return false;
    }

    console.log("[Deepgram] Started streaming audio from Bluetooth");
    return true;
  }

  public stopStreaming(): void {
    this.isStreaming = false;

    if (this.unsubscribeBluetooth) {
      this.unsubscribeBluetooth();
      this.unsubscribeBluetooth = null;
    }

    bluetoothService.stopStreamingAudio();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "finalize" }));
    }

    console.log("[Deepgram] Stopped streaming");
  }

  public sendAudioData(data: Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("[Deepgram] Cannot send audio - not connected");
      return;
    }

    this.audioBuffer.push(data);
    this.ws.send(data);
  }

  public clearSession(): void {
    this.fullTranscript = "";
    this.transcriptSegments = [];
    this.audioBuffer = [];
    this.sessionId = null;
  }

  public getSessionDuration(): number {
    if (!this.sessionStartTime) return 0;
    return Math.floor((Date.now() - this.sessionStartTime) / 1000);
  }

  public getAudioBufferSize(): number {
    return this.audioBuffer.reduce((total, chunk) => total + chunk.length, 0);
  }
}

export const deepgramService = new DeepgramService();

import { bluetoothService, type AudioChunk } from "./bluetooth";
import { getApiUrl } from "./query-client";

export type TranscriptionCallback = (text: string, isFinal: boolean) => void;

export interface AudioStreamer {
  start(
    deviceId: string,
    onTranscription: TranscriptionCallback,
  ): Promise<void>;
  stop(): Promise<string>;
  isStreaming(): boolean;
}

interface ServerMessage {
  type: "TRANSCRIPTION" | "ERROR";
  text?: string;
  isFinal?: boolean;
  message?: string;
}

const SEND_INTERVAL_MS = 5000;

function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function getWebSocketUrl(): string {
  const apiUrl = getApiUrl();
  const wsProtocol = apiUrl.startsWith("https") ? "wss" : "ws";
  const host = apiUrl.replace(/^https?:\/\//, "");
  return `${wsProtocol}://${host}/ws/audio`;
}

class AudioStreamerImpl implements AudioStreamer {
  private ws: WebSocket | null = null;
  private audioChunkBuffer: Uint8Array[] = [];
  private sendInterval: ReturnType<typeof setInterval> | null = null;
  private unsubscribeAudioChunk: (() => void) | null = null;
  private transcriptionCallback: TranscriptionCallback | null = null;
  private fullTranscript: string = "";
  private streaming: boolean = false;
  private deviceId: string = "";
  private resolveStop: ((value: string) => void) | null = null;

  public async start(
    deviceId: string,
    onTranscription: TranscriptionCallback,
  ): Promise<void> {
    if (this.streaming) {
      console.warn("AudioStreamer already streaming");
      return;
    }

    this.deviceId = deviceId;
    this.transcriptionCallback = onTranscription;
    this.fullTranscript = "";
    this.audioChunkBuffer = [];

    return new Promise((resolve, reject) => {
      const wsUrl = getWebSocketUrl();
      console.log("Connecting to WebSocket:", wsUrl);

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("WebSocket connected");

        this.ws?.send(
          JSON.stringify({
            type: "START",
            deviceId: this.deviceId,
          }),
        );

        this.unsubscribeAudioChunk = bluetoothService.onAudioChunk(
          (chunk: AudioChunk) => {
            this.audioChunkBuffer.push(chunk.data);
          },
        );

        this.sendInterval = setInterval(() => {
          this.sendBufferedAudio();
        }, SEND_INTERVAL_MS);

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

      this.sendBufferedAudio();

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "STOP" }));
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

  private sendBufferedAudio(): void {
    if (this.audioChunkBuffer.length === 0) {
      return;
    }

    const totalLength = this.audioChunkBuffer.reduce(
      (sum, chunk) => sum + chunk.length,
      0,
    );
    if (totalLength === 0) {
      this.audioChunkBuffer = [];
      return;
    }

    const pcmData = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this.audioChunkBuffer) {
      pcmData.set(chunk, offset);
      offset += chunk.length;
    }
    this.audioChunkBuffer = [];

    const base64Data = uint8ArrayToBase64(pcmData);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "AUDIO_CHUNK",
          data: base64Data,
        }),
      );
    }
  }

  private handleServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case "TRANSCRIPTION":
        if (message.text) {
          this.fullTranscript +=
            (this.fullTranscript ? " " : "") + message.text;
          this.transcriptionCallback?.(message.text, message.isFinal || false);
        }

        if (message.isFinal && this.resolveStop) {
          this.resolveStop(this.fullTranscript);
          this.resolveStop = null;
          this.cleanup();
        }
        break;

      case "ERROR":
        console.error("Server error:", message.message);
        break;

      default:
        console.warn("Unknown message type:", (message as any).type);
    }
  }

  private cleanup(): void {
    if (this.sendInterval) {
      clearInterval(this.sendInterval);
      this.sendInterval = null;
    }

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
    this.audioChunkBuffer = [];
    this.transcriptionCallback = null;
  }
}

export const audioStreamer: AudioStreamer = new AudioStreamerImpl();

import { bluetoothService, type OpusFrame } from "./bluetooth";
import { getApiUrl, getDeviceToken } from "./query-client";

export type TranscriptionCallback = (
  text: string,
  isFinal: boolean,
  speaker?: number,
) => void;

export interface AudioStreamer {
  start(
    deviceId: string,
    onTranscription: TranscriptionCallback,
  ): Promise<void>;
  stop(): Promise<string>;
  isStreaming(): boolean;
}

interface SessionStartedMessage {
  type: "session_started";
  session_id: string;
  deepgram_connected: boolean;
  frame_format: string;
}

interface TranscriptSegmentMessage {
  type: "transcript_segment";
  sessionId: string;
  speaker: number;
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
  isFinal: boolean;
}

interface ErrorMessage {
  type: "error";
  error: string;
  code?: string;
}

interface SessionEndedMessage {
  type: "session_ended";
  session_id: string;
  total_segments: number;
}

type ServerMessage =
  | SessionStartedMessage
  | TranscriptSegmentMessage
  | ErrorMessage
  | SessionEndedMessage;

function getWebSocketUrl(token: string): string {
  const apiUrl = getApiUrl();
  const wsProtocol = apiUrl.startsWith("https") ? "wss" : "ws";
  const host = apiUrl.replace(/^https?:\/\//, "");
  return `${wsProtocol}://${host}/ws/audio?token=${encodeURIComponent(token)}`;
}

class AudioStreamerImpl implements AudioStreamer {
  private ws: WebSocket | null = null;
  private unsubscribeOpusFrame: (() => void) | null = null;
  private transcriptionCallback: TranscriptionCallback | null = null;
  private fullTranscript: string = "";
  private streaming: boolean = false;
  private sessionId: string | null = null;
  private resolveStop: ((value: string) => void) | null = null;

  public async start(
    deviceId: string,
    onTranscription: TranscriptionCallback,
  ): Promise<void> {
    if (this.streaming) {
      console.warn("AudioStreamer already streaming");
      return;
    }

    this.transcriptionCallback = onTranscription;
    this.fullTranscript = "";
    this.sessionId = null;

    const deviceToken = getDeviceToken();
    if (!deviceToken) {
      throw new Error("No device token available for STT authentication");
    }

    return new Promise((resolve, reject) => {
      const wsUrl = getWebSocketUrl(deviceToken);
      console.log("STT: Connecting to WebSocket:", wsUrl.replace(/token=.*/, "token=***"));

      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = "arraybuffer";

      this.ws.onopen = () => {
        console.log("STT: WebSocket connected, sending start_session");

        this.ws?.send(
          JSON.stringify({
            type: "start_session",
            codec: "opus",
            sample_rate_hint: 16000,
            frame_format: "raw_opus_packets",
          }),
        );
      };

      this.ws.onmessage = (event) => {
        try {
          const message: ServerMessage = JSON.parse(event.data);
          this.handleServerMessage(message, resolve, reject);
        } catch (error) {
          console.error("STT: Failed to parse WebSocket message:", error);
        }
      };

      this.ws.onerror = (error) => {
        console.error("STT: WebSocket error:", error);
        if (!this.streaming) {
          reject(new Error("WebSocket connection failed"));
        }
      };

      this.ws.onclose = (event) => {
        console.log("STT: WebSocket closed", event.code, event.reason);
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
        console.log("STT: Sending end_session");
        this.ws.send(JSON.stringify({ type: "end_session" }));
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

  private startOpusForwarding(): void {
    this.unsubscribeOpusFrame = bluetoothService.onOpusFrame(
      (frame: OpusFrame) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          const opusPacket = new Uint8Array(frame.data);
          this.ws.send(opusPacket);
        }
      },
    );
    console.log("STT: Opus frame forwarding started");
  }

  private handleServerMessage(
    message: ServerMessage,
    resolve?: (value: void | PromiseLike<void>) => void,
    reject?: (reason?: any) => void,
  ): void {
    switch (message.type) {
      case "session_started":
        console.log("STT: Session started:", message.session_id);
        this.sessionId = message.session_id;
        this.streaming = true;
        this.startOpusForwarding();
        resolve?.();
        break;

      case "transcript_segment":
        if (message.text) {
          if (message.isFinal) {
            this.fullTranscript +=
              (this.fullTranscript ? " " : "") + message.text;
          }
          this.transcriptionCallback?.(
            message.text,
            message.isFinal,
            message.speaker,
          );
        }
        break;

      case "session_ended":
        console.log(
          "STT: Session ended, total segments:",
          message.total_segments,
        );
        if (this.resolveStop) {
          this.resolveStop(this.fullTranscript);
          this.resolveStop = null;
        }
        this.cleanup();
        break;

      case "error":
        console.error("STT: Server error:", message.error, message.code);
        if (!this.streaming && reject) {
          reject(new Error(message.error));
        }
        break;

      default:
        console.warn("STT: Unknown message type:", (message as any).type);
    }
  }

  private cleanup(): void {
    if (this.unsubscribeOpusFrame) {
      this.unsubscribeOpusFrame();
      this.unsubscribeOpusFrame = null;
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
    this.sessionId = null;
    this.transcriptionCallback = null;
  }
}

export const audioStreamer: AudioStreamer = new AudioStreamerImpl();

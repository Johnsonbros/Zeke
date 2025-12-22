import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { IncomingMessage } from "node:http";
import OpenAI, { toFile } from "openai";
import { z } from "zod";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type ZekeSyncMessageType = 'sms' | 'voice' | 'activity' | 'device_status' | 'notification';

export interface ZekeSyncMessage {
  type: ZekeSyncMessageType;
  action: 'created' | 'updated' | 'deleted' | 'status_change';
  data?: unknown;
  timestamp: string;
}

const zekeSyncMessageSchema = z.object({
  type: z.enum(['sms', 'voice', 'activity', 'device_status', 'notification']),
  action: z.enum(['created', 'updated', 'deleted', 'status_change']),
  data: z.unknown().optional(),
  timestamp: z.string().optional(),
});

const zekeSyncClients = new Set<WebSocket>();

export function broadcastZekeSync(message: ZekeSyncMessage): void {
  const messageStr = JSON.stringify(message);
  zekeSyncClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
  console.log(`[ZEKE Sync] Broadcast to ${zekeSyncClients.size} clients:`, message.type, message.action);
}

export function getZekeSyncClientCount(): number {
  return zekeSyncClients.size;
}

const AUDIO_SAMPLE_RATE = 16000;
const AUDIO_CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

interface ClientMessage {
  type: "START" | "AUDIO_CHUNK" | "STOP";
  deviceId?: string;
  data?: string;
}

interface ServerMessage {
  type: "TRANSCRIPTION" | "ERROR";
  text?: string;
  isFinal?: boolean;
  message?: string;
}

interface AudioSession {
  deviceId: string;
  audioChunks: Buffer[];
  transcriptionInterval: ReturnType<typeof setInterval> | null;
  fullTranscript: string;
}

const sessions = new Map<WebSocket, AudioSession>();

function sendMessage(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function createWavHeader(dataLength: number): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = AUDIO_SAMPLE_RATE * AUDIO_CHANNELS * (BITS_PER_SAMPLE / 8);
  const blockAlign = AUDIO_CHANNELS * (BITS_PER_SAMPLE / 8);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(AUDIO_CHANNELS, 22);
  header.writeUInt32LE(AUDIO_SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);

  return header;
}

function pcmToWav(pcmBuffer: Buffer): Buffer {
  if (pcmBuffer.length === 0) {
    return Buffer.alloc(0);
  }
  const header = createWavHeader(pcmBuffer.length);
  return Buffer.concat([header, pcmBuffer]);
}

async function transcribeAudio(pcmBuffer: Buffer): Promise<string> {
  if (pcmBuffer.length === 0) {
    return "";
  }

  try {
    const wavBuffer = pcmToWav(pcmBuffer);
    const file = await toFile(wavBuffer, "audio.wav", { type: "audio/wav" });
    
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
      response_format: "text",
    });

    return transcription;
  } catch (error) {
    console.error("Whisper transcription error:", error);
    throw error;
  }
}

function combineAudioChunks(chunks: Buffer[]): Buffer {
  if (chunks.length === 0) {
    return Buffer.alloc(0);
  }
  return Buffer.concat(chunks);
}

async function processAudioChunks(ws: WebSocket, isFinal: boolean): Promise<void> {
  const session = sessions.get(ws);
  if (!session || session.audioChunks.length === 0) {
    return;
  }

  const audioBuffer = combineAudioChunks(session.audioChunks);
  session.audioChunks = [];

  try {
    const text = await transcribeAudio(audioBuffer);
    
    if (text && text.trim()) {
      session.fullTranscript += (session.fullTranscript ? " " : "") + text.trim();
      
      sendMessage(ws, {
        type: "TRANSCRIPTION",
        text: text.trim(),
        isFinal: isFinal,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Transcription failed";
    sendMessage(ws, {
      type: "ERROR",
      message: errorMessage,
    });
  }
}

function startTranscriptionInterval(ws: WebSocket): void {
  const session = sessions.get(ws);
  if (!session) return;

  if (session.transcriptionInterval) {
    clearInterval(session.transcriptionInterval);
  }

  session.transcriptionInterval = setInterval(async () => {
    await processAudioChunks(ws, false);
  }, 5000);
}

function stopTranscriptionInterval(ws: WebSocket): void {
  const session = sessions.get(ws);
  if (!session) return;

  if (session.transcriptionInterval) {
    clearInterval(session.transcriptionInterval);
    session.transcriptionInterval = null;
  }
}

function handleStart(ws: WebSocket, deviceId: string): void {
  const existingSession = sessions.get(ws);
  if (existingSession) {
    stopTranscriptionInterval(ws);
  }

  sessions.set(ws, {
    deviceId,
    audioChunks: [],
    transcriptionInterval: null,
    fullTranscript: "",
  });

  startTranscriptionInterval(ws);
  console.log(`Audio streaming started for device: ${deviceId}`);
}

function handleAudioChunk(ws: WebSocket, base64Data: string): void {
  const session = sessions.get(ws);
  if (!session) {
    sendMessage(ws, {
      type: "ERROR",
      message: "No active session. Send START message first.",
    });
    return;
  }

  try {
    const audioBuffer = Buffer.from(base64Data, "base64");
    session.audioChunks.push(audioBuffer);
    console.log(`[Audio] Received chunk: ${audioBuffer.length} bytes from device ${session.deviceId} (total chunks: ${session.audioChunks.length})`);
  } catch (error) {
    sendMessage(ws, {
      type: "ERROR",
      message: "Invalid base64 audio data",
    });
  }
}

async function handleStop(ws: WebSocket): Promise<void> {
  const session = sessions.get(ws);
  if (!session) {
    return;
  }

  stopTranscriptionInterval(ws);
  
  await processAudioChunks(ws, true);

  const finalTranscript = session.fullTranscript;
  console.log(`Audio streaming stopped for device: ${session.deviceId}`);
  
  sessions.delete(ws);

  sendMessage(ws, {
    type: "TRANSCRIPTION",
    text: finalTranscript,
    isFinal: true,
  });
}

function cleanupSession(ws: WebSocket): void {
  const session = sessions.get(ws);
  if (session) {
    stopTranscriptionInterval(ws);
    sessions.delete(ws);
    console.log(`Session cleaned up for device: ${session.deviceId}`);
  }
}

function setupZekeSyncWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ 
    server,
    path: "/ws/zeke",
  });

  console.log("ZEKE Sync WebSocket server initialized at /ws/zeke");

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    console.log("[ZEKE Sync] Client connected from:", req.socket.remoteAddress);
    zekeSyncClients.add(ws);

    ws.send(JSON.stringify({
      type: 'notification',
      action: 'created',
      data: { message: 'Connected to ZEKE sync' },
      timestamp: new Date().toISOString(),
    }));

    // TODO: Implement token-based authentication for production use
    // Currently only validating message structure, not authenticating clients
    ws.on("message", (data: Buffer | string) => {
      try {
        const messageStr = typeof data === "string" ? data : data.toString();
        const rawMessage = JSON.parse(messageStr);
        console.log("[ZEKE Sync] Received message:", rawMessage);
        
        const validationResult = zekeSyncMessageSchema.safeParse(rawMessage);
        
        if (!validationResult.success) {
          console.error("[ZEKE Sync] Validation failed:", validationResult.error.format());
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Invalid message format' 
          }));
          return;
        }
        
        const message = validationResult.data;
        broadcastZekeSync({
          type: message.type,
          action: message.action,
          data: message.data,
          timestamp: message.timestamp || new Date().toISOString(),
        });
      } catch (error) {
        console.error("[ZEKE Sync] Message parse error:", error);
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Invalid message format' 
        }));
      }
    });

    ws.on("close", () => {
      console.log("[ZEKE Sync] Client disconnected");
      zekeSyncClients.delete(ws);
    });

    ws.on("error", (error: Error) => {
      console.error("[ZEKE Sync] WebSocket error:", error);
      zekeSyncClients.delete(ws);
    });
  });

  return wss;
}

function setupAudioWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ 
    server,
    path: "/ws/audio",
  });

  console.log("Audio WebSocket server initialized at /ws/audio");

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    console.log("[Audio] WebSocket client connected from:", req.socket.remoteAddress);

    ws.on("message", async (data: Buffer | string) => {
      try {
        const messageStr = typeof data === "string" ? data : data.toString();
        const message: ClientMessage = JSON.parse(messageStr);

        switch (message.type) {
          case "START":
            if (!message.deviceId) {
              sendMessage(ws, {
                type: "ERROR",
                message: "deviceId is required for START message",
              });
              return;
            }
            handleStart(ws, message.deviceId);
            break;

          case "AUDIO_CHUNK":
            if (!message.data) {
              sendMessage(ws, {
                type: "ERROR",
                message: "data is required for AUDIO_CHUNK message",
              });
              return;
            }
            handleAudioChunk(ws, message.data);
            break;

          case "STOP":
            await handleStop(ws);
            break;

          default:
            sendMessage(ws, {
              type: "ERROR",
              message: `Unknown message type: ${(message as any).type}`,
            });
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
        sendMessage(ws, {
          type: "ERROR",
          message: "Invalid message format",
        });
      }
    });

    ws.on("close", () => {
      console.log("Audio WebSocket client disconnected");
      cleanupSession(ws);
    });

    ws.on("error", (error: Error) => {
      console.error("Audio WebSocket error:", error);
      cleanupSession(ws);
    });
  });

  return wss;
}

export function setupWebSocketServer(server: Server): WebSocketServer {
  setupZekeSyncWebSocket(server);
  return setupAudioWebSocket(server);
}

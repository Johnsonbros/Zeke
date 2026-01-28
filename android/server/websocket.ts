import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { IncomingMessage } from "node:http";
import OpenAI, { toFile } from "openai";
import { z } from "zod";
import { validateDeviceToken, validateMasterSecret } from "./device-auth";

// TODO: SECURITY - Validate OPENAI_API_KEY is present before creating client
// TODO: RELIABILITY - Add connection timeout and ping/pong heartbeat to detect stale connections
// TODO: SCALABILITY - Consider Redis pub/sub for broadcasting in multi-server deployments
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

// TODO: MEMORY - Stale clients may not be removed if they disconnect without close event
// TODO: SECURITY - Add authentication token validation for WebSocket connections
const zekeSyncClients = new Set<WebSocket>();

// TODO: RELIABILITY - Add message queuing for offline clients with recent disconnection
// TODO: MONITORING - Track message delivery success/failure rates
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

// Legacy message format (backward compatible)
interface LegacyClientMessage {
  type: "START" | "AUDIO_CHUNK" | "STOP";
  deviceId?: string;
  data?: string;
}

// New spec-compliant message format
interface ConfigMessage {
  type: "config";
  codec: "opus" | "pcm";
  sample_rate: number;
  frame_format: "raw_opus_packets" | "pcm_16bit";
  device_type: "omi" | "limitless" | "phone_mic";
  device_id: string;
}

interface AudioMessage {
  type: "audio";
  data: string; // base64 encoded
}

interface SilenceMessage {
  type: "silence";
}

interface HeartbeatMessage {
  type: "heartbeat";
  battery_level?: number;
  signal_strength?: number;
}

interface StopMessage {
  type: "stop";
}

type ClientMessage = LegacyClientMessage | ConfigMessage | AudioMessage | SilenceMessage | HeartbeatMessage | StopMessage;

interface ServerMessage {
  type: "TRANSCRIPTION" | "ERROR" | "WARNING" | "config_ack" | "heartbeat_ack";
  text?: string;
  isFinal?: boolean;
  message?: string;
  timestamp?: string;
}

interface AudioSession {
  deviceId: string;
  deviceType: string;
  codec: string;
  sampleRate: number;
  audioChunks: Buffer[];
  transcriptionInterval: ReturnType<typeof setInterval> | null;
  fullTranscript: string;
  lastHeartbeat: Date;
  consecutiveFallbacks: number;
  totalFallbacks: number;
}

const sessions = new Map<WebSocket, AudioSession>();

// Track pendant status metrics
let lastAudioReceivedAt: Date | null = null;
let totalAudioPackets = 0;

export interface PendantStatus {
  connected: boolean;
  streaming: boolean;
  healthy: boolean;
  lastAudioReceivedAt: string | null;
  totalAudioPackets: number;
  timeSinceLastAudioMs: number | null;
}

export function getPendantStatus(): PendantStatus {
  const hasActiveSession = sessions.size > 0;
  const now = Date.now();
  const timeSinceLastAudio = lastAudioReceivedAt 
    ? now - lastAudioReceivedAt.getTime() 
    : null;
  
  // Consider streaming if we received audio in the last 10 seconds
  const isStreaming = hasActiveSession && timeSinceLastAudio !== null && timeSinceLastAudio < 10000;
  
  // Healthy if connected and received audio recently (within 30 seconds)
  const isHealthy = hasActiveSession && timeSinceLastAudio !== null && timeSinceLastAudio < 30000;

  return {
    connected: hasActiveSession,
    streaming: isStreaming,
    healthy: isHealthy,
    lastAudioReceivedAt: lastAudioReceivedAt?.toISOString() ?? null,
    totalAudioPackets,
    timeSinceLastAudioMs: timeSinceLastAudio,
  };
}

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
    deviceType: "unknown",
    codec: "pcm",
    sampleRate: AUDIO_SAMPLE_RATE,
    audioChunks: [],
    transcriptionInterval: null,
    fullTranscript: "",
    lastHeartbeat: new Date(),
    consecutiveFallbacks: 0,
    totalFallbacks: 0,
  });

  startTranscriptionInterval(ws);
  console.log(`Audio streaming started for device: ${deviceId}`);
}

// New spec-compliant config handler
function handleConfig(ws: WebSocket, config: ConfigMessage): void {
  const existingSession = sessions.get(ws);
  if (existingSession) {
    stopTranscriptionInterval(ws);
  }

  sessions.set(ws, {
    deviceId: config.device_id,
    deviceType: config.device_type,
    codec: config.codec,
    sampleRate: config.sample_rate,
    audioChunks: [],
    transcriptionInterval: null,
    fullTranscript: "",
    lastHeartbeat: new Date(),
    consecutiveFallbacks: 0,
    totalFallbacks: 0,
  });

  startTranscriptionInterval(ws);
  
  sendMessage(ws, {
    type: "config_ack",
    message: "Configuration accepted",
    timestamp: new Date().toISOString(),
  });

  console.log(`[Audio] Session configured: device=${config.device_id}, type=${config.device_type}, codec=${config.codec}`);
}

// Handle heartbeat messages
function handleHeartbeat(ws: WebSocket, heartbeat: HeartbeatMessage): void {
  const session = sessions.get(ws);
  if (!session) {
    sendMessage(ws, {
      type: "ERROR",
      message: "No active session. Send config message first.",
    });
    return;
  }

  session.lastHeartbeat = new Date();
  
  // Update device status in database (async, don't block)
  if (heartbeat.battery_level !== undefined || heartbeat.signal_strength !== undefined) {
    updateDeviceStatus(session.deviceId, {
      batteryLevel: heartbeat.battery_level,
      signalStrength: heartbeat.signal_strength,
      lastHeartbeat: session.lastHeartbeat,
    }).catch(err => console.error("[Audio] Failed to update device status:", err));
  }

  sendMessage(ws, {
    type: "heartbeat_ack",
    timestamp: new Date().toISOString(),
  });
}

// Handle silence marker
function handleSilence(ws: WebSocket): void {
  const session = sessions.get(ws);
  if (!session) return;

  // When silence is detected, trigger transcription of buffered audio
  if (session.audioChunks.length > 0) {
    processAudioChunks(ws, false).catch(err => 
      console.error("[Audio] Error processing audio on silence:", err)
    );
  }
}

// Update device status in database
async function updateDeviceStatus(
  deviceId: string, 
  status: { batteryLevel?: number; signalStrength?: number; lastHeartbeat?: Date }
): Promise<void> {
  // Import dynamically to avoid circular dependency
  const { db } = await import("./db");
  const { devices } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");
  
  await db.update(devices)
    .set({
      batteryLevel: status.batteryLevel,
      signalStrength: status.signalStrength,
      lastHeartbeat: status.lastHeartbeat,
      isConnected: true,
    })
    .where(eq(devices.id, deviceId));
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
    lastAudioReceivedAt = new Date();
    totalAudioPackets++;
    console.log(`[Audio] Received chunk: ${audioBuffer.length} bytes from device ${session.deviceId} (total chunks: ${session.audioChunks.length})`);
  } catch (error) {
    sendMessage(ws, {
      type: "ERROR",
      message: "Invalid base64 audio data",
    });
  }
}

/**
 * Check if a buffer contains JSON data (starts with '{' or '[')
 */
function isJsonBuffer(data: Buffer): boolean {
  if (data.length === 0) return false;
  const firstByte = data[0];
  return firstByte === 0x7b || firstByte === 0x5b; // '{' or '['
}

/**
 * Handle binary Opus frames directly (spec-compliant format)
 * Decodes Opus to PCM using the opus-decoder service before storing
 */
async function handleBinaryOpusFrame(ws: WebSocket, opusData: Buffer): Promise<void> {
  const session = sessions.get(ws);
  if (!session) {
    sendMessage(ws, {
      type: "ERROR",
      message: "No active session. Send config message first.",
    });
    return;
  }

  // If session is configured for Opus codec, decode to PCM
  if (session.codec === "opus") {
    try {
      const { getOpusDecoder } = await import("./services/opus-decoder");
      const decoder = getOpusDecoder();
      const frame = await decoder.decodeFrame(new Uint8Array(opusData));
      
      if (frame && frame.pcmData) {
        if (frame.isFallback) {
          // Track fallback events for monitoring
          session.consecutiveFallbacks++;
          session.totalFallbacks++;
          
          // After 10 consecutive fallbacks, notify client and tear down session
          const MAX_CONSECUTIVE_FALLBACKS = 10;
          if (session.consecutiveFallbacks >= MAX_CONSECUTIVE_FALLBACKS) {
            console.error(`[Audio] CRITICAL: ${MAX_CONSECUTIVE_FALLBACKS} consecutive decode failures for device ${session.deviceId} - terminating session`);
            sendMessage(ws, {
              type: "ERROR",
              message: `Audio decoder failed after ${MAX_CONSECUTIVE_FALLBACKS} consecutive attempts. Session terminated.`,
            });
            cleanupSession(ws);
            ws.close(1011, "Decoder failure threshold exceeded");
            return;
          }
          
          // Send warning on first fallback to notify client early
          if (session.totalFallbacks === 1) {
            sendMessage(ws, {
              type: "WARNING",
              message: "Audio decoder using fallback mode. Some audio data may be lost.",
            });
          }
          
          // Skip fallback frames - simulated PCM should not be sent to transcription
          console.warn(`[Audio] Skipping fallback frame (simulated PCM) - ${opusData.length} bytes from device ${session.deviceId} (consecutive: ${session.consecutiveFallbacks})`);
          return;
        }
        
        // Reset consecutive fallback counter on successful decode
        session.consecutiveFallbacks = 0;
        
        // Convert Int16Array to Buffer with correct byte length (Int16 = 2 bytes per sample)
        const byteLength = frame.pcmData.length * Int16Array.BYTES_PER_ELEMENT;
        const pcmBuffer = Buffer.from(frame.pcmData.buffer, frame.pcmData.byteOffset, byteLength);
        session.audioChunks.push(pcmBuffer);
        lastAudioReceivedAt = new Date();
        totalAudioPackets++;
        console.log(`[Audio] Decoded Opus frame (WASM): ${opusData.length} bytes → ${pcmBuffer.length} PCM bytes from device ${session.deviceId}`);
      }
    } catch (error) {
      // Do NOT store raw Opus data - it will corrupt transcription
      console.error(`[Audio] Opus decode error for device ${session.deviceId}:`, error);
      session.consecutiveFallbacks++;
      session.totalFallbacks++;
      
      // Send warning on first failure to notify client
      if (session.totalFallbacks === 1) {
        sendMessage(ws, {
          type: "WARNING",
          message: "Audio decode error encountered. Some audio data may be lost.",
        });
      }
      
      // Apply same threshold as fallback frames
      const MAX_CONSECUTIVE_FALLBACKS = 10;
      if (session.consecutiveFallbacks >= MAX_CONSECUTIVE_FALLBACKS) {
        console.error(`[Audio] CRITICAL: ${MAX_CONSECUTIVE_FALLBACKS} consecutive decode failures for device ${session.deviceId} - terminating session`);
        sendMessage(ws, {
          type: "ERROR",
          message: `Audio decoder failed after ${MAX_CONSECUTIVE_FALLBACKS} consecutive attempts. Session terminated.`,
        });
        cleanupSession(ws);
        ws.close(1011, "Decoder failure threshold exceeded");
      }
    }
  } else {
    // Store raw frame directly (PCM or unknown codec)
    session.audioChunks.push(opusData);
    lastAudioReceivedAt = new Date();
    totalAudioPackets++;
    console.log(`[Audio] Received binary frame: ${opusData.length} bytes from device ${session.deviceId} (total chunks: ${session.audioChunks.length})`);
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

/**
 * Validates WebSocket authentication token from query parameters
 * Supports both device tokens and master secret
 */
function validateWebSocketAuth(req: IncomingMessage): boolean {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  const secret = url.searchParams.get('secret');

  // If ZEKE_SHARED_SECRET is not configured, allow in development mode
  const ZEKE_SECRET = process.env.ZEKE_SHARED_SECRET;
  if (!ZEKE_SECRET) {
    console.warn('[ZEKE Sync] Authentication not configured - allowing connection (development mode)');
    return true;
  }

  // Validate device token
  if (token) {
    const device = validateDeviceToken(token);
    if (device) {
      console.log(`[ZEKE Sync] Authenticated device: ${device.deviceName} (${device.deviceId})`);
      return true;
    }
  }

  // Validate master secret
  if (secret) {
    if (validateMasterSecret(secret)) {
      console.log('[ZEKE Sync] Authenticated with master secret');
      return true;
    }
  }

  return false;
}

function setupZekeSyncWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({
    server,
    path: "/ws/zeke",
  });

  console.log("ZEKE Sync WebSocket server initialized at /ws/zeke");

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    console.log("[ZEKE Sync] Client connected from:", req.socket.remoteAddress);

    // Authenticate the WebSocket connection
    if (!validateWebSocketAuth(req)) {
      console.warn('[ZEKE Sync] Unauthorized connection attempt from:', req.socket.remoteAddress);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Authentication required. Provide a valid token or secret as a query parameter.',
      }));
      ws.close(1008, 'Authentication required');
      return;
    }

    zekeSyncClients.add(ws);

    ws.send(JSON.stringify({
      type: 'notification',
      action: 'created',
      data: { message: 'Connected to ZEKE sync' },
      timestamp: new Date().toISOString(),
    }));
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
        // Handle binary Opus frames directly (spec-compliant format)
        if (Buffer.isBuffer(data) && !isJsonBuffer(data)) {
          await handleBinaryOpusFrame(ws, data);
          return;
        }

        const messageStr = typeof data === "string" ? data : data.toString();
        const message: ClientMessage = JSON.parse(messageStr);

        switch (message.type) {
          // Legacy message types (backward compatible)
          case "START":
            if (!(message as LegacyClientMessage).deviceId) {
              sendMessage(ws, {
                type: "ERROR",
                message: "deviceId is required for START message",
              });
              return;
            }
            handleStart(ws, (message as LegacyClientMessage).deviceId!);
            break;

          case "AUDIO_CHUNK":
            if (!(message as LegacyClientMessage).data) {
              sendMessage(ws, {
                type: "ERROR",
                message: "data is required for AUDIO_CHUNK message",
              });
              return;
            }
            handleAudioChunk(ws, (message as LegacyClientMessage).data!);
            break;

          case "STOP":
            await handleStop(ws);
            break;

          // New spec-compliant message types
          case "config":
            handleConfig(ws, message as ConfigMessage);
            break;

          case "audio":
            if (!(message as AudioMessage).data) {
              sendMessage(ws, {
                type: "ERROR",
                message: "data is required for audio message",
              });
              return;
            }
            handleAudioChunk(ws, (message as AudioMessage).data);
            break;

          case "silence":
            handleSilence(ws);
            break;

          case "heartbeat":
            handleHeartbeat(ws, message as HeartbeatMessage);
            break;

          case "stop":
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

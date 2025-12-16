import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { Readable } from "stream";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "7ZxKpU6EbWxrhZgWoRDv";
const ELEVENLABS_MODEL_ID = "eleven_flash_v2_5";

let client: ElevenLabsClient | null = null;

function getElevenLabsClient(): ElevenLabsClient {
  if (!client) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error("ELEVENLABS_API_KEY not configured");
    }
    client = new ElevenLabsClient({ apiKey });
  }
  return client;
}

const audioDir = path.join(process.cwd(), "temp_audio");
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

const audioCache = new Map<string, { filePath: string; createdAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cleanupOldAudioFiles() {
  const now = Date.now();
  const entries = Array.from(audioCache.entries());
  for (const [id, entry] of entries) {
    if (now - entry.createdAt > CACHE_TTL_MS) {
      try {
        if (fs.existsSync(entry.filePath)) {
          fs.unlinkSync(entry.filePath);
        }
        audioCache.delete(id);
      } catch (error) {
        console.error(`[ElevenLabs] Failed to cleanup audio file: ${error}`);
      }
    }
  }
}

setInterval(cleanupOldAudioFiles, 60 * 1000);

export async function generateSpeechAudio(text: string): Promise<string> {
  const client = getElevenLabsClient();
  
  const audioId = uuidv4();
  const filePath = path.join(audioDir, `${audioId}.mp3`);
  
  console.log(`[ElevenLabs] Generating speech for: "${text.substring(0, 50)}..."`);
  
  try {
    const audioStream = await client.textToSpeech.convert(ELEVENLABS_VOICE_ID, {
      text,
      modelId: ELEVENLABS_MODEL_ID,
      outputFormat: "mp3_44100_128",
    });

    const chunks: Buffer[] = [];
    const reader = (audioStream as any).getReader ? 
      (audioStream as ReadableStream<Uint8Array>).getReader() : null;
    
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
      }
    } else {
      for await (const chunk of audioStream as any) {
        chunks.push(Buffer.from(chunk));
      }
    }
    const audioBuffer = Buffer.concat(chunks);
    
    fs.writeFileSync(filePath, audioBuffer);
    
    audioCache.set(audioId, { filePath, createdAt: Date.now() });
    
    console.log(`[ElevenLabs] Audio generated successfully: ${audioId}`);
    
    return audioId;
  } catch (error: any) {
    console.error(`[ElevenLabs] Speech generation failed: ${error.message}`);
    throw error;
  }
}

export function getAudioFilePath(audioId: string): string | null {
  // First check in-memory cache
  const entry = audioCache.get(audioId);
  if (entry && fs.existsSync(entry.filePath)) {
    return entry.filePath;
  }
  
  // Fallback: check if file exists on disk (for cross-instance requests)
  const filePath = path.join(audioDir, `${audioId}.mp3`);
  if (fs.existsSync(filePath)) {
    // Re-add to cache for faster future lookups
    audioCache.set(audioId, { filePath, createdAt: Date.now() });
    return filePath;
  }
  
  return null;
}

export function isElevenLabsConfigured(): boolean {
  return !!process.env.ELEVENLABS_API_KEY;
}

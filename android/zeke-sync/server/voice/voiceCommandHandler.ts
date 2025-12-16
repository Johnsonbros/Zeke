/**
 * Voice Command Handler
 * 
 * Processes voice commands detected by the utterance stream and routes them
 * through ZEKE's existing agent pipeline. This ensures voice uses the same
 * "brain" as SMS and web chat.
 */

import { log } from "../logger";
import { 
  createConversation, 
  createMessage, 
  getConversation,
  findOrCreateSmsConversation
} from "../db";
import type { Utterance } from "./utteranceStream";

export interface VoiceCommandResult {
  success: boolean;
  conversationId: string;
  response?: string;
  error?: string;
}

// Store the voice conversation ID for continuity
let voiceConversationId: string | null = null;

/**
 * Process a voice command utterance
 * 
 * This function:
 * 1. Gets or creates a voice conversation
 * 2. Stores the user message
 * 3. Calls the Python multi-agent service (same as web/SMS)
 * 4. Stores the assistant response
 * 
 * @param utterance - The detected utterance with wake word stripped
 * @returns Result with response or error
 */
export async function processVoiceCommand(utterance: Utterance): Promise<VoiceCommandResult> {
  // Only process commands that had the wake word
  if (!utterance.hasWakeWord) {
    log(`Ignoring utterance without wake word: "${utterance.text.substring(0, 30)}..."`, "voice");
    return {
      success: false,
      conversationId: "",
      error: "No wake word detected",
    };
  }

  // Skip empty commands
  if (!utterance.text.trim()) {
    return {
      success: false,
      conversationId: "",
      error: "Empty command after wake word stripping",
    };
  }

  log(`Processing voice command: "${utterance.text}"`, "voice");

  try {
    // Get or create voice conversation
    let conversation;
    
    if (voiceConversationId) {
      conversation = getConversation(voiceConversationId);
    }
    
    if (!conversation) {
      conversation = createConversation({
        source: "voice",
        title: "Voice Commands",
      });
      voiceConversationId = conversation.id;
      log(`Created new voice conversation: ${conversation.id}`, "voice");
    }

    // Store user message with metadata
    createMessage({
      conversationId: conversation.id,
      role: "user",
      content: utterance.text,
      source: "voice",
    });

    // Call Python multi-agent service (same path as web/SMS)
    let aiResponse: string;
    
    try {
      const pythonResponse = await fetch("http://127.0.0.1:5001/api/agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: utterance.text,
          conversation_id: conversation.id,
          phone_number: undefined, // Voice doesn't have a phone number
          metadata: {
            source: "voice",
            raw_text: utterance.rawText,
            started_at: utterance.startedAt,
            ended_at: utterance.endedAt,
            permissions: {
              isAdmin: true,
              isMasterAdmin: true,
              accessLevel: "admin",
              canAccessPersonalInfo: true,
              canAccessCalendar: true,
              canAccessTasks: true,
              canAccessGrocery: true,
              canSetReminders: true,
              contactName: "Nate Johnson",
              source: "voice",
            },
            is_admin: true,
            trusted_single_user_deployment: true,
          },
        }),
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (pythonResponse.ok) {
        const result = await pythonResponse.json() as { 
          response: string; 
          trace_id?: string; 
          metadata?: { completion_status?: string } 
        };
        aiResponse = result.response;
        log(`[Voice] Python agent response (trace_id=${result.trace_id}): ${aiResponse.substring(0, 100)}...`, "voice");
      } else {
        throw new Error(`Python agent returned ${pythonResponse.status}`);
      }
    } catch (pythonError: any) {
      // Fallback to a simple acknowledgment if Python service is unavailable
      log(`[Voice] Python agent unavailable: ${pythonError.message}`, "voice");
      aiResponse = "Voice command received but I'm having trouble processing it right now. Please try again.";
    }

    // Store assistant response
    createMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: aiResponse,
      source: "voice",
    });

    return {
      success: true,
      conversationId: conversation.id,
      response: aiResponse,
    };

  } catch (error: any) {
    log(`Voice command processing error: ${error.message}`, "voice");
    return {
      success: false,
      conversationId: voiceConversationId || "",
      error: error.message,
    };
  }
}

/**
 * Get the current voice conversation ID
 */
export function getVoiceConversationId(): string | null {
  return voiceConversationId;
}

/**
 * Reset the voice conversation (start fresh)
 */
export function resetVoiceConversation(): void {
  voiceConversationId = null;
  log("Voice conversation reset", "voice");
}

/**
 * Build voice command request body (for internal/voice-command endpoint)
 */
export interface VoiceCommandRequest {
  text: string;           // Command with wake word stripped
  rawText: string;        // Original full text including wake word
  source: string;         // "omi_pendant"
  startedAt: number;      // Unix timestamp ms
  endedAt: number;        // Unix timestamp ms
}

/**
 * Validate a voice command request
 */
export function validateVoiceCommandRequest(body: any): VoiceCommandRequest | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const { text, rawText, source, startedAt, endedAt } = body;

  if (typeof text !== "string" || !text.trim()) {
    return null;
  }

  return {
    text: text.trim(),
    rawText: typeof rawText === "string" ? rawText : text,
    source: typeof source === "string" ? source : "omi_pendant",
    startedAt: typeof startedAt === "number" ? startedAt : Date.now(),
    endedAt: typeof endedAt === "number" ? endedAt : Date.now(),
  };
}

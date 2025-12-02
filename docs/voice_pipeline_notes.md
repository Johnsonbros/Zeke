# ZEKE Voice Pipeline Architecture Notes

## Overview

This document describes how voice input from the Limitless Pendant is integrated into ZEKE's existing message processing pipeline. The goal is to make voice a first-class input channel alongside SMS and web chat.

## Current Message Flow

### 1. SMS Input (via Twilio Webhook)
```
POST /api/twilio/webhook
  → Extract message body and phone number
  → findOrCreateSmsConversation(phoneNumber)
  → createMessage({ conversationId, role: "user", content, source: "sms" })
  → Check for quick actions (GROCERY, REMIND, etc.)
  → If not quick action: chat(conversationId, message, isNew, phoneNumber)
  → Send reply via Twilio API
```

### 2. Web Chat Input
```
POST /api/chat
  → Validate request body
  → Get or create conversation
  → createMessage({ conversationId, role: "user", content, source: "web" })
  → Call Python multi-agent service (http://127.0.0.1:5001/api/agents/chat)
  → Fallback to legacy chat() if Python service unavailable
  → createMessage({ role: "assistant", content: aiResponse })
```

### 3. Python Multi-Agent System
The primary AI processing goes through the Python FastAPI service:
```
POST http://127.0.0.1:5001/api/agents/chat
  Body: { message, conversation_id, phone_number, metadata }
  → Conductor agent routes to specialist agents
  → Memory Curator, Comms Pilot, Ops Planner, Research Scout, etc.
  → Returns: { response, agent_id, trace_id, metadata }
```

## Voice Pipeline Integration

### Architecture
```
Limitless Pendant Audio
    ↓
[LimitlessListener] - Polls /v1/download-audio every ~800ms
    ↓
AudioChunk { startMs, endMs, data: Buffer (Opus OGG) }
    ↓
[Transcriber] - OpenAI Whisper API
    ↓
Partial transcript text
    ↓
[UtteranceStream] - Accumulates text, detects silence (~1s gap)
    ↓
Complete utterance with wake word detected
    ↓
POST /internal/voice-command
    ↓
Same path as SMS/web → Python agents → Response
```

### Voice Entry Point

Voice commands will enter ZEKE through a new internal endpoint:
```
POST /internal/voice-command
  Body: {
    text: "remind me to call Nick at 5 PM",      // wake word stripped
    rawText: "ZEKE remind me to call Nick at 5 PM",
    source: "limitless_pendant",
    startedAt: 1733153822333,
    endedAt: 1733153828123
  }
```

This endpoint:
1. Creates a voice conversation (or reuses existing)
2. Stores the user message
3. Calls the Python multi-agent service (same as web/SMS)
4. Logs the response (no SMS reply since voice is local)

### Key Design Decisions

1. **Single Brain**: Voice uses the SAME agent pipeline as SMS/web. No separate "voice logic."

2. **Wake Word Required**: Commands must start with "ZEKE" (case-insensitive) to be treated as commands. This prevents processing all ambient conversation.

3. **Graceful Degradation**: If Limitless is not configured (missing API key), ZEKE runs normally without voice.

4. **Rate Limiting**: Limitless API allows max 180 requests/min (~3/sec). Polling interval is 800ms with exponential backoff on 429.

5. **Silence Detection**: ~1000ms of silence marks the end of an utterance. This allows natural speaking pauses without prematurely cutting off commands.

## Environment Variables

```
LIMITLESS_API_BASE_URL    # Default: https://api.limitless.ai
LIMITLESS_API_KEY         # Required for voice pipeline
LIMITLESS_POLL_INTERVAL_MS # Default: 800
OPENAI_API_KEY            # Required for Whisper transcription (already exists)
```

## File Structure

```
server/voice/
├── limitlessListener.ts   # Audio polling from Limitless API
├── transcriber.ts         # Whisper-based speech-to-text
├── utteranceStream.ts     # Silence detection & wake word handling
└── index.ts               # Pipeline orchestration & exports
```

## Wake Word Patterns

The existing `server/wakeWordDetector.ts` already handles wake word detection for lifelogs. The voice pipeline will use similar patterns:

- "Hey ZEKE", "Hi ZEKE", "OK ZEKE"
- "ZEKE, remind...", "ZEKE, text...", "ZEKE, add..."
- Any sentence containing "ZEKE" followed by action words

## Testing Strategy

1. **Unit Tests**: Utterance segmentation, wake word stripping, URL construction
2. **Integration Tests**: Mock audio → transcript → command flow
3. **E2E Tests**: Requires actual Limitless pendant connection

## Notes

- Audio format: Opus OGG (as per Limitless API)
- Whisper model: gpt-4o-mini-transcribe or similar lightweight model
- Timestamp tracking: lastEndMs advances monotonically to avoid reprocessing audio

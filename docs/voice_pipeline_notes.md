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

### Architecture (Updated)
```
Limitless Pendant Recording
    ↓
[Pendant → Phone sync via Bluetooth]
    ↓
[Phone → Cloud sync via Internet]
    ↓
Lifelog with transcript available in Limitless API
    ↓
[LimitlessListener] - Polls /v1/lifelogs every 10 seconds
    ↓
TranscriptChunk { lifelogId, text, speakerName, startTime, endTime }
    ↓
[UtteranceStream] - Accumulates text, detects silence (~1s gap)
    ↓
Complete utterance with wake word detected
    ↓
POST /internal/voice-command
    ↓
Same path as SMS/web → Python agents → Response
```

**Note**: The Limitless API does not support real-time audio streaming. Audio must sync from Pendant → Phone → Cloud before transcripts are available. Expected latency is 1-5 minutes.

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

4. **Polling Interval**: 10 seconds between polls (lifelogs have inherent delay anyway). Exponential backoff on errors.

5. **Silence Detection**: ~1000ms of silence marks the end of an utterance. This allows natural speaking pauses without prematurely cutting off commands.

6. **Watermark Tracking**: The listener maintains a watermark timestamp to only fetch new lifelogs, preventing duplicate processing.

## Environment Variables

```
LIMITLESS_API_BASE_URL     # Default: https://api.limitless.ai
LIMITLESS_API_KEY          # Required for voice pipeline
LIMITLESS_POLL_INTERVAL_MS # Default: 10000 (10 seconds)
OPENAI_API_KEY             # Required for AI processing (already exists)
```

## Troubleshooting

If voice commands aren't being detected, check the following:

### 1. Is the Limitless app running on the phone?
The pendant syncs audio to the phone via Bluetooth. If the app isn't running, recordings won't sync.

### 2. Is the pendant turned on?
The pendant must be powered on and within Bluetooth range of the phone.

### 3. Is there a network connection for cloud sync?
After audio syncs to the phone, the Limitless app uploads it to the cloud. Without internet, transcripts won't appear in the API.

### 4. Check the voice pipeline status
```bash
curl http://localhost:5000/api/voice/status
```
Look for:
- `running: true` - Pipeline is active
- `consecutiveErrors: 0` - No API errors
- `processedCount` - Number of lifelogs processed
- `watermarkTime` - Last processed timestamp

### 5. Check if lifelogs exist in Limitless API
If the status shows no errors but commands aren't processed, verify recordings appear in the Limitless cloud (via the phone app or API).

### 6. Expected latency
Due to the sync chain (Pendant → Phone → Cloud), expect 1-5 minutes between speaking and command processing. This is a Limitless API limitation, not a ZEKE issue.

## File Structure

```
server/voice/
├── limitlessListener.ts   # Polls /v1/lifelogs for new transcripts
├── transcriber.ts         # Transcription interface (uses Limitless transcripts)
├── utteranceStream.ts     # Silence detection & wake word handling
├── voiceCommandHandler.ts # Processes commands through agent pipeline
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

- Transcripts are provided by the Limitless API (no separate Whisper transcription needed)
- Watermark tracking: Uses lifelog endTime to track processed recordings
- The voice pipeline auto-starts on server boot
- Commands are processed through the same Python multi-agent pipeline as SMS/web

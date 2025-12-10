# ZEKE Voice Pipeline Architecture Notes

## Overview

This document describes how voice input from the Omi Pendant is integrated into ZEKE's existing message processing pipeline. The goal is to make voice a first-class input channel alongside SMS and web chat.

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

### Architecture (Webhook-Based)
```
Omi Pendant Recording
    ↓
[Pendant → Phone sync via Bluetooth]
    ↓
[Phone → Omi Cloud sync via Internet]
    ↓
Omi sends webhook to ZEKE
    ↓
POST /api/omi/realtime-chunk (real-time segments)
POST /api/omi/webhook (complete transcripts)
    ↓
[OmiListener] - Processes incoming webhook payloads
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

**Note**: Omi uses webhooks for real-time transcript delivery. Configure your Omi app to send webhooks to your ZEKE instance.

### Voice Entry Point

Voice commands enter ZEKE through an internal endpoint:
```
POST /internal/voice-command
  Body: {
    text: "remind me to call Nick at 5 PM",      // wake word stripped
    rawText: "ZEKE remind me to call Nick at 5 PM",
    source: "omi_pendant",
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

3. **Graceful Degradation**: If Omi is not configured (missing webhook secret), ZEKE runs normally without voice.

4. **Webhook-Based**: Unlike polling-based approaches, Omi pushes transcripts to ZEKE in real-time via webhooks.

5. **Silence Detection**: ~1000ms of silence marks the end of an utterance. This allows natural speaking pauses without prematurely cutting off commands.

6. **Idempotency**: The realtime chunk endpoint tracks processed chunks to prevent duplicate processing.

## Environment Variables

```
OMI_API_KEY          # API key for Omi services
OMI_WEBHOOK_SECRET   # Secret for validating incoming webhooks
OMI_BASE_URL         # Omi API base URL (optional)
OPENAI_API_KEY       # Required for AI processing (already exists)
```

## Troubleshooting

If voice commands aren't being detected, check the following:

### 1. Is the Omi app running on the phone?
The pendant syncs audio to the phone via Bluetooth. If the app isn't running, recordings won't sync.

### 2. Is the pendant turned on?
The pendant must be powered on and within Bluetooth range of the phone.

### 3. Is the webhook configured correctly?
Ensure your Omi app is configured to send webhooks to your ZEKE instance's `/api/omi/webhook` endpoint.

### 4. Check the voice pipeline status
```bash
curl http://localhost:5000/api/voice/status
```
Look for:
- `running: true` - Pipeline is active
- `consecutiveErrors: 0` - No processing errors
- `processedCount` - Number of transcripts processed

### 5. Check server logs
Look for `[OmiProcessor]` or `[voice]` log entries to see incoming webhook activity.

### 6. Verify webhook delivery
Check the Omi app or dashboard to confirm webhooks are being sent successfully.

## File Structure

```
server/voice/
├── omiListener.ts         # Handles Omi webhook payloads
├── transcriber.ts         # Transcription interface (uses Omi transcripts)
├── utteranceStream.ts     # Silence detection & wake word handling
├── voiceCommandHandler.ts # Processes commands through agent pipeline
└── index.ts               # Pipeline orchestration & exports

python_agents/omi_integration/
├── webhook_receiver.py    # FastAPI endpoints for Omi webhooks
└── ...
```

## Wake Word Patterns

The `server/wakeWordDetector.ts` handles wake word detection. The voice pipeline uses these patterns:

- "Hey ZEKE", "Hi ZEKE", "OK ZEKE"
- "ZEKE, remind...", "ZEKE, text...", "ZEKE, add..."
- Any sentence containing "ZEKE" followed by action words

## Testing Strategy

1. **Unit Tests**: Utterance segmentation, wake word stripping, webhook payload parsing
2. **Integration Tests**: Mock webhook → transcript → command flow
3. **E2E Tests**: Requires actual Omi pendant connection

## Notes

- Transcripts are provided by the Omi API via webhooks
- Idempotency tracking prevents duplicate command processing
- The voice pipeline auto-starts on server boot
- Commands are processed through the same Python multi-agent pipeline as SMS/web

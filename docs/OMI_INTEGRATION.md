# Omi Integration Documentation

> **For AI Coding Systems**: This document provides comprehensive technical specifications for ZEKE's Omi integration. It is designed for automated parsing and understanding by LLMs and coding agents.

## Overview

ZEKE integrates with the [Omi wearable](https://omi.me) via a bidirectional webhook and API system:

1. **Push (Webhooks)**: Omi sends data to ZEKE when conversations happen
2. **Pull (Direct API)**: ZEKE can query Omi's cloud for historical data
3. **Chat Tools**: Omi can invoke ZEKE as a tool during chat conversations

---

## Architecture

```
┌─────────────────┐     Webhooks (Push)      ┌─────────────────┐
│                 │ ────────────────────────▶│                 │
│   Omi Device    │                          │     ZEKE        │
│   + iOS App     │ ◀────────────────────────│    Backend      │
│                 │     Direct API (Pull)    │                 │
└─────────────────┘                          └─────────────────┘
        │                                            │
        │  Chat Tools (ask_zeke)                     │
        └────────────────────────────────────────────┘
```

### File Locations

| Component | File Path | Purpose |
|-----------|-----------|---------|
| Webhook Routes | `server/omi-routes.ts` | All Omi HTTP endpoints |
| Voice Pipeline | `server/voice/omiListener.ts` | Real-time transcript processing |
| Omi Handler | `server/omi.ts` | Core Omi data processing |
| Schema Types | `shared/schema.ts` | TypeScript interfaces |
| User Docs | `docs/omi-prompts.md` | Setup instructions for users |

---

## Webhook Endpoints

All endpoints are registered in `server/omi-routes.ts` via `registerOmiRoutes(app)`.

### 1. Memory Trigger Webhook

**Endpoint**: `POST /api/omi/memory-trigger`

**Purpose**: Receives complete conversation memories after Omi finishes recording.

**Trigger Event in Omi App**: `Conversation Creation` (under External Integration)

**Request Body** (from Omi):
```typescript
interface OmiMemoryTriggerPayload {
  session_id?: string;
  memory?: {
    id?: string;
    created_at?: string;
    started_at?: string;
    finished_at?: string;
    transcript?: string;
    transcript_segments?: Array<{
      text: string;
      speaker: string;
      speaker_id?: number;
      is_user?: boolean;
      start?: number;
      end?: number;
    }>;
    structured?: {
      title?: string;
      overview?: string;
      emoji?: string;
      category?: string;
      action_items?: Array<{
        description: string;
        completed?: boolean;
      }>;
    };
    discarded?: boolean;
  };
}
```

**Response**:
```json
{
  "success": true,
  "logId": "uuid-string",
  "message": "Memory received and queued for processing"
}
```

**Processing Pipeline**:
1. Log webhook receipt to `omi_webhook_logs` table
2. Extract transcript text from segments
3. Run AI extraction (people, topics, action items, insights)
4. Link extracted people to contacts (create new if needed)
5. Create memory notes for insights
6. Create tasks for action items
7. Detect and execute commands if `OMI_COMMANDS_ENABLED=true`

**Command Detection** (when enabled):
- Wake words: `"Hey Zeke"`, `"Zeke,"`, `"Hey Z,"`, `"OK Zeke"`
- Must be combined with action patterns: `remind me`, `text [name]`, `add to grocery`, etc.
- Only speaker 0 (device owner) can trigger commands

---

### 2. Real-Time Transcript Webhook

**Endpoint**: `POST /api/omi/transcript`

**Purpose**: Receives live transcript segments during active conversations.

**Trigger Event in Omi App**: `Transcript Processed` (under External Integration)

**Request Body**:
```typescript
interface OmiTranscriptPayload {
  session_id?: string;
  segments?: Array<{
    text: string;
    speaker: string;
    speaker_id?: number;
    is_user?: boolean;
    start?: number;
    end?: number;
  }>;
}
```

**Response**:
```json
{
  "success": true,
  "logId": "uuid-string",
  "segmentCount": 3,
  "message": "Transcript segments received"
}
```

**Processing**:
- Each segment is fed to the voice pipeline via `processOmiWebhook()`
- Enables real-time wake word detection
- Segments accumulate for utterance-based processing

---

### 3. Audio Bytes Webhook

**Endpoint**: `POST /api/omi/audio-bytes`

**Purpose**: Receives raw PCM16 audio for custom speech processing.

**Trigger Event in Omi App**: `Audio Bytes` (under External Integration)

**Query Parameters**:
- `uid`: User ID
- `sample_rate`: Audio sample rate (default 16000)

**Request Body**: Raw binary PCM16 audio data

**Headers**:
- `Content-Type: application/octet-stream`

**Response**:
```json
{
  "status": "ok",
  "success": true,
  "logId": "uuid-string",
  "audio_size": 32000,
  "duration_seconds": 1.0
}
```

---

### 4. Query Endpoint

**Endpoint**: `POST /api/omi/query`

**Purpose**: Query ZEKE's knowledge base from Omi chat.

**Request Body**:
```typescript
interface OmiQueryRequest {
  query: string;           // The question to ask
  limit?: number;          // Max memories to return (default 10)
  executeActions?: boolean; // If true, route through full agent pipeline
}
```

**Response**:
```typescript
interface OmiQueryResponse {
  answer: string;
  relevantMemories: Array<{
    id: string;
    content: string;
    type: string;
    confidence: number;
  }>;
  relatedPeople: Array<{
    name: string;
    context: string;
  }>;
  actionExecuted?: boolean;   // True if actions were taken
  executedTools?: string[];   // Tools that were called
}
```

**Modes**:
- `executeActions=false`: Read-only query against memory/contacts
- `executeActions=true` + `OMI_COMMANDS_ENABLED=true`: Full agent pipeline with tool execution

---

### 5. ZEKE Chat Tool Endpoint

**Endpoint**: `POST /api/omi/zeke`

**Purpose**: Dedicated endpoint for Omi Chat Tools integration. Always routes through the full agent pipeline.

**Request Body** (from Omi Chat Tools):
```typescript
{
  uid: string;           // User ID from Omi
  app_id: string;        // ZEKE app ID
  tool_name: string;     // "ask_zeke"
  message: string;       // User's question/command
}
```

**Response** (Omi Chat Tools format):
```typescript
// Success:
{ "result": "ZEKE's response text" }

// Error:
{ "error": "Error message" }
```

---

### 6. Chat Tools Manifest

**Endpoint**: `GET /.well-known/omi-tools.json`

**Purpose**: Defines ZEKE's capabilities for Omi's tool discovery.

**Response**:
```json
{
  "tools": [
    {
      "name": "ask_zeke",
      "description": "Ask ZEKE anything - your personal AI assistant...",
      "endpoint": "/api/omi/zeke",
      "method": "POST",
      "parameters": {
        "properties": {
          "message": {
            "type": "string",
            "description": "The question or command to ask ZEKE"
          }
        },
        "required": ["message"]
      },
      "auth_required": false,
      "status_message": "Asking ZEKE..."
    }
  ]
}
```

---

### 7. Day Summary Webhook

**Endpoint**: `POST /api/omi/day-summary`

**Purpose**: Receives daily conversation summaries from Omi.

**Request Body**:
```typescript
{
  id?: string;
  summary?: string;
  // Additional Omi-specific fields
}
```

**Response**:
```json
{
  "success": true,
  "logId": "uuid-string",
  "memoryNoteId": "uuid-string",
  "message": "Day summary saved to memory"
}
```

---

### 8. Webhook Logs API

**List Logs**: `GET /api/omi/logs?limit=50`

**Get Single Log**: `GET /api/omi/logs/:id`

**Response**:
```typescript
interface OmiWebhookLog {
  id: string;
  triggerType: string;
  omiSessionId?: string;
  omiMemoryId?: string;
  rawPayload: string;
  transcript?: string;
  status: "received" | "processing" | "processed" | "error" | "skipped";
  errorMessage?: string;
  extractedPeople?: string;      // JSON array
  extractedTopics?: string;      // JSON array
  extractedActionItems?: string; // JSON array
  extractedInsights?: string;    // JSON array
  createdContactIds?: string;    // JSON array
  createdTaskIds?: string;       // JSON array
  createdMemoryNoteIds?: string; // JSON array
  detectedCommands?: string;     // JSON array
  commandResults?: string;       // JSON array
  receivedAt: string;
  processedAt?: string;
}
```

---

## Data Extraction Pipeline

When a memory is received, ZEKE runs an AI-powered extraction:

```typescript
interface ExtractionResult {
  people: Array<{
    name: string;
    context: string;
    relationship?: string;  // friend/family/colleague/etc
    sentiment?: "positive" | "neutral" | "negative";
  }>;
  topics: Array<{
    topic: string;
    relevance: "high" | "medium" | "low";
    category?: string;
  }>;
  actionItems: Array<{
    task: string;
    owner?: string;
    dueDate?: string;
    priority: "high" | "medium" | "low";
    context: string;
  }>;
  insights: Array<{
    insight: string;
    type: "decision" | "idea" | "preference" | "goal" | "concern" | "fact";
    confidence: "high" | "medium" | "low";
  }>;
  emotions: string;  // Brief mood summary
}
```

### Contact Linking

Extracted people are automatically linked to the contacts system:
1. Search existing contacts by name
2. If found: Add observation note to contact
3. If not found: Create new contact with `isAutoCreated=true`

---

## Environment Variables

### Omi-Specific Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OMI_COMMANDS_ENABLED` | No | `false` | Enable wake word command execution from transcripts |
| `OMI_DEV_API_KEY` | No | - | API key for direct Omi cloud access (pull-based queries). Get from [Omi Developer API](https://docs.omi.me/doc/developer/api) |

### Required Core Dependencies

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | Required for AI extraction, agent responses, and embeddings |

### Optional Dependencies (for full agent capabilities)

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | No | Required for SMS sending via agent tools |
| `TWILIO_AUTH_TOKEN` | No | Required for SMS sending via agent tools |
| `TWILIO_PHONE_NUMBER` | No | Twilio phone number for outbound SMS |
| `ELEVENLABS_API_KEY` | No | Required for custom voice synthesis (phone calls) |
| `GOOGLE_CLIENT_ID` | No | For Google Calendar integration |
| `GOOGLE_CLIENT_SECRET` | No | For Google Calendar integration |
| `PERPLEXITY_API_KEY` | No | For enhanced web search capabilities |

---

## Schema Types Reference

> **Canonical Source**: All Omi-related TypeScript types are defined in `shared/schema.ts` (lines 2260-2360). Always reference this file for the authoritative type definitions.

Key interfaces and their locations in `shared/schema.ts`:

```typescript
// Import these types in your code:
import {
  OmiMemoryTriggerPayload,
  OmiTranscriptPayload,
  OmiQueryRequest,
  OmiQueryResponse,
  OmiExtractedPerson,
  OmiExtractedTopic,
  OmiExtractedActionItem,
  OmiExtractedInsight,
  omiQueryRequestSchema,  // Zod schema for validation
} from "@shared/schema";
```

### OmiMemoryTriggerPayload (Full Schema)

```typescript
interface OmiMemoryTriggerPayload {
  memory: {
    id: string;
    created_at: string;
    started_at: string;
    finished_at: string;
    transcript: string;
    transcript_segments: Array<{
      text: string;
      speaker: string;
      speaker_id: number;
      is_user: boolean;
      start: number;
      end: number;
    }>;
    photos: string[];
    structured: {
      title: string;
      overview: string;
      emoji: string;
      category: string;
      action_items: Array<{
        description: string;
        completed: boolean;
      }>;
      events: Array<{
        title: string;
        description: string;
        start: string;
        duration: number;
        created: boolean;
      }>;
    };
    apps_response: Array<{
      app_id: string;
      content: string;
    }>;
    discarded: boolean;
  };
  session_id?: string;
}
```

### OmiTranscriptPayload (Full Schema)

```typescript
interface OmiTranscriptPayload {
  session_id: string;
  segments: Array<{
    text: string;
    speaker: string;
    speaker_id: number;
    is_user: boolean;
    start: number;
    end: number;
  }>;
}
```

---

## Omi App Setup

### Creating the ZEKE App in Omi

1. Open Omi iOS app
2. Go to **Explore** > **Create an App**
3. Select **External Integration** capability
4. Configure:
   - **Trigger Event**: `Transcript Processed` (for real-time) or leave as `None`
   - **Webhook URL**: `https://zekeai.replit.app/api/omi/transcript`
   - **App Home URL**: `https://zekeai.replit.app`
   - **Chat Tools Manifest URL**: `https://zekeai.replit.app/.well-known/omi-tools.json`

### Recommended Scopes

For full integration, enable these scopes:
- **Read memories**: Query past conversations
- **Read conversations**: Access conversation history

### Webhook URLs Reference

| Purpose | URL |
|---------|-----|
| Memory Trigger | `https://zekeai.replit.app/api/omi/memory-trigger` |
| Real-time Transcript | `https://zekeai.replit.app/api/omi/transcript` |
| Day Summary | `https://zekeai.replit.app/api/omi/day-summary` |
| Chat Tools Manifest | `https://zekeai.replit.app/.well-known/omi-tools.json` |

---

## Voice Pipeline Integration

The Omi webhooks feed into ZEKE's voice pipeline:

```
Omi Webhook ──▶ processOmiWebhook() ──▶ UtteranceStream ──▶ TranscriptHandlers
                                              │
                                              ▼
                                       Wake Word Detection
                                              │
                                              ▼
                                       Agent Pipeline
```

### Handler Registration

```typescript
import { registerTranscriptHandler, registerMemoryHandler } from "./voice/omiListener";

// Register to receive transcript chunks
registerTranscriptHandler(async (chunk) => {
  console.log(`Received: ${chunk.text}`);
});

// Register to receive complete memories
registerMemoryHandler(async (memory) => {
  console.log(`Memory: ${memory.structured?.title}`);
});
```

---

## Database Tables

### omi_webhook_logs

Stores all incoming webhook data for debugging and audit.

```sql
CREATE TABLE omi_webhook_logs (
  id TEXT PRIMARY KEY,
  trigger_type TEXT,
  omi_session_id TEXT,
  omi_memory_id TEXT,
  raw_payload TEXT,
  transcript TEXT,
  status TEXT,
  error_message TEXT,
  extracted_people TEXT,
  extracted_topics TEXT,
  extracted_action_items TEXT,
  extracted_insights TEXT,
  created_contact_ids TEXT,
  created_task_ids TEXT,
  created_memory_note_ids TEXT,
  detected_commands TEXT,
  command_results TEXT,
  speaker_count INTEGER,
  received_at TEXT,
  processed_at TEXT
);
```

---

## Data Persistence

### Tables Created/Updated by Omi Integration

| Table | Purpose | Created By |
|-------|---------|------------|
| `omi_webhook_logs` | Stores all webhook payloads and processing status | Memory/transcript webhooks |
| `memory_notes` | Long-term memories extracted from conversations | `createMemoryNote()` |
| `tasks` | Action items extracted from transcripts | `createTask()` |
| `contacts` | People mentioned in conversations | `createContact()` |
| `contact_notes` | Observations about contacts | `createContactNote()` |
| `conversations` | Chat sessions for agent interactions | `routeToAgentPipeline()` |
| `messages` | Individual messages in conversations | Agent pipeline |

### Database Functions (from server/db.ts)

```typescript
// Webhook logging
createOmiWebhookLog(data): Promise<OmiWebhookLog>
updateOmiWebhookLog(id, updates): Promise<OmiWebhookLog>
getOmiWebhookLogs(limit): Promise<OmiWebhookLog[]>
getOmiWebhookLog(id): Promise<OmiWebhookLog | null>

// Memory persistence
createMemoryNote(data): Promise<MemoryNote>
getAllMemoryNotes(): Promise<MemoryNote[]>

// Contact management
createContact(data): Promise<Contact>
updateContact(id, data): Promise<Contact>
searchContacts(query): Contact[]
getAllContacts(): Promise<Contact[]>
createContactNote(data): Promise<ContactNote>

// Task creation
createTask(data): Promise<Task>
```

---

## Extension Points

### Adding New Webhook Handlers

To add custom processing for Omi data:

```typescript
// In server/omi-routes.ts, add after existing routes:

app.post("/api/omi/custom-handler", async (req, res) => {
  const payload = req.body;
  
  // Log the webhook
  const log = await createOmiWebhookLog({
    triggerType: "custom",
    rawPayload: JSON.stringify(payload),
    status: "received",
    receivedAt: new Date().toISOString(),
  });
  
  // Your custom processing
  await processCustomData(payload);
  
  // Update log status
  await updateOmiWebhookLog(log.id, {
    status: "processed",
    processedAt: new Date().toISOString(),
  });
  
  res.json({ success: true, logId: log.id });
});
```

### Adding New Chat Tools

To expose new capabilities to Omi, modify the manifest in `server/omi-routes.ts`:

```typescript
// Find the /.well-known/omi-tools.json route and add to the tools array:
{
  name: "new_tool_name",
  description: "What this tool does - be descriptive for the AI",
  endpoint: "/api/omi/new-tool",
  method: "POST",
  parameters: {
    properties: {
      param1: { type: "string", description: "Parameter description" }
    },
    required: ["param1"]
  },
  auth_required: false,
  status_message: "Processing..."
}
```

Then implement the endpoint:

```typescript
app.post("/api/omi/new-tool", async (req, res) => {
  const { uid, app_id, tool_name, param1 } = req.body;
  
  try {
    const result = await doSomething(param1);
    // Return in Omi Chat Tools format
    res.json({ result: result });
  } catch (error) {
    res.json({ error: error.message });
  }
});
```

### Custom Extraction Categories

To modify what ZEKE extracts from conversations, edit `extractFromTranscript()` in `server/omi-routes.ts`:

```typescript
// The extraction is controlled by this system prompt (around line 83):
const systemPrompt = `You are an AI assistant that extracts structured information...

Extract the following from the transcript:
1. PEOPLE: Names mentioned, how they were discussed, inferred relationships
2. TOPICS: Key subjects discussed with relevance
3. ACTION ITEMS: Tasks, commitments, things to do
4. INSIGHTS: Important facts, decisions, preferences, goals
// Add your custom extraction category here
5. CUSTOM_CATEGORY: Your extraction instructions
`;

// Then update the extractionSchema Zod validator to include your new field
```

### Adding New Wake Word Commands

To add new command patterns for voice activation, modify `detectCommands()` in `server/omi-routes.ts`:

```typescript
// Action patterns are defined around line 280:
const actionPatterns = [
  /remind me/i,
  /text\s+\w+/i,
  /add to grocery/i,
  // Add your new pattern:
  /your new pattern/i,
];
```

---

## Testing

### Manual Testing

```bash
# 1. Test manifest endpoint (should return tool definitions)
curl -s https://zekeai.replit.app/.well-known/omi-tools.json | jq .

# 2. Test ZEKE chat tool (simulates Omi invoking the tool)
curl -X POST https://zekeai.replit.app/api/omi/zeke \
  -H "Content-Type: application/json" \
  -d '{
    "uid": "test-user",
    "app_id": "zeke-app",
    "tool_name": "ask_zeke",
    "message": "What is the weather today?"
  }'
# Expected: { "result": "..." }

# 3. Test memory webhook (simulates Omi sending a completed memory)
curl -X POST https://zekeai.replit.app/api/omi/memory-trigger \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "test-123",
    "memory": {
      "id": "mem-456",
      "transcript": "I talked to Sarah about the project deadline. She said we need to finish by Friday.",
      "transcript_segments": [
        {"text": "I talked to Sarah about the project deadline.", "speaker": "SPEAKER_00", "speaker_id": 0, "is_user": true, "start": 0, "end": 3},
        {"text": "She said we need to finish by Friday.", "speaker": "SPEAKER_00", "speaker_id": 0, "is_user": true, "start": 3, "end": 6}
      ],
      "structured": {
        "title": "Project Discussion",
        "overview": "Discussed project timeline with Sarah"
      }
    }
  }'
# Expected: { "success": true, "logId": "..." }

# 4. Test transcript webhook (simulates real-time segments)
curl -X POST https://zekeai.replit.app/api/omi/transcript \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "live-session-789",
    "segments": [
      {"text": "Hey Zeke, remind me to buy groceries", "speaker": "SPEAKER_00", "speaker_id": 0, "is_user": true, "start": 0, "end": 3}
    ]
  }'
# Expected: { "success": true, "logId": "...", "segmentCount": 1 }

# 5. Test query endpoint (read-only mode)
curl -X POST https://zekeai.replit.app/api/omi/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What do I know about Sarah?", "limit": 5}'
# Expected: { "answer": "...", "relevantMemories": [...], "relatedPeople": [...] }

# 6. Test query endpoint with action execution
curl -X POST https://zekeai.replit.app/api/omi/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Add milk to my grocery list", "executeActions": true}'
# Expected: { "answer": "...", "actionExecuted": true, "executedTools": ["add_grocery_item"] }
```

### Viewing Logs

```bash
# Get recent webhook logs (for debugging)
curl -s https://zekeai.replit.app/api/omi/logs?limit=10 | jq .

# Get specific log by ID
curl -s https://zekeai.replit.app/api/omi/logs/LOG_ID_HERE | jq .
```

### Validation Checklist

After making changes to the Omi integration:

1. **Manifest accessible**: `curl /.well-known/omi-tools.json` returns valid JSON
2. **Chat tool responds**: POST to `/api/omi/zeke` returns `{ result: "..." }`
3. **Memory webhook logs**: POST to `/api/omi/memory-trigger` creates log entry
4. **Extraction works**: Check logs for `extractedPeople`, `extractedTopics`, etc.
5. **Commands detected**: If `OMI_COMMANDS_ENABLED=true`, verify `detectedCommands` in logs

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Webhooks not received | App not installed in Omi | Install and enable the app |
| Commands not executing | `OMI_COMMANDS_ENABLED` not set | Set env var to `true` |
| Extraction failing | Missing OpenAI key | Configure `OPENAI_API_KEY` |
| Chat tool not appearing | Manifest URL incorrect | Verify `/.well-known/omi-tools.json` is accessible |
| 404 on webhook | Wrong URL | Check endpoint paths match exactly |

---

## Version History

- **v1.0**: Initial Omi webhook integration (memory trigger, transcript)
- **v1.1**: Added Chat Tools manifest and `/api/omi/zeke` endpoint
- **v1.2**: Added audio bytes webhook support
- **v1.3**: Added day summary webhook and logs API

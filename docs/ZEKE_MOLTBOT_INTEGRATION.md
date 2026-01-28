# ZEKE + Moltbot Integration Strategy

> **Date:** 2026-01-28
> **Purpose:** Combining the best of ZEKE's intelligent agent orchestration with Moltbot's sophisticated multi-channel connectivity

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Comparison Matrix](#system-comparison-matrix)
3. [What Moltbot Does Better (Adopt These)](#what-moltbot-does-better-adopt-these)
4. [What ZEKE Does Better (Preserve These)](#what-zeke-does-better-preserve-these)
5. [Proposed Integration Architecture](#proposed-integration-architecture)
6. [Implementation Roadmap](#implementation-roadmap)
7. [Key Code Integration Points](#key-code-integration-points)
8. [Migration Strategy](#migration-strategy)
9. [Dependencies](#dependencies)

---

## Executive Summary

This document outlines a strategy to combine **ZEKE** (intelligent personal AI assistant with sophisticated memory and agent orchestration) with **Moltbot** (professional multi-channel gateway with advanced security and connectivity) into a unified "super-organism" that leverages the strengths of both systems.

**Core Principle:** Keep ZEKE's brain (Conductor + Specialists + Memory), adopt Moltbot's body (Gateway + Channels + Security).

---

## System Comparison Matrix

| Aspect | ZEKE | Moltbot | Winner | Notes |
|--------|------|---------|--------|-------|
| **Runtime** | Python + Node.js (hybrid) | Pure Node.js (TypeScript) | Moltbot | Simpler deployment, single runtime |
| **Agent Framework** | OpenAI Agents SDK | Pi Agent Core | Both viable | Different approaches, both work |
| **Communication Channels** | Twilio SMS/Voice only | WhatsApp, Telegram, Slack, Discord, iMessage, Signal, Teams, Matrix, Zalo, WebChat | **Moltbot** | 10+ channels vs 1 |
| **Gateway Architecture** | HTTP REST between services | WebSocket control plane | **Moltbot** | Real-time, bidirectional |
| **Memory System** | SQLite + embeddings with TTL/scoping | Basic/Unknown | **ZEKE** | Semantic search, confidence scoring |
| **Agent Orchestration** | 3-phase Conductor + 8 specialists | Multi-session routing | **ZEKE** | Sophisticated parallel execution |
| **Security Model** | Permission-based tool access | Docker sandbox + session isolation | **Moltbot** | Process-level isolation |
| **Voice** | Twilio basic | ElevenLabs + always-on speech | **Moltbot** | Professional TTS/STT |
| **Visual Interface** | React Web UI | Canvas + A2UI workspace | **Moltbot** | Agent-driven UI |
| **Browser Automation** | None | Playwright-based control | **Moltbot** | Web automation capability |
| **Device Integration** | Omi wearable only | macOS/iOS/Android nodes | **Moltbot** | Cross-platform device control |
| **Calendar** | Google Calendar | Unknown | **ZEKE** | Deep integration |
| **Wearable Integration** | Omi pendant lifelogs | None mentioned | **ZEKE** | Unique lifelog processing |
| **Context Enrichment** | Parallel bundle fetching | Unknown | **ZEKE** | Memory + calendar + location |

---

## What Moltbot Does Better (Adopt These)

### 1. Multi-Channel Gateway Architecture

Moltbot's WebSocket-based gateway (`ws://127.0.0.1:18789`) is a superior pattern for handling multiple communication channels with real-time bidirectional communication.

**ZEKE Current Architecture** (`server/routes.ts`):
```typescript
// Single-channel: Twilio SMS webhook only
app.post('/api/sms', async (req, res) => {
  const { Body, From } = req.body;
  // Handle single channel
});
```

**Moltbot Architecture (to adopt)**:
```
┌─────────────────────────────────────────────────────────────┐
│                    WebSocket Gateway                         │
│                  ws://127.0.0.1:18789                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │WhatsApp │ │Telegram │ │ Slack   │ │Discord  │  ...      │
│  │(Baileys)│ │(grammY) │ │ (Bolt)  │ │(discord)│           │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘           │
│       └────────────┴──────────┴────────────┘               │
│                          │                                  │
│              Unified Message Router                         │
│                          │                                  │
│                   Agent Sessions                            │
└─────────────────────────────────────────────────────────────┘
```

**Key Benefits:**
- Single codebase handles all channels
- Real-time message delivery
- Unified conversation threading
- Channel-agnostic agent logic

**Channel Libraries Used:**
| Channel | Library | Version |
|---------|---------|---------|
| WhatsApp | Baileys | 7.0.0-rc.9 |
| Telegram | grammY | ^1.39.3 |
| Slack | @slack/bolt | ^4.6.0 |
| Discord | discord.js | ^14.x |
| LINE | @line/bot-sdk | ^10.6.0 |

---

### 2. Docker Session Isolation (Security)

Moltbot sandboxes non-main sessions (groups/channels) in Docker containers, providing process-level isolation for untrusted contexts.

**ZEKE Current Security** (`server/capabilities/index.ts:199-203`):
```typescript
// Permission-based only - no process isolation
const permissions = {
  send_sms: (p) => p.isAdmin,
  delete_file: (p) => p.isAdmin && p.canDeleteFiles,
};
```

**Moltbot Security Model:**
```
┌─────────────────────────────────────────┐
│           Session Manager               │
├─────────────────────────────────────────┤
│  Main Session (Nate DM)                 │
│    → Full tool access                   │
│    → No sandbox                         │
├─────────────────────────────────────────┤
│  Group Session (Work Slack)             │
│    → Tool allowlist only                │
│    → Docker sandbox                     │
│    → Resource limits                    │
├─────────────────────────────────────────┤
│  Untrusted Session (Public Discord)     │
│    → Minimal tools                      │
│    → Strict sandbox                     │
│    → Rate limiting                      │
└─────────────────────────────────────────┘
```

**Key Benefits:**
- Process-level isolation prevents tool escape
- Per-session tool allowlists/denylists
- Resource quotas per session
- Audit logging per container

---

### 3. Voice Integration (ElevenLabs)

Moltbot has sophisticated voice with always-on speech recognition and high-quality TTS.

**ZEKE Current** (`server/voice.ts`):
- Basic Twilio voice
- No continuous listening
- Limited voice quality

**Moltbot Voice Stack:**
- **TTS:** ElevenLabs (natural voice synthesis)
- **STT:** Whisper-based transcription
- **Wake Word:** Always-on detection ("Hey Zeke")
- **Streaming:** Real-time audio processing

**Key Benefits:**
- Natural-sounding voice responses
- Hands-free operation with wake word
- Low-latency streaming
- Multiple voice personas

---

### 4. Browser Automation (Playwright)

Moltbot includes browser control via Playwright for web research and automation.

**ZEKE Current:** No browser automation capability.

**Moltbot Browser Capabilities:**
```typescript
// Example tools available
- browse_url(url, extract: "text" | "screenshot" | "links")
- click_element(selector)
- fill_form(selector, value)
- take_screenshot()
- extract_table(selector)
- wait_for_element(selector)
```

**Use Cases:**
- Research tasks requiring live web data
- Form filling and submission
- Screenshot capture for visual context
- Data extraction from web pages
- Automated testing and monitoring

---

### 5. Visual Workspace (Canvas/A2UI)

Moltbot's A2UI (Agent-driven UI) provides rich visual interaction beyond text.

**ZEKE Current:** Traditional React chat UI (`client/src/`).

**Moltbot Visual Capabilities:**
- **Canvas:** Drawing and diagramming
- **A2UI:** Agent-controlled UI rendering
- **Nodes:** Visual data representations
- **Interactive:** Click-to-act elements

**Use Cases:**
- Project planning boards
- Data visualization
- Mind mapping
- Visual explanations
- Interactive dashboards

---

### 6. Device Nodes (iOS/Android/macOS)

Moltbot supports device-level integration across platforms.

**ZEKE Current:** Omi wearable only.

**Moltbot Device Support:**
- **macOS:** System automation, notifications
- **iOS:** Shortcuts integration, push notifications
- **Android:** Tasker integration, background services

---

## What ZEKE Does Better (Preserve These)

### 1. Sophisticated Memory System

ZEKE's memory architecture with embeddings, TTL scopes, and semantic search is significantly more advanced.

**Location:** `core/memory/memory_store.py`, `python_agents/agents/memory_curator.py`

**Memory Schema:**
```python
# Memory Scopes with TTL
MemoryScope:
  - persona:zeke      # Permanent (user personality/preferences)
  - task:<name>       # Task duration TTL
  - ops:<category>    # 90-day TTL (operational context)
  - calendar:*        # Calendar-related memories
  - notes:*           # Observations and notes
```

**Database Schema** (`shared/schema.ts`):
```typescript
export const memoryNotes = pgTable("memory_notes", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["summary", "note", "preference", "fact"] }),
  content: text("content").notNull(),
  context: text("context"),
  embedding: text("embedding"),  // Vector for semantic search

  // Confidence & usage tracking
  confidenceScore: text("confidence_score").default("0.8"),
  confirmationCount: integer("confirmation_count").default(0),
  usageCount: integer("usage_count").default(0),
  lastUsedAt: text("last_used_at"),

  // TTL system
  scope: text("scope", { enum: ["transient", "session", "long_term"] }),
  expiresAt: text("expires_at"),

  // Metadata
  sourceType: text("source_type"),
  sourceId: text("source_id"),
  placeId: text("place_id"),
  contactId: text("contact_id"),

  isActive: boolean("is_active").default(true),
  isSuperseded: boolean("is_superseded").default(false),
  supersededBy: text("superseded_by"),
});
```

**Key Features to Preserve:**
- Vector embeddings for semantic search
- TTL-based auto-expiration by scope
- Usage tracking and confidence scoring
- Memory supersession (newer facts replace older)
- Hybrid search (vector + full-text)

---

### 2. Three-Phase Agent Orchestration

The Conductor's execution strategy is well-designed for complex multi-agent tasks.

**Location:** `python_agents/agents/conductor.py:1198-1360`

```
┌─────────────────────────────────────────────────────────────┐
│                    CONDUCTOR EXECUTION                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Phase 1: Memory Enrichment (SEQUENTIAL)                     │
│    └─► MemoryCurator                                         │
│        - Semantic search for relevant memories               │
│        - Build context from past interactions                │
│        - Identify user preferences                           │
│                                                              │
│  Phase 2: Parallel Specialists (CONCURRENT)                  │
│    ├─► ResearchScout (web search, fact-finding)              │
│    ├─► OpsPlanner (tasks, calendar, reminders)               │
│    ├─► CommsPilot (messaging, calls)                         │
│    ├─► OmiAnalyst (lifelog processing)                       │
│    └─► ForesightStrategist (predictions)                     │
│                                                              │
│  Phase 3: Safety Validation (SEQUENTIAL)                     │
│    └─► SafetyAuditor                                         │
│        - Permission validation                               │
│        - Content safety check                                │
│        - Response sanitization                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Key Benefits:**
- Context is always available before action (Phase 1)
- Parallel execution for performance (Phase 2)
- Safety checks before response delivery (Phase 3)
- Clean handoff tracking for debugging

---

### 3. Intent Classification System

Clean routing from user intent to specialist agents.

**Location:** `python_agents/agents/conductor.py:50-117`

```python
# Two-level routing system
INTENT_TO_CATEGORY: dict[IntentType, CapabilityCategory] = {
    IntentType.SEND_MESSAGE: CapabilityCategory.COMMUNICATION,
    IntentType.CALENDAR_QUERY: CapabilityCategory.SCHEDULING,
    IntentType.TASK_MANAGEMENT: CapabilityCategory.PRODUCTIVITY,
    IntentType.WEB_SEARCH: CapabilityCategory.RESEARCH,
    IntentType.MEMORY_RECALL: CapabilityCategory.MEMORY,
    # ... 40+ intent mappings
}

CAPABILITY_TO_AGENT: dict[CapabilityCategory, list[AgentId]] = {
    CapabilityCategory.COMMUNICATION: [AgentId.COMMS_PILOT],
    CapabilityCategory.SCHEDULING: [AgentId.OPS_PLANNER],
    CapabilityCategory.RESEARCH: [AgentId.RESEARCH_SCOUT],
    CapabilityCategory.MEMORY: [AgentId.MEMORY_CURATOR],
    # ... direct agent routing
}
```

**Key Benefits:**
- Deterministic routing (no ambiguity)
- Easy to extend (add new intents/agents)
- Fallback handling built-in
- Audit trail of routing decisions

---

### 4. Context Enrichment Bundles

Parallel fetching of context before agent execution.

**Location:** `python_agents/agents/conductor.py:792-850`

```python
# Parallel context fetching
async def enrich_context(self, message: str, context: AgentContext) -> EnrichedInput:
    # Fetch all bundles in parallel
    global_bundle, memory_bundle, calendar_bundle, location_bundle = await asyncio.gather(
        self._get_global_bundle(context),      # Time, profile, timezone
        self._get_memory_bundle(message),       # Semantic memory search
        self._get_calendar_bundle(),            # Today's schedule
        self._get_location_bundle(),            # Current location
    )

    return EnrichedInput(
        original_message=message,
        global_context=global_bundle,
        memories=memory_bundle,
        calendar=calendar_bundle,
        location=location_bundle,
    )
```

**Key Benefits:**
- Parallel fetching for speed
- Rich context for every request
- Consistent context structure
- Easy to add new bundles

---

### 5. Bridge Caching System

Python-to-Node.js bridge with intelligent caching.

**Location:** `python_agents/bridge.py:25-100`

```python
# Tool categorization for caching
CACHEABLE_TOOLS = frozenset({
    "get_user_profile",
    "get_calendar_events",
    "get_contacts",
    "get_tasks",
    "search_memories",
    # Read-only operations
})

MUTATING_TOOLS = frozenset({
    "send_sms",
    "add_task",
    "create_event",
    "update_contact",
    # State-changing operations
})

class BridgeCache:
    def __init__(self, ttl_seconds: int = 300):
        self.cache: dict[str, CacheEntry] = {}
        self.ttl = ttl_seconds

    async def get_or_fetch(self, tool: str, args: dict) -> Any:
        if tool not in CACHEABLE_TOOLS:
            return await self._fetch(tool, args)

        key = self._make_key(tool, args)
        if key in self.cache and not self.cache[key].expired:
            return self.cache[key].value

        result = await self._fetch(tool, args)
        self.cache[key] = CacheEntry(value=result, expires_at=time.time() + self.ttl)
        return result

    def invalidate_on_mutation(self, tool: str):
        if tool in MUTATING_TOOLS:
            # Clear related caches
            self.cache.clear()
```

**Key Benefits:**
- Reduces redundant API calls
- Automatic cache invalidation on mutations
- TTL-based expiration
- Per-tool caching policies

---

### 6. Omi Wearable Integration

Unique lifelog processing from Omi pendant.

**Location:** `server/jobs/omiProcessor.ts`, `python_agents/agents/omi_analyst.py`

**Capabilities:**
- Real-time transcript ingestion
- Speaker diarization
- Memory extraction from conversations
- Activity pattern analysis
- Location context from wearable

---

### 7. 8 Specialist Agents

Well-defined agent roles with clear responsibilities.

| Agent | ID | Responsibilities |
|-------|-----|------------------|
| **Conductor** | `conductor` | Routing, orchestration, response composition |
| **MemoryCurator** | `memory_curator` | Store, recall, manage memory lifecycle |
| **CommsPilot** | `comms_pilot` | SMS, email, voice calls |
| **OpsPlanner** | `ops_planner` | Tasks, calendar, reminders, grocery |
| **ResearchScout** | `research_scout` | Web search, fact-finding |
| **SafetyAuditor** | `safety_auditor` | Permission validation, content safety |
| **OmiAnalyst** | `omi_analyst` | Lifelog processing |
| **ForesightStrategist** | `foresight_strategist` | Pattern detection, predictions |

---

## Proposed Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      ZEKE + MOLTBOT SUPER SYSTEM                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    WebSocket Gateway (FROM MOLTBOT)                │ │
│  │              Unified multi-channel message handling                │ │
│  ├───────────────────────────────────────────────────────────────────┤ │
│  │  WhatsApp │ Telegram │ Slack │ Discord │ SMS │ iMessage │ WebChat │ │
│  └─────────────────────────────┬─────────────────────────────────────┘ │
│                                │                                        │
│                                ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │               Session Manager (FROM MOLTBOT)                       │ │
│  │     - DM pairing policies                                          │ │
│  │     - Docker sandbox for untrusted sessions                        │ │
│  │     - Tool allowlists/denylists per session                        │ │
│  └─────────────────────────────┬─────────────────────────────────────┘ │
│                                │                                        │
│                                ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │              Python Agent Orchestrator (FROM ZEKE)                 │ │
│  │                                                                    │ │
│  │   Phase 1: Memory Enrichment                                       │ │
│  │     └─► MemoryCurator (semantic recall, context building)          │ │
│  │                                                                    │ │
│  │   Phase 2: Parallel Specialists                                    │ │
│  │     ├─► CommsPilot (multi-channel via Gateway)                     │ │
│  │     ├─► OpsPlanner (tasks, calendar, grocery)                      │ │
│  │     ├─► ResearchScout (Perplexity + Browser automation)            │ │
│  │     ├─► OmiAnalyst (wearable lifelogs)                             │ │
│  │     └─► ForesightStrategist (predictions)                          │ │
│  │                                                                    │ │
│  │   Phase 3: Safety Validation                                       │ │
│  │     └─► SafetyAuditor (permission + content check)                 │ │
│  └─────────────────────────────┬─────────────────────────────────────┘ │
│                                │                                        │
│                                ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                Node.js Capability Layer (HYBRID)                   │ │
│  │                                                                    │ │
│  │   FROM ZEKE:                │   FROM MOLTBOT:                      │ │
│  │   - communication.ts        │   - browser.ts (Playwright)          │ │
│  │   - calendar.ts             │   - voice.ts (ElevenLabs)            │ │
│  │   - memory.ts               │   - canvas.ts (A2UI)                 │ │
│  │   - tasks.ts                │   - devices.ts (iOS/Android nodes)   │ │
│  │   - grocery.ts              │   - gateway.ts (channel routing)     │ │
│  │   - search.ts               │                                      │ │
│  │   - location.ts             │                                      │ │
│  │   - people.ts               │                                      │ │
│  │   - files.ts                │                                      │ │
│  │   - knowledgeGraph.ts       │                                      │ │
│  └─────────────────────────────┬─────────────────────────────────────┘ │
│                                │                                        │
│                                ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                   Memory & Storage (FROM ZEKE)                     │ │
│  │                                                                    │ │
│  │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │ │
│  │   │  PostgreSQL     │  │  Memory Store   │  │  Knowledge      │   │ │
│  │   │  (Drizzle ORM)  │  │  (Embeddings)   │  │  Graph          │   │ │
│  │   └─────────────────┘  └─────────────────┘  └─────────────────┘   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Roadmap

### Phase 1: Multi-Channel Gateway (Priority: HIGH)

**Estimated Effort:** 2-3 weeks

**Files to Create:**
```
server/gateway/
├── index.ts                 # WebSocket control plane
├── session.ts               # Session management
├── router.ts                # Message routing
├── channels/
│   ├── base.ts              # Channel interface
│   ├── whatsapp.ts          # Baileys integration
│   ├── telegram.ts          # grammY integration
│   ├── slack.ts             # Bolt integration
│   ├── discord.ts           # discord.js integration
│   ├── sms.ts               # Twilio (refactored from existing)
│   └── webchat.ts           # WebSocket chat
└── security/
    ├── pairing.ts           # DM pairing policies
    └── sandbox.ts           # Docker isolation
```

**Channel Interface** (`server/gateway/channels/base.ts`):
```typescript
export interface Channel {
  id: string;
  type: ChannelType;

  // Lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Messaging
  sendMessage(recipient: string, content: MessageContent): Promise<SendResult>;
  onMessage(handler: MessageHandler): void;

  // Metadata
  getRecipientInfo(id: string): Promise<RecipientInfo>;
}

export type ChannelType =
  | 'sms'
  | 'whatsapp'
  | 'telegram'
  | 'slack'
  | 'discord'
  | 'webchat';

export interface MessageContent {
  text?: string;
  media?: MediaAttachment[];
  buttons?: Button[];
  metadata?: Record<string, unknown>;
}
```

**WhatsApp Channel** (`server/gateway/channels/whatsapp.ts`):
```typescript
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';

export class WhatsAppChannel implements Channel {
  id = 'whatsapp';
  type: ChannelType = 'whatsapp';
  private socket: ReturnType<typeof makeWASocket> | null = null;
  private messageHandlers: MessageHandler[] = [];

  async connect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState('./auth/whatsapp');

    this.socket = makeWASocket({
      auth: state,
      printQRInTerminal: true,
    });

    this.socket.ev.on('creds.update', saveCreds);
    this.socket.ev.on('messages.upsert', this.handleIncoming.bind(this));
  }

  async sendMessage(recipient: string, content: MessageContent): Promise<SendResult> {
    if (!this.socket) throw new Error('Not connected');

    const jid = recipient.includes('@') ? recipient : `${recipient}@s.whatsapp.net`;

    await this.socket.sendMessage(jid, {
      text: content.text,
    });

    return { success: true, messageId: crypto.randomUUID() };
  }

  private handleIncoming(update: { messages: any[] }) {
    for (const msg of update.messages) {
      if (!msg.message) continue;

      const normalized: NormalizedMessage = {
        id: msg.key.id,
        channel: 'whatsapp',
        from: msg.key.remoteJid,
        text: msg.message.conversation || msg.message.extendedTextMessage?.text,
        timestamp: new Date(msg.messageTimestamp * 1000),
      };

      for (const handler of this.messageHandlers) {
        handler(normalized);
      }
    }
  }
}
```

**Gateway Router** (`server/gateway/router.ts`):
```typescript
import { Channel, NormalizedMessage } from './channels/base';
import { routeToPythonAgents } from '../python-agents';

export class GatewayRouter {
  private channels: Map<string, Channel> = new Map();

  registerChannel(channel: Channel): void {
    this.channels.set(channel.type, channel);
    channel.onMessage(this.handleMessage.bind(this));
  }

  private async handleMessage(message: NormalizedMessage): Promise<void> {
    // Route to Python agents with channel context
    const response = await routeToPythonAgents(
      message.text,
      `${message.channel}:${message.from}`, // conversationId
      {
        type: message.channel,
        metadata: {
          from: message.from,
          messageId: message.id,
          timestamp: message.timestamp,
        },
      }
    );

    // Send response back via same channel
    const channel = this.channels.get(message.channel);
    if (channel) {
      await channel.sendMessage(message.from, { text: response });
    }
  }
}
```

---

### Phase 2: Voice Upgrade (Priority: MEDIUM)

**Estimated Effort:** 1-2 weeks

**Files to Create:**
```
server/voice/
├── index.ts                 # Voice pipeline coordinator
├── elevenLabs.ts            # ElevenLabs TTS/STT
├── wakeWord.ts              # Wake word detection
└── streaming.ts             # Audio streaming
```

**ElevenLabs Integration** (`server/voice/elevenLabs.ts`):
```typescript
import { ElevenLabsClient } from 'elevenlabs';

export class ElevenLabsVoice {
  private client: ElevenLabsClient;
  private voiceId: string;

  constructor(apiKey: string, voiceId: string = 'default') {
    this.client = new ElevenLabsClient({ apiKey });
    this.voiceId = voiceId;
  }

  async textToSpeech(text: string): Promise<Buffer> {
    const audio = await this.client.textToSpeech.convert(this.voiceId, {
      text,
      model_id: 'eleven_turbo_v2',
      output_format: 'mp3_44100_128',
    });

    const chunks: Buffer[] = [];
    for await (const chunk of audio) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async streamTextToSpeech(text: string, onChunk: (chunk: Buffer) => void): Promise<void> {
    const stream = await this.client.textToSpeech.convertAsStream(this.voiceId, {
      text,
      model_id: 'eleven_turbo_v2',
    });

    for await (const chunk of stream) {
      onChunk(Buffer.from(chunk));
    }
  }
}
```

---

### Phase 3: Browser Automation (Priority: MEDIUM)

**Estimated Effort:** 1 week

**Files to Create:**
```
server/capabilities/browser.ts    # Browser tools
server/browser/
├── manager.ts               # Browser instance management
├── automation.ts            # Playwright actions
└── screenshot.ts            # Screen capture
```

**Browser Capability** (`server/capabilities/browser.ts`):
```typescript
import type { OpenAI } from "openai";
import { BrowserManager } from "../browser/manager";

export const browserToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "browse_url",
      description: "Navigate to a URL and extract content (text, screenshot, or links)",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to visit" },
          extract: {
            type: "string",
            enum: ["text", "screenshot", "links"],
            description: "What to extract from the page"
          },
          waitFor: {
            type: "string",
            description: "CSS selector to wait for before extracting"
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "click_element",
      description: "Click an element on the current page",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector of element to click" },
        },
        required: ["selector"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fill_input",
      description: "Fill a form input field",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector of input" },
          value: { type: "string", description: "Value to enter" },
        },
        required: ["selector", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "take_screenshot",
      description: "Take a screenshot of the current page",
      parameters: {
        type: "object",
        properties: {
          fullPage: { type: "boolean", description: "Capture full page (default: false)" },
        },
      },
    },
  },
];

export const browserToolPermissions = {
  browse_url: () => true,
  click_element: () => true,
  fill_input: () => true,
  take_screenshot: () => true,
};

const browserManager = new BrowserManager();

export async function executeBrowserTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string | null> {
  switch (toolName) {
    case "browse_url": {
      const { url, extract = "text", waitFor } = args as {
        url: string;
        extract?: "text" | "screenshot" | "links";
        waitFor?: string;
      };

      const page = await browserManager.getPage();
      await page.goto(url, { waitUntil: 'networkidle' });

      if (waitFor) {
        await page.waitForSelector(waitFor);
      }

      let result: any;
      switch (extract) {
        case "text":
          result = await page.evaluate(() => document.body.innerText);
          break;
        case "screenshot":
          const buffer = await page.screenshot({ type: 'png' });
          result = buffer.toString('base64');
          break;
        case "links":
          result = await page.evaluate(() =>
            Array.from(document.querySelectorAll('a[href]'))
              .map(a => ({ text: a.textContent, href: a.getAttribute('href') }))
          );
          break;
      }

      return JSON.stringify({ success: true, data: result });
    }

    case "click_element": {
      const { selector } = args as { selector: string };
      const page = await browserManager.getPage();
      await page.click(selector);
      return JSON.stringify({ success: true });
    }

    case "fill_input": {
      const { selector, value } = args as { selector: string; value: string };
      const page = await browserManager.getPage();
      await page.fill(selector, value);
      return JSON.stringify({ success: true });
    }

    case "take_screenshot": {
      const { fullPage = false } = args as { fullPage?: boolean };
      const page = await browserManager.getPage();
      const buffer = await page.screenshot({ fullPage, type: 'png' });
      return JSON.stringify({
        success: true,
        data: buffer.toString('base64'),
        mimeType: 'image/png'
      });
    }

    default:
      return null;
  }
}

export const browserToolNames = [
  "browse_url",
  "click_element",
  "fill_input",
  "take_screenshot",
];
```

---

### Phase 4: Visual Workspace (Priority: LOW)

**Estimated Effort:** 2-3 weeks

**Files to Create:**
```
client/src/components/canvas/
├── Canvas.tsx               # Main canvas component
├── A2UI.tsx                 # Agent-driven UI
├── nodes/
│   ├── TextNode.tsx
│   ├── ImageNode.tsx
│   └── ChartNode.tsx
└── tools/
    ├── draw.ts
    └── arrange.ts

server/capabilities/canvas.ts    # Canvas rendering tools
```

---

## Key Code Integration Points

### 1. Gateway Integration with Python Agents

**Modify:** `server/python-agents.ts`

```typescript
// Current signature
async function routeToPythonAgents(
  message: string,
  conversationId: string
): Promise<string>

// Enhanced signature with channel context
export async function routeToPythonAgents(
  message: string,
  conversationId: string,
  channel?: {
    type: 'sms' | 'whatsapp' | 'telegram' | 'slack' | 'discord' | 'webchat';
    metadata: Record<string, unknown>;
  }
): Promise<string> {
  const response = await fetch(`${PYTHON_AGENTS_URL}/api/agents/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      conversation_id: conversationId,
      channel,  // NEW: channel context passed to agents
      phone_number: channel?.type === 'sms' ? channel.metadata.from : undefined,
    }),
  });

  const data = await response.json();
  return data.response;
}
```

### 2. CommsPilot Multi-Channel Support

**Modify:** `python_agents/agents/comms_pilot.py`

```python
# Current: SMS-only tool
async def _handle_send_sms(self, ctx: Any, args: str) -> str:
    arguments = json.loads(args)
    to = arguments.get("to")
    message = arguments.get("message")

    result = await self.bridge.execute_tool("send_sms", {
        "to": to,
        "message": message,
    })
    return result

# Enhanced: Multi-channel tool
async def _handle_send_message(self, ctx: Any, args: str) -> str:
    arguments = json.loads(args)
    channel = arguments.get("channel", "sms")  # Default to SMS for backwards compat
    recipient = arguments.get("recipient")
    content = arguments.get("content")

    # Route through Gateway
    result = await self.bridge.execute_tool("gateway_send", {
        "channel": channel,
        "recipient": recipient,
        "content": content,
    })
    return result
```

### 3. Gateway Capability Registration

**Modify:** `server/capabilities/index.ts`

```typescript
// Add gateway exports
export {
  gatewayToolDefinitions,
  gatewayToolPermissions,
  executeGatewayTool,
  gatewayToolNames,
} from "./gateway";

// Add browser exports
export {
  browserToolDefinitions,
  browserToolPermissions,
  executeBrowserTool,
  browserToolNames,
} from "./browser";
```

### 4. Session Security in Conductor

**Modify:** `python_agents/agents/conductor.py`

```python
async def _execute(
    self,
    message: str,
    context: AgentContext
) -> str:
    # NEW: Check session security level
    session_security = self._get_session_security(context)

    if session_security == SessionSecurity.SANDBOXED:
        # Restrict available tools for untrusted sessions
        allowed_tools = self._get_sandboxed_tools()
        context = context.with_tool_filter(allowed_tools)

    # ... rest of execution
```

---

## Migration Strategy

### 1. Dual Mode Operation

Run both systems in parallel during migration:

```bash
# Environment flags
ENABLE_GATEWAY=true           # Enable new gateway
ENABLE_LEGACY_SMS=true        # Keep existing Twilio working
ENABLE_WHATSAPP=true          # Enable WhatsApp channel
ENABLE_TELEGRAM=false         # Telegram disabled initially
ENABLE_BROWSER_AUTOMATION=true
```

### 2. Feature Flag Implementation

```typescript
// server/config.ts
export const features = {
  gateway: process.env.ENABLE_GATEWAY === 'true',
  legacySms: process.env.ENABLE_LEGACY_SMS !== 'false', // Default on
  whatsapp: process.env.ENABLE_WHATSAPP === 'true',
  telegram: process.env.ENABLE_TELEGRAM === 'true',
  slack: process.env.ENABLE_SLACK === 'true',
  discord: process.env.ENABLE_DISCORD === 'true',
  browserAutomation: process.env.ENABLE_BROWSER_AUTOMATION === 'true',
  voiceElevenLabs: process.env.ENABLE_ELEVENLABS === 'true',
  canvas: process.env.ENABLE_CANVAS === 'true',
};
```

### 3. Preserve Memory Continuity

All channel conversations feed into the same memory store:

```python
# Memory storage includes channel metadata
await remember(
    text="User prefers brief responses on Slack",
    scope=MemoryScope.persona("preferences"),
    tags=["communication", "style", "slack"],
    metadata={
        "source_channel": "slack",
        "confidence": 0.9,
    }
)
```

### 4. Single Conductor

Keep ZEKE's Conductor as the sole orchestrator:
- Gateway feeds messages into Conductor
- Specialists remain unchanged
- CommsPilot adapts to multi-channel output

---

## Dependencies

### New NPM Packages

```json
{
  "dependencies": {
    "@whiskeysockets/baileys": "^7.0.0-rc.9",
    "grammy": "^1.39.3",
    "@slack/bolt": "^4.6.0",
    "discord.js": "^14.14.1",
    "playwright-core": "^1.58.0",
    "elevenlabs": "^0.10.0"
  }
}
```

### Environment Variables

```bash
# Gateway
ENABLE_GATEWAY=true
GATEWAY_PORT=18789

# WhatsApp (Baileys)
WHATSAPP_AUTH_PATH=./auth/whatsapp

# Telegram
TELEGRAM_BOT_TOKEN=...

# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SIGNING_SECRET=...

# Discord
DISCORD_BOT_TOKEN=...
DISCORD_APPLICATION_ID=...

# ElevenLabs
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...

# Browser
BROWSER_HEADLESS=true
BROWSER_TIMEOUT=30000
```

---

## Summary

| Component | Source | Action |
|-----------|--------|--------|
| WebSocket Gateway | Moltbot | **ADOPT** |
| Multi-channel (WhatsApp, Telegram, Slack, Discord) | Moltbot | **ADOPT** |
| Docker Session Sandboxing | Moltbot | **ADOPT** |
| ElevenLabs Voice | Moltbot | **ADOPT** |
| Playwright Browser | Moltbot | **ADOPT** |
| Canvas/A2UI | Moltbot | **ADOPT** (Phase 4) |
| Memory System (embeddings, TTL, scoping) | ZEKE | **PRESERVE** |
| Three-Phase Conductor | ZEKE | **PRESERVE** |
| 8 Specialist Agents | ZEKE | **PRESERVE** |
| Intent Classification | ZEKE | **PRESERVE** |
| Context Enrichment Bundles | ZEKE | **PRESERVE** |
| Bridge Caching | ZEKE | **PRESERVE** |
| Omi Wearable | ZEKE | **PRESERVE** |
| Google Calendar | ZEKE | **PRESERVE** |
| PostgreSQL + Drizzle | ZEKE | **PRESERVE** |

The result is a **super-organism** that combines Moltbot's sophisticated channel connectivity and security model with ZEKE's intelligent memory and agent orchestration—giving you an AI assistant that can reach you anywhere while remembering everything relevant about you.

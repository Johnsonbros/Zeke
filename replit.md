# Project: ZEKE – Nate's Personal AI Assistant

## Documentation

Detailed documentation is available in the `/docs/` folder:
- **[AGENTS.md](docs/AGENTS.md)** - Multi-agent architecture, Conductor orchestration, specialist agent roles
- **[MEMORY.md](docs/MEMORY.md)** - Long-term memory system, SQLite+FTS5+vectors, scopes, eviction
- **[DEVELOPMENT.md](docs/DEVELOPMENT.md)** - Coding guidelines, conventions, how to extend ZEKE
- **[TOOLS.md](docs/TOOLS.md)** - Complete tool reference by category

## Overview
ZEKE is a single-user personal AI assistant designed for Nate Johnson, focusing on high-quality, long-term memory and accessible interaction via SMS and a simple web UI. Its core purpose is to provide action-oriented, proactive, and personalized assistance through respectful and precise communication. Key capabilities include comprehensive personal context management, intelligent communication, task/calendar integration, location awareness, and sophisticated food preference tracking, aiming for a highly personalized, efficient, and intelligent assistant experience.

## User Preferences
- Respectful, precise, non-fluffy communication.
- ZEKE is configured to be ACTION-ORIENTED, not a suggestion machine.
- Always use tools when asked for information - prefer `perplexity_search` for complex questions, research, and detailed answers.
- Share what was found (URLs, partial info) instead of deflecting.
- Never tell users to "check the website themselves" or "search for it".
- Provide actionable results even when exact info isn't found.
- Never delete memory without explicit instruction.
- All conversation titles and memories should always be generated in English.

## System Architecture
ZEKE employs a multi-agent architecture with a Node.js + TypeScript (Express) backend, a Python FastAPI microservice for agent orchestration, and a React frontend with Tailwind CSS and shadcn/ui components. SQLite serves as the persistent data store.

The core is a multi-agent system in Python, featuring specialized agents like Conductor, Memory Curator, Comms Pilot, Ops Planner, Research Scout, and Safety Auditor. A TypeScript Context Router system provides domain-specific context bundles to Python agents, supporting a dual-context strategy for efficiency. The UI features a dark theme with a coral red accent and Poppins font, designed as a dashboard-first interface with global sidebar navigation.

Key technical implementations and features include:
- **Context Router System**: Multi-layered context assembly system with token-budgeted bundles, parallel assembly, and caching with priority-based eviction and predictive prefetching.
- **Unified Context Cache Layer**: Pre-computed context snapshots stored in memory + KV store, updated incrementally when data changes. Cache keys include budget tier (primary/secondary/tertiary) for correct token budgeting. Provides 2x-5x faster context assembly for cache hits (<5ms).
- **Conversation Summarization System**: Automatically compresses older conversation history into bullet summaries using GPT-4o-mini.
- **Memory Model**: Optimized for single-user long-term memory with semantic search.
- **Reminders & Automations**: Scheduled tasks, AI Task Breakdown, Smart Grocery Suggestions, Proactive Task Follow-up, and Natural Language Automation Builder.
- **Tooling**: Integrates various AI tools for communication, task/calendar management, weather, web search, file operations, and Omi pendant lifelogs.
- **Omi Pendant Integration**: Connects to the Omi API for accessing and semantically searching recorded conversations, including GPS correlation for location context and webhook integration for real-time processing and command detection.
- **Voice Pipeline**: Processes voice input from Omi Pendant lifelogs through the main agent pipeline.
- **Location Intelligence Service**: Enhanced agentic location awareness, including calendar-GPS correlation, real-time movement classification, and proactive context injection.
- **Automatic People Tracking System**: Extracts, tracks, and links relationships within memories.
- **Food Preference Intelligence System**: Tracks preferences, restrictions, and recipes, with AI-powered generation and grocery integration.
- **Smart Notification Batching**: Intelligent SMS notification system with queueing, batching, and quiet hours.
- **Enhanced NLP Parser**: Multi-stage pipeline with intent classification, entity extraction, and context disambiguation via knowledge graph integration.
- **AI-Powered Weather Briefings**: Personalized, narrative weather reports with actionable advice and severe weather monitoring.
- **Predictive Task Scheduling**: Analyzes task completion patterns for AI-powered scheduling suggestions.
- **Knowledge Graph System**: Unified graph database connecting all data domains for multi-hop reasoning and anticipatory intelligence.
- **Files & Documents System**: Comprehensive file/document management with hierarchical folders, full-text search, rich text editor, and proactive document saving by ZEKE.
- **Feedback Learning Loop System**: Enables ZEKE to learn from action outcomes, user corrections, and implicit feedback to influence future decisions.
- **AGENTS.md Support**: Provides standardized instructions for external coding agents and allows ZEKE to parse AGENTS.md from external repositories.
- **Realtime Chunk Idempotency Layer**: Prevents duplicate processing of incoming data chunks.
- **MMS Image Processing**: Receives, downloads, and analyzes images sent via SMS/MMS using GPT-4o Vision, enabling ZEKE to understand photos of people, places, and occasions for memory creation and contact updates.
- **Mobile UI Enhancements**: Includes swipe gestures for sidebar navigation and a customizable Quick Menu bottom drawer.
- **Replit Key-Value Store Integration**: Persistent caching layer for session state, preferences, and rate limiting.
- **Async Memory Processing Queue**: Robust job queue system for processing Omi memories with priority-based scheduling and retry mechanisms.
- **Specialized Intelligence Workers**: Background workers for deep memory analysis (TaskExtractor, CommitmentTracker, RelationshipAnalyzer).
- **Anticipation Engine & Morning Briefings**: Generates personalized morning briefings summarizing pending tasks, meetings, and commitments.
- **Pattern Detection System**: Identifies behavioral patterns from conversation history.
- **Morning Briefing Scheduler**: Automated delivery of morning briefings via SMS.
- **Journal / Daily Summary System**: Nightly automated journal entries (11 PM) that analyze conversations, tasks, memories, and activities to generate comprehensive daily summaries with insights, key events, and highlights. Accessible via /journal page with list/detail views.

## External Dependencies
- **OpenAI API**: AI responses, agent logic, and text embeddings.
- **Twilio**: SMS messaging and voice calling.
- **ElevenLabs**: Custom voice synthesis (Flash v2.5 model), with fallback to Amazon Polly.
- **better-sqlite3**: Node.js SQLite client.
- **Perplexity API**: Enhanced AI-powered web search.
- **Google Calendar API**: Calendar integration.
- **OpenWeatherMap API**: Weather data.
- **DuckDuckGo API**: Fallback web search.
- **Omi API**: Accessing lifelogs from the Omi pendant.

## Mobile App (Expo/React Native)
ZEKE has a companion mobile app built with Expo/React Native, maintained in a separate GitHub repository and synced automatically.

**Repository:** `Johnsonbros/ZEKEapp`
**Local Path:** `android/` (synced via GitHub webhook)

**Build Commands:**
```bash
cd android
npm install                # Install dependencies
npx expo start             # Start Expo dev server
npx eas build              # Build for production
```

**Native Capabilities:**
- **Geolocation**: Direct GPS location from phone (enhances Location Intelligence)
- **Push Notifications**: Instant alerts for reminders, tasks, briefings
- **Background Location**: Continuous location tracking for visit detection
- **Voice Input**: Record and transcribe voice messages

**Notes:**
- The mobile app connects to the ZEKE backend API
- Changes to ZEKEapp repo auto-sync here via webhook
- Changes made locally can be pushed back via `/api/github/push`

## GitHub Repository Sync

The Android app code is synced with the `Johnsonbros/ZEKEapp` GitHub repository. This allows you to develop the Android-specific code separately and have it automatically sync to Replit.

**Webhook Endpoint:** `/api/github/webhook`

**How it works:**
1. When you push to the `main` or `master` branch of ZEKEapp, GitHub calls the webhook
2. ZEKE automatically pulls the latest code into the `android/` folder

**API Endpoints:**
- `POST /api/github/webhook` - Receives GitHub push events (configured in GitHub webhook settings)
- `GET /api/github/sync-status` - Check sync status for all configured repos
- `POST /api/github/sync` - Manually trigger sync (pull from GitHub)
- `POST /api/github/push` - Push local changes to GitHub (body: `{ "message": "commit message" }`)

**Configuration:**
Repo sync configuration is in `server/routes.ts` under `GITHUB_SYNC_CONFIG`:
```typescript
const GITHUB_SYNC_CONFIG = {
  repos: [
    { owner: 'Johnsonbros', repo: 'ZEKEapp', targetPath: './android' }
  ]
};
```

**Setting up GitHub Webhook:**
1. Go to your repo → Settings → Webhooks → Add webhook
2. Payload URL: `https://your-replit-domain/api/github/webhook`
3. Content type: `application/json`
4. Events: Select "Just the push event"

## Long-term Memory System

ZEKE has a persistent SQLite-based memory system located in `/core/memory/` that provides:

**Core Features:**
- **SQLite + FTS5**: Full-text search with BM25 ranking
- **Vector Embeddings**: Semantic search using OpenAI embeddings
- **Scoped Memories**: Organize by `persona:`, `task:`, `ops:`, `calendar:`, `notes`
- **TTL & Eviction**: Automatic expiration and LRU cleanup

**Key Functions:**
```python
from core.memory import remember, recall, evict_stale_and_lru

# Store a memory
await remember(
    text="User prefers morning meetings",
    scope="persona:zeke",
    tags=["preference", "scheduling"]
)

# Retrieve relevant memories
memories = await recall(
    query="What time does user like meetings?",
    scope="persona:zeke",
    k=5
)

# Clean up expired/excess memories
await evict_stale_and_lru()
```

**Environment Variables:**
- `MEMORY_DB`: Path to SQLite database (default: `./data/memory.db`)
- `EMBED_MODEL`: Embedding model (default: `text-embedding-3-small`)
- `MEMORY_MAX_ROWS`: Global memory limit (default: `20000`)

**Scope Defaults:**
- `persona:*`: No TTL, 5000 row cap
- `task:*` / `ops:*`: 90-day TTL, 10000 row cap
- `calendar:*`: 90-day TTL

**TTL Buckets:**
```python
from core.memory import TTLBucket, get_bucket_ttl, apply_bucket_ttl

# Three bucket types with automatic scope-based assignment:
# - TRANSIENT (36h): calendar:* scopes
# - SESSION (7d): task:*, ops:* scopes  
# - LONG_TERM (no TTL): persona:*, notes, recap:* scopes

# Get TTL for a bucket
ttl = get_bucket_ttl(TTLBucket.SESSION)  # Returns 604800 (7 days)

# Auto-apply bucket TTL based on scope
ttl = apply_bucket_ttl("task:groceries")  # Returns 604800
```

**Thread Auto-Recap:**
```python
from core.memory import recap_thread, find_threads_needing_recap, RecapConfig

# Summarize long conversations (>20 messages or >8KB)
result = await recap_thread(
    conversation_id="conv-123",
    messages=messages,
    openai_client=client,
    store_callback=store_fn,
    purge_callback=purge_fn,  # Optional: delete raw messages
    config=RecapConfig(max_summary_bytes=1024)
)

# Find threads needing recap (>6h old, exceeds thresholds)
threads = await find_threads_needing_recap(
    get_conversations_callback=get_convs,
    get_messages_callback=get_msgs
)
```

## Evaluation Harness

Located in `/eval/`, the regression test system uses pytest with golden data:

**Structure:**
```
/eval/
  tests/              # Test modules
    test_summarize.py
    test_planner.py
    test_tool_router.py
  golden/             # Expected outputs (JSONL)
  runs/               # Saved test run logs
  runner.py           # CLI for running evals
```

**Running Evals:**
```bash
python eval/runner.py              # Run all
python eval/runner.py -t router    # Run specific tests
python eval/runner.py --tasks      # Generate TASKS.md from failures
```

**Adding Tests:**
1. Add golden data in `eval/golden/*.jsonl`
2. Create test in `eval/tests/test_*.py`
3. Use `@pytest.mark.issue("KEY")` to link to tasks
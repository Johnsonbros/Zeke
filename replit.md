# Project: ZEKE – Nate's Personal AI Assistant

## Overview
ZEKE is a single-user personal AI assistant for Nate Johnson, focusing on high-quality, long-term memory and accessible interaction via SMS and a simple web UI. Its purpose is to provide action-oriented, proactive, and personalized assistance through respectful and precise communication. Key capabilities include comprehensive personal context management, intelligent communication, task/calendar integration, location awareness, and sophisticated food preference tracking for a highly personalized, efficient, and intelligent assistant experience.

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
- **Unified Context Cache Layer**: Pre-computed context snapshots for faster context assembly.
- **Conversation Summarization System**: Automatically compresses older conversation history.
- **Memory Model**: Optimized for single-user long-term memory with semantic search (SQLite + FTS5 + vector embeddings).
- **Reminders & Automations**: Scheduled tasks, AI Task Breakdown, Smart Grocery Suggestions, Proactive Task Follow-up, and Natural Language Automation Builder.
- **Tooling**: Integrates various AI tools for communication, task/calendar management, weather, web search, file operations, and Omi pendant lifelogs.
- **Omi Pendant Integration**: Connects to the Omi API for accessing and semantically searching recorded conversations, including GPS correlation and webhook integration.
- **Voice Pipeline**: Processes voice input from Omi Pendant lifelogs.
- **Location Intelligence Service**: Enhanced agentic location awareness, calendar-GPS correlation, real-time movement classification, and proactive context injection.
- **Automatic People Tracking System**: Extracts, tracks, and links relationships within memories.
- **Food Preference Intelligence System**: Tracks preferences, restrictions, and recipes, with AI-powered generation and grocery integration.
- **Smart Notification Batching**: Intelligent SMS notification system with queueing, batching, and quiet hours.
- **Enhanced NLP Parser**: Multi-stage pipeline with intent classification, entity extraction, and context disambiguation.
- **AI-Powered Weather Briefings**: Personalized, narrative weather reports.
- **Predictive Task Scheduling**: Analyzes task completion patterns for AI-powered scheduling suggestions.
- **Knowledge Graph System**: Unified graph database connecting all data domains for multi-hop reasoning.
- **Files & Documents System**: Comprehensive file/document management with search and a rich text editor.
- **Feedback Learning Loop System**: Enables ZEKE to learn from action outcomes and user corrections.
- **AGENTS.md Support**: Standardized instructions for external coding agents and parsing external AGENTS.md files.
- **Realtime Chunk Idempotency Layer**: Prevents duplicate processing of incoming data chunks.
- **MMS Image Processing**: Receives, downloads, and analyzes images sent via SMS/MMS using GPT-4o Vision.
- **Mobile UI Enhancements**: Swipe gestures for sidebar navigation and a customizable Quick Menu bottom drawer.
- **Replit Key-Value Store Integration**: Persistent caching for session state, preferences, and rate limiting.
- **Town Copy Cache**: LRU cache with version-based invalidation for town-specific content.
- **Async Memory Processing Queue**: Robust job queue system for processing Omi memories.
- **Specialized Intelligence Workers**: Background workers for deep memory analysis (TaskExtractor, CommitmentTracker, RelationshipAnalyzer).
- **Anticipation Engine & Morning Briefings**: Generates personalized morning briefings triggered by wake detection.
- **Pattern Detection System**: Identifies behavioral patterns from conversation history.
- **Sleep Tracking System**: Monitors pendant on/off patterns to infer sleep/wake times, tracks night disturbances, collects sleep quality ratings (1-10), saves to data/sleep_log.json.
- **Pendant Health Monitor**: Sends SMS alerts when Omi pendant audio stops flowing (5-minute timeout), auto-detects wake-up to trigger morning briefings.
- **A/B/C Response Format**: All decisions use structured A/B/C or 1-2-3 options with pros/cons, one question at a time for clarity.
- **Journal / Daily Summary System**: Nightly automated journal entries for daily summaries with insights and key events.
- **Overnight Batch Factory**: Uses OpenAI Batch API for cost-efficient overnight processing. Features include:
  - Nightly enrichment job (3 AM) processes day's conversations into memory summaries, knowledge graph edges, and feedback fixes
  - Batch polling scheduler (every 2 hours) checks submitted jobs for completion
  - Artifact consumer integrates batch results into memory notes and knowledge graph
  - Admin endpoints (`/api/admin/batch/*`) for status, manual triggering, and polling
  - Environment config: `BATCH_ENABLED` (default: true), `BATCH_MODEL` (default: gpt-4o), `BATCH_MAX_ITEMS_PER_RUN` (default: 500)
- **AI Usage Logging System**: Comprehensive tracking of all OpenAI API calls across Node.js and Python services. Captures model strings, token usage, latency, costs (with pricing per model), and errors. Features include:
  - SQLite `ai_logs` table with full audit trail
  - Automatic logging via `wrapOpenAI` reliability wrapper with context-based logging
  - Python bridge (`python_agents/logging/ai_logger.py`) for cross-service logging
  - API endpoints for querying logs, stats by model/agent, and detecting anomalies
  - Dashboard widget showing today's/week's usage, costs, latency, and error rates
  - SMS-based anomaly alerting (hourly checks for cost spikes, latency increases, error rate changes)
  - System prompt hashing for drift detection without storing sensitive content
- **Feedback Learning Loop System** (COMPLETE):
  - SMS feedback capture: emoji reactions (👍/👎), iMessage reactions (Liked/Disliked/Loved/etc), ref codes, quoted text
  - Implicit feedback detection: tracks repeated requests (10-minute window, 65% similarity threshold) and auto-creates -1 feedback
  - Reference codes: 4-character alphanumeric (no vowels) auto-appended to outbound SMS
  - Feedback parser: `server/feedback/parseSmsReaction.ts` with 8/10 test cases passing
  - Feedback trainer: nightly job (2:30 AM) clusters feedback into style profiles (tone, verbosity, correctness)
  - Memory heat tracking: tracks access count, heat score (0-1), last access time
  - Weekly memory prune: Sundays 3 AM, marks old low-heat memories (< 0.2 heat, > 30 days) as inactive
  - Test harness: `tests/test-feedback-simple.ts` with comprehensive SMS parsing tests
- **Structured Chat Cards**: Rich interactive cards displayed in chat responses instead of plain text. Supports TaskCard, ReminderCard, WeatherCard, GroceryCard, CalendarCard, ContactCard, and LocationCard. Cards are extracted from AI responses using JSON markers (`<!--CARD:...-->`) or heuristic detection. Implementation in `server/cardExtractor.ts` and `client/src/pages/chat.tsx`.

The Python multi-agent system (`python_agents/`) includes production-grade reliability features such as PII Redaction, a Health Endpoint, Request Tracing, Graceful Shutdown, and configurable environment variables for runtime control.

**Resilience Features**:
- **Circuit Breaker**: Per-service circuit breaker with CLOSED/OPEN/HALF_OPEN states, configurable thresholds (CB_FAIL_THRESHOLD=5, CB_COOLDOWN_SEC=60), prevents cascade failures.
- **Retry with Jittered Backoff**: Decorrelated jitter strategy (1s base, 30s max), automatically retries transient failures with circuit breaker integration.
- **Memory TTL Buckets**: Memories have scope (transient/session/long_term) with auto-calculated expiration (36h/7d/never). Hourly cleanup job removes expired memories.

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
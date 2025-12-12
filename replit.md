# Project: ZEKE – Nate's Personal AI Assistant

## Overview
ZEKE is a single-user personal AI assistant for Nate Johnson, designed for high-quality, long-term memory and accessible interaction via SMS and a simple web UI. It focuses on providing action-oriented, proactive, and personalized assistance through respectful, precise communication. Key capabilities include comprehensive personal context management, intelligent communication, task/calendar integration, location awareness, and sophisticated food preference tracking. The project aims to provide a highly personalized, efficient, and intelligent assistant experience.

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

The core is a multi-agent system in Python, with specialized agents like Conductor, Memory Curator, Comms Pilot, Ops Planner, Research Scout, and Safety Auditor. A TypeScript Context Router system provides domain-specific context bundles to Python agents, supporting a dual-context strategy for efficiency. The UI features a dark theme with a coral red accent and Poppins font, designed as a dashboard-first interface with global sidebar navigation.

Key technical implementations and features include:
- **Context Router System**: An intelligent, multi-layered context assembly system using token-budgeted bundles with parallel bundle assembly for independent context types.
- **Context Bundle Caching**: High-performance in-memory LRU cache with priority-based eviction, model-aware TTL configurations, predictive prefetching, and domain-specific invalidation. Supports cache warming for common routes and access pattern tracking.
- **Conversation Summarization System**: Automatically compresses older conversation history into bullet summaries using GPT-4o-mini.
- **Memory Model**: Optimized for a single user, storing long-term memory with semantic search and confidence scoring.
- **Reminders & Automations**: Scheduled jobs for recurring tasks, AI Task Breakdown, Smart Grocery Suggestions, and Proactive Task Follow-up.
- **Tooling**: Integrates various AI tools for communication (SMS), task management, calendar, weather, web search, file operations, and Omi pendant lifelogs.
- **Omi Pendant Integration**: Connects to the Omi API for accessing and semantically searching recorded conversations.
- **Voice Pipeline**: Processes voice input from Omi Pendant lifelogs through the same agent pipeline as SMS/web, with wake word detection.
- **Omi-GPS Deep Integration**: Correlates lifelog timestamps with GPS location history to enrich memories with location context and detect activity patterns.
- **Location Intelligence Service**: Enhanced agentic location awareness with Overland GPS integration. Features: calendar-GPS correlation for job site arrival detection, real-time movement classification (driving/walking/stationary), GPS health monitoring with freshness tracking, proactive context injection into AI responses. API endpoint: `GET /api/location/intelligence`. Supports automatic detection when user arrives at calendar appointment locations by matching saved places with event addresses.
- **Automatic People Tracking System**: Extracts and tracks relationships, updating contacts and linking memories.
- **Food Preference Intelligence System**: Tracks preferences, restrictions, and recipes, with AI-powered generation and grocery integration.
- **Smart Notification Batching**: Intelligent SMS notification system that queues, batches, and respects quiet hours, with urgent bypass.
- **Natural Language Automation Builder**: Converts natural language phrases into structured automations with intelligent parsing, supporting various trigger and action types.
- **Enhanced NLP Parser**: Multi-stage pipeline with intent classification, entity extraction, temporal resolution, and context disambiguation via knowledge graph integration. Features parallel processing for independent stages and automatic fallback to basic parser.
- **Autonomous Automation Creation**: ZEKE can autonomously create scheduled automations like weather reports via natural language.
- **AI-Powered Weather Briefings**: Personalized, narrative-style weather reports generated using GPT-4o-mini, including actionable advice.
- **Severe Weather Monitoring & Family Alerts**: Automatic background monitoring for dangerous conditions and SMS alerts to family members with safety recommendations.
- **Predictive Task Scheduling**: Analyzes task completion patterns to generate AI-powered scheduling suggestions.
- **Omi Enhanced Features**: Includes Daily Digest for conversation summaries, Action Item Extraction from transcripts, Meeting Intelligence for multi-speaker conversations, Conversation Search over lifelogs, and Analytics & Pattern Detection.
- **Omi Webhook Integration**: Direct webhook endpoints (`/api/omi/memory-trigger`, `/api/omi/transcript`, `/api/omi/query`, `/api/omi/zeke`, `/api/omi/day-summary`) for Omi iOS app integration. Features AI-powered extraction pipeline that processes conversation transcripts to extract people, topics, action items, and insights. Automatically links extracted people to existing contacts or creates new contacts. Includes query endpoint for Omi Chat Tools with optional `executeActions` parameter for full agent pipeline routing. **Command Detection**: When `OMI_COMMANDS_ENABLED=true`, detects wake words ("Hey Zeke", "Zeke,") combined with action patterns to trigger tool execution. Commands are filtered to speaker 0 (device owner) when segment data is available. **Direct Omi API Access**: When `OMI_API_KEY` is configured, ZEKE can proactively query Omi's cloud for memories, conversations, and action items, plus create memories that sync back to Omi. **Omi Chat Tools App**: Manifest served at `/.well-known/omi-tools.json` enables ZEKE as a Chat Tool in the Omi app - users can explicitly invoke ZEKE commands without wake words. Full technical documentation at `docs/OMI_INTEGRATION.md`, user setup at `docs/omi-prompts.md`.
- **Knowledge Graph System**: Unified graph database interconnecting all data domains (memories, tasks, calendar, contacts, locations, lifelogs, documents) for multi-hop reasoning, temporal awareness, and anticipatory intelligence, with a dedicated Explorer UI.
- **Files & Documents System**: Comprehensive file/document management with hierarchical folder structure, document types (note, document, template, reference), full-text search, pinning, archiving, and a rich text editor. Documents integrate with the knowledge graph as a first-class data domain. UI features folder tree navigation with color-coded folders, document list with metadata, and inline document editing.
- **Feedback Learning Loop System**: Enables ZEKE to learn from action outcomes, user corrections, and implicit feedback. Tracks what happens after actions (completion, modification, deletion), captures explicit user corrections ("Actually...", "No, I meant..."), and builds preference weights with confidence scores (0-1 scale). Learned preferences are automatically injected into AI agent prompts to influence future decisions. API endpoints: `GET /api/feedback/stats`, `GET /api/feedback/preferences`. Database tables: `action_outcomes`, `learned_preferences`, `correction_events`.
- **AGENTS.md Support**: Dual implementation - (1) Root-level AGENTS.md file provides standardized instructions for external coding agents (Cursor, Copilot, Codex, etc.) working on ZEKE's codebase, and (2) `read_agents_md` tool allows ZEKE to fetch and parse AGENTS.md files from GitHub repos or URLs when helping with external codebases.
- **Realtime Chunk Idempotency Layer**: In-memory idempotency tracking for incoming realtime chunks via `POST /api/realtime-chunk`. Prevents duplicate processing by tracking idempotency keys (explicit or derived from payload fields). First requests return 200, duplicates return 409.
- **Mobile Swipe Gestures**: Touch gesture support for sidebar navigation - swipe right from left edge to open sidebar, swipe left anywhere to close when open. Uses custom `useSidebarSwipe` hook.
- **Quick Menu (Mobile)**: Bottom drawer with customizable shortcuts (4-5 max). Swipe up/down to open/close. Features iPhone-style edit mode with wiggle animation, drag-to-reorder, add/remove shortcuts. Shortcuts persist to localStorage. Long-press on shortcuts or handle to enter edit mode.
- **Replit Key-Value Store Integration**: Persistent, fast caching layer using Replit's KV Store (@replit/database) that survives restarts. Includes: (1) Typed wrapper with TTL-aware entries and namespacing (`server/kvStore.ts`), (2) Session state persistence for conversations, automations, voice pipeline (`server/kvSessionState.ts`), (3) Preference caching for quick-access learned preferences (`server/kvPreferenceCache.ts`), (4) Rate limiting for SMS, API calls, automations (`server/kvRateLimiter.ts`). Automatic maintenance runs every 5 minutes to clean expired entries.

## External Dependencies
- **OpenAI API**: AI responses, agent logic, and text embeddings.
- **Twilio**: SMS messaging and voice calling (inbound/outbound calls with AI-powered conversation).
- **ElevenLabs**: Custom voice synthesis for phone calls using Flash v2.5 model (ultra-low latency). Falls back to Amazon Polly if unavailable.
- **better-sqlite3**: Node.js SQLite client.
- **Perplexity API**: Enhanced AI-powered web search.
- **Google Calendar API**: Calendar integration.
- **OpenWeatherMap API**: Weather data.
- **DuckDuckGo API**: Fallback web search.
- **Omi API**: Accessing lifelogs from the Omi pendant.

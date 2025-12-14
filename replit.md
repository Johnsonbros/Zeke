# Project: ZEKE – Nate's Personal AI Assistant

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

## Android App (Capacitor)
ZEKE can be built as a native Android app using Capacitor. The Android project wraps the React web UI.

**Build Commands:**
```bash
npm run build              # Build web assets
npx cap sync android       # Sync web assets to Android project
npx cap open android       # Open in Android Studio
```

**Configuration:**
- App ID: `com.thejohnsonbros.zeke`
- App Name: `ZEKE`
- Web Dir: `dist/public`
- Config file: `capacitor.config.ts`

**Android Project Location:** `android/`

**Notes:**
- Always run `npm run build` before `npx cap sync android` to ensure latest web assets are packaged
- The app requires internet connectivity to communicate with the ZEKE backend
- For production builds, configure signing in `android/app/build.gradle`
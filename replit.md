# Project: ZEKE – Nate's Personal AI Assistant

## Overview
ZEKE is a single-user personal AI assistant for Nate Johnson, designed to provide action-oriented, proactive, and personalized assistance. Its core purpose is to offer intelligent communication, comprehensive personal context management, task and calendar integration, location awareness, and sophisticated food preference tracking. The project aims to deliver a highly efficient and personalized AI assistant experience.

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
ZEKE utilizes a multi-agent architecture with a Node.js + TypeScript (Express) backend, a Python FastAPI microservice for agent orchestration, and a React frontend featuring Tailwind CSS and shadcn/ui components. PostgreSQL (Neon-backed) serves as the primary data store.

The system's multi-agent core in Python includes specialized agents such as Conductor, Memory Curator, Comms Pilot, Ops Planner, Research Scout, and Safety Auditor. A TypeScript Context Router delivers domain-specific context to Python agents. The UI adheres to a dark theme with a coral red accent and Poppins font, designed as a dashboard-first interface.

Key architectural decisions and features include:
- **Context Management**: Multi-layered context assembly, unified cache, and conversation summarization.
- **Memory Model**: Optimized for single-user long-term memory with semantic search (PostgreSQL vector embeddings), TTL buckets, and an asynchronous processing queue for Omi memories.
- **AI-Powered Systems**: Location Intelligence, Automatic People Tracking, Food Preference Intelligence, AI-Powered Weather Briefings, Predictive Task Scheduling, and a Knowledge Graph for multi-hop reasoning.
- **Knowledge Graph Batch Processing**: Entity extraction via OpenAI Batch API (GPT-5.2) for cost efficiency, with a daily 2 AM backfill and synchronous fallback.
- **Input/Output**: SMS/MMS integration with optimized image processing (parallel downloads, smart model routing, face recognition), a voice pipeline for Omi Pendant via Android app, and Smart Notification Batching.
- **Omi Pendant Integration (Dec 2024)**: Omi cloud API is DISABLED. Audio flows directly from the Omi pendant hardware through the Android companion app to ZEKE's backend: `Omi Pendant → Bluetooth → Android App → WebSocket (/ws/audio) → Deepgram STT → feedSttTranscript() → Voice Pipeline`. The Android app handles Bluetooth connection and audio capture, while ZEKE processes transcripts for wake word detection and command execution.
- **Proactive Memory Creation**: Auto-detection of memory-worthy images with user SMS confirmation for saving.
- **Context Enhancement**: Semantic search enriches AI context based on identified people or locations in images.
- **Learning & Feedback**: A Feedback Learning Loop system for user corrections, implicit feedback detection, and nightly training to cluster feedback into style profiles.
- **Efficiency & Resilience**: Overnight Batch Factory using OpenAI Batch API, AI Usage Logging System, Circuit Breaker, and Retry with Jittered Backoff.
- **Batch-First Architecture**: Prioritizes OpenAI Batch API for non-realtime AI tasks (50% cost savings), with three processing lanes: realtime, nearline, and batch.
- **AI Usage Analytics Dashboard**: Comprehensive tracking of AI costs, including real-time and batch API usage, accessible via `/ai-usage`.
- **User Interface**: Structured Chat Cards, Mobile UI Enhancements (swipe gestures, Quick Menu), and a Delta Sync System for efficient mobile app synchronization.
- **Security & Authentication**: HMAC Authentication for the mobile app, replay protection, timing-safe comparisons, and unified SMS verification.
- **Unified SMS Verification System**: Centralized 6-digit SMS verification service (`server/services/smsVerification.ts`) shared across:
  - Mobile app device pairing (`/api/auth/request-sms-code`, `/api/auth/verify-sms-code`)
  - Web dashboard login (`/api/web-auth/request-code`, `/api/web-auth/verify-code`)
  - Security: 6-digit codes, 5-min expiry, 3 max attempts, timing-safe comparison
- **Unified Conversation System**: All direct communications with Nate across different channels share a single, coherent conversation thread.
- **Companion App Integration**: Location Ingestion, Push Notification Infrastructure via Expo, and Calendar Proxy Routes for Android app support.
- **Daily Operations**: Journal/Daily Summary System, Anticipation Engine for morning briefings, and a Pattern Detection System.
- **News & Morning Briefing System**: Personalized news service querying Perplexity, with urgent breaking news alerts and daily 6 AM briefings via SMS, including feedback learning.
- **Web Dashboard Authentication**: Secure SMS-based authentication for the production web dashboard, accessible only by `MASTER_ADMIN_PHONE`. Uses 30-day sessions with HttpOnly cookies.
- **Agent Applications System**: Public application form (`/apply`) and admin dashboard for managing ZEKE agent applications with status management (pending, approved, rejected, waitlisted).
- **Real-Time STT Pipeline**: WebSocket-based real-time speech-to-text transcription for audio from the mobile companion app, using Deepgram Live API with speaker diarization.
- **Voice Activity Detection (VAD)**: WebRTC-based VAD (`node-vad`) filters silence before sending audio to Deepgram, reducing transcription costs by ~50%. Pre-speech buffering (300ms) ensures no speech is cut off.
- **Hardware Device Registry**: Multi-device support for Omi and Limitless pendants with tracking of device status, battery level, firmware version, and last seen timestamps. API: `/api/devices`.
- **Limitless Integration**: REST API client for Limitless pendant cloud (`api.limitless.ai/v1`) with lifelog fetching, audio download, and scheduled sync job (`server/services/limitless.ts`, `server/services/limitlessSync.ts`).
- **Voice Enrollment System**: Voice profile management with speaker identification support. Stores voice samples and embedding vectors for future speaker recognition. API: `/api/voice/profiles`.
- **Push Notification Service (Dec 2024)**: Expo-based push notification delivery for Android companion app with automatic token management and unregistered token cleanup. Supports news alerts, insights, briefings, and reminders. Service: `server/services/pushNotificationService.ts`.
- **Wearable Health Metrics**: Database storage for Omi/Limitless pendant health data (battery level, session time, connection strength, recording quality). API: `/api/wearable/metrics`.
- **Android Notification Capture**: Captures and stores phone notifications from Android app for context awareness and proactive assistance. API: `/api/notifications/capture`.
- **Health Data Sync (Google Fit/Health Connect)**: Receives and stores health metrics (steps, heart rate, sleep, calories) from Android Health Connect. API: `/api/health/metrics`, `/api/health/summary/today`.
- **ZEKE Contact Sync WebSocket (Dec 2024)**: Real-time contact synchronization between server and mobile companion app via WebSocket at `/ws/zeke`. Features:
  - Device token authentication (same pattern as `/ws/audio`)
  - Broadcasts `{ type, action, contactId, timestamp }` messages when contacts are created/updated/deleted
  - Ping/pong keep-alive and sync request handling
  - Status endpoint at `/api/zeke/ws/status` showing connected clients
  - GET `/api/contacts` returns `{ contacts: [...] }` wrapper for mobile compatibility
- **Mobile App Layout System (Dec 2024)**: Standardized layout handling using `PageLayout` component and `usePageLayoutDimensions` hook (`android/client/components/PageLayout.tsx`). Provides consistent header height, tab bar height, and keyboard-aware bottom padding across all screens. Key screens updated: HomeScreen, SettingsScreen, TasksScreen, CalendarScreen, ChatScreen, ContactsScreen, GroceryScreen.
- **Stock Trading Module (Dec 2024)**: Self-contained `zeke_trader/` module for Alpaca paper/live trading with deterministic risk controls. Features:
  - Paper trading (default) with $100k simulated account; live trading requires explicit unlock
  - Risk limits: $25 max per trade, 3 max positions, 5 trades/day, -$25 daily loss limit
  - Watchlist: NVDA, SPY, META, GOOGL, AVGO, GOOG, AMZN
  - Multi-agent Turtle Trading System: Conductor orchestrator, DecisionAgent (GPT-4o), RiskGateAgent, ExecutionAgent
  - Deterministic Turtle strategy: S1 (20-day breakout), S2 (55-day breakout), 2N hard stops, 10/20-day exit channels
  - Scoring formula: `3.0*breakout_strength + 1.0*system_bonus + 1.0*momentum_per_N - 1.0*correlation_penalty`
  - Discovery pipeline: Universe scanning, hard filters, qualification gate, opportunity planner (runs daily/weekly)
  - Overnight Batch Analyzer: Generates daily_report.json, trade_critiques.jsonl, recommended_thresholds.json
  - Trading Dashboard at `/trading` with account overview, real-time quotes, position management, and trade execution
  - Mobile Trading Screen with agent status, decision logs, scored signals visualization, Turtle strategy info
  - **ZEKETrade Public Pages (Dec 2024)**: Two-page public showcase for the trading system:
    - `/zeketrade` - Marketing landing page with hero section, "How it works" agent workflow, Turtle Strategy explanation, live risk limits from API, and CTA
    - `/zeketrade/dashboard` - Full transparency dashboard with 5 tabs:
      - Live: Agent status, risk limits usage, watchlist with live prices, account summary
      - Positions: Current holdings with entry prices, P&L, and exit monitoring
      - History: Complete trade log with order details and fill prices
      - Signals: Pending trades with AI reasoning and scoring
      - Analytics: Equity curve, drawdown charts, and key metrics
    - All data fetched from existing `/api/trading/*` endpoints
    - Security: Read-only pages with no mutation controls or exposed secrets
  - API: `/api/trading/*` (account, positions, quotes, orders), `/agent/*` (status, decisions, pending-trades), `/batch/*` (analyze, reports)
  - Requires: `PAPER_API_KEY`, `PAPER_API_SECRET` (Alpaca paper trading credentials)

## External Dependencies
- **OpenAI API**: AI responses, agent logic, and text embeddings.
- **Twilio**: SMS messaging and voice calling.
- **ElevenLabs**: Custom voice synthesis.
- **Deepgram API**: Real-time speech-to-text transcription with speaker diarization.
- **@neondatabase/serverless**: PostgreSQL client (Neon).
- **Perplexity API**: Enhanced AI-powered web search.
- **Google Calendar API**: Calendar integration.
- **OpenWeatherMap API**: Weather data.
- **DuckDuckGo API**: Fallback web search.
- **Omi Hardware**: Omi pendant connects via Android app (cloud API disabled - direct audio streaming via WebSocket).
- **Limitless Hardware**: Limitless pendant lifelogs sync via REST API at api.limitless.ai (requires LIMITLESS_API_KEY).
- **OpenStreetMap / Leaflet**: Default open-source map provider.
- **Google Maps API**: Optional paid map provider.
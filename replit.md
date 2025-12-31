# Project: ZEKE – Nate's Personal AI Assistant

## Overview
ZEKE is a single-user personal AI assistant for Nate Johnson, designed for action-oriented, proactive, and personalized assistance. Its core purpose is to offer intelligent communication, comprehensive personal context management, task and calendar integration, location awareness, and sophisticated food preference tracking, aiming for a highly efficient and personalized AI assistant experience. The project also includes a robust stock trading module with advanced risk management and a public-facing dashboard.

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
ZEKE employs a multi-agent architecture with a Node.js + TypeScript (Express) backend, a Python FastAPI microservice for agent orchestration, and a React frontend utilizing Tailwind CSS and shadcn/ui components. PostgreSQL (Neon-backed) serves as the primary data store. The UI features a dark theme with a coral red accent and Poppins font, designed as a dashboard-first interface.

Key architectural decisions and features include:

- **Multi-Agent Core**: Python-based agents like Conductor, Memory Curator, Comms Pilot, Ops Planner, Research Scout, and Safety Auditor, supported by a TypeScript Context Router.
- **Context Management**: Multi-layered context assembly with a unified cache and conversation summarization, including global, calendar, location, and memory bundles.
- **Memory Model**: Optimized for single-user long-term memory with semantic search (PostgreSQL vector embeddings), TTL buckets, and an asynchronous processing queue.
- **AI-Powered Systems**: Location Intelligence, Automatic People Tracking, Food Preference Intelligence, AI-Powered Weather Briefings, Predictive Task Scheduling, and a Knowledge Graph for multi-hop reasoning. Entity extraction for the Knowledge Graph uses OpenAI Batch API.
- **Input/Output**: SMS/MMS integration with optimized image processing, a voice pipeline for Omi Pendant via Android app (direct audio streaming), and Smart Notification Batching.
- **Real-Time STT Pipeline**: WebSocket-based real-time speech-to-text transcription using Deepgram Live API with speaker diarization and WebRTC-based Voice Activity Detection (VAD) for cost efficiency.
- **Proactive Features**: Proactive Memory Creation, Context Enhancement through semantic search, and a Feedback Learning Loop system.
- **Efficiency & Resilience**: Overnight Batch Factory using OpenAI Batch API, AI Usage Logging System, Circuit Breaker, and Retry with Jittered Backoff. A batch-first architecture prioritizes non-realtime AI tasks for cost savings.
- **AI Cost Dashboard**: Enhanced cost monitoring widget with 14-day trend charts, budget tracking (daily/weekly/monthly limits), agent/job cost breakdown, and visual alerts for budget overruns. API endpoints: `/api/ai-logs/trends`, `/api/ai-logs/by-agent`, `/api/ai-logs/budget`.
- **User Interface**: Structured Chat Cards, Mobile UI Enhancements, and a Delta Sync System for mobile app synchronization. A standardized mobile app layout system ensures consistent UI.
- **Security & Authentication**: HMAC Authentication for the mobile app, unified SMS verification system for both mobile app and web dashboard login, and session-based authentication for the web dashboard.
- **Unified Conversation System**: All communications across channels converge into a single conversation thread.
- **Companion App Integration**: Location ingestion, push notification infrastructure via Expo, and calendar proxy routes. Includes real-time contact synchronization via WebSocket.
- **Daily Operations**: Journal/Daily Summary System, Anticipation Engine for morning briefings, and a Pattern Detection System. Personalized news and morning briefing system.
- **Hardware Device Registry**: Supports multi-device integration for Omi and Limitless pendants, tracking status and metrics.
- **Voice Enrollment System**: Manages voice profiles for speaker identification.
- **Push Notification Service**: Expo-based push notification delivery for Android.
- **Wearable Health Metrics & Android Data Capture**: Database storage for wearable health data and captured phone notifications from the Android app, along with Health Connect integration for health metrics.
- **Stock Trading Module (`zeke_trader/`)**:
    - Self-contained module for Alpaca paper/live trading with deterministic risk controls.
    - Features a multi-agent Turtle Trading System with Conductor, DecisionAgent (GPT-4o), RiskGateAgent, and ExecutionAgent.
    - Includes advanced profitability enhancements:
        - **Kelly Criterion Position Sizing**: Half-Kelly (0.5 fraction), 40-trade rolling lookback, volatility-adjusted
        - **Drawdown Circuit Breaker**: Daily (-5%) and weekly (-10%) loss limits with automatic position reduction
        - **Signal Confirmation Filters**: Volume filter (1.5x 20-day avg), multi-timeframe trend filter (50/200 MA)
        - **ATR Trailing Stops**: Dynamic 2.5x ATR trailing stops that update when price moves favorably
        - **Market Regime Detection**: ADX-based detection (trend/neutral/choppy) to adjust strategy behavior
    - Integrates Perplexity Research for deep trading signal analysis.
    - Provides a comprehensive Performance Analytics Engine (Sharpe, Sortino, max drawdown, profit factor, R-multiples).
    - Offers a Trading Dashboard with advanced analytics, risk controls, and regime detection visualization.
    - Mobile Trading Screen for portfolio management.
    - Public-facing `ZEKETrade` pages (`/zeketrade`, `/zeketrade/dashboard`) provide transparency on the system's performance and operations.
    - API endpoints: `/agent/status`, `/agent/analytics`, `/agent/risk-summary`, `/agent/regime`

## External Dependencies
- **OpenAI API**: AI responses, agent logic, text embeddings, batch processing.
- **Twilio**: SMS messaging and voice calling.
- **ElevenLabs**: Custom voice synthesis.
- **Deepgram API**: Real-time speech-to-text transcription.
- **@neondatabase/serverless**: PostgreSQL client (Neon).
- **Perplexity API**: Enhanced AI-powered web search.
- **Google Calendar API**: Calendar integration.
- **OpenWeatherMap API**: Weather data.
- **DuckDuckGo API**: Fallback web search.
- **Omi Hardware**: Omi pendant (integrated via Android app for direct audio streaming).
- **Limitless Hardware**: Limitless pendant (synced via REST API).
- **Alpaca API**: Stock trading (paper and live).
- **Expo**: Push notification infrastructure for Android.
- **Google Fit/Health Connect**: Health data synchronization.
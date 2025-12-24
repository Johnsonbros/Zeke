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
- **OpenStreetMap / Leaflet**: Default open-source map provider.
- **Google Maps API**: Optional paid map provider.
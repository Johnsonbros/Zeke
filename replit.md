# Project: ZEKE – Nate's Personal AI Assistant

## Overview
ZEKE is a single-user personal AI assistant for Nate Johnson, providing action-oriented, proactive, and personalized assistance through respectful and precise communication. Its core capabilities include comprehensive personal context management, intelligent communication, task/calendar integration, location awareness, and sophisticated food preference tracking, aiming for a highly personalized and efficient assistant experience.

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

The system features a multi-agent core in Python, including specialized agents like Conductor, Memory Curator, Comms Pilot, Ops Planner, Research Scout, and Safety Auditor. A TypeScript Context Router provides domain-specific context bundles to Python agents. The UI uses a dark theme with a coral red accent and Poppins font, designed as a dashboard-first interface.

Key architectural and feature implementations include:
- **Context Management**: Multi-layered context assembly, unified cache layer, and conversation summarization.
- **Memory Model**: Optimized for single-user long-term memory with semantic search (SQLite + FTS5 + vector embeddings), featuring TTL buckets and an asynchronous processing queue for Omi memories.
- **Task & Automation**: Reminders, AI Task Breakdown, Smart Grocery Suggestions, Proactive Task Follow-up, and Natural Language Automation Builder.
- **AI-Powered Systems**: Location Intelligence, Automatic People Tracking, Food Preference Intelligence, AI-Powered Weather Briefings, Predictive Task Scheduling, and a Knowledge Graph for multi-hop reasoning.
- **Input/Output**: SMS/MMS integration with optimized image processing (parallel downloads, smart model routing by category, face recognition with contact matching), voice pipeline for Omi Pendant lifelogs, and Smart Notification Batching.
- **Face Recognition System**: Text-based face matching using GPT-4o-mini. Enrolled faces stored in `contactFaces` table with descriptions and distinguishing features. When people photos are received, AI context shows "IDENTIFIED PEOPLE: [name] (confidence%)" instead of generic descriptions.
- **Proactive Memory Creation**: Auto-detects memory-worthy images (selfies, people photos, locations, business cards) and suggests memories. Sends SMS confirmation (Y/N) for user approval. Uses `pendingMemorySave.ts` for 10-minute pending memory queue.
- **Context Enhancement**: Semantic search enriches AI context with related memories when people or locations are detected in images. Uses `contextEnhancer.ts` to fetch relevant memories about identified contacts and settings.
- **Learning & Feedback**: Feedback Learning Loop system for user corrections, implicit feedback detection, and a nightly trainer to cluster feedback into style profiles.
- **Efficiency & Resilience**: Overnight Batch Factory using OpenAI Batch API, AI Usage Logging System for API call tracking and anomaly alerting, Circuit Breaker, and Retry with Jittered Backoff.
- **Batch-First Architecture**: All non-realtime AI work uses OpenAI Batch API for 50% cost savings. Three-lane processing: realtime (<2s for chat), nearline (minutes for context), batch (hours for narratives/insights). Orchestrator manages nightly (3am) and midday (12pm) batch windows.
- **Self-Model V2**: Correlation discovery with verified evidence linking, measurable metrics (Coverage, Stability, Calibration), and AI-generated narrative explanations via batch processing.
- **User Interface**: Structured Chat Cards for rich interactive responses, Mobile UI Enhancements (swipe gestures, Quick Menu), and Delta Sync System for efficient mobile app synchronization.
- **Security & Authentication**: HMAC Authentication for the mobile app with replay protection and timing-safe comparisons. Device Pairing API for simpler mobile auth flow.
- **Unified Conversation System**: All direct communications with Nate (SMS, web, mobile, voice) share a single coherent conversation thread.
- **Companion App Integration**: Location Ingestion for real-time tracking, Push Notification Infrastructure via Expo, and Calendar Proxy Routes for Android app support.
- **Health Monitoring**: Sleep Tracking, Pendant Health Monitor for Omi device status, and Mobile Auth Health Endpoint for debugging.
- **Daily Operations**: Journal/Daily Summary System, Anticipation Engine for morning briefings, and a Pattern Detection System.

## External Dependencies
- **OpenAI API**: AI responses, agent logic, and text embeddings.
- **Twilio**: SMS messaging and voice calling.
- **ElevenLabs**: Custom voice synthesis.
- **Deepgram API**: Real-time speech-to-text transcription with speaker diarization (requires `DEEPGRAM_API_KEY`).
- **better-sqlite3**: Node.js SQLite client.
- **Perplexity API**: Enhanced AI-powered web search.
- **Google Calendar API**: Calendar integration.
- **OpenWeatherMap API**: Weather data.
- **DuckDuckGo API**: Fallback web search.
- **Omi API**: Accessing lifelogs from the Omi pendant.
- **OpenStreetMap / Leaflet**: Default open-source map provider (free, no API key required).
- **Google Maps API**: Optional paid map provider (requires `VITE_GOOGLE_MAPS_API_KEY`).

## Frontend Map Abstraction

The app includes a flexible map component system at `client/src/components/map/` that supports multiple map providers:

- **Default Provider**: OpenStreetMap via Leaflet (free, open-source)
- **Optional Provider**: Google Maps (requires API key and billing)

### Configuration
- `VITE_MAP_PROVIDER`: Set to `leaflet` (default) or `google`
- `VITE_GOOGLE_MAPS_API_KEY`: Required only when using Google Maps provider

### Components
- `<Map />`: Universal map component that auto-selects provider
- `<MapProvider>`: Context provider for configuration
- `<LocationMap />`: Pre-built component for displaying location data with markers, circles, and trails
- `<LeafletMap />`: Direct Leaflet implementation
- `<GoogleMap />`: Direct Google Maps implementation

### Usage
```tsx
import { Map, MapProvider, LocationMap } from '@/components/map';

// Simple usage with defaults (OpenStreetMap)
<Map center={{ lat: 42.1, lng: -70.9 }} zoom={13} markers={[...]} />

// With location data
<LocationMap 
  locations={savedPlaces} 
  currentLocation={currentPos}
  showTrail={true}
/>

// Override provider
<MapProvider provider="google" googleApiKey="...">
  <Map ... />
</MapProvider>
```

## Mobile Device Pairing API

Authentication methods for the companion mobile app.

### SMS Pairing (Recommended)

Secure pairing via 4-digit SMS code sent to the master phone number.

**Endpoints:**
- **POST /api/auth/request-sms-code**: Request a pairing code via SMS
  - Request: `{ "deviceName": "iPhone 15 Pro" }`
  - Success: `{ "success": true, "sessionId": "abc123...", "expiresIn": 300, "message": "Verification code sent to your phone" }`
  - Error: `{ "success": false, "error": "SMS pairing not configured. MASTER_ADMIN_PHONE is not set." }`

- **POST /api/auth/verify-sms-code**: Verify code and get device token
  - Request: `{ "sessionId": "abc123...", "code": "1234" }`
  - Success: `{ "success": true, "deviceToken": "64-char-hex", "deviceId": "device_xxx", "message": "Device paired successfully" }`
  - Error: `{ "success": false, "error": "Invalid code. 2 attempts remaining.", "attemptsRemaining": 2 }`

- **GET /api/auth/pairing-status**: Check pairing configuration status
  - Response: `{ "configured": true, "pendingCodes": 0 }`

**Environment Variables:**
- Uses `MASTER_ADMIN_PHONE` constant from schema (hardcoded master phone)
- `ZEKE_MASTER_PHONE`: Optional override for pairing codes (if different from MASTER_ADMIN_PHONE)

### Secret-Based Pairing (Legacy)

- **POST /api/auth/pair**: Register a new device with the shared secret
  - Request: `{ "secret": "ZEKE_SHARED_SECRET", "deviceName": "Nate's iPhone" }`
  - Success Response: `{ "deviceToken": "64-char-hex", "deviceId": "device_xxx", "message": "Device paired successfully" }`
  - Error: `{ "error": "Invalid pairing secret" }`

- **GET /api/auth/verify**: Validate an existing device token
  - Header: `X-ZEKE-Device-Token: <token>`
  - Success: `{ "valid": true, "deviceId": "device_xxx" }`
  - Error: `{ "valid": false, "error": "Invalid or expired device token" }`

### Security Features
- SMS codes expire after 5 minutes
- Maximum 3 attempts per code before invalidation
- Timing-safe secret comparison using `crypto.timingSafeEqual`
- Secure 64-character hex tokens via `crypto.randomBytes(32)`
- IP-based rate limiting: 5 failed attempts = 15-minute lockout
- Automatic cleanup of expired pairing codes and attempts

### Authentication Flow
Mobile apps can authenticate using either:
1. **HMAC Signature**: `X-ZEKE-Signature` header (original method)
2. **Device Token**: `X-ZEKE-Device-Token` header (simpler method after pairing)

## GitHub Repository Sync

This project has a two-way sync with GitHub:

### Main Repository
- **Remote**: `https://github.com/Johnsonbros/Zeke`
- **Branch**: main
- Changes committed in Replit sync to the GitHub repo and vice versa

### Mobile App (android/ folder)
- **Source Repository**: ZEKEapp GitHub repo
- **Sync Destination**: `android/` folder in this project
- Commits made to the ZEKEapp repo automatically sync to the `android/` folder
- The Android/React Native mobile app shares the same PostgreSQL database as the main web app

## Real-Time STT Pipeline

Real-time speech-to-text transcription pipeline for processing audio from the mobile companion app.

### Architecture
- **WebSocket Endpoint**: `/ws/audio`
- **Audio Input**: Opus-encoded audio from Limitless/Omi BLE devices
- **Frame Format**: `raw_opus_packets` (individual Opus packets, not OGG container)
- **Transcription**: Deepgram Live API with speaker diarization
- **Storage**: SQLite database (`stt_sessions`, `stt_segments` tables)

### Environment Variables
- `DEEPGRAM_API_KEY`: Required for Deepgram Live transcription

### Protocol

**Authentication**: Connect with `X-ZEKE-Device-Token` header (same as mobile API)

**Session Start**:
```json
{ "type": "start_session", "codec": "opus", "sample_rate_hint": 16000, "frame_format": "raw_opus_packets" }
```

**Response**:
```json
{ "type": "session_started", "session_id": "uuid", "deepgram_connected": true, "frame_format": "raw_opus_packets" }
```

**Audio Streaming**: Send binary Opus packets directly

**Transcript Events** (emitted by server):
```json
{ "type": "transcript_segment", "sessionId": "uuid", "speaker": 0, "text": "Hello world", "startMs": 0, "endMs": 1500, "confidence": 0.95, "isFinal": true }
```

**Session End**:
```json
{ "type": "end_session" }
```

### Key Files
- `server/stt/opus_decoder.ts`: Opus to PCM16LE decoder with bounded buffering
- `server/stt/deepgram_live.ts`: Deepgram WebSocket bridge with diarization
- `server/stt/index.ts`: Module exports
- `server/routes.ts`: WebSocket endpoint registration
- `script/test-stt-pipeline.ts`: Test harness

### Status Endpoint
- **GET /api/stt/status**: Check STT configuration
  - Response: `{ "configured": true, "activeSessions": 0, "wsEndpoint": "/ws/audio", "frameFormat": "raw_opus_packets" }`
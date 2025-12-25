# ZEKE AI Companion Dashboard

## Overview
ZEKE AI is a mobile companion app for the ZEKE web application, built with Expo/React Native. It provides quick access to daily essentials (calendar, tasks, grocery lists, custom lists, contacts), captures conversation memory from AI wearables, facilitates communication via SMS/Voice (Twilio), and includes an AI chat assistant. The app leverages native mobile features for real-time data capture and communication, while the ZEKE web server handles data persistence, AI processing, and complex integrations. The project aims to enhance user interaction with the ZEKE AI ecosystem through a dedicated mobile interface.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend utilizes Expo SDK 54, React Native 0.81, and React 19 with React Compiler. Navigation is managed by React Navigation v7 with a root stack and bottom tab navigator. State management combines TanStack React Query for server state, `useState` for local component state, and AsyncStorage for persistent local data. The UI features a dark-mode theme with gradient accents using `expo-linear-gradient` and `Reanimated` for animations, including a `VoiceInputButton`.

### Backend Architecture
The backend is an Express.js server with a minimal `/api` route structure and dynamic CORS. It employs an interface-based storage abstraction (`IStorage`), with Drizzle ORM configured for PostgreSQL and an in-memory fallback. Path aliases are configured for client and shared code. A server-side proxy routes all ZEKE backend API calls, bypassing CORS and forwarding authentication headers. Communication is secured with HMAC-signed request authentication and comprehensive logging. Device authentication for `/api/*` routes requires a device token, obtained via a pairing flow, with rate limiting and timing-safe comparisons.

### Data Storage Solutions
Client-side data (devices, memories, chat messages, settings) is stored using AsyncStorage. Server-side data uses Drizzle ORM with PostgreSQL (and an in-memory fallback), sharing a Zod-validated schema.

### Feature Specifications
- **Core Features**: Home Screen (Command Center), Geo Tab (Location & Geofencing), Communications Hub (SMS, Voice, AI chat, Contacts), Calendar (CRUD, voice input), Tasks, Grocery, and Custom Lists (CRUD, voice input), Memories, and Settings.
- **File Upload System**: Universal file upload supporting audio, images, documents (PDFs), and videos. Files are stored locally as base64 then forwarded directly to the ZEKE backend (zekeai.replit.app) for AI processing and memory creation. Features include tagging, retry on failure, and a file library view with status tracking. Backend routes at `/api/uploads/*` with `/api/uploads/:id/send-to-zeke` for ZEKE forwarding.
- **Profile Picture System**: Selfie capture for Nate's aging documentation project. Tapping the profile avatar auto-opens the front-facing camera. Photos are stored locally and sent to ZEKE with tags ["profile-picture", "aging-documentation", "selfie", "master-user-enrollment", "facial-recognition-primary"] plus metadata `{isPrimary: true, userType: "master-user", enrollFace: true}` for facial recognition enrollment. Includes 7-14 day reminder system (random interval) with visual badge indicator when it's time to take a new photo.
- **Device Features (Native Capabilities)**: Access to contacts, sensors dashboard, battery monitor, device info, network status, biometric authentication, document picker, share, and text-to-speech.
- **Real-Time Data**: Real-time transcription via Deepgram WebSocket proxy for BLE audio, and real-time WebSocket sync for updates and React Query cache invalidation.
- **Wearable Integration**: Supports Omi and Limitless AI devices, including API clients, audio processing (Opus decoder, VAD), voice enrollment, speaker identification, and offline sync queuing.
- **Dashboard Features**: Omi Pendant Health Monitoring, News Briefing System (personalized stories, feedback), and ZEKE Notification System (banners, dismissal).
- **Push Notifications**: Registration of device push tokens with the ZEKE backend using Expo Notifications.

### Monorepo Configuration
The project (ZEKEapp) is part of a unified monorepo `https://github.com/Johnsonbros/ZekeAssistant`, which includes the ZEKE backend and mobile projects, using Git subtrees for synchronization.

### Performance Optimizations
- **Grocery Sync Caching**: Server-side stale-while-revalidate cache for `/api/grocery` endpoint (60-second cache, 30-second client timeout, cache invalidation on mutations, prefetching).

## External Dependencies

### Device Integrations
- **Omi**: AI wearable.
- **Limitless**: Wearable pendant.

### Communication Services
- **Twilio**: For SMS and Voice calling, integrated via Replit connector through a server-side service layer.
- **Google Calendar**: For real-time calendar sync and CRUD operations, integrated via Replit connector through a server-side service layer.

### Third-Party Services
- **Expo Services**: Splash screen, haptics, image handling, web browser, blur effects, audio recording.
- **React Navigation**: Core navigation library.
- **Deepgram**: Real-time audio transcription.

### Database
- **PostgreSQL**: Target database, configured with Drizzle ORM.

### Build & Development
- **Replit Environment**: For deployment.
- **Metro Bundler**: For path aliases.
- **esbuild**: For server-side bundling.
- **EAS Build**: For development builds with native modules.

## Wearable Audio Streaming

### WebSocket Audio Protocol (December 2024)
The audio WebSocket at `/ws/audio` supports both legacy and spec-compliant message formats:

**Spec-Compliant Messages:**
- `config`: Initial configuration (codec, sample_rate, frame_format, device_type, device_id)
- `audio`: Audio data (base64-encoded)
- `silence`: Silence marker for VAD-based streaming
- `heartbeat`: 30-second keepalive with optional battery_level/signal_strength
- `stop`: End streaming session

**Binary Transport:**
- Raw Opus frames can be sent directly (non-JSON binary data)
- Server auto-detects binary vs JSON format
- Binary frames are decoded using opus-decoder service

**Legacy Messages (Backward Compatible):**
- `START`: Begin session with deviceId
- `AUDIO_CHUNK`: Audio data chunk
- `STOP`: End session

### Client Libraries
- `client/lib/audio-streaming.ts`: Low-level WebSocket client with sendBinaryOpus() and sendAudioRaw()
- `client/lib/audioStreamer.ts`: High-level AudioStreamer that integrates BLE audio with WebSocket transcription
- `client/lib/vad-client.ts`: Energy-based voice activity detection for mobile
- `client/lib/bluetooth.ts`: BLE device management with battery monitoring

### Audio Streaming Flow (December 2024)
1. AudioStreamerImpl connects to `/ws/audio` WebSocket
2. Sends `config` message with device type (omi/limitless), codec (opus), sample rate, frame_format: "raw_opus_packets"
3. Audio frames received before `config_ack` are buffered in `pendingChunks` array
4. Server responds with `config_ack` immediately
5. Client flushes all buffered audio chunks, sets `isConfigured = true`, starts heartbeat
6. BLE audio chunks are sent as raw binary Opus frames via `sendBinaryOpus()`
7. Heartbeat with battery/signal info sent every 30 seconds (only after config_ack)

### Battery Monitoring (December 2024)
- Uses standard BLE Battery Service (0x180F) and Battery Level Characteristic (0x2A19)
- Reads initial battery level on device connection via `readBatteryLevel()`
- Monitors for real-time updates via BLE notifications
- Battery level stored in `connectedDevice.batteryLevel`
- Battery info included in WebSocket heartbeat messages

### Known Limitations
- VAD uses energy-based detection (Silero VAD recommended for production)
- BLE functionality runs in mock mode on Expo Go - requires EAS native Android build for real device connections

### Opus Decoder (December 2024)
- Real WebAssembly-based Opus decoder using `opus-decoder` npm package
- Lazy WASM initialization on first decode (no startup delay)
- Float32 → Int16 PCM conversion for transcription service compatibility
- Decode result validation (channelData exists with samples)
- **Data Integrity**: Only WASM-decoded PCM reaches transcription
  - Fallback/simulated frames are skipped (marked with `isFallback: true`)
  - Exception frames are dropped (not stored as raw Opus)
- **Client Notifications**: WARNING sent on first decode failure
- **Session Termination**: After 10 consecutive failures, ERROR sent and session closed
- **Metrics Separation**: `totalFramesDecoded` vs `fallbackFramesDecoded`
- Health metrics endpoint: `GET /api/wearable/audio/decoder-health`
  - Returns HTTP 503 when decoder is degraded (fallback ratio > 50%)
  - Returns `warning_elevated_fallback` status when ratio > 10%
  - Exposes `fallbackRatio` for monitoring dashboards
# ZEKE AI Companion Dashboard

## Overview
The ZEKE AI Companion Dashboard is a mobile application built with Expo/React Native, designed to complement the ZEKE web application. It offers quick access to daily essentials like calendar, tasks, and grocery lists, integrates conversation memory from AI wearables, and provides communication features via SMS/Voice (Twilio) and an AI chat assistant. The app leverages native mobile capabilities for real-time data capture and communication, while the ZEKE web server handles data persistence, AI processing, and complex integrations, aiming to enrich user interaction within the ZEKE AI ecosystem.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend uses Expo SDK 54, React Native 0.81, and React 19 with React Compiler. Navigation is managed by React Navigation v7. State management combines TanStack React Query for server state, `useState` for local component state, and AsyncStorage for persistent local data. The UI features a dark-mode theme with gradient accents and Reanimated for animations.

### Backend Architecture
The backend is an Express.js server with a minimal `/api` route structure, dynamic CORS, and an interface-based storage abstraction (`IStorage`). Drizzle ORM is configured for PostgreSQL with an in-memory fallback. A server-side proxy handles all ZEKE backend API calls, bypassing CORS and forwarding authentication. Communication is secured with HMAC-signed request authentication. Device authentication for `/api/*` routes requires a device token obtained via a pairing flow.

### Data Storage Solutions
Client-side data (devices, memories, chat messages, settings) is stored using AsyncStorage. Server-side data uses Drizzle ORM with PostgreSQL, sharing a Zod-validated schema.

### Core Features
The application includes a Home Screen (Command Center), Geo Tab (Location & Geofencing), Communications Hub (SMS, Voice, AI chat, Contacts), Calendar, Tasks, Grocery, and Custom Lists (all with CRUD and voice input), Memories, and Settings. It also supports universal file uploads (audio, images, documents, videos) to the ZEKE backend for AI processing, a profile picture system for aging documentation with reminders, and various native device features such as contacts access, sensor dashboard, battery monitor, and biometric authentication. Real-time data is handled via WebSockets for transcription (Deepgram) and synchronization. Wearable integration supports Omi and Limitless AI devices, including audio processing, voice enrollment, and offline sync. Dashboard features include Omi Pendant Health Monitoring, News Briefing, and a ZEKE Notification System. Push notifications are managed via Expo Notifications.

### Monorepo Configuration
The project is part of a unified monorepo (`https://github.com/Johnsonbros/ZekeAssistant`) that includes the ZEKE backend and mobile projects, using Git subtrees for synchronization.

### Performance Optimizations
Includes server-side stale-while-revalidate caching for grocery data and server-side contact caching with a 5-minute TTL, with invalidation on mutations.

### Contact Synchronization System
Provides bidirectional contact sync between the mobile app and ZEKE backend with E.164 phone number normalization. Features include a React hook for managing sync state, a settings UI with manual sync and auto-sync toggles (24-hour interval), and backend endpoints for CRUD operations and phone number resolution.

### Wearable Audio Streaming
Supports WebSocket audio streaming with spec-compliant and legacy message formats for configuration, audio data, silence markers, heartbeats, and stop commands. It handles binary Opus frame transport and includes client-side libraries for low-level WebSocket interaction, a high-level AudioStreamer, energy-based voice activity detection, and BLE device management. The system incorporates a WebAssembly-based Opus decoder with lazy initialization, float32 to int16 PCM conversion, and robust error handling. Battery monitoring via BLE Battery Service is integrated into WebSocket heartbeats.

### Location Data Handling System
Features a network-aware location sync service with an offline queue, a server-side geocoding cache, and a places service for managing saved places and nearby searches using Google Places API. It also includes ZEKE Conversational Actions for natural language commands related to location (e.g., searching for places, creating place lists, setting proximity alerts, creating geofences, saving places). A geofence monitor checks proximity to both geofences and place lists with proximity alerts, triggering custom notifications.

## External Dependencies

### Device Integrations
- **Omi**: AI wearable.
- **Limitless**: Wearable pendant.

### Communication Services
- **Twilio**: For SMS and Voice calling, integrated via a Replit connector through a server-side service layer. Includes TwiML App integration for VoIP calls, status callbacks, and call log synchronization to the ZEKE backend.
- **Google Calendar**: For real-time calendar sync and CRUD operations, integrated via a Replit connector.

### Third-Party Services
- **Expo Services**: For splash screen, haptics, image handling, web browser, blur effects, audio recording.
- **React Navigation**: For core navigation.
- **Deepgram**: For real-time audio transcription.

### Database
- **PostgreSQL**: Target database, configured with Drizzle ORM.

### Build & Development
- **Replit Environment**: For deployment.
- **Metro Bundler**: For path aliases.
- **esbuild**: For server-side bundling.
- **EAS Build**: For development builds with native modules.
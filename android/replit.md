# ZEKE AI Companion Dashboard

## Overview
ZEKE AI is a mobile companion app built with Expo/React Native, extending the main ZEKE web application. It provides quick access to daily essentials (calendar, tasks, grocery lists, custom lists, contacts), captures conversation memory from AI wearables, facilitates communication via SMS/Voice (Twilio), and includes an AI chat assistant. The app leverages native mobile features for real-time data capture and communication, while the ZEKE web server handles data persistence, AI processing, and complex integrations. The project aims to offer a comprehensive mobile interface for the ZEKE AI ecosystem, enhancing user interaction with AI functionalities on a dedicated mobile device.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend uses Expo SDK 54, React Native 0.81, and React 19 with the React Compiler. Navigation is managed by React Navigation v7, featuring a root stack and bottom tab navigator. State management combines TanStack React Query for server state, `useState` for local component state, and AsyncStorage for persistent local data. The UI enforces a dark-mode theme with gradient accents using `expo-linear-gradient` and `Reanimated` for animations, including a `VoiceInputButton` for voice-to-text.

### Backend Architecture
The backend is an Express.js server with a minimal `/api` route structure and dynamic CORS. It uses an interface-based storage abstraction (`IStorage`), with Drizzle ORM configured for PostgreSQL and an in-memory fallback. Path aliases are configured for client and shared code. A server-side proxy routes all ZEKE backend API calls, bypassing CORS and forwarding authentication headers. Communication is secured with HMAC-signed request authentication and comprehensive logging. Device authentication requires a device token for all `/api/*` routes, obtained via a pairing flow, with rate limiting and timing-safe comparisons.

### Data Storage Solutions
Client-side data (devices, memories, chat messages, settings) is stored using AsyncStorage. Server-side, Drizzle ORM is used with PostgreSQL (and an in-memory fallback), sharing a schema validated by Zod.

### Feature Specifications
- **Home Screen (Command Center):** Dynamic greeting, Quick Action Widgets, GPS Status, Activity Timeline, connection status, stats grid, and device management.
- **Geo Tab (Location & Geofencing):** Current location, location history, starred places, and geofencing with configurable radius, trigger types, and action types.
- **Communications Hub (Comms):** Unified interface for SMS, Voice, ZEKE AI chat, and Contacts.
- **Calendar:** Full CRUD operations across Google and ZEKE calendars, with timeline view, filter chips, all-day events, and voice input.
- **Tasks, Grocery, and Custom Lists:** Filterable lists with full CRUD, priority indicators, completion toggles, category grouping, and voice input.
- **Memories:** Filterable, date-grouped memory cards with star toggles and swipe actions.
- **Settings:** Device configuration, preference toggles, app info, and Device Features hub access.
- **Device Features (Native Capabilities):** Access to contacts, sensors dashboard, battery monitor, device info, network status, biometric authentication, document picker, share, and text-to-speech.
- **Real-Time Transcription:** Integration with Deepgram via WebSocket proxy for real-time transcription from BLE audio devices.
- **Real-Time WebSocket Sync:** Uses `/ws/zeke` endpoint for real-time updates and React Query cache invalidation.

### Monorepo Configuration
This project (ZEKEapp) is part of a unified monorepo at `https://github.com/Johnsonbros/ZekeAssistant`, which includes the ZEKE backend (client, server, python_agents) and the mobile project (client, server). Git subtrees are used for two-way synchronization.

## External Dependencies

### Device Integrations
- **Omi**: AI wearable.
- **Limitless**: Wearable pendant.

### Communication Services
- **Twilio**: Independent integration via Replit connector for SMS and Voice calling, managed by a server-side service layer. Requires `TWILIO_TWIML_APP_SID` environment variable.
- **Google Calendar**: Independent integration via Replit connector for real-time calendar sync and CRUD operations, managed by a server-side service layer.

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
- **EAS Build**: For development builds with native modules (VoIP, BLE).
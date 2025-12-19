# ZEKE AI Companion Dashboard

Last sync test: December 19, 2025 8:45 PM UTC

## Overview
ZEKE AI is a mobile companion app (Expo/React Native) designed as a full extension of the main ZEKE web application. It provides quick access to daily essentials (calendar, tasks, grocery lists, custom lists, contacts), captures conversation memory from AI wearables, facilitates communication via SMS/Voice (Twilio), and includes an AI chat assistant. The app leverages native mobile features for communication and real-time data capture, while the ZEKE web server handles data persistence, AI processing, and complex integrations. The project aims to provide a comprehensive mobile interface for the ZEKE AI ecosystem, enhancing user interaction with AI functionalities on a dedicated mobile device.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built with Expo SDK 54 and React Native 0.81, utilizing React 19 architecture with the React Compiler. Navigation is managed by React Navigation v7, featuring a root stack navigator and a bottom tab navigator with 5 tabs. State management combines TanStack React Query for server state and caching, `useState` for local component state, and AsyncStorage for persistent local data. The styling enforces a dark-mode theme with gradient accents using `expo-linear-gradient` and `Reanimated` for smooth animations, including custom themed elements and a `VoiceInputButton` for voice-to-text.

### Backend Architecture
The backend is an Express.js server with a minimal `/api` route structure and dynamic CORS configuration. It uses an interface-based storage abstraction (`IStorage`) currently with in-memory storage, designed for migration to PostgreSQL with Drizzle ORM. Path aliases (`@/*` for client and `@shared/*` for shared code) are configured. A server-side proxy routes all ZEKE backend API calls, bypassing CORS and forwarding authentication headers, with HMAC-signed request authentication and comprehensive communication logging for secure communication. Device authentication requires all `/api/*` routes to be authenticated via a device token obtained through a pairing flow, with rate limiting and timing-safe comparisons.

### Data Storage Solutions
Client-side data is persisted using AsyncStorage for devices, memories, chat messages, and settings. Server-side, Drizzle ORM is configured for PostgreSQL with an in-memory fallback, sharing a schema with Zod validation.

### Feature Specifications
- **Home Screen (Command Center):** Dynamic greeting, Quick Action Widgets, GPS Status card, Activity Timeline, connection status, stats grid, and device management.
- **Geo Tab (Location & Geofencing):** Current location display, location history, starred places, and geofencing capabilities with configurable radius, trigger types (Enter, Exit, Both), and action types (Notification, Grocery Prompt, Custom). Includes foreground monitoring and quick-add options.
- **Communications Hub (Comms):** Unified interface with tabs for SMS (conversations and compose), Voice (call history), Chat (ZEKE AI chat), and Contacts (searchable list with quick actions).
- **Calendar:** Full CRUD operations across all Google Calendars with dedicated ZEKE calendar support, timeline view, filter chips, all-day events, and voice input.
- **Tasks, Grocery, and Custom Lists:** Filterable lists with full CRUD operations, priority indicators, completion toggles, category grouping, and voice input.
- **Memories:** Filterable, date-grouped memory cards with star toggles and swipe actions.
- **Settings:** Device configuration, preference toggles, app information, and access to Device Features hub.
- **Device Features (Native Capabilities):** Access to device contacts, sensors dashboard, battery monitor, device info, network status, biometric authentication, document picker, share functionality, and text-to-speech.
- **Real-Time Transcription:** Integration with Deepgram via WebSocket proxy for real-time transcription from BLE audio devices, with a dedicated `LiveCaptureScreen`.
- **Real-Time WebSocket Sync:** Uses `/ws/zeke` endpoint for real-time updates between the app and ZEKE backend, with client hooks, auto-reconnect, and React Query cache invalidation for various data types.

## External Dependencies

### Device Integrations
- **Omi**: AI wearable.
- **Limitless**: Wearable pendant.

### Communication Services
- **Twilio**: Independent integration via Replit connector for SMS and Voice calling, managed by a server-side service layer.
  - **VoIP Calling**: Requires a development build with `@twilio/voice-react-native-sdk`. Web version falls back to server-initiated calls.
  - **Required for VoIP**: Set `TWILIO_TWIML_APP_SID` environment variable to your TwiML App SID from Twilio Console. The TwiML App should point to `/api/twilio/twiml/voice` endpoint.
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
- **EAS Build**: For development builds with native modules (VoIP, BLE). Run `eas build --profile development --platform android` for Android APK.
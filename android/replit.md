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

## Android Native Build Configuration

### API URL Resolution (Production Builds)
Native Android APKs use a 6-candidate URL resolution strategy to ensure they connect to the correct server:

**Resolution Order (in client/lib/query-client.ts - `getLocalApiUrl()`):**
1. Cached runtime proxy origin (fetched from `/api/runtime-config` on startup)
2. `Constants.expoConfig.extra.localApiDomain` (baked in at build time via app.config.js)
3. `process.env.EXPO_PUBLIC_DOMAIN` environment variable
4. Replit connector hostname detection (for hosted environments)
5. Fallback to `https://zekeai.replit.app` if no other candidates work

**Critical for Production:**
- `EXPO_PUBLIC_DOMAIN` MUST be set at build time for Android
- Example: `EXPO_PUBLIC_DOMAIN="zekeai.replit.app" npm run build:android`
- This bakes the deployed URL into the app bundle, preventing localhost connections
- The app logs the resolved URL at startup (see "Boot-Time Logging" below)

### Boot-Time Logging
When the app starts, it logs configuration details:
```
[config] ========== BOOT-TIME CONFIG ==========
[config] Platform: android
[config] Environment: production
[config] EXPO_PUBLIC_DOMAIN: zekeai.replit.app
[config] Resolved apiUrl: https://zekeai.replit.app
[config] Resolved localApiUrl: https://zekeai.replit.app
[config] URLs match: YES
[config] ======================================
```

**Verification on Device:**
- Connect Android device via ADB: `adb logcat | grep "\[config\]"`
- Confirm "Resolved apiUrl" shows your deployed server (NOT localhost)
- Confirm "URLs match: YES" (apiUrl and localApiUrl should be identical)

### Google Calendar Integration
The Google Calendar integration works by proxying through the Express server:
- All calendar requests go to `/api/calendar/*` endpoints
- Server handles OAuth via Replit's google-calendar connector
- No additional mobile-specific OAuth needed

**For Native Android to Access Calendar:**
1. Device must be able to reach the server at the resolved apiUrl
2. Device must obtain a valid device token via the pairing flow (`/api/auth/pair`)
3. Server's auth middleware validates the device token on all `/api/*` requests
4. Calendar endpoints return data only when device token is valid

**Testing Calendar on Android:**
- In app logs, confirm apiUrl resolves to deployed server
- Open Calendar tab - should show loading state while fetching events
- Check device logs: `adb logcat | grep "Calendar"`
- Verify no 401/403 errors (would indicate auth token issue)

## Performance Optimizations

### Grocery Sync Caching (Implemented)
The ZEKE backend's `/api/grocery` endpoint has high latency (17-27s). To mitigate this:
- **Server-side stale-while-revalidate cache**: The Express proxy caches grocery responses for 60 seconds. Subsequent requests return cached data instantly while refreshing in the background.
- **Client timeout extended**: Grocery requests use a 30-second timeout (vs 10s default) to handle slow backend responses on cache misses.
- **Cache invalidation**: POST/PATCH/DELETE operations on grocery items automatically invalidate the cache.
- **Prefetching**: HomeScreen prefetches grocery data on initial load when in sync mode.

### Future ZEKE Backend Improvements (TODO for next version)
These improvements require changes to the main ZEKE backend:

1. **Profile `/api/grocery` endpoint**: Identify slow queries (likely vector search or aggregations) and optimize database queries or add server-side caching.

2. **Delta/incremental sync endpoint**: Instead of fetching the full grocery list each time, expose a `/api/grocery/changes?since=timestamp` endpoint that returns only items created/modified/deleted since the last sync. This dramatically reduces payload size and processing time.

3. **WebSocket push updates**: Replace polling with real-time push via the existing `/ws/zeke` WebSocket connection. When grocery items change, push the update to connected clients immediately.

4. **Backend response caching**: Add Redis/in-memory caching on the ZEKE backend itself to serve repeated requests without hitting the database.

5. **Pagination support**: For users with large grocery lists, implement cursor-based pagination to load items in chunks.

## ZEKE Dashboard Features (December 2024)

### Omi Pendant Health Monitoring
- **Component**: `OmiHealthCard.tsx` displays real-time Omi pendant status
- **Features**: Battery level, connection status, firmware info, storage metrics, recording/sync status
- **API Endpoint**: `GET /api/zeke/omi/health` (proxied to ZEKE backend)
- **Fallback**: Returns unknown status when backend doesn't support endpoint

### News Briefing System
- **Components**: `NewsBriefingCard.tsx` and `NewsBriefingSection.tsx`
- **Features**: Premium horizontal scrollable cards, category badges, breaking news banners, source attribution
- **Feedback System**: Thumbs up/down with required text input on thumbs down before sending to ZEKE
- **API Endpoints**:
  - `GET /api/zeke/news/briefing` - Fetch personalized news stories
  - `POST /api/zeke/news/feedback` - Submit feedback (requires reason for thumbs-down)

### ZEKE Notification System
- **Components**: `ZekeAlertBanner.tsx` and `ZekeAlertStack.tsx`
- **Features**: Gradient-styled banners, animated interactions, dismissal with swipe
- **API Endpoints**:
  - `GET /api/zeke/notifications` - Fetch notifications (supports limit/unreadOnly params)
  - `POST /api/zeke/notifications/:id/dismiss` - Dismiss notification

### Push Notification Infrastructure
- **Registration**: `POST /api/zeke/push/register` - Register device push token with ZEKE backend
- **Integration**: Uses Expo Notifications for token generation and handling
- **Helper Functions**: `notifications.ts` provides registration and permission handling
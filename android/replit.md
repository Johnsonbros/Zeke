# ZEKE AI Companion Dashboard

## Overview
ZEKE AI is a mobile companion app (Expo/React Native) designed as a **full extension** of the main ZEKE web application (https://zekeai.replit.app), running on a dedicated mobile device. It provides quick access to daily essentials (calendar, tasks, grocery lists, custom lists, contacts), captures conversation memory from AI wearables, facilitates communication via SMS/Voice (Twilio), and includes an AI chat assistant. The app features a dark-themed design with gradient accents and supports iOS, Android, and web platforms. Its core purpose is to leverage native mobile features (voice input, location, notifications) for communication and real-time data capture, while the ZEKE web server handles data persistence, AI processing, and complex integrations. Communication priority is App Chat, then SMS, then Voice calls.

## ZEKE Backend Integration Status
The mobile app is configured to route all API calls to the deployed ZEKE backend (`EXPO_PUBLIC_ZEKE_BACKEND_URL`):
- **Tasks**: Full CRUD via `/api/tasks` endpoints
- **Grocery**: Full CRUD via `/api/grocery` endpoints  
- **Lists**: Full CRUD via `/api/lists` endpoints (custom lists with items)
- **Calendar**: CRUD via `/api/calendar` endpoints (Google Calendar sync)
- **Chat**: AI conversations via `/api/chat` endpoints

**CORS Configuration Required**: The ZEKE backend at `https://zekeai.replit.app` must allow CORS requests from:
- This Replit development domain
- Any production domains where the mobile app is deployed
- Expo Go app domains

To configure CORS on ZEKE server, add these origins to the allowed CORS list in the Express configuration.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built with Expo SDK 54 and React Native 0.81, utilizing React 19 architecture with the React Compiler. Navigation is managed by React Navigation v7, featuring a root stack navigator, a bottom tab navigator with 5 tabs (Home, Comms, Calendar, Geo, Tasks), with Settings and Chat accessible from header icons. Each tab contains its own native stack navigator for nested views. State management combines TanStack React Query for server state and caching, `useState` for local component state, and AsyncStorage for persistent local data. The styling enforces a dark-mode theme with gradient accents (indigo→purple, purple→pink) using `expo-linear-gradient` and `Reanimated` for smooth animations. Key UI components include custom themed elements, gradient text, and specialized cards for contacts, memories, and chat bubbles, along with a `VoiceInputButton` for voice-to-text.

### Backend Architecture
The backend is an Express.js server, featuring a minimal `/api` route structure and dynamic CORS configuration. It employs an interface-based storage abstraction (`IStorage`) currently using in-memory storage (`MemStorage`) but designed for migration to PostgreSQL with Drizzle ORM. The Drizzle ORM schema is defined in `shared/schema.ts` with Zod validation. Path aliases (`@/*` for client and `@shared/*` for shared code) are configured for streamlined development.

### Data Storage Solutions
Client-side data is persisted using AsyncStorage with namespaced keys, storing devices, memories, chat messages, and settings. Server-side, Drizzle ORM is configured for PostgreSQL, with an in-memory fallback. The shared schema includes a `users` table.

### Feature Specifications
- **Home Screen (Command Center):** Dynamic greeting with "ZEKE Command Center" subtitle, Quick Action Widgets (Call, Message, Record, Command buttons with gradient backgrounds), GPS Status card with live location tracking (tappable to navigate to full Location screen), Activity Timeline showing recent ZEKE actions, connection status, stats grid, and device management.
- **Geo Tab (Location & Geofencing):** Full geo-location system with geofencing capabilities. Features include:
  - Current location display with reverse geocoding (city, region, country)
  - Location history tracking with local storage
  - Starred places management for frequently visited locations
  - **Geofences:** Create virtual perimeters around locations with configurable radius (e.g., 500m)
  - **Location Lists:** Group geofences into lists (e.g., "Grocery Stores") with shared settings
  - **Trigger Types:** Enter, Exit, or Both - configure when to fire alerts
  - **Action Types:** Notification, Grocery Prompt (shows unpurchased items), or Custom
  - **Foreground Monitoring:** 30-second location checks with 5-minute cooldown per geofence
  - **Quick Add:** One-tap "Add as Grocery Store" to create geofences with grocery prompt settings
  - Permission handling with settings navigation for denied permissions
  - Distance calculations between current location and geofences
  - API endpoints for location sync with ZEKE backend (`/api/location/*`, `/api/geofences/*`)
  - Note: Background geofencing requires native build (Expo Go supports foreground only)
- **Communications Hub (Comms):** Unified communications interface with four tabs (SMS, Voice, Chat, Contacts). SMS tab shows conversations with navigation to detail screens, Voice tab shows call history with details, Chat tab links to ZEKE AI chat, and Contacts tab provides searchable contact list with quick call/message actions. Contacts are color-coded by access level (Family, Close Friend, Friend, Acquaintance), with detail views accessible from the Comms stack.
- **SMS Screens:** Chat-style conversation view with bubbles and date separators, and a modal for composing new SMS messages with character count.
- **Calendar:** Full CRUD operations across all Google Calendars with dedicated ZEKE calendar support. Timeline view showing daily events color-coded by calendar source, calendar filter chips, all-day events section, add/edit/delete event modals with calendar selection, current time indicator, and voice input for adding events.
- **Tasks:** Filterable task lists (All, Pending, Completed) grouped by urgency, with priority indicators, completion toggles, and voice input for adding tasks. Accessible from Tasks tab with header button to navigate to Grocery and Lists screens.
- **Grocery:** Filterable grocery lists (All, Unpurchased) grouped by category (Produce, Dairy, Meat, etc.), with quantity/unit fields, category badges, and voice input. Accessible from Tasks stack navigator.
- **Lists:** Custom lists feature for any type of list (packing, shopping, checklists, etc.). Full CRUD for lists and items with color coding, swipe-to-delete items, toggle checked status, and clear checked items. Accessible from Tasks screen header.
- **Memories:** Filterable (All, Starred), date-grouped memory cards with star toggles and swipe actions.
- **Settings:** Device configuration, preference toggles, app information, and access to Device Features hub.
- **Device Features (Native Capabilities):** Comprehensive native device feature access via Settings. Includes:
  - **Device Contacts:** Access device contacts with expo-contacts
  - **Sensors Dashboard:** Real-time accelerometer, gyroscope, barometer pressure, and pedometer step count
  - **Battery Monitor:** Live battery level, charging state, and low power mode detection
  - **Device Info:** Device name, model, brand, OS version, and screen dimensions
  - **Network Status:** Connection type, internet reachability, and network state
  - **Biometric Authentication:** Fingerprint/Face ID authentication with expo-local-authentication
  - **Document Picker:** Select documents (PDF, Word, text) from device storage
  - **Share Functionality:** Native sharing capabilities with expo-sharing
  - **Text-to-Speech:** Speech synthesis for reading text aloud
  - Note: Native-only features show "Run in Expo Go to use this feature" message on web platform
- **Battery Widget on Home Screen:** Real-time battery level indicator with color-coded status (green/yellow/red), charging state display, and status messages.
- **Chat Screen:** Full-screen ZEKE AI chat with message history and keyboard-aware text input.
- **Real-Time Transcription:** Integrates Deepgram via a secure WebSocket proxy for real-time transcription from BLE audio devices (Omi, Limitless), with a dedicated `LiveCaptureScreen` for display and saving to ZEKE.
- **Real-Time WebSocket Sync:** Uses `/ws/zeke` endpoint for real-time updates between app and ZEKE backend. Client hook (`useZekeSync`) with auto-reconnect and React Query cache invalidation. `SyncStatus` component shows connection status with colored indicators. Supports message types: `sms`, `voice`, `activity`, `device_status`, `notification`, `task`, `grocery`, `list`, `calendar`, `contact`. When messages arrive, corresponding React Query caches are automatically invalidated for real-time data freshness.

## External Dependencies

### Device Integrations
- **Omi**: AI wearable for conversation capture.
- **Limitless**: Wearable pendant for lifelogging.

### Communication Services
- **Twilio**: Independent Twilio integration via Replit connector for SMS and Voice calling. Server-side service layer in `server/twilio.ts` manages Twilio client authentication using Replit's secure connector API. API endpoints include:
  - `POST /api/twilio/sms/send` - Send SMS messages
  - `GET /api/twilio/sms/conversations` - Fetch SMS conversation list
  - `GET /api/twilio/sms/conversation/:phoneNumber` - Fetch single conversation
  - `POST /api/twilio/call/initiate` - Initiate voice calls
  - `GET /api/twilio/calls` - Fetch call history
  - `GET /api/twilio/calls/:callSid` - Fetch call details
  - `GET /api/twilio/phone-number` - Get configured Twilio phone number
  - `POST /api/twilio/webhook/sms` - Inbound SMS webhook
  - `POST /api/twilio/webhook/voice` - Inbound voice webhook
- Client-side API adapter functions in `client/lib/zeke-api-adapter.ts` for Twilio data fetching with TypeScript interfaces for SMS conversations, messages, and call records.

### Google Calendar Integration
- **Google Calendar**: Independent Google Calendar integration via Replit connector for real-time calendar sync with full CRUD operations. Server-side service layer in `server/google-calendar.ts` manages authentication using Replit's secure connector API. API endpoints include:
  - `GET /api/calendar/today` - Fetch today's calendar events with calendar metadata (name, color)
  - `GET /api/calendar/upcoming` - Fetch upcoming events (next 7 days)
  - `GET /api/calendar/calendars` - List user's calendars with colors
  - `GET /api/calendar/zeke` - Get or create dedicated ZEKE calendar
  - `POST /api/calendar/events` - Create new calendar event in any calendar
  - `PATCH /api/calendar/events/:id` - Update calendar event
  - `DELETE /api/calendar/events/:id` - Delete calendar event
- Client uses `getLocalApiUrl()` from `client/lib/query-client.ts` to ensure calendar API calls always route to the local backend where the Google Calendar connector is configured.

### GitHub Sync Integration
- **GitHub**: Bidirectional sync with Johnsonbros/ZEKE repository via Replit GitHub connector. Server-side service layer in `server/github.ts` manages authentication using Replit's secure connector API with Octokit. Features include:
  - Automatic webhook for push events
  - Manual pull/sync capability
  - Push local changes back to GitHub
  - Security-hardened with input validation and safe command execution
- API endpoints:
  - `POST /api/github/webhook` - Receives push events from GitHub, auto-syncs on push to main branch
  - `POST /api/github/sync` - Manual pull from GitHub (clones to ./zeke-sync/)
  - `POST /api/github/push` - Commits and pushes local changes (accepts `{"message": "commit message"}`)
  - `POST /api/github/create-webhook` - Programmatically creates webhook on the repo
  - `GET /api/github/status` - Check connection status and configuration
- Query parameters for customization: `owner`, `repo`, `branch`, `targetDir` (defaults to Johnsonbros/ZEKE main branch → ./zeke-sync/)

### Third-Party Services
- **Expo Services**: Utilized for splash screen, haptics, image handling, web browser, blur effects, and audio recording.
- **React Navigation**: Core library for app navigation.
- **Deepgram**: Real-time audio transcription via a secure WebSocket proxy.

### Database
- **PostgreSQL**: Target database, configured with Drizzle ORM.

### Build & Development
- **Replit Environment**: Detected for deployment URLs.
- **Metro Bundler**: Configured with module-resolver for path aliases.
- **esbuild**: Used for server-side bundling.
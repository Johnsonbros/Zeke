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
- **Input/Output**: SMS/MMS integration with GPT-4o Vision for image processing, voice pipeline for Omi Pendant lifelogs, and Smart Notification Batching.
- **Learning & Feedback**: Feedback Learning Loop system for user corrections, implicit feedback detection, and a nightly trainer to cluster feedback into style profiles.
- **Efficiency & Resilience**: Overnight Batch Factory using OpenAI Batch API, AI Usage Logging System for API call tracking and anomaly alerting, Circuit Breaker, and Retry with Jittered Backoff.
- **User Interface**: Structured Chat Cards for rich interactive responses, Mobile UI Enhancements (swipe gestures, Quick Menu), and Delta Sync System for efficient mobile app synchronization.
- **Security & Authentication**: HMAC Authentication for the mobile app with replay protection and timing-safe comparisons.
- **Unified Conversation System**: All direct communications with Nate (SMS, web, mobile, voice) share a single coherent conversation thread.
- **Companion App Integration**: Location Ingestion for real-time tracking, Push Notification Infrastructure via Expo, and Calendar Proxy Routes for Android app support.
- **Health Monitoring**: Sleep Tracking, Pendant Health Monitor for Omi device status, and Mobile Auth Health Endpoint for debugging.
- **Daily Operations**: Journal/Daily Summary System, Anticipation Engine for morning briefings, and a Pattern Detection System.

## External Dependencies
- **OpenAI API**: AI responses, agent logic, and text embeddings.
- **Twilio**: SMS messaging and voice calling.
- **ElevenLabs**: Custom voice synthesis.
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
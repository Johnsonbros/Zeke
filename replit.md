# Project: ZEKE – Nate's Personal AI Assistant

## Overview
ZEKE is a single-user personal AI assistant for Nate Johnson, designed for high-quality, long-term memory and accessible interaction via SMS and a simple web UI. It focuses on providing action-oriented, proactive, and personalized assistance through respectful, precise communication. Key capabilities include comprehensive personal context management, intelligent communication, task/calendar integration, location awareness, and sophisticated food preference tracking.

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

The core is a multi-agent system in Python, with specialized agents like Conductor, Memory Curator, Comms Pilot, Ops Planner, Research Scout, Safety Auditor, and Limitless Analyst. A TypeScript Context Router system provides domain-specific context bundles to Python agents, supporting a dual-context strategy for efficiency and backward compatibility. The Limitless Analyst agent specifically preprocesses lifelog data into curated context bundles and proactively persists insights.

The UI features a dark theme with a coral red accent and Poppins font, designed as a dashboard-first interface with a global sidebar navigation. Key technical implementations include:
- **Context Router System**: An intelligent, multi-layered context assembly system replacing monolithic prompt building, using token-budgeted bundles for efficiency.
- **Context Bundle Caching** (`server/contextCache.ts`, `server/cacheInvalidation.ts`): High-performance in-memory caching layer that reduces database queries per conversation turn:
  - LRU cache with TTL-based expiration (tasks: 30s, calendar: 60s, memory: 2min, contacts: 5min, profile: 10min)
  - Domain-specific invalidation hooks integrated into database CRUD operations (tasks, grocery, memory, contacts)
  - Automatic cache invalidation on mutations via lazy-loaded helpers to avoid circular dependencies
  - Statistics tracking (hits, misses, evictions, invalidations, prefetches) for performance monitoring
  - API endpoint: `GET /api/cache/stats` returns hit rate and cache metrics
- **Conversation Summarization System**: Automatically compresses older conversation history into bullet summaries using GPT-4o-mini for token-efficient context.
- **Memory Model**: Optimized for a single user, storing long-term memory with semantic search (OpenAI `text-embedding-3-small`), and features a confidence scoring system that tracks memory reliability.
- **Conversation Quality Metrics**: Tracks tool calls, outcomes, durations, and quality signals, with an AI Quality Metrics Dashboard Widget for visualization.
- **Access Control System**: A three-tier granular permission system.
- **Reminders & Automations**: Scheduled jobs for recurring tasks and intelligent workflow automations like AI Task Breakdown, Smart Grocery Suggestions, and Proactive Task Follow-up.
- **Tooling**: Integrates various AI tools for communication (SMS), task management, calendar, weather, web search, file operations, and Limitless pendant lifelogs.
- **Limitless Pendant Integration**: Connects to the Limitless API for accessing and semantically searching recorded conversations, with specific tools for lifelog data and voice commands for common actions. An Analytics Dashboard provides insights from this data.
- **Voice Pipeline**: Voice input from Limitless Pendant lifelogs that feeds into ZEKE's agent system:
  - **LimitlessListener** (`server/voice/limitlessListener.ts`): Polls `/v1/lifelogs` endpoint every 10 seconds for new transcribed recordings with watermark-based tracking and duplicate prevention
  - **UtteranceStream** (`server/voice/utteranceStream.ts`): Accumulates transcript text, detects ~1s silence as sentence boundaries, and handles ZEKE wake word detection/stripping
  - **VoiceCommandHandler** (`server/voice/voiceCommandHandler.ts`): Processes detected utterances through the same agent pipeline as SMS/web
  - Voice uses the SAME brain as SMS/web - no separate voice logic
  - Wake word required: Commands must start with "ZEKE" (case-insensitive) to be processed
  - Graceful degradation: Works normally if LIMITLESS_API_KEY not configured
  - API endpoints: `GET /api/voice/status`, `POST /api/voice/start`, `POST /api/voice/stop`, `POST /internal/voice-command`
  - **Latency note**: Due to Limitless API limitations (audio syncs Pendant → Phone → Cloud before transcripts available), expected latency is 1-5 minutes rather than real-time
  - **Troubleshooting**: If voice commands aren't being detected, check: (1) Is the Limitless app running on the phone? (2) Is the pendant turned on? (3) Is there a network connection for cloud sync?
- **Limitless-GPS Deep Integration**: Unified location-aware conversation retrieval system that:
  - Correlates lifelog timestamps with GPS location history to determine where each conversation happened
  - Automatically enriches new memories with location context when timestamp matches GPS data
  - Provides unified timeline API (`/api/location/timeline`) merging location history with lifelog data chronologically
  - Includes LocationTimelineWidget dashboard component showing combined location + conversation history with activity badges
  - Supports sophisticated activity pattern detection analyzing GPS patterns for meeting detection (stationary during 9am-5pm), transit patterns (stop-and-go movement), and commute identification
  - Extended activity types in schema: "meeting", "transit" added to existing "stationary", "walking", "driving", "running", "cycling", "commuting", "unknown"
  - Pattern analysis endpoint (`/api/location/patterns`) provides insights on commute patterns, frequent locations, and activity distribution
- **Automatic People Tracking System**: Autonomously extracts and tracks relationships, updating contacts and linking memories.
- **Enhanced Contacts System**: Comprehensive contact management with detailed information, notes, and family member linking.
- **Admin Profile System**: Integrated profile management with context for personalized assistance.
- **Database Schema**: SQLite database for persistent storage of various data types.
- **Twilio SMS Logging**: Comprehensive logging of SMS activity.
- **Location Intelligence System**: GPS-aware system with map UI, tracking, and AI tools.
- **Food Preference Intelligence System**: Tracks preferences, restrictions, and recipes, with AI-powered generation and grocery integration.
- **Grocery List Auto-Clear**: Configurable settings for purchased items.
- **Smart Notification Batching**: Intelligent SMS notification system that queues notifications, batches them at configurable intervals, respects quiet hours (9pm-8am default), and allows urgent notifications to bypass batching. Features a dashboard widget for status monitoring and preference controls.
- **Natural Language Automation Builder**: Convert natural language phrases like "Remind me to check email every morning at 8am" into structured automations with intelligent parsing (GPT-4o-mini). Supports 5 trigger types (time/event/location/keyword/condition) and 7 action types (send_sms/create_task/add_grocery/set_reminder/notify/generate_summary/update_memory). Features an Automations page UI for viewing, testing, toggling, and deleting automation rules.
- **Autonomous Automation Creation**: ZEKE can autonomously create scheduled automations (like weather reports) via natural language requests. Uses the `create_weather_automation` tool with contact name resolution (fuzzy matching against firstName/lastName), time-to-cron conversion, and duplicate prevention (updates existing automations instead of creating duplicates). Naming convention: "Morning Weather - {FirstName}". Supports requests like "Send morning weather texts to Nate, Shakita, and Carolina at 6am for Abington, MA".
- **AI-Powered Weather Briefings**: Personalized, narrative-style weather reports generated using GPT-4o-mini. Includes natural temperature descriptions ("mid-30s", "upper 40s"), actionable "What to do" bullet points with family member names (spouse, children from profile), specific clothing/gear recommendations, road condition notes, and a promise to monitor for changes. Example format: "ZEKE MORNING WEATHER BRIEFING" with current conditions, advice bullets, and monitoring promise.
- **Severe Weather Monitoring & Family Alerts**: Automatic background monitoring (every 2 hours) that detects dangerous conditions including extreme cold (<20°F), extreme heat (>95°F), high winds (>35mph), severe storms, tornado conditions, and heavy precipitation. When warning-level conditions are detected, sends SMS alerts to all family members (contacts with canSetReminders permission) with specific safety recommendations. 4-hour cooldown prevents duplicate alerts.
- **Predictive Task Scheduling**: Analyzes task completion patterns (day of week, hour preferences, category breakdowns) to generate AI-powered scheduling suggestions. Provides quick scheduling options (Today, Tomorrow, Next Week, preferred days) and pattern insights with recommendations. Uses debounced API calls with lazy OpenAI client initialization for efficiency and security.
- **Limitless Enhanced Features**: Advanced capabilities for lifelog intelligence and analysis:
  - **Daily Digest** (`server/limitlessDigest.ts`): Automated evening SMS summaries of captured conversations with configurable send time (default 8pm), character-aware SMS formatting (max 700 chars), key discussion highlights, action items, and people interacted with. Configure via API endpoints: `GET /api/limitless/digest/status`, `POST /api/limitless/digest/configure`, `PATCH /api/limitless/digest/preferences`, `POST /api/limitless/digest/send`
  - **Action Item Extraction** (`server/jobs/limitlessActionItems.ts`): AI-powered detection of commitments from conversation transcripts like "I'll send that by Friday", with automatic task creation, speaker/contact linking, and deduplication. Stores in `lifelog_action_items` table. API endpoints: `GET /api/limitless/action-items`, `POST /api/limitless/action-items/extract`
  - **Meeting Intelligence** (`server/jobs/limitlessMeetings.ts`): Detects multi-speaker conversations (2+ speakers, 5+ minutes) as meetings, generates AI summaries with topic extraction and action items. Stores in `meetings` table. API endpoints: `GET /api/limitless/meetings`, `GET /api/limitless/meetings/date/:date`, `POST /api/limitless/meetings/detect`
  - **Conversation Search** (`server/jobs/limitlessSearch.ts`): Natural language search over lifelog data with semantic query parsing, speaker filtering, date range filtering, and relevance ranking. Includes AI-powered question answering about past conversations. API endpoints: `GET /api/limitless/search?q=query`, `POST /api/limitless/ask`
  - **Analytics & Pattern Detection** (`server/jobs/limitlessAnalytics.ts`): Pre-aggregated daily analytics (conversation counts, duration, speaker frequency, topic trends, hour distribution) stored in `limitless_analytics_daily` table. Weekly trend computation with trend direction (increasing/stable/decreasing). Scheduled nightly aggregation at 2 AM. API endpoints: `GET /api/limitless/weekly-trends`, `POST /api/limitless/analytics/aggregate`
  - Database tables: `meetings` (multi-speaker conversations), `lifelog_action_items` (extracted commitments), `limitless_analytics_daily` (aggregated metrics)

Key capabilities include SMS communication, full CRUD for tasks, Google Calendar event management, weather updates, morning briefings, AI-powered web search, file operations, time utilities, shared grocery list management, intelligent automation rules, and advanced Limitless conversation intelligence.

## External Dependencies
- **OpenAI API**: AI responses, agent logic, and text embeddings.
- **Twilio**: SMS messaging.
- **better-sqlite3**: Node.js SQLite client.
- **Perplexity API**: Enhanced AI-powered web search.
- **Google Calendar API**: Calendar integration.
- **OpenWeatherMap API**: Weather data.
- **DuckDuckGo API**: Fallback web search.
- **Limitless API**: Accessing lifelogs from the Limitless pendant.
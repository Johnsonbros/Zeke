# Project: ZEKE – Nate's Personal AI Assistant

## Overview
ZEKE is a single-user personal AI assistant designed exclusively for Nate Johnson. Its primary purpose is to provide high-quality, long-term memory capabilities and accessible interaction via SMS and a simple web UI. The project prioritizes respectful, precise, and non-fluffy communication, aiming to be an action-oriented assistant rather than a suggestion engine.

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
ZEKE uses a multi-agent architecture with a Node.js + TypeScript (Express) backend, Python FastAPI microservice for agent orchestration, and a React frontend with Tailwind CSS and shadcn/ui components. SQLite is used for persistent storage.

### Multi-Agent System (Python)
Located in `python_agents/`, the multi-agent system uses OpenAI's Agents SDK with specialized agents:
- **Conductor**: Central orchestrator that classifies user intent and routes to specialists
- **Memory Curator**: Semantic memory retrieval, Limitless lifelog synthesis
- **Comms Pilot**: SMS/chat handling with contact permissions
- **Ops Planner**: Tasks, reminders, calendar, grocery list operations
- **Research Scout**: Perplexity/web search integration
- **Safety Auditor**: Permission verification and response validation

The `/api/chat` endpoint delegates to the Python agent service (port 5001) with automatic fallback to the legacy single-agent loop if Python is unavailable. The Python service is automatically started when the TypeScript server starts (via `server/python-agents.ts`).

**To start the Python agent service manually (if needed):**
```bash
PYTHONPATH=/home/runner/workspace python -m uvicorn python_agents.main:app --host 127.0.0.1 --port 5001
```

The TypeScript server communicates with Python agents via an HTTP bridge at `/api/tools/execute`.

### UI/UX Decisions
- Dark theme with a coral red accent (hsl(9, 75%, 61%)).
- Background: hsl(20, 14%, 4%), Text: hsl(45, 25%, 91%).
- Font: Poppins.
- **Dashboard-First Interface**: The home page (`/`) is now a dashboard with at-a-glance widgets showing key information (pending tasks, grocery items, memories, conversations) and quick access cards to features.
- **Global Sidebar Navigation**: Persistent sidebar using Shadcn UI components with ZEKE branding, navigation to all features (Dashboard, Getting To Know You, Grocery List, Tasks, ZEKE's Memory, Contacts, Automations, SMS Log), "New Chat" button, and profile section at bottom.
- **Chat as Feature Page**: Chat functionality moved to `/chat` as one feature among many rather than the centerpiece. Chat page has its own conversation history sidebar.
- A dedicated Memory page (`/memory`) allows viewing all of ZEKE's memories with stats, type filters, and supersession tracking.
- Collaborative grocery list UI at `/grocery`.

### Routes
- `/` - Dashboard (home page with stats and feature cards)
- `/chat` - Chat with ZEKE
- `/grocery` - Grocery list management
- `/tasks` - Task management
- `/memory` - ZEKE's Memory browser
- `/contacts` - Contacts management with access control
- `/automations` - Reminders and scheduled tasks
- `/profile` - Profile editor
- `/sms-log` - SMS activity log

### Technical Implementations
- **Memory Model**: Optimized for a single user (Nate) with a persistent profile. Stores all long-term memory in the database and markdown files (`zeke_profile.md`, `zeke_knowledge.md`). Conversation history is summarized into concise notes. The agent automatically extracts facts, preferences, and summaries from conversations.
- **Semantic Memory System**: Utilizes OpenAI `text-embedding-3-small` for vector embeddings. Memories are ranked by Recency (20%), Relevance (60% - cosine similarity), and Importance (20% - facts > preferences > notes > summaries). Automatic deduplication checks new memories against existing ones using a 92% similarity threshold. `getSmartMemoryContext()` retrieves relevant memories based on meaning, with a graceful fallback to basic keyword search if semantic search fails. A memory supersession system marks old memories as superseded when corrected, preserving history.
- **Access Control System**: A three-tier system (Master Admin, SMS Users, Web Users) with configurable access levels (admin, family, friend, business, restricted, unknown) and granular permissions per contact (e.g., `canAccessPersonalInfo`, `canAccessCalendar`). Security is enforced at the Agent, Tool, Memory, and Background Job layers. **Security Note**: The web UI is designed as a trusted admin interface for single-user deployment. It requires a private environment and is not intended for public hosting without adding authentication.
- **Reminders & Automations**: Scheduled jobs system for recurring tasks. Supports morning briefings, scheduled SMS messages, and daily check-ins. Uses node-cron with America/New_York timezone. Automation execution verifies recipient permissions (canSetReminders, canAccessPersonalInfo) with phone number normalization. Managed via `/automations` page.
- **Tooling**: ZEKE integrates various tools via OpenAI function calling for communication (send SMS, daily check-ins, reminders), task management, calendar events (Google Calendar), weather, morning briefings, utilities (Perplexity/web search, file operations, time), and Limitless pendant lifelogs. File tools have robust directory traversal protection.
- **Limitless Pendant Integration**: ZEKE connects to the Limitless pendant API to access recorded conversations from Nate's wearable device. Tools include: `search_lifelogs` (semantic/hybrid search across conversations), `get_recent_lifelogs` (fetch today's or recent conversations by hours), `get_lifelog_context` (pull relevant context for a specific topic), and `check_limitless_status` (verify API connection). The agent is instructed to proactively check lifelogs when questions involve past conversations, commitments, or discussions with specific people. Lifelog access requires `canAccessPersonalInfo` permission for privacy protection.
- **Daily Check-In & Getting To Know You**: Features to proactively learn about Nate through daily questions and guided conversations, including memory corrections.
- **Admin Profile System**: Comprehensive profile management at `/profile` with 10 sections (Basic Info, Work, Family, Interests, Preferences, Goals, Health, Routines, Important Dates, Custom Fields). Profile data is stored in a flexible JSON format in the `profile_sections` table and automatically integrated into ZEKE's context for personalized assistance. The sidebar profile section links directly to the profile editor.
- **Database Schema (SQLite)**: Includes tables for `conversations`, `messages`, `memory_notes` (with embedding column and supersession), `preferences`, `grocery_items`, `tasks`, `contacts` (with access control details), `profile_sections` (for structured personal context), and `twilio_messages` (for SMS logging).
- **Twilio SMS Logging**: Comprehensive logging system that captures all SMS activity. Every inbound and outbound SMS is logged to the `twilio_messages` table with direction, phone numbers, message body, status, Twilio SID, and source. Sources include: webhook (incoming), reply (AI response), send_sms_tool (AI-initiated), reminder, automation, daily_checkin, and web_ui. The SMS Log page at `/sms-log` displays all SMS activity with conversation threading by phone number, stats panel (total/inbound/outbound/failed counts), and the ability to compose and send new messages.

### Feature Specifications
- **Communication & Reminders**: Send SMS, configure/manage daily check-ins, set/list/cancel reminders.
- **Task Management**: Add, list, update, complete, delete, and clear tasks with properties like title, description, priority, due date, and category.
- **Calendar**: Get, create, and delete Google Calendar events.
- **Weather**: Get current weather and forecast.
- **Morning Briefing**: Comprehensive daily summary of weather, calendar, tasks, and reminders, optionally sent via SMS.
- **Utilities**: AI-powered web search via Perplexity (preferred) or basic web search via DuckDuckGo (fallback), read/write/list files securely, get current time.
- **Grocery List**: Add, list, mark purchased, remove, and clear purchased items from a shared grocery list.

## External Dependencies
- **OpenAI API**: Used for AI responses, agent logic (gpt-5.1), and text embeddings (text-embedding-3-small).
- **Twilio**: For sending and receiving SMS messages.
- **better-sqlite3**: Node.js SQLite client.
- **Perplexity API**: For enhanced AI-powered web search with citations.
- **Google Calendar API**: For calendar integration.
- **OpenWeatherMap API**: For weather data.
- **DuckDuckGo API**: As a fallback for basic web search.
- **Limitless API**: For accessing lifelogs from the Limitless pendant wearable. Provides recorded conversation transcripts with semantic search capability.
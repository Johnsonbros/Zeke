# Project: ZEKE – Nate's Personal AI Assistant

## Overview
ZEKE is a single-user personal AI assistant for Nate Johnson, focusing on high-quality, long-term memory and accessible interaction via SMS and a simple web UI. The project aims to provide an action-oriented assistant through respectful, precise, and non-fluffy communication, prioritizing actionable results over mere suggestions. It includes features like comprehensive personal context management, intelligent communication, task/calendar integration, location awareness, and sophisticated food preference tracking, all designed to offer proactive and personalized assistance.

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
ZEKE utilizes a multi-agent architecture with a Node.js + TypeScript (Express) backend, a Python FastAPI microservice for agent orchestration, and a React frontend with Tailwind CSS and shadcn/ui components. SQLite serves as the persistent data store.

### Multi-Agent System (Python)
The core of ZEKE is a multi-agent system in Python, featuring specialized agents like Conductor (orchestration), Memory Curator, Comms Pilot, Ops Planner, Research Scout, Safety Auditor, and Limitless Analyst. The TypeScript backend communicates with this service, with an automatic fallback to a legacy single-agent loop if the Python service is unavailable.

#### Limitless Analyst Agent
A specialized sub-agent that preprocesses Limitless pendant lifelog data and provides curated context bundles to other agents:
- **Context Bundles**: Creates structured, token-limited (~2000 tokens) packages containing summaries, key points, action items, people mentioned, and relevant quotes
- **Proactive Memory Persistence**: Automatically saves high-priority action items and insights to long-term memory via `save_lifelog_insight` tool
- **Routing**: The Conductor routes all LIFELOG_QUERY intents to the Limitless Analyst for specialized processing
- **Tools**: get_lifelog_overview, search_lifelogs, get_recent_lifelogs, get_lifelog_context, get_daily_summary, save_lifelog_insight

### UI/UX Decisions
The user interface features a dark theme with a coral red accent and Poppins font. It's designed as a dashboard-first interface where the homepage (`/`) provides at-a-glance information and quick access. A global sidebar navigation using Shadcn UI components provides persistent access to all features (Dashboard, Chat, Grocery List, Tasks, Memory, Contacts, Automations, SMS Log). Chat functionality is a dedicated feature page (`/chat`) rather than the central focus.

### Technical Implementations
- **Memory Model**: Optimized for a single user, storing long-term memory in the database and markdown files. Conversation history is summarized, and facts, preferences, and summaries are automatically extracted.
- **Semantic Memory System**: Uses OpenAI `text-embedding-3-small` for vector embeddings, ranking memories by Recency, Relevance, and Importance. It includes automatic deduplication and a supersession system for updated information.
- **Access Control System**: A three-tier system with granular permissions for contacts and system components, enforcing security at multiple layers.
- **Reminders & Automations**: Scheduled jobs using node-cron for recurring tasks, morning briefings, and scheduled SMS messages, with permission verification.
- **Intelligent Workflow Automations**: AI-powered workflow features including:
  - **AI Task Breakdown**: Automatically analyzes complex tasks and generates subtasks with suggested due dates and priorities (uses GPT-4o-mini)
  - **Smart Grocery Suggestions**: Suggests related grocery items when adding items (e.g., pasta → sauce, garlic, parmesan)
  - **Proactive Task Follow-up**: Daily 8 AM SMS check-in with overdue/upcoming tasks and AI-generated action suggestions
  - **Multi-step Reminder Sequences**: Create linked reminders at intervals like "1 week, 1 day, 1 hour before" an event
- **Tooling**: Integrates various AI tools for communication (SMS), task management, calendar (Google Calendar), weather, web search (Perplexity), file operations, and Limitless pendant lifelogs.
- **Limitless Pendant Integration**: Connects to the Limitless API to access and semantically search recorded conversations from the user's wearable device. Includes:
  - `get_lifelog_overview`: ALWAYS use first when user asks about lifelog data - shows available data across today, yesterday, and last 7 days with the most recent recording age.
  - `search_lifelogs`: Semantic + keyword search across all available lifelog data.
  - `get_recent_lifelogs`: Get conversations from last N hours (default 24, use 48-72 for broader searches).
  - `get_lifelog_context`: Get relevant excerpts for a topic (searches last 72 hours).
  - `generate_daily_summary`: AI-powered daily conversation summary with key discussions, action items, insights.
  - `get_daily_summary`: Retrieve cached daily summary.
  - **Voice Commands (Wake Word)**: Say "Hey ZEKE" followed by a command into the pendant. The system scans lifelogs every 5 minutes, detects commands, and executes them:
    - `send_message`: "Hey ZEKE, tell [person] [message]" - Sends SMS to the contact
    - `set_reminder`: "Hey ZEKE, remind me to [task] in [time]" - Creates reminder and sends SMS when due
    - `add_task`: "Hey ZEKE, add a task to [task description]" - Creates a task
    - `add_grocery_item`: "Hey ZEKE, add [item] to the grocery list" - Adds item to grocery list
    - `schedule_event`: "Hey ZEKE, schedule [event] for [time]" - Creates Google Calendar event
    - `search_info`: "Hey ZEKE, search for [topic]" - Searches web via Perplexity and sends results via SMS
    - `get_weather`: "Hey ZEKE, what's the weather today?" - Gets current weather and sends via SMS
    - `get_time`: "Hey ZEKE, what time is it?" - Gets current time and sends via SMS
    - `get_briefing`: "Hey ZEKE, give me a briefing" - Gets full morning briefing (weather, calendar, tasks) via SMS
- **Limitless Analytics Dashboard**: Interactive dashboard at `/limitless` showing conversation trends, top contacts, topics, and daily summaries with recharts visualizations.
- **Automatic People Tracking System**: Autonomously extracts and tracks relationships from lifelogs and conversations, creating/updating contacts and linking memories to individuals.
- **Enhanced Contacts System**: Comprehensive contact management with:
  - Separated name fields (firstName, lastName, middleName) for better organization
  - Extended contact info (email, aiAssistantPhone, imageUrl)
  - Contact notes system allowing both ZEKE and Nate to add observations/notes with types (interaction, observation, comment, fact)
  - Three-tab detail panel: Messages (communication history), Details (contact info), Notes (observations/comments)
- **Admin Profile System**: Comprehensive profile management integrated into ZEKE's context for personalized assistance.
- **Database Schema**: SQLite database includes tables for conversations, messages, memory notes, preferences, grocery items, tasks, contacts, profile sections, and Twilio messages.
- **Twilio SMS Logging**: Comprehensive logging of all SMS activity with conversation threading and an accessible log page.
- **Location Intelligence System**: A GPS-aware system with an interactive map UI, location tracking, saved places, proximity detection, and AI tools for location-based assistance.
- **Food Preference Intelligence System**: Tracks family member food preferences, dietary restrictions, meal history, and saved recipes, with AI-powered recipe generation and grocery integration.
- **Grocery List Auto-Clear**: Configurable auto-clear settings for purchased grocery items.

### Feature Specifications
Key capabilities include:
- **Communication**: SMS send/receive, daily check-ins, reminders.
- **Task Management**: Full CRUD operations for tasks.
- **Calendar**: Google Calendar event management.
- **Weather**: Current and forecast weather.
- **Morning Briefing**: Daily summary of key information.
- **Utilities**: AI-powered web search (Perplexity preferred), file operations, time.
- **Grocery List**: Shared grocery list management with purchasing and auto-clear.

## External Dependencies
- **OpenAI API**: AI responses, agent logic (gpt-5.1), and text embeddings (text-embedding-3-small).
- **Twilio**: SMS messaging.
- **better-sqlite3**: Node.js SQLite client.
- **Perplexity API**: Enhanced AI-powered web search.
- **Google Calendar API**: Calendar integration.
- **OpenWeatherMap API**: Weather data.
- **DuckDuckGo API**: Fallback web search.
- **Limitless API**: Accessing lifelogs from the Limitless pendant.
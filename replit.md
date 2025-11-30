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
The core of ZEKE is a multi-agent system in Python, featuring specialized agents like Conductor (orchestration), Memory Curator, Comms Pilot, Ops Planner, Research Scout, and Safety Auditor. The TypeScript backend communicates with this service, with an automatic fallback to a legacy single-agent loop if the Python service is unavailable.

### UI/UX Decisions
The user interface features a dark theme with a coral red accent and Poppins font. It's designed as a dashboard-first interface where the homepage (`/`) provides at-a-glance information and quick access. A global sidebar navigation using Shadcn UI components provides persistent access to all features (Dashboard, Chat, Grocery List, Tasks, Memory, Contacts, Automations, SMS Log). Chat functionality is a dedicated feature page (`/chat`) rather than the central focus.

### Technical Implementations
- **Memory Model**: Optimized for a single user, storing long-term memory in the database and markdown files. Conversation history is summarized, and facts, preferences, and summaries are automatically extracted.
- **Semantic Memory System**: Uses OpenAI `text-embedding-3-small` for vector embeddings, ranking memories by Recency, Relevance, and Importance. It includes automatic deduplication and a supersession system for updated information.
- **Access Control System**: A three-tier system with granular permissions for contacts and system components, enforcing security at multiple layers.
- **Reminders & Automations**: Scheduled jobs using node-cron for recurring tasks, morning briefings, and scheduled SMS messages, with permission verification.
- **Tooling**: Integrates various AI tools for communication (SMS), task management, calendar (Google Calendar), weather, web search (Perplexity), file operations, and Limitless pendant lifelogs.
- **Limitless Pendant Integration**: Connects to the Limitless API to access and semantically search recorded conversations from the user's wearable device.
- **Automatic People Tracking System**: Autonomously extracts and tracks relationships from lifelogs and conversations, creating/updating contacts and linking memories to individuals.
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
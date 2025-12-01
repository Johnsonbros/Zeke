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
- **Conversation Summarization System**: Automatically compresses older conversation history into bullet summaries using GPT-4o-mini for token-efficient context.
- **Memory Model**: Optimized for a single user, storing long-term memory with semantic search (OpenAI `text-embedding-3-small`), and features a confidence scoring system that tracks memory reliability.
- **Conversation Quality Metrics**: Tracks tool calls, outcomes, durations, and quality signals, with an AI Quality Metrics Dashboard Widget for visualization.
- **Access Control System**: A three-tier granular permission system.
- **Reminders & Automations**: Scheduled jobs for recurring tasks and intelligent workflow automations like AI Task Breakdown, Smart Grocery Suggestions, and Proactive Task Follow-up.
- **Tooling**: Integrates various AI tools for communication (SMS), task management, calendar, weather, web search, file operations, and Limitless pendant lifelogs.
- **Limitless Pendant Integration**: Connects to the Limitless API for accessing and semantically searching recorded conversations, with specific tools for lifelog data and voice commands for common actions. An Analytics Dashboard provides insights from this data.
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
- **Predictive Task Scheduling**: Analyzes task completion patterns (day of week, hour preferences, category breakdowns) to generate AI-powered scheduling suggestions. Provides quick scheduling options (Today, Tomorrow, Next Week, preferred days) and pattern insights with recommendations. Uses debounced API calls with lazy OpenAI client initialization for efficiency and security.

Key capabilities include SMS communication, full CRUD for tasks, Google Calendar event management, weather updates, morning briefings, AI-powered web search, file operations, time utilities, shared grocery list management, and intelligent automation rules.

## External Dependencies
- **OpenAI API**: AI responses, agent logic, and text embeddings.
- **Twilio**: SMS messaging.
- **better-sqlite3**: Node.js SQLite client.
- **Perplexity API**: Enhanced AI-powered web search.
- **Google Calendar API**: Calendar integration.
- **OpenWeatherMap API**: Weather data.
- **DuckDuckGo API**: Fallback web search.
- **Limitless API**: Accessing lifelogs from the Limitless pendant.
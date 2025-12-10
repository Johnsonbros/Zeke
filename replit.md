# Project: ZEKE – Nate's Personal AI Assistant

## Overview
ZEKE is a single-user personal AI assistant for Nate Johnson, designed for high-quality, long-term memory and accessible interaction via SMS and a simple web UI. It focuses on providing action-oriented, proactive, and personalized assistance through respectful, precise communication. Key capabilities include comprehensive personal context management, intelligent communication, task/calendar integration, location awareness, and sophisticated food preference tracking. The project aims to provide a highly personalized, efficient, and intelligent assistant experience.

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

The core is a multi-agent system in Python, with specialized agents like Conductor, Memory Curator, Comms Pilot, Ops Planner, Research Scout, and Safety Auditor. A TypeScript Context Router system provides domain-specific context bundles to Python agents, supporting a dual-context strategy for efficiency. The UI features a dark theme with a coral red accent and Poppins font, designed as a dashboard-first interface with global sidebar navigation.

Key technical implementations and features include:
- **Context Router System**: An intelligent, multi-layered context assembly system using token-budgeted bundles.
- **Context Bundle Caching**: High-performance in-memory LRU cache with TTL-based expiration and domain-specific invalidation.
- **Conversation Summarization System**: Automatically compresses older conversation history into bullet summaries using GPT-4o-mini.
- **Memory Model**: Optimized for a single user, storing long-term memory with semantic search and confidence scoring.
- **Reminders & Automations**: Scheduled jobs for recurring tasks, AI Task Breakdown, Smart Grocery Suggestions, and Proactive Task Follow-up.
- **Tooling**: Integrates various AI tools for communication (SMS), task management, calendar, weather, web search, file operations, and Omi pendant lifelogs.
- **Omi Pendant Integration**: Connects to the Omi API for accessing and semantically searching recorded conversations.
- **Voice Pipeline**: Processes voice input from Omi Pendant lifelogs through the same agent pipeline as SMS/web, with wake word detection.
- **Omi-GPS Deep Integration**: Correlates lifelog timestamps with GPS location history to enrich memories with location context and detect activity patterns.
- **Automatic People Tracking System**: Extracts and tracks relationships, updating contacts and linking memories.
- **Food Preference Intelligence System**: Tracks preferences, restrictions, and recipes, with AI-powered generation and grocery integration.
- **Smart Notification Batching**: Intelligent SMS notification system that queues, batches, and respects quiet hours, with urgent bypass.
- **Natural Language Automation Builder**: Converts natural language phrases into structured automations with intelligent parsing, supporting various trigger and action types.
- **Autonomous Automation Creation**: ZEKE can autonomously create scheduled automations like weather reports via natural language.
- **AI-Powered Weather Briefings**: Personalized, narrative-style weather reports generated using GPT-4o-mini, including actionable advice.
- **Severe Weather Monitoring & Family Alerts**: Automatic background monitoring for dangerous conditions and SMS alerts to family members with safety recommendations.
- **Predictive Task Scheduling**: Analyzes task completion patterns to generate AI-powered scheduling suggestions.
- **Omi Enhanced Features**: Includes Daily Digest for conversation summaries, Action Item Extraction from transcripts, Meeting Intelligence for multi-speaker conversations, Conversation Search over lifelogs, and Analytics & Pattern Detection.
- **Knowledge Graph System**: Unified graph database interconnecting all data domains (memories, tasks, calendar, contacts, locations, lifelogs) for multi-hop reasoning, temporal awareness, and anticipatory intelligence, with a dedicated Explorer UI.

## External Dependencies
- **OpenAI API**: AI responses, agent logic, and text embeddings.
- **Twilio**: SMS messaging.
- **better-sqlite3**: Node.js SQLite client.
- **Perplexity API**: Enhanced AI-powered web search.
- **Google Calendar API**: Calendar integration.
- **OpenWeatherMap API**: Weather data.
- **DuckDuckGo API**: Fallback web search.
- **Omi API**: Accessing lifelogs from the Omi pendant.

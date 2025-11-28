# Project: ZEKE – Nate's Personal AI Assistant

## Purpose
ZEKE is a single-user personal assistant for Nate Johnson. It is not multi-tenant, not a SaaS app. It should be optimized for:
- High quality long-term memory.
- Access over SMS and a simple web UI.
- Respectful, precise, non-fluffy communication.

## Tech Stack
- Backend: Node.js + TypeScript (Express)
- DB: SQLite for persistent storage
- External services: OpenAI API, Twilio (SMS)
- Frontend: React with Tailwind CSS

## Memory Model
- Single user (Nate) with a persistent profile.
- Store all long-term memory in the database plus `zeke_profile.md` and `zeke_knowledge.md`.
- Never delete memory without explicit instruction.
- Summarize long conversation history into concise notes and store them.

## Project Structure
- `/client` - React frontend with chat UI
- `/server` - Express backend with API routes
- `/shared` - Shared types and schemas
- `zeke_profile.md` - Nate's core profile
- `zeke_knowledge.md` - Accumulated knowledge base

## Key Files
- `server/routes.ts` - API endpoints for chat, conversations, memory
- `server/storage.ts` - SQLite database operations
- `server/agent.ts` - OpenAI agent logic
- `client/src/pages/chat.tsx` - Main chat interface

## API Endpoints
- POST /api/chat - Send message and get AI response
- GET /api/conversations - List all conversations
- GET /api/conversations/:id - Get conversation with messages
- DELETE /api/conversations/:id - Delete a conversation
- POST /api/twilio/webhook - Twilio SMS webhook
- GET /api/memory - Get memory notes
- POST /api/memory - Add memory note

## Environment Variables Required
- OPENAI_API_KEY - OpenAI API key
- TWILIO_ACCOUNT_SID - Twilio account SID (optional)
- TWILIO_AUTH_TOKEN - Twilio auth token (optional)
- TWILIO_PHONE_NUMBER - Twilio phone number (optional)

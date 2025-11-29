# Project: ZEKE – Nate's Personal AI Assistant

## Purpose
ZEKE is a single-user personal assistant for Nate Johnson. It is not multi-tenant, not a SaaS app. It should be optimized for:
- High quality long-term memory.
- Access over SMS and a simple web UI.
- Respectful, precise, non-fluffy communication.

## Tech Stack
- Backend: Node.js + TypeScript (Express)
- DB: SQLite (better-sqlite3) for persistent storage
- External services: OpenAI API (gpt-5.1), Twilio (SMS)
- Frontend: React with Tailwind CSS, shadcn/ui components

## Memory Model
- Single user (Nate) with a persistent profile.
- Store all long-term memory in the database plus `zeke_profile.md` and `zeke_knowledge.md`.
- Never delete memory without explicit instruction.
- Summarize long conversation history into concise notes and store them.
- Agent automatically extracts facts, preferences, and summaries from conversations.

### Semantic Memory System (State-of-the-Art 2025)
- **Vector Embeddings**: All memories are stored with OpenAI text-embedding-3-small embeddings for semantic search
- **Importance Scoring**: Memories are ranked by three metrics:
  - Recency (20%): How recently the memory was updated
  - Relevance (60%): Semantic similarity to current query (cosine similarity)
  - Importance (20%): Type-based importance (facts > preferences > notes > summaries)
- **Automatic Deduplication**: New memories are checked against existing ones using 92% similarity threshold
- **Semantic Retrieval**: `getSmartMemoryContext()` retrieves the most relevant memories based on meaning, not keywords
- **Graceful Fallback**: If semantic search fails, system falls back to basic keyword search
- **Key Files**:
  - `/server/embeddings.ts` - Embedding generation and cosine similarity
  - `/server/semanticMemory.ts` - Semantic search and smart context retrieval
  - `/script/backfill-embeddings.ts` - Script to backfill embeddings for existing memories

## Project Structure
- `/client` - React frontend with chat UI
  - `/client/src/pages/chat.tsx` - Main chat interface with redesigned sidebar
  - `/client/src/pages/grocery.tsx` - Collaborative grocery list
  - `/client/src/pages/memory.tsx` - View ZEKE's memories and knowledge
  - `/client/src/App.tsx` - App root with routing
- `/server` - Express backend with API routes
  - `/server/routes.ts` - API endpoints for chat, conversations, memory, grocery
  - `/server/db.ts` - SQLite database operations
  - `/server/agent.ts` - OpenAI agent logic with memory extraction and tool calling
  - `/server/tools.ts` - Tool definitions and execution for OpenAI function calling
  - `/server/dailyCheckIn.ts` - Daily check-in scheduler with question generation
  - `/server/gettingToKnow.ts` - Getting To Know You conversation mode logic
- `/shared` - Shared types and schemas
  - `/shared/schema.ts` - Drizzle schema definitions (includes groceryItems)
- `/notes` - User notes directory (writable by ZEKE file tools)
- `/data` - Data storage directory (writable by ZEKE file tools)
- `zeke_profile.md` - Nate's core profile (loaded as agent context)
- `zeke_knowledge.md` - Accumulated knowledge base (loaded as agent context)

## ZEKE Tools (OpenAI Function Calling)
ZEKE has access to these tools via OpenAI function calling:
- **send_sms** - Send SMS text message to any phone number (requires Twilio configuration)
- **configure_daily_checkin** - Set up daily check-in texts with 3 multiple choice questions to learn about Nate
- **get_daily_checkin_status** - Check if daily check-in is active and get settings
- **stop_daily_checkin** - Stop the daily check-in texts
- **send_checkin_now** - Send a check-in immediately (for testing)
- **set_reminder** - Schedule reminders with delay_minutes or scheduled_time, can send SMS
- **list_reminders** - List all pending reminders
- **cancel_reminder** - Cancel a reminder by ID
- **web_search** - Search the web using DuckDuckGo API
- **read_file** - Read files from notes/, data/, or config files (secure path validation)
- **write_file** - Write files to notes/ or data/ directories (secure path validation)
- **list_files** - List files in allowed directories
- **get_current_time** - Get current date/time in America/New_York timezone
- **add_grocery_item** - Add item to shared grocery list (supports name, quantity, category, addedBy)
- **list_grocery_items** - List all grocery items (to buy and purchased)
- **mark_grocery_purchased** - Toggle item purchased status (partial name match)
- **remove_grocery_item** - Remove item from grocery list (partial name match)
- **clear_purchased_groceries** - Clear all purchased items from list

Security: File tools have directory traversal protection using path.normalize() and path.resolve() with strict whitelist validation.

## Database Schema (SQLite)
- `conversations` - Chat sessions with title, source (web/sms), phoneNumber, mode (null or "getting_to_know")
- `messages` - Individual messages with role (user/assistant) and content
- `memory_notes` - Extracted memories (facts, preferences, summaries, notes) with supersession support (isSuperseded, supersededBy) and embedding column for semantic search
- `preferences` - Key-value preferences for Nate
- `grocery_items` - Shared grocery list (id, name, quantity, category, purchased, addedBy)

## API Endpoints
- POST /api/chat - Send message and get AI response
- GET /api/conversations - List all conversations
- GET /api/conversations/:id - Get conversation with messages
- DELETE /api/conversations/:id - Delete a conversation
- POST /api/conversations/getting-to-know - Start a "Getting To Know You" onboarding conversation
- POST /api/twilio/webhook - Twilio SMS webhook (TwiML response)
- GET /api/memory - Get memory notes
- POST /api/memory - Add memory note
- DELETE /api/memory/:id - Delete memory note
- GET /api/preferences - Get all preferences
- POST /api/preferences - Set a preference
- GET /api/grocery - List all grocery items
- POST /api/grocery - Add a grocery item
- PATCH /api/grocery/:id - Update item (toggle purchased, change quantity)
- DELETE /api/grocery/:id - Delete a grocery item
- DELETE /api/grocery - Clear all purchased items

## Design System
- Dark theme with coral red accent: hsl(9, 75%, 61%)
- Background: hsl(20, 14%, 4%)
- Text: hsl(45, 25%, 91%)
- Font: Poppins
- ChatGPT-style interface with sidebar and message bubbles

## Environment Variables Required
- OPENAI_API_KEY - OpenAI API key (required for AI responses)
- TWILIO_ACCOUNT_SID - Twilio account SID (optional, for SMS)
- TWILIO_AUTH_TOKEN - Twilio auth token (optional, for SMS)
- TWILIO_PHONE_NUMBER - Twilio phone number (optional, for SMS)

## Recent Changes
- 2025-11-29: **Semantic Memory System Upgrade** - Implemented state-of-the-art AI memory architecture with:
  - Vector embeddings using OpenAI text-embedding-3-small for all memories
  - Semantic search with importance scoring (recency/relevance/importance)
  - Automatic memory deduplication (92% similarity threshold)
  - Smart context retrieval prioritizing relevant memories over recent ones
  - Graceful fallback to keyword search if semantic search fails
  - All conversation titles and memories are now always generated in English
- 2025-11-29: Redesigned chat sidebar - cleaner UI with ZEKE branding, main actions (Getting To Know You, Grocery List, Memory), collapsible Chat History section, and profile at bottom
- 2025-11-29: Added Memory page (/memory) - view all of ZEKE's memories with stats, type filters, and supersession tracking
- 2025-11-29: Added Daily Check-In feature - ZEKE texts Nate once per day with 3 multiple choice questions to deeply understand him and his family
- 2025-11-29: Added "Getting To Know You" feature - ZEKE proactively asks questions to learn about Nate and handles memory corrections (e.g., "My brother's name is Nick, not Kyle")
- 2025-11-29: Memory supersession system - when correcting information, old memories are marked as superseded rather than deleted, preserving history
- 2025-11-29: Fixed SMS reminder system - reminders now persist to SQLite database and survive server restarts
- 2025-11-29: ZEKE now automatically includes phone number when setting reminders via SMS, ensuring reminders are delivered as text messages
- 2025-11-29: Improved ZEKE's proactive behavior - now uses web search automatically when asked for information (phone numbers, addresses, etc.) and shares what it finds instead of deflecting to users
- 2025-11-29: Enhanced web search with multi-strategy approach (DuckDuckGo Instant Answer + HTML search fallback) for better results
- 2025-11-29: Added collaborative grocery list feature for Nate, ZEKE, and Shakita with categories, quantities, and purchased status tracking
- 2025-11-29: Added tool calling system (reminders, web search, file access, time queries) with security hardening
- 2025-11-28: Initial implementation of ZEKE with full chat UI, SQLite storage, OpenAI agent, and Twilio webhook

## ZEKE Behavior Guidelines
ZEKE is configured to be ACTION-ORIENTED, not a suggestion machine:
- Always uses tools (especially web_search) when asked for information
- Shares what was found (URLs, partial info) instead of deflecting
- Never tells users to "check the website themselves" or "search for it"
- Provides actionable results even when exact info isn't found

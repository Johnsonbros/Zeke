# ZEKE Ecosystem Architecture

This document explains how the ZEKE AI Companion mobile app (this repository) connects to and interacts with the main ZEKE backend application.

## Related Repositories

| Repository | Description | URL |
|------------|-------------|-----|
| **ZekeAssistant** (this repo) | Mobile companion app (Expo/React Native) | https://github.com/Johnsonbros/ZekeAssistant |
| **Zeke** | Main ZEKE backend & web application | https://github.com/Johnsonbros/Zeke |

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ZEKE Ecosystem                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────┐         ┌────────────────────────────────────┐  │
│  │   ZekeAssistant        │         │   Zeke (Main Backend)              │  │
│  │   (This Repository)    │         │   github.com/Johnsonbros/Zeke      │  │
│  │                        │         │                                    │  │
│  │  ┌──────────────────┐  │         │  ┌─────────────────────────────┐  │  │
│  │  │ Expo Mobile App  │  │         │  │ Express + Vite Web App      │  │  │
│  │  │ (React Native)   │  │         │  │                             │  │  │
│  │  │                  │  │  HTTPS  │  │ - PostgreSQL Database       │  │  │
│  │  │ - Home/Dashboard │◄─┼─────────┼──┤ - AI Processing (OpenAI)    │  │  │
│  │  │ - Calendar       │  │         │  │ - Google Calendar API       │  │  │
│  │  │ - Tasks/Grocery  │──┼─────────┼─►│ - Memory Storage            │  │  │
│  │  │ - Communications │  │         │  │ - Contacts Management       │  │  │
│  │  │ - Memories       │  │         │  │ - Lists & Tasks             │  │  │
│  │  │ - Geo/Location   │  │         │  │ - Location History          │  │  │
│  │  └──────────────────┘  │         │  └─────────────────────────────┘  │  │
│  │           │            │         │              │                    │  │
│  │  ┌────────▼─────────┐  │         │  ┌───────────▼─────────────────┐  │  │
│  │  │ Express Proxy    │  │         │  │ Python Agents (Optional)    │  │  │
│  │  │ Server (Port 5000)│  │         │  │ - AI agents on port 5001    │  │  │
│  │  │                  │  │         │  │ - Advanced AI processing    │  │  │
│  │  │ - HMAC Signing   │  │         │  └─────────────────────────────┘  │  │
│  │  │ - Header Forward │  │         │                                    │  │
│  │  │ - Twilio (local) │  │         │                                    │  │
│  │  │ - Deepgram Proxy │  │         │                                    │  │
│  │  └──────────────────┘  │         │                                    │  │
│  └────────────────────────┘         └────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## How They Connect

### 1. Proxy Architecture

The mobile companion app does NOT directly call the main ZEKE backend. Instead, it goes through a local Express proxy server that:

1. **Forwards authentication headers** - Passes cookies, authorization tokens, and device tokens
2. **Signs requests with HMAC** - Adds security headers for request verification
3. **Logs all communication** - Maintains audit trail of all backend calls
4. **Handles CORS** - Bypasses browser CORS restrictions

**Flow:**
```
Mobile App → Local Express Proxy (port 5000) → ZEKE Backend (zekeai.replit.app)
```

### 2. Key Files for Understanding the Connection

#### In ZekeAssistant (this repo):

| File | Purpose |
|------|---------|
| `server/zeke-proxy.ts` | Proxy routes that forward requests to ZEKE backend |
| `server/zeke-security.ts` | HMAC signing and request verification |
| `client/lib/query-client.ts` | Client-side API configuration and auth headers |

#### In Zeke (main backend):

| File | Purpose |
|------|---------|
| `server/routes.ts` | API endpoints that receive proxied requests |
| `shared/schema.ts` | Database schema (Drizzle ORM) |
| `server/storage.ts` | Data persistence layer |

### 3. API Endpoints Mapping

The mobile app calls `/api/zeke/*` routes on its local server, which proxy to the main backend:

| Mobile App Route | Proxied To (ZEKE Backend) |
|------------------|---------------------------|
| `/api/zeke/tasks` | `/api/tasks` |
| `/api/zeke/grocery` | `/api/grocery` |
| `/api/zeke/lists` | `/api/lists` |
| `/api/zeke/contacts` | `/api/contacts` |
| `/api/zeke/memories` | `/api/memories` |
| `/api/zeke/calendar/*` | `/api/calendar/*` |
| `/api/zeke/location/*` | `/api/location-history/*` |
| `/api/zeke/chat` | `/api/chat` |
| `/api/conversations/*` | `/api/conversations/*` |

### 4. Authentication Flow

```
┌──────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Mobile App   │    │ Local Proxy     │    │ ZEKE Backend    │
└──────┬───────┘    └────────┬────────┘    └────────┬────────┘
       │                     │                      │
       │  1. Request with    │                      │
       │  device token       │                      │
       ├────────────────────►│                      │
       │                     │                      │
       │                     │  2. Add HMAC headers │
       │                     │  X-Zeke-Proxy-Id     │
       │                     │  X-ZEKE-Timestamp    │
       │                     │  X-ZEKE-Nonce        │
       │                     │  X-ZEKE-Signature    │
       │                     ├─────────────────────►│
       │                     │                      │
       │                     │  3. Verify signature │
       │                     │  Process request     │
       │                     │◄─────────────────────┤
       │                     │                      │
       │  4. Response        │                      │
       │◄────────────────────┤                      │
       │                     │                      │
```

**Headers forwarded from client:**
- `cookie` - Session cookies
- `authorization` - Bearer tokens
- `x-api-key` - API keys
- `x-user-id` - User identifier
- `x-session-id` - Session identifier
- `x-zeke-device-token` - Mobile device authentication token

### 5. Environment Variables

#### ZekeAssistant (this repo):

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_ZEKE_BACKEND_URL` | URL of the main ZEKE backend (default: `https://zekeai.replit.app`) |
| `ZEKE_SHARED_SECRET` | HMAC secret for signing requests (must match backend) |
| `ZEKE_PROXY_ID` | Identifier for this proxy instance |

#### Zeke (main backend):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing key |
| `OPENAI_API_KEY` | For AI processing |
| `ZEKE_SHARED_SECRET` | Must match the mobile proxy secret |

### 6. Database

The **main ZEKE backend** owns the PostgreSQL database. The mobile companion app:
- Does NOT have its own database for synced data
- Uses `AsyncStorage` only for local caching/preferences
- All persistent data flows through the proxy to the main backend

**Database location:** ZEKE main backend (PostgreSQL via Drizzle ORM)

### 7. Independent Integrations

Some integrations are handled directly by the mobile companion's local Express server:

| Integration | Handler | Notes |
|-------------|---------|-------|
| **Twilio SMS/Voice** | Local Express | Uses Replit connector |
| **Google Calendar** | Local Express | Uses Replit connector |
| **Deepgram Transcription** | WebSocket proxy | Real-time audio streaming |

These do NOT go through the main ZEKE backend proxy.

## Development Setup

### Running the Projects

**Option A: Use the deployed ZEKE backend (Recommended for mobile development)**

```bash
# In ZekeAssistant (this repo)
# The default EXPO_PUBLIC_ZEKE_BACKEND_URL points to https://zekeai.replit.app
npm run all:dev
# Express proxy on port 5000, Expo on port 8081
```

This connects to the live ZEKE backend - no need to run the backend locally.

**Option B: Run backend locally for full-stack development**

```bash
# Terminal 1: Start ZEKE main backend (different port or machine)
# In the Zeke repository on Replit or a different port
npm run dev
# Runs on port 5000

# Terminal 2: Configure ZekeAssistant to use local backend
# Set EXPO_PUBLIC_ZEKE_BACKEND_URL=http://localhost:5000 (or your backend URL)
# Then start the mobile app
npm run all:dev
```

**Note:** Both projects use port 5000 by default. When developing locally, either:
- Run the ZEKE backend on Replit and point ZekeAssistant to it
- Or modify one project to use a different port

## For AI Assistants

When helping improve the ZEKE ecosystem:

1. **For mobile UI/UX changes:** Work in `ZekeAssistant` → `client/` directory
2. **For API changes:** Work in `Zeke` → `server/routes.ts`
3. **For database schema:** Work in `Zeke` → `shared/schema.ts`
4. **For proxy behavior:** Work in `ZekeAssistant` → `server/zeke-proxy.ts`
5. **For security/auth:** Coordinate changes in both repos' security files

### API Contract

Both projects share implicit API contracts. When modifying endpoints:
1. Update the route in `Zeke/server/routes.ts`
2. Update the proxy route in `ZekeAssistant/server/zeke-proxy.ts`
3. Update any client-side API calls in `ZekeAssistant/client/`

### Shared Types

Currently, types are defined separately in each project. Consider:
- `ZekeAssistant/shared/schema.ts` - Mobile app types
- `Zeke/shared/schema.ts` - Backend types

These should be kept in sync manually for now.

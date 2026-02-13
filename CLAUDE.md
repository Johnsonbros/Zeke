# CLAUDE.md - AI Assistant Guide for ZEKE

> **Last Updated:** 2026-01-03
>
> This document provides comprehensive guidance for AI assistants (like Claude) working on the ZEKE AI Personal Assistant codebase. It covers architecture, conventions, workflows, and best practices to ensure consistent, high-quality contributions.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Repository Structure](#repository-structure)
3. [Development Environment Setup](#development-environment-setup)
4. [Key Architectural Patterns](#key-architectural-patterns)
5. [Code Conventions & Style Guide](#code-conventions--style-guide)
6. [Common Tasks & Workflows](#common-tasks--workflows)
7. [Testing Guidelines](#testing-guidelines)
8. [Git Development Branch Requirements](#git-development-branch-requirements)
9. [AI Assistant Best Practices](#ai-assistant-best-practices)
10. [Quick Reference](#quick-reference)

---

## Project Overview

### What is ZEKE?

ZEKE is a **single-user personal AI assistant** designed for Nate Johnson (CEO, Johnson Bros. Plumbing & Drain Cleaning). It provides high-quality, long-term memory and accessible interaction via SMS, web UI, voice, and mobile app with action-oriented, proactive assistance.

### Technology Stack

**Frontend (Web):**
- React 18.3.1 + Vite 5.4.20
- TypeScript (strict mode)
- Tailwind CSS 3.4.17 + shadcn/ui
- TanStack React Query v5
- Wouter (routing)

**Backend (Server):**
- Node.js 20.11.x + Express 4.21.2
- TypeScript (ESNext modules)
- PostgreSQL with Drizzle ORM 0.39.1
- WebSocket (ws 8.18.0)
- OpenAI GPT-4o integration

**Python Agent System:**
- Python 3.11+ (FastAPI microservice)
- OpenAI Agents SDK 0.6.1
- Specialist agents (8 total) with Conductor routing
- Port 5001 (internal communication with Node.js)

**Mobile App (Android):**
- Located in `/android` subdirectory
- React Native + Expo
- Has its own CLAUDE.md (`/android/CLAUDE.md`)

**Database:**
- PostgreSQL (production) via Neon
- SQLite (development/testing) via better-sqlite3
- Drizzle ORM for schema + migrations

**External Services:**
- OpenAI (GPT-4o, embeddings)
- Twilio (SMS/Voice)
- Perplexity (web search)
- Google Calendar API
- OpenWeatherMap API
- Omi API (wearable pendant lifelogs)

### Design Principles

1. **Action-Oriented**: Execute tasks rather than just suggesting
2. **Memory-First**: Use long-term memory for personalized assistance
3. **Cross-Platform Continuity**: SMS, web, voice, and mobile feel like the same assistant
4. **Graceful Degradation**: Continue with reduced functionality when components fail
5. **User-First**: Never tell users to "check themselves" - provide answers

---

## Repository Structure

```
Zeke/
├── client/src/              # React frontend (Vite + TypeScript)
│   ├── components/          # UI components (shadcn/ui based)
│   │   ├── ui/              # Base UI components
│   │   ├── map/             # Map components (Leaflet/Google)
│   │   └── ...
│   ├── pages/               # Route components
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Utilities (queryClient, utils)
│   └── App.tsx              # Main app component
│
├── server/                  # Express backend (TypeScript)
│   ├── index.ts             # Server entry point
│   ├── routes.ts            # Main API routes
│   ├── agent.ts             # OpenAI chat integration
│   ├── capabilities/        # Tool modules (search, memory, calendar, etc.)
│   │   ├── automations.ts
│   │   ├── calendar.ts
│   │   ├── communication.ts
│   │   ├── documents.ts
│   │   ├── files.ts
│   │   ├── grocery.ts
│   │   ├── knowledgeGraph.ts
│   │   ├── lists.ts
│   │   └── ...
│   ├── jobs/                # Background jobs (cron, schedulers)
│   ├── services/            # Business logic services
│   ├── src/db/              # Database utilities
│   └── __tests__/           # Server tests
│
├── shared/                  # Shared TypeScript types
│   ├── schema.ts            # Drizzle schema + Zod validators
│   └── models/              # Shared data models
│
├── python_agents/           # Python FastAPI microservice
│   ├── main.py              # FastAPI app entry point
│   ├── agents/              # Specialist agents (8 agents)
│   │   ├── conductor.py     # Routing agent
│   │   ├── memory_curator.py
│   │   ├── comms_pilot.py
│   │   ├── ops_planner.py
│   │   ├── research_scout.py
│   │   ├── safety_auditor.py
│   │   ├── omi_analyst.py
│   │   └── foresight_strategist.py
│   ├── bridge.py            # Node.js ↔ Python bridge
│   ├── intent_router.py     # Intent classification
│   ├── tracing.py           # Agent tracing
│   └── tests/               # Python tests
│
├── core/                    # Core Python modules
│   └── memory/              # Long-term memory system
│
├── eval/                    # Evaluation harness
│   ├── runner.py            # Eval runner
│   ├── openai_evals.py      # OpenAI evals integration
│   ├── conftest.py          # Pytest config
│   ├── tests/               # Eval test cases
│   └── golden/              # Golden outputs
│
├── android/                 # React Native mobile app (separate project)
│   ├── CLAUDE.md            # Mobile app AI guide
│   ├── client/              # React Native code
│   ├── server/              # Mobile backend proxy
│   └── ...
│
├── zeke_trader/             # Trading agent (separate module)
│
├── docs/                    # Documentation
│   ├── AGENTS.md            # Agent system docs
│   ├── DEVELOPMENT.md       # Development guidelines
│   ├── MEMORY.md            # Memory system docs
│   ├── TOOLS.md             # Tool definitions
│   └── ...
│
├── scripts/                 # Utility scripts
├── tests/                   # Additional tests
├── attached_assets/         # User-uploaded files
├── temp_audio/              # Temporary audio files
│
├── package.json             # Node.js dependencies
├── pyproject.toml           # Python dependencies
├── tsconfig.json            # TypeScript config
├── drizzle.config.ts        # Database config
├── vite.config.ts           # Vite config
├── tailwind.config.ts       # Tailwind config
├── .env.schema              # Environment variables schema
└── CLAUDE.md                # This file
```

### Key Path Aliases

TypeScript is configured with these path aliases (`tsconfig.json`):

```typescript
"@/*"              → "./client/src/*"     // Client code
"@shared/*"        → "./shared/*"          // Shared schema/types
"@shared-models"   → "./shared/models/index.ts"
"@shared-models/*" → "./shared/models/*"
```

**Usage:**
```typescript
import { Button } from '@/components/ui/button';
import { conversations, messages } from '@shared/schema';
import type { User } from '@shared-models';
```

---

## Development Environment Setup

### Prerequisites

**Required Runtimes** (versions pinned in `.tool-versions`):
- **Node.js**: 20.11.x (enforced in `package.json` engines)
- **Python**: 3.11+
- **PostgreSQL**: For production (or SQLite for local dev)

### Installation

```bash
# Node.js dependencies
npm install

# Python dependencies (uses pyproject.toml + uv)
pip install .
# or with uv:
uv pip install .
```

### Environment Variables

Create a `.env` file at the project root. Use `.env.schema` as reference.

**Required variables:**

```bash
# Core
OPENAI_API_KEY=sk-...                      # OpenAI API key (required)
DATABASE_URL=postgresql://...              # PostgreSQL connection string (required)
JWT_SECRET=your-secret-key                 # JWT signing key (required)

# Application
APP_NAME=ZEKE                              # Application name (default: ZEKE)
APP_ENV=development                        # development|staging|production
NODE_ENV=development                       # Node environment
PORT=5000                                  # Server port (default: 5000)
LOG_LEVEL=info                             # debug|info|warn|error

# Python Agents
PYTHON_AGENTS_PORT=5001                    # Python FastAPI port (default: 5001)

# External Services (optional)
TWILIO_ACCOUNT_SID=...                     # Twilio SMS/Voice
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
MASTER_ADMIN_PHONE=...                     # Admin phone for notifications

OMI_API_KEY=...                            # Omi pendant API key
GOOGLE_CALENDAR_CREDENTIALS=...            # Google service account JSON
GOOGLE_CALENDAR_ID=...
OPENWEATHERMAP_API_KEY=...
PERPLEXITY_API_KEY=...                     # Perplexity search

# Security
INTERNAL_BRIDGE_KEY=...                    # Python ↔ Node.js bridge key
EXPORT_SECRET_TOKEN=...                    # Secure data export
SESSION_SECRET=...                         # Express session secret
```

### Database Setup

```bash
# Initialize database
npm run db:init

# Apply Drizzle migrations
npm run db:push

# Seed database (optional)
npm run db:seed
```

### Running the Application

**Development (All Services):**
```bash
npm run dev
# Starts: Express server (port 5000) + Vite dev server (embedded)
```

**Python Agents (separate terminal):**
```bash
cd python_agents
uv run uvicorn main:app --reload --port 5001
```

**Individual Services:**
```bash
# Server only (production mode)
npm run build
npm start

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:bidi  # Bidi character check
```

**Mobile App (Android):**
```bash
cd android
npm install
npm run all:dev
# See android/CLAUDE.md for details
```

---

## Key Architectural Patterns

### 1. Multi-Agent System (Python)

ZEKE uses a **Conductor + Specialist** agent pattern implemented in Python with the OpenAI Agents SDK.

**Agent Hierarchy:**

```
┌─────────────────────────────────────────────────┐
│                  Conductor                      │
│  (Routes user messages to specialists)          │
└──────────────────┬──────────────────────────────┘
                   │
      ┌────────────┴────────────┐
      │                         │
      ▼                         ▼
┌─────────────┐           ┌─────────────┐
│ Memory      │           │ Comms Pilot │
│ Curator     │           │ (SMS/Voice) │
└─────────────┘           └─────────────┘
      │                         │
      ▼                         ▼
┌─────────────┐           ┌─────────────┐
│ Ops Planner │           │ Research    │
│ (Tasks/Cal) │           │ Scout       │
└─────────────┘           └─────────────┘
      │                         │
      ▼                         ▼
┌─────────────┐           ┌─────────────┐
│ Safety      │           │ Omi Analyst │
│ Auditor     │           │ (Lifelogs)  │
└─────────────┘           └─────────────┘
      │
      ▼
┌─────────────┐
│ Foresight   │
│ Strategist  │
└─────────────┘
```

**8 Specialist Agents:**

| Agent | Role | Key Capabilities |
|-------|------|------------------|
| **Conductor** | Routing agent | Intent classification, specialist delegation |
| **Memory Curator** | Memory management | Store/recall memories, manage memory lifecycle |
| **Comms Pilot** | Communication | SMS, email, voice calls |
| **Ops Planner** | Task/calendar | Create tasks, schedule events, manage calendar |
| **Research Scout** | Information gathering | Web search (Perplexity), fact-finding |
| **Safety Auditor** | Security/safety | Input validation, safety checks |
| **Omi Analyst** | Lifelog processing | Analyze Omi pendant transcripts |
| **Foresight Strategist** | Predictive planning | Anticipate needs, proactive suggestions |

**Communication Flow:**

```
User Message (SMS/Web)
        ↓
Node.js Express Server
        ↓
POST /api/agents/chat → Python FastAPI (port 5001)
        ↓
Conductor Agent (intent routing)
        ↓
Specialist Agent (executes tools via bridge)
        ↓
Node.js Bridge Endpoint (executes actual operations)
        ↓
Response → Python → Node.js → User
```

**Key Files:**
- `python_agents/main.py` - FastAPI app entry point
- `python_agents/agents/conductor.py` - Routing logic
- `python_agents/bridge.py` - Python ↔ Node.js bridge
- `python_agents/intent_router.py` - Intent classification
- `server/python-agents.ts` - Node.js integration

### 2. Tool System (Capabilities)

ZEKE uses **function calling** with OpenAI models. Tools are defined in `server/capabilities/`.

**Tool Definition Pattern:**

```typescript
// server/capabilities/myCapability.ts
import type { OpenAI } from "openai";

export const myToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "tool_name",
      description: "What the tool does",
      parameters: {
        type: "object",
        properties: {
          param1: { type: "string", description: "..." },
          param2: { type: "number", description: "..." },
        },
        required: ["param1"],
      },
    },
  },
];

export const myToolPermissions: Record<string, (p: ToolPermissions) => boolean> = {
  tool_name: () => true, // or conditional based on context
};

export async function executeMyTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string | null> {
  switch (toolName) {
    case "tool_name": {
      const { param1, param2 } = args;
      // Implementation...
      return JSON.stringify({ success: true, data: result });
    }
    default:
      return null;
  }
}

export const myToolNames = ["tool_name"];
```

**Tool Registration:**

All tools are aggregated in `server/capabilities/index.ts`:

```typescript
import { myToolDefinitions, myToolPermissions, executeMyTool } from './myCapability';

export const allToolDefinitions = [
  ...calendarToolDefinitions,
  ...communicationToolDefinitions,
  ...myToolDefinitions,
  // ...
];

export const allToolPermissions = {
  ...calendarToolPermissions,
  ...communicationToolPermissions,
  ...myToolPermissions,
};

export async function executeAnyTool(toolName: string, args: Record<string, unknown>): Promise<string | null> {
  return await executeCalendarTool(toolName, args) ||
         await executeCommunicationTool(toolName, args) ||
         await executeMyTool(toolName, args) ||
         null;
}
```

**Available Capability Modules:**
- `automations.ts` - Automation management
- `calendar.ts` - Google Calendar integration
- `codebase.ts` - Code analysis tools
- `communication.ts` - SMS, email, calls
- `documents.ts` - Document management
- `files.ts` - File operations
- `food.ts` - Food preferences, recipes
- `grocery.ts` - Grocery list management
- `knowledgeGraph.ts` - Knowledge graph operations
- `lists.ts` - List management
- `location.ts` - Location tracking, geofencing
- `memory.ts` - Memory operations
- `notes.ts` - Note taking
- `search.ts` - Web search (Perplexity)
- `tasks.ts` - Task management
- `weather.ts` - Weather information

### 3. Memory System

ZEKE implements a **long-term memory system** with semantic search and confidence scoring.

**Memory Schema:**

```typescript
// shared/schema.ts
export const memoryNotes = pgTable("memory_notes", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["summary", "note", "preference", "fact"] }),
  content: text("content").notNull(),
  context: text("context"),
  embedding: text("embedding"),  // Vector embedding for semantic search

  // Confidence & usage tracking
  confidenceScore: text("confidence_score").default("0.8"),
  confirmationCount: integer("confirmation_count").default(0),
  usageCount: integer("usage_count").default(0),
  lastUsedAt: text("last_used_at"),

  // TTL (Time-To-Live) system
  scope: text("scope", { enum: ["transient", "session", "long_term"] }),
  expiresAt: text("expires_at"),  // Auto-expire transient memories

  // Metadata
  sourceType: text("source_type", { enum: ["conversation", "lifelog", "manual", "observation"] }),
  sourceId: text("source_id"),
  placeId: text("place_id"),      // Link to location
  contactId: text("contact_id"),  // Link to person

  isActive: boolean("is_active").default(true),
  isSuperseded: boolean("is_superseded").default(false),
  supersededBy: text("superseded_by"),

  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
});
```

**Memory Scopes (TTL):**
- **transient**: 36 hours (e.g., "heading to the store now")
- **session**: 7 days (e.g., "working on project X this week")
- **long_term**: Permanent (e.g., "prefers brief responses")

**Usage in Python:**

```python
from core.memory import remember, recall
from core.memory.schemas import MemoryScope

# Store a memory
await remember(
    text="User prefers brief responses",
    scope=MemoryScope.persona("preferences"),
    tags=["communication", "style"],
)

# Retrieve memories
memories = await recall(
    query="communication preferences",
    scope="persona:*",  # Wildcard scope filter
    k=5,
    min_score=0.3,
)
```

**Usage in Node.js:**

Memory operations are typically called through the agent system or capability tools.

### 4. Database (Drizzle ORM)

**Schema Definition:**

All database tables are defined in `shared/schema.ts` using Drizzle ORM.

**Pattern:**

```typescript
// Define table
export const myTable = pgTable("my_table", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  count: integer("count").default(0),
  createdAt: text("created_at").notNull(),
});

// Zod validation schema (auto-generated from Drizzle)
export const insertMyTableSchema = createInsertSchema(myTable).omit({
  id: true,
  createdAt: true,
});

// TypeScript types
export type MyTable = typeof myTable.$inferSelect;
export type InsertMyTable = z.infer<typeof insertMyTableSchema>;
```

**Database Operations:**

```typescript
import { db } from './db';
import { myTable } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Select
const items = await db.select().from(myTable);

// Insert
const [newItem] = await db.insert(myTable).values({
  name: 'Example',
  count: 5,
}).returning();

// Update
await db.update(myTable)
  .set({ count: 10 })
  .where(eq(myTable.id, itemId));

// Delete
await db.delete(myTable).where(eq(myTable.id, itemId));
```

**Migrations:**

```bash
# Push schema changes to database
npm run db:push

# Generate migration (manual)
npx drizzle-kit generate:pg
npx drizzle-kit push:pg
```

### 5. API Routes

**Main API Routes** (`server/routes.ts`):

All Express routes are registered in `server/routes.ts`. The file exports a `registerRoutes(app)` function.

**Pattern:**

```typescript
export function registerRoutes(app: Express) {
  // GET endpoint
  app.get('/api/resource', async (req, res) => {
    try {
      const data = await db.select().from(resourceTable);
      res.json(data);
    } catch (error) {
      console.error('Error fetching resource:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST endpoint
  app.post('/api/resource', async (req, res) => {
    try {
      const { name, value } = req.body;
      const [created] = await db.insert(resourceTable)
        .values({ name, value })
        .returning();
      res.json(created);
    } catch (error) {
      console.error('Error creating resource:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
```

**Frontend API Calls:**

```typescript
// Using TanStack Query
const { data, isLoading } = useQuery({
  queryKey: ['/api/resource'],
  queryFn: () => fetch('/api/resource').then(r => r.json()),
});

// Mutation
const mutation = useMutation({
  mutationFn: (newResource) =>
    fetch('/api/resource', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newResource),
    }).then(r => r.json()),
});
```

### 6. Background Jobs

ZEKE runs several **cron-based background jobs** defined in `server/jobs/`:

| Job | File | Schedule | Purpose |
|-----|------|----------|---------|
| Grocery Auto-Clear | `groceryAutoClear.ts` | Daily | Clear old grocery items |
| Conversation Summarizer | `conversationSummarizer.ts` | Hourly | Summarize long conversations |
| Daily Summary | `dailySummaryAgent.ts` | End of day | Generate daily summary |
| Nightly Enrichment | `nightlyEnrichment.ts` | Nightly | Enrich memories overnight |
| Morning Briefing | `morningBriefingScheduler.ts` | Morning | Send morning briefing SMS |
| Omi Processor | `omiProcessor.ts` | Continuous | Process Omi pendant lifelogs |
| Knowledge Graph Backfill | `knowledgeGraphBackfill.ts` | Periodic | Populate knowledge graph |

Jobs are initialized in `server/index.ts` on startup.

---

## Code Conventions & Style Guide

### TypeScript Guidelines

**1. Strict Mode:** Always enabled (`tsconfig.json`)

```typescript
// ✅ GOOD - Explicit types
interface TaskProps {
  id: string;
  title: string;
  completed: boolean;
}

function TaskItem({ id, title, completed }: TaskProps) {
  // ...
}

// ❌ BAD - Implicit any
function TaskItem(props) {
  // ...
}
```

**2. Type Imports:**

```typescript
// ✅ GOOD - Use type imports for types only
import type { Task } from '@shared/schema';
import { tasks } from '@shared/schema';

// ❌ BAD - Mixed imports
import { Task, tasks } from '@shared/schema';
```

**3. Avoid `any`:**

```typescript
// ✅ GOOD - Use unknown or specific types
function handleData(data: unknown) {
  if (isTask(data)) {
    // TypeScript knows data is Task here
  }
}

// ❌ BAD
function handleData(data: any) {
  // ...
}
```

**4. No React Imports in JSX:**

Vite handles JSX transform automatically.

```typescript
// ✅ GOOD
export function MyComponent() {
  return <div>Hello</div>;
}

// ❌ BAD - Unnecessary import
import React from 'react';
export function MyComponent() {
  return <div>Hello</div>;
}
```

**5. Use Path Aliases:**

```typescript
// ✅ GOOD
import { Button } from '@/components/ui/button';
import { conversations } from '@shared/schema';

// ❌ BAD - Relative paths
import { Button } from '../../../components/ui/button';
import { conversations } from '../../shared/schema';
```

### Python Guidelines

**Style:**
- Python 3.11+
- Type hints on all function signatures
- Async/await for I/O operations
- Dataclasses for data structures

```python
# ✅ GOOD
async def search_memories(
    query: str,
    scope: str | None = None,
    limit: int = 10,
) -> list[MemorySearchResult]:
    """Search memories with optional scope filtering."""
    ...

# ❌ BAD - No type hints
def search_memories(query, scope=None, limit=10):
    ...
```

**Imports:**

```python
# Standard library
import json
import logging
from datetime import datetime
from typing import Optional, Any

# Third-party
from openai import AsyncOpenAI
from agents import Agent, Tool

# Local
from .base import BaseAgent, AgentId
from core.memory import remember, recall
```

**Logging:**

```python
import logging

logger = logging.getLogger(__name__)

logger.debug("Detailed debugging info")
logger.info("General information")
logger.warning("Something unexpected")
logger.error("Error occurred", exc_info=True)
```

### React/Frontend Conventions

**1. Functional Components:**

```typescript
// ✅ GOOD
interface MessageProps {
  content: string;
  sender: 'user' | 'assistant';
}

export function Message({ content, sender }: MessageProps) {
  return (
    <div className={`message ${sender}`}>
      {content}
    </div>
  );
}

// ❌ BAD - Class components
class Message extends React.Component {
  // ...
}
```

**2. Use TanStack Query for API Calls:**

```typescript
// ✅ GOOD
const { data: tasks, isLoading } = useQuery({
  queryKey: ['/api/tasks'],
  queryFn: () => fetch('/api/tasks').then(r => r.json()),
});

// ❌ BAD - Manual fetch in useEffect
const [tasks, setTasks] = useState([]);
useEffect(() => {
  fetch('/api/tasks').then(r => r.json()).then(setTasks);
}, []);
```

**3. Tailwind CSS + shadcn/ui:**

```typescript
// ✅ GOOD - Use shadcn/ui components
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

<Card>
  <Button variant="default">Click me</Button>
</Card>

// ❌ BAD - Custom button without using existing components
<div className="custom-button" onClick={...}>Click me</div>
```

### Design System (Tailwind)

**Colors** (from `design_guidelines.md`):

```typescript
// Primary: hsl(9, 75%, 61%)      // Coral red - CTAs, active states
// Secondary: hsl(30, 15%, 52%)   // Warm grey - secondary elements
// Background: hsl(20, 14%, 4%)   // Deep dark - main canvas
// Text: hsl(45, 25%, 91%)        // Warm white - primary text
// Accent: hsl(25, 45%, 20%)      // Dark orange - subtle highlights
```

**Typography:**
- **Font Family**: Poppins (Google Fonts)
- **Display (h1)**: 2rem / 600 weight
- **Heading (h2)**: 1.25rem / 600 weight
- **Body**: 0.95rem / 400 weight
- **Small**: 0.8rem / 400 weight

**Spacing:**
- Use Tailwind spacing units: 2, 4, 6, 8, 12, 16, 20
- **Border Radius**: 0.8rem (12.8px) for all rounded elements

### Server-Side Conventions

**1. Error Handling:**

```typescript
// ✅ GOOD - Comprehensive error handling
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await db.select().from(tasksTable);
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ❌ BAD - No error handling
app.get('/api/tasks', async (req, res) => {
  const tasks = await db.select().from(tasksTable);
  res.json(tasks);
});
```

**2. Database Queries:**

```typescript
// ✅ GOOD - Use Drizzle query builder
const userTasks = await db
  .select()
  .from(tasks)
  .where(eq(tasks.userId, userId));

// ❌ BAD - Raw SQL (use only when necessary)
const userTasks = await db.execute(
  `SELECT * FROM tasks WHERE user_id = $1`,
  [userId]
);
```

### Naming Conventions

**Files:**
- Components: `PascalCase.tsx` (e.g., `TaskItem.tsx`)
- Utilities: `kebab-case.ts` (e.g., `api-client.ts`)
- Hooks: `useCamelCase.ts` (e.g., `useTaskManagement.ts`)

**Variables:**
- Components: `PascalCase` (e.g., `TaskItem`)
- Functions: `camelCase` (e.g., `fetchTasks`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `API_BASE_URL`)
- React hooks: `useCamelCase` (e.g., `useAuth`)

**Directories:**
- Lowercase with underscores or hyphens: `components/`, `python_agents/`, `shared/`

---

## Common Tasks & Workflows

### Adding a New Tool (Capability)

**1. Define tool in capability module:**

```typescript
// server/capabilities/myCapability.ts
export const myToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "do_something",
      description: "Performs a specific action",
      parameters: {
        type: "object",
        properties: {
          param1: { type: "string", description: "First parameter" },
        },
        required: ["param1"],
      },
    },
  },
];

export const myToolPermissions: Record<string, (p: ToolPermissions) => boolean> = {
  do_something: () => true,
};

export async function executeMyTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string | null> {
  switch (toolName) {
    case "do_something": {
      const { param1 } = args;
      // Implementation...
      return JSON.stringify({ success: true, result: "done" });
    }
    default:
      return null;
  }
}

export const myToolNames = ["do_something"];
```

**2. Register in index:**

```typescript
// server/capabilities/index.ts
import { myToolDefinitions, myToolPermissions, executeMyTool, myToolNames } from './myCapability';

export const allToolDefinitions = [
  ...existingTools,
  ...myToolDefinitions,
];

export const allToolPermissions = {
  ...existingPermissions,
  ...myToolPermissions,
};

export async function executeAnyTool(toolName: string, args: Record<string, unknown>): Promise<string | null> {
  return await executeExistingTool(toolName, args) ||
         await executeMyTool(toolName, args) ||
         null;
}

export const allToolNames = [
  ...existingToolNames,
  ...myToolNames,
];
```

**3. Use in agent or direct chat:**

The tool will be automatically available to the OpenAI agent system.

### Adding a New API Endpoint

**1. Define route in `server/routes.ts`:**

```typescript
export function registerRoutes(app: Express) {
  // ... existing routes ...

  app.get('/api/my-resource', async (req, res) => {
    try {
      const data = await db.select().from(myResourceTable);
      res.json(data);
    } catch (error) {
      console.error('Error fetching my-resource:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/my-resource', async (req, res) => {
    try {
      const { name, value } = req.body;
      const [created] = await db.insert(myResourceTable)
        .values({ id: crypto.randomUUID(), name, value })
        .returning();
      res.json(created);
    } catch (error) {
      console.error('Error creating my-resource:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
```

**2. Create frontend hook (optional):**

```typescript
// client/src/hooks/useMyResource.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useMyResource() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['/api/my-resource'],
    queryFn: () => fetch('/api/my-resource').then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (newResource) =>
      fetch('/api/my-resource', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newResource),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/my-resource'] });
    },
  });

  return { data, isLoading, createMutation };
}
```

### Adding a New Specialist Agent (Python)

**1. Create agent class:**

```python
# python_agents/agents/my_agent.py
from .base import BaseAgent, AgentId, CapabilityCategory, ToolDefinition
import json
import logging

logger = logging.getLogger(__name__)

class MyAgent(BaseAgent):
    """
    My Agent - Brief description of role.

    Responsibilities:
    - First responsibility
    - Second responsibility
    """

    def __init__(self):
        tool_definitions = [
            ToolDefinition(
                name="my_tool",
                description="What this tool does",
                parameters={
                    "type": "object",
                    "properties": {
                        "param": {"type": "string", "description": "Parameter description"},
                    },
                    "required": ["param"],
                },
                handler=self._handle_my_tool,
            ),
        ]

        super().__init__(
            agent_id=AgentId.MY_AGENT,
            name="MyAgent",
            instructions=self._build_instructions(),
            capabilities=[CapabilityCategory.MY_CATEGORY],
            handoff_targets=[AgentId.CONDUCTOR],
            tool_definitions=tool_definitions,
        )

    def _build_instructions(self) -> str:
        return """You are MyAgent, a specialist in...

        Your responsibilities:
        1. First thing
        2. Second thing

        Always:
        - Be action-oriented
        - Use tools when appropriate
        - Provide clear confirmations
        """

    async def _handle_my_tool(self, ctx: Any, args: str) -> str:
        try:
            arguments = json.loads(args)
            param = arguments.get("param")
            # Implementation...
            result = {"success": True, "data": "result"}
            return json.dumps(result)
        except Exception as e:
            logger.error(f"Tool failed: {e}")
            return json.dumps({"success": False, "error": str(e)})
```

**2. Register agent ID:**

```python
# python_agents/agents/base.py
class AgentId(Enum):
    CONDUCTOR = "conductor"
    MEMORY_CURATOR = "memory_curator"
    # ... existing agents ...
    MY_AGENT = "my_agent"  # Add here
```

**3. Add to conductor routing (if needed):**

```python
# python_agents/agents/conductor.py
# Update intent mappings or handoff logic
```

**4. Export from package:**

```python
# python_agents/agents/__init__.py
from .my_agent import MyAgent

__all__ = [
    "BaseAgent",
    "Conductor",
    "MyAgent",  # Add here
    # ...
]
```

### Adding Database Tables

**1. Define schema:**

```typescript
// shared/schema.ts
export const myTable = pgTable("my_table", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  value: integer("value").default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertMyTableSchema = createInsertSchema(myTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MyTable = typeof myTable.$inferSelect;
export type InsertMyTable = z.infer<typeof insertMyTableSchema>;
```

**2. Push to database:**

```bash
npm run db:push
```

Drizzle will detect schema changes and apply them automatically.

**3. Use in code:**

```typescript
import { db } from './db';
import { myTable } from '@shared/schema';

const items = await db.select().from(myTable);
```

### Adding a Background Job

**1. Create job file:**

```typescript
// server/jobs/myJob.ts
import cron from 'node-cron';
import { log } from '../logger';

export function initializeMyJob() {
  // Schedule: Every day at 2 AM
  cron.schedule('0 2 * * *', async () => {
    try {
      log('myJob', 'Running my job...');
      // Job implementation...
      log('myJob', 'Job completed successfully');
    } catch (error) {
      log('myJob', `Job failed: ${error}`);
    }
  });

  log('myJob', 'My job scheduler initialized');
}
```

**2. Register in server index:**

```typescript
// server/index.ts
import { initializeMyJob } from './jobs/myJob';

// ... after server starts ...
initializeMyJob();
```

---

## Testing Guidelines

### Unit Tests (TypeScript)

**Location**: `server/__tests__/`

**Example**:

```typescript
// server/__tests__/myFeature.test.ts
import { describe, it, expect } from 'vitest';
import { myFunction } from '../myFeature';

describe('myFunction', () => {
  it('should return expected result', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });

  it('should handle errors', () => {
    expect(() => myFunction(null)).toThrow();
  });
});
```

**Run tests:**

```bash
npm run typecheck  # Type checking (current test command)
```

### Python Tests

**Location**: `tests/agent_tests/`, `python_agents/tests/`

**Example**:

```python
# tests/agent_tests/test_my_agent.py
import pytest
from python_agents.agents.my_agent import MyAgent

@pytest.mark.asyncio
async def test_my_agent_tool():
    agent = MyAgent()
    result = await agent._handle_my_tool(None, '{"param": "test"}')
    assert "success" in result
```

**Run tests:**

```bash
# All Python tests
python -m pytest tests/ -v

# Specific module
python -m pytest tests/agent_tests/ -v

# With coverage
python -m pytest tests/ --cov=core --cov=python_agents --cov-report=html
```

### Evaluation Harness

ZEKE includes an **evaluation harness** in `eval/` for testing agent responses.

**Structure:**

```
eval/
├── runner.py           # Eval runner
├── openai_evals.py     # OpenAI evals integration
├── conftest.py         # Pytest config
├── tests/              # Test cases
│   ├── test_memory.py
│   ├── test_calendar.py
│   └── ...
└── golden/             # Expected outputs
    ├── memory_recall.json
    └── ...
```

**Running evals:**

```bash
# All evals
python eval/runner.py

# Specific eval
python eval/runner.py -t memory

# Upload to OpenAI Evals platform (requires OPENAI_API_KEY in CI)
python eval/openai_evals.py
```

**SLO Check:**

```bash
# Check Service Level Objectives
npm run slo:check
```

### Smoke Test

**Quick health check:**

```bash
npm run smoke
```

Tests `/healthz` and `/readyz` endpoints.

---

## Git Development Branch Requirements

### Branch Strategy

**Main Branches:**
- `main` (or default branch) - Production-ready code
- `claude/*` - Feature branches for AI assistants

**Feature Branch Naming:**

```
claude/<feature-name>-<session-id>
```

Example: `claude/add-claude-documentation-dkvyi`

### Git Operations

**For git push:**
- **ALWAYS** use `git push -u origin <branch-name>`
- **CRITICAL**: Branch MUST start with `claude/` and end with matching session ID
- Push will fail with 403 HTTP code if branch name is incorrect
- Retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s) on network errors

**For git fetch/pull:**
- Prefer fetching specific branches: `git fetch origin <branch-name>`
- Retry up to 4 times with exponential backoff on network failures
- Use: `git pull origin <branch-name>`

### Workflow Example

```bash
# 1. Check current branch
git status

# 2. Create feature branch (if needed)
git checkout -b claude/add-new-feature-abc123

# 3. Make changes and commit
git add .
git commit -m "Add new feature: description"

# 4. Push to remote (with retry logic)
git push -u origin claude/add-new-feature-abc123

# 5. Create pull request (via GitHub)
```

### Commit Guidelines

**Commit Message Format:**

```
<type>: <subject>

<body (optional)>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `docs`: Documentation changes
- `test`: Adding tests
- `chore`: Build/tooling changes

**Example:**

```bash
git commit -m "feat: Add memory confidence scoring

Implements confidence tracking for memory notes with automatic
decay and usage-based boosting."
```

### Creating Pull Requests

After pushing your branch:

1. Go to GitHub repository
2. Click "Compare & pull request"
3. Add clear title and description
4. Reference any related issues
5. Request review if needed

---

## AI Assistant Best Practices

### When Making Changes

**1. Always Read Before Modifying:**
- ✅ Read the file completely before suggesting changes
- ✅ Understand surrounding context and dependencies
- ❌ Never propose changes to code you haven't read

**2. Check Existing Patterns:**
- ✅ Search for similar implementations in the codebase
- ✅ Follow established patterns (e.g., how other tools are defined)
- ❌ Don't introduce new patterns without justification

**3. Maintain Consistency:**
- ✅ Use existing design patterns (agent system, tool definitions)
- ✅ Follow naming conventions
- ✅ Match coding style of neighboring files
- ❌ Don't create custom solutions when existing ones exist

**4. Test Changes Mentally:**
- ✅ Trace the execution path
- ✅ Consider edge cases (null values, empty arrays, errors)
- ✅ Verify TypeScript types are correct
- ❌ Don't assume "it should work"

### Security Considerations

**1. Never commit secrets:**
- All secrets MUST be in `.env` (never in code)
- Use environment variables for API keys
- Never log sensitive data (tokens, passwords)

**2. Validate inputs:**
- Validate all request bodies with Zod schemas
- Use Drizzle ORM parameterized queries (prevents SQL injection)
- Sanitize user inputs before storage

**3. Error handling:**
- Always use try/catch for async operations
- Log errors with context
- Return user-friendly error messages (don't expose internals)

### Performance Optimization

**1. Async Operations:**

```python
# ✅ GOOD - Parallel execution
results = await asyncio.gather(
    search_memories(query1),
    search_memories(query2),
    search_memories(query3),
)

# ❌ BAD - Sequential execution
result1 = await search_memories(query1)
result2 = await search_memories(query2)
result3 = await search_memories(query3)
```

**2. Database Queries:**

```typescript
// ✅ GOOD - Specific columns
const tasks = await db.select({
  id: tasksTable.id,
  title: tasksTable.title,
}).from(tasksTable);

// ❌ BAD - SELECT *
const tasks = await db.select().from(tasksTable);
```

**3. Memory Queries:**

```python
# ✅ GOOD - Scoped query
await recall(query="...", scope="persona:preferences", k=5)

# ❌ BAD - Global query (searches everything)
await recall(query="...", k=100)
```

### Documentation

**When to Update Documentation:**
- Adding new features → Update CLAUDE.md or relevant docs
- Changing architecture → Update AGENTS.md or DEVELOPMENT.md
- Adding new tools → Update TOOLS.md
- Database schema changes → Update schema.ts comments

**Code Comments:**

```typescript
// ✅ GOOD - Explain WHY, not WHAT
// Retry logic needed because Twilio API occasionally returns 503
const response = await retryWithBackoff(() => twilioClient.messages.create(...));

// ❌ BAD - Obvious comment
// Create a new task
const task = await createTask();
```

### Communication with Users

**Be Clear and Concise:**
- ✅ "I've added the `send_sms` tool to `server/capabilities/communication.ts:145`"
- ❌ "I made some changes to handle SMS"

**Provide Context:**
- ✅ "This follows the existing tool pattern from `calendar.ts` for consistency"
- ❌ "This is how I implemented it"

**Use File References:**
- ✅ "Updated `server/routes.ts:234` to add error handling"
- ❌ "Fixed the error in the routes file"

---

## Quick Reference

### Essential Files

| File | Purpose |
|------|---------|
| `package.json` | Node.js dependencies and scripts |
| `pyproject.toml` | Python dependencies |
| `tsconfig.json` | TypeScript configuration |
| `vite.config.ts` | Vite build configuration |
| `drizzle.config.ts` | Database configuration |
| `.env.schema` | Environment variables reference |
| `shared/schema.ts` | Database schema (Drizzle + Zod) |
| `server/index.ts` | Express server entry point |
| `server/routes.ts` | Main API routes |
| `server/capabilities/` | Tool definitions |
| `server/agent.ts` | OpenAI chat integration |
| `python_agents/main.py` | Python FastAPI entry point |
| `python_agents/agents/conductor.py` | Agent routing logic |
| `client/src/App.tsx` | React app entry point |
| `client/src/lib/queryClient.ts` | TanStack Query setup |

### Common Commands

```bash
# Development
npm run dev                  # Run Express + Vite dev server
cd python_agents && uv run uvicorn main:app --reload --port 5001  # Python agents

# Database
npm run db:init              # Initialize database
npm run db:push              # Apply schema changes
npm run db:seed              # Seed database

# Code Quality
npm run typecheck            # TypeScript type checking
npm run lint                 # Linting (bidi check)
npm run check                # Alias for typecheck

# Testing
npm run test                 # Run tests (currently typecheck)
python -m pytest tests/ -v   # Python tests
python eval/runner.py        # Eval harness
npm run smoke                # Smoke test
npm run slo:check            # SLO check

# Build
npm run build                # Build server
npm start                    # Run production server

# Python
pip install .                # Install Python dependencies
uv pip install .             # Install with uv
```

### Key Python Agents

| Agent | ID | Purpose |
|-------|-----|---------|
| Conductor | `conductor` | Route messages to specialists |
| Memory Curator | `memory_curator` | Manage long-term memory |
| Comms Pilot | `comms_pilot` | SMS, email, voice |
| Ops Planner | `ops_planner` | Tasks, calendar |
| Research Scout | `research_scout` | Web search, research |
| Safety Auditor | `safety_auditor` | Security checks |
| Omi Analyst | `omi_analyst` | Process lifelogs |
| Foresight Strategist | `foresight_strategist` | Predictive planning |

### Environment Variables Checklist

**Required:**
- [ ] `OPENAI_API_KEY` - OpenAI API key
- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `JWT_SECRET` - JWT signing key

**Recommended:**
- [ ] `APP_ENV` - development|staging|production
- [ ] `PORT` - Server port (default: 5000)
- [ ] `PYTHON_AGENTS_PORT` - Python port (default: 5001)

**Optional (for full features):**
- [ ] `TWILIO_ACCOUNT_SID` - SMS/Voice
- [ ] `TWILIO_AUTH_TOKEN`
- [ ] `TWILIO_PHONE_NUMBER`
- [ ] `OMI_API_KEY` - Omi pendant
- [ ] `GOOGLE_CALENDAR_CREDENTIALS` - Google Calendar
- [ ] `PERPLEXITY_API_KEY` - Web search
- [ ] `OPENWEATHERMAP_API_KEY` - Weather

---

## Additional Resources

**Documentation:**
- [AGENTS.md](./AGENTS.md) - Agent system overview
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Setup and deployment
- [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) - Development guidelines
- [docs/MEMORY.md](./docs/MEMORY.md) - Memory system
- [docs/TOOLS.md](./docs/TOOLS.md) - Tool definitions
- [design_guidelines.md](./design_guidelines.md) - Design system

**Mobile App:**
- [android/CLAUDE.md](./android/CLAUDE.md) - Mobile app AI guide
- [android/ARCHITECTURE.md](./android/ARCHITECTURE.md) - Mobile architecture

**External Documentation:**
- [OpenAI Agents SDK](https://github.com/openai/openai-agents)
- [Drizzle ORM](https://orm.drizzle.team/)
- [TanStack Query](https://tanstack.com/query/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [shadcn/ui](https://ui.shadcn.com/)

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-03 | Initial CLAUDE.md creation for root repository | Claude (AI Assistant) |

---

**Questions or Improvements?**

If you find gaps in this documentation or have suggestions, please update this file or create an issue in the repository.

# aOa Integration

**CRITICAL: Use `aoa grep` instead of Grep/Glob. It's 10-100x faster.**

## Quickstart Triggers

When user says **"Hey aOa"**, **"Tag my code"**, or **"aOa quickstart"**:

1. Run `aoa outline --pending --json` to check pending files
2. Respond with this (DO NOT read any files first):

```
⚡ aOa activated

Your codebase is already indexed—fast symbol search works right now.
Try it: `aoa grep [anything]`

I found [X] files that need semantic compression.
Let me tag these in the background. This is FREE—doesn't use your tokens.

Takes about 2-3 minutes. To watch progress, open another terminal:
  aoa intent

Keep coding. I'm not blocking you.
Once done, I'll find code by meaning, not just keywords.
```

3. Launch: `Task(subagent_type="aoa-outline", prompt="Tag all pending files", run_in_background=true)`

## Commands

| Command | Use For |
|---------|---------|
| `aoa search <term>` | Alias for aoa grep (find code fast) |
| `aoa grep <term>` | Find code fast (ALWAYS use instead of Grep) |
| `aoa grep "a b c"` | Multi-term OR search |
| `aoa grep -a a,b,c` | Multi-term AND search |
| `aoa outline <file>` | See file structure without reading it all |
| `aoa intent` | Track what's being worked on |

## Rules

- ✅ ALWAYS use `aoa grep` instead of Grep/Glob
- ✅ Read specific line ranges from aOa results (not whole files)
- ❌ DO NOT use subagents for codebase exploration (hooks don't work in subagents)

## Hook Integration

aOa hooks run on every prompt and tool use. When you see these in additionalContext:

**aOa Auto-Tag Request**: Generate 3-5 semantic hashtags directly (YOU are the model), then store:
\`\`\`bash
curl -s -X POST localhost:8080/intent -H "Content-Type: application/json" -d '{"tool": "Intent", "tags": ["#your-tags"], ...}'
\`\`\`

**aOa Predicted Files**: Files predicted based on your prompt keywords. Consider these when exploring.

See \`.aoa/USAGE.md\` for full guide.

# CLAUDE.md - AI Assistant Guide for ZEKE AI Companion

> **Last Updated:** 2026-01-01
>
> This document provides comprehensive guidance for AI assistants (like Claude) working on the ZEKE AI Companion codebase. It covers architecture, conventions, workflows, and best practices to ensure consistent, high-quality contributions.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Repository Structure](#repository-structure)
3. [Development Environment Setup](#development-environment-setup)
4. [Key Architectural Patterns](#key-architectural-patterns)
5. [Code Conventions & Style Guide](#code-conventions--style-guide)
6. [Common Tasks & Workflows](#common-tasks--workflows)
7. [Testing Guidelines](#testing-guidelines)
8. [Deployment & Build Process](#deployment--build-process)
9. [Debugging & Troubleshooting](#debugging--troubleshooting)
10. [AI Assistant Best Practices](#ai-assistant-best-practices)

---

## Project Overview

### What is ZEKE AI Companion?

ZEKE AI Companion is a **mobile-first AI assistant application** built with Expo/React Native that integrates with wearable devices (Omi, Limitless AI), provides real-time communication features (SMS, VoIP, chat), and syncs with external services (Google Calendar, ZEKE backend).

### Technology Stack

**Frontend (Client):**
- React Native 0.81.5 + React 19.1.0
- Expo SDK 54.0.30
- React Navigation v7 (native-stack, bottom-tabs)
- TanStack React Query v5 (data fetching & caching)
- TypeScript (strict mode)

**Backend (Server):**
- Express.js 4.21.2
- PostgreSQL + Drizzle ORM
- WebSocket (real-time sync)
- Twilio (SMS/Voice)
- OpenAI API (AI processing)
- Google APIs (Calendar, Places)

**Target Platform:**
- **Primary:** Android (Google Pixel 8)
- **Secondary:** iOS, Web

### Related Repositories

| Repository | Description | Relationship |
|------------|-------------|--------------|
| **ZekeAssistant** (this repo) | Mobile companion app | Client application |
| **Zeke** (main backend) | Primary ZEKE backend | External API via proxy |

**Important:** This repo includes a **proxy server** (`server/zeke-proxy.ts`) that forwards requests to the main ZEKE backend with HMAC signing. See [ARCHITECTURE.md](./ARCHITECTURE.md) for details.

---

## Repository Structure

```
ZEKEapp/
├── client/                    # React Native mobile app
│   ├── App.tsx               # App entry point
│   ├── components/           # Reusable UI components (36 components)
│   ├── screens/              # Screen components (24+ screens)
│   ├── navigation/           # React Navigation setup
│   ├── context/              # React Context providers (AuthContext)
│   ├── hooks/                # Custom React hooks (12 hooks)
│   ├── lib/                  # Client utilities (26 files)
│   │   ├── api-client.ts    # HTTP client with error handling
│   │   ├── query-client.ts  # React Query setup
│   │   ├── bluetooth.ts     # BLE device communication
│   │   ├── location.ts      # GPS tracking
│   │   └── ...              # Audio, sync, storage, etc.
│   └── constants/           # Theme, colors, device specs
│
├── server/                   # Express.js backend
│   ├── index.ts             # Server entry point
│   ├── routes.ts            # Main API routes (72KB)
│   ├── wearable-routes.ts   # Wearable device endpoints
│   ├── zeke-proxy.ts        # Proxy to main ZEKE backend
│   ├── websocket.ts         # WebSocket real-time sync
│   ├── auth-middleware.ts   # Authentication & rate limiting
│   ├── device-auth.ts       # Device token validation
│   ├── sms-pairing.ts       # SMS-based device pairing
│   ├── location.ts          # Location/geofence routes
│   ├── google-calendar.ts   # Google Calendar integration
│   ├── twilio.ts            # Twilio SMS/Voice
│   ├── omi-webhooks.ts      # Omi device webhooks
│   └── services/            # Business logic services (8 files)
│       ├── limitless-api.ts # Limitless AI integration
│       ├── opus-decoder.ts  # Audio codec handling
│       ├── vad-service.ts   # Voice Activity Detection
│       └── ...
│
├── shared/                   # Code shared between client/server
│   └── schema.ts            # Drizzle ORM schema + Zod validation
│
├── scripts/                  # Build and utility scripts
├── docs/                     # Additional documentation
├── assets/                   # App assets (images, fonts)
├── static-build/            # Compiled Expo bundles
│
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
├── app.config.js            # Expo app configuration
├── drizzle.config.ts        # Database configuration
├── eslint.config.js         # ESLint rules
├── .replit                  # Replit environment config
│
└── Documentation Files:
    ├── CLAUDE.md            # This file - AI assistant guide
    ├── ARCHITECTURE.md      # System architecture overview
    ├── design_guidelines.md # UI/UX design system
    ├── MIGRATION_GUIDE.md   # Migration documentation
    ├── SYNC_GUIDE.md        # Sync architecture
    └── replit.md            # Replit-specific docs
```

### Key Path Aliases

TypeScript is configured with these path aliases (`tsconfig.json`):

```typescript
"@/*"       → "./client/*"      // Client code
"@shared/*" → "./shared/*"      // Shared schema/types
```

**Usage:**
```typescript
import { Button } from '@/components/Button';
import { users } from '@shared/schema';
```

---

## Development Environment Setup

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- Expo CLI (`npm install -g expo-cli`)
- Android Studio (for Android) or Xcode (for iOS)

### Environment Variables

Create a `.env` file in the root directory:

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/zeke_db

# External Services
OPENAI_API_KEY=sk-...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
GOOGLE_MAPS_API_KEY=...

# ZEKE Backend Integration
EXPO_PUBLIC_ZEKE_BACKEND_URL=https://zekeai.replit.app
ZEKE_SHARED_SECRET=your-secret-key
ZEKE_PROXY_ID=mobile-proxy-001

# Expo Configuration
EXPO_PUBLIC_DOMAIN=localhost:5000
EXPO_PACKAGER_PROXY_URL=https://your-replit-domain.repl.co
```

### Running the Application

**Development (All Services):**
```bash
npm run all:dev
# Runs: Expo dev server (8081) + Express server (5000)
```

**Individual Services:**
```bash
# Expo only
npm run expo:dev

# Server only
npm run server:dev

# Database migrations
npm run db:push
```

**Production Build:**
```bash
# Build server
npm run server:build

# Run production server
npm run server:prod

# Build Expo app
npm run expo:static:build
```

### Code Quality Commands

```bash
# Type checking
npm run check:types

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run check:format
npm run format
```

---

## Key Architectural Patterns

### 1. Authentication Flow (SMS Pairing)

ZEKE uses **SMS-based device pairing** instead of traditional username/password:

```
┌──────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Mobile App   │    │ Express Server  │    │ Twilio          │
└──────┬───────┘    └────────┬────────┘    └────────┬────────┘
       │                     │                      │
       │ 1. Request code     │                      │
       │ POST /api/sms/code  │                      │
       ├────────────────────►│                      │
       │                     │ 2. Generate 6-digit  │
       │                     │    code, send SMS    │
       │                     ├─────────────────────►│
       │                     │                      │
       │ 3. User enters code │                      │
       │ POST /api/sms/verify│                      │
       ├────────────────────►│                      │
       │                     │ 4. Validate code     │
       │                     │    Generate token    │
       │                     │◄─────────────────────┤
       │ 5. Device token     │                      │
       │◄────────────────────┤                      │
       │ (Store in SecureStore)                     │
```

**Key Files:**
- `client/context/AuthContext.tsx` - Client authentication state
- `server/sms-pairing.ts` - SMS code generation/validation
- `server/device-auth.ts` - Device token validation
- `server/auth-middleware.ts` - Request authentication middleware

**Token Storage:**
- **Native (iOS/Android):** `expo-secure-store`
- **Web:** `localStorage`
- **Keys:** `DEVICE_TOKEN_KEY`, `DEVICE_ID_KEY`, `LAST_VERIFIED_KEY`

**Offline Support:**
- Device tokens cached for 7 days
- Offline mode allows limited functionality
- Re-verification required after expiration

### 2. Proxy Architecture (ZEKE Backend Integration)

The mobile app **does NOT** directly call the main ZEKE backend. Instead, requests flow through a local proxy:

```
Mobile App → Local Proxy (port 5000) → ZEKE Backend (zekeai.replit.app)
             [HMAC Signing]
             [Header Forwarding]
```

**Proxy Routes Pattern:**
```typescript
// Client calls:
fetch('/api/zeke/tasks', { ... })

// Proxy forwards to:
https://zekeai.replit.app/api/tasks
// With HMAC headers:
// X-Zeke-Proxy-Id, X-ZEKE-Timestamp, X-ZEKE-Nonce, X-ZEKE-Signature
```

**Key Files:**
- `server/zeke-proxy.ts` - Proxy route definitions
- `server/zeke-security.ts` - HMAC signing/verification
- `client/lib/zeke-api-adapter.ts` - Client-side API adapter

**When to modify:**
- Adding new ZEKE backend endpoints → Update `zeke-proxy.ts`
- Changing security headers → Update `zeke-security.ts`
- New client API calls → Use existing proxy routes or add new ones

### 3. Data Fetching (React Query)

**Pattern:**
```typescript
// Always use React Query for API calls
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// Query example
const { data, isLoading, error } = useQuery({
  queryKey: ['tasks', userId],
  queryFn: () => apiClient.get('/api/tasks'),
});

// Mutation example
const mutation = useMutation({
  mutationFn: (task) => apiClient.post('/api/tasks', task),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  },
});
```

**Configuration:**
- Query client setup: `client/lib/query-client.ts`
- Automatic token injection in headers
- 5-minute stale time default
- Retry logic with exponential backoff

**Cache Invalidation Strategy:**
- Mutations invalidate related queries
- WebSocket updates trigger cache updates
- Manual sync available via `useSync()` hook

### 4. Real-Time Sync (WebSocket + SSE)

**WebSocket Server:**
```typescript
// server/websocket.ts
// Handles: memory updates, device status, location updates
```

**Client Connection:**
```typescript
// client/hooks/useZekeSync.ts
const { isConnected, lastSync } = useZekeSync();
```

**Sync Types:**
- **Real-time:** WebSocket messages for instant updates
- **Polling:** React Query refetch intervals for critical data
- **Manual:** User-triggered sync via pull-to-refresh

### 5. Offline-First Architecture

**Queue System:**
```typescript
// client/lib/upload-queue.ts
// Queues audio uploads, location updates, etc.
// Processes when connectivity restored
```

**Connectivity Monitoring:**
```typescript
// client/lib/connectivity.ts
import NetInfo from '@react-native-community/netinfo';

// Auto-sync when connection restored
```

**Local Storage:**
- Use `AsyncStorage` for non-sensitive data
- Use `SecureStore` for tokens/secrets
- Implement `useLocalLists()` pattern for offline mutations

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
// ✅ GOOD - Use type imports
import type { Task } from '@shared/schema';
import { users, tasks } from '@shared/schema';

// ❌ BAD - Mixed imports
import { Task, users } from '@shared/schema';
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

### React/React Native Conventions

**1. Component Structure:**
```typescript
// ✅ GOOD - Consistent component pattern
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface TaskItemProps {
  task: Task;
  onPress: () => void;
}

export function TaskItem({ task, onPress }: TaskItemProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundDefault }]}>
      <Text style={styles.title}>{task.title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
});
```

**2. Hook Usage:**
```typescript
// ✅ GOOD - Custom hooks for shared logic
function useTaskManagement() {
  const queryClient = useQueryClient();
  const { data: tasks } = useQuery({ queryKey: ['tasks'] });
  const createTask = useMutation({ ... });

  return { tasks, createTask };
}

// ❌ BAD - Duplicate API calls in multiple components
```

**3. Avoid Inline Styles:**
```typescript
// ✅ GOOD - Use StyleSheet or theme
const styles = StyleSheet.create({
  container: { padding: 16 }
});

// ❌ BAD
<View style={{ padding: 16 }}>
```

### Design System Adherence

**CRITICAL:** Always follow the design system defined in `design_guidelines.md`:

**Colors:**
```typescript
import { theme } from '@/constants/theme';

// ✅ GOOD - Use theme tokens
<View style={{ backgroundColor: theme.backgroundDefault }}>

// ❌ BAD - Hardcoded colors
<View style={{ backgroundColor: '#1E293B' }}>
```

**Spacing:**
```typescript
// ✅ GOOD - Use spacing tokens
<View style={{ padding: theme.spacing.lg }}> // 16dp

// ❌ BAD
<View style={{ padding: 16 }}>
```

**Components:**
```typescript
// ✅ GOOD - Use existing components
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';

// ❌ BAD - Reinvent custom card/button
```

### Server-Side Conventions

**1. Route Structure:**
```typescript
// ✅ GOOD - Explicit route registration
export function registerRoutes(app: Express) {
  app.get('/api/tasks', authenticateDevice, async (req, res) => {
    try {
      const tasks = await db.select().from(tasksTable);
      res.json(tasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

// ❌ BAD - Inline route definitions without error handling
```

**2. Error Handling:**
```typescript
// ✅ GOOD - Comprehensive error handling
try {
  const result = await externalAPI.call();
  res.json(result);
} catch (error) {
  console.error('API call failed:', error);
  if (error instanceof ValidationError) {
    res.status(400).json({ error: error.message });
  } else {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ❌ BAD - Silent failures
const result = await externalAPI.call();
res.json(result);
```

**3. Database Queries (Drizzle ORM):**
```typescript
import { db } from './db';
import { tasks } from '@shared/schema';
import { eq } from 'drizzle-orm';

// ✅ GOOD - Use Drizzle query builder
const userTasks = await db
  .select()
  .from(tasks)
  .where(eq(tasks.userId, userId));

// ❌ BAD - Raw SQL (use only when necessary)
const userTasks = await db.execute(`SELECT * FROM tasks WHERE user_id = $1`, [userId]);
```

### Naming Conventions

**Files:**
- Components: `PascalCase.tsx` (e.g., `TaskItem.tsx`)
- Utilities: `kebab-case.ts` (e.g., `api-client.ts`)
- Screens: `PascalCaseScreen.tsx` (e.g., `TasksScreen.tsx`)
- Hooks: `useCamelCase.ts` (e.g., `useTaskManagement.ts`)

**Variables:**
- Components: `PascalCase` (e.g., `TaskItem`)
- Functions: `camelCase` (e.g., `fetchTasks`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `API_BASE_URL`)
- React hooks: `useCamelCase` (e.g., `useAuth`)

**Directories:**
- Lowercase with hyphens: `components/`, `hooks/`, `lib/`

---

## Common Tasks & Workflows

### Adding a New Screen

**1. Create the screen component:**
```bash
# Create file: client/screens/NewFeatureScreen.tsx
```

```typescript
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Card } from '@/components/Card';

export function NewFeatureScreen() {
  const theme = useTheme();

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <Card>
        <Text style={[styles.title, { color: theme.text }]}>New Feature</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
});
```

**2. Add to navigation:**
```typescript
// client/navigation/HomeStackNavigator.tsx
import { NewFeatureScreen } from '@/screens/NewFeatureScreen';

export function HomeStackNavigator() {
  return (
    <Stack.Navigator>
      {/* ... existing screens */}
      <Stack.Screen
        name="NewFeature"
        component={NewFeatureScreen}
        options={{ title: 'New Feature' }}
      />
    </Stack.Navigator>
  );
}
```

**3. Add TypeScript types:**
```typescript
// client/navigation/types.ts
export type HomeStackParamList = {
  // ... existing screens
  NewFeature: undefined; // or { id: string } if passing params
};
```

### Adding a New API Endpoint

**1. Define schema (if needed):**
```typescript
// shared/schema.ts
export const newFeature = pgTable('new_feature', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export type NewFeature = typeof newFeature.$inferSelect;
export type NewFeatureInsert = typeof newFeature.$inferInsert;
```

**2. Create server route:**
```typescript
// server/routes.ts
app.get('/api/new-feature', authenticateDevice, async (req, res) => {
  try {
    const items = await db.select().from(newFeature);
    res.json(items);
  } catch (error) {
    console.error('Error fetching new feature:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/new-feature', authenticateDevice, async (req, res) => {
  try {
    const { name } = req.body;
    const [item] = await db.insert(newFeature).values({ id: crypto.randomUUID(), name }).returning();
    res.json(item);
  } catch (error) {
    console.error('Error creating new feature:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

**3. Create client API hook:**
```typescript
// client/hooks/useNewFeature.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { NewFeature, NewFeatureInsert } from '@shared/schema';

export function useNewFeature() {
  const queryClient = useQueryClient();

  const { data: items, isLoading } = useQuery({
    queryKey: ['newFeature'],
    queryFn: () => apiClient.get<NewFeature[]>('/api/new-feature'),
  });

  const createItem = useMutation({
    mutationFn: (data: NewFeatureInsert) =>
      apiClient.post<NewFeature>('/api/new-feature', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['newFeature'] });
    },
  });

  return { items, isLoading, createItem };
}
```

**4. Use in component:**
```typescript
import { useNewFeature } from '@/hooks/useNewFeature';

export function NewFeatureScreen() {
  const { items, isLoading, createItem } = useNewFeature();

  const handleCreate = () => {
    createItem.mutate({ name: 'New Item' });
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <View>
      {items?.map(item => <Text key={item.id}>{item.name}</Text>)}
      <Button onPress={handleCreate}>Create</Button>
    </View>
  );
}
```

### Adding Database Migrations

**1. Update schema:**
```typescript
// shared/schema.ts
export const newTable = pgTable('new_table', {
  id: text('id').primaryKey(),
  // ... columns
});
```

**2. Push to database:**
```bash
npm run db:push
```

**Drizzle Kit will:**
- Detect schema changes
- Generate SQL migration
- Apply to database

**Manual migration (if needed):**
```bash
npx drizzle-kit generate:pg
npx drizzle-kit push:pg
```

### Adding ZEKE Backend Proxy Route

**1. Add proxy route:**
```typescript
// server/zeke-proxy.ts
export function registerZekeProxyRoutes(app: Express) {
  // Existing routes...

  // New proxy route
  app.all('/api/zeke/new-endpoint', async (req, res) => {
    try {
      await forwardToZeke(req, res, '/api/new-endpoint');
    } catch (error) {
      console.error('Proxy error:', error);
      res.status(500).json({ error: 'Proxy error' });
    }
  });
}
```

**2. Update client API call:**
```typescript
// Client calls:
apiClient.get('/api/zeke/new-endpoint')
// Automatically forwarded to ZEKE backend
```

### Handling Platform-Specific Code

**Option 1: Platform-specific files:**
```typescript
// MapScreen.tsx (iOS/Android native)
// MapScreen.web.tsx (Web)
```

**Option 2: Platform checks:**
```typescript
import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  // Android-specific code
} else if (Platform.OS === 'ios') {
  // iOS-specific code
} else {
  // Web-specific code
}
```

**Option 3: Platform.select:**
```typescript
const styles = StyleSheet.create({
  container: {
    padding: Platform.select({
      ios: 16,
      android: 12,
      web: 20,
    }),
  },
});
```

---

## Testing Guidelines

### Current State

**⚠️ Testing Setup Needed:**
- No test files currently exist
- No Jest/Vitest configuration detected

### Recommended Testing Strategy

**1. Unit Tests (Utilities & Hooks):**
```typescript
// Example: client/lib/__tests__/api-client.test.ts
import { describe, it, expect } from '@jest/globals';
import { apiClient } from '../api-client';

describe('apiClient', () => {
  it('should handle successful requests', async () => {
    const response = await apiClient.get('/api/test');
    expect(response).toBeDefined();
  });

  it('should throw ApiError on failure', async () => {
    await expect(apiClient.get('/api/invalid')).rejects.toThrow('ApiError');
  });
});
```

**2. Component Tests (React Testing Library):**
```typescript
// Example: client/components/__tests__/Button.test.tsx
import { render, fireEvent } from '@testing-library/react-native';
import { Button } from '../Button';

describe('Button', () => {
  it('should call onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button onPress={onPress}>Click Me</Button>);

    fireEvent.press(getByText('Click Me'));
    expect(onPress).toHaveBeenCalled();
  });
});
```

**3. Integration Tests (API Routes):**
```typescript
// Example: server/__tests__/routes.test.ts
import request from 'supertest';
import { app } from '../index';

describe('GET /api/tasks', () => {
  it('should return tasks for authenticated user', async () => {
    const response = await request(app)
      .get('/api/tasks')
      .set('x-zeke-device-token', 'valid-token');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});
```

### Manual Testing Checklist

**Before committing changes:**

1. **Type checking:** `npm run check:types`
2. **Linting:** `npm run lint`
3. **Formatting:** `npm run check:format`
4. **Build verification:** `npm run server:build`
5. **Runtime testing:**
   - Test on Android device/emulator
   - Test API endpoints with Postman/curl
   - Verify database migrations
   - Check WebSocket connections

---

## Deployment & Build Process

### Development Workflow

**Branch Strategy:**
- Main branch: `main` (or default branch)
- Feature branches: `claude/feature-name-{sessionId}`
- **Always develop on the designated `claude/*` branch**

**Git Commands:**
```bash
# Check current branch
git status

# Create feature branch (if needed)
git checkout -b claude/add-new-feature-abc123

# Commit changes
git add .
git commit -m "Add new feature: description"

# Push to remote
git push -u origin claude/add-new-feature-abc123
```

**⚠️ CRITICAL:** When pushing:
- Always use `git push -u origin <branch-name>`
- Branch MUST start with `claude/` and match session ID
- Retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s) on network errors

### Production Build

**Server:**
```bash
# Build server code
npm run server:build
# Output: server_dist/index.js

# Run in production
NODE_ENV=production npm run server:prod
```

**Client (Expo):**
```bash
# Build for Android
npm run android

# Build for iOS
npm run ios

# Build static bundle
npm run expo:static:build
```

### Environment-Specific Configuration

**Development:**
- Uses `EXPO_PUBLIC_DOMAIN` for local server
- WebSocket on `ws://localhost:5000`

**Production:**
- Points to deployed ZEKE backend
- Uses secure WebSocket (`wss://`)
- Environment variables from hosting platform (Replit, etc.)

---

## Debugging & Troubleshooting

### Common Issues

**1. "Device token invalid" error:**
```typescript
// Solution: Clear authentication and re-pair
import { useAuth } from '@/context/AuthContext';

const { unpairDevice } = useAuth();
unpairDevice(); // Clear stored token
// Re-run SMS pairing flow
```

**2. "Network request failed" on Expo:**
```typescript
// Check: API_URL in query-client.ts
// Ensure: EXPO_PUBLIC_DOMAIN is set correctly
// Verify: Server is running on correct port (5000)
```

**3. Database connection errors:**
```bash
# Verify DATABASE_URL is set
echo $DATABASE_URL

# Test connection
npm run db:push

# Check PostgreSQL is running
pg_isready
```

**4. TypeScript errors after schema changes:**
```bash
# Regenerate types
npm run check:types

# Restart TypeScript server in VS Code
# Cmd+Shift+P → "TypeScript: Restart TS Server"
```

**5. Expo bundler issues:**
```bash
# Clear cache
npx expo start --clear

# Reset Metro bundler
rm -rf .expo node_modules
npm install
```

### Debugging Tools

**Client-Side:**
- React Native Debugger
- Expo Dev Tools (shake device → Debug Remote JS)
- Flipper (network inspector, database viewer)
- Console logs: `console.log()`, `console.warn()`, `console.error()`

**Server-Side:**
- Express logging middleware (already configured)
- PostgreSQL logs
- Node.js debugger: `node --inspect`

**Network Debugging:**
```bash
# Test API endpoints
curl http://localhost:5000/api/health

# Test with device token
curl -H "x-zeke-device-token: YOUR_TOKEN" http://localhost:5000/api/tasks

# WebSocket test
wscat -c ws://localhost:5000
```

### Logging Best Practices

```typescript
// ✅ GOOD - Structured logging
console.log('[TasksScreen] Fetching tasks for user:', userId);
console.error('[API] Task creation failed:', error);

// ❌ BAD - Vague logs
console.log('error');
console.log(data);
```

**For production:**
- Use logging service (e.g., Sentry, LogRocket)
- Redact sensitive data (tokens, passwords)
- Log levels: DEBUG, INFO, WARN, ERROR

---

## AI Assistant Best Practices

### When Making Changes

**1. Always Read Before Modifying:**
- ✅ Read the file completely before suggesting changes
- ✅ Understand surrounding context and dependencies
- ❌ Never propose changes to code you haven't read

**2. Check Existing Patterns:**
- ✅ Search for similar implementations in the codebase
- ✅ Follow established patterns (e.g., how other screens handle auth)
- ❌ Don't introduce new patterns without justification

**3. Maintain Design System Consistency:**
- ✅ Use components from `client/components/`
- ✅ Use theme tokens from `client/constants/theme.ts`
- ✅ Follow spacing/typography from `design_guidelines.md`
- ❌ Don't create custom buttons/cards when existing ones work

**4. Test Changes Mentally:**
- ✅ Trace the execution path
- ✅ Consider edge cases (null values, empty arrays, network errors)
- ✅ Verify TypeScript types are correct
- ❌ Don't assume "it should work"

### Security Considerations

**1. Authentication:**
- Always use `authenticateDevice` middleware on protected routes
- Never expose device tokens in logs or responses
- Validate all input parameters

**2. Database Queries:**
- Use Drizzle ORM parameterized queries (prevents SQL injection)
- Validate user permissions before data access
- Sanitize user inputs

**3. External APIs:**
- Never commit API keys to code
- Use environment variables for secrets
- Handle API errors gracefully

**4. File Uploads:**
- Validate file types and sizes
- Use multer with size limits
- Store files securely (not in public directories)

### Performance Optimization

**1. React Query:**
- Set appropriate `staleTime` for each query
- Use query keys correctly for cache invalidation
- Implement optimistic updates for better UX

**2. React Native:**
- Use `FlatList` for long lists (not `ScrollView` with `.map()`)
- Memoize expensive computations with `useMemo`
- Avoid inline functions in render (use `useCallback`)

**3. Database:**
- Add indexes for frequently queried columns
- Use `select()` with specific columns (not `SELECT *`)
- Implement pagination for large datasets

### Documentation

**When to Update Documentation:**
- Adding new features → Update CLAUDE.md
- Changing architecture → Update ARCHITECTURE.md
- Modifying UI patterns → Update design_guidelines.md
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
- ✅ "I've added authentication middleware to the `/api/tasks` route in `server/routes.ts:145`"
- ❌ "I made some changes to handle security"

**Provide Context:**
- ✅ "This change follows the existing pattern from `TasksScreen.tsx` for consistency"
- ❌ "This is how I implemented it"

**Use File References:**
- ✅ "Updated `client/screens/TasksScreen.tsx:67` to add error handling"
- ❌ "Fixed the error in the tasks screen"

---

## Quick Reference

### Essential Files

| File | Purpose |
|------|---------|
| `client/App.tsx` | App entry point |
| `client/context/AuthContext.tsx` | Authentication state |
| `client/lib/api-client.ts` | HTTP client |
| `client/lib/query-client.ts` | React Query setup |
| `client/constants/theme.ts` | Design tokens |
| `server/index.ts` | Server entry point |
| `server/routes.ts` | Main API routes |
| `server/auth-middleware.ts` | Authentication middleware |
| `server/zeke-proxy.ts` | ZEKE backend proxy |
| `shared/schema.ts` | Database schema |

### Common Commands

```bash
# Development
npm run all:dev              # Run everything
npm run expo:dev             # Client only
npm run server:dev           # Server only

# Code Quality
npm run check:types          # Type checking
npm run lint                 # Linting
npm run format               # Format code

# Database
npm run db:push              # Apply schema changes

# Build
npm run server:build         # Build server
npm run expo:static:build    # Build Expo app
```

### Key Hooks

```typescript
useAuth()                    // Authentication state
useSync()                    // Connectivity & sync
useZekeSync()                // ZEKE backend sync
useTheme()                   // Theme tokens
useQuery()                   // Data fetching
useMutation()                // Data mutations
```

### Environment Variables Checklist

- [ ] `DATABASE_URL` - PostgreSQL connection
- [ ] `OPENAI_API_KEY` - AI processing
- [ ] `TWILIO_ACCOUNT_SID` - SMS/Voice
- [ ] `TWILIO_AUTH_TOKEN` - Twilio auth
- [ ] `EXPO_PUBLIC_ZEKE_BACKEND_URL` - ZEKE backend
- [ ] `ZEKE_SHARED_SECRET` - HMAC signing
- [ ] `EXPO_PUBLIC_DOMAIN` - API domain

---

## Additional Resources

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture & ZEKE integration
- **[design_guidelines.md](./design_guidelines.md)** - UI/UX design system
- **[SYNC_GUIDE.md](./SYNC_GUIDE.md)** - Sync architecture
- **[MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)** - Migration documentation
- **[Expo Documentation](https://docs.expo.dev/)** - Expo framework
- **[React Navigation](https://reactnavigation.org/)** - Navigation library
- **[TanStack Query](https://tanstack.com/query/)** - Data fetching
- **[Drizzle ORM](https://orm.drizzle.team/)** - Database ORM

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-01 | Initial CLAUDE.md creation | Claude (AI Assistant) |

---

**Questions or Improvements?**
If you find gaps in this documentation or have suggestions, please update this file or create an issue in the repository.

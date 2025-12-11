# AGENTS.md – ZEKE Personal AI Assistant

## Project Overview
ZEKE is a single-user personal AI assistant for Nate Johnson (CEO, Johnson Bros. Plumbing & Drain Cleaning). It provides high-quality, long-term memory and accessible interaction via SMS and web UI with action-oriented, proactive assistance.

## Setup Commands
- Install deps: `npm install`
- Start dev server: `npm run dev`
- Database migrations: `npm run db:push`
- Run Python agents: `cd python-agents && uv run uvicorn main:app --reload --port 8001`

## Code Style
- TypeScript strict mode
- Use existing patterns from neighboring files
- No explicit React imports (Vite handles JSX transform)
- Always use `@/` path aliases for imports
- Use `import.meta.env.` for frontend env vars (prefix with `VITE_`)

## Architecture

### Stack
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Node.js + Express + TypeScript
- **Database**: SQLite (better-sqlite3) with Drizzle ORM
- **AI**: OpenAI GPT-4o + Python multi-agent system (FastAPI)

### Directory Structure
```
client/src/           # React frontend
  pages/              # Route components
  components/         # Reusable UI components
  hooks/              # Custom React hooks
  lib/                # Utilities (queryClient, utils)
server/               # Express backend
  capabilities/       # Tool modules (search, memory, calendar, etc.)
  db.ts              # Database operations
  agent.ts           # OpenAI chat integration
  tools.ts           # Tool orchestration
  contextRouter.ts   # Context assembly for AI
shared/               # Shared types
  schema.ts          # Drizzle schema + Zod validators
python-agents/        # Python FastAPI microservice
  agents/            # Specialized AI agents
```

### Key Patterns

**Tool Definition Pattern** (in `server/capabilities/`):
```typescript
export const myToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "tool_name",
      description: "What the tool does",
      parameters: { type: "object", properties: {...}, required: [...] },
    },
  },
];

export const myToolPermissions: Record<string, (p: ToolPermissions) => boolean> = {
  tool_name: () => true,
};

export async function executeMyTool(toolName: string, args: Record<string, unknown>): Promise<string | null> {
  switch (toolName) {
    case "tool_name": { /* implementation */ }
    default: return null;
  }
}

export const myToolNames = ["tool_name"];
```

**API Route Pattern**:
```typescript
app.get("/api/resource", async (req, res) => {
  const data = getFromStorage();
  res.json(data);
});
```

**Frontend Query Pattern**:
```typescript
const { data, isLoading } = useQuery({ queryKey: ['/api/resource'] });
```

## Testing Instructions
- Check TypeScript types: `npx tsc --noEmit`
- Verify server starts without errors in console logs
- For frontend changes, manually test in browser

## Database
- Schema defined in `shared/schema.ts` using Drizzle
- Use `createInsertSchema` from `drizzle-zod` for validation
- Always add insert types: `export type InsertX = z.infer<typeof insertXSchema>`
- Always add select types: `export type X = typeof xTable.$inferSelect`

## Important Conventions
- Never delete memory without explicit user instruction
- All conversation titles generated in English
- Prefer `perplexity_search` for complex queries, research
- Use semantic tokens for colors (not hardcoded values)
- Dark theme with coral red accent (`hsl(9, 75%, 61%)`)
- Font: Poppins

## External Dependencies
- OpenAI API for AI responses
- Twilio for SMS
- Perplexity API for web search
- Google Calendar API
- OpenWeatherMap API
- Omi API for lifelogs

## Security Considerations
- Never expose API keys in frontend code
- Use environment variables for all secrets
- Validate all request bodies with Zod schemas
- Access control via ToolPermissions system

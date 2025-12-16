# Contributing

Developer documentation for the ZEKE project.

## Required Runtimes

Versions are pinned in `.tool-versions`:

- **Node.js**: 20.11.x
- **Python**: 3.11.x

The `package.json` enforces `engines.node: ">=20.11.0 <21.0.0"`.

## Local Setup

### Install Dependencies

```bash
# Node.js dependencies
npm install

# Python dependencies (uses pyproject.toml)
pip install .
```

### Environment Variables

Create a `.env` file at the project root. Use `.env.schema` as reference.

**Required variables:**

- `APP_NAME` - Application name
- `APP_ENV` - `development`, `staging`, or `production`
- `PORT` - Server port (default: 5000)
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing key
- `OPENAI_API_KEY` - OpenAI API key
- `LOG_LEVEL` - `debug`, `info`, `warn`, or `error`

### Database Setup

```bash
npm run db:init    # Initialize SQLite database
npm run db:push    # Apply Drizzle migrations
```

## Running the Dev Server

```bash
npm run dev
```

Starts both Express backend and Vite frontend on port 5000.

For Python agents (optional):

```bash
cd python_agents && uvicorn main:app --reload --port 5001
```

## Running Tests

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint          # All lints
npm run lint:bidi     # Bidi character check only
```

### Python Linting

```bash
pip install ruff
ruff check python_agents
```

### Smoke Test

Requires running server:

```bash
npm run smoke
```

Tests `/healthz` and `/readyz` endpoints.

### Database Connectivity Test

```bash
node evals/db-connect.js
```

Requires `DATABASE_URL` and the `pg` package.

## Deployment

The project is deployed via Replit. There is no manual deployment process.

- CI runs on push/PR via GitHub Actions (`.github/workflows/ci.yml`)
- Production deployments are managed through Replit's deployment system
- No deployment scripts are included in this repository

## Internal Documentation

Access rendered AGENTS.md at `/docs` when the server is running.

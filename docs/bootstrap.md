# Bootstrap and Database Setup

This project uses SQLite for local development. The schema is created automatically by `server/db.ts`.

## Fresh setup
1. Copy `.env.example` to `.env` and fill in any required keys.
2. Run the bootstrap helper:

```bash
script/bootstrap
```

The script will install Node dependencies via `npm ci`, install Python dependencies with `uv sync --locked`, initialize the SQLite database (`npm run db:init`), and start the dev server unless `SKIP_START=1` is set.

## Database initialization
- The database file `zeke.db` (and any other `*.db`) should **not** be committed. They are ignored via `.gitignore`.
- To (re)create the schema without starting the server, run:

```bash
npm run db:init
```

## Migrations
Schema changes are managed in `shared/schema.ts`. To generate or push migrations to a Postgres target, set `DATABASE_URL` and use Drizzle:

```bash
npm run db:push
```

For local SQLite development the schema is applied by `server/db.ts` during initialization, so a new clone can be brought up without a pre-built database file.

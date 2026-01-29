#!/usr/bin/env sh
set -eu

# Minimal, production-friendly bootstrap.
#
# Responsibilities:
# - Ensure required env is present
# - Optionally wait for Postgres
# - Apply DB schema (drizzle push)
# - Start ZEKE

: "${PORT:=5000}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] ERROR: DATABASE_URL is not set" >&2
  exit 1
fi

# Wait for Postgres to accept connections (best-effort).
# We can't rely on pg_isready being present; just loop on TCP using node.
echo "[entrypoint] Waiting for database to be reachable..."
node - <<'NODE'
const { Client } = require('pg');
const url = process.env.DATABASE_URL;
const timeoutMs = Number(process.env.DB_WAIT_TIMEOUT_MS || 60000);
const start = Date.now();

async function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

(async () => {
  while (true) {
    try {
      const c = new Client({ connectionString: url });
      await c.connect();
      await c.query('select 1 as ok');
      await c.end();
      process.exit(0);
    } catch (e) {
      if (Date.now() - start > timeoutMs) {
        console.error('[entrypoint] DB wait timeout:', e?.message || e);
        process.exit(1);
      }
      await sleep(1000);
    }
  }
})();
NODE

echo "[entrypoint] Applying database schema (drizzle push)"
# If this fails, we want a hard fail in prod (better than half-up).
npm run db:push

echo "[entrypoint] Starting ZEKE (port ${PORT})"
exec npm run start

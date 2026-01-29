#!/usr/bin/env bash
set -euo pipefail

# Minimal smoke test for the dockerized ZEKE stack.
# Assumes docker compose is installed and you have a valid .env.

docker compose up -d --build

echo "[smoke] waiting for /healthz"
for i in {1..40}; do
  if curl -fsS "http://localhost:${PORT:-5000}/healthz" >/dev/null; then
    echo "[smoke] healthz ok"
    break
  fi
  sleep 2
  if [ "$i" = "40" ]; then
    echo "[smoke] healthz failed" >&2
    exit 1
  fi
done

echo "[smoke] checking /readyz"
curl -fsS "http://localhost:${PORT:-5000}/readyz" || true

echo "[smoke] ok"

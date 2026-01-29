# ZEKE Docker (production)

Goal: make ZEKE self-contained on an always-on laptop/server.

## Quick start

1) Copy env template:

```bash
cp .env.docker.example .env
```

2) Edit `.env` and set at minimum:
- `OPENAI_API_KEY`
- `JWT_SECRET`
- `POSTGRES_PASSWORD`

3) Boot:

```bash
docker compose up -d --build
```

4) Verify:

```bash
curl http://localhost:5000/healthz
curl http://localhost:5000/readyz
```

## Notes

- This uses a local Postgres container with a persistent volume (`zeke_db_data`).
- The app container runs `npm run db:push` on startup to apply schema.
- For tighter security, bind the app to loopback only:
  - change `ports` to `127.0.0.1:5000:5000` and access over Tailscale (`tailscale serve` or local port-forwarding).

## Debugging

```bash
# App logs
docker logs -f zeke_app

# DB logs
docker logs -f zeke_db

# Shell into app container
docker exec -it zeke_app sh
```

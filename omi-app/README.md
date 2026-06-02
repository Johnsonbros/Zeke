# Zeke Omi Bridge

Public Omi integration app for routing Omi/Limitless transcripts, memories, audio-byte pings, and chat tool requests into Zeke.

This package is intentionally self-contained so it can be used as the GitHub source link for the Omi app listing and deployed independently from the older Zeke app.

## What It Does

- Accepts Omi real-time transcript webhooks.
- Accepts Omi memory creation webhooks.
- Accepts optional raw audio byte webhooks for future custom STT work.
- Exposes an Omi Chat Tools manifest at `/.well-known/omi-tools.json`.
- Provides an `ask_zeke` chat tool endpoint at `/tools/ask`.
- Optionally forwards received events to a private Zeke/Hermes endpoint through `ZEKE_FORWARD_URL`.
- Stores only event metadata by default. Full payload storage is opt-in.

## Omi App Configuration

Use these fields when creating or editing the app in Omi:

| Field | Value |
| --- | --- |
| App Name | `Zeke Omi Bridge` |
| Category | `Productivity` |
| App Home URL | `https://YOUR_DEPLOYMENT_URL/` |
| Webhook URL, real-time transcript | `https://YOUR_DEPLOYMENT_URL/webhook/transcript` |
| Webhook URL, memory trigger | `https://YOUR_DEPLOYMENT_URL/webhook/memory` |
| Webhook URL, audio bytes | `https://YOUR_DEPLOYMENT_URL/webhook/audio` |
| Setup Completed URL | `https://YOUR_DEPLOYMENT_URL/setup-completed` |
| Chat Tools Manifest URL | `https://YOUR_DEPLOYMENT_URL/.well-known/omi-tools.json` |
| GitHub Source URL | `https://github.com/Johnsonbros/Zeke/tree/main/omi-app` |

For quick smoke tests, a temporary Cloudflare URL works. For a public Omi listing, use a stable HTTPS deployment that is available 24/7 and responds quickly.

## Run Locally

```bash
cd omi-app
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --host 0.0.0.0 --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

Transcript smoke test:

```bash
curl -X POST http://127.0.0.1:8000/webhook/transcript \
  -H 'Content-Type: application/json' \
  -d '[{"text":"Zeke Omi bridge smoke test","speaker":"SPEAKER_00"}]'
```

Chat tool smoke test:

```bash
curl -X POST http://127.0.0.1:8000/tools/ask \
  -H 'Content-Type: application/json' \
  -d '{"uid":"test","app_id":"zeke-omi-bridge","tool_name":"ask_zeke","request":"remember that the bridge is live"}'
```

## Deploy

The app can run on Railway, Render, Fly.io, a VPS, or behind an existing reverse proxy.

Minimum production requirements:

- HTTPS public URL.
- `PORT` set by the host or default `8000`.
- Persistent volume if you want local event metadata retained.
- `ZEKE_FORWARD_URL` set when the private Zeke/Hermes receiver is ready.
- `STORE_PAYLOADS=false` unless you explicitly need raw payload retention.

## Environment Variables

See `.env.example` for all options.

Key settings:

- `ZEKE_FORWARD_URL`: optional private endpoint that receives normalized events.
- `OMI_WEBHOOK_TOKEN`: optional shared token. Leave empty unless the Omi configuration can send it.
- `OMI_DEBUG_TOKEN`: enables protected `/events` inspection.
- `STORE_PAYLOADS`: defaults to `false`; set `true` only for short debug windows.
- `SAVE_AUDIO`: defaults to `false`; set `true` only when intentionally collecting raw audio chunks.

## Privacy Notes

Voice transcripts and audio can be sensitive. The default runtime records metadata, extracted text, endpoint path, uid, and timestamps, but does not persist full payloads or audio bytes. Enable full payload or audio storage only for a controlled debug session.

## Omi Docs Used

- Integration apps: https://docs.omi.me/doc/developer/apps/Integrations
- Chat tools: https://docs.omi.me/doc/developer/apps/ChatTools
- Publishing: https://docs.omi.me/doc/developer/apps/Submitting
- Open-source app structure: https://docs.omi.me/doc/developer/apps/OpenSource

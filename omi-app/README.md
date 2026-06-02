# Zeke Hermes Omi App

Public Omi integration app for routing Omi/Limitless transcripts, memories, optional audio-byte pings, and chat tool requests into Hermes-backed Zeke workflows.

This is not an OpenClaw bridge. Omi sends webhook events to this app; this app normalizes the events and forwards them to Hermes through one of the configured receiver modes.

## Receiver Modes

| Mode | Use When |
| --- | --- |
| `none` | Local smoke testing only. Events are accepted and logged but not forwarded. |
| `webhook` | A private Hermes/Zeke receiver URL is available. The app POSTs normalized events to it. |
| `paperclip_cli` | The app runs on the same host as Paperclip and can create Paperclip issues for Hermes agents. |

The production direction for Johnson Bros is `paperclip_cli` or an internal `webhook` receiver that writes into Paperclip/Hermes. Paperclip remains the execution gate; Omi is the voice intake.

## What It Does

- Accepts Omi real-time transcript webhooks.
- Accepts Omi memory creation webhooks.
- Accepts optional raw audio byte webhooks for future custom STT work.
- Exposes an Omi Chat Tools manifest at `/.well-known/omi-tools.json`.
- Provides an `ask_hermes` chat tool endpoint at `/tools/ask`.
- Optionally forwards normalized events to Hermes/Paperclip.
- Stores metadata by default; full payload and audio storage are opt-in.

## Omi App Configuration

Use these fields when creating or editing the app in Omi:

| Field | Value |
| --- | --- |
| App Name | `Zeke Hermes` |
| Category | `Productivity` |
| App Home URL | `https://YOUR_DEPLOYMENT_URL/` |
| Real-Time Transcript Webhook | `https://YOUR_DEPLOYMENT_URL/webhook/transcript` |
| Memory Creation Webhook | `https://YOUR_DEPLOYMENT_URL/webhook/memory` |
| Audio Bytes Webhook | `https://YOUR_DEPLOYMENT_URL/webhook/audio` |
| Setup Completed URL | `https://YOUR_DEPLOYMENT_URL/setup-completed` |
| Chat Tools Manifest URL | `https://YOUR_DEPLOYMENT_URL/.well-known/omi-tools.json` |
| GitHub Source URL | `https://github.com/Johnsonbros/Zeke/tree/main/omi-app` |

For a public Omi listing, use a stable HTTPS deployment that is available 24/7 and responds quickly. A temporary tunnel is fine only for development testing.

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
  -d '[{"text":"Zeke Hermes Omi app smoke test","speaker":"SPEAKER_00"}]'
```

Chat tool smoke test:

```bash
curl -X POST http://127.0.0.1:8000/tools/ask \
  -H 'Content-Type: application/json' \
  -d '{"uid":"test","app_id":"zeke-hermes","tool_name":"ask_hermes","request":"create a Hermes task from this Omi message"}'
```

## Deploy

The app can run on Railway, Render, Fly.io, a VPS, or behind an existing reverse proxy.

Minimum production requirements:

- HTTPS public URL.
- `PORT` set by the host or default `8000`.
- Persistent volume if local event metadata should survive restarts.
- `HERMES_FORWARD_MODE` set to `webhook` or `paperclip_cli` for real routing.
- `STORE_PAYLOADS=false` unless raw payload retention is explicitly needed.

## Environment Variables

See `.env.example` for all options.

Key settings:

- `HERMES_FORWARD_MODE`: `none`, `webhook`, or `paperclip_cli`.
- `HERMES_FORWARD_URL`: private Hermes/Zeke endpoint for `webhook` mode.
- `HERMES_FORWARD_TOKEN`: optional bearer token for the private forward URL.
- `PAPERCLIP_COMPANY_ID`: required for `paperclip_cli` mode.
- `PAPERCLIP_ASSIGNEE_AGENT_ID`: optional Hermes/Paperclip agent assignment.
- `OMI_WEBHOOK_TOKEN`: optional shared webhook token if the Omi app can send one.
- `OMI_DEBUG_TOKEN`: enables protected `/events` inspection.
- `STORE_PAYLOADS`: defaults to `false`; set `true` only for short debug windows.
- `SAVE_AUDIO`: defaults to `false`; set `true` only when intentionally collecting raw audio chunks.

## Privacy Notes

Voice transcripts and audio can be sensitive. The default runtime records metadata, extracted text, endpoint path, uid, session id, and timestamps, but does not persist full payloads or audio bytes. Enable full payload or audio storage only for a controlled debug session.

## Omi Docs Used

- Integration apps: https://docs.omi.me/doc/developer/apps/Integrations
- Chat tools: https://docs.omi.me/doc/developer/apps/ChatTools
- Publishing: https://docs.omi.me/doc/developer/apps/Submitting
- Open-source app structure: https://docs.omi.me/doc/developer/apps/OpenSource

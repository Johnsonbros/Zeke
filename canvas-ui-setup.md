# Zeke Canvas & Control UI Setup Guide

## Quick Access

- **Control UI (HTTPS):** https://zeke.tail5b81a2.ts.net:8443/
- **Canvas Dashboard:** https://zeke.tail5b81a2.ts.net:8443/__openclaw__/canvas/dashboard.html
- **Canvas Test Page:** https://zeke.tail5b81a2.ts.net:8443/__openclaw__/canvas/test.html
- **Password:** Sent via SMS to your phone (6-digit OTP from +18577546617)

## Architecture

```
Your Browser (Chrome)
    │
    │ HTTPS (Tailscale auto-cert)
    ▼
Tailscale Serve (:8443)
    │
    │ proxy → http://127.0.0.1:19001
    ▼
OpenClaw Gateway (:19001)
    ├── Control UI (chat, config, agents, sessions)
    ├── Canvas Host (/__openclaw__/canvas/)
    ├── WebSocket (real-time agent communication)
    └── Agent (Claude Opus 4.6 / C3-PO)
```

## Prerequisites

- Tailscale running on both this instance and your device
- Gateway running: `pnpm gateway:dev` (from /home/ubuntu/openclaw)
- Tailscale Serve enabled: `sudo tailscale serve --bg --https 8443 http://127.0.0.1:19001`

## Starting the Gateway

```bash
cd /home/ubuntu/openclaw
pnpm gateway:dev
```

The gateway binds to the Tailscale interface (100.112.227.117).

## Config Files

- **Gateway config:** `~/.openclaw-dev/openclaw.json`
- **Agent auth:** `~/.openclaw-dev/agents/dev/agent/auth-profiles.json`
- **API keys:** `~/.openclaw/.env` (Anthropic, OpenAI, Twilio, etc.)
- **Canvas files:** `~/.openclaw/canvas/` (HTML files served by canvas host)
- **Skills:** `~/.openclaw/skills/` (local skills for the agent)

## Canvas Dashboard

The Zeke Command Center dashboard is at `~/.openclaw/canvas/dashboard.html`. Shows:
- Live clock (ET timezone)
- Memory/disk/CPU stats
- Service status (Gateway, Postgres, Canvas, Tailscale)
- Agent info (Claude Opus 4.6 / C3-PO)
- Full Tailscale network with online indicators

## Adding New Canvas Pages

1. Create an HTML file in `~/.openclaw/canvas/`
2. Access via `https://zeke.tail5b81a2.ts.net:8443/__openclaw__/canvas/<filename>.html`
3. Live reload is enabled — save a file and connected canvases auto-refresh

## SMS OTP Login

To generate a new 6-digit OTP:

```bash
# Generate code
OTP=$(shuf -i 100000-999999 -n 1)

# Send via Twilio
source ~/.openclaw/.env
curl -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json" \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  --data-urlencode "From=$TWILIO_PHONE_NUMBER" \
  --data-urlencode "To=+16176868763" \
  --data-urlencode "Body=Your Zeke gateway code: $OTP"

# Update gateway password
# Edit ~/.openclaw-dev/openclaw.json → gateway.auth.password
# Restart gateway
```

## Tailscale Network

| Device | IP | OS |
|--------|-----|-----|
| zeke (this instance) | 100.112.227.117 | Linux |
| flex-large | 100.66.116.13 | Linux |
| Workstation | 100.93.92.38 | Windows |
| Workstation-Ubuntu | 100.109.248.126 | Linux |
| Google Pixel 8 | 100.115.95.24 | Android |
| iPhone | 100.114.222.128 | iOS |
| JohnsonBros01 | 100.112.224.45 | Windows |

## Troubleshooting

### "HTTPS or localhost required"
The Control UI WebSocket needs a secure context. Use the Tailscale HTTPS URL, not the raw IP.

### "Unauthorized" on canvas
Canvas auth requires either localhost, bearer token, or an authenticated WebSocket client from the same IP. Use the HTTPS URL through Tailscale Serve.

### Gateway not starting
Check: `ss -ltnp | grep 19001` and `tail -30 /tmp/openclaw/openclaw-2026-*.log`

### Tailscale Serve commands
```bash
# Check status
tailscale serve status

# Add HTTPS proxy
sudo tailscale serve --bg --https 8443 http://127.0.0.1:19001

# Remove
sudo tailscale serve --https=8443 off
```

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse

APP_NAME = os.getenv("APP_NAME", "Zeke Hermes")
DATA_DIR = Path(os.getenv("DATA_DIR", "/data"))
EVENTS_FILE = DATA_DIR / "events.jsonl"
AUDIO_DIR = DATA_DIR / "audio"

HERMES_FORWARD_MODE = os.getenv("HERMES_FORWARD_MODE", "none").strip().lower()
HERMES_FORWARD_URL = os.getenv("HERMES_FORWARD_URL", "").strip()
HERMES_FORWARD_TOKEN = os.getenv("HERMES_FORWARD_TOKEN", "").strip()

OMI_WEBHOOK_TOKEN = os.getenv("OMI_WEBHOOK_TOKEN", "").strip()
OMI_DEBUG_TOKEN = os.getenv("OMI_DEBUG_TOKEN", "").strip()
STORE_PAYLOADS = os.getenv("STORE_PAYLOADS", "false").strip().lower() in {"1", "true", "yes", "on"}
SAVE_AUDIO = os.getenv("SAVE_AUDIO", "false").strip().lower() in {"1", "true", "yes", "on"}

PAPERCLIP_COMPANY_ID = os.getenv("PAPERCLIP_COMPANY_ID", "").strip()
PAPERCLIP_ASSIGNEE_AGENT_ID = os.getenv("PAPERCLIP_ASSIGNEE_AGENT_ID", "").strip()
PAPERCLIP_STATUS = os.getenv("PAPERCLIP_STATUS", "todo").strip()
PAPERCLIP_PRIORITY = os.getenv("PAPERCLIP_PRIORITY", "medium").strip()
PAPERCLIP_CLI = os.getenv("PAPERCLIP_CLI", "paperclipai").strip()
PAPERCLIP_CONTAINER = os.getenv("PAPERCLIP_CONTAINER", "").strip()

app = FastAPI(title=APP_NAME, version="0.1.0")


def utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def append_event(event: dict[str, Any]) -> None:
    ensure_data_dir()
    with EVENTS_FILE.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, separators=(",", ":"), ensure_ascii=False) + "\n")


def read_recent_events(limit: int = 25) -> list[dict[str, Any]]:
    if not EVENTS_FILE.exists():
        return []
    events: list[dict[str, Any]] = []
    for line in EVENTS_FILE.read_text(encoding="utf-8").splitlines()[-limit:]:
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return events


def extract_text(payload: Any) -> str:
    if isinstance(payload, list):
        parts = []
        for item in payload:
            text = extract_text(item)
            if text:
                parts.append(text)
        return " ".join(parts)

    if not isinstance(payload, dict):
        return ""

    for key in ("request", "message", "text", "transcript", "content"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    memory = payload.get("memory")
    if isinstance(memory, dict):
        text = extract_text(memory)
        if text:
            return text

    structured = payload.get("structured")
    if isinstance(structured, dict):
        title = structured.get("title")
        overview = structured.get("overview")
        parts = [part for part in (title, overview) if isinstance(part, str) and part.strip()]
        if parts:
            return " - ".join(parts)

    for key in ("segments", "transcript_segments"):
        segments = payload.get(key)
        if isinstance(segments, list):
            parts = []
            for segment in segments:
                if isinstance(segment, dict) and isinstance(segment.get("text"), str):
                    parts.append(segment["text"].strip())
            if parts:
                return " ".join(part for part in parts if part)

    return ""


def compact_payload(payload: Any) -> Any:
    if STORE_PAYLOADS:
        return payload
    if isinstance(payload, list):
        return {"type": "list", "items": len(payload)}
    if isinstance(payload, dict):
        return {"type": "dict", "keys": sorted(str(key) for key in payload.keys())[:40]}
    return {"type": type(payload).__name__}


def make_event(event_type: str, request: Request, payload: Any, text: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    query = dict(request.query_params)
    event = {
        "id": str(uuid.uuid4()),
        "received_at": utc_now(),
        "app": APP_NAME,
        "event_type": event_type,
        "path": request.url.path,
        "uid": query.get("uid"),
        "session_id": query.get("session_id"),
        "sample_rate": query.get("sample_rate"),
        "text": text,
        "payload": compact_payload(payload),
    }
    if extra:
        event.update(extra)
    return event


def validate_omi_token(x_omi_token: str | None) -> None:
    if OMI_WEBHOOK_TOKEN and x_omi_token != OMI_WEBHOOK_TOKEN:
        raise HTTPException(status_code=401, detail="invalid omi token")


async def forward_to_webhook(event: dict[str, Any]) -> dict[str, Any]:
    if not HERMES_FORWARD_URL:
        return {"mode": "webhook", "ok": False, "error": "HERMES_FORWARD_URL is not set"}

    headers = {"Content-Type": "application/json"}
    if HERMES_FORWARD_TOKEN:
        headers["Authorization"] = f"Bearer {HERMES_FORWARD_TOKEN}"

    async with httpx.AsyncClient(timeout=8.0) as client:
        response = await client.post(HERMES_FORWARD_URL, headers=headers, json=event)
    return {"mode": "webhook", "ok": response.status_code < 400, "status_code": response.status_code}


def paperclip_command(args: list[str]) -> list[str]:
    if PAPERCLIP_CONTAINER:
        return ["docker", "exec", PAPERCLIP_CONTAINER, PAPERCLIP_CLI, *args]
    return [PAPERCLIP_CLI, *args]


def paperclip_issue_body(event: dict[str, Any]) -> str:
    text = event.get("text") or "No transcript text extracted."
    return "\n".join(
        [
            "Created from Omi voice intake.",
            "",
            f"Event type: {event.get('event_type')}",
            f"Received at: {event.get('received_at')}",
            f"Omi uid: {event.get('uid') or 'unknown'}",
            f"Session id: {event.get('session_id') or 'none'}",
            "",
            "Transcript / request:",
            text,
            "",
            f"Event id: {event.get('id')}",
        ]
    )


async def forward_to_paperclip(event: dict[str, Any]) -> dict[str, Any]:
    if not PAPERCLIP_COMPANY_ID:
        return {"mode": "paperclip_cli", "ok": False, "error": "PAPERCLIP_COMPANY_ID is not set"}

    title_text = (event.get("text") or event.get("event_type") or "Omi voice intake").strip()
    title = f"Omi: {title_text[:70]}" if title_text else "Omi voice intake"
    args = [
        "issue",
        "create",
        "--company-id",
        PAPERCLIP_COMPANY_ID,
        "--title",
        title,
        "--description",
        paperclip_issue_body(event),
        "--status",
        PAPERCLIP_STATUS,
        "--priority",
        PAPERCLIP_PRIORITY,
        "--json",
    ]
    if PAPERCLIP_ASSIGNEE_AGENT_ID:
        args.extend(["--assignee-agent-id", PAPERCLIP_ASSIGNEE_AGENT_ID])

    cmd = paperclip_command(args)
    proc = await asyncio.create_subprocess_exec(*cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = await proc.communicate()
    return {
        "mode": "paperclip_cli",
        "ok": proc.returncode == 0,
        "exit_code": proc.returncode,
        "stdout": stdout.decode("utf-8", errors="replace")[-2000:],
        "stderr": stderr.decode("utf-8", errors="replace")[-1000:],
    }


async def forward_event(event: dict[str, Any]) -> dict[str, Any]:
    if HERMES_FORWARD_MODE == "none":
        return {"mode": "none", "ok": True, "forwarded": False}
    if HERMES_FORWARD_MODE == "webhook":
        return await forward_to_webhook(event)
    if HERMES_FORWARD_MODE == "paperclip_cli":
        return await forward_to_paperclip(event)
    return {"mode": HERMES_FORWARD_MODE, "ok": False, "error": "unknown HERMES_FORWARD_MODE"}


async def parse_request_payload(request: Request) -> Any:
    content_type = request.headers.get("content-type", "")
    body = await request.body()
    if "application/json" in content_type:
        try:
            return json.loads(body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return {"_raw": body.decode("utf-8", errors="replace")}
    return {"_content_type": content_type, "_bytes": len(body), "_sample_hex": body[:64].hex()}


@app.get("/")
async def root() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "zeke-hermes-omi-app",
        "app": APP_NAME,
        "forward_mode": HERMES_FORWARD_MODE,
        "tools_manifest": "/.well-known/omi-tools.json",
    }


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"status": "ok", "service": "zeke-hermes-omi-app", "events": len(read_recent_events(1000000))}


@app.get("/setup-completed")
async def setup_completed() -> dict[str, Any]:
    configured = HERMES_FORWARD_MODE == "none" or bool(HERMES_FORWARD_URL) or bool(PAPERCLIP_COMPANY_ID)
    return {"is_setup_completed": configured}


@app.get("/.well-known/omi-tools.json")
async def omi_tools() -> dict[str, Any]:
    return {
        "tools": [
            {
                "name": "ask_hermes",
                "description": "Send a request to the user's private Hermes-backed Zeke workflow. Use this when the user asks Zeke or Hermes to remember something, create a task, inspect an issue, summarize a voice note, or route work from an Omi conversation.",
                "endpoint": "/tools/ask",
                "method": "POST",
                "parameters": {
                    "properties": {
                        "request": {"type": "string", "description": "The user's request or instruction for Hermes/Zeke."},
                        "priority": {"type": "string", "description": "Optional priority such as low, medium, high, or urgent."},
                    },
                    "required": ["request"],
                },
                "auth_required": False,
                "status_message": "Sending to Hermes...",
            }
        ],
        "chat_messages": {"enabled": True, "target": "app", "notify": False},
    }


@app.get("/webhook/{kind}")
async def webhook_validation(kind: str) -> dict[str, Any]:
    return {"status": "ok", "service": "zeke-hermes-omi-app", "path": f"/webhook/{kind}", "accepts": ["POST"]}


@app.post("/webhook/transcript")
async def transcript_webhook(request: Request, x_omi_token: str | None = Header(default=None)) -> dict[str, Any]:
    validate_omi_token(x_omi_token)
    payload = await parse_request_payload(request)
    text = extract_text(payload)
    event = make_event("real_time_transcript", request, payload, text)
    append_event(event)
    forward = await forward_event(event)
    return {"status": "ok", "success": True, "event_id": event["id"], "forward": forward}


@app.post("/webhook/memory")
async def memory_webhook(request: Request, x_omi_token: str | None = Header(default=None)) -> dict[str, Any]:
    validate_omi_token(x_omi_token)
    payload = await parse_request_payload(request)
    text = extract_text(payload)
    event = make_event("memory_created", request, payload, text)
    append_event(event)
    forward = await forward_event(event)
    return {"status": "ok", "success": True, "event_id": event["id"], "forward": forward}


@app.post("/webhook/audio")
async def audio_webhook(request: Request, x_omi_token: str | None = Header(default=None)) -> dict[str, Any]:
    validate_omi_token(x_omi_token)
    body = await request.body()
    audio_path = None
    if SAVE_AUDIO:
        AUDIO_DIR.mkdir(parents=True, exist_ok=True)
        audio_path = AUDIO_DIR / f"{utc_now().replace(':', '').replace('-', '')}-{uuid.uuid4()}.pcm"
        audio_path.write_bytes(body)
    payload = {"_content_type": request.headers.get("content-type", ""), "_bytes": len(body), "saved_path": str(audio_path) if audio_path else None}
    event = make_event("audio_bytes", request, payload, "", {"audio_bytes": len(body), "audio_saved": bool(audio_path)})
    append_event(event)
    forward = await forward_event(event)
    return {"status": "ok", "success": True, "event_id": event["id"], "forward": forward}


@app.post("/tools/ask")
async def ask_hermes(request: Request) -> JSONResponse:
    payload = await parse_request_payload(request)
    text = extract_text(payload)
    if not text:
        return JSONResponse({"error": "Missing required parameter: request"}, status_code=400)
    event = make_event("chat_tool_ask_hermes", request, payload, text)
    append_event(event)
    forward = await forward_event(event)
    if not forward.get("ok"):
        return JSONResponse({"error": "Hermes receiver is not ready", "event_id": event["id"], "forward": forward}, status_code=503)
    return JSONResponse({"result": f"Sent to Hermes: {text[:180]}", "event_id": event["id"]})


@app.get("/events")
async def events(limit: int = 25, x_debug_token: str | None = Header(default=None)) -> dict[str, Any]:
    if not OMI_DEBUG_TOKEN or x_debug_token != OMI_DEBUG_TOKEN:
        raise HTTPException(status_code=403, detail="forbidden")
    return {"events": read_recent_events(limit)}


@app.get("/robots.txt")
async def robots() -> PlainTextResponse:
    return PlainTextResponse("User-agent: *\nDisallow: /events\nDisallow: /data\n")

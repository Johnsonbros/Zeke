# Limitless — Communications API Specification

> **Analysis Date:** 2026-06-24
> **Subject:** `ai.limitless.mobile` 2.0.10 (build 223)
> **Confidence:** 🟢 confirmed · 🟡 inferred · 🔴 gap
> **Evidence base:** `limitless/analysis/_shared/INTEL.md`

Reverse-engineered, independent reconstruction of the Limitless Pendant app's communication contract.
Not official. Machine-readable artifacts exist alongside the source analysis (`openapi.comms.yaml`,
`asyncapi.realtime.yaml`).

---

## Table of Contents

1. [Transports](#1-transports)
2. [Authentication](#2-authentication)
3. [REST API](#3-rest-api)
4. [Connect-RPC / protobuf](#4-connect-rpc--protobuf)
5. [Real-Time Audio Pipeline](#5-real-time-audio-pipeline)
6. [Meetings / WebRTC](#6-meetings--webrtc)
7. [Pendant (BLE)](#7-pendant-ble)
8. [Telemetry / Config](#8-telemetry--config)
9. [Security Observations](#9-security-observations)

---

## 1. Transports

| # | Transport | Endpoint | Auth | Direction |
|---|-----------|----------|------|-----------|
| T1 | HTTPS REST/JSON | `https://api.limitless.ai` (+ internal/fast variants) | Bearer Firebase ID token | req/resp |
| T2 | Connect-RPC / protobuf | `https://api.limitless.ai` (`api.client.*`) | Bearer | unary + server-stream |
| T3 | WebSocket (audio) | `wss://api-fast-internal.limitless.ai` 🟡 | Bearer / session token | bidirectional stream |
| T4 | WebRTC (Daily.co) | `c.daily.co` / `gs.daily.co` | Daily meeting token | media + data |
| T5 | BLE (CoreBluetooth) | Pendant peripheral | pairing + signed manifest | bidirectional |
| T6 | Push | FCM + Expo (`exp.host`) | device token | server→client |

---

## 2. Authentication

🟢 Confirmed:

- **Providers:** Firebase **email-link**, **Google Sign-In**, **Apple Sign-In**.
- **Token:** Firebase ID token (`securetoken.google.com`) sent as `Authorization: Bearer <jwt>`.
- **RPC:** `api.client.SignInRequest{ email, email_link }` → session.
- **Push registration:** `POST exp.host/api/v2/push/updateDeviceToken`; FCM via `fcmtoken.googleapis.com`.

---

## 3. REST API

Transport **T1** — host `api*.limitless.ai`.

| Method | Path | Module | Purpose | Conf |
|--------|------|--------|---------|------|
| POST | `/v3/transcribe` | audio | Transcribe an audio blob | 🟢 |
| POST | `/v3/search` | search | Search lifelog | 🟢 |
| POST | `/v3/account/delete-user` | account | Delete account | 🟢 |
| POST | `/v3/account/renewScopes` | account | Re-grant OAuth scopes | 🟢 |
| POST | `/v3/device/upload-data-ordered` | pendant | Ordered device data upload | 🟢 |
| GET | `/v3/meetings/summary` | meetings | Meeting summary | 🟢 |
| GET | `/v3/meetings/live-notes` | meetings | Live notes (markdown) | 🟢 |
| POST | `/v3/meetings/delete-audio-frames` | meetings | Purge captured frames | 🟢 |
| POST | `/v3/meetings/prepareAborted` | meetings | Recover aborted meeting | 🟢 |
| POST | `/v3/pendant/transcribe` | pendant | Pendant-side transcription | 🟢 |
| GET | `/v3/pendant/audio-encryption` | pendant | Fetch audio encryption params | 🟢 |
| GET | `/v3/pendant/getSignedManifest` | pendant | Signed firmware/data manifest | 🟢 |
| POST | `/v3/pendant/provisionPendant` | pendant | Provision device (**admin**) | 🟢 |
| POST | `/v3/pendant/assign-user-devices` | pendant | Bind device→user | 🟢 |
| POST | `/v3/pendant-upload-data-ordered` | pendant | Ordered pendant upload | 🟢 |
| POST | `/v3/pendant-orders/updateAdditionalInfo` | pendant | Update hardware order | 🟢 |
| GET | `/v3/user-ip-geolocation` | account | IP geolocation gate | 🟢 |
| GET | `/v2/call/metadata` | meetings | Call metadata | 🟢 |
| POST | `/v2/call/export` | meetings | Export a call | 🟢 |
| POST | `/v2/assistant` | chat | Assistant query | 🟢 |
| POST | `/v2/phone-number/import` | contacts | Twilio number import | 🟢 |
| POST | `/v4/chat` | chat | AI chat turn | 🟢 |
| POST | `/v4/chat/warm-cache` | chat | Pre-warm chat context | 🟢 |
| GET | `/auth/userinfo` | auth | Current user | 🟢 |
| GET | `/auth/contacts` | contacts | Contacts | 🟢 |
| GET | `/auth/directory` | contacts | Org directory | 🟢 |
| GET | `/auth/tasks` | contacts | Tasks | 🟢 |

> 🔴 Request/response bodies are not statically recoverable from Hermes bytecode at field level.

---

## 4. Connect-RPC / protobuf

Transport **T2** — package `api.client.*`. Service 🟡 `api.client.APIServiceV3`. Confirmed messages:

```
AccountCreateRequest { email, id_token }            🟢 name / 🟡 fields
AccountStatusRequest { user_id }  → AccountStatusResponse { active, plan, Account }
UpdateUserMetadataRequest { metadata } → UserMetadataResponse { metadata }
SignInRequest { email, EmailLinkAuthentication }
SummaryResponseChunk { Preamble | Text | Error }    // server-streamed summary
TranscribeResponse { text }
ClientActivityMeeting { Documents[], Participant[] }
```

---

## 5. Real-Time Audio Pipeline

Transport **T3** — package `client.audio.*`. Bidirectional message envelope discriminated by
`WebsocketResponseType` (🟢 enum):

```
client → server: AudioStart{session_id, sample_rate, channels}
                 AudioMessage{seq, pcm}           // streamed PCM frames
                 AudioHeartbeat{seq, timestamp_ms}
                 AudioStop{session_id}
server → client: Transcript / AudioTranscriptWord{word,start_ms,end_ms,confidence}
                 AudioChannelTranscript
                 AudioHealthStatusUpdate{battery_pct, connected}
                 AudioError{message}
                 ActivityAudio
```

Supporting: `AudioDataExport`, `client.audio.Transcript`. 🟡 Framing is length-prefixed protobuf over
WebSocket on `api-fast-internal`.

---

## 6. Meetings / WebRTC

Transport **T4** — Daily.co.

- App provisions a Daily room (`c.daily.co/call-machine/versioned`), signaling via `gs.daily.co`.
- Native `WebRTC.framework` + `ReactNativeDailyJSScreenShareExtension.framework`.
- Events (🟢): `CPU_LOAD_CHANGE`, `SPEAKER_PERMISSIONS_FLOW_CANCELLED`, live-streaming start/update.
- Server-side meeting artifacts pulled via REST `/v3/meetings/*` + `client.meeting.LiveNotes`.

---

## 7. Pendant (BLE)

Transport **T5**.

- `bluetooth-central` background mode; CoreBluetooth peripheral = Limitless Pendant.
- **Flow:** discover → connect → `getSignedManifest` → `audio-encryption` params →
  stream `sendRealTimeAudioDataToPendantDevice` → `upload-data-ordered` → REST `transcribe`.
- `DeviceStatusSyncMode`: Idle / Syncing / Streaming / Provisioning (🟡 values inferred).
- 🔴 GATT UUIDs and on-air packet format are in encrypted native code — not statically recoverable.

---

## 8. Telemetry / Config

Out-of-band channels:

Segment (`api.segment.io/v1/b`), Sentry (`sentry.io`), Crashlytics, LaunchDarkly streaming
(`clientstream.launchdarkly.com`), FCM + Expo push, Firebase Installations.

---

## 9. Security Observations

- 🟢 ATS enforced (`NSAllowsArbitraryLoads=false`) except `tail7edd25.ts.net` (Tailscale; TLS1.0 + cleartext allowed) — internal/dev only.
- 🟢 Admin-gated route exists: `/v3/pendant/provisionPendant`.
- 🟢 Pendant audio is encrypted (`/v3/pendant/audio-encryption`, signed manifest).
- 🟡 Firebase Web API key `AIzaSy…` is embedded (normal for Firebase clients; not a secret).

---

## Support

- Overview: [LIMITLESS_COMMS_ANALYSIS.md](./LIMITLESS_COMMS_ANALYSIS.md)
- Architecture & module map: [LIMITLESS_ARCHITECTURE.md](./LIMITLESS_ARCHITECTURE.md)
- Native capability evidence: [LIMITLESS_NATIVE_ANALYSIS.md](./LIMITLESS_NATIVE_ANALYSIS.md)
- Machine artifacts: `limitless/analysis/reversa/openapi.comms.yaml`, `asyncapi.realtime.yaml`

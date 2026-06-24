# Limitless — Typed Communications SDK (sdkgenny)

> **Analysis Date:** 2026-06-24
> **Tool:** [sdkgenny](https://github.com/cursey/sdkgenny) (header + `libsdkgenny.a`, C++20)
> **Subject:** `ai.limitless.mobile` 2.0.10 (build 223)
> **Input model:** `limitless/analysis/sdkgenny/input/gen_comms_sdk.cpp` → **34 generated headers**

A compiler-checked, typed catalogue of every communication contract observed in the Limitless Pendant
app. Building the contract as real C++ that *compiles and runs* forces internal consistency — every
endpoint, message, enum, and field is declared exactly once.

> ⚠️ Reverse-engineered from static analysis. This is an **independent reconstruction**, not Limitless's
> official SDK. Offsets/sizes are modeling conventions for type layout, not the app's real in-memory ABI
> (the app is React-Native/Hermes; there is no native struct to match). The value here is the
> type-checked catalogue, not a binary-compatible ABI.

---

## Table of Contents

1. [What sdkgenny Was Used For](#1-what-sdkgenny-was-used-for)
2. [How It Was Built](#2-how-it-was-built)
3. [SDK Layout (Namespaces == Channels)](#3-sdk-layout-namespaces--channels)
4. [Provenance](#4-provenance)

---

## 1. What sdkgenny Was Used For

sdkgenny generates C++ SDK headers from a programmatic type model. We used it to turn the loose
strings/symbols mined from the bundle into a **strongly-typed, namespaced catalogue** of the app's
communication surface. Building it as real C++ that compiles and runs forces internal consistency.

---

## 2. How It Was Built

```bash
g++ -std=c++20 -I<sdkgenny>/include input/gen_comms_sdk.cpp \
    -L<sdkgenny>/lib -lsdkgenny -o gen_comms_sdk
./gen_comms_sdk        # writes ./sdk/**
```

(`-std=c++20` is required — sdkgenny's comment helpers use `std::vformat`.)

---

## 3. SDK Layout (Namespaces == Channels)

| Namespace | Models | Key types |
|-----------|--------|-----------|
| `limitless::net` | Hosts + transport selection | `Environment`, `Hosts` (14 base URLs), `Transport` |
| `limitless::rest` | HTTPS REST API | `Endpoint` (28 routes), `HttpMethod`, `Route`, `RestClient` |
| `limitless::rpc::api_client` | Connect-RPC `api.client.*` | `AccountCreateRequest`, `SignInRequest`, `SummaryResponseChunk`, `TranscribeResponse`, … |
| `limitless::rpc::client_audio` | Audio WebSocket `client.audio.*` | `WebsocketResponseType`, `AudioStart/Stop/Heartbeat/Message`, `AudioTranscriptWord`, `AudioHealthStatusUpdate` |
| `limitless::rpc::client_meeting` / `client_document` | Meeting / document payloads | `LiveNotes`, `Document` |
| `limitless::realtime` | Daily.co WebRTC | `DailyRoom`, `DailyEvent` |
| `limitless::pendant` | BLE Pendant link | `PendantLink`, `PendantAudioPacket`, `DeviceStatusSyncMode` |
| `limitless::auth` | Identity / tokens | `Session`, `Provider` |

---

## 4. Provenance

Every type traces to a concrete string/symbol in `limitless/analysis/_shared/` (`hosts.txt`,
`proto_types.txt`, `rest_paths.txt`, `grpc_paths.txt`) or a parsed plist value. See
`limitless/analysis/_shared/INTEL.md` for the full evidence table.

---

## Support

- Overview: [LIMITLESS_COMMS_ANALYSIS.md](./LIMITLESS_COMMS_ANALYSIS.md)
- API contract the SDK encodes: [LIMITLESS_API_SPECIFICATION.md](./LIMITLESS_API_SPECIFICATION.md)
- Native evidence behind the types: [LIMITLESS_NATIVE_ANALYSIS.md](./LIMITLESS_NATIVE_ANALYSIS.md)
- Generated headers + class diagram: `limitless/analysis/sdkgenny/output/sdk/`, `diagrams/comms_sdk_class.mmd`

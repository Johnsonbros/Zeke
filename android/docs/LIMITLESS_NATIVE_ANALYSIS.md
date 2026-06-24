# Limitless — Native Mach-O Analysis (Ghidra)

> **Analysis Date:** 2026-06-24
> **Tool:** Ghidra 12.1.2 (headless `analyzeHeadless`, bundled JRE 21)
> **Target:** `Limitless.app/Wrapper/Limitless.app/Limitless` — arm64 Mach-O, FairPlay-encrypted
> **Confidence:** 🟢 confirmed · 🟡 inferred · 🔴 gap

Native-side reverse-engineering of the Limitless Pendant app's host binary — establishing which iOS
frameworks the app is wired to, and recovering symbol-level facts that JS string mining could not.

**Artifacts (in `limitless/analysis/ghidra/`):** `Limitless.facts.txt` (symbols/classes/imports/memory,
exported by `input/ExportComms.java`), `macho_loadcommands.txt` (load-command parse), `comms_symbols.txt`
(curated), `headless_main.log` (run log), `diagrams/native_comms_stack.mmd`.

---

## Table of Contents

1. [What Ghidra Was Used For](#1-what-ghidra-was-used-for)
2. [Key Finding: A Thin React-Native Host](#2-key-finding-a-thin-react-native-host)
3. [Encryption Status](#3-encryption-status)
4. [Native Communication Capability Map](#4-native-communication-capability-map)
5. [Symbol-Level Findings](#5-symbol-level-findings)
6. [How to Reproduce](#6-how-to-reproduce)

---

## 1. What Ghidra Was Used For

Ghidra imported the native host binary with its Mac OS X Mach-O loader (language
`AARCH64:LE:64:AppleSilicon:swift`), parsed all load commands and symbol/Obj-C/Swift metadata, and
auto-analyzed reachable code. A headless post-script (`ExportComms.java`) dumps the comms-relevant
facts: memory map, external symbols (imports), classes/namespaces, named functions.

---

## 2. Key Finding: A Thin React-Native Host

🟢 The binary links **`hermes.framework`** and **`JavaScriptCore`** — the app's actual communication
logic executes as **Hermes bytecode** (`main.jsbundle`), *not* native code. The native binary's job is
to host the RN runtime and bridge to iOS frameworks.

Therefore the authoritative comms contract lives in the JS bundle (see
[LIMITLESS_API_SPECIFICATION.md](./LIMITLESS_API_SPECIFICATION.md)); Ghidra's contribution is the
**native capability map** — which OS frameworks the app is wired to use.

---

## 3. Encryption Status

`LC_ENCRYPTION_INFO_64`:

🟢 `cryptid = 1` (FairPlay / App Store DRM present). Encrypted region offset 266240, size 4096 B. The
"Unable to read bytes" warnings during decompilation are the expected consequence of analyzing DRM'd /
partially-mapped regions — they do **not** affect load-command, symbol, or class recovery, which come
from `__LINKEDIT` and the Obj-C/Swift metadata sections at import time.

---

## 4. Native Communication Capability Map

From 115 linked dylibs (Ghidra `LC_LOAD_DYLIB`):

| Capability | Frameworks | Maps to channel |
|------------|------------|-----------------|
| JS runtime | `hermes`, `JavaScriptCore` | runs all app comms logic |
| HTTP / sockets / TLS | `Network`, `CFNetwork`, `SystemConfiguration` | REST (T1), Connect-RPC (T2), WebSocket (T3) |
| WebRTC | `WebRTC`, `ReactNativeDailyJSScreenShareExtension` | Daily.co meetings (T4) |
| BLE Pendant | `CoreBluetooth`, **`AccessorySetupKit`** (iOS 18 pairing) | Pendant link (T5) |
| Crypto / identity | `CryptoKit`, `Security`, `AuthenticationServices`, `DeviceCheck` | pendant audio enc., auth, attestation |
| Audio capture / STT | `AVFAudio`, `CoreAudio`, `AudioToolbox`, **`Speech`** | audio pipeline; possible on-device transcription |
| Push / commerce / location | `UserNotifications`, `StoreKit`, `CoreLocation`, `CoreTelephony` | FCM/Expo push, RevenueCat, geo, phone import |

**Notable confirmations:**

- **`AccessorySetupKit`** linked ⇒ the Pendant uses the modern iOS 18 BLE accessory-pairing flow
  (corroborates `bluetooth-central` background mode + `provisionPendant`).
- **`CryptoKit`** linked ⇒ native crypto backs `/v3/pendant/audio-encryption` + signed manifests.
- **`DeviceCheck`** linked ⇒ app-attestation likely gates API access (anti-abuse).
- **`Speech`** linked ⇒ on-device transcription path may exist alongside server `/v3/transcribe`.

---

## 5. Symbol-Level Findings

From `Limitless.facts.txt` (4001 imports, ~8000 named symbols); curated in `comms_symbols.txt`.
Highlights that JS string mining could **not** give:

- 🟢 **Pendant crypto is ChaChaPoly + Curve25519.** Imports `CryptoKit.ChaChaPoly.Nonce`,
  `CryptoKit.Curve25519.Signing.PublicKey.isValidSignature(_:for:)`, `CryptoKit.SHA256` ⇒ the pendant
  audio path uses **ChaChaPoly AEAD** encryption and verifies **Ed25519/Curve25519-signed manifests**
  (SHA-256 hashed). Concretely backs `/v3/pendant/audio-encryption` + `/v3/pendant/getSignedManifest`.
- 🟢 **REST = URLSession with TLS challenge handling + background uploads.** Full delegate set incl.
  `URLSession:task:didReceiveChallenge:` (server-trust / possible pinning) and
  `supportsBackgroundURLSessionUploads` / `handleEventsForBackgroundURLSessionID:` ⇒ the
  `*-upload-data-ordered` routes run as **background URLSession uploads** (survive app suspension).
- 🟢 **Native WebSocket module** `JS_NativeWebSocketModule_SpecConnectOptions`, plus
  `close:reason:socketID:`, `bindSocket:toInterface:`, stream-to-runloop plumbing ⇒ the audio pipeline
  is a genuine WebSocket (RN `WebSocketModule`), corroborating `client.audio.*`.
- 🟢 **Audio capture** Expo native exports `startAudioRecording` / `stopAudioRecording` /
  `prepareAudioRecorder` / `setAudioMode` + `audioInterruptionMode` ⇒ on-device capture feeding the stream.
- 🟢 **Firebase client** `initWithURLSession:APIKey:projectID:heartbeatLogger:` ⇒ Firestore/Firebase
  wired to project `limitless-413516`.
- 🟡 **OAuth** `additionalTokenRefreshParametersForAuthSession:` ⇒ AppAuth-style token refresh.

> Section map also recovered: `__objc_classname`, `__objc_methname`, `__swift5_typeref`,
> `__swift5_reflstr`, `__constg_swiftt` — i.e. Obj-C + Swift reflection metadata is intact (the binary
> mixes Swift, Obj-C, and the RN bridge).

---

## 6. How to Reproduce

```bash
export JAVA_HOME=/mnt/nvme/devtools/env/lib/jvm; export PATH="$JAVA_HOME/bin:$PATH"
analyzeHeadless <proj_dir> LimitlessProj \
  -import Limitless.app/Wrapper/Limitless.app/Limitless \
  -analysisTimeoutPerFile 150 \
  -scriptPath analysis/ghidra/input -postScript ExportComms.java -overwrite
```

---

## Support

- Overview: [LIMITLESS_COMMS_ANALYSIS.md](./LIMITLESS_COMMS_ANALYSIS.md)
- API contract: [LIMITLESS_API_SPECIFICATION.md](./LIMITLESS_API_SPECIFICATION.md)
- Typed SDK reconstruction: [LIMITLESS_SDK.md](./LIMITLESS_SDK.md)

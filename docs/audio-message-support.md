# Phase 37 — Audio Messages (Voice Notes)

**Status:** `[~]` designed
**Date:** 2026-06-17
**Author:** EnvoyMesh core team
**Related:** [implementation-plan.md#phase-37](./implementation-plan.md#phase-37--audio-messages-voice-notes), Phase 32 (Agent Network Membership), Phase 29 (OpenClaw runtime)

---

## 1. Problem

EnvoyMesh chat is text-only. Users on mobile (EnvoyGo) and desktop (Social UI) cannot send voice notes — a common messaging feature. When communicating with AI agents (EnvoyAI, Ext Agent/HomeClaw), voice messages would be especially useful: speak naturally, have the agent understand and reply.

Today's workaround is to use a separate recording app, transcribe manually, and paste the text. There is no first-class audio path.

---

## 2. Goals & non-goals

### Goals

- **G1.** Users can record and send audio messages (voice notes) from the Social UI (browser) and EnvoyGo (mobile).
- **G2.** Audio messages appear in the chat thread as playable audio bubbles with a waveform or duration indicator.
- **G3.** When the sender records in a browser, the audio is **transcribed client-side** (Web Speech API) and the transcription is attached to the message. The agent (EnvoyAI / Ext Agent) sees the text.
- **G4.** When an AI-auto-reply receiver processes an audio message, it uses the attached transcription. If no transcription exists (e.g., mobile sender without Web Speech), the receiver falls back gracefully: the draft prompt notes "[Audio message — no transcription available]" so the AI can still acknowledge the message.
- **G5.** Audio files are stored in the vault (like existing file attachments) and referenced by `vaultRelativePath` in the message payload.

### Non-goals

- **NG1.** No real-time voice calling / VoIP. This is async voice notes only.
- **NG2.** No server-side STT engine (whisper.cpp, Whisper API). The primary transcription path is client-side Web Speech API. A server-side fallback using the existing OpenClaw model is documented as a future enhancement.
- **NG3.** No new RPC methods. Audio travels through the existing `sendChatAttachment` → `chat.message` path.
- **NG4.** No new wire protocol. Audio is an attachment on the existing `chat.message` envelope.
- **NG5.** No audio compression/transcoding pipeline. The browser's default `MediaRecorder` codec (Opus in WebM) is used as-is.

---

## 3. Current state (verified 2026-06-17)

| Concern | Location | Today |
|---------|----------|-------|
| Chat file attachments (direct) | `apps/node/src/node-service-impl.ts:6491` (`sendChatAttachment`) | Writes file to vault at `chat/out/<uuid>/<filename>`, sends `share.request` with `deliveryChannel: "chat"` |
| Chat file attachments (group) | `apps/node/src/node-service-impl.ts:6533` (`sendChatRoomAttachment`) | Mirror of direct path for group chat rooms |
| Attachment rendering | `apps/social/src/components/ChatFileAttachment.tsx` | Renders images inline with preview; other files show download button |
| `ChatAttachment` type | `packages/api/src/node-service.ts:112` | `{ id, filename, mimeType, sizeBytes, sensitivity, vaultRelativePath }` |
| `ChatMessagePayload` | `packages/protocol/src/index.ts:1322` | `{ senderOwnerId, text }` — no `attachments` field (unlike `ChatRoomMessagePayload` at 1415 which has `attachments`) |
| Chat composer | `apps/social/src/components/views/ContactChatPanel.tsx:365` (`handleAttachFile`) | File picker → base64 → `sendChatAttachment` |
| AI draft generation | `apps/node/src/chat-draft-inbound.ts:45` (`generateChatDraft`) | Takes `chatText: string` — processes text only |
| Inbound chat handler | `apps/node/src/index.ts:2017` | Calls `generateChatDraft({ chatText: payload.text })` |
| EnvoyGo chat | `apps/envoygo/lib/providers/chat_provider.dart` | File attachments via `sendChatAttachment`; no audio recording |

The plumbing for file attachments exists. The gap is: (a) no audio recording UI, (b) `ChatMessagePayload` has no `attachments` field, (c) no transcription path, (d) no audio playback component.

---

## 4. Proposed design

### 4.1 Protocol — add `attachments` to `ChatMessagePayload`

Mirror the `ChatRoomMessagePayload` pattern. `ChatMessagePayload` currently has `{ senderOwnerId, text }`. Add:

```typescript
// packages/protocol/src/index.ts
export const ChatMessagePayloadSchema = z
  .object({
    senderOwnerId: z.string().min(1),
    text: z.string().max(128000).default(""),         // optional when attachments present
    attachments: z.array(ChatRoomAttachmentSchema).max(8).optional(),  // NEW
    deviceCertificate: DeviceCertificateSchema.optional(),
    ownerPublicKeyPem: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    refineChatSenderDeviceFields(value, ctx);
    // At least one of text or audio attachment must be present
    if (!value.text.trim() && (!value.attachments || value.attachments.every(a => !a.filename))) {
      ctx.addIssue({
        code: "custom",
        message: "Either text or an attachment is required",
        path: ["text"],
      });
    }
  });
```

The `ChatRoomAttachmentSchema` is reused as-is — it already has `{ id, filename, mimeType, sizeBytes, sensitivity }`. Audio attachments use `mimeType: "audio/webm"` (browser) or `"audio/mp4"` (iOS).

**Backward compatibility:** old clients that don't expect `attachments` will parse the payload as before (Zod's `.optional()` means the field is simply absent). Old senders continue sending `{ senderOwnerId, text }` — no change.

### 4.2 Audio recording — Social UI (browser)

A new mic button in `ChatComposer` (next to the existing attach button). Flow:

```
User taps mic → MediaRecorder starts (audio/webm; opus)
User speaks → SpeechRecognition transcribes in real-time
User taps stop → blob finalized + transcription captured
→ sendChatAttachment(audio blob)  → vault write
→ sendChat({ text: transcription, attachments: [{ vaultRelativePath, mimeType: "audio/webm", ... }] })
```

**Web Speech API (`SpeechRecognition`):**
- Available in Chrome, Edge, Safari 14.1+, Firefox (partial)
- Works offline in Chrome (bundled language models)
- Returns `result.transcript` incrementally as the user speaks
- Final transcript is captured on `onspeechend` / `onend`
- Language: defaults to the user's browser locale; can be set explicitly

**Audio blob (`MediaRecorder`):**
- Output: `audio/webm; codecs=opus` in Chrome/Edge, `audio/mp4` in Safari
- Bitrate: ~32 kbps for voice (small files — ~240 KB per minute)
- Max duration: 120 seconds (configurable, enforced in UI)

**Integration point:** `ContactChatPanel.tsx` line 365 (`handleAttachFile`). A parallel `handleRecordAudio` function is added. Both use `sendChatAttachment` for the vault write; the audio path additionally sends the transcription as `chatText`.

### 4.3 Audio playback — Social UI

A new `ChatAudioAttachment` component renders in message bubbles:

```tsx
// apps/social/src/components/ChatAudioAttachment.tsx (new)
export function ChatAudioAttachment({ attachment, transcription }: {
  attachment: ChatAttachment;
  transcription?: string;
}) {
  // 1. Fetch audio from vault via readLibraryItemContent
  // 2. Render <audio> element with playback controls
  // 3. Show waveform/duration indicator
  // 4. If transcription exists, show as captions below the player
}
```

The component is used in `ContactChatPanel.tsx` and `GroupChatPanel.tsx` — when a `ChatMessageBubble` has an audio attachment, `ChatAudioAttachment` is rendered instead of (or alongside) `ChatMessageText`.

**Audio source:** The vault path from `attachment.vaultRelativePath` is read via `readLibraryItemContent`. For inline playback, the audio is loaded as a `data:` URI (same pattern as image previews in `ChatFileAttachment`).

### 4.4 Audio recording — EnvoyGo (Flutter mobile)

Flutter does not have a built-in `MediaRecorder` equivalent. Options:

| Option | Platform | Quality |
|--------|----------|---------|
| `record` package (pub.dev) | iOS + Android | Good — PCM/WAV, configurable bitrate |
| Platform channel (native AVFoundation / MediaRecorder) | iOS + Android | Best — native codecs |

**Recommendation:** use the `record` package (`^5.1.0`). It supports MP4/AAC on both platforms and provides an amplitude stream for waveform display.

Flutter does **not** have Web Speech API. Transcription on mobile:
- **Option A:** Send audio without transcription. The receiver's AI draft path shows "[Audio message — no transcription available]". The human recipient can listen.
- **Option B (future):** Server-side transcription via OpenClaw whisper skill or a model endpoint.

**Phase 37 ships with Option A for mobile.** Mobile audio messages are sent with `text: ""` and an audio attachment. The AI draft path handles the missing text gracefully.

### 4.5 STT pipeline — how transcription works

The core principle: **transcription happens primarily on the sender side, before the message is sent.** The receiver (human or AI) always sees text. Audio is a companion attachment for playback.

```
┌─────────────────────────────────────────────────────────────┐
│ SENDER (browser)                                            │
│                                                             │
│  MediaRecorder ──► audio/webm blob                          │
│  SpeechRecognition ──► "Hey, can you review this doc?"      │
│                                                             │
│  sendChatAttachment(audio blob) ──► vault write             │
│  sendChat({                                                │
│    text: "Hey, can you review this doc?",                   │
│    attachments: [{ vaultRelativePath, mimeType, ... }]      │
│  })                                                         │
└──────────────────────────┬──────────────────────────────────┘
                           │ P2P chat.message envelope
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ RECEIVER                                                    │
│                                                             │
│  payload.text = "Hey, can you review this doc?"  ◄── AI sees this
│  payload.attachments[0] = audio/webm              ◄── UI plays this
│                                                             │
│  If AI auto-reply:                                          │
│    generateChatDraft({ chatText: payload.text })            │
│    → unchanged — text is already there                      │
│                                                             │
│  If human recipient:                                        │
│    UI shows ChatAudioAttachment (playable)                  │
│    + ChatMessageText (transcription)                        │
└─────────────────────────────────────────────────────────────┘
```

**What if there's no transcription?** (mobile sender, or sender without Web Speech)

```
payload.text = ""                           ← empty
payload.attachments[0] = audio/mp4          ← audio only

In generateChatDraft:
  if (!chatText.trim() && hasAudioAttachment) {
    chatText = "[Audio message — no transcription available]"
  }
  → AI sees: "[Audio message — no transcription available]"
  → AI can respond: "I received your audio message but can't transcribe it yet..."
```

**Future: server-side transcription via OpenClaw.** Once the OpenClaw whisper skill or a model that supports audio input is available, the inbound handler can call it:

```typescript
// apps/node/src/speech-to-text.ts (future)
export async function transcribeAudioAttachment(
  vaultRelativePath: string,
): Promise<string> {
  // 1. Read audio bytes from vault
  // 2. Send to OpenClaw whisper tool or model endpoint
  // 3. Return transcription
}
```

This is explicitly **out of scope for Phase 37** — the design keeps it simple and ships the client-side path first.

### 4.6 AI agent integration (EnvoyAI + Ext Agent)

**No changes needed.** The agent already receives `chatText`. Once the sender attaches a transcription, the agent processes it as a normal text message. The audio attachment metadata is present in the payload but the agent ignores it (agents process text).

For the Ext Agent (HomeClaw bridge), the bridge already forwards `chat.message` payloads via HTTP. The `attachments` field is included in the JSON payload; HomeClaw can choose to render or ignore it.

### 4.7 Storage

Audio files follow the existing attachment path:
- Stored in vault at `chat/out/<attachmentId>/<filename>`
- Referenced in message payload via `vaultRelativePath`
- Sensitivity: `"friends"` (same as other chat attachments)
- Max size: `MAX_CHAT_ATTACHMENT_BYTES` (100 MB) — 120s of Opus audio at 32 kbps ≈ 480 KB, well within limits

---

## 5. Data flow summary

```text
┌──────────────┐  MediaRecorder + SpeechRecognition
│  Social UI   │  (browser)
│  (web)       │
└──────┬───────┘
       │ 1. sendChatAttachment(audio/webm blob)
       │    → vault write → vaultRelativePath
       │ 2. sendChat({
       │      text: "transcription from Web Speech",
       │      attachments: [{ vaultRelativePath, mimeType: "audio/webm", ... }]
       │    })
       ▼
┌──────────────────────┐
│  NodeServiceImpl     │
│  (home node)         │
└──────┬───────────────┘
       │ chat.message envelope (P2P)
       ▼
┌──────────────────────┐
│  Receiver's node     │
│                      │
│  Inbound chat:       │
│    chatText = payload.text   ← already transcribed
│    audioAttachments = payload.attachments.filter(audio/*)
│                      │
│  generateChatDraft:  │
│    chatText → prompt → AI reply
│                      │
│  UI:                 │
│    ChatAudioAttachment ← playable audio
│    ChatMessageText    ← transcription captions
└──────────────────────┘
```

---

## 6. Files to change

| File | Type | What |
|------|------|------|
| `packages/protocol/src/index.ts` | edit | Add `attachments` field to `ChatMessagePayloadSchema`; update `createChatMessagePayload` and `parseChatMessagePayload` |
| `packages/api/src/node-service.ts` | edit | Add optional `attachments` to `SendChatParams` / RPC types if needed |
| `apps/social/src/components/views/ContactChatPanel.tsx` | edit | Add mic button + `handleRecordAudio` (MediaRecorder + SpeechRecognition) |
| `apps/social/src/components/views/GroupChatPanel.tsx` | edit | Add mic button + `handleRecordAudio` (reuse same logic) |
| `apps/social/src/components/ChatAudioAttachment.tsx` | **new** | Audio player with playback controls + waveform + transcription captions |
| `apps/social/src/components/ChatMessageBubble.tsx` | edit | Render `ChatAudioAttachment` when attachment is audio |
| `apps/node/src/index.ts` | edit | In inbound chat handler: if `chatText` is empty and audio attachments exist, set `chatText = "[Audio message — no transcription available]"` fallback |
| `apps/social/src/styles.css` | edit | Audio player styles (waveform, play/pause button, duration) |
| `apps/social/src/i18n/messages/en-chat.ts` | edit | New keys: `audioMessage.record`, `audioMessage.recording`, `audioMessage.noTranscription`, `audioMessage.duration` |
| `apps/envoygo/lib/widgets/chat_composer.dart` | edit | Mic button → `record` package → send audio without transcription |
| `apps/envoygo/lib/widgets/chat_audio_player.dart` | **new** | Flutter audio player widget |
| `apps/envoygo/pubspec.yaml` | edit | Add `record` package dependency |

**Net new code:** ~400 lines (mostly UI components).
**Net new dependencies:** `record` (Flutter). Browser uses built-in `MediaRecorder` + `SpeechRecognition`.

---

## 7. Risks & mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Web Speech API not available (Firefox, some mobile browsers) | Medium | Degrade gracefully: record audio only, send with empty text. AI draft shows fallback message. Human recipient can still listen. |
| `MediaRecorder` produces different codecs per browser (WebM/Opus vs MP4) | Low | Store `mimeType` in attachment metadata. `<audio>` element handles both. |
| Large audio files on mobile data | Low | 120s cap + 32 kbps Opus = ~480 KB. Show size warning before send. |
| Flutter `record` package permissions (iOS requires microphone usage description) | Low | Standard Info.plist entry. Already handled by `permission_handler` in EnvoyGo. |
| Old clients cannot render `attachments` on `chat.message` | Low | Zod `.optional()` — old clients ignore unknown fields. Text transcription is still visible in `payload.text`. |

---

## 8. Test plan

| Test | File | What it asserts |
|------|------|-----------------|
| `ChatMessagePayload` with audio attachment parses | `packages/protocol/test/chat-message.test.ts` (existing, extend) | `attachments` field round-trips through `parseChatMessagePayload` |
| `ChatMessagePayload` rejects empty text + no attachments | Same | `superRefine` catches the validation error |
| Old payloads (no attachments) still parse | Same | Backward compatibility — `{ senderOwnerId, text }` works unchanged |
| `ChatAudioAttachment` renders play button | `apps/social/test/components/ChatAudioAttachment.test.tsx` (new) | Renders `<audio>` element with correct src |
| `ChatAudioAttachment` shows transcription caption | Same | Caption text is visible below the player |
| Mic button records and sends | `apps/social/test/components/ContactChatPanel.test.tsx` (extend) | Mock `MediaRecorder` + `SpeechRecognition`; verify `sendChat` called with text + attachments |
| Inbound chat handler sets fallback text for audio-only messages | `apps/node/test/chat-draft-inbound.test.ts` (extend) | When `chatText` is empty and audio attachment exists, `chatText` becomes fallback string |
| Flutter `ChatAudioPlayer` renders | `apps/envoygo/test/` (new) | Widget test: play button visible |

**Smoke test (manual):**

1. Open Social UI → chat with a contact. Tap mic. Speak "test message." Release. Verify audio bubble appears in chat with transcription.
2. Tap play on the audio bubble. Verify audio plays.
3. Enable AI auto-reply for the contact. Send another voice note. Verify AI responds to the transcribed text.
4. Open EnvoyGo → chat. Record audio (no transcription on mobile). Verify audio bubble appears. Verify AI auto-reply shows fallback acknowledgment.

---

## 9. Out-of-scope (forward references)

- **Server-side STT (OpenClaw whisper skill / model endpoint).** Phase 37 ships with client-side transcription only. Server-side transcription is a follow-up phase once the OpenClaw whisper plugin or a compatible model endpoint is available.
- **Real-time voice calling.** Out of scope — this is async voice notes.
- **Audio waveform visualization.** The MVP shows a simple `<audio>` element with duration. A waveform display is a UI polish follow-up.
- **Transcription language selection.** Defaults to browser locale. Explicit language picker is future work.

---

## 10. Decision log

| Date | Decision | Why |
|------|----------|-----|
| 2026-06-17 | Client-side transcription (Web Speech API) as primary path | Zero infra, zero cost, works today. Server-side STT adds complexity and is deferred. |
| 2026-06-17 | Reuse `ChatRoomAttachmentSchema` for `ChatMessagePayload.attachments` | Don't duplicate the attachment type. One schema, two payloads. |
| 2026-06-17 | No new RPC methods | `sendChatAttachment` already handles vault write; `sendChat` carries the audio metadata. |
| 2026-06-17 | Mobile sends audio without transcription | Flutter has no Web Speech API. Server-side STT is future work. The fallback message keeps AI functional. |
| 2026-06-17 | `attachments` on `ChatMessagePayload` is optional | Backward-compatible. Old clients ignore it. Old senders don't include it. |
| 2026-06-17 | 120s max recording duration | Long enough for a voice note; short enough to keep file sizes small (~480 KB). |

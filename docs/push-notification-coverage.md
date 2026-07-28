# Push Notification Coverage — Design Doc

**Status:** Designed (2026-07-28) · Highest-priority fixes shipped; broader coverage planned as Phase 50.

This document maps the home-node → EnvoyGo push notification system: what's there today, what's broken, and what should be added. It is the authoritative reference for Phase 50.

---

## 1. Architecture overview

**Two parallel push subsystems** (don't confuse them):

| Path | What it's for | Status |
|---|---|---|
| **Home node → EnvoyGo** (`apps/node/src/push-notification.ts`) | The mobile app | **Partially broken** — fixed in Phase 50 Slice A |
| OpenClaw gateway → OpenClaw operator iOS app (`packages/openclaw/src/gateway/exec-approval-ios-push.ts`) | A separate operator-app flow | Out of scope |

**Pipeline:**

1. **Token registration.** EnvoyGo calls JSON-RPC `registerPushToken({ platform, token, tokenType: "alert"|"voip", ownerId })`. Stored in `<profileDir>/push-tokens.json`, bound to the home owner identity. Re-registered on every reconnect + token refresh.

2. **Dispatch.** `PushNotificationService` (singleton, `apps/node/src/push-notification.ts`) has four event-specific methods:
   - `dispatchChatPush` — direct/room chat messages
   - `dispatchBondPush` — contact requests
   - `dispatchFeedPush` — Phase 45E inbox items
   - `dispatchCallPush` — incoming calls (iOS VoIP + Android high-priority FCM)

   All hand-rolled — **no `node-apn`/`firebase-admin` library**. Raw APNs HTTP/2 with ES256 JWT from a `.p8` key (env vars `APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_KEY_PATH`/`APNS_TOPIC`); FCM HTTP v1 with OAuth2 service-account JWT (env vars `FCM_PROJECT_ID`/`FCM_SERVICE_ACCOUNT_JSON`).

3. **Payload shape.** All alert pushes carry `{ aps: { alert: { title, body }, sound, badge }, data: { ...routing } }`. The `data` block carries routing hints so the client can deep-link (see §5).

---

## 2. Coverage map — what pushes today (post Slice A fix)

| # | Source | Hook file:line | Pushes? | Skip-if-online? | Notes |
|---|---|---|---|---|---|
| 1 | Direct chat (mobile path) | `node-service-handlers-chat-message.ts:146` | ✅ **Fixed Slice A** | ✅ Yes | Was broken — `dispatchChatPush` was wired only on the legacy Path B (desktop), bypassed by the production internal-mesh handler |
| 2 | Direct chat (desktop path) | `index.ts:1904` | ✅ Works | ❌ No | The legacy path; should also gain skip-if-online |
| 3 | Group chat (`chat.room.message`) | `packages/api/src/chat-room-service.ts:1316` | ❌ **No** | n/a | Needs `dispatchChatPush` with `threadType: "room"` + `roomId` — payload shape already supports it |
| 4 | EnvoyAI / OpenClaw reply | `node-service-openclaw-runtime.ts:339` (`recordEnvoyAiChatMessageViaRuntime`) | ❌ **No** | n/a | Hook point is the persist+emit; recipient = home owner. Useful for long-running turns |
| 5 | Ext Agent reply (HomeClaw/Hermes/OpenHuman) | `index.ts:3586` (bridge receiveFromAgent → emit) | ❌ **No** | n/a | Desktop-only today (bridge instantiated in index.ts). Recipient = home owner |
| 6 | Pi `sendToPi` response | `node-service-impl.ts:sendToPi` (RPC return, no persist/emit) | ❌ **No** | n/a | **Hardest case** — pure synchronous RPC, no hook point. Needs `sendToPi`/`askPiViaRuntime` to emit on completion |
| 7 | Pi tool-action request (`extension_ui_request`) | `node-service-pi.ts:130` (`onProposal`) → `pi:proposal` WS event | ❌ **No** | n/a | User wants to know Pi is asking for approval while backgrounded |
| 8 | Bond request (`bond.request`) | `index.ts:2314` (hello:request callback) | ✅ **Fixed Slice A** | ✅ Yes | `dispatchBondPush` was implemented but had zero callers (dead code) |
| 9 | Approval item (task proposal, tool_call) | `packages/api/src/approval-queue.ts:171` (ApprovalQueue.add) | ❌ **No** | n/a | Multiple creation sites; `contactOwnerId` not home owner — capture approver at NodeServiceImpl subscription layer |
| 10 | Feed notify (`feed.notify`) | `index.ts:1339` | ✅ Works | ❌ No | Should gain skip-if-online |
| 11 | Incoming call (`call.invite`) | `index.ts:1633` (gated by `hasClientForOwner`) | ✅ Works | ✅ Yes | The only fully-correct push path; model for the others |

---

## 3. Slice A — Highest-priority fixes (SHIPPED 2026-07-28)

### A.1 Direct chat push in production path

**Root cause:** `chat.message` has two inbound paths gated by `usesInternalMeshInboundHandlers()` (= `this._mesh != null`, `node-service-impl.ts:1972`):
- **Path A** (mobile/embedded, internal mesh): the production default. The handler at `node-service-handlers-chat-message.ts:146` emits `chat:message` but never called `dispatchChatPush`.
- **Path B** (desktop/CLI, external mesh): the legacy path. Has `dispatchChatPush` at `index.ts:1904`.

EnvoyGo's home node always runs Path A, so chat push never fired.

**Fix:** Added `dispatchChatPushIfOffline(params)` to the `ChatMessageContext` interface; wired from `node-service-impl-service-deps.ts` to call `pushNotificationService.dispatchChatPush` after checking `host.isOwnerOnline()`; called at line 146 after the emit. The "skip if online" gate prevents the double-notification (WS in-app + system push) when EnvoyGo has an active WebSocket.

### A.2 Bond request push (dead code wired)

`dispatchBondPush` was fully implemented (`push-notification.ts:533`) but had **zero call sites** anywhere. Wired it into the `hello:request` callback at `index.ts:2314` with the same skip-if-online gate. Bond requests now push to EnvoyGo when the user is backgrounded.

---

## 4. Phase 50 — Unified push coverage (SHIPPED)

**Design pivot (2026-07-28):** the original plan had 8 per-source slices (B through H), each hooking a different message source. The user proposed a much cleaner model: **ONE unified listener** that catches all new messages from any source, checks whether paired devices are connected, and pushes if they aren't. This collapsed slices B, C, D, E, F into a single ~40-line change.

### The unified listener

Added to the `NodeServiceImpl` constructor:

```typescript
// ONE subscriber catches chat:message from EVERY source:
this.on("chat:message", (msg) => {
  // Only push messages addressed to this home's owner
  if (msg.recipient.ownerId !== this._profile?.owner?.ownerId) return
  // Don't push the user's own outgoing echoes
  if (msg.sender.ownerId === targetOwnerId) return
  // Skip if the owner has an active WebSocket (already got it in-app)
  void this.isOwnerOnline().then((online) => {
    if (online) return
    void pushNotificationService.dispatchChatPush({ ... }).catch(() => {})
  })
})
```

**What this catches automatically** (because they all emit `chat:message` via `NodeServiceImpl.emit`):

| Source | How it emits | Caught? |
|---|---|---|
| Direct chat (production Path A) | `node-service-handlers-chat-message.ts:146` → `ctx.emit("chat:message")` | ✅ |
| Group chat | `chat-room-service.ts:1317` → emit | ✅ |
| EnvoyAI / OpenClaw reply | `node-service-openclaw-runtime.ts:341` → `ctx.emitChatMessage(msg)` → `host.emit("chat:message")` | ✅ |
| Ext Agent reply (HomeClaw/Hermes/OpenHuman/Pi) | Bridge receiveFromAgent → emit | ✅ |
| Pi `sendToPi` response | `node-service-impl.ts:sendToPi` now emits `chat:message` on completion | ✅ (Phase 50 added this emit) |

**Separate listeners** (different event types, same skip-if-online pattern):

| Event | Source | Listener |
|---|---|---|
| `hello:request` | Bond request | `index.ts:2314` (Slice A) |
| `pi:proposal` | Pi tool-action request | NodeServiceImpl constructor (Phase 50) |
| `feed.notify` | Phase 45E inbox | `index.ts:1339` (pre-existing) |
| `call.invite` | Incoming call | `index.ts:1633` (pre-existing, skip-if-online) |

**Legacy Path B** (desktop, `usesInternalMeshInboundHandlers() === false`): emits via `wsServerForEvents.emitEvent`, not `NodeServiceImpl.emit`, so the unified listener doesn't catch it. The per-source `dispatchChatPush` at `index.ts:1904` stays for that path. (Production EnvoyGo runs Path A, so this is desktop-only.)

### What this replaces

| Original Phase 50 slice | Status |
|---|---|
| 50B (skip-if-online for feed/legacy chat) | ✅ Unified listener always checks; legacy Path B keeps its own dispatch |
| 50C (group chat push) | ✅ Automatic — group chat emits `chat:message` |
| 50D (EnvoyAI reply push) | ✅ Automatic — EnvoyAI emits `chat:message` |
| 50E (Ext Agent reply push) | ✅ Automatic — Ext Agent emits `chat:message` |
| 50F.1 (Pi tool-action push) | ✅ Separate `pi:proposal` listener |
| 50F.2 (Pi sendToPi push) | ✅ `sendToPi` now emits `chat:message` on completion |
| 50G (approval-queue push) | 🔲 Still needed — different event type (approval queue, not chat:message) |
| 50H (token cleanup) | 🔲 Still needed — APNs 410/400 token pruning |

### Remaining work (post-Phase-50)

- **Slice G — Approval-queue push.** Subscribe to `approvalQueue.onChange`; capture the approver (home owner) at the subscription layer (items carry `contactOwnerId`, not home owner). New `dispatchApprovalPush`.
- **Slice H — Token cleanup.** `dispatchApnsHttp2` should unregister tokens APNs reports as 410/400. Mirror the OpenClaw path's `shouldClearStoredApnsRegistration`.
- **Feed push skip-if-online.** `index.ts:1339` (feed push) doesn't gate on `isOwnerOnline`. Wrap with the same gate.
- **Deep-link navigation** (client-side, separate workstream — see §5).

---

## 5. Deep-link navigation (PLANNED — Phase 50 separate workstream)

### Current state: routing fields are sent, parsed, and dropped

- **Server sends routing** in the `data` block: `{ threadType, messageId, senderOwnerId, roomId }` for chat; `{ type: "feed_notify", url, notificationId }` for feed; `{ type: "bond_request" }` for bond; `{ type: "call", callId, callerOwnerId }` for calls.
- **iOS native forwards taps** correctly: `AppDelegate.swift:182-202` reads `userInfo["data"]` and invokes `onNotificationTap` on the `envoygo/alert_push` channel.
- **Android forwards taps** via `FirebaseMessaging.onMessageOpenedApp` (`push_notification_service.dart:145-148`).
- **`PushNotificationService.handleNotificationTap()` parses** the payload into nav hints.
- **`PushNotificationService.onNotificationTap` stream exposes the tap.**
- **🔴 NOTHING SUBSCRIBES.** Zero consumers in production code. Tapping any push opens the app to the default view.

### What's missing on the client

1. **Subscribe to `onNotificationTap` in the app router.** In `node_provider.dart` (where `PushNotificationService` is instantiated) or in `main.dart`/`app.dart`, subscribe to the tap stream and route via a `GlobalKey<NavigatorState>`. Map payload → screen:
   - `{threadType, senderOwnerId}` → contact chat thread
   - `{type: "feed_notify", url}` → Browser
   - `{type: "bond_request"}` → Discover
   - `{type: "call", callId}` → Call screen (already handled by CallKit on iOS)

2. **Add `getInitialMessage()` handling for Android cold-launch.** `onMessageOpenedApp` doesn't fire on cold-launch; `FirebaseMessaging.instance.getInitialMessage()` retrieves the tap intent. Currently never called.

3. **Foreground push handling.** No `FirebaseMessaging.onMessage` listener, no native foreground presenter, no in-app banner. Foreground pushes are silently dropped on Android; iOS shows them only if the system default changed. Add a foreground listener that shows an in-app SnackBar/banner.

4. **Optionally register `envoy://` as a system-openable scheme** (universal links / app links) so pushes can carry a URL the OS routes natively. Currently `envoy://` is in-app only (`Info.plist` has no `CFBundleURLTypes`; `AndroidManifest.xml` has no VIEW intent-filter).

### Payload additions needed for full deep-linking

- **Bond push** (`dispatchBondPush`): currently only `{ type: "bond_request" }` — no requester id. Add `senderOwnerId` so the tap can route to the contact/discover view pre-populated.
- **Approval push** (Slice G): include the approval item id so the tap can open the approval card directly.

---

## 6. Notification UX polish (PLANNED — Phase 50 low-priority)

| Item | Current | Target |
|---|---|---|
| Notification channels (Android) | None — single default channel | Distinct channels for chat / call / feed / approval so the user can mute per-category |
| Interruption levels (iOS) | None — all alerts equal priority | `interruption-level: "active"` for direct messages; `"passive"` for feed updates |
| Badge count | Static `1` from server, never cleared | Server tracks unread count per thread; app clears badge on foreground |
| Contact avatar / rich media | None — no `mutable-content` | Add `mutable-content: 1` + a Notification Service Extension that fetches the sender's avatar |
| Per-thread / per-contact mute / DND | None anywhere | Add per-contact mute + global quiet-hours; check on the dispatch path |
| `pi.runtime.crashed` audit | Watchdog logs via `console.warn` only | Promote to audit event for observability |

---

## 7. Recipient identity (key invariant)

**All pushes ever target exactly one ownerId — the home node's owner.** No fan-out is needed, even for group chat, because:

- EnvoyGo pairs to exactly one home node.
- Each member's home node processes its own inbound copy of a group message.
- The push dispatch targets `selfOwnerId` (the home owner) only.
- The token store is keyed by ownerId, and the home node only registers its own owner's tokens.

This invariant simplifies every dispatch — there's no "find all recipients for this message" fan-out logic.

---

## 8. References

- Server dispatch core: `apps/node/src/push-notification.ts`
- Inbound routing + call sites: `apps/node/src/index.ts` (lines 1339, 1632-1644, 1904, 2299-2316)
- Production chat handler (Slice A fix): `apps/node/src/node-service-handlers-chat-message.ts:146`
- Chat ctx wiring: `apps/node/src/node-service-contexts.ts:1195`, `apps/node/src/node-service-impl-service-deps.ts:636`
- Call push gating (the model): `apps/node/src/call-inbound.ts:256-289`
- WS online tracking: `apps/node/src/ws-server.ts:241` (`hasClientForOwner`)
- RPC routers: `apps/node/src/json-rpc-router.ts:166-177`
- Client token register + tap parse: `apps/envoygo/lib/services/push_notification_service.dart`, `apps/envoygo/lib/services/voip_push_service.dart`
- Client wiring (singleton create, no tap subscription — the gap): `apps/envoygo/lib/providers/node_provider.dart:1289-1299`
- iOS native bridge: `apps/envoygo/ios/Runner/AppDelegate.swift:151-202`

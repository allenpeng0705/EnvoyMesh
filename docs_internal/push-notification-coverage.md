# Push Notification Coverage — Design Doc

**Status:** Shipped (2026-07-28) · Server-side complete + EnvoyGo deep-link + in-app toggle.

This document maps the home-node → EnvoyGo push notification system: what's there today, what's broken, and what should be added. It is the authoritative reference for Phase 50.

For operator setup (APNs/FCM credentials, env vars, testing), see [push-notification-config.md](./push-notification-config.md).

---

## 1. Architecture overview

**Two parallel push subsystems** (don't confuse them):

| Path | What it's for | Status |
|---|---|---|
| **Home node → EnvoyGo** (`apps/node/src/push-notification.ts`) | The mobile app | ✅ **Shipped (Phase 50)** — all sources covered |
| OpenClaw gateway → OpenClaw operator iOS app (`packages/openclaw/src/gateway/exec-approval-ios-push.ts`) | A separate operator-app flow | Out of scope |

**Pipeline:**

1. **Token registration.** EnvoyGo calls JSON-RPC `registerPushToken({ platform, token, tokenType: "alert"|"voip", ownerId })`. Stored in `<profileDir>/push-tokens.json`, bound to the home owner identity. Re-registered on every reconnect + token refresh. Gated on the in-app push toggle (`PushPreferences`).

2. **Dispatch.** `PushNotificationService` (singleton, `apps/node/src/push-notification.ts`) has five event-specific methods:
   - `dispatchChatPush` — chat messages (direct, group, EnvoyAI, Ext Agent, Pi)
   - `dispatchBondPush` — contact requests
   - `dispatchFeedPush` — Phase 45E inbox items
   - `dispatchApprovalPush` — Phase 50 approval-queue items
   - `dispatchCallPush` — incoming calls (iOS VoIP + Android high-priority FCM)

   All hand-rolled — **no `node-apn`/`firebase-admin` library**. Raw APNs HTTP/2 with ES256 JWT from a `.p8` key (env vars `APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_KEY_PATH`/`APNS_TOPIC`); FCM HTTP v1 with OAuth2 service-account JWT (env vars `FCM_PROJECT_ID`/`FCM_SERVICE_ACCOUNT_JSON`).

3. **Payload shape.** All alert pushes carry `{ aps: { alert: { title, body }, sound, badge }, data: { ...routing } }`. The `data` block carries routing hints so the client can deep-link (see §5).

---

## 2. Coverage map — what pushes today (post-Phase-50)

All sources push. All apply the skip-if-online gate.

| # | Source | Dispatch method | Listener / hook | Skip-if-online? |
|---|---|---|---|---|
| 1 | Direct chat (production Path A) | `dispatchChatPush` | Unified `chat:message` listener (`NodeServiceImpl` constructor) | ✅ Yes |
| 2 | Direct chat (legacy Path B) | `dispatchChatPush` | `index.ts` after `wsServerForEvents.emitEvent` | ✅ Yes (Phase 50) |
| 3 | Group chat | `dispatchChatPush` | Unified `chat:message` listener | ✅ Yes |
| 4 | EnvoyAI / OpenClaw reply | `dispatchChatPush` | Unified `chat:message` listener | ✅ Yes |
| 5 | Ext Agent reply (HomeClaw/Hermes/OpenHuman/Pi) | `dispatchChatPush` | Unified `chat:message` listener | ✅ Yes |
| 6 | Pi `sendToPi` response | `dispatchChatPush` | `sendToPi` emits `chat:message` → unified listener | ✅ Yes |
| 7 | Pi tool-action request | `dispatchChatPush` | `pi:proposal` listener (`NodeServiceImpl` constructor) | ✅ Yes |
| 8 | Bond request | `dispatchBondPush` | `hello:request` callback (`index.ts`) | ✅ Yes |
| 9 | Approval item | `dispatchApprovalPush` | `approvalQueue.onChange` diff (`bindApprovalQueue`) | ✅ Yes |
| 10 | Feed notify | `dispatchFeedPush` | `index.ts` (`feed.notify` handler) | ✅ Yes |
| 11 | Incoming call | `dispatchCallPush` | `call.invite` → `call-inbound.ts` | ✅ Yes |

---

## 3. How it was built (history)

Phase 50 evolved through three iterations:

1. **Slice A (initial fix):** Added per-source `dispatchChatPushIfOffline` to the chat-message handler context. Fixed direct chat (broken in production) and wired dead-code `dispatchBondPush`.

2. **Unified listener (design pivot):** The user proposed a cleaner model — ONE `chat:message` subscriber on `NodeServiceImpl` catches all chat sources. This replaced the per-source hook and collapsed the planned slices B–F into one change.

3. **Slice B (completion):** Added approval-queue push (`dispatchApprovalPush` + `onChange` diff), token cleanup (`sendAndCleanup` on 410/400/403/404), feed push skip-if-online gate, bond push `senderOwnerId` for deep-link routing. Also gated legacy Path B chat push on `isOwnerOnline()`.

### The unified listener

Added to the `NodeServiceImpl` constructor — catches `chat:message` events from ALL sources:

```typescript
this.on("chat:message", (msg: ChatMessage) => {
  const homeOwnerId = this._profile?.owner?.ownerId
  if (!homeOwnerId) return
  // Don't push the user's own outgoing echoes.
  if (msg.sender.ownerId && msg.sender.ownerId === homeOwnerId) return
  // Skip only when EnvoyGo has an authenticated WS (not desktop Social).
  if (this.isThinClientOnline(homeOwnerId)) return
  void pushNotificationService.dispatchChatPush({ ... }).catch(() => {})
})
```

**Why the `recipient.ownerId` guard was removed:** EnvoyAI assistant replies use `recipient.ownerId = ENVOY_AI_THREAD_KEY` (a synthetic thread key, NOT the home owner). The original guard rejected them. The fix: push target is always the home owner (every message on this node is for the owner); we only skip the user's own outgoing echoes.

**Why not `isOwnerOnline()`:** That API tracks owner presence for AI auto-reply (Social WS activity / manual status). Using it for push skipped alerts whenever Social was open — including EnvoyAI chats on desktop while EnvoyGo was killed. Push uses `isThinClientOnline` → `WsServer.hasClientForOwner` instead.

**Sources caught automatically** (they all emit `chat:message` via `NodeServiceImpl.emit`):
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

All original Phase 50 slices shipped:

| Original slice | Status |
|---|---|
| 50B (skip-if-online for feed/legacy chat) | ✅ All paths gate on thin-client WS (`isThinClientOnline` / `hasClientForOwner`), not owner presence |
| 50C (group chat push) | ✅ Automatic — group chat emits `chat:message` |
| 50D (EnvoyAI reply push) | ✅ Automatic — EnvoyAI emits `chat:message` |
| 50E (Ext Agent reply push) | ✅ Automatic — Ext Agent emits `chat:message` |
| 50F.1 (Pi tool-action push) | ✅ Separate `pi:proposal` listener |
| 50F.2 (Pi sendToPi push) | ✅ `sendToPi` now emits `chat:message` on completion |
| 50G (approval-queue push) | ✅ `approvalQueue.onChange` diff + `dispatchApprovalPush` |
| 50H (token cleanup) | ✅ `sendAndCleanup()` on all dispatch paths (410/400/403/404) |

### Remaining work (post-Phase-50)

All server-side work and EnvoyGo deep-link navigation are **shipped**. Remaining items are UX polish:

- **Notification channels (Android) / interruption levels (iOS)** — distinguish direct message (active) from feed update (passive). Not yet implemented.
- **Badge count management** — server sends static `badge: 1`; app doesn't clear on foreground. Needs server-side unread-count tracking + app-side clear.
- **Per-contact mute / global quiet-hours / DND** — no per-thread suppression exists. Would be checked on the dispatch path.
- **`pi.runtime.crashed` audit event** — watchdog logs via `console.warn`; promoting to audit is a small follow-up.
- **Foreground push handling (in-app banner)** — no `FirebaseMessaging.onMessage` listener on Android; iOS foreground pushes are silently dropped. Add a foreground listener that shows an in-app banner.
- **Test coverage for the deep-link flow** — `consumePendingInitialTap`, `_routeNotificationTap`, and the cold-start race fix are not covered by unit tests (the existing 8 push tests cover `handleNotificationTap` + token registration but not the routing/navigation flow).

---

## 5. Deep-link navigation (SHIPPED)

Tapping a push notification navigates to the relevant screen. The full pipeline works end-to-end:

- **Server sends routing** in the `data` block: `{ threadType, messageId, senderOwnerId, roomId }` for chat; `{ type: "feed_notify", url, notificationId }` for feed; `{ type: "bond_request", senderOwnerId }` for bond; `{ type: "approval", itemId }` for approvals; `{ type: "call", callId, callerOwnerId }` for calls.
- **iOS native forwards taps** via `AppDelegate.swift` → `envoygo/alert_push` MethodChannel → `onNotificationTap` stream.
- **Android forwards taps** via `FirebaseMessaging.onMessageOpenedApp` + `getInitialMessage()` (cold-start).
- **`PushNotificationService.handleNotificationTap()` parses** the payload into nav hints (recognizes chat, feed_notify, bond_request, approval, pi_proposal).
- **`main.dart` `_routeNotificationTap()` subscribes** to the tap stream and navigates via `EnvoyGoApp.navigatorKey`:

| Payload type | Tap opens |
|---|---|
| Chat (direct) | ChatDetailScreen (threadId = nodeId:senderOwnerId) |
| Chat (room) | ChatDetailScreen (threadId = nodeId:roomId) |
| `feed_notify` | BrowserScreen at the published URL |
| `bond_request` | Inbox tab (index 1) |
| `approval` | Inbox tab (index 1) |
| `pi_proposal` | Chats tab (index 0) |

**Cold-start handling:**
- `PushNotificationService().initialize()` runs in `main()` before `runApp()` so `getInitialMessage()` (Android) resolves before `initState` drains the buffer.
- If `activeNode` is null on cold-start (nodes load async), the tap is buffered in `_pendingColdStartTap` and replayed after `loadPairedNodes()` completes.
- The `onNotificationTap` subscription is stored and cancelled in `dispose()` (no listener leak).

### Remaining client gaps

All deep-link navigation is **shipped** (Phase 50). The client subscribes to `onNotificationTap`, routes payloads to screens, handles Android cold-start, buffers taps until nodes load, and has an in-app push toggle.

Remaining (cosmetic, not data-loss):
1. **Foreground push banner** — no `FirebaseMessaging.onMessage` listener for foreground alerts. Pushes arriving while the app is open are silently dropped (the WS event still reaches the app via the active WebSocket, so this is cosmetic).

---

## 6. Notification UX polish (future)

| Item | Current | Target |
|---|---|---|
| Notification channels (Android) | None — single default channel | Distinct channels for chat / call / feed / approval so the user can mute per-category |
| Interruption levels (iOS) | None — all alerts equal priority | `interruption-level: "active"` for direct messages; `"passive"` for feed updates |
| Badge count | Static `1` from server, never cleared | Server tracks unread count per thread; app clears badge on foreground |
| Contact avatar / rich media | None — no `mutable-content` | Add `mutable-content: 1` + a Notification Service Extension that fetches the sender's avatar |
| Per-thread / per-contact mute / DND | In-app toggle exists (Phase 50 — on/off); per-thread mute not yet | Add per-contact mute + global quiet-hours; check on the dispatch path |
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

All references use file paths + symbol names (not line numbers, which drift).

### Server (home node)

- Push dispatch core: `apps/node/src/push-notification.ts` — `PushNotificationService`, `sendAndCleanup`, `dispatchChatPush`, `dispatchBondPush`, `dispatchFeedPush`, `dispatchApprovalPush`, `dispatchCallPush`
- Unified chat + Pi listeners: `apps/node/src/node-service-impl.ts` constructor — `this.on("chat:message")`, `this.on("pi:proposal")`
- Pi `sendToPi` emits `chat:message`: `apps/node/src/node-service-impl.ts` — `sendToPi()`
- Approval-queue push: `apps/node/src/node-service-impl.ts` — `bindApprovalQueue()`
- Skip-if-online check: `apps/node/src/node-service-impl.ts` — `isOwnerOnline()`
- Bond hook: `apps/node/src/index.ts` — `hello:request` callback → `dispatchBondPush`
- Feed hook: `apps/node/src/index.ts` — `feed.notify` handler → `dispatchFeedPush`
- Call push gating (the model): `apps/node/src/call-inbound.ts` — `dispatchIncomingCallPushIfOffline`
- WS online tracking: `apps/node/src/ws-server.ts` — `hasClientForOwner`
- RPC routers: `apps/node/src/json-rpc-router.ts` — `registerPushToken`, `unregisterPushToken`

### Client (EnvoyGo)

- Alert service: `apps/envoygo/lib/services/push_notification_service.dart` — `PushNotificationService`, `handleNotificationTap`, `onNotificationTap`, `consumePendingInitialTap`
- VoIP service: `apps/envoygo/lib/services/voip_push_service.dart` — `VoipPushService`
- Push toggle: `apps/envoygo/lib/services/push_preferences.dart` — `PushPreferences`
- Deep-link router: `apps/envoygo/lib/main.dart` — `_routeNotificationTap`, `_subscribeToPushTaps`
- Navigator key: `apps/envoygo/lib/app.dart` — `EnvoyGoApp.navigatorKey`
- Token registration hook: `apps/envoygo/lib/providers/node_provider.dart` — `registerPushToken`
- Toggle UI: `apps/envoygo/lib/screens/me/me_screen.dart` — `_togglePushNotifications`
- iOS native bridge: `apps/envoygo/ios/Runner/AppDelegate.swift` — `envoygo/alert_push`, `envoygo/voip_push`

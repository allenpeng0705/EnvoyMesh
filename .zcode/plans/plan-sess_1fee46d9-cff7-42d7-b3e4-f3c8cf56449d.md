# Plan: Dynamic Multi-Bot Framework (one app update, then data-driven forever)

## Goal

Users create custom AI character bots (personality, style, system prompt) on the home node. EnvoyGo discovers and renders them automatically through config sync — **no app update needed to add/remove/edit bots after this one release**.

## Architecture

```
Home Node (server side):
  ├── node-config.json carries aiBots: [{ id, name, systemPrompt, avatarColor, ... }]
  ├── sendToAiBot(botId, text) RPC → routeModelRequest with bot.systemPrompt + text
  ├── History stored under thread key "bot:<id>"
  └── home:config-updated broadcasts bot list changes to all clients

EnvoyGo (one-time app update):
  ├── _syncAllData reads config.aiBots → creates ChatThreadType.aiBot threads
  ├── home:config-updated subscription → live add/remove bot threads
  ├── sendAgentMessage routes bot:* threads → sendToAiBot(botId, text) RPC
  ├── loadAgentHistory accepts bot:* thread keys
  └── Chat list renders AI bots with their character name + avatar color
```

## Implementation

### Phase 1: Server-side bot framework

**1.1 — `AiBotDefinition` type** (`packages/api/src/ai-bot.ts` — new file)
```typescript
export interface AiBotDefinition {
  id: string;              // unique slug, e.g. "librarian"
  name: string;            // display name, e.g. "Luna the Librarian"
  systemPrompt: string;    // personality instructions for the LLM
  avatarColor?: string;    // hex color for avatar, e.g. "#6366f1"
  description?: string;    // one-line bio shown under the name
  taskType?: string;       // routeModelRequest task type (default: "ai_bot.chat")
  model?: string;          // override model name (optional, inherits config by default)
}
```

**1.2 — Wire through config** (3 files, ~5 lines each)
- `apps/node/src/node-config-store.ts`: add `aiBots?: AiBotDefinition[]` to `PersistedNodeConfig`
- `apps/node/src/node-service-config.ts`: add `aiBots: config.aiBots` to `getNodeConfigViaRuntime` return (both initialized + uninitialized paths)
- `packages/api/src/ws-protocol.ts`: add `aiBots?: AiBotDefinition[]` to `NodeConfig`

**1.3 — `sendToAiBot` RPC** (`apps/node/src/node-service-impl.ts`)
- New method: persists outbound under `bot:<id>`, calls `routeModelRequest` with `systemPrompt + text`, persists+emits reply
- Uses the existing `_persistChatMessage` + `chatLogStore.append("bot:<id>", ...)` + `this.emit("chat:message", ...)`
- Also emits `push:message` for push notification (Phase 50 pattern)

**1.4 — RPC dispatch** (`apps/node/src/json-rpc-router.ts`)
```typescript
case "sendToAiBot":
  return ns.sendToAiBot(String(params.botId ?? ""), String(params.text ?? ""));
```

### Phase 2: EnvoyGo client (one-time update)

**2.1 — `ChatThreadType.aiBot`** (`apps/envoygo/lib/models/chat_thread.dart`)
- Add new enum value
- Add `botId` field to `ChatThread` (optional, for routing)

**2.2 — `sendToAiBot` RPC wrapper** (`apps/envoygo/lib/services/node_service_client.dart`)
```dart
Future<void> sendToAiBot(String botId, String text) async {
  await _client.call('sendToAiBot', {'botId': botId, 'text': text});
}
```

**2.3 — Bot discovery + thread creation** (`apps/envoygo/lib/providers/node_provider.dart`)
- In `_syncAllData()` after AI threads: call `getNodeConfig()`, iterate `config.aiBots`, call `chatNotifier.onAiBotDefined(bot)` for each
- Subscribe to `home:config-updated` in `_subscribeToPushEvents()` → diff bot list, add/remove threads live

**2.4 — `onAiBotDefined`** (`apps/envoygo/lib/providers/chat_provider.dart`)
- New method that upserts a `ChatThreadType.aiBot` thread with `threadId = "nodeId:bot:<id>"`, `displayName = bot.name`, `botId = bot.id`

**2.5 — Routing** (`apps/envoygo/lib/providers/chat_provider.dart`)
- In `sendAgentMessage`: if `agentType.startsWith("bot:")` → extract botId → call `nodeService.sendToAiBot(botId, text)` instead of `sendToOpenClaw`/`sendToBridge`

**2.6 — History loading** (`apps/envoygo/lib/providers/chat_provider.dart`)
- In `loadAgentHistory`: accept `bot:*` thread keys in addition to `envoyai`/`external`

**2.7 — Chat list rendering** (`apps/envoygo/lib/screens/chat/chat_list_screen.dart`)
- AI section grouping: include `ChatThreadType.aiBot` threads
- Avatar: use `bot.avatarColor` if available, fallback to a default

### Phase 3: Social UI bot management (optional, can ship later)

- Settings → AI → "Bots" section: create/edit/delete bots with name, personality, system prompt
- Calls `updateNodeConfig({ aiBots: [...] })` → broadcasts to all clients
- This can be deferred — users can create bots by editing `node-config.json` manually

## What's data-driven after this update

After shipping Phase 1 + Phase 2:
- Add a bot → edit `node-config.json` or call `updateNodeConfig` → `home:config-updated` broadcasts → EnvoyGo creates the thread automatically
- Remove a bot → same path → thread disappears from chat list
- Edit a bot's personality → same path → next message uses the new system prompt
- **No app update ever needed for bot changes**

## Files touched

| File | Change |
|---|---|
| `packages/api/src/ai-bot.ts` | **New** — `AiBotDefinition` type |
| `packages/api/src/ws-protocol.ts` | Add `aiBots` to `NodeConfig` |
| `apps/node/src/node-config-store.ts` | Add `aiBots` to `PersistedNodeConfig` |
| `apps/node/src/node-service-config.ts` | Add `aiBots` to config return |
| `apps/node/src/node-service-impl.ts` | Add `sendToAiBot` method |
| `apps/node/src/json-rpc-router.ts` | Add `sendToAiBot` dispatch |
| `apps/envoygo/lib/models/chat_thread.dart` | Add `aiBot` type + `botId` field |
| `apps/envoygo/lib/services/node_service_client.dart` | Add `sendToAiBot` RPC wrapper |
| `apps/envoygo/lib/providers/node_provider.dart` | Bot discovery + live config sync |
| `apps/envoygo/lib/providers/chat_provider.dart` | `onAiBotDefined` + routing + history |
| `apps/envoygo/lib/screens/chat/chat_list_screen.dart` | AI section includes bot threads |